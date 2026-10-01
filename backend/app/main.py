"""FastAPI application entry point."""
from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import create_tables
from app.core.auth import verify_api_key, verify_export_api_key
import app.models  # noqa: F401 — ensure all models are registered

from app.api.runtimes import router as runtimes_router
from app.api.benchmarks import router as benchmarks_router
from app.api.load_tests import router as load_tests_router
from app.api.monitoring import router as monitoring_router
from app.api.export import router as export_router
from app.api.prompt_templates import router as prompt_templates_router
from app.api.traces import router as traces_router
from app.api.proxy import router as proxy_router
from app.monitoring import engine_poller

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.API_KEY:
        log.warning(
            "security_notice",
            warning="API_KEY is not set — all endpoints are unauthenticated. Set API_KEY for production/remote deployments.",
        )
    log.info("Starting up — creating database tables")
    await create_tables()
    log.info("Database ready")
    engine_poller.start_poller()
    log.info("Engine stats poller started")
    yield
    log.info("Shutting down")
    engine_poller.stop_poller()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

cors_origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]
if "*" in cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(runtimes_router, dependencies=[Depends(verify_api_key)])
app.include_router(benchmarks_router, dependencies=[Depends(verify_api_key)])
app.include_router(prompt_templates_router, dependencies=[Depends(verify_api_key)])
app.include_router(load_tests_router, dependencies=[Depends(verify_api_key)])
app.include_router(monitoring_router)
app.include_router(export_router, dependencies=[Depends(verify_export_api_key)])
app.include_router(traces_router, dependencies=[Depends(verify_api_key)])
app.include_router(proxy_router)  # No API key guard — accessible to local LLM clients


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/")
async def root():
    return {"name": settings.APP_NAME, "version": settings.APP_VERSION, "docs": "/docs"}
