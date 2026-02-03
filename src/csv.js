const stringify = require('csv-stringify/sync').stringify;
const fs = require('fs');
const path = require('path');

const generateCSV = (rows, gstRate = 18) => {
    // 1. Calculate Summary
    const categoryCounts = {};
    let totalCOGS = 0;

    rows.forEach(row => {
        // Count categories
        if (!categoryCounts[row.category]) {
            categoryCounts[row.category] = 0;
        }
        categoryCounts[row.category]++;

        // Sum COGS
        totalCOGS += row.cogs;
    });

    const gstAmount = totalCOGS * (gstRate / 100);
    const grandTotal = totalCOGS + gstAmount;

    // 2. Prepare CSV Data
    const csvRows = [];

    // Header
    csvRows.push(['Category', 'Model', 'SKU', 'Customer Name', 'Order ID', 'Preview Product URL', 'Payment', 'COGS']);

    // Data Rows
    rows.forEach(row => {
        csvRows.push([
            row.category,
            row.model,
            row.sku,
            row.customerName,
            row.orderId,
            row.previewUrl,
            row.payment,
            row.cogs > 0 ? row.cogs.toFixed(2) : ''
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

    // 3. Stringify
    const output = stringify(csvRows);

    // Add BOM for Excel compatibility
    return '\uFEFF' + output;
};

const saveCSV = (content) => {
    const date = new Date();
    const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    const filename = `${month}-${day}-ORDERS.csv`;

    const filePath = path.join(process.cwd(), filename);
    fs.writeFileSync(filePath, content);

    console.log(`[CSV] Saved to ${filePath}`);
    return filePath;
};

module.exports = {
    generateCSV,
    saveCSV
};
