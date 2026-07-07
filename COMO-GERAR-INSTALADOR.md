# Como Gerar o Instalador (.exe) do Netwatch

## Pré-requisitos no seu computador Windows

| Software | Versão mínima | Download |
|---|---|---|
| **Node.js** | 18+ | https://nodejs.org (marque "Add to PATH") |
| **Python** | 3.11+ | https://www.python.org/downloads/ (marque "Add to PATH") |

> Após instalar, **feche e reabra o terminal** para que o PATH seja atualizado.

---

## Passo a passo — Opção 1: Script automático (recomendado)

1. Descompacte esta pasta em qualquer lugar (ex: `C:\projetos\netwatch-topology\`)
2. **Dê duplo clique** em `build-win.bat`
3. Aguarde (~5–10 min na primeira vez, dependendo da internet)
4. O instalador será gerado em `release\Netwatch Topology Setup X.X.X.exe`

> **PowerShell alternativo:** clique com botão direito em `build-win.ps1` → "Executar com PowerShell"

---

## Passo a passo — Opção 2: Manual (terminal)

```bash
# 1. Abrir terminal na pasta do projeto
cd caminho\para\netwatch-topology

# 2. Instalar dependências Python
cd backend
pip install -r requirements.txt
cd ..

# 3. Instalar dependências Node.js (~5 min, baixa Electron ~120MB)
npm install

# 4. Compilar e gerar instalador
npm run dist:win
```

O instalador estará em `release\Netwatch Topology Setup X.X.X.exe`

---

## O que o instalador inclui

- ✅ Interface Electron completa (Monitor Live + Analisador)
- ✅ Backend Python FastAPI (código-fonte + requirements.txt)
- ✅ Scripts de configuração
- ❌ **NÃO inclui o runtime Python** — o PC do usuário final precisa ter Python 3.11+ instalado

---

## Distribuindo para usuários finais

O usuário final precisa ter **Python 3.11+** instalado. O Netwatch detecta automaticamente o Python em:
- Py Launcher (`py`)
- `%LOCALAPPDATA%\Programs\Python\Python31X\`
- `C:\Program Files\Python3X\`

Se o Python não for encontrado, o app mostrará uma mensagem de erro clara com link para download.

---

## Solução de problemas

| Problema | Solução |
|---|---|
| `npm install` falha | Verifique conexão com internet; tente `npm install --legacy-peer-deps` |
| `Python not found` em `npm run dist:win` | Não é necessário Python para compilar — só para rodar |
| `electron-builder` falha no download | Defina `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` e tente novamente |
| Antivírus bloqueia o `.exe` gerado | Adicione exceção para a pasta `release\` ou use certificado de assinatura de código |
| Erro de TypeScript | Execute `npm run typecheck` para ver erros específicos |

