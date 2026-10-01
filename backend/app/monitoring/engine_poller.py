"""
Engine stats poller – background task that queries all active runtimes for
KV-cache occupancy, loaded models, CPU offload ratio, etc.

Results are kept in an in-process cache (_engine_cache) and refreshed every
POLL_INTERVAL_SECONDS seconds. The monitoring API endpoint reads from this
cache, so it is always fast (no blocking I/O per dashboard request).
"""
import asyncio
import logging
import time
from typing import Any, Optional
from app.monitoring.engine_history import record_sample, prune_runtime

logger = logging.getLogger(__name__)

# Seconds between polls for each runtime
POLL_INTERVAL_SECONDS = 5

# In-process result cache: {runtime_id: dict}
_engine_cache: dict[str, dict] = {}
# Timestamp of the last successful poll per runtime
_last_polled: dict[str, float] = {}

_poller_task: Optional[asyncio.Task] = None


def get_all_engine_stats() -> list[dict]:
    """Return the latest cached engine stats for all runtimes."""
    return list(_engine_cache.values())


def get_engine_stats_for(runtime_id: str) -> Optional[dict]:
    """Return cached stats for a single runtime, or None if not yet polled."""
    return _engine_cache.get(runtime_id)


async def _poll_once(runtime_id: str, runtime_type: str, endpoint: str) -> None:
    """Poll a single runtime and update the cache."""
    from app.adapters import get_adapter  # local import to avoid circular deps

    adapter = get_adapter(runtime_type, endpoint)
    try:
        stats = await adapter.get_engine_stats()
        entry = {
            "runtime_id": runtime_id,
            "runtime_type": runtime_type,
            "endpoint": endpoint,
            "polled_at": time.time(),
            **stats,
        }
        _engine_cache[runtime_id] = entry
        _last_polled[runtime_id] = entry["polled_at"]
        record_sample(runtime_id, entry)
    except AttributeError:
        # Adapter doesn't implement get_engine_stats (shouldn't happen now)
        pass
    except Exception as exc:
        # Don't crash the poller; record the error in the cache entry
        existing = _engine_cache.get(runtime_id, {})
        _engine_cache[runtime_id] = {
            **existing,
            "runtime_id": runtime_id,
            "runtime_type": runtime_type,
            "endpoint": endpoint,
            "polled_at": time.time(),
            "error": str(exc),
        }


async def _poller_loop() -> None:
    """
    Continuously query all active runtimes.

    We pull active runtimes from the database on every iteration so that
    newly-added runtimes are picked up without a restart.
    """
    while True:
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.runtime import Runtime
            from sqlalchemy import select

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Runtime).where(Runtime.is_active == True)  # noqa: E712
                )
                runtimes = result.scalars().all()

            # Evict runtimes that are no longer active or have been deleted
            active_ids = {str(r.id) for r in runtimes}
            for cached_id in list(_engine_cache.keys()):
                if cached_id not in active_ids:
                    _engine_cache.pop(cached_id, None)
                    _last_polled.pop(cached_id, None)
                    prune_runtime(cached_id)

            # Fan-out: poll all runtimes concurrently with a 4-second timeout each
            tasks = [
                asyncio.wait_for(
                    _poll_once(str(r.id), r.runtime_type, r.endpoint),
                    timeout=4.0,
                )
                for r in runtimes
            ]
            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for r, exc in zip(runtimes, results):
                    if isinstance(exc, asyncio.TimeoutError):
                        logger.debug("Engine stats poll timed out for %s (%s)", r.name, r.id)

        except Exception as exc:
            logger.warning("Engine poller loop error: %s", exc)

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


def start_poller() -> None:
    """Spawn the background poller coroutine (idempotent)."""
    global _poller_task
    if _poller_task is not None and not _poller_task.done():
        return  # already running
    try:
        loop = asyncio.get_event_loop()
        _poller_task = loop.create_task(_poller_loop())
        logger.info("Engine stats poller started (interval=%ds)", POLL_INTERVAL_SECONDS)
    except RuntimeError:
        # No running event loop (e.g., during tests)
        pass


def stop_poller() -> None:
    """Cancel the background poller (called on app shutdown)."""
    global _poller_task
    if _poller_task and not _poller_task.done():
        _poller_task.cancel()
        _poller_task = None
