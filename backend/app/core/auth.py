"""
API Key authentication dependency.

If `settings.API_KEY` is not set (default), all requests pass through without auth.
If `settings.API_KEY` is set, requests must supply either:
  - Header: `X-API-Key: <key>`
  - Header: `Authorization: Bearer <key>`
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
    # Fix 7b: also accept ?token= query param so browser anchor downloads work
    token: Optional[str] = Query(None),
) -> Optional[str]:
    # If no API key is configured on the server, auth is disabled (zero-config local dev)
    if not settings.API_KEY:
        return None

    # Check query-param token (used by browser downloads where headers can't be set)
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
        detail="Invalid or missing API key. Supply 'X-API-Key' or 'Authorization: Bearer <key>'.",
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
      - Query param: `token` or `api_key`
      - Header: `X-API-Key`
      - Header: `Authorization: Bearer <key>`
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

