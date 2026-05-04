# Charlie's Wingz — Full Design Spec & Scope
*Last updated: May 2026*

---

## 1. What This Is

Charlie's Wingz is a real chicken wing restaurant's full-stack web presence. It handles online ordering, loyalty, a live-stream page, a mini arcade of browser games, and a full admin/kitchen back-office. It runs as a single Node.js/Express server serving vanilla HTML/CSS/JS pages backed by a SQLite database.

The goal is a complete end-to-end system: customer orders → kitchen sees it → driver delivers it → customer earns points → spends them on discounts → comes back.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js + Express 4 |
| Database | SQLite via `better-sqlite3` (synchronous, single-file) |
| Frontend | Vanilla HTML/CSS/JS — no framework, no build step |
| Payments | Stripe (checkout sessions + webhooks) |
| Email | Resend |
| SMS | Twilio |
| Push notifications | Web Push API (`web-push` library) |
| Admin auth | Password + WebAuthn passkeys (`@simplewebauthn/server`) |
| Deployment | Single VPS, single process, single SQLite file |

No React, no TypeScript, no bundler. Every page is a plain `.html` file served by Express.

---

## 3. Pages & What They Do

| Route | File | Audience | Purpose |
|---|---|---|---|
| `/` | index.html | Customer | Menu + ordering — the main product |
| `/play-win` | play-win.html | Customer | Arcade landing page — lists all games + Wing Shop tiers |
| `/snake` | game.html | Customer | Snake game |
| `/wing-run` | wing-run.html | Customer | Wing Run delivery game |
| `/platformer` | platformer.html | Customer | Wing King platformer (built, in testing) |
| `/profile` | profile.html | Customer | Account hub — scores, Wing Shop, order history |
| `/discount` | discount.html | Customer | Email opt-in for 10% welcome discount |
| `/allergens` | allergens.html | Customer | Allergen info |
| `/custom` | custom.html | Customer | Catering & custom orders enquiry form |
| `/terms` | terms.html | Customer | T&Cs |
| `/reset-password` | reset-password.html | Customer | Password reset flow |
| `/live` | live.html | Customer | Live-stream event page with embedded stream + drop codes |
| `/kitchen` | kitchen.html | Staff | Real-time order queue for kitchen display |
| `/driver/:id` | driver.html | Driver | Per-order delivery tracking |
| `/paylink` | paylink.html | Customer | Stripe payment link for phone orders |
| `/{ADMIN_PATH}` | admin.html | Admin | Full back-office dashboard |

---

## 4. Database — All 13 Tables

### `orders`
Every customer order. Covers delivery and collection. Links to Stripe via `payment_intent_id`. Has a `driver_token` for the delivery tracking page. Status flows: `pending → confirmed → preparing → ready → delivered`.

Key columns: `customer_email`, `order_type` (delivery/collection), `items_json`, `total_pence`, `status`, `payment_status`, `source` (web/phone/admin).

### `customers`
Restaurant's main CRM. Phone is the primary key in practice. Stores loyalty stamps, total orders, claimed rewards, and links to a game account if one exists. Has a password hash for the account portal.

### `game_players`
Separate table for the arcade game system. Stores all game economy state: `total_score`, `high_score`, `wing_count`, `crowns`, `coins`, `deliveries`, `plays`, `milestone_tier`, `daily_streak`. Also stores referral codes and referral rewards.

### `discounts`
Discount codes with type (`percent` or `fixed`), usage tracking, and source (welcome, milestone, admin-created, referral). Each code is single-use.

### `optins`
Email/phone marketing opt-ins from the discount signup page.

### `catering`
Catering enquiry submissions. Has a status flow managed from admin.

### `stamp_log`
Audit trail for every loyalty stamp change — delta, reason, which admin applied it.

### `push_subscriptions`
Web Push subscriber records for admin push notifications.

### `admin_sessions`
Active admin login sessions with IP, user-agent, expiry.

### `admin_credentials`
WebAuthn passkey credentials for admin login (biometric/hardware key auth).

### `login_attempts`
Audit log of all admin login attempts — success/failure, IP, user-agent.

