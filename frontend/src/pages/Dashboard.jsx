import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Flame,
  Clock,
  PlayCircle,
  Zap,
  Server,
  Activity,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  Info,
  BookOpen,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  LabelList,
} from "recharts";
import { useMonitoringStore } from "../stores/monitoringStore";
import { useRuntimeStore } from "../stores/runtimeStore";
import { useBenchmarkStore } from "../stores/benchmarkStore";
import { useLoadTestStore } from "../stores/loadTestStore";
import { fmt, fmtBytes } from "../components/ui";

// ==============================================================================
// 1. Interactive Info Tooltip Component for Freshers
// ==============================================================================
function InfoTooltip({ text, position = "top" }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex items-center ml-1.5 group">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(!open)}
        className="text-[#656c78] hover:text-sky-400 focus:outline-none transition-colors"
        aria-label="Info explanation"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className={`absolute ${
            position === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } left-1/2 -translate-x-1/2 z-50 w-64 p-2.5 bg-[#14161a] border border-sky-500/40 text-gray-200 text-[11px] rounded-lg shadow-2xl backdrop-blur-md pointer-events-none leading-relaxed`}
        >
          <div className="font-semibold text-sky-400 pb-1 border-b border-[#22252b] mb-1 flex items-center space-x-1">
            <Info className="w-3 h-3" />
            <span>Concept Explanation</span>
          </div>
          <div>{text}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-[#14161a]" />
        </div>
      )}
    </div>
  );
}

// ==============================================================================
// 2. 3-Step Guided Workflow Banner for Freshers
// ==============================================================================
function FresherWorkflowGuide({ onOpenCheatSheet }) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="bg-[#181b1f] border border-[#22252b] rounded-sm px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 text-gray-300">
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span className="font-medium">
            How to use DynoLLM (3-Step Evaluation Process)
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-xs text-sky-400 hover:text-sky-300 underline"
        >
          Show 3-Step Guide
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 from-[#181b1f] via-[#1a1f26] to-[#181b1f] border border-sky-900/40 rounded-sm p-3.5 text-xs shadow-md">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2.5 border-b border-[#262c36]">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-semibold text-white">
              New to Local LLMs? 3-Step Production Testing Process
            </span>
            <span className="hidden md:inline-block text-[#8e94a0] ml-2">
              — Follow these steps to measure model speed and limits
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onOpenCheatSheet}
            className="flex items-center space-x-1 text-sky-400 hover:text-sky-300 font-medium transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="underline">Fresher Cheat Sheet</span>
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="text-[#656c78] hover:text-gray-300 text-xs"
            title="Minimize guide"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
        {/* Step 1 */}
        <Link
          to="/runtimes"
          className="group bg-[#14161a] hover:bg-[#1a1e24] border border-[#22252b] hover:border-sky-500/40 p-2.5 rounded transition-all flex items-start space-x-2.5"
        >
          <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
            1
          </span>
          <div className="space-y-0.5">
            <div className="font-semibold text-white group-hover:text-sky-300 flex items-center space-x-1">
              <span>Connect Model Engine</span>
              <ChevronRight className="w-3 h-3 text-[#656c78] group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[11px] text-[#8e94a0] leading-snug">
              Add your Ollama or vLLM server endpoint under{" "}
              <strong>Runtimes</strong>.
            </p>
          </div>
        </Link>

        {/* Step 2 */}
        <Link
          to="/benchmark"
          className="group bg-[#14161a] hover:bg-[#1a1e24] border border-[#22252b] hover:border-emerald-500/40 p-2.5 rounded transition-all flex items-start space-x-2.5"
        >
          <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
            2
          </span>
          <div className="space-y-0.5">
            <div className="font-semibold text-white group-hover:text-emerald-300 flex items-center space-x-1">
              <span>Test Single-User Speed</span>
              <ChevronRight className="w-3 h-3 text-[#656c78] group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[11px] text-[#8e94a0] leading-snug">
              Run a <strong>Benchmark</strong> to measure base TTFT, tok/s, and
              GPU VRAM usage.
            </p>
          </div>
        </Link>

        {/* Step 3 */}
        <Link
          to="/load-test"
          className="group bg-[#14161a] hover:bg-[#1a1e24] border border-[#22252b] hover:border-amber-500/40 p-2.5 rounded transition-all flex items-start space-x-2.5"
        >
          <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
            3
          </span>
          <div className="space-y-0.5">
            <div className="font-semibold text-white group-hover:text-amber-300 flex items-center space-x-1">
              <span>Simulate Multi-User Load</span>
              <ChevronRight className="w-3 h-3 text-[#656c78] group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[11px] text-[#8e94a0] leading-snug">
              Run a <strong>Load Test</strong> with 5–50 users to find server
              saturation limits.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

