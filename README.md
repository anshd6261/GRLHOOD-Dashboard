# GRLHOOD Dashboard

**End-to-end e-commerce operations platform for GRLHOOD** — a D2C phone case & accessories brand built on Shopify. This dashboard automates order fulfillment, shipping, financial tracking, risk assessment, and supplier management from a single unified interface.

**Live:** [grlhood-dashboard.vercel.app](https://grlhood-dashboard.vercel.app)

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
  - [Order Management & Fulfillment](#order-management--fulfillment)
  - [AI-Powered RTO Risk Prediction](#ai-powered-rto-risk-prediction)
  - [Shipping Pipeline (RapidShyp)](#shipping-pipeline-rapidshyp)
  - [Financial Dashboard](#financial-dashboard)
  - [Analytics & P&L](#analytics--pl)
  - [Supplier Dashboard](#supplier-dashboard)
  - [CSV & Excel Generation](#csv--excel-generation)
  - [Dropbox Integration](#dropbox-integration)
  - [Email Notifications](#email-notifications)
  - [Consultation Form](#consultation-form)
- [Frontend Pages & Components](#frontend-pages--components)
- [Backend Modules](#backend-modules)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Authentication](#authentication)
- [Getting Started](#getting-started)

---

## Overview

GRLHOOD Dashboard is a full-stack operations platform that connects to Shopify, RapidShyp, Shiprocket Sense, Dropbox, Gmail, PayU, and Meta Ads — providing a single pane of glass for:

- Fetching and processing unfulfilled Shopify orders in real-time
- AI-powered RTO (Return to Origin) risk prediction using Shiprocket Sense
- Multi-step order fulfillment with courier assignment via RapidShyp
- Automated shipping label generation and Dropbox backup
- Financial P&L tracking, ad spend attribution, and cash position monitoring
- Supplier-specific views with limited permissions
- Smart risk validation (address, phone, duplicate detection)
- CSV and Excel export with GST calculations

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19.2 | UI framework |
| **Vite** | 7.x | Build tool & dev server |
| **Tailwind CSS** | 4.x | Utility-first styling |
| **Framer Motion** | 12.x | Animations & transitions |
| **Recharts** | 3.x | Charts & data visualization |
| **Lucide React** | 0.563 | Icon library |
| **React DatePicker** | 9.x | Date range selection |
| **Three.js** | 0.183 | 3D effects |
| **Capacitor** | 8.x | iOS/mobile app wrapper |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **Express** | 5.2.1 | HTTP server framework |
| **Axios** | 1.6 | HTTP client for API calls |
| **Dotenv** | 16.3 | Environment variable management |
| **Dropbox SDK** | 10.34 | Cloud file storage |
| **ExcelJS** | 4.4 | Excel spreadsheet generation |
| **Nodemailer** | 6.9 | Email notifications via Gmail |
| **UUID** | 9.0 | Unique identifier generation |
| **CSV Parse/Stringify** | 6.x | CSV processing |
| **better-sqlite3** | 12.6 | Local SQLite database (optional) |
| **node-cron** | 3.0 | Scheduled tasks |

### Deployment
| Service | Purpose |
|---|---|
| **Vercel** | Hosting (static frontend + serverless API) |
| **GitHub** | Source control & CI/CD trigger |

---

## Architecture

```
                    Vercel
    ┌───────────────────────────────────┐
    │                                   │
    │  Frontend (Static)    API (Node)  │
    │  ┌──────────────┐  ┌───────────┐ │
    │  │  React 19     │  │ Express 5 │ │
    │  │  Vite Build   │  │ Serverless│ │
    │  │  Tailwind CSS │  │ Functions │ │
    │  └──────┬───────┘  └─────┬─────┘ │
    │         │                │        │
    └─────────┼────────────────┼────────┘
              │                │
              │      ┌─────────┴──────────────────┐
              │      │                             │
         Browser     │    External APIs            │
                     │                             │
                     ├── Shopify GraphQL API       │
                     ├── RapidShyp (Shipping)      │
                     ├── Shiprocket Sense (RTO AI) │
                     ├── Dropbox (File Backup)     │
                     ├── Gmail (Notifications)     │
                     ├── PayU (Payment Sync)       │
                     └── Meta Ads (Ad Spend)       │
```

**Routing:** All `/api/*` requests route to the Express serverless function. All other requests serve the static React frontend.

---

## Features

### Order Management & Fulfillment

- **Real-time Shopify sync** — Fetches unfulfilled orders via Shopify GraphQL Admin API with configurable date ranges and lookback periods
- **Smart order processing** — Extracts product category, model, SKU, COGS, payment type (COD/Prepaid), and customer data
- **Bulk selection** — Select individual or all orders for batch operations
- **Order search** — Search by order ID, customer name, phone, city, or product
- **Order cancellation** — Triple-sync cancellation across RapidShyp + Shopify
- **Fulfillment Wizard** — Multi-step guided workflow:
  1. Upload/review CSV data
  2. Edit product categories and models inline
  3. Assign SKUs to products
  4. Review financial summary (COGS, GST, margins)
  5. Generate supplier and financial CSVs
  6. Ship via RapidShyp pipeline

### AI-Powered RTO Risk Prediction

- **Shiprocket Sense API** integration for real-time RTO probability scoring
- Each COD order is scored with a risk level: **Low**, **Medium**, or **High**
- Risk reasons are displayed (e.g., "High RTO pincode", "New customer", "High order value")
- **Parallel batch processing** with 5 concurrent predictions and a 6-second timeout on Vercel
- Non-blocking — if Sense API fails, orders still load with default risk levels
- **Risk Validator module** — Additional local checks:
  - Address validation (completeness, suspicious patterns)
  - Phone number validation
  - Duplicate order detection (same address, different name)

### Shipping Pipeline (RapidShyp)

- **Bulk AWB Assignment** — Assigns courier partners to multiple orders at once
- **Label Generation** — Bulk shipping label PDF generation
- **Dropbox Backup** — Automatic upload of labels and CSVs to organized Dropbox folders
- **Wallet Balance** — Real-time RapidShyp wallet balance check
- **Order Tracking** — Track shipment status via RapidShyp
- **RTO Data** — Fetches shipping status and RTO flags from RapidShyp order history
- **Static IP Proxy Support** — Optional proxy routing for IP-whitelisted APIs (configurable via env vars)

### Financial Dashboard

- **Real-time P&L** — Revenue, COGS, shipping costs, ad spend, net profit
- **Daily breakdown** — Day-by-day financial metrics
- **Cash position** — Settled amounts, pending COD/Prepaid, RTO risk value
- **Settlement tracking** — Monitor payment gateway settlements
- **GST calculations** — Automatic 18% GST computation on COGS
- **Alerts system** — Automated alerts for:
  - Settlement delays
  - High RTO risk orders
  - Poor ad spend ROAS

### Analytics & P&L

- **Revenue analytics** — Total revenue, AOV, order count trends
- **Cost distribution** — Visual breakdown of COGS, shipping, ad spend, RTO losses
- **ROAS tracking** — Return on ad spend with per-order attribution
- **Ad spend management** — Add daily ad spend entries with platform attribution
- **RTO rate monitoring** — Track return rates and associated losses
- **Product analysis** — Best-selling devices, models, and variants

### Supplier Dashboard

- **Role-based access** — Separate login and limited view for suppliers
- **Order visibility** — Suppliers see only relevant order data
- **Restricted actions** — No access to financial data or admin functions

### CSV & Excel Generation

- **Supplier CSV** — Product details, quantities, models for fulfillment centers
- **Financial CSV** — Revenue, COGS, GST, margins per order
- **Excel exports** — Formatted .xlsx files with multiple sheets
- **Dynamic CSV** — Flexible CSV generation from any data structure
- **History tracking** — All generated CSVs are saved with timestamps

### Dropbox Integration

- **Automatic backup** — Shipping labels, CSVs, and financial documents
- **Organized folders** — Date-based folder structure for easy retrieval
- **OAuth refresh** — Automatic token refresh for uninterrupted access
- **Non-blocking** — Dropbox failures don't block the main workflow

### Email Notifications

- **Gmail SMTP** — Send order confirmations and reports via Gmail
- **Automated alerts** — Configurable email notifications for key events

### Consultation Form

- **CA consultation** — Comprehensive tax planning and business structure questionnaire
- **Section-based** — Business structure, tax rates, GST, expense tracking
- **Persistent storage** — Submissions saved to JSON file for review

---

## Frontend Pages & Components

### Pages

| Page | File | Description |
|---|---|---|
| **Home Analytics** | `HomeAnalytics.jsx` | Main analytics dashboard with order cards, stats, product analysis link, cancel functionality |
| **Product Analysis** | `ProductAnalysis.jsx` | Best-selling products, models, variants with charts |
| **Financial Dashboard** | `FinancialDashboard.jsx` | P&L overview, daily metrics, cash position, settlement alerts |
| **Profit Dashboard** | `ProfitDashboard.jsx` | Detailed profit analytics with cost distribution charts, ad spend management |
| **Supplier Dashboard** | `SupplierDashboard.jsx` | Limited view for supplier partners |
| **Consultation Form** | `ConsultationForm.jsx` | CA tax consultation questionnaire |

### Components

| Component | File | Description |
|---|---|---|
| **Fulfill Orders Wizard** | `FulfillOrdersWizard.jsx` | Multi-step fulfillment flow — CSV upload, editing, SKU assignment, financial review, shipping |
| **Ship Orders Modal** | `ShipOrdersModal.jsx` | 7-step shipping pipeline UI — review, AI risk scan, verify, assign courier, labels, backup, complete |
| **CSV Editor Modal** | `CsvEditorModal.jsx` | Inline CSV editing with export capabilities |
| **Edit Order Modal** | `EditOrderModal.jsx` | Individual order editing interface |
| **Aesthetic Detail Modal** | `AestheticDetailModal.jsx` | Detailed order view with rich formatting |
| **Dotted Background** | `DottedBackground.jsx` | Animated dotted grid background effect |
| **Glow Blobs** | `GlowBlobs.jsx` | Floating gradient blob animations |

### Core App (`App.jsx`)

The main application shell provides:
- **Navigation tabs**: Dashboard, Fulfill, Finance, Settings
- **Error Boundary**: Global error catching with reload option
- **Spotlight Cards**: Mouse-tracking hover glow effect
- **Settings Tab**: Connected APIs overview, fulfillment history
- **Date range picker**: Filter orders by custom date ranges
- **Order cards**: Expandable cards with risk badges, product thumbnails, actions
- **Bulk operations**: Select multiple orders for shipping or export
- **Real-time search**: Filter orders across all fields

### Auth System

| File | Purpose |
|---|---|
| `Login.jsx` | Login form with role-based routing |
| `AuthContext.jsx` | React Context for auth state management |

---

## Backend Modules

| Module | File | Description |
|---|---|---|
| **Server** | `server.js` | Express 5 API server — all route definitions, middleware, static serving |
| **Shopify** | `shopify.js` | Shopify GraphQL Admin API client — fetch orders, search, cancel, assign SKUs |
| **Processor** | `processor.js` | Order data processor — transforms raw Shopify orders into dashboard-ready rows |
| **RapidShyp** | `rapidshyp.js` | RapidShyp API client — AWB assignment, labels, wallet, tracking, cancellation |
| **Shiprocket Sense** | `shiprocket_sense.js` | Shiprocket Sense RTO prediction API — batch risk scoring with concurrency control |
| **Shiprocket** | `shiprocket.js` | Shiprocket API client — shipment lookup, courier assignment, labels (legacy) |
| **Risk Validator** | `riskValidator.js` | Local risk checks — address validation, phone validation, duplicate detection |
| **Analytics** | `analytics.js` | Analytics engine — revenue, costs, ROAS, RTO rates with Shopify + Shiprocket data |
| **Calculations** | `calculations.js` | Financial P&L — daily/aggregated metrics, cash position (SQLite-backed) |
| **Alerts** | `alerts.js` | Alert system — settlement delays, RTO risk, ad spend ROAS monitoring |
| **Database** | `database.js` | SQLite database setup and connection management |
| **CSV Generator** | `csv_generator.js` | Supplier and financial CSV generation with GST calculations |
| **Excel** | `excel.js` | Excel workbook generation with ExcelJS |
| **Dropbox** | `dropbox.js` | Dropbox SDK integration — file upload with OAuth token refresh |
| **Email** | `email.js` | Gmail SMTP email sending via Nodemailer |
| **History** | `history.js` | Fulfillment history tracking — save/load/update batch records |
| **Sync PayU** | `sync_payu.js` | PayU payment gateway settlement sync |
| **Sync Meta Ads** | `sync_meta_ads.js` | Meta (Facebook) Ads spend data sync |
| **Sync Shiprocket** | `sync_shiprocket.js` | Shiprocket order and shipment data sync |
| **Sync Shopify** | `sync_shopify.js` | Shopify order data sync to local database |
| **Products DB** | `products_db.js` | Product catalog and SKU management |
| **Uploader** | `uploader.js` | Portal file upload automation (Puppeteer-based) |
| **RTO Predictor** | `rto_predictor.js` | XGBoost-based RTO prediction model (legacy, replaced by Shiprocket Sense) |
| **Index** | `index.js` | CLI entry point for cron-based order processing |

---

## API Reference

### Status & Auth

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | Server health check — returns store domain and connection status |
| `GET` | `/api/my-ip` | Returns server's outgoing IP address (for API whitelisting) |
| `POST` | `/api/login` | Authenticate user — returns role (`admin`/`supplier`) and token |

### Orders

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/orders` | Fetch and process orders from Shopify with RTO risk scoring |
| `GET` | `/api/orders/search?q=` | Search orders by ID, name, phone, city, or product |
| `POST` | `/api/orders/:id/cancel` | Cancel order across RapidShyp + Shopify |
| `POST` | `/api/orders/assign-sku` | Assign SKU to a Shopify product |

### Fulfillment & CSV

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/generate-csv` | Generate supplier and financial CSVs from order data |
| `POST` | `/api/generate-excel` | Generate formatted Excel workbook |
| `POST` | `/api/upload-csv` | Upload CSV to Dropbox |
| `POST` | `/api/fulfill` | Process fulfillment — generate CSV, upload, optionally email |

### Shipping (RapidShyp)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/rapidshyp/bulk-assign` | Bulk assign AWB numbers to orders |
| `GET` | `/api/rapidshyp/wallet` | Get RapidShyp wallet balance |
| `POST` | `/api/rapidshyp/bulk-labels-dropbox` | Generate shipping labels + upload to Dropbox |
| `POST` | `/api/generate-labels` | Generate labels for specific RapidShyp order IDs |

### Financial

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/financials/summary` | P&L summary — today, MTD, cash position, alerts |
| `GET` | `/api/settings` | Get automation settings (email, portal, lookback days) |

### Analytics

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/analytics/dashboard?days=` | Full analytics with revenue, costs, ROAS, order breakdown |
| `POST` | `/api/analytics/ad-spend` | Save ad spend entry (date, amount, platform) |

### History

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/history` | Get fulfillment batch history |
| `POST` | `/api/history` | Save new fulfillment batch |
| `PUT` | `/api/history/:id` | Update existing batch record |

### Consultation

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/consultation/submit` | Submit CA consultation form |

### Utility

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/download-file/:filename` | Download a generated file (labels, CSVs) |

---

## Environment Variables

### Required — Shopify

```env
SHOPIFY_STORE_DOMAIN=grlhood-3.myshopify.com
SHOPIFY_CLIENT_ID=your_client_id
SHOPIFY_CLIENT_SECRET=your_client_secret
```

### Required — RapidShyp

```env
RAPIDSHYP_JWT=your_jwt_token
RAPIDSHYP_API_KEY=your_api_key
```

### Required — Shiprocket Sense (RTO Prediction)

```env
SHIPROCKET_SENSE_API_KEY=your_api_key
SHIPROCKET_SENSE_API_SECRET=your_api_secret
```

### Optional — Shiprocket (Legacy Shipping)

```env
SHIPROCKET_EMAIL=your_email
SHIPROCKET_PASSWORD=your_password
```

### Optional — Dropbox

```env
DROPBOX_REFRESH_TOKEN=your_refresh_token
DROPBOX_APP_KEY=your_app_key
DROPBOX_APP_SECRET=your_app_secret
```

### Optional — Gmail

```env
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password
```

### Optional — PayU

```env
PAYU_MERCHANT_KEY=your_merchant_key
PAYU_SALT=your_salt
PAYU_ENV=test  # or "live"
```

### Optional — Meta Ads

```env
META_ACCESS_TOKEN=your_access_token
META_AD_ACCOUNT_ID=act_123456789
```

### Optional — Static IP Proxy

```env
FIXIE_URL=http://fixie:token@proxy.usefixie.com:80
# or
QUOTAGUARD_URL=http://user:pass@proxy.quotaguard.com:9293
# or
STATIC_PROXY_URL=http://your-proxy:port
```

### Application Settings

```env
PORT=3001
GST_RATE=18
DETAILS_LOOKBACK_DAYS=3
NODE_ENV=production
VERCEL=1  # Auto-set by Vercel
```

---

## Deployment

### Vercel (Production)

The project deploys automatically to Vercel on push to `main`.

**`vercel.json` configuration:**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "frontend/package.json",
      "use": "@vercel/static-build",
      "config": { "distDir": "dist" }
    },
    {
      "src": "src/server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/src/server.js" },
    { "src": "/(.*)", "dest": "/frontend/$1" }
  ]
}
```

- **Frontend**: Built with `@vercel/static-build`, served as static files
- **Backend**: Runs as `@vercel/node` serverless function
- **Routing**: `/api/*` routes to Express, everything else to the React SPA

### Vercel Considerations

- **Serverless timeout**: Functions have limited execution time. API calls are parallelized with timeouts:
  - Shiprocket Sense: 6s global timeout with 5 concurrent workers
  - RapidShyp: 8s timeout per request
- **No persistent storage**: `better-sqlite3` is an optional dependency. Financial calculations gracefully return empty data when SQLite is unavailable
- **Rotating IPs**: Vercel serverless functions don't have static outgoing IPs. Use proxy env vars for IP-whitelisted APIs

---

## Project Structure

```
GRLHOOD-Dashboard/
├── frontend/                    # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx              # Main application shell
│   │   ├── App.css              # Global styles
│   │   ├── Login.jsx            # Login page
│   │   ├── AuthContext.jsx      # Auth state management
│   │   ├── main.jsx             # React entry point
│   │   ├── index.css            # Base CSS + Tailwind
│   │   ├── components/
│   │   │   ├── FulfillOrdersWizard.jsx
│   │   │   ├── ShipOrdersModal.jsx
│   │   │   ├── CsvEditorModal.jsx
│   │   │   ├── EditOrderModal.jsx
│   │   │   ├── AestheticDetailModal.jsx
│   │   │   ├── DottedBackground.jsx
│   │   │   └── GlowBlobs.jsx
│   │   ├── pages/
│   │   │   ├── HomeAnalytics.jsx
│   │   │   ├── ProductAnalysis.jsx
│   │   │   ├── FinancialDashboard.jsx
│   │   │   ├── ProfitDashboard.jsx
│   │   │   ├── SupplierDashboard.jsx
│   │   │   └── ConsultationForm.jsx
│   │   ├── lib/                 # Utility functions
│   │   └── assets/              # Static assets
│   ├── public/                  # Public assets (logo, icons)
│   ├── package.json
│   └── vite.config.js
│
├── src/                         # Express backend
│   ├── server.js                # API routes & middleware
│   ├── shopify.js               # Shopify GraphQL client
│   ├── processor.js             # Order data transformer
│   ├── rapidshyp.js             # RapidShyp API client
│   ├── shiprocket_sense.js      # Shiprocket Sense RTO API
│   ├── shiprocket.js            # Shiprocket API (legacy)
│   ├── riskValidator.js         # Address/phone/duplicate checks
│   ├── analytics.js             # Analytics engine
│   ├── calculations.js          # P&L calculations
│   ├── alerts.js                # Alert system
│   ├── database.js              # SQLite setup
│   ├── csv_generator.js         # CSV generation
│   ├── excel.js                 # Excel generation
│   ├── dropbox.js               # Dropbox integration
│   ├── email.js                 # Gmail SMTP
│   ├── history.js               # Batch history tracking
│   ├── sync_payu.js             # PayU sync
│   ├── sync_meta_ads.js         # Meta Ads sync
│   ├── sync_shiprocket.js       # Shiprocket data sync
│   ├── sync_shopify.js          # Shopify data sync
│   ├── products_db.js           # Product catalog
│   ├── uploader.js              # Portal automation
│   └── index.js                 # CLI entry point
│
├── data/                        # Local data storage
│   ├── history.json             # Fulfillment batch history
│   ├── ad_spend.json            # Ad spend records
│   └── grlhood.db               # SQLite database
│
├── vercel.json                  # Vercel deployment config
├── package.json                 # Backend dependencies
└── .env                         # Environment variables
```

---

## Authentication

The dashboard uses a simple role-based authentication system:

| Role | Access |
|---|---|
| **Admin** | Full access — all tabs, financial data, settings, fulfillment |
| **Supplier** | Limited access — order data only, no financials or admin controls |

Authentication is handled via the `/api/login` endpoint which returns a role and mock JWT token. The frontend stores auth state in React Context and conditionally renders UI based on role.

---

## Getting Started

### Prerequisites

- **Node.js** 18+
- **npm** 9+
- Shopify store with Admin API credentials
- RapidShyp account with API keys

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/anshd6261/GRLHOOD-Dashboard.git
cd GRLHOOD-Dashboard

# 2. Install dependencies
npm install
cd frontend && npm install && cd ..

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 4. Run development server
npm run dev
# This starts both backend (port 3001) and frontend (port 5173) concurrently
```

### Build for Production

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Start production server
npm start
```

### Deploy to Vercel

1. Push to GitHub
2. Connect repo to Vercel
3. Add all environment variables in Vercel dashboard
4. Deploy triggers automatically on push to `main`

---

## Design

The dashboard features a **glassmorphism** design language with:

- Dark theme (`#0e0e11` base) with translucent glass cards
- Signature pink accent color (`#e3cfd8`) — GRLHOOD brand
- Mouse-tracking spotlight hover effects on cards
- Framer Motion animations throughout
- Dotted grid background with floating gradient blobs
- Responsive layout optimized for both desktop and mobile
- PWA-ready with service worker and offline support

---

## License

Private project. All rights reserved.

---

*Built for GRLHOOD by Ansh D.*
