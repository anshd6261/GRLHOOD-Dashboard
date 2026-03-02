require('dotenv').config();
const axios = require('axios');

async function checkThemeAccess() {
    try {
        const domain = process.env.SHOPIFY_STORE_DOMAIN;
        const accessToken = process.env.SHOPIFY_CLIENT_SECRET; // Access token for custom apps
        
        console.log("Checking Theme Access for:", domain);
        
        const response = await axios.get(`https://${domain}/admin/api/2023-10/themes.json`, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            }
        });
        
        console.log("SUCCESS! We have access to themes.");
        console.log(`Found ${response.data.themes.length} themes.`);
        
        response.data.themes.forEach(t => {
            console.log(`- ID: ${t.id} | Name: ${t.name} | Role: ${t.role}`);
        });
        
    } catch (error) {
        console.log("FAILED to access themes.");
        if (error.response) {
            console.log("Status:", error.response.status);
            console.log("Data:", error.response.data);
        } else {
            console.log("Error:", error.message);
        }
    }
}

checkThemeAccess();
