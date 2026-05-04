require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('./db');
const { notifyOrderReceived, notifyStatusUpdate, notifyOwnerNewOrder, notifyCustomerDirect } = require('./notifications');
const push = require('./push');
const webauthn = require('./webauthn');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Order pausing (in-memory, resets on restart — defaults to accepting orders) ──
let ordersPaused = false;

// Middleware
app.use(cors());

// Override restrictive hosting CSP — allow all domains needed for Stripe, Google Pay, Maps
app.use((req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('X-Content-Security-Policy');
    res.setHeader('Content-Security-Policy',
        "default-src 'self' https: blob: data:; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network https://maps.googleapis.com https:; " +
        "style-src 'self' 'unsafe-inline' https:; " +
        "style-src-elem 'self' 'unsafe-inline' https:; " +
        "font-src 'self' https: data:; " +
        "img-src 'self' https: data: blob:; " +
        "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://m.stripe.network https:; " +
        "connect-src 'self' https://api.stripe.com https://m.stripe.network https: wss:; " +
        "worker-src 'self' blob: https://m.stripe.network https:; " +
        "child-src 'self' blob: https:"
    );
    next();
});

app.use((req, res, next) => {
    if (req.path === '/webhooks/stripe') return next();
    express.json()(req, res, next);
});

// Dynamic admin manifest — must come BEFORE express.static so it overrides any
// static admin-manifest.json that might exist in public/.
// Note: ADMIN_PATH is referenced lazily here because it's defined further down,
// so we use a function rather than a closed-over constant.
app.get('/admin-manifest.json', (req, res) => {
    const adminPath = (process.env.ADMIN_PATH || '/admin').replace(/\/+$/, '') || '/admin';
    res.json({
        name: "Charlie's Wingz Admin",
        short_name: "CW Admin",
        description: "Charlie's Wingz Order Management",
        start_url: adminPath,
        scope: adminPath,
        display: "standalone",
        orientation: "any",
        background_color: "#0d1117",
        theme_color: "#d4af37",
        icons: [
            { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ],
        categories: ["business", "productivity"],
        lang: "en-GB"
    });
});

app.use(express.static('public', { dotfiles: 'allow' }));

// Menu data (prices in pence for accuracy)
const MENU = {
    wings: {
        'w6':  { name: '6 Wings',  price: 850,  category: 'Wings', flavourCount: 1, wingCount: 6,
                 image: '/menu-images/w6.jpg',
                 description: 'Six crisp double-fried wings, finished in your choice of one signature glaze or seasoning.' },
        'w10': { name: '10 Wings', price: 1400, category: 'Wings', flavourCount: 1, wingCount: 10,
                 image: '/menu-images/w10.jpg',
                 description: 'Ten crisp double-fried wings, finished in your choice of one signature glaze or seasoning.' },
        'w20': { name: '20 Wings', price: 2600, category: 'Wings', flavourCount: 2, wingCount: 20,
                 image: '/menu-images/w20.jpg',
                 description: 'Twenty crisp double-fried wings with your choice of up to two signature glazes or seasonings.' },
        'w30': { name: '30 Wings', price: 3700, category: 'Wings', flavourCount: 2, wingCount: 30,
                 image: '/menu-images/w30.jpg',
                 description: 'Thirty crisp double-fried wings with your choice of up to two signature glazes or seasonings.' },
        'w50': { name: '50 Wings', price: 5900, category: 'Wings', flavourCount: 2, wingCount: 50,
                 image: '/menu-images/w50.jpg',
                 description: 'Fifty crisp double-fried wings with your choice of up to two signature glazes or seasonings. Designed for sharing, feasting and larger gatherings.' }
    },
    meals: {
        'm6':  { name: '6 Wing Royal Meal',  price: 1100, category: 'Meals', displayCategory: 'Royal Meals', includes: 'Wings + Hand-Cut Chips + Drink', drinkCount: 1, flavourCount: 1, wingCount: 6,
                 image: '/menu-images/m6.jpg',
                 description: 'Six crisp double-fried wings, hand-cut chips and a drink. A refined single portion with enough substance to feel complete.' },
        'm10': { name: '10 Wing Royal Meal', price: 1800, category: 'Meals', displayCategory: 'Royal Meals', includes: 'Wings + Hand-Cut Chips + Drink', drinkCount: 1, flavourCount: 1, wingCount: 10,
                 image: '/menu-images/m10.jpg',
                 description: 'Ten crisp double-fried wings, hand-cut chips and a drink. A full meal for anyone taking wings seriously.' },
        'm20': { name: '20 Wing Royal Meal', price: 2900, category: 'Meals', displayCategory: 'Royal Meals', includes: 'Wings + Hand-Cut Chips + Drink', drinkCount: 1, flavourCount: 2, wingCount: 20,
                 image: '/menu-images/m20.jpg',
                 description: 'Twenty crisp double-fried wings with up to two signature glazes or seasonings, served with hand-cut chips and a drink.' },
        'm30': { name: '30 Wing Royal Meal', price: 4100, category: 'Meals', displayCategory: 'Royal Meals', includes: 'Wings + Hand-Cut Chips + Drink', drinkCount: 1, flavourCount: 2, wingCount: 30,
                 image: '/menu-images/m30.jpg',
                 description: 'Thirty crisp double-fried wings with up to two signature glazes or seasonings, served with hand-cut chips and a drink. Built for larger appetites or shared indulgence.' }
    },
    bundles: {
        'b-taster18': { name: 'Taster Box',   price: 2600, category: 'Bundles', displayCategory: 'Sharing Feasts', includes: '18 wings — 6 of each glaze + 3 house sauces', dipCount: 3, flavourCount: 3, wingCount: 18, fixedFlavours: true, fixedDips: true,
                        image: '/menu-images/b-taster18.jpg',
                        description: 'Eighteen wings served as six of each signature glaze or seasoning, with three house sauces included. A complete introduction to the Charlie\u2019s Wingz flavour range.' },
        'b-taster30': { name: 'Taster Feast', price: 3900, category: 'Bundles', displayCategory: 'Sharing Feasts', includes: '30 wings — 10 of each glaze + 3 house sauces', dipCount: 3, flavourCount: 3, wingCount: 30, fixedFlavours: true, fixedDips: true,
                        image: '/menu-images/b-taster30.jpg',
                        description: 'Thirty wings served as ten of each signature glaze or seasoning, with three house sauces included. A fuller tasting experience for groups or committed wing lovers.' },
        'b-duo':    { name: 'Duo Box',    price: 3500, category: 'Bundles', displayCategory: 'Sharing Feasts', includes: '20 wings + 2 hand-cut chips + 2 drinks', drinkCount: 2, flavourCount: 2, wingCount: 20,
                      image: '/menu-images/b-duo.jpg',
                      description: 'Twenty wings with up to two signature glazes or seasonings, served with two portions of hand-cut chips and two drinks.' },
        'b-family': { name: 'Family Box', price: 4800, category: 'Bundles', displayCategory: 'Sharing Feasts', includes: '30 wings + 3 hand-cut chips + 3 drinks', drinkCount: 3, flavourCount: 2, wingCount: 30,
                      image: '/menu-images/b-family.jpg',
                      description: 'Thirty wings with up to two signature glazes or seasonings, served with three portions of hand-cut chips and three drinks.' },
        'b-party':  { name: 'Party Box',  price: 7000, category: 'Bundles', displayCategory: 'Sharing Feasts', includes: '50 wings + 4 hand-cut chips + 4 drinks', drinkCount: 4, flavourCount: 2, wingCount: 50,
                      image: '/menu-images/b-party.jpg',
                      description: 'Fifty wings with up to two signature glazes or seasonings, served with four portions of hand-cut chips and four drinks.' }
    },
    sides: {
        's-fries':  { name: 'Hand-Cut Chips', price: 400, category: 'Sides', displayCategory: 'Accompaniments',
                      image: '/menu-images/s-fries.jpg',
                      description: 'Fresh hand-cut chips, cooked golden with a crisp exterior and a soft, fluffy centre. Simple, precise and properly seasoned.' },
        's-loaded': { name: 'Royal Loaded Fries', price: 450, category: 'Sides', displayCategory: 'Accompaniments',
                      image: '/menu-images/s-loaded.jpg',
                      description: 'Golden hand-cut chips topped with shredded chicken tenders and finished with Royal Lemon Pepper Wet sauce. Crisp, rich and indulgent, with butter, citrus, spice and savoury depth.' },
        's-dip':    { name: 'Extra House Sauce', price: 100, category: 'Sides', displayCategory: 'Accompaniments', hasSauce: true,
                      image: '/menu-images/s-dip.jpg',
                      description: 'Add an extra house sauce for dipping, dressing or finishing your wings and chips.' },
        's-drink':  { name: 'Drink', price: 200, category: 'Sides', displayCategory: 'Accompaniments',
                      image: '/menu-images/s-drink.jpg',
                      description: 'Choose from Coke, Sprite, Fanta Orange or Water.' }
    }
};

// Glaze descriptions (used by frontend; kept here so server-rendered emails can use them too)
const FLAVOUR_DESCRIPTIONS = {
    'Lemon Pepper Gold':       'Crisp double-fried wings with a golden lemon-pepper crust, lifted by fresh lemon, garlic and smoked paprika. Clean, aromatic and savoury, with a bright citrus edge and refined pepper finish.',
    'Royal Lemon Pepper Wet':  'Double-fried wings dressed in a glossy lemon-pepper butter sauce, finished with honey, cayenne, smoked paprika and fresh lemon. Rich and tangy, with layered heat and a polished citrus finish.',
    'Korean Sweet Heat':       'Crisp wings lacquered in a Korean-style gochujang glaze with garlic butter, soy, mirin, honey and sesame. Sweet, savoury and gently warming, with depth, sheen and lingering spice.'
};

const SAUCE_DESCRIPTIONS = {
    'BBQ':           'A rich, slow-style barbecue sauce with tomato, molasses, honey, dark brown sugar, Worcestershire sauce and smoked paprika. Smoky, glossy and deeply rounded.',
    'Honey Mustard': 'A creamy honey mustard with Dijon, yellow mustard, lemon, smoked paprika and cayenne. Smooth and bright, with balanced sweetness and subtle heat.',
    'Ranch':         'A cultured ranch with Greek yoghurt, kefir, garlic, dill, parsley and black pepper. Cool, creamy and herb-led, with a clean tangy finish.'
};

// Loaded fries upgrade — adds £2 to a meal/bundle's fries
const LOADED_UPGRADE_PRICE = 200;

const SAUCES = ['BBQ', 'Ranch', 'Honey Mustard'];
const BRAND = "Charlie's Wingz";
const FLAVOURS = ['Lemon Pepper Gold', 'Royal Lemon Pepper Wet', 'Korean Sweet Heat'];
const DRINKS = ['Coke', 'Sprite', 'Fanta Orange', 'Water'];
const CUTS = ['Mixed', 'All Drums', 'All Flats'];

// Upcharge in pence: keyed by wing count. All Flats price, All Drums = All Flats - 100
const CUT_UPCHARGE = {
    6:  { 'All Flats': 150, 'All Drums': 100 },
    10: { 'All Flats': 300, 'All Drums': 200 },
    18: { 'All Flats': 450, 'All Drums': 350 },
    20: { 'All Flats': 500, 'All Drums': 400 },
    30: { 'All Flats': 700, 'All Drums': 600 },
    40: { 'All Flats': 900, 'All Drums': 800 },
    50: { 'All Flats': 1100, 'All Drums': 1000 }
};

// ── Opening hours (London time) ─────────────────────────────────────────────
// day: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
// hours in 24h [openHour, openMin, closeHour, closeMin] — null = closed
const OPENING_HOURS = {
    0: [16, 0, 21, 0],   // Sunday  4pm–9pm
    1: null,              // Monday  closed
    2: null,              // Tuesday closed
    3: [17, 0, 22, 0],   // Wednesday 5pm–10pm
    4: [17, 0, 22, 0],   // Thursday  5pm–10pm
    5: [17, 0, 24, 0],   // Friday    5pm–midnight
    6: [17, 0, 24, 0],   // Saturday  5pm–midnight
};
const EARLY_ORDER_MINS = 30; // allow orders this many mins before opening

function getLondonTime() {
    // Returns a Date object representing the current wall-clock time in London.
    // We use Intl.DateTimeFormat parts to build a real Date safely (the previous
    // `new Date(toLocaleString('en-GB'))` approach produced Invalid Date because
    // 'en-GB' formats as DD/MM/YYYY which the Date constructor can't parse).
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
    const parts = fmt.formatToParts(new Date()).reduce((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value;
        return acc;
    }, {});
    // Build via numeric args — avoids any string parsing ambiguity
    return new Date(
        parseInt(parts.year, 10),
        parseInt(parts.month, 10) - 1,
        parseInt(parts.day, 10),
        parseInt(parts.hour === '24' ? '0' : parts.hour, 10),
        parseInt(parts.minute, 10),
        parseInt(parts.second, 10)
    );
}

function getStoreStatus() {
    const now   = getLondonTime();
    const day   = now.getDay();
    const mins  = now.getHours() * 60 + now.getMinutes();
    const hours = OPENING_HOURS[day];

    // Find next opening time (search up to 8 days ahead)
    function nextOpen() {
        for (let i = 1; i <= 8; i++) {
            const d = (day + i) % 7;
            if (OPENING_HOURS[d]) {
                const [oh, om] = OPENING_HOURS[d];
                const nextDate = new Date(getLondonTime());
                nextDate.setDate(nextDate.getDate() + i);
                nextDate.setHours(oh, om, 0, 0);
                return nextDate;
            }
        }
        return null;
    }

    if (!hours) {
        // Closed today
        return { open: false, earlyOrders: false, nextOpen: nextOpen() };
    }

    const [oh, om, ch, cm] = hours;
    const openMins  = oh * 60 + om;
    const closeMins = ch * 60 + cm; // 24*60 = midnight

    if (mins >= openMins && mins < closeMins) {
        return { open: true, earlyOrders: true, nextOpen: null };
    }

    if (mins >= openMins - EARLY_ORDER_MINS && mins < openMins) {
        // Within early window
        const openDate = new Date(getLondonTime());
        openDate.setHours(oh, om, 0, 0);
        return { open: false, earlyOrders: true, nextOpen: openDate };
    }

    // Before early window or after close
    if (mins < openMins - EARLY_ORDER_MINS) {
        // Same day but not yet in early window
        const openDate = new Date(getLondonTime());
        openDate.setHours(oh, om, 0, 0);
        return { open: false, earlyOrders: false, nextOpen: openDate };
    }

    // After closing — find next open day
    return { open: false, earlyOrders: false, nextOpen: nextOpen() };
}

// Delivery fee tiers based on distance (in pence)
// FREE DELIVERY — direct orders always free, that's the USP
const DELIVERY_TIERS = [
    { maxMiles: 0.5, fee: 0 },   // was £1.50
    { maxMiles: 1.0, fee: 0 },   // was £2.00
    { maxMiles: 2.0, fee: 0 },   // was £2.50
    { maxMiles: 3.0, fee: 0 },   // was £3.50
    { maxMiles: 4.0, fee: 0 },   // was £4.50
];
const DELIVERY_FEE_DEFAULT = 350; // £3.50 delivery fee
const FREE_DELIVERY_THRESHOLD = 2500; // £25 — free delivery above this
const MINIMUM_ORDER = 0; // no hard minimum — delivery fee applies instead
const DELIVERY_ENABLED = true;
const DELIVERY_MAX_MILES = 4;
const KITCHEN_LAT = 51.6089;
const KITCHEN_LNG = -0.0641;

function getDeliveryFee(miles) {
    if (!miles || miles <= 0) return DELIVERY_FEE_DEFAULT;
    for (const tier of DELIVERY_TIERS) {
        if (miles <= tier.maxMiles) return tier.fee;
    }
    return DELIVERY_FEE_DEFAULT;
}

// Haversine distance in miles between two lat/lng points
function distanceMiles(lat1, lng1, lat2, lng2) {
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Delivery zone — postcode district whitelist with max distance overrides
// This prevents deliveries to areas that are close by distance but slow by road
const DELIVERY_ZONES = {
    'N18': { maxMiles: 4 },   // Home turf
    'N9':  { maxMiles: 4 },   // Lower Edmonton — next door
    'N17': { maxMiles: 4 },   // Tottenham — A1010 south
    'N15': { maxMiles: 4 },   // Seven Sisters — cut-throughs on bike
    'N13': { maxMiles: 4 },   // Palmers Green — A406 west
    'EN3': { maxMiles: 4 },   // Ponders End, Brimsdown, Enfield Lock — Hertford Rd
    'E4':  { maxMiles: 4 },   // Chingford — A406 east
    'EN1': { maxMiles: 2.5 }, // Bush Hill Park OK, Enfield Town too far
};

// Extract postcode district from a full postcode (e.g. "N18 1UB" → "N18", "EN3 5QR" → "EN3")
function getPostcodeDistrict(postcode) {
    const clean = postcode.replace(/\s+/g, '').toUpperCase();
    // Match letters + digits before the final 3 characters (which are the inward code)
    const match = clean.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\d[A-Z]{2}$/);
    return match ? match[1] : null;
}

// Validate postcode is within delivery zone using postcodes.io (free, no key needed)
async function validateDeliveryPostcode(postcode) {
    try {
        const clean = postcode.replace(/\s+/g, '').toUpperCase();
        const district = getPostcodeDistrict(clean);

        // Check district is in our whitelist
        if (!district || !DELIVERY_ZONES[district]) {
            return { valid: false, error: `Sorry, we don't currently deliver to ${district || 'that area'}. We cover: N18, N9, N17, N15, N13, EN3, E4 and parts of EN1.` };
        }

        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
        const data = await res.json();
        if (!data.result) return { valid: false, error: 'Invalid postcode — please check and try again.' };
        const { latitude, longitude } = data.result;
        const miles = distanceMiles(KITCHEN_LAT, KITCHEN_LNG, latitude, longitude);

        // Check against district-specific max distance
        const zone = DELIVERY_ZONES[district];
        if (miles > zone.maxMiles) {
            return { valid: false, error: `Sorry, that part of ${district} is a bit too far for us. We need to get your food to you hot!` };
        }

        const fee = getDeliveryFee(miles);
        return { valid: true, miles: Math.round(miles * 10) / 10, deliveryFee: fee, district };
    } catch (e) {
        console.error('[Postcode validation error]', e.message);
        return { valid: true, deliveryFee: DELIVERY_FEE_DEFAULT };
    }
}

// Helper to get all menu items flat
function getMenuItem(itemId) {
    for (const category of Object.values(MENU)) {
        if (category[itemId]) {
            return category[itemId];
        }
    }
    return null;
}

// Generate unique idempotency key
function generateIdempotencyKey() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// API Routes

// Get menu
app.get('/api/menu', (req, res) => {
    res.json({
        menu: MENU,
        sauces: SAUCES,
        flavours: FLAVOURS,
        drinks: DRINKS,
        cuts: CUTS,
        cutUpcharge: CUT_UPCHARGE,
        deliveryFee: DELIVERY_FEE_DEFAULT,
        deliveryTiers: DELIVERY_TIERS,
        freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
        minimumOrder: MINIMUM_ORDER,
        deliveryEnabled: DELIVERY_ENABLED,
        flavourDescriptions: FLAVOUR_DESCRIPTIONS,
        sauceDescriptions: SAUCE_DESCRIPTIONS
    });
});

// Validate cart and calculate totals
app.post('/api/cart/validate', (req, res) => {
    const { items, orderType } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
    }

    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
        const menuItem = getMenuItem(item.id);
        if (!menuItem) {
            return res.status(400).json({ error: `Invalid item: ${item.id}` });
        }

        // Validate sauce if required (wings, meals, bundles)
        if (['Wings', 'Meals', 'Bundles'].includes(menuItem.category)) {
            if (!menuItem.fixedDips && (!item.sauce || !SAUCES.includes(item.sauce))) {
                return res.status(400).json({ error: `Invalid sauce for ${menuItem.name}` });
            }
        }

        // Validate drink choice if it's a standalone drink
        if (item.id === 's-drink' && (!item.drinkChoice || !DRINKS.includes(item.drinkChoice))) {
            return res.status(400).json({ error: 'Invalid drink choice' });
        }

        // Validate drink choices for meals and bundles (skip bundles without drinks)
        if (['Meals', 'Bundles'].includes(menuItem.category) && menuItem.drinkCount > 0) {
            if (!item.drinkChoice || !DRINKS.includes(item.drinkChoice)) {
                return res.status(400).json({ error: `Invalid drink choice for ${menuItem.name}` });
            }
        }

        const quantity = parseInt(item.quantity) || 1;
        // Boneless flag (Meals/Bundles only) — boneless cancels cut upcharge
        const boneless = !!item.boneless && ['Wings', 'Meals', 'Bundles'].includes(menuItem.category);
        const cutUpcharge = (menuItem.wingCount && item.wingCut && item.wingCut !== 'Mixed' && !boneless)
            ? (CUT_UPCHARGE[menuItem.wingCount]?.[item.wingCut] || 0)
            : 0;

        // Royal Loaded Fries upgrade
        const friesIncluded = menuItem.category === 'Meals' ? 1
                            : (menuItem.category === 'Bundles' && menuItem.drinkCount && !menuItem.fixedDips) ? menuItem.drinkCount
                            : 0;
        const loadedUpgrade = item.loadedUpgrade && friesIncluded > 0;
        const loadedAddon = loadedUpgrade ? (LOADED_UPGRADE_PRICE * friesIncluded) : 0;

        const itemPrice = menuItem.price + cutUpcharge + loadedAddon;
        const itemTotal = itemPrice * quantity;
        subtotal += itemTotal;

        validatedItems.push({
            id: item.id,
            name: menuItem.name,
            category: menuItem.category,
            price: itemPrice,
            quantity: quantity,
            sauce: item.sauce || null,
            wingCut: boneless ? 'Boneless' : (item.wingCut || 'Mixed'),
            drinkChoice: item.drinkChoice || null,
            loadedUpgrade,
            boneless,
            total: itemTotal
        });
    }

    // Calculate delivery fee if applicable
    let deliveryFee = 0;
    if (orderType === 'delivery') {
        if (!DELIVERY_ENABLED) {
            return res.status(400).json({ error: 'Delivery is not currently available' });
        }
        deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE_DEFAULT;
    }

    const total = subtotal + deliveryFee;

    res.json({
        items: validatedItems,
        subtotal,
        deliveryFee,
        total,
        orderType: orderType || 'collection'
    });
});

