# DynoLLM — Full Technical & Product Report

*Generated from a line-by-line read of the repository at `/Users/ganeshjayaprakash/DynoLLM`. Every claim is anchored to a `file:line` citation. Items that could not be **fully verified** from source are explicitly labelled **[INFERRED]**. Where code and docs disagree, both sides are shown.*

---

## 1. Identity & One-Line Summary

**DynoLLM** (`APP_VERSION = "1.0.0"`, `backend/app/core/config.py:8`) is a self-hosted **Local LLM testing, monitoring & GPU capacity-planning platform**: a dark-theme React dashboard over a FastAPI async backend that benchmarks single inference requests, runs multi-user concurrency load tests against any Ollama / LM Studio / vLLM / llama.cpp / OpenAI-compatible endpoint, streams 1&nbsp;Hz hardware telemetry over WebSocket, scores output quality with lightweight heuristics, sizes GPU VRAM and theoretical concurrency client-side, exports CSV/JSON, and ships a large vLLM flag/performance configurator.

- **Backend**: FastAPI 0.115 / uvicorn, async SQLAlchemy 2 + aiosqlite, httpx runtimes, psutil/pynvml telemetry.
- **Frontend**: React 18 + Vite 5 + Tailwind 3 + Recharts + Zustand (SPA, no SSR).
- **Origin**: evolved from an earlier "Local LLM Testing & Monitoring Platform" plan (commit `8461730`); renamed in commit `f8c0dc5`. Current `HEAD` = `0ed1e17`.

> **Working-tree note:** the repo currently has one large **uncommitted** feature in flight (staged/modified): `VllmOptimizer.jsx` (4,292 new lines), `docs/VLLM_INFERENCE_CORE_CONCEPTS.md`, plus small `App.jsx` / `Navbar.jsx` / `README.md` edits. This report describes it as part of the codebase since it is present on disk.

---

## 2. Full Stack & Architecture

```
Browser SPA (React 18 + Vite 5 + Tailwind 3 + Recharts + Zustand)
   │  REST (axios)                       ▲  WebSocket (1 Hz hardware + events)
   ▼                                      │
FastAPI backend — lifespan creates tables and runs lightweight column migrations (app/core/database.py:192-195, 146-189)
   │  Router layer under optional X-API-Key / Bearer / ?token= auth (app/core/auth.py; app/main.py:45-50)
   ├─ Benchmark engine   — single-request profiler   (app/benchmark/engine.py)
   ├─ Load test engine   — asyncio concurrent users  (app/loadtest/engine.py)
   ├─ H/W collector      — psutil + pynvml            (app/monitoring/collector.py)
   ├─ Runtime adapters   — Ollama / OpenAI-compatible (app/adapters/)
   ├─ Quality heuristics — coherence + lexical overlap (app/benchmark/quality.py)
   └─ Async SQLite       — SQLAlchemy 2 async, aiosqlite (app/core/database.py:10-20)
   │  Runtime endpoints: Ollama :11434 | LM Studio :1234 | vLLM :8000 | llama.cpp :8080
   ▼
Local/remote LLM engine on GPU (or Apple Silicon unified memory)
```

- **Config** (`backend/app/core/config.py`): everything env-overridable via pydantic-settings; `DEBUG=True`, `API_KEY=None` (auth installed but **disabled by default**), `DATABASE_URL=sqlite+aiosqlite:///./llm_platform.db`, `CORS_ORIGINS` limited to three localhost origins, `MONITORING_INTERVAL_SECONDS=1.0`, `MAX_CONCURRENT_USERS=200`, `REQUEST_TIMEOUT_SECONDS=120.0`. Documented in README §Environment (README.md:244-270).
- **Auth wiring**: `verify_api_key` applied at router level to `runtimes`, `benchmarks`, `prompt_templates`, `load_tests`, `export` (main.py:45-50); the monitoring router is registered *without* the router-level dependency because it self-guards (main.py:49) — `GET /api/monitoring/current` uses `verify_api_key` (app/api/monitoring.py:15), both WS sockets use `verify_ws_api_key` (app/api/monitoring.py:22, 46).
- **Concurrency model**: benchmark/load-test runs execute as FastAPI `BackgroundTasks` (started after HTTP response) with a *single in-process global registry* for cancellation (`_ACTIVE_BENCH_RUNS`, `engine.py:67-72`; `_ACTIVE_RUNS`, `loadtest/engine.py:81-82`) and a single WebSocket `ConnectionManager` singleton (app/api/websocket_manager.py:8-45).
- **Deployment**: `docker-compose.yml` (backend :8000 + frontend :5173) with `host.docker.internal` for host-network Ollama (docker-compose.yml:1-31); frontend nginx proxies `/api/` REST plus both WS upgrade routes (frontend/nginx.conf:11-31); backend note — see §7/§9 for the **reload/`--workers` caveat**.

