import React, { useMemo } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, PieChart } from 'lucide-react'
import TelemetryCard from './TelemetryCard'

export default function FinishReasonsCard({
  state = 'live',
  finishReasons = {},
  deltaReasons = {},
  unavailableReason,
  staleReason,
}) {
  // Use delta counts if available in summary, else fallback to current snapshot counters
  const counts = useMemo(() => {
    const hasDelta = Object.keys(deltaReasons || {}).length > 0
    const source = hasDelta ? deltaReasons : finishReasons || {}
    const stop = source.stop ?? 0
    const length = source.length ?? 0
    const abort = source.abort ?? 0
    const total = stop + length + abort
    return { stop, length, abort, total, isDelta: hasDelta }
  }, [deltaReasons, finishReasons])

  const stopPct = counts.total > 0 ? Math.round((counts.stop / counts.total) * 100) : 0
  const lengthPct = counts.total > 0 ? Math.round((counts.length / counts.total) * 100) : 0
  const abortPct = counts.total > 0 ? Math.round((counts.abort / counts.total) * 100) : 0

  return (
    <TelemetryCard
      title="Request Finish Reasons"
      subtitle="Completed requests segmented by completion reason in window"
      icon={PieChart}
      state={state}
      unavailableReason={
        unavailableReason ||
        'The selected engine does not track request finish reason counters.'
      }
      staleReason={staleReason}
      tooltip="Tracks how requests finished: 'stop' = normal end-of-sequence; 'length' = hit maximum token context limit; 'abort' = client disconnected or timed out."
      badge={
        <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px] font-mono border border-gray-700">
          {counts.total} completed
        </span>
      }
    >
      <div className="space-y-3 py-2">
        {/* Visual Distribution Segmented Bar */}
        <div className="w-full bg-[#22252b] h-3 rounded-full overflow-hidden flex">
          {counts.stop > 0 && (
            <div
              className="bg-emerald-500 h-full transition-all"
              style={{ width: `${stopPct}%` }}
              title={`Natural EOS (stop): ${counts.stop} (${stopPct}%)`}
            />
          )}
          {counts.length > 0 && (
            <div
              className="bg-amber-500 h-full transition-all"
              style={{ width: `${lengthPct}%` }}
              title={`Max Tokens Hit (length): ${counts.length} (${lengthPct}%)`}
            />
          )}
          {counts.abort > 0 && (
            <div
              className="bg-red-500 h-full transition-all"
              style={{ width: `${abortPct}%` }}
              title={`Client Aborted (abort): ${counts.abort} (${abortPct}%)`}
            />
          )}
        </div>

        {/* Breakdown List */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs bg-[#14161a] border border-[#22252b] rounded px-3 py-1.5">
            <div className="flex items-center space-x-2 text-gray-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Natural EOS (stop)</span>
            </div>
            <span className="font-mono font-bold text-emerald-400">
              {counts.stop} <span className="text-[10px] font-normal text-gray-500">({stopPct}%)</span>
            </span>
          </div>

          <div className="flex items-center justify-between text-xs bg-[#14161a] border border-[#22252b] rounded px-3 py-1.5">
            <div className="flex items-center space-x-2 text-gray-300">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Max Tokens Cutoff (length)</span>
            </div>
            <span className="font-mono font-bold text-amber-400">
              {counts.length} <span className="text-[10px] font-normal text-gray-500">({lengthPct}%)</span>
            </span>
          </div>

          <div className="flex items-center justify-between text-xs bg-[#14161a] border border-[#22252b] rounded px-3 py-1.5">
            <div className="flex items-center space-x-2 text-gray-300">
              <XCircle className="w-3.5 h-3.5 text-red-400" />
              <span>Client Aborted (abort)</span>
            </div>
            <span className="font-mono font-bold text-red-400">
              {counts.abort} <span className="text-[10px] font-normal text-gray-500">({abortPct}%)</span>
            </span>
          </div>
        </div>
      </div>
    </TelemetryCard>
  )
}
