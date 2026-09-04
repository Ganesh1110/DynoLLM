import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Database, HardDrive, Activity, PlayCircle, Zap, Server, CheckCircle2, XCircle } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useMonitoringStore } from '../stores/monitoringStore'
import { useRuntimeStore } from '../stores/runtimeStore'
import { useBenchmarkStore } from '../stores/benchmarkStore'
import { useLoadTestStore } from '../stores/loadTestStore'
import { MetricCard, GaugeBar, StatusBadge, fmt, fmtBytes, fmtMs } from '../components/ui'

export function Dashboard() {
  const current = useMonitoringStore((s) => s.current)
  const history = useMonitoringStore((s) => s.history)
  const runtimes = useRuntimeStore((s) => s.runtimes)
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes)
  const benchmarks = useBenchmarkStore((s) => s.runs)
  const fetchBenchmarks = useBenchmarkStore((s) => s.fetchRuns)
  const loadTests = useLoadTestStore((s) => s.runs)
  const fetchLoadTests = useLoadTestStore((s) => s.fetchRuns)

  const [activeMetric, setActiveMetric] = useState('all') // 'all' | 'cpu' | 'ram' | 'gpu'

  useEffect(() => {
    fetchRuntimes()
    fetchBenchmarks()
    fetchLoadTests()
  }, [])

  // Format monitoring history for charts
  const chartData = history.map((item, idx) => ({
    time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    cpu: item.cpu_percent || 0,
    ram: item.ram_percent || 0,
    gpu: item.gpus?.[0]?.utilization_percent || 0,
    vram: item.gpus?.[0]?.vram_percent || 0,
  }))

  const latestBenchmark = benchmarks[0]
  const latestLoadTest = loadTests[0]

  return (
    <div className="space-y-6">
      {/* Top Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-gray-900 to-sky-950/40 p-6 rounded-2xl border border-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Production Readiness & System Overview</h1>
          <p className="text-gray-400 text-sm mt-1">
            Real-time hardware monitoring, latency profiling, and endurance assessment for local LLM engines.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link to="/benchmark" className="btn-primary flex items-center space-x-2">
            <PlayCircle className="w-4 h-4" />
            <span>New Benchmark</span>
          </Link>
          <Link to="/load-test" className="btn-secondary flex items-center space-x-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>New Load Test</span>
          </Link>
        </div>
      </div>

      {/* Hardware Monitoring Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sky-400">
              <Cpu className="w-5 h-5" />
              <span className="font-semibold text-sm">CPU Load</span>
            </div>
            <span className="text-xs font-mono text-gray-400">
              {current?.cpu_per_core?.length || 0} Cores
            </span>
          </div>
          <div className="text-3xl font-extrabold text-white">
            {fmt(current?.cpu_percent)}%
          </div>
          <GaugeBar
            label="Utilization"
            value={current?.cpu_percent || 0}
            max={100}
            unit="%"
            color="bg-sky-500"
          />
          {current?.cpu_load_avg_1m != null && (
            <div className="text-xs text-gray-500 pt-1 border-t border-gray-800 flex justify-between">
              <span>Load avg (1m / 5m):</span>
              <span className="font-mono text-gray-300">{fmt(current.cpu_load_avg_1m, 2)} / {fmt(current.cpu_load_avg_5m, 2)}</span>
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-emerald-400">
              <Database className="w-5 h-5" />
              <span className="font-semibold text-sm">System RAM</span>
            </div>
            <span className="text-xs font-mono text-gray-400">
              {fmtBytes(current?.ram_total_bytes)}
            </span>
          </div>
          <div className="text-3xl font-extrabold text-white">
            {fmt(current?.ram_percent)}%
          </div>
          <GaugeBar
            label="Memory Used"
            value={current ? (current.ram_used_bytes / (1024 ** 3)) : 0}
            max={current ? +(current.ram_total_bytes / (1024 ** 3)).toFixed(1) : 100}
            unit=" GB"
            color="bg-emerald-500"
          />
          <div className="text-xs text-gray-500 pt-1 border-t border-gray-800 flex justify-between">
            <span>Available RAM:</span>
            <span className="font-mono text-gray-300">{fmtBytes(current?.ram_available_bytes)}</span>
          </div>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-purple-400">
              <Activity className="w-5 h-5" />
              <span className="font-semibold text-sm">GPU Accelerator</span>
            </div>
            <span className="text-xs font-mono text-gray-400">
              {current?.gpu_count > 0 ? `${current.gpu_count} GPU` : 'None / Apple Metal'}
            </span>
          </div>
          <div className="text-3xl font-extrabold text-white">
            {current?.gpu_count > 0 ? `${fmt(current?.gpus?.[0]?.utilization_percent)}%` : 'Active'}
          </div>
          {current?.gpu_count > 0 && current?.gpus?.[0] ? (
            <>
              <GaugeBar
                label="VRAM Used"
                value={current.gpus[0].vram_used_bytes / (1024 ** 3)}
                max={+(current.gpus[0].vram_total_bytes / (1024 ** 3)).toFixed(1)}
                unit=" GB"
                color="bg-purple-500"
              />
              <div className="text-xs text-gray-500 pt-1 border-t border-gray-800 flex justify-between">
                <span>{current.gpus[0].name}</span>
                <span className="font-mono text-gray-300">{current.gpus[0].temperature_celsius ? `${current.gpus[0].temperature_celsius}°C` : ''}</span>
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-400 space-y-1">
              <p>Host: Unified Memory Architecture</p>
              <p className="text-gray-500">LLM execution runs on CPU / Metal shaders.</p>
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-400">
              <HardDrive className="w-5 h-5" />
              <span className="font-semibold text-sm">Disk I/O</span>
            </div>
            <span className="text-xs font-mono text-gray-400">Throughput</span>
          </div>
          <div className="text-3xl font-extrabold text-white">
            {fmt((current?.disk_read_bytes_per_sec || 0) / (1024 * 1024))} <span className="text-sm font-normal text-gray-400">MB/s</span>
          </div>
          <div className="space-y-1 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>Read Rate:</span>
              <span className="font-mono text-gray-200">{fmt((current?.disk_read_bytes_per_sec || 0) / 1024)} KB/s</span>
            </div>
            <div className="flex justify-between">
              <span>Write Rate:</span>
              <span className="font-mono text-gray-200">{fmt((current?.disk_write_bytes_per_sec || 0) / 1024)} KB/s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live System Performance Chart */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>Real-Time Resource Telemetry (60s Window)</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">High-frequency system utilization stream</p>
          </div>

          {/* Metric Selector Toggles & Stat Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveMetric('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                activeMetric === 'all'
                  ? 'bg-gray-700 text-white border border-gray-500 shadow'
                  : 'bg-gray-800/80 text-gray-400 hover:text-gray-200 border border-gray-700'
              }`}
            >
              All Metrics
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric('cpu')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center space-x-1.5 ${
                activeMetric === 'cpu'
                  ? 'bg-sky-600/30 text-sky-300 border border-sky-500'
                  : 'bg-gray-800/80 text-gray-400 hover:text-sky-400 border border-gray-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>CPU ({fmt(current?.cpu_percent)}%)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric('ram')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center space-x-1.5 ${
                activeMetric === 'ram'
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500'
                  : 'bg-gray-800/80 text-gray-400 hover:text-emerald-400 border border-gray-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>RAM ({fmt(current?.ram_percent)}%)</span>
            </button>
            {current?.gpu_count > 0 && (
              <button
                type="button"
                onClick={() => setActiveMetric('gpu')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center space-x-1.5 ${
                  activeMetric === 'gpu'
                    ? 'bg-purple-600/30 text-purple-300 border border-purple-500'
                    : 'bg-gray-800/80 text-gray-400 hover:text-purple-400 border border-gray-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span>GPU ({fmt(current?.gpus?.[0]?.utilization_percent)}%)</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Chart Container */}
        <div className="h-72 w-full pt-2">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="ramGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gpuGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c084fc" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#c084fc" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#334155' }} />
                <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null
                    return (
                      <div className="bg-gray-900/95 border border-gray-700 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs space-y-1.5 min-w-[150px]">
                        <div className="font-mono text-gray-400 font-semibold border-b border-gray-800 pb-1">{label}</div>
                        {payload.map((entry, index) => (
                          <div key={`item-${index}`} className="flex items-center justify-between space-x-3">
                            <span className="flex items-center space-x-1.5" style={{ color: entry.color }}>
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                              <span>{entry.name}:</span>
                            </span>
                            <span className="font-mono font-bold text-white">{Number(entry.value).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    )
                  }}
                />
                {(activeMetric === 'all' || activeMetric === 'cpu') && (
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#cpuGlow)"
                    name="CPU Utilization"
                    isAnimationActive={false}
                  />
                )}
                {(activeMetric === 'all' || activeMetric === 'ram') && (
                  <Area
                    type="monotone"
                    dataKey="ram"
                    stroke="#34d399"
                    strokeWidth={2}
                    fillOpacity={activeMetric === 'ram' ? 1 : 0.6}
                    fill="url(#ramGlow)"
                    name="System RAM"
                    isAnimationActive={false}
                  />
                )}
                {current?.gpu_count > 0 && (activeMetric === 'all' || activeMetric === 'gpu') && (
                  <Area
                    type="monotone"
                    dataKey="gpu"
                    stroke="#c084fc"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#gpuGlow)"
                    name="GPU Compute"
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              <span className="animate-pulse">Streaming real-time telemetry from backend WebSocket...</span>
            </div>
          )}
        </div>
      </div>

      {/* Runtimes and Recent Benchmarks Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configured Runtimes */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Server className="w-5 h-5 text-sky-400" />
              <h2 className="text-lg font-bold text-white">Configured LLM Runtimes</h2>
            </div>
            <Link to="/runtimes" className="text-xs text-sky-400 hover:text-sky-300 font-medium">
              Manage all ({runtimes.length}) →
            </Link>
          </div>

          {runtimes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 space-y-2">
              <p className="text-sm">No LLM runtimes connected yet.</p>
              <Link to="/runtimes" className="btn-secondary text-xs inline-block">
                + Add Ollama or LM Studio
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {runtimes.slice(0, 4).map((rt) => (
                <div key={rt.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/60 border border-gray-700/60">
                  <div>
                    <div className="font-semibold text-sm text-white flex items-center space-x-2">
                      <span>{rt.name}</span>
                      <span className="badge-blue text-[10px]">{rt.runtime_type}</span>
                    </div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{rt.endpoint}</div>
                  </div>
                  <Link to="/benchmark" className="text-xs text-sky-400 hover:text-sky-300 font-medium">
                    Benchmark →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Latest Benchmark & Load Test Cards */}
        <div className="space-y-4">
          {/* Latest Benchmark */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <PlayCircle className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">Latest Benchmark</h2>
              </div>
              {latestBenchmark && <StatusBadge status={latestBenchmark.status} />}
            </div>

            {latestBenchmark ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Model: <strong className="text-white">{latestBenchmark.model}</strong></span>
                  <span>Scenario: <strong className="text-white capitalize">{latestBenchmark.scenario}</strong></span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800">
                  <div className="bg-gray-800/40 p-2 rounded text-center">
                    <div className="text-xs text-gray-500">TTFT</div>
                    <div className="text-sm font-bold text-white">{fmtMs(latestBenchmark.avg_ttft_ms)}</div>
                  </div>
                  <div className="bg-gray-800/40 p-2 rounded text-center">
                    <div className="text-xs text-gray-500">Speed</div>
                    <div className="text-sm font-bold text-emerald-400">{fmt(latestBenchmark.avg_generation_tokens_per_second)} tok/s</div>
                  </div>
                  <div className="bg-gray-800/40 p-2 rounded text-center">
                    <div className="text-xs text-gray-500">P95 Latency</div>
                    <div className="text-sm font-bold text-white">{fmtMs(latestBenchmark.p95_latency_ms)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 py-3">No benchmarks run yet.</p>
            )}
          </div>

          {/* Latest Load Test */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white">Latest Load Test</h2>
              </div>
              {latestLoadTest && <StatusBadge status={latestLoadTest.status} />}
            </div>

            {latestLoadTest ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Model: <strong className="text-white">{latestLoadTest.model}</strong></span>
                  <span>Pattern: <strong className="text-white capitalize">{latestLoadTest.pattern} ({latestLoadTest.target_users} users)</strong></span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800">
                  <div className="bg-gray-800/40 p-2 rounded text-center">
                    <div className="text-xs text-gray-500">Throughput</div>
                    <div className="text-sm font-bold text-white">{fmt(latestLoadTest.requests_per_second, 2)} RPS</div>
                  </div>
                  <div className="bg-gray-800/40 p-2 rounded text-center">
                    <div className="text-xs text-gray-500">Error Rate</div>
                    <div className={`text-sm font-bold ${latestLoadTest.error_rate > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {fmt((latestLoadTest.error_rate || 0) * 100)}%
                    </div>
                  </div>
                  <div className="bg-gray-800/40 p-2 rounded text-center">
                    <div className="text-xs text-gray-500">P95 Latency</div>
                    <div className="text-sm font-bold text-white">{fmtMs(latestLoadTest.p95_latency_ms)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 py-3">No load tests executed yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
