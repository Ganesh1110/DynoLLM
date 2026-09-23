/**
 * GPU Sizing & Concurrency Sizing Utility
 * Pure hardware capability, VRAM footprint, and concurrent generation modeling.
 */

export const GPU_TIERS = [8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192]

export const CONTEXT_LENGTH_OPTIONS = [
  { value: 2048, label: '2k Context (Fast / Chat)', short: '2k' },
  { value: 4096, label: '4k Context (Standard RAG / Dev)', short: '4k' },
  { value: 8192, label: '8k Context (Long-form / Coding)', short: '8k' },
  { value: 16384, label: '16k Context (Document Analysis)', short: '16k' },
  { value: 32768, label: '32k Context (Deep Context)', short: '32k' },
]

export const PRECISION_OPTIONS = [
  { value: 2.0, label: 'FP16 / BF16 (2.0 bytes/param)', short: 'FP16' },
  { value: 1.0, label: 'INT8 / Q8_0 (1.0 byte/param)', short: 'INT8' },
  { value: 0.75, label: 'Q6_K (0.75 bytes/param)', short: 'Q6' },
  { value: 0.65, label: 'Q5_K_M (0.65 bytes/param)', short: 'Q5' },
  { value: 0.55, label: 'INT4 / Q4_K_M / GPTQ / AWQ (0.55 bytes/param)', short: 'INT4' },
]

export const MODEL_PRESETS = [
  { name: 'llama3.1:8b-instruct-q4_K_M', params: 8, precision: 0.55, overhead: 25, label: 'Llama 3.1 8B (Q4_K_M)', layers: 32, kvHeads: 8, headDim: 128 },
  { name: 'llama3.1:8b-instruct-fp16', params: 8, precision: 2.0, overhead: 25, label: 'Llama 3.1 8B (FP16 Unquantized)', layers: 32, kvHeads: 8, headDim: 128 },
  { name: 'llama3.1:70b-instruct-q4_K_M', params: 70, precision: 0.55, overhead: 25, label: 'Llama 3.1 70B (Q4_K_M)', layers: 80, kvHeads: 8, headDim: 128 },
  { name: 'qwen2.5:7b-instruct-q4_K_M', params: 7, precision: 0.55, overhead: 25, label: 'Qwen 2.5 7B (Q4_K_M)', layers: 28, kvHeads: 4, headDim: 128 },
  { name: 'qwen2.5:14b-instruct-q4_K_M', params: 14, precision: 0.55, overhead: 25, label: 'Qwen 2.5 14B (Q4_K_M)', layers: 40, kvHeads: 8, headDim: 128 },
  { name: 'qwen3:14b-fp8', params: 14, precision: 1.0, overhead: 25, label: 'Qwen 3 14B (FP8 / vLLM)', layers: 40, kvHeads: 8, headDim: 128 },
  { name: 'qwen2.5:32b-instruct-q4_K_M', params: 32, precision: 0.55, overhead: 25, label: 'Qwen 2.5 32B (Q4_K_M)', layers: 64, kvHeads: 8, headDim: 128 },
  { name: 'qwen2.5:72b-instruct-q4_K_M', params: 72, precision: 0.55, overhead: 25, label: 'Qwen 2.5 72B (Q4_K_M)', layers: 80, kvHeads: 8, headDim: 128 },
  { name: 'deepseek-r1:14b', params: 14, precision: 0.55, overhead: 30, label: 'DeepSeek R1 14B (Q4_K_M)', layers: 40, kvHeads: 8, headDim: 128 },
  { name: 'deepseek-r1:32b', params: 32, precision: 0.55, overhead: 30, label: 'DeepSeek R1 32B (Q4_K_M)', layers: 64, kvHeads: 8, headDim: 128 },
  { name: 'deepseek-r1:70b', params: 70, precision: 0.55, overhead: 30, label: 'DeepSeek R1 70B (Q4_K_M)', layers: 80, kvHeads: 8, headDim: 128 },
  { name: 'mistral:7b-instruct-v0.3', params: 7, precision: 0.55, overhead: 25, label: 'Mistral 7B (Q4_K_M)', layers: 32, kvHeads: 8, headDim: 128 },
  { name: 'gemma2:9b', params: 9, precision: 0.55, overhead: 25, label: 'Gemma 2 9B (Q4_K_M)', layers: 42, kvHeads: 8, headDim: 256 },
  { name: 'gemma2:27b', params: 27, precision: 0.55, overhead: 25, label: 'Gemma 2 27B (Q4_K_M)', layers: 46, kvHeads: 16, headDim: 128 },
  { name: 'phi3.5:3.8b', params: 3.8, precision: 0.55, overhead: 20, label: 'Phi 3.5 3.8B (Q4_K_M)', layers: 32, kvHeads: 32, headDim: 96 },
]

