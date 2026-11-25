from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response, status
from fastapi.responses import StreamingResponse

from forgeguard.api.auth import verify_api_key
from forgeguard.api.dependencies import get_evaluation_runner_service
from forgeguard.api.errors import APIException
from forgeguard.api.schemas import (
    EvaluationReportDetailResponse,
    EvaluationReportListResponse,
    EvaluationReportSummary,
    EvaluationRunListResponse,
    EvaluationRunStateResponse,
    EvaluationRunSubmitRequest,
    ScenarioCatalogItem,
    ScenarioCatalogResponse,
)
from forgeguard.config import ForgeGuardSettings, get_settings
from forgeguard.evaluation.scenarios import (
    ALL_SCENARIO_CLASSES,
    SUITE_AGENT,
    SUITE_BENCHMARKS,
    SUITE_RECOVERY,
    SUITE_RELIABILITY,
    SUITE_SECURITY,
    BaseScenario,
    get_scenario_by_id,
)
from forgeguard.evaluation.service import EvaluationRunnerService

logger = logging.getLogger("forgeguard.api.evaluations")

router = APIRouter(
    prefix="/api/v1/evaluations",
    tags=["evaluations"],
    dependencies=[Depends(verify_api_key)],
)

EXPERIMENT_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\-]+$")


def _scenario_to_catalog_item(cls: type[BaseScenario]) -> ScenarioCatalogItem:
    """Extract catalog metadata from a scenario class."""
    category = cls.category.value if hasattr(cls.category, "value") else str(cls.category)
    severity = cls.severity.value if hasattr(cls.severity, "value") else str(cls.severity)
    return ScenarioCatalogItem(
        scenario_id=cls.scenario_id,
        name=cls.name,
        category=category,
        severity=severity,
        description=cls.description or cls.__doc__ or "",
        tags=list(cls.tags),
    )


def _validate_experiment_id(experiment_id: str) -> None:
    """Ensure experiment ID contains only safe alphanumeric/underscore/hyphen characters."""
    if not EXPERIMENT_ID_REGEX.match(experiment_id):
        raise APIException(
            status_code=400,
            code="FG-EVAL-400",
            message=f"Invalid experiment ID '{experiment_id}'. Allowed characters: [a-zA-Z0-9_-].",
        )


def _get_reports_directory(settings: ForgeGuardSettings) -> Path:
    """Retrieve and resolve the evaluation reports directory."""
    dir_path = Path(settings.eval_reports_dir).resolve()
    dir_path.mkdir(parents=True, exist_ok=True)
    return dir_path


@router.get("/scenarios", response_model=ScenarioCatalogResponse)
async def list_evaluation_scenarios() -> ScenarioCatalogResponse:
    """List all registered evaluation scenarios organized by suite."""
    suites: dict[str, list[ScenarioCatalogItem]] = {
        "reliability": [_scenario_to_catalog_item(cls) for cls in SUITE_RELIABILITY],
        "recovery": [_scenario_to_catalog_item(cls) for cls in SUITE_RECOVERY],
        "security": [_scenario_to_catalog_item(cls) for cls in SUITE_SECURITY],
        "agent": [_scenario_to_catalog_item(cls) for cls in SUITE_AGENT],
        "benchmarks": [_scenario_to_catalog_item(cls) for cls in SUITE_BENCHMARKS],
    }

    scenarios = [_scenario_to_catalog_item(cls) for cls in ALL_SCENARIO_CLASSES]

    return ScenarioCatalogResponse(
        total_scenarios=len(scenarios),
        suites=suites,
        scenarios=scenarios,
    )


@router.get("/reports", response_model=EvaluationReportListResponse)
async def list_evaluation_reports(
    settings: Annotated[ForgeGuardSettings, Depends(get_settings)],
) -> EvaluationReportListResponse:
    """List summaries of historical evaluation reports stored on disk."""
    reports_dir = _get_reports_directory(settings)
    reports: list[EvaluationReportSummary] = []

    json_files = list(reports_dir.glob("report_*.json"))
    for file_path in json_files:
        try:
            raw_content = file_path.read_text(encoding="utf-8")
            data = json.loads(raw_content)

            exp_id = data.get("experiment_id")
            if not exp_id:
                # Infer from filename report_<exp_id>.json
                stem = file_path.stem
                exp_id = stem[7:] if stem.startswith("report_") else stem

            total_scenarios = data.get("total_scenarios", 0)
            passed = data.get("passed", 0)
            summary_metrics = data.get("summary_metrics", {})
            pass_rate = summary_metrics.get(
                "pass_rate_pct",
                round((passed / total_scenarios * 100.0), 2) if total_scenarios > 0 else 0.0,
            )

            reports.append(
                EvaluationReportSummary(
                    experiment_id=exp_id,
                    name=data.get("name", "forgeguard_evaluation"),
                    timestamp=data.get("timestamp", ""),
                    duration_ms=data.get("duration_ms", 0.0),
                    total_scenarios=total_scenarios,
                    passed=passed,
                    failed=data.get("failed", 0),
                    errors=data.get("errors", 0),
                    skipped=data.get("skipped", 0),
                    overall_status=data.get("overall_status", "unknown"),
                    pass_rate_pct=pass_rate,
                )
            )
        except Exception as exc:
            logger.warning("Failed to parse evaluation report '%s': %s", file_path.name, exc)
            continue

    # Sort descending by timestamp, fallback to experiment_id
    reports.sort(key=lambda r: (r.timestamp, r.experiment_id), reverse=True)

    return EvaluationReportListResponse(
        total_reports=len(reports),
        reports=reports,
    )