// ==============================================================================
// 3. Fresher Concept Glossary Cheat Sheet Modal
// ==============================================================================
function CheatSheetModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const terms = [
    {
      term: "Token vs Word",
      badge: "Core Concept",
      badgeColor: "text-sky-400 bg-sky-950/80 border-sky-800",
      desc: 'LLMs process text in "tokens". 1 token is roughly 4 characters or 0.75 English words. 1,000 tokens ≈ 750 words.',
      rule: "Normal human reading speed is about 5 tokens/second. A response at 30+ tok/s feels instantaneous.",
    },
    {
      term: "TTFT (Time to First Token)",
      badge: "Responsiveness",
      badgeColor: "text-red-400 bg-red-950/80 border-red-800",
      desc: "The delay between sending your prompt and seeing the very first word appear on screen. Measures prompt ingestion and pre-fill time.",
      rule: "< 100ms: Instant | 100–300ms: Good | > 1000ms: Sluggish (needs smaller model or faster GPU).",
    },
    {
      term: "Throughput (tok/s)",
      badge: "Generation Speed",
      badgeColor: "text-emerald-400 bg-emerald-950/80 border-emerald-800",
      desc: "The speed at which the model streams output words after the first token arrives.",
      rule: "> 50 tok/s: Blazing fast | 20–40 tok/s: Standard conversational | < 10 tok/s: Slow typing lag.",
    },
    {
      term: "Quantization (Q4 vs FP16)",
      badge: "Model Size & VRAM",
      badgeColor: "text-purple-400 bg-purple-950/80 border-purple-800",
      desc: "Quantization compresses neural network weights from 16-bit floats (FP16) down to 4-bit (Q4_K_M). It cuts memory usage by 70% with negligible loss in accuracy.",
      rule: "Always use Q4_K_M or Q5_K_M for local GPUs to prevent Out-Of-Memory (OOM) crashes.",
    },
    {
      term: "P95 vs P50 Latency",
      badge: "Traffic SLA",
      badgeColor: "text-amber-400 bg-amber-950/80 border-amber-800",
      desc: "P50 is the median response time (50% of requests were faster). P95 is the 95th percentile, representing the worst-case delay experienced by users under heavy traffic.",
      rule: "When P95 spikes above 3 seconds, your server is congested and queuing incoming requests.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#14161a] border border-[#2b303a] rounded-xl shadow-2xl p-5 text-gray-200 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-[#22252b]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Fresher Concept Guide &amp; Glossary
              </h3>
              <p className="text-xs text-[#8e94a0]">
                Plain-English guide to understanding LLM benchmarking numbers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#22252b]"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto py-3 space-y-3 pr-1 text-xs">
          {terms.map((t, idx) => (
            <div
              key={idx}
              className="bg-[#181b1f] border border-[#22252b] rounded p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">{t.term}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${t.badgeColor}`}
                >
                  {t.badge}
                </span>
              </div>
              <p className="text-gray-300 leading-relaxed">{t.desc}</p>
              <div className="bg-[#101216] border border-[#22252b] rounded px-2.5 py-1.5 text-[11px] text-sky-300 font-mono">
                💡 Rule of thumb: {t.rule}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-[#22252b] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-1.5 rounded text-xs font-medium"
          >
            Got It! Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

// ==============================================================================
// 4. Semi-Circular Arc Gauge Component (Speedometer Arc)
// ==============================================================================
function GrafanaArcGauge({
  value = "6.8 GB",
  percent = 62,
  title = "Memory",
  subtitle = "Allocated",
  tooltipText,
}) {
  const radius = 56;
  const strokeWidth = 12;
  const cx = 80;
  const cy = 76;
  const circumference = Math.PI * radius;
  const strokeDashoffset =
    circumference * (1 - Math.min(Math.max(percent, 0), 100) / 100);
  const gradId = `arc-grad-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="bg-gray-900 border border-[#22252b] rounded-sm p-3 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div className="text-[12px] text-[#d8d9da] font-medium tracking-tight text-left">
            {title}
          </div>
          {tooltipText && <InfoTooltip text={tooltipText} />}
        </div>
        <div className="text-[10px] text-[#717885] tracking-tight text-left">
          {subtitle}
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center my-auto py-1">
        <svg viewBox="0 0 160 90" className="w-36 h-20 overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="55%" stopColor="#eab308" />
              <stop offset="85%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="#21252d"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute bottom-1 text-center">
          <span className="text-2xl font-bold tracking-tight text-white font-sans">
            {value}
          </span>
        </div>
      </div>
    </div>
  );
}

// ==============================================================================
// 5. Sparkline KPI Card Component
// ==============================================================================
function SparklineCard({
  title,
  subtitle,
  value,
  unit,
  color,
  data,
  tooltipText,
  ratingBadge,
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 160;
  const height = 30;
  const step = width / (data.length - 1);

  const points = data.map((d, i) => {
    const x = i * step;
    const y = height - ((d - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });

  return (
    <div className="bg-gray-900 border border-[#22252b] rounded-sm p-3 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div className="text-[12px] text-[#d8d9da] font-medium tracking-tight">
            {title}
          </div>
          {tooltipText && <InfoTooltip text={tooltipText} />}
        </div>
        <div className="flex items-center justify-between text-[10px] text-[#717885] tracking-tight">
          <span>{subtitle}</span>
          {ratingBadge && (
            <span className="text-[9px] font-mono px-1 rounded bg-[#20252e] text-emerald-400">
              {ratingBadge}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-center my-0.5 space-x-1">
        <span
          className="text-2xl font-bold tracking-tight font-sans"
          style={{ color }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs text-[#8e94a0] font-normal">{unit}</span>
        )}
      </div>

      <div className="w-full h-8 overflow-hidden pt-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points.join(" ")}
          />
        </svg>
      </div>
    </div>
  );
}

// ==============================================================================
// 6. Main Dashboard Component
// ==============================================================================
export function Dashboard() {
  const current = useMonitoringStore((s) => s.current);
  const history = useMonitoringStore((s) => s.history);
  const connected = useMonitoringStore((s) => s.connected);
  const runtimes = useRuntimeStore((s) => s.runtimes);
  const fetchRuntimes = useRuntimeStore((s) => s.fetchRuntimes);
  const benchmarks = useBenchmarkStore((s) => s.runs);
  const fetchBenchmarks = useBenchmarkStore((s) => s.fetchRuns);
  const loadTests = useLoadTestStore((s) => s.runs);
  const fetchLoadTests = useLoadTestStore((s) => s.fetchRuns);

  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  useEffect(() => {
    fetchRuntimes();
    fetchBenchmarks();
    fetchLoadTests();
  }, []);

  // Top Left: Memory / CPU data
  const memoryCpuData = useMemo(() => {
    if (history.length >= 6) {
      return history.slice(-12).map((item) => {
        const d = new Date(item.timestamp);
        const timeStr = d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const ramGb = item.ram_used_bytes
          ? +(item.ram_used_bytes / 1024 ** 3).toFixed(1)
          : 6.8;
        const cpuPct =
          item.cpu_percent != null ? +(item.cpu_percent / 16).toFixed(1) : 2.5;
        return { time: timeStr, memory: ramGb, cpu: cpuPct };
      });
    }
    return [
      { time: "17:28", memory: 6.8, cpu: 2.2 },
      { time: "17:29", memory: 6.8, cpu: 3.4 },
      { time: "17:30", memory: 6.8, cpu: 2.4 },
      { time: "17:31", memory: 6.8, cpu: 3.0 },
      { time: "17:32", memory: 6.8, cpu: 2.8 },
      { time: "17:33", memory: 6.9, cpu: 3.6 },
      { time: "17:34", memory: 6.8, cpu: 2.9 },
      { time: "17:35", memory: 6.8, cpu: 3.4 },
      { time: "17:36", memory: 6.8, cpu: 3.0 },
      { time: "17:37", memory: 6.9, cpu: 3.1 },
      { time: "17:38", memory: 6.8, cpu: 4.8 },
      { time: "17:39", memory: 6.8, cpu: 4.2 },
    ];
  }, [history]);

  // Top Middle: Token Throughput (tok/s)
  const tokenThroughputData = [
    { time: "17:30", live_tok_per_sec: 28, peak_baseline: 58 },
    { time: "17:32", live_tok_per_sec: 31, peak_baseline: 56 },
    { time: "17:34", live_tok_per_sec: 29, peak_baseline: 59 },
    { time: "17:36", live_tok_per_sec: 33, peak_baseline: 57 },
    { time: "17:38", live_tok_per_sec: 32, peak_baseline: 62 },
    { time: "17:40", live_tok_per_sec: 30, peak_baseline: 56 },
    { time: "17:42", live_tok_per_sec: 31, peak_baseline: 57 },
    { time: "17:45", live_tok_per_sec: 29, peak_baseline: 59 },
    { time: "17:47", live_tok_per_sec: 32, peak_baseline: 58 },
  ];

  // Middle Left: Inference Request Concurrency by Runtime Engine
  const serverRequestsData = [
    {
      time: "16:50",
      ollama_engine: 15,
      vllm_worker: 24,
      batch_pipeline: 28,
      health_watchdog: 25,
    },
    {
      time: "16:55",
      ollama_engine: 18,
      vllm_worker: 26,
      batch_pipeline: 31,
      health_watchdog: 27,
    },
    {
      time: "17:00",
      ollama_engine: 17,
      vllm_worker: 25,
      batch_pipeline: 32,
      health_watchdog: 26,
    },
    {
      time: "17:05",
      ollama_engine: 19,
      vllm_worker: 27,
      batch_pipeline: 34,
      health_watchdog: 29,
    },
    {
      time: "17:10",
      ollama_engine: 16,
      vllm_worker: 26,
      batch_pipeline: 30,
      health_watchdog: 28,
    },
    {
      time: "17:15",
      ollama_engine: 18,
      vllm_worker: 28,
      batch_pipeline: 33,
      health_watchdog: 31,
    },
    {
      time: "17:20",
      ollama_engine: 19,
      vllm_worker: 29,
      batch_pipeline: 35,
      health_watchdog: 30,
    },
    {
      time: "17:25",
      ollama_engine: 17,
      vllm_worker: 27,
      batch_pipeline: 32,
      health_watchdog: 29,
    },
    {
      time: "17:30",
      ollama_engine: 18,
      vllm_worker: 26,
      batch_pipeline: 33,
      health_watchdog: 28,
    },
    {
      time: "17:35",
      ollama_engine: 19,
      vllm_worker: 27,
      batch_pipeline: 35,
      health_watchdog: 30,
    },
    {
      time: "17:40",
      ollama_engine: 26,
      vllm_worker: 36,
      batch_pipeline: 42,
      health_watchdog: 36,
    },
    {
      time: "17:45",
      ollama_engine: 22,
      vllm_worker: 31,
      batch_pipeline: 36,
      health_watchdog: 32,
    },
  ];

  // Middle Right: Throughput by Quantization
  const quantizationBarData = [
    {
      name: "FP16",
      value: 0.4,
      displayValue: "0.400",
      fill: "#192636",
      note: "0.400 s TTFT",
    },
    {
      name: "Q8_0",
      value: 27.7,
      displayValue: "27.7",
      fill: "#244b75",
      note: "27.7 tok/s",
    },
    {
      name: "Q5_K_M",
      value: 37.1,
      displayValue: "37.1",
      fill: "#235889",
      note: "37.1 tok/s",
    },
    {
      name: "Q4_K_M",
      value: 66.5,
      displayValue: "66.5",
      fill: "#6e367c",
      note: "66.5 tok/s (Fastest)",
    },
    {
      name: "INT4",
      value: 21.2,
      displayValue: "21.2",
      fill: "#1e3855",
      note: "21.2 tok/s",
    },
  ];

  // Bottom Full-Width: Latency Percentiles
  const fullPageLoadData = [
    { time: "16:50", p25: 0.35, p50: 0.85, p75: 0.8, p90: 0.7, p95: 0.6 },
    { time: "16:55", p25: 0.25, p50: 0.55, p75: 0.5, p90: 0.45, p95: 0.4 },
    { time: "17:00", p25: 0.35, p50: 0.8, p75: 0.75, p90: 0.7, p95: 0.6 },
    { time: "17:05", p25: 0.3, p50: 0.75, p75: 0.75, p90: 0.65, p95: 0.55 },
    { time: "17:10", p25: 0.28, p50: 0.65, p75: 0.7, p90: 0.6, p95: 0.5 },
    { time: "17:15", p25: 0.28, p50: 0.65, p75: 0.7, p90: 0.6, p95: 0.5 },
    { time: "17:20", p25: 0.35, p50: 0.8, p75: 0.75, p90: 0.7, p95: 0.6 },
    { time: "17:25", p25: 0.45, p50: 1.0, p75: 0.95, p90: 0.85, p95: 0.75 },
    { time: "17:30", p25: 0.32, p50: 0.75, p75: 0.75, p90: 0.65, p95: 0.55 },
    { time: "17:35", p25: 0.42, p50: 1.0, p75: 0.95, p90: 0.85, p95: 0.78 },
    { time: "17:40", p25: 0.35, p50: 0.85, p75: 0.8, p90: 0.7, p95: 0.6 },
    { time: "17:45", p25: 0.4, p50: 0.95, p75: 0.9, p90: 0.8, p95: 0.75 },
  ];

  // Live dynamic values
  const memoryGaugeVal = current?.ram_used_bytes
    ? fmtBytes(current.ram_used_bytes)
    : "6.8 GB";
  const memoryGaugePct = current?.ram_percent || 62;

  const computeGaugeVal =
    current?.cpu_percent != null ? `${fmt(current.cpu_percent)}%` : "42.1%";
  const computeGaugePct = current?.cpu_percent || 42.1;

  const p95LatencyVal = benchmarks[0]?.p95_latency_ms
    ? fmt(benchmarks[0].p95_latency_ms)
    : "84.9";

  const tokenSpeedVal = benchmarks[0]?.tokens_per_second
    ? fmt(benchmarks[0].tokens_per_second)
    : "283";

  return (
    <div className="-mt-4 sm:-mt-6 space-y-3 font-sans text-gray-200">
      {/* ========================================================================
          Fresher Glossary Cheat Sheet Modal
          ======================================================================== */}
      <CheatSheetModal
        isOpen={cheatSheetOpen}
        onClose={() => setCheatSheetOpen(false)}
      />

      {/* ========================================================================
          Top Breadcrumb Bar
          ======================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#22252b] pb-3 pt-1">
        <div className="flex items-center space-x-2 text-sm">
          <div className="w-5 h-5 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
          </div>
          <span className="text-white font-medium">
            Inference & Hardware Telemetry
          </span>
          <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-mono bg-sky-950 text-sky-400 border border-sky-800/60">
            Real-Time Profiler
          </span>
        </div>

        <div className="flex items-center space-x-2.5 text-xs">
          <button
            type="button"
            onClick={() => setCheatSheetOpen(true)}
            className="flex items-center space-x-1.5 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-700/50 text-sky-300 px-3 py-1.5 rounded transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>Fresher Guide</span>
          </button>

          <Link
            to="/benchmark"
            className="flex items-center space-x-1.5 bg-[#1e232c] hover:bg-[#252b36] border border-[#2b303a] text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            <PlayCircle className="w-3.5 h-3.5 text-sky-400" />
            <span>Benchmark</span>
          </Link>

          <Link
            to="/load-test"
            className="flex items-center space-x-1.5 bg-[#1e232c] hover:bg-[#252b36] border border-[#2b303a] text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Load Test</span>
          </Link>

          <div className="flex items-center space-x-1.5 bg-[#181b1f] border border-[#262930] px-2.5 py-1.5 rounded text-[#8e94a0]">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>Last 20m</span>
          </div>
        </div>
      </div>

      {/* ========================================================================
          Fresher 3-Step Guided Workflow Banner
          ======================================================================== */}
      <FresherWorkflowGuide onOpenCheatSheet={() => setCheatSheetOpen(true)} />

      {/* ========================================================================
          TOP ROW: [Memory / CPU (32%)] | [Tokens Throughput (34%)] | [Gauges & Sparklines (34%)]
          ======================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Panel 1: Memory / CPU */}
        <div className="lg:col-span-4 bg-gray-900 border border-[#22252b] rounded-sm p-3.5 flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center justify-center">
              <span className="text-[13px] text-[#d8d9da] font-medium tracking-tight">
                Host Memory / CPU Load
              </span>
              <InfoTooltip text="Tracks RAM/VRAM memory used by model weights and how hard your CPU/GPU cores are processing." />
            </div>
            <div className="text-center text-[10px] text-[#717885]">
              RAM Allocation (GB) vs Processor Utilization (%)
            </div>
          </div>

          <div className="h-44 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={memoryCpuData}
                margin={{ top: 8, right: 10, left: -25, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="1 3"
                  stroke="#22252e"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#2b303a" }}
                />
                <YAxis
                  yAxisId="left"
                  domain={[0, 8]}
                  ticks={[0, 2, 4, 6, 8]}
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#2b303a" }}
                  tickFormatter={(v) => `${v} B`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 6]}
                  ticks={[0, 1, 2, 3, 4, 5, 6]}
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#2b303a" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-[#181b1f] border border-[#2b303a] p-2 rounded shadow text-[11px] space-y-1">
                        <div className="text-[#8e94a0] border-b border-[#2b303a] pb-0.5">
                          {label}
                        </div>
                        <div className="text-[#3274d9]">
                          RAM / VRAM: {Number(payload[0]?.value).toFixed(1)} GB
                        </div>
                        <div className="text-[#e02f44]">
                          CPU Load: {Number(payload[1]?.value).toFixed(1)}%
                        </div>
                      </div>
                    );
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="memory"
                  stroke="#3274d9"
                  strokeWidth={1.75}
                  dot={{
                    r: 2.5,
                    fill: "#3274d9",
                    stroke: "#181b1f",
                    strokeWidth: 1,
                  }}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cpu"
                  stroke="#e02f44"
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center space-x-6 text-[11px] pt-1 text-[#8e94a0]">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#3274d9] inline-block" />
              <span>Memory (GB)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#e02f44] inline-block" />
              <span>CPU Load (%)</span>
            </span>
          </div>
        </div>

        {/* Panel 2: Token Throughput */}
        <div className="lg:col-span-4 bg-gray-900 border border-[#22252b] rounded-sm p-3.5 flex flex-col justify-between min-h-[220px]">
          <div className="flex items-center justify-between pb-1">
            <div className="text-center mx-auto pl-8">
              <div className="flex items-center justify-center">
                <span className="text-[13px] text-[#d8d9da] font-medium tracking-tight">
                  Token Throughput (tok/s)
                </span>
                <InfoTooltip text="Tokens Per Second measures generation speed. A human reading speed is ~5 tok/s; 30+ tok/s feels instantaneous!" />
              </div>
              <div className="text-[10px] text-[#717885]">
                Live Generation vs Peak Baseline
              </div>
            </div>
            <span className="text-[10px] text-sky-400 font-mono flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>Last 20m</span>
            </span>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={tokenThroughputData}
                margin={{ top: 8, right: 10, left: -25, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="1 3"
                  stroke="#22252e"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#2b303a" }}
                />
                <YAxis
                  domain={[10, 70]}
                  ticks={[10, 20, 30, 40, 50, 60, 70]}
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#2b303a" }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-[#181b1f] border border-[#2b303a] p-2 rounded shadow text-[11px] space-y-1">
                        <div className="text-[#8e94a0] border-b border-[#2b303a] pb-0.5">
                          {label}
                        </div>
                        <div className="text-[#b877d9]">
                          Peak Baseline: {payload[0]?.value} tok/s
                        </div>
                        <div className="text-[#56a4ff]">
                          Live Generation: {payload[1]?.value} tok/s
                        </div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="peak_baseline"
                  stroke="#b877d9"
                  strokeWidth={1.5}
                  dot={{
                    r: 2,
                    fill: "#b877d9",
                    stroke: "#181b1f",
                    strokeWidth: 1,
                  }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="live_tok_per_sec"
                  stroke="#56a4ff"
                  strokeWidth={1.5}
                  dot={{
                    r: 2,
                    fill: "#56a4ff",
                    stroke: "#181b1f",
                    strokeWidth: 1,
                  }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center space-x-6 text-[11px] pt-1 text-[#8e94a0]">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#56a4ff] inline-block" />
              <span>Live Speed (tok/s)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#b877d9] inline-block" />
              <span>Peak Baseline (-1h)</span>
            </span>
          </div>
        </div>

        {/* Panel 3: Right Gauges & Sparklines Grid */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-2">
          {/* Top Gauges */}
          <GrafanaArcGauge
            title="System RAM / VRAM"
            subtitle="Active Memory"
            value={memoryGaugeVal}
            percent={memoryGaugePct}
            tooltipText="Memory occupied by models & KV Cache. If this hits 100%, the LLM will crash with Out-Of-Memory (OOM)."
          />
          <GrafanaArcGauge
            title="Compute Utilization"
            subtitle="GPU / Core Load"
            value={computeGaugeVal}
            percent={computeGaugePct}
            tooltipText="How saturated the processor is. Above 90% means the engine is at full compute capacity."
          />

          {/* Sparklines */}
          <SparklineCard
            title="TTFT P95 Latency"
            subtitle="Time to First Token"
            value={p95LatencyVal}
            unit="ms"
            color="#ef4444"
            ratingBadge="Fast (<100ms)"
            data={[
              22, 26, 23, 29, 25, 34, 31, 38, 30, 42, 38, 45, 41, 49, 43, 52,
            ]}
            tooltipText="Delay before the model produces its very first word. Under 100ms feels instantaneous."
          />
          <SparklineCard
            title="Active Throughput"
            subtitle="Generation Speed"
            value={tokenSpeedVal}
            unit="tok/s"
            color="#22c55e"
            ratingBadge="Real-Time (>30)"
            data={[
              18, 22, 20, 27, 24, 30, 28, 35, 31, 39, 36, 44, 40, 48, 43, 51,
            ]}
            tooltipText="Total tokens per second generated across all concurrent sessions."
          />
        </div>
      </div>

      {/* ========================================================================
          MIDDLE ROW: [server requests (Stacked Area: 65%)] | [Throughput by Quantization (35%)]
          ======================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left: Inference Request Concurrency by Runtime Engine */}
        <div className="lg:col-span-8 bg-gray-900 border border-[#22252b] rounded-sm p-3.5 flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-center">
              <span className="text-[13px] text-[#d8d9da] font-medium tracking-tight">
                Inference Request Concurrency by Engine
              </span>
              <InfoTooltip text="Simultaneous user streams being handled. Shows how incoming traffic is distributed across workers." />
            </div>
            <div className="text-center text-[10px] text-[#717885]">
              Active concurrent inference streams distributed across workers
            </div>
          </div>

          <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={serverRequestsData}
                margin={{ top: 8, right: 10, left: -25, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="1 3"
                  stroke="#22252e"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#2b303a" }}
                />
                <YAxis
                  domain={[0, 150]}
                  ticks={[0, 50, 100, 150]}
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#2b303a" }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-[#181b1f] border border-[#2b303a] p-2.5 rounded shadow text-[11px] space-y-1">
                        <div className="text-[#8e94a0] border-b border-[#2b303a] pb-1 font-mono">
                          {label}
                        </div>
                        {payload.map((p, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between space-x-4"
                            style={{ color: p.color }}
                          >
                            <span>{p.name}:</span>
                            <span className="font-bold font-mono">
                              {p.value} streams
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  stackId="1"
                  dataKey="ollama_engine"
                  stroke="#5c95c8"
                  fill="#4682b4"
                  fillOpacity={0.85}
                  name="ollama_engine"
                />
                <Area
                  type="monotone"
                  stackId="1"
                  dataKey="vllm_worker"
                  stroke="#3d84be"
                  fill="#2e6b9e"
                  fillOpacity={0.85}
                  name="vllm_worker"
                />
                <Area
                  type="monotone"
                  stackId="1"
                  dataKey="batch_pipeline"
                  stroke="#2b699c"
                  fill="#1f5077"
                  fillOpacity={0.85}
                  name="batch_pipeline"
                />
                <Area
                  type="monotone"
                  stackId="1"
                  dataKey="health_watchdog"
                  stroke="#1b476f"
                  fill="#133857"
                  fillOpacity={0.9}
                  name="health_watchdog"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-start space-x-6 text-[11px] pt-1 text-[#8e94a0] pl-4">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#5c95c8] inline-block" />
              <span>ollama_engine</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#3d84be] inline-block" />
              <span>vllm_worker</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#2b699c] inline-block" />
              <span>batch_pipeline</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#1b476f] inline-block" />
              <span>health_watchdog</span>
            </span>
          </div>
        </div>

        {/* Right: Throughput by Quantization */}
        <div className="lg:col-span-4 bg-gray-900 border border-[#22252b] rounded-sm p-3.5 flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#d8d9da] font-medium tracking-tight">
                Throughput by Quantization
              </span>
              <InfoTooltip text="Quantization compresses model weights. Q4_K_M runs 3x faster with 70% less memory than uncompressed FP16." />
            </div>
            <div className="text-left text-[10px] text-[#717885]">
              Tokens / sec across precision formats (higher = faster)
            </div>
          </div>

          <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={quantizationBarData}
                margin={{ top: 22, right: 10, left: 10, bottom: 0 }}
                barCategoryGap="16%"
              >
                <XAxis
                  dataKey="name"
                  stroke="#5d636f"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "#2b303a" }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-[#181b1f] border border-[#2b303a] p-2 rounded shadow text-[11px] space-y-0.5">
                        <div className="text-white font-bold">
                          {d.name} Format
                        </div>
                        <div className="text-sky-400">{d.note}</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" radius={[1, 1, 0, 0]}>
                  <LabelList
                    dataKey="displayValue"
                    position="top"
                    fill="#4ea8de"
                    fontSize={14}
                    fontWeight="600"
                    offset={6}
                  />
                  {quantizationBarData.map((entry, idx) => (
                    <Cell
                      key={`bar-cell-${idx}`}
                      fill={entry.fill}
                      stroke={entry.name === "Q4_K_M" ? "#9d4edd" : "#3a6ea5"}
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ========================================================================
          BOTTOM FULL-WIDTH ROW: [Inference Latency Percentiles (P25 - P95)]
          ======================================================================== */}
      <div className="bg-gray-900 border border-[#22252b] rounded-sm p-3.5 flex flex-col justify-between min-h-[260px]">
        <div>
          <div className="flex items-center justify-center">
            <span className="text-[13px] text-[#d8d9da] font-medium tracking-tight">
              Inference Latency Percentile Distribution
            </span>
            <InfoTooltip text="P25 is the fastest 25% of queries. P95 represents worst-case lag under load (your Service Level Agreement threshold)." />
          </div>
          <div className="text-center text-[10px] text-[#717885]">
            Response completion time segmented by percentile bands (P25 to P95
            SLA boundary)
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 pt-1">
          {/* Stacked Bars */}
          <div className="h-56 w-full lg:flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={fullPageLoadData}
                margin={{ top: 8, right: 10, left: -25, bottom: 0 }}
                barCategoryGap="25%"
              >
                <CartesianGrid
                  strokeDasharray="1 3"
                  stroke="#22252e"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#2b303a" }}
                />
                <YAxis
                  domain={[0, 5]}
                  ticks={[0, 1, 2, 3, 4, 5]}
                  stroke="#5d636f"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: "#2b303a" }}
                  tickFormatter={(v) => (v === 0 ? "0 ms" : `${v} s`)}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-[#181b1f] border border-[#2b303a] p-2.5 rounded shadow text-[11px] space-y-1">
                        <div className="text-[#8e94a0] border-b border-[#2b303a] pb-1 font-mono">
                          {label}
                        </div>
                        {payload.map((p, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between space-x-4"
                            style={{ color: p.color }}
                          >
                            <span>{p.name}:</span>
                            <span className="font-bold font-mono">
                              {p.value}s
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="p25"
                  stackId="a"
                  fill="#eab308"
                  name="p25 (fast)"
                />
                <Bar
                  dataKey="p50"
                  stackId="a"
                  fill="#f97316"
                  name="p50 (median)"
                />
                <Bar
                  dataKey="p75"
                  stackId="a"
                  fill="#ea580c"
                  name="p75 (upper)"
                />
                <Bar
                  dataKey="p90"
                  stackId="a"
                  fill="#dc2626"
                  name="p90 (tail)"
                />
                <Bar
                  dataKey="p95"
                  stackId="a"
                  fill="#b91c1c"
                  name="p95 (SLA limit)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Right Summary Table */}
          <div className="w-full lg:w-56 bg-gray-900 border border-[#22252b] rounded p-3 text-xs space-y-2 shrink-0 self-center">
            <div className="flex justify-between text-[11px] text-[#6c727d] border-b border-[#22252b] pb-1 font-mono">
              <span>Percentile</span>
              <span className="font-semibold text-[#8e94a0]">avg latency</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-gray-300">
                <span className="w-2.5 h-0.5 bg-[#eab308] inline-block" />
                <span>p25 (fast)</span>
              </span>
              <span className="font-mono text-gray-200">6.81 ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-gray-300">
                <span className="w-2.5 h-0.5 bg-[#f97316] inline-block" />
                <span>p50 (median)</span>
              </span>
              <span className="font-mono text-gray-200">142 ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-gray-300">
                <span className="w-2.5 h-0.5 bg-[#ea580c] inline-block" />
                <span>p75 (upper)</span>
              </span>
              <span className="font-mono text-gray-200">535 ms</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-gray-300">
                <span className="w-2.5 h-0.5 bg-[#dc2626] inline-block" />
                <span>p90 (tail)</span>
              </span>
              <span className="font-mono text-gray-200">1.04 s</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center space-x-1.5 text-gray-300">
                <span className="w-2.5 h-0.5 bg-[#b91c1c] inline-block" />
                <span>p95 (SLA)</span>
              </span>
              <span className="font-mono text-gray-200">1.46 s</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================
          BOTTOM ROW: Configured Runtimes & Recent Runs Quick Links
          ======================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Runtimes Card */}
        <div className="bg-gray-900 border border-[#22252b] rounded-sm p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-[#22252b]">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-semibold text-white">
                Registered LLM Engines
              </span>
            </div>
            <Link
              to="/runtimes"
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center space-x-1"
            >
              <span>View all ({runtimes.length})</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="py-2.5 space-y-2">
            {runtimes.length > 0 ? (
              runtimes.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-xs bg-[#14161a] p-2 rounded border border-[#22252b]"
                >
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full ${r.status === "healthy" ? "bg-emerald-400" : "bg-amber-400"}`}
                    />
                    <span className="font-medium text-white">{r.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      ({r.type})
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400 font-mono">
                    {r.endpoint}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-500 py-1">
                No runtimes registered yet. Click below to add your local
                engine.
              </div>
            )}
          </div>
          <Link
            to="/runtimes"
            className="text-center text-xs py-1.5 bg-[#22262e] hover:bg-[#2c313c] text-gray-300 rounded transition-colors"
          >
            + Register New Runtime (Ollama / vLLM / LM Studio)
          </Link>
        </div>

        {/* Recent Performance Runs */}
        <div className="bg-gray-900 border border-[#22252b] rounded-sm p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-[#22252b]">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">
                Latest Benchmark & Load Runs
              </span>
            </div>
            <Link
              to="/history"
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center space-x-1"
            >
              <span>Full History</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="py-2.5 space-y-2">
            {benchmarks.length > 0 ? (
              benchmarks.slice(0, 3).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between text-xs bg-[#14161a] p-2 rounded border border-[#22252b]"
                >
                  <div>
                    <span className="font-medium text-white">
                      {b.model_name}
                    </span>
                    <span className="text-[10px] text-gray-500 ml-2">
                      Scenario: {b.scenario_name || "Standard"}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-gray-300 font-mono text-[11px]">
                    <span className="text-emerald-400">
                      {fmt(b.tokens_per_second)} tok/s
                    </span>
                    <span>{fmt(b.p95_latency_ms)} ms P95</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-500 py-1">
                No benchmark runs recorded yet. Start your first run from the
                button below.
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Link
              to="/benchmark"
              className="flex-1 text-center text-xs py-1.5 bg-[#22262e] hover:bg-[#2c313c] text-gray-300 rounded transition-colors"
            >
              Run Single Benchmark
            </Link>
            <Link
              to="/load-test"
              className="flex-1 text-center text-xs py-1.5 bg-[#22262e] hover:bg-[#2c313c] text-amber-300/90 rounded transition-colors"
            >
              Run Concurrency Test
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
