import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  HelpCircle,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sliders,
  TrendingUp,
  Cpu,
  Layers,
  ArrowRight,
  ShieldCheck,
  Info,
} from 'lucide-react'
import { getOverallEvaluation, getRatingBadgeClasses } from '../utils/ratingUtils'

export function TestingGuideModal({
  isOpen,
  onClose,
  initialTab = 'before',
  pageType = 'benchmark', // 'benchmark' | 'loadtest'
  activeRun = null,
  overallEvaluation = null,
}) {
  const [activeTab, setActiveTab] = useState(initialTab)

  const evalResult = useMemo(() => {
    if (overallEvaluation) return overallEvaluation
    if (!activeRun) return null
    return getOverallEvaluation({
      ttftMs: activeRun.avg_ttft_ms,
      speedTokPerSec: activeRun.avg_generation_tokens_per_second,
      tpotMs: activeRun.avg_tpot_ms,
      p95Ms: activeRun.p95_latency_ms,
      avgMs: activeRun.avg_total_latency_ms || activeRun.p50_latency_ms,
      errorRatePct: activeRun.error_rate != null ? activeRun.error_rate * 100 : (
        activeRun.total_requests && activeRun.total_requests > 0
          ? ((activeRun.failed_requests || 0) / activeRun.total_requests) * 100
          : null
      ),
      pageType,
    })
  }, [overallEvaluation, activeRun, pageType])

  const ttftItem = evalResult?.items?.find((i) => i.key === 'ttft')
  const speedItem = evalResult?.items?.find((i) => i.key === 'speed')
  // TPOT is excluded from verdict items[] to avoid double-counting decode signal.
  // We reconstruct a display object from the tpotRating reference field.
  const tpotItem = evalResult?.tpotRating
    ? {
        grade: evalResult.tpotRating.grade,
        display: activeRun?.avg_tpot_ms != null ? `${Math.round(activeRun.avg_tpot_ms)} ms/tok` : null,
        rating: evalResult.tpotRating,
      }
    : null
  const consistencyItem = evalResult?.items?.find((i) => i.key === 'consistency')
  const errorItem = evalResult?.items?.find((i) => i.key === 'errorRate')

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab)
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, initialTab, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-gray-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800/80 flex items-center justify-between bg-gray-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Testing &amp; Rating Guide</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                  {pageType === 'loadtest' ? 'Load & Stress Testing' : 'Single-Request Benchmark'}
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Understand how tests run and evaluate whether your performance numbers are Good, Average, or Bad.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800/80 bg-gray-900/30 px-5 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('before')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-all ${
              activeTab === 'before'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Before Test: How It Works &amp; Setup</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('after')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-all ${
              activeTab === 'after'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>After Test: Rating Guide (Good / Avg / Bad)</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin text-xs leading-relaxed">
          {activeTab === 'before' ? (
            /* TAB 1: BEFORE TEST */
            <div className="space-y-5">
              {/* The Two Phases of LLM Inference */}
              <div className="p-3.5 bg-gray-900/80 border border-gray-800 rounded-xl space-y-2">
                <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>The Two Phases of Generative Inference</span>
                </h3>
                <p className="text-gray-300">
                  Generative models execute inference in two fundamentally distinct compute regimes:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="bg-gray-950 p-3 rounded-lg border border-gray-800/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sky-300">1. Prefill Phase (Prompt)</span>
                      <span className="text-[10px] font-mono text-gray-500">Compute-Bound</span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      All input tokens in your prompt are processed simultaneously through matrix-matrix multiplications. Measures <strong className="text-white">Time-To-First-Token (TTFT)</strong>.
                    </p>
                  </div>
                  <div className="bg-gray-950 p-3 rounded-lg border border-gray-800/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-300">2. Decode Phase (Generation)</span>
                      <span className="text-[10px] font-mono text-gray-500">Memory-Bandwidth Bound</span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Tokens are emitted one-by-one autoregressively. Measures <strong className="text-white">Generation Speed (tok/s)</strong> and <strong className="text-white">Time Per Output Token (TPOT)</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Parameters Breakdown */}
              <div className="space-y-2.5">
                <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  <span>Key Parameters Explained</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                    <span className="font-bold text-sky-300 block mb-0.5">Temperature (0.0 to 1.0)</span>
                    <span className="text-[11px] text-gray-400">
                      Controls sampling randomness. Use <code className="text-sky-200">0</code> (greedy, deterministic) for repeatable benchmark comparisons. Use <code className="text-sky-200">0.7</code> only when evaluating generation quality variation, not latency.
                    </span>
                  </div>
                  <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                    <span className="font-bold text-sky-300 block mb-0.5">Max Tokens</span>
                    <span className="text-[11px] text-gray-400">
                      Ceiling on generation output length. Standard benchmark is 256–512 tokens to test sustained streaming cadence.
                    </span>
                  </div>
                  {pageType === 'loadtest' ? (
                    <>
                      <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                        <span className="font-bold text-indigo-300 block mb-0.5">Traffic Pattern (Ramp-up)</span>
                        <span className="text-[11px] text-gray-400">
                          Increases users in steps (e.g. +5 users every 10s) to discover the saturation "knee" where queuing begins.
                        </span>
                      </div>
                      <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                        <span className="font-bold text-indigo-300 block mb-0.5">Prompt Mix (Short / Medium / Long)</span>
                        <span className="text-[11px] text-gray-400">
                          Mix of prompt lengths simulating realistic production traffic with concurrent short queries and long RAG contexts.
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                        <span className="font-bold text-sky-300 block mb-0.5">Number of Iterations</span>
                        <span className="text-[11px] text-gray-400">
                          More iterations produce more reliable P95 estimates. With only 3–5 runs, P95 is essentially the worst sample — use <strong className="text-white">20+ iterations</strong> for stable tail-latency numbers.
                        </span>
                      </div>
                      <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                        <span className="font-bold text-sky-300 block mb-0.5">Context Scaling Mode</span>
                        <span className="text-[11px] text-gray-400">
                          Sweeps prompt lengths (e.g. 100, 500, 1000, 2000 tokens) to plot how TTFT degrades as context windows grow.
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Pre-Flight Checklist */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1.5">
                <span className="font-bold text-emerald-300 flex items-center space-x-1.5 text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Pre-Flight Checklist Before Starting</span>
                </span>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-emerald-200/80">
                  <li><strong>Run 1 warm-up query</strong> to ensure weights are resident in GPU VRAM and CUDA graphs are initialized.</li>
                  <li><strong>Close competing GPU tasks</strong> (local training, video decoding, or secondary LLM servers).</li>
                  <li><strong>Verify VRAM headroom</strong>: Check the inline VRAM estimation badge to avoid sudden Out-Of-Memory (OOM) aborts.</li>
                </ul>
              </div>
            </div>
          ) : (
            /* TAB 2: AFTER TEST */
            <div className="space-y-5">
              {/* Live Stage Evaluation Verdict Banner */}
              {evalResult ? (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    evalResult.stage === 'good'
                      ? 'bg-emerald-950/25 border-emerald-500/30 text-emerald-200'
                      : evalResult.stage === 'bad'
                      ? 'bg-rose-950/25 border-rose-500/30 text-rose-200'
                      : 'bg-amber-950/25 border-amber-500/30 text-amber-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-800/80 pb-3">
                    <div className="flex items-center space-x-2.5">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          evalResult.stage === 'good'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : evalResult.stage === 'bad'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {evalResult.stage === 'good' ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : evalResult.stage === 'bad' ? (
                          <XCircle className="w-5 h-5" />
                        ) : (
                          <AlertTriangle className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block font-sans">
                          After Testing Diagnosis
                        </span>
                        <div className="flex items-center space-x-2 mt-0.5">
                          <span className="text-sm font-black uppercase tracking-wide text-white">
                            Stage:
                          </span>
                          <span
                            className={`text-xs font-black uppercase px-2 py-0.5 rounded border font-mono ${getRatingBadgeClasses(
                              evalResult.color
                            )}`}
                          >
                            {evalResult.label}
                          </span>
                        </div>
                      </div>
                    </div>
                    {activeRun?.model && (
                      <span className="text-[11px] font-mono text-gray-400 bg-gray-900/80 px-2.5 py-1 rounded-md border border-gray-800 self-start sm:self-auto">
                        {activeRun.model}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-300 leading-relaxed font-sans">
                    {evalResult.summary}
                  </p>

                  <div className="p-2.5 bg-gray-900/70 rounded-lg border border-gray-800/80 flex items-start space-x-2 text-[11px] text-gray-300">
                    <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-sky-300">Stage Guidance:</strong> {evalResult.advice}
                    </span>
                  </div>

                  {/* Verdict logic footnote */}
                  <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-700/60 text-[10px] text-gray-500 leading-relaxed">
                    <strong className="text-gray-400">How the stage is decided:</strong>{' '}
                    Error rate &gt;5% → <span className="text-rose-400">Bad</span> immediately &nbsp;|&nbsp;
                    2+ metrics in Bad tier → <span className="text-rose-400">Bad (Bottleneck)</span> &nbsp;|&nbsp;
                    2+ metrics in Average tier → <span className="text-amber-400">Average</span> &nbsp;|&nbsp;
                    otherwise → <span className="text-emerald-400">Good</span>.{' '}
                    TPOT is shown for reference but not counted separately (it mirrors Generation Speed).
                  </div>

                  {/* Quick Metric Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
                    {evalResult.items.map((item) => (
                      <div key={item.key} className="bg-gray-950/80 p-2.5 rounded-lg border border-gray-800/80 text-center">
                        <span className="text-[10px] text-gray-400 font-sans block">{item.name}</span>
                        <div className="text-xs font-black text-white mt-0.5">{item.display}</div>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border mt-1 inline-block ${getRatingBadgeClasses(
                            item.rating.color
                          )}`}
                        >
                          {item.rating.badge}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-gray-900/40 border border-gray-800/80 rounded-xl text-center text-gray-400 text-xs">
                  <span>💡 <em>No completed test run selected yet. Run a benchmark or load test to see your live stage and placement evaluated here.</em></span>
                </div>
              )}

              <div className="space-y-1">
                <h3 className="font-bold text-sm text-white">Engineering Threshold Matrix</h3>
                <p className="text-gray-400 text-[11px]">
                  Compare your numbers against production standards. Your measured metrics are highlighted below with <span className="text-sky-300 font-bold font-mono">📍 You</span>:
                </p>
              </div>

              {/* Rating Matrix Table */}
              <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950/70">
                <table className="w-full text-left font-mono text-[11px] border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/80 text-gray-400 font-sans text-[10px] uppercase">
                      <th className="py-2.5 px-3">Metric</th>
                      <th className="py-2.5 px-3 text-emerald-400">🟢 Good / Excellent</th>
                      <th className="py-2.5 px-3 text-amber-400">🟡 Average / Acceptable</th>
                      <th className="py-2.5 px-3 text-rose-400">🔴 Bad / Poor</th>
                      <th className="py-2.5 px-3 font-sans">Engineering Meaning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 font-sans">
                    {/* TTFT */}
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-white font-mono">
                        TTFT
                        <span className="text-[10px] block text-gray-500 font-normal font-sans">Time to 1st token</span>
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5 ${ttftItem?.grade === 'good' ? 'ring-2 ring-emerald-500/80 bg-emerald-500/20 rounded' : ''}`}>
                        &lt; 300 ms
                        {ttftItem?.grade === 'good' && (
                          <span className="block text-[9px] font-sans text-emerald-300 font-bold mt-0.5">
                            📍 You: {ttftItem.display}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-amber-300 bg-amber-500/5 ${ttftItem?.grade === 'average' ? 'ring-2 ring-amber-500/80 bg-amber-500/20 rounded' : ''}`}>
                        300 – 800 ms
                        {ttftItem?.grade === 'average' && (
                          <span className="block text-[9px] font-sans text-amber-300 font-bold mt-0.5">
                            📍 You: {ttftItem.display}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5 ${ttftItem?.grade === 'bad' ? 'ring-2 ring-rose-500/80 bg-rose-500/20 rounded' : ''}`}>
                        &gt; 800 ms (1s+)
                        {ttftItem?.grade === 'bad' && (
                          <span className="block text-[9px] font-sans text-rose-300 font-bold mt-0.5">
                            📍 You: {ttftItem.display}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        Prefill delay. Under 300ms feels instant; above 1s feels sluggish. <em className="text-gray-500">These thresholds assume 7–13B models with ~512-token prompts — larger models or longer prompts will always have higher TTFT.</em>
                      </td>
                    </tr>

                    {/* Decode Speed */}
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-white font-mono">
                        Generation Speed
                        <span className="text-[10px] block text-gray-500 font-normal font-sans">Tokens / second</span>
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5 ${speedItem?.grade === 'good' ? 'ring-2 ring-emerald-500/80 bg-emerald-500/20 rounded' : ''}`}>
                        &#x2265; 33 tok/s
                        {speedItem?.grade === 'good' && (
                          <span className="block text-[9px] font-sans text-emerald-300 font-bold mt-0.5">
                            📍 You: {speedItem.display}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-amber-300 bg-amber-500/5 ${speedItem?.grade === 'average' ? 'ring-2 ring-amber-500/80 bg-amber-500/20 rounded' : ''}`}>
                        15 – 33 tok/s
                        {speedItem?.grade === 'average' && (
                          <span className="block text-[9px] font-sans text-amber-300 font-bold mt-0.5">
                            📍 You: {speedItem.display}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5 ${speedItem?.grade === 'bad' ? 'ring-2 ring-rose-500/80 bg-rose-500/20 rounded' : ''}`}>
                        &lt; 15 tok/s
                        {speedItem?.grade === 'bad' && (
                          <span className="block text-[9px] font-sans text-rose-300 font-bold mt-0.5">
                            📍 You: {speedItem.display}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        Human reading speed is ~15–20 words/sec. Above 33 tok/s is ideal for automated agent loops.
                      </td>
                    </tr>

                    {/* TPOT */}
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-white font-mono">
                        TPOT
                        <span className="text-[10px] block text-gray-500 font-normal font-sans">Time / token</span>
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5 ${tpotItem?.grade === 'good' ? 'ring-2 ring-emerald-500/80 bg-emerald-500/20 rounded' : ''}`}>
                        &lt; 30 ms/tok
                        {tpotItem?.grade === 'good' && (
                          <span className="block text-[9px] font-sans text-emerald-300 font-bold mt-0.5">
                            📍 You: {tpotItem.display}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-amber-300 bg-amber-500/5 ${tpotItem?.grade === 'average' ? 'ring-2 ring-amber-500/80 bg-amber-500/20 rounded' : ''}`}>
                        30 – 65 ms/tok
                        {tpotItem?.grade === 'average' && (
                          <span className="block text-[9px] font-sans text-amber-300 font-bold mt-0.5">
                            📍 You: {tpotItem.display}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5 ${tpotItem?.grade === 'bad' ? 'ring-2 ring-rose-500/80 bg-rose-500/20 rounded' : ''}`}>
                        &gt; 65 ms/tok
                        {tpotItem?.grade === 'bad' && (
                          <span className="block text-[9px] font-sans text-rose-300 font-bold mt-0.5">
                            📍 You: {tpotItem.display}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        Inverse of generation speed (1000 / tok/s). Measures smooth, lag-free streaming cadence.
                      </td>
                    </tr>

                    {/* Latency Consistency */}
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-white font-mono">
                        Latency Jitter
                        <span className="text-[10px] block text-gray-500 font-normal font-sans">P95 vs Average</span>
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5 ${consistencyItem?.grade === 'good' ? 'ring-2 ring-emerald-500/80 bg-emerald-500/20 rounded' : ''}`}>
                        P95 &le; 1.5&times; Avg
                        {consistencyItem?.grade === 'good' && (
                          <span className="block text-[9px] font-sans text-emerald-300 font-bold mt-0.5">
                            📍 You: {consistencyItem.display}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-amber-300 bg-amber-500/5 ${consistencyItem?.grade === 'average' ? 'ring-2 ring-amber-500/80 bg-amber-500/20 rounded' : ''}`}>
                        P95 &le; 2.5&times; Avg
                        {consistencyItem?.grade === 'average' && (
                          <span className="block text-[9px] font-sans text-amber-300 font-bold mt-0.5">
                            📍 You: {consistencyItem.display}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5 ${consistencyItem?.grade === 'bad' ? 'ring-2 ring-rose-500/80 bg-rose-500/20 rounded' : ''}`}>
                        P95 &gt; 2.5&times; Avg
                        {consistencyItem?.grade === 'bad' && (
                          <span className="block text-[9px] font-sans text-rose-300 font-bold mt-0.5">
                            📍 You: {consistencyItem.display}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        Measures predictability. Ratios above 2.5&times; indicate severe head-of-line queuing spikes.
                      </td>
                    </tr>

                    {/* Error Rate */}
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-white font-mono">
                        Error Rate
                        <span className="text-[10px] block text-gray-500 font-normal font-sans">Failures / Timeouts</span>
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5 ${errorItem?.grade === 'good' ? 'ring-2 ring-emerald-500/80 bg-emerald-500/20 rounded' : ''}`}>
                        0.0%
                        {errorItem?.grade === 'good' && (
                          <span className="block text-[9px] font-sans text-emerald-300 font-bold mt-0.5">
                            📍 You: {errorItem.display}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-amber-300 bg-amber-500/5 ${errorItem?.grade === 'average' ? 'ring-2 ring-amber-500/80 bg-amber-500/20 rounded' : ''}`}>
                        &le; 5.0%
                        {errorItem?.grade === 'average' && (
                          <span className="block text-[9px] font-sans text-amber-300 font-bold mt-0.5">
                            📍 You: {errorItem.display}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5 ${errorItem?.grade === 'bad' ? 'ring-2 ring-rose-500/80 bg-rose-500/20 rounded' : ''}`}>
                        &gt; 5.0%
                        {errorItem?.grade === 'bad' && (
                          <span className="block text-[9px] font-sans text-rose-300 font-bold mt-0.5">
                            📍 You: {errorItem.display}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        Production SLA gate. Over 5% marks the capacity limit where request concurrency must be capped.
                      </td>
                    </tr>

                    {/* Throughput & Concurrency — load-test only */}
                    {pageType === 'loadtest' && (
                      <>
                        <tr className="hover:bg-gray-800/30 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-white font-mono">
                            Throughput
                            <span className="text-[10px] block text-gray-500 font-normal font-sans">Requests / second</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5">
                            Scales linearly with users
                          </td>
                          <td className="py-2.5 px-3 font-mono text-amber-300 bg-amber-500/5">
                            Plateaus (knee point)
                          </td>
                          <td className="py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5">
                            Drops or flat-lines
                          </td>
                          <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                            At saturation, adding more users yields no extra throughput — only more errors and higher latency.
                          </td>
                        </tr>
                        <tr className="hover:bg-gray-800/30 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-white font-mono">
                            Peak Concurrency
                            <span className="text-[10px] block text-gray-500 font-normal font-sans">Simultaneous requests</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5">
                            At or below --max-num-seqs
                          </td>
                          <td className="py-2.5 px-3 font-mono text-amber-300 bg-amber-500/5">
                            Near limit, queuing starts
                          </td>
                          <td className="py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5">
                            Exceeds GPU budget
                          </td>
                          <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                            Once concurrency exceeds the KV-cache budget, vLLM preempts sequences — P95 spikes and errors rise.
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Actionable Tuning Tips */}
              <div className="p-3.5 bg-gray-900/90 border border-gray-800 rounded-xl space-y-3">
                <h4 className="font-bold text-xs text-white flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tuning Tips by Stage</span>
                </h4>

                {/* Average tips */}
                <div className="space-y-1 text-[11px]">
                  <p className="font-semibold text-amber-300">🟡 If results are Average — try these quick wins:</p>
                  <div className="space-y-1 text-gray-300 pl-2">
                    <p>• <strong>Warm up first</strong>: The first request is always slower (CUDA graph compilation). Run one warm-up query before benchmarking.</p>
                    <p>• <strong>Increase batch size</strong>: Under multi-user load, larger <code className="text-sky-300">--max-num-seqs</code> can improve GPU utilization and throughput.</p>
                    <p>• <strong>Check network proximity</strong>: High round-trip time between client and GPU server inflates TTFT independently of the model.</p>
                  </div>
                </div>

                {/* Bad tips */}
                <div className="space-y-1 text-[11px] border-t border-gray-800/80 pt-2">
                  <p className="font-semibold text-rose-400">🔴 If results are Bad — deeper fixes needed:</p>
                  <div className="space-y-1 text-gray-300 pl-2">
                    <p>
                      • <strong>If TTFT is too high (&gt;800ms)</strong>: For high-concurrency mixed load, try <code className="text-sky-300">--enable-chunked-prefill</code> to prevent long prefills from blocking short requests. Note: this helps latency under concurrent load, not necessarily single-request TTFT. Prefix caching only helps when prompts share a common prefix.
                    </p>
                    <p>
                      • <strong>If Decode Speed is sluggish (&lt;15 tok/s)</strong>: Quantize weights with FP8 or AWQ to cut memory-bandwidth demands, or use Tensor Parallelism (<code className="text-sky-300">--tensor-parallel-size 2</code>) across dual GPUs.
                    </p>
                    <p>
                      • <strong>If Error Rate &gt; 5% under load</strong>: Reduce <code className="text-sky-300">--max-num-seqs</code> to prevent KV-cache preemption/swapping. If hitting OOM, <em>lower</em> <code className="text-sky-300">--gpu-memory-utilization</code> to 0.80–0.85 (0.90 is already the default; raising it further rarely helps and can cause OOM).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-gray-800/80 flex items-center justify-between bg-gray-900/60 text-xs">
          <span className="text-gray-500 text-[11px]">
            Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300 font-mono text-[10px]">Esc</kbd> to close anytime.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn-primary text-xs py-1.5 px-3 bg-sky-600 hover:bg-sky-500"
          >
            Got it, Close Guide
          </button>
        </div>
      </div>
    </div>
  )
}
