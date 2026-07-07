"""
Parser Service — pluggable parsing layer.

Architecture:
  - Each command maps to a dedicated parser function via PARSER_REGISTRY.
  - Parsers return a dict (structured) or list (tabular data).
  - If parsing fails, the raw text is still returned — never a hard failure.
  - DROP YOUR EXISTING FUNCTIONS HERE — just add them to PARSER_REGISTRY.

Adding your own parsers:
  1. Write a function with signature: (raw: str) -> dict | list
  2. Register it: PARSER_REGISTRY["show my command"] = my_parser_fn
"""

from __future__ import annotations

import re
import logging
from typing import Any, Callable

logger = logging.getLogger("netwatch.parser")

# ── Type alias ────────────────────────────────────────────────────────────
ParserFn = Callable[[str], dict[str, Any] | list[Any]]


# ═══════════════════════════════════════════════════════════════════════════
# Individual parser functions
# Each function receives the raw CLI output string and returns structured data.
# ═══════════════════════════════════════════════════════════════════════════

def parse_show_version(raw: str) -> dict[str, Any]:
    """
    Parse 'show version' output from Cisco IOS / Allen-Bradley Stratix.
    Extracts: hostname, ios_version, uptime, model, serial, reload_reason.
    """
    result: dict[str, Any] = {}

    patterns = {
        "hostname":      r"^(\S+)\s+uptime is",
        "ios_version":   r"Cisco IOS Software.*Version\s+([\d\w().]+)",
        "uptime":        r"\S+\s+uptime is\s+(.+)",
        "model":         r"[Mm]odel\s+[Nn]umber\s*:\s*(\S+)",
        "model_alt":     r"cisco\s+(\S+)\s+\(revision",
        "serial":        r"[Ss]ystem\s+[Ss]erial\s+[Nn]umber\s*:\s*(\S+)",
        "reload_reason": r"Last reload reason:\s+(.+)",
        "image":         r"System image file is\s+\"(.+?)\"",
    }

    for key, pattern in patterns.items():
        m = re.search(pattern, raw, re.MULTILINE)
        if m:
            real_key = key if key != "model_alt" else "model"
            result.setdefault(real_key, m.group(1).strip())

    # Uptime components
    uptime_raw = result.get("uptime", "")
    if uptime_raw:
        result["uptime_components"] = {
            "weeks":   _extract_int(r"(\d+)\s+week",   uptime_raw),
            "days":    _extract_int(r"(\d+)\s+day",    uptime_raw),
            "hours":   _extract_int(r"(\d+)\s+hour",   uptime_raw),
            "minutes": _extract_int(r"(\d+)\s+minute", uptime_raw),
        }

    return result


def parse_show_processes_cpu(raw: str) -> dict[str, Any]:
    """
    Parse 'show processes cpu sorted'.
    Returns: cpu_summary (5s/1m/5m) and top processes list.
    """
    result: dict[str, Any] = {"cpu_summary": {}, "processes": []}

    # Overall CPU utilization
    m = re.search(
        r"CPU utilization for five seconds:\s*(\d+)%/(\d+)%;\s*"
        r"one minute:\s*(\d+)%;\s*five minutes:\s*(\d+)%",
        raw,
    )
    if m:
        result["cpu_summary"] = {
            "five_sec_pct":  int(m.group(1)),
            "interrupt_pct": int(m.group(2)),
            "one_min_pct":   int(m.group(3)),
            "five_min_pct":  int(m.group(4)),
        }

    # Process table — only processes with any CPU activity
    proc_re = re.compile(
        r"^\s*(\d+)\s+\d+\s+\d+\s+\d+\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%"
        r"\s+\d+\s+(.+)",
        re.MULTILINE,
    )
    for pm in proc_re.finditer(raw):
        five_sec = float(pm.group(2))
        one_min  = float(pm.group(3))
        five_min = float(pm.group(4))
        if five_sec > 0 or one_min > 0 or five_min > 0:
            result["processes"].append({
                "pid":          int(pm.group(1)),
                "five_sec_pct": five_sec,
                "one_min_pct":  one_min,
                "five_min_pct": five_min,
                "process_name": pm.group(5).strip(),
            })

    # Keep top 15
    result["processes"].sort(key=lambda p: p["one_min_pct"], reverse=True)
    result["processes"] = result["processes"][:15]
    return result