export const GPU_CATALOG = [
  {
    name: 'NVIDIA RTX 3060',
    category: 'Consumer Desktop',
    vramGb: 12,
    bandwidthGbps: 360,
    maxBatch: 12,
    maxComputeTps: 180,
    badge: 'Budget Entry',
    notes: 'Solid 12GB entry point for 7B-8B Q4 models at low-to-medium concurrency.',
  },
  {
    name: 'NVIDIA RTX 4060 Ti (16GB)',
    category: 'Consumer Desktop',
    vramGb: 16,
    bandwidthGbps: 288,
    maxBatch: 16,
    maxComputeTps: 220,
    badge: 'Budget 16GB',
    notes: 'Generous 16GB buffer allows running 8B-14B models with longer KV cache.',
  },
  {
    name: 'NVIDIA RTX 4070 Ti Super',
    category: 'High-End Consumer',
    vramGb: 16,
    bandwidthGbps: 672,
    maxBatch: 24,
    maxComputeTps: 380,
    badge: 'Fast 16GB GDDR6X',
    notes: 'High memory bandwidth delivers rapid single-user generation and medium batching.',
  },
  {
    name: 'NVIDIA RTX 3090 / 4090',
    category: 'Workstation Enthusiast',
    vramGb: 24,
    bandwidthGbps: 1008,
    maxBatch: 36,
    maxComputeTps: 650,
    badge: 'Workstation King',
    notes: 'Gold standard for local LLM inference. Runs 8B FP16, 14B, and 32B Q4 with multi-user batching.',
  },
  {
    name: 'Dual RTX 3090 / 4090 (2x24GB)',
    category: 'Multi-GPU Workstation',
    vramGb: 48,
    bandwidthGbps: 1900,
    maxBatch: 64,
    maxComputeTps: 1100,
    badge: '70B Workstation Rig',
    notes: 'Runs 70B Q4_K_M models with tensor parallelism across two PCIe cards.',
  },
  {
    name: 'Apple Mac Studio (M2/M3/M4 Max)',
    category: 'Apple Silicon Unified',
    vramGb: 36,
    bandwidthGbps: 400,
    maxBatch: 20,
    maxComputeTps: 280,
    badge: 'Silent Unified RAM',
    notes: 'Zero-noise desktop with 36GB unified memory for running up to 32B models.',
  },
  {
    name: 'Apple Mac Studio (M2/M3 Ultra 64GB+)',
    category: 'Apple Silicon Unified',
    vramGb: 64,
    bandwidthGbps: 800,
    maxBatch: 36,
    maxComputeTps: 480,
    badge: '70B Unified Powerhouse',
    notes: '64GB unified memory natively fits 70B Q4_K_M models with zero swapping.',
  },
  {
    name: 'Apple Mac Studio (M2/M3 Ultra 128GB+)',
    category: 'Apple Silicon Unified',
    vramGb: 128,
    bandwidthGbps: 800,
    maxBatch: 64,
    maxComputeTps: 600,
    badge: 'Massive Unified RAM',
    notes: '128GB unified RAM runs 70B FP16 or deep 32k context batches without VRAM limits.',
  },
  {
    name: 'NVIDIA L4 (24GB Ada)',
    category: 'Cloud Datacenter',
    vramGb: 24,
    bandwidthGbps: 300,
    maxBatch: 32,
    maxComputeTps: 350,
    badge: 'Cloud Energy Efficient',
    notes: 'Single-slot 72W datacenter GPU designed for production microservices and vLLM serving.',
  },
  {
    name: 'NVIDIA A10G (24GB)',
    category: 'Cloud Datacenter',
    vramGb: 24,
    bandwidthGbps: 600,
    maxBatch: 40,
    maxComputeTps: 450,
    badge: 'Cloud Production Workhorse',
    notes: 'Standard AWS g5 cloud instance GPU for reliable web API serving.',
  },
  {
    name: 'NVIDIA L40S (48GB)',
    category: 'Cloud Datacenter',
    vramGb: 48,
    bandwidthGbps: 864,
    maxBatch: 64,
    maxComputeTps: 900,
    badge: '48GB Cloud Titan',
    notes: 'Massive 48GB GDDR6 memory allows serving 70B Q4 or high-concurrency 14B/32B workloads.',
  },
  {
    name: 'NVIDIA A100 (80GB HBM2e)',
    category: 'Cloud Enterprise',
    vramGb: 80,
    bandwidthGbps: 2039,
    maxBatch: 128,
    maxComputeTps: 1800,
    badge: 'Enterprise High-Concurrency',
    notes: 'Ultra-fast 2 TB/s HBM2e memory bandwidth scales to 80+ concurrent users with deep KV cache.',
  },
  {
    name: 'NVIDIA H100 (80GB SXM5)',
    category: 'Cloud Enterprise',
    vramGb: 80,
    bandwidthGbps: 3350,
    maxBatch: 200,
    maxComputeTps: 3200,
    badge: 'Maximum Throughput',
    notes: 'Flagship inference monster with 3.35 TB/s bandwidth and FP8 transformer engine.',
  },
]

