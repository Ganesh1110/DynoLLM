"""Monitoring API routes with WebSocket streaming."""
import asyncio
import json
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.monitoring.collector import collect_metrics
from app.api.websocket_manager import manager
from app.schemas.monitoring import HardwareMetrics
from app.core.config import settings
from app.core.auth import verify_api_key, verify_ws_api_key

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


@router.get("/current", response_model=HardwareMetrics, dependencies=[Depends(verify_api_key)])
async def get_current_metrics():
    """Snapshot of current hardware metrics."""
    return collect_metrics()


@router.websocket("/stream")
async def monitoring_stream(websocket: WebSocket, _auth: Optional[str] = Depends(verify_ws_api_key)):
    """WebSocket endpoint that streams hardware + event metrics at 1Hz."""
    await manager.connect(websocket)
    try:
        while True:
            metrics = collect_metrics()
            try:
                await websocket.send_text(json.dumps({"type": "hardware", **metrics}, default=str))
            except Exception:
                break
            # Also listen for client messages (ping/close)
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=settings.MONITORING_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                pass
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)


@router.websocket("/events")
async def events_stream(websocket: WebSocket, _auth: Optional[str] = Depends(verify_ws_api_key)):
    """WebSocket endpoint for benchmark/load-test events only (no hardware polling)."""
    await manager.connect(websocket)
    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