---

## 3. Page-by-Page Features

Routes (App.jsx:22-29): `/` Dashboard, `/runtimes`, `/benchmark`, `/load-test`, `/gpu-sizer`, `/vllm-optimizer`, `/compare`, `/history`. A single persistent WebSocket hook is mounted once and feeds telemetry + progress everywhere (App.jsx:15; hooks/useWebSocket.js).

### 3.1 Dashboard (`frontend/src/pages/Dashboard.jsx`, 450 lines)
- 4 metric cards: CPU (%, per-core, loadavg via `GaugeBar`), System RAM (%, used/total), GPU Accelerator (util + VRAM gauge + temp; falls back to "Unified Memory Architecture" copy **when no discrete GPU**), Disk I/O (Dashboard.jsx:64-176).
- Live 60s Recharts `AreaChart` of CPU/RAM/GPU/VRAM with `All | CPU | RAM | GPU` filter toggles (Dashboard.jsx:247-319).
- Panels: top runtimes with per-runtime Benchmark CTA, latest benchmark card (TTFT/Speed/P95), latest load-test card (RPS/Error/P95) (Dashboard.jsx:353-441).

### 3.2 Runtimes (`frontend/src/pages/Runtimes.jsx`, 312 lines)
- CRUD over `/api/runtimes`; type selector with per-type default endpoints (`ollama`:11434, `lmstudio`:1234, `vllm`:8000, `llamacpp`:8080 — Runtimes.jsx:246-254); optional per-runtime API key.
- Per-runtime health ping with latency (Runtimes.jsx:144-175) and model discovery via adapter `list_models` (128-142).

### 3.3 Benchmark (`frontend/src/pages/Benchmark.jsx`, 1110 lines)
- Two test modes: **standard** (N iterations) and **context_scaling** (README/engine: step through target token lengths to measure prefill/TTFT degradation, Benchmark.jsx:45-49, 509-556).
- Inline **VRAM estimator card** using `parseModelName → calcVRAM → calcKvCachePerUser → evaluateHostFit` with `Fits Natively / Tight Headroom / Exceeds Host VRAM` verdict (Benchmark.jsx:195-202, 367-395) — same utilities as GPU Sizer.
- Built-in prompt-template selector (`short/medium/long/rag/conversation/json/streaming`), **save/manage custom template modals**, system prompt, max tokens 32-4096, `num_runs` 1-20, TTFT checkbox (Benchmark.jsx:399-568).
- **8-card scorecard**: TTFT, Generation tok/s, E2E latency, P95, Semantic Quality (Coh/Rel sub-line), Integrity Pass Rate, Energy tok/s·W⁻¹, P50/P99 (657-731).
- Context-scaling degradation stats (`+x ms / 1k tok`, `Speed Drop %`), dual-axis line chart, per-iteration bar chart, token-distribution stacked chart, per-run execution table with `Pass | Flagged | Failed` quality badges and CSV/JSON export anchors (747-951).

### 3.4 Load Test (`frontend/src/pages/LoadTest.jsx`, 489 lines)
- Pattern selector **`constant | rampup | spike | stress`** (188-200); users 1-200, duration 10-3600s, ramp sub-fields for `rampup`, max tokens 32-2048, timeout 5-300s (202-277).
- Same inline VRAM estimator card as Benchmark.
- Live 8-card scorecard incl. **Safe Concurrency verdict** (`"{safe_max_concurrency} VU"` / `"Measuring..."`, SLA `≤5% Err` footnote — 418-424); live `P95 vs Avg` latency `LineChart` (429-449); abort banner from `abort_reason`/`error` (348-356); final latency percentile grid P50/P90/P95/P99 (459-481).

