import { create } from 'zustand'
import { runtimesApi } from '../services/api'

export const useRuntimeStore = create((set, get) => ({
  runtimes: [],
  selectedRuntime: null,
  models: [],
  loading: false,
  error: null,

  fetchRuntimes: async () => {
    set({ loading: true, error: null })
    try {
      const runtimes = await runtimesApi.list()
      set({ runtimes, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  createRuntime: async (data) => {
    const runtime = await runtimesApi.create(data)
    set((s) => ({ runtimes: [runtime, ...s.runtimes] }))
    return runtime
  },

  deleteRuntime: async (id) => {
    await runtimesApi.delete(id)
    set((s) => ({ runtimes: s.runtimes.filter((r) => r.id !== id) }))
  },

  selectRuntime: (runtime) => {
    set({ selectedRuntime: runtime, models: [] })
  },

  fetchModels: async (id) => {
    set({ loading: true })
    try {
      const models = await runtimesApi.listModels(id)
      set({ models, loading: false })
      return models
    } catch (e) {
      set({ error: e.message, loading: false })
      return []
    }
  },

  checkHealth: async (id) => {
    return runtimesApi.healthCheck(id)
  },
}))
