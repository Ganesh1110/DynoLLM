/**
 * vLLM Performance Modeling, Capacity Sizing, and CLI Generator Engine
 * Pure mathematical estimators, roofline modeling, and deployment manifest generation.
 */

import {
  VLLM_VERSIONS,
  getGpuArchitecture,
  GLOBAL_MODEL_CATALOG,
  QUANTIZATION_RECIPES,
  DEFAULT_VLLM_FLAGS,
} from '../data/vllmConstants.js'
import { GPU_CATALOG } from './gpuSizer.js'

// Re-export constants for convenient consumption
export {
  VLLM_VERSIONS,
  getGpuArchitecture,
  GLOBAL_MODEL_CATALOG,
  QUANTIZATION_RECIPES,
  DEFAULT_VLLM_FLAGS,
}

/**
 * Validate Tensor Parallelism degree against model attention heads
 */
export function validateTpConfig(targetGpu, tp, selectedModel) {
  if (tp <= 1) return { isValid: true }
  const qHeads = selectedModel?.attentionHeads || 32
  const kvHeads = selectedModel?.kvHeads || 8

  const qDivisible = qHeads % tp === 0
  const kvDivisible = kvHeads % tp === 0

  if (!qDivisible) {
    return {
      isValid: false,
      error: `TP degree (${tp}) does not evenly divide attention heads (${qHeads}). vLLM will fail at startup with an invalid head partition error!`,
    }
  }
  if (!kvDivisible) {
    return {
      isValid: true,
      warning: `TP degree (${tp}) does not evenly divide KV heads (${kvHeads}). vLLM will replicate KV heads, increasing per-GPU KV cache consumption.`,
    }
  }
  return { isValid: true }
}

/**
 * Calculate draft model VRAM footprint for speculative decoding
 */
export function calcDraftModelVram(flags) {
  if (!flags?.enableSpeculative) return 0
  if (flags.speculativeMode === 'ngram') return 0
  if (flags.speculativeMode === 'eagle') return 0.45
  return 2.2 // Draft model ~1B params in FP16/BF16
}

/**
 * Calculate LoRA multi-adapter memory buffer
 */
export function calcLoraBuffer(flags) {
  if (!flags?.enableLora) return 0
  return Number(((flags.maxLoras || 4) * (flags.maxLoraRank || 32) * 0.007 + 0.35).toFixed(2))
}

/**
 * Maximum safe concurrency before KV-cache OOM preemption
 */
export function calcMaxSafeConcurrency({
  availableEngineBudgetGb,
  weightsGb,
  runtimeOverheadGb,
  kvPerUserGb,
  scalingMode = 'tp',
  replicaCount = 1,
}) {
  const usableVramForKv = availableEngineBudgetGb - weightsGb - runtimeOverheadGb
  if (usableVramForKv <= 0 || kvPerUserGb <= 0) return 0
  const perInstance = Math.floor(usableVramForKv / kvPerUserGb)
  return scalingMode === 'replicas' ? perInstance * replicaCount : perInstance
}

/**
 * Estimate single-user autoregressive decode throughput (tok/s)
 */
