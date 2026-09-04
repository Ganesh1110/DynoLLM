from pydantic import BaseModel
from typing import Optional


class GPUMetrics(BaseModel):
    index: int
    name: str
    utilization_percent: float
    vram_used_bytes: int
    vram_total_bytes: int
    vram_percent: float
    temperature_celsius: Optional[float]
    power_draw_watts: Optional[float]
    clock_mhz: Optional[int]


class HardwareMetrics(BaseModel):
    timestamp: str
    cpu_percent: float
    cpu_load_avg_1m: Optional[float]
    cpu_load_avg_5m: Optional[float]
    cpu_per_core: list[float]
    ram_total_bytes: int
    ram_used_bytes: int
    ram_available_bytes: int
    ram_percent: float
    disk_read_bytes_per_sec: float
    disk_write_bytes_per_sec: float
    gpu_count: int
    gpus: list[GPUMetrics]
