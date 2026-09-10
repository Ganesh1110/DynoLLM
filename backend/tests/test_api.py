import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import create_tables


@pytest_asyncio.fixture(autouse=True)
async def init_db():
    await create_tables()


@pytest.mark.asyncio
async def test_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_runtimes_crud():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create
        create_resp = await client.post(
            "/api/runtimes",
            json={
                "name": "Test Ollama",
                "runtime_type": "ollama",
                "endpoint": "http://localhost:11434",
                "notes": "Test environment runtime",
            },
        )
        assert create_resp.status_code == 200
        runtime = create_resp.json()
        assert runtime["name"] == "Test Ollama"
        runtime_id = runtime["id"]

        # List
        list_resp = await client.get("/api/runtimes")
        assert list_resp.status_code == 200
        runtimes = list_resp.json()
        assert any(r["id"] == runtime_id for r in runtimes)

        # Get
        get_resp = await client.get(f"/api/runtimes/{runtime_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == runtime_id

        # Update
        up_resp = await client.put(f"/api/runtimes/{runtime_id}", json={"name": "Updated Ollama"})
        assert up_resp.status_code == 200
        assert up_resp.json()["name"] == "Updated Ollama"

        # Delete
        del_resp = await client.delete(f"/api/runtimes/{runtime_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] is True


@pytest.mark.asyncio
async def test_monitoring_current():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/monitoring/current")
        assert response.status_code == 200
        data = response.json()
        assert "cpu_percent" in data
        assert "ram_percent" in data
        assert "disk_read_bytes_per_sec" in data


@pytest.mark.asyncio
async def test_benchmarks_delete_and_clear():
    import uuid
    from app.core.database import AsyncSessionLocal
    from app.models.runtime import Runtime
    from app.models.benchmark import BenchmarkRun, BenchmarkResult

    uid = uuid.uuid4().hex[:8]
    rt_id = f"rt-bench-{uid}"
    b1_id = f"bench-1-{uid}"
    b2_id = f"bench-2-{uid}"

    async with AsyncSessionLocal() as db:
        rt = Runtime(id=rt_id, name="Bench RT", runtime_type="ollama", endpoint="http://localhost:11434")
        db.add(rt)
        await db.flush()
        b1 = BenchmarkRun(id=b1_id, runtime_id=rt_id, model="llama3:8b", scenario="short", status="completed")
        b2 = BenchmarkRun(id=b2_id, runtime_id=rt_id, model="llama3:8b", scenario="medium", status="completed")
        db.add_all([b1, b2])
        await db.flush()
        r1 = BenchmarkResult(id=f"res-1-{uid}", run_id=b1_id, run_index=0, total_latency_ms=100.0)
        r2 = BenchmarkResult(id=f"res-2-{uid}", run_id=b2_id, run_index=0, total_latency_ms=200.0)
        db.add_all([r1, r2])
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Delete single benchmark run
        del_one = await client.delete(f"/api/benchmarks/{b1_id}")
        assert del_one.status_code == 200
        assert del_one.json()["deleted"] is True
        assert del_one.json()["id"] == b1_id

        # Verify b1 is gone
        get_b1 = await client.get(f"/api/benchmarks/{b1_id}")
        assert get_b1.status_code == 404

        # Verify b2 still exists
        get_b2 = await client.get(f"/api/benchmarks/{b2_id}")
        assert get_b2.status_code == 200

        # Clear all benchmarks
        clear_resp = await client.delete("/api/benchmarks")
        assert clear_resp.status_code == 200
        assert clear_resp.json()["deleted"] is True

        # Verify list is empty
        list_resp = await client.get("/api/benchmarks")
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 0


@pytest.mark.asyncio
async def test_load_tests_delete_and_clear():
    import uuid
    from app.core.database import AsyncSessionLocal
    from app.models.runtime import Runtime
    from app.models.load_test import LoadTestRun, LoadTestResult

    uid = uuid.uuid4().hex[:8]
    rt_id = f"rt-lt-{uid}"
    lt1_id = f"lt-1-{uid}"
    lt2_id = f"lt-2-{uid}"

    async with AsyncSessionLocal() as db:
        rt = Runtime(id=rt_id, name="LoadTest RT", runtime_type="ollama", endpoint="http://localhost:11434")
        db.add(rt)
        await db.flush()
        lt1 = LoadTestRun(id=lt1_id, runtime_id=rt_id, model="llama3:8b", pattern="constant", target_users=5, duration_seconds=10, status="completed")
        lt2 = LoadTestRun(id=lt2_id, runtime_id=rt_id, model="llama3:8b", pattern="rampup", target_users=10, duration_seconds=20, status="completed")
        db.add_all([lt1, lt2])
        await db.flush()
        lr1 = LoadTestResult(id=f"ltres-1-{uid}", run_id=lt1_id, concurrent_users=1, total_latency_ms=50.0)
        lr2 = LoadTestResult(id=f"ltres-2-{uid}", run_id=lt2_id, concurrent_users=2, total_latency_ms=60.0)
        db.add_all([lr1, lr2])
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Delete single load test run
        del_one = await client.delete(f"/api/load-tests/{lt1_id}")
        assert del_one.status_code == 200
        assert del_one.json()["deleted"] is True
        assert del_one.json()["id"] == lt1_id

        # Verify lt1 is gone
        get_lt1 = await client.get(f"/api/load-tests/{lt1_id}")
        assert get_lt1.status_code == 404

        # Clear all load tests
        clear_resp = await client.delete("/api/load-tests")
        assert clear_resp.status_code == 200
        assert clear_resp.json()["deleted"] is True

        # Verify list is empty
        list_resp = await client.get("/api/load-tests")
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 0

