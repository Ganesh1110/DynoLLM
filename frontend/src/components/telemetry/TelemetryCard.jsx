import React, { useState } from 'react'
import {
  HelpCircle,
  Info,
  AlertTriangle,
  Clock,
  Slash,
  Activity,
  CheckCircle2,
} from 'lucide-react'

export function InfoTooltip({ text, position = 'top' }) {
  const [open, setOpen] = useState(false)
  if (!text) return null

  return (
    <div className="relative inline-flex items-center ml-1.5 group">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(!open)}
        className="text-[#656c78] hover:text-sky-400 focus:outline-none transition-colors"
        aria-label="Info explanation"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className={`absolute ${
            position === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } left-1/2 -translate-x-1/2 z-50 w-64 p-2.5 bg-[#14161a] border border-sky-500/40 text-gray-200 text-[11px] rounded-lg shadow-2xl backdrop-blur-md pointer-events-none leading-relaxed`}
        >
          <div className="font-semibold text-sky-400 pb-1 border-b border-[#22252b] mb-1 flex items-center space-x-1">
            <Info className="w-3 h-3" />
            <span>Metric Info</span>
          </div>
          <div>{text}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-[#14161a]" />
        </div>
      )}
    </div>
  )
}

export function StateBadge({ state }) {
  if (state === 'live') {
    return (
      <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>Live</span>
      </span>
    )
  }
  if (state === 'stale') {
    return (
      <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono">
        <Clock className="w-2.5 h-2.5 text-amber-400" />
        <span>Stale (&gt;30s)</span>
      </span>
    )
  }
  if (state === 'unavailable') {
    return (
      <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-[#22252b] border border-[#2e333d] text-gray-400 text-[10px] font-mono">
        <Slash className="w-2.5 h-2.5 text-gray-400" />
        <span>Unsupported</span>
      </span>
    )
  }
  // no_data
  return (
    <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[10px] font-mono">
      <Activity className="w-2.5 h-2.5 text-sky-400" />
      <span>No Data</span>
    </span>
  )
}

export default function TelemetryCard({
  title,
  subtitle,
  icon: Icon,
  state = 'live',
  unavailableReason = 'This metric is not exposed by the current runtime engine.',
  staleReason = 'No fresh telemetry received in over 30 seconds.',
  noDataReason = 'No telemetry activity recorded in the selected window.',
  badge,
  actions,
  tooltip,
  className = '',
  minHeight = 'min-h-[220px]',
  children,
}) {
  const isMuted = state === 'unavailable'

  return (
    <div
      className={`bg-[#181b1f] border ${
        state === 'stale'
          ? 'border-amber-500/40'
          : isMuted
          ? 'border-[#22252b] opacity-80'
          : 'border-[#22252b]'
      } rounded-sm p-3.5 flex flex-col justify-between ${minHeight} ${className} transition-all`}
    >
      {/* Header */}
      <div>
        <div className="flex items-center justify-between pb-1 gap-2">
          <div className="flex items-center space-x-2 truncate">
            {Icon && (
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isMuted ? 'text-gray-500' : 'text-sky-400'
                }`}
              />
            )}
            <span className="text-[13px] text-[#d8d9da] font-medium tracking-tight truncate">
              {title}
            </span>
            {tooltip && <InfoTooltip text={tooltip} />}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {badge}
            <StateBadge state={state} />
            {actions}
          </div>
        </div>

        {subtitle && (
          <div className="text-left text-[10px] text-[#717885] truncate">
            {subtitle}
          </div>
        )}
      </div>

      {/* Body depending on state */}
      <div className="flex-1 flex flex-col justify-center mt-2">
        {state === 'unavailable' ? (
          <div className="py-6 px-4 flex flex-col items-center justify-center text-center space-y-2 bg-[#14161a] rounded border border-dashed border-[#262a33]">
            <Slash className="w-6 h-6 text-gray-500" />
            <div className="text-xs text-gray-300 font-medium">Metric Unavailable</div>
            <p className="text-[11px] text-gray-500 max-w-xs leading-relaxed">
              {unavailableReason}
            </p>
          </div>
        ) : state === 'no_data' ? (
          <div className="py-6 px-4 flex flex-col items-center justify-center text-center space-y-2 bg-[#14161a] rounded border border-[#22252b]">
            <Activity className="w-6 h-6 text-sky-400/60" />
            <div className="text-xs text-gray-300 font-medium">No Recent Activity</div>
            <p className="text-[11px] text-gray-500 max-w-xs leading-relaxed">
              {noDataReason}
            </p>
          </div>
        ) : (
          <>
            {state === 'stale' && (
              <div className="mb-2 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>{staleReason}</span>
              </div>
            )}
            {children}
          </>
        )}
      </div>
    </div>
  )
}
