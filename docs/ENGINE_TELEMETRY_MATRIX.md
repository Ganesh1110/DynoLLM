# DynoLLM Engine Telemetry Availability Matrix

This document provides a reference matrix of all engine-level metrics captured and resolved by DynoLLM across inference engines, versions, and exposition protocols.

---

## 1. Engine Telemetry Availability Matrix

| Metric Category | Logical Name in DynoLLM | Prometheus / Raw Name | vLLM 0.4–0.7 (V0) | vLLM 0.8+ (V1 Engine) | Ollama (Native / `/api/ps`) | llama.cpp / Generic |
|---|---|---|:---:|:---:|:---:|:---:|
| **KV Cache** | `kv_cache_usage_pct` | `vllm:gpu_cache_usage_perc` / `vllm:kv_cache_usage_perc` | ✅ (0.0–1.0) | ✅ (0.0–1.0) | ⚠️ (Approx via VRAM) | ❌ |
| | `num_total_gpu_blocks` | `vllm:num_total_gpu_blocks` | ✅ | ✅ | ❌ | ❌ |
| | `num_free_gpu_blocks` | `vllm:num_free_gpu_blocks` | ✅ | ✅ | ❌ | ❌ |
| **Request Queues** | `requests_running` | `vllm:num_requests_running` | ✅ | ✅ | ⚠️ (via active models) | ❌ |
| | `requests_waiting` | `vllm:num_requests_waiting` | ✅ | ✅ | ❌ | ❌ |
| | `requests_swapped` | `vllm:num_requests_swapped` | ✅ | ✅ | ❌ | ❌ |
| **Token Rates** | `prompt_tokens_total` | `vllm:prompt_tokens_total` / `vllm:prompt_tokens` | ✅ | ✅ | ❌ (Batch only) | ❌ |
| | `generation_tokens_total` | `vllm:generation_tokens_total` / `vllm:generation_tokens` | ✅ | ✅ | ❌ (Batch only) | ❌ |
| **Latency Histograms** | `time_to_first_token` | `vllm:time_to_first_token_seconds` (bucket, sum, count) | ✅ | ✅ | ❌ | ❌ |
| | `time_per_output_token`| `vllm:time_per_output_token_seconds` | ✅ | ✅ | ❌ | ❌ |
| | `e2e_request_latency` | `vllm:e2e_request_latency_seconds` | ✅ | ✅ | ❌ | ❌ |
| **Prefix Caching** | `prefix_cache_hit_rate` | `vllm:prefix_cache_hit_rate` | ✅ (if enabled) | ✅ (default) | ❌ | ❌ |
| **Finish Reasons** | `finish_reasons` | `vllm:request_success_total{finished_reason=...}` | ✅ (stop, length, abort) | ✅ (stop, length, abort) | ❌ | ❌ |
| **Model VRAM** | `model_vram_breakdown` | `/api/ps` (model size, VRAM footprint) | ❌ | ❌ | ✅ (`size_vram` vs RAM) | ❌ |

---

## 2. Capabilities Map

Whenever DynoLLM polls a runtime (via `GET /api/monitoring/engine-stats`), it dynamically queries `/metrics` and attaches a standardized `capabilities` dictionary:

```json
{
  "queue": true,
  "kv_cache": true,
  "prefix_cache": true,
  "histograms": true,
  "finish_reasons": true,
  "token_rates": true
}
```

The frontend uses this schema to automatically apply the 4-state lifecycle across telemetry cards:
- **Live**: Supported and actively returning fresh non-zero numbers.
- **Unavailable**: Engine or version does not expose this metric (e.g. KV Cache on Ollama).
- **No Data**: Supported by the engine, but no traffic has traversed the engine during the selected window.
- **Stale**: Poller connection interrupted or exceeded the 15-second freshness threshold.

---

## 3. Configuring vLLM for Prometheus Telemetry

To enable Prometheus telemetry scraping for vLLM instances:

```bash
python3 -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3.1-8B-Instruct \
  --port 8000 \
  --enable-metrics \
  --enable-prefix-caching
```

DynoLLM automatically scrapes `http://<vllm_host>:8000/metrics` every 5 seconds, normalizes legacy and V1 metric names via `backend/app/monitoring/prom_resolver.py`, and streams real-time derivatives to the Telemetry Grid.

---

## 4. Correlated Run Linking & Bottleneck Detection

1. **Active Run Linking**:
   - While a Benchmark or Load Test is running, DynoLLM tags incoming engine samples with the active `run_id`.
   - Results pages display the **Linked Engine Telemetry** strip, correlating TTFT/P95 latency spikes with peak KV cache pressure and queue depth.
2. **Root-Cause Diagnostics (`computeBottlenecks`)**:
   - **KV Block Swapping Active**: Alerts when `requests_swapped > 0`, indicating KV cache spilling into host RAM.
   - **Severe Engine Queue Backlog**: Alerts when `requests_waiting > 5`, indicating saturation of concurrent batch slots.
   - **Prefix Cache Thrashing**: Alerts when multi-turn requests have `< 15%` prefix hit rate under concurrency.
   - **Prefill Bottleneck**: Flags high P95 TTFT (`> 2.5s`).
