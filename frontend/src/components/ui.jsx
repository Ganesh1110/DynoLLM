import { clsx } from 'clsx'

export function StatusBadge({ status }) {
  const map = {
    completed: 'badge-green',
    running:   'badge-blue',
    pending:   'badge-yellow',
    failed:    'badge-red',
    stopped:   'badge-gray',
  }
  return <span className={map[status] || 'badge-gray'}>{status}</span>
}

export function MetricCard({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${color}`}>{value ?? '—'}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

export function GaugeBar({ label, value, max, unit = '', color = 'bg-sky-500' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const barColor = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-yellow-500' : color
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>{value?.toFixed(1)}{unit} / {max}{unit}</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function Alert({ type = 'info', children }) {
  const styles = {
    info:    'bg-sky-900/40 border-sky-700 text-sky-200',
    error:   'bg-red-900/40 border-red-700 text-red-200',
    success: 'bg-green-900/40 border-green-700 text-green-200',
    warning: 'bg-yellow-900/40 border-yellow-700 text-yellow-200',
  }
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${styles[type]}`}>
      {children}
    </div>
  )
}

export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-gray-400 text-sm mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon className="w-12 h-12 text-gray-700 mb-4" />}
      <h3 className="text-lg font-medium text-gray-400">{title}</h3>
      {description && <p className="text-sm text-gray-600 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function fmt(n, decimals = 1) {
  if (n == null) return '—'
  return Number(n).toFixed(decimals)
}

export function fmtBytes(b) {
  if (b == null) return '—'
  const gb = b / 1024 / 1024 / 1024
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = b / 1024 / 1024
  return `${mb.toFixed(0)} MB`
}

export function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${ms.toFixed(0)}ms`
}
