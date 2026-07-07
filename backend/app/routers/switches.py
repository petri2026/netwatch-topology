"""
Router: /api/switches

Endpoints:
  POST /api/switches/collect   — collect data from one or more switches
  POST /api/switches/ping      — test SSH reachability (no commands)
  GET  /api/switches/presets   — list available command presets
  GET  /api/switches/parsers   — list registered parser commands
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.core.exceptions import NetworkException
from app.models.switch import (
    CollectRequest,
    CollectResponse,
    CommandPreset,
    PRESET_COMMANDS,
    SwitchCredentials,
    SwitchError,
    SwitchResult,
)
from app.services.network_service import collect_switch_data, test_connectivity
from app.services.parser_service import PARSER_REGISTRY

logger = logging.getLogger("netwatch.routers.switches")

router = APIRouter(prefix="/api/switches", tags=["switches"])


# ── Helper ────────────────────────────────────────────────────────────────

async def _collect_one(
    creds: SwitchCredentials,
    commands: list[str],
    parse_output: bool,
    timeout_override: float | None,
) -> SwitchResult | SwitchError:
    """
    Collect data from a single switch.
    Catches all NetworkException subclasses and converts to SwitchError.
    Never raises — caller always gets a typed result.
    """
    t0 = time.perf_counter()
    try:
        cmd_results, metadata = await collect_switch_data(
            credentials=creds,
            commands=commands,
            parse_output=parse_output,
            timeout_override=timeout_override,
        )
        total_ms = (time.perf_counter() - t0) * 1000
        return SwitchResult(
            host=creds.host,
            success=True,
            hostname=metadata.get("hostname"),
            platform=metadata.get("platform"),
            ios_version=metadata.get("ios_version"),
            commands=cmd_results,
            total_duration_ms=round(total_ms, 2),
        )

    except NetworkException as exc:
        logger.warning("[%s] %s: %s", creds.host, exc.error_code, exc.detail)
        return SwitchError(
            host=creds.host,
            error_code=exc.error_code,
            detail=exc.detail,
        )

    except Exception as exc:  # noqa: BLE001 — safety net
        logger.exception("[%s] Unexpected error during collection", creds.host)
        return SwitchError(
            host=creds.host,
            error_code="UNEXPECTED_ERROR",
            detail=str(exc),
        )


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post(
    "/collect",
    response_model=CollectResponse,
    summary="Collect CLI data from one or more switches",
    description=(
        "Opens an SSH session per switch (concurrently), executes the "
        "resolved command list, and returns raw + parsed output. "
        "Partial failures are included in the `results` array with "
        "`success: false` — the endpoint itself always returns 200."
    ),
)
async def collect(body: CollectRequest) -> CollectResponse:
    commands = body.resolved_commands()

    if not commands:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "No commands resolved. Either select a non-empty preset "
                "or supply an explicit `commands` list."
            ),
        )

    logger.info(
        "Collect request: %d switch(es), %d command(s), preset=%s",
        len(body.switches),
        len(commands),
        body.preset.value,
    )

    # Run all switches concurrently (semaphore inside the service caps parallelism)
    tasks = [
        _collect_one(
            creds=sw,
            commands=commands,
            parse_output=body.parse_output,
            timeout_override=body.timeout_override,
        )
        for sw in body.switches
    ]
    results: list[SwitchResult | SwitchError] = await asyncio.gather(*tasks)

    succeeded = sum(1 for r in results if r.success)
    failed    = len(results) - succeeded

    return CollectResponse(
        total=len(results),
        succeeded=succeeded,
        failed=failed,
        results=results,
    )


@router.post(
    "/ping",
    summary="Test SSH reachability without executing commands",
    response_model=dict[str, Any],
)
async def ping(creds: SwitchCredentials) -> dict[str, Any]:
    """Quick connectivity probe — opens SSH, grabs the prompt, closes."""
    try:
        result = await test_connectivity(creds)
        return {"success": True, **result}
    except NetworkException as exc:
        return {
            "success":    False,
            "host":       creds.host,
            "error_code": exc.error_code,
            "detail":     exc.detail,
        }


@router.get(
    "/presets",
    summary="List available command presets and their commands",
    response_model=dict[str, list[str]],
)
async def list_presets() -> dict[str, list[str]]:
    return {preset.value: cmds for preset, cmds in PRESET_COMMANDS.items()}


@router.get(
    "/parsers",
    summary="List commands that have registered parsers",
    response_model=list[str],
)
async def list_parsers() -> list[str]:
    return sorted(PARSER_REGISTRY.keys())
