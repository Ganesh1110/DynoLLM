/**
 * Metric rating and evaluation utilities
 * Provides qualitative Good / Average / Bad grading for LLM inference metrics.
 */

/**
 * Evaluates Time-To-First-Token (TTFT)
 * @param {number|null} ttftMs - Time to first token in milliseconds
 * @returns {object|null} Rating object or null if unmeasured
 */
export function getTtftRating(ttftMs) {
  if (ttftMs == null || isNaN(ttftMs) || ttftMs <= 0) return null
  const ms = Number(ttftMs)

  if (ms < 300) {
    return {
      grade: 'good',
      label: 'Instant (<300ms)',
      badge: 'Instant',
      color: 'emerald',
      description: 'Ideal for real-time interactive chat & conversational voice agents.',
    }
  }
  if (ms <= 800) {
    return {
      grade: 'average',
      label: 'Interactive (300-800ms)',
      badge: 'Interactive',
      color: 'amber',
      description: 'Standard conversational response time. Acceptable for chat UIs.',
    }
  }
  return {
    grade: 'bad',
    label: 'High Latency (>800ms)',
    badge: 'High Latency',
    color: 'rose',
    description: 'Noticeable delay before first token. Consider chunked prefill or smaller context.',
  }
}

/**
 * Evaluates Token Generation / Decode Speed
 * @param {number|null} tokPerSec - Tokens generated per second
 * @returns {object|null} Rating object or null if unmeasured
 */
export function getSpeedRating(tokPerSec) {
  if (tokPerSec == null || isNaN(tokPerSec) || tokPerSec <= 0) return null
  const tps = Number(tokPerSec)

  // Good threshold aligned with TPOT good boundary (< 30ms ≈ 33.3 tok/s)
  if (tps >= 33) {
    return {
      grade: 'good',
      label: 'Blazing (≥33 tok/s)',
      badge: 'Blazing',
      color: 'emerald',
      description: 'Extremely fast streaming. Ideal for code generation, agentic loops, and summarization.',
    }
  }
  if (tps >= 15) {
    return {
      grade: 'average',
      label: 'Reading Speed (15–33 tok/s)',
      badge: 'Reading Speed',
      color: 'amber',
      description: 'Comfortable human reading cadence (~15–20 words/sec). Good for interactive reading.',
    }
  }
  return {
    grade: 'bad',
    label: 'Sluggish (<15 tok/s)',
    badge: 'Sluggish',
    color: 'rose',
    description: 'Noticeably slow generation. Memory-bandwidth constrained or unquantized model on small GPU.',
  }
}

/**
 * Evaluates Time Per Output Token (TPOT in ms/tok)
 * @param {number|null} tpotMs - Milliseconds per output token
 * @returns {object|null} Rating object or null if unmeasured
 */
export function getTpotRating(tpotMs) {
  if (tpotMs == null || isNaN(tpotMs) || tpotMs <= 0) return null
  const ms = Number(tpotMs)

  if (ms < 30) {
    return {
      grade: 'good',
      label: 'Snappy (<30ms)',
      badge: 'Snappy',
      color: 'emerald',
      description: 'Fast token delivery cadence.',
    }
  }
  if (ms <= 65) {
    return {
      grade: 'average',
      label: 'Human Speed (30-65ms)',
      badge: 'Human Speed',
      color: 'amber',
      description: 'Normal streaming cadence matching typical reading flow.',
    }
  }
  return {
    grade: 'bad',
    label: 'Slow Typing (>65ms)',
    badge: 'Slow Typing',
    color: 'rose',
    description: 'High inter-token intervals causing delayed text streaming.',
  }
}

/**
 * Evaluates Error Rate percentage (0 to 100)
 * @param {number|null} errorRatePct - Error percentage
 * @returns {object|null} Rating object or null if unmeasured
 */
export function getErrorRateRating(errorRatePct) {
  if (errorRatePct == null || isNaN(errorRatePct)) return null
  const err = Number(errorRatePct)

  if (err <= 0) {
    return {
      grade: 'good',
      label: 'Optimal (0%)',
      badge: '0% Optimal',
      color: 'emerald',
      description: 'Zero dropped requests or timeouts.',
    }
  }
  if (err <= 5.0) {
    return {
      grade: 'average',
      label: 'Acceptable Under Load (≤5%)',
      badge: 'SLA Pass',
      color: 'amber',
      description: 'Minor transient errors under peak stress. Within production SLA margin.',
    }
  }
  return {
    grade: 'bad',
    label: 'SLA Breached (>5%)',
    badge: 'SLA Breach',
    color: 'rose',
    description: 'Excessive failures or timeouts. Engine capacity saturated or OOM event.',
  }
}

