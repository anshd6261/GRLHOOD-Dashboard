// Execute this inside the DevTools Console on the Shiprocket 'New Orders' page
// Make sure to set items per page to 100 before running.
return await new Promise(async (resolveMain) => {
    try {
        let updated = 0;
        let actionMenus = Array.from(document.querySelectorAll('button.mat-menu-trigger, i.icon-more_vert, .dropdown-toggle, .mat-icon-button, button[aria-label="More actions"]')).filter(el => el.getBoundingClientRect().width > 0);

        for (let menu of actionMenus) {
            menu.click();

            // Wait for dropdown
            let editOption = await new Promise(resolve => {
                let attempt = 0;
                let interval = setInterval(() => {
                    let el = Array.from(document.querySelectorAll('.mat-menu-item, .dropdown-item, a, button, span'))
                        .find(e => e.innerText && (e.innerText.toLowerCase().includes('edit order') || e.innerText.toLowerCase().includes('edit details')));
                    if (el || attempt > 80) { clearInterval(interval); resolve(el); }
                    attempt++;
                }, 25);
            });

            if (editOption) {
                editOption.click();

                // Wait for modal inputs
                let inputs = await new Promise(resolve => {
                    let attempt = 0;
                    let interval = setInterval(() => {
                        let length = document.querySelector('input[name="length"], input[formcontrolname="length"], input[placeholder*="Length"]');
                        let breadth = document.querySelector('input[name="breadth"], input[formcontrolname="breadth"], input[placeholder*="Width"]');
                        let height = document.querySelector('input[name="height"], input[formcontrolname="height"], input[placeholder*="Height"]');
                        let saveBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText && (el.innerText.toLowerCase().includes('update order') || el.innerText.toLowerCase().includes('save')));

                        if ((length && breadth && height && saveBtn) || attempt > 120) {
                            clearInterval(interval);
                            resolve({ length, breadth, height, saveBtn });
                        }
                        attempt++;
                    }, 25);
                });

                if (inputs && inputs.length && inputs.saveBtn && !inputs.saveBtn.disabled) {
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

                    setNativeValue(inputs.length, '8');
                    setNativeValue(inputs.breadth, '5');
                    setNativeValue(inputs.height, '2');

                    inputs.saveBtn.click();
                    updated++;

                    // Wait for save to complete and modal to close
                    await new Promise(resolve => {
                        let attempt = 0;
                        let interval = setInterval(() => {
                            let btnStillThere = document.body.contains(inputs.saveBtn);
                            if (!btnStillThere || attempt > 120) { clearInterval(interval); resolve(); }
                            attempt++;
                        }, 25);
                    });
                } else {
                    let closeBtn = document.querySelector('.close, .modal-close, button[aria-label="Close"]');
                    if (closeBtn) closeBtn.click();
                    document.body.click();
                }
            } else {
                document.body.click(); // Close menu
            }
        }
        resolveMain(`Done. Updated ${updated} orders successfully via DOM scripting in milliseconds.`);
    } catch (err) {
        resolveMain(`Failed: ${err.message}`);
    }
});
