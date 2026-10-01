"""
Phase 5 — Run Linking & Polish Tests.

Verifies:
1. set_active_run_for_runtime and get_active_run_for_runtime.
2. Active run tagging in record_sample.
3. get_history_for_run returns sorted series and derived summaries.
4. GET /api/monitoring/engine-stats/run/{run_id} API endpoint.
"""
import pytest
import time
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.monitoring.engine_history import (
    record_sample,
    set_active_run_for_runtime,
    get_active_run_for_runtime,
    get_history_for_run,
    _history_buffers,
)


@pytest.mark.asyncio
async def test_active_run_registration_and_sample_tagging():
    runtime_id = "rt-test-p5"
    run_id = "bench-test-p5-001"

    # Initially None
    assert get_active_run_for_runtime(runtime_id) is None

    # Register run
    set_active_run_for_runtime(runtime_id, run_id)
    assert get_active_run_for_runtime(runtime_id) == run_id

    # Record sample while run is active
    sample_data = {
        "polled_at": time.time(),
        "canonical": {
            "kv_cache_usage_pct": 74.2,
            "requests_running": 4,
            "requests_waiting": 2,
            "prefix_cache_hit_rate": 0.35,
        },
        "histograms": {},
    }
    record_sample(runtime_id, sample_data)

    # Verify last sample was tagged with run_id
    buf = _history_buffers.get(runtime_id)
    assert buf is not None
    assert len(buf) > 0
    last_sample = buf[-1]
    assert last_sample.run_id == run_id
    assert last_sample.gauges["kv_cache_usage_pct"] == 74.2

    # Clear active run
    set_active_run_for_runtime(runtime_id, None)
    assert get_active_run_for_runtime(runtime_id) is None

    # Next sample should have no run_id
    sample_data_2 = {
        "polled_at": time.time() + 5,
        "canonical": {
            "kv_cache_usage_pct": 50.0,
            "requests_running": 1,
            "requests_waiting": 0,
        },
        "histograms": {},
    }
    record_sample(runtime_id, sample_data_2)
    assert buf[-1].run_id is None


@pytest.mark.asyncio
async def test_get_history_for_run_aggregation():
    runtime_id = "rt-test-p5-agg"
    run_id = "lt-test-p5-123"

    set_active_run_for_runtime(runtime_id, run_id)
    t0 = time.time()

    # Record 3 samples
    record_sample(runtime_id, {
        "polled_at": t0,
        "canonical": {"kv_cache_usage_pct": 40.0, "requests_running": 2, "requests_waiting": 0},
    })
    record_sample(runtime_id, {
        "polled_at": t0 + 5,
        "canonical": {"kv_cache_usage_pct": 88.5, "requests_running": 8, "requests_waiting": 6},
    })
    record_sample(runtime_id, {
        "polled_at": t0 + 10,
        "canonical": {"kv_cache_usage_pct": 92.0, "requests_running": 10, "requests_waiting": 12},
    })
    set_active_run_for_runtime(runtime_id, None)

    history = get_history_for_run(run_id)
    assert history["run_id"] == run_id
    assert history["samples_count"] == 3
    assert len(history["series"]) == 3

    # Check summary values
    summary = history["summary"]
    assert summary["max_kv_cache_usage_pct"] == 92.0
    assert summary["max_requests_waiting"] == 12
    assert summary["max_requests_running"] == 10


@pytest.mark.asyncio
async def test_api_engine_stats_for_run():
    runtime_id = "rt-test-p5-api"
    run_id = "bench-api-p5"

    set_active_run_for_runtime(runtime_id, run_id)
    record_sample(runtime_id, {
        "polled_at": time.time(),
        "canonical": {"kv_cache_usage_pct": 65.0, "requests_running": 3, "requests_waiting": 1},
    })
    set_active_run_for_runtime(runtime_id, None)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get(f"/api/monitoring/engine-stats/run/{run_id}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["run_id"] == run_id
    assert data["samples_count"] >= 1
    assert data["summary"]["max_kv_cache_usage_pct"] >= 65.0
