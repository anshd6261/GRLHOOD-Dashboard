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
const pending = {}; // chatId -> { orderNumber, sentMessage, customerName, sentAt }

/* WhatsApp-style formatting → HTML (bold *x* / italic _x_ / mono ```x```) */
const waFmt = (t) => String(t || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\*(.+?)\*/g, '<b>$1</b>')
  .replace(/_(.+?)_/g, '<i>$1</i>')
  .replace(/```(.+?)```/g, '<code>$1</code>')
  .replace(/\n/g, '<br>');

/* Build a WhatsApp chat mockup from the REAL message texts. */
function chatHtml({ name, number, sent, reply, sentTime, replyTime }) {
  const bubble = (html, out, time, ticks) => `
    <div style="display:flex;justify-content:${out ? 'flex-end' : 'flex-start'};margin:2px 0">
      <div style="max-width:78%;background:${out ? '#d9fdd3' : '#fff'};border-radius:9px;padding:6px 9px 5px;
        box-shadow:0 1px 0.5px rgba(0,0,0,.13);font-size:14.2px;line-height:19px;color:#111b21;position:relative">
        <span>${html}</span>
        <span style="float:right;margin:6px 0 -4px 8px;font-size:11px;color:#667781;white-space:nowrap">${time}${out ? ` <span style="color:#53bdeb">✓✓</span>` : ''}</span>
      </div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
  <style>*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
  code{font-family:monospace;background:rgba(0,0,0,.05);padding:0 3px;border-radius:3px}</style></head>
  <body style="width:390px;background:#efeae2">
    <div style="background:#008069;color:#fff;padding:10px 12px;display:flex;align-items:center;gap:11px">
      <span style="font-size:22px">‹</span>
      <div style="width:38px;height:38px;border-radius:50%;background:#dfe5e7;display:flex;align-items:center;justify-content:center;color:#008069;font-weight:700">${(name || 'C')[0].toUpperCase()}</div>
      <div style="line-height:1.25"><div style="font-weight:600;font-size:16px">${name || number}</div>
      <div style="font-size:12.5px;opacity:.85">+91 ${number}</div></div>
    </div>
    <div style="background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%224%22 height=%224%22><rect width=%224%22 height=%224%22 fill=%22%23efeae2%22/></svg>');
      padding:14px 12px 18px;min-height:520px">
      <div style="text-align:center;margin:6px 0 12px"><span style="background:#fff;color:#54656f;font-size:12px;padding:5px 12px;border-radius:8px;box-shadow:0 1px 0.5px rgba(0,0,0,.13)">Today</span></div>
      ${bubble(waFmt(sent), true, sentTime, true)}
      ${reply ? bubble(waFmt(reply), false, replyTime) : ''}
    </div>
  </body></html>`;
}

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

const hhmm = (d) => d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

/** Render a WhatsApp-style mockup from the real sent+reply text, upload as proof. */
async function renderAndUpload(ctx, replyText) {
  let page;
  try {
    const number = ctx.chatId.split('@')[0].replace(/^91/, '');
    const html = chatHtml({
      name: ctx.customerName, number,
      sent: ctx.sentMessage, reply: replyText,
      sentTime: hhmm(new Date(ctx.sentAt)), replyTime: hhmm(new Date()),
    });
    page = await client.pupBrowser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load' });
    const el = await page.$('body');
    const buf = await el.screenshot({ type: 'png' });
    const imageBase64 = `data:image/png;base64,${buf.toString('base64')}`;
    await axios.post(`${DASHBOARD_URL}/api/ndr/proof`, {
      orderNumber: ctx.orderNumber, imageBase64, author: 'whatsapp-auto',
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 });
    console.log(`[WA] proof rendered & uploaded → ${ctx.orderNumber}`);
  } catch (e) {
    console.warn(`[WA] render failed for ${ctx.orderNumber}:`, e.message);
  } finally { if (page) await page.close().catch(() => {}); }
}

// Incoming customer reply → render mockup from the real texts + upload
client.on('message', async (msg) => {
  try {
    if (msg.fromMe) return;
    const ctx = pending[msg.from];
    if (!ctx) return;
    delete pending[msg.from];
    await renderAndUpload(ctx, msg.body || '');
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
    const { recipient, message, orderNumber, customerName } = req.body || {};
    const digits = String(recipient || '').replace(/\D/g, '');
    if (digits.length < 10) return res.status(400).json({ error: 'invalid recipient' });
    const chatId = `${digits}@c.us`;
    await client.sendMessage(chatId, message);
    if (orderNumber) pending[chatId] = { orderNumber, chatId, sentMessage: message, customerName: customerName || '', sentAt: Date.now() };
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`[WA] bridge listening on :${PORT}`));
