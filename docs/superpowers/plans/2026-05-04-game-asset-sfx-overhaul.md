# Game Asset & SFX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all AI-generated sprite assets across 4 Phaser 3 arcade games with high-quality cartoon assets from Kenney.nl + itch.io, and wire up SFX in all 4 games.

**Architecture:** Each game is a self-contained HTML file in `app/public/`. Assets live in `app/public/game-assets/<game>/`. SFX live in `app/public/sfx/`. All games use Phaser 3.60. Snake uses a custom PNG loader; the other 3 games currently load SVGs from `/game-assets/vector/` — these are switched to PNG via `this.load.image()`.

**Tech Stack:** Phaser 3.60, Kenney.nl asset packs (PNG), itch.io sprite sheets (PNG), Freesound API (MP3 SFX via existing `scripts/download-sfx.js`)

---

## File Map

| File | Action |
|------|--------|
| `scripts/download-sfx.js` | Add Wing King + Shooter sound specs |
| `app/public/sfx/wk-*.mp3` + `ss-*.mp3` | Created by running the script |
| `app/public/game-assets/snake/*.png` | Replace: head, body, wing, crown, bg-tile |
| `app/public/game-assets/platformer/*.png` | Replace: bg-city, platform-tile, player-idle, enemy-bin, enemy-inspector, collectible-wing |
| `app/public/game-assets/wingrun/*.png` | Replace: bg-road, player-bike, enemy-car-1, enemy-car-2, building-shop, building-house |
| `app/public/game-assets/shooter/*.png` | Replace: bg-tile, player-ship, enemy-van-1, enemy-van-2, bullet-sauce, explosion, powerup-shield, powerup-rapid |
| `app/public/snake.html` | No code changes needed (assets already loaded as PNG) |
| `app/public/platformer.html` | Switch preload from SVG→PNG, fix background path, fix SFX keys |
| `app/public/wing-run.html` | Switch preload from SVG→PNG, fix background path |
| `app/public/shooter.html` | Switch preload from SVG→PNG, add SFX loading + play calls |

---

## Task 1: Add Wing King + Shooter SFX to download script

**Files:**
- Modify: `scripts/download-sfx.js`

- [ ] **Step 1: Add Wing King and Shooter sounds to the SOUNDS array**

In `scripts/download-sfx.js`, add these entries to the `SOUNDS` array after the Wing Run block (before the Shared UI block):

```javascript
  // ── Wing King ─────────────────────────────────────────────────────────────
  {
    name: 'wk-jump',
    query: 'cartoon jump boing spring',
    maxDuration: 0.8,
  },
  {
    name: 'wk-doublejump',
    query: 'double jump whoosh air',
    maxDuration: 0.8,
  },
  {
    name: 'wk-collect',
    query: 'pickup coin collect chime',
    maxDuration: 0.8,
  },
  {
    name: 'wk-die',
    query: 'cartoon fail death ouch',
    maxDuration: 2,
  },
  {
    name: 'wk-gameover',
    query: 'game over fail sad trombone',
    maxDuration: 4,
  },

  // ── Sauce Shooter ────────────────────────────────────────────────────────
  {
    name: 'ss-shoot',
    query: 'laser shoot zap blaster short',
    maxDuration: 0.5,
  },
  {
    name: 'ss-explosion',
    query: 'explosion boom blast',
    maxDuration: 1.5,
  },
  {
    name: 'ss-hit',
    query: 'hit impact thud damage',
    maxDuration: 0.5,
  },
  {
    name: 'ss-powerup',
    query: 'power up collect shiny',
    maxDuration: 1.5,
  },
  {
    name: 'ss-gameover',
    query: 'game over mission failed alert',
    maxDuration: 4,
  },
```

- [ ] **Step 2: Run the script (requires Freesound API key)**

```bash
FREESOUND_KEY=your_key node scripts/download-sfx.js
```

