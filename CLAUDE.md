# CLAUDE.md - GRLHOOD Dashboard

## What is this?
Full-stack Shopify fulfillment automation platform. Orders flow from Shopify → processed with RTO risk scoring → CSV generated → uploaded to NBE portal + Dropbox → shipped via RapidShyp → labels generated.

Live: grlhood-dashboard.vercel.app

## Architecture
- **Frontend**: React 19 + Vite + Tailwind CSS 4 → deployed on **Vercel** (static CDN)
- **Backend**: Node.js + Express 5 → deployed on **Railway** (static IP for API whitelisting)
- **Key integrations**: Shopify (orders), RapidShyp (shipping), Shiprocket Sense (RTO prediction), NBE/NextBigE (supplier portal), Dropbox (backup), Gmail (notifications)

## Project Structure
```
src/                    # Backend
  server.js             # Express API (30+ endpoints)
  shopify.js            # Shopify GraphQL Admin API
  processor.js          # Raw Shopify order → fulfillment row transformation
  rapidshyp.js          # RapidShyp: approve, assign AWB, labels, track, cancel, schedule pickup
  shiprocket_sense.js   # Shiprocket Sense RTO prediction (cache + API)
  dropbox.js            # Dropbox OAuth2 upload (CSVs + labels)
  csv_generator.js      # Supplier CSV + Financial CSV generation
  uploader.js           # Legacy Puppeteer portal upload
  calculations.js       # P&L, cash position, daily breakdown
  analytics.js          # Dashboard analytics
  verification.js       # Order verification state
  alerts.js             # Business alerts

frontend/src/
  App.jsx               # Main shell (fetch orders, RTO enrichment, tabs)
  components/
    FulfillOrdersWizard.jsx  # 8-step wizard: Repeats → RTO Sort → Devices → CSV → Download → Ship → Labels → Done
    ShipOrdersModal.jsx      # Quick-ship pipeline: Review → Risk → Verify → Assign → Labels → Backup → Done
```

## Key Flows

### Order Fulfillment (FulfillOrdersWizard)
1. **Repeats** - Detect repeat customers (same phone, different names)
2. **RTO Sort** - AI risk scoring via Shiprocket Sense (High/Medium/Low)
3. **Devices** - Flag missing device/model info
4. **CSV** - Interactive CSV preview & editing
5. **Download** - Generate supplier + financial CSVs, upload to Dropbox + NBE portal
6. **Ship** - Auto-approve in RapidShyp → Assign AWB → Schedule pickup
7. **Labels** - Generate shipping label PDFs
8. **Done** - Summary

### Order IDs in the Wizard
- Orders initially come from Shopify (`#4060` → processor strips `#` → `orderId = "4060"`).
- In the wizard, users edit/delete rows in the **CSV step** (step 3). This produces `workingOrders`.
- The **Download step** (step 4) exports `workingOrders` as the approved CSV.
- The **Ship step** (step 5) uses `uniqueIds` derived from `workingOrders` — i.e., the order IDs come from the **approved CSV**, not directly from Shopify.
- `uniqueIds = [...new Set(workingOrders.map(o => o.orderId))]` — only orders that survived CSV review.
- RapidShyp stores them as `seller_order_id` (e.g., `#4060`).
- The `resolveOrder()` function in `rapidshyp.js` tries 3 methods to match: session API map, `GET /shipment_details`, `POST /track_order`.

### RTO Cache
- Shiprocket Sense results are cached in-memory + `/tmp/rto_cache.json` (Vercel warm instance).
- Frontend persists cache in `localStorage('rto_cache')` and sends it back via POST `/api/orders` body to warm the server on cold starts.
- `data/rto_cache.json` is a repo-level backup but writes fail on Vercel (read-only filesystem).

## External APIs

### RapidShyp (Shipping)
- Base: `https://api.rapidshyp.com/rapidshyp/apis/v1`
- Auth: `rapidshyp-token` header (API key) for public endpoints; `Authorization: Bearer JWT` for session endpoints
- Key endpoints: `/approve_orders`, `/assign_awb`, `/schedule_pickup`, `/generate_label`, `/track_order`, `/shipment_details`, `/cancel_order`

### Shiprocket Sense (RTO Prediction)
- Endpoint: `POST https://sense.shiprocket.in/v3/rto/predict`
- Auth: Basic (API_KEY:API_SECRET)
- Returns risk level, probability, reasons, risk tags

### NBE / NextBigE (Supplier Portal)
- Base: `https://5060265239-api.nextbige.com`
- Auth: `X-Customer-Api-Key` header
- Upload flow: `POST /api/external/customer-uploads/` → `POST /api/external/customer-orders/create-order/`
- Docs: `nbe-api-docs.md` in repo root

### Dropbox (Backup)
- OAuth2 with refresh token → short-lived access token
- Folder structure: `/ORDERS/{Month}/{Date} Order/` containing supplier CSV, financial CSV, labels PDF
- Mode: overwrite (no auto-rename)

## Environment Variables
```
# Shopify
SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET

# RapidShyp
RAPIDSHYP_JWT, RAPIDSHYP_API_KEY

# Shiprocket Sense
SHIPROCKET_SENSE_API_KEY, SHIPROCKET_SENSE_API_SECRET

# NBE Portal
NBE_API_BASE, NBE_API_KEY

# Dropbox
DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET

# Gmail
GMAIL_USER, GMAIL_APP_PASSWORD

# Config
PORT (default 3001), GST_RATE (default 18), DETAILS_LOOKBACK_DAYS (default 3)
```

## Dev Commands
```bash
npm install && npm install --prefix frontend
npm run dev          # Backend on :3001, Frontend on :5173
npm run build        # Build frontend
npm start            # Production
```

## Deployment
- **Railway** (backend): auto-deploys from GitHub, static outgoing IP for RapidShyp whitelist
- **Vercel** (frontend): auto-deploys from GitHub, set `VITE_API_URL` to Railway URL