### 3.5 GPU Sizer (`frontend/src/pages/GpuSizer.jsx`, 586 lines)
- Freeform model parser + 15 `MODEL_PRESETS` (GpuSizer.jsx:150-227); connected-runtime model dropdown (167-187).
- Live host-fit badge driven by current telemetry, with **theoretical slots** (230-277).
- Model size / precision / context / target-streams configuration grid and 4-metric summary (weights, KV/slot, min tier, total VRAM) (289-408).
- **GPU slot matrix**: 13-card catalog (Consumer → Apple Unified → Cloud/Datacenter) with category filter pills, `C_theoretical` slots, batch throughput, per-slot speed, `Meets Target / Up to N / Cannot fit` verdicts (410-583).

### 3.6 vLLM Optimizer (`frontend/src/pages/VllmOptimizer.jsx`, **4,292 lines**)
- **`VLLM_VERSIONS` registry** (75-202): 0.8.x (V1, recommended, silently **omits** prefix/chunked flags — "triggers NotImplementedError"; lines 108-113), 0.6-0.7.x, 0.4-0.5.x, 0.3.x (with `unsupportedFlags`).
- **`GLOBAL_MODEL_CATALOG`** (289-602): 16 curated entries with verified-from-HF-File architecture data (`layers/kvHeads/headDim/gqaRatio/maxContext`), data source "Curated HF Registry (Verified Sept 2024/2025)", plus 2 multimodal entries (`isMultimodal` + `visionTokensPerImage`).
- **Performance model** (1010-1118): weights (×`bytesPerParam`, minus `cpuOffloadGb`), KV per token `2·layers·kvHeads·headDim·bytesPerKvToken` (+vision tokens), overhead buffer (spec draft VRAM + LoRA buffer + 1.35 base), TP-vs-replicas scaling, `maxSafeConcurrency = floor((budget−weights−overhead)/kvPerUser)`, roofline `estimatedDecodeTps` (arch memory-bus efficiency + quant speedups: FP8 1.85 / AWQ 2.45 / GPTQ 2.55; speculation 1.45/1.6/1.75; clamped [12, maxComputeTps]), `estimatedTtftMs` (≈14 ms cache-hit shortcut when prefix caching — heuristic, see §4.3).
- **Quantization recipes** (`QUANTIZATION_RECIPES`, 607-686): fp16/fp8/INT4-AWQ/INT4-GPTQ/compressed-tensors/GGUF each with accuracy score, speed multiplier, vLLM arg, and `llmcompressor` **recipeCode**.
- **Matchmaker** (1579-1693): 3 ranked recommendation cards (Best Value / Pure Speed / Enterprise Concurrency) mapped to GPU/recipe/TP and applied via `applyMatchmakerConfig`.
- **Config builder** (flag cards 3430-4286): G1 Memory/PagedAttention, G2 Throughput/batching (V1-aware "Default-ON" badges), G3 Parallelism & speculative decoding, G4 LoRA editor, G5 Structured outputs; **TP guardrail** validating TP divides query/KV heads (977-999); FP8-on-Ampere warning with one-click "Switch to INT4 AWQ" (1778-1806).
- **Generated command** (1357-1479) with V1 flag-omission + default-skipping logic; **Export center** (3016-3402): CLI command, **live `--help` diff/analyzer** (regex-pastes `vllm --help` stdout, diffs against active flags — `verified`/`missing` sets; 785-848), docker-compose, `.env`, **startup-log validator** (parses `# GPU blocks` / KV memory, cross-checks predicted vs real KV tokens; 1320-1348, 3365-3387), multi-node **Ray** bootstrap.
- **6 decision charts** (2311-2960): throughput+latency with saturation knee, quant scatter (click-to-select), context-vs-concurrency curve, TP-vs-replicas, roofline with operating-point cards, cost-per-1M-tokens with editable `$/hr`; stacked VRAM budget chart.

### 3.7 Compare (`frontend/src/pages/Compare.jsx`, 269 lines)
- 2-4 run selection with **4-run cap alert** (Compare.jsx:29-39); 4 leaderboard trophy cards (fastest tok/s, lowest TTFT, lowest P95, highest tok/W, 119-170); comparative bar chart + per-model scorecard matrix with 👑/⚡ winner stamps and Quality Integrity badge (defaults `?? 1` — see §4.4).

