/**
 * ipc-handlers.ts — All IPC handlers for main process.
 *
 * Includes:
 *  - Original topology handlers (Excel, image, file save)
 *  - Netwatch backend management
 *  - SSH data collection (proxied to Python backend)
 */

import { ipcMain, dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import ExcelJS from 'exceljs'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  ExcelRow,
  ParseExcelResult,
  SaveFilePayload,
  SaveFileResult,
  ReadImageResult,
  CableType,
  CollectRequest,
  CollectResponse,
  SwitchCredentials,
  BackendStatus,
} from '../shared/types'
import {
  startBackend,
  getBackendStatus,
} from './backend-manager'

// ─── Column name aliases (case-insensitive, trimmed) ──────────────────────
const COLUMN_ALIASES: Record<keyof ExcelRow, string[]> = {
  sourceDevice: [
    'local switch', 'local device', 'switch local', 'hostname', 'source',
    'dispositivo origem', 'origem', 'source device', 'device a', 'equipamento origem', 'host origem',
  ],
  sourcePort: [
    'interface', 'local interface', 'local port',
    'porta origem', 'interface origem', 'source port', 'porta a', 'int origem',
  ],
  destinationDevice: [
    'device id', 'neighbor', 'remote device', 'cdp neighbor', 'neighbor device',
    'dispositivo destino', 'destino', 'destination device', 'device b', 'equipamento destino',
  ],
  destinationPort: [
    'port id (remote)', 'port id', 'remote port', 'remote interface', 'neighbor port',
    'porta destino', 'interface destino', 'destination port', 'porta b', 'int destino',
  ],
  cableType: ['tipo de cabo', 'midia', 'mídia', 'cable type', 'media', 'tipo midia', 'tipo de mídia'],
  equipmentModel: [
    'platform', 'platform id', 'model id', 'hardware platform',
    'modelo', 'model', 'equipment model', 'modelo equipamento', 'hardware',
  ],
  vlan: ['vlan', 'vlan id', 'vlan nativa', 'native vlan'],
  description: [
    'descricao', 'descrição', 'description', 'obs', 'observação',
    'capabilities', 'firmware version', 'ip address',
  ],
}

function normHeader(header: string): string {
  return header.toLowerCase().trim().replace(/\s+/g, ' ')
}

function resolveColumnIndex(headers: string[], field: keyof ExcelRow): number {
  const aliases = COLUMN_ALIASES[field]
  for (let i = 0; i < headers.length; i++) {
    const h = normHeader(headers[i])
    if (aliases.some((alias) => alias === h || h.includes(alias))) return i
  }
  return -1
}

function parseCableType(raw: string | undefined): CableType {
  if (!raw) return 'unknown'
  const v = raw.toLowerCase().trim()
  if (v.includes('fibra') || v.includes('fiber') || v.includes('smf') || v.includes('mmf')) return 'fiber'
  if (v.includes('cobre') || v.includes('copper') || v.includes('utp') || v.includes('cat')) return 'copper'
  if (v.includes('sfp')) return 'sfp'
  if (v.includes('dac') || v.includes('direct attach')) return 'dac'
  return 'unknown'
}

