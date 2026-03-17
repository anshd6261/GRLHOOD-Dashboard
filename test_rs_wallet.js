require('dotenv').config();
const axios = require('axios');

const jwt = process.env.RAPIDSHYP_JWT;
const apiKey = process.env.RAPIDSHYP_API_KEY;

const sessionHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwt}`
};

const publicHeaders = {
    'Content-Type': 'application/json',
    'rapidshyp-token': apiKey
};

async function testEndpoints() {
    const endpointsToTest = [
        { method: 'GET', url: 'https://api.rapidshyp.com/rapidshyp/apis/v1/wallet/balance', headers: publicHeaders },
        { method: 'GET', url: 'https://api.rapidshyp.com/session/wallet/balance', headers: sessionHeaders },
        { method: 'POST', url: 'https://api.rapidshyp.com/session/wallet/balance', headers: sessionHeaders, data: {} },
        { method: 'GET', url: 'https://api.rapidshyp.com/session/user', headers: sessionHeaders },
        { method: 'GET', url: 'https://api.rapidshyp.com/session/wallet', headers: sessionHeaders },
    ];

    for (const ep of endpointsToTest) {
        console.log(`Testing ${ep.method} ${ep.url}...`);
        try {
            const res = await axios({
                method: ep.method,
                url: ep.url,
                headers: ep.headers,
                data: ep.data,
                validateStatus: false
            });
            console.log(`  -> Status: ${res.status}`);
            if (res.status === 200 || res.status === 201) {
                console.log(`  -> Data:`, JSON.stringify(res.data).substring(0, 200));
            }
        } catch (e) {
            console.log(`  -> Error:`, e.message);
        }
    }
}

testEndpoints();
