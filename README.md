# Netwatch — Monitor & Analisador de Switches Cisco/Stratix

Aplicação Electron com duas abas: **Monitor Live SSH** (coleta em tempo real) e **Analisador** (diagnóstico offline de showtech completo).

---

## Abas

| Aba | Descrição |
|-----|-----------|
| 📡 **Monitor Live** | Conexão SSH real-time. Coleta CPU, memória, interfaces, STP, ambiente. Auto-refresh configurável. |
| 🔬 **Analisador** | Dashboard offline para arquivos showtech (.rtf/.txt). Health Score, SFP, temperatura, logs, exportação Excel/Word. |

---

## Instalação rápida

```bash
# 1. Backend Python
cd backend && pip install -r requirements.txt && cd ..

# 2. Frontend
npm install

# 3. Executar
npm run dev
```

> O backend Python (FastAPI/Uvicorn) é iniciado automaticamente pelo Electron.  
> Requer Python 3.11+ instalado e no PATH (ou detectado automaticamente).

---

## Monitor Live — Funcionalidades

- Múltiplos switches simultâneos com barra de seleção por tabs
- Presets: Básico · CPU/Mem · Interfaces · Spanning Tree · Full Health · Show Tech
- Auto-refresh configurável (intervalo em segundos)
- Perfis de conexão salvos localmente (localStorage)
- Ping SSH para testar conectividade antes de coletar
- **Sub-abas por switch**: Visão Geral · Interfaces · CPU/Mem · Ambiente · Spanning Tree · Raw Output

---

## Analisador — Funcionalidades

- **Drag & Drop** de arquivos `.rtf` (MobaXterm), `.txt` ou `.log`
- **Colar Texto** — cola saída de comandos diretamente com botão Analisar
- **Health Score 0–100** com fatores detalhados (CPU, MEM, FANs, PS, logs, STP)
- Múltiplos switches: lista lateral + painel de detalhe
- **Sub-abas por switch**: CPU/Memória · Rede · Ambiente · Configuração · Inventário
- **Cisco Knowledge Base**: clique em logs críticos para ver explicação e passos de resolução
- **Temperature Intelligence**: valida temperatura contra spec do modelo (Stratix 2000–8000, Catalyst)
- **Analytics**: comparativo entre todos os switches carregados
- **Linha do Tempo**: logs ordenados cronologicamente, com filtros de severidade e host
- **Segurança**: falhas de login, alterações de config, flapping de interfaces
- **Exportar Excel** (SpreadsheetML): 1 aba por switch + Analytics + Linha do Tempo
- **Exportar Word** (MHTML): relatório de auditoria profissional com capa e sumário

---

## Detecção Python no Windows

O backend-manager testa automaticamente, em ordem:
1. `py` launcher (python.org oficial)
2. `%LOCALAPPDATA%\Programs\Python\Python31X\python.exe` (versões 3.9–3.13)
3. `C:\Program Files\PythonXX\python.exe`
4. `python3` / `python` (PATH)

Se nenhum funcionar: instale [Python 3.11+](https://www.python.org/downloads/) marcando **"Add to PATH"**.

---

## Build de produção

```bash
npm run build       # Compila Vite + TypeScript
npm run dist:win    # Gera instalador .exe (Windows x64)
```
