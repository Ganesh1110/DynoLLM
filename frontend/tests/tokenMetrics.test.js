import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyWorkload,
  calcTokenCosts,
  calcTokensPerDollar,
  formatTokenCount,
} from '../src/utils/tokenMetrics.js'

test('Token Metrics: classifyWorkload identifies prefill-bound workloads', () => {
  // 820 prompt tokens, 180 completion tokens = 82% prefill
  const result = classifyWorkload(820, 180)
  assert.equal(result.regime, 'prefill')
  assert.equal(result.prefillPercent, 82)
  assert.equal(result.decodePercent, 18)
  assert.equal(result.badge, '82% Prefill-Bound')
  assert.equal(result.color, 'indigo')
})

test('Token Metrics: classifyWorkload identifies decode-bound workloads', () => {
  // 100 prompt tokens, 900 completion tokens = 90% decode
  const result = classifyWorkload(100, 900)
  assert.equal(result.regime, 'decode')
  assert.equal(result.prefillPercent, 10)
  assert.equal(result.decodePercent, 90)
  assert.equal(result.badge, '90% Decode-Bound')
  assert.equal(result.color, 'emerald')
})

test('Token Metrics: classifyWorkload identifies balanced workloads', () => {
  // 500 prompt tokens, 500 completion tokens = 50% / 50%
  const result = classifyWorkload(500, 500)
  assert.equal(result.regime, 'balanced')
  assert.equal(result.badge, 'Balanced Workload')
  assert.equal(result.color, 'sky')
})

test('Token Metrics: classifyWorkload handles empty or zero input', () => {
  const result = classifyWorkload(0, 0)
  assert.equal(result.regime, 'unknown')
  assert.equal(result.prefillPercent, 0)
})

test('Token Metrics: calcTokenCosts computes accurate cost breakdown and per-million rates', () => {
  // 1,000,000 in ($0.50/M) + 500,000 out ($1.50/M)
  // in cost: $0.50, out cost: $0.75, total: $1.25 for 1.5M tokens -> $0.8333/M
  const costs = calcTokenCosts({
    promptTokens: 1_000_000,
    completionTokens: 500_000,
    promptCostPerMillion: 0.50,
    completionCostPerMillion: 1.50,
  })

  assert.equal(costs.promptCost, 0.50)
  assert.equal(costs.completionCost, 0.75)
  assert.equal(costs.totalCost, 1.25)
  assert.equal(costs.effectiveCostPerMillion, 0.8333)
})

test('Token Metrics: calcTokensPerDollar and formatTokenCount', () => {
  // 1,250,000 tokens for $1.25 = 1,000,000 tokens per dollar
  const efficiency = calcTokensPerDollar(1_250_000, 1.25)
  assert.equal(efficiency, 1_000_000)

  assert.equal(formatTokenCount(500), '500')
  assert.equal(formatTokenCount(1500), '1.5k')
  assert.equal(formatTokenCount(2500000), '2.50M')
  assert.equal(formatTokenCount(null), '—')
})
