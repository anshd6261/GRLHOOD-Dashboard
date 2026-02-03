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
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            name
            legacyResourceId
            createdAt
            displayFinancialStatus
            paymentGatewayNames
            shippingAddress { name }
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
                    product {
                        id
                        legacyResourceId
                    }
                    # Fetch "Custom Coded Handle" if it exists as a metafield
                    handle_metafield: metafield(namespace: "custom", key: "handle") { value }
                    # Fallback: maybe they meant a color handle?
                    color_handle: metafield(namespace: "custom", key: "color_handle") { value }
                    selectedOptions { name value }
                    inventoryItem { unitCost { amount } }
                  }
                  product {
                    id
                    onlineStoreUrl
                    handle
                    productType
                    legacyResourceId
                    images(first: 1) { edges { node { url } } }
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
    const data = await graphqlRequest(query, { cursor, query: queryFilter });
    const ordersData = data.orders;
    allOrders.push(...ordersData.edges.map(e => e.node));
    hasNextPage = ordersData.pageInfo.hasNextPage;
    cursor = ordersData.pageInfo.endCursor;
  }

  console.log(`[ORDERS] Found ${allOrders.length} orders`);
  return allOrders;
};

// --- SKU GENERATION LOGIC ---

const getNextSku = async () => {
  // Strategy: Fetch recent 250 products, extract numeric SKUs, find Max.
  // This assumes the "highest" SKU is likely on a reasonably recent product.
  const query = `
        query {
            products(first: 250, sortKey: CREATED_AT, reverse: true) {
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
  const data = await graphqlRequest(query);
  let max = 0;

  data.products.edges.forEach(p => {
    p.node.variants.edges.forEach(v => {
      const sku = v.node.sku;
      if (sku && /^\d+$/.test(sku)) { // Check if SKU is purely numeric
        const num = parseInt(sku, 10);
        if (num > max) max = num;
      }
    });
  });

  // Default to 100 if no numeric SKUs found
  return max === 0 ? 100 : max + 1;
};

const assignSkuToProduct = async (productId) => {
  console.log(`[SKU] Assigning new SKU to Product ID: ${productId}`);

  // 1. Get Next SKU
  const nextSku = await getNextSku();
  const nextSkuStr = nextSku.toString();
  console.log(`[SKU] Generated SKU: ${nextSkuStr}`);

  // 2. Update all variants of this product
  // First, we need the ProductVariant IDs. GraphQL mutation requires them.
  // We can fetch them or just assume the productId passed is the GID.

  // Fetch variants of the target product
  const productQuery = `
        query($id: ID!) {
            product(id: $id) {
                variants(first: 100) {
                   edges { node { id } }
                }
            }
        }
    `;
  const prodData = await graphqlRequest(productQuery, { id: productId });
  const variants = prodData.product.variants.edges.map(e => e.node.id);

  if (variants.length === 0) throw new Error('Product has no variants');

  // 3. Bulk Update Mutation
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

  const variantInputs = variants.map(id => ({
    id: id,
    sku: nextSkuStr
  }));

  const result = await graphqlRequest(mutation, {
    productId: productId,
    variants: variantInputs
  });

  if (result.productVariantsBulkUpdate.userErrors.length > 0) {
    throw new Error(JSON.stringify(result.productVariantsBulkUpdate.userErrors));
  }

  console.log(`[SKU] Successfully updated ${variants.length} variants to SKU ${nextSkuStr}`);
  return nextSkuStr;
};

module.exports = {
  getUnfulfilledOrders,
  assignSkuToProduct
};