// ─── Excel parser ─────────────────────────────────────────────────────────
async function parseExcelFile(filePath: string): Promise<ParseExcelResult> {
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)

    const KNOWN_ALIASES_FLAT = [
      'local switch', 'dispositivo origem', 'source device', 'origem', 'hostname',
      'device id', 'neighbor', 'dispositivo destino', 'destination device',
    ]

    let targetSheet: ExcelJS.Worksheet | undefined
    let bestScore = -1

    workbook.eachSheet((sheet) => {
      if (sheet.rowCount < 2) return
      const firstRow = sheet.getRow(1)
      const headerCells: string[] = []
      firstRow.eachCell({ includeEmpty: false }, (cell) => {
        headerCells.push(String(cell.value ?? ''))
      })

      let score = 0
      for (const h of headerCells) {
        const norm = normHeader(h)
        if (KNOWN_ALIASES_FLAT.some((alias) => norm.includes(alias))) score++
      }
      if (score > bestScore) {
        bestScore = score
        targetSheet = sheet
      }
    })

    if (!targetSheet) {
      targetSheet = workbook.worksheets[0]
    }
    if (!targetSheet) {
      return { success: false, error: 'Nenhuma planilha encontrada no arquivo.' }
    }

    const headerRow = targetSheet.getRow(1)
    const headers: string[] = []
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      headers.push(String(cell.value ?? ''))
    })

    const colMap: Record<keyof ExcelRow, number> = {
      sourceDevice: resolveColumnIndex(headers, 'sourceDevice'),
      sourcePort: resolveColumnIndex(headers, 'sourcePort'),
      destinationDevice: resolveColumnIndex(headers, 'destinationDevice'),
      destinationPort: resolveColumnIndex(headers, 'destinationPort'),
      cableType: resolveColumnIndex(headers, 'cableType'),
      equipmentModel: resolveColumnIndex(headers, 'equipmentModel'),
      vlan: resolveColumnIndex(headers, 'vlan'),
      description: resolveColumnIndex(headers, 'description'),
    }

    if (colMap.sourceDevice === -1 || colMap.destinationDevice === -1) {
      return {
        success: false,
        error: 'Colunas obrigatórias não encontradas: "Dispositivo Origem" e "Dispositivo Destino".',
      }
    }

    const rows: ExcelRow[] = []

    targetSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return

      const getCell = (colIdx: number): string => {
        if (colIdx === -1) return ''
        const cell = row.getCell(colIdx + 1)
        return String(cell.value ?? '').trim()
      }

      const sourceDevice = getCell(colMap.sourceDevice)
      const destinationDevice = getCell(colMap.destinationDevice)
      if (!sourceDevice || !destinationDevice) return

      rows.push({
        sourceDevice,
        sourcePort: getCell(colMap.sourcePort),
        destinationDevice,
        destinationPort: getCell(colMap.destinationPort),
        cableType: parseCableType(getCell(colMap.cableType)),
        equipmentModel: getCell(colMap.equipmentModel),
        vlan: getCell(colMap.vlan) || undefined,
        description: getCell(colMap.description) || undefined,
      })
    })

    if (rows.length === 0) {
      return { success: false, error: 'A planilha não contém linhas de dados válidas.' }
    }

    return {
      success: true,
      rows,
      fileName: path.basename(filePath),
      sheetName: targetSheet.name,
      totalRows: rows.length,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Erro ao parsear Excel: ${message}` }
  }
}

// ─── Netwatch HTTP proxy helpers ───────────────────────────────────────────

async function getBackendUrl(): Promise<string> {
  const status = getBackendStatus()
  if (!status.running || !status.port) {
    throw new Error('Backend não está rodando. Inicie o backend primeiro.')
  }
  return `http://127.0.0.1:${status.port}`
}

async function proxyPost<T>(endpoint: string, body: unknown): Promise<T> {
  const base = await getBackendUrl()
  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Backend error ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

async function proxyGet<T>(endpoint: string): Promise<T> {
  const base = await getBackendUrl()
  const res = await fetch(`${base}${endpoint}`)
  if (!res.ok) throw new Error(`Backend error ${res.status}`)
  return res.json() as Promise<T>
}

// ─── IPC Handler registration ─────────────────────────────────────────────
export function registerAllIpcHandlers(): void {

  // ── 1. Open Excel file dialog ──────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_EXCEL, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar Planilha de Infraestrutura',
      filters: [
        { name: 'Excel Files', extensions: ['xlsx', 'xls', 'xlsm'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── 2. Parse Excel ─────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.PARSE_EXCEL_FILE,
    async (_event, filePath: string): Promise<ParseExcelResult> => parseExcelFile(filePath)
  )

  // ── 3. Open image dialog ───────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_IMAGE, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar Imagem do Dispositivo',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── 4. Read image as base64 ────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.READ_IMAGE_AS_BASE64,
    async (_event, filePath: string): Promise<ReadImageResult> => {
      try {
        const ext = path.extname(filePath).toLowerCase().slice(1)
        const mimeMap: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          webp: 'image/webp', svg: 'image/svg+xml',
        }
        const mime = mimeMap[ext] ?? 'image/png'
        const buffer = fs.readFileSync(filePath)
        return {
          success: true,
          base64DataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
          fileName: path.basename(filePath),
        }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ── 5. Save file ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.SAVE_FILE,
    async (_event, payload: SaveFilePayload): Promise<SaveFileResult> => {
      try {
        const result = await dialog.showSaveDialog({
          defaultPath: payload.defaultPath,
          filters: payload.filters,
        })
        if (result.canceled || !result.filePath) return { success: false, error: 'Operação cancelada.' }
        fs.writeFileSync(result.filePath, payload.content, 'utf-8')
        return { success: true, filePath: result.filePath }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ── 6. App version ─────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())

  // ── 7. Backend status ──────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.BACKEND_STATUS, (): BackendStatus => getBackendStatus())

  // ── 8. Start backend ───────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.BACKEND_START, async (): Promise<BackendStatus> => {
    try {
      await startBackend()
      return getBackendStatus()
    } catch (err) {
      return {
        running: false,
        port: null,
        pid: null,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // ── 9. Netwatch: collect data from switches ────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NETWATCH_COLLECT,
    async (_event, req: CollectRequest): Promise<CollectResponse> => {
      return proxyPost<CollectResponse>('/api/switches/collect', req)
    }
  )

  // ── 10. Netwatch: ping a switch ────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NETWATCH_PING,
    async (_event, creds: SwitchCredentials) => {
      return proxyPost('/api/switches/ping', creds)
    }
  )

  // ── 11. Netwatch: list presets ─────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NETWATCH_GET_PRESETS,
    async () => proxyGet('/api/switches/presets')
  )

  console.log('[Main] All IPC handlers registered.')
}
