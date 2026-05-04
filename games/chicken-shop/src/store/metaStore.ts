import { create } from 'zustand'
import type { ChickenShopProgress, Screen } from '../types'

type MetaState = {
  screen: Screen
  unlockedLevel: number
  credits: number
  lives: number
  livesRefillAt: number | null
  version: number
  hydrated: boolean
  setScreen: (s: Screen) => void
  setProgress: (p: ChickenShopProgress) => void
  spendCredits: (amount: number) => void
}

export const useMetaStore = create<MetaState>((set) => ({
  screen: 'loading',
  unlockedLevel: 1,
  credits: 0,
  lives: 3,
  livesRefillAt: null,
  version: 0,
  hydrated: false,
  setScreen: (screen) => set({ screen }),
  setProgress: (p) => set({
    unlockedLevel: p.unlockedLevel,
    credits: p.credits,
    lives: p.lives,
    livesRefillAt: p.livesRefillAt,
    version: p.version,
    hydrated: true,
  }),
  spendCredits: (amount) => set(s => ({ credits: Math.max(0, s.credits - amount) })),
}))
