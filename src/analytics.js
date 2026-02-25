const fs = require('fs');
const path = require('path');
const { getOrdersByDateRange } = require('./shopify');
const shiprocket = require('./shiprocket');

const AD_SPEND_FILE = path.join(__dirname, '../data/ad_spend.json');

// --- Helper: Ad Spend ---
const getAdSpend = () => {
    try {
        if (!fs.existsSync(AD_SPEND_FILE)) return [];
        return JSON.parse(fs.readFileSync(AD_SPEND_FILE, 'utf-8'));
    } catch (e) { return []; }
};

const saveAdSpend = (entry) => {
    const data = getAdSpend();
    data.push(entry); // { date: "2024-02-11", amount: 500, platform: "Facebook" }
    fs.writeFileSync(AD_SPEND_FILE, JSON.stringify(data, null, 2));
    return data;
};

// --- Core Analytics Logic ---
const generateAnalytics = async (days = 30) => {
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - days);

    const startIso = startDate.toISOString();
    const endIso = today.toISOString();

    const srStartDate = startIso.split('T')[0] + ' 00:00:00';
    const srEndDate = endIso.split('T')[0] + ' 23:59:59';

    console.log(`[ANALYTICS] Generating for last ${days} days...`);

    // 1. Fetch Real Data in Parallel
    const [shopifyOrders, shiprocketShipments, adSpendData] = await Promise.all([
        getOrdersByDateRange(startIso, endIso),
        shiprocket.getAllShipments(srStartDate.split(' ')[0], srEndDate.split(' ')[0]),
        Promise.resolve(getAdSpend())
    ]);

    // 2. Prepare Maps
    // Ad Spend Map
    const adSpendMap = {};
    adSpendData.forEach(entry => {
        if (entry.date) adSpendMap[entry.date] = (adSpendMap[entry.date] || 0) + parseFloat(entry.amount || 0);
    });

    // Shiprocket Map (Key: Order ID / Channel Order ID)
    const srMap = {};
    shiprocketShipments.forEach(s => {
        if (s.channel_order_id) srMap[s.channel_order_id.toString()] = s;
        if (s.channel_order_id) srMap[`#${s.channel_order_id.toString()}`] = s;
    });

    // 3. Process Orders
    const detailedOrders = [];
    const dailyOrderCounts = {};

    // Count for Ad Spend
    shopifyOrders.forEach(o => {
        const date = o.createdAt.split('T')[0];
        dailyOrderCounts[date] = (dailyOrderCounts[date] || 0) + 1;
    });

    let totalRevenue = 0;
    let totalShippingCost = 0;
    let totalCOGS = 0;
    let totalAdSpend = 0;
    let rtoLoss = 0;
    let rtoCount = 0;
    let deliveredCount = 0;

    for (const order of shopifyOrders) {
        const orderId = order.name; // "#1001"
        const orderDate = order.createdAt.split('T')[0];
        const srData = srMap[orderId] || srMap[order.id.toString()] || srMap[order.name.replace('#', '')];

        // Revenue (Real from Shopify - Shop Money)
        const revenue = parseFloat(order.totalPriceSet?.shopMoney?.amount || 0);

        // COGS
        let orderCogs = 0;
        order.lineItems.edges.forEach(edge => {
            const item = edge.node;
            const quantity = item.quantity;
            const unitCost = parseFloat(item.variant?.inventoryItem?.unitCost?.amount || 0);
            if (unitCost > 0) {
                orderCogs += (unitCost * quantity);
            } else {
                orderCogs += (parseFloat(item.originalUnitPrice || 0) * quantity * 0.3);
            }
        });

        // Shipping Cost (Real from Shiprocket)
        const shippingCost = srData ? parseFloat(srData.freight_charges || 0) : 0;

        // Status & RTO
        const status = srData ? srData.status : (order.displayFulfillmentStatus || 'UNFULFILLED');
        const isRto = status.toLowerCase().includes('rto') || status.toLowerCase().includes('return');
        const isDelivered = status.toLowerCase().includes('delivered');

        // Ad Spend Attribution
        let attributedAdSpend = 0;
        if (dailyOrderCounts[orderDate] && adSpendMap[orderDate]) {
            attributedAdSpend = adSpendMap[orderDate] / dailyOrderCounts[orderDate];
        }

        // Calculations
        let netProfit = 0;
        let rowRtoLoss = 0;
        let effectiveRevenue = revenue;

        if (isRto) {
            rtoCount++;
            rowRtoLoss = (shippingCost * 2) + attributedAdSpend;
            rtoLoss += rowRtoLoss;
            netProfit = -rowRtoLoss;
            effectiveRevenue = 0; // Don't count revenue for RTO
        } else {
            if (isDelivered) deliveredCount++;
            totalRevenue += revenue;
            totalCOGS += orderCogs;
            netProfit = revenue - (orderCogs + shippingCost + attributedAdSpend);
        }

        totalShippingCost += shippingCost;
        if (!isRto) totalAdSpend += attributedAdSpend;

        detailedOrders.push({
            orderId: orderId,
            date: orderDate,
            customer: order.shippingAddress?.name || 'Unknown',
            status: status.toUpperCase(),
            revenue: effectiveRevenue,
            cogs: isRto ? 0 : orderCogs,
            shipping: shippingCost,
            adSpend: attributedAdSpend,
            netProfit: netProfit,
            isRto: isRto
        });
    }

    // Recalculate Total Ad Spend
    const relevantAdSpend = adSpendData.filter(a => new Date(a.date) >= startDate).reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);

    const totalExpenses = totalCOGS + totalShippingCost + relevantAdSpend + rtoLoss;
    const finalNetProfit = totalRevenue - totalExpenses;

    // Metrics
    const totalOrders = shopifyOrders.length;
    const aov = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(0) : 0;
    const cac = totalOrders > 0 ? (relevantAdSpend / totalOrders).toFixed(0) : 0;
    const roas = relevantAdSpend > 0 ? (totalRevenue / relevantAdSpend).toFixed(2) : 0;

    return {
        overview: {
            revenue: totalRevenue,
            netProfit: finalNetProfit,
            netMargin: totalRevenue ? ((finalNetProfit / totalRevenue) * 100).toFixed(2) : 0,
            orders: totalOrders,
            rtoRate: totalOrders ? ((rtoCount / totalOrders) * 100).toFixed(2) : 0,
            totalAdSpend: relevantAdSpend,
            aov,
            cac,
            roas
        },
        costs: {
            cogs: totalCOGS,
            shipping: totalShippingCost,
            adSpend: relevantAdSpend,
            rtoLoss: rtoLoss,
            total: totalExpenses
        },
        orders: detailedOrders,
        breakdown_charts: {
            costDistribution: [
                { name: 'COGS', value: totalCOGS, color: '#8884d8' },
                { name: 'Shipping', value: totalShippingCost, color: '#82ca9d' },
                { name: 'Ad Spend', value: relevantAdSpend, color: '#ffc658' },
                { name: 'RTO Loss', value: rtoLoss, color: '#ff8042' }
            ]
        }
    };
};

module.exports = {
    generateAnalytics,
    getAdSpend,
    saveAdSpend
};
