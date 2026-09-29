"""
Test configuration and fixtures.

Issue 11 fix: tests now run against an isolated temporary database file
(test_llm_platform.db) instead of the live llm_platform.db.
The DATABASE_URL environment override must be set BEFORE any app modules
are imported so SQLAlchemy picks up the test URL from settings.
"""
import os
import asyncio

# Override DATABASE_URL before any app module imports — settings reads it at import time.
_TEST_DB_PATH = "./test_llm_platform.db"
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_TEST_DB_PATH}")

import pytest
import pytest_asyncio
from sqlalchemy import text

# Re-import database module AFTER the env override so the engine uses the test DB.
from app.core.database import AsyncSessionLocal, create_tables, engine


@pytest_asyncio.fixture(autouse=True)
async def init_and_cleanup_test_data():
    """Create tables in the test DB before each test; delete test rows after."""
    await create_tables()
    yield
    # Clean up rows created during the test so tests don't interfere with each other.
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text(
                "DELETE FROM runtimes WHERE name IN "
                "('Mock Ollama', 'Crash Ollama', 'Bench RT', 'LoadTest RT', 'Mock Ollama Bench', 'Test Ollama') "
                "OR id LIKE 'rt-%'"
            ))
            await db.execute(text("DELETE FROM benchmark_runs WHERE id LIKE 'bench-%'"))
            await db.execute(text("DELETE FROM load_test_runs WHERE id LIKE 'lt-%'"))
            await db.execute(text("DELETE FROM load_test_results WHERE run_id LIKE 'lt-%'"))
            await db.commit()
    except Exception:
        pass


def pytest_sessionfinish(session, exitstatus):
    """Remove the temporary test database file after the full test session completes."""
    try:
        if os.path.exists(_TEST_DB_PATH):
            os.remove(_TEST_DB_PATH)
        # Also remove WAL and SHM sidecar files if present
        for suffix in ("-wal", "-shm"):
            sidecar = _TEST_DB_PATH + suffix
            if os.path.exists(sidecar):
                os.remove(sidecar)
    except OSError:
        pass
