const { processOrders } = require('../src/processor');
const { generateCSV, saveCSV } = require('../src/csv');
const mockOrders = require('./mock_data');
const fs = require('fs');

console.log('[TEST] Starting verification...');

// 1. Process
const processed = processOrders(mockOrders);
console.log(`[TEST] Processed ${processed.length} rows (Expected 4: 1 + 2 + 1)`);

if (processed.length !== 4) {
    console.error('[FAIL] Row count mismatch!');
    process.exit(1);
}

// 2. Verify Logic
const row1 = processed[0];
if (row1.model !== 'iPhone 14 Pro Max' || row1.payment !== 'Cash on Delivery') {
    console.error('[FAIL] Logic error in row 1:', row1);
} else {
    console.log('[PASS] Row 1 Logic (iPhone 14 Pro Max, COD)');
}

const row2 = processed[1]; // First of the Samsung quantity 2
const row3 = processed[2]; // Second of the Samsung quantity 2
if (row2.model !== 'Samsung S23 Ultra' || row2.orderId !== '1421') {
    console.error('[FAIL] Logic error in Samsung row:', row2);
} else {
    console.log('[PASS] Samsung Logic (Added "Samsung" prefix)');
}

const row4 = processed[3];
if (row4.model !== 'iPhone 13' || row4.payment !== 'Prepaid') {
    console.error('[FAIL] Logic error in Apple row:', row4);
} else {
    console.log('[PASS] Apple Logic (Removed "Apple" prefix, Prepaid)');
}

// 3. Generate CSV
const csv = generateCSV(processed);
if (!csv.includes('INVOICE') || !csv.includes('GRAND TOTAL')) {
    console.error('[FAIL] CSV Invoice section missing');
} else {
    console.log('[PASS] CSV formatting checks passed');
}

// 4. Save
saveCSV(csv);
console.log('[TEST] Verification Complete.');