export function calcEstimatedDecodeTps({
  targetGpu,
  weightsGb,
  tensorParallelSize = 1,
  enableSpeculative = false,
  speculativeMode = 'draft_model',
  selectedRecipe,
  gpuArch,
  scalingMode = 'tp',
}) {
  if (!targetGpu || weightsGb <= 0) return 30
  const rawBandwidth = targetGpu.bandwidthGbps * (scalingMode === 'tp' ? tensorParallelSize : 1)

  let memBusEfficiency = 0.65
  const archFamily = gpuArch?.family || ''
  if (archFamily.includes('Hopper')) memBusEfficiency = 0.80
  else if (archFamily.includes('Ada')) memBusEfficiency = 0.70
  else if ((targetGpu.name || '').toLowerCase().includes('a100')) memBusEfficiency = 0.74

  let quantSpeedFactor = 1.0
  const recipeId = selectedRecipe?.id || 'fp16'
  if (recipeId === 'fp8') {
    quantSpeedFactor = gpuArch?.fp8Native ? 1.85 : 1.05
  } else if (recipeId === 'int4_awq') {
    quantSpeedFactor = 2.45
  } else if (recipeId === 'int4_gptq') {
    quantSpeedFactor = 2.55
  } else if (recipeId === 'compressed_tensors') {
    quantSpeedFactor = 1.85
  } else if (recipeId === 'gguf') {
    quantSpeedFactor = 1.95
  }

  let specFactor = 1.0
  if (enableSpeculative) {
    if (speculativeMode === 'ngram') specFactor = 1.45
    else if (speculativeMode === 'eagle') specFactor = 1.75
    else specFactor = 1.60
  }

  const tpOverhead = tensorParallelSize > 1 ? 1 - 0.06 * Math.log2(tensorParallelSize) : 1.0
  const rawToks = (rawBandwidth * memBusEfficiency * 1.4) / Math.max(weightsGb, 0.5)
  const calibratedSpeed = rawToks * quantSpeedFactor * 0.42 * specFactor * tpOverhead

  const maxCeiling = targetGpu.maxComputeTps * (scalingMode === 'tp' ? tensorParallelSize : 1) || 600
  return Math.min(Math.max(12, Math.round(calibratedSpeed)), maxCeiling)
}

/**
 * Estimate Time-To-First-Token prefill latency (ms)
 */
export function calcEstimatedTtftMs({
  enablePrefixCaching = false,
  contextLength = 4096,
  params = 8,
  gpuArch,
  targetGpu,
  scalingMode = 'tp',
  tensorParallelSize = 1,
}) {
  if (enablePrefixCaching) return 14 // Cache hit
  const promptLen = Math.min(contextLength, 2048)
  const peakTflops = (gpuArch?.peakTflops || 100) * (scalingMode === 'tp' ? tensorParallelSize : 1)
  const prefillComputeMs = ((2 * params * 1e9 * promptLen) / (peakTflops * 1e12 * 0.45)) * 1000
  const kernelOverheadMs = (targetGpu?.name || '').toLowerCase().includes('h100') ? 8 : 16
  return Math.max(14, Math.round(prefillComputeMs + kernelOverheadMs))
}

/**
 * Build Quantization Trade-Off Scatter Chart Data
 */
export function buildQuantComparisonData({
  targetGpu,
  baselineFp16Gb,
  gpuArch,
  tensorParallelSize = 1,
  scalingMode = 'tp',
  selectedRecipe,
  recipes = QUANTIZATION_RECIPES,
}) {
  const baseTps = Math.max(25, (targetGpu.bandwidthGbps / Math.max(baselineFp16Gb, 1.0)) * 0.45)
  return recipes.map((r) => {
    let speedFactor = r.speedMultiplier
    let isHwAccelerated = true

    if (r.id === 'fp8') {
      if (!gpuArch?.fp8Native) {
        speedFactor = 1.05
        isHwAccelerated = false
      }
    } else if (r.id === 'gguf') {
      isHwAccelerated = false
    }

    const speed = Math.round(baseTps * speedFactor * (scalingMode === 'tp' ? tensorParallelSize : 1))
    return {
      id: r.id,
      name: r.name.split(' (')[0],
      fullName: r.name,
      speed,
      quality: r.accuracyScore,
      bytes: r.bytesPerParam,
      isHwAccelerated,
      isSelected: selectedRecipe?.id === r.id,
    }
  })
}

/**
 * Build Context Length vs Concurrency Curve
 */
export function buildContextScalingCurve({
  selectedModel,
  availableEngineBudgetGb,
  weightsGb,
  runtimeOverheadGb,
  layers,
  kvHeads,
  headDim,
  bytesPerKvToken,
  scalingMode = 'tp',
  replicaCount = 1,
  currentMaxModelLen = 4096,
}) {
  const sampleContexts = [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072].filter(
    (c) => c <= (selectedModel?.maxContext || 131072)
  )

  const usableVramForKv = availableEngineBudgetGb - weightsGb - runtimeOverheadGb

  return sampleContexts.map((ctx) => {
    const perUserKvGb = (2 * layers * kvHeads * headDim * bytesPerKvToken * ctx) / (1024 * 1024 * 1024)
    const maxUsers = usableVramForKv > 0 && perUserKvGb > 0 ? Math.floor(usableVramForKv / perUserKvGb) : 0
    const activeMaxUsers = scalingMode === 'replicas' ? maxUsers * replicaCount : maxUsers

    return {
      context: `${(ctx / 1024).toFixed(0)}k`,
      contextTokens: ctx,
      maxConcurrency: Math.max(0, activeMaxUsers),
      kvPerUserMb: Number((perUserKvGb * 1024).toFixed(1)),
      isCurrent: Math.abs(ctx - currentMaxModelLen) < 1024,
    }
  })
}

