const axios = require('axios');
require('dotenv').config();

let accessToken = null;
let tokenExpiry = null;
let authPromise = null;

const getCleanDomain = () => {
  let domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error('SHOPIFY_STORE_DOMAIN not set in .env');

  domain = domain.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  if (!domain.includes('.myshopify.com') && !domain.includes('.')) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
};

const getAccessToken = async () => {
  // Return cached token if valid
  if (accessToken && tokenExpiry && new Date() < tokenExpiry) {
    return accessToken;
  }

  // If an authentication request is already in-flight, await its completion
  if (authPromise) {
    return authPromise;
  }

  authPromise = (async () => {
    const domain = getCleanDomain();
    const url = `https://${domain}/admin/oauth/access_token`;

    console.log(`[AUTH] Fetching new access token for ${domain}...`);

    try {
      const response = await axios.post(url, {
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        grant_type: 'client_credentials'
      });

      accessToken = response.data.access_token;
      tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);

      console.log('[AUTH] Token obtained successfully');
      return accessToken;
    } catch (error) {
      console.error('[AUTH] Failed to get token:', error.response?.data || error.message);
      throw new Error('Authentication failed');
    } finally {
      authPromise = null;
    }
  })();

  return authPromise;
};

const graphqlRequest = async (query, variables = {}) => {
  const token = await getAccessToken();
  const domain = getCleanDomain();
  const url = `https://${domain}/admin/api/2026-01/graphql.json`;

  try {
    const response = await axios.post(url, { query, variables }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      }
    });

    if (response.data.errors) {
      throw new Error(JSON.stringify(response.data.errors));
    }
    if (response.data.data && response.data.data.userErrors && response.data.data.userErrors.length > 0) {
      throw new Error(JSON.stringify(response.data.data.userErrors));
    }

    return response.data.data;
  } catch (error) {
    console.error('[API] GraphQL Error:', error.response?.data || error.message);
    throw error;
  }
};

// --- NEW SKU LOGIC ---

const findMaxSku = async () => {
  // Queries all products to find the highest numeric SKU.
  // Optimized: Fetches only title/variants to scan SKUs.
  console.log('[SKU] Scanning for highest SKU...');
  const query = `
      query ScanProducts($cursor: String) {
        products(first: 250, after: $cursor, sortKey: CREATED_AT, reverse: true) {
          pageInfo { hasNextPage, endCursor }
          edges {
            node {
              variants(first: 10) {
                edges { node { sku } }
              }
            }
          }
        }
      }
    `;

  let maxSku = 400; // Default start as per user request example
  let hasNext = true;
  let cursor = null;

  // Safety limit to prevent infinite loops on huge stores, though 250 per page is fast.
  let pages = 0;

  while (hasNext && pages < 20) { // Scan up to 5000 products
    const data = await graphqlRequest(query, { cursor });
    const products = data.products.edges;

    products.forEach(p => {
      p.node.variants.edges.forEach(v => {
        const sku = v.node.sku;
        if (sku && /^\d+$/.test(sku)) {
          const num = parseInt(sku, 10);
          if (num > maxSku) maxSku = num;
        }
      });
    });

    hasNext = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
    pages++;
  }

  console.log(`[SKU] Highest SKU found: ${maxSku}`);
  return maxSku;
};