### 3.8 History (`frontend/src/pages/History.jsx`, 375 lines)
- Benchmark/LoadTest tabs, **search** on model+scenario/pattern (56-111), per-row CSV/JSON export + delete, header "Clear Benchmarks/Load Tests", delete confirm modal with `single | clear_tab | clear_all` modes (29-54, 114-128, 311-341).

---

## 4. Domain-Logic Accuracy Audit

> Methodology: I compared each formula against (a) the project's own `docs/CALCULATIONS_GUIDE.md`, (b) the vLLM/attention-math references it cites, and (c) first-principles sanity checks. `[VERIFIED]` = matches source math exactly. `[HEURISTIC]` = reasonable but approximate, code/UI copy is honest about it. `[MISMATCH]` = code disagrees with docs or self.

### 4.1 KV-cache arithmetic — `[VERIFIED]`
`calcDetailedKvSpecs` computes `bytesPerToken = 2·layers·kvHeads·headDim·bytesPerElement`, `allocatedTokens = ceil(context/16)·16`, `kvGiB = bytes→(1024³)` (frontend/src/utils/gpuSizer.js:337-352). This is **exactly** the GQA attention formula in the docs (CALCULATIONS_GUIDE.md:386-403) and matches vLLM's AttentionSpec KV storage, verified end-to-end against the A10G/Qwen3-14B worked example (guide:437-469). The VllmOptimizer re-derives the same math (VllmOptimizer.jsx:1030-1032).

**Unit nit — [MISMATCH] (minor):** the GPU catalog stores **decimal** GB (RTX 3060 `vramGb: 12`, gpuSizer.js:44-51) while KV bytes are converted with **binary** GiB (`1024**3`, gpuSizer.js:342). Mixing GB/GiB introduces ~2.4% error, immaterial for planning estimates but worth labelling in UI.

**Architecture-preset accuracy — [INFERRED/verify]:** `MODEL_PRESETS`/`parseModelName` fill architectures from a small rule table (gpuSizer.js:24-40, 233-254). Llama/Mistral/Qwen/DeepSeek values look right; the **Gemma 2 preset `headDim: 256`** (gpuSizer.js:37) is atypical vs ordinary 128-224 and is worth re-checking against the HF config. Family heuristics only handle qwen/deepseek/gemma/llama-class models; anything else falls back to the generic Llama GQA profile with **silent defaults of `params=8 / precision=0.55 / layers=32 / kvHeads=8`** (gpuSizer.js:178-180, 247-253). This is a documented-risk heuristic, not an error, but a visibly "detected: false" state would be more honest.

### 4.2 Concurrency & throughput estimates — `[HEURISTIC]` (honestly labelled)
`evaluateGpuConcurrency` (gpuSizer.js:370-418): `M_budget = 0.9·VRAM`, `−1 GB` "reserved for CUDA context & peak activations", then `C_theoretical = floor((budget − weights)/KV_per_req)`, capped by `maxBatch`. The `−1 GB` single number stands in for vLLM's runtime memory pool (weights+nonTorch+activation+other, guide:369-381) — reasonable, but a fixed constant where the real engine profiles it. The source comment already says the speed curve is "illustrative empirical curve" (gpuSizer.js:397): `singleStreamTps = bandwidth/(2·weightsGb)·0.65` is a **memory-bandwidth roofline** for decode, and `batchSpeedup = min(3.5, 1 + log2(n)·0.4)` is a curve fit, both then clamped by `maxComputeTps`. 

**Accuracy verdict:** the memory-side numbers (weights, KV, slots) are defensible first-principles; the **tok/s and per-user speeds are estimates, not measurements** — the UI is careful to say "~" and direct users to empirical load testing (GpuSizer.jsx:283, 419, VllmOptimizer.jsx:2496). Good product discipline.

**Flat-overhead inconsistency — [MISMATCH] (minor):** GpuSizer adds a flat `+1.5 GB` to recommended VRAM (GpuSizer.jsx:94) while `calcVRAM` applies a percentage overhead (default `25%`, gpuSizer.js:277-284); and GpuSizer.jsx:97-100 hardcodes `overhead=25` even though several `MODEL_PRESETS` specify 20/30 (gpuSizer.js:33-39). Double-counts/no-counts overhead depending on path. Small, but inconsistent.

