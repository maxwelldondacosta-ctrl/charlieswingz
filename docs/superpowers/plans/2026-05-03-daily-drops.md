# Daily Drops & Challenges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily check-in streak system and three rotating daily challenges to the profile Loyalty tab, both rewarding Wing Shop points.

**Architecture:** Two new `game_players` columns (`last_daily_claim`, `daily_streak`) and a new `daily_completions` table handle all state. A `DAILY_CHALLENGE_POOL` constant and deterministic date-seeded picker in `server.js` select the day's three challenges. Challenge completion fires automatically inside existing event handlers (`/api/game/save`, Stripe webhook). The profile Loyalty tab gains two new cards rendered by `loadDailyDrops()`, called from the existing `loadLoyalty()`.

**Tech Stack:** Express.js, better-sqlite3, vanilla HTML/CSS/JS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/db.js` | Modify | Migrations, `daily_completions` table, 4 prepared statements, 5 helper functions |
| `app/server.js` | Modify | Constants, `POST /api/game/daily-claim`, `GET /api/game/daily-status`, challenge triggers in game save + Stripe webhook |
| `app/public/profile.html` | Modify | Daily Check-In card + Daily Challenges card on Loyalty tab |

---

## Task 1: DB — migrations, table, helpers

**Files:**
- Modify: `app/db.js`

### Context

The migration pattern lives at ~line 212. It's an array of `[table, col, type]` tuples fed into a `for` loop that runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. The `daily_completions` table must be created inside the large `db.exec(\`...\`)` block (not via migration — it's a new table, not a new column). The `const stmts = {` block is at ~line 320. `module.exports` is at ~line 1612.

- [ ] **Step 1: Add the two migration entries**

In `app/db.js`, find the end of the `migrations` array (just before the closing `];`):

```javascript
    ['game_players', 'referral_count',    'INTEGER DEFAULT 0'],
];
```

Add two new entries before the closing `];`:

```javascript
    ['game_players', 'last_daily_claim', 'TEXT'],
    ['game_players', 'daily_streak',     'INTEGER DEFAULT 0'],
];
```

- [ ] **Step 2: Create the daily_completions table**

In `app/db.js`, find the large `db.exec(\`...\`)` block. It contains all `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX` statements. Find the last `CREATE INDEX` line inside it. Add the following **before the closing backtick** of that `db.exec` call:

```sql
    CREATE TABLE IF NOT EXISTS daily_completions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        email        TEXT NOT NULL,
        challenge_id TEXT NOT NULL,
        claim_date   TEXT NOT NULL,
        UNIQUE(email, challenge_id, claim_date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_completions ON daily_completions(email, claim_date);
```

- [ ] **Step 3: Add four prepared statements**

In `app/db.js`, find `spendPoints` in the `stmts` object (added by the Wing Economy task). Add the following four statements immediately after it:

```javascript
    setDailyClaim:          db.prepare('UPDATE game_players SET last_daily_claim = ?, daily_streak = ? WHERE email = ?'),
    addPoints:              db.prepare('UPDATE game_players SET total_score = total_score + ? WHERE email = ?'),
    insertDailyCompletion:  db.prepare('INSERT OR IGNORE INTO daily_completions (email, challenge_id, claim_date) VALUES (?, ?, ?)'),
    getDailyCompletions:    db.prepare('SELECT challenge_id FROM daily_completions WHERE email = ? AND claim_date = ?'),
```

(If the Wing Economy task has not been implemented yet, `spendPoints` won't exist — just add after `getReferralCount` instead.)

- [ ] **Step 4: Add five helper functions**

In `app/db.js`, find the `// ── Wing Shop ──` comment block. Add the following block immediately **after** it (after the `insertWingShopDiscount` function and before the `// ── Stream config ──` comment):

```javascript
// ── Daily Drops ───────────────────────────────────────────────────────────────

function getDailyClaimState(email) {
    const row = stmts.getGamePlayer.get(email.toLowerCase());
    if (!row) return null;
    return {
        lastDailyClaim: row.last_daily_claim || null,
        dailyStreak:    row.daily_streak     || 0
    };
}

function setDailyClaim(email, dateStr, streak) {
    stmts.setDailyClaim.run(dateStr, streak, email.toLowerCase());
}

function addPoints(email, amount) {
    stmts.addPoints.run(amount, email.toLowerCase());
}

function insertDailyCompletion(email, challengeId, dateStr) {
    const result = stmts.insertDailyCompletion.run(email.toLowerCase(), challengeId, dateStr);
    return result.changes === 1;
}

function getDailyCompletions(email, dateStr) {
    return stmts.getDailyCompletions.all(email.toLowerCase(), dateStr).map(r => r.challenge_id);
}
```

- [ ] **Step 5: Export the five new functions**

In `app/db.js`, find the `module.exports = {` block. Add the following to the exported object:

```javascript
    getDailyClaimState, setDailyClaim, addPoints,
    insertDailyCompletion, getDailyCompletions,
```

- [ ] **Step 6: Verify syntax**

```bash
node --check "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app/db.js"
```

Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add db.js
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add daily drops DB helpers and daily_completions table"
```

---

## Task 2: Server — constants, routes, challenge triggers

**Files:**
- Modify: `app/server.js`

### Context

- `WING_SHOP` constant is at ~line 2157 (or where `GAME_MILESTONES` was)
- `requireGameAuth` middleware exists and sets `req.playerEmail`
- `getPlayer(email)` helper fetches a player by email from the in-memory+DB store
- `/api/game/save` handler is at ~line 2296; it saves score and returns stats
- Stripe webhook `checkout.session.completed` block is at ~lines 2724–2990; `customerEmail` is available in scope
- Public routes are near `app.get('/api/stream')` (~line 719)
- `crypto` is already required at the top

- [ ] **Step 1: Add constants after WING_SHOP**

In `app/server.js`, find the `WING_SHOP` constant. Add the following immediately after it:

```javascript
const DAILY_STREAK_BONUSES = { 1: 1000, 2: 1500, 3: 2000, 4: 3000, 5: 4000, 6: 5000, 7: 10000 };

const DAILY_CHALLENGE_POOL = [
    { id: 'play_game',   label: 'Play a game today',          points: 2000  },
    { id: 'score_1k',    label: 'Score 1,000+ in one game',   points: 5000  },
    { id: 'score_5k',    label: 'Score 5,000+ in one game',   points: 15000 },
    { id: 'place_order', label: 'Place an order today',       points: 10000 },
    { id: 'streak_3',    label: 'Log in 3 days in a row',     points: 8000  },
];

function getDailyChallenges(dateStr) {
    const seed = parseInt(dateStr.replace(/-/g, ''), 10);
    const n    = seed % DAILY_CHALLENGE_POOL.length;
    return [0, 1, 2].map(i => DAILY_CHALLENGE_POOL[(n + i) % DAILY_CHALLENGE_POOL.length]);
}

function todayUTC() {
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function yesterdayUTC() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

function nextMidnightUTC() {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d.toISOString();
}

function completeChallengeIfNew(email, challengeId, today) {
    const challenge = DAILY_CHALLENGE_POOL.find(c => c.id === challengeId);
    if (!challenge) return;
    const isNew = db.insertDailyCompletion(email, challengeId, today);
    if (isNew) db.addPoints(email, challenge.points);
}
```

- [ ] **Step 2: Add GET /api/game/daily-status**

Find `app.get('/api/game/shop', ...)`. Add the following immediately after it:

```javascript
app.get('/api/game/daily-status', requireGameAuth, (req, res) => {
    const today     = todayUTC();
    const state     = db.getDailyClaimState(req.playerEmail) || { lastDailyClaim: null, dailyStreak: 0 };
    const claimed   = state.lastDailyClaim === today;
    const streak    = state.dailyStreak || 0;
    const nextStreak = claimed ? streak : (state.lastDailyClaim === yesterdayUTC() ? (streak % 7) + 1 : 1);
    const nextBonus  = DAILY_STREAK_BONUSES[nextStreak] || 1000;
    const completed  = db.getDailyCompletions(req.playerEmail, today);
    const challenges = getDailyChallenges(today).map(c => ({
        id:        c.id,
        label:     c.label,
        points:    c.points,
        completed: completed.includes(c.id)
    }));
    res.json({
        claimed,
        streak,
        nextBonus,
        nextClaimAt: nextMidnightUTC(),
        challenges
    });
});
```

- [ ] **Step 3: Add POST /api/game/daily-claim**

Immediately after `GET /api/game/daily-status`, add:

```javascript
app.post('/api/game/daily-claim', requireGameAuth, (req, res) => {
    const today  = todayUTC();
    const state  = db.getDailyClaimState(req.playerEmail) || { lastDailyClaim: null, dailyStreak: 0 };

    if (state.lastDailyClaim === today) {
        return res.status(400).json({ message: 'Already claimed today' });
    }

    const wasYesterday = state.lastDailyClaim === yesterdayUTC();
    const newStreak    = wasYesterday ? ((state.dailyStreak % 7) + 1) : 1;
    const points       = DAILY_STREAK_BONUSES[newStreak] || 1000;

    db.addPoints(req.playerEmail, points);
    db.setDailyClaim(req.playerEmail, today, newStreak);

    // streak_3 challenge: fire if streak hits 3 or more
    if (newStreak >= 3) {
        completeChallengeIfNew(req.playerEmail, 'streak_3', today);
    }

    const player = getPlayer(req.playerEmail);
    res.json({
        pointsEarned: points,
        newStreak,
        newBalance:   (player ? player.totalScore : 0),
        nextClaimAt:  nextMidnightUTC()
    });
});
```

- [ ] **Step 4: Add game_save challenge triggers**

In the `/api/game/save` handler, find the `savePlayer(player)` call. Add the following block **after** `savePlayer(player)` and **before** `res.json(...)`:

```javascript
    // ── Daily challenge triggers ──────────────────────────────────────────────
    const _today = todayUTC();
    const _sessionScore = score || 0;
    completeChallengeIfNew(req.playerEmail, 'play_game', _today);
    if (_sessionScore >= 1000) completeChallengeIfNew(req.playerEmail, 'score_1k', _today);
    if (_sessionScore >= 5000) completeChallengeIfNew(req.playerEmail, 'score_5k', _today);
```

- [ ] **Step 5: Add order challenge trigger in Stripe webhook**

In the Stripe webhook `checkout.session.completed` block, find the `// ── Referral Reward ──` comment. Add the following block immediately **before** it:

```javascript
    // ── Daily order challenge ─────────────────────────────────────────────────
    try {
        if (customerEmail) {
            completeChallengeIfNew(customerEmail, 'place_order', todayUTC());
        }
    } catch (err) {
        console.error('Daily order challenge error:', err);
    }
```

- [ ] **Step 6: Verify syntax**

```bash
node --check "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app/server.js"
```

Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add server.js
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add daily drops routes and challenge triggers"
```

---

## Task 3: Profile — Daily Check-In and Challenges UI

**Files:**
- Modify: `app/public/profile.html`

### Context

- Loyalty tab is `<div id="tab-loyalty" class="tab-content active">` (~line 569)
- It currently opens with the stamp card `.card` div, then the referral card, then rewards
- `loadLoyalty()` is called on tab switch and on initial load (~line 758)
- CSS variables: `--gold`, `--dark`, `--border`, `--cream`, `--cream-dim`
- `.card` class: `background: var(--dark); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; margin-bottom: 1rem`
- `.section-title` class exists for headings
- `authHeaders()` returns `{ Authorization: 'Bearer ' + token }` for authenticated fetches

- [ ] **Step 1: Add Daily Drops CSS**

In `app/public/profile.html`, find the `/* ── Wing Shop ──` CSS comment. Add the following block **before** it:

```css
/* ── Daily Drops ── */
.daily-card { margin-bottom: 1rem; }
.daily-card-title {
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 0.75rem;
    font-weight: 600;
}
.streak-display {
    font-size: 0.85rem;
    color: var(--cream-dim);
    margin-bottom: 0.6rem;
}
.streak-display strong { color: var(--cream); }
.claim-btn {
    width: 100%;
    padding: 0.7rem;
    background: linear-gradient(135deg, var(--gold), #B8922A);
    color: #000;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.03em;
    transition: opacity 0.15s;
}
.claim-btn:hover:not(:disabled) { opacity: 0.88; }
.claim-btn:disabled {
    background: #222;
    color: #555;
    cursor: not-allowed;
}
.claim-countdown {
    font-size: 0.78rem;
    color: #666;
    text-align: center;
    margin-top: 0.5rem;
}
.challenge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    gap: 0.5rem;
}
.challenge-row:last-child { border-bottom: none; }
.challenge-label {
    font-size: 0.85rem;
    color: var(--cream);
    flex: 1;
}
.challenge-label.done {
    text-decoration: line-through;
    color: #555;
}
.challenge-pts {
    font-size: 0.78rem;
    color: var(--gold);
    white-space: nowrap;
}
.challenge-tick { color: #4caf50; font-size: 0.85rem; }
.challenges-reset {
    font-size: 0.75rem;
    color: #555;
    margin-top: 0.6rem;
    text-align: right;
}
```

- [ ] **Step 2: Add Daily Drops HTML to the Loyalty tab**

In `app/public/profile.html`, find the loyalty tab content. The stamp card `.card` div is the first element. Insert the following **before** the stamp card div (i.e., as the very first children of `#tab-loyalty`):

```html
            <!-- Daily Check-In -->
            <div class="card daily-card" id="daily-checkin-card">
                <div class="daily-card-title">🔥 Daily Check-In</div>
                <div class="streak-display" id="daily-streak-display">Loading…</div>
                <button class="claim-btn" id="daily-claim-btn" onclick="claimDaily()" disabled>Claim</button>
                <div class="claim-countdown" id="daily-countdown"></div>
            </div>

            <!-- Daily Challenges -->
            <div class="card daily-card" id="daily-challenges-card">
                <div class="daily-card-title">📋 Daily Challenges</div>
                <div id="challenges-list"><p class="empty-msg">Loading…</p></div>
                <div class="challenges-reset" id="challenges-reset"></div>
            </div>
```

- [ ] **Step 3: Add JS helper functions**

In `app/public/profile.html`, find the `// ── Wing Shop ──` JavaScript comment. Add the following block **before** it:

```javascript
    // ── Daily Drops ───────────────────────────────────────────────────────────
    let _dailyCountdownTimer = null;

    function formatCountdown(targetIso) {
        const diff = new Date(targetIso) - Date.now();
        if (diff <= 0) return '00h 00m 00s';
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        return String(h).padStart(2,'0') + 'h ' + String(m).padStart(2,'0') + 'm ' + String(s).padStart(2,'0') + 's';
    }

    async function loadDailyDrops() {
        try {
            const res = await fetch('/api/game/daily-status', { headers: authHeaders() });
            if (!res.ok) return;
            renderDailyDrops(await res.json());
        } catch (e) { /* server offline */ }
    }

    function renderDailyDrops(data) {
        // Check-in card
        const streakEl   = document.getElementById('daily-streak-display');
        const claimBtn   = document.getElementById('daily-claim-btn');
        const countdownEl = document.getElementById('daily-countdown');

        if (streakEl) {
            streakEl.innerHTML = data.claimed
                ? '<strong>Day ' + data.streak + ' streak</strong> — claimed today!'
                : 'Streak: <strong>' + data.streak + ' day' + (data.streak === 1 ? '' : 's') + '</strong> &nbsp;·&nbsp; Claim <strong>+' + (data.nextBonus || 1000).toLocaleString() + ' pts</strong>';
        }

        if (claimBtn) {
            claimBtn.disabled = !!data.claimed;
            claimBtn.textContent = data.claimed
                ? '✓ Claimed today'
                : 'Claim +' + (data.nextBonus || 1000).toLocaleString() + ' pts';
        }

        if (_dailyCountdownTimer) clearInterval(_dailyCountdownTimer);
        if (data.claimed && countdownEl && data.nextClaimAt) {
            const updateCd = () => { countdownEl.textContent = 'Next claim in ' + formatCountdown(data.nextClaimAt); };
            updateCd();
            _dailyCountdownTimer = setInterval(updateCd, 1000);
        } else if (countdownEl) {
            countdownEl.textContent = '';
        }

        // Challenges card
        const listEl  = document.getElementById('challenges-list');
        const resetEl = document.getElementById('challenges-reset');
        if (listEl && data.challenges) {
            listEl.innerHTML = data.challenges.map(c => `
                <div class="challenge-row">
                    <span class="challenge-label${c.completed ? ' done' : ''}">${escapeHtml(c.label)}</span>
                    <span class="challenge-pts">+${c.points.toLocaleString()} pts</span>
                    ${c.completed ? '<span class="challenge-tick">✓</span>' : ''}
                </div>`).join('');
        }
        if (resetEl && data.nextClaimAt) {
            resetEl.textContent = 'Resets in ' + formatCountdown(data.nextClaimAt);
        }
    }

    async function claimDaily() {
        const btn = document.getElementById('daily-claim-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Claiming…'; }
        try {
            const res = await fetch('/api/game/daily-claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() }
            });
            const data = await res.json();
            if (!res.ok) {
                if (btn) { btn.disabled = false; btn.textContent = 'Claim'; }
                return;
            }
            // Refresh the daily status display
            await loadDailyDrops();
            // Flash confirmation
            if (btn) {
                const orig = btn.textContent;
                btn.textContent = '✓ +' + data.pointsEarned.toLocaleString() + ' pts!';
                setTimeout(() => { btn.textContent = orig; }, 2500);
            }
        } catch (e) {
            if (btn) { btn.disabled = false; btn.textContent = 'Claim'; }
        }
    }
```

- [ ] **Step 4: Wire loadDailyDrops into loadLoyalty**

In `app/public/profile.html`, find the `loadLoyalty()` function (~line 758). At the very start of the function body (before the `try {` block that fetches `/api/loyalty/progress`), add:

```javascript
        loadDailyDrops();
```

- [ ] **Step 5: Verify syntax and visual check**

Start the server (`npm run dev` from `app/`) and open `http://localhost:3000/profile.html`. Log in, go to the Loyalty tab. Confirm:
- Daily Check-In card appears at the top with claim button and point amount
- After clicking Claim, button changes to "✓ Claimed today" and countdown starts
- Daily Challenges card shows 3 challenges with point values
- Completed challenges (if any) show strikethrough + green tick

- [ ] **Step 6: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add public/profile.html
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add Daily Check-In and Daily Challenges UI to profile Loyalty tab"
```

---

## Self-Review

**Spec coverage:**
- ✅ Two new `game_players` columns (`last_daily_claim`, `daily_streak`) — Task 1 Step 1
- ✅ `daily_completions` table with UNIQUE constraint — Task 1 Step 2
- ✅ `addPoints`, `setDailyClaim`, `getDailyClaimState`, `insertDailyCompletion`, `getDailyCompletions` helpers — Task 1 Steps 3–5
- ✅ `DAILY_STREAK_BONUSES` table (1k–10k, 7-day cycle) — Task 2 Step 1
- ✅ `DAILY_CHALLENGE_POOL` with all 5 challenges — Task 2 Step 1
- ✅ `getDailyChallenges(dateStr)` deterministic picker — Task 2 Step 1
- ✅ `completeChallengeIfNew` with INSERT OR IGNORE guard — Task 2 Step 1
- ✅ `GET /api/game/daily-status` — Task 2 Step 2
- ✅ `POST /api/game/daily-claim` with streak logic — Task 2 Step 3
- ✅ `streak_3` challenge triggered on claim — Task 2 Step 3
- ✅ `play_game`, `score_1k`, `score_5k` triggers in game save — Task 2 Step 4
- ✅ `place_order` trigger in Stripe webhook — Task 2 Step 5
- ✅ Daily Check-In card with streak display, claim button, countdown — Task 3
- ✅ Daily Challenges card with completion state — Task 3
- ✅ `loadDailyDrops()` wired into `loadLoyalty()` — Task 3 Step 4

**Type consistency:**
- `completeChallengeIfNew(email, challengeId, today)` — called with `req.playerEmail`, challenge id string, `todayUTC()` return value — consistent across Task 2 Steps 1, 3, 4, 5 ✅
- `db.getDailyClaimState(email)` returns `{ lastDailyClaim, dailyStreak }` — consumed correctly in both routes ✅
- `data.nextClaimAt` is an ISO string returned by both API routes — consumed by `formatCountdown()` in profile.html ✅
- `data.nextBonus` is the points for the *next* claim — displayed before claiming; after claiming `data.streak` is already the new streak value ✅

**Placeholder scan:** None found.
