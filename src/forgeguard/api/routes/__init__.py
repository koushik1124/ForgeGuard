from __future__ import annotations

from forgeguard.api.routes.evaluations import router as evaluations_router
from forgeguard.api.routes.health import router as health_router
from forgeguard.api.routes.tasks import router as tasks_router
from forgeguard.api.routes.workspaces import router as workspaces_router

__all__ = ["evaluations_router", "health_router", "tasks_router", "workspaces_router"]
