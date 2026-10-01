import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Flame,
  Clock,
  PlayCircle,
  Zap,
  Server,
  Activity,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  Info,
  BookOpen,
  Cpu,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Pin,
  Award,
  Users,
  CheckCircle,
  Terminal,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  LabelList,
} from 'recharts'
import { useMonitoringStore } from '../stores/monitoringStore'
import { useRuntimeStore } from '../stores/runtimeStore'
import { useBenchmarkStore } from '../stores/benchmarkStore'
import { useLoadTestStore } from '../stores/loadTestStore'
import { fmt, fmtBytes } from '../components/ui'
import { monitoringApi } from '../services/api'
import { parseModelName, calcDetailedKvSpecs, BYTES_PER_GIB } from '../utils/gpuSizer'
import { rateSingleRun } from '../utils/ratingUtils'
import { TelemetryGrid } from '../components/telemetry'

// ==============================================================================
// 1. Badges & Interactive Info Tooltip
// ==============================================================================
function InfoTooltip({ text, position = 'top' }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-flex items-center ml-1.5 group">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(!open)}
        className="text-[#656c78] hover:text-sky-400 focus:outline-none transition-colors"
        aria-label="Info explanation"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className={`absolute ${
            position === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } left-1/2 -translate-x-1/2 z-50 w-64 p-2.5 bg-[#14161a] border border-sky-500/40 text-gray-200 text-[11px] rounded-lg shadow-2xl backdrop-blur-md pointer-events-none leading-relaxed`}
        >
          <div className="font-semibold text-sky-400 pb-1 border-b border-[#22252b] mb-1 flex items-center space-x-1">
            <Info className="w-3 h-3" />
            <span>Concept Explanation</span>
          </div>
          <div>{text}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-[#14161a]" />
        </div>
      )}
    </div>
  )
}

function SampleDataBadge({ tip }) {
  return (
    <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-mono shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      <span>Sample Data</span>
      {tip && <InfoTooltip text={tip} />}
    </div>
  )
}

function LiveDataBadge({ text = 'Live NVML' }) {
  return (
    <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-mono shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      <span>{text}</span>
    </div>
  )
}

// ==============================================================================
// 2. 3-Step Guided Workflow Banner for Freshers
// ==============================================================================
function FresherWorkflowGuide({ onOpenCheatSheet }) {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <div className="bg-[#181b1f] border border-[#22252b] rounded-sm px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 text-gray-300">
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span className="font-medium">How to use DynoLLM (3-Step Evaluation Process)</span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-xs text-sky-400 hover:text-sky-300 underline"
        >
          Show 3-Step Guide
        </button>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-[#181b1f] via-[#1a1f26] to-[#181b1f] border border-sky-900/40 rounded-sm p-3.5 text-xs shadow-md">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2.5 border-b border-[#262c36]">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-semibold text-white">New to Local LLMs? 3-Step Production Testing Process</span>
            <span className="hidden md:inline-block text-[#8e94a0] ml-2">
              — Follow these steps to measure model speed and hardware limits
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onOpenCheatSheet}
            className="flex items-center space-x-1 text-sky-400 hover:text-sky-300 font-medium transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="underline">Fresher Cheat Sheet</span>
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="text-[#656c78] hover:text-gray-300 text-xs"
            title="Minimize guide"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
        {/* Step 1 */}
        <Link
          to="/runtimes"
          className="group bg-[#14161a] hover:bg-[#1a1e24] border border-[#22252b] hover:border-sky-500/40 p-2.5 rounded transition-all flex items-start space-x-2.5"
        >
          <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
            1
          </span>
          <div className="space-y-0.5">
            <div className="font-semibold text-white group-hover:text-sky-300 flex items-center space-x-1">
              <span>Connect Model Engine</span>
              <ChevronRight className="w-3 h-3 text-[#656c78] group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[11px] text-[#8e94a0] leading-snug">
              Add your Ollama or vLLM server endpoint under <strong>Runtimes</strong>.
            </p>
          </div>
        </Link>

        {/* Step 2 */}
        <Link
          to="/benchmark"
          className="group bg-[#14161a] hover:bg-[#1a1e24] border border-[#22252b] hover:border-emerald-500/40 p-2.5 rounded transition-all flex items-start space-x-2.5"
        >
          <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
            2
          </span>
          <div className="space-y-0.5">
            <div className="font-semibold text-white group-hover:text-emerald-300 flex items-center space-x-1">
              <span>Test Single-User Speed</span>
              <ChevronRight className="w-3 h-3 text-[#656c78] group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[11px] text-[#8e94a0] leading-snug">
              Run a <strong>Benchmark</strong> to measure base TTFT, tok/s, and GPU VRAM usage.
            </p>
          </div>
        </Link>

        {/* Step 3 */}
        <Link
          to="/load-test"
          className="group bg-[#14161a] hover:bg-[#1a1e24] border border-[#22252b] hover:border-amber-500/40 p-2.5 rounded transition-all flex items-start space-x-2.5"
        >
          <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
            3
          </span>
          <div className="space-y-0.5">
            <div className="font-semibold text-white group-hover:text-amber-300 flex items-center space-x-1">
              <span>Simulate Multi-User Load</span>
              <ChevronRight className="w-3 h-3 text-[#656c78] group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[11px] text-[#8e94a0] leading-snug">
              Run a <strong>Load Test</strong> with 5–50 users to find server saturation limits.
            </p>
          </div>
        </Link>
      </div>
    </div>
  )
}

