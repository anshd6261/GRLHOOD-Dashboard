const fs = require('fs');
const { graphqlRequest } = require('./src/shopify');
const { processOrders } = require('./src/processor');
const { generateSupplierCSV, generateFinancialCSV } = require('./src/csv_generator');

const getOrdersInRange = async (start, end) => {
  const query = `
    query GetOrders($query: String!) {
      orders(first: 250, query: $query) {
        edges {
          node {
            id
            name
            phone
            createdAt
            cancelledAt
            tags
            riskLevel
            displayFinancialStatus
            displayFulfillmentStatus
            paymentGatewayNames
            customer {
              id
              numberOfOrders
              phone
            }
            shippingAddress {
              name
              phone
              address1
              city
              zip
              country
            }
            lineItems(first: 100) {
              edges {
                node {
                  title
                  variantTitle
                  sku
                  quantity
                  originalUnitPrice
                  customAttributes { key value }
                  variant {
                    id
                    title
                    sku
                    image { url }
                    handle_metafield: metafield(namespace: "custom", key: "handle") { value }
                    color_handle: metafield(namespace: "custom", key: "color_handle") { value }
                    selectedOptions { name value }
                    inventoryItem { id unitCost { amount } }
                  }
                  product {
                    id
                    onlineStoreUrl
                    handle
                    productType
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  let allOrders = [];
  
  for (let i = start; i <= end; i += 30) {
      const chunk = [];
      for (let j = i; j < Math.min(i + 30, end + 1); j++) {
          chunk.push(`name:${j}`);
      }
      const q = chunk.join(' OR ');
      const data = await graphqlRequest(query, { query: q });
      allOrders.push(...data.orders.edges.map(e => e.node));
      
      await new Promise(r => setTimeout(r, 500));
  }
  
  const filtered = allOrders.filter(o => {
      if (o.cancelledAt) return false;
      const fsStatus = o.displayFinancialStatus;
      if (fsStatus === 'REFUNDED' || fsStatus === 'PARTIALLY_REFUNDED' || fsStatus === 'VOIDED') return false;
      
      const numMatch = o.name.match(/\d+/);
      if (numMatch) {
          const num = parseInt(numMatch[0], 10);
          if (num >= start && num <= end) return true;
      }
      return false;
  });
  
  const uniqueOrders = [];
  const seenIds = new Set();
  for (const o of filtered) {
      if (!seenIds.has(o.id)) {
          seenIds.add(o.id);
          uniqueOrders.push(o);
      }
  }

  uniqueOrders.sort((a, b) => {
      const numA = parseInt(a.name.match(/\d+/)[0], 10);
      const numB = parseInt(b.name.match(/\d+/)[0], 10);
      return numA - numB;
  });
  
  return uniqueOrders;
};

(async () => {
    try {
        const startNum = 3666;
        const endNum = 3739;
        console.log(`Fetching orders from #${startNum} to #${endNum}...`);
        const rawOrders = await getOrdersInRange(startNum, endNum);
        console.log(`Found ${rawOrders.length} valid orders.`);
        
        const processedRows = processOrders(rawOrders, 18, {});
        console.log(`Formatted into ${processedRows.length} rows.`);

        const normalCsv = generateSupplierCSV(processedRows);
        const financialCsv = generateFinancialCSV(processedRows, 18);
        
        fs.writeFileSync('Export_Normal_3666_3739.csv', normalCsv);
        fs.writeFileSync('Export_Financial_3666_3739.csv', financialCsv);
        
        console.log('Successfully saved to Export_Normal_3666_3739.csv and Export_Financial_3666_3739.csv');
    } catch (e) {
        console.error(e);
    }
})();
