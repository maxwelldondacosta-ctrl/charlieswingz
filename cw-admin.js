#!/usr/bin/env node
/**
 * Charlie's Wingz — Server-side admin CLI
 *
 * Run this from the cPanel Terminal while sitting in ~/public_html/app/
 * It reuses the same SQLite database the live app uses.
 *
 * Usage:
 *   node cw-admin.js                # interactive menu
 *   node cw-admin.js nuke           # wipe test data (still asks to confirm)
 *   node cw-admin.js status         # show current row counts
 *   node cw-admin.js resync         # one-shot resync customers <-> game_players
 *   node cw-admin.js list-customers # show all customers
 *   node cw-admin.js list-orders    # show all orders
 *   node cw-admin.js help
 */

const path = require('path');
const readline = require('readline');

// ── Locate the database ──
// Default for the live host. Override with $CW_DB if needed.
const DB_PATH = process.env.CW_DB || '/home/charlies/charlies_wingz.db';

let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.error('\n✗ Could not load better-sqlite3.');
    console.error('  Run this from inside ~/public_html/app/ where the app modules live:');
    console.error('  cd ~/public_html/app && node ' + path.basename(__filename) + '\n');
    process.exit(1);
}

let db;
try {
    db = new Database(DB_PATH, { readonly: false });
    db.pragma('journal_mode = WAL');
} catch (e) {
    console.error('\n✗ Could not open database at ' + DB_PATH);
    console.error('  Error: ' + e.message);
    console.error('  Override path with:  CW_DB=/path/to/db.sqlite node cw-admin.js\n');
    process.exit(1);
}

// ── Pretty colours (works in cPanel terminal) ──
const c = {
    r: s => `\x1b[31m${s}\x1b[0m`,
    g: s => `\x1b[32m${s}\x1b[0m`,
    y: s => `\x1b[33m${s}\x1b[0m`,
    b: s => `\x1b[34m${s}\x1b[0m`,
    m: s => `\x1b[35m${s}\x1b[0m`,
    c: s => `\x1b[36m${s}\x1b[0m`,
    bold: s => `\x1b[1m${s}\x1b[0m`,
    dim: s => `\x1b[2m${s}\x1b[0m`
};

function header() {
    console.log('');
    console.log(c.y(c.bold("👑 Charlie's Wingz — Admin CLI")));
    console.log(c.dim('   db: ' + DB_PATH));
    console.log('');
}

// ── Status: row counts across all tables ──
function status() {
    const tables = [
        'orders','customers','stamp_log','optins','catering_requests',
        'login_attempts','discounts','game_players','admin_sessions',
        'admin_credentials','push_subscriptions','lottery'
    ];
    console.log(c.bold('Table row counts:'));
    console.log('');
    for (const t of tables) {
        try {
            const n = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
            const tag = (t === 'admin_sessions' || t === 'admin_credentials' ||
                         t === 'push_subscriptions' || t === 'lottery')
                ? c.dim('(preserved by nuke)') : '';
            console.log(`  ${t.padEnd(22)} ${String(n).padStart(6)}  ${tag}`);
        } catch (e) {
            console.log(`  ${t.padEnd(22)} ${c.dim('(no table)')}`);
        }
    }
    console.log('');
}

// ── Nuke: wipe test data, preserve auth ──
function nuke() {
    const tables = [
        'orders','customers','stamp_log','optins','catering_requests',
        'login_attempts','discounts','game_players'
    ];
    const counts = {};
    for (const t of tables) {
        try {
            const n = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
            db.prepare(`DELETE FROM ${t}`).run();
            counts[t] = n;
        } catch (e) {
            counts[t] = `error: ${e.message}`;
        }
    }
    try {
        db.prepare('UPDATE lottery SET count = 0 WHERE id = 1').run();
        counts.lottery_reset = true;
    } catch (e) {
        counts.lottery_reset = `error: ${e.message}`;
    }
    return counts;
}

