"""Test Plan CRUD + execution routes."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db, AsyncSessionLocal
from app.models.load_test import LoadTestPlan
from app.models.runtime import Runtime
import time
from app.adapters import get_adapter
from app.adapters.base import GenerateRequest
from app.loadtest.config_elements import apply_config_elements
from app.schemas.load_test import (
    LoadTestPlanCreate,
    LoadTestPlanOut,
    ProbeReportSchema,
    ProbeResultItemSchema,
    AssertionResultSchema,
)
from app.api.websocket_manager import manager

router = APIRouter(prefix="/api/load-test-plans", tags=["load-test-plans"])


# ─── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[LoadTestPlanOut])
async def list_plans(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """List all saved test plans, newest first."""
    result = await db.execute(
        select(LoadTestPlan).order_by(LoadTestPlan.created_at.desc()).limit(limit)
    )
    return result.scalars().all()


@router.post("", response_model=LoadTestPlanOut)
async def create_plan(data: LoadTestPlanCreate, db: AsyncSession = Depends(get_db)):
    """Persist a new test plan."""
    plan = LoadTestPlan(
        name=data.name,
        description=data.description,
        config=data.model_dump(),
    )
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    await db.commit()
    return plan


@router.get("/{plan_id}", response_model=LoadTestPlanOut)
async def get_plan(plan_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch a single test plan by ID."""
    result = await db.execute(select(LoadTestPlan).where(LoadTestPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.put("/{plan_id}", response_model=LoadTestPlanOut)
async def update_plan(
    plan_id: str, data: LoadTestPlanCreate, db: AsyncSession = Depends(get_db)
):
    """Replace a test plan's config in-place."""
    result = await db.execute(select(LoadTestPlan).where(LoadTestPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    plan.name = data.name
    plan.description = data.description
    plan.config = data.model_dump()
    plan.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/{plan_id}")
async def delete_plan(plan_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a test plan by ID."""
    result = await db.execute(select(LoadTestPlan).where(LoadTestPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    await db.delete(plan)
    await db.commit()
    return {"deleted": True, "id": plan_id}


# ─── Plan Execution ────────────────────────────────────────────────────────────

async def _resolve_thread_groups(thread_groups: list[dict], db: AsyncSession) -> list[dict]:
    """Fetch runtime endpoint/type/api_key for each thread group from the DB."""
    resolved = []
    for tg in thread_groups:
        rt_result = await db.execute(select(Runtime).where(Runtime.id == tg["runtime_id"]))
        runtime = rt_result.scalar_one_or_none()
        if not runtime:
            raise HTTPException(
                status_code=404, detail=f"Runtime {tg['runtime_id']} not found"
            )
        resolved.append({
            **tg,
            "runtime_type": runtime.runtime_type,
            "endpoint": runtime.endpoint,
            "api_key": runtime.api_key,
        })
    return resolved


async def _execute_plan(plan_id: str, plan_config: dict):
    """Background task: resolve runtimes, run the plan, broadcast results via WebSocket."""
    from app.loadtest.orchestrator import run_plan

    # Resolve runtime details for each thread group before running
    async with AsyncSessionLocal() as db:
        try:
            thread_groups = await _resolve_thread_groups(
                plan_config.get("thread_groups", []), db
            )
        except Exception as e:
            await manager.broadcast({"type": "plan_error", "plan_id": plan_id, "error": str(e)})
            return

    resolved_config = {**plan_config, "thread_groups": thread_groups}

    await manager.broadcast({
        "type": "plan_started",
        "plan_id": plan_id,
        "thread_group_count": len(thread_groups),
    })

    try:
        plan_result = await run_plan(
            plan_id=plan_id,
            plan_config=resolved_config,
            broadcast_fn=manager.broadcast,
        )
        await manager.broadcast({
            "type": "plan_completed",
            "plan_id": plan_id,
            "overall_passed": plan_result.overall_passed,
            "run_ids": plan_result.run_ids,
            "listener_reports": plan_result.listener_reports,
            "assertion_results": [
                {"name": ar.name, "passed": ar.passed, "message": ar.message}
                for ar in plan_result.assertion_results
            ],
        })
    except Exception as e:
        await manager.broadcast({"type": "plan_error", "plan_id": plan_id, "error": str(e)})


@router.post("/{plan_id}/run")
async def run_plan_route(
    plan_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Trigger execution of a saved test plan as a background task."""
    result = await db.execute(select(LoadTestPlan).where(LoadTestPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    background_tasks.add_task(_execute_plan, plan_id=plan.id, plan_config=plan.config)
    return {"started": True, "plan_id": plan_id}


@router.post("/run-inline")
async def run_inline_plan(
    data: LoadTestPlanCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Run a plan without saving it first — useful for quick ad-hoc test runs."""
    plan_id = f"inline-{uuid.uuid4()}"
    plan_config = data.model_dump()
    background_tasks.add_task(_execute_plan, plan_id=plan_id, plan_config=plan_config)
    return {"started": True, "plan_id": plan_id}


@router.post("/probe", response_model=ProbeReportSchema)
async def probe_plan(data: LoadTestPlanCreate, db: AsyncSession = Depends(get_db)):
    """
    Validation Probe (Dry Run):
    Sends 1 sample request to each enabled Thread Group in the plan.
    Tests runtime connectivity, model routing, variable interpolation, TTFT,
    and checks if SLA assertions hold for the single sample.
    """
    probe_items: list[ProbeResultItemSchema] = []
    config_elements = [ce.model_dump() for ce in data.config_elements]
    enabled_groups = [tg for tg in data.thread_groups if tg.enabled is not False]
    overall_passed = True

    for tg in enabled_groups:
        rt_result = await db.execute(select(Runtime).where(Runtime.id == tg.runtime_id))
        runtime = rt_result.scalar_one_or_none()
        if not runtime:
            probe_items.append(ProbeResultItemSchema(
                thread_group_id=tg.id or "unknown",
                thread_group_name=tg.name,
                runtime_id=tg.runtime_id,
                model=tg.model,
                success=False,
                status_code=404,
                error_message=f"Runtime ID '{tg.runtime_id}' not found in database",
            ))
            overall_passed = False
            continue

        tg_dict, prompt_pool = apply_config_elements(tg.model_dump(), config_elements)
        sample_prompt = (
            prompt_pool.next() if prompt_pool
            else "Explain the role of an LLM tokenizer in one brief sentence."
        )

        try:
            adapter = get_adapter(runtime.runtime_type, runtime.endpoint, runtime.api_key)
            req = GenerateRequest(
                model=tg_dict.get("model", tg.model),
                prompt=sample_prompt,
                system_prompt=tg_dict.get("system_prompt"),
                temperature=float(tg_dict.get("temperature", 0.7)),
                max_tokens=int(tg_dict.get("max_tokens", 128)),
                top_p=float(tg_dict.get("top_p") or 1.0),
                seed=tg_dict.get("seed"),
                stream=bool(tg_dict.get("streaming", True)),
            )

            t0 = time.perf_counter()
            ttft_ms = None
            generated_text = []
            prompt_tokens = 0
            completion_tokens = 0

            if req.stream:
                async for chunk in adapter.generate_stream(req):
                    if ttft_ms is None and chunk.delta:
                        ttft_ms = (time.perf_counter() - t0) * 1000.0
                    if chunk.delta:
                        generated_text.append(chunk.delta)
                    if chunk.prompt_tokens is not None:
                        prompt_tokens = chunk.prompt_tokens
                    if chunk.completion_tokens is not None:
                        completion_tokens = chunk.completion_tokens
            else:
                resp = await adapter.generate(req)
                generated_text.append(resp.content)
                prompt_tokens = resp.prompt_tokens or 0
                completion_tokens = resp.completion_tokens or 0

            total_duration_ms = (time.perf_counter() - t0) * 1000.0
            if ttft_ms is None:
                ttft_ms = total_duration_ms

            full_text = "".join(generated_text).strip()
            if not completion_tokens:
                completion_tokens = max(1, len(full_text.split()))
            tps = (completion_tokens / (total_duration_ms / 1000.0)) if total_duration_ms > 0 else 0.0

            # Evaluate assertions for this probe
            as_results = []
            for a in data.assertions:
                if a.enabled is False:
                    continue
                if a.type in ("latency", "p95_latency") and a.p95_max_ms:
                    passed = total_duration_ms <= a.p95_max_ms
                    as_results.append(AssertionResultSchema(
                        name=a.name or "Latency SLA",
                        assertion_type="latency",
                        passed=passed,
                        actual_value=round(total_duration_ms, 1),
                        threshold=a.p95_max_ms,
                        message=f"{total_duration_ms:.0f}ms <= {a.p95_max_ms:.0f}ms ✓" if passed else f"{total_duration_ms:.0f}ms > {a.p95_max_ms:.0f}ms ✗",
                    ))
                elif a.type == "ttft" and a.max_ms:
                    passed = ttft_ms <= a.max_ms
                    as_results.append(AssertionResultSchema(
                        name=a.name or "TTFT SLA",
                        assertion_type="ttft",
                        passed=passed,
                        actual_value=round(ttft_ms, 1),
                        threshold=a.max_ms,
                        message=f"TTFT {ttft_ms:.0f}ms <= {a.max_ms:.0f}ms ✓" if passed else f"TTFT {ttft_ms:.0f}ms > {a.max_ms:.0f}ms ✗",
                    ))
                elif a.type == "tokens_per_second" and a.min_tps:
                    passed = tps >= a.min_tps
                    as_results.append(AssertionResultSchema(
                        name=a.name or "Token Throughput",
                        assertion_type="tokens_per_second",
                        passed=passed,
                        actual_value=round(tps, 1),
                        threshold=a.min_tps,
                        message=f"{tps:.1f} TPS >= {a.min_tps:.1f} TPS ✓" if passed else f"{tps:.1f} TPS < {a.min_tps:.1f} TPS ✗",
                    ))

            group_passed = all(ar.passed for ar in as_results) if as_results else True
            if not group_passed:
                overall_passed = False

            probe_items.append(ProbeResultItemSchema(
                thread_group_id=tg.id or "tg",
                thread_group_name=tg.name,
                runtime_id=tg.runtime_id,
                runtime_name=runtime.name,
                model=tg_dict.get("model", tg.model),
                success=True,
                status_code=200,
                ttft_ms=round(ttft_ms, 1),
                total_latency_ms=round(total_duration_ms, 1),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                tokens_per_second=round(tps, 1),
                prompt_sample=sample_prompt,
                response_preview=full_text[:300] + ("..." if len(full_text) > 300 else ""),
                assertion_results=as_results,
            ))
        except Exception as exc:
            overall_passed = False
            probe_items.append(ProbeResultItemSchema(
                thread_group_id=tg.id or "tg",
                thread_group_name=tg.name,
                runtime_id=tg.runtime_id,
                runtime_name=runtime.name,
                model=tg.model,
                success=False,
                status_code=500,
                error_message=str(exc),
                prompt_sample=sample_prompt,
            ))

    return ProbeReportSchema(
        success=len(probe_items) > 0 and all(p.success for p in probe_items),
        overall_passed=overall_passed,
        executed_at=datetime.now(timezone.utc).isoformat(),
        probe_results=probe_items,
    )

