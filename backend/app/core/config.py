from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "DynoLLM"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    API_KEY: Optional[str] = None  # Optional API authentication for shared/remote instances

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./llm_platform.db"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]

    # Monitoring
    MONITORING_INTERVAL_SECONDS: float = 1.0

    # Load test
    MAX_CONCURRENT_USERS: int = 200
    REQUEST_TIMEOUT_SECONDS: float = 120.0

    # Default Ollama endpoint
    DEFAULT_OLLAMA_ENDPOINT: str = "http://localhost:11434"

    # Economics & Pricing Defaults
    DEFAULT_PROMPT_COST_PER_MILLION: float = 0.50
    DEFAULT_COMPLETION_COST_PER_MILLION: float = 1.50
    DEFAULT_GPU_HOURLY_COST: float = 0.70

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
