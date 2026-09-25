# Fast & Efficient LLM Inference with vLLM — Core Concepts & Architecture Guide

> **Course Reference:** DeepLearning.AI & Red Hat — *Fast & Efficient LLM Inference with vLLM*  
> **Target Application:** Architectural enhancements and benchmarking upgrades for **DynoLLM**

---

## Executive Summary

The DeepLearning.AI and Red Hat course *"Fast & Efficient LLM Inference with vLLM"* presents a complete, production-grade engineering workflow for serving large language models at scale.

The central thesis of the course is:
> **High-performance LLM deployment requires co-optimizing across three distinct pillars:**
> 1. **Model Optimization:** Compressing weights and activations (via **LLM Compressor**) to maximize hardware arithmetic intensity and fit memory constraints.
> 2. **High-Throughput Serving:** Eliminating memory fragmentation and scheduling bubbles using virtual memory paging (**PagedAttention**) and iteration-level scheduling (**Continuous Batching**, **Chunked Prefill**, **Prefix Caching** in **vLLM**).
> 3. **Production Benchmarking & Quality Evaluation:** Stress-testing throughput vs. latency trade-offs under real-world concurrency using realistic load profiles (**GuideLLM**) and verifying quality preservation (**lm-evaluation-harness**).

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │                       THE MODERN INFERENCE LIFECYCLE                   │
   └────────────────────────────────────────────────────────────────────────┘
          │                                  │                               │
          ▼                                  ▼                               ▼
 ┌──────────────────┐               ┌──────────────────┐           ┌──────────────────┐
 │   1. COMPRESS    │               │    2. DEPLOY     │           │   3. BENCHMARK   │
 │  LLM Compressor  │ ────────────> │       vLLM       │ ────────> │ GuideLLM / Dyno  │
 │ (GPTQ, AWQ, FP8) │               │  PagedAttention  │           │ (TTFT, ITL, SLO) │
 └──────────────────┘               └──────────────────┘           └──────────────────┘
          ▲                                                                  │
          │                                                                  ▼
          └─────────── Quality Feedback Loop (lm-eval) ──────────────────────┘
