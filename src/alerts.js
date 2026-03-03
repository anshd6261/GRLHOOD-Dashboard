const { getDb } = require('./database');

const checkSettlementDelays = (daysThreshold = 4) => {
    const db = getDb();
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);
    const sqlDate = thresholdDate.toISOString().split('T')[0];

    // Find Prepaid orders that were created > X days ago but have no settlement record
    const delayed = db.prepare(`
        SELECT order_id, customer_name, gross_amount, net_amount, DATE(order_date) as order_dt
        FROM orders
        WHERE payment_method = 'Prepaid' 
        AND order_status != 'cancelled'
        AND DATE(order_date) <= ?
        AND order_id NOT IN (SELECT order_id FROM settlements)
        ORDER BY order_date ASC
    `).all(sqlDate);

    return delayed.map(d => ({
        type: 'settlement_delay',
        orderId: d.order_id,
        customer: d.customer_name,
        amount: d.net_amount,
        daysPending: Math.floor((new Date() - new Date(d.order_dt)) / (1000 * 60 * 60 * 24)),
        description: `Prepaid order pending settlement for >${daysThreshold} days`
    }));
};

const checkRtoRisk = () => {
    const db = getDb();

    // Find COD orders that have been shipped but not delivered for > 7 days
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 7);
    const sqlDate = thresholdDate.toISOString().split('T')[0];

    const riskyOrders = db.prepare(`
        SELECT o.order_id, o.customer_name, o.net_amount, s.shipped_date, s.courier_name
        FROM orders o
        JOIN shipments s ON o.order_id = s.order_id
        WHERE o.payment_method = 'COD'
        AND o.order_status = 'shipped'
        AND DATE(s.shipped_date) <= ?
    `).all(sqlDate);

    return riskyOrders.map(r => ({
        type: 'rto_risk',
        orderId: r.order_id,
        customer: r.customer_name,
        amount: r.net_amount,
        courier: r.courier_name,
        daysShipped: Math.floor((new Date() - new Date(r.shipped_date.split('T')[0])) / (1000 * 60 * 60 * 24)),
        description: `COD order shipped >7 days ago, not marked delivered`
    }));
};

const checkHighAdSpendRoas = (minRoasThreshold = 1.0) => {
    const db = getDb();

    // Check the last 3 days of ad spend
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 3);
    const sqlDate = thresholdDate.toISOString().split('T')[0];

    const spendRows = db.prepare(`
        SELECT date, campaign_name, spend, roas 
        FROM ad_spend 
        WHERE spend > 0 AND DATE(date) >= ?
    `).all(sqlDate);

    const alerts = [];
    for (const row of spendRows) {
        if (row.roas < minRoasThreshold) {
            alerts.push({
                type: 'low_roas',
                campaign: row.campaign_name,
                spend: row.spend,
                roas: row.roas.toFixed(2),
                date: row.date,
                description: `Campaign ROAS is ${row.roas.toFixed(2)}, below the minimum ${minRoasThreshold} threshold on ${row.date}`
            });
        }
    }
    return alerts;
};

const getAllAlerts = () => {
    const settlementAlerts = checkSettlementDelays();
    const rtoAlerts = checkRtoRisk();

    // We only trigger ad spend alerts if there is actual spend data
    let adSpendAlerts = [];
    try {
        adSpendAlerts = checkHighAdSpendRoas();
    } catch (e) {
        // Silent catch if ad spend table is empty/missing
    }

    return [
        ...settlementAlerts,
        ...rtoAlerts,
        ...adSpendAlerts
    ];
};

module.exports = {
    checkSettlementDelays,
    checkRtoRisk,
    checkHighAdSpendRoas,
    getAllAlerts
};
