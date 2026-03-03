# GRLHOOD Dashboard Build Guide

## How to Use This Document

This document contains 10 stages. Each stage has ONE prompt.

**Process:**
1. Copy the prompt for Stage 1
2. Paste in Claude Code / Cursor / Antigravity
3. Let it build
4. Test using the test criteria
5. Works? → Move to Stage 2
6. Doesn't work? → Fix before moving on

**Important:** Shopify and Shiprocket are already connected via existing CSV dashboard. We're building on top of that.

---

## Pre-Setup Info

Before starting, fill in your credentials in each stage prompt:

- **Shopify:** Store URL, API Key, Access Token
- **Shiprocket:** Email, Password  
- **Meta Ads:** App ID, App Secret, Access Token, Ad Account ID
- **PayU:** Merchant Key, Merchant Salt
- **Bank:** HDFC / ICICI / Kotak (for CSV format)

---

# STAGE 1: Database Setup

## What This Does
Creates all database tables to store your financial data.

## Prompt - Copy Everything Below

```
I need you to set up a SQLite database for a D2C e-commerce business dashboard.

Create a file called database.js that sets up the following tables:

TABLE: orders
- order_id (TEXT, PRIMARY KEY) - Shopify order ID
- order_date (TEXT) - ISO date
- customer_name (TEXT)
- customer_phone (TEXT)
- customer_email (TEXT)
- shipping_address (TEXT)
- city (TEXT)
- state (TEXT)
- pincode (TEXT)
- gross_amount (REAL) - Total before discounts
- discount_amount (REAL)
- shipping_charged (REAL) - What customer paid for shipping
- net_amount (REAL) - What customer actually paid
- payment_method (TEXT) - COD or Prepaid
- payment_gateway (TEXT) - PayU, FlexiPe, Razorpay, etc.
- order_status (TEXT) - pending, shipped, delivered, rto, returned, cancelled
- refund_amount (REAL)
- refund_date (TEXT)
- created_at (TEXT)
- updated_at (TEXT)

TABLE: order_items
- id (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- order_id (TEXT, FOREIGN KEY)
- sku (TEXT)
- product_name (TEXT)
- category (TEXT) - Tough Case, Glass Case, etc.
- phone_model (TEXT)
- quantity (INTEGER)
- unit_price (REAL)
- total_price (REAL)
- cogs (REAL) - Cost of goods sold per unit

TABLE: shipments
- id (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- order_id (TEXT, FOREIGN KEY)
- awb_number (TEXT)
- courier_name (TEXT)
- shipped_date (TEXT)
- delivered_date (TEXT)
- current_status (TEXT)
- forward_shipping_cost (REAL)
- weight_kg (REAL)
- is_rto (INTEGER) - 0 or 1
- rto_date (TEXT)
- return_shipping_cost (REAL)
- rto_reason (TEXT)

TABLE: products
- sku (TEXT, PRIMARY KEY)
- product_name (TEXT)
- category (TEXT)
- cogs_without_gst (REAL)
- gst_on_cogs (REAL)
- cogs_with_gst (REAL)
- selling_price (REAL)
- is_active (INTEGER)
- created_at (TEXT)
- updated_at (TEXT)

TABLE: settlements
- id (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- settlement_id (TEXT)
- source (TEXT) - PayU, Shiprocket COD, FlexiPe
- settlement_date (TEXT)
- period_start (TEXT)
- period_end (TEXT)
- gross_amount (REAL)
- fees_deducted (REAL)
- gst_on_fees (REAL)
- net_amount (REAL)
- bank_verified (INTEGER)
- bank_transaction_id (TEXT)
- notes (TEXT)

TABLE: expenses
- id (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- expense_date (TEXT)
- category (TEXT) - Ads, Shipping, COGS, Subscriptions, Professional Fees, Packaging, Team, Office, Tools, Other
- subcategory (TEXT)
- vendor (TEXT)
- description (TEXT)
- amount (REAL)
- gst (REAL)
- total_with_gst (REAL)
- payment_method (TEXT)
- payment_status (TEXT)
- invoice_url (TEXT)
- is_recurring (INTEGER)
- recurring_frequency (TEXT)

TABLE: ad_spend
- id (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- date (TEXT)
- platform (TEXT)
- campaign_name (TEXT)
- adset_name (TEXT)
- spend (REAL)
- impressions (INTEGER)
- clicks (INTEGER)
- purchases (INTEGER)
- purchase_value (REAL)
- ctr (REAL)
- cpc (REAL)
- roas (REAL)

TABLE: bank_transactions
- id (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- transaction_date (TEXT)
- description (TEXT)
- reference_number (TEXT)
- debit (REAL)
- credit (REAL)
- balance (REAL)
- category (TEXT)
- matched_settlement_id (TEXT)
- matched_expense_id (TEXT)
- is_reconciled (INTEGER)
- notes (TEXT)

TABLE: daily_metrics
- date (TEXT, PRIMARY KEY)
- total_orders (INTEGER)
- gross_revenue (REAL)
- refunds (REAL)
- discounts (REAL)
- net_revenue (REAL)
- total_cogs (REAL)
- shipping_cost (REAL)
- gateway_fees (REAL)
- rto_count (INTEGER)
- rto_loss (REAL)
- contribution_margin (REAL)
- ad_spend (REAL)
- net_profit (REAL)
- aov (REAL)
- cod_orders (INTEGER)
- prepaid_orders (INTEGER)

Create these helper functions:
1. initializeDatabase() - Creates all tables if they don't exist
2. getDb() - Returns database connection

Use better-sqlite3 for synchronous operations.

Add indexes on: orders.order_date, orders.pincode, shipments.order_id, order_items.order_id, bank_transactions.transaction_date, daily_metrics.date
```

