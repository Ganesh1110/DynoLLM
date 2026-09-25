import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcDetailedKvSpecs,
  calcKvCachePerUser,
  calcVRAM,
  nextTier,
  evaluateGpuConcurrency,
  evaluateHostFit,
  parseModelName,
  BYTES_PER_GIB,
  GPU_CATALOG,
} from '../src/utils/gpuSizer.js'

test('GPU Sizer: Golden Test Vector - Qwen3-14B on NVIDIA A10G (CALCULATIONS_GUIDE.md Section 5.6)', () => {
  // Architectural specifications from CALCULATIONS_GUIDE.md Section 5.6
  // Layers = 40, KV Heads = 8, Head Dim = 128, BF16 Dtype = 2 bytes
  const arch = {
    layers: 40,
    kvHeads: 8,
    headDim: 128,
  }

  const specs = calcDetailedKvSpecs(14, 8192, arch, 16, 2)

  // 1. Exact KV bytes per token: 2 * 40 * 8 * 128 * 2 = 163,840 bytes/token
  assert.strictEqual(specs.bytesPerToken, 163840, 'bytesPerToken must equal exactly 163,840')

  // 2. Allocated tokens for 8,192 context with block size 16 = 8,192 tokens
  assert.strictEqual(specs.allocatedTokens, 8192, 'allocatedTokens must be 8192')

  // 3. KV memory for 8,192 tokens: 163,840 * 8,192 = 1,342,177,280 bytes = 1.25 GiB
  const expectedTotalBytes = 163840 * 8192
  assert.strictEqual(expectedTotalBytes, 1342177280, 'Total bytes must be 1,342,177,280')
  assert.strictEqual(specs.kvGiB, 1.25, 'KV GiB for 8192 context must be exactly 1.25 GiB')

  // 4. Three such requests must equal 3.75 GiB
  const threeRequestsGiB = specs.kvGiB * 3
  assert.strictEqual(threeRequestsGiB, 3.75, '3 requests must consume 3.75 GiB')

  // 5. Theoretical max slots from available KV cache pool (M_kv = 3.75 GiB)
  const theoreticalSlots = Math.floor(3.75 / specs.kvGiB)
  assert.strictEqual(theoreticalSlots, 3, 'Theoretical slots must equal 3 full-length requests')
})

test('GPU Sizer: Llama 3.1 8B KV cache specifications', () => {
  // Layers = 32, KV Heads = 8, Head Dim = 128, BF16 = 2 bytes
  const arch = {
    layers: 32,
    kvHeads: 8,
    headDim: 128,
  }

  const specs = calcDetailedKvSpecs(8, 4096, arch, 16, 2)

  // 2 * 32 * 8 * 128 * 2 = 131,072 bytes/token
  assert.strictEqual(specs.bytesPerToken, 131072, 'bytesPerToken must equal 131,072')

  // 131,072 * 4096 = 536,870,912 bytes = 0.5 GiB
  assert.strictEqual(specs.kvGiB, 0.5, 'KV GiB for 4096 context must be exactly 0.5 GiB')
})

test('GPU Sizer: PagedAttention discrete block size rounding', () => {
  const arch = { layers: 32, kvHeads: 8, headDim: 128 }

  // 4,090 tokens should round UP to nearest multiple of block size 16 -> 4,096
  const specs = calcDetailedKvSpecs(8, 4090, arch, 16, 2)
  assert.strictEqual(specs.allocatedTokens, 4096, 'Should round up to 4,096 tokens')

  // 4,096 tokens is already aligned -> 4,096
  const aligned = calcDetailedKvSpecs(8, 4096, arch, 16, 2)
  assert.strictEqual(aligned.allocatedTokens, 4096, 'Should remain 4,096 tokens')
})

test('GPU Sizer: calcVRAM standardized to binary GiB', () => {
  // 8B model with 0.55 bytes/param (INT4/Q4_K_M)
  // Raw bytes = 8 * 1e9 * 0.55 = 4.4e9 bytes
  // In GiB = 4.4e9 / 1024^3 = 4.097819...
  const res8b = calcVRAM(8, 0.55, 25)
  const expectedWeightsGiB = (8 * 1e9 * 0.55) / BYTES_PER_GIB
  assert.ok(Math.abs(res8b.weightsGiB - expectedWeightsGiB) < 1e-6)
  assert.strictEqual(res8b.weightsGb, res8b.weightsGiB, 'weightsGb backward compatibility alias must equal weightsGiB')
  assert.strictEqual(res8b.minTier, 8, '8B Q4 should fit in an 8GB tier with 25% overhead')

  // 70B model with 0.55 bytes/param
  // Raw bytes = 70 * 1e9 * 0.55 = 38.5e9 bytes
  // In GiB = 38.5e9 / 1024^3 = 35.8559...
  // With 25% overhead = ~44.82 GiB -> nextTier = 48
  const res70b = calcVRAM(70, 0.55, 25)
  assert.strictEqual(res70b.minTier, 48, '70B Q4 should fit in a 48GB tier')
})

