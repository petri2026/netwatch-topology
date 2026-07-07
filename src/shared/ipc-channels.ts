/**
 * IPC Channel constants — single source of truth for main ↔ renderer.
 */
export const IPC_CHANNELS = {
  // ── Topology: File operations ────────────────────────────────────────
  DIALOG_OPEN_EXCEL:    'dialog:open-excel',
  PARSE_EXCEL_FILE:     'excel:parse-file',

  // ── Topology: Image operations ───────────────────────────────────────
  DIALOG_OPEN_IMAGE:    'dialog:open-image',
  READ_IMAGE_AS_BASE64: 'image:read-as-base64',

  // ── Topology: Export operations ──────────────────────────────────────
  DIALOG_SAVE_SVG:      'dialog:save-svg',
  SAVE_FILE:            'file:save',

  // ── App info ─────────────────────────────────────────────────────────
  APP_GET_VERSION:      'app:get-version',

  // ── Netwatch: Backend lifecycle ──────────────────────────────────────
  BACKEND_STATUS:       'netwatch:backend-status',
  BACKEND_START:        'netwatch:backend-start',

  // ── Netwatch: SSH operations (proxy to backend HTTP) ─────────────────
  NETWATCH_COLLECT:     'netwatch:collect',
  NETWATCH_PING:        'netwatch:ping',
  NETWATCH_GET_PRESETS: 'netwatch:get-presets',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
