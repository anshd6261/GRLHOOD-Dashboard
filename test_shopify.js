const { graphqlRequest } = require('./src/shopify');
(async () => {
  const query = `
    query {
      orders(first: 5, query: "fulfillment_status:unfulfilled", sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            name
            tags
            customAttributes { key value }
            shippingAddress { phone address1 city zip country }
          }
        }
      }
    }`;
  const res = await graphqlRequest(query);
  console.log(JSON.stringify(res.orders.edges, null, 2));
})();
