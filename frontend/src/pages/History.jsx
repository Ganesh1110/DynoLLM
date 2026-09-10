import React, { useState, useEffect } from 'react'
import { History as HistoryIcon, Download, Search, PlayCircle, Zap, RefreshCw, Eye, Trash2, AlertTriangle } from 'lucide-react'
import { useBenchmarkStore } from '../stores/benchmarkStore'
import { useLoadTestStore } from '../stores/loadTestStore'
import { benchmarksApi, loadTestsApi } from '../services/api'
import { SectionHeader, StatusBadge, Spinner, Alert, fmt, fmtMs } from '../components/ui'

export function History() {
  const [tab, setTab] = useState('benchmarks') // 'benchmarks' | 'loadtests'
  const [search, setSearch] = useState('')
  const [deleteModal, setDeleteModal] = useState(null) // { mode: 'clear_tab' | 'clear_all' | 'single', type: 'benchmarks' | 'loadtests', id?: string, title?: string }
  const [deleting, setDeleting] = useState(false)

  const benchmarks = useBenchmarkStore((s) => s.runs)
  const fetchBenchmarks = useBenchmarkStore((s) => s.fetchRuns)
  const deleteBenchmark = useBenchmarkStore((s) => s.deleteRun)
  const clearBenchmarkHistory = useBenchmarkStore((s) => s.clearHistory)

  const loadTests = useLoadTestStore((s) => s.runs)
  const fetchLoadTests = useLoadTestStore((s) => s.fetchRuns)
  const deleteLoadTest = useLoadTestStore((s) => s.deleteRun)
  const clearLoadTestHistory = useLoadTestStore((s) => s.clearHistory)

  useEffect(() => {
    fetchBenchmarks()
    fetchLoadTests()
  }, [])

  const executeDelete = async () => {
    if (!deleteModal) return
    setDeleting(true)
    try {
      if (deleteModal.mode === 'single') {
        if (deleteModal.type === 'benchmarks') {
          await deleteBenchmark(deleteModal.id)
        } else {
          await deleteLoadTest(deleteModal.id)
        }
      } else if (deleteModal.mode === 'clear_tab') {
        if (deleteModal.type === 'benchmarks') {
          await clearBenchmarkHistory()
        } else {
          await clearLoadTestHistory()
        }
      } else if (deleteModal.mode === 'clear_all') {
        await Promise.all([clearBenchmarkHistory(), clearLoadTestHistory()])
      }
      setDeleteModal(null)
    } catch (e) {
      alert(`Delete failed: ${e.message}`)
    } finally {
      setDeleting(false)
    }
  }

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

        {/* Search & Actions */}
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* Search input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
            <input
              type="text"
              className="input pl-9 text-xs"
              placeholder="Search by model or scenario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Clear History button */}
          <button
            onClick={() =>
              setDeleteModal({
                mode: 'clear_tab',
                type: tab,
                count: tab === 'benchmarks' ? benchmarks.length : loadTests.length,
              })
            }
            disabled={(tab === 'benchmarks' ? benchmarks.length : loadTests.length) === 0}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            title={`Clear ${tab === 'benchmarks' ? 'benchmarks' : 'load tests'} history`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear {tab === 'benchmarks' ? 'Benchmarks' : 'Load Tests'}</span>
          </button>
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
                    <th className="p-3 rounded-r-lg text-right">Actions</th>
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
                          {/* Fix 6b: dynamic export URLs */}
                          <a
                            href={benchmarksApi.exportCsv(run.id)}
                            download
                            className="btn-secondary text-[11px] py-1 px-2 flex items-center space-x-1"
                            title="Download CSV"
                          >
                            <Download className="w-3 h-3" />
                            <span>CSV</span>
                          </a>
                          <a
                            href={benchmarksApi.exportJson(run.id)}
                            download
                            className="btn-secondary text-[11px] py-1 px-2 flex items-center space-x-1"
                            title="Download JSON"
                          >
                            <Download className="w-3 h-3" />
                            <span>JSON</span>
                          </a>
                          <button
                            onClick={() =>
                              setDeleteModal({
                                mode: 'single',
                                type: 'benchmarks',
                                id: run.id,
                                title: `${run.model} (${run.scenario})`,
                              })
                            }
                            className="btn-secondary text-[11px] py-1 px-2 flex items-center space-x-1 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30"
                            title="Delete run"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
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
                    <th className="p-3 rounded-r-lg text-right">Actions</th>
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
                          {/* Fix 6b: dynamic load-test export URL */}
                          <a
                            href={loadTestsApi.exportCsv(run.id)}
                            download
                            className="btn-secondary text-[11px] py-1 px-2 flex items-center space-x-1"
                            title="Download CSV"
                          >
                            <Download className="w-3 h-3" />
                            <span>CSV</span>
                          </a>
                          <button
                            onClick={() =>
                              setDeleteModal({
                                mode: 'single',
                                type: 'loadtests',
                                id: run.id,
                                title: `${run.model} (${run.pattern})`,
                              })
                            }
                            className="btn-secondary text-[11px] py-1 px-2 flex items-center space-x-1 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30"
                            title="Delete run"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
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

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  {deleteModal.mode === 'single'
                    ? 'Delete Test Run'
                    : deleteModal.mode === 'clear_all'
                    ? 'Clear All History'
                    : `Clear ${deleteModal.type === 'benchmarks' ? 'Benchmark' : 'Load Test'} History`}
                </h3>
                <p className="text-xs text-gray-400">This action cannot be undone.</p>
              </div>
            </div>

            <div className="text-xs text-gray-300 bg-gray-950 p-3 rounded-lg border border-gray-800 space-y-2">
              {deleteModal.mode === 'single' ? (
                <p>
                  Are you sure you want to delete the run for <strong className="text-white font-mono">{deleteModal.title}</strong>? All metrics and telemetry results for this run will be permanently erased.
                </p>
              ) : (
                <>
                  <p>
                    Are you sure you want to permanently delete{' '}
                    <strong className="text-rose-400 font-bold">
                      {deleteModal.mode === 'clear_all'
                        ? `all ${benchmarks.length + loadTests.length} recorded runs (both benchmarks & load tests)`
                        : `all ${deleteModal.count} recorded ${deleteModal.type === 'benchmarks' ? 'benchmark' : 'load test'} runs`}
                    </strong>
                    ?
                  </p>
                  {deleteModal.mode !== 'clear_all' && (benchmarks.length > 0 && loadTests.length > 0) && (
                    <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
                      <span className="text-gray-400">Want to wipe both benchmarks & load tests?</span>
                      <button
                        type="button"
                        onClick={() => setDeleteModal({ mode: 'clear_all', type: 'all', count: benchmarks.length + loadTests.length })}
                        className="text-sky-400 hover:text-sky-300 font-medium underline"
                      >
                        Clear Everything
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteModal(null)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={executeDelete}
                className="btn-danger text-xs px-4 py-2 flex items-center space-x-1.5"
              >
                {deleting && <Spinner className="w-3.5 h-3.5" />}
                <span>
                  {deleting
                    ? 'Deleting...'
                    : deleteModal.mode === 'single'
                    ? 'Delete Run'
                    : deleteModal.mode === 'clear_all'
                    ? 'Clear All History'
                    : 'Clear History'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
