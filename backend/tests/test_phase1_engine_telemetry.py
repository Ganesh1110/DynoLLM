"""
Tests for Phase 1 Engine Telemetry Backend:
- prom_parse: Prometheus text exposition parser
- prom_resolver: Canonical metric resolution & capabilities
- engine_history: Ring buffer, windowed rates, percentiles, counter resets
- API endpoint: GET /api/monitoring/engine-stats/history
"""
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.monitoring.prom_parse import parse_prometheus_text, parse_labels, parse_line
from app.monitoring.prom_resolver import resolve_canonical_metrics
from app.monitoring.engine_history import (
    record_sample,
    get_history,
    prune_runtime,
    _interpolate_percentile,
)


# ---------------------------------------------------------------------------
# 1. prom_parse tests
# ---------------------------------------------------------------------------

SAMPLE_PROMETHEUS_OUTPUT = """\
# HELP vllm:num_requests_running Number of requests currently running.
# TYPE vllm:num_requests_running gauge
vllm:num_requests_running{model_name="meta-llama/Llama-3.1-8B"} 3
# HELP vllm:num_requests_waiting Number of requests waiting.
# TYPE vllm:num_requests_waiting gauge
vllm:num_requests_waiting{model_name="meta-llama/Llama-3.1-8B"} 1
# HELP vllm:prompt_tokens_total Number of prefill tokens processed.
# TYPE vllm:prompt_tokens_total counter
vllm:prompt_tokens_total{model_name="meta-llama/Llama-3.1-8B"} 15420
# HELP vllm:generation_tokens_total Number of generation tokens.
# TYPE vllm:generation_tokens_total counter
vllm:generation_tokens_total{model_name="meta-llama/Llama-3.1-8B"} 8500
# HELP vllm:time_to_first_token_seconds Histogram of TTFT.
# TYPE vllm:time_to_first_token_seconds histogram
vllm:time_to_first_token_seconds_bucket{le="0.05",model_name="meta-llama/Llama-3.1-8B"} 10
vllm:time_to_first_token_seconds_bucket{le="0.1",model_name="meta-llama/Llama-3.1-8B"} 25
vllm:time_to_first_token_seconds_bucket{le="0.2",model_name="meta-llama/Llama-3.1-8B"} 40
vllm:time_to_first_token_seconds_bucket{le="+Inf",model_name="meta-llama/Llama-3.1-8B"} 50
vllm:time_to_first_token_seconds_sum{model_name="meta-llama/Llama-3.1-8B"} 5.5
vllm:time_to_first_token_seconds_count{model_name="meta-llama/Llama-3.1-8B"} 50
# HELP vllm:request_success_total Number of successful requests.
# TYPE vllm:request_success_total counter
vllm:request_success_total{finished_reason="stop",model_name="meta-llama/Llama-3.1-8B"} 48
vllm:request_success_total{finished_reason="length",model_name="meta-llama/Llama-3.1-8B"} 2
"""


def test_parse_labels():
    labels = parse_labels('model_name="qwen2.5",engine="vllm",workers=4')
    assert labels["model_name"] == "qwen2.5"
    assert labels["engine"] == "vllm"
    assert labels["workers"] == "4"


def test_parse_line_with_scientific_notation():
    metric, labels, val = parse_line('vllm:cpu_cache_usage_perc{instance="worker-1"} 1.25e-02')
    assert metric == "vllm:cpu_cache_usage_perc"
    assert labels["instance"] == "worker-1"
    assert val == pytest.approx(0.0125)


def test_parse_prometheus_text_full():
    parsed = parse_prometheus_text(SAMPLE_PROMETHEUS_OUTPUT)

    # Gauges
    assert "vllm:num_requests_running" in parsed.gauges
    assert parsed.gauges["vllm:num_requests_running"][0].value == 3.0
    assert parsed.gauges["vllm:num_requests_running"][0].labels["model_name"] == "meta-llama/Llama-3.1-8B"

    # Counters: normalizes _total and preserves raw name
    assert "vllm:prompt_tokens" in parsed.counters
    assert "vllm:prompt_tokens_total" in parsed.counters
    assert parsed.counters["vllm:prompt_tokens"][0].value == 15420.0

    # Histograms
    assert "vllm:time_to_first_token_seconds" in parsed.histograms
    hist = parsed.histograms["vllm:time_to_first_token_seconds"][0]
    assert hist.count == 50.0
    assert hist.sum == pytest.approx(5.5)
    assert len(hist.buckets) == 4
    assert hist.buckets[0] == (0.05, 10.0)
    assert hist.buckets[-1] == (float("inf"), 50.0)


# ---------------------------------------------------------------------------
# 2. prom_resolver tests
# ---------------------------------------------------------------------------

def test_resolve_canonical_metrics():
    parsed = parse_prometheus_text(SAMPLE_PROMETHEUS_OUTPUT)
    resolved = resolve_canonical_metrics(parsed)

    canonical = resolved["canonical"]
    caps = resolved["capabilities"]

    assert canonical["requests_running"] == 3
    assert canonical["requests_waiting"] == 1
    assert canonical["prompt_tokens_total"] == 15420.0
    assert canonical["generation_tokens_total"] == 8500.0
    assert canonical["model_name"] == "meta-llama/Llama-3.1-8B"
    assert canonical["finish_reasons"] == {"stop": 48.0, "length": 2.0}

    assert caps["queue"] is True
    assert caps["histograms"] is True
    assert caps["finish_reasons"] is True
    assert caps["token_rates"] is True


