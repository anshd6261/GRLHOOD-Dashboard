const { authenticate } = require('./src/shiprocket');
require('dotenv').config();

(async () => {
    console.log("Starting 10 parallel login requests...");
    const promises = Array.from({length: 10}, () => authenticate());
    
    try {
        const tokens = await Promise.all(promises);
        console.log("Success! Extracted 10 tokens. Were they identical?", tokens.every(val => val === tokens[0]));
    } catch(e) {
        console.error("FAIL:", e);
    }
})();
