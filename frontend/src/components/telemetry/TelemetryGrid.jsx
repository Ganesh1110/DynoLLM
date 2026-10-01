import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { monitoringApi } from '../../services/api'
import TelemetryControls from './TelemetryControls'
import RequestFlowCard from './RequestFlowCard'
import CapacityCard from './CapacityCard'
import ThroughputCard from './ThroughputCard'
import KvCacheCard from './KvCacheCard'
import LatencyCard from './LatencyCard'
import PrefixCacheCard from './PrefixCacheCard'
import FinishReasonsCard from './FinishReasonsCard'
import GpuTelemetryCard from './GpuTelemetryCard'
import ModelInfoCard from './ModelInfoCard'
import { determineCardLifecycleState } from '../../utils/telemetryLifecycle'

export default function TelemetryGrid({
  runtimes = [],
  currentHardware = null,
  initialRuntimeId = null,
  engineStats = null,
}) {
  const [selectedRuntimeId, setSelectedRuntimeId] = useState(initialRuntimeId)
  const [activeWindow, setActiveWindow] = useState('15m')
  const [engineStatsList, setEngineStatsList] = useState(engineStats || [])
  const [historyData, setHistoryData] = useState({ series: [], summary: {} })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastPolledAt, setLastPolledAt] = useState(null)

  // Sync engine stats from parent if provided (avoids duplicate polling)
  useEffect(() => {
    if (engineStats && Array.isArray(engineStats)) {
      setEngineStatsList(engineStats)
      setLastPolledAt(Math.floor(Date.now() / 1000))
    }
  }, [engineStats])

  // Auto-select first runtime if none selected
  useEffect(() => {
    if (!selectedRuntimeId && runtimes.length > 0) {
      setSelectedRuntimeId(runtimes[0].id)
    }
  }, [runtimes, selectedRuntimeId])

  // Fetch latest snapshot & history
  const fetchTelemetry = useCallback(async () => {
    try {
      setIsRefreshing(true)

      // Only poll engineStats if parent did not provide it
      if (!engineStats) {
        const statsRes = await monitoringApi.engineStats()
        const stats = statsRes.runtimes || []
        setEngineStatsList(stats)
        setLastPolledAt(Math.floor(Date.now() / 1000))
      }

      const rtId = selectedRuntimeId || (runtimes[0]?.id)
      if (rtId) {
        try {
          const hist = await monitoringApi.engineStatsHistory(rtId, activeWindow)
          setHistoryData(hist || { series: [], summary: {} })
        } catch {
          // If history query fails, keep previous or empty series
        }
      }
    } catch {
      // Backend may be starting up
    } finally {
      setIsRefreshing(false)
    }
  }, [selectedRuntimeId, activeWindow, runtimes, engineStats])

  // Polling loop every 5s
  useEffect(() => {
    fetchTelemetry()
    const timer = setInterval(fetchTelemetry, 5000)
    return () => clearInterval(timer)
  }, [fetchTelemetry])

  // Match current active runtime info
  const activeRuntime = useMemo(() => {
    const fromRuntimes = runtimes.find((r) => r.id === selectedRuntimeId)
    const fromStats = engineStatsList.find((r) => r.runtime_id === selectedRuntimeId)
    return { ...fromRuntimes, ...fromStats }
  }, [runtimes, engineStatsList, selectedRuntimeId])

  // Check freshness (< 30s)
  const isStale = useMemo(() => {
    if (!activeRuntime?.polled_at) return false
    const nowSec = Date.now() / 1000
    return nowSec - activeRuntime.polled_at > 30 || Boolean(activeRuntime.error)
  }, [activeRuntime])

  const capabilities = activeRuntime?.capabilities || {}

  // Helper to determine state using unified lifecycle logic
  // Unverified/empty capabilities evaluate to false, never defaulting to "live"
  const getCardState = (hasCapability, hasData = true) => {
    if (!activeRuntime?.id) {
      return 'no_data'
    }
    return determineCardLifecycleState({
      capabilities: { target: Boolean(hasCapability) },
      capabilityKey: 'target',
      isStale,
      hasError: Boolean(activeRuntime?.error),
      hasData,
    })
  }

  // Primary GPU from live hardware
  const primaryGpu = currentHardware?.gpus?.[0] || null

  const series = historyData?.series || []
  const summary = historyData?.summary || {}

  return (
    <div className="space-y-3 font-sans">
      {/* Telemetry Header Controls */}
      <TelemetryControls
        runtimes={runtimes}
        activeRuntimeId={selectedRuntimeId}
        onSelectRuntime={setSelectedRuntimeId}
        activeWindow={activeWindow}
        onSelectWindow={setActiveWindow}
        lastPolledAt={lastPolledAt}
        isRefreshing={isRefreshing}
        onManualRefresh={fetchTelemetry}
        activeEngineType={activeRuntime?.engine || activeRuntime?.type || 'vLLM'}
      />

      {/* Row 1: Core Flow & Capacity (Top Tier) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Request Flow (6 cols) */}
        <div className="lg:col-span-6">
          <RequestFlowCard
            state={getCardState(Boolean(capabilities.has_request_counts))}
            series={series}
            currentRunning={activeRuntime?.requests_running ?? 0}
            currentWaiting={activeRuntime?.requests_waiting ?? 0}
            currentSwapped={activeRuntime?.requests_swapped ?? 0}
            unavailableReason="The selected engine does not expose live request execution counts."
            staleReason="Engine polling delayed (>30s) or engine is unreachable."
          />
        </div>

        {/* Capacity & Queue Backlog (6 cols) */}
        <div className="lg:col-span-6">
          <CapacityCard
            state={getCardState(
              Boolean(capabilities.has_request_counts || capabilities.has_block_stats)
            )}
            currentRunning={activeRuntime?.requests_running ?? 0}
            currentWaiting={activeRuntime?.requests_waiting ?? 0}
            totalBlocks={activeRuntime?.num_total_gpu_blocks}
            freeBlocks={activeRuntime?.num_free_gpu_blocks}
            watermarkBlocks={activeRuntime?.num_watermark_blocks}
            series={series}
            unavailableReason="The selected engine does not expose block allocations or queue states."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>
      </div>

      {/* Row 2: Throughput, KV Cache, Latency (Middle Tier) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Token Throughput (4 cols) */}
        <div className="lg:col-span-4">
          <ThroughputCard
            state={getCardState(Boolean(capabilities.has_token_counts))}
            series={series}
            unavailableReason="Engine cumulative token counters not available for derivation."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>

        {/* KV Cache (4 cols) */}
        <div className="lg:col-span-4">
          <KvCacheCard
            state={getCardState(Boolean(capabilities.has_kv_cache))}
            currentKvPct={activeRuntime?.kv_cache_usage_pct}
            totalBlocks={activeRuntime?.num_total_gpu_blocks}
            freeBlocks={activeRuntime?.num_free_gpu_blocks}
            watermarkBlocks={activeRuntime?.num_watermark_blocks}
            series={series}
            unavailableReason="Engine does not expose KV cache pool statistics."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>

        {/* Latency Percentiles (4 cols) */}
        <div className="lg:col-span-4">
          <LatencyCard
            state={getCardState(
              Boolean(capabilities.has_histograms),
              series.some((s) => s.avg_ttft_ms != null || s.avg_tpot_ms != null)
            )}
            series={series}
            unavailableReason="Prometheus latency histograms not enabled on this engine."
            noDataReason="No request latencies recorded yet in the current window. Execute queries to see latency percentiles."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>
      </div>

      {/* Row 3: Specialized Insights & Hardware (Bottom Tier) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Prefix Cache (3 cols) */}
        <div className="lg:col-span-3">
          <PrefixCacheCard
            state={getCardState(Boolean(capabilities.has_prefix_cache))}
            hitRatePct={activeRuntime?.prefix_cache_hit_rate}
            unavailableReason="Prefix caching is disabled or unsupported by this engine runtime."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>

        {/* Finish Reasons (3 cols) */}
        <div className="lg:col-span-3">
          <FinishReasonsCard
            state={getCardState(Boolean(capabilities.has_request_counts))}
            finishReasons={activeRuntime?.finish_reasons || {}}
            deltaReasons={summary?.finish_reasons_delta || {}}
            unavailableReason="Engine does not categorize request completion reasons."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>

        {/* Loaded Model (3 cols) */}
        <div className="lg:col-span-3">
          <ModelInfoCard
            state={getCardState(Boolean(activeRuntime?.name), (activeRuntime?.models_loaded?.length ?? 0) > 0 || Boolean(activeRuntime?.name))}
            runtime={activeRuntime}
            modelsLoaded={activeRuntime?.models_loaded || []}
            unavailableReason="Engine does not report model architecture details."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>

        {/* GPU Hardware Sensors (3 cols) */}
        <div className="lg:col-span-3">
          <GpuTelemetryCard
            state={primaryGpu ? 'live' : 'unavailable'}
            gpu={primaryGpu}
            unavailableReason="No active NVIDIA GPU detected or pynvml is unconfigured."
            staleReason="Hardware telemetry snapshot delayed."
          />
        </div>
      </div>
    </div>
  )
}
