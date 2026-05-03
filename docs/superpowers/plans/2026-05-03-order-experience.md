# Order Experience Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live order tracker that customers see after Stripe checkout — polling the order status every 10 seconds with a progress bar.

**Architecture:** Generate a `track_token` at checkout time, embed it in the Stripe success URL, store it in the `orders` table, expose a public `GET /api/orders/track/:token` endpoint, and update the `handleCheckoutReturn` IIFE in `index.html` to render a polling tracker UI when the token param is present.

**Tech Stack:** better-sqlite3 (sync), Express, vanilla JS (existing patterns), crypto.randomBytes

---

### Task 1: DB — track_token column and helper

**Files:**
- Modify: `app/db.js`

**Context:** `db.js` uses a migration pattern at the bottom of the `db.exec` block to add columns without dropping data. Look for the existing `['orders', ...]` entries in the migrations array. The `insertOrder` prepared statement on line ~300 uses named `@param` syntax. The helper function `insertOrder` at line ~440 maps JS camelCase to the named params.

- [ ] **Step 1: Open db.js and find the migrations array**

Look for the block that looks like:
```javascript
[
    ['orders', 'payment_status', "TEXT DEFAULT 'paid'"],
    ...
].forEach(([table, col, colDef]) => { ... });
```

Add `track_token` to that array:
```javascript
['orders', 'track_token', 'TEXT'],
```

- [ ] **Step 2: Add the unique index after the migration forEach block**

Find where other `CREATE UNIQUE INDEX` or `CREATE INDEX` statements appear (look for `idx_orders_status` or similar). Add immediately after the migration loop:
```javascript
db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_track_token ON orders(track_token) WHERE track_token IS NOT NULL').run();
```

- [ ] **Step 3: Add the prepared statement**

In the `stmts` object (where `getOrderById`, `getOrderByDriverToken` etc. are defined), add:
```javascript
getOrderByTrackToken: db.prepare('SELECT * FROM orders WHERE track_token = ?'),
```

- [ ] **Step 4: Update the insertOrder prepared statement**

Find the `insertOrder: db.prepare(...)` line. The INSERT lists columns and `@param` placeholders. Add `track_token` to both:
- In the column list: add `track_token` alongside the other columns
- In the VALUES list: add `@track_token`

The full updated INSERT (replace the existing one):
```javascript
insertOrder: db.prepare(`INSERT INTO orders (id, payment_intent_id, customer_name, customer_email, customer_phone, order_type, contact_pref, items_json, total_pence, address, city, postcode, lat, lng, delivery_notes, order_notes, driver_token, status, payment_status, payment_method, source, customer_id, track_token, created_at, updated_at) VALUES (@id, @payment_intent_id, @customer_name, @customer_email, @customer_phone, @order_type, @contact_pref, @items_json, @total_pence, @address, @city, @postcode, @lat, @lng, @delivery_notes, @order_notes, NULL, @status, @payment_status, @payment_method, @source, @customer_id, @track_token, @created_at, @updated_at)`),
```

- [ ] **Step 5: Update the insertOrder helper function**

Find `function insertOrder({ ... })` at line ~440. Add `trackToken = null` to the destructured params and map it in the object passed to `.run()`:
```javascript
function insertOrder({ id, paymentIntentId, customerName, customerEmail, customerPhone, orderType, contactPref, itemsJson, totalPence, address, city, postcode, lat, lng, deliveryNotes, orderNotes, status, paymentStatus, paymentMethod, source, customerId, trackToken = null }) {
```

And in the `.run()` call object, add:
```javascript
track_token: trackToken,
```

- [ ] **Step 6: Add the getOrderByTrackToken helper function**

Near the other `getOrderBy*` helpers (around line ~490), add:
```javascript
function getOrderByTrackToken(token) {
    return stmts.getOrderByTrackToken.get(token) || null;
}
```

- [ ] **Step 7: Export the new function**

Find the `module.exports` block at the bottom of `db.js`. Add `getOrderByTrackToken` to it.

- [ ] **Step 8: Start the server and verify no crash**

```bash
cd "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" && node server.js &
sleep 3 && curl -s http://localhost:3000/api/store-status | grep -c '"open"'
kill %1
```

Expected: prints `1` (JSON parsed successfully, no crash).

- [ ] **Step 9: Commit**

```bash
cd "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app"
git add db.js
git commit -m "feat: add track_token column and getOrderByTrackToken helper"
```

---

### Task 2: Server — checkout token generation and tracking API

**Files:**
- Modify: `app/server.js`