// ── Resync: customers <-> game_players (in case they drifted) ──
function resync() {
    let synced = 0;
    let skipped = 0;
    // Bail with a clear message if either table is missing
    const tableExists = name => {
        try {
            db.prepare(`SELECT 1 FROM ${name} LIMIT 1`).get();
            return true;
        } catch { return false; }
    };
    if (!tableExists('customers')) return { error: 'customers table not found — nothing to resync' };
    if (!tableExists('game_players')) return { error: 'game_players table not found — nothing to resync' };

    try {
        const customers = db.prepare(
            "SELECT id, email, loyalty_stamps, loyalty_total_orders, loyalty_claimed, loyalty_rewards FROM customers WHERE email IS NOT NULL AND email != ''"
        ).all();
        for (const c of customers) {
            const player = db.prepare('SELECT * FROM game_players WHERE email = ?').get(c.email);
            if (!player) { skipped++; continue; }
            const stamps = Math.max(c.loyalty_stamps || 0, player.loyalty_stamps || 0);
            const total  = Math.max(c.loyalty_total_orders || 0, player.loyalty_total_orders || 0);
            const claimed = c.loyalty_claimed || player.loyalty_claimed || '[]';
            const rewards = c.loyalty_rewards || player.loyalty_rewards || '[]';
            const now = new Date().toISOString();
            db.prepare(
                'UPDATE customers SET loyalty_stamps=?, loyalty_total_orders=?, loyalty_claimed=?, loyalty_rewards=?, updated_at=? WHERE id=?'
            ).run(stamps, total, claimed, rewards, now, c.id);
            db.prepare(
                'UPDATE game_players SET loyalty_stamps=?, loyalty_total_orders=?, loyalty_claimed=?, loyalty_rewards=? WHERE email=?'
            ).run(stamps, total, claimed, rewards, c.email);
            synced++;
        }
    } catch (e) {
        return { error: e.message };
    }
    return { synced, skipped };
}

// ── List helpers ──
function listCustomers() {
    let rows;
    try {
        rows = db.prepare(`
            SELECT id, name, phone, email, source, loyalty_stamps, loyalty_total_orders,
                   last_order_at, created_at
            FROM customers ORDER BY created_at DESC
        `).all();
    } catch (e) {
        console.log(c.r('  ✗ ' + e.message));
        console.log(c.dim('  (the customers table may not exist yet — that is fine if no customers have been created)'));
        console.log('');
        return;
    }
    if (!rows.length) { console.log(c.dim('  (no customers)')); console.log(''); return; }
    console.log(c.bold(`${rows.length} customers:`));
    console.log('');
    for (const r of rows) {
        const stamps = `${r.loyalty_stamps || 0} stamps`;
        const orders = `${r.loyalty_total_orders || 0} orders`;
        console.log(`  ${c.y(r.id.padEnd(11))} ${(r.name || '(no name)').padEnd(24)} ${(r.phone || r.email || '').padEnd(30)} ${c.dim(stamps + ' · ' + orders)}`);
    }
    console.log('');
}

function listOrders() {
    // Try with payment columns first (newer schema), fall back if columns missing
    let rows;
    try {
        rows = db.prepare(`
            SELECT id, customer_name, customer_phone, total_pence, status, payment_method, payment_status, created_at
            FROM orders ORDER BY created_at DESC LIMIT 50
        `).all();
    } catch (e) {
        try {
            rows = db.prepare(`
                SELECT id, customer_name, customer_phone, total_pence, status, created_at
                FROM orders ORDER BY created_at DESC LIMIT 50
            `).all();
            // Fill the missing columns so the renderer doesn't blow up
            rows.forEach(r => { r.payment_method = '?'; r.payment_status = '?'; });
        } catch (e2) {
            console.log(c.r('  ✗ ' + e2.message));
            console.log('');
            return;
        }
    }
    if (!rows.length) { console.log(c.dim('  (no orders)')); console.log(''); return; }
    console.log(c.bold(`Most recent ${rows.length} orders:`));
    console.log('');
    for (const r of rows) {
        const total = '£' + ((r.total_pence || 0) / 100).toFixed(2);
        const when = r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : '';
        console.log(`  ${c.y(r.id.padEnd(13))} ${(r.customer_name || '?').padEnd(20)} ${total.padStart(7)}  ${c.dim((r.status || '').padEnd(18))} ${c.dim(r.payment_method + '/' + r.payment_status)}  ${c.dim(when)}`);
    }
    console.log('');
}

