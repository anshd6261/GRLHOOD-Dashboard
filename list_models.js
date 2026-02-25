require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
    console.log('Listing available models for the provided API key...');
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('Error: GEMINI_API_KEY is missing in .env');
        return;
    }

    try {
        const genAI = new GoogleGenerativeAI(key);
        // We can't directly list models with this SDK easily in all versions, 
        // but let's try a standard model that DEFINITELY exists for free tier: "gemini-pro"
        // If that fails, the key is invalid or has no access.

        console.log("Attempting fallback to 'gemini-pro' (legacy)...");
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Test");
        console.log("Success with 'gemini-pro'!");

        console.log("Attempting 'gemini-2.0-flash-exp'...");
        const model3 = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        const result3 = await model3.generateContent("Test");
        console.log("Success with 'gemini-2.0-flash-exp'!");

    } catch (error) {
        console.error('Model List/Test Error:', error.message);
    }
}

listModels();