**Context:** The checkout handler is a large `app.post('/api/checkout', ...)` block. The `localOrderId` is generated just before the Stripe session params. The `success_url` is on the line immediately after the `sessionParams` object opens. The `db.insertOrder()` call is at the bottom of the try block. The `require('crypto')` may or may not be at the top — check; if not there, add it.

- [ ] **Step 1: Verify crypto is required**

At the top of `server.js`, check for `const crypto = require('crypto')`. If missing, add it alongside the other requires. It's used for referral codes already, so it's likely there.

- [ ] **Step 2: Generate trackToken in the checkout handler**

Find the line:
```javascript
const localOrderId = generateIdempotencyKey();
```

Add the next line:
```javascript
const trackToken = crypto.randomBytes(6).toString('hex');
```

- [ ] **Step 3: Update success_url**

Find:
```javascript
success_url: `https://order.charlieswingz.com/?order_success=1&session_id={CHECKOUT_SESSION_ID}`,
```

Replace with:
```javascript
success_url: `https://order.charlieswingz.com/?order_success=1&track=${trackToken}`,
```

- [ ] **Step 4: Pass trackToken into insertOrder**

Find the `db.insertOrder(dbOrder)` call. The `dbOrder` object is built a few lines before. Add `trackToken` to it:
```javascript
trackToken: trackToken,
```

- [ ] **Step 5: Add the public tracking endpoint**

Find a good place near the other public order endpoints (around the `/api/orders/:id/items` route at line ~724). Add:

```javascript
// ── Public order tracker (token-authenticated) ────────────────────────────
app.get('/api/orders/track/:token', (req, res) => {
    const { token } = req.params;
    if (!token || !/^[0-9a-f]{12}$/.test(token)) {
        return res.status(400).json({ error: 'Invalid token' });
    }
    const order = db.getOrderByTrackToken(token);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const firstName = (order.customer_name || '').split(' ')[0] || 'there';
    return res.json({
        shortId:      order.id.slice(-6).toUpperCase(),
        status:       order.status || 'received',
        orderType:    order.order_type || 'collection',
        customerName: firstName,
        reorderId:    order.id,
        estimatedAt:  null,
    });
});
```

**Important:** This route must be defined BEFORE any `app.get('/api/orders/:id/...')` routes to avoid Express matching `track` as the `:id` param. Check the order in the file and place this above any `/api/orders/:id` routes.

- [ ] **Step 6: Start the server, create a test token, and hit the endpoint**

```bash
cd "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app" && node server.js &
sleep 2

# Insert a test order directly into the DB
node -e "
const db = require('./db');
db.insertOrder({
  id: 'test-order-tracker-001',
  paymentIntentId: 'pi_test',
  customerName: 'Test User',
  customerEmail: 'test@test.com',
  customerPhone: '07700000000',
  orderType: 'collection',
  contactPref: 'sms',
  itemsJson: '[]',
  totalPence: 1000,
  status: 'preparing',
  paymentStatus: 'paid',
  paymentMethod: 'stripe',
  source: 'web',
  customerId: null,
  trackToken: 'aabbcc112233',
});
console.log('inserted');
"