test('GPU Sizer: nextTier boundaries', () => {
  assert.strictEqual(nextTier(6), 8)
  assert.strictEqual(nextTier(8), 8)
  assert.strictEqual(nextTier(8.1), 12)
  assert.strictEqual(nextTier(15.9), 16)
  assert.strictEqual(nextTier(24), 24)
  assert.strictEqual(nextTier(75), 80)
  assert.strictEqual(nextTier(200), 200)
})

test('GPU Sizer: parseModelName extracts architecture and precision accurately', () => {
  const parsed1 = parseModelName('llama3.1:8b-instruct-q4_K_M')
  assert.strictEqual(parsed1.params, 8)
  assert.strictEqual(parsed1.precision, 0.55)
  assert.strictEqual(parsed1.layers, 32)
  assert.strictEqual(parsed1.kvHeads, 8)

  const parsed2 = parseModelName('qwen2.5:14b-instruct-q4_K_M')
  assert.strictEqual(parsed2.params, 14)
  assert.strictEqual(parsed2.layers, 40)
})

test('GPU Sizer: evaluateGpuConcurrency handles fitting and deficit scenarios', () => {
  const rtx4090 = GPU_CATALOG.find((g) => g.name.includes('4090'))
  assert.ok(rtx4090, 'RTX 4090 must exist in catalog')

  // Case 1: Model comfortably fits (8GB weights, 0.5 GB KV cache per user)
  // Memory budget = 24 * 0.9 = 21.6 GB; Usable = 20.6 GB; Headroom = 20.6 - 8 = 12.6 GB
  // Concurrent = floor(12.6 / 0.5) = 25
  const fitResult = evaluateGpuConcurrency(rtx4090, 8.0, 0.5, 0.90)
  assert.strictEqual(fitResult.fits, true)
  assert.strictEqual(fitResult.status, 'fits')
  assert.ok(fitResult.maxConcurrentStreams > 10)

  // Case 2: Model exceeds GPU VRAM (40GB weights on a 24GB card)
  const spillResult = evaluateGpuConcurrency(rtx4090, 40.0, 0.5, 0.90)
  assert.strictEqual(spillResult.fits, false)
  assert.strictEqual(spillResult.status, 'spill')
  assert.strictEqual(spillResult.maxConcurrentStreams, 0)
  assert.strictEqual(spillResult.theoreticalMaxSlots, 0)
})

test('GPU Sizer: evaluateHostFit with live telemetry and offline states', () => {
  // Case 1: Telemetry offline
  const offline = evaluateHostFit(8.0, 10.0, null, 0.5)
  assert.strictEqual(offline.status, 'unknown')
  assert.strictEqual(offline.badge, 'Host Offline')

  // Case 2: NVIDIA GPU with sufficient VRAM (24 GiB total)
  const mockTelemetryGpu = {
    gpus: [
      {
        name: 'NVIDIA RTX 4090',
        vram_total_bytes: 24 * BYTES_PER_GIB,
        vram_used_bytes: 2 * BYTES_PER_GIB,
      },
    ],
  }
  const fitGpu = evaluateHostFit(8.0, 10.0, mockTelemetryGpu, 0.5)
  assert.strictEqual(fitGpu.status, 'fits')
  assert.strictEqual(fitGpu.badge, 'Fits Natively in VRAM')

  // Case 3: Apple Silicon / Unified Memory (32 GiB total)
  const mockTelemetryApple = {
    gpus: [],
    ram_total_bytes: 32 * BYTES_PER_GIB,
    ram_available_bytes: 24 * BYTES_PER_GIB,
  }
  const fitApple = evaluateHostFit(10.0, 12.5, mockTelemetryApple, 0.5)
  assert.strictEqual(fitApple.status, 'fits')
  assert.strictEqual(fitApple.badge, 'Fits Unified Memory')
})
