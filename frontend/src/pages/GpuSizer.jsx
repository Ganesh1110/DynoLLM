import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Cpu,
  Zap,
  Users,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  Server,
  Layers,
  ArrowRight,
  Filter,
  Check,
} from 'lucide-react'
import { SectionHeader } from '../components/ui'
import { useMonitoringStore } from '../stores/monitoringStore'
import { useRuntimeStore } from '../stores/runtimeStore'
import {
  parseModelName,
  calcVRAM,
  calcKvCachePerUser,
  evaluateGpuConcurrency,
  evaluateHostFit,
  GPU_CATALOG,
  MODEL_PRESETS,
  PRECISION_OPTIONS,
  CONTEXT_LENGTH_OPTIONS,
} from '../utils/gpuSizer'

export function GpuSizer() {
  const currentTelemetry = useMonitoringStore((s) => s.current)
  const runtimes = useRuntimeStore((s) => s.runtimes)
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes)
  const fetchModels = useRuntimeStore((s) => s.fetchModels)

  const [connectedModels, setConnectedModels] = useState([])
  const [modelInput, setModelInput] = useState('llama3.1:8b-instruct-q4_K_M')

  // Model Specs
  const [params, setParams] = useState(8)
  const [precision, setPrecision] = useState(0.55)
  const [contextTokens, setContextTokens] = useState(4096)
  const [targetUsers, setTargetUsers] = useState(10)
  const [categoryFilter, setCategoryFilter] = useState('all') // 'all' | 'consumer' | 'apple' | 'cloud'

  // Load connected models from runtimes if available
  useEffect(() => {
    fetchRuntimes().then(async () => {
      const all = []
      for (const rt of runtimes) {
        try {
          const models = await fetchModels(rt.id)
          if (models) {
            models.forEach((m) => all.push({ name: m.name, runtime: rt.name }))
          }
        } catch (e) {
          // ignore
        }
      }
      setConnectedModels(all)
    })
  }, [runtimes.length])

  // Handle Model Input change with auto-detection
  const handleModelInputChange = (name) => {
    setModelInput(name)
    const parsed = parseModelName(name)
    if (parsed.detected) {
      setParams(parsed.params)
      setPrecision(parsed.precision)
    }
  }

  const handleSelectPreset = (preset) => {
    setModelInput(preset.name)
    setParams(preset.params)
    setPrecision(preset.precision)
  }

  // Sizing Calculations
  const weightsGb = useMemo(() => params * precision, [params, precision])
  const kvPerUserGb = useMemo(
    () => calcKvCachePerUser(params, contextTokens, modelInput),
    [params, contextTokens, modelInput]
  )
  const totalKvNeededGb = useMemo(
    () => kvPerUserGb * targetUsers,
    [kvPerUserGb, targetUsers]
  )
  const totalRecommendedVramGb = useMemo(
    () => weightsGb + totalKvNeededGb + 1.5,
    [weightsGb, totalKvNeededGb]
  )
  const vramSummary = useMemo(
    () => calcVRAM(params, precision, 25),
    [params, precision]
  )

  // Host Fit Evaluation
  const hostFit = useMemo(
    () =>
      evaluateHostFit(
        weightsGb,
        vramSummary.totalVramGb,
        currentTelemetry,
        kvPerUserGb
      ),
    [weightsGb, vramSummary.totalVramGb, currentTelemetry, kvPerUserGb]
  )

  // Evaluate All GPUs in Catalog
  const gpuEvaluations = useMemo(() => {
    return GPU_CATALOG.map((gpu) =>
      evaluateGpuConcurrency(gpu, weightsGb, kvPerUserGb)
    )
  }, [weightsGb, kvPerUserGb])

  // Filtered GPUs
  const filteredGpuEvaluations = useMemo(() => {
    if (categoryFilter === 'all') return gpuEvaluations
    if (categoryFilter === 'consumer') {
      return gpuEvaluations.filter(
        (e) =>
          e.gpu.category.includes('Consumer') ||
          e.gpu.category.includes('Workstation')
      )
    }
    if (categoryFilter === 'apple') {
      return gpuEvaluations.filter((e) => e.gpu.category.includes('Apple'))
    }
    if (categoryFilter === 'cloud') {
      return gpuEvaluations.filter((e) => e.gpu.category.includes('Cloud'))
    }
    return gpuEvaluations
  }, [gpuEvaluations, categoryFilter])

  const fmtGB = (n) => `${n.toFixed(1)} GB`

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <SectionHeader
        title="GPU Sizing & Concurrency Sizer"
        subtitle="Discover the exact GPU hardware required for your model and find out how many simultaneous concurrent generations each GPU can sustain."
      />

      {/* Model Name Auto-Parser & Presets Bar */}
      <div className="card space-y-4 border-sky-500/20 bg-gradient-to-r from-gray-900 via-gray-900 to-sky-950/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Target Model Auto-Detector
              </h2>
              <p className="text-xs text-gray-400">
                Type or select any model tag to automatically extract parameter size and quantization format.
              </p>
            </div>
          </div>

          {/* Connected Runtime Models Dropdown */}
          {connectedModels.length > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400 whitespace-nowrap">Local Models:</span>
              <select
                className="select text-xs py-1 px-2.5 max-w-xs"
                onChange={(e) => {
                  if (e.target.value) handleModelInputChange(e.target.value)
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  -- Select Connected Model --
                </option>
                {connectedModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.runtime})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={modelInput}
              onChange={(e) => handleModelInputChange(e.target.value)}
              placeholder="e.g. llama3.1:8b-instruct-q4_K_M, qwen2.5:72b, deepseek-r1:14b..."
              className="input font-mono text-sm py-2.5 pl-3 pr-28 w-full"
            />
            <div className="absolute right-3 top-2.5 text-xs text-sky-400 font-mono font-medium">
              {params}B • {precision * 8}-bit
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
            <span className="text-xs text-gray-500 mr-1 font-medium">Presets ({MODEL_PRESETS.length}):</span>
            {MODEL_PRESETS.map((p) => {
              const isFP16 = p.precision >= 2.0
              const family = p.label.split(' ')[0]
              const tag = `${family} ${p.params}B${isFP16 ? ' (FP16)' : ''}`
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-md border font-mono transition-colors ${
                    modelInput === p.name
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 font-semibold shadow-sm'
                      : 'bg-gray-800/80 text-gray-400 border-gray-700 hover:text-white hover:bg-gray-700'
                  }`}
                  title={p.label}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>

        {/* Live Host Hardware Compatibility & Concurrency Badge */}
        <div
          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            hostFit.color === 'emerald'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : hostFit.color === 'amber'
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-rose-500/10 border-rose-500/30'
          }`}
        >
          <div className="flex items-start sm:items-center space-x-3">
            {hostFit.color === 'emerald' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
            )}
            {hostFit.color === 'amber' && (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            )}
            {hostFit.color === 'rose' && (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
            )}
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-xs uppercase tracking-wider text-white">
                  Your Host Machine:
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    hostFit.color === 'emerald'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : hostFit.color === 'amber'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}
                >
                  {hostFit.badge}
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-1">{hostFit.description}</p>
            </div>
          </div>
          <div className="text-right shrink-0 bg-gray-950/60 p-2.5 rounded-lg border border-gray-800 font-mono">
            <span className="text-[10px] text-gray-400 block font-sans">
              Theoretical Slots
            </span>
            <span className="text-sm font-bold text-sky-400">
              ~{hostFit.maxConcurrentStreams} Slots
            </span>
          </div>
        </div>

        {/* Capacity Estimator vs Empirical Validator Info Banner */}
        <div className="mt-3 p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl flex items-start space-x-3 text-xs text-sky-200">
          <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-white">Capacity Estimator vs. Empirical Validator:</span> Theoretical slots (C_theoretical = floor(M_KV / KV_request)) define hard memory boundaries. Real-world multi-user serving capacity depends on arrival rates and latency targets — validate your production concurrency on the <Link to="/load-test" className="underline font-bold text-sky-300 hover:text-sky-100">Load Test</Link> page.
          </div>
        </div>
      </div>

      {/* Model Spec & Concurrency Target Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card space-y-2">
          <label className="label text-xs">Model Size (Billion Params)</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={params}
            onChange={(e) => setParams(parseFloat(e.target.value) || 0)}
            className="input font-mono text-sm"
          />
          <span className="text-[10px] text-gray-500 block">
            Base parameters before quantization
          </span>
        </div>

        <div className="card space-y-2">
          <label className="label text-xs">Precision / Quantization</label>
          <select
            value={precision}
            onChange={(e) => setPrecision(parseFloat(e.target.value))}
            className="select font-mono text-xs"
          >
            {PRECISION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-gray-500 block">
            Weights footprint: {fmtGB(weightsGb)}
          </span>
        </div>

        <div className="card space-y-2">
          <label className="label text-xs">Context Length (Tokens)</label>
          <select
            value={contextTokens}
            onChange={(e) => setContextTokens(parseInt(e.target.value))}
            className="select font-mono text-xs"
          >
            {CONTEXT_LENGTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-gray-500 block">
            KV Cache: ~{kvPerUserGb.toFixed(2)} GB / stream
          </span>
        </div>

        <div className="card space-y-2 border-sky-500/30 bg-sky-500/5">
          <label className="label text-xs text-sky-300 font-semibold">
            Target Concurrency (Streams)
          </label>
          <input
            type="number"
            min="1"
            max="256"
            value={targetUsers}
            onChange={(e) => setTargetUsers(parseInt(e.target.value) || 1)}
            className="input font-mono text-sm border-sky-500/40"
          />
          <span className="text-[10px] text-sky-400 block font-mono">
            Needs ~{fmtGB(totalRecommendedVramGb)} total VRAM
          </span>
        </div>
      </div>

      {/* Sizing Summary Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
        <div className="bg-gray-900 border border-gray-800 p-3 rounded-xl">
          <span className="text-[10px] font-sans text-gray-400 uppercase block">
            Model Weights Only
          </span>
          <span className="text-xl font-bold text-white mt-0.5 block">
            {fmtGB(weightsGb)}
          </span>
          <span className="text-[10px] text-gray-500 font-sans">
            Static VRAM allocation
          </span>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-3 rounded-xl">
          <span className="text-[10px] font-sans text-gray-400 uppercase block">
            KV Cache / Slot
          </span>
          <span className="text-xl font-bold text-sky-400 mt-0.5 block">
            {kvPerUserGb.toFixed(2)} GB
          </span>
          <span className="text-[10px] text-gray-500 font-sans">
            At {contextTokens / 1024}k token context
          </span>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-3 rounded-xl">
          <span className="text-[10px] font-sans text-gray-400 uppercase block">
            Min Single-Slot Tier
          </span>
          <span className="text-xl font-bold text-emerald-400 mt-0.5 block">
            {vramSummary.minTier} GB
          </span>
          <span className="text-[10px] text-gray-500 font-sans">
            Smallest viable card
          </span>
        </div>

        <div className="bg-gray-900 border border-sky-500/30 bg-sky-500/5 p-3 rounded-xl">
          <span className="text-[10px] font-sans text-sky-400 uppercase font-semibold block">
            VRAM for {targetUsers} Slots
          </span>
          <span className="text-xl font-bold text-sky-400 mt-0.5 block">
            {fmtGB(totalRecommendedVramGb)}
          </span>
          <span className="text-[10px] text-gray-500 font-sans">
            Weights + full KV cache pool
          </span>
        </div>
      </div>

      {/* GPU Hardware Recommendation & Concurrency Comparison Table */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
          <div>
            <h3 className="font-bold text-base text-white flex items-center space-x-2">
              <Server className="w-4 h-4 text-sky-400" />
              <span>GPU Memory Budget & Theoretical Slot Matrix</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Analytical memory capacity (C_theoretical = floor(M_KV / KV_request)) across GPUs for {modelInput}. Real-world serving capacity must be empirically validated via load testing.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center space-x-1 p-1 bg-gray-800/80 rounded-lg border border-gray-700 text-xs">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-sky-500/20 text-sky-300 font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              All GPUs
            </button>
            <button
              onClick={() => setCategoryFilter('consumer')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                categoryFilter === 'consumer'
                  ? 'bg-sky-500/20 text-sky-300 font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Consumer
            </button>
            <button
              onClick={() => setCategoryFilter('apple')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                categoryFilter === 'apple'
                  ? 'bg-sky-500/20 text-sky-300 font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Apple Silicon
            </button>
            <button
              onClick={() => setCategoryFilter('cloud')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                categoryFilter === 'cloud'
                  ? 'bg-sky-500/20 text-sky-300 font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Cloud / Datacenter
            </button>
          </div>
        </div>

        {/* GPU Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredGpuEvaluations.map((item) => {
            const meetsTarget =
              item.fits && item.maxConcurrentStreams >= targetUsers

            return (
              <div
                key={item.gpu.name}
                className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                  !item.fits
                    ? 'bg-gray-900/40 border-gray-800/60 opacity-60'
                    : meetsTarget
                    ? 'bg-gray-900/90 border-emerald-500/30 hover:border-emerald-500/60 shadow-sm'
                    : 'bg-gray-900/90 border-gray-800 hover:border-sky-500/40'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                        {item.gpu.badge}
                      </span>
                      <h4 className="font-bold text-sm text-white mt-1.5">
                        {item.gpu.name}
                      </h4>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-white block">
                        {item.gpu.vramGb} GB VRAM
                      </span>
                      <span
                        className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded ${
                          item.color === 'emerald'
                            ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800'
                            : item.color === 'amber'
                            ? 'text-amber-400 bg-amber-950/60 border border-amber-800'
                            : 'text-rose-400 bg-rose-950/60 border border-rose-800'
                        }`}
                      >
                        {item.badge}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400 line-clamp-2 mb-3">
                    {item.gpu.notes}
                  </p>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-gray-800 font-mono">
                  {/* Concurrency Highlight */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-gray-950 border border-gray-800">
                    <span className="text-xs text-gray-400 font-sans">
                      Theoretical Slots (C_theor):
                    </span>
                    <span
                      className={`text-base font-black ${
                        item.fits ? 'text-sky-400' : 'text-gray-500'
                      }`}
                    >
                      {item.fits
                        ? `~${item.maxConcurrentStreams} Slots`
                        : '0 (OOM)'}
                    </span>
                  </div>

                  {/* Throughput metrics */}
                  {item.fits && (
                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="bg-gray-800/50 p-1.5 rounded border border-gray-800">
                        <span className="text-[10px] text-gray-500 block font-sans">
                          Batch Throughput
                        </span>
                        <span className="font-bold text-white">
                          ~{item.estimatedAggregateTps} tok/s
                        </span>
                      </div>

                      <div className="bg-gray-800/50 p-1.5 rounded border border-gray-800">
                        <span className="text-[10px] text-gray-500 block font-sans">
                          Speed / Slot
                        </span>
                        <span className="font-bold text-emerald-400">
                          ~{item.perUserTps} tok/s
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Target Match Verdict */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-gray-500 text-[11px] font-sans">
                      Target {targetUsers} Slots:
                    </span>
                    {meetsTarget ? (
                      <span className="text-emerald-400 flex items-center space-x-1 font-sans font-medium text-[11px]">
                        <Check className="w-3.5 h-3.5" />
                        <span>Meets Target</span>
                      </span>
                    ) : item.fits ? (
                      <span className="text-amber-400 font-sans font-medium text-[11px]">
                        Up to {item.maxConcurrentStreams} users max
                      </span>
                    ) : (
                      <span className="text-rose-400 font-sans text-[11px]">
                        Cannot fit model
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
