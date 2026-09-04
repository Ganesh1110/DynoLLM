// API service layer — all HTTP calls to FastAPI backend
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const WS_BASE = BASE_URL.replace(/^http/, 'ws')

async function request(path, options = {}) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
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

export const benchmarksApi = {
  list: (limit = 50) => request(`/api/benchmarks?limit=${limit}`),
  create: (data) => request('/api/benchmarks', { method: 'POST', body: data }),
  get: (id) => request(`/api/benchmarks/${id}`),
  stop: (id) => request(`/api/benchmarks/${id}/stop`, { method: 'POST' }),
  exportCsv: (id) => `${BASE_URL}/api/export/benchmarks/${id}/csv`,
  exportJson: (id) => `${BASE_URL}/api/export/benchmarks/${id}/json`,
}

export const loadTestsApi = {
  list: (limit = 50) => request(`/api/load-tests?limit=${limit}`),
  create: (data) => request('/api/load-tests', { method: 'POST', body: data }),
  get: (id) => request(`/api/load-tests/${id}`),
  stop: (id) => request(`/api/load-tests/${id}/stop`, { method: 'POST' }),
  getResults: (id) => request(`/api/load-tests/${id}/results`),
  exportCsv: (id) => `${BASE_URL}/api/export/load-tests/${id}/csv`,
}

export const monitoringApi = {
  current: () => request('/api/monitoring/current'),
}

export function createMonitoringWS(onMessage, onClose) {
  const ws = new WebSocket(`${WS_BASE}/api/monitoring/stream`)
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)) } catch {}
  }
  ws.onclose = onClose || (() => {})
  ws.onerror = () => ws.close()
  return ws
}

export function createEventsWS(onMessage, onClose) {
  const ws = new WebSocket(`${WS_BASE}/api/monitoring/events`)
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)) } catch {}
  }
  ws.onclose = onClose || (() => {})
  ws.onerror = () => ws.close()
  return ws
}
