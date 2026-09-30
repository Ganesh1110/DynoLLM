import { create } from 'zustand'
import { loadTestsApi } from '../services/api'

export const useLoadTestStore = create((set, get) => ({
  runs: [],
  activeRun: null,
  liveData: [],          // rolling array of {timestamp, concurrent_users, avg_latency_ms, ...}
  liveProgress: null,    // live progress object with elapsed_seconds, duration_seconds, etc.
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
    set({
      loading: true,
      error: null,
      liveData: [],
      liveProgress: {
        elapsed_seconds: 0,
        duration_seconds: data.duration_seconds || 60,
        concurrent_users: 0,
        target_users: data.target_users,
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        error_rate: 0,
      },
    })
    try {
      const run = await loadTestsApi.create(data)
      set((s) => ({
        runs: [run, ...s.runs],
        activeRun: run,
        loading: false,
        liveProgress: s.liveProgress ? { ...s.liveProgress, run_id: run.id } : null,
      }))
      return run
    } catch (e) {
      set({ error: e.message, loading: false, liveProgress: null })
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
      activeRun: s.activeRun?.id === id ? { ...s.activeRun, status: 'stopped' } : s.activeRun,
      liveProgress: null,
    }))
  },

  deleteRun: async (id) => {
    await loadTestsApi.delete(id)
    set((s) => ({
      runs: s.runs.filter((r) => r.id !== id),
      activeRun: s.activeRun?.id === id ? null : s.activeRun,
      liveProgress: s.activeRun?.id === id ? null : s.liveProgress,
    }))
  },

  clearHistory: async () => {
    await loadTestsApi.clearAll()
    set({ runs: [], activeRun: null, liveData: [], liveProgress: null })
  },

  handleWebSocketEvent: (event) => {
    if (event.type === 'load_test_started') {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === event.run_id ? { ...r, status: 'running' } : r
        ),
        activeRun: s.activeRun?.id === event.run_id ? { ...s.activeRun, status: 'running' } : s.activeRun,
        liveProgress: {
          run_id: event.run_id,
          elapsed_seconds: 0,
          duration_seconds: event.duration_seconds || s.activeRun?.duration_seconds || 60,
          concurrent_users: 0,
          target_users: event.target_users || s.activeRun?.target_users || 10,
          total_requests: 0,
          successful_requests: 0,
          failed_requests: 0,
          error_rate: 0,
        },
      }))
    } else if (event.type === 'load_test_progress') {
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
        liveProgress: {
          run_id: event.run_id,
          elapsed_seconds: event.elapsed_seconds ?? s.liveProgress?.elapsed_seconds ?? 0,
          duration_seconds: event.duration_seconds || s.activeRun?.duration_seconds || 60,
          concurrent_users: event.concurrent_users ?? 0,
          target_users: s.activeRun?.target_users ?? 10,
          total_requests: event.total_requests ?? 0,
          successful_requests: event.successful_requests ?? 0,
          failed_requests: event.failed_requests ?? 0,
          error_rate: event.error_rate ?? 0,
        },
        activeRun: s.activeRun?.id === event.run_id
          ? {
              ...s.activeRun,
              status: s.activeRun.status === 'pending' ? 'running' : s.activeRun.status,
            }
          : s.activeRun,
      }))
    } else if (event.type === 'load_test_completed') {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === event.run_id ? { ...r, status: 'completed', ...event.aggregates } : r
        ),
        activeRun: s.activeRun?.id === event.run_id
          ? { ...s.activeRun, status: 'completed', ...event.aggregates }
          : s.activeRun,
        liveProgress: null,
      }))
      if (get().activeRun?.id === event.run_id) {
        get().fetchRun(event.run_id)
      }
    } else if (event.type === 'load_test_failed') {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === event.run_id ? { ...r, status: 'failed', error: event.error } : r
        ),
        activeRun: s.activeRun?.id === event.run_id ? { ...s.activeRun, status: 'failed', error: event.error } : s.activeRun,
        liveProgress: null,
      }))
    } else if (event.type === 'load_test_stopped') {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === event.run_id ? { ...r, status: 'stopped' } : r
        ),
        activeRun: s.activeRun?.id === event.run_id ? { ...s.activeRun, status: 'stopped' } : s.activeRun,
        liveProgress: null,
      }))
    } else if (event.type === 'runtime_health_alert') {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === event.run_id ? { ...r, status: 'failed', error: event.message, abort_reason: event.message } : r
        ),
        activeRun: s.activeRun?.id === event.run_id
          ? { ...s.activeRun, status: 'failed', error: event.message, abort_reason: event.message }
          : s.activeRun,
        liveProgress: null,
      }))
    }
  },
}))

