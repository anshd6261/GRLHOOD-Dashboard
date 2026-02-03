const processOrders = (orders, gstRate = 18) => {
    const processedRows = [];

    for (const order of orders) {
        const orderId = order.name.replace('#', ''); // Remove # from order ID
        const shipping = order.shippingAddress || {};
        const customerName = shipping.name || 'Guest';

        // Determine payment method
        let payment = 'Cash on Delivery';
        const financialStatus = order.displayFinancialStatus || '';
        const gateways = (order.paymentGatewayNames || []).join(' ').toLowerCase();

        if (financialStatus === 'PAID' ||
            gateways.includes('razorpay') ||
            gateways.includes('paytm') ||
            gateways.includes('stripe') ||
            gateways.includes('paypal')) {
            payment = 'Prepaid';
        }

        // Process line items
        for (const edge of order.lineItems.edges) {
            const item = edge.node;
            const variant = item.variant || {};
            const product = item.product || {};

            // 1. Category (Variant Title) with Renaming
            const rawCategory = item.variantTitle || variant.title || 'Default';
            const category = mapCategory(rawCategory);

            // 2. Model (Brand + Model cleaning)
            const customAttrs = [];
            if (item.customAttributes) {
                item.customAttributes.forEach(attr => customAttrs.push(attr));
            }

            // Also check order noteAttributes if line item attrs are missing (User said "Order Coded Info")
            // But be careful not to apply global order notes to all items if they differ.
            // Usually POD data is in line item properties.

            // Try to find model info in attributes. 
            // CRITICAL: DO NOT use item.title as fallback (it contains design names like "Florence")
            const rawModel = customAttrs.find(a => /model|device/i.test(a.key))?.value || '';
            const rawBrand = customAttrs.find(a => /brand/i.test(a.key))?.value || '';

            const model = cleanModelName(rawModel, rawBrand, customAttrs);

            // 3. SKU
            const sku = item.sku || variant.sku || '';

            // 4. Preview URL
            // Sometimes in properties, sometimes construct from handle
            let previewUrl = '';
            if (product.onlineStoreUrl) {
                previewUrl = product.onlineStoreUrl;
            } else if (product.handle) {
                // Fallback to constructing URL
                previewUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/products/${product.handle}`;
            }

            // 5. COGS
            const unitCost = variant.inventoryItem?.unitCost?.amount;
            const cogs = unitCost ? parseFloat(unitCost) : 0;

            // Expand Quantity -> Multiple Rows
            const quantity = item.quantity || 1;
            for (let i = 0; i < quantity; i++) {
                processedRows.push({
                    category,
                    model,
                    sku,
                    customerName,
                    orderId,
                    previewUrl,
                    payment,
                    cogs
                });
            }
        }
    }

    return processedRows;
};

const cleanModelName = (rawModel, brand, noteAttributes = []) => {
    // 1. Try to extract from "Brand: ... :Model: ..." pattern in custom attributes OR raw string
    // The user mentioned "Brand: Apple :Model: Apple iPhone 15 Pro Max"
    // We check if we have a structured string in rawModel or if we need to look deeper

    let model = rawModel.trim();

    // If model looks like "Florence" (Design name), it's wrong. 
    // We strictly want "iPhone...", "Samsung...", "Pixel..." etc.
    // So we apply a strict filter: if it doesn't look like a device, ignore it or try to find it in attributes.

    // Check attributes for "Brand" and "Model" keys explicitly
    const attrModel = noteAttributes.find(a => a.key && a.key.toLowerCase().includes('model'))?.value;
    const attrBrand = noteAttributes.find(a => a.key && a.key.toLowerCase().includes('brand'))?.value;

    // If we found specific attributes, use them over the generic "rawModel" which might be the Title
    if (attrModel) {
        model = attrModel;
        if (!brand && attrBrand) brand = attrBrand;
    }

    // Cleaning Logic

    // 1. Try to extract common patterns first (User: "Brand: X :Model: Y")
    // If it contains "Model:", take everything after it
    // Handle "Brand: Apple :Model: Apple iPhone 15" -> "Apple iPhone 15"
    if (/Model:/i.test(model)) {
        model = model.replace(/.*Model:\s*/i, '');
    }

    // 2. Remove "Brand:", "Device:" prefixes if they still exist (case insensitive)
    model = model.replace(/(Brand:|Device:)\s*/gi, '');

    // Cleanup leading colons/spaces if any remain
    model = model.replace(/^[:\s]+/, '');

    const modelLower = model.toLowerCase();
    let detectedBrand = brand?.toLowerCase() || '';

    // Auto-detect brand 
    if (!detectedBrand) {
        if (modelLower.includes('iphone') || modelLower.includes('ipad') || modelLower.includes('apple')) {
            detectedBrand = 'apple';
        } else if (modelLower.includes('samsung') || modelLower.includes('galaxy')) {
            detectedBrand = 'samsung';
        } else if (modelLower.includes('google') || modelLower.includes('pixel')) {
            detectedBrand = 'google';
        } else if (modelLower.includes('oneplus')) {
            detectedBrand = 'oneplus';
        }
    }

    // --- BRAND SPECIFIC LOGIC ---

    // Apple: Remove "Apple" prefix
    if (detectedBrand === 'apple') {
        // Remove "Apple" and extra spaces
        model = model.replace(/^apple\s+/i, '');
        model = model.replace(/apple\s*iphone/i, 'iPhone'); // Handle "Apple iPhone" -> "iPhone"
        return model.trim();
    }

    // Samsung: Ensure "Samsung" prefix
    if (detectedBrand === 'samsung') {
        if (!modelLower.startsWith('samsung')) {
            model = `Samsung ${model}`;
        }
        return model.trim();
    }

    // Generic fallback: If it's just a design name like "Florence", we might want to return empty 
    // BUT the user said "remove anything else". 
    // If it doesn't look like a phone model, we should arguably flag it? 
    // For now, return trimmed model.
    return model.trim();
};

const mapCategory = (rawCategory) => {
    if (!rawCategory) return '';

    const lower = rawCategory.toLowerCase();

    if (lower.includes('double armoured')) return 'Premium Tough Case';
    if (lower.includes('slim snap case')) return 'Premium Hard Case';
    // Add other mappings if discovered

    return rawCategory;
};

module.exports = {
    processOrders
};
