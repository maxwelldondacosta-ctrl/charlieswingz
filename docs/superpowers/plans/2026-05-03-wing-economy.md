# Wing Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Wing Shop where players spend game points (`total_score`) on discount codes, and retire the old milestone unlock system.

**Architecture:** `total_score` is the spendable balance — spending decrements it directly. A `WING_SHOP` constant in `server.js` defines all items (not DB). One new DB helper (`spendPoints`) does an atomic decrement with an `AND total_score >= ?` guard. Two new API routes handle shop browsing and redemption. The profile Game tab gains a points balance display and shop grid.

**Tech Stack:** Express.js, better-sqlite3, vanilla HTML/CSS/JS, Node.js `crypto` (already required)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/db.js` | Modify | Add `spendPoints` prepared statement and helper function |
| `app/server.js` | Modify | Add `WING_SHOP` constant, `GET /api/game/shop`, `POST /api/game/shop/redeem`; retire milestone logic |
| `app/public/profile.html` | Modify | Add points balance + Wing Shop grid to Game tab |

---

## Task 1: DB — spendPoints helper

**Files:**
- Modify: `app/db.js`

### Context

`db.js` has a `const stmts = {` block (~line 320) containing all prepared statements. The `module.exports` block is at the bottom (~line 1612). The `getOrdersByEmail` statement is near the referral statements (~line 307).

- [ ] **Step 1: Add the prepared statement**

In `app/db.js`, find this block inside `const stmts = {`:

```javascript
    getReferralCount:        db.prepare('SELECT referral_count FROM game_players WHERE email = ?'),
```

Add the new statement immediately after it:

```javascript
    spendPoints:             db.prepare('UPDATE game_players SET total_score = total_score - ? WHERE email = ? AND total_score >= ?'),
```

- [ ] **Step 2: Add the helper function**

In `app/db.js`, find the comment `// ── Stream config ───` (around line 1460). Add the following block **before** it:

```javascript
// ── Wing Shop ─────────────────────────────────────────────────────────────────

function spendPoints(email, amount) {
    const result = stmts.spendPoints.run(amount, email.toLowerCase(), amount);
    return result.changes === 1;
}
```

- [ ] **Step 3: Export the function**

In `app/db.js`, find the `module.exports = {` block at the bottom. Add `spendPoints,` to the exported object. It should sit near the other game-related exports.

- [ ] **Step 4: Verify syntax**

```bash
node --check "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app/db.js"
```

Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add db.js
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add spendPoints DB helper for Wing Shop"
```

---

## Task 2: Server — WING_SHOP constant, routes, retire milestones

**Files:**
- Modify: `app/server.js`

### Context

- `GAME_MILESTONES` constant is at ~line 2157
- `/api/game/save` handler is at ~line 2296 — contains the milestone-check block (lines ~2312–2330)
- `/api/game/claim-code` route is at ~line 2349
- Public API routes are grouped near `app.get('/api/stream'` (~line 719)
- `requireGameAuth` middleware exists and sets `req.playerEmail`
- `crypto` is already required at the top of the file
- `db.insertDiscount` exists and takes named params: `{ code, email, type, percent, amount_pence, fixed_amount, source, description, milestone, customer_name, created_at }`
- Discount `type: 'fixed'` uses `amount_pence` for the deduction; `type: 'percent'` uses `percent`

### Step 1: Replace GAME_MILESTONES with WING_SHOP

Find these lines (~line 2157):

```javascript
const GAME_MILESTONES = [
    { target: 10000,  discount: '£2',  percent: 0, fixedAmount: 200 },
    { target: 100000, discount: '£4', percent: 0, fixedAmount: 400 }
];
```

Replace with:

```javascript
const WING_SHOP = [
    { id: 'pop',     name: 'Free Can of Pop',                    points: 80000,    type: 'fixed',   percent: 0,  fixedPence: 80   },
    { id: 'side',    name: 'Free Side',                          points: 200000,   type: 'fixed',   percent: 0,  fixedPence: 250  },
    { id: 'three',   name: '£3 Off',                             points: 300000,   type: 'fixed',   percent: 0,  fixedPence: 300  },
    { id: 'ten',     name: '10% Off',                            points: 400000,   type: 'percent', percent: 10, fixedPence: 0    },
    { id: 'wings6',  name: 'Free 6 Wings',                       points: 750000,   type: 'fixed',   percent: 0,  fixedPence: 850  },
    { id: 'twenty',  name: '20% Off',                            points: 1000000,  type: 'percent', percent: 20, fixedPence: 0    },
    { id: 'wings20', name: 'Free 20 Wings (pay delivery only)',  points: 10000000, type: 'fixed',   percent: 0,  fixedPence: 2600 },
];
```

- [ ] **Step 2: Remove milestone-check logic from /api/game/save**

In the `/api/game/save` handler, find and **remove** this entire block (the milestone check, from the comment to the closing `}`):

```javascript
    // Check for new milestone unlocks using escalating tier system
    const newUnlocks = [];
    if (!player.unlockedCodes) player.unlockedCodes = {};
    if (!player.milestoneTier) player.milestoneTier = 0;
    const tier = player.milestoneTier;
    const baseTargets = [10000, 100000];
    const escalation = [140000, 150000];
    const currentTargets = baseTargets.map((base, i) => base + (tier * escalation[i]));
    for (let i = 0; i < currentTargets.length; i++) {
        const t = currentTargets[i];
        const milestoneKey = 'tier' + tier + '_' + t;
        if (player.totalScore >= t && !player.unlockedCodes[milestoneKey]) {
            newUnlocks.push(t);
        }
    }
```

Then update the `res.json(...)` at the end of the handler to remove `newUnlocks` and `milestoneTier` from the response. Find:

```javascript
    res.json({ totalScore: player.totalScore, highScore: player.highScore, coins: player.coins, deliveries: player.deliveries, totalDeliveries: player.deliveries, plays: player.plays, wingCount: player.wingCount, crowns: player.crowns, unlockedCodes: player.unlockedCodes || {}, redeemedCodes: player.redeemedCodes || [], rewards, newUnlocks, milestoneTier: player.milestoneTier || 0 });
```

Replace with:

```javascript
    res.json({ totalScore: player.totalScore, highScore: player.highScore, coins: player.coins, deliveries: player.deliveries, totalDeliveries: player.deliveries, plays: player.plays, wingCount: player.wingCount, crowns: player.crowns });
```

- [ ] **Step 3: Retire /api/game/claim-code**

Find the `app.post('/api/game/claim-code', ...)` route. Replace its entire handler body with:

```javascript
app.post('/api/game/claim-code', requireGameAuth, (req, res) => {
    res.status(410).json({ message: 'Milestones have been replaced by the Wing Shop. Visit your profile to spend your points.' });
});
```

- [ ] **Step 4: Add GET /api/game/shop**

Find the `app.get('/api/stream', ...)` route (~line 719). Add the new shop route immediately after it:

```javascript
// ── Wing Shop ────────────────────────────────────────────────────────────────
app.get('/api/game/shop', (req, res) => {
    res.json(WING_SHOP.map(({ id, name, points }) => ({ id, name, points })));
});
```

- [ ] **Step 5: Add POST /api/game/shop/redeem**

Immediately after the `GET /api/game/shop` route, add:

```javascript
app.post('/api/game/shop/redeem', requireGameAuth, (req, res) => {
    const { itemId } = req.body;
    const item = WING_SHOP.find(i => i.id === itemId);
    if (!item) return res.status(400).json({ message: 'Item not found' });

    const player = getPlayer(req.playerEmail);
    if (!player) return res.status(404).json({ message: 'Player not found' });
    if ((player.totalScore || 0) < item.points) {
        return res.status(400).json({ message: 'Not enough points' });
    }

    const spent = db.spendPoints(req.playerEmail, item.points);
    if (!spent) return res.status(400).json({ message: 'Not enough points' });

    const code = 'WING-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    db.insertDiscount.run ? stmts_insertDiscount(code, req.playerEmail, item) : null; // placeholder replaced below
    // Use the db module's prepared statement directly:
    const stmts = db; // db exports helpers, not stmts — use the pattern below
    db.insertWingShopDiscount({ code, email: req.playerEmail, item });

    const newBalance = (player.totalScore || 0) - item.points;
    res.json({ code, newBalance });
});
```

Wait — the above draft is incorrect. The correct pattern based on the existing codebase is to call `stmts.insertDiscount.run(...)` directly via `db`. Let me look at how `insertReferralDiscount` works and use the same pattern.

**Correct Step 5 — replace the entire redeem route with:**

```javascript
app.post('/api/game/shop/redeem', requireGameAuth, (req, res) => {
    const { itemId } = req.body;
    const item = WING_SHOP.find(i => i.id === itemId);
    if (!item) return res.status(400).json({ message: 'Item not found' });

    const player = getPlayer(req.playerEmail);
    if (!player) return res.status(404).json({ message: 'Player not found' });
    if ((player.totalScore || 0) < item.points) {
        return res.status(400).json({ message: 'Not enough points' });
    }

    const spent = db.spendPoints(req.playerEmail, item.points);
    if (!spent) return res.status(400).json({ message: 'Not enough points' });

    const code = 'WING-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    db.insertReferralDiscount({
        code,
        email: req.playerEmail,
        percent:     item.type === 'percent' ? item.percent : 0,
        source:      'wing-shop',
        description: item.name + ' (Wing Shop)'
    });

    const newBalance = (player.totalScore || 0) - item.points;
    res.json({ code, newBalance });
});
```

Wait — `insertReferralDiscount` only handles percent discounts (it hardcodes `type: 'percent'`, `amount_pence: 0`, `fixed_amount: 0`). Fixed-amount Wing Shop items need `type: 'fixed'` and `amount_pence: item.fixedPence`. Use `insertWingShopDiscount` instead — but that doesn't exist yet. Add it to db.js first.

**Revised approach:** Add a second DB helper `insertWingShopDiscount` in Task 1 instead, then use it here.

**Go back and add to Task 1 Step 2** the following additional function (add it right after `spendPoints`):

```javascript
function insertWingShopDiscount({ code, email, item }) {
    if (!email) return;
    stmts.insertDiscount.run({
        code,
        email:        email.toLowerCase(),
        type:         item.type,
        percent:      item.percent,
        amount_pence: item.fixedPence,
        fixed_amount: item.fixedPence,
        source:       'wing-shop',
        description:  item.name + ' (Wing Shop)',
        milestone:    null,
        customer_name: null,
        created_at:   new Date().toISOString()
    });
}
```

And export `insertWingShopDiscount` from `module.exports` alongside `spendPoints`.

**Then Step 5 final version:**

```javascript
app.post('/api/game/shop/redeem', requireGameAuth, (req, res) => {
    const { itemId } = req.body;
    const item = WING_SHOP.find(i => i.id === itemId);
    if (!item) return res.status(400).json({ message: 'Item not found' });

    const player = getPlayer(req.playerEmail);
    if (!player) return res.status(404).json({ message: 'Player not found' });
    if ((player.totalScore || 0) < item.points) {
        return res.status(400).json({ message: 'Not enough points' });
    }

    const spent = db.spendPoints(req.playerEmail, item.points);
    if (!spent) return res.status(400).json({ message: 'Not enough points' });

    const code = 'WING-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    db.insertWingShopDiscount({ code, email: req.playerEmail, item });

    const newBalance = (player.totalScore || 0) - item.points;
    res.json({ code, newBalance });
});
```

- [ ] **Step 6: Verify syntax**

```bash
node --check "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app/server.js"
```

Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add server.js
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add Wing Shop routes and retire milestone system"
```

