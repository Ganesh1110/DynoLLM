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
