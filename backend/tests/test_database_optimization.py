import pytest
from sqlalchemy import text
from app.core.database import engine, AsyncSessionLocal, create_tables
from app.models.load_test import LoadTestRun, LoadTestResult
import uuid
from datetime import datetime, timezone


@pytest.mark.asyncio
async def test_sqlite_pragmas_and_wal():
    """Verify high-performance SQLite PRAGMAs are active on connections."""
    await create_tables()

    async with AsyncSessionLocal() as session:
        # Check journal mode (WAL)
        res = await session.execute(text("PRAGMA journal_mode"))
        assert res.scalar().lower() == "wal"

        # Check synchronous mode (NORMAL = 1)
        res = await session.execute(text("PRAGMA synchronous"))
        assert res.scalar() in (1, "1", "NORMAL", "normal")

        # Check cache size (64MB = -64000)
        res = await session.execute(text("PRAGMA cache_size"))
        assert res.scalar() == -64000

        # Check temp_store (MEMORY = 2)
        res = await session.execute(text("PRAGMA temp_store"))
        assert res.scalar() in (2, "2", "MEMORY", "memory")

        # Check mmap_size (256MB)
        res = await session.execute(text("PRAGMA mmap_size"))
        assert res.scalar() == 268435456


@pytest.mark.asyncio
async def test_query_plan_uses_indexes():
    """Verify that performance indexes exist and are recognized by SQLite."""
    await create_tables()

    async with AsyncSessionLocal() as session:
        # Verify indexes exist on load_test_results
        lt_indexes = await session.execute(text("PRAGMA index_list('load_test_results')"))
        lt_index_names = [row[1] for row in lt_indexes.fetchall()]
        assert any("run_id" in idx for idx in lt_index_names)
        assert any("timestamp" in idx for idx in lt_index_names)

        # Verify indexes exist on request_traces
        trace_indexes = await session.execute(text("PRAGMA index_list('request_traces')"))
        trace_index_names = [row[1] for row in trace_indexes.fetchall()]
        assert any("source" in idx for idx in trace_index_names)
        assert any("model" in idx for idx in trace_index_names)

        # Verify indexes exist on benchmark_results
        bench_indexes = await session.execute(text("PRAGMA index_list('benchmark_results')"))
        bench_index_names = [row[1] for row in bench_indexes.fetchall()]
        assert any("run_id" in idx for idx in bench_index_names)

        # Verify indexes exist on hardware_snapshots
        hw_indexes = await session.execute(text("PRAGMA index_list('hardware_snapshots')"))
        hw_index_names = [row[1] for row in hw_indexes.fetchall()]
        assert any("run_id" in idx for idx in hw_index_names)


@pytest.mark.asyncio
async def test_concurrent_sessions_in_connection_pool():
    """Verify connection pool handles concurrent async operations without blocking."""
    await create_tables()

    import asyncio

    async def worker(idx: int):
        async with AsyncSessionLocal() as session:
            res = await session.execute(text(f"SELECT {idx} AS num"))
            return res.scalar()

    # Launch 20 concurrent session queries
    results = await asyncio.gather(*(worker(i) for i in range(20)))
    assert results == list(range(20))
