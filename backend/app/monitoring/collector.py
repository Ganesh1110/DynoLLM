"""
Hardware metrics collector using psutil and pynvml (optional GPU).
"""
import time
import platform
from datetime import datetime, timezone
from typing import Optional

import psutil

# Try GPU monitoring
try:
    import pynvml
    pynvml.nvmlInit()
    _GPU_AVAILABLE = True
    _GPU_COUNT = pynvml.nvmlDeviceGetCount()
except Exception:
    _GPU_AVAILABLE = False
    _GPU_COUNT = 0

_prev_disk_io = psutil.disk_io_counters()
_prev_disk_time = time.perf_counter()


def collect_metrics() -> dict:
    global _prev_disk_io, _prev_disk_time

    now = datetime.now(timezone.utc).isoformat()

    # CPU
    cpu_percent = psutil.cpu_percent(interval=None)
    cpu_per_core = psutil.cpu_percent(percpu=True, interval=None)
    load_avg = None
    load_avg_5 = None
    if hasattr(psutil, "getloadavg"):
        la = psutil.getloadavg()
        load_avg = la[0]
        load_avg_5 = la[1]

    # RAM
    mem = psutil.virtual_memory()
    ram_total = mem.total
    ram_used = mem.used
    ram_available = mem.available
    ram_percent = mem.percent

    # Disk I/O
    disk_io = psutil.disk_io_counters()
    now_time = time.perf_counter()
    elapsed = now_time - _prev_disk_time
    disk_read_per_sec = 0.0
    disk_write_per_sec = 0.0
    if elapsed > 0 and _prev_disk_io and disk_io:
        disk_read_per_sec = (disk_io.read_bytes - _prev_disk_io.read_bytes) / elapsed
        disk_write_per_sec = (disk_io.write_bytes - _prev_disk_io.write_bytes) / elapsed
    _prev_disk_io = disk_io
    _prev_disk_time = now_time

    # GPU
    gpus = []
    if _GPU_AVAILABLE:
        for i in range(_GPU_COUNT):
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                name = pynvml.nvmlDeviceGetName(handle)
                if isinstance(name, bytes):
                    name = name.decode()
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                try:
                    temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
                except Exception:
                    temp = None
                try:
                    power = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0
                except Exception:
                    power = None
                try:
                    clock = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS)
                except Exception:
                    clock = None
                gpus.append({
                    "index": i,
                    "name": name,
                    "utilization_percent": util.gpu,
                    "vram_used_bytes": mem_info.used,
                    "vram_total_bytes": mem_info.total,
                    "vram_percent": (mem_info.used / mem_info.total * 100) if mem_info.total else 0,
                    "temperature_celsius": temp,
                    "power_draw_watts": power,
                    "clock_mhz": clock,
                })
            except Exception:
                pass

    # Multi-GPU aggregates
    total_gpu_power_watts = None
    total_vram_used_bytes = 0
    total_vram_total_bytes = 0
    avg_gpu_utilization = None
    if gpus:
        powers = [g["power_draw_watts"] for g in gpus if g.get("power_draw_watts") is not None]
        if powers:
            total_gpu_power_watts = sum(powers)
        total_vram_used_bytes = sum(g.get("vram_used_bytes", 0) for g in gpus)
        total_vram_total_bytes = sum(g.get("vram_total_bytes", 0) for g in gpus)
        utils = [g["utilization_percent"] for g in gpus if g.get("utilization_percent") is not None]
        if utils:
            avg_gpu_utilization = sum(utils) / len(utils)

    return {
        "timestamp": now,
        "cpu_percent": cpu_percent,
        "cpu_load_avg_1m": load_avg,
        "cpu_load_avg_5m": load_avg_5,
        "cpu_per_core": cpu_per_core,
        "ram_total_bytes": ram_total,
        "ram_used_bytes": ram_used,
        "ram_available_bytes": ram_available,
        "ram_percent": ram_percent,
        "disk_read_bytes_per_sec": disk_read_per_sec,
        "disk_write_bytes_per_sec": disk_write_per_sec,
        "gpu_count": len(gpus),
        "gpus": gpus,
        "total_gpu_power_watts": total_gpu_power_watts,
        "total_vram_used_bytes": total_vram_used_bytes,
        "total_vram_total_bytes": total_vram_total_bytes,
        "avg_gpu_utilization_percent": avg_gpu_utilization,
    }


def gpu_available() -> bool:
    return _GPU_AVAILABLE


def gpu_count() -> int:
    return _GPU_COUNT
