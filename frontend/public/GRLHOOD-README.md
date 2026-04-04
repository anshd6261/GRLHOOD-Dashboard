# GRLHOOD Dashboard — Rebuild Brief

> **This document is a prompt.** You are an expert full-stack engineer, UI/UX designer, and operations automation specialist. Your job is to rebuild this dashboard from scratch — better architecture, better design, better UX. Read this entire brief, scrape every linked API doc, then plan and build.

---

## What Is This

GRLHOOD is a D2C brand that sells custom phone cases and accessories via Shopify. Orders come in daily, each needing: risk scoring, CSV generation for the supplier, courier assignment, label generation, and backup. This dashboard automates the entire post-order fulfillment pipeline.

**Your goal:** Rebuild this as a modern, production-grade fulfillment centre dashboard. You have full creative freedom on architecture, state management, component structure, and backend design. The flows described below are the *minimum* — you should think like an expert ops manager and add features, automations, and UX improvements that would genuinely improve productivity.

---

## Design Language

### Visual Identity

The dashboard follows a **glass morphism** aesthetic inspired by Apple's Liquid Glass design system.

- **Primary mode:** Dark (default). Light mode supported.
- **Background:** Deep dark (#0a0a0a or similar), never pure black
- **Accent colour:** Light pink `#f6bcdb` — used sparingly for active states, badges, highlights, CTAs
- **Cards:** Frosted glass — `backdrop-filter: blur()`, subtle translucent borders, soft inner glow. Cards should feel like they float above the background, not sit flat on it.
- **Corners:** Heavy rounded — `border-radius: 20px–28px` on cards, `12px–16px` on buttons and inputs
- **Typography:** Clean sans-serif (Inter, SF Pro, or similar) in multiple weights. Hierarchy through weight and size, not colour variety. Monospace for order IDs, AWBs, and data.
- **Spacing:** Generous. Breathe. No cramming. Content density should feel curated, not cluttered.
- **Animations:** Subtle spring-based transitions on card hover, modal entry, step transitions. Nothing flashy — everything should feel smooth and intentional.

### Design Reference

Study this image for card styling, corner radius, glass morphism depth, and typography treatment:
`https://i.pinimg.com/736x/1f/ce/34/1fce34a3758cff5e47cf0a25904b4854.jpg`

- Match the rounded corner radius exactly
- Match the glass morphism card depth and blur
- Match the font style — use the same family across the dashboard in different weights for hierarchy
- **Do NOT** use the blue colour from the image — replace with `#f6bcdb` as accent
- **Do NOT** copy button styles — design your own minimal buttons that fit the glass language

### Design Principles (Non-Negotiable)

1. **No clutter.** Every element must earn its screen space. If it doesn't help the user fulfil orders faster, it doesn't belong.
2. **No decoration.** No ornamental icons, no gradient borders for the sake of it, no random stats that look impressive but aren't actionable.
3. **Whitespace is a feature.** Dense data needs room to breathe. Card padding should be generous. Section gaps should feel intentional.
4. **Hierarchy through restraint.** One accent colour. Two font weights max per card. Size and weight do the heavy lifting — not colour.
5. **Progressive disclosure.** Show the minimum by default. Expand on interaction. Order cards collapse to essentials and expand to full detail.
6. **Consistent rhythm.** Uniform card sizes. Aligned grid. Predictable spacing. The layout should feel like a system, not a collection of components.
7. **Touch-friendly targets.** This is used on phones too. Buttons, badges, and interactive elements need comfortable tap targets (min 44px).

---

## Core Flows

### 1. Order Sync

Pull unfulfilled orders from Shopify. Display them as cards in a grid. Each card shows:

- Order ID, customer name, date
- Payment type (Prepaid / COD)
- Product thumbnail, category, device model, SKU
- Shipping address, phone
- AI risk score badge (High / Medium / Low) — for COD orders only
- Quick actions: call, WhatsApp, view in Shopify, view in RapidShyp

**Filters:** All, High Risk, Missing Device Info, Repeat Customers

Think about what other filters or sorting would help an ops manager. Date range? Payment type? Order value? You decide.

### 2. Fulfillment Wizard

This is the core workflow — a multi-step wizard that takes raw orders and produces shipped, labelled, backed-up orders. Steps:

**Step 1 — Repeat Customers**
Detect customers who've ordered before (same phone, different order). Show them grouped so the operator can spot patterns (fraud, loyalty, etc).

**Step 2 — AI Risk Scoring**
Send COD orders to Shiprocket Sense for RTO (Return to Origin) prediction. Each call costs ₹4 + 18% GST — **never double-check an order**. Cache aggressively. Show risk level, probability, and reasons. High-risk orders get flagged for manual review or WhatsApp confirmation.

**Step 3 — Device Check**
Flag orders missing device/model information (needed for phone case manufacturing). Let the operator fill in missing info or contact the customer.

**Step 4 — CSV Preview & Edit**
Interactive table showing all order data. The operator can edit fields, delete rows, review before export. This is the last checkpoint before the order goes to the supplier.

**Step 5 — Export & Upload**
Generate two CSVs:

**Supplier CSV** (sent to manufacturer):
```
Product Category | Model | Design Number(SKU) | Customer Name | Order ID | Preview Product URL | AWB(Optional)
```

**Financial CSV** (internal accounting):
```
Category | Model | SKU | Customer Name | Order ID | Preview Product URL | Payment | COGS
--- then below the items ---
ORDER SUMMARY: category breakdown, total items, total orders
INVOICE: Subtotal, GST (18%), Grand Total, timestamp
```

Both CSVs upload to:
- **Dropbox** — organised as `/ORDERS/{Month}/{Date} Order/` containing supplier CSV, financial CSV, and later the labels PDF
- **NBE Portal** — the supplier's system, via their API (3-step: presign → upload to cloud storage → finalize)

**Step 6 — Ship**
Bulk-approve orders in RapidShyp, then assign AWB (courier tracking number) to each. Show wallet balance, estimated cost, assignment results.

**Step 7 — Labels**
Generate shipping label PDFs from RapidShyp. Download locally. Upload to Dropbox in the same date folder.

**Step 8 — Done**
Summary: orders processed, units shipped, AWBs generated.

### 3. Quick Ship Modal

A faster alternative to the full wizard — for shipping a selection of orders. Same core flow (risk scan → verify → assign courier → labels → backup) but streamlined into fewer steps with less manual intervention.

---

## Integrations & API Documentation

**Scrape each of these documentation links thoroughly before building. Understand every endpoint, parameter, and response.**

### Shopify Admin API (Orders)
- **Purpose:** Pull unfulfilled orders, order details, customer data, product images
- **Auth:** `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` against `SHOPIFY_STORE_DOMAIN`
- **Docs:** https://shopify.dev/docs/api/admin-graphql

### RapidShyp (Shipping & Courier)
- **Purpose:** Approve orders, assign AWB, generate labels, track shipments, cancel orders, schedule pickups
- **Auth:** API Key (`rapidshyp-token` header) for public endpoints; JWT (`Authorization: Bearer`) for session endpoints
- **Docs:** https://docs.rapidshyp.com
- **Key endpoints you'll need:** `/approve_orders`, `/assign_awb`, `/schedule_pickup`, `/generate_label`, `/track_order`, `/shipment_details`, `/cancel_order`, `/get_orders_info`

### Shiprocket Sense (RTO Prediction)
- **Purpose:** AI-powered risk scoring for COD orders — predicts probability of return
- **Auth:** Basic Auth (`API_KEY:API_SECRET`)
- **Docs:** https://sense-docs.shiprocket.in
- **Endpoint:** `POST https://sense.shiprocket.in/v3/rto/predict`
- **Cost:** ₹4 + 18% GST per API call — aggressive caching is mandatory, never check same order twice

### NBE / NextBigE (Supplier Portal)
- **Purpose:** Upload order CSVs to the manufacturing supplier
- **Auth:** `X-Customer-Api-Key` header
- **Base URL:** `https://5060265239-api.nextbige.com/api/external`
- **Upload flow (3-step Raw Order API):**
  1. `POST /raw-order-files/presign/` with `{filename, content_type}` → returns `{upload_url, key}`
  2. `PUT <upload_url>` with file bytes and `Content-Type: text/csv`
  3. `POST /raw-order-files/finalize/` with `{key, description, order_type: "Bulkship POD", partial_fulfillment: "yes", is_urgent_order: false}`

### Dropbox (Backup)
- **Purpose:** Organised cloud backup of all CSVs and shipping labels
- **Auth:** OAuth2 with refresh token → short-lived access token
- **Docs:** https://www.dropbox.com/developers/documentation/http/documentation
- **Folder structure:**
  ```
  /ORDERS
    /{Month Name}
      /{Nth MonthName Year} Order/
        - {date} Order.csv           (Supplier CSV)
        - {date} Order - Financial report.csv  (Financial CSV)
        - {date} Labels.pdf          (Shipping labels)
  ```
- **Upload mode:** Overwrite (no auto-rename). Delete existing date folder before fresh upload.

### Slack (Notifications)
- **Purpose:** Alerts and notifications to team channels
- **Auth:** Webhook URL

---

## Environment Variables

```env
# Shopify
SHOPIFY_STORE_DOMAIN=
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=

# RapidShyp
RAPIDSHYP_API_KEY=
RAPIDSHYP_JWT=

# Shiprocket Sense (RTO AI)
SHIPROCKET_SENSE_API_KEY=
SHIPROCKET_SENSE_API_SECRET=

# NBE Supplier Portal
NBE_API_BASE=https://5060265239-api.nextbige.com/api/external
NBE_API_KEY=

# Dropbox Backup
DROPBOX_APP_KEY=
DROPBOX_APP_SECRET=
DROPBOX_REFRESH_TOKEN=

# Slack
SLACK_WEBHOOK_URL=

# Config
GST_RATE=18
```

---

## What You Should Add (Think Like an Ops Manager)

You have full freedom to improve on the flows above. Think about what a fulfillment operations manager would actually need day-to-day. Some directions to consider — but don't limit yourself to these:

- **Date selector** for filtering orders by creation date range
- **Order timeline** — visual history of what happened to each order (created → risk-scored → CSV'd → shipped → delivered)
- **Batch history** — log of every fulfillment run with timestamp, order count, who ran it
- **Delivery tracking dashboard** — pull tracking status from RapidShyp and show delivery funnel (in-transit, out-for-delivery, delivered, RTO)
- **Daily digest / summary cards** — orders processed today, revenue, pending orders, RTO rate
- **Smart alerts** — wallet low, unusual RTO spike, orders stuck without AWB for too long
- **Keyboard shortcuts** for power users who do this daily
- **Bulk actions** on order cards — select multiple, ship selected, cancel selected
- **Search** — by order ID, customer name, phone, AWB
- **Export history** — re-download any previous day's CSVs from Dropbox
- **Mobile-first responsive** — this gets used on phones while packing orders

Think through the entire post-order lifecycle and add anything that reduces manual steps, prevents errors, or surfaces information the operator needs before they have to go looking for it.

---

## Technical Notes

- All dates and times must use **IST (Asia/Kolkata)** — the business operates from India
- Shopify order IDs come as `#4060` — strip the `#` for internal use, add it back for RapidShyp
- RTO cache must be persistent — orders checked once should never be re-checked (real money per call)
- The supplier CSV column headers must be **exact** — the NBE portal parses them
- Dropbox access tokens expire in 4 hours — always refresh before upload
- RapidShyp has both public API (API key) and session API (JWT) — some endpoints only work with one

---

*Build something that makes fulfilling 50+ orders a day feel effortless.*
