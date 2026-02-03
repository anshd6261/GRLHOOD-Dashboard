const axios = require('axios');

const email = 'Cloutcases.in@gmail.com';
const password = 'OWpfoV@DNS23LXVdpG%DgUqsO!$Pr0ki';

async function test() {
    try {
        console.log('Authenticating...');
        const login = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', { email, password });
        console.log('Login Response Keys:', Object.keys(login.data));
        console.log('Login Data:', JSON.stringify(login.data, null, 2));
        const token = login.data.token;
        console.log('Token obtained.');

        const headers = { 'Authorization': `Bearer ${token}` };

        console.log('Fetching Account Details...');
        try {
            const res = await axios.get('https://apiv2.shiprocket.in/v1/external/account/details', { headers });
            console.log('Response /account/details:', JSON.stringify(res.data, null, 2));
        } catch (e) {
            console.log('Error /account/details:', e.response?.status, e.response?.data);
        }

        console.log('Fetching Users...');
        try {
            const res = await axios.get('https://apiv2.shiprocket.in/v1/external/users', { headers });
            console.log('Response /users:', JSON.stringify(res.data, null, 2));
        } catch (e) {
            console.log('Error /users:', e.response?.status, e.response?.data);
        }

    } catch (e) {
        console.error('Auth Error:', e.response?.data || e.message);
    }
}

test();
