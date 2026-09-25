import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getGpuArchitecture,
  validateTpConfig,
  calcDraftModelVram,
  calcLoraBuffer,
  calcMaxSafeConcurrency,
  calcEstimatedDecodeTps,
  calcEstimatedTtftMs,
  buildRooflineModel,
  generateVllmCommand,
  getRecommendedGpuForModel,
  VLLM_VERSIONS,
  QUANTIZATION_RECIPES,
  GLOBAL_MODEL_CATALOG,
} from '../src/utils/vllmOptimizer.js'

test('vLLM Optimizer: getGpuArchitecture identifies hardware generations accurately', () => {
  const h100 = getGpuArchitecture('NVIDIA H100 80GB HBM3')
  assert.strictEqual(h100.family, 'Hopper / Blackwell')
  assert.strictEqual(h100.fp8Native, true)
  assert.strictEqual(h100.peakTflops, 989)

  const rtx4090 = getGpuArchitecture('NVIDIA GeForce RTX 4090')
  assert.strictEqual(rtx4090.family, 'Ada Lovelace')
  assert.strictEqual(rtx4090.fp8Native, true)

  const a10g = getGpuArchitecture('NVIDIA A10G (24GB)')
  assert.strictEqual(a10g.family, 'Ampere')
  assert.strictEqual(a10g.fp8Native, false)
})

test('vLLM Optimizer: validateTpConfig enforces even head division guardrails', () => {
  const llama8b = { attentionHeads: 32, kvHeads: 8 }

  // TP = 1 is always valid
  assert.strictEqual(validateTpConfig(null, 1, llama8b).isValid, true)

  // TP = 2, 4, 8 evenly divide 32 query heads
  assert.strictEqual(validateTpConfig(null, 2, llama8b).isValid, true)
  assert.strictEqual(validateTpConfig(null, 4, llama8b).isValid, true)
  assert.strictEqual(validateTpConfig(null, 8, llama8b).isValid, true)

  // TP = 3, 5, 6 do not divide 32 query heads -> invalid
  const invalidTp3 = validateTpConfig(null, 3, llama8b)
  assert.strictEqual(invalidTp3.isValid, false)
  assert.ok(invalidTp3.error.includes('does not evenly divide attention heads'))
})

test('vLLM Optimizer: calcDraftModelVram & calcLoraBuffer memory overhead', () => {
  // Speculative decoding draft VRAM
  assert.strictEqual(calcDraftModelVram({ enableSpeculative: false }), 0)
  assert.strictEqual(calcDraftModelVram({ enableSpeculative: true, speculativeMode: 'ngram' }), 0)
  assert.strictEqual(calcDraftModelVram({ enableSpeculative: true, speculativeMode: 'eagle' }), 0.45)
  assert.strictEqual(calcDraftModelVram({ enableSpeculative: true, speculativeMode: 'draft_model' }), 2.2)

  // LoRA buffer
  assert.strictEqual(calcLoraBuffer({ enableLora: false }), 0)
  const loraOn = calcLoraBuffer({ enableLora: true, maxLoras: 4, maxLoraRank: 32 })
  assert.ok(loraOn > 0, 'LoRA buffer should be positive when enabled')
})

test('vLLM Optimizer: calcMaxSafeConcurrency calculates safe slots before OOM', () => {
  // 20GB budget, 8GB weights, 2GB overhead, 1GB per user KV -> 10GB usable -> 10 users
  const slots = calcMaxSafeConcurrency({
    availableEngineBudgetGb: 20.0,
    weightsGb: 8.0,
    runtimeOverheadGb: 2.0,
    kvPerUserGb: 1.0,
    scalingMode: 'tp',
    replicaCount: 1,
  })
  assert.strictEqual(slots, 10)

  // Deficit: 8GB budget, 8GB weights, 2GB overhead -> 0 slots
  const zeroSlots = calcMaxSafeConcurrency({
    availableEngineBudgetGb: 8.0,
    weightsGb: 8.0,
    runtimeOverheadGb: 2.0,
    kvPerUserGb: 1.0,
    scalingMode: 'tp',
    replicaCount: 1,
  })
  assert.strictEqual(zeroSlots, 0)
})

test('vLLM Optimizer: buildRooflineModel computes ridge point and operating bounds', () => {
  const mockGpu = { bandwidthGbps: 1000 }
  const mockArch = { peakTflops: 200 }

  // Ridge point = (200 * 1000) / 1000 = 200 FLOPs/byte
  const roofline = buildRooflineModel({
    targetGpu: mockGpu,
    tensorParallelSize: 1,
    gpuArch: mockArch,
    scalingMode: 'tp',
    concurrency: 1,
  })

  assert.strictEqual(roofline.ridgeIntensity, 200)
  assert.ok(roofline.operatingPoints.length >= 2)
  // Decode intensity = 1.0 * min(concurrency, 32) = 1.0 < 200 -> Memory-Bandwidth Bound
  assert.strictEqual(roofline.operatingPoints[0].bound, 'Memory-Bandwidth Bound')
})

