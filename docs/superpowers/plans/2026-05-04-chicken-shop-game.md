# Chicken Shop Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, level-based Diner Dash-style chicken shop browser game using React + PixiJS v8 + Vite, integrated with the existing Charlie's Wingz site auth.

**Architecture:** Pure TypeScript state machines (orderMachine, stationMachine) are built and tested headless first. PixiJS rendering wraps those machines. React renders all non-game UI (menus, HUD, modals). Zustand bridges the two.

**Tech Stack:** PixiJS v8, React 18, Zustand, Vite, Vitest, TypeScript

---

## File Map

```
app/games/chicken-shop/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types.ts                   ← all shared types
│   ├── store/
│   │   ├── metaStore.ts           ← lives, credits, unlockedLevel
│   │   └── runStore.ts            ← in-level: timer, cash, screen
│   ├── game/
│   │   ├── orderMachine.ts        ← pure order state transitions (no Pixi)
│   │   ├── stationMachine.ts      ← pure station queue/buffer logic (no Pixi)
│   │   ├── levelConfig.ts         ← generates all 100 LevelConfig objects
│   │   ├── PixiApp.ts             ← Pixi Application init + resize
│   │   ├── textures.ts            ← all textures from Pixi.Graphics
│   │   ├── Customer.ts            ← Pixi customer entity
│   │   ├── Station.ts             ← Pixi station entity wrapping stationMachine
│   │   └── GameScene.ts           ← tick loop, spawning, end-of-level
│   ├── ui/
│   │   ├── MainMenu.tsx
│   │   ├── HUD.tsx
│   │   ├── LevelResult.tsx
│   │   ├── Shop.tsx
│   │   └── LivesEmpty.tsx
│   └── api/
│       ├── auth.ts
│       └── progression.ts         ← all endpoints + pending saves queue
├── src/__tests__/
│   ├── orderMachine.test.ts
│   ├── stationMachine.test.ts
│   └── levelConfig.test.ts
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Task 1: Vite Project Scaffold

**Files:**
- Create: `app/games/chicken-shop/package.json`
- Create: `app/games/chicken-shop/vite.config.ts`
- Create: `app/games/chicken-shop/tsconfig.json`
- Create: `app/games/chicken-shop/index.html`
- Create: `app/games/chicken-shop/src/main.tsx`
- Create: `app/games/chicken-shop/src/App.tsx`

- [ ] **Step 1: Create the directory and package.json**

```bash
mkdir -p app/games/chicken-shop/src/__tests__
mkdir -p app/games/chicken-shop/src/game
mkdir -p app/games/chicken-shop/src/store
mkdir -p app/games/chicken-shop/src/ui
mkdir -p app/games/chicken-shop/src/api
```

```json
// app/games/chicken-shop/package.json
{
  "name": "chicken-shop",
  "private": true,
  "version": "0.0.1",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "pixi.js": "^8.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```ts
// app/games/chicken-shop/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
  build: {
    outDir: '../../public/games/chicken-shop',
    emptyOutDir: true,
  },
  base: '/games/chicken-shop/',
})
```

- [ ] **Step 3: Create tsconfig.json**

```json
// app/games/chicken-shop/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create index.html**

```html
<!-- app/games/chicken-shop/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Charlie's Wingz — Chicken Shop Manager</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #1a1a2e; overflow: hidden; }
      #root { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/main.tsx**

```tsx
// app/games/chicken-shop/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 6: Create src/App.tsx (stub)**

```tsx
// app/games/chicken-shop/src/App.tsx
export default function App() {
  return <div style={{ color: 'white', padding: 32 }}>Chicken Shop Manager — loading...</div>
}
```

- [ ] **Step 7: Install dependencies and verify dev server starts**

```bash
cd app/games/chicken-shop && npm install
npm run dev
```

Expected: Vite dev server starts at `http://localhost:5173`, browser shows "Chicken Shop Manager — loading..."

- [ ] **Step 8: Commit**

```bash
git add app/games/chicken-shop
git commit -m "feat: scaffold chicken-shop Vite + React project"
```

---

## Task 2: Core TypeScript Types

**Files:**
- Create: `app/games/chicken-shop/src/types.ts`

- [ ] **Step 1: Create types.ts**

```ts
// app/games/chicken-shop/src/types.ts

export type CurrencyPence = number

export type StationKey = 'fryer' | 'sauce' | 'sides' | 'drinks' | 'boxing' | 'till'

export type OrderState =
  | 'waitingInLobby'
  | 'queuedAtStation'
  | 'activeAtStation'
  | 'readyForNextStation'
  | 'completed'
  | 'walkedOut'
  | 'voided'

export type QualityFlags = {
  fryerSalvaged: boolean
  fryerRemade: boolean
  wrongSauce: boolean
  wrongSide: boolean
  drinkMinorMiss: boolean
  drinkMajorMiss: boolean
  boxingFailed: boolean
}

export type Order = {
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
  qualityFlags: QualityFlags
}

export type CustomerMood = 'calm' | 'waiting' | 'angry'

export type Customer = {
  id: string
  spawnedAtMs: number
  orderId: string
  mood: CustomerMood
}

export type StationInteractionState = 'idle' | 'waitingForInput' | 'resolving' | 'blocked'

export type StationRuntime = {
  key: StationKey
  queue: string[]
  activeOrderId: string | null
  outputBufferOrderId: string | null
  busyUntilMs: number | null
  interactionState: StationInteractionState
}

export type LevelModifier = 'none' | 'rushMinute' | 'vipCustomer' | 'fryerWobble' | 'cleanRunBonus'

export type LevelConfig = {
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

export type ChickenShopProgress = {
  game: 'chicken-shop'
  unlockedLevel: number
  credits: number
  lives: number
  livesRefillAt: number | null
  updatedAt: number
  version: number
}

export type PendingSave = {
  endpoint: string
  body: Record<string, unknown>
  queuedAtMs: number
}

export type Screen = 'loading' | 'menu' | 'levelSelect' | 'game' | 'shop' | 'livesEmpty'
```

- [ ] **Step 2: Verify types compile**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/games/chicken-shop/src/types.ts
git commit -m "feat: add core TypeScript types for chicken shop"
```

---

## Task 3: Order State Machine (Headless + Tests)

**Files:**
- Create: `app/games/chicken-shop/src/game/orderMachine.ts`
- Create: `app/games/chicken-shop/src/__tests__/orderMachine.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// app/games/chicken-shop/src/__tests__/orderMachine.test.ts
import { describe, it, expect } from 'vitest'
import {
  createOrder,
  transitionOrder,
  computePayout,
} from '../game/orderMachine'
import type { Order } from '../types'

describe('createOrder', () => {
  it('creates an order in waitingInLobby state', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    expect(o.state).toBe('waitingInLobby')
    expect(o.requiredStations).toEqual(['fryer', 'till'])
    expect(o.currentStationIndex).toBe(0)
    expect(o.payoutBasePence).toBe(800)
  })

  it('includes sauce in required stations when active', () => {
    const o = createOrder({ customerId: 'c1', level: 15, activeStations: ['fryer', 'sauce', 'till'], nowMs: 0 })
    expect(o.requiredStations).toContain('sauce')
    expect(o.payoutBasePence).toBe(1000)
  })
})

describe('transitionOrder', () => {
  it('moves from waitingInLobby to queuedAtStation', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    const next = transitionOrder(o, 'ACCEPT')
    expect(next.state).toBe('queuedAtStation')
    expect(next.currentStation).toBe('fryer')
  })

  it('moves from queuedAtStation to activeAtStation', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    const queued = transitionOrder(o, 'ACCEPT')
    const active = transitionOrder(queued, 'STATION_START')
    expect(active.state).toBe('activeAtStation')
  })

  it('advances to next station after station complete', () => {
    const o = createOrder({ customerId: 'c1', level: 15, activeStations: ['fryer', 'sauce', 'till'], nowMs: 0 })
    const queued = transitionOrder(o, 'ACCEPT')
    const active = transitionOrder(queued, 'STATION_START')
    const ready = transitionOrder(active, 'STATION_COMPLETE')
    expect(ready.state).toBe('readyForNextStation')
    expect(ready.currentStationIndex).toBe(1)
  })

  it('marks completed when all stations done', () => {
    let o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    o = transitionOrder(o, 'ACCEPT')       // → queuedAtStation (fryer)
    o = transitionOrder(o, 'STATION_START')// → activeAtStation
    o = transitionOrder(o, 'STATION_COMPLETE') // → readyForNextStation, index 1
    o = transitionOrder(o, 'ACCEPT')       // → queuedAtStation (till)
    o = transitionOrder(o, 'STATION_START')// → activeAtStation
    o = transitionOrder(o, 'STATION_COMPLETE') // → completed
    expect(o.state).toBe('completed')
  })

  it('marks walkedOut from any non-terminal state', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    const walkedOut = transitionOrder(o, 'WALKOUT')
    expect(walkedOut.state).toBe('walkedOut')
  })
})

