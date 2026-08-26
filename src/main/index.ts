/**
 * index.ts — Electron main process entry point.
 *
 * Starts the Python netwatch backend and creates the BrowserWindow.
 * A native splash window is shown instantly (before the React renderer paints)
 * for a polished startup experience, then swapped for the main window.
 */

import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerAllIpcHandlers } from './ipc-handlers'
import { startBackend, stopBackend } from './backend-manager'

// ─── Branding ───────────────────────────────────────────────────────────────
// Single source of truth for the product name shown on the splash + window title.
// Change these two lines to rebrand the app.
const APP_NAME = 'Netwatch Analyzer'
const APP_SUB  = 'Analisador de Show Tech · Cisco / Stratix'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const RENDERER_URL = isDev
  ? 'http://localhost:5173'
  : `file://${path.join(__dirname, '../../dist/index.html')}`

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

// Minimum time the splash stays visible so it never just "flashes".
const SPLASH_MIN_MS = 1500
let splashShownAt = 0

// ─── Splash window ──────────────────────────────────────────────────────────
function splashHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:100%; height:100%; overflow:hidden;
      font-family:'Segoe UI',system-ui,sans-serif;
      background:radial-gradient(120% 120% at 50% 0%, #14233d 0%, #0f172a 60%, #0b1220 100%);
      color:#e2e8f0; user-select:none; -webkit-user-select:none; }
    .wrap { width:100%; height:100%; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:18px;
      border:1px solid rgba(255,255,255,0.06); }
    .logo { filter:drop-shadow(0 6px 20px rgba(34,211,238,0.25)); animation:rise .7s ease-out both; }
    @keyframes rise { from { opacity:0; transform:translateY(10px) scale(.96); } to { opacity:1; transform:none; } }
    .name { font-size:26px; font-weight:800; letter-spacing:.5px;
      background:linear-gradient(90deg,#22d3ee,#3b82f6); -webkit-background-clip:text;
      background-clip:text; color:transparent; animation:rise .7s .05s ease-out both; }
    .sub { font-size:11px; color:rgba(255,255,255,0.45); letter-spacing:.08em;
      text-transform:uppercase; animation:rise .7s .1s ease-out both; }
    .barwrap { width:220px; height:4px; border-radius:4px; margin-top:6px;
      background:rgba(255,255,255,0.08); overflow:hidden; }
    .bar { width:40%; height:100%; border-radius:4px;
      background:linear-gradient(90deg,#22d3ee,#3b82f6);
      animation:slide 1.1s ease-in-out infinite; }
    @keyframes slide { 0% { transform:translateX(-120%); } 100% { transform:translateX(320%); } }
    .status { font-size:10px; color:rgba(255,255,255,0.3); font-family:'Consolas',monospace;
      letter-spacing:.05em; animation:pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity:.4; } 50% { opacity:.85; } }
  </style></head><body><div class="wrap">
    <svg class="logo" width="76" height="76" viewBox="0 0 76 76" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#3b82f6"/>
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="60" height="60" rx="15" fill="#0d1b2e" stroke="url(#g)" stroke-width="2.5"/>
      <rect x="22" y="40" width="6" height="14" rx="2" fill="url(#g)"/>
      <rect x="33" y="32" width="6" height="22" rx="2" fill="url(#g)"/>
      <rect x="44" y="24" width="6" height="30" rx="2" fill="url(#g)"/>
      <circle cx="47" cy="20" r="4" fill="#22d3ee"/>
      <path d="M53 20 a10 10 0 0 1 0 0" stroke="#22d3ee" stroke-width="2" fill="none"/>
    </svg>
    <div class="name">${APP_NAME}</div>
    <div class="sub">${APP_SUB}</div>
    <div class="barwrap"><div class="bar"></div></div>
    <div class="status">Iniciando…</div>
  </div></body></html>`
}

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 320,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#0f172a',
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml()))
  splashWindow.once('ready-to-show', () => splashWindow?.show())
  splashShownAt = Date.now()
}

function closeSplashAndShowMain(): void {
  const elapsed = Date.now() - splashShownAt
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed)
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
    splashWindow = null
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus() }
  }, wait)
}

// ─── Main window ────────────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1024,
    minHeight: 700,
    show: false,                 // stay hidden until first paint (splash covers the gap)
    title: `${APP_NAME} — ${APP_SUB}`,
    icon: path.join(__dirname, '../../assets/icon.ico'),
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
  mainWindow.once('ready-to-show', closeSplashAndShowMain)
  // Safety net: never leave the user staring at a splash if first-paint stalls.
  setTimeout(() => { if (mainWindow && !mainWindow.isVisible()) closeSplashAndShowMain() }, 12000)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  registerAllIpcHandlers()
  createSplash()
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
