// app/games/chicken-shop/src/api/analytics.ts
import { getSession } from './auth'

type LevelAnalyticsPayload = {
  level: number
  tier: number
  boss: boolean
  modifier: string
  cashTargetPence: number
  cashEarnedPence: number
  completedOrders: number
  walkouts: number
  penaltiesByStation: Record<string, number>
  runDurationMs: number
}

function track(event: string, payload: Record<string, unknown>): void {
  const session = getSession()
  // Fire-and-forget — never block gameplay on analytics
  fetch('/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.token}` },
    body: JSON.stringify({ event, ...payload, ts: Date.now() }),
  }).catch(() => { /* intentionally silent */ })
}

export function trackLevelStarted(payload: Pick<LevelAnalyticsPayload, 'level' | 'tier' | 'boss' | 'modifier'>): void {
  track('chicken_shop_level_started', payload as unknown as Record<string, unknown>)
}

export function trackLevelCompleted(payload: LevelAnalyticsPayload): void {
  track('chicken_shop_level_completed', payload as unknown as Record<string, unknown>)
}

export function trackLevelFailed(payload: LevelAnalyticsPayload): void {
  track('chicken_shop_level_failed', payload as unknown as Record<string, unknown>)
}

export function trackWalkout(level: number): void {
  track('chicken_shop_customer_walked_out', { level })
}

export function trackStationPenalty(level: number, station: string, penaltyPence: number): void {
  track('chicken_shop_station_penalty', { level, station, penaltyPence })
}

export function trackSkipUsed(level: number): void {
  track('chicken_shop_skip_used', { level })
}

export function trackRefillUsed(): void {
  track('chicken_shop_refill_used', {})
}