// Create Stripe Checkout Session
app.post('/api/create-checkout-session', async (req, res) => {
    const { 
        items, 
        orderType, 
        customerDetails,
        contactPref,
        marketingOptin,
        discountCode
    } = req.body;

    // Check if orders are paused
    if (ordersPaused) {
        return res.status(400).json({ error: "We're temporarily not accepting orders. Please try again shortly!" });
    }

    // Check store is open or in early order window
    if (process.env.BYPASS_OPENING_HOURS !== 'true') {
        const storeStatus = getStoreStatus();
        if (!storeStatus.open && !storeStatus.earlyOrders) {
            return res.status(400).json({ error: "We are currently closed. Please order during opening hours." });
        }
    }

    if (!customerDetails || !customerDetails.name) {
        return res.status(400).json({ error: 'Customer name is required' });
    }

    // Validate contact field matches preference
    const pref = contactPref || 'sms';
    if ((pref === 'whatsapp' || pref === 'sms') && !customerDetails.phone) {
        return res.status(400).json({ error: 'Phone number is required for ' + pref + ' updates' });
    }
    if (pref === 'email' && !customerDetails.email) {
        return res.status(400).json({ error: 'Email is required for email updates' });
    }

    // Validate and calculate cart
    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
        const menuItem = getMenuItem(item.id);
        if (!menuItem) {
            return res.status(400).json({ error: `Invalid item: ${item.id}` });
        }

        const quantity = parseInt(item.quantity) || 1;
        // Boneless flag (Meals/Bundles only) — boneless cancels cut upcharge
        const boneless = !!item.boneless && ['Wings', 'Meals', 'Bundles'].includes(menuItem.category);
        const cutUpcharge = (menuItem.wingCount && item.wingCut && item.wingCut !== 'Mixed' && !boneless)
            ? (CUT_UPCHARGE[menuItem.wingCount]?.[item.wingCut] || 0)
            : 0;

        // Royal Loaded Fries upgrade pricing — only valid on Meals & non-fixed Bundles with fries
        const friesIncluded = menuItem.category === 'Meals' ? 1
                            : (menuItem.category === 'Bundles' && menuItem.drinkCount && !menuItem.fixedDips) ? menuItem.drinkCount
                            : 0;
        const loadedUpgrade = item.loadedUpgrade && friesIncluded > 0;
        const loadedAddon = loadedUpgrade ? (LOADED_UPGRADE_PRICE * friesIncluded) : 0;

        const itemPrice = menuItem.price + cutUpcharge + loadedAddon;
        subtotal += itemPrice * quantity;

        // Build description with cut, sauce, drink choices, boneless and loaded upgrade
        let desc = '';
        if (boneless) desc += 'BONELESS';
        else if (item.wingCut && item.wingCut !== 'Mixed') desc += `Cut: ${item.wingCut}`;
        if (item.sauce) desc += `${desc ? ' | ' : ''}Sauce: ${item.sauce}`;
        if (item.drinkChoice) desc += `${desc ? ' | ' : ''}Drink: ${item.drinkChoice}`;
        if (loadedUpgrade) desc += `${desc ? ' | ' : ''}👑 Royal Loaded Fries`;

        lineItems.push({
            price_data: {
                currency: 'gbp',
                product_data: {
                    name: menuItem.name + (boneless ? ' (Boneless)' : '') + (loadedUpgrade ? ' (Royal Loaded)' : ''),
                    description: desc || undefined
                },
                unit_amount: itemPrice
            },
            quantity: quantity
        });
    }

    // Add delivery fee if applicable
    let deliveryFee = 0;
    if (orderType === 'delivery' && DELIVERY_ENABLED) {
        if (customerDetails.postcode) {
            const zoneCheck = await validateDeliveryPostcode(customerDetails.postcode);
            if (!zoneCheck.valid) {
                return res.status(400).json({ error: zoneCheck.error });
            }
            deliveryFee = zoneCheck.deliveryFee || DELIVERY_FEE_DEFAULT;
        } else {
            deliveryFee = DELIVERY_FEE_DEFAULT;
        }
        if (subtotal >= FREE_DELIVERY_THRESHOLD) {
            deliveryFee = 0;
        }
    }

    // Apply discount code if provided
    let discountAmount = 0;
    let appliedDiscount = null;
    if (discountCode) {
        const discountResult = db.validateDiscountCode(discountCode);
        if (discountResult.valid) {
            if (discountResult.type === 'fixed' && discountResult.amountPence > 0) {
                discountAmount = Math.min(discountResult.amountPence, subtotal);
            } else if (discountResult.percent > 0) {
                discountAmount = Math.round(subtotal * discountResult.percent / 100);
            }
            appliedDiscount = discountResult;
        }
    }

    // Add delivery fee as a line item
    if (deliveryFee > 0) {
        lineItems.push({
            price_data: {
                currency: 'gbp',
                product_data: { name: 'Delivery Fee' },
                unit_amount: deliveryFee
            },
            quantity: 1
        });
    }

    const total = subtotal + deliveryFee - discountAmount;

    try {
        // Generate order ID upfront so we can pass it through
        const localOrderId = generateIdempotencyKey();
        const trackToken = crypto.randomBytes(6).toString('hex');

        // Build Stripe Checkout Session
        const sessionParams = {
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `https://order.charlieswingz.com/?order_success=1&track=${trackToken}`,
            cancel_url: `https://order.charlieswingz.com/?order_cancelled=1`,
            customer_email: customerDetails.email || undefined,
            metadata: {
                order_id: localOrderId,
                customer_name: customerDetails.name,
                customer_phone: customerDetails.phone || '',
                customer_email: customerDetails.email || '',
                order_type: orderType,
                contact_pref: pref,
                marketing_optin: marketingOptin ? '1' : '0',
                discount_code: appliedDiscount ? appliedDiscount.code : '',
                discount_amount: discountAmount.toString(),
                items_json: JSON.stringify(items),
                address: customerDetails.address || '',
                city: customerDetails.city || '',
                postcode: customerDetails.postcode || '',
                lat: customerDetails.lat || '',
                lng: customerDetails.lng || '',
                delivery_notes: customerDetails.deliveryNotes || '',
                order_notes: customerDetails.notes || ''
            }
        };

        // Apply discount as a Stripe coupon if applicable
        if (discountAmount > 0) {
            const coupon = await stripe.coupons.create({
                amount_off: discountAmount,
                currency: 'gbp',
                duration: 'once',
                name: appliedDiscount ? `Discount (${appliedDiscount.code})` : 'Discount'
            });
            sessionParams.discounts = [{ coupon: coupon.id }];
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        // Save order to DB as pending payment
        const dbOrder = {
            id: localOrderId,
            paymentIntentId: session.id,
            customerName: customerDetails.name,
            customerEmail: customerDetails.email,
            customerPhone: customerDetails.phone,
            orderType: orderType,
            contactPref: pref,
            itemsJson: JSON.stringify(items),
            totalPence: total,
            address: customerDetails.address || null,
            city: customerDetails.city || null,
            postcode: customerDetails.postcode || null,
            lat: customerDetails.lat || null,
            lng: customerDetails.lng || null,
            deliveryNotes: customerDetails.deliveryNotes || null,
            orderNotes: customerDetails.notes || null,
            trackToken: trackToken
        };
        await db.insertOrder(dbOrder);

        res.json({ url: session.url });

    } catch (error) {
        console.error('Checkout session error:', error);
        res.status(500).json({ error: 'Failed to create checkout. Please try again.' });
    }
});

// Validate delivery postcode live
app.get('/api/validate-postcode', async (req, res) => {
    const { postcode } = req.query;
    if (!postcode) return res.json({ valid: false, error: 'No postcode provided' });
    const result = await validateDeliveryPostcode(postcode);
    res.json(result);
});

