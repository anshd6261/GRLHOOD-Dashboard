require('dotenv').config();
const sr = require('./src/shiprocket');

(async () => {
    try {
        console.log("Fetching recent orders from SR...");
        // Fetch 2 days of orders
        const d = new Date();
        const end = d.toISOString();
        d.setDate(d.getDate() - 3);
        const start = d.toISOString();

        const res = await sr.fetchOrdersByDate(start, end);
        if (res.success && res.data.length > 0) {
            console.log(`Found ${res.data.length} orders.`);

            // Look for any order to see risk structure
            const targetOrders = res.data;
            console.log(`Found ${targetOrders.length} orders total.`);

            for (let i = 0; i < Math.min(5, targetOrders.length); i++) {
                const o = targetOrders[i];
                console.log(`\n--- Order ID: ${o.id} / Channel ID: ${o.channel_order_id} ---`);

                // Print specific keys or the whole object if it's small enough, but let's filter for risk
                const pickKeys = (obj) => {
                    let extracted = {};
                    for (let key in obj) {
                        if (typeof obj[key] === 'object' && obj[key] !== null) {
                            extracted[key] = pickKeys(obj[key]);
                        } else if (typeof key === 'string' && (key.toLowerCase().includes('rto') || key.toLowerCase().includes('risk') || key.toLowerCase().includes('score') || key.toLowerCase().includes('tag') || key.toLowerCase().includes('fraud') || key.toLowerCase().includes('status'))) {
                            extracted[key] = obj[key];
                        }
                    }
                    return extracted;
                };

                console.log(JSON.stringify(pickKeys(o), null, 2));

                // Let's also just dump the top-level keys
                console.log("Top-level keys:", Object.keys(o).join(', '));

                // Specifically look inside shipments
                if (o.shipments) {
                    console.log("Shipments data related to AI/Risk:");
                    o.shipments.forEach((s, idx) => {
                        console.log(`  Shipment ${idx} keys:`, Object.keys(s).join(', '));
                        if (s.is_return) console.log("  is_return:", s.is_return);
                        if (s.rto_routed) console.log("  rto_routed:", s.rto_routed);
                        // Let's dump s.others or similar
                        console.log("  Filtered Shipment Data:", JSON.stringify(pickKeys(s), null, 2));
                    });
                }
            }
        } else {
            console.log("Failed to fetch or no data:", res.error || "0 orders");
        }
    } catch (err) {
        console.error("Error:", err);
    }
})();
