/**
 * backend-manager.ts
 *
 * Spawns and manages the Python FastAPI (netwatch) backend process.
 * Robustly resolves the Python executable on Windows (handles the
 * Microsoft Store alias trap, py launcher, and common install paths).
 */

import { ChildProcess, execFileSync, spawn } from 'child_process'
import { createServer } from 'net'
import path from 'path'
import fs from 'fs'

let backendProcess: ChildProcess | null = null
let backendPort: number | null = null
let backendPid: number | null = null
let backendError: string | null = null

// ─── Find an available TCP port ───────────────────────────────────────────

function findAvailablePort(start = 8765): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(start, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      server.close(() => resolve(addr.port))
    })
    server.on('error', () => {
      findAvailablePort(start + 1).then(resolve).catch(reject)
    })
  })
}

// ─── Probe a single executable — returns true only if it is a real Python ─
// On Windows, "python" may silently redirect to the MS Store (exit code 9009)
// or print "Python X.Y.Z" on stderr/stdout before exiting 0.
// We verify by running `<candidate> -c "import sys; sys.exit(0)"`.

function probeExecutable(candidate: string): boolean {
  try {
    execFileSync(candidate, ['-c', 'import sys; sys.exit(0)'], {
      timeout: 5000,
      stdio: 'pipe',     // capture and discard; don't inherit console
      windowsHide: true, // suppress any console window flash on Windows
    })
    return true
  } catch {
    return false
  }
}

// ─── Build a prioritised candidate list for the current platform ──────────

function buildCandidates(): string[] {
  if (process.platform !== 'win32') {
    return ['python3', 'python']
  }

  // Windows search order:
  //  1. py launcher (ships with official python.org installer)
  //  2. Common explicit install paths (Python 3.13 → 3.9)
  //  3. PATH-based names (last resort, may hit MS Store alias)
  const winPaths: string[] = []

  const localAppData = process.env.LOCALAPPDATA ?? ''
  const programFiles  = process.env.ProgramFiles  ?? 'C:\\Program Files'
  const programFiles86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'

  const versions = ['313', '312', '311', '310', '39', '38']

  for (const ver of versions) {
    const major = ver[0]
    const minor = ver.slice(1)
    const tag   = `${major}.${minor}`

    // User-level install (most common with recent Python for Windows)
    winPaths.push(path.join(localAppData, `Programs\\Python\\Python${ver}\\python.exe`))
    // System-level installs
    winPaths.push(path.join(programFiles,   `Python${ver}\\python.exe`))
    winPaths.push(path.join(programFiles86, `Python${ver}\\python.exe`))
    // py launcher with version tag
    winPaths.push(`py -${tag}`)
  }

  return [
    'py',          // py launcher (version-agnostic)
    ...winPaths,
    'python3',     // unlikely on vanilla Windows but possible (Git bash, Scoop, etc.)
    'python',      // absolute last resort — may be MS Store alias
  ]
}

// ─── Resolve a working Python executable ─────────────────────────────────
// Tries each candidate in order and returns the first real Python found.
// Splits "py -3.11" style entries into [cmd, arg] correctly.

function resolvePython(): { cmd: string; args: string[] } {
  const candidates = buildCandidates()

  for (const raw of candidates) {
    const parts = raw.split(' ')
    const cmd   = parts[0]
    const args  = parts.slice(1)

    const probeCmd = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd

    try {
      // For split candidates like "py -3.11", probe using execFileSync with args
      execFileSync(cmd, [...args, '-c', 'import sys; sys.exit(0)'], {
        timeout: 5000,
        stdio: 'pipe',
        windowsHide: true,
      })
      console.log(`[BackendManager] Python resolved: ${probeCmd}`)
      return { cmd, args }
    } catch {
      // Not available or MS Store alias — try next
    }
  }

  throw new Error(
    'Python 3 não encontrado no sistema.\n\n' +
    'Instale Python 3.11+ em https://www.python.org/downloads/\n' +
    'Durante a instalação, marque "Add Python to PATH" e\n' +
    '"Disable path length limit".\n\n' +
    'Depois reinicie o Netwatch Topology.'
  )
}

// ─── Resolve backend directory ────────────────────────────────────────────

