import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Activity,
  Server,
  PlayCircle,
  Zap,
  GitCompare,
  History,
  Cpu,
  Database,
  Menu,
  X,
  Sparkles,
} from 'lucide-react'
import { useMonitoringStore } from '../stores/monitoringStore'

export function Navbar() {
  const connected = useMonitoringStore((s) => s.connected)
  const current = useMonitoringStore((s) => s.current)
  const [mobileOpen, setMobileOpen] = useState(false)

  const links = [
    { to: '/', label: 'Dashboard', icon: Activity, exact: true },
    { to: '/runtimes', label: 'Runtimes', icon: Server },
    { to: '/benchmark', label: 'Benchmark', icon: PlayCircle },
    { to: '/load-test', label: 'Load Test', icon: Zap },
    { to: '/gpu-sizer', label: 'GPU Sizer', icon: Cpu },
    { to: '/vllm-optimizer', label: 'vLLM Optimizer', icon: Sparkles },
    { to: '/compare', label: 'Compare', icon: GitCompare },
    { to: '/history', label: 'History', icon: History },
  ]


  return (
    <header className="bg-gray-950/90 backdrop-blur-xl border-b border-gray-800/80 sticky top-0 z-50">
      {/* Top subtle highlight accent line */}
      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-sky-500/40 to-transparent" />

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo & Brand */}
          <NavLink to="/" className="flex items-center space-x-3 group shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/25 ring-1 ring-white/20 group-hover:scale-105 transition-transform duration-200">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-base tracking-tight text-white">
                Dyno<span className="text-sky-400">LLM</span>
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                v1.0
              </span>
            </div>
          </NavLink>

          {/* Desktop Navigation Links — Centered Clean Pill Container */}
          <nav className="hidden md:flex items-center p-1 bg-gray-900/80 border border-gray-800/80 rounded-xl shadow-inner backdrop-blur-sm">
            {links.map(({ to, label, icon: Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                    isActive
                      ? 'bg-sky-500/15 text-sky-400 font-semibold shadow-sm border border-sky-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right Status & Live Hardware Telemetry */}
          <div className="flex items-center space-x-3 shrink-0">
            {/* Live WS Pill */}
            <div
              className={`flex items-center space-x-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors ${
                connected
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
              }`}
              title={connected ? 'Connected to live monitoring WebSocket' : 'Monitoring WebSocket offline'}
            >
              <span className="relative flex h-2 w-2">
                {connected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    connected ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
              </span>
              <span className="font-sans font-medium text-[11px] lg:text-xs">
                {connected ? 'Live WS' : 'Offline'}
              </span>
            </div>

            {/* Consolidated Hardware Telemetry Pill */}
            {current && (
              <div className="hidden xl:flex items-center gap-2.5 px-3 py-1 rounded-lg bg-gray-900/80 border border-gray-800 text-xs font-mono text-gray-300 shadow-sm shrink-0">
                <div className="flex items-center gap-1.5" title="Host CPU utilization">
                  <Cpu className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-gray-400 text-[11px]">CPU</span>
                  <span className="text-white font-semibold">{current.cpu_percent?.toFixed(0)}%</span>
                </div>
                <span className="text-gray-700 select-none">|</span>
                <div className="flex items-center gap-1.5" title="Host RAM utilization">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-gray-400 text-[11px]">RAM</span>
                  <span className="text-white font-semibold">{current.ram_percent?.toFixed(0)}%</span>
                </div>
                {current.gpu_count > 0 && current.gpus?.[0] && (
                  <>
                    <span className="text-gray-700 select-none">|</span>
                    <div className="flex items-center gap-1.5" title="GPU utilization & VRAM">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-gray-400 text-[11px]">GPU</span>
                      <span className="text-amber-300 font-semibold">
                        {current.gpus[0].utilization_percent}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/80 border border-gray-800 transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-800/80 bg-gray-950/95 backdrop-blur-xl px-4 py-3 space-y-1">
          {links.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sky-500/15 text-sky-400 font-semibold border border-sky-500/30'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </NavLink>
          ))}

          {current && (
            <div className="pt-2 border-t border-gray-850 flex items-center justify-between text-xs font-mono text-gray-400 px-2">
              <span>CPU: {current.cpu_percent?.toFixed(0)}%</span>
              <span>RAM: {current.ram_percent?.toFixed(0)}%</span>
              {current.gpu_count > 0 && current.gpus?.[0] && (
                <span>GPU: {current.gpus[0].utilization_percent}%</span>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  )
}

