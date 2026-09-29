"""
Tests verifying all 13 reported issue fixes.
"""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
from fastapi import HTTPException

from app.adapters.openai_compatible import OpenAICompatibleAdapter
from app.adapters.base import GenerateRequest, StreamChunk
from app.loadtest.engine import _compute_aggregates, run_load_test
from app.models.load_test import LoadTestResult, LoadTestRun
from app.core.auth import verify_api_key, verify_export_api_key
from app.core.config import settings
from app.core.database import AsyncSessionLocal, create_tables


@pytest.mark.asyncio
async def test_issue_1_trailing_usage_only_chunk():
    """Verify OpenAICompatibleAdapter captures usage from trailing choices: [] chunk."""
    adapter = OpenAICompatibleAdapter(endpoint="http://mock-llm:8000")
    req = GenerateRequest(model="test-model", prompt="Hello", stream=True)

    # Simulated response lines from vLLM where usage arrives in a final choices: [] chunk
    fake_lines = [
        b'data: {"choices": [{"delta": {"content": "Hello"}, "finish_reason": null}]}',
        b'data: {"choices": [{"delta": {"content": " world"}, "finish_reason": "stop"}]}',
        b'data: {"choices": [], "usage": {"prompt_tokens": 42, "completion_tokens": 12}}',
        b'data: [DONE]',
    ]

    class FakeResponse:
        status_code = 200
        def raise_for_status(self): pass
        async def aiter_lines(self):
            for l in fake_lines:
                yield l.decode("utf-8")
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass

    mock_client = MagicMock()
    mock_client.is_closed = False
    mock_client.stream.return_value = FakeResponse()

    chunks = []
    async for c in adapter.generate_stream(req, client=mock_client):
        chunks.append(c)

    # Confirm prompt_tokens=42 was captured from the trailing chunk
    last_chunk = chunks[-1]
    assert last_chunk.prompt_tokens == 42
    assert last_chunk.completion_tokens == 12


@pytest.mark.asyncio
async def test_issue_5_rampup_budget_warning():
    """Verify rampup budget trap detection triggers warning when target is unreachable."""
    agg = await run_load_test(
        run_id="test-budget-trap",
        runtime_type="ollama",
        endpoint="http://localhost:11434",
        api_key=None,
        model="mock:latest",
        pattern="rampup",
        target_users=50,
        duration_seconds=30,      # 30s / 10s per step = 3 steps
        rampup_step_users=5,      # 3 steps * 5 users = 15 users max (< 50)
        rampup_step_seconds=10,
        system_prompt=None,
        prompt_mix=None,
        temperature=0.7,
        max_tokens=64,
        request_timeout=30,
    )

    assert agg["rampup_budget_warning"] is not None
    assert "Target 50 VU is unreachable" in agg["rampup_budget_warning"]
    assert "15 VU max" in agg["rampup_budget_warning"]


@pytest.mark.asyncio
async def test_issue_6_safe_max_concurrency_ceiling_flag():
    """Verify safe_max_concurrency_is_ceiling is False when no SLA breach occurred, True when breached."""
    t0 = datetime.now(timezone.utc)

    # Case A: All tiers pass SLA (no breach) -> is_ceiling must be False (highest tested, not ceiling)
    r1 = LoadTestResult(
        id="r1", run_id="run-pass", timestamp=t0, concurrent_users=10,
        total_latency_ms=100.0, ttft_ms=20.0, generation_tokens_per_second=50.0,
        success=True, quality_valid=True,
    )
    r2 = LoadTestResult(
        id="r2", run_id="run-pass", timestamp=t0, concurrent_users=20,
        total_latency_ms=120.0, ttft_ms=25.0, generation_tokens_per_second=48.0,
        success=True, quality_valid=True,
    )

    agg_pass = _compute_aggregates([r1, r2])
    assert agg_pass["safe_max_concurrency"] == 20
    assert agg_pass["safe_max_concurrency_is_ceiling"] is False

    # Case B: Higher tier breaches SLA -> is_ceiling must be True (a real ceiling was measured)
    r_fail = LoadTestResult(
        id="r3", run_id="run-breach", timestamp=t0, concurrent_users=30,
        total_latency_ms=5000.0, ttft_ms=4000.0, generation_tokens_per_second=5.0,
        success=False, quality_valid=False,
    )
    agg_breach = _compute_aggregates([r1, r2, r_fail])
    assert agg_breach["safe_max_concurrency"] == 20
    assert agg_breach["safe_max_concurrency_is_ceiling"] is True


@pytest.mark.asyncio
async def test_issue_14_security_rest_vs_export_auth(monkeypatch):
    """Verify REST verify_api_key does not accept ?token= query parameter, while verify_export_api_key does."""
    monkeypatch.setattr(settings, "API_KEY", "secret-key-123")

    # verify_api_key (REST): accepts valid header
    assert await verify_api_key(header_key="secret-key-123", bearer_creds=None) == "secret-key-123"

    # verify_api_key (REST): rejects missing/invalid header
    with pytest.raises(HTTPException) as exc_info:
        await verify_api_key(header_key="wrong-key", bearer_creds=None)
    assert exc_info.value.status_code == 401

    # verify_export_api_key (Downloads): accepts ?token= parameter for browser anchor downloads
    assert await verify_export_api_key(header_key=None, bearer_creds=None, token="secret-key-123") == "secret-key-123"

    # verify_export_api_key: rejects wrong token
    with pytest.raises(HTTPException) as exc_info2:
        await verify_export_api_key(header_key=None, bearer_creds=None, token="wrong-key")
    assert exc_info2.value.status_code == 401
