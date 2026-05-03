# Referral System — Design Spec
**Date:** 2026-05-03  
**Status:** Approved  
**Feature:** Friend referral system with 15% rewards and a recurring 30% milestone

---

## Overview

Existing customers share a unique referral link. When a friend signs up via that link and places their first order, both the friend and the referrer receive a 15% discount code. Referrers who accumulate every 10 successful referrals additionally receive a 30% discount code as a loyalty milestone.

---

## Referral Code Format

Each player has one referral code, generated at registration and stored on their `game_players` row:

- Format: `CWREF-` + 6 random uppercase alphanumeric characters (e.g. `CWREF-AB12CD`)
- Unique constraint on `game_players.referral_code`
- Referral link: `https://charlieswingz.co.uk/?ref=<referral_code>`

---

## DB Changes

Four new columns added to `game_players` via the existing migration pattern:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `referral_code` | TEXT UNIQUE | null | The player's shareable code |
| `referred_by` | TEXT | null | Email of the player who referred them |
| `referral_rewarded` | INTEGER | 0 | 1 once the 15% codes have been issued |
| `referral_count` | INTEGER | 0 | Total successful referrals made |

Existing players get `referral_code` generated lazily the first time `GET /api/account/profile` is called.

---

## Referral Link Flow (Frontend)

### Step 1 — Capture on landing (`index.html`)

On page load, `index.html` checks for `?ref=` in the URL. If present, it saves the value to `localStorage` as `cw_referral` and strips the param from the URL via `history.replaceState`.

### Step 2 — Pass at signup (`game.html`)

When the signup form is submitted (`POST /api/game/register`), the frontend reads `cw_referral` from localStorage and includes it as `referralCode` in the request body. After the request completes (success or failure), `cw_referral` is cleared from localStorage.

### Step 3 — Server validates and stores

`POST /api/game/register` checks `referralCode`:
- Looks up `game_players WHERE referral_code = ?`
- If found and the referrer is a different email: sets `referred_by = referrer.email` on the new player
- If not found or same email as registrant: silently ignored (never blocks signup)
- New player still receives the standard 10% signup discount as normal — no change to that flow

---

## Reward Trigger

Fires inside the order placement handler in `server.js`, immediately after a new order is successfully inserted (payment confirmed).

Logic (synchronous, runs in the same request):

```
if order.customer_email matches a game_player where:
    - referred_by IS NOT NULL
    - referral_rewarded = 0
then:
    1. Generate 15% code for the referred friend  → insert to discounts
    2. Generate 15% code for the referrer         → insert to discounts
    3. Set referral_rewarded = 1 on the friend's row
    4. Increment referral_count on the referrer's row
    5. If new referral_count % 10 === 0:
           Generate 30% code for the referrer     → insert to discounts
```

The reward fires exactly once per referred player (guarded by `referral_rewarded = 0`). Subsequent orders by the same player do not re-trigger it.

---

## Discount Code Generation

All codes are inserted into the existing `discounts` table.

| Reward | Code format | Type | Value | source |
|---|---|---|---|---|
| 15% for referred friend | `CWREF15-XXXXXX` | percent | 15 | `referral` |
| 15% for referrer | `CWREF15-XXXXXX` | percent | 15 | `referral` |
| 30% milestone for referrer | `CWREF30-XXXXXX` | percent | 30 | `referral-milestone` |

`XXXXXX` = 6 random uppercase alphanumeric characters. Codes are linked to the recipient's email in `discounts.email`.

---

## Profile Page — Refer a Friend Card

Added to the **Loyalty tab** in `profile.html`, below the stamp card.

**Card contents:**
- Heading: "Refer a Friend"
- Subtext: "Share your link. When your friend places their first order, you both get 15% off."
- Copyable referral link (`https://charlieswingz.co.uk/?ref=<code>`)
- Copy button — shows "✓ Copied!" on click
- Referral count line: "**N** friend(s) referred"
- Milestone progress: "**X more** to unlock your 30% reward" (where X = `10 - (referral_count % 10)`)
- If `referral_count % 10 === 0 && referral_count > 0`: show "🎉 30% milestone reached!" instead

The referral code and count are returned by the existing `GET /api/account/profile` endpoint (extended to include `referralCode` and `referralCount`).

---

## Backend Summary

### Modified endpoints

**`POST /api/game/register`**  
Accept optional `referralCode` in body. Look up referrer. If valid: set `referred_by` on new player. Never block signup.

**`GET /api/account/profile`**  
Include `referralCode` and `referralCount` in the response so the profile page can render the card.

### New logic (not a new endpoint)

Referral reward trigger added inside the existing order creation handler. No new route required.

### New DB helpers

- `getPlayerByReferralCode(code)` — looks up `game_players WHERE referral_code = ?`
- `getPlayerReferralState(email)` — returns `{ referredBy, referralRewarded }` for the reward check
- `setReferralRewarded(email)` — sets `referral_rewarded = 1`
- `incrementReferralCount(email)` — increments `referral_count` by 1, returns new value

---

## Files Affected

| File | Change |
|---|---|
| `app/db.js` | Add 4 migrations, new prepared statements, generate referral codes |
| `app/server.js` | Update register endpoint, extend profile endpoint, add reward trigger in order handler |
| `app/public/index.html` | Capture `?ref=` param → `localStorage` |
| `app/public/game.html` | Read `cw_referral` at signup, pass to register, clear after |
| `app/public/profile.html` | Add Refer a Friend card on Loyalty tab |

---

## Edge Cases

- **Self-referral:** Blocked server-side — if `referralCode` belongs to the registrant's email, it is ignored.
- **Invalid code:** Silently ignored — signup completes normally.
- **Referrer deleted / not found:** Reward trigger checks for referrer existence; skips gracefully.
- **Code collision:** `INSERT OR IGNORE` with retry on unique constraint violation.
- **Existing players without a referral code:** Code generated lazily when `GET /api/account/profile` is called; stored to DB at that point.

---

## Success Criteria

- Referral link is visible and copyable on the Profile Loyalty tab
- Signing up via a referral link stores `referred_by` correctly
- Placing a first order triggers both 15% codes, visible in Profile reward cards
- Referral count increments correctly
- Every 10th successful referral generates a 30% code for the referrer
- Self-referral and invalid codes are silently ignored
- Existing players can access their referral link without re-registering
