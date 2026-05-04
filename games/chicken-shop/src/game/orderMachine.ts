// app/games/chicken-shop/src/game/orderMachine.ts
import type { Order, OrderState, StationKey, QualityFlags } from '../types'

const STATION_VALUE_PENCE: Partial<Record<StationKey, number>> = {
  fryer: 800,
  sauce: 200,
  sides: 300,
  drinks: 200,
  boxing: 100,
}

const DEFAULT_FLAGS: QualityFlags = {
  fryerSalvaged: false,
  fryerRemade: false,
  wrongSauce: false,
  wrongSide: false,
  drinkMinorMiss: false,
  drinkMajorMiss: false,
  boxingFailed: false,
}

function basePayoutForStations(stations: StationKey[]): number {
  return stations.reduce((sum, s) => sum + (STATION_VALUE_PENCE[s] ?? 0), 0)
}

let _idCounter = 0
function newId(): string {
  return `order-${++_idCounter}-${Date.now()}`
}

type CreateOrderParams = {
  customerId: string
  level: number
  activeStations: StationKey[]
  nowMs: number
  patienceMs?: number
}

export function createOrder(p: CreateOrderParams): Order {
  return {
    id: newId(),
    customerId: p.customerId,
    level: p.level,
    createdAtMs: p.nowMs,
    requiredStations: p.activeStations,
    currentStationIndex: 0,
    state: 'waitingInLobby',
    currentStation: null,
    payoutBasePence: basePayoutForStations(p.activeStations),
    payoutModifiersPence: 0,
    patienceMaxMs: p.patienceMs ?? 45_000,
    patienceRemainingMs: p.patienceMs ?? 45_000,
    qualityFlags: { ...DEFAULT_FLAGS },
  }
}

type OrderEvent =
  | 'ACCEPT'
  | 'STATION_START'
  | 'STATION_COMPLETE'
  | 'WALKOUT'
  | 'VOID'

export function transitionOrder(order: Order, event: OrderEvent): Order {
  const s = order.state

  if (event === 'WALKOUT') {
    return { ...order, state: 'walkedOut' }
  }
  if (event === 'VOID') {
    return { ...order, state: 'voided' }
  }

  if (event === 'ACCEPT' && s === 'waitingInLobby') {
    return {
      ...order,
      state: 'queuedAtStation',
      currentStation: order.requiredStations[0],
    }
  }

  if (event === 'ACCEPT' && s === 'readyForNextStation') {
    const nextIndex = order.currentStationIndex
    return {
      ...order,
      state: 'queuedAtStation',
      currentStation: order.requiredStations[nextIndex],
    }
  }

  if (event === 'STATION_START' && s === 'queuedAtStation') {
    return { ...order, state: 'activeAtStation' }
  }

  if (event === 'STATION_COMPLETE' && s === 'activeAtStation') {
    const nextIndex = order.currentStationIndex + 1
    if (nextIndex >= order.requiredStations.length) {
      return { ...order, state: 'completed', currentStation: null }
    }
    return {
      ...order,
      state: 'readyForNextStation',
      currentStationIndex: nextIndex,
      currentStation: null,
    }
  }

  return order
}

export function applyPenalty(order: Order, penaltyPence: number): Order {
  return { ...order, payoutModifiersPence: order.payoutModifiersPence - penaltyPence }
}

export function computePayout(order: Order): number {
  return Math.max(0, order.payoutBasePence + order.payoutModifiersPence)
}

export function tickPatience(order: Order, deltaMs: number, drainRate = 1): Order {
  const remaining = Math.max(0, order.patienceRemainingMs - deltaMs * drainRate)
  return { ...order, patienceRemainingMs: remaining }
}
