const stringify = require('csv-stringify/sync').stringify;
const fs = require('fs');
const path = require('path');

console.log('[CSV Module] Loaded Version 1.1');

const generateCSV = (inputRows, gstRate = 18) => {
    // Deep copy to ensure we can modify COGS safely
    const rows = JSON.parse(JSON.stringify(inputRows));

    // 1. Calculate Summary
    const categoryCounts = {};
    let totalCOGS = 0;

    rows.forEach(row => {
        if (!row) return; // Skip null/undefined rows

        // Count categories
        const cat = row.category || 'Unknown';
        if (!categoryCounts[cat]) {
            categoryCounts[cat] = 0;
        }
        categoryCounts[cat]++;

        // Sum COGS - Ensure it's a number
        const cogsVal = parseFloat(row.cogs);
        row.cogs = isNaN(cogsVal) ? 0 : cogsVal;

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
        if (!row) return; // Skip null rows

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

    // 3. Stringify purely the data rows with no visual summaries
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
