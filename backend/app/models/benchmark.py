import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Float, Integer, Text, JSON, ForeignKey, Boolean
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class BenchmarkRun(Base):
    __tablename__ = "benchmark_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    runtime_id = Column(String, ForeignKey("runtimes.id"), nullable=False)
    model = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending, running, completed, failed, stopped
    scenario = Column(String, nullable=False)   # short, medium, long, rag, conversation, json, streaming
    prompt = Column(Text, nullable=True)
    system_prompt = Column(Text, nullable=True)
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=512)
    num_runs = Column(Integer, default=3)
    use_streaming = Column(Boolean, default=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Aggregate results (computed after all runs)
    avg_ttft_ms = Column(Float, nullable=True)
    avg_total_latency_ms = Column(Float, nullable=True)
    avg_generation_tokens_per_second = Column(Float, nullable=True)
    avg_e2e_tokens_per_second = Column(Float, nullable=True)
    avg_prompt_tokens = Column(Float, nullable=True)
    avg_completion_tokens = Column(Float, nullable=True)
    p50_latency_ms = Column(Float, nullable=True)
    p95_latency_ms = Column(Float, nullable=True)
    p99_latency_ms = Column(Float, nullable=True)


class BenchmarkResult(Base):
    __tablename__ = "benchmark_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String, ForeignKey("benchmark_runs.id"), nullable=False)
    run_index = Column(Integer, nullable=False)
    ttft_ms = Column(Float, nullable=True)
    total_latency_ms = Column(Float, nullable=False)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    generation_tokens_per_second = Column(Float, nullable=True)
    e2e_tokens_per_second = Column(Float, nullable=True)
    error = Column(Text, nullable=True)
    raw_response = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
