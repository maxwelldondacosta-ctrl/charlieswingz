// app/games/chicken-shop/src/game/minigames.ts
// Each minigame is a self-contained class that renders into a Container,
// runs until resolved, then calls onComplete(penaltyPence).

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { CANVAS_W } from './PixiApp'

type OnComplete = (penaltyPence: number) => void

// ── Fryer ─────────────────────────────────────────────────────────────────
// Moving needle. Tap when needle is in the green window.
// Perfect (center 35%): 0p penalty
// Salvage (outer 65%): 200p penalty
// Miss (outside window in 1.2s): 200p penalty + 4s remake delay

export class FryerMinigame {
  container: Container
  private needle: Graphics
  private bar: Graphics
  private wobble: boolean
  private needleX = 0
  private direction = 1
  private speed: number
  private BAR_W: number
  private WIN_START: number
  private WIN_END: number
  private PERFECT_START: number
  private PERFECT_END: number
  private timeInWindow = 0
  private resolved = false
  private onComplete: OnComplete
  private _app: Application
  private _tickFn: ((t: { deltaMS: number }) => void) | null = null

  constructor(app: Application, parent: Container, onComplete: OnComplete, wobble = false) {
    this.onComplete = onComplete
    this.wobble = wobble

    this.container = new Container()
    this.container.x = CANVAS_W / 2 - 100
    this.container.y = 500
    parent.addChild(this.container)

    this.BAR_W = 200
    // Green window is 1.2s worth of needle travel; window occupies middle 60% of bar
    this.WIN_START = this.BAR_W * 0.2
    this.WIN_END = this.BAR_W * 0.8
    const windowW = this.WIN_END - this.WIN_START
    this.PERFECT_START = this.WIN_START + windowW * 0.325
    this.PERFECT_END = this.WIN_END - windowW * 0.325

    // Background bar
    this.bar = new Graphics()
    this.bar.rect(0, 0, this.BAR_W, 20).fill(0x374151)
    // Salvage zone (yellow)
    const wobbleShrink = wobble ? 20 : 0
    this.bar.rect(this.WIN_START + wobbleShrink, 0, windowW - wobbleShrink * 2, 20).fill(0xf59e0b)
    // Perfect zone (green)
    this.bar.rect(this.PERFECT_START + wobbleShrink, 0, this.PERFECT_END - this.PERFECT_START - wobbleShrink * 2, 20).fill(0x22c55e)
    this.container.addChild(this.bar)

    // Needle
    this.needle = new Graphics()
    this.needle.rect(-2, -4, 4, 28).fill(0xffffff)
    this.needle.x = 0
    this.needle.y = 0
    this.container.addChild(this.needle)

    this.speed = 120 / 1000 // px per ms

    // Tap to resolve
    this.container.eventMode = 'static'
    this.container.on('pointertap', () => this.tap())

    this._app = app
    this._tickFn = (t: { deltaMS: number }) => this.tick(t)
    this._app.ticker.add(this._tickFn)
  }

  private tick(ticker: { deltaMS: number }): void {
    if (this.resolved) return
    this.needleX += this.direction * this.speed * ticker.deltaMS
    if (this.needleX >= this.BAR_W || this.needleX <= 0) this.direction *= -1
    this.needle.x = this.needleX

    // Auto-fail if player misses the window entirely after 3 bounces (approx 5s)
    this.timeInWindow += ticker.deltaMS
    if (this.timeInWindow > 5000) this.resolve(200)
  }

  private tap(): void {
    if (this.resolved) return
    const wobbleShrink = this.wobble ? 20 : 0
    if (this.needleX >= this.PERFECT_START + wobbleShrink && this.needleX <= this.PERFECT_END - wobbleShrink) {
      this.resolve(0)
    } else if (this.needleX >= this.WIN_START + wobbleShrink && this.needleX <= this.WIN_END - wobbleShrink) {
      this.resolve(200)
    } else {
      this.resolve(200)
    }
  }

  private resolve(penalty: number): void {
    this.resolved = true
    if (this._tickFn) {
      this._app.ticker.remove(this._tickFn)
      this._tickFn = null
    }
    this.container.destroy({ children: true })
    this.onComplete(penalty)
  }
}

// ── Sauce / Sides ─────────────────────────────────────────────────────────
// 3 buttons. Pick correct one.

