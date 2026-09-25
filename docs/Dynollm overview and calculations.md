# DynoLLM — Overview & Calculations Reference

**Repository:** github.com/Ganesh1110/DynoLLM
**Verified against commit:** `b326b7f` (2026-09-25)
**Verification method:** every formula and status below was confirmed by opening the actual source file and, where applicable, running the real test suite — not inferred from commit messages.

**Test status at this commit:** Frontend 22/22 passing · Backend 27/27 passing · Production build clean (2389 modules, no errors)

---

## 1. What DynoLLM Is

DynoLLM is a self-hosted benchmarking, load-testing, and capacity-planning platform for **local LLM serving** (Ollama, vLLM, LM Studio, and any OpenAI-compatible endpoint). It has two distinct halves that should not be confused with each other:

| Half                                                                               | What it does                                                                                              | Data source                                                                                      |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Measurement core** (Dashboard, Runtimes, Benchmark, Load Test, History, Compare) | Runs real requests against a real running LLM endpoint and records what actually happened                 | **Real** — HTTP calls, live telemetry, SQLite-persisted results                                  |
| **Sizing estimators** (GPU Sizer, vLLM Optimizer)                                  | Predicts VRAM, throughput, and cost _before_ you deploy, from architecture math and calibration constants | **Calculated** — first-principles formulas + empirically-tuned multipliers, not live measurement |

The product's real differentiator is the bridge between the two: measured results from a real run can be fed back into the estimator (`Link Real Run` / `Populate from Last Run` in the vLLM Optimizer) so predictions can be checked against reality rather than trusted blindly.

---

## 2. Stack Summary

- **Backend:** FastAPI (async) + SQLAlchemy 2 (async, SQLite) + psutil/pynvml telemetry + httpx runtime adapters
- **Frontend:** React 18 + Vite 5 + Tailwind + Recharts + Zustand
- **Pages:** Dashboard, Runtimes, Benchmark, Load Test, GPU Sizer, vLLM Optimizer, Compare, History
- **Domain logic location:** `frontend/src/utils/gpuSizer.js` (GPU/VRAM math), `frontend/src/utils/vllmOptimizer.js` + `frontend/src/data/vllmConstants.js` (vLLM Optimizer math and reference data), `frontend/src/utils/tokenMetrics.js` (token/cost math), `backend/app/benchmark/engine.py` + `backend/app/loadtest/engine.py` (real measurement aggregation)

---

## 3. Core Calculations

All memory math in this codebase is standardized on **binary GiB** (2³⁰ = 1,073,741,824 bytes). Model sizes in billions of parameters are decimal (10⁹); the conversion constant is:

```
BYTES_PER_GIB = 1024^3
GIB_PER_BILLION = 1e9 / BYTES_PER_GIB  ≈ 0.9313 GiB per 10^9 params (at 1 byte/param)
```

### 3.1 Model Weights VRAM

**Location:** `gpuSizer.js: calcVRAM()`

```
weightsGiB    = (params_billion × 1e9 × bytes_per_param) / 1024³
totalVramGiB  = weightsGiB × (1 + overheadPct / 100)
```

- `bytes_per_param`: 2.0 for FP16/BF16, ~0.55 for common 4-bit quantization (Q4_K_M-style), ~1.0 for FP8/INT8
- `overheadPct`: per-model default, typically 20–30%, covering activations/runtime buffers not captured by the KV formula below

### 3.2 KV Cache Size (exact attention-architecture formula)

**Location:** `gpuSizer.js: calcDetailedKvSpecs()`

```
bytesPerToken   = 2 × N_layers × N_kvHeads × headDim × bytesPerElement
allocatedTokens = ceil(context / blockSize) × blockSize      (PagedAttention block rounding)
totalBytes      = bytesPerToken × allocatedTokens
kvGiB           = totalBytes / 1024³
```

