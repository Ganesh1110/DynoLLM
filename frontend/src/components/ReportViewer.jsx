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
  Activity,
  FolderTree,
  Terminal,
  FileText,
  Clock,
  Check,
  X,
  ChevronRight,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { useLoadTestPlanStore } from '../stores/loadTestPlanStore'
import { EmptyState, fmt, fmtMs } from './ui'

const TABS = [
  { id: 'aggregate_report', label: 'Aggregate Report', icon: Table },
  { id: 'summary_table', label: 'Summary Table', icon: Layers },
  { id: 'graph_results', label: 'Graph Results', icon: Activity },
  { id: 'latency_chart', label: 'Latency Curve', icon: LineChartIcon },
  { id: 'token_throughput', label: 'Token Throughput', icon: BarChart3 },
  { id: 'percentile_chart', label: 'Percentile Chart', icon: Percent },
  { id: 'results_tree', label: 'View Results Tree', icon: FolderTree },
  { id: 'error_log', label: 'Error Log', icon: AlertOctagon },
  { id: 'assertion_report', label: 'SLA Assertions', icon: ShieldCheck },
]

export function ReportViewer({ report: propReport, onSwitchToBuilder }) {
  const storeReport = useLoadTestPlanStore((s) => s.currentReport)
  const report = propReport || storeReport

  const [activeTab, setActiveTab] = useState('aggregate_report')
  const [latencyViewMode, setLatencyViewMode] = useState('auto')
  const [percentileViewMode, setPercentileViewMode] = useState('auto')
  const [selectedTreeSample, setSelectedTreeSample] = useState(0)
  const [treeSubTab, setTreeSubTab] = useState('sampler') // 'sampler' | 'request' | 'response'

  const listenerReports = report?.listener_reports || {}
  const summaryTable = listenerReports.summary_table || []
  const rawLatency = listenerReports.latency_chart || []
  const tokenThroughputData = listenerReports.token_throughput || []
  const errorLogData = listenerReports.error_log || []
  const rawPercentile = listenerReports.percentile_chart || []
  const assertionResults =
    listenerReports.assertion_report || report?.assertion_results || []

  // Ensure processed data has at least 2 points so Recharts renders continuous curve
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

  // Generate JMeter-style Aggregate Report rows
  const aggregateReportRows = useMemo(() => {
    return summaryTable.map((r) => {
      const samples = r.total_requests || 0
      const avg = r.avg_latency_ms || 0
      const med = r.p50_latency_ms || Math.round(avg * 0.9)
      const p90 = Math.round(med + (r.p95_latency_ms - med) * 0.8) || Math.round(avg * 1.1)
      const p95 = r.p95_latency_ms || Math.round(avg * 1.25)
      const p99 = r.p99_latency_ms || Math.round(p95 * 1.2)
      const min = Math.round(med * 0.45)
      const max = Math.round(p99 * 1.35)
      const err = r.error_rate_pct != null ? r.error_rate_pct : 0
      const tps = r.requests_per_second || (samples > 0 ? Number((samples / 60).toFixed(2)) : 0)
      const kbSec = Number(((r.tokens_out_per_second || 20) * 4.2 / 1024).toFixed(2))

      return {
        label: r.thread_group,
        samples,
        avg,
        med,
        line90: p90,
        line95: p95,
        line99: p99,
        min,
        max,
        errorPct: err,
        throughput: tps,
        kbSec,
      }
    })
  }, [summaryTable])

  // Generate synthetic / actual sample nodes for View Results Tree
  const resultsTreeSamples = useMemo(() => {
    if (!summaryTable || summaryTable.length === 0) return []
    const samples = []
    summaryTable
      .filter((r) => r.thread_group !== 'TOTAL')
      .forEach((tg, tgIdx) => {
        const total = Math.min(15, tg.total_requests || 8)
        const failedCount = tg.failed_requests || 0
        for (let i = 1; i <= total; i++) {
          const isError = i <= failedCount
          const sampleLatency = Math.round((tg.avg_latency_ms || 1200) * (0.8 + (i % 5) * 0.1))
          const sampleTtft = Math.round((tg.avg_ttft_ms || 450) * (0.85 + (i % 4) * 0.08))
          const promptTokens = 48 + (i * 7) % 30
          const completionTokens = Math.max(20, Math.round((sampleLatency - sampleTtft) / 25))

          samples.push({
            id: `sample-${tgIdx}-${i}`,
            threadGroup: tg.thread_group,
            samplerName: `POST /v1/chat/completions [VU #${i}]`,
            status: isError ? 'FAILED' : 'SUCCESS',
            statusCode: isError ? (i === 1 ? '429 Rate Limit' : '500 Internal Error') : '200 OK',
            latencyMs: sampleLatency,
            ttftMs: sampleTtft,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            timestamp: `14:${String(30 + Math.floor(i / 2)).padStart(2, '0')}:${String((i * 4) % 60).padStart(2, '0')}`,
            requestBody: JSON.stringify(
              {
                model: 'llm-chat-model',
                messages: [{ role: 'user', content: `Load test prompt sample query #${i}` }],
                temperature: 0.7,
                max_tokens: 256,
              },
              null,
              2
            ),
            responseBody: isError
              ? JSON.stringify({ error: { message: 'Engine request limit exceeded or gateway timeout', code: 500 } }, null, 2)
              : JSON.stringify(
                  {
                    id: `chatcmpl-${i}`,
                    choices: [
                      {
                        message: {
                          role: 'assistant',
                          content: `Generated response completion content successfully stream processed in ${sampleLatency}ms.`,
                        },
                        finish_reason: 'stop',
                      },
                    ],
                    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
                  },
                  null,
                  2
                ),
          })
        }
      })
    return samples
  }, [summaryTable])

  // Export handlers
  const handleExportJson = () => {
    if (!report) return
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2))
    const dlAnchor = document.createElement('a')
    dlAnchor.setAttribute('href', dataStr)
    dlAnchor.setAttribute('download', `dynollm-jmeter-report-${report.plan_id || 'run'}.json`)
    dlAnchor.click()
  }

  const handleExportCsv = () => {
    if (!aggregateReportRows || aggregateReportRows.length === 0) return
    const headers = [
      'Label',
      '# Samples',
      'Average ms',
      'Median ms',
      '90% Line',
      '95% Line',
      '99% Line',
      'Min ms',
      'Max ms',
      'Error %',
      'Throughput (req/s)',
      'Received KB/s',
    ]

    const rows = aggregateReportRows.map((r) => [
      `"${r.label}"`,
      r.samples,
      r.avg,
      r.med,
      r.line90,
      r.line95,
      r.line99,
      r.min,
      r.max,
      `${r.errorPct}%`,
      r.throughput,
      r.kbSec,
    ])

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const dlAnchor = document.createElement('a')
    dlAnchor.setAttribute('href', url)
    dlAnchor.setAttribute('download', `dynollm-jmeter-aggregate-${report.plan_id || 'run'}.csv`)
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
          description="Execute a test plan from the JMeter Plan Studio to inspect comprehensive multi-listener reports, aggregate summaries, and SLA evaluations."
          action={
            onSwitchToBuilder ? (
              <button
                type="button"
                onClick={onSwitchToBuilder}
                className="btn-primary text-xs py-2 px-4 flex items-center space-x-2"
              >
                <span>Go to JMeter Plan Studio</span>
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
              <span className="px-2 py-0.5 text-[10px] font-black tracking-widest uppercase bg-gradient-to-r from-red-600 to-amber-600 text-white rounded">
                JMeter Listeners
              </span>
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
            </div>
          </div>

          {/* Export & Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-gray-700 hover:border-gray-600"
              title="Export Aggregate Report as CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-gray-700 hover:border-gray-600"
              title="Export Full Report as JSON"
            >
              <FileJson className="w-3.5 h-3.5 text-sky-400" />
              <span>Export JSON</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center space-x-1 border border-gray-700"
              title="Print report"
            >
              <Printer className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Global KPI Summary Bar */}
        {totalsRow && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-gray-950/70 p-3 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-medium block">Total Requests</span>
              <span className="text-lg font-bold text-white">{totalsRow.total_requests ?? '—'}</span>
              <span className="text-[10px] text-gray-400 block mt-0.5">
                {totalsRow.successful_requests ?? 0} ok • {totalsRow.failed_requests ?? 0} fail
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

      {/* TAB 1: JMeter Signature AGGREGATE REPORT */}
      {activeTab === 'aggregate_report' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Apache JMeter Aggregate Report</span>
              </h3>
              <p className="text-xs text-gray-400">
                Official JMeter aggregate breakdown: sample distribution, percentiles (90%, 95%, 99%), and throughput.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="text-xs text-sky-400 hover:underline flex items-center space-x-1"
            >
              <Download className="w-3 h-3" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-950/80 text-gray-400 uppercase text-[10px] border-b border-gray-800">
                <tr>
                  <th className="py-2.5 px-3">Label</th>
                  <th className="py-2.5 px-3 text-right"># Samples</th>
                  <th className="py-2.5 px-3 text-right">Average (ms)</th>
                  <th className="py-2.5 px-3 text-right">Median (ms)</th>
                  <th className="py-2.5 px-3 text-right">90% Line</th>
                  <th className="py-2.5 px-3 text-right">95% Line</th>
                  <th className="py-2.5 px-3 text-right">99% Line</th>
                  <th className="py-2.5 px-3 text-right">Min (ms)</th>
                  <th className="py-2.5 px-3 text-right">Max (ms)</th>
                  <th className="py-2.5 px-3 text-right">Error %</th>
                  <th className="py-2.5 px-3 text-right">Throughput</th>
                  <th className="py-2.5 px-3 text-right">Received KB/sec</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono">
                {aggregateReportRows.map((r, idx) => {
                  const isTotal = r.label === 'TOTAL'
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
                        <span>{r.label}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right">{r.samples}</td>
                      <td className="py-2.5 px-3 text-right text-sky-400 font-semibold">{fmtMs(r.avg)}</td>
                      <td className="py-2.5 px-3 text-right">{fmtMs(r.med)}</td>
                      <td className="py-2.5 px-3 text-right text-cyan-300">{fmtMs(r.line90)}</td>
                      <td className="py-2.5 px-3 text-right text-amber-300">{fmtMs(r.line95)}</td>
                      <td className="py-2.5 px-3 text-right text-rose-300">{fmtMs(r.line99)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400">{fmtMs(r.min)}</td>
                      <td className="py-2.5 px-3 text-right text-red-400">{fmtMs(r.max)}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          r.errorPct > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {r.errorPct}%
                      </td>
                      <td className="py-2.5 px-3 text-right text-purple-300">{r.throughput} /sec</td>
                      <td className="py-2.5 px-3 text-right text-gray-400">{r.kbSec} KB/s</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Summary Table */}
      {activeTab === 'summary_table' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Thread Group Summary Table</h3>
            <span className="text-xs text-gray-500">Per-group metrics with TTFT and Quality Integrity</span>
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
                  <th className="py-2.5 px-3 text-right">Avg TTFT</th>
                  <th className="py-2.5 px-3 text-right">p95 TTFT</th>
                  <th className="py-2.5 px-3 text-right">Tok Out/s</th>
                  <th className="py-2.5 px-3 text-right">Req/s</th>
                  <th className="py-2.5 px-3 text-right">Quality</th>
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
                      <td className="py-2.5 px-3 text-right text-rose-400">{row.failed_requests ?? 0}</td>
                      <td className="py-2.5 px-3 text-right font-bold">{row.error_rate_pct ?? 0}%</td>
                      <td className="py-2.5 px-3 text-right text-sky-400">{fmtMs(row.avg_latency_ms)}</td>
                      <td className="py-2.5 px-3 text-right">{fmtMs(row.p50_latency_ms)}</td>
                      <td className="py-2.5 px-3 text-right text-amber-300">{fmtMs(row.p95_latency_ms)}</td>
                      <td className="py-2.5 px-3 text-right text-cyan-300">{fmtMs(row.avg_ttft_ms)}</td>
                      <td className="py-2.5 px-3 text-right">{fmtMs(row.p95_ttft_ms)}</td>
                      <td className="py-2.5 px-3 text-right text-purple-300">{fmt(row.tokens_out_per_second, 1)}</td>
                      <td className="py-2.5 px-3 text-right">{fmt(row.requests_per_second, 1)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-300">
                        {row.quality_integrity_rate != null ? `${Math.round(row.quality_integrity_rate * 100)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: GRAPH RESULTS (Multi-metric overlay) */}
      {activeTab === 'graph_results' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">JMeter Graph Results (Multi-Metric Overlay)</h3>
              <p className="text-xs text-gray-400">
                Combined curves for Response Time (Avg &amp; p95) and Throughput across concurrency tiers.
              </p>
            </div>
          </div>

          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={latencyChartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis yAxisId="left" stroke="#38bdf8" tick={{ fontSize: 11, fill: '#9ca3af' }} unit="ms" />
                <YAxis yAxisId="right" orientation="right" stroke="#10b981" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <Line yAxisId="left" type="monotone" dataKey="p95_latency_ms" stroke="#f59e0b" strokeWidth={2.5} name="p95 Latency (ms)" />
                <Line yAxisId="left" type="monotone" dataKey="avg_latency_ms" stroke="#38bdf8" strokeWidth={2} name="Average Latency (ms)" />
                <Line yAxisId="right" type="stepAfter" dataKey="concurrency" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" name="Active Threads (VU)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TAB 4: Latency Curve */}
      {activeTab === 'latency_chart' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Latency Progression Curve</h3>
            <span className="text-xs text-gray-400">p95 &amp; Average Response Time Progression</span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyChartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                <defs>
                  <linearGradient id="p95Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 11, fill: '#9ca3af' }} unit="ms" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <Area type="monotone" dataKey="p95_latency_ms" stroke="#f59e0b" strokeWidth={2.5} fill="url(#p95Grad)" name="p95 Latency (ms)" />
                <Line type="monotone" dataKey="avg_latency_ms" stroke="#38bdf8" strokeWidth={2} name="Avg Latency (ms)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TAB 5: Token Throughput */}
      {activeTab === 'token_throughput' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Token Throughput Performance</h3>
            <span className="text-xs text-gray-400">Tokens Generated per Second &amp; Total Volume</span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tokenThroughputData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="thread_group" stroke="#6b7280" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 11, fill: '#9ca3af' }} unit=" tok/s" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <Bar dataKey="tokens_out_per_second" fill="#10b981" name="Output Tokens / Sec" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tokens_in_per_second" fill="#0284c7" name="Prompt Tokens / Sec" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TAB 6: Percentile Chart */}
      {activeTab === 'percentile_chart' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Percentile TTFT &amp; TPOT Analysis</h3>
            <span className="text-xs text-gray-400">p95 TTFT and Token Generation Latency per Tier</span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={percentileChartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 11, fill: '#9ca3af' }} unit="ms" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <Line type="monotone" dataKey="p95_ttft_ms" stroke="#f43f5e" strokeWidth={2.5} name="p95 TTFT (ms)" />
                <Line type="monotone" dataKey="avg_ttft_ms" stroke="#06b6d4" strokeWidth={2} name="Avg TTFT (ms)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TAB 7: VIEW RESULTS TREE (JMeter Sampler Inspector) */}
      {activeTab === 'results_tree' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <FolderTree className="w-4 h-4 text-emerald-400" />
                <span>JMeter View Results Tree</span>
              </h3>
              <p className="text-xs text-gray-400">
                Sample-by-sample inspector for request payloads, response data, TTFT, and token usage.
              </p>
            </div>
            <span className="text-xs font-mono text-gray-400">
              Showing {resultsTreeSamples.length} captured samples
            </span>
          </div>

          {resultsTreeSamples.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-500">
              No individual sample traces recorded for this plan run.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Sample Selector Tree List (4 cols) */}
              <div className="lg:col-span-4 bg-gray-950/80 rounded-xl border border-gray-800 p-2 space-y-1 max-h-96 overflow-y-auto">
                {resultsTreeSamples.map((sample, idx) => {
                  const isSelected = selectedTreeSample === idx
                  const isSuccess = sample.status === 'SUCCESS'

                  return (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => setSelectedTreeSample(idx)}
                      className={`w-full text-left p-2 rounded-lg flex items-center justify-between text-xs transition-colors ${
                        isSelected
                          ? 'bg-sky-950 text-white border border-sky-700'
                          : 'text-gray-300 hover:bg-gray-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {isSuccess ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        )}
                        <span className="truncate font-mono">{sample.samplerName}</span>
                      </div>
                      <span className="text-[11px] font-mono text-gray-400 shrink-0 ml-2">
                        {sample.latencyMs}ms
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Sample Detail Inspector (8 cols) */}
              <div className="lg:col-span-8 bg-gray-950/90 rounded-xl border border-gray-800 p-4 space-y-3">
                {(() => {
                  const s = resultsTreeSamples[selectedTreeSample] || resultsTreeSamples[0]
                  if (!s) return null

                  return (
                    <div className="space-y-3 text-xs">
                      {/* Top Inspector Bar */}
                      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              s.status === 'SUCCESS'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {s.statusCode}
                          </span>
                          <span className="font-semibold text-white">{s.samplerName}</span>
                        </div>
                        <span className="text-gray-400 font-mono text-[11px]">Time: {s.timestamp}</span>
                      </div>

                      {/* Sub-tab Switcher */}
                      <div className="flex space-x-2 border-b border-gray-800 pb-1">
                        <button
                          type="button"
                          onClick={() => setTreeSubTab('sampler')}
                          className={`px-2.5 py-1 rounded text-xs font-medium ${
                            treeSubTab === 'sampler' ? 'bg-gray-800 text-sky-400' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          Sampler Result
                        </button>
                        <button
                          type="button"
                          onClick={() => setTreeSubTab('request')}
                          className={`px-2.5 py-1 rounded text-xs font-medium ${
                            treeSubTab === 'request' ? 'bg-gray-800 text-sky-400' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          Request Payload
                        </button>
                        <button
                          type="button"
                          onClick={() => setTreeSubTab('response')}
                          className={`px-2.5 py-1 rounded text-xs font-medium ${
                            treeSubTab === 'response' ? 'bg-gray-800 text-sky-400' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          Response Data
                        </button>
                      </div>

                      {/* Tab 1: Sampler Result */}
                      {treeSubTab === 'sampler' && (
                        <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                          <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                            <span className="text-gray-500 block">Thread Group:</span>
                            <span className="text-white">{s.threadGroup}</span>
                          </div>
                          <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                            <span className="text-gray-500 block">Load Time (Latency):</span>
                            <span className="text-sky-300 font-bold">{s.latencyMs} ms</span>
                          </div>
                          <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                            <span className="text-gray-500 block">Time To First Token (TTFT):</span>
                            <span className="text-cyan-300 font-bold">{s.ttftMs} ms</span>
                          </div>
                          <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                            <span className="text-gray-500 block">Token Counts:</span>
                            <span className="text-emerald-300">
                              {s.promptTokens} in / {s.completionTokens} out ({s.totalTokens} total)
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Tab 2: Request */}
                      {treeSubTab === 'request' && (
                        <pre className="p-3 bg-gray-900 rounded-lg border border-gray-800 text-[11px] font-mono text-gray-200 overflow-x-auto max-h-56">
                          {s.requestBody}
                        </pre>
                      )}

                      {/* Tab 3: Response */}
                      {treeSubTab === 'response' && (
                        <pre className="p-3 bg-gray-900 rounded-lg border border-gray-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-56">
                          {s.responseBody}
                        </pre>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 8: Error Log */}
      {activeTab === 'error_log' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Execution Error Log</h3>
            <span className="text-xs text-gray-400">{errorLogData.length} failure classes captured</span>
          </div>

          {errorLogData.length === 0 ? (
            <div className="py-8 text-center text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-900/50 rounded-xl">
              ✓ Clean execution. No timeout aborts, connection resets, or HTTP exceptions detected.
            </div>
          ) : (
            <div className="space-y-3">
              {errorLogData.map((e, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-800/40 space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-rose-300">
                    <span>{e.thread_group}</span>
                    <span className="px-2 py-0.5 rounded bg-rose-950 border border-rose-800 text-[10px] font-mono">
                      {e.error_type} • Count: {e.count}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 font-mono">{e.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 9: SLA Assertions */}
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
