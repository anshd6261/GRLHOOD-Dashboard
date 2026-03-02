require('dotenv').config();
const axios = require('axios');

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
const HORIZON_THEME_ID = 150212673724;
const DAWN_THEME_ID = 151966187708;

async function getAccessToken() {
    const tokenRes = await axios.post(`https://${domain}/admin/oauth/access_token`, {
        client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials'
    });
    return tokenRes.data.access_token;
}

async function getAssetValue(token, themeId, key) {
    const url = `https://${domain}/admin/api/2023-10/themes/${themeId}/assets.json?asset[key]=${key}`;
    const response = await axios.get(url, { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } });
    return response.data.asset.value;
}

async function uploadAsset(token, themeId, key, value) {
    const url = `https://${domain}/admin/api/2023-10/themes/${themeId}/assets.json`;
    try {
        await axios.put(url, { asset: { key, value } }, { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } });
        console.log(`Uploaded: ${key}`);
        return true;
    } catch (e) {
        console.error(`Failed to upload ${key}:`, e.response?.data?.errors?.asset || e.message);
        return false;
    }
}

function stripPresetsFromSchema(liquidCode) {
    // Regex to match the {% schema %}...{% endschema %} block
    const schemaMatch = liquidCode.match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/);
    if (!schemaMatch) return liquidCode;

    try {
        let schemaJson = JSON.parse(schemaMatch[1]);
        if (schemaJson.presets) {
            delete schemaJson.presets; // Remove presets to bypass block validation errors on upload
        }
        const newSchemaBlock = `{% schema %}\n${JSON.stringify(schemaJson, null, 2)}\n{% endschema %}`;
        return liquidCode.replace(schemaMatch[0], newSchemaBlock);
    } catch (e) {
        console.error("Failed to parse schema JSON in file.", e);
        return liquidCode; // Return original if parsing fails
    }
}

async function runFixes() {
    const token = await getAccessToken();

    console.log("1. Cloning Horizon settings_schema.json to Dawn...");
    const schemaValue = await getAssetValue(token, HORIZON_THEME_ID, 'config/settings_schema.json');
    await uploadAsset(token, DAWN_THEME_ID, 'config/settings_schema.json', schemaValue);

    console.log("2. Re-trying settings_data.json upload...");
    const dataValue = await getAssetValue(token, HORIZON_THEME_ID, 'config/settings_data.json');
    await uploadAsset(token, DAWN_THEME_ID, 'config/settings_data.json', dataValue);

    console.log("3. Fixing and re-uploading rejected sections...");
    const failedSections = [
        'sections/hero.liquid',
        'sections/product-hotspots.liquid',
        'sections/product-list.liquid',
        'sections/product-recommendations.liquid',
        'sections/section.liquid',
        'sections/customer-love.liquid' // might have failed in truncated logs
    ];

    for (const file of failedSections) {
        try {
            const liquid = await getAssetValue(token, HORIZON_THEME_ID, file);
            if (liquid) {
                const fixedLiquid = stripPresetsFromSchema(liquid);
                await uploadAsset(token, DAWN_THEME_ID, file, fixedLiquid);
            }
        } catch(e) { console.log(`Skipped ${file}`); }
    }

    console.log("4. Re-trying index.json layout upload...");
    const indexValue = await getAssetValue(token, HORIZON_THEME_ID, 'templates/index.json');
    await uploadAsset(token, DAWN_THEME_ID, 'templates/index.json', indexValue);

    console.log("Fix script complete.");
}

runFixes();
