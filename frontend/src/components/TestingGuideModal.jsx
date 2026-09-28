import React, { useState, useEffect } from 'react'
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

export function TestingGuideModal({
  isOpen,
  onClose,
  initialTab = 'before',
  pageType = 'benchmark', // 'benchmark' | 'loadtest'
}) {
  const [activeTab, setActiveTab] = useState(initialTab)

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
                      Controls sampling randomness. Use <code className="text-sky-200">0.0–0.2</code> for deterministic coding/math, <code className="text-sky-200">0.7</code> for balanced benchmark repeatability.
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
                          Runs 3–5 repeated queries to average out cold-start latency and measure stable P95 response consistency.
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
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-white">Result Evaluation Scorecard</h3>
                <p className="text-gray-400 text-[11px]">
                  Use these empirical engineering thresholds to evaluate whether your measured numbers are Good, Average, or Bad:
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
                      <td className="py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5">
                        &lt; 300 ms
                      </td>
                      <td className="py-2.5 px-3 font-mono text-amber-300 bg-amber-500/5">
                        300 – 800 ms
                      </td>
                      <td className="py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5">
                        &gt; 800 ms (1s+)
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        Prefill delay. Under 300ms feels instant to humans; above 1s feels sluggish.
                      </td>
                    </tr>

                    {/* Decode Speed */}
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-white font-mono">
                        Generation Speed
                        <span className="text-[10px] block text-gray-500 font-normal font-sans">Tokens / second</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5">
                        &gt; 35 tok/s
                      </td>
                      <td className="py-2.5 px-3 font-mono text-sky-300 bg-sky-500/5">
                        15 – 35 tok/s
                      </td>
                      <td className="py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5">
                        &lt; 15 tok/s
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        Human reading speed is ~15–20 words/sec. Above 35 tok/s is ideal for automated agent loops.
                      </td>
                    </tr>

                    {/* TPOT */}
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-white font-mono">
                        TPOT
                        <span className="text-[10px] block text-gray-500 font-normal font-sans">Time / token</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5">
                        &lt; 30 ms/tok
                      </td>
                      <td className="py-2.5 px-3 font-mono text-sky-300 bg-sky-500/5">
                        30 – 65 ms/tok
                      </td>
                      <td className="py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5">
                        &gt; 65 ms/tok
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
                      <td className="py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5">
                        P95 &le; 1.5&times; Avg
                      </td>
                      <td className="py-2.5 px-3 font-mono text-amber-300 bg-amber-500/5">
                        P95 &le; 2.5&times; Avg
                      </td>
                      <td className="py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5">
                        P95 &gt; 2.5&times; Avg
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
                      <td className="py-2.5 px-3 font-mono text-emerald-300 font-bold bg-emerald-500/5">
                        0.0%
                      </td>
                      <td className="py-2.5 px-3 font-mono text-amber-300 bg-amber-500/5">
                        &le; 5.0%
                      </td>
                      <td className="py-2.5 px-3 font-mono text-rose-300 font-bold bg-rose-500/5">
                        &gt; 5.0%
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        Production SLA gate. Over 5% marks the capacity limit where request concurrency must be capped.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Actionable Tuning Tips if Red */}
              <div className="p-3.5 bg-gray-900/90 border border-gray-800 rounded-xl space-y-2">
                <h4 className="font-bold text-xs text-white flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>How to Tune if Results are in the Red (Bad):</span>
                </h4>
                <div className="space-y-1.5 text-[11px] text-gray-300">
                  <p>
                    • <strong>If TTFT is too high (&gt;800ms)</strong>: Turn on <code className="text-sky-300">--enable-chunked-prefill</code> in vLLM to split long prefill prompts across iterations, or enable Prefix Caching to reuse KV blocks.
                  </p>
                  <p>
                    • <strong>If Decode Speed is sluggish (&lt;15 tok/s)</strong>: Quantize weights with FP8 or AWQ to cut memory bandwidth demands in half, or use Tensor Parallelism (<code className="text-sky-300">-tp 2</code>) across dual GPUs.
                  </p>
                  <p>
                    • <strong>If Error Rate &gt; 5% under load</strong>: Reduce <code className="text-sky-300">--max-num-seqs</code> to prevent memory preemption/swapping, and ensure <code className="text-sky-300">--gpu-memory-utilization 0.90</code> is set.
                  </p>
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
