const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PROXY_SECRET = process.env.PROXY_SECRET || '';

app.post('/proxy', async (req, res) => {
    if (PROXY_SECRET && req.headers['x-proxy-secret'] !== PROXY_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { url, method, headers, body } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
        const response = await axios({
            method: method || 'POST',
            url,
            headers: headers || {},
            data: body,
            timeout: 60000,
        });
        res.status(response.status).json(response.data);
    } catch (e) {
        const status = e.response?.status || 502;
        res.status(status).json(e.response?.data || { error: e.message });
    }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`[PROXY] Static IP proxy on :${PORT}`));