## Test Criteria
- [ ] File database.js exists
- [ ] Run the file - no errors
- [ ] All 10 tables created
- [ ] Can insert a dummy order
- [ ] Can query the dummy order back

---

# STAGE 2: Shopify Data Sync

## What This Does
Pulls orders from Shopify and saves to database.

## Prompt - Copy Everything Below

```
Create a file called sync_shopify.js that syncs Shopify orders to our SQLite database.

CREDENTIALS (fill these in):
- Store URL: grlhood.myshopify.com
- Access Token: [YOUR_ACCESS_TOKEN]

REQUIREMENTS:

1. Connect to Shopify Admin API

2. Fetch orders from last 30 days with pagination

3. For each order, extract and save to orders table:
- order_id: Use order.name (e.g., #1234)
- order_date: order.created_at
- customer_name: customer first + last name
- customer_phone: from customer or shipping_address
- customer_email: customer.email
- shipping_address: Full formatted address
- city, state, pincode: From shipping_address
- gross_amount: order.total_price
- discount_amount: order.total_discounts
- shipping_charged: From shipping_lines
- net_amount: Final amount paid
- payment_method: COD if gateway contains 'cod', else Prepaid
- payment_gateway: order.gateway
- order_status: Map from fulfillment_status
- refund_amount: Sum of refunds if any
- refund_date: First refund date if any

4. For each line_item, save to order_items table:
- Link to order_id
- sku, product_name, quantity, unit_price, total_price
- category: Extract from product type or title
- phone_model: Extract from variant_title
- cogs: Look up from products table by SKU, use 150 as default

5. Upsert logic - update if exists, insert if not

6. Export functions:
- syncOrders(daysBack = 30)
- syncRecentOrders() - Last 24 hours
- getOrderById(orderId)

7. Log: orders fetched, inserted, updated, errors
```

## Test Criteria
- [ ] File exists
- [ ] Connects to Shopify API
- [ ] Pulls orders successfully
- [ ] Orders appear in database with all fields
- [ ] Order items linked correctly
- [ ] Re-running updates, doesn't duplicate

---

# STAGE 3: Shiprocket Data Sync

## What This Does
Pulls shipment data and matches to orders.

## Prompt - Copy Everything Below

```
Create a file called sync_shiprocket.js that syncs shipment data from Shiprocket.

CREDENTIALS (fill these in):
- Email: [YOUR_EMAIL]
- Password: [YOUR_PASSWORD]

REQUIREMENTS:

1. Authenticate with Shiprocket API
POST https://apiv2.shiprocket.in/v1/external/auth/login
Store and reuse token (valid 10 days)

2. Fetch shipments from last 30 days
GET https://apiv2.shiprocket.in/v1/external/orders

3. For each shipment, save to shipments table:
- order_id: Match using channel_order_id to our order_id
- awb_number: shipment.awb_code
- courier_name
- shipped_date
- delivered_date
- current_status
- forward_shipping_cost
- weight_kg
- is_rto: 1 if status contains RTO
- rto_date
- return_shipping_cost
- rto_reason

4. Update orders table status based on shipment:
- shipped/in_transit → 'shipped'
- delivered → 'delivered'  
- rto_* → 'rto'

5. Export functions:
- syncShipments(daysBack = 30)
- syncRecentShipments()
- getShipmentByOrderId(orderId)

6. Handle API rate limits with delays
```

