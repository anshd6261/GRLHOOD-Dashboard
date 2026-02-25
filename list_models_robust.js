require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testModel(modelName) {
    console.log(`\nTesting Model: ${modelName}...`);
    try {
        const key = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hello");
        const response = await result.response;
        console.log(`✅ SUCCESS: ${modelName} works! Response: ${response.text().substring(0, 20)}...`);
        return true;
    } catch (error) {
        console.log(`❌ FAILED: ${modelName} - ${error.message.split(':')[0]}...`); // Log concise error
        return false;
    }
}

async function runTests() {
    console.log('Starting Robust Model Tests...');
    // Try latest first
    await testModel("gemini-1.5-flash");
    await testModel("gemini-1.5-pro");
    await testModel("gemini-1.0-pro");
    await testModel("gemini-pro");
}

runTests();
