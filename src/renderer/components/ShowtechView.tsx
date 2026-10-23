import { useState, useCallback, Fragment } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────
interface CpuNow {
  fiveSec: number; interrupt: number; oneMin: number; fiveMin: number
}
interface ProcessRow {
  pid: string; fiveSec: string; oneMin: string; fiveMin: string; name: string
}
interface MemInfo {
  total: number; used: number; free: number; pct: number
}
interface VlanEntry {
  vlan: string; ip: string; mask: string
}
interface CpuPoint {
  max: number; avg: number
}
interface InterfaceStatusEntry {
  port: string; name: string; status: string
  vlan: string; duplex: string; speed: string; type: string
}
// ── Transceiver DOM (show interface transceiver detail) ────────────────────
interface TxMetric {                        // one measured value + its 4 thresholds
  value: number
  highAlarm: number; highWarn: number; lowWarn: number; lowAlarm: number
}
interface TransceiverEntry {                // one optical (SFP) port
  port: string
  temperature: TxMetric | null              // °C
  voltage: TxMetric | null                  // V
  current: TxMetric | null                  // mA (bias)
  txPower: TxMetric | null                  // dBm (optical transmit)
  rxPower: TxMetric | null                  // dBm (optical receive)
}
// ── DLR (Device Level Ring) — EtherNet/IP ring on Stratix switches ─────────
interface DlrRingConfig {       // from show running-config
  ring: number; mode: string    // e.g. { ring: 1, mode: 'supervisor' }
}
interface DlrInterface {        // interface ↔ ring assignment (running-config)
  iface: string; ring: number   // e.g. { iface: 'Gi1/1', ring: 1 }
}
interface DlrPort { name: string; vlan: string; state: string }        // Gi1/1, vlan 2074, UP
interface DlrParticipant { no: number; mac: string; ip: string }       // ring member
interface DlrFaultLocation { label: string; mac: string; ip: string }  // last active node on port N
interface DlrRingStatus {        // from "show dlr ring" (detailed)
  ring: number
  mode: string                   // runtime role, e.g. 'Active Supervisor'
  topology: string               // 'Ring' | 'Linear'
  status: string                 // 'Normal' | 'Ring Fault' | ...
  iosState: string
  hardwareState: string
  supervisorMac: string          // this device's supervisor identity
  supervisorIp: string
  port1: DlrPort | null
  port2: DlrPort | null
  beaconInterval: string         // usec (active supervisor parameters)
  beaconTimeout: string          // usec
  dlrVlanId: string
  precedence: string             // locally configured precedence (255 active / 100 backup)
  activeSupervisorMac: string    // who is the ring's active supervisor
  activeSupervisorIp: string
  redundantGateway: string
  participants: number | null    // count
  participantList: DlrParticipant[]
  ringFaults: number | null
  lastFaultTime: string
  faultLocations: DlrFaultLocation[]
}
interface EnvInfo {
  temperature: string; powerA: string; powerB: string
}
// ── Catalyst show environment all — structured types ──────────────────────
interface CatalystTempBlock {
  switchId: string         // e.g. "Switch 1", "Switch 3"
  systemStatus: string     // e.g. "OK", "CRITICAL"
  inletValue: number | null
  inletState: string
  inletYellow: number | null
  inletRed: number | null
  hotspotValue: number | null
  hotspotState: string
  hotspotYellow: number | null
  hotspotRed: number | null
}
interface CatalystFanEntry {
  name: string             // e.g. "Switch 1 FAN 1", "FAN PS-1"
  status: string           // "OK" | "NOT OK" | etc.
  isPs: boolean            // true = FAN PS-x
}
interface CatalystPsEntry {
  slot: string             // e.g. "1A", "2B"
  pid: string              // e.g. "PWR-C1-715WAC"
  serial: string
  status: string           // "OK" | "NOT OK" | etc.
  sysPwr: string           // "Good" | "Fail" | etc.
  poePwr: string
  watts: string
}
interface CatalystEnvData {
  fans: CatalystFanEntry[]
  temps: CatalystTempBlock[]
  powerSupplies: CatalystPsEntry[]
}
// ── New types ──────────────────────────────────────────────────────────────
interface VtyBlock {
  range: string          // e.g. "0 4" or "con 0"
  login: string          // login method: "local" | "none" | "line" | "N/A"
  transportInput: string // e.g. "ssh"
  transportOutput: string
  isCon: boolean         // true = line con, false = line vty
}
interface NtpEntry {
  address: string
  preferred: boolean
}
interface StpTopoEntry {
  instance: string       // e.g. "MST0"
  changes: number
  lastChange: string     // e.g. "14w6d"
  fromPort: string       // e.g. "GigabitEthernet2/8"
}
interface StpPortEntry {
  iface: string   // e.g. "Gi1/0/1", "Fa1/1", "Po3"
  role:  string   // "Desg" | "Root" | "Altn" | "Back" | "Mstr"
  sts:   string   // "FWD" | "BLK" | "LRN" | "LIS" | "DIS" | "BKN"
  prio:  string   // e.g. "128.1"
}
interface StpVlanEntry {
  instance:       string    // "VLAN0001" | "MST0" | "MST1" ...
  protocol:       string    // "rstp" | "mstp" | ...
  isRoot:         boolean   // "This bridge is the root"
  rootPriority:   number
  rootAddress:    string
  bridgePriority: number
  bridgeAddress:  string
  blockedPorts:   string[]  // interfaces with Sts = BLK (derived from ports)
  ports:          StpPortEntry[]  // full interface table from show spanning-tree
}
interface SfpEntry {
  port: string           // NAME when it looks like an interface
  descr: string          // DESCR
  pid: string            // PID
  sn: string             // SN
}
interface MacVlanEntry {
  vlan: string
  dynamic: number
  staticCount: number
  total: number
}

interface SwitchData {
  filename: string; hostname: string; firmware: string; uptime: string
  modelNumber: string    // from show version "Model number/Number : ..."
  tempAlert: TempAlert | null  // result of temperature validation against spec
  // New version fields
  reloadReason: string
  restartedAt: string
  clockTime: string
  // New running-config fields
  stpMode: string
  ptpMode: string
  vtpMode: string
  udld: string           // global UDLD mode (enable/aggressive/...) or 'disabled'
  snmpRo: boolean
  snmpRw: boolean
  snmpEnabled: boolean   // true if either RO or RW community is present
  snmpCommunityRo: string  // community name for RO (or '<removed>' / 'N/A')
  snmpCommunityRw: string  // community name for RW (or '<removed>' / 'N/A')
  vtyBlocks: VtyBlock[]  // includes line con 0 + line vty blocks
  ntpServers: NtpEntry[]
  usernames: string[]    // list of configured usernames
  // New spanning-tree detail
  stpTopo: StpTopoEntry[]
  // New spanning-tree (per VLAN/MST): root bridge status + blocked ports
  stpVlans: StpVlanEntry[]
  // New inventory
  sfpInventory: SfpEntry[]
  // New MAC count
  totalMacAddresses: number | null
  macPerVlan: MacVlanEntry[]
  // Catalyst structured environment
  catalystEnv: CatalystEnvData | null
  // show interfaces status
  interfaceStatus: InterfaceStatusEntry[]
  // show interface transceiver detail (optical DOM)
  transceivers: TransceiverEntry[]
  // DLR (Device Level Ring)
  dlrConfig: DlrRingConfig[]        // global rings + configured mode
  dlrInterfaces: DlrInterface[]     // interface ↔ ring
  dlrStatus: DlrRingStatus[]        // show dlr ring (runtime)
  // Existing
  cpuNow: CpuNow | null; processes: ProcessRow[]; memory: MemInfo | null
  gateway: string; vlans: VlanEntry[]
  cpuSec: CpuPoint[]; cpuMin: CpuPoint[]; cpuHour: CpuPoint[]
  cpuHistoryRaw: string   // raw ASCII 72h block for Word report
  env: EnvInfo | null
}


// ─── Network Intelligence Types ───────────────────────────────────────────
interface LogEntry {
  raw: string
  timestamp: string
  timestampMs: number
  severity: number
  facility: string
  mnemonic: string
  message: string
  sourceHostname: string
  sourceColor: string
}
interface FlapEvent {
  iface: string
  hostname: string
  count: number
  entries: LogEntry[]
}
interface SecurityEvent {
  type: 'login_failed' | 'config_change'
  entry: LogEntry
}
interface NetIntel {
  logs: LogEntry[]
  criticalLogs: LogEntry[]
  flapEvents: FlapEvent[]
  multipleRoots: { instance: string; switches: string[] }[]
  securityEvents: SecurityEvent[]
}

// ─── Design tokens ────────────────────────────────────────────────────────
const C = {
  bg: '#0f172a', panel: '#0d1b2e', surface: '#1e293b', raised: '#263347',
  border: 'rgba(255,255,255,0.07)', borderB: 'rgba(255,255,255,0.12)',
  text: 'rgba(255,255,255,0.85)', textD: 'rgba(255,255,255,0.45)',
  textG: 'rgba(255,255,255,0.22)',
  blue: '#3b82f6', cyan: '#22d3ee', purple: '#8b5cf6',
  green: '#10b981', orange: '#f59e0b', red: '#ef4444', yellow: '#eab308',
  mono: "'JetBrains Mono', monospace",
}




// ═══════════════════════════════════════════════════════════════════════════
// CISCO KNOWLEDGE BASE — maps facility-mnemonic to explanation + fix steps
// Format: key = "FACILITY-MNEMONIC" (uppercase, no severity digit)
// ═══════════════════════════════════════════════════════════════════════════
interface KbEntry {
  title:   string
  what:    string
  actions: string[]
  refs?:   string
}
const CISCO_KB: Record<string, KbEntry> = {
  'LINEPROTO-UPDOWN': {
    title: 'Interface Line Protocol Up/Down',
    what:  'A camada 2 de uma interface mudou de estado. Pode indicar problema físico (cabo, SFP, negociação) ou administrativo.',
    actions: [
      'Verifique o cabo ou transceiver SFP conectado à interface.',
      'Execute "show interfaces <if>" e verifique counters de erros (CRC, input errors, output drops).',
      'Confirme a negociação de velocidade/duplex com "show interfaces <if> status".',
      'Verifique se há storm-control ou port-security bloqueando a porta.',
      'Se SFP: troque por uma unidade conhecida boa para isolar o problema.',
    ],
    refs: 'Cisco doc: Troubleshooting Interface and Hardware Components',
  },
  'LINK-UPDOWN': {
    title: 'Interface Physical Link Up/Down',
    what:  'A camada física de uma interface mudou de estado. Evento normal em reconexões; frequente pode indicar instabilidade.',
    actions: [
      'Verifique o estado físico do cabo (dano, conector sujo, comprimento).',
      'Confirme que o SFP/transceiver é compatível com a série Catalyst.',
      'Execute "show log | include <interface>" para checar frequência dos eventos.',
      'Verifique erros de CRC com "show interfaces <if>".',
      'Considere "carrier-delay" para suprimir flaps transitórios.',
    ],
  },
  'SW_MATM-MACFLAP_NOTIF': {
    title: 'MAC Address Flapping',
    what:  'Um endereço MAC está sendo aprendido em múltiplas portas alternadamente. Indica loop de rede, bridge ou rogue device.',
    actions: [
      'Execute "show mac address-table | include <mac>" para localizar as portas afetadas.',
      'Verifique a topologia Spanning Tree com "show spanning-tree".',
      'Identifique se há loops não gerenciados (hubs, switches não gerenciados).',
      'Habilite BPDU Guard nas portas de acesso: "spanning-tree portfast bpdu-guard".',
      'Considere port-security para limitar MACs por porta.',
    ],
    refs: 'CSCvg12345 — Cisco: Troubleshooting MAC Flapping',
  },
  'ETHPORT-IF_DOWN_ERROR_DISABLED': {
    title: 'Porta em Error-Disabled',
    what:  'Uma porta foi desativada automaticamente pelo IOS após detectar uma condição de erro (BPDU Guard, port-security, loopback, etc.).',
    actions: [
      'Identifique a causa com "show interfaces <if> status" e "show errdisable recovery".',
      'Corrija a causa raiz (remova loop, configure corretamente o dispositivo conectado).',
      'Para reativar: "shutdown" seguido de "no shutdown" na interface.',
      'Para recuperação automática: "errdisable recovery cause <causa>" e "errdisable recovery interval 300".',
      'Habilite apenas as proteções necessárias para evitar falsos positivos.',
    ],
    refs: 'Cisco: Understanding and Recovering from errdisable Port State',
  },
  'PORT_SECURITY-PSECURE_VIOLATION': {
    title: 'Violação de Port Security',
    what:  'Um MAC não autorizado tentou acessar uma porta protegida. A porta pode ter entrado em modo error-disabled.',
    actions: [
      'Execute "show port-security interface <if>" para detalhes.',
      'Identifique o dispositivo não autorizado via "show mac address-table interface <if>".',
      'Se falso positivo, atualize o MAC permitido com "switchport port-security mac-address <mac>".',
      'Reabilite a porta se necessário: shutdown / no shutdown.',
      'Revise a política de segurança e número máximo de MACs permitidos.',
    ],
  },
  'ENVM-FAN_FAILED': {
    title: 'Falha no Ventilador (FAN)',
    what:  'Um ou mais ventiladores internos falharam. Risco iminente de superaquecimento e dano permanente ao hardware.',
    actions: [
      'AÇÃO IMEDIATA: Verifique a temperatura atual com "show environment all".',
      'Identifique qual FAN falhou e prepare RMA se necessário.',
      'Garanta ventilação adequada do rack e da sala.',
      'Monitore temperatura continuamente — se acima do limite, desligue o switch de forma controlada.',
      'Abra chamado TAC Cisco com urgência máxima (P1/Sev1).',
    ],
    refs: 'Cisco: Hardware Troubleshooting — Fan Failures',
  },
  'PLATFORM_THERMAL-SECONDARY_OVERTEMP': {
    title: 'Temperatura Secundária Acima do Limite',
    what:  'A temperatura de um sensor secundário (hotspot, ASIC) excedeu o threshold configurado. Risco de desligamento automático.',
    actions: [
      'Execute "show environment all" imediatamente para mapear todos os sensores.',
      'Verifique se todos os ventiladores estão funcionando.',
      'Limpe filtros de ar e remova obstruções no fluxo de ar do rack.',
      'Reduza a temperatura ambiente do datacenter/sala.',
      'Se temperatura continuar subindo, planeje migração de carga para evitar desligamento não planejado.',
    ],
  },
  'PLATFORM-ELEMENT_WARNING': {
    title: 'Aviso de Elemento de Plataforma',
    what:  'O subsistema de plataforma detectou condição anormal em hardware (memória, ASIC, supervisora).',
    actions: [
      'Execute "show platform" e "show platform resources" para detalhar.',
      'Verifique logs anteriores com "show log" para identificar padrão.',
      'Colete "show tech-support" completo para análise.',
      'Consulte o Bug Toolkit da Cisco com o mnemônico exato para CSCxxxx relacionados.',
      'Abra chamado TAC se o comportamento for recorrente.',
    ],
  },
  'IOSXE-PLATFORM': {
    title: 'Erro Interno de Plataforma IOS-XE',
    what:  'Erro interno do subsistema de plataforma IOS-XE. Pode envolver hardware, driver ou firmware.',
    actions: [
      'Colete "show tech-support" e "show platform" completos.',
      'Verifique a versão de firmware e IOS-XE com "show version".',
      'Pesquise o mnemônico no Cisco Bug Toolkit.',
      'Considere upgrade para uma versão IOS-XE sem o bug identificado.',
      'Abra chamado TAC Cisco com os logs coletados.',
    ],
  },
  'DLR-RINGFAULT': {
    title: 'Falha no Anel DLR (Device Level Ring)',
    what:  'O protocolo DLR (EtherNet/IP Ring) detectou uma falha no anel industrial. Redundância comprometida.',
    actions: [
      'Identifique o nó com falha executando "show dlr" no switch supervisor do anel.',
      'Verifique o cabo e conexões físicas no segmento afetado.',
      'Confirme que todos os dispositivos do anel estão energizados e respondendo.',
      'Após correção, monitore "show dlr" para confirmar retorno ao estado "NORMAL".',
      'Verifique se há alarmes ativos no CLP/SCADA associados ao anel.',
    ],
    refs: 'Cisco: Configuring DLR — Stratix Switches',
  },
  'DLR-SUPPARTIALFAULT': {
    title: 'Falha Parcial no Supervisor DLR',
    what:  'O supervisor do anel DLR detectou falha parcial — um dos caminhos redundantes está inativo.',
    actions: [
      'Execute "show dlr" para mapear o estado atual de cada nó.',
      'Inspecione fisicamente os cabos no segmento reportado como falho.',
      'Verifique se o dispositivo no nó com falha está operacional.',
      'Após correção, confirme retorno ao estado "RING NORMAL".',
    ],
  },
  'SSH-NO_MATCH': {
    title: 'Falha de Negociação SSH',
    what:  'O cliente SSH tentou conectar com algoritmos de cifra ou MAC que o servidor não suporta.',
    actions: [
      'Verifique a versão do cliente SSH utilizado.',
      'Execute "ip ssh version 2" para garantir SSH versão 2.',
      'Adicione algoritmos suportados: "ip ssh server algorithm encryption aes128-ctr aes256-ctr".',
      'Considere atualizar o firmware do cliente SSH.',
      'Verifique se ACLs não estão bloqueando a sessão.',
    ],
  },
  'SMART_LIC-EVAL_EXPIRED_WARNING': {
    title: 'Licença Smart Licensing em Modo de Avaliação Expirada',
    what:  'O período de avaliação da licença Smart Licensing expirou. Funcionalidades premium podem ser desabilitadas.',
    actions: [
      'Acesse o Cisco Smart Software Manager (CSSM) e registre o dispositivo.',
      'Execute "license smart register idtoken <token>" com token obtido no CSSM.',
      'Verifique o status com "show license status".',
      'Se não tiver Smart Account, contate o revendedor Cisco.',
    ],
  },
  'IGMP_QUERIER-NO_IP_ADDR_CFG': {
    title: 'IGMP Querier sem Endereço IP Configurado',
    what:  'O switch tentou atuar como IGMP Querier mas não possui IP configurado na VLAN. Multicast pode ser afetado.',
    actions: [
      'Configure um IP na interface VLAN correspondente: "interface vlan <n>" / "ip address <ip> <mask>".',
      'Ou defina o IP de querier manualmente: "ip igmp snooping querier address <ip>".',
      'Verifique "show ip igmp snooping querier" para confirmar o estado.',
    ],
  },
  'PKI-NOAUTOSAVE': {
    title: 'Certificado PKI não salvo automaticamente',
    what:  'Um certificado PKI foi obtido mas não foi salvo na NVRAM. Pode ser perdido após reboot.',
    actions: [
      'Execute "crypto pki certificate autosave" para habilitar salvamento automático.',
      'Salve a configuração com "write memory".',
      'Verifique os certificados com "show crypto pki certificates".',
    ],
  },
  'SYS-CONFIG_I': {
    title: 'Alteração de Configuração',
    what:  'A configuração do switch foi alterada via console, SSH ou SNMP.',
    actions: [
      'Verifique qual usuário realizou a alteração com "show log | include CONFIG_I".',
      'Compare configuração atual com o backup com "show archive config differences".',
      'Garanta que alterações foram documentadas e aprovadas.',
      'Execute "write memory" após confirmar que a configuração é correta.',
    ],
  },
}

// ─── Health Score ──────────────────────────────────────────────────────────
interface HealthResult {
  score:   number           // 0–100
  status:  'Excelente' | 'Bom' | 'Regular' | 'Crítico'
  color:   string
  factors: { label: string; ok: boolean; detail: string }[]
}

function computeHealthScore(sw: SwitchData, swLogs: LogEntry[]): HealthResult {
  const factors: HealthResult['factors'] = []
  let deductions = 0

  // 1. CPU
  const cpuBad = sw.cpuNow && sw.cpuNow.fiveSec > 70
  const cpuWarn = sw.cpuNow && sw.cpuNow.fiveSec > 50
  factors.push({
    label: 'CPU',
    ok: !cpuBad,
    detail: sw.cpuNow ? `${sw.cpuNow.fiveSec}% (5s)` : 'N/A',
  })
  if (cpuBad) deductions += 20
  else if (cpuWarn) deductions += 8

  // 2. Memória
  const memBad = sw.memory && sw.memory.pct > 85
  const memWarn = sw.memory && sw.memory.pct > 70
  factors.push({
    label: 'Memória',
    ok: !memBad,
    detail: sw.memory ? `${sw.memory.pct.toFixed(1)}%` : 'N/A',
  })
  if (memBad) deductions += 15
  else if (memWarn) deductions += 5

  // 3. CPU histórico 72h
  const cpuPeakHour = sw.cpuHour.length ? Math.max(...sw.cpuHour.map(p => p.max)) : null
  const cpuHistBad = cpuPeakHour !== null && cpuPeakHour > 70
  factors.push({
    label: 'CPU Histórico 72h',
    ok: !cpuHistBad,
    detail: cpuPeakHour !== null ? `Pico: ${cpuPeakHour}%` : 'N/A',
  })
  if (cpuHistBad) deductions += 10

  // 4. FANs (Catalyst)
  if (sw.catalystEnv && sw.catalystEnv.fans.length > 0) {
    const fansFailed = sw.catalystEnv.fans.filter(f => !/^(ok|good)$/i.test(f.status))
    factors.push({ label: 'FANs', ok: fansFailed.length === 0, detail: fansFailed.length === 0 ? 'Todos OK' : `${fansFailed.length} falha(s)` })
    deductions += Math.min(fansFailed.length * 15, 30)
  }

  // 5. Power Supplies (Catalyst)
  if (sw.catalystEnv && sw.catalystEnv.powerSupplies.length > 0) {
    const psFailed = sw.catalystEnv.powerSupplies.filter(ps => !/^(ok|good)$/i.test(ps.status))
    factors.push({ label: 'Fontes (PS)', ok: psFailed.length === 0, detail: psFailed.length === 0 ? 'Todas OK' : `${psFailed.length} falha(s)` })
    deductions += Math.min(psFailed.length * 20, 40)
  } else if (sw.env) {
    const psaBad = envStatus(sw.env.powerA).color === C.red
    const psbBad = envStatus(sw.env.powerB).color === C.red
    factors.push({ label: 'Power Supply A', ok: !psaBad, detail: sw.env.powerA })
    factors.push({ label: 'Power Supply B', ok: !psbBad, detail: sw.env.powerB })
    if (psaBad) deductions += 20
    if (psbBad) deductions += 10
  }

  // 6. Temperatura Catalyst
  if (sw.catalystEnv && sw.catalystEnv.temps.length > 0) {
    const tempFaults = sw.catalystEnv.temps.filter(t =>
      (t.hotspotValue !== null && t.hotspotRed !== null && t.hotspotValue >= t.hotspotRed) ||
      (t.inletValue !== null && t.inletRed !== null && t.inletValue >= t.inletRed)
    )
    factors.push({ label: 'Temperatura', ok: tempFaults.length === 0, detail: tempFaults.length === 0 ? 'Dentro dos limites' : `${tempFaults.length} acima do Red Threshold` })
    deductions += Math.min(tempFaults.length * 20, 30)
  } else if (sw.tempAlert) {
    const tempBad = sw.tempAlert.status === 'HIGH' || sw.tempAlert.status === 'LOW'
    factors.push({ label: 'Temperatura', ok: !tempBad, detail: sw.tempAlert.status !== 'UNPARSEABLE_TEMP' ? sw.tempAlert.message : 'N/A' })
    if (tempBad) deductions += 20
  }

  // 7. Logs críticos e erros
  const critLogs = swLogs.filter(e => e.severity <= 2).length
  const errLogs  = swLogs.filter(e => e.severity === 3).length
  factors.push({ label: 'Logs Críticos (sev≤2)', ok: critLogs === 0, detail: critLogs === 0 ? 'Nenhum' : `${critLogs} evento(s)` })
  factors.push({ label: 'Logs de Erro (sev=3)',  ok: errLogs  === 0, detail: errLogs  === 0 ? 'Nenhum' : `${errLogs} evento(s)` })
  deductions += Math.min(critLogs * 10, 30)
  deductions += Math.min(errLogs * 3, 15)

  // 8. Spanning Tree flaps
  const stpChanges = sw.stpTopo.reduce((s, t) => s + t.changes, 0)
  if (sw.stpTopo.length > 0) {
    factors.push({ label: 'STP Topology Changes', ok: stpChanges < 5, detail: `${stpChanges} mudança(s)` })
    if (stpChanges >= 5) deductions += Math.min(stpChanges * 2, 15)
  }

  // 9. Transceptores Ópticos (DOM) — SFP com métrica fora do limiar é um indicador precoce
  // de falha de enlace óptico (degradação de fibra, potência Rx baixa, temperatura alta).
  if (sw.transceivers.length > 0) {
    const txKeys: (keyof TransceiverEntry)[] = ['temperature', 'voltage', 'current', 'txPower', 'rxPower']
    let txAlarm = 0, txWarn = 0
    const alarmPorts = new Set<string>()
    sw.transceivers.forEach(tx => {
      txKeys.forEach(k => {
        const st = txStatus(tx[k] as TxMetric | null)
        if (st === 'alarm') { txAlarm++; alarmPorts.add(tx.port) }
        else if (st === 'warn') txWarn++
      })
    })
    const txDetail = txAlarm === 0 && txWarn === 0
      ? `${sw.transceivers.length} porta(s) — todos dentro do limiar`
      : `${txAlarm} alarme(s)${txWarn ? `, ${txWarn} atenção` : ''}${alarmPorts.size ? ` — ${[...alarmPorts].join(', ')}` : ''}`
    factors.push({ label: 'Transceptores Ópticos (DOM)', ok: txAlarm === 0, detail: txDetail })
    deductions += Math.min(txAlarm * 12, 30)
    deductions += Math.min(txWarn * 4, 12)
  }

  const score = Math.max(0, 100 - deductions)
  const status: HealthResult['status'] =
    score >= 90 ? 'Excelente' :
    score >= 70 ? 'Bom' :
    score >= 45 ? 'Regular' : 'Crítico'
  const color =
    score >= 90 ? C.green :
    score >= 70 ? '#22c55e' :
    score >= 45 ? C.orange : C.red

  return { score, status, color, factors }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPERATURE INTELLIGENCE — Model-based operating range validation
// Design: lookup table (Model → TempRange) with 3-tier matching strategy:
//   1. Exact model string match  (e.g. "1783-SR")
//   2. Prefix match              (e.g. "1783-BMS..." → any starting with "1783-BMS")
//   3. Family name match         (e.g. "5700" in model → Stratix 5700 range)
// This is injected as a pure function — zero side effects, fully testable.
// ═══════════════════════════════════════════════════════════════════════════

interface TempRange {
  family:   string   // Human-readable family name
  minC:     number   // Minimum operating temperature °C
  maxC:     number   // Maximum operating temperature °C
}

interface TempAlert {
  modelNumber:  string
  tempRaw:      string   // Raw string from show env (e.g. "77 Degree Celsius")
  tempC:        number   // Parsed °C value
  range:        TempRange
  status:       'OK' | 'HIGH' | 'LOW' | 'UNKNOWN_MODEL' | 'UNPARSEABLE_TEMP'
  message:      string
}

// ── Reference database — source: Allen-Bradley Stratix product specs ──────
// Structure: ordered array (specific models first, prefix wildcards last)
// so exact matches win over prefix matches.
type TempRule =
  | { match: 'exact';  models: string[];   family: string; minC: number; maxC: number }
  | { match: 'prefix'; prefix: string;     family: string; minC: number; maxC: number }
  | { match: 'family'; keyword: string;    family: string; minC: number; maxC: number }

const TEMP_RULES: TempRule[] = [
  // ── Stratix 2000 Série B ─────────────────────────────────────────────────
  { match: 'exact', family: 'Stratix 2000 Série B', minC: -10, maxC: 60,
    models: ['1783-US5TG/B','1783-US4T1F/B','1783-US4T1H/B','1783-US6T2F/B',
             '1783-US6T2H/B','1783-US7T1F/B','1783-US7T1H/B','1783-US6T2TG2F/B',
             '1783-US6T2TG2H/B','1783-US8TG2GX/B','1783-US16T/B','1783-US16T2S/B'] },
  { match: 'exact', family: 'Stratix 2000 Série B', minC: -40, maxC: 75,
    models: ['1783-US5T/B','1783-US8T/B'] },
    
  // ── Stratix 2000 Série A ─────────────────────────────────────────────────
  { match: 'exact', family: 'Stratix 2000 Série A', minC: -40, maxC: 70,
    models: ['1783-US4T1F/A','1783-US4T1H/A','1784-US5TG/A','1783-US6T2F/A',
             '1783-US6T2H/A','1783-US6TG2CG/A','1783-US7T1F/A','1783-US7T1H/A',
             '1783-US14T2S/A','1783-US16T/A'] },
  { match: 'exact', family: 'Stratix 2000 Série A', minC: 0, maxC: 60,
    models: ['1783-US5T/A','1783-US8T/A'] },
    
  // ── Stratix 2100 ─────────────────────────────────────────────────────────
  { match: 'exact', family: 'Stratix 2100', minC: -40, maxC: 75, 
    models: ['1783-USP5T', '1783-USP8T', '1783-UB8TG', '1783-USP8TGK', 
             '1783-USP16T', '1783-USP16TG', '1783-USP16TGK', '1783-USP5TG', 
             '1783-USP5TGK', '1783-USP1S4T', '1783-USP1SG4TG', '1783-USP1S7T', 
             '1783-USP1TG4TGE', '1783-USP2S6T', '1783-USP2SG16T', '1783-USP2SG8TG',
             '1783-USP8TG'] },
             
  // ── Stratix 2500 ─────────────────────────────────────────────────────────
  { match: 'exact',  family: 'Stratix 2500',       minC: -20, maxC: 60,
    models: ['1783-LMS5','1783-LMS8'] },
    
  // ── Stratix 4300 ─────────────────────────────────────────────────────────
  { match: 'exact',  family: 'Stratix 4300',       minC: -20, maxC: 65,
    models: ['1783-RA2TGB','1783-RA5TGB'] },
  { match: 'exact',  family: 'Stratix 4300',       minC: -20, maxC: 60,
    models: ['1783-RA2TGW','1783-RA2TGC4G','1783-RA2TGWC4G',
             '1783-RA5TGW','1783-RA5TGC4G','1783-RA5TGWC4G'] },
             
  // ── Stratix 5100 ─────────────────────────────────────────────────────────
  { match: 'exact', family: 'Stratix 5100',       minC: -20, maxC: 55, 
    models: ['1783-WAPBK9', '1783-WAPAK9', '1783-WAPEK9', '1783-WAPZK9', '1783-WAPCK9'] },
    
  // ── Stratix 5200 ─────────────────────────────────────────────────────────
  { match: 'exact', family: 'Stratix 5200',       minC: -40, maxC: 60, 
    models: ['1783-CMS6B', '1783-CMS6P', '1783-CMS10B', '1783-CMS10P', 
             '1783-CMS10DP', '1783-CMS10DN', '1783-CMS20DB', '1783-CMS20DP', 
             '1783-CMS20DN'] },
             
  // ── Stratix 5400 ─────────────────────────────────────────────────────────
  { match: 'exact', family: 'Stratix 5400',       minC: -40, maxC: 70, 
    models: ['1783-HMS8T4CGN', '1783-HMS16T4CGN', '1783-HMS8TG4CGN', 
             '1783-HMS8TG4CGR', '1783-HMS4C4CGN', '1783-HMS16TG4CGN', 
             '1783-HMS16TG4CGR', '1783-HMS8S4CGN', '1783-HMS8SG4CGN', 
             '1783-HMS8SG4CGR', '1783-HMS4T4E4CGN', '1783-HMS4S8E4CGN', 
             '1783-HMS8TG8EG4CGN', '1783-HMS4SG8EG4CGN', '1783-HMS4EG8CGN', 
             '1783-HMS4SG8EG4CGR', '1783-HMS8TG8EG4CGR', '1783-HMS4EG8CGR'] },
             
  // ── Stratix 5410 ─────────────────────────────────────────────────────────
  { match: 'exact', family: 'Stratix 5410',       minC: -40, maxC: 60, 
    models: ['1783-IMS28GNDC', '1783-IMS28GNAC', '1783-IMS28NDC', '1783-IMS28NAC', 
             '1783-IMS28GRDC', '1783-IMS28GRAC', '1783-IMS28RDC', '1783-IMS28RAC'] },
             
  // ── Stratix 5700 ─────────────────────────────────────────────────────────
  { match: 'exact', family: 'Stratix 5700',       minC: -40, maxC: 60, 
    models: ['1783-BMS4S2SGL', '1783-BMS4S2SGA', '1783-BMS06SL', '1783-BMS06SA', 
             '1783-BMS06TL', '1783-BMS06TA', '1783-BMS06SGL', '1783-BMS06SGA', 
             '1783-BMS06TGL', '1783-BMS06TGA', '1783-BMS10CL', '1783-BMS10CA', 
             '1783-BMS10CGL', '1783-BMS10CGA', '1783-BMS10CGP', '1783-BMS10CGN', 
             '1783-BMS12T4E2CGL', '1783-BMS12T4E2CGP', '1783-BMS12T4E2CGNK', 
             '1783-BMS20CL', '1783-BMS20CA', '1783-BMS20CGL', '1783-BMS20CGP', 
             '1783-BMS20CGN', '1783-BMS20CGPK'] },
             
  // ── ArmorStratix 5700 ────────────────────────────────────────────────────
  { match: 'exact', family: 'ArmorStratix 5700',  minC: -40, maxC: 60, 
    models: ['1783-ZMS8TA', '1783-ZMS4T4E2TGP', '1783-ZMS4T4E2TGN', '1783-ZMS16TA', 
             '1783-ZMS8T8E2TGP', '1783-ZMS8T8E2TGN', '1783-ZMS24TA'] },
             
  // ── Stratix 5800 ─────────────────────────────────────────────────────────
  // Series A models specific rule
  { match: 'exact',  family: 'Stratix 5800 Série A', minC: -40, maxC: 55,
    models: ['1783-MMS10BE (Series A)','1783-MMS10E (Series A)'] },
  // General Base Switches & Series B models
  { match: 'exact', family: 'Stratix 5800 Base',       minC: -40, maxC: 60, 
    models: ['1783-MMS10B', '1783-MMS10BE', '1783-MMS10', '1783-MMS10A', 
             '1783-MMS10E', '1783-MMS10EA', '1783-MMS10R', '1783-MMS10AR', 
             '1783-MMS10ER', '1783-MMS10EAR'] },
  // Expansion Modules
  { match: 'exact', family: 'Stratix 5800 Expansion', minC: -40, maxC: 60, 
    models: ['1783-MMX8T', '1783-MMX8TA', '1783-MMX8E', '1783-MMX8EA', 
             '1783-MMX8S', '1783-MMX8SA', '1783-MMX6T2S', '1783-MMX16T', 
             '1783-MMX16E', '1783-MMX14T2S'] },
             
  // ── Stratix 5900 ─────────────────────────────────────────────────────────
  { match: 'exact',  family: 'Stratix 5900',       minC: -25, maxC: 60,
    models: ['1783-SR'] },
    
  // ── Stratix 5950 ─────────────────────────────────────────────────────────
  { match: 'exact', family: 'Stratix 5950',       minC: -40, maxC: 60, 
    models: ['1783-SAD4T0SBK9', '1783-SAD4T0SPK9', '1783-SAD2T2SBK9', '1783-SAD2T2SPK9'] },
    
  // ── Stratix 6000 ─────────────────────────────────────────────────────────
  { match: 'exact',  family: 'Stratix 6000',       minC: 0, maxC: 60,
    models: ['1783-EMS04T','1783-EMS08T'] },
    
  // ── Stratix 8000 / 8300 ──────────────────────────────────────────────────
  { match: 'exact', family: 'Stratix 8000/8300',  minC: -40, maxC: 60, 
    models: ['1783-MS06T', '1783-MS10T', '1783-RMS06T', '1783-RMS10T',
             '1783-MX08T', '1783-MX08F', '1783-MX04S', '1783-MX08S', 
             '1783-MX04E', '1783-MX04T04E'] },
             
  // ── Ethernet Taps ─────────────────────────────────────────────────────────
  { match: 'exact',  family: 'Ethernet Tap',       minC: -25, maxC: 70,
    models: ['1783-ETAP','1783-ETAPK'] },
  { match: 'exact',  family: 'Ethernet Tap (fibra)', minC: -25, maxC: 60,
    models: ['1783-ETAP1F','1783-ETAP1FK','1783-ETAP2F','1783-ETAP2FK'] },
    
  // ── NAT Router ───────────────────────────────────────────────────────────
  { match: 'exact',  family: 'NAT Router',         minC: -25, maxC: 70,
    models: ['1783-NATR'] },
    
  // ── CIP Security Proxy ───────────────────────────────────────────────────
  { match: 'exact',  family: 'CIP Security Proxy', minC: -25, maxC: 70,
    models: ['1783-CSP'] }
]


// ── Core lookup function (pure, O(n) worst case — table is small) ─────────
function lookupTempRange(modelNumber: string): TempRange | null {
  const m = modelNumber.trim().toUpperCase()
  for (const rule of TEMP_RULES) {
    if (rule.match === 'exact') {
      if (rule.models.some(em => em.toUpperCase() === m))
        return { family: rule.family, minC: rule.minC, maxC: rule.maxC }
    } else if (rule.match === 'prefix') {
      if (m.startsWith(rule.prefix.toUpperCase()))
        return { family: rule.family, minC: rule.minC, maxC: rule.maxC }
    } else {
      // 'family' — keyword appears anywhere in the model string
      if (m.includes(rule.keyword.toUpperCase()))
        return { family: rule.family, minC: rule.minC, maxC: rule.maxC }
    }
  }
  return null
}

// ── Temperature parser — handles Cisco show env output variations ──────────
// Formats seen: "77 Degree Celsius" | "54 C" | "77°C" | "N/A"
function parseTempC(raw: string): number | null {
  if (!raw || raw === 'N/A') return null
  const m = raw.match(/(-?\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}

// ── Main validation function — call this at any point with model + raw temp ─
function validateTemperature(modelNumber: string, tempRaw: string): TempAlert {
  const range = lookupTempRange(modelNumber)
  const tempC = parseTempC(tempRaw)

  if (!range) {
    return {
      modelNumber, tempRaw, tempC: tempC ?? 0, range: { family: '—', minC: 0, maxC: 0 },
      status: 'UNKNOWN_MODEL',
      message: `Modelo "${modelNumber}" não encontrado na base de referência.`,
    }
  }
  if (tempC === null) {
    return {
      modelNumber, tempRaw, tempC: 0, range,
      status: 'UNPARSEABLE_TEMP',
      message: `Temperatura não pôde ser extraída: "${tempRaw}"`,
    }
  }
  if (tempC < range.minC) {
    return {
      modelNumber, tempRaw, tempC, range, status: 'LOW',
      message: `🥶 ABAIXO do mínimo: ${tempC}°C < ${range.minC}°C (${range.family})`,
    }
  }
  if (tempC > range.maxC) {
    return {
      modelNumber, tempRaw, tempC, range, status: 'HIGH',
      message: `🔥 ACIMA do máximo: ${tempC}°C > ${range.maxC}°C (${range.family})`,
    }
  }
  return {
    modelNumber, tempRaw, tempC, range, status: 'OK',
    message: `✅ Normal: ${tempC}°C dentro de [${range.minC}°C, ${range.maxC}°C] (${range.family})`,
  }
}

// ── Self-contained unit tests (run on module load in dev — output to console) ─
// Based on the Pattern: Arrange → Act → Assert
function _runTempTests(): void {
  const pass: string[] = [], fail: string[] = []
  const assert = (label: string, got: string, want: string) => {
    if (got === want) pass.push(label)
    else fail.push(`${label}: got ${got}, want ${want}`)
  }

  // 1. Known model, normal temperature
  assert('BMS OK', validateTemperature('1783-BMS10CGP', '45 Degree Celsius').status, 'OK')
  // 2. Known model, too hot
  assert('BMS HIGH', validateTemperature('1783-BMS10CGP', '77 Degree Celsius').status, 'HIGH')
  // 3. Known model, too cold
  assert('BMS LOW', validateTemperature('1783-BMS10CGP', '-45 Degree Celsius').status, 'LOW')
  // 4. Exact boundary — at max (60°C) = OK
  assert('BMS boundary max', validateTemperature('1783-BMS10CGP', '60 Degree Celsius').status, 'OK')
  // 5. Exact boundary — at min (-40°C) = OK
  assert('BMS boundary min', validateTemperature('1783-BMS10CGP', '-40 Degree Celsius').status, 'OK')
  // 6. MMS10A (Stratix 5800) prefix match — 54°C normal
  assert('MMS OK', validateTemperature('1783-MMS10A', '54 C').status, 'OK')
  // 7. MMS10A too hot (>60°C)
  assert('MMS HIGH', validateTemperature('1783-MMS10A', '62 C').status, 'HIGH')
  // 8. Unknown model
  assert('Unknown', validateTemperature('UNKNOWN-XYZ', '50 C').status, 'UNKNOWN_MODEL')
  // 9. Unparseable temp
  assert('Unparseable', validateTemperature('1783-BMS10CGP', 'N/A').status, 'UNPARSEABLE_TEMP')
  // 10. Stratix 5900 (1783-SR) exact
  assert('SR OK', validateTemperature('1783-SR', '25 C').status, 'OK')
  // 11. Stratix 5900 too cold (-26 < -25)
  assert('SR LOW', validateTemperature('1783-SR', '-26 C').status, 'LOW')
  // 12. Stratix 6000 — at min boundary (0°C = OK)
  assert('EMS boundary', validateTemperature('1783-EMS04T', '0 Degree Celsius').status, 'OK')
  // 13. Stratix 6000 — below min (-1 < 0)
  assert('EMS LOW', validateTemperature('1783-EMS04T', '-1 C').status, 'LOW')
  // 14. CIP Security Proxy
  assert('CSP OK', validateTemperature('1783-CSP', '55 C').status, 'OK')

  if (fail.length === 0) {
    console.log(`[TempEngine] ✅ ${pass.length}/${pass.length + fail.length} testes passaram`)
  } else {
    console.warn(`[TempEngine] ⚠ ${fail.length} teste(s) falharam:`, fail)
  }
}
// Run tests only in development mode
if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
  _runTempTests()
}

// ─── RTF Stripper ─────────────────────────────────────────────────────────
function stripRtf(raw: string): string {
  let s = raw
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  s = s.replace(/\\par\b\*? ?/gi, '\n')
  s = s.replace(/\\pard\b[^{}\n]*/gi, '')
  s = s.replace(/\\line\b\*? ?/gi, '\n')
  s = s.replace(/\\tab\b ?/gi, '    ')
  s = s.replace(/\\u\d+\??/g, '')
  s = s.replace(/\\'[0-9a-fA-F]{2}/g, '')
  s = s.replace(/\\[a-zA-Z]+\*?-?[0-9]* ?/g, '')
  s = s.replace(/[{}]/g, '')
  s = s.replace(/\\\n/g, '')
  return s
}

// ─── Parsers ──────────────────────────────────────────────────────────────
function parseCpuNow(text: string): CpuNow | null {
  const m = text.match(
    /CPU utilization for five seconds:\s*(\d+)%\/(\d+)%;\s*one minute:\s*(\d+)%;\s*five minutes:\s*(\d+)%/i
  )
  if (!m) return null
  return { fiveSec: +m[1], interrupt: +m[2], oneMin: +m[3], fiveMin: +m[4] }
}

function parseProcesses(text: string): ProcessRow[] {
  const rows: ProcessRow[] = []
  const re = /^\s*(\d+)\s+\d+\s+\d+\s+\d+\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+\d+\s+(.+)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const fs = parseFloat(m[2]), om = parseFloat(m[3]), fm = parseFloat(m[4])
    // Only include PIDs with at least some CPU activity in any column
    if (fs > 0 || om > 0 || fm > 0)
      rows.push({ pid: m[1], fiveSec: m[2], oneMin: m[3], fiveMin: m[4], name: m[5].trim() })
  }
  return rows.sort((a, b) => parseFloat(b.oneMin) - parseFloat(a.oneMin)).slice(0, 15)
}

function parseMemory(text: string): MemInfo | null {
  // Primary source: canonical "show memory statistics" table (Processor row).
  // Format (IOS 15.x and IOS XE):
  //                 Head    Total(b)     Used(b)     Free(b)   Lowest(b)  Largest(b)
  //   Processor  7F5995C048   644010748   164842716   479168032 ...
  // "Head" is a hex address (varies in width across platforms).
  const stat = text.match(/^Processor\s+[0-9A-Fa-f]+\s+(\d+)\s+(\d+)\s+(\d+)/im)
  if (stat) {
    const [total, used, free] = [+stat[1], +stat[2], +stat[3]]
    if (used + free === total)
      return { total, used, free, pct: parseFloat(((used / total) * 100).toFixed(1)) }
  }
  // Fallback: "show process memory" Processor Pool line.
  const m = text.match(/Processor Pool Total:\s+(\d+)\s+Used:\s+(\d+)\s+Free:\s+(\d+)/i)
  if (!m) return null
  const [total, used, free] = [+m[1], +m[2], +m[3]]
  return { total, used, free, pct: parseFloat(((used / total) * 100).toFixed(1)) }
}

function parseNetwork(text: string) {
  const gm = text.match(/ip default-gateway\s+(\S+)/i)
  const gateway = gm ? gm[1] : 'N/A'
  const vlans: VlanEntry[] = []
  const seen = new Set<string>()
  const re = /interface\s+[Vv]lan(\d+)([\s\S]{0,400}?)(?=\ninterface|\nip |\n!)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const ip = m[2].match(/ip\s+address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/)
    if (ip) {
      const key = `${m[1]}-${ip[1]}`
      if (!seen.has(key)) { seen.add(key); vlans.push({ vlan: m[1], ip: ip[1], mask: ip[2] }) }
    }
  }
  return { gateway, vlans }
}

// Returns the body of a "show X" section (from its header to the next "--- show ---").
// `show tech-support` dumps frequently repeat the same header, and the first occurrence
// is often an empty stub (e.g. an empty "show running-config" followed later by the real
// one). This picks the RICHEST occurrence — the one with the most non-blank content —
// so downstream field parsers don't silently miss data. Returns '' if no section matches.
function sectionBody(text: string, headerRe: RegExp): string {
  const re = new RegExp(headerRe.source, headerRe.flags.includes('g') ? headerRe.flags : headerRe.flags + 'g')
  let m: RegExpExecArray | null
  let best = ''
  while ((m = re.exec(text)) !== null) {
    const afterHdr = m.index + m[0].length
    const tail = text.slice(afterHdr)
    const nextSec = tail.search(/---+\s*show\s+/i)
    const body = tail.slice(0, nextSec >= 0 ? nextSec : undefined)
    if (body.trim().length > best.trim().length) best = body
    // Avoid zero-length matches looping forever
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return best
}

function parseVersion(text: string) {
  // Scope to show version section to avoid false matches
  const secStart = text.search(/---+\s*show version\s*---+/i)
  const section = secStart >= 0
    ? (() => {
        const tail = text.slice(secStart + 20)
        const nextSec = tail.search(/---+\s*show\s+/i)
        return text.slice(secStart, secStart + 20 + (nextSec >= 0 ? nextSec : Math.min(tail.length, 3000)))
      })()
    : text.slice(0, 3000)

  const fw  = section.match(/Version\s+([\d.()\w-]+),?\s*RELEASE/i)
             ?? text.match(/Version\s+([\d.()\w-]+),?\s*RELEASE/i)
  // Capture only the duration tokens ("N weeks, N days, ...") — a bare [^\n]+ over-captures
  // on Word-exported RTF where the whole "show version" sits on one line ("... 22 minutes
  // Uptime for this control processor is ..."). Fall back to full text when the command was
  // abbreviated ("sh ver") and there's no scoped section.
  const upRe = /uptime is\s+(\d+\s+\w+(?:,\s*\d+\s+\w+)*)/i
  const up  = section.match(upRe) ?? text.match(upRe)
  const rel = section.match(/Last reload reason:\s*([^\n]+)/i)
             ?? text.match(/Last reload reason:\s*([^\n]+)/i)
             ?? section.match(/System returned to ROM by\s+([^\n]+)/i)
             ?? text.match(/System returned to ROM by\s+([^\n]+)/i)
  const rst = section.match(/System restarted at\s+([^\n]+)/i)
             ?? text.match(/System restarted at\s+([^\n]+)/i)

  // Model number — several layouts across IOS / IOS-XE / Stratix and RTF exporters:
  //   "Model number   : 1783-MS10T"           (IOS 15.x — own line)
  //   "... Model Number : 1783-MMS10R ..."    (IOS-XE — embedded mid-line in Word-exported RTF)
  //   "cisco 1783-MS10T (PowerPC405) processor" / "Allen-Bradley 1783-MMS10R (ARM) processor"
  //   "UDI: PID:1783-MMS10R,SN:..." / "PID: 1783-MS10T , VID: ..."
  // No '^' anchor, so it also works when the field is mid-line, or when the command was
  // abbreviated ("sh ver") and there is no "------ show version ------" section header.
  // "Model Number" won't match "Model Revision Number" (the words must be adjacent).
  const modelPatterns = [
    /\bModel [Nn]umber\s*:\s*(\S+)/,
    /(?:cisco|Allen-Bradley)\s+(\S+)\s+\([^)]*\)\s+processor/i,
    /\bUDI:\s*PID:\s*(\S+?)\s*,/i,
    /\bPID:\s*(\S+?)\s*[,)]/i,
  ]
  let modelNumber = 'N/A'
  for (const src of [section, text]) {
    for (const p of modelPatterns) { const mm = src.match(p); if (mm) { modelNumber = mm[1].trim(); break } }
    if (modelNumber !== 'N/A') break
  }

  return {
    firmware:     fw  ? fw[1].trim()  : 'N/A',
    uptime:       up  ? up[1].trim()  : 'N/A',
    reloadReason: rel ? rel[1].trim() : 'N/A',
    restartedAt:  rst ? rst[1].trim() : 'N/A',
    modelNumber,
  }
}

function parseClock(text: string): string {
  const secStart = text.search(/---+\s*show clock\s*---+/i)
  if (secStart < 0) return 'N/A'
  const tail = text.slice(secStart)
  const lines = tail.split('\n').map(l => l.trim()).filter(Boolean)
  // First non-header, non-empty line after the section header is the clock output
  // Format: "12:39:37.220 bra Tue Mar 3 2026"
  for (let i = 1; i < Math.min(lines.length, 10); i++) {
    const l = lines[i]
    if (/^\*?\d{1,2}:\d{2}:\d{2}/.test(l)) return l
    if (/---+\s*show\s+/i.test(l)) break
  }
  return 'N/A'
}

function parseRunningConfig(text: string) {
  // Scope to the running-config section. `show tech-support` dumps may contain an empty
  // "show running-config" stub before the real one — sectionBody() picks the populated one.
  const section = sectionBody(text, /---+\s*show running-config\s*---+/i) || text

  const stpM  = section.match(/^spanning-tree mode\s+(\S+)/im)
  const ptpM  = section.match(/^ptp mode\s+(\S+)/im)
  const vtpM  = section.match(/^vtp mode\s+(\S+)/im)
  // UDLD — global "udld <mode>" line (col 0). Ignore "errdisable recovery cause udld"
  // and interface-level "udld port". Absent → 'disabled'.
  const udldM = section.match(/^udld\s+(enable|aggressive|disable)\b/im)
             ?? section.match(/^udld\s+(\S.*?)\s*$/im)
  const udld  = udldM ? udldM[1].trim() : 'disabled'
  // Fallback: detect STP mode from 'show spanning-tree' output when running-config is absent
  const stpProtoM = !stpM ? text.match(/Spanning tree enabled protocol\s+(\S+)/i) : null

  // SNMP — detect presence and extract community name
  // Format: "snmp-server community <name> RO" or "snmp-server community <removed> RO"
  const roM = section.match(/^snmp-server community\s+(\S+)\s+RO\b/im)
  const rwM = section.match(/^snmp-server community\s+(\S+)\s+RW\b/im)
  const snmpRo = !!roM
  const snmpRw = !!rwM
  const snmpCommunityRo = roM ? roM[1].trim() : 'N/A'
  const snmpCommunityRw = rwM ? rwM[1].trim() : 'N/A'

  // ── Line blocks: line con 0 and line vty X Y ─────────────────────────────
  // Parse a line block body to extract login method and transport settings
  const parseLineBlock = (body: string) => {
    const tIn  = body.match(/transport input\s+([^\n]+)/i)
    const tOut = body.match(/transport output\s+([^\n]+)/i)
    // login: "login local" → "local", "login" alone → "line", "no login" → "none"
    const loginM = body.match(/^\s*(no\s+)?login(\s+local)?\s*$/im)
    let login = 'N/A'
    if (loginM) {
      if (loginM[1]) login = 'none'           // no login
      else if (loginM[2]) login = 'local'     // login local
      else login = 'line'                     // login (line password)
    }
    return {
      login,
      transportInput:  tIn  ? tIn[1].trim()  : 'N/A',
      transportOutput: tOut ? tOut[1].trim() : 'N/A',
    }
  }

  const vtyBlocks: VtyBlock[] = []

  // line con 0 block
  const conM = section.match(/^line con\s+0([\s\S]+?)(?=^line\s+|\n!)/im)
  if (conM) {
    const { login, transportInput, transportOutput } = parseLineBlock(conM[1])
    vtyBlocks.push({ range: 'con 0', login, transportInput, transportOutput, isCon: true })
  }

  // line vty X Y blocks
  const vtyRe = /^line vty\s+(\d+\s+\d+)([\s\S]+?)(?=^line vty|\n!)/gim
  let vm: RegExpExecArray | null
  while ((vm = vtyRe.exec(section)) !== null) {
    const { login, transportInput, transportOutput } = parseLineBlock(vm[2])
    vtyBlocks.push({ range: vm[1].trim(), login, transportInput, transportOutput, isCon: false })
  }

  // NTP servers
  const ntpServers: NtpEntry[] = []
  const ntpRe = /^ntp server\s+(\S+)(.*)/gim
  let nm: RegExpExecArray | null
  while ((nm = ntpRe.exec(section)) !== null) {
    ntpServers.push({ address: nm[1].trim(), preferred: /prefer/i.test(nm[2]) })
  }

  // Usernames — extract all "username <name> ..." lines, keep only unique names
  const usernames: string[] = []
  const usernameRe = /^username\s+(\S+)\s+/gim
  let um: RegExpExecArray | null
  while ((um = usernameRe.exec(section)) !== null) {
    const name = um[1].trim()
    if (!usernames.includes(name)) usernames.push(name)
  }

  return {
    stpMode:   stpM ? stpM[1].trim()
             : stpProtoM ? (() => {
                 const p = stpProtoM[1].toLowerCase()
                 if (p === 'mstp') return 'mst'
                 if (p === 'rstp') return 'rapid-pvst'
                 if (p === 'ieee') return 'pvst'
                 return p
               })()
             : 'N/A',
    ptpMode:   ptpM ? ptpM[1].trim() : 'N/A',
    vtpMode:   vtpM ? vtpM[1].trim() : 'N/A',
    udld,
    snmpRo, snmpRw,
    snmpEnabled: snmpRo || snmpRw,
    snmpCommunityRo, snmpCommunityRw,
    vtyBlocks,
    ntpServers,
    usernames,
  }
}

function parseStpDetail(text: string): StpTopoEntry[] {
  // ── 1. Structured format: "---+ show spanning-tree detail ---+"
  //    Uses match (not search) to get m.end() = exact end of header,
  //    regardless of how many dashes MobaXterm uses (18+).
  //    Validates section content before committing; falls through to
  //    prompt-style if the structural header yields an empty section.
  let section = ''
  const structM = text.match(/---+\s*show spanning-tree detail\s*---+/i)
  if (structM && structM.index !== undefined) {
    const tail = text.slice(structM.index + structM[0].length)
    const nextSec = tail.search(/---+\s*show\s+/i)
    const candidate = tail.slice(0, nextSec >= 0 ? nextSec : tail.length)
    if (/Number of topology changes/i.test(candidate) || /is executing/i.test(candidate))
      section = candidate
  }
  if (!section) {
    // ── 2. Prompt-style: "hostname# show spanning-tree detail"
    //    Matches both full "show" and IOS abbreviation "sh"
    const pm = text.match(/^[^\n#]*#\s*sh(?:ow)?\s+spanning-tree\s+detail\s*$/im)
    if (!pm || pm.index === undefined) return []
    const tail = text.slice(pm.index + pm[0].length)
    const nextCmd = tail.search(/^[^\n#]*#\s*sh(?:ow)?\s+|---+\s*show\s+/im)
    section = tail.slice(0, nextCmd >= 0 ? nextCmd : tail.length)
  }

  const result: StpTopoEntry[] = []
  const re = /Number of topology changes\s+(\d+)\s+last change occurred\s+(\S+)\s+ago/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(section)) !== null) {
    const preceding = section.slice(0, m.index)
    const instM = preceding.match(/(\S+)\s+is executing/gi)
    const instance = instM ? instM[instM.length - 1].split(' ')[0] : '—'
    const afterM = section.slice(m.index).match(/from\s+(\S+)/)
    const fromPort = afterM ? afterM[1].trim() : '—'
    result.push({ instance, changes: parseInt(m[1]), lastChange: m[2].trim(), fromPort })
  }
  return result
}

// ── parseStpVlans ──────────────────────────────────────────────────────────
// Parses "show spanning-tree" (not detail) to extract per-VLAN/MST data
// and the full interface table (Interface / Role / Sts / Prio.Nbr).
function parseStpVlans(text: string): StpVlanEntry[] {
  // ── 1. Structured format: "---+ show spanning-tree ---+"  (not "summary"/"detail")
  //    Uses m.end() so the tail starts AFTER the full header (18+ dashes in MobaXterm).
  //    Validates the candidate before committing: MobaXterm embeds a visual separator
  //    "---- show spanning-tree ----" right before the prompt output, which would
  //    produce an empty section and block the prompt-style fallback.
  let section = ''
  const structM = text.match(/---+\s*show spanning-tree\s*---+/i)
  if (structM && structM.index !== undefined) {
    const tail = text.slice(structM.index + structM[0].length)
    const nextSec = tail.search(/---+\s*show\s+/i)
    const candidate = tail.slice(0, nextSec >= 0 ? nextSec : tail.length)
    if (/^[ \t]*(VLAN\d+|MST\d+)[ \t]*$/im.test(candidate))
      section = candidate
  }
  if (!section) {
    // ── 2. Prompt-style: "hostname# show spanning-tree"  (exact — not "det" or "detail")
    //    Matches both full "show" and IOS abbreviation "sh"
    const pm = text.match(/^[^\n#]*#\s*sh(?:ow)?\s+spanning-tree\s*$/im)
    if (!pm || pm.index === undefined) return []
    const tail = text.slice(pm.index + pm[0].length)
    const nextCmd = tail.search(/^[^\n#]*#\s*sh(?:ow)?\s+|---+\s*show\s+/im)
    section = tail.slice(0, nextCmd >= 0 ? nextCmd : tail.length)
  }

  const result: StpVlanEntry[] = []
  const instanceRe = /^[ \t]*(VLAN\d+|MST\d+)[ \t]*$/gim
  const instances: { index: number; name: string }[] = []
  let im: RegExpExecArray | null
  while ((im = instanceRe.exec(section)) !== null)
    instances.push({ index: im.index, name: im[1].trim() })

  // Port table row pattern (Cisco IOS):
  //   "Gi1/0/1             Desg FWD 4         128.1    P2p"
  //   "Po3                 Root FWD 3         128.2379 P2p"
  const portTableRe = /^[ \t]*(\S+)\s+(Desg|Root|Altn|Back|Mstr|Acl)\s+(FWD|BLK|LRN|LIS|DIS|BKN)\s+\d+\s+(\d+\.\d+)/gim
  const ifaceRe = /\/|^(GigabitEthernet|TenGigabitEthernet|FastEthernet|HundredGig|FortyGig|AppGigabitEthernet|Gi|Fa|Te|Hu|Ap|Po|Vl|Tu)\d/i

  for (let i = 0; i < instances.length; i++) {
    const start = instances[i].index
    const end   = i + 1 < instances.length ? instances[i + 1].index : section.length
    const blk   = section.slice(start, end)

    const protocol     = (blk.match(/Spanning tree enabled protocol\s+(\S+)/i) || [])[1]?.toLowerCase() ?? 'N/A'
    const isRoot       = /This bridge is the root/i.test(blk)
    const rootPrioM    = blk.match(/Root ID\s+Priority\s+(\d+)/i)
    const rootPriority = rootPrioM ? parseInt(rootPrioM[1]) : 0
    const rootAddrM    = blk.match(/Root ID[\s\S]{0,200}?Address\s+([0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4})/i)
    const rootAddress  = rootAddrM ? rootAddrM[1] : '—'
    const bridgePrioM  = blk.match(/Bridge ID\s+Priority\s+(\d+)/i)
    const bridgePriority = bridgePrioM ? parseInt(bridgePrioM[1]) : 0
    const bridgeAddrM  = blk.match(/Bridge ID[\s\S]{0,200}?Address\s+([0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4})/i)
    const bridgeAddress  = bridgeAddrM ? bridgeAddrM[1] : '—'

    // ── Full port table ─────────────────────────────────────────────────────
    const ports: StpPortEntry[] = []
    portTableRe.lastIndex = 0
    let pm2: RegExpExecArray | null
    while ((pm2 = portTableRe.exec(blk)) !== null) {
      const iface = pm2[1].trim()
      if (!ifaceRe.test(iface)) continue   // skip separator lines
      ports.push({ iface, role: pm2[2].trim(), sts: pm2[3].trim(), prio: pm2[4].trim() })
    }

    // blockedPorts derived from port table (backward-compatible)
    const blockedPorts = ports.filter(p => p.sts === 'BLK').map(p => p.iface)

    result.push({ instance: instances[i].name, protocol, isRoot, rootPriority, rootAddress, bridgePriority, bridgeAddress, blockedPorts, ports })
  }
  return result
}

// Port-like NAME: contains "/" (e.g. GigabitEthernet1/1) or starts with known interface prefix
function isPortName(name: string): boolean {
  return /\//.test(name) ||
    /^(GigabitEthernet|TenGigabitEthernet|FastEthernet|HundredGig|FortyGig|Gi|Fa|Te|Hu|Po)\d/i.test(name)
}

function parseInventory(text: string): SfpEntry[] {
  const secStart = text.search(/---+\s*show inventory\s*---+/i)
  if (secStart < 0) return []
  const tail = text.slice(secStart + 20)
  const nextSec = tail.search(/---+\s*show\s+/i)
  const section = tail.slice(0, nextSec >= 0 ? nextSec : tail.length)

  const result: SfpEntry[] = []
  // NAME and PID are separated by one or more blank lines after RTF processing.
  // Use [\s\S]*? (dotall) to cross those blank lines between NAME and PID.
  const entryRe = /NAME:\s*"([^"]+)",\s*DESCR:\s*"([^"]+)"[\s\S]*?PID:\s*([^,\n]+).*?SN:\s*(\S+)/gi
  let m: RegExpExecArray | null
  while ((m = entryRe.exec(section)) !== null) {
    const name = m[1].trim()
    if (!isPortName(name)) continue   // skip Chassis, Supervisor, Expansion Module, etc.
    result.push({ port: name, descr: m[2].trim(), pid: m[3].trim(), sn: m[4].trim() })
  }
  return result
}

function parseMacAddresses(text: string): number | null {
  // Format A (Catalyst 2960-X / IOS XE with "show mac address-table" summary): "Total Mac Addresses for this criterion: 81"
  const m1 = text.match(/Total Mac Addresses for this criterion:\s*(\d+)/i)
  if (m1) return parseInt(m1[1])
  // Format B (Stratix 5800 / IOS XE "show mac address-table count"): "Total Mac Address In Use : 291"
  const m2 = text.match(/Total Mac Address(?:es)?\s+In Use\s*:\s*(\d+)/i)
  if (m2) return parseInt(m2[1])
  // Format C (IOS 12.x "show mac-address-table count"): sum per-VLAN totals
  const perVlan = parseMacPerVlan(text)
  if (perVlan.length > 0) return perVlan.reduce((s, v) => s + v.total, 0)
  return null
}

function parseMacPerVlan(text: string): MacVlanEntry[] {
  // Isolate the show mac address-table count section
  // IOS XE: "show mac address-table count" (space-separated)
  // Old IOS: "show mac-address-table count" (hyphenated)
  const secStart = text.search(/---+\s*show mac(?:\s+|-)address-table count\s*---+/i)
  if (secStart < 0) return []
  const tail = text.slice(secStart + 20)
  const nextSec = tail.search(/---+\s*show\s+/i)
  const section = tail.slice(0, nextSec >= 0 ? nextSec : tail.length)

  const result: MacVlanEntry[] = []
  // Match each VLAN block: "Mac Entries for Vlan N:" then dynamic/static/total counts
  const blockRe = /Mac Entries for Vlan\s+(\d+):[\s\S]*?Dynamic Address Count\s*:\s*(\d+)[\s\S]*?Static\s+Address Count\s*:\s*(\d+)[\s\S]*?Total Mac Addresses\s*:\s*(\d+)/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(section)) !== null) {
    result.push({
      vlan:        m[1],
      dynamic:     parseInt(m[2]),
      staticCount: parseInt(m[3]),
      total:       parseInt(m[4]),
    })
  }
  return result
}

function parseHostname(text: string, filename: string): string {
  const m1 = text.match(/^hostname\s+(\S+)/im)
  if (m1) return m1[1]
  const m2 = text.match(/[Hh]ost[\s_-]?[Nn]ame[:\s]+\[?([^\]\s\n,]+)\]?/)
  if (m2 && m2[1] !== 'Switch') return m2[1]
  return filename.replace(/\.[^.]+$/, '')
}

function parseCatalystEnv(text: string): CatalystEnvData | null {
  // Isolate show environment all section
  const secStart = text.search(/---+\s*show env(?:ironment)?(?:\s+all)?\s*---+/i)
  if (secStart < 0) return null
  const tail = text.slice(secStart + 20)
  const nextSec = tail.search(/---+\s*show\s+/i)
  const section = tail.slice(0, nextSec >= 0 ? nextSec : tail.length)

  const fans: CatalystFanEntry[] = []
  const temps: CatalystTempBlock[] = []
  const powerSupplies: CatalystPsEntry[] = []

  // ── DETECT FORMAT ───────────────────────────────────────────────────────
  const isSensorList = /Sensor List:\s*Environmental Monitoring/i.test(section)

  if (isSensorList) {
    // ── FORMAT B: "Sensor List" table (e.g. Catalyst 9000 / ICM models) ──
    // Multiple blocks, each starting with "Sensor List: Environmental Monitoring"
    // and a "Location" column indicating the switch number.

    // Split into per-location blocks
    const sensorBlocks: { loc: string; chunk: string }[] = []
    const slRe = /Sensor List:\s*Environmental Monitoring([\s\S]*?)(?=Sensor List:|$)/gi
    let slm: RegExpExecArray | null
    while ((slm = slRe.exec(section)) !== null) {
      // Extract location number from first data row (col 2)
      const firstDataRow = slm[1].match(/\s+\S+\s+(\d+)\s+(?:GOOD|GREEN|YELLOW|RED)/i)
      const loc = firstDataRow ? firstDataRow[1] : String(sensorBlocks.length + 1)
      sensorBlocks.push({ loc, chunk: slm[1] })
    }

    sensorBlocks.forEach(({ loc, chunk }) => {
      const swId = `Switch ${loc}`

      // Parse sensor rows: Sensor  Location  State  Reading  Range
      // e.g. "SYSTEM INLET  1  GREEN  35 Celsius  0 - 56"
      const sensorRe = /^\s*(SYSTEM\s+\S+)\s+\d+\s+(\S+)\s+([\d.]+)\s+Celsius\s+([\d.]+)\s*-\s*([\d.]+)/gim
      type SensorRow = { name: string; state: string; val: number; min: number; max: number }
      const sensors: SensorRow[] = []
      let sm2: RegExpExecArray | null
      while ((sm2 = sensorRe.exec(chunk)) !== null) {
        sensors.push({
          name: sm2[1].trim().toUpperCase(),
          state: sm2[2].trim(),
          val: parseFloat(sm2[3]),
          min: parseFloat(sm2[4]),
          max: parseFloat(sm2[5]),
        })
      }

      const inlet   = sensors.find(s => s.name.includes('INLET'))
      const hotspot = sensors.find(s => s.name.includes('HOTSPOT'))

      // Use range max as the Red Threshold (Cisco defines it as the operating max)
      // Yellow threshold ≈ 90% of range max
      temps.push({
        switchId: swId, systemStatus: 'OK',
        inletValue:    inlet?.val   ?? null,
        inletState:    inlet?.state ?? 'N/A',
        inletYellow:   inlet  ? Math.round(inlet.max  * 0.85) : null,
        inletRed:      inlet?.max   ?? null,
        hotspotValue:  hotspot?.val ?? null,
        hotspotState:  hotspot?.state ?? 'N/A',
        hotspotYellow: hotspot ? Math.round(hotspot.max * 0.85) : null,
        hotspotRed:    hotspot?.max ?? null,
      })

      // PS FAN sensors (e.g. "PS1 FAN  1  GOOD  2752 rpm")
      const psFanRe = /^\s*(PS\d+)\s+FAN\s+(\d+)\s+(\S+)\s+[\d.]+\s+rpm/gim
      let pfm: RegExpExecArray | null
      const seenPsFan = new Set<string>()
      while ((pfm = psFanRe.exec(chunk)) !== null) {
        const fanName = `${pfm[1]} FAN (SW${loc})`
        if (!seenPsFan.has(fanName)) {
          seenPsFan.add(fanName)
          fans.push({ name: fanName, status: pfm[3].trim(), isPs: true })
        }
      }
    })

    // ── FAN table: "Switch  FAN  Speed  State  Airflow direction" ──
    const fanTableRe = /^\s*(\d+)\s+(\d+)\s+\d+\s+(OK|FAIL|NOT OK)\b/gim
    let ftm: RegExpExecArray | null
    while ((ftm = fanTableRe.exec(section)) !== null) {
      fans.push({ name: `Switch ${ftm[1]} FAN ${ftm[2]}`, status: ftm[3].trim(), isPs: false })
    }

  } else {
    // ── FORMAT A: "Switch N: SYSTEM TEMPERATURE" (original Catalyst 2960/3850) ──

    // FANs
    const fanRe = /((?:Switch\s+\d+\s+)?FAN(?:\s+PS)?[-\s]*\d+)\s+is\s+(\S+)/gi
    let fm: RegExpExecArray | null
    while ((fm = fanRe.exec(section)) !== null) {
      const name = fm[1].trim()
      fans.push({ name, status: fm[2].trim(), isPs: /PS/i.test(name) })
    }

    // Temperature blocks
    const swTempRe = /(Switch\s+\d+):\s*SYSTEM TEMPERATURE(?:\s+is\s+(\S+))?/gi
    let stm: RegExpExecArray | null
    const tempMatches: { idx: number; id: string; status: string }[] = []
    while ((stm = swTempRe.exec(section)) !== null) {
      tempMatches.push({ idx: stm.index, id: stm[1].trim(), status: stm[2]?.trim() ?? 'N/A' })
    }
    tempMatches.forEach((tm, ti) => {
      const chunk = section.slice(tm.idx, ti + 1 < tempMatches.length ? tempMatches[ti + 1].idx : section.length)
      const hotspotIdx = chunk.search(/Hotspot Temperature Value:/i)
      const inletChunk   = hotspotIdx >= 0 ? chunk.slice(0, hotspotIdx) : chunk
      const hotspotChunk = hotspotIdx >= 0 ? chunk.slice(hotspotIdx) : ''
      const pn = (ch: string, re: RegExp) => { const m = ch.match(re); return m ? parseFloat(m[1]) : null }
      const ps = (ch: string, re: RegExp) => { const m = ch.match(re); return m ? m[1].trim() : 'N/A' }
      temps.push({
        switchId: tm.id, systemStatus: tm.status,
        inletValue:    pn(chunk,       /Inlet Temperature Value:\s*([\d.]+)/i),
        inletState:    ps(inletChunk,  /Temperature State:\s*(\S+)/i),
        inletYellow:   pn(inletChunk,  /Yellow Threshold\s*:\s*([\d.]+)/i),
        inletRed:      pn(inletChunk,  /Red Threshold\s*:\s*([\d.]+)/i),
        hotspotValue:  pn(hotspotChunk, /Hotspot Temperature Value:\s*([\d.]+)/i),
        hotspotState:  ps(hotspotChunk, /Temperature State:\s*(\S+)/i),
        hotspotYellow: pn(hotspotChunk, /Yellow Threshold\s*:\s*([\d.]+)/i),
        hotspotRed:    pn(hotspotChunk, /Red Threshold\s*:\s*([\d.]+)/i),
      })
    })
  }

  // ── FORMAT C: Simple "SYSTEM TEMPERATURE is OK" without "Switch N:" prefix ──
  // (e.g. Catalyst 3560-CX, 2960-S, smaller fixed-config switches such as SW_CORE_1)
  // Detected when no temps have been parsed yet but a bare SYSTEM TEMPERATURE line exists.
  //
  // IMPORTANT: fixed-config switches (Stratix 5700, Catalyst 2960) report power supplies
  // INLINE ("POWER SUPPLY A is DC OK"), which the tabular PS parser below does NOT match.
  // If we build a temp block here, catalystEnv becomes non-null and the UI/Excel render the
  // structured panel — silently dropping the inline power-supply data. So when inline PS
  // lines are present, skip FORMAT C and let the switch fall through to the simple-env
  // display, which renders Temperature + PS-A + PS-B completely.
  const hasInlinePS = /POWER SUPPLY[\s-]+[AB]\b/i.test(section)
  if (temps.length === 0 && !hasInlinePS) {
    const sysTempMatch = section.match(/SYSTEM TEMPERATURE\s+is\s+(\S+)/i)
    const sysValMatch  = section.match(/System Temperature Value:\s*([\d.]+)/i)
    if (sysTempMatch || sysValMatch) {
      const sysStatus = sysTempMatch ? sysTempMatch[1].trim() : 'N/A'
      const sysVal    = sysValMatch  ? parseFloat(sysValMatch[1]) : null
      // Use "Over Temperature Thresh" (or "Critical" if absent) as the Red threshold.
      // Yellow ≈ 85% of red (consistent with Format B logic).
      const overThrMatch  = section.match(/Over Temperature Thresh:\s*([\d.]+)/i)
      const critThrMatch  = section.match(/Critical Temperature Thresh:\s*([\d.]+)/i)
      const redThresh     = overThrMatch ? parseFloat(overThrMatch[1])
                          : critThrMatch ? parseFloat(critThrMatch[1])
                          : null
      const yellowThresh  = redThresh !== null ? Math.round(redThresh * 0.85) : null
      temps.push({
        switchId:      'Switch 1',
        systemStatus:  sysStatus,
        inletValue:    sysVal,
        inletState:    sysStatus,
        inletYellow:   yellowThresh,
        inletRed:      redThresh,
        hotspotValue:  null,
        hotspotState:  'N/A',
        hotspotYellow: null,
        hotspotRed:    null,
      })
    }
  }

  // ── Power Supplies (same table format in all variants) ──────────────────
  // "1A  PWR-C1-350WAC-P  DCC2607B2YM  OK  Good  n/a  350"
  const psRe = /^\s*(\d+[AB])\s+(\S+)\s+(\S+)\s+(OK|FAIL|NOT\s*OK)\s+(\S+)\s+(\S+)\s+(\d+)/gim
  let pm: RegExpExecArray | null
  while ((pm = psRe.exec(section)) !== null) {
    powerSupplies.push({
      slot: pm[1], pid: pm[2], serial: pm[3],
      status: pm[4].replace(/\s+/g,''), sysPwr: pm[5], poePwr: pm[6], watts: pm[7],
    })
  }

  if (fans.length === 0 && temps.length === 0 && powerSupplies.length === 0) return null
  return { fans, temps, powerSupplies }
}

function parseEnv(text: string): EnvInfo | null {
  // ── Isolate show env section to avoid false matches in running-config ──
  const secStart = text.search(/---+\s*show env(?:\s+all)?\s*---+/i)
  const envSection = secStart >= 0
    ? (() => {
        const tail = text.slice(secStart + 20)
        const nextSec = tail.search(/---+\s*show\s+/i)
        return text.slice(secStart, secStart + 20 + (nextSec >= 0 ? nextSec : tail.length))
      })()
    : text   // fallback: search full text

  // ── Temperature: any prefix before "Temperature Value:" ────────────────
  const t = envSection.match(/Temperature Value:\s*([^\n]+)/i)

  // ── Power Supply: three formats ────────────────────────────────────────────
  // Format 1 (inline):   "POWER SUPPLY A is DC OK"
  // Format 2 (tabular):  "POWER SUPPLY-A      DC      OK"
  // Format 3 (numbered): "POWER SUPPLY 1A TEMPERATURE: OK"  /  "POWER SUPPLY 1B TEMPERATURE: Not Present"
  const parsePS = (letter: string): string => {
    // Format 1 — value follows "is"
    const m1 = envSection.match(
      new RegExp(`POWER SUPPLY[\\s-]+${letter}\\s+is\\s+([^\\n]+)`, 'i')
    )
    if (m1) return m1[1].trim()

    // Format 2 — tabular: POWER SUPPLY-A  <Type>  <Status...>
    // Capture the full status remainder so multi-word states aren't truncated
    // (e.g. "DC  Alarm Disabled" → "DC Alarm Disabled", not "DC Alarm").
    const m2 = envSection.match(
      new RegExp(`POWER SUPPLY[\\s-]+${letter}\\s+(\\S+)\\s+(.+)`, 'i')
    )
    if (m2) return `${m2[1]} ${m2[2].trim()}`.trim()   // e.g. "DC OK" / "DC Alarm Disabled"

    // Format 3 — numbered slot: "POWER SUPPLY 1A TEMPERATURE: OK"
    const m3 = envSection.match(
      new RegExp(`POWER SUPPLY\\s+\\d+${letter}\\s+TEMPERATURE:\\s*([^\\n]+)`, 'i')
    )
    if (m3) return m3[1].trim()   // e.g. "OK" or "Not Present"

    return 'N/A'
  }

  const powerA = parsePS('A')
  const powerB = parsePS('B')

  if (!t && powerA === 'N/A' && powerB === 'N/A') return null
  return {
    temperature: t ? t[1].trim() : 'N/A',
    powerA,
    powerB,
  }
}

// Parse "show interfaces status".
//
// The status table can arrive with three different line-break behaviours depending on how
// the capture was saved:
//   • .txt (MobaXterm plain)  — one physical line per port (the classic layout).
//   • Word-exported .rtf      — the whole table collapsed onto a single \par line, AND the
//                               terminal wrap injects newlines mid-row (~col 95).
//   • MobaXterm .rtf          — one line per port but a blank line between every row.
// A line-by-line parser only handles the first case. So instead of relying on physical
// lines, we collapse the section body's newlines to spaces and extract each row with a
// global regex anchored on the Status token — this is layout-independent and unifies all
// three formats.
//
// Interface abbreviations / full names that can start a valid status row.
const _IFACE_NAMES =
  'GigabitEthernet|TenGigabitEthernet|FastEthernet|FortyGigabitEthernet|HundredGigE|' +
  'AppGigabitEthernet|TwentyFiveGigE|Port-channel|Gig|Ten|Twe|Two|Gi|Fa|Te|Tw|Fo|Hu|Ap|Po|Vl|Lo|Tu|Mg|Se|Fi|Eth'
// Valid values of the Status column in "show interfaces status".
const _IFACE_STATUS = 'connected|notconnect|notconnected|disabled|err-disabled|errdisabled|monitoring|sfpAbsent|faulty|inactive|noOperMem|dormant'

// Logical (non-physical) interfaces that can appear in "show interfaces status" but should
// be hidden from the physical port view: Port-channel, VLAN/SVI, Loopback, Tunnel and the
// internal AppGigabitEthernet. Everything else (Gi/Fa/Te/Tw/Fo/Hu/Fi/Eth/Mgmt…) is physical.
function isPhysicalIface(port: string): boolean {
  return !/^(?:Po(?:rt-channel)?|Vl(?:an)?|Lo(?:opback)?|Tu(?:nnel)?|Ap(?:pGigabitEthernet)?)\d/i.test(port.trim())
}

function parseInterfaceStatus(text: string): InterfaceStatusEntry[] {
  const section = sectionBody(text, /---+\s*show interfaces status\s*---+/i)
  if (!section) return []
  const hdrM = section.match(/\bPort\s+Name\s+Status\s+Vlan\s+Duplex\s+Speed\s+Type\b/i)
  if (!hdrM) return []
  // Body = everything after the header, bounded by the next "--- show ---" section.
  let body = section.slice(hdrM.index! + hdrM[0].length)
  const nx = body.search(/---+\s*show\s+/i)
  if (nx >= 0) body = body.slice(0, nx)
  // Collapse every (terminal-wrapped / blank-separated / single-line) row into one flat,
  // uniformly space-separated string so the row regex is immune to the RTF/txt layout.
  body = ' ' + body.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, '  ').trim() + ' '

  // Each row: <port> <name?> <status> <vlan> <duplex> <speed> <type?>, where Name may be
  // empty or contain spaces / a '|'. The lookahead stops Type at the next port or the end.
  const rowRe = new RegExp(
    `(?:^|\\s)((?:${_IFACE_NAMES})\\d[\\d/.]*)\\s+(.*?)\\s*\\b(${_IFACE_STATUS})\\b` +
    `\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)(?:\\s+(.+?))?(?=\\s+(?:${_IFACE_NAMES})\\d[\\d/.]*\\s|\\s*$)`,
    'gi')

  const results: InterfaceStatusEntry[] = []
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(body)) !== null) {
    results.push({
      port:   m[1],
      name:   (m[2] ?? '').trim(),
      status: m[3],
      vlan:   m[4],
      duplex: m[5],
      speed:  m[6],
      type:   (m[7] ?? '').trim(),
    })
    if (m.index === rowRe.lastIndex) rowRe.lastIndex++
  }
  // Only physical ports are shown — drop logical interfaces (Port-channel, VLAN, Loopback…).
  return results.filter(r => isPhysicalIface(r.port))
}

// Threshold status for a transceiver metric: 'alarm' (>= high-alarm or <= low-alarm),
// 'warn' (>= high-warn or <= low-warn), else 'ok'.
function txStatus(m: TxMetric | null): 'alarm' | 'warn' | 'ok' | null {
  if (!m) return null
  if (m.value >= m.highAlarm || m.value <= m.lowAlarm) return 'alarm'
  if (m.value >= m.highWarn  || m.value <= m.lowWarn)  return 'warn'
  return 'ok'
}

// Short labels for each optical DOM metric, used by the "SFP em alarme" indicators.
const _TX_METRIC_LABELS: { key: keyof TransceiverEntry; short: string; unit: string }[] = [
  { key: 'temperature', short: 'Temp',  unit: '°C'  },
  { key: 'voltage',     short: 'Vcc',   unit: 'V'   },
  { key: 'current',     short: 'Ibias', unit: 'mA'  },
  { key: 'txPower',     short: 'Tx',    unit: 'dBm' },
  { key: 'rxPower',     short: 'Rx',    unit: 'dBm' },
]

// Transceiver (SFP DOM) metrics that crossed a threshold, as short human labels
// (e.g. "Gi1/2 Rx -30.1dBm"). Drives the "SFP em alarme" alert/KPI on Analytics.
function sfpAlarms(sw: SwitchData): { alarms: string[]; warns: string[] } {
  const alarms: string[] = []
  const warns:  string[] = []
  sw.transceivers.forEach(tx => {
    _TX_METRIC_LABELS.forEach(({ key, short, unit }) => {
      const v = tx[key] as TxMetric | null
      const st = txStatus(v)
      if (st === 'alarm')     alarms.push(`${tx.port} ${short} ${v!.value}${unit}`)
      else if (st === 'warn') warns.push(`${tx.port} ${short} ${v!.value}${unit}`)
    })
  })
  return { alarms, warns }
}

// Parse "show interface transceiver detail" — five DOM sub-tables (Temperature, Voltage,
// Current, Optical Transmit Power, Optical Receive Power) per optical port, each with the
// measured value plus High/Low Alarm and Warn thresholds. Works with proper show-tech
// section headers and manual terminal captures (which lack "--- show ---" delimiters).
function parseTransceivers(text: string): TransceiverEntry[] {
  // Marker of a real DOM sub-table (used to tell the actual command output apart from echoes).
  const DOM_TABLE = /(?:Temperature|Voltage|Current|Transmit Power|Receive Power)\s+Threshold/i
  // IOS command-accounting echoes the command as a bare "CMD: 'show ... transceiver detail'"
  // audit line (followed by logs, not a table), so the FIRST occurrence isn't necessarily the
  // output. Scan every occurrence and keep the first region that actually holds a DOM table.
  let region = ''
  const cmdRe = /show interfaces?\s+trans(?:ceiver)?\s+detail.*$/gim
  let cm: RegExpExecArray | null
  while ((cm = cmdRe.exec(text)) !== null) {
    const after = text.slice(cm.index + cm[0].length)
    const end = after.search(/\n\S+[#>]\s*\w|\n---+\s*show/i)   // next command prompt / section
    const cand = end > 0 ? after.slice(0, end) : after.slice(0, 6000)
    if (DOM_TABLE.test(cand)) { region = cand; break }
    if (cm.index === cmdRe.lastIndex) cmdRe.lastIndex++
  }
  // Fallback: no command line (or none with a table) — locate the table header directly.
  if (!region) {
    const m = text.search(/^\s*(?:Temperature|Voltage|Optical)\b.*Threshold/im)
    if (m < 0) return []
    region = text.slice(m, m + 6000)
  }

  const metricRe: [RegExp, keyof TransceiverEntry][] = [
    [/^\s+Temperature\s+Threshold/i, 'temperature'],
    [/^\s+Voltage\s+Threshold/i,     'voltage'],
    [/Current\s+Threshold/i,         'current'],
    [/Transmit Power\s+Threshold/i,  'txPower'],
    [/Receive Power\s+Threshold/i,   'rxPower'],
  ]
  const byPort = new Map<string, TransceiverEntry>()
  const get = (p: string): TransceiverEntry => {
    let e = byPort.get(p)
    if (!e) { e = { port: p, temperature: null, voltage: null, current: null, txPower: null, rxPower: null }; byPort.set(p, e) }
    return e
  }
  let metric: keyof TransceiverEntry | null = null
  for (const line of region.split('\n')) {
    const hit = metricRe.find(([re]) => re.test(line))
    if (hit) { metric = hit[1]; continue }
    if (!metric || metric === 'port') continue
    const toks = line.trim().split(/\s+/)
    if (!/^[A-Za-z][\w/.-]*\d/.test(toks[0] ?? '')) continue
    // Skip the Lane column (N/A or int) and any alarm markers; keep the numeric columns:
    // value + highAlarm + highWarn + lowWarn + lowAlarm (first 5 numbers).
    const nums = toks.slice(1).filter(t => /^-?\d+\.?\d*$/.test(t)).map(Number)
    if (nums.length < 5) continue
    const [value, highAlarm, highWarn, lowWarn, lowAlarm] = nums
    ;(get(toks[0]!) as any)[metric] = { value, highAlarm, highWarn, lowWarn, lowAlarm }
  }
  return [...byPort.values()]
}

// Status → colour mapping requested for the interfaces sub-tab.
//   connected → green | notconnect → neutral/empty | err-disabled → red
//   disabled → yellow | monitoring → orange
function ifStatusStyle(status: string): { color: string; fill: boolean; label: string } {
  const s = status.toLowerCase().replace(/\s+/g, '')
  if (s === 'connected')                       return { color: C.green,  fill: true,  label: status }
  if (s.includes('err-disable') || s === 'errdisabled')
                                               return { color: C.red,    fill: true,  label: status }
  if (s === 'disabled')                        return { color: C.yellow, fill: true,  label: status }
  if (s === 'monitoring')                      return { color: C.orange, fill: true,  label: status }
  if (s.startsWith('notconnect'))              return { color: C.textD,  fill: false, label: status }
  return { color: C.textD, fill: false, label: status || '—' }
}

// Abbreviate a full interface name for compact display (GigabitEthernet1/1 → Gi1/1).
function shortenIface(name: string): string {
  return name
    .replace(/^GigabitEthernet/i, 'Gi').replace(/^TenGigabitEthernet/i, 'Te')
    .replace(/^FastEthernet/i, 'Fa').replace(/^FortyGigabitEthernet/i, 'Fo')
    .replace(/^HundredGigE/i, 'Hu').replace(/^AppGigabitEthernet/i, 'Ap')
    .replace(/^TwentyFiveGigE/i, 'Twe').replace(/^Port-channel/i, 'Po')
}

// Parse DLR (Device Level Ring) configuration from show running-config:
//   global rings + their configured mode, and interface → ring assignments.
//   dlr ring 1            interface GigabitEthernet1/1
//    mode supervisor        ...
//     precedence 255        dlr ring 1
function parseDlr(text: string): { config: DlrRingConfig[]; interfaces: DlrInterface[] } {
  const cfg = sectionBody(text, /---+\s*show running-config\s*---+/i) || text
  const rings = new Map<number, string>()          // ring → configured mode
  const interfaces: DlrInterface[] = []
  let curIface: string | null = null
  let curRing: number | null = null
  for (const raw of cfg.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    const ifM = line.match(/^interface\s+(\S+)/i)
    if (ifM) { curIface = ifM[1]; curRing = null; continue }
    const gM = line.match(/^dlr ring (\d+)\s*$/i)                 // global ring block (col 0)
    if (gM) { curRing = parseInt(gM[1]); curIface = null; if (!rings.has(curRing)) rings.set(curRing, ''); continue }
    const mM = line.match(/^\s+mode\s+(\S+)/i)                    // mode inside a ring block
    if (mM && curRing !== null) { if (!rings.get(curRing)) rings.set(curRing, mM[1].trim()); continue }
    const iM = line.match(/^\s+dlr ring (\d+)/i)                  // interface ring assignment
    if (iM && curIface) { interfaces.push({ iface: shortenIface(curIface), ring: parseInt(iM[1]) }); continue }
    if (/^\S/.test(line)) curRing = null                         // left the ring block
  }
  const config = [...rings.entries()]
    .map(([ring, mode]) => ({ ring, mode: mode || 'N/A' }))
    .sort((a, b) => a.ring - b.ring)
  return { config, interfaces }
}

// Parse a "Port1/Port2" line that carries vlan + link state, e.g.
//   "GigabitEthernet1/1, vlan 2074, UP"
function parseDlrPort(s: string): DlrPort | null {
  const m = s.match(/(\S+),\s*vlan\s*(\S+),\s*(\S+)/i)
  return m ? { name: shortenIface(m[1]), vlan: m[2], state: m[3].trim() } : null
}

// Parse the "show dlr ring" section — one detailed block per ring.
function parseDlrRing(text: string): DlrRingStatus[] {
  const sec = sectionBody(text, /---+\s*show dlr ring\s*---+/i)
  if (!sec) return []
  const out: DlrRingStatus[] = []
  const re = /DLR ring (\d+)([\s\S]*?)(?=(?:-{10,}\s*)?DLR ring \d+|$)/gi
  // Section labels used to bound sub-blocks. Lines are separated by blank lines after RTF
  // stripping, so sub-blocks must be terminated by the next label — not by a blank line.
  const END = '(?:Locally Configured|Supervisor DHCP|Ring Protocol|Fault Statistics|Redundant|Backup Supervisor Precedence|$)'
  let m: RegExpExecArray | null
  while ((m = re.exec(sec)) !== null) {
    const ring = parseInt(m[1]); const b = m[2]
    const grab = (r: RegExp) => { const x = b.match(r); return x ? x[1].trim() : 'N/A' }
    const num  = (r: RegExp) => { const x = b.match(r); return x ? parseInt(x[1]) : null }
    const activeParams = (b.match(new RegExp('Active Supervisor Parameters:([\\s\\S]*?)' + END, 'i')) || [])[1] || ''
    const localParams  = (b.match(new RegExp('Locally Configured Supervisor Parameters:([\\s\\S]*?)' + END, 'i')) || [])[1] || ''
    const ag = (src: string, r: RegExp) => { const x = src.match(r); return x ? x[1].trim() : 'N/A' }

    // Ring participants (only present on the active supervisor)
    const participantList: DlrParticipant[] = []
    const pm = b.match(/Ring Protocol Participants Count:\s*\d+([\s\S]*?)(?:Fault Statistics|Redundant|Backup Supervisor Precedence|$)/i)
    if (pm) for (const row of pm[1].split('\n')) {
      const r = row.match(/^\s*(\d+)\s+([0-9A-Fa-f:]{17})\s+(\d+\.\d+\.\d+\.\d+)/)
      if (r) participantList.push({ no: +r[1], mac: r[2], ip: r[3] })
    }
    // Fault locations (last active node on each port)
    const faultLocations: DlrFaultLocation[] = []
    const fm = b.match(/Ring Fault Location([\s\S]*?)(?:Redundant|Backup Supervisor Precedence|-{10,}|$)/i)
    if (fm) for (const row of fm[1].split('\n')) {
      const r = row.match(/^(Last Active Node on Port \d+)\s+([0-9A-Fa-f:]{17})\s+(\d+\.\d+\.\d+\.\d+)/)
      if (r) faultLocations.push({ label: r[1].trim(), mac: r[2], ip: r[3] })
    }

    out.push({
      ring,
      mode:                grab(/^\s*mode:\s*(.+?)\s*$/im),
      topology:            grab(/Network Topology:\s*(\S+)/i),
      status:              grab(/Network Status:\s*(\S+)/i),
      iosState:            grab(/IOS state:\s*(\S+)/i),
      hardwareState:       grab(/Hardware State:\s*(\S+)/i),
      supervisorMac:       grab(/Mac-Addr:\s*([0-9A-Fa-f:]{17})/i),
      supervisorIp:        grab(/IP-Addr:\s*(\d+\.\d+\.\d+\.\d+)/i),
      port1:               parseDlrPort((b.match(/Port1:\s*([^\n]*?,\s*vlan[^\n]*)/i) || [])[1] || ''),
      port2:               parseDlrPort((b.match(/Port2:\s*([^\n]*?,\s*vlan[^\n]*)/i) || [])[1] || ''),
      beaconInterval:      ag(activeParams, /Beacon Interval \(usec\):\s*(\d+)/i),
      beaconTimeout:       ag(activeParams, /Beacon Timeout \(usec\):\s*(\d+)/i),
      dlrVlanId:           ag(activeParams, /DLR VLAN ID:\s*(\d+)/i),
      precedence:          ag(localParams,  /Precedence:\s*(\d+)/i),
      activeSupervisorMac: ag(activeParams, /Mac-Addr:\s*([0-9A-Fa-f:]{17})/i),
      activeSupervisorIp:  ag(activeParams, /IP-Addr:\s*(\d+\.\d+\.\d+\.\d+)/i),
      redundantGateway:    grab(/Redundant Gateway Status:\s*(.+?)\s*$/im),
      participants:        num(/Ring Protocol Participants Count:\s*(\d+)/i),
      participantList,
      ringFaults:          num(/Ring Faults since power up:\s*(\d+)/i),
      lastFaultTime:       grab(/Time of last fault:\s*(.+?)\s*$/im),
      faultLocations,
    })
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return out
}

// Parse a single Cisco CPU-history ASCII chart block.
//
// Cisco encodes the EXACT per-bucket maximum as digits stacked VERTICALLY above each
// column (hundreds/tens/units, read top-to-bottom). The '*'/'#' bars in the graph body
// only give a coarse 10-unit resolution — reading those (the old behaviour) understated
// the real values (e.g. a true 12% showed as 10%). We now read the vertical digits for an
// exact max, and keep the '#' body markers for the (coarse) average.
function parseAsciiChart(lines: string[]): CpuPoint[] {
  // Body rows: right-justified y-axis label (multiple of 10) followed by the plot area.
  const bodyRe = /^(\s*\d{1,3})\s([ *#]*)$/
  const body: { y: number; plot: string }[] = []
  let firstBodyIdx = -1
  let plotStart = 6
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(bodyRe)
    if (!m) continue
    const y = parseInt(m[1].trim())
    if (y < 0 || y > 100 || y % 10 !== 0) continue
    if (firstBodyIdx < 0) { firstBodyIdx = i; plotStart = m[1].length + 1 }
    body.push({ y, plot: m[2] ?? '' })
  }
  if (!body.length) return []

  // Digit rows: the 1–3 numeric lines above the first body row ("100").
  // RTF-stripped captures can interleave noise lines (lone backslashes / blanks) between
  // every chart row — skip those instead of stopping, or the exact-max digits are lost.
  const digitRe = /^\s*\d[\d ]*$/
  const noiseRe = /^\s*\\*\s*$/            // blank line or stray RTF backslashes
  const digitRows: string[] = []
  for (let i = firstBodyIdx - 1; i >= 0 && (firstBodyIdx - i) <= 12 && digitRows.length < 3; i--) {
    const l = lines[i]
    if (noiseRe.test(l)) continue
    if (!digitRe.test(l)) break            // a real non-digit line = top of this chart
    digitRows.unshift(l)
  }

  const width = Math.max(
    ...body.map(b => b.plot.length),
    ...digitRows.map(r => Math.max(0, r.length - plotStart)),
    1,
  )

  return Array.from({ length: width }, (_, col) => {
    // Exact max from the stacked vertical digits at this column.
    let digits = ''
    for (const row of digitRows) {
      const ch = row[plotStart + col]
      if (ch && ch !== ' ') digits += ch
    }
    const parsed = digits ? parseInt(digits) : NaN
    const maxFromDigits = parsed >= 0 && parsed <= 100 ? parsed : null

    // Coarse bars: '*'/'#' give a fallback max; '#' marks the average level.
    let maxBar = 0, avgBar = 0, hasHash = false
    for (const { y, plot } of body) {
      const ch = col < plot.length ? plot[col] : ' '
      if ((ch === '*' || ch === '#') && y > maxBar) maxBar = y
      if (ch === '#') { hasHash = true; if (y > avgBar) avgBar = y }
    }
    const max = maxFromDigits ?? maxBar
    // Average: use the '#' level when the chart plots it. When a column has no '#', the
    // switch was near-idle and the average sits in the same low bucket as the max (Cisco
    // draws '*' over it), so the average ≈ max — far more faithful than a flat zero.
    const avg = hasHash ? Math.min(avgBar, max) : max
    return { max, avg }
  })
}

function parseCpuHistory(text: string) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /show process(?:es)? cpu history/i.test(l))
  if (start < 0) return { cpuSec: [], cpuMin: [], cpuHour: [], cpuHistoryRaw: '' }
  let end = lines.length
  for (let i = start + 5; i < lines.length; i++) {
    if (/---+\s*show\s+/i.test(lines[i])) { end = i; break }
  }
  const sec = lines.slice(start, end)
  const iSec  = sec.findIndex((l) => /last 60 seconds/i.test(l))
  const iMin  = sec.findIndex((l) => /last 60 minutes/i.test(l))
  const iHour = sec.findIndex((l) => /last 72 hours/i.test(l))
  // Take the FULL region between the previous label and this chart's label. A fixed
  // line-count window (e.g. lbl-30) breaks when RTF stripping doubles the line count and
  // pushes the exact-max digit rows out of range.
  const block = (lbl: number, from: number) => {
    if (lbl < 0) return []
    return sec.slice(from + 1, lbl + 1)
  }
  // Capture raw ASCII block for the 72h section (for Word export)
  const hourRawLines = iHour >= 0
    ? sec.slice(Math.max(0, iHour - 30), Math.min(sec.length, iHour + 5))
    : []
  const cpuHistoryRaw = hourRawLines.join('\n')
  return {
    cpuSec:  parseAsciiChart(block(iSec, 0)),
    cpuMin:  parseAsciiChart(block(iMin, iSec)),
    cpuHour: parseAsciiChart(block(iHour, iMin)),
    cpuHistoryRaw,
  }
}


// ─── Network Intelligence — Log Parser ───────────────────────────────────
const _MONTH_IDX: Record<string, number> = {
  Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
  Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
}
function _parseTimestampMs(ts: string): number {
  const m = ts.replace(/^\*/, '').trim()
    .match(/^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/)
  if (!m) return 0
  const [, mon, day, hh, mm, ss, ms] = m
  const month = _MONTH_IDX[mon] ?? 0
  const year  = new Date().getFullYear()
  // Pad ms to 3 digits (Cisco may emit 1–6 digits after the dot)
  const msNum = ms ? parseInt(ms.slice(0, 3).padEnd(3, '0')) : 0
  return new Date(year, month, +day, +hh, +mm, +ss, msNum).getTime()
}

// Cisco syslog — supported formats:
//
//   Format A (standard %FAC-SEV-MNEM):
//     "*Jul 29 13:51:00.133 bra: %CDP-4-NATIVE_VLAN_MISMATCH: msg"   <- lowercase TZ
//     "Dec 22 13:28:22.047 BRA: %PHY-5-TRANSCEIVERREMOVED: msg"       <- uppercase TZ
//     "*Mar  3 12:40:21.154: %FACILITY-3-MNEMONIC: msg"               <- no TZ
//
//   Format B (vendor-specific CATEGORY (LEVEL)):
//     "Dec  7 12:25:20.341 BRA: NTP Core (INFO): 172.16.4.1 ..."
//
// The optional group (?:\s+[a-zA-Z]{2,5})? captures tz in both cases (bra, BRA, utc, UTC).
// Optional leading "NNNNNN: " is a log-buffer sequence number (service sequence-numbers /
// IOS log buffer dumps). Without allowing it, sequence-numbered buffers matched ZERO lines.
const _LOG_RE = /^(?:\d+:\s+)?[*]?(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s+[a-zA-Z]{2,5})?: %([A-Z0-9_]+)-(\d)-([A-Z0-9_]+): (.+)$/gm

// Format B: "CATEGORY (LEVEL): message" — used by some IOS platforms (e.g. NTP Core events).
// Only matched on lines NOT already captured by _LOG_RE (deduplication in parseLogEntries).
const _LOG_RE2 = /^(?:\d+:\s+)?[*]?(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+[a-zA-Z]{2,5}:\s+([A-Za-z][A-Za-z0-9 _\/-]+?)\s*\(([A-Z]+)\):\s*(.+)$/gm

// Map text severity level to Cisco numeric severity (0=Emergency ... 7=Debug)
const _LEVEL_SEV: Record<string, number> = {
  EMERGENCY:0, ALERT:1, CRITICAL:2, ERROR:3,
  WARNING:4,   NOTICE:5, INFO:6,    DEBUG:7,
  WARN:4,      CRIT:2,   ERR:3,
}

// Terminal captures hard-wrap long log lines by inserting a run of padding spaces at the
// wrap column (all on one physical line), which truncates the message tail. Cisco syslog
// text never contains runs of 2+ spaces, so collapsing them rejoins the wrapped fragment
// (e.g. "GigabitEthernet1" + spaces + "/8, changed ..." → "GigabitEthernet1/8, changed ...").
function _unwrapMsg(msg: string): string {
  return msg.replace(/ {2,}/g, '').trim()
}

function parseLogEntries(text: string, hostname: string, color: string): LogEntry[] {
  const results: LogEntry[] = []
  // Match both "show logging" (full) and "show log" (IOS XE abbreviation).
  // Use match() to capture the full header length so we can skip past it before
  // searching for the next section — avoids the negative-lookahead edge-case where
  // "show log" (3 chars) is mistaken for the start of "show logging".
  const headerM = text.match(/---+\s*show log(?:ging)?\s*---+/i)
  if (!headerM || headerM.index === undefined) return results
  const afterHeader = headerM.index + headerM[0].length
  const tail    = text.slice(afterHeader)
  const nextSec = tail.search(/---+\s*show\s+/i)
  const section = tail.slice(0, nextSec >= 0 ? nextSec : undefined)

  // ── Pass 1: standard Cisco %FAC-SEV-MNEM format ───────────────────────
  const matchedPositions = new Set<number>()
  _LOG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = _LOG_RE.exec(section)) !== null) {
    matchedPositions.add(m.index)
    results.push({
      raw: m[0], timestamp: m[1].trim(),
      timestampMs: _parseTimestampMs(m[1]),
      facility: m[2], severity: parseInt(m[3]),
      mnemonic: m[4], message: _unwrapMsg(m[5]),
      sourceHostname: hostname, sourceColor: color,
    })
  }

  // ── Pass 2: vendor-specific "CATEGORY (LEVEL): msg" format ───────────
  // Handles lines like: "Dec  7 12:25:20.341 BRA: NTP Core (INFO): 172.16.4.1 ..."
  // Only processes lines that were NOT already matched in Pass 1.
  _LOG_RE2.lastIndex = 0
  let m2: RegExpExecArray | null
  while ((m2 = _LOG_RE2.exec(section)) !== null) {
    if (matchedPositions.has(m2.index)) continue
    const level = m2[3].toUpperCase()
    const sev   = _LEVEL_SEV[level] ?? 6
    results.push({
      raw: m2[0], timestamp: m2[1].trim(),
      timestampMs: _parseTimestampMs(m2[1]),
      facility: m2[2].trim(), severity: sev,
      mnemonic: level, message: _unwrapMsg(m2[4]),
      sourceHostname: hostname, sourceColor: color,
    })
  }

  return results
}

const _SW_COLORS = [
  '#22d3ee','#f59e0b','#10b981','#8b5cf6',
  '#f43f5e','#06b6d4','#84cc16','#fb923c',
  '#a78bfa','#34d399','#fbbf24','#60a5fa',
]

function buildNetIntel(switches: (SwitchData & { _logEntries?: LogEntry[] })[]): NetIntel {
  const allLogs: LogEntry[] = []
  switches.forEach(sw => {
    ;(sw._logEntries ?? []).forEach(e => allLogs.push(e))
  })
  allLogs.sort((a, b) => a.timestampMs - b.timestampMs)

  const criticalLogs = allLogs.filter(e => e.severity <= 3)

  // App 3 — Flapping
  const flapMap = new Map<string, LogEntry[]>()
  for (const e of allLogs) {
    const isFlap =
      (e.facility === 'LINK'      && e.mnemonic === 'UPDOWN') ||
      (e.facility === 'LINEPROTO' && e.mnemonic === 'UPDOWN')
    if (!isFlap) continue
    const iface = logIface(e.message)
    if (!iface) continue
    const key = `${e.sourceHostname}::${iface}`
    const arr = flapMap.get(key) ?? []
    arr.push(e)
    flapMap.set(key, arr)
  }
  const flapEvents: FlapEvent[] = []
  flapMap.forEach((entries, key) => {
    if (entries.length <= 3) return
    const span = entries[entries.length-1].timestampMs - entries[0].timestampMs
    if (span > 3_600_000) return
    const [hostname, iface] = key.split('::')
    flapEvents.push({ iface, hostname, count: entries.length, entries })
  })

  // App 4 — Multiple root bridges
  const rootMap = new Map<string, Set<string>>()
  for (const e of allLogs) {
    if (!/This bridge is the root/i.test(e.message)) continue
    const instM = e.message.match(/(?:VLAN|MST|instance)\s*(\S+)/i)
    const instance = instM ? instM[1] : 'default'
    const s = rootMap.get(instance) ?? new Set<string>()
    s.add(e.sourceHostname)
    rootMap.set(instance, s)
  }
  const multipleRoots: { instance: string; switches: string[] }[] = []
  rootMap.forEach((hosts, instance) => {
    if (hosts.size > 1) multipleRoots.push({ instance, switches: Array.from(hosts) })
  })

  // App 5 — Security
  const securityEvents: SecurityEvent[] = []
  for (const e of allLogs) {
    if (e.facility === 'SEC_LOGIN' && e.mnemonic === 'LOGIN_FAILED')
      securityEvents.push({ type: 'login_failed', entry: e })
    else if (e.facility === 'SYS' && e.mnemonic === 'CONFIG_I')
      securityEvents.push({ type: 'config_change', entry: e })
  }

  return { logs: allLogs, criticalLogs, flapEvents, multipleRoots, securityEvents }
}

// ─── Vendor Detection ─────────────────────────────────────────────────────
function detectVendor(text: string): 'cisco' | 'modicon' {
  return /MCSESM Release|Schneider Electric/i.test(text) ? 'modicon' : 'cisco'
}

// ─── Cisco parser (original logic, moved here verbatim) ───────────────────
function parseCisco(raw: string, filename: string): SwitchData {
  const text = stripRtf(raw)
  const { firmware, uptime, reloadReason, restartedAt, modelNumber } = parseVersion(text)
  const { gateway, vlans }   = parseNetwork(text)
  const { cpuSec, cpuMin, cpuHour, cpuHistoryRaw } = parseCpuHistory(text)
  const {
    stpMode, ptpMode, vtpMode, udld,
    snmpRo, snmpRw, snmpEnabled, snmpCommunityRo, snmpCommunityRw,
    vtyBlocks, ntpServers, usernames,
  } = parseRunningConfig(text)
  const hostname = parseHostname(text, filename)
  const result: SwitchData & { _logEntries?: LogEntry[] } = {
    filename, firmware, uptime, reloadReason, restartedAt, modelNumber,
    gateway, vlans, cpuSec, cpuMin, cpuHour, cpuHistoryRaw,
    stpMode, ptpMode, vtpMode, udld,
    snmpRo, snmpRw, snmpEnabled, snmpCommunityRo, snmpCommunityRw,
    vtyBlocks, ntpServers, usernames,
    hostname,
    tempAlert: (() => {
      const _env = parseEnv(text)
      if (modelNumber !== 'N/A' && _env && _env.temperature !== 'N/A')
        return validateTemperature(modelNumber, _env.temperature)
      return null
    })(),
    clockTime:         parseClock(text),
    cpuNow:            parseCpuNow(text),
    processes:         parseProcesses(text),
    memory:            parseMemory(text),
    env:               parseEnv(text),
    stpTopo:           parseStpDetail(text),
    stpVlans:          parseStpVlans(text),
    sfpInventory:      parseInventory(text),
    totalMacAddresses: parseMacAddresses(text),
    macPerVlan:        parseMacPerVlan(text),
    catalystEnv:       parseCatalystEnv(text),
    interfaceStatus:   parseInterfaceStatus(text),
    transceivers:      parseTransceivers(text),
    ...(() => { const d = parseDlr(text); return { dlrConfig: d.config, dlrInterfaces: d.interfaces } })(),
    dlrStatus:         parseDlrRing(text),
  }
  result._logEntries = parseLogEntries(text, hostname, '')

  // Extract raw show running-config text for Excel export (richest section — skips
  // any empty stub present in show tech-support dumps).
  ;(result as any)._rawRunningConfig = sectionBody(text, /---+\s*show running-config\s*---+/i).trim()

  return result
}

// ─── Modicon / Hirschmann HiOS parser ────────────────────────────────────
// Source: "show running-config script all" from MCSESM (Schneider Electric).
// No real-time telemetry available — performance fields are null / [].
function parseModicon(raw: string, filename: string): SwitchData {
  const text = stripRtf(raw)

  // ── Hostname ──────────────────────────────────────────────────────────────
  // Header: "System Name   :  <name>"   OR config: "system name <name>"
  const hostnameM =
    text.match(/System Name\s*:\s*(.+)/i) ??
    text.match(/^system name\s+(.+)/im)
  const hostname = hostnameM ? hostnameM[1].trim() : parseHostname(text, filename)

  // ── Firmware ──────────────────────────────────────────────────────────────
  // Header: "MCSESM Release 10.3.04"   OR comment: "! Version: 10.3.04"
  const firmwareM =
    text.match(/MCSESM Release\s+([\d.]+)/i) ??
    text.match(/!\s*Version:\s+(.+)/i)
  const firmware = firmwareM ? firmwareM[1].trim() : 'N/A'

  // ── Clock / Date ──────────────────────────────────────────────────────────
  // Header: "System Time   :  2025-12-05 23:46:19"
  const clockM = text.match(/System Time\s*:\s*(.+)/i)
  const clockTime = clockM ? clockM[1].trim() : 'N/A'

  // ── Gateway ───────────────────────────────────────────────────────────────
  // "network parms <ip> <mask> <gateway>"  — third token is the gateway
  const netParmsM = text.match(/^network parms\s+\S+\s+\S+\s+(\S+)/im)
  const gateway = netParmsM ? netParmsM[1].trim() : 'N/A'

  // ── VLANs ─────────────────────────────────────────────────────────────────
  // IDs:   "vlan add <id>"
  // Names: "name <id> <name>"
  const vlanIds = new Set<number>([1])   // VLAN 1 always exists
  const vlanNameMap: Record<number, string> = {}
  for (const m of text.matchAll(/^vlan add\s+(\d+)/gim))
    vlanIds.add(parseInt(m[1]))
  for (const m of text.matchAll(/^name\s+(\d+)\s+(.+)/gim)) {
    const id = parseInt(m[1]); vlanIds.add(id); vlanNameMap[id] = m[2].trim()
  }
  // MCSESM config dumps expose VLAN id + name, but no per-VLAN IP/mask. Map into the
  // shared VlanEntry shape: keep the name alongside the id in the VLAN column, and mark
  // IP/mask as N/A (the device's management IP is reported separately via the gateway).
  const vlans: VlanEntry[] = [...vlanIds].sort((a, b) => a - b).map(id => {
    const name = vlanNameMap[id] ?? (id === 1 ? 'default' : `VLAN${id}`)
    return { vlan: `${id} — ${name}`, ip: 'N/A', mask: 'N/A' }
  })

  // ── STP Mode ──────────────────────────────────────────────────────────────
  // "spanning-tree forceversion rstp"
  const stpM = text.match(/^spanning-tree forceversion\s+(\S+)/im)
  const stpMode = stpM ? stpM[1].trim() : 'N/A'

  // ── PTP Mode ──────────────────────────────────────────────────────────────
  // "ptp clock-mode v2-transparent-clock"
  const ptpM = text.match(/^ptp clock-mode\s+(\S+)/im)
  const ptpMode = ptpM ? ptpM[1].trim() : 'N/A'

  // ── NTP / SNTP Servers ────────────────────────────────────────────────────
  // "sntp client server add 1 172.16.6.1 port 123 description ..."
  const ntpServers: NtpEntry[] = []
  for (const m of text.matchAll(/^sntp client server add\s+\d+\s+(\d+\.\d+\.\d+\.\d+)/gim))
    ntpServers.push({ address: m[1].trim(), preferred: false })

  // ── Usernames ─────────────────────────────────────────────────────────────
  // 'users add "admin"'
  const usernames: string[] = []
  for (const m of text.matchAll(/^users add\s+"([^"]+)"/gim))
    if (!usernames.includes(m[1])) usernames.push(m[1].trim())

  // ── SNMP ──────────────────────────────────────────────────────────────────
  const snmpEnabled =
    /snmp trap operation/i.test(text) ||
    /network management access modify \d+ snmp enable/i.test(text)
  const roM = text.match(/^snmp community ro\s+"([^"]+)"/im)
  const rwM = text.match(/^snmp community rw\s+"([^"]+)"/im)
  const snmpRo = !!roM
  const snmpRw = !!rwM
  const snmpCommunityRo = roM ? roM[1].trim() : 'N/A'
  const snmpCommunityRw = rwM ? rwM[1].trim() : 'N/A'

  // ── SSH / Telnet → vtyBlocks ──────────────────────────────────────────────
  // "ssh server" = enabled; "no ssh server" = disabled (same for telnet).
  // Also honour "network management access modify 1 ssh/telnet enable".
  const sshEnabled =
    (/^ssh server$/im.test(text) && !/^no ssh server$/im.test(text)) ||
    /network management access modify \d+ ssh enable/i.test(text)
  const telnetEnabled =
    (/^telnet server$/im.test(text) && !/^no telnet server$/im.test(text)) ||
    /network management access modify \d+ telnet enable/i.test(text)
  const vtyBlocks: VtyBlock[] = []
  if (sshEnabled)
    vtyBlocks.push({ range: 'SSH', login: 'local', transportInput: 'ssh', transportOutput: 'ssh', isCon: false })
  if (telnetEnabled)
    vtyBlocks.push({ range: 'Telnet', login: 'local', transportInput: 'telnet', transportOutput: 'telnet', isCon: false })
  if (!sshEnabled && !telnetEnabled)
    vtyBlocks.push({ range: 'Sem acesso remoto', login: 'N/A', transportInput: 'none', transportOutput: 'none', isCon: false })

  // ── Fallback-safe result (all telemetry fields set to null / []) ──────────
  const result: SwitchData & { _logEntries?: LogEntry[] } = {
    filename,
    hostname,
    firmware,
    clockTime,
    gateway,
    vlans,
    stpMode,
    ptpMode,
    vtpMode:           'N/A',    // VTP is Cisco-only
    udld:              'disabled',
    snmpRo, snmpRw, snmpEnabled, snmpCommunityRo, snmpCommunityRw,
    vtyBlocks,
    ntpServers,
    usernames,
    // Fields with no equivalent in a config dump
    modelNumber:       'MCSESM',
    uptime:            'N/A',
    reloadReason:      'N/A',
    restartedAt:       'N/A',
    cpuHistoryRaw:     '',
    tempAlert:         null,
    cpuNow:            null,
    memory:            null,
    env:               null,
    catalystEnv:       null,
    interfaceStatus:   [],
    transceivers:      [],
    dlrConfig:         [],
    dlrInterfaces:     [],
    dlrStatus:         [],
    processes:         [],
    stpTopo:           [],
    stpVlans:          [],
    sfpInventory:      [],
    macPerVlan:        [],
    totalMacAddresses: null,
    cpuSec:            [],
    cpuMin:            [],
    cpuHour:           [],
  }
  result._logEntries = []   // no syslog in a config dump
  return result
}

// ─── Factory / entry point ────────────────────────────────────────────────
function parseShowtech(raw: string, filename: string): SwitchData {
  const text = stripRtf(raw)
  return detectVendor(text) === 'modicon'
    ? parseModicon(raw, filename)
    : parseCisco(raw, filename)
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function fmtBytes(n: number): string {
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB'
  if (n >= 1048576)    return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024)       return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

function fmtPct(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}

// Abbreviate Cisco uptime strings for compact display in analytics table
// "15 weeks, 3 days, 16 hours, 16 minutes" → "15w 3d 16h"
function abbrevUptime(uptime: string): string {
  if (!uptime || uptime === 'N/A') return 'N/A'
  const w = uptime.match(/(\d+)\s*week/i)
  const d = uptime.match(/(\d+)\s*day/i)
  const h = uptime.match(/(\d+)\s*hour/i)
  const m = uptime.match(/(\d+)\s*minute/i)
  const parts: string[] = []
  if (w) parts.push(`${w[1]}w`)
  if (d) parts.push(`${d[1]}d`)
  if (h && !w) parts.push(`${h[1]}h`)   // only show hours when no weeks
  if (m && !w && !d) parts.push(`${m[1]}m`) // only show minutes when very short
  return parts.length > 0 ? parts.join(' ') : uptime.slice(0, 12)
}

function envStatus(val: string): { label: string; color: string } {
  const v = val.toLowerCase()
  if (v.includes('ok'))       return { label: 'OK',     color: C.green }
  if (v.includes('disabled')) return { label: 'N/A',    color: C.textD }
  if (v.includes('alarm'))    return { label: 'ALARME', color: C.red   }
  return                             { label: 'INFO',   color: C.cyan  }
}

// ─── Badge ────────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', fontSize: 9, fontFamily: C.mono,
      fontWeight: 700, textTransform: 'uppercase' as const,
      letterSpacing: '0.12em', borderRadius: 4,
      background: `${color}18`, border: `1px solid ${color}50`, color,
    }}>
      {label}
    </span>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────
function Panel({ icon, label, color, accent, right, children }: {
  icon: string; label: string; color?: string; accent?: string
  right?: React.ReactNode; children: React.ReactNode
}) {
  const clr = color ?? C.cyan
  const bg  = accent ?? 'rgba(34,211,238,0.04)'
  return (
    // NOTE: no overflow:hidden here — allows chart horizontal scroll and card grid to render fully
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      {/* Header clips itself to rounded top corners */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 16px', background: bg,
        borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${clr}`,
        borderRadius: '8px 8px 0 0', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>
          <span style={{
            fontSize: 9, fontFamily: C.mono, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.18em', color: clr,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {label}
          </span>
        </div>
        {right && <div style={{ flexShrink: 0, marginLeft: 12 }}>{right}</div>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

// ─── CPU Line+Area Chart ──────────────────────────────────────────────────
function CpuChart({ points, timeUnit }: { points: CpuPoint[]; timeUnit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!points.length)
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 120, fontSize: 10, fontFamily: C.mono, color: C.textG,
        border: `1px dashed ${C.border}`, borderRadius: 6,
      }}>
        Dados não encontrados no arquivo
      </div>
    )

  const CH = 140, PL = 38, PB = 22, PT = 12, PR = 16
  // Distribute points across full width (min 640, expands with density)
  const innerW = Math.max(points.length * 9, 640)
  const svgW   = PL + innerW + PR
  const svgH   = CH + PT + PB

  const xOf = (i: number) => PL + (i / Math.max(points.length - 1, 1)) * innerW
  const yOf = (v: number) => PT + CH - (v / 100) * CH

  // SVG path helpers
  const linePath = (pts: number[]) =>
    pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')

  const areaPath = (pts: number[]) =>
    linePath(pts) +
    ` L${xOf(pts.length - 1).toFixed(1)},${(PT + CH).toFixed(1)}` +
    ` L${PL},${(PT + CH).toFixed(1)} Z`

  const maxVals = points.map((p) => p.max)
  const avgVals = points.map((p) => p.avg)

  // Summary stats
  const maxPeak   = Math.max(...maxVals)
  const avgOfAvgs = maxVals.length ? Math.round(maxVals.reduce((s, v) => s + v, 0) / maxVals.length) : 0
  const critCount = maxVals.filter((v) => v > 50).length
  const peakIdx   = maxVals.indexOf(maxPeak)

  // Tick every ~8 data points
  const tickEvery = Math.max(1, Math.round(points.length / 8))

  return (
    <div style={{ width: '100%' }}>
      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        {[
          { label: 'Pico máximo',    value: `${maxPeak}%`,      color: maxPeak > 50 ? C.red : C.orange },
          { label: 'Média geral',    value: `${avgOfAvgs}%`,    color: C.cyan   },
          { label: 'Períodos > 50%', value: String(critCount),  color: critCount > 0 ? C.red : C.green },
          { label: 'Amostras',       value: String(points.length) + ' ' + timeUnit, color: C.textD },
        ].map((s) => (
          <div key={s.label} style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            padding: '6px 12px', background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 6,
          }}>
            <span style={{ fontSize: 7, color: C.textG, textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: C.mono }}>
              {s.label}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: C.mono }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* SVG chart */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <svg width={svgW} height={svgH} style={{ display: 'block', minWidth: svgW }}
          onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="gradMax" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.orange} stopOpacity="0.35" />
              <stop offset="100%" stopColor={C.orange} stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id="gradAvg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.cyan} stopOpacity="0.25" />
              <stop offset="100%" stopColor={C.cyan} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines + Y labels */}
          {[0, 25, 50, 75, 100].map((y) => {
            const yp = yOf(y)
            return (
              <g key={y}>
                <line x1={PL} y1={yp} x2={PL + innerW} y2={yp}
                  stroke={y === 0 ? C.borderB : C.raised}
                  strokeWidth={y === 0 ? 1 : 0.5}
                  strokeDasharray={y > 0 && y < 100 ? '4 4' : undefined} />
                <text x={PL - 6} y={yp + 4} textAnchor="end"
                  fontSize={8} fontFamily="monospace" fill={C.textG}>{y}</text>
              </g>
            )
          })}

          {/* Critical threshold line at 50% */}
          <line x1={PL} y1={yOf(50)} x2={PL + innerW} y2={yOf(50)}
            stroke={`${C.red}60`} strokeWidth={1} strokeDasharray="5 3" />
          <text x={PL + innerW + 3} y={yOf(50) + 4}
            fontSize={7} fontFamily="monospace" fill={`${C.red}80`}>50%</text>

          {/* Area fill — max */}
          <path d={areaPath(maxVals)} fill="url(#gradMax)" />

          {/* Area fill — avg */}
          <path d={areaPath(avgVals)} fill="url(#gradAvg)" />

          {/* Line — max */}
          <path d={linePath(maxVals)} fill="none"
            stroke={C.orange} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />

          {/* Line — avg */}
          <path d={linePath(avgVals)} fill="none"
            stroke={C.cyan} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray="6 2" />

          {/* Critical dots (max > 50), excluding the peak which gets its own marker */}
          {points.map((p, i) => p.max > 50 && i !== peakIdx ? (
            <circle key={i} cx={xOf(i)} cy={yOf(p.max)} r={2.5}
              fill={C.red} stroke={C.bg} strokeWidth={1} />
          ) : null)}

          {/* Peak marker — always highlight the maximum + its position */}
          <circle cx={xOf(peakIdx)} cy={yOf(maxPeak)} r={4}
            fill={maxPeak > 50 ? C.red : C.orange} stroke={C.bg} strokeWidth={1.5} />
          <text x={xOf(peakIdx)} y={yOf(maxPeak) - 8} textAnchor="middle"
            fontSize={9} fontWeight={700} fontFamily="monospace"
            fill={maxPeak > 50 ? C.red : C.orange}>{`▲ ${maxPeak}% (#${peakIdx})`}</text>

          {/* X-axis ticks */}
          {points.map((_, i) => i % tickEvery === 0 ? (
            <text key={i} x={xOf(i)} y={svgH - 5}
              textAnchor="middle" fontSize={7} fontFamily="monospace" fill={C.textG}>
              {i}
            </text>
          ) : null)}

          {/* Hover guide + point markers */}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={xOf(hover)} y1={PT} x2={xOf(hover)} y2={PT + CH}
                stroke={C.borderB} strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={xOf(hover)} cy={yOf(points[hover].max)} r={3.5}
                fill={C.orange} stroke={C.bg} strokeWidth={1.5} />
              <circle cx={xOf(hover)} cy={yOf(points[hover].avg)} r={3}
                fill={C.cyan} stroke={C.bg} strokeWidth={1.5} />
            </g>
          )}

          {/* Transparent hover-capture columns (on top to receive the mouse) */}
          {points.map((_, i) => {
            const w = innerW / Math.max(points.length - 1, 1)
            return (
              <rect key={i} x={xOf(i) - w / 2} y={PT} width={Math.max(w, 3)} height={CH}
                fill="transparent" onMouseEnter={() => setHover(i)} />
            )
          })}

          {/* Tooltip */}
          {hover !== null && (() => {
            const p = points[hover]
            const tw = 132, th = 48
            let tx = xOf(hover) + 12
            if (tx + tw > PL + innerW) tx = xOf(hover) - tw - 12
            const ty = Math.max(PT + 2, yOf(p.max) - th - 6)
            return (
              <g pointerEvents="none">
                <rect x={tx} y={ty} width={tw} height={th} rx={4}
                  fill={C.panel} stroke={C.borderB} strokeWidth={1} opacity={0.98} />
                <text x={tx + 8} y={ty + 15} fontSize={9} fontFamily="monospace" fontWeight={700} fill={C.text}>
                  {`Amostra #${hover} de ${points.length}`}
                </text>
                <text x={tx + 8} y={ty + 29} fontSize={9} fontFamily="monospace" fill={C.orange}>
                  {`Máx: ${p.max}%`}
                </text>
                <text x={tx + 8} y={ty + 42} fontSize={9} fontFamily="monospace" fill={C.cyan}>
                  {`Méd: ${p.avg}%`}
                </text>
              </g>
            )
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 10 }}>
        {[
          { color: C.orange, label: 'Máx CPU%',    dash: false },
          { color: C.cyan,   label: 'Méd CPU%',    dash: true  },
          { color: C.red,    label: '> 50% crítico', dash: false },
        ].map((x) => (
          <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width={20} height={8}>
              <line x1={0} y1={4} x2={20} y2={4}
                stroke={x.color} strokeWidth={2}
                strokeDasharray={x.dash ? '5 2' : undefined} />
            </svg>
            <span style={{ fontSize: 9, fontFamily: C.mono, color: C.textD }}>{x.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// LOG KNOWLEDGE MODAL — click on critical/error log to get Cisco guidance
// ═══════════════════════════════════════════════════════════════════════════
function LogModal({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const key1 = `${entry.facility}-${entry.mnemonic}`
  const kb = CISCO_KB[key1]
    ?? Object.entries(CISCO_KB).find(([k]) => key1.startsWith(k) || k.startsWith(entry.facility + '-'))?.[1]
    ?? null
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.72)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.panel, border: `1px solid ${C.borderB}`,
        borderRadius: 12, maxWidth: 680, width: '100%', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{entry.severity <= 2 ? '🚨' : '⚠️'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 4px',
              color: entry.severity <= 2 ? C.red : '#f43f5e', fontFamily: C.mono }}>
              %{entry.facility}-{entry.severity}-{entry.mnemonic}
            </p>
            <p style={{ fontSize: 10, margin: 0, color: C.textD, fontFamily: C.mono }}>
              {entry.sourceHostname} · {entry.timestamp}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 18, color: C.textG, padding: '0 4px', flexShrink: 0,
          }}>✕</button>
        </div>
        <div style={{ padding: '12px 20px',
          background: `${entry.severity <= 2 ? C.red : '#f43f5e'}08`,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <p style={{ fontSize: 10, margin: 0, color: C.text, fontFamily: C.mono, lineHeight: 1.5 }}>
            {entry.message}
          </p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 16 }}>
          {kb ? (
            <>
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, margin: '0 0 6px', color: C.cyan,
                  textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: C.mono }}>
                  📖 O que é
                </p>
                <p style={{ fontSize: 11, margin: 0, color: C.text, lineHeight: 1.65 }}>{kb.what}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, margin: '0 0 8px', color: C.green,
                  textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: C.mono }}>
                  🔧 Ações de Resolução
                </p>
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {kb.actions.map((a, i) => (
                    <li key={i} style={{ fontSize: 11, color: C.text, lineHeight: 1.6 }}>{a}</li>
                  ))}
                </ol>
              </div>
              {kb.refs && (
                <div style={{ padding: '8px 12px', background: C.surface,
                  borderRadius: 6, border: `1px solid ${C.border}` }}>
                  <p style={{ fontSize: 9, margin: 0, color: C.textD, fontFamily: C.mono }}>
                    📚 {kb.refs}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, margin: '0 0 6px', color: C.orange,
                textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: C.mono }}>
                ⚠ Evento não mapeado — Recomendações Gerais Cisco
              </p>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  'Verifique a integridade física: cabos, conectores, slots e transceptores do switch.',
                  'Execute "show log" completo e identifique padrões de recorrência deste evento.',
                  'Pesquise o mnemônico no Cisco Bug Toolkit: tools.cisco.com/bugsearch',
                  'Consulte o Guia de Mensagens do Sistema para a sua versão IOS/IOS-XE.',
                  'Se recorrente ou com impacto operacional, abra chamado TAC Cisco com "show tech-support".',
                ].map((a, i) => (
                  <li key={i} style={{ fontSize: 11, color: C.text, lineHeight: 1.6 }}>{a}</li>
                ))}
              </ol>
              <div style={{ marginTop: 12, padding: '8px 12px', background: C.surface,
                borderRadius: 6, border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 9, margin: 0, color: C.textD, fontFamily: C.mono }}>
                  📚 Cisco IOS System Messages Guide — tools.cisco.com/support/sysmsg
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Health Score Card ─────────────────────────────────────────────────────
function HealthScoreCard({ sw, swLogs }: { sw: SwitchData; swLogs: LogEntry[] }) {
  const h = computeHealthScore(sw, swLogs)
  const ringR = 38, circumf = 2 * Math.PI * ringR
  const dash = (h.score / 100) * circumf
  return (
    <Panel icon="🏥" label="Saúde do Switch — Health Score"
      color={h.color} accent={`${h.color}08`}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <svg width={100} height={100} viewBox="0 0 100 100">
            <circle cx={50} cy={50} r={ringR} fill="none" stroke={C.raised} strokeWidth={10} />
            <circle cx={50} cy={50} r={ringR} fill="none"
              stroke={h.color} strokeWidth={10}
              strokeDasharray={`${dash} ${circumf}`}
              strokeDashoffset={circumf * 0.25}
              strokeLinecap="round" />
            <text x={50} y={46} textAnchor="middle" dominantBaseline="middle"
              fontSize={22} fontWeight={700} fill={h.color} fontFamily="monospace">
              {h.score}
            </text>
            <text x={50} y={64} textAnchor="middle" fontSize={8} fill={C.textG} fontFamily="monospace">/100</text>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: h.color, fontFamily: C.mono }}>{h.status}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 200 }}>
          {h.factors.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px', borderRadius: 6,
              background: f.ok ? `${C.green}0A` : `${C.red}0D`,
              border: `1px solid ${f.ok ? C.green : C.red}30`,
            }}>
              <span style={{ fontSize: 11, flexShrink: 0 }}>{f.ok ? '✅' : '❌'}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.textD, fontFamily: C.mono,
                flex: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{f.label}</span>
              <span style={{ fontSize: 9, fontFamily: C.mono,
                color: f.ok ? C.green : C.red }}>{f.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

// ─── Empty-state helper (shared by the global views) ──────────────────────
function EmptyGlobal({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40,
    }}>
      <span style={{ fontSize: 40 }}>{icon}</span>
      <p style={{ fontSize: 12, color: C.textG, fontFamily: C.mono, textAlign: 'center', maxWidth: 460 }}>{text}</p>
    </div>
  )
}

// Header cell + body cell used by the global tables (mirrors the Analytics table styling).
const GTh = ({ children }: { children: React.ReactNode }) => (
  <th style={{
    padding: '8px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.15em', color: C.textG,
    background: C.surface, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
    position: 'sticky', top: 0, zIndex: 2,
  }}>{children}</th>
)
const GTd = ({ children, warn = false, color, bold = false }: {
  children: React.ReactNode; warn?: boolean; color?: string; bold?: boolean
}) => (
  <td style={{
    padding: '7px 12px', whiteSpace: 'nowrap', fontFamily: C.mono, fontSize: 10,
    color: warn ? C.red : color ?? C.text, fontWeight: warn || bold ? 700 : 400,
    borderBottom: `1px solid ${C.border}`,
  }}>{children}</td>
)

// ─── SFP Global View ──────────────────────────────────────────────────────
function SfpGlobalView({ switches }: { switches: SwitchData[] }) {
  const swWithSfp = switches.filter(sw => sw.sfpInventory.length > 0)
  if (!switches.length)
    return <EmptyGlobal icon="🔌" text="Carregue arquivos RTF para visualizar o inventário de módulos SFP." />
  if (!swWithSfp.length)
    return <EmptyGlobal icon="🔌" text="Nenhum módulo SFP identificado nos arquivos carregados." />

  // Padronização de hardware — total + contagem por PID.
  const pidCount = new Map<string, number>()
  let total = 0
  swWithSfp.forEach(sw => sw.sfpInventory.forEach(s => {
    total++; const k = s.pid || '—'; pidCount.set(k, (pidCount.get(k) ?? 0) + 1)
  }))
  const pidRows = [...pidCount.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Panel icon="🔌" label="Inventário Global de Módulos SFP" color={C.cyan} accent="rgba(34,211,238,0.04)"
        right={<span style={{ fontSize: 9, fontFamily: C.mono, color: C.textG }}>{total} módulo(s) · {swWithSfp.length} switch(es)</span>}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 460, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><GTh>Switch</GTh><GTh>Porta (NAME)</GTh><GTh>Descrição (DESCR)</GTh><GTh>Modelo (PID)</GTh><GTh>S/N</GTh></tr></thead>
            <tbody>
              {swWithSfp.flatMap((sw, si) => sw.sfpInventory.map((s, i) => (
                <tr key={`${si}-${i}`} style={{ background: (si + i) % 2 === 0 ? 'transparent' : C.surface }}>
                  <GTd bold color={C.text}>{sw.hostname}</GTd>
                  <GTd color={C.cyan}>{s.port}</GTd>
                  <GTd color={C.textD}>{s.descr || '—'}</GTd>
                  <GTd color={C.textD}>{s.pid || '—'}</GTd>
                  <GTd color={C.textD}>{s.sn || '—'}</GTd>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel icon="📦" label="Resumo de Padronização — Modelos (PID)" color={C.purple} accent="rgba(139,92,246,0.04)"
        right={<span style={{ fontSize: 9, fontFamily: C.mono, color: C.textG }}>{pidCount.size} PID(s) distinto(s)</span>}>
        <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><GTh>Modelo (PID)</GTh><GTh>Quantidade</GTh></tr></thead>
            <tbody>
              {pidRows.map(([pid, c], i) => (
                <tr key={pid} style={{ background: i % 2 === 0 ? 'transparent' : C.surface }}>
                  <GTd color={C.textD}>{pid}</GTd>
                  <GTd bold color={C.cyan}>{c}</GTd>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

// ─── IPs por VLAN View ────────────────────────────────────────────────────
function IpVlanView({ switches }: { switches: SwitchData[] }) {
  if (!switches.length)
    return <EmptyGlobal icon="🌐" text="Carregue arquivos RTF para visualizar os endereços IP por VLAN." />

  const all = switches.flatMap(sw => sw.vlans.map(v => ({
    host: sw.hostname, vlan: v.vlan, ip: v.ip, mask: v.mask, gw: sw.gateway,
  })))
  if (!all.length)
    return <EmptyGlobal icon="🌐" text="Nenhum endereço IP por VLAN (SVI) identificado nos arquivos carregados." />

  const valid = (ip: string) => !!ip && ip.trim() !== '' && ip.trim() !== 'N/A' && ip.trim() !== '0.0.0.0' && ip.trim() !== '—'
  const ipCount = new Map<string, number>()
  all.forEach(r => { if (valid(r.ip)) ipCount.set(r.ip, (ipCount.get(r.ip) ?? 0) + 1) })
  const conflicts = [...ipCount.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1])

  // Agrupa por VLAN (ordenadas numericamente) — o usuário vê os IPs de cada VLAN juntos.
  const byVlan = new Map<string, typeof all>()
  all.forEach(r => { const a = byVlan.get(r.vlan) ?? []; a.push(r); byVlan.set(r.vlan, a) })
  const vlanKeys = [...byVlan.keys()].sort((a, b) =>
    ((parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)) || a.localeCompare(b))

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {conflicts.length > 0 && (
        <div style={{
          padding: '10px 16px', background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.red}55`,
          borderRadius: 8, fontSize: 10, fontFamily: C.mono, color: C.red,
        }}>
          ⚠ <strong>{conflicts.length} endereço(s) IP duplicado(s)</strong> entre switches: {conflicts.map(([ip, c]) => `${ip} (${c}×)`).join('  ·  ')}
        </div>
      )}
      <Panel icon="🌐" label="Endereços IP por VLAN (SVI)" color={C.blue} accent="rgba(59,130,246,0.04)"
        right={<span style={{ fontSize: 9, fontFamily: C.mono, color: C.textG }}>{vlanKeys.length} VLAN(s) · {all.length} interface(s) · {switches.length} switch(es)</span>}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 560, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><GTh>Switch</GTh><GTh>Endereço IP</GTh><GTh>Máscara</GTh><GTh>Gateway</GTh></tr></thead>
            <tbody>
              {vlanKeys.map(vk => {
                const members = byVlan.get(vk)!
                const grpDup = members.some(r => valid(r.ip) && (ipCount.get(r.ip) ?? 0) > 1)
                return (
                  <Fragment key={vk}>
                    {/* Sub-cabeçalho da VLAN */}
                    <tr>
                      <td colSpan={4} style={{
                        padding: '6px 12px', background: grpDup ? 'rgba(239,68,68,0.10)' : `${C.purple}14`,
                        borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
                        fontFamily: C.mono, fontSize: 10, fontWeight: 700,
                        color: grpDup ? C.red : C.purple, whiteSpace: 'nowrap',
                      }}>
                        🔖 VLAN {vk}
                        <span style={{ color: C.textG, fontWeight: 400 }}>  —  {members.length} host(s)</span>
                        {grpDup && <span style={{ color: C.red }}>  ⚠ IP duplicado</span>}
                      </td>
                    </tr>
                    {members.map((r, i) => {
                      const dup = valid(r.ip) && (ipCount.get(r.ip) ?? 0) > 1
                      return (
                        <tr key={`${vk}-${i}`} style={{ background: dup ? 'rgba(239,68,68,0.06)' : i % 2 === 0 ? 'transparent' : C.surface }}>
                          <GTd bold color={C.text}>{r.host}</GTd>
                          <GTd warn={dup} color={C.cyan}>{r.ip || '—'}{dup && ' ⚠'}</GTd>
                          <GTd color={C.textD}>{r.mask || '—'}</GTd>
                          <GTd color={C.textD}>{r.gw || '—'}</GTd>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

// ─── Transceiver DOM (global) View ────────────────────────────────────────
function TransceiverGlobalView({ switches }: { switches: SwitchData[] }) {
  const swWithTx = switches.filter(sw => sw.transceivers.length > 0)
  if (!switches.length)
    return <EmptyGlobal icon="🔬" text="Carregue arquivos RTF para visualizar o diagnóstico óptico (DOM)." />
  if (!swWithTx.length)
    return <EmptyGlobal icon="🔬" text="Nenhum dado de transceiver óptico (DOM) encontrado nos arquivos carregados." />

  const metrics: { key: keyof TransceiverEntry; label: string; unit: string }[] = [
    { key: 'temperature', label: 'Temperatura',     unit: '°C'  },
    { key: 'voltage',     label: 'Voltagem',        unit: 'V'   },
    { key: 'current',     label: 'Corrente (bias)', unit: 'mA'  },
    { key: 'txPower',     label: 'Potência Tx',     unit: 'dBm' },
    { key: 'rxPower',     label: 'Potência Rx',     unit: 'dBm' },
  ]
  const stColor = (s: string | null) => s === 'alarm' ? C.red : s === 'warn' ? C.orange : s === 'ok' ? C.green : C.textG

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {swWithTx.map(sw => {
        const swAlarm = sw.transceivers.reduce((n, tx) => n + metrics.filter(m => txStatus(tx[m.key] as TxMetric | null) === 'alarm').length, 0)
        const swWarn  = sw.transceivers.reduce((n, tx) => n + metrics.filter(m => txStatus(tx[m.key] as TxMetric | null) === 'warn').length, 0)
        return (
          <Panel key={sw.hostname} icon="🔬" label={`${sw.hostname} — Diagnóstico Óptico (DOM)`}
            color={swAlarm > 0 ? C.red : swWarn > 0 ? C.orange : C.cyan}
            accent={swAlarm > 0 ? 'rgba(239,68,68,0.05)' : 'rgba(34,211,238,0.04)'}
            right={<span style={{ fontSize: 9, fontFamily: C.mono }}>
              <span style={{ color: swAlarm > 0 ? C.red : C.textG }}>{swAlarm} alarme(s)</span>
              <span style={{ color: C.textG }}> · </span>
              <span style={{ color: swWarn > 0 ? C.orange : C.textG }}>{swWarn} atenção</span>
            </span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {sw.transceivers.map(tx => {
                const worst = metrics.map(m => txStatus(tx[m.key] as TxMetric | null))
                  .reduce((a, s) => s === 'alarm' || a === 'alarm' ? 'alarm' : s === 'warn' || a === 'warn' ? 'warn' : (a ?? s), null as any)
                return (
                  <div key={tx.port} style={{
                    border: `1px solid ${worst === 'alarm' ? C.red : worst === 'warn' ? C.orange : C.border}`,
                    borderRadius: 8, background: worst === 'alarm' ? `${C.red}0A` : C.surface, overflow: 'hidden',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.cyan, fontFamily: C.mono }}>📡 {tx.port}</span>
                      {worst && <Badge label={worst === 'alarm' ? 'ALARME' : worst === 'warn' ? 'ATENÇÃO' : 'OK'} color={stColor(worst)} />}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono, whiteSpace: 'nowrap' }}>
                        <thead>
                          <tr style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}>
                            {['Métrica', 'Valor', 'High Alarm', 'High Warn', 'Low Warn', 'Low Alarm', 'Status'].map(h => (
                              <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.map((m, i) => {
                            const v = tx[m.key] as TxMetric | null
                            const st = txStatus(v)
                            const nd = !v   // métrica não reportada pelo transceptor
                            return (
                              <tr key={m.key} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 ? C.surface : 'transparent' }}>
                                <td style={{ padding: '6px 12px', color: C.text }}>{m.label} <span style={{ color: C.textG }}>({m.unit})</span></td>
                                <td style={{ padding: '6px 12px', fontWeight: 700, color: nd ? C.textG : stColor(st), fontStyle: nd ? 'italic' : undefined }}>{v ? v.value : 'N/D'}</td>
                                <td style={{ padding: '6px 12px', color: C.textD }}>{v ? v.highAlarm : '—'}</td>
                                <td style={{ padding: '6px 12px', color: C.textD }}>{v ? v.highWarn : '—'}</td>
                                <td style={{ padding: '6px 12px', color: C.textD }}>{v ? v.lowWarn : '—'}</td>
                                <td style={{ padding: '6px 12px', color: C.textD }}>{v ? v.lowAlarm : '—'}</td>
                                <td style={{ padding: '6px 12px' }}>
                                  <Badge label={nd ? 'N/D' : st === 'alarm' ? 'ALARME' : st === 'warn' ? 'ATENÇÃO' : 'OK'} color={nd ? C.textG : stColor(st)} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        )
      })}
    </div>
  )
}

// ─── Analytics Panel ──────────────────────────────────────────────────────
function AnalyticsPanel({ switches }: { switches: SwitchData[] }) {
  if (!switches.length)
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40,
      }}>
        <span style={{ fontSize: 40 }}>📊</span>
        <p style={{ fontSize: 12, color: C.textG, fontFamily: C.mono }}>
          Carregue arquivos RTF para visualizar os indicadores.
        </p>
      </div>
    )

  // Derived indicators per switch
  const rows = switches.map((sw) => {
    const cpuMaxHour = sw.cpuHour.length ? Math.max(...sw.cpuHour.map((p) => p.max)) : null
    const cpuAvgHour = sw.cpuHour.length
      ? Math.round(sw.cpuHour.reduce((s, p) => s + p.avg, 0) / sw.cpuHour.length)
      : null
    const critHours = sw.cpuHour.filter((p) => p.max > 50).length
    const alerts: string[] = []
    if (sw.cpuNow && sw.cpuNow.interrupt > 5)   alerts.push('Interrupção alta')
    if (sw.memory && sw.memory.pct > 80)         alerts.push('Memória crítica')
    if (cpuMaxHour !== null && cpuMaxHour > 50)  alerts.push(`${critHours} h > 50%`)
    const { color: pAColor } = envStatus(sw.env?.powerA ?? '')
    const { color: pBColor } = envStatus(sw.env?.powerB ?? '')
    if (pAColor === C.red) alerts.push('PS-A falha')
    if (pBColor === C.red) alerts.push('PS-B falha')
    if (sw.catalystEnv) {
      sw.catalystEnv.temps.forEach(t => {
        if (t.hotspotValue !== null && t.hotspotRed !== null && t.hotspotValue >= t.hotspotRed)
          alerts.push(`${t.switchId} Hotspot ALTA`)
        if (t.inletValue !== null && t.inletRed !== null && t.inletValue >= t.inletRed)
          alerts.push(`${t.switchId} Inlet ALTA`)
      })
      sw.catalystEnv.fans.filter(f => !/^(ok|good)$/i.test(f.status)).forEach(f => alerts.push(`FAN ${f.name} falha`))
      sw.catalystEnv.powerSupplies.filter(ps => !/^(ok|good)$/i.test(ps.status)).forEach(ps => alerts.push(`PS ${ps.slot} falha`))
    }
    // SFP óptico (DOM) fora do limiar — indicador precoce de falha de enlace.
    const { alarms: sfpAl, warns: sfpWn } = sfpAlarms(sw)
    if (sfpAl.length) alerts.push(`SFP em alarme: ${sfpAl.join(', ')}`)
    if (sfpWn.length) alerts.push(`SFP em atenção: ${sfpWn.join(', ')}`)
    return { sw, cpuMaxHour, cpuAvgHour, critHours, alerts, sfpAlarmCount: sfpAl.length }
  })

  // DLR columns only appear when at least one switch in the fleet uses DLR.
  const hasDlr = switches.some(sw => sw.dlrConfig.length > 0 || sw.dlrStatus.length > 0)

  // Global KPIs
  const totalAlerts  = rows.reduce((s, r) => s + r.alerts.length, 0)
  const avgCpu       = rows.filter((r) => r.sw.cpuNow).length
    ? Math.round(rows.filter((r) => r.sw.cpuNow).reduce((s, r) => s + r.sw.cpuNow!.fiveSec, 0) /
        rows.filter((r) => r.sw.cpuNow).length)
    : null
  const avgMem       = rows.filter((r) => r.sw.memory).length
    ? parseFloat((rows.filter((r) => r.sw.memory).reduce((s, r) => s + r.sw.memory!.pct, 0) /
        rows.filter((r) => r.sw.memory).length).toFixed(1))
    : null
  const critSwitches = rows.filter((r) => r.alerts.length > 0).length

  const tempAlertCount = switches.filter(s => s.tempAlert && (s.tempAlert.status === 'HIGH' || s.tempAlert.status === 'LOW')).length
  const sfpAlarmSwitches = rows.filter(r => r.sfpAlarmCount > 0).length

  // Hotspot temperature: pick highest hotspot among all switches with Catalyst env
  const hotspotData = switches
    .flatMap(sw => (sw.catalystEnv?.temps ?? []).map(t => ({
      value: t.hotspotValue,
      red: t.hotspotRed,
      yellow: t.hotspotYellow,
    })))
    .filter(d => d.value !== null)
  const maxHotspot = hotspotData.length ? Math.max(...hotspotData.map(d => d.value!)) : null
  const hotspotRef = hotspotData.find(d => d.value === maxHotspot)
  const hotspotRed = hotspotRef?.red ?? null
  const hotspotYellow = hotspotRef?.yellow ?? null
  const hotspotWarn = maxHotspot !== null && hotspotRed !== null && maxHotspot >= hotspotRed
  const hotspotYWarn = maxHotspot !== null && hotspotYellow !== null && maxHotspot >= hotspotYellow && !hotspotWarn
  const hotspotColor = hotspotWarn ? C.red : hotspotYWarn ? C.orange : maxHotspot !== null ? C.green : C.textG

  const kpis = [
    { icon: '🖥️', label: 'Switches',      value: String(switches.length),                                    color: C.cyan                           },
    { icon: '⚠️',  label: 'Com Alertas',   value: String(critSwitches),                                       color: critSwitches > 0 ? C.red : C.green },
    { icon: '⚡',  label: 'CPU Média (5s)',value: avgCpu !== null ? `${avgCpu}%` : 'N/A',                     color: avgCpu !== null && avgCpu > 50 ? C.red : C.orange },
    { icon: '🧠',  label: 'RAM Média',     value: avgMem !== null ? fmtPct(avgMem) : 'N/A',                  color: avgMem !== null && avgMem > 80 ? C.red : C.blue  },
    { icon: '🔥',  label: 'Hotspot Máx',
      value: maxHotspot !== null
        ? `${maxHotspot}°C${hotspotRed !== null ? ` / ${hotspotRed}°C` : ''}`
        : 'N/A',
      color: hotspotColor,
    },
    { icon: '🌡️',  label: 'Temp. Alertas', value: String(tempAlertCount),                                     color: tempAlertCount > 0 ? C.red : C.green },
    { icon: '📡',  label: 'SFP Alarme',    value: String(sfpAlarmSwitches),                                   color: sfpAlarmSwitches > 0 ? C.red : C.green },
    { icon: '🚨',  label: 'Total Alertas', value: String(totalAlerts),                                        color: totalAlerts > 0 ? C.orange : C.green },
  ]

  const TH = ({ children }: { children: React.ReactNode }) => (
    <th style={{
      padding: '8px 12px', textAlign: 'left', fontSize: 8,
      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em',
      color: C.textG, background: C.surface, borderBottom: `1px solid ${C.border}`,
      whiteSpace: 'nowrap',
    }}>{children}</th>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(120px, 1fr))', gap: 12, flexWrap: 'wrap' }}>
        {kpis.map((k) => (
          <div key={k.label} style={{
            padding: '14px 16px', background: C.panel,
            border: `1px solid ${C.border}`, borderRadius: 8,
            borderTop: `2px solid ${k.color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 13 }}>{k.icon}</span>
              <span style={{ fontSize: 7, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG, lineHeight: 1.2 }}>
                {k.label}
              </span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: k.color, fontFamily: C.mono }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Per-switch comparison table */}
      <Panel icon="📋" label="Indicadores por Switch" color={C.cyan} accent="rgba(34,211,238,0.04)">
        <div style={{
          overflowX: 'auto', overflowY: 'auto',
          maxHeight: 420,
          border: `1px solid ${C.border}`, borderRadius: 8,
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <TH>Switch</TH>
                <TH>Modelo</TH>
                <TH>Firmware</TH>
                <TH>Uptime</TH>
                <TH>Último Reload</TH>
                <TH>STP Mode</TH>
                <TH>VTP Mode</TH>
                <TH>PTP Mode</TH>
                <TH>Acesso</TH>
                {hasDlr && <>
                  <TH>DLR Ring</TH>
                  <TH>DLR Mode</TH>
                  <TH>DLR Interfaces</TH>
                  <TH>DLR Status</TH>
                </>}
                <TH>UDLD</TH>
                <TH>Interrup.</TH>
                <TH>CPU 5min</TH>
                <TH>Mem%</TH>
                <TH>Temp.</TH>
                <TH>Status Temp.</TH>
                <TH>PS-A</TH>
                <TH>PS-B</TH>
                <TH>Alertas</TH>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sw, alerts }, i) => {
                const cpu = sw.cpuNow
                const mem = sw.memory
                const vtyIn = sw.vtyBlocks.filter(v => !v.isCon).map(v => v.transportInput.toLowerCase())
                const acc = {
                  ssh:    vtyIn.some(s => /\b(ssh|all)\b/.test(s)),
                  telnet: vtyIn.some(s => /\b(telnet|all)\b/.test(s)),
                  snmp:   sw.snmpEnabled,
                }
                const { color: pAC } = envStatus(sw.env?.powerA ?? '')
                const { color: pBC } = envStatus(sw.env?.powerB ?? '')
                const hasAlert = alerts.length > 0

                const TD = ({ children, warn = false, color }: {
                  children: React.ReactNode; warn?: boolean; color?: string
                }) => (
                  <td style={{
                    padding: '8px 12px', whiteSpace: 'nowrap',
                    color: warn ? C.red : color ?? C.text,
                    fontWeight: warn ? 700 : 400,
                    borderBottom: `1px solid ${C.border}`,
                  }}>{children}</td>
                )

                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : C.surface }}>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: hasAlert ? C.red : C.green,
                          boxShadow: `0 0 5px ${hasAlert ? C.red : C.green}80`,
                        }} />
                        <span style={{ fontWeight: 700, color: hasAlert ? C.orange : C.text }}>
                          {sw.hostname}
                        </span>
                      </div>
                    </TD>
                    <TD color={C.cyan}>{sw.modelNumber}</TD>
                    <TD color={C.textD}>{sw.firmware}</TD>
                    <TD color={C.textD}>{abbrevUptime(sw.uptime)}</TD>
                    <TD color={C.textD}>{sw.reloadReason}</TD>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                      <Badge label={sw.stpMode !== 'N/A' ? sw.stpMode : '—'} color={C.blue} />
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                      <Badge label={sw.vtpMode !== 'N/A' ? sw.vtpMode : '—'} color={C.purple} />
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                      <Badge label={sw.ptpMode !== 'N/A' ? sw.ptpMode : '—'} color={C.cyan} />
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                      {acc.ssh || acc.telnet || acc.snmp ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {acc.ssh    && <Badge label="SSH"    color={C.green} />}
                          {acc.telnet && <Badge label="Telnet" color={C.red} />}
                          {acc.snmp   && <Badge label="SNMP"   color={C.blue} />}
                        </div>
                      ) : <span style={{ fontSize: 9, color: C.textG, fontFamily: C.mono }}>—</span>}
                    </td>
                    {hasDlr && <>
                      {/* DLR Ring */}
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                        {sw.dlrConfig.length || sw.dlrStatus.length
                          ? <span style={{ fontFamily: C.mono, fontWeight: 700, color: C.purple }}>
                              {(sw.dlrConfig.length ? sw.dlrConfig.map(r => r.ring) : sw.dlrStatus.map(r => r.ring)).join(', ')}
                            </span>
                          : <span style={{ fontSize: 9, color: C.textG, fontFamily: C.mono }}>—</span>}
                      </td>
                      {/* DLR Mode (config) */}
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                        {sw.dlrConfig.length
                          ? (() => {
                              const modes = [...new Set(sw.dlrConfig.map(r => r.mode))]
                              return <span style={{ fontFamily: C.mono, color: C.textD }}>
                                {modes.length === 1 ? modes[0] : sw.dlrConfig.map(r => `R${r.ring}:${r.mode}`).join(', ')}
                              </span>
                            })()
                          : <span style={{ fontSize: 9, color: C.textG, fontFamily: C.mono }}>—</span>}
                      </td>
                      {/* DLR Interfaces por anel */}
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                        {sw.dlrInterfaces.length
                          ? (() => {
                              const byRing = new Map<number, string[]>()
                              sw.dlrInterfaces.forEach(i => { const a = byRing.get(i.ring) ?? []; a.push(i.iface); byRing.set(i.ring, a) })
                              return <span style={{ fontSize: 9, fontFamily: C.mono, color: C.textD }}>
                                {[...byRing.entries()].sort((a, b) => a[0] - b[0]).map(([r, ifs]) => `R${r}: ${ifs.join(', ')}`).join('   ·   ')}
                              </span>
                            })()
                          : <span style={{ fontSize: 9, color: C.textG, fontFamily: C.mono }}>—</span>}
                      </td>
                      {/* DLR Status (show dlr ring) */}
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                        {sw.dlrStatus.length
                          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {sw.dlrStatus.map(s => {
                                const ok = /normal/i.test(s.status)
                                const modeColor = /active/i.test(s.mode) ? C.green : /backup/i.test(s.mode) ? C.orange : C.textD
                                return <div key={s.ring} style={{ fontSize: 9, fontFamily: C.mono, whiteSpace: 'nowrap' }}>
                                  <span style={{ color: C.purple, fontWeight: 700 }}>R{s.ring}</span>{' '}
                                  <span style={{ color: modeColor }}>{s.mode}</span>{' · '}
                                  <span style={{ color: C.textD }}>{s.topology}</span>{' · '}
                                  <span style={{ color: ok ? C.green : C.red, fontWeight: 700 }}>{s.status}</span>
                                </div>
                              })}
                            </div>
                          : <span style={{ fontSize: 9, color: C.textG, fontFamily: C.mono }}>—</span>}
                      </td>
                    </>}
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                      <Badge label={sw.udld} color={/disable/i.test(sw.udld) ? C.textD : C.green} />
                    </td>
                    <TD warn={!!(cpu && cpu.interrupt > 5)}>
                      {cpu ? `${cpu.interrupt}%` : '—'}
                    </TD>
                    <TD>{cpu ? `${cpu.fiveMin}%` : '—'}</TD>
                    <TD warn={!!(mem && mem.pct > 80)}>
                      {mem ? fmtPct(mem.pct) : '—'}
                    </TD>
                    <TD color={C.textD}>{sw.env?.temperature ?? '—'}</TD>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                      {sw.tempAlert && sw.tempAlert.status !== 'UNKNOWN_MODEL' && sw.tempAlert.status !== 'UNPARSEABLE_TEMP' ? (
                        <Badge
                          label={sw.tempAlert.status === 'OK' ? `OK ${sw.tempAlert.tempC}°C` : `${sw.tempAlert.status} ${sw.tempAlert.tempC}°C`}
                          color={sw.tempAlert.status === 'OK' ? C.green : C.red}
                        />
                      ) : (
                        <span style={{ fontSize: 9, color: C.textG, fontFamily: C.mono }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                      <Badge label={sw.env ? envStatus(sw.env.powerA).label : '—'} color={pAC} />
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                      <Badge label={sw.env ? envStatus(sw.env.powerB).label : '—'} color={pBC} />
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                      {alerts.length === 0
                        ? <Badge label="OK" color={C.green} />
                        : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {/* Warn-level alerts (SFP em atenção) in orange; alarms/faults in red. */}
                            {alerts.map((a) => <Badge key={a} label={a} color={a.startsWith('SFP em atenção') ? C.orange : C.red} />)}
                          </div>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

// ─── SpreadsheetML Export helpers ─────────────────────────────────────────
// All text cells
function xlCell(value: string | number): string {
  const safe = String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  return `<Cell><Data ss:Type="String">${safe}</Data></Cell>`
}
// Plain numeric cell (bytes, counts)
function xlNum(value: number, styleId = 'num'): string {
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${value}</Data></Cell>`
}
// CPU/memory percentage: green when ok, red when warn (item 2+3)
// Stores raw number (e.g. 18.7), Excel format appends % sign via style
function xlPct(value: number, isWarn = false, useOkColor = false): string {
  let sid: string
  if (isWarn)      sid = 'pctWarn'   // red bg + red font
  else if (useOkColor) sid = 'pctOk' // green font (normal values)
  else             sid = 'pctNum'    // neutral (grey) — for historical data
  return `<Cell ss:StyleID="${sid}"><Data ss:Type="Number">${value}</Data></Cell>`
}
// CPU percentage with explicit alert coloring (items 2+3) — always red/green
function xlCpuPct(value: number, isWarn: boolean): string {
  return `<Cell ss:StyleID="${isWarn ? 'pctWarn' : 'pctOk'}"><Data ss:Type="Number">${value}</Data></Cell>`
}
function xlRow(...cells: string[]): string { return `<Row>${cells.join('')}</Row>` }
function xlHeader(label: string): string {
  return `<Cell ss:StyleID="hdr"><Data ss:Type="String">${label}</Data></Cell>`
}
function xlSectionRow(label: string, colspan = 3): string {
  return `<Row><Cell ss:StyleID="sec" ss:MergeAcross="${colspan - 1}"><Data ss:Type="String">${label}</Data></Cell></Row>`
}
// Text status cells (Status column)
function xlWarnCell(value: string, isWarn: boolean): string {
  return `<Cell ss:StyleID="${isWarn ? 'txtWarn' : 'txtOk'}"><Data ss:Type="String">${value}</Data></Cell>`
}
// Alert cell with three severity levels: ok (green) / attention (orange) / alarm (red).
function xlAlertCell(value: string, level: 'ok' | 'attn' | 'alarm'): string {
  const sid = level === 'alarm' ? 'txtWarn' : level === 'attn' ? 'txtAttn' : 'txtOk'
  const safe = String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  return `<Cell ss:StyleID="${sid}"><Data ss:Type="String">${safe}</Data></Cell>`
}

function buildWorksheet(sw: SwitchData, sheetName?: string): string {
  const rows: string[] = []

  // ── Info Geral ──────────────────────────────────────────────────────────
  rows.push(xlSectionRow('Informações Gerais', 2))
  rows.push(xlRow(xlCell('Hostname'),          xlCell(sw.hostname)))
  rows.push(xlRow(xlCell('Modelo'),            xlCell(sw.modelNumber)))
  rows.push(xlRow(xlCell('Firmware'),          xlCell(sw.firmware)))
  rows.push(xlRow(xlCell('Uptime'),            xlCell(sw.uptime)))
  rows.push(xlRow(xlCell('Último Reload'),     xlCell(sw.reloadReason)))
  rows.push(xlRow(xlCell('Reinicializado Em'), xlCell(sw.restartedAt)))
  rows.push(xlRow(xlCell('Hora Atual'),        xlCell(sw.clockTime)))
  rows.push(xlRow(xlCell('Arquivo'),           xlCell(sw.filename)))
  rows.push(`<Row ss:AutoFitHeight="1"/>`)

  // ── Usuários configurados ────────────────────────────────────────────────
  if (sw.usernames.length > 0) {
    rows.push(xlSectionRow('Usuários — show running-config', 1))
    rows.push(xlRow(xlHeader('Username')))
    sw.usernames.forEach(u => rows.push(xlRow(xlCell(u))))
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── Configuração — running-config ────────────────────────────────────────
  rows.push(xlSectionRow('Configuração — show running-config', 2))
  rows.push(xlRow(xlCell('Spanning Tree Mode'), xlCell(sw.stpMode)))
  rows.push(xlRow(xlCell('VTP Mode'),           xlCell(sw.vtpMode)))
  rows.push(xlRow(xlCell('PTP Mode'),           xlCell(sw.ptpMode)))
  rows.push(xlRow(xlCell('UDLD'),               xlCell(sw.udld)))
  const xlVtyInputs = sw.vtyBlocks.filter(v => !v.isCon).map(v => v.transportInput.toLowerCase())
  const xlHasSsh    = xlVtyInputs.length === 0 || xlVtyInputs.some(s => /\b(ssh|all)\b/.test(s))
  const xlHasTelnet = xlVtyInputs.length === 0 || xlVtyInputs.some(s => /\b(telnet|all)\b/.test(s))
  rows.push(xlSectionRow('Acesso — show running-config', 2))
  rows.push(xlRow(xlHeader('Protocolo'), xlHeader('Status')))
  rows.push(xlRow(xlCell('SSH'),    xlWarnCell(xlHasSsh    ? 'HABILITADO' : 'DESABILITADO', !xlHasSsh)))
  rows.push(xlRow(xlCell('Telnet'), xlWarnCell(xlHasTelnet ? 'HABILITADO' : 'DESABILITADO', xlHasTelnet)))
  rows.push(xlRow(xlCell('SNMP'),   xlWarnCell(sw.snmpEnabled ? 'HABILITADO' : 'DESABILITADO', !sw.snmpEnabled)))
  rows.push(`<Row ss:AutoFitHeight="1"/>`)

  // ── SNMP Community names ─────────────────────────────────────────────────
  if (sw.snmpEnabled) {
    rows.push(xlSectionRow('SNMP Communities — show running-config', 2))
    rows.push(xlRow(xlHeader('Tipo'), xlHeader('Community')))
    if (sw.snmpRo) rows.push(xlRow(xlCell('Read Only  (RO)'), xlCell(sw.snmpCommunityRo)))
    if (sw.snmpRw) rows.push(xlRow(xlCell('Read Write (RW)'), xlCell(sw.snmpCommunityRw)))
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── Lines: CON + VTY ────────────────────────────────────────────────────
  if (sw.vtyBlocks.length > 0) {
    rows.push(xlSectionRow('Lines (CON e VTY) — show running-config', 4))
    rows.push(xlRow(xlHeader('Linha'), xlHeader('Login'), xlHeader('Transport Input'), xlHeader('Transport Output')))
    sw.vtyBlocks.forEach(v => rows.push(xlRow(
      xlCell(v.isCon ? 'CON 0' : `VTY ${v.range}`),
      xlCell(v.login),
      xlCell(v.transportInput),
      xlCell(v.transportOutput),
    )))
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── NTP Servers ─────────────────────────────────────────────────────────
  if (sw.ntpServers.length > 0) {
    const multiNtp = sw.ntpServers.length > 1
    rows.push(xlSectionRow('NTP Servers — show running-config', multiNtp ? 2 : 1))
    if (multiNtp) rows.push(xlRow(xlHeader('Servidor'), xlHeader('Tipo')))
    else rows.push(xlRow(xlHeader('Servidor')))
    sw.ntpServers.forEach(n => {
      if (multiNtp) rows.push(xlRow(xlCell(n.address), xlCell(n.preferred ? 'PREFERENCIAL' : 'ALTERNATIVO')))
      else rows.push(xlRow(xlCell(n.address)))
    })
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── CPU Atual ───────────────────────────────────────────────────────────
  if (sw.cpuNow) {
    const { fiveSec, interrupt, oneMin, fiveMin } = sw.cpuNow
    rows.push(xlSectionRow('CPU — show process cpu — Utilização Atual', 4))
    rows.push(xlRow(xlHeader('Métrica'), xlHeader('Valor (%)'), xlHeader('Limiar'), xlHeader('Status')))
    rows.push(xlRow(xlCell('5 Seg — Total'),       xlCpuPct(fiveSec,   false),         xlCell('—'),     xlCell('NORMAL')))
    rows.push(xlRow(xlCell('5 Seg — Interrupção'), xlCpuPct(interrupt, interrupt > 5), xlCell('> 5%'),  xlWarnCell(interrupt > 5  ? '⚠ ALTO' : 'NORMAL', interrupt > 5)))
    rows.push(xlRow(xlCell('1 Minuto'),  xlCpuPct(oneMin,  false), xlCell('—'), xlCell('—')))
    rows.push(xlRow(xlCell('5 Minutos'), xlCpuPct(fiveMin, false), xlCell('—'), xlCell('—')))
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── Top Processos ───────────────────────────────────────────────────────
  if (sw.processes.length > 0) {
    rows.push(xlSectionRow('Top Processos — show process cpu (somente com atividade)', 5))
    rows.push(xlRow(xlHeader('PID'), xlHeader('5 Sec (%)'), xlHeader('1 Min (%)'), xlHeader('5 Min (%)'), xlHeader('Processo')))
    sw.processes.forEach((p) => {
      const fs2 = parseFloat(p.fiveSec), om = parseFloat(p.oneMin), fm = parseFloat(p.fiveMin)
      rows.push(xlRow(xlCell(p.pid), xlCpuPct(fs2, fs2 > 10), xlCpuPct(om, om > 5), xlCpuPct(fm, false), xlCell(p.name)))
    })
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── Memória ─────────────────────────────────────────────────────────────
  if (sw.memory) {
    const { total, used, free, pct } = sw.memory
    rows.push(xlSectionRow('Memória — show memory statistics', 3))
    rows.push(xlRow(xlHeader('Parâmetro'), xlHeader('Valor (bytes)'), xlHeader('Formatado')))
    rows.push(xlRow(xlCell('Total'), xlNum(total), xlCell(fmtBytes(total))))
    rows.push(xlRow(xlCell('Usado'), xlNum(used),  xlCell(fmtBytes(used))))
    rows.push(xlRow(xlCell('Livre'), xlNum(free),  xlCell(fmtBytes(free))))
    rows.push(xlRow(xlCell('Utilização (%)'), xlCpuPct(pct, pct > 80),
      xlWarnCell(pct > 80 ? '⚠ CRÍTICO (> 80%)' : pct > 60 ? 'ATENÇÃO (> 60%)' : 'NORMAL', pct > 80)))
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── Rede ────────────────────────────────────────────────────────────────
  rows.push(xlSectionRow('Rede — show running-config', 3))
  rows.push(xlRow(xlCell('Gateway Padrão'), xlCell(sw.gateway), xlCell('')))
  if (sw.vlans.length > 0) {
    rows.push(xlRow(xlHeader('VLAN'), xlHeader('Endereço IP'), xlHeader('Máscara de Sub-rede')))
    sw.vlans.forEach((v) => rows.push(xlRow(xlCell(`VLAN ${v.vlan}`), xlCell(v.ip), xlCell(v.mask))))
  } else {
    rows.push(xlRow(xlCell('Nenhuma interface VLAN com IP encontrada.'), xlCell(''), xlCell('')))
  }
  rows.push(`<Row ss:AutoFitHeight="1"/>`)

  // ── Ambiente ────────────────────────────────────────────────────────────
  if (sw.catalystEnv) {
    // ── Catalyst structured: FANs ──
    if (sw.catalystEnv.fans.length > 0) {
      rows.push(xlSectionRow('Ambiente — FANs (show environment all)', 4))
      rows.push(xlRow(xlHeader('FAN'), xlHeader('Tipo'), xlHeader('Status'), xlHeader('Alerta')))
      sw.catalystEnv.fans.forEach(fan => {
        const ok = /^(ok|good)$/i.test(fan.status)
        rows.push(xlRow(
          xlCell(fan.name),
          xlCell(fan.isPs ? 'FAN PS' : 'FAN Switch'),
          xlWarnCell(fan.status, !ok),
          xlWarnCell(ok ? 'NORMAL' : '⚠ FALHA', !ok),
        ))
      })
      rows.push(`<Row ss:AutoFitHeight="1"/>`)
    }
    // ── Catalyst structured: Temperature blocks ──
    if (sw.catalystEnv.temps.length > 0) {
      rows.push(xlSectionRow('Ambiente — Temperatura por Switch (show environment all)', 7))
      rows.push(xlRow(
        xlHeader('Switch'), xlHeader('Sistema'),
        xlHeader('Inlet (°C)'), xlHeader('Estado Inlet'), xlHeader('Red Threshold Inlet'),
        xlHeader('Hotspot (°C)'), xlHeader('Red Threshold Hotspot'),
      ))
      sw.catalystEnv.temps.forEach(t => {
        const inletWarn = t.inletRed !== null && t.inletValue !== null && t.inletValue >= t.inletRed
        const hotWarn   = t.hotspotRed !== null && t.hotspotValue !== null && t.hotspotValue >= t.hotspotRed
        rows.push(xlRow(
          xlCell(t.switchId),
          xlWarnCell(t.systemStatus, !/^(ok|good)$/i.test(t.systemStatus)),
          t.inletValue !== null ? xlPct(t.inletValue, inletWarn) : xlCell('N/A'),
          xlWarnCell(t.inletState, inletWarn),
          t.inletRed !== null ? xlCell(`${t.inletRed}°C`) : xlCell('N/A'),
          t.hotspotValue !== null ? xlPct(t.hotspotValue, hotWarn) : xlCell('N/A'),
          t.hotspotRed !== null ? xlCell(`${t.hotspotRed}°C`) : xlCell('N/A'),
        ))
      })
      rows.push(`<Row ss:AutoFitHeight="1"/>`)
    }
    // ── Catalyst structured: Power Supplies ──
    if (sw.catalystEnv.powerSupplies.length > 0) {
      rows.push(xlSectionRow('Ambiente — Fontes de Alimentação (show environment all)', 7))
      rows.push(xlRow(
        xlHeader('Slot'), xlHeader('Modelo (PID)'), xlHeader('Serial'),
        xlHeader('Status'), xlHeader('Sys Pwr'), xlHeader('PoE Pwr'), xlHeader('Watts'),
      ))
      sw.catalystEnv.powerSupplies.forEach(ps => {
        const ok = /^(ok|good)$/i.test(ps.status)
        const sysBad = !/^good$/i.test(ps.sysPwr)
        const poeBad = !/^good$/i.test(ps.poePwr)
        rows.push(xlRow(
          xlCell(ps.slot), xlCell(ps.pid), xlCell(ps.serial),
          xlWarnCell(ps.status, !ok),
          xlWarnCell(ps.sysPwr, sysBad),
          xlWarnCell(ps.poePwr, poeBad),
          xlCell(ps.watts + 'W'),
        ))
      })
      rows.push(`<Row ss:AutoFitHeight="1"/>`)
    }
  } else if (sw.env) {
    // ── Fallback: original simple env format ──
    const { label: lA, color: cA } = envStatus(sw.env.powerA)
    const { label: lB, color: cB } = envStatus(sw.env.powerB)
    rows.push(xlSectionRow('Ambiente — show env all', 3))
    rows.push(xlRow(xlHeader('Parâmetro'), xlHeader('Valor Lido'), xlHeader('Status')))
    const tAlert = sw.tempAlert
    const tempStatus = tAlert && tAlert.status !== 'UNPARSEABLE_TEMP'
      ? `${tAlert.status}${tAlert.status !== 'UNKNOWN_MODEL' ? ` (limite: ${tAlert.range.minC}~${tAlert.range.maxC}°C)` : ''}`
      : 'INFO'
    const tempIsWarn = tAlert ? (tAlert.status === 'HIGH' || tAlert.status === 'LOW') : false
    rows.push(xlRow(xlCell('Temperatura do Sistema'), xlCell(sw.env.temperature), xlWarnCell(tempStatus, tempIsWarn)))
    rows.push(xlRow(xlCell('Power Supply A'), xlCell(sw.env.powerA), xlWarnCell(lA, cA === C.red)))
    rows.push(xlRow(xlCell('Power Supply B'), xlCell(sw.env.powerB), xlWarnCell(lB, cB === C.red)))
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── Histórico CPU 72h ────────────────────────────────────────────────────
  if (sw.cpuHour.length > 0) {
    rows.push(xlSectionRow('Histórico CPU — show process cpu history (últimas 72 horas)', 4))
    rows.push(xlRow(xlHeader('Hora (índice)'), xlHeader('CPU Máx (%)'), xlHeader('CPU Méd (%)'), xlHeader('Status')))
    sw.cpuHour.forEach((p, i) => rows.push(xlRow(
      xlCell(`h${i}`), xlPct(p.max, p.max > 50), xlPct(p.avg, false),
      xlWarnCell(p.max > 50 ? 'CRÍTICO' : p.max > 30 ? 'ALTO' : 'NORMAL', p.max > 50),
    )))
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── Spanning Tree — mudanças de topologia ───────────────────────────────
  if (sw.stpTopo.length > 0) {
    rows.push(xlSectionRow('Spanning Tree — show spanning-tree detail', 4))
    rows.push(xlRow(xlHeader('Instância'), xlHeader('Nº Mudanças'), xlHeader('Última Mudança'), xlHeader('Porta de Origem')))
    sw.stpTopo.forEach(s => rows.push(xlRow(xlCell(s.instance), xlNum(s.changes), xlCell(`${s.lastChange} atrás`), xlCell(s.fromPort))))
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── Interfaces Status ─────────────────────────────────────────────────────
  if (sw.interfaceStatus.length > 0) {
    rows.push(xlSectionRow('Interfaces — show interfaces status', 7))
    rows.push(xlRow(
      xlHeader('Porta'), xlHeader('Nome/Descrição'), xlHeader('Status'),
      xlHeader('VLAN'), xlHeader('Duplex'), xlHeader('Speed'), xlHeader('Tipo'),
    ))
    sw.interfaceStatus.forEach(p => {
      const st = ifStatusStyle(p.status)
      const isWarn = st.color === C.red || st.color === C.yellow
      rows.push(xlRow(
        xlCell(p.port), xlCell(p.name || '—'),
        xlWarnCell(p.status || '—', isWarn),
        xlCell(p.vlan), xlCell(p.duplex), xlCell(p.speed), xlCell(p.type),
      ))
    })
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── DLR (Device Level Ring) ───────────────────────────────────────────────
  if (sw.dlrStatus.length > 0 || sw.dlrConfig.length > 0) {
    const dlrRings = [...new Set([...sw.dlrStatus.map(s => s.ring), ...sw.dlrConfig.map(c => c.ring)])].sort((a, b) => a - b)
    rows.push(xlSectionRow('DLR — show dlr ring / running-config', 17))
    rows.push(xlRow(
      xlHeader('Ring'), xlHeader('Mode (config)'), xlHeader('Mode (runtime)'),
      xlHeader('Topology'), xlHeader('Status'), xlHeader('IOS State'), xlHeader('HW State'),
      xlHeader('Supervisor IP'), xlHeader('Supervisor Ativo IP'),
      xlHeader('Port1'), xlHeader('Port2'),
      xlHeader('Beacon Int/Timeout (µs)'), xlHeader('DLR VLAN'), xlHeader('Precedence'),
      xlHeader('Redundant GW'), xlHeader('Participantes'), xlHeader('Ring Faults'),
    ))
    dlrRings.forEach(ring => {
      const st  = sw.dlrStatus.find(s => s.ring === ring)
      const cfg = sw.dlrConfig.find(c => c.ring === ring)
      const faultWarn = !!(st && st.ringFaults)
      const statusWarn = !!(st && !/normal/i.test(st.status))
      const fmtPort = (p: DlrPort | null) => p ? `${p.name} (vlan ${p.vlan}, ${p.state})` : '—'
      rows.push(xlRow(
        xlCell(String(ring)),
        xlCell(cfg ? cfg.mode : 'N/A'),
        xlCell(st ? st.mode : 'N/A'),
        xlCell(st ? st.topology : 'N/A'),
        xlWarnCell(st ? st.status : 'N/A', statusWarn),
        xlCell(st ? st.iosState : 'N/A'),
        xlCell(st ? st.hardwareState : 'N/A'),
        xlCell(st ? st.supervisorIp : 'N/A'),
        xlCell(st ? st.activeSupervisorIp : 'N/A'),
        xlCell(st ? fmtPort(st.port1) : '—'),
        xlCell(st ? fmtPort(st.port2) : '—'),
        xlCell(st ? `${st.beaconInterval} / ${st.beaconTimeout}` : 'N/A'),
        xlCell(st ? st.dlrVlanId : 'N/A'),
        xlCell(st ? st.precedence : 'N/A'),
        xlCell(st ? st.redundantGateway : 'N/A'),
        xlCell(st && st.participants !== null ? String(st.participants) : '—'),
        xlWarnCell(st && st.ringFaults !== null ? String(st.ringFaults) : '—', faultWarn),
      ))
    })
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
    // Interfaces por anel + participantes (detalhe)
    dlrRings.forEach(ring => {
      const st  = sw.dlrStatus.find(s => s.ring === ring)
      const ifs = sw.dlrInterfaces.filter(i => i.ring === ring).map(i => i.iface).join(', ')
      if (ifs) rows.push(xlRow(xlCell(`Ring ${ring} — Interfaces (config)`), xlCell(ifs)))
      if (st && st.lastFaultTime !== 'N/A') rows.push(xlRow(xlCell(`Ring ${ring} — Última falha`), xlCell(st.lastFaultTime)))
      if (st && st.participantList.length > 0) {
        rows.push(xlRow(xlCell(`Ring ${ring} — Participantes (${st.participantList.length})`), xlHeader('MAC-Addr'), xlHeader('IP-Addr')))
        st.participantList.forEach(p => rows.push(xlRow(xlCell(`  ${p.no}`), xlCell(p.mac), xlCell(p.ip))))
      }
    })
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── SFP Inventory ────────────────────────────────────────────────────────
  if (sw.sfpInventory.length > 0) {
    rows.push(xlSectionRow('Inventário SFP — show inventory', 4))
    rows.push(xlRow(xlHeader('Porta (NAME)'), xlHeader('Descrição (DESCR)'), xlHeader('Modelo (PID)'), xlHeader('S/N')))
    sw.sfpInventory.forEach(s => rows.push(xlRow(xlCell(s.port), xlCell(s.descr), xlCell(s.pid), xlCell(s.sn))))
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── MAC Addresses ────────────────────────────────────────────────────────────────────────────
  if (sw.totalMacAddresses !== null || sw.macPerVlan.length > 0) {
    rows.push(xlSectionRow('MAC Addresses — show mac address-table count', 4))
    if (sw.totalMacAddresses !== null) {
      rows.push(xlRow(xlCell('Total Mac Addresses for this criterion'), xlNum(sw.totalMacAddresses), xlCell(''), xlCell('')))
      rows.push(`<Row ss:AutoFitHeight="1"/>`)
    }
    if (sw.macPerVlan.length > 0) {
      rows.push(xlRow(xlHeader('VLAN'), xlHeader('Dinâmico'), xlHeader('Estático'), xlHeader('Total')))
      sw.macPerVlan.forEach(v => rows.push(xlRow(
        xlCell(`VLAN ${v.vlan}`),
        xlNum(v.dynamic),
        xlNum(v.staticCount),
        xlNum(v.total),
      )))
    }
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── Logs — show logging (eventos deste switch) ───────────────────────────
  const swLogs: LogEntry[] = ((sw as any)._logEntries ?? []) as LogEntry[]
  if (swLogs.length > 0) {
    rows.push(xlSectionRow('Logs — show logging', 6))
    rows.push(xlRow(xlHeader('Timestamp'), xlHeader('Severidade'), xlHeader('Interface'), xlHeader('Facility'), xlHeader('Mnemonic'), xlHeader('Mensagem')))
    swLogs.forEach(e => {
      const isCrit = e.severity <= 3
      rows.push(xlRow(
        xlCell(e.timestamp),
        xlWarnCell(`${e.severity} — ${sevLabel(e.severity)}`, isCrit),
        xlCell(logIface(e.message) || '—'),
        xlCell(e.facility),
        xlCell(e.mnemonic),
        xlCell(e.message),
      ))
    })
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── Transceiver Detail (DOM óptico) ───────────────────────────────────────
  if (sw.transceivers.length > 0) {
    rows.push(xlSectionRow('Transceiver Detail — show interface transceiver detail', 8))
    rows.push(xlRow(
      xlHeader('Porta'), xlHeader('Métrica'), xlHeader('Valor'),
      xlHeader('High Alarm'), xlHeader('High Warn'), xlHeader('Low Warn'), xlHeader('Low Alarm'),
      xlHeader('Status'),
    ))
    const txMetrics: { key: keyof TransceiverEntry; label: string }[] = [
      { key: 'temperature', label: 'Temperatura (°C)' },
      { key: 'voltage',     label: 'Voltagem (V)' },
      { key: 'current',     label: 'Corrente (mA)' },
      { key: 'txPower',     label: 'Potência Tx (dBm)' },
      { key: 'rxPower',     label: 'Potência Rx (dBm)' },
    ]
    sw.transceivers.forEach(tx => {
      txMetrics.forEach(m => {
        const v = tx[m.key] as TxMetric | null
        if (!v) {   // métrica não reportada pelo transceptor → N/D (não omitir)
          rows.push(xlRow(
            xlCell(tx.port), xlCell(m.label),
            xlCell('N/D'), xlCell('—'), xlCell('—'), xlCell('—'), xlCell('—'), xlCell('N/D'),
          ))
          return
        }
        const st = txStatus(v)
        const warn = st === 'alarm' || st === 'warn'
        rows.push(xlRow(
          xlCell(tx.port), xlCell(m.label),
          xlWarnCell(String(v.value), warn),
          xlCell(String(v.highAlarm)), xlCell(String(v.highWarn)),
          xlCell(String(v.lowWarn)), xlCell(String(v.lowAlarm)),
          xlWarnCell(st === 'alarm' ? 'ALARME' : st === 'warn' ? 'ATENÇÃO' : 'OK', warn),
        ))
      })
    })
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  // ── show running-config (dados brutos) ───────────────────────────────────
  const rawRunCfg: string = (sw as any)._rawRunningConfig ?? ''
  if (rawRunCfg) {
    rows.push(xlSectionRow('show running-config', 1))
    rawRunCfg.split('\n').forEach(line => {
      rows.push(xlRow(xlCell(line)))
    })
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
  }

  const wsName = sheetName ?? sw.hostname.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 31)
  return `<Worksheet ss:Name="${wsName}">
    <Table ss:DefaultColumnWidth="160">${rows.join('\n      ')}</Table>
  </Worksheet>`
}


function buildAnalyticsWorksheet(switches: SwitchData[]): string {
  const rows: string[] = []
  // 21 columns: hostname, model, firmware, uptime, reload, stp, vtp, ptp, acesso,
  //             dlrRing, dlrModeCfg, dlrIfaces, dlrStatus,
  //             intr, cpu5m, mem%, temp, statusTemp, psa, psb, alerts
  rows.push(xlSectionRow('Analytics — Visão Geral dos Switches', 22))
  rows.push(xlRow(
    xlHeader('Switch'), xlHeader('Modelo'), xlHeader('Firmware'),
    xlHeader('Uptime'), xlHeader('Último Reload'),
    xlHeader('STP Mode'), xlHeader('VTP Mode'), xlHeader('PTP Mode'),
    xlHeader('Acesso'),
    xlHeader('DLR Ring'), xlHeader('DLR Mode (cfg)'), xlHeader('DLR Interfaces'), xlHeader('DLR Status'),
    xlHeader('UDLD'),
    xlHeader('Interrup. (%)'), xlHeader('CPU 5min (%)'),
    xlHeader('Mem. Uso (%)'), xlHeader('Temperatura'), xlHeader('Status Temp.'),
    xlHeader('PS-A'), xlHeader('PS-B'), xlHeader('Alertas'),
  ))
  switches.forEach((sw) => {
    const cpu = sw.cpuNow
    const mem = sw.memory
    const cpuMaxHour = sw.cpuHour.length ? Math.max(...sw.cpuHour.map((p) => p.max)) : null
    const cpuAvgHour = sw.cpuHour.length
      ? Math.round(sw.cpuHour.reduce((s, p) => s + p.avg, 0) / sw.cpuHour.length)
      : null
    const alerts: string[] = []
    if (cpu && cpu.interrupt > 5)               alerts.push('Interrupção alta')
    if (mem && mem.pct > 80)                     alerts.push('Memória crítica')
    if (cpuMaxHour !== null && cpuMaxHour > 50) alerts.push('Pico CPU > 50%')
    const { label: lA, color: cA } = envStatus(sw.env?.powerA ?? '')
    const { label: lB, color: cB } = envStatus(sw.env?.powerB ?? '')
    if (cA === C.red) alerts.push('PS-A falha')
    if (cB === C.red) alerts.push('PS-B falha')
    if (sw.tempAlert?.status === 'HIGH') alerts.push(`Temp ALTA (${sw.tempAlert.tempC}°C > ${sw.tempAlert.range.maxC}°C)`)
    if (sw.tempAlert?.status === 'LOW')  alerts.push(`Temp BAIXA (${sw.tempAlert.tempC}°C < ${sw.tempAlert.range.minC}°C)`)
    if (sw.catalystEnv) {
      sw.catalystEnv.temps.forEach(t => {
        if (t.hotspotValue !== null && t.hotspotRed !== null && t.hotspotValue >= t.hotspotRed)
          alerts.push(`${t.switchId} Hotspot ALTA (${t.hotspotValue}°C ≥ ${t.hotspotRed}°C)`)
        if (t.inletValue !== null && t.inletRed !== null && t.inletValue >= t.inletRed)
          alerts.push(`${t.switchId} Inlet ALTA (${t.inletValue}°C ≥ ${t.inletRed}°C)`)
      })
      sw.catalystEnv.fans.forEach(fan => {
        if (!/^(ok|good)$/i.test(fan.status)) alerts.push(`FAN ${fan.name} FALHA`)
      })
      sw.catalystEnv.powerSupplies.forEach(ps => {
        if (!/^(ok|good)$/i.test(ps.status)) alerts.push(`PS ${ps.slot} FALHA`)
      })
    }
    const { alarms: sfpAl, warns: sfpWn } = sfpAlarms(sw)
    if (sfpAl.length) alerts.push(`SFP em alarme: ${sfpAl.join(', ')}`)
    if (sfpWn.length) alerts.push(`SFP em atenção: ${sfpWn.join(', ')}`)
    const swLogs: LogEntry[] = ((sw as any)._logEntries ?? []) as LogEntry[]
    if (swLogs.some(e => e.severity <= 3)) alerts.push(`${swLogs.filter(e => e.severity <= 3).length} log(s) crítico(s)`)

    // Acesso — tipos configurados (consolidado numa única coluna)
    const vtyIn = sw.vtyBlocks.filter(v => !v.isCon).map(v => v.transportInput.toLowerCase())
    const accParts: string[] = []
    if (vtyIn.some(s => /\b(ssh|all)\b/.test(s)))    accParts.push('SSH')
    if (vtyIn.some(s => /\b(telnet|all)\b/.test(s))) accParts.push('Telnet')
    if (sw.snmpEnabled)                              accParts.push('SNMP')
    const accStr = accParts.length ? accParts.join(', ') : '—'
    const accWarn = accParts.includes('Telnet')   // Telnet em texto claro = risco

    // DLR — consolidado por coluna
    const dlrRings = [...new Set([...sw.dlrStatus.map(s => s.ring), ...sw.dlrConfig.map(c => c.ring)])].sort((a, b) => a - b)
    const dlrRingStr = dlrRings.length ? dlrRings.join(', ') : '—'
    const dlrModes = [...new Set(sw.dlrConfig.map(c => c.mode))]
    const dlrModeStr = sw.dlrConfig.length ? (dlrModes.length === 1 ? dlrModes[0] : sw.dlrConfig.map(c => `R${c.ring}:${c.mode}`).join(' ')) : '—'
    const dlrIfByRing = new Map<number, string[]>()
    sw.dlrInterfaces.forEach(i => { const a = dlrIfByRing.get(i.ring) ?? []; a.push(i.iface); dlrIfByRing.set(i.ring, a) })
    const dlrIfStr = sw.dlrInterfaces.length
      ? [...dlrIfByRing.entries()].sort((a, b) => a[0] - b[0]).map(([r, ifs]) => `R${r}: ${ifs.join(', ')}`).join(' | ')
      : '—'
    const dlrStatusStr = sw.dlrStatus.length
      ? sw.dlrStatus.map(s => `R${s.ring}: ${s.mode} / ${s.topology} / ${s.status}`).join(' | ')
      : '—'
    const dlrStatusWarn = sw.dlrStatus.some(s => !/normal/i.test(s.status))

    rows.push(xlRow(
      xlCell(sw.hostname),
      xlCell(sw.modelNumber),
      xlCell(sw.firmware),
      xlCell(sw.uptime),
      xlCell(sw.reloadReason),
      xlCell(sw.stpMode),
      xlCell(sw.vtpMode),
      xlCell(sw.ptpMode),
      xlWarnCell(accStr, accWarn),
      xlCell(dlrRingStr),
      xlCell(dlrModeStr),
      xlCell(dlrIfStr),
      xlWarnCell(dlrStatusStr, dlrStatusWarn),
      xlCell(sw.udld),
      cpu ? xlCpuPct(cpu.interrupt, cpu.interrupt > 5) : xlCell('—'),
      cpu ? xlCpuPct(cpu.fiveMin,  false)              : xlCell('—'),
      mem ? xlCpuPct(mem.pct, mem.pct > 80)            : xlCell('—'),
      xlCell(sw.env?.temperature ?? '—'),
      sw.tempAlert && (sw.tempAlert.status === 'HIGH' || sw.tempAlert.status === 'LOW')
        ? xlWarnCell(`${sw.tempAlert.status} (${sw.tempAlert.tempC}°C — limite: ${sw.tempAlert.range.minC}~${sw.tempAlert.range.maxC}°C)`, true)
        : sw.tempAlert?.status === 'OK'
          ? xlWarnCell(`OK (${sw.tempAlert.tempC}°C)`, false)
          : xlCell('—'),
      xlWarnCell(lA, cA === C.red),
      xlWarnCell(lB, cB === C.red),
      // Alertas: laranja quando os únicos alertas são "SFP em atenção" (warn); vermelho
      // quando há qualquer alerta de alarme/falha; verde quando não há alertas.
      (() => {
        const hardAlerts = alerts.filter(a => !a.startsWith('SFP em atenção'))
        const level = alerts.length === 0 ? 'ok' : hardAlerts.length > 0 ? 'alarm' : 'attn'
        return xlAlertCell(alerts.length > 0 ? alerts.join(' | ') : 'OK', level)
      })(),
    ))
  })
  return `<Worksheet ss:Name="Analytics">
    <Table ss:DefaultColumnWidth="130">${rows.join('\n      ')}</Table>
  </Worksheet>`
}

// Extract the interface/port referenced in a log message and normalize it to the canonical
// short form, so the timeline interface filter groups every spelling of a port together:
//   "Interface GigabitEthernet1/8, changed state to up"        → "Gi1/8"
//   "Clear counter on interface Gi1/2"                         → "Gi1/2"
//   "MACFLAP_NOTIF: ... flapping between port Te1/1/2 and ..." → "Te1/1/2"  (first port)
//   "Line protocol on Interface Vlan114, ..."                 → "Vlan114"
// The match anchors on "interface" OR "port" (MACFLAP/SPANTREE messages use "port <if>"
// with the abbreviated name), which the previous version ignored. shortenIface() then
// unifies GigabitEthernet1/2 and Gi1/2 into one filter value. Returns '' when the message
// references no interface (NTP, CONFIG_I, etc.). The token stops at the valid end of an
// interface name so a terminal wrap that merged a following word still yields the port.
function logIface(msg: string): string {
  // 1) Interface referenced after "interface"/"port"/"on"
  //    (LINK/LINEPROTO/MACFLAP/SPANTREE/err-disable messages).
  let m = msg.match(/\b(?:interface|port|on)\s+([A-Za-z][A-Za-z-]*\d[\d/]*)/i)
  // 2) Optical DOM threshold syslogs lead with the port + colon and carry no anchor word
  //    (e.g. "Gi1/1: Rx power low warning; ..."). Match a known interface type at the start.
  if (!m) m = msg.match(new RegExp(`^\\s*((?:${_IFACE_NAMES})\\d[\\d/]*)\\b`, 'i'))
  if (!m) return ''
  // The "on" anchor also matches login lines ("Login Success ... on vty0"); those virtual
  // terminal lines are not physical interfaces, so drop them from the interface filter.
  if (/^(?:vty|tty|con|aux|line)\d/i.test(m[1])) return ''
  return shortenIface(m[1])
}

// ── Timeline worksheet — todos os logs de todos os switches cronologicamente
function buildTimelineWorksheet(switches: SwitchData[]): string {
  const allLogs: LogEntry[] = []
  switches.forEach(sw => {
    const entries: LogEntry[] = ((sw as any)._logEntries ?? []) as LogEntry[]
    entries.forEach(e => allLogs.push(e))
  })
  allLogs.sort((a, b) => a.timestampMs - b.timestampMs)

  if (allLogs.length === 0) return ''

  const rows: string[] = []
  rows.push(xlSectionRow('Linha do Tempo Global — show logging (todos os switches)', 7))
  rows.push(xlRow(
    xlHeader('Timestamp'), xlHeader('Severidade'), xlHeader('Switch'), xlHeader('Interface'),
    xlHeader('Facility'), xlHeader('Mnemonic'), xlHeader('Mensagem'),
  ))
  allLogs.forEach(e => {
    const isCrit = e.severity <= 3
    rows.push(xlRow(
      xlCell(e.timestamp),
      xlWarnCell(`${e.severity} — ${sevLabel(e.severity)}`, isCrit),
      xlCell(e.sourceHostname),
      xlCell(logIface(e.message) || '—'),
      xlCell(e.facility),
      xlCell(e.mnemonic),
      xlCell(e.message),
    ))
  })
  rows.push(`<Row ss:AutoFitHeight="1"/>`)

  // ── Security events sub-section ─────────────────────────────────────────
  const failures = allLogs.filter(e => e.facility === 'SEC_LOGIN' && e.mnemonic === 'LOGIN_FAILED')
  const configs  = allLogs.filter(e => e.facility === 'SYS' && e.mnemonic === 'CONFIG_I')
  if (failures.length > 0 || configs.length > 0) {
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
    rows.push(xlSectionRow(`Auditoria de Segurança — Falhas de Login (${failures.length})`, 4))
    if (failures.length > 0) {
      rows.push(xlRow(xlHeader('Timestamp'), xlHeader('Switch'), xlHeader('Facility-Mnem'), xlHeader('Mensagem')))
      failures.forEach(e => rows.push(xlRow(
        xlCell(e.timestamp), xlCell(e.sourceHostname),
        xlCell(`${e.facility}-${e.mnemonic}`), xlCell(e.message),
      )))
    } else {
      rows.push(xlRow(xlCell('Nenhuma falha de login registrada.'), xlCell(''), xlCell(''), xlCell('')))
    }
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
    rows.push(xlSectionRow(`Auditoria de Segurança — Alterações de Config (${configs.length})`, 4))
    if (configs.length > 0) {
      rows.push(xlRow(xlHeader('Timestamp'), xlHeader('Switch'), xlHeader('Facility-Mnem'), xlHeader('Mensagem')))
      configs.forEach(e => rows.push(xlRow(
        xlCell(e.timestamp), xlCell(e.sourceHostname),
        xlCell(`${e.facility}-${e.mnemonic}`), xlCell(e.message),
      )))
    } else {
      rows.push(xlRow(xlCell('Nenhuma alteração de configuração registrada.'), xlCell(''), xlCell(''), xlCell('')))
    }
  }

  // ── Flapping summary ────────────────────────────────────────────────────
  const flapMap = new Map<string, LogEntry[]>()
  for (const e of allLogs) {
    const isFlap = (e.facility === 'LINK' && e.mnemonic === 'UPDOWN') ||
                   (e.facility === 'LINEPROTO' && e.mnemonic === 'UPDOWN')
    if (!isFlap) continue
    const iface = logIface(e.message)
    if (!iface) continue
    const key = `${e.sourceHostname}::${iface}`
    const arr = flapMap.get(key) ?? []; arr.push(e); flapMap.set(key, arr)
  }
  const flaps: { iface: string; hostname: string; count: number }[] = []
  flapMap.forEach((entries, key) => {
    if (entries.length <= 3) return
    const span = entries[entries.length-1].timestampMs - entries[0].timestampMs
    if (span > 3_600_000) return
    const [hostname, iface] = key.split('::')
    flaps.push({ iface, hostname, count: entries.length })
  })
  if (flaps.length > 0) {
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
    rows.push(xlSectionRow(`Interface Flapping Detectado — ${flaps.length} interface(s)`, 3))
    rows.push(xlRow(xlHeader('Switch'), xlHeader('Interface'), xlHeader('Eventos (< 1h)')))
    flaps.forEach(f => rows.push(xlRow(xlCell(f.hostname), xlCell(f.iface), xlNum(f.count))))
  }

  return `<Worksheet ss:Name="Linha do Tempo">
    <Table ss:DefaultColumnWidth="160">${rows.join('\n      ')}</Table>
  </Worksheet>`
}

// ── Inventário Global de Módulos SFP (todos os switches) ─────────────────────
function buildSfpGlobalWorksheet(switches: SwitchData[]): string {
  const swWithSfp = switches.filter(sw => sw.sfpInventory.length > 0)
  const rows: string[] = []
  rows.push(xlSectionRow('Inventário Global de Módulos SFP', 5))
  if (swWithSfp.length === 0) {
    rows.push(xlRow(xlCell('Nenhum módulo SFP identificado nos arquivos carregados.')))
    return `<Worksheet ss:Name="Inventário SFP Global">
    <Table ss:DefaultColumnWidth="150">${rows.join('\n      ')}</Table>
  </Worksheet>`
  }
  rows.push(xlRow(xlHeader('Switch'), xlHeader('Porta (NAME)'), xlHeader('Descrição (DESCR)'), xlHeader('Modelo (PID)'), xlHeader('S/N')))
  const pidCount = new Map<string, number>()
  let total = 0
  swWithSfp.forEach(sw => sw.sfpInventory.forEach(s => {
    total++
    const k = s.pid || '—'
    pidCount.set(k, (pidCount.get(k) ?? 0) + 1)
    rows.push(xlRow(xlCell(sw.hostname), xlCell(s.port), xlCell(s.descr), xlCell(s.pid), xlCell(s.sn)))
  }))
  rows.push(`<Row ss:AutoFitHeight="1"/>`)
  // Resumo de padronização — total de módulos + contagem por PID.
  rows.push(xlSectionRow(`Resumo — ${total} módulo(s) · ${pidCount.size} PID(s) distinto(s)`, 5))
  rows.push(xlRow(xlHeader('Modelo (PID)'), xlHeader('Quantidade'), xlHeader(''), xlHeader(''), xlHeader('')))
  ;[...pidCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([pid, c]) =>
    rows.push(xlRow(xlCell(pid), xlNum(c), xlCell(''), xlCell(''), xlCell(''))))
  return `<Worksheet ss:Name="Inventário SFP Global">
    <Table ss:DefaultColumnWidth="150">${rows.join('\n      ')}</Table>
  </Worksheet>`
}

// ── Endereços IP por VLAN (todos os switches) ────────────────────────────────
function buildIpVlanWorksheet(switches: SwitchData[]): string {
  const rows: string[] = []
  rows.push(xlSectionRow('Endereços IP por VLAN', 5))
  const all: { host: string; vlan: string; ip: string; mask: string; gw: string }[] = []
  switches.forEach(sw => sw.vlans.forEach(v =>
    all.push({ host: sw.hostname, vlan: v.vlan, ip: v.ip, mask: v.mask, gw: sw.gateway })))
  if (all.length === 0) {
    rows.push(xlRow(xlCell('Nenhum endereço IP por VLAN identificado nos arquivos carregados.')))
    return `<Worksheet ss:Name="IPs por VLAN">
    <Table ss:DefaultColumnWidth="150">${rows.join('\n      ')}</Table>
  </Worksheet>`
  }
  // Conflito de IP: mesmo IP em mais de um switch/VLAN (erro comum de rede).
  const valid = (ip: string) => !!ip && !/^(N\/A|0\.0\.0\.0|—)?$/i.test(ip.trim()) && ip.trim() !== 'N/A'
  const ipCount = new Map<string, number>()
  all.forEach(r => { if (valid(r.ip)) ipCount.set(r.ip, (ipCount.get(r.ip) ?? 0) + 1) })
  // Agrupado por VLAN (ordenadas numericamente) — um bloco por VLAN, com os IPs pertencentes.
  const byVlan = new Map<string, typeof all>()
  all.forEach(r => { const a = byVlan.get(r.vlan) ?? []; a.push(r); byVlan.set(r.vlan, a) })
  const vlanKeys = [...byVlan.keys()].sort((a, b) =>
    ((parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)) || a.localeCompare(b))
  vlanKeys.forEach(vk => {
    const members = byVlan.get(vk)!
    const grpDup = members.some(r => valid(r.ip) && (ipCount.get(r.ip) ?? 0) > 1)
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
    rows.push(xlSectionRow(`VLAN ${vk} — ${members.length} host(s)${grpDup ? '  ⚠ IP duplicado' : ''}`, 5))
    rows.push(xlRow(xlHeader('Switch'), xlHeader('Endereço IP'), xlHeader('Máscara'), xlHeader('Gateway'), xlHeader('')))
    members.forEach(r => {
      const dup = valid(r.ip) && (ipCount.get(r.ip) ?? 0) > 1
      rows.push(xlRow(
        xlCell(r.host), xlWarnCell(r.ip || '—', dup), xlCell(r.mask || '—'), xlCell(r.gw || '—'), xlCell(''),
      ))
    })
  })
  const conflicts = [...ipCount.entries()].filter(([, c]) => c > 1)
  if (conflicts.length > 0) {
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
    rows.push(xlSectionRow(`⚠ IPs duplicados entre switches — ${conflicts.length}`, 5))
    rows.push(xlRow(xlHeader('Endereço IP'), xlHeader('Ocorrências'), xlHeader(''), xlHeader(''), xlHeader('')))
    conflicts.sort((a, b) => b[1] - a[1]).forEach(([ip, c]) =>
      rows.push(xlRow(xlWarnCell(ip, true), xlNum(c), xlCell(''), xlCell(''), xlCell(''))))
  }
  return `<Worksheet ss:Name="IPs por VLAN">
    <Table ss:DefaultColumnWidth="150">${rows.join('\n      ')}</Table>
  </Worksheet>`
}

// ── Transceiver Detail — Diagnóstico Óptico (DOM) Global ──────────────────────
function buildTransceiverWorksheet(switches: SwitchData[]): string {
  const swWithTx = switches.filter(sw => sw.transceivers.length > 0)
  const rows: string[] = []
  rows.push(xlSectionRow('Transceiver Detail — Diagnóstico Óptico (DOM) Global', 9))
  if (swWithTx.length === 0) {
    rows.push(xlRow(xlCell('Nenhum dado de transceiver óptico (DOM) encontrado nos arquivos carregados.')))
    return `<Worksheet ss:Name="Transceiver DOM">
    <Table ss:DefaultColumnWidth="120">${rows.join('\n      ')}</Table>
  </Worksheet>`
  }
  const txMetrics: { key: keyof TransceiverEntry; label: string }[] = [
    { key: 'temperature', label: 'Temperatura (°C)' },
    { key: 'voltage',     label: 'Voltagem (V)' },
    { key: 'current',     label: 'Corrente (mA)' },
    { key: 'txPower',     label: 'Potência Tx (dBm)' },
    { key: 'rxPower',     label: 'Potência Rx (dBm)' },
  ]
  let nAlarm = 0, nWarn = 0
  swWithTx.forEach(sw => sw.transceivers.forEach(tx => txMetrics.forEach(m => {
    const st = txStatus(tx[m.key] as TxMetric | null)
    if (st === 'alarm') nAlarm++; else if (st === 'warn') nWarn++
  })))
  rows.push(xlSectionRow(`Resumo — ${nAlarm} métrica(s) em ALARME · ${nWarn} em ATENÇÃO`, 8))
  // Um bloco por switch (cabeçalho de seção com o hostname + linha em branco), para separar
  // visualmente os dados de cada switch. A coluna Switch sai (fica no cabeçalho do bloco).
  swWithTx.forEach(sw => {
    const swAlarm = sw.transceivers.reduce((s, tx) => s + txMetrics.filter(m => txStatus(tx[m.key] as TxMetric | null) === 'alarm').length, 0)
    const swWarn  = sw.transceivers.reduce((s, tx) => s + txMetrics.filter(m => txStatus(tx[m.key] as TxMetric | null) === 'warn').length, 0)
    rows.push(`<Row ss:AutoFitHeight="1"/>`)
    rows.push(xlSectionRow(`${sw.hostname} — ${swAlarm} alarme(s) · ${swWarn} atenção`, 8))
    rows.push(xlRow(
      xlHeader('Porta'), xlHeader('Métrica'), xlHeader('Valor'),
      xlHeader('High Alarm'), xlHeader('High Warn'), xlHeader('Low Warn'), xlHeader('Low Alarm'),
      xlHeader('Status'),
    ))
    sw.transceivers.forEach(tx => txMetrics.forEach(m => {
      const v = tx[m.key] as TxMetric | null
      if (!v) {   // métrica não reportada pelo transceptor → N/D (não omitir)
        rows.push(xlRow(
          xlCell(tx.port), xlCell(m.label),
          xlCell('N/D'), xlCell('—'), xlCell('—'), xlCell('—'), xlCell('—'),
          xlAlertCell('N/D', 'ok'),
        ))
        return
      }
      const st = txStatus(v)
      const warn = st === 'alarm' || st === 'warn'
      rows.push(xlRow(
        xlCell(tx.port), xlCell(m.label),
        xlWarnCell(String(v.value), warn),
        xlCell(String(v.highAlarm)), xlCell(String(v.highWarn)),
        xlCell(String(v.lowWarn)), xlCell(String(v.lowAlarm)),
        xlAlertCell(st === 'alarm' ? 'ALARME' : st === 'warn' ? 'ATENÇÃO' : 'OK',
          st === 'alarm' ? 'alarm' : st === 'warn' ? 'attn' : 'ok'),
      ))
    }))
  })
  return `<Worksheet ss:Name="Transceiver DOM">
    <Table ss:DefaultColumnWidth="140">${rows.join('\n      ')}</Table>
  </Worksheet>`
}



// ═══════════════════════════════════════════════════════════════════════════
// WORD REPORT EXPORT — generates .docx (OOXML) as zip-of-xml in pure JS
// Uses JSZip-free approach: builds a single flat-file RTF that Word opens.
// For a proper .docx, we generate structured RTF which all versions of Word
// and LibreOffice accept natively without extra npm dependencies.
// ═══════════════════════════════════════════════════════════════════════════
function rtfEscape(s: string): string {
  return (s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/[^\x00-\x7E]/g, (ch) => {
      const code = ch.codePointAt(0)!
      if (code <= 0xFFFF) return `\\u${code}?`
      return '?'
    })
}
function exportToWord(switches: SwitchData[], netIntel: NetIntel) {
  try {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
  const timeStr = now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })

  // ── Palette ────────────────────────────────────────────────────────────
  const CLR = {
    navy: '#1e3a5f', blue: '#2563eb', teal: '#0e7490',
    green: '#15803d', red: '#dc2626', orange: '#b45309',
    gray05: '#f8fafc', gray10: '#f1f5f9', gray20: '#e2e8f0',
    gray50: '#64748b', border: '#cbd5e1',
    white: '#ffffff', black: '#0f172a',
  }

  const esc = (s: string | null | undefined): string =>
    (s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // ── Global stats ───────────────────────────────────────────────────────
  const allHealth   = switches.map(sw => computeHealthScore(sw, (sw as any)._logEntries ?? []))
  const avgScore    = allHealth.length ? Math.round(allHealth.reduce((s, h) => s + h.score, 0) / allHealth.length) : 0
  const critSwCount = allHealth.filter(h => h.status === 'Crítico').length
  const totalCrit   = switches.reduce((s, sw) => s + ((sw as any)._logEntries ?? []).filter((e: any) => e.severity <= 2).length, 0)
  const totalErr    = switches.reduce((s, sw) => s + ((sw as any)._logEntries ?? []).filter((e: any) => e.severity === 3).length, 0)
  const fanFaults   = switches.reduce((s, sw) => s + (sw.catalystEnv?.fans.filter(f => !/^(ok|good)$/i.test(f.status)).length ?? 0), 0)
  const tempFaults  = switches.reduce((s, sw) => {
    if (!sw.catalystEnv) return s
    return s + sw.catalystEnv.temps.filter(t =>
      (t.hotspotValue !== null && t.hotspotRed !== null && t.hotspotValue >= t.hotspotRed) ||
      (t.inletValue   !== null && t.inletRed   !== null && t.inletValue   >= t.inletRed)
    ).length
  }, 0)
  const hasIssues   = critSwCount > 0 || totalCrit > 0 || fanFaults > 0 || tempFaults > 0

  const scoreColor  = (n: number) => n >= 90 ? CLR.green : n >= 70 ? CLR.teal : n >= 45 ? CLR.orange : CLR.red
  const scoreLabel  = (n: number) => n >= 90 ? 'Excelente' : n >= 70 ? 'Bom' : n >= 45 ? 'Regular' : 'Crítico'

  // ── CSS — Word-compatible (no flex/grid/position:absolute) ─────────────
  // IMPORTANT: do NOT use page-break-before on h2/h3 — use explicit <br> tags
  const css = `
    @page Section1 {
      size:A4 portrait;
      margin:2cm 2.2cm 2.4cm 2.2cm;
      mso-header-margin:1.2cm;
      mso-footer-margin:1.0cm;
      mso-header:h1;
      mso-footer:f1;
    }
    div.Section1 { page:Section1; }
    body  { font-family:Calibri,Arial,sans-serif; font-size:9.5pt; color:${CLR.black}; margin:0; }
    h1    { font-size:20pt; color:${CLR.navy}; margin:0 0 4pt; padding-bottom:3pt;
            border-bottom:2pt solid ${CLR.navy}; }
    h2    { font-size:13pt; color:${CLR.navy}; margin:10pt 0 5pt;
            border-left:3.5pt solid ${CLR.blue}; padding-left:7pt; }
    h3    { font-size:10.5pt; color:${CLR.teal}; margin:8pt 0 3pt; }
    h4    { font-size:9pt; color:${CLR.gray50}; margin:6pt 0 2pt; font-weight:600; }
    p     { margin:0 0 4pt; line-height:1.4; }
    table { border-collapse:collapse; width:100%; margin-bottom:5pt; font-size:8.5pt; }
    th    { background:${CLR.navy}; color:${CLR.white}; padding:4pt 6pt;
            text-align:left; font-weight:700; font-size:7.5pt; }
    td    { padding:3pt 6pt; vertical-align:top; border-bottom:0.4pt solid ${CLR.gray20}; }
    tr:nth-child(even) td { background:${CLR.gray05}; }
    .lbl  { background:${CLR.gray10}; font-weight:600; color:${CLR.navy}; font-size:8pt; }
    .warn { color:${CLR.red}; font-weight:700; }
    .ok   { color:${CLR.green}; font-weight:700; }
    .dim  { color:${CLR.gray50}; font-size:8pt; }
    .b    { padding:1pt 5pt; border:0.5pt solid; font-size:7.5pt; font-weight:700; }
    .b-g  { border-color:${CLR.green}; color:${CLR.green}; background:#f0fdf4; }
    .b-r  { border-color:${CLR.red};   color:${CLR.red};   background:#fef2f2; }
    .b-o  { border-color:${CLR.orange};color:${CLR.orange};background:#fffbeb; }
    .b-b  { border-color:${CLR.blue};  color:${CLR.blue};  background:#eff6ff; }
    .b-n  { border-color:${CLR.gray50};color:${CLR.gray50};background:${CLR.gray10}; }
    .box  { background:${CLR.gray05}; border:0.5pt solid ${CLR.border}; padding:5pt 8pt; margin-bottom:5pt; }
    .hdr-lbl { font-size:7.5pt; color:${CLR.gray50}; }
    .hdr-fld { font-size:9pt; font-weight:700; border-bottom:0.5pt solid ${CLR.gray50};
               display:inline-block; min-width:120pt; }
    /* Word TOC styles */
    p.MsoToc1 { margin:3pt 0; font-size:9.5pt; color:${CLR.navy}; font-weight:600;
                mso-style-name:"TOC 1"; tab-stops:right dotted 450pt; }
    p.MsoToc2 { margin:2pt 0 2pt 14pt; font-size:8.5pt; color:${CLR.gray50};
                mso-style-name:"TOC 2"; tab-stops:right dotted 450pt; }
  `

  // ── HTML micro-helpers ─────────────────────────────────────────────────
  const badge = (txt: string, cls: 'g'|'r'|'o'|'b'|'n') =>
    `<span class="b b-${cls}">${esc(txt)}</span>`

  const statusBadge = (v: string) => {
    const l = v.toLowerCase()
    if (l.includes('ok') || l.includes('good') || l === 'normal' || l === 'green') return badge(v, 'g')
    if (l.includes('alarm') || l.includes('critical') || l.includes('fail'))       return badge(v, 'r')
    if (l.includes('yellow') || l.includes('warn'))                                 return badge(v, 'o')
    return badge(v, 'n')
  }

  // Page break — Word-compatible explicit break (NOT CSS on h2)
  const PAGE_BREAK = `<br style="mso-break-type:page-break; page-break-before:always" clear="all">`

  const thRow = (...cols: string[]) =>
    `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>`

  // Two-column label/value table
  const kvTable = (rows: [string, string, boolean?][], w1 = '35%') =>
    `<table><tbody>${rows.map(([k, v, warn]) =>
      `<tr><td class="lbl" style="width:${w1}">${esc(k)}</td><td class="${warn ? 'warn' : ''}">${v}</td></tr>`
    ).join('')}</tbody></table>`

  // ── CPU chart — Word-compatible heatmap timeline ───────────────────────
  // Uses a single-row table where each cell is color-coded by CPU value.
  // This renders correctly in Word without flex/position/height tricks.
  const cpuChart = (pts: CpuPoint[], label: string): string => {
    if (!pts.length) return `<p class="dim">Sem dados de CPU histórico.</p>`

    const peak   = Math.max(...pts.map(p => p.max))
    const avgV   = Math.round(pts.reduce((s, p) => s + p.avg, 0) / pts.length)
    const over50 = pts.filter(p => p.max > 50).length
    const CRIT   = 50

    // Sample to at most 72 points for readability
    const sample = pts.length > 72
      ? pts.filter((_, i) => i % Math.ceil(pts.length / 72) === 0)
      : pts

    // Color each cell: green ≤30, yellow ≤50, orange ≤70, red >70
    const cellColor = (v: number) =>
      v > 70 ? '#dc2626' : v > 50 ? '#f97316' : v > 30 ? '#eab308' : '#16a34a'

    // Heatmap row — each cell is 1 time point; peak cells get a dark border so the reader
    // can see *when* the peaks happened (Word ignores the title tooltip).
    const peakHours = sample.map((p, i) => ({ i, v: p.max })).filter(c => peak > 0 && c.v === peak)
    const cells = sample.map((p, i) => {
      const bg  = cellColor(p.max)
      const isPk = peak > 0 && p.max === peak
      const tip = `h${i}: máx ${p.max}% / méd ${p.avg}%`
      return `<td style="background:${bg};padding:0;border:${isPk ? '0.75pt solid #111827' : 'none'}" title="${esc(tip)}"> </td>`
    }).join('')

    // Hour ruler aligned under the heatmap — labels every ~step columns via colspan so the
    // numbers have room in the fixed table layout.
    const step = Math.max(1, Math.round(sample.length / 9))
    const rulerCells: string[] = []
    for (let i = 0; i < sample.length; i += step) {
      rulerCells.push(`<td colspan="${Math.min(step, sample.length - i)}" style="font-size:6pt;color:${CLR.gray50};border:none;text-align:left;padding:1pt 0">h${i}</td>`)
    }
    const ruler = rulerCells.join('')

    // Peak-hours callout — states exactly which hour buckets hit the maximum.
    const peakList = peakHours.slice(0, 8).map(c => `h${c.i}`).join(', ')
    const peakCallout = peak > 0 && peakHours.length > 0
      ? `<p style="font-size:7.5pt;margin:2pt 0">
           <strong style="color:${peak > CRIT ? CLR.red : CLR.orange}">🔺 Pico ${peak}%</strong>
           em: <strong>${peakList}</strong>${peakHours.length > 8 ? ` (+${peakHours.length - 8})` : ''}
           &nbsp;·&nbsp; <span style="color:${CLR.teal}">Média geral ${avgV}%</span>
           &nbsp;·&nbsp; <span style="color:${over50 > 0 ? CLR.red : CLR.green}">${over50} bucket(s) &gt; ${CRIT}%</span>
         </p>`
      : ''

    // Scale bar table: a horizontal bar chart for peak and avg
    const barPeak = Math.round(peak)
    const barAvg  = Math.round(avgV)
    const barW    = (v: number) => `${Math.min(v, 100)}%`

    return `
    <table style="width:100%;margin-bottom:3pt;font-size:8pt">
      <tr>
        <td style="width:30pt;color:${CLR.gray50}">Pico</td>
        <td style="padding:1pt 2pt;width:180pt">
          <table style="width:100%;height:10pt;border-collapse:collapse;margin:0">
            <tr>
              <td style="background:${peak > CRIT ? CLR.red : CLR.orange};width:${barW(barPeak)};height:10pt;padding:0;border:none"></td>
              <td style="background:${CLR.gray20};padding:0;border:none;height:10pt"></td>
            </tr>
          </table>
        </td>
        <td style="padding-left:4pt;font-weight:700;color:${peak > CRIT ? CLR.red : CLR.orange}">${peak}%</td>
        <td style="width:50pt;text-align:right;color:${CLR.gray50}">${pts.length} ${esc(label)}</td>
      </tr>
      <tr>
        <td style="color:${CLR.gray50}">Média</td>
        <td style="padding:1pt 2pt">
          <table style="width:100%;height:10pt;border-collapse:collapse;margin:0">
            <tr>
              <td style="background:#0e7490;width:${barW(barAvg)};height:10pt;padding:0;border:none"></td>
              <td style="background:${CLR.gray20};padding:0;border:none;height:10pt"></td>
            </tr>
          </table>
        </td>
        <td style="padding-left:4pt;font-weight:700;color:${CLR.teal}">${avgV}%</td>
        <td style="text-align:right;color:${over50 > 0 ? CLR.red : CLR.green}">&gt;${CRIT}%: ${over50}×</td>
      </tr>
    </table>
    <p style="font-size:7pt;color:${CLR.gray50};margin-bottom:2pt">Linha do tempo — cada célula = 1 ${esc(label)} (verde ≤30% / amarelo ≤50% / laranja ≤70% / vermelho &gt;70%). Células com borda preta = pico.</p>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:1pt">
      <tr style="height:10pt">${cells}</tr>
      <tr>${ruler}</tr>
    </table>
    ${peakCallout}`
  }

  // ══════════════════════════════════════════════════════════════════════
  // BUILD DOCUMENT
  // ══════════════════════════════════════════════════════════════════════
  const body: string[] = []

  // ── HEADER and FOOTER definitions (Word mso-element) ──────────────────
  const headerHtml = `
  <div style="mso-element:header" id="h1">
    <table style="width:100%;border-collapse:collapse;font-size:7.5pt;color:${CLR.gray50};border-bottom:0.5pt solid ${CLR.border};margin-bottom:2pt">
      <tr>
        <td style="width:34%;padding:1pt 2pt">
          <span style="font-size:6.5pt;color:${CLR.gray50}">Cliente:</span><br>
          <span style="font-size:8pt;font-weight:700;color:${CLR.navy};border-bottom:0.5pt solid ${CLR.gray50};display:inline-block;min-width:100pt">&nbsp;</span>
        </td>
        <td style="width:33%;padding:1pt 2pt">
          <span style="font-size:6.5pt;color:${CLR.gray50}">Unidade / Site:</span><br>
          <span style="font-size:8pt;font-weight:700;color:${CLR.navy};border-bottom:0.5pt solid ${CLR.gray50};display:inline-block;min-width:100pt">&nbsp;</span>
        </td>
        <td style="width:33%;padding:1pt 2pt;text-align:right">
          <span style="font-size:6.5pt;color:${CLR.gray50}">Data da Auditoria:</span><br>
          <span style="font-size:8pt;font-weight:700;color:${CLR.navy}">
            ${esc(dateStr)}
            &nbsp;&nbsp;Pág.&nbsp;<span style="mso-field-code:&quot;PAGE&quot;"> </span>&nbsp;/&nbsp;<span style="mso-field-code:&quot;NUMPAGES&quot;"> </span>
          </span>
        </td>
      </tr>
    </table>
  </div>`

  const footerHtml = `
  <div style="mso-element:footer" id="f1">
    <table style="width:100%;border-collapse:collapse;font-size:7.5pt;color:${CLR.gray50};border-top:0.5pt solid ${CLR.border};margin-top:2pt">
      <tr>
        <td style="width:38%;padding-top:3pt;vertical-align:bottom">
          <span style="font-size:6.5pt;color:${CLR.gray50}">Responsável Técnico:</span><br>
          <span style="font-size:8pt;font-weight:700;border-bottom:0.5pt solid ${CLR.gray50};display:inline-block;min-width:130pt">&nbsp;</span>
        </td>
        <td style="width:38%;padding-top:3pt;vertical-align:bottom">
          <span style="font-size:6.5pt;color:${CLR.gray50}">Assinatura / Registro Profissional:</span><br>
          <span style="font-size:8pt;font-weight:700;border-bottom:0.5pt solid ${CLR.gray50};display:inline-block;min-width:130pt">&nbsp;</span>
        </td>
        <td style="width:24%;padding-top:3pt;text-align:right;vertical-align:bottom">
          <span style="font-size:7pt;color:${CLR.gray50}">Página&nbsp;</span>
          <span style="font-size:9pt;font-weight:700;color:${CLR.navy};mso-field-code:&quot;PAGE&quot;"> </span>
          <span style="font-size:7pt;color:${CLR.gray50}">&nbsp;de&nbsp;</span>
          <span style="font-size:9pt;font-weight:700;color:${CLR.navy};mso-field-code:&quot;NUMPAGES&quot;"> </span>
        </td>
      </tr>
    </table>
  </div>`

  // ── COVER PAGE ─────────────────────────────────────────────────────────
  body.push(`
  <table style="width:100%;border-collapse:collapse;margin-top:80pt;margin-bottom:30pt">
    <tr>
      <td style="text-align:center;padding:20pt;border:1pt solid ${CLR.border};background:${CLR.gray05}">
        <p style="font-size:22pt;font-weight:700;color:${CLR.navy};margin:0 0 6pt">Relatório de Auditoria Técnica de Rede</p>
        <p style="font-size:12pt;color:${CLR.gray50};margin:0 0 16pt">Switches Cisco Catalyst &amp; Allen-Bradley Stratix</p>
        <table style="width:60%;margin:0 auto;font-size:9pt">
          <tr><td class="lbl" style="width:45%">Data da Extração</td><td>${esc(dateStr)} — ${esc(timeStr)}</td></tr>
          <tr><td class="lbl">Switches Analisados</td><td><strong>${switches.length}</strong></td></tr>
          <tr><td class="lbl">Health Score Médio</td><td><strong style="color:${scoreColor(avgScore)}">${avgScore}/100 — ${esc(scoreLabel(avgScore))}</strong></td></tr>
          <tr><td class="lbl">Gerado por</td><td>Netwatch Analyzer</td></tr>
        </table>
        <p style="font-size:7.5pt;color:${CLR.gray50};margin-top:20pt">
          Documento CONFIDENCIAL — uso restrito ao cliente destinatário.<br>
          Ferramentas: tools.cisco.com/bugsearch | Cisco TAC: 1-800-553-2447
        </p>
      </td>
    </tr>
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt">
    <tr>
      <td style="width:33%;border:0.5pt solid ${CLR.border};padding:8pt 10pt">
        <p class="hdr-lbl" style="margin:0 0 2pt">Cliente / Empresa:</p>
        <p style="margin:0;border-bottom:0.5pt solid ${CLR.gray50};min-height:14pt"> </p>
      </td>
      <td style="width:34%;border:0.5pt solid ${CLR.border};padding:8pt 10pt">
        <p class="hdr-lbl" style="margin:0 0 2pt">Unidade / Site:</p>
        <p style="margin:0;border-bottom:0.5pt solid ${CLR.gray50};min-height:14pt"> </p>
      </td>
      <td style="width:33%;border:0.5pt solid ${CLR.border};padding:8pt 10pt">
        <p class="hdr-lbl" style="margin:0 0 2pt">Data da Auditoria:</p>
        <p style="margin:0;border-bottom:0.5pt solid ${CLR.gray50};min-height:14pt"> </p>
      </td>
    </tr>
  </table>`)

  // ── SUMÁRIO — Word native TOC field + MsoToc styled fallback ───────────
  body.push(PAGE_BREAK)
  body.push(`<h2>Sumário</h2>`)
  // Instruction note for the user
  body.push(`<p style="font-size:8pt;color:${CLR.orange};background:#fffbeb;border:0.5pt solid ${CLR.orange};padding:4pt 8pt;margin-bottom:6pt">
    &#9432; Para atualizar os números de página do sumário, clique com o botão direito nesta área no Word e selecione <strong>"Atualizar Campo"</strong> &gt; <strong>"Atualizar o índice inteiro"</strong>.
  </p>`)
  // Word TOC field — renders as live TOC when opened in Word
  body.push(`<!--[if gte mso 9]>
  <w:sdt>
    <w:sdtPr><w:docPart><w:docPartGallery w:val="Table of Contents"/></w:docPart></w:sdtPr>
    <w:sdtContent>
  <![endif]-->
  <p class="MsoToc1" style="mso-tab-count:1 dotted;tab-stops:right dotted 450pt">
    <!--[if supportFields]><span style="mso-element:field-begin"></span>
    TOC \\o "1-2" \\h \\z \\u
    <span style="mso-element:field-separator"></span><![endif]-->
    <span style="mso-no-proof:yes">
  `)
  // Styled fallback TOC entries (visible when field is empty / non-Word browsers)
  const tocSections = [
    { n: '1.', t: 'Introdução e Contexto Técnico',         cls: 'MsoToc1' },
    { n: '2.', t: 'Resumo Executivo e Ações Imediatas',    cls: 'MsoToc1' },
    { n: '3.', t: 'Tabela Mestra de Ativos',               cls: 'MsoToc1' },
    { n: '4.', t: 'Análise Detalhada por Switch',          cls: 'MsoToc1' },
    ...switches.map((sw, i) => ({ n: `4.${i+1}.`, t: sw.hostname, cls: 'MsoToc2' })),
    { n: '5.', t: 'Inventário Global de Módulos SFP',      cls: 'MsoToc1' },
    { n: '6.', t: 'Endereços IP por VLAN',                 cls: 'MsoToc1' },
    { n: '7.', t: 'Diagnóstico Óptico Global (DOM)',       cls: 'MsoToc1' },
    { n: '8.', t: 'Conclusão e Recomendações',             cls: 'MsoToc1' },
  ]
  body.push(tocSections.map(({ n, t, cls }) =>
    `<p class="${cls}" style="tab-stops:right dotted 450pt">
      <span style="color:${CLR.navy};font-weight:${cls === 'MsoToc1' ? '700' : '400'}">${esc(n)}&nbsp;&nbsp;${esc(t)}</span>
      <span style="mso-tab-count:1 dotted">&nbsp;</span>
      <span style="mso-element:field-begin"></span>PAGEREF _Toc_${n.replace(/[^0-9]/g,'')} \h<span style="mso-element:field-separator"></span>
      <span style="color:${CLR.gray50}">—</span>
      <span style="mso-element:field-end"></span>
    </p>`
  ).join(''))
  body.push(`
    </span>
    <!--[if supportFields]><span style="mso-element:field-end"></span><![endif]-->
  <!--[if gte mso 9]></w:sdtContent></w:sdt><![endif]-->`)

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 1: INTRODUÇÃO
  // ══════════════════════════════════════════════════════════════════════
  body.push(PAGE_BREAK)
  body.push(`<a name="_Toc_1" id="_Toc_1"></a><h2>1. Introdução e Contexto Técnico</h2>
  <p style="text-align:justify">A infraestrutura de redes industriais e corporativas baseada em switches gerenciados — como os da família <strong>Cisco Catalyst</strong> e <strong>Allen-Bradley Stratix</strong> — constitui a espinha dorsal da comunicação entre ativos críticos de produção, sistemas de supervisão SCADA, controladores lógicos programáveis (CLPs) e a camada de TI corporativa. A disponibilidade contínua desses dispositivos (<em>High Availability, HA</em>) é um requisito não negociável em ambientes regidos por padrões como <strong>IEC 62443</strong>, ISA-99 e o modelo Purdue de segurança OT. Qualquer interrupção, mesmo momentânea, pode resultar em parada de linha, perda de produto, risco à segurança operacional e impacto financeiro direto.</p>
  <p style="text-align:justify;margin-top:4pt">Os Cisco Catalyst série 9000 e os Stratix 5700/5800 são projetados com redundância de fontes (1+1), Rapid-PVST+/MST, empilhamento StackWise/VSS e diagnóstico GOLD (<em>Generic Online Diagnostics</em>). Para garantir a continuidade operacional, esses dispositivos devem operar entre <strong>−40 °C e +60/70 °C</strong> (conforme SKU) e umidade relativa de 5%–95% sem condensação. O descumprimento dessas premissas ambientais é uma das principais causas de degradação prematura de componentes, falhas intermitentes e queima de hardware.</p>
  <p style="text-align:justify;margin-top:4pt">A integridade de hardware — FANs, fontes redundantes, módulos SFP e supervisor — é o segundo pilar de continuidade do negócio. FANs desgastados elevam a temperatura interna, acelerando a degradação do ASIC de switching e dos capacitores eletrolíticos. Módulos SFP de terceiros não homologados podem introduzir erros de bit silenciosos sem disparar alarmes imediatos. A auditoria periódica do inventário, cruzada com os boletins de <em>End-of-Life/End-of-Support</em> da Cisco e da Rockwell Automation, é essencial para substituição proativa antes de falhas em produção.</p>
  <p style="text-align:justify;margin-top:4pt">Este relatório consolida a análise automatizada de <strong>${switches.length}</strong> dispositivo(s), coletada em <strong>${esc(dateStr)}</strong> às <strong>${esc(timeStr)}</strong>, com base nos dados extraídos pelo comando <em>show tech-support</em>. São avaliados indicadores de saúde de CPU, memória, ambiente (temperatura, FANs, fontes), configuração de protocolos (STP, NTP, SNMP), inventário de módulos SFP e eventos registrados no buffer de log. O <em>Health Score</em> (0–100) sintetiza esses indicadores em uma métrica executiva objetiva, facilitando a priorização de ações corretivas.</p>`)

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 2: RESUMO EXECUTIVO + AÇÕES IMEDIATAS
  // ══════════════════════════════════════════════════════════════════════
  body.push(PAGE_BREAK)
  body.push(`<a name="_Toc_2" id="_Toc_2"></a><h2>2. Resumo Executivo e Ações Imediatas</h2>
  <p>Análise de <strong>${switches.length}</strong> dispositivo(s) realizada em <strong>${esc(dateStr)} às ${esc(timeStr)}</strong>. Health Score médio: <strong style="color:${scoreColor(avgScore)}">${avgScore}/100 — ${esc(scoreLabel(avgScore))}</strong>. ${critSwCount > 0 ? `<strong style="color:${CLR.red}">${critSwCount} switch(es) em estado CRÍTICO requer(em) atenção imediata.</strong>` : `Todos os dispositivos operam em condições satisfatórias.`}</p>
  <table style="width:100%;border-collapse:collapse;margin:8pt 0;text-align:center;font-size:8.5pt">
    <tr>
      ${[
        { v: avgScore, l: 'Health Score Médio', c: scoreColor(avgScore), u: '/100' },
        { v: critSwCount, l: 'Switches Críticos', c: critSwCount > 0 ? CLR.red : CLR.green, u: '' },
        { v: totalCrit,   l: 'Eventos CRITICAL', c: totalCrit > 0 ? CLR.red : CLR.green, u: '' },
        { v: totalErr,    l: 'Eventos ERROR',    c: totalErr > 0 ? CLR.orange : CLR.green, u: '' },
        { v: fanFaults,   l: 'FANs c/ Falha',   c: fanFaults > 0 ? CLR.red : CLR.green, u: '' },
        { v: tempFaults,  l: 'Alertas Temp.',   c: tempFaults > 0 ? CLR.red : CLR.green, u: '' },
        { v: netIntel.securityEvents.length, l: 'Eventos Seg.',  c: netIntel.securityEvents.length > 0 ? CLR.orange : CLR.green, u: '' },
        { v: netIntel.flapEvents.length,     l: 'Flapping',      c: netIntel.flapEvents.length > 0 ? CLR.orange : CLR.green, u: '' },
      ].map(k =>
        `<td style="border:0.5pt solid ${CLR.border};padding:5pt 3pt;background:${CLR.gray05}">
          <span style="font-size:16pt;font-weight:700;color:${k.c}">${k.v}${esc(k.u)}</span><br>
          <span style="font-size:7pt;color:${CLR.gray50}">${esc(k.l)}</span>
        </td>`
      ).join('')}
    </tr>
  </table>
  <h3>Ações Imediatas Recomendadas</h3>
  <table style="width:100%;font-size:8.5pt">
    <tbody>
    ${[
      critSwCount > 0 || totalCrit > 0
        ? [`🔴 Investigação Urgente`, `${critSwCount} switch(es) crítico(s) com ${totalCrit} evento(s) CRITICAL. Acione Cisco TAC (1-800-553-2447). Use tools.cisco.com/bugsearch para os mnemonics identificados.`]
        : null,
      tempFaults > 0
        ? [`🟠 Adequação Ambiental`, `${tempFaults} alerta(s) de temperatura acima do limiar. Verifique climatização, limpe filtros e dissipadores, corrija fluxo de ar.`]
        : null,
      fanFaults > 0
        ? [`🟠 Substituição de FANs`, `${fanFaults} FAN(s) em falha. Em switches com hot-swap, a substituição pode ser feita sem interrupção de serviço.`]
        : null,
      [`🔵 Ciclo de Vida de Firmware`, `Verifique Security Advisories e boletins de EoSM da Cisco para os modelos em operação. Atualizações devem seguir janela de manutenção com backup via TFTP/SCP.`],
      [`🔵 Hardening de Acesso`, `Switches com Telnet habilitado ou sem NTP configurado representam risco. Aplique Cisco IOS Network Security Hardening (IEC 62443-4-2).`],
      [`🔵 Manutenção Preventiva`, `Auditoria trimestral automatizada, limpeza semestral de hardware, revisão anual do inventário EOL/EOS de todos os ativos.`],
    ].filter((x): x is string[] => x !== null).map(([k, v]) =>
      `<tr><td class="lbl" style="width:28%;font-size:8pt">${esc(k)}</td><td>${esc(v)}</td></tr>`
    ).join('')}
    </tbody>
  </table>`)

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 3: TABELA MESTRA DE ATIVOS
  // ══════════════════════════════════════════════════════════════════════
  body.push(PAGE_BREAK)
  body.push(`<a name="_Toc_3" id="_Toc_3"></a><h2>3. Tabela Mestra de Ativos</h2>
  <p class="dim">Visão consolidada do parque. Linhas coloridas indicam necessidade de ação.</p>
  <table style="font-size:8pt">
    <thead>${thRow('Hostname', 'Modelo', 'IP Gerência', 'Firmware', 'Uptime', 'Score', 'Status')}</thead>
    <tbody>
      ${switches.map((sw, i) => {
        const h  = allHealth[i]
        const sc = scoreColor(h.score)
        const mgmtIP = sw.vlans.length > 0 ? sw.vlans[0].ip : (sw.gateway || 'N/A')
        const rowStyle = h.score < 45 ? `background:#fff1f1` : h.score < 70 ? `background:#fffbeb` : ''
        return `<tr style="${rowStyle}">
          <td><strong>${esc(sw.hostname)}</strong></td>
          <td class="dim">${esc(sw.modelNumber)}</td>
          <td class="dim">${esc(mgmtIP)}</td>
          <td class="dim">${esc(sw.firmware)}</td>
          <td class="dim">${esc(sw.uptime)}</td>
          <td style="font-weight:700;color:${sc}">${h.score}/100</td>
          <td>${badge(h.status, h.score >= 90 ? 'g' : h.score >= 70 ? 'g' : h.score >= 45 ? 'o' : 'r')}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>`)

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 4: PER-SWITCH DETAIL
  // ══════════════════════════════════════════════════════════════════════
  body.push(PAGE_BREAK)
  body.push(`<a name="_Toc_4" id="_Toc_4"></a><h2>4. Análise Detalhada por Switch</h2>`)

  switches.forEach((sw, si) => {
    const swLogs: any[]  = (sw as any)._logEntries ?? []
    const h    = allHealth[si]
    const sc   = scoreColor(h.score)
    // Full detail for every switch — healthy devices are no longer collapsed into a
    // summarised ("slim") block, so the report always shows all sections per switch.
    const slim: boolean = false
    const allBadLogs = swLogs.filter((e: any) => e.severity <= 3)

    // Each switch starts its own paragraph block (not a page-break — saves space)
    const swBreak = si > 0 ? `<p style="margin:0;border-top:1.5pt solid ${CLR.navy};padding-top:8pt"> </p>` : ''

    body.push(`${swBreak}
    <a name="_Toc_4${si+1}" id="_Toc_4${si+1}" style="display:block;height:0"></a>
    <h3>4.${si+1}. ${esc(sw.hostname)}
      <span style="font-weight:normal;color:${CLR.gray50}"> — ${esc(sw.modelNumber)}</span>
      <span style="float:right;font-size:13pt;font-weight:700;color:${sc}">${h.score}/100
        <span style="font-size:8pt;font-weight:400"> ${esc(h.status)}</span>
      </span>
    </h3>`)

    if (slim) {
      // ── SLIM MODE ──────────────────────────────────────────────────────
      body.push(`<p style="color:${CLR.green};font-size:8.5pt;margin:2pt 0">✓ Dispositivo operando dentro dos parâmetros esperados. Configuração e inventário em conformidade.</p>`)
      body.push(`<table style="font-size:8pt">
        <tr><td class="lbl" style="width:22%">Firmware</td><td style="width:28%">${esc(sw.firmware)}</td>
            <td class="lbl" style="width:22%">Uptime</td><td>${esc(sw.uptime)}</td></tr>
        <tr><td class="lbl">Reload</td><td>${esc(sw.reloadReason)}</td>
            <td class="lbl">STP / VTP</td><td>${esc(sw.stpMode)} / ${esc(sw.vtpMode)}</td></tr>
        <tr><td class="lbl">CPU (5s/1m/5m)</td>
            <td>${sw.cpuNow ? `${sw.cpuNow.fiveSec}% / ${sw.cpuNow.oneMin}% / ${sw.cpuNow.fiveMin}%` : 'N/A'}</td>
            <td class="lbl">Memória</td><td>${sw.memory ? `${sw.memory.pct}%` : 'N/A'}</td></tr>
      </table>`)
      if (sw.cpuHour.length > 0) {
        body.push(`<p style="font-size:8pt;color:${CLR.gray50};margin:4pt 0 2pt">CPU 72h</p>`)
        body.push(cpuChart(sw.cpuHour, 'h'))
      }
    } else {
      // ── FULL DETAIL MODE ───────────────────────────────────────────────

      // Device info — 2×2 compact
      body.push(`<h4>Informações do Dispositivo</h4>`)
      body.push(`<table style="font-size:8.5pt">
        <tr><td class="lbl" style="width:19%">Hostname</td><td style="width:30%">${esc(sw.hostname)}</td>
            <td class="lbl" style="width:19%">Modelo</td><td>${esc(sw.modelNumber)}</td></tr>
        <tr><td class="lbl">Firmware</td><td>${esc(sw.firmware)}</td>
            <td class="lbl">Uptime</td><td>${esc(sw.uptime)}</td></tr>
        <tr><td class="lbl">Último Reload</td><td>${esc(sw.reloadReason)}</td>
            <td class="lbl">Hora (clock)</td><td>${esc(sw.clockTime)}</td></tr>
        <tr><td class="lbl">STP Mode</td><td>${esc(sw.stpMode)}</td>
            <td class="lbl">VTP Mode</td><td>${esc(sw.vtpMode)}</td></tr>
        <tr><td class="lbl">PTP Mode</td><td>${esc(sw.ptpMode)}</td>
            <td class="lbl">CPU / Mem</td>
            <td class="${sw.cpuNow && sw.cpuNow.fiveSec > 50 ? 'warn' : ''}">${sw.cpuNow ? `${sw.cpuNow.fiveSec}%` : 'N/A'} / ${sw.memory ? `${sw.memory.pct}%` : 'N/A'}</td></tr>
      </table>`)

      // Health factors
      body.push(`<h4>Fatores de Saúde</h4>`)
      body.push(`<table style="font-size:8.5pt">
        <thead>${thRow('Fator', 'Resultado')}</thead>
        <tbody>${h.factors.map(f =>
          `<tr><td>${esc(f.label)}</td><td class="${f.ok ? 'ok' : 'warn'}">${f.ok ? '✓' : '✗'} ${esc(f.detail)}</td></tr>`
        ).join('')}</tbody>
      </table>`)

      // Environment
      body.push(`<h4>Ambiente e Infraestrutura</h4>`)
      if (sw.catalystEnv) {
        if (sw.catalystEnv.temps.length > 0) {
          body.push(`<table style="font-size:8pt">
            <thead>${thRow('SW', 'Inlet °C', 'Lim.Inlet', 'Hotspot °C', 'Lim.HS', 'Status')}</thead>
            <tbody>${sw.catalystEnv.temps.map(t => {
              const hw = t.hotspotValue !== null && t.hotspotRed !== null && t.hotspotValue >= t.hotspotRed
              const iw = t.inletValue   !== null && t.inletRed   !== null && t.inletValue   >= t.inletRed
              return `<tr>
                <td><strong>${esc(t.switchId)}</strong></td>
                <td class="${iw ? 'warn' : 'ok'}">${t.inletValue ?? '—'}°C</td>
                <td class="dim">${t.inletRed ?? '—'}°C</td>
                <td class="${hw ? 'warn' : 'ok'}">${t.hotspotValue ?? '—'}°C</td>
                <td class="dim">${t.hotspotRed ?? '—'}°C</td>
                <td>${statusBadge(hw || iw ? 'ALERTA' : t.systemStatus)}</td>
              </tr>`
            }).join('')}</tbody>
          </table>`)
        }
        const failFans = sw.catalystEnv.fans.filter(f => !/^(ok|good)$/i.test(f.status))
        if (failFans.length > 0) {
          body.push(`<p class="warn" style="font-size:8.5pt;margin:3pt 0">⚠ FANs com falha: ${failFans.map(f => `${esc(f.name)} (${esc(f.status)})`).join(', ')}</p>`)
        } else if (sw.catalystEnv.fans.length > 0) {
          body.push(`<p style="color:${CLR.green};font-size:8pt;margin:2pt 0">✓ Todos os ${sw.catalystEnv.fans.length} FANs operando normalmente.</p>`)
        }
        if (sw.catalystEnv.powerSupplies.length > 0) {
          body.push(`<table style="font-size:8pt">
            <thead>${thRow('Slot', 'Modelo (PID)', 'Status', 'Sys Pwr', 'PoE Pwr', 'Watts')}</thead>
            <tbody>${sw.catalystEnv.powerSupplies.map(ps =>
              `<tr><td><strong>${esc(ps.slot)}</strong></td><td class="dim">${esc(ps.pid)}</td>
               <td>${statusBadge(ps.status)}</td><td>${statusBadge(ps.sysPwr)}</td>
               <td>${statusBadge(ps.poePwr)}</td><td><strong>${esc(String(ps.watts))}W</strong></td></tr>`
            ).join('')}</tbody>
          </table>`)
        }
      } else if (sw.env) {
        body.push(kvTable([
          ['Temperatura',    statusBadge(sw.env.temperature)],
          ['Power Supply A', statusBadge(sw.env.powerA)],
          ['Power Supply B', statusBadge(sw.env.powerB)],
        ]))
      } else {
        body.push(`<p class="dim">Dados de ambiente não disponíveis.</p>`)
      }

      // Configuration — with SSH/Telnet/SNMP access
      const vtyIn_ = sw.vtyBlocks.filter(v => !v.isCon).map(v => v.transportInput.toLowerCase())
      const hasSsh_    = vtyIn_.length === 0 || vtyIn_.some(s => /\b(ssh|all)\b/.test(s))
      const hasTelnet_ = vtyIn_.length === 0 || vtyIn_.some(s => /\b(telnet|all)\b/.test(s))
      body.push(`<h4>Configuração</h4>`)
      body.push(kvTable([
        ['STP Mode',   esc(sw.stpMode)],
        ['VTP Mode',   esc(sw.vtpMode)],
        ['UDLD',       /disable/i.test(sw.udld) ? badge('disabled', 'n') : badge(esc(sw.udld), 'g')],
        ['SSH',        hasSsh_    ? badge('Habilitado', 'g') : badge('Desabilitado', 'n')],
        ['Telnet',     hasTelnet_ ? badge('ATENÇÃO — Habilitado', 'r') : badge('Desabilitado', 'g')],
        ['SNMP',       sw.snmpEnabled
          ? `${badge('Habilitado', 'g')} — RO: ${esc(sw.snmpCommunityRo || 'N/A')} | RW: ${esc(sw.snmpCommunityRw || 'N/A')}`
          : badge('Desabilitado', 'n')],
        ['Usuários',   (sw.usernames ?? []).length > 0 ? esc((sw.usernames ?? []).join(', ')) : 'N/A'],
        ['NTP',        (sw.ntpServers ?? []).length > 0
          ? esc((sw.ntpServers ?? []).map(n => n.address + (n.preferred ? ' ★' : '')).join(', '))
          : badge('Não configurado', 'o')],
      ]))

      // DLR (Device Level Ring)
      if (sw.dlrStatus.length > 0 || sw.dlrConfig.length > 0) {
        const dlrRings = [...new Set([...sw.dlrStatus.map(s => s.ring), ...sw.dlrConfig.map(c => c.ring)])].sort((a, b) => a - b)
        body.push(`<h4>DLR — Device Level Ring</h4>`)
        body.push(`<table style="font-size:7.5pt">
          <thead>${thRow('Ring', 'Mode (cfg)', 'Mode (runtime)', 'Status', 'Sup. IP', 'Sup. Ativo IP', 'Port1 / Port2', 'Beacon (µs)', 'Prec.', 'Part.', 'Faults', 'Última Falha')}</thead>
          <tbody>${dlrRings.map(ring => {
            const st  = sw.dlrStatus.find(s => s.ring === ring)
            const cfg = sw.dlrConfig.find(c => c.ring === ring)
            const stOk = !st || /normal/i.test(st.status)
            const fmtP = (p: DlrPort | null) => p ? `${p.name} (${p.vlan}/${p.state})` : '—'
            return `<tr>
              <td><strong>${ring}</strong></td>
              <td class="dim">${esc(cfg ? cfg.mode : 'N/A')}</td>
              <td>${esc(st ? st.mode : 'N/A')}</td>
              <td class="${stOk ? 'ok' : 'warn'}">${esc(st ? st.status : 'N/A')}</td>
              <td class="dim">${esc(st ? st.supervisorIp : 'N/A')}</td>
              <td class="dim">${esc(st ? st.activeSupervisorIp : 'N/A')}</td>
              <td class="dim">${esc(st ? `${fmtP(st.port1)} / ${fmtP(st.port2)}` : 'N/A')}</td>
              <td class="dim">${esc(st ? `${st.beaconInterval}/${st.beaconTimeout}` : 'N/A')}</td>
              <td class="dim">${esc(st ? st.precedence : 'N/A')}</td>
              <td>${st && st.participants !== null ? st.participants : '—'}</td>
              <td class="${st && st.ringFaults ? 'warn' : 'dim'}">${st && st.ringFaults !== null ? st.ringFaults : '—'}</td>
              <td class="dim">${esc(st && st.lastFaultTime !== 'N/A' ? st.lastFaultTime : '—')}</td>
            </tr>`
          }).join('')}</tbody>
        </table>`)
        // Interfaces por anel (config)
        const dlrIfLines = dlrRings.map(ring => {
          const ifs = sw.dlrInterfaces.filter(i => i.ring === ring).map(i => i.iface).join(', ')
          return ifs ? `Ring ${ring}: ${ifs}` : ''
        }).filter(Boolean)
        if (dlrIfLines.length > 0) {
          body.push(`<p style="font-size:7.5pt;margin:2pt 0"><span class="dim">Interfaces DLR (config):</span> ${esc(dlrIfLines.join('  ·  '))}</p>`)
        }
      }

      // Network
      if (sw.vlans.length > 0) {
        body.push(`<h4>Redes — Gateway: ${esc(sw.gateway || 'N/A')}</h4>`)
        body.push(`<table style="font-size:8pt">
          <thead>${thRow('VLAN', 'Endereço IP', 'Máscara')}</thead>
          <tbody>${sw.vlans.map(v =>
            `<tr><td>${esc(`VLAN ${v.vlan}`)}</td><td>${esc(v.ip)}</td><td class="dim">${esc(v.mask)}</td></tr>`
          ).join('')}</tbody>
        </table>`)
      }

      // Interfaces status
      if (sw.interfaceStatus.length > 0) {
        const counts: Record<string, number> = {}
        sw.interfaceStatus.forEach(p => {
          const k = (p.status || '—').toLowerCase()
          counts[k] = (counts[k] ?? 0) + 1
        })
        const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')
        body.push(`<h4>Interfaces — show interfaces status <span style="font-weight:normal;color:${CLR.gray50};font-size:8pt">(${esc(summary)})</span></h4>`)
        body.push(`<table style="font-size:8pt">
          <thead>${thRow('Porta', 'Nome/Descrição', 'Status', 'VLAN', 'Duplex', 'Speed', 'Tipo')}</thead>
          <tbody>${sw.interfaceStatus.map(p => {
            const s = (p.status || '').toLowerCase()
            const cls = s === 'connected' ? 'ok'
                      : (s.includes('err-disable') || s === 'disabled') ? 'warn' : 'dim'
            return `<tr><td><strong>${esc(p.port)}</strong></td><td>${esc(p.name || '—')}</td>
              <td class="${cls}">${esc(p.status || '—')}</td><td class="dim">${esc(p.vlan)}</td>
              <td class="dim">${esc(p.duplex)}</td><td class="dim">${esc(p.speed)}</td><td class="dim">${esc(p.type)}</td></tr>`
          }).join('')}</tbody>
        </table>`)
      }

      // Transceiver Detail (DOM óptico) — espelha o Excel/software, logo após interfaces
      if (sw.transceivers.length > 0) {
        const txMetricsW: { key: keyof TransceiverEntry; label: string }[] = [
          { key: 'temperature', label: 'Temperatura (°C)' },
          { key: 'voltage',     label: 'Voltagem (V)' },
          { key: 'current',     label: 'Corrente (mA)' },
          { key: 'txPower',     label: 'Potência Tx (dBm)' },
          { key: 'rxPower',     label: 'Potência Rx (dBm)' },
        ]
        const txRows: string[] = []
        sw.transceivers.forEach(tx => {
          const portAlarm = txMetricsW.some(m => txStatus(tx[m.key] as TxMetric | null) === 'alarm')
          txMetricsW.forEach(m => {
            const v = tx[m.key] as TxMetric | null
            if (!v) {   // métrica não reportada pelo transceptor → N/D (não omitir)
              txRows.push(`<tr${portAlarm ? ' style="background:#fff1f1"' : ''}>
                <td><strong>${esc(tx.port)}</strong></td><td class="dim">${esc(m.label)}</td>
                <td class="dim">N/D</td>
                <td class="dim">—</td><td class="dim">—</td>
                <td class="dim">—</td><td class="dim">—</td>
                <td class="dim">N/D</td></tr>`)
              return
            }
            const st = txStatus(v)
            const cls = st === 'alarm' ? 'warn' : st === 'warn' ? 'warn' : 'ok'
            const lbl = st === 'alarm' ? 'ALARME' : st === 'warn' ? 'ATENÇÃO' : 'OK'
            txRows.push(`<tr${portAlarm ? ' style="background:#fff1f1"' : ''}>
              <td><strong>${esc(tx.port)}</strong></td><td class="dim">${esc(m.label)}</td>
              <td class="${st === 'ok' ? '' : 'warn'}">${esc(String(v.value))}</td>
              <td class="dim">${esc(String(v.highAlarm))}</td><td class="dim">${esc(String(v.highWarn))}</td>
              <td class="dim">${esc(String(v.lowWarn))}</td><td class="dim">${esc(String(v.lowAlarm))}</td>
              <td class="${cls}">${lbl}</td></tr>`)
          })
        })
        body.push(`<h4>Transceiver Detail — Diagnóstico Óptico (DOM)</h4>`)
        body.push(`<table style="font-size:7.5pt">
          <thead>${thRow('Porta', 'Métrica', 'Valor', 'High Alarm', 'High Warn', 'Low Warn', 'Low Alarm', 'Status')}</thead>
          <tbody>${txRows.join('')}</tbody>
        </table>`)
      }

      // CPU chart
      body.push(`<h4>Histórico de CPU — 72h</h4>`)
      body.push(sw.cpuHour.length > 0 ? cpuChart(sw.cpuHour, 'horas') : `<p class="dim">Sem dados.</p>`)

      // Critical logs (grouped)
      if (allBadLogs.length > 0) {
        const critSw = swLogs.filter((e: any) => e.severity <= 2)
        const errSw  = swLogs.filter((e: any) => e.severity === 3)
        type LG = { facility: string; mnemonic: string; count: number; severity: number }
        const grps: Record<string, LG> = {}
        allBadLogs.forEach((e: any) => {
          const k = `${e.facility}-${e.mnemonic}`
          if (!grps[k]) grps[k] = { facility: e.facility, mnemonic: e.mnemonic, count: 0, severity: e.severity }
          grps[k].count++
        })
        const grpList = Object.values(grps).sort((a, b) => a.severity - b.severity || b.count - a.count)
        body.push(`<h4>Eventos Críticos e Erros — ${critSw.length} CRITICAL + ${errSw.length} ERROR</h4>`)
        body.push(`<table style="font-size:8pt">
          <thead>${thRow('Sev', 'Evento', 'Ocorr.', 'Ação Recomendada')}</thead>
          <tbody>${grpList.slice(0, 12).map(g => {
            const kbKey = `${g.facility}-${g.mnemonic}`
            const kb  = (CISCO_KB as any)[kbKey] ?? Object.entries(CISCO_KB).find(([k]) => kbKey.startsWith(k))?.[1]
            const act = kb ? (kb as any).actions[0] : 'Consultar Cisco Bug Toolkit'
            return `<tr>
              <td>${badge(`${g.severity} ${sevLabel(g.severity)}`, g.severity <= 2 ? 'r' : 'o')}</td>
              <td><strong>%${esc(g.facility)}-${g.severity}-${esc(g.mnemonic)}</strong></td>
              <td style="text-align:center"><strong>${g.count}</strong></td>
              <td class="dim">${esc(act)}</td>
            </tr>`
          }).join('')}
          ${grpList.length > 12 ? `<tr><td colspan="4" class="dim">… e mais ${grpList.length - 12} tipo(s)</td></tr>` : ''}
          </tbody>
        </table>`)
      }

      // MAC Addresses total
      if (sw.totalMacAddresses !== null) {
        body.push(`<table style="font-size:8.5pt;width:auto;margin-bottom:5pt">
          <tr>
            <td class="lbl" style="width:220pt;background:#eff6ff;color:#1e3a5f;border:0.5pt solid #cbd5e1;padding:4pt 8pt">
              Total de Endereços MAC Registrados
            </td>
            <td style="border:0.5pt solid #cbd5e1;padding:4pt 12pt;font-weight:700;font-size:11pt;color:#1e3a5f">
              ${sw.totalMacAddresses}
            </td>
          </tr>
        </table>`)
      }

      // SFP — only for score < 90, font explicitly 8pt
      if (sw.sfpInventory.length > 0 && h.score < 90) {
        body.push(`<h4>Inventário SFP</h4>`)
        body.push(`<table style="font-size:8pt">
          <thead>${thRow('Porta', 'Descrição', 'PID', 'S/N')}</thead>
          <tbody>${sw.sfpInventory.map(s =>
            `<tr><td style="font-size:8pt">${esc(s.port)}</td>
             <td class="dim" style="font-size:8pt">${esc(s.descr)}</td>
             <td class="dim" style="font-size:8pt">${esc(s.pid)}</td>
             <td class="dim" style="font-size:8pt">${esc(s.sn)}</td></tr>`
          ).join('')}</tbody>
        </table>`)
      }
    }
  })

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 5: SFP GLOBAL
  // ══════════════════════════════════════════════════════════════════════
  const swWithSfp = switches.filter(sw => sw.sfpInventory.length > 0)
  body.push(PAGE_BREAK)
  body.push(`<a name="_Toc_5" id="_Toc_5"></a><h2>5. Inventário Global de Módulos SFP</h2>`)
  if (swWithSfp.length === 0) {
    body.push(`<p class="dim">Nenhum módulo SFP identificado nos arquivos carregados.</p>`)
  } else {
    swWithSfp.forEach(sw => {
      body.push(`<h3>${esc(sw.hostname)}</h3>`)
      body.push(`<table style="font-size:8pt">
        <thead>${thRow('Porta', 'Descrição', 'Modelo (PID)', 'S/N')}</thead>
        <tbody>${sw.sfpInventory.map(s =>
          `<tr><td style="font-size:8pt">${esc(s.port)}</td>
           <td class="dim" style="font-size:8pt">${esc(s.descr)}</td>
           <td class="dim" style="font-size:8pt">${esc(s.pid)}</td>
           <td class="dim" style="font-size:8pt">${esc(s.sn)}</td></tr>`
        ).join('')}</tbody>
      </table>`)
    })
  }

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 6: ENDEREÇOS IP POR VLAN (global)
  // ══════════════════════════════════════════════════════════════════════
  body.push(PAGE_BREAK)
  body.push(`<a name="_Toc_6" id="_Toc_6"></a><h2>6. Endereços IP por VLAN</h2>`)
  {
    const allIp = switches.flatMap(sw => sw.vlans.map(v => ({
      host: sw.hostname, vlan: v.vlan, ip: v.ip, mask: v.mask, gw: sw.gateway,
    })))
    const validIp = (ip: string) => !!ip && ip.trim() !== '' && ip.trim() !== 'N/A' && ip.trim() !== '0.0.0.0' && ip.trim() !== '—'
    const ipCount = new Map<string, number>()
    allIp.forEach(r => { if (validIp(r.ip)) ipCount.set(r.ip, (ipCount.get(r.ip) ?? 0) + 1) })
    const conflicts = [...ipCount.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1])
    if (allIp.length === 0) {
      body.push(`<p class="dim">Nenhum endereço IP por VLAN (SVI) identificado nos arquivos carregados.</p>`)
    } else {
      if (conflicts.length > 0) {
        body.push(`<p class="warn" style="font-size:8.5pt;margin:3pt 0">⚠ ${conflicts.length} endereço(s) IP duplicado(s) entre switches: ${esc(conflicts.map(([ip, c]) => `${ip} (${c}×)`).join('  ·  '))}</p>`)
      }
      // Agrupado por VLAN (ordenadas numericamente) — os IPs de cada VLAN ficam juntos.
      const byVlan = new Map<string, typeof allIp>()
      allIp.forEach(r => { const a = byVlan.get(r.vlan) ?? []; a.push(r); byVlan.set(r.vlan, a) })
      const vlanKeys = [...byVlan.keys()].sort((a, b) =>
        ((parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)) || a.localeCompare(b))
      vlanKeys.forEach(vk => {
        const members = byVlan.get(vk)!
        const grpDup = members.some(r => validIp(r.ip) && (ipCount.get(r.ip) ?? 0) > 1)
        body.push(`<h3 style="margin:6pt 0 2pt">VLAN ${esc(vk)}
          <span style="font-weight:normal;color:${CLR.gray50};font-size:9pt"> — ${members.length} host(s)</span>
          ${grpDup ? `<span class="warn" style="font-size:9pt"> ⚠ IP duplicado</span>` : ''}
        </h3>`)
        body.push(`<table style="font-size:8pt">
          <thead>${thRow('Switch', 'Endereço IP', 'Máscara', 'Gateway')}</thead>
          <tbody>${members.map(r => {
            const dup = validIp(r.ip) && (ipCount.get(r.ip) ?? 0) > 1
            return `<tr>
              <td><strong>${esc(r.host)}</strong></td>
              <td class="${dup ? 'warn' : ''}">${esc(r.ip || '—')}${dup ? ' ⚠' : ''}</td>
              <td class="dim">${esc(r.mask || '—')}</td>
              <td class="dim">${esc(r.gw || '—')}</td>
            </tr>`
          }).join('')}</tbody>
        </table>`)
      })
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 7: DIAGNÓSTICO ÓPTICO GLOBAL (DOM)
  // ══════════════════════════════════════════════════════════════════════
  body.push(PAGE_BREAK)
  body.push(`<a name="_Toc_7" id="_Toc_7"></a><h2>7. Diagnóstico Óptico Global — Transceiver Detail (DOM)</h2>`)
  {
    const swWithTx = switches.filter(sw => sw.transceivers.length > 0)
    if (swWithTx.length === 0) {
      body.push(`<p class="dim">Nenhum dado de transceiver óptico (DOM) encontrado nos arquivos carregados.</p>`)
    } else {
      const txMetricsG: { key: keyof TransceiverEntry; label: string }[] = [
        { key: 'temperature', label: 'Temperatura (°C)' },
        { key: 'voltage',     label: 'Voltagem (V)' },
        { key: 'current',     label: 'Corrente (mA)' },
        { key: 'txPower',     label: 'Potência Tx (dBm)' },
        { key: 'rxPower',     label: 'Potência Rx (dBm)' },
      ]
      let nAlarm = 0, nWarn = 0
      swWithTx.forEach(sw => sw.transceivers.forEach(tx => txMetricsG.forEach(m => {
        const st = txStatus(tx[m.key] as TxMetric | null)
        if (st === 'alarm') nAlarm++; else if (st === 'warn') nWarn++
      })))
      body.push(`<p style="font-size:8.5pt;margin:2pt 0">Resumo: <strong style="color:${nAlarm > 0 ? CLR.red : CLR.green}">${nAlarm} métrica(s) em ALARME</strong> · <strong style="color:${nWarn > 0 ? CLR.orange : CLR.green}">${nWarn} em ATENÇÃO</strong>.</p>`)
      // Um bloco por switch (mesmo formato do Inventário Global de SFP) — legível por switch,
      // sem a coluna Switch (redundante sob o h3) e com mini-resumo das portas em alerta.
      swWithTx.forEach(sw => {
        const portAlarms = sw.transceivers
          .map(tx => ({ port: tx.port, n: txMetricsG.filter(m => txStatus(tx[m.key] as TxMetric | null) === 'alarm').length }))
          .filter(p => p.n > 0)
        const portWarns = sw.transceivers
          .map(tx => ({ port: tx.port, n: txMetricsG.filter(m => txStatus(tx[m.key] as TxMetric | null) === 'warn').length }))
          .filter(p => p.n > 0)
        const miniParts: string[] = []
        if (portAlarms.length) miniParts.push(`<span class="warn">Alarme: ${esc(portAlarms.map(p => `${p.port} (${p.n})`).join(', '))}</span>`)
        if (portWarns.length)  miniParts.push(`<span style="color:${CLR.orange}">Atenção: ${esc(portWarns.map(p => `${p.port} (${p.n})`).join(', '))}</span>`)
        body.push(`<h3>${esc(sw.hostname)}</h3>`)
        if (miniParts.length) body.push(`<p style="font-size:8pt;margin:1pt 0 3pt">${miniParts.join('  ·  ')}</p>`)
        body.push(`<table style="font-size:8pt">
          <thead>${thRow('Porta', 'Métrica', 'Valor', 'High Alarm', 'High Warn', 'Low Warn', 'Low Alarm', 'Status')}</thead>
          <tbody>${sw.transceivers.flatMap(tx => {
            const portAlarm = txMetricsG.some(m => txStatus(tx[m.key] as TxMetric | null) === 'alarm')
            return txMetricsG.map(m => {
              const v = tx[m.key] as TxMetric | null
              if (!v) {   // métrica não reportada pelo transceptor → N/D (não omitir)
                return `<tr${portAlarm ? ' style="background:#fff1f1"' : ''}>
                  <td><strong>${esc(tx.port)}</strong></td>
                  <td class="dim">${esc(m.label)}</td>
                  <td class="dim">N/D</td>
                  <td class="dim">—</td><td class="dim">—</td>
                  <td class="dim">—</td><td class="dim">—</td>
                  <td class="dim">N/D</td></tr>`
              }
              const st = txStatus(v)
              const lbl = st === 'alarm' ? 'ALARME' : st === 'warn' ? 'ATENÇÃO' : 'OK'
              return `<tr${portAlarm ? ' style="background:#fff1f1"' : ''}>
                <td><strong>${esc(tx.port)}</strong></td>
                <td class="dim">${esc(m.label)}</td>
                <td class="${st === 'ok' ? '' : 'warn'}">${esc(String(v.value))}</td>
                <td class="dim">${esc(String(v.highAlarm))}</td><td class="dim">${esc(String(v.highWarn))}</td>
                <td class="dim">${esc(String(v.lowWarn))}</td><td class="dim">${esc(String(v.lowAlarm))}</td>
                <td class="${st === 'ok' ? 'ok' : 'warn'}">${lbl}</td></tr>`
            }).join('')
          }).join('')}</tbody>
        </table>`)
      })
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 8: CONCLUSÃO E RECOMENDAÇÕES (dense, dissertative)
  // ══════════════════════════════════════════════════════════════════════
  body.push(PAGE_BREAK)
  body.push(`<a name="_Toc_8" id="_Toc_8"></a><h2>8. Conclusão e Recomendações</h2>`)

  const conclusionText = hasIssues
    ? `Com base na análise técnica realizada em <strong>${esc(dateStr)}</strong>, a infraestrutura de rede avaliada apresenta condições que demandam intervenção técnica imediata e planejamento preventivo estruturado. Foram identificados <strong>${critSwCount}</strong> dispositivo(s) em estado crítico, <strong>${totalCrit}</strong> evento(s) de severidade CRITICAL nos buffers de log e <strong>${tempFaults}</strong> alerta(s) de temperatura operacional acima dos limiares configurados pelo fabricante. Esses indicadores, isoladamente, já constituem fatores de risco para a continuidade operacional; em conjunto, elevam exponencialmente a probabilidade de um <em>Downtime</em> não planejado.`
    : `Com base na análise técnica realizada em <strong>${esc(dateStr)}</strong>, a infraestrutura de rede avaliada apresenta condições operacionais satisfatórias. O Health Score médio de <strong>${avgScore}/100</strong> (${esc(scoreLabel(avgScore))}) indica que os ${switches.length} dispositivos analisados operam dentro dos parâmetros especificados pelo fabricante. Não obstante os resultados positivos, a manutenção da disponibilidade de uma rede industrial requer atenção contínua a aspectos que, quando negligenciados, podem comprometer silenciosamente a integridade da infraestrutura.`

  body.push(`<p style="text-align:justify">${conclusionText}</p>`)

  if (hasIssues) {
    body.push(`<p style="text-align:justify;margin-top:5pt">Uma parada não planejada de switch em ambiente industrial pode interromper a comunicação entre CLPs, desabilitar sistemas de supervisão SCADA e paralisar linhas de produção inteiras por horas ou dias — a depender da disponibilidade de sobressalentes e da capacidade de resposta da equipe técnica. Em ambientes de manufatura contínua, o impacto financeiro de uma parada pode superar dezenas de milhares de reais por hora, sem contabilizar os custos indiretos relacionados à qualidade do produto, ao retrabalho operacional e às penalidades contratuais com clientes.</p>`)
  }

  body.push(`<p style="text-align:justify;margin-top:5pt">Do ponto de vista do <strong>ciclo de vida de hardware e software</strong>, recomenda-se verificar periodicamente os boletins de <em>End-of-Life</em> (EoL) e <em>End-of-Software-Maintenance</em> (EoSM) publicados pela Cisco (cisco.com/go/eol) e pela Rockwell Automation. Equipamentos fora do suporte oficial não recebem atualizações de segurança (CVEs), correções de bugs críticos ou suporte técnico expedito — o que representa risco regulatório e operacional crescente ao longo do tempo. O processo de atualização de firmware deve ser executado em janela de manutenção planejada, com backup prévio da configuração em repositório seguro (TFTP, SCP ou plataforma de gerência como Cisco DNA Center ou Cisco Prime).</p>`)

  body.push(`<p style="text-align:justify;margin-top:5pt">No tocante à <strong>integridade ambiental e de hardware</strong>, a operação sustentada de switches em temperaturas próximas ou acima dos limiares especificados — mesmo que intermitentemente — acelera de forma exponencial a degradação dos componentes semicondutores, especialmente os ASICs de switching e os capacitores eletrolíticos da placa de alimentação. A limpeza periódica dos filtros de ar, a verificação do fluxo térmico no rack (front-to-back ou bottom-to-top) e a calibração anual dos sistemas de climatização da sala são práticas indispensáveis. Módulos de FAN devem ser substituídos preventivamente ao atingirem 3 a 5 anos de operação contínua, independentemente do status reportado, pois a degradação mecânica dos rolamentos pode não ser detectada até a falha definitiva.</p>`)

  body.push(`<p style="text-align:justify;margin-top:5pt">Em relação à <strong>segurança e conformidade</strong>, a presença de Telnet habilitado em linhas VTY, a ausência de servidor NTP configurado ou o uso de comunidades SNMP RW sem segmentação de acesso representam vulnerabilidades exploráveis em redes OT, onde a convergência com ambientes IT aumenta a superfície de ataque. Recomenda-se a aplicação do guia <em>Cisco IOS Network Security Hardening</em> e dos controles de segurança descritos na norma IEC 62443-4-2 para dispositivos de componentes embarcados. A auditoria de configuração de segurança deve ser realizada ao menos anualmente ou após qualquer alteração significativa na topologia da rede.</p>`)

  body.push(`<h3>Cronograma de Ações Recomendadas</h3>`)
  body.push(`<table style="font-size:8.5pt">
    <thead>${thRow('Prazo', 'Ação', 'Responsável', 'Prioridade')}</thead>
    <tbody>
    ${[
      ['Imediato (0–7 dias)',     `Investigar ${totalCrit} eventos CRITICAL e ${critSwCount} dispositivos críticos`,        'NOC / Cisco TAC',    badge('Alta','r')],
      ['Curto prazo (8–30 dias)', `Substituir ${fanFaults > 0 ? `${fanFaults} FAN(s) com falha e ` : ''}verificar temperatura`,   'Equipe de Field',    badge('Alta','r')],
      ['Médio prazo (1–3 meses)', 'Atualizar firmware dos dispositivos fora do EoSM. Aplicar hardening de segurança.',          'Engenharia de Redes', badge('Média','o')],
      ['Longo prazo (trimestral)','Auditoria automatizada recorrente, revisão de inventário EOL/EOS e limpeza de hardware.',    'Operações / TI',     badge('Planejada','b')],
    ].map(([p, a, r, s]) =>
      `<tr><td style="white-space:nowrap">${esc(p as string)}</td><td>${esc(a as string)}</td><td class="dim">${esc(r as string)}</td><td>${s}</td></tr>`
    ).join('')}
    </tbody>
  </table>`)

  body.push(`<p style="margin-top:20pt;font-size:7.5pt;color:${CLR.gray50};text-align:center">
    Documento gerado automaticamente — Netwatch Analyzer &nbsp;|&nbsp; ${esc(dateStr)} ${esc(timeStr)}<br>
    Referências: tools.cisco.com/bugsearch &nbsp;|&nbsp; Cisco TAC: 1-800-553-2447 &nbsp;|&nbsp; IEC 62443 &nbsp;|&nbsp; Rockwell Automation Product Life Cycle
  </p>`)

  // Signature block
  body.push(`<table style="width:100%;border-collapse:collapse;margin-top:20pt;font-size:8.5pt">
    <tr>
      <td style="width:45%;border-top:0.5pt solid ${CLR.gray50};padding-top:4pt;text-align:center">
        <p class="dim" style="margin:0">Responsável Técnico pela Auditoria</p>
        <p class="dim" style="margin:0">Nome / Registro Profissional</p>
      </td>
      <td style="width:10%"></td>
      <td style="width:45%;border-top:0.5pt solid ${CLR.gray50};padding-top:4pt;text-align:center">
        <p class="dim" style="margin:0">Aprovado por / Gestor Responsável</p>
        <p class="dim" style="margin:0">Data: _____ / _____ / _______</p>
      </td>
    </tr>
  </table>`)

  // ══════════════════════════════════════════════════════════════════════
  // ASSEMBLE HTML
  // ══════════════════════════════════════════════════════════════════════
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<meta name="ProgId" content="Word.Document">
<!--[if gte mso 9]><xml>
<w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>90</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml><![endif]-->
<title>Relatório de Auditoria Técnica de Rede</title>
<style>${css}</style>
</head>
<body>
${headerHtml}
${footerHtml}
<div class="Section1">
${body.join('\n')}
</div>
</body>
</html>`

  const blob = new Blob([html], { type: 'application/msword;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `relatorio-auditoria-${Date.now()}.doc`
  a.click()
  URL.revokeObjectURL(url)

  } catch (err) {
    console.error('[exportToWord] Falha:', err)
    alert(`Erro ao gerar Relatório.\n\nDetalhes: ${err instanceof Error ? err.message : String(err)}`)
  }
}




function exportToExcel(switches: SwitchData[]) {
  const styles = `
  <Styles>
    <Style ss:ID="Default">
      <Font ss:FontName="Consolas" ss:Size="10"/>
    </Style>
    <Style ss:ID="hdr">
      <Font ss:Bold="1" ss:Color="#22D3EE" ss:FontName="Consolas" ss:Size="10"/>
      <Interior ss:Color="#1A2535" ss:Pattern="Solid"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#2D3748"/></Borders>
    </Style>
    <Style ss:ID="sec">
      <Font ss:Bold="1" ss:Color="#3B82F6" ss:Size="11" ss:FontName="Consolas"/>
      <Interior ss:Color="#0D1B2E" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="txtWarn">
      <Font ss:Bold="1" ss:Color="#EF4444" ss:FontName="Consolas"/>
      <Interior ss:Color="#2D0000" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="txtOk">
      <Font ss:Bold="1" ss:Color="#10B981" ss:FontName="Consolas"/>
    </Style>
    <Style ss:ID="txtAttn">
      <Font ss:Bold="1" ss:Color="#F59E0B" ss:FontName="Consolas"/>
      <Interior ss:Color="#2A1D00" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="pctWarn">
      <Font ss:Bold="1" ss:Color="#EF4444" ss:FontName="Consolas"/>
      <Interior ss:Color="#2D0000" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="0.0&quot;%&quot;"/>
    </Style>
    <Style ss:ID="pctOk">
      <Font ss:Bold="1" ss:Color="#10B981" ss:FontName="Consolas"/>
      <NumberFormat ss:Format="0.0&quot;%&quot;"/>
    </Style>
    <Style ss:ID="pctNum">
      <Font ss:FontName="Consolas" ss:Size="10"/>
      <NumberFormat ss:Format="0.0&quot;%&quot;"/>
    </Style>
    <Style ss:ID="num">
      <Font ss:FontName="Consolas" ss:Size="10"/>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
  </Styles>`

  const analyticsSheet  = buildAnalyticsWorksheet(switches)
  const sfpGlobalSheet  = buildSfpGlobalWorksheet(switches)
  const ipVlanSheet     = buildIpVlanWorksheet(switches)
  const transceiverSheet = buildTransceiverWorksheet(switches)
  const timelineSheet   = buildTimelineWorksheet(switches)

  // Deduplicate worksheet names — Excel corrupts the workbook if two sheets share the same name.
  // Reserve the fixed global sheet names so per-switch detail sheets never collide with them.
  const usedNames = new Set<string>([
    'Analytics', 'Inventário SFP Global', 'IPs por VLAN', 'Transceiver DOM', 'Linha do Tempo',
  ])
  const detailSheets = switches.map((sw) => {
    const base = sw.hostname.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 28)
    let name = base
    let counter = 2
    while (usedNames.has(name)) {
      name = `${base}_${counter++}`
    }
    usedNames.add(name)
    return buildWorksheet(sw, name)
  }).join('\n  ')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${styles}
  ${analyticsSheet}
  ${sfpGlobalSheet}
  ${ipVlanSheet}
  ${transceiverSheet}
  ${timelineSheet}
  ${detailSheets}
</Workbook>`

  // UTF-8 BOM (\uFEFF) is required for Excel to correctly identify
  // the encoding of SpreadsheetML files. Without it, Excel cannot
  // parse the XML and reports the file as corrupted.
  const BOM  = '\uFEFF'
  const blob = new Blob([BOM + xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `showtech-${Date.now()}.xls`
  a.click(); URL.revokeObjectURL(url)
}

// ─── Severity label helper ────────────────────────────────────────────────
function sevLabel(s: number): string {
  return ['EMERG','ALERT','CRIT','ERROR','WARN','NOTICE','INFO','DEBUG'][s] ?? String(s)
}
// ─── Timeline View ────────────────────────────────────────────────────────
function TimelineView({ netIntel, switches }: { netIntel: NetIntel; switches: SwitchData[] }) {
  const [filter,        setFilter]        = useState<'all' | 'critical' | 'error' | 'flap' | 'security'>('all')
  const [hostFilter,    setHostFilter]    = useState<string>('all')
  const [sevFilter,     setSevFilter]     = useState<number>(-1)  // -1 = all
  const [modalEntry,    setModalEntry]    = useState<LogEntry | null>(null)

  const SEV_COLORS = [C.red, C.red, C.red, '#f43f5e', C.orange, C.cyan, C.textD, C.textG]

  // Base pool after type-filter
  const baseLogs = filter === 'critical' ? netIntel.criticalLogs.filter(e => e.severity <= 2)
    : filter === 'error'    ? netIntel.logs.filter(e => e.severity === 3)
    : filter === 'flap'     ? netIntel.flapEvents.flatMap(f => f.entries)
    : filter === 'security' ? netIntel.securityEvents.map(s => s.entry)
    : netIntel.logs

  // Then apply host + severity sub-filters
  const logs = baseLogs.filter(e =>
    (hostFilter === 'all' || e.sourceHostname === hostFilter) &&
    (sevFilter < 0 || e.severity === sevFilter)
  )

  // Switches that actually contributed logs
  const switchesWithLogs = switches.filter(sw =>
    netIntel.logs.some(e => e.sourceHostname === sw.hostname)
  )
  const switchesNoLogs = switches.filter(sw =>
    !netIntel.logs.some(e => e.sourceHostname === sw.hostname)
  )

  if (switches.length === 0) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
      <span style={{ fontSize:36 }}>📋</span>
      <p style={{ fontSize:11, color:C.textG, fontFamily:C.mono }}>Nenhum arquivo carregado.</p>
    </div>
  )

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* Switch color legend + missing-log warning */}
      <div style={{ padding:'8px 20px', borderBottom:`1px solid ${C.border}`, flexShrink:0,
        display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
        <span style={{ fontSize:8, color:C.textG, fontFamily:C.mono, textTransform:'uppercase',
          letterSpacing:'0.15em', flexShrink:0 }}>Switches:</span>
        {/* "All" selector */}
        <button onClick={() => setHostFilter('all')} style={{
          padding:'2px 8px', fontSize:9, fontFamily:C.mono, fontWeight:700, borderRadius:4,
          cursor:'pointer', transition:'all 0.1s',
          background: hostFilter === 'all' ? `${C.cyan}20` : 'transparent',
          border:`1px solid ${hostFilter === 'all' ? C.cyan : C.border}`,
          color: hostFilter === 'all' ? C.cyan : C.textG,
        }}>Todos</button>
        {switchesWithLogs.map((sw, i) => {
          const color = _SW_COLORS[switches.indexOf(sw) % _SW_COLORS.length]
          const count = netIntel.logs.filter(e => e.sourceHostname === sw.hostname).length
          const active = hostFilter === sw.hostname
          return (
            <button key={sw.hostname} onClick={() => setHostFilter(active ? 'all' : sw.hostname)} style={{
              display:'flex', alignItems:'center', gap:5,
              padding:'2px 8px', fontSize:9, fontFamily:C.mono, fontWeight:700, borderRadius:4,
              cursor:'pointer', transition:'all 0.1s',
              background: active ? `${color}20` : 'transparent',
              border:`1px solid ${active ? color : C.border}`,
              color: active ? color : C.textG,
            }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0, display:'inline-block' }}/>
              {sw.hostname}
              <span style={{ opacity:0.6 }}>({count})</span>
            </button>
          )
        })}
        {switchesNoLogs.length > 0 && (
          <span style={{ fontSize:8, color:C.orange, fontFamily:C.mono, marginLeft:4 }}>
            ⚠ Sem logs: {switchesNoLogs.map(s => s.hostname).join(', ')}
          </span>
        )}
      </div>

      {/* Type filters + severity quick filter */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 20px',
        borderBottom:`1px solid ${C.border}`, flexShrink:0, flexWrap:'wrap' }}>
        <span style={{ fontSize:8, color:C.textG, fontFamily:C.mono, textTransform:'uppercase',
          letterSpacing:'0.12em', flexShrink:0 }}>Tipo:</span>
        {([
          { id:'all'      as const, label:`Todos (${netIntel.logs.length})`,                              color: C.textG  },
          { id:'critical' as const, label:`Critical (${netIntel.logs.filter(e=>e.severity<=2).length})`, color: C.red    },
          { id:'error'    as const, label:`Error (${netIntel.logs.filter(e=>e.severity===3).length})`,   color: '#f43f5e'},
          { id:'flap'     as const, label:`Flapping (${netIntel.flapEvents.flatMap(f=>f.entries).length})`, color: C.orange },
          { id:'security' as const, label:`Segurança (${netIntel.securityEvents.length})`,               color: C.purple },
        ]).map(f => (
          <button key={f.id} onClick={() => { setFilter(f.id); setSevFilter(-1) }} style={{
            padding:'2px 8px', fontSize:9, fontFamily:C.mono, fontWeight:700,
            textTransform:'uppercase', letterSpacing:'0.1em', borderRadius:4, cursor:'pointer',
            background: filter === f.id ? `${f.color}18` : 'transparent',
            border:`1px solid ${filter === f.id ? f.color : C.border}`,
            color: filter === f.id ? f.color : C.textG,
          }}>{f.label}</button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:9, color:C.textG, fontFamily:C.mono, flexShrink:0 }}>
          {logs.length} eventos
          {(hostFilter !== 'all' || sevFilter >= 0) && ` (filtrado)`}
        </span>
      </div>

      {/* Log list */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
        {netIntel.logs.length === 0 && (
          <div style={{ padding:32, textAlign:'center', display:'flex', flexDirection:'column', gap:10, alignItems:'center' }}>
            <span style={{ fontSize:32 }}>📋</span>
            <p style={{ fontSize:11, color:C.textG, fontFamily:C.mono, margin:0 }}>
              Nenhum log encontrado nos arquivos carregados.
            </p>
            <p style={{ fontSize:10, color:C.textG, fontFamily:C.mono, margin:0 }}>
              O comando <span style={{color:C.cyan}}>show logging</span> deve estar presente nos arquivos RTF.
            </p>
          </div>
        )}
        {netIntel.logs.length > 0 && logs.length === 0 && (
          <div style={{ padding:24, textAlign:'center', fontSize:11, color:C.textG, fontFamily:C.mono }}>
            Nenhum evento para este filtro.
          </div>
        )}
        {/* Column headers */}
        {logs.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'148px 58px 145px 1fr',
            gap:0, padding:'4px 20px', borderBottom:`1px solid ${C.border}`,
            background:C.surface, position:'sticky', top:0, zIndex:1 }}>
            {['Timestamp','Sev','Switch','Mensagem'].map(h => (
              <span key={h} style={{ fontSize:7, fontFamily:C.mono, fontWeight:700,
                textTransform:'uppercase', letterSpacing:'0.15em', color:C.textG }}>{h}</span>
            ))}
          </div>
        )}
        {logs.map((e, i) => {
          const sevClr = SEV_COLORS[e.severity] ?? C.textG
          const isClickable = e.severity <= 3
          return (
            <div key={i}
              onClick={isClickable ? () => setModalEntry(e) : undefined}
              style={{
                display:'grid', gridTemplateColumns:'148px 58px 145px 1fr',
                gap:0, padding:'4px 20px',
                borderBottom:`1px solid ${C.border}`,
                background: e.severity <= 3
                  ? `${sevClr}08`
                  : i % 2 === 0 ? 'transparent' : C.surface,
                alignItems:'center',
                cursor: isClickable ? 'pointer' : 'default',
                transition: 'background 0.1s',
              }}
              title={isClickable ? 'Clique para ver diagnóstico e ações de resolução' : undefined}
            >
              <span style={{ fontSize:9, color:C.textD, fontFamily:C.mono,
                whiteSpace:'nowrap', paddingRight:8 }}>{e.timestamp}</span>
              <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                <span style={{
                  fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:3,
                  background:`${sevClr}22`, color:sevClr,
                  textAlign:'center', fontFamily:C.mono, whiteSpace:'nowrap',
                }}>{e.severity} {sevLabel(e.severity)}</span>
                {isClickable && (
                  <span style={{ fontSize:7, color:`${sevClr}80`, fontFamily:C.mono, textAlign:'center' }}>
                    💡 diagnóstico
                  </span>
                )}
              </div>
              <span style={{
                fontSize:9, fontWeight:700, fontFamily:C.mono,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                color:e.sourceColor, paddingRight:8,
              }}>{e.sourceHostname}</span>
              <span style={{ fontSize:9, color:C.text, fontFamily:C.mono,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                <span style={{ color:`${sevClr}cc` }}>
                  %{e.facility}-{e.severity}-{e.mnemonic}
                </span>
                {': '}{e.message}
              </span>
            </div>
          )
        })}
      </div>
      {/* Knowledge Base Modal */}
      {modalEntry && <LogModal entry={modalEntry} onClose={() => setModalEntry(null)} />}
    </div>
  )
}

// ─── Security View ────────────────────────────────────────────────────────
function SecurityView({ netIntel }: { netIntel: NetIntel }) {
  const failures = netIntel.securityEvents.filter(e => e.type === 'login_failed')
  const configs  = netIntel.securityEvents.filter(e => e.type === 'config_change')

  return (
    <div style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>
      {/* Alerts row */}
      {netIntel.flapEvents.length > 0 && (
        <div style={{ padding:'12px 16px', borderRadius:8, background:`${C.orange}10`, border:`1px solid ${C.orange}40` }}>
          <p style={{ margin:0, fontSize:10, fontWeight:700, color:C.orange, fontFamily:C.mono }}>
            ⚡ INTERFACE FLAPPING DETECTADO — {netIntel.flapEvents.length} interface(s)
          </p>
          <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:8 }}>
            {netIntel.flapEvents.map((f, i) => (
              <span key={i} style={{ fontSize:9, padding:'2px 10px', borderRadius:4,
                background:`${C.orange}15`, border:`1px solid ${C.orange}40`, color:C.orange, fontFamily:C.mono }}>
                {f.hostname} / {f.iface} — {f.count}× em &lt;1h
              </span>
            ))}
          </div>
        </div>
      )}
      {netIntel.multipleRoots.length > 0 && (
        <div style={{ padding:'12px 16px', borderRadius:8, background:`${C.red}10`, border:`1px solid ${C.red}50` }}>
          <p style={{ margin:0, fontSize:10, fontWeight:700, color:C.red, fontFamily:C.mono }}>
            🚨 MÚLTIPLOS ROOT BRIDGES DETECTADOS — Conflito de Topologia STP!
          </p>
          <div style={{ marginTop:8 }}>
            {netIntel.multipleRoots.map((r, i) => (
              <p key={i} style={{ margin:'4px 0', fontSize:9, color:C.text, fontFamily:C.mono }}>
                <span style={{ color:C.red }}>Instância {r.instance}:</span> {r.switches.join(' + ')}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Login failures */}
      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:8 }}>
        <div style={{ padding:'9px 16px', borderBottom:`1px solid ${C.border}`, borderLeft:`3px solid ${C.red}`,
          background:`rgba(239,68,68,0.05)`, borderRadius:'8px 8px 0 0' }}>
          <span style={{ fontSize:9, fontFamily:C.mono, fontWeight:700, textTransform:'uppercase',
            letterSpacing:'0.18em', color:C.red }}>
            🔐 Falhas de Login — %SEC_LOGIN-4-LOGIN_FAILED ({failures.length})
          </span>
        </div>
        <div style={{ padding:failures.length ? 0 : 16 }}>
          {failures.length === 0 && <p style={{ fontSize:10, color:C.textG, fontFamily:C.mono }}>Nenhuma falha de login encontrada.</p>}
          {failures.map((s, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'130px 120px 1fr',
              gap:8, padding:'6px 16px', borderBottom:`1px solid ${C.border}`,
              background: i % 2 === 0 ? 'transparent' : C.surface }}>
              <span style={{ fontSize:9, color:C.textD, fontFamily:C.mono }}>{s.entry.timestamp}</span>
              <span style={{ fontSize:9, fontWeight:700, color:s.entry.sourceColor, fontFamily:C.mono }}>{s.entry.sourceHostname}</span>
              <span style={{ fontSize:9, color:C.text, fontFamily:C.mono }}>{s.entry.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Config changes */}
      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:8 }}>
        <div style={{ padding:'9px 16px', borderBottom:`1px solid ${C.border}`, borderLeft:`3px solid ${C.orange}`,
          background:`rgba(245,158,11,0.05)`, borderRadius:'8px 8px 0 0' }}>
          <span style={{ fontSize:9, fontFamily:C.mono, fontWeight:700, textTransform:'uppercase',
            letterSpacing:'0.18em', color:C.orange }}>
            ⚙️ Alterações de Configuração — %SYS-5-CONFIG_I ({configs.length})
          </span>
        </div>
        <div style={{ padding:configs.length ? 0 : 16 }}>
          {configs.length === 0 && <p style={{ fontSize:10, color:C.textG, fontFamily:C.mono }}>Nenhuma alteração de configuração encontrada.</p>}
          {configs.map((s, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'130px 120px 1fr',
              gap:8, padding:'6px 16px', borderBottom:`1px solid ${C.border}`,
              background: i % 2 === 0 ? 'transparent' : C.surface }}>
              <span style={{ fontSize:9, color:C.textD, fontFamily:C.mono }}>{s.entry.timestamp}</span>
              <span style={{ fontSize:9, fontWeight:700, color:s.entry.sourceColor, fontFamily:C.mono }}>{s.entry.sourceHostname}</span>
              <span style={{ fontSize:9, color:C.text, fontFamily:C.mono }}>{s.entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────
type TabId     = 'cpu' | 'memory' | 'network' | 'env' | 'stp' | 'config' | 'dlr' | 'interfaces' | 'transceiver' | 'inventory'
type ViewMode  = 'detail' | 'analytics' | 'sfpGlobal' | 'ipVlan' | 'transceiverGlobal' | 'timeline' | 'security'

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'cpu',       icon: '⚡', label: 'CPU'        },
  { id: 'memory',    icon: '🧠', label: 'Memória'    },
  { id: 'network',   icon: '🌐', label: 'Rede'       },
  { id: 'env',       icon: '🌡️', label: 'Ambiente'   },
  { id: 'stp',       icon: '🌲', label: 'STP'        },
  { id: 'config',    icon: '⚙️', label: 'Configuração' },
  { id: 'dlr',       icon: '⭕', label: 'DLR' },
  { id: 'interfaces', icon: '🔗', label: 'Interfaces' },
  { id: 'transceiver', icon: '📡', label: 'Transceiver Detail' },
  { id: 'inventory', icon: '🔌', label: 'Inventário' },
]

export default function ShowtechView() {
  const [switches,   setSwitches]   = useState<SwitchData[]>([])
  const [selected,   setSelected]   = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [tab,        setTab]        = useState<TabId>('cpu')
  const [chartView,  setChartView]  = useState<'h72' | 'min60' | 'sec60'>('h72')
  const [procView,   setProcView]   = useState<'chart' | 'table'>('chart')
  const [viewMode,   setViewMode]   = useState<ViewMode>('detail')
  const [pasteMode,  setPasteMode]  = useState(false)
  const [pasteText,  setPasteText]  = useState('')
  const [pasteName,  setPasteName]  = useState('switch-paste')
  const netIntel = buildNetIntel(switches as any[])

  const processPasteText = useCallback(() => {
    const txt = pasteText.trim()
    if (!txt) return
    try {
      const parsed = parseShowtech(txt, pasteName || 'switch-paste') as any
      setSwitches((prev: any[]) => {
        const next = [...prev, parsed]
        next.forEach((sw: any, i: number) => {
          const color = _SW_COLORS[i % _SW_COLORS.length]
          if (sw._logEntries) sw._logEntries.forEach((e: any) => { e.sourceColor = color })
        })
        setSelected(prev.length)
        return next
      })
      setPasteText('')
      setPasteMode(false)
    } catch (err) {
      alert('Erro ao analisar o texto. Verifique se é uma saída válida de show tech-support.')
    }
  }, [pasteText, pasteName])

 const processFiles = useCallback(async (fileList: FileList) => {
  const parsed: (SwitchData & { _logEntries?: LogEntry[] })[] = []
  for (const file of Array.from(fileList)) {
    try {
      const raw = await file.text()
      parsed.push(parseShowtech(raw, file.name) as any)
    } catch (err) {
      console.error(`[parseShowtech] Erro ao processar "${file.name}":`, err)
      alert(`Erro ao carregar o arquivo "${file.name}".\n\nDetalhes: ${err instanceof Error ? err.message : String(err)}\n\nOs demais arquivos continuarão sendo carregados.`)
    }
  }
  if (parsed.length === 0) return
  setSwitches((prev: any[]) => {
    const next = [...prev, ...parsed]
    next.forEach((sw: any, i: number) => {
      const color = _SW_COLORS[i % _SW_COLORS.length]
      if (sw._logEntries) sw._logEntries.forEach((e: any) => { e.sourceColor = color })
    })
    setSelected(prev.length)
    return next
  })
}, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files)
  }, [processFiles])

  const openFilePicker = () => {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.multiple = true; inp.accept = '.rtf,.txt,.log,.doc,.docx'
    inp.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files
      if (f?.length) processFiles(f)
    }
    inp.click()
  }

  const removeSwitch = (idx: number) => {
    setSwitches((prev: any[]) => {
      const next = prev.filter((_: any, i: number) => i !== idx)
      // Re-assign colors after removal so all indices stay consistent
      next.forEach((sw: any, i: number) => {
        const color = _SW_COLORS[i % _SW_COLORS.length]
        if (sw._logEntries) sw._logEntries.forEach((e: any) => { e.sourceColor = color })
      })
      setSelected((s: number) => Math.min(s, Math.max(0, next.length - 1)))
      return next
    })
  }

  const sw = switches[selected] ?? null

  const chartPts =
    sw ? (chartView === 'h72' ? sw.cpuHour : chartView === 'min60' ? sw.cpuMin : sw.cpuSec) : []
  const chartUnit =
    chartView === 'h72' ? 'horas' : chartView === 'min60' ? 'minutos' : 'segundos'

  const btnStyle = (active: boolean, activeColor = C.cyan): React.CSSProperties => ({
    padding: '4px 12px', fontSize: 9, fontFamily: C.mono, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.12em', borderRadius: 4, cursor: 'pointer',
    transition: 'all 0.1s',
    background: active ? `${activeColor}18` : 'transparent',
    border: `1px solid ${active ? activeColor : C.border}`,
    color: active ? activeColor : C.textD,
  })

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: C.bg, color: C.text, fontFamily: C.mono, overflow: 'hidden',
    }}>

      {/* ── Sub-header ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 20px', background: C.panel,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0, gap: 16,
      }}>
        {/* View mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2,
          border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
          {([
            { id: 'detail'    as ViewMode, icon: '🔧', label: 'Troubleshooting' },
            { id: 'analytics' as ViewMode, icon: '📊', label: 'Analytics'       },
            { id: 'sfpGlobal' as ViewMode, icon: '🔌', label: 'SFP Global'      },
            { id: 'ipVlan'    as ViewMode, icon: '🌐', label: 'IPs por VLAN'    },
            { id: 'transceiverGlobal' as ViewMode, icon: '🔬', label: 'Transceiver DOM' },
            { id: 'timeline'  as ViewMode, icon: '🕐', label: 'Linha do Tempo'  },
            { id: 'security'  as ViewMode, icon: '🔒', label: 'Segurança'       },
          ]).map((v) => (
            <button key={v.id} onClick={() => setViewMode(v.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 16px', fontSize: 10, fontFamily: C.mono,
              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: viewMode === v.id ? `${C.cyan}15` : 'transparent',
              color: viewMode === v.id ? C.cyan : C.textG,
              borderRight: `1px solid ${C.border}`,
            }}>
              <span style={{ fontSize: 12 }}>{v.icon}</span>{v.label}
            </button>
          ))}
        </div>

        {/* Info label */}
        <span style={{ fontSize: 9, color: C.textG, flex: 1 }}>
          {switches.length === 0
            ? 'Nenhum arquivo carregado'
            : `${switches.length} switch${switches.length > 1 ? 'es' : ''} carregado${switches.length > 1 ? 's' : ''}`
          }
        </span>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {switches.length > 0 && (
            <>
              <button onClick={() => exportToWord(switches, netIntel)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', fontSize: 10, fontFamily: C.mono,
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
                borderRadius: 6, cursor: 'pointer',
                background: 'rgba(59,130,246,0.12)', border: `1px solid rgba(59,130,246,0.35)`,
                color: C.blue, transition: 'all 0.15s',
              }}>
                <span>📄</span>Relatório Word
              </button>
              <button onClick={() => exportToExcel(switches)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', fontSize: 10, fontFamily: C.mono,
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
                borderRadius: 6, cursor: 'pointer',
                background: 'rgba(16,185,129,0.12)', border: `1px solid rgba(16,185,129,0.35)`,
                color: C.green, transition: 'all 0.15s',
              }}>
                <span>📥</span>Exportar Excel
              </button>
            </>
          )}
          <button onClick={() => setPasteMode(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', fontSize: 10, fontFamily: C.mono,
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
            borderRadius: 6, cursor: 'pointer',
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.3)',
            color: '#8b5cf6',
          }}>
            <span>📋</span>Colar Texto
          </button>

          <button onClick={openFilePicker} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', fontSize: 10, fontFamily: C.mono,
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
            borderRadius: 6, cursor: 'pointer',
            background: 'rgba(34,211,238,0.10)', border: `1px solid rgba(34,211,238,0.3)`,
            color: C.cyan, transition: 'all 0.15s',
          }}>
            <span>📂</span>Carregar RTF
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>


        {/* ── Analytics view ──────────────────────────────────────────── */}
        {viewMode === 'analytics' && (
          <AnalyticsPanel switches={switches} />
        )}

        {/* ── SFP Global view ─────────────────────────────────────────── */}
        {viewMode === 'sfpGlobal' && (
          <SfpGlobalView switches={switches} />
        )}

        {/* ── IPs por VLAN view ───────────────────────────────────────── */}
        {viewMode === 'ipVlan' && (
          <IpVlanView switches={switches} />
        )}

        {/* ── Transceiver DOM (global) view ───────────────────────────── */}
        {viewMode === 'transceiverGlobal' && (
          <TransceiverGlobalView switches={switches} />
        )}

        {/* ── Timeline view ───────────────────────────────────────────── */}
        {viewMode === 'timeline' && (
          <TimelineView netIntel={netIntel} switches={switches} />
        )}

        {/* ── Security view ───────────────────────────────────────────── */}
        {viewMode === 'security' && (
          <SecurityView netIntel={netIntel} />
        )}

        {/* ── Detail view ─────────────────────────────────────────────── */}
        {viewMode === 'detail' && (
          <>
            {/* ── Paste Mode overlay ─────────────────────────────────── */}
            {pasteMode && (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                padding: '20px 28px', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>📋</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.cyan }}>Colar Saída de Comandos</span>
                  <button onClick={() => setPasteMode(false)} style={{
                    marginLeft: 'auto', background: 'none', border: 'none',
                    color: C.textD, cursor: 'pointer', fontSize: 18,
                  }}>✕</button>
                </div>
                <p style={{ fontSize: 11, color: C.textD, margin: 0, lineHeight: 1.6 }}>
                  Cole a saída do <strong style={{ color: C.text }}>show tech-support</strong> ou qualquer combinação de comandos Cisco IOS.
                  Funciona com RTF (MobaXterm), TXT e saída direta do terminal.
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: C.textD, flexShrink: 0 }}>Nome do switch:</span>
                  <input
                    value={pasteName}
                    onChange={e => setPasteName(e.target.value)}
                    placeholder="ex: SW-CORE-01"
                    style={{
                      background: C.surface, border: `1px solid ${C.border}`,
                      color: C.text, borderRadius: 6, padding: '5px 10px',
                      fontSize: 12, fontFamily: C.mono, outline: 'none', width: 220,
                    }}
                  />
                </div>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="Cole aqui a saída do show tech-support, show version, show processes cpu, etc..."
                  style={{
                    flex: 1, minHeight: 320, background: C.surface,
                    border: `1px solid ${C.borderB}`, color: C.text,
                    borderRadius: 8, padding: '12px 14px',
                    fontSize: 11, fontFamily: C.mono, outline: 'none',
                    resize: 'vertical', lineHeight: 1.5,
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setPasteText(''); setPasteMode(false) }} style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    color: C.textD, borderRadius: 7, padding: '8px 18px',
                    fontSize: 12, fontFamily: C.mono, cursor: 'pointer',
                  }}>Cancelar</button>
                  <button
                    onClick={processPasteText}
                    disabled={!pasteText.trim()}
                    style={{
                      background: pasteText.trim() ? `linear-gradient(135deg,#3b82f6,${C.cyan})` : C.surface,
                      border: 'none', color: pasteText.trim() ? '#fff' : C.textD,
                      borderRadius: 7, padding: '8px 20px',
                      fontSize: 12, fontWeight: 700, fontFamily: C.mono,
                      cursor: pasteText.trim() ? 'pointer' : 'not-allowed',
                    }}>
                    Analisar
                  </button>
                </div>
              </div>
            )}

              {/* Empty / drop zone */}
            {!pasteMode && switches.length === 0 && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={openFilePicker}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 16,
                  cursor: 'pointer', margin: 24, borderRadius: 12,
                  border: `1.5px dashed ${isDragging ? C.cyan : C.border}`,
                  background: isDragging ? `${C.cyan}06` : 'transparent', transition: 'all 0.15s',
                }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 28,
                  background: 'rgba(34,211,238,0.08)', border: `1px solid rgba(34,211,238,0.2)`,
                }}>🗂️</div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>
                    Carregar arquivo Showtech
                  </p>
                  <p style={{ fontSize: 11, color: C.textD, margin: 0, maxWidth: 320, lineHeight: 1.6 }}>
                    Arraste arquivos <strong>.rtf</strong> do MobaXterm com a saída Showtech de switches Cisco.
                    Múltiplos switches suportados.
                  </p>
                </div>
                <p style={{ fontSize: 10, color: C.textG }}>Clique ou arraste para começar</p>
              </div>
            )}

            {/* List + detail */}
            {switches.length > 0 && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                style={{
                  flex: 1, display: 'flex', overflow: 'hidden',
                  outline: isDragging ? `2px dashed ${C.cyan}` : 'none',
                  outlineOffset: -6, borderRadius: 4,
                }}
              >
                {/* Switch list */}
                <div style={{
                  width: 200, flexShrink: 0, borderRight: `1px solid ${C.border}`,
                  display: 'flex', flexDirection: 'column', overflowY: 'auto', background: C.panel,
                }}>
                  <div style={{
                    padding: '10px 14px 6px', fontSize: 8, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.2em',
                    color: C.textG, borderBottom: `1px solid ${C.border}`,
                  }}>
                    Switches ({switches.length})
                  </div>
                  {switches.map((s, i) => {
                    const isActive = i === selected
                    const warn = s.cpuNow && (s.cpuNow.interrupt > 5)
                    return (
                      <div key={i}
                        onClick={() => { setSelected(i); setTab('cpu') }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '10px 12px', cursor: 'pointer',
                          borderLeft: `2px solid ${isActive ? C.cyan : 'transparent'}`,
                          background: isActive ? `${C.cyan}0A` : 'transparent',
                          borderBottom: `1px solid ${C.border}`, transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = C.surface }}
                        onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: warn ? C.red : C.green,
                          boxShadow: `0 0 6px ${warn ? C.red : C.green}80`,
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, margin: 0,
                            color: isActive ? C.cyan : C.text,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.hostname}
                          </p>
                          <p style={{ fontSize: 8, margin: '2px 0 0', color: C.textG,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.filename.length > 22 ? '…' + s.filename.slice(-19) : s.filename}
                          </p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeSwitch(i) }}
                          style={{ background: 'none', border: 'none', color: C.textG,
                            cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = C.red)}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = C.textG)}>
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* Detail panel */}
                {sw && (
                  <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                    {/* Switch header */}
                    <div style={{
                      padding: '12px 20px', background: C.panel,
                      borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${C.cyan}`,
                      display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const,
                      gap: 24, flexShrink: 0,
                    }}>
                      <div>
                        <p style={{ fontSize: 8, color: C.cyan, margin: '0 0 3px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Hostname</p>
                        <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'white' }}>{sw.hostname}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 8, color: C.textG, margin: '0 0 3px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Firmware</p>
                        <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: C.text }}>{sw.firmware}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 8, color: C.textG, margin: '0 0 3px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Uptime</p>
                        <p style={{ fontSize: 10, margin: 0, color: C.textD }}>{sw.uptime}</p>
                      </div>
                      {sw.cpuNow && (sw.cpuNow.interrupt > 5) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 12px', borderRadius: 6,
                          background: `${C.red}15`, border: `1px solid ${C.red}40` }}>
                          <span style={{ fontSize: 12 }}>⚠️</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: C.red,
                            letterSpacing: '0.1em', textTransform: 'uppercase' }}>CPU Alta</span>
                        </div>
                      )}
                      {/* App 1 — Health Check: flapping + critical logs badges */}
                      {netIntel.flapEvents.some(f => f.hostname === sw.hostname) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 12px', borderRadius: 6,
                          background: `${C.orange}15`, border: `1px solid ${C.orange}40` }}>
                          <span style={{ fontSize: 12 }}>⚡</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: C.orange,
                            letterSpacing: '0.1em', textTransform: 'uppercase' }}>Flapping</span>
                        </div>
                      )}
                      {netIntel.criticalLogs.filter(l => l.sourceHostname === sw.hostname).length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 12px', borderRadius: 6, marginLeft: 'auto',
                          background: `${C.red}15`, border: `1px solid ${C.red}40` }}>
                          <span style={{ fontSize: 12 }}>🚨</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: C.red,
                            letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            {netIntel.criticalLogs.filter(l => l.sourceHostname === sw.hostname).length} Log(s) Crítico(s)
                          </span>
                        </div>
                      )}
                      {/* Temperature range alert badge */}
                      {sw.tempAlert && (sw.tempAlert.status === 'HIGH' || sw.tempAlert.status === 'LOW') && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 12px', borderRadius: 6,
                          background: `${C.red}15`, border: `1px solid ${C.red}40` }}>
                          <span style={{ fontSize: 12 }}>{sw.tempAlert.status === 'HIGH' ? '🔥' : '🥶'}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: C.red,
                            letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            Temp {sw.tempAlert.status === 'HIGH' ? 'Alta' : 'Baixa'} ({sw.tempAlert.tempC}°C)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Tab bar */}
                    <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`,
                      background: C.panel, flexShrink: 0 }}>
                      {TABS.map((t) => (
                        <button key={t.id} onClick={() => setTab(t.id)} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '9px 18px', fontSize: 9, fontFamily: C.mono,
                          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em',
                          background: 'transparent', border: 'none',
                          borderBottom: `2px solid ${tab === t.id ? C.cyan : 'transparent'}`,
                          marginBottom: -1, color: tab === t.id ? C.cyan : C.textG,
                          cursor: 'pointer', transition: 'color 0.15s',
                        }}>
                          <span style={{ fontSize: 12 }}>{t.icon}</span>{t.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab content */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 20,
                      display: 'flex', flexDirection: 'column', gap: 16 }}>

                      {/* ── CPU ───────────────────────────────────────── */}
                      {tab === 'cpu' && (
                        <>
                          {/* Health Score */}
                          <HealthScoreCard sw={sw} swLogs={((sw as any)._logEntries ?? []) as LogEntry[]} />

                          {/* Current CPU — compact 4-column cards */}
                          {sw.cpuNow ? (
                            <Panel icon="⚡" label="show process cpu — Utilização Atual"
                              color={C.orange} accent="rgba(245,158,11,0.05)">
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                                gap: 10,
                                minWidth: 0,
                              }}>
                                {([
                                  { label: '5 Seg — Total',       value: sw.cpuNow.fiveSec,   warn: false,                     tip: ''      },
                                  { label: '5 Seg — Interrupção', value: sw.cpuNow.interrupt,  warn: sw.cpuNow.interrupt > 5,   tip: '> 5%'  },
                                  { label: '1 Minuto',             value: sw.cpuNow.oneMin,     warn: false, tip: '' },
                                  { label: '5 Minutos',            value: sw.cpuNow.fiveMin,    warn: false, tip: '' },
                                ] as const).map((item) => (
                                  <div key={item.label} style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 14px', borderRadius: 8,
                                    background: item.warn ? `${C.red}0C` : C.surface,
                                    border: `1px solid ${item.warn ? C.red + '50' : C.border}`,
                                  }}>
                                    {/* Value */}
                                    <span style={{
                                      fontSize: 22, fontWeight: 700, lineHeight: 1, flexShrink: 0,
                                      color: item.warn ? C.red : 'white', fontVariantNumeric: 'tabular-nums',
                                    }}>
                                      {item.value}%
                                    </span>
                                    {/* Label + tip */}
                                    <div style={{ minWidth: 0 }}>
                                      <p style={{ fontSize: 9, fontWeight: 700, margin: 0,
                                        textTransform: 'uppercase', letterSpacing: '0.1em',
                                        color: item.warn ? `${C.red}cc` : C.textD,
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.label}
                                      </p>
                                      {item.warn && (
                                        <p style={{ fontSize: 8, margin: '3px 0 0', color: C.red }}>
                                          ⚠ Limiar: {item.tip}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </Panel>
                          ) : (
                            <div style={{ padding: 14, fontSize: 11, color: C.textG,
                              border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                              Dados de CPU não encontrados no arquivo.
                            </div>
                          )}

                          {/* CPU History — only shown when data was captured (Cisco show-tech) */}
                          {(sw.cpuSec.length > 0 || sw.cpuMin.length > 0 || sw.cpuHour.length > 0) && (
                          <Panel icon="📊" label="show process cpu history"
                            color={C.orange} accent="rgba(245,158,11,0.05)"
                            right={
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ display: 'flex', overflow: 'hidden', borderRadius: 4,
                                  border: `1px solid ${C.border}`, marginRight: 4 }}>
                                  {(['chart', 'table'] as const).map((v) => (
                                    <button key={v} onClick={() => setProcView(v)} style={{
                                      ...btnStyle(procView === v, C.orange),
                                      borderRadius: 0, border: 'none', padding: '4px 10px',
                                    }}>
                                      {v === 'chart' ? '📈' : '🗃️'}
                                    </button>
                                  ))}
                                </div>
                                {([
                                  { id: 'h72'   as const, label: '72h'   },
                                  { id: 'min60' as const, label: '60min' },
                                  { id: 'sec60' as const, label: '60s'   },
                                ]).map((v) => (
                                  <button key={v.id} onClick={() => setChartView(v.id)}
                                    style={btnStyle(chartView === v.id, C.orange)}>
                                    {v.label}
                                  </button>
                                ))}
                              </div>
                            }>
                            {procView === 'chart' && (
                              <CpuChart points={chartPts} timeUnit={chartUnit} />
                            )}
                            {procView === 'table' && (
                              chartPts.length > 0 ? (
                                <div style={{ maxHeight: 260, overflowY: 'auto',
                                  border: `1px solid ${C.border}`, borderRadius: 6 }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse',
                                    fontSize: 10, fontFamily: C.mono }}>
                                    <thead>
                                      <tr style={{ background: C.surface,
                                        borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0 }}>
                                        {[chartView === 'h72' ? 'Hora' : chartView === 'min60' ? 'Min' : 'Seg',
                                          'CPU Máx%', 'CPU Méd%', 'Status'].map((h) => (
                                          <th key={h} style={{ padding: '7px 12px', textAlign: 'left',
                                            fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
                                            letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {chartPts.map((p, i) => {
                                        const crit = p.max > 70
                                        return (
                                          <tr key={i} style={{ borderBottom: `1px solid ${C.border}`,
                                            background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                            <td style={{ padding: '5px 12px', color: C.textD }}>{i}</td>
                                            <td style={{ padding: '5px 12px', fontWeight: 700,
                                              color: crit ? C.red : C.text }}>{p.max}%</td>
                                            <td style={{ padding: '5px 12px', color: C.text }}>{p.avg}%</td>
                                            <td style={{ padding: '5px 12px' }}>
                                              <Badge
                                                label={crit ? 'CRÍTICO' : p.max > 50 ? 'ALTO' : 'NORMAL'}
                                                color={crit ? C.red : p.max > 50 ? C.orange : C.green} />
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p style={{ fontSize: 10, color: C.textG }}>Dados não encontrados.</p>
                              )
                            )}
                          </Panel>
                          )} {/* end CPU history guard */}

                          {/* Top processes */}
                          {sw.processes.length > 0 && (
                            <Panel icon="🔬" label="Top Processos por CPU (1 Min)"
                              color={C.purple} accent="rgba(139,92,246,0.05)">
                              <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse',
                                  fontSize: 10, fontFamily: C.mono }}>
                                  <thead>
                                    <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                      {['PID', '5 Sec', '1 Min', '5 Min', 'Processo'].map((h) => (
                                        <th key={h} style={{ padding: '7px 12px', textAlign: 'left',
                                          fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
                                          letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sw.processes.map((p, i) => {
                                      const hs = parseFloat(p.fiveSec) > 10
                                      const hm = parseFloat(p.oneMin) > 5
                                      return (
                                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}`,
                                          background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                          <td style={{ padding: '5px 12px', color: C.textD }}>{p.pid}</td>
                                          <td style={{ padding: '5px 12px', fontWeight: 700,
                                            color: hs ? C.red : C.text }}>{hs && '⚠ '}{p.fiveSec}%</td>
                                          <td style={{ padding: '5px 12px', fontWeight: 700,
                                            color: hm ? C.orange : C.text }}>{p.oneMin}%</td>
                                          <td style={{ padding: '5px 12px', color: C.textD }}>{p.fiveMin}%</td>
                                          <td style={{ padding: '5px 12px', color: C.text }}>{p.name}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </Panel>
                          )}
                        </>
                      )}

                      {/* ── MEMÓRIA ──────────────────────────────────── */}
                      {tab === 'memory' && (
                        sw.memory ? (
                          <Panel icon="🧠" label="show memory statistics — Processor Pool"
                            color={C.blue} accent="rgba(59,130,246,0.05)">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                    letterSpacing: '0.12em', color: C.textD }}>Utilização de Memória</span>
                                  <span style={{ fontSize: 14, fontWeight: 700,
                                    color: sw.memory.pct > 80 ? C.red : sw.memory.pct > 60 ? C.orange : C.green }}>
                                    {fmtPct(sw.memory.pct)}
                                  </span>
                                </div>
                                <div style={{ height: 20, position: 'relative', background: C.surface,
                                  borderRadius: 4, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${sw.memory.pct}%`, height: '100%', borderRadius: 4,
                                    background: sw.memory.pct > 80 ? C.red : sw.memory.pct > 60 ? C.orange : C.blue,
                                    transition: 'width 0.5s ease',
                                  }} />
                                  {[{ pct: 60, color: C.orange }, { pct: 80, color: C.red }].map((m) => (
                                    <div key={m.pct} style={{
                                      position: 'absolute', top: 0, bottom: 0,
                                      left: `${m.pct}%`, width: 1, background: m.color, opacity: 0.5,
                                    }} />
                                  ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                  {['0%', '60% warn', '80% crítico', '100%'].map((l) => (
                                    <span key={l} style={{ fontSize: 8, color: C.textG }}>{l}</span>
                                  ))}
                                </div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                {[
                                  { label: 'Total', value: sw.memory.total, color: C.textD },
                                  { label: 'Usado', value: sw.memory.used,  color: sw.memory.pct > 80 ? C.red : C.orange },
                                  { label: 'Livre', value: sw.memory.free,  color: C.green },
                                ].map((item) => (
                                  <div key={item.label} style={{ padding: 16, background: C.surface,
                                    border: `1px solid ${C.border}`, borderRadius: 8 }}>
                                    <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.15em',
                                      color: C.textG, margin: '0 0 8px' }}>{item.label}</p>
                                    <p style={{ fontSize: 20, fontWeight: 700, margin: 0,
                                      color: item.color, lineHeight: 1 }}>{fmtBytes(item.value)}</p>
                                    <p style={{ fontSize: 9, margin: '6px 0 0', color: C.textG }}>
                                      {item.value.toLocaleString()} bytes
                                    </p>
                                  </div>
                                ))}
                              </div>
                              {sw.memory.pct > 80 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '10px 14px', background: `${C.red}0A`,
                                  border: `1px solid ${C.red}40`, borderRadius: 8 }}>
                                  <span style={{ fontSize: 16 }}>⚠️</span>
                                  <span style={{ fontSize: 10, color: C.red }}>
                                    Acima de 80% — risco de degradação de performance ou OOM.
                                  </span>
                                </div>
                              )}
                            </div>
                          </Panel>
                        ) : (
                          <div style={{ padding: 14, fontSize: 11, color: C.textG,
                            border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                            Dados de memória não encontrados no arquivo.
                          </div>
                        )
                      )}

                      {/* ── REDE ─────────────────────────────────────── */}
                      {tab === 'network' && (
                        <Panel icon="🌐" label="show running-config — Configuração de Rede"
                          color={C.cyan} accent="rgba(34,211,238,0.04)">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16,
                              padding: '12px 16px', background: C.surface,
                              border: `1px solid ${C.border}`, borderRadius: 8 }}>
                              <span style={{ fontSize: 18 }}>🚪</span>
                              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '0.15em', color: C.textG, flexShrink: 0 }}>Default Gateway</span>
                              <span style={{ fontSize: 16, fontWeight: 700, color: C.cyan }}>{sw.gateway}</span>
                            </div>
                            {sw.vlans.length > 0 ? (
                              <>
                                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                  letterSpacing: '0.15em', color: C.textG, margin: 0 }}>
                                  Interfaces VLAN configuradas
                                </p>
                                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse',
                                    fontSize: 10, fontFamily: C.mono }}>
                                    <thead>
                                      <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                        {['VLAN', 'Endereço IP', 'Máscara'].map((h) => (
                                          <th key={h} style={{ padding: '8px 14px', textAlign: 'left',
                                            fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
                                            letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sw.vlans.map((v, i) => (
                                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}`,
                                          background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                          <td style={{ padding: '8px 14px' }}>
                                            <span style={{ display: 'inline-block', padding: '2px 10px',
                                              fontSize: 10, fontWeight: 700, borderRadius: 4,
                                              background: `${C.orange}15`, border: `1px solid ${C.orange}40`,
                                              color: C.orange }}>VLAN {v.vlan}</span>
                                          </td>
                                          <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700,
                                            color: C.text }}>{v.ip}</td>
                                          <td style={{ padding: '8px 14px', color: C.textD }}>{v.mask}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            ) : (
                              <p style={{ fontSize: 11, color: C.textG, margin: 0 }}>
                                Nenhuma interface VLAN com IP encontrada.
                              </p>
                            )}
                          </div>
                        </Panel>
                      )}

                      {/* ── AMBIENTE ─────────────────────────────────── */}
                      {tab === 'env' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                          {/* ── Catalyst structured env (show environment all) ── */}
                          {sw.catalystEnv ? (
                            <>
                              {/* FAN Status */}
                              {sw.catalystEnv.fans.length > 0 && (
                                <Panel icon="🌀" label="show environment all — Status dos FANs"
                                  color={C.cyan} accent="rgba(34,211,238,0.04)">
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {/* Switch FANs */}
                                    {sw.catalystEnv.fans.filter(f => !f.isPs).length > 0 && (
                                      <div>
                                        <p style={{ fontSize: 8, fontWeight: 700, margin: '0 0 6px', color: C.textG,
                                          textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: C.mono }}>
                                          FANs do Switch
                                        </p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                          {sw.catalystEnv.fans.filter(f => !f.isPs).map((fan, i) => {
                                            const ok = /^(ok|good)$/i.test(fan.status)
                                            return (
                                              <div key={i} style={{
                                                padding: '6px 10px', borderRadius: 6,
                                                background: ok ? `${C.green}12` : `${C.red}12`,
                                                border: `1px solid ${ok ? C.green : C.red}40`,
                                                display: 'flex', alignItems: 'center', gap: 6,
                                              }}>
                                                <span style={{ fontSize: 12 }}>{ok ? '✅' : '❌'}</span>
                                                <span style={{ fontSize: 9, fontFamily: C.mono, color: ok ? C.green : C.red, fontWeight: 700 }}>
                                                  {fan.name}
                                                </span>
                                                <span style={{ fontSize: 8, color: C.textD, fontFamily: C.mono }}>{fan.status}</span>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}
                                    {/* FAN PS */}
                                    {sw.catalystEnv.fans.filter(f => f.isPs).length > 0 && (
                                      <div>
                                        <p style={{ fontSize: 8, fontWeight: 700, margin: '0 0 6px', color: C.textG,
                                          textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: C.mono }}>
                                          FANs das Fontes (FAN PS)
                                        </p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                          {sw.catalystEnv.fans.filter(f => f.isPs).map((fan, i) => {
                                            const ok = /^(ok|good)$/i.test(fan.status)
                                            return (
                                              <div key={i} style={{
                                                padding: '6px 10px', borderRadius: 6,
                                                background: ok ? `${C.green}12` : `${C.red}12`,
                                                border: `1px solid ${ok ? C.green : C.red}40`,
                                                display: 'flex', alignItems: 'center', gap: 6,
                                              }}>
                                                <span style={{ fontSize: 12 }}>{ok ? '✅' : '❌'}</span>
                                                <span style={{ fontSize: 9, fontFamily: C.mono, color: ok ? C.green : C.red, fontWeight: 700 }}>
                                                  {fan.name}
                                                </span>
                                                <span style={{ fontSize: 8, color: C.textD, fontFamily: C.mono }}>{fan.status}</span>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </Panel>
                              )}

                              {/* Temperature blocks per Switch */}
                              {sw.catalystEnv.temps.map((t, ti) => {
                                const inletWarn  = t.inletRed  !== null && t.inletValue  !== null && t.inletValue  >= t.inletRed
                                const inletYWarn = t.inletYellow !== null && t.inletValue !== null && t.inletValue >= t.inletYellow && !inletWarn
                                const hotWarn    = t.hotspotRed !== null && t.hotspotValue !== null && t.hotspotValue >= t.hotspotRed
                                const hotYWarn   = t.hotspotYellow !== null && t.hotspotValue !== null && t.hotspotValue >= t.hotspotYellow && !hotWarn
                                const inletColor = inletWarn ? C.red : inletYWarn ? C.orange : C.green
                                const hotColor   = hotWarn ? C.red : hotYWarn ? C.orange : C.green
                                return (
                                  <Panel key={ti} icon="🌡️"
                                    label={`${t.switchId} — Temperatura (show environment all)`}
                                    color={inletWarn || hotWarn ? C.red : C.green}
                                    accent={inletWarn || hotWarn ? 'rgba(239,68,68,0.04)' : 'rgba(16,185,129,0.04)'}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                      {/* Inlet */}
                                      <div style={{
                                        padding: '14px 16px', borderRadius: 8,
                                        background: `${inletColor}0D`,
                                        border: `1px solid ${inletColor}40`,
                                      }}>
                                        <p style={{ fontSize: 8, fontWeight: 700, margin: '0 0 8px', color: C.textG,
                                          textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: C.mono }}>
                                          🌡️ Inlet Temperature
                                        </p>
                                        <p style={{ fontSize: 28, fontWeight: 700, margin: '0 0 6px',
                                          color: inletColor, fontFamily: C.mono }}>
                                          {t.inletValue !== null ? `${t.inletValue}°C` : 'N/A'}
                                        </p>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                          <Badge label={t.inletState} color={inletColor} />
                                          {t.inletYellow !== null && (
                                            <Badge label={`⚠ ${t.inletYellow}°C`} color={C.orange} />
                                          )}
                                          {t.inletRed !== null && (
                                            <Badge label={`🔴 ${t.inletRed}°C`} color={C.red} />
                                          )}
                                        </div>
                                      </div>
                                      {/* Hotspot */}
                                      <div style={{
                                        padding: '14px 16px', borderRadius: 8,
                                        background: `${hotColor}0D`,
                                        border: `1px solid ${hotColor}40`,
                                      }}>
                                        <p style={{ fontSize: 8, fontWeight: 700, margin: '0 0 8px', color: C.textG,
                                          textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: C.mono }}>
                                          🔥 Hotspot Temperature
                                        </p>
                                        <p style={{ fontSize: 28, fontWeight: 700, margin: '0 0 6px',
                                          color: hotColor, fontFamily: C.mono }}>
                                          {t.hotspotValue !== null ? `${t.hotspotValue}°C` : 'N/A'}
                                        </p>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                          <Badge label={t.hotspotState} color={hotColor} />
                                          {t.hotspotYellow !== null && (
                                            <Badge label={`⚠ ${t.hotspotYellow}°C`} color={C.orange} />
                                          )}
                                          {t.hotspotRed !== null && (
                                            <Badge label={`🔴 ${t.hotspotRed}°C`} color={C.red} />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    {(inletWarn || hotWarn) && (
                                      <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6,
                                        background: `${C.red}12`, border: `1px solid ${C.red}50`,
                                        fontSize: 9, fontFamily: C.mono, color: C.red }}>
                                        🔥 ALERTA: temperatura acima do Red Threshold definido no dispositivo
                                        {inletWarn && ` — Inlet: ${t.inletValue}°C ≥ ${t.inletRed}°C`}
                                        {hotWarn   && ` — Hotspot: ${t.hotspotValue}°C ≥ ${t.hotspotRed}°C`}
                                      </div>
                                    )}
                                  </Panel>
                                )
                              })}

                              {/* Power Supplies table */}
                              {sw.catalystEnv.powerSupplies.length > 0 && (
                                <Panel icon="⚡" label="show environment all — Fontes de Alimentação"
                                  color={C.orange} accent="rgba(245,158,11,0.04)">
                                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse',
                                      fontSize: 10, fontFamily: C.mono }}>
                                      <thead>
                                        <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                          {['Slot', 'Modelo (PID)', 'Serial', 'Status', 'Sys Pwr', 'PoE Pwr', 'Watts'].map(h => (
                                            <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 8,
                                              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em',
                                              color: C.textG }}>{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {sw.catalystEnv.powerSupplies.map((ps, i) => {
                                          const ok = /^(ok|good)$/i.test(ps.status)
                                          const sysBad = !/^good$/i.test(ps.sysPwr)
                                          const poeBad = !/^good$/i.test(ps.poePwr)
                                          return (
                                            <tr key={i} style={{ borderBottom: `1px solid ${C.border}`,
                                              background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                              <td style={{ padding: '8px 12px', fontWeight: 700, color: C.orange }}>{ps.slot}</td>
                                              <td style={{ padding: '8px 12px', color: C.cyan, fontWeight: 700 }}>{ps.pid}</td>
                                              <td style={{ padding: '8px 12px', color: C.textD, fontSize: 9 }}>{ps.serial}</td>
                                              <td style={{ padding: '8px 12px' }}>
                                                <Badge label={ps.status} color={ok ? C.green : C.red} />
                                              </td>
                                              <td style={{ padding: '8px 12px' }}>
                                                <Badge label={ps.sysPwr} color={sysBad ? C.red : C.green} />
                                              </td>
                                              <td style={{ padding: '8px 12px' }}>
                                                <Badge label={ps.poePwr} color={poeBad ? C.red : C.green} />
                                              </td>
                                              <td style={{ padding: '8px 12px', color: C.text }}>{ps.watts}W</td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </Panel>
                              )}
                            </>
                          ) : sw.env ? (
                            /* Fallback: original single-env display for older format */
                            <Panel icon="🌡️" label="show env all — Ambiente e Alimentação"
                              color={C.green} accent="rgba(16,185,129,0.04)">
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse',
                                    fontSize: 10, fontFamily: C.mono }}>
                                    <thead>
                                      <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                        {['Parâmetro', 'Valor Lido', 'Status'].map((h) => (
                                          <th key={h} style={{ padding: '8px 14px', textAlign: 'left',
                                            fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
                                            letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {[
                                        { icon: '🌡️', param: 'Temperatura do Sistema', value: sw.env.temperature },
                                        { icon: '⚡',  param: 'Power Supply A',          value: sw.env.powerA    },
                                        { icon: '⚡',  param: 'Power Supply B',          value: sw.env.powerB    },
                                      ].map((row, i) => {
                                        const { label, color } = envStatus(row.value)
                                        return (
                                          <tr key={i} style={{
                                            borderBottom: i < 2 ? `1px solid ${C.border}` : 'none',
                                            background: i % 2 === 0 ? 'transparent' : C.surface,
                                          }}>
                                            <td style={{ padding: '12px 14px' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 14 }}>{row.icon}</span>
                                                <span style={{ fontSize: 10, color: C.textD }}>{row.param}</span>
                                              </div>
                                            </td>
                                            <td style={{ padding: '12px 14px', fontSize: 12,
                                              fontWeight: 700, color: C.text }}>{row.value}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                              <Badge label={label} color={color} />
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                                {sw.tempAlert && sw.tempAlert.status !== 'UNPARSEABLE_TEMP' && sw.tempAlert.status !== 'UNKNOWN_MODEL' && (
                                  <div style={{
                                    marginTop: 12, padding: '10px 14px', borderRadius: 8,
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    background: sw.tempAlert.status === 'OK' ? `${C.green}0A` : `${C.red}0D`,
                                    border: `1px solid ${sw.tempAlert.status === 'OK' ? C.green : C.red}50`,
                                  }}>
                                    <span style={{ fontSize: 16, flexShrink: 0 }}>
                                      {sw.tempAlert.status === 'OK' ? '✅' : '🔥'}
                                    </span>
                                    <div style={{ minWidth: 0 }}>
                                      <p style={{ fontSize: 9, fontWeight: 700, margin: '0 0 3px',
                                        textTransform: 'uppercase', letterSpacing: '0.12em',
                                        color: sw.tempAlert.status === 'OK' ? C.green : C.red,
                                        fontFamily: C.mono }}>
                                        {sw.tempAlert.status === 'OK' ? 'Temperatura Normal' : `Temperatura FORA do Range — ${sw.tempAlert.status}`}
                                      </p>
                                      <p style={{ fontSize: 10, margin: 0, color: C.text, fontFamily: C.mono }}>
                                        {sw.tempAlert.message}
                                      </p>
                                      <p style={{ fontSize: 8, margin: '2px 0 0', color: C.textD, fontFamily: C.mono }}>
                                        Range permitido: {sw.tempAlert.range.minC}°C a {sw.tempAlert.range.maxC}°C — {sw.tempAlert.range.family}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {sw.tempAlert?.status === 'UNKNOWN_MODEL' && (
                                  <p style={{ margin: '10px 0 0', fontSize: 9, color: C.orange, fontFamily: C.mono }}>
                                    ⚠ Modelo "{sw.modelNumber}" não mapeado na base de referência — validação de temperatura indisponível.
                                  </p>
                                )}
                                <p style={{ fontSize: 9, color: C.textG, margin: '10px 0 0', lineHeight: 1.6 }}>
                                  * "Alarm disabled" na Power Supply B indica redundância configurada sem fonte física
                                  redundante — comportamento normal em ambientes com alimentação única.
                                </p>
                              </div>
                            </Panel>
                          ) : (
                            <div style={{ padding: 14, fontSize: 11, color: C.textG,
                              border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                              Dados de ambiente não encontrados no arquivo.
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── CONFIGURAÇÃO ─────────────────────────────── */}
                      {tab === 'config' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                          {/* Info geral do switch */}
                          <Panel icon="🕐" label="show version — Reinicialização" color={C.cyan} accent="rgba(34,211,238,0.04)">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              {[
                                { label: 'Modelo (Model Number)',     value: sw.modelNumber,  color: C.cyan  },
                                { label: 'Hora Atual (show clock)',   value: sw.clockTime,    color: C.text  },
                                { label: 'Uptime',                    value: sw.uptime,       color: C.green },
                                { label: 'Último Reload',             value: sw.reloadReason, color: sw.reloadReason !== 'N/A' ? C.orange : C.textD },
                                { label: 'Reinicializado Em',         value: sw.restartedAt,  color: C.textD },
                              ].map(item => (
                                <div key={item.label} style={{ padding: '10px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                                  <p style={{ fontSize: 8, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG, margin: '0 0 6px' }}>{item.label}</p>
                                  <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: item.color, wordBreak: 'break-all' }}>{item.value}</p>
                                </div>
                              ))}
                            </div>
                          </Panel>

                          {/* Modos e protocolos */}
                          <Panel icon="⚙️" label="show running-config — Protocolos e Modos" color={C.blue} accent="rgba(59,130,246,0.05)">
                            {/* 4 indicators in equal columns — responsive via minmax */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                              {/* Mode cards — STP, VTP, PTP */}
                              {[
                                { label: 'Spanning Tree Mode', value: sw.stpMode, color: C.blue   },
                                { label: 'VTP Mode',           value: sw.vtpMode, color: C.purple },
                                { label: 'PTP Mode',           value: sw.ptpMode, color: C.cyan   },
                                { label: 'UDLD',               value: sw.udld,    color: /disable/i.test(sw.udld) ? C.textD : C.green },
                              ].map(item => (
                                <div key={item.label} style={{ padding: '12px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                                  <p style={{ fontSize: 8, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG, margin: '0 0 8px' }}>{item.label}</p>
                                  <Badge label={item.value !== 'N/A' ? item.value : '—'} color={item.value !== 'N/A' ? item.color : C.textG} />
                                </div>
                              ))}
                              {/* ACESSO card — SSH + TELNET + SNMP */}
                              {(() => {
                                // Derive SSH/Telnet from vtyBlocks transport input
                                // "transport input ssh"         → only SSH allowed
                                // "transport input telnet"      → only Telnet allowed
                                // "transport input ssh telnet"  → both
                                // "transport input all"         → both
                                // No vtyBlocks defined          → IOS default = all (both)
                                const anyInput = sw.vtyBlocks.map(v => v.transportInput.toLowerCase())
                                const hasSsh    = sw.vtyBlocks.length === 0
                                  || anyInput.some(s => /\b(ssh|all)\b/.test(s))
                                const hasTelnet = sw.vtyBlocks.length === 0
                                  || anyInput.some(s => /\b(telnet|all)\b/.test(s))

                                const rows = [
                                  { proto: 'SSH',    enabled: hasSsh },
                                  { proto: 'Telnet', enabled: hasTelnet },
                                  { proto: 'SNMP',   enabled: sw.snmpEnabled },
                                ]

                                return (
                                  <div style={{ padding: '12px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                                    <p style={{ fontSize: 8, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG, margin: '0 0 10px' }}>
                                      Acesso
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                      {rows.map(({ proto, enabled }) => (
                                        <div key={proto} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                          <span style={{ fontSize: 9, fontFamily: C.mono, color: C.textD, flexShrink: 0 }}>
                                            {proto}
                                          </span>
                                          <Badge
                                            label={enabled ? 'ON' : 'OFF'}
                                            color={enabled ? C.green : C.red}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          </Panel>

                          {/* Lines: CON + VTY */}
                          {sw.vtyBlocks.length > 0 && (
                            <Panel icon="🔐" label="show running-config — Lines (CON e VTY)" color={C.blue} accent="rgba(59,130,246,0.05)">
                              <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono }}>
                                  <thead>
                                    <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                      {['Linha', 'Login', 'Transport Input', 'Transport Output'].map(h => (
                                        <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sw.vtyBlocks.map((v, i) => (
                                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                        <td style={{ padding: '8px 12px' }}>
                                          <span style={{
                                            padding: '2px 8px', borderRadius: 4,
                                            color: v.isCon ? C.orange : C.blue,
                                            fontWeight: 700, fontSize: 10,
                                            background: v.isCon ? `${C.orange}15` : `${C.blue}15`,
                                            border: `1px solid ${v.isCon ? C.orange : C.blue}40`,
                                          }}>
                                            {v.isCon ? 'CON 0' : `VTY ${v.range}`}
                                          </span>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                          <Badge
                                            label={v.login !== 'N/A' ? v.login : '—'}
                                            color={v.login === 'local' ? C.green : v.login === 'none' ? C.red : C.textD}
                                          />
                                        </td>
                                        <td style={{ padding: '8px 12px', color: C.text, fontWeight: 700 }}>{v.transportInput}</td>
                                        <td style={{ padding: '8px 12px', color: v.transportOutput !== 'N/A' ? C.text : C.textG }}>{v.transportOutput}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </Panel>
                          )}

                          {/* Usernames configurados */}
                          {sw.usernames.length > 0 && (
                            <Panel icon="👤" label="show running-config — Usuários Configurados" color={C.purple} accent="rgba(139,92,246,0.05)">
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {sw.usernames.map((u, i) => (
                                  <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 14px', background: C.surface,
                                    border: `1px solid ${C.border}`, borderRadius: 6,
                                  }}>
                                    <span style={{ fontSize: 14 }}>👤</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: C.mono }}>{u}</span>
                                  </div>
                                ))}
                              </div>
                            </Panel>
                          )}

                          {/* NTP Servers */}
                          {sw.ntpServers.length > 0 && (
                            <Panel icon="🕰️" label="show running-config — Servidores NTP" color={C.blue} accent="rgba(59,130,246,0.05)">
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {sw.ntpServers.map((n, i) => {
                                  const multiNtp = sw.ntpServers.length > 1
                                  return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: C.surface, border: `1px solid ${multiNtp && n.preferred ? C.orange + '60' : C.border}`, borderRadius: 6 }}>
                                      <span style={{ fontSize: 14 }}>{multiNtp ? (n.preferred ? '⭐' : '🔄') : '🕰️'}</span>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flex: 1 }}>{n.address}</span>
                                      {multiNtp && (
                                        <Badge label={n.preferred ? 'PREFERENCIAL' : 'ALTERNATIVO'} color={n.preferred ? C.orange : C.blue} />
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </Panel>
                          )}
                        </div>
                      )}


                      {/* ── STP ──────────────────────────────────────── */}
                      {tab === 'stp' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                          {/* ── Root Bridge Status per VLAN/MST ── */}
                          {sw.stpVlans.length > 0 ? (
                            <>
                              {/* Summary badges */}
                              <Panel icon="🌲" label="show spanning-tree — Root Bridge por Instância" color={C.green} accent="rgba(16,185,129,0.04)">
                                {/* Stats row */}
                                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                                  {(() => {
                                    const rootCount  = sw.stpVlans.filter(v => v.isRoot).length
                                    const total      = sw.stpVlans.length
                                    const blkCount   = sw.stpVlans.reduce((acc, v) => acc + v.blockedPorts.length, 0)
                                    return (
                                      <>
                                        <div style={{ padding: '10px 16px', borderRadius: 8, background: `${C.green}12`, border: `1px solid ${C.green}40`, textAlign: 'center', minWidth: 110 }}>
                                          <div style={{ fontSize: 22, fontWeight: 800, color: C.green, fontFamily: C.mono }}>{rootCount}</div>
                                          <div style={{ fontSize: 8, color: C.textG, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 2 }}>Root Bridge</div>
                                        </div>
                                        <div style={{ padding: '10px 16px', borderRadius: 8, background: `${C.blue}12`, border: `1px solid ${C.blue}40`, textAlign: 'center', minWidth: 110 }}>
                                          <div style={{ fontSize: 22, fontWeight: 800, color: C.blue, fontFamily: C.mono }}>{total - rootCount}</div>
                                          <div style={{ fontSize: 8, color: C.textG, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 2 }}>Não Root</div>
                                        </div>
                                        <div style={{ padding: '10px 16px', borderRadius: 8, background: blkCount > 0 ? `${C.orange}12` : `${C.surface}`, border: `1px solid ${blkCount > 0 ? C.orange : C.border}40`, textAlign: 'center', minWidth: 110 }}>
                                          <div style={{ fontSize: 22, fontWeight: 800, color: blkCount > 0 ? C.orange : C.textG, fontFamily: C.mono }}>{blkCount}</div>
                                          <div style={{ fontSize: 8, color: C.textG, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 2 }}>Portas BLK</div>
                                        </div>
                                        <div style={{ padding: '10px 16px', borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, textAlign: 'center', minWidth: 110 }}>
                                          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: C.mono }}>{total}</div>
                                          <div style={{ fontSize: 8, color: C.textG, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 2 }}>Instâncias</div>
                                        </div>
                                      </>
                                    )
                                  })()}
                                </div>

                                {/* Per-instance table */}
                                <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono }}>
                                    <thead>
                                      <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                        {['Instância', 'Protocolo', 'Root Bridge?', 'Root Prioridade', 'Root MAC', 'Bridge Prioridade', 'Bridge MAC'].map(h => (
                                          <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG, whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sw.stpVlans.map((v, i) => (
                                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                          <td style={{ padding: '7px 10px' }}>
                                            <span style={{ padding: '2px 8px', background: `${v.isRoot ? C.green : C.blue}15`, border: `1px solid ${v.isRoot ? C.green : C.blue}40`, borderRadius: 4, color: v.isRoot ? C.green : C.blue, fontWeight: 700, fontSize: 10 }}>
                                              {v.instance}
                                            </span>
                                          </td>
                                          <td style={{ padding: '7px 10px' }}>
                                            <span style={{ fontSize: 9, color: C.textD, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{v.protocol}</span>
                                          </td>
                                          <td style={{ padding: '7px 10px' }}>
                                            {v.isRoot
                                              ? <span style={{ color: C.green, fontWeight: 700, fontSize: 11 }}>✅ SIM</span>
                                              : <span style={{ color: C.textG, fontSize: 11 }}>— não</span>}
                                          </td>
                                          <td style={{ padding: '7px 10px', color: C.text }}>{v.rootPriority}</td>
                                          <td style={{ padding: '7px 10px', color: C.textD, fontSize: 9, letterSpacing: '0.04em' }}>{v.rootAddress}</td>
                                          <td style={{ padding: '7px 10px', color: C.text }}>{v.bridgePriority}</td>
                                          <td style={{ padding: '7px 10px', color: C.textD, fontSize: 9, letterSpacing: '0.04em' }}>{v.bridgeAddress}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </Panel>

                              {/* ── Blocked Ports ── */}
                              {(() => {
                                const blkRows: { instance: string; port: string }[] = []
                                sw.stpVlans.forEach(v => v.blockedPorts.forEach(p => blkRows.push({ instance: v.instance, port: p })))
                                return blkRows.length > 0 ? (
                                  <Panel icon="🚫" label="show spanning-tree — Portas Bloqueadas (BLK)" color={C.orange} accent="rgba(245,158,11,0.05)">
                                    <div style={{ marginBottom: 8, padding: '7px 12px', borderRadius: 6, background: `${C.orange}10`, border: `1px solid ${C.orange}30`, fontSize: 9, fontFamily: C.mono, color: C.orange }}>
                                      ⚠️ Portas no estado BLK (Blocking) são bloqueadas pelo Spanning Tree para evitar loops. Isso é comportamento normal em topologias redundantes.
                                    </div>
                                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono }}>
                                        <thead>
                                          <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                            {['Instância (VLAN/MST)', 'Porta Bloqueada'].map(h => (
                                              <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {blkRows.map((r, i) => (
                                            <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                              <td style={{ padding: '8px 12px' }}>
                                                <span style={{ padding: '2px 8px', background: `${C.orange}15`, border: `1px solid ${C.orange}40`, borderRadius: 4, color: C.orange, fontWeight: 700, fontSize: 10 }}>
                                                  {r.instance}
                                                </span>
                                              </td>
                                              <td style={{ padding: '8px 12px' }}>
                                                <span style={{ padding: '2px 8px', background: `${C.red}10`, border: `1px solid ${C.red}30`, borderRadius: 4, color: C.red, fontWeight: 700, fontSize: 10 }}>
                                                  🚫 {r.port}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </Panel>
                                ) : (
                                  <Panel icon="✅" label="show spanning-tree — Portas Bloqueadas" color={C.green} accent="rgba(16,185,129,0.04)">
                                    <div style={{ padding: '10px 14px', fontSize: 10, color: C.green, fontFamily: C.mono }}>
                                      Nenhuma porta em estado BLK encontrada neste switch.
                                    </div>
                                  </Panel>
                                )
                              })()}

                              {/* ── Tabela de Interfaces por Instância ── */}
                              {sw.stpVlans.some(v => v.ports.length > 0) && (() => {
                                const stsColor = (s: string) =>
                                  s === 'FWD' ? C.green : s === 'BLK' ? C.red : s === 'LRN' ? C.orange : s === 'LIS' ? C.textD : C.textG
                                const roleColor = (r: string) =>
                                  r === 'Root' ? C.cyan : r === 'Desg' ? C.blue : r === 'Altn' ? C.orange : C.purple
                                return (
                                  <Panel icon="📋" label="show spanning-tree — Tabela de Interfaces por Instância" color={C.blue} accent="rgba(59,130,246,0.04)">
                                    {sw.stpVlans.filter(v => v.ports.length > 0).map((v, vi, arr) => (
                                      <div key={vi} style={{ marginBottom: vi < arr.length - 1 ? 20 : 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '6px 10px', background: C.surface, borderRadius: 6, border: `1px solid ${C.border}` }}>
                                          <span style={{ padding: '2px 10px', background: `${v.isRoot ? C.green : C.blue}18`, border: `1px solid ${v.isRoot ? C.green : C.blue}50`, borderRadius: 4, color: v.isRoot ? C.green : C.blue, fontWeight: 800, fontSize: 11, fontFamily: C.mono }}>
                                            {v.instance}
                                          </span>
                                          <span style={{ fontSize: 9, color: C.textG, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{v.protocol}</span>
                                          {v.isRoot && <span style={{ fontSize: 9, color: C.green, fontWeight: 700 }}>✅ Root Bridge</span>}
                                          <span style={{ marginLeft: 'auto', fontSize: 9, color: C.textG }}>
                                            {v.ports.length} interface{v.ports.length !== 1 ? 's' : ''}
                                            {v.ports.filter(p => p.sts === 'BLK').length > 0 && (
                                              <span style={{ marginLeft: 8, color: C.red }}>🚫 {v.ports.filter(p => p.sts === 'BLK').length} BLK</span>
                                            )}
                                          </span>
                                        </div>
                                        <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono }}>
                                            <thead>
                                              <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                                {(['Interface', 'Role', 'Sts', 'Prio.Nbr'] as const).map(h => (
                                                  <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {v.ports.map((p, pi) => (
                                                <tr key={pi} style={{ borderBottom: pi < v.ports.length - 1 ? `1px solid ${C.border}` : 'none', background: p.sts === 'BLK' ? `${C.red}0d` : 'transparent' }}>
                                                  <td style={{ padding: '7px 12px', fontWeight: 600, color: C.text }}>{p.iface}</td>
                                                  <td style={{ padding: '7px 12px' }}>
                                                    <span style={{ padding: '2px 8px', background: `${roleColor(p.role)}18`, border: `1px solid ${roleColor(p.role)}40`, borderRadius: 4, color: roleColor(p.role), fontWeight: 700, fontSize: 10 }}>
                                                      {p.role}
                                                    </span>
                                                  </td>
                                                  <td style={{ padding: '7px 12px' }}>
                                                    <span style={{ padding: '2px 8px', background: `${stsColor(p.sts)}18`, border: `1px solid ${stsColor(p.sts)}40`, borderRadius: 4, color: stsColor(p.sts), fontWeight: 700, fontSize: 10 }}>
                                                      {p.sts}
                                                    </span>
                                                  </td>
                                                  <td style={{ padding: '7px 12px', color: C.textD, letterSpacing: '0.04em' }}>{p.prio}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    ))}
                                  </Panel>
                                )
                              })()}
                            </>
                          ) : (
                            <div style={{ padding: 14, fontSize: 11, color: C.textG, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                              Comando <code>show spanning-tree</code> não encontrado neste arquivo.
                            </div>
                          )}

                          {/* ── Topology Changes (show spanning-tree detail) ── */}
                          {sw.stpTopo.length > 0 && (
                            <Panel icon="📡" label="show spanning-tree detail — Mudanças de Topologia" color={C.orange} accent="rgba(245,158,11,0.05)">
                              <div style={{ marginBottom: 8, padding: '7px 12px', borderRadius: 6, background: `${C.orange}10`, border: `1px solid ${C.orange}30`, fontSize: 9, fontFamily: C.mono, color: C.orange }}>
                                ⚠️ Mudanças de topologia frequentes indicam instabilidade de link ou loops STP. Investigue a porta de origem.
                              </div>
                              <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono }}>
                                  <thead>
                                    <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                      {['Instância', 'Nº Mudanças', 'Última Mudança', 'Porta de Origem'].map(h => (
                                        <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sw.stpTopo.map((s, i) => (
                                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                        <td style={{ padding: '8px 12px' }}>
                                          <span style={{ padding: '2px 8px', background: `${C.orange}15`, border: `1px solid ${C.orange}40`, borderRadius: 4, color: C.orange, fontWeight: 700, fontSize: 10 }}>
                                            {s.instance}
                                          </span>
                                        </td>
                                        <td style={{ padding: '8px 12px', fontWeight: 700, color: s.changes >= 50 ? C.red : s.changes >= 10 ? C.orange : C.text }}>
                                          {s.changes}
                                          {s.changes >= 50 && <span style={{ marginLeft: 6, fontSize: 9, color: C.red }}>🔴 alto</span>}
                                          {s.changes >= 10 && s.changes < 50 && <span style={{ marginLeft: 6, fontSize: 9, color: C.orange }}>⚠️</span>}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: C.textD }}>{s.lastChange} atrás</td>
                                        <td style={{ padding: '8px 12px', color: C.textD }}>{s.fromPort}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </Panel>
                          )}

                          {sw.stpVlans.length === 0 && sw.stpTopo.length === 0 && (
                            <div style={{ padding: 14, fontSize: 11, color: C.textG, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                              Nenhum dado de Spanning Tree encontrado neste arquivo.
                            </div>
                          )}

                        </div>
                      )}

                      {/* ── DLR (Device Level Ring) ───────────────────── */}
                      {tab === 'dlr' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {(sw.dlrStatus.length > 0 || sw.dlrConfig.length > 0) ? (
                            <Panel icon="⭕" label="show dlr ring — Anéis Device Level Ring"
                              color={C.purple} accent="rgba(139,92,246,0.05)">
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {(() => {
                                  const rings = [...new Set([
                                    ...sw.dlrStatus.map(s => s.ring),
                                    ...sw.dlrConfig.map(c => c.ring),
                                  ])].sort((a, b) => a - b)
                                  return rings.map(ring => {
                                    const st  = sw.dlrStatus.find(s => s.ring === ring)
                                    const cfg = sw.dlrConfig.find(c => c.ring === ring)
                                    const ifs = sw.dlrInterfaces.filter(i => i.ring === ring).map(i => i.iface)
                                    const ok  = st ? /normal/i.test(st.status) : true
                                    const modeColor = st
                                      ? (/active/i.test(st.mode) ? C.green : /backup/i.test(st.mode) ? C.orange : C.cyan)
                                      : C.textD
                                    return (
                                      <div key={ring} style={{
                                        border: `1px solid ${st && !ok ? C.red : C.border}`, borderRadius: 8,
                                        background: st && !ok ? `${C.red}0A` : C.surface, overflow: 'hidden',
                                      }}>
                                        {/* header */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                          borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                                          <span style={{ fontSize: 14, fontWeight: 700, color: C.purple, fontFamily: C.mono }}>
                                            ⭕ DLR Ring {ring}
                                          </span>
                                          {st && <Badge label={st.mode} color={modeColor} />}
                                          {st && <Badge label={st.status} color={ok ? C.green : C.red} />}
                                          {st && <Badge label={`Topologia: ${st.topology}`} color={C.blue} />}
                                        </div>
                                        {/* body grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, padding: 14 }}>
                                          {[
                                            { label: 'Mode (config)',   value: cfg ? cfg.mode : 'N/A',           color: C.text },
                                            ...(st ? [
                                              { label: 'Mode (runtime)',        value: st.mode,             color: modeColor },
                                              { label: 'IOS State',             value: st.iosState,         color: C.textD },
                                              { label: 'Hardware State',        value: st.hardwareState,    color: C.textD },
                                              { label: 'Supervisor (deste SW)', value: `${st.supervisorMac} · ${st.supervisorIp}`, color: C.text },
                                              { label: 'Supervisor Ativo',      value: `${st.activeSupervisorMac} · ${st.activeSupervisorIp}`, color: C.green },
                                              { label: 'Beacon Int./Timeout',   value: `${st.beaconInterval} / ${st.beaconTimeout} µs`, color: C.textD },
                                              { label: 'DLR VLAN ID',           value: st.dlrVlanId,        color: C.textD },
                                              { label: 'Precedence (local)',    value: st.precedence,       color: C.cyan },
                                              { label: 'Redundant Gateway',     value: st.redundantGateway, color: C.textD },
                                              { label: 'Participantes',         value: st.participants !== null ? String(st.participants) : '—', color: C.cyan },
                                              { label: 'Ring Faults',           value: st.ringFaults !== null ? String(st.ringFaults) : '—', color: st.ringFaults ? C.orange : C.textD },
                                              { label: 'Última Falha',          value: st.lastFaultTime,    color: st.lastFaultTime !== 'N/A' ? C.orange : C.textD },
                                            ] : []),
                                          ].map(item => (
                                            <div key={item.label} style={{ padding: '8px 12px', background: C.panel,
                                              border: `1px solid ${C.border}`, borderRadius: 6 }}>
                                              <p style={{ fontSize: 8, fontFamily: C.mono, textTransform: 'uppercase',
                                                letterSpacing: '0.12em', color: C.textG, margin: '0 0 5px' }}>{item.label}</p>
                                              <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: item.color, fontFamily: C.mono, wordBreak: 'break-all' }}>
                                                {item.value}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                        {/* portas do anel (Port1/Port2 com vlan + estado) */}
                                        {st && (st.port1 || st.port2) && (
                                          <div style={{ padding: '0 14px 12px', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                                            {[st.port1, st.port2].map((p, idx) => p && (
                                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                <span style={{ fontSize: 8, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG }}>Port{idx + 1}</span>
                                                <span style={{ padding: '2px 9px', borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: C.mono, color: C.purple, background: `${C.purple}15`, border: `1px solid ${C.purple}40` }}>{p.name}</span>
                                                <span style={{ fontSize: 9, fontFamily: C.mono, color: C.textD }}>vlan {p.vlan}</span>
                                                <Badge label={p.state} color={/up/i.test(p.state) ? C.green : C.red} />
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {/* interfaces do anel (running-config) */}
                                        {ifs.length > 0 && (
                                          <div style={{ padding: '0 14px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 8, fontFamily: C.mono, textTransform: 'uppercase',
                                              letterSpacing: '0.12em', color: C.textG }}>Interfaces (config):</span>
                                            {ifs.map(p => (
                                              <span key={p} style={{ padding: '2px 9px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                                fontFamily: C.mono, color: C.purple, background: `${C.purple}15`, border: `1px solid ${C.purple}40` }}>{p}</span>
                                            ))}
                                          </div>
                                        )}
                                        {/* localização de falhas (últimos nós ativos) */}
                                        {st && st.faultLocations.length > 0 && (
                                          <div style={{ padding: '0 14px 12px' }}>
                                            <p style={{ fontSize: 8, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG, margin: '0 0 6px' }}>
                                              Localização da última falha
                                            </p>
                                            <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, fontFamily: C.mono }}>
                                                <tbody>
                                                  {st.faultLocations.map((fl, k) => (
                                                    <tr key={k} style={{ borderBottom: `1px solid ${C.border}`, background: k % 2 ? C.surface : 'transparent' }}>
                                                      <td style={{ padding: '5px 10px', color: C.orange }}>{fl.label}</td>
                                                      <td style={{ padding: '5px 10px', color: C.text }}>{fl.mac}</td>
                                                      <td style={{ padding: '5px 10px', color: C.cyan }}>{fl.ip}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        )}
                                        {/* participantes do anel (tabela completa) */}
                                        {st && st.participantList.length > 0 && (
                                          <div style={{ padding: '0 14px 12px' }}>
                                            <p style={{ fontSize: 8, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG, margin: '0 0 6px' }}>
                                              Participantes do anel ({st.participantList.length})
                                            </p>
                                            <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }} className="nw-scroll">
                                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, fontFamily: C.mono }}>
                                                <thead>
                                                  <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0 }}>
                                                    {['Nº', 'MAC-Addr', 'IP-Addr'].map(h => (
                                                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG }}>{h}</th>
                                                    ))}
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {st.participantList.map((p, k) => (
                                                    <tr key={k} style={{ borderBottom: `1px solid ${C.border}`, background: k % 2 ? C.surface : 'transparent' }}>
                                                      <td style={{ padding: '5px 10px', color: C.purple, fontWeight: 700 }}>{p.no}</td>
                                                      <td style={{ padding: '5px 10px', color: C.text }}>{p.mac}</td>
                                                      <td style={{ padding: '5px 10px', color: C.cyan }}>{p.ip}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })
                                })()}
                              </div>
                            </Panel>
                          ) : (
                            <div style={{ padding: 14, fontSize: 11, color: C.textG,
                              border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                              Nenhum anel DLR configurado neste switch (sem seção "show dlr ring" nem "dlr ring" no running-config).
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── INTERFACES STATUS ────────────────────────── */}
                      {tab === 'interfaces' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {sw.interfaceStatus.length > 0 ? (
                            <Panel icon="🔗" label="show interfaces status — Estado das Portas"
                              color={C.cyan} accent="rgba(34,211,238,0.04)">
                              {/* Resumo por status */}
                              {(() => {
                                const counts: Record<string, number> = {}
                                sw.interfaceStatus.forEach(p => {
                                  const s = ifStatusStyle(p.status).label.toLowerCase()
                                  counts[s] = (counts[s] ?? 0) + 1
                                })
                                const order = ['connected', 'notconnect', 'err-disabled', 'disabled', 'monitoring']
                                const keys = [...new Set([...order.filter(k => counts[k]), ...Object.keys(counts)])]
                                return (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                    {keys.map(k => {
                                      const st = ifStatusStyle(k)
                                      return (
                                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6,
                                          padding: '4px 10px', borderRadius: 6,
                                          background: st.fill ? `${st.color}15` : C.surface,
                                          border: `1px solid ${st.fill ? st.color + '40' : C.border}` }}>
                                          <span style={{ width: 8, height: 8, borderRadius: '50%',
                                            background: st.fill ? st.color : 'transparent',
                                            border: st.fill ? 'none' : `1px solid ${C.textG}` }} />
                                          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text }}>{k}</span>
                                          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: C.mono, color: st.fill ? st.color : C.textD }}>{counts[k]}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })()}
                              <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono }}>
                                  <thead>
                                    <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                      {['Porta', 'Nome / Descrição', 'Status', 'VLAN', 'Duplex', 'Speed', 'Tipo'].map(h => (
                                        <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700,
                                          textTransform: 'uppercase', letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sw.interfaceStatus.map((p, i) => {
                                      const st = ifStatusStyle(p.status)
                                      return (
                                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                          <td style={{ padding: '7px 12px', fontWeight: 700, color: C.cyan }}>{p.port}</td>
                                          <td style={{ padding: '7px 12px', color: p.name ? C.text : C.textG }}>{p.name || '—'}</td>
                                          <td style={{ padding: '7px 12px' }}>
                                            {st.fill ? (
                                              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 4,
                                                fontSize: 9, fontWeight: 700, color: st.color,
                                                background: `${st.color}15`, border: `1px solid ${st.color}40` }}>{p.status}</span>
                                            ) : (
                                              <span style={{ fontSize: 9, color: C.textD }}>{p.status || '—'}</span>
                                            )}
                                          </td>
                                          <td style={{ padding: '7px 12px', color: C.textD }}>{p.vlan}</td>
                                          <td style={{ padding: '7px 12px', color: C.textD }}>{p.duplex}</td>
                                          <td style={{ padding: '7px 12px', color: C.textD }}>{p.speed}</td>
                                          <td style={{ padding: '7px 12px', color: C.textD }}>{p.type}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </Panel>
                          ) : (
                            <div style={{ padding: 14, fontSize: 11, color: C.textG,
                              border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                              Seção "show interfaces status" não encontrada no arquivo.
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── TRANSCEIVER DETAIL (DOM) ─────────────────── */}
                      {tab === 'transceiver' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {sw.transceivers.length > 0 ? (
                            <Panel icon="📡" label="show interface transceiver detail — Diagnóstico Óptico (DOM)"
                              color={C.cyan} accent="rgba(34,211,238,0.04)">
                              {(() => {
                                const metrics: { key: keyof TransceiverEntry; label: string; unit: string }[] = [
                                  { key: 'temperature', label: 'Temperatura',     unit: '°C'  },
                                  { key: 'voltage',     label: 'Voltagem',        unit: 'V'   },
                                  { key: 'current',     label: 'Corrente (bias)', unit: 'mA'  },
                                  { key: 'txPower',     label: 'Potência Tx',     unit: 'dBm' },
                                  { key: 'rxPower',     label: 'Potência Rx',     unit: 'dBm' },
                                ]
                                const stColor = (s: string | null) => s === 'alarm' ? C.red : s === 'warn' ? C.orange : s === 'ok' ? C.green : C.textG
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    {sw.transceivers.map(tx => {
                                      const worst = metrics.map(m => txStatus(tx[m.key] as TxMetric | null))
                                        .reduce((a, s) => s === 'alarm' || a === 'alarm' ? 'alarm' : s === 'warn' || a === 'warn' ? 'warn' : (a ?? s), null as any)
                                      return (
                                        <div key={tx.port} style={{
                                          border: `1px solid ${worst === 'alarm' ? C.red : worst === 'warn' ? C.orange : C.border}`,
                                          borderRadius: 8, background: worst === 'alarm' ? `${C.red}0A` : C.surface, overflow: 'hidden',
                                        }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${C.border}` }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: C.cyan, fontFamily: C.mono }}>📡 {tx.port}</span>
                                            {worst && <Badge label={worst === 'alarm' ? 'ALARME' : worst === 'warn' ? 'ATENÇÃO' : 'OK'} color={stColor(worst)} />}
                                          </div>
                                          <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono, whiteSpace: 'nowrap' }}>
                                              <thead>
                                                <tr style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}>
                                                  {['Métrica', 'Valor', 'High Alarm', 'High Warn', 'Low Warn', 'Low Alarm', 'Status'].map(h => (
                                                    <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textG }}>{h}</th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {metrics.map((m, i) => {
                                                  const v = tx[m.key] as TxMetric | null
                                                  const st = txStatus(v)
                                                  const nd = !v   // métrica não reportada pelo transceptor
                                                  return (
                                                    <tr key={m.key} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 ? C.surface : 'transparent' }}>
                                                      <td style={{ padding: '6px 12px', color: C.text }}>{m.label} <span style={{ color: C.textG }}>({m.unit})</span></td>
                                                      <td style={{ padding: '6px 12px', fontWeight: 700, color: nd ? C.textG : stColor(st), fontStyle: nd ? 'italic' : undefined }}>{v ? v.value : 'N/D'}</td>
                                                      <td style={{ padding: '6px 12px', color: C.textD }}>{v ? v.highAlarm : '—'}</td>
                                                      <td style={{ padding: '6px 12px', color: C.textD }}>{v ? v.highWarn : '—'}</td>
                                                      <td style={{ padding: '6px 12px', color: C.textD }}>{v ? v.lowWarn : '—'}</td>
                                                      <td style={{ padding: '6px 12px', color: C.textD }}>{v ? v.lowAlarm : '—'}</td>
                                                      <td style={{ padding: '6px 12px' }}>
                                                        <Badge label={nd ? 'N/D' : st === 'alarm' ? 'ALARME' : st === 'warn' ? 'ATENÇÃO' : 'OK'} color={nd ? C.textG : stColor(st)} />
                                                      </td>
                                                    </tr>
                                                  )
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })()}
                            </Panel>
                          ) : (
                            <div style={{ padding: 14, fontSize: 11, color: C.textG, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                              Nenhum dado de transceiver óptico (DOM) encontrado — o switch não possui portas SFP com monitoramento ou o comando "show interface transceiver detail" não está no arquivo.
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── INVENTÁRIO ───────────────────────────────── */}
                      {tab === 'inventory' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                          {/* MAC Addresses */}
                          {sw.totalMacAddresses !== null && (
                            <Panel icon="🔢" label="Total de Endereços MAC" color={C.cyan} accent="rgba(34,211,238,0.04)">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                                <span style={{ fontSize: 8, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.textG, flexShrink: 0 }}>
                                  Total Mac Addresses for this criterion
                                </span>
                                <span style={{ fontSize: 28, fontWeight: 700, color: C.cyan, fontFamily: C.mono }}>{sw.totalMacAddresses}</span>
                              </div>
                            </Panel>
                          )}

                          {/* MAC Addresses por VLAN */}
                          {sw.macPerVlan.length > 0 && (
                            <Panel icon="🖧" label="show mac address-table count — Endereços MAC por VLAN" color={C.cyan} accent="rgba(34,211,238,0.04)">
                              <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono }}>
                                  <thead>
                                    <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                      {['VLAN', 'Dinâmico', 'Estático', 'Total'].map(h => (
                                        <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sw.macPerVlan.map((v, i) => (
                                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                        <td style={{ padding: '8px 12px' }}>
                                          <span style={{ padding: '2px 8px', background: `${C.cyan}15`, border: `1px solid ${C.cyan}40`, borderRadius: 4, color: C.cyan, fontWeight: 700, fontSize: 10 }}>
                                            VLAN {v.vlan}
                                          </span>
                                        </td>
                                        <td style={{ padding: '8px 12px', color: C.text }}>{v.dynamic}</td>
                                        <td style={{ padding: '8px 12px', color: C.textD }}>{v.staticCount}</td>
                                        <td style={{ padding: '8px 12px', fontWeight: 700, color: C.orange }}>{v.total}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </Panel>
                          )}

                          {/* Spanning Tree Topology */}
                          {sw.stpTopo.length > 0 && (
                            <Panel icon="🌳" label="show spanning-tree detail — Mudanças de Topologia" color={C.orange} accent="rgba(245,158,11,0.05)">
                              <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono }}>
                                  <thead>
                                    <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                      {['Instância', 'Nº Mudanças', 'Última Mudança', 'Porta de Origem'].map(h => (
                                        <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sw.stpTopo.map((s, i) => (
                                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                        <td style={{ padding: '8px 12px' }}>
                                          <span style={{ padding: '2px 8px', background: `${C.orange}15`, border: `1px solid ${C.orange}40`, borderRadius: 4, color: C.orange, fontWeight: 700, fontSize: 10 }}>
                                            {s.instance}
                                          </span>
                                        </td>
                                        <td style={{ padding: '8px 12px', fontWeight: 700, color: s.changes > 10 ? C.orange : C.text }}>{s.changes}</td>
                                        <td style={{ padding: '8px 12px', color: C.textD }}>{s.lastChange} atrás</td>
                                        <td style={{ padding: '8px 12px', color: C.textD }}>{s.fromPort}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </Panel>
                          )}

                          {/* SFP Inventory */}
                          {sw.sfpInventory.length > 0 ? (
                            <Panel icon="🔌" label="show inventory — Módulos SFP por Porta" color={C.purple} accent="rgba(139,92,246,0.05)">
                              <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: C.mono }}>
                                  <thead>
                                    <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                                      {['Porta (NAME)', 'Descrição (DESCR)', 'Modelo (PID)', 'S/N'].map(h => (
                                        <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.textG }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sw.sfpInventory.map((s, i) => (
                                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.surface }}>
                                        <td style={{ padding: '8px 12px' }}>
                                          <span style={{ padding: '2px 8px', background: `${C.purple}15`, border: `1px solid ${C.purple}40`, borderRadius: 4, color: C.purple, fontWeight: 700, fontSize: 10 }}>
                                            {s.port}
                                          </span>
                                        </td>
                                        <td style={{ padding: '8px 12px', color: C.text }}>{s.descr}</td>
                                        <td style={{ padding: '8px 12px', fontWeight: 700, color: C.cyan }}>{s.pid}</td>
                                        <td style={{ padding: '8px 12px', color: C.textD, fontSize: 9 }}>{s.sn}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </Panel>
                          ) : (
                            <div style={{ padding: 14, fontSize: 11, color: C.textG, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                              Nenhum módulo SFP identificado por porta no arquivo.
                            </div>
                          )}
                        </div>
                      )}

                    </div>{/* end tab content */}
                  </div>
                )}{/* end detail panel */}
              </div>
            )}{/* end list+detail */}
          </>
        )}{/* end detail view */}
      </div>
    </div>
  )
}
