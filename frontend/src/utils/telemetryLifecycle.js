/**
 * Telemetry Lifecycle State Machine and Capacity Evaluation Utilities.
 * Standardizes 4-state lifecycle (live, unavailable, no_data, stale) across all telemetry cards.
 */

/**
 * Determine the 4-state lifecycle status of a telemetry card.
 * @param {Object} params
 * @param {Object} params.capabilities - Capability map from engine adapter
 * @param {string} [params.capabilityKey] - Specific capability key (e.g. 'has_kv_cache', 'has_histograms')
 * @param {boolean} [params.isStale=false] - Whether last telemetry update exceeded freshness threshold (>30s)
 * @param {boolean} [params.hasError=false] - Whether engine connection failed
 * @param {boolean} [params.hasData=true] - Whether data exists in current query window
 * @returns {'live' | 'unavailable' | 'no_data' | 'stale'}
 */
export function determineCardLifecycleState({
  capabilities = {},
  capabilityKey = null,
  isStale = false,
  hasError = false,
  hasData = true,
}) {
  if (hasError) {
    return 'stale'
  }

  if (capabilityKey && capabilities[capabilityKey] === false) {
    return 'unavailable'
  }

  if (isStale) {
    return 'stale'
  }

  if (!hasData) {
    return 'no_data'
  }

  return 'live'
}

/**
 * Evaluates queue backlog severity and admission ratio.
 * @param {Object} params
 * @param {number} params.waiting - Current requests waiting in queue
 * @param {number} params.running - Current requests actively running
 * @param {Array} [params.series=[]] - Historical window series
 * @returns {Object}
 */
export function evaluateQueueBacklog({ waiting = 0, running = 0, series = [] }) {
  const currentWaiting = Math.max(0, waiting || 0)
  const currentRunning = Math.max(0, running || 0)
  const total = currentWaiting + currentRunning

  const admissionRatio = total > 0 ? currentRunning / total : 1.0

  // Check persistence in the last 3 consecutive samples of window series
  const waitingCounts = (series || []).map((s) => s.requests_waiting || 0)
  const recent = waitingCounts.slice(-3)
  const persistentBacklog = recent.length >= 3 && recent.every((w) => w > 0)
  const isSevereBacklog = currentWaiting >= 5 || persistentBacklog

  return {
    hasBacklog: currentWaiting > 0,
    isSevereBacklog,
    persistentBacklog,
    admissionRatio: Math.round(admissionRatio * 100) / 100,
  }
}
