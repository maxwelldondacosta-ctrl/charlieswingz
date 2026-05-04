// app/games/chicken-shop/src/game/GameScene.ts
import { Application, Container } from 'pixi.js'
import { CANVAS_W, CANVAS_H } from './PixiApp'
import { generateTextures } from './textures'
import { StationEntity } from './Station'
import { CustomerEntity, spawnFloatingCash } from './Customer'
import { createOrder, transitionOrder, computePayout, tickPatience, applyPenalty } from './orderMachine'
import type { LevelConfig, Order, StationKey } from '../types'
import { useRunStore } from '../store/runStore'

const STATION_POSITIONS: Record<StationKey, [number, number]> = {
  fryer:  [20,  200],
  sauce:  [140, 200],
  sides:  [260, 200],
  drinks: [20,  340],
  boxing: [140, 340],
  till:   [260, 340],
}

const DRAIN_RATES: Record<string, number> = {
  activeAtStation: 0.85,
  readyForNextStation: 1.15,
  waitingInLobby: 1.0,
}

export class GameScene {
  private app: Application
  private stage: Container
  private stations: Map<StationKey, StationEntity> = new Map()
  private orders: Map<string, Order> = new Map()
  private customers: Map<string, CustomerEntity> = new Map()
  private config: LevelConfig
  private spawnClock = 0
  private nextSpawnMs: number
  private running = false
  private customerIdCounter = 0

  constructor(app: Application, config: LevelConfig) {
    this.app = app
    this.config = config
    this.stage = new Container()
    app.stage.addChild(this.stage)
    this.nextSpawnMs = this.randomSpawnInterval()

    generateTextures(app)
    this.buildStations()
  }

  private randomSpawnInterval(): number {
    const { spawnIntervalMinMs: min, spawnIntervalMaxMs: max } = this.config
    return min + Math.random() * (max - min)
  }

  private buildStations(): void {
    for (const key of this.config.activeStations) {
      const [x, y] = STATION_POSITIONS[key]
      const entity = new StationEntity(key, x, y, (k) => this.onStationTap(k))
      this.stations.set(key, entity)
      this.stage.addChild(entity.container)
    }
  }

  private onStationTap(key: StationKey): void {
    const station = this.stations.get(key)
    if (!station) return
    if (station.state.outputBufferOrderId) {
      this.releaseBuffer(key)
    }
  }

  private releaseBuffer(key: StationKey): void {
    const station = this.stations.get(key)
    if (!station) return
    const orderId = station.releaseBuffer()
    if (!orderId) return

    const order = this.orders.get(orderId)
    if (!order) return

    const nextIdx = order.currentStationIndex
    const nextKey = order.requiredStations[nextIdx]

    if (!nextKey) {
      // All stations done — this shouldn't happen (till completes inline)
      return
    }

    const nextStation = this.stations.get(nextKey)
    if (!nextStation || nextStation.isFull()) return

    const accepted = transitionOrder(order, 'ACCEPT')
    this.orders.set(orderId, accepted)
    nextStation.enqueue(orderId)
  }

  private spawnCustomer(): void {
    const totalNonTerminal = [...this.orders.values()].filter(
      o => o.state !== 'completed' && o.state !== 'walkedOut' && o.state !== 'voided'
    ).length
    if (totalNonTerminal >= 12) return

    const customerId = `customer-${++this.customerIdCounter}`
    const order = createOrder({
      customerId,
      level: this.config.level,
      activeStations: this.config.activeStations,
      nowMs: Date.now(),
      patienceMs: this.config.patienceBaseMs,
    })

    const customer: import('../types').Customer = {
      id: customerId,
      spawnedAtMs: Date.now(),
      orderId: order.id,
      mood: 'calm',
    }

    this.orders.set(order.id, order)

    const lobbyX = 20 + (this.customers.size % 6) * 60
    const lobbyY = 680
    const entity = new CustomerEntity(customer, lobbyX, lobbyY)
    this.customers.set(customerId, entity)
    this.stage.addChild(entity.container)

    // Auto-accept first customer into first station queue if space available
    const firstKey = order.requiredStations[0]
    const firstStation = this.stations.get(firstKey)
    if (firstStation && !firstStation.isFull()) {
      const accepted = transitionOrder(order, 'ACCEPT')
      this.orders.set(order.id, accepted)
      firstStation.enqueue(order.id)
    }
  }

