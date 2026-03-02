require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
const HORIZON_THEME_ID = 150212673724;
const DAWN_THEME_ID = 151966187708;

async function fetchAssets() {
    try {
        const tokenRes = await axios.post(`https://${domain}/admin/oauth/access_token`, {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials'
        });
        const token = tokenRes.data.access_token;
        const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };

        console.log("Fetching Horizon assets...");
        const horizonRes = await axios.get(`https://${domain}/admin/api/2023-10/themes/${HORIZON_THEME_ID}/assets.json`, { headers });
        fs.writeFileSync('horizon_assets.json', JSON.stringify(horizonRes.data.assets.map(a => a.key), null, 2));

        console.log("Fetching Dawn assets...");
        const dawnRes = await axios.get(`https://${domain}/admin/api/2023-10/themes/${DAWN_THEME_ID}/assets.json`, { headers });
        fs.writeFileSync('dawn_assets.json', JSON.stringify(dawnRes.data.assets.map(a => a.key), null, 2));

        console.log("Done. Saved to horizon_assets.json and dawn_assets.json");
    } catch (err) {
        console.error("Error:", err.response ? err.response.data : err.message);
    }
}
fetchAssets();
