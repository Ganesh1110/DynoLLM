function resolveBackendBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }

  const isDebug = import.meta.env.VITE_DEBUG === 'true' || import.meta.env.VITE_DEBUG === '1'
  let defaultPort = isDebug ? '8000' : '8080'

  if (import.meta.env.VITE_API_PORT) {
    defaultPort = String(import.meta.env.VITE_API_PORT)
  }

  let port = defaultPort
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const qPort = urlParams.get('api_port') || urlParams.get('port')
      if (qPort === 'reset' || qPort === 'default') {
        localStorage.removeItem('dynollm_api_port')
      } else if (qPort) {
        localStorage.setItem('dynollm_api_port', qPort)
        port = qPort
      } else {
        const storedPort = localStorage.getItem('dynollm_api_port')
        if (storedPort) {
          port = storedPort
        }
      }
    } catch {}

    if (window.location.hostname) {
      return `${window.location.protocol}//${window.location.hostname}:${port}`
    }
  }

  return `http://localhost:${port}`
}

const BASE_URL = resolveBackendBaseUrl()
const WS_BASE = BASE_URL.replace(/^http/, 'ws')

function getApiKey() {
  return import.meta.env.VITE_API_KEY || localStorage.getItem('dynollm_api_key') || ''
}

async function request(path, options = {}) {
  const apiKey = getApiKey()
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    ...options.headers,
  }
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(err.detail || `HTTP ${resp.status}`)
  }
  return resp.json()
}

export const runtimesApi = {
  list: () => request('/api/runtimes'),
  create: (data) => request('/api/runtimes', { method: 'POST', body: data }),
  update: (id, data) => request(`/api/runtimes/${id}`, { method: 'PUT', body: data }),
  delete: (id) => request(`/api/runtimes/${id}`, { method: 'DELETE' }),
  healthCheck: (id) => request(`/api/runtimes/${id}/health`, { method: 'POST' }),
  listModels: (id) => request(`/api/runtimes/${id}/models`),
}

export const promptTemplatesApi = {
  list: () => request('/api/prompt-templates'),
  create: (data) => request('/api/prompt-templates', { method: 'POST', body: data }),
  get: (id) => request(`/api/prompt-templates/${id}`),
  update: (id, data) => request(`/api/prompt-templates/${id}`, { method: 'PUT', body: data }),
  delete: (id) => request(`/api/prompt-templates/${id}`, { method: 'DELETE' }),
}

export const benchmarksApi = {
  list: (limit = 50) => request(`/api/benchmarks?limit=${limit}`),
  create: (data) => request('/api/benchmarks', { method: 'POST', body: data }),
  get: (id) => request(`/api/benchmarks/${id}`),
  stop: (id) => request(`/api/benchmarks/${id}/stop`, { method: 'POST' }),
  // Fix 6 + 7a: Use dynamic BASE_URL (not hardcoded localhost) + append ?token= when key is set
  exportCsv: (id) => {
    const key = getApiKey()
    return `${BASE_URL}/api/export/benchmarks/${id}/csv${key ? `?token=${encodeURIComponent(key)}` : ''}`
  },
  exportJson: (id) => {
    const key = getApiKey()
    return `${BASE_URL}/api/export/benchmarks/${id}/json${key ? `?token=${encodeURIComponent(key)}` : ''}`
  },
  exportJsonl: (id) => {
    const key = getApiKey()
    return `${BASE_URL}/api/export/benchmarks/${id}/jsonl${key ? `?token=${encodeURIComponent(key)}` : ''}`
  },
  delete: (id) => request(`/api/benchmarks/${id}`, { method: 'DELETE' }),
  clearAll: () => request('/api/benchmarks', { method: 'DELETE' }),
}

