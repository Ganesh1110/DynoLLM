import React from 'react'
import { Server, Cpu, Box, AlertTriangle, CheckCircle2 } from 'lucide-react'
import TelemetryCard from './TelemetryCard'
import { parseModelName } from '../../utils/gpuSizer'

export default function ModelInfoCard({
  state = 'live',
  runtime = null,
  modelsLoaded = [],
  unavailableReason,
  staleReason,
}) {
  const model = modelsLoaded?.[0] || null
  const modelName = model?.name || 'No model reported'
  const parsed = parseModelName(modelName)

  const isCpuOffloaded = model?.cpu_offload_gb && model.cpu_offload_gb > 0.1

  return (
    <TelemetryCard
      title="Loaded Model & Architecture"
      subtitle={runtime ? `${runtime.runtime_name || runtime.name} (${runtime.engine || runtime.type})` : 'Runtime Model'}
      icon={Box}
      state={state}
      unavailableReason={
        unavailableReason ||
        'The selected engine does not report loaded model metadata.'
      }
      staleReason={staleReason}
      tooltip="Architecture and memory footprint details for the active model loaded in engine memory."
      badge={
        isCpuOffloaded ? (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono flex items-center space-x-1">
            <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
            <span>CPU Offload: {model.cpu_offload_gb} GB</span>
          </span>
        ) : model ? (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
            GPU Resident
          </span>
        ) : null
      }
    >
      <div className="space-y-2.5 py-1">
        {/* Model name header */}
        <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-2.5">
          <div className="text-[10px] text-gray-400 uppercase font-mono">Active Model</div>
          <div className="font-bold text-white text-sm font-mono truncate mt-0.5" title={modelName}>
            {modelName}
          </div>
        </div>

        {/* Architecture details */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-2.5">
            <div className="text-[9px] text-gray-400 uppercase font-mono">Family &amp; Size</div>
            <div className="font-mono font-bold text-sky-400 mt-0.5 truncate">
              {parsed.family} {parsed.paramSizeB ? `${parsed.paramSizeB}B` : ''}
            </div>
          </div>

          <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-2.5">
            <div className="text-[9px] text-gray-400 uppercase font-mono">Precision / Quant</div>
            <div className="font-mono font-bold text-gray-200 mt-0.5">
              {parsed.quant || 'Native / FP16'}
            </div>
          </div>
        </div>

        {/* Engine and VRAM details */}
        <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-2.5 text-xs flex justify-between items-center font-mono">
          <span className="text-gray-400">VRAM Weight Footprint</span>
          <span className="text-white font-bold">
            {model?.vram_gb != null ? `${model.vram_gb.toFixed(1)} GB` : '—'}
          </span>
        </div>
      </div>
    </TelemetryCard>
  )
}
