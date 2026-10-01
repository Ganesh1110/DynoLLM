import React from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Users, AlertCircle } from 'lucide-react'
import TelemetryCard from './TelemetryCard'

export default function RequestFlowCard({
  state = 'live',
  series = [],
  currentRunning = 0,
  currentWaiting = 0,
  currentSwapped = 0,
  unavailableReason,
  staleReason,
}) {
  const hasBacklog = currentWaiting > 0

  return (
    <TelemetryCard
      title="Request Flow & Queue Depth"
      subtitle="Concurrent active generation requests vs waiting requests"
      icon={Users}
      state={state}
      unavailableReason={
        unavailableReason ||
        'The selected engine does not expose Prometheus request execution states.'
      }
      staleReason={staleReason}
      tooltip="Number of client requests currently executing (running), held in the admission queue (waiting), or swapped out to CPU memory due to KV pressure."
      badge={
        hasBacklog ? (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono flex items-center space-x-1">
            <AlertCircle className="w-2.5 h-2.5 text-amber-400" />
            <span>Queue Backlog ({currentWaiting})</span>
          </span>
        ) : null
      }
    >
      {/* Metric summary counters */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-mono">Running</div>
          <div className="text-lg font-bold font-mono text-emerald-400">
            {currentRunning ?? 0}
          </div>
          <div className="text-[9px] text-gray-500">active generation</div>
        </div>

        <div className={`border rounded p-2 text-center ${hasBacklog ? 'bg-amber-950/20 border-amber-500/40' : 'bg-[#14161a] border-[#22252b]'}`}>
          <div className="text-[10px] text-gray-500 uppercase font-mono">Waiting</div>
          <div className={`text-lg font-bold font-mono ${hasBacklog ? 'text-amber-400 animate-pulse' : 'text-gray-300'}`}>
            {currentWaiting ?? 0}
          </div>
          <div className="text-[9px] text-gray-500">queued for KV slot</div>
        </div>

        <div className="bg-[#14161a] border border-[#22252b] rounded p-2 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-mono">Swapped</div>
          <div className="text-lg font-bold font-mono text-purple-400">
            {currentSwapped ?? 0}
          </div>
          <div className="text-[9px] text-gray-500">evicted to RAM</div>
        </div>
      </div>

      {/* Time series chart */}
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
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
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const running = payload.find((p) => p.dataKey === 'requests_running')?.value ?? 0
                const waiting = payload.find((p) => p.dataKey === 'requests_waiting')?.value ?? 0
                return (
                  <div className="bg-[#181b1f] border border-[#2b303a] p-2.5 rounded shadow text-[11px] space-y-1 font-mono">
                    <div className="text-gray-400 border-b border-[#2b303a] pb-1">{label}</div>
                    <div className="text-emerald-400 flex justify-between space-x-3">
                      <span>Running:</span>
                      <span className="font-bold">{running}</span>
                    </div>
                    <div className="text-amber-400 flex justify-between space-x-3">
                      <span>Waiting:</span>
                      <span className="font-bold">{waiting}</span>
                    </div>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="requests_running"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.25}
              strokeWidth={1.75}
              name="Running"
            />
            <Area
              type="monotone"
              dataKey="requests_waiting"
              stroke="#f59e0b"
              fill="#f59e0b"
              fillOpacity={0.35}
              strokeWidth={1.75}
              name="Waiting"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center space-x-6 text-[11px] pt-2 text-[#8e94a0]">
        <span className="flex items-center space-x-1.5">
          <span className="w-3 h-0.5 bg-[#10b981] inline-block" />
          <span>Active Running</span>
        </span>
        <span className="flex items-center space-x-1.5">
          <span className="w-3 h-0.5 bg-[#f59e0b] inline-block" />
          <span>Waiting in Queue</span>
        </span>
      </div>
    </TelemetryCard>
  )
}
