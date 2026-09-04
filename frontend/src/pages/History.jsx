import React, { useState, useEffect } from 'react'
import { History as HistoryIcon, Download, Search, PlayCircle, Zap, RefreshCw, Eye } from 'lucide-react'
import { useBenchmarkStore } from '../stores/benchmarkStore'
import { useLoadTestStore } from '../stores/loadTestStore'
import { SectionHeader, StatusBadge, Spinner, Alert, fmt, fmtMs } from '../components/ui'

export function History() {
  const [tab, setTab] = useState('benchmarks') // 'benchmarks' | 'loadtests'
  const [search, setSearch] = useState('')

  const benchmarks = useBenchmarkStore((s) => s.runs)
  const fetchBenchmarks = useBenchmarkStore((s) => s.fetchRuns)
  const loadTests = useLoadTestStore((s) => s.runs)
  const fetchLoadTests = useLoadTestStore((s) => s.fetchRuns)

  useEffect(() => {
    fetchBenchmarks()
    fetchLoadTests()
  }, [])

  const filteredBenchmarks = benchmarks.filter(
    (r) => r.model.toLowerCase().includes(search.toLowerCase()) || r.scenario.toLowerCase().includes(search.toLowerCase())
  )

  const filteredLoadTests = loadTests.filter(
    (r) => r.model.toLowerCase().includes(search.toLowerCase()) || r.pattern.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Test History & Data Export"
        subtitle="Review historical performance runs and export raw telemetry in CSV and JSON formats."
      />

      {/* Tabs & Search Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-4">
        {/* Tab Buttons */}
        <div className="flex space-x-2 bg-gray-900 p-1 rounded-xl border border-gray-800">
          <button
            onClick={() => setTab('benchmarks')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'benchmarks'
                ? 'bg-sky-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <PlayCircle className="w-4 h-4" />
            <span>Benchmarks ({benchmarks.length})</span>
          </button>
          <button
            onClick={() => setTab('loadtests')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'loadtests'
                ? 'bg-sky-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Load Tests ({loadTests.length})</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
          <input
            type="text"
            className="input pl-9 text-xs"
            placeholder="Search by model or scenario..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Benchmarks Table Tab */}
      {tab === 'benchmarks' && (
        <div className="card space-y-4">
          {filteredBenchmarks.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              No benchmark runs found. Run your first benchmark on the Benchmark page!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-gray-800/80 text-gray-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3 rounded-l-lg">Timestamp</th>
                    <th className="p-3">Model</th>
                    <th className="p-3">Scenario</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Avg TTFT</th>
                    <th className="p-3">Speed (tok/s)</th>
                    <th className="p-3">P95 Latency</th>
                    <th className="p-3 rounded-r-lg text-right">Export</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 font-mono">
                  {filteredBenchmarks.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-800/40">
                      <td className="p-3 text-gray-400 font-sans">
                        {new Date(run.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="p-3 font-bold text-white">{run.model}</td>
                      <td className="p-3 text-gray-300 capitalize font-sans">{run.scenario}</td>
                      <td className="p-3 font-sans">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="p-3 text-sky-400">{fmtMs(run.avg_ttft_ms)}</td>
                      <td className="p-3 text-emerald-400 font-bold">{fmt(run.avg_generation_tokens_per_second)}</td>
                      <td className="p-3 text-amber-400">{fmtMs(run.p95_latency_ms)}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5 font-sans">
                          <a
                            href={`http://localhost:8000/api/export/benchmarks/${run.id}/csv`}
                            download
                            className="btn-secondary text-[11px] py-1 px-2 flex items-center space-x-1"
                            title="Download CSV"
                          >
                            <Download className="w-3 h-3" />
                            <span>CSV</span>
                          </a>
                          <a
                            href={`http://localhost:8000/api/export/benchmarks/${run.id}/json`}
                            download
                            className="btn-secondary text-[11px] py-1 px-2 flex items-center space-x-1"
                            title="Download JSON"
                          >
                            <Download className="w-3 h-3" />
                            <span>JSON</span>
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Load Tests Table Tab */}
      {tab === 'loadtests' && (
        <div className="card space-y-4">
          {filteredLoadTests.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              No load test runs found. Launch your first test on the Load Test page!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-gray-800/80 text-gray-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3 rounded-l-lg">Timestamp</th>
                    <th className="p-3">Model</th>
                    <th className="p-3">Pattern</th>
                    <th className="p-3">Target Users</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Requests (OK/Fail)</th>
                    <th className="p-3">RPS</th>
                    <th className="p-3">P95 Latency</th>
                    <th className="p-3 rounded-r-lg text-right">Export</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 font-mono">
                  {filteredLoadTests.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-800/40">
                      <td className="p-3 text-gray-400 font-sans">
                        {new Date(run.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="p-3 font-bold text-white">{run.model}</td>
                      <td className="p-3 text-gray-300 capitalize font-sans">{run.pattern}</td>
                      <td className="p-3 text-sky-400 font-bold">{run.target_users}</td>
                      <td className="p-3 font-sans">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="p-3 text-gray-300">
                        <span className="text-emerald-400">{run.successful_requests ?? 0}</span> / <span className={run.failed_requests > 0 ? 'text-red-400' : 'text-gray-500'}>{run.failed_requests ?? 0}</span>
                      </td>
                      <td className="p-3 text-emerald-400 font-bold">{fmt(run.requests_per_second, 2)}</td>
                      <td className="p-3 text-amber-400">{fmtMs(run.p95_latency_ms)}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5 font-sans">
                          <a
                            href={`http://localhost:8000/api/export/load-tests/${run.id}/csv`}
                            download
                            className="btn-secondary text-[11px] py-1 px-2 flex items-center space-x-1"
                            title="Download CSV"
                          >
                            <Download className="w-3 h-3" />
                            <span>CSV</span>
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
