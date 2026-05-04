# Chicken Shop Manager — Design Spec

**Date:** 2026-05-04
**Status:** Approved

---

## Overview

A persistent, level-based Diner Dash-style browser game set inside Charlie's Wingz. Players manage a chicken shop — routing customers through stations, hitting cash targets, and keeping service times down. The game is freemium: lives are limited, credits can be purchased to skip levels or refill lives early.

---

## 1. Core Gameplay Loop

### Flow

1. Customer enters shop → joins queue at the front counter
2. Player taps/clicks customer → assigns them to first available station
3. Player routes order through required stations in sequence
4. Completed order reaches the till → customer pays → cash added to level total
5. Hit the cash target before time runs out → level complete
6. Miss the target → lose a life → retry or wait

### Customer Patience

Each customer has a visible patience meter. If not served within their patience window, they walk out — no cash, patience meter gone red. Patience decreases faster at higher levels.

### Lives

- 3 lives per player
- Losing a level costs 1 life
- At 0 lives: 2-hour real-time wait before lives refill (timer shown in-game)
- Alternative: spend **20 credits** to refill lives immediately

### Credits

- Purchased on the site: **£1 = 100 credits**
- **10 credits** to skip a level
- **20 credits** to refill all 3 lives instantly
- Balance stored in save state, displayed in the game's top bar

---

## 2. Station Routing

Orders must visit stations in a fixed sequence depending on which stations are active for the current level tier. The full routing order is:

```
Fryer → Sauce → Sides → Drinks → Boxing → Till
```

A station is only in the route if it has been unlocked for the current tier. Example: at level 15, the route is Fryer → Sauce → Till (Sides not yet unlocked).

### Stations

| Station | Role |
|---------|------|
| **Fryer** | Cooks the wings. Has a cook timer — player must pull the basket at the right time or wings burn. |
| **Sauce** | Player picks a sauce from a short menu matching the customer's order. |
| **Sides** | Player selects a side (chips, coleslaw, corn). |
| **Drinks** | Player pours the correct drink — a fill-to-line minigame. |
| **Boxing** | Player packs the box — a quick tap-to-seal interaction. |
| **Till** | Final station. Calculates total, customer pays, cash added to level pot. |

Each station supports 1 active order at a time (no stacking). A second customer must wait if the station is busy.

---

## 3. Level Structure — 100 Levels

### Tiers 1–6: Station Unlocks (Levels 1–60)

Each tier introduces one new station and runs for 10 levels. Difficulty ramps within each tier — levels 9–10, 19–20, 29–30, etc. are "boss" levels with aggressive customer volume and tight patience windows.

| Tier | Levels | Stations Active | Active Route |
|------|--------|-----------------|--------------|
| 1 | 1–10 | Fryer + Till | Fryer → Till |
| 2 | 11–20 | + Sauce | Fryer → Sauce → Till |
| 3 | 21–30 | + Sides | Fryer → Sauce → Sides → Till |
| 4 | 31–40 | + Drinks | Fryer → Sauce → Sides → Drinks → Till |
| 5 | 41–50 | + Boxing | Fryer → Sauce → Sides → Drinks → Boxing → Till |
| 6 | 51–60 | Full shop | Fryer → Sauce → Sides → Drinks → Boxing → Till |

### Boss Level Feel

At levels 9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 59, 60 — customer spawn rate spikes, patience windows shrink, and the cash target is ~40% higher than the preceding level. After passing a boss level, the next tier opens with a new baseline that feels hard but noticeably calmer than the boss — then ramps again.

### Endgame: Escalating Targets (Levels 61–100)

All 6 stations are active. No new mechanics. The only escalation is the cash target — it increases with each level. Boss spikes still occur every 10 levels (70, 80, 90, 100). Level 100 is the hardest target in the game.

### Cash Target Curve (approximate)

| Level range | Target | Feel |
|-------------|--------|------|
| 1–10 | £80–£200 | Tutorial pace |
| 11–20 | £220–£420 | Learning routing |
| 21–30 | £450–£700 | Juggling 3 stations |
| 31–40 | £750–£1,100 | 4 concurrent queues |
| 41–50 | £1,150–£1,700 | Full kitchen pressure |
| 51–60 | £1,800–£2,800 | Speed plateau |
| 61–70 | £3,000–£5,000 | Endgame grind begins |
| 71–80 | £5,500–£9,000 | High-stakes |
| 81–90 | £10,000–£18,000 | Elite tier |
| 91–100 | £20,000–£50,000 | Prestige wall |

