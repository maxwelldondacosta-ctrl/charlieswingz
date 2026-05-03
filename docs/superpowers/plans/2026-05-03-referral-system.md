# Referral System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers share a referral link; both parties get a 15% discount code when the referred friend places their first order, and the referrer earns a 30% code at every 10 successful referrals.

**Architecture:** Four new columns on `game_players`, a handful of DB helpers, a referral capture IIFE in `index.html`, a referralCode param in the `game.html` signup handler, a reward trigger in the existing Stripe webhook, and a "Refer a Friend" card added to the Loyalty tab in `profile.html`. No new tables, no new auth infrastructure.

**Tech Stack:** Express.js, better-sqlite3, vanilla HTML/CSS/JS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/db.js` | Modify | Add 4 migrations, 7 prepared statements, 8 helper functions |
| `app/server.js` | Modify | Update `/api/game/register`, extend `/api/account/profile`, add reward trigger in Stripe webhook |
| `app/public/index.html` | Modify | Capture `?ref=` param → `localStorage` on page load |
| `app/public/game.html` | Modify | Read `cw_referral` at signup, pass as `referralCode`, clear after |
| `app/public/profile.html` | Modify | Add Refer a Friend card to Loyalty tab |

---

## Task 1: DB — Migrations and helpers

**Files:**
- Modify: `app/db.js`

### Context

`db.js` has a `const migrations = [` array around line 212. Each entry is `[table, column, 'TYPE DEFAULT x']`. The migration loop silently ignores errors (column already exists).

The `stmts` object (around line 295) holds all prepared statements. `insertDiscount` at line 315 uses named `@param` syntax.

The module exports block is at the very bottom of the file.

- [ ] **Step 1: Add the 4 migrations**

Find the migrations array. It contains entries like `['game_players', 'coins_migrated', 'INTEGER DEFAULT 0']`. Add these four entries at the end of the array, before the closing `];`:

```javascript
    ['game_players', 'referral_code',     'TEXT'],
    ['game_players', 'referred_by',       'TEXT'],
    ['game_players', 'referral_rewarded', 'INTEGER DEFAULT 0'],
    ['game_players', 'referral_count',    'INTEGER DEFAULT 0'],
```

- [ ] **Step 2: Add the 7 prepared statements**

Find this line in the `stmts` object (around line 302):
```javascript
    getOrdersByEmail: db.prepare('SELECT * FROM orders WHERE LOWER(customer_email) = ? ORDER BY created_at DESC'),
```

Add the following directly after it:

```javascript
    getPlayerByReferralCode: db.prepare('SELECT email, name FROM game_players WHERE referral_code = ?'),
    setReferralCode:         db.prepare('UPDATE game_players SET referral_code = ? WHERE email = ?'),
    setReferredBy:           db.prepare('UPDATE game_players SET referred_by = ? WHERE email = ?'),
    getPlayerReferralState:  db.prepare('SELECT referred_by, referral_rewarded FROM game_players WHERE email = ?'),
    setReferralRewarded:     db.prepare('UPDATE game_players SET referral_rewarded = 1 WHERE email = ?'),
    incrementReferralCount:  db.prepare('UPDATE game_players SET referral_count = referral_count + 1 WHERE email = ?'),
    getReferralCount:        db.prepare('SELECT referral_count FROM game_players WHERE email = ?'),
```

- [ ] **Step 3: Add the 8 helper functions**

Find the `// ── Customer order history ───` comment added in Task 1 of the Profile Hub (around line 1479). Add the following block **before** that comment:

```javascript
// ── Referral system ───────────────────────────────────────────────────────────

function getOrCreateReferralCode(email) {
    if (!email) return null;
    const e = email.toLowerCase();
    const row = stmts.getGamePlayer.get(e);
    if (!row) return null;
    if (row.referral_code) return row.referral_code;
    let code, attempts = 0;
    do {
        code = 'CWREF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        try {
            stmts.setReferralCode.run(code, e);
            return code;
        } catch {
            attempts++;
        }
    } while (attempts < 10);
    return null;
}

function getPlayerByReferralCode(code) {
    if (!code) return null;
    return stmts.getPlayerByReferralCode.get(code.toUpperCase()) || null;
}

function setReferredBy(email, referrerEmail) {
    if (!email || !referrerEmail) return;
    stmts.setReferredBy.run(referrerEmail.toLowerCase(), email.toLowerCase());
}

function getPlayerReferralState(email) {
    if (!email) return null;
    return stmts.getPlayerReferralState.get(email.toLowerCase()) || null;
}

function setReferralRewarded(email) {
    if (!email) return;
    stmts.setReferralRewarded.run(email.toLowerCase());
}

function incrementReferralCount(email) {
    if (!email) return 0;
    const e = email.toLowerCase();
    stmts.incrementReferralCount.run(e);
    const row = stmts.getReferralCount.get(e);
    return row ? (row.referral_count || 0) : 0;
}

function getReferralCount(email) {
    if (!email) return 0;
    const row = stmts.getReferralCount.get(email.toLowerCase());
    return row ? (row.referral_count || 0) : 0;
}

function insertReferralDiscount({ code, email, percent, source, description }) {
    stmts.insertDiscount.run({
        code,
        email:         email.toLowerCase(),
        type:          'percent',
        percent,
        amount_pence:  0,
        fixed_amount:  0,
        source,
        description,
        milestone:     null,
        customer_name: null,
        created_at:    new Date().toISOString()
    });
}
```

- [ ] **Step 4: Export the new functions**

Find `module.exports = {` at the bottom of `db.js`. Add the following 8 names to the exported object (near the other order/game exports):

```javascript
getOrCreateReferralCode, getPlayerByReferralCode, setReferredBy,
getPlayerReferralState, setReferralRewarded, incrementReferralCount,
getReferralCount, insertReferralDiscount,
```

- [ ] **Step 5: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add db.js
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add referral system DB helpers"
```

---

## Task 2: Server — Register, Profile, Reward Trigger

**Files:**
- Modify: `app/server.js`

### Context

**`POST /api/game/register`** is around line 2162. It destructures `{ name, email, password, phone }` from `req.body`, creates a player with `db.createGamePlayer`, handles customer linking, and returns a JWT token.

**`GET /api/account/profile`** is around line 2411. It calls `getPlayer(req.playerEmail)` and returns a JSON object with name, email, phone, postcode, contactPref.

**Stripe webhook** is `app.post('/webhooks/stripe', ...)` starting at line 2713. Inside the `checkout.session.completed` block, `customerEmail` is set at line 2746 as `const customerEmail = meta.customer_email || order.customer_email`. The block ends at line 2860 just before `res.json({ received: true })`. Loyalty and lottery logic runs between lines 2801–2859.

- [ ] **Step 1: Update POST /api/game/register — destructure referralCode**

Find this line in the register handler:
```javascript
    const { name, email, password, phone } = req.body;
```
Replace with:
```javascript
    const { name, email, password, phone, referralCode } = req.body;
```

- [ ] **Step 2: Update POST /api/game/register — generate code and store referred_by**

Find this line in the register handler (it comes right after the player is created):
```javascript
    const player = db.createGamePlayer(name, email, hashedPass);
```

Add the following directly after it:
```javascript
    // Generate referral code for the new player
    db.getOrCreateReferralCode(email.toLowerCase());

    // Store referrer if a valid referral code was passed
    if (referralCode) {
        const referrer = db.getPlayerByReferralCode(referralCode);
        if (referrer && referrer.email.toLowerCase() !== email.toLowerCase()) {
            db.setReferredBy(email.toLowerCase(), referrer.email);
        }
    }
```

- [ ] **Step 3: Update GET /api/account/profile — add referralCode and referralCount**

Find this block in the profile handler:
```javascript
    res.json({
        name: player.name || '',
        email: player.email || '',
        phone: player.profile?.phone || '',
        address: player.profile?.address || '',
        city: player.profile?.city || 'London',
        postcode: player.profile?.postcode || '',
        contactPref: player.profile?.contactPref || 'email'
    });
