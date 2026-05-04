# Chicken Shop Manager — Design Spec

**Date:** 2026-05-04
**Status:** Final (merged from Claude + GPT review)

---

## Overview

A persistent, level-based Diner Dash-style browser game set inside Charlie's Wingz. Players manage a chicken shop — routing customers through stations, hitting cash targets, and keeping service times down. The game is freemium: lives are limited, credits can be purchased to skip levels or refill lives early.

---

## 1. Core Gameplay Loop

### Flow

1. Customer enters shop → joins lobby queue
2. Player taps/clicks customer → assigns them to the first required station queue
3. Player routes order through stations in sequence, completing a minigame at each
4. Completed order arrives at Till → customer pays → cash added to level total
5. Hit cash target before time runs out → level complete
6. Miss target → lose a life → retry or wait

### Failure Conditions

- A level fails only when the timer expires and cash earned is below the target
- Customer walkouts reduce earning potential but do not instantly fail the level
- A failed station minigame applies a defined penalty — it never silently deletes progress

### Lives

- 3 lives max
- Failing a level costs 1 life
- At 0 lives: 2-hour real-time wait before lives refill (timer shown in-game)
- Refill timer starts only when lives hit 0
- Spend **20 credits** to refill immediately

### Credits

- Purchased on the main site: **£1 = 100 credits**
- **10 credits** to skip a level
- **20 credits** to refill all 3 lives instantly

---

## 2. Order Model

### Order Contents

Each customer order contains:

- `wingsBase`: always present
- `sauce`: present once Sauce station unlocks
- `side`: present once Sides station unlocks
- `drink`: present once Drinks station unlocks
- `boxed`: required once Boxing station unlocks

One customer = one order. No multi-meal orders in v1.

### Order Value (additive)

| Component | Value |
|-----------|-------|
| Wings base | £8 |
| Sauce add-on | £2 |
| Sides add-on | £3 |
| Drinks add-on | £2 |
| Boxing completion bonus | £1 |
| Till | closes sale (no additional value) |

### Average Order Value by Tier

| Tier | Stations Active | Order Value |
|------|-----------------|-------------|
| 1 | Fryer + Till | £8 |
| 2 | + Sauce | £10 |
| 3 | + Sides | £13 |
| 4 | + Drinks | £15 |
| 5 | + Boxing | £16 |
| 6 | Full shop | £16 |

### TypeScript Types

```ts
type CurrencyPence = number

type StationKey =
  | 'fryer'
  | 'sauce'
  | 'sides'
  | 'drinks'
  | 'boxing'
  | 'till'

type OrderState =
  | 'waitingInLobby'
  | 'queuedAtStation'
  | 'activeAtStation'
  | 'readyForNextStation'
  | 'completed'
  | 'walkedOut'
  | 'voided'

type Order = {
  id: string
  customerId: string
  level: number
  createdAtMs: number
  requiredStations: StationKey[]
  currentStationIndex: number
  state: OrderState
  currentStation: StationKey | null
  payoutBasePence: CurrencyPence
  payoutModifiersPence: CurrencyPence
  patienceMaxMs: number
  patienceRemainingMs: number
  qualityFlags: {
    fryerSalvaged: boolean
    fryerRemade: boolean
    wrongSauce: boolean
    wrongSide: boolean
    drinkMinorMiss: boolean
    drinkMajorMiss: boolean
    boxingFailed: boolean
  }
}

type Customer = {
  id: string
  spawnedAtMs: number
  orderId: string
  mood: 'calm' | 'waiting' | 'angry'
}
```

---

## 3. Station Routing and Queue Model

### Routing Order

```
Fryer → Sauce → Sides → Drinks → Boxing → Till
```

Only unlocked stations appear in the route for a given level tier.

### Queue Topology

Each station has three slots:

| Slot | Capacity | Rule |
|------|----------|------|
| Input queue | 3 orders | FIFO |
| Active order | 1 order | minigame runs here |
| Output buffer | 1 order | holds completed order until player taps to release |

A station cannot pull from its queue while its output buffer is occupied. A blocked output buffer blocks throughput at that station — the player manages this deliberately.

