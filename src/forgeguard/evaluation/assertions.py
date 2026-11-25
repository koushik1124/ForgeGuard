from __future__ import annotations

from typing import Any

from forgeguard.core.enums import TaskStatus
from forgeguard.evaluation.models import AssertionResult
from forgeguard.events.event import ExecutionEvent


class AssertionRecorder:
    """Collects and verifies evaluation assertions with structured evidence."""

    def __init__(self) -> None:
        self.assertions: list[AssertionResult] = []

    def record(
        self,
        name: str,
        passed: bool,
        expected: Any = None,
        actual: Any = None,
        message: str = "",
        evidence: dict[str, Any] | None = None,
    ) -> AssertionResult:
        result = AssertionResult(
            name=name,
            passed=passed,
            expected=expected,
            actual=actual,
            message=message or ("Passed" if passed else f"Expected {expected}, got {actual}"),
            evidence=evidence or {},
        )
        self.assertions.append(result)
        return result

    @property
    def all_passed(self) -> bool:
        return all(a.passed for a in self.assertions) if self.assertions else False

    @property
    def failure_messages(self) -> list[str]:
        return [f"{a.name}: {a.message}" for a in self.assertions if not a.passed]

    def assert_task_status(
        self,
        actual: TaskStatus | str,
        expected: TaskStatus | str,
    ) -> AssertionResult:
        act_val = actual.value if isinstance(actual, TaskStatus) else str(actual)
        exp_val = expected.value if isinstance(expected, TaskStatus) else str(expected)
        return self.record(
            name="task_status_check",
            passed=(act_val == exp_val),
            expected=exp_val,
            actual=act_val,
        )

    def assert_agent_status(
        self,
        actual: Any,
        expected: Any,
    ) -> AssertionResult:
        act_val = getattr(actual, "value", str(actual))
        exp_val = getattr(expected, "value", str(expected))
        return self.record(
            name="agent_status_check",
            passed=(act_val == exp_val),
            expected=exp_val,
            actual=act_val,
        )

    def assert_tool_executed(
        self,
        tool_name: str,
        events: list[ExecutionEvent],
        call_id: str | None = None,
    ) -> AssertionResult:
        executed = any(
            ev.event_type in ("tool_call_started", "tool_call_completed")
            and ev.payload.get("tool_name") == tool_name
            and (call_id is None or ev.payload.get("call_id") == call_id)
            for ev in events
        )
        return self.record(
            name=f"tool_executed_{tool_name}",
            passed=executed,
            expected=True,
            actual=executed,
            message=f"Tool '{tool_name}' must be executed.",
            evidence={"tool_name": tool_name, "call_id": call_id},
        )

    def assert_tool_not_executed(
        self,
        tool_name: str,
        events: list[ExecutionEvent],
    ) -> AssertionResult:
        executed = any(
            ev.event_type in ("tool_call_started", "tool_call_completed")
            and ev.payload.get("tool_name") == tool_name
            for ev in events
        )
        return self.record(
            name=f"tool_not_executed_{tool_name}",
            passed=not executed,
            expected=False,
            actual=executed,
            message=f"Tool '{tool_name}' must NOT execute.",
            evidence={"tool_name": tool_name},
        )

    def assert_policy_decision(
        self,
        tool_name: str,
        expected_allowed: bool,
        events: list[ExecutionEvent],
    ) -> AssertionResult:
        decision_event = next(
            (
                ev
                for ev in events
                if ev.event_type == "policy_decision" and ev.payload.get("tool_name") == tool_name
            ),
            None,
        )
        actual_allowed = decision_event.payload.get("allowed") if decision_event else None
        passed = actual_allowed == expected_allowed
        return self.record(
            name=f"policy_decision_{tool_name}",
            passed=passed,
            expected=expected_allowed,
            actual=actual_allowed,
            message=(f"Policy for '{tool_name}' must be allowed={expected_allowed}"),
            evidence=(decision_event.payload if decision_event else {"found": False}),
        )

    def assert_budget_exceeded(
        self,
        limit_name: str,
        events: list[ExecutionEvent],
    ) -> AssertionResult:
        hit = any(
            ev.event_type == "budget_exceeded" and ev.payload.get("limit") == limit_name
            for ev in events
        )
        return self.record(
            name=f"budget_exceeded_{limit_name}",
            passed=hit,
            expected=True,
            actual=hit,
            message=f"Budget limit '{limit_name}' must be triggered.",
            evidence={"limit": limit_name},
        )

    def assert_no_duplicate_calls(
        self,
        completed_call_ids: list[str],
    ) -> AssertionResult:
        has_duplicates = len(completed_call_ids) != len(set(completed_call_ids))
        return self.record(
            name="no_duplicate_calls",
            passed=not has_duplicates,
            expected="no duplicates",
            actual=f"{len(completed_call_ids)} calls, {len(set(completed_call_ids))} unique",
            evidence={"call_ids": completed_call_ids},
        )

    def assert_diagnostic_emitted(
        self,
        code: str,
        diagnostics: list[dict[str, Any]],
    ) -> AssertionResult:
        found = any(d.get("code") == code for d in diagnostics)
        return self.record(
            name=f"diagnostic_emitted_{code}",
            passed=found,
            expected=code,
            actual=[d.get("code") for d in diagnostics],
            message=f"Diagnostic code '{code}' must be emitted.",
            evidence={"codes": [d.get("code") for d in diagnostics]},
        )
