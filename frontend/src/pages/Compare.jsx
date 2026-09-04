import React, { useState, useEffect } from 'react'
import { GitCompare, Award, Zap, Cpu, Activity, ShieldCheck, Check, ArrowRight } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { useBenchmarkStore } from '../stores/benchmarkStore'
import { SectionHeader, StatusBadge, fmt, fmtMs } from '../components/ui'

export function Compare() {
  const runs = useBenchmarkStore((s) => s.runs)
  const fetchRuns = useBenchmarkStore((s) => s.fetchRuns)

  const [selectedIds, setSelectedIds] = useState([])

  useEffect(() => {
    fetchRuns()
  }, [])

  // Auto-select first two completed runs if available
  useEffect(() => {
    if (runs.length >= 2 && selectedIds.length === 0) {
      const completed = runs.filter((r) => r.status === 'completed')
      if (completed.length >= 2) {
        setSelectedIds([completed[0].id, completed[1].id])
      } else if (runs.length >= 2) {
        setSelectedIds([runs[0].id, runs[1].id])
      }
    }
  }, [runs.length])

  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id))
    } else {
      if (selectedIds.length >= 4) {
        alert('You can compare up to 4 models at once.')
        return
      }
      setSelectedIds([...selectedIds, id])
    }
  }

  const selectedRuns = runs.filter((r) => selectedIds.includes(r.id))

  // Prepare Comparative Bar Chart Data
  const chartSpeedData = selectedRuns.map((r) => ({
    name: `${r.model.slice(0, 14)} (${r.scenario})`,
    tok_s: r.avg_generation_tokens_per_second ? +r.avg_generation_tokens_per_second.toFixed(1) : 0,
    ttft: r.avg_ttft_ms ? +r.avg_ttft_ms.toFixed(1) : 0,
    p95: r.p95_latency_ms ? +r.p95_latency_ms.toFixed(1) : 0,
    efficiency: r.tokens_per_watt ? +r.tokens_per_watt.toFixed(2) : 0,
  }))

  // Determine Leaderboard Winners
  const fastestSpeed = Math.max(...selectedRuns.map((r) => r.avg_generation_tokens_per_second || 0), 0)
  const lowestTtft = Math.min(...selectedRuns.map((r) => r.avg_ttft_ms || Infinity))
  const lowestP95 = Math.min(...selectedRuns.map((r) => r.p95_latency_ms || Infinity))
  const highestEfficiency = Math.max(...selectedRuns.map((r) => r.tokens_per_watt || 0), 0)

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Model Comparison & Leaderboard"
        subtitle="Side-by-side performance, latency, and energy efficiency profiling across models and quantizations."
      />

      {/* Run Selection Bar */}
      <div className="card space-y-3">
        <div className="flex justify-between items-center border-b border-gray-800 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Select Runs to Compare (Choose 2 to 4)
          </h2>
          <span className="text-xs text-sky-400 font-mono">
            {selectedIds.length} of 4 selected
          </span>
        </div>

        {runs.length === 0 ? (
          <p className="text-xs text-gray-500 py-4">No benchmark runs recorded yet. Run tests to compare them here.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto pr-1">
            {runs.map((r) => {
              const isSelected = selectedIds.includes(r.id)
              return (
                <div
                  key={r.id}
                  onClick={() => toggleSelect(r.id)}
                  className={`p-2.5 rounded-xl border cursor-pointer text-xs transition-all flex items-start justify-between space-x-2 ${
                    isSelected
                      ? 'border-sky-500 bg-sky-950/30 text-white'
                      : 'border-gray-800 bg-gray-900/60 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="space-y-0.5 overflow-hidden">
                    <div className="font-bold text-gray-200 truncate font-mono">{r.model}</div>
                    <div className="text-[10px] text-gray-500 capitalize">
                      {r.scenario} • {fmt(r.avg_generation_tokens_per_second)} tok/s
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded flex items-center justify-center border ${isSelected ? 'bg-sky-600 border-sky-500 text-white' : 'border-gray-700'}`}>
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedRuns.length < 2 ? (
        <div className="card text-center py-16 text-gray-500 space-y-2">
          <GitCompare className="w-12 h-12 mx-auto text-gray-600" />
          <h3 className="font-semibold text-gray-300">Select at least 2 runs</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Choose two or more benchmark runs above to generate comparative throughput, latency, and efficiency scorecards.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Comparative Leaderboard Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card space-y-2 border-emerald-900/40 bg-emerald-950/10">
              <div className="flex items-center space-x-2 text-emerald-400">
                <Award className="w-4 h-4" />
                <span className="text-xs uppercase font-bold tracking-wider">Fastest Generation</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {fmt(fastestSpeed)} <span className="text-xs text-gray-400 font-sans">tok/s</span>
              </div>
              <div className="text-xs text-gray-400 truncate">
                Leader: <strong className="text-emerald-300">{selectedRuns.find((r) => r.avg_generation_tokens_per_second === fastestSpeed)?.model || '—'}</strong>
              </div>
            </div>

            <div className="card space-y-2 border-sky-900/40 bg-sky-950/10">
              <div className="flex items-center space-x-2 text-sky-400">
                <Zap className="w-4 h-4" />
                <span className="text-xs uppercase font-bold tracking-wider">Fastest TTFT</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {lowestTtft !== Infinity ? fmtMs(lowestTtft) : '—'}
              </div>
              <div className="text-xs text-gray-400 truncate">
                Leader: <strong className="text-sky-300">{selectedRuns.find((r) => r.avg_ttft_ms === lowestTtft)?.model || '—'}</strong>
              </div>
            </div>

            <div className="card space-y-2 border-amber-900/40 bg-amber-950/10">
              <div className="flex items-center space-x-2 text-amber-400">
                <Activity className="w-4 h-4" />
                <span className="text-xs uppercase font-bold tracking-wider">Lowest P95 Latency</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {lowestP95 !== Infinity ? fmtMs(lowestP95) : '—'}
              </div>
              <div className="text-xs text-gray-400 truncate">
                Leader: <strong className="text-amber-300">{selectedRuns.find((r) => r.p95_latency_ms === lowestP95)?.model || '—'}</strong>
              </div>
            </div>

            <div className="card space-y-2 border-purple-900/40 bg-purple-950/10">
              <div className="flex items-center space-x-2 text-purple-400">
                <Cpu className="w-4 h-4" />
                <span className="text-xs uppercase font-bold tracking-wider">Tokens / Watt</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {highestEfficiency > 0 ? fmt(highestEfficiency, 2) : 'N/A'}
              </div>
              <div className="text-xs text-gray-400 truncate">
                Most Efficient: <strong className="text-purple-300">{highestEfficiency > 0 ? selectedRuns.find((r) => r.tokens_per_watt === highestEfficiency)?.model : 'Host CPU/Metal'}</strong>
              </div>
            </div>
          </div>

          {/* Comparative Bar Chart */}
          <div className="card space-y-4">
            <h3 className="font-bold text-sm text-white">Comparative Throughput (tok/s) vs Response Time</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSpeedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" stroke="#4b5563" fontSize={11} />
                  <YAxis stroke="#4b5563" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="tok_s" name="Generation (tok/s)" fill="#34d399" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ttft" name="TTFT (ms)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="p95" name="P95 Latency (ms)" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Side-by-Side Detailed Matrix Table */}
          <div className="card space-y-3">
            <h3 className="font-bold text-sm text-white">Side-by-Side Comparison Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-gray-800/80 text-gray-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3 rounded-l-lg">Metric</th>
                    {selectedRuns.map((r) => (
                      <th key={r.id} className="p-3 font-mono text-white">
                        {r.model}
                        <div className="text-[10px] text-gray-400 font-sans font-normal capitalize">({r.scenario})</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 font-mono">
                  <tr>
                    <td className="p-3 text-gray-400 font-sans font-medium">Generation Speed</td>
                    {selectedRuns.map((r) => (
                      <td key={r.id} className={`p-3 font-bold ${r.avg_generation_tokens_per_second === fastestSpeed ? 'text-emerald-400' : 'text-gray-200'}`}>
                        {fmt(r.avg_generation_tokens_per_second)} tok/s
                        {r.avg_generation_tokens_per_second === fastestSpeed && ' 👑'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 text-gray-400 font-sans font-medium">Time-To-First-Token (TTFT)</td>
                    {selectedRuns.map((r) => (
                      <td key={r.id} className={`p-3 ${r.avg_ttft_ms === lowestTtft ? 'text-sky-400 font-bold' : 'text-gray-300'}`}>
                        {fmtMs(r.avg_ttft_ms)}
                        {r.avg_ttft_ms === lowestTtft && ' ⚡'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 text-gray-400 font-sans font-medium">P95 Latency</td>
                    {selectedRuns.map((r) => (
                      <td key={r.id} className={`p-3 ${r.p95_latency_ms === lowestP95 ? 'text-amber-400 font-bold' : 'text-gray-300'}`}>
                        {fmtMs(r.p95_latency_ms)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 text-gray-400 font-sans font-medium">Tokens / Watt</td>
                    {selectedRuns.map((r) => (
                      <td key={r.id} className="p-3 text-purple-400">
                        {r.tokens_per_watt ? `${fmt(r.tokens_per_watt, 2)} tok/W` : 'Unified Memory'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 text-gray-400 font-sans font-medium">Quality Integrity Rate</td>
                    {selectedRuns.map((r) => (
                      <td key={r.id} className="p-3">
                        <span className="badge-green text-[10px]">
                          {fmt((r.quality_integrity_rate ?? 1) * 100)}% Valid
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 text-gray-400 font-sans font-medium">Status</td>
                    {selectedRuns.map((r) => (
                      <td key={r.id} className="p-3 font-sans">
                        <StatusBadge status={r.status} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