test('vLLM Optimizer: generateVllmCommand omits deprecated V0 flags on vLLM 0.8+ (V1)', () => {
  const model = GLOBAL_MODEL_CATALOG[0] // Llama 3.1 8B
  const flags = {
    maxModelLen: 8192,
    gpuMemoryUtilization: 0.90,
    blockSize: 16,
    maxNumSeqs: 256,
    maxNumBatchedTokens: 2048,
    kvCacheDtype: 'auto',
    swapSpace: 4,
    cpuOffloadGb: 0,
    tensorParallelSize: 1,
    pipelineParallelSize: 1,
    distributedExecutorBackend: 'mp',
    quantization: 'none',
    enablePrefixCaching: true,
    enableChunkedPrefill: true,
    numSchedulerSteps: 1,
    disableSlidingWindow: false,
    disableLogStats: false,
    enableSpeculative: false,
    enforceEager: false,
    servedModelName: '',
    loadFormat: 'auto',
    limitMmPerPrompt: '',
    enableLora: false,
    guidedDecodingBackend: 'xgrammar',
    toolCallParser: 'none',
    enableAutoToolChoice: false,
    apiKey: '',
    trustRemoteCode: true,
  }

  const v1Version = VLLM_VERSIONS.find((v) => v.isV1Engine)
  const cmdV1 = generateVllmCommand({
    selectedModel: model,
    flags,
    selectedRecipe: QUANTIZATION_RECIPES[0],
    selectedVllmVersion: v1Version,
    scalingMode: 'tp',
  })

  // In V1, --enable-prefix-caching and --enable-chunked-prefill MUST be omitted
  assert.ok(!cmdV1.includes('--enable-prefix-caching'), 'V1 command must NOT pass --enable-prefix-caching')
  assert.ok(!cmdV1.includes('--enable-chunked-prefill'), 'V1 command must NOT pass --enable-chunked-prefill')

  // In deprecated V0 engine (0.6.x/0.7.x), they should be present
  const v0Version = VLLM_VERSIONS.find((v) => !v.isV1Engine && v.id === '0.6.x_0.7.x')
  const cmdV0 = generateVllmCommand({
    selectedModel: model,
    flags,
    selectedRecipe: QUANTIZATION_RECIPES[0],
    selectedVllmVersion: v0Version,
    scalingMode: 'tp',
  })
  assert.ok(cmdV0.includes('--enable-prefix-caching'), 'V0 command should pass --enable-prefix-caching')
  assert.ok(cmdV0.includes('--enable-chunked-prefill'), 'V0 command should pass --enable-chunked-prefill')
})

test('vLLM Optimizer: getRecommendedGpuForModel suggests appropriate hardware by parameter size', () => {
  // 3B model (e.g. Llama-3.2-3B) -> 16GB
  const rec3b = getRecommendedGpuForModel({ params: 3 })
  assert.strictEqual(rec3b.gpu.vramGb, 16)
  assert.strictEqual(rec3b.suggestedTp, 1)

  // 8B model (e.g. Llama-3.1-8B) -> 24GB
  const rec8b = getRecommendedGpuForModel({ params: 8 })
  assert.strictEqual(rec8b.gpu.vramGb, 24)
  assert.strictEqual(rec8b.suggestedTp, 1)

  // 14B model (e.g. Qwen-14B) -> 24GB
  const rec14b = getRecommendedGpuForModel({ params: 14 })
  assert.strictEqual(rec14b.gpu.vramGb, 24)
  assert.strictEqual(rec14b.suggestedTp, 1)

  // 32B model (e.g. Qwen-32B) -> 48GB (Dual 3090/4090 or L40S)
  const rec32b = getRecommendedGpuForModel({ params: 32 })
  assert.strictEqual(rec32b.gpu.vramGb, 48)
  assert.strictEqual(rec32b.suggestedTp, 2)

  // 70B model (e.g. Llama-3.1-70B) -> 48GB (Dual 3090/4090 with TP=2)
  const rec70b = getRecommendedGpuForModel({ params: 70 })
  assert.strictEqual(rec70b.gpu.vramGb, 48)
  assert.strictEqual(rec70b.suggestedTp, 2)
  assert.ok(rec70b.reason.includes('multi-GPU'))
})

