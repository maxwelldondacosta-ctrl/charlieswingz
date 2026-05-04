// app/games/chicken-shop/src/ui/MainMenu.tsx
import React, { useState } from 'react'
import { useMetaStore } from '../store/metaStore'
import { useRunStore } from '../store/runStore'
import { getLevelConfig } from '../game/levelConfig'

export default function MainMenu() {
  const { unlockedLevel, lives, livesRefillAt, credits, setScreen } = useMetaStore()
  const { setLevel } = useRunStore()
  const [showLevelSelect, setShowLevelSelect] = useState(false)

  const livesEmpty = lives === 0
  const refillMs = livesRefillAt ? Math.max(0, livesRefillAt - Date.now()) : 0
  const refillMins = Math.ceil(refillMs / 60_000)

  function startLevel(level: number) {
    const cfg = getLevelConfig(level)
    setLevel(level, cfg.cashTargetPence, cfg.durationMs)
    setScreen('game')
  }

  if (showLevelSelect) {
    return (
      <div style={overlay}>
        <h2 style={{ color: '#fff', marginBottom: 16 }}>Select Level</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 360 }}>
          {Array.from({ length: unlockedLevel }, (_, i) => i + 1).map(lvl => (
            <button key={lvl} onClick={() => startLevel(lvl)} disabled={livesEmpty}
              style={{ ...btn, background: getLevelConfig(lvl).boss ? '#7c3aed' : '#374151' }}>
              {lvl}
            </button>
          ))}
        </div>
        <button onClick={() => setShowLevelSelect(false)} style={{ ...btn, marginTop: 16 }}>Back</button>
      </div>
    )
  }

  return (
    <div style={overlay}>
      <h1 style={{ color: '#facc15', fontSize: 28, marginBottom: 8 }}>🍗 Chicken Shop</h1>
      <p style={{ color: '#9ca3af', marginBottom: 24 }}>Level {unlockedLevel} unlocked</p>

      <div style={{ color: '#fff', marginBottom: 24, display: 'flex', gap: 24 }}>
        <span>❤️ {lives}/3</span>
        <span>💰 {credits} credits</span>
      </div>

      {livesEmpty ? (
        <div style={{ color: '#ef4444', marginBottom: 16 }}>
          No lives — refill in {refillMins}min
          <button onClick={() => setScreen('livesEmpty')} style={{ ...btn, marginLeft: 12 }}>Refill Now</button>
        </div>
      ) : (
        <button onClick={() => startLevel(unlockedLevel)} style={{ ...btn, background: '#d97706', fontSize: 18, padding: '14px 32px' }}>
          Play Level {unlockedLevel}
        </button>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button onClick={() => setShowLevelSelect(true)} style={btn}>Level Select</button>
        <button onClick={() => setScreen('shop')} style={btn}>Shop</button>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', background: '#1a1a2e',
}
const btn: React.CSSProperties = {
  background: '#374151', color: '#fff', border: 'none', borderRadius: 8,
  padding: '10px 20px', cursor: 'pointer', fontSize: 14,
}
