/**
 * Run this script ONCE to get a Dropbox refresh token.
 * 
 * Step 1: Visit the URL printed below, authorize, and copy the code.
 * Step 2: Run: node get_dropbox_token.js YOUR_AUTH_CODE
 */

const axios = require('axios');

const APP_KEY = 'jydaezwtesftftw';
const APP_SECRET = 'kwozbjqxhnh4c36';

const authCode = process.argv[2];

if (!authCode) {
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${APP_KEY}&response_type=code&token_access_type=offline`;
    console.log('\n=== STEP 1: Visit this URL and authorize ===\n');
    console.log(authUrl);
    console.log('\n=== STEP 2: Copy the code and run ===\n');
    console.log(`node get_dropbox_token.js YOUR_AUTH_CODE\n`);
    process.exit(0);
}

(async () => {
    try {
        const res = await axios.post('https://api.dropboxapi.com/oauth2/token', null, {
            params: {
                code: authCode,
                grant_type: 'authorization_code',
                client_id: APP_KEY,
                client_secret: APP_SECRET
            }
        });

        console.log('\n✅ SUCCESS! Here are your tokens:\n');
        console.log('REFRESH TOKEN (permanent, save this):', res.data.refresh_token);
        console.log('ACCESS TOKEN (temporary):', res.data.access_token);
        console.log('\nAdd this to your .env and Vercel:');
        console.log(`DROPBOX_REFRESH_TOKEN=${res.data.refresh_token}`);
        console.log(`DROPBOX_APP_KEY=${APP_KEY}`);
        console.log(`DROPBOX_APP_SECRET=${APP_SECRET}`);
    } catch (e) {
        console.error('❌ Error:', e.response?.data || e.message);
    }
})();
