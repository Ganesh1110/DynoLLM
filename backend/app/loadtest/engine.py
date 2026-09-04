"""
Async load testing engine.

Patterns:
  - constant  : N concurrent users for duration
  - rampup    : gradually increase from 1 to target_users
  - spike     : instant jump to target_users
  - stress    : keep increasing until error rate or latency thresholds are exceeded

Uses asyncio + httpx with persistent connection pooling for high-concurrency HTTP generation.
"""
import asyncio
import json
import time
import uuid
import random
from datetime import datetime, timezone
from typing import Optional, Callable, Awaitable
import numpy as np
import httpx

from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters import get_adapter
from app.adapters.base import GenerateRequest
from app.models.load_test import LoadTestRun, LoadTestResult
from app.core.config import settings
from app.monitoring.collector import collect_metrics

SHORT_PROMPTS = [
    "What is 2 + 2?",
    "Name the capital of Japan.",
    "What color is the sky?",
    "How many days are in a week?",
    "What is the speed of light?",
]

NORMAL_PROMPTS = [
    "Explain the difference between supervised and unsupervised machine learning.",
    "What are the benefits of using Docker for software development?",
    "Describe the water cycle in nature.",
    "How does HTTPS encryption work?",
    "What is the difference between RAM and ROM?",
]

LONG_PROMPTS = [
    (
        "Write a detailed technical guide on designing a scalable microservices architecture. "
        "Cover service discovery, load balancing, circuit breakers, distributed tracing, "
        "event-driven communication, database per service pattern, and observability."
    ),
    (
        "Explain in depth how transformer neural networks work. Include attention mechanisms, "
        "multi-head attention, positional encoding, encoder-decoder architecture, "
        "and how BERT and GPT differ in their design objectives."
    ),
]

TRANSIENT_EXCEPTIONS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.WriteError,
    ConnectionResetError,
    ConnectionRefusedError,
)

CRASH_SIGNATURES = [
    "cuda out of memory",
    "out of memory",
    "failed to allocate memory",
    "internal server error",
    "model crashed",
    "segmentation fault",
]

_ACTIVE_RUNS: dict[str, bool] = {}  # run_id -> should_continue


def stop_run(run_id: str):
    _ACTIVE_RUNS[run_id] = False


def _pick_prompt(prompt_mix: Optional[dict]) -> str:
    mix = prompt_mix or {"short": 0.3, "normal": 0.5, "long": 0.2}
    r = random.random()
    if r < mix.get("short", 0.3):
        return random.choice(SHORT_PROMPTS)
    elif r < mix.get("short", 0.3) + mix.get("normal", 0.5):
        return random.choice(NORMAL_PROMPTS)
    else:
        return random.choice(LONG_PROMPTS)


def _validate_quality(prompt: str, full_text: str, success: bool, timed_out: bool) -> bool:
    if not success or timed_out:
        return False
    stripped = full_text.strip()
    if not stripped:
        return False
    lowered = stripped.lower()
    if any(sig in lowered for sig in CRASH_SIGNATURES):
        return False
    if "json" in prompt.lower():
        try:
            clean = stripped
            if clean.startswith("```json"):
                clean = clean[7:]
            elif clean.startswith("```"):
                clean = clean[3:]
            if clean.endswith("```"):
                clean = clean[:-3]
            json.loads(clean.strip())
            return True
        except Exception:
            return False
    return True


