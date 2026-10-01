"""
Canonical Prometheus Metric Resolver.

Maps logical metric concepts to candidate names across vLLM versions
and computes an engine capabilities map.
"""
from typing import Any, Dict, List, Optional
from app.monitoring.prom_parse import ParsedPrometheusMetrics, HistogramMetric


# Canonical candidate mapping across vLLM versions
CANONICAL_METRIC_CANDIDATES = {
    "kv_cache_usage_pct": ["vllm:gpu_cache_usage_perc", "vllm:kv_cache_usage_perc"],
    "requests_running": ["vllm:num_requests_running"],
    "requests_waiting": ["vllm:num_requests_waiting"],
    "prompt_tokens": ["vllm:prompt_tokens", "vllm:prompt_tokens_total"],
    "generation_tokens": ["vllm:generation_tokens", "vllm:generation_tokens_total"],
    "request_success": ["vllm:request_success", "vllm:request_success_total"],
    "time_to_first_token": ["vllm:time_to_first_token_seconds"],
    "time_per_output_token": ["vllm:time_per_output_token_seconds"],
    "e2e_latency": ["vllm:e2e_request_latency_seconds"],
    "prefix_cache_hit_rate": ["vllm:prefix_cache_hit_rate"],
    "num_total_gpu_blocks": ["vllm:num_total_gpu_blocks"],
    "num_free_gpu_blocks": ["vllm:num_free_gpu_blocks"],
}


def _find_scalar(parsed: ParsedPrometheusMetrics, candidate_names: List[str]) -> Optional[float]:
    """Search gauges, counters, and untyped metrics for the first matching scalar value."""
    for name in candidate_names:
        # Check gauges
        if name in parsed.gauges and parsed.gauges[name]:
            return parsed.gauges[name][0].value
        # Check counters
        norm = name[:-6] if name.endswith('_total') else name
        if norm in parsed.counters and parsed.counters[norm]:
            return parsed.counters[norm][0].value
        if name in parsed.counters and parsed.counters[name]:
            return parsed.counters[name][0].value
        # Check untyped
        if name in parsed.untyped and parsed.untyped[name]:
            return parsed.untyped[name][0].value
    return None


def _find_histogram(parsed: ParsedPrometheusMetrics, candidate_names: List[str]) -> Optional[HistogramMetric]:
    """Search histograms for the first matching candidate."""
    for name in candidate_names:
        if name in parsed.histograms and parsed.histograms[name]:
            return parsed.histograms[name][0]
    return None


def resolve_canonical_metrics(parsed: ParsedPrometheusMetrics) -> Dict[str, Any]:
    """
    Resolve canonical telemetry values from parsed Prometheus metrics.
    Returns canonical values and engine capability flags.
    """
    kv_raw = _find_scalar(parsed, CANONICAL_METRIC_CANDIDATES["kv_cache_usage_pct"])
    running_raw = _find_scalar(parsed, CANONICAL_METRIC_CANDIDATES["requests_running"])
    waiting_raw = _find_scalar(parsed, CANONICAL_METRIC_CANDIDATES["requests_waiting"])
    prompt_tokens_raw = _find_scalar(parsed, CANONICAL_METRIC_CANDIDATES["prompt_tokens"])
    gen_tokens_raw = _find_scalar(parsed, CANONICAL_METRIC_CANDIDATES["generation_tokens"])
    prefix_hit_raw = _find_scalar(parsed, CANONICAL_METRIC_CANDIDATES["prefix_cache_hit_rate"])
    total_blocks_raw = _find_scalar(parsed, CANONICAL_METRIC_CANDIDATES["num_total_gpu_blocks"])
    free_blocks_raw = _find_scalar(parsed, CANONICAL_METRIC_CANDIDATES["num_free_gpu_blocks"])

    ttft_hist = _find_histogram(parsed, CANONICAL_METRIC_CANDIDATES["time_to_first_token"])
    tpot_hist = _find_histogram(parsed, CANONICAL_METRIC_CANDIDATES["time_per_output_token"])
    e2e_hist = _find_histogram(parsed, CANONICAL_METRIC_CANDIDATES["e2e_latency"])

    # Finish reason counter samples
    finish_reasons: Dict[str, float] = {}
    success_samples = []
    for cand in CANONICAL_METRIC_CANDIDATES["request_success"]:
        norm = cand[:-6] if cand.endswith('_total') else cand
        samples = parsed.counters.get(norm) or parsed.counters.get(cand) or []
        if samples:
            success_samples = samples
            break

    for s in success_samples:
        reason = s.labels.get("finished_reason") or s.labels.get("reason") or "stop"
        finish_reasons[reason] = s.value

    # Auto-derive free blocks if missing
    if free_blocks_raw is None and total_blocks_raw is not None and kv_raw is not None:
        free_blocks_raw = total_blocks_raw * max(0.0, 1.0 - kv_raw)

    # Detect model name from labels
    model_name = None
    all_samples = [
        sample
        for samples in list(parsed.gauges.values()) + list(parsed.counters.values())
        for sample in samples
    ]
    for s in all_samples:
        if "model_name" in s.labels and s.labels["model_name"]:
            model_name = s.labels["model_name"]
            break

    # Build capabilities
    capabilities = {
        "queue": (running_raw is not None or waiting_raw is not None),
        "kv_cache": (kv_raw is not None),
        "prefix_cache": (prefix_hit_raw is not None),
        "histograms": (ttft_hist is not None or tpot_hist is not None or e2e_hist is not None),
        "finish_reasons": bool(finish_reasons),
        "token_rates": (prompt_tokens_raw is not None or gen_tokens_raw is not None),
        "block_metrics": (total_blocks_raw is not None),
        "model_vram_breakdown": False,
    }

    return {
        "canonical": {
            "kv_cache_usage_pct": round(kv_raw * 100, 1) if kv_raw is not None else None,
            "requests_running": int(running_raw) if running_raw is not None else None,
            "requests_waiting": int(waiting_raw) if waiting_raw is not None else None,
            "prompt_tokens_total": prompt_tokens_raw,
            "generation_tokens_total": gen_tokens_raw,
            "prefix_cache_hit_rate": round(prefix_hit_raw * 100, 1) if prefix_hit_raw is not None else None,
            "num_total_gpu_blocks": int(total_blocks_raw) if total_blocks_raw is not None else None,
            "num_free_gpu_blocks": int(free_blocks_raw) if free_blocks_raw is not None else None,
            "finish_reasons": finish_reasons,
            "model_name": model_name,
        },
        "histograms": {
            "time_to_first_token": ttft_hist,
            "time_per_output_token": tpot_hist,
            "e2e_latency": e2e_hist,
        },
        "capabilities": capabilities,
    }
