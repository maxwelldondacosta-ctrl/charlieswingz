// app/games/chicken-shop/src/__tests__/orderMachine.test.ts
import { describe, it, expect } from 'vitest'
import {
  createOrder,
  transitionOrder,
  computePayout,
} from '../game/orderMachine'

describe('createOrder', () => {
  it('creates an order in waitingInLobby state', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    expect(o.state).toBe('waitingInLobby')
    expect(o.requiredStations).toEqual(['fryer', 'till'])
    expect(o.currentStationIndex).toBe(0)
    expect(o.payoutBasePence).toBe(800)
  })

  it('includes sauce in required stations when active', () => {
    const o = createOrder({ customerId: 'c1', level: 15, activeStations: ['fryer', 'sauce', 'till'], nowMs: 0 })
    expect(o.requiredStations).toContain('sauce')
    expect(o.payoutBasePence).toBe(1000)
  })
})

describe('transitionOrder', () => {
  it('moves from waitingInLobby to queuedAtStation', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    const next = transitionOrder(o, 'ACCEPT')
    expect(next.state).toBe('queuedAtStation')
    expect(next.currentStation).toBe('fryer')
  })

  it('moves from queuedAtStation to activeAtStation', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    const queued = transitionOrder(o, 'ACCEPT')
    const active = transitionOrder(queued, 'STATION_START')
    expect(active.state).toBe('activeAtStation')
  })

  it('advances to next station after station complete', () => {
    const o = createOrder({ customerId: 'c1', level: 15, activeStations: ['fryer', 'sauce', 'till'], nowMs: 0 })
    const queued = transitionOrder(o, 'ACCEPT')
    const active = transitionOrder(queued, 'STATION_START')
    const ready = transitionOrder(active, 'STATION_COMPLETE')
    expect(ready.state).toBe('readyForNextStation')
    expect(ready.currentStationIndex).toBe(1)
  })

  it('marks completed when all stations done', () => {
    let o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    o = transitionOrder(o, 'ACCEPT')           // → queuedAtStation (fryer)
    o = transitionOrder(o, 'STATION_START')    // → activeAtStation
    o = transitionOrder(o, 'STATION_COMPLETE') // → readyForNextStation, index 1
    o = transitionOrder(o, 'ACCEPT')           // → queuedAtStation (till)
    o = transitionOrder(o, 'STATION_START')    // → activeAtStation
    o = transitionOrder(o, 'STATION_COMPLETE') // → completed
    expect(o.state).toBe('completed')
  })

  it('marks walkedOut from any non-terminal state', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    const walkedOut = transitionOrder(o, 'WALKOUT')
    expect(walkedOut.state).toBe('walkedOut')
  })
})

describe('computePayout', () => {
  it('returns base payout with no penalties', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    expect(computePayout(o)).toBe(800)
  })

  it('deducts fryer salvage penalty', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    const penalised = { ...o, payoutModifiersPence: -200 }
    expect(computePayout(penalised)).toBe(600)
  })

  it('never returns below zero', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    const penalised = { ...o, payoutModifiersPence: -9999 }
    expect(computePayout(penalised)).toBe(0)
  })
})
