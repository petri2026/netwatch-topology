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
      <defs>
        <linearGradient id="nwIcon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee"/><stop offset="1" stopColor="#3b82f6"/>
        </linearGradient>
      </defs>
      {/* network node container */}
      <rect x="3" y="3" width="26" height="26" rx="6.5" fill="#0d1b2e" stroke="url(#nwIcon)" strokeWidth="1.6"/>
      {/* ascending bar chart (analytics) */}
      <rect x="9"  y="18" width="3.2" height="6"  rx="1" fill="url(#nwIcon)"/>
      <rect x="14" y="14" width="3.2" height="10" rx="1" fill="url(#nwIcon)"/>
      <rect x="19" y="10" width="3.2" height="14" rx="1" fill="url(#nwIcon)"/>
      {/* live signal node */}
      <circle cx="21" cy="8" r="2.1" fill="#10b981"/>
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
          <h1 style={{ fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1, margin: 0 }}>Netwatch Analyzer</h1>
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