## Test Criteria
- [ ] File exists
- [ ] Authenticates successfully
- [ ] Shipments pulled and saved
- [ ] Shipments match to orders correctly
- [ ] Shipping costs captured
- [ ] RTO orders flagged
- [ ] Order status updates

---

# STAGE 4: Meta Ads Data Sync

## What This Does
Pulls ad spend and performance from Meta.

## Prompt - Copy Everything Below

```
Create a file called sync_meta_ads.js that syncs Meta Ads data.

CREDENTIALS (fill these in):
- Access Token: [YOUR_ACCESS_TOKEN]
- Ad Account ID: act_[YOUR_ACCOUNT_ID]

REQUIREMENTS:

1. Connect to Meta Marketing API v18.0

2. Fetch daily ad performance
GET /{ad_account_id}/insights
- fields: spend,impressions,clicks,actions,action_values
- level: campaign
- time_increment: 1 (daily)

3. For each day + campaign, save to ad_spend table:
- date
- platform: 'Meta'
- campaign_name
- spend
- impressions
- clicks  
- purchases: From actions where action_type = 'purchase'
- purchase_value: From action_values
- ctr, cpc, roas: Calculate

4. Parse Meta's actions array format to extract purchase data

5. Upsert by date + campaign_name

6. Export functions:
- syncAdSpend(daysBack = 30)
- syncTodayAdSpend()
- getAdSpendByDate(date)

7. Handle rate limits with 1 second delays
```

## Test Criteria
- [ ] File exists
- [ ] Connects to Meta API
- [ ] Pulls last 7 days
- [ ] Spend matches Ads Manager
- [ ] Purchases and ROAS calculate correctly
- [ ] Data in ad_spend table

---

# STAGE 5: PayU Settlements

## What This Does
Tracks payment gateway settlements and fees.

## Prompt - Copy Everything Below

```
Create a file called sync_payu.js for PayU settlement tracking.

Since PayU API access may be limited, create a dual approach:

OPTION A - API (if available):
CREDENTIALS:
- Merchant Key: [YOUR_KEY]
- Merchant Salt: [YOUR_SALT]

Fetch settlements and save to settlements table.

OPTION B - CSV Import:
Create function importPayUCSV(filePath) that:
1. Parses PayU settlement CSV
2. Extracts: settlement_id, date, gross_amount, fees, net_amount
3. Saves to settlements table

GATEWAY FEE CALCULATION:
Create function calculateGatewayFee(amount, paymentMethod):
- Card: 2% + 18% GST
- UPI: 0%
- NetBanking: 1.5% + 18% GST
- Wallet: 2% + 18% GST
- Default: 1.5% + 18% GST

Export functions:
- syncSettlements(daysBack = 30) OR importPayUCSV(filePath)
- calculateGatewayFee(amount, paymentMethod)
- getUnsettledAmount()
```

## Test Criteria
- [ ] File exists
- [ ] Can import CSV OR connect to API
- [ ] Settlements saved correctly
- [ ] Gateway fees calculate correctly
- [ ] Can track unsettled amounts

---

# STAGE 6: Bank Statement Import

## What This Does
Imports bank CSV and auto-categorizes transactions.

## Prompt - Copy Everything Below

```
Create a file called import_bank.js for bank statement processing.

BANK FORMAT: HDFC
Columns: Date, Narration, Value Dat, Debit Amount, Credit Amount, Chq/Ref Number, Closing Balance

REQUIREMENTS:

1. Parse HDFC CSV format
- Handle DD/MM/YYYY dates
- Handle amounts with commas (1,00,000)

2. Auto-categorize based on narration:
- PAYU, PAY_U → 'PayU Settlement'
- SHIPROCKET → 'Shiprocket'
- FACEBOOK, META → 'Meta Ads'
- GOOGLE ADS → 'Google Ads'
- SHOPIFY → 'Shopify'
- RAZORPAY → 'Razorpay'
- NEFT/IMPS/RTGS credit → 'Settlement'
- Default → 'Unknown'

3. Try to match transactions:
- Credits → settlements table (by amount + date)
- Debits → expenses table (by vendor + amount)
- Set is_reconciled = 1 if matched

4. Duplicate detection by reference + date + amount

5. Export functions:
- importBankStatement(filePath)
- getUnreconciledTransactions()
- categorizeTransaction(id, category)
- matchToSettlement(transactionId, settlementId)
- getReconciliationStatus()
```

