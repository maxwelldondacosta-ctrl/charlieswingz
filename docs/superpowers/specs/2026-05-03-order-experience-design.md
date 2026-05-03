# Order Experience Upgrades — Design Spec
**Date:** 2026-05-03  
**Status:** Approved  
**Feature:** Live order tracker, photo menu, one-tap reorder

---

## Overview

Three order-experience improvements. Two are already partially in place; the live tracker is the only net-new build.

| Upgrade | Status |
|---|---|
| Photo menu | Already built — `/menu-images/*.jpg` wired into the MENU object and rendered in `.menu-card-image` divs |
| One-tap reorder | Already built — profile Orders tab shows a "Reorder" button that loads `/?reorder=ID` and pre-fills the cart |
| Live order tracker | **Not built** — the main work for this feature |

---

## Live Order Tracker

### Goal

After a customer completes payment, instead of a static "Order Confirmed" page they see a live status tracker that polls every 10 seconds and updates as the restaurant moves the order through its workflow.

### How it works

1. At checkout creation time, generate a `track_token` (hex, 12 chars).
2. Embed the token in the Stripe `success_url`: `?order_success=1&track=TRACK_TOKEN`
3. Store the token in the `orders` table.
4. On the success page, read `?track=TOKEN` and render the live tracker instead of the static HTML replacement.
5. The tracker polls `GET /api/orders/track/:token` every 10 seconds.
6. When status reaches a terminal state (`delivered` or `collected`), polling stops.
7. The tracker page also shows a "Reorder" button linking to `/?reorder=ORDER_ID` — but we don't expose the full order ID from the public API; instead, the tracker page uses the track token URL and the reorder link is included in the API response.

---

## DB Changes

### New column on `orders` (via migration pattern)

