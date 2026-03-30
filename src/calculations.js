const { getDb } = require('./database');

const isDbAvailable = () => {
    try { getDb(); return true; } catch (e) { return false; }
};

const emptyMetrics = () => ({
    orders: 0, prepaid: 0, cod: 0, revenue: 0, cogs: 0, shipping: 0,
    rto: 0, gatewayFees: 0, grossProfit: 0, adSpend: 0, otherExpenses: 0,
    netProfit: 0, roas: 0, blendedMargin: 0
});

const calculateOrderMetrics = (orderId) => {
    if (!isDbAvailable()) return null;
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
    if (!order) return null;

    const items = db.prepare('SELECT SUM(cogs * quantity) as total_cogs FROM order_items WHERE order_id = ?').get(orderId);
    const shipment = db.prepare('SELECT forward_shipping_cost, return_shipping_cost, is_rto FROM shipments WHERE order_id = ?').get(orderId);
    const settlement = db.prepare('SELECT fees_deducted FROM settlements WHERE order_id = ?').get(orderId);

    const cogs = items ? (items.total_cogs || 0) : 0;

    let shippingCost = 0;
    let rtoCost = 0;
    if (shipment) {
        shippingCost = shipment.forward_shipping_cost || 0;
        rtoCost = shipment.return_shipping_cost || 0;
    }

    const gatewayFees = settlement ? (settlement.fees_deducted || 0) : 0;

    // Revenue is 0 if cancelled or RTO
    const isCancelledOrRto = order.order_status === 'cancelled' || order.order_status === 'rto';
    const revenue = isCancelledOrRto ? 0 : order.net_amount;

    // Refunds reduce revenue
    const finalRevenue = Math.max(0, revenue - (order.refund_amount || 0));

    // Profit = Revenue - COGS - Shipping - Returns - Gateway Fees
    const grossProfit = finalRevenue - cogs - shippingCost - rtoCost - gatewayFees;
    const margin = finalRevenue > 0 ? (grossProfit / finalRevenue) * 100 : 0;

    return {
        orderId,
        revenue: finalRevenue,
        cogs,
        shippingCost,
        rtoCost,
        gatewayFees,
        grossProfit,
        marginPercent: margin,
        status: order.order_status
    };
};

const getDailyPandL = (date) => {
    // date format: "YYYY-MM-DD"
    if (!isDbAvailable()) return { date, metrics: emptyMetrics() };
    const db = getDb();

    // 1. Get Orders created on this date
    const orders = db.prepare(`
        SELECT order_id, net_amount, refund_amount, order_status 
        FROM orders WHERE DATE(order_date) = ?
    `).all(date);

    let totalOrders = orders.length;
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalShipping = 0;
    let totalRtoCost = 0;
    let totalGatewayFees = 0;
    let prepaidCount = 0;
    let codCount = 0;

    for (const o of orders) {
        const metrics = calculateOrderMetrics(o.order_id);
        if (metrics) {
            totalRevenue += metrics.revenue;
            totalCogs += metrics.cogs;
            totalShipping += metrics.shippingCost;
            totalRtoCost += metrics.rtoCost;
            totalGatewayFees += metrics.gatewayFees;
        }

        const paymentCheck = db.prepare('SELECT payment_method FROM orders WHERE order_id = ?').get(o.order_id);
        if (paymentCheck) {
            if (paymentCheck.payment_method === 'Prepaid') prepaidCount++;
            else codCount++;
        }
    }

    // 2. Get Ad Spend for this date
    const ads = db.prepare('SELECT SUM(spend) as total_spend FROM ad_spend WHERE date = ?').get(date);
    const adSpend = ads ? (ads.total_spend || 0) : 0;

    // 3. Get Other Expenses for this date
    const expenses = db.prepare('SELECT SUM(amount) as total_expenses FROM expenses WHERE date = ?').get(date);
    const otherExpenses = expenses ? (expenses.total_expenses || 0) : 0;

    // 4. Calculate Net Profit
    const grossProfit = totalRevenue - totalCogs - totalShipping - totalRtoCost - totalGatewayFees;
    const netProfit = grossProfit - adSpend - otherExpenses;

    return {
        date,
        metrics: {
            orders: totalOrders,
            prepaid: prepaidCount,
            cod: codCount,
            revenue: totalRevenue,
            cogs: totalCogs,
            shipping: totalShipping,
            rto: totalRtoCost,
            gatewayFees: totalGatewayFees,
            grossProfit,
            adSpend,
            otherExpenses,
            netProfit,
            roas: adSpend > 0 ? (totalRevenue / adSpend) : 0,
            blendedMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
        }
    };
};

