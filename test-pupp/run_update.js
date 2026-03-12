const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
require('dotenv').config({ path: '../.env' });

const EMAIL = process.env.SHIPROCKET_EMAIL;
const PASS = process.env.SHIPROCKET_PASSWORD;
const TARGET_URL = 'https://app.shiprocket.in/seller/orders/new?sku=&order_ids=&order_status=&channel_id=&payment_method=&pickup_address_id=&rto_status=&delivery_country=&quantity=&tags=&is_order_verified=&ship_weight=&previously_cancelled=&from=2026-Feb-09&to=2026-Mar-10';

(async () => {
    try {
        console.log("Launching standalone automated browser...");
        const browser = await puppeteer.launch({
            headless: false, // Setting to false so you can watch it happen
            defaultViewport: null,
            args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        console.log("Logging into Shiprocket as " + EMAIL + "...");
        await page.goto('https://app.shiprocket.in/login', { waitUntil: 'networkidle2' });

        // Wait for and fill email
        await page.waitForSelector('input[name="email"], input[type="email"], input[formcontrolname="email"]', { timeout: 15000 });
        await page.type('input[name="email"], input[type="email"], input[formcontrolname="email"]', EMAIL);

        // Wait for and fill password
        await page.type('input[name="password"], input[type="password"], input[formcontrolname="password"]', PASS);

        // Click login
        const loginBtn = await page.$('button[type="submit"]');
        if (loginBtn) {
            await loginBtn.click();
            console.log("Clicked login.");
        } else {
            // some forms use a generic button
            await page.keyboard.press('Enter');
            console.log("Pressed Enter for login.");
        }

        console.log("Waiting for dashboard to load...");
        // Wait for navigation and typical dashboard elements
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log("Navigation timeout, proceeding anyway..."));

        console.log("Navigating directly to target orders page...");
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

        // Wait for the specific order table rows
        console.log("Waiting for orders table to load...");
        await page.waitForSelector('.sr-table__row, tbody tr', { timeout: 20000 });
        console.log("Orders page fully loaded. Running dimension update script directly in page...");

        const updatedCount = await page.evaluate(async () => {
            console.log("Starting Auto-Dimensions Script...");
            let updated = 0;

            let actionMenus = document.querySelectorAll('button.mat-menu-trigger, i.icon-more_vert, .dropdown-toggle, .mat-icon-button');

            for (let menu of actionMenus) {
                // Click the 3-dot menu
                menu.click();
                await new Promise(r => setTimeout(r, 800));

                // Click "Edit order details"
                let editOption = Array.from(document.querySelectorAll('.mat-menu-item, .dropdown-item, a, button, span')).find(el =>
                    el.innerHTML.toLowerCase().includes('edit order') ||
                    el.innerHTML.toLowerCase().includes('edit details')
                );

                if (editOption) {
                    editOption.click();
                    await new Promise(r => setTimeout(r, 4000)); // Wait for modal/page to load

                    // Find and fill dimensions
                    let length = document.querySelector('input[name="length"], input[formcontrolname="length"], input[placeholder*="Length"]');
                    let breadth = document.querySelector('input[name="breadth"], input[formcontrolname="breadth"], input[placeholder*="Width"]');
                    let height = document.querySelector('input[name="height"], input[formcontrolname="height"], input[placeholder*="Height"]');

                    if (length && breadth && height) {
                        let setNativeValue = (el, val) => {
                            let lastVal = el.value;
                            el.focus();
                            el.value = val;
                            let ev = new Event('input', { bubbles: true });
                            ev.simulated = true;
                            if (el._valueTracker) el._valueTracker.setValue(lastVal);
                            el.dispatchEvent(ev);
                            el.blur();
                        };

                        setNativeValue(length, '8');
                        setNativeValue(breadth, '5');
                        setNativeValue(height, '2');

                        await new Promise(r => setTimeout(r, 1000));

                        let updateBtn = Array.from(document.querySelectorAll('button')).find(el =>
                            el.innerHTML.toLowerCase().includes('update order') ||
                            el.innerHTML.toLowerCase().includes('save')
                        );

                        if (updateBtn) {
                            updateBtn.click();
                            updated++;
                            await new Promise(r => setTimeout(r, 4000)); // wait for save
                        }
                    } else {
                        // Close modal
                        let closeBtn = document.querySelector('.close, .modal-close, button[aria-label="Close"]');
                        if (closeBtn) closeBtn.click();
                    }
                } else {
                    document.body.click(); // close menu
                }

                await new Promise(r => setTimeout(r, 1500));
            }
            return updated;
        });

        console.log(`\n🎉 Finished processing! Updated ${updatedCount} orders successfully.`);

        // Wait a few seconds so you can see the result
        await new Promise(r => setTimeout(r, 5000));
        await browser.close();

    } catch (e) {
        console.error("Critical error in automation:", e);
        process.exit(1);
    }
})();