/**
 * Evaluates Latency Consistency (P95 vs Average ratio)
 * @param {number|null} p95Ms - P95 response latency
 * @param {number|null} avgMs - Average response latency
 * @returns {object|null} Rating object or null if unmeasured
 */
export function getLatencyConsistencyRating(p95Ms, avgMs) {
  if (p95Ms == null || avgMs == null || avgMs <= 0 || isNaN(p95Ms) || isNaN(avgMs)) return null
  const ratio = Number(p95Ms) / Number(avgMs)

  if (ratio <= 1.5) {
    return {
      grade: 'good',
      label: 'Highly Stable (P95 ≤ 1.5x)',
      badge: 'Stable',
      color: 'emerald',
      description: 'Predictable response times with minimal tail latency variance.',
    }
  }
  if (ratio <= 2.5) {
    return {
      grade: 'average',
      label: 'Moderate Jitter (P95 ≤ 2.5x)',
      badge: 'Moderate Jitter',
      color: 'amber',
      description: 'Noticeable variance under mixed sequence lengths.',
    }
  }
  return {
    grade: 'bad',
    label: 'High Variance (P95 > 2.5x)',
    badge: 'Tail Spikes',
    color: 'rose',
    description: 'Severe tail latency. Head-of-line blocking or scheduler queue stalls.',
  }
}

/**
 * Returns Tailwind badge classes for a given color key
 * @param {string} color - 'emerald' | 'amber' | 'rose' | 'sky' | 'gray'
 * @returns {string} Tailwind CSS class string
 */
export function getRatingBadgeClasses(color = 'gray') {
  switch (color) {
    case 'emerald':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    case 'amber':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    case 'rose':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    case 'sky':
      return 'bg-sky-500/10 text-sky-400 border-sky-500/20'
    default:
      return 'bg-gray-800 text-gray-400 border-gray-700'
  }
}

/**
 * Evaluates overall test execution stage: Good / Average / Bad
 * @param {object} params
 * @param {number|null} [params.ttftMs]
 * @param {number|null} [params.speedTokPerSec]
 * @param {number|null} [params.tpotMs]
 * @param {number|null} [params.p95Ms]
 * @param {number|null} [params.avgMs]
 * @param {number|null} [params.errorRatePct]
 * @param {string} [params.pageType] - 'benchmark' | 'loadtest'
 * @returns {object|null} Overall evaluation summary with stage, label, summary, advice, and items
 */
export function getOverallEvaluation({
  ttftMs,
  speedTokPerSec,
  tpotMs,
  p95Ms,
  avgMs,
  errorRatePct,
  pageType = 'benchmark',
} = {}) {
  const ttftRating = getTtftRating(ttftMs)
  const speedRating = getSpeedRating(speedTokPerSec)
  // tpotRating is computed for reference display only — NOT added to items[]
  // because TPOT ≈ 1000/tok/s is the same signal as speed; including both
  // would double-count one slow decode and unfairly trigger the "Bad" verdict.
  const tpotRating = getTpotRating(tpotMs)
  const consistencyRating = getLatencyConsistencyRating(p95Ms, avgMs)
  const errorRating = getErrorRateRating(errorRatePct)

  const items = []
  if (ttftRating) {
    items.push({
      key: 'ttft',
      name: 'Avg TTFT',
      raw: ttftMs,
      display: `${Math.round(ttftMs)} ms`,
      rating: ttftRating,
      grade: ttftRating.grade,
    })
  }
  if (speedRating) {
    items.push({
      key: 'speed',
      name: 'Generation Speed',
      raw: speedTokPerSec,
      display: `${typeof speedTokPerSec === 'number' ? speedTokPerSec.toFixed(1) : speedTokPerSec} tok/s`,
      rating: speedRating,
      grade: speedRating.grade,
    })
  }
  // tpot is intentionally excluded from items[] — it shares the same
  // decode-throughput signal as speed and would cause double-counting.
  if (consistencyRating) {
    items.push({
      key: 'consistency',
      name: 'Latency Consistency',
      raw: p95Ms && avgMs ? p95Ms / avgMs : null,
      display: p95Ms && avgMs ? `${(p95Ms / avgMs).toFixed(1)}x Avg` : '—',
      rating: consistencyRating,
      grade: consistencyRating.grade,
    })
  }
  if (errorRating) {
    items.push({
      key: 'errorRate',
      name: 'Error Rate',
      raw: errorRatePct,
      display: `${typeof errorRatePct === 'number' ? errorRatePct.toFixed(1) : errorRatePct}%`,
      rating: errorRating,
      grade: errorRating.grade,
    })
  }

  if (items.length === 0) return null

  const badCount = items.filter((i) => i.grade === 'bad').length
  const avgCount = items.filter((i) => i.grade === 'average').length
  const goodCount = items.filter((i) => i.grade === 'good').length

  let stage = 'good'
  let label = 'Good (Production Ready)'
  let color = 'emerald'
  let summary = 'Your inference metrics meet production standards with fast TTFT and high decode throughput.'
  let advice = 'Serving configuration is healthy and ready for production scaling.'

  if (errorRating && errorRating.grade === 'bad') {
    stage = 'bad'
    label = 'Bad (SLA Breached)'
    color = 'rose'
    summary = `High failure rate (${errorRating.badge}) detected. Requests are timing out or crashing under load.`
    advice = 'Reduce concurrency, lower --max-num-seqs, or allocate additional VRAM for the KV cache.'
  } else if (badCount >= 2 || (badCount === 1 && items.length <= 2)) {
    stage = 'bad'
    label = 'Bad (Bottleneck Detected)'
    color = 'rose'
    const badItems = items.filter((i) => i.grade === 'bad').map((i) => i.name).join(' & ')
    summary = `Sub-optimal performance detected in ${badItems}. Inference is constrained.`
    advice = 'Check model quantization (FP8/AWQ), enable chunked prefill, or scale GPU compute.'
  } else if (badCount === 1 || avgCount >= 2 || (avgCount >= 1 && goodCount === 0)) {
    stage = 'average'
    label = 'Average (Acceptable / Tuning Recommended)'
    color = 'amber'
    const targetItems = items.filter((i) => i.grade !== 'good').map((i) => i.name).join(' & ')
    summary = `Performance is functional, but ${targetItems || 'some metrics'} could be tuned for lower latency.`
    advice = 'Optimization recommended before scaling to high concurrent traffic.'
  } else {
    stage = 'good'
    label = 'Good (Optimal / Production Ready)'
    color = 'emerald'
    summary = 'All measured metrics are within optimal engineering thresholds.'
    advice = 'Configuration is well-balanced for production deployment.'
  }

  return {
    stage,
    label,
    color,
    summary,
    advice,
    badCount,
    avgCount,
    goodCount,
    items,
    tpotRating, // reference-only — not included in verdict scoring
  }
}

