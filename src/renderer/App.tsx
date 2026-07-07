import { useEffect, useState } from 'react'
import ShowtechView from '@/components/ShowtechView'
import LiveConnectPanel from '@/components/LiveConnectPanel'

declare module 'react' {
  interface CSSProperties { WebkitAppRegion?: 'drag' | 'no-drag' }
}

type Tab = 'monitor' | 'showtech'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'monitor',  label: 'Monitor Live', icon: '📡' },
  { id: 'showtech', label: 'Analisador',   icon: '🔬' },
]

function NetwatchIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="10" width="28" height="12" rx="2" fill="#1e3a5f" stroke="#22d3ee" strokeWidth="1.2"/>
      <rect x="3" y="11" width="26" height="2.5" rx="1" fill="#0d2d4a"/>
      <circle cx="5.5" cy="18" r="1.2" fill="#10b981"/>
      <rect x="9" y="15" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.85"/>
      <rect x="12" y="15" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.85"/>
      <rect x="15" y="15" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.85"/>
      <rect x="18" y="15" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.85"/>
      <rect x="21" y="15" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.85"/>
      <rect x="24" y="15" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.85"/>
      <rect x="9" y="17.5" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.5"/>
      <rect x="12" y="17.5" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.5"/>
      <rect x="15" y="17.5" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.5"/>
      <rect x="18" y="17.5" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.5"/>
      <rect x="21" y="17.5" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.5"/>
      <rect x="24" y="17.5" width="2.4" height="1.8" rx="0.4" fill="#22d3ee" opacity="0.5"/>
      <rect x="26.5" y="14.5" width="3" height="3" rx="0.5" fill="#f59e0b" opacity="0.9"/>
      <rect x="0" y="11" width="2" height="10" rx="1" fill="#263347"/>
      <rect x="30" y="11" width="2" height="10" rx="1" fill="#263347"/>
    </svg>
  )
}

const C = {
  panel: '#0a1628', border: 'rgba(255,255,255,0.06)',
  textD: 'rgba(255,255,255,0.4)', cyan: '#22d3ee',
  mono: "'JetBrains Mono', monospace",
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('monitor')
  const [appVersion, setAppVersion] = useState('')
  const [liveCount, setLiveCount] = useState(0)

  useEffect(() => {
    window.electronAPI?.getAppVersion().then(setAppVersion).catch(() => {})
  }, [])

  return (
    <div style={{
      height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: '#0f172a', fontFamily: C.mono,
    }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      <header style={{
        display: 'flex', alignItems: 'center', flexShrink: 0,
        padding: '0 16px', gap: 12, height: 46,
        background: C.panel, borderBottom: `1px solid ${C.border}`,
        WebkitAppRegion: 'drag',
      }}>
        <div style={{ WebkitAppRegion: 'no-drag', flexShrink: 0 }}><NetwatchIcon size={26} /></div>
        <div style={{ WebkitAppRegion: 'no-drag' }}>
          <h1 style={{ fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1, margin: 0 }}>Netwatch</h1>
          {appVersion && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '2px 0 0' }}>v{appVersion}</p>}
        </div>
        <nav style={{ display: 'flex', gap: 3, marginLeft: 20, WebkitAppRegion: 'no-drag' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              background: activeTab === tab.id ? 'rgba(34,211,238,0.1)' : 'transparent',
              border: activeTab === tab.id ? '1px solid rgba(34,211,238,0.3)' : '1px solid transparent',
              borderRadius: 6, padding: '5px 13px', cursor: 'pointer',
              color: activeTab === tab.id ? C.cyan : C.textD,
              fontFamily: C.mono, fontSize: 12,
              fontWeight: activeTab === tab.id ? 700 : 400,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s',
            }}>
              <span>{tab.icon}</span><span>{tab.label}</span>
              {tab.id === 'monitor' && liveCount > 0 && (
                <span style={{ background: '#10b981', color: '#fff', borderRadius: 10, fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>{liveCount}</span>
              )}
            </button>
          ))}
        </nav>
        {liveCount > 0 && (
          <div style={{
            marginLeft: 'auto', WebkitAppRegion: 'no-drag',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#10b981',
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 14, padding: '3px 10px',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            {liveCount} switch{liveCount > 1 ? 'es' : ''} live
          </div>
        )}
      </header>

      <main style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ display: activeTab === 'monitor'  ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}>
          <LiveConnectPanel onLiveCountChange={setLiveCount} />
        </div>
        <div style={{ display: activeTab === 'showtech' ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}>
          <ShowtechView />
        </div>
      </main>
    </div>
  )
}
