const { Dropbox } = require('dropbox');
const fetch = require('isomorphic-fetch');
const axios = require('axios');
const { getFormattedDate } = require('./csv_generator');
require('dotenv').config();

const getDropboxClient = () => {
    const ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) throw new Error("Missing DROPBOX_ACCESS_TOKEN in .env");
    return new Dropbox({ accessToken: ACCESS_TOKEN, fetch });
};

const uploadFile = async (dbx, filePath, contents) => {
    console.log(`[DROPBOX] Attempting upload to: ${filePath} (${contents.length} bytes)`);
    try {
        const response = await dbx.filesUpload({
            path: filePath,
            contents: contents,
            mode: { '.tag': 'overwrite' }
        });
        console.log(`[DROPBOX] ✅ Successfully uploaded: ${filePath}`);
        return response.result;
    } catch (e) {
        const errMsg = e?.error?.error_summary || e?.message || JSON.stringify(e);
        console.error(`[DROPBOX] ❌ Failed to upload ${filePath}: ${errMsg}`);
        throw e;
    }
};

const uploadOrderPayload = async (pdfUrl, standardCsvContent, financialCsvContent) => {
    try {
        const dbx = getDropboxClient();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const monthName = monthNames[new Date().getMonth()];
        const dateLabel = getFormattedDate(); // e.g. "17th March 2026"

        // Path: /ORDERS/March/17th March 2026 Order/
        const folderPath = `/ORDERS/${monthName}/${dateLabel} Order`;

        console.log(`[DROPBOX] Target folder: ${folderPath}`);
        console.log(`[DROPBOX] Standard CSV: ${standardCsvContent ? standardCsvContent.length + ' bytes' : 'NONE'}`);
        console.log(`[DROPBOX] Financial CSV: ${financialCsvContent ? financialCsvContent.length + ' bytes' : 'NONE'}`);

        // Upload Standard Supplier CSV
        if (standardCsvContent) {
            const supplierPath = `${folderPath}/${dateLabel} Order.csv`;
            await uploadFile(dbx, supplierPath, Buffer.from(standardCsvContent, 'utf-8'));
        }

        // Upload Financial Report CSV
        if (financialCsvContent) {
            const financialPath = `${folderPath}/${dateLabel} Order - Financial report.csv`;
            await uploadFile(dbx, financialPath, Buffer.from(financialCsvContent, 'utf-8'));
        }

        // Upload PDF Labels (if provided)
        if (pdfUrl) {
            console.log(`[DROPBOX] Downloading Label PDF from ${pdfUrl}...`);
            const pdfRes = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
            const labelPath = `${folderPath}/${dateLabel} Labels.pdf`;
            await uploadFile(dbx, labelPath, Buffer.from(pdfRes.data, 'binary'));
        }

        console.log(`[DROPBOX] ✅ All uploads complete to ${folderPath}`);
        return folderPath;
    } catch (e) {
        console.error(`[DROPBOX] ❌ Upload sequence failed:`, e?.error?.error_summary || e.message);
        throw e;
    }
};

module.exports = { uploadOrderPayload };
