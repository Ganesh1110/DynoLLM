"""FastAPI application entry point."""
from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import create_tables
import app.models  # noqa: F401 — ensure all models are registered

from app.api.runtimes import router as runtimes_router
from app.api.benchmarks import router as benchmarks_router
from app.api.load_tests import router as load_tests_router
from app.api.monitoring import router as monitoring_router
from app.api.export import router as export_router

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting up — creating database tables")
    await create_tables()
    log.info("Database ready")
    yield
    log.info("Shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(runtimes_router)
app.include_router(benchmarks_router)
app.include_router(load_tests_router)
app.include_router(monitoring_router)
app.include_router(export_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/")
async def root():
    return {"name": settings.APP_NAME, "version": settings.APP_VERSION, "docs": "/docs"}
