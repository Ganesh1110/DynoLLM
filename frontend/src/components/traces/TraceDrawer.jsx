import React, { useState, useEffect } from 'react'
import {
  X,
  Copy,
  Check,
  Clock,
  Zap,
  Database,
  Terminal,
  FileText,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react'
import { parseModelName, calcDetailedKvSpecs } from '../../utils/gpuSizer'
import { fmtBytes } from '../ui'

export default function TraceDrawer({ isOpen, onClose, trace }) {
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedOutput, setCopiedOutput] = useState(false)

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !trace) return null

  const handleCopy = (text, type) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    if (type === 'prompt') {
      setCopiedPrompt(true)
      setTimeout(() => setCopiedPrompt(false), 2000)
    } else {
      setCopiedOutput(true)
      setTimeout(() => setCopiedOutput(false), 2000)
    }
  }

  // Model details
  const parsedModel = parseModelName(trace.model || '')

  // Token & Latency specs
  const promptTokens = trace.prompt_tokens ?? 0
  const completionTokens = trace.completion_tokens ?? 0
  const totalTokens = promptTokens + completionTokens
  const totalLatencyMs = trace.total_latency_ms ?? 0
  const ttftMs = trace.ttft_ms ?? 0
  const decodeMs = Math.max(0, totalLatencyMs - ttftMs)

  // Speeds
  const prefillSpeed =
    ttftMs > 0 && promptTokens > 0
      ? Math.round(promptTokens / (ttftMs / 1000))
      : null

  const decodeSpeed =
    decodeMs > 0 && completionTokens > 0
      ? Math.round(completionTokens / (decodeMs / 1000))
      : null

  const e2eSpeed =
    totalLatencyMs > 0 && completionTokens > 0
      ? +(completionTokens / (totalLatencyMs / 1000)).toFixed(1)
      : null

  // Timeline proportions
  const ttftPct = totalLatencyMs > 0 ? Math.min(100, Math.round((ttftMs / totalLatencyMs) * 100)) : 0
  const decodePct = totalLatencyMs > 0 ? Math.max(0, 100 - ttftPct) : 0

  // Estimated KV at display time
  const kvSpecs = calcDetailedKvSpecs(
    parsedModel.paramSizeB || 8,
    Math.max(1, totalTokens),
    trace.model
  )
  const estimatedKvBytes = (kvSpecs.bytesPerToken || 256) * Math.max(1, totalTokens)

  const isSuccess = !trace.error && trace.finish_reason !== 'error' && trace.finish_reason !== 'abort'

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Dimmed backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-[#14161a] border-l border-[#22252b] text-gray-200 flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-4 border-b border-[#22252b] flex items-center justify-between bg-[#181b1f]">
            <div className="flex items-center space-x-2.5 truncate">
              <Terminal className="w-5 h-5 text-sky-400 shrink-0" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white text-sm">Request Trace</span>
                  <span className="font-mono text-xs text-gray-500">
                    #{trace.id ? trace.id.slice(0, 8) : 'unknown'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase tracking-wider ${
                      trace.source === 'benchmark'
                        ? 'bg-blue-950 text-blue-300 border-blue-800'
                        : trace.source === 'load_test'
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : 'bg-purple-950 text-purple-300 border-purple-800'
                    }`}
                  >
                    {trace.source}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                  {trace.started_at ? new Date(trace.started_at).toLocaleString() : '—'}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono flex items-center space-x-1 border ${
                  isSuccess
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}
              >
                {isSuccess ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Success</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    <span>{trace.finish_reason || 'Failed'}</span>
                  </>
                )}
              </span>

              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#22252b] transition-colors"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Drawer Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Error Banner if any */}
            {trace.error && (
              <div className="p-3 rounded bg-red-950/40 border border-red-500/50 text-red-300 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-red-200">Execution Error</div>
                  <div className="font-mono text-[11px] mt-1 break-all">{trace.error}</div>
                </div>
              </div>
            )}

            {/* Section 1: Timeline Breakdown (TTFT Prefill vs Decode Generation) */}
            <div className="bg-[#181b1f] border border-[#22252b] rounded p-3.5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-white font-semibold">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span>Execution Timeline Breakdown</span>
                </div>
                <span className="font-mono text-gray-400">
                  Total: <strong className="text-white">{totalLatencyMs.toFixed(1)} ms</strong>
                  {e2eSpeed ? ` (${e2eSpeed} tok/s)` : ''}
                </span>
              </div>

              {/* Horizontal Visual Split Bar */}
              <div className="w-full bg-[#22252b] h-3.5 rounded overflow-hidden flex font-mono text-[9px] text-white select-none">
                {ttftPct > 0 && (
                  <div
                    className="bg-sky-600 h-full flex items-center justify-center transition-all overflow-hidden"
                    style={{ width: `${ttftPct}%` }}
                    title={`Prefill / TTFT: ${ttftMs.toFixed(1)} ms (${ttftPct}%)`}
                  >
                    {ttftPct >= 15 ? `${ttftPct}%` : ''}
                  </div>
                )}
                {decodePct > 0 && (
                  <div
                    className="bg-emerald-600 h-full flex items-center justify-center transition-all overflow-hidden"
                    style={{ width: `${decodePct}%` }}
                    title={`Decode / Generation: ${decodeMs.toFixed(1)} ms (${decodePct}%)`}
                  >
                    {decodePct >= 15 ? `${decodePct}%` : ''}
                  </div>
                )}
              </div>

              {/* Phase Stats Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#14161a] border border-[#22252b] rounded p-2.5">
                  <div className="flex items-center justify-between text-[#8e94a0] text-[10px] font-mono">
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
                      <span>Prefill Phase (TTFT)</span>
                    </span>
                    <span>{ttftPct}%</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-sky-400 mt-1">
                    {ttftMs ? `${ttftMs.toFixed(1)} ms` : '—'}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                    {prefillSpeed ? `${prefillSpeed} prompt tok/s` : 'Prompt ingestion'}
                  </div>
                </div>

                <div className="bg-[#14161a] border border-[#22252b] rounded p-2.5">
                  <div className="flex items-center justify-between text-[#8e94a0] text-[10px] font-mono">
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      <span>Decode Phase (Generation)</span>
                    </span>
                    <span>{decodePct}%</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                    {decodeMs ? `${decodeMs.toFixed(1)} ms` : '—'}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                    {decodeSpeed ? `${decodeSpeed} gen tok/s` : trace.tpot_ms ? `${trace.tpot_ms} ms/tok TPOT` : 'Word generation'}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Input & Model Context */}
            <div className="bg-[#181b1f] border border-[#22252b] rounded p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-white font-semibold">
                  <FileText className="w-4 h-4 text-sky-400" />
                  <span>Input Prompt &amp; Model</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-gray-400">
                    {promptTokens} prompt tokens
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(trace.prompt_text, 'prompt')}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#22252b] hover:bg-[#2b303a] text-gray-300 text-[11px] transition-colors"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Model & Parameters pill strip */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded bg-[#14161a] border border-[#22252b] text-gray-200">
                  Model: <strong className="text-white">{trace.model}</strong>
                </span>
                {parsedModel.paramSizeB && (
                  <span className="px-2 py-0.5 rounded bg-[#14161a] border border-[#22252b] text-sky-400">
                    {parsedModel.family} {parsedModel.paramSizeB}B
                  </span>
                )}
                {trace.params && typeof trace.params === 'object' && (
                  <>
                    {trace.params.temperature != null && (
                      <span className="px-2 py-0.5 rounded bg-[#14161a] border border-[#22252b] text-gray-400">
                        temp: {trace.params.temperature}
                      </span>
                    )}
                    {trace.params.max_tokens != null && (
                      <span className="px-2 py-0.5 rounded bg-[#14161a] border border-[#22252b] text-gray-400">
                        max_tokens: {trace.params.max_tokens}
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Prompt Text Block */}
              <div className="bg-[#14161a] border border-[#22252b] rounded p-2.5 max-h-48 overflow-y-auto font-mono text-xs text-gray-300 whitespace-pre-wrap leading-relaxed select-text">
                {trace.prompt_text || (
                  <span className="text-gray-500 italic">
                    Prompt text not stored (privacy setting STORE_PROMPT_CONTENT is disabled)
                  </span>
                )}
              </div>
            </div>

            {/* Section 3: Output Response */}
            <div className="bg-[#181b1f] border border-[#22252b] rounded p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-white font-semibold">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Generated Completion</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-gray-400">
                    {completionTokens} completion tokens
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#22252b] text-gray-300 text-[10px] font-mono uppercase">
                    Finish: {trace.finish_reason || 'stop'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(trace.output_text, 'output')}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#22252b] hover:bg-[#2b303a] text-gray-300 text-[11px] transition-colors"
                  >
                    {copiedOutput ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Output Text Block */}
              <div className="bg-[#14161a] border border-[#22252b] rounded p-2.5 max-h-56 overflow-y-auto font-mono text-xs text-emerald-300/90 whitespace-pre-wrap leading-relaxed select-text">
                {trace.output_text || (
                  <span className="text-gray-500 italic">
                    Response text not stored (privacy setting STORE_PROMPT_CONTENT is disabled)
                  </span>
                )}
              </div>
            </div>

            {/* Section 4: Memory & KV Cache Footprint */}
            <div className="bg-[#181b1f] border border-[#22252b] rounded p-3.5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-white font-semibold">
                  <Database className="w-4 h-4 text-purple-400" />
                  <span>Memory &amp; KV Cache Footprint</span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">
                  Context: {totalTokens} tokens
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Per-Request KV */}
                <div className="bg-[#14161a] border border-[#22252b] rounded p-2.5">
                  <div className="text-[10px] text-gray-500 uppercase font-mono">
                    Estimated Request KV
                  </div>
                  <div className="text-base font-bold font-mono text-purple-400 mt-0.5">
                    {estimatedKvBytes < 1024 * 1024
                      ? `${(estimatedKvBytes / 1024).toFixed(1)} KiB`
                      : `${(estimatedKvBytes / (1024 * 1024)).toFixed(2)} MiB`}
                  </div>
                  <div className="text-[9px] text-gray-500 font-mono mt-0.5">
                    {kvSpecs.layers} layers • {kvSpecs.kvHeads} KV heads • {kvSpecs.bytesPerToken} B/tok
                  </div>
                </div>

                {/* Engine-wide KV Occupancy */}
                <div className="bg-[#14161a] border border-[#22252b] rounded p-2.5">
                  <div className="text-[10px] text-gray-500 uppercase font-mono">
                    Engine KV at Request
                  </div>
                  <div className="text-base font-bold font-mono text-sky-400 mt-0.5">
                    {trace.engine_kv_pct_start != null ? `${trace.engine_kv_pct_start}%` : '—'}
                    {trace.engine_kv_pct_end != null && trace.engine_kv_pct_end !== trace.engine_kv_pct_start ? (
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        → {trace.engine_kv_pct_end}%
                      </span>
                    ) : ''}
                  </div>
                  <div className="text-[9px] text-gray-500 font-mono mt-0.5">
                    sampled from engine poller
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
