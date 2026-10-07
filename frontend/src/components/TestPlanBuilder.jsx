import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Play,
  Save,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Users,
  Zap,
  Clock,
  ShieldCheck,
  BarChart3,
  Database,
  Key,
  Sliders,
  Upload,
  Info,
  ChevronDown,
} from 'lucide-react'
import { useLoadTestPlanStore } from '../stores/loadTestPlanStore'
import { useRuntimeStore } from '../stores/runtimeStore'
import { Spinner, Alert } from './ui'

const ALL_LISTENERS = [
  { id: 'summary_table', label: 'Summary Table', desc: 'Per-group aggregated table with overall totals row' },
  { id: 'latency_chart', label: 'Latency Chart', desc: 'Average and p95 latency curve across concurrency tiers' },
  { id: 'token_throughput', label: 'Token Throughput', desc: 'Input, output, and total tokens per second breakdown' },
  { id: 'error_log', label: 'Error Log', desc: 'Categorized failure list with abort reasons and error types' },
  { id: 'percentile_chart', label: 'Percentile Chart', desc: 'p95 TTFT, avg TTFT, TPOT, and error rates per concurrency' },
  { id: 'assertion_report', label: 'Assertion Report', desc: 'SLA threshold verification and pass/fail summary' },
]

const DEFAULT_THREAD_GROUP = {
  id: 'tg-1',
  name: 'Thread Group 1',
  runtime_id: '',
  model: '',
  pattern: 'rampup',
  target_users: 10,
  duration_seconds: 60,
  rampup_step_users: 5,
  rampup_step_seconds: 10,
  system_prompt: '',
  temperature: 0.7,
  max_tokens: 256,
  request_timeout: 120.0,
}

