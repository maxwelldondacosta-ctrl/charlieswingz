// app/games/chicken-shop/src/ui/LevelResult.tsx
import React, { useEffect, useRef } from 'react'
import { useRunStore } from '../store/runStore'
import { useMetaStore } from '../store/metaStore'
import { completeLevel, failLevel } from '../api/progression'
import { getLevelConfig } from '../game/levelConfig'

export default function LevelResult() {
  const { result, currentLevel, cashEarnedPence, cashTargetPence, walkouts, completedOrders, reset } = useRunStore()
  const { setProgress, setScreen, lives, credits, version } = useMetaStore()
  const runId = useRef(`run-${Date.now()}-${Math.random()}`).current

  useEffect(() => {
    if (!result) return
    const durationMs = getLevelConfig(currentLevel).durationMs
    const payload = { level: currentLevel, cashEarnedPence, walkouts, completedOrders, runDurationMs: durationMs, runId }

    if (result === 'success') {
      completeLevel(payload).then(setProgress)
    } else {
      failLevel(payload).then(setProgress)
    }
  }, [result])

  if (!result) return null

  const shortfall = cashTargetPence - cashEarnedPence
  const stars = walkouts === 0 ? 3 : walkouts <= 2 ? 2 : 1
  const canSkip = credits >= 10 && result === 'fail'

  function retry() { reset(); setScreen('game') }
  function nextLevel() {
    reset()
    const nextCfg = getLevelConfig(Math.min(100, currentLevel + 1))
    useRunStore.getState().setLevel(nextCfg.level, nextCfg.cashTargetPence, nextCfg.durationMs)
    setScreen('game')
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
      <div style={{ background: '#1f2937', borderRadius: 16, padding: 32, minWidth: 280, textAlign: 'center' }}>
        {result === 'success' ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{'⭐'.repeat(stars)}</div>
            <h2 style={{ color: '#22c55e', marginBottom: 8 }}>Level Complete!</h2>
            <p style={{ color: '#9ca3af' }}>Earned £{(cashEarnedPence / 100).toFixed(2)}</p>
            <p style={{ color: '#9ca3af', marginBottom: 24 }}>{walkouts} walkout{walkouts !== 1 ? 's' : ''}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {currentLevel < 100 && <button onClick={nextLevel} style={btnGreen}>Next Level</button>}
              <button onClick={retry} style={btnGray}>Replay</button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ color: '#ef4444', marginBottom: 8 }}>Level Failed</h2>
            <p style={{ color: '#9ca3af' }}>Short by £{(shortfall / 100).toFixed(2)}</p>
            <p style={{ color: '#9ca3af', marginBottom: 24 }}>Lives remaining: {lives}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {lives > 0 && <button onClick={retry} style={btnGreen}>Retry</button>}
              {lives === 0 && <button onClick={() => setScreen('livesEmpty')} style={btnRed}>Refill Lives</button>}
              {canSkip && <button onClick={() => setScreen('shop')} style={btnGray}>Skip (10 💰)</button>}
            </div>
          </>
        )}
        <button onClick={() => { reset(); setScreen('menu') }} style={{ ...btnGray, marginTop: 12 }}>Menu</button>
      </div>
    </div>
  )
}

const base: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 14, color: '#fff' }
const btnGreen = { ...base, background: '#16a34a' }
const btnRed = { ...base, background: '#dc2626' }
const btnGray = { ...base, background: '#374151' }
