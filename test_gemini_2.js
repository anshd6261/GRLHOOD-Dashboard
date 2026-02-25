require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testSingleModel() {
    const modelName = "gemini-2.0-flash-exp";
    console.log(`Testing Model: ${modelName}...`);
    try {
        const key = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hello");
        const response = await result.response;
        console.log(`✅ SUCCESS: ${modelName} works! Response: ${response.text().substring(0, 50)}...`);
    } catch (error) {
        console.log(`❌ FAILED: ${modelName} - ${error.message}`);
    }
}

testSingleModel();
