"""
Logging Proxy for Live Traffic (Phase 4).

Exposes an OpenAI-compatible API surface per registered runtime so that any
client (OpenWebUI, LM Studio relay, VS Code Copilot, curl …) can point to
DynoLLM instead of the engine directly.  Every request is recorded as a
RequestTrace with source='proxy' **without buffering the stream** — the tee
is done in an async generator so bytes are forwarded to the client at the
same time they are accumulated for trace capture.

Endpoints
---------
GET  /api/proxy/{runtime_id}/info                 → proxy info / URL helper
GET  /api/proxy/{runtime_id}/v1/models            → passthrough model list
POST /api/proxy/{runtime_id}/v1/chat/completions  → streaming / non-streaming
POST /api/proxy/{runtime_id}/v1/completions       → legacy text completions
"""
import json
import time
import logging
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.runtime import Runtime
from app.services.trace_service import record_trace

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/proxy", tags=["proxy"])

# --------------------------------------------------------------------------- #
#  Helpers                                                                      #
# --------------------------------------------------------------------------- #

PROXY_TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=10.0)


async def _get_runtime(runtime_id: str, db: AsyncSession) -> Runtime:
    result = await db.execute(select(Runtime).where(Runtime.id == runtime_id))
    runtime = result.scalar_one_or_none()
    if not runtime:
        raise HTTPException(status_code=404, detail=f"Runtime '{runtime_id}' not found")
    return runtime


def _upstream_headers(runtime: Runtime, original_headers: Dict[str, str]) -> Dict[str, str]:
    """Build headers to forward to the upstream engine."""
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if runtime.api_key:
        headers["Authorization"] = f"Bearer {runtime.api_key}"
    # Pass through useful headers the client may have set
    for h in ("accept", "x-request-id", "x-forwarded-for"):
        if h in original_headers:
            headers[h] = original_headers[h]
    return headers


def _engine_url(runtime: Runtime, path: str) -> str:
    """Map a /v1/… path to the engine's actual URL."""
    base = runtime.endpoint.rstrip("/")
    if runtime.runtime_type == "ollama":
        # Ollama speaks its own API; for proxy mode we talk to it via its
        # OpenAI-compat shim (available since Ollama 0.1.24).
        return f"{base}{path}"
    return f"{base}{path}"


# --------------------------------------------------------------------------- #
#  SSE / JSON parsing utilities                                                 #
# --------------------------------------------------------------------------- #

def _extract_sse_delta(line: str) -> Optional[str]:
    """Return the text delta from a single SSE data: … line, or None."""
    if not line.startswith("data: "):
        return None
    payload = line[len("data: "):].strip()
    if payload in ("", "[DONE]"):
        return None
    try:
        chunk = json.loads(payload)
    except json.JSONDecodeError:
        return None

    # chat completions format
    choices = chunk.get("choices") or []
    if choices:
        return (choices[0].get("delta") or {}).get("content") or (choices[0].get("text") or "")
    # legacy text completions format
    return chunk.get("text") or ""