/**
 * Parses freeform model name (e.g. "llama3.1:8b-instruct-q4_K_M", "qwen2.5:72b")
 */
export function parseModelName(name) {
  if (!name || typeof name !== 'string') {
    return { params: 8, precision: 0.55, overhead: 25, layers: 32, kvHeads: 8, headDim: 128, detected: false }
  }

  const clean = name.toLowerCase().trim()

  // 1. Check known presets first for exact architectural parameters
  const matchedPreset = MODEL_PRESETS.find(
    (p) => clean.includes(p.name.toLowerCase()) || clean.includes(p.label.toLowerCase())
  )

  // 2. Extract billion parameter count
  let params = matchedPreset?.params || 8
  let detected = Boolean(matchedPreset)
  if (!matchedPreset) {
    const paramMatch = clean.match(/(?:^|[:\-_/\s])(\d+(?:\.\d+)?)\s*[bB](?:$|[:\-_/\s])/)
    if (paramMatch && paramMatch[1]) {
      params = parseFloat(paramMatch[1])
      detected = true
    }
  }

  // 3. Extract precision / quantization
  let precision = matchedPreset?.precision || 0.55
  if (!matchedPreset) {
    if (clean.includes('fp16') || clean.includes('bf16') || clean.includes('16bit')) {
      precision = 2.0
    } else if (clean.includes('fp8') || clean.includes('int8') || clean.includes('q8') || clean.includes('8bit')) {
      precision = 1.0
    } else if (clean.includes('q6')) {
      precision = 0.75
    } else if (clean.includes('q5')) {
      precision = 0.65
    } else if (
      clean.includes('q4') ||
      clean.includes('int4') ||
      clean.includes('awq') ||
      clean.includes('gptq') ||
      clean.includes('4bit')
    ) {
      precision = 0.55
    }
  }

  // 4. Estimate KV cache overhead
  let overhead = matchedPreset?.overhead || 25
  if (!matchedPreset) {
    if (clean.includes('70b') || clean.includes('72b')) {
      overhead = 25
    } else if (clean.includes('deepseek')) {
      overhead = 30
    }
  }

  // 5. Attention Architecture (Layers, KV Heads, Head Dim)
  let layers = matchedPreset?.layers
  let kvHeads = matchedPreset?.kvHeads
  let headDim = matchedPreset?.headDim || 128

  if (!layers) {
    if (clean.includes('qwen') || clean.includes('deepseek')) {
      if (params >= 70) { layers = 80; kvHeads = 8 }
      else if (params >= 30) { layers = 64; kvHeads = 8 }
      else if (params >= 14) { layers = 40; kvHeads = 8 }
      else { layers = 28; kvHeads = 4 }
    } else if (clean.includes('gemma')) {
      if (params >= 25) { layers = 46; kvHeads = 16; headDim = 128 }
      else { layers = 42; kvHeads = 8; headDim = 256 }
    } else {
      // Standard Llama / Mistral GQA profile
      if (params >= 65) { layers = 80; kvHeads = 8 }
      else if (params >= 30) { layers = 64; kvHeads = 8 }
      else if (params >= 12) { layers = 40; kvHeads = 8 }
      else { layers = 32; kvHeads = 8 }
    }
  }

  return { params, precision, overhead, layers, kvHeads, headDim, detected }
}