/**
 * Build TP Scaling Efficiency vs Replicas Data
 */
export function buildTpScalingData({ estimatedDecodeTps, concurrency = 1 }) {
  const gpuCounts = [1, 2, 4, 8]
  const baseThroughput = estimatedDecodeTps * Math.min(concurrency, 16)

  return gpuCounts.map((g) => {
    const idealTp = baseThroughput * g
    const allReduceEfficiency = g === 1 ? 1.0 : g === 2 ? 0.94 : g === 4 ? 0.86 : 0.76
    const realTp = Math.round(idealTp * allReduceEfficiency)
    const replicasThroughput = Math.round(baseThroughput * g * 0.98)

    return {
      gpuCount: `${g} GPU${g > 1 ? 's' : ''}`,
      gpus: g,
      idealTp,
      realTp,
      replicasThroughput,
    }
  })
}

/**
 * Build Interactive Roofline Model Data
 */
export function buildRooflineModel({
  targetGpu,
  tensorParallelSize = 1,
  gpuArch,
  scalingMode = 'tp',
  concurrency = 1,
}) {
  const bwGbps = targetGpu.bandwidthGbps * (scalingMode === 'tp' ? tensorParallelSize : 1)
  const peakTflops = (gpuArch?.peakTflops || 100) * (scalingMode === 'tp' ? tensorParallelSize : 1)
  const ridgeIntensity = (peakTflops * 1000) / Math.max(bwGbps, 1)

  const points = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512]
  const curve = points.map((intensity) => {
    const attainableTflops = Math.min(peakTflops, (bwGbps * intensity) / 1000)
    return {
      intensity,
      attainableTflops: Number(attainableTflops.toFixed(1)),
      peakCeiling: peakTflops,
    }
  })

  // Current Operating Points
  const decodeIntensity = 1.0 * Math.min(concurrency, 32)
  const decodeTflops = Math.min(peakTflops, (bwGbps * decodeIntensity) / 1000)

  const prefillIntensity = 64
  const prefillTflops = Math.min(peakTflops, (bwGbps * prefillIntensity) / 1000)

  return {
    curve,
    peakTflops,
    bwGbps,
    ridgeIntensity: Number(ridgeIntensity.toFixed(1)),
    operatingPoints: [
      {
        name: `Current Decode (bs=${concurrency})`,
        intensity: decodeIntensity,
        tflops: Number(decodeTflops.toFixed(1)),
        bound: decodeIntensity < ridgeIntensity ? 'Memory-Bandwidth Bound' : 'Compute Bound',
      },
      {
        name: 'Prefill Phase (Prompt)',
        intensity: prefillIntensity,
        tflops: Number(prefillTflops.toFixed(1)),
        bound: 'Compute Bound',
      },
    ],
  }
}

/**
 * Build Concurrency vs Cost per 1M Tokens Data
 */
export function buildCostEfficiencyCurve({
  effectiveGpuHourlyCost,
  scalingMode = 'tp',
  tensorParallelSize = 1,
  replicaCount = 1,
  maxSafeConcurrency = 1,
  estimatedDecodeTps = 30,
}) {
  const steps = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64]
  const effectiveCostPerHour =
    effectiveGpuHourlyCost * (scalingMode === 'tp' ? tensorParallelSize : replicaCount)

  return steps.map((u) => {
    const isSaturated = u > maxSafeConcurrency
    const batchEfficiency = Math.min(1.0, 0.45 + Math.log10(u) * 0.35)
    const systemThroughput = isSaturated
      ? Math.round(estimatedDecodeTps * Math.max(1, maxSafeConcurrency) * 0.75)
      : Math.round(estimatedDecodeTps * u * batchEfficiency * (scalingMode === 'replicas' ? replicaCount : 1))

    const tokensPerHour = systemThroughput * 3600
    const millionTokensPerHour = Math.max(0.001, tokensPerHour / 1000000)
    const costPerMillion = Number((effectiveCostPerHour / millionTokensPerHour).toFixed(3))

    return {
      concurrency: u,
      costPerMillion,
      systemThroughput,
      isSaturated,
    }
  })
}