```

Replace with:
```javascript
    res.json({
        name:          player.name || '',
        email:         player.email || '',
        phone:         player.profile?.phone || '',
        address:       player.profile?.address || '',
        city:          player.profile?.city || 'London',
        postcode:      player.profile?.postcode || '',
        contactPref:   player.profile?.contactPref || 'email',
        referralCode:  db.getOrCreateReferralCode(req.playerEmail) || '',
        referralCount: db.getReferralCount(req.playerEmail)
    });
```

- [ ] **Step 4: Add referral reward trigger in the Stripe webhook**

Find this comment inside the `checkout.session.completed` block (around line 2833):
```javascript
        // ── Customer Lottery ──
```

Add the following block **before** that comment:
```javascript
        // ── Referral Rewards ──────────────────────────────────────────────────
        if (customerEmail) {
            try {
                const referralState = db.getPlayerReferralState(customerEmail);
                if (referralState && referralState.referred_by && referralState.referral_rewarded === 0) {
                    const referrerEmail = referralState.referred_by;
                    const sfx = () => Math.random().toString(36).substring(2, 8).toUpperCase();

                    db.insertReferralDiscount({
                        code:        'CWREF15-' + sfx(),
                        email:       customerEmail,
                        percent:     15,
                        source:      'referral',
                        description: '15% off — referral reward'
                    });
                    db.insertReferralDiscount({
                        code:        'CWREF15-' + sfx(),
                        email:       referrerEmail,
                        percent:     15,
                        source:      'referral',
                        description: '15% off — friend referred'
                    });

                    db.setReferralRewarded(customerEmail);
                    const newCount = db.incrementReferralCount(referrerEmail);

                    if (newCount % 10 === 0) {
                        db.insertReferralDiscount({
                            code:        'CWREF30-' + sfx(),
                            email:       referrerEmail,
                            percent:     30,
                            source:      'referral-milestone',
                            description: '30% off — ' + newCount + ' referrals milestone'
                        });
                        console.log(`[Referral] Milestone: ${referrerEmail} hit ${newCount} referrals`);
                    }
                    console.log(`[Referral] Rewarded ${customerEmail} (ref by ${referrerEmail}), count=${newCount}`);
                }
            } catch (e) {
                console.error('[Referral] Reward error:', e.message);
            }
        }

```

- [ ] **Step 5: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add server.js
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: referral code on register, profile endpoint, and webhook reward trigger"
```

---

## Task 3: Frontend Capture — index.html and game.html

**Files:**
- Modify: `app/public/index.html`
- Modify: `app/public/game.html`

### Context

**`index.html`**: The `handleReorder` IIFE ends around line 3400 with `})();`. The `handleCheckoutReturn` IIFE starts before it. Both are in the main `<script>` block near the bottom of the file.

**`game.html`**: The signup handler is a method on a class/object called `Auth` or similar. The `register` function (around line 466) currently sends `{ name, email, password }` to `POST /api/game/register` and does NOT touch localStorage. It looks like:

```javascript
async register(name, email, password) {
    const res = await fetch('/api/game/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    this.token = data.token;
    this.user = data.user;
    return data;
}
```

- [ ] **Step 1: Add referral capture IIFE to index.html**

Find the closing `})();` of the `handleReorder` IIFE (around line 3400). Add the following immediately after it:

```javascript
        // ── Referral link capture ─────────────────────────────────────────────
        (function captureReferral() {
            const params = new URLSearchParams(window.location.search);
            const ref = params.get('ref');
            if (!ref) return;
            localStorage.setItem('cw_referral', ref);
            const url = new URL(window.location.href);
            url.searchParams.delete('ref');
            window.history.replaceState({}, '', url.pathname + (url.search || ''));
        })();
```

- [ ] **Step 2: Update game.html register function to pass referralCode**

Find the `register` function in `game.html`. It currently calls `JSON.stringify({ name, email, password })`. Replace the entire function with:

```javascript
async register(name, email, password) {
    const referralCode = localStorage.getItem('cw_referral');
    const body = { name, email, password };
    if (referralCode) body.referralCode = referralCode;
    const res = await fetch('/api/game/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    localStorage.removeItem('cw_referral');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    this.token = data.token;
    this.user = data.user;
    return data;
}
```

Note: `localStorage.removeItem('cw_referral')` runs before the `if (!res.ok)` check — it clears the referral regardless of whether signup succeeded or failed, which prevents the code being used twice.