Expected output: each new sound downloads with ✓. Existing sounds are skipped. Check `app/public/sfx/` for the new mp3 files:
- `wk-jump.mp3`, `wk-doublejump.mp3`, `wk-collect.mp3`, `wk-die.mp3`, `wk-gameover.mp3`
- `ss-shoot.mp3`, `ss-explosion.mp3`, `ss-hit.mp3`, `ss-powerup.mp3`, `ss-gameover.mp3`

If a sound fails (no results), re-run with `--force` and a simpler query like `query: 'jump'`.

- [ ] **Step 3: Commit**

```bash
git add scripts/download-sfx.js app/public/sfx/
git commit -m "feat: add Wing King and Shooter SFX via Freesound"
```

---

## Task 2: Source all visual assets

**Files:**
- `app/public/game-assets/snake/` — replace 5 PNGs
- `app/public/game-assets/platformer/` — replace 6 PNGs
- `app/public/game-assets/wingrun/` — replace 6 PNGs
- `app/public/game-assets/shooter/` — replace 8 PNGs

This task is asset sourcing — no code, just downloading and renaming files.

### Kenney.nl packs to download

Go to kenney.nl/assets and download these free packs:

| Pack name | What to use it for |
|-----------|-------------------|
| **Animal Pack Redux** | Chicken/rooster sprites for player characters (Snake head, Wing King player, Wing Run rider) |
| **Simplified Platformer Pack** | Platform tiles, backgrounds for Wing King |
| **City Kit (Roads)** | Road tile for Wing Run background |
| **City Kit (Commercial)** | Buildings (shop, house) for Wing Run |
| **Racing Pack** | Top-down cars/vehicles for Wing Run (enemy-car-1, enemy-car-2) and Shooter (enemy-van-1, enemy-van-2) |
| **Food Kit** | Wing + crown collectibles for Snake and Wing King |
| **Space Shooter Redux** | Bullet/projectile sprites, explosion sprite for Shooter, and background tile |

### itch.io character packs to find

Search itch.io for free cartoon (non-pixel) character packs:
- For Wing Run rider + Wing King player: search **"cartoon platformer character sprite sheet free"** — look for a character with idle/run/jump frames, non-pixel, transparent background
- For Shooter top-down player: search **"top-down shooter character cartoon"** — needs to look good from above. Fallback: use chicken from Animal Pack Redux rotated

### Target filenames (rename downloaded assets to these)

**Snake (`app/public/game-assets/snake/`):**
- `snake-head.png` — chicken head from Animal Pack Redux, facing right
- `snake-body.png` — chicken body segment (or egg shape from Food Kit)
- `wing.png` — chicken wing/drumstick from Food Kit
- `crown.png` — crown sprite from Food Kit or any crown asset
- `bg-tile.png` — a dark checkered or grid tile (use any dark tileable background from Simplified Platformer Pack)

**Wing King (`app/public/game-assets/platformer/`):**
- `player-idle.png` — cartoon character facing right (itch.io pack, single idle frame, or Animal Pack Redux chicken)
- `platform-tile.png` — stone/grass platform tile from Simplified Platformer Pack
- `bg-city.png` — city/sky background from Simplified Platformer Pack
- `enemy-bin.png` — garbage bin / trash can (Food Kit or Racing Pack props)
- `enemy-inspector.png` — suited figure (Animal Pack Redux or any cartoon character)
- `collectible-wing.png` — wing/drumstick from Food Kit

**Wing Run (`app/public/game-assets/wingrun/`):**
- `player-bike.png` — character on scooter/bike (Animal Pack Redux + scooter layered, or itch.io delivery character)
- `bg-road.png` — top-down road tile from City Kit (Roads), tileable
- `enemy-car-1.png` — top-down car from Racing Pack
- `enemy-car-2.png` — different top-down car/truck from Racing Pack
- `building-shop.png` — shop building from City Kit (Commercial)
- `building-house.png` — house building from City Kit (Commercial)