def parse_show_processes_memory(raw: str) -> dict[str, Any]:
    """Parse 'show processes memory sorted'."""
    result: dict[str, Any] = {"memory_pools": {}, "top_consumers": []}

    # Processor pool
    m = re.search(
        r"Processor Pool Total:\s+(\d+)\s+Used:\s+(\d+)\s+Free:\s+(\d+)",
        raw,
    )
    if m:
        total, used, free = int(m.group(1)), int(m.group(2)), int(m.group(3))
        result["memory_pools"]["processor"] = {
            "total_bytes": total,
            "used_bytes":  used,
            "free_bytes":  free,
            "used_pct":    round(used / total * 100, 1) if total else 0,
        }

    # IO pool
    m2 = re.search(
        r"I/O Pool Total:\s+(\d+)\s+Used:\s+(\d+)\s+Free:\s+(\d+)",
        raw,
    )
    if m2:
        total2, used2, free2 = int(m2.group(1)), int(m2.group(2)), int(m2.group(3))
        result["memory_pools"]["io"] = {
            "total_bytes": total2,
            "used_bytes":  used2,
            "free_bytes":  free2,
            "used_pct":    round(used2 / total2 * 100, 1) if total2 else 0,
        }

    # Top memory consumers
    mem_re = re.compile(
        r"^\s*(\d+)\s+\d+\s+(\d+)\s+(\d+)\s+(\d+)\s+\S+\s+(.+)",
        re.MULTILINE,
    )
    for mm in mem_re.finditer(raw):
        allocated = int(mm.group(2))
        if allocated > 0:
            result["top_consumers"].append({
                "pid":            int(mm.group(1)),
                "allocated_bytes": allocated,
                "freed_bytes":    int(mm.group(3)),
                "held_bytes":     int(mm.group(4)),
                "process_name":   mm.group(5).strip(),
            })

    result["top_consumers"].sort(key=lambda p: p["held_bytes"], reverse=True)
    result["top_consumers"] = result["top_consumers"][:10]
    return result


def parse_show_interfaces_status(raw: str) -> list[dict[str, Any]]:
    """Parse 'show interfaces status' tabular output."""
    interfaces = []
    # Cisco format: Port  Name  Status  Vlan  Duplex  Speed  Type
    line_re = re.compile(
        r"^((?:Gi|Fa|Te|Hu|Tw|Fo|Po|Vl|Et|Gi|Gi)\S+)\s+"
        r"(.*?)\s{2,}"
        r"(connected|notconnect|disabled|err-disabled|monitoring)\s+"
        r"(\S+)\s+"
        r"(\S+)\s+"
        r"(\S+)\s+"
        r"(.+)?$",
        re.MULTILINE | re.IGNORECASE,
    )
    for m in line_re.finditer(raw):
        interfaces.append({
            "port":        m.group(1).strip(),
            "name":        m.group(2).strip(),
            "status":      m.group(3).strip().lower(),
            "vlan":        m.group(4).strip(),
            "duplex":      m.group(5).strip(),
            "speed":       m.group(6).strip(),
            "type":        m.group(7).strip() if m.group(7) else "",
        })
    return interfaces


def parse_show_ip_interface_brief(raw: str) -> list[dict[str, Any]]:
    """Parse 'show ip interface brief'."""
    interfaces = []
    line_re = re.compile(
        r"^(\S+)\s+([\d.]+|unassigned)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)",
        re.MULTILINE,
    )
    for m in line_re.finditer(raw):
        if m.group(1).lower() in ("interface", ""):
            continue
        interfaces.append({
            "interface":    m.group(1),
            "ip_address":   m.group(2),
            "ok":           m.group(3),
            "method":       m.group(4),
            "status":       m.group(5),
            "protocol":     m.group(6),
        })
    return interfaces


