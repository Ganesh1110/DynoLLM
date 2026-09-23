# 📐 DynoLLM: Developer's Guide to LLM Metrics & Sizing Calculations

> **Audience:** Junior engineers, LLMOps practitioners, and backend developers.
> **Purpose:** Provide a rigorous, production-accurate, and easy-to-understand breakdown of every metric, formula, and heuristic used in **DynoLLM** and modern serving engines like **vLLM**.

---

## 🎯 Architecture of this Guide

To avoid confusing **ground-truth physics/engine metrics** with **internal design choices or heuristics**, every metric in this guide is structured with four clear labels:

```text
1. 🏷️ Metric Classification: [Official Engine Metric | Physics/Math | DynoLLM Heuristic | DynoLLM SLA Target]
2. 📖 Definition & Measurement Boundary (Client vs. Server)
3. 🧮 Mathematical Formula & Worked Example
4. 💡 DynoLLM Implementation Notes & Real-World Gotchas
```

---

## 📑 Table of Contents

1. [LLM Inference Lifecycle & Measurement Boundaries](#1-llm-inference-lifecycle--measurement-boundaries)
2. [Single-Request Performance Metrics](#2-single-request-performance-metrics)
   - [Time-to-First-Token (TTFT)](#time-to-first-token-ttft)
   - [Total End-to-End Latency](#total-end-to-end-latency)
   - [Decode Throughput (Generation Speed) vs. TPOT](#decode-throughput-generation-speed-vs-tpot)
   - [Inter-Token Latency (ITL)](#inter-token-latency-itl)
   - [Statistical Percentiles (P50, P90, P95, P99)](#statistical-percentiles-p50-p90-p95-p99)
   - [Energy Efficiency: Tokens per Watt & Tokens per Joule](#energy-efficiency-tokens-per-watt--tokens-per-joule)
3. [Concurrent Load Testing & Capacity Metrics](#3-concurrent-load-testing--capacity-metrics)
   - [Offered RPS vs. Completed Throughput](#offered-rps-vs-completed-throughput)
   - [Error Rate & Windowing Strategies](#error-rate--windowing-strategies)
   - [Safe Max Concurrency (Empirical Testing Protocol)](#safe-max-concurrency-empirical-testing-protocol)
4. [Output Quality & Integrity Scoring](#4-output-quality--integrity-scoring)
   - [Understanding Degradation Under Load](#understanding-degradation-under-load)
   - [DynoLLM Coherence Heuristic (N-Gram Diversity & Structure)](#dynollm-coherence-heuristic)
   - [DynoLLM Lexical Overlap Score (Relevance)](#dynollm-lexical-overlap-score)
   - [Composite Integrity Score & Pass/Fail Rules](#composite-integrity-score--passfail-rules)
5. [GPU Sizing & First-Principles VRAM Modeling](#5-gpu-sizing--first-principles-vram-modeling)
   - [Raw Model Weights Footprint](#raw-model-weights-footprint)
   - [The First-Principles KV Cache Formula (Attention Architecture)](#the-first-principles-kv-cache-formula)
   - [Empirical Proof: NVIDIA A10G + Qwen-14B on vLLM](#empirical-proof-nvidia-a10g--qwen-14b-on-vllm)
   - [Calculating True GPU Concurrency Limits](#calculating-true-gpu-concurrency-limits)
   - [Batching Dynamics: Why Speed per User is Not a Simple Division](#batching-dynamics-why-speed-per-user-is-not-a-simple-division)
6. [Telemetry & LLM-Native Engine Metrics](#6-telemetry--llm-native-engine-metrics)
7. [Quick-Reference Formula Cheat-Sheet](#7-quick-reference-formula-cheat-sheet)

---

## 1. LLM Inference Lifecycle & Measurement Boundaries

### The Two Phases of Inference

Generative transformer models operate in two fundamentally different compute regimes:

1. **Prefill Phase (Prompt Evaluation):**
   - **Characteristics:** Compute-bound ($\text{TFLOPS}$). All input tokens in the prompt are processed simultaneously through matrix-matrix multiplications ($GEMM$).
   - **Primary Metric:** Time-To-First-Token ($\text{TTFT}$).
2. **Decode Phase (Autoregressive Token Generation):**
   - **Characteristics:** Memory bandwidth-bound ($\text{GB/s}$). Tokens are generated one by one. For every single generated token, the GPU must stream model weights across high-bandwidth memory ($HBM$) through matrix-vector operations ($GEMV$).
   - **Primary Metric:** Decode Throughput ($\text{tokens/s}$) or Time Per Output Token ($\text{TPOT}$).

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ MEASUREMENT BOUNDARY OVERVIEW                                                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Client Boundary (DynoLLM Benchmark Engine)                                             │
│  t_start                                                                        t_end  │
│    │◄───────────────────────────── Total Client Latency ──────────────────────────►│   │
│    │◄──── Client TTFT ────►│                                                       │   │
│────┼───────────────────────┼───────────────────────────────────────────────────────┼───│
│    │ [Network + HTTP Stack]│ [Network In-Flight]                                   │   │
│────┼───────────────────────┼───────────────────────────────────────────────────────┼───│
│    │                       │◄────────────── Engine Decode Duration ───────────────►│   │
│    │  [vLLM Queue]         ▼                                                       ▼   │
│    │  [Prefill Execution]  First Chunk Emitted                                     │   │
│    │                                                              Final Chunk Done │   │
│ Server / vLLM Engine Boundary                                                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

> ⚠️ **Junior Dev Note on Boundaries:**
> When DynoLLM runs on your laptop and tests a remote server over Wi-Fi/Internet, `t_start` and `t_end` include network transit and socket latency. In contrast, an engine like vLLM measures time inside the GPU process. Always record whether a metric is **client-measured** or **engine-internal**.

---

## 2. Single-Request Performance Metrics

### Time-to-First-Token (TTFT)

- **Classification:** 🟢 *Official Industry Benchmark Metric* ([vLLM Benchmark Definition](https://docs.vllm.ai/en/latest/benchmarking/cli/))
- **Definition:** The time interval between dispatching the inference request and receiving the first streamed token of output.

#### Mathematical Formula:
$$\text{TTFT} = t_{\text{first\_token}} - t_{\text{start}}$$

- In DynoLLM (client-side): Measured via Python `time.perf_counter()` when the first streaming HTTP chunk with non-empty text arrives.
- In vLLM (engine-side): $\text{TTFT}_{\text{engine}} = t_{\text{queue}} + t_{\text{prefill}}$.

#### Worked Example:
- Request dispatched: $t_{\text{start}} = 10.000\text{ s}$
- First token chunk arrives: $t_{\text{first\_token}} = 10.245\text{ s}$
$$\text{TTFT} = (10.245 - 10.000) \times 1000 = \mathbf{245\text{ ms}}$$

#### 💡 DynoLLM Implementation vs. Industry Standards:
- **Streaming Requirement:** If streaming is disabled (`use_streaming = False`), TTFT cannot be isolated from the total roundtrip.
- **Tokens vs. Words:** A token is a sub-word chunk (e.g., `" un"`, `"believ"`, `"able"`). TTFT measures the arrival of the *first token*, not a full word.
- **DynoLLM SLA Targets (Example Policy, Not Physical Law):**
  - Instantaneous target: $< 250\text{ ms}$
  - Interactive chatbot target: $250\text{ ms} - 800\text{ ms}$
  - Batch / background target: $> 2.0\text{ s}$ acceptable

---

### Total End-to-End Latency

- **Classification:** 🟢 *Standard Measurement*
- **Definition:** Total elapsed wall-clock time from request dispatch to final token receipt.

#### Mathematical Formula:
$$\text{Latency}_{\text{E2E}} = t_{\text{end}} - t_{\text{start}}$$

#### Worked Example:
- Request started: $t_{\text{start}} = 10.000\text{ s}$
- Stream finished: $t_{\text{end}} = 12.350\text{ s}$
$$\text{Latency}_{\text{E2E}} = (12.350 - 10.000) \times 1000 = \mathbf{2350\text{ ms (2.35 s)}}$$

---

### Decode Throughput (Generation Speed) vs. TPOT

- **Classification:** 🟡 *Care Required: Two Distinct Industry Definitions*

Developers often confuse **Decode Throughput** ($\text{tokens/sec}$) with **Time Per Output Token (TPOT)** ($\text{seconds or ms per token}$). They are related, but defined differently.

#### 1. DynoLLM Decode Throughput (Generation Speed):
Measures the generation rate exclusively during the decode phase:
$$\text{Decode Throughput} = \frac{N_{\text{completion\_tokens}}}{t_{\text{end}} - t_{\text{first\_token}}}$$

#### 2. vLLM Official TPOT (Time Per Output Token):
vLLM benchmarks define per-request TPOT by dividing the decode duration by $(N_{\text{output\_tokens}} - 1)$ because the first token was already accounted for in TTFT:
$$\text{TPOT} = \frac{\text{Latency}_{\text{E2E}} - \text{TTFT}}{N_{\text{completion\_tokens}} - 1}$$

#### Numerical Comparison:
Given: $N_{\text{completion\_tokens}} = 80$, $\text{Latency}_{\text{E2E}} = 2.250\text{ s}$, $\text{TTFT} = 0.250\text{ s}$:
- Decode duration $= 2.250 - 0.250 = 2.000\text{ s}$
- **DynoLLM Decode Throughput:** $\frac{80}{2.000} = \mathbf{40.0\text{ tok/s}}$
- **vLLM TPOT:** $\frac{2.000}{80 - 1} = \frac{2.000}{79} \approx \mathbf{0.02532\text{ s/token (25.32 ms/token)}}$

Notice that:
$$\text{TPOT} \approx \frac{1}{\text{Decode Throughput}} \quad (\text{for large token counts})$$

#### 3. End-to-End Throughput (E2E tok/s):
$$\text{Throughput}_{\text{E2E}} = \frac{N_{\text{completion\_tokens}}}{t_{\text{end}} - t_{\text{start}}}$$
Because the denominator includes TTFT and prompt prefill, $\text{Throughput}_{\text{E2E}}$ is always lower than Decode Throughput.

---

### Inter-Token Latency (ITL)

- **Classification:** 🟢 *Standard Streaming Metric*
- **Definition:** The time delta between consecutive output tokens $i$ and $i-1$ during streaming.
$$\text{ITL}_i = t_{\text{token}_i} - t_{\text{token}_{i-1}}$$
- **Significance:** While TPOT is an average across the request, ITL captures *jitter*. If ITL spikes from $25\text{ ms}$ to $800\text{ ms}$ mid-sentence due to KV-cache reallocation or batch preemption, the user perceives the text as "stuttering."

---

### Statistical Percentiles (P50, P90, P95, P99)

- **Classification:** 🧮 *Mathematical Statistics*
- **Definition:** Non-parametric distribution values indicating the threshold below which a given percentage of request latencies fall.

#### ⚠️ Correct NumPy Calculation:
Given 10 benchmark latencies in seconds:
$$\text{latencies} = [1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 5.8]$$

Using standard NumPy (`np.percentile(latencies, q, method='linear')`):
- $\mathbf{P_{50}\text{ (Median)}} = \mathbf{2.25\text{ s}}$ *(average of 2.2 and 2.3)*
- $\mathbf{P_{90}} = \mathbf{3.37\text{ s}}$
- $\mathbf{P_{95}} = \mathbf{4.585\text{ s}}$
- $\mathbf{P_{99}} = \mathbf{5.557\text{ s}}$

```python
import numpy as np
latencies = [1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 5.8]
print(np.percentile(latencies, 50))  # 2.25
print(np.percentile(latencies, 90))  # 3.37
print(np.percentile(latencies, 95))  # 4.585
print(np.percentile(latencies, 99))  # 5.557
```

#### 🚨 Junior Dev Warning on Sample Size:
Calculating $P_{99}$ on only 10 requests is statistically invalid because 1 request represents $10\%$ of the entire sample. To evaluate production tail latencies:
- **$P_{50}$ (Median):** Stable with $N \ge 20$ requests.
- **$P_{95}$:** Requires $N \ge 100$ requests.
- **$P_{99}$:** Requires $N \ge 500 - 1,000$ requests to be statistically meaningful.

---

### Energy Efficiency: Tokens per Watt & Tokens per Joule

- **Classification:** 🟢 *Physical Law / Valid Ratio*
- **Physics Definition:** Power is the rate of energy consumption ($1\text{ Watt} = 1\text{ Joule / second}$).

#### Mathematical Derivation:
$$\frac{\text{Tokens / Second}}{\text{Watts}} = \frac{\text{Tokens / Second}}{\text{Joules / Second}} = \mathbf{\frac{\text{Tokens}}{\text{Joule}}}$$

Therefore, **$0.50\text{ tok/s/W}$ is mathematically identical to $0.50\text{ tokens per Joule}$.**

#### DynoLLM Sampling Method:
1. Sample GPU power $P_{\text{start}}$ (Watts) via NVML before inference.
2. Sample GPU power $P_{\text{end}}$ (Watts) after inference completes.
3. $P_{\text{avg}} = \frac{P_{\text{start}} + P_{\text{end}}}{2}$.
$$\text{Tokens per Watt} = \frac{\text{Decode Throughput (tok/s)}}{P_{\text{avg}}}$$

#### ⚠️ Scope Limitation:
NVML only records **GPU ASIC power draw**. It does **not** include:
- Host CPU and motherboard RAM power.
- Power Supply Unit (PSU) conversion efficiency loss.
- Datacenter cooling overhead (PUE - Power Usage Effectiveness).
DynoLLM's metric is therefore a **GPU-specific operational efficiency**, not total datacenter power.

---

## 3. Concurrent Load Testing & Capacity Metrics

### Offered RPS vs. Completed Throughput

- **Classification:** 🟢 *System Design Best Practice*

Under heavy load, systems may fail to keep up with the incoming request volume. DynoLLM distinguishes between:

1. **Offered Request Rate ($\text{RPS}_{\text{offered}}$):** The frequency at which virtual users dispatch requests:
   $$\text{RPS}_{\text{offered}} = \frac{N_{\text{dispatched\_requests}}}{\text{Test Duration}}$$
2. **Completed Throughput ($\text{RPS}_{\text{completed}}$):** The rate at which the server successfully finishes inferences:
   $$\text{RPS}_{\text{completed}} = \frac{N_{\text{successful\_requests}}}{t_{\text{max\_timestamp}} - t_{\text{min\_timestamp}}}$$
3. **Failed Rate ($\text{RPS}_{\text{failed}}$):**
   $$\text{RPS}_{\text{failed}} = \text{RPS}_{\text{offered}} - \text{RPS}_{\text{completed}}$$

> If a test dispatches $20\text{ RPS}$ but the server only completes $8\text{ RPS}$, your server capacity is **$8\text{ RPS}$**, not $20\text{ RPS}$.

---

### Error Rate & Windowing Strategies

- **Classification:** 🟢 *Definition Standard; Window Size is a Design Choice*

$$\text{Error Rate} = \frac{N_{\text{failed\_requests}}}{N_{\text{total\_requests}}}$$

#### Implementation Detail:
- **Overall Error Rate:** Evaluates the entire test run from $t=0$ to end.
- **Sliding Window Error Rate:** DynoLLM streams real-time progress using the **last 50 requests**. This is a **UI/UX design choice** to show immediate degradation without letting early successful runs dilute a sudden failure spike. Other tools use rolling time windows (e.g., last 30 seconds).

---

### Safe Max Concurrency (Empirical Testing Protocol)

- **Classification:** 🟡 *DynoLLM Operational Protocol (Not a Physical Law)*

DynoLLM uses an empirical **Monotonic SLA Protocol** to find production concurrency limits:

#### The Monotonicity Rule:
1. Evaluate concurrency tiers in ascending order ($C_1, C_2, C_3, \dots$).
2. A tier $C$ passes if it satisfies the organization's SLA:
   $$\text{Error Rate} \le 5\% \quad \text{AND} \quad \text{Quality Pass Rate} \ge 95\% \quad (\text{DynoLLM Default Policy})$$
3. **Progression Halts:** If tier $C_k$ fails SLA, testing stops. A higher tier $C_{k+1}$ cannot be declared safe, even if an intermittent run passed by luck.

#### Why a Failure Occurs (Root Causes):
A concurrency tier failure does not inherently mean GPU math broke. Common causes include:
- Engine KV-cache block exhaustion causing requests to queue or abort.
- HTTP client connection pool exhaustion.
- Server socket drop / TCP backlog overflow.
- Host memory paging (swap).

---

## 4. Output Quality & Integrity Scoring

### Understanding Degradation Under Load

Under resource exhaustion, LLM runtimes exhibit specific failure modes:
1. **Preemption & Eviction:** In vLLM, if KV memory runs out, ongoing requests may be preempted (paused and evicted to CPU memory), causing massive latency spikes.
2. **Socket Timeouts & Truncation:** Clients timing out mid-stream receive partial strings.
3. **Sampling Anomalies:** Model quantization or bad sampling settings (e.g., high temperature with zero repetition penalty) can cause infinite repeating loops.

DynoLLM incorporates lightweight heuristic scores to catch these outputs without needing an expensive secondary LLM-as-a-judge.

---

### DynoLLM Coherence Heuristic

- **Classification:** 🔴 *DynoLLM Custom Heuristic (Not an Academic Coherence Metric)*

$$\text{Coherence}_{\text{DynoLLM}} = 0.60 \times \text{Repetition Score} + 0.40 \times \text{Structural Score}$$

#### 1. N-Gram Diversity & Loop Penalty:
- Distinct-1 ($d_1$): Unique tokens / total tokens.
- Distinct-2 ($d_2$): Unique bigrams / total bigrams.
- 4-Gram Loop Penalty: Detects sequences of 4 tokens repeating $\ge 3$ times.
$$\text{Repetition Score} = \max\left(0.0, \, \min\left(1.0, \, 0.35 \cdot d_1 + 0.65 \cdot d_2 - \text{loop\_penalty}\right)\right)$$

#### 2. Structural Integrity:
- Clean sentence terminal punctuation (`.`, `!`, `?`, `}`): $+0.25$.
- Balanced brackets (`()`, `{}`, `[]`): $+0.15$.
- Standard ASCII/alphanumeric character ratio: $+0.10$.

---

### DynoLLM Lexical Overlap Score

- **Classification:** 🔴 *DynoLLM Custom Lexical Match (Not True Semantic Relevance)*

DynoLLM evaluates lexical overlap by stripping stopwords and matching word stems:
$$\text{Overlap} = \frac{|\text{Prompt Content Stems Found in Output}|}{|\text{Total Prompt Content Stems}|}$$

$$\text{Lexical Score} = 0.70 \times \text{Overlap} + 0.30 \times \min\left(1.0, \frac{|\text{Content Words}|}{15}\right)$$

#### ⚠️ Limitations of Lexical Matching:
- **Negation Failure:** The prompt *"Is Paris in Germany?"* answered with *"Paris is not in Germany"* contains exact keyword overlap (`Paris`, `Germany`) and scores 100%, even though a naive model might have said *"Paris is in Germany"*.
- **Off-topic Matching:** A model that outputs *"Germany has many cities, but Paris is nice"* scores well lexically while failing semantic precision.
- **Future Roadmap:** For true semantic validation, use embedding cosine similarity (`gte-small`, `bge`) or task-specific schema validators (Pydantic / JSON schema).

---

### Composite Integrity Score & Pass/Fail Rules

$$\text{Composite Score} = 0.50 \times \text{Coherence}_{\text{DynoLLM}} + 0.50 \times \text{Lexical Score}$$

- **Default DynoLLM SLA Pass Threshold:**
  $$\text{Valid} \iff \text{Composite Score} \ge 0.40 \quad \text{AND} \quad \text{Repetition Score} \ge 0.25$$
- **Quality Integrity Rate %:**
  $$\text{Quality Integrity Rate} = \frac{N_{\text{valid}}}{N_{\text{total}}} \times 100\%$$

---

## 5. GPU Sizing & VRAM Capacity Planning

> ⚠️ **Important Fundamental:** There is **no single formula** that can accurately predict the number of real users a GPU can serve.
> - **GPU Memory Capacity** can be calculated analytically from the model architecture and runtime configuration.
> - **Actual Serving Capacity & Performance** cannot be predicted from a formula alone; it must be empirically benchmarked under load.

DynoLLM therefore reports two fundamentally different values:
1. **Theoretical Memory Capacity** — calculated analytically from model/runtime architecture parameters.
2. **Validated Serving Capacity** — measured empirically by benchmark and concurrent load testing.

---

### 5.1 GPU Memory Budget

Let:
- $M_{\text{gpu}}$: Physical GPU memory in bytes (e.g. 24 GB).
- $U$: Engine GPU memory utilization factor (`gpu_memory_utilization`, e.g. 0.90 in vLLM).
- $M_{\text{budget}}$: Total memory available to the inference engine instance.

$$\mathbf{M_{\text{budget}} = M_{\text{gpu}} \times U}$$

**Example:**
- Physical GPU Memory ($M_{\text{gpu}}$): $23.0\text{ GiB}$ (usable device memory on an A10G)
- vLLM GPU Utilization ($U$): $0.90$
- Engine Memory Budget: $M_{\text{budget}} = 23.0 \times 0.90 = \mathbf{20.7\text{ GiB}}$

vLLM's `gpu_memory_utilization` represents the fraction of physical GPU memory available to the model executor.

---

### 5.2 Memory Available for KV Cache

The KV cache pool is **not** simply GPU memory minus the disk model-file size. The inference runtime also consumes memory for:
1. Model weights ($M_{\text{weights}}$)
2. Non-Torch CUDA context and driver allocations ($M_{\text{nonTorch}}$)
3. Peak activation memory during prefill ($M_{\text{peakActivation}}$)
4. Temporary scratchpads, workspace buffers, and framework overhead ($M_{\text{other}}$)

Therefore, the remaining memory dedicated to the KV cache pool ($M_{\text{KV}}$) is:

$$\mathbf{M_{\text{KV}} = M_{\text{budget}} - M_{\text{runtime}}}$$

Where:
$$\mathbf{M_{\text{runtime}} = M_{\text{weights}} + M_{\text{nonTorch}} + M_{\text{peakActivation}} + M_{\text{other}}}$$

> 💡 **Best Practice:** For maximum reliability, DynoLLM obtains $M_{\text{runtime}}$ and $M_{\text{KV}}$ directly from the inference engine profile whenever available, because engines like vLLM perform dynamic GPU memory profiling during startup to determine the exact remaining KV cache pool.

---

### 5.3 Exact KV-Cache Cost per Token

For a standard full-attention transformer, the memory required to store the Key and Value vectors for a single token is:

$$\mathbf{KV_{\text{bytes/token}} = N_{\text{layers}} \times N_{\text{KVheads}} \times (H_K + H_V) \times B_{\text{dtype}}}$$

Where:
- $N_{\text{layers}}$: Number of transformer layers.
- $N_{\text{KVheads}}$: Number of Key/Value attention heads (in Grouped Query Attention / GQA, $N_{\text{KVheads}} \ll N_{\text{query\_heads}}$).
- $H_K$: Key head dimension.
- $H_V$: Value head dimension.
- $B_{\text{dtype}}$: Bytes per KV-cache element ($2\text{ bytes}$ for BF16/FP16, $1\text{ byte}$ for FP8).

For the common architecture where $H_K = H_V = H$:

$$\mathbf{KV_{\text{bytes/token}} = 2 \times N_{\text{layers}} \times N_{\text{KVheads}} \times H \times B_{\text{dtype}}}$$

This architecture-based calculation matches the structure used by vLLM's `AttentionSpec`, which derives KV-cache storage from KV heads, head size, value-head size, and cache data type.

---

### 5.4 KV Cache for One Request (Block / PagedAttention Rounding)

Let:
- $L$: Sequence length (prompt + output cached tokens).
- $B$: KV-cache block size in tokens (typically $16$ tokens in vLLM PagedAttention).

Because paged KV caches allocate memory in discrete blocks rather than individual tokens, the allocated token count is rounded up to the nearest block boundary:

$$\mathbf{L_{\text{allocated}} = \left\lceil \frac{L}{B} \right\rceil \times B}$$

The total KV memory consumed by a single request is:

$$\mathbf{KV_{\text{request}} = L_{\text{allocated}} \times KV_{\text{bytes/token}}}$$

---

### 5.5 Maximum Theoretical Concurrent Full-Length Requests

For identical concurrent requests running at a maximum context length $L$:

$$\mathbf{C_{\text{theoretical}} = \left\lfloor \frac{M_{\text{KV}}}{KV_{\text{request}}} \right\rfloor}$$

> ⚠️ **What this metric means vs. what it does NOT mean:**
> - **It means:** *"How many requests of exactly this token length could fit into available KV-cache memory simultaneously without running out of memory?"*
> - **It does NOT mean:** *"How many concurrent users my application can serve."*
>
> Serving capacity depends on throughput, asynchronous queuing, request arrival rates, latency targets, and human idle/reading duty cycles.

---

### 5.6 Concrete Example: Qwen3-14B on an NVIDIA A10G

Let's examine an actual production instance of **Qwen3-14B-FP8** served by **vLLM on an NVIDIA A10G GPU**:

#### 1. Architectural Specs from Model `config.json`:
- $N_{\text{layers}} = 40$
- $N_{\text{KVheads}} = 8$ (Grouped Query Attention)
- $H = 128$ (Head dimension)
- Model KV Cache Dtype: `BF16` $\implies B_{\text{dtype}} = 2\text{ bytes}$

#### 2. Calculate Exact KV Cost per Token:
$$KV_{\text{bytes/token}} = 40 \times 8 \times (128 + 128) \times 2 = \mathbf{163,840\text{ bytes / token}} \quad (\approx 160\text{ KiB / token})$$

#### 3. KV Memory for an 8,192-Token Request:
With block size $B = 16$, $L_{\text{allocated}} = \lceil 8192 / 16 \rceil \times 16 = 8,192\text{ tokens}$.
$$KV_{\text{request}} = 163,840\text{ bytes/token} \times 8,192\text{ tokens} = 1,342,177,280\text{ bytes} \approx \mathbf{1.25\text{ GiB}}$$

Three such requests require:
$$3 \times 1.25\text{ GiB} \approx \mathbf{3.75\text{ GiB KV Cache}}$$

#### 4. Matching the Real vLLM Profiler Output:
On startup, vLLM profiles the A10G device memory and logs:
- Usable GPU memory: $\approx 22.06\text{ GiB}$
- Runtime memory (weights + activations + buffers): $\approx 15.83\text{ GiB}$
- **Available KV cache pool ($M_{\text{KV}}$): $\mathbf{3.75\text{ GiB}}$**
- **GPU KV cache size: $\mathbf{24,592\text{ tokens}}$**
- **Maximum concurrency for 8,192 tokens/request: $\mathbf{3.00\times}$**

Verification:
$$24,592\text{ tokens} \times 163,840\text{ bytes/token} = 4,029,150,208\text{ bytes} \approx 3.752\text{ GiB}$$
$$C_{\text{theoretical}} = \left\lfloor \frac{3.75\text{ GiB}}{1.25\text{ GiB}} \right\rfloor = \mathbf{3\text{ full-length slots}}$$

The theoretical formula matches vLLM's internal memory manager to the exact token.

---

### 5.7 KV Cache Changes with Context Length

For this Qwen3-14B architecture ($163,840\text{ bytes/token}$), KV cache scales linearly with sequence length:

| Cached Tokens / Request ($L$) | Approx. KV Memory / Request | Max Concurrency on A10G ($3.75\text{ GiB}$ Pool) |
| :--- | :--- | :--- |
| **$2,048$ tokens (2k)** | $\mathbf{0.3125\text{ GiB}}$ | $\lfloor 3.75 / 0.3125 \rfloor = \mathbf{12\times}$ |
| **$4,096$ tokens (4k)** | $\mathbf{0.625\text{ GiB}}$ | $\lfloor 3.75 / 0.625 \rfloor = \mathbf{6\times}$ |
| **$8,192$ tokens (8k)** | $\mathbf{1.250\text{ GiB}}$ | $\lfloor 3.75 / 1.250 \rfloor = \mathbf{3\times}$ |
| **$16,384$ tokens (16k)** | $\mathbf{2.500\text{ GiB}}$ | $\lfloor 3.75 / 2.500 \rfloor = \mathbf{1\times}$ |
| **$32,768$ tokens (32k)** | $\mathbf{5.000\text{ GiB}}$ | $0\times$ (Exceeds available pool; requires CPU offload) |
| **$40,960$ tokens (40k)** | $\mathbf{6.250\text{ GiB}}$ | $0\times$ (Exceeds available pool) |

This is why **context length is the single most critical input** to GPU capacity sizing.

---

### 5.8 FP8 KV Cache

The KV-cache dtype can be configured independently from model weight precision:
- If the KV cache uses **FP8** (`cache_dtype="fp8"`):
  $$B_{\text{dtype}} \approx 1\text{ byte}$$
- Raw theoretical KV storage is approximately half of BF16:
  $$KV_{\text{FP8}} \approx KV_{\text{BF16}} \times \frac{1}{2}$$
  - For Qwen3-14B: $KV_{\text{bytes/token}} \approx 81,920\text{ bytes/token}$ ($\approx 0.625\text{ GiB}$ per 8k request).
  - Maximum full-length concurrency on A10G jumps from **$3\times$ to $6\times$**!

*Note:* Actual engine memory may include scale/packing metadata overhead. DynoLLM records this as *raw theoretical KV memory* and uses the engine's reported KV capacity when connected.

---

### 5.9 Tensor Parallelism

For multi-GPU deployments, the KV-cache calculation must account for tensor/context parallel sharding:
- Across $TP$ GPUs, attention heads are sharded:
  $$N_{\text{KVheads/GPU}} = \frac{N_{\text{KVheads}}}{TP}$$
- A simplified single-GPU formula cannot be applied directly to multi-GPU clusters without dividing heads across the tensor parallel size.

---

### 5.10 Theoretical Capacity vs. Validated Serving Capacity

DynoLLM strictly separates theoretical memory capacity from real-world serving capacity:

```text
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│ THEORETICAL KV CAPACITY              │     │ VALIDATED SERVING CAPACITY           │
├──────────────────────────────────────┤     ├──────────────────────────────────────┤
│ • Derived from attention math        │     │ • Measured by empirical load test    │
│ • "How many slots fit in VRAM?"      │     │ • "Can the server meet SLA targets?" │
│ • Example: 3 x 8k-token slots        │     │ • Example: 8 concurrent users @ P95  │
└──────────────────────────────────────┘     └──────────────────────────────────────┘
```

**Why they differ:**
In a chat application, human users do not generate tokens simultaneously 100% of the time. While reading responses or typing prompts, their session consumes zero compute and may leverage prompt caching. Thus, a GPU with **3 theoretical active slots** can often comfortably serve **15 to 25 interactive human users** via asynchronous queueing, provided latency SLAs are maintained.

---

### 5.11 Production Safe-Concurrency Formula

DynoLLM defines safe production concurrency using a multi-dimensional SLA threshold:

Let:
- $E(c)$: Error rate at concurrency $c$.
- $\text{TTFT}_{95}(c)$: 95th-percentile Time-to-First-Token.
- $\text{TPOT}_{95}(c)$: 95th-percentile Time Per Output Token.
- $Q(c)$: Semantic quality integrity pass rate.
- $\text{OOM}(c)$: Whether an out-of-memory or worker crash event occurred.

The highest validated safe concurrency level is:

$$\mathbf{C_{\text{safe}} = \max \left\{ c : \begin{array}{l} E(c) \le E_{\text{max}} \\ \text{TTFT}_{95}(c) \le \text{TTFT}_{\text{max}} \\ \text{TPOT}_{95}(c) \le \text{TPOT}_{\text{max}} \\ Q(c) \ge Q_{\text{min}} \\ \text{OOM}(c) = \text{false} \end{array} \right\}}$$

The thresholds ($E_{\text{max}}$, $\text{TTFT}_{\text{max}}$, $\text{TPOT}_{\text{max}}$, $Q_{\text{min}}$) are organization SLA configurations, not physical constants.

---

### 5.12 What DynoLLM Displays (Separation of Concerns)

Instead of displaying misleading statements like *"This 24GB GPU can support 46 users"*, DynoLLM displays:

```text
[CALCULATED (Model Architecture)]
  • GPU VRAM: 23.0 GiB
  • Memory Budget (U=0.90): 20.7 GiB
  • KV Cache Dtype: BF16 (2 bytes/elem)
  • KV Bytes / Token: 163,840 bytes (~160 KiB)
  • Requested Context: 8,192 tokens
  • KV Memory / Request: 1.25 GiB
  • Theoretical Full-Length Slots: 3 concurrent requests

[MEASURED (Load Test Empirical Results)]
  • Validated Concurrency: 8 users
  • Measured Completed RPS: 4.2 req/s
  • Measured P95 TTFT: 340 ms
  • Measured P95 TPOT: 28.4 ms/tok
  • Error Rate: 0.0%
  • Quality Integrity Rate: 100.0%

[SLA / POLICY]
  • Max Allowed Error Rate: <= 5.0%
  • Min Quality Pass Rate: >= 95.0%
  • Monotonicity Enforcement: ACTIVE
```

---

### 5.13 The Core Pipeline Rule

$$\mathbf{\boxed{ \text{GPU Memory} \;\to\; \text{Runtime Memory} \;\to\; \text{KV Memory} \;\to\; \text{KV bytes/token} \;\to\; \text{Theoretical Slots} \;\to\; \text{Load Test} \;\to\; \text{Validated Concurrency} }}$$

> **The Guiding Principle for DynoLLM:**
> **Don't build a "GPU User Calculator." Build a "GPU Capacity Estimator + Empirical Validator."**

---

## 6. Telemetry & LLM-Native Engine Metrics

Hardware metrics give system health, but LLM serving requires tracking **engine-level state**:

### Host & Hardware Telemetry (via DynoLLM Collector)

| Metric | Source / Tool | Purpose |
| :--- | :--- | :--- |
| **CPU Utilization %** | `psutil.cpu_percent()` | High CPU during inference flags tokenizer or HTTP serialization bottlenecks. |
| **System RAM %** | `psutil.virtual_memory()` | Detects OS memory leaks and weight-swapping to disk. |
| **GPU Utilization %** | `pynvml.nvmlDeviceGetUtilizationRates().gpu` | Percentage of time GPU compute cores are active. |
| **VRAM Allocated %** | `pynvml.nvmlDeviceGetMemoryInfo()` | Physical memory occupied on device. |
| **GPU Power Draw (W)** | `pynvml.nvmlDeviceGetPowerUsage()` | Active power in Watts for energy profiling. |

### LLM-Native Engine Metrics (Exposed via vLLM `/metrics`)

For production monitoring, connect your dashboard to vLLM's Prometheus endpoint:

```text
vllm:num_requests_running        Number of requests currently undergoing decode
vllm:num_requests_waiting        Number of requests sitting in the queue (capacity exceeded)
vllm:num_requests_swapped        Number of requests preempted to CPU RAM due to KV exhaustion
vllm:gpu_cache_usage_factor      Fraction of GPU KV cache blocks currently allocated (0.0 to 1.0)
vllm:avg_prompt_throughput_tok_s Prefill processing rate
vllm:avg_generation_throughput   Decode generation rate
vllm:time_to_first_token_seconds Histogram of TTFT
vllm:time_per_output_token_s     Histogram of TPOT
```

---

## 7. Quick-Reference Formula Cheat-Sheet

| Metric | Official / Engineering Formula | Primary Purpose | Classification |
| :--- | :--- | :--- | :--- |
| **TTFT** | $t_{\text{first\_token}} - t_{\text{start}}$ | Time to start streaming | 🟢 Industry Standard |
| **Total Latency** | $t_{\text{end}} - t_{\text{start}}$ | Full roundtrip duration | 🟢 Industry Standard |
| **Decode Throughput** | $\frac{N_{\text{completion\_tokens}}}{t_{\text{end}} - t_{\text{first\_token}}}$ | Generation rate during decode | 🟡 Throughput Metric |
| **TPOT** | $\frac{\text{E2E} - \text{TTFT}}{N_{\text{completion\_tokens}} - 1}$ | Time per output token | 🟢 vLLM Definition |
| **Tokens per Watt** | $\frac{\text{tok/s}}{P_{\text{avg}}}$ ($\equiv \frac{\text{tokens}}{\text{Joule}}$) | GPU Energy Efficiency | 🟢 Physical Equivalence |
| **Completed RPS** | $\frac{N_{\text{completed}}}{\Delta t}$ | Finished throughput capacity | 🟢 Standard Metric |
| **KV Cache per Token** | $2 \times N_{\text{layers}} \times N_{\text{KV\_heads}} \times d_{\text{head}} \times \text{bytes}$ | Exact attention memory cost | 🧮 Transformer Physics |
| **Max Concurrent Slots** | $\lfloor \frac{\text{Available KV Cache}}{\text{KV per Request}} \rfloor$ | Hard GPU memory capacity | 🧮 Memory Architecture |
| **Coherence Score** | $0.60(\text{Repetition}) + 0.40(\text{Structure})$ | Output loop/integrity check | 🔴 DynoLLM Heuristic |
| **Lexical Overlap** | $\frac{|\text{Prompt Stems} \cap \text{Output Stems}|}{|\text{Prompt Stems}|}$ | Fast keyword coverage check | 🔴 DynoLLM Heuristic |

---

*DynoLLM Documentation &copy; DynoLLM Open Source Project.*
