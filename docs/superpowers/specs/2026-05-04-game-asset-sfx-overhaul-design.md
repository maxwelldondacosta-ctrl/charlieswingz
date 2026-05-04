# Game Asset & SFX Overhaul — Design Spec
*Date: 2026-05-04*

## Goal

Replace the current AI-generated (fal.ai) sprite assets across all 4 Charlie's Wingz arcade games with high-quality cartoon/illustrated assets sourced from Kenney.nl (base assets) and itch.io (hero character sprites). Wire up SFX from the existing Freesound download script for all games. Push each finished game to GitHub as its own commit.

---

## Art Style

**Cartoon/illustrated — no pixel art.**

- Primary source: Kenney.nl (free, consistent cartoon vector style)
- Secondary source: itch.io (higher-quality hero character sprite sheets with animation frames)
- Chicken/food theme is prioritised but not mandatory — if no good thematic asset exists, use the best-looking generic cartoon asset and apply Charlie's Wingz branding (gold `#e8a838`, dark `#0d0d1a`) through HUD, menus, and overlays

---

## Asset Plan Per Game

### 1. Snake (`/snake`, `app/public/snake.html`)
**Kenney:** Background grid tile, collectible food items (wing, crown)
**itch.io:** Cartoon snake head + body segments with smooth curves

Current asset files to replace:
- `game-assets/snake/bg-tile.png`
- `game-assets/snake/snake-head.png`
- `game-assets/snake/snake-body.png`
- `game-assets/snake/collectible-wing.png`
- `game-assets/snake/collectible-crown.png`

---

### 2. Wing King (`/platformer`, `app/public/platformer.html`)
**Kenney:** Platform tiles, city background layers, garbage bin enemy, food collectibles
**itch.io:** Cartoon chicken character with idle/run/jump animation frames

Current asset files to replace:
- `game-assets/platformer/bg-city.png`
- `game-assets/platformer/platform-tile.png`
- `game-assets/platformer/player-idle.png` / `player-run-1.png` / `player-run-2.png` / `player-jump.png`
- `game-assets/platformer/enemy-bin.png`
- `game-assets/platformer/enemy-inspector.png`
- `game-assets/platformer/collectible-wing.png`

---

### 3. Wing Run (`/wing-run.html`, `app/public/wing-run.html`)
**Kenney:** Road/grass background tiles, city buildings (house, shop), enemy cars
**itch.io:** Cartoon chicken on delivery bike/scooter with animation frames

Current asset files to replace:
- `game-assets/wingrun/bg-road.png`
- `game-assets/wingrun/bg-grass.png`
- `game-assets/wingrun/building-house.png`
- `game-assets/wingrun/building-shop.png`
- `game-assets/wingrun/enemy-car-1.png`
- `game-assets/wingrun/enemy-car-2.png`
- `game-assets/wingrun/player-bike.png`

---

### 4. Sauce Shooter (`/shooter`, `app/public/shooter.html`)
**Kenney:** Road/grid background tile, enemy vans (top-down), explosion sprite
**itch.io:** Top-down cartoon chicken player sprite (hardest — fallback to generator script if no good match)

Current asset files to replace:
- `game-assets/shooter/bg-tile.png`
- `game-assets/shooter/player-ship.png`
- `game-assets/shooter/enemy-van-1.png`
- `game-assets/shooter/enemy-van-2.png`
- `game-assets/shooter/bullet-sauce.png`
- `game-assets/shooter/explosion.png`
- `game-assets/shooter/powerup-rapid.png`
- `game-assets/shooter/powerup-shield.png`

---

## SFX Plan

All SFX downloaded via `scripts/download-sfx.js` from Freesound. Freesound API key required at runtime.

| Game | Status | Sound files |
|------|--------|-------------|
| Snake | Done | `snake-eat.mp3`, `snake-die.mp3`, `snake-speedup.mp3`, `snake-start.mp3` |
| Wing Run | Done | `wr-deliver.mp3`, `wr-crash.mp3`, `wr-closecall.mp3`, `wr-powerup.mp3`, `wr-round.mp3`, `wr-hop.mp3`, `wr-combo.mp3` |
| Wing King | Missing | `wk-jump.mp3`, `wk-doublejump.mp3`, `wk-land.mp3`, `wk-collect.mp3`, `wk-die.mp3`, `wk-gameover.mp3` |
| Sauce Shooter | Missing | `ss-shoot.mp3`, `ss-explosion.mp3`, `ss-hit.mp3`, `ss-powerup.mp3`, `ss-gameover.mp3` |
| Shared UI | Done | `ui-click.mp3` |

**Action:** Add Wing King and Shooter sound specs to `scripts/download-sfx.js`, then run the script.

All 4 game HTML files must be updated to load SFX via Phaser's audio system (`this.load.audio()` in preload, `this.sound.play()` on events). Currently none of the games wire up the existing SFX files.

---

## Integration Approach

1. **Source assets** — Download Kenney packs + itch.io character packs
2. **Rename to match** — Rename/extract frames to match existing asset filenames where possible, minimising Phaser code changes
3. **Update Phaser preload** — Where new assets are spritesheets with different dimensions or frame counts, update `preload()` and animation configs in the game HTML
4. **Add SFX** — Add `this.load.audio()` calls in preload and `this.sound.play()` on game events
5. **Test in browser** — Each game must be playable end-to-end before committing
6. **Push to GitHub** — `https://github.com/maxwelldondacosta-ctrl/charlieswingz` — one commit per finished game

---

## Implementation Order

1. Snake — simplest asset set, quickest win
2. Wing King — platformer, well-structured existing code
3. Wing Run — scroller, most visual variety
4. Sauce Shooter — top-down, hardest character asset to source

---

## Fallback

If a specific sprite cannot be sourced from Kenney or itch.io:
- Run `FAL_KEY=yourkey node scripts/generate-assets.js <game>` to regenerate that asset via fal.ai
- Review the 4 generated variants and pick the best one
