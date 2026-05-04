// app/games/chicken-shop/src/__tests__/levelConfig.test.ts
import { describe, it, expect } from 'vitest'
import { LEVELS, getLevelConfig } from '../game/levelConfig'

describe('LEVELS', () => {
  it('has exactly 100 entries', () => {
    expect(LEVELS).toHaveLength(100)
  })

  it('level numbers are 1-100 in order', () => {
    LEVELS.forEach((l, i) => expect(l.level).toBe(i + 1))
  })

  it('level 1 uses fryer and till only', () => {
    expect(LEVELS[0].activeStations).toEqual(['fryer', 'till'])
  })

  it('level 11 adds sauce', () => {
    expect(LEVELS[10].activeStations).toContain('sauce')
  })

  it('level 51+ has all stations', () => {
    const l = LEVELS[50]
    expect(l.activeStations).toContain('boxing')
  })

  it('boss levels are correctly flagged', () => {
    expect(LEVELS[8].boss).toBe(true)   // level 9
    expect(LEVELS[9].boss).toBe(true)   // level 10
    expect(LEVELS[7].boss).toBe(false)  // level 8
  })

  it('no level target exceeds throughput guardrail', () => {
    const AVG_COMPLETION_MS = [5800, 6200, 6900, 7500, 7900, 8200]
    const ORDER_VALUE_PENCE = [800, 1000, 1300, 1500, 1600, 1600]

    for (const l of LEVELS) {
      const avgCompletionMs = AVG_COMPLETION_MS[l.tier - 1]
      const orderValuePence = ORDER_VALUE_PENCE[l.tier - 1]
      const theoreticalOrders = Math.floor(l.durationMs / avgCompletionMs)
      const maxAllowed = Math.floor(theoreticalOrders * orderValuePence * 0.95)
      expect(l.cashTargetPence).toBeLessThanOrEqual(maxAllowed)
    }
  })
})

describe('getLevelConfig', () => {
  it('returns the correct level', () => {
    expect(getLevelConfig(1).level).toBe(1)
    expect(getLevelConfig(100).level).toBe(100)
  })
})
