const stringify = require('csv-stringify/sync').stringify;
const fs = require('fs');
const path = require('path');

console.log('[CSV Module] Loaded Version 2.0 (Dual Export)');

const getFormattedDate = () => {
    const d = new Date();
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
    csvRows.push(['Category', 'Model', 'SKU', 'Customer Name', 'Order ID', 'Preview Product URL']);

    rows.forEach(row => {
        if (!row) return;

        csvRows.push([
            row.category || '',
            row.model || '',
            row.sku || '',
            row.customerName || '',
            row.orderId || '',
            row.previewUrl || ''
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

        const cogsVal = parseFloat(row.cogs);
        row.cogs = isNaN(cogsVal) ? 0 : cogsVal;
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
