from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class ExecutionEvent:
    event_type: str
    timestamp: datetime
    payload: dict[str, Any]

    @classmethod
    def create(
        cls,
        event_type: str,
        payload: dict[str, Any] | None = None,
    ) -> "ExecutionEvent":
        return cls(
            event_type=event_type,
            timestamp=datetime.now(timezone.utc),
            payload=payload or {},
        )
