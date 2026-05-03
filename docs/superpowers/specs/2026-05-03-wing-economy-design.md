# Wing Economy — Design Spec
**Date:** 2026-05-03  
**Status:** Approved  
**Feature:** Wing Shop — spend game points on real rewards

---

## Overview

Players earn points by playing the wing game (`total_score`). Points can be spent in the Wing Shop on discount codes. Spending lowers `total_score` directly — no separate balance column. The existing milestone unlock system (10k / 100k tiers) is retired; all previously claimed codes stay in player wallets.

The exchange rate is deliberately unfavourable: 1,000 points ≈ 1p real value. This keeps the system abuse-resistant — a great session might earn 10,000 points (10p of value), so meaningful rewards require sustained play over days or weeks.

---

## Shop Catalogue

Stored as a constant `WING_SHOP` in `server.js`. Not in the DB — it is not user data.

| id | Name | Points | Reward generated |
|---|---|---|---|
| `pop` | Free Can of Pop | 80,000 | £0.80 fixed off |
| `side` | Free Side | 200,000 | £2.50 fixed off |
| `three` | £3 Off | 300,000 | £3.00 fixed off |
| `ten` | 10% Off | 400,000 | 10% percent off |
| `wings6` | Free 6 Wings | 750,000 | £8.50 fixed off |
| `twenty` | 20% Off | 1,000,000 | 20% percent off |
| `wings20` | Free 20 Wings *(pay delivery only)* | 10,000,000 | £26.00 fixed off |

The `wings20` tier is the legendary reward — 10 million points. The player still pays any delivery fee; the code covers the food cost only.

---

## DB Changes

**No new columns.** `total_score` on `game_players` is the spendable balance.

**One new prepared statement** added to `db.js`:

```javascript
spendPoints: db.prepare(
  'UPDATE game_players SET total_score = total_score - ? WHERE email = ? AND total_score >= ?'
)
```

The `AND total_score >= ?` guard is atomic — prevents going negative even under concurrent requests. Returns `.changes` — if 0, the spend failed (insufficient balance).

**One new helper function** `spendPoints(email, amount)`:
- Runs the prepared statement
- Returns `true` if `.changes === 1`, `false` if insufficient balance
- Exported from `module.exports`

---

## API

### `GET /api/game/shop`
Public (no auth required). Returns the shop catalogue so the frontend can render it without a login gate on the shop display.

Response:
```json
[
  { "id": "pop", "name": "Free Can of Pop", "points": 80000 },
  ...
]
```

### `POST /api/game/shop/redeem`
Requires `requireGameAuth`. Body: `{ "itemId": "side" }`.

Logic:
1. Look up item in `WING_SHOP` — 400 if not found
2. Fetch player, check `player.totalScore >= item.points` — 400 with `"Not enough points"` if insufficient
3. Call `db.spendPoints(email, item.points)` — if returns false, 400 with `"Not enough points"` (race-condition safety)
4. Generate code: `WING-` + `crypto.randomBytes(4).toString('hex').toUpperCase()`
5. Insert to `discounts` table via `db.insertDiscount` with `source: 'wing-shop'`, linked to `req.playerEmail`
6. Return `{ code, newBalance: player.totalScore - item.points }`

---

## Retiring the Milestone System

The `GAME_MILESTONES` constant and milestone-check block are **removed** from the score submission handler (`POST /api/game/score` or equivalent).

The `POST /api/game/claim-milestone` route is kept but returns a friendly 410 response:
```json
{ "message": "Milestones have been replaced by the Wing Shop. Visit your profile to spend your points." }
```

Existing `unlocked_codes` and `redeemed_codes` in player wallets are untouched — codes already earned remain valid.

---

## Profile Page — Game Tab

Added to `profile.html` inside `#tab-game`, below the existing game stats section.

### Points balance
```
Your Points
1,234,560 pts
```
Formatted with commas. Pulled from `data.totalScore` already returned by `GET /api/account/profile`.

### Shop grid
Each item renders as a card:
- Item name
- Point cost (formatted with commas + "pts")
- "Redeem" button — **disabled and greyed** if `player.totalScore < item.points`
- A small affordability indicator: items the player can afford show a subtle gold border; unaffordable items are dimmed

On redeem:
- Button shows "Redeeming…" spinner state
- On success: card replaced inline with the generated code + copy button + "Added to your rewards" message
- On failure: inline error message

### `loadShop(playerScore)` function
Fetches `GET /api/game/shop`, renders the grid, disables unaffordable items. Called from `showProfile()` when the Game tab is active.

### `redeemShopItem(itemId)` function
Posts to `POST /api/game/shop/redeem`. On success, updates the displayed points balance and replaces the redeemed card.

---

## Files Affected

| File | Change |
|---|---|
| `app/db.js` | Add `spendPoints` prepared statement and helper function, export it |
| `app/server.js` | Add `WING_SHOP` constant; add `GET /api/game/shop` and `POST /api/game/shop/redeem`; remove milestone logic from score handler; update `claim-milestone` to 410 |
| `app/public/profile.html` | Add points balance display and shop grid to Game tab |

---

## Edge Cases

- **Concurrent double-spend:** The `AND total_score >= ?` SQL guard is atomic — only one request can succeed if the player has exactly enough points.
- **Item no longer in catalogue:** If `WING_SHOP` changes, old `itemId`s return 400 gracefully.
- **Zero-balance player:** Entire shop renders with all buttons disabled.
- **10M tier psychology:** The `wings20` card always renders (visible as a goal) but is disabled until the player reaches 10,000,000 points.

---

## Success Criteria

- Players can view the Wing Shop on the Game tab without logging in (GET /api/game/shop is public)
- Authenticated players can redeem items; points deduct from total_score immediately
- Insufficient balance returns a clear error, never negative score
- Milestone system is retired; existing codes unaffected
- The 10-million-point Free 20 Wings tier is visible as a legendary goal