**Shooter (`app/public/game-assets/shooter/`):**
- `player-ship.png` — top-down chicken or cartoon vehicle (Animal Pack Redux top-down, or Racing Pack car recolored gold)
- `bg-tile.png` — dark road/grid tile from City Kit (Roads) or Space Shooter Redux
- `enemy-van-1.png` — top-down enemy car/van from Racing Pack
- `enemy-van-2.png` — different top-down enemy from Racing Pack
- `bullet-sauce.png` — sauce drop / projectile from Food Kit or Space Shooter Redux
- `explosion.png` — explosion sprite from Space Shooter Redux
- `powerup-shield.png` — shield icon from Space Shooter Redux or any clear shield image
- `powerup-rapid.png` — lightning bolt icon from Space Shooter Redux

### Tips
- Kenney assets are transparent PNGs — no background removal needed
- If an asset has multiple frames (spritesheet), extract the single best frame using any image editor (Preview on Mac: select area → copy → new file from clipboard)
- All images can be any size — scale is handled in Phaser code (Task 3–6)
- If you can't find something, use the generator script as fallback: `FAL_KEY=yourkey node scripts/generate-assets.js snake` (or `platformer`, `shooter`, `wingrun`)

- [ ] **Step 1: Download all Kenney packs listed above from kenney.nl/assets**

- [ ] **Step 2: Find and download itch.io character pack(s)**

- [ ] **Step 3: Copy and rename files into the correct game-assets directories per the table above**

- [ ] **Step 4: Verify all target files exist**

```bash
ls app/public/game-assets/snake/
# Must contain: snake-head.png, snake-body.png, wing.png, crown.png, bg-tile.png

ls app/public/game-assets/platformer/
# Must contain: player-idle.png, platform-tile.png, bg-city.png, enemy-bin.png, enemy-inspector.png, collectible-wing.png

ls app/public/game-assets/wingrun/
# Must contain: player-bike.png, bg-road.png, enemy-car-1.png, enemy-car-2.png, building-shop.png, building-house.png

ls app/public/game-assets/shooter/
# Must contain: player-ship.png, bg-tile.png, enemy-van-1.png, enemy-van-2.png, bullet-sauce.png, explosion.png, powerup-shield.png, powerup-rapid.png
```

---

## Task 3: Snake — update assets + verify

**Files:**
- `app/public/game-assets/snake/` — already replaced in Task 2
- `app/public/snake.html` — scale adjustments only if needed

Snake already loads correct SFX (eat, die, start) and uses `loadImgWithTransparentBg` for PNG sprites. No preload code changes needed — just drop in the new PNG files and adjust scale if sprites look too large/small.

- [ ] **Step 1: Start the server and open snake in browser**

```bash
node app/server.js &
open http://localhost:3000/snake
```

Play as guest. Check: do the snake head, body, food, and background look good?

- [ ] **Step 2: Adjust sprite scales if needed**

In `snake.html`, the key scale values are:
- Snake head: `setScale(0.15)` (line ~239)
- Snake body segments: `setScale(0.1)` (line ~241, 348)
- Wing food: `setScale(0.1)` (line ~206)
- Crown: `setScale(0.1)` (line ~207)

If sprites appear too big or small, adjust the scale values. Rule of thumb: a snake segment should be approximately 30×30px on screen (matching `TILE_SIZE = 30`).

- [ ] **Step 3: Verify SFX plays**

- Eat a wing — crunch sound should play
- Hit a wall — die sound should play
- Start a new game — start sound should play

- [ ] **Step 4: Commit**

```bash
git add app/public/game-assets/snake/ app/public/snake.html
git commit -m "feat: replace Snake assets with Kenney cartoon sprites"
git push origin main
```

---

## Task 4: Wing King — fix preload, fix SFX, replace assets

**Files:**
- Modify: `app/public/platformer.html` lines 107–118 (preload) and line 209 (doJump SFX)
- `app/public/game-assets/platformer/` — already replaced in Task 2