  private processTill(orderId: string): void {
    const order = this.orders.get(orderId)
    if (!order) return

    const completed = transitionOrder(order, 'STATION_COMPLETE')
    this.orders.set(orderId, completed)

    const payout = computePayout(order)
    useRunStore.getState().addCash(payout)

    // Floating cash label
    const custEntity = [...this.customers.values()].find(c => c.data.orderId === orderId)
    if (custEntity) {
      spawnFloatingCash(this.stage, custEntity.container.x, custEntity.container.y - 80, payout)
      custEntity.destroy()
      this.customers.delete(custEntity.data.id)
    }
    this.orders.delete(orderId)
  }

  tick(ticker: { deltaMS: number }): void {
    if (!this.running) return

    const delta = ticker.deltaMS
    const run = useRunStore.getState()

    run.tickTimer(delta)

    // Spawn
    this.spawnClock += delta
    if (this.spawnClock >= this.nextSpawnMs) {
      this.spawnClock = 0
      this.nextSpawnMs = this.randomSpawnInterval()
      this.spawnCustomer()
    }

    // Tick patience + walkouts
    for (const [orderId, order] of this.orders) {
      if (order.state === 'completed' || order.state === 'voided' || order.state === 'walkedOut') continue

      const drainRate = DRAIN_RATES[order.state] ?? 1
      const ticked = tickPatience(order, delta, drainRate)
      this.orders.set(orderId, ticked)

      if (ticked.patienceRemainingMs <= 0) {
        // Walkout
        const walkedOut = transitionOrder(ticked, 'WALKOUT')
        this.orders.set(orderId, walkedOut)
        for (const station of this.stations.values()) {
          station.removeOrder(orderId)
        }
        run.addWalkout()
        const custEntity = [...this.customers.values()].find(c => c.data.orderId === orderId)
        if (custEntity) { custEntity.destroy(); this.customers.delete(custEntity.data.id) }
        this.orders.delete(orderId)
      }
    }

    // Advance stations
    for (const [key, station] of this.stations) {
      // Pull from queue if idle
      if (!station.state.activeOrderId && !station.state.outputBufferOrderId && station.state.queue.length > 0) {
        station.startActive()
        const activeId = station.state.activeOrderId
        if (activeId) {
          const order = this.orders.get(activeId)
          if (order) {
            const started = transitionOrder(order, 'STATION_START')
            this.orders.set(activeId, started)

            if (key === 'till') {
              // Till has no minigame — complete immediately
              station.completeActive()
              this.processTill(activeId)
            }
            // Other stations wait for minigame completion via completeStation()
          }
        }
      }

      station.render(Date.now())
    }

    // Update customer visuals
    for (const entity of this.customers.values()) {
      const order = this.orders.get(entity.data.orderId)
      if (order) {
        entity.update(entity.data, order.patienceRemainingMs, order.patienceMaxMs)
      }
    }

    // End-of-level check
    const cashEarned = run.cashEarnedPence
    const target = run.cashTargetPence
    const timeUp = run.timerRemainingMs <= 0

    if (cashEarned >= target && run.result === null) {
      run.setResult('success')
      this.running = false
    } else if (timeUp && cashEarned < target && run.result === null) {
      run.setResult('fail')
      this.running = false
    }
  }

  // Called by minigame handlers when a station interaction completes
  completeStation(key: StationKey, penaltyPence = 0): void {
    const station = this.stations.get(key)
    if (!station || !station.state.activeOrderId) return

    const orderId = station.state.activeOrderId
    let order = this.orders.get(orderId)
    if (!order) return

    if (penaltyPence > 0) {
      order = applyPenalty(order, penaltyPence)
    }

    const completed = transitionOrder(order, 'STATION_COMPLETE')
    this.orders.set(orderId, completed)
    station.completeActive()
  }

  start(): void {
    this.running = true
    this.app.ticker.add((ticker) => this.tick(ticker))
  }

  stop(): void {
    this.running = false
  }

  destroy(): void {
    this.stop()
    this.stage.destroy({ children: true })
  }
}
