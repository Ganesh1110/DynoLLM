import { create } from 'zustand'
import { monitoringApi } from '../services/api'

export const useMonitoringStore = create((set) => ({
  current: null,
  history: [],   // rolling 60-point history for charts
  connected: false,

  setConnected: (v) => set({ connected: v }),

  fetchCurrent: async () => {
    try {
      const data = await monitoringApi.current()
      if (data) {
        set((s) => ({
          current: data,
          history: s.history.length === 0 ? [data] : s.history,
        }))
      }
    } catch {
      // ignore startup errors
    }
  },

  handleMetrics: (data) => {
    if (data.type !== 'hardware') return
    set((s) => ({
      current: data,
      history: [...s.history.slice(-59), data],
    }))
  },
}))