### 4.3 vLLM Optimizer performance model
- `estimatedTtftMs` returns **14 ms immediately when prefix caching is on** (VllmOptimizer.jsx:1111-1118) — a "cache hit" idealization, not a full-cache-miss prefill model. It is the single most artificial number on the page; fine as an optimistic bound, but it should be visually distinguishable from the compute-based estimate. [HEURISTIC]
- Constants like `0.42`, arch-efficiency 0.65-0.80, quant speedups 1.85-2.55, spec factors 1.45-1.75 (1073-1108) are calibration factors **without stated provenance** in code or docs. Presenting them as `~decoded tok/s` is acceptable if labelled as model-derived; the page largely does label output as estimates. [HEURISTIC — add a "model assumptions" panel]
- **The V1 flag-omission logic is genuinely useful and correct**: V1 engines dropped prefix-caching/chunked-prefill/partial-prefill flags (flag duplication, `FlashAttention` deprecated), and passing them errors at startup — the optimizer's omission (VllmOptimizer.jsx:1398-1410) and per-version `supportedFlags`/`unsupportedFlags` tables are the strongest feature in the app.

### 4.4 Backend measurement semantics
- **TTFT** = first non-empty stream `delta − t_start` (benchmark engine.py:263-283; loadtest engine.py:169-181), recorded as `None` for non-streaming. Correct + matches docs (guide:90-113). `[VERIFIED]`
- **Generation tok/s** = `completion_tokens / (t_end − t_first_token)` — the transient-decode-phase rate (the "first token" is excluded from the window because it belongs to prefill/TTFT). Matches the guide (guide:137-139) and is a defensible, industry-friendly convention. Note vLLM's official TPOT uses `N−1` in the denominator (guide:141-143); both are correct with different phase accounting. `[VERIFIED]`
- **E2E tok/s** = `completion_tokens / t_total`. `[VERIFIED]`
- **Percentiles** use `np.percentile` (linear method) (engine.py:172-176) matching the guide (guide:174-191). P99 on small N is statistically weak — the guide itself warns P99 needs ≥500-1K (guide:193-198), yet the benchmark ships `num_runs` 1-20; P99 on 3-10 runs is cosmetic. Tool should either lower it or label it. `[HEURISTIC/known]`
- **Power** = mean of **one pre-sample and one post-sample** (`(p0+p1)/2`, engine.py:253-256, 298-304) — a very coarse approximation of "during inference" power; matches the guide's stated sampling method (guide:211-215) but the README's "Correlates GPU power draw during active generation" (README.md:129) overstates it. `[HEURISTIC]`
- **Quality heuristics** (app/benchmark/quality.py): coherence `0.60·repetition + 0.40·structure` (with distinct-1/distinct-2, 4-gram loop penalty) (69-98); relevance `0.70·lexical-overlap + 0.30·informativeness` (232-235); composite `0.50/0.50` (249); **pass iff composite ≥ 0.40 AND repetition ≥ 0.25** (254). JSON scenarios get separate weights (217-222) and crash/blank/invalid responses are `quality_valid=False` (191-211). The docs are **admirably honest** about the limits — negation failure and off-topic matches score high (guide:319-322) and it is explicitly not MT-Bench/MMLU. `[VERIFIED vs docs]`
- **Safe max concurrency** (engine.py:479-504): tiers evaluated ascending, AND'd on `err ≤ 5%` + `quality ≥ 95%`, **monotonic** (first failing tier breaks — a broken higher tier cannot rescue a lower pass). Matches guide protocol (guide:257-275) and is covered by a dedicated unit test. SLA thresholds are policy, not physics — labelled as such. `[VERIFIED]`
- **Stress auto-abort** at per-step fail-rate > 20% (engine.py:401-403). `[VERIFIED]`

