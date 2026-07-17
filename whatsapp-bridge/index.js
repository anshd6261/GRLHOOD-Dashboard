/**
 * GRLHOOD WhatsApp Bridge
 * ───────────────────────
 * A persistent, QR-paired WhatsApp Web session (whatsapp-web.js) that:
 *   1. Serves a QR page at /qr to pair the GRLHOOD number (scan once).
 *   2. POST /api/send { recipient, message, orderNumber } — sends the NDR
 *      verification message (called by the dashboard's auto-send).
 *   3. When that customer REPLIES, screenshots the REAL WhatsApp Web chat
 *      (their number at the top, full conversation) and uploads it to the
 *      dashboard as the order's permanent proof — genuine evidence, not a
 *      mock.
 *
 * Deploy on Railway (always-on). Env:
 *   BRIDGE_SECRET     shared secret; must match Vercel WHATSAPP_BRIDGE_SECRET
 *   DASHBOARD_URL     https://grlhood-dashboard.vercel.app
 *   PORT              provided by Railway
 */
const express = require('express');
const QRCode = require('qrcode');
const axios = require('axios');
const { Client, LocalAuth } = require('whatsapp-web.js');

const PORT = process.env.PORT || 8080;
const SECRET = process.env.BRIDGE_SECRET || '';
const DASHBOARD_URL = (process.env.DASHBOARD_URL || 'https://grlhood-dashboard.vercel.app').replace(/\/$/, '');

let lastQr = null;
let ready = false;
const pending = {}; // chatId -> { orderNumber, sentAt }  (awaiting a reply to capture)

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: process.env.WA_DATA_DIR || './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  },
});

client.on('qr', (qr) => { lastQr = qr; ready = false; console.log('[WA] QR updated — open /qr to scan'); });
client.on('ready', () => { ready = true; lastQr = null; console.log('[WA] ✅ paired & ready'); });
client.on('authenticated', () => console.log('[WA] authenticated'));
client.on('disconnected', (r) => { ready = false; console.warn('[WA] disconnected:', r); });

/** Screenshot the open chat with `chatId` and upload as the order's proof. */
async function captureAndUpload(chatId, orderNumber) {
  try {
    const chat = await client.getChatById(chatId);
    await chat.sendSeen().catch(() => {});
    // Drive the underlying WhatsApp Web page to the chat, then screenshot it.
    const page = client.pupPage;
    // Open the chat via the client's internal store (reliable across versions)
    await page.evaluate(async (id) => {
      const c = await window.Store.Chat.get(id);
      if (c) await window.Store.Cmd.openChatAt({ chat: c });
    }, chatId).catch(() => {});
    await new Promise(r => setTimeout(r, 2500)); // let messages render
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    const imageBase64 = `data:image/png;base64,${buf.toString('base64')}`;
    await axios.post(`${DASHBOARD_URL}/api/ndr/proof`, {
      orderNumber, imageBase64, author: 'whatsapp-auto',
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 });
    console.log(`[WA] proof captured & uploaded → ${orderNumber}`);
  } catch (e) {
    console.warn(`[WA] capture failed for ${orderNumber}:`, e.message);
  }
}

// Incoming customer reply → capture proof if we're awaiting one for this chat
client.on('message', async (msg) => {
  try {
    if (msg.fromMe) return;
    const ctx = pending[msg.from];
    if (!ctx) return;
    delete pending[msg.from];
    await new Promise(r => setTimeout(r, 1500));
    await captureAndUpload(msg.from, ctx.orderNumber);
  } catch (e) { console.warn('[WA] message handler:', e.message); }
});

client.initialize();

// ── HTTP API ──
const app = express();
app.use(express.json({ limit: '2mb' }));

const auth = (req, res, next) => {
  if (SECRET && req.headers.authorization !== `Bearer ${SECRET}`) return res.status(401).json({ error: 'unauthorized' });
  next();
};

app.get('/', (_, res) => res.json({ ok: true, ready, hasQr: !!lastQr }));
app.get('/status', (_, res) => res.json({ ready, hasQr: !!lastQr }));

app.get('/qr', async (req, res) => {
  if (ready) return res.send('<div style="font-family:sans-serif;padding:40px;text-align:center"><h2>✅ WhatsApp is paired</h2><p>The GRLHOOD bridge is live.</p></div>');
  if (!lastQr) return res.send('<div style="font-family:sans-serif;padding:40px;text-align:center"><h2>Starting…</h2><p>Refresh in a few seconds.</p></div>');
  const dataUrl = await QRCode.toDataURL(lastQr, { width: 320, margin: 2 });
  res.send(`<div style="font-family:sans-serif;padding:40px;text-align:center">
    <h2>Scan with GRLHOOD WhatsApp</h2>
    <p>WhatsApp → Settings → Linked Devices → Link a Device</p>
    <img src="${dataUrl}" style="border-radius:16px" />
    <p style="color:#999;font-size:13px">Page auto-refreshes every 20s</p>
    <script>setTimeout(()=>location.reload(),20000)</script>
  </div>`);
});

app.post('/api/send', auth, async (req, res) => {
  try {
    if (!ready) return res.status(503).json({ error: 'not paired yet — scan /qr' });
    const { recipient, message, orderNumber } = req.body || {};
    const digits = String(recipient || '').replace(/\D/g, '');
    if (digits.length < 10) return res.status(400).json({ error: 'invalid recipient' });
    const chatId = `${digits}@c.us`;
    await client.sendMessage(chatId, message);
    if (orderNumber) pending[chatId] = { orderNumber, sentAt: Date.now() };
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`[WA] bridge listening on :${PORT}`));
