from __future__ import annotations

import json
from typing import Any

from forgeguard.observability.models import (
    Diagnostic,
    ExecutionReport,
    TimelineEntry,
    Trace,
)

SENSITIVE_KEY_PATTERNS = {
    "password",
    "secret",
    "token",
    "api_key",
    "apikey",
    "auth",
    "credential",
    "private_key",
}


def mask_sensitive_data(
    data: Any,
    include_sensitive: bool = False,
    max_payload_length: int = 1000,
) -> Any:
    """Recursively mask sensitive keys and truncate oversized payloads."""
    if include_sensitive or data is None:
        return data

    if isinstance(data, dict):
        masked: dict[str, Any] = {}
        for k, v in data.items():
            k_lower = str(k).lower()
            if any(pattern in k_lower for pattern in SENSITIVE_KEY_PATTERNS):
                masked[k] = "[REDACTED]"
            else:
                masked[k] = mask_sensitive_data(
                    v, include_sensitive=False, max_payload_length=max_payload_length
                )
        return masked

    if isinstance(data, list):
        return [
            mask_sensitive_data(
                item,
                include_sensitive=False,
                max_payload_length=max_payload_length,
            )
            for item in data
        ]

    if isinstance(data, str) and len(data) > max_payload_length:
        return data[:max_payload_length] + f"... [truncated {len(data) - max_payload_length} chars]"

    return data


class ReportExporter:
    @staticmethod
    def create_report(
        trace: Trace,
        timeline: list[TimelineEntry],
        tool_summaries: list[dict[str, Any]],
        metrics: dict[str, Any],
        budget_summary: dict[str, Any],
        policy_summary: dict[str, Any],
        diagnostics: list[Diagnostic],
        recovery_summary: dict[str, Any] | None = None,
        error: str | None = None,
        include_sensitive: bool = False,
    ) -> ExecutionReport:
        """Construct an ExecutionReport with optional sensitive data redaction."""
        masked_budget = mask_sensitive_data(budget_summary, include_sensitive)
        masked_policy = mask_sensitive_data(policy_summary, include_sensitive)
        masked_tool_summaries = mask_sensitive_data(tool_summaries, include_sensitive)
        masked_recovery = mask_sensitive_data(recovery_summary, include_sensitive)

        masked_timeline: list[TimelineEntry] = []
        for entry in timeline:
            masked_meta = mask_sensitive_data(entry.metadata, include_sensitive)
            masked_timeline.append(
                TimelineEntry(
                    sequence_number=entry.sequence_number,
                    timestamp=entry.timestamp,
                    event_type=entry.event_type,
                    category=entry.category,
                    task_id=entry.task_id,
                    trace_id=entry.trace_id,
                    tool_call_id=entry.tool_call_id,
                    tool_name=entry.tool_name,
                    duration_ms=entry.duration_ms,
                    status=entry.status,
                    summary=entry.summary,
                    metadata=masked_meta,
                )
            )

        masked_diagnostics: list[Diagnostic] = []
        for diag in diagnostics:
            masked_details = mask_sensitive_data(diag.details, include_sensitive)
            masked_diagnostics.append(
                Diagnostic(
                    diagnostic_id=diag.diagnostic_id,
                    task_id=diag.task_id,
                    trace_id=diag.trace_id,
                    severity=diag.severity,
                    category=diag.category,
                    code=diag.code,
                    message=diag.message,
                    timestamp=diag.timestamp,
                    tool_call_id=diag.tool_call_id,
                    span_id=diag.span_id,
                    details=masked_details,
                    suggested_action=diag.suggested_action,
                )
            )

        return ExecutionReport(
            task_id=trace.task_id,
            trace_id=trace.trace_id,
            description=trace.metadata.get("description", "Task execution"),
            status=trace.status,
            start_time=trace.start_time,
            end_time=trace.end_time,
            duration_ms=trace.duration_ms,
            timeline=masked_timeline,
            tool_summaries=masked_tool_summaries,
            metrics=metrics,
            budget_summary=masked_budget,
            policy_summary=masked_policy,
            recovery_summary=masked_recovery,
            diagnostics=masked_diagnostics,
            error=error,
        )

    @staticmethod
    def to_json(report: ExecutionReport, indent: int = 2) -> str:
        """Serialize ExecutionReport to deterministic JSON string."""
        return json.dumps(report.to_dict(), indent=indent, default=str)
