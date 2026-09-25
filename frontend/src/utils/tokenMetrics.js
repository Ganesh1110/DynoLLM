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
