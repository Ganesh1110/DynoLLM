"""
API Key authentication dependency.

If `settings.API_KEY` is not set (default), all requests pass through without auth.
If `settings.API_KEY` is set, requests must supply either:
  - Header: `X-API-Key: <key>`
  - Header: `Authorization: Bearer <key>`

Security Notice (Issue 14):
Standard REST endpoints do NOT accept authentication via URL query parameters
(?token=), preventing credentials from leaking into server access logs, web proxies,
and browser history.
Only file export downloads (where browser <a href> cannot send custom headers) and
WebSockets (where browser WebSocket API does not allow custom headers) permit query tokens.
"""
from typing import Optional
from fastapi import Security, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
http_bearer = HTTPBearer(auto_error=False)


async def verify_api_key(
    header_key: Optional[str] = Security(api_key_header),
    bearer_creds: Optional[HTTPAuthorizationCredentials] = Security(http_bearer),
) -> Optional[str]:
    """Verify API key from HTTP headers only (X-API-Key or Bearer token).

    Issue 14 fix: Query parameters (?token=) are removed from standard REST routes to
    prevent credentials from leaking via URLs into server access logs and browser history.
    """
    # If no API key is configured on the server, auth is disabled (zero-config local dev)
    if not settings.API_KEY:
        return None

    # Check X-API-Key header
    if header_key and header_key == settings.API_KEY:
        return header_key

    # Check Bearer token
    if bearer_creds and bearer_creds.credentials == settings.API_KEY:
        return bearer_creds.credentials

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing API key. Supply 'X-API-Key' or 'Authorization: Bearer <key>'.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def verify_export_api_key(
    header_key: Optional[str] = Security(api_key_header),
    bearer_creds: Optional[HTTPAuthorizationCredentials] = Security(http_bearer),
    token: Optional[str] = Query(None),
) -> Optional[str]:
    """Verify API key for file export download endpoints.

    Prefers request headers, but accepts ?token= query parameter strictly for
    browser anchor downloads (<a href>) where client cannot set request headers.
    """
    if not settings.API_KEY:
        return None

    # Check query-param token (strictly for browser anchor downloads)
    if token and token == settings.API_KEY:
        return token

    # Check X-API-Key header
    if header_key and header_key == settings.API_KEY:
        return header_key

    # Check Bearer token
    if bearer_creds and bearer_creds.credentials == settings.API_KEY:
        return bearer_creds.credentials

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing API key. Supply 'X-API-Key', 'Authorization: Bearer <key>', or '?token='.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def verify_ws_api_key(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    api_key: Optional[str] = Query(None),
) -> Optional[str]:
    """Verify API key for WebSocket connections.

    Allows connection if settings.API_KEY is not set.
    If set, checks:
      - Header: `X-API-Key`
      - Header: `Authorization: Bearer <key>`
      - Query param fallback: `token` or `api_key` (browser WS API does not allow headers)
    """
    if not settings.API_KEY:
        return None

    key = token or api_key or websocket.headers.get("x-api-key")
    if not key:
        auth_header = websocket.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            key = auth_header[7:].strip()

    if key and key == settings.API_KEY:
        return key

    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    raise WebSocketDisconnect(code=status.WS_1008_POLICY_VIOLATION)
