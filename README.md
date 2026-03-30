# GRLHOOD Dashboard

**Full-Stack Shopify Fulfillment Automation Platform** for e-commerce order management, AI-powered RTO prediction, financial tracking, shipping automation, and supplier management.

Live at: [grlhood-dashboard.vercel.app](https://grlhood-dashboard.vercel.app)

---

## Architecture

| Layer | Technology | Hosting |
|-------|-----------|---------|
| **Frontend** | React 19 + Vite 7 + Tailwind CSS 4 | Vercel (Static CDN) |
| **Backend** | Node.js + Express 5 | Railway (Static IP) |
| **Database** | SQLite (better-sqlite3) | Local / Ephemeral |
| **Styling** | Glassmorphism Dark Theme + Framer Motion | - |
| **PWA** | Vite PWA Plugin + Workbox | Auto-update SW |

### Deployment Flow

```
GitHub Repo
    |
    +---> Vercel (Frontend Only)
    |       - Builds frontend/
    |       - Serves static dist/ on CDN
    |       - VITE_API_URL -> Railway backend
    |
    +---> Railway (Backend API)
            - Runs src/server.js
            - Static outgoing IP (for RapidShyp whitelist)
            - All /api/* endpoints
```

---

## Tech Stack

### Backend
| Package | Version | Purpose |
|---------|---------|---------|
| Express | 5.2.1 | REST API framework |
| Axios | 1.6.0 | HTTP client for external APIs |
| Nodemailer | 6.9.16 | Gmail SMTP for approval emails |
| Dropbox SDK | 10.34.0 | CSV/label backup to Dropbox |
| ExcelJS | 4.4.0 | Styled Excel workbook generation |
| csv-parse / csv-stringify | 6.x | CSV import/export |
| better-sqlite3 | 12.6.2 | SQLite with WAL mode (optional) |
| UUID | 9.0.0 | Unique batch/job IDs |
| dotenv | 16.3.0 | Environment variable management |
| node-cron | 3.0.0 | Scheduled background jobs |

### Frontend
| Package | Version | Purpose |
|---------|---------|---------|
| React | 19.2.0 | UI framework |
| Vite | 7.2.4 | Build tool with HMR |
| Tailwind CSS | 4.1.18 | Utility-first styling |
| Framer Motion | 12.30.0 | Animations & transitions |
| Recharts | 3.8.0 | Charts (Line, Bar, Pie) |
| Lucide React | 0.563.0 | Icon library |
| React DatePicker | 9.1.0 | Date range selection |
| date-fns | 4.1.0 | Date utilities |
| Capacitor | 8.2.0 | Native mobile (iOS) support |
| Three.js | 0.183.2 | 3D graphics |

---

## Features

### 1. Order Management & Fulfillment
- **Real-time Shopify sync** via GraphQL Admin API
- **Smart order processing** with automatic product categorization
- **8-step Fulfillment Wizard:**
  1. Detect repeat customers (same phone, different names)
  2. AI-powered RTO risk sorting (High/Medium/Low)
  3. Flag missing device/product info
  4. Interactive CSV preview & editing
  5. CSV download (supplier or financial format)
  6. RapidShyp courier assignment & AWB generation
  7. Bulk shipping label generation (PDF)
  8. Auto-backup to Dropbox
- **Bulk operations:** Select multiple orders, export, ship, cancel
- **Order search** across all fields (ID, customer name, phone, address)

### 2. AI-Powered RTO Prediction (Dual Engine)
- **Shiprocket Sense API** (Primary) - ML model trained on 4.8B+ data points
  - Pincode-level risk scoring
  - Buyer experience analysis
  - Address validity checks
  - Mobile number pattern analysis
  - Returns: risk level, probability score (0-100), detailed reasons
- **Local XGBoost Model** (Fallback) - 300 decision trees, RMSE 0.0095
  - 5 features: pincode_risk, customer_risk, rto_risk, address_risk, composite
  - High-RTO pincode detection (NE India, UP, Rajasthan prefixes)
  - Junk/bogus name detection

### 3. Risk Management & Fraud Detection
- **Address validation** - minimum length, blocklist patterns (test, dummy, NA, etc.)
- **Phone validation** - Indian 10-digit format, valid prefix (6-9)
- **Duplicate detection** - Same address with different customer names
- **Copied number flagging** - Same phone across orders with different names
- **Suspicious model detection** - Multiple different phone models in one order

### 4. Shipping Integration (RapidShyp)
- **Bulk AWB assignment** - Auto-assign best courier partner
- **Bulk label generation** - PDF shipping labels
- **Wallet balance** monitoring
- **Order tracking** with real-time status
- **Auto-cancellation** sync (RapidShyp + Shopify)
- **Rate limit handling** - Exponential backoff (3 retries)

### 5. Financial Dashboard
- **Real-time P&L** - Today vs Month-to-Date comparison
  - Revenue, COGS, Shipping costs, RTO losses
  - Gateway fees, Ad spend, Net profit
  - Blended margin %, ROAS
- **Cash Position** tracking
  - Net cash, settled amount, total cash out
  - Pending COD & prepaid settlements
  - RTO risk value exposure
- **Daily P&L breakdown** with date range filtering
- **Business alerts:**
  - Settlement delays (>4 days unpaid)
  - RTO risk (shipped >7 days, not delivered)
  - Low ROAS campaigns (<1.0)

### 6. Analytics & Reporting
- **30-day profit/loss dashboard** with configurable period
- **Cost distribution** breakdown (COGS, shipping, ads, RTO loss)
- **Ad spend tracking** with daily entry logging
- **Key metrics:** AOV, CAC, ROAS, blended margin
- **Per-order profitability** analysis
- **Product analysis** - Top models, categories, unit volumes

### 7. Export & Backup
- **Supplier CSV** - Category, Model, SKU, Customer, Order ID, Preview URL (no pricing)
- **Financial CSV** - Full pricing with COGS, GST calculation, totals
- **Styled Excel** - Pink-themed workbook with borders, currency formatting, striped rows
- **Dropbox auto-upload** - Labels PDF + CSVs to `/ORDERS/[Month]/[Date] Order/`
- **Email approval** - Send CSV to stakeholder for review
- **Portal upload** - Puppeteer-automated supplier portal submission

### 8. Supplier Dashboard
- Accounts payable tracking
- Vendor payment schedules & outstanding balances
- Overdue invoice aging (1-30, 31-60, 61+ days)
- Cash outflow timeline

### 9. CA Consultation Form
- Multi-section tax planning questionnaire
  - Business structure (Proprietorship / LLP / Pvt Ltd)
  - Tax rates & savings (80C, 80D, HRA, depreciation)
  - Business expenses tracking
  - GST compliance checklist
- Auto-saved to server for CA review

---

## API Endpoints

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Server health check |
| `GET` | `/api/my-ip` | Outgoing IP (for API whitelisting) |
| `GET` | `/api/v2/status` | Extended status (Gmail, Portal, Dropbox) |

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/login` | Authenticate (returns role + token) |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/orders` | Fetch & process orders (with RTO risk) |
| `GET` | `/api/orders/search` | Search orders by any field |
| `POST` | `/api/orders/:id/cancel` | Cancel order (RapidShyp + Shopify) |
| `POST` | `/api/products/:id/assign-sku` | Auto-assign next SKU |

### Export & Upload
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/download` | Generate CSV (supplier or financial) |
| `POST` | `/api/email-approval` | Email CSV for approval |
| `POST` | `/api/upload-portal` | Upload to supplier portal |
| `POST` | `/api/dropbox/upload` | Backup CSV to Dropbox |
| `GET` | `/api/download-file/:filename` | Download temp files |

### Shipping (RapidShyp)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/rapidshyp/bulk-assign` | Bulk AWB courier assignment |
| `POST` | `/api/rapidshyp/label` | Generate shipping label PDF |
| `POST` | `/api/rapidshyp/bulk-labels-dropbox` | Labels + auto Dropbox upload |
| `GET` | `/api/rapidshyp/wallet` | Wallet balance |

### Financials
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/financials/summary` | Today + MTD P&L + alerts |
| `GET` | `/api/financials/breakdown` | Daily P&L by date range |
| `POST` | `/api/financials/sync-payu` | Sync PayU settlements |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/dashboard` | Full analytics (configurable days) |
| `POST` | `/api/analytics/ad-spend` | Log daily ad spend |

### History & Misc
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/history` | Download batch history |
| `PUT` | `/api/history/:id` | Update batch rows |
| `POST` | `/api/consultation/submit` | Submit CA consultation form |

---

## Frontend Pages

### Main App (`App.jsx`)
- **Fulfill Tab** - Order table with selection, filtering (All / Missing Device / Repeat Orders), bulk actions
- **Dashboard Tab** - Coming soon placeholder
- **Finance Tab** - Financial dashboard embed
- **Settings Tab** - API connectivity status, download history

### Pages
| Page | Description |
|------|-------------|
| `HomeAnalytics.jsx` | Order cards with RTO risk badges, cancel buttons, product thumbnails, payment charts |
| `FinancialDashboard.jsx` | Today vs MTD P&L, cash position, settlement alerts |
| `ProfitDashboard.jsx` | 30-day analytics, cost breakdown charts, ad spend entry, order profitability table |
| `ProductAnalysis.jsx` | Top 10 models & categories, unit volume aggregation |
| `SupplierDashboard.jsx` | Accounts payable, vendor balances, overdue invoices |
| `ConsultationForm.jsx` | Multi-section CA tax planning form |

### Components
| Component | Description |
|-----------|-------------|
| `FulfillOrdersWizard.jsx` | 8-step fulfillment pipeline with cancel, risk review, CSV preview |
| `ShipOrdersModal.jsx` | 7-step RapidShyp shipping pipeline (risk scan, courier assign, labels, backup) |
| `AestheticDetailModal.jsx` | Rich order detail view (shipping, products, pricing, risk, tracking) |
| `EditOrderModal.jsx` | Inline order field editor |
| `CsvEditorModal.jsx` | CSV row editor with column management |
| `GlowBlobs.jsx` | Animated background orbs |
| `DottedBackground.jsx` | Grid pattern overlay |

---

## Backend Modules

| Module | Description |
|--------|-------------|
| `server.js` | Express API server (25+ endpoints) |
| `shopify.js` | Shopify GraphQL client (orders, products, cancellation) |
| `processor.js` | Order transformation (raw Shopify -> fulfillment rows) |
| `rapidshyp.js` | RapidShyp shipping API (AWB, labels, tracking, wallet) |
| `shiprocket_sense.js` | Shiprocket Sense RTO prediction API |
| `shiprocket.js` | Shiprocket shipping API (shipments, courier data) |
| `rto_predictor.js` | Local XGBoost RTO model (300 trees) |
| `riskValidator.js` | Address/phone validation, duplicate detection |
| `calculations.js` | P&L metrics, cash position, daily breakdown |
| `alerts.js` | Business alerts (settlement, RTO, ROAS) |
| `analytics.js` | Dashboard analytics (revenue, costs, ROAS, CAC) |
| `database.js` | SQLite schema (orders, shipments, settlements, ad_spend) |
| `csv_generator.js` | Supplier & financial CSV export |
| `excel.js` | Styled Excel workbook generation |
| `email.js` | Gmail SMTP (approval emails with CSV attachment) |
| `dropbox.js` | Dropbox OAuth2 token refresh + file upload |
| `uploader.js` | Puppeteer portal automation |
| `history.js` | Batch download tracking (JSON) |
| `sync_payu.js` | PayU payment settlement sync |
| `sync_meta_ads.js` | Meta/Facebook Ads API sync |

---

## Environment Variables

### Required
```env
# Shopify
SHOPIFY_STORE_DOMAIN=grlhood-3.myshopify.com
SHOPIFY_CLIENT_ID=your_client_id
SHOPIFY_CLIENT_SECRET=your_client_secret

# RapidShyp (Shipping)
RAPIDSHYP_JWT=your_jwt_token
RAPIDSHYP_API_KEY=your_api_key

# Shiprocket Sense (RTO Prediction)
SHIPROCKET_SENSE_API_KEY=your_key
SHIPROCKET_SENSE_API_SECRET=your_secret
```

### Optional
```env
# Dropbox (CSV Backup)
DROPBOX_REFRESH_TOKEN=your_token
DROPBOX_APP_KEY=your_key
DROPBOX_APP_SECRET=your_secret

# Gmail (Approval Emails)
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_16char_app_password

# Shiprocket (Shipping Data)
SHIPROCKET_EMAIL=your_email
SHIPROCKET_PASSWORD=your_password

# PayU (Payment Gateway)
PAYU_MERCHANT_KEY=your_key
PAYU_SALT=your_salt
PAYU_ENV=production

# Meta Ads
META_ACCESS_TOKEN=your_token
META_AD_ACCOUNT_ID=act_123456789

# Portal Upload (Puppeteer)
PORTAL_URL=https://portal.example.com
PORTAL_USERNAME=your_username
PORTAL_PASSWORD=your_password

# Config
PORT=3001
GST_RATE=18
DETAILS_LOOKBACK_DAYS=3
DATA_DIR=./data
```

### Frontend (Vercel)
```env
VITE_API_URL=https://your-railway-backend.up.railway.app
```

---

## UI Theme

**Dark glassmorphism** design with dusty pink accents.

```
Background:    #0e0e11 (near black)
Surface:       rgba(30, 30, 34, 0.7) with backdrop-blur
Accent:        #e3cfd8 (dusty pink)
Text Primary:  #f5f5f5
Text Muted:    rgba(245, 245, 245, 0.35)
Border:        rgba(227, 207, 216, 0.12)
Risk High:     #ff1493 (hot pink)
Risk Medium:   #e3cfd8
Risk Low:      #34d399 (emerald)
Success:       #34d399
Error:         #ef4444
```

- Glass cards with 28px blur + 1.4x saturate
- Spotlight cards with mouse-follow glow effect
- Framer Motion page transitions & step animations
- Custom thin scrollbar with pink tint
- Poppins font (Google Fonts)

---

## Project Structure

```
GRLHOOD-Dashboard/
|
+-- src/                          # Backend (Node.js/Express)
|   +-- server.js                 # API server (25+ endpoints)
|   +-- shopify.js                # Shopify GraphQL API
|   +-- processor.js              # Order data transformation
|   +-- rapidshyp.js              # RapidShyp shipping API
|   +-- shiprocket_sense.js       # RTO prediction (ML API)
|   +-- shiprocket.js             # Shiprocket shipping API
|   +-- rto_predictor.js          # Local XGBoost RTO model
|   +-- riskValidator.js          # Fraud & risk checks
|   +-- calculations.js           # P&L calculations
|   +-- alerts.js                 # Business alerts
|   +-- analytics.js              # Dashboard analytics
|   +-- database.js               # SQLite schema
|   +-- csv_generator.js          # CSV export
|   +-- excel.js                  # Excel generation
|   +-- email.js                  # Gmail SMTP
|   +-- dropbox.js                # Dropbox integration
|   +-- history.js                # Batch history
|   +-- sync_payu.js              # PayU sync
|   +-- xgb_trained_model.json    # XGBoost model (300 trees)
|
+-- frontend/
|   +-- src/
|   |   +-- App.jsx               # Main app shell
|   |   +-- Login.jsx             # Auth page
|   |   +-- AuthContext.jsx       # React auth context
|   |   +-- main.jsx              # Entry point
|   |   +-- index.css             # Global styles (glassmorphism)
|   |   +-- pages/
|   |   |   +-- HomeAnalytics.jsx
|   |   |   +-- FinancialDashboard.jsx
|   |   |   +-- ProfitDashboard.jsx
|   |   |   +-- ProductAnalysis.jsx
|   |   |   +-- SupplierDashboard.jsx
|   |   |   +-- ConsultationForm.jsx
|   |   +-- components/
|   |   |   +-- FulfillOrdersWizard.jsx
|   |   |   +-- ShipOrdersModal.jsx
|   |   |   +-- AestheticDetailModal.jsx
|   |   |   +-- EditOrderModal.jsx
|   |   |   +-- CsvEditorModal.jsx
|   |   |   +-- GlowBlobs.jsx
|   |   |   +-- DottedBackground.jsx
|   |   +-- lib/utils.js
|   |   +-- assets/
|   +-- vite.config.js
|   +-- package.json
|
+-- data/                         # Local persistent data
|   +-- grlhood.db
|   +-- history.json
|   +-- ad_spend.json
|
+-- package.json                  # Backend dependencies
+-- vercel.json                   # Vercel config (frontend only)
+-- railway.json                  # Railway config (backend)
```

---

## Setup & Development

### Local Development
```bash
npm install && npm install --prefix frontend
npm run dev
# Backend: http://localhost:3001
# Frontend: http://localhost:5173
```

### Production
```bash
npm run build
npm start
```

---

## Deployment

### Backend (Railway)
1. Connect GitHub repo on [railway.com](https://railway.com)
2. Railway uses `railway.json` config automatically
3. Add all environment variables in Railway dashboard
4. Deploy — Railway assigns a **static outgoing IP**
5. Whitelist that IP in RapidShyp (once, permanently)

### Frontend (Vercel)
1. Connect same GitHub repo on [vercel.com](https://vercel.com)
2. Set `VITE_API_URL` to your Railway backend URL
3. Auto-deploys on push to `main`

---

## Integrations

| Service | Purpose | Auth Method |
|---------|---------|-------------|
| **Shopify** | Order source (GraphQL Admin API) | OAuth Client ID/Secret |
| **RapidShyp** | Shipping, AWB, labels, tracking | JWT + API Key |
| **Shiprocket Sense** | ML-powered RTO prediction | Basic Auth |
| **Shiprocket** | Shipping cost & shipment data | Email/Password |
| **Dropbox** | CSV & label PDF backup | OAuth2 refresh token |
| **Gmail** | Approval email notifications | App password SMTP |
| **PayU** | Payment settlement sync | Merchant Key + Salt |
| **Meta Ads** | Ad spend data sync | Access token |

---

*Built for GRLHOOD by Ansh.*