@router.get("/reports/{experiment_id}", response_model=EvaluationReportDetailResponse)
async def get_evaluation_report(
    experiment_id: str,
    settings: Annotated[ForgeGuardSettings, Depends(get_settings)],
) -> EvaluationReportDetailResponse:
    """Retrieve full details of an evaluation experiment report."""
    _validate_experiment_id(experiment_id)

    reports_dir = _get_reports_directory(settings)
    target_file = (reports_dir / f"report_{experiment_id}.json").resolve()

    # Strictly verify path containment
    if not target_file.is_relative_to(reports_dir):
        raise APIException(
            status_code=403,
            code="FG-EVAL-403",
            message="Access denied: report path outside authorized directory.",
        )

    if not target_file.is_file():
        raise APIException(
            status_code=404,
            code="FG-EVAL-404",
            message=f"Evaluation report '{experiment_id}' not found.",
        )

    try:
        raw_content = target_file.read_text(encoding="utf-8")
        data = json.loads(raw_content)
    except Exception as exc:
        logger.error("Failed to read evaluation report JSON '%s': %s", target_file.name, exc)
        raise APIException(
            status_code=500,
            code="FG-EVAL-500",
            message=f"Unable to read evaluation report '{experiment_id}'.",
        )

    return EvaluationReportDetailResponse(
        experiment_id=data.get("experiment_id", experiment_id),
        name=data.get("name", "forgeguard_evaluation"),
        timestamp=data.get("timestamp", ""),
        duration_ms=data.get("duration_ms", 0.0),
        total_scenarios=data.get("total_scenarios", 0),
        passed=data.get("passed", 0),
        failed=data.get("failed", 0),
        errors=data.get("errors", 0),
        skipped=data.get("skipped", 0),
        overall_status=data.get("overall_status", "pass"),
        scenario_results=data.get("scenario_results", []),
        benchmarks=data.get("benchmarks", []),
        summary_metrics=data.get("summary_metrics", {}),
        environment_info=data.get("environment_info", {}),
    )


@router.get("/reports/{experiment_id}/artifact")
async def get_evaluation_artifact(
    experiment_id: str,
    settings: Annotated[ForgeGuardSettings, Depends(get_settings)],
    format: str = Query("json", pattern="^(json|markdown|md)$"),
) -> Response:
    """Download raw JSON or Markdown report artifact safely."""
    _validate_experiment_id(experiment_id)

    reports_dir = _get_reports_directory(settings)
    is_markdown = format in ("markdown", "md")
    extension = "md" if is_markdown else "json"
    target_file = (reports_dir / f"report_{experiment_id}.{extension}").resolve()

    # Strictly verify path containment
    if not target_file.is_relative_to(reports_dir):
        raise APIException(
            status_code=403,
            code="FG-EVAL-403",
            message="Access denied: artifact path outside authorized directory.",
        )

    if not target_file.is_file():
        raise APIException(
            status_code=404,
            code="FG-EVAL-404",
            message=f"Evaluation artifact '{experiment_id}' ({format}) not found.",
        )

    try:
        content = target_file.read_text(encoding="utf-8")
    except Exception as exc:
        logger.error("Failed to read evaluation artifact '%s': %s", target_file.name, exc)
        raise APIException(
            status_code=500,
            code="FG-EVAL-500",
            message=f"Unable to read artifact for '{experiment_id}'.",
        )

    media_type = "text/markdown; charset=utf-8" if is_markdown else "application/json; charset=utf-8"
    filename = f"report_{experiment_id}.{extension}"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


VALID_SUITES = {"reliability", "recovery", "security", "agent", "benchmarks", "all"}


