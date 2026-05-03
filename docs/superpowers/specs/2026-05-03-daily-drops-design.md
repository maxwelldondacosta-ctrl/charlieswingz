# Daily Drops & Challenges — Design Spec
**Date:** 2026-05-03  
**Status:** Approved  
**Feature:** Neopets-style daily login loop — streak check-in and daily challenges

---

## Overview

Two engagement loops that run daily and reward players with Wing Shop points (`total_score`):

1. **Daily Check-In** — a claimable button on the profile Loyalty tab. Once per calendar day. Bonus scales with consecutive-day streak. Missing a day resets the streak.
2. **Daily Challenges** — three tasks displayed on the profile Loyalty tab, reset at midnight UTC. Same three challenges for all players on a given day (deterministic by date). Completing one awards points.

All rewards add to `total_score`, feeding directly into the Wing Shop.

---

## Daily Check-In

### Streak Bonus Table

| Streak day | Points awarded |
|---|---|
| 1 | 1,000 |
| 2 | 1,500 |
| 3 | 2,000 |
| 4 | 3,000 |
| 5 | 4,000 |
| 6 | 5,000 |
| 7 | 10,000 |

After day 7 the streak resets to 0 and the cycle restarts from day 1.

Missing a calendar day (UTC) also resets the streak to 0.

### Claim Logic

A "claim" is valid if:
- `last_daily_claim` is not today's UTC date string (`YYYY-MM-DD`)

On claim:
1. Calculate today's date string (UTC)
2. Determine if yesterday's date matches `last_daily_claim` — if yes, increment streak; if no (missed a day or first claim), reset streak to 1
3. Look up bonus from the streak table
4. Add bonus to `total_score` via the existing `spendPoints`-pattern (but adding, not subtracting) — use a new `addPoints(email, amount)` helper
5. Save `last_daily_claim = today`, `daily_streak = newStreak`
6. Return `{ pointsEarned, newStreak, newBalance, nextClaimAt }`

`nextClaimAt` is midnight UTC of the next calendar day (ISO string), used for the frontend countdown.

---

## Daily Challenges

### Challenge Pool (static, defined in server.js)

```
DAILY_CHALLENGE_POOL = [
  { id: 'play_game',     label: 'Play a game today',          points: 2000,  trigger: 'game_save'  },
  { id: 'score_1k',      label: 'Score 1,000+ in one game',   points: 5000,  trigger: 'game_save'  },
  { id: 'score_5k',      label: 'Score 5,000+ in one game',   points: 15000, trigger: 'game_save'  },
  { id: 'place_order',   label: 'Place an order today',       points: 10000, trigger: 'order'      },
  { id: 'streak_3',      label: 'Log in 3 days in a row',     points: 8000,  trigger: 'daily_claim' },
]
```

### Daily Set Selection

Three challenges are active each calendar day (UTC). They are selected deterministically by date so all players see the same three:

```javascript
function getDailyChallenges(dateStr) {
    // dateStr = 'YYYY-MM-DD'
    const seed = dateStr.replace(/-/g, '');          // e.g. '20260503'
    const n = parseInt(seed, 10) % DAILY_CHALLENGE_POOL.length;
    // Pick 3 non-overlapping using index rotation
    return [0, 1, 2].map(i => DAILY_CHALLENGE_POOL[(n + i) % DAILY_CHALLENGE_POOL.length]);
}
```

### Completion Tracking

New DB table `daily_completions`:

```sql
CREATE TABLE IF NOT EXISTS daily_completions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    email    TEXT NOT NULL,
    challenge_id TEXT NOT NULL,
    claim_date   TEXT NOT NULL,  -- 'YYYY-MM-DD' UTC
    UNIQUE(email, challenge_id, claim_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_completions ON daily_completions(email, claim_date);
```

The `UNIQUE` constraint prevents double-claiming the same challenge on the same day.

### Completion Triggers

Challenges are checked and completed automatically when the relevant event fires — no separate "claim" button per challenge. Players just do the action and points appear.

| Trigger | Where it fires | Check logic |
|---|---|---|
| `game_save` | `POST /api/game/save` handler | After score is saved: check if `play_game` not yet completed today → complete it. If session score ≥ 1,000 and `score_1k` not done → complete it. If session score ≥ 5,000 and `score_5k` not done → complete it. |
| `order` | Stripe webhook `checkout.session.completed` | After order confirmed: check if `place_order` not yet completed today → complete it. |
| `daily_claim` | `POST /api/game/daily-claim` | After a successful check-in: if new streak ≥ 3 and `streak_3` not yet completed today → complete it. |

Completing a challenge: insert row into `daily_completions`, add points to `total_score` via `addPoints`.

---

## DB Changes

### New columns on `game_players` (via migration pattern)

| Column | Type | Default | Purpose |
|---|---|---|---|
| `last_daily_claim` | TEXT | null | UTC date string of last check-in ('YYYY-MM-DD') |
| `daily_streak` | INTEGER | 0 | Current consecutive-day streak |

### New table

`daily_completions` — as defined above.

### New prepared statements

```javascript
setDailyClaim:       db.prepare('UPDATE game_players SET last_daily_claim = ?, daily_streak = ? WHERE email = ?'),
addPoints:           db.prepare('UPDATE game_players SET total_score = total_score + ? WHERE email = ?'),
insertDailyCompletion: db.prepare('INSERT OR IGNORE INTO daily_completions (email, challenge_id, claim_date) VALUES (?, ?, ?)'),
getDailyCompletions: db.prepare('SELECT challenge_id FROM daily_completions WHERE email = ? AND claim_date = ?'),
```