async def _single_request(
    adapter,
    model: str,
    prompt: str,
    system_prompt: Optional[str],
    temperature: float,
    max_tokens: int,
    timeout: float,
    concurrent_users: int,
    run_id: str,
    db: AsyncSession,
) -> LoadTestResult:
    request = GenerateRequest(
        model=model,
        prompt=prompt,
        system_prompt=system_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )

    ttft_ms = None
    total_latency_ms = 0.0
    completion_tokens = None
    generation_tokens_per_second = None
    success = True
    error = None
    timed_out = False
    is_transient_error = False
    full_text = ""

    max_attempts = 2  # 1 initial + 1 quick retry on transient socket drop
    for attempt in range(1, max_attempts + 1):
        ttft_ms = None
        completion_tokens = None
        generation_tokens_per_second = None
        success = True
        error = None
        timed_out = False
        is_transient_error = False
        content_parts = []
        t_start = time.perf_counter()

        try:
            first_token_time = None
            async with asyncio.timeout(timeout):
                async for chunk in adapter.generate_stream(request):
                    if chunk.delta:
                        if first_token_time is None:
                            first_token_time = time.perf_counter()
                        content_parts.append(chunk.delta)
                    if chunk.is_last:
                        completion_tokens = chunk.completion_tokens

            t_end = time.perf_counter()
            total_time = t_end - t_start
            total_latency_ms = total_time * 1000
            full_text = "".join(content_parts)

            if first_token_time:
                ttft_ms = (first_token_time - t_start) * 1000
                gen_time = t_end - first_token_time
                if completion_tokens and gen_time > 0:
                    generation_tokens_per_second = completion_tokens / gen_time
            elif completion_tokens and total_time > 0:
                generation_tokens_per_second = completion_tokens / total_time

            # Succeeded without error
            break

        except asyncio.TimeoutError:
            t_end = time.perf_counter()
            total_latency_ms = (t_end - t_start) * 1000
            success = False
            timed_out = True
            error = f"Request timed out after {timeout}s"
            break

        except TRANSIENT_EXCEPTIONS as e:
            t_end = time.perf_counter()
            total_latency_ms = (t_end - t_start) * 1000
            if attempt < max_attempts and _ACTIVE_RUNS.get(run_id, False):
                await asyncio.sleep(0.05 + random.uniform(0, 0.05))
                continue
            success = False
            is_transient_error = True
            error = f"Transient network error ({type(e).__name__}): {e}"
            break

        except Exception as e:
            t_end = time.perf_counter()
            total_latency_ms = (t_end - t_start) * 1000
            success = False
            error = str(e)
            break

    quality_valid = _validate_quality(prompt, full_text, success, timed_out)

    result = LoadTestResult(
        id=str(uuid.uuid4()),
        run_id=run_id,
        concurrent_users=concurrent_users,
        ttft_ms=ttft_ms,
        total_latency_ms=total_latency_ms,
        completion_tokens=completion_tokens,
        generation_tokens_per_second=generation_tokens_per_second,
        success=success,
        quality_valid=quality_valid,
        error=error,
        timed_out=timed_out,
        is_transient_error=is_transient_error,
    )
    db.add(result)
    await db.flush()
    return result


