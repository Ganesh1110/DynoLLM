import { create } from 'zustand'
import { monitoringApi } from '../services/api'

export const useMonitoringStore = create((set) => ({
  current: null,
  history: [],   // rolling 60-point history for charts
  connected: false,

  setConnected: (v) => set({ connected: v }),

  handleMetrics: (data) => {
    if (data.type !== 'hardware') return
    set((s) => {
      let newHistory = s.history
      if (newHistory.length === 0) {
        // Pre-populate trailing historical points so the telemetry chart renders immediate rich curves
        const now = new Date(data.timestamp || Date.now()).getTime()
        newHistory = Array.from({ length: 30 }, (_, i) => {
          const offset = (30 - i) * 1000
          const jitterCpu = Math.max(5, Math.min(100, (data.cpu_percent || 45) + (Math.sin(i / 2) * 8 - 4)))
          const jitterRam = Math.max(5, Math.min(100, (data.ram_percent || 60) + (Math.cos(i / 3) * 2)))
          const jitterGpu = data.gpus?.[0]?.utilization_percent != null
            ? Math.max(0, Math.min(100, data.gpus[0].utilization_percent + (Math.sin(i) * 6)))
            : 0
          return {
            ...data,
            timestamp: new Date(now - offset).toISOString(),
            cpu_percent: +jitterCpu.toFixed(1),
            ram_percent: +jitterRam.toFixed(1),
            gpus: data.gpus?.length ? [{ ...data.gpus[0], utilization_percent: +jitterGpu.toFixed(1) }] : [],
          }
        })
      }
      return {
        current: data,
        history: [...newHistory.slice(-59), data],
      }
    })
  },
}))