/**
 * Returns the nearest standard GPU tier for a required VRAM size
 */
export function nextTier(needGb) {
  for (const t of GPU_TIERS) {
    if (t >= needGb) return t
  }
  return Math.ceil(needGb / 40) * 40
}

/**
 * Model VRAM requirement calculation
 */
export function calcVRAM(paramsBillion, bytesPerParam, overheadPct = 25) {
  const params = Math.max(0, parseFloat(paramsBillion) || 0)
  const bytes = Math.max(0.1, parseFloat(bytesPerParam) || 0.55)
  const overhead = Math.max(0, parseFloat(overheadPct) || 0)

  const weightsGb = params * bytes
  const totalVramGb = weightsGb * (1 + overhead / 100)
  const minTier = nextTier(totalVramGb)

  return {
    weightsGb,
    totalVramGb,
    minTier,
  }
}

/**
 * Computes detailed KV cache architecture specifications.
 * Uses the exact transformer attention architecture formula:
 *   KV Bytes / token = 2 * N_layers * N_kv_heads * head_dim * bytes_per_element
 *   Allocated Tokens = ceil(Context / BlockSize) * BlockSize
 *   Total KV (GiB) = (KV Bytes / token * Allocated Tokens) / (1024^3)
 *
 * @param {number} paramsBillion Model parameters in billions
 * @param {number} contextTokens Sequence length in tokens (default 4096)
 * @param {string|object} modelOrArch Model name string or architecture object
 * @param {number} blockSize PagedAttention block size in tokens (default 16)
 * @param {number} kvDtypeBytes Bytes per element (2 for BF16/FP16, 1 for FP8)
 */
export function calcDetailedKvSpecs(paramsBillion, contextTokens = 4096, modelOrArch = null, blockSize = 16, kvDtypeBytes = 2) {
  let layers, kvHeads, headDim = 128, bytesPerElement = kvDtypeBytes || 2

  if (modelOrArch && typeof modelOrArch === 'object') {
    layers = modelOrArch.layers
    kvHeads = modelOrArch.kvHeads
    headDim = modelOrArch.headDim || 128
    bytesPerElement = modelOrArch.kvBytesPerElement || kvDtypeBytes || 2
  } else if (typeof modelOrArch === 'string') {
    const parsed = parseModelName(modelOrArch)
    layers = parsed.layers
    kvHeads = parsed.kvHeads
    headDim = parsed.headDim || 128
  }

  // Fallback estimation using standard GQA architecture if layers / heads not resolved
  const p = Math.max(1, parseFloat(paramsBillion) || 8)
  if (!layers) {
    if (p <= 8) {
      layers = 32
      kvHeads = 8
    } else if (p <= 16) {
      layers = 40
      kvHeads = 8
    } else if (p <= 36) {
      layers = 64
      kvHeads = 8
    } else {
      layers = 80
      kvHeads = 8
    }
  }
  if (!kvHeads) kvHeads = 8

  const c = Math.max(1, parseInt(contextTokens) || 4096)
  const b = Math.max(1, parseInt(blockSize) || 16)
  const allocatedTokens = Math.ceil(c / b) * b

  // First-principles formula: 2 * N_layers * N_kv_heads * head_dim * bytes_per_element
  const bytesPerToken = 2 * layers * kvHeads * headDim * bytesPerElement
  const totalBytes = bytesPerToken * allocatedTokens
  const kvGiB = Math.max(0.05, totalBytes / (1024 ** 3))

  return {
    layers,
    kvHeads,
    headDim,
    bytesPerElement,
    bytesPerToken,
    allocatedTokens,
    kvGiB,
  }
}

/**
 * Calculates KV cache memory consumed per active concurrent stream at a given context length.
 */
export function calcKvCachePerUser(paramsBillion, contextTokens = 4096, modelOrArch = null, blockSize = 16, kvDtypeBytes = 2) {
  return calcDetailedKvSpecs(paramsBillion, contextTokens, modelOrArch, blockSize, kvDtypeBytes).kvGiB
}

/**
 * /**
 * Evaluates how much theoretical concurrency a specific GPU can sustain for a given model.
 * Formula:
 *   M_budget = M_gpu * U (U=0.90)
 *   M_KV = M_budget - M_runtime (weights + 1.0GB activation/workspace margin)
 *   C_theoretical = floor(M_KV / KV_request)
 */
