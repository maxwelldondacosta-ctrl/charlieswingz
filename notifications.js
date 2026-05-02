const twilio = process.env.TWILIO_ACCOUNT_SID ? require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;
const { Resend } = process.env.RESEND_API_KEY ? require('resend') : { Resend: null };
const resend = Resend ? new Resend(process.env.RESEND_API_KEY) : null;
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'notifications.log');
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try { fs.appendFileSync(LOG_PATH, line); } catch(e) {}
    console.log(msg);
}

const FROM_PHONE  = process.env.TWILIO_FROM_NUMBER || '';
const FROM_EMAIL  = process.env.RESEND_FROM_EMAIL  || 'orders@charlieswingz.com';
const BRAND       = "Charlie's Wingz";

// Business contact details for customer support
const BIZ_PHONE   = process.env.BUSINESS_PHONE || process.env.OWNER_PHONE || '';
const BIZ_WA      = BIZ_PHONE ? BIZ_PHONE.replace('+', '') : '';
const BIZ_WA_LINK = BIZ_WA ? `https://wa.me/${BIZ_WA}` : '';
const BIZ_PHONE_LINK = BIZ_PHONE ? `tel:${BIZ_PHONE}` : '';

// Contact line for SMS/WhatsApp messages
const SMS_CONTACT = BIZ_PHONE ? `\nProblem? Call ${BIZ_PHONE} or WhatsApp ${BIZ_WA_LINK}` : '';

// Contact block for emails
const EMAIL_CONTACT = BIZ_PHONE ? `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #333">
        <p style="color:#aaa;font-size:0.8rem;margin:0">Problem with your order?</p>
        <p style="margin:6px 0 0">
            📞 <a href="tel:${BIZ_PHONE}" style="color:#d4af37;text-decoration:none">${BIZ_PHONE}</a> &nbsp;·&nbsp;
            <a href="${BIZ_WA_LINK}" style="color:#25d366;text-decoration:none">💬 WhatsApp</a>
        </p>
    </div>` : '';

// ── Message copy ─────────────────────────────────────────────────────────────

const MESSAGES = {
    received: {
        sms: (name, orderId) =>
            `${BRAND}: Hi ${name}! 👑 Your order #${orderId} is confirmed. We'll keep you updated. Fit for royalty!${SMS_CONTACT}`,
        emailSubject: () => `Order Confirmed — ${BRAND}`,
        emailHtml: (name, orderId, total, items) => `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                <h1 style="color:#d4af37;margin:0 0 8px">👑 Order Confirmed</h1>
                <p style="margin:0 0 24px;color:#aaa">Order #${orderId}</p>
                <p>Hi ${name},</p>
                <p>Your order is confirmed and we're getting ready for you.</p>
                <div style="background:#111;border:1px solid #d4af37;border-radius:6px;padding:16px;margin:20px 0">
                    ${items.map(i => `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>${i.quantity}× ${i.name}${i.boneless ? ' (Boneless)' : ''}${i.loadedUpgrade ? ' 👑' : ''}</span><span style="color:#d4af37">£${((i.price * i.quantity)/100).toFixed(2)}</span></div>`).join('')}
                    <div style="border-top:1px solid #333;padding-top:12px;margin-top:8px;font-weight:bold;display:flex;justify-content:space-between"><span>Total</span><span style="color:#d4af37">£${(total/100).toFixed(2)}</span></div>
                </div>
                <p style="color:#aaa;font-size:0.85rem">We'll keep you updated as your order progresses.</p>
                <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
                ${EMAIL_CONTACT}
            </div>
        `
    },
    cooking: {
        sms: (name) =>
            `${BRAND}: 🍗 Your order is in the fryer, ${name}! Fresh, hot and almost ready. Sit tight — we'll let you know when it's on its way. 👑${SMS_CONTACT}`,
        emailSubject: () => `Your order is being cooked 🍗`,
        emailHtml: (name) => `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                <h1 style="color:#d4af37;margin:0 0 24px">🍗 In the Fryer</h1>
                <p>Hi ${name},</p>
                <p>Your wings are in the fryer! We're cooking your order fresh right now.</p>
                <p>We'll let you know as soon as it's on its way to you.</p>
                <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
                ${EMAIL_CONTACT}
            </div>
        `
    },
    out_for_delivery: {
        sms: (name) =>
            `${BRAND}: 🛵 Your order is on its way, ${name}! Our driver is heading to you now. Get ready for royalty. 👑${SMS_CONTACT}`,
        emailSubject: () => `Your order is on its way! 🛵`,
        emailHtml: (name) => `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                <h1 style="color:#d4af37;margin:0 0 24px">🛵 On Its Way</h1>
                <p>Hi ${name},</p>
                <p>Your order is out for delivery. Our driver is heading to you right now.</p>
                <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
                ${EMAIL_CONTACT}
            </div>
        `
    },
    delivered: {
        sms: (name) =>
            `${BRAND}: ✅ Your order has been delivered, ${name}! Enjoy your wings. Tag us on social — we love to see it. 👑${SMS_CONTACT}`,
        emailSubject: () => `Enjoy your wings! ✅`,
        emailHtml: (name) => `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                <h1 style="color:#d4af37;margin:0 0 24px">✅ Delivered</h1>
                <p>Hi ${name},</p>
                <p>Your order has been delivered. Enjoy!</p>
                <p>If you loved it, tag us on social media — we'd love to see it. 👑</p>
                <p style="color:#d4af37;font-weight:bold;margin-top:24px">Charlie's Wingz — Fit for Royalty</p>
                ${EMAIL_CONTACT}
            </div>
        `
    }
};

