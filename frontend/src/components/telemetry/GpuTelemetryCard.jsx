import React from 'react'
import { Activity, Flame, Zap, Gauge, AlertTriangle, ShieldCheck } from 'lucide-react'
import TelemetryCard from './TelemetryCard'
import { fmt, fmtBytes } from '../ui'

export default function GpuTelemetryCard({
  state = 'live',
  gpu = null,
  unavailableReason,
  staleReason,
}) {
  if (!gpu) {
    return (
      <TelemetryCard
        title="Hardware & GPU Telemetry"
        subtitle="NVIDIA NVML hardware sensor readings"
        icon={Activity}
        state={state === 'live' ? 'unavailable' : state}
        unavailableReason={
          unavailableReason ||
          'No NVIDIA GPU detected or pynvml is not installed in the backend environment.'
        }
        staleReason={staleReason}
        tooltip="Real-time NVIDIA hardware sensors streaming core compute, memory bus saturation, thermal dissipation, and wattage draw."
      />
    )
  }

  const isThrottling = gpu.throttle_reasons && gpu.throttle_reasons !== 'None'
  const temp = gpu.temperature_celsius
  const isHot = temp != null && temp >= 82
  const isWarm = temp != null && temp >= 72 && temp < 82

  return (
    <TelemetryCard
      title="Hardware & GPU Telemetry"
      subtitle={`${gpu.name} (GPU ${gpu.index})`}
      icon={Activity}
      state={state}
      staleReason={staleReason}
      tooltip="Real-time NVIDIA hardware sensors streaming core compute, memory bus saturation, thermal dissipation, and wattage draw."
      badge={
        isThrottling ? (
          <span className="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-mono flex items-center space-x-1 animate-pulse">
            <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
            <span>Throttling: {gpu.throttle_reasons}</span>
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
            NVML Healthy
          </span>
        )
      }
    >
      <div className="space-y-2.5 py-1">
        {/* Core compute & memory bus grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Core compute */}
          <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
            <div className="text-[10px] text-gray-500 uppercase font-mono">Compute Load</div>
            <div className="text-lg font-bold font-mono text-amber-400">
              {gpu.utilization_percent != null ? `${fmt(gpu.utilization_percent)}%` : '—'}
            </div>
            <div className="text-[9px] text-gray-500">core SM utilization</div>
          </div>

          {/* Memory Bandwidth */}
          <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
            <div className="text-[10px] text-gray-500 uppercase font-mono">Memory Bus Saturation</div>
            <div className="text-lg font-bold font-mono text-sky-400">
              {gpu.memory_bandwidth_percent != null ? `${fmt(gpu.memory_bandwidth_percent)}%` : '—'}
            </div>
            <div className="text-[9px] text-gray-500">NVML util.memory</div>
          </div>
        </div>

        {/* VRAM allocated bar */}
        <div className="bg-[#14161a] border border-[#22252b] rounded p-2.5 space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400 font-medium">VRAM Allocated</span>
            <span className="font-mono text-white font-bold">
              {fmtBytes(gpu.vram_used_bytes)} / {fmtBytes(gpu.vram_total_bytes)}{' '}
              <span className="text-emerald-400 font-normal">({fmt(gpu.vram_percent)}%)</span>
            </span>
          </div>
          <div className="w-full bg-[#22252b] h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                gpu.vram_percent > 90
                  ? 'bg-red-500'
                  : gpu.vram_percent > 75
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min(100, gpu.vram_percent ?? 0)}%` }}
            />
          </div>
        </div>

        {/* Thermals, Power, Clock */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono flex items-center justify-center space-x-1">
              <Flame className="w-2.5 h-2.5 text-amber-400" />
              <span>Temp</span>
            </div>
            <div
              className={`font-mono font-bold text-sm mt-0.5 ${
                isHot ? 'text-red-400' : isWarm ? 'text-amber-400' : 'text-gray-200'
              }`}
            >
              {temp != null ? `${temp}°C` : '—'}
            </div>
          </div>

          <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono flex items-center justify-center space-x-1">
              <Zap className="w-2.5 h-2.5 text-sky-400" />
              <span>Power</span>
            </div>
            <div className="font-mono font-bold text-sm text-gray-200 mt-0.5">
              {gpu.power_draw_watts ? `${fmt(gpu.power_draw_watts)}W` : '—'}
            </div>
          </div>

          <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono flex items-center justify-center space-x-1">
              <Gauge className="w-2.5 h-2.5 text-purple-400" />
              <span>Clock</span>
            </div>
            <div className="font-mono font-bold text-sm text-gray-200 mt-0.5">
              {gpu.clock_mhz ? `${gpu.clock_mhz} MHz` : '—'}
            </div>
          </div>
        </div>
      </div>
    </TelemetryCard>
  )
}
