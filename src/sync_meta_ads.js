const axios = require('axios');
const { getDb } = require('./database');
require('dotenv').config();

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID; // e.g. act_123456789
const API_VERSION = 'v18.0';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const syncAdSpend = async (daysBack = 30) => {
    console.log(`[Meta Ads Sync] Fetching ad spend for the last ${daysBack} days...`);

    if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
        console.warn('[Meta Ads Sync] Credentials not found in .env. Skipping.');
        return { processed: 0, error: 'Missing credentials' };
    }

    const db = getDb();

    // Calculate Dates
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const timeRange = {
        since: startDate.toISOString().split('T')[0],
        until: endDate.toISOString().split('T')[0]
    };

    let processedCount = 0;

    const upsertAdSpend = db.prepare(`
        INSERT INTO ad_spend (
            date, platform, campaign_name, adset_name, spend, impressions, clicks,
            purchases, purchase_value, ctr, cpc, roas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, campaign_name) DO UPDATE SET
            spend=excluded.spend,
            impressions=excluded.impressions,
            clicks=excluded.clicks,
            purchases=excluded.purchases,
            purchase_value=excluded.purchase_value,
            ctr=excluded.ctr,
            cpc=excluded.cpc,
            roas=excluded.roas
    `);

    // Note: SQLite doesn't natively support multi-column unique constraints without defining them in the CREATE TABLE.
    // We should ensure the DB schema is updated or handle it manually. For now, since date/campaign aren't a UNIQUE constraint in Stage 1,
    // we'll run a custom upsert logic here.
    const checkExists = db.prepare('SELECT id FROM ad_spend WHERE date = ? AND platform = ? AND campaign_name = ?');
    const updateAdSpend = db.prepare(`
        UPDATE ad_spend SET 
            spend=?, impressions=?, clicks=?, purchases=?, purchase_value=?, ctr=?, cpc=?, roas=?
        WHERE id = ?
    `);

    try {
        let url = `https://graph.facebook.com/${API_VERSION}/${META_AD_ACCOUNT_ID}/insights`;
        let hasNext = true;

        while (hasNext) {
            const response = await axios.get(url, {
                params: {
                    access_token: META_ACCESS_TOKEN,
                    fields: 'campaign_name,adset_name,spend,impressions,clicks,actions,action_values',
                    level: 'campaign', // Get data at campaign level
                    time_increment: 1, // Daily breakdown
                    time_range: JSON.stringify(timeRange)
                }
            });

            const data = response.data.data;
            if (!data || data.length === 0) break;

            db.transaction(() => {
                for (const row of data) {
                    const date = row.date_start; // "YYYY-MM-DD"
                    const campaignName = row.campaign_name || 'Unknown';
                    const adsetName = row.adset_name || 'Unknown';

                    const spend = parseFloat(row.spend || 0);
                    const impressions = parseInt(row.impressions || 0);
                    const clicks = parseInt(row.clicks || 0);

                    // Parse Actions for Purchases
                    let purchases = 0;
                    if (row.actions) {
                        const purchaseAction = row.actions.find(a => a.action_type === 'purchase');
                        if (purchaseAction) purchases = parseInt(purchaseAction.value || 0);
                    }

                    // Parse Action Values for Purchase Value
                    let purchaseValue = 0;
                    if (row.action_values) {
                        const purchaseValueObj = row.action_values.find(a => a.action_type === 'purchase');
                        if (purchaseValueObj) purchaseValue = parseFloat(purchaseValueObj.value || 0);
                    }

                    // Derived Metrics
                    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
                    const cpc = clicks > 0 ? spend / clicks : 0;
                    const roas = spend > 0 ? purchaseValue / spend : 0;

                    const existing = checkExists.get(date, 'Meta', campaignName);

                    if (existing) {
                        updateAdSpend.run(
                            spend, impressions, clicks, purchases, purchaseValue, ctr, cpc, roas,
                            existing.id
                        );
                    } else {
                        upsertAdSpend.run(
                            date, 'Meta', campaignName, adsetName, spend, impressions, clicks,
                            purchases, purchaseValue, ctr, cpc, roas
                        );
                    }
                    processedCount++;
                }
            })();

            // Pagination Handling
            if (response.data.paging && response.data.paging.next) {
                url = response.data.paging.next;
                await sleep(1000); // Rate limit protection
            } else {
                hasNext = false;
            }
        }

        console.log(`[Meta Ads Sync] Complete. Processed ${processedCount} daily records.`);
        return { processed: processedCount };

    } catch (error) {
        console.error('[Meta Ads Sync] Error:', error.response?.data || error.message);
        return { processed: processedCount, error: error.message };
    }
};

const syncTodayAdSpend = () => {
    return syncAdSpend(1);
};

const getAdSpendByDate = (date) => { // format: "YYYY-MM-DD"
    const db = getDb();
    return db.prepare('SELECT * FROM ad_spend WHERE date = ?').all(date);
};

if (require.main === module) {
    (async () => {
        await syncAdSpend(7);
        const db = getDb();
        const sample = db.prepare('SELECT * FROM ad_spend LIMIT 1').get();
        console.log('\n[TEST] Sample Ad Spend:', sample || 'No data found (check credentials)');
    })();
}

module.exports = {
    syncAdSpend,
    syncTodayAdSpend,
    getAdSpendByDate
};
