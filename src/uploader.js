const puppeteer = require('puppeteer');
require('dotenv').config();

const uploadToPortal = async (filePath) => {
    console.log('[PORTAL] Starting upload process...');

    if (!process.env.PORTAL_USERNAME || !process.env.PORTAL_PASSWORD) {
        throw new Error('Portal credentials not set in .env');
    }

    const browser = await puppeteer.launch({
        headless: true, // User requested background only
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    // Set viewport to avoid mobile layout issues
    await page.setViewport({ width: 1280, height: 800 });

    try {
        // 1. Go to Upload Page
        console.log('[PORTAL] Navigating to URL...');
        await page.goto(process.env.PORTAL_URL, { waitUntil: 'networkidle2' });

        // 2. Login Flow (if redirected)
        // Check for email input
        const emailInput = await page.$('input[name="username"]');
        if (emailInput) {
            // Login Flow
            console.log('[PORTAL] Login detected. Logging in...');

            await page.type('input[name="username"]', process.env.PORTAL_USERNAME);
            await page.type('input[type="password"]', process.env.PORTAL_PASSWORD);

            const submitBtn = await page.$('button[type="submit"]');
            if (submitBtn) {
                await submitBtn.click();
                console.log('[PORTAL] Clicked login...');

                try {
                    // Wait for the Upload page header instead of file input
                    await page.waitForSelector('h5', { timeout: 30000 });
                    console.log('[PORTAL] Login Successful.');
                } catch (e) {
                    console.error('[PORTAL] Login Timeout. Saving screenshot...');
                    await page.screenshot({ path: 'login_failed.png' });
                    throw new Error('Login failed - Screenshot saved to login_failed.png');
                }
            }
        } else {
            console.log('[PORTAL] Already logged in or no login form found.');
        }

        // 3. Enter Note
        console.log('[PORTAL] Entering note...');
        const NOTE_TEXT = "Kindly match the website mockup designs exactly and ensure perfect alignment";

        // Wait for textarea safely
        const noteSelector = 'textarea';
        try {
            await page.waitForSelector(noteSelector, { timeout: 10000 });
            await page.type(noteSelector, NOTE_TEXT);
        } catch (e) {
            console.warn('[PORTAL] Warning: Note input not found. Skipping note.');
        }

        // 4. Upload File
        console.log(`[PORTAL] Uploading file: ${filePath}`);

        // Strategy 1: Look for a standard file input
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            console.log('[PORTAL] Found standard file input. Uploading...');
            await fileInput.uploadFile(filePath);
        } else {
            // Strategy 2: Click the "Upload" text/area to trigger File Chooser
            console.log('[PORTAL] No file input found. Attempting to trigger file chooser...');

            // Find the specific text we saw in the error state
            const [trigger] = await page.$x("//p[contains(., 'Upload a single .csv')]");

            if (trigger) {
                console.log('[PORTAL] Found upload trigger text. Clicking...');
                const [fileChooser] = await Promise.all([
                    page.waitForFileChooser({ timeout: 10000 }),
                    trigger.click(),
                ]);
                console.log('[PORTAL] File chooser intercepted. Accepting...');
                await fileChooser.accept([filePath]);
            } else {
                throw new Error('Could not find file input or upload trigger text');
            }
        }

        // Wait for potential confirmation
        await new Promise(r => setTimeout(r, 5000));
        console.log('[PORTAL] Upload process finished (Validation needed).');

        // 5. Submit Order
        console.log('[PORTAL] Clicking Upload Order...');

        // DEBUG: Take screenshot before submit to verify state
        console.log('[PORTAL] Saving pre-submit screenshot...');
        await page.screenshot({ path: 'debug_pre_submit.png' });

        // Wait a small moment for file to be ready
        await new Promise(r => setTimeout(r, 2000));

        // Looking for the specific upload button
        // const [button] = await page.$x("//button[contains(., 'Upload Order')]"); --> Deprecated/Removed

        let button = await page.$('button[type="submit"]');
        if (!button) {
            // specific text search using evaluate if type=submit isn't enough, but it should be
            const buttons = await page.$$('button');
            for (const btn of buttons) {
                const text = await page.evaluate(el => el.textContent, btn);
                if (text.includes('Upload Order')) {
                    button = btn;
                    break;
                }
            }
        }

        if (button) {
            await button.click();
        } else {
            // Fallback
            throw new Error('Submit button not found');
        }

        console.log('[PORTAL] Upload submitted. Waiting for result...');

        // Wait for success/completion
        // Strategy: Wait for URL change OR Success Toast OR Error Message
        try {
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
                page.waitForSelector('.Toastify__toast--success', { timeout: 15000 }),
                // If it fails, maybe an error toast appears?
                page.waitForSelector('.Toastify__toast--error', { timeout: 15000 }).then(() => { throw new Error('Error toast detected'); })
            ]);
            console.log('[PORTAL] Navigation or Success Toast detected. Submission likely successful.');
        } catch (e) {
            console.warn('[PORTAL] No obvious success indicator within 15s.');
            // We don't throw yet, as sometimes it just takes time or redirects silently
        }

        // ALWAYS take post-submit screenshot to confirm state
        console.log('[PORTAL] Saving post-submit screenshot...');
        await page.screenshot({ path: 'debug_post_submit.png' });
        console.log(`[PORTAL] Final Page Title: ${await page.title()}`);
        console.log(`[PORTAL] Final URL: ${page.url()}`);

        console.log('[PORTAL] Process complete.');
        await browser.close();
        return true;

    } catch (error) {
        console.error('[PORTAL] Error:', error.message);
        try {
            const timestamp = Date.now();
            const screenshotPath = `error_state_${timestamp}.png`;
            const htmlPath = `error_state_${timestamp}.html`;

            await page.screenshot({ path: screenshotPath });
            const html = await page.content();
            require('fs').writeFileSync(htmlPath, html);

            console.log(`[PORTAL] Saved debug snapshot: ${screenshotPath} and ${htmlPath}`);
            console.log(`[PORTAL] Current URL: ${page.url()}`);
            console.log(`[PORTAL] Page Title: ${await page.title()}`);
        } catch (e) {
            console.error('[PORTAL] Failed to save debug info:', e.message);
        }
        throw error;
    } finally {
        if (browser) await browser.close();
    }
};

module.exports = { uploadToPortal };
