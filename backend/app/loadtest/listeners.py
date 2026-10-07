"""
Listener engine — JMeter Listener equivalent.
Each listener produces a structured report section from the run results.
"""
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.loadtest.orchestrator import ThreadGroupResult
    from app.loadtest.assertions import AssertionResult


def build_listener_reports(
    active_listeners: list[str],
    thread_group_results: list,
    merged_aggregates: dict,
    assertion_results: list,
) -> dict:
    """Build all active listener report sections."""
    reports = {}

    if "summary_table" in active_listeners:
        reports["summary_table"] = _summary_table(thread_group_results, merged_aggregates)

    if "latency_chart" in active_listeners:
        reports["latency_chart"] = _latency_chart(thread_group_results)

    if "token_throughput" in active_listeners:
        reports["token_throughput"] = _token_throughput(thread_group_results)

    if "error_log" in active_listeners:
        reports["error_log"] = _error_log(thread_group_results)

    if "percentile_chart" in active_listeners:
        reports["percentile_chart"] = _percentile_chart(thread_group_results)

    if "assertion_report" in active_listeners:
        reports["assertion_report"] = _assertion_report(assertion_results)

    return reports


def _summary_table(thread_group_results: list, merged_aggregates: dict) -> list[dict]:
    """Summary Table listener: per-thread-group row + totals row."""
    rows = []
    for tgr in thread_group_results:
        a = tgr.aggregates
        rows.append({
            "thread_group": tgr.thread_group_name,
            "total_requests": a.get("total_requests"),
            "successful_requests": a.get("successful_requests"),
            "failed_requests": a.get("failed_requests"),
            "error_rate_pct": round((a.get("error_rate") or 0) * 100, 1),
            "avg_latency_ms": a.get("avg_latency_ms"),
            "p50_latency_ms": a.get("p50_latency_ms"),
            "p95_latency_ms": a.get("p95_latency_ms"),
            "p99_latency_ms": a.get("p99_latency_ms"),
            "avg_ttft_ms": a.get("avg_ttft_ms"),
            "p95_ttft_ms": a.get("p95_ttft_ms"),
            "tokens_out_per_second": a.get("tokens_out_per_second"),
            "requests_per_second": a.get("requests_per_second"),
            "quality_integrity_rate": a.get("quality_integrity_rate"),
            "safe_max_concurrency": a.get("safe_max_concurrency"),
        })
    # Totals row (only meaningful when there are multiple thread groups)
    if len(thread_group_results) > 1:
        ma = merged_aggregates
        rows.append({
            "thread_group": "TOTAL",
            "total_requests": ma.get("total_requests"),
            "successful_requests": ma.get("successful_requests"),
            "failed_requests": ma.get("failed_requests"),
            "error_rate_pct": round((ma.get("error_rate") or 0) * 100, 1),
            "avg_latency_ms": ma.get("avg_latency_ms"),
            "p50_latency_ms": ma.get("p50_latency_ms"),
            "p95_latency_ms": ma.get("p95_latency_ms"),
            "p99_latency_ms": ma.get("p99_latency_ms"),
            "avg_ttft_ms": ma.get("avg_ttft_ms"),
            "p95_ttft_ms": ma.get("p95_ttft_ms"),
            "tokens_out_per_second": ma.get("tokens_out_per_second"),
            "requests_per_second": ma.get("requests_per_second"),
            "quality_integrity_rate": ma.get("quality_integrity_rate"),
            "safe_max_concurrency": ma.get("safe_max_concurrency"),
        })
    return rows


def _latency_chart(thread_group_results: list) -> list[dict]:
    """Latency Chart listener: concurrency breakdown data for charting avg + p95 latency."""
    chart_data = []
    for tgr in thread_group_results:
        breakdown = tgr.aggregates.get("concurrency_breakdown") or []
        for row in breakdown:
            chart_data.append({
                "thread_group": tgr.thread_group_name,
                "concurrency": row.get("concurrency"),
                "avg_latency_ms": row.get("avg_ttft_ms"),   # use TTFT as proxy for avg
                "p95_latency_ms": row.get("p95_ttft_ms"),
                "total_requests": row.get("total_requests"),
                "error_rate_pct": row.get("error_rate_pct"),
            })
    return chart_data


def _token_throughput(thread_group_results: list) -> list[dict]:
    """Token Throughput listener: per-group token throughput data."""
    rows = []
    for tgr in thread_group_results:
        a = tgr.aggregates
        rows.append({
            "thread_group": tgr.thread_group_name,
            "tokens_in_per_second": a.get("tokens_in_per_second"),
            "tokens_out_per_second": a.get("tokens_out_per_second"),
            "total_tokens_per_second": a.get("total_tokens_per_second"),
            "total_prompt_tokens": a.get("total_prompt_tokens"),
            "total_completion_tokens": a.get("total_completion_tokens"),
            "input_token_ratio": a.get("input_token_ratio"),
        })
    return rows





def _error_log(thread_group_results: list) -> list[dict]:
    """Error Log listener: grouped error entries from all thread groups."""
    # The engine currently stores abort_reason at the run level.
    # We collect those here per thread group.
    entries = []
    for tgr in thread_group_results:
        abort = tgr.aggregates.get("abort_reason")
        breakdown = tgr.aggregates.get("concurrency_breakdown") or []
        total_failed = sum(r.get("failed_requests", 0) for r in breakdown)
        if abort:
            entries.append({
                "thread_group": tgr.thread_group_name,
                "error_type": "abort",
                "count": 1,
                "message": abort,
            })
        if total_failed > 0:
            entries.append({
                "thread_group": tgr.thread_group_name,
                "error_type": "request_failure",
                "count": total_failed,
                "message": f"{total_failed} requests failed across concurrency tiers",
            })
    return entries


def _percentile_chart(thread_group_results: list) -> list[dict]:
    """Percentile Chart listener: p50/p95/p99 latency per concurrency tier."""
    rows = []
    for tgr in thread_group_results:
        breakdown = tgr.aggregates.get("concurrency_breakdown") or []
        for b in breakdown:
            rows.append({
                "thread_group": tgr.thread_group_name,
                "concurrency": b.get("concurrency"),
                "p95_ttft_ms": b.get("p95_ttft_ms"),
                "avg_ttft_ms": b.get("avg_ttft_ms"),
                "avg_tpot_ms": b.get("avg_tpot_ms"),
                "tokens_per_second": b.get("tokens_per_second"),
                "error_rate_pct": b.get("error_rate_pct"),
            })
    return rows


def _assertion_report(assertion_results: list) -> list[dict]:
    """Assertion Report listener: structured pass/fail list."""
    return [
        {
            "name": ar.name,
            "type": ar.assertion_type,
            "passed": ar.passed,
            "actual_value": ar.actual_value,
            "threshold": ar.threshold,
            "message": ar.message,
        }
        for ar in assertion_results
    ]
