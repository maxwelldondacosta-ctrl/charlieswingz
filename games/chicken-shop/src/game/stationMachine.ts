// app/games/chicken-shop/src/game/stationMachine.ts
import type { StationKey, StationRuntime } from '../types'

export function createStation(key: StationKey): StationRuntime {
  return {
    key,
    queue: [],
    activeOrderId: null,
    outputBufferOrderId: null,
    busyUntilMs: null,
    interactionState: 'idle',
  }
}

export function enqueue(station: StationRuntime, orderId: string): StationRuntime {
  if (station.queue.length >= 3) throw new Error('queue full')
  return { ...station, queue: [...station.queue, orderId] }
}

export function startActive(station: StationRuntime): StationRuntime {
  if (station.activeOrderId !== null) return station  // already processing — do nothing
  if (station.outputBufferOrderId !== null) {
    return { ...station, interactionState: 'blocked' }
  }
  if (station.queue.length === 0) return station
  const [next, ...rest] = station.queue
  return {
    ...station,
    queue: rest,
    activeOrderId: next,
    interactionState: 'waitingForInput',
  }
}

export function completeActive(station: StationRuntime): StationRuntime {
  if (station.activeOrderId === null) return station
  return {
    ...station,
    outputBufferOrderId: station.activeOrderId,
    activeOrderId: null,
    interactionState: 'idle',
  }
}

export function releaseBuffer(station: StationRuntime): [StationRuntime, string | null] {
  const orderId = station.outputBufferOrderId
  return [{ ...station, outputBufferOrderId: null }, orderId]
}

export function removeOrder(station: StationRuntime, orderId: string): StationRuntime {
  return {
    ...station,
    queue: station.queue.filter(id => id !== orderId),
    activeOrderId: station.activeOrderId === orderId ? null : station.activeOrderId,
    outputBufferOrderId: station.outputBufferOrderId === orderId ? null : station.outputBufferOrderId,
    interactionState: station.activeOrderId === orderId ? 'idle' : station.interactionState,
  }
}

export function isQueueFull(station: StationRuntime): boolean {
  return station.queue.length >= 3
}
