// app/games/chicken-shop/src/ui/Shop.tsx
import React, { useState } from 'react'
import { useMetaStore } from '../store/metaStore'
import { refillLives, skipLevel, hasPendingSaves } from '../api/progression'

export default function Shop() {
  const { lives, credits, version, unlockedLevel, setProgress, setScreen } = useMetaStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingSaves = hasPendingSaves()

  async function doRefill() {
    if (pendingSaves) { setError('Sync pending — connect to internet first'); return }
    setLoading(true)
    try {
      const p = await refillLives(version)
      setProgress(p)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function doSkip() {
    if (pendingSaves) { setError('Sync pending — connect to internet first'); return }
    setLoading(true)
    try {
      const p = await skipLevel(unlockedLevel, version)
      setProgress(p)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h2 style={{ color: '#facc15', marginBottom: 24 }}>Shop</h2>
      <p style={{ color: '#9ca3af', marginBottom: 24 }}>Credits: {credits} &nbsp;|&nbsp; Lives: {lives}/3</p>

      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}
      {pendingSaves && <p style={{ color: '#f59e0b', marginBottom: 16 }}>⚠️ Offline — connect to sync before spending credits</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
        <button onClick={doRefill} disabled={loading || lives === 3 || credits < 20 || pendingSaves}
          style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 20px', fontSize: 15, cursor: 'pointer' }}>
          Refill Lives — 20 💰
        </button>
        <button onClick={doSkip} disabled={loading || credits < 10 || pendingSaves}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 20px', fontSize: 15, cursor: 'pointer' }}>
          Skip Level {unlockedLevel} — 10 💰
        </button>
        <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center' }}>Buy credits on the Charlie's Wingz website</p>
      </div>

      <button onClick={() => setScreen('menu')} style={{ marginTop: 32, background: '#374151', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}>
        Back
      </button>
    </div>
  )
}
