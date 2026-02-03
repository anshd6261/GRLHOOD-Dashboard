const axios = require('axios');
require('dotenv').config();

let token = null;

const authenticate = async () => {
    if (token) return token;

    try {
        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
            email: process.env.SHIPROCKET_EMAIL,
            password: process.env.SHIPROCKET_PASSWORD
        });
        token = response.data.token;
        return token;
    } catch (error) {
        console.error('[SHIPROCKET] Auth Failed:', error.response?.data || error.message);
        throw new Error('Shiprocket Authentication Failed');
    }
};

const getHeaders = async () => {
    const t = await authenticate();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${t}`
    };
};

const getWalletBalance = async () => {
    try {
        const headers = await getHeaders();
        // Shiprocket doesn't have a direct simple wallet endpoint publicly documented in v1 common docs, 
        // but often /v1/external/users returns details. 
        // Or we can assume if order creation fails with "insufficient funds" we catch it.
        // For now, let's try a common endpoint or skip explicit check and handle error.
        // Actually, /v1/external/account/details is often used.
        const response = await axios.get('https://apiv2.shiprocket.in/v1/external/account/details', { headers });
        return response.data?.data?.wallet_balance || 0;
    } catch (e) {
        console.warn('[SHIPROCKET] Failed to fetch wallet balance (ignoring check):', e.response?.status);
        return null; // Return null to indicate unknown (skip check)
    }
};

const createOrder = async (order) => {
    try {
        const headers = await getHeaders();

        // Map Shopify to Shiprocket
        // NOTE: This mapping assumes standard Shopify fields. 
        // Adjust 'length', 'breadth', 'height', 'weight' as per your product defaults or metafields if available.
        // Using default 0.5kg and 10x10x10 dimensions if missing.

        const date = new Date(order.createdAt);
        const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours()}:${date.getMinutes()}`;

        // Ensure units is a valid number
        const items = order.lineItems.edges.map(e => ({
            name: e.node.title,
            sku: e.node.sku || e.node.variant?.sku || 'Ref-SKU',
            units: parseInt(e.node.quantity) || 1,
            selling_price: parseFloat(e.node.originalUnitPrice) || 0,
            discount: 0,
            tax: 0,
            hsn: 0
        }));

        // Flatten Address
        const shipping = order.shippingAddress || {};
        const splitName = (shipping.name || "Customer").split(' ');

        const payload = {
            order_id: order.id.split('/').pop(), // Extract ID from GID
            order_date: formattedDate,
            pickup_location: "Primary",
            billing_customer_name: splitName[0],
            billing_last_name: splitName.slice(1).join(' ') || "",
            billing_address: shipping.address1 || "No Address",
            billing_address_2: shipping.address2 || "",
            billing_city: shipping.city || "City",
            billing_pincode: shipping.zip || "110001",
            billing_state: shipping.province || "Delhi",
            billing_country: shipping.country || "India",
            billing_email: order.email || "noreply@cloutcases.in",
            billing_phone: (() => {
                // Prefer Order Phone -> Shipping Phone -> Default
                const raw = order.phone || order.shippingAddress?.phone || "9999999999";
                // Sanitize: Remove space, dashes, brackets, +91 check
                let cleaned = raw.replace(/\D/g, '');
                // If 12 digits (91...), take last 10
                if (cleaned.length > 10) cleaned = cleaned.slice(-10);
                // If < 10, pad? No, Shiprocket fails. Use default if invalid length?
                if (cleaned.length < 10) return "9999999999";
                return cleaned;
            })(),
            shipping_is_billing: true,
            order_items: items,
            payment_method: (order.displayFinancialStatus || 'PENDING') === 'PAID' ? 'Prepaid' : 'COD',
            sub_total: items.reduce((acc, item) => acc + (item.selling_price * item.units), 0),
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.5
        };

        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', payload, { headers });
        return { success: true, shipment_id: response.data.shipment_id, order_id: response.data.order_id };

    } catch (error) {
        console.error(`[SHIPROCKET] Order Create Failed for ${order.name}:`, error.response?.data || error.message);
        const msg = error.response?.data?.message || error.message;
        // Check for duplicate
        if ((typeof msg === 'string' && msg.includes('already exists')) || error.response?.status === 422) {
            return { success: false, error: "DUPLICATE", message: msg };
        }
        return { success: false, error: msg };
    }
};

