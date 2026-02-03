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
                  customAttributes {
                    key
                    value
                  }
                  variant {
                    title
                    sku
                    inventoryItem {
                      unitCost {
                        amount
                      }
                    }
                  }
                  product {
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

module.exports = {
  getUnfulfilledOrders
};
