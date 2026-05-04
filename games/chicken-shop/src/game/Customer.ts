import { Container, Sprite, Text, TextStyle } from 'pixi.js'
import { getTexture } from './textures'
import { getApp } from './PixiApp'
import type { Customer as CustomerData, CustomerMood } from '../types'

const MOOD_TINT: Record<CustomerMood, number> = {
  calm: 0xffffff,
  waiting: 0xfbbf24,
  angry: 0xef4444,
}

export class CustomerEntity {
  container: Container
  data: CustomerData
  private silhouette: Sprite
  private patienceBg: Sprite
  private patienceFill: Sprite

  constructor(data: CustomerData, x: number, y: number) {
    this.data = data
    this.container = new Container()
    this.container.x = x
    this.container.y = y

    this.silhouette = new Sprite(getTexture('customer'))
    this.silhouette.anchor.set(0.5, 1)
    this.container.addChild(this.silhouette)

    this.patienceBg = new Sprite(getTexture('patience-bar-bg'))
    this.patienceBg.anchor.set(0.5, 0)
    this.patienceBg.y = 4
    this.container.addChild(this.patienceBg)

    this.patienceFill = new Sprite(getTexture('patience-bar-fill'))
    this.patienceFill.anchor.set(0, 0)
    this.patienceFill.x = -18
    this.patienceFill.y = 4
    this.container.addChild(this.patienceFill)
  }

  update(data: CustomerData, patienceRemainingMs: number, patienceMaxMs: number): void {
    this.data = data

    const fraction = patienceRemainingMs / patienceMaxMs
    const mood: CustomerMood = fraction > 0.5 ? 'calm' : fraction > 0.2 ? 'waiting' : 'angry'
    this.silhouette.tint = MOOD_TINT[mood]

    if (mood === 'angry') {
      const pulse = 0.9 + Math.sin(Date.now() / 150) * 0.1
      this.silhouette.scale.set(pulse)
    } else {
      this.silhouette.scale.set(1)
    }

    this.patienceFill.scale.x = Math.max(0, fraction)
    const fillColor = fraction > 0.5 ? 0x22c55e : fraction > 0.2 ? 0xf59e0b : 0xef4444
    this.patienceFill.tint = fillColor
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}

export function spawnFloatingCash(parent: Container, x: number, y: number, pence: number): void {
  const app = getApp()
  const label = new Text({
    text: `+£${(pence / 100).toFixed(2)}`,
    style: new TextStyle({ fontSize: 16, fill: 0xfacc15, fontWeight: 'bold' }),
  })
  label.anchor.set(0.5)
  label.x = x
  label.y = y
  parent.addChild(label)

  let elapsed = 0
  const tick = (ticker: { deltaMS: number }) => {
    elapsed += ticker.deltaMS
    label.y -= ticker.deltaMS * 0.04
    label.alpha = Math.max(0, 1 - elapsed / 1200)
    if (elapsed >= 1200) {
      app.ticker.remove(tick)
      label.destroy()
    }
  }
  app.ticker.add(tick)
}
