require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
const HORIZON = 150212673724;
const DAWN = 151966187708;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getAccessToken() {
    const r = await axios.post(`https://${domain}/admin/oauth/access_token`, { client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });
    return r.data.access_token;
}

async function uploadAsset(token, key, value) {
    try {
        await axios.put(`https://${domain}/admin/api/2023-10/themes/${DAWN}/assets.json`, { asset: { key, value } }, { headers: { 'X-Shopify-Access-Token': token } });
        console.log(`Uploaded: ${key}`);
    } catch (e) { console.error(`Failed ${key}:`, e.response?.data?.errors?.asset || e.message); }
}

async function main() {
    const token = await getAccessToken();
    const horizon = JSON.parse(fs.readFileSync('horizon_assets.json'));
    const dawn = JSON.parse(fs.readFileSync('dawn_assets.json'));
    
    const blocks = horizon.filter(a => a.startsWith('blocks/')).filter(b => !dawn.includes(b));
    console.log(`Found ${blocks.length} missing blocks.`);
    
    let cnt=0;
    for (const b of blocks) {
        try {
            const res = await axios.get(`https://${domain}/admin/api/2023-10/themes/${HORIZON}/assets.json?asset[key]=${b}`, { headers: { 'X-Shopify-Access-Token': token } });
            await uploadAsset(token, b, res.data.asset.value);
            await sleep(300);
            cnt++;
        } catch(e) { console.error(e.message); }
    }
    console.log(`Uploaded ${cnt} blocks`);
    
    // Fix Deadlock
    console.log("Fixing Settings Deadlock...");
    try {
        const dawnDataRes = await axios.get(`https://${domain}/admin/api/2023-10/themes/${DAWN}/assets.json?asset[key]=config/settings_data.json`, { headers: { 'X-Shopify-Access-Token': token } });
        let dawnData = JSON.parse(dawnDataRes.data.asset.value);
        if (dawnData.current) { dawnData.current.page_width = 1200; dawnData.current.badge_corner_radius = 4; }
        await uploadAsset(token, 'config/settings_data.json', JSON.stringify(dawnData, null, 2));
        await sleep(500);
        
        const horizonSchemaRes = await axios.get(`https://${domain}/admin/api/2023-10/themes/${HORIZON}/assets.json?asset[key]=config/settings_schema.json`, { headers: { 'X-Shopify-Access-Token': token } });
        await uploadAsset(token, 'config/settings_schema.json', horizonSchemaRes.data.asset.value);
        await sleep(500);
        
        const horizonDataRes = await axios.get(`https://${domain}/admin/api/2023-10/themes/${HORIZON}/assets.json?asset[key]=config/settings_data.json`, { headers: { 'X-Shopify-Access-Token': token } });
        await uploadAsset(token, 'config/settings_data.json', horizonDataRes.data.asset.value);
        console.log("Schema Deadlock Broken!");
        
        console.log("Re-uploading index.json...");
        const indexRes = await axios.get(`https://${domain}/admin/api/2023-10/themes/${HORIZON}/assets.json?asset[key]=templates/index.json`, { headers: { 'X-Shopify-Access-Token': token } });
        await uploadAsset(token, 'templates/index.json', indexRes.data.asset.value);
        
    } catch (e) { console.error("Error in fixing deadlock:", e.response?.data?.errors?.asset || e.message); }
}
main();