Currently Wing King:
- Loads SVGs from `/game-assets/vector/` — needs switching to PNG
- Uses wrong background (`/game-assets/shooter/bg-tile.png`) — needs fixing
- Reuses Wing Run SFX keys — needs own wk- sounds

- [ ] **Step 1: Replace the preload() function in `app/public/platformer.html`**

Replace lines 107–118:
```javascript
  preload() {
    this.load.image('bg', '/game-assets/shooter/bg-tile.png');
    this.load.image('platform', '/game-assets/platformer/platform-tile.png');
    this.load.svg('player', '/game-assets/vector/rooster.svg', { width: 128, height: 128 });
    this.load.svg('bin', '/game-assets/vector/bin.svg', { width: 64, height: 64 });
    this.load.svg('inspector', '/game-assets/vector/inspector.svg', { width: 64, height: 64 });
    this.load.svg('wing', '/game-assets/vector/wing.svg', { width: 64, height: 64 });
    
    // SFX
    this.load.audio('jump', '/sfx/wr-hop.mp3');
    this.load.audio('collect', '/sfx/wr-deliver.mp3');
    this.load.audio('die', '/sfx/wr-crash.mp3');
  }
```

With:
```javascript
  preload() {
    this.load.image('bg', '/game-assets/platformer/bg-city.png');
    this.load.image('platform', '/game-assets/platformer/platform-tile.png');
    this.load.image('player', '/game-assets/platformer/player-idle.png');
    this.load.image('bin', '/game-assets/platformer/enemy-bin.png');
    this.load.image('inspector', '/game-assets/platformer/enemy-inspector.png');
    this.load.image('wing', '/game-assets/platformer/collectible-wing.png');

    this.load.audio('jump', '/sfx/wk-jump.mp3');
    this.load.audio('collect', '/sfx/wk-collect.mp3');
    this.load.audio('die', '/sfx/wk-die.mp3');
  }
```

- [ ] **Step 2: Open Wing King in browser and check sprite sizes**

```bash
open http://localhost:3000/platformer
```

The player sprite is currently rendered at `setScale(0.6)` with a hitbox of `setSize(80, 110).setOffset(24, 18)` — tuned for a 128×128 source image. If the new player PNG is a different size, update the scale so the player appears roughly 60–80px tall on the 400px-high canvas.

Update `setScale()` on line ~134 and `setSize()/setOffset()` on line ~135 to match new sprite dimensions. To calculate: `setSize(spriteWidth * 0.6, spriteHeight * 0.6)` roughly, then tweak offset until hitbox looks right with `debug: true` in the physics config temporarily.

- [ ] **Step 3: Verify SFX plays**

- Jump → should play wk-jump sound (not the Wing Run hop)
- Collect a wing → wk-collect sound
- Hit an obstacle → wk-die sound

- [ ] **Step 4: Commit**

```bash
git add app/public/platformer.html app/public/game-assets/platformer/
git commit -m "feat: replace Wing King assets with Kenney cartoon sprites, fix SFX"
git push origin main
```

---

## Task 5: Wing Run — fix preload, replace assets

**Files:**
- Modify: `app/public/wing-run.html` lines 108–120 (preload)
- `app/public/game-assets/wingrun/` — already replaced in Task 2

Currently Wing Run loads SVGs from the vector folder and uses the shooter's bg-tile as its road.

- [ ] **Step 1: Replace the preload() function in `app/public/wing-run.html`**

Replace lines 108–120:
```javascript
  preload() {
    this.load.image('bg-road', '/game-assets/shooter/bg-tile.png');
    this.load.svg('bike', '/game-assets/vector/scooter.svg', { width: 64, height: 64 });
    this.load.svg('car1', '/game-assets/vector/car.svg', { width: 64, height: 64 });
    this.load.svg('car2', '/game-assets/vector/truck.svg', { width: 64, height: 64 });
    this.load.svg('shop', '/game-assets/vector/shop.svg', { width: 128, height: 128 });
    this.load.svg('house', '/game-assets/vector/house.svg', { width: 128, height: 128 });
    
    // SFX
    this.load.audio('deliver', '/sfx/wr-deliver.mp3');
    this.load.audio('crash', '/sfx/wr-crash.mp3');
    this.load.audio('hop', '/sfx/wr-hop.mp3');
  }
```

