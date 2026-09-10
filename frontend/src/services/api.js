const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
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
}

export const loadTestsApi = {
  list: (limit = 50) => request(`/api/load-tests?limit=${limit}`),
  create: (data) => request('/api/load-tests', { method: 'POST', body: data }),
  get: (id) => request(`/api/load-tests/${id}`),
  stop: (id) => request(`/api/load-tests/${id}/stop`, { method: 'POST' }),
  getResults: (id) => request(`/api/load-tests/${id}/results`),
  // Fix 6 + 7a: Use dynamic BASE_URL + append ?token= when key is set
  exportCsv: (id) => {
    const key = getApiKey()
    return `${BASE_URL}/api/export/load-tests/${id}/csv${key ? `?token=${encodeURIComponent(key)}` : ''}`
  },
}

export const monitoringApi = {
  current: () => request('/api/monitoring/current'),
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