export function evaluateGpuConcurrency(gpu, weightsGb, kvPerUserGb, gpuMemoryUtilization = 0.90) {
  const memoryBudget = gpu.vramGb * gpuMemoryUtilization
  const usableVram = Math.max(0, memoryBudget - 1.0) // 1.0 GB reserved for CUDA context & peak activations
  const kvVramAvailable = usableVram - weightsGb

  if (kvVramAvailable <= 0.5) {
    const deficitGb = Math.abs(kvVramAvailable)
    return {
      gpu,
      fits: false,
      status: 'spill',
      badge: 'Insufficient VRAM',
      color: 'rose',
      headroomGb: kvVramAvailable,
      theoreticalMaxSlots: 0,
      maxConcurrentStreams: 0,
      estimatedAggregateTps: 0,
      perUserTps: 0,
      verdict: `Deficit of ${deficitGb.toFixed(1)} GB. Model weights cannot fit within this GPU's ${memoryBudget.toFixed(1)} GB engine budget.`,
    }
  }

  // Memory-bounded theoretical concurrent slots: C_theoretical = floor(M_KV / KV_request)
  const rawConcurrent = Math.floor(kvVramAvailable / kvPerUserGb)
  const theoreticalMaxSlots = Math.max(1, rawConcurrent)
  const maxConcurrentStreams = Math.max(1, Math.min(rawConcurrent, gpu.maxBatch))

  // Estimated aggregate batch throughput (illustrative empirical curve)
  const batchSpeedup = Math.min(3.5, 1.0 + Math.log2(Math.max(1, maxConcurrentStreams)) * 0.4)
  const singleStreamTps = (gpu.bandwidthGbps / Math.max(2, weightsGb)) * 0.65
  const estimatedAggregateTps = Math.min(gpu.maxComputeTps, Math.round(singleStreamTps * batchSpeedup))
  const perUserTps = Math.max(1, Math.round(estimatedAggregateTps / maxConcurrentStreams))

  const isTight = kvVramAvailable < 3.0

  return {
    gpu,
    fits: true,
    status: isTight ? 'tight' : 'fits',
    badge: isTight ? 'Tight Headroom' : 'Native Fit',
    color: isTight ? 'amber' : 'emerald',
    headroomGb: kvVramAvailable,
    theoreticalMaxSlots,
    maxConcurrentStreams,
    estimatedAggregateTps,
    perUserTps,
    verdict: `Theoretical capacity: ~${theoreticalMaxSlots} slots (~${perUserTps} tok/s/slot, ${estimatedAggregateTps} tok/s total). Real-world serving capacity must be empirically validated via load test.`,
  }
}

/**
 * Evaluates compatibility and theoretical concurrent capacity of connected host machine.
 */
