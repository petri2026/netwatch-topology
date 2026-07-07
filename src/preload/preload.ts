/**
 * preload.ts — Secure bridge between Electron main and React renderer.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  ParseExcelResult,
  ReadImageResult,
  SaveFilePayload,
  SaveFileResult,
  CollectRequest,
  CollectResponse,
  SwitchCredentials,
  BackendStatus,
} from '../shared/types'

const ALLOWED_CHANNELS = new Set<string>(Object.values(IPC_CHANNELS))

function assertAllowed(channel: string): void {
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw new Error(`[Preload] Unauthorized IPC channel: "${channel}"`)
  }
}

const electronAPI = {
  // ── Topology: Excel ────────────────────────────────────────────────────
  openExcelDialog: (): Promise<string | null> => {
    assertAllowed(IPC_CHANNELS.DIALOG_OPEN_EXCEL)
    return ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_EXCEL)
  },
  parseExcelFile: (filePath: string): Promise<ParseExcelResult> => {
    assertAllowed(IPC_CHANNELS.PARSE_EXCEL_FILE)
    return ipcRenderer.invoke(IPC_CHANNELS.PARSE_EXCEL_FILE, filePath)
  },

  // ── Topology: Images ───────────────────────────────────────────────────
  openImageDialog: (): Promise<string | null> => {
    assertAllowed(IPC_CHANNELS.DIALOG_OPEN_IMAGE)
    return ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_IMAGE)
  },
  readImageAsBase64: (filePath: string): Promise<ReadImageResult> => {
    assertAllowed(IPC_CHANNELS.READ_IMAGE_AS_BASE64)
    return ipcRenderer.invoke(IPC_CHANNELS.READ_IMAGE_AS_BASE64, filePath)
  },

  // ── Topology: File save ────────────────────────────────────────────────
  saveFile: (payload: SaveFilePayload): Promise<SaveFileResult> => {
    assertAllowed(IPC_CHANNELS.SAVE_FILE)
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_FILE, payload)
  },

  // ── App info ───────────────────────────────────────────────────────────
  getAppVersion: (): Promise<string> => {
    assertAllowed(IPC_CHANNELS.APP_GET_VERSION)
    return ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION)
  },

  // ── Netwatch: Backend lifecycle ────────────────────────────────────────
  getBackendStatus: (): Promise<BackendStatus> => {
    assertAllowed(IPC_CHANNELS.BACKEND_STATUS)
    return ipcRenderer.invoke(IPC_CHANNELS.BACKEND_STATUS)
  },
  startBackend: (): Promise<BackendStatus> => {
    assertAllowed(IPC_CHANNELS.BACKEND_START)
    return ipcRenderer.invoke(IPC_CHANNELS.BACKEND_START)
  },

  // ── Netwatch: SSH operations ───────────────────────────────────────────
  collectSwitchData: (req: CollectRequest): Promise<CollectResponse> => {
    assertAllowed(IPC_CHANNELS.NETWATCH_COLLECT)
    return ipcRenderer.invoke(IPC_CHANNELS.NETWATCH_COLLECT, req)
  },
  pingSwitchSsh: (creds: SwitchCredentials): Promise<{
    success: boolean
    host: string
    prompt?: string
    duration_ms?: number
    error_code?: string
    detail?: string
  }> => {
    assertAllowed(IPC_CHANNELS.NETWATCH_PING)
    return ipcRenderer.invoke(IPC_CHANNELS.NETWATCH_PING, creds)
  },
  getNetworkPresets: (): Promise<Record<string, string[]>> => {
    assertAllowed(IPC_CHANNELS.NETWATCH_GET_PRESETS)
    return ipcRenderer.invoke(IPC_CHANNELS.NETWATCH_GET_PRESETS)
  },
} as const

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