- [ ] **Step 3: Manual test — referral capture**

1. Open `http://localhost:3000/?ref=CWREF-TEST123` in a browser
2. Open DevTools → Application → Local Storage → `http://localhost:3000`
3. `cw_referral` should be set to `CWREF-TEST123`
4. The URL bar should show `http://localhost:3000/` (no `?ref=` param)

- [ ] **Step 4: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add public/index.html public/game.html
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: capture ?ref= param and pass referralCode at signup"
```

---

## Task 4: Profile — Refer a Friend Card

**Files:**
- Modify: `app/public/profile.html`

### Context

The Loyalty tab HTML is in `#tab-loyalty`. It currently contains a stamp card `.card` div, a `.section-title` "Your Rewards" heading, and `#loyalty-rewards`. The referral card goes between the stamp card and the "Your Rewards" heading.

The `showProfile()` function currently ends with `loadLoyalty()`. We add `loadReferralCard()` after it.

The `authHeaders()` and `getSession()` helpers and the `escapeHtml()` function already exist in the `<script>` block.

- [ ] **Step 1: Add CSS for the referral card**

In `profile.html`, find the `/* ── Mobile ───` CSS comment near the bottom of the `<style>` block. Add the following CSS block **before** it:

```css
        /* ── Referral card ────────────────────────────────────────────────────── */
        .referral-link-wrap {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(212,168,75,0.06);
            border: 1px solid rgba(212,168,75,0.2);
            border-radius: 6px;
            padding: 0.5rem 0.75rem;
            margin-bottom: 0.75rem;
        }
        .referral-link-text {
            flex: 1;
            font-size: 0.78rem;
            color: var(--cream-dim);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .copy-ref-btn {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.75rem;
            letter-spacing: 0.1em;
            padding: 0.3rem 0.75rem;
            background: var(--gold);
            color: var(--black);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            flex-shrink: 0;
            transition: opacity 0.2s;
        }
        .copy-ref-btn:hover { opacity: 0.85; }
        .referral-stats { font-size: 0.82rem; color: var(--cream-dim); margin-bottom: 0.25rem; }
        .referral-stats strong { color: var(--cream); }
        .referral-milestone { font-size: 0.82rem; color: var(--gold); }
```

- [ ] **Step 2: Add the referral card HTML to the Loyalty tab**

In `profile.html`, find this line inside `#tab-loyalty`:
```html
            <div class="section-title">Your Rewards</div>
```

Add the following HTML **before** that line:

```html
            <!-- Referral Card -->
            <div class="card" id="referral-card" style="display:none">
                <div class="section-title" style="margin-bottom:0.5rem">Refer a Friend</div>
                <p style="font-size:0.82rem;color:var(--cream-dim);margin-bottom:1rem">Share your link. When your friend places their first order, you both get 15% off.</p>
                <div class="referral-link-wrap">
                    <span class="referral-link-text" id="referral-link-text"></span>
                    <button class="copy-ref-btn" id="referral-copy-btn" onclick="copyReferralLink()">Copy</button>
                </div>
                <p class="referral-stats" id="referral-stats"></p>
                <p class="referral-milestone" id="referral-milestone"></p>
            </div>

```

- [ ] **Step 3: Add the JS functions**

In `profile.html`, find the `// ── Copy code ────` comment near the bottom of the `<script>` block. Add the following block **before** it:

