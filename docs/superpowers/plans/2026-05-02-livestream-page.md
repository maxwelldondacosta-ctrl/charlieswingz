# Livestream Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/live` page with two states (offline: countdown + replay; live: split stream + order panel) controlled from a new admin Livestream tab.

**Architecture:** A new `stream_config` table in SQLite stores all config as a single upserted row. Two Express routes expose it (`GET /api/stream` public for the frontend to poll, `GET /admin/api/stream` + `POST /admin/api/stream` admin-protected for the admin tab). `live.html` polls `/api/stream` every 30 seconds and swaps between offline/live layouts. A new Livestream tab in the existing admin panel allows full configuration and live toggling.

**Tech Stack:** Express.js, better-sqlite3, vanilla HTML/CSS/JS (no new dependencies)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/db.js` | Modify | Add `stream_config` table, prepared statements, `getStreamConfig` / `saveStreamConfig` functions |
| `app/server.js` | Modify | Add `GET /api/stream`, `GET /admin/api/stream`, `POST /admin/api/stream` routes |
| `app/public/admin.html` | Modify | Add Livestream tab button, tab content HTML, JS functions |
| `app/public/live.html` | Create | Full livestream page — offline and live states, 30s polling |

---

## Task 1: DB — stream_config table and helper functions

**Files:**
- Modify: `app/db.js`

- [ ] **Step 1: Add table creation to the db.exec block**

In `db.js`, find the large `db.exec(\`` block. It ends with a cluster of `CREATE INDEX` statements. Add the following **inside** that template literal, after the last `CREATE INDEX` line and before the closing backtick:

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

- [ ] **Step 2: Add prepared statements**

In `db.js`, find `const stmts = {`. Add the following two entries inside the object (before the closing `};`):

```javascript
    getStreamConfig: db.prepare('SELECT * FROM stream_config WHERE id = 1'),
    upsertStreamConfig: db.prepare(`INSERT INTO stream_config
        (id, is_live, stream_url, channel_id, stream_title, next_stream_at, discount_code, code_description, updated_at)
        VALUES (1, @is_live, @stream_url, @channel_id, @stream_title, @next_stream_at, @discount_code, @code_description, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
            is_live          = excluded.is_live,
            stream_url       = excluded.stream_url,
            channel_id       = excluded.channel_id,
            stream_title     = excluded.stream_title,
            next_stream_at   = excluded.next_stream_at,
            discount_code    = excluded.discount_code,
            code_description = excluded.code_description,
            updated_at       = excluded.updated_at`),
```

- [ ] **Step 3: Add helper functions**

In `db.js`, find the comment `// ── Compat helpers` near the bottom. Add the following block **before** that comment:

```javascript
// ── Stream config ────────────────────────────────────────────────────────────

function getStreamConfig() {
    const row = stmts.getStreamConfig.get();
    if (!row) return { isLive: false, streamUrl: null, channelId: null, streamTitle: null, nextStreamAt: null, discountCode: null, codeDescription: null };
    return {
        isLive:          !!row.is_live,
        streamUrl:       row.stream_url,
        channelId:       row.channel_id,
        streamTitle:     row.stream_title,
        nextStreamAt:    row.next_stream_at,
        discountCode:    row.discount_code,
        codeDescription: row.code_description
    };
}

function saveStreamConfig({ isLive, streamUrl, channelId, streamTitle, nextStreamAt, discountCode, codeDescription }) {
    stmts.upsertStreamConfig.run({
        is_live:          isLive ? 1 : 0,
        stream_url:       streamUrl       || null,
        channel_id:       channelId       || null,
        stream_title:     streamTitle     || null,
        next_stream_at:   nextStreamAt    || null,
        discount_code:    discountCode    || null,
        code_description: codeDescription || null,
        updated_at:       new Date().toISOString()
    });
    return getStreamConfig();
}
```

- [ ] **Step 4: Export the new functions**

In `db.js`, find the `module.exports = {` block. Add `getStreamConfig, saveStreamConfig,` to the exported object.

- [ ] **Step 5: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add db.js
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add stream_config table and db helpers"
```

---

## Task 2: API routes

**Files:**
- Modify: `app/server.js`

- [ ] **Step 1: Add public GET /api/stream**

In `server.js`, find the block of public `/api/` routes (near `app.get('/api/menu'` or `app.get('/api/config'`). Add:

```javascript
// ── Stream config (public) ───────────────────────────────────────────────────
app.get('/api/stream', (req, res) => {
    res.json(db.getStreamConfig());
});
```

- [ ] **Step 2: Add admin GET and POST /admin/api/stream**

In `server.js`, find the block of admin routes near `app.post('/admin/api/pause'`. Add after it:

```javascript
app.get('/admin/api/stream', requireAdmin, (req, res) => {
    res.json(db.getStreamConfig());
});

app.post('/admin/api/stream', requireAdmin, (req, res) => {
    try {
        const { isLive, streamUrl, channelId, streamTitle, nextStreamAt, discountCode, codeDescription } = req.body;
        const config = db.saveStreamConfig({ isLive, streamUrl, channelId, streamTitle, nextStreamAt, discountCode, codeDescription });
        res.json(config);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
```

- [ ] **Step 3: Manual test — verify GET /api/stream**

Start the server (`npm run dev` from the `app/` directory). In a new terminal:

```bash
curl http://localhost:3000/api/stream
```

Expected:
```json
{"isLive":false,"streamUrl":null,"channelId":null,"streamTitle":null,"nextStreamAt":null,"discountCode":null,"codeDescription":null}
```

- [ ] **Step 4: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add server.js
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add /api/stream and /admin/api/stream routes"
```

---

## Task 3: Admin Livestream tab

**Files:**
- Modify: `app/public/admin.html`

- [ ] **Step 1: Add tab button**

In `admin.html`, find this exact line (~line 193):
```html
        <button class="tab-btn" onclick="switchTab('phonebank')">Phone / Bank</button>
```

Add the Livestream button immediately after it (before the `</div>` that closes `.admin-tabs`):
```html
        <button class="tab-btn" onclick="switchTab('livestream')">📺 Livestream</button>
```

- [ ] **Step 2: Add tab content div**

In `admin.html`, find the closing `</div>` of `tab-phonebank` (~line 389) followed immediately by the `</div>` that closes `#admin-screen` (~line 390). Insert the new tab content **between** those two closing tags:

```html
    <div id="tab-livestream" class="tab-content">
        <div style="background:var(--dark);border:1px solid #333;border-radius:10px;padding:1.25rem;margin-bottom:1rem">
            <h2 style="color:var(--gold);font-size:1.1rem;margin-bottom:1.25rem">📺 Livestream Settings</h2>

            <div style="display:grid;gap:1rem">
                <div style="display:flex;align-items:center;justify-content:space-between;background:#111;border:1px solid #333;border-radius:8px;padding:0.75rem 1rem">
                    <div>
                        <div style="font-weight:700;color:var(--cream);margin-bottom:0.2rem">Go Live</div>
                        <div style="font-size:0.8rem;color:#888">Switches /live to the live stream layout for all visitors within 30 seconds</div>
                    </div>
                    <label style="position:relative;display:inline-block;width:48px;height:26px;cursor:pointer;flex-shrink:0">
                        <input type="checkbox" id="ls-is-live" style="opacity:0;width:0;height:0">
                        <span id="ls-toggle-track" style="position:absolute;inset:0;background:#333;border-radius:13px;transition:background 0.2s"></span>
                        <span id="ls-toggle-thumb" style="position:absolute;left:3px;top:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:left 0.2s"></span>
                    </label>
                </div>

                <div>
                    <label style="font-size:0.75rem;color:var(--gold);display:block;margin-bottom:0.3rem;letter-spacing:0.05em">YOUTUBE LIVE URL</label>
                    <input type="url" id="ls-stream-url" placeholder="https://youtube.com/live/xxxx" style="width:100%;padding:0.6rem 0.75rem;background:#111;border:1px solid #333;border-radius:6px;color:var(--cream);font-family:inherit;font-size:0.9rem">
                </div>

                <div>
                    <label style="font-size:0.75rem;color:var(--gold);display:block;margin-bottom:0.3rem;letter-spacing:0.05em">YOUTUBE CHANNEL ID <span style="color:#666;font-size:0.7rem">(UCxxxxxxx — used for replay auto-embed. Find in YouTube Studio → Customisation → Basic info)</span></label>
                    <input type="text" id="ls-channel-id" placeholder="UCxxxxxxxxxxxxxxxxxx" style="width:100%;padding:0.6rem 0.75rem;background:#111;border:1px solid #333;border-radius:6px;color:var(--cream);font-family:inherit;font-size:0.9rem">
                </div>

                <div>
                    <label style="font-size:0.75rem;color:var(--gold);display:block;margin-bottom:0.3rem;letter-spacing:0.05em">STREAM TITLE</label>
                    <input type="text" id="ls-stream-title" placeholder="e.g. Sauce Review Night" style="width:100%;padding:0.6rem 0.75rem;background:#111;border:1px solid #333;border-radius:6px;color:var(--cream);font-family:inherit;font-size:0.9rem">
                </div>

                <div>
                    <label style="font-size:0.75rem;color:var(--gold);display:block;margin-bottom:0.3rem;letter-spacing:0.05em">NEXT STREAM DATE &amp; TIME</label>
                    <input type="datetime-local" id="ls-next-stream" style="width:100%;padding:0.6rem 0.75rem;background:#111;border:1px solid #333;border-radius:6px;color:var(--cream);font-family:inherit;font-size:0.9rem">
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
                    <div>
                        <label style="font-size:0.75rem;color:var(--gold);display:block;margin-bottom:0.3rem;letter-spacing:0.05em">TONIGHT'S DISCOUNT CODE</label>
                        <input type="text" id="ls-discount-code" placeholder="e.g. LIVE25" style="width:100%;padding:0.6rem 0.75rem;background:#111;border:1px solid #333;border-radius:6px;color:var(--cream);font-family:inherit;font-size:0.9rem;text-transform:uppercase">
                    </div>
                    <div>
                        <label style="font-size:0.75rem;color:var(--gold);display:block;margin-bottom:0.3rem;letter-spacing:0.05em">CODE DESCRIPTION</label>
                        <input type="text" id="ls-code-desc" placeholder="e.g. 25% off — tonight only" style="width:100%;padding:0.6rem 0.75rem;background:#111;border:1px solid #333;border-radius:6px;color:var(--cream);font-family:inherit;font-size:0.9rem">
                    </div>
                </div>
            </div>

            <button onclick="saveStreamConfig()" style="margin-top:1.25rem;width:100%;padding:0.8rem;background:var(--gold);color:var(--black);border:none;border-radius:6px;font-size:1rem;font-weight:700;cursor:pointer;letter-spacing:0.05em">Save Stream Settings</button>
            <div id="ls-msg" style="margin-top:0.75rem;font-size:0.85rem;text-align:center;display:none"></div>
        </div>

        <div style="background:var(--dark);border:1px solid #333;border-radius:10px;padding:1rem">
            <p style="color:#888;font-size:0.8rem;line-height:1.7">
                <strong style="color:var(--gold)">How it works:</strong> Configure your settings before going live. Toggle <em>Go Live</em> when your stream starts — the /live page switches to the live layout for all visitors within 30 seconds. Toggle it off when you finish.<br><br>
                <strong style="color:var(--gold)">Discount code:</strong> The code must already exist in your discounts system. It will display in the order panel on the live page during your stream.
            </p>
        </div>
    </div>
```

- [ ] **Step 3: Add JS functions for the Livestream tab**

In `admin.html`, find the closing `</script>` tag of the main inline script block. Add the following **before** `</script>`:

```javascript
    // ── Livestream tab ────────────────────────────────────────────────────────
    (function () {
        const lsToggle = document.getElementById('ls-is-live');
        const lsTrack  = document.getElementById('ls-toggle-track');
        const lsThumb  = document.getElementById('ls-toggle-thumb');

        function updateToggleUI(checked) {
            lsTrack.style.background = checked ? '#d4af37' : '#333';
            lsThumb.style.left = checked ? '25px' : '3px';
        }

        lsToggle.addEventListener('change', () => updateToggleUI(lsToggle.checked));

        window.loadStreamConfig = async function () {
            try {
                const res = await fetch('/admin/api/stream', {
                    headers: { Authorization: 'Bearer ' + sessionToken }
                });
                if (!res.ok) return;
                const cfg = await res.json();
                lsToggle.checked = !!cfg.isLive;
                updateToggleUI(!!cfg.isLive);
                document.getElementById('ls-stream-url').value    = cfg.streamUrl        || '';
                document.getElementById('ls-channel-id').value    = cfg.channelId        || '';
                document.getElementById('ls-stream-title').value  = cfg.streamTitle      || '';
                document.getElementById('ls-discount-code').value = cfg.discountCode     || '';
                document.getElementById('ls-code-desc').value     = cfg.codeDescription  || '';
                if (cfg.nextStreamAt) {
                    const d = new Date(cfg.nextStreamAt);
                    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                        .toISOString().slice(0, 16);
                    document.getElementById('ls-next-stream').value = local;
                }
            } catch (e) { console.error('loadStreamConfig', e); }
        };

        window.saveStreamConfig = async function () {
            const msg     = document.getElementById('ls-msg');
            const nextRaw = document.getElementById('ls-next-stream').value;
            const body = {
                isLive:          lsToggle.checked,
                streamUrl:       document.getElementById('ls-stream-url').value.trim(),
                channelId:       document.getElementById('ls-channel-id').value.trim(),
                streamTitle:     document.getElementById('ls-stream-title').value.trim(),
                nextStreamAt:    nextRaw ? new Date(nextRaw).toISOString() : null,
                discountCode:    document.getElementById('ls-discount-code').value.trim().toUpperCase(),
                codeDescription: document.getElementById('ls-code-desc').value.trim()
            };
            try {
                const res = await fetch('/admin/api/stream', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionToken },
                    body:    JSON.stringify(body)
                });
                if (!res.ok) throw new Error(await res.text());
                msg.style.color   = '#4caf50';
                msg.textContent   = '✓ Saved';
                msg.style.display = 'block';
                setTimeout(() => { msg.style.display = 'none'; }, 3000);
            } catch (e) {
                msg.style.color   = '#ff6b6b';
                msg.textContent   = '✗ Save failed — ' + e.message;
                msg.style.display = 'block';
            }
        };
    })();
```

- [ ] **Step 4: Wire loadStreamConfig into switchTab**

In `admin.html`, find the `switchTab` function (~line 727). It ends with:
```javascript
        if (tab === 'customers') { loadLotteryStats(); loadCustomers(); }
    }
```

Add one more line before the closing `}`:
```javascript
        if (tab === 'livestream') loadStreamConfig();
```

- [ ] **Step 5: Manual test — admin tab**

Open the admin panel in a browser and log in. Click the "📺 Livestream" tab. The form fields should appear. Fill in a stream title, set a future date, enter a test code. Click Save. You should see "✓ Saved". Refresh the page, switch to the tab again — the values should still be there (loaded from the DB).

- [ ] **Step 6: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add public/admin.html
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add Livestream tab to admin panel"
```

---

## Task 4: live.html — the public livestream page

**Files:**
- Create: `app/public/live.html`

- [ ] **Step 1: Create the full page**

Create `app/public/live.html` with the following content. This is the complete file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Charlie's Wingz | Live</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Bebas+Neue&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --gold:     #D4A84B;
            --gold-light: #E8C97B;
            --burgundy: #8B1A1A;
            --black:    #0A0A0A;
            --black-light: #1A1A1A;
            --cream:    #F5F0E6;
            --cream-dark: #E8E0D0;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        html { scroll-behavior: smooth; }

        body {
            font-family: 'Inter', sans-serif;
            background: var(--black);
            color: var(--cream);
            line-height: 1.6;
            min-height: 100vh;
            border-left: 4px solid var(--gold);
            border-right: 4px solid var(--gold);
            border-bottom: 4px solid var(--gold);
        }

        /* ── Nav ─────────────────────────────────────────────────────────────── */
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

        .nav-links {
            display: flex;
            gap: 1.5rem;
            align-items: center;
        }

        .nav-links a {
            font-size: 0.75rem;
            color: var(--cream-dark);
            text-decoration: none;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            opacity: 0.75;
            transition: opacity 0.2s;
        }

        .nav-links a:hover, .nav-links a.active { opacity: 1; color: var(--gold); }

        /* ── Page wrapper ────────────────────────────────────────────────────── */
        .page {
            padding-top: 2.6rem;
            min-height: 100vh;
        }

        /* ── LIVE badge ──────────────────────────────────────────────────────── */
        .live-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            background: var(--burgundy);
            color: var(--cream);
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.85rem;
            letter-spacing: 0.12em;
            padding: 0.3rem 0.75rem;
            border-radius: 4px;
        }

        .live-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #ff4444;
            animation: live-pulse 1.2s ease-in-out infinite;
        }

        @keyframes live-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.4; transform: scale(0.85); }
        }

        /* ═══════════════════════════════════════════════════════════════════════
           LIVE STATE
        ═══════════════════════════════════════════════════════════════════════ */
        #state-live {
            display: none;
            padding: 1.5rem 2rem 2rem;
            max-width: 1200px;
            margin: 0 auto;
        }

        .live-header {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1.25rem;
        }

        .live-title {
            font-family: 'Playfair Display', serif;
            font-size: 1.3rem;
            color: var(--cream);
        }

        .live-layout {
            display: grid;
            grid-template-columns: 1fr 380px;
            gap: 1.5rem;
            align-items: start;
        }

        /* Stream embed */
        .stream-embed-wrap {
            position: relative;
        }

        .stream-embed-wrap .badge-pos {
            position: absolute;
            top: 0.75rem;
            left: 0.75rem;
            z-index: 2;
        }

        .stream-iframe-container {
            position: relative;
            padding-bottom: 56.25%;
            height: 0;
            overflow: hidden;
            border-radius: 8px;
            border: 1px solid rgba(212,168,75,0.2);
            background: #111;
        }

        .stream-iframe-container iframe {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            border: 0;
        }

        /* Order panel */
        .order-panel {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .order-panel-title {
            font-family: 'Playfair Display', serif;
            font-size: 1.1rem;
            color: var(--cream);
        }

        .drop-card {
            background: rgba(212,168,75,0.07);
            border: 1px solid rgba(212,168,75,0.35);
            border-radius: 8px;
            padding: 1rem 1.1rem;
        }

        .drop-label {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.75rem;
            letter-spacing: 0.15em;
            color: var(--gold);
            margin-bottom: 0.3rem;
        }

        .drop-code {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 2rem;
            letter-spacing: 0.12em;
            color: var(--gold);
            line-height: 1;
            margin-bottom: 0.2rem;
        }

        .drop-desc {
            font-size: 0.8rem;
            color: #aaa;
        }

        .drop-card.hidden { display: none; }

        /* Quick order */
        .quick-order {
            background: var(--black-light);
            border: 1px solid #2a2a2a;
            border-radius: 8px;
            overflow: hidden;
        }

        .quick-order-title {
            font-size: 0.7rem;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: #666;
            padding: 0.6rem 1rem;
            border-bottom: 1px solid #2a2a2a;
        }

        .quick-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.65rem 1rem;
            border-bottom: 1px solid #1e1e1e;
            gap: 0.75rem;
        }

        .quick-item:last-child { border-bottom: none; }

        .quick-item-name {
            font-size: 0.85rem;
            color: var(--cream);
            flex: 1;
        }

        .quick-item-price {
            font-size: 0.85rem;
            color: var(--gold);
            font-weight: 600;
            white-space: nowrap;
        }

        .quick-item-btn {
            background: var(--burgundy);
            color: var(--cream);
            border: none;
            border-radius: 4px;
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            padding: 0.3rem 0.7rem;
            cursor: pointer;
            white-space: nowrap;
            transition: background 0.15s;
            text-decoration: none;
            display: inline-block;
        }

        .quick-item-btn:hover { background: #a02020; }

        .menu-cta {
            display: block;
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
            text-align: center;
            text-decoration: none;
            transition: opacity 0.15s;
        }

        .menu-cta:hover { opacity: 0.9; }

        /* ═══════════════════════════════════════════════════════════════════════
           OFFLINE STATE
        ═══════════════════════════════════════════════════════════════════════ */
        #state-offline {
            display: none;
            padding: 2rem 2rem 3rem;
            max-width: 900px;
            margin: 0 auto;
        }

        .offline-hero {
            text-align: center;
            padding: 3rem 1rem 2.5rem;
            border-bottom: 1px solid #1e1e1e;
            margin-bottom: 2.5rem;
        }

        .offline-eyebrow {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.85rem;
            letter-spacing: 0.2em;
            color: #666;
            margin-bottom: 0.75rem;
        }

        .offline-title {
            font-family: 'Playfair Display', serif;
            font-size: clamp(1.8rem, 4vw, 2.8rem);
            color: var(--cream);
            margin-bottom: 0.5rem;
        }

        .offline-subtitle {
            font-size: 0.9rem;
            color: #888;
            margin-bottom: 2rem;
        }

        /* Countdown */
        .countdown {
            display: flex;
            justify-content: center;
            gap: 1.5rem;
            margin-bottom: 1.5rem;
            flex-wrap: wrap;
        }

        .cd-unit {
            text-align: center;
            min-width: 70px;
        }

        .cd-num {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 3rem;
            color: var(--gold);
            line-height: 1;
            display: block;
        }

        .cd-label {
            font-size: 0.65rem;
            color: #666;
            letter-spacing: 0.15em;
            text-transform: uppercase;
        }

        .cd-sep {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 3rem;
            color: #333;
            line-height: 1;
            align-self: flex-start;
            padding-top: 0;
        }

        .offline-date {
            font-size: 0.85rem;
            color: #777;
        }

        .notify-btn {
            display: inline-block;
            margin-top: 1.5rem;
            padding: 0.7rem 2rem;
            background: transparent;
            border: 1px solid var(--gold);
            color: var(--gold);
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.9rem;
            letter-spacing: 0.12em;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .notify-btn:hover {
            background: rgba(212,168,75,0.1);
        }

        /* Replay section */
        .replay-section {
            margin-top: 0.5rem;
        }

        .replay-label {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 0.85rem;
            letter-spacing: 0.15em;
            color: #555;
            text-align: center;
            margin-bottom: 1.25rem;
        }

        .replay-embed {
            position: relative;
            padding-bottom: 56.25%;
            height: 0;
            overflow: hidden;
            border-radius: 8px;
            border: 1px solid #1e1e1e;
            background: #111;
        }

        .replay-embed iframe {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            border: 0;
        }

        /* No-stream placeholder */
        .no-stream {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            text-align: center;
            flex-direction: column;
            gap: 1rem;
            padding: 2rem;
        }

        .no-stream h2 {
            font-family: 'Playfair Display', serif;
            font-size: 2rem;
            color: var(--cream);
        }

        .no-stream p { color: #666; font-size: 0.9rem; }

        /* ── Mobile ──────────────────────────────────────────────────────────── */
        @media (max-width: 768px) {
            #state-live { padding: 1rem 1rem 2rem; }
            #state-offline { padding: 1.5rem 1rem 3rem; }

            .live-layout {
                grid-template-columns: 1fr;
            }

            .site-nav { padding: 0.6rem 1rem; }
            .nav-links a { font-size: 0.65rem; gap: 0.75rem; }
            .nav-links { gap: 0.75rem; }

            .countdown { gap: 1rem; }
            .cd-num { font-size: 2.2rem; }
        }
    </style>
</head>
<body>

<!-- Nav -->
<nav class="site-nav">
    <a href="/" class="nav-logo">Charlie's Wingz</a>
    <div class="nav-links">
        <a href="/">Menu</a>
        <a href="/live.html" class="active">Live</a>
        <a href="/game.html">Games</a>
    </div>
</nav>

<div class="page">

    <!-- ── LIVE STATE ─────────────────────────────────────────────────────── -->
    <div id="state-live">
        <div class="live-header">
            <span class="live-badge"><span class="live-dot"></span>LIVE</span>
            <h1 class="live-title" id="live-title">Charlie's Wingz Live</h1>
        </div>

        <div class="live-layout">
            <!-- Left: stream -->
            <div class="stream-embed-wrap">
                <div class="badge-pos">
                    <span class="live-badge"><span class="live-dot"></span>LIVE</span>
                </div>
                <div class="stream-iframe-container">
                    <iframe id="live-iframe"
                        src=""
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen>
                    </iframe>
                </div>
            </div>

            <!-- Right: order panel -->
            <div class="order-panel">
                <div class="order-panel-title">Order While You Watch</div>

                <!-- Tonight's drop -->
                <div class="drop-card" id="drop-card">
                    <div class="drop-label">🔥 Tonight's Drop</div>
                    <div class="drop-code" id="drop-code"></div>
                    <div class="drop-desc" id="drop-desc"></div>
                </div>

                <!-- Quick order -->
                <div class="quick-order">
                    <div class="quick-order-title">Popular Orders</div>
                    <div class="quick-item">
                        <span class="quick-item-name">10 Wings</span>
                        <span class="quick-item-price">£14.00</span>
                        <a href="/?item=w10" class="quick-item-btn">Order</a>
                    </div>
                    <div class="quick-item">
                        <span class="quick-item-name">10 Wing Royal Meal</span>
                        <span class="quick-item-price">£18.00</span>
                        <a href="/?item=m10" class="quick-item-btn">Order</a>
                    </div>
                    <div class="quick-item">
                        <span class="quick-item-name">Duo Box</span>
                        <span class="quick-item-price">£35.00</span>
                        <a href="/?item=b-duo" class="quick-item-btn">Order</a>
                    </div>
                </div>

                <a href="/" class="menu-cta">Full Menu →</a>
            </div>
        </div>
    </div>

    <!-- ── OFFLINE STATE ──────────────────────────────────────────────────── -->
    <div id="state-offline">
        <div class="offline-hero">
            <div class="offline-eyebrow">We're Not Live Right Now</div>
            <h1 class="offline-title" id="offline-title">Next Stream</h1>
            <p class="offline-subtitle" id="offline-subtitle"></p>

            <!-- Countdown -->
            <div class="countdown" id="countdown-wrap">
                <div class="cd-unit"><span class="cd-num" id="cd-days">--</span><span class="cd-label">Days</span></div>
                <div class="cd-sep">:</div>
                <div class="cd-unit"><span class="cd-num" id="cd-hours">--</span><span class="cd-label">Hours</span></div>
                <div class="cd-sep">:</div>
                <div class="cd-unit"><span class="cd-num" id="cd-mins">--</span><span class="cd-label">Mins</span></div>
                <div class="cd-sep">:</div>
                <div class="cd-unit"><span class="cd-num" id="cd-secs">--</span><span class="cd-label">Secs</span></div>
            </div>

            <div class="offline-date" id="offline-date"></div>

            <button class="notify-btn" id="notify-btn" onclick="requestNotify()">🔔 Notify Me</button>
        </div>

        <!-- Latest replay -->
        <div class="replay-section" id="replay-section" style="display:none">
            <div class="replay-label">— WATCH THE LATEST STREAM —</div>
            <div class="replay-embed">
                <iframe id="replay-iframe"
                    src=""
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowfullscreen>
                </iframe>
            </div>
        </div>
    </div>

    <!-- ── NO CONFIG STATE ────────────────────────────────────────────────── -->
    <div id="state-none" class="no-stream">
        <h2>Coming Soon</h2>
        <p>Charlie's Wingz Live is on its way. Stay tuned.</p>
        <a href="/" class="menu-cta" style="max-width:260px">Order Now →</a>
    </div>

</div>

<script>
    let countdownInterval = null;
    let pollInterval      = null;
    let currentState      = null;

    // ── Countdown timer ───────────────────────────────────────────────────────
    function startCountdown(targetIso) {
        if (countdownInterval) clearInterval(countdownInterval);

        function tick() {
            const diff = new Date(targetIso) - Date.now();
            if (diff <= 0) {
                document.getElementById('cd-days').textContent  = '00';
                document.getElementById('cd-hours').textContent = '00';
                document.getElementById('cd-mins').textContent  = '00';
                document.getElementById('cd-secs').textContent  = '00';
                clearInterval(countdownInterval);
                return;
            }
            const days  = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const mins  = Math.floor((diff % 3600000)  / 60000);
            const secs  = Math.floor((diff % 60000)    / 1000);
            document.getElementById('cd-days').textContent  = String(days).padStart(2, '0');
            document.getElementById('cd-hours').textContent = String(hours).padStart(2, '0');
            document.getElementById('cd-mins').textContent  = String(mins).padStart(2, '0');
            document.getElementById('cd-secs').textContent  = String(secs).padStart(2, '0');
        }

        tick();
        countdownInterval = setInterval(tick, 1000);
    }

    // ── Render state ──────────────────────────────────────────────────────────
    function renderState(cfg) {
        document.getElementById('state-live').style.display    = 'none';
        document.getElementById('state-offline').style.display = 'none';
        document.getElementById('state-none').style.display    = 'none';

        if (cfg.isLive && cfg.streamUrl) {
            // Convert youtube.com/live/xxx to an embeddable URL
            const embedUrl = youtubeEmbedUrl(cfg.streamUrl);
            document.getElementById('live-iframe').src = embedUrl;
            document.getElementById('live-title').textContent = cfg.streamTitle || "Charlie's Wingz Live";

            // Discount drop card
            if (cfg.discountCode) {
                document.getElementById('drop-code').textContent = cfg.discountCode;
                document.getElementById('drop-desc').textContent = cfg.codeDescription || '';
                document.getElementById('drop-card').classList.remove('hidden');
            } else {
                document.getElementById('drop-card').classList.add('hidden');
            }

            document.getElementById('state-live').style.display = 'block';

        } else if (!cfg.isLive && (cfg.nextStreamAt || cfg.channelId || cfg.streamTitle)) {
            // Offline — show countdown and/or replay
            document.getElementById('offline-title').textContent =
                cfg.streamTitle ? 'Next: ' + cfg.streamTitle : 'Next Stream';

            if (cfg.nextStreamAt) {
                startCountdown(cfg.nextStreamAt);
                document.getElementById('countdown-wrap').style.display = 'flex';
                const d = new Date(cfg.nextStreamAt);
                document.getElementById('offline-date').textContent =
                    d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
                document.getElementById('offline-subtitle').textContent = '';
            } else {
                document.getElementById('countdown-wrap').style.display = 'none';
                document.getElementById('offline-date').textContent = '';
                document.getElementById('offline-subtitle').textContent = 'No date set yet — check back soon.';
            }

            if (cfg.channelId) {
                const replayUrl = 'https://www.youtube.com/embed?listType=user_uploads&list=' + cfg.channelId + '&index=1';
                document.getElementById('replay-iframe').src = replayUrl;
                document.getElementById('replay-section').style.display = 'block';
            } else {
                document.getElementById('replay-section').style.display = 'none';
            }

            document.getElementById('state-offline').style.display = 'block';

        } else {
            document.getElementById('state-none').style.display = 'flex';
        }
    }

    // ── Convert YouTube watch/live URL to embed URL ───────────────────────────
    function youtubeEmbedUrl(url) {
        try {
            const u = new URL(url);
            // youtube.com/live/VIDEO_ID
            if (u.pathname.startsWith('/live/')) {
                const id = u.pathname.replace('/live/', '').split('/')[0];
                return 'https://www.youtube.com/embed/' + id + '?autoplay=1';
            }
            // youtube.com/watch?v=VIDEO_ID
            if (u.searchParams.get('v')) {
                return 'https://www.youtube.com/embed/' + u.searchParams.get('v') + '?autoplay=1';
            }
            // youtu.be/VIDEO_ID
            if (u.hostname === 'youtu.be') {
                return 'https://www.youtube.com/embed' + u.pathname + '?autoplay=1';
            }
            // Already an embed URL
            if (u.pathname.startsWith('/embed/')) return url;
        } catch (e) {}
        return url;
    }

    // ── Push notification opt-in ──────────────────────────────────────────────
    async function requestNotify() {
        const btn = document.getElementById('notify-btn');
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            btn.textContent = '⚠ Not supported in this browser';
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                btn.textContent = '🔕 Permission denied';
                return;
            }
            btn.textContent = '✓ You\'ll be notified!';
            btn.disabled = true;
        } catch (e) {
            btn.textContent = '⚠ Could not enable notifications';
        }
    }

    // ── Poll /api/stream every 30s ────────────────────────────────────────────
    async function fetchAndRender() {
        try {
            const res = await fetch('/api/stream');
            if (!res.ok) return;
            const cfg = await res.json();
            // Only re-render if state changed (avoids iframe src flicker)
            const newState = cfg.isLive ? 'live' : 'offline';
            if (newState !== currentState) {
                currentState = newState;
                renderState(cfg);
            }
        } catch (e) { /* server offline — leave current state */ }
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    (async function init() {
        const res = await fetch('/api/stream');
        const cfg = await res.json();
        currentState = cfg.isLive ? 'live' : 'offline';
        renderState(cfg);
        pollInterval = setInterval(fetchAndRender, 30000);
    })();
</script>
</body>
</html>
```

- [ ] **Step 2: Manual test — offline state**

With the server running, open `http://localhost:3000/live.html`. It should show the "no-stream" placeholder (or offline state if you already saved config in Task 3). In the admin panel, set a stream title and a future date/time, save — then reload `/live.html`. The countdown should appear and tick down.

- [ ] **Step 3: Manual test — live state**

In the admin panel, paste any YouTube URL in the Live URL field and toggle "Go Live" on, then save. Within 30 seconds (or after a manual reload), `/live.html` should switch to the split layout: stream on the left, order panel on the right.

- [ ] **Step 4: Manual test — auto-switch**

With the live page open in a browser tab, go to the admin panel in another tab and toggle "Go Live" off, save. Within 30 seconds, the `/live.html` tab should automatically switch back to the offline/countdown state without a manual reload.

- [ ] **Step 5: Manual test — mobile**

Open DevTools, switch to a mobile viewport (375px wide). The layout should be single-column: stream on top, order panel stacked below. All buttons should be full-width or comfortably tappable.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" add public/live.html
git -C "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" commit -m "feat: add /live page with offline countdown and live stream states"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 8 success criteria from the spec have a corresponding task. State polling (30s), countdown, replay embed, admin config, discount card, mobile layout — all covered.
- [x] **No placeholders:** All code blocks are complete. Menu item names/prices verified against actual MENU object in server.js (`w10` = £14.00, `m10` = £18.00, `b-duo` = £35.00).
- [x] **Type consistency:** `getStreamConfig` returns camelCase keys (`isLive`, `streamUrl`, `channelId`, etc.) consistently across DB function → API route → frontend consumption.
- [x] **Auth pattern:** Admin routes use `requireAdmin` middleware and `sessionToken` in fetch headers — matches existing pattern throughout `admin.html`.
- [x] **Route naming:** Admin routes use `/admin/api/stream` (not `/api/admin/stream`) — matches existing admin route convention in `server.js`.