```ts
type StationRuntime = {
  key: StationKey
  queue: string[]             // order IDs, max 3
  activeOrderId: string | null
  outputBufferOrderId: string | null
  busyUntilMs: number | null
  interactionState: 'idle' | 'waitingForInput' | 'resolving' | 'blocked'
}
```

### State Transitions

```
waitingInLobby       → queuedAtStation
queuedAtStation      → activeAtStation
activeAtStation      → readyForNextStation
activeAtStation      → activeAtStation        (retry after major fail)
readyForNextStation  → queuedAtStation        (next station accepts)
readyForNextStation  → completed              (till closes sale)
any non-terminal     → walkedOut
walkedOut            → voided
```

### Routing Rules

1. Player accepts a customer → order moves to first station's input queue
2. Station pulls from queue when active slot is free
3. On station success → order moves to that station's output buffer
4. Player taps output buffer → order moves to next station's input queue
5. If next station queue is full → order stays in current output buffer, blocking that station
6. Player cannot skip a required station or reorder a station queue in v1

### Queue Limits

- Lobby: unlimited simulation, 6 visible on screen
- Station input queue: max 3
- Output buffer: max 1
- Total simulated non-terminal orders: max 12

### Player Input Model

Two decisions at all times:
- Which lobby customer to accept next
- When to release a buffered order to the next station

No drag-and-drop free routing in v1.

---

## 4. Station Minigames

### Fryer

Tap to stop a moving timer needle inside the green window.

| Result | Condition | Penalty |
|--------|-----------|---------|
| Perfect | Needle in center 35% of window | None |
| Salvage | Needle in outer 65% of window | −£2 |
| Burnt | Needle outside window | Remake required: +4s, patience −15% |

Timings: preheat 0.4s, active window 1.2s.

### Sauce

Choose the correct sauce from 3 options within the time limit.

| Result | Condition | Penalty |
|--------|-----------|---------|
| Correct | Right choice | None |
| Wrong | Wrong choice | Auto-correct after 1.5s, −£1 |
| Timeout | No choice in 3.5s | Treated as wrong choice |

### Sides

Choose the correct side from 3 options within the time limit.

| Result | Condition | Penalty |
|--------|-----------|---------|
| Correct | Right choice | None |
| Wrong | Wrong choice | Auto-correct after 1.5s, −£1 |
| Timeout | No choice in 3.0s | Treated as wrong choice |

### Drinks

Hold to fill — release when the fill bar is in the target band.

| Result | Fill Level | Penalty |
|--------|-----------|---------|
| Perfect | 45%–60% | None |
| Minor miss | 35%–44% or 61%–72% | −£1 |
| Major miss | <35% or >72% | Redo pour: +2s |

Full hold to overflow takes 2.0s.

### Boxing

Tap 6 times within 1.8s to seal the box.

| Result | Condition | Penalty |
|--------|-----------|---------|
| Success | 6 taps in time | Earn boxing £1 bonus |
| Fail | Fewer than 6 taps | −£1, +1s |

Partial progress does not carry over after a fail.

### Till

No minigame. Order is cashed out immediately on arrival.

### Payout Calculation

```ts
finalPayoutPence = Math.max(0, payoutBasePence + payoutModifiersPence)
```

| Event | Modifier |
|-------|----------|
| Fryer salvage miss | −200p |
| Wrong sauce | −100p |
| Wrong side | −100p |
| Drink minor miss | −100p |
| Drink major miss | 0p (adds retry time) |
| Boxing fail | −100p |
| VIP customer complete | +400p |
| Clean run level bonus | +500p (level-end, not per-order) |

### Walkout Rule

If patience reaches zero before reaching Till:
- Customer leaves
- Order becomes Voided
- No cash awarded
- Order removed from all station slots within the same tick

### Visual Feedback

- Green flash: perfect result
- Yellow flash: recoverable penalty
- Red flash: burnout, walkout, major miss
- Floating currency delta on every completed order
- Queue-full icon when a station cannot accept a buffered order

---

## 5. Economy Math and Level Targets

### Target Formula

```
cashTarget = floor(expectedCompletedOrders × averageOrderValue × pressureMultiplier)
```

- `expectedCompletedOrders`: typical successful-player throughput for the level
- `averageOrderValue`: tier order value from Section 2
- `pressureMultiplier`: 0.82–0.92 for normal levels (player does not need a perfect run)

