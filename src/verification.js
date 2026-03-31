/**
 * Order Verification Cache — 3-layer persistence
 *
 * Tracks which orders have been manually verified (green checkmark)
 * in the wizard's RTO Sort and Repeat Orders steps.
 *
 * Cache layers (same pattern as shiprocket_sense.js):
 *   1. In-memory Map (fastest, lost on process restart)
 *   2. /tmp/verified_orders.json (survives warm Vercel invocations)
 *   3. data/verified_orders.json (repo-level, survives deploys)
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = '/tmp/verified_orders.json';
const REPO_CACHE_FILE = path.join(__dirname, '..', 'data', 'verified_orders.json');

const verifiedCache = new Map();
let cacheLoaded = false;

function loadCache() {
    if (cacheLoaded) return;

    let loaded = 0;

    // Priority 1: /tmp cache (warm Vercel instance)
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            for (const [k, v] of Object.entries(raw)) {
                verifiedCache.set(k, v);
                loaded++;
            }
            console.log(`[VERIFY] Loaded ${loaded} verified orders from /tmp.`);
        }
    } catch (e) {
        console.warn('[VERIFY] /tmp cache load failed (non-fatal):', e.message);
    }

    // Priority 2: Repo file (cold start fallback)
    if (loaded === 0) {
        try {
            if (fs.existsSync(REPO_CACHE_FILE)) {
                const raw = JSON.parse(fs.readFileSync(REPO_CACHE_FILE, 'utf8'));
                let repoLoaded = 0;
                for (const [k, v] of Object.entries(raw)) {
                    verifiedCache.set(k, v);
                    repoLoaded++;
                }
                if (repoLoaded > 0) {
                    console.log(`[VERIFY] Loaded ${repoLoaded} verified orders from repo backup.`);
                    saveCache();
                }
            }
        } catch (e) {
            console.warn('[VERIFY] Repo cache load failed (non-fatal):', e.message);
        }
    }

    cacheLoaded = true;
}

function saveCache() {
    try {
        const obj = Object.fromEntries(verifiedCache);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
    } catch (e) {
        console.warn('[VERIFY] Cache save failed (non-fatal):', e.message);
    }
}

function markVerified(orderId) {
    loadCache();
    verifiedCache.set(String(orderId), {
        orderId: String(orderId),
        verifiedAt: new Date().toISOString(),
        status: 'verified',
    });
    saveCache();
}

function removeVerified(orderId) {
    loadCache();
    verifiedCache.delete(String(orderId));
    saveCache();
}

function isVerified(orderId) {
    loadCache();
    return verifiedCache.has(String(orderId));
}

function getAll() {
    loadCache();
    return Array.from(verifiedCache.keys());
}

function exportCache() {
    loadCache();
    return Object.fromEntries(verifiedCache);
}

function warmCache(data) {
    loadCache();
    let added = 0;
    if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
            if (!verifiedCache.has(k)) {
                verifiedCache.set(k, v);
                added++;
            }
        }
        if (added > 0) saveCache();
    }
    return { added, total: verifiedCache.size };
}

module.exports = {
    markVerified,
    removeVerified,
    isVerified,
    getAll,
    exportCache,
    warmCache,
};