---

## Task 1 Addendum — insertWingShopDiscount (fix before Task 2)

Before starting Task 2, go back to Task 1 Step 2 and add the second function. The complete code block for `app/db.js` Task 1 Step 2 should be:

```javascript
// ── Wing Shop ─────────────────────────────────────────────────────────────────

function spendPoints(email, amount) {
    const result = stmts.spendPoints.run(amount, email.toLowerCase(), amount);
    return result.changes === 1;
}

function insertWingShopDiscount({ code, email, item }) {
    if (!email) return;
    stmts.insertDiscount.run({
        code,
        email:         email.toLowerCase(),
        type:          item.type,
        percent:       item.percent,
        amount_pence:  item.fixedPence,
        fixed_amount:  item.fixedPence,
        source:        'wing-shop',
        description:   item.name + ' (Wing Shop)',
        milestone:     null,
        customer_name: null,
        created_at:    new Date().toISOString()
    });
}
```

Export both: `spendPoints, insertWingShopDiscount,` in `module.exports`.

---

## Task 3: Profile — Wing Shop UI

**Files:**
- Modify: `app/public/profile.html`

### Context

- The Game tab is `<div id="tab-game" class="tab-content">` (~line 596)
- `loadGame()` fetches `GET /api/game/progress` and calls `renderGame(data)` (~line 872)
- `renderGame` builds a stats grid and a `#game-rewards` section
- `data.totalScore` is available in `renderGame`
- The `.card` and `.section-title` CSS classes exist and should be reused for shop cards
- `authHeaders()` function exists for authenticated fetches
- `escapeHtml()` helper exists