async def run_load_test(
    run_id: str,
    runtime_type: str,
    endpoint: str,
    api_key: Optional[str],
    model: str,
    pattern: str,
    target_users: int,
    duration_seconds: int,
    rampup_step_users: int,
    rampup_step_seconds: int,
    system_prompt: Optional[str],
    prompt_mix: Optional[dict],
    temperature: float,
    max_tokens: int,
    request_timeout: float,
    db: AsyncSession,
    broadcast_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
) -> dict:
    _ACTIVE_RUNS[run_id] = True

    # High-concurrency connection pool
    limits = httpx.Limits(
        max_connections=max(100, target_users * 2),
        max_keepalive_connections=max(50, target_users),
        keepalive_expiry=30.0,
    )
    timeout_cfg = httpx.Timeout(
        timeout=request_timeout,
        connect=10.0,
        read=request_timeout,
        write=10.0,
        pool=30.0,
    )

    async with httpx.AsyncClient(limits=limits, timeout=timeout_cfg) as shared_client:
        adapter = get_adapter(runtime_type, endpoint, api_key, client=shared_client)

        all_results: list[LoadTestResult] = []
        semaphore_holder = [asyncio.Semaphore(1)]
        current_users_holder = [0]
        t_run_start = time.perf_counter()

        async def worker():
            while _ACTIVE_RUNS.get(run_id, False):
                prompt = _pick_prompt(prompt_mix)
                # Hold the semaphore during actual request execution so concurrent in-flight requests are bounded
                async with semaphore_holder[0]:
                    if not _ACTIVE_RUNS.get(run_id, False):
                        break
                    result = await _single_request(
                        adapter=adapter,
                        model=model,
                        prompt=prompt,
                        system_prompt=system_prompt,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        timeout=request_timeout,
                        concurrent_users=current_users_holder[0],
                        run_id=run_id,
                        db=db,
                    )
                all_results.append(result)
                await _broadcast_progress(run_id, all_results, current_users_holder[0], broadcast_fn)

        async def run_with_concurrency(n_users: int, duration: float):
            current_users_holder[0] = n_users
            semaphore_holder[0] = asyncio.Semaphore(n_users)
            tasks = [asyncio.create_task(worker()) for _ in range(n_users)]
            await asyncio.sleep(duration)
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

        runtime_healthy_holder = [True]
        abort_reason_holder = [None]
        power_samples = []

        async def watchdog():
            while _ACTIVE_RUNS.get(run_id, False):
                await asyncio.sleep(2.0)
                if not _ACTIVE_RUNS.get(run_id, False):
                    break
                # Telemetry sample across all GPUs
                hw = collect_metrics()
                total_p = hw.get("total_gpu_power_watts")
                if total_p is None and hw.get("gpus"):
                    powers = [g.get("power_draw_watts") for g in hw["gpus"] if g.get("power_draw_watts") is not None]
                    total_p = sum(powers) if powers else None
                if total_p is not None:
                    power_samples.append(total_p)

                # Runtime health ping
                try:
                    healthy, msg = await asyncio.wait_for(adapter.health_check(), timeout=4.0)
                    if not healthy:
                        runtime_healthy_holder[0] = False
                        abort_reason_holder[0] = f"Runtime health check failed during load: {msg}"
                        _ACTIVE_RUNS[run_id] = False
                        if broadcast_fn:
                            await broadcast_fn({
                                "type": "runtime_health_alert",
                                "run_id": run_id,
                                "status": "unhealthy",
                                "message": abort_reason_holder[0],
                            })
                        break
                except Exception as ex:
                    runtime_healthy_holder[0] = False
                    abort_reason_holder[0] = f"Runtime process unresponsive or crashed: {ex}"
                    _ACTIVE_RUNS[run_id] = False
                    if broadcast_fn:
                        await broadcast_fn({
                            "type": "runtime_health_alert",
                            "run_id": run_id,
                            "status": "crashed",
                            "message": abort_reason_holder[0],
                        })
                    break

        watchdog_task = asyncio.create_task(watchdog())

        try:
            if pattern == "constant":
                await run_with_concurrency(target_users, duration_seconds)

            elif pattern == "rampup":
                users = rampup_step_users
                while users <= target_users and _ACTIVE_RUNS.get(run_id, False):
                    elapsed = time.perf_counter() - t_run_start
                    if elapsed > duration_seconds:
                        break
                    remaining = duration_seconds - elapsed
                    step_dur = min(rampup_step_seconds, remaining)
                    await run_with_concurrency(users, step_dur)
                    users += rampup_step_users
                # Hold at max if time remains
                elapsed = time.perf_counter() - t_run_start
                if elapsed < duration_seconds and _ACTIVE_RUNS.get(run_id, False):
                    await run_with_concurrency(target_users, duration_seconds - elapsed)

            elif pattern == "spike":
                # Warm-up at 5 users for 10s, then spike
                warm_dur = min(10, duration_seconds * 0.2)
                await run_with_concurrency(min(5, target_users), warm_dur)
                remaining = duration_seconds - warm_dur
                if remaining > 0 and _ACTIVE_RUNS.get(run_id, False):
                    await run_with_concurrency(target_users, remaining)

            elif pattern == "stress":
                # Gradually increase; stop if error_rate > 20% or no successful results
                users = rampup_step_users
                while users <= min(target_users, settings.MAX_CONCURRENT_USERS):
                    if not _ACTIVE_RUNS.get(run_id, False):
                        break
                    elapsed = time.perf_counter() - t_run_start
                    if elapsed > duration_seconds:
                        break
                    step_dur = min(rampup_step_seconds, duration_seconds - elapsed)
                    prev_count = len(all_results)
                    await run_with_concurrency(users, step_dur)
                    new_results = all_results[prev_count:]
                    if new_results:
                        fail_rate = sum(1 for r in new_results if not r.success) / len(new_results)
                        if fail_rate > 0.2:  # 20% error rate = stop
                            break
                    users += rampup_step_users

        finally:
            watchdog_task.cancel()
            _ACTIVE_RUNS.pop(run_id, None)

        return _compute_aggregates(
            all_results,
            runtime_healthy=runtime_healthy_holder[0],
            abort_reason=abort_reason_holder[0],
            power_samples=power_samples,
        )


async def _broadcast_progress(run_id, all_results, current_users, broadcast_fn):
    if not broadcast_fn or not all_results:
        return
    recent = all_results[-50:]  # last 50 for live stats
    latencies = [r.total_latency_ms for r in recent if r.total_latency_ms]
    ttfts = [r.ttft_ms for r in recent if r.ttft_ms]
    successful = [r for r in recent if r.success]
    failed = len(recent) - len(successful)

    await broadcast_fn({
        "type": "load_test_progress",
        "run_id": run_id,
        "concurrent_users": current_users,
        "total_requests": len(all_results),
        "successful_requests": sum(1 for r in all_results if r.success),
        "failed_requests": sum(1 for r in all_results if not r.success),
        "avg_latency_ms": float(np.mean(latencies)) if latencies else 0,
        "p95_latency_ms": float(np.percentile(latencies, 95)) if len(latencies) >= 2 else None,
        "avg_ttft_ms": float(np.mean(ttfts)) if ttfts else None,
        "error_rate": failed / len(recent) if recent else 0,
    })


