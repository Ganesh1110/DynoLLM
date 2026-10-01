"""
Engine History Ring Buffer & Windowed Telemetry Analytics.

Stores up to 720 samples (~1 hour at 5s sampling interval) per runtime.
Derives windowed rates, average latencies, and histogram percentiles at read time.
"""
from collections import deque
from dataclasses import dataclass, field
import time
from typing import Any, Dict, List, Optional, Tuple


MAX_SAMPLES_PER_RUNTIME = 720  # 720 samples * 5s = 3600s = 1 hour


@dataclass
class EngineSample:
    timestamp: float  # Unix timestamp
    gauges: Dict[str, Optional[float]] = field(default_factory=dict)
    counters: Dict[str, Optional[float]] = field(default_factory=dict)
    histograms: Dict[str, Any] = field(default_factory=dict)
    finish_reasons: Dict[str, float] = field(default_factory=dict)


# In-memory storage: runtime_id -> deque of EngineSample
_history_buffers: Dict[str, deque] = {}


def record_sample(runtime_id: str, sample_data: Dict[str, Any]) -> None:
    """Record a fresh telemetry sample in the runtime's ring buffer."""
    if runtime_id not in _history_buffers:
        _history_buffers[runtime_id] = deque(maxlen=MAX_SAMPLES_PER_RUNTIME)

    canonical = sample_data.get("canonical", {})
    histograms = sample_data.get("histograms", {})

    hist_data = {}
    for h_name, h_obj in histograms.items():
        if h_obj is not None:
            hist_data[h_name] = {
                "sum": getattr(h_obj, "sum", 0.0),
                "count": getattr(h_obj, "count", 0.0),
                "buckets": list(getattr(h_obj, "buckets", [])),
            }

    sample = EngineSample(
        timestamp=sample_data.get("polled_at") or time.time(),
        gauges={
            "kv_cache_usage_pct": canonical.get("kv_cache_usage_pct"),
            "requests_running": canonical.get("requests_running"),
            "requests_waiting": canonical.get("requests_waiting"),
            "prefix_cache_hit_rate": canonical.get("prefix_cache_hit_rate"),
            "num_total_gpu_blocks": canonical.get("num_total_gpu_blocks"),
            "num_free_gpu_blocks": canonical.get("num_free_gpu_blocks"),
        },
        counters={
            "prompt_tokens_total": canonical.get("prompt_tokens_total"),
            "generation_tokens_total": canonical.get("generation_tokens_total"),
        },
        histograms=hist_data,
        finish_reasons=dict(canonical.get("finish_reasons") or {}),
    )

    _history_buffers[runtime_id].append(sample)


def prune_runtime(runtime_id: str) -> None:
    """Evict a runtime's history buffer when deleted or deactivated."""
    _history_buffers.pop(runtime_id, None)


def _interpolate_percentile(
    delta_buckets: List[Tuple[float, float]],
    target_count: float,
) -> Optional[float]:
    """
    Calculate percentile via linear interpolation across delta histogram buckets.
    delta_buckets: list of (le, cumulative_count) sorted by le ascending.
    """
    if not delta_buckets or target_count <= 0:
        return None

    prev_le = 0.0
    prev_count = 0.0

    for le, cum_count in delta_buckets:
        if cum_count >= target_count:
            bucket_count = cum_count - prev_count
            if bucket_count <= 0 or le == float('inf'):
                return prev_le
            fraction = (target_count - prev_count) / bucket_count
            return prev_le + fraction * (le - prev_le)
        prev_le = le
        prev_count = cum_count

    return prev_le


