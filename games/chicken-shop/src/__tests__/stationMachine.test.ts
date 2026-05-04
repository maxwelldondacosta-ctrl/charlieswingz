// app/games/chicken-shop/src/__tests__/stationMachine.test.ts
import { describe, it, expect } from 'vitest'
import {
  createStation,
  enqueue,
  startActive,
  completeActive,
  releaseBuffer,
  removeOrder,
  isQueueFull,
} from '../game/stationMachine'

describe('createStation', () => {
  it('creates an idle station', () => {
    const s = createStation('fryer')
    expect(s.key).toBe('fryer')
    expect(s.queue).toEqual([])
    expect(s.activeOrderId).toBeNull()
    expect(s.outputBufferOrderId).toBeNull()
  })
})

describe('enqueue', () => {
  it('adds an order to the queue', () => {
    const s = createStation('fryer')
    const next = enqueue(s, 'order-1')
    expect(next.queue).toEqual(['order-1'])
  })

  it('rejects when queue is full (3 orders)', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'o1')
    s = enqueue(s, 'o2')
    s = enqueue(s, 'o3')
    expect(() => enqueue(s, 'o4')).toThrow('queue full')
  })
})

describe('startActive', () => {
  it('moves first queue item to active', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'order-1')
    s = startActive(s)
    expect(s.activeOrderId).toBe('order-1')
    expect(s.queue).toEqual([])
    expect(s.interactionState).toBe('waitingForInput')
  })

  it('does nothing when queue is empty', () => {
    const s = createStation('fryer')
    const next = startActive(s)
    expect(next.activeOrderId).toBeNull()
  })

  it('does nothing when output buffer is occupied', () => {
    let s = createStation('fryer')
    s = { ...s, outputBufferOrderId: 'blocking-order' }
    s = enqueue(s, 'order-1')
    const next = startActive(s)
    expect(next.activeOrderId).toBeNull()
    expect(next.interactionState).toBe('blocked')
  })
})

describe('completeActive', () => {
  it('moves active order to output buffer', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'order-1')
    s = startActive(s)
    s = completeActive(s)
    expect(s.activeOrderId).toBeNull()
    expect(s.outputBufferOrderId).toBe('order-1')
    expect(s.interactionState).toBe('idle')
  })
})

describe('releaseBuffer', () => {
  it('clears the output buffer and returns the order id', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'order-1')
    s = startActive(s)
    s = completeActive(s)
    const [next, orderId] = releaseBuffer(s)
    expect(next.outputBufferOrderId).toBeNull()
    expect(orderId).toBe('order-1')
  })
})

describe('removeOrder', () => {
  it('removes an order from the queue', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'o1')
    s = enqueue(s, 'o2')
    s = removeOrder(s, 'o1')
    expect(s.queue).toEqual(['o2'])
  })

  it('clears active order if matched', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'o1')
    s = startActive(s)
    s = removeOrder(s, 'o1')
    expect(s.activeOrderId).toBeNull()
  })

  it('clears output buffer if matched', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'o1')
    s = startActive(s)
    s = completeActive(s)
    s = removeOrder(s, 'o1')
    expect(s.outputBufferOrderId).toBeNull()
  })
})

describe('isQueueFull', () => {
  it('returns true when queue has 3 orders', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'o1')
    s = enqueue(s, 'o2')
    s = enqueue(s, 'o3')
    expect(isQueueFull(s)).toBe(true)
  })

  it('returns false when queue has fewer than 3 orders', () => {
    const s = enqueue(createStation('fryer'), 'o1')
    expect(isQueueFull(s)).toBe(false)
  })
})

describe('startActive priority', () => {
  it('does not clobber interactionState when activeOrderId is set and buffer is occupied', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'o1')
    s = startActive(s)  // sets activeOrderId and interactionState='waitingForInput'
    s = { ...s, outputBufferOrderId: 'blocking-order' }  // buffer also occupied
    const next = startActive(s)  // should do nothing
    expect(next.activeOrderId).toBe('o1')
    expect(next.interactionState).toBe('waitingForInput')  // NOT overwritten to 'blocked'
  })
})
