# Chicken Shop Manager — Revised Implementation Spec

**Date:** 2026-05-04
**Status:** Draft Revision
**Replaces:** Precision gaps in `2026-05-04-chicken-shop-game-design.md`

---

## Overview

Chicken Shop Manager is a level-based browser game set inside Charlie's Wingz. The player manages a rush of customers by moving each order through a fixed set of prep stations before the level timer expires. The design goal is readable arcade pressure, not realistic kitchen simulation.

This revision fixes four areas that were previously underspecified:

1. Economy math and target scaling
2. Station and queue state rules
3. Minigame fail states and penalties
4. Save/auth consistency for monetized state

---

## 1. Core Loop

### Player Objective

Complete enough valid orders before the level timer ends to hit the level cash target.

### Moment-to-Moment Loop

1. Customer enters the lobby queue
2. Player selects the customer to accept their order
3. The order is placed into the first required station queue
4. Player completes each station interaction in order
5. Finished order reaches Till
6. Customer pays based on order value and quality outcome
7. Level ends on success or timer expiry

### Failure Conditions

- A level fails only when the timer expires and the player has not reached the cash target
- Customer walkouts reduce earning potential but do not instantly fail the level
- A failed station interaction never deletes progress silently; it applies a defined penalty

### Lives

- Players have `3` max lives
- Failing a level consumes `1` life
- Lives refill to `3` exactly `2 hours` after the player reaches `0`
- Refill timer only starts when lives hit `0`
- Players may spend `20 credits` to refill to `3` immediately

### Credits

- Credits are purchased outside the game
- Exchange rate: `100 credits = £1`
- Skip current unlocked level: `10 credits`
- Instant full life refill: `20 credits`

### Session Shape Definitions

```ts
type LevelResult = 'success' | 'fail'

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
```

---

## 2. Order Model

### Order Contents

Each customer order contains:

- `wingsBase`: always present
- `sauce`: present once Sauce unlocks
- `side`: present once Sides unlocks
- `drink`: present once Drinks unlocks
- `boxed`: required once Boxing unlocks

There are no multi-meal or bulk orders in v1. One customer equals one order.

### Data Model

```ts
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
  displayName: string
  spawnedAtMs: number
  orderId: string
  mood: 'calm' | 'waiting' | 'angry'
}
```

### Order Value

Use a fixed additive value model so targets can be tuned mathematically.

| Component | Value |
|----------|-------|
| Wings base | £8 |
| Sauce add-on | £2 |
| Side add-on | £3 |
| Drink add-on | £2 |
| Boxing completion bonus | £1 |

### Resulting Average Order Values by Tier

| Tier | Active Stations | Order Value |
|------|-----------------|-------------|
| 1 | Fryer + Till | £8 |
| 2 | + Sauce | £10 |
| 3 | + Sides | £13 |
| 4 | + Drinks | £15 |
| 5 | + Boxing | £16 |
| 6 | Full shop | £16 |

`Till` does not add value directly; it closes the sale.

---

## 3. Economy Math and Level Targets

### Design Principle

Targets must be derived from expected throughput, not picked arbitrarily.

Use this formula:

`cashTarget = floor(expectedCompletedOrders * averageOrderValue * targetPressureMultiplier)`

Where:

- `expectedCompletedOrders` is what an average successful player can finish in the level
- `averageOrderValue` is the tier order value from the table above
- `targetPressureMultiplier` is between `0.82` and `0.92`

That multiplier ensures the player does not need a perfect run to clear a normal level.

### Base Level Duration

- Levels `1-20`: `90 seconds`
- Levels `21-60`: `100 seconds`
- Levels `61-100`: `110 seconds`

The game gets harder by routing complexity, spawn pressure, and patience pressure. The timer should not be the only source of difficulty.

### Expected Completion Throughput

