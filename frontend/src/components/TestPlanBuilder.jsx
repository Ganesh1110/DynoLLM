import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  FolderTree,
  Terminal,
  Code,
  Download,
  Eye,
  Settings,
  Activity,
  Check,
  X,
  FileCode,
  Sparkles,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { useLoadTestPlanStore } from '../stores/loadTestPlanStore'
import { useRuntimeStore } from '../stores/runtimeStore'
import { Spinner, Alert } from './ui'
import {
  JMETER_BLUEPRINTS,
  computeWorkloadTopology,
  exportPlanToJmx,
  generateSnippets,
} from '../utils/jmeterPlanUtils'

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
  enabled: true,
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
  
  // Layout view: 'workbench' (JMeter tree + inspector) vs 'flow' (stacked full cards)
  const [viewMode, setViewMode] = useState('workbench')
  const [selectedNode, setSelectedNode] = useState('plan_root') // 'plan_root' | 'tg-0' | 'ce-0' | 'as-0' | 'listeners' | 'topology'

  // Modals & Popovers
  const [showBlueprintsModal, setShowBlueprintsModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importJsonText, setImportJsonText] = useState('')
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const [activeSnippetTab, setActiveSnippetTab] = useState('curl')

  // Dropdown states
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
              enabled: tg.enabled !== false,
            }))
          : [{ ...DEFAULT_THREAD_GROUP, id: 'tg-1' }],
        config_elements: Array.isArray(cfg.config_elements) ? cfg.config_elements : [],
        assertions: Array.isArray(cfg.assertions) ? cfg.assertions : [],
        listeners: Array.isArray(cfg.listeners) && cfg.listeners.length > 0
          ? cfg.listeners
          : ALL_LISTENERS.map((l) => l.id),
      })
      if (Array.isArray(cfg.thread_groups)) {
        cfg.thread_groups.forEach((tg) => {
          if (tg.runtime_id) loadModelsForRuntime(tg.runtime_id)
        })
      }
    }
  }, [activePlan, loadModelsForRuntime])

  // Workload Topology Calculation
  const topology = useMemo(() => {
    return computeWorkloadTopology(planForm)
  }, [planForm])

  // Handlers for Thread Groups
  const handleAddThreadGroup = () => {
    const newIdx = planForm.thread_groups.length
    const newId = `tg-${Date.now()}`
    const defaultRt = runtimes[0]?.id || ''
    if (defaultRt) loadModelsForRuntime(defaultRt)
    const newGroup = {
      ...DEFAULT_THREAD_GROUP,
      id: newId,
      name: `Thread Group ${newIdx + 1}`,
      runtime_id: defaultRt,
    }
    setPlanForm((prev) => ({
      ...prev,
      thread_groups: [...prev.thread_groups, newGroup],
    }))
    setSelectedNode(`tg-${newIdx}`)
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
    setSelectedNode('plan_root')
  }

  // Handlers for Config Elements
  const handleAddConfigElement = (type) => {
    const base = { type, enabled: true }
    if (type === 'csv_data_set') {
      base.data = 'What is the capital of France?\nExplain quantum computing in simple terms.\nWrite a python quicksort function.'
      base.column = ''
      base.mode = 'random'
    } else if (type === 'think_time' || type === 'timer') {
      base.timer_type = 'uniform'
      base.min_ms = 200
      base.max_ms = 800
      base.delay_ms = 400
      base.deviation_ms = 150
    } else if (type === 'auth_header') {
      base.key = 'Authorization'
      base.value = 'Bearer custom-token-here'
    } else if (type === 'token_budget') {
      base.max_tokens = 512
      base.temperature = 0.5
    } else if (type === 'user_defined_variables') {
      base.variables = {
        MODEL_NAME: 'meta-llama/Llama-3-8B',
        DEFAULT_TEMP: '0.7',
        API_TOKEN: 'sk-prod-dynollm-token',
      }
    }

    const newIdx = planForm.config_elements.length
    setPlanForm((prev) => ({
      ...prev,
      config_elements: [...prev.config_elements, base],
    }))
    setSelectedNode(`ce-${newIdx}`)
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
    setSelectedNode('plan_root')
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

  // Handlers for Assertions
  const handleAddAssertion = (type) => {
    const base = { type, enabled: true }
    if (type === 'latency') {
      base.name = 'Latency p95 Threshold'
      base.p95_max_ms = 2500
    } else if (type === 'p99_latency') {
      base.name = 'Latency p99 Threshold'
      base.p99_max_ms = 4000
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

    const newIdx = planForm.assertions.length
    setPlanForm((prev) => ({
      ...prev,
      assertions: [...prev.assertions, base],
    }))
    setSelectedNode(`as-${newIdx}`)
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
    setSelectedNode('plan_root')
  }

  // Listeners handlers
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

  // Load Blueprint Template
  const handleLoadBlueprint = (blueprint) => {
    const defaultRt = runtimes[0]?.id || ''
    const defaultModel = modelsCache[defaultRt]?.[0]?.name || ''
    if (defaultRt) loadModelsForRuntime(defaultRt)

    const updatedGroups = blueprint.config.thread_groups.map((tg, i) => ({
      ...DEFAULT_THREAD_GROUP,
      ...tg,
      id: `tg-${i + 1}`,
      runtime_id: defaultRt,
      model: defaultModel || tg.model || '',
      enabled: true,
    }))

    setPlanForm({
      id: null,
      name: blueprint.config.name,
      description: blueprint.config.description,
      thread_groups: updatedGroups,
      config_elements: blueprint.config.config_elements || [],
      assertions: blueprint.config.assertions || [],
      listeners: ALL_LISTENERS.map((l) => l.id),
    })

    setShowBlueprintsModal(false)
    setSelectedNode('plan_root')
    setSaveSuccessMsg(`Loaded template: "${blueprint.title}"`)
    setTimeout(() => setSaveSuccessMsg(''), 4000)
  }

  // Export Apache JMeter JMX
  const handleExportJmx = () => {
    const xml = exportPlanToJmx(planForm, runtimes)
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const dlAnchor = document.createElement('a')
    dlAnchor.setAttribute('href', url)
    dlAnchor.setAttribute('download', `${planForm.name.toLowerCase().replace(/\s+/g, '_')}.jmx`)
    dlAnchor.click()
  }

  // Export JSON Plan
  const handleExportJson = () => {
    const payload = buildPlanPayload()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const dlAnchor = document.createElement('a')
    dlAnchor.setAttribute('href', url)
    dlAnchor.setAttribute('download', `${planForm.name.toLowerCase().replace(/\s+/g, '_')}_plan.json`)
    dlAnchor.click()
  }

  // Import JSON Plan
  const handleApplyImportJson = () => {
    try {
      const parsed = JSON.parse(importJsonText)
      if (!parsed.name || !Array.isArray(parsed.thread_groups)) {
        alert('Invalid plan JSON: name and thread_groups array are required.')
        return
      }
      setPlanForm({
        id: null,
        name: parsed.name,
        description: parsed.description || '',
        thread_groups: parsed.thread_groups.map((tg, i) => ({
          ...DEFAULT_THREAD_GROUP,
          ...tg,
          id: tg.id || `tg-${i + 1}`,
          enabled: true,
        })),
        config_elements: parsed.config_elements || [],
        assertions: parsed.assertions || [],
        listeners: parsed.listeners || ALL_LISTENERS.map((l) => l.id),
      })
      setShowImportModal(false)
      setImportJsonText('')
      setSaveSuccessMsg('Test plan successfully imported!')
      setTimeout(() => setSaveSuccessMsg(''), 4000)
    } catch (e) {
      alert(`JSON Parse Error: ${e.message}`)
    }
  }

  // Validation
  const validateForm = () => {
    setFormError('')
    if (!planForm.name.trim()) {
      setFormError('Please enter a Plan Name.')
      return false
    }
    const enabledGroups = planForm.thread_groups.filter((g) => g.enabled !== false)
    if (enabledGroups.length === 0) {
      setFormError('At least one enabled Thread Group is required.')
      return false
    }
    for (let i = 0; i < enabledGroups.length; i++) {
      const tg = enabledGroups[i]
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
    const enabledGroups = planForm.thread_groups.filter((g) => g.enabled !== false)
    return {
      id: planForm.id || undefined,
      name: planForm.name,
      description: planForm.description,
      thread_groups: enabledGroups.map((tg) => ({
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
      config_elements: planForm.config_elements
        .filter((ce) => ce.enabled !== false)
        .map((ce) => {
          const item = { type: ce.type }
          if (ce.type === 'csv_data_set') {
            item.data = ce.data
            item.column = ce.column || undefined
            item.mode = ce.mode || 'random'
          } else if (ce.type === 'think_time' || ce.type === 'timer') {
            item.timer_type = ce.timer_type || 'uniform'
            item.min_ms = Number(ce.min_ms) || 0
            item.max_ms = Number(ce.max_ms) || 0
            item.delay_ms = Number(ce.delay_ms) || undefined
            item.deviation_ms = Number(ce.deviation_ms) || undefined
          } else if (ce.type === 'auth_header') {
            item.key = ce.key
            item.value = ce.value
          } else if (ce.type === 'token_budget') {
            item.max_tokens = ce.max_tokens ? Number(ce.max_tokens) : undefined
            item.temperature = ce.temperature != null ? Number(ce.temperature) : undefined
          } else if (ce.type === 'user_defined_variables') {
            item.variables = ce.variables || {}
          }
          return item
        }),
      assertions: planForm.assertions
        .filter((a) => a.enabled !== false)
        .map((a) => {
          const item = { type: a.type, name: a.name }
          if (a.type === 'latency') item.p95_max_ms = Number(a.p95_max_ms)
          else if (a.type === 'p99_latency') item.p99_max_ms = Number(a.p99_max_ms)
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
    setSelectedNode('plan_root')
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

  // Snippets
  const snippets = useMemo(() => {
    return generateSnippets(buildPlanPayload())
  }, [planForm])

  return (
    <div className="space-y-6">
      {/* Running plan indicator */}
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

      {/* Top Header & Toolbar Card */}
      <div className="card space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-gray-800">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="px-2 py-0.5 text-[10px] font-black tracking-widest uppercase bg-gradient-to-r from-red-600 to-amber-600 text-white rounded shadow-sm">
                Apache JMeter Core
              </span>
              <h2 className="text-lg font-bold text-white">JMeter Test Plan Studio</h2>
              {planForm.id && (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-sky-900/50 text-sky-300 border border-sky-700/50">
                  ID: {planForm.id}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Hierarchical Workbench tree, interactive workload schedule curve preview, and developer-grade assertions.
            </p>
          </div>

          {/* Quick Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-gray-900 border border-gray-700/80 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('workbench')}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                  viewMode === 'workbench'
                    ? 'bg-sky-600 text-white shadow-sm font-medium'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="JMeter Workbench Tree Explorer"
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>Tree Explorer</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('flow')}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                  viewMode === 'flow'
                    ? 'bg-sky-600 text-white shadow-sm font-medium'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="Full Flow Stack View"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Full Flow</span>
              </button>
            </div>

            {/* Blueprints / Templates Button */}
            <button
              type="button"
              onClick={() => setShowBlueprintsModal(true)}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-amber-500/30 text-amber-300 hover:text-white hover:bg-amber-950/30"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Blueprints</span>
            </button>

            {/* JMX & JSON Export/Import */}
            <button
              type="button"
              onClick={handleExportJmx}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center space-x-1 text-gray-300 hover:text-white"
              title="Download standard Apache JMeter .jmx file"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Export .JMX</span>
            </button>

            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center space-x-1 text-gray-300 hover:text-white"
              title="View JSON and cURL snippet"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>cURL</span>
            </button>

            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center space-x-1 text-gray-300 hover:text-white"
              title="Import test plan from JSON"
            >
              <Upload className="w-3.5 h-3.5 text-purple-400" />
              <span>Import</span>
            </button>

            {/* Saved Plans Selector */}
            <select
              className="select text-xs py-1.5 min-w-[170px]"
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
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center space-x-1"
              title="New Blank Plan"
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

        {/* Plan Header Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-medium text-gray-400 mb-1 block">Test Plan Name</label>
            <input
              type="text"
              className="input font-medium text-xs py-1.5"
              placeholder="e.g. Production Peak Stress Test"
              value={planForm.name}
              onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-medium text-gray-400 mb-1 block">Description &amp; Objective</label>
            <input
              type="text"
              className="input text-xs py-1.5"
              placeholder="e.g. 50 VU ramp-up with synthetic customer service prompt dataset"
              value={planForm.description}
              onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
            />
          </div>
        </div>

        {formError && <Alert type="error">{formError}</Alert>}
        {saveSuccessMsg && <Alert type="success">{saveSuccessMsg}</Alert>}
      </div>

      {/* WORKLOAD TOPOLOGY GRAPH PREVIEW (JMeter Concurrency Curve) */}
      <div className="card space-y-3.5 bg-gray-950/80 border border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-gray-800/80">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-white">Workload Concurrency Topology Preview</h3>
            <span className="text-[11px] px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
              Stepping Thread Schedule
            </span>
          </div>
          <div className="flex items-center space-x-4 text-xs">
            <div className="text-gray-400">
              Duration: <span className="text-white font-mono font-semibold">{topology.totalDurationSeconds}s</span>
            </div>
            <div className="text-gray-400">
              Peak VUs: <span className="text-sky-300 font-mono font-semibold">{topology.peakUsers} threads</span>
            </div>
            <div className="text-gray-400">
              Est. Invocations: <span className="text-emerald-300 font-mono font-semibold">~{topology.totalEstimatedRequests} reqs</span>
            </div>
          </div>
        </div>

        {/* Live Recharts Area Chart */}
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={topology.timelineData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="topologyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284c7" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="bg-gray-900 border border-gray-700 p-2.5 rounded-lg shadow-xl text-xs space-y-1 font-mono">
                        <div className="text-gray-400 font-sans font-semibold">Elapsed: {label} ({data.second}s)</div>
                        <div className="text-sky-400 font-bold">Total Virtual Users: {data.totalUsers}</div>
                        {topology.groupSchedules.map((g) => (
                          <div key={g.id} className="text-[11px] text-gray-300">
                            {g.name}: <span className="text-white">{data[g.name] || 0} VUs</span>
                          </div>
                        ))}
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="stepAfter"
                dataKey="totalUsers"
                stroke="#38bdf8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#topologyGrad)"
                name="Total Concurrent Users"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MAIN BUILDER BODY: TREE WORKBENCH OR FULL FLOW */}
      {viewMode === 'workbench' ? (
        /* JMETER WORKBENCH TREE LAYOUT */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Test Plan Tree Explorer (4 cols) */}
          <div className="lg:col-span-4 card space-y-3 p-3 bg-gray-950/90 border border-gray-800">
            <div className="flex items-center justify-between pb-2 border-b border-gray-800">
              <div className="flex items-center space-x-2 text-xs font-bold text-gray-200">
                <FolderTree className="w-4 h-4 text-sky-400" />
                <span>Test Plan Workbench Tree</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">
                {planForm.thread_groups.length} TG • {planForm.config_elements.length} CE • {planForm.assertions.length} AS
              </span>
            </div>

            {/* Tree Nodes List */}
            <div className="space-y-1 font-mono text-xs select-none">
              {/* Root Test Plan Node */}
              <button
                type="button"
                onClick={() => setSelectedNode('plan_root')}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                  selectedNode === 'plan_root'
                    ? 'bg-sky-950 text-sky-200 border border-sky-700/80 font-semibold'
                    : 'text-gray-300 hover:bg-gray-900 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">{planForm.name || 'Test Plan'}</span>
                </div>
                <span className="text-[10px] text-gray-500 font-sans">Root</span>
              </button>

              {/* SECTION: Config Elements */}
              <div className="pl-3 space-y-1 pt-1">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-sans font-semibold flex items-center justify-between pr-1">
                  <span>Config Elements ({planForm.config_elements.length})</span>
                  <button
                    type="button"
                    onClick={() => handleAddConfigElement('think_time')}
                    className="hover:text-emerald-400"
                    title="Quick add timer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {planForm.config_elements.map((ce, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedNode(`ce-${idx}`)}
                    className={`w-full text-left pl-3 pr-2 py-1 rounded-md flex items-center justify-between transition-colors ${
                      selectedNode === `ce-${idx}`
                        ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-700 font-medium'
                        : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      {ce.type === 'csv_data_set' && <Database className="w-3 h-3 text-emerald-400 shrink-0" />}
                      {(ce.type === 'think_time' || ce.type === 'timer') && <Clock className="w-3 h-3 text-cyan-400 shrink-0" />}
                      {ce.type === 'auth_header' && <Key className="w-3 h-3 text-amber-400 shrink-0" />}
                      {ce.type === 'token_budget' && <Sliders className="w-3 h-3 text-purple-400 shrink-0" />}
                      {ce.type === 'user_defined_variables' && <Code className="w-3 h-3 text-sky-400 shrink-0" />}
                      <span className="truncate font-sans text-xs">
                        {ce.type === 'csv_data_set' && 'CSV Data Set'}
                        {(ce.type === 'think_time' || ce.type === 'timer') && `Pacing (${ce.timer_type || 'uniform'})`}
                        {ce.type === 'auth_header' && 'HTTP Auth Header'}
                        {ce.type === 'token_budget' && 'Token Budget'}
                        {ce.type === 'user_defined_variables' && 'User Variables (UDV)'}
                      </span>
                    </div>
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveConfigElement(idx)
                      }}
                      className="text-gray-500 hover:text-red-400 p-0.5 rounded"
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </span>
                  </button>
                ))}
              </div>

              {/* SECTION: Thread Groups */}
              <div className="pl-3 space-y-1 pt-1.5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-sans font-semibold flex items-center justify-between pr-1">
                  <span>Thread Groups ({planForm.thread_groups.length})</span>
                  <button
                    type="button"
                    onClick={handleAddThreadGroup}
                    className="hover:text-indigo-400"
                    title="Add Thread Group"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {planForm.thread_groups.map((tg, idx) => (
                  <div key={tg.id || idx} className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedNode(`tg-${idx}`)}
                      className={`w-full text-left pl-3 pr-2 py-1 rounded-md flex items-center justify-between transition-colors ${
                        selectedNode === `tg-${idx}`
                          ? 'bg-indigo-950/80 text-indigo-200 border border-indigo-700 font-medium'
                          : 'text-gray-300 hover:bg-gray-900 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 truncate">
                        <Users className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span className="truncate font-sans text-xs font-semibold">{tg.name}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {tg.target_users} VU
                      </span>
                    </button>

                    {/* Child Sampler Node */}
                    <div className="pl-5">
                      <div className="flex items-center space-x-1.5 text-[11px] text-gray-400 py-0.5">
                        <Zap className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                        <span className="truncate font-mono">{tg.model || 'Sampler (LLM Chat)'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* SECTION: Assertions */}
              <div className="pl-3 space-y-1 pt-1.5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-sans font-semibold flex items-center justify-between pr-1">
                  <span>SLA Assertions ({planForm.assertions.length})</span>
                  <button
                    type="button"
                    onClick={() => handleAddAssertion('latency')}
                    className="hover:text-amber-400"
                    title="Quick add assertion"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {planForm.assertions.map((a, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedNode(`as-${idx}`)}
                    className={`w-full text-left pl-3 pr-2 py-1 rounded-md flex items-center justify-between transition-colors ${
                      selectedNode === `as-${idx}`
                        ? 'bg-amber-950/80 text-amber-200 border border-amber-700 font-medium'
                        : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      <ShieldCheck className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="truncate font-sans text-xs">{a.name || a.type}</span>
                    </div>
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveAssertion(idx)
                      }}
                      className="text-gray-500 hover:text-red-400 p-0.5 rounded"
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </span>
                  </button>
                ))}
              </div>

              {/* SECTION: Listeners */}
              <div className="pl-3 pt-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedNode('listeners')}
                  className={`w-full text-left pl-3 pr-2 py-1.5 rounded-md flex items-center justify-between transition-colors ${
                    selectedNode === 'listeners'
                      ? 'bg-sky-950/80 text-sky-200 border border-sky-700 font-medium'
                      : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <BarChart3 className="w-3 h-3 text-sky-400" />
                    <span className="font-sans text-xs">Listeners &amp; Reports ({planForm.listeners.length})</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Tree Add Elements Bar */}
            <div className="pt-2 border-t border-gray-800 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleAddThreadGroup}
                className="btn-secondary text-[11px] py-1 px-2 flex items-center justify-center space-x-1 border border-indigo-500/30 text-indigo-300 hover:text-white"
              >
                <Plus className="w-3 h-3 text-indigo-400" />
                <span>+ Thread Group</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddConfigElement('think_time')}
                className="btn-secondary text-[11px] py-1 px-2 flex items-center justify-center space-x-1 border border-emerald-500/30 text-emerald-300 hover:text-white"
              >
                <Plus className="w-3 h-3 text-emerald-400" />
                <span>+ Pacing Timer</span>
              </button>
            </div>
          </div>

          {/* Right Column: Node Inspector Panel (8 cols) */}
          <div className="lg:col-span-8 card space-y-5 bg-gray-950/90 border border-gray-800">
            {/* INSPECTOR: Plan Root */}
            {selectedNode === 'plan_root' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-5 h-5 text-sky-400" />
                    <div>
                      <h3 className="text-base font-bold text-white">Test Plan Configuration</h3>
                      <p className="text-xs text-gray-400">Global settings and shared execution parameters.</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-gray-800 text-gray-300">
                    JMeter TestPlan Element
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="label">Plan Name</label>
                    <input
                      type="text"
                      className="input font-medium"
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Plan Description &amp; Goals</label>
                    <textarea
                      rows={2}
                      className="input text-xs w-full"
                      value={planForm.description}
                      onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                    />
                  </div>
                </div>

                {/* Quick Add Shortcuts */}
                <div className="pt-3 border-t border-gray-800 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddConfigElement('user_defined_variables')}
                    className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1.5"
                  >
                    <Code className="w-3.5 h-3.5 text-sky-400" />
                    <span>+ Add User Defined Variables</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddConfigElement('csv_data_set')}
                    className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1.5"
                  >
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                    <span>+ Add CSV Data Set</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddAssertion('latency')}
                    className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>+ Add Latency Assertion</span>
                  </button>
                </div>
              </div>
            )}

            {/* INSPECTOR: Thread Group */}
            {selectedNode.startsWith('tg-') && (() => {
              const tgIdx = parseInt(selectedNode.replace('tg-', ''), 10)
              const tg = planForm.thread_groups[tgIdx]
              if (!tg) return <div className="text-gray-400 text-xs">Thread Group not found.</div>
              const availableModels = modelsCache[tg.runtime_id] || []

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                    <div className="flex items-center space-x-2.5">
                      <span className="w-6 h-6 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/70 flex items-center justify-center text-xs font-bold">
                        {tgIdx + 1}
                      </span>
                      <div>
                        <h3 className="text-base font-bold text-white">Thread Group: {tg.name}</h3>
                        <p className="text-xs text-gray-400">Concurrency profile and LLM Chat Sampler parameters.</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleDuplicateThreadGroup(tgIdx)}
                        className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1"
                        title="Duplicate Thread Group"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                      {planForm.thread_groups.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveThreadGroup(tgIdx)}
                          className="btn-danger text-xs py-1 px-2"
                          title="Remove"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Thread Group Name */}
                  <div>
                    <label className="text-[11px] font-medium text-gray-400 mb-1 block">Group Name</label>
                    <input
                      type="text"
                      className="input text-xs font-semibold py-1.5"
                      value={tg.name}
                      onChange={(e) => handleUpdateThreadGroup(tgIdx, 'name', e.target.value)}
                    />
                  </div>

                  {/* Runtime & Model */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-gray-400 mb-1 block">Runtime Endpoint</label>
                      <select
                        className="select text-xs py-1.5"
                        value={tg.runtime_id}
                        onChange={(e) => handleUpdateThreadGroup(tgIdx, 'runtime_id', e.target.value)}
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
                      <label className="text-[11px] font-medium text-gray-400 mb-1 block">Model Sampler</label>
                      {availableModels.length > 0 ? (
                        <select
                          className="select text-xs py-1.5 font-mono"
                          value={tg.model}
                          onChange={(e) => handleUpdateThreadGroup(tgIdx, 'model', e.target.value)}
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
                          onChange={(e) => handleUpdateThreadGroup(tgIdx, 'model', e.target.value)}
                        />
                      )}
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-gray-400 mb-1 block">Traffic Pattern</label>
                      <select
                        className="select text-xs py-1.5"
                        value={tg.pattern}
                        onChange={(e) => handleUpdateThreadGroup(tgIdx, 'pattern', e.target.value)}
                      >
                        <option value="rampup">Ramp-up (Stepped increase)</option>
                        <option value="constant">Constant (Steady sustained concurrency)</option>
                        <option value="spike">Spike (Sudden pulse surge)</option>
                        <option value="stress">Stress (Step to saturation)</option>
                      </select>
                    </div>
                  </div>

                  {/* Stepping Thread Schedule Parameters */}
                  <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 space-y-3">
                    <div className="text-xs font-semibold text-gray-200 flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      <span>Concurrency &amp; Stepping Profile</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                          Target Users (Threads)
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="input text-xs py-1 px-2"
                          value={tg.target_users}
                          onChange={(e) => handleUpdateThreadGroup(tgIdx, 'target_users', parseInt(e.target.value) || 1)}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                          Duration (seconds)
                        </label>
                        <input
                          type="number"
                          min="5"
                          className="input text-xs py-1 px-2"
                          value={tg.duration_seconds}
                          onChange={(e) => handleUpdateThreadGroup(tgIdx, 'duration_seconds', parseInt(e.target.value) || 10)}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                          Ramp Step Users
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="input text-xs py-1 px-2"
                          value={tg.rampup_step_users}
                          onChange={(e) => handleUpdateThreadGroup(tgIdx, 'rampup_step_users', parseInt(e.target.value) || 1)}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                          Ramp Step Time (s)
                        </label>
                        <input
                          type="number"
                          min="2"
                          className="input text-xs py-1 px-2"
                          value={tg.rampup_step_seconds}
                          onChange={(e) => handleUpdateThreadGroup(tgIdx, 'rampup_step_seconds', parseInt(e.target.value) || 5)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* LLM Generation Hyperparameters */}
                  <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 space-y-3">
                    <div className="text-xs font-semibold text-gray-200 flex items-center space-x-2">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>LLM Sampler Hyperparameters</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                          Max Tokens
                        </label>
                        <input
                          type="number"
                          min="16"
                          className="input text-xs py-1 px-2"
                          value={tg.max_tokens}
                          onChange={(e) => handleUpdateThreadGroup(tgIdx, 'max_tokens', parseInt(e.target.value) || 128)}
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
                          onChange={(e) => handleUpdateThreadGroup(tgIdx, 'temperature', parseFloat(e.target.value) || 0.7)}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                          Request Timeout (s)
                        </label>
                        <input
                          type="number"
                          min="5"
                          className="input text-xs py-1 px-2"
                          value={tg.request_timeout}
                          onChange={(e) => handleUpdateThreadGroup(tgIdx, 'request_timeout', parseFloat(e.target.value) || 120)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-gray-400 mb-1 block">
                        System Prompt / Preamble (Optional)
                      </label>
                      <textarea
                        rows={2}
                        className="input text-xs font-mono w-full"
                        placeholder="e.g. You are a helpful AI assistant. Answer concisely using ${USER_VARIABLE}."
                        value={tg.system_prompt || ''}
                        onChange={(e) => handleUpdateThreadGroup(tgIdx, 'system_prompt', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* INSPECTOR: Config Element */}
            {selectedNode.startsWith('ce-') && (() => {
              const ceIdx = parseInt(selectedNode.replace('ce-', ''), 10)
              const ce = planForm.config_elements[ceIdx]
              if (!ce) return <div className="text-gray-400 text-xs">Config Element not found.</div>

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                    <div className="flex items-center space-x-2">
                      {ce.type === 'csv_data_set' && <Database className="w-5 h-5 text-emerald-400" />}
                      {(ce.type === 'think_time' || ce.type === 'timer') && <Clock className="w-5 h-5 text-cyan-400" />}
                      {ce.type === 'auth_header' && <Key className="w-5 h-5 text-amber-400" />}
                      {ce.type === 'token_budget' && <Sliders className="w-5 h-5 text-purple-400" />}
                      {ce.type === 'user_defined_variables' && <Code className="w-5 h-5 text-sky-400" />}
                      <div>
                        <h3 className="text-base font-bold text-white">
                          {ce.type === 'csv_data_set' && 'CSV Prompt Data Set'}
                          {(ce.type === 'think_time' || ce.type === 'timer') && 'Pacing Timer (Think Time)'}
                          {ce.type === 'auth_header' && 'HTTP Authorization Header'}
                          {ce.type === 'token_budget' && 'Token Budget Override'}
                          {ce.type === 'user_defined_variables' && 'User Defined Variables (UDV)'}
                        </h3>
                        <p className="text-xs text-gray-400">JMeter Config Element transformation.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveConfigElement(ceIdx)}
                      className="btn-danger text-xs py-1 px-2.5 flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove Element</span>
                    </button>
                  </div>

                  {/* USER DEFINED VARIABLES (UDVs) */}
                  {ce.type === 'user_defined_variables' && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-400">
                        Define variables referenced in system prompts, headers, or models via syntax{' '}
                        <code className="text-sky-300 font-mono">${'{VAR_NAME}'}</code>.
                      </p>
                      <div className="space-y-2">
                        {Object.entries(ce.variables || {}).map(([k, v], vIdx) => (
                          <div key={vIdx} className="grid grid-cols-12 gap-2 items-center">
                            <input
                              type="text"
                              className="col-span-5 input text-xs font-mono py-1"
                              placeholder="VARIABLE_NAME"
                              value={k}
                              onChange={(e) => {
                                const newKey = e.target.value
                                const updatedVars = { ...ce.variables }
                                delete updatedVars[k]
                                updatedVars[newKey] = v
                                handleUpdateConfigElement(ceIdx, 'variables', updatedVars)
                              }}
                            />
                            <input
                              type="text"
                              className="col-span-6 input text-xs font-mono py-1"
                              placeholder="Value"
                              value={v}
                              onChange={(e) => {
                                const updatedVars = { ...ce.variables, [k]: e.target.value }
                                handleUpdateConfigElement(ceIdx, 'variables', updatedVars)
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updatedVars = { ...ce.variables }
                                delete updatedVars[k]
                                handleUpdateConfigElement(ceIdx, 'variables', updatedVars)
                              }}
                              className="col-span-1 p-1 text-gray-500 hover:text-red-400 flex justify-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const updatedVars = { ...ce.variables, [`VAR_${Date.now()}`]: '' }
                          handleUpdateConfigElement(ceIdx, 'variables', updatedVars)
                        }}
                        className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1"
                      >
                        <Plus className="w-3 h-3 text-sky-400" />
                        <span>Add Variable</span>
                      </button>
                    </div>
                  )}

                  {/* CSV DATA SET */}
                  {ce.type === 'csv_data_set' && (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-gray-400 block mb-1">Sampling Mode</label>
                          <select
                            className="select text-xs py-1"
                            value={ce.mode || 'random'}
                            onChange={(e) => handleUpdateConfigElement(ceIdx, 'mode', e.target.value)}
                          >
                            <option value="random">Random Sampling</option>
                            <option value="sequential">Sequential Loop</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-gray-400 block mb-1">CSV Column (optional)</label>
                          <input
                            type="text"
                            className="input text-xs py-1"
                            placeholder="prompt"
                            value={ce.column || ''}
                            onChange={(e) => handleUpdateConfigElement(ceIdx, 'column', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-gray-400 block mb-1">Upload File</label>
                          <label className="btn-secondary text-xs py-1 px-2.5 cursor-pointer flex items-center justify-center space-x-1 border border-gray-700">
                            <Upload className="w-3 h-3" />
                            <span>Select .txt / .csv</span>
                            <input
                              type="file"
                              accept=".txt,.csv"
                              className="hidden"
                              onChange={(e) => handleFileUpload(ceIdx, e)}
                            />
                          </label>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                          <span>Prompt Dataset (one per line):</span>
                          <span className="font-mono text-emerald-400">
                            {ce.data ? ce.data.split('\n').filter((l) => l.trim()).length : 0} items
                          </span>
                        </div>
                        <textarea
                          rows={6}
                          className="input font-mono text-xs w-full"
                          placeholder="Enter prompts, one per line..."
                          value={ce.data || ''}
                          onChange={(e) => handleUpdateConfigElement(ceIdx, 'data', e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {/* PACING TIMER (Think Time) */}
                  {(ce.type === 'think_time' || ce.type === 'timer') && (
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-gray-400 block mb-1">Timer Distribution Type</label>
                        <select
                          className="select text-xs py-1"
                          value={ce.timer_type || 'uniform'}
                          onChange={(e) => handleUpdateConfigElement(ceIdx, 'timer_type', e.target.value)}
                        >
                          <option value="uniform">Uniform Random Timer (Jitter min..max)</option>
                          <option value="constant">Constant Timer (Fixed pacing ms)</option>
                          <option value="gaussian">Gaussian Random Timer (Mean ± Deviation)</option>
                        </select>
                      </div>

                      {ce.timer_type === 'constant' ? (
                        <div>
                          <label className="text-gray-400 block mb-1">Constant Delay (ms):</label>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            className="input text-xs py-1 w-48"
                            value={ce.delay_ms ?? 400}
                            onChange={(e) => handleUpdateConfigElement(ceIdx, 'delay_ms', parseInt(e.target.value) || 0)}
                          />
                        </div>
                      ) : ce.timer_type === 'gaussian' ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-gray-400 block mb-1">Mean Delay (ms):</label>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              className="input text-xs py-1"
                              value={ce.delay_ms ?? 500}
                              onChange={(e) => handleUpdateConfigElement(ceIdx, 'delay_ms', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div>
                            <label className="text-gray-400 block mb-1">Deviation (ms):</label>
                            <input
                              type="number"
                              min="0"
                              step="25"
                              className="input text-xs py-1"
                              value={ce.deviation_ms ?? 150}
                              onChange={(e) => handleUpdateConfigElement(ceIdx, 'deviation_ms', parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-gray-400 block mb-1">Minimum Jitter (ms):</label>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              className="input text-xs py-1"
                              value={ce.min_ms ?? 200}
                              onChange={(e) => handleUpdateConfigElement(ceIdx, 'min_ms', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div>
                            <label className="text-gray-400 block mb-1">Maximum Jitter (ms):</label>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              className="input text-xs py-1"
                              value={ce.max_ms ?? 800}
                              onChange={(e) => handleUpdateConfigElement(ceIdx, 'max_ms', parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AUTH HEADER */}
                  {ce.type === 'auth_header' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-gray-400 block mb-1">Header Key:</label>
                        <input
                          type="text"
                          className="input text-xs py-1 font-mono"
                          value={ce.key || ''}
                          onChange={(e) => handleUpdateConfigElement(ceIdx, 'key', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-gray-400 block mb-1">Header Value:</label>
                        <input
                          type="text"
                          className="input text-xs py-1 font-mono"
                          value={ce.value || ''}
                          onChange={(e) => handleUpdateConfigElement(ceIdx, 'value', e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {/* TOKEN BUDGET */}
                  {ce.type === 'token_budget' && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-gray-400 block mb-1">Override Max Tokens:</label>
                        <input
                          type="number"
                          min="1"
                          className="input text-xs py-1"
                          value={ce.max_tokens ?? ''}
                          onChange={(e) => handleUpdateConfigElement(ceIdx, 'max_tokens', parseInt(e.target.value) || undefined)}
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
                          onChange={(e) => handleUpdateConfigElement(ceIdx, 'temperature', parseFloat(e.target.value) || undefined)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* INSPECTOR: Assertion */}
            {selectedNode.startsWith('as-') && (() => {
              const asIdx = parseInt(selectedNode.replace('as-', ''), 10)
              const a = planForm.assertions[asIdx]
              if (!a) return <div className="text-gray-400 text-xs">Assertion not found.</div>

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-5 h-5 text-amber-400" />
                      <div>
                        <h3 className="text-base font-bold text-white">SLA Assertion: {a.name || a.type}</h3>
                        <p className="text-xs text-gray-400">Strict pass/fail criteria evaluation.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAssertion(asIdx)}
                      className="btn-danger text-xs py-1 px-2.5 flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove Assertion</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-medium text-gray-400 mb-1 block">Assertion Name</label>
                      <input
                        type="text"
                        className="input text-xs font-medium py-1.5"
                        value={a.name || ''}
                        onChange={(e) => handleUpdateAssertion(asIdx, 'name', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-gray-400 mb-1 block">Threshold SLA Limit</label>
                      {a.type === 'latency' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            className="input text-xs py-1 w-32"
                            value={a.p95_max_ms ?? ''}
                            onChange={(e) => handleUpdateAssertion(asIdx, 'p95_max_ms', parseFloat(e.target.value) || 0)}
                          />
                          <span className="text-xs text-gray-400">milliseconds max p95 response time</span>
                        </div>
                      )}
                      {a.type === 'p99_latency' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            className="input text-xs py-1 w-32"
                            value={a.p99_max_ms ?? ''}
                            onChange={(e) => handleUpdateAssertion(asIdx, 'p99_max_ms', parseFloat(e.target.value) || 0)}
                          />
                          <span className="text-xs text-gray-400">milliseconds max p99 latency tail</span>
                        </div>
                      )}
                      {a.type === 'error_rate' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            step="0.5"
                            className="input text-xs py-1 w-32"
                            value={a.max_pct ?? ''}
                            onChange={(e) => handleUpdateAssertion(asIdx, 'max_pct', parseFloat(e.target.value) || 0)}
                          />
                          <span className="text-xs text-gray-400">% maximum allowed error failures</span>
                        </div>
                      )}
                      {a.type === 'ttft' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            className="input text-xs py-1 w-32"
                            value={a.max_ms ?? ''}
                            onChange={(e) => handleUpdateAssertion(asIdx, 'max_ms', parseFloat(e.target.value) || 0)}
                          />
                          <span className="text-xs text-gray-400">milliseconds max average Time To First Token</span>
                        </div>
                      )}
                      {a.type === 'tokens_per_second' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            step="1"
                            className="input text-xs py-1 w-32"
                            value={a.min_tps ?? ''}
                            onChange={(e) => handleUpdateAssertion(asIdx, 'min_tps', parseFloat(e.target.value) || 0)}
                          />
                          <span className="text-xs text-gray-400">minimum generated tokens per second (TPS)</span>
                        </div>
                      )}
                      {a.type === 'quality' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            className="input text-xs py-1 w-32"
                            value={a.min_rate ?? ''}
                            onChange={(e) => handleUpdateAssertion(asIdx, 'min_rate', parseFloat(e.target.value) || 0)}
                          />
                          <span className="text-xs text-gray-400">rate of valid non-empty responses (0.95 = 95%)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* INSPECTOR: Listeners */}
            {selectedNode === 'listeners' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5 text-sky-400" />
                    <div>
                      <h3 className="text-base font-bold text-white">Listeners &amp; Report Collectors</h3>
                      <p className="text-xs text-gray-400">Configure multi-dimensional metrics to collect.</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <button type="button" onClick={handleSelectAllListeners} className="text-sky-400 hover:underline">
                      Select All
                    </button>
                    <span className="text-gray-600">|</span>
                    <button type="button" onClick={handleClearAllListeners} className="text-gray-400 hover:underline">
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ALL_LISTENERS.map((lis) => {
                    const checked = planForm.listeners.includes(lis.id)
                    return (
                      <label
                        key={lis.id}
                        className={`p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition-colors ${
                          checked
                            ? 'bg-sky-950/40 border-sky-600/60 text-white'
                            : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:border-gray-700'
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
            )}
          </div>
        </div>
      ) : (
        /* FULL FLOW STACK VIEW (ALL EXPANDED) */
        <div className="space-y-6">
          {/* Section 1: Thread Groups */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Thread Groups ({planForm.thread_groups.length})</h3>
                  <p className="text-xs text-gray-400">Workload profiles and runtime sampler bindings.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddThreadGroup}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1 border border-indigo-500/30 text-indigo-300 hover:text-white"
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
                    className="p-4 rounded-xl bg-gray-950/70 border border-gray-800/80 space-y-3.5"
                  >
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
                        />
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleDuplicateThreadGroup(idx)}
                          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200"
                          title="Duplicate"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {planForm.thread_groups.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveThreadGroup(idx)}
                            className="p-1.5 rounded hover:bg-red-900/30 text-gray-400 hover:text-red-400"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

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
                          <option value="stress">Stress (Step to saturation)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 pt-1">
                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">Users</label>
                        <input
                          type="number"
                          min="1"
                          className="input text-xs py-1 px-2"
                          value={tg.target_users}
                          onChange={(e) => handleUpdateThreadGroup(idx, 'target_users', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">Duration (s)</label>
                        <input
                          type="number"
                          min="5"
                          className="input text-xs py-1 px-2"
                          value={tg.duration_seconds}
                          onChange={(e) => handleUpdateThreadGroup(idx, 'duration_seconds', parseInt(e.target.value) || 10)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">Step Users</label>
                        <input
                          type="number"
                          min="1"
                          className="input text-xs py-1 px-2"
                          value={tg.rampup_step_users}
                          onChange={(e) => handleUpdateThreadGroup(idx, 'rampup_step_users', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">Step Time (s)</label>
                        <input
                          type="number"
                          min="2"
                          className="input text-xs py-1 px-2"
                          value={tg.rampup_step_seconds}
                          onChange={(e) => handleUpdateThreadGroup(idx, 'rampup_step_seconds', parseInt(e.target.value) || 5)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">Max Tokens</label>
                        <input
                          type="number"
                          min="16"
                          className="input text-xs py-1 px-2"
                          value={tg.max_tokens}
                          onChange={(e) => handleUpdateThreadGroup(idx, 'max_tokens', parseInt(e.target.value) || 128)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">Temperature</label>
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
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 2: Config Elements */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center space-x-2">
                <Sliders className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Config Elements ({planForm.config_elements.length})</h3>
                  <p className="text-xs text-gray-400">Timers, User Defined Variables, CSV pools, and auth headers.</p>
                </div>
              </div>

              {/* Add Dropdown */}
              <div className="relative" ref={configDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowConfigDropdown((prev) => !prev)}
                  className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-emerald-500/30 text-emerald-300"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Add Config Element</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {showConfigDropdown && (
                  <div className="absolute right-0 mt-1.5 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-30 py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleAddConfigElement('user_defined_variables')
                        setShowConfigDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 flex items-center space-x-2.5"
                    >
                      <Code className="w-4 h-4 text-sky-400" />
                      <div>
                        <div className="font-medium text-white">User Defined Variables (UDV)</div>
                        <div className="text-[10px] text-gray-400">Key-value parameters (${'{VAR}'})</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleAddConfigElement('think_time')
                        setShowConfigDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 flex items-center space-x-2.5"
                    >
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <div>
                        <div className="font-medium text-white">Pacing Timer (Think Time)</div>
                        <div className="text-[10px] text-gray-400">Uniform, Gaussian, or Constant delay</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleAddConfigElement('csv_data_set')
                        setShowConfigDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 flex items-center space-x-2.5"
                    >
                      <Database className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="font-medium text-white">CSV Prompt Data Set</div>
                        <div className="text-[10px] text-gray-400">Custom user prompts from file</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {planForm.config_elements.map((ce, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-gray-950/70 border border-gray-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-white">
                  {ce.type === 'csv_data_set' && 'CSV Data Set Config'}
                  {(ce.type === 'think_time' || ce.type === 'timer') && `Pacing Timer (${ce.timer_type || 'uniform'})`}
                  {ce.type === 'user_defined_variables' && 'User Defined Variables'}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveConfigElement(idx)}
                  className="p-1 text-gray-400 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Section 3: Assertions */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-bold text-white">SLA Assertions ({planForm.assertions.length})</h3>
                  <p className="text-xs text-gray-400">Response time, error rate, and throughput thresholds.</p>
                </div>
              </div>

              <div className="relative" ref={assertionDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowAssertionDropdown((prev) => !prev)}
                  className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-amber-500/30 text-amber-300"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Add Assertion</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {showAssertionDropdown && (
                  <div className="absolute right-0 mt-1.5 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-30 py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleAddAssertion('latency')
                        setShowAssertionDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 flex items-center space-x-2.5"
                    >
                      <Clock className="w-4 h-4 text-amber-400" />
                      <div>
                        <div className="font-medium text-white">Latency p95 SLA</div>
                        <div className="text-[10px] text-gray-400">Response time threshold (ms)</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleAddAssertion('p99_latency')
                        setShowAssertionDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 flex items-center space-x-2.5"
                    >
                      <Clock className="w-4 h-4 text-orange-400" />
                      <div>
                        <div className="font-medium text-white">Latency p99 SLA</div>
                        <div className="text-[10px] text-gray-400">Tail latency limit (ms)</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleAddAssertion('error_rate')
                        setShowAssertionDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 flex items-center space-x-2.5"
                    >
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <div>
                        <div className="font-medium text-white">Error Rate (%)</div>
                        <div className="text-[10px] text-gray-400">Max failure rate cap</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {planForm.assertions.map((a, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-gray-950/70 border border-gray-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-white">{a.name}</span>
                    <span className="text-gray-400 ml-2 font-mono">({a.type})</span>
                  </div>
                  <button type="button" onClick={() => handleRemoveAssertion(idx)} className="p-1 text-gray-400 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ACTION FOOTER */}
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

      {/* BLUEPRINTS / TEMPLATES MODAL */}
      {showBlueprintsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">JMeter Test Plan Blueprints</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBlueprintsModal(false)}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Select an industry-standard load profile blueprint to populate this plan with proven stepping concurrency models and SLA thresholds.
            </p>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {JMETER_BLUEPRINTS.map((bp) => (
                <div
                  key={bp.id}
                  className="p-4 rounded-xl bg-gray-950/80 border border-gray-800 hover:border-amber-500/50 transition-all flex items-start justify-between gap-4 group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                        {bp.title}
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-950/80 text-amber-300 border border-amber-800">
                        {bp.badge}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{bp.desc}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleLoadBlueprint(bp)}
                    className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap shrink-0"
                  >
                    Load Blueprint
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* EXPORT & SNIPPETS MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center space-x-2.5">
                <Terminal className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Execution Code &amp; API Snippets</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center space-x-2 border-b border-gray-800 pb-2">
              <button
                type="button"
                onClick={() => setActiveSnippetTab('curl')}
                className={`text-xs px-3 py-1 rounded font-medium ${
                  activeSnippetTab === 'curl' ? 'bg-sky-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                cURL Command
              </button>
              <button
                type="button"
                onClick={() => setActiveSnippetTab('python')}
                className={`text-xs px-3 py-1 rounded font-medium ${
                  activeSnippetTab === 'python' ? 'bg-sky-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Python Script
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="text-xs px-3 py-1 text-gray-400 hover:text-white ml-auto"
              >
                Download JSON Plan
              </button>
            </div>

            <div className="relative">
              <pre className="p-3 bg-gray-950 rounded-xl border border-gray-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-64">
                {activeSnippetTab === 'curl' ? snippets.curl : snippets.python}
              </pre>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(activeSnippetTab === 'curl' ? snippets.curl : snippets.python)
                  setCopiedSnippet(true)
                  setTimeout(() => setCopiedSnippet(false), 2500)
                }}
                className="absolute top-2.5 right-2.5 btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSnippet ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT JSON MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center space-x-2.5">
                <Upload className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">Import Test Plan JSON</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Paste a previously exported DynoLLM test plan JSON to import its configuration into the studio.
            </p>

            <textarea
              rows={8}
              className="input font-mono text-xs w-full"
              placeholder='{\n  "name": "Imported Plan",\n  "thread_groups": [...]\n}'
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
            />

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyImportJson}
                disabled={!importJsonText.trim()}
                className="btn-primary text-xs py-1.5 px-4"
              >
                Apply Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
