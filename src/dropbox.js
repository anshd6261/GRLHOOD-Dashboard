const axios = require('axios');
const { getFormattedDate } = require('./csv_generator');
require('dotenv').config();

const DROPBOX_UPLOAD_URL = 'https://content.dropboxapi.com/2/files/upload';
const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';

/**
 * Get a fresh short-lived access token using the permanent refresh token.
 */
const getAccessToken = async () => {
    const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
    const appKey = process.env.DROPBOX_APP_KEY;
    const appSecret = process.env.DROPBOX_APP_SECRET;

    if (!refreshToken || !appKey || !appSecret) {
        throw new Error('Missing DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, or DROPBOX_APP_SECRET in env');
    }

    console.log('[DROPBOX] Refreshing access token...');
    const res = await axios.post(DROPBOX_TOKEN_URL, null, {
        params: {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: appKey,
            client_secret: appSecret
        }
    });

    console.log('[DROPBOX] ✅ Got fresh access token');
    return res.data.access_token;
};

const uploadFile = async (token, filePath, contents) => {
    console.log(`[DROPBOX] Uploading: ${filePath} (${contents.length} bytes)`);
    try {
        const res = await axios.post(DROPBOX_UPLOAD_URL, contents, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': JSON.stringify({
                    path: filePath,
                    mode: 'overwrite',
                    autorename: false,
                    mute: false
                })
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        console.log(`[DROPBOX] ✅ Uploaded: ${filePath}`);
        return res.data;
    } catch (e) {
        const errMsg = e.response?.data?.error_summary || e.response?.data || e.message;
        console.error(`[DROPBOX] ❌ Failed: ${filePath}`, errMsg);
        throw new Error(`Dropbox upload failed for ${filePath}: ${JSON.stringify(errMsg)}`);
    }
};

const uploadOrderPayload = async (pdfUrl, standardCsvContent, financialCsvContent) => {
    // Get a fresh access token every time (they only last 4 hours)
    const token = await getAccessToken();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[new Date().getMonth()];
    const dateLabel = getFormattedDate(); // e.g. "17th March 2026"

    // Path: /ORDERS/March/17th March 2026 Order/
    const folderPath = `/ORDERS/${monthName}/${dateLabel} Order`;
    console.log(`[DROPBOX] Target: ${folderPath}`);

    // Upload Standard Supplier CSV
    if (standardCsvContent) {
        await uploadFile(token, `${folderPath}/${dateLabel} Order.csv`, Buffer.from(standardCsvContent, 'utf-8'));
    }

    // Upload Financial Report CSV
    if (financialCsvContent) {
        await uploadFile(token, `${folderPath}/${dateLabel} Order - Financial report.csv`, Buffer.from(financialCsvContent, 'utf-8'));
    }

    // Upload PDF Labels (if provided)
    if (pdfUrl) {
        const pdfRes = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        await uploadFile(token, `${folderPath}/${dateLabel} Labels.pdf`, Buffer.from(pdfRes.data));
    }

    console.log(`[DROPBOX] ✅ All uploads complete → ${folderPath}`);
    return folderPath;
};

module.exports = { uploadOrderPayload };
