from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

import httpx

from forgeguard.sdk.exceptions import (
    APIConnectionError,
    AuthenticationError,
    BudgetExceededAPIError,
    ConflictError,
    ForgeGuardSDKError,
    NotFoundError,
    PolicyViolationAPIError,
    UnrecoverableTaskAPIError,
)
from forgeguard.sdk.models import (
    DiagnosticInfo,
    SSEEvent,
    TaskCancelInfo,
    TaskInfo,
    TaskResult,
    TaskResumeInfo,
    WorkspaceInfo,
)


def _handle_error_response(response: httpx.Response) -> None:
    """Parse error envelope and raise corresponding typed SDK exception."""
    try:
        data = response.json()
        err = data.get("error", {})
        code = err.get("code", f"HTTP_{response.status_code}")
        message = err.get("message", response.text)
        details = err.get("details")
    except Exception:
        code = f"HTTP_{response.status_code}"
        message = response.text or "Unknown error"
        details = None

    if response.status_code == 401:
        raise AuthenticationError(message, status_code=401, code=code, details=details)
    elif response.status_code == 403:
        if "POLICY" in code:
            raise PolicyViolationAPIError(message, status_code=403, code=code, details=details)
        raise AuthenticationError(message, status_code=403, code=code, details=details)
    elif response.status_code == 404:
        raise NotFoundError(message, status_code=404, code=code, details=details)
    elif response.status_code == 409:
        if "RECOVERY" in code:
            raise UnrecoverableTaskAPIError(message, status_code=409, code=code, details=details)
        raise ConflictError(message, status_code=409, code=code, details=details)
    elif response.status_code == 429:
        raise BudgetExceededAPIError(message, status_code=429, code=code, details=details)
    else:
        raise ForgeGuardSDKError(
            message, status_code=response.status_code, code=code, details=details
        )


def _parse_sse_line_stream(lines: Iterator[str]) -> Iterator[SSEEvent]:
    """Parse a generator of SSE lines into structured SSEEvent objects."""
    current_id: str | None = None
    current_event: str = "message"
    data_lines: list[str] = []

    for raw_line in lines:
        line = raw_line.rstrip("\r\n")
        if not line:
            if data_lines:
                raw_data = "\n".join(data_lines)
                try:
                    payload = json.loads(raw_data)
                except Exception:
                    payload = {"raw": raw_data}
                yield SSEEvent(
                    event_id=current_id,
                    event_type=current_event,
                    data=payload,
                    raw=raw_data,
                )
                data_lines = []
                current_event = "message"
            continue

        if line.startswith(":"):
            # Comment / keepalive
            continue
        elif line.startswith("id:"):
            current_id = line[3:].strip()
        elif line.startswith("event:"):
            current_event = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].strip())


async def _parse_async_sse_line_stream(lines: AsyncIterator[str]) -> AsyncIterator[SSEEvent]:
    """Parse an async generator of SSE lines into structured SSEEvent objects."""
    current_id: str | None = None
    current_event: str = "message"
    data_lines: list[str] = []

    async for raw_line in lines:
        line = raw_line.rstrip("\r\n")
        if not line:
            if data_lines:
                raw_data = "\n".join(data_lines)
                try:
                    payload = json.loads(raw_data)
                except Exception:
                    payload = {"raw": raw_data}
                yield SSEEvent(
                    event_id=current_id,
                    event_type=current_event,
                    data=payload,
                    raw=raw_data,
                )
                data_lines = []
                current_event = "message"
            continue

        if line.startswith(":"):
            continue
        elif line.startswith("id:"):
            current_id = line[3:].strip()
        elif line.startswith("event:"):
            current_event = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].strip())


