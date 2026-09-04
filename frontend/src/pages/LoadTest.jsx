import React, { useState, useEffect } from 'react'
import { Zap, StopCircle, RefreshCw, Activity, Users, AlertCircle, Download, CheckCircle, TrendingUp } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { useRuntimeStore } from '../stores/runtimeStore'
import { useLoadTestStore } from '../stores/loadTestStore'
import { SectionHeader, StatusBadge, Spinner, Alert, fmt, fmtMs } from '../components/ui'

export function LoadTest() {
  const runtimes = useRuntimeStore((s) => s.runtimes)
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes)
  const fetchModels = useRuntimeStore((s) => s.fetchModels)
  const createRun = useLoadTestStore((s) => s.createRun)
  const activeRun = useLoadTestStore((s) => s.activeRun)
  const liveData = useLoadTestStore((s) => s.liveData)
  const stopRun = useLoadTestStore((s) => s.stopRun)
  const loading = useLoadTestStore((s) => s.loading)
  const error = useLoadTestStore((s) => s.error)

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

  const latestLivePoint = liveData[liveData.length - 1]

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

                  <div className="flex items-center space-x-2">
                    {activeRun.status === 'running' && (
                      <button
                        onClick={() => stopRun(activeRun.id)}
                        className="btn-danger text-xs flex items-center space-x-1"
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                        <span>Stop Test</span>
                      </button>
                    )}
                    {activeRun.status === 'completed' && (
                      <a
                        href={`http://localhost:8000/api/export/load-tests/${activeRun.id}/csv`}
                        download
                        className="btn-secondary text-xs flex items-center space-x-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Scorecard Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-emerald-500/30 text-center col-span-2 sm:col-span-1">
                    <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">Safe Concurrency</span>
                    <div className="text-2xl font-black text-emerald-400 mt-1">
                      {activeRun.safe_max_concurrency != null ? `${activeRun.safe_max_concurrency} VU` : 'Measuring...'}
                    </div>
                    <span className="text-[10px] text-gray-500">SLA &le;5% Err</span>
                  </div>
                </div>
              </div>

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
              {activeRun.status === 'completed' && (
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