export const loadTestsApi = {
  list: (limit = 50) => request(`/api/load-tests?limit=${limit}`),
  create: (data) => request('/api/load-tests', { method: 'POST', body: data }),
  get: (id) => request(`/api/load-tests/${id}`),
  stop: (id) => request(`/api/load-tests/${id}/stop`, { method: 'POST' }),
  getResults: (id) => request(`/api/load-tests/${id}/results`),
  delete: (id) => request(`/api/load-tests/${id}`, { method: 'DELETE' }),
  clearAll: () => request('/api/load-tests', { method: 'DELETE' }),
  // Fix 6 + 7a: Use dynamic BASE_URL + append ?token= when key is set
  exportCsv: (id) => {
    const key = getApiKey()
    return `${BASE_URL}/api/export/load-tests/${id}/csv${key ? `?token=${encodeURIComponent(key)}` : ''}`
  },
  exportJson: (id) => {
    const key = getApiKey()
    return `${BASE_URL}/api/export/load-tests/${id}/json${key ? `?token=${encodeURIComponent(key)}` : ''}`
  },
  exportJsonl: (id) => {
    const key = getApiKey()
    return `${BASE_URL}/api/export/load-tests/${id}/jsonl${key ? `?token=${encodeURIComponent(key)}` : ''}`
  },
}

export const loadTestPlansApi = {
  list: (limit = 50) => request(`/api/load-test-plans?limit=${limit}`),
  get: (id) => request(`/api/load-test-plans/${id}`),
  create: (plan) => request('/api/load-test-plans', { method: 'POST', body: plan }),
  update: (id, plan) => request(`/api/load-test-plans/${id}`, { method: 'PUT', body: plan }),
  delete: (id) => request(`/api/load-test-plans/${id}`, { method: 'DELETE' }),
  run: (id) => request(`/api/load-test-plans/${id}/run`, { method: 'POST' }),
  runInline: (plan) => request('/api/load-test-plans/run-inline', { method: 'POST', body: plan }),
  probe: (plan) => request('/api/load-test-plans/probe', { method: 'POST', body: plan }),
}

export const monitoringApi = {
  current: () => request('/api/monitoring/current'),
  engineStats: () => request('/api/monitoring/engine-stats'),
  engineStatsHistory: (runtimeId, window = '15m') =>
    request(`/api/monitoring/engine-stats/history?runtime_id=${encodeURIComponent(runtimeId)}&window=${encodeURIComponent(window)}`),
  runEngineStats: (runId) =>
    request(`/api/monitoring/engine-stats/run/${encodeURIComponent(runId)}`),
}

export const tracesApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams()
    if (params.run_id) qs.set('run_id', params.run_id)
    if (params.source) qs.set('source', params.source)
    if (params.runtime_id) qs.set('runtime_id', params.runtime_id)
    if (params.limit) qs.set('limit', params.limit)
    if (params.offset) qs.set('offset', params.offset)
    const queryString = qs.toString()
    return request(`/api/traces${queryString ? `?${queryString}` : ''}`)
  },
  get: (id) => request(`/api/traces/${encodeURIComponent(id)}`),
}

export const proxyApi = {
  info: (runtimeId) => request(`/api/proxy/${encodeURIComponent(runtimeId)}/info`),
  proxyBaseUrl: (runtimeId) => `${BASE_URL}/api/proxy/${encodeURIComponent(runtimeId)}/v1`,
}

export function createMonitoringWS(onMessage, onClose) {
  const apiKey = getApiKey()
  const query = apiKey ? `?token=${encodeURIComponent(apiKey)}` : ''
  const ws = new WebSocket(`${WS_BASE}/api/monitoring/stream${query}`)
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)) } catch {}
  }
  ws.onclose = onClose || (() => {})
  ws.onerror = () => ws.close()
  return ws
}

export function createEventsWS(onMessage, onClose) {
  const apiKey = getApiKey()
  const query = apiKey ? `?token=${encodeURIComponent(apiKey)}` : ''
  const ws = new WebSocket(`${WS_BASE}/api/monitoring/events${query}`)
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)) } catch {}
  }
  ws.onclose = onClose || (() => {})
  ws.onerror = () => ws.close()
  return ws
}
