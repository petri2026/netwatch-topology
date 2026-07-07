"""
Pydantic v2 models for the switch data domain.

Request models  → what the client sends
Response models → what the API returns
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, IPvAnyAddress


# ── Enums ─────────────────────────────────────────────────────────────────

class CommandPreset(str, Enum):
    """Named command bundles.  Add more bundles here as you expand coverage."""
    basic         = "basic"          # show version + uptime
    cpu_memory    = "cpu_memory"     # CPU + memory diagnostics
    interfaces    = "interfaces"     # Interface status + counters
    spanning_tree = "spanning_tree"  # STP topology
    full_health   = "full_health"    # All of the above combined
    showtech_full = "showtech_full"  # Full show tech-support (for Analisador tab)
    custom        = "custom"         # Use the `commands` field explicitly


# Commands associated with each preset
PRESET_COMMANDS: dict[CommandPreset, list[str]] = {
    CommandPreset.basic: [
        "show version",
        "show clock",
    ],
    CommandPreset.cpu_memory: [
        "show processes cpu sorted",
        "show processes memory sorted",
    ],
    CommandPreset.interfaces: [
        "show interfaces status",
        "show interfaces counters errors",
        "show ip interface brief",
    ],
    CommandPreset.spanning_tree: [
        "show spanning-tree summary",
        "show spanning-tree detail",
    ],
    CommandPreset.full_health: [
        "show version",
        "show clock",
        "show processes cpu sorted",
        "show processes memory sorted",
        "show interfaces status",
        "show ip interface brief",
        "show environment all",
        "show spanning-tree summary",
    ],
    CommandPreset.showtech_full: [
        "show version",
        "show clock",
        "show running-config",
        "show interfaces",
        "show interfaces status",
        "show interfaces counters errors",
        "show ip interface brief",
        "show processes cpu sorted",
        "show processes memory sorted",
        "show environment all",
        "show spanning-tree summary",
        "show spanning-tree detail",
        "show mac address-table count",
        "show ip route",
        "show cdp neighbors detail",
        "show inventory",
        "show logging",
        "show ntp status",
        "show ntp associations",
    ],
    CommandPreset.custom: [],  # populated from request
}


# ── Request models ────────────────────────────────────────────────────────

class SwitchCredentials(BaseModel):
    """SSH credentials for a single switch.  Password never logged."""
    host: str = Field(..., description="IPv4/IPv6 address or resolvable hostname")
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)
    port: int = Field(default=22, ge=1, le=65535)

    @field_validator("host")
    @classmethod
    def strip_host(cls, v: str) -> str:
        return v.strip()


class CollectRequest(BaseModel):
    """
    Body for POST /api/switches/collect.

    Either choose a `preset` OR supply an explicit `commands` list.
    If both are provided, `commands` overrides the preset list.
    """
    switches: list[SwitchCredentials] = Field(..., min_length=1, max_length=20)
    preset: CommandPreset = Field(default=CommandPreset.full_health)
    commands: list[str] = Field(
        default_factory=list,
        description="Explicit command list — overrides preset when non-empty.",
    )
    parse_output: bool = Field(
        default=True,
        description="If True, attempt TextFSM/regex parsing. False = raw text only.",
    )
    timeout_override: float | None = Field(
        default=None,
        description="Per-request SSH command timeout (seconds). Overrides env default.",
        ge=5,
        le=300,
    )

    def resolved_commands(self) -> list[str]:
        """Return the final command list, respecting preset + override logic."""
        if self.commands:
            return [c.strip() for c in self.commands if c.strip()]
        return PRESET_COMMANDS.get(self.preset, [])


# ── Response models ───────────────────────────────────────────────────────

class CommandResult(BaseModel):
    """Result for a single command on a single switch."""
    command: str
    raw_output: str
    parsed_output: dict[str, Any] | list[Any] | None = None
    parse_error: str | None = None
    duration_ms: float


class SwitchResult(BaseModel):
    """Aggregated result for one switch (success path)."""
    host: str
    success: bool = True
    hostname: str | None = None          # extracted from show version / prompt
    platform: str | None = None          # e.g. "Stratix 5700" / "WS-C2960"
    ios_version: str | None = None
    commands: list[CommandResult] = Field(default_factory=list)
    total_duration_ms: float = 0.0


class SwitchError(BaseModel):
    """Error result for one switch (failure path)."""
    host: str
    success: bool = False
    error_code: str
    detail: str


class CollectResponse(BaseModel):
    """Top-level response envelope for POST /api/switches/collect."""
    total: int
    succeeded: int
    failed: int
    results: list[SwitchResult | SwitchError]