/**
 * Build Concurrency Chart Data (Throughput & Latency)
 */
export function buildConcurrencyChartData({
  maxSafeConcurrency = 1,
  estimatedDecodeTps = 30,
  estimatedTtftMs = 50,
  scalingMode = 'tp',
  replicaCount = 1,
}) {
  const steps = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64]
  return steps.map((u) => {
    const isSaturated = u > maxSafeConcurrency
    const batchEfficiency = Math.min(1.0, 0.45 + Math.log10(u) * 0.35)
    const systemThroughput = isSaturated
      ? Math.round(estimatedDecodeTps * Math.max(1, maxSafeConcurrency) * 0.75)
      : Math.round(estimatedDecodeTps * u * batchEfficiency * (scalingMode === 'replicas' ? replicaCount : 1))

    const simTtft = isSaturated
      ? Math.round(estimatedTtftMs * (1 + (u - maxSafeConcurrency) * 0.55))
      : Math.round(estimatedTtftMs * (1 + (u - 1) * 0.04))

    const simItl = isSaturated
      ? Math.round((1000 / estimatedDecodeTps) * (1 + (u - maxSafeConcurrency) * 0.4))
      : Math.round((1000 / estimatedDecodeTps) * (1 + (u - 1) * 0.025))

    return {
      concurrency: u,
      throughput: systemThroughput,
      ttft: simTtft,
      itl: simItl,
      isSaturated,
    }
  })
}

/**
 * Build VRAM Breakdown Data for Stacked Bar Chart
 */
export function buildVramBreakdown({
  weightsGb,
  totalKvNeededGb,
  runtimeOverheadGb,
  freeVramHeadroomGb,
}) {
  return [
    {
      name: 'VRAM Usage',
      Weights: Number(weightsGb.toFixed(1)),
      KVCache: Number(totalKvNeededGb.toFixed(1)),
      Overhead: Number(runtimeOverheadGb.toFixed(1)),
      FreeHeadroom: Number(freeVramHeadroomGb.toFixed(1)),
    },
  ]
}

/**
 * Suggest optimal target GPU for a given model
 * Considers model parameter count, precision/quantization, and minimum viable VRAM.
 * @param {object} model - Model specification (contains .params)
 * @param {Array} [gpuCatalog=GPU_CATALOG] - List of available GPUs
 * @returns {object} Recommended GPU with reason, suggested tensorParallelSize, and minVramRequired
 */
export function getRecommendedGpuForModel(model, gpuCatalog = GPU_CATALOG) {
  const params = Number(model?.params) || 8

  let preferredName = 'NVIDIA RTX 3090 / 4090'
  let suggestedTp = 1
  let reason = ''

  if (params <= 4) {
    preferredName = 'NVIDIA RTX 4060 Ti (16GB)'
    suggestedTp = 1
    reason = `Compact ${params}B model fits comfortably on cost-effective 16GB VRAM with fast single-user latency.`
  } else if (params <= 9) {
    preferredName = 'NVIDIA RTX 3090 / 4090'
    suggestedTp = 1
    reason = `Standard 24GB VRAM provides optimal buffer for ${params}B models with full KV cache and high concurrency.`
  } else if (params <= 16) {
    preferredName = 'NVIDIA RTX 3090 / 4090'
    suggestedTp = 1
    reason = `24GB VRAM runs ${params}B in FP8 or AWQ quantization (~9–14GB weights) with ample KV headroom.`
  } else if (params <= 35) {
    preferredName = 'Dual RTX 3090 / 4090 (2x24GB)'
    suggestedTp = 2
    reason = `Dual 24GB cards (TP=2) or 48GB VRAM splits ${params}B weights to ~9GB/card with 1.9 TB/s aggregate bandwidth.`
  } else {
    preferredName = 'Dual RTX 3090 / 4090 (2x24GB)'
    suggestedTp = 2
    reason = `Large ${params}B model requires multi-GPU (TP=2) or 48GB+ memory pool to host quantized weights.`
  }

  const matchedGpu =
    gpuCatalog.find((g) => g.name === preferredName) ||
    gpuCatalog.find((g) => g.vramGb >= (params > 35 ? 48 : params > 16 ? 32 : params > 8 ? 20 : 12)) ||
    gpuCatalog[0]

  return {
    gpu: matchedGpu,
    suggestedTp,
    reason,
    minVramRequired: params > 35 ? 40 : params > 16 ? 24 : params > 8 ? 16 : 8,
  }
}