// Store status
app.get('/api/store-status', (req, res) => {
    if (ordersPaused) return res.json({ open: false, paused: true, earlyOrders: false, nextOpen: null, pauseMessage: 'We are temporarily not accepting orders. Please check back shortly!' });
    if (process.env.BYPASS_OPENING_HOURS === 'true') return res.json({ open: true, paused: false, earlyOrders: true, nextOpen: null });
    const status = getStoreStatus();
    res.json({
        open: status.open,
        paused: false,
        earlyOrders: status.earlyOrders,
        nextOpen: status.nextOpen ? status.nextOpen.toISOString() : null
    });
});

// Get Stripe publishable key for frontend
app.get('/api/config', (req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Stream config (public) ───────────────────────────────────────────────────
app.get('/api/stream', (req, res) => {
    res.json(db.getStreamConfig());
});

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

// ── Order items (public — used by reorder flow in index.html) ────────────────
app.get('/api/orders/:id/items', (req, res) => {
    const order = db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    let items;
    try { items = JSON.parse(order.items_json || '[]'); } catch { items = []; }
    res.json({ items });
});

// Business contact details (for driver page + customer help)
app.get('/api/contact', (req, res) => {
    const phone = process.env.BUSINESS_PHONE || process.env.OWNER_PHONE || '';
    res.json({
        phone: phone,
        whatsapp: phone ? `https://wa.me/${phone.replace('+', '')}` : '',
        phoneLink: phone ? `tel:${phone}` : ''
    });
});

// ── Catering / Custom order requests ────────────────────────────────────────
app.post('/api/catering', async (req, res) => {
    try {
        const { name, phone, email, date, guests, details } = req.body;
        const fs = require('fs');
        fs.appendFileSync(path.join(__dirname, 'notifications.log'), `[${new Date().toISOString()}] [Catering] Received request: ${name} | ${phone} | ${date}\n`);

        if (!name || !phone || !date || !details) {
            return res.status(400).json({ error: 'Please fill in all required fields.' });
        }

    // Validate 48hr lead time
    const eventDate = new Date(date + 'T00:00:00');
    const now = new Date();
    const hoursUntil = (eventDate - now) / (1000 * 60 * 60);
    if (hoursUntil < 48) {
        return res.status(400).json({ error: 'We need at least 48 hours notice for event orders.' });
    }

    // Store the request
    const requestId = `CAT-${Date.now().toString(36).toUpperCase()}`;
    console.log(`[Catering Request] ${requestId} | ${name} | ${phone} | ${date} | ${guests || '?'} guests | ${details}`);

    // Notify owner
    const ownerPhone = process.env.OWNER_PHONE;
    const ownerEmail = process.env.OWNER_EMAIL;

    const smsMsg = `👑 CATERING REQUEST #${requestId}\n${name} · ${phone}\nDate: ${date} · ${guests || '?'} guests\n${details.substring(0, 120)}`;

    const emailHtml = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
            <h1 style="color:#d4af37;margin:0 0 16px">👑 Catering Request</h1>
            <p style="color:#aaa;font-size:0.85rem;margin-bottom:16px">#${requestId}</p>
            <div style="background:#111;border:1px solid #d4af37;border-radius:6px;padding:16px;margin-bottom:16px">
                <p style="margin:4px 0"><strong>Name:</strong> ${name}</p>
                <p style="margin:4px 0"><strong>Phone:</strong> ${phone}</p>
                ${email ? `<p style="margin:4px 0"><strong>Email:</strong> ${email}</p>` : ''}
                <p style="margin:4px 0"><strong>Event Date:</strong> ${date}</p>
                <p style="margin:4px 0"><strong>Guests:</strong> ${guests || 'Not specified'}</p>
            </div>
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:16px">
                <p style="color:#d4af37;font-weight:bold;margin:0 0 8px">What they need:</p>
                <p style="margin:0;line-height:1.6">${details}</p>
            </div>
        </div>
    `;

    // Save to DB first — before notification so it's always captured
    try {
        db.insertCateringRequest({ id: requestId, name, phone, email, date, guests, details });
        console.log(`[Catering] Saved to DB: ${requestId}`);
    } catch(e) {
        console.error(`[Catering DB error] ${e.message}`);
    }

    // Notify owner via SMS + email
    if (ownerPhone || ownerEmail) {
        try {
            await notifyCustomerDirect(
                { customer_phone: ownerPhone, customer_email: ownerEmail, contact_pref: 'both' },
                smsMsg,
                `Catering Request #${requestId} — ${name}`,
                emailHtml
            );
        } catch(e) {
            console.error('[Catering notification error]', e.message);
        }
    }

    res.json({ success: true, requestId });
    } catch(err) {
        const fs = require('fs');
        fs.appendFileSync(path.join(__dirname, 'notifications.log'), `[${new Date().toISOString()}] [Catering ERROR] ${err.message}\n${err.stack}\n`);
        console.error('[Catering endpoint error]', err);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});


// ============================================================
// ADMIN + AUTH
// ============================================================
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

// Admin URL path — set ADMIN_PATH in .env to a secret string (e.g. /cw-x9k2m).
// Falls back to /admin if unset, but you should set it for security.
const ADMIN_PATH = (process.env.ADMIN_PATH || '/admin').replace(/\/+$/, '') || '/admin';

// ── Rate limiting for admin login ────────────────────────────────────────────
const adminLoginAttempts = new Map(); // ip -> { count, firstAttempt }
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkAdminRateLimit(ip) {
    const now = Date.now();
    const record = adminLoginAttempts.get(ip);
    if (!record) return true;
    if (now - record.firstAttempt > ADMIN_LOCKOUT_MS) {
        adminLoginAttempts.delete(ip);
        return true;
    }
    return record.count < ADMIN_MAX_ATTEMPTS;
}

function recordAdminAttempt(ip) {
    const now = Date.now();
    const record = adminLoginAttempts.get(ip);
    if (!record || now - record.firstAttempt > ADMIN_LOCKOUT_MS) {
        adminLoginAttempts.set(ip, { count: 1, firstAttempt: now });
    } else {
        record.count++;
    }
}

function clearAdminAttempts(ip) {
    adminLoginAttempts.delete(ip);
}

// ── TOTP (Google Authenticator) ──────────────────────────────────────────────
const { verifySync: totpVerify } = require('otplib');
const ADMIN_TOTP_SECRET = process.env.ADMIN_TOTP_SECRET || '';

function requireAdmin(req, res, next) {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorised' });
    const session = db.getAdminSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthorised' });
    // Touch session every request so we know the device is still active
    db.touchAdminSession(token);
    req.adminSession = session;
    req.adminUser = session.admin_user;
    next();
}

// ── HTTP Basic Auth gate for admin page ──────────────────────────────────────
const ADMIN_BASIC_USER = process.env.ADMIN_BASIC_USER || 'admin';
const ADMIN_BASIC_PASS = process.env.ADMIN_BASIC_PASS || '';

function requireBasicAuth(req, res, next) {
    // Skip basic auth if no ADMIN_BASIC_PASS is set (dev mode)
    if (!ADMIN_BASIC_PASS) return next();
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Authentication required');
    }
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [user, pass] = decoded.split(':');
    if (user === ADMIN_BASIC_USER && pass === ADMIN_BASIC_PASS) return next();
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Invalid credentials');
}

// ── Admin login ──────────────────────────────────────────────────────────────
const MAX_ADMIN_SESSIONS = 3;

app.post('/admin/login', async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    const { password, totp, deviceLabel, revokeSessionId } = req.body || {};

    if (!checkAdminRateLimit(ip)) {
        db.logLoginAttempt({ ip, attemptedUser: ADMIN_BASIC_USER, success: false,
            failureReason: 'rate_limited', userAgent });
        return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    }

    let passwordOk = false;
    if (!ADMIN_PASSWORD_HASH) {
        const plain = process.env.ADMIN_PASSWORD || 'admin';
        passwordOk = (password === plain);
    } else {
        passwordOk = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    }

    if (!passwordOk) {
        recordAdminAttempt(ip);
        db.logLoginAttempt({ ip, attemptedUser: ADMIN_BASIC_USER, success: false,
            failureReason: 'wrong_password', userAgent });
        return res.status(401).json({ error: 'Wrong password' });
    }

    // TOTP check if secret is configured
    if (ADMIN_TOTP_SECRET) {
        if (!totp) {
            return res.status(401).json({ error: 'Authenticator code required', requireTotp: true });
        }
        const result = totpVerify({ token: totp, secret: ADMIN_TOTP_SECRET });
        if (!result || !result.valid) {
            recordAdminAttempt(ip);
            db.logLoginAttempt({ ip, attemptedUser: ADMIN_BASIC_USER, success: false,
                failureReason: 'wrong_totp', userAgent });
            return res.status(401).json({ error: 'Invalid authenticator code' });
        }
    }

    // ── Session cap check ──
    // The client identifies sessions by their shortId (hash of token), not the
    // raw token, so we never leak auth tokens in 409 responses.
    if (revokeSessionId) {
        const target = db.getAdminSessionByShortId(revokeSessionId);
        if (target) db.deleteAdminSession(target.token);
    }

    // After any explicit revoke, count active sessions
    const existingSessions = db.getAllAdminSessions();
    if (existingSessions.length >= MAX_ADMIN_SESSIONS) {
        // Don't grant the session yet — return 409 with the device list so the
        // client can prompt the user to choose one to revoke.
        db.logLoginAttempt({ ip, attemptedUser: ADMIN_BASIC_USER, success: false,
            failureReason: 'session_limit_reached', userAgent });
        return res.status(409).json({
            error: 'session_limit',
            message: `Already ${existingSessions.length} active devices (max ${MAX_ADMIN_SESSIONS}). Revoke one to continue.`,
            sessions: existingSessions.map(s => ({
                id: db.shortIdForToken(s.token),     // safe to expose
                deviceLabel: s.device_label || 'Unnamed device',
                ip: s.ip,
                lastSeenAt: s.last_seen_at,
                createdAt: s.created_at
            }))
        });
    }

    clearAdminAttempts(ip);
    const token = crypto.randomBytes(32).toString('hex');
    const finalDeviceLabel = deviceLabel || (userAgent ? userAgent.substring(0, 80) : 'Unnamed device');
    db.createAdminSession({
        token,
        adminUser: ADMIN_BASIC_USER,
        deviceLabel: finalDeviceLabel,
        ip,
        userAgent
    });
    db.logLoginAttempt({ ip, attemptedUser: ADMIN_BASIC_USER, success: true,
        failureReason: null, userAgent });

    // Push notification to all OTHER active devices: "new sign-in detected"
    if (push.isConfigured()) {
        push.sendToAllAdmins({
            title: '🔐 New sign-in detected',
            body: `Device: ${finalDeviceLabel}\nIP: ${ip || 'unknown'}\n\nIf this wasn\'t you, revoke immediately in Settings.`,
            tag: 'new-login-' + Date.now(),
            requireInteraction: true,
            data: { type: 'new-login', url: '#settings' }
        }).catch(err => console.error('[Push new-login error]', err.message));
    }

    res.json({ token, expiresInDays: 30 });
});

// ── Admin logout ─────────────────────────────────────────────────────────────
app.post('/admin/logout', requireAdmin, (req, res) => {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '');
    db.deleteAdminSession(token);
    res.json({ ok: true });
});

// ── Admin sessions list (devices) ────────────────────────────────────────────
app.get('/admin/api/sessions', requireAdmin, (req, res) => {
    const currentToken = (req.headers['authorization'] || '').replace('Bearer ', '');
    const sessions = db.getAllAdminSessions().map(s => ({
        id: db.shortIdForToken(s.token),
        adminUser: s.admin_user,
        deviceLabel: s.device_label,
        ip: s.ip,
        userAgent: s.user_agent,
        createdAt: s.created_at,
        lastSeenAt: s.last_seen_at,
        expiresAt: s.expires_at,
        isCurrent: s.token === currentToken
    }));
    res.json({ sessions });
});

// ── Revoke a session by setting last_seen_at to expired ───────────────────────
app.post('/admin/api/sessions/revoke-all', requireAdmin, (req, res) => {
    const currentToken = (req.headers['authorization'] || '').replace('Bearer ', '');
    // Delete every session except the current one
    const all = db.getAllAdminSessions();
    let revoked = 0;
    for (const s of all) {
        if (s.token !== currentToken) {
            db.deleteAdminSession(s.token);
            revoked++;
        }
    }
    res.json({ ok: true, revoked });
});

// ── Recent login attempts (for security review) ──────────────────────────────
app.get('/admin/api/login-attempts', requireAdmin, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    res.json({ attempts: db.getRecentLoginAttempts(limit) });
});

// ── Admin: today's orders ────────────────────────────────────────────────────
app.get('/admin/api/orders', requireAdmin, async (req, res) => {
    res.json(await db.getTodaysOrders());
});

// ── Admin: update order status ───────────────────────────────────────────────
app.post('/admin/api/orders/:id/status', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['cooking', 'out_for_delivery', 'delivered', 'complete'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const order = await db.getOrderById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await db.updateOrderStatus(id, status);

    // Send notification BEFORE responding
    console.log(`[Status update] Order ${id.slice(-6)} → ${status} | Pref: ${order.contact_pref} | Phone: ${order.customer_phone} | Email: ${order.customer_email}`);
    try {
        await notifyStatusUpdate(order, status);
        console.log(`[Status update] Notification sent for ${id.slice(-6)}`);
    } catch(err) {
        console.error(`[Status notification error] ${err.message}`);
    }

    // Generate driver token when marking out for delivery
    let driverToken = order.driver_token || null;
    if (status === 'out_for_delivery' && !driverToken) {
        driverToken = crypto.randomBytes(16).toString('hex');
        await db.setDriverToken(id, driverToken);
    }

    const driverUrl = driverToken ? `/delivery/${id}?token=${driverToken}` : null;
    res.json({ success: true, driverUrl });
});

// ── Driver: get order details (token-authenticated) ─────────────────────────
app.get('/api/driver/order', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(401).json({ error: 'Token required' });

    const order = await db.getOrderByDriverToken(token);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Only return what the driver needs — no payment details
    res.json({
        id: order.id,
        shortId: order.id.slice(-6).toUpperCase(),
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        address: order.address,
        city: order.city,
        postcode: order.postcode,
        lat: order.lat,
        lng: order.lng,
        deliveryNotes: order.delivery_notes,
        items: JSON.parse(order.items_json),
        status: order.status,
        orderType: order.order_type
    });
});

// ── Driver: confirm delivery (token-authenticated) ──────────────────────────
app.post('/api/driver/confirm', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(401).json({ error: 'Token required' });

    const order = await db.getOrderByDriverToken(token);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status !== 'out_for_delivery') {
        return res.status(400).json({ error: 'Order is not out for delivery' });
    }

    await db.updateOrderStatus(order.id, 'delivered');
    await notifyStatusUpdate(order, 'delivered');

    res.json({ success: true });
});