### `stream_config`
Single-row config for the live-stream page: URL, title, next stream date, associated drop code.

### `daily_completions`
Tracks which users have claimed which daily challenges on which dates (prevents double-claiming).

---

## 5. Core Features — Built & Shipped

### 5.1 Online Ordering (index.html)
- Full menu with categories, items, modifiers, and extras
- Cart with real-time validation against the server menu
- Delivery/collection toggle — postcode validation with delivery zone check
- Stripe Checkout for payment
- Order confirmation email (Resend) + SMS (Twilio)
- Photo menu — each item has an image
- Reorder — one-tap repeat of a previous order from profile

### 5.2 Kitchen Display (kitchen.html)
- Polls for new orders every few seconds
- Shows orders in status lanes (pending → preparing → ready)
- Staff can advance order status
- Admin can push ETAs to the customer-facing order tracker

### 5.3 Driver Tracking (driver.html)
- Per-order page using a `driver_token` in the URL (no login needed)
- Driver confirms pickup, sets ETA
- Customer can see live status via the order tracker on index.html

### 5.4 Admin Dashboard (admin.html)
Full back-office accessible at a configurable secret path. Features:
- Order management (view, status change, refund, manual order creation)
- Customer CRM (search, edit, add loyalty stamps, merge duplicates)
- Catering enquiry management
- Marketing opt-ins list
- Push notification management (test pushes, device management)
- Live stream config
- Export (orders CSV)
- Lottery tool
- WebAuthn passkey registration/management
- Session management
- Login attempt audit log

### 5.5 Customer Profile Hub (profile.html)
- Order history with reorder button
- Wing Shop — redeem points for discount codes
- Game score summary
- Password change
- Referral link with copyable code

### 5.6 Loyalty System
- Stamp-based loyalty: buy X get one free tier
- Separate from the game Wing Economy
- Managed by admin (stamps added manually or automatically on order)

### 5.7 Discount System
- Welcome discount (email opt-in on /discount page)
- Milestone rewards from game Wing Economy
- Admin-created one-off codes
- Referral rewards
- All single-use, validated at checkout

### 5.8 Referral System
- Each game player gets a unique referral code
- Referrer earns bonus Wing Shop points when referred user makes their first order
- Tracked via `referred_by` + `referral_rewarded` on `game_players`

### 5.9 Live Stream Page (live.html)
- Embedded stream (YouTube/Twitch URL configurable from admin)
- "Next stream" countdown
- Drop code reveal during streams
- Admin can toggle live/offline status

---

## 6. The Arcade — Games

All games share one auth system (`game_players` table) and one Wing Economy (points pool). Points earned in any game stack into `total_score` and can be spent in the Wing Shop on profile.

### 6.1 Auth Flow (shared across all games)
- Login with email + password → gets a Bearer token stored in `localStorage`
- Session persists across page refreshes
- Guest play is allowed — score just doesn't save

### 6.2 Snake (game.html / /snake)
**Status: Fully built and live**

Classic snake on a canvas grid. Charlie's Wingz skin — food items are wings/fries/crowns, each worth different points and speed modifiers.

- Lives system (3 lives)
- Speed increases as snake grows
- Three food types: regular wing, golden wing (rare), crown (ultra-rare, big bonus)
- Score saves to Wing Economy on game over
- SFX: eat, die, game start, speed-up (Web Audio API, preloaded MP3s)

### 6.3 Wing Run (wing-run.html / /wing-run)
**Status: Fully built and live**

Side-scrolling delivery game. Built in React/JSX via Babel standalone (inline, no build step). Player rides an e-bike delivering wings across a city, dodging traffic.

- Multiple rounds with increasing difficulty
- VIP order bonus multiplier
- Close call near-miss scoring
- Power-up system
- Combo multiplier for consecutive deliveries
- Full SFX suite (hop, deliver, crash, close call, powerup, round complete, combo)
- Score saves to Wing Economy

### 6.4 Wing King — Platformer (platformer.html / /platformer)
**Status: Built, in testing**

Infinite side-scrolling runner. Auto-run, player jumps over obstacles and collects wings.

