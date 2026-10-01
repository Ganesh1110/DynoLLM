import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Terminal,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { tracesApi } from '../services/api'
import TraceDrawer from '../components/traces/TraceDrawer'
import { fmt } from '../components/ui'

export function Traces() {
  const [traces, setTraces] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchRunId, setSearchRunId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTrace, setSelectedTrace] = useState(null)

  // Pagination
  const [page, setPage] = useState(0)
  const pageSize = 25

  const fetchTraces = useCallback(async () => {
    try {
      setLoading(true)
      const params = {
        limit: pageSize,
        offset: page * pageSize,
      }
      if (sourceFilter !== 'all') {
        params.source = sourceFilter
      }
      if (searchRunId.trim()) {
        params.run_id = searchRunId.trim()
      }

      const res = await tracesApi.list(params)
      setTraces(res.traces || [])
      setTotalCount(res.total || 0)
    } catch {
      // Backend may be offline
    } finally {
      setLoading(false)
    }
  }, [page, sourceFilter, searchRunId, pageSize])

  useEffect(() => {
    fetchTraces()
  }, [fetchTraces])

  // Filter client-side search query (model or text)
  const filteredTraces = useMemo(() => {
    if (!searchQuery.trim()) return traces
    const q = searchQuery.toLowerCase()
    return traces.filter((t) => {
      const modelMatch = t.model?.toLowerCase().includes(q)
      const promptMatch = t.prompt_text?.toLowerCase().includes(q)
      const runIdMatch = t.run_id?.toLowerCase().includes(q)
      return modelMatch || promptMatch || runIdMatch
    })
  }, [traces, searchQuery])

  const totalPages = Math.ceil(totalCount / pageSize) || 1

  return (
    <div className="-mt-4 sm:-mt-6 space-y-4 font-sans text-gray-200">
      {/* Top Breadcrumb Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3 pt-1">
        <div className="flex items-center space-x-2 text-sm">
          <Terminal className="w-5 h-5 text-sky-400" />
          <span className="text-[#8e94a0]">DynoLLM</span>
          <span className="text-[#555a64]">›</span>
          <span className="text-white font-medium">Request Traces</span>
          <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-mono bg-sky-950 text-sky-300 border border-sky-800/60">
            Phase 3 Engine Tracing
          </span>
        </div>

        <button
          type="button"
          onClick={fetchTraces}
          disabled={loading}
          className="flex items-center space-x-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Source Pills */}
        <div className="flex items-center space-x-1 bg-gray-950 border border-gray-800 rounded-lg p-1 font-mono text-[11px]">
          <span className="text-gray-500 px-2">Source:</span>
          {['all', 'benchmark', 'load_test', 'proxy'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSourceFilter(s)
                setPage(0)
              }}
              className={`px-2.5 py-0.5 rounded-md capitalize transition-colors ${
                sourceFilter === s
                  ? 'bg-sky-600 text-white font-medium shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Search Inputs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Run ID Filter */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter by Run ID..."
              value={searchRunId}
              onChange={(e) => {
                setSearchRunId(e.target.value)
                setPage(0)
              }}
              className="bg-gray-950 border border-gray-800 hover:border-sky-500/50 text-gray-200 placeholder-gray-500 rounded-lg px-2.5 py-1.5 text-xs font-mono w-44 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Model / Keyword Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search model / text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-gray-950 border border-gray-800 hover:border-sky-500/50 text-gray-200 placeholder-gray-500 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-mono w-52 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Traces Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-950/60 text-[#8e94a0] font-mono text-[11px]">
                <th className="py-2.5 px-3 font-semibold">Time</th>
                <th className="py-2.5 px-3 font-semibold">Source</th>
                <th className="py-2.5 px-3 font-semibold">Model</th>
                <th className="py-2.5 px-3 font-semibold text-right">TTFT</th>
                <th className="py-2.5 px-3 font-semibold text-right">TPOT</th>
                <th className="py-2.5 px-3 font-semibold text-right">Total Latency</th>
                <th className="py-2.5 px-3 font-semibold text-right">Tokens</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-mono text-[11px]">
              {filteredTraces.length > 0 ? (
                filteredTraces.map((t) => {
                  const isSuccess = !t.error && t.finish_reason !== 'error' && t.finish_reason !== 'abort'
                  const timeStr = t.started_at
                    ? new Date(t.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : '—'

                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTrace(t)}
                      className="hover:bg-gray-800/50 cursor-pointer transition-colors group"
                    >
                      <td className="py-2.5 px-3 text-gray-400 whitespace-nowrap">{timeStr}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] border uppercase ${
                            t.source === 'benchmark'
                              ? 'bg-blue-950 text-blue-300 border-blue-800'
                              : t.source === 'load_test'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-purple-950 text-purple-300 border-purple-800'
                          }`}
                        >
                          {t.source}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-white font-medium truncate max-w-xs" title={t.model}>
                        {t.model}
                      </td>
                      <td className="py-2.5 px-3 text-right text-sky-400">
                        {t.ttft_ms != null ? `${t.ttft_ms.toFixed(1)} ms` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400">
                        {t.tpot_ms != null ? `${t.tpot_ms.toFixed(1)} ms` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-200">
                        {t.total_latency_ms != null ? `${t.total_latency_ms.toFixed(1)} ms` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-400">
                        {t.prompt_tokens ?? 0} in / {t.completion_tokens ?? 0} out
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] border ${
                            isSuccess
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-red-500/10 border-red-500/30 text-red-400'
                          }`}
                        >
                          {isSuccess ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
                          <span>{t.finish_reason || (isSuccess ? 'stop' : 'error')}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-sky-400 group-hover:underline text-[11px]">
                          Inspect →
                        </span>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-gray-500">
                    {loading ? (
                      <div className="flex items-center justify-center space-x-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                        <span>Loading request traces...</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div>No request traces recorded yet.</div>
                        <div className="text-[11px] text-gray-600">
                          Run a benchmark or load test to stream individual request traces.
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3 border-t border-gray-800 bg-gray-950/60 flex items-center justify-between text-xs font-mono text-[#8e94a0]">
          <span>
            Showing {filteredTraces.length} of {totalCount} total traces
          </span>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page + 1 >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Slide-Out Inspector Drawer */}
      <TraceDrawer
        isOpen={Boolean(selectedTrace)}
        onClose={() => setSelectedTrace(null)}
        trace={selectedTrace}
      />
    </div>
  )
}

export default Traces