// ── Driver: send ETA to customer (token-authenticated) ──────────────────────
app.post('/api/driver/eta', async (req, res) => {
    const { token, eta, arrived } = req.body;
    if (!token) return res.status(401).json({ error: 'Token required' });

    const order = await db.getOrderByDriverToken(token);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const name = order.customer_name;
    let smsMsg, emailSubject, emailHtml;

    if (arrived) {
        // Driver has arrived
        smsMsg = `Charlie's Wingz: Hi ${name}! 📍 Your driver is outside now. Please come to the door to collect your order. 👑`;
        emailSubject = `Your driver is here! 📍`;
        emailHtml = `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                <h1 style="color:#d4af37;margin:0 0 24px">📍 Your Driver Has Arrived</h1>
                <p>Hi ${name},</p>
                <p>Your driver is <strong style="color:#d4af37">outside now</strong>. Please come to the door to collect your order.</p>
                <p style="font-size:0.85rem;color:#aaa;margin-top:16px">If we can't reach you within 5 minutes, your order will be left in a safe place at your door.</p>
                <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
            </div>
        `;
    } else {
        // ETA update
        if (!eta) return res.status(400).json({ error: 'ETA is required' });
        smsMsg = `Charlie's Wingz: Hi ${name}! Your driver is about ${eta} away. 👑`;
        emailSubject = `Your order is ${eta} away!`;
        emailHtml = `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                <h1 style="color:#d4af37;margin:0 0 24px">🕐 Driver Update</h1>
                <p>Hi ${name},</p>
                <p>Your driver is approximately <strong style="color:#d4af37">${eta}</strong> away.</p>
                <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
            </div>
        `;
    }

    await notifyCustomerDirect(order, smsMsg, emailSubject, emailHtml);

    console.log(`[Driver ETA] Order ${order.id.slice(-6)} — ${eta}`);
    res.json({ success: true });
});

// ── Driver page ─────────────────────────────────────────────────────────────
app.get('/delivery/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'driver.html'));
});

// ── Admin: pause/resume orders ───────────────────────────────────────────────
app.post('/admin/api/pause', requireAdmin, (req, res) => {
    ordersPaused = !ordersPaused;
    console.log(`[Admin] Orders ${ordersPaused ? 'PAUSED' : 'RESUMED'}`);
    res.json({ paused: ordersPaused });
});

app.get('/admin/api/pause-status', requireAdmin, (req, res) => {
    res.json({ paused: ordersPaused });
});

// ── Admin: stream config ────────────────────────────────────────────────────
app.get('/admin/api/stream', requireAdmin, (req, res) => {
    res.json(db.getStreamConfig());
});

app.post('/admin/api/stream', requireAdmin, (req, res) => {
    try {
        const { isLive, streamUrl, streamTitle, nextStreamAt, discountCode, codeDescription, replayUrl } = req.body;
        const config = db.saveStreamConfig({ isLive, streamUrl, streamTitle, nextStreamAt, discountCode, codeDescription, replayUrl });
        res.json(config);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Admin: Push notifications ───────────────────────────────────────────────

// Public endpoint — gives the admin client the VAPID public key it needs to subscribe.
// Safe to expose: this is the public half of the keypair, designed to be shared.
app.get('/admin/api/push/public-key', requireAdmin, (req, res) => {
    if (!push.isConfigured()) {
        return res.status(503).json({ error: 'Push notifications not configured on server' });
    }
    res.json({ publicKey: push.getPublicKey() });
});

// Register a push subscription for this device
app.post('/admin/api/push/subscribe', requireAdmin, (req, res) => {
    const { subscription, deviceLabel } = req.body || {};
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: 'Invalid subscription payload' });
    }
    try {
        const adminUser = req.adminUser || (req.session && req.session.adminUser) || 'admin';
        db.savePushSub({
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            deviceLabel: deviceLabel || null,
            adminUser
        });
        res.json({ ok: true });
    } catch (e) {
        console.error('[PUSH] Subscribe error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Unsubscribe a device by endpoint (called when user disables notifications in app)
app.post('/admin/api/push/unsubscribe', requireAdmin, (req, res) => {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    db.deletePushSub(endpoint);
    res.json({ ok: true });
});

// List registered devices (for the admin device-management UI)
app.get('/admin/api/push/devices', requireAdmin, (req, res) => {
    const subs = db.getAllPushSubs().map(s => ({
        id: s.id,
        deviceLabel: s.device_label,
        adminUser: s.admin_user,
        createdAt: s.created_at,
        lastUsedAt: s.last_used_at
    }));
    res.json({ devices: subs });
});

// Remove a specific device (admin can revoke a phone/tablet)
app.delete('/admin/api/push/devices/:id', requireAdmin, (req, res) => {
    db.deletePushSubById(parseInt(req.params.id, 10));
    res.json({ ok: true });
});

// Send a test notification to all registered devices
app.post('/admin/api/push/test', requireAdmin, async (req, res) => {
    if (!push.isConfigured()) {
        return res.status(503).json({ error: 'Push notifications not configured. Set VAPID_PUBLIC and VAPID_PRIVATE in .env.' });
    }
    const result = await push.sendTest();
    res.json({ ok: true, ...result });
});

// ── Admin: Quick Sign-in (WebAuthn / passkeys) ──────────────────────────────
//
// REGISTRATION (must be authenticated via password+TOTP first):
//   POST /admin/api/webauthn/register/start  → returns options + challenge
//   POST /admin/api/webauthn/register/finish → verifies, stores credential
//
// AUTHENTICATION (no password required — biometric IS the auth):
//   POST /admin/webauthn/auth/start          → returns options + challenge
//   POST /admin/webauthn/auth/finish         → verifies, returns session token
//
// All credentials are paired to a single admin user (ADMIN_BASIC_USER from .env).

app.post('/admin/api/webauthn/register/start', requireAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser || ADMIN_BASIC_USER;
        const options = await webauthn.startRegistration(adminUser);
        res.json(options);
    } catch (e) {
        console.error('[WebAuthn] register/start error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/admin/api/webauthn/register/finish', requireAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser || ADMIN_BASIC_USER;
        const { response, deviceLabel } = req.body || {};
        if (!response) return res.status(400).json({ error: 'Missing WebAuthn response' });
        const result = await webauthn.finishRegistration({
            adminUser,
            response,
            deviceLabel: deviceLabel || (req.headers['user-agent'] || '').substring(0, 80)
        });
        res.json(result);
    } catch (e) {
        console.error('[WebAuthn] register/finish error:', e.message);
        res.status(400).json({ error: e.message });
    }
});

// Authentication start — no auth required (this IS the auth)
// Use IP+UA as the challenge key so a single device can't be MITM'd
app.post('/admin/webauthn/auth/start', async (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        // Rate limit just in case
        if (!checkAdminRateLimit(ip)) {
            return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
        }
        const authKey = ip + '|' + (req.headers['user-agent'] || '').substring(0, 50);
        const options = await webauthn.startAuthentication(authKey);
        // Return authKey to client so they can echo it on finish (avoids needing
        // sticky sessions; client just passes it back). Authkey is non-secret
        // because the challenge is what actually verifies the ceremony.
        res.json({ ...options, authKey });
    } catch (e) {
        console.error('[WebAuthn] auth/start error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/admin/webauthn/auth/finish', async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    try {
        const { response, authKey, deviceLabel: clientDeviceLabel, revokeSessionId } = req.body || {};
        if (!response || !authKey) {
            return res.status(400).json({ error: 'Missing response or authKey' });
        }
        const result = await webauthn.finishAuthentication({ authKey, response });

        // If client supplied revokeSessionId, free up a slot first
        if (revokeSessionId) {
            const target = db.getAdminSessionByShortId(revokeSessionId);
            if (target) db.deleteAdminSession(target.token);
        }

        // Auth succeeded — now create a session, applying the same cap rules as password login.
        const existingSessions = db.getAllAdminSessions();
        if (existingSessions.length >= MAX_ADMIN_SESSIONS) {
            return res.status(409).json({
                error: 'session_limit',
                message: `Already ${existingSessions.length} active devices (max ${MAX_ADMIN_SESSIONS}). Revoke one to continue.`,
                sessions: existingSessions.map(s => ({
                    id: db.shortIdForToken(s.token),
                    deviceLabel: s.device_label || 'Unnamed device',
                    ip: s.ip,
                    lastSeenAt: s.last_seen_at,
                    createdAt: s.created_at
                }))
            });
        }

        const token = crypto.randomBytes(32).toString('hex');
        // Use the credential's stored device label, falling back to client-provided
        const finalDeviceLabel = result.deviceLabel || clientDeviceLabel ||
            (userAgent ? userAgent.substring(0, 80) : 'Quick sign-in device');
        db.createAdminSession({
            token,
            adminUser: result.adminUser,
            deviceLabel: finalDeviceLabel,
            ip,
            userAgent
        });
        clearAdminAttempts(ip);
        db.logLoginAttempt({
            ip,
            attemptedUser: result.adminUser,
            success: true,
            failureReason: null,
            userAgent: userAgent + ' [biometric]'
        });

        // Push to all OTHER active sessions
        if (push.isConfigured()) {
            push.sendToAllAdmins({
                title: '🔐 New sign-in detected',
                body: `Biometric sign-in: ${finalDeviceLabel}\nIP: ${ip}\n\nIf this wasn\'t you, revoke immediately in Settings.`,
                tag: 'new-login-' + Date.now(),
                requireInteraction: true,
                data: { type: 'new-login', url: '#settings' }
            }).catch(err => console.error('[Push new-login error]', err.message));
        }

        res.json({ token, expiresInDays: 30, deviceLabel: finalDeviceLabel });
    } catch (e) {
        recordAdminAttempt(ip);
        db.logLoginAttempt({
            ip,
            attemptedUser: 'webauthn',
            success: false,
            failureReason: 'webauthn_failed: ' + e.message,
            userAgent
        });
        console.error('[WebAuthn] auth/finish error:', e.message);
        res.status(401).json({ error: e.message });
    }
});

// List paired devices for the current user (used by Settings modal)
app.get('/admin/api/webauthn/credentials', requireAdmin, (req, res) => {
    const adminUser = req.adminUser || ADMIN_BASIC_USER;
    res.json({ credentials: webauthn.listCredentialsForUser(adminUser) });
});

// Rename a paired device
app.patch('/admin/api/webauthn/credentials/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { deviceLabel } = req.body || {};
    if (!deviceLabel || !deviceLabel.trim()) {
        return res.status(400).json({ error: 'Label required' });
    }
    const cred = db.getAdminCredentialById(id);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    if (cred.admin_user !== (req.adminUser || ADMIN_BASIC_USER)) {
        return res.status(403).json({ error: 'Not your credential' });
    }
    db.updateCredentialLabel(id, deviceLabel.trim());
    res.json({ ok: true });
});

// Revoke a paired device (removes its passkey — that device must re-pair to use Quick Sign-in)
app.delete('/admin/api/webauthn/credentials/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const cred = db.getAdminCredentialById(id);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    if (cred.admin_user !== (req.adminUser || ADMIN_BASIC_USER)) {
        return res.status(403).json({ error: 'Not your credential' });
    }
    db.deleteAdminCredential(id);
    res.json({ ok: true });
});

// Quick check whether ANY passkeys are registered (used by login page to show
// the "Use Quick Sign-in" button only if there's a chance it'll work).
app.get('/admin/webauthn/has-credentials', (req, res) => {
    const total = db.getAllAdminCredentials().length;
    res.json({ hasCredentials: total > 0 });
});

// ── Admin: refund (full or partial) ─────────────────────────────────────────
app.post('/admin/api/orders/:id/refund', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { amountPence } = req.body; // if omitted, full refund

    const order = await db.getOrderById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Stripe refunds only — manual orders (cash, bank transfer, etc) cannot be
    // refunded through Stripe. The admin must hand cash back / refund bank manually.
    // We still let the admin "mark as refunded" via a separate endpoint to track it.
    if (!order.payment_intent_id || order.payment_intent_id === 'manual' || order.payment_method !== 'stripe') {
        return res.status(400).json({
            error: 'not_stripe_order',
            message: `This is a ${order.payment_method || 'manual'} order. Stripe refund not applicable. Use "Mark as refunded" to record it.`
        });
    }

    const refundAmount = amountPence ? parseInt(amountPence) : order.total_pence;
    if (refundAmount <= 0 || refundAmount > order.total_pence) {
        return res.status(400).json({ error: `Invalid refund amount. Order total is £${(order.total_pence / 100).toFixed(2)}` });
    }

    try {
        const refund = await stripe.refunds.create({
            payment_intent: order.payment_intent_id,
            amount: refundAmount,
            reason: 'requested_by_customer'
        });

        console.log(`[Refund] Order ${id.slice(-6)} — £${(refundAmount / 100).toFixed(2)} — ${refund.status}`);

        res.json({
            success: true,
            refundId: refund.id,
            amount: refundAmount,
            status: refund.status
        });
    } catch (error) {
        console.error('[Refund error]', error.message);
        const msg = error.message || 'Refund failed — check Stripe dashboard';
        res.status(400).json({ error: msg });
    }
});

// ── Admin: send ETA to customer ─────────────────────────────────────────────
app.post('/admin/api/orders/:id/eta', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { eta } = req.body; // e.g. "15 minutes", "8:45pm"

    if (!eta) return res.status(400).json({ error: 'ETA is required' });

    const order = await db.getOrderById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const name = order.customer_name;
    const smsMsg = `Charlie's Wingz: Hi ${name}! Your order will be with you in approximately ${eta}. 👑`;
    const emailSubject = `Your order is on its way — ETA ${eta}`;
    const emailHtml = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
            <h1 style="color:#d4af37;margin:0 0 24px">🕐 Estimated Arrival</h1>
            <p>Hi ${name},</p>
            <p>Your order will be with you in approximately <strong style="color:#d4af37">${eta}</strong>.</p>
            <p>Thank you for your patience!</p>
            <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
        </div>
    `;

    const pref = order.contact_pref || 'sms';
    await notifyCustomerDirect(order, smsMsg, emailSubject, emailHtml);

    console.log(`[ETA] Order ${id.slice(-6)} — ${eta} sent via ${pref}`);
    res.json({ success: true });
});

// ── Admin: catering requests ─────────────────────────────────────────────────
app.get('/admin/api/catering', requireAdmin, async (req, res) => {
    res.json(await db.getAllCateringRequests());
});

// ── Admin: get kitchen display URL ──────────────────────────────────────────
app.get('/admin/api/kitchen-url', requireAdmin, (req, res) => {
    const token = process.env.KITCHEN_TOKEN;
    if (!token) return res.json({ url: null, error: 'KITCHEN_TOKEN not set in .env' });
    res.json({ url: `https://order.charlieswingz.com/kitchen?token=${token}` });
});

// ── Admin: delete order ─────────────────────────────────────────────────────
app.delete('/admin/api/orders/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const order = db.getOrderById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    db.deleteOrder(id);
    console.log(`[Admin] Deleted order ${id.slice(-6)}`);
    res.json({ success: true });
});