const getAggregatedPandL = (startDate, endDate) => {
    if (!isDbAvailable()) {
        return { period: { start: startDate, end: endDate }, totals: { ...emptyMetrics(), aov: 0 }, dailyBreakdown: [] };
    }
    const db = getDb();
    // This could be optimized massively in SQL, but doing it in JS for flexibility right now
    // as we rely on per-order complex logic (RTOs revoking revenue, etc.)

    const dates = db.prepare('SELECT DISTINCT DATE(order_date) as d FROM orders WHERE DATE(order_date) >= ? AND DATE(order_date) <= ? ORDER BY d ASC').all(startDate, endDate);

    const result = {
        period: { start: startDate, end: endDate },
        totals: {
            orders: 0, revenue: 0, cogs: 0, shipping: 0, rto: 0,
            gatewayFees: 0, grossProfit: 0, adSpend: 0, otherExpenses: 0, netProfit: 0
        },
        dailyBreakdown: []
    };

    for (const row of dates) {
        const daily = getDailyPandL(row.d);
        result.dailyBreakdown.push(daily);

        for (const key in result.totals) {
            result.totals[key] += daily.metrics[key] || 0;
        }
    }

    // Averages/Ratios
    result.totals.roas = result.totals.adSpend > 0 ? (result.totals.revenue / result.totals.adSpend) : 0;
    result.totals.blendedMargin = result.totals.revenue > 0 ? (result.totals.netProfit / result.totals.revenue) * 100 : 0;
    result.totals.aov = result.totals.orders > 0 ? (result.totals.revenue / result.totals.orders) : 0;

    return result;
};

// Cash position: Cash In (Settlements + Deposits) - Cash Out (Expenses + Withdrawals)
const getCashPosition = () => {
    if (!isDbAvailable()) {
        return { netCash: 0, settledAmount: 0, totalCashOut: 0, pendingCod: 0, pendingPrepaid: 0, totalPending: 0, rtoRiskValue: 0 };
    }
    const db = getDb();

    // Sum of all actual_settled_amount
    const settlements = db.prepare('SELECT SUM(actual_settled_amount) as total FROM settlements').get();
    const settledAmount = settlements ? (settlements.total || 0) : 0;

    // Sum of all generic bank deposits not tied to specific settlements
    const bankDeposits = db.prepare("SELECT SUM(deposit_amt) as total FROM bank_transactions WHERE category = 'Uncategorized Income'").get();
    const otherIncome = bankDeposits ? (bankDeposits.total || 0) : 0;

    // Sum of all bank withdrawals (ad spend, shipping prepay, structural expenses)
    const bankWithdrawals = db.prepare('SELECT SUM(withdrawal_amt) as total FROM bank_transactions').get();
    const totalCashOut = bankWithdrawals ? (bankWithdrawals.total || 0) : 0;

    const netCash = settledAmount + otherIncome - totalCashOut;

    // Pending Settlements (Orders marked as shipped/delivered but not in settlements table)
    const pendingCod = db.prepare(`
        SELECT COALESCE(SUM(net_amount), 0) as total FROM orders 
        WHERE payment_method = 'COD' AND order_status IN ('shipped', 'delivered')
        AND order_id NOT IN (SELECT order_id FROM settlements)
    `).get();

    const pendingPrepaid = db.prepare(`
        SELECT COALESCE(SUM(net_amount), 0) as total FROM orders 
        WHERE payment_method = 'Prepaid' AND order_status != 'cancelled'
        AND order_id NOT IN (SELECT order_id FROM settlements)
    `).get();

    // RTO Risk (Value of shipped COD orders that might return)
    const rtoRisk = db.prepare(`
        SELECT COALESCE(SUM(net_amount), 0) as total FROM orders 
        WHERE payment_method = 'COD' AND order_status = 'shipped'
    `).get();

    return {
        netCash,
        settledAmount,
        totalCashOut,
        pendingCod: pendingCod.total,
        pendingPrepaid: pendingPrepaid.total,
        totalPending: pendingCod.total + pendingPrepaid.total,
        rtoRiskValue: rtoRisk.total
    };
};

module.exports = {
    calculateOrderMetrics,
    getDailyPandL,
    getAggregatedPandL,
    getCashPosition
};