## Test Criteria
- [ ] File exists
- [ ] Imports HDFC CSV correctly
- [ ] Auto-categorization works (70%+ correct)
- [ ] Duplicates detected
- [ ] Unreconciled transactions listed
- [ ] Manual categorization works

---

# STAGE 7: Products & COGS

## What This Does
Manages product catalog with costs.

## Prompt - Copy Everything Below

```
Create a file called products.js for product and COGS management.

REQUIREMENTS:

1. Product CRUD functions:
- addProduct(product)
- updateProduct(sku, updates)
- getProduct(sku)
- getAllProducts()
- deactivateProduct(sku)

2. Product schema:
{
  sku: "GRLHOOD-TC-IP15PM-001",
  product_name: "Dead Pretty Tough Case - iPhone 15 Pro Max",
  category: "Tough Case",
  cogs_without_gst: 150,
  gst_on_cogs: 27,
  cogs_with_gst: 177,
  selling_price: 799,
  is_active: 1
}

3. COGS lookup:
- getCOGSForOrderItem(sku, quantity)
- If SKU not found, use fallback by category:
  - Tough Case: 150
  - Glass Case: 180
  - Hard Case: 120
  - Clear Case: 100
  - GripPad: 80
  - Laptop Sleeve: 300
  - AirPods Case: 100

4. Bulk import:
- importProductsCSV(filePath)

5. Sync from Shopify:
- syncProductsFromShopify() - Creates entries without overwriting COGS
```

## Test Criteria
- [ ] File exists
- [ ] Can add/update products
- [ ] COGS lookup works
- [ ] Fallback COGS works
- [ ] Can bulk import CSV

---

# STAGE 8: Calculations Engine

## What This Does
Calculates all financial metrics.

## Prompt - Copy Everything Below

```
Create a file called calculations.js for all financial calculations.

REQUIREMENTS:

1. Per-order calculation - calculateOrderMetrics(orderId):
Returns:
{
  order_id,
  gross_amount,
  discount,
  net_revenue,
  cogs, // Sum of order items COGS
  shipping_cost, // From shipments
  gateway_fee, // Based on payment gateway
  gateway_fee_gst, // 18% of fee
  rto_loss, // If RTO: forward + return shipping
  contribution_margin // net_revenue - all costs
}

2. Gateway fee calculation - calculateGatewayFee(order):
- PayU Card: 2% + 18% GST
- PayU UPI: 0%
- PayU NetBanking: 1.5% + 18% GST
- Razorpay: 2% + 18% GST
- FlexiPe COD: 1% + 18% GST
- Default: 1.5% + 18% GST

3. RTO loss calculation - calculateRTOLoss(orderId):
= forward_shipping + return_shipping + (damaged COGS if applicable)

4. Daily aggregation - calculateDailyMetrics(date):
Returns:
{
  date,
  total_orders,
  gross_revenue,
  refunds,
  discounts,
  net_revenue,
  total_cogs,
  shipping_cost,
  gateway_fees,
  rto_count,
  rto_loss,
  contribution_margin,
  ad_spend, // From ad_spend table
  net_profit,
  profit_margin, // %
  aov,
  cod_orders,
  prepaid_orders,
  roas,
  profit_roas
}

5. Save daily metrics - saveDailyMetrics(date):
Calculate and upsert to daily_metrics table

6. Period calculation - calculatePeriodMetrics(startDate, endDate):
Aggregate for date range with comparison to previous period

7. Recalculate all - recalculateAllMetrics(startDate, endDate):
Loop through dates and recalculate
```

## Test Criteria
- [ ] File exists
- [ ] Per-order calculation correct
- [ ] Gateway fees correct per gateway type
- [ ] Daily metrics match manual calculation
- [ ] Period aggregation works
- [ ] Saves to daily_metrics table

---

# STAGE 9: Dashboard UI

## What This Does
Main dashboard screen.

## Prompt - Copy Everything Below

