from __future__ import annotations

import hmac
import logging
from typing import Annotated

from fastapi import Depends, Header, Request

from forgeguard.api.errors import APIException
from forgeguard.config import ForgeGuardSettings, get_settings

logger = logging.getLogger("forgeguard.api.auth")


async def verify_api_key(
    request: Request,
    settings: Annotated[ForgeGuardSettings, Depends(get_settings)],
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    authorization: str | None = Header(None, alias="Authorization"),
) -> str | None:
    """Validate incoming API key using constant-time comparison."""
    # Check if explicit development mode with auth disabled
    if settings.auth_disabled:
        client_host = request.client.host if request.client else "unknown"
        if client_host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
            logger.warning(
                "Rejected unauthenticated remote connection attempt from %s with auth_disabled",
                client_host,
            )
            raise APIException(
                status_code=403,
                code="FG-AUTH-403",
                message="Unauthenticated development mode is restricted to loopback (127.0.0.1).",
            )
        return "dev-user"

    expected_key = settings.api_key
    if not expected_key:
        # If no key configured in production, raise server misconfiguration
        raise APIException(
            status_code=500,
            code="FG-AUTH-500",
            message="Server authentication is enabled but FORGEGUARD_API_KEY is not configured.",
        )

    # Extract client token from X-API-Key or Authorization: Bearer <key>
    client_key: str | None = x_api_key
    if not client_key and authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            client_key = parts[1]

    if not client_key:
        raise APIException(
            status_code=401,
            code="FG-AUTH-401",
            message="Missing required API key in X-API-Key or Authorization header.",
        )

    # Constant-time comparison to prevent timing side-channel attacks
    if not hmac.compare_digest(client_key.encode("utf-8"), expected_key.encode("utf-8")):
        raise APIException(
            status_code=401,
            code="FG-AUTH-401",
            message="Invalid API key provided.",
        )

    return "authenticated-user"
