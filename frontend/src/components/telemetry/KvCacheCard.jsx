import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Database, AlertTriangle, ShieldCheck } from 'lucide-react'
import TelemetryCard from './TelemetryCard'

export default function KvCacheCard({
  state = 'live',
  currentKvPct = null,
  totalBlocks = null,
  freeBlocks = null,
  watermarkBlocks = null,
  series = [],
  unavailableReason,
  staleReason,
}) {
  const chartData = useMemo(() => {
    return (series || []).map((pt) => ({
      time: pt.time,
      kv_usage: pt.kv_cache_usage_pct ?? 0,
    }))
  }, [series])

  const kvValue = currentKvPct != null ? Math.round(currentKvPct * 10) / 10 : null
  const isHighPressure = kvValue != null && kvValue >= 85
  const isModeratePressure = kvValue != null && kvValue >= 70 && kvValue < 85

  const statusColor = isHighPressure
    ? 'text-red-400'
    : isModeratePressure
    ? 'text-amber-400'
    : 'text-sky-400'

  return (
    <TelemetryCard
      title="KV Cache Occupancy"
      subtitle="GPU Key-Value attention cache memory allocation percentage"
      icon={Database}
      state={state}
      unavailableReason={
        unavailableReason ||
        'The selected engine does not expose KV cache pool statistics.'
      }
      staleReason={staleReason}
      tooltip="The KV Cache stores precomputed Key and Value matrices for every active sequence. When occupancy approaches 100%, the engine preempts requests or aborts new queries."
      badge={
        kvValue != null ? (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
              isHighPressure
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : isModeratePressure
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
            }`}
          >
            {kvValue}% occupied
          </span>
        ) : null
      }
    >
      {/* Top Gauge Pill */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-mono">Current Usage</div>
          <div className={`text-lg font-bold font-mono ${statusColor}`}>
            {kvValue != null ? `${kvValue}%` : '—'}
          </div>
          <div className="text-[9px] text-gray-500">
            {isHighPressure
              ? 'Critical Pressure'
              : isModeratePressure
              ? 'Elevated Pressure'
              : 'Normal Operating Range'}
          </div>
        </div>

        <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-mono">Free KV Blocks</div>
          <div className="text-lg font-bold font-mono text-gray-200">
            {freeBlocks != null ? freeBlocks.toLocaleString() : '—'}
          </div>
          <div className="text-[9px] text-gray-500">
            {totalBlocks != null ? `of ${totalBlocks.toLocaleString()} total` : 'slots available'}
          </div>
        </div>
      </div>

      {/* Time series chart */}
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="1 3" stroke="#22252e" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#5d636f"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#2b303a' }}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              stroke="#5d636f"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#2b303a' }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const val = payload[0]?.value ?? 0
                return (
                  <div className="bg-[#181b1f] border border-[#2b303a] p-2.5 rounded shadow text-[11px] space-y-1 font-mono">
                    <div className="text-gray-400 border-b border-[#2b303a] pb-1">{label}</div>
                    <div className="text-sky-400 flex justify-between space-x-3">
                      <span>KV Cache:</span>
                      <span className="font-bold">{val}%</span>
                    </div>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="kv_usage"
              stroke="#0284c7"
              fill="#0369a1"
              fillOpacity={0.35}
              strokeWidth={1.75}
              name="KV Cache %"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend & Watermark */}
      <div className="flex items-center justify-between text-[10px] pt-2 text-[#8e94a0] font-mono">
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-0.5 bg-[#0284c7] inline-block" />
          <span>KV Occupancy Trend</span>
        </div>
        {watermarkBlocks != null && (
          <span className="text-gray-500">
            Watermark: {watermarkBlocks} blocks
          </span>
        )}
      </div>
    </TelemetryCard>
  )
}
