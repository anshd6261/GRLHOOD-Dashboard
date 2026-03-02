require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
const HORIZON = 150212673724;
const DAWN = 151966187708;

async function getAccessToken() {
    const r = await axios.post(`https://${domain}/admin/oauth/access_token`, { client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });
    return r.data.access_token;
}

async function uploadAsset(token, key, value) {
    try {
        await axios.put(`https://${domain}/admin/api/2023-10/themes/${DAWN}/assets.json`, { asset: { key, value } }, { headers: { 'X-Shopify-Access-Token': token } });
    } catch (e) {}
}

async function main() {
    console.log("Starting quick fix...");
    const token = await getAccessToken();
    const horizon = JSON.parse(fs.readFileSync('horizon_assets.json'));
    const dawn = JSON.parse(fs.readFileSync('dawn_assets.json'));
    
    // 1. Blocks in parallel (5 at a time)
    const blocks = horizon.filter(a => a.startsWith('blocks/')).filter(b => !dawn.includes(b));
    for (let i = 0; i < blocks.length; i += 10) {
        const chunk = blocks.slice(i, i + 10);
        await Promise.all(chunk.map(async b => {
            try {
                const res = await axios.get(`https://${domain}/admin/api/2023-10/themes/${HORIZON}/assets.json?asset[key]=${b}`, { headers: { 'X-Shopify-Access-Token': token } });
                await uploadAsset(token, b, res.data.asset.value);
            } catch(e) {}
        }));
    }
    console.log("Blocks uploaded.");
    
    // 2. Deadlock fix
    try {
        const dawnDataRes = await axios.get(`https://${domain}/admin/api/2023-10/themes/${DAWN}/assets.json?asset[key]=config/settings_data.json`, { headers: { 'X-Shopify-Access-Token': token } });
        let dawnData = JSON.parse(dawnDataRes.data.asset.value);
        if (dawnData.current) { dawnData.current.page_width = 1200; dawnData.current.badge_corner_radius = 4; }
        await uploadAsset(token, 'config/settings_data.json', JSON.stringify(dawnData, null, 2));
        
        const horizonSchemaRes = await axios.get(`https://${domain}/admin/api/2023-10/themes/${HORIZON}/assets.json?asset[key]=config/settings_schema.json`, { headers: { 'X-Shopify-Access-Token': token } });
        const horizonSchemaVal = horizonSchemaRes.data.asset.value;
        const sRes = await axios.put(`https://${domain}/admin/api/2023-10/themes/${DAWN}/assets.json`, { asset: { key: 'config/settings_schema.json', value: horizonSchemaVal } }, { headers: { 'X-Shopify-Access-Token': token } });
        
        const horizonDataRes = await axios.get(`https://${domain}/admin/api/2023-10/themes/${HORIZON}/assets.json?asset[key]=config/settings_data.json`, { headers: { 'X-Shopify-Access-Token': token } });
        await uploadAsset(token, 'config/settings_data.json', horizonDataRes.data.asset.value);
        console.log("Deadlock broken!");
        
        const indexRes = await axios.get(`https://${domain}/admin/api/2023-10/themes/${HORIZON}/assets.json?asset[key]=templates/index.json`, { headers: { 'X-Shopify-Access-Token': token } });
        await uploadAsset(token, 'templates/index.json', indexRes.data.asset.value);
        console.log("Index layout injected!");
        
    } catch (e) { console.error("Error:", e.response?.data?.errors?.asset || e.message); }
}
main();