// ── Confirm prompt ──
function confirm(question) {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question + ' ', answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// ── Interactive menu ──
async function menu() {
    while (true) {
        console.log(c.bold('What would you like to do?'));
        console.log('  1) Show table row counts');
        console.log('  2) List customers');
        console.log('  3) List recent orders');
        console.log('  4) Resync loyalty (customers ↔ game_players)');
        console.log(c.r('  5) NUKE test data (wipe everything except admin auth)'));
        console.log('  6) Restart the live app (touch tmp/restart.txt)');
        console.log('  q) Quit');
        const ans = (await confirm(c.dim('>'))).toLowerCase();
        console.log('');
        if (ans === 'q' || ans === '') break;
        if (ans === '1') status();
        else if (ans === '2') listCustomers();
        else if (ans === '3') listOrders();
        else if (ans === '4') {
            const r = resync();
            if (r.error) console.log(c.r('✗ Error: ' + r.error));
            else console.log(c.g(`✓ Synced ${r.synced} customer/game_player pair(s). ${r.skipped} customer(s) had no matching account.`));
            console.log('');
        }
        else if (ans === '5') {
            console.log(c.r('⚠  This will WIPE: orders, customers, stamps, optins, login attempts,'));
            console.log(c.r('   discounts, game player accounts, lottery counter.'));
            console.log(c.dim('   It will KEEP: admin sessions, passkeys, push subscriptions.'));
            console.log('');
            const a = await confirm(c.r('   Type ') + c.bold('YES') + c.r(' to confirm:'));
            if (a === 'YES') {
                console.log('');
                const counts = nuke();
                console.log(c.g('✓ Wiped:'));
                for (const [k, v] of Object.entries(counts)) {
                    if (typeof v === 'number') console.log(`    ${k.padEnd(22)} ${v} row(s)`);
                    else if (v === true) console.log(`    ${k.padEnd(22)} ${c.g('reset')}`);
                    else console.log(`    ${k.padEnd(22)} ${c.dim(v)}`);
                }
                console.log('');
                console.log(c.dim('   Tip: also touch ~/public_html/app/tmp/restart.txt to clear in-memory caches.'));
                console.log('');
            } else {
                console.log(c.dim('   Cancelled.'));
                console.log('');
            }
        }
        else if (ans === '6') {
            const fs = require('fs');
            const restartPath = path.resolve(process.env.HOME || '/home/charlies', 'public_html/app/tmp/restart.txt');
            try {
                fs.mkdirSync(path.dirname(restartPath), { recursive: true });
                fs.writeFileSync(restartPath, new Date().toISOString());
                console.log(c.g('✓ Touched ' + restartPath));
                console.log(c.dim('   Passenger will pick up the restart on the next request.'));
            } catch (e) {
                console.log(c.r('✗ Could not touch restart file: ' + e.message));
            }
            console.log('');
        }
        else console.log(c.dim('   (unknown option)\n'));
    }
}

// ── CLI entry ──
async function main() {
    header();
    const cmd = (process.argv[2] || '').toLowerCase();
    if (!cmd || cmd === 'menu') return menu();
    if (cmd === 'help' || cmd === '-h' || cmd === '--help') {
        console.log('Usage:');
        console.log('  node cw-admin.js              interactive menu');
        console.log('  node cw-admin.js status       show row counts');
        console.log('  node cw-admin.js list-customers');
        console.log('  node cw-admin.js list-orders');
        console.log('  node cw-admin.js resync       one-shot loyalty resync');
        console.log('  node cw-admin.js nuke         wipe test data (asks to confirm)');
        console.log('  node cw-admin.js help         this help');
        console.log('');
        return;
    }
    if (cmd === 'status') return status();
    if (cmd === 'list-customers') return listCustomers();
    if (cmd === 'list-orders') return listOrders();
    if (cmd === 'resync') {
        const r = resync();
        if (r.error) console.log(c.r('✗ ' + r.error));
        else console.log(c.g(`✓ Synced ${r.synced}, skipped ${r.skipped}.`));
        console.log('');
        return;
    }
    if (cmd === 'nuke') {
        console.log(c.r('⚠  About to wipe ALL test data (preserves admin auth).'));
        const a = await confirm(c.r('   Type ') + c.bold('YES') + c.r(' to confirm:'));
        if (a !== 'YES') { console.log(c.dim('   Cancelled.\n')); return; }
        const counts = nuke();
        console.log(c.g('\n✓ Wiped:'));
        for (const [k, v] of Object.entries(counts)) {
            if (typeof v === 'number') console.log(`    ${k.padEnd(22)} ${v} row(s)`);
            else if (v === true) console.log(`    ${k.padEnd(22)} ${c.g('reset')}`);
            else console.log(`    ${k.padEnd(22)} ${c.dim(v)}`);
        }
        console.log('');
        return;
    }
    console.log(c.r('Unknown command: ' + cmd));
    console.log('Run: node cw-admin.js help\n');
}

main().catch(e => {
    console.error(c.r('\n✗ Fatal:'), e);
    process.exit(1);
});
