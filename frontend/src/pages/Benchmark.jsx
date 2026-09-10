import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  PlayCircle, StopCircle, RefreshCw, BarChart2, Download,
  CheckCircle2, AlertTriangle, ArrowRight, Zap, ShieldCheck,
  Cpu, FileText, Plus, Trash2, Layers, TrendingUp, Sparkles, Sliders
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts'
import { useRuntimeStore } from '../stores/runtimeStore'
import { useBenchmarkStore } from '../stores/benchmarkStore'
import { useMonitoringStore } from '../stores/monitoringStore'
import { benchmarksApi, promptTemplatesApi } from '../services/api'
import { SectionHeader, StatusBadge, Spinner, Alert, fmt, fmtMs } from '../components/ui'
import { parseModelName, calcVRAM, evaluateHostFit } from '../utils/gpuSizer'


export function Benchmark() {
  const runtimes = useRuntimeStore((s) => s.runtimes)
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes)
  const fetchModels = useRuntimeStore((s) => s.fetchModels)
  const createRun = useBenchmarkStore((s) => s.createRun)
  const fetchRuns = useBenchmarkStore((s) => s.fetchRuns)
  const activeRun = useBenchmarkStore((s) => s.activeRun)
  const liveProgress = useBenchmarkStore((s) => s.liveProgress)
  const stopRun = useBenchmarkStore((s) => s.stopRun)
  const loading = useBenchmarkStore((s) => s.loading)
  const error = useBenchmarkStore((s) => s.error)
  const currentTelemetry = useMonitoringStore((s) => s.current)

  const [availableModels, setAvailableModels] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)

  // Custom Prompt Templates state
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('builtin-medium')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '' })
  const [templateActionError, setTemplateActionError] = useState(null)

  // Context Scaling presets
  const CONTEXT_PRESETS = [
    { label: 'Standard (100 - 2k)', lengths: [100, 500, 1000, 2000] },
    { label: 'Powers of 2 (256 - 4k)', lengths: [256, 512, 1024, 2048, 4096] },
    { label: 'Deep Context (500 - 4k)', lengths: [500, 1000, 2000, 4000] },
  ]
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0)
  const [customContextLengths, setCustomContextLengths] = useState('100, 500, 1000, 2000')

  // Benchmark Form Config
  const [config, setConfig] = useState({
    runtime_id: '',
    model: '',
    test_type: 'standard', // 'standard' | 'context_scaling'
    scenario: 'medium',
    prompt: '',
    system_prompt: '',
    temperature: 0.7,
    max_tokens: 512,
    num_runs: 3,
    use_streaming: true,
    context_lengths: [100, 500, 1000, 2000],
    template_id: null,
  })

  // Load runs, runtimes, and prompt templates
  useEffect(() => {
    fetchRuns()
    fetchTemplates()
    fetchRuntimes().then(() => {
      if (runtimes.length > 0 && !config.runtime_id) {
        handleRuntimeChange(runtimes[0].id)
      }
    })
  }, [runtimes.length])

  const fetchTemplates = async () => {
    try {
      const data = await promptTemplatesApi.list()
      setTemplates(data || [])
    } catch (err) {
      console.error('Failed to load templates:', err)
    }
  }

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

  const handleTemplateSelect = (templateId) => {
    setSelectedTemplateId(templateId)
    const t = templates.find((item) => item.id === templateId)
    if (!t) return

    setConfig((prev) => ({
      ...prev,
      scenario: t.scenario || 'custom',
      prompt: t.prompt || '',
      system_prompt: t.system_prompt || '',
      temperature: t.temperature ?? prev.temperature,
      max_tokens: t.max_tokens ?? prev.max_tokens,
      template_id: t.id,
    }))
  }

  const handleSaveTemplateSubmit = async (e) => {
    e.preventDefault()
    if (!newTemplate.name.trim() || !config.prompt.trim()) {
      setTemplateActionError('Template name and prompt cannot be empty.')
      return
    }
    setTemplateActionError(null)
    try {
      const created = await promptTemplatesApi.create({
        name: newTemplate.name.trim(),
        description: newTemplate.description.trim() || null,
        scenario: config.scenario || 'custom',
        system_prompt: config.system_prompt.trim() || null,
        prompt: config.prompt.trim(),
        temperature: config.temperature,
        max_tokens: config.max_tokens,
      })
      await fetchTemplates()
      setSelectedTemplateId(created.id)
      setConfig((prev) => ({ ...prev, template_id: created.id }))
      setShowSaveModal(false)
      setNewTemplate({ name: '', description: '' })
    } catch (err) {
      setTemplateActionError(err.message || 'Failed to save template')
    }
  }

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Are you sure you want to delete this custom template?')) return
    try {
      await promptTemplatesApi.delete(id)
      await fetchTemplates()
      if (selectedTemplateId === id) {
        setSelectedTemplateId('builtin-medium')
        handleTemplateSelect('builtin-medium')
      }
    } catch (err) {
      alert(err.message || 'Failed to delete template')
    }
  }

  const handleContextPresetChange = (idx) => {
    setSelectedPresetIdx(idx)
    if (idx < CONTEXT_PRESETS.length) {
      const lengths = CONTEXT_PRESETS[idx].lengths
      setCustomContextLengths(lengths.join(', '))
      setConfig((prev) => ({ ...prev, context_lengths: lengths }))
    }
  }

  const handleCustomContextLengthsChange = (val) => {
    setCustomContextLengths(val)
    const parsed = val
      .split(',')
      .map((x) => parseInt(x.trim()))
      .filter((n) => !isNaN(n) && n > 0)
    if (parsed.length > 0) {
      setConfig((prev) => ({ ...prev, context_lengths: parsed }))
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
    const fit = evaluateHostFit(vram.weightsGb, vram.totalVramGb, currentTelemetry)
    return { parsed, vram, fit }
  }, [config.model, currentTelemetry])

  // Chart data formatting: Iteration Latency & Throughput
  const isContextScalingRun = activeRun?.test_type === 'context_scaling'

  const resultsData = useMemo(() => {
    if (!activeRun?.results) return []
    return activeRun.results.map((r, i) => {
      const label = isContextScalingRun
        ? `${r.prompt_length_target || r.prompt_tokens || (i + 1) * 250} tok`
        : `Run #${r.run_index + 1}`

      return {
        name: label,
        target_tokens: r.prompt_length_target || r.prompt_tokens || 0,
        ttft: r.ttft_ms ? +r.ttft_ms.toFixed(1) : 0,
        latency: +r.total_latency_ms.toFixed(1),
        tok_s: r.generation_tokens_per_second ? +r.generation_tokens_per_second.toFixed(1) : 0,
        prompt_tokens: r.prompt_tokens || 0,
        completion_tokens: r.completion_tokens || 0,
        total_tokens: (r.prompt_tokens || 0) + (r.completion_tokens || 0),
        quality: r.quality_score != null ? Math.round(r.quality_score * 100) : null,
        coherence: r.coherence_score != null ? Math.round(r.coherence_score * 100) : null,
        relevance: r.relevance_score != null ? Math.round(r.relevance_score * 100) : null,
      }
    })
  }, [activeRun, isContextScalingRun])

  // Context Scaling Analytical Degradation Metrics
  const degradationStats = useMemo(() => {
    if (!isContextScalingRun || resultsData.length < 2) return null
    const first = resultsData[0]
    const last = resultsData[resultsData.length - 1]

    const deltaTokens = (last.target_tokens || last.prompt_tokens) - (first.target_tokens || first.prompt_tokens)
    const deltaTtft = last.ttft - first.ttft
    const ttftPer1k = deltaTokens > 0 ? ((deltaTtft / deltaTokens) * 1000).toFixed(1) : '—'

    const speedDropPct = first.tok_s > 0
      ? (((first.tok_s - last.tok_s) / first.tok_s) * 100).toFixed(1)
      : 0

    return {
      minLen: first.target_tokens || first.prompt_tokens,
      maxLen: last.target_tokens || last.prompt_tokens,
      ttftPer1k,
      speedDropPct: Math.max(0, +speedDropPct),
    }
  }, [isContextScalingRun, resultsData])

  // Token Distribution Breakdown Stats
  const tokenBreakdown = useMemo(() => {
    if (!activeRun?.results || activeRun.results.length === 0) return null
    const totalPrompt = activeRun.results.reduce((acc, r) => acc + (r.prompt_tokens || 0), 0)
    const totalComp = activeRun.results.reduce((acc, r) => acc + (r.completion_tokens || 0), 0)
    const total = totalPrompt + totalComp
    if (total === 0) return null
    return {
      totalPrompt,
      totalComp,
      total,
      promptPct: Math.round((totalPrompt / total) * 100),
      compPct: Math.round((totalComp / total) * 100),
      ratio: (totalComp / Math.max(1, totalPrompt)).toFixed(2),
    }
  }, [activeRun])

  const builtinTemplates = templates.filter((t) => t.is_builtin)
  const customTemplates = templates.filter((t) => !t.is_builtin)

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Single-Request Benchmarking & Context Profiling"
        subtitle="Benchmark baseline TTFT, tokens/second throughput, prompt vs completion token breakdown, and context degradation curves."
      />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Configuration */}
        <div className="card space-y-5">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <h2 className="text-base font-bold text-white">Test Configuration</h2>
            <div className="flex items-center space-x-1 text-xs">
              <span className="text-gray-400">Mode:</span>
              <span className="text-sky-400 font-semibold uppercase font-mono">
                {config.test_type === 'standard' ? 'Standard' : 'Context Scaling'}
              </span>
            </div>
          </div>

          {/* Test Type Mode Switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-gray-900/80 rounded-lg border border-gray-800 text-xs font-medium">
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, test_type: 'standard' }))}
              className={`py-1.5 px-2 rounded-md transition-all flex items-center justify-center space-x-1.5 ${
                config.test_type === 'standard'
                  ? 'bg-sky-600 text-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Standard (N-Runs)</span>
            </button>
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, test_type: 'context_scaling' }))}
              className={`py-1.5 px-2 rounded-md transition-all flex items-center justify-center space-x-1.5 ${
                config.test_type === 'context_scaling'
                  ? 'bg-sky-600 text-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Context Scaling</span>
            </button>
          </div>

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

            {/* Prompt Template Selector & Management */}
            {config.test_type === 'standard' ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">Prompt Template / Scenario</label>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowSaveModal(true)}
                        className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center space-x-1"
                        title="Save current prompt as reusable template"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Save Template</span>
                      </button>
                      {customTemplates.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowManageModal(true)}
                          className="text-[11px] text-gray-400 hover:text-gray-200"
                        >
                          Manage ({customTemplates.length})
                        </button>
                      )}
                    </div>
                  </div>

                  <select
                    className="select"
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                  >
                    <optgroup label="Built-in Scenarios">
                      {builtinTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.scenario})
                        </option>
                      ))}
                    </optgroup>
                    {customTemplates.length > 0 && (
                      <optgroup label="My Custom Templates">
                        {customTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            ★ {t.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div>
                  <label className="label">System Prompt (Optional)</label>
                  <input
                    type="text"
                    className="input text-xs font-mono"
                    placeholder="e.g. You are an expert AI assistant..."
                    value={config.system_prompt}
                    onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
                  />
                </div>

                <div>
                  <label className="label">Prompt Content</label>
                  <textarea
                    className="input text-xs font-mono h-24 resize-none"
                    placeholder="Enter prompt text here..."
                    value={config.prompt}
                    onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                    required
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
              </>
            ) : (
              /* Context Length Scaling Configuration */
              <div className="space-y-3 bg-gray-900/60 p-3.5 rounded-xl border border-sky-900/30">
                <div className="flex items-center space-x-2 text-sky-400">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Context Scaling Settings</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Sequentially generates calibrated technical contexts of varying lengths to isolate prompt prefill time (TTFT) and measure KV-cache throughput degradation.
                </p>

                <div>
                  <label className="label text-xs">Scaling Target Presets</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {CONTEXT_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleContextPresetChange(idx)}
                        className={`text-left px-2.5 py-1.5 rounded-lg border text-xs transition-all flex items-center justify-between ${
                          selectedPresetIdx === idx
                            ? 'bg-sky-950/70 border-sky-600 text-sky-300 font-medium'
                            : 'bg-gray-800/60 border-gray-700/50 text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <span>{preset.label}</span>
                        <span className="font-mono text-[10px] text-gray-500">
                          {preset.lengths.join(', ')} tokens
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label text-xs">Custom Target Token Lengths (CSV)</label>
                  <input
                    type="text"
                    className="input text-xs font-mono"
                    value={customContextLengths}
                    onChange={(e) => handleCustomContextLengthsChange(e.target.value)}
                    placeholder="e.g. 100, 500, 1000, 2000"
                  />
                  <span className="text-[10px] text-gray-500 mt-1 block">
                    Will execute {config.context_lengths?.length || 0} sequential runs across these prompt lengths.
                  </span>
                </div>

                <div>
                  <label className="label text-xs">Max Tokens (Per Step Response)</label>
                  <input
                    type="number"
                    min="32"
                    max="1024"
                    className="input"
                    value={config.max_tokens}
                    onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) || 256 })}
                  />
                </div>
              </div>
            )}

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
                  <span>
                    {config.test_type === 'standard'
                      ? `Run Benchmark (${config.num_runs}x)`
                      : `Run Context Scaling (${config.context_lengths?.length || 4} Steps)`}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right 2 Columns: Live Progress & Results */}
        <div className="lg:col-span-2 space-y-6">
          {!activeRun ? (
            <div className="card text-center py-20 text-gray-500 space-y-2">
              <BarChart2 className="w-12 h-12 text-gray-600 mx-auto" />
              <h3 className="font-semibold text-gray-300">Ready to Benchmark</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Configure your model parameters and click "Run Benchmark" or "Context Scaling" to measure TTFT, generation throughput, token distribution, and quality.
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
                      {activeRun.test_type === 'context_scaling' && (
                        <span className="badge-blue text-[10px]">Context Scaling</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {activeRun.test_type === 'context_scaling' ? (
                        <>Context Length Range: <strong className="text-sky-300">{activeRun.context_lengths?.join(' → ') || 'Scaling'} tokens</strong></>
                      ) : (
                        <>Scenario: <strong className="text-gray-200 capitalize">{activeRun.scenario}</strong> • Max tokens: {activeRun.max_tokens} • {activeRun.num_runs} iterations</>
                      )}
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
                      <span>
                        Testing step {liveProgress.completed} of {liveProgress.total}
                        {liveProgress.context_length ? ` (~${liveProgress.context_length} tokens)` : ''}...
                      </span>
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

                {/* Key Benchmark Metrics Grid (8 Cards) */}
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
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Avg Latency</span>
                    <div className="text-xl font-black text-white mt-1">{fmtMs(activeRun.avg_total_latency_ms)}</div>
                    <span className="text-[10px] text-gray-500">End-to-End</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">P95 Latency</span>
                    <div className="text-xl font-black text-amber-400 mt-1">{fmtMs(activeRun.p95_latency_ms)}</div>
                    <span className="text-[10px] text-gray-500">95th Percentile</span>
                  </div>

                  {/* Semantic Output Quality Scoring Card */}
                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <div className="flex items-center justify-center space-x-1 mb-0.5">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Semantic Quality</span>
                    </div>
                    <div className="text-xl font-black text-purple-400 mt-1">
                      {activeRun.avg_quality_score != null
                        ? `${Math.round(activeRun.avg_quality_score * 100)}%`
                        : '—'}
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {activeRun.avg_coherence_score != null && activeRun.avg_relevance_score != null
                        ? `Coh: ${Math.round(activeRun.avg_coherence_score * 100)}% • Rel: ${Math.round(activeRun.avg_relevance_score * 100)}%`
                        : 'Coherence & Relevance'}
                    </span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <div className="flex items-center justify-center space-x-1 mb-0.5">
                      <ShieldCheck className="w-3 h-3 text-teal-400" />
                      <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Quality Pass Rate</span>
                    </div>
                    <div className="text-xl font-black text-teal-400 mt-1">
                      {activeRun.quality_integrity_rate != null
                        ? `${(activeRun.quality_integrity_rate * 100).toFixed(0)}%`
                        : '—'}
                    </div>
                    <span className="text-[10px] text-gray-500">Integrity Pass Rate</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <div className="flex items-center justify-center space-x-1 mb-0.5">
                      <Zap className="w-3 h-3 text-yellow-400" />
                      <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Energy Eff.</span>
                    </div>
                    <div className="text-xl font-black text-yellow-400 mt-1">
                      {activeRun.tokens_per_watt != null ? `${activeRun.tokens_per_watt.toFixed(2)}` : '—'}
                    </div>
                    <span className="text-[10px] text-gray-500">tok/s · W⁻¹</span>
                  </div>

                  <div className="bg-gray-800/60 p-3 rounded-xl border border-gray-700/50 text-center">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">P50 / P99</span>
                    <div className="text-sm font-bold text-gray-200 mt-1 font-mono">
                      {fmtMs(activeRun.p50_latency_ms)} / {fmtMs(activeRun.p99_latency_ms)}
                    </div>
                    <span className="text-[10px] text-gray-500">Median / Tail</span>
                  </div>
                </div>
              </div>

              {/* Context Length Scaling Degradation Curve (Only for Context Scaling runs) */}
              {isContextScalingRun && resultsData.length > 0 && (
                <div className="card space-y-4 border-l-4 border-l-sky-500">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-2">
                    <div>
                      <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                        <TrendingUp className="w-4 h-4 text-sky-400" />
                        <span>Context Length Scaling Degradation Curve</span>
                      </h3>
                      <p className="text-xs text-gray-400">
                        Tracks TTFT prefill latency scaling and generation speed degradation across prompt context window.
                      </p>
                    </div>
                    {degradationStats && (
                      <div className="flex items-center space-x-3 text-xs bg-gray-800/80 px-3 py-1.5 rounded-lg border border-gray-700/60">
                        <div>
                          <span className="text-gray-400">Prefill Scaling: </span>
                          <strong className="text-sky-300">+{degradationStats.ttftPer1k} ms / 1k tok</strong>
                        </div>
                        <span className="text-gray-600">•</span>
                        <div>
                          <span className="text-gray-400">Speed Drop: </span>
                          <strong className={degradationStats.speedDropPct > 20 ? 'text-amber-400' : 'text-emerald-400'}>
                            {degradationStats.speedDropPct}%
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={resultsData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" stroke="#6b7280" fontSize={11} />
                        <YAxis yAxisId="left" stroke="#38bdf8" fontSize={11} label={{ value: 'Latency / TTFT (ms)', angle: -90, position: 'insideLeft', fill: '#38bdf8', fontSize: 10 }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#34d399" fontSize={11} label={{ value: 'Speed (tok/s)', angle: 90, position: 'insideRight', fill: '#34d399', fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem', fontSize: '12px' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Line yAxisId="left" type="monotone" dataKey="ttft" name="TTFT (ms)" stroke="#38bdf8" strokeWidth={2} dot={{ r: 4 }} />
                        <Line yAxisId="left" type="monotone" dataKey="latency" name="Total Latency (ms)" stroke="#818cf8" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 3 }} />
                        <Line yAxisId="right" type="monotone" dataKey="tok_s" name="Generation Speed (tok/s)" stroke="#34d399" strokeWidth={2.5} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Standard Iteration Performance Chart */}
              {!isContextScalingRun && resultsData.length > 0 && (
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

              {/* Token Distribution Chart: Visual Stacked Breakdown */}
              {resultsData.length > 0 && (
                <div className="card space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-2">
                    <div>
                      <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                        <Layers className="w-4 h-4 text-indigo-400" />
                        <span>Token Distribution Breakdown</span>
                      </h3>
                      <p className="text-xs text-gray-400">
                        Prompt input tokens vs. model completion tokens per iteration.
                      </p>
                    </div>

                    {tokenBreakdown && (
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="bg-indigo-950/60 border border-indigo-700/50 text-indigo-300 px-2 py-0.5 rounded">
                          Input: {tokenBreakdown.totalPrompt} ({tokenBreakdown.promptPct}%)
                        </span>
                        <span className="bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 px-2 py-0.5 rounded">
                          Output: {tokenBreakdown.totalComp} ({tokenBreakdown.compPct}%)
                        </span>
                        <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded border border-gray-700">
                          Ratio: 1 : {tokenBreakdown.ratio}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={resultsData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" stroke="#4b5563" fontSize={11} />
                        <YAxis stroke="#4b5563" fontSize={11} label={{ value: 'Tokens', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem', fontSize: '12px' }}
                          formatter={(value, name) => [`${value} tokens`, name]}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="prompt_tokens" stackId="tokens" name="Prompt Tokens (Input)" fill="#6366f1" radius={[0, 0, 4, 4]} />
                        <Bar dataKey="completion_tokens" stackId="tokens" name="Completion Tokens (Output)" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Detailed Results Table with Quality Scores & Token Breakdown */}
              {activeRun.results && activeRun.results.length > 0 && (
                <div className="card space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-white">Execution Breakdown</h3>
                    <div className="flex space-x-2">
                      <a
                        href={benchmarksApi.exportCsv(activeRun.id)}
                        download
                        className="btn-secondary text-xs flex items-center space-x-1 py-1 px-2.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CSV</span>
                      </a>
                      <a
                        href={benchmarksApi.exportJson(activeRun.id)}
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
                          {isContextScalingRun && <th className="p-2.5">Target Len</th>}
                          <th className="p-2.5">TTFT</th>
                          <th className="p-2.5">Total Latency</th>
                          <th className="p-2.5">Tokens (Prompt / Out)</th>
                          <th className="p-2.5">Speed (tok/s)</th>
                          <th className="p-2.5">Semantic Quality</th>
                          <th className="p-2.5 rounded-r-lg">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800 font-mono">
                        {activeRun.results.map((r) => {
                          const qScore = r.quality_score != null ? Math.round(r.quality_score * 100) : null
                          const coh = r.coherence_score != null ? Math.round(r.coherence_score * 100) : null
                          const rel = r.relevance_score != null ? Math.round(r.relevance_score * 100) : null

                          return (
                            <tr key={r.id} className="hover:bg-gray-800/40">
                              <td className="p-2.5 font-bold text-white">#{r.run_index + 1}</td>
                              {isContextScalingRun && (
                                <td className="p-2.5 text-sky-300 font-bold">
                                  {r.prompt_length_target || r.prompt_tokens || '—'} tok
                                </td>
                              )}
                              <td className="p-2.5 text-sky-400">{fmtMs(r.ttft_ms)}</td>
                              <td className="p-2.5">{fmtMs(r.total_latency_ms)}</td>
                              <td className="p-2.5 text-gray-400">
                                <span className="text-indigo-400">{r.prompt_tokens ?? '—'}</span> /{' '}
                                <span className="text-emerald-400">{r.completion_tokens ?? '—'}</span>
                              </td>
                              <td className="p-2.5 text-emerald-400 font-bold">
                                {fmt(r.generation_tokens_per_second)}
                              </td>
                              <td className="p-2.5">
                                {qScore != null ? (
                                  <div className="flex items-center space-x-1.5" title={`Coherence: ${coh}% | Relevance: ${rel}%`}>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        qScore >= 80
                                          ? 'bg-purple-950/80 text-purple-300 border border-purple-800/50'
                                          : qScore >= 60
                                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                                          : 'bg-rose-950/80 text-rose-300 border border-rose-800/50'
                                      }`}
                                    >
                                      {qScore}%
                                    </span>
                                    <span className="text-[10px] text-gray-500 hidden sm:inline">
                                      C:{coh}% R:{rel}%
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-600">—</span>
                                )}
                              </td>
                              <td className="p-2.5">
                                {r.error ? (
                                  <span className="badge-red text-[10px]" title={r.error}>Failed</span>
                                ) : r.quality_valid ? (
                                  <span className="badge-green text-[10px]">Pass</span>
                                ) : (
                                  <span className="badge-amber text-[10px]" title="Quality degraded below threshold">Flagged</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Save Custom Prompt Template */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-md w-full space-y-4 border border-gray-700 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <span>Save Custom Prompt Template</span>
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {templateActionError && <Alert type="error">{templateActionError}</Alert>}

            <form onSubmit={handleSaveTemplateSubmit} className="space-y-3">
              <div>
                <label className="label">Template Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Code Reviewer, Support Assistant"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label">Description (Optional)</label>
                <input
                  type="text"
                  className="input text-xs"
                  placeholder="Brief note on what this prompt evaluates..."
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Prompt Preview</label>
                <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800 text-xs font-mono text-gray-300 max-h-24 overflow-y-auto">
                  {config.prompt || '(Empty prompt)'}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTemplate.name.trim()}
                  className="btn-primary text-xs"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manage Custom Templates */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-lg w-full space-y-4 border border-gray-700 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <span>Manage Custom Prompt Templates</span>
              </h3>
              <button
                onClick={() => setShowManageModal(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {customTemplates.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">
                No custom templates saved yet. You can save any prompt template from the benchmark form.
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {customTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 bg-gray-900/80 rounded-xl border border-gray-800 flex items-start justify-between gap-3 hover:border-gray-700"
                  >
                    <div className="space-y-1 truncate">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-xs">{t.name}</span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {t.scenario} • max {t.max_tokens}t
                        </span>
                      </div>
                      {t.description && (
                        <p className="text-[11px] text-gray-400 truncate">{t.description}</p>
                      )}
                      <p className="text-[10px] font-mono text-gray-500 truncate max-w-xs">
                        "{t.prompt}"
                      </p>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleTemplateSelect(t.id)
                          setShowManageModal(false)
                        }}
                        className="btn-secondary text-[11px] py-1 px-2"
                      >
                        Select
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-950/30 rounded transition-colors"
                        title="Delete template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                className="btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