With:
```javascript
  preload() {
    this.load.image('bg-road', '/game-assets/wingrun/bg-road.png');
    this.load.image('bike', '/game-assets/wingrun/player-bike.png');
    this.load.image('car1', '/game-assets/wingrun/enemy-car-1.png');
    this.load.image('car2', '/game-assets/wingrun/enemy-car-2.png');
    this.load.image('shop', '/game-assets/wingrun/building-shop.png');
    this.load.image('house', '/game-assets/wingrun/building-house.png');

    this.load.audio('deliver', '/sfx/wr-deliver.mp3');
    this.load.audio('crash', '/sfx/wr-crash.mp3');
    this.load.audio('hop', '/sfx/wr-hop.mp3');
  }
```

- [ ] **Step 2: Open Wing Run in browser and verify sprites render**

```bash
open http://localhost:3000/wing-run.html
```

The player `bike` sprite renders at default scale (1.0) since the SVG previously auto-scaled to 64×64. If the new PNG player-bike is larger, add `.setScale()` on the player sprite line (line ~133):

```javascript
this.player = this.physics.add.sprite(200, 600, 'bike').setCollideWorldBounds(true).setScale(0.25);
```

Adjust scale until the player bike is roughly 60–80px wide. Car sprites on line ~spawnCar similarly need scale if they're large source images.

- [ ] **Step 3: Verify SFX plays**

- Space bar hop → hop sound
- Hit a car → crash sound
- Reach a delivery zone → deliver sound

- [ ] **Step 4: Commit**

```bash
git add app/public/wing-run.html app/public/game-assets/wingrun/
git commit -m "feat: replace Wing Run assets with Kenney cartoon sprites"
git push origin main
```

---

## Task 6: Sauce Shooter — fix preload, add SFX

**Files:**
- Modify: `app/public/shooter.html` preload() (lines 100–109), fireBullet(), hitEnemy(), hitPlayer(), getPowerup(), gameOver()
- `app/public/game-assets/shooter/` — already replaced in Task 2

Currently Shooter loads SVGs and has zero SFX.

- [ ] **Step 1: Replace the preload() function in `app/public/shooter.html`**

Replace lines 100–109:
```javascript
  preload() {
    this.load.image('bg', '/game-assets/shooter/bg-tile.png');
    this.load.svg('player', '/game-assets/vector/ufo.svg', { width: 64, height: 64 });
    this.load.svg('enemy1', '/game-assets/vector/van.svg', { width: 64, height: 64 });
    this.load.svg('enemy2', '/game-assets/vector/truck.svg', { width: 64, height: 64 });
    this.load.svg('bullet', '/game-assets/vector/drop.svg', { width: 24, height: 32 });
    this.load.svg('pu_shield', '/game-assets/vector/shield.svg', { width: 48, height: 48 });
    this.load.svg('pu_rapid', '/game-assets/vector/bolt.svg', { width: 48, height: 48 });
    this.load.svg('explosion', '/game-assets/vector/boom.svg', { width: 64, height: 64 });
  }
```

