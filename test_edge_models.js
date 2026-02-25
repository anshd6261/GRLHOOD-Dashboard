require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testBleedingEdge() {
    const key = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(key);

    const candidates = [
        "gemini-2.5-flash-lite",
        "models/gemini-2.5-flash-lite",
        "gemini-3-flash-preview"
    ];

    for (const name of candidates) {
        console.log(`\nTesting: ${name}...`);
        try {
            const model = genAI.getGenerativeModel({ model: name });
            const result = await model.generateContent("Hello");
            const response = await result.response;
            console.log(`✅ SUCCESS: ${name} works!`);
            return; // Stop on first success
        } catch (error) {
            console.log(`❌ FAILED: ${name} - ${error.message.split(':')[0]}`);
        }
    }
}

testBleedingEdge();
