"""Export API routes — CSV and JSON export for benchmark and load test runs."""
import csv
import json
import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.benchmark import BenchmarkRun, BenchmarkResult
from app.models.load_test import LoadTestRun, LoadTestResult

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/benchmarks/{run_id}/csv")
async def export_benchmark_csv(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BenchmarkResult).where(BenchmarkResult.run_id == run_id).order_by(BenchmarkResult.run_index)
    )
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No results found")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "run_index", "ttft_ms", "total_latency_ms", "prompt_tokens",
        "completion_tokens", "generation_tokens_per_second", "e2e_tokens_per_second",
        "error", "created_at"
    ])
    for r in rows:
        writer.writerow([
            r.run_index, r.ttft_ms, r.total_latency_ms, r.prompt_tokens,
            r.completion_tokens, r.generation_tokens_per_second, r.e2e_tokens_per_second,
            r.error, r.created_at
        ])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=benchmark_{run_id}.csv"},
    )


@router.get("/load-tests/{run_id}/csv")
async def export_load_test_csv(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LoadTestResult).where(LoadTestResult.run_id == run_id).order_by(LoadTestResult.timestamp).limit(10000)
    )
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No results found")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "timestamp", "concurrent_users", "ttft_ms", "total_latency_ms",
        "completion_tokens", "generation_tokens_per_second", "success", "error", "timed_out"
    ])
    for r in rows:
        writer.writerow([
            r.timestamp, r.concurrent_users, r.ttft_ms, r.total_latency_ms,
            r.completion_tokens, r.generation_tokens_per_second, r.success, r.error, r.timed_out
        ])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=load_test_{run_id}.csv"},
    )


@router.get("/benchmarks/{run_id}/json")
async def export_benchmark_json(run_id: str, db: AsyncSession = Depends(get_db)):
    run_result = await db.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    r_result = await db.execute(
        select(BenchmarkResult).where(BenchmarkResult.run_id == run_id).order_by(BenchmarkResult.run_index)
    )
    results = r_result.scalars().all()

    data = {
        "run": {
            "id": run.id,
            "model": run.model,
            "scenario": run.scenario,
            "status": run.status,
            "avg_ttft_ms": run.avg_ttft_ms,
            "avg_total_latency_ms": run.avg_total_latency_ms,
            "avg_generation_tokens_per_second": run.avg_generation_tokens_per_second,
            "p50_latency_ms": run.p50_latency_ms,
            "p95_latency_ms": run.p95_latency_ms,
            "p99_latency_ms": run.p99_latency_ms,
            "created_at": str(run.created_at),
            "completed_at": str(run.completed_at),
        },
        "results": [
            {
                "run_index": r.run_index,
                "ttft_ms": r.ttft_ms,
                "total_latency_ms": r.total_latency_ms,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "generation_tokens_per_second": r.generation_tokens_per_second,
                "error": r.error,
            }
            for r in results
        ],
    }
    return JSONResponse(content=data, headers={"Content-Disposition": f"attachment; filename=benchmark_{run_id}.json"})
