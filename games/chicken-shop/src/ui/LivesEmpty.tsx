// app/games/chicken-shop/src/ui/LivesEmpty.tsx
import React, { useState, useEffect } from 'react'
import { useMetaStore } from '../store/metaStore'
import { refillLives } from '../api/progression'

export default function LivesEmpty() {
  const { livesRefillAt, credits, version, setProgress, setScreen } = useMetaStore()
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    function update() {
      if (!livesRefillAt) return
      setRemaining(Math.max(0, livesRefillAt - Date.now()))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [livesRefillAt])

  const mins = Math.floor(remaining / 60_000)
  const secs = Math.floor((remaining % 60_000) / 1000)
  const canRefillNow = credits >= 20

  async function buyRefill() {
    const p = await refillLives(version)
    setProgress(p)
    setScreen('menu')
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>💔</div>
      <h2 style={{ color: '#ef4444', marginBottom: 8 }}>No Lives Left</h2>
      <p style={{ color: '#9ca3af', marginBottom: 24 }}>
        Free refill in {mins}m {secs}s
      </p>
      {canRefillNow && (
        <button onClick={buyRefill}
          style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 24px', fontSize: 16, cursor: 'pointer', marginBottom: 16 }}>
          Refill Now — 20 💰
        </button>
      )}
      <button onClick={() => setScreen('menu')}
        style={{ background: '#374151', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}>
        Back to Menu
      </button>
    </div>
  )
}
