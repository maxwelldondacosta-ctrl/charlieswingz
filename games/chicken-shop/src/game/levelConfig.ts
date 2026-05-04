// app/games/chicken-shop/src/game/levelConfig.ts
import type { LevelConfig, LevelModifier, StationKey } from '../types'

const TIER_DEFS = [
  {
    tier: 1 as const, range: [1, 10] as [number, number],
    stations: ['fryer', 'till'] as StationKey[],
    orderValuePence: 800, patienceBaseMs: 45_000,
    spawnMin: 5600, spawnMax: 6000, duration: 90_000, avgCompletionMs: 5800,
  },
  {
    tier: 2 as const, range: [11, 20] as [number, number],
    stations: ['fryer', 'sauce', 'till'] as StationKey[],
    orderValuePence: 1000, patienceBaseMs: 42_000,
    spawnMin: 5000, spawnMax: 5500, duration: 90_000, avgCompletionMs: 6200,
  },
  {
    tier: 3 as const, range: [21, 30] as [number, number],
    stations: ['fryer', 'sauce', 'sides', 'till'] as StationKey[],
    orderValuePence: 1300, patienceBaseMs: 39_000,
    spawnMin: 4600, spawnMax: 5000, duration: 100_000, avgCompletionMs: 6900,
  },
  {
    tier: 4 as const, range: [31, 40] as [number, number],
    stations: ['fryer', 'sauce', 'sides', 'drinks', 'till'] as StationKey[],
    orderValuePence: 1500, patienceBaseMs: 36_000,
    spawnMin: 4200, spawnMax: 4700, duration: 100_000, avgCompletionMs: 7500,
  },
  {
    tier: 5 as const, range: [41, 50] as [number, number],
    stations: ['fryer', 'sauce', 'sides', 'drinks', 'boxing', 'till'] as StationKey[],
    orderValuePence: 1600, patienceBaseMs: 34_000,
    spawnMin: 3900, spawnMax: 4400, duration: 100_000, avgCompletionMs: 7900,
  },
  {
    tier: 6 as const, range: [51, 100] as [number, number],
    stations: ['fryer', 'sauce', 'sides', 'drinks', 'boxing', 'till'] as StationKey[],
    orderValuePence: 1600, patienceBaseMs: 32_000,
    spawnMin: 3700, spawnMax: 4200, duration: 100_000, avgCompletionMs: 8200,
  },
]

const BOSS_LEVELS = new Set([9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 59, 60, 70, 80, 90, 100])

const ENDGAME_MODIFIERS: LevelModifier[] = ['rushMinute', 'vipCustomer', 'fryerWobble', 'cleanRunBonus', 'none']

function getModifier(level: number): LevelModifier {
  if (level <= 60) return 'none'
  return ENDGAME_MODIFIERS[(level - 61) % ENDGAME_MODIFIERS.length]
}

function generateLevel(level: number): LevelConfig {
  const tierDef = TIER_DEFS.find(t => level >= t.range[0] && level <= t.range[1])!
  const isBoss = BOSS_LEVELS.has(level)
  const positionInTier = level - tierDef.range[0]
  const tierLength = tierDef.range[1] - tierDef.range[0]

  const rampFraction = positionInTier / Math.max(1, tierLength)
  const baseMult = isBoss
    ? 0.90 + rampFraction * 0.02
    : 0.82 + rampFraction * 0.06

  const duration = level >= 61 ? 110_000 : tierDef.duration
  const expectedOrders = Math.floor(duration / tierDef.avgCompletionMs) * 0.78
  const cashTargetPence = Math.floor(expectedOrders * tierDef.orderValuePence * baseMult)

  const bossPatience = isBoss ? Math.floor(tierDef.patienceBaseMs * 0.88) : tierDef.patienceBaseMs
  const bossSpawnMin = isBoss ? Math.floor(tierDef.spawnMin * 0.87) : tierDef.spawnMin
  const bossSpawnMax = isBoss ? Math.floor(tierDef.spawnMax * 0.87) : tierDef.spawnMax

  return {
    level,
    tier: tierDef.tier,
    durationMs: duration,
    cashTargetPence,
    activeStations: tierDef.stations,
    patienceBaseMs: bossPatience,
    spawnIntervalMinMs: bossSpawnMin,
    spawnIntervalMaxMs: bossSpawnMax,
    boss: isBoss,
    modifier: getModifier(level),
  }
}

export const LEVELS: LevelConfig[] = Array.from({ length: 100 }, (_, i) => generateLevel(i + 1))

export function getLevelConfig(level: number): LevelConfig {
  return LEVELS[level - 1]
}