/**
 * Model & GPU Matchmaker Recommendation Engine
 */
export function buildMatchmakerRecommendations({
  selectedModel,
  gpuCatalog = GPU_CATALOG,
  recipes = QUANTIZATION_RECIPES,
}) {
  const params = selectedModel?.params || 8

  // 1. Best Value / Budget Pick
  let valueGpuName = 'NVIDIA A10G (24GB)'
  let valueRecipeId = 'int4_awq'
  let valueTp = 1
  let valueScaling = 'tp'
  let valueReason = 'Lowest cloud hourly cost (~$1.00/hr) with INT4 AWQ fitting smoothly on a single 24GB node.'

  if (params <= 9) {
    valueGpuName = 'NVIDIA L4 (24GB Ada)'
    valueRecipeId = 'int4_awq'
    valueTp = 1
    valueReason = 'Lowest cloud hourly cost (~$0.65/hr) with INT4 AWQ. Fits comfortably on 24GB VRAM with ample KV headroom.'
  } else if (params <= 16) {
    valueGpuName = 'NVIDIA RTX 3090 / 4090'
    valueRecipeId = 'int4_awq'
    valueTp = 1
    valueReason = 'Single 24GB workstation card with AWQ quantization (~9GB weights), leaving 15GB VRAM for concurrent KV cache.'
  } else if (params <= 35) {
    valueGpuName = 'Dual RTX 3090 / 4090 (2x24GB)'
    valueRecipeId = 'int4_awq'
    valueTp = 2
    valueReason = 'Dual 24GB cards with TP=2 splits 32B weights to ~9GB/card with 1.9 TB/s aggregate bandwidth.'
  } else {
    valueGpuName = 'Dual RTX 3090 / 4090 (2x24GB)'
    valueRecipeId = 'int4_awq'
    valueTp = 2
    valueReason = 'Dual 24GB or L40S with INT4 AWQ fits 70B (~38.5 GB weights) across two GPUs without needing an 80GB SXM cluster.'
  }

  // 2. Lowest Latency / Pure Speed Pick
  let speedGpuName = 'NVIDIA H100 (80GB SXM5)'
  let speedRecipeId = 'fp8'
  let speedTp = params > 35 ? 4 : (params > 16 ? 2 : 1)
  let speedReason = `Hopper 4th-Gen Tensor Cores + 3.35 TB/s HBM3 delivering 180-220 tok/s decode with sub-25ms TTFT.`
  if (params > 35) {
    speedReason = `4x H100 (TP=4) over NVLink delivering ultra-fast 80+ tok/s on 70B with native FP8 acceleration.`
  }

  // 3. Enterprise High-Concurrency Pick
  let scaleGpuName = 'NVIDIA A100 (80GB HBM2e)'
  let scaleRecipeId = 'fp8'
  let scaleTp = params > 35 ? 2 : 1
  let scaleReason = `80GB HBM2e memory pool provides massive KV cache for 64+ concurrent users without out-of-memory preemption.`
  if (params > 35) {
    scaleGpuName = 'NVIDIA A100 (80GB HBM2e)'
    scaleRecipeId = 'int4_awq'
    scaleTp = 2
    scaleReason = `2x A100 80GB (TP=2) provides 160GB total VRAM, comfortably handling 80+ simultaneous users with 8k contexts.`
  }

  const valueGpu = gpuCatalog.find((g) => g.name === valueGpuName) || gpuCatalog[0]
  const speedGpu = gpuCatalog.find((g) => g.name === speedGpuName) || gpuCatalog[gpuCatalog.length - 1]
  const scaleGpu = gpuCatalog.find((g) => g.name === scaleGpuName) || gpuCatalog[gpuCatalog.length - 2]

  const valueRecipe = recipes.find((r) => r.id === valueRecipeId) || recipes[2]
  const speedRecipe = recipes.find((r) => r.id === speedRecipeId) || recipes[1]
  const scaleRecipe = recipes.find((r) => r.id === scaleRecipeId) || recipes[1]

  return [
    {
      tag: 'Best Value / Budget',
      tagColor: 'emerald',
      gpu: valueGpu,
      recipe: valueRecipe,
      tp: valueTp,
      scaling: valueScaling,
      rationale: valueReason,
      costEstimate: params <= 9 ? '~$0.65/hr' : params <= 35 ? '~$1.50/hr' : '~$2.80/hr',
      estDecode: params <= 9 ? '~68 tok/s' : params <= 35 ? '~54 tok/s' : '~32 tok/s',
    },
    {
      tag: 'Lowest Latency / Pure Speed',
      tagColor: 'amber',
      gpu: speedGpu,
      recipe: speedRecipe,
      tp: speedTp,
      scaling: 'tp',
      rationale: speedReason,
      costEstimate: speedTp > 1 ? `~$${(3.85 * speedTp).toFixed(2)}/hr (${speedTp}x H100)` : '~$3.85/hr',
      estDecode: params <= 9 ? '~210 tok/s' : params <= 35 ? '~135 tok/s' : '~82 tok/s',
    },
    {
      tag: 'Enterprise Concurrency (Scale-Out)',
      tagColor: 'sky',
      gpu: scaleGpu,
      recipe: scaleRecipe,
      tp: scaleTp,
      scaling: 'tp',
      rationale: scaleReason,
      costEstimate: scaleTp > 1 ? `~$${(2.40 * scaleTp).toFixed(2)}/hr (${scaleTp}x A100)` : '~$2.40/hr',
      estDecode: params <= 9 ? '~130 tok/s' : params <= 35 ? '~92 tok/s' : '~58 tok/s',
    },
  ]
}

