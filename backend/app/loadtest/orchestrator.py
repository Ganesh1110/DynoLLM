"""
Test Plan Orchestrator — JMeter Thread Group orchestrator equivalent.
Runs one or more ThreadGroups defined in a plan config sequentially,
applies config elements, collects per-group aggregates, then evaluates assertions.
"""
from __future__ import annotations
import asyncio
import uuid as _uuid
import structlog
from typing import Optional, Callable, Awaitable
from dataclasses import dataclass, field

from app.loadtest.engine import run_load_test
from app.loadtest.config_elements import apply_config_elements, PromptPool
from app.loadtest.assertions import evaluate_assertions, AssertionResult
from app.loadtest.listeners import build_listener_reports

log = structlog.get_logger()


@dataclass
class ThreadGroupResult:
    thread_group_id: str
    thread_group_name: str
    aggregates: dict


@dataclass
class PlanRunResult:
    plan_id: str
    run_ids: list[str] = field(default_factory=list)
    thread_group_results: list[ThreadGroupResult] = field(default_factory=list)
    merged_aggregates: dict = field(default_factory=dict)
    assertion_results: list[AssertionResult] = field(default_factory=list)
    listener_reports: dict = field(default_factory=dict)
    overall_passed: bool = True


async def run_plan(
    plan_id: str,
    plan_config: dict,
    broadcast_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
) -> PlanRunResult:
    """
    Execute a test plan: run each thread group sequentially,
    merge aggregates, evaluate assertions, and produce listener reports.
    """
    raw_thread_groups = plan_config.get("thread_groups", [])
    thread_groups = [tg for tg in raw_thread_groups if tg.get("enabled") is not False]
    config_elements = plan_config.get("config_elements", [])
    plan_assertions = plan_config.get("assertions", [])
    active_listeners = plan_config.get("listeners", [
        "summary_table", "latency_chart", "token_throughput",
        "error_log", "percentile_chart",
    ])

    result = PlanRunResult(plan_id=plan_id)

    for tg in thread_groups:
        run_id = str(_uuid.uuid4())
        result.run_ids.append(run_id)

        # Apply config elements to this thread group's config
        tg_config, prompt_pool = apply_config_elements(tg, config_elements)
        think_min = tg_config.get("think_time_min_ms", 0)
        think_max = tg_config.get("think_time_max_ms", 0)

        log.info("plan_thread_group_start", plan_id=plan_id, tg_id=tg.get("id"), run_id=run_id)

        if broadcast_fn:
            await broadcast_fn({
                "type": "plan_thread_group_start",
                "plan_id": plan_id,
                "run_id": run_id,
                "thread_group_id": tg.get("id"),
                "thread_group_name": tg.get("name", "Thread Group"),
            })

        try:
            aggregates = await run_load_test(
                run_id=run_id,
                runtime_type=tg_config["runtime_type"],
                endpoint=tg_config["endpoint"],
                api_key=tg_config.get("api_key"),
                model=tg_config["model"],
                pattern=tg_config.get("pattern", "constant"),
                target_users=tg_config.get("target_users", 10),
                duration_seconds=tg_config.get("duration_seconds", 60),
                rampup_step_users=tg_config.get("rampup_step_users", 5),
                rampup_step_seconds=tg_config.get("rampup_step_seconds", 10),
                system_prompt=tg_config.get("system_prompt"),
                prompt_mix=tg_config.get("prompt_mix"),
                temperature=tg_config.get("temperature", 0.7),
                max_tokens=tg_config.get("max_tokens", 256),
                request_timeout=tg_config.get("request_timeout", 120.0),
                broadcast_fn=broadcast_fn,
                runtime_id=tg_config.get("runtime_id"),
                prompt_pool=prompt_pool,
                think_time_range=(think_min, think_max) if (think_min or think_max) else None,
            )
        except Exception as exc:
            log.error("plan_thread_group_error", plan_id=plan_id, tg_id=tg.get("id"), error=str(exc))
            aggregates = {"error": str(exc)}

        result.thread_group_results.append(ThreadGroupResult(
            thread_group_id=tg.get("id", run_id),
            thread_group_name=tg.get("name", "Thread Group"),
            aggregates=aggregates,
        ))

    # Merge aggregates from all thread groups
    result.merged_aggregates = _merge_aggregates(
        [tgr.aggregates for tgr in result.thread_group_results]
    )

    # Evaluate assertions against merged aggregates
    result.assertion_results = evaluate_assertions(plan_assertions, result.merged_aggregates)
    result.overall_passed = all(ar.passed for ar in result.assertion_results)

    # Build listener reports
    result.listener_reports = build_listener_reports(
        active_listeners=active_listeners,
        thread_group_results=result.thread_group_results,
        merged_aggregates=result.merged_aggregates,
        assertion_results=result.assertion_results,
    )

    return result


def _merge_aggregates(agg_list: list[dict]) -> dict:
    """Merge aggregates from multiple thread groups into one summary dict."""
    if not agg_list:
        return {}
    if len(agg_list) == 1:
        return agg_list[0]

    # Numeric fields we sum
    sum_fields = [
        "total_requests", "successful_requests", "failed_requests",
        "total_prompt_tokens", "total_completion_tokens", "timeout_count",
    ]
    # Numeric fields we average weighted by total_requests
    avg_fields = [
        "avg_ttft_ms", "p95_latency_ms", "p99_latency_ms",
        "avg_generation_tokens_per_second", "quality_integrity_rate",
    ]
    # Fields we take from the last group
    last_fields = ["safe_max_concurrency", "abort_reason", "rampup_budget_warning"]

    merged: dict = {}
    for f in sum_fields:
        vals = [a.get(f) for a in agg_list if a.get(f) is not None]
        merged[f] = sum(vals) if vals else None

    total_reqs = merged.get("total_requests") or 1
    for f in avg_fields:
        vals = [(a.get(f) or 0) * (a.get("total_requests") or 0) for a in agg_list]
        merged[f] = sum(vals) / total_reqs if sum(vals) else None

    for f in last_fields:
        merged[f] = agg_list[-1].get(f)

    failed = merged.get("failed_requests") or 0
    merged["error_rate"] = failed / total_reqs if total_reqs else 0.0
    merged["requests_per_second"] = sum(
        a.get("requests_per_second") or 0 for a in agg_list
    )
    merged["tokens_in_per_second"] = sum(a.get("tokens_in_per_second") or 0 for a in agg_list)
    merged["tokens_out_per_second"] = sum(a.get("tokens_out_per_second") or 0 for a in agg_list)
    merged["total_tokens_per_second"] = sum(a.get("total_tokens_per_second") or 0 for a in agg_list)
    merged["cost_estimate"] = sum(a.get("cost_estimate") or 0.0 for a in agg_list)
    merged["runtime_healthy_throughout"] = all(
        a.get("runtime_healthy_throughout", True) for a in agg_list
    )

    return merged
