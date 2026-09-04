<div align="center">

# ⚡ DynoLLM (or LocalLLM Probe)
### Production-Readiness Benchmarking, Load Testing & Telemetry Platform for Local AI Models

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![SQLite](https://img.shields.io/badge/SQLite-Async-003B57?style=flat&logo=sqlite&logoColor=white)](https://sqlite.org)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)

**Answer the ultimate deployment question:**  
> *"Can this local LLM configuration safely and reliably serve my production workload, and how many concurrent users can it handle?"*

</div>

---

## 🌟 Key Capabilities

### 1. 🔌 Universal Runtime Adapter Layer
- **Native Ollama Support**: Connect to `http://localhost:11434` (`/api/tags`, `/api/generate`).
- **OpenAI-Compatible Runtimes**: Seamlessly connects with **LM Studio** (`http://localhost:1234`), **vLLM**, **llama.cpp server**, and **Groq/LocalAPI**.
- **Model Discovery**: Auto-detects model families, quantization levels (e.g. `Q4_K_M`, `Q8_0`), parameter sizes (`7B`, `8B`, `14B`, `70B`), and context limits.
- **Dynamic Health Checks**: Real-time ping testing and latency verification.

### 2. ⏱️ Single-Request Performance Profiler
- **Time-To-First-Token (TTFT)**: High-resolution measurement of prompt evaluation and initial streaming response time.
- **Generation Speed**: Accurate completion throughput calculation in **tokens / second**.
- **End-to-End Latency**: Total wall-clock time from request dispatch to final chunk.
- **Predefined Scenarios**:
  - `Short Prompt`: Quick facts & basic retrieval (~10 tokens)
  - `Medium Prompt`: Concept explanations & summarization (~50 tokens)
  - `Long Technical`: Multi-section architectural guides (~200 tokens)
  - `RAG Q&A`: Precision context extraction with reference documents
  - `Conversation`: Multi-turn dialogue simulation
  - `Structured JSON`: JSON schema compliance & validation
  - `Streaming`: Sustained token stream generation
- **Statistical Aggregations**: Automatically computes **$P_{50}$ (Median)**, **$P_{95}$**, and **$P_{99}$** across $N$ iterations.

### 3. 🚀 Concurrent Load & Stress Generator
- **Multi-User Async Engine**: Built on non-blocking Python `asyncio` + `httpx` to generate hundreds of virtual clients without throttling your machine.
- **Traffic Simulation Patterns**:
  - `Constant Load`: Fixed concurrency over time (e.g. 20 users for 5 minutes).
  - `Ramp-Up`: Staged user increment (e.g. +2 users every 10s) to discover saturation limits.
  - `Spike Test`: Sudden instantaneous traffic burst to measure queue depth & recovery.
  - `Stress Test`: Auto-incrementing load that halts automatically if error rates exceed thresholds (e.g., >20% failure or memory exhaustion).
- **Live Performance Curves**: WebSocket-streamed $P_{95}$ vs. Average Latency distribution and real-time RPS (Requests Per Second).

### 4. 📊 Real-Time Hardware Telemetry
- **CPU & Core Distribution**: Global usage percentage, per-core metrics, and 1m/5m load averages via `psutil`.
- **System Memory (RAM)**: Real-time memory allocation, cache usage, and buffer availability.
- **GPU & VRAM (NVIDIA)**: Hardware integration via `pynvml` measuring GPU Core Utilization %, VRAM consumption, Clock speed, Temperature (°C), and Power draw (Watts).
- **Apple Silicon Support**: Graceful unified memory tracking on macOS / Metal environments.
- **Disk I/O Throughput**: Read/Write rates in KB/s and MB/s.

### 5. 💾 History, Data Persistence & Export
- **Persistent Storage**: Lightweight, zero-config async SQLite storage.
- **Export Formats**: One-click download of raw execution data in both **CSV** and **JSON** formats.

---

## 🏛️ High-Level Architecture

```text
┌────────────────────────────────────────────────────────┐
│               React + Vite Web Dashboard               │
│        (Tailwind CSS + Recharts + Lucide Icons)        │
└───────────────┬────────────────────────▲───────────────┘
                │ REST API               │ WebSocket Stream
                ▼                        │ (1Hz Hardware + Events)
┌────────────────────────────────────────┴───────────────┐
│                 FastAPI Backend Engine                 │
├────────────────────┬───────────────────┬───────────────┤
│  Benchmark Engine  │ Load Test Engine  │  HW Collector │
└─────────┬──────────┴─────────┬─────────┴───────┬───────┘
          │                    │                 │
          ▼                    ▼                 ▼
┌────────────────────────────────────────┐ ┌─────────────┐
│         Runtime Adapter Layer          │ │ psutil /    │
│ (Ollama / LM Studio / llama.cpp / vLLM)│ │ pynvml / OS │
└───────────────────┬────────────────────┘ └─────────────┘
                    ▼
          Local LLM Engine / GPU
```

---

## 🛠️ Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- A running local LLM engine (e.g., [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai))

### 1. Clone & Setup Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate       # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

- **Backend API**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

### 2. Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

- **Web Dashboard**: `http://localhost:5173`

### 3. Docker Compose (Alternative)

```bash
docker-compose up --build
```

---

## 📡 API Reference Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/runtimes` | List all configured LLM runtime endpoints |
| `POST` | `/api/runtimes` | Register a new LLM runtime |
| `POST` | `/api/runtimes/{id}/health` | Ping runtime and return latency / status |
| `GET` | `/api/runtimes/{id}/models` | Discover models and metadata from runtime |
| `POST` | `/api/benchmarks` | Trigger a single-request benchmark run |
| `GET` | `/api/benchmarks/{id}` | Get benchmark results and aggregate percentiles |
| `POST` | `/api/load-tests` | Launch an async multi-user load test |
| `POST` | `/api/load-tests/{id}/stop` | Immediately halt an active load test |
| `GET` | `/api/monitoring/current` | Snapshot of current CPU/RAM/GPU/Disk telemetry |
| `WS` | `/api/monitoring/stream` | 1Hz real-time hardware telemetry WebSocket stream |
| `WS` | `/api/monitoring/events` | Live benchmark & load test event broadcast channel |
| `GET` | `/api/export/benchmarks/{id}/csv` | Export benchmark data to CSV |
| `GET` | `/api/export/load-tests/{id}/csv` | Export load test data to CSV |

---

## 🧪 Testing

Run backend test suite:

```bash
cd backend
PYTHONPATH=. venv/bin/pytest tests/
```

---

## 📜 License
MIT License. Free for personal and commercial testing.
