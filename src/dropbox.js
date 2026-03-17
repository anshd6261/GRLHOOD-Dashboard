const axios = require('axios');
const { getFormattedDate } = require('./csv_generator');
require('dotenv').config();

const DROPBOX_UPLOAD_URL = 'https://content.dropboxapi.com/2/files/upload';

const uploadFile = async (token, filePath, contents) => {
    console.log(`[DROPBOX] Attempting upload to: ${filePath} (${contents.length} bytes)`);
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
        console.log(`[DROPBOX] ✅ Successfully uploaded: ${filePath}`);
        return res.data;
    } catch (e) {
        const errMsg = e.response?.data?.error_summary || e.response?.data || e.message;
        console.error(`[DROPBOX] ❌ Failed to upload ${filePath}:`, errMsg);
        throw new Error(`Dropbox upload failed for ${filePath}: ${JSON.stringify(errMsg)}`);
    }
};

const uploadOrderPayload = async (pdfUrl, standardCsvContent, financialCsvContent) => {
    const token = process.env.DROPBOX_ACCESS_TOKEN;
    if (!token) throw new Error("Missing DROPBOX_ACCESS_TOKEN in .env");

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[new Date().getMonth()];
    const dateLabel = getFormattedDate(); // e.g. "17th March 2026"

    // Path: /ORDERS/March/17th March 2026 Order/
    const folderPath = `/ORDERS/${monthName}/${dateLabel} Order`;

    console.log(`[DROPBOX] Target folder: ${folderPath}`);

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
        console.log(`[DROPBOX] Downloading Label PDF from ${pdfUrl}...`);
        const pdfRes = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        await uploadFile(token, `${folderPath}/${dateLabel} Labels.pdf`, Buffer.from(pdfRes.data));
    }

    console.log(`[DROPBOX] ✅ All uploads complete to ${folderPath}`);
    return folderPath;
};

module.exports = { uploadOrderPayload };