### Step 1: Add Wing Shop CSS

Find the comment `/* ── Referral Card ──` in the `<style>` block. Add the following block **before** it:

```css
/* ── Wing Shop ── */
.wing-shop-balance {
    font-size: 0.85rem;
    color: #aaa;
    margin-bottom: 1rem;
}
.wing-shop-balance strong {
    font-size: 1.3rem;
    color: var(--gold);
    font-weight: 700;
}
.shop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.75rem;
    margin-top: 0.75rem;
}
.shop-item {
    background: var(--card-bg, #1a1a1a);
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    transition: border-color 0.2s;
}
.shop-item.affordable {
    border-color: var(--gold, #d4a843);
}
.shop-item.dimmed {
    opacity: 0.45;
}
.shop-item-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--cream, #f5f0e8);
    line-height: 1.3;
}
.shop-item-cost {
    font-size: 0.75rem;
    color: var(--gold, #d4a843);
    font-weight: 600;
}
.shop-item-btn {
    margin-top: auto;
    padding: 0.4rem 0;
    background: var(--gold, #d4a843);
    color: #000;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
}
.shop-item-btn:hover:not(:disabled) { opacity: 0.85; }
.shop-item-btn:disabled {
    background: #333;
    color: #666;
    cursor: not-allowed;
}
.shop-item-redeemed {
    font-size: 0.75rem;
    color: #4caf50;
    text-align: center;
    margin-top: 0.25rem;
}
.shop-item-code {
    font-family: monospace;
    font-size: 0.85rem;
    color: var(--gold, #d4a843);
    font-weight: 700;
    text-align: center;
}
```

