import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Float, Integer, Text, JSON, ForeignKey, Boolean, Index
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class LoadTestRun(Base):
    __tablename__ = "load_test_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    runtime_id = Column(String, ForeignKey("runtimes.id"), nullable=False, index=True)
    model = Column(String, nullable=False)
    status = Column(String, default="pending", index=True)  # pending, running, completed, failed, stopped
    pattern = Column(String, nullable=False)     # constant, rampup, spike, stress
    target_users = Column(Integer, nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    rampup_step_users = Column(Integer, default=5)
    rampup_step_seconds = Column(Integer, default=10)
    system_prompt = Column(Text, nullable=True)
    prompt_mix = Column(JSON, nullable=True)     # {"short": 0.3, "normal": 0.5, "long": 0.2}
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=256)
    request_timeout = Column(Float, default=120.0)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Aggregated results
    total_requests = Column(Integer, nullable=True)
    successful_requests = Column(Integer, nullable=True)
    failed_requests = Column(Integer, nullable=True)
    requests_per_second = Column(Float, nullable=True)
    error_rate = Column(Float, nullable=True)
    p50_latency_ms = Column(Float, nullable=True)
    p90_latency_ms = Column(Float, nullable=True)
    p95_latency_ms = Column(Float, nullable=True)
    p99_latency_ms = Column(Float, nullable=True)
    avg_ttft_ms = Column(Float, nullable=True)
    p95_ttft_ms = Column(Float, nullable=True)
    avg_generation_tokens_per_second = Column(Float, nullable=True)
    max_concurrent_users_reached = Column(Integer, nullable=True)
    timeout_count = Column(Integer, nullable=True)
    runtime_healthy_throughout = Column(Boolean, default=True)
    quality_integrity_rate = Column(Float, nullable=True)
    avg_power_watts = Column(Float, nullable=True)
    tokens_per_watt = Column(Float, nullable=True)
    abort_reason = Column(Text, nullable=True)
    safe_max_concurrency = Column(Integer, nullable=True)
    # True only when a tier actually breached SLA during this run — i.e. the value is a
    # measured ceiling. False means nothing breached and the value equals the highest tier
    # tested (not a true capacity limit).
    safe_max_concurrency_is_ceiling = Column(Boolean, nullable=True)
    # Non-null when rampup target_users is unreachable given duration_seconds/rampup_step_seconds.
    rampup_budget_warning = Column(Text, nullable=True)

    # Token aggregates & capacity metrics
    total_prompt_tokens = Column(Integer, nullable=True)
    total_completion_tokens = Column(Integer, nullable=True)
    avg_prompt_tokens = Column(Float, nullable=True)
    avg_completion_tokens = Column(Float, nullable=True)
    tokens_in_per_second = Column(Float, nullable=True)
    tokens_out_per_second = Column(Float, nullable=True)
    total_tokens_per_second = Column(Float, nullable=True)
    input_token_ratio = Column(Float, nullable=True)
    cost_estimate = Column(Float, nullable=True)
    concurrency_breakdown = Column(JSON, nullable=True)


class LoadTestPlan(Base):
    """Saveable, reusable test plan (JMeter Test Plan equivalent)."""
    __tablename__ = "load_test_plans"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    config      = Column(JSON, nullable=False)   # full plan JSON (thread_groups, config_elements, assertions, listeners)
    created_at  = Column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at  = Column(DateTime(timezone=True), nullable=True)


class LoadTestResult(Base):
    __tablename__ = "load_test_results"
    __table_args__ = (
        Index("ix_load_test_results_run_ts", "run_id", "timestamp"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String, ForeignKey("load_test_runs.id"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)
    concurrent_users = Column(Integer, nullable=False, index=True)
    ttft_ms = Column(Float, nullable=True)
    total_latency_ms = Column(Float, nullable=False)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    generation_tokens_per_second = Column(Float, nullable=True)
    success = Column(Boolean, default=True)
    quality_valid = Column(Boolean, default=True)
    error = Column(Text, nullable=True)
    timed_out = Column(Boolean, default=False)
    is_transient_error = Column(Boolean, default=False)
