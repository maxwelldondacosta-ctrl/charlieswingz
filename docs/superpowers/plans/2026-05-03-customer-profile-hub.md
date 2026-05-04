# Customer Profile Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/profile.html` page where logged-in customers can view their loyalty stamps, order history, game stats, and account details — using the existing `game_players` auth system.

**Architecture:** Four backend changes (two new DB statements, two new API routes) unlock two frontend changes (new `profile.html` + reorder param in `index.html`). All auth uses the existing `requireGameAuth` middleware and `cw_session` localStorage key. No new tables, no new auth infrastructure.

**Tech Stack:** Express.js, better-sqlite3, vanilla HTML/CSS/JS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/db.js` | Modify | Add `getOrdersByEmail` prepared statement and exported function |
| `app/server.js` | Modify | Add `GET /api/account/orders` and `GET /api/orders/:id/items` routes |
| `app/public/profile.html` | Create | Full profile hub — login gate, 4 tabs (Loyalty, Orders, Game, Account) |
| `app/public/index.html` | Modify | Read `?reorder=<id>` on load and pre-fill cart |

---

## Task 1: DB — getOrdersByEmail

**Files:**
- Modify: `app/db.js`

### Context

`db.js` has a `const stmts = {` block containing all prepared statements (around line 295). After `getAllOrders` (line 301), add the new `getOrdersByEmail` statement. Then, near the bottom of the file before `module.exports`, add the helper function.

The `module.exports` block is at the very bottom of the file and exports all public functions.

- [ ] **Step 1: Add the prepared statement**

In `db.js`, find this line:

```javascript
    getAllOrders: db.prepare('SELECT * FROM orders ORDER BY created_at DESC'),
```

Add the new statement directly after it:

```javascript
    getOrdersByEmail: db.prepare('SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC'),
```

- [ ] **Step 2: Add the helper function**

In `db.js`, find the `// ── Compat helpers` comment near the bottom. Add the following block **before** it:

```javascript
// ── Customer order history ────────────────────────────────────────────────────

function getOrdersByEmail(email) {
    const rows = stmts.getOrdersByEmail.all(email.toLowerCase());
    return rows.map(row => ({
        id:          row.id,
        createdAt:   row.created_at,
        status:      row.status,
        orderType:   row.order_type,
        totalPence:  row.total_pence,
        items:       JSON.parse(row.items_json || '[]')
    }));
}
```

- [ ] **Step 3: Export the new function**

In `db.js`, find the `module.exports = {` block. Add `getOrdersByEmail,` to the exported object alongside the other order functions.

- [ ] **Step 4: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add db.js
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add getOrdersByEmail db helper"
```

---

## Task 2: API Routes

**Files:**
- Modify: `app/server.js`

### Context

`server.js` has a group of `/api/account/` routes starting around line 2396. The pattern used is `requireGameAuth` middleware (defined at line 2231) which sets `req.playerEmail`.

The `db` object is imported at the top of server.js. All `db.*` calls use the exported functions from `db.js`.

- [ ] **Step 1: Add GET /api/account/orders**

In `server.js`, find the existing account profile route:

```javascript
app.get('/api/account/profile', requireGameAuth, (req, res) => {
```

Add the following **before** that line:

```javascript
// ── Customer order history (authenticated) ──────────────────────────────────
app.get('/api/account/orders', requireGameAuth, (req, res) => {
    const orders = db.getOrdersByEmail(req.playerEmail);
    res.json(orders);
});

```

- [ ] **Step 2: Add GET /api/orders/:id/items**

In `server.js`, find the public API routes section. Find the existing `GET /api/stream` route and add the following **after** it:

```javascript
// ── Order items (public — used by reorder flow) ──────────────────────────────
app.get('/api/orders/:id/items', (req, res) => {
    const order = db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ items: JSON.parse(order.items_json || '[]') });
});
```

- [ ] **Step 3: Manual test — GET /api/account/orders**

Start the server (`npm run dev` from `app/`). Log in via `game.html`, grab the token from localStorage (`JSON.parse(localStorage.getItem('cw_session')).token`), then:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/account/orders
```

Expected: JSON array of orders (empty array if none placed yet).

- [ ] **Step 4: Manual test — GET /api/orders/:id/items**

```bash
curl http://localhost:3000/api/orders/NONEXISTENT/items
```

Expected: `{"error":"Order not found"}` with 404 status.

- [ ] **Step 5: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add server.js
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add /api/account/orders and /api/orders/:id/items routes"
```

---

## Task 3: profile.html

**Files:**
- Create: `app/public/profile.html`

### Context

Design system (matches `live.html` exactly):
- `--gold: #D4A84B`, `--burgundy: #8B1A1A`, `--black: #0A0A0A`, `--cream: #F5F0E6`
- Fonts: Playfair Display (headings), Bebas Neue (labels/codes), Inter (body)
- Body: `border-left: 4px solid var(--gold)`, `border-right`, `border-bottom`
- Nav: same fixed nav as `live.html` — logo links to `/`, links: Menu, Live, Games, Profile (active)

Auth:
- Session stored in `localStorage` under key `cw_session` as `{ token, user: { name, email, id } }`
- Login: `POST /api/game/login` with `{ email, password }` → store response as `cw_session`
- All protected API calls: `Authorization: Bearer <token>` header

Existing API endpoints used:
- `POST /api/game/login` — login
- `GET /api/loyalty/progress` — loyalty data (requireGameAuth)
- `GET /api/account/orders` — order history (requireGameAuth) [new from Task 2]
- `GET /api/game/progress` — game stats (requireGameAuth)
- `GET /api/account/profile` — profile data (requireGameAuth)
- `POST /api/account/profile` — save profile (requireGameAuth)
- `POST /api/account/reset-request` — password reset

Loyalty response shape (from `GET /api/loyalty/progress`):
```json
{
  "stamps": 7,
  "maxStamps": 20,
  "tiers": [
    { "stamps": 10, "name": "Free 6 Wings", "valuePence": 850 },
    { "stamps": 20, "name": "Free 10 Wings", "valuePence": 1400 }
  ],
  "nextTier": { "stamps": 10, "name": "Free 6 Wings", "valuePence": 850 },
  "totalOrders": 3,
  "claimed": [],
  "rewards": [
    { "code": "CWLOYALABCD", "type": "fixed", "amountPence": 850, "description": "Free 6 Wings", "tier": 10 }
  ]
}
```

Game progress response shape (from `GET /api/game/progress`):
```json
{
  "totalScore": 12500,
  "highScore": 4200,
  "wingCount": 150,
  "crowns": 8,
  "coins": 320,
  "deliveries": 12,
  "plays": 25,
  "milestoneTier": 1,
  "unlockedCodes": {},
  "redeemedCodes": [],
  "rewards": [{ "icon": "🎁", "label": "10% OFF", "code": "CWMILE..." }]
}
```

Account profile response (from `GET /api/account/profile`):
```json
{ "name": "Charlie", "email": "charlie@example.com", "phone": "07...", "postcode": "E1 6RF", "contactPref": "sms" }
```

Orders response shape (from `GET /api/account/orders`):
```json
[
  {
    "id": "ord_xxx",
    "createdAt": "2026-05-03T19:34:00.000Z",
    "status": "delivered",
    "orderType": "delivery",
    "totalPence": 2800,
    "items": [
      { "id": "w10", "name": "10 Wings", "price": 1400, "quantity": 2, "wingCut": "Mixed", "flavourChoice": "Honey Garlic", "sauce": null, "drinkChoice": null }
    ]
  }
]
```

- [ ] **Step 1: Create profile.html**

Create `app/public/profile.html` with the following complete content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Charlie's Wingz | Profile</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Bebas+Neue&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --gold:      #D4A84B;
            --gold-light:#E8C97B;
            --burgundy:  #8B1A1A;
            --black:     #0A0A0A;
            --dark:      #111111;
            --dark2:     #1A1A1A;
            --border:    #2A2A2A;
            --cream:     #F5F0E6;
            --cream-dim: #9A9080;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        body {
            font-family: 'Inter', sans-serif;
            background: var(--black);
            color: var(--cream);
            min-height: 100vh;
            border-left:   4px solid var(--gold);
            border-right:  4px solid var(--gold);
            border-bottom: 4px solid var(--gold);
        }

        /* ── Nav ──────────────────────────────────────────────────────────── */
        .site-nav {
            position: fixed;
            top: 0; left: 0; right: 0;
            z-index: 100;
            background: rgba(10,10,10,0.95);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid rgba(212,168,75,0.3);
            padding: 0.6rem 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 2.6rem;
        }
        .nav-logo {
            font-family: 'Playfair Display', serif;
            font-size: 1rem;
            color: var(--gold);
            text-decoration: none;
            letter-spacing: 0.03em;
        }
        .nav-links { display: flex; gap: 1.5rem; align-items: center; }
        .nav-links a {
            font-size: 0.75rem;
            color: var(--cream);
            text-decoration: none;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            opacity: 0.7;
            transition: opacity 0.2s;
        }
        .nav-links a:hover, .nav-links a.active { opacity: 1; color: var(--gold); }
        .nav-right { display: flex; align-items: center; gap: 1rem; }
        .logout-btn {
            font-size: 0.7rem;
            color: var(--cream-dim);
            background: none;
            border: none;
            cursor: pointer;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            opacity: 0.6;
            transition: opacity 0.2s;
            display: none;
        }
        .logout-btn:hover { opacity: 1; }

        /* ── Page ─────────────────────────────────────────────────────────── */
        .page { padding-top: 2.6rem; min-height: 100vh; }

        /* ── Login state ──────────────────────────────────────────────────── */
        #state-login {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: calc(100vh - 2.6rem);
            padding: 2rem 1rem;
        }
        .login-card {
            background: var(--dark);
            border: 1px solid rgba(212,168,75,0.25);
            border-radius: 12px;
            padding: 2rem;
            width: 100%;
            max-width: 400px;
        }
        .login-card h1 {
            font-family: 'Playfair Display', serif;
            font-size: 1.6rem;
            color: var(--cream);
            margin-bottom: 0.3rem;
        }
        .login-card .sub {
            font-size: 0.85rem;
            color: var(--cream-dim);
            margin-bottom: 1.75rem;
        }
        .form-group { margin-bottom: 1rem; }
        .form-label {
            display: block;
            font-size: 0.7rem;
            color: var(--gold);
            letter-spacing: 0.1em;
            text-transform: uppercase;
            margin-bottom: 0.35rem;
        }
        .form-input {
            width: 100%;
            padding: 0.65rem 0.85rem;
            background: #0d0d0d;
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--cream);
            font-family: 'Inter', sans-serif;
            font-size: 0.9rem;
            transition: border-color 0.2s;
        }
        .form-input:focus { outline: none; border-color: var(--gold); }
        .btn-primary {
            width: 100%;
            padding: 0.8rem;
            background: linear-gradient(135deg, var(--gold), #B8922A);
            color: var(--black);
            border: none;
            border-radius: 6px;
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1rem;
            letter-spacing: 0.1em;
            cursor: pointer;
            margin-top: 0.5rem;
            transition: opacity 0.2s;
        }
        .btn-primary:hover { opacity: 0.9; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .login-error {
            font-size: 0.82rem;
            color: #ff6b6b;
            margin-top: 0.75rem;
            text-align: center;
            display: none;
        }
        .login-footer {
            margin-top: 1.25rem;
            text-align: center;
            font-size: 0.82rem;
            color: var(--cream-dim);
        }
        .login-footer a { color: var(--gold); text-decoration: none; }
        .login-footer a:hover { text-decoration: underline; }

        /* ── Profile state ────────────────────────────────────────────────── */
        #state-profile { display: none; }

        .profile-header {
            padding: 1.75rem 2rem 0;
            max-width: 900px;
            margin: 0 auto;
        }
        .profile-header h2 {
            font-family: 'Playfair Display', serif;
            font-size: 1.5rem;
            color: var(--cream);
            margin-bottom: 0.25rem;
        }
        .profile-header h2 span { color: var(--gold); }
        .profile-header p {
            font-size: 0.82rem;
            color: var(--cream-dim);
            margin-bottom: 1.25rem;
        }

        /* ── Tabs ─────────────────────────────────────────────────────────── */
        .profile-tabs-wrap {
            border-bottom: 1px solid var(--border);
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
        }
        .profile-tabs-wrap::-webkit-scrollbar { display: none; }
        .profile-tabs {
            display: flex;
            max-width: 900px;
            margin: 0 auto;
            padding: 0 2rem;
            gap: 0;
            white-space: nowrap;
        }
        .tab-btn {
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--cream-dim);
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.9rem;
            letter-spacing: 0.12em;
            padding: 0.75rem 1.25rem;
            cursor: pointer;
            transition: color 0.2s, border-color 0.2s;
        }
        .tab-btn:hover { color: var(--cream); }
        .tab-btn.active {
            color: var(--gold);
            border-bottom-color: var(--gold);
        }

        .tab-content {
            display: none;
            max-width: 900px;
            margin: 0 auto;
            padding: 1.5rem 2rem 3rem;
        }
        .tab-content.active { display: block; }

        /* ── Shared components ────────────────────────────────────────────── */
        .section-title {
            font-family: 'Playfair Display', serif;
            font-size: 1.05rem;
            color: var(--cream);
            margin-bottom: 1rem;
        }
        .card {
            background: var(--dark);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 1.25rem;
            margin-bottom: 1rem;
        }
        .reward-card {
            background: rgba(212,168,75,0.06);
            border: 1px solid rgba(212,168,75,0.3);
            border-radius: 8px;
            padding: 0.85rem 1rem;
            margin-bottom: 0.6rem;
            cursor: pointer;
            transition: background 0.15s;
            user-select: none;
        }
        .reward-card:hover { background: rgba(212,168,75,0.12); }
        .reward-card-label {
            font-size: 0.72rem;
            color: var(--cream-dim);
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 0.2rem;
        }
        .reward-card-code {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1.6rem;
            color: var(--gold);
            letter-spacing: 0.1em;
            line-height: 1;
            margin-bottom: 0.15rem;
        }
        .reward-card-hint {
            font-size: 0.7rem;
            color: var(--cream-dim);
        }
        .reward-card-hint.copied { color: #4caf50; }
        .empty-msg {
            font-size: 0.85rem;
            color: var(--cream-dim);
            text-align: center;
            padding: 2rem 1rem;
        }
        .empty-msg a { color: var(--gold); text-decoration: none; }

        /* ── Loyalty tab ──────────────────────────────────────────────────── */
        .stamp-count {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.9rem;
            letter-spacing: 0.15em;
            color: var(--cream-dim);
            margin-bottom: 0.75rem;
            text-transform: uppercase;
        }
        .stamp-circles {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 1rem;
        }
        .stamp-circle {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 2px solid var(--border);
            background: transparent;
            transition: background 0.2s, border-color 0.2s;
        }
        .stamp-circle.filled {
            background: var(--gold);
            border-color: var(--gold);
        }
        .stamp-msg {
            font-size: 0.85rem;
            color: var(--cream-dim);
            margin-bottom: 1.5rem;
        }
        .stamp-msg strong { color: var(--cream); }

        /* ── Orders tab ───────────────────────────────────────────────────── */
        .order-card {
            background: var(--dark);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 1rem 1.25rem;
            margin-bottom: 0.85rem;
        }
        .order-card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0.75rem;
            gap: 0.75rem;
            flex-wrap: wrap;
        }
        .order-date {
            font-size: 0.8rem;
            color: var(--cream-dim);
        }
        .status-badge {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.72rem;
            letter-spacing: 0.12em;
            padding: 0.2rem 0.6rem;
            border-radius: 4px;
            text-transform: uppercase;
        }
        .status-received, .status-preparing, .status-ready { background: rgba(212,168,75,0.15); color: var(--gold); }
        .status-delivered { background: rgba(76,175,80,0.15); color: #4caf50; }
        .status-cancelled { background: rgba(255,107,107,0.15); color: #ff6b6b; }
        .order-items {
            font-size: 0.82rem;
            color: var(--cream-dim);
            margin-bottom: 0.75rem;
            line-height: 1.7;
        }
        .order-items span { color: var(--cream); }
        .order-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 0.5rem;
        }
        .order-total {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1rem;
            color: var(--gold);
            letter-spacing: 0.05em;
        }
        .reorder-btn {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.8rem;
            letter-spacing: 0.1em;
            padding: 0.35rem 0.9rem;
            background: var(--burgundy);
            color: var(--cream);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: background 0.15s;
        }
        .reorder-btn:hover { background: #a02020; }

        /* ── Game tab ─────────────────────────────────────────────────────── */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }
        .stat-card {
            background: var(--dark);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 0.85rem 1rem;
            text-align: center;
        }
        .stat-value {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 1.8rem;
            color: var(--gold);
            letter-spacing: 0.05em;
            line-height: 1;
            margin-bottom: 0.2rem;
        }
        .stat-label {
            font-size: 0.65rem;
            color: var(--cream-dim);
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }

        /* ── Account tab ──────────────────────────────────────────────────── */
        .account-form .form-group { margin-bottom: 1rem; }
        .radio-group { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.35rem; }
        .radio-label {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            font-size: 0.85rem;
            color: var(--cream-dim);
            cursor: pointer;
        }
        .radio-label input { accent-color: var(--gold); }
        .save-msg {
            margin-top: 0.75rem;
            font-size: 0.85rem;
            text-align: center;
            display: none;
        }
        .text-link {
            color: var(--gold);
            background: none;
            border: none;
            cursor: pointer;
            font-size: 0.85rem;
            text-decoration: underline;
            padding: 0;
        }
        .email-readonly {
            font-size: 0.85rem;
            color: var(--cream-dim);
            padding: 0.4rem 0;
        }
        .divider {
            border: none;
            border-top: 1px solid var(--border);
            margin: 1.5rem 0;
        }

        /* ── Mobile ───────────────────────────────────────────────────────── */
        @media (max-width: 768px) {
            .site-nav { padding: 0.6rem 1rem; }
            .nav-links { gap: 0.75rem; }
            .nav-links a { font-size: 0.65rem; }
            .profile-header { padding: 1.5rem 1rem 0; }
            .profile-tabs { padding: 0 1rem; }
            .tab-content { padding: 1.25rem 1rem 3rem; }
            .stamp-circle { width: 30px; height: 30px; }
            .stats-grid { grid-template-columns: repeat(3, 1fr); }
            .order-card-header { flex-direction: column; align-items: flex-start; }
            .btn-primary, .reorder-btn { width: 100%; text-align: center; }
        }
    </style>
</head>
<body>

<nav class="site-nav">
    <a href="/" class="nav-logo">Charlie's Wingz</a>
    <div class="nav-right">
        <div class="nav-links">
            <a href="/">Menu</a>
            <a href="/live.html">Live</a>
            <a href="/game.html">Games</a>
            <a href="/profile.html" class="active">Profile</a>
        </div>
        <button class="logout-btn" id="logout-btn" onclick="logout()">Log Out</button>
    </div>
</nav>

<div class="page">

    <!-- ── LOGIN STATE ──────────────────────────────────────────────────── -->
    <div id="state-login">
        <div class="login-card">
            <h1>Your Profile</h1>
            <p class="sub">Sign in to see your loyalty stamps, orders, and game stats.</p>
            <form onsubmit="handleLogin(event)">
                <div class="form-group">
                    <label class="form-label" for="login-email">Email</label>
                    <input class="form-input" type="email" id="login-email" placeholder="your@email.com" required autocomplete="email">
                </div>
                <div class="form-group">
                    <label class="form-label" for="login-password">Password</label>
                    <input class="form-input" type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password">
                </div>
                <button class="btn-primary" type="submit" id="login-btn">Sign In</button>
                <div class="login-error" id="login-error"></div>
            </form>
            <div class="login-footer">
                Don't have an account? <a href="/game.html">Create one</a><br>
                <a href="#" onclick="showResetForm(); return false;" style="margin-top:0.5rem;display:inline-block">Forgot password?</a>
            </div>
        </div>
    </div>

    <!-- ── PROFILE STATE ────────────────────────────────────────────────── -->
    <div id="state-profile">
        <div class="profile-header">
            <h2>Welcome back, <span id="profile-name">—</span></h2>
            <p id="profile-email-header"></p>
        </div>

        <div class="profile-tabs-wrap">
            <div class="profile-tabs">
                <button class="tab-btn active" data-tab="loyalty" onclick="switchTab('loyalty')">Loyalty</button>
                <button class="tab-btn" data-tab="orders" onclick="switchTab('orders')">Orders</button>
                <button class="tab-btn" data-tab="game" onclick="switchTab('game')">Game</button>
                <button class="tab-btn" data-tab="account" onclick="switchTab('account')">Account</button>
            </div>
        </div>

        <!-- Tab: Loyalty -->
        <div id="tab-loyalty" class="tab-content active">
            <div class="card">
                <div class="stamp-count" id="stamp-count">— / — stamps</div>
                <div class="stamp-circles" id="stamp-circles"></div>
                <p class="stamp-msg" id="stamp-msg"></p>
            </div>
            <div class="section-title">Your Rewards</div>
            <div id="loyalty-rewards"><p class="empty-msg">Loading…</p></div>
        </div>

        <!-- Tab: Orders -->
        <div id="tab-orders" class="tab-content">
            <div id="orders-list"><p class="empty-msg">Loading…</p></div>
        </div>

        <!-- Tab: Game -->
        <div id="tab-game" class="tab-content">
            <div class="stats-grid" id="stats-grid"></div>
            <div class="section-title">Game Rewards</div>
            <div id="game-rewards"><p class="empty-msg">Loading…</p></div>
        </div>

        <!-- Tab: Account -->
        <div id="tab-account" class="tab-content">
            <div class="card">
                <h3 class="section-title">Account Details</h3>
                <div class="account-form">
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <div class="email-readonly" id="account-email"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="acc-name">Name</label>
                        <input class="form-input" type="text" id="acc-name" placeholder="Your name" autocomplete="name">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="acc-phone">Phone</label>
                        <input class="form-input" type="tel" id="acc-phone" placeholder="07..." autocomplete="tel">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="acc-postcode">Postcode</label>
                        <input class="form-input" type="text" id="acc-postcode" placeholder="E1 6RF" autocomplete="postal-code">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Contact Preference</label>
                        <div class="radio-group">
                            <label class="radio-label"><input type="radio" name="contactPref" value="sms"> SMS</label>
                            <label class="radio-label"><input type="radio" name="contactPref" value="whatsapp"> WhatsApp</label>
                            <label class="radio-label"><input type="radio" name="contactPref" value="email"> Email</label>
                            <label class="radio-label"><input type="radio" name="contactPref" value="both"> SMS &amp; Email</label>
                        </div>
                    </div>
                    <button class="btn-primary" onclick="saveAccount()">Save Changes</button>
                    <div class="save-msg" id="save-msg"></div>
                </div>
            </div>

            <div class="card">
                <h3 class="section-title">Password</h3>
                <p style="font-size:0.85rem;color:var(--cream-dim);margin-bottom:1rem">We'll send a reset link to your email.</p>
                <button class="text-link" id="reset-btn" onclick="requestPasswordReset()">Send password reset email</button>
                <div class="save-msg" id="reset-msg"></div>
            </div>
        </div>
    </div>

</div>

<script>
    // ── Helpers ───────────────────────────────────────────────────────────────
    function getSession() {
        try { return JSON.parse(localStorage.getItem('cw_session') || 'null'); } catch { return null; }
    }
    function getToken() {
        const s = getSession();
        return s ? s.token : null;
    }
    function authHeaders() {
        return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    async function handleLogin(e) {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        const errEl = document.getElementById('login-error');
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        errEl.style.display = 'none';

        const email    = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            const res = await fetch('/api/game/login', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) {
                errEl.textContent   = data.message || 'Invalid email or password.';
                errEl.style.display = 'block';
                btn.disabled        = false;
                btn.textContent     = 'Sign In';
                return;
            }
            localStorage.setItem('cw_session', JSON.stringify(data));
            showProfile(data);
        } catch (err) {
            errEl.textContent   = 'Connection error — please try again.';
            errEl.style.display = 'block';
            btn.disabled        = false;
            btn.textContent     = 'Sign In';
        }
    }

    function logout() {
        localStorage.removeItem('cw_session');
        document.getElementById('state-profile').style.display = 'none';
        document.getElementById('state-login').style.display   = 'flex';
        document.getElementById('logout-btn').style.display    = 'none';
    }

    async function showResetForm() {
        const email = document.getElementById('login-email').value.trim();
        if (!email) {
            alert('Enter your email address above first.');
            return;
        }
        await fetch('/api/account/reset-request', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        alert('If that email is registered, a reset link is on its way.');
    }

    function showProfile(session) {
        document.getElementById('state-login').style.display   = 'none';
        document.getElementById('state-profile').style.display = 'block';
        document.getElementById('logout-btn').style.display    = 'block';
        document.getElementById('profile-name').textContent    = session.user?.name || 'there';
        document.getElementById('profile-email-header').textContent = session.user?.email || '';
        loadLoyalty();
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    (function init() {
        const session = getSession();
        if (session && session.token) {
            showProfile(session);
        }
        // else: login state is already shown by default
    })();

    // ── Tab switching ─────────────────────────────────────────────────────────
    function switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
        document.getElementById('tab-' + tab).classList.add('active');

        if (tab === 'loyalty') loadLoyalty();
        if (tab === 'orders')  loadOrders();
        if (tab === 'game')    loadGame();
        if (tab === 'account') loadAccount();
    }

    // ── Loyalty tab ───────────────────────────────────────────────────────────
    async function loadLoyalty() {
        try {
            const res = await fetch('/api/loyalty/progress', { headers: authHeaders() });
            if (res.status === 401) { logout(); return; }
            if (!res.ok) return;
            renderLoyalty(await res.json());
        } catch (e) { /* server offline */ }
    }

    function renderLoyalty(data) {
        const { stamps, tiers, claimed, rewards, nextTier } = data;

        const allClaimed = claimed.length >= tiers.length;
        const prevTierStamps = claimed.length > 0 ? tiers[claimed.length - 1].stamps : 0;
        const progressInTier = allClaimed ? 10 : Math.max(0, stamps - prevTierStamps);
        const tierTarget = allClaimed ? 10 : (nextTier.stamps - prevTierStamps);

        // Stamp count
        document.getElementById('stamp-count').textContent = allClaimed
            ? 'All tiers claimed!'
            : `${progressInTier} / ${tierTarget} stamps`;

        // Circles
        const circlesEl = document.getElementById('stamp-circles');
        circlesEl.innerHTML = '';
        for (let i = 1; i <= tierTarget; i++) {
            const el = document.createElement('div');
            el.className = 'stamp-circle' + (i <= progressInTier ? ' filled' : '');
            circlesEl.appendChild(el);
        }

        // Message
        const remaining = tierTarget - progressInTier;
        document.getElementById('stamp-msg').innerHTML = allClaimed
            ? 'You\'ve claimed all rewards — keep ordering to earn more.'
            : `<strong>${remaining}</strong> more stamp${remaining === 1 ? '' : 's'} to unlock <strong>${nextTier.name}</strong>`;

        // Rewards
        const rewardsEl = document.getElementById('loyalty-rewards');
        if (!rewards || rewards.length === 0) {
            rewardsEl.innerHTML = '<p class="empty-msg">No rewards yet — earn stamps by ordering £25+.</p>';
            return;
        }
        rewardsEl.innerHTML = rewards.map(r => `
            <div class="reward-card" onclick="copyCode('${r.code}', this)">
                <div class="reward-card-label">${r.description || 'Loyalty Reward'}</div>
                <div class="reward-card-code">${r.code}</div>
                <div class="reward-card-hint">Tap to copy</div>
            </div>
        `).join('');
    }

    // ── Orders tab ────────────────────────────────────────────────────────────
    async function loadOrders() {
        const el = document.getElementById('orders-list');
        el.innerHTML = '<p class="empty-msg">Loading…</p>';
        try {
            const res = await fetch('/api/account/orders', { headers: authHeaders() });
            if (res.status === 401) { logout(); return; }
            if (!res.ok) { el.innerHTML = '<p class="empty-msg">Could not load orders.</p>'; return; }
            renderOrders(await res.json());
        } catch (e) { el.innerHTML = '<p class="empty-msg">Could not load orders.</p>'; }
    }

    function renderOrders(orders) {
        const el = document.getElementById('orders-list');
        if (!orders || orders.length === 0) {
            el.innerHTML = '<p class="empty-msg">No orders yet — <a href="/">ready to place your first?</a></p>';
            return;
        }
        el.innerHTML = orders.map(order => {
            const date = new Date(order.createdAt).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            const statusClass = 'status-' + (order.status || 'received');
            const itemsHtml = (order.items || []).map(item =>
                `<span>${item.quantity}× ${item.name}</span>${item.flavourChoice ? ` (${Array.isArray(item.flavourChoice) ? item.flavourChoice.join(', ') : item.flavourChoice})` : ''}`
            ).join('<br>');
            const total = '£' + ((order.totalPence || 0) / 100).toFixed(2);
            return `
                <div class="order-card">
                    <div class="order-card-header">
                        <span class="order-date">${date}</span>
                        <span class="status-badge ${statusClass}">${order.status || 'received'}</span>
                    </div>
                    <div class="order-items">${itemsHtml || '<em>No items</em>'}</div>
                    <div class="order-footer">
                        <span class="order-total">${total}</span>
                        <a class="reorder-btn" href="/?reorder=${order.id}">Reorder</a>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ── Game tab ──────────────────────────────────────────────────────────────
    async function loadGame() {
        try {
            const res = await fetch('/api/game/progress', { headers: authHeaders() });
            if (res.status === 401) { logout(); return; }
            if (!res.ok) return;
            renderGame(await res.json());
        } catch (e) { /* server offline */ }
    }

    function renderGame(data) {
        const stats = [
            { label: 'High Score',  value: (data.highScore || 0).toLocaleString() },
            { label: 'Total Score', value: (data.totalScore || 0).toLocaleString() },
            { label: 'Wings Eaten', value: data.wingCount || 0 },
            { label: 'Crowns',      value: data.crowns || 0 },
            { label: 'Coins',       value: data.coins || 0 },
            { label: 'Deliveries',  value: data.deliveries || 0 },
            { label: 'Games',       value: data.plays || 0 },
            { label: 'Milestone',   value: 'Tier ' + (data.milestoneTier || 0) },
        ];
        document.getElementById('stats-grid').innerHTML = stats.map(s => `
            <div class="stat-card">
                <div class="stat-value">${s.value}</div>
                <div class="stat-label">${s.label}</div>
            </div>
        `).join('');

        const rewardsEl = document.getElementById('game-rewards');
        const rewards = data.rewards || [];
        if (rewards.length === 0) {
            rewardsEl.innerHTML = '<p class="empty-msg">No game rewards yet — reach 10,000 points to unlock your first code.</p>';
            return;
        }
        rewardsEl.innerHTML = rewards.map(r => `
            <div class="reward-card" onclick="copyCode('${r.code}', this)">
                <div class="reward-card-label">${r.label || 'Game Reward'}</div>
                <div class="reward-card-code">${r.code}</div>
                <div class="reward-card-hint">Tap to copy</div>
            </div>
        `).join('');
    }

    // ── Account tab ───────────────────────────────────────────────────────────
    async function loadAccount() {
        try {
            const res = await fetch('/api/account/profile', { headers: authHeaders() });
            if (res.status === 401) { logout(); return; }
            if (!res.ok) return;
            const p = await res.json();
            document.getElementById('account-email').textContent    = p.email || '';
            document.getElementById('acc-name').value               = p.name || '';
            document.getElementById('acc-phone').value              = p.phone || '';
            document.getElementById('acc-postcode').value           = p.postcode || '';
            const pref = p.contactPref || 'sms';
            const radio = document.querySelector(`input[name="contactPref"][value="${pref}"]`);
            if (radio) radio.checked = true;
        } catch (e) { /* server offline */ }
    }

    async function saveAccount() {
        const msgEl = document.getElementById('save-msg');
        const contactPref = document.querySelector('input[name="contactPref"]:checked')?.value || 'sms';
        const body = {
            name:        document.getElementById('acc-name').value.trim(),
            phone:       document.getElementById('acc-phone').value.trim(),
            postcode:    document.getElementById('acc-postcode').value.trim(),
            contactPref
        };
        try {
            const res = await fetch('/api/account/profile', {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
            });
            if (res.status === 401) { logout(); return; }
            if (!res.ok) throw new Error(res.status);
            // Update stored name
            const session = getSession();
            if (session && session.user && body.name) {
                session.user.name = body.name;
                localStorage.setItem('cw_session', JSON.stringify(session));
                document.getElementById('profile-name').textContent = body.name;
            }
            msgEl.style.color   = '#4caf50';
            msgEl.textContent   = '✓ Saved';
            msgEl.style.display = 'block';
            setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
        } catch (e) {
            msgEl.style.color   = '#ff6b6b';
            msgEl.textContent   = '✗ Save failed — please try again.';
            msgEl.style.display = 'block';
        }
    }

    async function requestPasswordReset() {
        const msgEl  = document.getElementById('reset-msg');
        const btn    = document.getElementById('reset-btn');
        const session = getSession();
        const email  = session?.user?.email;
        if (!email) return;
        btn.disabled = true;
        try {
            await fetch('/api/account/reset-request', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            msgEl.style.color   = '#4caf50';
            msgEl.textContent   = '✓ Reset link sent — check your email.';
            msgEl.style.display = 'block';
        } catch (e) {
            msgEl.style.color   = '#ff6b6b';
            msgEl.textContent   = '✗ Could not send reset email.';
            msgEl.style.display = 'block';
            btn.disabled = false;
        }
    }

    // ── Copy code ─────────────────────────────────────────────────────────────
    function copyCode(code, cardEl) {
        navigator.clipboard.writeText(code).then(() => {
            const hint = cardEl.querySelector('.reward-card-hint');
            hint.textContent = '✓ Copied!';
            hint.classList.add('copied');
            setTimeout(() => {
                hint.textContent = 'Tap to copy';
                hint.classList.remove('copied');
            }, 2000);
        }).catch(() => {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = code;
            ta.style.position = 'fixed';
            ta.style.opacity  = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            const hint = cardEl.querySelector('.reward-card-hint');
            hint.textContent = '✓ Copied!';
            hint.classList.add('copied');
            setTimeout(() => {
                hint.textContent = 'Tap to copy';
                hint.classList.remove('copied');
            }, 2000);
        });
    }
</script>
</body>
</html>
```

- [ ] **Step 2: Manual test — login gate**

Open `http://localhost:3000/profile.html` in a browser (server must be running). Without logging in, you should see the centred login card with email/password fields and a "Create one" link.

- [ ] **Step 3: Manual test — login and loyalty tab**

Log in with a valid game account email/password. The profile hub should appear with "Welcome back, [Name]" and the Loyalty tab active. The stamp circles should render based on actual DB data.

- [ ] **Step 4: Manual test — all tabs**

Click each tab — Orders, Game, Account. Each should load data from the relevant API endpoint. Account tab should show editable fields pre-filled with profile data.

- [ ] **Step 5: Manual test — mobile**

In DevTools, resize to 375px. Tabs should scroll horizontally. Stamp circles and stat cards should reflow correctly. Buttons should be full-width.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add public/profile.html
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add customer profile hub at /profile.html"
```

---

## Task 4: Reorder param in index.html

**Files:**
- Modify: `app/public/index.html`

### Context

`index.html` already handles URL params at the bottom of the `<script>` block. There is an existing IIFE called `handleCheckoutReturn` at approximately line 3313 that reads `?order_success=1`.

The `cart` variable is a module-level array. `updateCartUI()` is a function that re-renders the cart sidebar. The cart sidebar is toggled open by adding the class `active` to `.cart-sidebar`.

The `MENU` object is defined at `let MENU = { wings: {...}, meals: {...}, bundles: {...}, sides: {...} }`. Checking `Object.assign({}, MENU.wings, MENU.meals, MENU.bundles, MENU.sides)[itemId]` tells us if an item still exists on the menu.

The items returned by `GET /api/orders/:id/items` are the raw stored cart items and have this shape:
```json
{ "id": "w10", "name": "10 Wings", "price": 1400, "quantity": 2, "wingCut": "Mixed", "flavourChoice": "Honey Garlic", "sauce": null, "drinkChoice": null }
```

- [ ] **Step 1: Add reorder handler after the handleCheckoutReturn IIFE**

In `index.html`, find the closing of the `handleCheckoutReturn` IIFE. It ends with:
```javascript
        })();
```

After that closing line, add:

```javascript
        // ── Reorder pre-fill ─────────────────────────────────────────────────
        (function handleReorder() {
            const params    = new URLSearchParams(window.location.search);
            const reorderId = params.get('reorder');
            if (!reorderId) return;

            fetch('/api/orders/' + reorderId + '/items')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!data || !data.items || data.items.length === 0) return;
                    const allItems = Object.assign({}, MENU.wings, MENU.meals, MENU.bundles, MENU.sides);
                    data.items.forEach(item => {
                        if (!allItems[item.id]) return; // item no longer on menu — skip
                        const existing = cart.findIndex(c => c.id === item.id);
                        if (existing >= 0) {
                            cart[existing].quantity += (item.quantity || 1);
                        } else {
                            cart.push({
                                id:            item.id,
                                name:          item.name,
                                price:         allItems[item.id].price, // use current price
                                quantity:      item.quantity || 1,
                                wingCut:       item.wingCut       || 'Mixed',
                                flavourChoice: item.flavourChoice || null,
                                sauce:         item.sauce         || null,
                                drinkChoice:   item.drinkChoice   || null
                            });
                        }
                    });
                    updateCartUI();
                    // Open the cart sidebar so the customer sees their pre-filled items
                    const sidebar = document.querySelector('.cart-sidebar');
                    if (sidebar) sidebar.classList.add('active');
                })
                .catch(() => { /* fetch failed — silently ignore */ });
        })();
```

- [ ] **Step 2: Manual test — reorder flow**

1. Place a test order through the site (or find an existing order ID in the DB)
2. Navigate to `http://localhost:3000/?reorder=<order-id>`
3. The page should load normally and the cart sidebar should open with items pre-filled
4. Verify the items match what was in the original order
5. Any item with an ID not in MENU (e.g. a retired item) should be silently skipped

- [ ] **Step 3: Manual test — invalid order ID**

Navigate to `http://localhost:3000/?reorder=doesnotexist`. The page should load normally with an empty cart — no errors visible.

- [ ] **Step 4: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add public/index.html
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add reorder pre-fill via ?reorder= param in index.html"
```

---

## Self-Review

**Spec coverage:**
- ✅ Login gate → login card, `POST /api/game/login`, `cw_session` localStorage
- ✅ Loyalty tab (default) → stamp circles, progress message, reward codes via `GET /api/loyalty/progress`
- ✅ Orders tab → order list with status, items, total, reorder button
- ✅ Reorder button → `/?reorder=<id>`, cart pre-fill via `GET /api/orders/:id/items`
- ✅ Game stats tab → stats grid + reward codes via `GET /api/game/progress`
- ✅ Account tab → editable fields, save via `POST /api/account/profile`, password reset
- ✅ Design system → `#0A0A0A` bg, `#D4A84B` gold, 4px borders, Playfair/Bebas/Inter
- ✅ Mobile → tabs scroll horizontally, stamp circles wrap, full-width buttons

**Type consistency:** All API endpoints and response shapes are consistent with what `server.js` actually returns. `getOrdersByEmail` maps DB snake_case to camelCase matching the spec response shape. `GET /api/orders/:id/items` returns `{ items: [...] }` which is what the reorder handler reads.

**No placeholders:** All code blocks are complete and correct.
