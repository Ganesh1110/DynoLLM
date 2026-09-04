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


from contextlib import asynccontextmanager
import httpx


class RuntimeAdapter(ABC):
    def __init__(
        self,
        endpoint: str,
        api_key: Optional[str] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key
        self.client = client

    @asynccontextmanager
    async def get_client(
        self,
        override_client: Optional[httpx.AsyncClient] = None,
        default_timeout: float = 300.0,
    ):
        """Yield a reusable client if provided, or instantiate a single-use client."""
        if override_client is not None and not override_client.is_closed:
            yield override_client
        elif self.client is not None and not self.client.is_closed:
            yield self.client
        else:
            async with httpx.AsyncClient(timeout=default_timeout) as new_client:
                yield new_client

    @abstractmethod
    async def health_check(self, client: Optional[httpx.AsyncClient] = None) -> tuple[bool, str]:
        """Returns (healthy, message)"""

    @abstractmethod
    async def list_models(self, client: Optional[httpx.AsyncClient] = None) -> list[dict]:
        """Returns list of model dicts"""

    @abstractmethod
    async def generate(
        self,
        request: GenerateRequest,
        client: Optional[httpx.AsyncClient] = None,
    ) -> GenerateResponse:
        """Non-streaming generation"""

    @abstractmethod
    async def generate_stream(
        self,
        request: GenerateRequest,
        client: Optional[httpx.AsyncClient] = None,
    ) -> AsyncIterator[StreamChunk]:
        """Streaming generation — yields StreamChunk objects"""