- [ ] **Step 2: Add Wing Shop HTML to the Game tab**

In `app/public/profile.html`, find the Game tab content (inside `<div id="tab-game" ...>`):

```html
            <div id="game-rewards"><p class="empty-msg">Loading…</p></div>
```

Add the following **after** that line (still inside `#tab-game`):

```html
            <!-- Wing Shop -->
            <div class="section-title" style="margin-top:1.5rem">Wing Shop</div>
            <div class="wing-shop-balance" id="shop-balance"></div>
            <div class="shop-grid" id="shop-grid"><p class="empty-msg">Loading shop…</p></div>
```

- [ ] **Step 3: Add loadShop and redeemShopItem functions**

Find the `// ── Account tab ───` comment in the JavaScript section (~line 918). Add the following block **before** that comment:

```javascript
    // ── Wing Shop ─────────────────────────────────────────────────────────────
    let _shopItems = [];
    let _shopScore = 0;

    async function loadShop(playerScore) {
        _shopScore = playerScore || 0;
        const balanceEl = document.getElementById('shop-balance');
        const gridEl    = document.getElementById('shop-grid');
        if (!balanceEl || !gridEl) return;

        balanceEl.innerHTML = 'Your Points: <strong>' + _shopScore.toLocaleString() + '</strong>';

        try {
            const res = await fetch('/api/game/shop');
            if (!res.ok) { gridEl.innerHTML = '<p class="empty-msg">Shop unavailable.</p>'; return; }
            _shopItems = await res.json();
            renderShop();
        } catch (e) {
            gridEl.innerHTML = '<p class="empty-msg">Shop unavailable.</p>';
        }
    }

    function renderShop() {
        const gridEl = document.getElementById('shop-grid');
        if (!gridEl || !_shopItems.length) return;
        gridEl.innerHTML = _shopItems.map(item => {
            const canAfford = _shopScore >= item.points;
            return `
                <div class="shop-item ${canAfford ? 'affordable' : 'dimmed'}" id="shop-item-${escapeHtml(item.id)}">
                    <div class="shop-item-name">${escapeHtml(item.name)}</div>
                    <div class="shop-item-cost">${item.points.toLocaleString()} pts</div>
                    <button class="shop-item-btn"
                        onclick="redeemShopItem('${escapeHtml(item.id)}')"
                        ${canAfford ? '' : 'disabled'}>
                        Redeem
                    </button>
                </div>`;
        }).join('');
    }

    async function redeemShopItem(itemId) {
        const cardEl = document.getElementById('shop-item-' + itemId);
        const btn = cardEl ? cardEl.querySelector('.shop-item-btn') : null;
        if (btn) { btn.disabled = true; btn.textContent = 'Redeeming…'; }

        try {
            const res = await fetch('/api/game/shop/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ itemId })
            });
            const data = await res.json();
            if (!res.ok) {
                if (btn) { btn.disabled = false; btn.textContent = 'Redeem'; }
                if (cardEl) {
                    const err = document.createElement('p');
                    err.className = 'shop-item-redeemed';
                    err.style.color = '#ff6b6b';
                    err.textContent = data.message || 'Failed';
                    cardEl.appendChild(err);
                }
                return;
            }
            // Update score balance
            _shopScore = data.newBalance;
            document.getElementById('shop-balance').innerHTML =
                'Your Points: <strong>' + _shopScore.toLocaleString() + '</strong>';

            // Replace card content with code
            if (cardEl) {
                cardEl.classList.remove('affordable');
                cardEl.innerHTML = `
                    <div class="shop-item-name">${escapeHtml(_shopItems.find(i => i.id === itemId)?.name || 'Reward')}</div>
                    <div class="shop-item-code">${escapeHtml(data.code)}</div>
                    <p class="shop-item-redeemed">✓ Added to your rewards</p>
                    <button class="shop-item-btn" onclick="navigator.clipboard?.writeText('${escapeHtml(data.code)}').then(()=>this.textContent='Copied!')">Copy code</button>`;
            }

            // Re-render other cards to reflect new balance
            renderShop();
            // Restore the redeemed card's display (renderShop overwrites it)
            // Re-render is only for affordability states — the redeemed card is already replaced above
        } catch (e) {
            if (btn) { btn.disabled = false; btn.textContent = 'Redeem'; }
        }
    }
```

