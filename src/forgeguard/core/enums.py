from enum import Enum


class TaskStatus(str, Enum):
    CREATED = "created"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ToolStatus(str, Enum):
    SUCCESS = "success"
    FAILURE = "failure"
