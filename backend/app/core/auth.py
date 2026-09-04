"""
API Key authentication dependency.

If `settings.API_KEY` is not set (default), all requests pass through without auth.
If `settings.API_KEY` is set, requests must supply either:
  - Header: `X-API-Key: <key>`
  - Header: `Authorization: Bearer <key>`
"""
from typing import Optional
from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
http_bearer = HTTPBearer(auto_error=False)


async def verify_api_key(
    header_key: Optional[str] = Security(api_key_header),
    bearer_creds: Optional[HTTPAuthorizationCredentials] = Security(http_bearer),
) -> Optional[str]:
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
