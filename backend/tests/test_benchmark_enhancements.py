"""
Automated tests for Benchmark Engine Enhancements:
1. Custom Prompt Templates CRUD
2. Semantic Quality Scoring (Coherence, Relevance, Degenerate Loop Detection)
3. Context Length Scaling Generator & Execution Loop
4. Export format verification
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import create_tables, AsyncSessionLocal
from app.benchmark.quality import evaluate_quality
from app.benchmark.context_generator import generate_context_prompt
from app.benchmark.engine import run_benchmark
from app.models.runtime import Runtime
from app.models.benchmark import BenchmarkRun, BenchmarkResult
from sqlalchemy import select
from unittest.mock import AsyncMock, patch


@pytest_asyncio.fixture(autouse=True)
async def init_db():
    await create_tables()


# ==============================================================================
# 1. Semantic Quality Evaluator Tests
# ==============================================================================

def test_quality_evaluator_coherent_relevant():
    """Verify standard high-quality response receives high coherence and relevance scores."""
    prompt = "Explain the concept of machine learning in simple terms."
    response = (
        "Machine learning is a subset of artificial intelligence where computer systems "
        "learn patterns from training data to make predictions rather than following explicitly "
        "programmed rules. Common examples include spam filtering and recommendation algorithms."
    )
    result = evaluate_quality(prompt, response, scenario="medium")
    assert result.quality_valid is True
    assert result.quality_score >= 0.75
    assert result.coherence_score >= 0.80
    assert result.relevance_score >= 0.60


def test_quality_evaluator_repetition_loop():
    """Verify degenerate repetition loop collapses coherence score due to distinct-2 penalty."""
    prompt = "What is the capital of France?"
    # Simulates quantized model running in an infinite repetition loop
    response = (
        "Paris is the capital of France. Paris is the capital of France. "
        "Paris is the capital of France. Paris is the capital of France. "
        "Paris is the capital of France. Paris is the capital of France."
    )
    result = evaluate_quality(prompt, response, scenario="short")
    # Coherence should be heavily penalized by the repetition detector
    assert result.coherence_score <= 0.45
    assert result.details["repetition_score"] <= 0.35


def test_quality_evaluator_empty_and_errors():
    """Verify empty responses or runtime errors fail quality validation."""
    res_empty = evaluate_quality("Hello", "   ", scenario="short")
    assert res_empty.quality_valid is False
    assert res_empty.quality_score == 0.0

    res_err = evaluate_quality("Hello", "", scenario="short", error="Connection reset")
    assert res_err.quality_valid is False
    assert res_err.quality_score == 0.0


def test_quality_evaluator_json_scenario():
    """Verify strict JSON format evaluation."""
    prompt = "Return a JSON object with name and age."
    valid_json = '{"name": "DynoLLM", "age": 2}'
    invalid_json = '{"name": "DynoLLM", age: incomplete...'

    res_valid = evaluate_quality(prompt, valid_json, scenario="json")
    assert res_valid.quality_valid is True
    assert res_valid.details["is_json_scenario"] is True

    res_invalid = evaluate_quality(prompt, invalid_json, scenario="json")
    assert res_invalid.coherence_score <= 0.30
    assert res_invalid.quality_score <= 0.50


# ==============================================================================
# 2. Context Length Scaling Generator Tests
# ==============================================================================

def test_context_prompt_generator_lengths():
    """Verify calibrated prompt context generator generates progressively longer contexts."""
    p100, q1 = generate_context_prompt(100)
    p500, q2 = generate_context_prompt(500)
    p1000, q3 = generate_context_prompt(1000)

    len100 = len(p100.split())
    len500 = len(p500.split())
    len1000 = len(p1000.split())

    # Monotonic length scaling
    assert len100 < len500 < len1000
    assert "Documentation Reference Context" in p100
    assert q1 in p100
    assert q2 in p500


# ==============================================================================
# 3. Prompt Templates CRUD API Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_prompt_templates_crud():
    """Test full CRUD lifecycle for custom prompt templates."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. List - verify seeded builtin templates exist
        list_resp = await client.get("/api/prompt-templates")
        assert list_resp.status_code == 200
        templates = list_resp.json()
        assert len(templates) >= 7
        assert any(t["id"] == "builtin-short" for t in templates)

        # 2. Create custom template
        create_resp = await client.post(
            "/api/prompt-templates",
            json={
                "name": "SQL Optimizer Prompt",
                "description": "Tests database query optimization capabilities",
                "scenario": "custom",
                "system_prompt": "You are a senior PostgreSQL DBA.",
                "prompt": "Optimize this slow query with index recommendations.",
                "temperature": 0.4,
                "max_tokens": 768,
            },
        )
        assert create_resp.status_code == 200
        created = create_resp.json()
        assert created["name"] == "SQL Optimizer Prompt"
        assert created["is_builtin"] is False
        template_id = created["id"]

        # 3. Get by ID
        get_resp = await client.get(f"/api/prompt-templates/{template_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == template_id

        # 4. Update custom template
        update_resp = await client.put(
            f"/api/prompt-templates/{template_id}",
            json={"name": "PostgreSQL Expert Optimizer", "temperature": 0.3},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["name"] == "PostgreSQL Expert Optimizer"
        assert update_resp.json()["temperature"] == 0.3

        # 5. Builtin modification protection
        protect_resp = await client.put(
            "/api/prompt-templates/builtin-short",
            json={"name": "Hacked Builtin"},
        )
        assert protect_resp.status_code == 400

        protect_del_resp = await client.delete("/api/prompt-templates/builtin-short")
        assert protect_del_resp.status_code == 400

        # 6. Delete custom template
        del_resp = await client.delete(f"/api/prompt-templates/{template_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] is True


# ==============================================================================
# 4. Benchmark Execution Loop & Export Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_context_scaling_benchmark_and_export():
    """Verify execution of context scaling benchmark run and export APIs."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create a test runtime
        rt_resp = await client.post(
            "/api/runtimes",
            json={
                "name": "Mock Ollama Bench",
                "runtime_type": "ollama",
                "endpoint": "http://localhost:11434",
            },
        )
        assert rt_resp.status_code == 200
        runtime_id = rt_resp.json()["id"]

        # Create context scaling benchmark run
        bench_resp = await client.post(
            "/api/benchmarks",
            json={
                "runtime_id": runtime_id,
                "model": "llama3.1:8b",
                "scenario": "context_scaling",
                "test_type": "context_scaling",
                "context_lengths": [100, 500],
                "num_runs": 2,
                "max_tokens": 128,
                "use_streaming": False,
            },
        )
        assert bench_resp.status_code == 200
        run_data = bench_resp.json()
        run_id = run_data["id"]
        assert run_data["test_type"] == "context_scaling"
        assert run_data["context_lengths"] == [100, 500]

        # Check export JSON
        json_export_resp = await client.get(f"/api/export/benchmarks/{run_id}/json")
        assert json_export_resp.status_code == 200
        export_json = json_export_resp.json()
        assert export_json["run"]["test_type"] == "context_scaling"
        assert export_json["run"]["context_lengths"] == [100, 500]


def test_empty_benchmark_quality_integrity_rate_is_none():
    """Verify that when a benchmark run produces 0 valid results, quality_integrity_rate is None (not 1.0)."""
    from app.benchmark.engine import compute_benchmark_aggregates
    aggregates = compute_benchmark_aggregates(results=[], latencies=[], ttfts=[])
    assert aggregates["quality_integrity_rate"] is None
    assert aggregates["avg_total_latency_ms"] is None
    assert aggregates["avg_ttft_ms"] is None


def test_valid_benchmark_quality_integrity_rate():
    """Verify quality_integrity_rate calculates the honest passed ratio when results exist."""
    from app.benchmark.engine import compute_benchmark_aggregates
    from unittest.mock import MagicMock

    r1 = MagicMock(quality_valid=True, error=None, generation_tokens_per_second=20.0,
                   e2e_tokens_per_second=18.0, prompt_tokens=10, completion_tokens=50,
                   power_watts=50.0, quality_score=0.9, coherence_score=0.9, relevance_score=0.9)
    r2 = MagicMock(quality_valid=False, error="Repetition loop detected", generation_tokens_per_second=15.0,
                   e2e_tokens_per_second=12.0, prompt_tokens=10, completion_tokens=50,
                   power_watts=50.0, quality_score=0.3, coherence_score=0.2, relevance_score=0.4)

    aggregates = compute_benchmark_aggregates(results=[r1, r2], latencies=[100.0, 120.0], ttfts=[20.0, 25.0])
    assert aggregates["quality_integrity_rate"] == 0.5
    assert aggregates["avg_total_latency_ms"] == 110.0

