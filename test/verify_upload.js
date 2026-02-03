
const { uploadToPortal } = require('../src/uploader');
const path = require('path');

async function testUpload() {
    try {
        const csvPath = path.join(__dirname, '..', 'FEB-3-ORDERS.csv'); // Use existing CSV
        console.log(`Testing upload with: ${csvPath}`);
        await uploadToPortal(csvPath);
        console.log('Test passed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

testUpload();
