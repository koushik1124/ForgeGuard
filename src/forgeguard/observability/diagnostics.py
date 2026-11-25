from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from forgeguard.observability.behavior import BehaviorPatternSignal
from forgeguard.observability.models import (
    Diagnostic,
    DiagnosticCategory,
    DiagnosticSeverity,
)


def _utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DiagnosticsEngine:
    """Deterministic, rule-based diagnostic engine for ForgeGuard runtime events."""

    def __init__(self) -> None:
        self._diagnostics: list[Diagnostic] = []

    def add_diagnostic(self, diagnostic: Diagnostic) -> None:
        self._diagnostics.append(diagnostic)

    def create_diagnostic(
        self,
        task_id: str,
        trace_id: str,
        severity: DiagnosticSeverity,
        category: DiagnosticCategory,
        code: str,
        message: str,
        tool_call_id: str | None = None,
        span_id: str | None = None,
        details: dict[str, Any] | None = None,
        suggested_action: str | None = None,
    ) -> Diagnostic:
        diag = Diagnostic(
            diagnostic_id=f"diag-{uuid4().hex[:8]}",
            task_id=task_id,
            trace_id=trace_id,
            severity=severity,
            category=category,
            code=code,
            message=message,
            timestamp=_utc_iso_now(),
            tool_call_id=tool_call_id,
            span_id=span_id,
            details=details or {},
            suggested_action=suggested_action,
        )
        self.add_diagnostic(diag)
        return diag

    def diagnose_policy_denial(
        self,
        task_id: str,
        trace_id: str,
        tool_name: str,
        reason: str,
        call_id: str | None = None,
        span_id: str | None = None,
    ) -> Diagnostic:
        return self.create_diagnostic(
            task_id=task_id,
            trace_id=trace_id,
            severity=DiagnosticSeverity.ERROR,
            category=DiagnosticCategory.POLICY,
            code="FG-POLICY-001",
            message=f"Tool '{tool_name}' authorization denied: {reason}",
            tool_call_id=call_id,
            span_id=span_id,
            details={"tool_name": tool_name, "reason": reason},
            suggested_action=(
                f"Grant explicit authorization for tool '{tool_name}' in the Policy configuration "
                f"or inspect default-deny policy rules."
            ),
        )

    def diagnose_budget_exceeded(
        self,
        task_id: str,
        trace_id: str,
        limit_name: str,
        reason: str,
        snapshot: dict[str, Any] | None = None,
        tool_name: str | None = None,
        call_id: str | None = None,
    ) -> Diagnostic:
        code_map = {
            "max_tool_calls": "FG-BUDGET-001",
            "max_output_bytes": "FG-BUDGET-002",
            "max_consecutive_failures": "FG-BUDGET-003",
            "max_execution_seconds": "FG-TIMEOUT-002",
        }
        category_map = {
            "max_tool_calls": DiagnosticCategory.BUDGET,
            "max_output_bytes": DiagnosticCategory.BUDGET,
            "max_consecutive_failures": DiagnosticCategory.BUDGET,
            "max_execution_seconds": DiagnosticCategory.TIMEOUT,
        }
        action_map = {
            "max_tool_calls": "Increase max_tool_calls or optimize agent plan.",
            "max_output_bytes": "Increase max_output_bytes or truncate tool responses.",
            "max_consecutive_failures": "Inspect repeated tool errors or increase limit.",
            "max_execution_seconds": "Increase max_execution_seconds or optimize tools.",
        }

        code = code_map.get(limit_name, "FG-BUDGET-001")
        cat = category_map.get(limit_name, DiagnosticCategory.BUDGET)
        action = action_map.get(limit_name, "Adjust resource budget limits in ExecutionBudget.")

        return self.create_diagnostic(
            task_id=task_id,
            trace_id=trace_id,
            severity=DiagnosticSeverity.ERROR,
            category=cat,
            code=code,
            message=f"Budget limit '{limit_name}' exceeded: {reason}",
            tool_call_id=call_id,
            details={
                "limit": limit_name,
                "reason": reason,
                "tool_name": tool_name,
                **(snapshot or {}),
            },
            suggested_action=action,
        )

    def diagnose_tool_timeout(
        self,
        task_id: str,
        trace_id: str,
        tool_name: str,
        timeout_seconds: float,
        call_id: str | None = None,
        span_id: str | None = None,
    ) -> Diagnostic:
        return self.create_diagnostic(
            task_id=task_id,
            trace_id=trace_id,
            severity=DiagnosticSeverity.ERROR,
            category=DiagnosticCategory.TIMEOUT,
            code="FG-TIMEOUT-001",
            message=(f"Tool '{tool_name}' timed out after {timeout_seconds:.2f} seconds."),
            tool_call_id=call_id,
            span_id=span_id,
            details={"tool_name": tool_name, "timeout_seconds": timeout_seconds},
            suggested_action=(
                f"Increase max_tool_duration_seconds or optimize handler for '{tool_name}'."
            ),
        )

    def diagnose_tool_failure(
        self,
        task_id: str,
        trace_id: str,
        tool_name: str,
        error: str,
        call_id: str | None = None,
        span_id: str | None = None,
    ) -> Diagnostic:
        return self.create_diagnostic(
            task_id=task_id,
            trace_id=trace_id,
            severity=DiagnosticSeverity.ERROR,
            category=DiagnosticCategory.TOOL,
            code="FG-TOOL-001",
            message=f"Tool '{tool_name}' failed during invocation: {error}",
            tool_call_id=call_id,
            span_id=span_id,
            details={"tool_name": tool_name, "error": error},
            suggested_action="Inspect tool code, arguments, or external service dependencies.",
        )

    def diagnose_tool_validation(
        self,
        task_id: str,
        trace_id: str,
        tool_name: str,
        error: str,
        call_id: str | None = None,
    ) -> Diagnostic:
        return self.create_diagnostic(
            task_id=task_id,
            trace_id=trace_id,
            severity=DiagnosticSeverity.ERROR,
            category=DiagnosticCategory.VALIDATION,
            code="FG-TOOL-003",
            message=f"Tool '{tool_name}' input validation failed: {error}",
            tool_call_id=call_id,
            details={"tool_name": tool_name, "validation_error": error},
            suggested_action="Ensure tool input arguments adhere to Pydantic contract schema.",
        )

    def diagnose_unknown_tool(
        self,
        task_id: str,
        trace_id: str,
        tool_name: str,
        call_id: str | None = None,
    ) -> Diagnostic:
        return self.create_diagnostic(
            task_id=task_id,
            trace_id=trace_id,
            severity=DiagnosticSeverity.ERROR,
            category=DiagnosticCategory.TOOL,
            code="FG-TOOL-002",
            message=f"Requested tool '{tool_name}' is not registered in ToolRegistry.",
            tool_call_id=call_id,
            details={"tool_name": tool_name},
            suggested_action=f"Register '{tool_name}' with ToolRegistry before task execution.",
        )

    def diagnose_recovery_failure(
        self,
        task_id: str,
        trace_id: str,
        reason: str,
        warnings: list[str] | None = None,
    ) -> Diagnostic:
        return self.create_diagnostic(
            task_id=task_id,
            trace_id=trace_id,
            severity=DiagnosticSeverity.CRITICAL,
            category=DiagnosticCategory.RECOVERY,
            code="FG-RECOVERY-001",
            message=f"Crash recovery failed or blocked: {reason}",
            details={"reason": reason, "warnings": warnings or []},
            suggested_action=(
                "Inspect tool executions in UNCERTAIN state; verify external idempotency "
                "before manually reconciling task."
            ),
        )

    def diagnose_idempotency_conflict(
        self,
        task_id: str,
        trace_id: str,
        call_id: str,
        tool_name: str,
        details: dict[str, Any] | None = None,
    ) -> Diagnostic:
        return self.create_diagnostic(
            task_id=task_id,
            trace_id=trace_id,
            severity=DiagnosticSeverity.ERROR,
            category=DiagnosticCategory.IDEMPOTENCY,
            code="FG-IDEMPOTENCY-001",
            message=(
                f"Tool call '{call_id}' was invoked with conflicting arguments compared "
                f"to prior persisted invocation."
            ),
            tool_call_id=call_id,
            details={"call_id": call_id, "tool_name": tool_name, **(details or {})},
            suggested_action=(
                "Ensure tool call IDs are unique or supply identical parameters for retries."
            ),
        )

    def diagnose_cancellation(
        self,
        task_id: str,
        trace_id: str,
    ) -> Diagnostic:
        return self.create_diagnostic(
            task_id=task_id,
            trace_id=trace_id,
            severity=DiagnosticSeverity.INFO,
            category=DiagnosticCategory.CANCELLATION,
            code="FG-CANCEL-001",
            message="Task execution was explicitly cancelled.",
            suggested_action="None required; cancellation was requested.",
        )

    def diagnose_behavior_signal(
        self,
        task_id: str,
        trace_id: str,
        signal: BehaviorPatternSignal,
    ) -> Diagnostic:
        sev = (
            DiagnosticSeverity.WARNING
            if signal.pattern_type in ("repeated_calls", "repeated_arguments")
            else DiagnosticSeverity.ERROR
        )
        return self.create_diagnostic(
            task_id=task_id,
            trace_id=trace_id,
            severity=sev,
            category=DiagnosticCategory.BEHAVIOR,
            code=signal.code,
            message=signal.message,
            details={"tool_name": signal.tool_name, **signal.evidence},
            suggested_action=(
                "Inspect agent planning strategy to avoid looping or repetitive invocations."
            ),
        )

    def get_diagnostics(
        self,
        task_id: str | None = None,
        trace_id: str | None = None,
        severity: DiagnosticSeverity | None = None,
        category: DiagnosticCategory | None = None,
    ) -> list[Diagnostic]:
        res = self._diagnostics
        if task_id:
            res = [d for d in res if d.task_id == task_id]
        if trace_id:
            res = [d for d in res if d.trace_id == trace_id]
        if severity:
            res = [d for d in res if d.severity == severity]
        if category:
            res = [d for d in res if d.category == category]
        return res
