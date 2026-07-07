#!/usr/bin/env bash
# setup.sh — Instala dependências do Netwatch Topology
set -e

echo ""
echo "═══════════════════════════════════════════"
echo "  Netwatch Topology — Setup"
echo "═══════════════════════════════════════════"
echo ""

# ── Backend Python ─────────────────────────────────────────────────────────
echo "📦 Instalando dependências Python (backend)..."
cd backend

if command -v python3 &>/dev/null; then
  PYTHON=python3
elif command -v python &>/dev/null; then
  PYTHON=python
else
  echo "❌ Python não encontrado. Instale Python 3.11+ primeiro."
  exit 1
fi

$PYTHON -m pip install -r requirements.txt --quiet
echo "✅ Backend Python OK"
cd ..

# ── Frontend Node ──────────────────────────────────────────────────────────
echo ""
echo "📦 Instalando dependências Node.js (frontend)..."
npm install --silent
echo "✅ Frontend Node OK"

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Setup concluído!"
echo ""
echo "  Para iniciar:"
echo "    npm run dev"
echo ""
echo "  Para build de produção:"
echo "    npm run dist:win   (Windows .exe)"
echo "    npm run dist       (plataforma atual)"
echo "═══════════════════════════════════════════"
echo ""
