const axios = require('axios');

const API_URL = 'http://localhost:3001/api/shiprocket';

const testLiveFlow = async () => {
    console.log('🚀 Triggering Live Label Generation Job...');

    try {
        // 1. Start Job
        const startRes = await axios.post(`${API_URL}/generate-labels`, {});
        const jobId = startRes.data.jobId;
        console.log(`✅ Job Started: ${jobId}`);

        // 2. Poll Status
        let complete = false;
        while (!complete) {
            await new Promise(r => setTimeout(r, 2000)); // Wait 2s

            const statusRes = await axios.get(`${API_URL}/job/${jobId}`);
            const job = statusRes.data;

            console.log(`[${job.status}] ${job.progress || ''}`);
            if (job.status === 'PROCESSING_SHIPROCKET') {
                // Print logs if interesting?
            }

            if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'REQUIRES_MONEY') {
                complete = true;
                console.log('\n--------------------------------');
                console.log('🏁 FINAL STATUS:', job.status);
                if (job.message) console.log('Message:', job.message);
                if (job.labelUrl) console.log('🔗 Label URL:', job.labelUrl);
                if (job.highRiskUrl) console.log('🔗 High Risk URL:', job.highRiskUrl);
                if (job.error) console.log('❌ Error:', job.error);
                console.log('--------------------------------\n');
            }
        }

    } catch (e) {
        console.error('❌ Test Failed:', e.message);
        if (e.response) console.error('Response:', e.response.data);
    }
};

testLiveFlow();