// ── Admin: manual order (e.g. for friends, phone orders without payment) ────
// ── Admin: Manual order entry (WhatsApp / walk-in / phone) ──────────────────
//
// Orders created here:
//   - Get a prefixed ID matching their source (WA-, WI-, PH-, MAN-)
//   - Start with payment_status=pending unless explicitly marked paid
//   - Validate items against the MENU (no free-text — it's a wing shop)
//   - Auto-link to a customer record (creates if doesn't exist by phone/email)
//   - Do NOT auto-award stamps — admin awards manually via separate endpoint
app.post('/admin/api/orders/manual', requireAdmin, async (req, res) => {
    const {
        name, phone, email, orderType, items, notes,
        deliveryAddress, deliveryNotes, postcode,
        source, paymentStatus, paymentMethod, totalOverride
    } = req.body || {};

    if (!name || !name.trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'At least one item is required' });
    }
    if (!phone && !email) {
        return res.status(400).json({ error: 'Either phone or email is required to log a manual order' });
    }

    // Validate every item against MENU — no free-text allowed
    const validatedItems = [];
    let computedTotal = 0;
    for (const item of items) {
        if (!item.id) return res.status(400).json({ error: 'Each item must have an id' });
        // Find item in MENU by id across all categories
        let menuItem = null;
        for (const cat of Object.values(MENU)) {
            if (cat[item.id]) { menuItem = cat[item.id]; break; }
        }
        if (!menuItem) {
            return res.status(400).json({ error: `Unknown menu item: ${item.id}` });
        }
        const qty = parseInt(item.quantity, 10) || 1;
        if (qty < 1 || qty > 50) {
            return res.status(400).json({ error: `Invalid quantity for ${menuItem.name}` });
        }
        // Cut upcharge (matches checkout logic)
        const boneless = !!item.boneless && ['Wings', 'Meals', 'Bundles'].includes(menuItem.category);
        const cutUpcharge = (menuItem.wingCount && item.wingCut && item.wingCut !== 'Mixed' && !boneless)
            ? (CUT_UPCHARGE[menuItem.wingCount]?.[item.wingCut] || 0)
            : 0;
        // Loaded fries upgrade
        const loadedUpgrade = (item.loadedUpgrade && menuItem.includes && menuItem.includes.toLowerCase().includes('fries'))
            ? LOADED_UPGRADE_PRICE * (menuItem.includes.match(/(\d+)\s*fries/) ? parseInt(menuItem.includes.match(/(\d+)\s*fries/)[1], 10) : 1)
            : 0;
        const linePrice = (menuItem.price + cutUpcharge + loadedUpgrade) * qty;
        computedTotal += linePrice;
        validatedItems.push({
            id: item.id,
            name: menuItem.name,
            price: menuItem.price + cutUpcharge + loadedUpgrade,
            quantity: qty,
            wingCut: item.wingCut || (menuItem.wingCount ? 'Mixed' : null),
            boneless: !!boneless,
            loadedUpgrade: !!item.loadedUpgrade,
            flavourChoice: item.flavourChoice || null,
            sauce: item.sauce || null,
            drinkChoice: item.drinkChoice || null
        });
    }

    // Compute prefix and ID
    const sourcePrefix = {
        whatsapp: 'WA-',
        walkin:   'WI-',
        phone:    'PH-',
        manual:   'MAN-'
    };
    const cleanSource = source && sourcePrefix[source] ? source : 'manual';
    const prefix = sourcePrefix[cleanSource];
    const orderId = prefix + Date.now().toString(36).toUpperCase();

    // Validated payment status
    const cleanPaymentStatus = ['paid', 'pending', 'refunded'].includes(paymentStatus)
        ? paymentStatus
        : 'pending';
    const cleanPaymentMethod = ['stripe', 'cash', 'bank_transfer', 'manual'].includes(paymentMethod)
        ? paymentMethod
        : 'manual';

    // Auto-link to / create a customer record
    let customer = null;
    try {
        customer = db.findCustomer({ phone, email });
        if (!customer) {
            customer = db.createCustomer({
                phone: phone || null,
                email: email || null,
                name,
                postcode: postcode || null,
                source: cleanSource === 'manual' ? 'manual' : cleanSource,
                hasAccount: false
            });
        }
    } catch (e) {
        // If duplicate-phone / duplicate-email error — try to look up the conflicting record
        if (e.code === 'DUPLICATE_PHONE' || e.code === 'DUPLICATE_EMAIL') {
            // shouldn't happen since we check findCustomer first, but handle anyway
            customer = db.getCustomerByPhone(phone) || db.getCustomerByEmail(email);
        } else {
            console.error('[Manual Order] Customer link failed:', e.message);
        }
    }

    // Use admin-provided total if given (lets admin do quick custom pricing for edge cases)
    const finalTotal = (totalOverride && Number.isInteger(totalOverride) && totalOverride > 0)
        ? totalOverride
        : computedTotal;

    db.insertOrder({
        id: orderId,
        paymentIntentId: 'manual',
        customerName: name,
        customerEmail: email || null,
        customerPhone: phone ? db.normalisePhone(phone) : null,
        orderType: orderType === 'delivery' ? 'delivery' : 'collection',
        contactPref: phone ? 'sms' : (email ? 'email' : 'sms'),
        itemsJson: JSON.stringify(validatedItems),
        totalPence: finalTotal,
        address: deliveryAddress || null,
        city: null,
        postcode: postcode ? String(postcode).toUpperCase().replace(/\s+/g, ' ').trim() : null,
        lat: null,
        lng: null,
        deliveryNotes: deliveryNotes || null,
        orderNotes: notes || null,
        status: cleanPaymentStatus === 'paid' ? 'received' : 'pending_payment',
        paymentStatus: cleanPaymentStatus,
        paymentMethod: cleanPaymentMethod,
        source: cleanSource,
        customerId: customer ? customer.id : null
    });

    // Update customer's last_order link
    if (customer) {
        db.setLastOrder(customer.id, orderId);
    }

    console.log(`[Admin] Manual order ${orderId} (${cleanSource}) created for ${name} — £${(finalTotal/100).toFixed(2)} — ${cleanPaymentStatus}`);

    // Push notification only fires when status moves to 'received' (i.e. when paid)
    // Pending-payment manual orders don't notify the kitchen yet.
    if (cleanPaymentStatus === 'paid' && push.isConfigured()) {
        push.sendToAllAdmins(push.buildNewOrderPayload({
            id: orderId,
            customer_name: name,
            customer_phone: phone,
            order_type: orderType === 'delivery' ? 'delivery' : 'collection',
            postcode: postcode || '',
            total_pence: finalTotal
        }, validatedItems)).catch(err => console.error('[Push manual order error]', err.message));
    }

    res.json({
        success: true,
        orderId,
        customerId: customer ? customer.id : null,
        totalPence: finalTotal,
        paymentStatus: cleanPaymentStatus,
        paymentMethod: cleanPaymentMethod,
        source: cleanSource,
        warning: finalTotal < 2500 ? 'Order is under £25 — stamps cannot be awarded for orders under £25' : null
    });
});

// ── Admin: mark a pending-payment order as paid ──────────────────────────────
app.post('/admin/api/orders/:id/mark-paid', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { paymentMethod } = req.body || {};
    const order = await db.getOrderById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status === 'paid') {
        return res.status(400).json({ error: 'Order is already marked paid' });
    }
    const cleanMethod = ['stripe', 'cash', 'bank_transfer', 'manual'].includes(paymentMethod)
        ? paymentMethod
        : (order.payment_method || 'manual');

    db.updateOrderPaymentStatus(id, 'paid', cleanMethod);
    // Also bump status from pending_payment → received (kitchen can now see it)
    if (order.status === 'pending_payment') {
        db.updateOrderStatus(id, 'received');
    }

    // Now trigger the new-order push (it was held back until paid)
    if (push.isConfigured()) {
        const items = JSON.parse(order.items_json || '[]');
        push.sendToAllAdmins(push.buildNewOrderPayload({
            id: order.id,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            order_type: order.order_type,
            postcode: order.postcode,
            total_pence: order.total_pence
        }, items)).catch(err => console.error('[Push mark-paid error]', err.message));
    }

    res.json({ success: true });
});

// ── Admin: mark a non-Stripe order as refunded (no money movement) ──────────
// Used for cash / bank transfer / manual orders where the admin has handled
// the refund out-of-band (e.g. given cash back). Just flips the flag for
// record-keeping.
app.post('/admin/api/orders/:id/mark-refunded', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const order = await db.getOrderById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_method === 'stripe') {
        return res.status(400).json({
            error: 'use_stripe_refund',
            message: 'This is a Stripe order — use the Refund button to issue an actual refund.'
        });
    }
    if (order.payment_status === 'refunded') {
        return res.status(400).json({ error: 'Order is already marked refunded' });
    }
    db.updateOrderPaymentStatus(id, 'refunded', order.payment_method || 'manual');
    console.log(`[MarkRefunded] Order ${id} flagged refunded (${order.payment_method})`);
    res.json({ success: true });
});

// ── Admin: nuke test data ───────────────────────────────────────────────────
// Wipes all orders, customers, optins, login attempts, stamp logs, lottery,
// catering requests. Keeps: admin sessions, push subscriptions, admin
// credentials, settings. Requires confirmation token to prevent accidents.
//
// USE ONCE BEFORE LAUNCH. Returns the counts of what was deleted.
app.post('/admin/api/nuke-test-data', requireAdmin, (req, res) => {
    const { confirm } = req.body || {};
    if (confirm !== 'YES_DELETE_EVERYTHING') {
        return res.status(400).json({
            error: 'confirmation_required',
            message: 'Send {"confirm":"YES_DELETE_EVERYTHING"} to proceed. This is irreversible.'
        });
    }
    const counts = db.nukeTestData();
    console.log('[NukeTestData] Wiped:', JSON.stringify(counts));
    res.json({ success: true, deleted: counts });
});

// ── Admin: customer CRUD ────────────────────────────────────────────────────

app.get('/admin/api/customers', requireAdmin, (req, res) => {
    const { q } = req.query;
    if (q) {
        return res.json({ customers: db.searchCustomers(q) });
    }
    res.json({ customers: db.getAllCustomers() });
});

app.get('/admin/api/customers/:id', requireAdmin, (req, res) => {
    const customer = db.getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({
        customer,
        stampLog: db.getStampLog(customer.id)
    });
});

app.post('/admin/api/customers', requireAdmin, (req, res) => {
    const { phone, email, name, postcode, notes, source } = req.body || {};
    try {
        const customer = db.createCustomer({
            phone, email, name, postcode, notes,
            source: source || 'manual',
            hasAccount: false
        });
        res.json({ success: true, customer });
    } catch (e) {
        if (e.code === 'DUPLICATE_PHONE' || e.code === 'DUPLICATE_EMAIL') {
            return res.status(409).json({ error: e.message, code: e.code });
        }
        res.status(400).json({ error: e.message });
    }
});

app.patch('/admin/api/customers/:id', requireAdmin, (req, res) => {
    const { phone, email, name, postcode, notes, source } = req.body || {};
    try {
        const customer = db.updateCustomer(req.params.id, {
            phone, email, name, postcode, notes, source
        });
        res.json({ success: true, customer });
    } catch (e) {
        if (e.code === 'DUPLICATE_PHONE' || e.code === 'DUPLICATE_EMAIL') {
            return res.status(409).json({ error: e.message, code: e.code });
        }
        if (e.message === 'Customer not found') {
            return res.status(404).json({ error: e.message });
        }
        res.status(400).json({ error: e.message });
    }
});

app.delete('/admin/api/customers/:id', requireAdmin, (req, res) => {
    const customer = db.getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    db.deleteCustomer(req.params.id);
    res.json({ success: true });
});