| Tier | Expected Completed Orders |
|------|---------------------------|
| 1 | 12-18 |
| 2 | 14-20 |
| 3 | 16-22 |
| 4 | 18-25 |
| 5 | 20-28 |
| 6 | 22-30 |

### Recommended Cash Target Bands

These numbers match the formula above and replace the previous steep, grind-heavy curve.

| Level Range | Typical Target Band | Boss Target Band |
|-------------|---------------------|------------------|
| 1-10 | £90-£135 | £140-£155 |
| 11-20 | £120-£175 | £180-£195 |
| 21-30 | £165-£230 | £235-£255 |
| 31-40 | £205-£290 | £295-£320 |
| 41-50 | £245-£350 | £355-£385 |
| 51-60 | £285-£395 | £400-£435 |
| 61-70 | £305-£420 | £425-£460 |
| 71-80 | £325-£445 | £450-£485 |
| 81-90 | £345-£470 | £475-£515 |
| 91-100 | £365-£500 | £505-£550 |

### Worked Examples

- Level `1`
  - average order value: `£8`
  - expected completed orders: `14`
  - multiplier: `0.84`
  - target: `floor(14 * 8 * 0.84) = £94`

- Level `25`
  - average order value: `£13`
  - expected completed orders: `18`
  - multiplier: `0.88`
  - target: `floor(18 * 13 * 0.88) = £205`

- Level `60`
  - average order value: `£16`
  - expected completed orders: `27`
  - multiplier: `0.90`
  - target: `floor(27 * 16 * 0.90) = £388`

- Level `100`
  - average order value: `£16`
  - expected completed orders: `34`
  - multiplier: `0.96` only if the final boss is explicitly marked as near-perfect
  - target: `floor(34 * 16 * 0.96) = £522`

### Theoretical Throughput Guardrail

Theoretical throughput is estimated per level using:

`floor(levelDurationMs / averageOrderCompletionMsWithoutMistakes)`

The target must stay below:

`theoreticalThroughput * averageOrderValue * 0.95`

Recommended planning assumptions:

| Tier | Avg Perfect Completion Time |
|------|-----------------------------|
| 1 | 5.8s |
| 2 | 6.2s |
| 3 | 6.9s |
| 4 | 7.5s |
| 5 | 7.9s |
| 6 | 8.2s |

### Reward Pacing

- Completing a level does not award credits directly
- Replay of already-cleared levels may award a local star rating but no premium currency
- Premium currency only enters the system through the main site purchase flow
- Do not create in-game credit farming loops in v1

### Boss Level Rule

Boss levels are:

- `9, 10`
- `19, 20`
- `29, 30`
- `39, 40`
- `49, 50`
- `59, 60`
- `70, 80, 90, 100`

Boss levels should raise target difficulty by roughly `10-15%`, not `40%`. The pressure should come mostly from tighter patience and denser spawns, not impossible economics.

### Monetization Guardrail

No level target should require:

- More than `95%` of theoretical perfect throughput
- More than `1` skipped walkout for a normal level
- A paid skip to feel reasonable

If playtests show a level regularly needing near-perfect execution, lower target or relax spawn congestion.

---

## 4. Station and Queue State Rules

### Core Model

Every order exists in exactly one state at a time:

1. `WaitingInLobby`
2. `QueuedAtStation`
3. `ActiveAtStation`
4. `ReadyForNextStation`
5. `Completed`
6. `WalkedOut`
7. `Voided`

### Queue Topology

Each station has:

- `queue`: up to `3` waiting orders
- `activeOrder`: exactly `1`
- `outputBuffer`: exactly `1`

This replaces the earlier "1 active order only" rule with an implementable lane system.

```ts
type StationRuntime = {
  key: StationKey
  queue: string[]
  activeOrderId: string | null
  outputBufferOrderId: string | null
  busyUntilMs: number | null
  interactionState: 'idle' | 'waitingForInput' | 'resolving' | 'blocked'
}
```

### Why This Matters

