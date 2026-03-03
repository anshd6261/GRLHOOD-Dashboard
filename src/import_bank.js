const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { getDb } = require('./database');

const EXPECTED_HEADERS = ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'];

const CATEGORY_RULES = [
    { keywords: ['FACEBOOK', 'META', 'FB ADS'], category: 'Ad Spend', isExpense: true },
    { keywords: ['PAYU', 'SETTLEMENT'], category: 'Sales Revenue', isExpense: false },
    { keywords: ['SHIPROCKET', 'DELHIVERY', 'BLUEDART'], category: 'Shipping', isExpense: true },
    { keywords: ['AWS', 'AMAZON WEB', 'VERCEL', 'CLOUDFLARE'], category: 'Software/Hosting', isExpense: true },
    { keywords: ['SALARY', 'WAGES'], category: 'Payroll', isExpense: true },
    { keywords: ['SWIGGY', 'ZOMATO', 'STARBUCKS', 'CAFE'], category: 'Meals & Entertainment', isExpense: true },
    { keywords: ['PRINT'], category: 'Manufacturing/Raw Materials', isExpense: true },
    // Catch-all
    { keywords: [], category: 'Uncategorized', isExpense: true }
];

const autoCategorize = (narration, withdrawalAmt, depositAmt) => {
    const text = narration.toUpperCase();
    const isDebit = parseFloat(withdrawalAmt || 0) > 0;

    for (const rule of CATEGORY_RULES) {
        if (rule.keywords.length === 0) continue; // Skip catch-all for now

        if (rule.keywords.some(keyword => text.includes(keyword))) {
            // Verify if the cash flow direction makes sense for the category
            if (rule.isExpense && isDebit) return rule.category;
            if (!rule.isExpense && !isDebit) return rule.category;
        }
    }

    return isDebit ? 'Uncategorized Expense' : 'Uncategorized Income';
};

const parseDate = (dateStr) => {
    // Expected HDFC format: DD/MM/YY
    if (!dateStr || dateStr.trim() === '') return null;
    const parts = dateStr.trim().split('/');
    if (parts.length === 3) {
        let year = parseInt(parts[2], 10);
        // Handle 2-digit years assuming 20xx
        if (year < 100) year += 2000;

        const month = parts[1].padStart(2, '0');
        const day = parts[0].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return dateStr;
};

const importBankStatement = (filePath) => {
    console.log(`[Bank Import] Processing file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');

    // HDFC CSVs often have header garbage or empty lines before the actual table starts
    // We'll roughly find where 'Date' or 'Narration' starts
    const lines = fileContent.split('\n');
    let startLine = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Narration') && lines[i].includes('Date')) {
            startLine = i;
            break;
        }
    }

    const cleanContent = lines.slice(startLine).join('\n');

    const records = parse(cleanContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
    });

    const db = getDb();
    let imported = 0;

    const insertTxn = db.prepare(`
        INSERT INTO bank_transactions (
            date, description, reference_number, withdrawal_amt,
            deposit_amt, closing_balance, category, is_categorized
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, reference_number, description) DO NOTHING
    `);

    // We also want to auto-create expenses for recognized categories
    const insertExpense = db.prepare(`
        INSERT INTO expenses (
            date, category, description, amount, payment_method, is_recurring
        ) VALUES (?, ?, ?, ?, 'Bank Transfer', 0)
    `);

    db.transaction(() => {
        for (const row of records) {
            const dateStr = parseDate(row['Date'] || row['Date ']);
            const narration = row['Narration'] || '';
            const refNo = row['Chq./Ref.No.'] || '';

            // Clean amounts (remove commas)
            const wAmtStr = (row['Withdrawal Amt.'] || row['Debit'] || '0').replace(/,/g, '');
            const dAmtStr = (row['Deposit Amt.'] || row['Credit'] || '0').replace(/,/g, '');
            const balStr = (row['Closing Balance'] || row['Balance'] || '0').replace(/,/g, '');

            const withdrawal = parseFloat(wAmtStr) || 0;
            const deposit = parseFloat(dAmtStr) || 0;
            const balance = parseFloat(balStr) || 0;

            if (!dateStr || narration === '') continue; // Skip invalid rows (footer/headers)

            const category = autoCategorize(narration, withdrawal, deposit);
            const isCategorized = !category.includes('Uncategorized') ? 1 : 0;

            const result = insertTxn.run(
                dateStr, narration, refNo, withdrawal, deposit, balance, category, isCategorized
            );

            // If it's a new row and an expense, and we categorized it (except Ad Spend mapped elsewhere)
            if (result.changes > 0 && isCategorized && withdrawal > 0 && category !== 'Ad Spend') {
                insertExpense.run(dateStr, category, narration, withdrawal);
            }

            if (result.changes > 0) imported++;
        }
    })();

    console.log(`[Bank Import] Successfully imported ${imported} new transactions.`);
    return { imported };
};

const getRecentTransactions = (limit = 50) => {
    const db = getDb();
    return db.prepare('SELECT * FROM bank_transactions ORDER BY date DESC, id DESC LIMIT ?').all(limit);
};

const getUncategorizedCount = () => {
    const db = getDb();
    const result = db.prepare('SELECT COUNT(*) as count FROM bank_transactions WHERE is_categorized = 0').get();
    return result ? result.count : 0;
};

module.exports = {
    importBankStatement,
    getRecentTransactions,
    getUncategorizedCount
};
