/**
 * Token metrics, workload regime classification, and cost estimation utilities
 */

/**
 * Classify workload regime based on measured input vs output tokens
 * @param {number} promptTokens - Total or average prompt tokens
 * @param {number} completionTokens - Total or average completion tokens
 * @returns {object} Workload classification and recommendations
 */
export function classifyWorkload(promptTokens = 0, completionTokens = 0) {
  const p = Number(promptTokens) || 0
  const c = Number(completionTokens) || 0
  const total = p + c

  if (total <= 0) {
    return {
      regime: 'unknown',
      label: 'No Traffic Data',
      prefillPercent: 0,
      decodePercent: 0,
      badge: 'Unmeasured',
      color: 'gray',
      recommendation: 'Run a benchmark or load test to analyze prompt vs completion distribution.',
    }
  }

  const prefillPercent = Math.round((p / total) * 100)
  const decodePercent = 100 - prefillPercent

  if (prefillPercent >= 65) {
    return {
      regime: 'prefill',
      label: `Prefill-Bound (${prefillPercent}% in / ${decodePercent}% out)`,
      prefillPercent,
      decodePercent,
      badge: `${prefillPercent}% Prefill-Bound`,
      color: 'indigo',
      recommendation:
        'Workload is dominated by prompt evaluation (e.g. RAG, summarization, long-context). Prioritize high --max-num-batched-tokens, enable chunked prefill, and consider prefix caching.',
    }
  }

  if (decodePercent >= 65) {
    return {
      regime: 'decode',
      label: `Decode-Bound (${decodePercent}% out / ${prefillPercent}% in)`,
      prefillPercent,
      decodePercent,
      badge: `${decodePercent}% Decode-Bound`,
      color: 'emerald',
      recommendation:
        'Workload is memory-bandwidth bound during token generation (e.g. chat, creative writing, code generation). Maximize memory bandwidth (HBM3e/HBM3), tune KV cache block size, and use Tensor Parallelism to scale generation speed.',
    }
  }

  return {
    regime: 'balanced',
    label: `Balanced (${prefillPercent}% in / ${decodePercent}% out)`,
    prefillPercent,
    decodePercent,
    badge: 'Balanced Workload',
    color: 'sky',
    recommendation:
      'Balanced distribution between prefill and decode phases. Standard batching configurations with moderate concurrency yield optimal GPU utilization.',
  }
}

/**
 * Calculate token cost based on per-million rates
 * @param {object} params
 * @param {number} params.promptTokens
 * @param {number} params.completionTokens
 * @param {number} [params.promptCostPerMillion=0.50]
 * @param {number} [params.completionCostPerMillion=1.50]
 * @returns {object} Cost breakdown
 */
export function calcTokenCosts({
  promptTokens = 0,
  completionTokens = 0,
  promptCostPerMillion = 0.50,
  completionCostPerMillion = 1.50,
} = {}) {
  const p = Number(promptTokens) || 0
  const c = Number(completionTokens) || 0
  const totalTokens = p + c

  const promptCost = (p * promptCostPerMillion) / 1_000_000
  const completionCost = (c * completionCostPerMillion) / 1_000_000
  const totalCost = promptCost + completionCost

  const effectiveCostPerMillion =
    totalTokens > 0 ? Number(((totalCost / totalTokens) * 1_000_000).toFixed(4)) : 0

  return {
    promptCost: Number(promptCost.toFixed(6)),
    completionCost: Number(completionCost.toFixed(6)),
    totalCost: Number(totalCost.toFixed(6)),
    effectiveCostPerMillion,
  }
}

/**
 * Calculate tokens delivered per dollar
 * @param {number} totalTokens
 * @param {number} totalCost
 * @returns {number|null}
 */
export function calcTokensPerDollar(totalTokens, totalCost) {
  if (!totalTokens || !totalCost || totalCost <= 0) return null
  return Math.round(totalTokens / totalCost)
}

/**
 * Format token count with human-readable suffix (k, M)
 * @param {number} n
 * @returns {string}
 */