Without a queue and output buffer, downstream blocking would freeze the whole kitchen too often. The player should manage congestion, not hit ambiguous deadlocks.

### Routing Rules

1. Player accepts customer from lobby
2. Accepted order moves to the first unlocked station queue
3. When a station has no `activeOrder`, it pulls from its own queue
4. On station success, the order moves to that station's `outputBuffer`
5. Player must tap the buffered order to send it to the next station queue
6. If the next queue is full, the order remains in the current station buffer and blocks that station from finishing another order
7. A station with a blocked `outputBuffer` may continue its active minigame only if `activeOrder` is empty
8. A station cannot pull a new order from queue while its `outputBuffer` is occupied

This creates deliberate bottlenecks while keeping rules readable.

### Queue Limits

- Lobby queue: unlimited for simulation, visible cap `6` on screen
- Station queue: max `3`
- Output buffer: max `1`

When the first station queue is full, newly accepted customers remain in lobby until there is space.

### Queue Processing Rules

- Queue order is FIFO within each station
- The player cannot reorder a station queue in v1
- The lobby queue is also FIFO, but the player may choose which visible customer to accept next
- If more than `6` customers exist in the lobby, only the oldest `6` are rendered; the rest remain simulated off-screen
- A customer may walk out while still in the lobby queue

### State Transition Rules

```text
waitingInLobby
  -> queuedAtStation
queuedAtStation
  -> activeAtStation
activeAtStation
  -> readyForNextStation
activeAtStation
  -> activeAtStation        # retry after a major station failure
readyForNextStation
  -> queuedAtStation        # next station accepts it
readyForNextStation
  -> completed              # till closes the sale
any non-terminal state
  -> walkedOut
walkedOut
  -> voided
```

### Acceptance Rules

- An order cannot be accepted into a station if that station queue already contains `3` orders
- An order cannot skip a required station
- An order cannot be duplicated across queue, active slot, or buffer
- An order in `voided` or `completed` state is removed from all station references within the same tick

### Player Agency

The player is making two kinds of decisions:

- Which customer to accept next
- When to release buffered work to the next station

That is enough interaction for v1. Do not add drag-and-drop free routing.

---

## 5. Station Behaviors and Penalties

### Fryer

- Interaction: stop cook timer inside a green window
- Perfect: full value, no delay
- Early or late but salvageable: `-£2` payout penalty
- Burnt: remake required, adds `4 seconds`, customer patience drops by an extra `15%`

Runtime values:

- preheat/setup time: `0.4s`
- active timing window: `1.2s`
- perfect band: center `35%` of the timing window
- salvage band: remaining `65%`
- full miss outside window: burnt result

### Sauce

- Interaction: choose correct sauce from `3` options
- Correct: no penalty
- Wrong: auto-correct after `1.5 seconds`, `-£1` payout penalty

Runtime values:

- choice limit: `3.5s`
- idle timeout: if no choice is made, station auto-fails as wrong choice

### Sides

- Interaction: choose correct side from `3` options
- Correct: no penalty
- Wrong: auto-correct after `1.5 seconds`, `-£1` payout penalty

Runtime values:

- choice limit: `3.0s`
- idle timeout: if no choice is made, station auto-fails as wrong choice

### Drinks

- Interaction: fill into target band
- Perfect fill: no penalty
- Slight over/under fill: `-£1` payout penalty
- Major miss: redo pour, adds `2 seconds`

Runtime values:

- hold-to-fill duration to overflow: `2.0s`
- perfect band: `45%-60%`
- minor miss band: `35%-44%` or `61%-72%`
- major miss: below `35%` or above `72%`

### Boxing

- Interaction: tap rapidly to seal within time window
- Success: earns boxing bonus
- Fail: lose `£1` boxing bonus and add `1 second`

Runtime values:

- tap target: `6 taps`
- time window: `1.8s`
- partial progress does not carry over after fail

### Till

- No minigame in v1
- Order is cashed out immediately on arrival

