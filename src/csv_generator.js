const stringify = require('csv-stringify/sync').stringify;
const fs = require('fs');
const path = require('path');

console.log('[CSV Module] Loaded Version 2.0 (Dual Export)');

// Authoritative NBE (NextBigE) supplier cost per unit, ex-GST — verified to the rupee
// against the real supplier invoices (13 Jul, 9 Jul, 24 Jun 2026). The Financial /
// Calculation CSV is priced from this so it reconciles exactly to the NBE invoice,
// regardless of whether Shopify's per-variant "Cost per item" is set.
const NBE_UNIT_COST = {
    'Premium Tough Case': 235,
    'Premium Hard Case': 135,
    'Glass Case': 160,
    'Silicone Clear Case': 115,
    'MagSafe Armoured': 350,   // billed as "Premium Tough Case With Magsafe" on the NBE invoice
    'GripPad': 65,             // billed as "Suction Sticky Grip" on the NBE invoice
};

// Resolve a row's unit cost: exact category match first, then a few known aliases,
// finally fall back to whatever cost the row already carried (e.g. Shopify unitCost).
const resolveUnitCost = (category, fallback) => {
    const fb = (fallback == null || isNaN(parseFloat(fallback))) ? 0 : parseFloat(fallback);
    if (!category) return fb;
    const key = String(category).trim();
    if (NBE_UNIT_COST[key] != null) return NBE_UNIT_COST[key];
    const l = key.toLowerCase();
    if (l.includes('magsafe') || l.includes('mag safe')) return NBE_UNIT_COST['MagSafe Armoured'];
    if (l.includes('grip')) return NBE_UNIT_COST['GripPad'];
    if (l.includes('glass')) return NBE_UNIT_COST['Glass Case'];
    if (l.includes('clear') || l.includes('silicone')) return NBE_UNIT_COST['Silicone Clear Case'];
    if (l.includes('hard') || l.includes('slim snap')) return NBE_UNIT_COST['Premium Hard Case'];
    if (l.includes('tough') || l.includes('double armoured')) return NBE_UNIT_COST['Premium Tough Case'];
    return fb;
};

const getFormattedDate = () => {
    // Use IST (UTC+5:30) so folder names match Indian business day
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'long' });
    const year = d.getFullYear();
    const suffix = (day === 1 || day === 21 || day === 31) ? 'st' :
                   (day === 2 || day === 22) ? 'nd' :
                   (day === 3 || day === 23) ? 'rd' : 'th';
    return `${day}${suffix} ${month} ${year}`;
};

const generateSupplierCSV = (inputRows) => {
    const rows = JSON.parse(JSON.stringify(inputRows));
    const csvRows = [];

    // Header (No Payment, No COGS)
    csvRows.push(['Product Category', 'Model', 'Design Number(SKU)', 'Customer Name', 'Order ID', 'Preview Product URL', 'AWB(Optional)']);

    rows.forEach(row => {
        if (!row) return;

        csvRows.push([
            row.category || '',
            row.model || '',
            row.sku || '',
            row.customerName || '',
            row.orderId || '',
            row.previewUrl || '',
            ''
        ]);
    });

    return '\uFEFF' + stringify(csvRows);
};

const generateFinancialCSV = (inputRows, gstRate = 18) => {
    const rows = JSON.parse(JSON.stringify(inputRows));

    const categoryCounts = {};
    let totalCOGS = 0;

    rows.forEach(row => {
        if (!row) return;

        const cat = row.category || 'Unknown';
        if (!categoryCounts[cat]) {
            categoryCounts[cat] = 0;
        }
        categoryCounts[cat]++;

        // Price from the authoritative NBE rate card so the calc CSV matches the supplier
        // invoice; fall back to the row's own cogs only for categories not in the map.
        row.cogs = resolveUnitCost(row.category, row.cogs);
        totalCOGS += row.cogs;
    });

    const gstAmount = totalCOGS * (gstRate / 100);
    const grandTotal = totalCOGS + gstAmount;

    const csvRows = [];

    // Header (Includes Payment and COGS)
    csvRows.push(['Category', 'Model', 'SKU', 'Customer Name', 'Order ID', 'Preview Product URL', 'Payment', 'COGS']);

    rows.forEach(row => {
        if (!row) return;

        const cogsNum = parseFloat(row.cogs);
        const finalCogs = isNaN(cogsNum) ? 0 : cogsNum;

        csvRows.push([
            row.category || '',
            row.model || '',
            row.sku || '',
            row.customerName || '',
            row.orderId || '',
            row.previewUrl || '',
            row.payment || '',
            finalCogs > 0 ? finalCogs.toFixed(2) : ''
        ]);
    });

    // Spacer
    csvRows.push([]);
    csvRows.push(['════════════════════════', 'ORDER SUMMARY', '════════════════════════']);
    csvRows.push([]);

    // Category Summary
    csvRows.push(['VARIANT CATEGORY', 'QUANTITY']);
    Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .forEach(([category, count]) => {
            csvRows.push([category, count]);
        });

    csvRows.push([]);
    csvRows.push(['TOTAL ITEMS', rows.length]);
    csvRows.push(['TOTAL ORDERS', new Set(rows.map(r => r.orderId)).size]);

    // Invoice Section
    csvRows.push([]);
    csvRows.push(['════════════════════════', 'INVOICE', '════════════════════════']);
    csvRows.push([]);
    csvRows.push(['Subtotal (COGS)', `₹${totalCOGS.toFixed(2)}`]);
    csvRows.push([`GST (${gstRate}%)`, `₹${gstAmount.toFixed(2)}`]);
    csvRows.push(['GRAND TOTAL', `₹${grandTotal.toFixed(2)}`]);
    csvRows.push([]);
    csvRows.push(['Generated On', new Date().toLocaleString()]);

    return '\uFEFF' + stringify(csvRows);
};

// Deprecated / Backwards compatibility for exact cases if needed
const saveCSV = (content) => {
    const filename = `${getFormattedDate()} Order.csv`;
    const filePath = path.join(process.cwd(), filename);
    fs.writeFileSync(filePath, content);
    console.log(`[CSV] Saved to ${filePath}`);
    return filePath;
};

module.exports = {
    generateSupplierCSV,
    generateFinancialCSV,
    getFormattedDate,
    saveCSV
};
