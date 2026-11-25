from __future__ import annotations

import pytest

from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.budgets.exceptions import (
    InvalidBudgetConfigError,
    OutputSizeExceededError,
    ToolCallLimitExceededError,
)
from forgeguard.budgets.tracker import BudgetTracker, calculate_output_bytes


def test_invalid_budget_config() -> None:
    # Zero or negative values
    with pytest.raises(InvalidBudgetConfigError):
        ExecutionBudget(max_tool_calls=0)

    with pytest.raises(InvalidBudgetConfigError):
        ExecutionBudget(max_tool_calls=-1)

    with pytest.raises(InvalidBudgetConfigError):
        ExecutionBudget(max_execution_seconds=0.0)

    with pytest.raises(InvalidBudgetConfigError):
        ExecutionBudget(max_execution_seconds=-5.0)

    with pytest.raises(InvalidBudgetConfigError):
        ExecutionBudget(max_consecutive_failures=0)

    with pytest.raises(InvalidBudgetConfigError):
        ExecutionBudget(max_output_bytes=0)

    with pytest.raises(InvalidBudgetConfigError):
        ExecutionBudget(max_tool_duration_seconds=0.0)

    # Boolean values should be rejected (even though bool is a subclass of int in Python)
    with pytest.raises(InvalidBudgetConfigError):
        ExecutionBudget(max_tool_calls=True)

    with pytest.raises(InvalidBudgetConfigError):
        ExecutionBudget(max_consecutive_failures=True)


def test_initial_tracker_state() -> None:
    budget = ExecutionBudget(
        max_tool_calls=10,
        max_execution_seconds=60.0,
        max_consecutive_failures=3,
        max_output_bytes=5000,
        max_tool_duration_seconds=15.0,
    )
    tracker = BudgetTracker(budget)

    assert tracker.tool_calls_reserved == 0
    assert tracker.successful_tool_calls == 0
    assert tracker.failed_tool_calls == 0
    assert tracker.consecutive_failures == 0
    assert tracker.cumulative_output_bytes == 0
    assert tracker.remaining_tool_calls == 10
    assert tracker.remaining_output_bytes == 5000
    assert tracker.remaining_seconds == 60.0
    assert tracker.elapsed_seconds == 0.0
    assert tracker.is_deadline_exceeded() is False
    assert tracker.can_reserve_tool_call() is True


def test_tool_call_reservation_and_exhaustion() -> None:
    budget = ExecutionBudget(max_tool_calls=2)
    tracker = BudgetTracker(budget)

    assert tracker.can_reserve_tool_call() is True
    tracker.reserve_tool_call()
    assert tracker.tool_calls_reserved == 1
    assert tracker.remaining_tool_calls == 1

    tracker.reserve_tool_call()
    assert tracker.tool_calls_reserved == 2
    assert tracker.remaining_tool_calls == 0
    assert tracker.can_reserve_tool_call() is False

    with pytest.raises(ToolCallLimitExceededError):
        tracker.reserve_tool_call()


def test_failed_tool_calls_consume_call_budget() -> None:
    budget = ExecutionBudget(max_tool_calls=3)
    tracker = BudgetTracker(budget)

    tracker.reserve_tool_call()
    tracker.record_tool_failure()
    assert tracker.tool_calls_reserved == 1
    assert tracker.failed_tool_calls == 1
    assert tracker.remaining_tool_calls == 2

    tracker.reserve_tool_call()
    tracker.record_tool_failure(is_timeout=True)
    assert tracker.tool_calls_reserved == 2
    assert tracker.failed_tool_calls == 2
    assert tracker.timed_out_tool_calls == 1
    assert tracker.remaining_tool_calls == 1


def test_elapsed_time_and_remaining_time_tracking() -> None:
    current_time = 100.0

    def mock_clock() -> float:
        return current_time

    budget = ExecutionBudget(max_execution_seconds=10.0)
    tracker = BudgetTracker(budget, time_provider=mock_clock)

    assert tracker.elapsed_seconds == 0.0
    assert tracker.remaining_seconds == 10.0

    tracker.start()
    current_time = 104.5
    assert tracker.elapsed_seconds == 4.5
    assert tracker.remaining_seconds == 5.5
    assert tracker.is_deadline_exceeded() is False

    current_time = 110.0
    assert tracker.elapsed_seconds == 10.0
    assert tracker.remaining_seconds == 0.0
    assert tracker.is_deadline_exceeded() is True

    current_time = 115.0
    assert tracker.elapsed_seconds == 15.0
    assert tracker.remaining_seconds == 0.0
    assert tracker.is_deadline_exceeded() is True