### Customer Walkout Rule

If patience reaches zero before the order reaches Till:

- Customer leaves
- Order becomes `Voided`
- No cash awarded
- All queued or buffered work for that order is removed instantly

### Payout Calculation

```ts
finalPayoutPence = max(0, payoutBasePence + payoutModifiersPence)
```

Modifier table:

| Event | Modifier |
|-------|----------|
| Fryer salvage miss | `-200p` |
| Wrong sauce | `-100p` |
| Wrong side | `-100p` |
| Drink minor miss | `-100p` |
| Drink major miss | `0p`, but adds retry time |
| Boxing fail | `-100p` |
| VIP customer complete | `+400p` |
| Clean run end bonus | `+500p` level-end bonus, not order payout |

### Visual Feedback Rules

- Green flash on perfect station result
- Yellow flash on recoverable penalty
- Red flash on burnout, walkout, or major miss
- Show floating currency delta whenever an order is completed
- Show queue-full icon when a station cannot accept the next buffered order

---

## 6. Patience, Spawn, and Difficulty

### Patience

Patience is measured in seconds.

| Tier | Base Patience |
|------|---------------|
| 1 | 45s |
| 2 | 42s |
| 3 | 39s |
| 4 | 36s |
| 5 | 34s |
| 6 | 32s |

Patience drain rules:

- Drain is continuous over real elapsed time
- While an order is in `activeAtStation`, patience drains at `0.85x`
- While an order is blocked in `readyForNextStation`, patience drains at `1.15x`
- While waiting in lobby after becoming visibly angry, patience drains at `1.25x`

### Boss Modifier

- Patience reduced by `12%`
- Spawn interval reduced by `10-14%`

### Spawn Rule

Spawn interval should be tuned so the kitchen is busy but not permanently saturated.

Starting guidance:

| Tier | Spawn Interval |
|------|----------------|
| 1 | 5.5s-6.0s |
| 2 | 5.0s-5.5s |
| 3 | 4.6s-5.0s |
| 4 | 4.2s-4.7s |
| 5 | 3.9s-4.4s |
| 6 | 3.7s-4.2s |

Randomize each spawn by `+-0.4s` so levels do not feel robotic.

### Spawn Composition Rules

- Each level begins with a `2.5s` grace period before the first spawn
- Do not spawn more than `2` customers within any `2s` window before level `20`
- From level `21` onward, burst pairs are allowed at most once every `18s`
- Never spawn a new customer if total non-terminal orders already exceed `12`

### Difficulty Inputs Per Level

Every level config should define:

- `durationMs`
- `cashTargetPence`
- `spawnIntervalMinMs`
- `spawnIntervalMaxMs`
- `patienceBaseMs`
- `bossModifier`
- `activeStations`
- `optionalModifier`

---

## 7. Level Structure

### Unlock Tiers

| Tier | Levels | Stations Active |
|------|--------|-----------------|
| 1 | 1-10 | Fryer, Till |
| 2 | 11-20 | Fryer, Sauce, Till |
| 3 | 21-30 | Fryer, Sauce, Sides, Till |
| 4 | 31-40 | Fryer, Sauce, Sides, Drinks, Till |
| 5 | 41-50 | Fryer, Sauce, Sides, Drinks, Boxing, Till |
| 6 | 51-100 | Full route, increasing pressure |

### Endgame Variety Rule

Levels `61-100` should not be target-only escalation. Add light modifiers from this set:

- Rush minute: `15s` temporary spawn increase
- VIP customer: worth `+£4`, lower patience
- Fryer wobble: green timing window shrinks for `20s`
- Clean run bonus: `+£5` if no customer walks out in the level

Only one modifier is active per level in v1. This keeps endgame fresh without large scope expansion.

### Level Progression Rules

- A player may enter any level from `1` through `unlockedLevel`
- On first clear of the current highest unlocked level, unlock `level + 1`
- Replaying older levels does not unlock anything further
- Level `100` remains replayable after clear

