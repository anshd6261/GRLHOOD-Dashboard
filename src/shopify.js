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
    // Set expiry to 23 hours to be safe (tokens usually last 24h)
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
    const response = await axios.post(url, {
      query,
      variables
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      }
    });

    if (response.data.errors) {
      throw new Error(JSON.stringify(response.data.errors));
    }

    return response.data.data;
  } catch (error) {
    console.error('[API] GraphQL Error:', error.response?.data || error.message);
    throw error;
  }
};

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
            id
            legacyResourceId
            name
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
                    id
                    title
                    sku
                    image {
                        url
                    }
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
                    id
                    featuredImage {
                        url
                    }
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

  // Filter: Unfulfilled AND Created since X days ago AND Status is Open (not cancelled/archived)
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

// --- SKU GENERATION LOGIC ---

const calculateNextSku = async () => {
  // 1. Fetch recent products (last 250) to find the current highest numeric SKU
  // Assumption: SKUs are essentially numeric like "100", "101". 
  // We ignore non-numeric SKUs.
  const query = `
      query GetRecentProducts {
        products(first: 250, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              variants(first: 20) {
                edges {
                  node {
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;

  try {
    const data = await graphqlRequest(query);
    let maxSku = 0;

    data.products.edges.forEach(p => {
      p.node.variants.edges.forEach(v => {
        const sku = v.node.sku;
        if (sku && /^\d+$/.test(sku)) {
          const val = parseInt(sku, 10);
          if (val > maxSku) maxSku = val;
        }
      });
    });

    // If no numeric SKUs found, maybe start at 100?
    if (maxSku === 0) return 100;

    return maxSku + 1;
  } catch (error) {
    console.error('Error finding max SKU:', error);
    throw error;
  }
};

const updateProductSku = async (productId, newSku) => {
  // 1. Get all variants of the product
  console.log(`[SKU] Updating product ${productId} to SKU ${newSku}...`);

  // We need to fetch variants first to get their IDs
  const fetchVariantsQuery = `
      query GetProductVariants($id: ID!) {
        product(id: $id) {
          variants(first: 100) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `;

  const productData = await graphqlRequest(fetchVariantsQuery, { id: productId });
  const variants = productData.product.variants.edges.map(e => e.node.id);

  if (variants.length === 0) throw new Error('No variants found for product');

  // 2. Update each variant
  // We can use bulk mutation or just loop. Loop is safer for small count.

  const mutation = `
        mutation productVariantUpdate($input: ProductVariantInput!) {
            productVariantUpdate(input: $input) {
                userErrors {
                    field
                    message
                }
                productVariant {
                    id
                    sku
                }
            }
        }
    `;

  for (const variantId of variants) {
    const variables = {
      input: {
        id: variantId,
        sku: newSku.toString()
      }
    };
    const res = await graphqlRequest(mutation, variables);
    if (res.productVariantUpdate.userErrors.length > 0) {
      console.error('Error updating variant:', res.productVariantUpdate.userErrors);
    }
  }

  return true;
};

module.exports = {
  getUnfulfilledOrders,
  calculateNextSku,
  updateProductSku
};