/**
 * Generate CLI `vllm serve` invocation command
 */
export function generateVllmCommand({
  selectedModel,
  flags,
  selectedRecipe,
  selectedVllmVersion,
  scalingMode = 'tp',
}) {
  const isV1Engine = selectedVllmVersion?.isV1Engine ?? true
  const isLegacy = selectedVllmVersion?.id === '0.3.x'

  let cmd = `vllm serve ${selectedModel.name}`
  cmd += ` \\\n  --max-model-len ${flags.maxModelLen}`
  cmd += ` \\\n  --gpu-memory-utilization ${flags.gpuMemoryUtilization.toFixed(2)}`
  cmd += ` \\\n  --block-size ${flags.blockSize}`
  cmd += ` \\\n  --max-num-seqs ${flags.maxNumSeqs}`

  if (!isLegacy) {
    cmd += ` \\\n  --max-num-batched-tokens ${flags.maxNumBatchedTokens}`
  }

  if (flags.kvCacheDtype !== 'auto' && !isLegacy) {
    cmd += ` \\\n  --kv-cache-dtype ${flags.kvCacheDtype}`
  }

  if (flags.swapSpace !== 4) {
    cmd += ` \\\n  --swap-space ${flags.swapSpace}`
  }

  if (flags.cpuOffloadGb > 0) {
    cmd += ` \\\n  --cpu-offload-gb ${flags.cpuOffloadGb}`
  }

  if (scalingMode === 'tp' && flags.tensorParallelSize > 1) {
    cmd += ` \\\n  --tensor-parallel-size ${flags.tensorParallelSize}`
  }

  if (flags.pipelineParallelSize > 1) {
    cmd += ` \\\n  --pipeline-parallel-size ${flags.pipelineParallelSize}`
  }

  if (flags.distributedExecutorBackend !== 'mp' && (flags.tensorParallelSize > 1 || flags.pipelineParallelSize > 1)) {
    cmd += ` \\\n  --distributed-executor-backend ${flags.distributedExecutorBackend}`
  }

  if (selectedRecipe?.vllmArg) {
    cmd += ` \\\n  ${selectedRecipe.vllmArg}`
  } else if (flags.quantization !== 'none') {
    cmd += ` \\\n  --quantization ${flags.quantization}`
  }

  // In V1 engine (0.8+), chunked prefill and prefix caching are active by default.
  // Explicitly passing them triggers legacy fallback or syntax errors.
  if (!isV1Engine && !isLegacy) {
    if (flags.enablePrefixCaching) {
      cmd += ` \\\n  --enable-prefix-caching`
    }
    if (flags.enableChunkedPrefill) {
      cmd += ` \\\n  --enable-chunked-prefill`
    }
    if (flags.numSchedulerSteps > 1) {
      cmd += ` \\\n  --num-scheduler-steps ${flags.numSchedulerSteps}`
    }
  }

  if (flags.disableSlidingWindow) {
    cmd += ` \\\n  --disable-sliding-window`
  }

  if (flags.disableLogStats) {
    cmd += ` \\\n  --disable-log-stats`
  }

  // Speculative Decoding
  if (flags.enableSpeculative && !isLegacy) {
    if (flags.speculativeMode === 'ngram') {
      cmd += ` \\\n  --speculative-model [ngram] \\\n  --num-speculative-tokens ${flags.numSpeculativeTokens}`
    } else {
      cmd += ` \\\n  --speculative-model ${flags.speculativeModel} \\\n  --num-speculative-tokens ${flags.numSpeculativeTokens}`
    }
  }

  if (flags.enforceEager) {
    cmd += ` \\\n  --enforce-eager`
  }

  if (flags.servedModelName?.trim()) {
    cmd += ` \\\n  --served-model-name ${flags.servedModelName.trim()}`
  }

  if (flags.loadFormat !== 'auto') {
    cmd += ` \\\n  --load-format ${flags.loadFormat}`
  }

  if (flags.limitMmPerPrompt?.trim()) {
    cmd += ` \\\n  --limit-mm-per-prompt ${flags.limitMmPerPrompt.trim()}`
  }

  // LoRA Multi-Adapter Serving
  if (flags.enableLora) {
    cmd += ` \\\n  --enable-lora`
    if (flags.maxLoras > 1) {
      cmd += ` \\\n  --max-loras ${flags.maxLoras}`
    }
    if (flags.maxLoraRank !== 16) {
      cmd += ` \\\n  --max-lora-rank ${flags.maxLoraRank}`
    }
    if (flags.loraModules?.trim()) {
      cmd += ` \\\n  --lora-modules ${flags.loraModules.trim()}`
    }
  }

  // Structured Outputs & Tool Calling
  if (flags.guidedDecodingBackend && flags.guidedDecodingBackend !== 'xgrammar') {
    cmd += ` \\\n  --guided-decoding-backend ${flags.guidedDecodingBackend}`
  }
  if (flags.toolCallParser && flags.toolCallParser !== 'none') {
    cmd += ` \\\n  --tool-call-parser ${flags.toolCallParser}`
  }
  if (flags.enableAutoToolChoice) {
    cmd += ` \\\n  --enable-auto-tool-choice`
  }

  if (flags.apiKey?.trim()) {
    cmd += ` \\\n  --api-key ${flags.apiKey.trim()}`
  }

  if (flags.trustRemoteCode) {
    cmd += ` \\\n  --trust-remote-code`
  }

  return cmd
}

