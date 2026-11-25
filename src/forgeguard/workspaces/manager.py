from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from forgeguard.agent.tools.workspace import RestrictedWorkspaceManager
from forgeguard.api.errors import APIException
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.models import WorkspaceRecord
from forgeguard.persistence.repository import utc_iso_now

# Common dangerous or sensitive system paths that cannot be registered as workspaces
_FORBIDDEN_ROOTS = {
    "/",
    "/etc",
    "/bin",
    "/sbin",
    "/usr",
    "/var",
    "/root",
    "c:\\",
    "c:\\windows",
    "c:\\windows\\system32",
    "c:\\program files",
    "c:\\program files (x86)",
}


class WorkspaceRegistry:
    """Manages secure registration and validation of approved workspace roots."""

    def __init__(self, persistence: PersistenceManager) -> None:
        self.persistence = persistence

    async def register_workspace(
        self,
        name: str,
        root_path: str,
        workspace_id: str | None = None,
        description: str = "",
    ) -> WorkspaceRecord:
        """Validate and securely register a workspace path."""
        # 1. Resolve and validate path
        try:
            resolved = Path(root_path).resolve()
        except Exception as exc:
            raise APIException(
                status_code=400,
                code="FG-WORKSPACE-400",
                message=f"Invalid workspace path: {exc}",
            ) from exc

        if not resolved.exists():
            raise APIException(
                status_code=400,
                code="FG-WORKSPACE-400",
                message=f"Workspace path does not exist: '{root_path}'",
            )

        if not resolved.is_dir():
            raise APIException(
                status_code=400,
                code="FG-WORKSPACE-400",
                message=f"Workspace path is not a directory: '{root_path}'",
            )

        # 2. Check for dangerous system root directories
        norm_str = str(resolved).lower().rstrip("/\\")
        if (
            norm_str in _FORBIDDEN_ROOTS
            or norm_str == ""
            or resolved.parent == resolved
            or root_path.strip() in {"/", "\\"}
        ):
            raise APIException(
                status_code=400,
                code="FG-WORKSPACE-400",
                message=f"Registration denied: '{root_path}' is a sensitive system directory.",
            )

        # 3. Create persistent record
        ws_id = workspace_id or f"ws-{uuid4().hex[:8]}"
        existing = await self.persistence.get_workspace(ws_id)
        if existing is not None:
            raise APIException(
                status_code=409,
                code="FG-WORKSPACE-409",
                message=f"Workspace with ID '{ws_id}' is already registered.",
            )

        record = WorkspaceRecord(
            workspace_id=ws_id,
            name=name,
            root_path=str(resolved),
            created_at=utc_iso_now(),
            description=description,
        )
        await self.persistence.create_workspace(record)
        return record

    async def get_workspace(self, workspace_id: str) -> WorkspaceRecord:
        """Retrieve workspace record or raise 404."""
        record = await self.persistence.get_workspace(workspace_id)
        if record is None:
            raise APIException(
                status_code=404,
                code="FG-WORKSPACE-404",
                message=f"Workspace '{workspace_id}' not found.",
            )
        return record

    async def list_workspaces(self) -> list[WorkspaceRecord]:
        """List all approved workspace registrations."""
        return await self.persistence.list_workspaces()

    async def unregister_workspace(self, workspace_id: str) -> bool:
        """Unregister workspace without deleting underlying disk files."""
        # Check existence
        await self.get_workspace(workspace_id)
        return await self.persistence.delete_workspace(workspace_id)

    def get_workspace_manager(self, record: WorkspaceRecord) -> RestrictedWorkspaceManager:
        """Obtain a RestrictedWorkspaceManager instance confined to the workspace root."""
        return RestrictedWorkspaceManager(record.root_path)
