import React from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, Cpu, PlayCircle, Zap, History, Server, Radio } from 'lucide-react'
import { useMonitoringStore } from '../stores/monitoringStore'

export function Navbar() {
  const connected = useMonitoringStore((s) => s.connected)
  const current = useMonitoringStore((s) => s.current)

  const links = [
    { to: '/', label: 'Dashboard', icon: Activity, exact: true },
    { to: '/runtimes', label: 'Runtimes & Models', icon: Server },
    { to: '/benchmark', label: 'Benchmark', icon: PlayCircle },
    { to: '/load-test', label: 'Load Test', icon: Zap },
    { to: '/history', label: 'History & Export', icon: History },
  ]

  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold shadow-md shadow-sky-900/40">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base text-white tracking-tight">LLM Monitor & Bench</span>
              <span className="ml-2 text-xs font-mono text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800">
                MVP v1.0
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex space-x-1">
            {links.map(({ to, label, icon: Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-sky-600/15 text-sky-400 border border-sky-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* System status / live indicator */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-800/80 border border-gray-700">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className={connected ? 'text-emerald-400' : 'text-red-400'}>
                {connected ? 'Live WS' : 'Offline'}
              </span>
            </div>

            {current && (
              <div className="hidden lg:flex items-center space-x-3 text-xs text-gray-400 font-mono">
                <span className="bg-gray-800 px-2 py-1 rounded border border-gray-700">
                  CPU: {current.cpu_percent?.toFixed(0)}%
                </span>
                <span className="bg-gray-800 px-2 py-1 rounded border border-gray-700">
                  RAM: {current.ram_percent?.toFixed(0)}%
                </span>
                {current.gpu_count > 0 && current.gpus?.[0] && (
                  <span className="bg-gray-800 px-2 py-1 rounded border border-gray-700 text-sky-400">
                    GPU: {current.gpus[0].utilization_percent}% | {(current.gpus[0].vram_used_bytes / (1024 ** 3)).toFixed(1)}GB
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
