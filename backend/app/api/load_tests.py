"""Load test API routes."""
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db, AsyncSessionLocal
from app.models.runtime import Runtime
from app.models.load_test import LoadTestRun, LoadTestResult
from app.schemas.load_test import LoadTestCreate, LoadTestRunOut
from app.loadtest.engine import run_load_test, stop_run
from app.api.websocket_manager import manager

router = APIRouter(prefix="/api/load-tests", tags=["load-tests"])


async def _execute_load_test(run_id: str, runtime_type: str, endpoint: str, api_key, run_data: dict):
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(LoadTestRun).where(LoadTestRun.id == run_id))
            run = result.scalar_one()
            run.status = "running"
            await db.commit()

            aggregates = await run_load_test(
                run_id=run_id,
                runtime_type=runtime_type,
                endpoint=endpoint,
                api_key=api_key,
                model=run_data["model"],
                pattern=run_data["pattern"],
                target_users=run_data["target_users"],
                duration_seconds=run_data["duration_seconds"],
                rampup_step_users=run_data["rampup_step_users"],
                rampup_step_seconds=run_data["rampup_step_seconds"],
                system_prompt=run_data.get("system_prompt"),
                prompt_mix=run_data.get("prompt_mix"),
                temperature=run_data["temperature"],
                max_tokens=run_data["max_tokens"],
                request_timeout=run_data["request_timeout"],
                db=db,
                broadcast_fn=manager.broadcast,
            )

            result = await db.execute(select(LoadTestRun).where(LoadTestRun.id == run_id))
            run = result.scalar_one()
            current_status = run.status
            if current_status != "stopped":
                run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            for k, v in aggregates.items():
                if hasattr(run, k):
                    setattr(run, k, v)
            await db.commit()

            await manager.broadcast({"type": "load_test_completed", "run_id": run_id, "aggregates": aggregates})

        except Exception as e:
            async with AsyncSessionLocal() as db2:
                result = await db2.execute(select(LoadTestRun).where(LoadTestRun.id == run_id))
                run = result.scalar_one_or_none()
                if run:
                    run.status = "failed"
                    run.error = str(e)
                    run.completed_at = datetime.now(timezone.utc)
                    await db2.commit()
            await manager.broadcast({"type": "load_test_failed", "run_id": run_id, "error": str(e)})


@router.get("", response_model=list[LoadTestRunOut])
async def list_load_tests(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LoadTestRun).order_by(LoadTestRun.created_at.desc()).limit(limit)
    )
    return result.scalars().all()


@router.post("", response_model=LoadTestRunOut)
async def create_load_test(
    data: LoadTestCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    rt_result = await db.execute(select(Runtime).where(Runtime.id == data.runtime_id))
    runtime = rt_result.scalar_one_or_none()
    if not runtime:
        raise HTTPException(status_code=404, detail="Runtime not found")

    run = LoadTestRun(
        runtime_id=data.runtime_id,
        model=data.model,
        pattern=data.pattern,
        target_users=data.target_users,
        duration_seconds=data.duration_seconds,
        rampup_step_users=data.rampup_step_users,
        rampup_step_seconds=data.rampup_step_seconds,
        system_prompt=data.system_prompt,
        prompt_mix=data.prompt_mix,
        temperature=data.temperature,
        max_tokens=data.max_tokens,
        request_timeout=data.request_timeout,
        status="pending",
    )
    db.add(run)
    await db.flush()
    await db.refresh(run)
    run_id = run.id

    background_tasks.add_task(
        _execute_load_test,
        run_id=run_id,
        runtime_type=runtime.runtime_type,
        endpoint=runtime.endpoint,
        api_key=runtime.api_key,
        run_data=data.model_dump(),
    )
    return run


@router.get("/{run_id}", response_model=LoadTestRunOut)
async def get_load_test(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LoadTestRun).where(LoadTestRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Load test run not found")
    return run


@router.post("/{run_id}/stop")
async def stop_load_test(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LoadTestRun).where(LoadTestRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Load test run not found")
    stop_run(run_id)
    run.status = "stopped"
    return {"stopped": True}


@router.get("/{run_id}/results", response_model=list)
async def get_load_test_results(run_id: str, limit: int = 1000, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LoadTestResult)
        .where(LoadTestResult.run_id == run_id)
        .order_by(LoadTestResult.timestamp)
        .limit(limit)
    )
    return result.scalars().all()