### Star Rating

Star rating is optional local-only metadata for UX and does not affect progression:

- `3 stars`: clear target with `0` walkouts
- `2 stars`: clear target with `1-2` walkouts
- `1 star`: clear target with `3+` walkouts

### Sample Level Config Schema

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
  level: 1,
  tier: 1,
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
  level: 25,
  tier: 3,
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
  level: 100,
  tier: 6,
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

## 8. Tech Architecture

### Runtime Split

- `PixiJS` renders the kitchen, customers, stations, queues, patience bars, and interactive objects
- `React` renders menus, HUD, modal flows, and shop overlays
- `Zustand` stores durable meta state and per-level UI state

### Recommended Store Separation

Use two stores or two slices:

1. `metaState`
   - unlockedLevel
   - credits
   - lives
   - livesRefillAt
   - lastServerVersion

2. `runState`
   - currentLevel
   - timerRemaining
   - cashEarned
   - activeOrders
   - resultModal

Do not persist full in-level run state for v1.

### Runtime Ownership

- `GameScene` owns simulation time, entity creation, collisions, and station ticking
- `runStore` owns UI-facing mirrors of simulation state only
- `metaStore` owns durable progression state from the server
- React components do not mutate Pixi entities directly
- Pixi entities do not call fetch directly; network mutations pass through an application service layer

### Tick Contract

At `60fps`, one game tick must:

1. Advance global level timer
2. Spawn customer if spawn clock elapsed
3. Tick patience for all non-terminal orders
4. Tick station interaction states
5. Resolve completed interactions into queue/buffer transitions
6. Resolve walkouts
7. Resolve payouts reaching Till
8. Check end-of-level conditions

### End-of-Level Rules

- Success triggers immediately once `cashEarned >= cashTarget`, even if time remains
- Remaining customers freeze visually during the success transition
- Fail triggers only when timer reaches `0` and `cashEarned < cashTarget`
- Once a result modal begins, no further station input is accepted

### Suggested Structure

```text
app/games/chicken-shop/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── store/
│   │   ├── metaStore.ts
│   │   └── runStore.ts
│   ├── game/
│   │   ├── PixiApp.ts
│   │   ├── GameScene.ts
│   │   ├── Order.ts
│   │   ├── Customer.ts
│   │   ├── Station.ts
│   │   ├── levelConfig.ts
│   │   └── textures.ts
│   ├── ui/
│   │   ├── MainMenu.tsx
│   │   ├── HUD.tsx
│   │   ├── LevelResult.tsx
│   │   ├── Shop.tsx
│   │   └── LivesEmpty.tsx
│   └── api/
│       ├── auth.ts
│       └── progression.ts
```

---

## 9. Auth and Save Consistency

### Auth Source of Truth

Use one auth model only:

- Primary auth source: `cw_session` cookie on the Charlie's Wingz domain
- Client may read a lightweight user snapshot from localStorage for UI boot speed
- Authorization for save APIs must rely on the server session, not a localStorage token

Do not define localStorage as the auth source of truth.

### Mounting Rule

The game should be mounted directly inside the Next.js route at `/games/chicken-shop`, not inside an iframe.

Reason:

- simpler session handling
- no storage ambiguity
- no cross-frame resize/input issues
- easier shared layout and route guards

### Persistent Progress Shape

```ts
type ChickenShopProgress = {
  game: 'chicken-shop'
  unlockedLevel: number
  credits: number
  lives: number
  livesRefillAt: number | null
  updatedAt: number
  version: number
}
```

### API Contracts

`GET /api/games/chicken-shop/progress`

```ts
type GetProgressResponse = {
  progress: ChickenShopProgress
  serverTime: number
}
```

`POST /api/games/chicken-shop/complete-level`

