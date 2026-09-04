import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Float, Integer, JSON
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class HardwareSnapshot(Base):
    __tablename__ = "hardware_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String, nullable=True)       # associated benchmark/load test run (optional)
    run_type = Column(String, nullable=True)     # benchmark | load_test | idle

    timestamp = Column(DateTime(timezone=True), default=utcnow)

    # CPU
    cpu_percent = Column(Float, nullable=True)
    cpu_load_avg_1m = Column(Float, nullable=True)
    cpu_load_avg_5m = Column(Float, nullable=True)
    cpu_per_core = Column(JSON, nullable=True)

    # RAM
    ram_total_bytes = Column(Float, nullable=True)
    ram_used_bytes = Column(Float, nullable=True)
    ram_available_bytes = Column(Float, nullable=True)
    ram_percent = Column(Float, nullable=True)

    # Disk
    disk_read_bytes = Column(Float, nullable=True)
    disk_write_bytes = Column(Float, nullable=True)

    # GPU (NVIDIA)
    gpu_count = Column(Integer, nullable=True)
    gpu_metrics = Column(JSON, nullable=True)    # list of {name, util, vram_used, vram_total, temp, power}