- [ ] **Step 4: Wire loadShop into renderGame**

Find the `renderGame(data)` function (~line 881). At the very end of it (after the `rewardsEl.querySelectorAll(...)` block), add:

```javascript
        loadShop(data.totalScore || 0);
```

Also update the stats array in `renderGame` — find `{ label: 'Milestone Tier', value: 'Tier ' + (data.milestoneTier || 0) },` and **remove** that line, since milestones are retired. Also remove `{ label: 'Coins', value: data.coins || 0 },` since coins were dropped.

The updated stats array should be:
```javascript
        const stats = [
            { label: 'High Score',  value: (data.highScore || 0).toLocaleString() },
            { label: 'Total Score', value: (data.totalScore || 0).toLocaleString() },
            { label: 'Wings Eaten', value: data.wingCount || 0 },
            { label: 'Crowns',      value: data.crowns || 0 },
            { label: 'Deliveries',  value: data.deliveries || 0 },
            { label: 'Games',       value: data.plays || 0 },
        ];
```

Also update the empty-state message in `renderGame`. Find:
```javascript
            rewardsEl.innerHTML = '<p class="empty-msg">No game rewards yet — reach 10,000 points to unlock your first code.</p>';
```

Replace with:
```javascript
            rewardsEl.innerHTML = '<p class="empty-msg">No game rewards yet — visit the Wing Shop below to spend your points.</p>';
```