class ForgeGuardClient:
    """Synchronous developer client for the ForgeGuard runtime API."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8000",
        api_key: str | None = None,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._owns_http = http_client is None
        headers: dict[str, str] = {}
        if api_key:
            headers["X-API-Key"] = api_key
        if http_client is not None:
            self._http = http_client
            if api_key:
                self._http.headers["X-API-Key"] = api_key
        else:
            self._http = httpx.Client(
                base_url=self.base_url,
                headers=headers,
                timeout=timeout,
                transport=transport,
            )

    def __enter__(self) -> ForgeGuardClient:
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_http:
            self._http.close()

    def submit(
        self,
        prompt: str,
        workspace_id: str | None = None,
        execution_mode: str = "agent",
        tool_calls: list[dict[str, Any]] | None = None,
        metadata: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> TaskInfo:
        """Submit a governed execution task."""
        payload: dict[str, Any] = {
            "prompt": prompt,
            "workspace_id": workspace_id,
            "execution_mode": execution_mode,
            "metadata": metadata or {},
        }
        if tool_calls:
            payload["tool_calls"] = tool_calls

        headers: dict[str, str] = {}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        try:
            res = self._http.post("/api/v1/tasks", json=payload, headers=headers)
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        data = res.json()
        return TaskInfo(**data)

    def get_task(self, task_id: str) -> TaskInfo:
        """Retrieve task details and status."""
        try:
            res = self._http.get(f"/api/v1/tasks/{task_id}")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return TaskInfo(**res.json())

    def list_tasks(
        self,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[TaskInfo]:
        """List tasks with pagination."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status

        try:
            res = self._http.get("/api/v1/tasks", params=params)
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return [TaskInfo(**item) for item in res.json().get("items", [])]

    def get_result(self, task_id: str) -> TaskResult:
        """Retrieve execution results for a task."""
        try:
            res = self._http.get(f"/api/v1/tasks/{task_id}/result")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return TaskResult(**res.json())

    def cancel(self, task_id: str) -> TaskCancelInfo:
        """Cancel an active task."""
        try:
            res = self._http.post(f"/api/v1/tasks/{task_id}/cancel")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return TaskCancelInfo(**res.json())

    def resume(self, task_id: str) -> TaskResumeInfo:
        """Resume an interrupted task from checkpoints."""
        try:
            res = self._http.post(f"/api/v1/tasks/{task_id}/resume")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return TaskResumeInfo(**res.json())

    def get_diagnostics(self, task_id: str) -> DiagnosticInfo:
        """Retrieve execution timeline and diagnostics."""
        try:
            res = self._http.get(f"/api/v1/tasks/{task_id}/diagnostics")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return DiagnosticInfo(**res.json())

    def stream_events(
        self,
        task_id: str,
        last_event_id: str | None = None,
    ) -> Iterator[SSEEvent]:
        """Stream execution events in real time."""
        headers: dict[str, str] = {}
        if last_event_id:
            headers["Last-Event-ID"] = str(last_event_id)

        try:
            with self._http.stream(
                "GET", f"/api/v1/tasks/{task_id}/events", headers=headers, timeout=None
            ) as response:
                if not response.is_success:
                    _handle_error_response(response)
                yield from _parse_sse_line_stream(response.iter_lines())
        except httpx.RequestError as exc:
            raise APIConnectionError(f"SSE stream connection failed: {exc}") from exc

    def register_workspace(
        self,
        name: str,
        root_path: str,
        workspace_id: str | None = None,
        description: str = "",
    ) -> WorkspaceInfo:
        """Register an approved workspace directory."""
        payload = {
            "name": name,
            "root_path": root_path,
            "workspace_id": workspace_id,
            "description": description,
        }
        try:
            res = self._http.post("/api/v1/workspaces", json=payload)
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return WorkspaceInfo(**res.json())

    def list_workspaces(self) -> list[WorkspaceInfo]:
        """List registered workspaces."""
        try:
            res = self._http.get("/api/v1/workspaces")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return [WorkspaceInfo(**w) for w in res.json().get("workspaces", [])]

    def get_workspace(self, workspace_id: str) -> WorkspaceInfo:
        """Get details for a registered workspace."""
        try:
            res = self._http.get(f"/api/v1/workspaces/{workspace_id}")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return WorkspaceInfo(**res.json())

    def delete_workspace(self, workspace_id: str) -> bool:
        """Unregister a workspace."""
        try:
            res = self._http.delete(f"/api/v1/workspaces/{workspace_id}")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return res.status_code == 204


