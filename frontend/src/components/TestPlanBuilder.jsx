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
  EyeOff,
  Settings,
  Activity,
  Check,
  X,
  FileCode,
  Sparkles,
  FlaskConical,
  Gauge,
  Radio,
  FileJson,
  Cpu,
  CornerDownRight,
  PlayCircle,
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
import { loadTestPlansApi } from '../services/api'
import { Spinner, Alert } from './ui'
import {
  JMETER_BLUEPRINTS,
  PROMPT_SUITES,
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
  sampler_type: 'chat',
  pattern: 'rampup',
  target_users: 10,
  duration_seconds: 60,
  rampup_step_users: 5,
  rampup_step_seconds: 10,
  rampdown_seconds: 0,
  loop_count: null,
  target_rps: null,
  system_prompt: '',
  temperature: 0.7,
  top_p: 1.0,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  streaming: true,
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
  const [selectedNode, setSelectedNode] = useState('plan_root')

  // Topology Chart metric view: 'users' | 'rps' | 'tokens'
  const [topologyMetric, setTopologyMetric] = useState('users')

  // Thread Group Inspector sub-tab: 'schedule' | 'hyperparams' | 'payload_preview'
  const [activeTgTab, setActiveTgTab] = useState('schedule')

  // Validation Probe modal & single sampler probe state
  const [showProbeModal, setShowProbeModal] = useState(false)
  const [isProbing, setIsProbing] = useState(false)
  const [probeReport, setProbeReport] = useState(null)
  const [isProbingSampler, setIsProbingSampler] = useState(false)
  const [singleSamplerProbeResult, setSingleSamplerProbeResult] = useState(null)

  // Modals & Popovers
  const [showBlueprintsModal, setShowBlueprintsModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importJsonText, setImportJsonText] = useState('')
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const [activeSnippetTab, setActiveSnippetTab] = useState('curl') // 'curl' | 'python' | 'k6' | 'cli'

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
    serialize_threadgroups: false,
    thread_groups: [{ ...DEFAULT_THREAD_GROUP }],
    config_elements: [],
    assertions: [
      {
        type: 'latency',
        name: 'Latency p95 SLA',
        p95_max_ms: 2500,
        enabled: true,
      },
      {
        type: 'error_rate',
        name: 'Error Rate SLA',
        max_pct: 5.0,
        enabled: true,
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
        serialize_threadgroups: !!cfg.serialize_threadgroups,
        thread_groups: Array.isArray(cfg.thread_groups) && cfg.thread_groups.length > 0
          ? cfg.thread_groups.map((tg, i) => ({
              ...DEFAULT_THREAD_GROUP,
              ...tg,
              id: tg.id || `tg-${i + 1}`,
              enabled: tg.enabled !== false,
            }))
          : [{ ...DEFAULT_THREAD_GROUP, id: 'tg-1' }],
        config_elements: Array.isArray(cfg.config_elements)
          ? cfg.config_elements.map((ce) => ({ ...ce, enabled: ce.enabled !== false }))
          : [],
        assertions: Array.isArray(cfg.assertions)
          ? cfg.assertions.map((a) => ({ ...a, enabled: a.enabled !== false }))
          : [],
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

  // Toggle enabled state of a tree node
  const handleToggleNodeEnabled = (nodeType, index) => {
    setPlanForm((prev) => {
      if (nodeType === 'thread_group') {
        const updated = [...prev.thread_groups]
        updated[index] = { ...updated[index], enabled: updated[index].enabled === false }
        return { ...prev, thread_groups: updated }
      }
      if (nodeType === 'config_element') {
        const updated = [...prev.config_elements]
        updated[index] = { ...updated[index], enabled: updated[index].enabled === false }
        return { ...prev, config_elements: updated }
      }
      if (nodeType === 'assertion') {
        const updated = [...prev.assertions]
        updated[index] = { ...updated[index], enabled: updated[index].enabled === false }
        return { ...prev, assertions: updated }
      }
      return prev
    })
  }

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
      model: modelsCache[defaultRt]?.[0]?.name || '',
    }
    setPlanForm((prev) => ({
      ...prev,
      thread_groups: [...prev.thread_groups, newGroup],
    }))
    setSelectedNode(`tg-${newIdx}`)
    setActiveTgTab('schedule')
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
      base.data = PROMPT_SUITES[0].prompts.join('\n')
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
    } else if (type === 'header_manager') {
      base.headers = {
        'Content-Type': 'application/json',
        'X-Client-Version': '1.0.0',
      }
    } else if (type === 'token_budget') {
      base.max_tokens = 512
      base.temperature = 0.5
    } else if (type === 'user_defined_variables') {
      base.variables = {
        MODEL_NAME: 'meta-llama/Llama-3-8B',
        DEFAULT_TEMP: '0.7',
        API_TOKEN: 'sk-prod-dynollm-token',
        SYSTEM_ROLE: 'expert software architect',
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
    } else if (type === 'response_content') {
      base.name = 'Response Content Validation'
      base.content_pattern = ''
    } else if (type === 'status_code') {
      base.name = 'HTTP 200 OK Assertion'
      base.expected_status = 200
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
      serialize_threadgroups: false,
      thread_groups: updatedGroups,
      config_elements: (blueprint.config.config_elements || []).map((c) => ({ ...c, enabled: true })),
      assertions: (blueprint.config.assertions || []).map((a) => ({ ...a, enabled: true })),
      listeners: ALL_LISTENERS.map((l) => l.id),
    })

    setShowBlueprintsModal(false)
    setSelectedNode('plan_root')
    setSaveSuccessMsg(`Loaded blueprint: "${blueprint.title}"`)
    setTimeout(() => setSaveSuccessMsg(''), 4000)
  }

  // Export Apache JMeter JMX
  const handleExportJmx = () => {
    const xml = exportPlanToJmx(buildPlanPayload(), runtimes)
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
        serialize_threadgroups: !!parsed.serialize_threadgroups,
        thread_groups: parsed.thread_groups.map((tg, i) => ({
          ...DEFAULT_THREAD_GROUP,
          ...tg,
          id: tg.id || `tg-${i + 1}`,
          enabled: tg.enabled !== false,
        })),
        config_elements: (parsed.config_elements || []).map((ce) => ({ ...ce, enabled: ce.enabled !== false })),
        assertions: (parsed.assertions || []).map((a) => ({ ...a, enabled: a.enabled !== false })),
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
    return {
      id: planForm.id || undefined,
      name: planForm.name,
      description: planForm.description,
      serialize_threadgroups: !!planForm.serialize_threadgroups,
      thread_groups: planForm.thread_groups.map((tg) => ({
        id: tg.id,
        name: tg.name,
        enabled: tg.enabled !== false,
        runtime_id: tg.runtime_id,
        model: tg.model,
        sampler_type: tg.sampler_type || 'chat',
        pattern: tg.pattern || 'rampup',
        target_users: Number(tg.target_users) || 10,
        duration_seconds: Number(tg.duration_seconds) || 60,
        rampup_step_users: Number(tg.rampup_step_users) || 5,
        rampup_step_seconds: Number(tg.rampup_step_seconds) || 10,
        rampdown_seconds: Number(tg.rampdown_seconds) || 0,
        loop_count: tg.loop_count ? Number(tg.loop_count) : undefined,
        target_rps: tg.target_rps ? Number(tg.target_rps) : undefined,
        system_prompt: tg.system_prompt || undefined,
        temperature: Number(tg.temperature) || 0.7,
        top_p: tg.top_p != null ? Number(tg.top_p) : 1.0,
        frequency_penalty: Number(tg.frequency_penalty) || 0.0,
        presence_penalty: Number(tg.presence_penalty) || 0.0,
        seed: tg.seed ? Number(tg.seed) : undefined,
        streaming: tg.streaming !== false,
        max_tokens: Number(tg.max_tokens) || 256,
        request_timeout: Number(tg.request_timeout) || 120.0,
      })),
      config_elements: planForm.config_elements.map((ce) => {
        const item = { type: ce.type, enabled: ce.enabled !== false }
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
        } else if (ce.type === 'header_manager') {
          item.headers = ce.headers || {}
        } else if (ce.type === 'token_budget') {
          item.max_tokens = ce.max_tokens ? Number(ce.max_tokens) : undefined
          item.temperature = ce.temperature != null ? Number(ce.temperature) : undefined
        } else if (ce.type === 'user_defined_variables') {
          item.variables = ce.variables || {}
        }
        return item
      }),
      assertions: planForm.assertions.map((a) => {
        const item = { type: a.type, name: a.name, enabled: a.enabled !== false }
        if (a.type === 'latency') item.p95_max_ms = Number(a.p95_max_ms)
        else if (a.type === 'p99_latency') item.p99_max_ms = Number(a.p99_max_ms)
        else if (a.type === 'error_rate') item.max_pct = Number(a.max_pct)
        else if (a.type === 'quality') item.min_rate = Number(a.min_rate)
        else if (a.type === 'ttft') item.max_ms = Number(a.max_ms)
        else if (a.type === 'tokens_per_second') item.min_tps = Number(a.min_tps)
        else if (a.type === 'response_content') item.content_pattern = a.content_pattern
        else if (a.type === 'status_code') item.expected_status = Number(a.expected_status) || 200
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

  // Handle Full Plan Probe Validation (Dry-Run)
  const handleProbePlan = async () => {
    if (!validateForm()) return
    setIsProbing(true)
    setProbeReport(null)
    setShowProbeModal(true)
    try {
      const payload = buildPlanPayload()
      const result = await loadTestPlansApi.probe(payload)
      setProbeReport(result)
    } catch (err) {
      setProbeReport({
        success: false,
        overall_passed: false,
        error_message: err.message || 'Probe validation failed',
        probe_results: [],
      })
    } finally {
      setIsProbing(false)
    }
  }

  // Handle Single Sampler Probe Test inside Thread Group Inspector
  const handleProbeSingleSampler = async (tg) => {
    if (!tg.runtime_id || !tg.model) {
      alert('Please select a valid Runtime Endpoint and Model first.')
      return
    }
    setIsProbingSampler(true)
    setSingleSamplerProbeResult(null)
    try {
      const singleTgPlan = {
        ...buildPlanPayload(),
        thread_groups: [{ ...tg, enabled: true }],
      }
      const result = await loadTestPlansApi.probe(singleTgPlan)
      if (result.probe_results && result.probe_results.length > 0) {
        setSingleSamplerProbeResult(result.probe_results[0])
      }
    } catch (err) {
      setSingleSamplerProbeResult({
        success: false,
        error_message: err.message || 'Sampler probe failed',
      })
    } finally {
      setIsProbingSampler(false)
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
      serialize_threadgroups: false,
      thread_groups: [
        {
          ...DEFAULT_THREAD_GROUP,
          id: 'tg-1',
          runtime_id: defaultRt,
          model: modelsCache[defaultRt]?.[0]?.name || '',
        },
      ],
      config_elements: [],
      assertions: [
        {
          type: 'latency',
          name: 'Latency p95 SLA',
          p95_max_ms: 2500,
          enabled: true,
        },
        {
          type: 'error_rate',
          name: 'Error Rate SLA',
          max_pct: 5.0,
          enabled: true,
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

  // Interpolated Sampler Payload Preview
  const getSamplerPayloadPreview = (tg) => {
    const udvElement = planForm.config_elements.find(
      (ce) => ce.type === 'user_defined_variables' && ce.enabled !== false
    )
    const vars = udvElement?.variables || {}

    let modelName = tg.model || 'meta-llama/Llama-3-8B'
    let systemPrompt = tg.system_prompt || ''
    Object.entries(vars).forEach(([k, v]) => {
      const ph = `\${${k}}`
      modelName = modelName.replaceAll(ph, v)
      systemPrompt = systemPrompt.replaceAll(ph, v)
    })

    const payloadObj = {
      model: modelName,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: 'What is the speed of light in vacuum?' },
      ],
      stream: tg.streaming !== false,
      temperature: Number(tg.temperature) || 0.7,
      max_tokens: Number(tg.max_tokens) || 256,
      top_p: Number(tg.top_p) || 1.0,
      frequency_penalty: Number(tg.frequency_penalty) || 0.0,
      presence_penalty: Number(tg.presence_penalty) || 0.0,
    }

    return JSON.stringify(payloadObj, null, 2)
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
              Hierarchical Workbench tree, interactive workload schedule curve preview, 1-shot validation probes, and developer-grade assertions.
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

            {/* Validation Probe Button */}
            <button
              type="button"
              onClick={handleProbePlan}
              disabled={isProbing || isExecuting}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-purple-500/40 text-purple-300 hover:text-white hover:bg-purple-950/40 shadow-sm"
              title="Execute a single 1-shot dry-run probe to validate endpoints, authentication, and token generation"
            >
              <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
              <span>Validate Plan (Probe)</span>
            </button>

            {/* Blueprints Button */}
            <button
              type="button"
              onClick={() => setShowBlueprintsModal(true)}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1.5 border border-amber-500/30 text-amber-300 hover:text-white hover:bg-amber-950/30"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Blueprints</span>
            </button>

            {/* JMX & Snippets Export */}
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
              title="View cURL, Python, k6 and JMeter CLI commands"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Code &amp; CLI</span>
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
            
            {/* Metric Mode Switcher */}
            <div className="flex items-center bg-gray-900 border border-gray-800 rounded p-0.5 ml-2">
              <button
                type="button"
                onClick={() => setTopologyMetric('users')}
                className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
                  topologyMetric === 'users' ? 'bg-sky-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                VUs (Threads)
              </button>
              <button
                type="button"
                onClick={() => setTopologyMetric('rps')}
                className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
                  topologyMetric === 'rps' ? 'bg-sky-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Req/s
              </button>
              <button
                type="button"
                onClick={() => setTopologyMetric('tokens')}
                className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
                  topologyMetric === 'tokens' ? 'bg-sky-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Tokens/s
              </button>
            </div>
          </div>

          {/* Dynamic Calculated Statistics */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="text-gray-400">
              Duration: <span className="text-white font-mono font-semibold">{topology.totalDurationSeconds}s</span>
            </div>
            <div className="text-gray-400">
              Peak Concurrency: <span className="text-sky-300 font-mono font-semibold">{topology.peakUsers} VUs</span>
            </div>
            <div className="text-gray-400">
              Est. Invocations: <span className="text-emerald-300 font-mono font-semibold">~{topology.totalEstimatedRequests} reqs</span>
            </div>
            <div className="text-gray-400">
              Est. Tokens: <span className="text-amber-300 font-mono font-semibold">~{Math.round(topology.totalEstimatedTokens / 1000)}k tokens</span>
            </div>
          </div>
        </div>

        {/* Live Recharts Area Chart */}
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={topology.timelineData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="topologyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={topologyMetric === 'tokens' ? '#f59e0b' : topologyMetric === 'rps' ? '#10b981' : '#0284c7'}
                    stopOpacity={0.6}
                  />
                  <stop
                    offset="95%"
                    stopColor={topologyMetric === 'tokens' ? '#f59e0b' : topologyMetric === 'rps' ? '#10b981' : '#0284c7'}
                    stopOpacity={0.0}
                  />
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
                        <div className="text-sky-400 font-bold">Total Virtual Users: {data.totalUsers} VUs</div>
                        <div className="text-emerald-400">Projected Rate: ~{data.totalRps} req/s</div>
                        <div className="text-amber-400">Token Bandwidth: ~{data.totalTokensPerSec} tokens/s</div>
                        <div className="pt-1 border-t border-gray-800 space-y-0.5">
                          {topology.groupSchedules.map((g) => (
                            <div key={g.id} className="text-[11px] text-gray-300 flex justify-between gap-4">
                              <span>{g.name}:</span>
                              <span className="text-white font-semibold">{data[g.name] || 0} VUs</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="stepAfter"
                dataKey={topologyMetric === 'tokens' ? 'totalTokensPerSec' : topologyMetric === 'rps' ? 'totalRps' : 'totalUsers'}
                stroke={topologyMetric === 'tokens' ? '#fbbf24' : topologyMetric === 'rps' ? '#34d399' : '#38bdf8'}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#topologyGrad)"
                name={topologyMetric === 'tokens' ? 'Tokens per Second' : topologyMetric === 'rps' ? 'Requests per Second' : 'Concurrent VUs'}
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
                {planForm.thread_groups.filter((g) => g.enabled !== false).length}/{planForm.thread_groups.length} TG
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

                {planForm.config_elements.map((ce, idx) => {
                  const isEnabled = ce.enabled !== false
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedNode(`ce-${idx}`)}
                      className={`w-full text-left pl-3 pr-2 py-1 rounded-md flex items-center justify-between transition-colors ${
                        selectedNode === `ce-${idx}`
                          ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-700 font-medium'
                          : isEnabled
                          ? 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                          : 'text-gray-600 line-through hover:bg-gray-900/50'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 truncate">
                        {ce.type === 'csv_data_set' && <Database className={`w-3 h-3 shrink-0 ${isEnabled ? 'text-emerald-400' : 'text-gray-600'}`} />}
                        {(ce.type === 'think_time' || ce.type === 'timer') && <Clock className={`w-3 h-3 shrink-0 ${isEnabled ? 'text-cyan-400' : 'text-gray-600'}`} />}
                        {ce.type === 'auth_header' && <Key className={`w-3 h-3 shrink-0 ${isEnabled ? 'text-amber-400' : 'text-gray-600'}`} />}
                        {ce.type === 'header_manager' && <Sliders className={`w-3 h-3 shrink-0 ${isEnabled ? 'text-indigo-400' : 'text-gray-600'}`} />}
                        {ce.type === 'token_budget' && <Sliders className={`w-3 h-3 shrink-0 ${isEnabled ? 'text-purple-400' : 'text-gray-600'}`} />}
                        {ce.type === 'user_defined_variables' && <Code className={`w-3 h-3 shrink-0 ${isEnabled ? 'text-sky-400' : 'text-gray-600'}`} />}
                        <span className="truncate font-sans text-xs">
                          {ce.type === 'csv_data_set' && 'CSV Data Set'}
                          {(ce.type === 'think_time' || ce.type === 'timer') && `Pacing (${ce.timer_type || 'uniform'})`}
                          {ce.type === 'auth_header' && 'HTTP Auth Header'}
                          {ce.type === 'header_manager' && 'Header Manager'}
                          {ce.type === 'token_budget' && 'Token Budget'}
                          {ce.type === 'user_defined_variables' && 'User Variables (UDV)'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleNodeEnabled('config_element', idx)
                          }}
                          className={`p-0.5 rounded hover:text-white ${isEnabled ? 'text-gray-400' : 'text-gray-600'}`}
                          title={isEnabled ? 'Disable element' : 'Enable element'}
                        >
                          {isEnabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </span>
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
                      </div>
                    </button>
                  )
                })}
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

                {planForm.thread_groups.map((tg, idx) => {
                  const isEnabled = tg.enabled !== false
                  return (
                    <div key={tg.id || idx} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => setSelectedNode(`tg-${idx}`)}
                        className={`w-full text-left pl-3 pr-2 py-1 rounded-md flex items-center justify-between transition-colors ${
                          selectedNode === `tg-${idx}`
                            ? 'bg-indigo-950/80 text-indigo-200 border border-indigo-700 font-medium'
                            : isEnabled
                            ? 'text-gray-300 hover:bg-gray-900 hover:text-white'
                            : 'text-gray-600 line-through hover:bg-gray-900/50'
                        }`}
                      >
                        <div className="flex items-center space-x-1.5 truncate">
                          <Users className={`w-3 h-3 shrink-0 ${isEnabled ? 'text-indigo-400' : 'text-gray-600'}`} />
                          <span className="truncate font-sans text-xs font-semibold">{tg.name}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 shrink-0">
                          <span className="text-[10px] text-gray-400 font-mono">
                            {tg.target_users} VU
                          </span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleNodeEnabled('thread_group', idx)
                            }}
                            className={`p-0.5 rounded hover:text-white ${isEnabled ? 'text-gray-400' : 'text-gray-600'}`}
                            title={isEnabled ? 'Disable Thread Group' : 'Enable Thread Group'}
                          >
                            {isEnabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </span>
                        </div>
                      </button>

                      {/* Child Sampler Node */}
                      <div className="pl-5">
                        <div className={`flex items-center space-x-1.5 text-[11px] py-0.5 ${isEnabled ? 'text-gray-400' : 'text-gray-600'}`}>
                          <Zap className={`w-2.5 h-2.5 shrink-0 ${isEnabled ? 'text-amber-400' : 'text-gray-600'}`} />
                          <span className="truncate font-mono">{tg.model || 'LLM Sampler (Chat)'}</span>
                          {tg.streaming !== false && (
                            <span className="text-[9px] px-1 rounded bg-sky-950 text-sky-400 border border-sky-800">
                              stream
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
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

                {planForm.assertions.map((a, idx) => {
                  const isEnabled = a.enabled !== false
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedNode(`as-${idx}`)}
                      className={`w-full text-left pl-3 pr-2 py-1 rounded-md flex items-center justify-between transition-colors ${
                        selectedNode === `as-${idx}`
                          ? 'bg-amber-950/80 text-amber-200 border border-amber-700 font-medium'
                          : isEnabled
                          ? 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                          : 'text-gray-600 line-through hover:bg-gray-900/50'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 truncate">
                        <ShieldCheck className={`w-3 h-3 shrink-0 ${isEnabled ? 'text-amber-400' : 'text-gray-600'}`} />
                        <span className="truncate font-sans text-xs">{a.name || a.type}</span>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleNodeEnabled('assertion', idx)
                          }}
                          className={`p-0.5 rounded hover:text-white ${isEnabled ? 'text-gray-400' : 'text-gray-600'}`}
                          title={isEnabled ? 'Disable assertion' : 'Enable assertion'}
                        >
                          {isEnabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </span>
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
                      </div>
                    </button>
                  )
                })}
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

            {/* Tree Quick Add Elements Bar */}
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
                      <p className="text-xs text-gray-400">Global orchestrator settings and concurrency execution policy.</p>
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

                  {/* Execution Mode */}
                  <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800 space-y-2">
                    <div className="text-xs font-semibold text-gray-200">Execution Policy</div>
                    <label className="flex items-center space-x-2.5 cursor-pointer text-xs text-gray-300">
                      <input
                        type="checkbox"
                        checked={planForm.serialize_threadgroups}
                        onChange={(e) => setPlanForm({ ...planForm, serialize_threadgroups: e.target.checked })}
                        className="rounded border-gray-700 bg-gray-800 text-sky-600 focus:ring-sky-600"
                      />
                      <span>Run Thread Groups consecutively (one by one) instead of simultaneously</span>
                    </label>
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
                    onClick={() => handleAddConfigElement('header_manager')}
                    className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    <span>+ Add Header Manager</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddAssertion('latency')}
                    className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>+ Add Latency SLA</span>
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
                        <div className="flex items-center space-x-2">
                          <h3 className="text-base font-bold text-white">{tg.name}</h3>
                          {tg.enabled === false && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-950 text-red-300 border border-red-800">
                              Disabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">Concurrency profile and LLM Chat Sampler parameters.</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleToggleNodeEnabled('thread_group', tgIdx)}
                        className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1"
                        title={tg.enabled !== false ? 'Disable Thread Group' : 'Enable Thread Group'}
                      >
                        {tg.enabled !== false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{tg.enabled !== false ? 'Disable' : 'Enable'}</span>
                      </button>
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

                  {/* Sub-tab Navigation for Thread Group */}
                  <div className="flex items-center space-x-1 border-b border-gray-800 pb-2">
                    <button
                      type="button"
                      onClick={() => setActiveTgTab('schedule')}
                      className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                        activeTgTab === 'schedule'
                          ? 'bg-sky-600 text-white font-semibold shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      1. Concurrency &amp; Schedule
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTgTab('hyperparams')}
                      className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                        activeTgTab === 'hyperparams'
                          ? 'bg-sky-600 text-white font-semibold shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      2. LLM Sampler &amp; Hyperparameters
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTgTab('payload_preview')}
                      className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                        activeTgTab === 'payload_preview'
                          ? 'bg-sky-600 text-white font-semibold shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      3. Live JSON &amp; Probe Tester
                    </button>
                  </div>

                  {/* TAB 1: Schedule */}
                  {activeTgTab === 'schedule' && (
                    <div className="space-y-3.5">
                      <div>
                        <label className="text-[11px] font-medium text-gray-400 mb-1 block">Group Name</label>
                        <input
                          type="text"
                          className="input text-xs font-semibold py-1.5"
                          value={tg.name}
                          onChange={(e) => handleUpdateThreadGroup(tgIdx, 'name', e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-medium text-gray-400 mb-1 block">Traffic Pattern</label>
                          <select
                            className="select text-xs py-1.5"
                            value={tg.pattern}
                            onChange={(e) => handleUpdateThreadGroup(tgIdx, 'pattern', e.target.value)}
                          >
                            <option value="rampup">Ramp-up (Stepped staircase increase)</option>
                            <option value="constant">Constant (Steady sustained concurrency)</option>
                            <option value="spike">Spike (Sudden pulse burst)</option>
                            <option value="stress">Stress (Continuous saturation steps)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-medium text-gray-400 mb-1 block">
                            Target RPS Cap (Optional Pacing)
                          </label>
                          <input
                            type="number"
                            min="1"
                            placeholder="Unconstrained (Max throughput)"
                            className="input text-xs py-1.5"
                            value={tg.target_rps || ''}
                            onChange={(e) => handleUpdateThreadGroup(tgIdx, 'target_rps', parseFloat(e.target.value) || undefined)}
                          />
                        </div>
                      </div>

                      {/* Stepping Profile */}
                      <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 space-y-3">
                        <div className="text-xs font-semibold text-gray-200 flex items-center space-x-2">
                          <Clock className="w-3.5 h-3.5 text-sky-400" />
                          <span>Concurrency Stepping Schedule</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <div>
                            <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                              Target VUs (Threads)
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
                              Ramp Step VUs
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

                          <div>
                            <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                              Cooldown / Rampdown (s)
                            </label>
                            <input
                              type="number"
                              min="0"
                              className="input text-xs py-1 px-2"
                              value={tg.rampdown_seconds || 0}
                              onChange={(e) => handleUpdateThreadGroup(tgIdx, 'rampdown_seconds', parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: Hyperparameters & Sampler */}
                  {activeTgTab === 'hyperparams' && (
                    <div className="space-y-3.5">
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
                          <label className="text-[11px] font-medium text-gray-400 mb-1 block">Endpoint Type</label>
                          <select
                            className="select text-xs py-1.5 font-mono"
                            value={tg.sampler_type || 'chat'}
                            onChange={(e) => handleUpdateThreadGroup(tgIdx, 'sampler_type', e.target.value)}
                          >
                            <option value="chat">/v1/chat/completions (Chat)</option>
                            <option value="completion">/v1/completions (Raw text)</option>
                            <option value="embedding">/v1/embeddings (Vector)</option>
                          </select>
                        </div>
                      </div>

                      {/* Hyperparameters Grid */}
                      <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-gray-200 flex items-center space-x-2">
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            <span>LLM Sampler Hyperparameters</span>
                          </div>
                          <label className="flex items-center space-x-2 cursor-pointer text-xs text-sky-300">
                            <input
                              type="checkbox"
                              checked={tg.streaming !== false}
                              onChange={(e) => handleUpdateThreadGroup(tgIdx, 'streaming', e.target.checked)}
                              className="rounded border-gray-700 bg-gray-800 text-sky-600 focus:ring-sky-600"
                            />
                            <span>Stream Response (Calculates TTFT)</span>
                          </label>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                              Top-P Sampling
                            </label>
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max="1"
                              className="input text-xs py-1 px-2"
                              value={tg.top_p ?? 1.0}
                              onChange={(e) => handleUpdateThreadGroup(tgIdx, 'top_p', parseFloat(e.target.value) || 1.0)}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-gray-400 uppercase font-medium block mb-1">
                              Timeout (s)
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
                            System Prompt / Preamble (Supports <code className="text-sky-300 font-mono">${'{VAR}'}</code>)
                          </label>
                          <textarea
                            rows={2}
                            className="input text-xs font-mono w-full"
                            placeholder="e.g. You are an expert AI assistant specializing in ${SYSTEM_ROLE}."
                            value={tg.system_prompt || ''}
                            onChange={(e) => handleUpdateThreadGroup(tgIdx, 'system_prompt', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: Live JSON Payload Preview & 1-Shot Sampler Probe */}
                  {activeTgTab === 'payload_preview' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                        <div>
                          <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                            <FileJson className="w-4 h-4 text-emerald-400" />
                            <span>Live HTTP JSON Request Body</span>
                          </h4>
                          <p className="text-[11px] text-gray-400">
                            Variables from User Defined Variables (UDVs) are dynamically substituted.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleProbeSingleSampler(tg)}
                          disabled={isProbingSampler}
                          className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1.5 shadow-md"
                        >
                          {isProbingSampler ? (
                            <>
                              <Spinner size="xs" />
                              <span>Probing Sampler...</span>
                            </>
                          ) : (
                            <>
                              <FlaskConical className="w-3.5 h-3.5 text-purple-200" />
                              <span>Test Sampler Probe (1-Shot)</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* JSON Code Viewer */}
                      <pre className="p-3 bg-gray-950 rounded-xl border border-gray-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-52">
                        {getSamplerPayloadPreview(tg)}
                      </pre>

                      {/* Probe Result Terminal Viewer */}
                      {singleSamplerProbeResult && (
                        <div className="p-3.5 rounded-xl bg-gray-900 border border-gray-700/80 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                              {singleSamplerProbeResult.success ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-rose-400" />
                              )}
                              <span>Probe Result ({singleSamplerProbeResult.status_code || (singleSamplerProbeResult.success ? 200 : 'Error')})</span>
                            </span>
                            <div className="flex items-center space-x-3 text-[11px] font-mono">
                              {singleSamplerProbeResult.ttft_ms && (
                                <span className="text-cyan-300">TTFT: {singleSamplerProbeResult.ttft_ms}ms</span>
                              )}
                              {singleSamplerProbeResult.total_latency_ms && (
                                <span className="text-sky-300">Total: {singleSamplerProbeResult.total_latency_ms}ms</span>
                              )}
                              {singleSamplerProbeResult.tokens_per_second && (
                                <span className="text-emerald-300">Speed: {singleSamplerProbeResult.tokens_per_second} TPS</span>
                              )}
                            </div>
                          </div>

                          {singleSamplerProbeResult.error_message ? (
                            <div className="text-xs text-rose-300 font-mono bg-rose-950/60 p-2.5 rounded-lg border border-rose-800">
                              {singleSamplerProbeResult.error_message}
                            </div>
                          ) : (
                            <div>
                              <div className="text-[10px] text-gray-400 mb-1 uppercase font-semibold">Response Content:</div>
                              <div className="text-xs text-gray-200 font-mono bg-gray-950 p-2.5 rounded-lg border border-gray-800 max-h-32 overflow-y-auto">
                                {singleSamplerProbeResult.response_preview || '(No content returned)'}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
                      {ce.type === 'header_manager' && <Sliders className="w-5 h-5 text-indigo-400" />}
                      {ce.type === 'token_budget' && <Sliders className="w-5 h-5 text-purple-400" />}
                      {ce.type === 'user_defined_variables' && <Code className="w-5 h-5 text-sky-400" />}
                      <div>
                        <h3 className="text-base font-bold text-white">
                          {ce.type === 'csv_data_set' && 'CSV Prompt Data Set'}
                          {(ce.type === 'think_time' || ce.type === 'timer') && 'Pacing Timer (Think Time)'}
                          {ce.type === 'auth_header' && 'HTTP Authorization Header'}
                          {ce.type === 'header_manager' && 'HTTP Header Manager'}
                          {ce.type === 'token_budget' && 'Token Budget Override'}
                          {ce.type === 'user_defined_variables' && 'User Defined Variables (UDV)'}
                        </h3>
                        <p className="text-xs text-gray-400">JMeter Config Element transformation.</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleToggleNodeEnabled('config_element', ceIdx)}
                        className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1"
                      >
                        {ce.enabled !== false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{ce.enabled !== false ? 'Disable' : 'Enable'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveConfigElement(ceIdx)}
                        className="btn-danger text-xs py-1 px-2.5 flex items-center space-x-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>

                  {/* USER DEFINED VARIABLES (UDVs) */}
                  {ce.type === 'user_defined_variables' && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-400">
                        Define variables referenced in system prompts, headers, or models via syntax{' '}
                        <code className="text-sky-300 font-mono">${'{VAR_NAME}'}</code>.
                      </p>

                      {/* Quick variable insert chips */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-gray-500 text-[11px]">Quick Templates:</span>
                        {['MODEL_NAME', 'BASE_URL', 'SYSTEM_ROLE', 'API_KEY', 'MAX_TOKENS'].map((template) => (
                          <button
                            key={template}
                            type="button"
                            onClick={() => {
                              const updated = { ...ce.variables, [template]: '' }
                              handleUpdateConfigElement(ceIdx, 'variables', updated)
                            }}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-900 border border-gray-700 text-gray-300 hover:text-white hover:border-sky-500"
                          >
                            +{template}
                          </button>
                        ))}
                      </div>

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
                      {/* Built-in Prompt Suites Selector */}
                      <div className="p-3 rounded-xl bg-gray-900/70 border border-gray-800 space-y-2">
                        <div className="text-gray-300 font-semibold flex items-center space-x-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Load Pre-Built Prompt Suite</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {PROMPT_SUITES.map((ps) => (
                            <button
                              key={ps.id}
                              type="button"
                              onClick={() => handleUpdateConfigElement(ceIdx, 'data', ps.prompts.join('\n'))}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-950 border border-gray-700/80 hover:border-amber-500/50 text-gray-300 hover:text-amber-300 transition-colors"
                            >
                              {ps.name}
                            </button>
                          ))}
                        </div>
                      </div>

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
                            {ce.data ? ce.data.split('\n').filter((l) => l.trim()).length : 0} items loaded
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

                  {/* HEADER MANAGER */}
                  {ce.type === 'header_manager' && (
                    <div className="space-y-3 text-xs">
                      <div className="space-y-2">
                        {Object.entries(ce.headers || {}).map(([hk, hv], hIdx) => (
                          <div key={hIdx} className="grid grid-cols-12 gap-2 items-center">
                            <input
                              type="text"
                              className="col-span-5 input text-xs font-mono py-1"
                              placeholder="Header-Name"
                              value={hk}
                              onChange={(e) => {
                                const newKey = e.target.value
                                const updatedHeaders = { ...ce.headers }
                                delete updatedHeaders[hk]
                                updatedHeaders[newKey] = hv
                                handleUpdateConfigElement(ceIdx, 'headers', updatedHeaders)
                              }}
                            />
                            <input
                              type="text"
                              className="col-span-6 input text-xs font-mono py-1"
                              placeholder="Value"
                              value={hv}
                              onChange={(e) => {
                                const updatedHeaders = { ...ce.headers, [hk]: e.target.value }
                                handleUpdateConfigElement(ceIdx, 'headers', updatedHeaders)
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updatedHeaders = { ...ce.headers }
                                delete updatedHeaders[hk]
                                handleUpdateConfigElement(ceIdx, 'headers', updatedHeaders)
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
                          const updatedHeaders = { ...ce.headers, [`X-Custom-${Date.now().toString().slice(-4)}`]: '' }
                          handleUpdateConfigElement(ceIdx, 'headers', updatedHeaders)
                        }}
                        className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1"
                      >
                        <Plus className="w-3 h-3 text-indigo-400" />
                        <span>Add Header</span>
                      </button>
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
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleToggleNodeEnabled('assertion', asIdx)}
                        className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1"
                      >
                        {a.enabled !== false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{a.enabled !== false ? 'Disable' : 'Enable'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveAssertion(asIdx)}
                        className="btn-danger text-xs py-1 px-2.5 flex items-center space-x-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
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
                      {a.type === 'response_content' && (
                        <div className="space-y-1">
                          <input
                            type="text"
                            placeholder="Substring or regex pattern that must be present in response"
                            className="input text-xs py-1 font-mono w-full"
                            value={a.content_pattern ?? ''}
                            onChange={(e) => handleUpdateAssertion(asIdx, 'content_pattern', e.target.value)}
                          />
                          <span className="text-[11px] text-gray-500">Fails if response does not contain this text</span>
                        </div>
                      )}
                      {a.type === 'status_code' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            className="input text-xs py-1 w-24"
                            value={a.expected_status ?? 200}
                            onChange={(e) => handleUpdateAssertion(asIdx, 'expected_status', parseInt(e.target.value) || 200)}
                          />
                          <span className="text-xs text-gray-400">Expected HTTP Status Code</span>
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
          {/* Thread Groups */}
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
        </div>
      )}

      {/* ACTION FOOTER */}
      <div className="card flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-gray-400">
          <span>{planForm.thread_groups.filter((g) => g.enabled !== false).length} Active Thread Group(s)</span>
          <span className="mx-2">•</span>
          <span>{planForm.config_elements.filter((c) => c.enabled !== false).length} Active Config Element(s)</span>
          <span className="mx-2">•</span>
          <span>{planForm.assertions.filter((a) => a.enabled !== false).length} SLA Assertion(s)</span>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleProbePlan}
            disabled={isProbing || isExecuting || !!runningPlan}
            className="btn-secondary text-sm py-2 px-3.5 flex items-center justify-center space-x-1.5 border border-purple-500/40 text-purple-300 hover:text-white"
          >
            <FlaskConical className="w-4 h-4 text-purple-400" />
            <span>Validate (Probe)</span>
          </button>

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

      {/* VALIDATION PROBE REPORT MODAL */}
      {showProbeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center space-x-2.5">
                <FlaskConical className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Validation Probe Dry-Run</h3>
                  <p className="text-xs text-gray-400">1-shot endpoint check across enabled Thread Groups.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProbeModal(false)}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isProbing ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <Spinner size="lg" />
                <span className="text-sm font-medium text-purple-300">
                  Sending validation probes to LLM inference runtimes...
                </span>
                <span className="text-xs text-gray-500">Measuring TTFT, testing variables, and verifying tokens</span>
              </div>
            ) : probeReport ? (
              <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                {/* Overall Banner */}
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                    probeReport.overall_passed
                      ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
                      : 'bg-rose-950/70 border-rose-500/50 text-rose-200'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {probeReport.overall_passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      {probeReport.overall_passed
                        ? 'All probed Thread Groups & SLA assertions passed successfully!'
                        : 'Validation probe encountered errors or breached SLA thresholds.'}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] opacity-80">
                    {probeReport.probe_results?.length || 0} group(s) probed
                  </span>
                </div>

                {/* Per-group Results */}
                {probeReport.probe_results?.map((res, rIdx) => (
                  <div
                    key={rIdx}
                    className="p-4 rounded-xl bg-gray-950/80 border border-gray-800 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-white">{res.thread_group_name}</span>
                        <span className="text-xs text-gray-400 font-mono">({res.model})</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            res.success
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          HTTP {res.status_code}
                        </span>
                      </div>
                    </div>

                    {res.error_message ? (
                      <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-xs text-rose-300 font-mono">
                        {res.error_message}
                      </div>
                    ) : (
                      <>
                        {/* Metrics Bar */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                          <div className="p-2 rounded bg-gray-900 border border-gray-800">
                            <span className="text-[10px] text-gray-400 block font-sans">TTFT</span>
                            <span className="text-cyan-300 font-bold">{res.ttft_ms} ms</span>
                          </div>
                          <div className="p-2 rounded bg-gray-900 border border-gray-800">
                            <span className="text-[10px] text-gray-400 block font-sans">Total Latency</span>
                            <span className="text-sky-300 font-bold">{res.total_latency_ms} ms</span>
                          </div>
                          <div className="p-2 rounded bg-gray-900 border border-gray-800">
                            <span className="text-[10px] text-gray-400 block font-sans">Tokens Generated</span>
                            <span className="text-amber-300 font-bold">{res.completion_tokens} tok</span>
                          </div>
                          <div className="p-2 rounded bg-gray-900 border border-gray-800">
                            <span className="text-[10px] text-gray-400 block font-sans">Throughput</span>
                            <span className="text-emerald-300 font-bold">{res.tokens_per_second} TPS</span>
                          </div>
                        </div>

                        {/* Prompt & Response Preview */}
                        <div className="space-y-1.5 text-xs">
                          <div className="text-[10px] text-gray-500 uppercase font-semibold">Sample Prompt:</div>
                          <div className="p-2 rounded bg-gray-900/60 font-mono text-gray-300 text-[11px] truncate">
                            {res.prompt_sample}
                          </div>
                          <div className="text-[10px] text-gray-500 uppercase font-semibold">Model Response:</div>
                          <div className="p-2 rounded bg-gray-900/60 font-mono text-gray-200 text-[11px] max-h-24 overflow-y-auto">
                            {res.response_preview}
                          </div>
                        </div>

                        {/* Assertion Checks */}
                        {res.assertion_results?.length > 0 && (
                          <div className="pt-2 border-t border-gray-800/80 space-y-1">
                            <div className="text-[10px] text-gray-500 uppercase font-semibold">SLA Checks:</div>
                            <div className="space-y-1">
                              {res.assertion_results.map((as, aIdx) => (
                                <div
                                  key={aIdx}
                                  className={`text-xs flex items-center space-x-1.5 ${
                                    as.passed ? 'text-emerald-300' : 'text-rose-300'
                                  }`}
                                >
                                  <span>{as.passed ? '✓' : '✗'}</span>
                                  <span>{as.name}:</span>
                                  <span className="font-mono">{as.message}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}

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
                <h3 className="text-base font-bold text-white">Execution Code &amp; CLI Commands</h3>
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
                onClick={() => setActiveSnippetTab('k6')}
                className={`text-xs px-3 py-1 rounded font-medium ${
                  activeSnippetTab === 'k6' ? 'bg-sky-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Grafana k6 Script
              </button>
              <button
                type="button"
                onClick={() => setActiveSnippetTab('cli')}
                className={`text-xs px-3 py-1 rounded font-medium ${
                  activeSnippetTab === 'cli' ? 'bg-sky-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Apache JMeter CLI
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="text-xs px-3 py-1 text-gray-400 hover:text-white ml-auto"
              >
                Download JSON
              </button>
            </div>

            <div className="relative">
              <pre className="p-3 bg-gray-950 rounded-xl border border-gray-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-72">
                {activeSnippetTab === 'curl' && snippets.curl}
                {activeSnippetTab === 'python' && snippets.python}
                {activeSnippetTab === 'k6' && snippets.k6}
                {activeSnippetTab === 'cli' && snippets.cli}
              </pre>
              <button
                type="button"
                onClick={() => {
                  const textToCopy =
                    activeSnippetTab === 'curl'
                      ? snippets.curl
                      : activeSnippetTab === 'python'
                      ? snippets.python
                      : activeSnippetTab === 'k6'
                      ? snippets.k6
                      : snippets.cli
                  navigator.clipboard.writeText(textToCopy)
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