| Column | Type | Default | Purpose |
|---|---|---|---|
| `track_token` | TEXT | null | Random hex token for public order tracking |

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_track_token ON orders(track_token) WHERE track_token IS NOT NULL;
```

### New prepared statement

```javascript
getOrderByTrackToken: db.prepare('SELECT * FROM orders WHERE track_token = ?'),
```

### Modified `insertOrder`

The `insertOrder` INSERT statement and helper function gain a `track_token` parameter. Existing callers that omit it pass `null` (the column defaults to null).

### New helper function

```javascript
function getOrderByTrackToken(token) {
    return stmts.getOrderByTrackToken.get(token) || null;
}
```

Exported from `module.exports`.

---

## Checkout Changes (server.js)

At the top of the checkout handler, before creating the Stripe session:

```javascript
const trackToken = crypto.randomBytes(6).toString('hex');
```

Update `success_url`:
```javascript
success_url: `https://order.charlieswingz.com/?order_success=1&track=${trackToken}`,
```

Pass `trackToken` into `db.insertOrder()` and include it in the order record.

---

## API

### `GET /api/orders/track/:token`

**Public — no auth required.**

Looks up order by `track_token`. Returns minimal status info only — no PII beyond first name.

Response (200):
```json
{
  "shortId": "A3F9C1",
  "status": "preparing",
  "orderType": "delivery",
  "customerName": "Charlie",
  "reorderId": "ord_abc123",
  "estimatedAt": null
}
```

- `shortId` — last 6 chars of order ID, uppercased
- `status` — one of: `received`, `preparing`, `ready`, `out_for_delivery`, `delivered`, `collected`
- `orderType` — `"delivery"` | `"collection"`
- `customerName` — first name only (split on first space)
- `reorderId` — full order ID, used to build the reorder link client-side
- `estimatedAt` — ISO string if set, otherwise null

Returns 404 if token not found.

---

## Status Steps

### Collection orders

```
Received → Preparing → Ready to Collect → Done ✓
```

### Delivery orders

```
Received → Preparing → Out for Delivery → Delivered ✓
```

Status mapping from DB value:

| DB status | Display label | Step index |
|---|---|---|
| `pending_payment` / `received` | Order Received | 0 |
| `preparing` | Being Prepared | 1 |
| `ready` | Ready to Collect | 2 (collection) |
| `out_for_delivery` | On the Way | 2 (delivery) |
| `delivered` | Delivered ✓ | 3 (terminal) |
| `collected` | Collected ✓ | 3 (terminal — treat `ready` → `collected` as last step for collection) |

---

## index.html Changes

### Success handler update

The existing `handleCheckoutReturn` IIFE reads `?order_success=1`. Update it to:

1. Read `?track=TOKEN` from the URL params.
2. If track token is present: render the tracker UI (see below) instead of the static HTML block.
3. If no track token: fall back to the existing static success message (keeps backwards compatibility for any orders already in flight).

### Tracker UI

Rendered into `document.body.innerHTML` replacing the page (same pattern as the current static success screen):

```
┌─────────────────────────────────────┐
│         👑 Order Confirmed!          │
│                                     │
│  Hi Charlie! Order #A3F9C1          │
│                                     │
│  ●──────○──────○──────○             │
│  Received  Preparing  Ready  Done   │
│                                     │
│  We're preparing your order now.    │
│                                     │
│  [Reorder →]    [Back to Menu]      │
└─────────────────────────────────────┘
```

- Progress bar: filled circles for completed steps, empty for future
- Status label below each circle
- Message text changes per status (e.g. "Driver is on the way!" for `out_for_delivery`)
- Polling: `setInterval` every 10 000 ms calling `GET /api/orders/track/:token`
- Terminal: when status is `delivered` or `collected`, clear the interval and show a final "Thanks for ordering!" message
- Reorder button: `href="/?reorder=${data.reorderId}"`

### JS functions

- `startOrderTracker(token)` — called from the success handler if track param present. Renders the tracker shell, starts polling.
- `updateTrackerUI(data)` — called on each poll response. Updates the progress bar and message.
- `getStatusStep(status, orderType)` — maps DB status string to step index (0–3).

---

## Files Affected

| File | Change |
|---|---|
| `app/db.js` | Add `track_token` column migration; add `getOrderByTrackToken` stmt + helper; update `insertOrder` stmt + function to accept `trackToken` |
| `app/server.js` | Generate `trackToken` in checkout handler; update `success_url`; add `GET /api/orders/track/:token` route |
| `app/public/index.html` | Update `handleCheckoutReturn` to show live tracker when `?track=TOKEN` present; add `startOrderTracker` + `updateTrackerUI` + `getStatusStep` functions |

---

## Edge Cases

- **Token not found:** API returns 404. Tracker shows "Order not found — contact us" with a phone link.
- **Polling failure:** Silently retry next interval. After 5 consecutive failures, show "Having trouble connecting — we'll send you an update via your chosen contact method."
- **Status regresses:** Impossible in normal operation. Tracker always advances — if current step < previously rendered step, keep the higher step displayed.
- **No track token in success URL (old orders):** Fall back to existing static success page.
- **`pending_payment` status:** Maps to step 0 (Received). The webhook fires async and may not have moved to `received` yet — this is fine.
- **Manual/cash orders inserted without track_token:** `track_token` is null; those orders can't be looked up via the tracker (expected — tracker only supports Stripe flow).

---

## Success Criteria

- After Stripe checkout, customers land on a live tracker that polls and updates without page refresh
- Progress correctly advances through collection or delivery steps
- Reorder button on tracker page works (pre-fills cart)
- Tracker handles network errors gracefully without crashing
- Orders without a track token (manual inserts, legacy) still show the static success page

---

## What's Already Done

**Photo menu:** `/menu-images/*.jpg` files are referenced in the `MENU` object in `index.html`. `.menu-card-image img` renders them on every menu card. No changes needed.

**One-tap reorder:** Profile → Orders tab shows a "Reorder" button that navigates to `/?reorder=ORDER_ID`. The `handleReorder` IIFE in `index.html` reads the param, fetches `/api/orders/:id/items`, and pre-fills the cart. Working as-is.
