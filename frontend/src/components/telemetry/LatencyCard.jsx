import React, { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Clock } from 'lucide-react'
import TelemetryCard from './TelemetryCard'

export default function LatencyCard({
  state = 'live',
  series = [],
  unavailableReason,
  staleReason,
}) {
  const [metricTab, setMetricTab] = useState('ttft') // 'ttft' | 'tpot' | 'e2e'

  // Extract latest P95 and Avg for each metric
  const summary = useMemo(() => {
    const validPoints = (series || []).filter(
      (p) => p.avg_ttft_ms != null || p.p95_ttft_ms != null
    )
    const latest = validPoints[validPoints.length - 1] || {}
    return {
      ttft: {
        avg: latest.avg_ttft_ms ?? null,
        p95: latest.p95_ttft_ms ?? null,
      },
      tpot: {
        avg: latest.avg_tpot_ms ?? null,
        p95: latest.p95_tpot_ms ?? null,
      },
      e2e: {
        avg: latest.avg_e2e_ms ?? null,
        p95: latest.p95_e2e_ms ?? null,
      },
    }
  }, [series])

  const chartData = useMemo(() => {
    return (series || []).map((pt) => ({
      time: pt.time,
      ttft_avg: pt.avg_ttft_ms,
      ttft_p95: pt.p95_ttft_ms,
      tpot_avg: pt.avg_tpot_ms,
      tpot_p95: pt.p95_tpot_ms,
      e2e_avg: pt.avg_e2e_ms,
      e2e_p95: pt.p95_e2e_ms,
    }))
  }, [series])

  const currentMetric = summary[metricTab]

  return (
    <TelemetryCard
      title="Latency Distributions (P95 vs Avg)"
      subtitle="Engine-reported response latencies derived from Prometheus histograms"
      icon={Clock}
      state={state}
      unavailableReason={
        unavailableReason ||
        'The selected engine does not expose histogram metrics (vLLM histogram tracking may be disabled).'
      }
      staleReason={staleReason}
      tooltip="P95 latency represents the 95th percentile worst-case response delay; Avg represents the mean duration across requests completed in each sample."
      actions={
        <div className="flex items-center bg-gray-950 border border-gray-800 rounded-lg p-0.5 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => setMetricTab('ttft')}
            className={`px-2 py-0.5 rounded transition-colors ${
              metricTab === 'ttft' ? 'bg-sky-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            TTFT
          </button>
          <button
            type="button"
            onClick={() => setMetricTab('tpot')}
            className={`px-2 py-0.5 rounded transition-colors ${
              metricTab === 'tpot' ? 'bg-sky-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            TPOT
          </button>
          <button
            type="button"
            onClick={() => setMetricTab('e2e')}
            className={`px-2 py-0.5 rounded transition-colors ${
              metricTab === 'e2e' ? 'bg-sky-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            E2E
          </button>
        </div>
      }
    >
      {/* Metric summary pills */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-gray-400 uppercase font-mono">
            {metricTab.toUpperCase()} Average
          </div>
          <div className="text-lg font-bold font-mono text-sky-400">
            {currentMetric.avg != null ? `${currentMetric.avg} ms` : '—'}
          </div>
          <div className="text-[9px] text-gray-500">mean duration</div>
        </div>

        <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-gray-400 uppercase font-mono">
            {metricTab.toUpperCase()} P95 SLA
          </div>
          <div className="text-lg font-bold font-mono text-amber-400">
            {currentMetric.p95 != null ? `${currentMetric.p95} ms` : '—'}
          </div>
          <div className="text-[9px] text-gray-500">95th percentile</div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="1 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#374151' }}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#374151' }}
              tickFormatter={(v) => `${v}ms`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-gray-900 border border-gray-700 p-2.5 rounded-lg shadow-xl text-[11px] space-y-1 font-mono">
                    <div className="text-gray-400 border-b border-gray-800 pb-1">{label}</div>
                    {payload.map((p, idx) => (
                      <div key={idx} className="flex justify-between space-x-3" style={{ color: p.color }}>
                        <span>{p.name}:</span>
                        <span className="font-bold">{p.value ?? '—'} ms</span>
                      </div>
                    ))}
                  </div>
                )
              }}
            />
            <Line
              type="monotone"
              dataKey={`${metricTab}_p95`}
              stroke="#f59e0b"
              strokeWidth={1.75}
              dot={{ r: 2 }}
              name={`${metricTab.toUpperCase()} P95`}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey={`${metricTab}_avg`}
              stroke="#38bdf8"
              strokeWidth={1.75}
              dot={{ r: 2 }}
              name={`${metricTab.toUpperCase()} Avg`}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center space-x-6 text-[11px] pt-2 text-[#8e94a0]">
        <span className="flex items-center space-x-1.5">
          <span className="w-3 h-0.5 bg-[#f59e0b] inline-block" />
          <span>P95 Tail Latency</span>
        </span>
        <span className="flex items-center space-x-1.5">
          <span className="w-3 h-0.5 bg-[#38bdf8] inline-block" />
          <span>Average Latency</span>
        </span>
      </div>
    </TelemetryCard>
  )
}