def get_history(runtime_id: str, window_seconds: int = 900) -> Dict[str, Any]:
    """
    Query windowed telemetry time series and aggregated summary.
    Window defaults to 15m (900 seconds). Supports any positive duration (e.g. 300, 900, 3600).
    """
    buffer = _history_buffers.get(runtime_id)
    if not buffer or len(buffer) < 1:
        return {
            "runtime_id": runtime_id,
            "window_seconds": window_seconds,
            "series": [],
            "summary": {},
        }

    cutoff = time.time() - window_seconds
    window_samples = [s for s in buffer if s.timestamp >= cutoff]

    if not window_samples:
        window_samples = list(buffer)[-1:]  # Fallback to latest sample if all older

    series = []
    prev: Optional[EngineSample] = None

    for curr in window_samples:
        point: Dict[str, Any] = {
            "timestamp": curr.timestamp,
            "time": time.strftime("%H:%M:%S", time.localtime(curr.timestamp)),
            "kv_cache_usage_pct": curr.gauges.get("kv_cache_usage_pct"),
            "requests_running": curr.gauges.get("requests_running"),
            "requests_waiting": curr.gauges.get("requests_waiting"),
            "prefix_cache_hit_rate": curr.gauges.get("prefix_cache_hit_rate"),
            "input_tokens_per_second": None,
            "output_tokens_per_second": None,
            "avg_ttft_ms": None,
            "p95_ttft_ms": None,
            "avg_tpot_ms": None,
            "p95_tpot_ms": None,
            "avg_e2e_ms": None,
            "p95_e2e_ms": None,
        }

        if prev is not None:
            dt = curr.timestamp - prev.timestamp
            if dt > 0.001:
                # Token rates (Δcounter / Δt) with counter reset handling
                curr_in = curr.counters.get("prompt_tokens_total")
                prev_in = prev.counters.get("prompt_tokens_total")
                if curr_in is not None and prev_in is not None and curr_in >= prev_in:
                    point["input_tokens_per_second"] = round((curr_in - prev_in) / dt, 1)

                curr_out = curr.counters.get("generation_tokens_total")
                prev_out = prev.counters.get("generation_tokens_total")
                if curr_out is not None and prev_out is not None and curr_out >= prev_out:
                    point["output_tokens_per_second"] = round((curr_out - prev_out) / dt, 1)

                # Histograms: TTFT, TPOT, E2E
                for h_key, prefix in [
                    ("time_to_first_token", "ttft"),
                    ("time_per_output_token", "tpot"),
                    ("e2e_latency", "e2e"),
                ]:
                    curr_h = curr.histograms.get(h_key)
                    prev_h = prev.histograms.get(h_key)
                    if curr_h and prev_h:
                        d_count = curr_h["count"] - prev_h["count"]
                        d_sum = curr_h["sum"] - prev_h["sum"]
                        if d_count > 0 and d_sum >= 0:
                            avg_ms = (d_sum / d_count) * 1000.0
                            point[f"avg_{prefix}_ms"] = round(avg_ms, 1)

                            # Calculate delta buckets
                            prev_b_map = dict(prev_h.get("buckets", []))
                            delta_buckets = []
                            for le, cum_c in curr_h.get("buckets", []):
                                p_c = prev_b_map.get(le, 0.0)
                                delta_buckets.append((le, max(0.0, cum_c - p_c)))

                            p95_sec = _interpolate_percentile(delta_buckets, 0.95 * d_count)
                            if p95_sec is not None:
                                point[f"p95_{prefix}_ms"] = round(p95_sec * 1000.0, 1)

        series.append(point)
        prev = curr

    # Window Summary: total delta requests and finish reason breakdown
    summary: Dict[str, Any] = {}
    if len(window_samples) >= 2:
        first, last = window_samples[0], window_samples[-1]
        reasons_summary = {}
        for r_key, last_val in last.finish_reasons.items():
            first_val = first.finish_reasons.get(r_key, 0.0)
            delta = max(0, int(last_val - first_val))
            reasons_summary[r_key] = delta
        summary["finish_reasons_delta"] = reasons_summary

    return {
        "runtime_id": runtime_id,
        "window_seconds": window_seconds,
        "samples_count": len(series),
        "series": series,
        "summary": summary,
    }