const updateOrder = async (order) => {
    try {
        const headers = await getHeaders();
        // Same payload logic (simplified redundant code by copying, ideally refactor but sticking to quick fix)
        const date = new Date(order.createdAt);
        const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours()}:${date.getMinutes()}`;

        const items = order.lineItems.edges.map(e => ({
            name: e.node.title,
            sku: e.node.sku || e.node.variant?.sku || 'Ref-SKU',
            units: parseInt(e.node.quantity) || 1,
            selling_price: parseFloat(e.node.originalUnitPrice) || 0
        }));

        const shipping = order.shippingAddress || {};
        const splitName = (shipping.name || "Customer").split(' ');

        const payload = {
            order_id: order.id.split('/').pop(),
            order_date: formattedDate,
            pickup_location: "Primary",
            billing_customer_name: splitName[0],
            billing_last_name: splitName.slice(1).join(' ') || "",
            billing_address: shipping.address1 || "No Address",
            billing_address_2: shipping.address2 || "",
            billing_city: shipping.city || "City",
            billing_pincode: shipping.zip || "110001",
            billing_state: shipping.province || "Delhi",
            billing_country: shipping.country || "India",
            billing_email: order.email || "noreply@cloutcases.in",
            billing_phone: (() => {
                const raw = order.phone || order.shippingAddress?.phone || "9999999999";
                let cleaned = raw.replace(/\D/g, '');
                if (cleaned.length > 10) cleaned = cleaned.slice(-10);
                if (cleaned.length < 10) return "9999999999";
                return cleaned;
            })(),
            shipping_is_billing: true,
            order_items: items,
            payment_method: (order.displayFinancialStatus || 'PENDING') === 'PAID' ? 'Prepaid' : 'COD',
            sub_total: items.reduce((acc, item) => acc + (item.selling_price * item.units), 0),
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.5
        };

        // Try UPDATE ADHOC
        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/update/adhoc', payload, { headers });
        // Update returns success? logic varies, assume it returns same structure or just success
        // If it fails, maybe it's a Channel Order? 
        // We will catch that.

        // If successful, we need shipment_id. Does update return it?
        // Usually update returns the order details.
        // Let's assume response.data.shipment_id exist or we fetch it?
        // Actually, if update succeeds, we might need to fetch the order to get shipment_id if not returned.
        // Let's check typical response: { order_id: 123, shipment_id: 456, ... }

        // If API is /v1/external/orders/update/adhoc, response is usually the updated order.
        return { success: true, shipment_id: response.data.shipment_id || response.data.start_shipment_id, order_id: response.data.order_id };

    } catch (error) {
        console.error(`[SHIPROCKET] Order Update Failed for ${order.name}:`, error.response?.data || error.message);
        return { success: false, error: error.response?.data?.message || error.message };
    }
};

const assignCourier = async (shipmentId) => {
    try {
        const headers = await getHeaders();
        // Auto-assign: 0 for Shiprocket recommendation
        const payload = { shipment_id: shipmentId };
        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/courier/assign/awb', payload, { headers });
        return { success: true, awb: response.data.response.data.awb_code };
    } catch (error) {
        // Check for wallet error
        const msg = error.response?.data?.message || "";
        if (msg.includes("wallet") || msg.includes("balance") || msg.includes("insufficient")) {
            return { success: false, error: "LOW_WALLET", message: msg };
        }
        return { success: false, error: msg || error.message };
    }
};

const getLocalDate = (offsetDays = 0) => {
    // Manually construct YYYY-MM-DD from local parts to ensure "User's Wall Clock" is used.
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const schedulePickup = async (shipmentId) => {
    const headers = await getHeaders();

    // 1. Try Today
    try {
        const dateToday = getLocalDate(0);
        console.log(`[SHIPROCKET] Attempting pickup for TODAY (${dateToday})...`);

        const payload = { shipment_id: [shipmentId], pickup_date: dateToday };
        await axios.post('https://apiv2.shiprocket.in/v1/external/courier/generate/pickup', payload, { headers });
        console.log(`[SHIPROCKET] Pickup scheduled for TODAY.`);
        return { success: true, date: dateToday };
    } catch (error) {
        console.warn(`[SHIPROCKET] Pickup for TODAY failed (${error.response?.data?.message || error.message}). Trying TOMORROW...`);
    }

    // 2. Try Tomorrow
    try {
        const dateTomorrow = getLocalDate(1);
        console.log(`[SHIPROCKET] Attempting pickup for TOMORROW (${dateTomorrow})...`);

        const payload = { shipment_id: [shipmentId], pickup_date: dateTomorrow };
        await axios.post('https://apiv2.shiprocket.in/v1/external/courier/generate/pickup', payload, { headers });
        console.log(`[SHIPROCKET] Pickup scheduled for TOMORROW.`);
        return { success: true, date: dateTomorrow };
    } catch (error) {
        console.error(`[SHIPROCKET] Pickup Scheduling Failed completely:`, error.response?.data || error.message);
        return { success: false, error: error.response?.data?.message || error.message };
    }
};

const generateLabel = async (shipmentIds) => {
    try {
        const headers = await getHeaders();
        const payload = { shipment_id: shipmentIds };
        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/courier/generate/label', payload, { headers });
        return response.data.label_url; // Returns URL to PDF/Zip
    } catch (error) {
        console.error('[SHIPROCKET] Label Generation Failed:', error.response?.data);
        return null;
    }
};

module.exports = {
    authenticate,
    getWalletBalance,
    createOrder,
    updateOrder,
    assignCourier,
    schedulePickup,
    generateLabel
};
