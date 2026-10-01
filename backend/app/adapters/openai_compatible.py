"""
OpenAI-compatible runtime adapter.
Works with: LM Studio, vLLM, llama.cpp server, OpenAI, Groq, etc.
"""
import json
import re
import time
import httpx
from typing import AsyncIterator, Optional

from app.adapters.base import RuntimeAdapter, GenerateRequest, GenerateResponse, StreamChunk


class OpenAICompatibleAdapter(RuntimeAdapter):

    def _headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def health_check(self, client: Optional[httpx.AsyncClient] = None) -> tuple[bool, str]:
        try:
            t0 = time.perf_counter()
            async with self.get_client(client, default_timeout=10.0) as http_client:
                resp = await http_client.get(f"{self.endpoint}/v1/models", headers=self._headers())
            latency_ms = (time.perf_counter() - t0) * 1000
            if resp.status_code == 200:
                return True, f"Healthy — {latency_ms:.0f}ms"
            return False, f"HTTP {resp.status_code}"
        except Exception as e:
            return False, str(e)

    async def list_models(self, client: Optional[httpx.AsyncClient] = None) -> list[dict]:
        async with self.get_client(client, default_timeout=30.0) as http_client:
            resp = await http_client.get(f"{self.endpoint}/v1/models", headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("data", []):
                models.append({
                    "id": m.get("id", ""),
                    "name": m.get("id", ""),
                    "owned_by": m.get("owned_by"),
                    "created": m.get("created"),
                })
            return models

    async def get_engine_stats(self, client: Optional[httpx.AsyncClient] = None) -> dict:
        """
        Scrape vLLM's Prometheus /metrics endpoint for KV-cache and queue stats.

        Key metrics extracted:
        - vllm:gpu_cache_usage_perc   → KV cache occupancy (0–1)
        - vllm:num_requests_waiting   → requests queued (no slot available)
        - vllm:num_requests_running   → requests actively generating tokens
        - vllm:cache_config_info      → total KV cache blocks (via label)
        - vllm:prefix_cache_hit_rate  → prefix cache reuse ratio (0–1)

        Returns a normalised dict with ``engine="vllm"``.
        Falls back to ``engine="openai_compatible"`` with empty stats if the
        /metrics path returns 404 or is not a vLLM server.
        """
        try:
            async with self.get_client(client, default_timeout=5.0) as http_client:
                resp = await http_client.get(
                    f"{self.endpoint}/metrics",
                    headers={"Accept": "text/plain"},
                )
                if resp.status_code == 404:
                    # Not a vLLM instance; return empty stats
                    return {
                        "engine": "openai_compatible",
                        "models_loaded": [],
                        "kv_cache_usage_pct": None,
                        "requests_waiting": None,
                        "requests_running": None,
                        "prefix_cache_hit_rate": None,
                        "total_vram_gb": None,
                        "capabilities": {
                            "queue": False,
                            "kv_cache": False,
                            "prefix_cache": False,
                            "histograms": False,
                            "finish_reasons": False,
                            "token_rates": False,
                            "block_metrics": False,
                            "model_vram_breakdown": False,
                        },
                        "error": None,
                    }
                resp.raise_for_status()
                text = resp.text
        except Exception as exc:
            return {
                "engine": "vllm",
                "models_loaded": [],
                "kv_cache_usage_pct": None,
                "requests_waiting": None,
                "requests_running": None,
                "prefix_cache_hit_rate": None,
                "total_vram_gb": None,
                "capabilities": {
                    "queue": False,
                    "kv_cache": False,
                    "prefix_cache": False,
                    "histograms": False,
                    "finish_reasons": False,
                    "token_rates": False,
                    "block_metrics": False,
                    "model_vram_breakdown": False,
                },
                "error": str(exc),
            }

        from app.monitoring.prom_parse import parse_prometheus_text
        from app.monitoring.prom_resolver import resolve_canonical_metrics

        parsed = parse_prometheus_text(text)
        resolved = resolve_canonical_metrics(parsed)
        canonical = resolved["canonical"]
        capabilities = resolved["capabilities"]

        # Detect active model name
        models_loaded = []
        if canonical.get("model_name"):
            models_loaded.append({"name": canonical["model_name"]})
        else:
            try:
                models = await self.list_models(client=http_client)
                if models:
                    models_loaded = [{"name": m.get("id") or m.get("name", "")} for m in models]
            except Exception:
                pass

        return {
            "engine": "vllm",
            "models_loaded": models_loaded,
            "kv_cache_usage_pct": canonical.get("kv_cache_usage_pct"),
            "requests_waiting": canonical.get("requests_waiting"),
            "requests_running": canonical.get("requests_running"),
            "prefix_cache_hit_rate": canonical.get("prefix_cache_hit_rate"),
            "num_total_gpu_blocks": canonical.get("num_total_gpu_blocks"),
            "num_free_gpu_blocks": canonical.get("num_free_gpu_blocks"),
            "total_vram_gb": None,  # NVML in collector.py is more accurate for VRAM
            "capabilities": capabilities,
            "canonical": canonical,
            "histograms": resolved["histograms"],
            "error": None,
        }

    async def generate(
        self,
        request: GenerateRequest,
        client: Optional[httpx.AsyncClient] = None,
    ) -> GenerateResponse:
        payload = self._build_payload(request, stream=False)
        async with self.get_client(client, default_timeout=300.0) as http_client:
            resp = await http_client.post(
                f"{self.endpoint}/v1/chat/completions",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            choice = data["choices"][0]
            usage = data.get("usage", {})
            return GenerateResponse(
                content=choice["message"]["content"],
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                finish_reason=choice.get("finish_reason"),
                raw=data,
            )

    async def generate_stream(
        self,
        request: GenerateRequest,
        client: Optional[httpx.AsyncClient] = None,
    ) -> AsyncIterator[StreamChunk]:
        payload = self._build_payload(request, stream=True)
        is_first = True
        chunk_count = 0  # Fix 4: fallback token count when runtime omits usage
        usage_received = False
        async with self.get_client(client, default_timeout=300.0) as http_client:
            async with http_client.stream(
                "POST",
                f"{self.endpoint}/v1/chat/completions",
                json=payload,
                headers=self._headers(),
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or line == "data: [DONE]":
                        if line == "data: [DONE]" and not usage_received:
                            # Fallback only if runtime never sent usage
                            yield StreamChunk(delta="", is_last=True, completion_tokens=chunk_count or None)
                        continue
                    if line.startswith("data: "):
                        line = line[6:]
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices", [])
                    # Issue 1 fix: vLLM (and some other runtimes) may send a trailing
                    # chunk with choices=[] that carries only the usage field.
                    # Previously this was silently skipped, causing prompt_tokens=NULL.
                    # Now we extract usage before continuing so it is never lost.
                    if not choices:
                        usage = chunk.get("usage", {})
                        if usage:
                            usage_received = True
                            yield StreamChunk(
                                delta="",
                                is_last=True,
                                prompt_tokens=usage.get("prompt_tokens"),
                                completion_tokens=usage.get("completion_tokens") or (chunk_count or None),
                            )
                        continue
                    delta_obj = choices[0].get("delta", {})
                    delta = delta_obj.get("content", "")
                    if delta:
                        chunk_count += 1  # Fix 4: count non-empty content chunks
                    finish = choices[0].get("finish_reason")
                    usage = chunk.get("usage", {})
                    if usage:
                        usage_received = True
                    # Fix 4: prefer reported completion_tokens; fall back to chunk_count
                    ct = usage.get("completion_tokens") or (chunk_count if finish else None)
                    yield StreamChunk(
                        delta=delta,
                        is_first=is_first,
                        is_last=(finish is not None),
                        prompt_tokens=usage.get("prompt_tokens") if finish else None,
                        completion_tokens=ct,
                    )
                    is_first = False

    def _build_payload(self, request: GenerateRequest, stream: bool) -> dict:
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.append({"role": "user", "content": request.prompt})
        payload = {
            "model": request.model,
            "messages": messages,
            "stream": stream,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "top_p": request.top_p,
        }
        if stream:
            # Fix 4: Request inline usage from OpenAI-compatible runtimes (vLLM, LM Studio, etc.)
            # Without this, many runtimes omit the 'usage' field in stream chunks entirely.
            payload["stream_options"] = {"include_usage": True}
        if request.seed is not None:
            payload["seed"] = request.seed
        return payload

