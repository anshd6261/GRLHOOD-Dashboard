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

/**
 * List entries in a Dropbox folder. Returns array of { name, path_display, .tag } or empty.
 */
const listFolder = async (token, folderPath) => {
    try {
        const res = await axios.post('https://api.dropboxapi.com/2/files/list_folder', {
            path: folderPath, recursive: false, limit: 100
        }, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        return res.data?.entries || [];
    } catch (e) {
        // 409 = path not found (folder doesn't exist yet) — not an error
        if (e.response?.status === 409) return [];
        console.warn(`[DROPBOX] listFolder ${folderPath}:`, e.response?.data?.error_summary || e.message);
        return [];
    }
};

/**
 * Delete a file or folder in Dropbox.
 */
const deleteEntry = async (token, entryPath) => {
    try {
        await axios.post('https://api.dropboxapi.com/2/files/delete_v2', {
            path: entryPath
        }, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        console.log(`[DROPBOX] Deleted: ${entryPath}`);
    } catch (e) {
        console.warn(`[DROPBOX] Delete failed for ${entryPath}:`, e.response?.data?.error_summary || e.message);
    }
};

/**
 * Clean up duplicate date folders in the month directory.
 * If multiple folders exist for the same date label, delete them all
 * so a fresh one is created by the upload.
 */
const cleanDuplicateFolders = async (token, monthPath, dateLabel) => {
    const entries = await listFolder(token, monthPath);
    const dateFolders = entries.filter(e =>
        e['.tag'] === 'folder' && e.name.includes(dateLabel)
    );
    if (dateFolders.length > 1) {
        console.log(`[DROPBOX] Found ${dateFolders.length} duplicate folders for "${dateLabel}" — cleaning up`);
        for (const folder of dateFolders) {
            await deleteEntry(token, folder.path_display || folder.path_lower);
        }
        return true; // Cleaned
    }
    if (dateFolders.length === 1) {
        // Single folder exists — delete it and recreate fresh
        console.log(`[DROPBOX] Replacing existing folder for "${dateLabel}"`);
        await deleteEntry(token, dateFolders[0].path_display || dateFolders[0].path_lower);
        return true;
    }
    return false; // No existing folders
};

const uploadOrderPayload = async (pdfUrl, standardCsvContent, financialCsvContent) => {
    // Get a fresh access token every time (they only last 4 hours)
    const token = await getAccessToken();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    // Use IST so month folder matches Indian business day
    const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const monthName = monthNames[istNow.getMonth()];
    const dateLabel = getFormattedDate(); // e.g. "17th March 2026"

    // Path: /ORDERS/March/17th March 2026 Order/
    const monthPath = `/ORDERS/${monthName}`;
    const folderPath = `${monthPath}/${dateLabel} Order`;
    console.log(`[DROPBOX] Target: ${folderPath}`);

    // Only clean up existing folders when uploading CSVs (initial upload).
    // When uploading only labels (pdfUrl set, no CSVs), skip cleanup to preserve existing CSVs.
    const isLabelOnly = pdfUrl && !standardCsvContent && !financialCsvContent;
    if (!isLabelOnly) {
        await cleanDuplicateFolders(token, monthPath, dateLabel);
    }

    // Upload Standard Supplier CSV
    if (standardCsvContent) {
        await uploadFile(token, `${folderPath}/${dateLabel} Order.csv`, Buffer.from(standardCsvContent, 'utf-8'));
    }

    // Upload Financial Report CSV
    if (financialCsvContent) {
        await uploadFile(token, `${folderPath}/${dateLabel} Order - Financial report.csv`, Buffer.from(financialCsvContent, 'utf-8'));
    }

    // Upload PDF Labels (if provided) — uses mode:'overwrite' so only this file is replaced
    if (pdfUrl) {
        const pdfRes = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        await uploadFile(token, `${folderPath}/${dateLabel} Labels.pdf`, Buffer.from(pdfRes.data));
    }

    console.log(`[DROPBOX] ✅ All uploads complete → ${folderPath}`);
    return folderPath;
};

module.exports = { uploadOrderPayload, getAccessToken, uploadFile, listFolder, deleteEntry, cleanDuplicateFolders };