Exact values tuned during playtesting — the curve should feel punishing at boss levels but beatable with good routing.

---

## 4. Tech Architecture

### Project Structure

Standalone Vite app at `app/games/chicken-shop/`. Not embedded in the existing Next.js pages — mounted as a Next.js page at `/games/chicken-shop` which renders the React shell. Keeps game code isolated and independently deployable.

```
app/games/chicken-shop/
├── src/
│   ├── main.tsx              # Vite entry, mounts React root
│   ├── App.tsx               # React shell: routes between Menu / Game / Shop
│   ├── store/
│   │   └── gameStore.ts      # Zustand store: level, lives, credits, saveState
│   ├── game/
│   │   ├── PixiApp.ts        # Pixi Application init, resize handling
│   │   ├── GameScene.ts      # Main game loop, customer spawning, tick logic
│   │   ├── Station.ts        # Station class: queue, active order, minigame trigger
│   │   ├── Customer.ts       # Customer class: patience timer, order data, visuals
│   │   ├── levels.ts         # Level config: cash target, spawn rate, patience by level
│   │   └── textures.ts       # All Pixi.Graphics texture generation (no external PNGs)
│   ├── ui/
│   │   ├── MainMenu.tsx      # Level select, credit balance, lives display
│   │   ├── HUD.tsx           # In-game React overlay: cash, timer, lives, credits
│   │   ├── LevelComplete.tsx # End screen: cash earned, next level CTA, skip option
│   │   ├── Shop.tsx          # Buy credits / refill lives
│   │   └── LivesEmpty.tsx    # 2-hour wait timer, buy lives CTA
│   └── api/
│       └── saveState.ts      # read/write cw_session auth + /api/game/save calls
├── index.html
└── vite.config.ts
```

### Rendering Split

- **PixiJS v8** handles all game rendering: station graphics, customer sprites, patience bars, order indicators, animations, the game canvas itself.
- **React** renders all non-game UI: menus, HUD overlay, modals, the shop. React never touches the Pixi canvas.
- **Zustand** is the bridge: Pixi reads level config and writes score to the store; React reads the store to render HUD and modals.

### Game Loop

Single Pixi `Application` ticker running at 60fps:
1. Spawn customers on a timer derived from `levels.ts` config for the current level
2. Each customer's patience countdown ticks
3. Player input (click/tap) routes customers to stations
4. Stations process orders, trigger minigames, pass to next station
5. Till fires `onOrderComplete(cash)` → Zustand store updates running total
6. Every tick: check if time limit reached → level pass/fail

---

## 5. Integration with Existing Site

### Auth

On app load, read `cw_session` from localStorage (JSON: `{ token, user }`). If missing, redirect to the main site login page — no game rendered. No new auth flow, same key as all other CW games.

### Save State Shape

```ts
{
  game: 'chicken-shop',
  level: number,          // highest level reached
  credits: number,        // current credit balance
  lives: number,          // 0–3
  livesRefillAt: number | null  // Unix timestamp when lives refill (null if full)
}
```

### Persistence Strategy

1. On level complete / lives change / credit purchase → write to localStorage immediately
2. Then POST to `/api/game/save` with the save state shape above (fire-and-forget, no blocking)
3. On app load → GET `/api/game/save?game=chicken-shop` first; fall back to localStorage if API unreachable
4. API response wins over localStorage (server is source of truth)

### Credits Purchases

Credit purchases are handled by the main site's payment flow — the game reads the `credits` balance from the save state only. No payment logic inside the game.

### Routing

The Vite build output gets served as a static bundle. The Next.js page at `/games/chicken-shop` renders an iframe or directly mounts the bundle — same domain, same `cw_session` cookie, no CORS issues.

---

## 6. Freemium Model Summary

| Action | Cost |
|--------|------|
| Buy credits | £1 = 100 credits |
| Skip a level | 10 credits |
| Refill 3 lives now | 20 credits |
| Wait for lives to refill | Free (2-hour timer) |
| Retry a failed level | Free (costs 1 life) |

---

## 7. Out of Scope (v1)

- Multiplayer / leaderboards
- Cosmetic unlocks (uniforms, shop decorations)
- Story mode / narrative
- Mobile app (web-first, touch-friendly but no native app)
- Sound design (placeholder only in v1, SFX pass in v2)
