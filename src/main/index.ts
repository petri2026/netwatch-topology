/**
 * index.ts — Electron main process entry point.
 *
 * Starts the Python netwatch backend and creates the BrowserWindow.
 */

import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerAllIpcHandlers } from './ipc-handlers'
import { startBackend, stopBackend } from './backend-manager'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const RENDERER_URL = isDev
  ? 'http://localhost:5173'
  : `file://${path.join(__dirname, '../../dist/index.html')}`

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1024,
    minHeight: 700,
    title: 'Netwatch Topology',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  })

  mainWindow.loadURL(RENDERER_URL)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  registerAllIpcHandlers()
  createWindow()

  // Auto-start backend in background — renderer will poll status
  startBackend().catch((err) => {
    console.error('[Main] Backend auto-start failed:', err.message)
    console.error('[Main] Ensure Python 3.11+ and backend/requirements.txt are installed.')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopBackend()
})

// Prevent navigation to external URLs
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:',
      `file://${path.join(__dirname, '../../dist')}`,
    ]
    const isAllowed = allowedOrigins.some((o) => navigationUrl.startsWith(o))
    if (!isAllowed) {
      console.warn(`Blocked navigation to: ${navigationUrl}`)
      event.preventDefault()
    }
  })
})