def test_failure_counter_and_consecutive_failure_limit() -> None:
    budget = ExecutionBudget(max_consecutive_failures=2)
    tracker = BudgetTracker(budget)

    assert tracker.is_consecutive_failures_exceeded() is False

    tracker.record_tool_failure()
    assert tracker.consecutive_failures == 1
    assert tracker.is_consecutive_failures_exceeded() is False

    tracker.record_tool_failure()
    assert tracker.consecutive_failures == 2
    assert tracker.is_consecutive_failures_exceeded() is True


def test_success_resets_failure_counter() -> None:
    budget = ExecutionBudget(max_consecutive_failures=3)
    tracker = BudgetTracker(budget)

    tracker.record_tool_failure()
    tracker.record_tool_failure()
    assert tracker.consecutive_failures == 2

    tracker.record_tool_success(output_bytes=50)
    assert tracker.consecutive_failures == 0
    assert tracker.successful_tool_calls == 1
    assert tracker.cumulative_output_bytes == 50
    assert tracker.is_consecutive_failures_exceeded() is False


def test_output_size_accounting() -> None:
    budget = ExecutionBudget(max_output_bytes=100)
    tracker = BudgetTracker(budget)

    tracker.validate_output_size(40)
    tracker.record_tool_success(40)
    assert tracker.cumulative_output_bytes == 40
    assert tracker.remaining_output_bytes == 60

    tracker.validate_output_size(60)
    tracker.record_tool_success(60)
    assert tracker.cumulative_output_bytes == 100
    assert tracker.remaining_output_bytes == 0

    with pytest.raises(OutputSizeExceededError):
        tracker.validate_output_size(1)


def test_utf8_multibyte_output_sizing() -> None:
    # "café" -> 'é' is 2 bytes in UTF-8 -> 5 bytes total
    assert calculate_output_bytes("café") == 5

    # "こんにちは" -> each character is 3 bytes in UTF-8 -> 15 bytes total
    assert calculate_output_bytes("こんにちは") == 15

    # Emoji 🌟 is 4 bytes
    assert calculate_output_bytes("🌟") == 4


def test_calculate_output_bytes_types() -> None:
    # None returns 0 bytes
    assert calculate_output_bytes(None) == 0

    # Raw bytes
    assert calculate_output_bytes(b"hello raw") == 9

    # Dict deterministic formatting
    # {"a": 1, "b": 2} -> {"a":1,"b":2} -> 13 bytes
    assert calculate_output_bytes({"a": 1, "b": 2}) == 13
    assert calculate_output_bytes({"b": 2, "a": 1}) == 13

    # List
    assert calculate_output_bytes([1, 2, 3]) == 7

    # Numbers and booleans
    assert calculate_output_bytes(100) == 3
    assert calculate_output_bytes(True) == 4
    assert calculate_output_bytes(False) == 5


def test_tracker_snapshot_fields() -> None:
    budget = ExecutionBudget(
        max_tool_calls=5,
        max_execution_seconds=30.0,
        max_consecutive_failures=2,
        max_output_bytes=1000,
        max_tool_duration_seconds=10.0,
    )
    tracker = BudgetTracker(budget)
    tracker.start()
    tracker.reserve_tool_call()
    tracker.record_tool_success(output_bytes=120)

    snap = tracker.snapshot()
    assert snap["max_tool_calls"] == 5
    assert snap["tool_calls_reserved"] == 1
    assert snap["remaining_tool_calls"] == 4
    assert snap["successful_tool_calls"] == 1
    assert snap["failed_tool_calls"] == 0
    assert snap["consecutive_failures"] == 0
    assert snap["max_consecutive_failures"] == 2
    assert snap["max_execution_seconds"] == 30.0
    assert snap["max_output_bytes"] == 1000
    assert snap["cumulative_output_bytes"] == 120
    assert snap["remaining_output_bytes"] == 880
    assert snap["max_tool_duration_seconds"] == 10.0
    assert snap["timed_out_tool_calls"] == 0
    assert "elapsed_seconds" in snap
    assert "remaining_seconds" in snap
