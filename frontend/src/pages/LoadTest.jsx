import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Zap, StopCircle, RefreshCw, Activity, Users, AlertCircle, Download, CheckCircle, TrendingUp, ArrowRight, DollarSign, Layers, Sparkles, Copy, Check, Columns, Table, ShieldCheck, BarChart3 } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { useRuntimeStore } from '../stores/runtimeStore'
import { useLoadTestStore } from '../stores/loadTestStore'
import { useMonitoringStore } from '../stores/monitoringStore'
import { loadTestsApi } from '../services/api'
import { SectionHeader, StatusBadge, Spinner, Alert, fmt, fmtMs } from '../components/ui'
import { parseModelName, calcVRAM, calcKvCachePerUser, evaluateHostFit } from '../utils/gpuSizer'
import { classifyWorkload, calcTokenCosts, calcHardwareCosts, formatTokenCount, computeBreakdownFromResults } from '../utils/tokenMetrics'


export function LoadTest() {
  const runtimes = useRuntimeStore((s) => s.runtimes)
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes)
  const fetchModels = useRuntimeStore((s) => s.fetchModels)
  const createRun = useLoadTestStore((s) => s.createRun)
  const activeRun = useLoadTestStore((s) => s.activeRun)
  const fetchRuns = useLoadTestStore((s) => s.fetchRuns)
  const liveData = useLoadTestStore((s) => s.liveData)
  const stopRun = useLoadTestStore((s) => s.stopRun)
  const loading = useLoadTestStore((s) => s.loading)
  const error = useLoadTestStore((s) => s.error)
  const currentTelemetry = useMonitoringStore((s) => s.current)

  const [availableModels, setAvailableModels] = useState([])

  const [loadingModels, setLoadingModels] = useState(false)

  // Load Test Config
  const [config, setConfig] = useState({
    runtime_id: '',
    model: '',
    pattern: 'rampup',
    target_users: 10,
    duration_seconds: 60,
    rampup_step_users: 2,
    rampup_step_seconds: 10,
    temperature: 0.7,
    max_tokens: 256,
    request_timeout: 120,
  })

  useEffect(() => {
    fetchRuns()
    fetchRuntimes().then(() => {
      if (runtimes.length > 0 && !config.runtime_id) {
        handleRuntimeChange(runtimes[0].id)
      }
    })
  }, [runtimes.length])

  const handleRuntimeChange = async (rtId) => {
    setConfig((prev) => ({ ...prev, runtime_id: rtId, model: '' }))
    setLoadingModels(true)
    try {
      const models = await fetchModels(rtId)
      setAvailableModels(models || [])
      if (models?.length > 0) {
        setConfig((prev) => ({ ...prev, model: models[0].name }))
      }
    } catch (e) {
      setAvailableModels([])
    } finally {
      setLoadingModels(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!config.runtime_id || !config.model) {
      alert('Please select a runtime and model first.')
      return
    }
    try {
      await createRun(config)
    } catch (err) {
      console.error(err)
    }
  }

  const modelSizing = useMemo(() => {
    if (!config.model) return null
    const parsed = parseModelName(config.model)
    const vram = calcVRAM(parsed.params, parsed.precision, parsed.overhead)
    const kvPerUser = calcKvCachePerUser(parsed.params, 4096, config.model)
    const fit = evaluateHostFit(vram.weightsGb, vram.totalVramGb, currentTelemetry, kvPerUser)
    return { parsed, vram, fit }
  }, [config.model, currentTelemetry])


  const latestLivePoint = liveData[liveData.length - 1]

  // Pricing configuration for real measured cost calculation (Hardware $/hr and Cloud API $/1M tokens)
  const [gpuHourlyCost, setGpuHourlyCost] = useState(0.70)
  const [promptCostRate, setPromptCostRate] = useState(0.50)
  const [completionCostRate, setCompletionCostRate] = useState(1.50)
  const [showCostSettings, setShowCostSettings] = useState(false)

  const activeTokensIn = activeRun?.total_prompt_tokens ?? (latestLivePoint?.total_prompt_tokens || 0)
  const activeTokensOut = activeRun?.total_completion_tokens ?? (latestLivePoint?.total_completion_tokens || 0)
  const activeTokensInSec = activeRun?.tokens_in_per_second ?? (latestLivePoint?.tokens_in_per_second || 0)
  const activeTokensOutSec = activeRun?.tokens_out_per_second ?? (latestLivePoint?.tokens_out_per_second || 0)

  const workloadClassification = useMemo(() => {
    if (!activeRun && !latestLivePoint) return null
    return classifyWorkload(activeTokensIn, activeTokensOut)
  }, [activeRun, latestLivePoint, activeTokensIn, activeTokensOut])

  const measuredCosts = useMemo(() => {
    if (!activeRun && !latestLivePoint) return null
    return calcTokenCosts({
      promptTokens: activeTokensIn,
      completionTokens: activeTokensOut,
      promptCostPerMillion: promptCostRate,
      completionCostPerMillion: completionCostRate,
    })
  }, [activeRun, latestLivePoint, activeTokensIn, activeTokensOut, promptCostRate, completionCostRate])

  const hardwareCosts = useMemo(() => {
    if (!activeRun && !latestLivePoint) return null
    const dur = activeRun?.duration_seconds ?? (liveData.length > 0 ? (liveData[liveData.length - 1].elapsed_seconds || liveData.length) : 60)
    return calcHardwareCosts({
      durationSeconds: dur,
      gpuHourlyCost,
      totalTokens: activeTokensIn + activeTokensOut,
    })
  }, [activeRun, latestLivePoint, liveData, gpuHourlyCost, activeTokensIn, activeTokensOut])

  const [fetchedResults, setFetchedResults] = useState([])
  const [copiedMarkdown, setCopiedMarkdown] = useState(false)
  const [matrixViewMode, setMatrixViewMode] = useState('matrix') // 'matrix' | 'table'

  useEffect(() => {
    if (activeRun?.id && (!activeRun.concurrency_breakdown || activeRun.concurrency_breakdown.length === 0)) {
      loadTestsApi.getResults(activeRun.id).then((res) => {
        if (Array.isArray(res)) setFetchedResults(res)
      }).catch(() => {})
    } else {
      setFetchedResults([])
    }
  }, [activeRun?.id, activeRun?.concurrency_breakdown])

  const concurrencyBreakdown = useMemo(() => {
    if (activeRun?.concurrency_breakdown && activeRun.concurrency_breakdown.length > 0) {
      return activeRun.concurrency_breakdown
    }
    if (fetchedResults.length > 0) {
      return computeBreakdownFromResults(fetchedResults)
    }
    return []
  }, [activeRun?.concurrency_breakdown, fetchedResults])

  const handleCopyMarkdown = () => {
    if (!concurrencyBreakdown || concurrencyBreakdown.length === 0) return

    const tiers = concurrencyBreakdown.map((t) => `${t.concurrency} VU`)
    const header = `| Metric | ${tiers.join(' | ')} |`
    const divider = `| :--- | ${tiers.map(() => ':---:').join(' | ')} |`

    const rows = [
      `| **P95 TTFT (ms)** | ${concurrencyBreakdown.map((t) => t.p95_ttft_ms != null ? `${t.p95_ttft_ms} ms` : '—').join(' | ')} |`,
      `| **Avg TTFT (ms)** | ${concurrencyBreakdown.map((t) => t.avg_ttft_ms != null ? `${t.avg_ttft_ms} ms` : '—').join(' | ')} |`,
      `| **TPOT (ms/tok)** | ${concurrencyBreakdown.map((t) => t.avg_tpot_ms != null ? `${t.avg_tpot_ms} ms` : '—').join(' | ')} |`,
      `| **Single-stream (tok/s)** | ${concurrencyBreakdown.map((t) => t.tokens_per_second != null ? `${t.tokens_per_second} tok/s` : '—').join(' | ')} |`,
      `| **Total Batch (tok/s)** | ${concurrencyBreakdown.map((t) => t.aggregate_tokens_per_sec != null ? `${t.aggregate_tokens_per_sec} tok/s` : '—').join(' | ')} |`,
      `| **P95 Latency (ms)** | ${concurrencyBreakdown.map((t) => t.p95_latency_ms != null ? `${t.p95_latency_ms} ms` : '—').join(' | ')} |`,
      `| **Requests (OK / Fail)** | ${concurrencyBreakdown.map((t) => `${t.successful_requests || 0} / ${t.failed_requests || 0}`).join(' | ')} |`,
      `| **Error Rate** | ${concurrencyBreakdown.map((t) => `${t.error_rate_pct != null ? t.error_rate_pct : 0}%`).join(' | ')} |`,
      `| **SLA Status** | ${concurrencyBreakdown.map((t) => t.sla_status === 'PASS' ? 'PASS' : 'BREACH').join(' | ')} |`,
    ]

    const md = [
      `### Concurrency Degradation Matrix (${activeRun?.model || 'Model'})`,
      header,
      divider,
      ...rows,
      '',
      `*Generated by DynoLLM · Safe Max Concurrency: ${activeRun?.safe_max_concurrency ?? '—'} VU (SLA: Error Rate ≤ 5%, Quality ≥ 95%)*`,
    ].join('\n')

    navigator.clipboard.writeText(md)
    setCopiedMarkdown(true)
    setTimeout(() => setCopiedMarkdown(false), 2000)
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Concurrent Load & Stress Testing"
        subtitle="Simulate multi-user traffic to determine peak throughput, saturation point, and maximum stable concurrency."
      />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Configuration */}
        <div className="card space-y-5">
          <h2 className="text-base font-bold text-white border-b border-gray-800 pb-2">
            Load Test Setup
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Select Runtime</label>
              <select
                className="select"
                value={config.runtime_id}
                onChange={(e) => handleRuntimeChange(e.target.value)}
                required
              >
                <option value="">-- Select LLM Runtime --</option>
                {runtimes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name} ({rt.runtime_type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Target Model</label>
              {availableModels.length > 0 ? (
                <select
                  className="select font-mono"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  required
                >
                  {availableModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="e.g. llama3.1:8b"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  required
                />
              )}

              {/* Inline Smart VRAM Estimation Card */}
              {modelSizing && (
                <div className="mt-2 p-2 rounded-lg bg-gray-800/80 border border-gray-700/60 flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center space-x-1.5 truncate">
                    <span className="text-gray-400">Est. VRAM:</span>
                    <span className="text-emerald-400 font-bold">
                      {modelSizing.vram.totalVramGb.toFixed(1)} GB
                    </span>
                    <span className="text-gray-600">•</span>
                    <span
                      className={
                        modelSizing.fit.color === 'emerald'
                          ? 'text-emerald-400'
                          : modelSizing.fit.color === 'amber'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }
                    >
                      {modelSizing.fit.badge}
                    </span>
                  </div>
                  <Link
                    to="/gpu-sizer"
                    className="text-sky-400 hover:text-sky-300 ml-2 whitespace-nowrap underline underline-offset-2 flex items-center font-sans text-[11px]"
                  >
                    <span>Sizer</span>
                    <ArrowRight className="w-3 h-3 ml-0.5" />
                  </Link>
                </div>
              )}
            </div>

            <div>
              <label className="label">Traffic Pattern</label>

              <select
                className="select"
                value={config.pattern}
                onChange={(e) => setConfig({ ...config, pattern: e.target.value })}
              >
                <option value="rampup">Ramp-up (Gradual increase in steps)</option>
                <option value="constant">Constant Load (Fixed concurrent users)</option>
                <option value="spike">Spike Test (Sudden burst of traffic)</option>
                <option value="stress">Stress Test (Increase until failure)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Target Users</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  className="input"
                  value={config.target_users}
                  onChange={(e) => setConfig({ ...config, target_users: parseInt(e.target.value) || 10 })}
                />
              </div>

              <div>
                <label className="label">Duration (sec)</label>
                <input
                  type="number"
                  min="10"
                  max="3600"
                  className="input"
                  value={config.duration_seconds}
                  onChange={(e) => setConfig({ ...config, duration_seconds: parseInt(e.target.value) || 60 })}
                />
              </div>
            </div>

            {config.pattern === 'rampup' && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
                <div>
                  <label className="label text-[11px]">Step Size (Users)</label>
                  <input
                    type="number"
                    min="1"
                    className="input text-xs"
                    value={config.rampup_step_users}
                    onChange={(e) => setConfig({ ...config, rampup_step_users: parseInt(e.target.value) || 2 })}
                  />
                </div>
                <div>
                  <label className="label text-[11px]">Step Interval (sec)</label>
                  <input
                    type="number"
                    min="5"
                    className="input text-xs"
                    value={config.rampup_step_seconds}
                    onChange={(e) => setConfig({ ...config, rampup_step_seconds: parseInt(e.target.value) || 10 })}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Max Output Tokens</label>
                <input
                  type="number"
                  min="32"
                  max="2048"
                  className="input"
                  value={config.max_tokens}
                  onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) || 256 })}
                />
              </div>

              <div>
                <label className="label">Timeout (sec)</label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  className="input"
                  value={config.request_timeout}
                  onChange={(e) => setConfig({ ...config, request_timeout: parseFloat(e.target.value) || 120 })}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !config.model || !config.runtime_id}
              className="btn-primary w-full flex items-center justify-center space-x-2 py-2.5 mt-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Launching Test...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Start Load Test</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right 2 Columns: Live Charts & Performance Scorecard */}
        <div className="lg:col-span-2 space-y-6">
          {!activeRun ? (
            <div className="card text-center py-20 text-gray-500 space-y-2">
              <Users className="w-12 h-12 text-gray-600 mx-auto" />
              <h3 className="font-semibold text-gray-300">Ready for Load Testing</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Configure your concurrent user target and pattern, then click "Start Load Test" to view real-time latency curves.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header card with status and stop button */}
              <div className="card space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-lg font-mono">{activeRun.model}</span>
                      <StatusBadge status={activeRun.status} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Pattern: <strong className="text-gray-200 capitalize">{activeRun.pattern}</strong> • Target: {activeRun.target_users} users • Duration: {activeRun.duration_seconds}s
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeRun.status === 'running' && (
                      <button
                        onClick={() => stopRun(activeRun.id)}
                        className="btn-danger text-xs flex items-center space-x-1"
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                        <span>Stop Test</span>
                      </button>
                    )}
                    {(activeRun.status === 'completed' || activeRun.status === 'stopped') && (
                      <>
                        <a
                          href={loadTestsApi.exportCsv(activeRun.id)}
                          download
                          className="btn-secondary text-xs flex items-center space-x-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export CSV</span>
                        </a>
                        <a
                          href={loadTestsApi.exportJsonl(activeRun.id)}
                          download
                          className="btn-secondary text-xs flex items-center space-x-1"
                          title="Stream raw newline-delimited JSON for pandas or notebooks"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export JSONL</span>
                        </a>
                        <Link
                          to={`/vllm-optimizer?from=loadtest&model=${encodeURIComponent(activeRun.model)}&promptTokens=${activeRun.avg_prompt_tokens ? Math.round(activeRun.avg_prompt_tokens) : ''}&completionTokens=${activeRun.avg_completion_tokens ? Math.round(activeRun.avg_completion_tokens) : ''}&concurrency=${activeRun.safe_max_concurrency || activeRun.max_concurrent_users_reached || ''}`}
                          className="btn-primary text-xs flex items-center space-x-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 border-none shadow-md shadow-sky-900/20"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>Wire to Optimizer →</span>
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                {/* Abort Reason / Failure Alert Banner */}
                {(activeRun.abort_reason || (activeRun.status === 'failed' && activeRun.error)) && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-200 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-red-300 font-semibold block">Execution Alert:</strong>
                      <span>{activeRun.abort_reason || activeRun.error}</span>
                    </div>
                  </div>
                )}

                {/* Scorecard Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Concurrent Users</span>
                    <div className="text-2xl font-black text-sky-400 mt-1">
                      {latestLivePoint?.concurrent_users ?? activeRun.max_concurrent_users_reached ?? activeRun.target_users}
                    </div>
                    <span className="text-[10px] text-gray-500">Virtual Clients</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Total Requests</span>
                    <div className="text-2xl font-black text-white mt-1">
                      {latestLivePoint?.total_requests ?? activeRun.total_requests ?? 0}
                    </div>
                    <span className="text-[10px] text-emerald-400">
                      {latestLivePoint?.successful_requests ?? activeRun.successful_requests ?? 0} OK / {latestLivePoint?.failed_requests ?? activeRun.failed_requests ?? 0} Fail
                    </span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">P95 Latency</span>
                    <div className="text-2xl font-black text-amber-400 mt-1">
                      {fmtMs(latestLivePoint?.p95_latency_ms ?? activeRun.p95_latency_ms)}
                    </div>
                    <span className="text-[10px] text-gray-500">P50: {fmtMs(activeRun.p50_latency_ms)}</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Throughput (RPS)</span>
                    <div className="text-2xl font-black text-emerald-400 mt-1">
                      {fmt(activeRun.requests_per_second ?? latestLivePoint?.requests_per_second, 2)}
                    </div>
                    <span className="text-[10px] text-gray-500">Req / Second</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Generation Speed</span>
                    <div className="text-2xl font-black text-emerald-400 mt-1">
                      {fmt(activeRun.avg_generation_tokens_per_second)}
                    </div>
                    <span className="text-[10px] text-gray-500">Tokens / Second</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-indigo-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-indigo-300 font-semibold">Tokens (In / Out)</span>
                    <div className="text-xl font-black text-white mt-1">
                      <span className="text-indigo-400">{formatTokenCount(activeTokensIn)}</span>
                      <span className="text-gray-500 text-sm font-normal"> / </span>
                      <span className="text-emerald-400">{formatTokenCount(activeTokensOut)}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">Total Tokens</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-indigo-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-indigo-300 font-semibold">Token Rates (In/Out)</span>
                    <div className="text-base font-bold text-white mt-1 font-mono">
                      <span className="text-indigo-400">{fmt(activeTokensInSec)}</span>
                      <span className="text-gray-500 text-xs font-normal"> / </span>
                      <span className="text-emerald-400">{fmt(activeTokensOutSec)}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">tok/s (In · Out)</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Energy Eff.</span>
                    <div className="text-2xl font-black text-yellow-400 mt-1">
                      {activeRun.tokens_per_watt != null ? `${activeRun.tokens_per_watt.toFixed(2)}` : '—'}
                    </div>
                    <span className="text-[10px] text-gray-500">tok/s · W⁻¹</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Quality Rate</span>
                    <div className="text-2xl font-black text-teal-400 mt-1">
                      {activeRun.quality_integrity_rate != null ? `${(activeRun.quality_integrity_rate * 100).toFixed(0)}%` : '—'}
                    </div>
                    <span className="text-[10px] text-gray-500">Passing Responses</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-emerald-500/30 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">Safe Concurrency</span>
                    <div className="text-2xl font-black text-emerald-400 mt-1">
                      {activeRun.safe_max_concurrency != null ? `${activeRun.safe_max_concurrency} VU` : 'Measuring...'}
                    </div>
                    <span className="text-[10px] text-gray-500">SLA &le;5% Err</span>
                  </div>
                </div>

                {/* Token Traffic Profiler & Measured Cost Card */}
                {workloadClassification && (
                  <div className="p-4 rounded-xl bg-gray-900/90 border border-gray-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800/60 pb-2.5">
                      <div className="flex items-center space-x-2">
                        <Layers className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-bold text-gray-200">Workload Regime & Economic Profile</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            workloadClassification.color === 'indigo'
                              ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                              : workloadClassification.color === 'emerald'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                          }`}
                        >
                          {workloadClassification.badge}
                        </span>
                      </div>

                      <div className="flex items-center space-x-3 text-xs">
                        <button
                          type="button"
                          onClick={() => setShowCostSettings((s) => !s)}
                          className="text-gray-400 hover:text-gray-200 flex items-center space-x-1 font-mono text-[11px]"
                        >
                          <DollarSign className="w-3.5 h-3.5 text-rose-400" />
                          <span>Pricing Rates</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                      <div className="lg:col-span-1 space-y-1.5">
                        <p className="text-gray-300 leading-relaxed text-[11px]">
                          {workloadClassification.recommendation}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400 font-mono pt-1">
                          <span>
                            Avg Prompt: <strong className="text-indigo-300">{activeRun.avg_prompt_tokens ? Math.round(activeRun.avg_prompt_tokens) : '—'} tok</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Avg Output: <strong className="text-emerald-300">{activeRun.avg_completion_tokens ? Math.round(activeRun.avg_completion_tokens) : '—'} tok</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Prefill Ratio: <strong className="text-white">{workloadClassification.prefillPercent}%</strong>
                          </span>
                        </div>
                      </div>

                      {/* Dual Cost Model Cards: Self-Hosted GPU vs Cloud API Equivalent */}
                      <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Self-Hosted Hardware Cost Card */}
                        <div className="bg-gray-950/70 p-2.5 rounded-lg border border-sky-500/30 font-mono space-y-1">
                          <div className="flex justify-between items-center text-[10px] text-sky-400 font-sans font-semibold uppercase tracking-wider">
                            <span>Self-Hosted GPU Cost</span>
                            <span className="text-gray-400 font-mono font-normal">@ ${gpuHourlyCost.toFixed(2)}/hr</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] pt-0.5">
                            <span className="text-gray-400">Run Hardware Cost:</span>
                            <span className="text-sky-300 font-bold">${hardwareCosts?.runCost?.toFixed(4) ?? '0.0000'}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-gray-400">
                            <span>Hardware Rate:</span>
                            <span className="text-sky-200 font-semibold">${hardwareCosts?.costPerMillion?.toFixed(2) ?? '0.00'} / 1M tok</span>
                          </div>
                          <div className="text-[10px] text-gray-500 pt-0.5 border-t border-gray-800 font-sans">
                            {hardwareCosts?.costPerMillion > 0 && measuredCosts?.effectiveCostPerMillion > 0 ? (
                              hardwareCosts.costPerMillion < measuredCosts.effectiveCostPerMillion ? (
                                <span className="text-emerald-400 font-medium">
                                  ✓ Saves {Math.round((1 - hardwareCosts.costPerMillion / measuredCosts.effectiveCostPerMillion) * 100)}% vs Cloud API
                                </span>
                              ) : (
                                <span className="text-amber-400 font-medium">
                                  ⚠ Under-utilized vs API: boost batching
                                </span>
                              )
                            ) : (
                              <span>Amortized across {hardwareCosts?.durationSeconds ?? 60}s run</span>
                            )}
                          </div>
                        </div>

                        {/* Cloud API Reference Card */}
                        <div className="bg-gray-950/70 p-2.5 rounded-lg border border-gray-800 font-mono space-y-1">
                          <div className="flex justify-between items-center text-[10px] text-emerald-400 font-sans font-semibold uppercase tracking-wider">
                            <span>Cloud API Reference</span>
                            <span className="text-gray-400 font-mono font-normal">${promptCostRate.toFixed(2)} / ${completionCostRate.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] pt-0.5">
                            <span className="text-gray-400">Commercial API Bill:</span>
                            <span className="text-emerald-400 font-bold">${measuredCosts?.totalCost?.toFixed(4) ?? '0.0000'}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-gray-400">
                            <span>API Effective Rate:</span>
                            <span className="text-gray-300">${measuredCosts?.effectiveCostPerMillion?.toFixed(2) ?? '0.00'} / 1M tok</span>
                          </div>
                          <div className="text-[10px] text-gray-500 pt-0.5 border-t border-gray-800 font-sans">
                            Reference token pricing equivalent
                          </div>
                        </div>
                      </div>
                    </div>

                    {showCostSettings && (
                      <div className="mt-2 pt-2 border-t border-gray-800 flex flex-wrap items-center gap-4 text-xs font-mono bg-gray-950/40 p-2.5 rounded-lg">
                        <span className="text-gray-400 font-sans font-medium">Economics Parameters:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sky-400">GPU $/hr:</span>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            className="input text-xs py-0.5 px-1.5 w-16 text-right font-mono"
                            value={gpuHourlyCost}
                            onChange={(e) => setGpuHourlyCost(parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-400">API In $/1M:</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            className="input text-xs py-0.5 px-1.5 w-16 text-right font-mono"
                            value={promptCostRate}
                            onChange={(e) => setPromptCostRate(parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-400">API Out $/1M:</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            className="input text-xs py-0.5 px-1.5 w-16 text-right font-mono"
                            value={completionCostRate}
                            onChange={(e) => setCompletionCostRate(parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tiered Concurrency Degradation Matrix */}
              {concurrencyBreakdown && concurrencyBreakdown.length > 0 && (
                <div className="card space-y-3 bg-gray-900/90 border border-gray-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800/80 pb-3">
                    <div className="flex items-center space-x-2">
                      <BarChart3 className="w-4 h-4 text-sky-400" />
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-bold text-sm text-white">Tiered Concurrency Degradation Matrix</h3>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/30">
                            {concurrencyBreakdown.length} Concurrency Tiers
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Empirical TTFT, TPOT, and throughput curves across concurrent load levels.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 self-start sm:self-auto">
                      {/* View Mode Toggle */}
                      <div className="flex items-center bg-gray-950 p-0.5 rounded-lg border border-gray-800">
                        <button
                          type="button"
                          onClick={() => setMatrixViewMode('matrix')}
                          className={`px-2 py-1 rounded text-[11px] font-medium flex items-center space-x-1 transition-colors ${
                            matrixViewMode === 'matrix'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold'
                              : 'text-gray-400 hover:text-white'
                          }`}
                          title="Matrix layout with concurrency tiers across columns"
                        >
                          <Columns className="w-3.5 h-3.5" />
                          <span>Matrix View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMatrixViewMode('table')}
                          className={`px-2 py-1 rounded text-[11px] font-medium flex items-center space-x-1 transition-colors ${
                            matrixViewMode === 'table'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold'
                              : 'text-gray-400 hover:text-white'
                          }`}
                          title="Tabular layout with concurrency tiers as rows"
                        >
                          <Table className="w-3.5 h-3.5" />
                          <span>Data Grid</span>
                        </button>
                      </div>

                      {/* Copy Table as Markdown */}
                      <button
                        type="button"
                        onClick={handleCopyMarkdown}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 flex items-center space-x-1 transition-colors shadow-sm"
                        title="Copy table as Markdown for GitHub, Notion, or capacity docs"
                      >
                        {copiedMarkdown ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-gray-400" />
                            <span>Copy Markdown</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {matrixViewMode === 'matrix' ? (
                    /* MATRIX VIEW: Metrics along rows, Concurrency tiers along columns */
                    <div className="overflow-x-auto scrollbar-thin">
                      <table className="w-full text-left text-xs font-mono border-collapse min-w-[540px]">
                        <thead>
                          <tr className="border-b border-gray-800 bg-gray-950/60">
                            <th className="py-2.5 px-3 font-sans font-semibold text-gray-400 w-48 text-[11px] uppercase tracking-wider">
                              Metric \ Tier
                            </th>
                            {concurrencyBreakdown.map((t) => (
                              <th key={t.concurrency} className="py-2.5 px-3 text-center border-l border-gray-800/60 min-w-[100px]">
                                <div className="font-bold text-white text-sm">{t.concurrency} VU</div>
                                <div className="mt-0.5">
                                  {t.sla_status === 'PASS' ? (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      ✓ SLA PASS
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                      ✕ BREACH
                                    </span>
                                  )}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60 text-[11px]">
                          {/* P95 TTFT */}
                          <tr className="hover:bg-gray-800/30 transition-colors">
                            <td className="py-2 px-3 font-sans text-gray-300 font-medium flex items-center justify-between">
                              <span>P95 TTFT</span>
                              <span className="text-[10px] text-gray-500 font-mono">ms</span>
                            </td>
                            {concurrencyBreakdown.map((t) => (
                              <td key={t.concurrency} className="py-2 px-3 text-center border-l border-gray-800/60 font-bold text-amber-300">
                                {t.p95_ttft_ms != null ? `${t.p95_ttft_ms} ms` : '—'}
                              </td>
                            ))}
                          </tr>

                          {/* Avg TTFT */}
                          <tr className="hover:bg-gray-800/30 transition-colors">
                            <td className="py-2 px-3 font-sans text-gray-400 flex items-center justify-between">
                              <span>Avg TTFT</span>
                              <span className="text-[10px] text-gray-500 font-mono">ms</span>
                            </td>
                            {concurrencyBreakdown.map((t) => (
                              <td key={t.concurrency} className="py-2 px-3 text-center border-l border-gray-800/60 text-sky-300">
                                {t.avg_ttft_ms != null ? `${t.avg_ttft_ms} ms` : '—'}
                              </td>
                            ))}
                          </tr>

                          {/* TPOT (Time Per Output Token) */}
                          <tr className="hover:bg-gray-800/30 transition-colors bg-gray-950/20">
                            <td className="py-2 px-3 font-sans text-emerald-400 font-medium flex items-center justify-between">
                              <span>TPOT (Time / Token)</span>
                              <span className="text-[10px] text-gray-500 font-mono">ms/tok</span>
                            </td>
                            {concurrencyBreakdown.map((t) => (
                              <td key={t.concurrency} className="py-2 px-3 text-center border-l border-gray-800/60 font-bold text-emerald-300">
                                {t.avg_tpot_ms != null ? `${t.avg_tpot_ms} ms` : '—'}
                              </td>
                            ))}
                          </tr>

                          {/* Single-stream tok/s */}
                          <tr className="hover:bg-gray-800/30 transition-colors">
                            <td className="py-2 px-3 font-sans text-gray-300 flex items-center justify-between">
                              <span>Single-Stream Speed</span>
                              <span className="text-[10px] text-gray-500 font-mono">tok/s</span>
                            </td>
                            {concurrencyBreakdown.map((t) => (
                              <td key={t.concurrency} className="py-2 px-3 text-center border-l border-gray-800/60 text-gray-200">
                                {t.tokens_per_second != null ? `${t.tokens_per_second}` : '—'}
                              </td>
                            ))}
                          </tr>

                          {/* Total Batch Throughput */}
                          <tr className="hover:bg-gray-800/30 transition-colors bg-gray-950/20">
                            <td className="py-2 px-3 font-sans text-indigo-300 font-medium flex items-center justify-between">
                              <span>Total Batch Throughput</span>
                              <span className="text-[10px] text-gray-500 font-mono">tok/s</span>
                            </td>
                            {concurrencyBreakdown.map((t) => (
                              <td key={t.concurrency} className="py-2 px-3 text-center border-l border-gray-800/60 font-bold text-indigo-300">
                                {t.aggregate_tokens_per_sec != null ? `${t.aggregate_tokens_per_sec}` : '—'}
                              </td>
                            ))}
                          </tr>

                          {/* P95 Total Latency */}
                          <tr className="hover:bg-gray-800/30 transition-colors">
                            <td className="py-2 px-3 font-sans text-gray-400 flex items-center justify-between">
                              <span>P95 Total Latency</span>
                              <span className="text-[10px] text-gray-500 font-mono">ms</span>
                            </td>
                            {concurrencyBreakdown.map((t) => (
                              <td key={t.concurrency} className="py-2 px-3 text-center border-l border-gray-800/60 text-gray-300">
                                {t.p95_latency_ms != null ? `${t.p95_latency_ms} ms` : '—'}
                              </td>
                            ))}
                          </tr>

                          {/* Requests OK / Fail */}
                          <tr className="hover:bg-gray-800/30 transition-colors">
                            <td className="py-2 px-3 font-sans text-gray-400 flex items-center justify-between">
                              <span>Requests (OK / Fail)</span>
                              <span className="text-[10px] text-gray-500 font-mono">count</span>
                            </td>
                            {concurrencyBreakdown.map((t) => (
                              <td key={t.concurrency} className="py-2 px-3 text-center border-l border-gray-800/60 text-gray-400">
                                <span className="text-emerald-400">{t.successful_requests || 0}</span>
                                <span className="text-gray-600"> / </span>
                                <span className={t.failed_requests > 0 ? 'text-rose-400 font-bold' : 'text-gray-500'}>
                                  {t.failed_requests || 0}
                                </span>
                              </td>
                            ))}
                          </tr>

                          {/* Error Rate % */}
                          <tr className="hover:bg-gray-800/30 transition-colors">
                            <td className="py-2 px-3 font-sans text-gray-300 flex items-center justify-between">
                              <span>Error Rate</span>
                              <span className="text-[10px] text-gray-500 font-mono">&le;5% SLA</span>
                            </td>
                            {concurrencyBreakdown.map((t) => (
                              <td
                                key={t.concurrency}
                                className={`py-2 px-3 text-center border-l border-gray-800/60 font-bold ${
                                  t.error_rate_pct > 5.0 ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {t.error_rate_pct != null ? `${t.error_rate_pct}%` : '0.0%'}
                              </td>
                            ))}
                          </tr>

                          {/* Quality Integrity */}
                          <tr className="hover:bg-gray-800/30 transition-colors">
                            <td className="py-2 px-3 font-sans text-gray-400 flex items-center justify-between">
                              <span>Quality Pass Rate</span>
                              <span className="text-[10px] text-gray-500 font-mono">&ge;95%</span>
                            </td>
                            {concurrencyBreakdown.map((t) => (
                              <td key={t.concurrency} className="py-2 px-3 text-center border-l border-gray-800/60 text-teal-300">
                                {t.quality_integrity_rate != null ? `${(t.quality_integrity_rate * 100).toFixed(0)}%` : '100%'}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* DATA GRID VIEW: Standard table rows */
                    <div className="overflow-x-auto scrollbar-thin">
                      <table className="w-full text-left text-xs font-mono border-collapse">
                        <thead>
                          <tr className="border-b border-gray-800 bg-gray-950/60 text-gray-400 text-[10px] uppercase font-sans">
                            <th className="py-2.5 px-3">Tier</th>
                            <th className="py-2.5 px-3">P95 TTFT</th>
                            <th className="py-2.5 px-3">Avg TTFT</th>
                            <th className="py-2.5 px-3">TPOT</th>
                            <th className="py-2.5 px-3">Decode tok/s</th>
                            <th className="py-2.5 px-3">Total Batch</th>
                            <th className="py-2.5 px-3">P95 Latency</th>
                            <th className="py-2.5 px-3">OK / Fail</th>
                            <th className="py-2.5 px-3">Error %</th>
                            <th className="py-2.5 px-3 text-center">SLA Gate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60 text-[11px]">
                          {concurrencyBreakdown.map((t) => (
                            <tr key={t.concurrency} className="hover:bg-gray-800/30 transition-colors">
                              <td className="py-2.5 px-3 font-bold text-white font-sans flex items-center space-x-1.5">
                                <span>{t.concurrency} VU</span>
                                {t.is_safe && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" title="Safe Operating Concurrency" />
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-amber-300">
                                {t.p95_ttft_ms != null ? `${t.p95_ttft_ms} ms` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-sky-300">
                                {t.avg_ttft_ms != null ? `${t.avg_ttft_ms} ms` : '—'}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-emerald-300">
                                {t.avg_tpot_ms != null ? `${t.avg_tpot_ms} ms` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-gray-200">
                                {t.tokens_per_second != null ? `${t.tokens_per_second}` : '—'}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-indigo-300">
                                {t.aggregate_tokens_per_sec != null ? `${t.aggregate_tokens_per_sec} tok/s` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-gray-400">
                                {t.p95_latency_ms != null ? `${t.p95_latency_ms} ms` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-gray-400">
                                <span className="text-emerald-400">{t.successful_requests || 0}</span>
                                <span className="text-gray-600"> / </span>
                                <span className={t.failed_requests > 0 ? 'text-rose-400 font-bold' : 'text-gray-500'}>
                                  {t.failed_requests || 0}
                                </span>
                              </td>
                              <td
                                className={`py-2.5 px-3 font-bold ${
                                  t.error_rate_pct > 5.0 ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {t.error_rate_pct != null ? `${t.error_rate_pct}%` : '0.0%'}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {t.sla_status === 'PASS' ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    ✓ PASS
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                    ✕ BREACH
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Footnote on client measurements vs server Prometheus metrics */}
                  <div className="pt-2 border-t border-gray-800/60 flex items-center justify-between text-[10px] text-gray-500 font-sans">
                    <span>
                      * Monotonic SLA Rule: Enforces &le;5% Error Rate and &ge;95% Quality Integrity. First failing tier sets the safe maximum.
                    </span>
                    <span className="hidden sm:inline text-gray-600">
                      TPOT = 1000 / Decode tok/s
                    </span>
                  </div>
                </div>
              )}

              {/* Real-time Latency & Concurrency Chart */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-white">Live Response Latency (P95 vs Avg)</h3>
                  <div className="flex space-x-3 text-xs">
                    <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span>P95 (ms)</span></span>
                    <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400" /><span>Avg (ms)</span></span>
                  </div>
                </div>

                <div className="h-56 w-full">
                  {liveData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={liveData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="timestamp" stroke="#4b5563" fontSize={10} />
                        <YAxis stroke="#4b5563" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem' }} />
                        <Line type="monotone" dataKey="p95_latency_ms" stroke="#fbbf24" strokeWidth={2} dot={false} name="P95 (ms)" />
                        <Line type="monotone" dataKey="avg_latency_ms" stroke="#38bdf8" strokeWidth={2} dot={false} name="Avg (ms)" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500 text-xs">
                      {activeRun.status === 'running' ? 'Collecting load test telemetry...' : 'Start a load test to view live charts.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Latency Percentiles Breakdown */}
              {(activeRun.status === 'completed' || activeRun.status === 'stopped') && (
                <div className="card space-y-3">
                  <h3 className="font-bold text-sm text-white">Latency Percentile Distribution</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-center">
                    <div className="bg-gray-800/40 p-2.5 rounded-lg border border-gray-700">
                      <span className="text-[10px] text-gray-400 font-sans block">P50 (Median)</span>
                      <span className="text-base font-bold text-white">{fmtMs(activeRun.p50_latency_ms)}</span>
                    </div>
                    <div className="bg-gray-800/40 p-2.5 rounded-lg border border-gray-700">
                      <span className="text-[10px] text-gray-400 font-sans block">P90</span>
                      <span className="text-base font-bold text-white">{fmtMs(activeRun.p90_latency_ms)}</span>
                    </div>
                    <div className="bg-gray-800/40 p-2.5 rounded-lg border border-gray-700">
                      <span className="text-[10px] text-gray-400 font-sans block">P95</span>
                      <span className="text-base font-bold text-amber-400">{fmtMs(activeRun.p95_latency_ms)}</span>
                    </div>
                    <div className="bg-gray-800/40 p-2.5 rounded-lg border border-gray-700">
                      <span className="text-[10px] text-gray-400 font-sans block">P99</span>
                      <span className="text-base font-bold text-red-400">{fmtMs(activeRun.p99_latency_ms)}</span>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
