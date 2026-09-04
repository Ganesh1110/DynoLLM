import { create } from 'zustand'
import { loadTestsApi } from '../services/api'

export const useLoadTestStore = create((set, get) => ({
  runs: [],
  activeRun: null,
  liveData: [],          // rolling array of {timestamp, concurrent_users, avg_latency_ms, ...}
  loading: false,
  error: null,

  fetchRuns: async () => {
    set({ loading: true })
    try {
      const runs = await loadTestsApi.list()
      set({ runs, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  createRun: async (data) => {
    set({ loading: true, error: null, liveData: [] })
    try {
      const run = await loadTestsApi.create(data)
      set((s) => ({ runs: [run, ...s.runs], activeRun: run, loading: false }))
      return run
    } catch (e) {
      set({ error: e.message, loading: false })
      throw e
    }
  },

  fetchRun: async (id) => {
    const run = await loadTestsApi.get(id)
    set((s) => ({
      activeRun: run,
      runs: s.runs.map((r) => (r.id === id ? run : r)),
    }))
    return run
  },

  stopRun: async (id) => {
    await loadTestsApi.stop(id)
    set((s) => ({
      runs: s.runs.map((r) => (r.id === id ? { ...r, status: 'stopped' } : r)),
    }))
  },

  handleWebSocketEvent: (event) => {
    if (event.type === 'load_test_progress') {
      const point = {
        timestamp: new Date().toLocaleTimeString(),
        concurrent_users: event.concurrent_users,
        total_requests: event.total_requests,
        successful_requests: event.successful_requests,
        failed_requests: event.failed_requests,
        avg_latency_ms: event.avg_latency_ms,
        p95_latency_ms: event.p95_latency_ms,
        avg_ttft_ms: event.avg_ttft_ms,
        error_rate: event.error_rate,
        requests_per_second: event.requests_per_second,
      }
      set((s) => ({
        liveData: [...s.liveData.slice(-200), point], // keep last 200 points
      }))
    } else if (event.type === 'load_test_completed') {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === event.run_id ? { ...r, status: 'completed', ...event.aggregates } : r
        ),
      }))
      if (get().activeRun?.id === event.run_id) {
        get().fetchRun(event.run_id)
      }
    } else if (event.type === 'load_test_failed') {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === event.run_id ? { ...r, status: 'failed', error: event.error } : r
        ),
      }))
    }
  },
}))
