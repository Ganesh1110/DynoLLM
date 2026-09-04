"""Runtime management API routes."""
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.runtime import Runtime
from app.schemas.runtime import RuntimeCreate, RuntimeUpdate, RuntimeOut, HealthCheckResult, ModelInfo
from app.adapters import get_adapter

router = APIRouter(prefix="/api/runtimes", tags=["runtimes"])


@router.get("", response_model=list[RuntimeOut])
async def list_runtimes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Runtime).order_by(Runtime.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=RuntimeOut)
async def create_runtime(data: RuntimeCreate, db: AsyncSession = Depends(get_db)):
    runtime = Runtime(**data.model_dump())
    db.add(runtime)
    await db.flush()
    return runtime


@router.get("/{runtime_id}", response_model=RuntimeOut)
async def get_runtime(runtime_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Runtime).where(Runtime.id == runtime_id))
    runtime = result.scalar_one_or_none()
    if not runtime:
        raise HTTPException(status_code=404, detail="Runtime not found")
    return runtime


@router.put("/{runtime_id}", response_model=RuntimeOut)
async def update_runtime(runtime_id: str, data: RuntimeUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Runtime).where(Runtime.id == runtime_id))
    runtime = result.scalar_one_or_none()
    if not runtime:
        raise HTTPException(status_code=404, detail="Runtime not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(runtime, field, value)
    await db.flush()
    return runtime


@router.delete("/{runtime_id}")
async def delete_runtime(runtime_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Runtime).where(Runtime.id == runtime_id))
    runtime = result.scalar_one_or_none()
    if not runtime:
        raise HTTPException(status_code=404, detail="Runtime not found")
    await db.delete(runtime)
    return {"deleted": True}


@router.post("/{runtime_id}/health", response_model=HealthCheckResult)
async def health_check(runtime_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Runtime).where(Runtime.id == runtime_id))
    runtime = result.scalar_one_or_none()
    if not runtime:
        raise HTTPException(status_code=404, detail="Runtime not found")
    adapter = get_adapter(runtime.runtime_type, runtime.endpoint, runtime.api_key)
    t0 = time.perf_counter()
    healthy, message = await adapter.health_check()
    latency_ms = (time.perf_counter() - t0) * 1000
    return HealthCheckResult(healthy=healthy, message=message, latency_ms=latency_ms)


@router.get("/{runtime_id}/models", response_model=list[ModelInfo])
async def list_models(runtime_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Runtime).where(Runtime.id == runtime_id))
    runtime = result.scalar_one_or_none()
    if not runtime:
        raise HTTPException(status_code=404, detail="Runtime not found")
    adapter = get_adapter(runtime.runtime_type, runtime.endpoint, runtime.api_key)
    try:
        models = await adapter.list_models()
        return [ModelInfo(**m) for m in models]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch models: {e}")
