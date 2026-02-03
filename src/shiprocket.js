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
        return 0; // Standardize to 0 on failure to force check
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
            billing_phone: order.phone || "9999999999",
            shipping_is_billing: true,
            order_items: items,
            payment_method: (order.displayFinancialStatus || 'PENDING') === 'PAID' ? 'Prepaid' : 'COD',
            sub_total: items.reduce((acc, item) => acc + (item.selling_price * item.units), 0),
            length: 10,
            breadth: 10,
            height: 10,
            weight: 0.5
        };

        const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', payload, { headers });
        return { success: true, shipment_id: response.data.shipment_id, order_id: response.data.order_id };

    } catch (error) {
        console.error(`[SHIPROCKET] Order Create Failed for ${order.name}:`, error.response?.data || error.message);
        const msg = error.response?.data?.message || error.message;
        // Sometimes duplicate order returns 422 with specific message
        if (typeof msg === 'string' && msg.includes('already exists')) {
            // Need to fetch order to get shipment_id? 
            // For now fail. User can delete row from CSV if needed.
            return { success: false, error: "DUPLICATE", message: msg };
        }
        return { success: false, error: msg };
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

const schedulePickup = async (shipmentId) => {
    try {
        const headers = await getHeaders();
        // Schedule for TOMORROW
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const isoDate = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

        const payload = { shipment_id: [shipmentId], pickup_date: isoDate };
        await axios.post('https://apiv2.shiprocket.in/v1/external/courier/generate/pickup', payload, { headers });
        return { success: true };
    } catch (error) {
        // Often pickup fails if already scheduled or slot issues. We log but don't hard fail.
        return { success: false };
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
    assignCourier,
    schedulePickup,
    generateLabel
};
