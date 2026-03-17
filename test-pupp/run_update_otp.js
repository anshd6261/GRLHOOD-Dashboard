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
            console.log("Starting Auto-Dimensions FAST...");

            // 1. Set to 100 per page if possible
            let select = document.querySelector('mat-select[aria-label="Items per page:"], .mat-paginator-page-size-select');
            if (select) {
                select.click();
                await new Promise(r => setTimeout(r, 500));
                let options = Array.from(document.querySelectorAll('mat-option, .mat-option, .mat-option-text'));
                let opt100 = options.find(o => o.innerText && o.innerText.includes('100'));
                if (opt100) {
                    opt100.click();
                    await new Promise(r => setTimeout(r, 4000)); // wait for table refresh
                } else {
                    document.body.click(); // close dropdown if 100 isn't found
                }
            }

            // 2. Fast Processing Iterate
            let updated = 0;
            let actionMenus = Array.from(document.querySelectorAll('button.mat-menu-trigger, i.icon-more_vert, .dropdown-toggle, .mat-icon-button, button[aria-label="More actions"]')).filter(el => el.getBoundingClientRect().width > 0);

            console.log(`Found ${actionMenus.length} action menus to process.`);

            for (let menu of actionMenus) {
                menu.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(r => setTimeout(r, 50));
                menu.click();

                let editOption = await new Promise(resolve => {
                    let attempt = 0; let interval = setInterval(() => {
                        let el = Array.from(document.querySelectorAll('.mat-menu-item, .dropdown-item, a, button, span')).find(e => e.innerText && (e.innerText.toLowerCase().includes('edit order') || e.innerText.toLowerCase().includes('edit details')));
                        if (el || attempt > 40) { clearInterval(interval); resolve(el); } attempt++;
                    }, 25);
                });

                if (editOption) {
                    editOption.click();
                    let inputs = await new Promise(resolve => {
                        let attempt = 0; let interval = setInterval(() => {
                            let length = document.querySelector('input[name="length"], input[formcontrolname="length"], input[placeholder*="Length"]');
                            let breadth = document.querySelector('input[name="breadth"], input[formcontrolname="breadth"], input[placeholder*="Width"]');
                            let height = document.querySelector('input[name="height"], input[formcontrolname="height"], input[placeholder*="Height"]');
                            let saveBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText && (el.innerText.toLowerCase().includes('update order') || el.innerText.toLowerCase().includes('save') || el.innerText.toLowerCase().includes('update')));
                            if ((length && breadth && height && saveBtn) || attempt > 80) { clearInterval(interval); resolve({ length, breadth, height, saveBtn }); } attempt++;
                        }, 25);
                    });

                    if (inputs && inputs.length && inputs.saveBtn && !inputs.saveBtn.disabled) {
                        let setNativeValue = (el, val) => {
                            let lastVal = el.value; el.focus(); el.value = val;
                            let ev = new Event('input', { bubbles: true }); ev.simulated = true;
                            if (el._valueTracker) el._valueTracker.setValue(lastVal);
                            el.dispatchEvent(ev); el.blur();
                        };

                        setNativeValue(inputs.length, '8'); setNativeValue(inputs.breadth, '5'); setNativeValue(inputs.height, '2');
                        inputs.saveBtn.click(); updated++;

                        await new Promise(resolve => {
                            let attempt = 0; let interval = setInterval(() => {
                                if (!document.body.contains(inputs.saveBtn) || attempt > 80) { clearInterval(interval); resolve(); } attempt++;
                            }, 25);
                        });
                    } else {
                        let closeBtn = document.querySelector('.close, .modal-close, button[aria-label="Close"]');
                        if (closeBtn) closeBtn.click(); document.body.click();
                    }
                } else { document.body.click(); }
                await new Promise(r => setTimeout(r, 50));
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
