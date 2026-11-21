import pytest

from forgeguard.core.enums import TaskStatus
from forgeguard.core.exceptions import InvalidStateTransitionError
from forgeguard.core.task import Task


def test_task_starts_in_created_state():
    task = Task(description="test task")
    assert task.status == TaskStatus.CREATED


def test_task_can_transition_to_running():
    task = Task(description="test task")
    task.transition(TaskStatus.RUNNING)

    assert task.status == TaskStatus.RUNNING
    assert task.started_at is not None


def test_task_can_complete():
    task = Task(description="test task")
    task.transition(TaskStatus.RUNNING)
    task.transition(TaskStatus.COMPLETED)

    assert task.status == TaskStatus.COMPLETED
    assert task.finished_at is not None


def test_terminal_state_cannot_be_changed():
    task = Task(description="test task")
    task.transition(TaskStatus.RUNNING)
    task.transition(TaskStatus.COMPLETED)

    with pytest.raises(InvalidStateTransitionError):
        task.transition(TaskStatus.RUNNING)


def test_task_cannot_complete_without_running():
    task = Task(description="test task")

    with pytest.raises(InvalidStateTransitionError):
        task.transition(TaskStatus.COMPLETED)
