/**
 * LiveConnectPanel.tsx — Monitor Live com dashboard por switch
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  SwitchCredentials, CollectRequest, CollectResponse,
  SwitchResult, SwitchError, CommandPreset, BackendStatus, ConnectionProfile,
} from '@shared/types'

const C = {
  bg:'#0f172a',panel:'#0d1b2e',surface:'#1e293b',raised:'#263347',
  border:'rgba(255,255,255,0.07)',borderB:'rgba(255,255,255,0.13)',
  text:'rgba(255,255,255,0.85)',textD:'rgba(255,255,255,0.45)',textG:'rgba(255,255,255,0.2)',
  blue:'#3b82f6',cyan:'#22d3ee',purple:'#8b5cf6',
  green:'#10b981',orange:'#f59e0b',red:'#ef4444',
  mono:"'JetBrains Mono', monospace",
}

type SubTab = 'overview'|'interfaces'|'cpu_mem'|'environment'|'stp'|'raw'
const SUB_TABS:{id:SubTab;label:string}[] = [
  {id:'overview',label:'Visão Geral'},{id:'interfaces',label:'Interfaces'},
  {id:'cpu_mem',label:'CPU / Mem'},{id:'environment',label:'Ambiente'},
  {id:'stp',label:'Spanning Tree'},{id:'raw',label:'Raw Output'},
]

const PRESET_INFO:Record<CommandPreset,{label:string;desc:string}> = {
  basic:        {label:'Básico',       desc:'show version · show clock'},
  cpu_memory:   {label:'CPU / Mem',    desc:'show processes cpu sorted · memory sorted'},
  interfaces:   {label:'Interfaces',   desc:'show interfaces status · ip int brief · errors'},
  spanning_tree:{label:'Spanning Tree',desc:'show spanning-tree summary · detail'},
  full_health:  {label:'Full Health',  desc:'Todos os presets + environment all'},
  showtech_full:{label:'Show Tech',    desc:'18 comandos: running-config, CDP, inventory…'},
  custom:       {label:'Customizado',  desc:'Comandos personalizados'},
}

function fmtMs(ms:number){return ms>=1000?(ms/1000).toFixed(1)+'s':Math.round(ms)+'ms'}
function getRaw(r:SwitchResult,s:string){return r.commands.find(c=>c.command.toLowerCase().startsWith(s.toLowerCase()))?.raw_output??''}
function parseCpuFromRaw(raw:string):number|null{const m=raw.match(/five seconds:\s*(\d+)%/);return m?parseInt(m[1]):null}
function parseMemFromRaw(raw:string):{pct:number|null;usedMB:number|null;totalMB:number|null}{
  const m=raw.match(/Total:\s*(\d+)\s+Used:\s*(\d+)/);
  if(!m)return{pct:null,usedMB:null,totalMB:null};
  const total=parseInt(m[1]),used=parseInt(m[2]);
  return{totalMB:Math.round(total/1048576),usedMB:Math.round(used/1048576),pct:total>0?Math.round((used/total)*100):null};
}
function parseInterfaceTable(raw:string){
  return raw.split('\n').filter(l=>/^\S/.test(l)&&!/^Port|^---/.test(l)).map(line=>{
    const p=line.trim().split(/\s+/);
    return{name:p[0]??'',status:p[1]??'',vlan:p[2]??'',duplex:p[3]??'',speed:p[4]??'',type:p.slice(5).join(' ')};
  }).filter(r=>r.name&&r.status&&r.status!=='Status');
}
function parseEnvTemp(raw:string){
  const rows:{sensor:string;temp:string;state:string}[]=[];
  for(const line of raw.split('\n')){
    const m=line.match(/(.+?)\s+(\d+)\s+Degrees\s+Celsius\s+(\w+)/i);
    if(m)rows.push({sensor:m[1].trim(),temp:`${m[2]}°C`,state:m[3]});
  }
  return rows;
}

function Pill({text,color}:{text:string;color:string}){
  return <span style={{fontSize:10,padding:'1px 7px',borderRadius:4,fontFamily:C.mono,background:`${color}18`,border:`1px solid ${color}44`,color}}>{text}</span>
}

function Gauge({value,label,size=100}:{value:number|null;label:string;size?:number}){
  const pct=value??0,col=pct>=80?C.red:pct>=60?C.orange:C.green;
  const r=(size/2)-8,circ=2*Math.PI*r,dash=circ*(pct/100);
  return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
      <div style={{position:'relative',width:size,height:size}}>
        <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8}/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={8}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{transition:'stroke-dasharray .6s ease,stroke .3s'}}/>
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontSize:size>90?20:16,fontWeight:700,color:value===null?C.textG:col,fontFamily:C.mono}}>
            {value!==null?`${value}%`:'—'}
          </span>
        </div>
      </div>
      <span style={{fontSize:10,color:C.textD}}>{label}</span>
    </div>
  )
}

function InfoCard({title,rows}:{title:string;rows:[string,string|null][]}) {
  return(
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px'}}>
      <div style={{fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>{title}</div>
      {rows.map(([k,v])=>(
        <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
          <span style={{fontSize:11,color:C.textD}}>{k}</span>
          <span style={{fontSize:11,color:v?C.text:C.textG,fontFamily:C.mono,maxWidth:'55%',textAlign:'right',wordBreak:'break-all'}}>{v||'N/A'}</span>
        </div>
      ))}
    </div>
  )
}

function Empty({msg}:{msg:string}){
  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:180,color:C.textG,fontSize:12,textAlign:'center',padding:20}}>{msg}</div>
}

// ─── Sub-tabs ──────────────────────────────────────────────────────────────
function OverviewTab({r}:{r:SwitchResult}){
  const cpuRaw=getRaw(r,'show processes cpu'),memRaw=getRaw(r,'show processes memory');
  const verRaw=getRaw(r,'show version'),envRaw=getRaw(r,'show environment');
  const cpu5s=parseCpuFromRaw(cpuRaw),mem=parseMemFromRaw(memRaw);
  const uptime=verRaw.match(/uptime is (.+?)(?:\r?\n|$)/i)?.[1]?.trim()??null;
  const reload=verRaw.match(/System returned to ROM by (.+?)(?:\r?\n|$)/i)?.[1]?.trim()??null;
  const temp=parseEnvTemp(envRaw)[0];
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:200}}>
          <InfoCard title="Identificação" rows={[['Hostname',r.hostname],['Plataforma',r.platform],['IOS Version',r.ios_version],['IP de Coleta',r.host],['Uptime',uptime],['Reiniciado por',reload]]}/>
        </div>
        <div style={{flex:1,minWidth:200}}>
          <InfoCard title="Coleta" rows={[['Comandos',`${r.commands.length}`],['Duração',fmtMs(r.total_duration_ms)],['Hora',new Date().toLocaleTimeString('pt-BR')],['Temperatura',temp?`${temp.temp} (${temp.state})`:null]]}/>
        </div>
      </div>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'14px 18px'}}>
        <div style={{fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>Utilização em Tempo Real</div>
        <div style={{display:'flex',gap:28,alignItems:'center',flexWrap:'wrap'}}>
          <Gauge value={cpu5s} label="CPU (5s)" size={110}/>
          <Gauge value={mem.pct} label="Memória" size={110}/>
          <div style={{flex:1,minWidth:180}}>
            {[
              {l:'CPU 5s',v:cpu5s,max:100,u:'%'},
              {l:'Mem Usada',v:mem.usedMB,max:mem.totalMB??1024,u:' MB'},
              {l:'Mem Total',v:mem.totalMB,max:mem.totalMB??1024,u:' MB'},
            ].map(b=>(
              <div key={b.l} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0'}}>
                <span style={{fontSize:11,color:C.textD,width:90,flexShrink:0}}>{b.l}</span>
                <div style={{flex:1,height:6,borderRadius:3,background:'rgba(255,255,255,0.07)',overflow:'hidden'}}>
                  <div style={{width:`${b.v!==null?Math.min((b.v/b.max)*100,100):0}%`,height:'100%',
                    background:b.v!==null&&b.v/b.max>=.8?C.red:b.v!==null&&b.v/b.max>=.6?C.orange:C.green,
                    borderRadius:3,transition:'width .5s'}}/>
                </div>
                <span style={{fontSize:11,color:C.cyan,width:60,textAlign:'right',fontFamily:C.mono,flexShrink:0}}>{b.v!==null?`${b.v}${b.u}`:'—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function InterfacesTab({r}:{r:SwitchResult}){
  const raw=getRaw(r,'show interfaces status'),rows=parseInterfaceTable(raw);
  const ipBrief=getRaw(r,'show ip interface brief');
  const errors=getRaw(r,'show interfaces counters errors');
  if(!raw&&!ipBrief)return<Empty msg="Use preset 'Interfaces' ou 'Full Health' para ver dados de interfaces."/>
  const conn=rows.filter(r=>r.status==='connected').length;
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',gap:7}}>
        <Pill text={`${rows.length} portas`} color={C.textD}/>
        <Pill text={`${conn} conectadas`} color={C.green}/>
        <Pill text={`${rows.length-conn} down`} color={rows.length-conn>0?C.orange:C.textD}/>
      </div>
      {rows.length>0&&(
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
          <div style={{padding:'7px 12px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1}}>show interfaces status</div>
          <div style={{maxHeight:280,overflowY:'auto'}} className="nw-scroll">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead><tr style={{background:C.raised}}>{['Interface','Status','VLAN','Duplex','Speed','Tipo'].map(h=><th key={h} style={{padding:'5px 10px',textAlign:'left',color:C.textD,fontWeight:600}}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((row,i)=>(
                  <tr key={i} style={{borderTop:'1px solid rgba(255,255,255,0.04)'}}>
                    <td style={{padding:'4px 10px',color:C.cyan,fontFamily:C.mono}}>{row.name}</td>
                    <td style={{padding:'4px 10px'}}><Pill text={row.status} color={row.status==='connected'?C.green:row.status==='err-disabled'?C.red:C.textD}/></td>
                    <td style={{padding:'4px 10px',color:C.text}}>{row.vlan}</td>
                    <td style={{padding:'4px 10px',color:C.textD}}>{row.duplex}</td>
                    <td style={{padding:'4px 10px',color:C.textD}}>{row.speed}</td>
                    <td style={{padding:'4px 10px',color:C.textG,fontSize:10}}>{row.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {ipBrief&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}><div style={{padding:'7px 12px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1}}>show ip interface brief</div><pre style={{margin:0,padding:'10px 12px',fontSize:11,color:C.textD,whiteSpace:'pre-wrap',wordBreak:'break-word',maxHeight:200,overflowY:'auto'}}>{ipBrief}</pre></div>}
      {errors&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}><div style={{padding:'7px 12px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1}}>Contadores de Erros</div><pre style={{margin:0,padding:'10px 12px',fontSize:11,color:C.textD,whiteSpace:'pre-wrap',maxHeight:200,overflowY:'auto'}}>{errors}</pre></div>}
    </div>
  )
}

function CpuMemTab({r}:{r:SwitchResult}){
  const cpuRaw=getRaw(r,'show processes cpu'),memRaw=getRaw(r,'show processes memory');
  const mem=parseMemFromRaw(memRaw),cpu5s=parseCpuFromRaw(cpuRaw);
  const cpuLines=cpuRaw.split('\n').filter(l=>/^\s+\d+/.test(l)).slice(0,12);
  const memLines=memRaw.split('\n').filter(l=>/^\s+\d+/.test(l)).slice(0,12);
  if(!cpuRaw&&!memRaw)return<Empty msg="Use preset 'CPU/Mem' ou 'Full Health'."/>
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',gap:12}}>
        <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'14px',display:'flex',justifyContent:'center'}}><Gauge value={cpu5s} label="CPU — 5 segundos" size={120}/></div>
        <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'14px',display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
          <Gauge value={mem.pct} label="Memória Processor Pool" size={120}/>
          {mem.usedMB!==null&&<span style={{fontSize:11,color:C.textD}}>{mem.usedMB} MB / {mem.totalMB} MB</span>}
        </div>
      </div>
      {cpuLines.length>0&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}><div style={{padding:'7px 12px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1}}>Top Processos — CPU</div><pre style={{margin:0,padding:'10px 12px',fontSize:11,color:C.textD,whiteSpace:'pre-wrap',maxHeight:220,overflowY:'auto'}}>{cpuLines.join('\n')}</pre></div>}
      {memLines.length>0&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}><div style={{padding:'7px 12px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1}}>Top Processos — Memória</div><pre style={{margin:0,padding:'10px 12px',fontSize:11,color:C.textD,whiteSpace:'pre-wrap',maxHeight:220,overflowY:'auto'}}>{memLines.join('\n')}</pre></div>}
    </div>
  )
}

function EnvironmentTab({r}:{r:SwitchResult}){
  const raw=getRaw(r,'show environment'),temps=parseEnvTemp(raw);
  if(!raw)return<Empty msg="Use preset 'Full Health' para dados de ambiente."/>
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {temps.length>0&&(
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 14px'}}>
          <div style={{fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Sensores de Temperatura</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
            {temps.map((t,i)=>{
              const col=t.state.toLowerCase().includes('ok')||t.state.toLowerCase().includes('normal')?C.green:t.state.toLowerCase().includes('warn')?C.orange:C.red;
              return(
                <div key={i} style={{padding:'10px 14px',borderRadius:7,background:`${col}0f`,border:`1px solid ${col}33`,minWidth:160}}>
                  <div style={{fontSize:10,color:C.textD,marginBottom:4}}>{t.sensor}</div>
                  <div style={{fontSize:24,fontWeight:700,color:col,fontFamily:C.mono}}>{t.temp}</div>
                  <Pill text={t.state} color={col}/>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
        <div style={{padding:'7px 12px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1}}>show environment all</div>
        <pre style={{margin:0,padding:'10px 12px',fontSize:11,color:C.textD,whiteSpace:'pre-wrap',maxHeight:320,overflowY:'auto'}}>{raw}</pre>
      </div>
    </div>
  )
}

function StpTab({r}:{r:SwitchResult}){
  const summRaw=getRaw(r,'show spanning-tree summary'),detRaw=getRaw(r,'show spanning-tree detail');
  if(!summRaw&&!detRaw)return<Empty msg="Use preset 'Spanning Tree' ou 'Full Health'."/>
  const mode=summRaw.match(/Switch is in\s+(\S+)\s+mode/i)?.[1]??'N/A';
  const topo=summRaw.match(/topology change/i)?'Mudanças detectadas':'Estável';
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',gap:10}}>
        <div style={{padding:'10px 14px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8}}>
          <div style={{fontSize:10,color:C.textD,marginBottom:4}}>Modo STP</div>
          <div style={{fontSize:16,fontWeight:700,color:C.cyan,fontFamily:C.mono}}>{mode}</div>
        </div>
        <div style={{padding:'10px 14px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8}}>
          <div style={{fontSize:10,color:C.textD,marginBottom:4}}>Status Topologia</div>
          <div style={{fontSize:14,fontWeight:700,color:topo.includes('Mudanças')?C.orange:C.green}}>{topo}</div>
        </div>
      </div>
      {summRaw&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}><div style={{padding:'7px 12px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1}}>show spanning-tree summary</div><pre style={{margin:0,padding:'10px 12px',fontSize:11,color:C.textD,whiteSpace:'pre-wrap',maxHeight:240,overflowY:'auto'}}>{summRaw}</pre></div>}
      {detRaw&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}><div style={{padding:'7px 12px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1}}>show spanning-tree detail</div><pre style={{margin:0,padding:'10px 12px',fontSize:11,color:C.textD,whiteSpace:'pre-wrap',maxHeight:240,overflowY:'auto'}}>{detRaw}</pre></div>}
    </div>
  )
}

function RawTab({r}:{r:SwitchResult}){
  const [open,setOpen]=useState<number|null>(0);
  return(
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {r.commands.map((cmd,i)=>(
        <div key={i} style={{borderRadius:7,border:`1px solid ${open===i?C.cyan:C.border}`,overflow:'hidden',transition:'border-color .15s'}}>
          <div onClick={()=>setOpen(open===i?null:i)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 12px',background:C.surface,cursor:'pointer'}}>
            <span style={{fontSize:11,color:open===i?C.cyan:C.text,fontFamily:C.mono}}>$ {cmd.command}</span>
            <div style={{display:'flex',gap:7,alignItems:'center'}}>
              {cmd.parsed_output!==null&&<Pill text="parsed" color={C.green}/>}
              {cmd.parse_error&&<Pill text="raw only" color={C.orange}/>}
              <span style={{fontSize:10,color:C.textD}}>{fmtMs(cmd.duration_ms)}</span>
              <span style={{color:C.textG,fontSize:11}}>{open===i?'▲':'▼'}</span>
            </div>
          </div>
          {open===i&&(
            <div style={{background:'#080f1a',padding:'10px 12px'}}>
              {cmd.parsed_output!==null&&(
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:C.green,marginBottom:5,textTransform:'uppercase',letterSpacing:1}}>Saída Parseada (JSON)</div>
                  <pre style={{fontSize:11,color:'#a5f3fc',margin:0,whiteSpace:'pre-wrap',wordBreak:'break-word',maxHeight:200,overflowY:'auto'}}>{JSON.stringify(cmd.parsed_output,null,2)}</pre>
                </div>
              )}
              <div style={{fontSize:10,color:C.textD,marginBottom:5,textTransform:'uppercase',letterSpacing:1}}>Output Raw</div>
              <pre style={{fontSize:11,color:C.textD,margin:0,whiteSpace:'pre-wrap',wordBreak:'break-word',maxHeight:300,overflowY:'auto'}}>{cmd.raw_output||'(vazio)'}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SwitchDashboard({result}:{result:SwitchResult|SwitchError}){
  const [subTab,setSubTab]=useState<SubTab>('overview');
  if(!result.success){
    const e=result as SwitchError;
    return(
      <div style={{padding:24}}>
        <div style={{padding:16,borderRadius:8,background:'rgba(239,68,68,.07)',border:'1px solid rgba(239,68,68,.2)'}}>
          <div style={{color:C.red,fontWeight:700,marginBottom:6,fontSize:13}}>✗ Falha — {e.error_code}</div>
          <div style={{color:C.textD,fontSize:12}}>{e.detail}</div>
        </div>
      </div>
    );
  }
  const r=result as SwitchResult;
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'12px 18px',borderBottom:`1px solid ${C.border}`,background:C.panel,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:C.green,boxShadow:`0 0 8px ${C.green}`,animation:'pulse 2.5s infinite',flexShrink:0}}/>
          <div>
            <div style={{fontSize:17,fontWeight:700,color:C.cyan}}>{r.hostname??r.host}</div>
            <div style={{fontSize:10,color:C.textD}}>{r.platform} · IOS {r.ios_version??'N/A'} · {r.host} · {fmtMs(r.total_duration_ms)} · {r.commands.length} cmds</div>
          </div>
        </div>
      </div>
      <div style={{display:'flex',gap:2,padding:'8px 12px',borderBottom:`1px solid ${C.border}`,background:C.panel,flexShrink:0,flexWrap:'wrap'}}>
        {SUB_TABS.map(st=>(
          <button key={st.id} onClick={()=>setSubTab(st.id)} style={{
            background:subTab===st.id?'rgba(34,211,238,.1)':'transparent',
            border:subTab===st.id?'1px solid rgba(34,211,238,.3)':'1px solid transparent',
            borderRadius:5,padding:'4px 11px',cursor:'pointer',
            color:subTab===st.id?C.cyan:C.textD,fontFamily:C.mono,fontSize:11,
            fontWeight:subTab===st.id?700:400,transition:'all .12s',
          }}>{st.label}</button>
        ))}
      </div>
      <div className="nw-scroll" style={{flex:1,overflowY:'auto',padding:'14px 18px'}}>
        {subTab==='overview'   &&<OverviewTab    r={r}/>}
        {subTab==='interfaces' &&<InterfacesTab  r={r}/>}
        {subTab==='cpu_mem'    &&<CpuMemTab       r={r}/>}
        {subTab==='environment'&&<EnvironmentTab  r={r}/>}
        {subTab==='stp'        &&<StpTab          r={r}/>}
        {subTab==='raw'        &&<RawTab          r={r}/>}
      </div>
    </div>
  );
}

interface LiveConnectPanelProps{onLiveCountChange?:(n:number)=>void}

export default function LiveConnectPanel({onLiveCountChange}:LiveConnectPanelProps){
  const [backendStatus,setBackendStatus]=useState<BackendStatus|null>(null);
  const [startingBackend,setStartingBackend]=useState(false);
  const [switches,setSwitches]=useState<(SwitchCredentials&{id:string})[]>([{id:crypto.randomUUID(),host:'',username:'admin',password:'',port:22}]);
  const [showPass,setShowPass]=useState<Record<string,boolean>>({});
  const [preset,setPreset]=useState<CommandPreset>('full_health');
  const [customCmds,setCustomCmds]=useState('');
  const [collecting,setCollecting]=useState(false);
  const [autoRefresh,setAutoRefresh]=useState(false);
  const [refreshInterval,setRefreshInterval]=useState(60);
  const autoTimer=useRef<ReturnType<typeof setInterval>|null>(null);
  const [response,setResponse]=useState<CollectResponse|null>(null);
  const [collectedAt,setCollectedAt]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [selectedHost,setSelectedHost]=useState<string|null>(null);
  const [profiles,setProfiles]=useState<ConnectionProfile[]>(()=>{try{return JSON.parse(localStorage.getItem('nw_profiles')??'[]')}catch{return[]}});
  const [profileLabel,setProfileLabel]=useState('');
  const [showSaveProfile,setShowSaveProfile]=useState(false);

  useEffect(()=>{
    const poll=async()=>{if(window.electronAPI)setBackendStatus(await window.electronAPI.getBackendStatus())};
    poll();const t=setInterval(poll,3000);return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    if(autoTimer.current)clearInterval(autoTimer.current);
    if(autoRefresh)autoTimer.current=setInterval(()=>{if(!collecting)runCollect()},refreshInterval*1000);
    return()=>{if(autoTimer.current)clearInterval(autoTimer.current)};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoRefresh,refreshInterval,collecting]);

  const runCollect=useCallback(async()=>{
    if(!window.electronAPI)return;
    const valid=switches.filter(s=>s.host.trim());
    if(!valid.length){setError('Informe ao menos um IP de switch.');return}
    setCollecting(true);setError(null);
    try{
      const req:CollectRequest={switches:valid.map(s=>({host:s.host.trim(),username:s.username,password:s.password,port:s.port})),preset,commands:preset==='custom'?customCmds.split('\n').map(c=>c.trim()).filter(Boolean):undefined,parse_output:true};
      const res=await window.electronAPI.collectSwitchData(req);
      setResponse(res);setCollectedAt(new Date().toLocaleTimeString('pt-BR'));
      setSelectedHost(res.results[0]?.host??null);
      onLiveCountChange?.(res.succeeded);
    }catch(e:unknown){setError(e instanceof Error?e.message:String(e))}
    finally{setCollecting(false)}
  },[switches,preset,customCmds,onLiveCountChange]);

  const handlePing=async(sw:SwitchCredentials&{id:string})=>{
    if(!window.electronAPI||!sw.host)return;
    try{const r=await window.electronAPI.pingSwitchSsh({host:sw.host,username:sw.username,password:sw.password,port:sw.port});alert(r.success?`✅ ${sw.host}\nPrompt: ${r.prompt}\n⏱ ${r.duration_ms?.toFixed(0)}ms`:`❌ ${sw.host}\n${r.detail}`)}catch(e){alert(`Erro: ${e}`)}
  };

  const saveProfile=()=>{
    const p:ConnectionProfile={id:crypto.randomUUID(),label:profileLabel||`Perfil ${profiles.length+1}`,host:switches[0]?.host??'',username:switches[0]?.username??'admin',port:switches[0]?.port??22};
    const u=[...profiles,p];setProfiles(u);localStorage.setItem('nw_profiles',JSON.stringify(u));setShowSaveProfile(false);setProfileLabel('');
  };

  const currentResult=response?.results.find(r=>r.host===selectedHost)??null;

  return(
    <div style={{display:'flex',height:'100%',background:C.bg,color:C.text,fontFamily:C.mono,overflow:'hidden'}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .nw-input{background:${C.surface};border:1px solid ${C.border};color:${C.text};border-radius:6px;padding:6px 9px;font-family:${C.mono};font-size:12px;outline:none;width:100%;transition:border-color .15s;box-sizing:border-box;}
        .nw-input:focus{border-color:${C.cyan};}
        .nw-btn{border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-family:${C.mono};font-size:12px;font-weight:600;transition:opacity .15s,transform .1s;}
        .nw-btn:hover{opacity:.85;}.nw-btn:active{transform:scale(.97);}.nw-btn:disabled{opacity:.4;cursor:not-allowed;}
        .nw-scroll::-webkit-scrollbar{width:4px;height:4px;}.nw-scroll::-webkit-scrollbar-track{background:transparent;}.nw-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:4px;}
      `}</style>

      {/* LEFT */}
      <div className="nw-scroll" style={{width:286,flexShrink:0,borderRight:`1px solid ${C.border}`,overflowY:'auto',display:'flex',flexDirection:'column',gap:12,padding:'11px 11px'}}>
        {/* Backend */}
        <div style={{display:'flex',flexDirection:'column',gap:5}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:backendStatus?.running?C.green:C.red,background:backendStatus?.running?'rgba(16,185,129,.1)':'rgba(239,68,68,.1)',border:`1px solid ${backendStatus?.running?'rgba(16,185,129,.25)':'rgba(239,68,68,.25)'}`,borderRadius:5,padding:'3px 8px'}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:backendStatus?.running?C.green:C.red,display:'inline-block',animation:backendStatus?.running?'pulse 2s infinite':'none',boxShadow:backendStatus?.running?`0 0 5px ${C.green}`:'none'}}/>
              {backendStatus?.running?`Backend :${backendStatus.port}`:'Backend offline'}
            </div>
            {backendStatus&&!backendStatus.running&&(
              <button className="nw-btn" disabled={startingBackend} style={{background:C.blue,color:'#fff',fontSize:11}}
                onClick={async()=>{if(!window.electronAPI)return;setStartingBackend(true);setBackendStatus(await window.electronAPI.startBackend());setStartingBackend(false)}}>
                {startingBackend?'⟳':'▶ Iniciar'}
              </button>
            )}
          </div>
          {backendStatus?.error&&<div style={{fontSize:10,color:C.red,background:'rgba(239,68,68,.07)',border:'1px solid rgba(239,68,68,.15)',borderRadius:5,padding:'5px 8px',wordBreak:'break-all'}}>{backendStatus.error}</div>}
        </div>

        {/* Switches */}
        <section>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <label style={{fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1}}>Switches</label>
            <button className="nw-btn" onClick={()=>setSwitches(p=>[...p,{id:crypto.randomUUID(),host:'',username:'admin',password:'',port:22}])} style={{background:C.surface,color:C.text,padding:'2px 8px',fontSize:11}}>+ Add</button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            {switches.map(sw=>(
              <div key={sw.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px 9px'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                  <span style={{fontSize:10,color:C.textD}}>Switch</span>
                  <div style={{display:'flex',gap:3}}>
                    <button className="nw-btn" onClick={()=>handlePing(sw)} style={{background:'rgba(34,211,238,.1)',color:C.cyan,padding:'1px 7px',fontSize:10}}>ping</button>
                    {switches.length>1&&<button className="nw-btn" onClick={()=>setSwitches(p=>p.filter(s=>s.id!==sw.id))} style={{background:'rgba(239,68,68,.1)',color:C.red,padding:'1px 7px',fontSize:10}}>✕</button>}
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <input className="nw-input" placeholder="IP / hostname" value={sw.host} onChange={e=>setSwitches(p=>p.map(s=>s.id===sw.id?{...s,host:e.target.value}:s))}/>
                  <div style={{display:'flex',gap:4}}>
                    <input className="nw-input" placeholder="Usuário" value={sw.username} style={{flex:1}} onChange={e=>setSwitches(p=>p.map(s=>s.id===sw.id?{...s,username:e.target.value}:s))}/>
                    <input className="nw-input" type="number" placeholder="22" value={sw.port} style={{width:52}} onChange={e=>setSwitches(p=>p.map(s=>s.id===sw.id?{...s,port:parseInt(e.target.value)||22}:s))}/>
                  </div>
                  <div style={{position:'relative'}}>
                    <input className="nw-input" placeholder="Senha" type={showPass[sw.id]?'text':'password'} value={sw.password} style={{paddingRight:28}} onChange={e=>setSwitches(p=>p.map(s=>s.id===sw.id?{...s,password:e.target.value}:s))}/>
                    <button onClick={()=>setShowPass(p=>({...p,[sw.id]:!p[sw.id]}))} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:C.textD,fontSize:12}}>{showPass[sw.id]?'🙈':'👁'}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Profiles */}
        {profiles.length>0&&(
          <section>
            <label style={{fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1,display:'block',marginBottom:5}}>Perfis Salvos</label>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              {profiles.map(p=>(
                <div key={p.id} style={{display:'flex',alignItems:'center',background:C.surface,border:`1px solid ${C.border}`,borderRadius:5,padding:'4px 8px'}}>
                  <button onClick={()=>setSwitches([{id:crypto.randomUUID(),host:p.host,username:p.username,password:'',port:p.port}])} style={{background:'none',border:'none',color:C.text,cursor:'pointer',fontSize:11,flex:1,textAlign:'left'}}>
                    <span style={{color:C.cyan}}>{p.label}</span><span style={{color:C.textD,marginLeft:6}}>{p.host}</span>
                  </button>
                  <button onClick={()=>{const u=profiles.filter(x=>x.id!==p.id);setProfiles(u);localStorage.setItem('nw_profiles',JSON.stringify(u))}} style={{background:'none',border:'none',color:C.textD,cursor:'pointer',fontSize:11}}>✕</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Preset */}
        <section>
          <label style={{fontSize:10,color:C.textD,textTransform:'uppercase',letterSpacing:1,display:'block',marginBottom:5}}>Preset de Coleta</label>
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            {(Object.entries(PRESET_INFO) as [CommandPreset,{label:string;desc:string}][]).map(([k,info])=>(
              <button key={k} className="nw-btn" onClick={()=>setPreset(k)} style={{textAlign:'left',padding:'7px 9px',background:preset===k?'rgba(34,211,238,.1)':C.surface,border:`1px solid ${preset===k?C.cyan:C.border}`,color:preset===k?C.cyan:C.text,display:'flex',flexDirection:'column',gap:1}}>
                <span style={{fontWeight:700,fontSize:11}}>{info.label}</span>
                <span style={{fontSize:9,color:C.textD,fontWeight:400}}>{info.desc}</span>
              </button>
            ))}
          </div>
          {preset==='custom'&&<textarea className="nw-input" placeholder="show version&#10;show interfaces status" rows={4} value={customCmds} onChange={e=>setCustomCmds(e.target.value)} style={{marginTop:6,resize:'vertical'}}/>}
        </section>

        {/* Auto-refresh */}
        <section style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px 9px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:autoRefresh?6:0}}>
            <span style={{fontSize:10,color:C.textD}}>Auto-Refresh</span>
            <button className="nw-btn" onClick={()=>setAutoRefresh(p=>!p)} style={{background:autoRefresh?'rgba(16,185,129,.1)':C.raised,color:autoRefresh?C.green:C.textD,border:`1px solid ${autoRefresh?'rgba(16,185,129,.25)':C.border}`,padding:'2px 9px',fontSize:10}}>
              {autoRefresh?'🔁 Ativo':'⏸ Off'}
            </button>
          </div>
          {autoRefresh&&<div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:10,color:C.textD}}>A cada</span><input className="nw-input" type="number" min={10} max={3600} value={refreshInterval} style={{width:60}} onChange={e=>setRefreshInterval(parseInt(e.target.value)||60)}/><span style={{fontSize:10,color:C.textD}}>s</span></div>}
        </section>

        {/* Save profile */}
        {showSaveProfile?(
          <div style={{display:'flex',gap:4}}>
            <input className="nw-input" placeholder="Nome do perfil" value={profileLabel} onChange={e=>setProfileLabel(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveProfile()}/>
            <button className="nw-btn" onClick={saveProfile} style={{background:C.green,color:'#fff',whiteSpace:'nowrap'}}>✓</button>
            <button className="nw-btn" onClick={()=>setShowSaveProfile(false)} style={{background:C.surface,color:C.textD}}>✕</button>
          </div>
        ):(
          <button className="nw-btn" onClick={()=>setShowSaveProfile(true)} style={{background:C.surface,color:C.textD,border:`1px solid ${C.border}`,fontSize:11}}>💾 Salvar perfil</button>
        )}

        {/* Collect button */}
        <button className="nw-btn" disabled={collecting||!backendStatus?.running} onClick={runCollect} style={{background:collecting?C.surface:`linear-gradient(135deg,${C.blue},${C.cyan})`,color:collecting?C.textD:'#fff',border:collecting?`1px solid ${C.border}`:'none',padding:'10px 0',fontSize:13,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          {collecting?<><span style={{display:'inline-block',animation:'spin 1s linear infinite'}}>⟳</span>Coletando…</>:'⚡ Coletar via SSH'}
        </button>

        {error&&<div style={{fontSize:11,color:C.red,padding:'8px 9px',background:'rgba(239,68,68,.07)',border:'1px solid rgba(239,68,68,.2)',borderRadius:6}}>⚠ {error}</div>}
      </div>

      {/* RIGHT */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {!response?(
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,color:C.textG}}>
            <span style={{fontSize:50}}>📡</span>
            <div style={{textAlign:'center'}}>
              <p style={{fontSize:13,fontFamily:C.mono,marginBottom:5,color:C.textD}}>Nenhuma coleta realizada</p>
              <p style={{fontSize:11}}>Configure os switches e clique em Coletar via SSH</p>
            </div>
          </div>
        ):(
          <>
            <div style={{display:'flex',alignItems:'center',gap:7,padding:'7px 14px',borderBottom:`1px solid ${C.border}`,background:C.panel,flexShrink:0,flexWrap:'wrap'}}>
              <span style={{fontSize:10,color:C.textD}}>Coletado às {collectedAt}</span>
              <span style={{fontSize:10,color:C.green,background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.2)',borderRadius:4,padding:'1px 7px'}}>✓ {response.succeeded}</span>
              {response.failed>0&&<span style={{fontSize:10,color:C.red,background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:4,padding:'1px 7px'}}>✗ {response.failed}</span>}
              <div style={{display:'flex',gap:4,marginLeft:'auto',flexWrap:'wrap'}}>
                {response.results.map(r=>(
                  <button key={r.host} onClick={()=>setSelectedHost(r.host)} className="nw-btn" style={{background:selectedHost===r.host?(r.success?'rgba(34,211,238,.1)':'rgba(239,68,68,.1)'):C.surface,border:`1px solid ${selectedHost===r.host?(r.success?C.cyan:C.red):C.border}`,color:r.success?(selectedHost===r.host?C.cyan:C.text):C.red,fontSize:11,padding:'4px 11px'}}>
                    {r.success?'✓':'✗'} {r.host}
                  </button>
                ))}
              </div>
            </div>
            {currentResult&&<SwitchDashboard result={currentResult}/>}
          </>
        )}
      </div>
    </div>
  );
}
