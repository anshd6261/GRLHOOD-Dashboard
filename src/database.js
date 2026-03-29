let Database;
try { Database = require('better-sqlite3'); } catch (e) { Database = null; }
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.VERCEL ? '/tmp/data' : (process.env.DATA_DIR || path.join(__dirname, '../data'));
const DB_FILE = process.env.VERCEL ? '/tmp/grlhood.db' : path.join(DATA_DIR, 'grlhood.db');

// Ensure data directory exists if not Vercel
if (!process.env.VERCEL && !fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db;

const getDb = () => {
    if (!db) {
        // Warning log for read-only environments
        if (process.env.VERCEL) {
            console.warn('[DB] WARNING: Running on Vercel with ephemeral SQLite database. Data will be lost on next cold start. Consider migrating to Turso or an external database provider.');
        }
        if (!Database) throw new Error('better-sqlite3 not available in this environment');
        db = new Database(DB_FILE, { verbose: console.log });
    }
    return db;
};

const initializeDatabase = () => {
    const database = getDb();

    // Enable WAL mode for better concurrency
    database.pragma('journal_mode = WAL');

    console.log('[DB] Initializing Database Schema...');

    const setupScript = `
        CREATE TABLE IF NOT EXISTS orders (
            order_id TEXT PRIMARY KEY,
            order_date TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            customer_email TEXT,
            shipping_address TEXT,
            city TEXT,
            state TEXT,
            pincode TEXT,
            gross_amount REAL,
            discount_amount REAL,
            shipping_charged REAL,
            net_amount REAL,
            payment_method TEXT,
            payment_gateway TEXT,
            order_status TEXT,
            refund_amount REAL,
            refund_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT,
            sku TEXT,
            product_name TEXT,
            category TEXT,
            phone_model TEXT,
            quantity INTEGER,
            unit_price REAL,
            total_price REAL,
            cogs REAL,
            FOREIGN KEY (order_id) REFERENCES orders(order_id)
        );

        CREATE TABLE IF NOT EXISTS shipments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT,
            awb_number TEXT,
            courier_name TEXT,
            shipped_date TEXT,
            delivered_date TEXT,
            current_status TEXT,
            forward_shipping_cost REAL,
            weight_kg REAL,
            is_rto INTEGER DEFAULT 0,
            rto_date TEXT,
            return_shipping_cost REAL,
            rto_reason TEXT,
            FOREIGN KEY (order_id) REFERENCES orders(order_id)
        );

        CREATE TABLE IF NOT EXISTS products (
            sku TEXT PRIMARY KEY,
            product_name TEXT,
            category TEXT,
            cogs_without_gst REAL,
            gst_on_cogs REAL,
            cogs_with_gst REAL,
            selling_price REAL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settlements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            settlement_id TEXT,
            source TEXT,
            settlement_date TEXT,
            period_start TEXT,
            period_end TEXT,
            gross_amount REAL,
            fees_deducted REAL,
            gst_on_fees REAL,
            net_amount REAL,
            bank_verified INTEGER DEFAULT 0,
            bank_transaction_id TEXT,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            expense_date TEXT,
            category TEXT,
            subcategory TEXT,
            vendor TEXT,
            description TEXT,
            amount REAL,
            gst REAL,
            total_with_gst REAL,
            payment_method TEXT,
            payment_status TEXT,
            invoice_url TEXT,
            is_recurring INTEGER DEFAULT 0,
            recurring_frequency TEXT
        );

        CREATE TABLE IF NOT EXISTS ad_spend (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            platform TEXT,
            campaign_name TEXT,
            adset_name TEXT,
            spend REAL,
            impressions INTEGER,
            clicks INTEGER,
            purchases INTEGER,
            purchase_value REAL,
            ctr REAL,
            cpc REAL,
            roas REAL
        );

        CREATE TABLE IF NOT EXISTS bank_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_date TEXT,
            description TEXT,
            reference_number TEXT,
            debit REAL,
            credit REAL,
            balance REAL,
            category TEXT,
            matched_settlement_id TEXT,
            matched_expense_id TEXT,
            is_reconciled INTEGER DEFAULT 0,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS daily_metrics (
            date TEXT PRIMARY KEY,
            total_orders INTEGER,
            gross_revenue REAL,
            refunds REAL,
            discounts REAL,
            net_revenue REAL,
            total_cogs REAL,
            shipping_cost REAL,
            gateway_fees REAL,
            rto_count INTEGER,
            rto_loss REAL,
            contribution_margin REAL,
            ad_spend REAL,
            net_profit REAL,
            aov REAL,
            cod_orders INTEGER,
            prepaid_orders INTEGER
        );

        -- Create Indexes
        CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
        CREATE INDEX IF NOT EXISTS idx_orders_pincode ON orders(pincode);
        CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
        CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
        CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(transaction_date);
        CREATE INDEX IF NOT EXISTS idx_metrics_date ON daily_metrics(date);
    `;

    // Execute setup script
    database.exec(setupScript);
    console.log('[DB] Database Schema Initialized Successfully.');
};

// Auto-initialize if run directly
if (require.main === module) {
    initializeDatabase();

    // Verify Dummy Insert per Build Guide testing criteria
    const db = getDb();
    const insertOrder = db.prepare(`
        INSERT INTO orders (order_id, order_date, customer_name, gross_amount, net_amount, payment_method, order_status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(order_id) DO NOTHING
    `);

    insertOrder.run('#TEST-001', new Date().toISOString(), 'Test Customer', 1000, 1000, 'Prepaid', 'Pending');
    console.log('[DB] Dummy Order Inserted Successfully.');

    const query = db.prepare('SELECT * FROM orders WHERE order_id = ?');
    const result = query.get('#TEST-001');
    console.log('[DB] Dummy Order Query Result:', result);
}

module.exports = {
    getDb,
    initializeDatabase
};