def test_resolve_canonical_metrics_alternate_vllm_names():
    sample = """\
# HELP vllm:kv_cache_usage_perc Alternate KV cache name in older vLLM.
# TYPE vllm:kv_cache_usage_perc gauge
vllm:kv_cache_usage_perc 0.455
vllm:num_total_gpu_blocks 2000
"""
    parsed = parse_prometheus_text(sample)
    resolved = resolve_canonical_metrics(parsed)
    canonical = resolved["canonical"]

    assert canonical["kv_cache_usage_pct"] == 45.5
    assert canonical["num_total_gpu_blocks"] == 2000
    # Auto-derived free blocks
    assert canonical["num_free_gpu_blocks"] == int(2000 * (1.0 - 0.455))
    assert resolved["capabilities"]["kv_cache"] is True


# ---------------------------------------------------------------------------
# 3. engine_history tests
# ---------------------------------------------------------------------------

def test_interpolate_percentile():
    # 4 buckets: [0.1: 10, 0.2: 30, 0.4: 50, inf: 50]
    buckets = [(0.1, 10.0), (0.2, 30.0), (0.4, 50.0), (float('inf'), 50.0)]
    # Target 50% = count 25 (falls in second bucket 0.1 - 0.2)
    p50 = _interpolate_percentile(buckets, 25.0)
    assert p50 is not None
    # 10 to 30 is span of 20. Target 25 is (25-10)/20 = 0.75 of way from 0.1 to 0.2 -> 0.175
    assert p50 == pytest.approx(0.175)


def test_engine_history_rates_and_counter_reset():
    runtime_id = "test-rt-rates"
    prune_runtime(runtime_id)

    now = time.time()
    # Sample 1 at t=0
    sample1 = {
        "polled_at": now - 10,
        "canonical": {
            "kv_cache_usage_pct": 20.0,
            "requests_running": 1,
            "requests_waiting": 0,
            "prompt_tokens_total": 1000.0,
            "generation_tokens_total": 500.0,
            "finish_reasons": {"stop": 10},
        },
        "histograms": {},
    }
    record_sample(runtime_id, sample1)

    # Sample 2 at t=5 (5 seconds later: +500 in tokens, +250 out tokens)
    sample2 = {
        "polled_at": now - 5,
        "canonical": {
            "kv_cache_usage_pct": 25.0,
            "requests_running": 2,
            "requests_waiting": 1,
            "prompt_tokens_total": 1500.0,
            "generation_tokens_total": 750.0,
            "finish_reasons": {"stop": 15},
        },
        "histograms": {},
    }
    record_sample(runtime_id, sample2)

    history = get_history(runtime_id, window_seconds=60)
    assert history["samples_count"] == 2
    last_point = history["series"][1]

    # Rates: (1500 - 1000) / 5s = 100.0 tok/s in; (750 - 500) / 5s = 50.0 tok/s out
    assert last_point["input_tokens_per_second"] == pytest.approx(100.0, abs=1.0)
    assert last_point["output_tokens_per_second"] == pytest.approx(50.0, abs=1.0)
    assert history["summary"]["finish_reasons_delta"] == {"stop": 5}

    # Sample 3 at t=0 with counter RESET (vLLM process restart, counters reset to 100)
    sample3 = {
        "polled_at": now,
        "canonical": {
            "kv_cache_usage_pct": 5.0,
            "requests_running": 0,
            "requests_waiting": 0,
            "prompt_tokens_total": 100.0,
            "generation_tokens_total": 50.0,
            "finish_reasons": {"stop": 1},
        },
        "histograms": {},
    }
    record_sample(runtime_id, sample3)

    history_reset = get_history(runtime_id, window_seconds=60)
    # The third point should NOT output negative rates due to counter reset protection
    reset_point = history_reset["series"][2]
    assert reset_point["input_tokens_per_second"] is None

    prune_runtime(runtime_id)


# ---------------------------------------------------------------------------
# 4. API Endpoints: engine-stats & engine-stats/history
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_api_engine_stats_history_endpoint():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    runtime_id = "test-rt-api"
    prune_runtime(runtime_id)

    # Seed history with 2 samples
    t0 = time.time()
    record_sample(runtime_id, {
        "polled_at": t0 - 5,
        "canonical": {
            "kv_cache_usage_pct": 30.0,
            "requests_running": 1,
            "requests_waiting": 0,
            "prompt_tokens_total": 200.0,
            "generation_tokens_total": 100.0,
        },
        "histograms": {},
    })
    record_sample(runtime_id, {
        "polled_at": t0,
        "canonical": {
            "kv_cache_usage_pct": 35.0,
            "requests_running": 2,
            "requests_waiting": 0,
            "prompt_tokens_total": 450.0,
            "generation_tokens_total": 250.0,
        },
        "histograms": {},
    })

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/monitoring/engine-stats/history?runtime_id={runtime_id}&window=15m")
        assert resp.status_code == 200
        data = resp.json()

        assert data["runtime_id"] == runtime_id
        assert data["window"] == "15m"
        assert "capabilities" in data
        assert len(data["series"]) == 2
        assert data["series"][1]["kv_cache_usage_pct"] == 35.0
        assert data["series"][1]["input_tokens_per_second"] > 0

    prune_runtime(runtime_id)
