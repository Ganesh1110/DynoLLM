import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock

from app.adapters.base import StreamChunk
from app.loadtest.engine import _compute_aggregates, _single_request
from app.models.load_test import LoadTestResult, LoadTestRun
from app.core.database import create_tables, AsyncSessionLocal


@pytest.mark.asyncio
async def test_compute_aggregates_token_metrics():
    t0 = datetime.now(timezone.utc)
    t1 = t0 + timedelta(seconds=10)

    r1 = LoadTestResult(
        id="res-1",
        run_id="run-1",
        timestamp=t0,
        concurrent_users=2,
        ttft_ms=50.0,
        total_latency_ms=500.0,
        prompt_tokens=400,
        completion_tokens=100,
        generation_tokens_per_second=200.0,
        success=True,
        quality_valid=True,
    )
    r2 = LoadTestResult(
        id="res-2",
        run_id="run-1",
        timestamp=t1,
        concurrent_users=2,
        ttft_ms=60.0,
        total_latency_ms=600.0,
        prompt_tokens=600,
        completion_tokens=100,
        generation_tokens_per_second=166.7,
        success=True,
        quality_valid=True,
    )

    agg = _compute_aggregates([r1, r2])

    # Check token sums and averages
    assert agg["total_prompt_tokens"] == 1000
    assert agg["total_completion_tokens"] == 200
    assert agg["avg_prompt_tokens"] == 500.0
    assert agg["avg_completion_tokens"] == 100.0

    # 10 second span
    # 1000 / 10s = 100 tok_in/s, 200 / 10s = 20 tok_out/s, total 1200 / 10s = 120 tok/s
    assert agg["tokens_in_per_second"] == pytest.approx(100.0, rel=1e-2)
    assert agg["tokens_out_per_second"] == pytest.approx(20.0, rel=1e-2)
    assert agg["total_tokens_per_second"] == pytest.approx(120.0, rel=1e-2)

    # Input ratio: 1000 / 1200 = 0.8333 (~83.3% prefill)
    assert agg["input_token_ratio"] == pytest.approx(1000.0 / 1200.0, rel=1e-3)

    # Cost estimate: (1000 * 0.50 + 200 * 1.50) / 1,000,000 = (500 + 300) / 1,000,000 = 0.00080
    assert agg["cost_estimate"] == pytest.approx(0.0008, rel=1e-3)


@pytest.mark.asyncio
async def test_compute_aggregates_empty_results():
    agg = _compute_aggregates([])

    assert agg["quality_integrity_rate"] is None
    assert agg["total_prompt_tokens"] is None
    assert agg["total_completion_tokens"] is None
    assert agg["tokens_in_per_second"] is None
    assert agg["tokens_out_per_second"] is None
    assert agg["input_token_ratio"] is None
    assert agg["cost_estimate"] is None


@pytest.mark.asyncio
async def test_single_request_captures_prompt_tokens():
    await create_tables()

    adapter = MagicMock()
    async def mock_stream(request):
        yield StreamChunk(delta="Hello", is_first=True)
        yield StreamChunk(delta=" world!", is_last=True, prompt_tokens=15, completion_tokens=4)

    adapter.generate_stream = mock_stream

    async with AsyncSessionLocal() as db:
        res = await _single_request(
            adapter=adapter,
            model="llama3.1:8b",
            prompt="Tell me about AI",
            system_prompt="You are helpful.",
            temperature=0.7,
            max_tokens=64,
            timeout=30.0,
            concurrent_users=1,
            run_id="test-run",
            db=db,
        )

        assert res.prompt_tokens == 15
        assert res.completion_tokens == 4
        assert res.success is True
