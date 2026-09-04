"""
Benchmark engine: measures single-request LLM performance.

Metrics:
  TTFT         - Time To First Token (streaming only)
  Total Latency - request_start → response_end
  Generation tok/s - completion_tokens / generation_time
  E2E tok/s    - completion_tokens / total_time
"""
import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Optional
import numpy as np

from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters import get_adapter
from app.adapters.base import GenerateRequest
from app.models.benchmark import BenchmarkRun, BenchmarkResult
from app.core.config import settings
from app.monitoring.collector import collect_metrics

# Predefined prompts for each scenario
SCENARIO_PROMPTS = {
    "short": "What is the capital of France?",
    "medium": (
        "Explain the concept of machine learning in simple terms. "
        "Include what it is, how it works, and give two real-world examples."
    ),
    "long": (
        "Write a comprehensive guide on building a production-ready REST API. "
        "Cover: API design principles, authentication, rate limiting, error handling, "
        "logging, monitoring, database design, caching strategies, CI/CD, and deployment. "
        "Include code examples for each section using Python and FastAPI."
    ),
    "rag": (
        "Based on the following context, answer the question precisely.\n\n"
        "Context: The Eiffel Tower was built between 1887 and 1889 as the entrance arch "
        "for the 1889 World's Fair. It was designed by engineer Gustave Eiffel and stands "
        "330 metres tall. It is located on the Champ de Mars in Paris, France.\n\n"
        "Question: When was the Eiffel Tower built and how tall is it?"
    ),
    "conversation": (
        "You are a helpful assistant. The user has been asking about Python programming.\n\n"
        "User: I'm learning Python. What are list comprehensions?\n"
        "Assistant: List comprehensions provide a concise way to create lists...\n"
        "User: Can you show me an example that filters even numbers from a list?"
    ),
    "json": (
        "Return a JSON object with the following fields: name (string), age (integer), "
        "email (string), skills (array of strings with 3 items). "
        "Respond ONLY with valid JSON, no explanation."
    ),
    "streaming": (
        "Tell me an interesting story about a robot who discovers emotions for the first time. "
        "Make it detailed and engaging, at least 3 paragraphs."
    ),
}


async def run_benchmark(
    run_id: str,
    runtime_type: str,
    endpoint: str,
    api_key: Optional[str],
    model: str,
    scenario: str,
    prompt: Optional[str],
    system_prompt: Optional[str],
    temperature: float,
    max_tokens: int,
    num_runs: int,
    use_streaming: bool,
    db: AsyncSession,
    broadcast_fn=None,
):
    """Execute benchmark runs and persist results to DB."""
    actual_prompt = prompt or SCENARIO_PROMPTS.get(scenario, SCENARIO_PROMPTS["medium"])
    adapter = get_adapter(runtime_type, endpoint, api_key)

    results = []
    latencies = []
    ttfts = []

    for i in range(num_runs):
        result = await _run_single(
            run_id=run_id,
            run_index=i,
            adapter=adapter,
            model=model,
            prompt=actual_prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            use_streaming=use_streaming,
            db=db,
        )
        results.append(result)
        if result.total_latency_ms:
            latencies.append(result.total_latency_ms)
        if result.ttft_ms:
            ttfts.append(result.ttft_ms)

        # Broadcast progress
        if broadcast_fn:
            await broadcast_fn({
                "type": "benchmark_progress",
                "run_id": run_id,
                "completed": i + 1,
                "total": num_runs,
                "result": {
                    "ttft_ms": result.ttft_ms,
                    "total_latency_ms": result.total_latency_ms,
                    "generation_tokens_per_second": result.generation_tokens_per_second,
                    "error": result.error,
                },
            })

    # Compute aggregates
    arr = np.array(latencies) if latencies else np.array([])
    avg_ttft = float(np.mean(ttfts)) if ttfts else None
    avg_lat = float(np.mean(arr)) if len(arr) > 0 else None
    p50 = float(np.percentile(arr, 50)) if len(arr) > 0 else None
    p95 = float(np.percentile(arr, 95)) if len(arr) > 0 else None
    p99 = float(np.percentile(arr, 99)) if len(arr) > 0 else None

    valid_tps = [r.generation_tokens_per_second for r in results if r.generation_tokens_per_second]
    valid_e2e = [r.e2e_tokens_per_second for r in results if r.e2e_tokens_per_second]
    valid_pt = [r.prompt_tokens for r in results if r.prompt_tokens]
    valid_ct = [r.completion_tokens for r in results if r.completion_tokens]
    valid_powers = [r.power_watts for r in results if r.power_watts is not None and r.power_watts > 0]
    avg_power = float(np.mean(valid_powers)) if valid_powers else None
    avg_gen_tps = float(np.mean(valid_tps)) if valid_tps else None

    tokens_per_watt = None
    if avg_gen_tps and avg_power and avg_power > 0:
        tokens_per_watt = float(avg_gen_tps / avg_power)

    quality_passed = sum(1 for r in results if r.quality_valid and not r.error)
    quality_rate = float(quality_passed / len(results)) if results else 1.0

    return {
        "avg_ttft_ms": avg_ttft,
        "avg_total_latency_ms": avg_lat,
        "avg_generation_tokens_per_second": avg_gen_tps,
        "avg_e2e_tokens_per_second": float(np.mean(valid_e2e)) if valid_e2e else None,
        "avg_prompt_tokens": float(np.mean(valid_pt)) if valid_pt else None,
        "avg_completion_tokens": float(np.mean(valid_ct)) if valid_ct else None,
        "p50_latency_ms": p50,
        "p95_latency_ms": p95,
        "p99_latency_ms": p99,
        "avg_power_watts": avg_power,
        "tokens_per_watt": tokens_per_watt,
        "quality_integrity_rate": quality_rate,
    }


