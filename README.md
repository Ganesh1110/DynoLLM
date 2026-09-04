# Local LLM Testing & Monitoring Platform

A local-first benchmarking, concurrent load testing, and real-time hardware monitoring platform for local LLM engines (Ollama, LM Studio, vLLM, llama.cpp, and OpenAI-compatible endpoints).

---

## Key Features

1. **Model & Runtime Management**
   - Connect to local Ollama (`http://localhost:11434`), LM Studio (`http://localhost:1234`), vLLM, or custom OpenAI-compatible endpoints.
   - Dynamic health checks and auto-discovery of loaded models and quantization metadata.

2. **Single-Request Benchmarking**
   - Measure **Time-To-First-Token (TTFT)**, **Generation Throughput (tokens/sec)**, and **End-to-End Latency**.
   - Preconfigured scenarios: *Short*, *Medium*, *Long*, *RAG*, *Conversation*, *JSON output*, and *Streaming*.
   - Multi-run statistical aggregation ($P_{50}$, $P_{95}$, $P_{99}$).

3. **Concurrent Load & Stress Testing**
   - Multi-user async load generator powered by Python `asyncio + httpx`.
   - Traffic patterns: **Constant Load**, **Ramp-up**, **Spike Test**, and **Stress Test** (auto-stop on saturation/error threshold).
   - Real-time latency distribution curves, requests per second (RPS), and error/timeout rates.

4. **Real-Time Hardware Telemetry**
   - Continuous CPU, System RAM, Disk I/O, and NVIDIA GPU (VRAM / Temp / Power / Utilization) monitoring.
   - Live streaming over WebSockets directly into Recharts dashboards.

5. **Test History & Export**
   - Persistent test run history with SQLite.
   - One-click **CSV** and **JSON** exports for benchmark and load test results.

---

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy (asyncio/aiosqlite), WebSockets, psutil, pynvml, httpx.
- **Frontend**: React 18, Vite, Tailwind CSS, Zustand, Recharts, Lucide Icons.
- **Database**: SQLite (Async).

---

## Getting Started

### 1. Backend Setup

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py
```

Backend will be running at `http://localhost:8000` (API Docs at `http://localhost:8000/docs`).

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend will be running at `http://localhost:5173`.

### 3. Docker Compose (Alternative)

```bash
docker-compose up --build
```

---

## API Endpoints

- `GET /api/runtimes` — List all connected LLM runtime endpoints.
- `POST /api/runtimes/{id}/health` — Ping runtime health.
- `GET /api/runtimes/{id}/models` — Discover available models on runtime.
- `POST /api/benchmarks` — Launch single-request benchmark.
- `POST /api/load-tests` — Launch concurrent load test.
- `WS /api/monitoring/stream` — Real-time 1Hz hardware metrics WebSocket.
- `WS /api/monitoring/events` — Live test progress WebSocket broadcast.
- `GET /api/export/benchmarks/{id}/csv` — Export benchmark results to CSV.
- `GET /api/export/load-tests/{id}/csv` — Export load test results to CSV.
