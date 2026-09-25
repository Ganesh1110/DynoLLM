import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyWorkload,
  calcTokenCosts,
  calcHardwareCosts,
  calcTokensPerDollar,
  formatTokenCount,
  computeBreakdownFromResults,
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

test('Token Metrics: calcHardwareCosts computes run cost and cost per million tokens', () => {
  // 60-second run at $0.70/hr GPU with 100,000 total tokens
  // Run cost = (60 / 3600) * 0.70 = 0.011667
  // Cost per million = (0.01166667 / 100,000) * 1,000,000 = $0.1167 / 1M
  const hw = calcHardwareCosts({
    durationSeconds: 60,
    gpuHourlyCost: 0.70,
    totalTokens: 100_000,
  })

  assert.equal(hw.durationSeconds, 60)
  assert.equal(hw.gpuHourlyCost, 0.70)
  assert.equal(hw.runCost, 0.011667)
  assert.equal(hw.costPerMillion, 0.1167)
})

test('Token Metrics: computeBreakdownFromResults groups tiers and calculates TPOT and SLA', () => {
  const results = [
    // Tier 8: 2 successful requests
    { concurrent_users: 8, ttft_ms: 30, total_latency_ms: 200, generation_tokens_per_second: 50, success: true, quality_valid: true },
    { concurrent_users: 8, ttft_ms: 40, total_latency_ms: 220, generation_tokens_per_second: 50, success: true, quality_valid: true },
    // Tier 16: 1 success, 1 failure (50% error rate -> SLA breach)
    { concurrent_users: 16, ttft_ms: 100, total_latency_ms: 600, generation_tokens_per_second: 25, success: true, quality_valid: true },
    { concurrent_users: 16, ttft_ms: 120, total_latency_ms: 700, generation_tokens_per_second: 20, success: false, quality_valid: false },
  ]

  const breakdown = computeBreakdownFromResults(results)
  assert.equal(breakdown.length, 2)

  // Tier 8
  assert.equal(breakdown[0].concurrency, 8)
  assert.equal(breakdown[0].total_requests, 2)
  assert.equal(breakdown[0].successful_requests, 2)
  assert.equal(breakdown[0].avg_ttft_ms, 35)
  // TPOT = 1000 / 50 = 20 ms/tok
  assert.equal(breakdown[0].avg_tpot_ms, 20)
  assert.equal(breakdown[0].aggregate_tokens_per_sec, 400) // 50 * 8
  assert.equal(breakdown[0].error_rate_pct, 0)
  assert.equal(breakdown[0].sla_status, 'PASS')
  assert.equal(breakdown[0].is_safe, true)

  // Tier 16
  assert.equal(breakdown[1].concurrency, 16)
  assert.equal(breakdown[1].error_rate_pct, 50)
  assert.equal(breakdown[1].sla_status, 'BREACH')
  assert.equal(breakdown[1].is_safe, false)

  // Empty input safety
  assert.deepEqual(computeBreakdownFromResults([]), [])
  assert.deepEqual(computeBreakdownFromResults(null), [])
})