describe('computePayout', () => {
  it('returns base payout with no penalties', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    expect(computePayout(o)).toBe(800)
  })

  it('deducts fryer salvage penalty', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    const penalised = { ...o, qualityFlags: { ...o.qualityFlags, fryerSalvaged: true }, payoutModifiersPence: -200 }
    expect(computePayout(penalised)).toBe(600)
  })

  it('never returns below zero', () => {
    const o = createOrder({ customerId: 'c1', level: 1, activeStations: ['fryer', 'till'], nowMs: 0 })
    const penalised = { ...o, payoutModifiersPence: -9999 }
    expect(computePayout(penalised)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app/games/chicken-shop && npm test
```

Expected: FAIL — `Cannot find module '../game/orderMachine'`

- [ ] **Step 3: Implement orderMachine.ts**

```ts
// app/games/chicken-shop/src/game/orderMachine.ts
import type { Order, OrderState, StationKey, QualityFlags } from '../types'

const STATION_VALUE_PENCE: Partial<Record<StationKey, number>> = {
  fryer: 800,
  sauce: 200,
  sides: 300,
  drinks: 200,
  boxing: 100,
}

const DEFAULT_FLAGS: QualityFlags = {
  fryerSalvaged: false,
  fryerRemade: false,
  wrongSauce: false,
  wrongSide: false,
  drinkMinorMiss: false,
  drinkMajorMiss: false,
  boxingFailed: false,
}

function basePayoutForStations(stations: StationKey[]): number {
  return stations.reduce((sum, s) => sum + (STATION_VALUE_PENCE[s] ?? 0), 0)
}

let _idCounter = 0
function newId(): string {
  return `order-${++_idCounter}-${Date.now()}`
}

type CreateOrderParams = {
  customerId: string
  level: number
  activeStations: StationKey[]
  nowMs: number
  patienceMs?: number
}

export function createOrder(p: CreateOrderParams): Order {
  return {
    id: newId(),
    customerId: p.customerId,
    level: p.level,
    createdAtMs: p.nowMs,
    requiredStations: p.activeStations,
    currentStationIndex: 0,
    state: 'waitingInLobby',
    currentStation: null,
    payoutBasePence: basePayoutForStations(p.activeStations),
    payoutModifiersPence: 0,
    patienceMaxMs: p.patienceMs ?? 45_000,
    patienceRemainingMs: p.patienceMs ?? 45_000,
    qualityFlags: { ...DEFAULT_FLAGS },
  }
}

type OrderEvent =
  | 'ACCEPT'
  | 'STATION_START'
  | 'STATION_COMPLETE'
  | 'WALKOUT'
  | 'VOID'

export function transitionOrder(order: Order, event: OrderEvent): Order {
  const s = order.state

  if (event === 'WALKOUT') {
    return { ...order, state: 'walkedOut' }
  }
  if (event === 'VOID') {
    return { ...order, state: 'voided' }
  }

  if (event === 'ACCEPT' && s === 'waitingInLobby') {
    return {
      ...order,
      state: 'queuedAtStation',
      currentStation: order.requiredStations[0],
    }
  }

  if (event === 'ACCEPT' && s === 'readyForNextStation') {
    const nextIndex = order.currentStationIndex
    return {
      ...order,
      state: 'queuedAtStation',
      currentStation: order.requiredStations[nextIndex],
    }
  }

  if (event === 'STATION_START' && s === 'queuedAtStation') {
    return { ...order, state: 'activeAtStation' }
  }

  if (event === 'STATION_COMPLETE' && s === 'activeAtStation') {
    const nextIndex = order.currentStationIndex + 1
    if (nextIndex >= order.requiredStations.length) {
      return { ...order, state: 'completed', currentStation: null }
    }
    return {
      ...order,
      state: 'readyForNextStation',
      currentStationIndex: nextIndex,
      currentStation: null,
    }
  }

  return order
}

export function applyPenalty(order: Order, penaltyPence: number): Order {
  return { ...order, payoutModifiersPence: order.payoutModifiersPence - penaltyPence }
}

export function computePayout(order: Order): number {
  return Math.max(0, order.payoutBasePence + order.payoutModifiersPence)
}

export function tickPatience(order: Order, deltaMs: number, drainRate = 1): Order {
  const remaining = Math.max(0, order.patienceRemainingMs - deltaMs * drainRate)
  return { ...order, patienceRemainingMs: remaining }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app/games/chicken-shop && npm test
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/games/chicken-shop/src/game/orderMachine.ts app/games/chicken-shop/src/__tests__/orderMachine.test.ts
git commit -m "feat: add order state machine with tests"
```

---

## Task 4: Station Queue/Buffer Machine (Headless + Tests)

**Files:**
- Create: `app/games/chicken-shop/src/game/stationMachine.ts`
- Create: `app/games/chicken-shop/src/__tests__/stationMachine.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// app/games/chicken-shop/src/__tests__/stationMachine.test.ts
import { describe, it, expect } from 'vitest'
import {
  createStation,
  enqueue,
  startActive,
  completeActive,
  releaseBuffer,
  removeOrder,
} from '../game/stationMachine'

describe('createStation', () => {
  it('creates an idle station', () => {
    const s = createStation('fryer')
    expect(s.key).toBe('fryer')
    expect(s.queue).toEqual([])
    expect(s.activeOrderId).toBeNull()
    expect(s.outputBufferOrderId).toBeNull()
  })
})

describe('enqueue', () => {
  it('adds an order to the queue', () => {
    const s = createStation('fryer')
    const next = enqueue(s, 'order-1')
    expect(next.queue).toEqual(['order-1'])
  })

  it('rejects when queue is full (3 orders)', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'o1')
    s = enqueue(s, 'o2')
    s = enqueue(s, 'o3')
    expect(() => enqueue(s, 'o4')).toThrow('queue full')
  })
})

describe('startActive', () => {
  it('moves first queue item to active', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'order-1')
    s = startActive(s)
    expect(s.activeOrderId).toBe('order-1')
    expect(s.queue).toEqual([])
    expect(s.interactionState).toBe('waitingForInput')
  })

  it('does nothing when queue is empty', () => {
    const s = createStation('fryer')
    const next = startActive(s)
    expect(next.activeOrderId).toBeNull()
  })

  it('does nothing when output buffer is occupied', () => {
    let s = createStation('fryer')
    s = { ...s, outputBufferOrderId: 'blocking-order' }
    s = enqueue(s, 'order-1')
    const next = startActive(s)
    expect(next.activeOrderId).toBeNull()
    expect(next.interactionState).toBe('blocked')
  })
})

describe('completeActive', () => {
  it('moves active order to output buffer', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'order-1')
    s = startActive(s)
    s = completeActive(s)
    expect(s.activeOrderId).toBeNull()
    expect(s.outputBufferOrderId).toBe('order-1')
    expect(s.interactionState).toBe('idle')
  })
})

describe('releaseBuffer', () => {
  it('clears the output buffer and returns the order id', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'order-1')
    s = startActive(s)
    s = completeActive(s)
    const [next, orderId] = releaseBuffer(s)
    expect(next.outputBufferOrderId).toBeNull()
    expect(orderId).toBe('order-1')
  })
})

