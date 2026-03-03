const { getUnfulfilledOrders } = require('./src/shopify');
(async () => {
  try {
    const orders = await getUnfulfilledOrders(null, "2026-01-01T00:00:00.000Z", "2026-02-28T23:59:59.999Z");
    console.log("Found:", orders.length);
  } catch(e) {
    console.error(e);
  }
})();