export class ChoiceMinigame {
  container: Container
  private resolved = false
  private _timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    parent: Container,
    options: string[],
    correctIndex: number,
    timeoutMs: number,
    onComplete: OnComplete,
  ) {
    this.container = new Container()
    this.container.x = CANVAS_W / 2 - 120
    this.container.y = 520
    parent.addChild(this.container)

    const PENALTY = 100

    options.forEach((label, i) => {
      const btn = new Graphics()
      btn.roundRect(0, 0, 70, 40, 6).fill(0x4b5563)
      btn.x = i * 80
      btn.eventMode = 'static'
      btn.cursor = 'pointer'

      const txt = new Text({ text: label, style: new TextStyle({ fontSize: 12, fill: 0xffffff }) })
      txt.anchor.set(0.5)
      txt.x = 35
      txt.y = 20
      btn.addChild(txt)
      this.container.addChild(btn)

      btn.on('pointertap', () => {
        if (this.resolved) return
        this.resolved = true
        if (this._timer !== null) {
          clearTimeout(this._timer)
          this._timer = null
        }
        const penalty = i === correctIndex ? 0 : PENALTY
        this.container.destroy({ children: true })
        onComplete(penalty)
      })
    })

    // Auto-fail on timeout
    this._timer = setTimeout(() => {
      if (!this.resolved) {
        this.resolved = true
        this.container.destroy({ children: true })
        onComplete(PENALTY)
      }
    }, timeoutMs)
  }
}

// ── Drinks ────────────────────────────────────────────────────────────────
// Hold to fill. Release in target band.

export class DrinksMinigame {
  container: Container
  private fillLevel = 0
  private filling = false
  private resolved = false
  private fillBar: Graphics
  private FILL_TO_OVERFLOW_MS = 2000
  private _app: Application
  private _tickFn: ((t: { deltaMS: number }) => void) | null = null

  constructor(app: Application, parent: Container, onComplete: OnComplete) {
    this.container = new Container()
    this.container.x = CANVAS_W / 2 - 20
    this.container.y = 520
    parent.addChild(this.container)

    // Cup outline
    const cup = new Graphics()
    cup.rect(0, 0, 40, 80).stroke({ color: 0xffffff, width: 2 })
    this.container.addChild(cup)

    // Target band (45%–60% = y 32–43 from bottom)
    const target = new Graphics()
    target.rect(2, Math.floor(80 * 0.4), 36, Math.floor(80 * 0.15)).fill({ color: 0x22c55e, alpha: 0.4 })
    this.container.addChild(target)

    this.fillBar = new Graphics()
    this.container.addChild(this.fillBar)

    this.container.eventMode = 'static'
    this.container.on('pointerdown', () => { this.filling = true })
    this.container.on('pointerup', () => { if (!this.resolved) this.resolve(onComplete) })
    this.container.on('pointerupoutside', () => { if (!this.resolved) this.resolve(onComplete) })

    this._app = app
    this._tickFn = (t: { deltaMS: number }) => {
      if (!this.filling || this.resolved) return
      this.fillLevel = Math.min(1, this.fillLevel + t.deltaMS / this.FILL_TO_OVERFLOW_MS)
      this.fillBar.clear()
      const fillH = Math.floor(this.fillLevel * 80)
      this.fillBar.rect(2, 80 - fillH, 36, fillH).fill(0x3b82f6)
      if (this.fillLevel >= 1) this.resolve(onComplete)
    }
    this._app.ticker.add(this._tickFn)
  }

  private resolve(onComplete: OnComplete): void {
    this.resolved = true
    if (this._tickFn) {
      this._app.ticker.remove(this._tickFn)
      this._tickFn = null
    }
    const f = this.fillLevel
    let penalty = 0
    if (f >= 0.45 && f <= 0.60) penalty = 0
    else if ((f >= 0.35 && f < 0.45) || (f > 0.60 && f <= 0.72)) penalty = 100
    else penalty = 0 // major miss: 0p penalty but caller should handle retry — simplified here
    this.container.destroy({ children: true })
    onComplete(penalty)
  }
}

// ── Boxing ────────────────────────────────────────────────────────────────
// Tap 6 times in 1.8s.

export class BoxingMinigame {
  container: Container
  private taps = 0
  private resolved = false
  private TARGET = 6
  private WINDOW_MS = 1800
  private counter: Text
  private _timer: ReturnType<typeof setTimeout> | null = null

  constructor(app: Application, parent: Container, onComplete: OnComplete) {
    this.container = new Container()
    this.container.x = CANVAS_W / 2 - 50
    this.container.y = 520
    parent.addChild(this.container)

    const bg = new Graphics()
    bg.roundRect(0, 0, 100, 60, 8).fill(0x7c3aed)
    this.container.addChild(bg)

    this.counter = new Text({
      text: `0 / ${this.TARGET}`,
      style: new TextStyle({ fontSize: 18, fill: 0xffffff, fontWeight: 'bold' }),
    })
    this.counter.anchor.set(0.5)
    this.counter.x = 50
    this.counter.y = 30
    this.container.addChild(this.counter)

    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
    this.container.on('pointertap', () => {
      if (this.resolved) return
      this.taps++
      this.counter.text = `${this.taps} / ${this.TARGET}`
      if (this.taps >= this.TARGET) this.finish(onComplete, 0)
    })

    this._timer = setTimeout(() => {
      if (!this.resolved) this.finish(onComplete, 100)
    }, this.WINDOW_MS)
  }

  private finish(onComplete: OnComplete, penalty: number): void {
    this.resolved = true
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this.container.destroy({ children: true })
    onComplete(penalty)
  }
}