curl -s http://localhost:3000/api/orders/track/aabbcc112233
kill %1
```

Expected output: `{"shortId":"...","status":"preparing","orderType":"collection","customerName":"Test","reorderId":"test-order-tracker-001","estimatedAt":null}`

- [ ] **Step 7: Commit**

```bash
cd "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app"
git add server.js
git commit -m "feat: generate track_token at checkout, add GET /api/orders/track/:token"
```

---

### Task 3: Frontend — live tracker UI in index.html

**Files:**
- Modify: `app/public/index.html`

**Context:** The `handleCheckoutReturn` IIFE starts around line 3315. It currently replaces `document.body.innerHTML` with a static success card when `?order_success=1` is in the URL. We keep that fallback but add a new path: if `?track=TOKEN` is also present, call `startOrderTracker(token)` instead.

- [ ] **Step 1: Add CSS for the tracker**

Find the `<style>` block in `index.html` (the main one near the top). Add these styles at the end of the block, before the closing `</style>`:

```css
/* ── Live Order Tracker ─────────────────────────────────── */
#tracker-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d0d0d;
    padding: 20px;
}
.tracker-card {
    max-width: 520px;
    width: 100%;
    text-align: center;
    font-family: sans-serif;
    color: #f5f0e8;
}
.tracker-card h1 { color: #d4af37; font-size: 2rem; margin: 0 0 4px; }
.tracker-card .tracker-subtitle { color: #aaa; margin: 0 0 28px; font-size: 0.95rem; }
.tracker-steps {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 0;
    margin-bottom: 24px;
}
.tracker-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    position: relative;
}
.tracker-step:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 12px;
    left: 50%;
    width: 100%;
    height: 2px;
    background: rgba(212,175,55,0.2);
}
.tracker-step.done::after { background: #d4af37; }
.tracker-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(212,175,55,0.3);
    background: #0d0d0d;
    position: relative;
    z-index: 1;
    margin-bottom: 8px;
    transition: background 0.3s, border-color 0.3s;
}
.tracker-step.done .tracker-dot { background: #d4af37; border-color: #d4af37; }
.tracker-step.active .tracker-dot { border-color: #d4af37; box-shadow: 0 0 8px rgba(212,175,55,0.5); }
.tracker-label { font-size: 0.7rem; color: #888; line-height: 1.2; max-width: 60px; }
.tracker-step.done .tracker-label, .tracker-step.active .tracker-label { color: #d4af37; }
.tracker-message {
    background: #1a1a1a;
    border: 1px solid rgba(212,175,55,0.3);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
    font-size: 0.95rem;
    min-height: 48px;
}
.tracker-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.tracker-actions a {
    padding: 10px 24px;
    border-radius: 4px;
    font-weight: bold;
    text-decoration: none;
    font-size: 0.9rem;
}
.tracker-btn-primary { background: #d4af37; color: #0d0d0d; }
.tracker-btn-secondary { border: 1px solid rgba(212,175,55,0.4); color: #d4af37; }
.tracker-error { color: #e05555; font-size: 0.85rem; margin-top: 12px; }
```

- [ ] **Step 2: Add the tracker JS functions**

Find the `handleCheckoutReturn` IIFE. Add these three functions BEFORE that IIFE (so they're defined when the IIFE runs):

```javascript
// ── Live Order Tracker ────────────────────────────────────────────────────
function getStatusStep(status, orderType) {
    // Returns 0–3. Steps: 0=received, 1=preparing, 2=ready/out_for_delivery, 3=terminal
    const map = {
        pending_payment: 0,
        received:        0,
        preparing:       1,
        ready:           orderType === 'delivery' ? 1 : 2,
        out_for_delivery: 2,
        delivered:       3,
        collected:       3,
    };
    return map[status] ?? 0;
}

function getStatusMessage(status, orderType) {
    const messages = {
        pending_payment:  "We've received your order and are confirming payment.",
        received:         "We've got your order and will start preparing it shortly.",
        preparing:        "Your order is being prepared now. Shouldn't be long! 🍗",
        ready:            orderType === 'delivery'
                            ? "Your order is ready and waiting for a driver."
                            : "Your order is ready! Come collect it. 👑",
        out_for_delivery: "Your driver is on the way! 🛵",
        delivered:        "Your order has been delivered. Enjoy! 👑",
        collected:        "Order collected. Enjoy your wings! 👑",
    };
    return messages[status] || "Your order is in progress.";
}

function updateTrackerUI(data) {
    const steps = data.orderType === 'delivery'
        ? ['Received', 'Preparing', 'On the Way', 'Delivered ✓']
        : ['Received', 'Preparing', 'Ready', 'Collected ✓'];

    const currentStep = getStatusStep(data.status, data.orderType);

    const stepsHtml = steps.map((label, i) => {
        const cls = i < currentStep ? 'done' : i === currentStep ? 'active' : '';
        return `<div class="tracker-step ${cls}">
            <div class="tracker-dot"></div>
            <div class="tracker-label">${label}</div>
        </div>`;
    }).join('');

    const stepsEl = document.getElementById('tracker-steps');
    if (stepsEl) stepsEl.innerHTML = stepsHtml;

    const msgEl = document.getElementById('tracker-message');
    if (msgEl) msgEl.textContent = getStatusMessage(data.status, data.orderType);

    const subtitleEl = document.getElementById('tracker-subtitle');
    if (subtitleEl) {
        const typeLabel = data.orderType === 'delivery' ? 'delivery' : 'collection';
        subtitleEl.textContent = `Order #${data.shortId} · ${typeLabel}`;
    }

    const reorderEl = document.getElementById('tracker-reorder');
    if (reorderEl && data.reorderId) {
        reorderEl.href = '/?reorder=' + encodeURIComponent(data.reorderId);
    }
}

function startOrderTracker(token) {
    document.body.innerHTML = `
        <div id="tracker-wrap">
            <div class="tracker-card">
                <div style="font-size:3rem;margin-bottom:12px">👑</div>
                <h1>Order Confirmed!</h1>
                <p class="tracker-subtitle" id="tracker-subtitle">Loading your order…</p>
                <div class="tracker-steps" id="tracker-steps"></div>
                <div class="tracker-message" id="tracker-message">Checking your order status…</div>
                <div class="tracker-actions">
                    <a id="tracker-reorder" class="tracker-btn-secondary" href="/">Reorder</a>
                    <a class="tracker-btn-primary" href="/">Back to Menu</a>
                </div>
                <div class="tracker-error" id="tracker-error"></div>
                <p style="color:#555;font-size:0.7rem;margin-top:20px">order.charlieswingz.com · Fit for Royalty 👑</p>
            </div>
        </div>
    `;

    let consecutiveFailures = 0;
    const TERMINAL = new Set(['delivered', 'collected']);

    function poll() {
        fetch('/api/orders/track/' + encodeURIComponent(token))
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(data => {
                consecutiveFailures = 0;
                const errEl = document.getElementById('tracker-error');
                if (errEl) errEl.textContent = '';
                updateTrackerUI(data);
                if (TERMINAL.has(data.status)) clearInterval(intervalId);
            })
            .catch(status => {
                consecutiveFailures++;
                if (status === 404) {
                    clearInterval(intervalId);
                    const errEl = document.getElementById('tracker-error');
                    if (errEl) errEl.textContent = 'Order not found — please contact us if you placed an order.';
                    return;
                }
                if (consecutiveFailures >= 5) {
                    clearInterval(intervalId);
                    const errEl = document.getElementById('tracker-error');
                    if (errEl) errEl.textContent = "Having trouble connecting — we'll send you an update via your chosen contact method.";
                }
            });
    }

    poll(); // immediate first poll
    const intervalId = setInterval(poll, 10000);
}
```

- [ ] **Step 3: Update the handleCheckoutReturn IIFE**

Find the block inside `handleCheckoutReturn`:
```javascript
if (params.get('order_success') === '1') {
    // Clear cart
    ...
    // Show success screen
    document.body.innerHTML = `...`;
```

Change it so the tracker runs when a track token is present, with the static screen as fallback:

```javascript
if (params.get('order_success') === '1') {
    // Clear cart
    cart.length = 0;
    appliedDiscountCode = null;
    appliedDiscountPercent = 0;
    updateCartUI();

    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar) sidebar.classList.remove('open');

    window.history.replaceState({}, '', '/');

    const trackToken = params.get('track');
    if (trackToken && /^[0-9a-f]{12}$/.test(trackToken)) {
        startOrderTracker(trackToken);
        return;
    }

    // Fallback: static success screen (no track token)
    document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d0d0d;padding:20px">
            ...existing static HTML...
        </div>
    `;

    // Load contact info
    fetch('/api/contact').then(r => r.json()).then(c => {
        ...existing contact info code...
    }).catch(() => {});
}
```

Keep the existing static HTML block and contact info fetch exactly as-is. Just add the `trackToken` check and early return before them. Also move `window.history.replaceState` to before the branch (so both paths clean the URL).

- [ ] **Step 4: Manual test the full flow**

```bash
cd "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app"
node server.js &
sleep 2

# Verify the tracker page renders
node -e "
const db = require('./db');
db.insertOrder({
  id: 'test-tracker-ui-001',
  paymentIntentId: 'pi_ui_test',
  customerName: 'Charlie Wings',
  customerEmail: 'charlie@test.com',
  customerPhone: '07700000000',
  orderType: 'delivery',
  contactPref: 'sms',
  itemsJson: '[{\"id\":\"w6\",\"name\":\"6 Wings\",\"quantity\":1}]',
  totalPence: 850,
  status: 'preparing',
  paymentStatus: 'paid',
  paymentMethod: 'stripe',
  source: 'web',
  customerId: null,
  trackToken: 'ff00aa112233',
});
console.log('inserted');
"

echo "Open: http://localhost:3000/?order_success=1&track=ff00aa112233"
echo "Verify: tracker renders with 'Preparing' step active, 'On the Way' and 'Delivered' empty"
echo "Verify: 'Reorder' button href = /?reorder=test-tracker-ui-001"

kill %1
```

Open the URL manually and confirm the tracker renders correctly.

- [ ] **Step 5: Test status update polling**

```bash
node server.js &
sleep 2

# Update order status and verify poll catches it
curl -s -X POST http://localhost:3000/api/orders/track/ff00aa112233
# (this is a GET-only endpoint; updating status requires admin auth — just verify the GET returns current status)
curl -s http://localhost:3000/api/orders/track/ff00aa112233 | python3 -m json.tool

kill %1
```

Expected: JSON with `"status": "preparing"`.

- [ ] **Step 6: Commit**

```bash
cd "/Users/mdacosta/Desktop/Charlies Wingz Entire Website/app"
git add public/index.html
git commit -m "feat: add live order tracker UI with 10s polling"
```