### Level Duration

| Levels | Duration |
|--------|----------|
| 1–20 | 90s |
| 21–60 | 100s |
| 61–100 | 110s |

### Expected Throughput by Tier

| Tier | Expected Completed Orders |
|------|--------------------------|
| 1 | 12–18 |
| 2 | 14–20 |
| 3 | 16–22 |
| 4 | 18–25 |
| 5 | 20–28 |
| 6 | 22–30 |

### Average Order Completion Time (perfect run)

| Tier | Avg Time |
|------|----------|
| 1 | 5.8s |
| 2 | 6.2s |
| 3 | 6.9s |
| 4 | 7.5s |
| 5 | 7.9s |
| 6 | 8.2s |

### Throughput Guardrail

```
cashTarget < (levelDurationMs / avgCompletionMs) × orderValue × 0.95
```

No level may require near-perfect execution to clear.

### Cash Target Bands

| Level Range | Normal Target | Boss Target |
|-------------|---------------|-------------|
| 1–10 | £90–£135 | £140–£155 |
| 11–20 | £120–£175 | £180–£195 |
| 21–30 | £165–£230 | £235–£255 |
| 31–40 | £205–£290 | £295–£320 |
| 41–50 | £245–£350 | £355–£385 |
| 51–60 | £285–£395 | £400–£435 |
| 61–70 | £305–£420 | £425–£460 |
| 71–80 | £325–£445 | £450–£485 |
| 81–90 | £345–£470 | £475–£515 |
| 91–100 | £365–£500 | £505–£550 |

### Worked Examples

- **Level 1**: 14 orders × £8 × 0.84 = **£94**
- **Level 25**: 18 orders × £13 × 0.88 = **£205**
- **Level 60**: 27 orders × £16 × 0.90 = **£388**
- **Level 100**: 34 orders × £16 × 0.96 = **£522** (boss: near-perfect explicitly required)

### Boss Level Rule

Boss levels: 9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 59, 60, 70, 80, 90, 100.

Boss levels raise difficulty by ~10–15% through tighter patience and denser spawns, not impossible targets. The spike should feel like a boss, not a paywall.

### Monetization Guardrail

No level may require:
- More than 95% of theoretical perfect throughput
- A paid skip to feel reasonable

If playtests show a level requiring near-perfect execution on a non-boss level, lower the target or relax spawns.

---

## 6. Level Structure — 100 Levels

### Tier Unlock Table

| Tier | Levels | Stations Active | Route |
|------|--------|-----------------|-------|
| 1 | 1–10 | Fryer, Till | Fryer → Till |
| 2 | 11–20 | + Sauce | Fryer → Sauce → Till |
| 3 | 21–30 | + Sides | Fryer → Sauce → Sides → Till |
| 4 | 31–40 | + Drinks | Fryer → Sauce → Sides → Drinks → Till |
| 5 | 41–50 | + Boxing | Fryer → Sauce → Sides → Drinks → Boxing → Till |
| 6 | 51–100 | Full shop | Full route, escalating pressure |

### Difficulty Arc

Within each tier:
- Levels X1–X8: gradual ramp
- Levels X9–X0 (boss): patience −12%, spawn interval −10–14%, target +10–15%
- New tier opens: calmer baseline than the boss you just passed, then ramps again

### Endgame Modifiers (Levels 61–100)

All 6 stations active. No new station unlocks. One light modifier per level keeps them fresh:

| Modifier | Effect |
|----------|--------|
| `rushMinute` | Spawn rate spikes for 15s mid-level |
| `vipCustomer` | One VIP worth +£4, lower patience |
| `fryerWobble` | Green timing window shrinks for 20s |
| `cleanRunBonus` | +£5 if zero walkouts in the level |
| `none` | No modifier |

### Level Progression Rules

- Player may enter any level from 1 through `unlockedLevel`
- First clear of `unlockedLevel` → unlocks `unlockedLevel + 1`
- Replaying older levels does not unlock further levels
- Level 100 remains replayable after clear

### Star Rating (local-only, no gameplay impact)

- 3 stars: clear with 0 walkouts
- 2 stars: clear with 1–2 walkouts
- 1 star: clear with 3+ walkouts