```
Create a React dashboard for the GRLHOOD financial system.

SETUP:
- Use Vite + React
- Tailwind CSS for styling
- Keep it simple, no complex libraries

LAYOUT:

1. HEADER
- "GRLHOOD Dashboard"
- Current date
- Last synced timestamp
- "Sync Now" button

2. TODAY'S NUMBERS (big cards)
- Revenue: ₹XX,XXX (green if up, red if down vs yesterday)
- Orders: XX
- AOV: ₹X,XXX
- Net Profit: ₹XX,XXX
- Profit Margin: XX%

3. QUICK STATS (smaller row)
- Ad Spend: ₹X,XXX
- ROAS: X.Xx
- Profit ROAS: X.Xx
- RTOs: X (₹XXX loss)
- Refunds: X

4. MONTH-TO-DATE
- Revenue: ₹X,XX,XXX / ₹25,00,000 target
- Progress bar
- Projected month end
- Status badge: On Track / Behind / Ahead

5. CASH POSITION
- Bank Balance: ₹X,XX,XXX
- Pending Settlements: ₹XX,XXX
- Pending COD: ₹XX,XXX
- Total Available: ₹X,XX,XXX

6. ALERTS (if any)
- Warning icons with messages
- e.g., "3 orders flagged high RTO risk"

API ENDPOINTS (create api.js with Express):
- GET /api/dashboard/today
- GET /api/dashboard/mtd
- GET /api/dashboard/cash
- GET /api/alerts
- POST /api/sync

Auto-refresh every 5 minutes.
Mobile responsive - stack cards vertically.
```

## Test Criteria
- [ ] Dashboard loads
- [ ] Shows today's numbers
- [ ] Shows MTD progress
- [ ] Shows cash position
- [ ] Alerts display
- [ ] Sync button works
- [ ] Works on mobile

---

# STAGE 10: Weekly/Monthly Views + Alerts

## What This Does
Adds detailed P&L and alert system.

## Prompt - Copy Everything Below

```
Extend the dashboard with weekly/monthly views and alerts.

1. ADD NAVIGATION TABS
- Today (existing)
- This Week
- This Month

2. WEEKLY VIEW - P&L Table:

| Line Item | This Week | Last Week | Change |
|-----------|-----------|-----------|--------|
| Gross Revenue | | | |
| (-) Refunds | | | |
| (-) Discounts | | | |
| = Net Revenue | | | |
| (-) COGS | | | |
| = Gross Profit | | | |
| (-) Shipping | | | |
| (-) Gateway Fees | | | |
| (-) RTO Loss | | | |
| = Contribution | | | |
| (-) Ad Spend | | | |
| = Net Profit | | | |

Plus: Orders, AOV, ROAS, RTO Rate

3. MONTHLY VIEW
Same as weekly but vs last month and vs target

4. ALERTS SYSTEM - Create alerts.js:

Check and return alerts for:
- High RTO risk orders (COD + score > 8)
- Settlement delays (> 3 days overdue)
- Uncategorized expenses
- Revenue below target pace
- ROAS below threshold (< 4x)

Priority levels:
- Critical (red): Cash low, settlement > 5 days
- Warning (yellow): RTO risk, below target
- Info (blue): Uncategorized expenses

5. API ENDPOINTS:
- GET /api/weekly?date=YYYY-MM-DD
- GET /api/monthly?month=YYYY-MM
- GET /api/alerts
```

## Test Criteria
- [ ] Weekly P&L displays correctly
- [ ] Monthly P&L displays correctly
- [ ] Comparisons work
- [ ] Alerts generate correctly
- [ ] Priority colors show
- [ ] Tab navigation works

---

# DEPLOYMENT (After All Stages)

1. Create Vercel/Railway account
2. Deploy backend (Node.js)
3. Deploy frontend (React)
4. Set up cron jobs:
   - Shopify sync: Every 1 hour
   - Shiprocket sync: Every 1 hour
   - Meta Ads sync: Every 6 hours
   - Daily metrics: End of day

---

# DAILY USAGE

1. Morning: Check dashboard (2 mins)
2. Weekly: Upload bank statement (5 mins)
3. Monthly: Review full P&L

---

# TROUBLESHOOTING

If a stage breaks:
1. Check which stage
2. Look at error message
3. Fix and re-test before moving on

Common issues:
- API credentials wrong → double check
- Data mismatch → check field mapping
- Calculations off → verify formulas manually