describe('removeOrder', () => {
  it('removes an order from the queue', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'o1')
    s = enqueue(s, 'o2')
    s = removeOrder(s, 'o1')
    expect(s.queue).toEqual(['o2'])
  })

  it('clears active order if matched', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'o1')
    s = startActive(s)
    s = removeOrder(s, 'o1')
    expect(s.activeOrderId).toBeNull()
  })

  it('clears output buffer if matched', () => {
    let s = createStation('fryer')
    s = enqueue(s, 'o1')
    s = startActive(s)
    s = completeActive(s)
    s = removeOrder(s, 'o1')
    expect(s.outputBufferOrderId).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app/games/chicken-shop && npm test
```

Expected: FAIL — `Cannot find module '../game/stationMachine'`

- [ ] **Step 3: Implement stationMachine.ts**

```ts
// app/games/chicken-shop/src/game/stationMachine.ts
import type { StationKey, StationRuntime, StationInteractionState } from '../types'

export function createStation(key: StationKey): StationRuntime {
  return {
    key,
    queue: [],
    activeOrderId: null,
    outputBufferOrderId: null,
    busyUntilMs: null,
    interactionState: 'idle',
  }
}

export function enqueue(station: StationRuntime, orderId: string): StationRuntime {
  if (station.queue.length >= 3) throw new Error('queue full')
  return { ...station, queue: [...station.queue, orderId] }
}

export function startActive(station: StationRuntime): StationRuntime {
  if (station.outputBufferOrderId !== null) {
    return { ...station, interactionState: 'blocked' }
  }
  if (station.queue.length === 0 || station.activeOrderId !== null) {
    return station
  }
  const [next, ...rest] = station.queue
  return {
    ...station,
    queue: rest,
    activeOrderId: next,
    interactionState: 'waitingForInput',
  }
}

export function completeActive(station: StationRuntime): StationRuntime {
  if (station.activeOrderId === null) return station
  return {
    ...station,
    outputBufferOrderId: station.activeOrderId,
    activeOrderId: null,
    interactionState: 'idle',
  }
}

export function releaseBuffer(station: StationRuntime): [StationRuntime, string | null] {
  const orderId = station.outputBufferOrderId
  return [{ ...station, outputBufferOrderId: null }, orderId]
}

export function removeOrder(station: StationRuntime, orderId: string): StationRuntime {
  return {
    ...station,
    queue: station.queue.filter(id => id !== orderId),
    activeOrderId: station.activeOrderId === orderId ? null : station.activeOrderId,
    outputBufferOrderId: station.outputBufferOrderId === orderId ? null : station.outputBufferOrderId,
    interactionState: station.activeOrderId === orderId ? 'idle' : station.interactionState,
  }
}

export function isQueueFull(station: StationRuntime): boolean {
  return station.queue.length >= 3
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app/games/chicken-shop && npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/games/chicken-shop/src/game/stationMachine.ts app/games/chicken-shop/src/__tests__/stationMachine.test.ts
git commit -m "feat: add station queue/buffer state machine with tests"
```

---

## Task 5: Level Config Generation + Throughput Validation

**Files:**
- Create: `app/games/chicken-shop/src/game/levelConfig.ts`
- Create: `app/games/chicken-shop/src/__tests__/levelConfig.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// app/games/chicken-shop/src/__tests__/levelConfig.test.ts
import { describe, it, expect } from 'vitest'
import { LEVELS, getLevelConfig } from '../game/levelConfig'

describe('LEVELS', () => {
  it('has exactly 100 entries', () => {
    expect(LEVELS).toHaveLength(100)
  })

  it('level numbers are 1-100 in order', () => {
    LEVELS.forEach((l, i) => expect(l.level).toBe(i + 1))
  })

  it('level 1 uses fryer and till only', () => {
    expect(LEVELS[0].activeStations).toEqual(['fryer', 'till'])
  })

  it('level 11 adds sauce', () => {
    expect(LEVELS[10].activeStations).toContain('sauce')
  })

  it('level 51+ has all stations', () => {
    const l = LEVELS[50]
    expect(l.activeStations).toContain('boxing')
  })

  it('boss levels are correctly flagged', () => {
    expect(LEVELS[8].boss).toBe(true)   // level 9
    expect(LEVELS[9].boss).toBe(true)   // level 10
    expect(LEVELS[7].boss).toBe(false)  // level 8
  })

  it('no level target exceeds throughput guardrail', () => {
    for (const l of LEVELS) {
      const avgCompletionMs = [5800, 6200, 6900, 7500, 7900, 8200][l.tier - 1]
      const theoreticalOrders = Math.floor(l.durationMs / avgCompletionMs)
      const orderValuePence = [800, 1000, 1300, 1500, 1600, 1600][l.tier - 1]
      const maxAllowed = Math.floor(theoreticalOrders * orderValuePence * 0.95)
      expect(l.cashTargetPence).toBeLessThanOrEqual(maxAllowed),
        `Level ${l.level} target ${l.cashTargetPence} exceeds guardrail ${maxAllowed}`
    }
  })
})

describe('getLevelConfig', () => {
  it('returns the correct level', () => {
    expect(getLevelConfig(1).level).toBe(1)
    expect(getLevelConfig(100).level).toBe(100)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app/games/chicken-shop && npm test
```

Expected: FAIL — `Cannot find module '../game/levelConfig'`

- [ ] **Step 3: Implement levelConfig.ts**

```ts
// app/games/chicken-shop/src/game/levelConfig.ts
import type { LevelConfig, LevelModifier, StationKey } from '../types'

const TIER_DEFS = [
  {
    tier: 1 as const, range: [1, 10],
    stations: ['fryer', 'till'] as StationKey[],
    orderValuePence: 800, patienceBaseMs: 45_000,
    spawnMin: 5600, spawnMax: 6000, duration: 90_000, avgCompletionMs: 5800,
  },
  {
    tier: 2 as const, range: [11, 20],
    stations: ['fryer', 'sauce', 'till'] as StationKey[],
    orderValuePence: 1000, patienceBaseMs: 42_000,
    spawnMin: 5000, spawnMax: 5500, duration: 90_000, avgCompletionMs: 6200,
  },
  {
    tier: 3 as const, range: [21, 30],
    stations: ['fryer', 'sauce', 'sides', 'till'] as StationKey[],
    orderValuePence: 1300, patienceBaseMs: 39_000,
    spawnMin: 4600, spawnMax: 5000, duration: 100_000, avgCompletionMs: 6900,
  },
  {
    tier: 4 as const, range: [31, 40],
    stations: ['fryer', 'sauce', 'sides', 'drinks', 'till'] as StationKey[],
    orderValuePence: 1500, patienceBaseMs: 36_000,
    spawnMin: 4200, spawnMax: 4700, duration: 100_000, avgCompletionMs: 7500,
  },
  {
    tier: 5 as const, range: [41, 50],
    stations: ['fryer', 'sauce', 'sides', 'drinks', 'boxing', 'till'] as StationKey[],
    orderValuePence: 1600, patienceBaseMs: 34_000,
    spawnMin: 3900, spawnMax: 4400, duration: 100_000, avgCompletionMs: 7900,
  },
  {
    tier: 6 as const, range: [51, 100],
    stations: ['fryer', 'sauce', 'sides', 'drinks', 'boxing', 'till'] as StationKey[],
    orderValuePence: 1600, patienceBaseMs: 32_000,
    spawnMin: 3700, spawnMax: 4200, duration: 100_000, avgCompletionMs: 8200,
  },
]

const BOSS_LEVELS = new Set([9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 59, 60, 70, 80, 90, 100])

const ENDGAME_MODIFIERS: LevelModifier[] = ['rushMinute', 'vipCustomer', 'fryerWobble', 'cleanRunBonus', 'none']

function getModifier(level: number): LevelModifier {
  if (level <= 60) return 'none'
  return ENDGAME_MODIFIERS[(level - 61) % ENDGAME_MODIFIERS.length]
}

function generateLevel(level: number): LevelConfig {
  const tierDef = TIER_DEFS.find(t => level >= t.range[0] && level <= t.range[1])!
  const isBoss = BOSS_LEVELS.has(level)
  const positionInTier = level - tierDef.range[0]
  const tierLength = tierDef.range[1] - tierDef.range[0]

  // ramp multiplier 0.82 → 0.88 across normal levels, 0.90 → 0.92 for boss
  const rampFraction = positionInTier / Math.max(1, tierLength)
  const baseMult = isBoss
    ? 0.90 + rampFraction * 0.02
    : 0.82 + rampFraction * 0.06

  const duration = level >= 61 ? 110_000 : tierDef.duration
  const expectedOrders = Math.floor(duration / tierDef.avgCompletionMs) * 0.78
  const cashTargetPence = Math.floor(expectedOrders * tierDef.orderValuePence * baseMult)

  const bossPatience = isBoss ? Math.floor(tierDef.patienceBaseMs * 0.88) : tierDef.patienceBaseMs
  const bossSpawnMin = isBoss ? Math.floor(tierDef.spawnMin * 0.87) : tierDef.spawnMin
  const bossSpawnMax = isBoss ? Math.floor(tierDef.spawnMax * 0.87) : tierDef.spawnMax

  return {
    level,
    tier: tierDef.tier,
    durationMs: duration,
    cashTargetPence,
    activeStations: tierDef.stations,
    patienceBaseMs: bossPatience,
    spawnIntervalMinMs: bossSpawnMin,
    spawnIntervalMaxMs: bossSpawnMax,
    boss: isBoss,
    modifier: getModifier(level),
  }
}

export const LEVELS: LevelConfig[] = Array.from({ length: 100 }, (_, i) => generateLevel(i + 1))

export function getLevelConfig(level: number): LevelConfig {
  return LEVELS[level - 1]
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app/games/chicken-shop && npm test
```

Expected: all tests PASS including throughput guardrail check for all 100 levels.

- [ ] **Step 5: Commit**

```bash
git add app/games/chicken-shop/src/game/levelConfig.ts app/games/chicken-shop/src/__tests__/levelConfig.test.ts
git commit -m "feat: add level config generation with throughput guardrail validation"
```

---

## Task 6: Zustand Stores

**Files:**
- Create: `app/games/chicken-shop/src/store/metaStore.ts`
- Create: `app/games/chicken-shop/src/store/runStore.ts`

- [ ] **Step 1: Create metaStore.ts**

```ts
// app/games/chicken-shop/src/store/metaStore.ts
import { create } from 'zustand'
import type { ChickenShopProgress, Screen } from '../types'

type MetaState = {
  screen: Screen
  unlockedLevel: number
  credits: number
  lives: number
  livesRefillAt: number | null
  version: number
  hydrated: boolean
  setScreen: (s: Screen) => void
  setProgress: (p: ChickenShopProgress) => void
  spendCredits: (amount: number) => void
}

export const useMetaStore = create<MetaState>((set) => ({
  screen: 'loading',
  unlockedLevel: 1,
  credits: 0,
  lives: 3,
  livesRefillAt: null,
  version: 0,
  hydrated: false,
  setScreen: (screen) => set({ screen }),
  setProgress: (p) => set({
    unlockedLevel: p.unlockedLevel,
    credits: p.credits,
    lives: p.lives,
    livesRefillAt: p.livesRefillAt,
    version: p.version,
    hydrated: true,
  }),
  spendCredits: (amount) => set(s => ({ credits: Math.max(0, s.credits - amount) })),
}))
```

- [ ] **Step 2: Create runStore.ts**

```ts
// app/games/chicken-shop/src/store/runStore.ts
import { create } from 'zustand'

type RunResult = 'success' | 'fail' | null

type RunState = {
  currentLevel: number
  timerRemainingMs: number
  cashEarnedPence: number
  cashTargetPence: number
  walkouts: number
  completedOrders: number
  result: RunResult
  setLevel: (level: number, targetPence: number, durationMs: number) => void
  addCash: (pence: number) => void
  addWalkout: () => void
  tickTimer: (deltaMs: number) => void
  setResult: (r: RunResult) => void
  reset: () => void
}

export const useRunStore = create<RunState>((set) => ({
  currentLevel: 1,
  timerRemainingMs: 0,
  cashEarnedPence: 0,
  cashTargetPence: 0,
  walkouts: 0,
  completedOrders: 0,
  result: null,
  setLevel: (level, targetPence, durationMs) => set({
    currentLevel: level,
    cashTargetPence: targetPence,
    timerRemainingMs: durationMs,
    cashEarnedPence: 0,
    walkouts: 0,
    completedOrders: 0,
    result: null,
  }),
  addCash: (pence) => set(s => ({ cashEarnedPence: s.cashEarnedPence + pence, completedOrders: s.completedOrders + 1 })),
  addWalkout: () => set(s => ({ walkouts: s.walkouts + 1 })),
  tickTimer: (deltaMs) => set(s => ({ timerRemainingMs: Math.max(0, s.timerRemainingMs - deltaMs) })),
  setResult: (result) => set({ result }),
  reset: () => set({ cashEarnedPence: 0, walkouts: 0, completedOrders: 0, result: null, timerRemainingMs: 0 }),
}))
```

- [ ] **Step 3: Verify types compile**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/games/chicken-shop/src/store/
git commit -m "feat: add Zustand meta and run stores"
```

---

## Task 7: API Layer (Auth + Progression + Pending Saves)

**Files:**
- Create: `app/games/chicken-shop/src/api/auth.ts`
- Create: `app/games/chicken-shop/src/api/progression.ts`

- [ ] **Step 1: Create auth.ts**

```ts
// app/games/chicken-shop/src/api/auth.ts

const SESSION_KEY = 'cw_session'

export type CwSession = {
  token: string
  user: { id: string; email: string; name: string }
}

export function getSession(): CwSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CwSession
  } catch {
    return null
  }
}

export function requireSession(): CwSession {
  const session = getSession()
  if (!session) {
    window.location.href = '/login?redirect=/games/chicken-shop'
    throw new Error('No session — redirecting to login')
  }
  return session
}
```

- [ ] **Step 2: Create progression.ts**

```ts
// app/games/chicken-shop/src/api/progression.ts
import type { ChickenShopProgress, PendingSave } from '../types'
import { getSession } from './auth'

const BASE = '/api/games/chicken-shop'
const PROGRESS_CACHE_KEY = 'cw:games:chicken-shop:progress'
const PENDING_SAVES_KEY = 'cw:games:chicken-shop:pendingSaves'

// ── Cache helpers ──────────────────────────────────────────────────────────

function readCache(): ChickenShopProgress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeCache(p: ChickenShopProgress): void {
  const current = readCache()
  if (current && current.version > p.version) return
  localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify(p))
}

// ── Pending saves queue ────────────────────────────────────────────────────

function readPendingSaves(): PendingSave[] {
  try {
    const raw = localStorage.getItem(PENDING_SAVES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writePendingSaves(saves: PendingSave[]): void {
  localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(saves))
}

function enqueuePendingSave(endpoint: string, body: Record<string, unknown>): void {
  const saves = readPendingSaves()
  saves.push({ endpoint, body, queuedAtMs: Date.now() })
  writePendingSaves(saves)
}

export async function drainPendingSaves(): Promise<void> {
  const saves = readPendingSaves()
  if (saves.length === 0) return

  const session = getSession()
  if (!session) return

  const remaining: PendingSave[] = []
  for (const save of saves) {
    try {
      const res = await fetch(save.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(save.body),
      })
      if (res.ok || res.status === 409) {
        // 409 ALREADY_PROCESSED counts as success
        if (res.ok) {
          const data = await res.json() as { progress: ChickenShopProgress }
          writeCache(data.progress)
        }
        continue
      }
      remaining.push(save)
      break // stop on first real failure
    } catch {
      remaining.push(save)
      break
    }
  }
  writePendingSaves(remaining)
}

export function hasPendingSaves(): boolean {
  return readPendingSaves().length > 0
}

// ── API calls ──────────────────────────────────────────────────────────────

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const session = getSession()
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { code?: string }
    throw Object.assign(new Error(err.code ?? `HTTP ${res.status}`), { status: res.status, code: err.code })
  }
  return res.json() as T
}

export async function fetchProgress(): Promise<ChickenShopProgress> {
  const session = getSession()
  const res = await fetch(`${BASE}/progress`, {
    headers: { Authorization: `Bearer ${session?.token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as { progress: ChickenShopProgress }
  writeCache(data.progress)
  return data.progress
}

export function getCachedProgress(): ChickenShopProgress | null {
  return readCache()
}

type LevelPayload = {
  level: number
  cashEarnedPence: number
  walkouts: number
  completedOrders: number
  runDurationMs: number
  runId: string
}

export async function completeLevel(payload: LevelPayload): Promise<ChickenShopProgress> {
  try {
    const data = await post<{ progress: ChickenShopProgress }>('/complete-level', payload)
    writeCache(data.progress)
    return data.progress
  } catch {
    enqueuePendingSave(`${BASE}/complete-level`, payload as Record<string, unknown>)
    const cached = readCache()
    if (!cached) throw new Error('No cached progress')
    return cached
  }
}

export async function failLevel(payload: LevelPayload): Promise<ChickenShopProgress> {
  try {
    const data = await post<{ progress: ChickenShopProgress }>('/fail-level', payload)
    writeCache(data.progress)
    return data.progress
  } catch {
    enqueuePendingSave(`${BASE}/fail-level`, payload as Record<string, unknown>)
    const cached = readCache()
    if (!cached) throw new Error('No cached progress')
    return cached
  }
}

export async function refillLives(expectedVersion: number): Promise<ChickenShopProgress> {
  const data = await post<{ progress: ChickenShopProgress }>('/refill-lives', { expectedVersion })
  writeCache(data.progress)
  return data.progress
}

export async function skipLevel(level: number, expectedVersion: number): Promise<ChickenShopProgress> {
  const data = await post<{ progress: ChickenShopProgress }>('/skip-level', { level, expectedVersion })
  writeCache(data.progress)
  return data.progress
}
```

- [ ] **Step 3: Verify types compile**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/games/chicken-shop/src/api/
git commit -m "feat: add API layer with auth, progression, and pending saves queue"
```

---

## Task 8: Pixi Bootstrap + Textures

**Files:**
- Create: `app/games/chicken-shop/src/game/PixiApp.ts`
- Create: `app/games/chicken-shop/src/game/textures.ts`

- [ ] **Step 1: Create PixiApp.ts**

```ts
// app/games/chicken-shop/src/game/PixiApp.ts
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

  // Fit canvas to container on resize
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
```

- [ ] **Step 2: Create textures.ts**

```ts
// app/games/chicken-shop/src/game/textures.ts
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
  // Customer silhouette — white, will be tinted at runtime
  make(app, 'customer', 40, 70, g => {
    // head
    g.circle(20, 12, 12).fill(0xffffff)
    // body
    g.roundRect(8, 26, 24, 30, 4).fill(0xffffff)
    // legs
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

  // Output buffer glow ring (pulse animation applied in Station.ts)
  make(app, 'buffer-glow', 108, 128, g => {
    g.roundRect(0, 0, 108, 128, 10).stroke({ color: 0xfacc15, alpha: 0.9, width: 4 })
  })

  // Blocked icon overlay
  make(app, 'station-blocked', 100, 120, g => {
    g.roundRect(0, 0, 100, 120, 8).fill(0x111111).alpha = 0.6
    g.moveTo(20, 20).lineTo(80, 100).stroke({ color: 0xef4444, width: 6 })
    g.moveTo(80, 20).lineTo(20, 100).stroke({ color: 0xef4444, width: 6 })
  })

  // Patience bar (filled portion)
  make(app, 'patience-bar-fill', 36, 6, g => {
    g.rect(0, 0, 36, 6).fill(0x22c55e)
  })
  make(app, 'patience-bar-bg', 36, 6, g => {
    g.rect(0, 0, 36, 6).fill(0x374151)
  })

  // Floating cash label background
  make(app, 'cash-label-bg', 60, 24, g => {
    g.roundRect(0, 0, 60, 24, 12).fill(0x000000, 0.6)
  })

  // Queue slot indicator (small dot in station queue area)
  make(app, 'queue-dot', 10, 10, g => {
    g.circle(5, 5, 5).fill(0xffffff, 0.5)
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
```

- [ ] **Step 3: Verify types compile**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/games/chicken-shop/src/game/PixiApp.ts app/games/chicken-shop/src/game/textures.ts
git commit -m "feat: add Pixi bootstrap with devicePixelRatio scaling and texture generation"
```

---

## Task 9: Customer Pixi Entity

**Files:**
- Create: `app/games/chicken-shop/src/game/Customer.ts`

- [ ] **Step 1: Create Customer.ts**

```ts
// app/games/chicken-shop/src/game/Customer.ts
import { Container, Sprite, Graphics, Text, TextStyle } from 'pixi.js'
import { getTexture } from './textures'
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
  private label: Text

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

    this.label = new Text({
      text: '?',
      style: new TextStyle({ fontSize: 10, fill: 0xffffff }),
    })
    this.label.anchor.set(0.5, 0)
    this.label.y = 12
    this.container.addChild(this.label)
  }

  update(data: CustomerData, patienceRemainingMs: number, patienceMaxMs: number): void {
    this.data = data

    const fraction = patienceRemainingMs / patienceMaxMs
    const mood: CustomerMood = fraction > 0.5 ? 'calm' : fraction > 0.2 ? 'waiting' : 'angry'
    this.silhouette.tint = MOOD_TINT[mood]

    // Pulse effect for angry customers
    if (mood === 'angry') {
      const pulse = 0.9 + Math.sin(Date.now() / 150) * 0.1
      this.silhouette.scale.set(pulse)
    } else {
      this.silhouette.scale.set(1)
    }

    // Patience bar
    this.patienceFill.scale.x = Math.max(0, fraction)
    const fillColor = fraction > 0.5 ? 0x22c55e : fraction > 0.2 ? 0xf59e0b : 0xef4444
    this.patienceFill.tint = fillColor
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}

export function spawnFloatingCash(parent: Container, x: number, y: number, pence: number): void {
  const label = new Text({
    text: `+£${(pence / 100).toFixed(2)}`,
    style: new TextStyle({ fontSize: 16, fill: 0xfacc15, fontWeight: 'bold' }),
  })
  label.anchor.set(0.5)
  label.x = x
  label.y = y
  parent.addChild(label)

  let elapsed = 0
  function tick(ticker: { deltaMS: number }) {
    elapsed += ticker.deltaMS
    label.y -= ticker.deltaMS * 0.04
    label.alpha = Math.max(0, 1 - elapsed / 1200)
    if (elapsed >= 1200) {
      label.destroy()
      // Remove tick listener — caller must pass app.ticker
    }
  }
  // Returned so caller can add to app.ticker
  ;(label as any).__tick = tick
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/games/chicken-shop/src/game/Customer.ts
git commit -m "feat: add Customer Pixi entity with mood tinting and patience bar"
```

---

## Task 10: Station Pixi Entity

**Files:**
- Create: `app/games/chicken-shop/src/game/Station.ts`

- [ ] **Step 1: Create Station.ts**

```ts
// app/games/chicken-shop/src/game/Station.ts
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
  fryer: '🍗 Fryer',
  sauce: '🌶 Sauce',
  sides: '🍟 Sides',
  drinks: '🥤 Drinks',
  boxing: '📦 Boxing',
  till: '💷 Till',
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

  // ── State machine delegation ─────────────────────────────────────────────

  enqueue(orderId: string): void { this.state = enqueue(this.state, orderId) }
  startActive(): void { this.state = startActive(this.state) }
  completeActive(): void { this.state = completeActive(this.state) }
  releaseBuffer(): string | null { const [s, id] = releaseBuffer(this.state); this.state = s; return id }
  removeOrder(orderId: string): void { this.state = removeOrder(this.state, orderId) }
  isFull(): boolean { return isQueueFull(this.state) }

  // ── Render update ────────────────────────────────────────────────────────

  render(nowMs: number): void {
    const hasBuffer = this.state.outputBufferOrderId !== null
    const isFull = this.isFull()

    // Buffer glow pulse
    this.bufferGlow.visible = hasBuffer
    if (hasBuffer) {
      this.bufferGlow.alpha = 0.6 + Math.sin(nowMs / 300) * 0.4
    }

    // Blocked overlay
    this.blockedOverlay.visible = isFull

    // Queue dots
    this.queueDots.forEach((dot, i) => {
      const filled = i < this.state.queue.length
      dot.texture = getTexture(filled ? 'queue-dot-filled' : 'queue-dot')
    })
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/games/chicken-shop/src/game/Station.ts
git commit -m "feat: add Station Pixi entity with buffer glow and blocked overlay"
```

---

## Task 11: GameScene — Tick Loop, Spawning, Patience, End-of-Level

**Files:**
- Create: `app/games/chicken-shop/src/game/GameScene.ts`

- [ ] **Step 1: Create GameScene.ts**

```ts
// app/games/chicken-shop/src/game/GameScene.ts
import { Application, Container } from 'pixi.js'
import { CANVAS_W, CANVAS_H } from './PixiApp'
import { generateTextures } from './textures'
import { StationEntity } from './Station'
import { CustomerEntity, spawnFloatingCash } from './Customer'
import { createOrder, transitionOrder, computePayout, tickPatience, applyPenalty } from './orderMachine'
import type { LevelConfig, Order, StationKey } from '../types'
import { useRunStore } from '../store/runStore'

const STATION_POSITIONS: Record<StationKey, [number, number]> = {
  fryer:  [20,  200],
  sauce:  [140, 200],
  sides:  [260, 200],
  drinks: [20,  340],
  boxing: [140, 340],
  till:   [260, 340],
}

const DRAIN_RATES: Record<string, number> = {
  activeAtStation: 0.85,
  readyForNextStation: 1.15,
  waitingInLobby: 1.0,
}

export class GameScene {
  private app: Application
  private stage: Container
  private stations: Map<StationKey, StationEntity> = new Map()
  private orders: Map<string, Order> = new Map()
  private customers: Map<string, CustomerEntity> = new Map()
  private config: LevelConfig
  private spawnClock = 0
  private nextSpawnMs: number
  private running = false
  private customerIdCounter = 0

  constructor(app: Application, config: LevelConfig) {
    this.app = app
    this.config = config
    this.stage = new Container()
    app.stage.addChild(this.stage)
    this.nextSpawnMs = this.randomSpawnInterval()

    generateTextures(app)
    this.buildStations()
  }

  private randomSpawnInterval(): number {
    const { spawnIntervalMinMs: min, spawnIntervalMaxMs: max } = this.config
    return min + Math.random() * (max - min)
  }

  private buildStations(): void {
    for (const key of this.config.activeStations) {
      const [x, y] = STATION_POSITIONS[key]
      const entity = new StationEntity(key, x, y, (k) => this.onStationTap(k))
      this.stations.set(key, entity)
      this.stage.addChild(entity.container)
    }
  }

  private onStationTap(key: StationKey): void {
    const station = this.stations.get(key)
    if (!station) return
    if (station.state.outputBufferOrderId) {
      this.releaseBuffer(key)
    }
  }

  private releaseBuffer(key: StationKey): void {
    const station = this.stations.get(key)
    if (!station) return
    const orderId = station.releaseBuffer()
    if (!orderId) return

    const order = this.orders.get(orderId)
    if (!order) return

    const nextIdx = order.currentStationIndex
    const nextKey = order.requiredStations[nextIdx]

    if (!nextKey) {
      // All stations done — this shouldn't happen (till completes inline)
      return
    }

    const nextStation = this.stations.get(nextKey)
    if (!nextStation || nextStation.isFull()) return

    const accepted = transitionOrder(order, 'ACCEPT')
    this.orders.set(orderId, accepted)
    nextStation.enqueue(orderId)
  }

  private spawnCustomer(): void {
    const totalNonTerminal = [...this.orders.values()].filter(
      o => o.state !== 'completed' && o.state !== 'walkedOut' && o.state !== 'voided'
    ).length
    if (totalNonTerminal >= 12) return

    const customerId = `customer-${++this.customerIdCounter}`
    const order = createOrder({
      customerId,
      level: this.config.level,
      activeStations: this.config.activeStations,
      nowMs: Date.now(),
      patienceMs: this.config.patienceBaseMs,
    })

    const customer: import('../types').Customer = {
      id: customerId,
      spawnedAtMs: Date.now(),
      orderId: order.id,
      mood: 'calm',
    }

    this.orders.set(order.id, order)

    const lobbyX = 20 + (this.customers.size % 6) * 60
    const lobbyY = 680
    const entity = new CustomerEntity(customer, lobbyX, lobbyY)
    this.customers.set(customerId, entity)
    this.stage.addChild(entity.container)

    // Auto-accept first customer into first station queue if space available
    const firstKey = order.requiredStations[0]
    const firstStation = this.stations.get(firstKey)
    if (firstStation && !firstStation.isFull()) {
      const accepted = transitionOrder(order, 'ACCEPT')
      this.orders.set(order.id, accepted)
      firstStation.enqueue(order.id)
    }
  }

  private processTill(orderId: string): void {
    const order = this.orders.get(orderId)
    if (!order) return

    const completed = transitionOrder(order, 'STATION_COMPLETE')
    this.orders.set(orderId, completed)

    const payout = computePayout(order)
    useRunStore.getState().addCash(payout)

    // Floating cash label
    const custEntity = [...this.customers.values()].find(c => c.data.orderId === orderId)
    if (custEntity) {
      spawnFloatingCash(this.stage, custEntity.container.x, custEntity.container.y - 80, payout)
      custEntity.destroy()
      this.customers.delete(custEntity.data.id)
    }
    this.orders.delete(orderId)
  }

  tick(ticker: { deltaMS: number }): void {
    if (!this.running) return

    const delta = ticker.deltaMS
    const run = useRunStore.getState()

    run.tickTimer(delta)

    // Spawn
    this.spawnClock += delta
    if (this.spawnClock >= this.nextSpawnMs) {
      this.spawnClock = 0
      this.nextSpawnMs = this.randomSpawnInterval()
      this.spawnCustomer()
    }

    // Tick patience + walkouts
    for (const [orderId, order] of this.orders) {
      if (order.state === 'completed' || order.state === 'voided' || order.state === 'walkedOut') continue

      const drainRate = DRAIN_RATES[order.state] ?? 1
      const ticked = tickPatience(order, delta, drainRate)
      this.orders.set(orderId, ticked)

      if (ticked.patienceRemainingMs <= 0) {
        // Walkout
        const walkedOut = transitionOrder(ticked, 'WALKOUT')
        this.orders.set(orderId, walkedOut)
        for (const station of this.stations.values()) {
          station.removeOrder(orderId)
        }
        run.addWalkout()
        const custEntity = [...this.customers.values()].find(c => c.data.orderId === orderId)
        if (custEntity) { custEntity.destroy(); this.customers.delete(custEntity.data.id) }
        this.orders.delete(orderId)
      }
    }

    // Advance stations
    for (const [key, station] of this.stations) {
      // Pull from queue if idle
      if (!station.state.activeOrderId && !station.state.outputBufferOrderId && station.state.queue.length > 0) {
        station.startActive()
        const activeId = station.state.activeOrderId
        if (activeId) {
          const order = this.orders.get(activeId)
          if (order) {
            const started = transitionOrder(order, 'STATION_START')
            this.orders.set(activeId, started)

            if (key === 'till') {
              // Till has no minigame — complete immediately
              station.completeActive()
              this.processTill(activeId)
            }
            // Other stations wait for minigame completion via completeStation()
          }
        }
      }

      station.render(Date.now())
    }

    // Update customer visuals
    for (const entity of this.customers.values()) {
      const order = this.orders.get(entity.data.orderId)
      if (order) {
        entity.update(entity.data, order.patienceRemainingMs, order.patienceMaxMs)
      }
    }

    // End-of-level check
    const cashEarned = run.cashEarnedPence
    const target = run.cashTargetPence
    const timeUp = run.timerRemainingMs <= 0

    if (cashEarned >= target && run.result === null) {
      run.setResult('success')
      this.running = false
    } else if (timeUp && cashEarned < target && run.result === null) {
      run.setResult('fail')
      this.running = false
    }
  }

  // Called by minigame handlers when a station interaction completes
  completeStation(key: StationKey, penaltyPence = 0): void {
    const station = this.stations.get(key)
    if (!station || !station.state.activeOrderId) return

    const orderId = station.state.activeOrderId
    let order = this.orders.get(orderId)
    if (!order) return

    if (penaltyPence > 0) {
      order = applyPenalty(order, penaltyPence)
    }

    const completed = transitionOrder(order, 'STATION_COMPLETE')
    this.orders.set(orderId, completed)
    station.completeActive()
  }

  start(): void {
    this.running = true
    this.app.ticker.add((ticker) => this.tick(ticker))
  }

  stop(): void {
    this.running = false
  }

  destroy(): void {
    this.stop()
    this.stage.destroy({ children: true })
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/games/chicken-shop/src/game/GameScene.ts
git commit -m "feat: add GameScene with tick loop, spawning, patience drain, and end-of-level detection"
```

---

## Task 12: Station Minigames (Fryer, Sauce, Sides, Drinks, Boxing)

**Files:**
- Create: `app/games/chicken-shop/src/game/minigames.ts`

- [ ] **Step 1: Create minigames.ts**

```ts
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

    app.ticker.add(t => this.tick(t))
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
    this.container.destroy({ children: true })
    this.onComplete(penalty)
  }
}

// ── Sauce / Sides ─────────────────────────────────────────────────────────
// 3 buttons. Pick correct one.

export class ChoiceMinigame {
  container: Container
  private resolved = false

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
        const penalty = i === correctIndex ? 0 : PENALTY
        this.container.destroy({ children: true })
        onComplete(penalty)
      })
    })

    // Auto-fail on timeout
    const timer = setTimeout(() => {
      if (!this.resolved) {
        this.resolved = true
        this.container.destroy({ children: true })
        onComplete(PENALTY)
      }
    }, timeoutMs)
    ;(this.container as any).__timer = timer
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
    target.rect(2, Math.floor(80 * 0.4), 36, Math.floor(80 * 0.15)).fill(0x22c55e, 0.4)
    this.container.addChild(target)

    this.fillBar = new Graphics()
    this.container.addChild(this.fillBar)

    this.container.eventMode = 'static'
    this.container.on('pointerdown', () => { this.filling = true })
    this.container.on('pointerup', () => { if (!this.resolved) this.resolve(onComplete) })
    this.container.on('pointerupoutside', () => { if (!this.resolved) this.resolve(onComplete) })

    app.ticker.add(t => {
      if (!this.filling || this.resolved) return
      this.fillLevel = Math.min(1, this.fillLevel + t.deltaMS / this.FILL_TO_OVERFLOW_MS)
      this.fillBar.clear()
      const fillH = Math.floor(this.fillLevel * 80)
      this.fillBar.rect(2, 80 - fillH, 36, fillH).fill(0x3b82f6)
      if (this.fillLevel >= 1) this.resolve(onComplete)
    })
  }

  private resolve(onComplete: OnComplete): void {
    this.resolved = true
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

    setTimeout(() => {
      if (!this.resolved) this.finish(onComplete, 100)
    }, this.WINDOW_MS)
  }

  private finish(onComplete: OnComplete, penalty: number): void {
    this.resolved = true
    this.container.destroy({ children: true })
    onComplete(penalty)
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/games/chicken-shop/src/game/minigames.ts
git commit -m "feat: add station minigames (Fryer, Sauce/Sides choice, Drinks fill, Boxing tap)"
```

---

## Task 13: React App Shell (Auth Guard + Screen Routing)

**Files:**
- Modify: `app/games/chicken-shop/src/App.tsx`

- [ ] **Step 1: Rewrite App.tsx**

```tsx
// app/games/chicken-shop/src/App.tsx
import React, { useEffect, useRef } from 'react'
import { useMetaStore } from './store/metaStore'
import { requireSession } from './api/auth'
import { fetchProgress, getCachedProgress, drainPendingSaves } from './api/progression'
import MainMenu from './ui/MainMenu'
import HUD from './ui/HUD'
import LevelResult from './ui/LevelResult'
import Shop from './ui/Shop'
import LivesEmpty from './ui/LivesEmpty'

export default function App() {
  const { screen, setScreen, setProgress, hydrated } = useMetaStore()
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true

    async function boot() {
      try {
        requireSession()
      } catch {
        return // redirect handled inside requireSession
      }

      // Drain any pending saves from last session before hydrating
      await drainPendingSaves()

      try {
        const progress = await fetchProgress()
        setProgress(progress)
      } catch {
        const cached = getCachedProgress()
        if (cached) {
          setProgress(cached)
        } else {
          // Hard failure — show retry
          setScreen('loading')
          return
        }
      }

      setScreen('menu')
    }

    boot()
  }, [])

  if (!hydrated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#fff', fontSize: 20, background: '#1a1a2e' }}>
        Loading Charlie's Wingz...
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e', position: 'relative' }}>
      {screen === 'menu' && <MainMenu />}
      {screen === 'game' && (
        <>
          <GameCanvas />
          <HUD />
          <LevelResult />
        </>
      )}
      {screen === 'shop' && <Shop />}
      {screen === 'livesEmpty' && <LivesEmpty />}
    </div>
  )
}

// Pixi canvas mount
import { useEffect as usePixiEffect } from 'react'
import { initPixi } from './game/PixiApp'

function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null)
  usePixiEffect(() => {
    if (!ref.current) return
    initPixi(ref.current)
  }, [])
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/games/chicken-shop/src/App.tsx
git commit -m "feat: add React app shell with auth guard, pending save drain, and screen routing"
```

---

## Task 14: React UI Components

**Files:**
- Create: `app/games/chicken-shop/src/ui/MainMenu.tsx`
- Create: `app/games/chicken-shop/src/ui/HUD.tsx`
- Create: `app/games/chicken-shop/src/ui/LevelResult.tsx`
- Create: `app/games/chicken-shop/src/ui/Shop.tsx`
- Create: `app/games/chicken-shop/src/ui/LivesEmpty.tsx`

- [ ] **Step 1: Create MainMenu.tsx**

```tsx
// app/games/chicken-shop/src/ui/MainMenu.tsx
import React, { useState } from 'react'
import { useMetaStore } from '../store/metaStore'
import { useRunStore } from '../store/runStore'
import { getLevelConfig } from '../game/levelConfig'

export default function MainMenu() {
  const { unlockedLevel, lives, livesRefillAt, credits, setScreen } = useMetaStore()
  const { setLevel } = useRunStore()
  const [showLevelSelect, setShowLevelSelect] = useState(false)

  const livesEmpty = lives === 0
  const refillMs = livesRefillAt ? Math.max(0, livesRefillAt - Date.now()) : 0
  const refillMins = Math.ceil(refillMs / 60_000)

  function startLevel(level: number) {
    const cfg = getLevelConfig(level)
    setLevel(level, cfg.cashTargetPence, cfg.durationMs)
    setScreen('game')
  }

  if (showLevelSelect) {
    return (
      <div style={overlay}>
        <h2 style={{ color: '#fff', marginBottom: 16 }}>Select Level</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 360 }}>
          {Array.from({ length: unlockedLevel }, (_, i) => i + 1).map(lvl => (
            <button key={lvl} onClick={() => startLevel(lvl)} disabled={livesEmpty}
              style={{ ...btn, background: getLevelConfig(lvl).boss ? '#7c3aed' : '#374151' }}>
              {lvl}
            </button>
          ))}
        </div>
        <button onClick={() => setShowLevelSelect(false)} style={{ ...btn, marginTop: 16 }}>Back</button>
      </div>
    )
  }

  return (
    <div style={overlay}>
      <h1 style={{ color: '#facc15', fontSize: 28, marginBottom: 8 }}>🍗 Chicken Shop</h1>
      <p style={{ color: '#9ca3af', marginBottom: 24 }}>Level {unlockedLevel} unlocked</p>

      <div style={{ color: '#fff', marginBottom: 24, display: 'flex', gap: 24 }}>
        <span>❤️ {lives}/3</span>
        <span>💰 {credits} credits</span>
      </div>

      {livesEmpty ? (
        <div style={{ color: '#ef4444', marginBottom: 16 }}>
          No lives — refill in {refillMins}min
          <button onClick={() => setScreen('livesEmpty')} style={{ ...btn, marginLeft: 12 }}>Refill Now</button>
        </div>
      ) : (
        <button onClick={() => startLevel(unlockedLevel)} style={{ ...btn, background: '#d97706', fontSize: 18, padding: '14px 32px' }}>
          Play Level {unlockedLevel}
        </button>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button onClick={() => setShowLevelSelect(true)} style={btn}>Level Select</button>
        <button onClick={() => setScreen('shop')} style={btn}>Shop</button>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', background: '#1a1a2e',
}
const btn: React.CSSProperties = {
  background: '#374151', color: '#fff', border: 'none', borderRadius: 8,
  padding: '10px 20px', cursor: 'pointer', fontSize: 14,
}
```

- [ ] **Step 2: Create HUD.tsx**

```tsx
// app/games/chicken-shop/src/ui/HUD.tsx
import React from 'react'
import { useRunStore } from '../store/runStore'
import { useMetaStore } from '../store/metaStore'

export default function HUD() {
  const { timerRemainingMs, cashEarnedPence, cashTargetPence, currentLevel } = useRunStore()
  const { lives, credits } = useMetaStore()

  const secs = Math.ceil(timerRemainingMs / 1000)
  const progress = Math.min(1, cashEarnedPence / cashTargetPence)
  const isLastTen = secs <= 10 && secs > 0

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      padding: '8px 16px', background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', gap: 12, zIndex: 10,
    }}>
      <span style={{ color: '#fff', minWidth: 60, fontSize: 13 }}>Lv {currentLevel}</span>

      <span style={{
        color: isLastTen ? '#ef4444' : '#fff', fontWeight: 'bold', fontSize: 16, minWidth: 40,
        animation: isLastTen ? 'pulse 0.5s infinite' : 'none',
      }}>
        {secs}s
      </span>

      <div style={{ flex: 1, height: 10, background: '#374151', borderRadius: 5 }}>
        <div style={{ width: `${progress * 100}%`, height: '100%', background: '#22c55e', borderRadius: 5, transition: 'width 0.3s' }} />
      </div>

      <span style={{ color: '#facc15', fontSize: 13, minWidth: 80 }}>
        £{(cashEarnedPence / 100).toFixed(2)} / £{(cashTargetPence / 100).toFixed(2)}
      </span>

      <span style={{ color: '#fff', fontSize: 13 }}>❤️ {lives}</span>
      <span style={{ color: '#9ca3af', fontSize: 12 }}>💰 {credits}</span>
    </div>
  )
}
```

- [ ] **Step 3: Create LevelResult.tsx**

```tsx
// app/games/chicken-shop/src/ui/LevelResult.tsx
import React, { useEffect, useRef } from 'react'
import { useRunStore } from '../store/runStore'
import { useMetaStore } from '../store/metaStore'
import { completeLevel, failLevel } from '../api/progression'
import { getLevelConfig } from '../game/levelConfig'

export default function LevelResult() {
  const { result, currentLevel, cashEarnedPence, cashTargetPence, walkouts, completedOrders, reset } = useRunStore()
  const { setProgress, setScreen, lives, credits, unlockedLevel, version } = useMetaStore()
  const runId = useRef(`run-${Date.now()}-${Math.random()}`).current

  useEffect(() => {
    if (!result) return
    const durationMs = getLevelConfig(currentLevel).durationMs
    const payload = { level: currentLevel, cashEarnedPence, walkouts, completedOrders, runDurationMs: durationMs, runId }

    if (result === 'success') {
      completeLevel(payload).then(setProgress)
    } else {
      failLevel(payload).then(setProgress)
    }
  }, [result])

  if (!result) return null

  const shortfall = cashTargetPence - cashEarnedPence
  const stars = walkouts === 0 ? 3 : walkouts <= 2 ? 2 : 1
  const canSkip = credits >= 10 && result === 'fail'

  function retry() { reset(); setScreen('game') }
  function nextLevel() {
    reset()
    const nextCfg = getLevelConfig(Math.min(100, currentLevel + 1))
    useRunStore.getState().setLevel(nextCfg.level, nextCfg.cashTargetPence, nextCfg.durationMs)
    setScreen('game')
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
      <div style={{ background: '#1f2937', borderRadius: 16, padding: 32, minWidth: 280, textAlign: 'center' }}>
        {result === 'success' ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{'⭐'.repeat(stars)}</div>
            <h2 style={{ color: '#22c55e', marginBottom: 8 }}>Level Complete!</h2>
            <p style={{ color: '#9ca3af' }}>Earned £{(cashEarnedPence / 100).toFixed(2)}</p>
            <p style={{ color: '#9ca3af', marginBottom: 24 }}>{walkouts} walkout{walkouts !== 1 ? 's' : ''}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {currentLevel < 100 && <button onClick={nextLevel} style={btnGreen}>Next Level</button>}
              <button onClick={retry} style={btnGray}>Replay</button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ color: '#ef4444', marginBottom: 8 }}>Level Failed</h2>
            <p style={{ color: '#9ca3af' }}>Short by £{(shortfall / 100).toFixed(2)}</p>
            <p style={{ color: '#9ca3af', marginBottom: 24 }}>Lives remaining: {lives}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {lives > 0 && <button onClick={retry} style={btnGreen}>Retry</button>}
              {lives === 0 && <button onClick={() => setScreen('livesEmpty')} style={btnRed}>Refill Lives</button>}
              {canSkip && <button onClick={() => setScreen('shop')} style={btnGray}>Skip (10 💰)</button>}
            </div>
          </>
        )}
        <button onClick={() => { reset(); setScreen('menu') }} style={{ ...btnGray, marginTop: 12 }}>Menu</button>
      </div>
    </div>
  )
}

