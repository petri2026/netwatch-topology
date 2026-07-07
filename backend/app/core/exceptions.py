"""
Custom exceptions for the Netwatch domain and their FastAPI error handlers.

Design:
  NetworkException (base)
  ├── AuthenticationError      → 401
  ├── ConnectionTimeoutError   → 504
  ├── HostUnreachableError     → 503
  ├── CommandExecutionError    → 500
  └── SessionLimitError        → 429
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


# ── Base ──────────────────────────────────────────────────────────────────

class NetworkException(Exception):
    """Base class for all SSH/network errors raised by the network service."""

    http_status: int = 500
    error_code: str = "NETWORK_ERROR"

    def __init__(self, host: str, detail: str) -> None:
        self.host = host
        self.detail = detail
        super().__init__(detail)

    def to_dict(self) -> dict:
        return {
            "error_code": self.error_code,
            "host": self.host,
            "detail": self.detail,
        }


# ── Specific errors ───────────────────────────────────────────────────────

class AuthenticationError(NetworkException):
    """SSH credentials rejected by the device."""
    http_status = 401
    error_code = "SSH_AUTH_FAILED"


class ConnectionTimeoutError(NetworkException):
    """TCP/SSH handshake timed out."""
    http_status = 504
    error_code = "SSH_TIMEOUT"


class HostUnreachableError(NetworkException):
    """Host is unreachable (routing / firewall / host-down)."""
    http_status = 503
    error_code = "HOST_UNREACHABLE"


class CommandExecutionError(NetworkException):
    """Command sent but device returned an unexpected error."""
    http_status = 500
    error_code = "COMMAND_EXEC_ERROR"


class SessionLimitError(NetworkException):
    """Too many concurrent SSH sessions."""
    http_status = 429
    error_code = "SESSION_LIMIT_EXCEEDED"


# ── FastAPI exception handlers ────────────────────────────────────────────

def register_exception_handlers(app: FastAPI) -> None:
    """Attach all network exception handlers to the FastAPI app."""

    @app.exception_handler(NetworkException)
    async def network_exception_handler(
        request: Request, exc: NetworkException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content={"success": False, **exc.to_dict()},
        )
