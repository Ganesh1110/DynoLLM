from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PromptTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    scenario: str = "custom"
    system_prompt: Optional[str] = None
    prompt: str
    temperature: float = 0.7
    max_tokens: int = 512


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    scenario: Optional[str] = None
    system_prompt: Optional[str] = None
    prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


class PromptTemplateOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    scenario: str
    system_prompt: Optional[str] = None
    prompt: str
    temperature: float
    max_tokens: int
    is_builtin: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
