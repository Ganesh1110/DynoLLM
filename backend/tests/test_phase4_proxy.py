"""
Phase 4 — Logging Proxy tests.

Tests cover:
1. GET /api/proxy/{id}/info — returns proxy metadata
2. GET /api/proxy/{id}/info — 404 for unknown runtime
3. POST /api/proxy/{id}/v1/chat/completions (non-streaming) — forwards + trace
4. POST /api/proxy/{id}/v1/completions (non-streaming) — forwards + trace
5. Error path: upstream 4xx — trace recorded with error field
6. GET /api/proxy/{id}/v1/models — passthrough model list
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.runtime import Runtime
from app.models.request_trace import RequestTrace
from sqlalchemy import select


# ---------------------------------------------------------------------------
# Shared: create a test runtime and clean up afterwards
# ---------------------------------------------------------------------------

_RT_ID = "rt-proxy-test"


async def _ensure_runtime():
    """Idempotently insert the proxy test runtime row."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Runtime).where(Runtime.id == _RT_ID))
        if res.scalar_one_or_none() is None:
            rt = Runtime(
                id=_RT_ID,
                name="Test Proxy Runtime",
                runtime_type="openai_compatible",
                endpoint="http://fake-engine:8000",
                api_key=None,
                notes="phase4 test",
            )
            db.add(rt)
            await db.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_MODELS_PAYLOAD = {
    "object": "list",
    "data": [{"id": "llama3", "object": "model"}],
}

_CHAT_PAYLOAD = {
    "id": "chatcmpl-test",
    "object": "chat.completion",
    "choices": [
        {
            "index": 0,
            "message": {"role": "assistant", "content": "Hello!"},
            "finish_reason": "stop",
        }
    ],
    "usage": {"prompt_tokens": 10, "completion_tokens": 3},
}

_LEGACY_PAYLOAD = {
    "id": "cmpl-test",
    "object": "text_completion",
    "choices": [{"text": "World!", "finish_reason": "stop"}],
    "usage": {"prompt_tokens": 5, "completion_tokens": 2},
}


def _mock_non_streaming_client(payload: dict, status: int = 200):
    """Return a context manager mock that simulates a non-streaming httpx.AsyncClient."""
    from httpx import HTTPStatusError

    resp = MagicMock()
    resp.status_code = status

    # Make json() a normal callable that returns payload
    resp.json.return_value = payload

    if status >= 400:
        resp.raise_for_status.side_effect = HTTPStatusError(
            message=f"HTTP {status}",
            request=MagicMock(),
            response=MagicMock(status_code=status),
        )
    else:
        resp.raise_for_status.return_value = None

    instance = AsyncMock()
    instance.__aenter__ = AsyncMock(return_value=instance)
    instance.__aexit__ = AsyncMock(return_value=False)
    instance.get = AsyncMock(return_value=resp)
    instance.post = AsyncMock(return_value=resp)
    return instance


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_proxy_info_ok():
    await _ensure_runtime()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get(f"/api/proxy/{_RT_ID}/info")
    assert resp.status_code == 200
    data = resp.json()
    assert data["runtime_id"] == _RT_ID
    assert "/v1" in data["openai_compat_base"]
    assert data["runtime_type"] == "openai_compatible"


@pytest.mark.asyncio
async def test_proxy_info_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/proxy/nonexistent-runtime-id/info")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_proxy_models_passthrough():
    await _ensure_runtime()
    mock_instance = _mock_non_streaming_client(_MODELS_PAYLOAD)

    with patch("app.api.proxy.httpx.AsyncClient", return_value=mock_instance):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(f"/api/proxy/{_RT_ID}/v1/models")

    assert resp.status_code == 200
    assert resp.json()["data"][0]["id"] == "llama3"


@pytest.mark.asyncio
async def test_proxy_chat_completions_non_streaming_records_trace():
    """Non-streaming chat completion → engine response forwarded + RequestTrace persisted."""
    await _ensure_runtime()
    mock_instance = _mock_non_streaming_client(_CHAT_PAYLOAD)

    with patch("app.api.proxy.httpx.AsyncClient", return_value=mock_instance):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                f"/api/proxy/{_RT_ID}/v1/chat/completions",
                json={
                    "model": "llama3",
                    "messages": [{"role": "user", "content": "Hello world"}],
                    "stream": False,
                },
            )

    assert resp.status_code == 200
    body = resp.json()
    assert body["choices"][0]["message"]["content"] == "Hello!"

    # Verify trace persisted
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RequestTrace)
            .where(RequestTrace.source == "proxy")
            .where(RequestTrace.runtime_id == _RT_ID)
            .where(RequestTrace.model == "llama3")
        )
        traces = result.scalars().all()

    assert len(traces) >= 1
    t = traces[-1]
    assert t.prompt_tokens == 10
    assert t.completion_tokens == 3
    assert t.finish_reason == "stop"
    assert t.error is None


@pytest.mark.asyncio
async def test_proxy_completions_non_streaming_records_trace():
    """Legacy /v1/completions → forwarded + trace with correct token counts."""
    await _ensure_runtime()
    mock_instance = _mock_non_streaming_client(_LEGACY_PAYLOAD)

    with patch("app.api.proxy.httpx.AsyncClient", return_value=mock_instance):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                f"/api/proxy/{_RT_ID}/v1/completions",
                json={"model": "llama3", "prompt": "Hello", "stream": False},
            )

    assert resp.status_code == 200

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RequestTrace)
            .where(RequestTrace.source == "proxy")
            .where(RequestTrace.completion_tokens == 2)
        )
        traces = result.scalars().all()

    assert len(traces) >= 1


@pytest.mark.asyncio
async def test_proxy_error_path_records_trace_with_error_field():
    """Upstream 400 → HTTP error propagated; trace row records the error."""
    await _ensure_runtime()
    mock_instance = _mock_non_streaming_client({}, status=400)

    with patch("app.api.proxy.httpx.AsyncClient", return_value=mock_instance):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                f"/api/proxy/{_RT_ID}/v1/chat/completions",
                json={"model": "llama3", "messages": [{"role": "user", "content": "hi"}], "stream": False},
            )

    assert resp.status_code == 400

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RequestTrace)
            .where(RequestTrace.source == "proxy")
            .where(RequestTrace.error.isnot(None))
        )
        error_traces = result.scalars().all()

    assert any("400" in (t.error or "") for t in error_traces)
