# GRLHOOD WhatsApp Bridge

Persistent WhatsApp Web session that auto-sends NDR verification messages and
captures **real** chat screenshots as delivery proof (uploaded to the dashboard,
stored forever in Dropbox).

## Deploy on Railway (5 minutes)

1. **New Project → Deploy from GitHub repo** → pick `anshd6261/grlhood-dashboard`.
2. In the service **Settings → Root Directory**, set `whatsapp-bridge`.
   (Railway auto-detects the Dockerfile there.)
3. **Variables**:
   - `BRIDGE_SECRET` = a long random string (keep it)
   - `DASHBOARD_URL` = `https://grlhood-dashboard.vercel.app`
4. **Storage → Add Volume**, mount path `/app/.wwebjs_auth` (keeps the session
   so you only scan the QR once).
5. Deploy. Open the service's public URL + `/qr` (e.g. `https://xxx.up.railway.app/qr`).
6. On the GRLHOOD phone: **WhatsApp → Settings → Linked Devices → Link a Device**,
   scan the QR. Page flips to "✅ paired".

## Connect the dashboard

In **Vercel → grlhood-dashboard → Settings → Environment Variables**:

- `WHATSAPP_BRIDGE_URL` = your Railway URL (no trailing slash)
- `WHATSAPP_BRIDGE_SECRET` = the same `BRIDGE_SECRET`

Redeploy the Vercel project. Done — fresh NDRs now auto-message the customer,
and when they reply the real chat screenshot auto-attaches to the order.

## Endpoints

- `GET /qr` — pairing page
- `GET /status` — `{ ready, hasQr }`
- `POST /api/send` (Bearer BRIDGE_SECRET) — `{ recipient, message, orderNumber }`
