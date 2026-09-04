"""
Abstract base class for LLM runtime adapters.
All adapters must implement this interface.
"""
from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional
from dataclasses import dataclass


@dataclass
class GenerateRequest:
    model: str
    prompt: str
    system_prompt: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 512
    top_p: float = 1.0
    top_k: int = 40
    seed: Optional[int] = None
    stream: bool = True


@dataclass
class GenerateResponse:
    content: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    finish_reason: Optional[str] = None
    raw: Optional[dict] = None


@dataclass
class StreamChunk:
    delta: str
    is_first: bool = False
    is_last: bool = False
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None


class RuntimeAdapter(ABC):
    def __init__(self, endpoint: str, api_key: Optional[str] = None):
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key

    @abstractmethod
    async def health_check(self) -> tuple[bool, str]:
        """Returns (healthy, message)"""

    @abstractmethod
    async def list_models(self) -> list[dict]:
        """Returns list of model dicts"""

    @abstractmethod
    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        """Non-streaming generation"""

    @abstractmethod
    async def generate_stream(self, request: GenerateRequest) -> AsyncIterator[StreamChunk]:
        """Streaming generation — yields StreamChunk objects"""