/**
 * Multi-Node Ray Cluster Bootstrap Snippet
 */
export function generateRayCluster({ selectedModel, flags, selectedRecipe }) {
  return `# Step 1: Start Ray Head Node on Primary Machine (Node 0)
ray start --head --port=6379 --dashboard-host=0.0.0.0 --num-gpus=${flags.tensorParallelSize}

# Step 2: On Worker Nodes (Nodes 1..N), connect to Head Node
ray start --address='<HEAD_NODE_IP>:6379' --num-gpus=${flags.tensorParallelSize}

# Step 3: Launch Multi-Node vLLM Engine on Head Node
vllm serve ${selectedModel.name} \\
  --pipeline-parallel-size ${flags.pipelineParallelSize} \\
  --tensor-parallel-size ${flags.tensorParallelSize} \\
  --distributed-executor-backend ray \\
  --max-model-len ${flags.maxModelLen} \\
  --gpu-memory-utilization ${flags.gpuMemoryUtilization.toFixed(2)} \\
  ${selectedRecipe?.vllmArg || ''} \\
  --api-key ${flags.apiKey || 'dyno-prod-key-99'} \\
  --port 8000`
}

/**
 * Verification Help Command
 */
export function generateHelpVerifyCmd() {
  return `python3 -m vllm.entrypoints.openai.api_server --help | grep -iE "max-model-len|gpu-memory-utilization|tensor-parallel-size|cpu-offload-gb|pipeline-parallel-size|enable-lora|guided-decoding-backend"`
}

