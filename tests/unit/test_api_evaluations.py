from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forgeguard.api.app import create_app
from forgeguard.config import ForgeGuardSettings
from forgeguard.runtime.service import RuntimeService


@pytest.fixture
def eval_client(tmp_path: Path) -> Iterator[tuple[TestClient, Path]]:
    db_file = tmp_path / "test_eval.db"
    reports_dir = tmp_path / "eval_reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    settings = ForgeGuardSettings(
        auth_disabled=False,
        api_key="eval-test-key",
        db_path=str(db_file),
        eval_reports_dir=str(reports_dir),
    )
    service = RuntimeService(settings=settings)
    app = create_app(settings=settings, runtime_service=service)

    with TestClient(app) as client:
        yield client, reports_dir


def test_list_scenarios_catalog(eval_client: tuple[TestClient, Path]) -> None:
    client, _ = eval_client
    headers = {"X-API-Key": "eval-test-key"}

    res = client.get("/api/v1/evaluations/scenarios", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["total_scenarios"] == 20
    assert len(data["scenarios"]) == 20
    assert set(data["suites"].keys()) == {
        "reliability",
        "recovery",
        "security",
        "agent",
        "benchmarks",
    }

    assert len(data["suites"]["reliability"]) == 6
    assert len(data["suites"]["recovery"]) == 3
    assert len(data["suites"]["security"]) == 5
    assert len(data["suites"]["agent"]) == 5
    assert len(data["suites"]["benchmarks"]) == 1

    first = data["scenarios"][0]
    assert "scenario_id" in first
    assert "name" in first
    assert "category" in first
    assert "severity" in first
    assert "description" in first
    assert "tags" in first


def test_list_reports_empty_directory(eval_client: tuple[TestClient, Path]) -> None:
    client, _ = eval_client
    headers = {"X-API-Key": "eval-test-key"}

    res = client.get("/api/v1/evaluations/reports", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_reports"] == 0
    assert data["reports"] == []


def test_list_and_get_reports(eval_client: tuple[TestClient, Path]) -> None:
    client, reports_dir = eval_client
    headers = {"X-API-Key": "eval-test-key"}

    sample_report_1 = {
        "experiment_id": "exp_run001",
        "name": "forgeguard_evaluation",
        "timestamp": "2026-11-20T10:00:00+00:00",
        "duration_ms": 2500.0,
        "total_scenarios": 20,
        "passed": 20,
        "failed": 0,
        "errors": 0,
        "skipped": 0,
        "overall_status": "pass",
        "summary_metrics": {"pass_rate_pct": 100.0},
        "scenario_results": [
            {
                "scenario_id": "rel_01_success",
                "name": "Reliability Happy Path Execution",
                "category": "reliability",
                "severity": "high",
                "status": "pass",
                "duration_ms": 50.0,
                "assertions": [
                    {
                        "name": "task_status_check",
                        "passed": True,
                        "expected": "completed",
                        "actual": "completed",
                        "message": "Passed",
                    }
                ],
            }
        ],
        "benchmarks": [
            {
                "benchmark_id": "bm_baseline_direct",
                "name": "Raw Tool Direct Execution",
                "workload_type": "Direct Python Call",
                "sample_count": 30,
                "mean_ms": 0.05,
                "median_ms": 0.04,
                "p95_ms": 0.1,
                "min_ms": 0.02,
                "max_ms": 0.2,
                "std_dev_ms": 0.01,
                "relative_overhead_pct": None,
            }
        ],
        "environment_info": {"platform": "TestPlatform", "python_version": "3.10"},
    }

    sample_report_2 = {
        "experiment_id": "exp_run002",
        "name": "forgeguard_evaluation",
        "timestamp": "2026-11-21T12:00:00+00:00",
        "duration_ms": 3100.0,
        "total_scenarios": 20,
        "passed": 18,
        "failed": 2,
        "errors": 0,
        "skipped": 0,
        "overall_status": "fail",
        "summary_metrics": {"pass_rate_pct": 90.0},
        "scenario_results": [],
        "benchmarks": [],
        "environment_info": {},
    }

    (reports_dir / "report_exp_run001.json").write_text(json.dumps(sample_report_1), encoding="utf-8")
    (reports_dir / "report_exp_run001.md").write_text("# Report Run 1", encoding="utf-8")
    (reports_dir / "report_exp_run002.json").write_text(json.dumps(sample_report_2), encoding="utf-8")

    # List reports (should be sorted newest first -> exp_run002 then exp_run001)
    res = client.get("/api/v1/evaluations/reports", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_reports"] == 2
    assert data["reports"][0]["experiment_id"] == "exp_run002"
    assert data["reports"][0]["overall_status"] == "fail"
    assert data["reports"][0]["passed"] == 18
    assert data["reports"][0]["failed"] == 2
    assert data["reports"][1]["experiment_id"] == "exp_run001"
    assert data["reports"][1]["overall_status"] == "pass"

    # Get specific report detail
    detail_res = client.get("/api/v1/evaluations/reports/exp_run001", headers=headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["experiment_id"] == "exp_run001"
    assert detail["total_scenarios"] == 20
    assert len(detail["scenario_results"]) == 1
    assert detail["scenario_results"][0]["scenario_id"] == "rel_01_success"
    assert len(detail["benchmarks"]) == 1
    assert detail["benchmarks"][0]["benchmark_id"] == "bm_baseline_direct"

    # Get nonexistent report
    not_found = client.get("/api/v1/evaluations/reports/exp_unknown", headers=headers)
    assert not_found.status_code == 404
    assert not_found.json()["error"]["code"] == "FG-EVAL-404"


def test_invalid_experiment_id_validation(eval_client: tuple[TestClient, Path]) -> None:
    client, _ = eval_client
    headers = {"X-API-Key": "eval-test-key"}

    # Invalid characters in experiment ID
    res = client.get("/api/v1/evaluations/reports/invalid@id!", headers=headers)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "FG-EVAL-400"

    res2 = client.get("/api/v1/evaluations/reports/invalid$id/artifact", headers=headers)
    assert res2.status_code == 400
    assert res2.json()["error"]["code"] == "FG-EVAL-400"


def test_get_report_artifacts(eval_client: tuple[TestClient, Path]) -> None:
    client, reports_dir = eval_client
    headers = {"X-API-Key": "eval-test-key"}

    exp_id = "exp_art123"
    json_content = '{"experiment_id": "exp_art123", "status": "pass"}'
    md_content = "# Markdown Report exp_art123"

    (reports_dir / f"report_{exp_id}.json").write_text(json_content, encoding="utf-8")
    (reports_dir / f"report_{exp_id}.md").write_text(md_content, encoding="utf-8")

    # JSON artifact
    res_json = client.get(f"/api/v1/evaluations/reports/{exp_id}/artifact?format=json", headers=headers)
    assert res_json.status_code == 200
    assert "application/json" in res_json.headers["content-type"]
    assert res_json.text == json_content

    # Markdown artifact
    res_md = client.get(f"/api/v1/evaluations/reports/{exp_id}/artifact?format=markdown", headers=headers)
    assert res_md.status_code == 200
    assert "text/markdown" in res_md.headers["content-type"]
    assert res_md.text == md_content

    # Missing artifact (e.g. md missing for report that only has json)
    missing_res = client.get("/api/v1/evaluations/reports/exp_missing/artifact", headers=headers)
    assert missing_res.status_code == 404
