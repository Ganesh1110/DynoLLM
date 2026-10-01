import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Float, Integer, Text, JSON, ForeignKey
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class RequestTrace(Base):
    __tablename__ = "request_traces"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source = Column(String, nullable=False, index=True)  # benchmark, load_test, proxy
    run_id = Column(String, nullable=True, index=True)   # links to benchmark_runs or load_test_runs
    runtime_id = Column(String, ForeignKey("runtimes.id"), nullable=False, index=True)
    model = Column(String, nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow, index=True)

    prompt_text = Column(Text, nullable=True)
    output_text = Column(Text, nullable=True)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    finish_reason = Column(String, nullable=True)  # stop, length, abort, error

    ttft_ms = Column(Float, nullable=True)
    tpot_ms = Column(Float, nullable=True)
    total_latency_ms = Column(Float, nullable=True)
    error = Column(Text, nullable=True)
    params = Column(JSON, nullable=True)

    # Engine KV cache percentage sampled at start and end of request
    engine_kv_pct_start = Column(Float, nullable=True)
    engine_kv_pct_end = Column(Float, nullable=True)