/**
 * Docker Compose Snippet with Auth & GPU Reservation
 */
export function generateDockerCompose({
  selectedModel,
  flags,
  selectedRecipe,
  scalingMode = 'tp',
  replicaCount = 1,
  isV1Engine = true,
}) {
  return `version: '3.8'
services:
  vllm-engine:
    image: vllm/vllm-openai:latest
    container_name: vllm-production
    runtime: nvidia
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - HUGGING_FACE_HUB_TOKEN=\${HF_TOKEN}
      - VLLM_API_KEY=\${VLLM_API_KEY:-${flags.apiKey || 'dyno-prod-key-99'}}
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: ${scalingMode === 'tp' ? flags.tensorParallelSize : replicaCount}
              capabilities: [gpu]
    command: >
      serve ${selectedModel.name}
      --max-model-len ${flags.maxModelLen}
      --gpu-memory-utilization ${flags.gpuMemoryUtilization.toFixed(2)}
      --block-size ${flags.blockSize}
      ${!isV1Engine && flags.enablePrefixCaching ? '--enable-prefix-caching' : ''}
      ${!isV1Engine && flags.enableChunkedPrefill ? '--enable-chunked-prefill' : ''}
      ${flags.cpuOffloadGb > 0 ? `--cpu-offload-gb ${flags.cpuOffloadGb}` : ''}
      ${selectedRecipe?.vllmArg || ''}
      --api-key \${VLLM_API_KEY:-${flags.apiKey || 'dyno-prod-key-99'}}
      --port 8000`
}

/**
 * Env file snippet with Auth
 */
export function generateEnvSnippet({
  selectedModel,
  flags,
  selectedRecipe,
  isV1Engine = true,
}) {
  const recipeId = selectedRecipe?.id || 'none'
  const quantStr =
    recipeId === 'fp8'
      ? 'fp8'
      : recipeId.includes('awq')
      ? 'awq'
      : recipeId.includes('gptq')
      ? 'gptq'
      : 'none'

  return `# vLLM Production Configuration for ${selectedModel.name}
VLLM_MODEL=${selectedModel.name}
VLLM_MAX_MODEL_LEN=${flags.maxModelLen}
VLLM_GPU_MEMORY_UTILIZATION=${flags.gpuMemoryUtilization.toFixed(2)}
VLLM_BLOCK_SIZE=${flags.blockSize}
${!isV1Engine ? `VLLM_ENABLE_PREFIX_CACHING=${flags.enablePrefixCaching}\nVLLM_ENABLE_CHUNKED_PREFILL=${flags.enableChunkedPrefill}` : '# In vLLM 0.8+ (V1), Chunked Prefill & Prefix Caching are active by default'}
VLLM_TENSOR_PARALLEL_SIZE=${flags.tensorParallelSize}
VLLM_PIPELINE_PARALLEL_SIZE=${flags.pipelineParallelSize}
VLLM_CPU_OFFLOAD_GB=${flags.cpuOffloadGb}
VLLM_QUANTIZATION=${quantStr}
VLLM_API_KEY=${flags.apiKey || 'dyno-prod-key-99'}
VLLM_HOST=0.0.0.0
VLLM_PORT=8000`
}
