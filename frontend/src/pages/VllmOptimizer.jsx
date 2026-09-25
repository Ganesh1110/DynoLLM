import React, { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  LineChart,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  Area,
  AreaChart,
} from 'recharts'
import {
  Sparkles,
  Zap,
  Cpu,
  Layers,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ArrowRight,
  TrendingUp,
  Activity,
  Server,
  FileText,
  ShieldCheck,
  Split,
  FastForward,
  RotateCcw,
  Search,
  Info,
  Maximize2,
  Database,
  BarChart3,
  ExternalLink,
  HelpCircle,
  Clock,
  Box,
  Terminal,
  Code2,
  DollarSign,
  Gauge,
  Key,
  Hash,
  Network,
  GitBranch,
  Lock,
  CheckSquare,
  XCircle,
  Scan,
  ListFilter,
  Wrench,
  Users,
} from 'lucide-react'
import { SectionHeader } from '../components/ui'
import { useMonitoringStore } from '../stores/monitoringStore'
import { useRuntimeStore } from '../stores/runtimeStore'
import { GPU_CATALOG, MODEL_PRESETS, parseModelName } from '../utils/gpuSizer'

// ==============================================================================
// 1. vLLM Version Registry & Compatibility Rules
// ==============================================================================
export const VLLM_VERSIONS = [
  {
    id: '0.8.x',
    name: 'vLLM 0.8.0+ (Modern / V1 Architecture - Current)',
    isV1Engine: true,
    recommended: true,
    supportedFlags: [
      'gpuMemoryUtilization',
      'maxModelLen',
      'blockSize',
      'maxNumSeqs',
      'maxNumBatchedTokens',
      'kvCacheDtype',
      'tensorParallelSize',
      'pipelineParallelSize',
      'enforceEager',
      'swapSpace',
      'cpuOffloadGb',
      'disableSlidingWindow',
      'disableLogStats',
      'enableSpeculative',
      'speculativeMode',
      'speculativeModel',
      'numSpeculativeTokens',
      'quantization',
      'trustRemoteCode',
      'distributedExecutorBackend',
      'servedModelName',
      'tokenizerMode',
      'loadFormat',
      'limitMmPerPrompt',
      'apiKey',
    ],
    // In current vLLM, the legacy V0 engine and its flags were completely stripped upstream.
    // Chunked prefill & prefix caching are native engine primitives.
    // Explicitly passing legacy flags throws NotImplementedError / unrecognized argument crashes!
    omitFromCli: ['enablePrefixCaching', 'enableChunkedPrefill', 'numSchedulerSteps', 'maxNumPartialPrefills', 'maxLongPartialPrefills'],
    notes:
      'Current upstream standard. The legacy V0 engine, legacy PagedAttention, and V0 attention backends were completely removed upstream in late 2025. Chunked prefill & zero-overhead prefix caching are native primitives. Passing legacy flags triggers NotImplementedError or unrecognized argument crashes. LoRA, speculative decoding, and structured outputs are fully supported.',
  },
  {
    id: '0.6.x_0.7.x',
    name: 'vLLM 0.6.0 - 0.7.x (Deprecated Upstream)',
    isV1Engine: false,
    recommended: false,
    supportedFlags: [
      'gpuMemoryUtilization',
      'maxModelLen',
      'blockSize',
      'maxNumSeqs',
      'maxNumBatchedTokens',
      'kvCacheDtype',
      'enablePrefixCaching',
      'enableChunkedPrefill',
      'numSchedulerSteps',
      'prefixCachingHashAlgo',
      'tensorParallelSize',
      'pipelineParallelSize',
      'enforceEager',
      'swapSpace',
      'cpuOffloadGb',
      'disableSlidingWindow',
      'disableLogStats',
      'enableSpeculative',
      'speculativeMode',
      'speculativeModel',
      'numSpeculativeTokens',
      'quantization',
      'trustRemoteCode',
      'distributedExecutorBackend',
      'servedModelName',
      'apiKey',
    ],
    notes:
      'Transitional release. The V0 engine supported in this branch has been completely removed in current upstream vLLM.',
  },
  {
    id: '0.4.x_0.5.x',
    name: 'vLLM 0.4.x - 0.5.x (Legacy / Removed Upstream)',
    isV1Engine: false,
    recommended: false,
    supportedFlags: [
      'gpuMemoryUtilization',
      'maxModelLen',
      'blockSize',
      'maxNumSeqs',
      'maxNumBatchedTokens',
      'kvCacheDtype',
      'enablePrefixCaching',
      'enableChunkedPrefill',
      'tensorParallelSize',
      'enforceEager',
      'swapSpace',
      'quantization',
      'trustRemoteCode',
      'apiKey',
    ],
    notes:
      'Legacy release. Prefix caching and chunked prefill were experimental.',
  },
  {
    id: '0.3.x',
    name: 'vLLM 0.3.x (Legacy / Removed Upstream)',
    isV1Engine: false,
    recommended: false,
    supportedFlags: [
      'gpuMemoryUtilization',
      'maxModelLen',
      'blockSize',
      'maxNumSeqs',
      'tensorParallelSize',
      'enforceEager',
      'quantization',
      'trustRemoteCode',
    ],
    unsupportedFlags: [
      'enablePrefixCaching',
      'enableChunkedPrefill',
      'kvCacheDtype',
      'enableSpeculative',
      'maxNumBatchedTokens',
      'cpuOffloadGb',
      'maxNumPartialPrefills',
    ],
    notes:
      'Legacy release. Does NOT support --enable-prefix-caching, --enable-chunked-prefill, --kv-cache-dtype fp8, or speculative decoding.',
  },
]

// ==============================================================================
// 2. GPU Architecture Helper (Ampere vs Ada/Hopper Hardware Acceleration)
// ==============================================================================
export function getGpuArchitecture(gpuName) {
  const n = (gpuName || '').toLowerCase()
  if (
    n.includes('h100') ||
    n.includes('h200') ||
    n.includes('b200') ||
    n.includes('blackwell') ||
    n.includes('hopper')
  ) {
    return {
      family: 'Hopper / Blackwell',
      sm: 'SM 9.0+',
      fp8Native: true,
      peakTflops: 989,
      hourlyCost: 3.25,
      fp8GemmSpeedup: '2.0x native FP8 Tensor Core GEMM',
      recommendedQuant: 'FP8 (W8A8)',
    }
  }
  if (
    n.includes('4090') ||
    n.includes('4080') ||
    n.includes('4070') ||
    n.includes('4060') ||
    n.includes('l40') ||
    n.includes('l4') ||
    n.includes('ada')
  ) {
    return {
      family: 'Ada Lovelace',
      sm: 'SM 8.9',
      fp8Native: true,
      peakTflops: n.includes('4090') ? 165 : 120,
      hourlyCost: n.includes('4090') ? 0.65 : 0.75,
      fp8GemmSpeedup: '1.9x native FP8 Tensor Core GEMM',
      recommendedQuant: 'FP8 (W8A8)',
    }
  }
  if (
    n.includes('a100') ||
    n.includes('a10g') ||
    n.includes('a40') ||
    n.includes('a10') ||
    n.includes('3090') ||
    n.includes('3080') ||
    n.includes('3060')
  ) {
    return {
      family: 'Ampere',
      sm: 'SM 8.0/8.6',
      fp8Native: false,
      peakTflops: n.includes('a100') ? 312 : 125,
      hourlyCost: n.includes('a100') ? 1.85 : 0.95,
      fp8GemmSpeedup: 'Weight-only Marlin fallback (No FP8 GEMM speedup)',
      recommendedQuant: 'INT4 AWQ / GPTQ (W4A16)',
    }
  }
  if (n.includes('t4') || n.includes('v100') || n.includes('turing')) {
    return {
      family: 'Turing / Volta',
      sm: 'SM 7.0/7.5',
      fp8Native: false,
      peakTflops: 65,
      hourlyCost: 0.35,
      fp8GemmSpeedup: 'No FP8 Support',
      recommendedQuant: 'INT4 GPTQ / AWQ',
    }
  }
  return {
    family: 'Generic Accelerator',
    sm: 'Unknown',
    fp8Native: false,
    peakTflops: 100,
    hourlyCost: 1.0,
    fp8GemmSpeedup: 'Standard FP16 Kernels',
    recommendedQuant: 'INT4 AWQ',
  }
}

