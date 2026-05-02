# Customer Profile Hub — Design Spec
**Date:** 2026-05-02  
**Status:** Approved  
**Feature:** Dedicated `/profile` page for Charlie's Wingz customers

---

## Overview

A customer-facing profile hub at `/profile.html`. Visible to all visitors but content is gated behind login. Uses the existing `game_players` account system — one account, one login, one database. No new auth infrastructure required.

---

## Auth Flow

- **Not logged in:** Centred login card with email + password fields, "Log In" button, and a "Don't have an account? Create one" link pointing to `game.html`. Same credentials as the game account.
- **Logged in:** Session stored in localStorage under key `cw_session` as `{ token, user }` — same key and shape as `game.html`. All API calls use `Authorization: Bearer <token>` header. On token expiry or 401, redirect to login state.
- **On login:** POST to existing `POST /api/game/login` with `{ email, password }`. Store response as `cw_session` in localStorage.

---

## Page Layout

Fixed nav matching main site (logo → `/`, links: Menu, Live, Games, Profile — Profile active). Gold 4px borders on left/right/bottom of body. Welcome header: "Welcome back, [Name]" in Playfair Display below nav.

Four tabs below the header. Tab styling matches admin panel's `.tab-btn` / `.tab-content` pattern.

---

## Tab 1: Loyalty (default tab)

Shown first on page load.

**Components (top to bottom):**
1. **Stamp card** — 10 slots displayed as circles. Filled slots are gold (`#D4A84B`), empty slots are dark bordered (`#333`). Current stamp count shown numerically above: "7 / 10 stamps".
2. **Progress message** — "X more stamps to unlock [next reward name]." If all tiers claimed, "You've claimed all rewards — keep ordering to earn more."
3. **Next tier preview** — small card showing what the next reward is (e.g. "Free 6 Wings at 10 stamps").
4. **Claimed rewards** — section below stamp card listing any unlocked reward codes as copyable code cards (gold border, code in Bebas Neue, "Tap to copy" on click).

Data source: `GET /api/loyalty/progress` (existing endpoint).

---

## Tab 2: Orders

**Layout:** Vertical list of past orders, newest first.

**Each order card shows:**
- Date (e.g. "3 May 2026, 7:34pm")
- Status badge (received / preparing / ready / delivered / cancelled) — colour-coded: gold for active, green for delivered, red for cancelled
- Itemised list: each item name + quantity
- Order total (e.g. "£18.00")
- **Reorder button** — links to `/?reorder=<orderId>`. `index.html` reads this param on load and pre-fills the cart with the same items.

**Empty state:** "No orders yet — ready to place your first?" with a link to `/`.

Data source: new `GET /api/account/orders` endpoint.

---

## Tab 3: Game Stats

**Stats displayed:**
- High score (Playfair Display, large)
- Total score
- Wings eaten
- Crowns
- Coins
- Deliveries completed
- Games played
- Milestone tier (shown as a label, e.g. "Tier 2")

**Unlocked game codes:** Listed as copyable code cards (same style as loyalty reward cards).

Data source: `GET /api/game/progress` (existing endpoint).

---

## Tab 4: Account

**Editable fields:**
- Name (text)
- Phone (tel)
- Postcode (text)
- Contact preference (radio: SMS / WhatsApp / Email / Both)

**Save button** — POST to existing `POST /api/account/profile`. Shows "✓ Saved" inline on success.

**Change password** — "Change Password" link triggers the existing reset flow: POST to `/api/account/reset-request` with their email, then show "Check your email for a reset link."

Data source: `GET /api/account/profile` (existing endpoint).

---

## Backend

### New Endpoint

**`GET /api/account/orders`** — auth required (Bearer token)  
Returns the authenticated player's order history, newest first.

```json
[
  {
    "id": "ord_xxx",
    "createdAt": "2026-05-03T19:34:00.000Z",
    "status": "delivered",
    "items": [
      { "name": "10 Wings", "quantity": 2, "pricePence": 1400 }
    ],
    "totalPence": 2800,
    "orderType": "delivery"
  }
]
```

Orders are matched by the player's email against `orders.customer_email`. Items are parsed from `orders.items_json`.

### Reorder Param

`index.html` checks for `?reorder=<orderId>` on load. If present, fetches `GET /api/orders/<id>/items` (or parses the reorder data from a lightweight public endpoint) and pre-fills the cart. If any item no longer exists on the menu it is silently skipped.

New endpoint: **`GET /api/orders/:id/items`** — public, returns `items_json` for a given order ID so `index.html` can pre-fill the cart without requiring auth.

---

## Files Affected

| File | Change |
|---|---|
| `public/profile.html` | New file — full profile hub page |
| `server.js` | Add `GET /api/account/orders` and `GET /api/orders/:id/items` |
| `public/index.html` | Read `?reorder=<id>` param on load and pre-fill cart |

---

## Design System

Matches main site exactly:
- **Background:** `#0A0A0A`
- **Accent gold:** `#D4A84B`
- **Burgundy:** `#8B1A1A`
- **Cream text:** `#F5F0E6`
- **Fonts:** Playfair Display (headings), Bebas Neue (labels/codes/CTAs), Inter (body)
- **Border accent:** `4px solid var(--gold)` on left/right/bottom of body

---

## Mobile Behaviour

- Tabs scroll horizontally if they don't fit (no wrapping)
- Stamp card slots wrap to two rows on narrow screens
- Order cards are full-width
- All buttons full-width on mobile

---

## Success Criteria

- Logged-out visitor sees login prompt, not profile content
- Login uses existing game account credentials
- Loyalty tab shows correct stamp count and available reward codes
- Orders tab lists all past orders with itemised detail and reorder button
- Reorder button pre-fills cart in index.html with items from that order
- Game stats tab shows accurate data from game_players
- Account tab saves profile changes correctly
- Page matches site design system exactly
- Mobile layout is fully functional
