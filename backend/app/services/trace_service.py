"""
Request Tracing Service.

Captures, persists, retrieves, and enforces retention for individual LLM requests.
Supports benchmark prompts, load test concurrency requests, and live proxy flows.
Enforces text truncation (4k chars), privacy toggle (STORE_PROMPT_CONTENT), and ring buffer retention.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.request_trace import RequestTrace
from app.monitoring.engine_poller import get_engine_stats_for

logger = logging.getLogger(__name__)


def _sanitize_text(text: Optional[str]) -> Optional[str]:
    """Sanitize and truncate text according to privacy settings."""
    if not settings.STORE_PROMPT_CONTENT:
        return None
    if text is None:
        return None
    if len(text) > settings.MAX_PROMPT_CHARS:
        return text[:settings.MAX_PROMPT_CHARS] + " ... [truncated]"
    return text


def _get_current_engine_kv_pct(runtime_id: Optional[str]) -> Optional[float]:
    """Sample current engine KV cache percentage from engine poller cache."""
    if not runtime_id:
        return None
    stats = get_engine_stats_for(runtime_id)
    if stats and stats.get("kv_cache_usage_pct") is not None:
        return float(stats["kv_cache_usage_pct"])
    return None


async def enforce_retention_limit(db: AsyncSession) -> None:
    """Enforce MAX_STORED_TRACES by removing oldest rows past the threshold."""
    try:
        count_query = select(func.count(RequestTrace.id))
        total = (await db.execute(count_query)).scalar() or 0

        excess = total - settings.MAX_STORED_TRACES
        if excess > 0:
            # Subquery to select IDs of oldest records
            oldest_ids_subquery = (
                select(RequestTrace.id)
                .order_by(RequestTrace.started_at.asc())
                .limit(excess)
            )
            oldest_ids = (await db.execute(oldest_ids_subquery)).scalars().all()
            if oldest_ids:
                del_stmt = delete(RequestTrace).where(RequestTrace.id.in_(oldest_ids))
                await db.execute(del_stmt)
                await db.commit()
    except Exception as exc:
        logger.warning(f"Error enforcing request trace retention limit: {exc}")


async def record_trace(
    db: AsyncSession,
    data: Dict[str, Any],
) -> RequestTrace:
    """
    Persist an individual request trace.
    """
    runtime_id = data.get("runtime_id")
    kv_start = data.get("engine_kv_pct_start")
    if kv_start is None:
        kv_start = _get_current_engine_kv_pct(runtime_id)

    kv_end = data.get("engine_kv_pct_end")
    if kv_end is None:
        kv_end = _get_current_engine_kv_pct(runtime_id)

    trace = RequestTrace(
        id=data.get("id") or str(uuid.uuid4()),
        source=data.get("source", "benchmark"),
        run_id=data.get("run_id"),
        runtime_id=runtime_id,
        model=data.get("model", "unknown"),
        started_at=data.get("started_at") or datetime.now(timezone.utc),
        prompt_text=_sanitize_text(data.get("prompt_text")),
        output_text=_sanitize_text(data.get("output_text")),
        prompt_tokens=data.get("prompt_tokens", 0) or 0,
        completion_tokens=data.get("completion_tokens", 0) or 0,
        finish_reason=data.get("finish_reason"),
        ttft_ms=data.get("ttft_ms"),
        tpot_ms=data.get("tpot_ms"),
        total_latency_ms=data.get("total_latency_ms"),
        error=data.get("error"),
        params=data.get("params"),
        engine_kv_pct_start=kv_start,
        engine_kv_pct_end=kv_end,
    )

    db.add(trace)
    await db.commit()
    await db.refresh(trace)

    # Periodic/lazy cleanup check
    await enforce_retention_limit(db)

    return trace


async def record_traces_bulk(
    db: AsyncSession,
    traces_data: List[Dict[str, Any]],
) -> int:
    """
    Bulk persist a list of request traces (e.g. at completion of a load test tier).
    """
    if not traces_data:
        return 0

    trace_objs = []
    for data in traces_data:
        runtime_id = data.get("runtime_id")
        kv_start = data.get("engine_kv_pct_start")
        if kv_start is None:
            kv_start = _get_current_engine_kv_pct(runtime_id)
        kv_end = data.get("engine_kv_pct_end")
        if kv_end is None:
            kv_end = _get_current_engine_kv_pct(runtime_id)

        trace = RequestTrace(
            id=data.get("id") or str(uuid.uuid4()),
            source=data.get("source", "load_test"),
            run_id=data.get("run_id"),
            runtime_id=runtime_id,
            model=data.get("model", "unknown"),
            started_at=data.get("started_at") or datetime.now(timezone.utc),
            prompt_text=_sanitize_text(data.get("prompt_text")),
            output_text=_sanitize_text(data.get("output_text")),
            prompt_tokens=data.get("prompt_tokens", 0) or 0,
            completion_tokens=data.get("completion_tokens", 0) or 0,
            finish_reason=data.get("finish_reason"),
            ttft_ms=data.get("ttft_ms"),
            tpot_ms=data.get("tpot_ms"),
            total_latency_ms=data.get("total_latency_ms"),
            error=data.get("error"),
            params=data.get("params"),
            engine_kv_pct_start=kv_start,
            engine_kv_pct_end=kv_end,
        )
        trace_objs.append(trace)

    db.add_all(trace_objs)
    await db.commit()

    await enforce_retention_limit(db)

    return len(trace_objs)


async def get_traces(
    db: AsyncSession,
    run_id: Optional[str] = None,
    source: Optional[str] = None,
    runtime_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Tuple[List[RequestTrace], int]:
    """
    Query paginated traces matching optional filters.
    """
    query = select(RequestTrace)
    count_query = select(func.count(RequestTrace.id))

    if run_id:
        query = query.where(RequestTrace.run_id == run_id)
        count_query = count_query.where(RequestTrace.run_id == run_id)
    if source:
        query = query.where(RequestTrace.source == source)
        count_query = count_query.where(RequestTrace.source == source)
    if runtime_id:
        query = query.where(RequestTrace.runtime_id == runtime_id)
        count_query = count_query.where(RequestTrace.runtime_id == runtime_id)

    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(RequestTrace.started_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    traces = result.scalars().all()

    return list(traces), total


async def get_trace_by_id(
    db: AsyncSession,
    trace_id: str,
) -> Optional[RequestTrace]:
    """Retrieve a single trace by ID."""
    stmt = select(RequestTrace).where(RequestTrace.id == trace_id)
    res = await db.execute(stmt)
    return res.scalar_one_or_none()