// Adjust stamps manually with reason. Enforces £25 minimum on positive adjustments
// when linked to an order, unless explicitly overridden.
app.post('/admin/api/customers/:id/stamps', requireAdmin, (req, res) => {
    const { delta, reason, override } = req.body || {};
    const d = parseInt(delta, 10);
    if (!Number.isFinite(d) || d === 0) {
        return res.status(400).json({ error: 'delta must be a non-zero integer' });
    }
    if (Math.abs(d) > 10) {
        return res.status(400).json({ error: 'delta cannot exceed ±10 in a single adjustment' });
    }
    const customer = db.getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    // For positive stamp awards, check the customer's last order was £25+
    // (web orders enforce this at checkout; manual orders need this safeguard)
    if (d > 0 && !override && customer.last_order_id) {
        const lastOrder = db.getOrderById(customer.last_order_id);
        if (lastOrder && lastOrder.total_pence < 2500) {
            return res.status(400).json({
                error: 'last_order_under_25',
                message: `Customer's last order was £${(lastOrder.total_pence/100).toFixed(2)} — under £25 minimum for stamps. Pass override:true to bypass.`,
                lastOrderTotal: lastOrder.total_pence
            });
        }
    }

    try {
        const result = db.adjustStamps(customer.id, d, reason || null, req.adminUser || 'admin');
        res.json({
            success: true,
            customer: result.customer,
            reward: result.reward
        });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Merge two customers — primary keeps id, secondary's data folds in then secondary deleted
app.post('/admin/api/customers/merge', requireAdmin, (req, res) => {
    const { primaryId, secondaryId } = req.body || {};
    if (!primaryId || !secondaryId) {
        return res.status(400).json({ error: 'primaryId and secondaryId required' });
    }
    if (primaryId === secondaryId) {
        return res.status(400).json({ error: 'Cannot merge a customer with itself' });
    }
    try {
        const merged = db.mergeCustomers(primaryId, secondaryId);
        res.json({ success: true, customer: merged });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ── Customer lookup by phone (for WhatsApp bot integration later) ────────────
// Authenticated via admin token. Returns customer + last order summary.
app.get('/admin/api/customer-lookup/:phone', requireAdmin, (req, res) => {
    const customer = db.getCustomerByPhone(req.params.phone);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const lastOrder = customer.last_order_id ? db.getOrderById(customer.last_order_id) : null;
    res.json({
        customer,
        lastOrder: lastOrder ? {
            id: lastOrder.id,
            total: lastOrder.total_pence,
            status: lastOrder.status,
            paymentStatus: lastOrder.payment_status,
            createdAt: lastOrder.created_at,
            items: JSON.parse(lastOrder.items_json || '[]')
        } : null
    });
});

// ── Public: check-phone (no auth, used during signup for "claim account") ───
// Returns whether a customer with this phone exists. Doesn't leak any other
// info — just yes/no — so it's safe to expose unauthenticated.
app.post('/api/check-phone', (req, res) => {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const customer = db.getCustomerByPhone(phone);
    if (!customer) return res.json({ exists: false });
    // Return ONLY whether it exists + whether it has an account, NOT name/email/etc
    res.json({
        exists: true,
        hasAccount: !!customer.has_account,
        // Tell client roughly when so user can confirm "yes that's me"
        // (e.g. "you ordered with us in March 2026")
        lastOrderMonth: customer.last_order_at
            ? new Date(customer.last_order_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
            : null
    });
});

// ── Admin: catering route is below ──────────────────────────────────────────
app.post('/admin/api/catering/:id/status', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['pending', 'contacted', 'complete'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = db.updateCateringStatus(id, status);
    if (!result) return res.status(404).json({ error: 'Request not found' });
    res.json({ success: true });
});

app.delete('/admin/api/catering/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const result = db.deleteCateringRequest(id);
    if (!result) return res.status(404).json({ error: 'Request not found' });
    res.json({ success: true });
});

// ── Admin: order history (all orders, filterable) ───────────────────────────
app.get('/admin/api/orders/history', requireAdmin, async (req, res) => {
    const all = await db.getAllOrders();
    const { from, to, search } = req.query;
    let filtered = all;
    if (from) filtered = filtered.filter(o => o.created_at >= from);
    if (to) filtered = filtered.filter(o => o.created_at <= to + 'T23:59:59');
    if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(o =>
            (o.customer_name || '').toLowerCase().includes(s) ||
            (o.customer_email || '').toLowerCase().includes(s) ||
            (o.customer_phone || '').includes(s) ||
            (o.id || '').toLowerCase().includes(s) ||
            (o.postcode || '').toLowerCase().includes(s)
        );
    }
    res.json(filtered);
});

// ── Admin: opt-ins list ──────────────────────────────────────────────────────
app.get('/admin/api/optins', requireAdmin, async (req, res) => {
    res.json(await db.getAllOptins());
});

app.delete('/admin/api/optins/:identifier', requireAdmin, (req, res) => {
    const { identifier } = req.params;
    const result = db.deleteOptin(identifier);
    if (!result) return res.status(404).json({ error: 'Opt-in not found' });
    res.json({ success: true });
});

// ── Admin: export today's orders as CSV ──────────────────────────────────────
app.get('/admin/api/export', requireAdmin, async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const all = await db.getAllOrders();
    const orders = all.filter(o => o.created_at.slice(0, 10) === date);

    const rows = [['Order ID', 'Time', 'Customer', 'Phone', 'Email', 'Type', 'Items', 'Total', 'Status']];
    orders.forEach(o => {
        const items = JSON.parse(o.items_json).map(i => {
            const flav = Array.isArray(i.flavourChoice) ? i.flavourChoice.join('/') : (i.flavourChoice || '');
            return `${i.quantity}x ${i.name}${flav ? ' ' + flav : ''}`;
        }).join(' | ');
        const time = new Date(o.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
        rows.push([
            o.id.slice(-6).toUpperCase(),
            time,
            o.customer_name,
            o.customer_phone,
            o.customer_email,
            o.order_type,
            items,
            `£${(o.total_pence / 100).toFixed(2)}`,
            o.status
        ]);
    });

    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""')+'"').join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="charlies_wingz_${date}.csv"`);
    res.send(csv);
});

// ── Admin: lottery stats ─────────────────────────────────────────────────────
app.get('/admin/api/lottery', requireAdmin, (req, res) => {
    const count = db.getLotteryCount();
    const nextWin = 10 - (count % 10);
    res.json({ totalOrders: count, nextWinIn: nextWin, nextWinnerAt: count + nextWin });
});

// ── Admin: customer lookup ───────────────────────────────────────────────────
app.get('/admin/api/customers', requireAdmin, (req, res) => {
    const { search } = req.query;
    let players = db.getAllGamePlayers();
    if (search) {
        const s = search.toLowerCase();
        players = players.filter(p =>
            (p.name || '').toLowerCase().includes(s) ||
            (p.email || '').toLowerCase().includes(s) ||
            (p.profile?.phone || '').includes(s)
        );
    }
    res.json(players.map(p => ({
        id: p.email, name: p.name, email: p.email,
        phone: p.profile?.phone || '',
        address: p.profile?.address || '',
        postcode: p.profile?.postcode || '',
        stamps: p.loyaltyStamps || p.loyalty_stamps || 0,
        totalOrders: p.loyaltyTotalOrders || p.loyalty_total_orders || 0,
        coins: p.coins || 0,
        created_at: p.created_at
    })));
});

// ── Admin: reset customer password ───────────────────────────────────────────
app.post('/admin/api/customers/:email/reset-password', requireAdmin, async (req, res) => {
    const { email } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const player = getPlayer(email.toLowerCase());
    if (!player) return res.status(404).json({ error: 'Customer not found' });
    const hashed = await bcrypt.hash(newPassword, 10);
    db.updateGamePassword(email.toLowerCase(), hashed);
    console.log(`[ADMIN] Password reset for ${email}`);
    res.json({ success: true });
});

// ── Admin page ───────────────────────────────────────────────────────────────
// Served at the path configured by ADMIN_PATH in .env (defaults to /admin).
// Set ADMIN_PATH to a secret string like "/cw-x9k2m" so attackers can't even
// find your admin login page. The API endpoints stay under /admin/api regardless.
function adminPageHandler(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
}
app.get(ADMIN_PATH, requireBasicAuth, adminPageHandler);
// If ADMIN_PATH is something other than /admin, also bind /admin to a 404
// to avoid leaking that the admin app exists on the default path.
if (ADMIN_PATH !== '/admin') {
    app.get('/admin', (req, res) => res.status(404).send('Not found'));
}

// ── Phone order payment link generator ───────────────────────────────────────
app.post('/admin/api/paylink', requireAdmin, async (req, res) => {
    const { name, phone, notes, lineItems, total } = req.body;

    if (!lineItems || !lineItems.length) {
        return res.status(400).json({ error: 'No items provided' });
    }

    try {
        // Build Stripe Checkout line items
        const stripeLineItems = lineItems.map(i => ({
            price_data: {
                currency: 'gbp',
                product_data: { name: i.name },
                unit_amount: Number(i.basePriceMoney.amount)
            },
            quantity: Number(i.quantity)
        }));

        const orderId = generateIdempotencyKey();

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: stripeLineItems,
            mode: 'payment',
            success_url: 'https://order.charlieswingz.com/?phone_paid=1',
            cancel_url: 'https://order.charlieswingz.com/?phone_cancelled=1',
            customer_email: undefined,
            metadata: {
                order_id: orderId,
                customer_name: name,
                customer_phone: phone || '',
                order_type: 'phone'
            }
        });

        // Save to DB as a phone order
        await db.insertOrder({
            id: orderId,
            paymentIntentId: session.payment_intent || null,
            customerName: name,
            customerEmail: '',
            customerPhone: phone || '',
            orderType: 'phone',
            contactPref: 'sms',
            itemsJson: JSON.stringify(lineItems.map(i => ({ name: i.name, quantity: i.quantity, price: Number(i.basePriceMoney.amount) }))),
            totalPence: total
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('[PayLink error]', error);
        res.status(500).json({ error: error.message || 'Failed to create payment link' });
    }
});

// ── Allergen page ─────────────────────────────────────────────────────────────
app.get('/allergens', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'allergens.html'));
});

app.get('/play-win', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'play-win.html'));
});

app.get('/snake', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'snake.html'));
});

app.get('/wing-run', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'wing-run.html'));
});

app.get('/platformer', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'platformer.html'));
});

app.get('/shooter', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'shooter.html'));
});

app.get('/chicken-shop', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'chicken-shop', 'index.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/live', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'live.html'));
});

// ── Snake Game API ───────────────────────────────────────────────────────────
const WING_SHOP = [
    { id: 'pop',     name: 'Free Can of Pop', points: 80000,   amountPence: 80,   type: 'fixed'   },
    { id: 'side',    name: 'Free Side',        points: 200000,  amountPence: 250,  type: 'fixed'   },
    { id: 'three',   name: '£3 Off',           points: 300000,  amountPence: 300,  type: 'fixed'   },
    { id: 'ten',     name: '10% Off',          points: 400000,  percent: 10,       type: 'percent' },
    { id: 'wings6',  name: 'Free 6 Wings',     points: 750000,  amountPence: 850,  type: 'fixed'   },
    { id: 'twenty',  name: '20% Off',          points: 1000000, percent: 20,       type: 'percent' },
    { id: 'wings20', name: 'Free 20 Wings',    points: 10000000,amountPence: 2600, type: 'fixed'   },
];

const DAILY_STREAK_BONUSES = { 1: 1000, 2: 1500, 3: 2000, 4: 3000, 5: 4000, 6: 5000, 7: 10000 };
const DAILY_CHALLENGE_POOL = [
    { id: 'play_game',     label: 'Play a game today',          points: 2000,  trigger: 'game_save'  },
    { id: 'score_1k',      label: 'Score 1,000+ in one game',   points: 5000,  trigger: 'game_save'  },
    { id: 'score_5k',      label: 'Score 5,000+ in one game',   points: 15000, trigger: 'game_save'  },
    { id: 'place_order',   label: 'Place an order today',       points: 10000, trigger: 'order'      },
    { id: 'streak_3',      label: 'Log in 3 days in a row',     points: 8000,  trigger: 'daily_claim' },
];

function getDailyChallenges(dateStr) {
    const seed = dateStr.replace(/-/g, '');
    const n = parseInt(seed, 10) % DAILY_CHALLENGE_POOL.length;
    return [0, 1, 2].map(i => DAILY_CHALLENGE_POOL[(n + i) % DAILY_CHALLENGE_POOL.length]);
}

async function completeChallengeIfNew(email, challengeId, dateStr) {
    const dailySet = getDailyChallenges(dateStr);
    const challenge = dailySet.find(c => c.id === challengeId);
    if (!challenge) return false; // Not one of today's challenges

    const isNew = db.insertDailyCompletion(email, challengeId, dateStr);
    if (isNew) {
        db.addPoints(email, challenge.points);
        return true;
    }
    return false;
}

const GAME_MILESTONES = [
    { target: 10000,  discount: '£2',  percent: 0, fixedAmount: 200 },
    { target: 100000, discount: '£4', percent: 0, fixedAmount: 400 }
];

app.post('/api/game/register', async (req, res) => {
    const { name, email, password, phone, referralCode } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password required' });
    if (password.length < 6) return res.status(400).json({ message: 'Password min 6 characters' });

    const existing = db.getGamePlayer(email.toLowerCase());
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashedPass = await bcrypt.hash(password, 10);
    const player = db.createGamePlayer(name, email, hashedPass);

    // ── Link / create customer record ──
    // If a customer record exists with this phone or email (e.g. from previous
    // WhatsApp/walk-in orders), promote that record by linking it to this account
    // and copying the stamps over to game_players. Otherwise create a fresh record.
    try {
        let customer = db.findCustomer({ phone, email });
        if (customer) {
            // Existing customer — upgrade it to "has account" and update missing fields
            db.updateCustomer(customer.id, {
                phone: customer.phone || phone,
                email: customer.email || email.toLowerCase(),
                name: customer.name || name,
                hasAccount: true,
                passwordHash: hashedPass,
                source: customer.source || 'web'
            });
            // Copy the customer's existing loyalty stamps onto the new game_player
            // so the user sees them on their loyalty card
            if (customer.loyalty_stamps > 0) {
                db.setLoyaltyStampsForPlayer(email.toLowerCase(), {
                    stamps: customer.loyalty_stamps,
                    totalOrders: customer.loyalty_total_orders || 0,
                    claimed: customer.loyalty_claimed,
                    rewards: customer.loyalty_rewards
                });
            }
        } else {
            // Create new customer record
            db.createCustomer({
                phone: phone || null,
                email: email.toLowerCase(),
                name,
                source: 'web',
                hasAccount: true,
                passwordHash: hashedPass
            });
        }
    } catch (e) {
        // Don't block signup if customer-link fails — just log it
        console.error('[Register] Customer link error:', e.message);
    }

    // ── Referral linking ──
    try {
        db.getOrCreateReferralCode(email.toLowerCase());
        if (referralCode && /^CWREF-[A-Z0-9]{6}$/.test(referralCode)) {
            const referrer = db.getPlayerByReferralCode(referralCode);
            if (referrer && referrer.email.toLowerCase() !== email.toLowerCase()) {
                db.setReferredBy(email.toLowerCase(), referrer.email);
            }
        }
    } catch (e) {
        console.error('[Register] Referral linking error:', e.message);
    }

    const token = crypto.randomBytes(32).toString('hex');
    if (!global.gameSessionMap) global.gameSessionMap = new Map();
    global.gameSessionMap.set(token, email.toLowerCase());

    res.json({ token, user: { id: player.email, name: player.name, email: player.email } });
});

app.post('/api/game/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'All fields required' });

    const player = db.getGamePlayer(email.toLowerCase());
    if (!player) return res.status(401).json({ message: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, player.password || player.password_hash);
    if (!valid) return res.status(401).json({ message: 'Invalid email or password' });

    const token = crypto.randomBytes(32).toString('hex');
    if (!global.gameSessionMap) global.gameSessionMap = new Map();
    global.gameSessionMap.set(token, player.email);

    res.json({ token, user: { id: player.email, name: player.name, email: player.email } });
});

// Game auth middleware
function requireGameAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!global.gameSessionMap || !global.gameSessionMap.has(token)) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    req.playerEmail = global.gameSessionMap.get(token);
    next();
}

function getPlayer(email) {
    return db.getGamePlayer(email) || null;
}

function savePlayer(player) {
    db.saveGamePlayer(player);
}

app.get('/api/game/progress', requireGameAuth, (req, res) => {
    const player = getPlayer(req.playerEmail);
    if (!player) return res.status(404).json({ message: 'Player not found' });

    // Build rewards array from redeemedCodes for display
    const rewards = (player.redeemedCodes || []).map(r => ({
        icon: '🎁',
        label: `${r.percent}% OFF`,
        code: r.code
    }));

    res.json({
        totalScore: player.totalScore || 0,
        highScore: player.highScore || 0,
        wingCount: player.wingCount || 0,
        crowns: player.crowns || 0,
        coins: player.coins || 0,
        deliveries: player.deliveries || 0,
        totalDeliveries: player.deliveries || 0,
        plays: player.plays || 0,
        unlockedCodes: player.unlockedCodes || {},
        redeemedCodes: player.redeemedCodes || [],
        rewards,
        milestoneTier: player.milestoneTier || 0
    });
});

app.post('/api/game/save', requireGameAuth, (req, res) => {
    const { score, wings, crowns, coins, deliveries, bonus } = req.body;
    const player = getPlayer(req.playerEmail);
    if (!player) return res.status(404).json({ message: 'Player not found' });

    player.totalScore = (player.totalScore || 0) + (score || 0);
    player.highScore = Math.max(player.highScore || 0, score || 0);
    player.wingCount = (player.wingCount || 0) + (wings || 0);
    player.crowns = (player.crowns || 0) + (crowns || 0);
    // Wing Run coins convert to milestone points
    const coinPoints = (coins || 0) * WING_RUN_COIN_MULTIPLIER;
    player.totalScore = (player.totalScore || 0) + coinPoints;
    player.coins = (player.coins || 0) + (coins || 0);
    player.deliveries = (player.deliveries || 0) + (deliveries || 0);
    player.plays = (player.plays || 0) + 1;

    savePlayer(player);

    // ── Challenge triggers ──
    const today = new Date().toISOString().slice(0, 10);
    completeChallengeIfNew(player.email, 'play_game', today);
    if ((score || 0) >= 1000) completeChallengeIfNew(player.email, 'score_1k', today);
    if ((score || 0) >= 5000) completeChallengeIfNew(player.email, 'score_5k', today);

    const rewards = (player.redeemedCodes || []).map(r => ({
        icon: '🎁',
        label: `${r.percent}% OFF`,
        code: r.code
    }));

    res.json({ totalScore: player.totalScore, highScore: player.highScore, coins: player.coins, deliveries: player.deliveries, totalDeliveries: player.deliveries, plays: player.plays, wingCount: player.wingCount, crowns: player.crowns, unlockedCodes: player.unlockedCodes || {}, redeemedCodes: player.redeemedCodes || [], rewards, milestoneTier: player.milestoneTier || 0 });
});