- The leading `2` accounts for storing both Key and Value tensors.
- `bytesPerElement`: 2 for BF16/FP16 KV cache, 1 for FP8 KV cache (halves KV memory).
- `blockSize`: vLLM PagedAttention block granularity, default 16 tokens.
- If a model's exact architecture (layers/kvHeads/headDim) isn't known, DynoLLM falls back to family-typical GQA defaults (e.g. 32 layers / 8 KV heads for ≤8B models) — these fallback values are estimates, not measured from the actual model config.

**Worked example (Qwen3-14B, BF16 KV, 8,192-token context, block size 16):**

```
bytesPerToken = 2 × 40 × 8 × 128 × 2 = 163,840 bytes/token (≈160 KiB/token)
KV for 8,192 tokens = 163,840 × 8,192 = 1,342,177,280 bytes ≈ 1.25 GiB per request
```

### 3.3 Theoretical Concurrency (memory-bound slot count)

**Location:** `gpuSizer.js: evaluateGpuConcurrency()`

```
memoryBudget   = GPU_VRAM_GiB × gpuMemoryUtilization      (default utilization = 0.90)
usableVram     = memoryBudget − 1.0 GiB                    (fixed reserve for CUDA context/peak activations)
kvVramAvailable = usableVram − weightsGiB
C_theoretical  = floor(kvVramAvailable / kvPerUserGiB)
```

This is a **memory-capacity** ceiling, not a throughput prediction — it answers "how many concurrent full-length requests can physically fit," independent of how fast they'd actually run.

### 3.4 Estimated Decode Throughput (roofline-style, calibrated)

**Location:** `vllmOptimizer.js: calcEstimatedDecodeTps()`

```
rawBandwidth      = GPU_bandwidth_GBps × (tensorParallelSize if scalingMode == 'tp' else 1)
rawToks           = (rawBandwidth × memBusEfficiency × 1.4) / max(weightsGiB, 0.5)
calibratedSpeed   = rawToks × quantSpeedFactor × 0.42 × specFactor × tpOverhead
estimatedDecodeTps = clamp(calibratedSpeed, min=12, max=GPU_maxComputeTps)
```

Calibration constants (fixed, not derived per-model):

- `memBusEfficiency`: 0.65 baseline, 0.70 (Ada), 0.74 (A100), 0.80 (Hopper) — architecture-dependent memory-bus utilization assumption
- `quantSpeedFactor`: FP8 = 1.85 (native) / 1.05 (fallback dequant), INT4-AWQ = 2.45, INT4-GPTQ = 2.55, compressed-tensors = 1.85, GGUF = 1.95
- `specFactor` (speculative decoding): n-gram = 1.45, draft-model = 1.60, EAGLE = 1.75
- `tpOverhead` = `1 − 0.06 × log2(TP)` — communication penalty for tensor parallelism

**This is the single most "estimated" number in the app.** It is a memory-bandwidth roofline model tuned with hand-picked multipliers, not a measured value — treat it as a starting planning number, then validate with a real Benchmark/Load Test run.

### 3.5 Estimated Time-to-First-Token (TTFT)

**Location:** `vllmOptimizer.js: calcEstimatedTtftMs()`

```
if prefix_caching_enabled:
    TTFT = 14 ms                     (idealized cache-hit shortcut)
else:
    promptLen        = min(context, 2048)
    prefillComputeMs = (2 × params_billion × 1e9 × promptLen) / (peakTflops × 1e12 × 0.45) × 1000
    kernelOverheadMs = 8 (H100) or 16 (other GPUs)
    TTFT = prefillComputeMs + kernelOverheadMs
```

The `14 ms` cache-hit branch is an optimistic idealization (an immediate cache hit with near-zero prefill), not a full-miss compute model — worth mentally flagging as a best case, not an average case.

### 3.6 Tensor-Parallel Head-Divisibility Guardrail

**Location:** `vllmOptimizer.js: validateTpConfig()`

vLLM requires attention heads to be evenly divisible by the tensor-parallel degree:

```
valid  ⟺  (Q_heads % TP == 0)  AND  (KV_heads % TP == 0)
```

DynoLLM blocks invalid TP selections with a guardrail before generating a command that would crash on server startup.

---

## 4. Real Measurement Formulas (Backend — actual runtime data, not estimates)

