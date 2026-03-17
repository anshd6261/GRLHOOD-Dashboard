const { Dropbox } = require('dropbox');
const fetch = require('isomorphic-fetch');
const axios = require('axios');
require('dotenv').config();

const getDropboxClient = () => {
    const ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) throw new Error("Missing DROPBOX_ACCESS_TOKEN in .env");
    return new Dropbox({ accessToken: ACCESS_TOKEN, fetch });
};

const uploadFile = async (dbx, path, contents) => {
    try {
        const response = await dbx.filesUpload({
            path: path,
            contents: contents,
            mode: { '.tag': 'overwrite' }
        });
        return response.result;
    } catch (e) {
        console.error(`[DROPBOX] Failed to upload ${path}:`, e?.error?.error_summary || e.message || e);
        throw e;
    }
};

const uploadOrderPayload = async (pdfUrl, standardCsvContent, financialCsvContent) => {
    try {
        const dbx = getDropboxClient();
        const date = new Date();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const monthName = monthNames[date.getMonth()];
        const dateStr = date.toISOString().split('T')[0];

        const basePath = `/Orders/${monthName}/${dateStr}`;

        console.log(`[DROPBOX] Uploading artifacts to ${basePath}...`);

        let pdfBuffer = null;
        if (pdfUrl) {
            console.log(`[DROPBOX] Downloading Label PDF from ${pdfUrl}...`);
            const pdfRes = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
            pdfBuffer = pdfRes.data;
        }

        const uploads = [];
        if (standardCsvContent) {
            uploads.push(uploadFile(dbx, `${basePath}/${dateStr}_Order.csv`, Buffer.from(standardCsvContent, 'utf-8')));
        }
        if (financialCsvContent) {
            uploads.push(uploadFile(dbx, `${basePath}/${dateStr}_Order_Financial_Report.csv`, Buffer.from(financialCsvContent, 'utf-8')));
        }
        if (pdfBuffer) {
            uploads.push(uploadFile(dbx, `${basePath}/${dateStr}_Labels.pdf`, Buffer.from(pdfBuffer, 'binary')));
        }

        if (uploads.length > 0) {
            await Promise.all(uploads);
            console.log(`[DROPBOX] Successfully uploaded ${uploads.length} files to ${basePath}`);
        } else {
            console.log(`[DROPBOX] No files to upload.`);
        }
        
        return basePath;
    } catch (e) {
        console.error(`[DROPBOX] Upload sequence failed:`, e.message);
        throw e;
    }
};

module.exports = { uploadOrderPayload };