- Two obstacle types: angry wheelie bin, health inspector in a suit
- Double jump
- Speed ramps every 5 seconds, caps at 16
- Wing collectibles worth 500pts each + distance-based score
- Score saves to Wing Economy when logged in
- SFX reuses Wing Run sound files
- Assets: pixel-art sprite sheet (AI generated via fal.ai), night city background, brick platform tiles

**Known issue:** Standalone `file://` test doesn't render (canvas CORS restriction on local images). Works correctly when served by Express.

### 6.5 Sauce Shooter — Top-Down Shooter
**Status: Assets generated, game not built**

A top-down arcade shooter. Player (Chicken King riding a hot sauce bottle) defends the shop from incoming rival food vans. Shoot sauce bottles at them.

Assets ready:
- `player-ship.png` — chicken king on a sauce bottle, top-down
- `enemy-van-1.png` — red rival food van
- `enemy-van-2.png` — purple rival van (needs regeneration, currently wrong perspective)
- `bullet-sauce.png` — sriracha bottle projectile
- `explosion.png` — starburst explosion
- `powerup-shield.png` — red/gold shield
- `powerup-rapid.png` — sauce bottle + lightning bolt (rapid fire)
- `bg-tile.png` — dark tarmac road tile for top-down scrolling

Game not built yet — needs HTML/canvas implementation.

---

## 7. Game Asset Pipeline

Assets are AI-generated using fal.ai (Flux model) via custom Node.js scripts. SFX is sourced from Freesound.

### Scripts
| Script | Purpose |
|---|---|
| `scripts/generate-assets.js` | Generates all platformer + shooter sprites (4 variants each) using Flux Schnell |
| `scripts/generate-sprite-sheet.js` | Generates character animation sprite sheets (Flux Dev, higher quality) with all poses in one image for consistency |
| `scripts/fix-character-consistency.js` | img2img approach to regenerate animation frames matching a reference — **deprecated, doesn't work well** (strength 0.65 just clones the reference pose) |
| `scripts/download-sfx.js` | Downloads game SFX from Freesound API into `app/public/sfx/` |

### Sound Files (app/public/sfx/)
`snake-eat.mp3`, `snake-die.mp3`, `snake-start.mp3`, `snake-speedup.mp3`, `wr-deliver.mp3`, `wr-crash.mp3`, `wr-closecall.mp3`, `wr-powerup.mp3`, `wr-round.mp3`, `wr-hop.mp3`, `wr-combo.mp3`, `ui-click.mp3`

### Platformer Assets (app/public/game-assets/platformer/)
| Asset | Status | Notes |
|---|---|---|
| `player-idle.png` | ✅ Final | Fat white chicken king, gold 3-point crown, red bow tie — the reference character |
| `spritesheet-character_4.png` | ✅ Final | 4-frame animation sheet (1024×768), consistent crowns, used for run/jump animation |
| `enemy-bin.png` | ✅ Final | Angry blue wheelie bin, glowing red eyes |
| `enemy-inspector.png` | ✅ Final | Grumpy man in light blue suit with clipboard |
| `platform-tile.png` | ✅ Final | Dark charcoal bricks, gold mortar |
| `bg-city.png` | ✅ Final | Night city, neon signs — parallax background |
| `collectible-wing.png` | ✅ Final | Crispy golden-brown fried wing (food item, not a live bird) |

