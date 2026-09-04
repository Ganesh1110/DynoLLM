import pytest
import pytest_asyncio
import httpx
from unittest.mock import AsyncMock, patch

from app.adapters.base import GenerateRequest, StreamChunk
from app.adapters.ollama import OllamaAdapter
from app.adapters.openai_compatible import OpenAICompatibleAdapter
from app.benchmark.engine import run_benchmark
from app.loadtest.engine import run_load_test
from app.core.database import create_tables, AsyncSessionLocal
from app.models.runtime import Runtime


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await create_tables()


@pytest.mark.asyncio
async def test_ollama_adapter_generate_stream():
    adapter = OllamaAdapter("http://localhost:11434")

    # Mock response lines
    mock_lines = [
        '{"response": "Hello", "done": false}',
        '{"response": " world", "done": false}',
        '{"response": "!", "done": true, "prompt_eval_count": 5, "eval_count": 3}',
    ]

    class MockStreamResponse:
        status_code = 200
        async def aiter_lines(self):
            for line in mock_lines:
                yield line
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        def raise_for_status(self):
            pass

    with patch("httpx.AsyncClient.stream", return_value=MockStreamResponse()):
        req = GenerateRequest(model="llama3.1:8b", prompt="Hi", stream=True)
        chunks = []
        async for chunk in adapter.generate_stream(req):
            chunks.append(chunk)

        assert len(chunks) == 3
        assert chunks[0].delta == "Hello"
        assert chunks[0].is_first is True
        assert chunks[2].is_last is True
        assert chunks[2].completion_tokens == 3


@pytest.mark.asyncio
async def test_openai_adapter_health():
    adapter = OpenAICompatibleAdapter("http://localhost:1234")

    req = httpx.Request("GET", "http://localhost:1234/v1/models")
    mock_resp = httpx.Response(200, json={"data": [{"id": "local-model"}]}, request=req)
    with patch("httpx.AsyncClient.get", return_value=mock_resp):
        healthy, msg = await adapter.health_check()
        assert healthy is True
        assert "Healthy" in msg

        models = await adapter.list_models()
        assert len(models) == 1
        assert models[0]["id"] == "local-model"


@pytest.mark.asyncio
async def test_benchmark_engine_with_mock():
    import uuid
    from app.models.benchmark import BenchmarkRun
    run_id = f"bench-{uuid.uuid4()}"
    rt_id = f"rt-{uuid.uuid4()}"

    async with AsyncSessionLocal() as db:
        rt = Runtime(
            id=rt_id,
            name="Mock Ollama",
            runtime_type="ollama",
            endpoint="http://localhost:11434",
        )
        db.add(rt)

        run = BenchmarkRun(
            id=run_id,
            runtime_id=rt_id,
            model="mock:latest",
            scenario="short",
            status="running",
        )
        db.add(run)
        await db.commit()

        # Mock adapter stream
        async def mock_stream(request):
            yield StreamChunk(delta="Test", is_first=True)
            yield StreamChunk(delta=" response", is_last=True, prompt_tokens=4, completion_tokens=8)

        with patch("app.benchmark.engine.get_adapter") as mock_get_adapter:
            mock_adapter = AsyncMock()
            mock_adapter.generate_stream = mock_stream
            mock_get_adapter.return_value = mock_adapter

            aggregates = await run_benchmark(
                run_id=run_id,
                runtime_type="ollama",
                endpoint="http://localhost:11434",
                api_key=None,
                model="mock:latest",
                scenario="short",
                prompt="Say test",
                system_prompt=None,
                temperature=0.7,
                max_tokens=100,
                num_runs=2,
                use_streaming=True,
                db=db,
            )

            assert aggregates["avg_total_latency_ms"] is not None
            assert aggregates["quality_integrity_rate"] == 1.0
            assert aggregates["avg_completion_tokens"] == 8.0


@pytest.mark.asyncio
async def test_load_test_watchdog_detects_crash():
    import uuid
    from app.models.load_test import LoadTestRun
    load_id = f"load-{uuid.uuid4()}"
    rt_id = f"rt-{uuid.uuid4()}"

    async with AsyncSessionLocal() as db:
        rt = Runtime(
            id=rt_id,
            name="Crash Ollama",
            runtime_type="ollama",
            endpoint="http://localhost:11434",
        )
        db.add(rt)

        l_run = LoadTestRun(
            id=load_id,
            runtime_id=rt_id,
            model="mock:latest",
            pattern="constant",
            target_users=2,
            duration_seconds=5,
            status="running",
        )
        db.add(l_run)
        await db.commit()

        async def mock_stream(request):
            yield StreamChunk(delta="hi", is_first=True, is_last=True, completion_tokens=1)

        with patch("app.loadtest.engine.get_adapter") as mock_get_adapter:
            mock_adapter = AsyncMock()
            mock_adapter.generate_stream = mock_stream
            # Simulate health check failing
            mock_adapter.health_check = AsyncMock(return_value=(False, "Connection Refused / Process OOM"))
            mock_get_adapter.return_value = mock_adapter

            aggregates = await run_load_test(
                run_id=load_id,
                runtime_type="ollama",
                endpoint="http://localhost:11434",
                api_key=None,
                model="mock:latest",
                pattern="constant",
                target_users=2,
                duration_seconds=5,
                rampup_step_users=1,
                rampup_step_seconds=2,
                system_prompt=None,
                prompt_mix=None,
                temperature=0.7,
                max_tokens=50,
                request_timeout=10,
                db=db,
            )

            # Watchdog should detect failure and record runtime_healthy_throughout as False
            assert aggregates["runtime_healthy_throughout"] is False
            assert "health check failed" in aggregates["abort_reason"].lower()
