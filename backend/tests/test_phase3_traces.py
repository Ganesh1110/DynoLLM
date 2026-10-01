import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func

from app.main import app
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.runtime import Runtime
from app.models.request_trace import RequestTrace
from app.services.trace_service import (
    record_trace,
    record_traces_bulk,
    get_traces,
    get_trace_by_id,
    enforce_retention_limit,
)


@pytest.mark.asyncio
async def test_record_single_trace_and_query():
    async with AsyncSessionLocal() as db:
        # Create a test runtime first
        rt = Runtime(
            id="rt-trace-test",
            name="Trace Test Runtime",
            runtime_type="ollama",
            endpoint="http://localhost:11434",
            is_active=True,
        )
        db.add(rt)
        await db.commit()

        trace_data = {
            "source": "benchmark",
            "run_id": "bench-trace-1",
            "runtime_id": rt.id,
            "model": "llama3.1:8b",
            "prompt_text": "Explain quantum computing in simple terms.",
            "output_text": "Quantum computing uses qubits...",
            "prompt_tokens": 15,
            "completion_tokens": 42,
            "finish_reason": "stop",
            "ttft_ms": 48.5,
            "tpot_ms": 12.3,
            "total_latency_ms": 565.1,
            "params": {"temperature": 0.7, "max_tokens": 128},
        }

        trace = await record_trace(db, trace_data)
        assert trace.id is not None
        assert trace.source == "benchmark"
        assert trace.prompt_tokens == 15
        assert trace.completion_tokens == 42
        assert trace.ttft_ms == 48.5
        assert trace.finish_reason == "stop"

        # Query back
        fetched = await get_trace_by_id(db, trace.id)
        assert fetched is not None
        assert fetched.id == trace.id
        assert fetched.prompt_text == "Explain quantum computing in simple terms."


@pytest.mark.asyncio
async def test_trace_text_truncation_and_privacy_toggle():
    async with AsyncSessionLocal() as db:
        long_prompt = "A" * 5000
        trace_data = {
            "source": "benchmark",
            "run_id": "bench-trace-2",
            "runtime_id": "rt-trace-test",
            "model": "llama3.1:8b",
            "prompt_text": long_prompt,
            "output_text": "Short output",
        }

        trace = await record_trace(db, trace_data)
        assert len(trace.prompt_text) < 5000
        assert trace.prompt_text.endswith("... [truncated]")

        # Test privacy toggle STORE_PROMPT_CONTENT = False
        original_setting = settings.STORE_PROMPT_CONTENT
        try:
            settings.STORE_PROMPT_CONTENT = False
            trace_private = await record_trace(db, {
                "source": "benchmark",
                "run_id": "bench-trace-private",
                "runtime_id": "rt-trace-test",
                "model": "llama3.1:8b",
                "prompt_text": "Sensitive company prompt",
                "output_text": "Confidential response",
            })
            assert trace_private.prompt_text is None
            assert trace_private.output_text is None
        finally:
            settings.STORE_PROMPT_CONTENT = original_setting


@pytest.mark.asyncio
async def test_bulk_traces_and_retention_limit():
    async with AsyncSessionLocal() as db:
        original_limit = settings.MAX_STORED_TRACES
        try:
            settings.MAX_STORED_TRACES = 5  # Small retention limit for test

            # Insert 7 traces
            traces_batch = []
            now = datetime.now(timezone.utc)
            for i in range(7):
                traces_batch.append({
                    "source": "load_test",
                    "run_id": "lt-trace-batch",
                    "runtime_id": "rt-trace-test",
                    "model": "qwen2.5:7b",
                    "started_at": now + timedelta(seconds=i),
                    "prompt_tokens": 10 + i,
                    "completion_tokens": 20 + i,
                    "ttft_ms": 30.0 + i,
                    "total_latency_ms": 200.0 + i,
                })

            inserted_count = await record_traces_bulk(db, traces_batch)
            assert inserted_count == 7

            # Check retention limit enforced to at most 5 traces for lt-trace-batch
            traces, count = await get_traces(db, run_id="lt-trace-batch", limit=100)
            assert len(traces) <= 5
        finally:
            settings.MAX_STORED_TRACES = original_limit


@pytest.mark.asyncio
async def test_traces_api_endpoints():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. List traces
        res = await client.get("/api/traces?limit=10")
        assert res.status_code == 200
        data = res.json()
        assert "traces" in data
        assert "total" in data
        assert isinstance(data["traces"], list)

        # 2. Filter by source
        res_filtered = await client.get("/api/traces?source=benchmark&limit=5")
        assert res_filtered.status_code == 200
        for t in res_filtered.json()["traces"]:
            assert t["source"] == "benchmark"

        # 3. Retrieve single trace
        if data["traces"]:
            first_id = data["traces"][0]["id"]
            res_single = await client.get(f"/api/traces/{first_id}")
            assert res_single.status_code == 200
            single_data = res_single.json()
            assert single_data["id"] == first_id
            assert "prompt_tokens" in single_data

        # 4. 404 on invalid ID
        res_404 = await client.get("/api/traces/nonexistent-id-000")
        assert res_404.status_code == 404