```ts
type CompleteLevelRequest = {
  level: number
  cashEarnedPence: number
  walkouts: number
  completedOrders: number
  penalties: Record<string, number>
  runDurationMs: number
}
```

`POST /api/games/chicken-shop/fail-level`

```ts
type FailLevelRequest = {
  level: number
  cashEarnedPence: number
  walkouts: number
  completedOrders: number
  penalties: Record<string, number>
  runDurationMs: number
}
```

`POST /api/games/chicken-shop/refill-lives`

```ts
type RefillLivesRequest = {
  expectedVersion: number
}
```

`POST /api/games/chicken-shop/skip-level`

```ts
type SkipLevelRequest = {
  level: number
  expectedVersion: number
}
```

### Server Authority Rule

The server is authoritative for:

- credits
- lives
- unlockedLevel

The client may cache these values locally, but may not invent successful mutations.

### Mutation Endpoints

Do not use one generic blob save endpoint for paid state changes.

Use explicit endpoints:

- `POST /api/games/chicken-shop/complete-level`
- `POST /api/games/chicken-shop/fail-level`
- `POST /api/games/chicken-shop/refill-lives`
- `POST /api/games/chicken-shop/skip-level`
- `GET /api/games/chicken-shop/progress`

### Mutation Rules

- `complete-level` increments `unlockedLevel` if current level was the highest unlocked
- `fail-level` decrements a life if lives remain
- `refill-lives` spends `20 credits` atomically and sets lives to `3`
- `skip-level` spends `10 credits` atomically and advances unlock by `1`
- `complete-level` should be idempotent by `(userId, level, runId)`
- `fail-level` should be idempotent by `runId`
- level mutations must reject requests for locked levels

### Error Semantics

Use explicit error codes:

- `401 UNAUTHENTICATED`
- `403 LEVEL_LOCKED`
- `409 VERSION_CONFLICT`
- `409 ALREADY_PROCESSED`
- `422 INVALID_LEVEL_RESULT`
- `429 RATE_LIMITED`

### Client Boot Flow

1. Next.js route guard checks for authenticated session
2. React shell mounts
3. Client fetches `progress`
4. While waiting, show branded loading state
5. On success, hydrate `metaStore`
6. On failure with cached progress, boot in degraded mode
7. On failure without cached progress, block entry and show retry CTA

### Consistency Guarantee

Every mutation response returns the full authoritative `ChickenShopProgress` object, including `version`.

The client must:

1. Optimistically show a loading state, not optimistic credits/lives mutation
2. Replace local cached progress with the server response
3. Reject stale responses whose `version` is lower than current local version

This avoids race conditions and accidental rollback of paid state.

### Offline Behavior

If the progress endpoint is unavailable:

- Allow menu boot from cached local progress
- Do not allow paid actions while offline
- Do not allow level launch if lives cannot be validated and cached lives are `0`

This is stricter than the original spec on purpose. Monetized state should fail safe.

### Local Cache Rules

- Local cache key: `cw:games:chicken-shop:progress`
- Cache only the latest authoritative server progress
- Cache must include `version` and `updatedAt`
- Cache is overwritten only by successful server responses with `version >= localVersion`

### Security Notes

- The client must never submit credit deltas directly
- The server must derive new balances from persisted balances and validated actions
- Paid actions require CSRF protection consistent with the rest of the main site
- All mutation endpoints should be rate-limited per authenticated user

---

## 10. Analytics and Tuning Hooks

Track the following for every level attempt:

- level number
- success or fail
- cash target
- cash earned
- customers spawned
- customers completed
- customers walked out
- average station wait time
- penalty count by station
- life spent
- skip used

These metrics are required to tune targets and station pressure after launch.

### Event Names

- `chicken_shop_level_started`
- `chicken_shop_level_completed`
- `chicken_shop_level_failed`
- `chicken_shop_customer_walked_out`
- `chicken_shop_station_penalty`
- `chicken_shop_skip_used`
- `chicken_shop_refill_used`

