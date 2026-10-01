import React from 'react'
import { Server, Clock, RefreshCw, Layers } from 'lucide-react'

export default function TelemetryControls({
  runtimes = [],
  activeRuntimeId,
  onSelectRuntime,
  activeWindow = '15m',
  onSelectWindow,
  lastPolledAt,
  isRefreshing,
  onManualRefresh,
  activeEngineType,
}) {
  const windowOptions = [
    { id: '5m', label: '5m' },
    { id: '15m', label: '15m' },
    { id: '1h', label: '1h' },
  ]

  const formatLastPolled = (ts) => {
    if (!ts) return 'Waiting for poll...'
    const d = new Date(ts * 1000)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="bg-[#181b1f] border border-[#22252b] rounded-sm p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
      {/* Left: Runtime Picker & Engine Badge */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center space-x-2 text-gray-300">
          <Server className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-white">Active Engine:</span>
        </div>

        {runtimes.length > 0 ? (
          <select
            value={activeRuntimeId || ''}
            onChange={(e) => onSelectRuntime(e.target.value)}
            className="bg-[#14161a] border border-[#2b303a] hover:border-sky-500/50 text-gray-100 rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
          >
            {runtimes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name} ({rt.type || 'vllm'}) - {rt.endpoint}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-500 font-mono text-[11px]">No registered runtimes</span>
        )}

        {activeEngineType && (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold tracking-wider bg-sky-950/70 border border-sky-800/60 text-sky-300">
            {activeEngineType}
          </span>
        )}
      </div>

      {/* Right: Window Selector & Poll Indicator */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Time Window Pills */}
        <div className="flex items-center bg-[#14161a] border border-[#262a33] rounded p-0.5">
          <span className="text-[10px] text-gray-500 px-2 flex items-center space-x-1">
            <Clock className="w-3 h-3 text-gray-400" />
            <span>Window</span>
          </span>
          {windowOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelectWindow(opt.id)}
              className={`px-2.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                activeWindow === opt.id
                  ? 'bg-sky-600 text-white font-medium shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Polled info & refresh button */}
        <div className="flex items-center space-x-2 text-[11px] text-[#8e94a0] font-mono">
          <span>Updated: {formatLastPolled(lastPolledAt)}</span>
          <button
            type="button"
            onClick={onManualRefresh}
            title="Refresh telemetry"
            disabled={isRefreshing}
            className="p-1 rounded bg-[#22252b] hover:bg-[#2b303a] text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  )
}
