const axios = require('axios');
require('dotenv').config();

const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL;
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD;

const getHeaders = async () => {
    const res = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
        email: SHIPROCKET_EMAIL,
        password: SHIPROCKET_PASSWORD
    });
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${res.data.token}`
    };
};

const testDuplicateDeleteStrategy = async () => {
    try {
        const headers = await getHeaders();
        const targetOrderName = "1573";

        console.log(`\n🔍 STEP 1: Finding Order #${targetOrderName} in Shiprocket...`);
        const searchRes = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders?per_page=50`, { headers });
        const originalOrder = searchRes.data.data.find(o => o.channel_order_id == targetOrderName);

        if (!originalOrder) {
            console.log(`❌ Order #${targetOrderName} not found in Shiprocket.`);
            return;
        }

        console.log(`✅ Found Order:`, {
            id: originalOrder.id,
            channel_order_id: originalOrder.channel_order_id,
            channel_id: originalOrder.channel_id,
            status: originalOrder.status,
            shipment_id: originalOrder.shipments?.[0]?.id
        });

        console.log(`\n📋 STEP 2: Creating Duplicate Adhoc Order with Dimensions (8x5x2)...`);

        // Extract customer details from original
        const customer = originalOrder.customer_name || "Customer";
        const splitName = customer.split(' ');

        // Clean phone number (remove non-digits, take last 10)
        let cleanPhone = (originalOrder.customer_phone || "9876543210").replace(/\D/g, '');
        if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10);
        if (cleanPhone.length < 10) cleanPhone = "9876543210";

        const duplicatePayload = {
            order_id: targetOrderName, // EXACT MATCH to Shopify order name
            order_date: originalOrder.created_at,
            pickup_location: "Primary",
            billing_customer_name: splitName[0],
            billing_last_name: splitName.slice(1).join(' ') || "",
            billing_address: originalOrder.customer_address || "Address",
            billing_city: originalOrder.customer_city || "City",
            billing_pincode: originalOrder.customer_pincode || "110001",
            billing_state: originalOrder.customer_state || "State",
            billing_country: originalOrder.customer_country || "India",
            billing_email: originalOrder.customer_email || "noreply@cloutcases.in",
            billing_phone: cleanPhone,
            shipping_is_billing: true,
            order_items: originalOrder.products.map(p => ({
                name: p.name,
                sku: p.sku || "DEFAULT-SKU",
                units: p.quantity,
                selling_price: parseFloat(p.selling_price) || 1
            })),
            payment_method: originalOrder.payment_method === "COD" ? "COD" : "Prepaid",
            sub_total: parseFloat(originalOrder.sub_total) || 1,
            length: 8,
            breadth: 5,
            height: 2,
            weight: 0.5
        };

        console.log(`📦 Creating Duplicate Order...`);

        const createRes = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', duplicatePayload, { headers });

        console.log(`✅ Duplicate Created:`, {
            order_id: createRes.data.order_id,
            shipment_id: createRes.data.shipment_id,
            channel_id: createRes.data.channel_id || "CUSTOM (Adhoc)"
        });

        const duplicateOrderId = createRes.data.order_id;
        const duplicateShipmentId = createRes.data.shipment_id;

        console.log(`\n🗑️  STEP 3: Cancelling ORIGINAL Order (ID: ${originalOrder.id})...`);

        try {
            await axios.post('https://apiv2.shiprocket.in/v1/external/orders/cancel', {
                ids: [originalOrder.id]
            }, { headers });
            console.log(`✅ Original Order ${originalOrder.id} cancelled in Shiprocket (Shopify order still intact).`);
        } catch (cancelErr) {
            console.log(`⚠️  Cancel Failed:`, cancelErr.response?.data || cancelErr.message);
            console.log(`   (This might be OK if order is already in a non-cancellable state)`);
        }

        console.log(`\n🏷️  STEP 4: Generating Label for Duplicate Order (Shipment: ${duplicateShipmentId})...`);

        // Assign courier first
        const courierRes = await axios.post('https://apiv2.shiprocket.in/v1/external/courier/assign/awb', {
            shipment_id: duplicateShipmentId
        }, { headers });

        console.log(`✅ Courier Assigned:`, {
            awb: courierRes.data.awb_assign_status?.awb,
            courier: courierRes.data.awb_assign_status?.courier_name
        });

        // Generate label
        const labelRes = await axios.post('https://apiv2.shiprocket.in/v1/external/courier/generate/label', {
            shipment_id: [duplicateShipmentId]
        }, { headers });

        console.log(`✅ Label Generated:`, labelRes.data.label_url);

        console.log(`\n✅ TEST COMPLETE!`);
        console.log(`\n📊 Summary:`);
        console.log(`   - Original Order #${targetOrderName} (Shopify Sync): CANCELLED in Shiprocket`);
        console.log(`   - Duplicate Order #${targetOrderName} (Adhoc): CREATED with 8x5x2 dims`);
        console.log(`   - Label URL: ${labelRes.data.label_url}`);
        console.log(`\n🔍 Next Step: Check Shopify Order #${targetOrderName} for tracking number!`);
        console.log(`   If tracking appears in Shopify, this strategy WORKS! ✨`);

    } catch (error) {
        console.error('\n❌ Test Failed:', error.response?.data || error.message);
    }
};

testDuplicateDeleteStrategy();