### Level Config Schema

```ts
type LevelModifier = 'none' | 'rushMinute' | 'vipCustomer' | 'fryerWobble' | 'cleanRunBonus'

type LevelConfig = {
  level: number
  tier: 1 | 2 | 3 | 4 | 5 | 6
  durationMs: number
  cashTargetPence: CurrencyPence
  activeStations: StationKey[]
  patienceBaseMs: number
  spawnIntervalMinMs: number
  spawnIntervalMaxMs: number
  boss: boolean
  modifier: LevelModifier
}
```

### Example Configs

```ts
export const level1: LevelConfig = {
  level: 1, tier: 1,
  durationMs: 90_000,
  cashTargetPence: 9_400,
  activeStations: ['fryer', 'till'],
  patienceBaseMs: 45_000,
  spawnIntervalMinMs: 5_600,
  spawnIntervalMaxMs: 6_000,
  boss: false,
  modifier: 'none',
}

export const level25: LevelConfig = {
  level: 25, tier: 3,
  durationMs: 100_000,
  cashTargetPence: 20_500,
  activeStations: ['fryer', 'sauce', 'sides', 'till'],
  patienceBaseMs: 39_000,
  spawnIntervalMinMs: 4_700,
  spawnIntervalMaxMs: 5_000,
  boss: false,
  modifier: 'none',
}

export const level100: LevelConfig = {
  level: 100, tier: 6,
  durationMs: 110_000,
  cashTargetPence: 52_200,
  activeStations: ['fryer', 'sauce', 'sides', 'drinks', 'boxing', 'till'],
  patienceBaseMs: 28_000,
  spawnIntervalMinMs: 3_400,
  spawnIntervalMaxMs: 3_800,
  boss: true,
  modifier: 'vipCustomer',
}
```

---

## 7. Patience and Spawn Rules

### Patience by Tier

| Tier | Base Patience |
|------|---------------|
| 1 | 45s |
| 2 | 42s |
| 3 | 39s |
| 4 | 36s |
| 5 | 34s |
| 6 | 32s |

### Patience Drain Rates

| Order state | Drain rate |
|-------------|-----------|
| Active at station | 0.85× |
| Blocked in output buffer | 1.15× |
| Waiting in lobby (angry) | 1.25× |

### Spawn Intervals by Tier

| Tier | Interval |
|------|----------|
| 1 | 5.5–6.0s |
| 2 | 5.0–5.5s |
| 3 | 4.6–5.0s |
| 4 | 4.2–4.7s |
| 5 | 3.9–4.4s |
| 6 | 3.7–4.2s |

Randomize each spawn ±0.4s so levels don't feel robotic.

### Spawn Composition Rules

- 2.5s grace period before first spawn
- Before level 20: max 2 customers within any 2s window
- Level 21+: burst pairs allowed at most once every 18s
- Never spawn if total non-terminal orders exceed 12

---

## 8. Tech Architecture

### Project Structure

Standalone Vite app at `app/games/chicken-shop/`, mounted as a Next.js page at `/games/chicken-shop`. Same domain as the main site — no CORS, no iframe, shared `cw_session` cookie.

```
app/games/chicken-shop/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── store/
│   │   ├── metaStore.ts       # unlockedLevel, credits, lives, livesRefillAt
│   │   └── runStore.ts        # currentLevel, timerRemaining, cashEarned, activeOrders
│   ├── game/
│   │   ├── PixiApp.ts         # Pixi Application init, resize
│   │   ├── GameScene.ts       # Main loop, tick contract, spawning
│   │   ├── Order.ts           # Order state machine
│   │   ├── Customer.ts        # Customer class, patience timer
│   │   ├── Station.ts         # Station queue/buffer/minigame logic
│   │   ├── levelConfig.ts     # All 100 LevelConfig entries
│   │   └── textures.ts        # All Pixi.Graphics texture generation (no external PNGs)
│   ├── ui/
│   │   ├── MainMenu.tsx
│   │   ├── HUD.tsx
│   │   ├── LevelResult.tsx
│   │   ├── Shop.tsx
│   │   └── LivesEmpty.tsx
│   └── api/
│       ├── auth.ts            # cw_session read, boot guard
│       └── progression.ts     # all /api/games/chicken-shop/* calls
├── index.html
└── vite.config.ts
```

