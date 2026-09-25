import pytest
import pytest_asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal, create_tables


@pytest_asyncio.fixture(autouse=True)
async def init_and_cleanup_test_data():
    await create_tables()
    yield
    # Clean up test-created runtimes and test runs so test runs do not pollute llm_platform.db
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text(
                "DELETE FROM runtimes WHERE name IN "
                "('Mock Ollama', 'Crash Ollama', 'Bench RT', 'LoadTest RT', 'Mock Ollama Bench', 'Test Ollama') "
                "OR id LIKE 'rt-%'"
            ))
            await db.execute(text("DELETE FROM benchmark_runs WHERE id LIKE 'bench-%'"))
            await db.execute(text("DELETE FROM load_test_runs WHERE id LIKE 'lt-%'"))
            await db.commit()
    except Exception:
        pass