```

---

## Session-by-Session Core Concepts

### Session 01: Introduction & Course Overview
- **The Serving Dilemma:** While pretraining and fine-tuning focus on optimizing compute FLOPs over days or weeks, LLM inference is an always-on, latency-critical service. Naive serving fails to utilize modern GPUs efficiently, often running at less than 15–20% hardware capacity due to memory bottlenecks.
- **The Modern Inference Stack:**
  - **Optimization:** Compressing models to reduce memory footprint and bandwidth demands without quality loss.
  - **Engine:** Serving via modern runtimes (vLLM) that treat GPU High Bandwidth Memory (HBM) like an operating system manages RAM.
  - **Evaluation:** Rigorous benchmarking across realistic traffic profiles to guarantee Service Level Objectives (SLOs).

---

### Session 02: Why Efficient LLM Deployment Matters
- **The Economics of Inference:** In production, inference costs quickly overtake training costs. Reducing VRAM usage allows running larger models on fewer or cheaper GPUs (e.g., serving a 70B model on 2× A100 instead of 8× A100).
- **The "Speed vs. Cost vs. Accuracy" Trade-Off:**
  - **Speed (Latency/Throughput):** High tokens/sec and low Time-To-First-Token (TTFT) improve user experience.
  - **Cost (Hardware/Energy):** Higher request concurrency per GPU reduces capital and operational expenditures.
  - **Accuracy (Quality):** Aggressive compression must preserve reasoning and domain capability.
- **Service Level Objectives (SLOs):** Production workloads demand strict guarantees:
  - *Interactive Chat:* Low TTFT (<200–500 ms) and human reading speed ITL (>20–30 tokens/sec).
  - *Batch / Document Processing:* Maximizing total system token throughput (tokens/sec) regardless of individual request TTFT.

---

### Session 03: Inference & Memory Fundamentals

#### 1. The Two Phases of LLM Generation
LLM inference is fundamentally asymmetric, split into two distinct phases:

| Dimension | Prefill Phase (Prompt Processing) | Decode Phase (Token Generation) |
|---|---|---|
| **Mechanism** | Computes all prompt tokens in parallel in a single forward pass | Auto-regressive generation: 1 token generated per iteration |
| **Limiting Factor** | **Compute-Bound** (GPU Tensor Cores saturated) | **Memory-Bandwidth Bound** (HBM transfer speeds limit speed) |
| **Primary Metric** | **TTFT** (Time-To-First-Token) | **ITL** (Inter-Token Latency) / **TPOT** (Time Per Output Token) |
| **Arithmetic Intensity** | High ($\text{FLOPs} / \text{Byte}$) | Low ($\text{FLOPs} / \text{Byte}$) |

#### 2. The Roofline Model & Arithmetic Intensity
- **Arithmetic Intensity:** The ratio of compute operations (FLOPs) to memory access (Bytes transferred from HBM to SRAM/registers):
  $$\text{Arithmetic Intensity} = \frac{\text{FLOPs}}{\text{Bytes Transferred}}$$
- In the **Decode phase**, for each single token generated, the GPU must stream *every single weight of the model* across the memory bus to perform matrix-vector multiplications ($y = W \cdot x$). With batch size = 1, arithmetic intensity is $\approx 1 \text{ FLOP/Byte}$, leaving compute cores mostly idle while waiting for memory.
- Increasing concurrency (batching requests) increases arithmetic intensity because the model weights loaded into on-chip cache are reused across multiple tokens simultaneously.

#### 3. KV Cache Architecture and Memory Bloat
- To prevent quadratic recomputation of self-attention for all preceding tokens during each decode step, keys ($K$) and values ($V$) from previous tokens are cached in GPU memory.
- **KV Cache Size Formula:**
  $$\text{Memory}_{\text{KV}} = 2 \times n_{\text{layers}} \times n_{\text{heads}} \times d_{\text{head}} \times b_{\text{bytes}} \times \text{tokens}$$
  *(Where $b_{\text{bytes}} = 2$ for FP16/BF16, or $1$ for FP8/INT8).*
  - For Grouped-Query Attention (GQA), replace $n_{\text{heads}}$ with $n_{\text{kv\_heads}}$.
- **The Fragmentation Crisis in Traditional Serving:**
  - Naive systems pre-allocated memory for the maximum possible sequence length (e.g., 4096 or 8192 tokens) per request.
  - **Internal Fragmentation:** Requests generating only 100 tokens wasted 95%+ of reserved memory.
  - **External Fragmentation:** Dynamic arrivals left gaps in memory that could not accommodate larger requests.
  - Result: Naive engines wasted 60–80% of GPU VRAM on empty reservations, severely limiting batch size.

---

### Session 04: LLM Optimization Fundamentals (Quantization)

Optimization reduces memory footprint, mitigates memory-bandwidth bottlenecks, and increases throughput.

#### 1. Quantization Formats & Strategies
- **Weight-Only Quantization (e.g., W4A16, W8A16):**
  - Weights are compressed to 4-bit or 8-bit integers; activations remain FP16/BF16.
  - Weights are dequantized on-the-fly inside the GPU registers before computation.
  - *Best for:* Memory-bandwidth bound decode phase with low-to-medium batch sizes. Shrinks memory footprint by 2× to 4×, allowing larger models to fit into consumer or smaller enterprise GPUs.
- **Weight & Activation Quantization (e.g., W8A8, FP8):**
  - Both weights and activations are quantized (INT8 or FP8).
  - Modern Tensor Cores (NVIDIA Ada Lovelace, Hopper, Blackwell) perform native INT8/FP8 Matrix Multiplications (GEMM) at 2× the throughput of FP16.
  - *Best for:* High-concurrency serving, compute-bound prefill, and heavy production traffic.
- **FP8 (Floating Point 8):**
  - **E4M3:** 1 sign bit, 4 exponent bits, 3 mantissa bits (higher precision; ideal for inference weights and activations).
  - **E5M2:** 1 sign bit, 5 exponent bits, 2 mantissa bits (wider dynamic range; ideal for gradients/sensitive layers).

#### 2. Advanced PTQ Algorithms
- **RTN (Round-to-Nearest):** Naive rounding; fast but causes noticeable accuracy degradation below 8-bit.
- **GPTQ (Generalized Post-Training Quantization):** Second-order optimization using inverse Hessian error compensation to quantize layer by layer while preserving output fidelity.
- **AWQ (Activation-aware Weight Quantization):** Observes that only 1% of weights (salient weights that correspond to large activation outliers) dictate model quality. Protects those salient channels from aggressive quantization.

---

### Session 05: Optimizing a Model with LLM Compressor

- **What is LLM Compressor?**
  - An open-source library created by Neural Magic (now part of Red Hat) and standard for the vLLM ecosystem.
  - Provides modular "recipes" to apply PTQ (GPTQ, AWQ, SmoothQuant, FP8) and save models in standard Hugging Face safetensors with metadata readable by vLLM.
- **Standard Compression Workflow:**
  1. Load the uncompressed base model (e.g., `Qwen/Qwen2.5-7B-Instruct` or `meta-llama/Llama-3.1-8B`).
  2. Select a calibration dataset (e.g., UltraChat, Open-Platypus) to capture realistic activation distributions.
  3. Apply a quantization recipe (e.g., 4-bit GPTQ with group size 128, or FP8 dynamic per-token scales).
  4. Export to high-performance kernel layouts (e.g., **Marlin** kernels for accelerated W4A16 GEMM).
- **Evaluating Accuracy Trade-Offs:**
  - Quantization without validation is dangerous. Use `lm-evaluation-harness` (`lm-eval`) across representative benchmarks (e.g., MMLU, GSM8K, ARC, HumanEval) to ensure degradation stays within acceptable tolerance (typically <1–2% drop).

---

### Session 06: Serving LLMs Efficiently with vLLM — Part 1

vLLM was designed around two breakthrough core technologies:

#### 1. PagedAttention
- **The Concept:** Inspired by virtual memory and paging in classical operating systems.
- **How it Works:**
  - Physical GPU memory is divided into fixed-size **blocks / pages** (e.g., holding 16 or 32 tokens).
  - A sequence's KV cache is stored in non-contiguous physical blocks.
  - A **Block Table** maintains the mapping from logical token positions to physical blocks.
- **Benefits:**
  - **Near-Zero Memory Waste:** Reduces internal memory waste to <4% (only in the last block of a sequence).
  - **Dynamic Allocation:** Blocks are allocated on-demand as tokens are generated, eliminating speculative over-reservation.
  - **Zero-Copy Memory Sharing:** Complex decoding patterns like parallel sampling (generating $N$ answers for 1 prompt) or beam search share the same prompt physical blocks without duplicating memory.

```
Logical Sequence:  [Block 0 (Tokens 0-15)] ──> [Block 1 (Tokens 16-31)] ──> [Block 2 (Tokens 32-47)]
                              │                              │                             │
