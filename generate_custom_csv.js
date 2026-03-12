const fs = require('fs');
const { graphqlRequest } = require('./src/shopify');
const { processOrders } = require('./src/processor');
const { generateCSV } = require('./src/csv_generator');

const orderNames = ["2282", "2279", "2254", "2184", "2178"];

const getSpecificOrders = async () => {
  const query = `
    query GetOrders($query: String!) {
      orders(first: 50, query: $query) {
        edges {
          node {
            id
            name
            createdAt
            riskLevel
            displayFinancialStatus
            paymentGatewayNames
            shippingAddress {
              name
              phone
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

  const allOrders = [];
  for (const name of orderNames) {
    const data = await graphqlRequest(query, { query: `name:${name}` });
    const match = data.orders.edges.find(e => e.node.name === `#${name}`);
    if (match) {
        allOrders.push(match.node);
    }
  }
  return allOrders;
};

(async () => {
    try {
        console.log('Fetching orders...');
        const rawOrders = await getSpecificOrders();
        console.log(`Found ${rawOrders.length} orders.`);
        
        const processedRows = processOrders(rawOrders, 18);
        console.log(`Formatted into ${processedRows.length} rows.`);

        const csvContent = generateCSV(processedRows, 18);
        fs.writeFileSync('Custom_Orders.csv', csvContent);
        console.log('Successfully saved to Custom_Orders.csv');
    } catch (e) {
        console.error(e);
    }
})();