export function formatTokenCount(n) {
  if (n == null || isNaN(n)) return '—'
  const val = Number(n)
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`
  return `${Math.round(val)}`
}

/**
 * Calculate self-hosted hardware cost for a test run based on duration and hourly GPU rate
 * @param {object} params
 * @param {number} params.durationSeconds - Run duration in seconds
 * @param {number} [params.gpuHourlyCost=0.70] - Hourly GPU rental/depreciation rate ($/hr)
 * @param {number} [params.totalTokens=0] - Total tokens generated/processed
 * @returns {object} Hardware cost breakdown
 */
export function calcHardwareCosts({
  durationSeconds = 0,
  gpuHourlyCost = 0.70,
  totalTokens = 0,
} = {}) {
  const dur = Math.max(0, Number(durationSeconds) || 0)
  const rate = Math.max(0, Number(gpuHourlyCost) || 0)
  const tokens = Math.max(0, Number(totalTokens) || 0)

  const durationHours = dur / 3600.0
  const runCost = durationHours * rate
  const costPerMillion =
    tokens > 0 ? Number(((runCost / tokens) * 1_000_000).toFixed(4)) : 0

  return {
    durationSeconds: dur,
    durationHours,
    gpuHourlyCost: rate,
    runCost: Number(runCost.toFixed(6)),
    costPerMillion,
  }
}

/**
 * Compute tiered concurrency breakdown from individual load test results
 * @param {Array} results - Raw request results from load test
 * @returns {Array} List of tiered breakdown statistics
 */
export function computeBreakdownFromResults(results = []) {
  if (!Array.isArray(results) || results.length === 0) return []
  const byTier = {}
  results.forEach((r) => {
    const cu = r.concurrent_users || 1
    if (!byTier[cu]) byTier[cu] = []
    byTier[cu].push(r)
  })

  let slaBroken = false
  const tiers = Object.keys(byTier)
    .map(Number)
    .sort((a, b) => a - b)

  return tiers.map((cu) => {
    const group = byTier[cu]
    const n = group.length
    const failedCount = group.filter((r) => !r.success).length
    const errRate = n > 0 ? failedCount / n : 0
    const qualityCount = group.filter((r) => r.quality_valid !== false && r.success).length
    const qualityRate = n > 0 ? qualityCount / n : 1.0

    const validTtfts = group.map((r) => r.ttft_ms).filter((v) => typeof v === 'number' && !isNaN(v))
    const validLats = group.map((r) => r.total_latency_ms).filter((v) => typeof v === 'number' && !isNaN(v))
    const validTps = group.map((r) => r.generation_tokens_per_second).filter((v) => typeof v === 'number' && !isNaN(v))

    const avgTtft = validTtfts.length ? validTtfts.reduce((a, b) => a + b, 0) / validTtfts.length : null
    validTtfts.sort((a, b) => a - b)
    const p95Ttft = validTtfts.length ? validTtfts[Math.floor(validTtfts.length * 0.95)] : avgTtft

    validLats.sort((a, b) => a - b)
    const p95Lat = validLats.length ? validLats[Math.floor(validLats.length * 0.95)] : null

    const avgDecodeTps = validTps.length ? validTps.reduce((a, b) => a + b, 0) / validTps.length : null
    const avgTpotMs = avgDecodeTps && avgDecodeTps > 0 ? 1000.0 / avgDecodeTps : null
    const aggTokPerSec = avgDecodeTps ? avgDecodeTps * cu : null

    const passesSla = errRate <= 0.05 && qualityRate >= 0.95
    const isSafe = passesSla && !slaBroken
    if (!passesSla) slaBroken = true

    return {
      concurrency: cu,
      total_requests: n,
      successful_requests: n - failedCount,
      failed_requests: failedCount,
      error_rate: errRate,
      error_rate_pct: Math.round(errRate * 1000) / 10,
      quality_integrity_rate: Math.round(qualityRate * 1000) / 1000,
      avg_ttft_ms: avgTtft != null ? Math.round(avgTtft * 10) / 10 : null,
      p95_ttft_ms: p95Ttft != null ? Math.round(p95Ttft * 10) / 10 : null,
      avg_tpot_ms: avgTpotMs != null ? Math.round(avgTpotMs * 100) / 100 : null,
      tokens_per_second: avgDecodeTps != null ? Math.round(avgDecodeTps * 10) / 10 : null,
      aggregate_tokens_per_sec: aggTokPerSec != null ? Math.round(aggTokPerSec * 10) / 10 : null,
      p95_latency_ms: p95Lat != null ? Math.round(p95Lat * 10) / 10 : null,
      sla_status: passesSla ? 'PASS' : 'BREACH',
      is_safe: isSafe,
    }
  })
}

