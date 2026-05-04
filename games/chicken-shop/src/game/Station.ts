import { Container, Sprite, Text, TextStyle } from 'pixi.js'
import { getTexture } from './textures'
import {
  createStation,
  enqueue,
  startActive,
  completeActive,
  releaseBuffer,
  removeOrder,
  isQueueFull,
} from './stationMachine'
import type { StationKey, StationRuntime } from '../types'

const STATION_LABELS: Record<StationKey, string> = {
  fryer: 'Fryer',
  sauce: 'Sauce',
  sides: 'Sides',
  drinks: 'Drinks',
  boxing: 'Boxing',
  till: 'Till',
}

export class StationEntity {
  container: Container
  state: StationRuntime
  key: StationKey

  private bg: Sprite
  private blockedOverlay: Sprite
  private bufferGlow: Sprite
  private queueDots: Sprite[]
  private label: Text
  private onTap: ((key: StationKey) => void) | null = null

  constructor(key: StationKey, x: number, y: number, onTap: (key: StationKey) => void) {
    this.key = key
    this.state = createStation(key)
    this.onTap = onTap

    this.container = new Container()
    this.container.x = x
    this.container.y = y
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
    this.container.on('pointertap', () => this.onTap?.(this.key))

    this.bg = new Sprite(getTexture(`station-${key}`))
    this.container.addChild(this.bg)

    this.bufferGlow = new Sprite(getTexture('buffer-glow'))
    this.bufferGlow.position.set(-4, -4)
    this.bufferGlow.visible = false
    this.container.addChild(this.bufferGlow)

    this.blockedOverlay = new Sprite(getTexture('station-blocked'))
    this.blockedOverlay.visible = false
    this.container.addChild(this.blockedOverlay)

    this.label = new Text({
      text: STATION_LABELS[key],
      style: new TextStyle({ fontSize: 11, fill: 0xffffff, fontWeight: 'bold' }),
    })
    this.label.anchor.set(0.5, 0)
    this.label.x = 50
    this.label.y = 6
    this.container.addChild(this.label)

    this.queueDots = [0, 1, 2].map(i => {
      const dot = new Sprite(getTexture('queue-dot'))
      dot.x = 16 + i * 14
      dot.y = 106
      this.container.addChild(dot)
      return dot
    })
  }

  enqueue(orderId: string): void { this.state = enqueue(this.state, orderId) }
  startActive(): void { this.state = startActive(this.state) }
  completeActive(): void { this.state = completeActive(this.state) }
  releaseBuffer(): string | null { const [s, id] = releaseBuffer(this.state); this.state = s; return id }
  removeOrder(orderId: string): void { this.state = removeOrder(this.state, orderId) }
  isFull(): boolean { return isQueueFull(this.state) }

  render(nowMs: number): void {
    const hasBuffer = this.state.outputBufferOrderId !== null
    const isFull = this.isFull()

    this.bufferGlow.visible = hasBuffer
    if (hasBuffer) {
      this.bufferGlow.alpha = 0.6 + Math.sin(nowMs / 300) * 0.4
    }

    this.blockedOverlay.visible = isFull

    this.queueDots.forEach((dot, i) => {
      const filled = i < this.state.queue.length
      dot.texture = getTexture(filled ? 'queue-dot-filled' : 'queue-dot')
    })
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
