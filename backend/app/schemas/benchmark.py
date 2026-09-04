from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class BenchmarkCreate(BaseModel):
    runtime_id: str
    model: str
    scenario: str = "medium"    # short, medium, long, rag, conversation, json, streaming
    prompt: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 512
    num_runs: int = 3
    use_streaming: bool = True


class BenchmarkResultOut(BaseModel):
    id: str
    run_id: str
    run_index: int
    ttft_ms: Optional[float]
    total_latency_ms: float
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    generation_tokens_per_second: Optional[float]
    e2e_tokens_per_second: Optional[float]
    power_watts: Optional[float] = None
    quality_valid: Optional[bool] = True
    error: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class BenchmarkRunOut(BaseModel):
    id: str
    runtime_id: str
    model: str
    status: str
    scenario: str
    temperature: float
    max_tokens: int
    num_runs: int
    use_streaming: bool
    error: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    # Aggregates
    avg_ttft_ms: Optional[float]
    avg_total_latency_ms: Optional[float]
    avg_generation_tokens_per_second: Optional[float]
    avg_e2e_tokens_per_second: Optional[float]
    avg_prompt_tokens: Optional[float]
    avg_completion_tokens: Optional[float]
    p50_latency_ms: Optional[float]
    p95_latency_ms: Optional[float]
    p99_latency_ms: Optional[float]
    avg_power_watts: Optional[float] = None
    tokens_per_watt: Optional[float] = None
    quality_integrity_rate: Optional[float] = None

    results: Optional[list[BenchmarkResultOut]] = None

    model_config = {"from_attributes": True}
