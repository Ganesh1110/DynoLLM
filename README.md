# ⚡ DynoLLM

**DynoLLM** is an open-source benchmarking, concurrent load testing, and real-time hardware telemetry platform for local LLMs (Ollama, vLLM, LM Studio, and llama.cpp). Profile Time-To-First-Token (TTFT), tokens/second throughput, concurrency saturation limits, and GPU VRAM/wattage in a modern real-time web dashboard.

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![CI](https://img.shields.io/badge/CI-Passing-brightgreen?style=flat&logo=githubactions&logoColor=white)](.github/workflows/ci.yml)

**Answer the ultimate deployment question:**  
> *"Can this local LLM configuration safely and reliably serve my production workload, and how many concurrent users can it handle before latency collapses?"*

</div>

---

## 📑 Table of Contents
- [Why DynoLLM? (Comparison)](#-why-dynollm)
- [Interactive Dashboard Preview](#-dashboard-preview)
- [Key Features](#-key-features)
- [High-Level Architecture](#️-high-level-architecture)
- [Quick Start](#️-quick-start)
- [API Reference Summary](#-api-reference-summary)
- [Documentation & Deep Dive](#-documentation)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🥊 Why DynoLLM?

Generic HTTP load testers (like k6, Locust, or Apache Bench) measure raw request roundtrips, but fail to capture the nuances of streaming generative AI: chunk intervals, Time-To-First-Token (TTFT), GPU memory saturation, and context-window degradation. DynoLLM is built from the ground up specifically for Local LLM operations (LLMOps).

| Capability / Metric | ⚡ DynoLLM | k6 / Locust | curl / Custom Scripts | lm-evaluation-harness |
|---|:---:|:---:|:---:|:---:|
| **Streaming TTFT & Tok/s Metrics** | **Native** (chunk-level resolution) | ❌ Raw HTTP latency only | ❌ Manual parsing needed | ❌ Offline batch scoring only |
| **Hardware Telemetry (GPU/VRAM/Power)** | **Real-Time** (NVIDIA + Apple Silicon) | ❌ External tool required | ❌ None | ❌ None |
| **Tokens-per-Watt Energy Profiling** | **Automatic** ($\text{tok/s} / \text{W}$) | ❌ No | ❌ No | ❌ No |
| **Runtime Crash & OOM Watchdog** | **Auto-Abort** (safe teardown) | ❌ Hangs / timeouts | ❌ Hard crash / hung socket | ❌ No |
| **Pre-built LLM Scenarios** | **Yes** (RAG, JSON, Multi-turn, Code) | ❌ Must write from scratch | ❌ Fragile bash scripts | ⚠️ Quality/accuracy benchmarks |
| **Interactive Web UI Dashboard** | **Zero-config** React dashboard | ⚠️ Grafana / CLI export | ❌ Terminal stdout only | ⚠️ Static HTML reports |
| **Universal Local Runtime Support** | **Ollama, vLLM, LM Studio, llama.cpp** | ⚠️ Generic HTTP endpoints | ⚠️ Manual curl configs | ⚠️ Library bindings |

---

## 🖥️ Dashboard Preview

```text
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │  ⚡ DynoLLM Dashboard   [Active Runtime: Ollama / vLLM]   [Hardware: NVIDIA RTX]  │
 ├──────────────────────────────────────────────────────────────────────────────────┤
 │  Model: llama3.1:8b-instruct-q4_K_M       Status: ● RUNNING STRESS TEST (50 VU)  │
 │                                                                                  │
 │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
 │  │ TTFT (P95)      │ │ Throughput      │ │ GPU VRAM        │ │ Energy Efficiency│ │
 │  │ 42.8 ms         │ │ 84.6 tok/s      │ │ 6.8 GB / 24 GB  │ │ 0.48 tok/s / W   │ │
 │  └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
 │                                                                                  │
 │  [ 📈 Concurrency vs P95 Latency Curve ]       [ 📊 Real-Time VRAM & Power Stream ]│
 └──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌟 Key Features

### 1. 🔌 Universal Runtime Adapter Layer
- **Native Ollama Support**: Direct integration with `http://localhost:11434` (`/api/tags`, `/api/generate`, `/api/chat`).
- **OpenAI-Compatible Runtimes**: Works with **LM Studio** (`http://localhost:1234`), **vLLM**, **llama.cpp server**, and **Groq/LocalAPI**.
- **Model Metadata Auto-Discovery**: Detects model family, parameter size (`7B`, `8B`, `14B`, `70B`), quantization format (`Q4_K_M`, `Q8_0`, `FP16`), and context limits.
- **Dynamic Health Checks**: Real-time ping testing and latency verification.

### 2. ⏱️ Single-Request Performance Profiler
- **Time-To-First-Token (TTFT)**: High-resolution measurement of prompt evaluation and initial streaming response time.
- **Generation Speed**: Accurate completion throughput calculation in **tokens / second**.
- **End-to-End Latency**: Total wall-clock time from request dispatch to final chunk.
- **Predefined Scenarios**:
  - `Short Prompt`: Quick facts & basic retrieval (~10 tokens)
  - `Medium Prompt`: Concept explanations & summarization (~50 tokens)
  - `Long Technical`: Multi-section architectural guides (~200 tokens)
  - `RAG Q&A`: Context extraction with reference documents
  - `Conversation`: Multi-turn dialogue simulation
  - `Structured JSON`: JSON schema compliance & validation
  - `Streaming`: Sustained token stream generation
- **Statistical Aggregations**: Computes **$P_{50}$ (Median)**, **$P_{95}$**, and **$P_{99}$** across $N$ iterations.

### 3. 🚀 Concurrent Load & Stress Generator
- **Multi-User Async Engine**: Built on non-blocking Python `asyncio` + `httpx` to simulate hundreds of virtual users without host bottlenecking.
- **Traffic Simulation Patterns**:
  - `Constant Load`: Sustained concurrency over time (e.g., 25 concurrent users for 5 minutes).
  - `Ramp-Up`: Staged user increments (e.g., +5 users every 15s) to find concurrency saturation limits.
  - `Spike Test`: Sudden instantaneous traffic bursts to measure queue depth & recovery.
  - `Stress Test`: Auto-incrementing load that halts automatically if error rates or latency cross safe thresholds.
- **Live Performance Curves**: WebSocket-streamed $P_{95}$ vs. Average Latency distribution and real-time RPS (Requests Per Second).

### 4. ⚡ Energy Efficiency & Power Telemetry
- **Tokens-per-Watt Profiling**: Correlates GPU power draw ($W$) during active generation to compute true operational efficiency ($\text{tok/s} / \text{Watts}$).
- **Hardware Sizing**: Directly compare power-to-performance tradeoffs across quantizations (`Q4_K_M` vs `Q8_0` vs `FP16`).

### 5. 🛡️ Concurrent Runtime Health Watchdog
- **Process Crash & OOM Protection**: Actively monitors target runtimes during intense concurrency tests.
- **Safe Emergency Abort**: Instantly detects runtime lockups or GPU memory exhaustion, aborting tests cleanly with actionable root-cause diagnostics instead of hanging indefinitely.

### 6. 🏆 Side-by-Side Model Comparison & Leaderboard
- **Multi-Model Scorecard**: Select 2 to 4 benchmark runs to view a side-by-side performance matrix.
- **Leaderboard Badges**: Automatically identifies leaders in **Fastest Generation (tok/s)**, **Fastest TTFT**, **Lowest $P_{95}$ Latency**, and **Highest Energy Efficiency**.

### 7. 🔍 Output Quality & Integrity Under Load
- **Degradation Detection**: Checks for truncated responses, malformed JSON structures, and premature connection terminations under heavy concurrency.
- **Quality Pass Rate**: Calculates a **Quality Integrity Score %** alongside raw speed.

### 8. 📊 Real-Time Hardware Telemetry
- **CPU & Core Distribution**: Global usage percentage, per-core metrics, and load averages via `psutil`.
- **System Memory (RAM)**: Real-time memory allocation, cache usage, and buffer availability.
- **GPU & VRAM (NVIDIA)**: Hardware integration via `pynvml` measuring GPU Core Utilization %, VRAM consumption, Clock speed, Temperature (°C), and Power draw (Watts).
- **Apple Silicon Support**: Graceful unified memory tracking on macOS / Metal environments.
- **Disk I/O Throughput**: Read/Write rates in KB/s and MB/s.

### 9. 💾 History, Data Persistence & Export
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
- A running local LLM engine (e.g., [Ollama](https://ollama.com), [vLLM](https://github.com/vllm-project/vllm), [LM Studio](https://lmstudio.ai), or [llama.cpp](https://github.com/ggerganov/llama.cpp))

### 1. Clone & Setup Backend

```bash
git clone https://github.com/Ganesh1110/DynoLLM.git
cd DynoLLM/backend

python3 -m venv venv
source venv/bin/activate       # On Windows: venv\Scripts\activate
pip install -r requirements.txt

python run.py
```

- **Backend API**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

### 2. Setup Frontend

```bash
cd ../frontend
npm install
npm run dev
```

- **Web Dashboard**: `http://localhost:5173`

### 3. Docker Compose (One-Click)

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

## 📚 Documentation

- [Detailed Implementation Plan & Architecture Guide](docs/local-llm-testing-monitoring-implementation-plan.md): Comprehensive 11-module breakdown covering concurrency modeling, hardware telemetry collectors, and statistical scoring.

---

## 🧪 Testing

Run the backend test suite:

```bash
cd backend
PYTHONPATH=. pytest tests/
```

---

## 🤝 Contributing

Contributions are welcome! Please check out [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before submitting pull requests or opening issues.

---

## 📜 License

Distributed under the [MIT License](LICENSE). Free for personal, research, and commercial testing.
