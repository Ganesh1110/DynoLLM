import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, Text
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Runtime(Base):
    __tablename__ = "runtimes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    runtime_type = Column(String, nullable=False)  # ollama, lmstudio, openai_compatible, llamacpp, vllm
    endpoint = Column(String, nullable=False)
    api_key = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
