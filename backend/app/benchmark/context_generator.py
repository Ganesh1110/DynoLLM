"""
Context Length Scaling Prompt Generator.

Generates realistic, calibrated textual contexts for target token lengths
(e.g., 100, 500, 1000, 2000, 4000 tokens) with a clear needle/question prompt
to measure prefill scaling, KV cache growth, and throughput degradation.
"""
from typing import Tuple

# Reusable paragraphs with realistic vocabulary (~65 tokens each)
CONTEXT_PARAGRAPHS = [
    (
        "Distributed computing systems rely on consensus algorithms like Raft and Paxos to ensure "
        "state machine replication across heterogeneous nodes. When leader election occurs, each follower "
        "validates heartbeat terms and term numbers before granting votes, preventing split-brain conditions "
        "even under sudden network partitions or clock skews in large-scale datacenter deployments."
    ),
    (
        "Modern deep learning frameworks optimize memory bandwidth by fusing operations and utilizing "
        "custom kernel implementations such as FlashAttention. By tiling intermediate key-value projections "
        "directly in SRAM cache, the quadratic attention computation avoids repeated high-latency roundtrips "
        "to high-bandwidth device VRAM, significantly boosting decoding speed during long-context inference."
    ),
    (
        "Modern database engines implement Write-Ahead Logging (WAL) and multi-version concurrency control (MVCC) "
        "to maintain ACID guarantees while enabling non-blocking reads. Transaction snapshots are pinned to "
        "logical sequence numbers, permitting concurrent analytics queries without acquiring exclusive table locks "
        "or starving latency-sensitive transaction pipelines."
    ),
    (
        "Operating system kernels isolate process execution via virtual memory management and page tables. "
        "Translation Lookaside Buffers (TLB) cache recent physical frame mappings to mitigate the overhead of "
        "multi-level page walks. In high-throughput networking stacks, memory-mapped ring buffers allow user-space "
        "applications to poll network interface cards with minimal kernel-context switches."
    ),
    (
        "Microservice architectures leverage service mesh sidecars for mutual TLS encryption, telemetry "
        "export, and dynamic circuit breaking. When a downstream dependency experiences degraded latency, "
        "the circuit breaker trips open to reject speculative calls instantly, preserving cluster capacity and "
        "mitigating cascading failure across the distributed topology."
    ),
    (
        "Quantization techniques such as AWQ and GPTQ compress 16-bit floating point model weights into 4-bit "
        "integer representations with negligible perplexity loss. By identifying salient activation channels "
        "and protecting critical weight tensors from aggressive scaling, quantized local LLMs can run on "
        "consumer GPU hardware with constrained memory capacity."
    ),
    (
        "Continuous integration and continuous deployment pipelines automate linting, static analysis, "
        "unit test suites, and container image builds. Immutable container artifacts tagged with git commit "
        "hashes ensure consistent runtime environments across staging and multi-region production clusters."
    ),
    (
        "Modern web browsers compile JavaScript via multi-tiered JIT compilers. Baseline interpreters "
        "collect runtime type feedback before optimizing frequently executed hot loops into machine code, "
        "bailing out gracefully whenever speculative structural assumptions are violated by polymorphic objects."
    ),
]


def generate_context_prompt(target_tokens: int) -> Tuple[str, str]:
    """
    Generate a realistic prompt approximating target_tokens.
    Returns:
      (full_prompt, target_question)
    Average English token is ~0.75 words (or ~1.33 tokens per word).
    A 65-word paragraph is approximately 85 tokens.
    """
    # Each paragraph has ~55 words (~75-80 tokens)
    tokens_per_para = 75

    # Instruction & Question suffix (~35 tokens)
    question = "Summarize the primary architectural optimization discussed in the passage and identify how memory bandwidth is preserved."
    suffix = f"\n\nBased on the entire documentation context above, answer the following:\nQuestion: {question}\nAnswer:"

    suffix_tokens = 35
    needed_tokens = max(50, target_tokens - suffix_tokens)
    needed_paras = max(1, round(needed_tokens / tokens_per_para))

    paragraphs = []
    for i in range(needed_paras):
        para = CONTEXT_PARAGRAPHS[i % len(CONTEXT_PARAGRAPHS)]
        paragraphs.append(f"Section {i + 1}:\n{para}")

    context_body = "\n\n".join(paragraphs)
    full_prompt = f"Documentation Reference Context:\n{context_body}{suffix}"

    return full_prompt, question
