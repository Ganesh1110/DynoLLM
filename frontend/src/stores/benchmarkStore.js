import { create } from 'zustand'
import { benchmarksApi } from '../services/api'

export const useBenchmarkStore = create((set, get) => ({
  runs: [],
  activeRun: null,
  loading: false,
  error: null,
  liveProgress: null,

  fetchRuns: async () => {
    set({ loading: true })
    try {
      const runs = await benchmarksApi.list()
      set({ runs, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  createRun: async (data) => {
    set({ loading: true, error: null, liveProgress: null })
    try {
      const run = await benchmarksApi.create(data)
      set((s) => ({ runs: [run, ...s.runs], activeRun: run, loading: false }))
      return run
    } catch (e) {
      set({ error: e.message, loading: false })
      throw e
    }
  },

  fetchRun: async (id) => {
    const run = await benchmarksApi.get(id)
    set((s) => ({
      activeRun: run,
      runs: s.runs.map((r) => (r.id === id ? run : r)),
    }))
    return run
  },

  stopRun: async (id) => {
    await benchmarksApi.stop(id)
    set((s) => ({
      runs: s.runs.map((r) => (r.id === id ? { ...r, status: 'stopped' } : r)),
    }))
  },

  handleWebSocketEvent: (event) => {
    if (event.type === 'benchmark_progress') {
      set({ liveProgress: event })
    } else if (event.type === 'benchmark_completed') {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === event.run_id ? { ...r, status: 'completed', ...event.aggregates } : r
        ),
        liveProgress: null,
      }))
      if (get().activeRun?.id === event.run_id) {
        get().fetchRun(event.run_id)
      }
    } else if (event.type === 'benchmark_failed') {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === event.run_id ? { ...r, status: 'failed', error: event.error } : r
        ),
        liveProgress: null,
      }))
    }
  },
}))
