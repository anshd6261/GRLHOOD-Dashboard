/**
 * Risk Validator for Shopify Orders
 * Implements checks for:
 * 1. Invalid/Incomplete Addresses
 * 2. Invalid Phone Numbers
 * 3. Duplicate Orders (Same Address, Different Name)
 */

// Regex for valid Indian Mobile Number
// Starts with 6,7,8,9. Length 10. Optional +91 or 0 prefix.
// We clean the input first, so we just check for 10 digits starting with 6-9.
const VALID_PHONE_REGEX = /^[6-9]\d{9}$/;

// Address Blocklist (Lower case)
const BLOCKED_ADDRESS_PATTERNS = [
    /^house\s*\d+$/i,     // House 4
    /^flat\s*\d+$/i,      // Flat 2
    /^room\s*\d+$/i,      // Room 5
    /^\d+$/,              // Just numbers
    /^no\s+\d+$/i,        // No 12
    /^same$/i,            // "Same"
    /^test$/i,            // "Test"
    /^unknown(\s*address)?$/i, // "Unknown" or "Unknown Address"
    /^na$/i,              // "NA"
    /^n\/a$/i
];

const validatePhone = (phone) => {
    if (!phone) return { valid: false, reason: "Missing Phone" };

    // Sanitize: Remove all non-digits
    let cleaned = phone.replace(/\D/g, '');

    // Remove leading 91 or 0 if length > 10
    if (cleaned.length > 10) {
        if (cleaned.startsWith('91')) cleaned = cleaned.slice(2);
        else if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
    }

    if (cleaned.length !== 10) return { valid: false, reason: "Phone length invalid (must be 10 digits)" };
    if (!VALID_PHONE_REGEX.test(cleaned)) return { valid: false, reason: "Invalid Indian Mobile Format" };

    return { valid: true };
};

const validateAddress = (order) => {
    const addr = order.shippingAddress;
    if (!addr) return { valid: false, reason: "Missing Shipping Address" };

    const address1 = (addr.address1 || "").trim();
    const address2 = (addr.address2 || "").trim();
    const fullAddress = `${address1} ${address2}`.trim();

    if (fullAddress.length < 10) {
        return { valid: false, reason: `Address too short (${fullAddress.length} chars)` };
    }

    // Check Blocklist
    for (const pattern of BLOCKED_ADDRESS_PATTERNS) {
        if (pattern.test(fullAddress)) {
            return { valid: false, reason: `Suspicious Address Pattern: "${fullAddress}"` };
        }
    }

    // Check for just repeated characters? (Optional, maybe later)

    return { valid: true };
};

const findDuplicates = (orders) => {
    // Returns a Map of OrderID -> Reason
    const riskMap = new Map();
    const addressMap = new Map(); // normalizedAddr -> { name, orderId }[]

    for (const order of orders) {
        if (!order.shippingAddress) continue;

        // Normalize Address: Lowercase, remove non-alphanumeric, trim
        const raw = (order.shippingAddress.address1 + (order.shippingAddress.zip || "")).toLowerCase();
        const normalized = raw.replace(/[^a-z0-9]/g, '');

        if (!addressMap.has(normalized)) {
            addressMap.set(normalized, []);
        }
        addressMap.get(normalized).push({
            id: order.id,
            name: (order.shippingAddress.name || "").toLowerCase().trim(),
            displayId: order.name
        });
    }

    // Analyze Groups
    for (const [addr, group] of addressMap) {
        if (group.length > 1) {
            // Check if names are DIFFERENT
            const uniqueNames = new Set(group.map(g => g.name));
            if (uniqueNames.size > 1) {
                // Suspicious: Same Address, Different Names
                const reason = `Duplicate Address with Different Names (Matches: ${group.map(g => g.displayId).join(', ')})`;
                for (const item of group) {
                    riskMap.set(item.id, reason);
                }
            } else {
                // Same Address, Same Name -> Legitimate repeat customer?
                // User asked: "if you see Duplicated Exact Addresses but Different Names then Skip Those"
                // So same name duplicates usually okay for bulk ship? 
                // Or should we warn? Let's stick to strict user request: Different Names = High Risk.
            }
        }
    }

    return riskMap;
};

module.exports = {
    validatePhone,
    validateAddress,
    findDuplicates
};