### Shooter Assets (app/public/game-assets/shooter/)
All shooter assets generated and cleaned. `enemy-van-2.png` needs a regeneration pass (isometric perspective, doesn't match the flat side-view of `enemy-van-1.png`).

---

## 8. Wing Economy

The points + rewards system that ties all games together.

### Earning Points
- All games call `POST /api/game/save` with `{ score, wings, crowns, coins, deliveries, bonus }`
- Points stack into `game_players.total_score`
- Each game weights points differently (Snake: crowns × big multiplier; Wing Run: deliveries × distance; Wing King: wings × 500 + distance)

### Wing Shop Tiers (on profile.html)
| Points | Reward |
|---|---|
| 80,000 | Free Can of Pop |
| 200,000 | Free Side |
| 750,000 | Free 6 Wings |
| 10,000,000 | Free 20 Wings (legendary) |

Each tier generates a unique discount code redeemable at checkout.

### Daily Streak (designed, partially built)
- Players can claim a daily bonus — streak multiplied rewards
- `game_players.daily_streak` + `game_players.last_daily_claim`
- `daily_completions` table tracks per-challenge per-day claims

---

## 9. Planned Features (Specced, Not Yet Built)

These have full design specs and implementation plans in `docs/superpowers/`:

### Feature 4: Wing Economy Full Implementation
- Wing Shop on profile page (redeem points → discount codes)
- Visual tier progress bar
- Daily check-in with streak bonus
- Plan: `docs/superpowers/plans/2026-05-03-wing-economy.md`

### Feature 5: Daily Drops & Challenges
- Daily mini-challenges per game ("collect 5 wings in Wing King today")
- Time-limited bonus drops (admin-controlled via stream config or admin panel)
- Streak rewards
- Plan: `docs/superpowers/plans/2026-05-03-daily-drops.md`

### Feature 6: Order Experience Upgrades
- Live order tracker on the post-checkout page (polls `GET /api/orders/track/:token`)
- Each order gets a `track_token` at creation
- Customer sees: Confirmed → Preparing → Ready / On the way → Delivered
- Plan: `docs/superpowers/plans/2026-05-03-order-experience.md`

---

## 10. Known Issues & Gaps

| Area | Issue |
|---|---|
| Wing King platformer | Needs to be served by Express to work — can't open as a local file due to canvas image CORS restrictions |
| Sauce Shooter | Assets exist, game not built |
| enemy-van-2 (shooter) | Wrong perspective (isometric instead of top-down flat) — needs regeneration |
| Platformer sprite sheet | Animation frames in `spritesheet-character_4.png` are consistent but different art style from `player-idle.png` — character looks slightly different at rest vs in motion |
| Wing Economy | Daily check-in and Wing Shop redemption UI partially built but not fully wired end-to-end |
| Score leaderboard | No per-game high score leaderboard visible to players (each player only sees their own high score) |
| Mobile layout | Games are fixed-width canvas — no touch layout optimisation, can be tiny on phones |
| SFX on iOS | Web Audio API on iOS requires user gesture to unlock — handled via `boot()` on first tap, but audio can still be delayed |
| No game-specific score history | Only total lifetime score is stored — no per-session or per-game breakdown |

---

## 11. Architecture Notes

- **Single server, single process**: Everything is one Express app, one SQLite file. No microservices.
- **No ORM**: Raw SQL via `better-sqlite3` prepared statements. Synchronous by design.
- **No bundler**: JavaScript is written directly in `<script>` tags. Wing Run uses Babel standalone for JSX — it's transpiled in the browser.
- **Auth is split**: Restaurant customers use `customers` table (phone-first, cookie-less). Game players use `game_players` table (email + password + Bearer token). Admins use `admin_sessions` + WebAuthn passkeys. These are three separate auth systems.
- **Stripe webhooks**: Order status is confirmed by Stripe webhook, not by redirect — prevents payment fraud.
- **Canvas games**: All games use the native Canvas 2D API. No game engine (Phaser etc.). Audio via Web Audio API with preloaded ArrayBuffer cache.
- **Assets are static files**: All game images and sounds are in `app/public/` served by Express's static middleware.

---

## 12. What a Full "V1 Complete" Looks Like

The system is already functional and in production. A "complete V1" would add:

1. **Sauce Shooter game** — the fourth arcade game, assets ready
2. **Wing Economy fully live** — Wing Shop redemption wired end-to-end, daily check-in streak UI
3. **Daily Drops** — admin can trigger time-limited bonus events tied to streams
4. **Live order tracker** — post-checkout page shows real-time order status
5. **Global leaderboard** — top scores per game visible to all players
6. **Mobile-optimised games** — responsive canvas scaling + better touch targets
7. **enemy-van-2 regeneration** — correct top-down perspective to match enemy-van-1