### Rendering Split

- **PixiJS v8**: all game rendering — stations, customers, patience bars, minigame interactions, canvas
- **React**: all non-game UI — menus, HUD overlay, modals, shop
- **Zustand**: two stores as bridge (metaStore + runStore)
- React never mutates Pixi entities directly
- Pixi never calls fetch directly — network mutations pass through `api/progression.ts`

### 60fps Tick Contract

Each tick must:
1. Advance global level timer
2. Spawn customer if spawn clock elapsed
3. Tick patience for all non-terminal orders
4. Tick station interaction states
5. Resolve completed interactions into queue/buffer transitions
6. Resolve walkouts
7. Resolve payouts reaching Till
8. Check end-of-level conditions

### End-of-Level Rules

- **Success**: triggers immediately when `cashEarned >= cashTarget`, even if time remains
- **Fail**: triggers when timer hits 0 and `cashEarned < cashTarget`
- Once result modal begins, no further station input is accepted
- Remaining customers freeze visually during success transition

---

## 9. Auth and Save State

### Auth

Read `cw_session` from the site's session cookie on app load. If no valid session, redirect to main site login. No auth logic inside the game. Next.js route guard handles this before the game shell mounts.

### Save State Shape

```ts
type ChickenShopProgress = {
  game: 'chicken-shop'
  unlockedLevel: number
  credits: number
  lives: number
  livesRefillAt: number | null   // Unix ms timestamp, null if lives are full
  updatedAt: number
  version: number
}
```

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/games/chicken-shop/progress` | Load save state |
| POST | `/api/games/chicken-shop/complete-level` | Record win, advance unlock |
| POST | `/api/games/chicken-shop/fail-level` | Record loss, decrement life |
| POST | `/api/games/chicken-shop/refill-lives` | Spend 20 credits, set lives to 3 |
| POST | `/api/games/chicken-shop/skip-level` | Spend 10 credits, advance unlock |

### Mutation Rules

- `complete-level`: increments `unlockedLevel` if current level was highest unlocked; idempotent by `(userId, level, runId)`
- `fail-level`: decrements 1 life; idempotent by `runId`
- `refill-lives`: spends 20 credits atomically, sets lives to 3
- `skip-level`: spends 10 credits atomically, advances unlock by 1
- All mutations reject requests for locked levels
- Server is authoritative for credits, lives, and unlockedLevel — client never submits deltas directly

### Error Codes

- `401 UNAUTHENTICATED`
- `403 LEVEL_LOCKED`
- `409 VERSION_CONFLICT`
- `409 ALREADY_PROCESSED`
- `422 INVALID_LEVEL_RESULT`
- `429 RATE_LIMITED`

### Every mutation response returns the full authoritative `ChickenShopProgress` including `version`.

Client rules:
1. Show loading state optimistically — never optimistically mutate credits or lives
2. Replace local cache with server response
3. Reject responses whose `version` is lower than current local version

### Local Cache

- Key: `cw:games:chicken-shop:progress`
- Cache only successful server responses
- Cache must include `version` and `updatedAt`
- Overwritten only by server responses with `version >= localVersion`

### Client Boot Flow

1. Next.js route guard checks session
2. React shell mounts
3. Fetch `/progress`
4. Show branded loading state while waiting
5. On success: hydrate `metaStore`
6. On failure with cache: boot in degraded mode
7. On failure without cache: block entry, show retry CTA

### Offline Rules

- Menu boots from cached progress if API unreachable
- Paid actions (skip, refill) blocked while offline
- Level launch blocked if lives are 0 and cannot be validated

### Security

- Client never submits credit deltas
- Server derives balances from persisted state + validated actions
- All mutation endpoints rate-limited per authenticated user
- CSRF protection consistent with the main site

---

## 10. UI and UX

### Screens

- Main Menu
- Level Select
- In-Game (Pixi canvas + React HUD overlay)
- Pause Modal
- Level Success Modal
- Level Fail Modal
- Lives Empty Modal
- Shop Overlay

### Main Menu

- Shows lives, refill timer (if applicable), credits, highest unlocked level
- Primary CTA: `Play`
- Secondary CTA: `Shop`
- If lives are 0: replace `Play` with `Refill Lives` + countdown timer

### Level Select

- Shows levels 1 through `unlockedLevel`
- Locked levels visible but disabled
- Boss levels have a distinct badge
- Completed levels show local star rating

### In-Game HUD (React overlay on Pixi canvas)

- Top-left: level number + timer
- Top-center: progress bar (`cashEarned / cashTarget`)
- Top-right: lives + credits
- Bottom: active station hint text during a minigame

### Result Modals

**Success:**
- Cash target reached ✓
- Cash earned
- Walkout count
- Stars
- CTAs: `Next Level`, `Replay`

**Fail:**
- Shortfall amount
- Life lost
- If lives remain: `Retry`
- If no lives: `Refill Lives`
- Optional: `Skip Level` (if player has ≥10 credits)

### Input

- Desktop: mouse click
- Mobile web: tap
- No hover-only interactions
- All time-critical inputs: minimum 44px hit area

### Accessibility Baseline

- Color is never the only signal for success/failure (add shape/icon changes)
- Patience bars include icon state changes
- HUD numeric state meets readable contrast
- Reduced-motion mode disables non-essential screen shake and flashes

---

## 11. Analytics

Track for every level attempt:

```ts
type LevelAnalyticsPayload = {
  level: number
  tier: number
  boss: boolean
  modifier: string
  cashTargetPence: number
  cashEarnedPence: number
  completedOrders: number
  walkouts: number
  penaltiesByStation: Record<string, number>
  runDurationMs: number
}
```

### Event Names

- `chicken_shop_level_started`
- `chicken_shop_level_completed`
- `chicken_shop_level_failed`
- `chicken_shop_customer_walked_out`
- `chicken_shop_station_penalty`
- `chicken_shop_skip_used`
- `chicken_shop_refill_used`

Analytics are required for post-launch tuning of targets and station pressure.

---

## 12. Acceptance Criteria

### Functional

- A spawned customer always receives exactly one order
- Orders always follow the configured station sequence
- A station never holds more than 1 active order, 3 queued, and 1 buffered order
- A walkout removes that order from every station container within one tick
- A completed order payout is never below £0
- A failed level costs exactly 1 life
- A successful level costs 0 lives
- Refill lives: always sets lives to 3, charges exactly 20 credits
- Skip level: always advances unlock by 1, charges exactly 10 credits

### Economy

- Target generation for all 100 levels must satisfy the throughput guardrail
- No non-boss level requires more than 90% of median playtest throughput
- No boss level requires more than 95%

### Save Consistency

- Same `runId` submitted twice must not double-consume lives or credits
- Stale mutation responses must not overwrite newer local progress
- Valid session with no local cache must still hydrate correctly

### Performance

- 55fps+ on mid-range mobile during a busy tier 6 level
- Max 8 visible customers simultaneously
- Max 12 total simulated non-terminal orders

---

## 13. Freemium Summary

| Action | Cost |
|--------|------|
| Buy credits | £1 = 100 credits |
| Skip a level | 10 credits |
| Refill 3 lives now | 20 credits |
| Wait for lives to refill | Free (2-hour timer) |
| Retry a failed level | Free (costs 1 life) |

Completed levels do not award credits. No in-game credit farming in v1.

---

## 14. Out of Scope (v1)

- Multiplayer / leaderboards
- Cosmetic unlocks
- Story mode / narrative
- Native mobile app
- Resume from mid-level saved state
- Real-money purchase flow inside the game
- Complex combo systems

---

## 15. Implementation Priority (if scope cut needed)

1. Order state machine and station queue model
2. Server-authoritative lives and credits
3. Clear station penalties with correct payout math
4. Level config data with tuned targets
5. Analytics hooks
6. Endgame modifiers (levels 61–100)

Do not cut queue precision or save consistency — these are the highest-risk areas for monetization bugs.

### Recommended Build Order

1. Define `LevelConfig`, `Order`, `StationRuntime` types
2. Implement queue/state machine in headless unit tests first
3. Build Pixi rendering on top of the tested state machine
4. Add station minigames one by one in unlock order (fryer first)
5. Integrate authoritative progression API endpoints
6. Add analytics hooks
7. Tune cash targets after internal playtests
