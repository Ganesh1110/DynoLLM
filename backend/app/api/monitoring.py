"""Monitoring API routes with WebSocket streaming."""
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.monitoring.collector import collect_metrics
from app.api.websocket_manager import manager
from app.schemas.monitoring import HardwareMetrics
from app.core.config import settings

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


@router.get("/current", response_model=HardwareMetrics)
async def get_current_metrics():
    """Snapshot of current hardware metrics."""
    return collect_metrics()


@router.websocket("/stream")
async def monitoring_stream(websocket: WebSocket):
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
async def events_stream(websocket: WebSocket):
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
