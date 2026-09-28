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

  if (tps >= 35) {
    return {
      grade: 'good',
      label: 'Blazing (>35 tok/s)',
      badge: 'Blazing',
      color: 'emerald',
      description: 'Extremely fast streaming. Ideal for code generation, agentic loops, and summarization.',
    }
  }
  if (tps >= 15) {
    return {
      grade: 'average',
      label: 'Reading Speed (15-35 tok/s)',
      badge: 'Reading Speed',
      color: 'sky',
      description: 'Comfortable human reading cadence (~15-20 words/sec). Good for interactive reading.',
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
      color: 'sky',
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