export function TestPlanBuilder({ onPlanStarted, onViewReport }) {
  const plans = useLoadTestPlanStore((s) => s.plans)
  const activePlan = useLoadTestPlanStore((s) => s.activePlan)
  const runningPlan = useLoadTestPlanStore((s) => s.runningPlan)
  const currentThreadGroup = useLoadTestPlanStore((s) => s.currentThreadGroup)
  const currentReport = useLoadTestPlanStore((s) => s.currentReport)
  const fetchPlans = useLoadTestPlanStore((s) => s.fetchPlans)
  const selectPlan = useLoadTestPlanStore((s) => s.selectPlan)
  const resetActivePlan = useLoadTestPlanStore((s) => s.resetActivePlan)
  const savePlan = useLoadTestPlanStore((s) => s.savePlan)
  const deletePlan = useLoadTestPlanStore((s) => s.deletePlan)
  const runPlan = useLoadTestPlanStore((s) => s.runPlan)
  const runInline = useLoadTestPlanStore((s) => s.runInline)

  const runtimes = useRuntimeStore((s) => s.runtimes)
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes)
  const fetchModels = useRuntimeStore((s) => s.fetchModels)

  const [modelsCache, setModelsCache] = useState({})
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('')
  const [formError, setFormError] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [showConfigDropdown, setShowConfigDropdown] = useState(false)
  const [showAssertionDropdown, setShowAssertionDropdown] = useState(false)
  const configDropdownRef = useRef(null)
  const assertionDropdownRef = useRef(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (configDropdownRef.current && !configDropdownRef.current.contains(event.target)) {
        setShowConfigDropdown(false)
      }
      if (assertionDropdownRef.current && !assertionDropdownRef.current.contains(event.target)) {
        setShowAssertionDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Local plan form state
  const [planForm, setPlanForm] = useState({
    id: null,
    name: 'LLM Multi-Group Test Plan',
    description: 'JMeter-style orchestrated load testing plan for LLM endpoints',
    thread_groups: [{ ...DEFAULT_THREAD_GROUP }],
    config_elements: [],
    assertions: [
      {
        type: 'latency',
        name: 'Latency p95 SLA',
        p95_max_ms: 2500,
      },
      {
        type: 'error_rate',
        name: 'Error Rate SLA',
        max_pct: 5.0,
      },
    ],
    listeners: ALL_LISTENERS.map((l) => l.id),
  })

  // Load plans and runtimes on mount
  useEffect(() => {
    fetchPlans().catch(() => {})
    fetchRuntimes().catch(() => {})
  }, [fetchPlans, fetchRuntimes])

  // Populate models cache when runtimes change
  const loadModelsForRuntime = useCallback(async (rtId) => {
    if (!rtId || modelsCache[rtId]) return
    try {
      const models = await fetchModels(rtId)
      setModelsCache((prev) => ({ ...prev, [rtId]: models || [] }))
    } catch {
      setModelsCache((prev) => ({ ...prev, [rtId]: [] }))
    }
  }, [fetchModels, modelsCache])

  // If runtimes exist and first thread group has no runtime, set default
  useEffect(() => {
    if (runtimes.length > 0) {
      setPlanForm((prev) => {
        let changed = false
        const nextGroups = prev.thread_groups.map((tg) => {
          if (!tg.runtime_id) {
            changed = true
            const defaultRt = runtimes[0].id
            loadModelsForRuntime(defaultRt)
            return { ...tg, runtime_id: defaultRt }
          }
          return tg
        })
        return changed ? { ...prev, thread_groups: nextGroups } : prev
      })
    }
  }, [runtimes, loadModelsForRuntime])

  // When activePlan changes in store, populate the form
  useEffect(() => {
    if (activePlan) {
      const cfg = activePlan.config || {}
      setPlanForm({
        id: activePlan.id,
        name: activePlan.name || 'Unnamed Plan',
        description: activePlan.description || '',
        thread_groups: Array.isArray(cfg.thread_groups) && cfg.thread_groups.length > 0
          ? cfg.thread_groups.map((tg, i) => ({
              ...DEFAULT_THREAD_GROUP,
              ...tg,
              id: tg.id || `tg-${i + 1}`,
            }))
          : [{ ...DEFAULT_THREAD_GROUP, id: 'tg-1' }],
        config_elements: Array.isArray(cfg.config_elements) ? cfg.config_elements : [],
        assertions: Array.isArray(cfg.assertions) ? cfg.assertions : [],
        listeners: Array.isArray(cfg.listeners) && cfg.listeners.length > 0
          ? cfg.listeners
          : ALL_LISTENERS.map((l) => l.id),
      })
      // Ensure models for all thread groups are loaded
      if (Array.isArray(cfg.thread_groups)) {
        cfg.thread_groups.forEach((tg) => {
          if (tg.runtime_id) loadModelsForRuntime(tg.runtime_id)
        })
      }
    }
  }, [activePlan, loadModelsForRuntime])

  // --- Handlers for Thread Groups ---
  const handleAddThreadGroup = () => {
    const newId = `tg-${planForm.thread_groups.length + 1}`
    const defaultRt = runtimes[0]?.id || ''
    if (defaultRt) loadModelsForRuntime(defaultRt)
    const newGroup = {
      ...DEFAULT_THREAD_GROUP,
      id: newId,
      name: `Thread Group ${planForm.thread_groups.length + 1}`,
      runtime_id: defaultRt,
    }
    setPlanForm((prev) => ({
      ...prev,
      thread_groups: [...prev.thread_groups, newGroup],
    }))
  }

  const handleUpdateThreadGroup = (index, field, value) => {
    setPlanForm((prev) => {
      const updated = [...prev.thread_groups]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'runtime_id') {
        loadModelsForRuntime(value)
        updated[index].model = ''
      }
      return { ...prev, thread_groups: updated }
    })
  }

  const handleDuplicateThreadGroup = (index) => {
    setPlanForm((prev) => {
      const target = prev.thread_groups[index]
      const duplicated = {
        ...target,
        id: `tg-${Date.now()}`,
        name: `${target.name} (Copy)`,
      }
      const updated = [...prev.thread_groups]
      updated.splice(index + 1, 0, duplicated)
      return { ...prev, thread_groups: updated }
    })
  }

  const handleRemoveThreadGroup = (index) => {
    if (planForm.thread_groups.length <= 1) {
      alert('At least one Thread Group is required in a test plan.')
      return
    }
    setPlanForm((prev) => ({
      ...prev,
      thread_groups: prev.thread_groups.filter((_, i) => i !== index),
    }))
  }

  // --- Handlers for Config Elements ---
  const handleAddConfigElement = (type) => {
    const base = { type }
    if (type === 'csv_data_set') {
      base.data = 'What is the capital of France?\nExplain quantum computing in simple terms.\nWrite a python quicksort function.'
      base.column = ''
      base.mode = 'random'
    } else if (type === 'think_time') {
      base.min_ms = 200
      base.max_ms = 800
    } else if (type === 'auth_header') {
      base.key = 'Authorization'
      base.value = 'Bearer custom-token-here'
    } else if (type === 'token_budget') {
      base.max_tokens = 512
      base.temperature = 0.5
    }

    setPlanForm((prev) => ({
      ...prev,
      config_elements: [...prev.config_elements, base],
    }))
  }

  const handleUpdateConfigElement = (index, field, value) => {
    setPlanForm((prev) => {
      const updated = [...prev.config_elements]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, config_elements: updated }
    })
  }

  const handleRemoveConfigElement = (index) => {
    setPlanForm((prev) => ({
      ...prev,
      config_elements: prev.config_elements.filter((_, i) => i !== index),
    }))
  }

  const handleFileUpload = (index, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result
      if (typeof text === 'string') {
        handleUpdateConfigElement(index, 'data', text)
      }
    }
    reader.readAsText(file)
  }

  // --- Handlers for Assertions ---
  const handleAddAssertion = (type) => {
    const base = { type }
    if (type === 'latency') {
      base.name = 'Latency p95 Threshold'
      base.p95_max_ms = 2500
    } else if (type === 'error_rate') {
      base.name = 'Maximum Error Rate'
      base.max_pct = 5.0
    } else if (type === 'quality') {
      base.name = 'Minimum Quality Rate'
      base.min_rate = 0.95
    } else if (type === 'ttft') {
      base.name = 'Average TTFT SLA'
      base.max_ms = 1000
    } else if (type === 'tokens_per_second') {
      base.name = 'Minimum Token Throughput'
      base.min_tps = 15.0
    }

    setPlanForm((prev) => ({
      ...prev,
      assertions: [...prev.assertions, base],
    }))
  }

  const handleUpdateAssertion = (index, field, value) => {
    setPlanForm((prev) => {
      const updated = [...prev.assertions]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, assertions: updated }
    })
  }

  const handleRemoveAssertion = (index) => {
    setPlanForm((prev) => ({
      ...prev,
      assertions: prev.assertions.filter((_, i) => i !== index),
    }))
  }

  // --- Handlers for Listeners ---
  const handleToggleListener = (id) => {
    setPlanForm((prev) => {
      const exists = prev.listeners.includes(id)
      const next = exists
        ? prev.listeners.filter((lid) => lid !== id)
        : [...prev.listeners, id]
      return { ...prev, listeners: next }
    })
  }

  const handleSelectAllListeners = () => {
    setPlanForm((prev) => ({ ...prev, listeners: ALL_LISTENERS.map((l) => l.id) }))
  }

  const handleClearAllListeners = () => {
    setPlanForm((prev) => ({ ...prev, listeners: [] }))
  }

  // --- Plan Validation & Execution ---
  const validateForm = () => {
    setFormError('')
    if (!planForm.name.trim()) {
      setFormError('Please enter a Plan Name.')
      return false
    }
    if (planForm.thread_groups.length === 0) {
      setFormError('At least one Thread Group is required.')
      return false
    }
    for (let i = 0; i < planForm.thread_groups.length; i++) {
      const tg = planForm.thread_groups[i]
      if (!tg.runtime_id) {
        setFormError(`Thread Group "${tg.name || i + 1}" requires a valid Runtime selection.`)
        return false
      }
      if (!tg.model) {
        setFormError(`Thread Group "${tg.name || i + 1}" requires a Target Model.`)
        return false
      }
    }
    return true
  }

  const buildPlanPayload = () => {
    return {
      id: planForm.id || undefined,
      name: planForm.name,
      description: planForm.description,
      thread_groups: planForm.thread_groups.map((tg) => ({
        id: tg.id,
        name: tg.name,
        runtime_id: tg.runtime_id,
        model: tg.model,
        pattern: tg.pattern || 'rampup',
        target_users: Number(tg.target_users) || 10,
        duration_seconds: Number(tg.duration_seconds) || 60,
        rampup_step_users: Number(tg.rampup_step_users) || 5,
        rampup_step_seconds: Number(tg.rampup_step_seconds) || 10,
        system_prompt: tg.system_prompt || undefined,
        temperature: Number(tg.temperature) || 0.7,
        max_tokens: Number(tg.max_tokens) || 256,
        request_timeout: Number(tg.request_timeout) || 120.0,
      })),
      config_elements: planForm.config_elements.map((ce) => {
        const item = { type: ce.type }
        if (ce.type === 'csv_data_set') {
          item.data = ce.data
          item.column = ce.column || undefined
          item.mode = ce.mode || 'random'
        } else if (ce.type === 'think_time') {
          item.min_ms = Number(ce.min_ms) || 0
          item.max_ms = Number(ce.max_ms) || 0
        } else if (ce.type === 'auth_header') {
          item.key = ce.key
          item.value = ce.value
        } else if (ce.type === 'token_budget') {
          item.max_tokens = ce.max_tokens ? Number(ce.max_tokens) : undefined
          item.temperature = ce.temperature != null ? Number(ce.temperature) : undefined
        }
        return item
      }),
      assertions: planForm.assertions.map((a) => {
        const item = { type: a.type, name: a.name }
        if (a.type === 'latency') item.p95_max_ms = Number(a.p95_max_ms)
        else if (a.type === 'error_rate') item.max_pct = Number(a.max_pct)
        else if (a.type === 'quality') item.min_rate = Number(a.min_rate)
        else if (a.type === 'ttft') item.max_ms = Number(a.max_ms)
        else if (a.type === 'tokens_per_second') item.min_tps = Number(a.min_tps)
        return item
      }),
      listeners: planForm.listeners,
    }
  }

  const handleSave = async () => {
    if (!validateForm()) return
    setIsExecuting(true)
    setSaveSuccessMsg('')
    try {
      const payload = buildPlanPayload()
      const saved = await savePlan(payload)
      setPlanForm((prev) => ({ ...prev, id: saved.id }))
      setSaveSuccessMsg(`Plan "${saved.name}" successfully saved!`)
      setTimeout(() => setSaveSuccessMsg(''), 4000)
    } catch (e) {
      setFormError(e.message || 'Failed to save plan')
    } finally {
      setIsExecuting(false)
    }
  }

  const handleRun = async (isAdHoc = false) => {
    if (!validateForm()) return
    setIsExecuting(true)
    setSaveSuccessMsg('')
    try {
      const payload = buildPlanPayload()
      if (planForm.id && !isAdHoc) {
        // Save latest modifications first
        await savePlan(payload)
        await runPlan(planForm.id)
      } else {
        await runInline(payload)
      }
      if (onPlanStarted) onPlanStarted()
    } catch (e) {
      setFormError(e.message || 'Failed to start plan run')
    } finally {
      setIsExecuting(false)
    }
  }

  const handleResetToNew = () => {
    resetActivePlan()
    const defaultRt = runtimes[0]?.id || ''
    if (defaultRt) loadModelsForRuntime(defaultRt)
    setPlanForm({
      id: null,
      name: 'New Concurrency Test Plan',
      description: 'Orchestrated JMeter-style test plan',
      thread_groups: [
        {
          ...DEFAULT_THREAD_GROUP,
          id: 'tg-1',
          runtime_id: defaultRt,
        },
      ],
      config_elements: [],
      assertions: [
        {
          type: 'latency',
          name: 'Latency p95 SLA',
          p95_max_ms: 2500,
        },
        {
          type: 'error_rate',
          name: 'Error Rate SLA',
          max_pct: 5.0,
        },
      ],
      listeners: ALL_LISTENERS.map((l) => l.id),
    })
    setFormError('')
    setSaveSuccessMsg('')
  }

  const handleDeleteActivePlan = async () => {
    if (!planForm.id) return
    if (!confirm(`Are you sure you want to delete "${planForm.name}"?`)) return
    try {
      await deletePlan(planForm.id)
      handleResetToNew()
    } catch (e) {
      setFormError(e.message || 'Failed to delete plan')
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: Running plan indicator */}
      {runningPlan && (
        <div className="p-4 rounded-xl bg-sky-950/70 border border-sky-500/40 flex items-center justify-between text-sky-200 animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="w-3.5 h-3.5 rounded-full bg-sky-400 animate-ping" />
            <div>
              <div className="font-semibold text-white flex items-center space-x-2">
                <span>Test Plan Executing:</span>
                <span className="font-mono text-sky-300">{runningPlan.plan_id}</span>
              </div>
              <div className="text-xs text-sky-300/80 mt-0.5">
                {currentThreadGroup
                  ? `Active Group: ${currentThreadGroup.name} (Run ID: ${currentThreadGroup.run_id})`
                  : 'Orchestrating thread groups...'}
              </div>
            </div>
          </div>
          <div className="text-xs px-2.5 py-1 rounded bg-sky-900/60 border border-sky-700 font-mono text-sky-200">
            JMeter Engine Running
          </div>
        </div>
      )}

      {/* Plan Completed Notification */}
      {currentReport && !runningPlan && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-between text-emerald-200">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <span className="font-medium text-white">Plan Execution Finished:</span>{' '}
              <span className="text-xs text-emerald-300">
                {currentReport.overall_passed ? 'All SLA assertions passed' : 'Completed with SLA breaches'}
              </span>
            </div>
          </div>
          {onViewReport && (
            <button
              type="button"
              onClick={onViewReport}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-colors"
            >
              View Detailed Report →
            </button>
          )}
        </div>
      )}

      {/* Header and Saved Plans Controls */}
      <div className="card space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-gray-800">
          <div>
            <div className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-sky-400" />
              <h2 className="text-lg font-bold text-white">JMeter Plan Orchestrator</h2>
              {planForm.id && (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-sky-900/50 text-sky-300 border border-sky-700/50">
                  ID: {planForm.id}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Configure multi-stage Thread Groups, CSV Prompt Pools, Think Time jitter, and SLA Assertions.
            </p>
          </div>

          {/* Saved Plans Selector */}
          <div className="flex items-center space-x-2">
            <select
              className="select text-xs py-1.5 min-w-[200px]"
              value={planForm.id || ''}
              onChange={(e) => {
                const target = plans.find((p) => p.id === e.target.value)
                if (target) selectPlan(target)
                else handleResetToNew()
              }}
            >
              <option value="">-- Saved Plans ({plans.length}) --</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.config?.thread_groups?.length || 1} groups)
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleResetToNew}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1"
              title="Start a blank plan"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>

            {planForm.id && (
              <button
                type="button"
                onClick={handleDeleteActivePlan}
                className="btn-danger text-xs py-1.5 px-2.5 flex items-center"
                title="Delete this saved plan"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Plan Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="label">Plan Name</label>
            <input
              type="text"
              className="input font-medium"
              placeholder="e.g. Production Peak Stress Test"
              value={planForm.name}
              onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Plan Description &amp; Objective</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. 50 VU ramp-up with synthetic customer service prompt dataset"
              value={planForm.description}
              onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
            />
          </div>
        </div>

        {formError && <Alert type="error">{formError}</Alert>}
        {saveSuccessMsg && <Alert type="success">{saveSuccessMsg}</Alert>}
      </div>

      {/* SECTION 1: Thread Groups */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-base font-semibold text-white">Thread Groups ({planForm.thread_groups.length})</h3>
              <p className="text-xs text-gray-400">
                Each group simulates a distinct workload against a runtime with dedicated concurrency and ramp profiles.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddThreadGroup}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-indigo-500/30 text-indigo-300 hover:text-white"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-400" />
            <span>Add Thread Group</span>
          </button>
        </div>

        <div className="space-y-4">
          {planForm.thread_groups.map((tg, idx) => {
            const availableModels = modelsCache[tg.runtime_id] || []
            return (
              <div
                key={tg.id || idx}
                className="p-4 rounded-xl bg-gray-950/70 border border-gray-800/80 space-y-3.5 hover:border-gray-700 transition-colors"
              >
                {/* Group Top Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-6 h-6 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/70 flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      className="bg-transparent text-sm font-semibold text-white focus:outline-none focus:ring-1 focus:ring-sky-500 rounded px-1.5 py-0.5 border border-transparent hover:border-gray-700"
                      value={tg.name}
                      onChange={(e) => handleUpdateThreadGroup(idx, 'name', e.target.value)}
                      placeholder={`Thread Group ${idx + 1}`}
                    />
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => handleDuplicateThreadGroup(idx)}
                      className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
                      title="Duplicate Thread Group"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {planForm.thread_groups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveThreadGroup(idx)}
                        className="p-1.5 rounded hover:bg-red-900/30 text-gray-400 hover:text-red-400 transition-colors"
                        title="Remove Thread Group"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Runtime & Model Selectors */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-400 mb-1 block">Runtime</label>
                    <select
                      className="select text-xs py-1.5"
                      value={tg.runtime_id}
                      onChange={(e) => handleUpdateThreadGroup(idx, 'runtime_id', e.target.value)}
                    >
                      <option value="">-- Select Runtime --</option>
                      {runtimes.map((rt) => (
                        <option key={rt.id} value={rt.id}>
                          {rt.name} ({rt.runtime_type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-gray-400 mb-1 block">Model</label>
                    {availableModels.length > 0 ? (
                      <select
                        className="select text-xs py-1.5 font-mono"
                        value={tg.model}
                        onChange={(e) => handleUpdateThreadGroup(idx, 'model', e.target.value)}
                      >
                        <option value="">-- Select Model --</option>
                        {availableModels.map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="input text-xs py-1.5 font-mono"
                        placeholder="e.g. meta-llama/Llama-3-8B"
                        value={tg.model}
                        onChange={(e) => handleUpdateThreadGroup(idx, 'model', e.target.value)}
                      />
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-gray-400 mb-1 block">Traffic Pattern</label>
                    <select
                      className="select text-xs py-1.5"
                      value={tg.pattern}
                      onChange={(e) => handleUpdateThreadGroup(idx, 'pattern', e.target.value)}
                    >
                      <option value="rampup">Ramp-up (Stepped increase)</option>
                      <option value="constant">Constant (Steady sustained concurrency)</option>
                      <option value="spike">Spike (Sudden pulse surge)</option>
                      <option value="stress">Stress (Step to failure point)</option>
                    </select>
                  </div>
                </div>

                {/* Parameters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 pt-1">
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                      Target Users
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="input text-xs py-1 px-2"
                      value={tg.target_users}
                      onChange={(e) => handleUpdateThreadGroup(idx, 'target_users', parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                      Duration (s)
                    </label>
                    <input
                      type="number"
                      min="5"
                      className="input text-xs py-1 px-2"
                      value={tg.duration_seconds}
                      onChange={(e) => handleUpdateThreadGroup(idx, 'duration_seconds', parseInt(e.target.value) || 10)}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                      Step Users
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="input text-xs py-1 px-2"
                      value={tg.rampup_step_users}
                      onChange={(e) => handleUpdateThreadGroup(idx, 'rampup_step_users', parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                      Step Time (s)
                    </label>
                    <input
                      type="number"
                      min="2"
                      className="input text-xs py-1 px-2"
                      value={tg.rampup_step_seconds}
                      onChange={(e) => handleUpdateThreadGroup(idx, 'rampup_step_seconds', parseInt(e.target.value) || 5)}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      min="16"
                      className="input text-xs py-1 px-2"
                      value={tg.max_tokens}
                      onChange={(e) => handleUpdateThreadGroup(idx, 'max_tokens', parseInt(e.target.value) || 128)}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                      Temperature
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      className="input text-xs py-1 px-2"
                      value={tg.temperature}
                      onChange={(e) => handleUpdateThreadGroup(idx, 'temperature', parseFloat(e.target.value) || 0.7)}
                    />
                  </div>
                </div>

                {/* Optional System Prompt */}
                <div>
                  <details className="text-xs text-gray-400">
                    <summary className="cursor-pointer hover:text-gray-300 select-none">
                      + Custom System Prompt / Instructions (Optional)
                    </summary>
                    <div className="mt-2">
                      <textarea
                        rows={2}
                        className="input text-xs font-mono w-full"
                        placeholder="e.g. You are a helpful AI assistant answering customer queries concisely."
                        value={tg.system_prompt || ''}
                        onChange={(e) => handleUpdateThreadGroup(idx, 'system_prompt', e.target.value)}
                      />
                    </div>
                  </details>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* SECTION 2: Config Elements */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-white">Config Elements ({planForm.config_elements.length})</h3>
              <p className="text-xs text-gray-400">
                JMeter-style modules applied to thread groups: CSV prompt datasets, pacing think times, auth headers, and budgets.
              </p>
            </div>
          </div>

          {/* Add Dropdown */}
          <div className="relative" ref={configDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setShowConfigDropdown((prev) => !prev)
                setShowAssertionDropdown(false)
              }}
              className={`btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border transition-all ${
                showConfigDropdown
                  ? 'border-emerald-500 bg-emerald-950/50 text-white shadow-sm ring-1 ring-emerald-500/50'
                  : 'border-emerald-500/30 text-emerald-300 hover:text-white hover:bg-emerald-950/30'
              }`}
              aria-haspopup="true"
              aria-expanded={showConfigDropdown}
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Add Config Element</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-emerald-400 transition-transform duration-200 ${
                  showConfigDropdown ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showConfigDropdown && (
              <div className="absolute right-0 mt-1.5 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-30 py-1.5 divide-y divide-gray-800">
                <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Select Configuration Type
                </div>
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      handleAddConfigElement('csv_data_set')
                      setShowConfigDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center space-x-2.5 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 group-hover:border-emerald-500">
                      <Database className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">CSV Prompt Data Set</div>
                      <div className="text-[10px] text-gray-400">Custom user prompts from file or list</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddConfigElement('think_time')
                      setShowConfigDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center space-x-2.5 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 group-hover:border-cyan-500">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Think Time (Pacing Jitter)</div>
                      <div className="text-[10px] text-gray-400">Random delay between requests (ms)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddConfigElement('auth_header')
                      setShowConfigDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center space-x-2.5 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-amber-950/80 border border-amber-800/60 text-amber-400 group-hover:border-amber-500">
                      <Key className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Custom Auth Header</div>
                      <div className="text-[10px] text-gray-400">Custom Bearer or API token headers</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddConfigElement('token_budget')
                      setShowConfigDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center space-x-2.5 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-purple-950/80 border border-purple-800/60 text-purple-400 group-hover:border-purple-500">
                      <Sliders className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Token Budget Override</div>
                      <div className="text-[10px] text-gray-400">Plan-wide max_tokens &amp; temperature</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {planForm.config_elements.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-gray-800 rounded-xl text-gray-500 text-xs">
            No Config Elements added. Standard synthetic prompt mix will be generated automatically.
          </div>
        ) : (
          <div className="space-y-3">
            {planForm.config_elements.map((ce, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-gray-950/70 border border-gray-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {ce.type === 'csv_data_set' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                        CSV Data Set Config
                      </span>
                    )}
                    {ce.type === 'think_time' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-950 text-cyan-300 border border-cyan-800/80">
                        Think Time (Pacing Delay)
                      </span>
                    )}
                    {ce.type === 'auth_header' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950 text-amber-300 border border-amber-800/80">
                        HTTP Auth Header
                      </span>
                    )}
                    {ce.type === 'token_budget' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-950 text-purple-300 border border-purple-800/80">
                        Token Budget Override
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveConfigElement(idx)}
                    className="p-1 rounded hover:bg-red-900/30 text-gray-400 hover:text-red-400 transition-colors"
                    title="Remove Config Element"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* CSV Data Set Config element body */}
                {ce.type === 'csv_data_set' && (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center space-x-2 flex-1">
                        <label className="text-gray-400 whitespace-nowrap">Mode:</label>
                        <select
                          className="select text-xs py-1"
                          value={ce.mode || 'random'}
                          onChange={(e) => handleUpdateConfigElement(idx, 'mode', e.target.value)}
                        >
                          <option value="random">Random Sampling</option>
                          <option value="sequential">Sequential Loop</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-2 flex-1">
                        <label className="text-gray-400 whitespace-nowrap">CSV Column:</label>
                        <input
                          type="text"
                          className="input text-xs py-1"
                          placeholder="prompt (optional)"
                          value={ce.column || ''}
                          onChange={(e) => handleUpdateConfigElement(idx, 'column', e.target.value)}
                        />
                      </div>

                      <label className="btn-secondary text-xs py-1 px-2.5 cursor-pointer flex items-center space-x-1 border border-gray-700">
                        <Upload className="w-3 h-3" />
                        <span>Upload File</span>
                        <input
                          type="file"
                          accept=".txt,.csv"
                          className="hidden"
                          onChange={(e) => handleFileUpload(idx, e)}
                        />
                      </label>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                        <span>Prompts (one per line or CSV):</span>
                        <span>
                          {ce.data ? ce.data.split('\n').filter((l) => l.trim()).length : 0} items in pool
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        className="input font-mono text-xs w-full"
                        placeholder="Enter prompts, one per line..."
                        value={ce.data || ''}
                        onChange={(e) => handleUpdateConfigElement(idx, 'data', e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Think Time body */}
                {ce.type === 'think_time' && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-gray-400 block mb-1">Minimum Jitter (ms):</label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        className="input text-xs py-1"
                        value={ce.min_ms ?? 0}
                        onChange={(e) => handleUpdateConfigElement(idx, 'min_ms', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Maximum Jitter (ms):</label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        className="input text-xs py-1"
                        value={ce.max_ms ?? 0}
                        onChange={(e) => handleUpdateConfigElement(idx, 'max_ms', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-2 text-[11px] text-cyan-400/80">
                      ℹ Simulates realistic human pacing between sequential requests from the same user.
                    </div>
                  </div>
                )}

                {/* Auth Header body */}
                {ce.type === 'auth_header' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-gray-400 block mb-1">Header Key:</label>
                      <input
                        type="text"
                        className="input text-xs py-1 font-mono"
                        placeholder="Authorization"
                        value={ce.key || ''}
                        onChange={(e) => handleUpdateConfigElement(idx, 'key', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Header Value:</label>
                      <input
                        type="text"
                        className="input text-xs py-1 font-mono"
                        placeholder="Bearer sk-..."
                        value={ce.value || ''}
                        onChange={(e) => handleUpdateConfigElement(idx, 'value', e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Token Budget body */}
                {ce.type === 'token_budget' && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-gray-400 block mb-1">Override Max Tokens:</label>
                      <input
                        type="number"
                        min="1"
                        className="input text-xs py-1"
                        value={ce.max_tokens ?? ''}
                        onChange={(e) => handleUpdateConfigElement(idx, 'max_tokens', parseInt(e.target.value) || undefined)}
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Override Temperature:</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        className="input text-xs py-1"
                        value={ce.temperature ?? ''}
                        onChange={(e) => handleUpdateConfigElement(idx, 'temperature', parseFloat(e.target.value) || undefined)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3: Assertions */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-semibold text-white">SLA Assertions ({planForm.assertions.length})</h3>
              <p className="text-xs text-gray-400">
                Define pass/fail SLA criteria. The plan is marked PASSED only if all assertions evaluate successfully.
              </p>
            </div>
          </div>

          {/* Add Assertion Dropdown */}
          <div className="relative" ref={assertionDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setShowAssertionDropdown((prev) => !prev)
                setShowConfigDropdown(false)
              }}
              className={`btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border transition-all ${
                showAssertionDropdown
                  ? 'border-amber-500 bg-amber-950/50 text-white shadow-sm ring-1 ring-amber-500/50'
                  : 'border-amber-500/30 text-amber-300 hover:text-white hover:bg-amber-950/30'
              }`}
              aria-haspopup="true"
              aria-expanded={showAssertionDropdown}
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Add SLA Assertion</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-amber-400 transition-transform duration-200 ${
                  showAssertionDropdown ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showAssertionDropdown && (
              <div className="absolute right-0 mt-1.5 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-30 py-1.5 divide-y divide-gray-800">
                <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Select SLA Assertion Metric
                </div>
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      handleAddAssertion('latency')
                      setShowAssertionDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center space-x-2.5 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-amber-950/80 border border-amber-800/60 text-amber-400 group-hover:border-amber-500">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Latency p95</div>
                      <div className="text-[10px] text-gray-400">Maximum p95 response time (ms)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddAssertion('error_rate')
                      setShowAssertionDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center space-x-2.5 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-rose-950/80 border border-rose-800/60 text-rose-400 group-hover:border-rose-500">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Error Rate</div>
                      <div className="text-[10px] text-gray-400">Maximum allowed error percentage (%)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddAssertion('ttft')
                      setShowAssertionDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center space-x-2.5 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 group-hover:border-cyan-500">
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Average TTFT</div>
                      <div className="text-[10px] text-gray-400">Maximum time to first token (ms)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddAssertion('tokens_per_second')
                      setShowAssertionDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center space-x-2.5 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 group-hover:border-emerald-500">
                      <BarChart3 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Token Throughput</div>
                      <div className="text-[10px] text-gray-400">Minimum generated tokens / sec (TPS)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddAssertion('quality')
                      setShowAssertionDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center space-x-2.5 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-indigo-950/80 border border-indigo-800/60 text-indigo-400 group-hover:border-indigo-500">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Quality Integrity</div>
                      <div className="text-[10px] text-gray-400">Minimum valid non-empty response (%)</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {planForm.assertions.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-gray-800 rounded-xl text-gray-500 text-xs">
            No Assertions defined. Test run will complete without pass/fail SLA evaluation.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {planForm.assertions.map((a, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-gray-950/70 border border-gray-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-950 text-amber-300 border border-amber-800">
                      {a.type}
                    </span>
                    <input
                      type="text"
                      className="bg-transparent font-medium text-white focus:outline-none focus:ring-1 focus:ring-sky-500 rounded px-1 text-xs"
                      value={a.name || ''}
                      onChange={(e) => handleUpdateAssertion(idx, 'name', e.target.value)}
                      placeholder="Assertion Name"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-gray-400">Threshold:</span>
                    {a.type === 'latency' && (
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          className="input text-xs py-0.5 px-1.5 w-24"
                          value={a.p95_max_ms ?? ''}
                          onChange={(e) => handleUpdateAssertion(idx, 'p95_max_ms', parseFloat(e.target.value) || 0)}
                        />
                        <span className="text-gray-400">ms max p95</span>
                      </div>
                    )}
                    {a.type === 'error_rate' && (
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          step="0.5"
                          className="input text-xs py-0.5 px-1.5 w-20"
                          value={a.max_pct ?? ''}
                          onChange={(e) => handleUpdateAssertion(idx, 'max_pct', parseFloat(e.target.value) || 0)}
                        />
                        <span className="text-gray-400">% max error</span>
                      </div>
                    )}
                    {a.type === 'quality' && (
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          className="input text-xs py-0.5 px-1.5 w-20"
                          value={a.min_rate ?? ''}
                          onChange={(e) => handleUpdateAssertion(idx, 'min_rate', parseFloat(e.target.value) || 0)}
                        />
                        <span className="text-gray-400">min rate (0.95 = 95%)</span>
                      </div>
                    )}
                    {a.type === 'ttft' && (
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          className="input text-xs py-0.5 px-1.5 w-24"
                          value={a.max_ms ?? ''}
                          onChange={(e) => handleUpdateAssertion(idx, 'max_ms', parseFloat(e.target.value) || 0)}
                        />
                        <span className="text-gray-400">ms max avg TTFT</span>
                      </div>
                    )}
                    {a.type === 'tokens_per_second' && (
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          step="1"
                          className="input text-xs py-0.5 px-1.5 w-20"
                          value={a.min_tps ?? ''}
                          onChange={(e) => handleUpdateAssertion(idx, 'min_tps', parseFloat(e.target.value) || 0)}
                        />
                        <span className="text-gray-400">TPS min</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveAssertion(idx)}
                  className="p-1 rounded hover:bg-red-900/30 text-gray-400 hover:text-red-400 transition-colors"
                  title="Remove Assertion"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 4: Listeners */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-sky-400" />
            <div>
              <h3 className="text-base font-semibold text-white">Listeners &amp; Report Outputs</h3>
              <p className="text-xs text-gray-400">
                Select which listener reports the backend will compile and deliver upon plan completion.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSelectAllListeners}
              className="text-[11px] text-sky-400 hover:underline"
            >
              Select All
            </button>
            <span className="text-gray-600">|</span>
            <button
              type="button"
              onClick={handleClearAllListeners}
              className="text-[11px] text-gray-400 hover:underline"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_LISTENERS.map((lis) => {
            const checked = planForm.listeners.includes(lis.id)
            return (
              <label
                key={lis.id}
                className={`p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition-colors ${
                  checked
                    ? 'bg-sky-950/30 border-sky-600/60 text-white'
                    : 'bg-gray-950/50 border-gray-800/80 text-gray-400 hover:border-gray-700'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-gray-700 bg-gray-800 text-sky-600 focus:ring-sky-600"
                  checked={checked}
                  onChange={() => handleToggleListener(lis.id)}
                />
                <div className="text-xs">
                  <div className="font-medium text-gray-200">{lis.label}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{lis.desc}</div>
                </div>
              </label>
            )
          })}
        </div>
      </div>

      {/* Action Footer */}
      <div className="card flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-gray-400">
          <span>{planForm.thread_groups.length} Thread Group(s)</span>
          <span className="mx-2">•</span>
          <span>{planForm.config_elements.length} Config Element(s)</span>
          <span className="mx-2">•</span>
          <span>{planForm.assertions.length} SLA Assertion(s)</span>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={isExecuting || !!runningPlan}
            className="btn-secondary text-sm py-2 px-4 flex items-center justify-center space-x-2 flex-1 sm:flex-none border border-gray-700 hover:border-gray-600"
          >
            <Save className="w-4 h-4 text-sky-400" />
            <span>Save Plan</span>
          </button>

          <button
            type="button"
            onClick={() => handleRun(false)}
            disabled={isExecuting || !!runningPlan}
            className="btn-primary text-sm py-2 px-5 flex items-center justify-center space-x-2 flex-1 sm:flex-none shadow-lg shadow-sky-950"
          >
            {isExecuting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Test Plan</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