### 4.5 Small consistency/robustness finds
- `context_generator`: source comment says paragraphs are "~65 words (~75-80 tokens)" (context_generator.py:66, 11 comments "~65 tokens") while code uses `tokens_per_para = 75`; the fixed instruction hook "Summarize the primary architectural optimization…" (context_generator.py:73) biases every scaling prompt toward memory-bandwidth topics. Harmless, but the constant/comment should agree. `[MISMATCH]`
- `quality_integrity_rate` defaults to **1.0 when there are zero results** (engine.py:190-191) — optimistic placeholder. And the Compare page defaults the same badge to `?? 1` (Compare.jsx; see 3.7) — a run with no valid results shows 100%. Recommend `—` / 0 instead. `[MISMATCH]`
- `evaluateHostFit(gpuSizer.js:423-437)` supports **two overloaded calling conventions** (object-detect vs positional) in one function — works, but it's incidental complexity worth collapsing.
- Errored benchmark iterations are still persisted and still feed latency aggregates (engine.py:306-309) — defensible, just be careful interpreting "avg latency" on a mixed run.

---

## 5. Data, Persistence & State

- **Schema** (async SQLite, `llm_platform.db`; `create_tables()` on startup, database.py:192-195):
  - `runtimes` (id, name, runtime_type, endpoint, api_key, is_active, notes, created_at)
  - `benchmark_runs` + `benchmark_results` (models/benchmark.py:11-70) — result rows per iteration/step incl. `prompt_length_target`, `raw_response`, all quality fields; run rows carry all aggregates (ttft, tok/s, P50/P95/P99, power, tok/W, quality rate).
  - `load_test_runs` + `load_test_results` (models/load_test.py:11-70) — includes `safe_max_concurrency`, `abort_reason`, `runtime_healthy_throughout`, `is_transient_error`, `timed_out`.
  - `prompt_templates` seeded with **7 built-ins** + protected edit/delete (`is_builtin` guard, database.py:40-143, api/prompt_templates.py:72-97).
- **Migration strategy**: hand-rolled `_migrate_columns_sync` does PRAGMA `table_info` + conditional `ALTER TABLE ADD COLUMN` for a fixed list (database.py:146-175). Pragmatic for SQLite; no alembic. **Debt store**: no version stamp, additions require editing a hardcoded list.
- **Frontend state** (Zustand): `monitoringStore` (60-point rolling `history`, WS-fed), `runtimeStore`, `benchmarkStore`, `loadTestStore`; single `useWebSocket()` hook with 3 s auto-reconnect (hooks/useWebSocket.js).
- **WebSocket protocol** (`hardware` on /stream 1 Hz; `benchmark_progress/completed/failed/stopped`, `load_test_progress/completed/stopped/failed`, `runtime_health_alert`, `ping` every 30 s on /events). Documented fully in README.md:451-473 and extended by `benchmark_progress`'s `context_length` field.
- **Export**: benchmark CSV columns exact (export.py:23-40), load-test CSV capped at 10,000 rows (export.py:52), JSON single-run summaries; `?token=` support for browser anchor downloads (auth.py:28-30).

> ⚠️ **Telemetry authenticity — [MISMATCH]:** `monitoringStore.js:15-33` **fabricates 30 synthetic trailing history points** (sine/cos jitter) the first time a real WS frame arrives, so the dashboard's "60s window" chart **always starts with fake data** before real samples accumulate. This is benign (stylistic prefill) but is *not* real telemetry; either drop it or label it (e.g., "warming up").

---

## 6. Dependencies, Risk & Debt

