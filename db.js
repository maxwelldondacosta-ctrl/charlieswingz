// SQLite database — secure, persistent, proper database
// Drop-in replacement for JSON file db.js — same exports, same API

const Database = require('better-sqlite3');
const path = require('path');

// Store database OUTSIDE public_html for security
const DB_PATH = path.join('/home/charlies', 'charlies_wingz.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read/write performance
db.pragma('journal_mode = WAL');

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        payment_intent_id TEXT,
        customer_name TEXT,
        customer_email TEXT,
        customer_phone TEXT,
        order_type TEXT,
        contact_pref TEXT DEFAULT 'sms',
        items_json TEXT,
        total_pence INTEGER,
        address TEXT,
        city TEXT,
        postcode TEXT,
        lat TEXT,
        lng TEXT,
        delivery_notes TEXT,
        order_notes TEXT,
        driver_token TEXT,
        status TEXT DEFAULT 'received',
        created_at TEXT,
        updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS optins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT,
        phone TEXT,
        source TEXT DEFAULT 'checkout',
        created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS catering (
        id TEXT PRIMARY KEY,
        name TEXT,
        phone TEXT,
        email TEXT,
        event_date TEXT,
        guests TEXT,
        details TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT,
        updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS discounts (
        code TEXT PRIMARY KEY,
        email TEXT,
        type TEXT DEFAULT 'percent',
        percent INTEGER DEFAULT 0,
        amount_pence INTEGER DEFAULT 0,
        fixed_amount INTEGER DEFAULT 0,
        source TEXT DEFAULT 'signup',
        description TEXT,
        milestone INTEGER,
        customer_name TEXT,
        used INTEGER DEFAULT 0,
        created_at TEXT,
        used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS game_players (
        email TEXT PRIMARY KEY,
        name TEXT,
        password_hash TEXT,
        total_score INTEGER DEFAULT 0,
        high_score INTEGER DEFAULT 0,
        wing_count INTEGER DEFAULT 0,
        crowns INTEGER DEFAULT 0,
        coins INTEGER DEFAULT 0,
        deliveries INTEGER DEFAULT 0,
        plays INTEGER DEFAULT 0,
        milestone_tier INTEGER DEFAULT 0,
        unlocked_codes TEXT DEFAULT '{}',
        redeemed_codes TEXT DEFAULT '[]',
        profile TEXT DEFAULT '{}',
        loyalty_stamps INTEGER DEFAULT 0,
        loyalty_total_orders INTEGER DEFAULT 0,
        loyalty_claimed TEXT DEFAULT '[]',
        loyalty_rewards TEXT DEFAULT '[]',
        coins_migrated INTEGER DEFAULT 0,
        created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS lottery (
        id INTEGER PRIMARY KEY,
        count INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_driver_token ON orders(driver_token);
    CREATE INDEX IF NOT EXISTS idx_discounts_email ON discounts(email);
    CREATE INDEX IF NOT EXISTS idx_optins_email ON optins(email);

    CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        phone TEXT,
        email TEXT,
        name TEXT,
        postcode TEXT,
        notes TEXT,
        source TEXT DEFAULT 'web',
        has_account INTEGER DEFAULT 0,
        password_hash TEXT,
        loyalty_stamps INTEGER DEFAULT 0,
        loyalty_total_orders INTEGER DEFAULT 0,
        loyalty_claimed TEXT DEFAULT '[]',
        loyalty_rewards TEXT DEFAULT '[]',
        last_order_id TEXT,
        last_order_at TEXT,
        created_at TEXT,
        updated_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

    CREATE TABLE IF NOT EXISTS stamp_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT NOT NULL,
        delta INTEGER NOT NULL,
        reason TEXT,
        admin_user TEXT,
        created_at TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_stamp_log_customer ON stamp_log(customer_id);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        device_label TEXT,
        admin_user TEXT,
        created_at TEXT,
        last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_push_admin ON push_subscriptions(admin_user);

    CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        admin_user TEXT,
        device_label TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at TEXT,
        expires_at TEXT,
        last_seen_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT,
        attempted_user TEXT,
        success INTEGER NOT NULL,
        failure_reason TEXT,
        user_agent TEXT,
        created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);

    CREATE TABLE IF NOT EXISTS admin_credentials (
        id TEXT PRIMARY KEY,                -- credential ID (base64url, from authenticator)
        admin_user TEXT NOT NULL,           -- which admin this credential belongs to
        public_key BLOB NOT NULL,           -- COSE-encoded public key
        counter INTEGER NOT NULL DEFAULT 0, -- replay-attack counter
        transports TEXT,                    -- JSON array: ["internal","hybrid",...]
        device_label TEXT,                  -- "Max iPhone", "Kitchen Tablet", etc.
        device_type TEXT,                   -- 'singleDevice' | 'multiDevice' (passkey synced via iCloud?)
        backed_up INTEGER DEFAULT 0,        -- 1 if synced to iCloud / Google
        last_used_at TEXT,
        created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_admin_credentials_user ON admin_credentials(admin_user);
`);

// Migrate existing databases — add columns if they don't exist
const migrations = [
    ['game_players', 'coins', 'INTEGER DEFAULT 0'],
    ['game_players', 'deliveries', 'INTEGER DEFAULT 0'],
    ['game_players', 'plays', 'INTEGER DEFAULT 0'],
    ['game_players', 'milestone_tier', 'INTEGER DEFAULT 0'],
    ['game_players', 'redeemed_codes', "TEXT DEFAULT '[]'"],
    ['game_players', 'profile', "TEXT DEFAULT '{}'"],
    ['game_players', 'coins_migrated', 'INTEGER DEFAULT 0'],
    ['discounts', 'fixed_amount', 'INTEGER DEFAULT 0'],
    ['discounts', 'customer_name', 'TEXT'],
    // Manual order support
    ['orders', 'payment_status', "TEXT DEFAULT 'paid'"],   // 'paid' | 'pending' | 'refunded'
    ['orders', 'payment_method', "TEXT DEFAULT 'stripe'"], // 'stripe' | 'cash' | 'bank_transfer' | 'manual'
    ['orders', 'source', "TEXT DEFAULT 'web'"],            // 'web' | 'whatsapp' | 'walkin' | 'phone'
    ['orders', 'customer_id', 'TEXT'],                      // FK to customers.id, nullable
];
for (const [table, col, type] of migrations) {
    try {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run();
    } catch(e) {
        // Column already exists — ignore
    }
}

// Ensure lottery row exists
const lotteryRow = db.prepare('SELECT count FROM lottery WHERE id = 1').get();
if (!lotteryRow) db.prepare('INSERT INTO lottery (id, count) VALUES (1, 0)').run();

// Backfill any legacy discount rows that have NULL description.
// Rebuilds a sensible label from the percent/fixed_amount fields.
try {
    const legacyRows = db.prepare("SELECT code, percent, amount_pence, fixed_amount FROM discounts WHERE description IS NULL OR description = ''").all();
    for (const r of legacyRows) {
        let desc = 'Discount';
        if (r.percent && r.percent > 0) desc = `${r.percent}% off`;
        else if (r.fixed_amount && r.fixed_amount > 0) desc = `£${(r.fixed_amount/100).toFixed(2)} off`;
        else if (r.amount_pence && r.amount_pence > 0) desc = `£${(r.amount_pence/100).toFixed(2)} off`;
        db.prepare('UPDATE discounts SET description = ? WHERE code = ?').run(desc, r.code);
    }
    if (legacyRows.length > 0) {
        console.log(`[DB] Backfilled description for ${legacyRows.length} legacy discount(s)`);
    }
} catch (e) {
    console.error('[DB] Discount description backfill error:', e.message);
}

// ── One-time migration: copy game_players into customers table ──────────────
// Runs every startup but is idempotent — only inserts customers that don't exist
// keyed by lowercased email.
try {
    const players = db.prepare('SELECT * FROM game_players').all();
    const insertMigrated = db.prepare(`
        INSERT OR IGNORE INTO customers (
            id, phone, email, name, postcode, notes, source, has_account, password_hash,
            loyalty_stamps, loyalty_total_orders, loyalty_claimed, loyalty_rewards,
            last_order_id, last_order_at, created_at, updated_at
        ) VALUES (?, NULL, ?, ?, NULL, NULL, 'web', 1, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `);
    for (const p of players) {
        if (!p.email) continue;
        const id = 'C' + Math.random().toString(36).substring(2, 10).toUpperCase();
        const now = new Date().toISOString();
        insertMigrated.run(
            id,
            p.email.toLowerCase(),
            p.name || null,
            p.password_hash || null,
            p.loyalty_stamps || 0,
            p.loyalty_total_orders || 0,
            p.loyalty_claimed || '[]',
            p.loyalty_rewards || '[]',
            p.created_at || now,
            now
        );
    }
} catch(e) {
    console.error('[DB] Customer migration error:', e.message);
}

// ── Prepared statements ─────────────────────────────────────────────────────

const stmts = {
    insertOrder: db.prepare(`INSERT INTO orders (id, payment_intent_id, customer_name, customer_email, customer_phone, order_type, contact_pref, items_json, total_pence, address, city, postcode, lat, lng, delivery_notes, order_notes, driver_token, status, payment_status, payment_method, source, customer_id, created_at, updated_at) VALUES (@id, @payment_intent_id, @customer_name, @customer_email, @customer_phone, @order_type, @contact_pref, @items_json, @total_pence, @address, @city, @postcode, @lat, @lng, @delivery_notes, @order_notes, NULL, @status, @payment_status, @payment_method, @source, @customer_id, @created_at, @updated_at)`),
    updateOrderStatus: db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?'),
    updateOrderPaymentStatus: db.prepare('UPDATE orders SET payment_status = ?, payment_method = ?, updated_at = ? WHERE id = ?'),
    setDriverToken: db.prepare('UPDATE orders SET driver_token = ? WHERE id = ?'),
    getOrderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
    getOrderByDriverToken: db.prepare('SELECT * FROM orders WHERE driver_token = ?'),
    getAllOrders: db.prepare('SELECT * FROM orders ORDER BY created_at DESC'),

    insertOptin: db.prepare('INSERT INTO optins (name, email, phone, source, created_at) VALUES (?, ?, ?, ?, ?)'),
    getAllOptins: db.prepare('SELECT * FROM optins ORDER BY id DESC'),
    deleteOptinByEmail: db.prepare('DELETE FROM optins WHERE email = ?'),
    deleteOptinByPhone: db.prepare('DELETE FROM optins WHERE phone = ?'),

    insertCatering: db.prepare('INSERT INTO catering (id, name, phone, email, event_date, guests, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    getAllCatering: db.prepare('SELECT * FROM catering ORDER BY created_at DESC'),
    updateCateringStatus: db.prepare('UPDATE catering SET status = ?, updated_at = ? WHERE id = ?'),
    deleteCatering: db.prepare('DELETE FROM catering WHERE id = ?'),
    getCateringById: db.prepare('SELECT * FROM catering WHERE id = ?'),

    insertDiscount: db.prepare('INSERT INTO discounts (code, email, type, percent, amount_pence, fixed_amount, source, description, milestone, customer_name, used, created_at) VALUES (@code, @email, @type, @percent, @amount_pence, @fixed_amount, @source, @description, @milestone, @customer_name, 0, @created_at)'),
    getDiscountByCode: db.prepare('SELECT * FROM discounts WHERE code = ?'),
    getDiscountByEmailAndSource: db.prepare('SELECT * FROM discounts WHERE email = ? AND source = ?'),
    markDiscountUsed: db.prepare('UPDATE discounts SET used = 1, used_at = ? WHERE code = ?'),
    getAllDiscounts: db.prepare('SELECT * FROM discounts ORDER BY created_at DESC'),
    getDiscountsByEmail: db.prepare('SELECT * FROM discounts WHERE email = ?'),

    getGamePlayer: db.prepare('SELECT * FROM game_players WHERE email = ?'),
    insertGamePlayer: db.prepare('INSERT INTO game_players (email, name, password_hash, total_score, high_score, wing_count, crowns, coins, deliveries, plays, milestone_tier, unlocked_codes, redeemed_codes, profile, loyalty_stamps, loyalty_total_orders, loyalty_claimed, loyalty_rewards, coins_migrated, created_at) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, \'{}\', \'[]\', \'{}\', 0, 0, \'[]\', \'[]\', 0, ?)'),
    updateGameProgress: db.prepare('UPDATE game_players SET total_score = ?, high_score = ?, wing_count = ?, crowns = ? WHERE email = ?'),
    updateGameCodes: db.prepare('UPDATE game_players SET unlocked_codes = ? WHERE email = ?'),
    updateLoyalty: db.prepare('UPDATE game_players SET loyalty_stamps = ?, loyalty_total_orders = ?, loyalty_claimed = ?, loyalty_rewards = ? WHERE email = ?'),
    updateGameFull: db.prepare('UPDATE game_players SET name = ?, total_score = ?, high_score = ?, wing_count = ?, crowns = ?, coins = ?, deliveries = ?, plays = ?, milestone_tier = ?, unlocked_codes = ?, redeemed_codes = ?, profile = ?, coins_migrated = ? WHERE email = ?'),
    getAllGamePlayers: db.prepare('SELECT * FROM game_players ORDER BY created_at DESC'),

    getLotteryCount: db.prepare('SELECT count FROM lottery WHERE id = 1'),
    incrementLottery: db.prepare('UPDATE lottery SET count = count + 1 WHERE id = 1'),

    // ── Customers ────────────────────────────────────────────────────────────
    getCustomerById: db.prepare('SELECT * FROM customers WHERE id = ?'),
    getCustomerByPhone: db.prepare('SELECT * FROM customers WHERE phone = ?'),
    getCustomerByEmail: db.prepare('SELECT * FROM customers WHERE email = ?'),
    insertCustomer: db.prepare(`INSERT INTO customers
        (id, phone, email, name, postcode, notes, source, has_account, password_hash,
         loyalty_stamps, loyalty_total_orders, loyalty_claimed, loyalty_rewards,
         last_order_id, last_order_at, created_at, updated_at)
        VALUES (@id, @phone, @email, @name, @postcode, @notes, @source, @has_account, @password_hash,
         0, 0, '[]', '[]', NULL, NULL, @created_at, @updated_at)`),
    updateCustomerProfile: db.prepare(`UPDATE customers SET
        phone = @phone, email = @email, name = @name, postcode = @postcode,
        notes = @notes, source = @source, has_account = @has_account,
        password_hash = COALESCE(@password_hash, password_hash),
        updated_at = @updated_at WHERE id = @id`),
    updateCustomerStamps: db.prepare(`UPDATE customers SET
        loyalty_stamps = ?, loyalty_total_orders = ?, loyalty_claimed = ?,
        loyalty_rewards = ?, updated_at = ? WHERE id = ?`),
    updateCustomerLastOrder: db.prepare(`UPDATE customers SET
        last_order_id = ?, last_order_at = ?, updated_at = ? WHERE id = ?`),
    deleteCustomer: db.prepare('DELETE FROM customers WHERE id = ?'),
    getAllCustomers: db.prepare('SELECT * FROM customers ORDER BY updated_at DESC'),
    searchCustomers: db.prepare(`SELECT * FROM customers
        WHERE phone LIKE ? OR email LIKE ? OR name LIKE ?
        ORDER BY updated_at DESC LIMIT 50`),
    insertStampLog: db.prepare(`INSERT INTO stamp_log
        (customer_id, delta, reason, admin_user, created_at)
        VALUES (?, ?, ?, ?, ?)`),
    getStampLogForCustomer: db.prepare(`SELECT * FROM stamp_log
        WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50`),

    // ── Push subscriptions ───────────────────────────────────────────────────
    upsertPushSub: db.prepare(`INSERT INTO push_subscriptions
        (endpoint, p256dh, auth, device_label, admin_user, created_at, last_used_at)
        VALUES (@endpoint, @p256dh, @auth, @device_label, @admin_user, @now, @now)
        ON CONFLICT(endpoint) DO UPDATE SET
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            device_label = excluded.device_label,
            admin_user = excluded.admin_user,
            last_used_at = excluded.last_used_at`),
    getAllPushSubs: db.prepare('SELECT * FROM push_subscriptions ORDER BY last_used_at DESC'),
    getPushSubsByAdmin: db.prepare('SELECT * FROM push_subscriptions WHERE admin_user = ? ORDER BY last_used_at DESC'),
    deletePushSubByEndpoint: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?'),
    deletePushSubById: db.prepare('DELETE FROM push_subscriptions WHERE id = ?'),
    touchPushSub: db.prepare('UPDATE push_subscriptions SET last_used_at = ? WHERE endpoint = ?'),

    // ── Admin sessions (30-day persistent tokens) ────────────────────────────
    insertAdminSession: db.prepare(`INSERT INTO admin_sessions
        (token, admin_user, device_label, ip, user_agent, created_at, expires_at, last_seen_at)
        VALUES (@token, @admin_user, @device_label, @ip, @user_agent, @now, @expires_at, @now)`),
    getAdminSession: db.prepare('SELECT * FROM admin_sessions WHERE token = ?'),
    touchAdminSession: db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE token = ?'),
    deleteAdminSession: db.prepare('DELETE FROM admin_sessions WHERE token = ?'),
    deleteAdminSessionsForUser: db.prepare('DELETE FROM admin_sessions WHERE admin_user = ?'),
    getAllAdminSessions: db.prepare('SELECT * FROM admin_sessions ORDER BY last_seen_at DESC'),
    purgeExpiredAdminSessions: db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?'),

    // ── Login attempt log ────────────────────────────────────────────────────
    insertLoginAttempt: db.prepare(`INSERT INTO login_attempts
        (ip, attempted_user, success, failure_reason, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`),
    getRecentLoginAttempts: db.prepare(`SELECT * FROM login_attempts
        ORDER BY created_at DESC LIMIT ?`),
    getRecentFailuresByIp: db.prepare(`SELECT COUNT(*) as count FROM login_attempts
        WHERE ip = ? AND success = 0 AND created_at > ?`),

    // ── Admin credentials (WebAuthn passkeys) ────────────────────────────────
    insertAdminCredential: db.prepare(`INSERT INTO admin_credentials
        (id, admin_user, public_key, counter, transports, device_label, device_type, backed_up, last_used_at, created_at)
        VALUES (@id, @admin_user, @public_key, @counter, @transports, @device_label, @device_type, @backed_up, @now, @now)`),
    getAdminCredentialById: db.prepare('SELECT * FROM admin_credentials WHERE id = ?'),
    getAdminCredentialsByUser: db.prepare('SELECT * FROM admin_credentials WHERE admin_user = ? ORDER BY last_used_at DESC'),
    updateCredentialCounter: db.prepare('UPDATE admin_credentials SET counter = ?, last_used_at = ? WHERE id = ?'),
    updateCredentialLabel: db.prepare('UPDATE admin_credentials SET device_label = ? WHERE id = ?'),
    deleteAdminCredential: db.prepare('DELETE FROM admin_credentials WHERE id = ?'),
    getAllAdminCredentials: db.prepare('SELECT * FROM admin_credentials ORDER BY last_used_at DESC'),
};

// ── Orders ───────────────────────────────────────────────────────────────────

function insertOrder({ id, paymentIntentId, customerName, customerEmail, customerPhone, orderType, contactPref, itemsJson, totalPence, address, city, postcode, lat, lng, deliveryNotes, orderNotes, status, paymentStatus, paymentMethod, source, customerId }) {
    const now = new Date().toISOString();
    stmts.insertOrder.run({
        id,
        payment_intent_id: paymentIntentId || null,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        order_type: orderType,
        contact_pref: contactPref || 'sms',
        items_json: itemsJson,
        total_pence: totalPence,
        address: address || null,
        city: city || null,
        postcode: postcode || null,
        lat: lat || null,
        lng: lng || null,
        delivery_notes: deliveryNotes || null,
        order_notes: orderNotes || null,
        status: status || 'pending_payment',
        payment_status: paymentStatus || 'paid',     // assume paid for legacy callers (web/Stripe orders)
        payment_method: paymentMethod || 'stripe',
        source: source || 'web',
        customer_id: customerId || null,
        created_at: now,
        updated_at: now
    });
}

function updateOrderPaymentStatus(id, paymentStatus, paymentMethod) {
    stmts.updateOrderPaymentStatus.run(paymentStatus, paymentMethod || null, new Date().toISOString(), id);
    return stmts.getOrderById.get(id) || null;
}

function updateOrderStatus(id, status) {
    stmts.updateOrderStatus.run(status, new Date().toISOString(), id);
    return stmts.getOrderById.get(id) || null;
}

function updateOrderPayment(id, paymentIntentId) {
    db.prepare('UPDATE orders SET payment_intent_id = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(paymentIntentId, 'received', new Date().toISOString(), id);
    return stmts.getOrderById.get(id) || null;
}

function setDriverToken(id, token) {
    stmts.setDriverToken.run(token, id);
    return stmts.getOrderById.get(id) || null;
}

function getOrderByDriverToken(token) {
    if (!token) return null;
    return stmts.getOrderByDriverToken.get(token) || null;
}

function getOrderById(id) {
    return stmts.getOrderById.get(id) || null;
}

function getTodaysOrders() {
    const londonToday = new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
    const [d, m, y] = londonToday.split('/');
    const today = `${y}-${m}-${d}`;
    return db.prepare("SELECT * FROM orders WHERE substr(created_at, 1, 10) = ? AND status != 'pending_payment' ORDER BY created_at DESC").all(today);
}

function getAllOrders() {
    return stmts.getAllOrders.all();
}

function deleteOrder(id) {
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}

// ── Marketing opt-ins ────────────────────────────────────────────────────────

function insertOptin({ name, email, phone, source }) {
    stmts.insertOptin.run(name, email || null, phone || null, source || 'checkout', new Date().toISOString());
}

function getAllOptins() {
    return stmts.getAllOptins.all();
}

function deleteOptin(identifier) {
    // Try email first, then phone
    let result = stmts.deleteOptinByEmail.run(identifier);
    if (result.changes === 0) {
        result = stmts.deleteOptinByPhone.run(identifier);
    }
    return result.changes > 0 ? { identifier } : null;
}

// ── Catering requests ───────────────────────────────────────────────────────

function insertCateringRequest({ id, name, phone, email, date, guests, details }) {
    stmts.insertCatering.run(id, name, phone, email || null, date, guests || null, details, 'pending', new Date().toISOString());
}

function getAllCateringRequests() {
    return stmts.getAllCatering.all();
}

function updateCateringStatus(id, status) {
    stmts.updateCateringStatus.run(status, new Date().toISOString(), id);
    return stmts.getCateringById.get(id) || null;
}

function deleteCateringRequest(id) {
    const req = stmts.getCateringById.get(id);
    if (req) stmts.deleteCatering.run(id);
    return req || null;
}

// ── Discount codes ──────────────────────────────────────────────────────────

function createDiscountCode(email) {
    const e = email.toLowerCase();
    const existing = stmts.getDiscountByEmailAndSource.get(e, 'signup');
    if (existing) return { ...existing, alreadyExists: true };

    const code = 'CW' + Math.random().toString(36).substring(2, 8).toUpperCase();
    stmts.insertDiscount.run({
        code,
        email: e,
        type: 'percent',
        percent: 10,
        amount_pence: 0,
        fixed_amount: 0,
        source: 'signup',
        description: '10% off',
        milestone: null,
        customer_name: null,
        created_at: new Date().toISOString()
    });
    return stmts.getDiscountByCode.get(code);
}

function validateDiscountCode(code) {
    const discount = stmts.getDiscountByCode.get(code.toUpperCase());
    if (!discount) return { valid: false, error: 'Invalid code' };
    if (discount.used) return { valid: false, error: 'This code has already been used' };
    const isFixed = (discount.fixed_amount > 0 || discount.amount_pence > 0);
    return {
        valid: true,
        code: discount.code,
        type: isFixed ? 'fixed' : (discount.type || 'percent'),
        percent: discount.percent || 0,
        amountPence: discount.fixed_amount || discount.amount_pence || 0
    };
}

function markDiscountUsed(code) {
    stmts.markDiscountUsed.run(new Date().toISOString(), code.toUpperCase());
}

function updateDiscountToFixed(code, amountPence, description) {
    db.prepare('UPDATE discounts SET type = ?, percent = 0, amount_pence = ?, fixed_amount = ?, description = ?, source = ? WHERE code = ?')
        .run('fixed', amountPence, amountPence, description || null, 'game', code.toUpperCase());
}

function getAllDiscountCodes() {
    return stmts.getAllDiscounts.all();
}

function getDiscountsByEmail(email) {
    if (!email) return [];
    return stmts.getDiscountsByEmail.all(email.toLowerCase());
}

// ── Game players ────────────────────────────────────────────────────────────

function getGamePlayer(email) {
    const row = stmts.getGamePlayer.get(email.toLowerCase());
    if (!row) return null;
    row.unlockedCodes = JSON.parse(row.unlocked_codes || '{}');
    row.redeemedCodes = JSON.parse(row.redeemed_codes || '[]');
    row.profile = JSON.parse(row.profile || '{}');
    row.loyaltyClaimed = JSON.parse(row.loyalty_claimed || '[]');
    row.loyaltyRewards = JSON.parse(row.loyalty_rewards || '[]');
    // Map snake_case to camelCase for compatibility
    row.totalScore = row.total_score;
    row.highScore = row.high_score;
    row.wingCount = row.wing_count;
    row.password = row.password_hash;
    row.passwordHash = row.password_hash;
    row.loyaltyStamps = row.loyalty_stamps;
    row.loyaltyTotalOrders = row.loyalty_total_orders;
    row.milestoneTier = row.milestone_tier;
    row.coinsMigrated = row.coins_migrated;
    return row;
}

function getAllGamePlayers() {
    return stmts.getAllGamePlayers.all().map(row => {
        row.profile = JSON.parse(row.profile || '{}');
        row.totalScore = row.total_score;
        row.loyaltyStamps = row.loyalty_stamps;
        row.loyaltyTotalOrders = row.loyalty_total_orders;
        return row;
    });
}

function saveGamePlayer(player) {
    const e = player.email.toLowerCase();
    stmts.updateGameFull.run(
        player.name,
        player.totalScore || player.total_score || 0,
        player.highScore || player.high_score || 0,
        player.wingCount || player.wing_count || 0,
        player.crowns || 0,
        player.coins || 0,
        player.deliveries || 0,
        player.plays || 0,
        player.milestoneTier || player.milestone_tier || 0,
        JSON.stringify(player.unlockedCodes || {}),
        JSON.stringify(player.redeemedCodes || []),
        JSON.stringify(player.profile || {}),
        player.coinsMigrated || player.coins_migrated || 0,
        e
    );
    return getGamePlayer(e);
}

function createGamePlayer(name, email, passwordHash) {
    const e = email.toLowerCase();
    const existing = stmts.getGamePlayer.get(e);
    if (existing) return null;
    stmts.insertGamePlayer.run(e, name, passwordHash, new Date().toISOString());
    return getGamePlayer(e);
}

function updateGamePassword(email, passwordHash) {
    db.prepare('UPDATE game_players SET password_hash = ? WHERE email = ?').run(passwordHash, email.toLowerCase());
}

function updateGameProgress(email, score, wings, crowns) {
    const e = email.toLowerCase();
    const p = getGamePlayer(e);
    if (!p) return null;
    const newTotal = (p.totalScore || 0) + score;
    const newHigh = Math.max(p.highScore || 0, score);
    const newWings = (p.wingCount || 0) + wings;
    const newCrowns = (p.crowns || 0) + crowns;
    stmts.updateGameProgress.run(newTotal, newHigh, newWings, newCrowns, e);
    return getGamePlayer(e);
}

function claimGameCode(email, milestone) {
    const e = email.toLowerCase();
    const p = getGamePlayer(e);
    if (!p) return null;
    const codes = p.unlockedCodes || {};
    if (codes[milestone]) return codes[milestone];

    const code = 'CWG' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const milestones = { 10000: 200, 100000: 400 };
    const discountLabels = { 10000: '£2', 100000: '£4' };
    const amountPence = milestones[milestone] || 500;

    codes[milestone] = {
        code,
        discount: discountLabels[milestone] || '£5',
        amountPence,
        claimedAt: new Date().toISOString()
    };

    stmts.updateGameCodes.run(JSON.stringify(codes), e);

    // Also store as discount
    stmts.insertDiscount.run({
        code,
        email: e,
        type: 'fixed',
        percent: 0,
        amount_pence: amountPence,
        fixed_amount: amountPence,
        source: 'game',
        description: null,
        milestone,
        customer_name: null,
        created_at: new Date().toISOString()
    });

    return codes[milestone];
}

// ── Customer Lottery ────────────────────────────────────────────────────────

function getLotteryCount() {
    const row = stmts.getLotteryCount.get();
    return row ? row.count : 0;
}

function incrementLotteryCount() {
    stmts.incrementLottery.run();
    return getLotteryCount();
}

function createLotteryDiscount(email, name) {
    const code = 'CWWIN' + Math.random().toString(36).substring(2, 6).toUpperCase();
    stmts.insertDiscount.run({
        code,
        email: email ? email.toLowerCase() : 'lottery-winner',
        type: 'percent',
        percent: 10,
        amount_pence: 0,
        fixed_amount: 0,
        source: 'lottery',
        description: null,
        milestone: null,
        customer_name: name || null,
        created_at: new Date().toISOString()
    });
    return stmts.getDiscountByCode.get(code);
}

// ── Loyalty Stamps ──────────────────────────────────────────────────────────

const LOYALTY_TIERS = [
    { stamps: 10, name: 'Free 6 Wings', valuePence: 850 },
    { stamps: 20, name: 'Free 10 Wings', valuePence: 1400 }
];
const LOYALTY_MAX_STAMPS = LOYALTY_TIERS[LOYALTY_TIERS.length - 1].stamps;

function addLoyaltyStamp(email) {
    if (!email) return null;
    const e = email.toLowerCase();
    const p = getGamePlayer(e);
    if (!p) return null;

    let stamps = (p.loyaltyStamps || 0) + 1;
    let totalOrders = (p.loyaltyTotalOrders || 0) + 1;
    let claimed = p.loyaltyClaimed || [];
    let rewards = p.loyaltyRewards || [];
    let reward = null;

    for (let i = LOYALTY_TIERS.length - 1; i >= 0; i--) {
        const tier = LOYALTY_TIERS[i];
        if (stamps >= tier.stamps && !claimed.includes(tier.stamps)) {
            const code = 'CWLOYAL' + Math.random().toString(36).substring(2, 6).toUpperCase();
            reward = {
                code,
                type: 'fixed',
                amountPence: tier.valuePence,
                description: tier.name,
                tier: tier.stamps,
                earnedAt: new Date().toISOString()
            };
            rewards.push(reward);
            claimed.push(tier.stamps);

            stmts.insertDiscount.run({
                code,
                email: e,
                type: 'fixed',
                percent: 0,
                amount_pence: tier.valuePence,
                fixed_amount: tier.valuePence,
                source: 'loyalty',
                description: tier.name,
                milestone: null,
                customer_name: null,
                created_at: new Date().toISOString()
            });

            if (tier.stamps >= LOYALTY_MAX_STAMPS) {
                stamps = 0;
                claimed = [];
            }
            break;
        }
    }

    stmts.updateLoyalty.run(stamps, totalOrders, JSON.stringify(claimed), JSON.stringify(rewards), e);

    // Sync to customers table — admin Customers tab reads from there.
    // Without this, the admin sees stale stamp counts after a web order
    // awards a stamp.
    try {
        const cust = stmts.getCustomerByEmail.get(e);
        if (cust) {
            stmts.updateCustomerStamps.run(
                stamps,
                totalOrders,
                JSON.stringify(claimed),
                JSON.stringify(rewards),
                new Date().toISOString(),
                cust.id
            );
        }
    } catch (err) {
        console.error('[addLoyaltyStamp] customers sync error:', err.message);
    }

    const nextTier = LOYALTY_TIERS.find(t => stamps < t.stamps && !claimed.includes(t.stamps)) || LOYALTY_TIERS[0];

    return {
        stamps,
        maxStamps: LOYALTY_MAX_STAMPS,
        tiers: LOYALTY_TIERS,
        nextTier,
        totalOrders,
        reward
    };
}

// Bypass loyalty award flow — directly set loyalty fields on a game_player.
// Used when a new account signs up and we want to copy stamps over from
// their existing customer record (so WhatsApp customers don't lose their
// progress when they create a web account).
function setLoyaltyStampsForPlayer(email, { stamps, totalOrders, claimed, rewards }) {
    if (!email) return null;
    const e = email.toLowerCase();
    stmts.updateLoyalty.run(
        stamps || 0,
        totalOrders || 0,
        typeof claimed === 'string' ? claimed : JSON.stringify(claimed || []),
        typeof rewards === 'string' ? rewards : JSON.stringify(rewards || []),
        e
    );
    // Sync to customers table too
    try {
        const cust = stmts.getCustomerByEmail.get(e);
        if (cust) {
            stmts.updateCustomerStamps.run(
                stamps || 0,
                totalOrders || 0,
                typeof claimed === 'string' ? claimed : JSON.stringify(claimed || []),
                typeof rewards === 'string' ? rewards : JSON.stringify(rewards || []),
                new Date().toISOString(),
                cust.id
            );
        }
    } catch (err) {
        console.error('[setLoyaltyStampsForPlayer] customers sync error:', err.message);
    }
    return getGamePlayer(e);
}

function getLoyaltyProgress(email) {
    if (!email) return null;
    const p = getGamePlayer(email);
    if (!p) return null;

    const stamps = p.loyaltyStamps || 0;
    const claimed = p.loyaltyClaimed || [];
    const nextTier = LOYALTY_TIERS.find(t => stamps < t.stamps && !claimed.includes(t.stamps)) || LOYALTY_TIERS[0];

    const allDiscounts = stmts.getDiscountsByEmail.all(email.toLowerCase());
    const rewards = (p.loyaltyRewards || []).filter(r => {
        const disc = allDiscounts.find(d => d.code === r.code);
        return disc && !disc.used;
    });

    return {
        stamps,
        maxStamps: LOYALTY_MAX_STAMPS,
        tiers: LOYALTY_TIERS,
        nextTier,
        totalOrders: p.loyaltyTotalOrders || 0,
        claimed,
        rewards
    };
}

// ── Customers (unified phone/email keyed) ───────────────────────────────────

const { parsePhoneNumberWithError, isValidPhoneNumber } = (() => {
    try {
        return require('libphonenumber-js');
    } catch(e) {
        // Fallback if package not installed yet — use a permissive normaliser
        return {
            parsePhoneNumberWithError: null,
            isValidPhoneNumber: null
        };
    }
})();

// Normalise any phone number to E.164 format. Returns null if input invalid.
// Defaults to UK ('GB') if no country code present.
function normalisePhone(input, defaultCountry = 'GB') {
    if (!input) return null;
    const trimmed = String(input).trim();
    if (!trimmed) return null;
    if (parsePhoneNumberWithError) {
        try {
            const parsed = parsePhoneNumberWithError(trimmed, defaultCountry);
            if (parsed && parsed.isValid()) return parsed.number;
        } catch(e) {
            return null;
        }
        return null;
    }
    // Permissive fallback — strip non-digits, prefix with + if it had one
    const digits = trimmed.replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) return digits;
    if (digits.startsWith('0')) return '+44' + digits.substring(1);
    if (digits.startsWith('44')) return '+' + digits;
    return '+' + digits;
}

function genCustomerId() {
    return 'C' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function getCustomerById(id) {
    if (!id) return null;
    return stmts.getCustomerById.get(id) || null;
}

function getCustomerByPhone(phone) {
    const norm = normalisePhone(phone);
    if (!norm) return null;
    return stmts.getCustomerByPhone.get(norm) || null;
}

function getCustomerByEmail(email) {
    if (!email) return null;
    return stmts.getCustomerByEmail.get(email.toLowerCase()) || null;
}

// Lookup helper that prefers phone, falls back to email.
function findCustomer({ phone, email }) {
    if (phone) {
        const c = getCustomerByPhone(phone);
        if (c) return c;
    }
    if (email) {
        const c = getCustomerByEmail(email);
        if (c) return c;
    }
    return null;
}

// Create a new customer. Phone and/or email required. Throws on duplicate.
function createCustomer({ phone, email, name, postcode, notes, source, hasAccount, passwordHash }) {
    // Best-effort phone normalisation. If the user typed something that
    // libphonenumber-js can't parse (foreign formats, vanity numbers,
    // edge cases), we still store the raw input — better to record imperfect
    // data than reject the customer entirely. For admin-entered records this
    // is essential.
    let normPhone = null;
    if (phone) {
        normPhone = normalisePhone(phone);
        if (!normPhone) {
            normPhone = String(phone).trim() || null;
        }
    }
    const normEmail = email ? email.toLowerCase().trim() : null;
    if (!normPhone && !normEmail) {
        throw new Error('Customer must have at least a phone or email');
    }
    // Duplicate checks
    if (normPhone && stmts.getCustomerByPhone.get(normPhone)) {
        const err = new Error('A customer with this phone already exists');
        err.code = 'DUPLICATE_PHONE';
        throw err;
    }
    if (normEmail && stmts.getCustomerByEmail.get(normEmail)) {
        const err = new Error('A customer with this email already exists');
        err.code = 'DUPLICATE_EMAIL';
        throw err;
    }
    const id = genCustomerId();
    const now = new Date().toISOString();
    stmts.insertCustomer.run({
        id,
        phone: normPhone,
        email: normEmail,
        name: name || null,
        postcode: postcode ? String(postcode).toUpperCase().replace(/\s+/g, ' ').trim() : null,
        notes: notes || null,
        source: source || 'web',
        has_account: hasAccount ? 1 : 0,
        password_hash: passwordHash || null,
        created_at: now,
        updated_at: now
    });
    return getCustomerById(id);
}

// Update an existing customer. Pass any subset of fields. Re-validates uniqueness.
function updateCustomer(id, updates = {}) {
    const existing = getCustomerById(id);
    if (!existing) throw new Error('Customer not found');

    // Best-effort phone normalisation (same lenient policy as createCustomer)
    let normPhone;
    if (updates.phone !== undefined) {
        if (updates.phone) {
            normPhone = normalisePhone(updates.phone) || String(updates.phone).trim() || null;
        } else {
            normPhone = null;
        }
    } else {
        normPhone = existing.phone;
    }
    const normEmail = updates.email !== undefined
        ? (updates.email ? updates.email.toLowerCase().trim() : null)
        : existing.email;

    if (!normPhone && !normEmail) {
        throw new Error('Customer must have at least a phone or email');
    }
    // Uniqueness check (allow same record)
    if (normPhone) {
        const dup = stmts.getCustomerByPhone.get(normPhone);
        if (dup && dup.id !== id) {
            const err = new Error('Another customer with this phone already exists');
            err.code = 'DUPLICATE_PHONE';
            throw err;
        }
    }
    if (normEmail) {
        const dup = stmts.getCustomerByEmail.get(normEmail);
        if (dup && dup.id !== id) {
            const err = new Error('Another customer with this email already exists');
            err.code = 'DUPLICATE_EMAIL';
            throw err;
        }
    }

    stmts.updateCustomerProfile.run({
        id,
        phone: normPhone,
        email: normEmail,
        name: updates.name !== undefined ? updates.name : existing.name,
        postcode: updates.postcode !== undefined
            ? (updates.postcode ? String(updates.postcode).toUpperCase().replace(/\s+/g, ' ').trim() : null)
            : existing.postcode,
        notes: updates.notes !== undefined ? updates.notes : existing.notes,
        source: updates.source !== undefined ? updates.source : existing.source,
        has_account: updates.hasAccount !== undefined ? (updates.hasAccount ? 1 : 0) : existing.has_account,
        password_hash: updates.passwordHash !== undefined ? updates.passwordHash : null,
        updated_at: new Date().toISOString()
    });
    return getCustomerById(id);
}

function deleteCustomer(id) {
    stmts.deleteCustomer.run(id);
}

function getAllCustomers() {
    return stmts.getAllCustomers.all();
}

function searchCustomers(query) {
    if (!query) return getAllCustomers();
    const wild = '%' + String(query).toLowerCase().replace(/\s+/g, '%') + '%';
    return stmts.searchCustomers.all(wild, wild, wild);
}

// Award/deduct stamps manually with reason for audit trail.
// Returns { customer, reward } — reward populated if a tier was hit (positive delta only).
function adjustStamps(customerId, delta, reason, adminUser) {
    const c = getCustomerById(customerId);
    if (!c) throw new Error('Customer not found');

    const claimed = JSON.parse(c.loyalty_claimed || '[]');
    const rewards = JSON.parse(c.loyalty_rewards || '[]');
    let stamps = (c.loyalty_stamps || 0) + delta;
    if (stamps < 0) stamps = 0;
    const totalOrders = (c.loyalty_total_orders || 0) + (delta > 0 ? delta : 0);

    let reward = null;
    if (delta > 0) {
        for (let i = LOYALTY_TIERS.length - 1; i >= 0; i--) {
            const tier = LOYALTY_TIERS[i];
            if (stamps >= tier.stamps && !claimed.includes(tier.stamps)) {
                const code = 'CWLOYAL' + Math.random().toString(36).substring(2, 6).toUpperCase();
                reward = {
                    code,
                    type: 'fixed',
                    amountPence: tier.valuePence,
                    description: tier.name,
                    tier: tier.stamps,
                    earnedAt: new Date().toISOString()
                };
                rewards.push(reward);
                claimed.push(tier.stamps);
                stmts.insertDiscount.run({
                    code,
                    email: c.email || null,
                    type: 'fixed',
                    percent: 0,
                    amount_pence: tier.valuePence,
                    fixed_amount: tier.valuePence,
                    source: 'loyalty',
                    description: tier.name,
                    milestone: null,
                    customer_name: c.name || null,
                    created_at: new Date().toISOString()
                });
                if (tier.stamps >= LOYALTY_MAX_STAMPS) {
                    stamps = 0;
                    claimed.length = 0;
                }
                break;
            }
        }
    }

    const now = new Date().toISOString();
    stmts.updateCustomerStamps.run(
        stamps,
        totalOrders,
        JSON.stringify(claimed),
        JSON.stringify(rewards),
        now,
        customerId
    );
    stmts.insertStampLog.run(customerId, delta, reason || null, adminUser || null, now);

    // Sync to game_players if this customer has a linked web account.
    // Without this, the user sees their old stamp count when they log in
    // because the public site reads from game_players, not customers.
    if (c.email) {
        try {
            const player = stmts.getGamePlayer.get(c.email);
            if (player) {
                stmts.updateLoyalty.run(
                    stamps,
                    totalOrders,
                    JSON.stringify(claimed),
                    JSON.stringify(rewards),
                    c.email
                );
            }
        } catch (e) {
            console.error('[adjustStamps] game_player sync error:', e.message);
        }
    }

    return { customer: getCustomerById(customerId), reward };
}

function getStampLog(customerId) {
    return stmts.getStampLogForCustomer.all(customerId);
}

function setLastOrder(customerId, orderId) {
    if (!customerId) return;
    const now = new Date().toISOString();
    stmts.updateCustomerLastOrder.run(orderId, now, now, customerId);
}

// Merge secondary customer into primary. Stamps add together. Last order = most recent.
// Both records' rewards/claimed merge. Secondary record is deleted afterwards.
function mergeCustomers(primaryId, secondaryId) {
    if (primaryId === secondaryId) throw new Error('Cannot merge a customer with itself');
    const primary = getCustomerById(primaryId);
    const secondary = getCustomerById(secondaryId);
    if (!primary || !secondary) throw new Error('Customer not found');

    // Merge fields — primary wins on conflict, but secondary fills gaps
    const updates = {
        phone: primary.phone || secondary.phone,
        email: primary.email || secondary.email,
        name: primary.name || secondary.name,
        postcode: primary.postcode || secondary.postcode,
        notes: [primary.notes, secondary.notes].filter(Boolean).join(' | ') || null,
        source: primary.source || secondary.source,
        hasAccount: primary.has_account || secondary.has_account,
        passwordHash: primary.password_hash || secondary.password_hash
    };
    // Save merged stamps before profile update (uniqueness check happens on update)
    const mergedStamps = (primary.loyalty_stamps || 0) + (secondary.loyalty_stamps || 0);
    const mergedTotal = (primary.loyalty_total_orders || 0) + (secondary.loyalty_total_orders || 0);
    const mergedClaimed = Array.from(new Set([
        ...JSON.parse(primary.loyalty_claimed || '[]'),
        ...JSON.parse(secondary.loyalty_claimed || '[]')
    ])).sort((a,b)=>a-b);
    const mergedRewards = [
        ...JSON.parse(primary.loyalty_rewards || '[]'),
        ...JSON.parse(secondary.loyalty_rewards || '[]')
    ];

    // Pick most recent last_order
    let lastOrderId = primary.last_order_id, lastOrderAt = primary.last_order_at;
    if (secondary.last_order_at && (!lastOrderAt || secondary.last_order_at > lastOrderAt)) {
        lastOrderId = secondary.last_order_id;
        lastOrderAt = secondary.last_order_at;
    }

    // Re-link any orders that referenced secondary's email/phone — handled separately,
    // since orders aren't FK'd to customer_id directly.

    const tx = db.transaction(() => {
        // Re-attribute the stamp log first (before secondary is deleted, FK would fail)
        db.prepare('UPDATE stamp_log SET customer_id = ? WHERE customer_id = ?').run(primaryId, secondaryId);
        // Re-link any orders that pointed to secondary by customer_id
        db.prepare('UPDATE orders SET customer_id = ? WHERE customer_id = ?').run(primaryId, secondaryId);
        // If secondary had a linked web account (game_player), delete it.
        // The primary's account (if any) is preserved.
        if (secondary.email) {
            try {
                db.prepare('DELETE FROM game_players WHERE email = ?').run(secondary.email);
            } catch (e) {
                console.error('[mergeCustomers] game_player delete error:', e.message);
            }
        }
        // Free up secondary's unique fields so primary can claim them
        stmts.deleteCustomer.run(secondaryId);
        // Update primary with merged data
        updateCustomer(primaryId, updates);
        const now = new Date().toISOString();
        stmts.updateCustomerStamps.run(mergedStamps, mergedTotal,
            JSON.stringify(mergedClaimed), JSON.stringify(mergedRewards), now, primaryId);
        if (lastOrderId) {
            stmts.updateCustomerLastOrder.run(lastOrderId, lastOrderAt, now, primaryId);
        }

        // Sync the merged stamps to the primary's game_player too (if it exists)
        if (primary.email || updates.email) {
            const linkedEmail = updates.email || primary.email;
            try {
                const player = stmts.getGamePlayer.get(linkedEmail);
                if (player) {
                    stmts.updateLoyalty.run(
                        mergedStamps,
                        mergedTotal,
                        JSON.stringify(mergedClaimed),
                        JSON.stringify(mergedRewards),
                        linkedEmail
                    );
                }
            } catch (e) {
                console.error('[mergeCustomers] primary game_player sync error:', e.message);
            }
        }
    });
    tx();

    return getCustomerById(primaryId);
}

// ── Push subscriptions ──────────────────────────────────────────────────────

function savePushSub({ endpoint, keys, deviceLabel, adminUser }) {
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        throw new Error('Invalid push subscription payload');
    }
    const now = new Date().toISOString();
    stmts.upsertPushSub.run({
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        device_label: deviceLabel || null,
        admin_user: adminUser || null,
        now
    });
    return getAllPushSubs().find(s => s.endpoint === endpoint);
}

function getAllPushSubs() {
    return stmts.getAllPushSubs.all();
}

function getPushSubsByAdmin(adminUser) {
    return stmts.getPushSubsByAdmin.all(adminUser);
}

function deletePushSub(endpoint) {
    stmts.deletePushSubByEndpoint.run(endpoint);
}

function deletePushSubById(id) {
    stmts.deletePushSubById.run(id);
}

function touchPushSub(endpoint) {
    stmts.touchPushSub.run(new Date().toISOString(), endpoint);
}

// ── Admin sessions ──────────────────────────────────────────────────────────

const ADMIN_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function createAdminSession({ token, adminUser, deviceLabel, ip, userAgent }) {
    if (!token) throw new Error('Token required');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ADMIN_SESSION_DURATION_MS);
    stmts.insertAdminSession.run({
        token,
        admin_user: adminUser || 'admin',
        device_label: deviceLabel || null,
        ip: ip || null,
        user_agent: userAgent || null,
        now: now.toISOString(),
        expires_at: expiresAt.toISOString()
    });
    return { token, expiresAt: expiresAt.toISOString() };
}

// Look up a session, returning null if expired or missing.
// Auto-purges expired sessions opportunistically.
function getAdminSession(token) {
    if (!token) return null;
    const row = stmts.getAdminSession.get(token);
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
        stmts.deleteAdminSession.run(token);
        return null;
    }
    return row;
}

function touchAdminSession(token) {
    stmts.touchAdminSession.run(new Date().toISOString(), token);
}

function deleteAdminSession(token) {
    stmts.deleteAdminSession.run(token);
}

// Generate a short, stable, non-secret identifier for a session token.
// Used to let the client reference a session for revocation without exposing
// the actual auth token in API responses.
function shortIdForToken(token) {
    if (!token) return null;
    return require('crypto').createHash('sha256').update(token).digest('hex').substring(0, 16);
}

function getAdminSessionByShortId(shortId) {
    if (!shortId) return null;
    return stmts.getAllAdminSessions.all().find(s => shortIdForToken(s.token) === shortId) || null;
}

function getAllAdminSessions() {
    purgeExpiredAdminSessions();
    return stmts.getAllAdminSessions.all();
}

function purgeExpiredAdminSessions() {
    stmts.purgeExpiredAdminSessions.run(new Date().toISOString());
}

// ── Login attempt logging ──────────────────────────────────────────────────

function logLoginAttempt({ ip, attemptedUser, success, failureReason, userAgent }) {
    stmts.insertLoginAttempt.run(
        ip || null,
        attemptedUser || null,
        success ? 1 : 0,
        failureReason || null,
        userAgent ? String(userAgent).substring(0, 500) : null,
        new Date().toISOString()
    );
}

function getRecentLoginAttempts(limit = 100) {
    return stmts.getRecentLoginAttempts.all(limit);
}

function getRecentFailuresByIp(ip, withinMs = 15 * 60 * 1000) {
    const since = new Date(Date.now() - withinMs).toISOString();
    return stmts.getRecentFailuresByIp.get(ip, since).count;
}

// ── Admin credentials (WebAuthn / passkeys) ────────────────────────────────

function saveAdminCredential({ id, adminUser, publicKey, counter, transports, deviceLabel, deviceType, backedUp }) {
    if (!id || !adminUser || !publicKey) {
        throw new Error('Missing required credential fields');
    }
    const now = new Date().toISOString();
    stmts.insertAdminCredential.run({
        id,
        admin_user: adminUser,
        public_key: publicKey,                              // Buffer / Uint8Array
        counter: counter || 0,
        transports: transports ? JSON.stringify(transports) : null,
        device_label: deviceLabel || null,
        device_type: deviceType || null,
        backed_up: backedUp ? 1 : 0,
        now
    });
    return getAdminCredentialById(id);
}

function getAdminCredentialById(id) {
    if (!id) return null;
    const row = stmts.getAdminCredentialById.get(id);
    if (!row) return null;
    // Parse transports JSON
    try { row.transports = row.transports ? JSON.parse(row.transports) : []; }
    catch { row.transports = []; }
    return row;
}

function getAdminCredentialsByUser(adminUser) {
    return stmts.getAdminCredentialsByUser.all(adminUser).map(row => {
        try { row.transports = row.transports ? JSON.parse(row.transports) : []; }
        catch { row.transports = []; }
        return row;
    });
}

function updateCredentialCounter(id, counter) {
    stmts.updateCredentialCounter.run(counter, new Date().toISOString(), id);
}

function updateCredentialLabel(id, label) {
    stmts.updateCredentialLabel.run(label, id);
}

function deleteAdminCredential(id) {
    stmts.deleteAdminCredential.run(id);
}

function getAllAdminCredentials() {
    return stmts.getAllAdminCredentials.all().map(row => {
        try { row.transports = row.transports ? JSON.parse(row.transports) : []; }
        catch { row.transports = []; }
        return row;
    });
}

// ── Compat helpers (JSON db used load/save — expose as no-ops) ──────────────
function load() { return {}; }
function save() { }

// ── Wipe test data ────────────────────────────────────────────────────────
// One-shot helper for clearing test orders/customers/etc before going live.
// Preserves admin auth state (sessions, credentials, push subs) so you don't
// get logged out / lose passkeys / lose push registration after running it.
function nukeTestData() {
    const counts = {};
    const tables = [
        'orders', 'customers', 'stamp_log', 'optins',
        'catering_requests', 'login_attempts',
        'discounts', 'game_players'
    ];
    for (const t of tables) {
        try {
            const before = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
            db.prepare(`DELETE FROM ${t}`).run();
            counts[t] = before;
        } catch (e) {
            counts[t] = `error: ${e.message}`;
        }
    }
    // Reset lottery counter
    try {
        db.prepare('UPDATE lottery SET count = 0 WHERE id = 1').run();
        counts.lottery_reset = true;
    } catch (e) {
        counts.lottery_reset = `error: ${e.message}`;
    }
    return counts;
}

module.exports = {
    load, save,
    nukeTestData,
    insertOrder, updateOrderStatus, updateOrderPayment, updateOrderPaymentStatus, deleteOrder, setDriverToken,
    getOrderById, getOrderByDriverToken, getTodaysOrders, getAllOrders,
    insertOptin, getAllOptins, deleteOptin,
    insertCateringRequest, getAllCateringRequests, updateCateringStatus, deleteCateringRequest,
    createDiscountCode, validateDiscountCode, markDiscountUsed, updateDiscountToFixed,
    getAllDiscountCodes, getDiscountsByEmail,
    getGamePlayer, getAllGamePlayers, createGamePlayer, saveGamePlayer, updateGamePassword,
    updateGameProgress, claimGameCode,
    getLotteryCount, incrementLotteryCount, createLotteryDiscount,
    addLoyaltyStamp, setLoyaltyStampsForPlayer, getLoyaltyProgress,
    // New customer API
    normalisePhone,
    getCustomerById, getCustomerByPhone, getCustomerByEmail, findCustomer,
    createCustomer, updateCustomer, deleteCustomer,
    getAllCustomers, searchCustomers,
    adjustStamps, getStampLog, setLastOrder,
    mergeCustomers,
    // Push subscriptions
    savePushSub, getAllPushSubs, getPushSubsByAdmin,
    deletePushSub, deletePushSubById, touchPushSub,
    // Admin sessions + login attempts
    createAdminSession, getAdminSession, touchAdminSession, deleteAdminSession,
    getAllAdminSessions, purgeExpiredAdminSessions,
    shortIdForToken, getAdminSessionByShortId,
    logLoginAttempt, getRecentLoginAttempts, getRecentFailuresByIp,
    // WebAuthn / passkey credentials
    saveAdminCredential, getAdminCredentialById, getAdminCredentialsByUser,
    updateCredentialCounter, updateCredentialLabel, deleteAdminCredential,
    getAllAdminCredentials
};
