from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.trace_service import get_traces, get_trace_by_id

router = APIRouter(prefix="/api/traces", tags=["traces"])


def _format_trace(t) -> Dict[str, Any]:
    return {
        "id": t.id,
        "source": t.source,
        "run_id": t.run_id,
        "runtime_id": t.runtime_id,
        "model": t.model,
        "started_at": t.started_at.isoformat() if t.started_at else None,
        "prompt_text": t.prompt_text,
        "output_text": t.output_text,
        "prompt_tokens": t.prompt_tokens,
        "completion_tokens": t.completion_tokens,
        "finish_reason": t.finish_reason,
        "ttft_ms": t.ttft_ms,
        "tpot_ms": t.tpot_ms,
        "total_latency_ms": t.total_latency_ms,
        "error": t.error,
        "params": t.params,
        "engine_kv_pct_start": t.engine_kv_pct_start,
        "engine_kv_pct_end": t.engine_kv_pct_end,
    }


@router.get("")
async def list_traces(
    run_id: Optional[str] = Query(None, description="Filter traces by benchmark or load test run ID"),
    source: Optional[str] = Query(None, description="Filter by source (benchmark, load_test, proxy)"),
    runtime_id: Optional[str] = Query(None, description="Filter by runtime engine ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """
    List historical request traces with filtering and pagination.
    """
    traces, total = await get_traces(
        db,
        run_id=run_id,
        source=source,
        runtime_id=runtime_id,
        limit=limit,
        offset=offset,
    )

    return {
        "traces": [_format_trace(t) for t in traces],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{trace_id}")
async def get_trace(
    trace_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed breakdown of an individual request trace.
    """
    trace = await get_trace_by_id(db, trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Request trace not found")

    return _format_trace(trace)
