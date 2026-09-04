from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class LoadTestCreate(BaseModel):
    runtime_id: str
    model: str
    pattern: str = "rampup"    # constant, rampup, spike, stress
    target_users: int = 10
    duration_seconds: int = 60
    rampup_step_users: int = 5
    rampup_step_seconds: int = 10
    system_prompt: Optional[str] = None
    prompt_mix: Optional[dict] = None   # {"short": 0.3, "normal": 0.5, "long": 0.2}
    temperature: float = 0.7
    max_tokens: int = 256
    request_timeout: float = 120.0


class LoadTestResultOut(BaseModel):
    id: str
    run_id: str
    timestamp: datetime
    concurrent_users: int
    ttft_ms: Optional[float]
    total_latency_ms: float
    completion_tokens: Optional[int]
    generation_tokens_per_second: Optional[float]
    success: bool
    error: Optional[str]
    timed_out: bool

    model_config = {"from_attributes": True}


class LoadTestRunOut(BaseModel):
    id: str
    runtime_id: str
    model: str
    status: str
    pattern: str
    target_users: int
    duration_seconds: int
    error: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    # Aggregates
    total_requests: Optional[int]
    successful_requests: Optional[int]
    failed_requests: Optional[int]
    requests_per_second: Optional[float]
    error_rate: Optional[float]
    p50_latency_ms: Optional[float]
    p90_latency_ms: Optional[float]
    p95_latency_ms: Optional[float]
    p99_latency_ms: Optional[float]
    avg_ttft_ms: Optional[float]
    p95_ttft_ms: Optional[float]
    avg_generation_tokens_per_second: Optional[float]
    max_concurrent_users_reached: Optional[int]
    timeout_count: Optional[int]
    runtime_healthy_throughout: Optional[bool] = True
    quality_integrity_rate: Optional[float] = None
    avg_power_watts: Optional[float] = None
    tokens_per_watt: Optional[float] = None
    abort_reason: Optional[str] = None

    results: Optional[list[LoadTestResultOut]] = None

    model_config = {"from_attributes": True}


class LiveLoadTestUpdate(BaseModel):
    run_id: str
    timestamp: str
    concurrent_users: int
    total_requests: int
    successful_requests: int
    failed_requests: int
    requests_per_second: float
    error_rate: float
    avg_latency_ms: float
    p95_latency_ms: Optional[float]
    avg_ttft_ms: Optional[float]
    avg_tokens_per_second: Optional[float]
