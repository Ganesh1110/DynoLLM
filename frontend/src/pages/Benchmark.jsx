import React, { useState, useEffect } from 'react'
import { PlayCircle, StopCircle, RefreshCw, BarChart2, Download, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { useRuntimeStore } from '../stores/runtimeStore'
import { useBenchmarkStore } from '../stores/benchmarkStore'
import { SectionHeader, StatusBadge, Spinner, Alert, fmt, fmtMs } from '../components/ui'

export function Benchmark() {
  const runtimes = useRuntimeStore((s) => s.runtimes)
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes)
  const fetchModels = useRuntimeStore((s) => s.fetchModels)
  const createRun = useBenchmarkStore((s) => s.createRun)
  const activeRun = useBenchmarkStore((s) => s.activeRun)
  const liveProgress = useBenchmarkStore((s) => s.liveProgress)
  const stopRun = useBenchmarkStore((s) => s.stopRun)
  const loading = useBenchmarkStore((s) => s.loading)
  const error = useBenchmarkStore((s) => s.error)

  const [availableModels, setAvailableModels] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)

  // Benchmark Form Config
  const [config, setConfig] = useState({
    runtime_id: '',
    model: '',
    scenario: 'medium',
    prompt: '',
    system_prompt: '',
    temperature: 0.7,
    max_tokens: 512,
    num_runs: 3,
    use_streaming: true,
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

  // Format per-run results for chart
  const resultsData = activeRun?.results?.map((r, i) => ({
    name: `Run #${r.run_index + 1}`,
    ttft: r.ttft_ms ? +(r.ttft_ms).toFixed(1) : 0,
    latency: +(r.total_latency_ms).toFixed(1),
    tok_s: r.generation_tokens_per_second ? +(r.generation_tokens_per_second).toFixed(1) : 0,
  })) || []

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Single-Request Benchmarking"
        subtitle="Measure baseline latency, Time-To-First-Token (TTFT), and generation throughput (tok/s) across scenarios."
      />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Configuration */}
        <div className="card space-y-5">
          <h2 className="text-base font-bold text-white border-b border-gray-800 pb-2">
            Test Configuration
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
                      {m.name} {m.parameter_size ? `(${m.parameter_size})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="e.g. llama3.1:8b or qwen2.5:7b"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  required
                />
              )}
            </div>

            <div>
              <label className="label">Benchmark Scenario</label>
              <select
                className="select"
                value={config.scenario}
                onChange={(e) => setConfig({ ...config, scenario: e.target.value })}
              >
                <option value="short">Short Prompt (~10 tokens)</option>
                <option value="medium">Medium Prompt (~50 tokens)</option>
                <option value="long">Long Technical Prompt (~200 tokens)</option>
                <option value="rag">RAG Context & Q&A</option>
                <option value="conversation">Multi-turn Conversation</option>
                <option value="json">Structured JSON Output</option>
                <option value="streaming">Streaming Story Generation</option>
              </select>
            </div>

            <div>
              <label className="label">Custom Prompt (Optional override)</label>
              <textarea
                className="input text-xs font-mono h-20 resize-none"
                placeholder="Leave blank to use standard scenario prompt..."
                value={config.prompt}
                onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Max Tokens</label>
                <input
                  type="number"
                  min="32"
                  max="4096"
                  className="input"
                  value={config.max_tokens}
                  onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) || 512 })}
                />
              </div>

              <div>
                <label className="label">Number of Runs</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  className="input"
                  value={config.num_runs}
                  onChange={(e) => setConfig({ ...config, num_runs: parseInt(e.target.value) || 3 })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="text-sm font-medium text-gray-300">Measure TTFT (Streaming)</label>
              <input
                type="checkbox"
                checked={config.use_streaming}
                onChange={(e) => setConfig({ ...config, use_streaming: e.target.checked })}
                className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !config.model || !config.runtime_id}
              className="btn-primary w-full flex items-center justify-center space-x-2 py-2.5 mt-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Executing Benchmark...</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  <span>Run Benchmark ({config.num_runs}x)</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right 2 Columns: Live Progress & Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active / Latest Benchmark Overview Card */}
          {!activeRun ? (
            <div className="card text-center py-20 text-gray-500 space-y-2">
              <BarChart2 className="w-12 h-12 text-gray-600 mx-auto" />
              <h3 className="font-semibold text-gray-300">Ready to Benchmark</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Configure your model parameters and click "Run Benchmark" to measure TTFT, latency, and tokens/sec.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header metrics summary */}
              <div className="card space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-lg font-mono">{activeRun.model}</span>
                      <StatusBadge status={activeRun.status} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Scenario: <strong className="text-gray-200 capitalize">{activeRun.scenario}</strong> • Max tokens: {activeRun.max_tokens} • {activeRun.num_runs} iterations
                    </p>
                  </div>

                  {activeRun.status === 'running' && (
                    <button
                      onClick={() => stopRun(activeRun.id)}
                      className="btn-danger text-xs flex items-center space-x-1"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      <span>Stop</span>
                    </button>
                  )}
                </div>

                {/* Progress bar if running */}
                {liveProgress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-sky-400 font-medium">
                      <span>Testing run {liveProgress.completed} of {liveProgress.total}...</span>
                      <span>{Math.round((liveProgress.completed / liveProgress.total) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 transition-all duration-300"
                        style={{ width: `${(liveProgress.completed / liveProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Key Benchmark Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Avg TTFT</span>
                    <div className="text-xl font-black text-sky-400 mt-1">{fmtMs(activeRun.avg_ttft_ms)}</div>
                    <span className="text-[10px] text-gray-500">First Token Latency</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Generation Speed</span>
                    <div className="text-xl font-black text-emerald-400 mt-1">{fmt(activeRun.avg_generation_tokens_per_second)}</div>
                    <span className="text-[10px] text-gray-500">Tokens / Second</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Avg Total Latency</span>
                    <div className="text-xl font-black text-white mt-1">{fmtMs(activeRun.avg_total_latency_ms)}</div>
                    <span className="text-[10px] text-gray-500">End-to-End</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">P95 Latency</span>
                    <div className="text-xl font-black text-amber-400 mt-1">{fmtMs(activeRun.p95_latency_ms)}</div>
                    <span className="text-[10px] text-gray-500">95th Percentile</span>
                  </div>
                </div>
              </div>

              {/* Per-Run Chart */}
              {resultsData.length > 0 && (
                <div className="card space-y-3">
                  <h3 className="font-bold text-sm text-white">Latency & Throughput per Iteration</h3>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={resultsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" stroke="#4b5563" fontSize={11} />
                        <YAxis stroke="#4b5563" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="ttft" name="TTFT (ms)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="latency" name="Total Latency (ms)" fill="#818cf8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="tok_s" name="Speed (tok/s)" fill="#34d399" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Detailed Results Table */}
              {activeRun.results && activeRun.results.length > 0 && (
                <div className="card space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-white">Execution Breakdown</h3>
                    <div className="flex space-x-2">
                      <a
                        href={`http://localhost:8000/api/export/benchmarks/${activeRun.id}/csv`}
                        download
                        className="btn-secondary text-xs flex items-center space-x-1 py-1 px-2.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CSV</span>
                      </a>
                      <a
                        href={`http://localhost:8000/api/export/benchmarks/${activeRun.id}/json`}
                        download
                        className="btn-secondary text-xs flex items-center space-x-1 py-1 px-2.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>JSON</span>
                      </a>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-300">
                      <thead className="bg-gray-800/80 text-gray-400 uppercase font-semibold">
                        <tr>
                          <th className="p-2.5 rounded-l-lg">#</th>
                          <th className="p-2.5">TTFT</th>
                          <th className="p-2.5">Total Latency</th>
                          <th className="p-2.5">Tokens (Prompt / Out)</th>
                          <th className="p-2.5">Speed (tok/s)</th>
                          <th className="p-2.5 rounded-r-lg">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800 font-mono">
                        {activeRun.results.map((r) => (
                          <tr key={r.id} className="hover:bg-gray-800/40">
                            <td className="p-2.5 font-bold text-white">#{r.run_index + 1}</td>
                            <td className="p-2.5 text-sky-400">{fmtMs(r.ttft_ms)}</td>
                            <td className="p-2.5">{fmtMs(r.total_latency_ms)}</td>
                            <td className="p-2.5 text-gray-400">{r.prompt_tokens ?? '—'} / <span className="text-gray-100">{r.completion_tokens ?? '—'}</span></td>
                            <td className="p-2.5 text-emerald-400 font-bold">{fmt(r.generation_tokens_per_second)}</td>
                            <td className="p-2.5">
                              {r.error ? (
                                <span className="badge-red text-[10px]" title={r.error}>Failed</span>
                              ) : (
                                <span className="badge-green text-[10px]">Pass</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
