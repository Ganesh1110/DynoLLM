import React, { useMemo } from 'react'
import { Layers, AlertTriangle, ShieldCheck, Cpu } from 'lucide-react'
import TelemetryCard from './TelemetryCard'
import { evaluateQueueBacklog } from '../../utils/telemetryLifecycle'

export default function CapacityCard({
  state = 'live',
  currentRunning = 0,
  currentWaiting = 0,
  totalBlocks = null,
  freeBlocks = null,
  watermarkBlocks = null,
  series = [],
  unavailableReason,
  staleReason,
}) {
  // Compute backlog persistence and admission ratio
  const backlogStats = useMemo(() => {
    return evaluateQueueBacklog({
      waiting: currentWaiting,
      running: currentRunning,
      series,
    })
  }, [series, currentWaiting, currentRunning])

  // Headroom calculation from PagedAttention blocks
  const blockHeadroomPct = useMemo(() => {
    if (totalBlocks && totalBlocks > 0 && freeBlocks != null) {
      return Math.round((freeBlocks / totalBlocks) * 100)
    }
    return null
  }, [totalBlocks, freeBlocks])

  const { hasBacklog, isSevereBacklog } = backlogStats

  return (
    <TelemetryCard
      title="Capacity Headroom & Admission Queue"
      subtitle="Engine slot saturation and PagedAttention block availability"
      icon={Layers}
      state={state}
      unavailableReason={
        unavailableReason ||
        'The selected engine does not report block capacity or queue depth.'
      }
      staleReason={staleReason}
      tooltip="Evaluates whether the engine has sufficient KV blocks and concurrency slots to admit incoming requests without queueing or preempting active sessions."
    >
      <div className="space-y-3">
        {/* Backlog Alert if detected */}
        {isSevereBacklog ? (
          <div className="p-2.5 rounded bg-red-950/40 border border-red-500/50 text-red-200 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-300">
                Persistent Admission Queue Backlog
              </div>
              <div className="text-[11px] text-red-300/80 leading-relaxed mt-0.5">
                {currentWaiting} request(s) are currently waiting for KV slots. Consider increasing GPU VRAM allocation, reducing max context length, or adding an inference replica.
              </div>
            </div>
          </div>
        ) : currentWaiting > 0 ? (
          <div className="p-2 rounded bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px]">
              Transient queue backlog: {currentWaiting} request(s) queued.
            </span>
          </div>
        ) : (
          <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[11px]">
              Queue clear: Requests admitted immediately without delay.
            </span>
          </div>
        )}

        {/* PagedAttention Block Telemetry (vLLM) */}
        {totalBlocks != null && freeBlocks != null ? (
          <div className="bg-[#14161a] border border-[#22252b] rounded p-2.5 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400 font-medium">Free KV Blocks</span>
              <span className="font-mono font-bold text-sky-400">
                {freeBlocks.toLocaleString()} / {totalBlocks.toLocaleString()} ({blockHeadroomPct}%)
              </span>
            </div>

            {/* Visual Headroom Bar */}
            <div className="w-full bg-[#22252b] h-2 rounded-full overflow-hidden flex">
              <div
                className={`h-full transition-all ${
                  blockHeadroomPct < 15
                    ? 'bg-red-500'
                    : blockHeadroomPct < 35
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
                style={{ width: `${100 - (blockHeadroomPct ?? 0)}%` }}
                title={`Allocated: ${100 - (blockHeadroomPct ?? 0)}%`}
              />
              <div
                className="h-full bg-sky-950/60 transition-all"
                style={{ width: `${blockHeadroomPct ?? 0}%` }}
                title={`Available Headroom: ${blockHeadroomPct}%`}
              />
            </div>

            <div className="flex justify-between text-[10px] text-gray-500 font-mono pt-0.5">
              <span>Allocated: {totalBlocks - freeBlocks} blocks</span>
              <span>Available: {freeBlocks} blocks</span>
            </div>
          </div>
        ) : (
          <div className="bg-[#14161a] border border-[#22252b] rounded p-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-gray-400">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>Concurrency Load Factor</span>
            </div>
            <span className="font-mono font-bold text-white">
              {currentRunning > 0 ? `${currentRunning} Active Slots` : 'Idle'}
            </span>
          </div>
        )}

        {/* Key Headroom Insights */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
            <div className="text-[10px] text-gray-500 uppercase font-mono">Admission Ratio</div>
            <div className="font-mono font-bold text-gray-200 mt-0.5">
              {currentRunning + currentWaiting > 0
                ? `${Math.round((currentRunning / (currentRunning + currentWaiting)) * 100)}%`
                : '100%'}
            </div>
            <div className="text-[9px] text-gray-500">running / total requests</div>
          </div>

          <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
            <div className="text-[10px] text-gray-500 uppercase font-mono">Queue Status</div>
            <div className={`font-mono font-bold mt-0.5 ${hasBacklog ? 'text-amber-400' : 'text-emerald-400'}`}>
              {hasBacklog ? `${currentWaiting} Queued` : 'Empty (0)'}
            </div>
            <div className="text-[9px] text-gray-500">pending admission</div>
          </div>
        </div>
      </div>
    </TelemetryCard>
  )
}