// ==============================================================================
// 3. Global Model Catalog with Curated Architecture Metadata
// ==============================================================================
export const GLOBAL_MODEL_CATALOG = [
  {
    id: 'meta-llama/Llama-3.1-8B-Instruct',
    name: 'meta-llama/Llama-3.1-8B-Instruct',
    label: 'Llama 3.1 8B Instruct',
    family: 'Llama 3.1',
    creator: 'Meta AI',
    params: 8.03,
    hiddenSize: 4096,
    layers: 32,
    attentionHeads: 32,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '4:1 GQA',
    maxContext: 131072,
    recommendedContext: 8192,
    license: 'Llama 3.1 Community',
    capabilities: ['General Reasoning', 'Coding', '128K Context', 'Tool Use'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct/raw/main/config.json',
    coldStartSeconds: '~35s (FP16) / ~22s (FP8)',
  },
  {
    id: 'meta-llama/Llama-3.1-70B-Instruct',
    name: 'meta-llama/Llama-3.1-70B-Instruct',
    label: 'Llama 3.1 70B Instruct',
    family: 'Llama 3.1',
    creator: 'Meta AI',
    params: 70.6,
    hiddenSize: 8192,
    layers: 80,
    attentionHeads: 64,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '8:1 GQA',
    maxContext: 131072,
    recommendedContext: 8192,
    license: 'Llama 3.1 Community',
    capabilities: ['PhD-Level Reasoning', 'Complex Agents', 'Advanced Math'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct/raw/main/config.json',
    coldStartSeconds: '~180s (FP16) / ~110s (FP8)',
  },
  {
    id: 'meta-llama/Llama-3.2-3B-Instruct',
    name: 'meta-llama/Llama-3.2-3B-Instruct',
    label: 'Llama 3.2 3B Instruct',
    family: 'Llama 3.2',
    creator: 'Meta AI',
    params: 3.21,
    hiddenSize: 3072,
    layers: 28,
    attentionHeads: 24,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '3:1 GQA',
    maxContext: 131072,
    recommendedContext: 8192,
    license: 'Llama 3.2 Community',
    capabilities: ['Edge Inference', 'Sub-second Latency', 'Mobile/Local'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct/raw/main/config.json',
    coldStartSeconds: '~15s',
  },
  {
    id: 'meta-llama/Llama-3.2-1B-Instruct',
    name: 'meta-llama/Llama-3.2-1B-Instruct',
    label: 'Llama 3.2 1B Instruct (Ideal Speculative Draft)',
    family: 'Llama 3.2',
    creator: 'Meta AI',
    params: 1.23,
    hiddenSize: 2048,
    layers: 16,
    attentionHeads: 32,
    kvHeads: 8,
    headDim: 64,
    gqaRatio: '4:1 GQA',
    maxContext: 131072,
    recommendedContext: 8192,
    license: 'Llama 3.2 Community',
    capabilities: ['Speculative Draft Model', 'Ultra Lightweight', 'Edge Serving'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/raw/main/config.json',
    coldStartSeconds: '~8s',
  },
  {
    id: 'Qwen/Qwen2.5-7B-Instruct',
    name: 'Qwen/Qwen2.5-7B-Instruct',
    label: 'Qwen 2.5 7B Instruct',
    family: 'Qwen 2.5',
    creator: 'Alibaba Cloud',
    params: 7.61,
    hiddenSize: 3584,
    layers: 28,
    attentionHeads: 28,
    kvHeads: 4,
    headDim: 128,
    gqaRatio: '7:1 GQA',
    maxContext: 131072,
    recommendedContext: 8192,
    license: 'Apache 2.0',
    capabilities: ['Coding', 'Math', 'Multilingual (29+ Languages)'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/raw/main/config.json',
    coldStartSeconds: '~30s',
  },
  {
    id: 'Qwen/Qwen2.5-14B-Instruct',
    name: 'Qwen/Qwen2.5-14B-Instruct',
    label: 'Qwen 2.5 14B Instruct',
    family: 'Qwen 2.5',
    creator: 'Alibaba Cloud',
    params: 14.7,
    hiddenSize: 5120,
    layers: 48,
    attentionHeads: 40,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '5:1 GQA',
    maxContext: 131072,
    recommendedContext: 8192,
    license: 'Apache 2.0',
    capabilities: ['Near 70B Coding Score', 'Complex Math', 'Function Calling'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/Qwen/Qwen2.5-14B-Instruct/raw/main/config.json',
    coldStartSeconds: '~65s (FP16) / ~48s (FP8)',
  },
  {
    id: 'Qwen/Qwen2.5-32B-Instruct',
    name: 'Qwen/Qwen2.5-32B-Instruct',
    label: 'Qwen 2.5 32B Instruct',
    family: 'Qwen 2.5',
    creator: 'Alibaba Cloud',
    params: 32.5,
    hiddenSize: 5120,
    layers: 64,
    attentionHeads: 40,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '5:1 GQA',
    maxContext: 131072,
    recommendedContext: 8192,
    license: 'Apache 2.0',
    capabilities: ['Matches 70B Models', 'Deep Math', 'Advanced Code'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/Qwen/Qwen2.5-32B-Instruct/raw/main/config.json',
    coldStartSeconds: '~110s',
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen/Qwen2.5-72B-Instruct',
    label: 'Qwen 2.5 72B Instruct',
    family: 'Qwen 2.5',
    creator: 'Alibaba Cloud',
    params: 72.7,
    hiddenSize: 8192,
    layers: 80,
    attentionHeads: 64,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '8:1 GQA',
    maxContext: 131072,
    recommendedContext: 8192,
    license: 'Apache 2.0',
    capabilities: ['Flagship Open Weights', 'Enterprise Grade'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/Qwen/Qwen2.5-72B-Instruct/raw/main/config.json',
    coldStartSeconds: '~210s',
  },
  {
    id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
    name: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
    label: 'DeepSeek R1 Distill Qwen 14B',
    family: 'DeepSeek R1',
    creator: 'DeepSeek',
    params: 14.7,
    hiddenSize: 5120,
    layers: 48,
    attentionHeads: 40,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '5:1 GQA',
    maxContext: 131072,
    recommendedContext: 16384,
    license: 'MIT',
    capabilities: ['Chain-of-Thought Reasoning', 'Math & Code Proofs'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-14B/raw/main/config.json',
    coldStartSeconds: '~65s',
  },
  {
    id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    name: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    label: 'DeepSeek R1 Distill Qwen 32B',
    family: 'DeepSeek R1',
    creator: 'DeepSeek',
    params: 32.5,
    hiddenSize: 5120,
    layers: 64,
    attentionHeads: 40,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '5:1 GQA',
    maxContext: 131072,
    recommendedContext: 16384,
    license: 'MIT',
    capabilities: ['Elite Reasoning', 'Exceeds o1-mini in Math'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B/raw/main/config.json',
    coldStartSeconds: '~115s',
  },
  {
    id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
    name: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
    label: 'DeepSeek R1 Distill Llama 70B',
    family: 'DeepSeek R1',
    creator: 'DeepSeek',
    params: 70.6,
    hiddenSize: 8192,
    layers: 80,
    attentionHeads: 64,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '8:1 GQA',
    maxContext: 131072,
    recommendedContext: 16384,
    license: 'Llama 3.1 Community',
    capabilities: ['Flagship Open Reasoning', 'PhD-Level Reasoning'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Llama-70B/raw/main/config.json',
    coldStartSeconds: '~195s',
  },
  {
    id: 'mistralai/Mistral-7B-Instruct-v0.3',
    name: 'mistralai/Mistral-7B-Instruct-v0.3',
    label: 'Mistral 7B Instruct v0.3',
    family: 'Mistral',
    creator: 'Mistral AI',
    params: 7.25,
    hiddenSize: 4096,
    layers: 32,
    attentionHeads: 32,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '4:1 GQA',
    maxContext: 32768,
    recommendedContext: 8192,
    license: 'Apache 2.0',
    capabilities: ['Fast Chat', 'Function Calling', 'Sliding Window Attention'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified Sept 2024)',
    hfConfigUrl: 'https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3/raw/main/config.json',
    coldStartSeconds: '~36s',
  },
  {
    id: 'Qwen/Qwen2-VL-7B-Instruct',
    name: 'Qwen/Qwen2-VL-7B-Instruct',
    label: 'Qwen2-VL 7B Instruct (Vision Language Model)',
    family: 'Qwen2-VL',
    creator: 'Alibaba Cloud',
    params: 7.61,
    hiddenSize: 3584,
    layers: 28,
    attentionHeads: 28,
    kvHeads: 4,
    headDim: 128,
    gqaRatio: '7:1 GQA',
    maxContext: 32768,
    recommendedContext: 8192,
    license: 'Apache 2.0',
    capabilities: ['Vision Understanding', 'OCR & Document Parsing', 'Video Analysis'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified 2025)',
    hfConfigUrl: 'https://huggingface.co/Qwen/Qwen2-VL-7B-Instruct/raw/main/config.json',
    coldStartSeconds: '~42s',
    isMultimodal: true,
    visionTokensPerImage: 1280,
  },
  {
    id: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
    name: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
    label: 'Llama 3.2 11B Vision Instruct',
    family: 'Llama 3.2 Vision',
    creator: 'Meta AI',
    params: 10.6,
    hiddenSize: 4096,
    layers: 32,
    attentionHeads: 32,
    kvHeads: 8,
    headDim: 128,
    gqaRatio: '4:1 GQA',
    maxContext: 131072,
    recommendedContext: 8192,
    license: 'Llama 3.2 Community',
    capabilities: ['High-Res Image Reasoning', 'Visual QA', 'Multimodal Agents'],
    precision: 0.55,
    dataSource: 'Curated HF Registry (Verified 2025)',
    hfConfigUrl: 'https://huggingface.co/meta-llama/Llama-3.2-11B-Vision-Instruct/raw/main/config.json',
    coldStartSeconds: '~55s',
    isMultimodal: true,
    visionTokensPerImage: 1600,
  },
]

// ==============================================================================
// 4. Quantization Recipes Matrix (Expanded with Marlin, GPTQ, GGUF, Compressed)
// ==============================================================================
export const QUANTIZATION_RECIPES = [
  {
    id: 'fp16',
    name: 'Uncompressed (FP16 / BF16)',
    bytesPerParam: 2.0,
    bits: 16,
    accuracyRetention: '100% (Baseline)',
    accuracyScore: 100,
    speedMultiplier: 1.0,
    kernel: 'Native FlashAttention-2',
    description: 'Full unquantized baseline. Maximum precision, highest VRAM requirement.',
    vllmArg: '',
    recipeCode: null,
  },
  {
    id: 'fp8',
    name: 'FP8 Dynamic (W8A8) — Native on Hopper/Ada',
    bytesPerParam: 1.0,
    bits: 8,
    accuracyRetention: '~99.4% of FP16',
    accuracyScore: 99.4,
    speedMultiplier: 1.95,
    kernel: 'FP8 Tensor Cores (Cutlass / FlashInfer)',
    description: 'Dynamic 8-bit floating point. Doubles throughput on Hopper (H100) and Ada Lovelace (RTX 4090, L4). On Ampere (A100/A10G), falls back to weight-only Marlin with zero compute acceleration.',
    vllmArg: '--quantization fp8',
    recipeCode: `# LLM Compressor: FP8 Calibration Recipe\nfrom llmcompressor.transformers import SparseAutoModelForCausalLM, oneshot\nfrom datasets import load_dataset\n\nmodel_id = "MODEL_ID"\nmodel = SparseAutoModelForCausalLM.from_pretrained(model_id, device_map="auto")\ndataset = load_dataset("neuralmagic/LLM_compression_calibration", split="train")\n\nrecipe = """\nquant_stage:\n  quant_modifiers:\n    QuantizationModifier:\n      weights:\n        num_bits: 8\n        type: float\n        strategy: tensor\n      input_activations:\n        num_bits: 8\n        type: float\n        strategy: token\n"""\noneshot(model=model, dataset=dataset, recipe=recipe, output_dir="./optimized-fp8")`,
  },
  {
    id: 'int4_awq',
    name: 'INT4 AWQ (Activation-aware Weight Quantization)',
    bytesPerParam: 0.55,
    bits: 4,
    accuracyRetention: '~98.5% of FP16',
    accuracyScore: 98.5,
    speedMultiplier: 2.65,
    kernel: 'AWQ Marlin Tensor Core Kernel',
    description: 'Protects the top 1% salient activation outliers. Exceptional reasoning retention on math and coding benchmarks. Works efficiently across all NVIDIA generations (Ampere, Ada, Hopper).',
    vllmArg: '--quantization awq',
    recipeCode: `# LLM Compressor: AWQ Recipe\nfrom llmcompressor.transformers import SparseAutoModelForCausalLM, oneshot\nfrom datasets import load_dataset\n\nmodel_id = "MODEL_ID"\nmodel = SparseAutoModelForCausalLM.from_pretrained(model_id, device_map="auto")\ndataset = load_dataset("neuralmagic/LLM_compression_calibration", split="train")\n\nrecipe = """\nquant_stage:\n  quant_modifiers:\n    AWQModifier:\n      targets: ["Linear"]\n      scheme: "W4A16"\n      group_size: 128\n"""\noneshot(model=model, dataset=dataset, recipe=recipe, output_dir="./optimized-awq")`,
  },
  {
    id: 'int4_gptq',
    name: 'INT4 GPTQ (W4A16 + Marlin Kernel)',
    bytesPerParam: 0.55,
    bits: 4,
    accuracyRetention: '~97.8% of FP16',
    accuracyScore: 97.8,
    speedMultiplier: 2.75,
    kernel: 'Marlin 4-bit High-Throughput Kernel',
    description: 'Second-order weight quantization using inverse Hessian compensation. Blazing memory-bandwidth bound decode speed on Ampere and Ada.',
    vllmArg: '--quantization gptq',
    recipeCode: `# LLM Compressor: GPTQ 4-Bit Marlin Recipe\nfrom llmcompressor.transformers import SparseAutoModelForCausalLM, oneshot\nfrom datasets import load_dataset\n\nmodel_id = "MODEL_ID"\nmodel = SparseAutoModelForCausalLM.from_pretrained(model_id, device_map="auto")\ndataset = load_dataset("neuralmagic/LLM_compression_calibration", split="train")\n\nrecipe = """\nquant_stage:\n  quant_modifiers:\n    GPTQModifier:\n      sequential_targets: ["LlamaDecoderLayer"]\n      targets: ["Linear"]\n      scheme: "W4A16"\n      group_size: 128\n      dampening_frac: 0.01\n"""\noneshot(model=model, dataset=dataset, recipe=recipe, output_dir="./optimized-gptq-marlin")`,
  },
  {
    id: 'compressed_tensors',
    name: 'Compressed-Tensors (Marlin W8A8 / W4A16)',
    bytesPerParam: 0.95,
    bits: 8,
    accuracyRetention: '~99.1% of FP16',
    accuracyScore: 99.1,
    speedMultiplier: 1.85,
    kernel: 'Neural Magic Marlin / Cutlass Kernel',
    description: 'Modern standard for vLLM & LLM Compressor models. Native support for mixed precision and calibration scales.',
    vllmArg: '--quantization compressed-tensors',
    recipeCode: null,
  },
  {
    id: 'gguf',
    name: 'GGUF (Q4_K_M Weight Format)',
    bytesPerParam: 0.58,
    bits: 4,
    accuracyRetention: '~96.5% of FP16',
    accuracyScore: 96.5,
    speedMultiplier: 2.1,
    kernel: 'vLLM GGUF Loader & Kernel',
    description: 'Llama.cpp format supported by vLLM. Great for hybrid CPU/GPU setups or testing consumer hardware.',
    vllmArg: '--load-format gguf',
    recipeCode: null,
  },
]

// Default Comprehensive vLLM Flags
const DEFAULT_VLLM_FLAGS = {
  gpuMemoryUtilization: 0.90,
  maxModelLen: 4096,
  blockSize: 16,
  maxNumSeqs: 256,
  maxNumBatchedTokens: 2048,
  kvCacheDtype: 'auto',
  swapSpace: 4,
  cpuOffloadGb: 0,
  maxNumPartialPrefills: 1,
  maxLongPartialPrefills: 1,
  disableSlidingWindow: false,
  enablePrefixCaching: true,
  enableChunkedPrefill: true,
  numSchedulerSteps: 1,
  prefixCachingHashAlgo: 'sha256',
  disableLogStats: false,
  tensorParallelSize: 1,
  pipelineParallelSize: 1,
  distributedExecutorBackend: 'mp', // 'mp' | 'ray'
  enforceEager: false,
  disableCustomAllReduce: false,
  enableSpeculative: false,
  speculativeMode: 'draft_model', // 'draft_model' | 'ngram' | 'eagle'
  speculativeModel: 'meta-llama/Llama-3.2-1B-Instruct',
  numSpeculativeTokens: 5,
  quantization: 'none',
  trustRemoteCode: true,
  servedModelName: '',
  tokenizerMode: 'auto',
  loadFormat: 'auto',
  limitMmPerPrompt: 'image=2',
  imagesPerPrompt: 1,
  apiKey: 'dyno-prod-key-99',
  // LoRA Multi-Adapter Serving
  enableLora: false,
  maxLoras: 4,
  maxLoraRank: 32,
  loraModules: '',
  // Structured Outputs & Tool Calling
  guidedDecodingBackend: 'xgrammar', // 'xgrammar' | 'outlines' | 'lm-format-enforcer'
  toolCallParser: 'llama3_json', // 'llama3_json' | 'mistral' | 'hermes' | 'pythonic' | 'none'
  enableAutoToolChoice: true,
}

export function VllmOptimizer() {
  const currentTelemetry = useMonitoringStore((s) => s.current)
  const runtimes = useRuntimeStore((s) => s.runtimes)
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes)
  const fetchModels = useRuntimeStore((s) => s.fetchModels)

  // 1. vLLM Version Awareness State
  const [selectedVllmVersion, setSelectedVllmVersion] = useState(VLLM_VERSIONS[0])

  // 2. Global Model Search & State
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState(GLOBAL_MODEL_CATALOG[0])
  const [isSearching, setIsSearching] = useState(false)
  const [connectedModels, setConnectedModels] = useState([])

  // 3. Hardware and Scaling Mode
  const [targetGpu, setTargetGpu] = useState(
    GPU_CATALOG.find((g) => g.vramGb === 24) || GPU_CATALOG[3]
  )
  const [selectedRecipe, setSelectedRecipe] = useState(QUANTIZATION_RECIPES[1]) // FP8 default
  const [concurrency, setConcurrency] = useState(10)
  const [scalingMode, setScalingMode] = useState('tp') // 'tp' | 'replicas'
  const [replicaCount, setReplicaCount] = useState(1)
  const [customHourlyCost, setCustomHourlyCost] = useState(null)

  // 4. User Customizable Engine Flags State
  const [flags, setFlags] = useState({ ...DEFAULT_VLLM_FLAGS })

  // 5. Active Visualization Chart Tab
  const [activeChartTab, setActiveChartTab] = useState('throughput') // 'throughput' | 'quant' | 'context' | 'tp_scaling' | 'roofline' | 'cost'

  // 6. Output / Code Export Tab
  const [exportTab, setExportTab] = useState('cli') // 'cli' | 'help' | 'env' | 'docker' | 'validator' | 'ray'
  const [copiedCli, setCopiedCli] = useState(false)
  const [copiedHelp, setCopiedHelp] = useState(false)
  const [copiedEnv, setCopiedEnv] = useState(false)
  const [copiedDocker, setCopiedDocker] = useState(false)
  const [copiedRay, setCopiedRay] = useState(false)

  // 7. Real Startup Log Validation State
  const [startupLogText, setStartupLogText] = useState('')
  const [parsedLogResult, setParsedLogResult] = useState(null)

  // 8. Live Binary Help Output Parser & Source-of-Truth Diff State
  const [helpInputText, setHelpInputText] = useState('')
  const [binaryDiffResult, setBinaryDiffResult] = useState(null)

  // 9. Model & GPU Matchmaker SLA State
  const [matchmakerGoal, setMatchmakerGoal] = useState('value') // 'value' | 'latency' | 'throughput'
  const [matchmakerSlaConcurrency, setMatchmakerSlaConcurrency] = useState(10)

  const analyzeHelpOutput = (overrideText = null) => {
    const text = overrideText ?? helpInputText
    if (!text.trim()) return
    // Match standard flags and BooleanOptionalAction flags like --[no-]enable-prefix-caching
    const rawMatches = text.match(/--\[?no-\]?[a-zA-Z0-9_-]+/g) || []
    const uniqueFlags = new Set()
    rawMatches.forEach((f) => {
      const lower = f.toLowerCase()
      if (lower.includes('[no-]')) {
        uniqueFlags.add(lower.replace('[no-]', ''))
        uniqueFlags.add(lower.replace('[no-]', 'no-'))
      } else {
        uniqueFlags.add(lower)
      }
    })

    const verMatch = text.match(/vllm(?:\s+version|\s+v|\s+)?\s*([0-9]+\.[0-9]+(?:\.[0-9a-z.-]+)?)/i)

    const cmdMatches = generatedVllmCommand.match(/--[a-zA-Z0-9_-]+/g) || []
    const uniqueActive = Array.from(new Set(cmdMatches.map((f) => f.toLowerCase())))

    const verified = []
    const missing = []

    uniqueActive.forEach((flag) => {
      if (uniqueFlags.has(flag)) {
        verified.push(flag)
      } else {
        missing.push(flag)
      }
    })

    setBinaryDiffResult({
      totalDetected: uniqueFlags.size,
      detectedVersion: verMatch ? verMatch[1] : null,
      verified,
      missing,
      rawFlagSet: uniqueFlags,
    })
  }

  const pruneUnsupportedFlags = () => {
    if (!binaryDiffResult || !binaryDiffResult.missing.length) return
    const missing = new Set(binaryDiffResult.missing)

    setFlags((prev) => {
      const updated = { ...prev }
      if (missing.has('--cpu-offload-gb')) updated.cpuOffloadGb = 0
      if (missing.has('--pipeline-parallel-size')) updated.pipelineParallelSize = 1
      if (missing.has('--disable-sliding-window')) updated.disableSlidingWindow = false
      if (missing.has('--disable-log-stats')) updated.disableLogStats = false
      if (missing.has('--speculative-model')) updated.enableSpeculative = false
      if (missing.has('--api-key')) updated.apiKey = ''
      if (missing.has('--served-model-name')) updated.servedModelName = ''
      if (missing.has('--num-scheduler-steps')) updated.numSchedulerSteps = 1
      if (missing.has('--kv-cache-dtype')) updated.kvCacheDtype = 'auto'
      if (missing.has('--swap-space')) updated.swapSpace = 4
      return updated
    })

    setTimeout(() => {
      analyzeHelpOutput()
    }, 150)
  }

  // Fetch local connected models on mount
  useEffect(() => {
    fetchRuntimes().then(async () => {
      const all = []
      for (const rt of runtimes) {
        try {
          const models = await fetchModels(rt.id)
          if (models) {
            models.forEach((m) =>
              all.push({
                id: m.name,
                name: m.name,
                label: `${m.name} (${rt.name})`,
                family: 'Local Connected',
                creator: rt.name,
                params: parseModelName(m.name).params || 8,
                hiddenSize: 4096,
                layers: parseModelName(m.name).layers || 32,
                attentionHeads: 32,
                kvHeads: parseModelName(m.name).kvHeads || 8,
                headDim: parseModelName(m.name).headDim || 128,
                gqaRatio: 'GQA',
                maxContext: 32768,
                recommendedContext: 4096,
                license: 'Local',
                capabilities: ['Connected Runtime'],
                precision: parseModelName(m.name).precision || 0.55,
                dataSource: `Local Runtime (${rt.name})`,
                hfConfigUrl: null,
                coldStartSeconds: '~30s',
              })
            )
          }
        } catch (e) {
          // ignore
        }
      }
      setConnectedModels(all)
    })
  }, [runtimes.length])

  // Filter global catalog based on search
  const filteredCatalog = useMemo(() => {
    const combined = [...connectedModels, ...GLOBAL_MODEL_CATALOG]
    if (!modelSearchQuery.trim()) return combined
    const q = modelSearchQuery.toLowerCase().trim()
    return combined.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        m.family.toLowerCase().includes(q) ||
        m.creator.toLowerCase().includes(q)
    )
  }, [modelSearchQuery, connectedModels])

  // Handle model select
  const handleSelectModel = (model) => {
    setSelectedModel(model)
    setModelSearchQuery(model.name)
    setIsSearching(false)
    if (model.recommendedContext) {
      setFlags((prev) => ({
        ...prev,
        maxModelLen: Math.min(prev.maxModelLen, model.maxContext),
      }))
    }
  }

  // Handle custom typed model string
  const handleCustomModelSubmit = () => {
    if (!modelSearchQuery.trim()) return
    const parsed = parseModelName(modelSearchQuery)
    const customModel = {
      id: modelSearchQuery,
      name: modelSearchQuery,
      label: modelSearchQuery,
      family: 'Custom Auto-Detected',
      creator: 'Hugging Face / User',
      params: parsed.params,
      hiddenSize: parsed.params >= 30 ? 5120 : 4096,
      layers: parsed.layers || 32,
      attentionHeads: 32,
      kvHeads: parsed.kvHeads || 8,
      headDim: parsed.headDim || 128,
      gqaRatio: `${Math.round(32 / (parsed.kvHeads || 8))}:1 GQA`,
      maxContext: 32768,
      recommendedContext: 4096,
      license: 'Unknown',
      capabilities: ['Auto-Detected Architecture'],
      precision: parsed.precision,
      dataSource: 'Heuristic Estimation (Unverified - Verify via HF config.json)',
      hfConfigUrl: `https://huggingface.co/${modelSearchQuery}/raw/main/config.json`,
      coldStartSeconds: '~45s',
    }
    setSelectedModel(customModel)
    setIsSearching(false)
  }

  // Helper to update individual flag value
  const updateFlag = (key, value) => {
    setFlags((prev) => ({ ...prev, [key]: value }))
  }

  // Reset flags to recommended best-practice values
  const resetToRecommended = () => {
    setFlags({
      ...DEFAULT_VLLM_FLAGS,
      maxModelLen: selectedModel.recommendedContext || 4096,
      quantization:
        selectedRecipe.id === 'fp8'
          ? 'fp8'
          : selectedRecipe.id.includes('gptq')
          ? 'gptq'
          : selectedRecipe.id.includes('awq')
          ? 'awq'
          : 'none',
      tensorParallelSize: targetGpu.vramGb < 20 && selectedModel.params >= 14 ? 2 : 1,
    })
  }

  // GPU Architecture Detection
  const gpuArch = useMemo(() => getGpuArchitecture(targetGpu.name), [targetGpu])

  // Hourly cost calculation
  const effectiveGpuHourlyCost = customHourlyCost ?? gpuArch.hourlyCost

  // Guardrail: Validate Tensor Parallelism vs Attention Heads
  const tpValidation = useMemo(() => {
    const tp = flags.tensorParallelSize
    if (tp <= 1) return { isValid: true }
    const qHeads = selectedModel.attentionHeads || 32
    const kvHeads = selectedModel.kvHeads || 8

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
  }, [flags.tensorParallelSize, selectedModel])

  // Is flag supported by current vLLM version?
  const isFlagSupported = (flagKey) => {
    if (selectedVllmVersion.unsupportedFlags?.includes(flagKey)) return false
    return true
  }

  // ==========================================
  // MATHEMATICAL & VRAM CAPACITY MODELING
  // ==========================================
  const params = selectedModel.params
  const layers = selectedModel.layers
  const kvHeads = selectedModel.kvHeads
  const headDim = selectedModel.headDim
  const contextLength = flags.maxModelLen

  // 1. Model Weights Footprint
  const rawWeightsGb = params * selectedRecipe.bytesPerParam
  // Weight offloading to CPU RAM
  const weightsGb = Math.max(0.5, rawWeightsGb - (flags.cpuOffloadGb || 0))

  const baselineFp16Gb = params * 2.0
  const vramSavingsPct = Math.round(((baselineFp16Gb - weightsGb) / baselineFp16Gb) * 100)

  // 2. Multimodal Vision Token Budgeting & Dynamic KV Cache calculation
  const visionTokens = selectedModel.isMultimodal
    ? (selectedModel.visionTokensPerImage || 1280) * (flags.imagesPerPrompt || 1)
    : 0
  const totalEffectiveContextLength = contextLength + visionTokens

  const bytesPerKvToken = flags.kvCacheDtype.startsWith('fp8') ? 1 : 2
  const bytesPerTokenAllLayers = 2 * layers * kvHeads * headDim * bytesPerKvToken
  const kvPerUserBytes = bytesPerTokenAllLayers * totalEffectiveContextLength
  const kvPerUserMb = kvPerUserBytes / (1024 * 1024)
  const kvPerUserGb = kvPerUserMb / 1024
  const totalKvNeededGb = kvPerUserGb * concurrency

  // 3. Runtime & Overhead Buffers (LoRA + Speculative Decoding + CUDA Scratch)
  const draftModelVramGb = useMemo(() => {
    if (!flags.enableSpeculative) return 0
    if (flags.speculativeMode === 'ngram') return 0 // 0 extra VRAM!
    if (flags.speculativeMode === 'eagle') return 0.45 // minimal head weights
    return 2.2 // Draft model ~1B params in FP16/BF16
  }, [flags.enableSpeculative, flags.speculativeMode])

  // LoRA Multi-Adapter Memory Buffer
  const loraBufferGb = flags.enableLora
    ? Number(((flags.maxLoras || 4) * (flags.maxLoraRank || 32) * 0.007 + 0.35).toFixed(2))
    : 0

  const runtimeOverheadGb = 1.35 + draftModelVramGb + loraBufferGb

  // Effective GPU resources depends on scaling mode
  const effectiveGpuVram =
    scalingMode === 'tp'
      ? targetGpu.vramGb * flags.tensorParallelSize
      : targetGpu.vramGb

  const availableEngineBudgetGb = effectiveGpuVram * flags.gpuMemoryUtilization
  const totalUsedVramGb = weightsGb + totalKvNeededGb + runtimeOverheadGb
  const freeVramHeadroomGb = Math.max(0, availableEngineBudgetGb - totalUsedVramGb)
  const isVramExceeded = totalUsedVramGb > availableEngineBudgetGb

  // 4. Concurrency Saturation Knee Point (Empirically Calibrated)
  const maxSafeConcurrency = useMemo(() => {
    const usableVramForKv = availableEngineBudgetGb - weightsGb - runtimeOverheadGb
    if (usableVramForKv <= 0 || kvPerUserGb <= 0) return 0
    const perInstance = Math.floor(usableVramForKv / kvPerUserGb)
    return scalingMode === 'replicas' ? perInstance * replicaCount : perInstance
  }, [availableEngineBudgetGb, weightsGb, runtimeOverheadGb, kvPerUserGb, scalingMode, replicaCount])

  // 5. Single-User Decode Speed (Empirically Calibrated Against Published vLLM Benchmarks)
  // Calibrated baseline: Llama-3.1-8B on A10G ~34 tok/s (FP16), ~72 tok/s (AWQ); H100 ~210 tok/s (FP8)
  const estimatedDecodeTps = useMemo(() => {
    if (!targetGpu || weightsGb <= 0) return 30
    const rawBandwidth = targetGpu.bandwidthGbps * (scalingMode === 'tp' ? flags.tensorParallelSize : 1)

    let memBusEfficiency = 0.65
    if (gpuArch.family.includes('Hopper')) memBusEfficiency = 0.80
    else if (gpuArch.family.includes('Ada')) memBusEfficiency = 0.70
    else if (targetGpu.name.toLowerCase().includes('a100')) memBusEfficiency = 0.74

    let quantSpeedFactor = 1.0
    if (selectedRecipe.id === 'fp8') {
      quantSpeedFactor = gpuArch.fp8Native ? 1.85 : 1.05
    } else if (selectedRecipe.id === 'int4_awq') {
      quantSpeedFactor = 2.45
    } else if (selectedRecipe.id === 'int4_gptq') {
      quantSpeedFactor = 2.55
    } else if (selectedRecipe.id === 'compressed_tensors') {
      quantSpeedFactor = 1.85
    } else if (selectedRecipe.id === 'gguf') {
      quantSpeedFactor = 1.95
    }

    let specFactor = 1.0
    if (flags.enableSpeculative) {
      if (flags.speculativeMode === 'ngram') specFactor = 1.45
      else if (flags.speculativeMode === 'eagle') specFactor = 1.75
      else specFactor = 1.60
    }

    const tpOverhead = flags.tensorParallelSize > 1 ? 1 - 0.06 * Math.log2(flags.tensorParallelSize) : 1.0
    const rawToks = (rawBandwidth * memBusEfficiency * 1.4) / Math.max(weightsGb, 0.5)
    const calibratedSpeed = rawToks * quantSpeedFactor * 0.42 * specFactor * tpOverhead

    const maxCeiling = targetGpu.maxComputeTps * (scalingMode === 'tp' ? flags.tensorParallelSize : 1) || 600
    return Math.min(Math.max(12, Math.round(calibratedSpeed)), maxCeiling)
  }, [targetGpu, weightsGb, flags.tensorParallelSize, flags.enableSpeculative, flags.speculativeMode, selectedRecipe, gpuArch, scalingMode])

  // 6. Time-To-First-Token (Empirical Prefill Compute + Kernel Overhead)
  const estimatedTtftMs = useMemo(() => {
    if (flags.enablePrefixCaching) return 14 // Cache hit
    const promptLen = Math.min(contextLength, 2048)
    const peakTflops = gpuArch.peakTflops * (scalingMode === 'tp' ? flags.tensorParallelSize : 1)
    const prefillComputeMs = ((2 * params * 1e9 * promptLen) / (peakTflops * 1e12 * 0.45)) * 1000
    const kernelOverheadMs = targetGpu.name.toLowerCase().includes('h100') ? 8 : 16
    return Math.max(14, Math.round(prefillComputeMs + kernelOverheadMs))
  }, [flags.enablePrefixCaching, contextLength, params, gpuArch, targetGpu, scalingMode, flags.tensorParallelSize])

  // ==========================================
  // CHART 1: QUANTIZATION TRADE-OFF SCATTER DATA
  // ==========================================
  const quantScatterData = useMemo(() => {
    const baseTps = Math.max(25, (targetGpu.bandwidthGbps / Math.max(baselineFp16Gb, 1.0)) * 0.45)
    return QUANTIZATION_RECIPES.map((r) => {
      let speedFactor = r.speedMultiplier
      let isHwAccelerated = true

      if (r.id === 'fp8') {
        if (!gpuArch.fp8Native) {
          speedFactor = 1.05 // Ampere lacks FP8 tensor cores
          isHwAccelerated = false
        }
      } else if (r.id === 'gguf') {
        isHwAccelerated = false // CPU/hybrid format
      }

      const speed = Math.round(baseTps * speedFactor * (scalingMode === 'tp' ? flags.tensorParallelSize : 1))
      return {
        id: r.id,
        name: r.name.split(' (')[0],
        fullName: r.name,
        speed,
        quality: r.accuracyScore,
        bytes: r.bytesPerParam,
        isHwAccelerated,
        isSelected: selectedRecipe.id === r.id,
      }
    })
  }, [targetGpu, baselineFp16Gb, gpuArch, flags.tensorParallelSize, scalingMode, selectedRecipe])

  // ==========================================
  // CHART 2: CONTEXT LENGTH VS CONCURRENCY CURVE
  // ==========================================
  const contextCurveData = useMemo(() => {
    const sampleContexts = [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072].filter(
      (c) => c <= (selectedModel.maxContext || 131072)
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
        isCurrent: Math.abs(ctx - flags.maxModelLen) < 1024,
      }
    })
  }, [selectedModel, availableEngineBudgetGb, weightsGb, runtimeOverheadGb, layers, kvHeads, headDim, bytesPerKvToken, scalingMode, replicaCount, flags.maxModelLen])

  // ==========================================
  // CHART 3: TP SCALING EFFICIENCY VS REPLICAS
  // ==========================================
  const tpScalingData = useMemo(() => {
    const gpuCounts = [1, 2, 4, 8]
    const baseThroughput = estimatedDecodeTps * Math.min(concurrency, 16)

    return gpuCounts.map((g) => {
      const idealTp = baseThroughput * g
      // All-Reduce communication penalty over NVLink/PCIe
      const allReduceEfficiency = g === 1 ? 1.0 : g === 2 ? 0.94 : g === 4 ? 0.86 : 0.76
      const realTp = Math.round(idealTp * allReduceEfficiency)
      // Horizontal Replicas have virtually zero communication penalty
      const replicasThroughput = Math.round(baseThroughput * g * 0.98)

      return {
        gpuCount: `${g} GPU${g > 1 ? 's' : ''}`,
        gpus: g,
        idealTp,
        realTp,
        replicasThroughput,
      }
    })
  }, [estimatedDecodeTps, concurrency])

  // ==========================================
  // CHART 4: INTERACTIVE ROOFLINE MODEL DATA
  // ==========================================
  const rooflineData = useMemo(() => {
    const bwGbps = targetGpu.bandwidthGbps * (scalingMode === 'tp' ? flags.tensorParallelSize : 1)
    const peakTflops = gpuArch.peakTflops * (scalingMode === 'tp' ? flags.tensorParallelSize : 1)
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
  }, [targetGpu, flags.tensorParallelSize, gpuArch, scalingMode, concurrency])

  // ==========================================
  // CHART 5: CONCURRENCY VS COST PER 1M TOKENS
  // ==========================================
  const costCurveData = useMemo(() => {
    const steps = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64]
    const effectiveCostPerHour =
      effectiveGpuHourlyCost * (scalingMode === 'tp' ? flags.tensorParallelSize : replicaCount)

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
  }, [effectiveGpuHourlyCost, scalingMode, flags.tensorParallelSize, replicaCount, maxSafeConcurrency, estimatedDecodeTps])

  // ==========================================
  // CHART 0: THROUGHPUT & LATENCY COMPOSED DATA
  // ==========================================
  const concurrencyChartData = useMemo(() => {
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
  }, [maxSafeConcurrency, estimatedDecodeTps, estimatedTtftMs, scalingMode, replicaCount])

  // VRAM Breakdown Chart Data
  const vramBreakdownData = useMemo(() => {
    return [
      {
        name: 'VRAM Usage',
        Weights: Number(weightsGb.toFixed(1)),
        KVCache: Number(totalKvNeededGb.toFixed(1)),
        Overhead: Number(runtimeOverheadGb.toFixed(1)),
        FreeHeadroom: Number(freeVramHeadroomGb.toFixed(1)),
      },
    ]
  }, [weightsGb, totalKvNeededGb, runtimeOverheadGb, freeVramHeadroomGb])

  // ==========================================
  // REAL STARTUP LOG PARSER
  // ==========================================
  const parseStartupLog = () => {
    if (!startupLogText.trim()) return
    const text = startupLogText

    const gpuBlocksMatch = text.match(/#\s*GPU\s*blocks:\s*(\d+)/i)
    const cpuBlocksMatch = text.match(/#\s*CPU\s*blocks:\s*(\d+)/i)
    const loadTimeMatch = text.match(/(?:loading model weights|took|load time).*?(\d+(?:\.\d+)?)\s*s/i)
    const memMatch = text.match(/available\s*memory\s*for\s*kv\s*cache:\s*(\d+(?:\.\d+)?)\s*(gib|gb)/i)

    const gpuBlocks = gpuBlocksMatch ? parseInt(gpuBlocksMatch[1]) : null
    const cpuBlocks = cpuBlocksMatch ? parseInt(cpuBlocksMatch[1]) : null
    const loadTime = loadTimeMatch ? parseFloat(loadTimeMatch[1]) : null
    const kvMemoryGb = memMatch ? parseFloat(memMatch[1]) : null

    const realKvTokens = gpuBlocks ? gpuBlocks * flags.blockSize : null

    setParsedLogResult({
      gpuBlocks,
      cpuBlocks,
      loadTime,
      kvMemoryGb,
      realKvTokens,
      predictedKvTokens: maxSafeConcurrency * contextLength,
      matched: Boolean(gpuBlocks || loadTime || kvMemoryGb),
    })
  }

  // ==========================================
  // GENERATED PRODUCTION CLI COMMAND & SNIPPETS
  // (CRITICAL ACCURACY FIX: Omit V1 flags to prevent silent fallback to V0)
  // ==========================================
  const isV1Engine = selectedVllmVersion.isV1Engine
  const isLegacy = selectedVllmVersion.id === '0.3.x'

  const generatedVllmCommand = useMemo(() => {
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

    if (selectedRecipe.vllmArg) {
      cmd += ` \\\n  ${selectedRecipe.vllmArg}`
    } else if (flags.quantization !== 'none') {
      cmd += ` \\\n  --quantization ${flags.quantization}`
    }

    // CRITICAL: In V1 engine (0.8+), chunked prefill and prefix caching are active by default.
    // Explicitly passing --enable-prefix-caching or --enable-chunked-prefill causes silent downgrade to V0!
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

    // Speculative Decoding (Draft Model vs N-Gram vs EAGLE)
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

    if (flags.servedModelName.trim()) {
      cmd += ` \\\n  --served-model-name ${flags.servedModelName.trim()}`
    }

    if (flags.loadFormat !== 'auto') {
      cmd += ` \\\n  --load-format ${flags.loadFormat}`
    }

    if (flags.limitMmPerPrompt.trim()) {
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
      if (flags.loraModules.trim()) {
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

    if (flags.apiKey.trim()) {
      cmd += ` \\\n  --api-key ${flags.apiKey.trim()}`
    }

    if (flags.trustRemoteCode) {
      cmd += ` \\\n  --trust-remote-code`
    }

    return cmd
  }, [selectedModel, flags, selectedRecipe, selectedVllmVersion, scalingMode, isV1Engine, isLegacy])

  // Multi-Node Ray Cluster Bootstrap Snippet
  const generatedRayCluster = useMemo(() => {
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
  ${selectedRecipe.vllmArg || ''} \\
  --api-key ${flags.apiKey || 'dyno-prod-key-99'} \\
  --port 8000`
  }, [selectedModel, flags, selectedRecipe])

  // Verification Help Command
  const generatedHelpVerifyCmd = useMemo(() => {
    return `python3 -m vllm.entrypoints.openai.api_server --help | grep -iE "max-model-len|gpu-memory-utilization|tensor-parallel-size|cpu-offload-gb|pipeline-parallel-size|enable-lora|guided-decoding-backend"`
  }, [])

  // Docker Compose Snippet with Auth & GPU Reservation
  const generatedDockerCompose = useMemo(() => {
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
      ${selectedRecipe.vllmArg || ''}
      --api-key \${VLLM_API_KEY:-${flags.apiKey || 'dyno-prod-key-99'}}
      --port 8000`
  }, [selectedModel, flags, selectedRecipe, scalingMode, replicaCount, isV1Engine])

  // Env file snippet with Auth
  const generatedEnvSnippet = useMemo(() => {
    return `# vLLM Production Configuration for ${selectedModel.name}
VLLM_MODEL=${selectedModel.name}
VLLM_MAX_MODEL_LEN=${flags.maxModelLen}
VLLM_GPU_MEMORY_UTILIZATION=${flags.gpuMemoryUtilization.toFixed(2)}
VLLM_BLOCK_SIZE=${flags.blockSize}
${!isV1Engine ? `VLLM_ENABLE_PREFIX_CACHING=${flags.enablePrefixCaching}\nVLLM_ENABLE_CHUNKED_PREFILL=${flags.enableChunkedPrefill}` : '# In vLLM 0.8+ (V1), Chunked Prefill & Prefix Caching are active by default'}
VLLM_TENSOR_PARALLEL_SIZE=${flags.tensorParallelSize}
VLLM_PIPELINE_PARALLEL_SIZE=${flags.pipelineParallelSize}
VLLM_CPU_OFFLOAD_GB=${flags.cpuOffloadGb}
VLLM_QUANTIZATION=${selectedRecipe.id === 'fp8' ? 'fp8' : selectedRecipe.id.includes('awq') ? 'awq' : selectedRecipe.id.includes('gptq') ? 'gptq' : 'none'}
VLLM_API_KEY=${flags.apiKey || 'dyno-prod-key-99'}
VLLM_HOST=0.0.0.0
VLLM_PORT=8000`
  }, [selectedModel, flags, selectedRecipe, isV1Engine])

  const copyText = (text, type) => {
    navigator.clipboard.writeText(text)
    if (type === 'cli') {
      setCopiedCli(true)
      setTimeout(() => setCopiedCli(false), 2000)
    } else if (type === 'help') {
      setCopiedHelp(true)
      setTimeout(() => setCopiedHelp(false), 2000)
    } else if (type === 'env') {
      setCopiedEnv(true)
      setTimeout(() => setCopiedEnv(false), 2000)
    } else if (type === 'docker') {
      setCopiedDocker(true)
      setTimeout(() => setCopiedDocker(false), 2000)
    } else if (type === 'ray') {
      setCopiedRay(true)
      setTimeout(() => setCopiedRay(false), 2000)
    }
  }

  // Model & GPU Matchmaker Recommendation Engine
  const matchmakerRecommendations = useMemo(() => {
    const params = selectedModel.params || 8

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

    const valueGpu = GPU_CATALOG.find((g) => g.name === valueGpuName) || GPU_CATALOG[0]
    const speedGpu = GPU_CATALOG.find((g) => g.name === speedGpuName) || GPU_CATALOG[GPU_CATALOG.length - 1]
    const scaleGpu = GPU_CATALOG.find((g) => g.name === scaleGpuName) || GPU_CATALOG[GPU_CATALOG.length - 2]

    const valueRecipe = QUANTIZATION_RECIPES.find((r) => r.id === valueRecipeId) || QUANTIZATION_RECIPES[2]
    const speedRecipe = QUANTIZATION_RECIPES.find((r) => r.id === speedRecipeId) || QUANTIZATION_RECIPES[1]
    const scaleRecipe = QUANTIZATION_RECIPES.find((r) => r.id === scaleRecipeId) || QUANTIZATION_RECIPES[1]

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
  }, [selectedModel])

  const applyMatchmakerConfig = (rec) => {
    setTargetGpu(rec.gpu)
    setSelectedRecipe(rec.recipe)
    setScalingMode(rec.scaling)
    updateFlag('tensorParallelSize', rec.tp)
    updateFlag(
      'quantization',
      rec.recipe.id === 'fp8'
        ? 'fp8'
        : rec.recipe.id.includes('gptq')
        ? 'gptq'
        : rec.recipe.id.includes('awq')
        ? 'awq'
        : 'none'
    )
  }

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto pb-16">
      {/* ======================================================== */}
      {/* TOP HEADER & CONTROLS                                    */}
      {/* ======================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
              vLLM Production Engine Configurator
            </span>
            <span className="text-xs text-gray-500 font-mono">
              DeepLearning.AI &amp; Red Hat Architecture
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
            ⚡ vLLM Optimizer &amp; Engine Architecture
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Configure every vLLM parameter with engine-aware safety, compare quantization speed vs. quality, and simulate production rooflines.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* vLLM Version Selector with V1 Awareness */}
          <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-gray-500">vLLM:</span>
            <select
              className="bg-transparent text-sky-400 font-mono font-semibold focus:outline-none cursor-pointer"
              value={selectedVllmVersion.id}
              onChange={(e) => {
                const found = VLLM_VERSIONS.find((v) => v.id === e.target.value)
                if (found) setSelectedVllmVersion(found)
              }}
            >
              {VLLM_VERSIONS.map((v) => (
                <option key={v.id} value={v.id} className="bg-gray-900 text-white">
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={resetToRecommended}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs font-medium text-sky-400 hover:bg-gray-800 hover:text-sky-300 transition-colors"
            title="Reset all flags to recommended best-practice values"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Recommended</span>
          </button>

          <Link
            to="/gpu-sizer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:text-white hover:border-gray-700 transition-colors"
          >
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>GPU Sizer</span>
          </Link>
        </div>
      </div>

      {/* ======================================================== */}
      {/* V1 ENGINE ARCHITECTURE CALLOUT BANNER                     */}
      {/* ======================================================== */}
      {isV1Engine && (
        <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-950/20 text-sky-200 text-xs space-y-1 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-sky-300">
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
            <span>vLLM Modern Architecture (0.8.0+) — Clean Native Command Output</span>
          </div>
          <p className="text-gray-300 leading-relaxed text-[11px]">
            In modern vLLM, the legacy V0 engine, its attention backends, and old CLI flags were permanently removed from the upstream codebase in late 2025.
            <strong> Chunked prefill</strong> (dynamic token budgeting) and <strong>zero-overhead prefix caching</strong> are built-in native primitives.
            Flags like <code>--enable-prefix-caching</code> and <code>--enable-chunked-prefill</code> no longer exist and will crash with <code>NotImplementedError</code> if passed. DynoLLM automatically emits clean, crash-free commands.
          </p>
        </div>
      )}

      {/* ======================================================== */}
      {/* HARDWARE-AWARE ARCHITECTURE ALERT (AMPERE FP8 WARNING)   */}
      {/* ======================================================== */}
      {gpuArch.fp8Native === false &&
        (selectedRecipe.id === 'fp8' || flags.kvCacheDtype.startsWith('fp8')) && (
          <div className="p-4 rounded-xl border border-amber-500/50 bg-amber-950/25 text-amber-200 text-xs space-y-2 shadow-lg ring-1 ring-amber-500/20">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                ⚠️ GPU Architecture Warning: {targetGpu.name} ({gpuArch.family}) Lacks Native FP8 Tensor Cores
              </span>
            </div>
            <p className="leading-relaxed text-amber-200/90">
              Ampere ({gpuArch.sm}) GPUs do not have hardware FP8 Tensor Cores. Running FP8 on this card falls back to a{' '}
              <strong>Marlin weight-only dequantization kernel</strong>, giving memory compression without FP8 GEMM compute acceleration (notice on the Quantization chart that FP8 yields minimal speed gain over FP16).
            </p>
            <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-amber-300">
              <span>💡 Recommended Action:</span>
              <button
                type="button"
                onClick={() => {
                  const awq = QUANTIZATION_RECIPES.find((r) => r.id === 'int4_awq')
                  if (awq) setSelectedRecipe(awq)
                }}
                className="px-2.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 underline font-semibold cursor-pointer text-amber-100"
              >
                Switch to INT4 AWQ / GPTQ (W4A16)
              </button>
              <span>or deploy on Ada/Hopper (L4, L40S, H100).</span>
            </div>
          </div>
        )}

      {/* ======================================================== */}
      {/* TP ATTENTION HEAD DIVISION GUARDRAIL ALERT               */}
      {/* ======================================================== */}
      {!tpValidation.isValid && (
        <div className="p-4 rounded-xl border border-rose-500/60 bg-rose-950/30 text-rose-200 text-xs space-y-1.5 shadow-lg ring-1 ring-rose-500/30">
          <div className="flex items-center gap-2 font-bold text-rose-300 text-sm">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Critical Configuration Error: Invalid Tensor Parallelism Size</span>
          </div>
          <p className="leading-relaxed text-rose-200/90">{tpValidation.error}</p>
          <div className="flex items-center gap-2 pt-1 font-mono text-[11px]">
            <span className="text-gray-400">Allowed TP values for this model:</span>
            {[1, 2, 4, 8].filter((t) => (selectedModel.attentionHeads || 32) % t === 0).map((validTp) => (
              <button
                key={validTp}
                type="button"
                onClick={() => updateFlag('tensorParallelSize', validTp)}
                className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/50 text-white font-bold"
              >
                Set TP={validTp}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 1: GLOBAL MODEL SEARCH & MODEL CARD              */}
      {/* ======================================================== */}
      <div className="card space-y-4 border-sky-500/30 bg-gradient-to-br from-gray-900 via-gray-900 to-sky-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-white tracking-wide">
              Global Model Search &amp; Architecture Auto-Discovery
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-gray-400">{filteredCatalog.length} models available</span>
          </div>
        </div>

        {/* Global Search Input with Auto-complete Dropdown */}
        <div className="relative">
          <div className="relative flex items-center">
            <input
              type="text"
              value={modelSearchQuery}
              onChange={(e) => {
                setModelSearchQuery(e.target.value)
                setIsSearching(true)
              }}
              onFocus={() => setIsSearching(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCustomModelSubmit()
              }}
              placeholder="Search or enter any model (e.g. meta-llama/Llama-3.1-8B-Instruct, Qwen/Qwen2.5-32B, deepseek-ai/DeepSeek-R1-Distill-Qwen-14B)..."
              className="input font-mono text-sm py-2.5 pl-3 pr-32 w-full"
            />
            <button
              type="button"
              onClick={handleCustomModelSubmit}
              className="absolute right-2 px-3 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded text-xs font-semibold transition-colors shadow-sm"
            >
              Select / Auto-Detect
            </button>
          </div>

          {/* Autocomplete Dropdown */}
          {isSearching && filteredCatalog.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-gray-900/98 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto divide-y divide-gray-800">
              {filteredCatalog.slice(0, 10).map((m) => (
                <div
                  key={m.id}
                  onClick={() => handleSelectModel(m)}
                  className="px-4 py-2.5 hover:bg-sky-500/15 cursor-pointer flex items-center justify-between text-xs transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-white">{m.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-gray-800 text-sky-300 border border-gray-700">
                      {m.family}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-400 font-mono text-[11px]">
                    <span>{m.params}B params</span>
                    <span>•</span>
                    <span>{m.layers} layers</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">{m.gqaRatio}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Model Card Display */}
        <div className="p-4 rounded-xl bg-gray-950/70 border border-gray-800 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-gray-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white font-mono">{selectedModel.name}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 font-semibold border border-sky-500/20">
                    {selectedModel.creator}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                  <span>Architecture: <strong className="text-gray-200">{selectedModel.family}</strong></span>
                  <span>•</span>
                  <span>License: <strong className="text-gray-200">{selectedModel.license}</strong></span>
                </div>
              </div>
            </div>

            {/* Model Card Data Source Badge */}
            <div className="flex items-center gap-2">
              <div className="text-right">
                <span className="text-[10px] text-gray-500 block">DATA SOURCE:</span>
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 justify-end">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {selectedModel.dataSource || 'Curated Registry'}
                </span>
              </div>
              {selectedModel.hfConfigUrl && (
                <a
                  href={selectedModel.hfConfigUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors border border-gray-700"
                  title="Verify on Hugging Face config.json"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Model Architectural Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs font-mono">
            <div className="p-2.5 bg-gray-900 rounded-lg border border-gray-800/80">
              <span className="text-[10px] text-gray-500 block">TOTAL PARAMS</span>
              <span className="text-sm font-bold text-white">{params}B</span>
            </div>
            <div className="p-2.5 bg-gray-900 rounded-lg border border-gray-800/80">
              <span className="text-[10px] text-gray-500 block">LAYERS (L)</span>
              <span className="text-sm font-bold text-sky-400">{layers}</span>
            </div>
            <div className="p-2.5 bg-gray-900 rounded-lg border border-gray-800/80">
              <span className="text-[10px] text-gray-500 block">ATTN HEADS (Q)</span>
              <span className="text-sm font-bold text-white">{selectedModel.attentionHeads || 32}</span>
            </div>
            <div className="p-2.5 bg-gray-900 rounded-lg border border-gray-800/80">
              <span className="text-[10px] text-gray-500 block">KV HEADS (KV)</span>
              <span className="text-sm font-bold text-amber-300">{kvHeads}</span>
            </div>
            <div className="p-2.5 bg-gray-900 rounded-lg border border-gray-800/80">
              <span className="text-[10px] text-gray-500 block">GQA FACTOR</span>
              <span className="text-sm font-bold text-emerald-400">{selectedModel.gqaRatio}</span>
            </div>
            <div className="p-2.5 bg-gray-900 rounded-lg border border-gray-800/80">
              <span className="text-[10px] text-gray-500 block">COLD START TIME</span>
              <span className="text-sm font-bold text-indigo-400">
                {selectedModel.coldStartSeconds || '~45s'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hardware & Multi-GPU Topology Bar */}
      <div className="card grid grid-cols-1 sm:grid-cols-4 gap-4 border-gray-800 bg-gray-900/60">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Target Host GPU
          </label>
          <select
            className="select text-xs py-2 px-3 w-full"
            value={targetGpu.name}
            onChange={(e) => {
              const found = GPU_CATALOG.find((g) => g.name === e.target.value)
              if (found) setTargetGpu(found)
            }}
          >
            {GPU_CATALOG.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name} ({g.vramGb} GB, {g.bandwidthGbps} GB/s)
              </option>
            ))}
          </select>
          <span className="text-[10px] text-gray-500 mt-1 block">
            Arch: <strong className="text-gray-300">{gpuArch.family}</strong> ({gpuArch.sm})
          </span>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Model Precision / Quantization
          </label>
          <select
            className="select text-xs py-2 px-3 w-full"
            value={selectedRecipe.id}
            onChange={(e) => {
              const found = QUANTIZATION_RECIPES.find((r) => r.id === e.target.value)
              if (found) {
                setSelectedRecipe(found)
                updateFlag(
                  'quantization',
                  found.id === 'fp8'
                    ? 'fp8'
                    : found.id.includes('gptq')
                    ? 'gptq'
                    : found.id.includes('awq')
                    ? 'awq'
                    : 'none'
                )
              }
            }}
          >
            {QUANTIZATION_RECIPES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-emerald-400 mt-1 block font-medium">
            Retention: {selectedRecipe.accuracyRetention}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-400">
              Active Benchmark Concurrency
            </label>
            <span className="text-[10px] font-mono text-gray-400">
              Virtual Users
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={512}
              value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, parseInt(e.target.value) || 1))}
              className="input font-mono text-xs py-1.5 px-3 w-28 text-white font-bold"
            />
            <div className="flex items-center gap-1 flex-wrap">
              {[1, 4, 8, 16, 32, 64].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setConcurrency(n)}
                  className={`px-1.5 py-1 rounded text-[10px] font-mono border transition-colors ${
                    concurrency === n
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {n}u
                </button>
              ))}
            </div>
          </div>
          <span className="text-[10px] text-gray-500 mt-1 block">
            Total KV Cache: ~{totalKvNeededGb.toFixed(1)} GB VRAM
          </span>
        </div>

        {/* Multi-GPU Topology: TP vs Horizontal Replicas */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-400">Multi-GPU Scaling Strategy</label>
            <span className="text-[10px] font-mono text-indigo-400 font-bold">
              {scalingMode === 'tp' ? 'Model Splitting (TP)' : 'Independent Workers'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setScalingMode('tp')}
              className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                scalingMode === 'tp'
                  ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 font-bold'
                  : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}
            >
              Tensor Parallel (TP)
            </button>
            <button
              type="button"
              onClick={() => setScalingMode('replicas')}
              className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                scalingMode === 'replicas'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                  : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}
            >
              N Replicas + LB
            </button>
          </div>
          <span className="text-[10px] text-gray-500 mt-1 block">
            {scalingMode === 'tp'
              ? 'Splits 1 model across NVLink GPUs'
              : 'N standalone workers behind Load Balancer'}
          </span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 🎯 MODEL & GPU MATCHMAKER (EMPIRICAL HARDWARE SIZING)    */}
      {/* ======================================================== */}
      <div className="card bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 border-sky-500/20 p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Model &amp; GPU Matchmaker
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
                Auto-Sizing Engine
              </span>
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Empirically ranked hardware architectures &amp; quantization recipes for <strong className="text-white">{selectedModel.name}</strong> ({selectedModel.params}B params). Click to auto-configure in 1-click.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-gray-400">
            <span>SLA Target:</span>
            <span className="px-2 py-0.5 rounded bg-gray-800 text-sky-300 font-bold border border-gray-700">Dynamic Multi-Objective</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {matchmakerRecommendations.map((rec, i) => (
            <div
              key={i}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                rec.tagColor === 'emerald'
                  ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/60'
                  : rec.tagColor === 'amber'
                  ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/60'
                  : 'bg-sky-950/20 border-sky-500/30 hover:border-sky-500/60'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      rec.tagColor === 'emerald'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : rec.tagColor === 'amber'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                    }`}
                  >
                    {rec.tag}
                  </span>
                  <span className="text-xs font-mono font-bold text-gray-300">
                    {rec.costEstimate}
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-gray-400" />
                    {rec.gpu.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-gray-400">
                    <span className="text-gray-300">{rec.tp > 1 ? `TP = ${rec.tp}` : 'Single GPU'}</span>
                    <span>•</span>
                    <span className="text-sky-300 font-semibold">{rec.recipe.name.split(' ')[0]}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">{rec.estDecode}</span>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  {rec.rationale}
                </p>
              </div>

              <div className="pt-4 mt-3 border-t border-gray-800/80">
                <button
                  type="button"
                  onClick={() => applyMatchmakerConfig(rec)}
                  className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold font-mono transition-colors flex items-center justify-center gap-1.5 shadow-sm ${
                    rec.tagColor === 'emerald'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : rec.tagColor === 'amber'
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Apply Hardware &amp; Config
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2-COLUMN SPLIT: LEFT PREDICTION & 5 CHARTS | RIGHT CONFIG */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: PREDICTED PERFORMANCE & DECISION CHARTS */}
        <div className="lg:col-span-6 space-y-6">
          <div className="card space-y-4 border-sky-500/20 bg-gray-900/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-sky-400" />
                  Performance Modeling on {targetGpu.name}
                  {scalingMode === 'tp' && flags.tensorParallelSize > 1 && ` (${flags.tensorParallelSize}x TP)`}
                  {scalingMode === 'replicas' && replicaCount > 1 && ` (${replicaCount}x Replicas)`}
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Roofline estimates, memory bandwidth ceilings, and cost curves.
                </p>
              </div>

              <span
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold border self-start sm:self-auto ${
                  isVramExceeded
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : freeVramHeadroomGb < 2
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}
              >
                {isVramExceeded
                  ? '⚠️ VRAM Exceeded'
                  : freeVramHeadroomGb < 2
                  ? '⚠️ Tight Headroom'
                  : '✓ Fits in VRAM'}
              </span>
            </div>

            {/* 4 Key Performance Metrics (2x2 Grid) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-gray-950/80 rounded-xl border border-gray-800 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 block font-sans">
                    DECODE SPEED (THEORETICAL)
                  </span>
                  <span className="text-[9px] text-gray-500 uppercase">Roofline</span>
                </div>
                <span className="text-lg font-bold text-sky-400">
                  ~{estimatedDecodeTps} tok/s
                </span>
                <span className="text-[10px] text-gray-500 mt-0.5 block font-sans">
                  HBM Bandwidth Bound (Single Stream)
                </span>
              </div>

              <div className="p-3 bg-gray-950/80 rounded-xl border border-gray-800 font-mono">
                <span className="text-[10px] text-gray-400 block font-sans">
                  P95 TTFT (TIME-TO-FIRST-TOKEN)
                </span>
                <span className="text-lg font-bold text-white">
                  ~{estimatedTtftMs} ms
                </span>
                <span className="text-[10px] text-emerald-400 mt-0.5 block font-sans">
                  {flags.enablePrefixCaching ? 'Prefix Cache Active' : 'Uncached Prefill'}
                </span>
              </div>

              <div className="p-3 bg-gray-950/80 rounded-xl border border-gray-800 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 block font-sans">
                    SATURATION KNEE (MAX USERS)
                  </span>
                  <span className="text-[9px] text-gray-500 uppercase">Ceiling</span>
                </div>
                <span className="text-lg font-bold text-amber-300">
                  {maxSafeConcurrency} Users
                </span>
                <span className="text-[10px] text-gray-500 mt-0.5 block font-sans">
                  Theoretical KV Cache Exhaustion
                </span>
              </div>

              <div className="p-3 bg-gray-950/80 rounded-xl border border-gray-800 font-mono">
                <span className="text-[10px] text-gray-400 block font-sans">
                  TOTAL VRAM ALLOCATED
                </span>
                <span className="text-lg font-bold text-indigo-400">
                  {totalUsedVramGb.toFixed(1)} / {effectiveGpuVram} GB
                </span>
                <span className="text-[10px] text-gray-500 mt-0.5 block font-sans">
                  {((totalUsedVramGb / effectiveGpuVram) * 100).toFixed(0)}% GPU Utilization
                </span>
              </div>
            </div>

            {/* ======================================================== */}
            {/* INTERACTIVE DECISION CHARTS SWITCHER                     */}
            {/* ======================================================== */}
            <div className="pt-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setActiveChartTab('throughput')}
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors border ${
                    activeChartTab === 'throughput'
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold'
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-3 h-3 inline mr-1" />
                  Throughput &amp; Latency
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartTab('quant')}
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors border ${
                    activeChartTab === 'quant'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <Activity className="w-3 h-3 inline mr-1" />
                  Quant Trade-Off
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartTab('context')}
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors border ${
                    activeChartTab === 'context'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300 font-bold'
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3 h-3 inline mr-1" />
                  Context vs Concurrency
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartTab('tp_scaling')}
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors border ${
                    activeChartTab === 'tp_scaling'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 font-bold'
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <Split className="w-3 h-3 inline mr-1" />
                  TP vs Replicas
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartTab('roofline')}
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors border ${
                    activeChartTab === 'roofline'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <Gauge className="w-3 h-3 inline mr-1" />
                  Roofline Model
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartTab('cost')}
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors border ${
                    activeChartTab === 'cost'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold'
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <DollarSign className="w-3 h-3 inline mr-1" />
                  Cost / 1M Tokens
                </button>
              </div>

              {/* ---------------------------------------------------- */}
              {/* TAB 0: THROUGHPUT & LATENCY (COMPOSED CHART)        */}
              {/* ---------------------------------------------------- */}
              {activeChartTab === 'throughput' && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                      Concurrency vs. Throughput (tok/s) &amp; P95 Latency (ms)
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      Red line = Saturation Knee
                    </span>
                  </div>

                  <div className="h-64 w-full bg-gray-950/60 rounded-xl p-2.5 border border-gray-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={concurrencyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                        <XAxis
                          dataKey="concurrency"
                          stroke="#9ca3af"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'Concurrent Virtual Users',
                            position: 'insideBottom',
                            offset: -5,
                            fill: '#9ca3af',
                            fontSize: 10,
                          }}
                        />
                        <YAxis
                          yAxisId="left"
                          stroke="#38bdf8"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'System Tok/s',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#38bdf8',
                            fontSize: 9,
                          }}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#fbbf24"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'Latency (ms)',
                            angle: 90,
                            position: 'insideRight',
                            fill: '#fbbf24',
                            fontSize: 9,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#111827',
                            borderColor: '#374151',
                            borderRadius: '0.5rem',
                            fontSize: '11px',
                          }}
                          labelFormatter={(val) => `${val} Concurrent Users`}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                        <Bar
                          yAxisId="left"
                          dataKey="throughput"
                          name="Throughput (tok/s)"
                          fill="#0284c7"
                          radius={[4, 4, 0, 0]}
                          opacity={0.85}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="ttft"
                          name="P95 TTFT (ms)"
                          stroke="#f43f5e"
                          strokeWidth={2}
                          dot={{ r: 2.5 }}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="itl"
                          name="Inter-Token Latency (ms)"
                          stroke="#fbbf24"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={{ r: 2 }}
                        />
                        {maxSafeConcurrency > 0 && (
                          <ReferenceLine
                            yAxisId="left"
                            x={maxSafeConcurrency}
                            stroke="#ef4444"
                            strokeDasharray="3 3"
                            label={{
                              value: `Knee: ${maxSafeConcurrency}u`,
                              fill: '#ef4444',
                              fontSize: 9,
                              position: 'top',
                            }}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------- */}
              {/* TAB 1: QUANTIZATION TRADE-OFF SCATTER PLOT           */}
              {/* ---------------------------------------------------- */}
              {activeChartTab === 'quant' && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        Quantization Trade-Off: Speed vs. Quality Retention
                      </span>
                      <p className="text-[11px] text-gray-400">
                        Click any dot to select that recipe. Green = Native hardware GEMM; Amber = Fallback/memory-only.
                      </p>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Selected: {selectedRecipe.name.split(' (')[0]}
                    </span>
                  </div>

                  <div className="h-64 w-full bg-gray-950/60 rounded-xl p-2.5 border border-gray-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                        <XAxis
                          type="number"
                          dataKey="speed"
                          name="Decode Speed"
                          unit=" tok/s"
                          stroke="#9ca3af"
                          fontSize={10}
                          tickLine={false}
                          domain={['dataMin - 10', 'dataMax + 20']}
                          label={{
                            value: 'Single-Stream Decode Speed (tok/s)',
                            position: 'insideBottom',
                            offset: -10,
                            fill: '#9ca3af',
                            fontSize: 10,
                          }}
                        />
                        <YAxis
                          type="number"
                          dataKey="quality"
                          name="Quality Retention"
                          unit="%"
                          stroke="#9ca3af"
                          fontSize={10}
                          tickLine={false}
                          domain={[95, 101]}
                          label={{
                            value: 'Accuracy Retention %',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#9ca3af',
                            fontSize: 9,
                          }}
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload
                              return (
                                <div className="p-2.5 rounded-lg bg-gray-900 border border-gray-700 text-xs font-mono shadow-xl space-y-1">
                                  <div className="font-bold text-white flex items-center gap-1.5">
                                    <span>{d.fullName}</span>
                                    {d.isSelected && <span className="text-[9px] px-1 rounded bg-sky-500/20 text-sky-400">ACTIVE</span>}
                                  </div>
                                  <div className="text-emerald-400">Speed: ~{d.speed} tok/s</div>
                                  <div className="text-sky-400">Quality: {d.quality}%</div>
                                  <div className="text-gray-400">Size: {d.bytes} bytes/param</div>
                                  <div className={d.isHwAccelerated ? 'text-emerald-400 text-[10px]' : 'text-amber-400 text-[10px]'}>
                                    {d.isHwAccelerated ? '✓ Hardware Accelerated' : '⚠️ Memory-only fallback / No GEMM speedup'}
                                  </div>
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                        <Scatter
                          data={quantScatterData}
                          onClick={(dot) => {
                            const found = QUANTIZATION_RECIPES.find((r) => r.id === dot.id)
                            if (found) setSelectedRecipe(found)
                          }}
                          className="cursor-pointer"
                        >
                          {quantScatterData.map((entry) => (
                            <Cell
                              key={entry.id}
                              fill={entry.isSelected ? '#38bdf8' : entry.isHwAccelerated ? '#10b981' : '#f59e0b'}
                              stroke={entry.isSelected ? '#ffffff' : entry.isHwAccelerated ? '#059669' : '#d97706'}
                              strokeWidth={entry.isSelected ? 3 : 1}
                              r={entry.isSelected ? 8 : 6}
                            />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------- */}
              {/* TAB 2: CONTEXT LENGTH VS CONCURRENCY CURVE           */}
              {/* ---------------------------------------------------- */}
              {activeChartTab === 'context' && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-400" />
                        Context Length vs. Max Concurrency &amp; KV Cache Footprint
                      </span>
                      <p className="text-[11px] text-gray-400">
                        Shows the hyperbola: bumping context from 4k to 32k or 128k drastically drops concurrent capacity.
                      </p>
                    </div>
                  </div>

                  <div className="h-64 w-full bg-gray-950/60 rounded-xl p-2.5 border border-gray-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={contextCurveData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                        <XAxis
                          dataKey="context"
                          stroke="#9ca3af"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'Context Length (Tokens)',
                            position: 'insideBottom',
                            offset: -5,
                            fill: '#9ca3af',
                            fontSize: 10,
                          }}
                        />
                        <YAxis
                          yAxisId="left"
                          stroke="#a855f7"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'Max Users Before OOM',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#a855f7',
                            fontSize: 9,
                          }}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#38bdf8"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'KV per User (MB)',
                            angle: 90,
                            position: 'insideRight',
                            fill: '#38bdf8',
                            fontSize: 9,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#111827',
                            borderColor: '#374151',
                            borderRadius: '0.5rem',
                            fontSize: '11px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                        <Bar
                          yAxisId="left"
                          dataKey="maxConcurrency"
                          name="Max Concurrent Streams"
                          fill="#8b5cf6"
                          radius={[4, 4, 0, 0]}
                          opacity={0.85}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="kvPerUserMb"
                          name="KV Cache / User (MB)"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------- */}
              {/* TAB 3: TP SCALING EFFICIENCY VS REPLICAS             */}
              {/* ---------------------------------------------------- */}
              {activeChartTab === 'tp_scaling' && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                        <Split className="w-3.5 h-3.5 text-indigo-400" />
                        TP Scaling Efficiency: Ideal vs. Real vs. Horizontal Replicas
                      </span>
                      <p className="text-[11px] text-gray-400">
                        Shows where All-Reduce overhead diminishes TP returns, and where Replicas win for pure token throughput.
                      </p>
                    </div>
                  </div>

                  <div className="h-64 w-full bg-gray-950/60 rounded-xl p-2.5 border border-gray-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={tpScalingData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                        <XAxis dataKey="gpuCount" stroke="#9ca3af" fontSize={10} tickLine={false} />
                        <YAxis
                          stroke="#9ca3af"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'Total System Tok/s',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#9ca3af',
                            fontSize: 9,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#111827',
                            borderColor: '#374151',
                            borderRadius: '0.5rem',
                            fontSize: '11px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                        <Line
                          type="monotone"
                          dataKey="idealTp"
                          name="Ideal Linear TP (Theoretical)"
                          stroke="#10b981"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="realTp"
                          name="Real TP (With All-Reduce Penalty)"
                          stroke="#38bdf8"
                          strokeWidth={2.5}
                          dot={{ r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="replicasThroughput"
                          name="Horizontal Replicas + LB"
                          stroke="#c084fc"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------- */}
              {/* TAB 4: INTERACTIVE ROOFLINE MODEL                   */}
              {/* ---------------------------------------------------- */}
              {activeChartTab === 'roofline' && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-amber-400" />
                        GPU Roofline Model: Arithmetic Intensity vs. Attainable FLOPs
                      </span>
                      <p className="text-[11px] text-gray-400">
                        Ridge point: <strong className="text-white">{rooflineData.ridgeIntensity} FLOPs/Byte</strong>. Below ridge = HBM Bandwidth Bound; Above = Compute Bound.
                      </p>
                    </div>
                  </div>

                  <div className="h-64 w-full bg-gray-950/60 rounded-xl p-2.5 border border-gray-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={rooflineData.curve}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                        <XAxis
                          dataKey="intensity"
                          stroke="#9ca3af"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'Arithmetic Intensity (FLOPs / Byte)',
                            position: 'insideBottom',
                            offset: -5,
                            fill: '#9ca3af',
                            fontSize: 10,
                          }}
                        />
                        <YAxis
                          stroke="#fbbf24"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'Attainable TFLOPs/s',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#fbbf24',
                            fontSize: 9,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#111827',
                            borderColor: '#374151',
                            borderRadius: '0.5rem',
                            fontSize: '11px',
                          }}
                          formatter={(val) => `${val} TFLOPs`}
                          labelFormatter={(val) => `${val} FLOPs/Byte`}
                        />
                        <Area
                          type="monotone"
                          dataKey="attainableTflops"
                          name="Achievable Hardware Limit"
                          stroke="#fbbf24"
                          fill="#f59e0b"
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                        <ReferenceLine
                          x={rooflineData.ridgeIntensity}
                          stroke="#ef4444"
                          strokeDasharray="3 3"
                          label={{
                            value: `Ridge: ${rooflineData.ridgeIntensity}`,
                            fill: '#ef4444',
                            fontSize: 9,
                            position: 'top',
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                    {rooflineData.operatingPoints.map((op) => (
                      <div key={op.name} className="p-2 rounded bg-gray-950 border border-gray-800">
                        <span className="text-gray-400 block">{op.name}</span>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-amber-300 font-bold">{op.tflops} TFLOPs</span>
                          <span className="text-[10px] text-gray-500">{op.bound}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------- */}
              {/* TAB 5: CONCURRENCY VS COST PER 1M TOKENS             */}
              {/* ---------------------------------------------------- */}
              {activeChartTab === 'cost' && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-rose-400" />
                        Concurrency vs. Cost per 1 Million Generated Tokens
                      </span>
                      <p className="text-[11px] text-gray-400">
                        Economic sweet-spot: cost drops steeply as batching saturates memory bandwidth.
                      </p>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-mono">
                      <span className="text-gray-400">GPU $/hr:</span>
                      <input
                        type="number"
                        step={0.1}
                        value={effectiveGpuHourlyCost}
                        onChange={(e) => setCustomHourlyCost(parseFloat(e.target.value) || 0.1)}
                        className="input font-mono text-xs py-0.5 px-1.5 w-16 text-right"
                      />
                    </div>
                  </div>

                  <div className="h-64 w-full bg-gray-950/60 rounded-xl p-2.5 border border-gray-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={costCurveData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                        <XAxis
                          dataKey="concurrency"
                          stroke="#9ca3af"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'Concurrent Virtual Users',
                            position: 'insideBottom',
                            offset: -5,
                            fill: '#9ca3af',
                            fontSize: 10,
                          }}
                        />
                        <YAxis
                          stroke="#f43f5e"
                          fontSize={10}
                          tickLine={false}
                          label={{
                            value: 'Cost ($ / 1M Tokens)',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#f43f5e',
                            fontSize: 9,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#111827',
                            borderColor: '#374151',
                            borderRadius: '0.5rem',
                            fontSize: '11px',
                          }}
                          formatter={(val) => `$${val}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="costPerMillion"
                          name="Cost / 1M Tokens ($)"
                          stroke="#f43f5e"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                        {maxSafeConcurrency > 0 && (
                          <ReferenceLine
                            x={maxSafeConcurrency}
                            stroke="#ef4444"
                            strokeDasharray="3 3"
                            label={{
                              value: 'Saturation Knee',
                              fill: '#ef4444',
                              fontSize: 9,
                              position: 'top',
                            }}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* VRAM Memory Allocation Breakdown */}
            <div className="space-y-1.5 pt-2 border-t border-gray-800/80">
              <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                GPU VRAM Budget Breakdown ({effectiveGpuVram} GB)
              </span>

              <div className="w-full bg-gray-950/60 rounded-xl p-3 border border-gray-800 space-y-2">
                <ResponsiveContainer width="100%" height={45}>
                  <BarChart data={vramBreakdownData} layout="vertical">
                    <XAxis type="number" domain={[0, effectiveGpuVram]} hide />
                    <YAxis type="category" dataKey="name" hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111827',
                        borderColor: '#374151',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                      }}
                      formatter={(val) => `${val} GB`}
                    />
                    <Bar dataKey="Weights" stackId="a" fill="#38bdf8" name="Model Weights" radius={[4, 0, 0, 4]} />
                    <Bar dataKey="KVCache" stackId="a" fill="#818cf8" name="KV Cache" />
                    <Bar dataKey="Overhead" stackId="a" fill="#fbbf24" name="CUDA & Scratch" />
                    <Bar dataKey="FreeHeadroom" stackId="a" fill="#10b981" name="Free Headroom" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono border-t border-gray-800/80 pt-2">
                  <div>
                    <span className="text-sky-400 block text-[10px]">WEIGHTS</span>
                    <span className="text-white font-bold">{weightsGb.toFixed(1)} GB</span>
                  </div>
                  <div>
                    <span className="text-indigo-400 block text-[10px]">KV CACHE</span>
                    <span className="text-white font-bold">{totalKvNeededGb.toFixed(1)} GB</span>
                  </div>
                  <div>
                    <span className="text-amber-400 block text-[10px]">OVERHEAD</span>
                    <span className="text-white font-bold">{runtimeOverheadGb.toFixed(1)} GB</span>
                  </div>
                  <div>
                    <span className="text-emerald-400 block text-[10px]">FREE VRAM</span>
                    <span className="text-white font-bold">{freeVramHeadroomGb.toFixed(1)} GB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* PRODUCTION EXPORT & VERIFICATION CENTER                   */}
          {/* ======================================================== */}
          <div className="card space-y-3 bg-gray-950 border-gray-800">
            {/* Export Tabs Navigation */}
            <div className="flex items-center justify-between border-b border-gray-800/80 pb-2">
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setExportTab('cli')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    exportTab === 'cli'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Terminal className="w-3 h-3 inline mr-1" />
                  vLLM CLI
                </button>
                <button
                  type="button"
                  onClick={() => setExportTab('help_diff')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    exportTab === 'help_diff'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Source of Truth: Diff active flags against your real installed binary"
                >
                  <Scan className="w-3 h-3 inline mr-1" />
                  Live --help Diff
                  {binaryDiffResult && (
                    <span
                      className={`ml-1 px-1 py-0.5 rounded text-[9px] font-bold ${
                        binaryDiffResult.missing.length > 0
                          ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                          : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {binaryDiffResult.missing.length > 0
                        ? `⚠️ ${binaryDiffResult.missing.length} Missing`
                        : `✓ ${binaryDiffResult.verified.length} OK`}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setExportTab('docker')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    exportTab === 'docker'
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Box className="w-3 h-3 inline mr-1" />
                  docker-compose
                </button>
                <button
                  type="button"
                  onClick={() => setExportTab('env')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    exportTab === 'env'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Code2 className="w-3 h-3 inline mr-1" />
                  .env
                </button>
                <button
                  type="button"
                  onClick={() => setExportTab('validator')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    exportTab === 'validator'
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <FileText className="w-3 h-3 inline mr-1" />
                  Log Validator
                </button>
                <button
                  type="button"
                  onClick={() => setExportTab('ray')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    exportTab === 'ray'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <GitBranch className="w-3 h-3 inline mr-1" />
                  Multi-Node Ray
                </button>
              </div>

              {exportTab === 'cli' && (
                <button
                  type="button"
                  onClick={() => copyText(generatedVllmCommand, 'cli')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 hover:text-white transition-colors border border-gray-700 shadow-sm"
                >
                  {copiedCli ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-sky-400" />}
                  <span>{copiedCli ? 'Copied!' : 'Copy'}</span>
                </button>
              )}

              {exportTab === 'help_diff' && (
                <button
                  type="button"
                  onClick={() => copyText(generatedHelpVerifyCmd, 'help')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 hover:text-white transition-colors border border-gray-700 shadow-sm"
                >
                  {copiedHelp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-amber-400" />}
                  <span>{copiedHelp ? 'Copied!' : 'Copy Help Cmd'}</span>
                </button>
              )}

              {exportTab === 'docker' && (
                <button
                  type="button"
                  onClick={() => copyText(generatedDockerCompose, 'docker')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 hover:text-white transition-colors border border-gray-700 shadow-sm"
                >
                  {copiedDocker ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-indigo-400" />}
                  <span>{copiedDocker ? 'Copied!' : 'Copy Compose'}</span>
                </button>
              )}

              {exportTab === 'env' && (
                <button
                  type="button"
                  onClick={() => copyText(generatedEnvSnippet, 'env')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 hover:text-white transition-colors border border-gray-700 shadow-sm"
                >
                  {copiedEnv ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-emerald-400" />}
                  <span>{copiedEnv ? 'Copied!' : 'Copy .env'}</span>
                </button>
              )}

              {exportTab === 'ray' && (
                <button
                  type="button"
                  onClick={() => copyText(generatedRayCluster, 'ray')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 hover:text-white transition-colors border border-gray-700 shadow-sm"
                >
                  {copiedRay ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-amber-400" />}
                  <span>{copiedRay ? 'Copied!' : 'Copy Ray Script'}</span>
                </button>
              )}
            </div>

            {/* TAB CONTENT: CLI COMMAND */}
            {exportTab === 'cli' && (
              <div className="space-y-2">
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Flag syntax varies across vLLM releases. Target version:{' '}
                    <strong>{selectedVllmVersion.name}</strong>.
                    {isV1Engine && ' (V1 active: prefix-caching & chunked-prefill omitted to prevent V0 fallback)'}
                  </span>
                </div>
                <pre className="p-3.5 bg-gray-900/90 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto border border-gray-800 leading-relaxed shadow-inner">
                  {generatedVllmCommand}
                </pre>
              </div>
            )}

            {/* TAB CONTENT: LIVE --HELP DIFF (SOURCE OF TRUTH) */}
            {exportTab === 'help_diff' && (
              <div className="space-y-3.5">
                <div className="p-3 rounded-lg bg-gray-900 border border-amber-500/30 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300 flex items-center gap-1.5">
                      <Scan className="w-3.5 h-3.5" />
                      Live Binary Source of Truth (Auto-Diff &amp; Flag Pruning)
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      Overrides hardcoded matrices
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    vLLM CLI flags churn rapidly between releases. Run the verification command below on your server, paste the stdout help output, and DynoLLM will automatically diff your active flags against your real installed binary:
                  </p>
                  <pre className="p-2 bg-gray-950 rounded text-[11px] font-mono text-amber-300 border border-gray-800 overflow-x-auto">
                    {generatedHelpVerifyCmd}
                  </pre>
                </div>

                <div className="space-y-2">
                  <textarea
                    rows={4}
                    value={helpInputText}
                    onChange={(e) => setHelpInputText(e.target.value)}
                    placeholder="Paste stdout from: python3 -m vllm.entrypoints.openai.api_server --help"
                    className="input font-mono text-xs w-full py-2 px-3 resize-none border-gray-800"
                  />

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => analyzeHelpOutput()}
                        className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Scan className="w-3.5 h-3.5" />
                        Analyze &amp; Diff Installed Binary
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const sample = `usage: vllm serve [-h] --model MODEL [--max-model-len MAX_MODEL_LEN] [--gpu-memory-utilization GPU_MEMORY_UTILIZATION] [--block-size BLOCK_SIZE] [--max-num-seqs MAX_NUM_SEQS] [--max-num-batched-tokens MAX_NUM_BATCHED_TOKENS] [--kv-cache-dtype KV_CACHE_DTYPE] [--tensor-parallel-size TENSOR_PARALLEL_SIZE] [--pipeline-parallel-size PIPELINE_PARALLEL_SIZE] [--cpu-offload-gb CPU_OFFLOAD_GB] [--swap-space SWAP_SPACE] [--enforce-eager] [--disable-sliding-window] [--disable-log-stats] [--api-key API_KEY] [--served-model-name SERVED_MODEL_NAME] [--speculative-model SPECULATIVE_MODEL] [--num-speculative-tokens NUM_SPECULATIVE_TOKENS] [--quantization QUANTIZATION] [--load-format LOAD_FORMAT] [--trust-remote-code]
vLLM version 0.8.2`
                          setHelpInputText(sample)
                          analyzeHelpOutput(sample)
                        }}
                        className="px-2.5 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors border border-gray-700 font-mono text-[11px]"
                      >
                        Load Sample v0.8+ Output
                      </button>
                    </div>

                    {helpInputText && (
                      <button
                        type="button"
                        onClick={() => {
                          setHelpInputText('')
                          setBinaryDiffResult(null)
                        }}
                        className="text-xs text-gray-500 hover:text-gray-300"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Diff Analysis Results */}
                {binaryDiffResult && (
                  <div className="p-3.5 rounded-xl bg-gray-900 border border-gray-800 space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-gray-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold">
                          ✓ Installed Binary Analyzed
                        </span>
                        {binaryDiffResult.detectedVersion && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                            vLLM {binaryDiffResult.detectedVersion}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {binaryDiffResult.totalDetected} total flags supported in your binary
                      </span>
                    </div>

                    {/* Verified Flags in User Binary */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-gray-400 block font-sans font-semibold">
                        Supported &amp; Verified in your binary ({binaryDiffResult.verified.length} flags):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {binaryDiffResult.verified.map((f) => (
                          <span
                            key={f}
                            className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono flex items-center gap-1"
                          >
                            <Check className="w-2.5 h-2.5" />
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Missing Flags in User Binary */}
                    {binaryDiffResult.missing.length > 0 ? (
                      <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-rose-400 font-bold text-[11px] font-sans flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Missing from your binary ({binaryDiffResult.missing.length} flags will crash if passed):
                          </span>
                          <button
                            type="button"
                            onClick={pruneUnsupportedFlags}
                            className="px-2.5 py-1 rounded bg-rose-500 hover:bg-rose-600 text-white font-bold text-[11px] transition-colors shadow-sm flex items-center gap-1"
                          >
                            <Wrench className="w-3 h-3" />
                            Auto-Prune Unsupported Flags
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {binaryDiffResult.missing.map((f) => (
                            <span
                              key={f}
                              className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono flex items-center gap-1"
                            >
                              <XCircle className="w-2.5 h-2.5" />
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          100% Binary Match! Every active flag in your generated command is verified and natively supported by your installed vLLM binary.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: DOCKER COMPOSE */}
            {exportTab === 'docker' && (
              <pre className="p-3.5 bg-gray-900/90 rounded-xl text-xs font-mono text-indigo-300 overflow-x-auto border border-gray-800 leading-relaxed shadow-inner">
                {generatedDockerCompose}
              </pre>
            )}

            {/* TAB CONTENT: .ENV */}
            {exportTab === 'env' && (
              <pre className="p-3.5 bg-gray-900/90 rounded-xl text-xs font-mono text-emerald-300 overflow-x-auto border border-gray-800 leading-relaxed shadow-inner">
                {generatedEnvSnippet}
              </pre>
            )}

            {/* TAB CONTENT: STARTUP LOG VALIDATOR */}
            {exportTab === 'validator' && (
              <div className="space-y-3">
                <p className="text-[11px] text-gray-400">
                  Paste your actual vLLM startup log below (e.g. lines with <code className="text-gray-200"># GPU blocks</code> or <code className="text-gray-200">model loading took</code>) to cross-check DynoLLM’s predicted VRAM against reality:
                </p>
                <textarea
                  rows={4}
                  value={startupLogText}
                  onChange={(e) => setStartupLogText(e.target.value)}
                  placeholder="Paste log output: e.g. INFO [gpu_executor.py:84] # GPU blocks: 1542, # CPU blocks: 512..."
                  className="input font-mono text-xs w-full py-2 px-3 resize-none"
                />
                <button
                  type="button"
                  onClick={parseStartupLog}
                  className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-colors"
                >
                  Validate Against DynoLLM Prediction
                </button>

                {parsedLogResult && parsedLogResult.matched && (
                  <div className="p-3 rounded-lg bg-gray-900 border border-purple-500/30 text-xs space-y-2 font-mono">
                    <span className="text-purple-300 font-bold block">✓ Engine Startup Log Cross-Check:</span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-gray-400">Engine GPU Blocks:</span>{' '}
                        <strong className="text-white">{parsedLogResult.gpuBlocks || 'N/A'}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400">Real KV Capacity:</span>{' '}
                        <strong className="text-emerald-400">{parsedLogResult.realKvTokens?.toLocaleString() || 'N/A'} tokens</strong>
                      </div>
                      <div>
                        <span className="text-gray-400">Actual Load Time:</span>{' '}
                        <strong className="text-amber-300">{parsedLogResult.loadTime ? `${parsedLogResult.loadTime}s` : 'N/A'}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400">DynoLLM Predicted KV:</span>{' '}
                        <strong className="text-sky-300">{parsedLogResult.predictedKvTokens?.toLocaleString()} tokens</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: MULTI-NODE RAY CLUSTER */}
            {exportTab === 'ray' && (
              <div className="space-y-2">
                <p className="text-[11px] text-gray-400">
                  Bootstrap script to initialize a distributed multi-node Ray cluster across Head and Worker nodes for Tensor Parallelism ($TP &gt; 1$) and Pipeline Parallelism ($PP &gt; 1$):
                </p>
                <pre className="p-3.5 bg-gray-900/90 rounded-xl text-xs font-mono text-amber-300 overflow-x-auto border border-gray-800 leading-relaxed shadow-inner">
                  {generatedRayCluster}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: vLLM ENGINE ARCHITECTURE & EXPANDED CONFIG FLAGS */}
        <div className="lg:col-span-6 space-y-6">
          <div className="card space-y-6 border-indigo-500/30 bg-gray-900/90">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  Engine Configuration &amp; Comprehensive Flags
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Full production parameter control. Changes immediately update performance models and charts.
                </p>
              </div>

              <button
                type="button"
                onClick={resetToRecommended}
                className="text-xs text-sky-400 hover:text-sky-300 font-mono font-medium flex items-center gap-1 self-start sm:self-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Defaults
              </button>
            </div>

            {/* GROUP 1: MEMORY & KV CACHE ALLOCATION FLAGS */}
            <div className="space-y-3.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">
                  Group 1
                </span>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Memory &amp; PagedAttention Capacity Flags
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* --gpu-memory-utilization */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-300">
                      --gpu-memory-utilization
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Rec: 0.90
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Fraction of GPU memory reserved for model weights and KV cache pool.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="range"
                      min={0.50}
                      max={0.98}
                      step={0.01}
                      value={flags.gpuMemoryUtilization}
                      onChange={(e) => updateFlag('gpuMemoryUtilization', parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                    <span className="font-mono text-xs font-bold text-white w-10 text-right">
                      {flags.gpuMemoryUtilization.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* --max-model-len (Arbitrary Slider & Input) */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-300">
                      --max-model-len
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Rec: {selectedModel.recommendedContext || 4096}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Max context length. Drag slider or enter exact tokens to see concurrency tradeoff.
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <input
                      type="range"
                      min={512}
                      max={selectedModel.maxContext || 32768}
                      step={256}
                      value={flags.maxModelLen}
                      onChange={(e) => updateFlag('maxModelLen', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {[2048, 4096, 8192, 16384].map((ctx) => (
                          <button
                            key={ctx}
                            type="button"
                            onClick={() => updateFlag('maxModelLen', ctx)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                              flags.maxModelLen === ctx
                                ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold'
                                : 'bg-gray-800 border-gray-700 text-gray-400'
                            }`}
                          >
                            {(ctx / 1024).toFixed(0)}k
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        value={flags.maxModelLen}
                        onChange={(e) => updateFlag('maxModelLen', parseInt(e.target.value) || 2048)}
                        className="input font-mono text-xs py-0.5 px-1.5 w-16 text-right"
                      />
                    </div>
                  </div>
                </div>

                {/* --block-size */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-300">
                      --block-size
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Rec: 16
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    PagedAttention tokens per block. 16 minimizes memory waste; 32 optimizes cache locality.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    {[16, 32].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => updateFlag('blockSize', sz)}
                        className={`px-3 py-1 rounded text-xs font-mono transition-colors border ${
                          flags.blockSize === sz
                            ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        {sz} tokens
                      </button>
                    ))}
                  </div>
                </div>

                {/* --kv-cache-dtype */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-300">
                      --kv-cache-dtype
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Rec: auto / fp8
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Quantization for storing KV cache. Setting to <code className="text-sky-300">fp8</code> halves per-token memory footprint.
                  </p>
                  <select
                    className="select text-xs py-1 px-2 w-full font-mono"
                    value={flags.kvCacheDtype}
                    onChange={(e) => updateFlag('kvCacheDtype', e.target.value)}
                  >
                    <option value="auto">auto (FP16/BF16 default)</option>
                    <option value="fp8">fp8 (E4M3 8-bit KV Cache - Halves VRAM)</option>
                    <option value="fp8_e5m2">fp8_e5m2 (Wider dynamic range)</option>
                  </select>
                </div>

                {/* --cpu-offload-gb (Offload weights when tight) */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-300">
                      --cpu-offload-gb
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                      {flags.cpuOffloadGb > 0 ? `${flags.cpuOffloadGb} GB Offloaded` : 'Disabled (0 GB)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Offload weights to CPU RAM when VRAM is tight. Reduces GPU VRAM pressure at the cost of PCIe transfer time.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="range"
                      min={0}
                      max={48}
                      step={2}
                      value={flags.cpuOffloadGb}
                      onChange={(e) => updateFlag('cpuOffloadGb', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                    <span className="font-mono text-xs font-bold text-white w-10 text-right">
                      {flags.cpuOffloadGb} GB
                    </span>
                  </div>
                </div>

                {/* --swap-space */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-300">
                      --swap-space
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Rec: 4 GiB
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Host CPU RAM swap memory buffer for preempted sequences when VRAM exhausts.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="range"
                      min={0}
                      max={32}
                      step={2}
                      value={flags.swapSpace}
                      onChange={(e) => updateFlag('swapSpace', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                    <span className="font-mono text-xs font-bold text-white w-12 text-right">
                      {flags.swapSpace} GiB
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* GROUP 2: THROUGHPUT & SCHEDULING FLAGS */}
            <div className="space-y-3.5 pt-2 border-t border-gray-800/80">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  Group 2
                </span>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Throughput &amp; Continuous Batching Flags
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Prefix Caching Status */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-300">
                      Prefix Caching
                    </span>
                    {isV1Engine ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                        Default-ON in V1
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold">
                        Opt-in Flag
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Reuses KV blocks for repeated system prompts &amp; RAG docs for near-instant TTFT (~14ms).
                    {isV1Engine && ' Zero-overhead prefix caching is always active in V1 engine.'}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-gray-400">State:</span>
                    {isV1Engine ? (
                      <span className="text-xs font-mono font-bold text-emerald-400">✓ Built-in Active</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateFlag('enablePrefixCaching', !flags.enablePrefixCaching)}
                        className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono transition-colors border ${
                          flags.enablePrefixCaching
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400'
                        }`}
                      >
                        {flags.enablePrefixCaching ? '✓ Enabled' : '✕ Disabled'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Chunked Prefill Status */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-300">
                      Chunked Prefill
                    </span>
                    {isV1Engine ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                        Default-ON in V1
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold">
                        Opt-in Flag
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Chunks long prefills with decode steps to eliminate streaming latency spikes.
                    {isV1Engine && ' Multistep chunking is managed dynamically in V1.'}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-gray-400">State:</span>
                    {isV1Engine ? (
                      <span className="text-xs font-mono font-bold text-emerald-400">✓ Built-in Active</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateFlag('enableChunkedPrefill', !flags.enableChunkedPrefill)}
                        className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono transition-colors border ${
                          flags.enableChunkedPrefill
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400'
                        }`}
                      >
                        {flags.enableChunkedPrefill ? '✓ Enabled' : '✕ Disabled'}
                      </button>
                    )}
                  </div>
                </div>

                {/* --max-num-seqs */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-300">
                      --max-num-seqs
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Rec: 256
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Max concurrent sequences scheduled per continuous batching iteration.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="range"
                      min={16}
                      max={512}
                      step={16}
                      value={flags.maxNumSeqs}
                      onChange={(e) => updateFlag('maxNumSeqs', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <span className="font-mono text-xs font-bold text-white w-10 text-right">
                      {flags.maxNumSeqs}
                    </span>
                  </div>
                </div>

                {/* --max-num-batched-tokens */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-300">
                      --max-num-batched-tokens
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Rec: 2048
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Max tokens processed in a single batch iteration across all users.
                  </p>
                  <div className="flex items-center gap-1.5 pt-1">
                    {[512, 1024, 2048, 4096].map((tok) => (
                      <button
                        key={tok}
                        type="button"
                        onClick={() => updateFlag('maxNumBatchedTokens', tok)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors border ${
                          flags.maxNumBatchedTokens === tok
                            ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        {tok}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Upstream Caveat Notice: --max-num-partial-prefills */}
                {isV1Engine && (
                  <div className="p-3 bg-gray-950 rounded-xl border border-amber-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-gray-300">
                        --max-num-partial-prefills
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                        ⚠️ Upstream NotImplementedError
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Upstream vLLM currently raises <code className="text-amber-300 font-mono">"NotImplementedError: Concurrent Partial Prefill is not supported"</code> on current V1 builds. DynoLLM intentionally omits this flag from generated CLI commands to prevent server crashes.
                    </p>
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-gray-500">CLI Status:</span>
                      <span className="font-mono text-emerald-400 font-semibold">✓ Safely Omitted (Zero Crash)</span>
                    </div>
                  </div>
                )}

                {/* --disable-sliding-window & --disable-log-stats */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-300">
                      Window &amp; Logging Control
                    </span>
                  </div>
                  <div className="space-y-1.5 pt-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Disable Sliding Window:</span>
                      <button
                        type="button"
                        onClick={() => updateFlag('disableSlidingWindow', !flags.disableSlidingWindow)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                          flags.disableSlidingWindow
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-400'
                        }`}
                      >
                        {flags.disableSlidingWindow ? 'Disabled (Full Attn)' : 'Default Window'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Disable Log Stats:</span>
                      <button
                        type="button"
                        onClick={() => updateFlag('disableLogStats', !flags.disableLogStats)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                          flags.disableLogStats
                            ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-400'
                        }`}
                      >
                        {flags.disableLogStats ? 'Quiet Logs' : 'Verbose Stats'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* GROUP 3: DISTRIBUTED & ADVANCED HARDWARE FLAGS */}
            <div className="space-y-3.5 pt-2 border-t border-gray-800/80">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                  Group 3
                </span>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Parallelism, Speculative Decoding &amp; Scaling
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* --tensor-parallel-size */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-amber-300">
                      --tensor-parallel-size (-tp)
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Rec: {targetGpu.vramGb < 20 && selectedModel.params >= 14 ? 2 : 1}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Splits transformer weights across $N$ GPUs on the same node (NVLink required).
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    {[1, 2, 4, 8].map((tp) => (
                      <button
                        key={tp}
                        type="button"
                        onClick={() => updateFlag('tensorParallelSize', tp)}
                        className={`px-2.5 py-0.5 rounded text-xs font-mono transition-colors border ${
                          flags.tensorParallelSize === tp
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        TP={tp}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --pipeline-parallel-size */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-amber-300">
                      --pipeline-parallel-size (-pp)
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                      Multi-Node / PCIe
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Splits layers sequentially across nodes or non-NVLink GPUs.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    {[1, 2, 4].map((pp) => (
                      <button
                        key={pp}
                        type="button"
                        onClick={() => updateFlag('pipelineParallelSize', pp)}
                        className={`px-2.5 py-0.5 rounded text-xs font-mono transition-colors border ${
                          flags.pipelineParallelSize === pp
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        PP={pp}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speculative Decoding Controls with Mode Toggle */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-300">
                        Speculative Decoding
                      </span>
                      <div className="flex items-center gap-1">
                        {['draft_model', 'ngram', 'eagle'].map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => updateFlag('speculativeMode', mode)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                              flags.speculativeMode === mode
                                ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                                : 'bg-gray-800 border-gray-700 text-gray-400'
                            }`}
                          >
                            {mode === 'draft_model' ? 'Draft Model' : mode === 'ngram' ? 'N-gram (0 VRAM)' : 'EAGLE/Medusa'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateFlag('enableSpeculative', !flags.enableSpeculative)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors border ${
                        flags.enableSpeculative
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400'
                      }`}
                    >
                      {flags.enableSpeculative ? '✓ Active' : 'Off'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {flags.speculativeMode === 'ngram'
                      ? 'N-gram prompt lookup uses repetition in prompt/code for speculative speedup with ZERO extra VRAM.'
                      : flags.speculativeMode === 'eagle'
                      ? 'EAGLE / Medusa head speculation adds minimal overhead (~0.45 GB) with up to 1.8x speedup.'
                      : 'Draft model speculation requires secondary model loaded into VRAM (+2.2 GB) and high acceptance rate.'}
                  </p>
                  {flags.enableSpeculative && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {flags.speculativeMode === 'draft_model' && (
                        <input
                          type="text"
                          value={flags.speculativeModel}
                          onChange={(e) => updateFlag('speculativeModel', e.target.value)}
                          placeholder="e.g. meta-llama/Llama-3.2-1B-Instruct"
                          className="input font-mono text-[11px] py-1 px-2 w-full"
                        />
                      )}
                      <div className="flex items-center justify-between text-xs sm:col-span-1">
                        <span className="text-gray-400 text-[11px]">Draft Tokens (K):</span>
                        <div className="flex items-center gap-1">
                          {[3, 5, 7].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => updateFlag('numSpeculativeTokens', num)}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                                flags.numSpeculativeTokens === num
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                                  : 'bg-gray-800 border-gray-700 text-gray-400'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* CUDA Graphs Mode */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-gray-300">
                      --enforce-eager
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-semibold border border-gray-700">
                      Rec: False
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Disables CUDA graphs. Graphs are strongly recommended for low latency.
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-gray-400">CUDA Graphs</span>
                    <button
                      type="button"
                      onClick={() => updateFlag('enforceEager', !flags.enforceEager)}
                      className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono transition-colors border ${
                        flags.enforceEager
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400'
                      }`}
                    >
                      {flags.enforceEager ? 'Eager (No Graphs)' : 'Graphs Active'}
                    </button>
                  </div>
                </div>

                {/* Production Security & Alias: --api-key & --served-model-name */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-gray-300">
                      Endpoint Security &amp; Alias
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Auth Active
                    </span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <input
                        type="text"
                        value={flags.apiKey}
                        onChange={(e) => updateFlag('apiKey', e.target.value)}
                        placeholder="vLLM API Key (Auth Token)"
                        className="input font-mono text-[11px] py-1 px-2 w-full"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Network className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <input
                        type="text"
                        value={flags.servedModelName}
                        onChange={(e) => updateFlag('servedModelName', e.target.value)}
                        placeholder="Custom served model name alias (optional)"
                        className="input font-mono text-[11px] py-1 px-2 w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* GROUP 4: LORA MULTI-ADAPTER SERVING FLAGS */}
            <div className="space-y-3.5 pt-2 border-t border-gray-800/80">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-pink-500/10 text-pink-400 border border-pink-500/20 font-mono">
                  Group 4
                </span>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  LoRA Multi-Adapter Serving
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* --enable-lora */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-pink-300">
                      --enable-lora
                    </span>
                    <button
                      type="button"
                      onClick={() => updateFlag('enableLora', !flags.enableLora)}
                      className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono transition-colors border ${
                        flags.enableLora
                          ? 'bg-pink-500/20 border-pink-500 text-pink-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400'
                      }`}
                    >
                      {flags.enableLora ? '✓ Active' : 'Off'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Enables dynamic multi-LoRA adapter serving on top of a single shared base model.
                  </p>
                </div>

                {/* --max-loras */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-pink-300">
                      --max-loras
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
                      Pool: {flags.maxLoras}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Max concurrent LoRA adapters kept warm in GPU VRAM simultaneously.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    {[1, 2, 4, 8].map((num) => (
                      <button
                        key={num}
                        type="button"
                        disabled={!flags.enableLora}
                        onClick={() => updateFlag('maxLoras', num)}
                        className={`px-2.5 py-0.5 rounded text-xs font-mono transition-colors border ${
                          flags.maxLoras === num
                            ? 'bg-pink-500/20 border-pink-500 text-pink-300 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                        } ${!flags.enableLora ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --max-lora-rank */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-pink-300">
                      --max-lora-rank
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                      Rank {flags.maxLoraRank}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Maximum adapter rank r supported in dynamic batched LoRA kernels.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    {[8, 16, 32, 64].map((rank) => (
                      <button
                        key={rank}
                        type="button"
                        disabled={!flags.enableLora}
                        onClick={() => updateFlag('maxLoraRank', rank)}
                        className={`px-2.5 py-0.5 rounded text-xs font-mono transition-colors border ${
                          flags.maxLoraRank === rank
                            ? 'bg-pink-500/20 border-pink-500 text-pink-300 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                        } ${!flags.enableLora ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        r={rank}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --lora-modules */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-pink-300">
                      --lora-modules
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      name=path
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Preload specific LoRA weights at startup: name=path
                  </p>
                  <input
                    type="text"
                    disabled={!flags.enableLora}
                    value={flags.loraModules}
                    onChange={(e) => updateFlag('loraModules', e.target.value)}
                    placeholder="e.g. sql=predibase/magicoder-sql"
                    className={`input font-mono text-[11px] py-1 px-2 w-full ${!flags.enableLora ? 'opacity-40 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>
            </div>

            {/* GROUP 5: STRUCTURED OUTPUTS & TOOL CALLING */}
            <div className="space-y-3.5 pt-2 border-t border-gray-800/80">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20 font-mono">
                  Group 5
                </span>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Structured Outputs &amp; Tool Calling Flags
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* --guided-decoding-backend */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-violet-300">
                      --guided-decoding-backend
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Rec: xgrammar
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Grammar &amp; JSON schema engine. xgrammar provides up to 10x faster mask compile.
                  </p>
                  <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                    {['xgrammar', 'outlines', 'lm-format-enforcer'].map((backend) => (
                      <button
                        key={backend}
                        type="button"
                        onClick={() => updateFlag('guidedDecodingBackend', backend)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors border ${
                          flags.guidedDecodingBackend === backend
                            ? 'bg-violet-500/20 border-violet-500 text-violet-300 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        {backend}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --tool-call-parser */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-violet-300">
                      --tool-call-parser
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                      {flags.toolCallParser}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Parser mapping streaming tokens to OpenAI-compatible tool calls.
                  </p>
                  <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                    {['llama3_json', 'mistral', 'hermes', 'none'].map((parser) => (
                      <button
                        key={parser}
                        type="button"
                        onClick={() => updateFlag('toolCallParser', parser)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors border ${
                          flags.toolCallParser === parser
                            ? 'bg-violet-500/20 border-violet-500 text-violet-300 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        {parser}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --enable-auto-tool-choice */}
                <div className="p-3 bg-gray-950 rounded-xl border border-gray-800 space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-violet-300">
                      --enable-auto-tool-choice
                    </span>
                    <button
                      type="button"
                      onClick={() => updateFlag('enableAutoToolChoice', !flags.enableAutoToolChoice)}
                      className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono transition-colors border ${
                        flags.enableAutoToolChoice
                          ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400'
                      }`}
                    >
                      {flags.enableAutoToolChoice ? '✓ Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Allows model to dynamically select between function invocation and freeform responses.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