def parse_show_environment(raw: str) -> dict[str, Any]:
    """Parse 'show environment all' — temperature, power supply status."""
    result: dict[str, Any] = {"temperature": [], "power_supplies": [], "fans": []}

    # Temperature sensors
    temp_re = re.compile(r"Temperature\s+Value:\s+(\d+)\s+Degree\s+Celsius", re.IGNORECASE)
    for m in temp_re.finditer(raw):
        result["temperature"].append({"celsius": int(m.group(1))})

    # Power supply
    ps_re = re.compile(r"(PS[AB12]|Power\s+Supply\s+\S+)[:\s]+(\S+)", re.IGNORECASE)
    for m in ps_re.finditer(raw):
        result["power_supplies"].append({
            "unit":   m.group(1).strip(),
            "status": m.group(2).strip(),
        })

    return result


def parse_show_spanning_tree_summary(raw: str) -> dict[str, Any]:
    """Parse 'show spanning-tree summary'."""
    result: dict[str, Any] = {}

    m = re.search(r"Switch is in\s+(\S+)\s+mode", raw, re.IGNORECASE)
    if m:
        result["mode"] = m.group(1).lower()

    m2 = re.search(r"Root bridge for:\s+(.+)", raw, re.IGNORECASE)
    if m2:
        result["root_bridge_for"] = m2.group(1).strip()

    m3 = re.search(r"(\d+)\s+VLANs?", raw, re.IGNORECASE)
    if m3:
        result["vlan_count"] = int(m3.group(1))

    return result


def parse_show_clock(raw: str) -> dict[str, Any]:
    """Parse 'show clock'."""
    m = re.search(
        r"(\d{2}:\d{2}:\d{2}\.\d+)\s+(\w+)\s+"
        r"(\w+)\s+(\w+)\s+(\d+)\s+(\d{4})",
        raw,
    )
    if m:
        return {
            "time":     m.group(1),
            "timezone": m.group(2),
            "weekday":  m.group(3),
            "month":    m.group(4),
            "day":      int(m.group(5)),
            "year":     int(m.group(6)),
        }
    return {"raw": raw.strip()}


# ── Helper ────────────────────────────────────────────────────────────────

def _extract_int(pattern: str, text: str) -> int:
    m = re.search(pattern, text, re.IGNORECASE)
    return int(m.group(1)) if m else 0


# ═══════════════════════════════════════════════════════════════════════════
# Registry — map command → parser function
# ═══════════════════════════════════════════════════════════════════════════
#
# PLUG YOUR EXISTING PARSERS HERE.
# Key format: lowercase command string (strip extra spaces).
# Partial matches are supported: "show version" matches "show version detail" too.
#
PARSER_REGISTRY: dict[str, ParserFn] = {
    "show version":                    parse_show_version,
    "show clock":                      parse_show_clock,
    "show processes cpu":              parse_show_processes_cpu,
    "show processes memory":           parse_show_processes_memory,
    "show interfaces status":          parse_show_interfaces_status,
    "show ip interface brief":         parse_show_ip_interface_brief,
    "show environment":                parse_show_environment,
    "show spanning-tree summary":      parse_show_spanning_tree_summary,
}


# ── Public API ────────────────────────────────────────────────────────────

def parse_command_output(
    command: str,
    raw_output: str,
) -> tuple[dict[str, Any] | list[Any] | None, str | None]:
    """
    Attempt to parse `raw_output` for `command`.

    Returns:
        (parsed_data, None)         — success
        (None, error_message)       — no parser or parser raised an exception
    """
    cmd_lower = command.lower().strip()

    # Find matching parser (prefix match)
    parser_fn: ParserFn | None = None
    for registered_cmd, fn in PARSER_REGISTRY.items():
        if cmd_lower.startswith(registered_cmd):
            parser_fn = fn
            break

    if parser_fn is None:
        return None, f"No parser registered for '{command}'"

    try:
        result = parser_fn(raw_output)
        return result, None
    except Exception as exc:
        logger.warning("Parser failed for '%s': %s", command, exc)
        return None, str(exc)