// Wing Run coin-to-points conversion: each coin earned = 10 points toward milestones
const WING_RUN_COIN_MULTIPLIER = 10;

app.get('/api/game/shop', (req, res) => {
    res.json(WING_SHOP.map(item => ({ id: item.id, name: item.name, points: item.points })));
});

app.post('/api/game/shop/redeem', requireGameAuth, (req, res) => {
    const { itemId } = req.body;
    const item = WING_SHOP.find(i => i.id === itemId);
    if (!item) return res.status(400).json({ message: 'Item not found' });

    const player = getPlayer(req.playerEmail);
    if (!player || player.totalScore < item.points) {
        return res.status(400).json({ message: 'Not enough points' });
    }

    const success = db.spendPoints(player.email, item.points);
    if (!success) return res.status(400).json({ message: 'Not enough points' });

    const code = 'WING-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    db.insertDiscount({
        code,
        email: player.email,
        type: item.type,
        percent: item.percent || 0,
        amount_pence: item.amountPence || 0,
        fixed_amount: item.amountPence || 0,
        source: 'wing-shop',
        description: item.name,
        created_at: new Date().toISOString()
    });

    res.json({ code, newBalance: (player.totalScore || 0) - item.points });
});

app.post('/api/game/daily-claim', requireGameAuth, (req, res) => {
    const email = req.playerEmail;
    const today = new Date().toISOString().slice(0, 10);
    const state = db.getDailyClaimState(email);

    if (state && state.lastDailyClaim === today) {
        return res.status(400).json({ message: 'Already claimed today' });
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let newStreak = 1;
    if (state && state.lastDailyClaim === yesterday) {
        newStreak = (state.dailyStreak % 7) + 1;
    }

    const points = DAILY_STREAK_BONUSES[newStreak] || 1000;
    db.addPoints(email, points);
    db.setDailyClaim(email, today, newStreak);

    if (newStreak >= 3) {
        completeChallengeIfNew(email, 'streak_3', today);
    }

    const player = getPlayer(email);
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);

    res.json({
        pointsEarned: points,
        newStreak,
        newBalance: player.totalScore,
        nextClaimAt: tomorrow.toISOString()
    });
});

app.get('/api/game/daily-status', requireGameAuth, (req, res) => {
    const email = req.playerEmail;
    const today = new Date().toISOString().slice(0, 10);
    const state = db.getDailyClaimState(email);
    const completed = db.getDailyCompletions(email, today);

    const challenges = getDailyChallenges(today).map(c => ({
        id: c.id,
        label: c.label,
        points: c.points,
        completed: completed.includes(c.id)
    }));

    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);

    const claimed = (state && state.lastDailyClaim === today);
    const nextBonus = DAILY_STREAK_BONUSES[(state?.dailyStreak % 7) + 1] || 1000;

    res.json({
        claimed,
        streak: state?.dailyStreak || 0,
        nextBonus,
        nextClaimAt: tomorrow.toISOString(),
        challenges
    });
});

app.post('/api/game/redeem', requireGameAuth, (req, res) => {
    // Legacy endpoint — coin redemption replaced by milestone claim system
    res.status(400).json({ message: 'Coin redemption has been replaced. Earn milestone rewards by reaching 10,000 and 100,000 points!' });
});

app.post('/api/game/claim-code', requireGameAuth, (req, res) => {
    // Legacy milestone claim
    res.status(410).json({ message: 'Milestones have been replaced by the Wing Shop. Visit your profile to spend your points.' });
});

// ── One-time DB migration: fix game milestone codes + divide Wing Run coins ──
app.post('/admin/api/migrate-game-codes', requireAdmin, (req, res) => {
    // This migration is no longer needed with SQLite — all data is in the proper format
    res.json({ success: true, message: 'Migration not needed — SQLite database in use' });
});

// ── Loyalty progress (authenticated) ────────────────────────────────────────
app.get('/api/loyalty/progress', requireGameAuth, (req, res) => {
    const progress = db.getLoyaltyProgress(req.playerEmail);
    if (!progress) return res.status(404).json({ message: 'No loyalty account found' });
    res.json(progress);
});

// ── Customer order history (authenticated) ──────────────────────────────────
app.get('/api/account/orders', requireGameAuth, (req, res) => {
    const orders = db.getOrdersByEmail(req.playerEmail);
    res.json(orders);
});

// ── Account profile (authenticated) ────────────────────────────────────────
app.get('/api/account/profile', requireGameAuth, (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const player = getPlayer(req.playerEmail);
    if (!player) return res.status(404).json({ message: 'Account not found' });
    let referralCode = null;
    let referralCount = 0;
    try {
        referralCode = db.getOrCreateReferralCode(player.email);
        referralCount = db.getReferralCount(player.email);
    } catch (e) {
        // defaults already set above
    }
    res.json({
        name: player.name || '',
        email: player.email || '',
        phone: player.profile?.phone || '',
        address: player.profile?.address || '',
        city: player.profile?.city || 'London',
        postcode: player.profile?.postcode || '',
        contactPref: player.profile?.contactPref || 'email',
        referralCode,
        referralCount
    });
});

app.post('/api/account/profile', requireGameAuth, (req, res) => {
    const player = getPlayer(req.playerEmail);
    if (!player) return res.status(404).json({ message: 'Account not found' });

    if (!player.profile) player.profile = {};

    // Only update fields that were sent
    const { name, phone, address, city, postcode, contactPref } = req.body;
    console.log(`[PROFILE SAVE] ${req.playerEmail} — address: "${address}", city: "${city}", postcode: "${postcode}", phone: "${phone}"`);
    if (name !== undefined) player.name = name;
    if (phone !== undefined) player.profile.phone = phone;
    if (address !== undefined) player.profile.address = address;
    if (city !== undefined) player.profile.city = city;
    if (postcode !== undefined) player.profile.postcode = postcode;
    if (contactPref !== undefined) player.profile.contactPref = contactPref;

    savePlayer(player);
    console.log(`[PROFILE SAVE] Saved. Profile now:`, JSON.stringify(player.profile));
    res.json({ success: true });
});

// ── Account discount codes (authenticated) ──────────────────────────────────
app.get('/api/account/codes', requireGameAuth, (req, res) => {
    const codes = db.getDiscountsByEmail(req.playerEmail);
    res.json(codes);
});

// ── Password Reset ─────────────────────────────────────────────────────────
const resetTokens = new Map(); // token -> { email, expires }

app.post('/api/account/reset-request', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const e = email.toLowerCase();
    // Check player exists (don't reveal if they don't)
    const player = getPlayer(e);

    // Always return success to prevent email enumeration
    if (player) {
        const token = crypto.randomBytes(32).toString('hex');
        resetTokens.set(token, { email: e, expires: Date.now() + 30 * 60 * 1000 }); // 30 min

        const resetUrl = `https://order.charlieswingz.com/reset-password?token=${token}`;
        const emailHtml = `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                <h1 style="color:#d4af37;margin:0 0 16px;font-size:1.8rem">👑 Password Reset</h1>
                <p>Hi ${player.name || 'there'},</p>
                <p>We received a request to reset your Charlie's Wingz account password.</p>
                <div style="text-align:center;margin:24px 0">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#d4af37,#b8952e);color:#000;font-weight:800;font-size:1rem;text-decoration:none;border-radius:8px;letter-spacing:1px">RESET PASSWORD</a>
                </div>
                <p style="color:#aaa;font-size:0.85rem">This link expires in 30 minutes. If you didn't request this, you can safely ignore it.</p>
                <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
            </div>
        `;
        notifyCustomerDirect(
            { customer_email: e, contact_pref: 'email' },
            '', '👑 Password Reset — Charlie\'s Wingz', emailHtml
        ).catch(err => console.error('[Reset email error]', err.message));
        console.log(`[RESET] Token generated for ${e}`);
    }

    res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
});

app.post('/api/account/reset-confirm', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const entry = resetTokens.get(token);
    if (!entry) return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    if (Date.now() > entry.expires) {
        resetTokens.delete(token);
        return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    const player = getPlayer(entry.email);
    if (!player) return res.status(400).json({ error: 'Account not found' });

    const hashed = await bcrypt.hash(password, 10);
    db.updateGamePassword(entry.email, hashed);
    resetTokens.delete(token);

    console.log(`[RESET] Password changed for ${entry.email}`);
    res.json({ success: true });
});

app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/account', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// ── Discount code signup ────────────────────────────────────────────────────
app.post('/api/discount/signup', async (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    try {
        const discount = db.createDiscountCode(email);
        
        // Only send email for newly created codes, not repeat requests
        if (!discount.alreadyExists) {
            const emailHtml = `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                    <h1 style="color:#d4af37;margin:0 0 16px;font-size:1.8rem">👑 Welcome to Charlie's Wingz</h1>
                    <p>Thanks for signing up! Here's your exclusive 10% discount code:</p>
                    <div style="background:#111;border:2px solid #d4af37;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
                        <p style="font-family:monospace;font-size:2rem;color:#d4af37;font-weight:bold;letter-spacing:0.15em;margin:0">${discount.code}</p>
                    </div>
                    <p style="color:#aaa;font-size:0.85rem">Enter this code at checkout to get 10% off your first order. This code can only be used once.</p>
                    <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
                    <p style="color:#666;font-size:0.75rem;margin-top:16px">order.charlieswingz.com</p>
                </div>
            `;

            try {
                await notifyCustomerDirect(
                    { customer_email: email, contact_pref: 'email' },
                    '',
                    '👑 Your 10% Discount Code — Charlie\'s Wingz',
                    emailHtml
                );
            } catch(e) {
                console.error('[Discount email error]', e.message);
            }
        }

        res.json({ success: true, code: discount.code });
    } catch(e) {
        console.error('[Discount signup error]', e.message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

// ── Validate discount code ──────────────────────────────────────────────────
app.post('/api/discount/validate', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ valid: false, error: 'No code provided' });
    res.json(db.validateDiscountCode(code));
});

app.get('/custom', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'custom.html'));
});

app.get('/discount', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'discount.html'));
});