def _extract_usage(chunk: Dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
    """Pull prompt/completion tokens from a usage dict inside a chunk."""
    usage = chunk.get("usage") or {}
    return usage.get("prompt_tokens"), usage.get("completion_tokens")


def _extract_finish_reason(chunk: Dict[str, Any]) -> Optional[str]:
    choices = chunk.get("choices") or []
    if choices:
        return choices[0].get("finish_reason")
    return chunk.get("finish_reason")


# --------------------------------------------------------------------------- #
#  Core tee-stream                                                              #
# --------------------------------------------------------------------------- #

async def _tee_stream(
    response: httpx.Response,
    trace_state: Dict[str, Any],
) -> AsyncIterator[bytes]:
    """
    Iterate over the upstream streaming response, yielding each raw chunk to
    the HTTP client while simultaneously accumulating trace metadata.

    trace_state is mutated in-place; caller reads it after the generator is
    exhausted.
    """
    full_text_parts: list[str] = []
    first_chunk = True

    async for line_bytes in response.aiter_lines():
        line = line_bytes.strip() if isinstance(line_bytes, str) else line_bytes.decode(errors="replace").strip()

        # Forward the raw SSE line
        yield (line + "\n\n" if line else "\n").encode()

        # Capture TTFT on first non-empty content chunk
        if first_chunk and line.startswith("data: ") and line != "data: [DONE]":
            payload = line[len("data: "):].strip()
            if payload and payload != "[DONE]":
                try:
                    chunk = json.loads(payload)
                    choices = chunk.get("choices") or []
                    has_content = bool(
                        choices and (
                            (choices[0].get("delta") or {}).get("content")
                            or choices[0].get("text")
                        )
                    )
                    if has_content:
                        trace_state["ttft_ms"] = (time.perf_counter() - trace_state["t0"]) * 1000
                        first_chunk = False
                except Exception:
                    pass

        # Accumulate text
        delta = _extract_sse_delta(line)
        if delta:
            full_text_parts.append(delta)

        # Capture usage / finish_reason from terminal chunk
        if line.startswith("data: ") and line != "data: [DONE]":
            try:
                chunk = json.loads(line[len("data: "):])
                pt, ct = _extract_usage(chunk)
                if pt is not None:
                    trace_state["prompt_tokens"] = pt
                if ct is not None:
                    trace_state["completion_tokens"] = ct
                fr = _extract_finish_reason(chunk)
                if fr:
                    trace_state["finish_reason"] = fr
            except Exception:
                pass

    trace_state["output_text"] = "".join(full_text_parts)
    trace_state["total_latency_ms"] = (time.perf_counter() - trace_state["t0"]) * 1000


# --------------------------------------------------------------------------- #
#  Routes                                                                       #
# --------------------------------------------------------------------------- #

@router.get("/{runtime_id}/info")
async def proxy_info(runtime_id: str, db: AsyncSession = Depends(get_db)):
    """Return connection info and the proxy base URL for a runtime."""
    runtime = await _get_runtime(runtime_id, db)
    from app.core.config import settings  # avoid circular at module level

    # The proxy base URL is the DynoLLM backend URL + /api/proxy/<id>
    # We can't know the public hostname from within FastAPI, so we return a
    # template that the frontend can fill with BASE_URL.
    return {
        "runtime_id": runtime.id,
        "runtime_name": runtime.name,
        "runtime_type": runtime.runtime_type,
        "upstream_endpoint": runtime.endpoint,
        "proxy_base_path": f"/api/proxy/{runtime.id}",
        "openai_compat_base": f"/api/proxy/{runtime.id}/v1",
        "store_prompt_content": settings.STORE_PROMPT_CONTENT,
    }


@router.get("/{runtime_id}/v1/models")
async def proxy_models(runtime_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Forward GET /v1/models to the upstream engine and return its response."""
    runtime = await _get_runtime(runtime_id, db)
    url = _engine_url(runtime, "/v1/models")
    headers = _upstream_headers(runtime, dict(request.headers))
    async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Upstream unreachable: {e}")


@router.api_route(
    "/{runtime_id}/v1/chat/completions",
    methods=["POST"],
    response_class=StreamingResponse,
)
async def proxy_chat_completions(
    runtime_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """
    Transparent proxy for POST /v1/chat/completions.

    Supports both streaming (stream=true) and non-streaming (stream=false).
    A RequestTrace is recorded after every successful response.
    """
    runtime = await _get_runtime(runtime_id, db)
    body_bytes = await request.body()

    try:
        body = json.loads(body_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    is_stream = body.get("stream", False)
    model = body.get("model", "unknown")

    # Extract prompt text for tracing
    messages = body.get("messages") or []
    prompt_text = " ".join(
        m.get("content", "") for m in messages if isinstance(m.get("content"), str)
    )

    url = _engine_url(runtime, "/v1/chat/completions")
    headers = _upstream_headers(runtime, dict(request.headers))

    t0 = time.perf_counter()
    started_at = datetime.now(timezone.utc)
    trace_state: Dict[str, Any] = {
        "t0": t0,
        "ttft_ms": None,
        "total_latency_ms": None,
        "prompt_tokens": None,
        "completion_tokens": None,
        "finish_reason": None,
        "output_text": None,
        "error": None,
    }

    async def _record(error_msg: Optional[str] = None):
        """Persist trace after request completes."""
        total_ms = (time.perf_counter() - t0) * 1000 if trace_state["total_latency_ms"] is None else trace_state["total_latency_ms"]
        ttft = trace_state["ttft_ms"]
        ct = trace_state["completion_tokens"] or 0
        tpot_ms = None
        if ttft is not None and ct > 1:
            tpot_ms = (total_ms - ttft) / (ct - 1)
        try:
            await record_trace(db, {
                "source": "proxy",
                "runtime_id": runtime.id,
                "model": model,
                "started_at": started_at,
                "prompt_text": prompt_text,
                "output_text": trace_state.get("output_text"),
                "prompt_tokens": trace_state.get("prompt_tokens"),
                "completion_tokens": ct,
                "finish_reason": trace_state.get("finish_reason"),
                "ttft_ms": ttft,
                "tpot_ms": tpot_ms,
                "total_latency_ms": total_ms,
                "error": error_msg or trace_state.get("error"),
                "params": {
                    "temperature": body.get("temperature"),
                    "max_tokens": body.get("max_tokens"),
                    "top_p": body.get("top_p"),
                    "stream": is_stream,
                },
            })
        except Exception as exc:
            logger.warning(f"proxy: trace persist failed: {exc}")

    # ------------------------------------------------------------------ #
    #  Streaming                                                           #
    # ------------------------------------------------------------------ #
    if is_stream:
        async def stream_gen():
            try:
                async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
                    async with client.stream(
                        "POST", url, headers=headers, content=body_bytes
                    ) as resp:
                        if resp.status_code >= 400:
                            error_body = await resp.aread()
                            trace_state["error"] = f"Upstream HTTP {resp.status_code}"
                            await _record(trace_state["error"])
                            yield (
                                f"data: {json.dumps({'error': trace_state['error']})}\n\n"
                            ).encode()
                            return

                        async for chunk in _tee_stream(resp, trace_state):
                            yield chunk

                await _record()
            except httpx.RequestError as e:
                err = f"Upstream unreachable: {e}"
                trace_state["error"] = err
                await _record(err)
                yield (f"data: {json.dumps({'error': err})}\n\n").encode()

        return StreamingResponse(stream_gen(), media_type="text/event-stream")

    # ------------------------------------------------------------------ #
    #  Non-streaming                                                       #
    # ------------------------------------------------------------------ #
    try:
        async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, content=body_bytes)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        err = f"Upstream HTTP {e.response.status_code}"
        trace_state["error"] = err
        await _record(err)
        raise HTTPException(status_code=e.response.status_code, detail=err)
    except httpx.RequestError as e:
        err = f"Upstream unreachable: {e}"
        trace_state["error"] = err
        await _record(err)
        raise HTTPException(status_code=502, detail=err)

    # Parse non-streaming response for trace fields
    trace_state["total_latency_ms"] = (time.perf_counter() - t0) * 1000
    pt, ct = _extract_usage(data)
    trace_state["prompt_tokens"] = pt
    trace_state["completion_tokens"] = ct or 0
    trace_state["finish_reason"] = _extract_finish_reason(data)
    choices = data.get("choices") or []
    if choices:
        msg = choices[0].get("message") or {}
        trace_state["output_text"] = msg.get("content") or choices[0].get("text") or ""
    await _record()
    return JSONResponse(content=data)


@router.api_route(
    "/{runtime_id}/v1/completions",
    methods=["POST"],
    response_class=StreamingResponse,
)
async def proxy_completions(
    runtime_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """
    Transparent proxy for POST /v1/completions (legacy text completions).

    Delegates to the same logic as chat/completions — prompt_text is taken
    from the 'prompt' key in the body instead of messages.
    """
    runtime = await _get_runtime(runtime_id, db)
    body_bytes = await request.body()

    try:
        body = json.loads(body_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    is_stream = body.get("stream", False)
    model = body.get("model", "unknown")
    prompt_text = body.get("prompt", "")
    if isinstance(prompt_text, list):
        prompt_text = " ".join(str(p) for p in prompt_text)

    url = _engine_url(runtime, "/v1/completions")
    headers = _upstream_headers(runtime, dict(request.headers))

    t0 = time.perf_counter()
    started_at = datetime.now(timezone.utc)
    trace_state: Dict[str, Any] = {
        "t0": t0,
        "ttft_ms": None,
        "total_latency_ms": None,
        "prompt_tokens": None,
        "completion_tokens": None,
        "finish_reason": None,
        "output_text": None,
        "error": None,
    }

    async def _record(error_msg: Optional[str] = None):
        total_ms = (time.perf_counter() - t0) * 1000 if trace_state["total_latency_ms"] is None else trace_state["total_latency_ms"]
        ttft = trace_state["ttft_ms"]
        ct = trace_state["completion_tokens"] or 0
        tpot_ms = (total_ms - ttft) / (ct - 1) if ttft is not None and ct > 1 else None
        try:
            await record_trace(db, {
                "source": "proxy",
                "runtime_id": runtime.id,
                "model": model,
                "started_at": started_at,
                "prompt_text": prompt_text,
                "output_text": trace_state.get("output_text"),
                "prompt_tokens": trace_state.get("prompt_tokens"),
                "completion_tokens": ct,
                "finish_reason": trace_state.get("finish_reason"),
                "ttft_ms": ttft,
                "tpot_ms": tpot_ms,
                "total_latency_ms": total_ms,
                "error": error_msg or trace_state.get("error"),
                "params": {
                    "temperature": body.get("temperature"),
                    "max_tokens": body.get("max_tokens"),
                    "top_p": body.get("top_p"),
                    "stream": is_stream,
                },
            })
        except Exception as exc:
            logger.warning(f"proxy: trace persist failed: {exc}")

    if is_stream:
        async def stream_gen():
            try:
                async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
                    async with client.stream(
                        "POST", url, headers=headers, content=body_bytes
                    ) as resp:
                        if resp.status_code >= 400:
                            trace_state["error"] = f"Upstream HTTP {resp.status_code}"
                            await _record(trace_state["error"])
                            yield (f"data: {json.dumps({'error': trace_state['error']})}\n\n").encode()
                            return
                        async for chunk in _tee_stream(resp, trace_state):
                            yield chunk
                await _record()
            except httpx.RequestError as e:
                err = f"Upstream unreachable: {e}"
                trace_state["error"] = err
                await _record(err)
                yield (f"data: {json.dumps({'error': err})}\n\n").encode()

        return StreamingResponse(stream_gen(), media_type="text/event-stream")

    try:
        async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, content=body_bytes)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        err = f"Upstream HTTP {e.response.status_code}"
        trace_state["error"] = err
        await _record(err)
        raise HTTPException(status_code=e.response.status_code, detail=err)
    except httpx.RequestError as e:
        err = f"Upstream unreachable: {e}"
        trace_state["error"] = err
        await _record(err)
        raise HTTPException(status_code=502, detail=err)

    trace_state["total_latency_ms"] = (time.perf_counter() - t0) * 1000
    pt, ct = _extract_usage(data)
    trace_state["prompt_tokens"] = pt
    trace_state["completion_tokens"] = ct or 0
    trace_state["finish_reason"] = _extract_finish_reason(data)
    choices = data.get("choices") or []
    if choices:
        trace_state["output_text"] = choices[0].get("text") or ""
    await _record()
    return JSONResponse(content=data)
