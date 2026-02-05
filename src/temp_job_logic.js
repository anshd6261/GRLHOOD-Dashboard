async function processLabelGenerationJob(jobId) {
    jobQueue[jobId] = { status: 'STARTING', logs: [] };

    try {
        const history = getHistory();
        if (history.length === 0) {
            jobQueue[jobId] = { status: 'FAILED', error: 'No CSV history found.' };
            return;
        }

        const lastBatch = history[0]; // Most recent
        const ordersToProcess = lastBatch.rows;

        console.log(`[JOB ${jobId}] Processing Batch ${lastBatch.id} with ${ordersToProcess.length} orders...`);

        jobQueue[jobId].status = 'FETCHING_DETAILS';
        jobQueue[jobId].totalInfo = ordersToProcess.length;

        const safeOrders = []; // Full Shopify Objects
        const highRiskOrders = []; // Rows + Data
        const failedOrders = [];

        let processedCount = 0;

        // 1. Fetch & Filter Risk
        for (const row of ordersToProcess) {
            processedCount++;
            if (processedCount % 5 === 0) jobQueue[jobId].progress = `Reviewing Order ${processedCount}/${ordersToProcess.length}`;

            let orderId = row.orderId || row.id;
            if (!orderId && row.orderLink) orderId = row.orderLink.split('/').pop();

            if (!orderId) {
                failedOrders.push({ ...row, error: 'No ID found' });
                continue;
            }

            try {
                // Fetch full details to check risk
                const fullOrder = await getOrder(orderId);

                if (fullOrder.riskLevel === 'HIGH') {
                    console.log(`[RISK] Order ${orderId} is HIGH RISK. Skipping.`);
                    highRiskOrders.push({ ...row, riskLevel: 'HIGH', riskAnalysis: 'Shopify marked HIGH' });
                    continue;
                }

                safeOrders.push(fullOrder); // Use full object for further processing if needed
            } catch (e) {
                failedOrders.push({ ...row, error: 'Fetch Failed: ' + e.message });
            }
        }

        if (safeOrders.length === 0) {
            // Generate High Risk Report if needed
            let highRiskUrl = null;
            if (highRiskOrders.length > 0) {
                const csv = generateCSV(highRiskOrders, 18); // Use generic CSV gen
                const p = path.join(__dirname, '..', `HIGH_RISK_${jobId}.csv`);
                fs.writeFileSync(p, csv);
                highRiskUrl = `/download/HIGH_RISK_${jobId}.csv`;
            }

            jobQueue[jobId] = {
                status: 'COMPLETED', // Technically completed strict checks
                labelUrl: null,
                highRiskUrl,
                message: 'No safe orders to process.',
                highRiskCount: highRiskOrders.length
            };
            return;
        }

        // 2. Wallet Check
        jobQueue[jobId].status = 'CHECKING_WALLET';

        // Estimate Cost: ₹100 per order (Safe Estimate)
        const EST_COST_PER_ORDER = 120;
        const totalEstimatedCost = safeOrders.length * EST_COST_PER_ORDER;

        await shiprocket.authenticate();
        const walletBalance = await shiprocket.getWalletBalance();

        if (walletBalance !== null && walletBalance < totalEstimatedCost) {
            console.warn(`[WALLET] Insufficient Funds. Need ~₹${totalEstimatedCost}, Have ₹${walletBalance}`);
            jobQueue[jobId] = {
                status: 'REQUIRES_MONEY',
                estimatedCost: totalEstimatedCost,
                currentBalance: walletBalance,
                shortfall: totalEstimatedCost - walletBalance
            };
            return;
        }

        // 3. Process Safe Orders (Find -> Assign -> Label)
        jobQueue[jobId].status = 'PROCESSING_SHIPROCKET';
        const labelUrls = [];

        let procWithSR = 0;
        for (const order of safeOrders) {
            procWithSR++;
            if (procWithSR % 2 === 0) jobQueue[jobId].progress = `Generating Labels ${procWithSR}/${safeOrders.length}`;

            // A. Find in Shiprocket
            const shopifyId = order.id.split('/').pop();
            const search = await shiprocket.findOrderByShopifyId(shopifyId);

            if (!search.found) {
                console.warn(`[SR] Order ${shopifyId} not found in Shiprocket.`);
                failedOrders.push({ orderId: shopifyId, error: 'Not found in Shiprocket (Sync Issue)' });
                continue;
            }

            const shipmentId = search.shipment_id;

            // B. Assign Courier & Generate Label
            // Try to assign courier (if not already)? 
            // Usually "Assign AWB" is needed before label gen if using "External API" flow. 
            // If already assigned, re-assigning might be harmless or error.
            if (search.status_code !== 6 && search.status_code !== 7 && search.status_code !== 13 && search.status_code !== 42) { // 6=Shipped, 7=Delivered etc
                const assign = await shiprocket.assignCourier(shipmentId);
                if (!assign.success && assign.error !== "LOW_WALLET") {
                    // Maybe already assigned? continue to label
                    console.log(`[SR] Assign AWB warning for ${shopifyId}: ${assign.message || assign.error}`);
                }
            }

            // C. Generate Label
            const label = await shiprocket.generateLabel(shipmentId);
            if (label.success) {
                labelUrls.push(label.url);
            } else {
                failedOrders.push({ orderId: shopifyId, error: 'Label Gen Failed: ' + label.error });
            }
        }

        // 4. Finalize
        jobQueue[jobId].status = 'COMPLETED';
        // Merge Labels? For now, if multiple, return the last one or create a text file list?
        // Ideally we zip them or use a tool. 
        // Returning the FIRST one for now as a placeholder if single, or create a list file.
        // Or if Shiprocket returns a bulk URL (only if bulk ID used). This loop generates individual URLs.

        let finalLabelUrl = null;
        if (labelUrls.length > 0) {
            // Create a simple HTML page with links if multiple
            if (labelUrls.length > 1) {
                const links = labelUrls.map(u => `<a href="${u}" target="_blank">Label</a><br>`).join('');
                const html = `<html><body><h1>Labels</h1>${links}</body></html>`;
                const p = path.join(__dirname, '..', `LABELS_${jobId}.html`);
                fs.writeFileSync(p, html);
                finalLabelUrl = `/download/LABELS_${jobId}.html`;
            } else {
                finalLabelUrl = labelUrls[0];
            }
        }

        // Generate High Risk Report if exists
        let highRiskUrl = null;
        if (highRiskOrders.length > 0) {
            const csv = generateCSV(highRiskOrders, 18);
            const p = path.join(__dirname, '..', `HIGH_RISK_${jobId}.csv`);
            fs.writeFileSync(p, csv);
            highRiskUrl = `/download/HIGH_RISK_${jobId}.csv`;
        }

        jobQueue[jobId].labelUrl = finalLabelUrl;
        jobQueue[jobId].highRiskUrl = highRiskUrl;
        jobQueue[jobId].failedCount = failedOrders.length;
        jobQueue[jobId].successCount = labelUrls.length;

    } catch (e) {
        console.error(`[JOB ${jobId}] Critical Error:`, e);
        jobQueue[jobId] = { status: 'FAILED', error: e.message };
    }
}
