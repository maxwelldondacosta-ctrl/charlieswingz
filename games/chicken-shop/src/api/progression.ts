import type { ChickenShopProgress, PendingSave } from '../types'
import { getSession } from './auth'

const BASE = '/api/games/chicken-shop'
const PROGRESS_CACHE_KEY = 'cw:games:chicken-shop:progress'
const PENDING_SAVES_KEY = 'cw:games:chicken-shop:pendingSaves'

// ── Cache helpers ──────────────────────────────────────────────────────────

function readCache(): ChickenShopProgress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeCache(p: ChickenShopProgress): void {
  const current = readCache()
  if (current && current.version > p.version) return
  localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify(p))
}

// ── Pending saves queue ────────────────────────────────────────────────────

function readPendingSaves(): PendingSave[] {
  try {
    const raw = localStorage.getItem(PENDING_SAVES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writePendingSaves(saves: PendingSave[]): void {
  localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(saves))
}

function enqueuePendingSave(endpoint: string, body: Record<string, unknown>): void {
  const saves = readPendingSaves()
  saves.push({ endpoint, body, queuedAtMs: Date.now() })
  writePendingSaves(saves)
}

export async function drainPendingSaves(): Promise<void> {
  const saves = readPendingSaves()
  if (saves.length === 0) return

  const session = getSession()
  if (!session) return

  const remaining: PendingSave[] = []
  for (const save of saves) {
    try {
      const res = await fetch(save.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(save.body),
      })
      if (res.ok || res.status === 409) {
        if (res.ok) {
          const data = await res.json() as { progress: ChickenShopProgress }
          writeCache(data.progress)
        }
        continue
      }
      remaining.push(save)
      break
    } catch {
      remaining.push(save)
      break
    }
  }
  writePendingSaves(remaining)
}

export function hasPendingSaves(): boolean {
  return readPendingSaves().length > 0
}

// ── API calls ──────────────────────────────────────────────────────────────

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const session = getSession()
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { code?: string }
    throw Object.assign(new Error(err.code ?? `HTTP ${res.status}`), { status: res.status, code: err.code })
  }
  return res.json() as T
}

export async function fetchProgress(): Promise<ChickenShopProgress> {
  const session = getSession()
  const res = await fetch(`${BASE}/progress`, {
    headers: { Authorization: `Bearer ${session?.token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as { progress: ChickenShopProgress }
  writeCache(data.progress)
  return data.progress
}

export function getCachedProgress(): ChickenShopProgress | null {
  return readCache()
}

export type LevelPayload = {
  level: number
  cashEarnedPence: number
  walkouts: number
  completedOrders: number
  runDurationMs: number
  runId: string
}

export async function completeLevel(payload: LevelPayload): Promise<ChickenShopProgress> {
  try {
    const data = await post<{ progress: ChickenShopProgress }>('/complete-level', payload as unknown as Record<string, unknown>)
    writeCache(data.progress)
    return data.progress
  } catch {
    enqueuePendingSave(`${BASE}/complete-level`, payload as unknown as Record<string, unknown>)
    const cached = readCache()
    if (!cached) throw new Error('No cached progress')
    return cached
  }
}

export async function failLevel(payload: LevelPayload): Promise<ChickenShopProgress> {
  try {
    const data = await post<{ progress: ChickenShopProgress }>('/fail-level', payload as unknown as Record<string, unknown>)
    writeCache(data.progress)
    return data.progress
  } catch {
    enqueuePendingSave(`${BASE}/fail-level`, payload as unknown as Record<string, unknown>)
    const cached = readCache()
    if (!cached) throw new Error('No cached progress')
    return cached
  }
}

export async function refillLives(expectedVersion: number): Promise<ChickenShopProgress> {
  const data = await post<{ progress: ChickenShopProgress }>('/refill-lives', { expectedVersion })
  writeCache(data.progress)
  return data.progress
}

export async function skipLevel(level: number, expectedVersion: number): Promise<ChickenShopProgress> {
  const data = await post<{ progress: ChickenShopProgress }>('/skip-level', { level, expectedVersion })
  writeCache(data.progress)
  return data.progress
}
