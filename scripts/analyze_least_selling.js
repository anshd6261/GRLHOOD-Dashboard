const { graphqlRequest } = require('../src/shopify');

async function getAllProducts() {
    console.log('[1/3] Fetching all active products...');
    const query = `
    query GetProducts($cursor: String) {
      products(first: 250, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage, endCursor }
        edges {
          node {
            id
            title
            totalInventory
            createdAt
            images(first: 1) { edges { node { url } } }
          }
        }
      }
    }
    `;

    let allProducts = [];
    let hasNext = true;
    let cursor = null;

    while (hasNext) {
        const data = await graphqlRequest(query, { cursor });
        allProducts.push(...data.products.edges.map(e => e.node));

        hasNext = data.products.pageInfo.hasNextPage;
        cursor = data.products.pageInfo.endCursor;
        process.stdout.write(`\rFound ${allProducts.length} products...`);
    }
    console.log('');
    return allProducts;
}

async function getSalesData(daysAgo = 90) {
    console.log(`[2/3] Fetching orders from last ${daysAgo} days...`);

    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

    const query = `
    query GetOrders($cursor: String, $query: String!) {
      orders(first: 250, after: $cursor, query: $query) {
        pageInfo { hasNextPage, endCursor }
        edges {
          node {
            lineItems(first: 50) {
              edges {
                node {
                  product { id }
                  quantity
                }
              }
            }
          }
        }
      }
    }
    `;

    let salesMap = {}; // { product_gid: quantity }
    let hasNext = true;
    let cursor = null;
    let orderCount = 0;

    while (hasNext) {
        const data = await graphqlRequest(query, { cursor, query: `created_at:>=${dateStr}` });

        const orders = data.orders.edges;
        orderCount += orders.length;

        orders.forEach(order => {
            order.node.lineItems.edges.forEach(item => {
                const pid = item.node.product?.id;
                const qty = item.node.quantity;
                if (pid) {
                    salesMap[pid] = (salesMap[pid] || 0) + qty;
                }
            });
        });

        hasNext = data.orders.pageInfo.hasNextPage;
        cursor = data.orders.pageInfo.endCursor;
        process.stdout.write(`\rScanned ${orderCount} orders...`);
    }
    console.log('');
    return salesMap;
}

async function analyze() {
    try {
        const products = await getAllProducts();
        const sales = await getSalesData(90);

        console.log(`[3/3] Analyzing ${products.length} products against sales data...`);

        // Map sales to products
        const results = products.map(p => ({
            title: p.title,
            sales: sales[p.id] || 0,
            inventory: p.totalInventory,
            created: p.createdAt.split('T')[0],
            id: p.id
        }));

        // Sort by Sales (Ascending)
        results.sort((a, b) => a.sales - b.sales);

        // Output to Console
        console.log('\n================================================');
        console.log('📉 LEAST SELLING PRODUCTS (Last 90 Days)');
        console.log('================================================');

        // Zero Sales
        const zeroSales = results.filter(r => r.sales === 0);
        console.log(`\n❌ ZERO SALES (${zeroSales.length} Products):`);
        // Limit to 20 for readability
        zeroSales.slice(0, 20).forEach(p => console.log(`[0] ${p.title} (Inv: ${p.inventory})`));
        if (zeroSales.length > 20) console.log(`... and ${zeroSales.length - 20} more.`);

        // Low Sales (1-5)
        const lowSales = results.filter(r => r.sales > 0 && r.sales <= 5);
        console.log(`\n⚠️ LOW SALES (1-5 Units):`);
        lowSales.slice(0, 20).forEach(p => console.log(`[${p.sales}] ${p.title} (Inv: ${p.inventory})`));

        // Top Sellers (for context)
        const topSales = [...results].sort((a, b) => b.sales - a.sales).slice(0, 5);
        console.log(`\n🏆 TOP SELLERS (Context):`);
        topSales.forEach(p => console.log(`[${p.sales}] ${p.title}`));

    } catch (error) {
        console.error('Analysis failed:', error);
    }
}

analyze();
