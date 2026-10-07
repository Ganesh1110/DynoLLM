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
from app.schemas.load_test import LoadTestPlanCreate, LoadTestPlanOut
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
