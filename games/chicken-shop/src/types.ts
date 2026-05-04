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
