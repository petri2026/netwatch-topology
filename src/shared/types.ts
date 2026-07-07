/**
 * Shared domain types — Network Topology + Netwatch Integration.
 */

// ─── Excel / Data Layer ────────────────────────────────────────────────────

export interface ExcelRow {
  sourceDevice: string
  sourcePort: string
  destinationDevice: string
  destinationPort: string
  cableType: CableType
  equipmentModel: string
  vlan?: string
  description?: string
  [key: string]: string | undefined
}

export type CableType = 'fiber' | 'copper' | 'sfp' | 'dac' | 'unknown'

export type ParseExcelResult =
  | {
      success: true
      rows: ExcelRow[]
      fileName: string
      sheetName: string
      totalRows: number
    }
  | {
      success: false
      error: string
    }

// ─── Graph / Topology Layer ────────────────────────────────────────────────

export interface DeviceNodeData {
  id: string
  label: string
  model: string
  deviceType: DeviceType
  imageBase64?: string
  ports: string[]
  // Live monitoring status (injected at runtime)
  liveStatus?: 'online' | 'offline' | 'connecting' | 'unknown'
  liveData?: LiveSwitchSummary
}

export interface CableLinkData {
  id: string
  sourceDevice: string
  sourcePort: string
  destinationDevice: string
  destinationPort: string
  cableType: CableType
  label: string
  vlan?: string
  description?: string
}

export type DeviceType =
  | 'switch'
  | 'router'
  | 'firewall'
  | 'server'
  | 'ap'
  | 'patch-panel'
  | 'olt'
  | 'onu'
  | 'unknown'

// ─── IPC Payloads ──────────────────────────────────────────────────────────

export interface SaveFilePayload {
  defaultPath: string
  content: string
  filters: Array<{ name: string; extensions: string[] }>
}

export type SaveFileResult =
  | { success: true; filePath: string }
  | { success: false; error: string }

export type ReadImageResult =
  | { success: true; base64DataUrl: string; fileName: string }
  | { success: false; error: string }

// ─── Netwatch / Live SSH Layer ─────────────────────────────────────────────

export interface SwitchCredentials {
  host: string
  username: string
  password: string
  port?: number
}

export type CommandPreset =
  | 'basic'
  | 'cpu_memory'
  | 'interfaces'
  | 'spanning_tree'
  | 'full_health'
  | 'showtech_full'
  | 'custom'

export interface CollectRequest {
  switches: SwitchCredentials[]
  preset: CommandPreset
  commands?: string[]
  parse_output?: boolean
  timeout_override?: number | null
}

export interface CommandResult {
  command: string
  raw_output: string
  parsed_output: Record<string, unknown> | unknown[] | null
  parse_error: string | null
  duration_ms: number
}

export interface SwitchResult {
  host: string
  success: true
  hostname: string | null
  platform: string | null
  ios_version: string | null
  commands: CommandResult[]
  total_duration_ms: number
}

export interface SwitchError {
  host: string
  success: false
  error_code: string
  detail: string
}

export interface CollectResponse {
  total: number
  succeeded: number
  failed: number
  results: (SwitchResult | SwitchError)[]
}

/** Summary of live data shown on topology nodes */
export interface LiveSwitchSummary {
  hostname: string | null
  platform: string | null
  ios_version: string | null
  cpu5sec: number | null
  memUsedPct: number | null
  lastCollectedAt: number   // Date.now()
  collectionMs: number
}

/** Backend process status */
export interface BackendStatus {
  running: boolean
  port: number | null
  pid: number | null
  error: string | null
}

/** Saved connection profile */
export interface ConnectionProfile {
  id: string
  label: string
  host: string
  username: string
  port: number
}