@router.post("/runs", response_model=EvaluationRunStateResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_evaluation_run(
    req: EvaluationRunSubmitRequest,
    eval_runner: Annotated[EvaluationRunnerService, Depends(get_evaluation_runner_service)],
) -> EvaluationRunStateResponse:
    """Launch a governed evaluation run asynchronously."""
    # Validate suite selections
    for s in req.suites:
        if s.lower() not in VALID_SUITES:
            raise APIException(
                status_code=400,
                code="FG-EVAL-400",
                message=f"Unknown evaluation suite '{s}'. Valid suites: {sorted(VALID_SUITES)}",
            )

    # Validate scenario ID selections
    for sid in req.scenario_ids:
        if get_scenario_by_id(sid) is None:
            raise APIException(
                status_code=400,
                code="FG-EVAL-400",
                message=f"Unknown evaluation scenario ID '{sid}'.",
            )

    # Validate non-empty selection
    if not req.suites and not req.scenario_ids:
        raise APIException(
            status_code=400,
            code="FG-EVAL-400",
            message="Must specify at least one evaluation suite or scenario to execute.",
        )

    try:
        state = await eval_runner.start_evaluation_run(
            name=req.name,
            suites=req.suites,
            scenario_ids=req.scenario_ids,
        )
        return EvaluationRunStateResponse(**state.to_dict())
    except RuntimeError as exc:
        raise APIException(
            status_code=409,
            code="FG-EVAL-409",
            message=str(exc),
        )
    except ValueError as exc:
        raise APIException(
            status_code=400,
            code="FG-EVAL-400",
            message=str(exc),
        )


@router.get("/runs", response_model=EvaluationRunListResponse)
async def list_evaluation_runs(
    eval_runner: Annotated[EvaluationRunnerService, Depends(get_evaluation_runner_service)],
) -> EvaluationRunListResponse:
    """List in-memory active and recent evaluation runs."""
    runs = eval_runner.list_runs()
    return EvaluationRunListResponse(
        total_runs=len(runs),
        active_run_id=eval_runner.get_active_run_id(),
        runs=[EvaluationRunStateResponse(**r.to_dict()) for r in runs],
    )


@router.get("/runs/{run_id}", response_model=EvaluationRunStateResponse)
async def get_evaluation_run(
    run_id: str,
    eval_runner: Annotated[EvaluationRunnerService, Depends(get_evaluation_runner_service)],
    settings: Annotated[ForgeGuardSettings, Depends(get_settings)],
) -> EvaluationRunStateResponse:
    """Retrieve execution state and metrics of an evaluation run."""
    _validate_experiment_id(run_id)
    state = eval_runner.get_run(run_id)
    if state:
        return EvaluationRunStateResponse(**state.to_dict())

    # Check if a completed report file exists on disk
    reports_dir = _get_reports_directory(settings)
    report_file = (reports_dir / f"report_{run_id}.json").resolve()
    if report_file.is_file() and report_file.is_relative_to(reports_dir):
        try:
            data = json.loads(report_file.read_text(encoding="utf-8"))
            return EvaluationRunStateResponse(
                run_id=run_id,
                experiment_id=run_id,
                name=data.get("name", "forgeguard_evaluation"),
                status="completed",
                created_at=data.get("timestamp", ""),
                started_at=data.get("timestamp"),
                completed_at=data.get("timestamp"),
                total_scenarios=data.get("total_scenarios", 0),
                completed_scenarios=data.get("total_scenarios", 0),
                passed=data.get("passed", 0),
                failed=data.get("failed", 0),
                errors=data.get("errors", 0),
                skipped=data.get("skipped", 0),
                overall_status=data.get("overall_status"),
                duration_ms=data.get("duration_ms", 0.0),
                report_id=run_id,
            )
        except Exception as exc:
            logger.warning("Failed to parse report file for run '%s': %s", run_id, exc)

    raise APIException(
        status_code=404,
        code="FG-EVAL-404",
        message=f"Evaluation run '{run_id}' not found.",
    )


@router.get("/runs/{run_id}/events")
async def stream_evaluation_run_events(
    run_id: str,
    eval_runner: Annotated[EvaluationRunnerService, Depends(get_evaluation_runner_service)],
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
    last_event_id_query: Annotated[str | None, Query(alias="last_event_id")] = None,
) -> StreamingResponse:
    """Stream real-time SSE execution events for an evaluation run."""
    _validate_experiment_id(run_id)
    effective_last_id = last_event_id or last_event_id_query
    try:
        event_generator = eval_runner.stream_run_events(run_id, last_event_id=effective_last_id)
        return StreamingResponse(
            event_generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except ValueError as exc:
        raise APIException(
            status_code=404,
            code="FG-EVAL-404",
            message=str(exc),
        )
