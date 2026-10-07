from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


class Base(DeclarativeBase):
    pass


from sqlalchemy.pool import AsyncAdaptedQueuePool, NullPool
from sqlalchemy import event, text

is_sqlite = settings.DATABASE_URL.startswith("sqlite")
engine_kwargs = {
    "echo": settings.DEBUG,
}

if is_sqlite:
    engine_kwargs["connect_args"] = {
        "check_same_thread": False,
        "timeout": 30,
    }
    if ":memory:" not in settings.DATABASE_URL:
        # High-performance async connection pool for file-based SQLite:
        # Prevents reopening file handles on every query and enables concurrent read pooling.
        engine_kwargs["poolclass"] = AsyncAdaptedQueuePool
        engine_kwargs["pool_size"] = 20
        engine_kwargs["max_overflow"] = 30
        engine_kwargs["pool_timeout"] = 30
        engine_kwargs["pool_pre_ping"] = True
        engine_kwargs["pool_recycle"] = 3600
    else:
        engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

if is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            # 1. WAL Mode: High-concurrency Write-Ahead Logging (readers never block writers)
            cursor.execute("PRAGMA journal_mode = WAL")
            # 2. NORMAL Sync: Safe with WAL; minimizes disk fsync latency overhead
            cursor.execute("PRAGMA synchronous = NORMAL")
            # 3. 64MB Cache: -64000 = 64,000 KiB RAM cache (default SQLite cache is only 2MB)
            cursor.execute("PRAGMA cache_size = -64000")
            # 4. In-Memory Temp Tables: Sort operations, GROUP BY, and temp tables execute in RAM
            cursor.execute("PRAGMA temp_store = MEMORY")
            # 5. 256MB MMAP: Zero-copy direct memory-mapped file I/O for lightning-fast reads
            cursor.execute("PRAGMA mmap_size = 268435456")
            # 6. Busy Timeout: Wait up to 30s before throwing database lock errors during bursts
            cursor.execute("PRAGMA busy_timeout = 30000")
            # 7. WAL auto-checkpoint: Prevent unbound WAL file growth
            cursor.execute("PRAGMA wal_autocheckpoint = 1000")
        finally:
            cursor.close()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


from sqlalchemy import text
import uuid
from datetime import datetime, timezone


BUILTIN_TEMPLATES = [
    {
        "id": "builtin-short",
        "name": "Short Prompt",
        "description": "Quick single-turn query for minimal TTFT and prefill latency testing.",
        "scenario": "short",
        "system_prompt": None,
        "prompt": "What is the capital of France?",
        "temperature": 0.7,
        "max_tokens": 128,
        "is_builtin": True,
    },
    {
        "id": "builtin-medium",
        "name": "Machine Learning Overview",
        "description": "Standard prompt (~50 tokens) explaining ML concepts and examples.",
        "scenario": "medium",
        "system_prompt": None,
        "prompt": (
            "Explain the concept of machine learning in simple terms. "
            "Include what it is, how it works, and give two real-world examples."
        ),
        "temperature": 0.7,
        "max_tokens": 512,
        "is_builtin": True,
    },
    {
        "id": "builtin-long",
        "name": "Production REST API Architecture",
        "description": "Deep technical prompt (~200 tokens) with architectural design and code requirements.",
        "scenario": "long",
        "system_prompt": None,
        "prompt": (
            "Write a comprehensive guide on building a production-ready REST API. "
            "Cover: API design principles, authentication, rate limiting, error handling, "
            "logging, monitoring, database design, caching strategies, CI/CD, and deployment. "
            "Include code examples for each section using Python and FastAPI."
        ),
        "temperature": 0.7,
        "max_tokens": 1024,
        "is_builtin": True,
    },
    {
        "id": "builtin-rag",
        "name": "Context-Grounded RAG",
        "description": "Reference context grounding test to evaluate factual adherence and precision.",
        "scenario": "rag",
        "system_prompt": None,
        "prompt": (
            "Based on the following context, answer the question precisely.\n\n"
            "Context: The Eiffel Tower was built between 1887 and 1889 as the entrance arch "
            "for the 1889 World's Fair. It was designed by engineer Gustave Eiffel and stands "
            "330 metres tall. It is located on the Champ de Mars in Paris, France.\n\n"
            "Question: When was the Eiffel Tower built and how tall is it?"
        ),
        "temperature": 0.3,
        "max_tokens": 256,
        "is_builtin": True,
    },
    {
        "id": "builtin-conversation",
        "name": "Multi-turn Assistant",
        "description": "Chat format testing conversational context maintenance.",
        "scenario": "conversation",
        "system_prompt": "You are an expert Python programming assistant.",
        "prompt": (
            "User: I'm learning Python. What are list comprehensions?\n"
            "Assistant: List comprehensions provide a concise way to create lists...\n"
            "User: Can you show me an example that filters even numbers from a list?"
        ),
        "temperature": 0.7,
        "max_tokens": 512,
        "is_builtin": True,
    },
    {
        "id": "builtin-json",
        "name": "Structured JSON Extraction",
        "description": "Strict schema adherence test requiring valid JSON output without conversational markdown.",
        "scenario": "json",
        "system_prompt": None,
        "prompt": (
            "Return a JSON object with the following fields: name (string), age (integer), "
            "email (string), skills (array of strings with 3 items). "
            "Respond ONLY with valid JSON, no explanation."
        ),
        "temperature": 0.2,
        "max_tokens": 256,
        "is_builtin": True,
    },
    {
        "id": "builtin-streaming",
        "name": "Creative Story Generation",
        "description": "Long-form narrative generation testing continuous streaming token cadence.",
        "scenario": "streaming",
        "system_prompt": None,
        "prompt": (
            "Tell me an interesting story about a robot who discovers emotions for the first time. "
            "Make it detailed and engaging, at least 3 paragraphs."
        ),
        "temperature": 0.8,
        "max_tokens": 768,
        "is_builtin": True,
    },
]


