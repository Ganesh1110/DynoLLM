"""
Assertion evaluator — JMeter Assertion equivalent.
Each assertion checks one metric from the aggregate results dict and reports pass/fail.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class AssertionResult:
    name: str
    assertion_type: str
    passed: bool
    actual_value: Optional[float]
    threshold: float
    message: str


def evaluate_assertions(
    plan_assertions: list[dict],
    aggregates: dict,
    group_results: Optional[list] = None,
) -> list[AssertionResult]:
    """
    Evaluate a list of assertion configs against the aggregated run results.
    Supports plan-wide ('all') as well as per-thread-group assertions ('scope': tg_id or tg_name).
    Returns a list of AssertionResult objects.
    """
    results: list[AssertionResult] = []

    for a in plan_assertions:
        if a.get("enabled") is False:
            continue
        atype = a.get("type", "")
        scope = a.get("scope", "all")
        target_aggregates = aggregates
        scope_prefix = ""

        if scope and scope not in ("all", "plan") and group_results:
            matching_tg = next(
                (gr for gr in group_results if getattr(gr, "thread_group_id", None) == scope or getattr(gr, "thread_group_name", None) == scope),
                None
            )
            if matching_tg:
                target_aggregates = matching_tg.aggregates
                scope_prefix = f"[{matching_tg.thread_group_name}] "

        base_name = a.get("name", atype)
        full_name = f"{scope_prefix}{base_name}" if scope_prefix and not base_name.startswith("[") else base_name

        if atype in ("latency", "p95_latency"):
            threshold = float(a.get("p95_max_ms", 2000))
            actual = target_aggregates.get("p95_latency_ms")
            passed = actual is not None and actual <= threshold
            results.append(AssertionResult(
                name=full_name,
                assertion_type="latency",
                passed=passed,
                actual_value=actual,
                threshold=threshold,
                message=(
                    f"p95 latency {actual:.0f}ms ≤ {threshold:.0f}ms ✓" if passed
                    else (f"p95 latency {actual:.0f}ms > {threshold:.0f}ms ✗" if actual is not None else "No latency data")
                ),
            ))

        elif atype == "p99_latency":
            threshold = float(a.get("p99_max_ms", 3500))
            actual = target_aggregates.get("p99_latency_ms")
            passed = actual is not None and actual <= threshold
            results.append(AssertionResult(
                name=full_name,
                assertion_type=atype,
                passed=passed,
                actual_value=actual,
                threshold=threshold,
                message=(
                    f"p99 latency {actual:.0f}ms ≤ {threshold:.0f}ms ✓" if passed
                    else (f"p99 latency {actual:.0f}ms > {threshold:.0f}ms ✗" if actual is not None else "No p99 latency data")
                ),
            ))

        elif atype == "error_rate":
            threshold = float(a.get("max_pct", 5))
            actual_rate = target_aggregates.get("error_rate")
            actual = round(actual_rate * 100, 2) if actual_rate is not None else None
            passed = actual is not None and actual <= threshold
            results.append(AssertionResult(
                name=full_name,
                assertion_type=atype,
                passed=passed,
                actual_value=actual,
                threshold=threshold,
                message=(
                    f"Error rate {actual:.1f}% ≤ {threshold:.1f}% ✓" if passed
                    else (f"Error rate {actual:.1f}% > {threshold:.1f}% ✗" if actual is not None else "No error data")
                ),
            ))

        elif atype == "quality":
            threshold = float(a.get("min_rate", 0.95))
            actual = target_aggregates.get("quality_integrity_rate")
            passed = actual is not None and actual >= threshold
            results.append(AssertionResult(
                name=full_name,
                assertion_type=atype,
                passed=passed,
                actual_value=actual,
                threshold=threshold,
                message=(
                    f"Quality rate {actual:.1%} ≥ {threshold:.1%} ✓" if passed
                    else (f"Quality rate {actual:.1%} < {threshold:.1%} ✗" if actual is not None else "No quality data")
                ),
            ))

        elif atype == "ttft":
            threshold = float(a.get("max_ms", 1000))
            actual = target_aggregates.get("avg_ttft_ms")
            passed = actual is not None and actual <= threshold
            results.append(AssertionResult(
                name=full_name,
                assertion_type=atype,
                passed=passed,
                actual_value=actual,
                threshold=threshold,
                message=(
                    f"Avg TTFT {actual:.0f}ms ≤ {threshold:.0f}ms ✓" if passed
                    else (f"Avg TTFT {actual:.0f}ms > {threshold:.0f}ms ✗" if actual is not None else "No TTFT data")
                ),
            ))

        elif atype == "tokens_per_second":
            threshold = float(a.get("min_tps", 10))
            actual = target_aggregates.get("total_tokens_per_second")
            passed = actual is not None and actual >= threshold
            results.append(AssertionResult(
                name=full_name,
                assertion_type=atype,
                passed=passed,
                actual_value=actual,
                threshold=threshold,
                message=(
                    f"Token/s {actual:.1f} ≥ {threshold:.1f} ✓" if passed
                    else (f"Token/s {actual:.1f} < {threshold:.1f} ✗" if actual is not None else "No throughput data")
                ),
            ))

    return results
