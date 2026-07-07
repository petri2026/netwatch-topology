@echo off
setlocal EnableDelayedExpansion

:: ── CRITICAL: Set working directory to script location ───────────────────
cd /d "%~dp0"

title Netwatch — Build do Instalador Windows

echo.
echo ========================================================
echo   Netwatch Topology -- Build do Instalador Windows
echo ========================================================
echo.
echo   Diretorio do projeto: %~dp0
echo.

:: ── Verificar Node.js ────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado.
    echo.
    echo        Instale em: https://nodejs.org
    echo        Marque "Add to PATH" durante a instalacao.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do set NODE_VER=%%v
echo [OK] Node.js: %NODE_VER%

:: ── Verificar npm ────────────────────────────────────────────────────────
for /f "tokens=*" %%v in ('npm --version 2^>^&1') do set NPM_VER=%%v
echo [OK] npm: v%NPM_VER%

:: ── Verificar Python ─────────────────────────────────────────────────────
set PYTHON_CMD=
for %%p in (py python3 python) do (
    if not defined PYTHON_CMD (
        %%p -c "import sys; sys.exit(0)" >nul 2>&1
        if !errorlevel! equ 0 (
            set PYTHON_CMD=%%p
            for /f "tokens=*" %%v in ('%%p --version 2^>^&1') do set PY_VER=%%v
            echo [OK] Python: !PY_VER! ^(cmd: %%p^)
        )
    )
)

if not defined PYTHON_CMD (
    echo [AVISO] Python nao encontrado. O backend nao funcionara.
    echo         Instale Python 3.11+ em: https://www.python.org/downloads/
    choice /M "Continuar sem instalar dependencias Python"
    if !errorlevel! equ 2 ( pause & exit /b 1 )
    goto skip_python
)

:: ── Verificar pasta backend ───────────────────────────────────────────────
if not exist "%~dp0backend\requirements.txt" (
    echo [ERRO] Arquivo backend\requirements.txt nao encontrado.
    echo        Certifique-se de que o script esta na pasta raiz do projeto.
    echo        Pasta atual: %~dp0
    pause & exit /b 1
)

:: ── Instalar dependencias Python ─────────────────────────────────────────
echo.
echo [1/4] Instalando dependencias Python...
%PYTHON_CMD% -m pip install -r "%~dp0backend\requirements.txt" --quiet
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias Python.
    echo        Tente manualmente:
    echo          cd "%~dp0backend"
    echo          pip install -r requirements.txt
    pause & exit /b 1
)
echo [OK] Dependencias Python instaladas.

:skip_python

:: ── Instalar dependencias npm ─────────────────────────────────────────────
echo.
echo [2/4] Instalando dependencias Node.js...
echo       (primeira vez pode demorar 5-10 min -- baixando Electron ~120MB)
call npm install --no-audit --no-fund --loglevel=warn
if %errorlevel% neq 0 (
    echo [ERRO] npm install falhou. Verifique a conexao com a internet.
    pause & exit /b 1
)
echo [OK] Dependencias Node.js instaladas.

:: ── Build Vite ───────────────────────────────────────────────────────────
echo.
echo [3/4] Compilando interface React (Vite)...
call npm run build:vite
if %errorlevel% neq 0 (
    echo [ERRO] Vite build falhou. Veja erros acima.
    pause & exit /b 1
)
echo       Compilando processo Electron (TypeScript)...
call npm run build:electron
if %errorlevel% neq 0 (
    echo [ERRO] TypeScript build falhou. Veja erros acima.
    pause & exit /b 1
)
echo [OK] Compilacao concluida.

:: ── Gerar instalador ─────────────────────────────────────────────────────
echo.
echo [4/4] Gerando instalador Windows (.exe)...
echo       Aguarde 2-4 minutos...
call npx electron-builder --win --x64
if %errorlevel% neq 0 (
    echo [ERRO] electron-builder falhou. Veja erros acima.
    pause & exit /b 1
)

:: ── Sucesso ──────────────────────────────────────────────────────────────
echo.
echo ========================================================
echo   BUILD CONCLUIDO COM SUCESSO!
echo ========================================================
echo.
echo   Instaladores em: %~dp0release\
echo.
if exist "%~dp0release\" (
    for %%f in ("%~dp0release\*.exe") do (
        echo   -- %%~nxf
    )
)
echo.
echo   IMPORTANTE: O PC do usuario final precisa ter Python 3.11+.
echo   Download: https://www.python.org/downloads/
echo.
pause
