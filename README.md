# GRLHOOD Dashboard

Shopify fulfillment automation platform. Order management, RTO prediction, shipping via RapidShyp, financial tracking, and supplier management.

Live at: [grlhood-dashboard.vercel.app](https://grlhood-dashboard.vercel.app)

---

## Tech Stack

| Layer | Tech |
|-------|------|
| **Frontend** | React 19 + Vite + Tailwind CSS 4 + Framer Motion |
| **Backend** | Node.js + Express |
| **Deployment** | Vercel (frontend static + backend serverless) |
| **Styling** | Glassmorphism dark theme, dusty pink accents |

---

## Fulfillment Wizard (8 Steps)

The core workflow in `FulfillOrdersWizard.jsx`:

1. **Repeats** - Detect repeat customers (same phone, different names)
2. **RTO Sort** - Sort COD orders by AI risk score (High/Medium/Low)
3. **Devices** - Flag orders with missing device/product info
4. **CSV** - Interactive CSV preview & inline editing
5. **Download** - Download CSVs (supplier + financial) + Dropbox backup. Auto-approves unapproved orders in RapidShyp on entry.
6. **Ship** - Bulk assign AWB via RapidShyp. Resolves shipment IDs for all CSV orders, then assigns couriers.
7. **Labels** - Generate shipping label PDF + failure report CSV for failed orders
8. **Done** - Summary

---

## API Endpoints

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Health check |
| `GET` | `/api/my-ip` | Outgoing IP |
| `GET` | `/api/v2/status` | Extended status (Gmail, Portal, Dropbox) |
| `POST` | `/api/login` | Authenticate (returns role + token) |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST` | `/api/orders` | Fetch orders (POST accepts inline RTO cache) |
| `GET` | `/api/orders/search` | Search orders by any field |
| `POST` | `/api/orders/:id/cancel` | Cancel order (RapidShyp + Shopify) |
| `POST` | `/api/orders/verify` | Mark order verified |
| `POST` | `/api/orders/unverify` | Unmark verified |
| `GET` | `/api/orders/verified` | List verified order IDs |
| `POST` | `/api/products/:id/assign-sku` | Auto-assign next SKU |

### RTO Prediction
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/rto-check` | Batch RTO risk check (Shiprocket Sense) |
| `POST` | `/api/rto-cache/warm` | Warm server RTO cache from frontend localStorage |
| `GET` | `/api/rto-cache/export` | Export server RTO cache |

### Export & Backup
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/download` | Generate CSV (supplier or financial) |
| `POST` | `/api/email-approval` | Email CSV for approval |
| `POST` | `/api/dropbox/upload` | Backup CSVs to Dropbox |
| `POST` | `/api/upload-portal` | Upload to supplier portal |
| `GET` | `/api/download-file/:filename` | Download temp file |

### Shipping (RapidShyp)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/rapidshyp/bulk-approve` | Bulk approve orders (uses `market_place_order_id`) |
| `POST` | `/api/rapidshyp/bulk-assign` | Bulk AWB assignment (accepts `shipmentMap` from approve) |
| `POST` | `/api/rapidshyp/label` | Generate single shipping label |
| `POST` | `/api/rapidshyp/bulk-labels-dropbox` | Bulk labels + Dropbox upload |
| `POST` | `/api/rapidshyp/bulk-labels-by-orders` | Labels by order IDs (fallback) |
| `GET` | `/api/rapidshyp/wallet` | Wallet balance |
| `GET` | `/api/proxy-pdf` | Proxy PDF download (avoids CORS) |

### Financials
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/financials/summary` | Today + MTD P&L + alerts |
| `GET` | `/api/financials/breakdown` | Daily P&L by date range |
| `POST` | `/api/financials/sync-payu` | Sync PayU settlements |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/dashboard` | Full analytics dashboard |
| `POST` | `/api/analytics/ad-spend` | Log daily ad spend |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/history` | Download batch history |
| `PUT` | `/api/history/:id` | Update batch rows |
| `POST` | `/api/consultation/submit` | Submit CA consultation form |

---

## Backend Modules

| Module | Purpose |
|--------|---------|
| `server.js` | Express API server |
| `shopify.js` | Shopify GraphQL client (orders, products, cancellation) |
| `processor.js` | Order data transformation (Shopify raw -> fulfillment rows) |
| `rapidshyp.js` | RapidShyp API (approve, AWB assign, labels, tracking, wallet) |
| `shiprocket_sense.js` | Shiprocket Sense RTO prediction + 3-layer cache |
| `rto_predictor.js` | Local XGBoost RTO model (300 trees, fallback) |
| `riskValidator.js` | Address/phone validation, duplicate/fraud detection |
| `calculations.js` | P&L metrics, cash position, daily breakdown |
| `alerts.js` | Business alerts (settlement delays, RTO risk, ROAS) |
| `analytics.js` | Dashboard analytics |
| `csv_generator.js` | Supplier & financial CSV export |
| `excel.js` | Styled Excel workbook generation |
| `dropbox.js` | Dropbox OAuth2 + file upload |
| `email.js` | Gmail SMTP (approval emails) |
| `database.js` | SQLite schema |
| `history.js` | Batch download tracking |
| `shiprocket.js` | Shiprocket shipping API |
| `sync_payu.js` | PayU settlement sync |
| `sync_meta_ads.js` | Meta Ads API sync |
| `sync_shiprocket.js` | Shiprocket data sync |
| `sync_shopify.js` | Shopify data sync |
| `verification.js` | Order verification logic |
| `products_db.js` | Product database |
| `uploader.js` | Supplier portal upload |

## Frontend

### Pages
| Page | Description |
|------|-------------|
| `HomeAnalytics.jsx` | Order cards with RTO risk badges, product thumbnails |
| `FinancialDashboard.jsx` | Today vs MTD P&L, cash position, alerts |
| `ProfitDashboard.jsx` | 30-day analytics, cost breakdown, ad spend |
| `ProductAnalysis.jsx` | Top models & categories |
| `SupplierDashboard.jsx` | Accounts payable, vendor balances |
| `ConsultationForm.jsx` | CA tax planning form |

### Components
| Component | Description |
|-----------|-------------|
| `FulfillOrdersWizard.jsx` | 8-step fulfillment pipeline |
| `ShipOrdersModal.jsx` | RapidShyp shipping pipeline |
| `AestheticDetailModal.jsx` | Order detail view |
| `EditOrderModal.jsx` | Inline order editor |
| `CsvEditorModal.jsx` | CSV row editor |

---

## RapidShyp Integration

Two API layers:

- **Public API** (`rapidshyp-token` header) - approve, assign AWB, track, labels, cancel
- **Session API** (JWT Bearer) - order listing, wallet balance

Key flow:
1. `fetchAllOrders()` paginates session API to build order map (PAGE_SIZE=50, indexed by seller_order_id + market_place_order_id)
2. `bulkApproveOrders()` sends `market_place_order_id` (Shopify internal ID) to public API `/approve_orders`. Caches `shipment_id` from response.
3. `bulkAssignAWB()` accepts `shipmentMap` from frontend (survives Vercel serverless isolation). Falls back to parallel `track_order` calls (concurrency: 10) for orders not in the map.
4. `assign_awb` uses the resolved `shipment_id` to get AWB + courier assignment.

### RTO Cache (3-layer + localStorage)
- In-memory Map (per serverless instance)
- `/tmp` JSON file
- `data/rto_cache.json` (repo)
- Browser `localStorage` (frontend sends via POST inline with orders request)

---

## Environment Variables

### Required
```env
SHOPIFY_STORE_DOMAIN=grlhood-3.myshopify.com
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=

RAPIDSHYP_JWT=
RAPIDSHYP_API_KEY=

SHIPROCKET_SENSE_API_KEY=
SHIPROCKET_SENSE_API_SECRET=
```

### Optional
```env
DROPBOX_REFRESH_TOKEN=
DROPBOX_APP_KEY=
DROPBOX_APP_SECRET=

GMAIL_USER=
GMAIL_APP_PASSWORD=

META_ACCESS_TOKEN=

PORTAL_URL=
PORTAL_USERNAME=
PORTAL_PASSWORD=

GST_RATE=18
DETAILS_LOOKBACK_DAYS=3
```

---

## Setup

```bash
npm install && npm install --prefix frontend
npm run dev
# Backend: http://localhost:3001
# Frontend: http://localhost:5173
```

## Deployment (Vercel)

Both frontend and backend deploy to Vercel via `vercel.json`:
- Frontend builds from `frontend/` to static CDN
- Backend runs `src/server.js` as serverless functions
- Routes: `/api/*` -> server.js, `/*` -> frontend

Auto-deploys on push to `main`.

---

## Integrations

| Service | Purpose |
|---------|---------|
| **Shopify** | Order source (GraphQL Admin API) |
| **RapidShyp** | Shipping - approve, AWB, labels, tracking |
| **Shiprocket Sense** | ML-powered RTO risk prediction |
| **Dropbox** | CSV & label PDF backup |
| **Gmail** | Approval email notifications |
| **Meta Ads** | Ad spend data |
