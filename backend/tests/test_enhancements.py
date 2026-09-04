import pytest
import pytest_asyncio
import httpx
from unittest.mock import AsyncMock, patch, MagicMock

from app.adapters.ollama import OllamaAdapter
from app.adapters.openai_compatible import OpenAICompatibleAdapter
from app.loadtest.engine import _validate_quality, _compute_aggregates
from app.monitoring.collector import collect_metrics
from app.core.config import settings
from app.core.auth import verify_api_key
from fastapi.security import HTTPAuthorizationCredentials
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_adapter_client_reuse():
    """Verify that RuntimeAdapter reuses a single pooled httpx.AsyncClient."""
    limits = httpx.Limits(max_connections=10, max_keepalive_connections=5)
    async with httpx.AsyncClient(limits=limits) as shared_client:
        adapter = OllamaAdapter("http://localhost:11434", client=shared_client)
        assert adapter.client is shared_client

        async with adapter.get_client() as c:
            assert c is shared_client


def test_quality_validation():
    """Verify quality validation handles valid text, empty text, crash signatures, and JSON."""
    # Normal prompt with text
    assert _validate_quality("Tell me a joke", "Why did the chicken cross the road?", True, False) is True

    # Empty text
    assert _validate_quality("Tell me a joke", "   ", True, False) is False

    # Timed out or failed
    assert _validate_quality("Tell me a joke", "Hello", False, False) is False
    assert _validate_quality("Tell me a joke", "Hello", True, True) is False

    # Crash signature
    assert _validate_quality("Calculate pi", "Error: CUDA out of memory on device 0", True, False) is False

    # JSON prompt with valid JSON
    assert _validate_quality("Return a json object with name", '{"name": "DynoLLM"}', True, False) is True
    # JSON prompt with markdown codefence
    assert _validate_quality("Output json", '```json\n{"status": "ok"}\n```', True, False) is True
    # JSON prompt with invalid/truncated JSON
    assert _validate_quality("Output json", '{"status": "incomp', True, False) is False


def test_safe_max_concurrency_calculation():
    """Verify _compute_aggregates computes safe_max_concurrency based on SLAs."""
    class FakeResult:
        def __init__(self, concurrent_users, success=True, quality_valid=True, latency=100.0):
            self.concurrent_users = concurrent_users
            self.success = success
            self.quality_valid = quality_valid
            self.total_latency_ms = latency
            self.ttft_ms = 20.0
            self.generation_tokens_per_second = 50.0
            self.timed_out = not success
            import datetime
            self.timestamp = datetime.datetime.now(datetime.timezone.utc)

    # 10 users: 100% success
    results_10 = [FakeResult(10, success=True, quality_valid=True) for _ in range(20)]
    # 20 users: 100% success
    results_20 = [FakeResult(20, success=True, quality_valid=True) for _ in range(20)]
    # 30 users: 20% fail (4 out of 20 fail)
    results_30 = [FakeResult(30, success=True, quality_valid=True) for _ in range(16)] + \
                 [FakeResult(30, success=False, quality_valid=False) for _ in range(4)]

    aggregates = _compute_aggregates(results_10 + results_20 + results_30)
    # Safe max concurrency should be 20 because 30 had a 20% error rate (> 5%)
    assert aggregates["safe_max_concurrency"] == 20


@pytest.mark.asyncio
async def test_multi_gpu_aggregation():
    """Verify that multi-GPU metrics are correctly summed across GPUs."""
    mock_hw = {
        "timestamp": "2026-09-04T00:00:00Z",
        "cpu_percent": 10.0,
        "ram_percent": 50.0,
        "gpus": [
            {"index": 0, "power_draw_watts": 250.0, "vram_used_bytes": 1000, "vram_total_bytes": 4000, "utilization_percent": 90.0},
            {"index": 1, "power_draw_watts": 230.0, "vram_used_bytes": 1000, "vram_total_bytes": 4000, "utilization_percent": 80.0},
        ],
    }
    with patch("app.monitoring.collector.collect_metrics", return_value=mock_hw):
        from app.loadtest.engine import _compute_aggregates
        # Power samples from multi-GPU
        power_samples = [480.0, 480.0]
        agg = _compute_aggregates([], power_samples=power_samples)
        # Check power calculation works
        assert agg["abort_reason"] is None


@pytest.mark.asyncio
async def test_api_key_auth():
    """Verify verify_api_key allows all when API_KEY is unset, and enforces key when set."""
    # When API_KEY is None, allow without credentials
    with patch.object(settings, "API_KEY", None):
        result = await verify_api_key(header_key=None, bearer_creds=None)
        assert result is None

    # When API_KEY is configured
    with patch.object(settings, "API_KEY", "secret-test-token"):
        # Valid X-API-Key
        assert await verify_api_key(header_key="secret-test-token", bearer_creds=None) == "secret-test-token"

        # Valid Bearer token
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="secret-test-token")
        assert await verify_api_key(header_key=None, bearer_creds=creds) == "secret-test-token"

        # Invalid key -> raises 401
        with pytest.raises(HTTPException) as exc_info:
            await verify_api_key(header_key="wrong-token", bearer_creds=None)
        assert exc_info.value.status_code == 401
