# Livestream Page — Design Spec
**Date:** 2026-05-02  
**Status:** Approved  
**Feature:** Dedicated `/live` page for Charlie's Wingz YouTube streams

---

## Overview

A dedicated livestream page that serves two distinct states:

- **OFFLINE** — countdown to the next stream + latest replay video
- **LIVE** — split layout: YouTube stream (left) + order panel with tonight's discount code (right)

Everything is configured from the admin panel before going on air. No mid-stream scrambling required.

---

## Page States

### State 1: OFFLINE

Displayed when `is_live = false` in stream config.

**Components (top to bottom):**
1. **Countdown timer** — "Next stream in 2d 4h 17m" with stream title and scheduled date/time below it
2. **Get Notified button** — triggers the existing push notification opt-in flow
3. **Latest Replay embed** — YouTube `<iframe>` using the channel ID to embed the most recent public video. The channel ID is configured in admin; the page constructs the embed URL as `https://www.youtube.com/embed?listType=user_uploads&list=<channelId>&index=1`

### State 2: LIVE

Displayed when `is_live = true` in stream config.

**Layout:** Two-column split (60/40). On mobile: single column, stream on top, order panel below.

**Left column (60%) — Stream:**
- YouTube `<iframe>` embed of the configured live stream URL
- LIVE badge with pulsing red dot overlaid top-left of the player
- Stream title below the player

**Right column (40%) — Order Panel:**
- "Order While You Watch" heading (Playfair Display)
- **Tonight's Drop card** — gold-bordered box showing:
  - Label: "Tonight's Drop 🔥"
  - Discount code (e.g. `LIVE25`) in large Bebas Neue
  - Description text (e.g. "25% off — tonight only")
- **Quick Order list** — 3 most popular items (confirm exact names and prices from the menu data in `server.js` at build time) with price and an "Add" button that links to `index.html` with the item pre-selected via URL param
- **Full Menu button** — burgundy CTA linking to `index.html`

---

## State Switching

The page polls `GET /api/stream` every 30 seconds. When `is_live` flips to `true`, the page reloads to show the live layout. When it flips back to `false`, it reloads to show the offline layout. This means you simply toggle "Is Live" in the admin panel when you go on air — the page updates itself for all viewers within 30 seconds.

---

## Admin Configuration

New **"Livestream"** tab in the existing admin panel (`admin.html` / `cw-admin.js`).

**Fields:**

| Field | Type | Purpose |
|---|---|---|
| Is Live | Toggle | Switches page between offline/live states |
| YouTube Live URL | Text | Full YouTube live stream URL |
| YouTube Channel ID | Text | Used to auto-embed latest replay. Must be the `UCxxxxxx` format — find it in YouTube Studio → Customization → Basic info → Channel ID |
| Stream Title | Text | Shown on the page and in countdown |
| Next Stream | Date + Time | Used for countdown timer |
| Tonight's Discount Code | Text | Code shown in the drop card |
| Code Description | Text | Description shown under the code (e.g. "25% off — tonight only") |

Config is saved and retrieved as a single row in a new `stream_config` DB table.

---

## Backend

### Database

New table `stream_config` (single-row settings):

```sql
CREATE TABLE IF NOT EXISTS stream_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    is_live INTEGER DEFAULT 0,
    stream_url TEXT,
    channel_id TEXT,
    stream_title TEXT,
    next_stream_at TEXT,
    discount_code TEXT,
    code_description TEXT,
    updated_at TEXT
);
```

Single row, always `id = 1`. Upserted on every admin save.

### API Endpoints

**`GET /api/stream`** — public, no auth  
Returns current stream config. Used by the frontend to poll for state changes.

```json
{
  "isLive": false,
  "streamUrl": "https://youtube.com/live/xxx",
  "channelId": "UCxxxxxx",
  "streamTitle": "Sauce Review Night",
  "nextStreamAt": "2026-05-10T19:00:00.000Z",
  "discountCode": "LIVE25",
  "codeDescription": "25% off — tonight only"
}
```

**`POST /api/admin/stream`** — admin auth required  
Saves stream config. Body mirrors the GET response shape. Returns updated config.

---

## Design System

Matches main site exactly:

- **Background:** `#0A0A0A`
- **Accent gold:** `#D4A84B`
- **Burgundy:** `#8B1A1A`
- **Cream text:** `#F5F0E6`
- **Fonts:** Playfair Display (headings), Bebas Neue (labels/CTAs), Inter (body)
- **Border accent:** `4px solid var(--gold)` on left/right/bottom (matches `body` in `index.html`)

---

## Mobile Behaviour

- Single-column layout on screens under 768px
- Stream embed on top, order panel stacked below
- All buttons full-width
- Countdown and replay stack vertically

---

## Files Affected

| File | Change |
|---|---|
| `public/live.html` | New file — the full livestream page |
| `db.js` | Add `stream_config` table + prepared statements + exported functions |
| `server.js` | Add `GET /api/stream` and `POST /api/admin/stream` routes |
| `public/admin.html` | Add Livestream tab UI |
| `cw-admin.js` | Add Livestream tab logic (load config, save config) |

---

## Out of Scope

- Real-time viewer count (YouTube API requires OAuth — too complex for now; omit)
- Mid-stream code changes (pre-set in admin is sufficient)
- Chat integration
- Watch-to-earn coins (deferred to Wing Economy feature)

---

## Success Criteria

- Page shows correct state (live vs offline) based on admin toggle
- Countdown displays accurate time to next stream
- Replay embed loads the channel's most recent video automatically
- Stream embed plays when live URL is set and `is_live = true`
- Discount code card displays correctly in the order panel
- Admin can configure and save all fields
- Mobile layout is fully functional
- Page auto-switches state within 30 seconds of admin toggling Is Live
