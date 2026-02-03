const axios = require('axios');
require('dotenv').config();

let accessToken = null;
let tokenExpiry = null;

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
  }
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

  // 2. Fetch Product Variants
  const productQuery = `
      query GetProductVariants($id: ID!) {
        product(id: $id) {
          variants(first: 100) {
            edges { node { id } }
          }
        }
      }
    `;
  const prodData = await graphqlRequest(productQuery, { id: globalId });
  const variants = prodData.product.variants.edges;

  // 3. Update All Variants
  // GraphQL Mutation to update variants
  const mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

  const variantInputs = variants.map(v => ({
    id: v.node.id,
    sku: newSku
  }));

  await graphqlRequest(mutation, {
    productId: globalId,
    variants: variantInputs
  });

  return newSku;
};

// --- END SKU LOGIC ---

const getUnfulfilledOrders = async (daysLookback = 3) => {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysLookback);
  const dateFilter = daysAgo.toISOString();

  console.log(`[ORDERS] Fetching unfulfilled orders since ${dateFilter}...`);

  const query = `
    query GetUnfulfilledOrders($cursor: String, $query: String!) {
      orders(first: 50, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id   # Need Order ID for link
            name # #1001
            createdAt
            displayFinancialStatus
            paymentGatewayNames
            shippingAddress {
              name
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

  const queryFilter = `fulfillment_status:unfulfilled status:open created_at:>=${dateFilter}`;

  let allOrders = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
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

module.exports = {
  getUnfulfilledOrders,
  assignSkuToProduct
};