### 4.1 Time-to-First-Token (TTFT) — measured

**Location:** `benchmark/engine.py`, `loadtest/engine.py`

```
TTFT = timestamp(first streamed token) − timestamp(request start)
```

Recorded as `None` for non-streaming requests (no intermediate token boundary to measure).

### 4.2 Generation Throughput — measured

```
generation_tokens_per_second = completion_tokens / (t_end − t_first_token)
```

This measures the pure **decode-phase** rate (excludes prefill/TTFT window). vLLM's own TPOT metric divides by `(N−1)`; DynoLLM's convention divides by the decode-phase wall-clock — both are defensible, differently-scoped conventions, not competing "correct" answers.

### 4.3 Percentiles

```
p50/p95/p99 = numpy.percentile(latencies, [50, 95, 99], method='linear')
```

⚠️ P99 on a sample size below a few hundred runs is statistically weak — treat single-digit or low-double-digit `num_runs` percentiles as indicative, not precise.

### 4.4 Quality Scoring (heuristic, not semantic evaluation)

**Location:** `benchmark/quality.py`

```
repetition_score = 0.35 × distinct_1 + 0.65 × distinct_2 − loop_penalty
coherence (standard) = 0.60 × repetition_score + 0.40 × structure_score
coherence (JSON scenario) = 0.50 × json_validity + 0.30 × repetition_score + 0.20 × structure_score
relevance = 0.70 × concept_coverage + 0.30 × informativeness
composite = 0.50 × coherence + 0.50 × relevance

quality_valid ⟺ composite ≥ 0.40  AND  repetition_score ≥ 0.25
```

This is a **lightweight lexical/structural heuristic** — distinct n-gram ratios, keyword overlap, repetition-loop detection — explicitly not a semantic quality judge (not MT-Bench, not LLM-graded). It can be fooled by on-topic-but-wrong answers and penalize legitimately repetitive-but-correct output (e.g. code). Use it as a coarse regression signal, not a ground-truth quality score.

### 4.5 Safe Max Concurrency (empirical SLA tiering)

**Location:** `loadtest/engine.py`

```
Tier C is "safe" ⟺  error_rate(C) ≤ 0.05  AND  quality_integrity_rate(C) ≥ 0.95

Monotonicity rule: concurrency tiers are evaluated ascending; the first tier that
fails SLA halts the scan. A higher tier passing cannot "rescue" a lower failing tier.
```

This is the app's most rigorous claim — the _only_ place a "safe capacity" number comes from actually hammering the real endpoint at increasing concurrency and recording what happens, rather than estimating from static math.

### 4.6 Quality Integrity Rate — empty-run handling

```
quality_integrity_rate = quality_passed / len(results)   if results is non-empty
                        = None                             if results is empty
```

(Fixed during this development cycle — previously defaulted to `1.0`/100% on zero-result runs, which misrepresented failed runs as fully successful. UI now renders `—` instead of a false 100%.)

---

## 5. Token & Cost Accounting

### 5.1 Token Tracking

- **Benchmark:** tracks `prompt_tokens` (in) and `completion_tokens` (out) per iteration natively.
- **Load Test:** tracks the same, with a fallback estimator when a runtime doesn't report prompt-token counts in its stream: `prompt_tokens ≈ word_count × 1.33` (a rough tokens-per-word approximation — real when the runtime reports it, estimated otherwise).

### 5.2 Workload Classification

**Location:** `tokenMetrics.js: classifyWorkload()`

```
prefillPercent = round(prompt_tokens / (prompt_tokens + completion_tokens) × 100)
regime = 'prefill-bound' if prefillPercent ≥ 65 else 'decode-bound'
```

Prefill-bound workloads (RAG, long-context, summarization) and decode-bound workloads (chat, code-gen) benefit from different vLLM tuning (`--max-num-batched-tokens`, chunked prefill, prefix caching) — this classification is derived from real measured token ratios, not assumed.

### 5.3 Dual Cost Model

**A. Self-hosted GPU hardware cost** (`tokenMetrics.js: calcHardwareCosts()`):