```javascript
    // ── Referral card ─────────────────────────────────────────────────────────
    let _referralCode = null;

    async function loadReferralCard() {
        try {
            const res = await fetch('/api/account/profile', { headers: authHeaders() });
            if (!res.ok) return;
            const p = await res.json();
            if (!p.referralCode) return;
            _referralCode = p.referralCode;
            renderReferralCard(p.referralCode, p.referralCount || 0);
        } catch { /* server offline */ }
    }

    function renderReferralCard(code, count) {
        const card = document.getElementById('referral-card');
        if (!card) return;
        document.getElementById('referral-link-text').textContent =
            'https://charlieswingz.co.uk/?ref=' + escapeHtml(code);

        const statsEl = document.getElementById('referral-stats');
        statsEl.innerHTML = '<strong>' + count + '</strong> friend' + (count === 1 ? '' : 's') + ' referred';

        const milestoneEl = document.getElementById('referral-milestone');
        if (count > 0 && count % 10 === 0) {
            milestoneEl.textContent = '30% milestone reached!';
        } else {
            const remaining = 10 - (count % 10);
            milestoneEl.textContent = remaining + ' more to unlock your 30% reward';
        }

        card.style.display = 'block';
    }

    function copyReferralLink() {
        if (!_referralCode) return;
        const link = 'https://charlieswingz.co.uk/?ref=' + _referralCode;
        const btn = document.getElementById('referral-copy-btn');
        const reset = () => { setTimeout(() => { btn.textContent = 'Copy'; }, 2000); };
        navigator.clipboard.writeText(link).then(() => {
            btn.textContent = '✓ Copied!';
            reset();
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = link;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            btn.textContent = '✓ Copied!';
            reset();
        });
    }

```

- [ ] **Step 4: Call loadReferralCard from showProfile**

Find the `showProfile` function:
```javascript
    function showProfile(session) {
        document.getElementById('state-login').style.display   = 'none';
        document.getElementById('state-profile').style.display = 'block';
        document.getElementById('logout-btn').style.display    = 'block';
        document.getElementById('profile-name').textContent    = session.user?.name || 'there';
        document.getElementById('profile-email-header').textContent = session.user?.email || '';
        loadLoyalty();
    }
```

Replace with:
```javascript
    function showProfile(session) {
        document.getElementById('state-login').style.display   = 'none';
        document.getElementById('state-profile').style.display = 'block';
        document.getElementById('logout-btn').style.display    = 'block';
        document.getElementById('profile-name').textContent    = session.user?.name || 'there';
        document.getElementById('profile-email-header').textContent = session.user?.email || '';
        loadLoyalty();
        loadReferralCard();
    }
```

- [ ] **Step 5: Manual test — referral card visible**

1. Start the server (`npm run dev` from `app/`)
2. Open `http://localhost:3000/profile.html` and log in
3. The Loyalty tab should show the "Refer a Friend" card below the stamp card
4. The referral link should show `https://charlieswingz.co.uk/?ref=CWREF-XXXXXX`
5. Clicking "Copy" should copy the link and show "✓ Copied!"
6. The stats line should show "0 friends referred" and "10 more to unlock your 30% reward"

- [ ] **Step 6: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add public/profile.html
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add Refer a Friend card to Profile Loyalty tab"
```

---

## Self-Review

**Spec coverage:**
- ✅ Referral code generated at signup → `getOrCreateReferralCode` called in register handler
- ✅ Existing players get code lazily → `getOrCreateReferralCode` called in profile endpoint
- ✅ `?ref=` captured in localStorage → `captureReferral` IIFE in index.html
- ✅ `referralCode` passed at signup → game.html register update
- ✅ Self-referral blocked → `referrer.email !== email` check in register
- ✅ Invalid code silently ignored → `getPlayerByReferralCode` returns null → skip
- ✅ First order triggers 15% codes for both → Stripe webhook reward trigger
- ✅ `referral_rewarded = 0` guard prevents double-firing → `setReferralRewarded` + check
- ✅ `referral_count` increments → `incrementReferralCount` called in webhook
- ✅ Every 10th referral triggers 30% code → `newCount % 10 === 0` check
- ✅ Referral card on Loyalty tab with count and milestone progress → Task 4
- ✅ Reward codes visible in Profile reward cards → they go into `discounts` table, surfaced by existing loyalty rewards section

**Type consistency:**
- `getOrCreateReferralCode(email)` → returns `string | null` — used correctly in server.js
- `getPlayerByReferralCode(code)` → returns `{ email, name } | null` — `referrer.email` accessed correctly
- `insertReferralDiscount({ code, email, percent, source, description })` — matches `stmts.insertDiscount` named params
- `incrementReferralCount(email)` → returns `number` — used in `newCount % 10 === 0` correctly
- `getReferralCount(email)` → returns `number` — used in profile endpoint correctly

**No placeholders:** All code blocks are complete.