### New helper functions

- `getDailyClaimState(email)` — returns `{ lastDailyClaim, dailyStreak }` or null
- `setDailyClaim(email, dateStr, streak)` — updates both columns
- `addPoints(email, amount)` — increments `total_score`
- `insertDailyCompletion(email, challengeId, dateStr)` — INSERT OR IGNORE (returns whether it was new)
- `getDailyCompletions(email, dateStr)` — returns array of completed challenge IDs for today

All exported from `module.exports`.

---

## API

### `POST /api/game/daily-claim`
Requires `requireGameAuth`.

Logic:
1. Get today's UTC date string: `new Date().toUTCString().slice(0,16)` — use `new Date().toISOString().slice(0,10)` for `YYYY-MM-DD`
2. Fetch player's `{ lastDailyClaim, dailyStreak }` via `getDailyClaimState`
3. If `lastDailyClaim === today` → 400 `{ message: 'Already claimed today' }`
4. Calculate yesterday: subtract 1 day from today
5. If `lastDailyClaim === yesterday` → newStreak = `(dailyStreak % 7) + 1` (caps at 7, then resets)
6. Else → newStreak = 1 (missed a day or first ever claim)
7. Look up `DAILY_STREAK_BONUSES[newStreak]` for points
8. Call `db.addPoints(email, points)`
9. Call `db.setDailyClaim(email, today, newStreak)`
10. Check `streak_3` challenge: if newStreak >= 3, call `completeChallengeIfNew(email, 'streak_3', today)`
11. Return `{ pointsEarned: points, newStreak, newBalance: player.totalScore + points, nextClaimAt: <midnight UTC ISO> }`

### `GET /api/game/daily-status`
Requires `requireGameAuth`. Returns current state for the frontend to render check-in button and challenges.

Response:
```json
{
  "claimed": false,
  "streak": 3,
  "nextBonus": 3000,
  "nextClaimAt": "2026-05-04T00:00:00.000Z",
  "challenges": [
    { "id": "play_game",   "label": "Play a game today",        "points": 2000,  "completed": false },
    { "id": "score_1k",    "label": "Score 1,000+ in one game", "points": 5000,  "completed": true  },
    { "id": "place_order", "label": "Place an order today",     "points": 10000, "completed": false }
  ]
}
```

`challenges` is the day's three challenges with completion state looked up from `daily_completions`.

---

## Profile Page — Loyalty Tab

Added to `profile.html` inside `#tab-loyalty`, **above** the stamp card section.

### Daily Check-In card

```
┌─────────────────────────────────┐
│ 🔥 Daily Check-In               │
│ Streak: 3 days                  │
│ Today's bonus: 2,000 pts        │
│                                 │
│  [ Claim 2,000 pts ]            │
│                                 │
│  Next claim in 14h 23m          │
└─────────────────────────────────┘
```

- Button disabled + countdown shown if already claimed today
- On claim: button replaced with "✓ Claimed! +2,000 pts"
- Streak display updates immediately

### Daily Challenges card

```
┌─────────────────────────────────┐
│ 📋 Daily Challenges             │
│                                 │
│ ☐ Play a game today     +2,000  │
│ ✓ Score 1,000+ in a game +5,000 │
│ ☐ Place an order today +10,000  │
│                                 │
│ Resets in 6h 41m                │
└─────────────────────────────────┘
```

- Completed challenges shown with strikethrough + green tick
- Points added automatically when action is taken (no manual claim button per challenge)
- Countdown to midnight UTC reset

### JS functions

- `loadDailyDrops()` — fetches `GET /api/game/daily-status`, renders both cards
- `claimDaily()` — posts to `POST /api/game/daily-claim`, updates UI and Wing Shop balance on profile if visible
- Both called from `loadLoyalty()` (already fires when Loyalty tab is opened)

---

## Files Affected

| File | Change |
|---|---|
| `app/db.js` | Add `daily_completions` table; 2 migrations; 4 prepared statements; 5 helper functions |
| `app/server.js` | Add `DAILY_STREAK_BONUSES`, `DAILY_CHALLENGE_POOL`, `getDailyChallenges()`; add `POST /api/game/daily-claim` and `GET /api/game/daily-status`; add challenge triggers in `/api/game/save` and Stripe webhook |
| `app/public/profile.html` | Add Daily Check-In card and Daily Challenges card to Loyalty tab |

---

## Edge Cases

- **Double-claim race condition:** `last_daily_claim === today` check fires before any DB write; additionally the date column update is idempotent.
- **Challenge double-completion:** `INSERT OR IGNORE` on `UNIQUE(email, challenge_id, claim_date)` prevents any double award.
- **Midnight boundary:** All date comparisons use UTC date strings (`YYYY-MM-DD`). Server and client may be in different timezones — the server is authoritative.
- **score_1k and score_5k same session:** If a player scores 5,000+ in one game, both `score_1k` and `score_5k` can complete in the same `/api/game/save` call (checked independently).
- **play_game + score_1k same session:** All three `game_save` triggers fire in the same request — each checked and completed independently.
- **No challenges active for player:** `getDailyChallenges` always returns exactly 3 items from the pool.

---

## Success Criteria

- Players can claim a daily bonus once per UTC calendar day
- Streak increments on consecutive claims, resets on a missed day, caps reward at day 7 then restarts
- Three daily challenges display on the Loyalty tab; same set for all players each day
- Challenges complete automatically when the trigger event fires — no extra UI step
- All points feed into `total_score` and are immediately visible in the Wing Shop balance
- Double-claiming and race conditions are prevented at the DB level