- **Backend**: fully pinned (requirements.txt:1-16): fastapi 0.115.0, uvicorn 0.30.6, httpx 0.27.2, pydantic 2.9.2, sqlalchemy 2.0.35, aiosqlite 0.20.0, psutil 6.0.0, pynvml 11.5.0, structlog 24.4.0, numpy 2.1.1, scipy 1.14.1, greenlet 3.1.1, …
- **Unused dependencies — [VERIFIED unused in `app/`]**: `scipy`, `aiofiles`, `python-multipart` are in requirements but have **no import anywhere** in `backend/app`, `backend/run.py`, or tests. `structlog` is used only for logging setup in main.py. Trim candidates.
- **Frontend**: caret-ranged but ships a committed `package-lock.json` (CI uses `npm ci || npm install`, ci.yml:51). React 18.3, react-router 6.26, zustand 5, recharts 2.12, axios, lucide-react, clsx.
- **No lint / typecheck / format tooling anywhere** — no `eslint`, no `prettier`, no `tsc`, no `flake8/ruff/black`; CI is pytest + vite build only (ci.yml:34, 58). This is the biggest consistency risk given VllmOptimizer.jsx is a 4,292-line hand-written file.
- **Giant component debt**: VllmOptimizer.jsx (4,292 lines) is one file containing ~20 sub-features; GpuSizer math duplicated across Benchmark.jsx/LoadTest.jsx via shared `gpuSizer.js` (good) — consider extracting the vLLM optimizer's model/version/flag logic into testable pure modules.
- **Single-process assumption**: cancellation registries (`_ACTIVE_BENCH_RUNS`, `_ACTIVE_RUNS`), the WS `ConnectionManager` singleton, and FastAPI `BackgroundTasks` are all in-process. Running `uvicorn --workers >1` (or the default Docker setup with 1 worker is fine, but **`run.py` runs with `reload=True`**, run.py:9) would split these across processes: stop-requests could target an empty registry and WS events would mysteriously not arrive. Either document "1 worker only" or key state on a shared store. Also: if the server restarts mid-run, a run stays `running` forever (no startup reaper). **[INFERRED risk, real]**
- **FastAPI BackgroundTasks caveat**: run executes *after* the response is sent, so the UI relies entirely on WS; a client that only polls `GET /{id}` will see `pending→completed` with no intermediate progress. Fine for the SPA, worth knowing for API consumers.
- No migration framework, no seed/version stamps (see §5).
- ~12.6k lines total (py + js/jsx) — monetizable scope, but the vLLM optimizer's flag tables will drift as both vLLM V1 and V2 evolve upstream; mitigate with the existing `--help` diff feature (already present, VllmOptimizer.jsx:785-848).

---

## 7. Testing

- **22 tests, 4 files** (all run under pytest-asyncio / ASGITransport or mocked httpx):
  - `test_api.py` — 5: health, runtimes CRUD, monitoring snapshot, benchmark & load-test delete/clear (tests beyond auth-disabled defaults).
  - `test_mock_runtime.py` — 4: Ollama streaming parse, OpenAI health/models, **full run_benchmark aggregate** against a mocked adapter, **watchdog crash detection**.
  - `test_benchmark_enhancements.py` — 7: quality evaluator (coherent, repetition-loop, blank/error, JSON), context generator lengths, template CRUD + builtin protection, context-scaling + JSON export round-trip.
  - `test_enhancements.py` — 6: adapter client reuse, quality truth-table, **safe-concurrency monotonicity**, multi-GPU power aggregation, API-key auth (3 methods), WS auth via `?token`.
- **CI** (`.github/workflows/ci.yml`): backend `PYTHONPATH=. pytest tests/ -v` on 3.11 + frontend `vite build` on Node 20. No secret scan, no lint, no coverage gate.
- **Gaps**: **zero frontend tests** — most critically none for the `gpuSizer.js` math that drives three pages, and none for `VllmOptimizer`'s flag-generation/V1-omission rules (the highest-risk logic in the app). No unit test for `loadtest` aggregate math beyond safe-concurrency; no test for stop/cancel races; no test for export CSV exactness; context-scaling is tested only at the API level (POST echoes), not for engine loop counting.
- **Test hygiene caveat** (documented in README.md:614): tests share the default `llm_platform.db` with the running app; consider an isolated `DATABASE_URL` fixture.

---

## 8. Security