app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// ── Bank Transfer Invoice ────────────────────────────────────────────────────
app.post('/admin/api/invoice', requireAdmin, async (req, res) => {
    const { name, email, phone, notes, amount } = req.body;
    if (!name || !email || !notes || !amount) {
        return res.status(400).json({ error: 'Name, email, order details, and amount are required' });
    }

    const reference = 'CW-' + Date.now().toString(36).toUpperCase().slice(-6);
    const amountFormatted = '£' + parseFloat(amount).toFixed(2);

    // Store as an order in the DB
    const orderId = 'inv_' + Date.now();
    await db.insertOrder({
        id: orderId,
        paymentIntentId: null,
        customer_name: name,
        customer_email: email,
        customer_phone: phone || '',
        contact_pref: 'email',
        order_type: 'bank_transfer',
        items_json: JSON.stringify([{ name: notes, qty: 1, price: Math.round(amount * 100) }]),
        subtotal: Math.round(amount * 100),
        delivery_fee: 0,
        discount_amount: 0,
        discount_code: null,
        total: Math.round(amount * 100),
        status: 'awaiting_payment',
        payment_status: 'pending',
        notes: 'Bank transfer — Ref: ' + reference,
        address: '',
        postcode: '',
        city: '',
        delivery_lat: null,
        delivery_lng: null,
        delivery_notes: '',
        created_at: new Date().toISOString()
    });

    // Send invoice email
    const bankName = process.env.BANK_NAME || 'Charlie\'s Wingz Ltd';
    const sortCode = process.env.BANK_SORT_CODE || 'XX-XX-XX';
    const accountNumber = process.env.BANK_ACCOUNT_NUMBER || 'XXXXXXXX';

    const emailHtml = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
            <div style="text-align:center;margin-bottom:24px">
                <h1 style="color:#d4af37;margin:0;font-size:2rem">👑 Charlie's Wingz</h1>
                <p style="color:#aaa;margin:4px 0 0;font-size:0.9rem">Invoice / Payment Request</p>
            </div>
            <div style="background:#0d0d0d;border:1px solid rgba(212,175,55,0.3);border-radius:8px;padding:20px;margin-bottom:20px">
                <table style="width:100%;border-collapse:collapse;color:#f5f0e8;font-size:0.9rem">
                    <tr><td style="padding:6px 0;color:#aaa">Reference:</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#d4af37;letter-spacing:1px">${reference}</td></tr>
                    <tr><td style="padding:6px 0;color:#aaa">Customer:</td><td style="padding:6px 0;text-align:right">${name}</td></tr>
                    <tr><td style="padding:6px 0;color:#aaa">Order:</td><td style="padding:6px 0;text-align:right">${notes}</td></tr>
                    <tr style="border-top:1px solid #333"><td style="padding:12px 0 6px;font-weight:700;font-size:1rem">Total Due:</td><td style="padding:12px 0 6px;text-align:right;font-weight:900;font-size:1.3rem;color:#d4af37">${amountFormatted}</td></tr>
                </table>
            </div>
            <div style="background:#0d0d0d;border:1px solid rgba(212,175,55,0.3);border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="color:#d4af37;margin:0 0 12px;font-size:1rem">Bank Transfer Details</h3>
                <table style="width:100%;border-collapse:collapse;color:#f5f0e8;font-size:0.9rem">
                    <tr><td style="padding:6px 0;color:#aaa">Account Name:</td><td style="padding:6px 0;text-align:right;font-weight:600">${bankName}</td></tr>
                    <tr><td style="padding:6px 0;color:#aaa">Sort Code:</td><td style="padding:6px 0;text-align:right;font-weight:600;letter-spacing:1px">${sortCode}</td></tr>
                    <tr><td style="padding:6px 0;color:#aaa">Account Number:</td><td style="padding:6px 0;text-align:right;font-weight:600;letter-spacing:1px">${accountNumber}</td></tr>
                    <tr><td style="padding:6px 0;color:#aaa">Payment Ref:</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#d4af37;letter-spacing:1px">${reference}</td></tr>
                </table>
            </div>
            <p style="color:#aaa;font-size:0.8rem;text-align:center">Please use the reference <strong style="color:#d4af37">${reference}</strong> when making your payment so we can match it to your order.</p>
            <p style="color:#d4af37;font-weight:bold;text-align:center;margin-top:20px">Fit for Royalty 👑</p>
        </div>
    `;

    try {
        await notifyCustomerDirect(
            { customer_email: email, contact_pref: 'email' },
            '', '👑 Invoice ' + reference + ' — Charlie\'s Wingz (' + amountFormatted + ')', emailHtml
        );
    } catch(err) {
        console.error('[Invoice email error]', err.message);
    }

    res.json({ success: true, reference, orderId });
});

// ── Phone order page ──────────────────────────────────────────────────────────
// ── Kitchen Display (chef view — token-protected, no admin login needed) ─────
app.get('/kitchen', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kitchen.html'));
});

app.get('/api/kitchen/orders', (req, res) => {
    const token = req.query.token;
    const kitchenToken = process.env.KITCHEN_TOKEN;
    if (!kitchenToken || token !== kitchenToken) {
        return res.status(401).json({ error: 'Invalid kitchen token' });
    }
    // Return today's active orders (received, cooking, out_for_delivery)
    const orders = db.getTodaysOrders().filter(o => 
        ['received', 'cooking', 'out_for_delivery'].includes(o.status)
    );
    res.json(orders);
});

app.post('/api/kitchen/orders/:id/status', (req, res) => {
    const token = req.body.token;
    const kitchenToken = process.env.KITCHEN_TOKEN;
    if (!kitchenToken || token !== kitchenToken) {
        return res.status(401).json({ error: 'Invalid kitchen token' });
    }
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['cooking', 'ready'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    db.updateOrderStatus(id, status);
    res.json({ success: true });
});

app.get('/paylink', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'paylink.html'));
});

// ── Stripe webhook ────────────────────────────────────────────────────────────
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('[Webhook] Signature verification failed:', err.message);
        return res.status(400).json({ error: 'Invalid signature' });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const meta = session.metadata || {};
        const orderId = meta.order_id;

        if (!orderId) {
            console.error('[Webhook] No order_id in metadata');
            return res.json({ received: true });
        }

        const order = await db.getOrderById(orderId);
        if (!order) {
            console.error(`[Webhook] Order ${orderId} not found`);
            return res.json({ received: true });
        }

        // Update order with payment intent ID and mark as confirmed
        db.updateOrderPayment(orderId, session.payment_intent);

        const pref = meta.contact_pref || 'sms';
        const items = meta.items_json ? JSON.parse(meta.items_json) : [];
        const customerName = meta.customer_name || order.customer_name;
        const customerEmail = meta.customer_email || order.customer_email;
        const customerPhone = meta.customer_phone || order.customer_phone;
        const orderType = meta.order_type || order.order_type;

        console.log(`[Webhook] Payment confirmed for order ${orderId.slice(-6)} — ${customerName}`);

        // Mark discount code as used
        if (meta.discount_code) {
            db.markDiscountUsed(meta.discount_code);
        }

        // Handle marketing opt-in
        if (meta.marketing_optin === '1') {
            await db.insertOptin({
                name: customerName,
                email: customerEmail,
                phone: customerPhone,
                source: 'checkout'
            });
        }

        // Send order confirmation to customer
        console.log(`[Order ${orderId.slice(-6)}] Sending customer notification | Pref: ${pref} | Phone: ${customerPhone} | Email: ${customerEmail}`);

        // ── Challenge trigger ──
        if (customerEmail) {
            const today = new Date().toISOString().slice(0, 10);
            completeChallengeIfNew(customerEmail, 'place_order', today);
        }

        notifyOrderReceived({
            id: orderId,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            contact_pref: pref,
            total_pence: session.amount_total || order.total_pence
        }, items).catch(err => console.error('[Customer notification error]', err.message));

        // Notify owner of new order
        notifyOwnerNewOrder({
            id: orderId,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            order_type: orderType,
            total_pence: session.amount_total || order.total_pence
        }, items).catch(err => console.error('[Owner notification error]', err.message));

        // Send push notification to all admin devices
        if (push.isConfigured()) {
            const pushPayload = push.buildNewOrderPayload({
                id: orderId,
                customer_name: customerName,
                customer_phone: customerPhone,
                order_type: orderType,
                postcode: order.postcode,
                total_pence: session.amount_total || order.total_pence
            }, items);
            push.sendToAllAdmins(pushPayload).catch(err =>
                console.error('[Push notification error]', err.message));
        }

        // ── Loyalty Stamps ──
        // Loyalty stamps require £25+ on food (delivery fee doesn't count).
        // Compute food subtotal from the line items rather than total_pence,
        // since total_pence may include the delivery fee.
        const foodSubtotal = items.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0);
        const LOYALTY_MIN_SUBTOTAL = 2500;
        if (customerEmail && foodSubtotal >= LOYALTY_MIN_SUBTOTAL) {
            const loyaltyResult = db.addLoyaltyStamp(customerEmail);
            if (loyaltyResult && loyaltyResult.reward) {
                console.log(`[LOYALTY] 🎉 ${customerName} earned a reward! Code: ${loyaltyResult.reward.code} — ${loyaltyResult.reward.description}`);
                const loyaltyMsg = `👑 ${BRAND} LOYALTY REWARD! Congrats ${customerName}! You've earned ${loyaltyResult.reward.description} with code: ${loyaltyResult.reward.code} — Use it on your next order at order.charlieswingz.com 👑`;
                const loyaltyEmailHtml = `
                    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                        <h1 style="color:#d4af37;margin:0 0 16px;font-size:1.8rem">👑 Loyalty Reward Earned!</h1>
                        <p>Congratulations <strong>${customerName}</strong>!</p>
                        <p>You've hit <strong style="color:#d4af37">${loyaltyResult.reward.tier} stamps</strong> and earned a <strong style="color:#4caf50">${loyaltyResult.reward.description}</strong>!</p>
                        <div style="background:#111;border:2px solid #d4af37;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
                            <p style="font-family:monospace;font-size:2rem;color:#4caf50;font-weight:bold;letter-spacing:0.15em;margin:0">${loyaltyResult.reward.code}</p>
                        </div>
                        <p style="color:#aaa;font-size:0.85rem">Use this code at checkout to claim your reward. Keep ordering to earn more!</p>
                        <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
                    </div>
                `;
                notifyCustomerDirect({
                    customer_email: customerEmail,
                    customer_phone: customerPhone,
                    contact_pref: pref,
                    customer_name: customerName
                }, loyaltyMsg, '👑 You Earned a Loyalty Reward!', loyaltyEmailHtml).catch(err => console.error('[Loyalty notification error]', err.message));
            }
        }

        // ── Referral Reward ──
        try {
            if (customerEmail && foodSubtotal >= 2500) {
                const referralState = db.getPlayerReferralState(customerEmail);
                if (referralState && referralState.referred_by && !referralState.referral_rewarded) {
                    const referrerEmail = referralState.referred_by;

                    // 15% code for the referred friend
                    const friendCode = 'CWREF15-' + crypto.randomBytes(4).toString('hex').toUpperCase();
                    db.insertReferralDiscount({
                        code: friendCode,
                        email: customerEmail,
                        percent: 15,
                        source: 'referral',
                        description: '15% referral reward'
                    });

                    // 15% code for the referrer
                    const referrerCode = 'CWREF15-' + crypto.randomBytes(4).toString('hex').toUpperCase();
                    db.insertReferralDiscount({
                        code: referrerCode,
                        email: referrerEmail,
                        percent: 15,
                        source: 'referral',
                        description: '15% referral reward'
                    });

                    db.setReferralRewarded(customerEmail);
                    const newCount = db.incrementReferralCount(referrerEmail);

                    // Notify referred friend about their 15% code
                    try {
                        const friendPlayer = db.getGamePlayer(customerEmail);
                        if (friendPlayer) {
                            const friendContactPref = friendPlayer.profile?.contactPref || 'email';
                            const friendPhone = friendPlayer.profile?.phone || '';
                            const friendMsg = `You and your friend each earned a 15% referral reward! Use code ${friendCode} on your next order.`;
                            const friendEmailHtml = `
                                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                                    <h1 style="color:#d4af37;margin:0 0 16px;font-size:1.8rem">You Earned a Referral Reward!</h1>
                                    <p>You and your friend each earned a <strong style="color:#4caf50">15% discount</strong> on your next order!</p>
                                    <div style="background:#111;border:2px solid #d4af37;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
                                        <p style="font-family:monospace;font-size:2rem;color:#4caf50;font-weight:bold;letter-spacing:0.15em;margin:0">${friendCode}</p>
                                    </div>
                                    <p style="color:#aaa;font-size:0.85rem">Use this code at checkout on your next order at order.charlieswingz.com</p>
                                    <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
                                </div>
                            `;
                            notifyCustomerDirect({
                                customer_email: customerEmail,
                                customer_phone: friendPhone,
                                contact_pref: friendContactPref,
                                customer_name: friendPlayer.name || customerEmail
                            }, friendMsg, 'You Earned a 15% Referral Reward!', friendEmailHtml).catch(err => console.error('[Referral friend notification error]', err.message));
                        }
                    } catch (err) {
                        console.error('[Referral friend notification error]', err);
                    }

                    // Notify referrer about their 15% code
                    try {
                        const referrerPlayer = db.getGamePlayer(referrerEmail);
                        if (referrerPlayer) {
                            const referrerContactPref = referrerPlayer.profile?.contactPref || 'email';
                            const referrerPhone = referrerPlayer.profile?.phone || '';
                            const referrerMsg = `Your referral was successful! You both earned 15% off. Use code ${referrerCode} on your next order.`;
                            const referrerEmailHtml = `
                                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                                    <h1 style="color:#d4af37;margin:0 0 16px;font-size:1.8rem">Your Referral Was Successful!</h1>
                                    <p>Your friend just placed their first order — you both earned a <strong style="color:#4caf50">15% discount</strong>!</p>
                                    <div style="background:#111;border:2px solid #d4af37;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
                                        <p style="font-family:monospace;font-size:2rem;color:#4caf50;font-weight:bold;letter-spacing:0.15em;margin:0">${referrerCode}</p>
                                    </div>
                                    <p style="color:#aaa;font-size:0.85rem">Use this code at checkout on your next order at order.charlieswingz.com</p>
                                    <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
                                </div>
                            `;
                            notifyCustomerDirect({
                                customer_email: referrerEmail,
                                customer_phone: referrerPhone,
                                contact_pref: referrerContactPref,
                                customer_name: referrerPlayer.name || referrerEmail
                            }, referrerMsg, 'Your Referral Was Successful! 15% Off Earned', referrerEmailHtml).catch(err => console.error('[Referral referrer notification error]', err.message));
                        }
                    } catch (err) {
                        console.error('[Referral referrer notification error]', err);
                    }

                    // 30% milestone (every 10 successful referrals)
                    if (newCount > 0 && newCount % 10 === 0) {
                        const milestoneCode = 'CWREF30-' + crypto.randomBytes(4).toString('hex').toUpperCase();
                        db.insertReferralDiscount({
                            code: milestoneCode,
                            email: referrerEmail,
                            percent: 30,
                            source: 'referral-milestone',
                            description: '30% referral milestone reward'
                        });

                        // Notify referrer about 30% milestone code
                        try {
                            const referrerPlayer = db.getGamePlayer(referrerEmail);
                            if (referrerPlayer) {
                                const referrerContactPref = referrerPlayer.profile?.contactPref || 'email';
                                const referrerPhone = referrerPlayer.profile?.phone || '';
                                const milestoneMsg = `🎉 30% milestone reached! You've referred ${newCount} friends. Use code ${milestoneCode} for 30% off.`;
                                const milestoneEmailHtml = `
                                    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                                        <h1 style="color:#d4af37;margin:0 0 16px;font-size:1.8rem">🎉 30% Milestone Reached!</h1>
                                        <p>Amazing — you've referred <strong style="color:#d4af37">${newCount} friends</strong>! Here's a special <strong style="color:#4caf50">30% discount</strong> as a thank you.</p>
                                        <div style="background:#111;border:2px solid #d4af37;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
                                            <p style="font-family:monospace;font-size:2rem;color:#4caf50;font-weight:bold;letter-spacing:0.15em;margin:0">${milestoneCode}</p>
                                        </div>
                                        <p style="color:#aaa;font-size:0.85rem">Use this code at checkout on your next order at order.charlieswingz.com</p>
                                        <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
                                    </div>
                                `;
                                notifyCustomerDirect({
                                    customer_email: referrerEmail,
                                    customer_phone: referrerPhone,
                                    contact_pref: referrerContactPref,
                                    customer_name: referrerPlayer.name || referrerEmail
                                }, milestoneMsg, '🎉 30% Milestone Reward — You\'ve Referred ' + newCount + ' Friends!', milestoneEmailHtml).catch(err => console.error('[Referral milestone notification error]', err.message));
                            }
                        } catch (err) {
                            console.error('[Referral milestone notification error]', err);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Referral reward error:', err);
        }

        // ── Customer Lottery: every 10th order wins 10% off ──
        const orderNumber = db.incrementLotteryCount();
        if (orderNumber % 10 === 0) {
            const lotteryDiscount = db.createLotteryDiscount(customerEmail, customerName);
            console.log(`[LOTTERY] 🎉 Order #${orderNumber} is a WINNER! Code: ${lotteryDiscount.code} | Customer: ${customerName} (${customerEmail})`);
            const lotteryMsg = `🎉 CONGRATULATIONS ${customerName}! You're our lucky ${orderNumber}th customer and you've won 10% off your next order! Your discount code: ${lotteryDiscount.code} — Use it at order.charlieswingz.com 👑`;
            const lotteryEmailHtml = `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#f5f0e8;padding:32px;border-radius:8px">
                    <h1 style="color:#FFD700;margin:0 0 16px;font-size:1.8rem">🎉 You're a Winner!</h1>
                    <p>Congratulations <strong>${customerName}</strong>!</p>
                    <p>You're our lucky <strong style="color:#FFD700">${orderNumber}th customer</strong> and you've won <strong style="color:#4caf50">10% off</strong> your next order!</p>
                    <div style="background:#111;border:2px solid #FFD700;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
                        <p style="font-family:monospace;font-size:2rem;color:#4caf50;font-weight:bold;letter-spacing:0.15em;margin:0">${lotteryDiscount.code}</p>
                    </div>
                    <p style="color:#aaa;font-size:0.85rem">Enter this code at checkout to get 10% off. This code can only be used once.</p>
                    <p style="color:#d4af37;font-weight:bold;margin-top:24px">Fit for Royalty 👑</p>
                    <p style="color:#666;font-size:0.75rem;margin-top:16px">order.charlieswingz.com</p>
                </div>
            `;
            notifyCustomerDirect({
                customer_email: customerEmail,
                customer_phone: customerPhone,
                contact_pref: pref,
                customer_name: customerName
            }, lotteryMsg, '🎉 You Won! 10% Off Your Next Order', lotteryEmailHtml).catch(err => console.error('[Lottery notification error]', err.message));
        }
    }

    res.json({ received: true });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Start server
if (typeof PhusionPassenger !== 'undefined') {
    PhusionPassenger.configure({ autoInstall: false });
    app.listen('passenger', () => {
        console.log(`Charlie's Wingz server running`);
        console.log(`Stripe mode: ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST'}`);
    });
} else {
    app.listen(PORT, () => {
        console.log(`Charlie's Wingz server running on port ${PORT}`);
        console.log(`Stripe mode: ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST'}`);
    });
}

module.exports = app;