// ── Send helpers ─────────────────────────────────────────────────────────────

async function sendSMS(to, message) {
    if (!twilio || !FROM_PHONE) {
        log(`[SMS skipped — Twilio not configured] To: ${to}`);
        return false;
    }
    try {
        const normalised = to.startsWith('+') ? to : `+44${to.replace(/^0/, '')}`;
        const result = await twilio.messages.create({ body: message, from: FROM_PHONE, to: normalised });
        log(`[SMS sent] To: ${normalised} | SID: ${result.sid}`);
        return true;
    } catch (err) {
        log(`[SMS ERROR] To: ${to} | ${err.message} | Code: ${err.code || 'none'}`);
        return false;
    }
}

async function sendWhatsApp(to, message) {
    if (!twilio) {
        log(`[WhatsApp skipped — Twilio not configured] To: ${to}`);
        return false;
    }
    try {
        const normalised = to.startsWith('+') ? to : `+44${to.replace(/^0/, '')}`;
        const fromWA = process.env.TWILIO_WHATSAPP_FROM || `whatsapp:${FROM_PHONE}`;
        await twilio.messages.create({
            body: message,
            from: fromWA.startsWith('whatsapp:') ? fromWA : `whatsapp:${fromWA}`,
            to: `whatsapp:${normalised}`
        });
        log(`[WhatsApp sent] To: ${normalised}`);
        return true;
    } catch (err) {
        log(`[WhatsApp ERROR] To: ${to} | ${err.message}`);
        return false;
    }
}