Block Table:             Physical #7                   Physical #2                   Physical #19
                              │                              │                             │
Physical VRAM:     [ Physical #2 ]             [ Physical #7 ]              [ Physical #19 ]
                   (Tokens 16-31)              (Tokens 0-15)                (Tokens 32-47)
```

#### 2. Continuous Batching (Iteration-Level Scheduling)
- **Traditional Static Batching:**
  - Requests are grouped into a batch. The GPU waits until the *longest* sequence finishes before returning results and starting new requests.
  - Sequences that finish early produce idle padding bubbles.
- **Continuous Batching:**
  - Scheduling occurs at the *iteration level* (each single token step).
  - When a sequence emits an `<EOS>` token, it immediately leaves the batch, freeing its blocks.
  - New incoming requests join the batch at the very next iteration step.
  - Result: 5× to 20× throughput increase over static batching under concurrent load.

---

### Session 07: Serving LLMs Efficiently with vLLM — Part 2

This session covers advanced optimizations that unlock maximum hardware saturation:

#### 1. Automatic Prefix Caching (APC)
- In multi-turn chat, RAG, and few-shot prompting, the system prompt and context document are identical across requests.
- vLLM hashes prompt prefixes and caches their pre-computed KV blocks in VRAM.
- Subsequent requests matching the prefix skip the compute-heavy prefill phase entirely, dropping TTFT from hundreds of milliseconds to single-digit milliseconds.

#### 2. Chunked Prefill
- **The Problem:** A massive prefill (e.g., an 8,000-token RAG document) consumes the entire GPU compute budget for several hundred milliseconds, causing active decode iterations for all other concurrent users to stall (spiking Inter-Token Latency).
- **The Solution:** Large prompts are broken into chunks (e.g., 512 tokens). Prefill chunks are co-scheduled alongside ongoing decode steps in the same batch, smoothing out latency spikes and maintaining a steady stream of output tokens.

#### 3. Speculative Decoding
- Uses a fast, lightweight "draft model" (or n-gram/speculative head) to generate $K$ candidate tokens sequentially.
- The large target model verifies all $K$ candidates in parallel in a single forward pass (which is compute-bound, effectively free on memory-bandwidth).
- Increases decoding speed by 1.5× to 3× without any loss in output distribution quality.

#### 4. Distributed Serving (Parallelism)
- **Tensor Parallelism (TP):** Splits linear layer matrices across multiple GPUs on the same node via ultra-fast NVLink (splitting attention heads and MLP hidden dimensions).
- **Pipeline Parallelism (PP):** Distributes consecutive transformer layers across separate nodes/GPUs connected via network or InfiniBand.

---

### Session 08: Measuring What Matters — Benchmarking and Evaluation

Benchmarking generative AI requires specialized tools because raw HTTP metrics (like HTTP response time and req/s) obscure generative dynamics.

#### 1. Core Generative Metrics

| Metric | Definition | User Impact | Primary Bottleneck |
|---|---|---|---|
| **TTFT** (Time-To-First-Token) | Time from sending the request to receiving the first token chunk | User-perceived latency / initial responsiveness | Prompt prefill computation + scheduling queue |
| **ITL** (Inter-Token Latency) | Time between consecutive streaming output tokens | Reading smoothness / typing animation feel | GPU memory bandwidth (decode phase) |
| **TPOT** (Time Per Output Token) | Total generation time divided by number of generated tokens | Equivalent to average ITL over the full response | GPU memory bandwidth + batch size |
| **E2E Latency** | Total request duration: $\text{TTFT} + (\text{Output Tokens} \times \text{TPOT})$ | Overall task completion speed | Prefill + Decode combined |
| **Throughput** | Total output tokens generated per second across all users | System capacity and operational ROI | Concurrency saturation & GPU utilization |

#### 2. Concurrency Saturation & The Latency Knee
- As virtual users increase:
  - Throughput initially scales linearly.
  - Per-token latency remains flat.
  - **The Saturation Knee:** Once the KV cache or GPU compute saturates, incoming requests queue up. TTFT and ITL degrade exponentially, causing latency collapse.
  - Benchmarking discovers the *safe operating concurrency* that satisfies production SLOs.

```
Latency / 
Throughput
    │                                              Latency (P95)
    │                                             /
    │                             Throughput     /
    │                           ┌───────────────┘  <-- Saturation Knee
    │                          /                  (Safe operating limit)
    │                         /
    │                        /
    │                       /
    │                      /
    └─────────────────────┴───────────────────────────> Concurrency (VUs)
```

#### 3. GuideLLM & Realistic Traffic Simulation
- Developed by Neural Magic / Red Hat as an open-source benchmarking engine designed specifically for vLLM and OpenAI-compatible endpoints.
- Simulates realistic traffic models:
  - **Rate-based (Poisson / Constant):** Models real-world customer arrival rates.
  - **Concurrency-based:** Simulates fixed virtual users to map saturation curves.
  - **Varied Prompt/Response Distributions:** Tests combinations of short-in/long-out (chat) vs. long-in/short-out (summarization/RAG).

---

### Session 09: Conclusion — Putting It All Together

The production deployment blueprint synthesized from the entire series:

1. **Define Strict SLOs:** Establish maximum acceptable TTFT ($P_{95} \le 500\text{ ms}$), minimum ITL ($\ge 30\text{ tok/s}$), and expected concurrent load.
2. **Optimize the Model:** Use **LLM Compressor** to apply 4-bit (GPTQ/AWQ) or 8-bit (FP8) quantization matched to the target GPU architecture (Ampere, Ada, Hopper).
3. **Verify Quality:** Run `lm-eval` against standard benchmarks to ensure the compressed model retains task accuracy.
4. **Deploy with vLLM:**
   - Configure **PagedAttention** block sizes.
   - Enable **Continuous Batching**, **Chunked Prefill**, and **Automatic Prefix Caching**.
   - Allocate GPU memory headroom (`gpu_memory_utilization = 0.90`).
5. **Stress Test with GuideLLM / DynoLLM:** Map the concurrency vs. latency curve to determine exact instance count and autoscaling thresholds.
6. **Telemetry & Monitoring:** Continuously monitor VRAM, KV cache usage %, TTFT, and ITL percentiles in production.

---

## 🖥️ Practical GPU Sizing & Selection Guide

Can a user choose the right GPU based on this guide? **Yes.** Follow this 4-step first-principles sizing framework and consult the model-to-hardware decision matrix below.

```
                  ┌────────────────────────────────────────────────────────┐
                  │          4-STEP GPU SIZING DECISION PIPELINE           │
                  └────────────────────────────────────────────────────────┘
                                               │
                                               ▼
                         ┌───────────────────────────────────────────┐
                         │ STEP 1: Compute Weights VRAM              │
                         │ M_weights = Parameters × (Bits / 8) × 1.2 │
                         └───────────────────────────────────────────┘
                                               │
                                               ▼
                         ┌───────────────────────────────────────────┐
                         │ STEP 2: Compute KV Cache for Target Load  │
                         │ M_KV = 2 × L × n_kv × d_h × b × C × Tokens│
                         └───────────────────────────────────────────┘
                                               │
                                               ▼
                         ┌───────────────────────────────────────────┐
                         │ STEP 3: Total VRAM & GPU Allocation       │
                         │ VRAM_required = (Weights + KV) / 0.90     │
                         └───────────────────────────────────────────┘
                                               │
                                               ▼
                         ┌───────────────────────────────────────────┐
                         │ STEP 4: Verify Memory Bandwidth (Tok/s)   │
                         │ Decode Speed ≈ Bandwidth (GB/s) / Weights │
                         └───────────────────────────────────────────┘
```

---

### Step 1: Calculate Raw Model Weights Footprint ($M_{\text{weights}}$)
Model weights require memory proportional to parameter count and quantization bitwidth:

$$M_{\text{weights}} \approx P \times \left(\frac{\text{bits}}{8}\right) \times 1.20$$

*(The $1.20$ multiplier accounts for CUDA runtime context, non-Torch allocations, and prefill peak activation buffers).*

- **16-bit (FP16 / BF16):** $\approx 2.4\text{ GB}$ per billion parameters ($7\text{B} \approx 16.8\text{ GB}$, $8\text{B} \approx 19.2\text{ GB}$, $70\text{B} \approx 168\text{ GB}$).
- **8-bit (FP8 / INT8):** $\approx 1.2\text{ GB}$ per billion parameters ($7\text{B} \approx 8.4\text{ GB}$, $8\text{B} \approx 9.6\text{ GB}$, $70\text{B} \approx 84\text{ GB}$).
- **4-bit (GPTQ / AWQ / Q4_K_M):** $\approx 0.65\text{ GB}$ per billion parameters ($7\text{B} \approx 4.6\text{ GB}$, $8\text{B} \approx 5.2\text{ GB}$, $70\text{B} \approx 45.5\text{ GB}$).

---

### Step 2: Calculate KV Cache for Concurrency ($M_{\text{KV}}$)
Unlike static weights, the KV cache grows dynamically with the number of concurrent users ($C$) and the sequence context window ($T_{\text{context}}$):

$$M_{\text{KV\_per\_user}} = 2 \times n_{\text{layers}} \times n_{\text{kv\_heads}} \times d_{\text{head}} \times b_{\text{bytes}} \times T_{\text{context}}$$

> 💡 **Grouped-Query Attention (GQA) Note:** Modern models (Llama-3, Qwen-2.5, Mistral) use GQA where $n_{\text{kv\_heads}} \ll n_{\text{attention\_heads}}$ (e.g., Llama-3-8B has 32 query heads but only 8 KV heads), reducing KV cache size by **4× to 8×**.
> - In Llama-3.1-8B (GQA = 8 heads, 32 layers, head dim = 128, FP16):
>   $$M_{\text{KV\_per\_token}} = 2 \times 32 \times 8 \times 128 \times 2 = 131,072\text{ Bytes} \approx 128\text{ KB/token}$$
>   A 4,096-token sequence consumes: $128\text{ KB} \times 4096 \approx \mathbf{512\text{ MB per active user}}$.

---

### Step 3: Total VRAM & GPU Headroom Calculation
To avoid out-of-memory (OOM) crashes and allow vLLM's memory manager to function without frequent preemptions:

$$\text{Minimum VRAM Required} = \frac{M_{\text{weights}} + (C \times M_{\text{KV\_per\_user}})}{U}$$

*(Where $U = \text{gpu\_memory\_utilization} = 0.90$ by default).*

---

### Step 4: Verify Memory Bandwidth for Decode Speed (Tok/s SLA)
During the autoregressive decode phase (batch size = 1), generating each token requires reading the entire model weight footprint from HBM:

$$\text{Theoretical Max Tok/s (Batch = 1)} \approx \frac{\text{GPU Memory Bandwidth (GB/s)}}{M_{\text{weights\_raw}} (\text{GB})}$$

- **NVIDIA RTX 4090:** $\approx 1008\text{ GB/s}$ memory bandwidth.
  - Serving an 8B 4-bit model ($4.5\text{ GB}$ weights): $\frac{1008}{4.5} \approx \mathbf{224\text{ tok/s}}$ max theoretical.
  - Serving an 8B FP16 model ($15\text{ GB}$ weights): $\frac{1008}{15} \approx \mathbf{67\text{ tok/s}}$ max theoretical.
- **NVIDIA A100 (80GB SXM4):** $\approx 2039\text{ GB/s}$ memory bandwidth.
  - Serving a 70B FP8 model ($70\text{ GB}$ weights): $\frac{2039}{70} \approx \mathbf{29\text{ tok/s}}$ (single-user decode).

---

### 📊 Model-to-GPU Selection Matrix

Use this matrix to identify the exact GPU configuration needed for your chosen model family:

| Model Family | Format / Precision | Minimum Weights VRAM | Recommended Single GPU | Multi-GPU / Distributed (TP) | Max Concurrent Users (4k Ctx) |
|---|---|---|---|---|---|
| **Small (3B – 4B)**<br>*(Llama 3.2 3B, Phi-3 3.8B)* | **FP16**<br>**4-bit (AWQ/GPTQ)** | ~8 GB<br>~2.5 GB | **RTX 3060 12GB / RTX 4060 Ti 16GB**<br>Apple M-series (16GB) | Not needed ($TP=1$) | 10 – 25 users<br>30 – 50+ users |
| **Medium (7B – 8B)**<br>*(Llama 3.1 8B, Qwen 2.5 7B)* | **FP16**<br>**FP8**<br>**4-bit (AWQ/GPTQ)** | ~16 GB<br>~9.5 GB<br>~5.5 GB | **RTX 3090 / 4090 (24GB) / A10G / L4**<br>RTX 4080 (16GB) / L4 (24GB)<br>RTX 3060 12GB / RTX 4060 | Not needed ($TP=1$) | 10 – 16 users<br>25 – 35 users<br>30 – 40 users |
| **Mid-Large (13B – 14B)**<br>*(Qwen 2.5 14B, Mistral NeMo)* | **FP16**<br>**FP8**<br>**4-bit (AWQ/GPTQ)** | ~28 GB<br>~15.5 GB<br>~9.5 GB | **A100 (40GB/80GB) / 2× RTX 3090**<br>RTX 3090 / 4090 (24GB) / L4 (24GB)<br>RTX 4080 16GB / RTX 3060 12GB | $TP=2$ (for FP16 on 24GB GPUs)<br>$TP=1$ (FP8 on 24GB)<br>$TP=1$ (4-bit on 16GB/24GB) | 15 – 30 users<br>12 – 20 users<br>20 – 35 users |
| **High Capability (32B)**<br>*(Qwen 2.5 32B)* | **FP16**<br>**FP8**<br>**4-bit (AWQ/GPTQ)** | ~64 GB<br>~35 GB<br>~20 GB | **A100 80GB / H100 80GB**<br>A100 40GB / RTX 6000 Ada (48GB)<br>**RTX 3090 / 4090 (24GB)** | $TP=2$ (2× A100 or 4× 3090)<br>$TP=2$ (2× 24GB or 1× 48GB)<br>$TP=1$ (Tight on 24GB; $TP=2$ recommended) | 20 – 40 users<br>10 – 20 users<br>4 – 8 users (tight KV) |
| **Frontier Open (70B – 72B)**<br>*(Llama 3.1 70B, Qwen 2.5 72B)* | **FP16**<br>**FP8**<br>**4-bit (AWQ/GPTQ)** | ~145 GB<br>~75 GB<br>~42 GB | **2× A100 80GB / 2× H100 80GB**<br>**1× A100 80GB / 1× H100 80GB**<br>**2× RTX 3090 / 4090 (24GB) or 1× 48GB** | **$TP=2$ or $TP=4$** (NVLink required)<br>**$TP=2$** (for high concurrency)<br>**$TP=2$** (2× 24GB gives 48GB VRAM) | 30 – 60 users<br>10 – 20 users ($TP=1$), 50+ ($TP=2$)<br>8 – 15 users ($TP=2$) |

---

### When to Use Tensor Parallelism ($TP$) vs. Scaling Up
1. **Model Does Not Fit in a Single GPU:**
   - If $M_{\text{weights}} > \text{VRAM}_{\text{GPU}} \times 0.90$, Tensor Parallelism is mandatory.
   - Example: A 70B FP16 model (~145 GB) requires at least $2\times 80\text{ GB GPUs}$ ($TP=2$) or $4\times 40\text{ GB GPUs}$ ($TP=4$).
2. **Interconnect Requirement:**
   - Tensor Parallelism requires frequent all-reduce communication across GPUs at *every transformer layer*.
   - **NVLink / NVSwitch is essential** for multi-GPU $TP$ on data-center GPUs (A100, H100, L40S).
   - Running $TP=2$ over consumer PCIe Gen4 (e.g., dual RTX 4090s without NVLink) incurs a 15–30% latency penalty due to PCIe bandwidth saturation.
3. **KV Cache Headroom Limitation:**
   - Even if an 8B model fits on a single 16GB GPU, only $\sim 2\text{ GB}$ remains for the KV cache, limiting concurrency to 2–3 users. Stepping up to a 24GB GPU expands the KV cache pool from 2 GB to 10 GB, increasing concurrency by **5×**.

---

### Worked Real-World Examples

#### Example A: Interactive Chat for 10 Users on Llama-3.1-8B-Instruct
- **Workload:** 10 concurrent chat sessions, average context length 4,096 tokens, SLA target: TTFT $< 400\text{ ms}$, ITL $< 35\text{ ms}$ (>28 tok/s).
- **Option 1 (FP16):**
  - Weights: $8 \times 2 \times 1.2 = 19.2\text{ GB}$.
  - KV Cache: $10 \text{ users} \times (4096 \times 128\text{ KB}) = 5.12\text{ GB}$.
  - Total VRAM: $(19.2 + 5.12) / 0.90 \approx \mathbf{27.0\text{ GB}}$.
  - *Result:* **Does NOT fit on a single 24GB GPU (RTX 4090 / A10G).**
- **Option 2 (FP8 via LLM Compressor):**
  - Weights: $8 \times 1 \times 1.2 = 9.6\text{ GB}$.
  - KV Cache: $5.12\text{ GB}$.
  - Total VRAM: $(9.6 + 5.12) / 0.90 \approx \mathbf{16.35\text{ GB}}$.
  - *Result:* **Comfortably fits on a single 24GB GPU (RTX 4090 / A10G / L4)** with ~5 GB of extra headroom for traffic bursts.

#### Example B: Enterprise Summarization on Llama-3.1-70B-Instruct
- **Workload:** Long documents (8,192 tokens in, 512 tokens out), high throughput requirement.
- **Hardware Choice:**
  - In FP8: Model weights = ~75 GB. 1× A100 80GB leaves only ~5 GB for KV cache (insufficient for 8k context).
  - **Selected Architecture:** **$2\times \text{NVIDIA A100 80GB}$ with $TP=2$**.
  - Total VRAM: 160 GB. Weights consume 75 GB, leaving **~69 GB for KV cache** ($\approx 70\text{ concurrent 8k context sessions}$).

---

## Actionable Blueprint: Upgrading DynoLLM

To make **DynoLLM** the ultimate local LLM benchmarking platform, integrate the core concepts from this course:

### 1. Granular Streaming Latency Metrics
- **Current:** DynoLLM measures TTFT and overall generation tokens/sec.
- **Upgrade:** Add **Inter-Token Latency (ITL)** tracking:
  - Capture timestamps of *every single streaming chunk*.
  - Calculate ITL distribution: Mean ITL, Jitter (variance), $P_{50}$, $P_{90}$, and $P_{99}$ ITL.
  - Add an interactive **"Streaming Smoothness & Jitter"** chart showing token-by-token emission intervals.

### 2. vLLM Advanced Feature Profiler
- **Prefix Caching Benchmark Mode:**
  - Run identical long-system-prompt requests back-to-back.
  - Measure TTFT speedup (uncached vs. cached) and report estimated KV cache hit rate.
- **Chunked Prefill Impact Test:**
  - Inject a large prompt (e.g., 4k tokens) while concurrent short requests are decoding.
  - Measure whether ongoing stream ITL spikes or remains steady (validating chunked prefill efficacy).
- **Speculative Decoding Speedup Factor:**
  - Compare baseline target model vs. draft-assisted speculative decoding to measure the real-world acceleration ratio.

### 3. Concurrency Saturation & "Knee of the Curve" Analysis
- Automatically run ramp-up benchmarks to identify the exact **Saturation Knee Point** where TTFT or ITL exceeds predefined SLO thresholds.
- Display a recommendation badge:  
  *e.g., "Optimal Concurrency: 14 Concurrent Users (P95 TTFT < 350ms, ITL = 32 ms)"*.

### 4. Arithmetic Intensity & Roofline Advisor
- Calculate estimated arithmetic intensity based on model parameter count, quantization bitwidth, context length, and batch size.
- Visualize whether a given test run was **Memory-Bandwidth Bound** (low concurrency decode) or **Compute-Bound** (high concurrency / long prefill).
