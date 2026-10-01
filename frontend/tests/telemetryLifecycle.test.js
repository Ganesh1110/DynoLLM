import test from 'node:test'
import assert from 'node:assert/strict'
import {
  determineCardLifecycleState,
  evaluateQueueBacklog,
} from '../src/utils/telemetryLifecycle.js'

test('Telemetry Lifecycle: classifies live when capable and fresh with data', () => {
  const state = determineCardLifecycleState({
    capabilities: { has_kv_cache: true },
    capabilityKey: 'has_kv_cache',
    isStale: false,
    hasError: false,
    hasData: true,
  })
  assert.equal(state, 'live')
})

test('Telemetry Lifecycle: classifies unavailable when engine capability is false', () => {
  const state = determineCardLifecycleState({
    capabilities: { has_prefix_cache: false },
    capabilityKey: 'has_prefix_cache',
    isStale: false,
    hasError: false,
    hasData: true,
  })
  assert.equal(state, 'unavailable')
})

test('Telemetry Lifecycle: classifies stale on engine connection error or staleness', () => {
  const stateError = determineCardLifecycleState({
    capabilities: { has_histograms: true },
    capabilityKey: 'has_histograms',
    hasError: true,
  })
  assert.equal(stateError, 'stale')

  const stateStale = determineCardLifecycleState({
    capabilities: { has_histograms: true },
    capabilityKey: 'has_histograms',
    isStale: true,
  })
  assert.equal(stateStale, 'stale')
})

test('Telemetry Lifecycle: classifies no_data when capability is supported but window is empty', () => {
  const state = determineCardLifecycleState({
    capabilities: { has_histograms: true },
    capabilityKey: 'has_histograms',
    isStale: false,
    hasError: false,
    hasData: false,
  })
  assert.equal(state, 'no_data')
})

test('Telemetry Backlog: evaluates healthy admission when queue is clear', () => {
  const res = evaluateQueueBacklog({ waiting: 0, running: 4, series: [] })
  assert.equal(res.hasBacklog, false)
  assert.equal(res.isSevereBacklog, false)
  assert.equal(res.admissionRatio, 1.0)
})

test('Telemetry Backlog: identifies persistent queue backlog across window series', () => {
  const series = [
    { requests_waiting: 0 },
    { requests_waiting: 2 },
    { requests_waiting: 3 },
    { requests_waiting: 2 },
  ]
  const res = evaluateQueueBacklog({ waiting: 2, running: 8, series })
  assert.equal(res.hasBacklog, true)
  assert.equal(res.persistentBacklog, true)
  assert.equal(res.isSevereBacklog, true)
  assert.equal(res.admissionRatio, 0.8) // 8 / (8 + 2)
})

test('Telemetry Backlog: identifies severe backlog when waiting count exceeds threshold', () => {
  const res = evaluateQueueBacklog({ waiting: 6, running: 10, series: [] })
  assert.equal(res.hasBacklog, true)
  assert.equal(res.isSevereBacklog, true)
  assert.equal(res.admissionRatio, 0.63) // 10 / 16
})
