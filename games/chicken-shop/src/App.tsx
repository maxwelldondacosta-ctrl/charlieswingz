// app/games/chicken-shop/src/App.tsx
import React, { useEffect, useRef } from 'react'
import { useMetaStore } from './store/metaStore'
import { requireSession } from './api/auth'
import { fetchProgress, getCachedProgress, drainPendingSaves } from './api/progression'
import { initPixi } from './game/PixiApp'
import MainMenu from './ui/MainMenu'
import HUD from './ui/HUD'
import LevelResult from './ui/LevelResult'
import Shop from './ui/Shop'
import LivesEmpty from './ui/LivesEmpty'

export default function App() {
  const { screen, setScreen, setProgress, hydrated } = useMetaStore()
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true

    async function boot() {
      try {
        requireSession()
      } catch {
        return // redirect handled inside requireSession
      }

      // Drain any pending saves from last session before hydrating
      await drainPendingSaves()

      try {
        const progress = await fetchProgress()
        setProgress(progress)
      } catch {
        const cached = getCachedProgress()
        if (cached) {
          setProgress(cached)
        } else {
          // Hard failure — show retry
          setScreen('loading')
          return
        }
      }

      setScreen('menu')
    }

    boot()
  }, [])

  if (!hydrated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#fff', fontSize: 20, background: '#1a1a2e' }}>
        Loading Charlie's Wingz...
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e', position: 'relative' }}>
      {screen === 'menu' && <MainMenu />}
      {screen === 'game' && (
        <>
          <GameCanvas />
          <HUD />
          <LevelResult />
        </>
      )}
      {screen === 'shop' && <Shop />}
      {screen === 'livesEmpty' && <LivesEmpty />}
    </div>
  )
}

function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    initPixi(ref.current)
  }, [])
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
}