const assignSkuToProduct = async (productId) => {
  // Ensure ID is a GraphQL Global ID
  const globalId = productId.toString().includes('gid://')
    ? productId
    : `gid://shopify/Product/${productId}`;

  // 1. Find the next SKU
  const currentMax = await findMaxSku();
  const newSku = (currentMax + 1).toString();
  console.log(`[SKU] Assigning new SKU ${newSku} to Product ${globalId}`);

  // 2. Fetch Product Variants (including Inventory Item ID)
  const productQuery = `
      query GetProductVariants($id: ID!) {
        product(id: $id) {
          variants(first: 100) {
            edges {
              node {
                id
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
    `;
  const prodData = await graphqlRequest(productQuery, { id: globalId });
  const variants = prodData.product.variants.edges;

  // 3. Update All Variants via InventoryItem
  console.log(`[SKU] Updating ${variants.length} variants (via InventoryItem)...`);

  const updatePromises = variants.map(async (v) => {
    // We need the Inventory Item ID, not the Variant ID, to update SKU via this mutation
    const inventoryItemId = v.node.inventoryItem?.id;
    if (!inventoryItemId) {
      console.error(`[SKU] Variant ${v.node.id} has no inventory item!`);
      return null;
    }

    const mutation = `
            mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
                inventoryItemUpdate(id: $id, input: $input) {
                    inventoryItem {
                        id
                        sku
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

    return graphqlRequest(mutation, {
      id: inventoryItemId,
      input: {
        sku: newSku
      }
    });
  });

  await Promise.all(updatePromises);

  return newSku;
};

// --- END SKU LOGIC ---

const getUnfulfilledOrders = async (daysLookback = 3, startDate = null, endDate = null, statusMode = 'unfulfilled') => {
  let dateFilter = '';

  if (startDate && endDate) {
    // startDate and endDate are assumed to be ISO strings provided by the client,
    // which already include the correct boundaries for the user's timezone.
    dateFilter = `created_at:>=${startDate} created_at:<=${endDate}`;
    console.log(`[ORDERS] Fetching orders from ${startDate} to ${endDate} [Mode: ${statusMode}]...`);
  } else if (daysLookback > 0) {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - daysLookback);
    // Strip millis, use proper ISO for fallback or simpler format
    // For "days ago", we just want "since that time".
    const formatISO = (d) => d.toISOString().split('.')[0] + 'Z';
    dateFilter = `created_at:>=${formatISO(daysAgo)}`;
    console.log(`[ORDERS] Fetching orders since ${formatISO(daysAgo)} [Mode: ${statusMode}]...`);
  }

  const query = `
    query GetUnfulfilledOrders($cursor: String, $query: String!) {
      orders(first: 250, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id   # Need Order ID for link
            name # #1001
            email
            phone # Global Order Phone
            createdAt
            cancelledAt
            tags
            riskLevel # HIGH, MEDIUM, LOW
            displayFinancialStatus
            displayFulfillmentStatus
            paymentGatewayNames
            shippingAddress {
              name
              phone
              address1
              address2
              city
              province
              zip
              country
            }
            customer {
              id
              email
              numberOfOrders
              phone # Customer Profile Phone
            }
            fulfillments(first: 1) {
              trackingInfo {
                number
                url
              }
            }
            lineItems(first: 100) {
              edges {
                node {
                  title
                  variantTitle
                  sku
                  quantity
                  originalUnitPrice
                  customAttributes {
                    key
                    value
                  }
                  variant {
                    id # Variant ID
                    title
                    sku
                    image { url } # Thumbnail
                    # Fetch "Custom Coded Handle" if it exists as a metafield
                    handle_metafield: metafield(namespace: "custom", key: "handle") {
                      value
                    }
                    # Fallback: maybe they meant a color handle?
                    color_handle: metafield(namespace: "custom", key: "color_handle") {
                       value
                    }
                    selectedOptions {
                      name
                      value
                    }
                    inventoryItem {
                        id
                        unitCost {
                            amount
                        }
                    }
                  }
                  product {
                    id # Product ID for SKU assignment
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

  let statusQuery = '';
  if (statusMode === 'unfulfilled') {
    statusQuery = 'fulfillment_status:unfulfilled status:open';
  } else if (statusMode === 'all') {
    statusQuery = 'status:any';
  }

  const queryFilter = `${statusQuery} ${dateFilter}`.trim();

  let allOrders = [];
  let hasNextPage = true;
  let cursor = null;
  let pageCount = 0;

  while (hasNextPage && pageCount < 40) {
    pageCount++;
    const data = await graphqlRequest(query, {
      cursor,
      query: queryFilter
    });

    const ordersData = data.orders;
    allOrders.push(...ordersData.edges.map(e => e.node));

    hasNextPage = ordersData.pageInfo.hasNextPage;
    cursor = ordersData.pageInfo.endCursor;
  }

  console.log(`[ORDERS] Found ${allOrders.length} orders`);
  return allOrders;
};

const getOrder = async (id) => {
  // ID can be "gid://shopify/Order/123" or just "123". 
  // If just "123", we need to guess GID format? Or use `nodes` query?
  // Safer to assume we have GID from the processing step.
  const globalId = id.toString().includes('gid://') ? id : `gid://shopify/Order/${id}`;

  const query = `
      query GetOrder($id: ID!) {
        order(id: $id) {
            id
            name
            email
            phone
            createdAt
            riskLevel
            displayFinancialStatus
            shippingAddress {
              name
              address1
              address2
              city
              zip
              name
              address1
              address2
              city
              zip
              province
              country
              phone
            }
            lineItems(first: 50) {
              edges {
                node {
                  title
                  sku
                  quantity
                  originalUnitPrice
                  variant {
                    sku
                  }
                }
              }
            }
        }
      }
    `;

  const data = await graphqlRequest(query, { id: globalId });
  return data.order;
};

const searchOrders = async (searchQuery) => {
  const query = `
    query SearchOrders($query: String!) {
      orders(first: 20, query: $query, sortKey: CREATED_AT, reverse: true) {
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
            shippingAddress {
              name
              phone
              address1
              address2
              city
              province
              zip
              country
            }
            customer {
              id
              email
              numberOfOrders
              phone
            }
            fulfillments(first: 1) {
              trackingInfo {
                number
                url
              }
            }
            lineItems(first: 50) {
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
                    selectedOptions { name value }
                    inventoryItem { id unitCost { amount } }
                  }
                  product { id onlineStoreUrl handle productType }
                }
              }
            }
          }
        }
      }
    }
  `;

  // Provide exactly what user typed. Shopify handles `name:1001` or just `1001`.
  // We limit to 20 to be super fast and responsive.
  const data = await graphqlRequest(query, { query: searchQuery.trim() });
  return data.orders.edges.map(e => e.node);
};

const cancelOrder = async (id) => {
  const globalId = id.toString().includes('gid://') ? id : `gid://shopify/Order/${id}`;
  const query = `
    mutation orderCancel($orderId: ID!) {
      orderCancel(orderId: $orderId, notifyCustomer: true, reason: CUSTOMER) {
        orderCancelUserErrors {
          message
        }
      }
    }
  `;
  const data = await graphqlRequest(query, { orderId: globalId });
  if (data.orderCancel && data.orderCancel.orderCancelUserErrors && data.orderCancel.orderCancelUserErrors.length > 0) {
    throw new Error(data.orderCancel.orderCancelUserErrors[0].message);
  }
  return true;
};

const deleteOrder = async (id) => {
  const globalId = id.toString().includes('gid://') ? id : `gid://shopify/Order/${id}`;
  const query = `
    mutation orderDelete($id: ID!) {
      orderDelete(id: $id) {
        deletedId
        userErrors {
          field
          message
        }
      }
    }
  `;
  const data = await graphqlRequest(query, { id: globalId });
  if (data.orderDelete && data.orderDelete.userErrors && data.orderDelete.userErrors.length > 0) {
    throw new Error(data.orderDelete.userErrors[0].message);
  }
  return true;
};

module.exports = {
  getUnfulfilledOrders,
  searchOrders,
  assignSkuToProduct,
  getOrder,
  graphqlRequest,
  cancelOrder
};
