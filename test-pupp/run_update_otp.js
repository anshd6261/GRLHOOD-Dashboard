const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const TARGET_URL = 'https://app.shiprocket.in/seller/orders/new';

(async () => {
    try {
        console.log("Launching clean automated browser...");
        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--start-maximized', '--no-sandbox']
        });

        const page = await browser.newPage();

        console.log("Going to Shiprocket login page...");
        await page.goto('https://app.shiprocket.in/login', { waitUntil: 'networkidle2' });

        // We will try to type the phone number if we can find the input, otherwise user can do it
        try {
            await page.waitForSelector('input[name="email"], input[formcontrolname="email"], input[type="text"]', { timeout: 5000 });
            await page.type('input[name="email"], input[formcontrolname="email"], input[type="text"]', '6261633409');
            console.log("Typed phone number auto-magically.");
        } catch (e) {
            console.log("Could not auto-type phone number. Please enter it manually in the window.");
        }

        console.log("\n*** ACTION REQUIRED ***");
        console.log("Please complete the OTP login in the opened browser window.");
        console.log("Waiting up to 3 minutes for you to log in...\n");

        // Wait for user to login and navigate to dashboard
        await page.waitForFunction("window.location.href.includes('/dashboard') || window.location.href.includes('/seller')", { timeout: 180000 });
        console.log("Login detected! Navigating to New Orders...");

        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

        console.log("Waiting for action menus to render in the DOM...");
        await page.waitForFunction(() => {
            return document.querySelectorAll('button.mat-menu-trigger, i.icon-more_vert, .dropdown-toggle, .mat-icon-button, button[aria-label="More actions"]').length > 0;
        }, { timeout: 60000 });
        console.log("Action menus found! Starting automation...");

        const updatedCount = await page.evaluate(async () => {
            console.log("Starting Auto-Dimensions...");

            let updated = 0;

            let actionMenus = Array.from(document.querySelectorAll('button.mat-menu-trigger, i.icon-more_vert, .dropdown-toggle, .mat-icon-button, button[aria-label="More actions"]')).filter(el => el.getBoundingClientRect().width > 0);

            console.log(`Found ${actionMenus.length} action menus to process.`);

            for (let menu of actionMenus) {
                menu.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(r => setTimeout(r, 500));

                menu.click();
                await new Promise(r => setTimeout(r, 1500));

                let editOption = Array.from(document.querySelectorAll('.mat-menu-item, .dropdown-item, a, button, span')).find(el =>
                    el.innerText && (el.innerText.toLowerCase().includes('edit order') || el.innerText.toLowerCase().includes('edit details'))
                );

                if (editOption) {
                    editOption.click();
                    await new Promise(r => setTimeout(r, 4000));

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
                            await new Promise(r => setTimeout(r, 4000));
                        }
                    } else {
                        let closeBtn = document.querySelector('.close, .modal-close, button[aria-label="Close"]');
                        if (closeBtn) closeBtn.click();
                    }
                } else {
                    document.body.click();
                }
                await new Promise(r => setTimeout(r, 1500));
            }
            return updated;
        });

        console.log(`\n🎉 Finished! Updated ${updatedCount} orders successfully.`);
        await new Promise(r => setTimeout(r, 5000));
        await browser.close();

    } catch (e) {
        console.error("Error:", e.message);
        process.exit(1);
    }
})();