With:
```javascript
  preload() {
    this.load.image('bg', '/game-assets/shooter/bg-tile.png');
    this.load.image('player', '/game-assets/shooter/player-ship.png');
    this.load.image('enemy1', '/game-assets/shooter/enemy-van-1.png');
    this.load.image('enemy2', '/game-assets/shooter/enemy-van-2.png');
    this.load.image('bullet', '/game-assets/shooter/bullet-sauce.png');
    this.load.image('pu_shield', '/game-assets/shooter/powerup-shield.png');
    this.load.image('pu_rapid', '/game-assets/shooter/powerup-rapid.png');
    this.load.image('explosion', '/game-assets/shooter/explosion.png');

    this.load.audio('shoot', '/sfx/ss-shoot.mp3');
    this.load.audio('boom', '/sfx/ss-explosion.mp3');
    this.load.audio('hit', '/sfx/ss-hit.mp3');
    this.load.audio('powerup', '/sfx/ss-powerup.mp3');
    this.load.audio('gameover', '/sfx/ss-gameover.mp3');
  }
```

- [ ] **Step 2: Add SFX play calls throughout the game**

In `fireBullet()` (line ~212), add at the end of the method:
```javascript
  fireBullet() {
    const b = this.bullets.create(this.player.x, this.player.y - 20, 'bullet');
    if (b) {
      b.setActive(true).setVisible(true).setDepth(5);
      b.body.velocity.y = -600;
      this.sound.play('shoot', { volume: 0.3 });
    }
  }
```

In `hitEnemy()` (line ~228), add after `this.explode()`:
```javascript
  hitEnemy(bullet, enemy) {
    this.explode(enemy.x, enemy.y);
    this.sound.play('boom', { volume: 0.5 });
    bullet.destroy();
    enemy.destroy();
    this.score += 100;
    this.scoreText.setText('SCORE: ' + this.score);
    if (Phaser.Math.Between(1, 40) === 1) this.spawnPowerup(enemy.x, enemy.y);
  }
```

In `getPowerup()` (line ~246), add:
```javascript
  getPowerup(player, pu) {
    const type = pu.getData('type');
    if (type === 'shield') this.shieldActive = 8000;
    else this.rapidFire = 5000;
    this.sound.play('powerup', { volume: 0.5 });
    pu.destroy();
  }
```

In `hitPlayer()` (line ~253), add after the camera shake:
```javascript
    this.cameras.main.shake(200, 0.02);
    this.sound.play('hit', { volume: 0.6 });
```

In `gameOver()` (line ~277), add after `this.physics.pause()`:
```javascript
    this.sound.play('gameover', { volume: 0.7 });
```

- [ ] **Step 3: Open Shooter in browser, check sprites, verify SFX**

```bash
open http://localhost:3000/shooter
```

SVGs previously rendered at fixed pixel sizes (64×64 etc). New PNG sprites use natural pixel dimensions. Add `.setScale()` where needed:
- Player (line ~122): add `.setScale(0.15)` — adjust so player is ~60px wide on the 400px canvas
- Enemies in `spawnEnemy()` (line ~219): add `e.setScale(0.2)` after `e.setDepth(8)`
- Bullets in `fireBullet()`: add `b.setScale(0.1)` after setDepth

Fire — shoot sound. Kill an enemy — boom. Get hit — hit sound. Die — gameover sound.

- [ ] **Step 4: Commit**

```bash
git add app/public/shooter.html app/public/game-assets/shooter/
git commit -m "feat: replace Shooter assets with Kenney cartoon sprites, add SFX"
git push origin main
```

---

## Task 7: Final check + GitHub

- [ ] **Step 1: Play all 4 games back to back, confirm each is playable**

- `/snake` — snake moves, eats food, game over works, SFX plays
- `/platformer` — character jumps, avoids bins/inspectors, collects wings, SFX plays
- `/wing-run.html` — bike moves, cars spawn, delivery zones work, heat bar drains, SFX plays
- `/shooter` — can shoot, enemies explode, power-ups work, lives deplete, SFX plays

- [ ] **Step 2: Confirm all 4 commits are on origin/main**

```bash
git log --oneline origin/main | head -8
```

Expected: 4 feat commits, one each for snake, Wing King, Wing Run, and Shooter.

- [ ] **Step 3: Verify GitHub repo has the updates**

Open https://github.com/maxwelldondacosta-ctrl/charlieswingz and confirm the latest commits appear.
