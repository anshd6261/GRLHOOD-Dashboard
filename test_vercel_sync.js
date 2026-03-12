const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Log network requests
    page.on('request', request => {
        if (request.url().includes('/api/')) {
            console.log('>> REQUEST:', request.method(), request.url());
        }
    });

    page.on('response', response => {
        if (response.url().includes('/api/')) {
            console.log('<< RESPONSE:', response.status(), response.url());
        }
    });

    page.on('requestfailed', request => {
        if (request.url().includes('/api/')) {
            console.log('!! FAILED:', request.url(), request.failure().errorText);
        }
    });

    try {
        await page.goto('https://grlhood101-r2ied15s8-anshd6261s-projects.vercel.app', { waitUntil: 'networkidle2' });
        console.log('Page loaded. Clicking Sync...');
        
        // Find the Sync button
        const buttons = await page.$$('button');
        let syncBtn;
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.includes('Sync Data')) {
                syncBtn = btn;
                break;
            }
        }
        
        if (syncBtn) {
            await syncBtn.click();
            await new Promise(r => setTimeout(r, 15000)); // wait for api response
        } else {
            console.log("Sync button not found");
            console.log(await page.content());
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
})();
