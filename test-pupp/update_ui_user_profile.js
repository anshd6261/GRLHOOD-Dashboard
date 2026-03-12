const puppeteer = require('puppeteer-core');
const os = require('os');
const path = require('path');

const TARGET_URL = 'https://app.shiprocket.in/seller/orders/new?sku=&order_ids=&order_status=&channel_id=&payment_method=&pickup_address_id=&rto_status=&delivery_country=&quantity=&tags=&is_order_verified=&ship_weight=&previously_cancelled=&from=2026-Feb-09&to=2026-Mar-10';

(async () => {
    try {
        console.log("Launching your personal Chrome Profile...");
        
        const userDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
        
        const browser = await puppeteer.launch({ 
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            userDataDir: userDataDir,
            headless: false,
            defaultViewport: null,
            args: ['--start-maximized']
        });
        
        const page = await browser.newPage();
        
        console.log("Navigating to target orders page...");
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
        
        // Wait 10 seconds just case we need to let UI render completely
        await page.waitForTimeout(10000);
        
        console.log("Page looks loaded. Let's run the JS script on the page...");
        
        await page.evaluate(async () => {
            console.log("Starting 3-Dot Menu Auto-Dimensions Script...");
            let updated = 0;
            
            let actionMenus = document.querySelectorAll('button.mat-menu-trigger, i.icon-more_vert, .dropdown-toggle');
            console.log(`Found ${actionMenus.length} action menus on this page.`);
            
            for (let menu of actionMenus) {
                menu.click();
                await new Promise(r => setTimeout(r, 1000));
                
                let editOption = Array.from(document.querySelectorAll('.mat-menu-item, .dropdown-item, a, button')).find(el => 
                    el.innerHTML.toLowerCase().includes('edit order') || 
                    el.innerHTML.toLowerCase().includes('edit details')
                );
                
                if (editOption) {
                    editOption.click();
                    await new Promise(r => setTimeout(r, 3000));
                    
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
                            if(el._valueTracker) el._valueTracker.setValue(lastVal);
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
                            await new Promise(r => setTimeout(r, 3000));
                        }
                    } else {
                        let closeBtn = document.querySelector('.close, .modal-close');
                        if(closeBtn) closeBtn.click();
                    }
                } else {
                    document.body.click(); 
                }
                await new Promise(r => setTimeout(r, 1500));
            }
        });
        
        console.log("\nFinished updating dimensions!");
        await browser.close();
    } catch (e) {
        console.error("Critical error:", e);
    }
})();