async function sendEmail(to, subject, html) {
    if (!resend) {
        log(`[Email skipped — Resend not configured] To: ${to}`);
        return false;
    }
    try {
        await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
        log(`[Email sent] To: ${to} | Subject: ${subject}`);
        return true;
    } catch (err) {
        log(`[Email ERROR] To: ${to} | ${err.message}`);
        return false;
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

async function notifyOrderReceived(order, items) {
    const { customer_name: name, customer_email: email, customer_phone: phone, contact_pref: pref, id, total_pence } = order;
    const shortId = id.slice(-6).toUpperCase();
    const msgs = MESSAGES.received;

    log(`[notifyOrderReceived] #${shortId} | pref=${pref} | phone=${phone} | email=${email}`);

    // WhatsApp falls back to SMS if not configured or fails
    if ((pref === 'whatsapp' || pref === 'sms') && phone) {
        if (pref === 'whatsapp' && process.env.TWILIO_WHATSAPP_FROM) {
            const ok = await sendWhatsApp(phone, msgs.sms(name, shortId));
            if (!ok) await sendSMS(phone, msgs.sms(name, shortId));
        } else {
            await sendSMS(phone, msgs.sms(name, shortId));
        }
    } else if (pref === 'email' && email) {
        await sendEmail(email, msgs.emailSubject(), msgs.emailHtml(name, shortId, total_pence, items));
    } else if (pref === 'both') {
        if (phone) await sendSMS(phone, msgs.sms(name, shortId));
        if (email) await sendEmail(email, msgs.emailSubject(), msgs.emailHtml(name, shortId, total_pence, items));
    } else {
        log(`[notifyOrderReceived] No matching channel — pref=${pref} phone=${phone} email=${email}`);
    }
}

async function notifyStatusUpdate(order, status) {
    const { customer_name: name, customer_email: email, customer_phone: phone, contact_pref: pref } = order;
    const msgs = MESSAGES[status];
    if (!msgs) {
        log(`[notifyStatusUpdate] No message template for status: ${status}`);
        return;
    }

    log(`[notifyStatusUpdate] status=${status} | pref=${pref} | phone=${phone} | email=${email}`);

    let sent = false;

    // Try phone-based channels
    if ((pref === 'whatsapp' || pref === 'sms' || pref === 'both') && phone) {
        if (pref === 'whatsapp' && process.env.TWILIO_WHATSAPP_FROM) {
            sent = await sendWhatsApp(phone, msgs.sms(name));
            if (!sent) sent = await sendSMS(phone, msgs.sms(name));
        } else {
            sent = await sendSMS(phone, msgs.sms(name));
        }
    }

    // Try email
    if ((pref === 'email' || pref === 'both') && email) {
        const emailSent = await sendEmail(email, msgs.emailSubject(), msgs.emailHtml(name));
        if (emailSent) sent = true;
    }

    // Fallback — if nothing sent yet, try whatever we have
    if (!sent) {
        log(`[notifyStatusUpdate] Primary channel failed, trying fallback`);
        if (phone && pref !== 'sms' && pref !== 'whatsapp') {
            sent = await sendSMS(phone, msgs.sms(name));
        }
        if (!sent && email && pref !== 'email') {
            sent = await sendEmail(email, msgs.emailSubject(), msgs.emailHtml(name));
        }
    }

    if (sent) {
        log(`[notifyStatusUpdate] ✓ Notification sent for status=${status}`);
    } else {
        log(`[notifyStatusUpdate] ✗ FAILED all channels — pref=${pref} phone=${phone} email=${email}`);
    }
}

async function notifyOwnerNewOrder(order, items) {
    const ownerPhone = process.env.OWNER_PHONE;
    const ownerEmail = process.env.OWNER_EMAIL;
    const shortId = order.id.slice(-6).toUpperCase();
    const total = `£${(order.total_pence / 100).toFixed(2)}`;
    const itemList = items.map(i => {
        const flav = Array.isArray(i.flavourChoice) ? i.flavourChoice.join('/') : (i.flavourChoice || '');
        const bone = i.boneless ? ' [BONELESS]' : '';
        const loaded = i.loadedUpgrade ? ' [LOADED]' : '';
        return `${i.quantity}x ${i.name}${flav ? ' ' + flav : ''}${bone}${loaded}`;
    }).join(', ');

    if (ownerPhone) {
        await sendSMS(ownerPhone,
            `👑 NEW ORDER #${shortId} - ${total} - ${order.order_type.toUpperCase()}\n${itemList}\nCustomer: ${order.customer_name} ${order.customer_phone}`
        );
    }
    if (ownerEmail) {
        await sendEmail(ownerEmail,
            `New Order #${shortId} - ${total}`,
            `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                <h1 style="color:#d4af37;margin:0 0 16px">👑 New Order #${shortId}</h1>
                <p style="font-size:1.1rem;color:#d4af37;font-weight:bold">${total} — ${order.order_type.toUpperCase()}</p>
                <p style="margin:8px 0">${order.customer_name} · ${order.customer_phone}</p>
                <p style="margin:8px 0;color:#aaa">${order.customer_email}</p>
                <div style="background:#111;border:1px solid #d4af37;border-radius:6px;padding:16px;margin:20px 0">
                    ${items.map(i => {
                        const flav = Array.isArray(i.flavourChoice) ? i.flavourChoice.join('/') : (i.flavourChoice || '');
                        const cut = (i.wingCut && i.wingCut !== 'Mixed' && i.wingCut !== 'Boneless') ? ` · ${i.wingCut}` : '';
                        const bone = i.boneless ? ' · 🍗 BONELESS' : '';
                        const dip = i.sauce ? ` · Dip: ${i.sauce}` : '';
                        const loaded = i.loadedUpgrade ? ' · 👑 Royal Loaded' : '';
                        return `<div style="margin-bottom:6px">${i.quantity}× ${i.name}${flav ? ' · ' + flav : ''}${bone}${cut}${dip}${loaded}</div>`;
                    }).join('')}
                </div>
                <p style="color:#aaa;font-size:0.85rem">Log in to <a href="https://order.charlieswingz.com/admin" style="color:#d4af37">admin panel</a> to update status.</p>
            </div>`
        );
    }
}

// Generic function to send a custom message to customer via their preferred channel
async function notifyCustomerDirect(order, smsMsg, emailSubject, emailHtml) {
    const { customer_email: email, customer_phone: phone, contact_pref: pref } = order;

    if ((pref === 'whatsapp' || pref === 'sms') && phone) {
        if (pref === 'whatsapp' && process.env.TWILIO_WHATSAPP_FROM) {
            try { await sendWhatsApp(phone, smsMsg); }
            catch(e) { await sendSMS(phone, smsMsg); }
        } else {
            await sendSMS(phone, smsMsg);
        }
    } else if (pref === 'email' && email) {
        await sendEmail(email, emailSubject, emailHtml);
    } else if (pref === 'both') {
        if (phone) await sendSMS(phone, smsMsg);
        if (email) await sendEmail(email, emailSubject, emailHtml);
    }
}

module.exports = { notifyOrderReceived, notifyStatusUpdate, notifyOwnerNewOrder, notifyCustomerDirect };
