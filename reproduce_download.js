const axios = require('axios');

const API_URL = 'http://localhost:3001/api';

async function testSaveAndDownload() {
    try {
        console.log('1. Fetching History...');
        const historyRes = await axios.get(`${API_URL}/history`);
        const history = historyRes.data;

        if (history.length === 0) {
            console.log('No history found. Create a batch first.');
            return;
        }

        const latestBatch = history[0];
        console.log(`2. Editing Batch ${latestBatch.id} (${latestBatch.rows.length} rows)`);

        // Simulate Save (PUT)
        console.log('3. Saving Batch...');
        await axios.put(`${API_URL}/history/${latestBatch.id}`, { rows: latestBatch.rows });
        console.log('   Save Successful.');

        // Simulate Download (POST with skipHistory)
        console.log('4. Downloading with skipHistory: true...');
        const downloadRes = await axios.post(`${API_URL}/download`, {
            rows: latestBatch.rows,
            skipHistory: true
        });

        console.log('   Download Response Status:', downloadRes.status);
        console.log('   Download Response Length:', downloadRes.data.length);
        console.log('SUCCESS: Flow completed without error.');

    } catch (error) {
        console.error('FAILURE:', error.message);
        if (error.response) {
            console.error('Data:', error.response.data);
            console.error('Status:', error.response.status);
        }
    }
}

testSaveAndDownload();
