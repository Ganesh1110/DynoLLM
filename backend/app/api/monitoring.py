"""Monitoring API routes with WebSocket streaming."""
import asyncio
import json
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.monitoring.collector import collect_metrics
from app.monitoring.engine_poller import get_all_engine_stats
from app.monitoring.engine_history import get_history
from app.api.websocket_manager import manager
from app.schemas.monitoring import HardwareMetrics
from app.core.config import settings
from app.core.auth import verify_api_key, verify_ws_api_key

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


@router.get("/current", response_model=HardwareMetrics, dependencies=[Depends(verify_api_key)])
async def get_current_metrics():
    """Snapshot of current hardware metrics."""
    return collect_metrics()


@router.get("/engine-stats", dependencies=[Depends(verify_api_key)])
async def get_engine_stats():
    """
    Cached engine-level stats for all active runtimes.

    Data is refreshed every 5 seconds by the background engine poller.
    Returns an empty list if no runtimes have been polled yet.

    Each element contains engine-specific fields:
    - Ollama: models_loaded (list), total_vram_gb, capabilities
    - vLLM: kv_cache_usage_pct, requests_waiting, requests_running, prefix_cache_hit_rate, capabilities
    """
    return {"runtimes": get_all_engine_stats()}


@router.get("/engine-stats/history", dependencies=[Depends(verify_api_key)])
async def get_engine_stats_history(runtime_id: str, window: str = "15m"):
    """
    Get derived telemetry series (rates, percentiles, averages) and capabilities for a runtime.
    Window can be '5m', '15m', '1h' (or an integer duration in seconds).
    """
    window_sec = 900
    w = window.strip().lower()
    if w.endswith("m"):
        try:
            window_sec = int(w[:-1]) * 60
        except ValueError:
            pass
    elif w.endswith("h"):
        try:
            window_sec = int(w[:-1]) * 3600
        except ValueError:
            pass
    elif w.endswith("s"):
        try:
            window_sec = int(w[:-1])
        except ValueError:
            pass
    else:
        try:
            window_sec = int(w)
        except ValueError:
            pass

    history_data = get_history(runtime_id, window_seconds=max(30, min(window_sec, 3600)))

    latest_runtimes = get_all_engine_stats()
    runtime_stat = next((r for r in latest_runtimes if str(r.get("runtime_id")) == runtime_id), None)
    capabilities = runtime_stat.get("capabilities", {}) if runtime_stat else {}

    return {
        "runtime_id": runtime_id,
        "window": window,
        "window_seconds": window_sec,
        "capabilities": capabilities,
        **history_data,
    }


@router.get("/engine-stats/run/{run_id}")
async def get_engine_stats_for_run(run_id: str):
    """Return engine telemetry samples recorded during a specific benchmark or load test run."""
    from app.monitoring.engine_history import get_history_for_run
    return get_history_for_run(run_id)


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
