// Web Push notifications — sends alerts to admin devices when new orders arrive
// Uses VAPID keys (set in .env: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT)

const webpush = require('web-push');
const db = require('./db');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@charlieswingz.com';

let configured = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
    try {
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
        configured = true;
    } catch (e) {
        console.error('[PUSH] Failed to set VAPID details:', e.message);
    }
}

function isConfigured() {
    return configured;
}

function getPublicKey() {
    return VAPID_PUBLIC || null;
}

// Send a push notification to all registered admin devices.
// Automatically removes dead subscriptions (404/410 = endpoint expired).
async function sendToAllAdmins(payload) {
    if (!configured) {
        console.warn('[PUSH] Not configured — skipping notification');
        return { sent: 0, failed: 0, removed: 0 };
    }
    const subs = db.getAllPushSubs();
    const data = JSON.stringify(payload);
    let sent = 0, failed = 0, removed = 0;

    await Promise.all(subs.map(async sub => {
        try {
            await webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
            }, data, {
                TTL: 300, // expire after 5 mins if undelivered
                urgency: 'high'
            });
            sent++;
            db.touchPushSub(sub.endpoint);
        } catch (e) {
            failed++;
            // 404 / 410 = subscription expired — clean it up
            if (e.statusCode === 404 || e.statusCode === 410) {
                db.deletePushSub(sub.endpoint);
                removed++;
            } else {
                console.error('[PUSH] Send failed:', e.statusCode, e.body || e.message);
            }
        }
    }));

    return { sent, failed, removed };
}

// Build a rich notification payload for a new order
function buildNewOrderPayload(order, items) {
    const shortId = (order.id || '').slice(-6).toUpperCase();
    const total = `£${(order.total_pence / 100).toFixed(2)}`;
    const orderType = (order.order_type || 'collection').toUpperCase();
    const orderTypeIcon = order.order_type === 'delivery' ? '🚚' : '🏃';

    // Format items as bullet list
    const itemLines = items.map(i => {
        const flav = Array.isArray(i.flavourChoice)
            ? i.flavourChoice.join('/')
            : (i.flavourChoice || '');
        const cut = (i.wingCut && i.wingCut !== 'Mixed' && i.wingCut !== 'Boneless') ? ` (${i.wingCut})` : '';
        const bone = i.boneless ? ' [BONELESS]' : '';
        const dip = i.sauce ? ` · ${i.sauce}` : '';
        const loaded = i.loadedUpgrade ? ' 👑' : '';
        return `• ${i.quantity}× ${i.name}${cut}${bone}${flav ? ' · ' + flav : ''}${dip}${loaded}`;
    });

    const isDelivery = order.order_type === 'delivery';
    const locationLine = isDelivery
        ? `${orderTypeIcon} Delivery → ${order.postcode || ''}`
        : `${orderTypeIcon} Collection`;

    const customerLine = `👤 ${order.customer_name || 'Customer'}${order.customer_phone ? ' · ' + order.customer_phone : ''}`;

    // iOS shows ~4 lines on lock screen; expanded shows everything
    const body = [
        locationLine,
        customerLine,
        '',
        '📦 Order:',
        ...itemLines
    ].join('\n');

    return {
        title: `👑 NEW ORDER #${shortId} · ${total}`,
        body,
        tag: `order-${order.id}`,        // groups notifications by order — only one shows per order
        renotify: false,
        requireInteraction: true,         // stays on screen until dismissed
        data: {
            orderId: order.id,
            // Hash fragment only — service worker resolves it against the admin
            // scope so it works whether admin is at /admin or a hidden URL.
            url: `#order-${order.id}`,
            type: 'new-order'
        },
        actions: [
            { action: 'view', title: '📋 View Order' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };
}

// Send a test notification (used by admin "Test" button)
async function sendTest() {
    return sendToAllAdmins({
        title: '👑 Test notification',
        body: 'Push notifications are working! You\'ll get alerts here when new orders come in.',
        tag: 'test',
        data: { type: 'test' }
    });
}

module.exports = {
    isConfigured,
    getPublicKey,
    sendToAllAdmins,
    buildNewOrderPayload,
    sendTest
};
