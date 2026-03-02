const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
const HORIZON_THEME_ID = 150212673724;
const DAWN_THEME_ID = 151966187708;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getAccessToken() {
    console.log("Getting OAuth token...");
    const tokenRes = await axios.post(`https://${domain}/admin/oauth/access_token`, {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
    });
    return tokenRes.data.access_token;
}

async function getAssetValue(token, themeId, key) {
    const url = `https://${domain}/admin/api/2023-10/themes/${themeId}/assets.json?asset[key]=${key}`;
    try {
        const response = await axios.get(url, {
            headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
        });
        return response.data.asset.value;
    } catch (e) {
        if (e.response && e.response.status === 404) return null;
        console.error(`Failed to get ${key}:`, e.response ? e.response.data : e.message);
        return null;
    }
}

async function uploadAsset(token, themeId, key, value) {
    const url = `https://${domain}/admin/api/2023-10/themes/${themeId}/assets.json`;
    try {
        const response = await axios.put(url, {
            asset: { key, value }
        }, {
            headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
        });
        console.log(`Uploaded: ${key}`);
        return true;
    } catch (e) {
        console.error(`Failed to upload ${key}:`, e.response ? e.response.data : e.message);
        return false;
    }
}

async function runMigration() {
    const token = await getAccessToken();
    console.log("Token obtained!");

    const horizonAssetsList = JSON.parse(fs.readFileSync('horizon_assets.json'));
    const dawnAssetsList = JSON.parse(fs.readFileSync('dawn_assets.json'));

    const horizonSections = horizonAssetsList.filter(a => a.startsWith('sections/'));
    const dawnSections = dawnAssetsList.filter(a => a.startsWith('sections/'));
    const missingSections = horizonSections.filter(s => !dawnSections.includes(s));

    const horizonSnippets = horizonAssetsList.filter(a => a.startsWith('snippets/'));
    const dawnSnippets = dawnAssetsList.filter(a => a.startsWith('snippets/'));
    const missingSnippets = horizonSnippets.filter(s => !dawnSnippets.includes(s));

    console.log(`Cloning ${missingSections.length} Sections...`);
    for (const key of missingSections) {
        const value = await getAssetValue(token, HORIZON_THEME_ID, key);
        if (value) {
            await uploadAsset(token, DAWN_THEME_ID, key, value);
            await sleep(500); // Respect API limits
        }
    }

    console.log(`Cloning ${missingSnippets.length} Snippets...`);
    for (const key of missingSnippets) {
        const value = await getAssetValue(token, HORIZON_THEME_ID, key);
        if (value) {
            await uploadAsset(token, DAWN_THEME_ID, key, value);
            await sleep(500);
        }
    }

    console.log(`Cloning Settings & Index Layout...`);
    const filesToForceClone = [
        'config/settings_data.json',
        'templates/index.json'
    ];

    for (const key of filesToForceClone) {
        const value = await getAssetValue(token, HORIZON_THEME_ID, key);
        if (value) {
            await uploadAsset(token, DAWN_THEME_ID, key, value);
            await sleep(500);
        }
    }

    console.log("Migration script complete!");
}

runMigration();
