import { Application, Graphics, Texture } from 'pixi.js'

const cache = new Map<string, Texture>()

function make(app: Application, key: string, w: number, h: number, draw: (g: Graphics) => void): Texture {
  if (cache.has(key)) return cache.get(key)!
  const g = new Graphics()
  draw(g)
  const tex = app.renderer.generateTexture(g)
  g.destroy()
  cache.set(key, tex)
  return tex
}

export function generateTextures(app: Application): void {
  // Customer silhouette — white, tinted at runtime based on mood
  make(app, 'customer', 40, 70, g => {
    g.circle(20, 12, 12).fill(0xffffff)
    g.roundRect(8, 26, 24, 30, 4).fill(0xffffff)
    g.rect(8, 56, 10, 14).fill(0xffffff)
    g.rect(22, 56, 10, 14).fill(0xffffff)
  })

  // Station backgrounds
  const STATION_COLORS: Record<string, number> = {
    fryer: 0xd97706,
    sauce: 0xdc2626,
    sides: 0x16a34a,
    drinks: 0x2563eb,
    boxing: 0x7c3aed,
    till: 0xb45309,
  }
  for (const [key, color] of Object.entries(STATION_COLORS)) {
    make(app, `station-${key}`, 100, 120, g => {
      g.roundRect(0, 0, 100, 120, 8).fill(color)
      g.roundRect(4, 4, 92, 112, 6).stroke({ color: 0xffffff, alpha: 0.2, width: 2 })
    })
  }

  // Output buffer glow ring
  make(app, 'buffer-glow', 108, 128, g => {
    g.roundRect(0, 0, 108, 128, 10).stroke({ color: 0xfacc15, alpha: 0.9, width: 4 })
  })

  // Blocked icon overlay
  make(app, 'station-blocked', 100, 120, g => {
    g.roundRect(0, 0, 100, 120, 8).fill(0x111111)
    g.moveTo(20, 20).lineTo(80, 100).stroke({ color: 0xef4444, width: 6 })
    g.moveTo(80, 20).lineTo(20, 100).stroke({ color: 0xef4444, width: 6 })
  })

  // Patience bar
  make(app, 'patience-bar-fill', 36, 6, g => {
    g.rect(0, 0, 36, 6).fill(0x22c55e)
  })
  make(app, 'patience-bar-bg', 36, 6, g => {
    g.rect(0, 0, 36, 6).fill(0x374151)
  })

  // Queue slot dots
  make(app, 'queue-dot', 10, 10, g => {
    g.circle(5, 5, 5).fill(0xffffff)
  })
  make(app, 'queue-dot-filled', 10, 10, g => {
    g.circle(5, 5, 5).fill(0xfacc15)
  })
}

export function getTexture(key: string): Texture {
  const t = cache.get(key)
  if (!t) throw new Error(`Texture '${key}' not generated — call generateTextures first`)
  return t
}
