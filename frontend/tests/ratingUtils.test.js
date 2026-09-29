import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getTtftRating,
  getSpeedRating,
  getTpotRating,
  getErrorRateRating,
  getLatencyConsistencyRating,
  getRatingBadgeClasses,
  getOverallEvaluation,
} from '../src/utils/ratingUtils.js'

test('Rating Utils: getTtftRating classifies instant, interactive, and high latency', () => {
  assert.equal(getTtftRating(150)?.grade, 'good')
  assert.equal(getTtftRating(150)?.badge, 'Instant')
  assert.equal(getTtftRating(150)?.color, 'emerald')

  assert.equal(getTtftRating(300)?.grade, 'average')
  assert.equal(getTtftRating(550)?.badge, 'Interactive')
  assert.equal(getTtftRating(800)?.color, 'amber')

  assert.equal(getTtftRating(1200)?.grade, 'bad')
  assert.equal(getTtftRating(1200)?.badge, 'High Latency')
  assert.equal(getTtftRating(1200)?.color, 'rose')

  // Edge / invalid cases
  assert.equal(getTtftRating(null), null)
  assert.equal(getTtftRating(0), null)
  assert.equal(getTtftRating(-50), null)
})

test('Rating Utils: getSpeedRating classifies blazing, reading speed, and sluggish', () => {
  assert.equal(getSpeedRating(45)?.grade, 'good')
  assert.equal(getSpeedRating(45)?.badge, 'Blazing')
  assert.equal(getSpeedRating(33)?.grade, 'good')   // exact good boundary

  assert.equal(getSpeedRating(20)?.grade, 'average')
  assert.equal(getSpeedRating(20)?.badge, 'Reading Speed')
  assert.equal(getSpeedRating(20)?.color, 'amber')   // was sky, now amber

  assert.equal(getSpeedRating(8)?.grade, 'bad')
  assert.equal(getSpeedRating(8)?.badge, 'Sluggish')

  assert.equal(getSpeedRating(null), null)
  assert.equal(getSpeedRating(-10), null)
})

test('Rating Utils: getTpotRating classifies snappy, human speed, and slow typing', () => {
  assert.equal(getTpotRating(20)?.grade, 'good')
  assert.equal(getTpotRating(20)?.badge, 'Snappy')

  assert.equal(getTpotRating(45)?.grade, 'average')
  assert.equal(getTpotRating(45)?.badge, 'Human Speed')
  assert.equal(getTpotRating(45)?.color, 'amber')  // was sky, now amber

  assert.equal(getTpotRating(90)?.grade, 'bad')
  assert.equal(getTpotRating(90)?.badge, 'Slow Typing')

  assert.equal(getTpotRating(null), null)
})

test('Rating Utils: getErrorRateRating classifies optimal, acceptable, and breach', () => {
  assert.equal(getErrorRateRating(0)?.grade, 'good')
  assert.equal(getErrorRateRating(0)?.badge, '0% Optimal')

  assert.equal(getErrorRateRating(2.5)?.grade, 'average')
  assert.equal(getErrorRateRating(2.5)?.badge, 'SLA Pass')

  assert.equal(getErrorRateRating(10.0)?.grade, 'bad')
  assert.equal(getErrorRateRating(10.0)?.badge, 'SLA Breach')

  assert.equal(getErrorRateRating(null), null)
})

test('Rating Utils: getLatencyConsistencyRating evaluates P95 vs Avg ratio', () => {
  // P95 = 120ms, Avg = 100ms (1.2x) -> Stable
  assert.equal(getLatencyConsistencyRating(120, 100)?.grade, 'good')
  assert.equal(getLatencyConsistencyRating(120, 100)?.badge, 'Stable')

  // P95 = 200ms, Avg = 100ms (2.0x) -> Moderate Jitter
  assert.equal(getLatencyConsistencyRating(200, 100)?.grade, 'average')
  assert.equal(getLatencyConsistencyRating(200, 100)?.badge, 'Moderate Jitter')

  // P95 = 400ms, Avg = 100ms (4.0x) -> Tail Spikes
  assert.equal(getLatencyConsistencyRating(400, 100)?.grade, 'bad')
  assert.equal(getLatencyConsistencyRating(400, 100)?.badge, 'Tail Spikes')

  assert.equal(getLatencyConsistencyRating(null, 100), null)
  assert.equal(getLatencyConsistencyRating(100, 0), null)
})

test('Rating Utils: getRatingBadgeClasses provides correct CSS strings', () => {
  assert.match(getRatingBadgeClasses('emerald'), /text-emerald-400/)
  assert.match(getRatingBadgeClasses('amber'), /text-amber-400/)
  assert.match(getRatingBadgeClasses('rose'), /text-rose-400/)
  assert.match(getRatingBadgeClasses('sky'), /text-sky-400/)
  assert.match(getRatingBadgeClasses('unknown'), /text-gray-400/)
})

test('Rating Utils: getOverallEvaluation classifies Good, Average, and Bad stages', () => {
  // All good metrics
  const goodRun = getOverallEvaluation({
    ttftMs: 180,
    speedTokPerSec: 45,
    p95Ms: 120,
    avgMs: 100,
    errorRatePct: 0,
  })
  assert.equal(goodRun?.stage, 'good')
  assert.equal(goodRun?.color, 'emerald')
  assert.match(goodRun?.label, /Good/)
  assert.equal(goodRun?.goodCount, 4)

  // Average performance
  const avgRun = getOverallEvaluation({
    ttftMs: 450,
    speedTokPerSec: 22,
    p95Ms: 180,
    avgMs: 100,
    errorRatePct: 2.0,
  })
  assert.equal(avgRun?.stage, 'average')
  assert.equal(avgRun?.color, 'amber')
  assert.match(avgRun?.label, /Average/)

  // Bad performance: SLA breach
  const badRunSla = getOverallEvaluation({
    ttftMs: 150,
    speedTokPerSec: 50,
    p95Ms: 120,
    avgMs: 100,
    errorRatePct: 15.0,
  })
  assert.equal(badRunSla?.stage, 'bad')
  assert.equal(badRunSla?.color, 'rose')
  assert.match(badRunSla?.label, /Bad/)

  // Bad performance: Multiple bottlenecks
  const badRunBottleneck = getOverallEvaluation({
    ttftMs: 1200,
    speedTokPerSec: 8,
    p95Ms: 3000,
    avgMs: 1000,
  })
  assert.equal(badRunBottleneck?.stage, 'bad')
  assert.equal(badRunBottleneck?.color, 'rose')

  // Empty / unmeasured
  assert.equal(getOverallEvaluation({}), null)
})