async def _run_single(
    run_id: str,
    run_index: int,
    adapter,
    model: str,
    prompt: str,
    system_prompt: Optional[str],
    temperature: float,
    max_tokens: int,
    use_streaming: bool,
    db: AsyncSession,
) -> BenchmarkResult:
    request = GenerateRequest(
        model=model,
        prompt=prompt,
        system_prompt=system_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=use_streaming,
    )

    result_id = str(uuid.uuid4())
    ttft_ms = None
    total_latency_ms = 0.0
    completion_tokens = None
    prompt_tokens = None
    generation_tokens_per_second = None
    e2e_tokens_per_second = None
    error = None
    raw = None

    power_watts = None
    quality_valid = True
    full_text = ""

    try:
        # Sample hardware before execution
        hw_before = collect_metrics()
        if hw_before.get("gpu_count", 0) > 0 and hw_before.get("gpus"):
            p0 = hw_before["gpus"][0].get("power_draw_watts")
            if p0:
                power_watts = float(p0)

        t_start = time.perf_counter()

        if use_streaming:
            first_token_time = None
            content_parts = []
            async for chunk in adapter.generate_stream(request):
                if chunk.delta and first_token_time is None:
                    first_token_time = time.perf_counter()
                content_parts.append(chunk.delta)
                if chunk.is_last:
                    prompt_tokens = chunk.prompt_tokens
                    completion_tokens = chunk.completion_tokens

            t_end = time.perf_counter()
            total_time = t_end - t_start
            full_text = "".join(content_parts)

            if first_token_time:
                ttft_ms = (first_token_time - t_start) * 1000
                gen_time = t_end - first_token_time
                if completion_tokens and gen_time > 0:
                    generation_tokens_per_second = completion_tokens / gen_time

        else:
            response = await adapter.generate(request)
            t_end = time.perf_counter()
            total_time = t_end - t_start
            prompt_tokens = response.prompt_tokens
            completion_tokens = response.completion_tokens
            full_text = response.content or ""
            raw = response.raw

        total_latency_ms = total_time * 1000
        if completion_tokens and total_time > 0:
            e2e_tokens_per_second = completion_tokens / total_time

        # Validate output quality (non-empty & format check)
        if not full_text.strip():
            quality_valid = False
        elif "json" in prompt.lower():
            try:
                # Basic json extract check
                clean = full_text.strip()
                if clean.startswith("```json"):
                    clean = clean[7:]
                if clean.startswith("```"):
                    clean = clean[3:]
                if clean.endswith("```"):
                    clean = clean[:-3]
                json.loads(clean.strip())
            except Exception:
                quality_valid = False

        # Post-sample power to average
        hw_after = collect_metrics()
        if hw_after.get("gpu_count", 0) > 0 and hw_after.get("gpus"):
            p1 = hw_after["gpus"][0].get("power_draw_watts")
            if p1:
                power_watts = float((power_watts + p1) / 2) if power_watts else float(p1)

    except Exception as e:
        t_end = time.perf_counter()
        total_latency_ms = (t_end - t_start) * 1000
        error = str(e)
        quality_valid = False

    db_result = BenchmarkResult(
        id=result_id,
        run_id=run_id,
        run_index=run_index,
        ttft_ms=ttft_ms,
        total_latency_ms=total_latency_ms,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        generation_tokens_per_second=generation_tokens_per_second,
        e2e_tokens_per_second=e2e_tokens_per_second,
        power_watts=power_watts,
        quality_valid=quality_valid,
        error=error,
        raw_response=raw,
    )
    db.add(db_result)
    await db.flush()
    return db_result
