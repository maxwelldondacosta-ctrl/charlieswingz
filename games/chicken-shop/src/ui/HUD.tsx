// app/games/chicken-shop/src/ui/HUD.tsx
import React from 'react'
import { useRunStore } from '../store/runStore'
import { useMetaStore } from '../store/metaStore'

export default function HUD() {
  const { timerRemainingMs, cashEarnedPence, cashTargetPence, currentLevel } = useRunStore()
  const { lives, credits } = useMetaStore()

  const secs = Math.ceil(timerRemainingMs / 1000)
  const progress = Math.min(1, cashEarnedPence / cashTargetPence)
  const isLastTen = secs <= 10 && secs > 0

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      padding: '8px 16px', background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', gap: 12, zIndex: 10,
    }}>
      <span style={{ color: '#fff', minWidth: 60, fontSize: 13 }}>Lv {currentLevel}</span>

      <span style={{
        color: isLastTen ? '#ef4444' : '#fff', fontWeight: 'bold', fontSize: 16, minWidth: 40,
        animation: isLastTen ? 'pulse 0.5s infinite' : 'none',
      }}>
        {secs}s
      </span>

      <div style={{ flex: 1, height: 10, background: '#374151', borderRadius: 5 }}>
        <div style={{ width: `${progress * 100}%`, height: '100%', background: '#22c55e', borderRadius: 5, transition: 'width 0.3s' }} />
      </div>

      <span style={{ color: '#facc15', fontSize: 13, minWidth: 80 }}>
        £{(cashEarnedPence / 100).toFixed(2)} / £{(cashTargetPence / 100).toFixed(2)}
      </span>

      <span style={{ color: '#fff', fontSize: 13 }}>❤️ {lives}</span>
      <span style={{ color: '#9ca3af', fontSize: 12 }}>💰 {credits}</span>
    </div>
  )
}
