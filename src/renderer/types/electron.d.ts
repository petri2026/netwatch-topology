import type {
  ParseExcelResult,
  ReadImageResult,
  SaveFilePayload,
  SaveFileResult,
  CollectRequest,
  CollectResponse,
  SwitchCredentials,
  BackendStatus,
} from '@shared/types'

declare global {
  interface Window {
    electronAPI?: {
      // ── Topology ──────────────────────────────────────────────────────
      openExcelDialog: () => Promise<string | null>
      parseExcelFile: (filePath: string) => Promise<ParseExcelResult>
      openImageDialog: () => Promise<string | null>
      readImageAsBase64: (filePath: string) => Promise<ReadImageResult>
      saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult>
      getAppVersion: () => Promise<string>

      // ── Netwatch ──────────────────────────────────────────────────────
      getBackendStatus: () => Promise<BackendStatus>
      startBackend: () => Promise<BackendStatus>
      collectSwitchData: (req: CollectRequest) => Promise<CollectResponse>
      pingSwitchSsh: (creds: SwitchCredentials) => Promise<{
        success: boolean
        host: string
        prompt?: string
        duration_ms?: number
        error_code?: string
        detail?: string
      }>
      getNetworkPresets: () => Promise<Record<string, string[]>>
    }
  }
}

export {}
