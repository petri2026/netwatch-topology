"""
Network Service — async SSH connection layer using Scrapli.

Responsibilities:
  - Open / close SSH sessions to Cisco IOS / Allen-Bradley Stratix devices.
  - Execute command lists and capture raw output.
  - Map Scrapli / asyncssh exceptions to Netwatch domain exceptions.
  - Enforce concurrent session limits via asyncio.Semaphore.
  - Extract basic device metadata (hostname, platform, IOS version)
    from 'show version' output when available.

Thread safety: every method is async. Call from FastAPI async path handlers.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from scrapli import AsyncScrapli
from scrapli.exceptions import (
    ScrapliAuthenticationFailed,
    ScrapliConnectionError,
    ScrapliTimeout,
)

from app.core.config import settings
from app.core.exceptions import (
    AuthenticationError,
    CommandExecutionError,
    ConnectionTimeoutError,
    HostUnreachableError,
    SessionLimitError,
)
from app.models.switch import SwitchCredentials, CommandResult
from app.services.parser_service import parse_command_output

logger = logging.getLogger("netwatch.network")

# Global semaphore — created once, shared across all requests
_session_semaphore: asyncio.Semaphore | None = None


def get_semaphore() -> asyncio.Semaphore:
    global _session_semaphore
    if _session_semaphore is None:
        _session_semaphore = asyncio.Semaphore(settings.max_concurrent_sessions)
    return _session_semaphore


# ── Scrapli driver factory ────────────────────────────────────────────────

def _build_scrapli_driver(
    credentials: SwitchCredentials,
    timeout_override: float | None = None,
) -> AsyncScrapli:
    """
    Build an AsyncScrapli driver configured for Cisco IOS.

    Allen-Bradley Stratix devices run Cisco IOS firmware,
    so 'cisco_iosxe' platform behaves identically on both.
    """
    cmd_timeout = timeout_override or settings.ssh_command_timeout

    return AsyncScrapli(
        host=credentials.host,
        port=credentials.port,
        auth_username=credentials.username,
        auth_password=credentials.password,
        auth_strict_key=False,         # Industrial env — no known_hosts
        platform="cisco_iosxe",
        transport=settings.scrapli_transport,
        timeout_socket=settings.ssh_connect_timeout,
        timeout_transport=settings.ssh_auth_timeout,
        timeout_ops=cmd_timeout,
        ssh_config_file=False,
        transport_options={
            "asyncssh": {
                "known_hosts": None,    # skip host key verification
                "server_host_key_algs": [
                    # Old Stratix firmware uses legacy key types
                    "ssh-rsa",
                    "rsa-sha2-256",
                    "rsa-sha2-512",
                    "ecdsa-sha2-nistp256",
                ],
                "encryption_algs": [
                    "aes128-ctr", "aes192-ctr", "aes256-ctr",
                    "aes128-cbc", "3des-cbc",   # legacy Stratix compat
                ],
            }
        },
    )


# ── Session context manager ───────────────────────────────────────────────

@asynccontextmanager
async def _ssh_session(
    credentials: SwitchCredentials,
    timeout_override: float | None = None,
) -> AsyncIterator[AsyncScrapli]:
    """
    Async context manager that:
      1. Acquires the concurrency semaphore.
      2. Opens the SSH connection.
      3. Yields the live driver.
      4. Always closes the connection on exit.
      5. Translates Scrapli exceptions → Netwatch domain exceptions.
    """
    sem = get_semaphore()
    host = credentials.host

    # Attempt semaphore (non-blocking to give instant 429)
    acquired = sem._value > 0  # noqa: SLF001 — check without blocking
    if not acquired:
        raise SessionLimitError(
            host=host,
            detail=(
                f"All {settings.max_concurrent_sessions} SSH sessions are in use. "
                "Retry after a moment."
            ),
        )

    async with sem:
        driver = _build_scrapli_driver(credentials, timeout_override)
        try:
            logger.info("[%s] Opening SSH connection (port %d)", host, credentials.port)
            await driver.open()
            yield driver

        except ScrapliAuthenticationFailed as exc:
            raise AuthenticationError(
                host=host,
                detail=f"SSH authentication failed for user '{credentials.username}': {exc}",
            ) from exc

        except ScrapliTimeout as exc:
            raise ConnectionTimeoutError(
                host=host,
                detail=f"Connection timed out after {settings.ssh_connect_timeout}s: {exc}",
            ) from exc

        except ScrapliConnectionError as exc:
            err_str = str(exc).lower()
            if any(k in err_str for k in ("refused", "unreachable", "no route", "network")):
                raise HostUnreachableError(
                    host=host,
                    detail=f"Host unreachable or connection refused: {exc}",
                ) from exc
            raise HostUnreachableError(
                host=host,
                detail=f"SSH connection error: {exc}",
            ) from exc

        except OSError as exc:
            # asyncssh raises raw OSError for "no route to host" etc.
            raise HostUnreachableError(
                host=host,
                detail=f"Network-level error: {exc}",
            ) from exc

        finally:
            try:
                if driver.isalive():
                    await driver.close()
                    logger.info("[%s] SSH connection closed", host)
            except Exception:  # noqa: BLE001 — best-effort close
                pass


# ── Command execution ─────────────────────────────────────────────────────

async def _execute_command(
    driver: AsyncScrapli,
    command: str,
    host: str,
    parse: bool = True,
) -> CommandResult:
    """Send one command and return a CommandResult."""
    t0 = time.perf_counter()

    try:
        response = await driver.send_command(command)
        raw_output = response.result
    except ScrapliTimeout as exc:
        raise CommandExecutionError(
            host=host,
            detail=f"Command '{command}' timed out: {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise CommandExecutionError(
            host=host,
            detail=f"Unexpected error executing '{command}': {exc}",
        ) from exc

    duration_ms = (time.perf_counter() - t0) * 1000

    # Attempt parsing
    parsed_output = None
    parse_error = None
    if parse:
        parsed_output, parse_error = parse_command_output(command, raw_output)

    return CommandResult(
        command=command,
        raw_output=raw_output,
        parsed_output=parsed_output,
        parse_error=parse_error,
        duration_ms=round(duration_ms, 2),
    )


# ── Metadata extraction ───────────────────────────────────────────────────

def _extract_metadata(results: list[CommandResult]) -> dict[str, str | None]:
    """Pull hostname, platform, ios_version from 'show version' if present."""
    meta: dict[str, str | None] = {
        "hostname": None,
        "platform": None,
        "ios_version": None,
    }
    for r in results:
        if r.command.lower().startswith("show version") and r.parsed_output:
            po = r.parsed_output
            if isinstance(po, dict):
                meta["hostname"]    = po.get("hostname")
                meta["platform"]    = po.get("model")
                meta["ios_version"] = po.get("ios_version")
            break
    return meta


# ── Public API ────────────────────────────────────────────────────────────

async def collect_switch_data(
    credentials: SwitchCredentials,
    commands: list[str],
    parse_output: bool = True,
    timeout_override: float | None = None,
) -> tuple[list[CommandResult], dict[str, str | None]]:
    """
    Connect to a switch, execute `commands` sequentially, and return results.

    Returns:
        (list[CommandResult], metadata_dict)

    Raises:
        Any subclass of NetworkException on connection/auth/command failure.
    """
    if not commands:
        logger.warning("[%s] No commands supplied — nothing to collect", credentials.host)
        return [], {}

    t0 = time.perf_counter()
    results: list[CommandResult] = []

    async with _ssh_session(credentials, timeout_override) as driver:
        logger.info(
            "[%s] Executing %d command(s): %s",
            credentials.host,
            len(commands),
            commands,
        )
        for cmd in commands:
            result = await _execute_command(driver, cmd, credentials.host, parse_output)
            results.append(result)
            logger.debug(
                "[%s] '%s' → %d chars in %.1fms",
                credentials.host,
                cmd,
                len(result.raw_output),
                result.duration_ms,
            )

    total_ms = (time.perf_counter() - t0) * 1000
    logger.info(
        "[%s] Collected %d commands in %.1fms",
        credentials.host, len(results), total_ms,
    )

    metadata = _extract_metadata(results)
    return results, metadata


async def test_connectivity(credentials: SwitchCredentials) -> dict[str, object]:
    """
    Quick connectivity probe — just open the session, get the prompt, close.
    Used by GET /api/switches/ping.
    """
    t0 = time.perf_counter()
    async with _ssh_session(credentials) as driver:
        prompt = await driver.get_prompt()
    duration_ms = (time.perf_counter() - t0) * 1000
    return {
        "host": credentials.host,
        "reachable": True,
        "prompt": prompt,
        "duration_ms": round(duration_ms, 2),
    }
