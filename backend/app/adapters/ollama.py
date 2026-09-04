"""
Ollama runtime adapter.
Ollama API reference: https://github.com/ollama/ollama/blob/main/docs/api.md
"""
import json
import time
import httpx
from typing import AsyncIterator, Optional

from app.adapters.base import RuntimeAdapter, GenerateRequest, GenerateResponse, StreamChunk


class OllamaAdapter(RuntimeAdapter):

    async def health_check(self, client: Optional[httpx.AsyncClient] = None) -> tuple[bool, str]:
        try:
            t0 = time.perf_counter()
            async with self.get_client(client, default_timeout=10.0) as http_client:
                resp = await http_client.get(f"{self.endpoint}/api/tags")
            latency_ms = (time.perf_counter() - t0) * 1000
            if resp.status_code == 200:
                return True, f"Healthy — {latency_ms:.0f}ms"
            return False, f"HTTP {resp.status_code}"
        except Exception as e:
            return False, str(e)

    async def list_models(self, client: Optional[httpx.AsyncClient] = None) -> list[dict]:
        async with self.get_client(client, default_timeout=30.0) as http_client:
            resp = await http_client.get(f"{self.endpoint}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("models", []):
                details = m.get("details", {})
                models.append({
                    "id": m.get("name", ""),
                    "name": m.get("name", ""),
                    "size": m.get("size"),
                    "format": details.get("format"),
                    "family": details.get("family"),
                    "parameter_size": details.get("parameter_size"),
                    "quantization_level": details.get("quantization_level"),
                    "modified_at": m.get("modified_at"),
                })
            return models

    async def generate(
        self,
        request: GenerateRequest,
        client: Optional[httpx.AsyncClient] = None,
    ) -> GenerateResponse:
        payload = self._build_payload(request, stream=False)
        async with self.get_client(client, default_timeout=300.0) as http_client:
            resp = await http_client.post(f"{self.endpoint}/api/generate", json=payload)
            resp.raise_for_status()
            data = resp.json()
            return GenerateResponse(
                content=data.get("response", ""),
                prompt_tokens=data.get("prompt_eval_count"),
                completion_tokens=data.get("eval_count"),
                finish_reason="stop" if data.get("done") else None,
                raw=data,
            )

    async def generate_stream(
        self,
        request: GenerateRequest,
        client: Optional[httpx.AsyncClient] = None,
    ) -> AsyncIterator[StreamChunk]:
        payload = self._build_payload(request, stream=True)
        is_first = True
        async with self.get_client(client, default_timeout=300.0) as http_client:
            async with http_client.stream("POST", f"{self.endpoint}/api/generate", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    done = chunk.get("done", False)
                    delta = chunk.get("response", "")
                    yield StreamChunk(
                        delta=delta,
                        is_first=is_first,
                        is_last=done,
                        prompt_tokens=chunk.get("prompt_eval_count") if done else None,
                        completion_tokens=chunk.get("eval_count") if done else None,
                    )
                    is_first = False
                    if done:
                        break

    def _build_payload(self, request: GenerateRequest, stream: bool) -> dict:
        payload = {
            "model": request.model,
            "prompt": request.prompt,
            "stream": stream,
            "options": {
                "temperature": request.temperature,
                "num_predict": request.max_tokens,
                "top_p": request.top_p,
                "top_k": request.top_k,
            },
        }
        if request.system_prompt:
            payload["system"] = request.system_prompt
        if request.seed is not None:
            payload["options"]["seed"] = request.seed
        return payload