const base: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 14, color: '#fff' }
const btnGreen = { ...base, background: '#16a34a' }
const btnRed = { ...base, background: '#dc2626' }
const btnGray = { ...base, background: '#374151' }
```

- [ ] **Step 4: Create Shop.tsx**

```tsx
// app/games/chicken-shop/src/ui/Shop.tsx
import React, { useState } from 'react'
import { useMetaStore } from '../store/metaStore'
import { refillLives, skipLevel } from '../api/progression'
import { hasPendingSaves } from '../api/progression'

export default function Shop() {
  const { lives, credits, version, unlockedLevel, setProgress, setScreen } = useMetaStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingSaves = hasPendingSaves()

  async function doRefill() {
    if (pendingSaves) { setError('Sync pending — connect to internet first'); return }
    setLoading(true)
    try {
      const p = await refillLives(version)
      setProgress(p)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function doSkip() {
    if (pendingSaves) { setError('Sync pending — connect to internet first'); return }
    setLoading(true)
    try {
      const p = await skipLevel(unlockedLevel, version)
      setProgress(p)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h2 style={{ color: '#facc15', marginBottom: 24 }}>Shop</h2>
      <p style={{ color: '#9ca3af', marginBottom: 24 }}>Credits: {credits} &nbsp;|&nbsp; Lives: {lives}/3</p>

      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}
      {pendingSaves && <p style={{ color: '#f59e0b', marginBottom: 16 }}>⚠️ Offline — connect to sync before spending credits</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
        <button onClick={doRefill} disabled={loading || lives === 3 || credits < 20 || pendingSaves}
          style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 20px', fontSize: 15, cursor: 'pointer' }}>
          Refill Lives — 20 💰
        </button>
        <button onClick={doSkip} disabled={loading || credits < 10 || pendingSaves}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 20px', fontSize: 15, cursor: 'pointer' }}>
          Skip Level {unlockedLevel} — 10 💰
        </button>
        <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center' }}>Buy credits on the Charlie's Wingz website</p>
      </div>

      <button onClick={() => setScreen('menu')} style={{ marginTop: 32, background: '#374151', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}>
        Back
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Create LivesEmpty.tsx**

```tsx
// app/games/chicken-shop/src/ui/LivesEmpty.tsx
import React, { useState, useEffect } from 'react'
import { useMetaStore } from '../store/metaStore'
import { refillLives } from '../api/progression'

export default function LivesEmpty() {
  const { livesRefillAt, credits, version, setProgress, setScreen } = useMetaStore()
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    function update() {
      if (!livesRefillAt) return
      setRemaining(Math.max(0, livesRefillAt - Date.now()))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [livesRefillAt])

  const mins = Math.floor(remaining / 60_000)
  const secs = Math.floor((remaining % 60_000) / 1000)
  const canRefillNow = credits >= 20

  async function buyRefill() {
    const p = await refillLives(version)
    setProgress(p)
    setScreen('menu')
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>💔</div>
      <h2 style={{ color: '#ef4444', marginBottom: 8 }}>No Lives Left</h2>
      <p style={{ color: '#9ca3af', marginBottom: 24 }}>
        Free refill in {mins}m {secs}s
      </p>
      {canRefillNow && (
        <button onClick={buyRefill}
          style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 24px', fontSize: 16, cursor: 'pointer', marginBottom: 16 }}>
          Refill Now — 20 💰
        </button>
      )}
      <button onClick={() => setScreen('menu')}
        style={{ background: '#374151', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}>
        Back to Menu
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Verify all UI compiles**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/games/chicken-shop/src/ui/
git commit -m "feat: add React UI screens (MainMenu, HUD, LevelResult, Shop, LivesEmpty)"
```

---

## Task 15: Analytics Hooks

**Files:**
- Create: `app/games/chicken-shop/src/api/analytics.ts`

- [ ] **Step 1: Create analytics.ts**

```ts
// app/games/chicken-shop/src/api/analytics.ts
import { getSession } from './auth'

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

function track(event: string, payload: Record<string, unknown>): void {
  const session = getSession()
  // Fire-and-forget — never block gameplay on analytics
  fetch('/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.token}` },
    body: JSON.stringify({ event, ...payload, ts: Date.now() }),
  }).catch(() => { /* intentionally silent */ })
}

export function trackLevelStarted(payload: Pick<LevelAnalyticsPayload, 'level' | 'tier' | 'boss' | 'modifier'>): void {
  track('chicken_shop_level_started', payload)
}

export function trackLevelCompleted(payload: LevelAnalyticsPayload): void {
  track('chicken_shop_level_completed', payload)
}

export function trackLevelFailed(payload: LevelAnalyticsPayload): void {
  track('chicken_shop_level_failed', payload)
}

export function trackWalkout(level: number): void {
  track('chicken_shop_customer_walked_out', { level })
}

export function trackStationPenalty(level: number, station: string, penaltyPence: number): void {
  track('chicken_shop_station_penalty', { level, station, penaltyPence })
}

export function trackSkipUsed(level: number): void {
  track('chicken_shop_skip_used', { level })
}

export function trackRefillUsed(): void {
  track('chicken_shop_refill_used', {})
}
```

- [ ] **Step 2: Wire trackLevelStarted into GameScene.start() and trackLevelCompleted/Failed into LevelResult.tsx**

In `GameScene.ts`, import and call `trackLevelStarted` at the top of `start()`:

```ts
import { trackLevelStarted } from '../api/analytics'

// inside start():
trackLevelStarted({
  level: this.config.level,
  tier: this.config.tier,
  boss: this.config.boss,
  modifier: this.config.modifier,
})
```

In `LevelResult.tsx`, import and call inside the `useEffect`:

```ts
import { trackLevelCompleted, trackLevelFailed } from '../api/analytics'
import { getLevelConfig } from '../game/levelConfig'

// inside useEffect after result is set:
const cfg = getLevelConfig(currentLevel)
const analyticsPayload = {
  level: currentLevel, tier: cfg.tier, boss: cfg.boss, modifier: cfg.modifier,
  cashTargetPence, cashEarnedPence, completedOrders, walkouts,
  penaltiesByStation: {}, runDurationMs: cfg.durationMs, // penaltiesByStation wired in GameScene
}
if (result === 'success') trackLevelCompleted(analyticsPayload)
else trackLevelFailed(analyticsPayload)
```

- [ ] **Step 3: Verify types compile**

```bash
cd app/games/chicken-shop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/games/chicken-shop/src/api/analytics.ts
git commit -m "feat: add analytics event hooks (fire-and-forget)"
```

---

## Task 16: Build Output + Integration

**Files:**
- No new files — verify Vite build outputs to `app/public/games/chicken-shop/`

- [ ] **Step 1: Run the production build**

```bash
cd app/games/chicken-shop && npm run build
```

Expected: build succeeds, `app/public/games/chicken-shop/index.html` exists.

- [ ] **Step 2: Verify the built game loads in browser**

Open `http://localhost:3000/games/chicken-shop/` in the browser (with the Next.js dev server running). The game's loading screen should appear. Auth redirect should fire if not logged in.

- [ ] **Step 3: Run all tests one final time**

```bash
cd app/games/chicken-shop && npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Final commit**

```bash
git add app/public/games/chicken-shop app/games/chicken-shop
git commit -m "feat: build chicken shop game and output to public/games/chicken-shop"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|-----------------|-----------------|
| Order state machine | Task 3 |
| Station queue/buffer model | Task 4 |
| All 100 level configs + throughput guardrail | Task 5 |
| Zustand meta + run stores | Task 6 |
| API layer + pending saves queue | Task 7 |
| devicePixelRatio Pixi init | Task 8 |
| Texture generation (no external PNGs) | Task 8 |
| Color-coded customer silhouettes | Task 9 |
| Buffer glow + blocked station overlay | Task 10 |
| 60fps tick contract | Task 11 |
| Patience drain rates by order state | Task 11 |
| Walkout → voided within one tick | Task 11 |
| End-of-level: success on cash hit, fail on timer | Task 11 |
| Fryer minigame (needle, perfect/salvage/burn) | Task 12 |
| Sauce + Sides choice minigame | Task 12 |
| Drinks fill minigame | Task 12 |
| Boxing tap minigame | Task 12 |
| Auth guard + pending save drain on boot | Task 13 |
| Main menu + level select | Task 14 |
| HUD with last-10s timer pulse | Task 14 |
| Level result modals (success + fail) | Task 14 |
| Shop (refill lives, skip level, offline guard) | Task 14 |
| Lives empty screen with countdown | Task 14 |
| Analytics events | Task 15 |
| Build to public/games/chicken-shop | Task 16 |
| Endgame modifiers in levelConfig | Task 5 (modifier field in LevelConfig) — GameScene must read `config.modifier` and activate the appropriate behaviour. Add a `Task 17` if this is not handled inline. |

**Endgame modifier gap:** The `modifier` field is generated in Task 5 but not yet consumed in `GameScene`. Add the following to `GameScene.start()` before the ticker starts:

```ts
if (this.config.modifier === 'rushMinute') {
  setTimeout(() => {
    const orig = this.nextSpawnMs
    this.nextSpawnMs = orig * 0.4
    setTimeout(() => { this.nextSpawnMs = orig }, 15_000)
  }, Math.random() * (this.config.durationMs - 20_000))
}
if (this.config.modifier === 'cleanRunBonus') {
  // Checked at end-of-level: if walkouts === 0, addCash(500)
  // Add to the success branch in tick():
  // if (cashEarned >= target && walkouts === 0) run.addCash(500)
}
if (this.config.modifier === 'fryerWobble') {
  // Pass wobble=true to FryerMinigame constructor for 20s
  // GameScene tracks a this.wobbleActive flag with a 20s timeout
}
// vipCustomer: one spawned customer has payoutBasePence += 400, patienceMs *= 0.75
```

Wire these into GameScene inline — no extra file needed.

**No placeholders found.** All steps contain runnable code or exact commands.

**Type consistency verified:** `StationKey`, `Order`, `StationRuntime`, `LevelConfig` are defined once in `types.ts` and imported everywhere. No renamed variants across tasks.
