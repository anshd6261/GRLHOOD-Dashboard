const axios = require('axios');

/**
 * WhatsApp bridge client (verygoodplugins/whatsapp-mcp style bridge).
 *
 * The bridge is a persistent process (Go/whatsmeow + REST wrapper) that must
 * run on an always-on host (Railway) and be QR-paired with the GRLHOOD
 * WhatsApp account. Configure:
 *   WHATSAPP_BRIDGE_URL    e.g. https://grlhood-wa.up.railway.app
 *   WHATSAPP_BRIDGE_SECRET shared secret sent as Authorization: Bearer
 *
 * Unconfigured → every call is a graceful no-op (auto-send simply stays off).
 */
const BRIDGE_URL = (process.env.WHATSAPP_BRIDGE_URL || '').replace(/\/$/, '');
const BRIDGE_SECRET = process.env.WHATSAPP_BRIDGE_SECRET || '';

const configured = () => !!BRIDGE_URL;

const post = async (path, body) => {
    const r = await axios.post(`${BRIDGE_URL}${path}`, body, {
        headers: { 'Content-Type': 'application/json', ...(BRIDGE_SECRET ? { Authorization: `Bearer ${BRIDGE_SECRET}` } : {}) },
        timeout: 30000,
    });
    return r.data;
};

/**
 * WhatsApp-formatted NDR verification message: bold/italic/monospace,
 * separate lines, unmissable ask.
 */
const buildNdrMessage = (o) => {
    const reason = o.ndrReason || o.ndrRemark || 'delivery attempt failed';
    return [
        '*GRLHOOD®* — Delivery Update 📦',
        '',
        `Hi *${o.customer?.name || 'there'}*,`,
        '',
        `The courier *${o.courier || ''}* just marked a delivery attempt on your order *${o.orderNumber}* as:`,
        `_"${reason}"_`,
        '',
        '⚠️ *Did anyone actually call or visit you for this delivery?*',
        '',
        'Please reply with:',
        '*1* — Yes, I was contacted',
        '*2* — No, nobody came',
        '',
        "We'll get your order re-attempted right away 💌",
    ].join('\n');
};

/** Send the NDR verification message. Returns { sent, message }. */
const sendNdrMessage = async (o) => {
    if (!configured()) return { sent: false, message: 'WhatsApp bridge not configured' };
    const phone = String(o.customer?.phone || '').replace(/\D/g, '').slice(-10);
    if (phone.length !== 10) return { sent: false, message: 'No valid customer phone' };
    try {
        await post('/api/send', { recipient: `91${phone}`, message: buildNdrMessage(o), orderNumber: o.orderNumber, customerName: o.customer?.name || '' });
        console.log(`[WA] NDR verification sent → ${o.orderNumber} (+91${phone})`);
        return { sent: true };
    } catch (e) {
        console.warn(`[WA] send failed for ${o.orderNumber}:`, e.response?.data?.error || e.message);
        return { sent: false, message: e.message };
    }
};

module.exports = { configured, buildNdrMessage, sendNdrMessage };