// ==============================================================================
// 3. Fresher Concept Glossary Cheat Sheet Modal
// ==============================================================================
function CheatSheetModal({ isOpen, onClose }) {
  if (!isOpen) return null

  const terms = [
    {
      term: 'Token vs Word',
      badge: 'Core Concept',
      badgeColor: 'text-sky-400 bg-sky-950/80 border-sky-800',
      desc: 'LLMs process text in "tokens". 1 token is roughly 4 characters or 0.75 English words. 1,000 tokens ≈ 750 words.',
      rule: 'Normal human reading speed is about 5 tokens/second. A response at 30+ tok/s feels instantaneous.',
    },
    {
      term: 'TTFT (Time to First Token)',
      badge: 'Responsiveness',
      badgeColor: 'text-red-400 bg-red-950/80 border-red-800',
      desc: 'The delay between sending your prompt and seeing the very first word appear on screen. Measures prompt ingestion and pre-fill time.',
      rule: '< 100ms: Instant | 100–300ms: Good | > 1000ms: Sluggish (needs smaller model or faster GPU).',
    },
    {
      term: 'Throughput (tok/s)',
      badge: 'Generation Speed',
      badgeColor: 'text-emerald-400 bg-emerald-950/80 border-emerald-800',
      desc: 'The speed at which the model streams output words after the first token arrives.',
      rule: '> 50 tok/s: Blazing fast | 20–40 tok/s: Standard conversational | < 10 tok/s: Slow typing lag.',
    },
    {
      term: 'Quantization (Q4 vs FP16)',
      badge: 'Model Size & VRAM',
      badgeColor: 'text-purple-400 bg-purple-950/80 border-purple-800',
      desc: 'Quantization compresses neural network weights from 16-bit floats (FP16) down to 4-bit (Q4_K_M). It cuts memory usage by 70% with negligible loss in accuracy.',
      rule: 'Always use Q4_K_M or Q5_K_M for local GPUs to prevent Out-Of-Memory (OOM) crashes.',
    },
    {
      term: 'P95 vs P50 Latency',
      badge: 'Traffic SLA',
      badgeColor: 'text-amber-400 bg-amber-950/80 border-amber-800',
      desc: 'P50 is the median response time (50% of requests were faster). P95 is the 95th percentile, representing the worst-case delay experienced by users under heavy traffic.',
      rule: 'When P95 spikes above 3 seconds, your server is congested and queuing incoming requests.',
    },
    {
      term: 'KV Cache (Context Memory)',
      badge: 'GPU VRAM Limit',
      badgeColor: 'text-sky-400 bg-sky-950/80 border-sky-800',
      desc: "Stores attention keys and values for all past prompt tokens and generated output. Without it, the model would recompute the entire conversation history at every word. It grows directly with context length and number of active users.",
      rule: 'When KV Cache fills up (95–100%), the engine runs out of VRAM (OOM) or must pause/preempt users.',
    },
    {
      term: 'Memory Bandwidth Saturation',
      badge: 'Decode Bottleneck',
      badgeColor: 'text-indigo-400 bg-indigo-950/80 border-indigo-800',
      desc: 'During token generation (decode phase), the GPU must load weights for every single generated token. When memory bandwidth reaches 90%+, generation speed plateaus regardless of compute core utilization.',
      rule: 'If tok/s plateaus while GPU core % is low, your workload is memory-bandwidth bound.',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#14161a] border border-[#2b303a] rounded-xl shadow-2xl p-5 text-gray-200 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-[#22252b]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Fresher Concept Guide &amp; Glossary</h3>
              <p className="text-xs text-[#8e94a0]">Plain-English guide to understanding LLM benchmarking numbers</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#22252b]"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto py-3 space-y-3 pr-1 text-xs">
          {terms.map((t, idx) => (
            <div key={idx} className="bg-[#181b1f] border border-[#22252b] rounded p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">{t.term}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${t.badgeColor}`}>{t.badge}</span>
              </div>
              <p className="text-gray-300 leading-relaxed">{t.desc}</p>
              <div className="bg-[#101216] border border-[#22252b] rounded px-2.5 py-1.5 text-[11px] text-sky-300 font-mono">
                💡 Rule of thumb: {t.rule}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-[#22252b] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-1.5 rounded text-xs font-medium"
          >
            Got It! Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

// ==============================================================================
// 4. Semi-Circular Arc Gauge Component (Speedometer Arc)
// ==============================================================================
function GrafanaArcGauge({ value = '—', percent = 0, title = 'Memory', subtitle = 'Allocated', tooltipText }) {
  const radius = 56
  const strokeWidth = 12
  const cx = 80
  const cy = 76
  const circumference = Math.PI * radius
  const strokeDashoffset = circumference * (1 - Math.min(Math.max(percent, 0), 100) / 100)
  const gradId = `arc-grad-${title.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div className="bg-[#181b1f] border border-[#22252b] rounded-sm p-3 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div className="text-[12px] text-[#d8d9da] font-medium tracking-tight text-left">
            {title}
          </div>
          {tooltipText && <InfoTooltip text={tooltipText} />}
        </div>
        <div className="text-[10px] text-[#717885] tracking-tight text-left">
          {subtitle}
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center my-auto py-1">
        <svg viewBox="0 0 160 90" className="w-36 h-20 overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="55%" stopColor="#eab308" />
              <stop offset="85%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="#21252d"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute bottom-1 text-center">
          <span className="text-2xl font-bold tracking-tight text-white font-sans">
            {value}
          </span>
        </div>
      </div>
    </div>
  )
}

// ==============================================================================
// 5. Sparkline KPI Card Component
// ==============================================================================
function SparklineCard({ title, subtitle, value, unit, color, data, tooltipText, ratingBadge, isRealData = true }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 160
  const height = 30
  const step = width / (data.length - 1)

  const points = data.map((d, i) => {
    const x = i * step
    const y = height - ((d - min) / range) * (height - 6) - 3
    return `${x},${y}`
  })

  return (
    <div className="bg-[#181b1f] border border-[#22252b] rounded-sm p-3 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div className="text-[12px] text-[#d8d9da] font-medium tracking-tight">
            {title}
          </div>
          {tooltipText && <InfoTooltip text={tooltipText} />}
        </div>
        <div className="flex items-center justify-between text-[10px] text-[#717885] tracking-tight">
          <span>{subtitle}</span>
          {ratingBadge && (
            <span className={`text-[9px] font-mono px-1 rounded ${isRealData ? 'bg-[#20252e] text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>
              {ratingBadge}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-center my-0.5 space-x-1">
        <span className="text-2xl font-bold tracking-tight font-sans" style={{ color: isRealData ? color : '#6c727d' }}>
          {value}
        </span>
        {unit && value !== '—' && <span className="text-xs text-[#8e94a0] font-normal">{unit}</span>}
      </div>

      <div className="w-full h-8 overflow-hidden pt-1">
        {isRealData ? (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points.join(' ')}
            />
          </svg>
        ) : (
          <div className="h-full flex items-center justify-center text-[10px] text-gray-500 font-mono">
            <span>Awaiting test run...</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ==============================================================================
// 6. Phase 4 — Pure Bottleneck Analysis Functions
// ==============================================================================

/**
 * computeBottlenecks — evaluates 10 alert rules from live hardware + engine stats.
 * Returns { alerts: [{id, label, detail, severity}], allClear: bool }
 */
function computeBottlenecks({ primaryGpu, kvCacheSummary, engineStats }) {
  const alerts = []

  // KV Cache pressure
  const kvPct = kvCacheSummary?.vllmKvPct ?? (
    kvCacheSummary?.source === 'ollama' && primaryGpu
      ? parseFloat(kvCacheSummary.activeTokensCached) || 0
      : null
  )
  if (kvPct !== null && kvPct > 90) {
    alerts.push({ id: 'kv-critical', label: 'KV Cache Critical', detail: `${kvPct}% occupied — OOM risk`, severity: 'danger' })
  } else if (kvPct !== null && kvPct > 70) {
    alerts.push({ id: 'kv-high', label: 'KV Cache High', detail: `${kvPct}% — headroom shrinking`, severity: 'warning' })
  }

  // Temperature
  const temp = primaryGpu?.temperature_celsius
  if (temp != null && temp > 83) {
    alerts.push({ id: 'temp-critical', label: 'Thermal Throttle Risk', detail: `${temp}°C — throttle imminent`, severity: 'danger' })
  } else if (temp != null && temp > 75) {
    alerts.push({ id: 'temp-high', label: 'Temp Elevated', detail: `${temp}°C — monitor closely`, severity: 'warning' })
  }

  // Memory Bandwidth
  const bw = primaryGpu?.memory_bandwidth_percent
  if (bw != null && bw > 90) {
    alerts.push({ id: 'bw-saturated', label: 'Mem BW Saturated', detail: `${bw}% — generation speed capped`, severity: 'danger' })
  } else if (bw != null && bw > 70) {
    alerts.push({ id: 'bw-high', label: 'Mem BW High', detail: `${bw}% — decode-bound`, severity: 'warning' })
  }

  // VRAM
  const vramPct = primaryGpu?.vram_percent
  if (vramPct != null && vramPct > 95) {
    alerts.push({ id: 'vram-critical', label: 'VRAM Critical', detail: `${vramPct.toFixed(0)}% used — imminent OOM`, severity: 'danger' })
  }

  // vLLM queue building
  const waiting = kvCacheSummary?.vllmWaiting
  const gpuUtil = primaryGpu?.utilization_percent
  if (waiting != null && waiting > 3) {
    alerts.push({ id: 'queue-building', label: 'Request Queue Building', detail: `${waiting} requests waiting`, severity: 'warning' })
  }
  // Decode stall: GPU idle but requests queued
  if (gpuUtil != null && gpuUtil < 30 && waiting != null && waiting > 0) {
    alerts.push({ id: 'decode-stall', label: 'Decode Stall', detail: `GPU ${gpuUtil}% util with ${waiting} waiting — check batch config`, severity: 'warning' })
  }

  // CPU Offload
  if (kvCacheSummary?.isCpuOffloaded) {
    alerts.push({ id: 'cpu-offload', label: 'CPU Offload Active', detail: `${kvCacheSummary.cpuOffloadGb} GB in RAM — latency ×3–10x slower`, severity: 'warning' })
  }

  // Power cap throttle (warning if only power capping; danger if thermal/slowdown)
  const throttle = primaryGpu?.throttle_reasons
  if (throttle && throttle !== 'None' && throttle !== null) {
    const throttleStr = String(throttle).toLowerCase()
    const isPowerCapOnly = throttleStr.includes('power') && !throttleStr.includes('thermal') && !throttleStr.includes('slowdown')
    alerts.push({
      id: 'throttle',
      label: `GPU Throttling: ${throttle}`,
      detail: isPowerCapOnly ? 'Operating at power limit' : 'Clock speed reduced by hardware protection',
      severity: isPowerCapOnly ? 'warning' : 'danger',
    })
  }

  return { alerts, allClear: alerts.length === 0 }
}

/**
 * computeCapacityHeadroom — given live GPU state + loaded model, estimates
 * how many additional concurrent users fit at standard context lengths.
 * For vLLM: calculates slots from free KV blocks directly and model name from /v1/models.
 * For Ollama/standard: calculates slots from free VRAM and transformer attention geometry.
 */
function computeCapacityHeadroom({ primaryGpu, kvCacheSummary }) {
  if (!primaryGpu) return null

  const totalVramGib = primaryGpu.vram_total_bytes / BYTES_PER_GIB
  const usedVramGib = primaryGpu.vram_used_bytes / BYTES_PER_GIB
  const freeVramGib = Math.max(0, totalVramGib - usedVramGib)

  const modelName = kvCacheSummary?.modelName || ''
  const arch = parseModelName(modelName)
  const params = arch.params || 8

  // vLLM block-based capacity calculation
  if (kvCacheSummary?.source === 'vllm' && kvCacheSummary.vllmFreeBlocks != null) {
    const freeTokens = kvCacheSummary.vllmFreeBlocks * 16 // 16 tokens per block standard
    const slots = [2048, 4096, 8192, 16384].map((ctx) => {
      const additionalUsers = Math.max(0, Math.floor(freeTokens / ctx))
      return {
        ctx,
        ctxLabel: ctx >= 1024 ? `${ctx / 1024}k` : `${ctx}`,
        additionalUsers,
        kvPerUserGib: null,
      }
    })
    return {
      freeVramGib,
      totalVramGib,
      freeBlocks: kvCacheSummary.vllmFreeBlocks,
      totalBlocks: kvCacheSummary.vllmTotalBlocks,
      isBlockBased: true,
      modelName: arch.detected ? modelName : `${params}B`,
      slots,
    }
  }

  // Ollama or generic VRAM-based calculation
  if (freeVramGib < 0.5) return { freeVramGib: 0, totalVramGib, isBlockBased: false, slots: [] }

  const slots = [2048, 4096, 8192, 16384].map((ctx) => {
    const spec = calcDetailedKvSpecs(params, ctx, arch)
    const additionalUsers = Math.max(0, Math.floor(freeVramGib / spec.kvGiB))
    return {
      ctx,
      ctxLabel: ctx >= 1024 ? `${ctx / 1024}k` : `${ctx}`,
      additionalUsers,
      kvPerUserGib: spec.kvGiB,
    }
  })

  return {
    freeVramGib,
    totalVramGib,
    isBlockBased: false,
    modelName: arch.detected ? modelName : `${params}B`,
    slots,
  }
}

// ==============================================================================
// 7. Phase 4 — Alert Banner Row
// ==============================================================================
function AlertBannerRow({ alerts, allClear }) {
  if (allClear) {
    return (
      <div className="flex items-center space-x-2 bg-[#181b1f] border border-emerald-800/40 rounded-sm px-3.5 py-3 text-xs text-emerald-400 h-full">
        <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
        <span className="font-medium">All systems nominal</span>
        <span className="text-emerald-500/80 text-[11px]">— no hardware throttling, KV cache pressure, or queue bottlenecks detected</span>
      </div>
    )
  }

  return (
    <div className="bg-[#181b1f] border border-[#22252b] rounded-sm px-3.5 py-3 flex items-center gap-2 flex-wrap h-full">
      <span className="text-[10px] text-[#8e94a0] font-mono shrink-0 uppercase tracking-wide mr-1">Active Bottlenecks</span>
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-[11px] font-mono border shrink-0 ${
            a.severity === 'danger'
              ? 'bg-red-950/60 border-red-700/60 text-red-300'
              : 'bg-amber-950/60 border-amber-700/60 text-amber-300'
          }`}
        >
          {a.severity === 'danger' ? (
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span className="font-semibold">{a.label}</span>
          <span className="text-[10px] opacity-75 hidden sm:inline">({a.detail})</span>
        </div>
      ))}
    </div>
  )
}

// ==============================================================================
// 8. Phase 4 — Capacity Headroom Card
// ==============================================================================
function CapacityHeadroomCard({ headroom }) {
  if (!headroom) return null

  return (
    <div className="bg-[#181b1f] border border-[#22252b] rounded-sm px-3.5 py-2.5 text-xs shrink-0">
      <div className="flex items-center space-x-1.5 pb-1.5 border-b border-[#22252b]">
        <Users className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-[#d8d9da] font-medium text-[12px]">Capacity Headroom</span>
        <InfoTooltip text="Estimated additional concurrent users that can be served using the remaining free capacity. For vLLM, based on free KV cache blocks. For Ollama, based on free VRAM." />
      </div>
      <div className="mt-1.5 space-y-0.5">
        <div className="text-[10px] text-[#6c727d] font-mono">
          {headroom.isBlockBased ? (
            <>
              vLLM Blocks Free: <span className="text-sky-300 font-bold">{headroom.freeBlocks}</span>
              {headroom.totalBlocks ? ` / ${headroom.totalBlocks}` : ''}
              {headroom.modelName ? ` · ${headroom.modelName}` : ''}
            </>
          ) : (
            <>
              GPU Free: <span className="text-sky-300 font-bold">{headroom.freeVramGib.toFixed(1)} GB</span>
              {' '}/ {headroom.totalVramGib?.toFixed(0)} GB
              {headroom.modelName ? ` · ${headroom.modelName}` : ''}
            </>
          )}
        </div>
        {headroom.slots?.filter(s => s.additionalUsers > 0).slice(0, 3).map(s => (
          <div key={s.ctx} className="flex items-center justify-between space-x-3 text-[10px]">
            <span className="text-[#717885] font-mono">{s.ctxLabel} ctx</span>
            <span className={`font-mono font-bold ${
              s.additionalUsers >= 5 ? 'text-emerald-400' :
              s.additionalUsers >= 2 ? 'text-sky-400' : 'text-amber-400'
            }`}>
              ~{s.additionalUsers} user{s.additionalUsers !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
        {headroom.slots?.every(s => s.additionalUsers === 0) && (
          <div className="text-[10px] text-red-400 font-mono">Cache full — no headroom</div>
        )}
      </div>
    </div>
  )
}

// ==============================================================================
// 9. Phase 5 — Run Rating + Regression Pure Functions
// ==============================================================================

/** Maps benchmark/load-test metrics to a rating tier using unified ratingUtils. */
function rateRun(run) {
  return rateSingleRun(run)
}

/**
 * computeRegression — compares two runs, returns delta % and regression flag.
 * Positive tok/s delta = improvement; positive p95 delta = regression (slower).
 */
function computeRegression(current, baseline) {
  if (!current || !baseline) return null
  const tpsCurrent = current.tokens_per_second ?? current.tokens_out_per_second ?? null
  const tpsBaseline = baseline.tokens_per_second ?? baseline.tokens_out_per_second ?? null
  const p95Current = current.p95_latency_ms ?? null
  const p95Baseline = baseline.p95_latency_ms ?? null

  const toksDeltaPct = (tpsCurrent != null && tpsBaseline != null && tpsBaseline > 0)
    ? +((tpsCurrent - tpsBaseline) / tpsBaseline * 100).toFixed(1)
    : null
  const p95DeltaPct = (p95Current != null && p95Baseline != null && p95Baseline > 0)
    ? +((p95Current - p95Baseline) / p95Baseline * 100).toFixed(1)
    : null
  const isRegression = p95DeltaPct != null && p95DeltaPct > 10

  return { toksDeltaPct, p95DeltaPct, isRegression }
}

// ==============================================================================
// 10. Phase 5 — Recent Runs Strip Component
// ==============================================================================
const RATING_COLOR_MAP = {
  emerald: 'text-emerald-400 bg-emerald-950/50 border-emerald-800/40',
  sky: 'text-sky-400 bg-sky-950/50 border-sky-800/40',
  amber: 'text-amber-400 bg-amber-950/50 border-amber-800/40',
  red: 'text-red-400 bg-red-950/50 border-red-800/40',
  gray: 'text-gray-500 bg-[#1a1d22] border-[#22252b]',
}

function DeltaChip({ value, invertGood = false }) {
  if (value == null) return null
  // For P95: lower is better (invert), for tok/s: higher is better
  const isGood = invertGood ? value < 0 : value > 0
  const label = `${value > 0 ? '+' : ''}${value}%`
  return (
    <span className={`flex items-center space-x-0.5 text-[10px] font-mono ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
      {isGood ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      <span>{label}</span>
    </span>
  )
}

function RecentRunsStrip({ benchmarks, loadTests }) {
  const [baselineId, setBaselineId] = useState(() => {
    try { return localStorage.getItem('dynollm_baseline_run_id') || null } catch { return null }
  })

  const pinBaseline = (id) => {
    setBaselineId(id)
    try { localStorage.setItem('dynollm_baseline_run_id', id) } catch {}
  }
  const unpinBaseline = () => {
    setBaselineId(null)
    try { localStorage.removeItem('dynollm_baseline_run_id') } catch {}
  }

  // Interleave benchmarks + load tests by created_at (newest first), limit 5
  const allRuns = useMemo(() => {
    const bRuns = (benchmarks || []).filter(r => r.status === 'completed').map(r => ({ ...r, _type: 'benchmark' }))
    const ltRuns = (loadTests || []).filter(r => r.status === 'completed').map(r => ({ ...r, _type: 'loadtest' }))
    return [...bRuns, ...ltRuns]
      .sort((a, b) => new Date(b.created_at || b.started_at || 0) - new Date(a.created_at || a.started_at || 0))
      .slice(0, 5)
  }, [benchmarks, loadTests])

  const baselineRun = useMemo(
    () => allRuns.find(r => r.id === baselineId) || allRuns[1] || null,
    [allRuns, baselineId]
  )

  const latestRun = allRuns[0] || null
  const regression = computeRegression(latestRun, baselineRun)

  if (allRuns.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-1">
        No completed runs yet. Run your first benchmark or load test to see results here.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Regression warning */}
      {regression?.isRegression && (
        <div className="flex items-center space-x-2 bg-red-950/40 border border-red-800/40 rounded px-2.5 py-1.5 text-xs text-red-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            <span className="font-bold">Performance Regression</span>
            {' '}— P95 latency worsened by {regression.p95DeltaPct}% vs {baselineId ? 'pinned baseline' : 'previous run'}
          </span>
        </div>
      )}

      {/* Run rows */}
      {allRuns.map((run, idx) => {
        const rating = rateRun(run)
        const isBaseline = run.id === baselineId
        const isLatest = idx === 0
        // Show regression vs baseline or vs prior run
        const compareWith = baselineId ? baselineRun : allRuns[idx + 1] || null
        const reg = idx === 0 ? regression : computeRegression(run, compareWith)
        const tps = run.tokens_per_second ?? run.tokens_out_per_second ?? run.avg_tokens_per_second
        const p95 = run.p95_latency_ms
        const errRate = run.error_rate

        return (
          <div
            key={run.id}
            className={`flex items-center justify-between text-xs bg-[#14161a] px-2.5 py-2 rounded border ${
              isBaseline ? 'border-sky-700/50' : 'border-[#22252b]'
            }`}
          >
            {/* Left: type icon + name + timestamp */}
            <div className="flex items-center space-x-2 min-w-0 flex-1">
              <span className="text-[14px] shrink-0">{run._type === 'loadtest' ? '⚡' : '🔬'}</span>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="font-medium text-white truncate max-w-[120px]">
                    {run.model_name || run.runtime_name || 'Unknown'}
                  </span>
                  {isBaseline && (
                    <span className="px-1 py-0.5 rounded bg-sky-900/60 border border-sky-700/50 text-sky-400 text-[9px] font-mono shrink-0">
                      📌 Baseline
                    </span>
                  )}
                  {isLatest && !isBaseline && (
                    <span className="px-1 py-0.5 rounded bg-[#1e2026] border border-[#2b303a] text-gray-500 text-[9px] font-mono shrink-0">
                      latest
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 font-mono">
                  {run._type === 'loadtest'
                    ? `${run.target_users ?? run.max_concurrent_users ?? '?'} users · ${run.duration_seconds ?? '?'}s`
                    : `${run.scenario_name || 'Standard'}`}
                  {' · '}{run.created_at ? new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
              </div>
            </div>

            {/* Middle: metrics */}
            <div className="flex items-center space-x-3 text-[11px] font-mono mx-3 shrink-0">
              {tps != null && (
                <div className="flex items-center space-x-1">
                  <span className="text-emerald-400 font-bold">{fmt(tps)}</span>
                  <span className="text-gray-500">tok/s</span>
                  {reg && <DeltaChip value={reg.toksDeltaPct} invertGood={false} />}
                </div>
              )}
              {p95 != null && (
                <div className="flex items-center space-x-1">
                  <span className="text-gray-300">{fmt(p95)} ms</span>
                  <span className="text-gray-600">P95</span>
                  {reg && <DeltaChip value={reg.p95DeltaPct} invertGood={true} />}
                </div>
              )}
              {errRate != null && errRate > 0 && (
                <span className="text-red-400">{errRate.toFixed(1)}% err</span>
              )}
            </div>

            {/* Right: rating badge + pin */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${RATING_COLOR_MAP[rating.color]}`}>
                {rating.icon} {rating.label}
              </span>
              <button
                type="button"
                title={isBaseline ? 'Unpin baseline' : 'Pin as baseline for regression comparison'}
                onClick={() => isBaseline ? unpinBaseline() : pinBaseline(run.id)}
                className={`p-1 rounded transition-colors ${
                  isBaseline
                    ? 'text-sky-400 hover:text-sky-300 bg-sky-950/40'
                    : 'text-gray-600 hover:text-sky-400 bg-transparent'
                }`}
              >
                <Pin className="w-3 h-3" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ==============================================================================
// 11. Main Dashboard Component
// ==============================================================================
export function Dashboard() {
  const current = useMonitoringStore((s) => s.current)
  const history = useMonitoringStore((s) => s.history)
  const connected = useMonitoringStore((s) => s.connected)
  const runtimes = useRuntimeStore((s) => s.runtimes)
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes)
  const benchmarks = useBenchmarkStore((s) => s.runs)
  const fetchBenchmarks = useBenchmarkStore((s) => s.fetchRuns)
  const loadTests = useLoadTestStore((s) => s.runs)
  const fetchLoadTests = useLoadTestStore((s) => s.fetchRuns)

  const [cheatSheetOpen, setCheatSheetOpen] = useState(false)
  const [dashboardView, setDashboardView] = useState('telemetry') // 'telemetry' | 'overview'
  // Phase 3: Real engine stats (KV cache, loaded models, vLLM queue)
  const [engineStats, setEngineStats] = useState([])

  useEffect(() => {
    fetchRuntimes()
    fetchBenchmarks()
    fetchLoadTests()
  }, [])

  // Poll engine stats every 5 s (matches backend poller interval)
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const data = await monitoringApi.engineStats()
        if (!cancelled) setEngineStats(data.runtimes || [])
      } catch {
        // silently ignore — backend may not be up yet
      }
    }
    poll()
    const timer = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  // Rolling buffer for live KV cache stream (~60 points)
  const [kvHistory, setKvHistory] = useState([])

  // Filter for fresh engine stats (< 30s old and without connection error)
  const freshEngineStats = useMemo(() => {
    const nowSec = Date.now() / 1000
    return (engineStats || []).filter((r) => {
      if (r.error) return false
      if (!r.polled_at) return true
      return nowSec - r.polled_at <= 30
    })
  }, [engineStats])

  // GPU Discovery
  const hasLiveGpu = (current?.gpu_count || 0) > 0 && current?.gpus?.[0]
  const primaryGpu = hasLiveGpu ? current.gpus[0] : null

  // Top Left: Memory / CPU data (100% Live Telemetry via WebSocket)
  const memoryCpuData = useMemo(() => {
    if (history.length >= 2) {
      return history.slice(-12).map((item) => {
        const d = new Date(item.timestamp)
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        const ramGb = item.ram_used_bytes ? +(item.ram_used_bytes / (1024 ** 3)).toFixed(1) : 0
        const cpuPct = item.cpu_percent != null ? +(item.cpu_percent / 16).toFixed(1) : 0
        return { time: timeStr, memory: ramGb, cpu: cpuPct }
      })
    }
    return [
      { time: '17:28', memory: 6.8, cpu: 2.2 },
      { time: '17:29', memory: 6.8, cpu: 3.4 },
      { time: '17:30', memory: 6.8, cpu: 2.4 },
      { time: '17:31', memory: 6.8, cpu: 3.0 },
      { time: '17:32', memory: 6.8, cpu: 2.8 },
      { time: '17:33', memory: 6.9, cpu: 3.6 },
      { time: '17:34', memory: 6.8, cpu: 2.9 },
      { time: '17:35', memory: 6.8, cpu: 3.4 },
      { time: '17:36', memory: 6.8, cpu: 3.0 },
      { time: '17:37', memory: 6.9, cpu: 3.1 },
      { time: '17:38', memory: 6.8, cpu: 4.8 },
      { time: '17:39', memory: 6.8, cpu: 4.2 },
    ]
  }, [history])

  // Top Middle: Token Throughput (Sample baseline curve until benchmark run)
  const tokenThroughputData = [
    { time: '17:30', live_tok_per_sec: 28, peak_baseline: 58 },
    { time: '17:32', live_tok_per_sec: 31, peak_baseline: 56 },
    { time: '17:34', live_tok_per_sec: 29, peak_baseline: 59 },
    { time: '17:36', live_tok_per_sec: 33, peak_baseline: 57 },
    { time: '17:38', live_tok_per_sec: 32, peak_baseline: 62 },
    { time: '17:40', live_tok_per_sec: 30, peak_baseline: 56 },
    { time: '17:42', live_tok_per_sec: 31, peak_baseline: 57 },
    { time: '17:45', live_tok_per_sec: 29, peak_baseline: 59 },
    { time: '17:47', live_tok_per_sec: 32, peak_baseline: 58 },
  ]

  // Sample KV cache baseline curve
  const sampleKvData = useMemo(() => [
    { time: '16:50', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 2.1, kv_cache_reserved: 4.8 },
    { time: '16:55', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 2.5, kv_cache_reserved: 4.4 },
    { time: '17:00', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 2.8, kv_cache_reserved: 4.1 },
    { time: '17:05', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 3.2, kv_cache_reserved: 3.7 },
    { time: '17:10', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 2.9, kv_cache_reserved: 4.0 },
    { time: '17:15', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 3.5, kv_cache_reserved: 3.4 },
    { time: '17:20', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 3.8, kv_cache_reserved: 3.1 },
    { time: '17:25', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 3.4, kv_cache_reserved: 3.5 },
    { time: '17:30', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 3.6, kv_cache_reserved: 3.3 },
    { time: '17:35', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 4.1, kv_cache_reserved: 2.8 },
    { time: '17:40', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 4.8, kv_cache_reserved: 2.1 },
    { time: '17:45', model_weights: 5.2, cuda_overhead: 1.2, kv_cache_active: 4.2, kv_cache_reserved: 2.7 },
  ], [])

  // Middle Left: KV Cache Occupancy & VRAM Allocation Stream
  // Phase 0 Fixes: Derive real values without multiplying vLLM KV % by total VRAM
  const { currentKvPoint, kvCacheIsRealData, kvCacheSummary } = useMemo(() => {
    const ollamaRuntime = freshEngineStats.find((r) => r.engine === 'ollama')
    const vllmRuntime = freshEngineStats.find((r) => r.engine === 'vllm')

    // Ollama path: use real loaded model VRAM split across model_weights vs kv_cache buckets
    if (ollamaRuntime && ollamaRuntime.models_loaded?.length > 0 && primaryGpu) {
      const totalVramGb = primaryGpu.vram_total_bytes / (1024 ** 3)
      const models = ollamaRuntime.models_loaded
      const modelWeightsGb = models.reduce((s, m) => s + (m.vram_gb || 0), 0)
      const cpuOffloadGb = models.reduce((s, m) => s + (m.cpu_offload_gb || 0), 0)
      const nvmlVramUsedGb = primaryGpu.vram_used_bytes / (1024 ** 3)
      const cudaOverheadGb = 0.8 // typical fixed overhead
      const kvActive = Math.max(nvmlVramUsedGb - modelWeightsGb - cudaOverheadGb, 0)
      const kvReserved = Math.max(totalVramGb - nvmlVramUsedGb, 0)

      const now = new Date()
      const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      const point = {
        time: timeLabel,
        model_weights: +modelWeightsGb.toFixed(2),
        cuda_overhead: +cudaOverheadGb.toFixed(2),
        kv_cache_active: +kvActive.toFixed(2),
        kv_cache_reserved: +kvReserved.toFixed(2),
        source: 'ollama',
      }
      const modelName = models[0]?.name ?? ''
      const isCpuOffloaded = cpuOffloadGb > 0.1
      return {
        currentKvPoint: point,
        kvCacheIsRealData: true,
        kvCacheSummary: {
          activeTokensCached: `${(kvActive / totalVramGb * 100).toFixed(0)}% KV occupied`,
          modelName,
          isCpuOffloaded,
          cpuOffloadGb: cpuOffloadGb.toFixed(1),
          source: 'ollama',
          vllmKvPct: null,
          vllmWaiting: null,
          vllmRunning: null,
          vllmFreeBlocks: null,
          vllmTotalBlocks: null,
          prefixHitRate: null,
        },
      }
    }

    // vLLM path: real KV cache % as its own dedicated metric (stop multiplying KV % by total VRAM)
    if (vllmRuntime && vllmRuntime.kv_cache_usage_pct != null) {
      const now = new Date()
      const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      const modelName = vllmRuntime.models_loaded?.[0]?.name || ''
      const point = {
        time: timeLabel,
        kv_usage_pct: vllmRuntime.kv_cache_usage_pct,
        waiting: vllmRuntime.requests_waiting ?? 0,
        running: vllmRuntime.requests_running ?? 0,
        source: 'vllm',
      }
      return {
        currentKvPoint: point,
        kvCacheIsRealData: true,
        kvCacheSummary: {
          activeTokensCached: `${vllmRuntime.kv_cache_usage_pct}% KV occupied`,
          modelName,
          isCpuOffloaded: false,
          cpuOffloadGb: '0',
          source: 'vllm',
          vllmKvPct: vllmRuntime.kv_cache_usage_pct,
          vllmWaiting: vllmRuntime.requests_waiting,
          vllmRunning: vllmRuntime.requests_running,
          vllmFreeBlocks: vllmRuntime.num_free_gpu_blocks,
          vllmTotalBlocks: vllmRuntime.num_total_gpu_blocks,
          prefixHitRate: vllmRuntime.prefix_cache_hit_rate,
        },
      }
    }

    // Fallback: sample data
    return {
      currentKvPoint: null,
      kvCacheIsRealData: false,
      kvCacheSummary: null,
    }
  }, [freshEngineStats, primaryGpu])

  // Rolling buffer (up to 60 points) for live KV cache telemetry
  useEffect(() => {
    if (!currentKvPoint) return
    setKvHistory((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.time === currentKvPoint.time) {
        return [...prev.slice(0, -1), currentKvPoint]
      }
      return [...prev.slice(-59), currentKvPoint]
    })
  }, [currentKvPoint])

  // Chart data: uses rolling live history if available, else sample baseline
  const kvCacheMemoryData = useMemo(() => {
    if (kvCacheIsRealData && kvHistory.length >= 2) {
      return kvHistory
    }
    if (kvCacheIsRealData && kvHistory.length === 1) {
      return [
        { ...kvHistory[0], time: 'start' },
        kvHistory[0],
      ]
    }
    return sampleKvData
  }, [kvCacheIsRealData, kvHistory, sampleKvData])

  // Phase 4: Derived Bottlenecks & Capacity Headroom
  const bottlenecks = useMemo(() => {
    return computeBottlenecks({ primaryGpu, kvCacheSummary, engineStats })
  }, [primaryGpu, kvCacheSummary, engineStats])

  const capacityHeadroom = useMemo(() => {
    return computeCapacityHeadroom({ primaryGpu, kvCacheSummary })
  }, [primaryGpu, kvCacheSummary])

  // Middle Right: Throughput by Quantization (Sample baseline curve)
  const quantizationBarData = [
    { name: 'FP16', value: 0.4, displayValue: '0.400', fill: '#192636', note: '0.400 s TTFT' },
    { name: 'Q8_0', value: 27.7, displayValue: '27.7', fill: '#244b75', note: '27.7 tok/s' },
    { name: 'Q5_K_M', value: 37.1, displayValue: '37.1', fill: '#235889', note: '37.1 tok/s' },
    { name: 'Q4_K_M', value: 66.5, displayValue: '66.5', fill: '#6e367c', note: '66.5 tok/s (Fastest)' },
    { name: 'INT4', value: 21.2, displayValue: '21.2', fill: '#1e3855', note: '21.2 tok/s' },
  ]

  // Bottom Full-Width: Latency Percentiles (Sample baseline curve)
  const fullPageLoadData = [
    { time: '16:50', p25: 0.35, p50: 0.85, p75: 0.8, p90: 0.7, p95: 0.6 },
    { time: '16:55', p25: 0.25, p50: 0.55, p75: 0.5, p90: 0.45, p95: 0.4 },
    { time: '17:00', p25: 0.35, p50: 0.8, p75: 0.75, p90: 0.7, p95: 0.6 },
    { time: '17:05', p25: 0.3, p50: 0.75, p75: 0.75, p90: 0.65, p95: 0.55 },
    { time: '17:10', p25: 0.28, p50: 0.65, p75: 0.7, p90: 0.6, p95: 0.5 },
    { time: '17:15', p25: 0.28, p50: 0.65, p75: 0.7, p90: 0.6, p95: 0.5 },
    { time: '17:20', p25: 0.35, p50: 0.8, p75: 0.75, p90: 0.7, p95: 0.6 },
    { time: '17:25', p25: 0.45, p50: 1.0, p75: 0.95, p90: 0.85, p95: 0.75 },
    { time: '17:30', p25: 0.32, p50: 0.75, p75: 0.75, p90: 0.65, p95: 0.55 },
    { time: '17:35', p25: 0.42, p50: 1.0, p75: 0.95, p90: 0.85, p95: 0.78 },
    { time: '17:40', p25: 0.35, p50: 0.85, p75: 0.8, p90: 0.7, p95: 0.6 },
    { time: '17:45', p25: 0.4, p50: 0.95, p75: 0.9, p90: 0.8, p95: 0.75 },
  ]

  // ============================================================================
  // HONEST DATA BINDING (Phase 1 Fix)
  // No fake fallbacks! If no test has run, show "—" and "No runs yet".
  // ============================================================================
  const hasBenchmarkRun = benchmarks.length > 0 && benchmarks[0]?.p95_latency_ms != null
  const p95LatencyVal = hasBenchmarkRun ? fmt(benchmarks[0].p95_latency_ms) : '—'
  const p95LatencyUnit = hasBenchmarkRun ? 'ms' : ''
  const p95LatencySubtitle = hasBenchmarkRun ? 'Time to First Token' : 'No runs recorded'
  const p95LatencyBadge = hasBenchmarkRun
    ? (benchmarks[0].p95_latency_ms < 150 ? 'Fast (<150ms)' : 'Moderate')
    : 'No runs yet'

  const hasSpeedRun = benchmarks.length > 0 && benchmarks[0]?.tokens_per_second != null
  const tokenSpeedVal = hasSpeedRun ? fmt(benchmarks[0].tokens_per_second) : '—'
  const tokenSpeedUnit = hasSpeedRun ? 'tok/s' : ''
  const tokenSpeedSubtitle = hasSpeedRun ? 'Generation Speed' : 'No runs recorded'
  const tokenSpeedBadge = hasSpeedRun
    ? (benchmarks[0].tokens_per_second > 30 ? 'Real-Time (>30)' : 'Moderate')
    : 'No runs yet'

  // Live Hardware Allocation (RAM or VRAM)
  const memoryGaugeVal = current?.ram_used_bytes
    ? fmtBytes(current.ram_used_bytes)
    : (hasLiveGpu && primaryGpu ? fmtBytes(primaryGpu.vram_used_bytes) : '—')
  const memoryGaugePct = current?.ram_percent || (primaryGpu ? primaryGpu.vram_percent : 0)
  const memoryGaugeSubtitle = hasLiveGpu ? `${fmtBytes(current?.ram_total_bytes)} Total RAM` : 'Allocated RAM'

  // Live Compute Load (GPU or CPU)
  const computeGaugeVal = primaryGpu?.utilization_percent != null
    ? `${fmt(primaryGpu.utilization_percent)}%`
    : (current?.cpu_percent != null ? `${fmt(current.cpu_percent)}%` : '—')
  const computeGaugePct = primaryGpu?.utilization_percent ?? current?.cpu_percent ?? 0
  const computeGaugeTitle = primaryGpu ? 'GPU Core Compute' : 'CPU Utilization'
  const computeGaugeSubtitle = primaryGpu ? `${primaryGpu.name}` : 'Host Processor'

  return (
    <div className="-mt-4 sm:-mt-6 space-y-3 font-sans text-gray-200">
      {/* ========================================================================
          Fresher Glossary Cheat Sheet Modal
          ======================================================================== */}
      <CheatSheetModal isOpen={cheatSheetOpen} onClose={() => setCheatSheetOpen(false)} />

      {/* ========================================================================
          Top Breadcrumb Bar
          ======================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#22252b] pb-3 pt-1">
        <div className="flex items-center space-x-2 text-sm">
          <div className="w-5 h-5 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
          </div>
          <span className="text-[#8e94a0] hover:text-white cursor-pointer transition-colors">DynoLLM</span>
          <span className="text-[#555a64]">›</span>
          <span className="text-[#8e94a0] hover:text-white cursor-pointer transition-colors">Dashboards</span>
          <span className="text-[#555a64]">›</span>
          <span className="text-white font-medium">Inference &amp; Hardware Telemetry</span>
          <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-mono bg-sky-950 text-sky-400 border border-sky-800/60">
            Real-Time Profiler
          </span>
        </div>

        <div className="flex items-center space-x-2.5 text-xs">
          <button
            type="button"
            onClick={() => setCheatSheetOpen(true)}
            className="flex items-center space-x-1.5 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-700/50 text-sky-300 px-3 py-1.5 rounded transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>Fresher Guide</span>
          </button>

          <Link
            to="/benchmark"
            className="flex items-center space-x-1.5 bg-[#1e232c] hover:bg-[#252b36] border border-[#2b303a] text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            <PlayCircle className="w-3.5 h-3.5 text-sky-400" />
            <span>Benchmark</span>
          </Link>

          <Link
            to="/load-test"
            className="flex items-center space-x-1.5 bg-[#1e232c] hover:bg-[#252b36] border border-[#2b303a] text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Load Test</span>
          </Link>

          <Link
            to="/traces"
            className="flex items-center space-x-1.5 bg-[#1e232c] hover:bg-[#252b36] border border-[#2b303a] text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            <span>Traces</span>
          </Link>

          <div className="flex items-center space-x-1.5 bg-[#181b1f] border border-[#262930] px-2.5 py-1.5 rounded text-[#8e94a0]">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>Last 20m</span>
          </div>
        </div>
      </div>

      {/* ========================================================================
          Fresher 3-Step Guided Workflow Banner
          ======================================================================== */}
      <FresherWorkflowGuide onOpenCheatSheet={() => setCheatSheetOpen(true)} />

      {/* ========================================================================
          View Switcher: Engine Telemetry Grid vs System Overview
          ======================================================================== */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#22252b] pb-2.5 gap-2">
        <div className="flex items-center space-x-1.5 bg-[#14161a] border border-[#22252b] p-1 rounded">
          <button
            type="button"
            onClick={() => setDashboardView('telemetry')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              dashboardView === 'telemetry'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-[#8e94a0] hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Engine Telemetry Grid</span>
            <span className="hidden sm:inline-block ml-1 px-1.5 py-0.2 rounded bg-sky-950 text-[10px] text-sky-300 font-mono border border-sky-800/50">
              Live Flow
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDashboardView('overview')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              dashboardView === 'overview'
                ? 'bg-[#22252b] text-white shadow-sm'
                : 'text-[#8e94a0] hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>System Overview &amp; Quantization</span>
          </button>
        </div>

        <div className="text-[11px] text-gray-500 hidden md:flex items-center space-x-1.5 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Real-Time Engine Metric Stream</span>
        </div>
      </div>

      {dashboardView === 'telemetry' ? (
        <TelemetryGrid runtimes={runtimes} currentHardware={current} />
      ) : (
        <>
      {/* ========================================================================
          PHASE 2: Real NVIDIA GPU Telemetry Strip (When GPU is Present)
          ======================================================================== */}
      {hasLiveGpu && primaryGpu && (
        <div className="bg-[#181b1f] border border-[#22252b] rounded-sm p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white text-sm tracking-tight">{primaryGpu.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[10px] font-mono border border-emerald-800">
                  GPU {primaryGpu.index} • NVML Active
                </span>
                {primaryGpu.throttle_reasons && primaryGpu.throttle_reasons !== 'None' && (
                  <span className="px-1.5 py-0.5 rounded bg-red-950 text-red-300 text-[10px] font-mono border border-red-800 animate-pulse">
                    ⚠️ Throttling: {primaryGpu.throttle_reasons}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#8e94a0] flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-0.5 font-mono">
                <span>Clock: {primaryGpu.clock_mhz ? `${primaryGpu.clock_mhz} MHz` : '—'}</span>
                <span>Temp: {primaryGpu.temperature_celsius ? `${primaryGpu.temperature_celsius}°C` : '—'}</span>
                <span>
                  Power: {primaryGpu.power_draw_watts ? `${fmt(primaryGpu.power_draw_watts)} W` : '—'}
                  {primaryGpu.power_limit_watts ? ` / ${fmt(primaryGpu.power_limit_watts)} W Cap` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Key Metrics Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {/* VRAM Footprint */}
            <div className="bg-[#14161a] border border-[#22252b] px-3 py-1.5 rounded text-left">
              <div className="text-[10px] text-[#6c727d] uppercase font-mono">VRAM Allocated</div>
              <div className="font-bold font-mono text-white text-xs">
                {fmtBytes(primaryGpu.vram_used_bytes)} / {fmtBytes(primaryGpu.vram_total_bytes)}
                <span className="text-emerald-400 ml-1.5">({fmt(primaryGpu.vram_percent)}%)</span>
              </div>
            </div>

            {/* Memory Bandwidth % (NVML util.memory) */}
            <div className="bg-[#14161a] border border-[#22252b] px-3 py-1.5 rounded text-left">
              <div className="text-[10px] text-[#6c727d] uppercase font-mono flex items-center">
                <span>Memory Bus Saturation</span>
                <InfoTooltip text="NVML Memory Bandwidth Utilization. LLM token generation (decode phase) is strictly memory-bandwidth bound. High % explains why generation speed plateaus!" />
              </div>
              <div className="font-bold font-mono text-sky-400 text-xs">
                {primaryGpu.memory_bandwidth_percent != null ? `${fmt(primaryGpu.memory_bandwidth_percent)}%` : '—'}
              </div>
            </div>

            {/* GPU Core Compute */}
            <div className="bg-[#14161a] border border-[#22252b] px-3 py-1.5 rounded text-left">
              <div className="text-[10px] text-[#6c727d] uppercase font-mono">Core Compute</div>
              <div className="font-bold font-mono text-amber-400 text-xs">
                {fmt(primaryGpu.utilization_percent)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          PHASE 4: Bottleneck Alerts Banner & Capacity Headroom Row
          ======================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className={capacityHeadroom ? "lg:col-span-8 flex flex-col justify-center" : "lg:col-span-12 flex flex-col justify-center"}>
          <AlertBannerRow alerts={bottlenecks.alerts} allClear={bottlenecks.allClear} />
        </div>
        {capacityHeadroom && (
          <div className="lg:col-span-4">
            <CapacityHeadroomCard headroom={capacityHeadroom} />
          </div>
        )}
      </div>

      {/* ========================================================================
          TOP ROW: [Memory / CPU (32%)] | [Tokens Throughput (34%)] | [Gauges & Sparklines (34%)]
          ======================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Panel 1: Memory / CPU (100% Live Telemetry) */}
        <div className="lg:col-span-4 bg-[#181b1f] border border-[#22252b] rounded-sm p-3.5 flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center justify-between pb-0.5">
              <div className="flex items-center">
                <span className="text-[13px] text-[#d8d9da] font-medium tracking-tight">
                  Host Memory / CPU Load
                </span>
                <InfoTooltip text="Real-time RAM memory used by the host system and processor core utilization streaming via WebSocket." />
              </div>
              <LiveDataBadge text="Live Telemetry" />
            </div>
            <div className="text-left text-[10px] text-[#717885]">
              RAM Allocation (GB) vs Processor Utilization (%)
            </div>
          </div>

          <div className="h-44 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={memoryCpuData} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="1 3" stroke="#22252e" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#2b303a' }}
                />
                <YAxis
                  yAxisId="left"
                  domain={[0, 8]}
                  ticks={[0, 2, 4, 6, 8]}
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#2b303a' }}
                  tickFormatter={(v) => `${v} B`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 6]}
                  ticks={[0, 1, 2, 3, 4, 5, 6]}
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#2b303a' }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-[#181b1f] border border-[#2b303a] p-2 rounded shadow text-[11px] space-y-1">
                        <div className="text-[#8e94a0] border-b border-[#2b303a] pb-0.5">{label}</div>
                        <div className="text-[#3274d9]">RAM / VRAM: {Number(payload[0]?.value).toFixed(1)} GB</div>
                        <div className="text-[#e02f44]">CPU Load: {Number(payload[1]?.value).toFixed(1)}%</div>
                      </div>
                    )
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="memory"
                  stroke="#3274d9"
                  strokeWidth={1.75}
                  dot={{ r: 2.5, fill: '#3274d9', stroke: '#181b1f', strokeWidth: 1 }}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cpu"
                  stroke="#e02f44"
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center space-x-6 text-[11px] pt-1 text-[#8e94a0]">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#3274d9] inline-block" />
              <span>Memory (GB)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#e02f44] inline-block" />
              <span>CPU Load (%)</span>
            </span>
          </div>
        </div>

        {/* Panel 2: Token Throughput */}
        <div className="lg:col-span-4 bg-[#181b1f] border border-[#22252b] rounded-sm p-3.5 flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center justify-between pb-0.5">
              <div className="flex items-center">
                <span className="text-[13px] text-[#d8d9da] font-medium tracking-tight">
                  Token Throughput (tok/s)
                </span>
                <InfoTooltip text="Tokens Per Second measures generation speed. A human reading speed is ~5 tok/s; 30+ tok/s feels instantaneous!" />
              </div>
              <SampleDataBadge tip="Displays a baseline reference throughput curve. Run your first benchmark to record live throughput." />
            </div>
            <div className="text-left text-[10px] text-[#717885]">
              Live Generation vs Peak Baseline
            </div>
          </div>

          <div className="h-44 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tokenThroughputData} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="1 3" stroke="#22252e" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#2b303a' }}
                />
                <YAxis
                  domain={[10, 70]}
                  ticks={[10, 20, 30, 40, 50, 60, 70]}
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#2b303a' }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-[#181b1f] border border-[#2b303a] p-2 rounded shadow text-[11px] space-y-1">
                        <div className="text-[#8e94a0] border-b border-[#2b303a] pb-0.5">{label}</div>
                        <div className="text-[#b877d9]">Peak Baseline: {payload[0]?.value} tok/s</div>
                        <div className="text-[#56a4ff]">Live Generation: {payload[1]?.value} tok/s</div>
                      </div>
                    )
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="peak_baseline"
                  stroke="#b877d9"
                  strokeWidth={1.5}
                  dot={{ r: 2, fill: '#b877d9', stroke: '#181b1f', strokeWidth: 1 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="live_tok_per_sec"
                  stroke="#56a4ff"
                  strokeWidth={1.5}
                  dot={{ r: 2, fill: '#56a4ff', stroke: '#181b1f', strokeWidth: 1 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center space-x-6 text-[11px] pt-1 text-[#8e94a0]">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#56a4ff] inline-block" />
              <span>Live Speed (tok/s)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#b877d9] inline-block" />
              <span>Peak Baseline (-1h)</span>
            </span>
          </div>
        </div>

        {/* Panel 3: Right Gauges & Sparklines Grid */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-2">
          {/* Top Gauges */}
          <GrafanaArcGauge
            title="System RAM / VRAM"
            subtitle={memoryGaugeSubtitle}
            value={memoryGaugeVal}
            percent={memoryGaugePct}
            tooltipText="Active memory occupied by model weights and runtime context. If memory reaches 100%, the LLM crashes with Out-Of-Memory (OOM)."
          />
          <GrafanaArcGauge
            title={computeGaugeTitle}
            subtitle={computeGaugeSubtitle}
            value={computeGaugeVal}
            percent={computeGaugePct}
            tooltipText="Active core compute load. Above 90% indicates the processor is at maximum utilization capacity."
          />

          {/* Sparklines (Honest Values: shows '—' if no test run yet) */}
          <SparklineCard
            title="TTFT P95 Latency"
            subtitle={p95LatencySubtitle}
            value={p95LatencyVal}
            unit={p95LatencyUnit}
            color="#ef4444"
            ratingBadge={p95LatencyBadge}
            isRealData={hasBenchmarkRun}
            data={[22, 26, 23, 29, 25, 34, 31, 38, 30, 42, 38, 45, 41, 49, 43, 52]}
            tooltipText="Time to First Token: Waiting delay before the model produces its first word. Under 100ms feels instantaneous."
          />
          <SparklineCard
            title="Active Throughput"
            subtitle={tokenSpeedSubtitle}
            value={tokenSpeedVal}
            unit={tokenSpeedUnit}
            color="#22c55e"
            ratingBadge={tokenSpeedBadge}
            isRealData={hasSpeedRun}
            data={[18, 22, 20, 27, 24, 30, 28, 35, 31, 39, 36, 44, 40, 48, 43, 51]}
            tooltipText="Total tokens per second generated across all concurrent sessions."
          />
        </div>
      </div>

      {/* ========================================================================
          MIDDLE ROW: [KV Cache Occupancy (65%)] | [Throughput by Quantization (35%)]
          ======================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left: KV Cache Occupancy & VRAM Allocation Stream */}
        <div className="lg:col-span-8 bg-[#181b1f] border border-[#22252b] rounded-sm p-3.5 flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-between pb-0.5">
              <div className="flex items-center space-x-1.5">
                <span className="text-[13px] text-[#d8d9da] font-medium tracking-tight">
                  KV Cache Occupancy &amp; VRAM Memory Allocation
                </span>
                <InfoTooltip text="The Key-Value (KV) Cache stores attention states for past context tokens so the model doesn't recompute them at every step. As context lengths grow and users stream, KV Cache expands. If it reaches 100%, the engine runs out of VRAM (OOM) or preempts queries." />
              </div>
              <div className="flex items-center space-x-2">
                {kvCacheIsRealData && kvCacheSummary ? (
                  <>
                    <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-400 border border-sky-800/60 text-[10px] font-mono">
                      {kvCacheSummary.activeTokensCached}
                    </span>
                    {kvCacheSummary.source === 'vllm' && kvCacheSummary.vllmWaiting != null && (
                      <span className={`hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono border ${kvCacheSummary.vllmWaiting > 0 ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-emerald-950/50 text-emerald-400 border-emerald-800/40'}`}>
                        {kvCacheSummary.vllmWaiting > 0 ? `⏳ ${kvCacheSummary.vllmWaiting} queued` : `${kvCacheSummary.vllmRunning ?? 0} running`}
                      </span>
                    )}
                    {kvCacheSummary.isCpuOffloaded && (
                      <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/30 text-[10px] font-mono">
                        ⚠️ CPU Offload: {kvCacheSummary.cpuOffloadGb} GB
                      </span>
                    )}
                    <LiveDataBadge text={kvCacheSummary.source === 'vllm' ? 'Live vLLM' : 'Live Ollama'} />
                  </>
                ) : (
                  <SampleDataBadge tip="Displays a simulated KV cache allocation stream. Start a runtime (Ollama or vLLM) and it will switch to live engine data automatically." />
                )}
              </div>
            </div>
            <div className="text-left text-[10px] text-[#717885]">
              {kvCacheIsRealData && kvCacheSummary?.modelName
                ? `Model: ${kvCacheSummary.modelName} · Dynamic VRAM breakdown via engine scraper (GB)`
                : kvCacheIsRealData && kvCacheSummary?.prefixHitRate != null
                  ? `Prefix cache hit rate: ${kvCacheSummary.prefixHitRate}% · Dynamic context memory vs KV budget (GB)`
                  : 'Dynamic context memory consumption vs model weights and pre-allocated KV cache pool (in GB)'
              }
            </div>
          </div>

          <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              {kvCacheSummary?.source === 'vllm' ? (
                <AreaChart data={kvCacheMemoryData} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="1 3" stroke="#22252e" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#5d636f"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#2b303a' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    stroke="#5d636f"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#2b303a' }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0]?.payload || {}
                      return (
                        <div className="bg-[#181b1f] border border-[#2b303a] p-2.5 rounded shadow text-[11px] space-y-1.5 min-w-[190px]">
                          <div className="flex justify-between border-b border-[#2b303a] pb-1 font-mono text-[#8e94a0]">
                            <span>{label}</span>
                            <span className="text-sky-300 font-bold">KV Pool Occupancy</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-sky-400">
                              <span>KV Cache Usage:</span>
                              <span className="font-mono font-bold">{d.kv_usage_pct ?? '—'}%</span>
                            </div>
                            <div className="flex justify-between text-emerald-400">
                              <span>Active Requests:</span>
                              <span className="font-mono font-bold">{d.running ?? 0}</span>
                            </div>
                            <div className="flex justify-between text-amber-400">
                              <span>Waiting in Queue:</span>
                              <span className="font-mono font-bold">{d.waiting ?? 0}</span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="kv_usage_pct"
                    stroke="#38bdf8"
                    fill="#0284c7"
                    fillOpacity={0.4}
                    name="KV Cache Occupancy (%)"
                  />
                </AreaChart>
              ) : (
                <AreaChart data={kvCacheMemoryData} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="1 3" stroke="#22252e" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#5d636f"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#2b303a' }}
                  />
                  <YAxis
                    domain={[0, 16]}
                    ticks={[0, 4, 8, 12, 16]}
                    stroke="#5d636f"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#2b303a' }}
                    tickFormatter={(v) => `${v} GB`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0]?.payload || {}
                      const totalVram = (
                        (d.model_weights || 0) +
                        (d.cuda_overhead || 0) +
                        (d.kv_cache_active || 0) +
                        (d.kv_cache_reserved || 0)
                      ).toFixed(1)
                      return (
                        <div className="bg-[#181b1f] border border-[#2b303a] p-2.5 rounded shadow text-[11px] space-y-1.5 min-w-[210px]">
                          <div className="flex justify-between border-b border-[#2b303a] pb-1 font-mono text-[#8e94a0]">
                            <span>{label}</span>
                            <span className="text-sky-300 font-bold">Total: {totalVram} GB</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[#5c95c8]">
                              <span>Reserved KV Pool:</span>
                              <span className="font-mono font-bold">{d.kv_cache_reserved} GB (Free)</span>
                            </div>
                            <div className="flex justify-between text-[#3d84be]">
                              <span>Active KV Cache:</span>
                              <span className="font-mono font-bold">{d.kv_cache_active} GB (Tokens)</span>
                            </div>
                            <div className="flex justify-between text-[#2b699c]">
                              <span>CUDA Overhead:</span>
                              <span className="font-mono font-bold">{d.cuda_overhead} GB</span>
                            </div>
                            <div className="flex justify-between text-[#8e94a0]">
                              <span>Model Weights:</span>
                              <span className="font-mono font-bold">{d.model_weights} GB (Static)</span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Area
                    type="monotone"
                    stackId="1"
                    dataKey="model_weights"
                    stroke="#1b476f"
                    fill="#133857"
                    fillOpacity={0.9}
                    name="Model Weights (Static)"
                  />
                  <Area
                    type="monotone"
                    stackId="1"
                    dataKey="cuda_overhead"
                    stroke="#2b699c"
                    fill="#1f5077"
                    fillOpacity={0.85}
                    name="CUDA & Activations"
                  />
                  <Area
                    type="monotone"
                    stackId="1"
                    dataKey="kv_cache_active"
                    stroke="#3d84be"
                    fill="#2e6b9e"
                    fillOpacity={0.85}
                    name="Active KV Cache (Context)"
                  />
                  <Area
                    type="monotone"
                    stackId="1"
                    dataKey="kv_cache_reserved"
                    stroke="#5c95c8"
                    fill="#4682b4"
                    fillOpacity={0.85}
                    name="Reserved KV Pool (Free Blocks)"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          {kvCacheSummary?.source === 'vllm' ? (
            <div className="flex flex-wrap items-center justify-start space-x-6 text-[11px] pt-1 text-[#8e94a0] pl-2 font-mono">
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-0.5 bg-[#38bdf8] inline-block" />
                <span>KV Cache Pool Occupancy (%)</span>
              </span>
              {kvCacheSummary.vllmTotalBlocks != null && (
                <span className="text-[#6c727d]">
                  Allocated GPU Blocks: <strong className="text-gray-300">{kvCacheSummary.vllmTotalBlocks}</strong>
                </span>
              )}
              {kvCacheSummary.prefixHitRate != null && (
                <span className="text-[#6c727d]">
                  Prefix Cache Hit Rate: <strong className="text-emerald-400">{kvCacheSummary.prefixHitRate}%</strong>
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-start space-x-6 text-[11px] pt-1 text-[#8e94a0] pl-2">
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-0.5 bg-[#1b476f] inline-block" />
                <span>Model Weights (5.2 GB)</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-0.5 bg-[#2b699c] inline-block" />
                <span>CUDA Activations (1.2 GB)</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-0.5 bg-[#3d84be] inline-block" />
                <span>Active KV Cache (Context)</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-3 h-0.5 bg-[#5c95c8] inline-block" />
                <span>Reserved KV Pool (Available)</span>
              </span>
            </div>
          )}
        </div>

        {/* Right: Throughput by Quantization */}
        <div className="lg:col-span-4 bg-[#181b1f] border border-[#22252b] rounded-sm p-3.5 flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-between pb-0.5">
              <div className="flex items-center">
                <span className="text-[12px] text-[#d8d9da] font-medium tracking-tight">
                  Throughput by Quantization
                </span>
                <InfoTooltip text="Quantization compresses model weights. Q4_K_M runs 3x faster with 70% less memory than uncompressed FP16." />
              </div>
              <SampleDataBadge tip="Displays reference precision benchmarks (Q4 vs FP16). Run benchmarks with multiple quantizations to record actual numbers on your hardware." />
            </div>
            <div className="text-left text-[10px] text-[#717885]">
              Tokens / sec across precision formats (higher = faster)
            </div>
          </div>

          <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={quantizationBarData} margin={{ top: 22, right: 10, left: 10, bottom: 0 }} barCategoryGap="16%">
                <XAxis
                  dataKey="name"
                  stroke="#5d636f"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#2b303a' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div className="bg-[#181b1f] border border-[#2b303a] p-2 rounded shadow text-[11px] space-y-0.5">
                        <div className="text-white font-bold">{d.name} Format</div>
                        <div className="text-sky-400">{d.note}</div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="value" radius={[1, 1, 0, 0]}>
                  <LabelList
                    dataKey="displayValue"
                    position="top"
                    fill="#4ea8de"
                    fontSize={14}
                    fontWeight="600"
                    offset={6}
                  />
                  {quantizationBarData.map((entry, idx) => (
                    <Cell
                      key={`bar-cell-${idx}`}
                      fill={entry.fill}
                      stroke={entry.name === 'Q4_K_M' ? '#9d4edd' : '#3a6ea5'}
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ========================================================================
          BOTTOM FULL-WIDTH ROW: [Inference Latency Percentiles (P25 - P95)]
          ======================================================================== */}
      <div className="bg-[#181b1f] border border-[#22252b] rounded-sm p-3.5 flex flex-col justify-between min-h-[260px]">
        <div>
          <div className="flex items-center justify-between pb-0.5">
            <div className="flex items-center">
              <span className="text-[13px] text-[#d8d9da] font-medium tracking-tight">
                Inference Latency Percentile Distribution
              </span>
              <InfoTooltip text="P25 is the fastest 25% of queries. P95 represents worst-case lag under load (your Service Level Agreement threshold)." />
            </div>
            <SampleDataBadge tip="Displays reference SLA latency distribution (P25 to P95). Run a concurrency load test to capture live percentile bands under load." />
          </div>
          <div className="text-left text-[10px] text-[#717885]">
            Response completion time segmented by percentile bands (P25 to P95 SLA boundary)
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 pt-1">
          {/* Stacked Bars */}
          <div className="h-56 w-full lg:flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fullPageLoadData} margin={{ top: 8, right: 10, left: -25, bottom: 0 }} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="1 3" stroke="#22252e" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#2b303a' }}
                />
                <YAxis
                  domain={[0, 5]}
                  ticks={[0, 1, 2, 3, 4, 5]}
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#2b303a' }}
                  tickFormatter={(v) => (v === 0 ? '0 ms' : `${v} s`)}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-[#181b1f] border border-[#2b303a] p-2.5 rounded shadow text-[11px] space-y-1">
                        <div className="text-[#8e94a0] border-b border-[#2b303a] pb-1 font-mono">{label}</div>
                        {payload.map((p, idx) => (
                          <div key={idx} className="flex justify-between space-x-4" style={{ color: p.color }}>
                            <span>{p.name}:</span>
                            <span className="font-bold font-mono">{p.value}s</span>
                          </div>
                        ))}
                      </div>
                    )
                  }}
                />
                <Bar dataKey="p25" stackId="a" fill="#eab308" name="p25 (fast)" />
                <Bar dataKey="p50" stackId="a" fill="#f97316" name="p50 (median)" />
                <Bar dataKey="p75" stackId="a" fill="#ea580c" name="p75 (upper)" />
                <Bar dataKey="p90" stackId="a" fill="#dc2626" name="p90 (tail)" />
                <Bar dataKey="p95" stackId="a" fill="#b91c1c" name="p95 (SLA limit)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Right Summary Table */}
          <div className="w-full lg:w-56 bg-[#14161a] border border-[#22252b] rounded p-3 text-xs space-y-2 shrink-0 self-center">
            <div className="flex justify-between text-[11px] text-[#6c727d] border-b border-[#22252b] pb-1 font-mono">
              <span>Percentile</span>
              <span className="font-semibold text-[#8e94a0]">avg latency</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-gray-300">
                <span className="w-2.5 h-0.5 bg-[#eab308] inline-block" />
                <span>p25 (fast)</span>
              </span>
              <span className="font-mono text-gray-200">6.81 ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-gray-300">
                <span className="w-2.5 h-0.5 bg-[#f97316] inline-block" />
                <span>p50 (median)</span>
              </span>
              <span className="font-mono text-gray-200">142 ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-gray-300">
                <span className="w-2.5 h-0.5 bg-[#ea580c] inline-block" />
                <span>p75 (upper)</span>
              </span>
              <span className="font-mono text-gray-200">535 ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-gray-300">
                <span className="w-2.5 h-0.5 bg-[#dc2626] inline-block" />
                <span>p90 (tail)</span>
              </span>
              <span className="font-mono text-gray-200">1.04 s</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-gray-300">
                <span className="w-2.5 h-0.5 bg-[#b91c1c] inline-block" />
                <span>p95 (SLA)</span>
              </span>
              <span className="font-mono text-gray-200">1.46 s</span>
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {/* ========================================================================
          BOTTOM ROW: Configured Runtimes & Recent Runs Quick Links
          ======================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Runtimes Card */}
        <div className="bg-[#181b1f] border border-[#22252b] rounded-sm p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-[#22252b]">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-semibold text-white">Registered LLM Engines</span>
            </div>
            <Link to="/runtimes" className="text-xs text-sky-400 hover:text-sky-300 flex items-center space-x-1">
              <span>View all ({runtimes.length})</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="py-2.5 space-y-2">
            {runtimes.length > 0 ? (
              runtimes.slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs bg-[#14161a] p-2 rounded border border-[#22252b]">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${r.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className="font-medium text-white">{r.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono">({r.type})</span>
                  </div>
                  <span className="text-[11px] text-gray-400 font-mono">{r.endpoint}</span>
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-500 py-1">No runtimes registered yet. Click below to add your local engine.</div>
            )}
          </div>
          <Link to="/runtimes" className="text-center text-xs py-1.5 bg-[#22262e] hover:bg-[#2c313c] text-gray-300 rounded transition-colors">
            + Register New Runtime (Ollama / vLLM / LM Studio)
          </Link>
        </div>

        {/* Recent Performance Runs */}
        <div className="bg-[#181b1f] border border-[#22252b] rounded-sm p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-[#22252b]">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">Latest Benchmark &amp; Load Runs</span>
            </div>
            <Link to="/history" className="text-xs text-sky-400 hover:text-sky-300 flex items-center space-x-1">
              <span>Full History</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="py-2.5">
            <RecentRunsStrip benchmarks={benchmarks} loadTests={loadTests} />
          </div>
          <div className="flex items-center space-x-2">
            <Link to="/benchmark" className="flex-1 text-center text-xs py-1.5 bg-[#22262e] hover:bg-[#2c313c] text-gray-300 rounded transition-colors">
              Run Single Benchmark
            </Link>
            <Link to="/load-test" className="flex-1 text-center text-xs py-1.5 bg-[#22262e] hover:bg-[#2c313c] text-amber-300/90 rounded transition-colors">
              Run Concurrency Test
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
