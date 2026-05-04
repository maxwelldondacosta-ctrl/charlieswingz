import { create } from 'zustand'

type RunResult = 'success' | 'fail' | null

type RunState = {
  currentLevel: number
  timerRemainingMs: number
  cashEarnedPence: number
  cashTargetPence: number
  walkouts: number
  completedOrders: number
  result: RunResult
  setLevel: (level: number, targetPence: number, durationMs: number) => void
  addCash: (pence: number) => void
  addWalkout: () => void
  tickTimer: (deltaMs: number) => void
  setResult: (r: RunResult) => void
  reset: () => void
}

export const useRunStore = create<RunState>((set) => ({
  currentLevel: 1,
  timerRemainingMs: 0,
  cashEarnedPence: 0,
  cashTargetPence: 0,
  walkouts: 0,
  completedOrders: 0,
  result: null,
  setLevel: (level, targetPence, durationMs) => set({
    currentLevel: level,
    cashTargetPence: targetPence,
    timerRemainingMs: durationMs,
    cashEarnedPence: 0,
    walkouts: 0,
    completedOrders: 0,
    result: null,
  }),
  addCash: (pence) => set(s => ({ cashEarnedPence: s.cashEarnedPence + pence, completedOrders: s.completedOrders + 1 })),
  addWalkout: () => set(s => ({ walkouts: s.walkouts + 1 })),
  tickTimer: (deltaMs) => set(s => ({ timerRemainingMs: Math.max(0, s.timerRemainingMs - deltaMs) })),
  setResult: (result) => set({ result }),
  reset: () => set({ cashEarnedPence: 0, walkouts: 0, completedOrders: 0, result: null, timerRemainingMs: 0 }),
}))
