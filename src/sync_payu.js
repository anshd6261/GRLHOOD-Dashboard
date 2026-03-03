const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { getDb } = require('./database');
require('dotenv').config();

const PAYU_MERCHANT_KEY = process.env.PAYU_MERCHANT_KEY;
const PAYU_SALT = process.env.PAYU_SALT;
const PAYU_URL = process.env.PAYU_ENV === 'test' ? 'https://test.payu.in/merchant/postservice' : 'https://info.payu.in/merchant/postservice';

// Helper: Generate PayU Hash for API
const generateHash = (command, var1) => {
    // Hash format: key|command|var1|salt
    const hashString = `${PAYU_MERCHANT_KEY}|${command}|${var1}|${PAYU_SALT}`;
    return crypto.createHash('sha512').update(hashString).digest('hex');
};

const syncPayUApi = async (dateStr) => {
    // dateStr format: YYYY-MM-DD
    if (!PAYU_MERCHANT_KEY || !PAYU_SALT) {
        console.warn('[PayU Sync] API credentials not found. Use CSV import.');
        return { processed: 0, error: 'Missing credentials' };
    }

    console.log(`[PayU Sync] Fetching settlements for date: ${dateStr}...`);
    const db = getDb();
    const command = 'get_settlement_details';
    const hash = generateHash(command, dateStr);

    try {
        const params = new URLSearchParams();
        params.append('key', PAYU_MERCHANT_KEY);
        params.append('command', command);
        params.append('hash', hash);
        params.append('var1', dateStr);

        const response = await axios.post(PAYU_URL, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (response.data.status === 0) {
            console.log(`[PayU Sync] API Error: ${response.data.msg}`);
            return { processed: 0, error: response.data.msg };
        }

        const settlements = response.data.transaction_details || [];
        return processSettlements(settlements, db, 'API');

    } catch (error) {
        console.error('[PayU Sync] Request Error:', error.message);
        throw error;
    }
};

// Also support CSV import since PayU API access is heavily gated
const importPayUCsv = (filePath) => {
    console.log(`[PayU Import] Processing CSV: ${filePath}`);
    const db = getDb();

    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    // Map CSV headers to our standardized object format
    const settlements = records.map(row => ({
        txnid: row['Transaction ID'] || row['txnid'],
        settled_date: row['Settled Date'] || row['settlement_date'],
        settlement_amount: row['Settlement Amount'] || row['settled_amount'],
        tds: row['TDS'] || 0,
        mer_net_amount: row['Net Amount'] || row['settlement_amount']
    }));

    return processSettlements(settlements, db, 'CSV');
};

const processSettlements = (settlements, db, source = 'API') => {
    let processedCount = 0;

    const upsertSettlement = db.prepare(`
        INSERT INTO settlements (
            order_id, gateway, utr_number, amount, settlement_date,
            fees_deducted, actual_settled_amount
        ) VALUES (?, 'PayU', ?, ?, ?, ?, ?)
        ON CONFLICT(order_id) DO UPDATE SET
            utr_number=excluded.utr_number,
            amount=excluded.amount,
            settlement_date=excluded.settlement_date,
            fees_deducted=excluded.fees_deducted,
            actual_settled_amount=excluded.actual_settled_amount
    `);

    // Helper: Map PayU TXN ID to Shopify Order ID roughly
    // Often txnid has a prefix/suffix, or ideally it's the exact Shopify order name
    const findOrderId = db.prepare('SELECT order_id, gross_amount FROM orders WHERE order_id = ? OR order_id = ?');

    db.transaction(() => {
        for (const s of settlements) {
            const txnid = s.txnid; // e.g., '12345' or '#12345'
            if (!txnid) continue;

            const possible1 = txnid.toString();
            const possible2 = `#${possible1}`;

            const order = findOrderId.get(possible1, possible2);
            if (!order) {
                // Not found. This could be an older order. We'll skip or insert a dummy.
                // For a robust system, we insert it anyway with the txnid as order_id to flag it.
                continue;
            }

            const orderId = order.order_id;
            const utr = s.utr || null; // API often provides UTR, CSV might not match
            const settledAmt = parseFloat(s.mer_net_amount || s.settlement_amount || 0);
            const fees = parseFloat(s.tds || 0);
            // In PayU, gross amount - fees = settled amount roughly. 
            // Better to calculate fees dynamically if not provided explicitly:
            const calcFees = order.gross_amount - settledAmt;

            // Date processing
            let dateStr = s.settlement_date || s.settled_date;
            if (dateStr && dateStr.includes('-')) {
                // Convert DD-MM-YYYY to YYYY-MM-DD if needed
                const parts = dateStr.split(' ')[0].split('-');
                if (parts[0].length === 2 && parts[2].length === 4) {
                    dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            } else if (dateStr) {
                const d = new Date(dateStr);
                if (!isNaN(d)) {
                    dateStr = d.toISOString().split('T')[0];
                }
            }

            upsertSettlement.run(
                orderId, utr, order.gross_amount, dateStr,
                fees > 0 ? fees : calcFees, settledAmt
            );

            processedCount++;
        }
    })();

    console.log(`[PayU Sync] Processed ${processedCount} settlements from ${source}.`);
    return { processed: processedCount };
};

module.exports = {
    syncPayUApi,
    importPayUCsv
};