function getBackendDir(): string {
  const devPath  = path.join(__dirname, '..', '..', '..', 'backend')
  const prodPath = path.join(process.resourcesPath ?? '', 'backend')
  if (fs.existsSync(devPath))  return devPath
  if (fs.existsSync(prodPath)) return prodPath
  return path.join(process.cwd(), 'backend')
}

// ─── Wait until backend is responsive ─────────────────────────────────────

async function waitForBackend(port: number, timeoutMs = 20000): Promise<boolean> {
  const url      = `http://127.0.0.1:${port}/api/health`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function startBackend(): Promise<{ port: number; pid: number }> {
  if (backendProcess && backendPort) {
    return { port: backendPort, pid: backendPid! }
  }

  const port       = await findAvailablePort(8765)
  const backendDir = getBackendDir()

  console.log(`[BackendManager] Starting netwatch on port ${port}`)
  console.log(`[BackendManager] Backend dir: ${backendDir}`)

  // Resolve Python — throws with a clear user-facing message if not found
  const { cmd: pythonCmd, args: pythonPrefixArgs } = resolvePython()

  const uvicornArgs = [
    ...pythonPrefixArgs,
    '-m', 'uvicorn',
    'app.main:app',
    '--host', '127.0.0.1',
    '--port', String(port),
    '--log-level', 'warning',
  ]

  console.log(`[BackendManager] Spawning: ${pythonCmd} ${uvicornArgs.join(' ')}`)

  const envVars = {
    ...process.env,
    APP_ENV:      'production',
    APP_PORT:     String(port),
    CORS_ORIGINS: `http://localhost:${port},http://127.0.0.1:${port}`,
    APP_RELOAD:   'false',
    // Prevent Windows from showing the Python console window
    PYTHONUNBUFFERED: '1',
  }

  backendProcess = spawn(pythonCmd, uvicornArgs, {
    cwd:        backendDir,
    env:        envVars,
    stdio:      ['ignore', 'pipe', 'pipe'],
    windowsHide: true,   // suppress flash of console window on Windows
  })

  backendPort = port
  backendPid  = backendProcess.pid ?? null
  backendError = null

  backendProcess.stdout?.on('data', (d: Buffer) => {
    process.stdout.write(`[netwatch] ${d}`)
  })

  backendProcess.stderr?.on('data', (d: Buffer) => {
    const msg = d.toString()
    process.stderr.write(`[netwatch] ${msg}`)
    // Ignore normal uvicorn startup noise
    const isStartupNoise = ['Uvicorn running', 'Started', 'INFO:', 'WARNING:'].some(s => msg.includes(s))
    if (!isStartupNoise) {
      backendError = msg.slice(0, 300)
    }
  })

  backendProcess.on('exit', (code) => {
    console.log(`[BackendManager] Process exited with code ${code}`)
    backendProcess = null
    backendPort    = null
    backendPid     = null
    if (code !== 0 && code !== null) {
      backendError = `Processo Python encerrou com código ${code}. Verifique se as dependências estão instaladas: cd backend && pip install -r requirements.txt`
    }
  })

  const ok = await waitForBackend(port)
  if (!ok) {
    const lastErr = backendError ? `\n\nÚltimo erro: ${backendError}` : ''
    throw new Error(
      `Backend não respondeu na porta ${port} após 20s.${lastErr}\n\n` +
      `Verifique: cd backend && pip install -r requirements.txt`
    )
  }

  console.log(`[BackendManager] Backend pronto em http://127.0.0.1:${port}`)
  return { port, pid: backendPid! }
}

export function stopBackend(): void {
  if (backendProcess) {
    console.log('[BackendManager] Stopping backend...')
    if (process.platform === 'win32') {
      // SIGTERM não funciona no Windows — usa taskkill para matar a árvore de processos
      try {
        execFileSync('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } catch {
        backendProcess.kill()
      }
    } else {
      backendProcess.kill('SIGTERM')
    }
    backendProcess = null
    backendPort    = null
    backendPid     = null
  }
}

export function getBackendStatus(): {
  running: boolean
  port: number | null
  pid: number | null
  error: string | null
} {
  return {
    running: backendProcess !== null && backendPort !== null,
    port:    backendPort,
    pid:     backendPid,
    error:   backendError,
  }
}
