"""
OpenAI-compatible runtime adapter.
Works with: LM Studio, vLLM, llama.cpp server, OpenAI, Groq, etc.
"""
import json
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

    async def health_check(self) -> tuple[bool, str]:
        try:
            t0 = time.perf_counter()
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.endpoint}/v1/models", headers=self._headers())
            latency_ms = (time.perf_counter() - t0) * 1000
            if resp.status_code == 200:
                return True, f"Healthy — {latency_ms:.0f}ms"
            return False, f"HTTP {resp.status_code}"
        except Exception as e:
            return False, str(e)

    async def list_models(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{self.endpoint}/v1/models", headers=self._headers())
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

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        payload = self._build_payload(request, stream=False)
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
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

    async def generate_stream(self, request: GenerateRequest) -> AsyncIterator[StreamChunk]:
        payload = self._build_payload(request, stream=True)
        is_first = True
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream(
                "POST",
                f"{self.endpoint}/v1/chat/completions",
                json=payload,
                headers=self._headers(),
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or line == "data: [DONE]":
                        if line == "data: [DONE]":
                            yield StreamChunk(delta="", is_last=True)
                        continue
                    if line.startswith("data: "):
                        line = line[6:]
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices", [])
                    if not choices:
                        continue
                    delta_obj = choices[0].get("delta", {})
                    delta = delta_obj.get("content", "")
                    finish = choices[0].get("finish_reason")
                    usage = chunk.get("usage", {})
                    yield StreamChunk(
                        delta=delta,
                        is_first=is_first,
                        is_last=(finish is not None),
                        prompt_tokens=usage.get("prompt_tokens") if finish else None,
                        completion_tokens=usage.get("completion_tokens") if finish else None,
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
        if request.seed is not None:
            payload["seed"] = request.seed
        return payload
