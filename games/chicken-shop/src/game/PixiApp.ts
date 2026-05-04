import { Application } from 'pixi.js'

export const CANVAS_W = 480
export const CANVAS_H = 800

let _app: Application | null = null

export async function initPixi(container: HTMLElement): Promise<Application> {
  if (_app) return _app

  const app = new Application()
  await app.init({
    width: CANVAS_W,
    height: CANVAS_H,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    background: 0x1a1a2e,
  })

  container.appendChild(app.canvas as HTMLCanvasElement)
  _app = app

  function resize() {
    const scale = Math.min(
      container.clientWidth / CANVAS_W,
      container.clientHeight / CANVAS_H,
    )
    const canvas = app.canvas as HTMLCanvasElement
    canvas.style.width = `${CANVAS_W * scale}px`
    canvas.style.height = `${CANVAS_H * scale}px`
  }
  resize()
  window.addEventListener('resize', resize)

  return app
}

export function getApp(): Application {
  if (!_app) throw new Error('Pixi not initialised — call initPixi first')
  return _app
}

export function destroyPixi(): void {
  if (_app) {
    _app.destroy(true)
    _app = null
  }
}