- **Auth is opt-in and off by default**: `API_KEY=None` ⇒ every endpoint is open (auth.py:24-26; README documents this explicitly). Any shared/remote deployment **must** set `API_KEY` or the machine's LLM endpoints and DB are fully exposed (including a key that can read your registered runtimes' stored `api_key` fields via `GET /api/runtimes`). `[IMPORTANT]`
- **Hardcoded secret in source — [IMPORTANT]**: `VllmOptimizer.jsx:722` hardcodes `apiKey: 'dyno-prod-key-99'` into `DEFAULT_FLAGS` and it will be emitted into generated vLLM server commands and the export center. It is a *runtime-server* key, not DynoLLM's own auth key, but a fixed secret in source risks (a) real usage with a guessable key, (b) leaking a real prod key into git one day. Move to env/`.env` and generate.
- **Key-in-URL**: `?token=` query auth for exports/WS (auth.py:28-30, README.md:268) means the key can appear in server/proxy logs and `Referer` headers — a documented tradeoff for browser downloads; fine locally.
- **String comparison** `key == settings.API_KEY` is not constant-time (auth.py:29-37) — negligible for a local LAN tool, cheap to fix.
- **No rate limiting** on any endpoint (background-triggered tests are cheap to spam). A deployed instance behind auth can still be DoS'd by concurrent run spam given `MAX_CONCURRENT_USERS=200` stress runs.
- **CORS** locked to localhost origins with `allow_credentials=True` (main.py:37-43) — appropriate default.
- WebSocket sockets auth via `verify_ws_api_key` with `WS_1008_POLICY_VIOLATION` close on failure (auth.py:47-73). `[VERIFIED]`
- **README overclaims Apple support**: README.md:154 says "Apple Silicon Support: Graceful **unified memory tracking** on macOS / Metal" — the collector has **no** IOKit/Metal/unified-memory path; on a Mac `pynvml` init fails, `_GPU_AVAILABLE=False`, and all GPU fields go to `0`/`None` (collector.py:12-19, 61-94). It degrades gracefully (CPU/RAM/disk still stream) but does *not* track unified memory. The GPU Sizer's `evaluateHostFit` does compute an Apple-unified-RAM path from `ram_total_bytes` (gpuSizer.js:503-544) — but that is estimation, not telemetry. **[MISMATCH — sharpen the wording]**
- No `dangerouslySetInnerHTML` usage found; React-escaped rendering throughout. `.env*` and `*.db` are gitignored (gitignore:13-16, 34-39).

---

## 9. Recommendations (priority-ordered)

**P0 — correctness/honesty**
1. Replace the synthetic telemetry pre-fill in `monitoringStore.js:15-33` with real warm-up frames or an explicit "warming up" state — the dashboard currently shows fabricated data.
2. Remove the hardcoded `apiKey: 'dyno-prod-key-99'` (VllmOptimizer.jsx:722); read from env or user input, and add a secret regex to CI.
3. Fix `quality_integrity_rate` default `1.0` (engine.py:190-191) and Compare's `?? 1` badge → show `—` when no results.
4. Correct README Apple-unified-memory wording (README.md:149-155) and either restore the `context_generator` constant/comment (context_generator.py:66 vs 11) or add a calibration test asserting actual token counts.

**P1 — engineering hardening**
5. Confine multi-worker/reload: document "run tests/loads with exactly 1 uvicorn worker" or key cancellation/WS state in a durable store; add a startup reaper to fail-stale `running` runs.
6. Add unit tests for `gpuSizer.js` math (KV formula parity with the A10G worked example — guide:437-469 is already a golden vector) and for VllmOptimizer's generated-command/flag-omission logic (VllmOptimizer.jsx:1398-1410). These are the two highest-risk modules with zero tests.
7. Drop unused deps (`scipy`, `aiofiles`, `python-multipart`); add `ruff` + `eslint` + `prettier` to CI so the 4.3k-line optimizer file can't rot silently.
8. Standardize VRAM units (GB vs GiB) in `gpuSizer.js` and reconcile the flat `+1.5 GB` (GpuSizer.jsx:94) vs `%` overhead (gpuSizer.js:277-284) paths; surface `detected:false` in `parseModelName`.
9. Move hand-rolled column migrations (database.py:146-175) to alembic (or add a schema version table) before the schema grows further.

**P2 — product polish**
10. Mark the vLLM Optimizer's parametrized factors (`0.42`, quant/spec multipliers — VllmOptimizer.jsx:1073-1108) and the 14 ms cache-hit TTFT as "model assumption" with a one-line explanation UI.
11. Label benchmark P99 as indicative (sample sizes 1-20); nudge `num_runs` toward ≥20 for percentile claims (guide:193-198 even tells you).
12. Add an opt-in `?token=` mitigation (strip from `Referer`/logs) if deployments become shared; add a simple run-concurrency cap to prevent run-spam DoS.

**Overall:** a genuinely impressive, well-documented local tool with rigorous commitment to separating *theoretical capacity* from *empirically validated serving capacity* (the ≥3.5× better than most "GPU user calculators" decision), honest docs about heuristic limitations, complete CRUD/stop/delete/export surface, and a test suite that covers the most safety-critical backend invariants. Its principal debts are operational (single-process assumption, no linters, no frontend tests for the sizing math), not conceptual.

*DynoLLM Report — all paths relative to `/Users/ganeshjayaprakash/DynoLLM`.*