```
runCost        = (duration_seconds / 3600) × GPU_$/hr
costPerMillion = (runCost / total_tokens) × 1,000,000
```

**B. Cloud-API-equivalent reference** (`loadtest/engine.py`, config-driven):

```
cost_estimate = (prompt_tokens × $_in_per_million + completion_tokens × $_out_per_million) / 1,000,000
```

Default rates (configurable in `backend/app/core/config.py`, not hardcoded):

```
DEFAULT_PROMPT_COST_PER_MILLION     = $0.50
DEFAULT_COMPLETION_COST_PER_MILLION = $1.50
DEFAULT_GPU_HOURLY_COST             = $0.70/hr
```

The two models answer different questions: (A) "what does my own GPU-hour cost me per token at this throughput," (B) "what would this traffic have cost on a typical commercial API." The vLLM Optimizer surfaces both side-by-side so a self-hosted deployment can be benchmarked against the cloud-API alternative.

---

## 6. Known Caveats & Honest Limitations

| Item                                      | Status                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Roofline decode-speed model (§3.4)        | Calibrated estimate, not measured — validate against real Benchmark/Load Test runs before trusting for capacity planning     |
| TTFT cache-hit shortcut (§3.5)            | Optimistic idealization (14ms), not an average-case model                                                                    |
| Quality heuristic (§4.4)                  | Lexical/structural, not semantic — coarse signal only                                                                        |
| P99 latency on small `num_runs`           | Statistically unreliable below roughly a few hundred samples                                                                 |
| Architecture fallback defaults (§3.2)     | Used only when a model's real layers/heads/headDim aren't in the curated catalog — estimate, not measured from `config.json` |
| Prompt-token fallback in Load Test (§5.1) | Word-count-based estimate, used only when the runtime doesn't report real usage                                              |

---

## 7. Fixes Applied During This Development Cycle (verified against source)

1. **Empty-run quality default** — `quality_integrity_rate` no longer defaults to `1.0`/100% on zero results; correctly returns `None`/`—` in both backend aggregation and the Compare page badge.
2. **Synthetic telemetry removed** — the Dashboard's live chart no longer pre-fills 30 fabricated sine/cosine data points before real WebSocket samples arrive.
3. **GiB unit standardization** — model-weight VRAM math now consistently uses binary GiB (`BYTES_PER_GIB = 1024³`) throughout, matching the KV-cache math that already used it (previously ~2.4–7% underestimation from mixed decimal/binary units).
4. **`VllmOptimizer.jsx` decomposition** — extracted from a single 4,292-line file into `vllmConstants.js` (reference data) and `vllmOptimizer.js` (pure calculation functions), cutting the page component by ~1,400 lines and making the math independently unit-testable.
5. **Chart/gauge animation smoothing** — Dashboard telemetry chart now uses `monotone` interpolation with `900ms` tweened animation instead of hard-snapping on each 1Hz update; gauge bars use a `700ms` eased transition.
6. **Load Test token tracking** — brought to parity with Benchmark: `prompt_tokens`, `tokens_in_per_second`, `tokens_out_per_second`, `input_token_ratio` now tracked and persisted for concurrent load-test runs.
7. **Dual cost model unification** — self-hosted GPU $/hr cost and cloud-API-equivalent cost now shown side-by-side rather than treated as competing philosophies; cloud-API rates moved from hardcoded values into configurable settings.
8. **Closed-loop "measured → sized"** — the vLLM Optimizer can now import real token counts, concurrency, and workload classification directly from a past Benchmark or Load Test run (via a fetched run-picker or deep-linked URL params), so sizing predictions can be checked against actual measured traffic.
9. **V1-engine flag correctness** — the generated vLLM CLI/`.env`/`docker-compose.yml` output correctly omits flags (`--enable-prefix-caching`, `--enable-chunked-prefill`) that are default-on/removed in vLLM's V1 engine (0.8.0+), preventing generated commands that would error against a current vLLM install. A live `--help`-output diff tool lets a user verify DynoLLM's assumptions against their actual installed binary rather than trusting a hardcoded version table.

---
