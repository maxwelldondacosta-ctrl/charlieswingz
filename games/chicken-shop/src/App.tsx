// app/games/chicken-shop/src/App.tsx
import React, { useEffect, useRef } from 'react'
import { useMetaStore } from './store/metaStore'
import { requireSession } from './api/auth'
import { fetchProgress, getCachedProgress, drainPendingSaves } from './api/progression'
import { initPixi } from './game/PixiApp'
import { GameScene } from './game/GameScene'
import { getLevelConfig } from './game/levelConfig'
import { useRunStore } from './store/runStore'
import MainMenu from './ui/MainMenu'
import HUD from './ui/HUD'
import LevelResult from './ui/LevelResult'
import Shop from './ui/Shop'
import LivesEmpty from './ui/LivesEmpty'

export default function App() {
  const { screen, setScreen, setProgress, hydrated } = useMetaStore()
  const booted = useRef(false)
  const [bootError, setBootError] = React.useState(false)

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
          setBootError(true)
          return
        }
      }

      setScreen('menu')
    }

    boot()
  }, [])

  if (bootError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#fff', background: '#1a1a2e', gap: 16 }}>
        <p style={{ color: '#ef4444' }}>Failed to load progress. Check your connection.</p>
        <button
          onClick={() => { setBootError(false); booted.current = false }}
          style={{ background: '#374151', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    )
  }

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
  const currentLevel = useRunStore(s => s.currentLevel)

  useEffect(() => {
    if (!ref.current) return
    let scene: GameScene | null = null

    initPixi(ref.current).then((app) => {
      const config = getLevelConfig(currentLevel)
      scene = new GameScene(app, config)
      scene.start()
    })

    return () => {
      if (scene) scene.stop()
    }
  }, [])

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
}
