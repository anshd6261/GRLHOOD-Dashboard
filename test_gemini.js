require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
    console.log('Testing Gemini API...');
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('Error: GEMINI_API_KEY is missing in .env');
        return;
    }
    console.log(`Key found: ${key.substring(0, 5)}...`);

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello, are you working?");
        const response = await result.response;
        console.log('Success! Response:', response.text());
    } catch (error) {
        console.error('Gemini API Error:', error.message);
    }
}

testGemini();
