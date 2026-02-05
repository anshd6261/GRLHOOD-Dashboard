const shiprocket = require('./src/shiprocket');
const axios = require('axios');

async function testConnection() {
    console.log("Testing Shiprocket Connection...");
    try {
        const token = await shiprocket.authenticate();
        console.log("✅ Authentication Successful. Token received.");

        // TEST 5: Account Statement (from search results)
        try {
            console.log("Attempting /v1/external/account/details/statement...");
            const resD = await axios.get('https://apiv2.shiprocket.in/v1/external/account/details/statement', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log("✅ Statement Root Keys:", Object.keys(resD.data));
            if (resD.data.data && resD.data.data.length > 0) {
                console.log("✅ Statement First Item:", JSON.stringify(resD.data.data[0], null, 2));
            } else {
                console.log("⚠️ Statement list is empty.");
            }
        } catch (e) {
            console.log(`❌ Method D Failed: ${e.response ? e.response.status : e.message}`);
        }

    } catch (error) {
        console.error("Critical:", error.message);
    }
}

testConnection();