def _compute_aggregates(
    all_results: list,
    runtime_healthy: bool = True,
    abort_reason: Optional[str] = None,
    power_samples: Optional[list] = None,
) -> dict:
    if not all_results:
        return {
            "runtime_healthy_throughout": runtime_healthy,
            "abort_reason": abort_reason,
            "quality_integrity_rate": 0.0,
            "safe_max_concurrency": None,
        }

    latencies = [r.total_latency_ms for r in all_results if r.total_latency_ms]
    ttfts = [r.ttft_ms for r in all_results if r.ttft_ms]
    tps_list = [r.generation_tokens_per_second for r in all_results if r.generation_tokens_per_second]
    successful = [r for r in all_results if r.success]
    failed = [r for r in all_results if not r.success]
    timed_out = [r for r in all_results if r.timed_out]
    quality_valid = [r for r in all_results if getattr(r, "quality_valid", True) and r.success]

    arr = np.array(latencies) if latencies else np.array([])

    # Calculate RPS
    if all_results:
        timestamps = [r.timestamp for r in all_results]
        span = (max(timestamps) - min(timestamps)).total_seconds() if len(timestamps) > 1 else 1
        rps = len(all_results) / max(span, 1)
    else:
        rps = 0

    avg_power = float(np.mean(power_samples)) if power_samples else None
    avg_gen_tps = float(np.mean(tps_list)) if tps_list else None
    tokens_per_watt = None
    if avg_gen_tps and avg_power and avg_power > 0:
        tokens_per_watt = float(avg_gen_tps / avg_power)

    # Compute Safe Max Concurrency with Monotonicity Enforcement
    # Group results by concurrency level in ascending order.
    # A concurrency tier C is safe if:
    # 1. Error rate <= 0.05 (<= 5%)
    # 2. Quality integrity rate >= 0.95 (>= 95%)
    # Monotonicity rule: Once an intermediate concurrency tier fails SLA, progression halts.
    # A higher tier cannot mask a lower failing tier (e.g. tier 20 failing cannot be masked by tier 30).
    by_concurrency: dict[int, list] = {}
    for r in all_results:
        cu = r.concurrent_users or 1
        by_concurrency.setdefault(cu, []).append(r)

    safe_max_concurrency = 0 if not successful else 1
    for cu, group in sorted(by_concurrency.items()):
        if not group:
            continue
        n = len(group)
        failed_count = sum(1 for r in group if not r.success)
        err_rate = failed_count / n
        quality_count = sum(1 for r in group if getattr(r, "quality_valid", True) and r.success)
        quality_rate = quality_count / n
        if err_rate <= 0.05 and quality_rate >= 0.95:
            safe_max_concurrency = cu
        else:
            # Monotonicity boundary: stop at the first tier that violated SLA
            break

    return {
        "total_requests": len(all_results),
        "successful_requests": len(successful),
        "failed_requests": len(failed),
        "requests_per_second": rps,
        "error_rate": len(failed) / len(all_results) if all_results else 0,
        "p50_latency_ms": float(np.percentile(arr, 50)) if len(arr) > 0 else None,
        "p90_latency_ms": float(np.percentile(arr, 90)) if len(arr) > 0 else None,
        "p95_latency_ms": float(np.percentile(arr, 95)) if len(arr) > 0 else None,
        "p99_latency_ms": float(np.percentile(arr, 99)) if len(arr) > 0 else None,
        "avg_ttft_ms": float(np.mean(ttfts)) if ttfts else None,
        "p95_ttft_ms": float(np.percentile(ttfts, 95)) if len(ttfts) >= 2 else None,
        "avg_generation_tokens_per_second": avg_gen_tps,
        "max_concurrent_users_reached": max(r.concurrent_users for r in all_results) if all_results else 0,
        "timeout_count": len(timed_out),
        "runtime_healthy_throughout": runtime_healthy,
        "abort_reason": abort_reason,
        "quality_integrity_rate": float(len(quality_valid) / len(all_results)) if all_results else 1.0,
        "avg_power_watts": avg_power,
        "tokens_per_watt": tokens_per_watt,
        "safe_max_concurrency": safe_max_concurrency,
    }
