"""
Phase 3 tests – engine stats scraper and /api/monitoring/engine-stats endpoint.
"""
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# 1. OllamaAdapter.get_engine_stats() – normal case with loaded model
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_ollama_get_engine_stats_loaded_model():
    from app.adapters.ollama import OllamaAdapter

    # Mock /api/ps response from Ollama
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "models": [
            {
                "name": "llama3.1:8b-instruct-q4_K_M",
                "size": 5_272_000_000,       # ~4.91 GB total on disk
                "size_vram": 4_831_838_208,  # ~4.50 GB in VRAM
                "details": {
                    "quantization_level": "Q4_K_M",
                    "context_length": 131072,
                },
                "expires_at": "2025-11-01T00:00:00Z",
            }
        ]
    }
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    adapter = OllamaAdapter(endpoint="http://localhost:11434")
    # Inject mock client via context manager __aenter__ return
    with patch.object(adapter, "get_client") as mock_get_client:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_client)
        ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_client.return_value = ctx

        result = await adapter.get_engine_stats()

    assert result["engine"] == "ollama"
    assert result["error"] is None
    assert len(result["models_loaded"]) == 1
    model = result["models_loaded"][0]
    assert model["name"] == "llama3.1:8b-instruct-q4_K_M"
    assert model["vram_gb"] > 0
    assert model["size_gb"] > model["vram_gb"]  # total > VRAM portion
    # size_vram < size → some bytes in RAM → cpu_offloaded=True is correct
    assert model["cpu_offloaded"] is True
    assert model["offload_pct"] > 0
    assert result["total_vram_gb"] == pytest.approx(model["vram_gb"])


# ---------------------------------------------------------------------------
# 2. OllamaAdapter.get_engine_stats() – CPU offload scenario
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_ollama_get_engine_stats_cpu_offloaded():
    from app.adapters.ollama import OllamaAdapter

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "models": [
            {
                "name": "mistral:7b-instruct-q8_0",
                "size": 7_700_000_000,       # 7.17 GB total
                "size_vram": 4_000_000_000,  # only 3.73 GB in VRAM
                "details": {},
            }
        ]
    }
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    adapter = OllamaAdapter(endpoint="http://localhost:11434")
    with patch.object(adapter, "get_client") as mock_get_client:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_client)
        ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_client.return_value = ctx

        result = await adapter.get_engine_stats()

    model = result["models_loaded"][0]
    assert model["cpu_offloaded"] is True
    assert model["cpu_offload_gb"] > 0
    assert model["offload_pct"] > 0


# ---------------------------------------------------------------------------
# 3. OllamaAdapter.get_engine_stats() – no models loaded (idle)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_ollama_get_engine_stats_no_models():
    from app.adapters.ollama import OllamaAdapter

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"models": []}
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    adapter = OllamaAdapter(endpoint="http://localhost:11434")
    with patch.object(adapter, "get_client") as mock_get_client:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_client)
        ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_client.return_value = ctx

        result = await adapter.get_engine_stats()

    assert result["engine"] == "ollama"
    assert result["models_loaded"] == []
    assert result["total_vram_gb"] == 0.0
    assert result["error"] is None


# ---------------------------------------------------------------------------
# 4. OllamaAdapter.get_engine_stats() – connection error
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_ollama_get_engine_stats_connection_error():
    import httpx
    from app.adapters.ollama import OllamaAdapter

    adapter = OllamaAdapter(endpoint="http://localhost:11434")
    with patch.object(adapter, "get_client") as mock_get_client:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_client.return_value = ctx

        result = await adapter.get_engine_stats()

    assert result["engine"] == "ollama"
    assert result["models_loaded"] == []
    assert result["error"] is not None
    assert "Connection refused" in result["error"]


# ---------------------------------------------------------------------------
# 5. OpenAICompatibleAdapter.get_engine_stats() – vLLM /metrics scraper
# ---------------------------------------------------------------------------
VLLM_METRICS_SAMPLE = """\
# HELP vllm:gpu_cache_usage_perc GPU KV-cache usage. 1 means 100 percent usage.
# TYPE vllm:gpu_cache_usage_perc gauge
vllm:gpu_cache_usage_perc{model_name="meta-llama/Llama-3.1-8B-Instruct"} 0.35
# HELP vllm:num_requests_running Number of requests currently running.
# TYPE vllm:num_requests_running gauge
vllm:num_requests_running{model_name="meta-llama/Llama-3.1-8B-Instruct"} 2
# HELP vllm:num_requests_waiting Number of requests waiting to be processed.
# TYPE vllm:num_requests_waiting gauge
vllm:num_requests_waiting{model_name="meta-llama/Llama-3.1-8B-Instruct"} 0
# HELP vllm:prefix_cache_hit_rate Prefix cache block hit rate.
# TYPE vllm:prefix_cache_hit_rate gauge
vllm:prefix_cache_hit_rate{model_name="meta-llama/Llama-3.1-8B-Instruct"} 0.42
# HELP vllm:num_total_gpu_blocks Number of total GPU blocks.
# TYPE vllm:num_total_gpu_blocks gauge
vllm:num_total_gpu_blocks 1024
# HELP vllm:num_free_gpu_blocks Number of free GPU blocks.
# TYPE vllm:num_free_gpu_blocks gauge
vllm:num_free_gpu_blocks 665
"""


@pytest.mark.asyncio
async def test_openai_compatible_get_engine_stats_vllm():
    from app.adapters.openai_compatible import OpenAICompatibleAdapter

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = VLLM_METRICS_SAMPLE
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    adapter = OpenAICompatibleAdapter(endpoint="http://localhost:8000")
    with patch.object(adapter, "get_client") as mock_get_client:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_client)
        ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_client.return_value = ctx

        result = await adapter.get_engine_stats()

    assert result["engine"] == "vllm"
    assert result["error"] is None
    assert result["kv_cache_usage_pct"] == pytest.approx(35.0, abs=0.1)
    assert result["requests_running"] == 2
    assert result["requests_waiting"] == 0
    assert result["prefix_cache_hit_rate"] == pytest.approx(42.0, abs=0.1)
    assert result["num_total_gpu_blocks"] == 1024
    assert result["num_free_gpu_blocks"] == 665
    assert len(result["models_loaded"]) == 1
    assert result["models_loaded"][0]["name"] == "meta-llama/Llama-3.1-8B-Instruct"


# ---------------------------------------------------------------------------
# 6. OpenAICompatibleAdapter.get_engine_stats() – non-vLLM returns 404
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_openai_compatible_get_engine_stats_non_vllm_404():
    from app.adapters.openai_compatible import OpenAICompatibleAdapter

    mock_response = MagicMock()
    mock_response.status_code = 404

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    adapter = OpenAICompatibleAdapter(endpoint="http://localhost:1234")
    with patch.object(adapter, "get_client") as mock_get_client:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_client)
        ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_client.return_value = ctx

        result = await adapter.get_engine_stats()

    assert result["engine"] == "openai_compatible"
    assert result["kv_cache_usage_pct"] is None
    assert result["error"] is None


# ---------------------------------------------------------------------------
# 7. GET /api/monitoring/engine-stats endpoint – returns cached data
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_engine_stats_endpoint():
    """
    The endpoint returns the cached engine stats. Since no runtimes are
    configured in the test DB, the result should be an empty list.
    """
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/monitoring/engine-stats")
    assert resp.status_code == 200
    body = resp.json()
    assert "runtimes" in body
    assert isinstance(body["runtimes"], list)

