import React from 'react'
import { Sparkles, CheckCircle2 } from 'lucide-react'
import TelemetryCard from './TelemetryCard'

export default function PrefixCacheCard({
  state = 'live',
  hitRatePct = null,
  unavailableReason,
  staleReason,
}) {
  const hitRate = hitRatePct != null ? Math.round(hitRatePct * 10) / 10 : null

  return (
    <TelemetryCard
      title="Prefix Cache Hit Rate"
      subtitle="Attention KV reuse across repeated prompt prefixes"
      icon={Sparkles}
      state={state}
      unavailableReason={
        unavailableReason ||
        'Prefix caching is disabled or not supported by this engine runtime.'
      }
      staleReason={staleReason}
      tooltip="Measures the fraction of prompt tokens that re-use pre-existing KV cache blocks from system prompts or conversation history, eliminating re-computation overhead."
      badge={
        hitRate != null ? (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
            {hitRate}% Hits
          </span>
        ) : null
      }
    >
      <div className="flex flex-col items-center justify-center py-4 space-y-3">
        {/* Radial / Arc Display */}
        <div className="relative flex items-center justify-center">
          <div className="w-24 h-24 rounded-full border-4 border-gray-800 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {hitRate != null ? `${hitRate}%` : '—'}
              </div>
              <div className="text-[9px] text-gray-500 uppercase font-mono tracking-wider">
                Hit Rate
              </div>
            </div>
          </div>
        </div>

        {/* Efficiency summary */}
        <div className="w-full bg-gray-800/40 border border-gray-800 rounded-lg p-2.5 text-xs text-center space-y-1">
          <div className="text-gray-300 font-medium flex items-center justify-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>KV Block Sharing Active</span>
          </div>
          <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
            {hitRate && hitRate > 50
              ? 'Excellent cache re-use: over half of prompt tokens bypass prefill computation entirely.'
              : hitRate && hitRate > 0
              ? 'Prompt prefix re-use detected: prefill latency is reduced for repeated system prompts.'
              : 'No prompt prefix matches detected in current traffic window.'}
          </p>
        </div>
      </div>
    </TelemetryCard>
  )
}
