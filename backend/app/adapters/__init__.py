from typing import Optional
import httpx
from app.adapters.base import RuntimeAdapter
from app.adapters.ollama import OllamaAdapter
from app.adapters.openai_compatible import OpenAICompatibleAdapter


def get_adapter(
    runtime_type: str,
    endpoint: str,
    api_key: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> RuntimeAdapter:
    """Factory to return the appropriate adapter for a runtime type."""
    if runtime_type == "ollama":
        return OllamaAdapter(endpoint=endpoint, api_key=api_key, client=client)
    elif runtime_type in ("lmstudio", "openai_compatible", "vllm", "llamacpp"):
        return OpenAICompatibleAdapter(endpoint=endpoint, api_key=api_key, client=client)
    else:
        raise ValueError(f"Unknown runtime type: {runtime_type}")