def _migrate_columns_sync(conn):
    """Safely check and add any missing columns in SQLite database."""
    # Enable WAL mode for better concurrency: one writer, concurrent readers.
    conn.execute(text("PRAGMA journal_mode=WAL"))
    conn.execute(text("PRAGMA synchronous=NORMAL"))  # safe with WAL; faster than FULL

    # Columns for benchmark_runs
    cur = conn.execute(text("PRAGMA table_info(benchmark_runs)"))
    existing_cols = {row[1] for row in cur.fetchall()}
    bench_cols = [
        ("test_type", "VARCHAR DEFAULT 'standard'"),
        ("context_lengths", "JSON"),
        ("template_id", "VARCHAR"),
        ("avg_quality_score", "FLOAT"),
        ("avg_coherence_score", "FLOAT"),
        ("avg_relevance_score", "FLOAT"),
    ]
    for col_name, col_type in bench_cols:
        if col_name not in existing_cols:
            conn.execute(text(f"ALTER TABLE benchmark_runs ADD COLUMN {col_name} {col_type}"))

    # Columns for benchmark_results
    cur = conn.execute(text("PRAGMA table_info(benchmark_results)"))
    existing_res_cols = {row[1] for row in cur.fetchall()}
    res_cols = [
        ("quality_score", "FLOAT"),
        ("coherence_score", "FLOAT"),
        ("relevance_score", "FLOAT"),
        ("prompt_length_target", "INTEGER"),
    ]
    for col_name, col_type in res_cols:
        if col_name not in existing_res_cols:
            conn.execute(text(f"ALTER TABLE benchmark_results ADD COLUMN {col_name} {col_type}"))

    # Columns for load_test_results
    cur = conn.execute(text("PRAGMA table_info(load_test_results)"))
    existing_lt_res_cols = {row[1] for row in cur.fetchall()}
    lt_res_cols = [
        ("prompt_tokens", "INTEGER"),
    ]
    for col_name, col_type in lt_res_cols:
        if col_name not in existing_lt_res_cols:
            conn.execute(text(f"ALTER TABLE load_test_results ADD COLUMN {col_name} {col_type}"))

    # Columns for load_test_runs
    cur = conn.execute(text("PRAGMA table_info(load_test_runs)"))
    existing_lt_run_cols = {row[1] for row in cur.fetchall()}
    lt_run_cols = [
        ("total_prompt_tokens", "INTEGER"),
        ("total_completion_tokens", "INTEGER"),
        ("avg_prompt_tokens", "FLOAT"),
        ("avg_completion_tokens", "FLOAT"),
        ("tokens_in_per_second", "FLOAT"),
        ("tokens_out_per_second", "FLOAT"),
        ("total_tokens_per_second", "FLOAT"),
        ("input_token_ratio", "FLOAT"),
        ("cost_estimate", "FLOAT"),
        ("concurrency_breakdown", "JSON"),
        # New columns (Issues 5 & 6)
        ("safe_max_concurrency_is_ceiling", "BOOLEAN"),
        ("rampup_budget_warning", "TEXT"),
    ]
    for col_name, col_type in lt_run_cols:
        if col_name not in existing_lt_run_cols:
            conn.execute(text(f"ALTER TABLE load_test_runs ADD COLUMN {col_name} {col_type}"))

    # Ensure load_test_plans table exists (new feature).
    # The table is created by create_all above; no column migration is needed for
    # brand-new tables. This block serves as the placeholder for future column additions.
    cur = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='load_test_plans'")
    )
    if cur.fetchone():
        pass  # table exists; future column migrations go here

    # ─── High-Performance Database Indexes ─────────────────────────────────────────
    # Accelerates lookup by run_id, date range, source, model, and status across all tables.
    perf_indexes = [
        # Load test results & runs
        "CREATE INDEX IF NOT EXISTS ix_load_test_results_run_id ON load_test_results(run_id)",
        "CREATE INDEX IF NOT EXISTS ix_load_test_results_timestamp ON load_test_results(timestamp)",
        "CREATE INDEX IF NOT EXISTS ix_load_test_results_run_ts ON load_test_results(run_id, timestamp)",
        "CREATE INDEX IF NOT EXISTS ix_load_test_results_cu ON load_test_results(concurrent_users)",
        "CREATE INDEX IF NOT EXISTS ix_load_test_runs_created_at ON load_test_runs(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_load_test_runs_runtime_id ON load_test_runs(runtime_id)",
        "CREATE INDEX IF NOT EXISTS ix_load_test_runs_status ON load_test_runs(status)",
        # Benchmark results & runs
        "CREATE INDEX IF NOT EXISTS ix_benchmark_results_run_id ON benchmark_results(run_id)",
        "CREATE INDEX IF NOT EXISTS ix_benchmark_results_created_at ON benchmark_results(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_benchmark_results_run_idx ON benchmark_results(run_id, run_index)",
        "CREATE INDEX IF NOT EXISTS ix_benchmark_runs_created_at ON benchmark_runs(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_benchmark_runs_runtime_id ON benchmark_runs(runtime_id)",
        "CREATE INDEX IF NOT EXISTS ix_benchmark_runs_status ON benchmark_runs(status)",
        # Telemetry snapshots
        "CREATE INDEX IF NOT EXISTS ix_hardware_snapshots_run_id ON hardware_snapshots(run_id)",
        "CREATE INDEX IF NOT EXISTS ix_hardware_snapshots_timestamp ON hardware_snapshots(timestamp)",
        "CREATE INDEX IF NOT EXISTS ix_hardware_snapshots_run_type ON hardware_snapshots(run_type)",
        "CREATE INDEX IF NOT EXISTS ix_hardware_snapshots_run_ts ON hardware_snapshots(run_id, timestamp)",
        # Request traces
        "CREATE INDEX IF NOT EXISTS ix_request_traces_source ON request_traces(source)",
        "CREATE INDEX IF NOT EXISTS ix_request_traces_run_id ON request_traces(run_id)",
        "CREATE INDEX IF NOT EXISTS ix_request_traces_runtime_id ON request_traces(runtime_id)",
        "CREATE INDEX IF NOT EXISTS ix_request_traces_model ON request_traces(model)",
        "CREATE INDEX IF NOT EXISTS ix_request_traces_started_at ON request_traces(started_at)",
        "CREATE INDEX IF NOT EXISTS ix_request_traces_source_started ON request_traces(source, started_at)",
        # Plans & templates
        "CREATE INDEX IF NOT EXISTS ix_load_test_plans_created_at ON load_test_plans(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_prompt_templates_scenario ON prompt_templates(scenario)",
        "CREATE INDEX IF NOT EXISTS ix_prompt_templates_created_at ON prompt_templates(created_at)",
    ]
    for idx_sql in perf_indexes:
        try:
            conn.execute(text(idx_sql))
        except Exception:
            pass

    # Update SQLite query optimizer index statistics
    try:
        conn.execute(text("PRAGMA optimize"))
    except Exception:
        pass

    # Seed default templates if table empty

    cur = conn.execute(text("SELECT COUNT(*) FROM prompt_templates"))
    count = cur.fetchone()[0]
    if count == 0:
        now_iso = datetime.now(timezone.utc).isoformat()
        for t in BUILTIN_TEMPLATES:
            conn.execute(
                text(
                    "INSERT INTO prompt_templates "
                    "(id, name, description, scenario, system_prompt, prompt, temperature, max_tokens, is_builtin, created_at, updated_at) "
                    "VALUES (:id, :name, :description, :scenario, :system_prompt, :prompt, :temperature, :max_tokens, :is_builtin, :created_at, :updated_at)"
                ),
                {**t, "created_at": now_iso, "updated_at": now_iso},
            )


async def create_tables():
    import app.models  # noqa: F401 - ensure all models are registered on Base.metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_columns_sync)