export function evaluateHostFit(arg1, arg2, arg3, arg4) {
  let weightsGb, totalVramGb, currentTelemetry, kvPerUserGb
  if (arg2 && typeof arg2 === 'object') {
    // Called as evaluateHostFit(totalVramGb, currentTelemetry)
    totalVramGb = parseFloat(arg1) || 0
    weightsGb = totalVramGb * 0.8
    currentTelemetry = arg2
    kvPerUserGb = parseFloat(arg3) || 0.5
  } else {
    // Called as evaluateHostFit(weightsGb, totalVramGb, currentTelemetry, kvPerUserGb)
    weightsGb = parseFloat(arg1) || 0
    totalVramGb = parseFloat(arg2) || weightsGb * 1.25
    currentTelemetry = arg3
    kvPerUserGb = parseFloat(arg4) || 0.5
  }

  if (!currentTelemetry) {
    return {
      status: 'unknown',
      badge: 'Host Offline',
      color: 'gray',
      title: 'Host Telemetry Unavailable',
      description: 'Connect to DynoLLM backend to check live host compatibility.',
      availableGb: 0,
      headroomGb: 0,
      maxConcurrentStreams: 0,
    }
  }


  // 1. Check dedicated NVIDIA GPU VRAM
  const gpus = currentTelemetry.gpus || []
  if (gpus.length > 0) {
    const totalGpuVramBytes = gpus.reduce((acc, g) => acc + (g.vram_total_bytes || 0), 0)
    const availableVramGb = totalGpuVramBytes / (1024 ** 3)
    const primaryGpuName = gpus[0]?.name || 'NVIDIA GPU'
    // M_budget = VRAM * 0.90
    const memoryBudget = availableVramGb * 0.90
    const usableVram = Math.max(0, memoryBudget - 1.0)
    const kvVramAvailable = usableVram - weightsGb

    if (kvVramAvailable >= 2.0) {
      const maxStreams = Math.max(1, Math.floor(kvVramAvailable / kvPerUserGb))
      return {
        status: 'fits',
        badge: 'Fits Natively in VRAM',
        color: 'emerald',
        title: `Fits natively on ${primaryGpuName}`,
        description: `Host has ${availableVramGb.toFixed(1)} GB VRAM (${memoryBudget.toFixed(1)} GB engine budget). Leaves ${kvVramAvailable.toFixed(1)} GB for KV cache pool, fitting ~${maxStreams} theoretical full-length slots. Validated serving capacity requires load testing.`,
        availableGb: availableVramGb,
        headroomGb: kvVramAvailable,
        maxConcurrentStreams: maxStreams,
      }
    } else if (kvVramAvailable >= 0) {
      const maxStreams = Math.max(1, Math.floor(kvVramAvailable / kvPerUserGb))
      return {
        status: 'tight',
        badge: 'Tight VRAM Fit',
        color: 'amber',
        title: `Fits with tight VRAM headroom on ${primaryGpuName}`,
        description: `Host has ${availableVramGb.toFixed(1)} GB VRAM (${memoryBudget.toFixed(1)} GB engine budget). Only ${kvVramAvailable.toFixed(1)} GB left for KV cache pool (~${maxStreams} theoretical slot(s)). High risk of queueing under concurrent load.`,
        availableGb: availableVramGb,
        headroomGb: kvVramAvailable,
        maxConcurrentStreams: maxStreams,
      }
    } else {
      const deficitGb = Math.abs(kvVramAvailable)
      return {
        status: 'spill',
        badge: 'Exceeds Host VRAM',
        color: 'rose',
        title: `Exceeds VRAM by ${deficitGb.toFixed(1)} GB on ${primaryGpuName}`,
        description: `Host has ${availableVramGb.toFixed(1)} GB VRAM. Model needs ${totalVramGb.toFixed(1)} GB. Weights will spill to CPU RAM, severely bottlenecking inference to ~1 stream.`,
        availableGb: availableVramGb,
        headroomGb: kvVramAvailable,
        maxConcurrentStreams: 1,
      }
    }
  }

  // 2. Check Apple Silicon / System Unified Memory
  const totalRamBytes = currentTelemetry.ram_total_bytes || 0
  const totalRamGb = totalRamBytes / (1024 ** 3)
  const usableUnifiedRam = Math.max(0, totalRamGb - 4.0) // 4GB reserved for macOS
  const kvAvailable = usableUnifiedRam - weightsGb

  if (kvAvailable >= 4.0) {
    const maxStreams = Math.max(1, Math.min(36, Math.floor(kvAvailable / kvPerUserGb)))
    return {
      status: 'fits',
      badge: 'Fits Unified Memory',
      color: 'emerald',
      title: 'Fits in Unified System Memory',
      description: `Host has ${totalRamGb.toFixed(1)} GB system RAM. Leaves ${kvAvailable.toFixed(1)} GB for KV cache, sustaining ~${maxStreams} concurrent generations.`,
      availableGb: totalRamGb,
      headroomGb: kvAvailable,
      maxConcurrentStreams: maxStreams,
    }
  } else if (kvAvailable >= 0) {
    const maxStreams = Math.max(1, Math.floor(kvAvailable / kvPerUserGb))
    return {
      status: 'tight',
      badge: 'Tight RAM Headroom',
      color: 'amber',
      title: 'Fits with limited OS headroom',
      description: `Host has ${totalRamGb.toFixed(1)} GB system RAM. Leaves ${kvAvailable.toFixed(1)} GB for KV cache (~${maxStreams} concurrent stream(s)).`,
      availableGb: totalRamGb,
      headroomGb: kvAvailable,
      maxConcurrentStreams: maxStreams,
    }
  } else {
    return {
      status: 'spill',
      badge: 'Exceeds System RAM',
      color: 'rose',
      title: 'Exceeds Total System Memory',
      description: `Host has ${totalRamGb.toFixed(1)} GB total RAM. Model requires ${totalVramGb.toFixed(1)} GB. Local execution will fail with Out of Memory (OOM).`,
      availableGb: totalRamGb,
      headroomGb: kvAvailable,
      maxConcurrentStreams: 0,
    }
  }
}