class AsyncForgeGuardClient:
    """Asynchronous developer client for the ForgeGuard runtime API."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8000",
        api_key: str | None = None,
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._owns_http = http_client is None
        headers: dict[str, str] = {}
        if api_key:
            headers["X-API-Key"] = api_key
        if http_client is not None:
            self._http = http_client
            if api_key:
                self._http.headers["X-API-Key"] = api_key
        else:
            self._http = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=timeout,
                transport=transport,
            )

    async def __aenter__(self) -> AsyncForgeGuardClient:
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()

    async def close(self) -> None:
        if self._owns_http:
            await self._http.aclose()

    async def submit(
        self,
        prompt: str,
        workspace_id: str | None = None,
        execution_mode: str = "agent",
        tool_calls: list[dict[str, Any]] | None = None,
        metadata: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> TaskInfo:
        payload: dict[str, Any] = {
            "prompt": prompt,
            "workspace_id": workspace_id,
            "execution_mode": execution_mode,
            "metadata": metadata or {},
        }
        if tool_calls:
            payload["tool_calls"] = tool_calls

        headers: dict[str, str] = {}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        try:
            res = await self._http.post("/api/v1/tasks", json=payload, headers=headers)
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return TaskInfo(**res.json())

    async def get_task(self, task_id: str) -> TaskInfo:
        try:
            res = await self._http.get(f"/api/v1/tasks/{task_id}")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return TaskInfo(**res.json())

    async def list_tasks(
        self,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[TaskInfo]:
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status

        try:
            res = await self._http.get("/api/v1/tasks", params=params)
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return [TaskInfo(**item) for item in res.json().get("items", [])]

    async def get_result(self, task_id: str) -> TaskResult:
        try:
            res = await self._http.get(f"/api/v1/tasks/{task_id}/result")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return TaskResult(**res.json())

    async def cancel(self, task_id: str) -> TaskCancelInfo:
        try:
            res = await self._http.post(f"/api/v1/tasks/{task_id}/cancel")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return TaskCancelInfo(**res.json())

    async def resume(self, task_id: str) -> TaskResumeInfo:
        try:
            res = await self._http.post(f"/api/v1/tasks/{task_id}/resume")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return TaskResumeInfo(**res.json())

    async def get_diagnostics(self, task_id: str) -> DiagnosticInfo:
        try:
            res = await self._http.get(f"/api/v1/tasks/{task_id}/diagnostics")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return DiagnosticInfo(**res.json())

    async def stream_events(
        self,
        task_id: str,
        last_event_id: str | None = None,
    ) -> AsyncIterator[SSEEvent]:
        headers: dict[str, str] = {}
        if last_event_id:
            headers["Last-Event-ID"] = str(last_event_id)

        try:
            async with self._http.stream(
                "GET", f"/api/v1/tasks/{task_id}/events", headers=headers, timeout=None
            ) as response:
                if not response.is_success:
                    _handle_error_response(response)
                async for event in _parse_async_sse_line_stream(response.aiter_lines()):
                    yield event
        except httpx.RequestError as exc:
            raise APIConnectionError(f"SSE stream connection failed: {exc}") from exc

    async def register_workspace(
        self,
        name: str,
        root_path: str,
        workspace_id: str | None = None,
        description: str = "",
    ) -> WorkspaceInfo:
        payload = {
            "name": name,
            "root_path": root_path,
            "workspace_id": workspace_id,
            "description": description,
        }
        try:
            res = await self._http.post("/api/v1/workspaces", json=payload)
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return WorkspaceInfo(**res.json())

    async def list_workspaces(self) -> list[WorkspaceInfo]:
        try:
            res = await self._http.get("/api/v1/workspaces")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return [WorkspaceInfo(**w) for w in res.json().get("workspaces", [])]

    async def get_workspace(self, workspace_id: str) -> WorkspaceInfo:
        try:
            res = await self._http.get(f"/api/v1/workspaces/{workspace_id}")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return WorkspaceInfo(**res.json())

    async def delete_workspace(self, workspace_id: str) -> bool:
        try:
            res = await self._http.delete(f"/api/v1/workspaces/{workspace_id}")
        except httpx.RequestError as exc:
            raise APIConnectionError(f"Connection failed: {exc}") from exc

        if not res.is_success:
            _handle_error_response(res)

        return res.status_code == 204
