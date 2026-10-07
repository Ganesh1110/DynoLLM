import React, { useState, useMemo } from 'react'
import {
  Table,
  LineChart as LineChartIcon,
  BarChart3,
  AlertOctagon,
  Percent,
  ShieldCheck,
  Download,
  Printer,
  CheckCircle2,
  XCircle,
  FileJson,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  TrendingUp,
  Cpu,
  Zap,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { useLoadTestPlanStore } from '../stores/loadTestPlanStore'
import { EmptyState, fmt, fmtMs } from './ui'

const TABS = [
  { id: 'summary_table', label: 'Summary Table', icon: Table },
  { id: 'latency_chart', label: 'Latency Chart', icon: LineChartIcon },
  { id: 'token_throughput', label: 'Token Throughput', icon: BarChart3 },
  { id: 'error_log', label: 'Error Log', icon: AlertOctagon },
  { id: 'percentile_chart', label: 'Percentile Chart', icon: Percent },
  { id: 'assertion_report', label: 'SLA Assertions', icon: ShieldCheck },
]

export function ReportViewer({ report: propReport, onSwitchToBuilder }) {
  const storeReport = useLoadTestPlanStore((s) => s.currentReport)
  const report = propReport || storeReport

  const [activeTab, setActiveTab] = useState('summary_table')
  const [latencyViewMode, setLatencyViewMode] = useState('auto')
  const [percentileViewMode, setPercentileViewMode] = useState('auto')

  const listenerReports = report?.listener_reports || {}
  const summaryTable = listenerReports.summary_table || []
  const rawLatency = listenerReports.latency_chart || []
  const tokenThroughputData = listenerReports.token_throughput || []
  const errorLogData = listenerReports.error_log || []
  const rawPercentile = listenerReports.percentile_chart || []
  const assertionResults =
    listenerReports.assertion_report || report?.assertion_results || []

  // Ensure processed data has at least 2 points so Recharts renders a continuous curve
  const latencyChartData = useMemo(() => {
    if (!rawLatency || rawLatency.length === 0) return []
    if (rawLatency.length === 1) {
      const single = rawLatency[0]
      return [
        {
          ...single,
          time: '00:00',
          elapsed_s: 0,
          concurrency: 0,
          avg_latency_ms: single.avg_latency_ms,
          p95_latency_ms: single.p95_latency_ms,
        },
        single,
      ]
    }
    return rawLatency
  }, [rawLatency])

  const percentileChartData = useMemo(() => {
    if (!rawPercentile || rawPercentile.length === 0) return []
    if (rawPercentile.length === 1) {
      const single = rawPercentile[0]
      return [
        {
          ...single,
          time: '00:00',
          elapsed_s: 0,
          concurrency: 0,
          p95_ttft_ms: single.p95_ttft_ms,
          avg_ttft_ms: single.avg_ttft_ms,
          avg_tpot_ms: single.avg_tpot_ms,
        },
        single,
      ]
    }
    return rawPercentile
  }, [rawPercentile])

  const latencyHasTime = useMemo(
    () => latencyChartData.some((d) => d.time != null && d.time !== ''),
    [latencyChartData]
  )
  const latencyEffectiveXAxis = latencyViewMode === 'auto' ? (latencyHasTime ? 'time' : 'concurrency') : latencyViewMode

  const percentileHasTime = useMemo(
    () => percentileChartData.some((d) => d.time != null && d.time !== ''),
    [percentileChartData]
  )
  const percentileEffectiveXAxis = percentileViewMode === 'auto' ? (percentileHasTime ? 'time' : 'concurrency') : percentileViewMode

  // Check how many assertions passed
  const assertionSummary = useMemo(() => {
    if (!assertionResults || assertionResults.length === 0) return null
    const total = assertionResults.length
    const passed = assertionResults.filter((a) => a.passed).length
    return {
      total,
      passed,
      failed: total - passed,
      rate: Math.round((passed / total) * 100),
    }
  }, [assertionResults])

  // Extract totals row or calculate overall KPIs
  const totalsRow = useMemo(() => {
    if (!summaryTable || summaryTable.length === 0) return null
    const found = summaryTable.find((r) => r.thread_group === 'TOTAL')
    return found || summaryTable[0]
  }, [summaryTable])

  // Export handlers
  const handleExportJson = () => {
    if (!report) return
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2))
    const dlAnchor = document.createElement('a')
    dlAnchor.setAttribute('href', dataStr)
    dlAnchor.setAttribute('download', `dynollm-plan-report-${report.plan_id || 'run'}.json`)
    dlAnchor.click()
  }

  const handleExportCsv = () => {
    if (!summaryTable || summaryTable.length === 0) return
    const headers = [
      'Thread Group',
      'Total Requests',
      'Successful Requests',
      'Failed Requests',
      'Error Rate (%)',
      'Avg Latency (ms)',
      'p50 Latency (ms)',
      'p95 Latency (ms)',
      'p99 Latency (ms)',
      'Avg TTFT (ms)',
      'p95 TTFT (ms)',
      'Tokens Out / Sec',
      'Requests / Sec',
      'Quality Integrity',
    ]

    const rows = summaryTable.map((r) => [
      `"${r.thread_group || ''}"`,
      r.total_requests ?? '',
      r.successful_requests ?? '',
      r.failed_requests ?? '',
      r.error_rate_pct ?? '',
      r.avg_latency_ms ?? '',
      r.p50_latency_ms ?? '',
      r.p95_latency_ms ?? '',
      r.p99_latency_ms ?? '',
      r.avg_ttft_ms ?? '',
      r.p95_ttft_ms ?? '',
      r.tokens_out_per_second ?? '',
      r.requests_per_second ?? '',
      r.quality_integrity_rate ?? '',
    ])

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const dlAnchor = document.createElement('a')
    dlAnchor.setAttribute('href', url)
    dlAnchor.setAttribute('download', `dynollm-plan-summary-${report.plan_id || 'run'}.csv`)
    dlAnchor.click()
  }

  const handlePrint = () => {
    window.print()
  }

  if (!report) {
    return (
      <div className="card">
        <EmptyState
          icon={Layers}
          title="No Test Plan Reports Available"
          description="Execute a test plan from the JMeter Plan Builder to view comprehensive multi-listener reports and SLA evaluations."
          action={
            onSwitchToBuilder ? (
              <button
                type="button"
                onClick={onSwitchToBuilder}
                className="btn-primary text-xs py-2 px-4 flex items-center space-x-2"
              >
                <span>Go to Plan Builder</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : null
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="card space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-gray-800">
          <div>
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-bold text-white">Load Test Plan Execution Report</h2>
              {/* Pass/Fail Status Badge */}
              {report.overall_passed ? (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-600/60 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>ALL SLAS PASSED</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-600/60 shadow-sm">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  <span>SLA BREACH DETECTED</span>
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3 text-xs text-gray-400 mt-1 font-mono">
              <span>Plan ID: {report.plan_id || 'Ad-hoc Execution'}</span>
              {report.run_ids && report.run_ids.length > 0 && (
                <>
                  <span>•</span>
                  <span>{report.run_ids.length} Thread Group Runs</span>
                </>
              )}
              {report.completed_at && (
                <>
                  <span>•</span>
                  <span>Completed: {new Date(report.completed_at).toLocaleTimeString()}</span>
                </>
              )}
            </div>
          </div>

          {/* Export Actions */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleExportJson}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-gray-700"
              title="Download entire report as JSON"
            >
              <FileJson className="w-3.5 h-3.5 text-sky-400" />
              <span>JSON</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-gray-700"
              title="Download summary table as CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-gray-700"
              title="Print report or export to PDF"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-400" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* High-Level KPIs Row */}
        {totalsRow && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
            <div className="bg-gray-950/70 p-3 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-medium block">Total Requests</span>
              <span className="text-lg font-bold text-white">{totalsRow.total_requests ?? '—'}</span>
              <span className="text-[10px] text-gray-400 block mt-0.5">
                {totalsRow.successful_requests ?? 0} OK • {totalsRow.failed_requests ?? 0} Err
              </span>
            </div>

            <div className="bg-gray-950/70 p-3 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-medium block">Error Rate</span>
              <span
                className={`text-lg font-bold ${
                  (totalsRow.error_rate_pct || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {totalsRow.error_rate_pct != null ? `${totalsRow.error_rate_pct}%` : '0%'}
              </span>
              <span className="text-[10px] text-gray-400 block mt-0.5">
                {(totalsRow.error_rate_pct || 0) <= 5 ? 'Within normal SLA' : 'Degraded reliability'}
              </span>
            </div>

            <div className="bg-gray-950/70 p-3 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-medium block">Avg Latency</span>
              <span className="text-lg font-bold text-sky-400">{fmtMs(totalsRow.avg_latency_ms)}</span>
              <span className="text-[10px] text-gray-400 block mt-0.5">p95: {fmtMs(totalsRow.p95_latency_ms)}</span>
            </div>

            <div className="bg-gray-950/70 p-3 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-medium block">Avg TTFT</span>
              <span className="text-lg font-bold text-cyan-400">{fmtMs(totalsRow.avg_ttft_ms)}</span>
              <span className="text-[10px] text-gray-400 block mt-0.5">p95: {fmtMs(totalsRow.p95_ttft_ms)}</span>
            </div>

            <div className="bg-gray-950/70 p-3 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-medium block">Throughput</span>
              <span className="text-lg font-bold text-purple-400">
                {totalsRow.tokens_out_per_second ? `${fmt(totalsRow.tokens_out_per_second, 1)} t/s` : '—'}
              </span>
              <span className="text-[10px] text-gray-400 block mt-0.5">
                {fmt(totalsRow.requests_per_second, 1)} req/s
              </span>
            </div>

            <div className="bg-gray-950/70 p-3 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-medium block">SLA Compliance</span>
              <span
                className={`text-lg font-bold ${
                  assertionSummary?.failed === 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {assertionSummary ? `${assertionSummary.passed}/${assertionSummary.total}` : 'N/A'}
              </span>
              <span className="text-[10px] text-gray-400 block mt-0.5">
                {assertionSummary ? `${assertionSummary.rate}% met` : 'No assertions'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center space-x-1 border-b border-gray-800 pb-2 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          let badgeCount = null
          if (tab.id === 'error_log' && errorLogData.length > 0) {
            badgeCount = errorLogData.reduce((sum, e) => sum + (e.count || 1), 0)
          } else if (tab.id === 'assertion_report' && assertionResults.length > 0) {
            badgeCount = `${assertionResults.filter((a) => a.passed).length}/${assertionResults.length}`
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {badgeCount && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    tab.id === 'error_log'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {badgeCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* TAB CONTENT */}

      {/* 1. Summary Table */}
      {activeTab === 'summary_table' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Aggregate Summary Table</h3>
            <span className="text-xs text-gray-500">Per-group metrics and overall total aggregation</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-950/80 text-gray-400 uppercase text-[10px] border-b border-gray-800">
                <tr>
                  <th className="py-2.5 px-3">Thread Group</th>
                  <th className="py-2.5 px-3 text-right">Total Req</th>
                  <th className="py-2.5 px-3 text-right">OK</th>
                  <th className="py-2.5 px-3 text-right">Failed</th>
                  <th className="py-2.5 px-3 text-right">Error %</th>
                  <th className="py-2.5 px-3 text-right">Avg Latency</th>
                  <th className="py-2.5 px-3 text-right">p50</th>
                  <th className="py-2.5 px-3 text-right">p95</th>
                  <th className="py-2.5 px-3 text-right">p99</th>
                  <th className="py-2.5 px-3 text-right">Avg TTFT</th>
                  <th className="py-2.5 px-3 text-right">p95 TTFT</th>
                  <th className="py-2.5 px-3 text-right">Tok Out/s</th>
                  <th className="py-2.5 px-3 text-right">Req/s</th>
                  <th className="py-2.5 px-3 text-right">Quality</th>
                  <th className="py-2.5 px-3 text-right">Safe VU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono">
                {summaryTable.map((row, idx) => {
                  const isTotal = row.thread_group === 'TOTAL'
                  return (
                    <tr
                      key={idx}
                      className={
                        isTotal
                          ? 'bg-sky-950/40 border-t-2 border-sky-600 font-semibold text-white'
                          : 'hover:bg-gray-800/30 text-gray-300'
                      }
                    >
                      <td className="py-2.5 px-3 font-sans font-medium text-white flex items-center space-x-1.5">
                        {isTotal && <span className="text-sky-400">∑</span>}
                        <span>{row.thread_group}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right">{row.total_requests ?? '—'}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400">{row.successful_requests ?? '—'}</td>
                      <td
                        className={`py-2.5 px-3 text-right ${
                          (row.failed_requests || 0) > 0 ? 'text-rose-400 font-bold' : 'text-gray-500'
                        }`}
                      >
                        {row.failed_requests ?? 0}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right ${
                          (row.error_rate_pct || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {row.error_rate_pct != null ? `${row.error_rate_pct}%` : '0%'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-sky-300">{fmtMs(row.avg_latency_ms)}</td>
                      <td className="py-2.5 px-3 text-right">{fmtMs(row.p50_latency_ms)}</td>
                      <td className="py-2.5 px-3 text-right text-amber-300">{fmtMs(row.p95_latency_ms)}</td>
                      <td className="py-2.5 px-3 text-right">{fmtMs(row.p99_latency_ms)}</td>
                      <td className="py-2.5 px-3 text-right text-cyan-300">{fmtMs(row.avg_ttft_ms)}</td>
                      <td className="py-2.5 px-3 text-right">{fmtMs(row.p95_ttft_ms)}</td>
                      <td className="py-2.5 px-3 text-right text-purple-300">
                        {row.tokens_out_per_second ? fmt(row.tokens_out_per_second, 1) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {row.requests_per_second ? fmt(row.requests_per_second, 1) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {row.quality_integrity_rate != null ? `${Math.round(row.quality_integrity_rate * 100)}%` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-indigo-300 font-bold">
                        {row.safe_max_concurrency ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Latency Chart */}
      {activeTab === 'latency_chart' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">Latency Progression Curve</h3>
              <span className="text-xs text-gray-500">
                {latencyEffectiveXAxis === 'time'
                  ? 'Response time over test timeline (JMeter Response Time Over Time)'
                  : 'Average & p95 latency across concurrent user tiers'}
              </span>
            </div>

            {/* Axis Switcher Toggle */}
            <div className="flex items-center space-x-1 bg-gray-950 p-0.5 rounded-lg border border-gray-800 text-[11px] self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setLatencyViewMode('time')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  latencyEffectiveXAxis === 'time'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Over Time (Timeline)
              </button>
              <button
                type="button"
                onClick={() => setLatencyViewMode('concurrency')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  latencyEffectiveXAxis === 'concurrency'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                By Concurrency (VU)
              </button>
            </div>
          </div>

          {latencyChartData.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500">No latency progression data recorded.</div>
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latencyChartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey={latencyEffectiveXAxis}
                    stroke="#6b7280"
                    label={{
                      value: latencyEffectiveXAxis === 'time' ? 'Timeline (mm:ss)' : 'Concurrent Users (VU)',
                      position: 'insideBottom',
                      offset: -5,
                      fill: '#9ca3af',
                    }}
                  />
                  <YAxis
                    stroke="#6b7280"
                    label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem' }}
                    labelStyle={{ color: '#e5e7eb', fontWeight: 'bold' }}
                    formatter={(val, name) => [
                      `${fmt(val, 0)} ms`,
                      name === 'avg_latency_ms' ? 'Avg Latency' : 'p95 Latency',
                    ]}
                    labelFormatter={(val) =>
                      latencyEffectiveXAxis === 'time' ? `Time: ${val}` : `${val} Concurrent Users`
                    }
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    connectNulls={true}
                    type="monotone"
                    dataKey="avg_latency_ms"
                    name="Avg Latency"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    connectNulls={true}
                    type="monotone"
                    dataKey="p95_latency_ms"
                    name="p95 Latency"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* 3. Token Throughput */}
      {activeTab === 'token_throughput' && (
        <div className="card space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Token Throughput Breakdown</h3>
            <span className="text-xs text-gray-500">Input (prompt) vs output (generation) speeds</span>
          </div>

          {tokenThroughputData.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500">No token throughput data recorded.</div>
          ) : (
            <div className="space-y-6">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tokenThroughputData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="thread_group" stroke="#6b7280" />
                    <YAxis
                      stroke="#6b7280"
                      label={{ value: 'Tokens / Sec', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem' }}
                      formatter={(val, name) => [`${fmt(val, 1)} t/s`, name]}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="tokens_in_per_second" name="Input (Tokens/sec)" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="tokens_out_per_second" name="Output (Tokens/sec)" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total_tokens_per_second" name="Combined (Tokens/sec)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Token Totals Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {tokenThroughputData.map((item, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-gray-950/70 border border-gray-800 space-y-2">
                    <div className="font-semibold text-xs text-white border-b border-gray-800 pb-1">
                      {item.thread_group}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-gray-500 block">Prompt Tokens:</span>
                        <span className="text-gray-200">{item.total_prompt_tokens ?? '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 block">Completion Tokens:</span>
                        <span className="text-gray-200">{item.total_completion_tokens ?? '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 block">Total Tok/s:</span>
                        <span className="text-emerald-400">{fmt(item.total_tokens_per_second, 1)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 block">Input/Output Ratio:</span>
                        <span className="text-sky-300">
                          {item.input_token_ratio != null ? `${Math.round(item.input_token_ratio * 100)}%` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Error Log */}
      {activeTab === 'error_log' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Error &amp; Abort Diagnostic Log</h3>
            <span className="text-xs text-gray-500">Categorized runtime failures and timeout details</span>
          </div>

          {errorLogData.length === 0 ? (
            <div className="p-8 text-center bg-gray-950/60 rounded-xl border border-gray-800 flex flex-col items-center justify-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              <div className="text-sm font-semibold text-white">Zero Errors Encountered!</div>
              <p className="text-xs text-gray-400 max-w-sm">
                Every request across all thread groups completed with HTTP 200 and valid JSON schema.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {errorLogData.map((err, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/60 flex items-start justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-rose-950 text-rose-300 border border-rose-800">
                        {err.error_type}
                      </span>
                      <span className="font-semibold text-white">{err.thread_group}</span>
                    </div>
                    <div className="text-rose-200/90 font-mono text-[11px] mt-1">{err.message}</div>
                  </div>

                  <span className="px-2.5 py-1 rounded bg-rose-900/50 text-rose-200 font-mono text-xs whitespace-nowrap">
                    {err.count} occurrences
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Percentile Chart */}
      {activeTab === 'percentile_chart' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">TTFT &amp; TPOT Percentile Degradation</h3>
              <span className="text-xs text-gray-500">
                {percentileEffectiveXAxis === 'time'
                  ? 'TTFT & TPOT latency progression over test timeline'
                  : 'Latency variance across concurrency levels'}
              </span>
            </div>

            {/* Axis Switcher Toggle */}
            <div className="flex items-center space-x-1 bg-gray-950 p-0.5 rounded-lg border border-gray-800 text-[11px] self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setPercentileViewMode('time')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  percentileEffectiveXAxis === 'time'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Over Time (Timeline)
              </button>
              <button
                type="button"
                onClick={() => setPercentileViewMode('concurrency')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  percentileEffectiveXAxis === 'concurrency'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                By Concurrency (VU)
              </button>
            </div>
          </div>

          {percentileChartData.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500">No percentile chart data recorded.</div>
          ) : (
            <div className="space-y-6">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={percentileChartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis
                      dataKey={percentileEffectiveXAxis}
                      stroke="#6b7280"
                      label={{
                        value: percentileEffectiveXAxis === 'time' ? 'Timeline (mm:ss)' : 'Concurrency (VU)',
                        position: 'insideBottom',
                        offset: -5,
                        fill: '#9ca3af',
                      }}
                    />
                    <YAxis
                      stroke="#6b7280"
                      label={{ value: 'Time (ms)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem' }}
                      labelFormatter={(val) =>
                        percentileEffectiveXAxis === 'time' ? `Time: ${val}` : `${val} Concurrent Users`
                      }
                      formatter={(val, name) => [`${fmt(val, 1)} ms`, name]}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Line
                      connectNulls={true}
                      type="monotone"
                      dataKey="p95_ttft_ms"
                      name="p95 TTFT (ms)"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      connectNulls={true}
                      type="monotone"
                      dataKey="avg_ttft_ms"
                      name="Avg TTFT (ms)"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      connectNulls={true}
                      type="monotone"
                      dataKey="avg_tpot_ms"
                      name="Avg TPOT (ms/tok)"
                      stroke="#a855f7"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Concurrency / Progression table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-950/80 text-gray-400 uppercase text-[10px] border-b border-gray-800">
                    <tr>
                      <th className="py-2 px-3">Thread Group</th>
                      <th className="py-2 px-3 text-right">
                        {percentileEffectiveXAxis === 'time' ? 'Time' : 'Concurrency (VU)'}
                      </th>
                      <th className="py-2 px-3 text-right">p95 TTFT (ms)</th>
                      <th className="py-2 px-3 text-right">Avg TTFT (ms)</th>
                      <th className="py-2 px-3 text-right">Avg TPOT (ms/tok)</th>
                      <th className="py-2 px-3 text-right">Throughput (TPS)</th>
                      <th className="py-2 px-3 text-right">Error %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 font-mono">
                    {percentileChartData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-800/30 text-gray-300">
                        <td className="py-2 px-3 font-sans font-medium text-white">{row.thread_group}</td>
                        <td className="py-2 px-3 text-right font-bold text-sky-400">
                          {percentileEffectiveXAxis === 'time' ? row.time || `${row.elapsed_s}s` : row.concurrency}
                        </td>
                        <td className="py-2 px-3 text-right text-rose-300">{fmtMs(row.p95_ttft_ms)}</td>
                        <td className="py-2 px-3 text-right text-cyan-300">{fmtMs(row.avg_ttft_ms)}</td>
                        <td className="py-2 px-3 text-right text-purple-300">{fmt(row.avg_tpot_ms, 1)}</td>
                        <td className="py-2 px-3 text-right text-emerald-300">{fmt(row.tokens_per_second, 1)}</td>
                        <td className="py-2 px-3 text-right">
                          {row.error_rate_pct != null ? `${row.error_rate_pct}%` : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. SLA Assertions */}
      {activeTab === 'assertion_report' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">SLA Assertion Verification</h3>
            {assertionSummary && (
              <span className="text-xs font-mono text-gray-400">
                {assertionSummary.passed} of {assertionSummary.total} Passed ({assertionSummary.rate}%)
              </span>
            )}
          </div>

          {assertionResults.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-500">
              No SLA assertions were configured for this test plan.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {assertionResults.map((ar, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border space-y-2 ${
                    ar.passed
                      ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-200'
                      : 'bg-rose-950/20 border-rose-800/60 text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {ar.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      )}
                      <span className="font-semibold text-sm text-white">{ar.name}</span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                        ar.passed
                          ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
                          : 'bg-rose-900/60 text-rose-300 border border-rose-700'
                      }`}
                    >
                      {ar.passed ? 'PASSED' : 'BREACHED'}
                    </span>
                  </div>

                  <div className="text-xs font-mono pt-1 text-gray-300">{ar.message}</div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-gray-400 border-t border-gray-800/50 pt-2">
                    <div>
                      <span>Threshold: </span>
                      <span className="text-gray-200">{ar.threshold ?? '—'}</span>
                    </div>
                    <div>
                      <span>Actual Value: </span>
                      <span className={ar.passed ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold'}>
                        {ar.actual_value != null ? ar.actual_value : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
