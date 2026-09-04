"""Benchmark API routes."""
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db, AsyncSessionLocal
from app.models.runtime import Runtime
from app.models.benchmark import BenchmarkRun, BenchmarkResult
from app.schemas.benchmark import BenchmarkCreate, BenchmarkRunOut
from app.benchmark.engine import run_benchmark
from app.api.websocket_manager import manager

router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"])


async def _execute_benchmark(run_id: str, runtime_type: str, endpoint: str, api_key, run_data: dict):
    """Background task that runs the benchmark and updates DB."""
    async with AsyncSessionLocal() as db:
        try:
            # Update status to running
            result = await db.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
            run = result.scalar_one()
            run.status = "running"
            await db.commit()

            # Run benchmark
            aggregates = await run_benchmark(
                run_id=run_id,
                runtime_type=runtime_type,
                endpoint=endpoint,
                api_key=api_key,
                model=run_data["model"],
                scenario=run_data["scenario"],
                prompt=run_data.get("prompt"),
                system_prompt=run_data.get("system_prompt"),
                temperature=run_data["temperature"],
                max_tokens=run_data["max_tokens"],
                num_runs=run_data["num_runs"],
                use_streaming=run_data["use_streaming"],
                db=db,
                broadcast_fn=manager.broadcast,
            )

            # Update run with aggregates
            result = await db.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
            run = result.scalar_one()
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            for k, v in aggregates.items():
                if hasattr(run, k):
                    setattr(run, k, v)
            await db.commit()

            await manager.broadcast({
                "type": "benchmark_completed",
                "run_id": run_id,
                "aggregates": aggregates,
            })

        except Exception as e:
            async with AsyncSessionLocal() as db2:
                result = await db2.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
                run = result.scalar_one_or_none()
                if run:
                    run.status = "failed"
                    run.error = str(e)
                    run.completed_at = datetime.now(timezone.utc)
                    await db2.commit()
            await manager.broadcast({"type": "benchmark_failed", "run_id": run_id, "error": str(e)})


@router.get("", response_model=list[BenchmarkRunOut])
async def list_benchmarks(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BenchmarkRun).order_by(BenchmarkRun.created_at.desc()).limit(limit)
    )
    return result.scalars().all()


@router.post("", response_model=BenchmarkRunOut)
async def create_benchmark(
    data: BenchmarkCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    # Verify runtime exists
    rt_result = await db.execute(select(Runtime).where(Runtime.id == data.runtime_id))
    runtime = rt_result.scalar_one_or_none()
    if not runtime:
        raise HTTPException(status_code=404, detail="Runtime not found")

    run = BenchmarkRun(
        runtime_id=data.runtime_id,
        model=data.model,
        scenario=data.scenario,
        prompt=data.prompt,
        system_prompt=data.system_prompt,
        temperature=data.temperature,
        max_tokens=data.max_tokens,
        num_runs=data.num_runs,
        use_streaming=data.use_streaming,
        status="pending",
    )
    db.add(run)
    await db.flush()
    await db.refresh(run)
    run_id = run.id

    background_tasks.add_task(
        _execute_benchmark,
        run_id=run_id,
        runtime_type=runtime.runtime_type,
        endpoint=runtime.endpoint,
        api_key=runtime.api_key,
        run_data=data.model_dump(),
    )
    return run


@router.get("/{run_id}", response_model=BenchmarkRunOut)
async def get_benchmark(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Benchmark run not found")
    # Load results
    r_result = await db.execute(
        select(BenchmarkResult).where(BenchmarkResult.run_id == run_id).order_by(BenchmarkResult.run_index)
    )
    run.results = r_result.scalars().all()
    return run


@router.post("/{run_id}/stop")
async def stop_benchmark(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Benchmark run not found")
    run.status = "stopped"
    return {"stopped": True}
