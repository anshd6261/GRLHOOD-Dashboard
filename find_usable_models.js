require('dotenv').config();
const axios = require('axios');

async function findUsableModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('No API Key');
        return;
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        console.log(`Fetching models from ${url}...`);
        const res = await axios.get(url);

        const models = res.data.models;
        console.log(`\nFound ${models.length} models total.`);

        const usable = models.filter(m =>
            m.supportedGenerationMethods &&
            m.supportedGenerationMethods.includes('generateContent')
        );

        console.log(`\n--- USABLE MODELS for generateContent ---`);
        usable.forEach(m => {
            console.log(`- ${m.name} (${m.displayName})`);
            console.log(`  Ver: ${m.version}`);
        });

        if (usable.length === 0) {
            console.log("\n⚠️ No models support generateContent!");
        }

    } catch (error) {
        console.error('Error fetching models:', error.response ? error.response.data : error.message);
    }
}

findUsableModels();
