# build-win.ps1 — PowerShell alternativo
# Executar: clique direito -> "Executar com PowerShell"
#           ou: powershell -ExecutionPolicy Bypass -File build-win.ps1

# ── Ir para a pasta do script ─────────────────────────────────────────────
Set-Location $PSScriptRoot

$Host.UI.RawUI.WindowTitle = "Netwatch — Build Installer"

function Write-OK($m)   { Write-Host "[OK] $m"    -ForegroundColor Green  }
function Write-Fail($m) { Write-Host "[ERRO] $m"  -ForegroundColor Red    }
function Write-Step($n,$t){ Write-Host "`n[$n/4] $t..." -ForegroundColor Yellow }

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  Netwatch — Build do Instalador Windows"                   -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan
Write-Host "  Diretorio: $PSScriptRoot`n"

# ── Node.js ───────────────────────────────────────────────────────────────
$nodeVer = node --version 2>$null
if (-not $nodeVer) {
    Write-Fail "Node.js nao encontrado. Instale em https://nodejs.org"
    Read-Host "Enter para sair"; exit 1
}
Write-OK "Node.js: $nodeVer"

# ── Python ────────────────────────────────────────────────────────────────
$pythonCmd = $null
foreach ($p in @("py","python3","python")) {
    try {
        $null = & $p -c "import sys; sys.exit(0)" 2>$null
        if ($LASTEXITCODE -eq 0) { $pythonCmd = $p; break }
    } catch {}
}

if ($pythonCmd) {
    $pyVer = & $pythonCmd --version 2>&1
    Write-OK "Python: $pyVer  (cmd: $pythonCmd)"

    # Verify requirements.txt exists
    $reqFile = Join-Path $PSScriptRoot "backend\requirements.txt"
    if (-not (Test-Path $reqFile)) {
        Write-Fail "backend\requirements.txt nao encontrado em: $reqFile"
        Read-Host "Enter para sair"; exit 1
    }

    Write-Step 1 "Instalando dependencias Python"
    & $pythonCmd -m pip install -r $reqFile --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "pip install falhou."
        Read-Host "Enter para sair"; exit 1
    }
    Write-OK "Dependencias Python instaladas."
} else {
    Write-Host "[AVISO] Python nao encontrado. Backend nao funcionara." -ForegroundColor Yellow
}

# ── npm install ───────────────────────────────────────────────────────────
Write-Step 2 "Instalando dependencias Node.js (pode demorar ~5-10 min)"
npm install --no-audit --no-fund --loglevel=warn
if ($LASTEXITCODE -ne 0) {
    Write-Fail "npm install falhou."
    Read-Host "Enter para sair"; exit 1
}
Write-OK "Dependencias Node.js instaladas."

# ── Build ─────────────────────────────────────────────────────────────────
Write-Step 3 "Compilando (Vite + TypeScript)"
npm run build:vite
if ($LASTEXITCODE -ne 0) { Write-Fail "Vite build falhou."; Read-Host "Enter para sair"; exit 1 }
npm run build:electron
if ($LASTEXITCODE -ne 0) { Write-Fail "TypeScript build falhou."; Read-Host "Enter para sair"; exit 1 }
Write-OK "Compilacao concluida."

# ── electron-builder ──────────────────────────────────────────────────────
Write-Step 4 "Gerando instalador .exe (aguarde 2-4 min)"
npx electron-builder --win --x64
if ($LASTEXITCODE -ne 0) {
    Write-Fail "electron-builder falhou."
    Read-Host "Enter para sair"; exit 1
}

# ── Resultado ─────────────────────────────────────────────────────────────
Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  BUILD CONCLUIDO!" -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Green

$releaseDir = Join-Path $PSScriptRoot "release"
if (Test-Path $releaseDir) {
    Get-ChildItem "$releaseDir\*.exe" | ForEach-Object {
        $sz = [math]::Round($_.Length / 1MB, 1)
        Write-Host "  $($_.Name)  ($sz MB)" -ForegroundColor White
    }
}

Write-Host "`nIMPORTANTE: Usuario final precisa de Python 3.11+" -ForegroundColor Yellow
Write-Host "Download: https://www.python.org/downloads/`n"
Read-Host "Pressione Enter para fechar"
