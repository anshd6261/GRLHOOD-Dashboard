const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
require('dotenv').config({ path: '../.env' });

const EMAIL = process.env.SHIPROCKET_EMAIL;
const PASS = process.env.SHIPROCKET_PASSWORD;
const TARGET_URL = 'https://app.shiprocket.in/seller/orders/new?sku=&order_ids=&order_status=&channel_id=&payment_method=&pickup_address_id=&rto_status=&delivery_country=&quantity=&tags=&is_order_verified=&ship_weight=&previously_cancelled=&from=2026-Feb-09&to=2026-Mar-10';

(async () => {
    try {
        console.log("Launching browser...");
        const browser = await puppeteer.launch({
            headless: false, // Run headful so we can see what's happening
            defaultViewport: null,
            args: ['--start-maximized']
        });

        const page = await browser.newPage();

        console.log("Logging in...");
        await page.goto('https://app.shiprocket.in/login');

        // Wait for login fields
        await page.waitForSelector('input[name="email"]', { timeout: 10000 });
        await page.type('input[name="email"]', EMAIL);
        await page.type('input[name="password"]', PASS);
        await page.click('button[type="submit"]');

        // Wait for dashboard or target page to load
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => { });
        console.log("Logged in!");

        console.log("Navigating to target orders page...");
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

        await page.waitForSelector('table', { timeout: 15000 });
        console.log("Orders page loaded.");

        let hasNextPage = true;

        while (hasNextPage) {
            // Find all order rows
            // In Shiprocket, adding package dimensions usually has an "Add Package Details" or "Edit" pencil icon
            const orderRows = await page.$$('tr.sr-table__row');
            console.log(`Found ${orderRows.length} rows on this page.`);

            for (let i = 0; i < orderRows.length; i++) {
                // We re-select to avoid stale elements after DOM updates
                const rows = await page.$$('tr.sr-table__row');
                if (!rows[i]) continue;

                // Need to find the exact button to edit weight/dimensions
                // It might be a pencil icon next to "Add Weight & Dimensions"
                // Let's try to look for the button inside the row.
                // Usually it's `.icon-pencil` or a specifically named button
                try {
                    const addDimsBtn = await rows[i].$('[title="Add Package Details"], [title="Edit/Add dimensions"], .icon-pencil');
                    if (addDimsBtn) {
                        console.log(`Clicking to add dimensions for row ${i + 1}`);
                        await addDimsBtn.click();

                        // Wait for modal
                        await page.waitForSelector('input[name="length"], input[formcontrolname="length"]', { visible: true, timeout: 5000 });

                        // Clear and type
                        const lengthInput = await page.$('input[name="length"], input[formcontrolname="length"]');
                        const breadthInput = await page.$('input[name="breadth"], input[formcontrolname="breadth"]');
                        const heightInput = await page.$('input[name="height"], input[formcontrolname="height"]');
                        const weightInput = await page.$('input[name="weight"], input[formcontrolname="weight"]');

                        await lengthInput.click({ clickCount: 3 });
                        await lengthInput.type('8');

                        await breadthInput.click({ clickCount: 3 });
                        await breadthInput.type('5');

                        await heightInput.click({ clickCount: 3 });
                        await heightInput.type('2');

                        // Click save
                        const saveBtn = await page.$('button.save-btn, button[type="submit"]');
                        if (saveBtn) {
                            await saveBtn.click();
                            await page.waitForTimeout(1500); // wait for save
                            console.log(`Saved row ${i + 1}`);
                        }
                    } else {
                        console.log(`Row ${i + 1} already has dimensions or button not found.`);
                    }
                } catch (err) {
                    console.log(`Error on row ${i + 1}:`, err.message);
                }
            }

            // Try to go to next page
            const nextBtn = await page.$('li.next:not(.disabled) a, button.next-page:not([disabled])');
            if (nextBtn) {
                console.log("Going to next page...");
                await nextBtn.click();
                await page.waitForTimeout(3000); // wait for page load
            } else {
                hasNextPage = false;
                console.log("No more pages left.");
            }
        }

        console.log("Finished updating dimensions!");
        await browser.close();
    } catch (e) {
        console.error("Critical error:", e);
    }
})();
