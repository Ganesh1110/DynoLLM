import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Activity, Cpu, HardDrive, Zap, Server } from 'lucide-react'
import { monitoringApi } from '../../services/api'
import { fmt, fmtBytes } from '../ui'
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
    const fromStats = engineStatsList.find(
      (r) => r.runtime_id === selectedRuntimeId || r.id === selectedRuntimeId || (fromRuntimes && r.endpoint === fromRuntimes.endpoint)
    )
    return { ...fromRuntimes, ...fromStats }
  }, [runtimes, engineStatsList, selectedRuntimeId])

  // Check freshness (< 30s)
  const isStale = useMemo(() => {
    if (!activeRuntime?.polled_at) return false
    const nowSec = Date.now() / 1000
    return nowSec - activeRuntime.polled_at > 30 || Boolean(activeRuntime.error)
  }, [activeRuntime])

  const series = historyData?.series || []
  const summary = historyData?.summary || {}

  // Normalized capabilities matching both vLLM Prometheus metrics & Ollama/standard engines
  const capabilities = useMemo(() => {
    const caps = activeRuntime?.capabilities || {}
    return {
      queue: Boolean(caps.queue ?? caps.has_request_counts ?? (activeRuntime?.requests_running != null || activeRuntime?.requests_waiting != null)),
      kv_cache: Boolean(caps.kv_cache ?? caps.has_kv_cache ?? (activeRuntime?.kv_cache_usage_pct != null)),
      prefix_cache: Boolean(caps.prefix_cache ?? caps.has_prefix_cache ?? (activeRuntime?.prefix_cache_hit_rate != null)),
      histograms: Boolean(caps.histograms ?? caps.has_histograms ?? false),
      finish_reasons: Boolean(caps.finish_reasons ?? caps.has_finish_reasons ?? (Object.keys(activeRuntime?.finish_reasons || {}).length > 0)),
      token_rates: Boolean(caps.token_rates ?? caps.has_token_counts ?? (series.some((s) => s.tokens_per_second != null))),
      block_metrics: Boolean(caps.block_metrics ?? caps.has_block_stats ?? (activeRuntime?.num_total_gpu_blocks != null)),
      model_vram_breakdown: Boolean(caps.model_vram_breakdown ?? false),
    }
  }, [activeRuntime, series])

  // Helper to determine state using unified lifecycle logic
  const getCardState = (hasCapability, hasData = true) => {
    if (!activeRuntime?.id && !activeRuntime?.name) {
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

  return (
    <div className="space-y-3 font-sans">
      {/* Real-time System Status Header Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white text-xs tracking-tight">System Status: Active</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[10px] font-mono border border-emerald-800">
                Live Telemetry
              </span>
            </div>
            <div className="text-[10px] text-gray-400 font-mono">
              {primaryGpu ? primaryGpu.name : 'Host Platform & System Compute'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5 bg-gray-950 px-2.5 py-1.5 rounded-lg border border-gray-800">
            <span className="text-gray-500 text-[10px] uppercase font-bold">CPU:</span>
            <span className="text-amber-400 font-bold">{currentHardware?.cpu_percent != null ? `${currentHardware.cpu_percent.toFixed(1)}%` : '—'}</span>
            <span className="text-gray-500 text-[10px]">({currentHardware?.cpu_load_avg_1m != null ? `1m: ${Number(currentHardware.cpu_load_avg_1m).toFixed(2)}` : `${currentHardware?.cpu_per_core?.length || 0} cores`})</span>
          </div>

          <div className="flex items-center space-x-1.5 bg-gray-950 px-2.5 py-1.5 rounded-lg border border-gray-800">
            <span className="text-gray-500 text-[10px] uppercase font-bold">RAM:</span>
            <span className="text-sky-400 font-bold">
              {currentHardware?.ram_used_bytes ? fmtBytes(currentHardware.ram_used_bytes) : '—'} / {currentHardware?.ram_total_bytes ? fmtBytes(currentHardware.ram_total_bytes) : '—'}
            </span>
            <span className="text-gray-500 text-[10px]">({currentHardware?.ram_percent != null ? `${currentHardware.ram_percent.toFixed(0)}%` : '—'})</span>
          </div>

          <div className="flex items-center space-x-1.5 bg-gray-950 px-2.5 py-1.5 rounded-lg border border-gray-800">
            <span className="text-gray-500 text-[10px] uppercase font-bold">DISK:</span>
            <span className="text-emerald-400 font-bold">{currentHardware?.disk_read_bytes_per_sec ? `${fmtBytes(currentHardware.disk_read_bytes_per_sec)}/s` : '0 B/s'}</span>
          </div>

          {primaryGpu && (
            <div className="flex items-center space-x-1.5 bg-gray-950 px-2.5 py-1.5 rounded-lg border border-gray-800">
              <span className="text-gray-500 text-[10px] uppercase font-bold">GPU:</span>
              <span className="text-purple-400 font-bold">{primaryGpu.utilization_percent != null ? `${primaryGpu.utilization_percent}%` : '—'}</span>
              <span className="text-gray-500 text-[10px]">({fmtBytes(primaryGpu.vram_used_bytes)} / {fmtBytes(primaryGpu.vram_total_bytes)})</span>
            </div>
          )}
        </div>
      </div>

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
            state={getCardState(capabilities.queue, (activeRuntime?.requests_running != null || activeRuntime?.requests_waiting != null || series.length > 0))}
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
              Boolean(capabilities.queue || capabilities.block_metrics),
              Boolean(activeRuntime?.num_total_gpu_blocks != null || series.length > 0 || activeRuntime?.requests_running != null)
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
            state={getCardState(Boolean(capabilities.token_rates), series.length > 0)}
            series={series}
            unavailableReason="Engine cumulative token counters not available for derivation."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>

        {/* KV Cache (4 cols) */}
        <div className="lg:col-span-4">
          <KvCacheCard
            state={getCardState(Boolean(capabilities.kv_cache), Boolean(activeRuntime?.kv_cache_usage_pct != null || series.length > 0))}
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
              Boolean(capabilities.histograms),
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
            state={getCardState(Boolean(capabilities.prefix_cache), Boolean(activeRuntime?.prefix_cache_hit_rate != null))}
            hitRatePct={activeRuntime?.prefix_cache_hit_rate}
            unavailableReason="Prefix caching is disabled or unsupported by this engine runtime."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>

        {/* Finish Reasons (3 cols) */}
        <div className="lg:col-span-3">
          <FinishReasonsCard
            state={getCardState(Boolean(capabilities.finish_reasons), Object.keys(activeRuntime?.finish_reasons || {}).length > 0)}
            finishReasons={activeRuntime?.finish_reasons || {}}
            deltaReasons={summary?.finish_reasons_delta || {}}
            unavailableReason="Engine does not categorize request completion reasons."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>

        {/* Loaded Model (3 cols) */}
        <div className="lg:col-span-3">
          <ModelInfoCard
            state={getCardState(Boolean(activeRuntime?.name || activeRuntime?.engine), (activeRuntime?.models_loaded?.length ?? 0) > 0 || Boolean(activeRuntime?.name))}
            runtime={activeRuntime}
            modelsLoaded={activeRuntime?.models_loaded || []}
            unavailableReason="Engine does not report model architecture details."
            staleReason="Engine polling delayed (>30s)."
          />
        </div>

        {/* Hardware & System Telemetry (3 cols) */}
        <div className="lg:col-span-3">
          <GpuTelemetryCard
            state={primaryGpu || currentHardware ? 'live' : 'unavailable'}
            gpu={primaryGpu}
            hardware={currentHardware}
            unavailableReason="Hardware telemetry snapshot not available."
            staleReason="Hardware telemetry snapshot delayed."
          />
        </div>
      </div>
    </div>
  )
}