### Minimum Analytics Payload

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

---

## 11. UI and UX Spec

### Screens

- Main Menu
- Level Select
- In-Game HUD
- Pause Modal
- Level Success Modal
- Level Fail Modal
- Lives Empty Modal
- Shop Overlay

### Main Menu Requirements

- Show current lives, refill timer if applicable, credits, and highest unlocked level
- Primary CTA is `Play`
- Secondary CTA is `Shop`
- If lives are `0`, replace `Play` with `Refill Lives` and `Wait Timer`

### Level Select Requirements

- Show levels `1` through `unlockedLevel`
- Locked levels are visible but disabled
- Boss levels should have a distinct badge
- Replayed completed levels may show local star rating

### In-Game HUD Requirements

- Top-left: level number and timer
- Top-center: progress bar for `cashEarned / cashTarget`
- Top-right: lives and credit balance
- Bottom or side rail: station hint text when a minigame is active

### Result Modal Requirements

Success modal:

- show target reached
- show cash earned
- show walkout count
- show stars if enabled
- CTA: `Next Level`
- CTA: `Replay`

Fail modal:

- show shortfall amount
- show life lost
- if lives remain: CTA `Retry`
- if no lives remain: CTA `Refill Lives`
- optional CTA `Skip Level` if level is currently unlocked and player has enough credits

### Input Model

- Desktop primary input: mouse click
- Mobile web primary input: tap
- No hover-only interactions for required gameplay
- All time-critical interactions must be touch-safe at `44px` minimum hit area

### Accessibility Baseline

- Color is not the only signal for success or failure
- Patience bars must include shape or icon state changes
- Important numeric state in HUD must meet readable contrast
- Reduced-motion mode should disable non-essential screen shake and flashes

---

## 12. Testing and Acceptance Criteria

### Core Functional Acceptance

- A newly spawned customer always receives exactly one order
- Orders always follow the configured station sequence for the level
- A station never holds more than `1` active order, `3` queued orders, and `1` buffered order
- A walkout always removes that order from every station container within one tick
- A completed order can never pay below `£0`
- A failed level consumes exactly one life
- A successful level consumes zero lives
- Refill lives always sets lives to `3` and charges exactly `20 credits`
- Skip level always advances one level and charges exactly `10 credits`

### Economy Acceptance

- Level target generation script must satisfy the throughput guardrail for all `100` levels
- No non-boss level should require more than `90%` of median playtest throughput
- Boss levels may exceed that, but not above `95%`

### Save Consistency Acceptance

- Repeated submission of the same `runId` must not double-consume lives
- Repeated submission of the same paid action must not double-consume credits
- Stale mutation responses must not overwrite newer local progress
- Game boot with valid cookie and no cache must still hydrate correctly

### Performance Acceptance

- Maintain `55fps+` on a mid-range mobile browser during a busy tier `6` level
- Maximum simultaneous visible customers: `8`
- Maximum total simulated non-terminal orders: `12`

---

## 13. Out of Scope for v1

---

- Multiplayer
- Leaderboards
- Cosmetics
- Story mode
- Native mobile app
- Resume mid-level from saved in-progress state
- Real-money purchasing flow inside the game
- Complex combo systems beyond the light endgame modifiers above

---

## 14. Implementation Notes

If engineering needs to cut scope further, keep this priority order:

1. Core routing and queue state machine
2. Server-authoritative lives and credits
3. Clear station penalties
4. Level tuning data hooks
5. Endgame modifiers

Do not cut queue precision or save consistency. Those are the parts most likely to create bugs and monetization issues if left vague.

### Recommended Build Order

1. Define `LevelConfig`, `Order`, and `StationRuntime` types
2. Implement queue/state machine in headless tests first
3. Implement Pixi rendering on top of the tested state machine
4. Add station minigames one by one in unlock order
5. Integrate authoritative progression endpoints
6. Add analytics hooks
7. Tune target values after internal playtests
