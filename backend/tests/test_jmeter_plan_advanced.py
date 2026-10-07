"""
Test suite for Advanced JMeter Plan enhancements:
- User Defined Variables (UDV) interpolation
- Advanced Timers (uniform, constant, gaussian)
- p99_latency SLA assertion
- Schema validation
"""
import pytest
from app.loadtest.config_elements import apply_config_elements, PromptPool
from app.loadtest.assertions import evaluate_assertions
from app.schemas.load_test import ConfigElementSchema, AssertionConfigSchema, LoadTestPlanCreate


def test_user_defined_variables_interpolation():
    tg_config = {
        "model": "${TARGET_MODEL}",
        "system_prompt": "You are a bot configured with key ${API_KEY} for scenario ${SCENARIO}.",
        "extra_headers": {"X-Custom-Header": "Bearer ${TOKEN}"},
    }
    config_elements = [
        {
            "type": "user_defined_variables",
            "variables": {
                "TARGET_MODEL": "meta-llama/Llama-3-8B-Instruct",
                "API_KEY": "sk-test-secret-123",
                "SCENARIO": "customer_support",
                "TOKEN": "jwt-tok-xyz",
            },
        }
    ]

    updated_tg, _ = apply_config_elements(tg_config, config_elements)
    assert updated_tg["model"] == "meta-llama/Llama-3-8B-Instruct"
    assert "sk-test-secret-123" in updated_tg["system_prompt"]
    assert "customer_support" in updated_tg["system_prompt"]
    assert updated_tg["extra_headers"]["X-Custom-Header"] == "Bearer jwt-tok-xyz"


def test_advanced_timer_configurations():
    # Constant timer
    tg1, _ = apply_config_elements({}, [{"type": "think_time", "timer_type": "constant", "delay_ms": 600}])
    assert tg1["think_time_min_ms"] == 600
    assert tg1["think_time_max_ms"] == 600

    # Gaussian timer
    tg2, _ = apply_config_elements({}, [{"type": "think_time", "timer_type": "gaussian", "delay_ms": 500, "deviation_ms": 100}])
    assert tg2["think_time_min_ms"] == 400
    assert tg2["think_time_max_ms"] == 600

    # Uniform timer
    tg3, _ = apply_config_elements({}, [{"type": "think_time", "timer_type": "uniform", "min_ms": 150, "max_ms": 750}])
    assert tg3["think_time_min_ms"] == 150
    assert tg3["think_time_max_ms"] == 750


def test_p99_latency_assertion():
    aggregates = {
        "p95_latency_ms": 1800.0,
        "p99_latency_ms": 2800.0,
        "error_rate": 0.02,
    }
    assertions = [
        {"type": "p99_latency", "name": "P99 SLA", "p99_max_ms": 3000.0},
        {"type": "p99_latency", "name": "Strict P99 SLA", "p99_max_ms": 2500.0},
    ]

    results = evaluate_assertions(assertions, aggregates)
    assert len(results) == 2
    assert results[0].passed is True
    assert results[0].actual_value == 2800.0
    assert results[1].passed is False
    assert results[1].threshold == 2500.0


def test_plan_schema_validation():
    plan_data = {
        "name": "Production JMeter Plan",
        "description": "Validation test",
        "thread_groups": [
            {
                "id": "tg-1",
                "name": "Group 1",
                "runtime_id": "rt-123",
                "model": "gpt-4",
                "pattern": "rampup",
                "target_users": 20,
                "duration_seconds": 60,
            }
        ],
        "config_elements": [
            {
                "type": "user_defined_variables",
                "variables": {"API_KEY": "secret"},
            },
            {
                "type": "think_time",
                "timer_type": "gaussian",
                "delay_ms": 400,
                "deviation_ms": 100,
            },
        ],
        "assertions": [
            {"type": "latency", "name": "p95", "p95_max_ms": 2000},
            {"type": "p99_latency", "name": "p99", "p99_max_ms": 3500},
        ],
    }

    schema = LoadTestPlanCreate(**plan_data)
    assert schema.name == "Production JMeter Plan"
    assert len(schema.config_elements) == 2
    assert schema.config_elements[0].variables["API_KEY"] == "secret"
