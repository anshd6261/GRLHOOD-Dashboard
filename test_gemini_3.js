require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini3Pro() {
    const modelName = "gemini-3-pro-preview";
    console.log(`Testing Model: ${modelName}...`);
    try {
        const key = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hello, are you Gemini 3 Pro?");
        const response = await result.response;
        console.log(`✅ SUCCESS: ${modelName} works! Response: ${response.text()}`);
    } catch (error) {
        console.log(`❌ FAILED: ${modelName} - ${error.message}`);
    }
}

testGemini3Pro();
