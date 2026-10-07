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
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int]
    generation_tokens_per_second: Optional[float]
    success: bool
    error: Optional[str]
    timed_out: bool
    is_transient_error: Optional[bool] = False

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
    safe_max_concurrency: Optional[int] = None
    safe_max_concurrency_is_ceiling: Optional[bool] = None
    rampup_budget_warning: Optional[str] = None

    # Token aggregates & capacity metrics
    total_prompt_tokens: Optional[int] = None
    total_completion_tokens: Optional[int] = None
    avg_prompt_tokens: Optional[float] = None
    avg_completion_tokens: Optional[float] = None
    tokens_in_per_second: Optional[float] = None
    tokens_out_per_second: Optional[float] = None
    total_tokens_per_second: Optional[float] = None
    input_token_ratio: Optional[float] = None
    cost_estimate: Optional[float] = None
    concurrency_breakdown: Optional[list[dict]] = None

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
    total_prompt_tokens: Optional[int] = None
    total_completion_tokens: Optional[int] = None
    tokens_in_per_second: Optional[float] = None
    tokens_out_per_second: Optional[float] = None


# ─── Test Plan Schemas ────────────────────────────────────────────────────────

class ConfigElementSchema(BaseModel):
    type: str                          # csv_data_set | think_time | auth_header | token_budget
    # csv_data_set fields
    data: Optional[str] = None         # raw CSV/newline-separated prompt text
    column: Optional[str] = None       # column name in CSV
    mode: Optional[str] = "random"     # random | sequential
    # think_time fields
    min_ms: Optional[int] = 0
    max_ms: Optional[int] = 0
    # auth_header fields
    key: Optional[str] = None
    value: Optional[str] = None
    # token_budget fields
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None


class AssertionConfigSchema(BaseModel):
    type: str                          # latency | error_rate | quality | ttft | tokens_per_second
    name: Optional[str] = None
    # latency
    p95_max_ms: Optional[float] = None
    # error_rate
    max_pct: Optional[float] = None
    # quality
    min_rate: Optional[float] = None
    # ttft
    max_ms: Optional[float] = None
    # tokens_per_second
    min_tps: Optional[float] = None


class ThreadGroupConfigSchema(BaseModel):
    id: Optional[str] = None
    name: str = "Thread Group"
    runtime_id: str
    runtime_type: Optional[str] = None    # will be resolved server-side from runtime_id
    endpoint: Optional[str] = None        # will be resolved server-side
    api_key: Optional[str] = None         # will be resolved server-side
    model: str
    pattern: str = "rampup"
    target_users: int = 10
    duration_seconds: int = 60
    rampup_step_users: int = 5
    rampup_step_seconds: int = 10
    system_prompt: Optional[str] = None
    prompt_mix: Optional[dict] = None
    temperature: float = 0.7
    max_tokens: int = 256
    request_timeout: float = 120.0


class LoadTestPlanCreate(BaseModel):
    name: str
    description: Optional[str] = None
    thread_groups: list[ThreadGroupConfigSchema]
    config_elements: list[ConfigElementSchema] = []
    assertions: list[AssertionConfigSchema] = []
    listeners: list[str] = [
        "summary_table", "latency_chart", "token_throughput",
        "error_log", "percentile_chart", "assertion_report",
    ]


class LoadTestPlanOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    config: dict
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AssertionResultSchema(BaseModel):
    name: str
    assertion_type: str
    passed: bool
    actual_value: Optional[float] = None
    threshold: float
    message: str


class PlanRunReportOut(BaseModel):
    run_id: Optional[str] = None   # first thread group run_id, for reference
    plan_id: Optional[str] = None
    plan_name: Optional[str] = None
    overall_passed: bool = True
    thread_group_summaries: list[dict] = []
    merged_aggregates: dict = {}
    listeners: dict = {}
    assertion_results: list[AssertionResultSchema] = []
