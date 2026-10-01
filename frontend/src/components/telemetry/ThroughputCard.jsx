import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Zap } from 'lucide-react'
import TelemetryCard from './TelemetryCard'

export default function ThroughputCard({
  state = 'live',
  series = [],
  unavailableReason,
  staleReason,
}) {
  // Extract latest rates from the most recent series point
  const { currentInputTokSec, currentOutputTokSec, totalTokSec } = useMemo(() => {
    if (!series || series.length === 0) {
      return { currentInputTokSec: 0, currentOutputTokSec: 0, totalTokSec: 0 }
    }
    // Find last point with calculated rates
    const validPoints = series.filter(
      (p) => p.input_tokens_per_second != null || p.output_tokens_per_second != null
    )
    const latest = validPoints[validPoints.length - 1] || series[series.length - 1] || {}
    const inRate = latest.input_tokens_per_second ?? 0
    const outRate = latest.output_tokens_per_second ?? 0
    return {
      currentInputTokSec: inRate,
      currentOutputTokSec: outRate,
      totalTokSec: Math.round((inRate + outRate) * 10) / 10,
    }
  }, [series])

  // Sanitized chart series with fallbacks to 0 for chart display
  const chartData = useMemo(() => {
    return (series || []).map((pt) => ({
      time: pt.time,
      input_rate: pt.input_tokens_per_second ?? 0,
      output_rate: pt.output_tokens_per_second ?? 0,
      total_rate:
        (pt.input_tokens_per_second ?? 0) + (pt.output_tokens_per_second ?? 0),
    }))
  }, [series])

  return (
    <TelemetryCard
      title="Token Throughput Rate"
      subtitle="Real-time Prompt (Prefill) vs Generation (Decode) rate in tokens/sec"
      icon={Zap}
      state={state}
      unavailableReason={
        unavailableReason ||
        'The selected engine does not report cumulative token counters for rate derivation.'
      }
      staleReason={staleReason}
      tooltip="Prefill throughput measures how fast the engine ingests prompt tokens. Decode throughput measures word-by-word streaming generation speed."
      badge={
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
          {totalTokSec} tok/s total
        </span>
      }
    >
      {/* Top rate pills */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-mono">Prompt (Prefill)</div>
          <div className="text-lg font-bold font-mono text-sky-400">
            {currentInputTokSec} <span className="text-xs font-normal text-gray-400">tok/s</span>
          </div>
          <div className="text-[9px] text-gray-500">compute-bound</div>
        </div>

        <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-mono">Generation (Decode)</div>
          <div className="text-lg font-bold font-mono text-emerald-400">
            {currentOutputTokSec} <span className="text-xs font-normal text-gray-400">tok/s</span>
          </div>
          <div className="text-[9px] text-gray-500">bandwidth-bound</div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="1 3" stroke="#22252e" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#5d636f"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#2b303a' }}
            />
            <YAxis
              stroke="#5d636f"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#2b303a' }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const inVal = payload.find((p) => p.dataKey === 'input_rate')?.value ?? 0
                const outVal = payload.find((p) => p.dataKey === 'output_rate')?.value ?? 0
                return (
                  <div className="bg-[#181b1f] border border-[#2b303a] p-2.5 rounded shadow text-[11px] space-y-1 font-mono">
                    <div className="text-gray-400 border-b border-[#2b303a] pb-1">{label}</div>
                    <div className="text-sky-400 flex justify-between space-x-3">
                      <span>Prompt:</span>
                      <span className="font-bold">{inVal} tok/s</span>
                    </div>
                    <div className="text-emerald-400 flex justify-between space-x-3">
                      <span>Decode:</span>
                      <span className="font-bold">{outVal} tok/s</span>
                    </div>
                  </div>
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="input_rate"
              stroke="#38bdf8"
              strokeWidth={1.75}
              dot={false}
              name="Prompt tok/s"
            />
            <Line
              type="monotone"
              dataKey="output_rate"
              stroke="#10b981"
              strokeWidth={1.75}
              dot={false}
              name="Generation tok/s"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center space-x-6 text-[11px] pt-2 text-[#8e94a0]">
        <span className="flex items-center space-x-1.5">
          <span className="w-3 h-0.5 bg-[#38bdf8] inline-block" />
          <span>Prompt Rate (tok/s)</span>
        </span>
        <span className="flex items-center space-x-1.5">
          <span className="w-3 h-0.5 bg-[#10b981] inline-block" />
          <span>Decode Rate (tok/s)</span>
        </span>
      </div>
    </TelemetryCard>
  )
}
