import { create } from 'zustand'
import { loadTestPlansApi } from '../services/api'

export const useLoadTestPlanStore = create((set, get) => ({
  plans: [],
  activePlan: null,
  currentReport: null,
  runningPlan: null,
  currentThreadGroup: null,
  loading: false,
  error: null,

  fetchPlans: async () => {
    set({ loading: true, error: null })
    try {
      const plans = await loadTestPlansApi.list()
      set({ plans, loading: false })
      return plans
    } catch (e) {
      set({ error: e.message, loading: false })
      throw e
    }
  },

  selectPlan: (plan) => {
    set({ activePlan: plan, error: null })
  },

  resetActivePlan: () => {
    set({ activePlan: null })
  },

  savePlan: async (planData) => {
    set({ loading: true, error: null })
    try {
      const planId = planData.id || get().activePlan?.id
      let savedPlan
      if (planId) {
        // Strip backend ID/timestamps from body if needed
        const { id, created_at, updated_at, ...cleanData } = planData
        savedPlan = await loadTestPlansApi.update(planId, cleanData)
        set((s) => ({
          plans: s.plans.map((p) => (p.id === planId ? savedPlan : p)),
          activePlan: savedPlan,
          loading: false,
        }))
      } else {
        const { id, created_at, updated_at, ...cleanData } = planData
        savedPlan = await loadTestPlansApi.create(cleanData)
        set((s) => ({
          plans: [savedPlan, ...s.plans],
          activePlan: savedPlan,
          loading: false,
        }))
      }
      return savedPlan
    } catch (e) {
      set({ error: e.message, loading: false })
      throw e
    }
  },

  deletePlan: async (id) => {
    set({ loading: true, error: null })
    try {
      await loadTestPlansApi.delete(id)
      set((s) => ({
        plans: s.plans.filter((p) => p.id !== id),
        activePlan: s.activePlan?.id === id ? null : s.activePlan,
        loading: false,
      }))
    } catch (e) {
      set({ error: e.message, loading: false })
      throw e
    }
  },

  runPlan: async (id) => {
    set({ error: null, currentReport: null })
    try {
      const res = await loadTestPlansApi.run(id)
      set({
        runningPlan: { plan_id: id, status: 'running' },
        currentThreadGroup: null,
      })
      return res
    } catch (e) {
      set({ error: e.message })
      throw e
    }
  },

  runInline: async (planData) => {
    set({ error: null, currentReport: null })
    try {
      const res = await loadTestPlansApi.runInline(planData)
      set({
        runningPlan: { plan_id: res.plan_id, status: 'running' },
        currentThreadGroup: null,
      })
      return res
    } catch (e) {
      set({ error: e.message })
      throw e
    }
  },

  setReport: (report) => {
    set({ currentReport: report })
  },

  clearReport: () => {
    set({ currentReport: null })
  },

  handleWebSocketEvent: (event) => {
    if (!event || !event.type) return

    if (event.type === 'plan_started') {
      set({
        runningPlan: {
          plan_id: event.plan_id,
          status: 'running',
          thread_group_count: event.thread_group_count,
        },
        error: null,
      })
    } else if (event.type === 'plan_thread_group_start') {
      set({
        currentThreadGroup: {
          id: event.thread_group_id,
          name: event.thread_group_name,
          run_id: event.run_id,
        },
      })
    } else if (event.type === 'plan_completed') {
      set({
        runningPlan: null,
        currentThreadGroup: null,
        currentReport: {
          listener_reports: event.listener_reports,
          assertion_results: event.assertion_results,
          overall_passed: event.overall_passed,
          plan_id: event.plan_id,
          run_ids: event.run_ids,
          completed_at: new Date().toISOString(),
        },
      })
    } else if (event.type === 'plan_error') {
      set({
        runningPlan: null,
        currentThreadGroup: null,
        error: event.error,
      })
    }
  },
}))
