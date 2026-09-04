import React, { useState, useEffect } from 'react'
import { Server, Plus, CheckCircle2, XCircle, RefreshCw, Trash2, Cpu, ExternalLink, Box } from 'lucide-react'
import { useRuntimeStore } from '../stores/runtimeStore'
import { SectionHeader, StatusBadge, Spinner, Alert, fmtBytes } from '../components/ui'

export function Runtimes() {
  const runtimes = useRuntimeStore((s) => s.runtimes)
  const loading = useRuntimeStore((s) => s.loading)
  const error = useRuntimeStore((s) => s.error)
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes)
  const createRuntime = useRuntimeStore((s) => s.createRuntime)
  const deleteRuntime = useRuntimeStore((s) => s.deleteRuntime)
  const checkHealth = useRuntimeStore((s) => s.checkHealth)
  const fetchModels = useRuntimeStore((s) => s.fetchModels)

  const [selectedRuntime, setSelectedRuntime] = useState(null)
  const [models, setModels] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [healthResults, setHealthResults] = useState({})
  const [checkingHealth, setCheckingHealth] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)

  // Add Runtime Form State
  const [formData, setFormData] = useState({
    name: 'Local Ollama',
    runtime_type: 'ollama',
    endpoint: 'http://localhost:11434',
    api_key: '',
    notes: 'Default local LLM endpoint',
  })

  useEffect(() => {
    fetchRuntimes()
  }, [])

  const handleHealthCheck = async (id) => {
    setCheckingHealth((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await checkHealth(id)
      setHealthResults((prev) => ({ ...prev, [id]: res }))
    } catch (e) {
      setHealthResults((prev) => ({ ...prev, [id]: { healthy: false, message: e.message } }))
    } finally {
      setCheckingHealth((prev) => ({ ...prev, [id]: false }))
    }
  }

  const handleSelectRuntime = async (runtime) => {
    setSelectedRuntime(runtime)
    setLoadingModels(true)
    try {
      const fetched = await fetchModels(runtime.id)
      setModels(fetched || [])
    } catch (e) {
      setModels([])
    } finally {
      setLoadingModels(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      await createRuntime(formData)
      setShowAddModal(false)
      fetchRuntimes()
    } catch (e) {
      alert(`Error adding runtime: ${e.message}`)
    }
  }

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to remove this runtime endpoint?')) {
      await deleteRuntime(id)
      if (selectedRuntime?.id === id) {
        setSelectedRuntime(null)
        setModels([])
      }
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="LLM Runtimes & Models"
        subtitle="Manage connections to local Ollama, LM Studio, llama.cpp, vLLM or OpenAI-compatible inference servers."
        action={
          <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Add Runtime</span>
          </button>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Runtimes List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Connected Endpoints ({runtimes.length})
          </h2>

          {loading && runtimes.length === 0 ? (
            <Spinner />
          ) : runtimes.length === 0 ? (
            <div className="card text-center py-12 space-y-3">
              <Server className="w-12 h-12 text-gray-600 mx-auto" />
              <h3 className="font-medium text-gray-300">No Runtimes Configured</h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                Connect your local Ollama (http://localhost:11434) or LM Studio (http://localhost:1234) to begin testing.
              </p>
              <button onClick={() => setShowAddModal(true)} className="btn-primary text-xs">
                Add Default Ollama
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {runtimes.map((rt) => {
                const health = healthResults[rt.id]
                const isChecking = checkingHealth[rt.id]
                const isSelected = selectedRuntime?.id === rt.id

                return (
                  <div
                    key={rt.id}
                    onClick={() => handleSelectRuntime(rt)}
                    className={`card cursor-pointer transition-all border ${
                      isSelected
                        ? 'border-sky-500 bg-sky-950/20'
                        : 'border-gray-800 hover:border-gray-700 bg-gray-900'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-base">{rt.name}</span>
                          <span className="badge-blue text-xs uppercase">{rt.runtime_type}</span>
                        </div>
                        <div className="text-xs font-mono text-gray-400">{rt.endpoint}</div>
                        {rt.notes && <p className="text-xs text-gray-500">{rt.notes}</p>}
                      </div>

                      <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleHealthCheck(rt.id)}
                          disabled={isChecking}
                          className="btn-secondary text-xs flex items-center space-x-1 py-1.5 px-2.5"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                          <span>Test</span>
                        </button>
                        <button
                          onClick={() => handleDelete(rt.id)}
                          className="text-gray-500 hover:text-red-400 p-1.5 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Health Check result banner */}
                    {health && (
                      <div
                        className={`mt-3 pt-2 border-t border-gray-800 flex items-center justify-between text-xs ${
                          health.healthy ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        <div className="flex items-center space-x-1.5">
                          {health.healthy ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                          <span>{health.message}</span>
                        </div>
                        {health.latency_ms && <span className="font-mono text-gray-400">{health.latency_ms.toFixed(0)}ms ping</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right 1 Col: Discovered Models for Selected Runtime */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Discovered Models {selectedRuntime ? `(${selectedRuntime.name})` : ''}
          </h2>

          {!selectedRuntime ? (
            <div className="card text-center py-10 text-gray-500 text-xs">
              Select a runtime on the left to inspect and discover available models.
            </div>
          ) : loadingModels ? (
            <div className="card"><Spinner /></div>
          ) : models.length === 0 ? (
            <div className="card text-center py-10 text-gray-500 text-xs space-y-2">
              <Box className="w-8 h-8 mx-auto text-gray-600" />
              <p>No models returned by this endpoint.</p>
              <p className="text-gray-600 text-[11px]">Make sure the runtime is running and has models downloaded.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {models.map((m, idx) => (
                <div key={idx} className="p-3 bg-gray-900 border border-gray-800 rounded-xl space-y-1.5">
                  <div className="font-bold text-sm text-sky-400 font-mono break-all">{m.name}</div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-gray-400">
                    {m.parameter_size && <div>Params: <span className="text-gray-200">{m.parameter_size}</span></div>}
                    {m.quantization_level && <div>Quant: <span className="text-gray-200">{m.quantization_level}</span></div>}
                    {m.size && <div>Size: <span className="text-gray-200">{fmtBytes(m.size)}</span></div>}
                    {m.family && <div>Family: <span className="text-gray-200">{m.family}</span></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Runtime Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-lg w-full bg-gray-900 border-gray-700 shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-lg text-white">Add LLM Runtime</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Runtime Name</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Local Ollama, LM Studio Server"
                />
              </div>

              <div>
                <label className="label">Runtime Engine</label>
                <select
                  className="select"
                  value={formData.runtime_type}
                  onChange={(e) => {
                    const type = e.target.value
                    let defaultEp = formData.endpoint
                    if (type === 'ollama') defaultEp = 'http://localhost:11434'
                    if (type === 'lmstudio') defaultEp = 'http://localhost:1234'
                    if (type === 'vllm') defaultEp = 'http://localhost:8000'
                    if (type === 'llamacpp') defaultEp = 'http://localhost:8080'
                    setFormData({ ...formData, runtime_type: type, endpoint: defaultEp })
                  }}
                >
                  <option value="ollama">Ollama (Native /api/tags, /api/generate)</option>
                  <option value="lmstudio">LM Studio (OpenAI Compatible)</option>
                  <option value="openai_compatible">OpenAI-Compatible Local API</option>
                  <option value="vllm">vLLM (OpenAI API Compatible)</option>
                  <option value="llamacpp">llama.cpp Server</option>
                </select>
              </div>

              <div>
                <label className="label">Base Endpoint URL</label>
                <input
                  type="url"
                  required
                  className="input font-mono"
                  value={formData.endpoint}
                  onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                  placeholder="http://localhost:11434"
                />
              </div>

              <div>
                <label className="label">API Key (Optional)</label>
                <input
                  type="password"
                  className="input"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="Leave blank for local Ollama / LM Studio"
                />
              </div>

              <div>
                <label className="label">Notes / Description</label>
                <input
                  type="text"
                  className="input"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g. M3 Max 36GB RAM or RTX 4090"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-gray-800">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Runtime
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