/**
 * Unified evaluation for a single benchmark or load-test run.
 * Handles null / undefined metrics safely to avoid JavaScript null-coercion bugs.
 *
 * @param {object} run
 * @returns {{ label: string, color: 'emerald'|'sky'|'amber'|'red'|'gray', icon: string, stage: string }}
 */
export function rateSingleRun(run) {
  if (!run) return { label: 'No Data', color: 'gray', icon: '—', stage: 'none' }

  // Check for load-test specific run
  const isLoadTest = run.target_users != null || run.max_concurrent_users != null
  if (isLoadTest) {
    const errRate = run.error_rate != null ? Number(run.error_rate) : 0
    const tps = run.tokens_out_per_second ?? run.avg_tokens_per_second ?? null

    if (errRate > 10) return { label: 'High Error Rate', color: 'red', icon: '🔴', stage: 'bad' }
    if (tps != null && tps > 30 && errRate < 2) return { label: 'Excellent', color: 'emerald', icon: '🏆', stage: 'good' }
    if (tps != null && tps > 15 && errRate < 5) return { label: 'Good', color: 'sky', icon: '✅', stage: 'good' }
    if (tps != null && tps > 0) return { label: 'Moderate', color: 'amber', icon: '🟡', stage: 'average' }
    return { label: 'No Data', color: 'gray', icon: '—', stage: 'none' }
  }

  // Benchmark run
  const p95 = run.p95_latency_ms != null && !isNaN(run.p95_latency_ms) ? Number(run.p95_latency_ms) : null
  const tps = run.tokens_per_second != null && !isNaN(run.tokens_per_second) ? Number(run.tokens_per_second) : null

  if (p95 == null && tps == null) {
    return { label: 'No Data', color: 'gray', icon: '—', stage: 'none' }
  }

  // Safe checks: ensure p95 is explicitly non-null before checking p95 < threshold
  if (p95 != null && p95 < 150 && tps != null && tps > 40) {
    return { label: 'Excellent', color: 'emerald', icon: '🏆', stage: 'good' }
  }
  if ((p95 != null && p95 < 350) || (tps != null && tps > 20)) {
    return { label: 'Good', color: 'sky', icon: '✅', stage: 'good' }
  }
  if ((p95 != null && p95 < 700) || (tps != null && tps > 10)) {
    return { label: 'Moderate', color: 'amber', icon: '🟡', stage: 'average' }
  }
  return { label: 'Slow', color: 'red', icon: '🔴', stage: 'bad' }
}

