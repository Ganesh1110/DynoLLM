from pydantic import BaseModel, HttpUrl, field_validator
from typing import Optional
from datetime import datetime


class RuntimeCreate(BaseModel):
    name: str
    runtime_type: str  # ollama, lmstudio, openai_compatible
    endpoint: str
    api_key: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("runtime_type")
    @classmethod
    def validate_type(cls, v):
        allowed = ["ollama", "lmstudio", "openai_compatible", "llamacpp", "vllm"]
        if v not in allowed:
            raise ValueError(f"runtime_type must be one of {allowed}")
        return v


class RuntimeUpdate(BaseModel):
    name: Optional[str] = None
    endpoint: Optional[str] = None
    api_key: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class RuntimeOut(BaseModel):
    id: str
    name: str
    runtime_type: str
    endpoint: str
    is_active: bool
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class HealthCheckResult(BaseModel):
    healthy: bool
    message: str
    latency_ms: Optional[float] = None


class ModelInfo(BaseModel):
    id: str
    name: str
    size: Optional[int] = None
    format: Optional[str] = None
    family: Optional[str] = None
    parameter_size: Optional[str] = None
    quantization_level: Optional[str] = None
    context_length: Optional[int] = None
    modified_at: Optional[str] = None
