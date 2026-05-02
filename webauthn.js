// WebAuthn / Passkey support for admin login
// Uses @simplewebauthn/server. Credentials stored in admin_credentials table.
//
// Flow:
//   Registration (after user is already logged in via password+TOTP):
//     1. POST /admin/api/webauthn/register/start  → server returns options + challenge
//     2. Client invokes navigator.credentials.create() with those options
//     3. POST /admin/api/webauthn/register/finish → server verifies, stores credential
//
//   Authentication (initial login, no password needed):
//     1. POST /admin/webauthn/auth/start  → server returns options + challenge
//     2. Client invokes navigator.credentials.get() with those options
//     3. POST /admin/webauthn/auth/finish → server verifies, returns session token
//
// We use an in-memory challenge store (challenges expire after 5 minutes).
// On a single Node process this is fine. For multi-process scaling we'd move to Redis/DB.

const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const db = require('./db');

// ── Configuration ───────────────────────────────────────────────────────────
// RP_ID = the domain name (no protocol, no path, no port).
// RP_ORIGIN = the full origin (https://example.com).
// These MUST match the origin the user is on, or WebAuthn rejects.
const RP_NAME = process.env.WEBAUTHN_RP_NAME || "Charlie's Wingz Admin";
const RP_ID = process.env.WEBAUTHN_RP_ID || 'order.charlieswingz.com';
const RP_ORIGIN = process.env.WEBAUTHN_RP_ORIGIN || `https://${RP_ID}`;

// Challenge cache — single ongoing registration/auth ceremony per session/IP at a time.
// Keyed by a context key (admin user for registration, IP for auth-from-cold).
// Auto-purges entries older than CHALLENGE_TTL.
const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes
const challenges = new Map(); // key -> { challenge, expectedRp, createdAt, type }

function setChallenge(key, challenge, type) {
    challenges.set(key, { challenge, type, createdAt: Date.now() });
}
function getChallenge(key, type) {
    const entry = challenges.get(key);
    if (!entry) return null;
    if (entry.type !== type) return null;
    if (Date.now() - entry.createdAt > CHALLENGE_TTL) {
        challenges.delete(key);
        return null;
    }
    return entry.challenge;
}
function clearChallenge(key) {
    challenges.delete(key);
}

// Periodically clean up old challenges
setInterval(() => {
    const cutoff = Date.now() - CHALLENGE_TTL;
    for (const [key, entry] of challenges) {
        if (entry.createdAt < cutoff) challenges.delete(key);
    }
}, 60 * 1000);

// ── Registration ────────────────────────────────────────────────────────────

async function startRegistration(adminUser) {
    const existing = db.getAdminCredentialsByUser(adminUser);
    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: adminUser,
        userID: Buffer.from(adminUser, 'utf8'),
        // Tell the authenticator to make a discoverable credential so user
        // doesn't need to type a username on auth (they just pick a passkey).
        attestationType: 'none',
        // Exclude already-registered credentials so user can't register the same
        // device twice.
        excludeCredentials: existing.map(c => ({
            id: c.id,
            transports: c.transports || []
        })),
        authenticatorSelection: {
            // Allow both platform (Face ID, Touch ID, Windows Hello) and roaming
            // (security keys, phone-as-key). Platform is preferred.
            residentKey: 'preferred',
            userVerification: 'preferred',
            authenticatorAttachment: 'platform'
        },
        // Supported algorithms — modern set
        supportedAlgorithmIDs: [-7, -257]   // ES256, RS256
    });
    setChallenge('reg:' + adminUser, options.challenge, 'reg');
    return options;
}

async function finishRegistration({ adminUser, response, deviceLabel }) {
    const expectedChallenge = getChallenge('reg:' + adminUser, 'reg');
    if (!expectedChallenge) {
        throw new Error('Registration challenge expired or not found. Try again.');
    }

    const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true
    });

    clearChallenge('reg:' + adminUser);

    if (!verification.verified || !verification.registrationInfo) {
        throw new Error('Registration verification failed');
    }

    const info = verification.registrationInfo;
    const credential = info.credential;

    // Check we don't already have this credential ID for this user
    const existing = db.getAdminCredentialById(credential.id);
    if (existing) {
        throw new Error('This device is already registered');
    }

    // De-duplicate by label: if the user already has a credential with the same
    // device_label for this admin (e.g. registered the same Mac twice because
    // browser cleared keychain or excludeCredentials wasn't honoured), delete
    // the old one before inserting the new. Avoids a list with 3× "MacBook".
    if (deviceLabel) {
        const sameLabel = db.getAdminCredentialsByUser(adminUser)
            .filter(c => c.device_label === deviceLabel);
        for (const old of sameLabel) {
            db.deleteAdminCredential(old.id);
        }
    }

    // Store credential
    db.saveAdminCredential({
        id: credential.id,
        adminUser,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || response.response.transports || [],
        deviceLabel: deviceLabel || null,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp
    });

    return { ok: true, credentialId: credential.id, deviceType: info.credentialDeviceType };
}

// ── Authentication ──────────────────────────────────────────────────────────

async function startAuthentication(authKey) {
    // We don't pass allowCredentials here — by leaving it empty we get a
    // discoverable-credential flow where the authenticator presents a list of
    // matching passkeys to the user. iOS will show "Sign in as: <admin>".
    const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: 'preferred',
        timeout: 60_000
    });
    setChallenge('auth:' + authKey, options.challenge, 'auth');
    return options;
}

async function finishAuthentication({ authKey, response }) {
    const expectedChallenge = getChallenge('auth:' + authKey, 'auth');
    if (!expectedChallenge) {
        throw new Error('Authentication challenge expired or not found. Try again.');
    }

    // Look up the credential by ID — the response contains rawId / id which is
    // the credential we registered earlier.
    const credentialId = response.id;
    const stored = db.getAdminCredentialById(credentialId);
    if (!stored) {
        clearChallenge('auth:' + authKey);
        throw new Error('Unknown credential — this device has not been paired');
    }

    const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
        credential: {
            id: stored.id,
            publicKey: stored.public_key,        // Uint8Array / Buffer
            counter: stored.counter,
            transports: stored.transports || []
        },
        requireUserVerification: true
    });

    clearChallenge('auth:' + authKey);

    if (!verification.verified) {
        throw new Error('Authentication verification failed');
    }

    // Update counter to the authenticator's new value (replay-attack protection)
    const newCounter = verification.authenticationInfo.newCounter;
    db.updateCredentialCounter(stored.id, newCounter);

    return {
        ok: true,
        adminUser: stored.admin_user,
        credentialId: stored.id,
        deviceLabel: stored.device_label
    };
}

// ── Lookup helpers ──────────────────────────────────────────────────────────

function listCredentialsForUser(adminUser) {
    return db.getAdminCredentialsByUser(adminUser).map(c => ({
        id: c.id,
        deviceLabel: c.device_label,
        deviceType: c.device_type,
        backedUp: !!c.backed_up,
        createdAt: c.created_at,
        lastUsedAt: c.last_used_at
    }));
}

module.exports = {
    startRegistration,
    finishRegistration,
    startAuthentication,
    finishAuthentication,
    listCredentialsForUser,
    RP_ID,
    RP_ORIGIN
};