- [ ] **Step 5: Fix renderShop re-render after redeem**

The current `redeemShopItem` calls `renderShop()` at the end which would overwrite the redeemed card. Fix this by not calling `renderShop()` after a successful redeem — instead just update the score display and re-check affordability on remaining (non-redeemed) cards.

In `redeemShopItem`, replace the final `renderShop()` call with:

```javascript
            // Update affordability on remaining cards (don't overwrite redeemed card)
            _shopItems.forEach(i => {
                if (i.id === itemId) return;
                const el = document.getElementById('shop-item-' + i.id);
                if (!el) return;
                const canAfford = _shopScore >= i.points;
                el.classList.toggle('affordable', canAfford);
                el.classList.toggle('dimmed', !canAfford);
                const b = el.querySelector('.shop-item-btn');
                if (b) b.disabled = !canAfford;
            });
```

- [ ] **Step 6: Verify syntax**

Open `app/public/profile.html` in a browser (or run the server locally with `npm run dev` from `app/`) and navigate to the Game tab. Confirm:
- Points balance shows with commas
- Shop grid renders all 7 items
- Items the player cannot afford are dimmed with disabled buttons
- The Free 20 Wings card is visible but disabled (unless the player has 10M points)

- [ ] **Step 7: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add public/profile.html
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add Wing Shop UI to profile Game tab"
```

---

## Self-Review

**Spec coverage:**
- ✅ WING_SHOP constant in server.js — Task 2 Step 1
- ✅ spendPoints DB helper with atomic guard — Task 1
- ✅ GET /api/game/shop (public) — Task 2 Step 4
- ✅ POST /api/game/shop/redeem (auth) — Task 2 Step 5
- ✅ Milestone system retired from save handler — Task 2 Step 2
- ✅ claim-code route returns 410 — Task 2 Step 3
- ✅ insertWingShopDiscount handles both fixed and percent types — Task 1 Addendum
- ✅ Points balance display in profile — Task 3 Steps 1-2
- ✅ Shop grid with affordability states — Task 3 Step 3
- ✅ Redeem flow with inline code display — Task 3 Steps 3-5
- ✅ Milestone Tier and Coins removed from stats — Task 3 Step 4
- ✅ 10M point wings20 item always visible — WING_SHOP constant includes it

**Type consistency:**
- `WING_SHOP` items have `{ id, name, points, type, percent, fixedPence }` — used consistently in GET route (strips to `{ id, name, points }`) and POST handler (accesses `type`, `percent`, `fixedPence` for insertWingShopDiscount)
- `spendPoints(email, amount)` called in server.js as `db.spendPoints(req.playerEmail, item.points)` ✅
- `insertWingShopDiscount({ code, email, item })` called correctly in server.js ✅
- `loadShop(playerScore)` called with `data.totalScore` from `renderGame` ✅

**Placeholder scan:** None found.
