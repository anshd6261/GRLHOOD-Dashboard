module.exports = [
    {
        name: '#1421',
        createdAt: new Date().toISOString(),
        displayFinancialStatus: 'PENDING',
        paymentGatewayNames: ['Cash on Delivery (COD)'],
        customer: { firstName: 'Shagun', lastName: 'Khurana' },
        lineItems: {
            edges: [
                {
                    node: {
                        title: 'iPhone 14 Pro Max 3D Case',
                        variantTitle: 'Premium Tough Case',
                        sku: '397',
                        quantity: 1,
                        customAttributes: [
                            { key: 'Model', value: 'iPhone 14 Pro Max' }
                        ],
                        variant: {
                            title: 'Premium Tough Case',
                            inventoryItem: { unitCost: { amount: '150.00' } }
                        },
                        product: {
                            onlineStoreUrl: 'https://example.com/products/case'
                        }
                    }
                },
                // Test Quantity Expansion + Samsung Logic
                {
                    node: {
                        title: 'Samsung Galaxy S23 Ultra Case',
                        variantTitle: 'Hard Case',
                        sku: 'SAMS-S23U-HC',
                        quantity: 2, // Should become 2 rows
                        customAttributes: [
                            { key: 'Device', value: 'Samsung S23 Ultra' }
                        ],
                        variant: {
                            title: 'Hard Case',
                            inventoryItem: { unitCost: { amount: '200.00' } }
                        },
                        product: {
                            handle: 'samsung-case'
                        }
                    }
                }
            ]
        }
    },
    // Test Apple Logic without redundant "Apple"
    {
        name: '#1422',
        createdAt: new Date().toISOString(),
        displayFinancialStatus: 'PAID',
        paymentGatewayNames: ['Razorpay'],
        customer: { firstName: 'Steve', lastName: 'Jobs' },
        lineItems: {
            edges: [
                {
                    node: {
                        title: 'Apple iPhone 13 Case',
                        variantTitle: 'Slim Case',
                        sku: 'APP-IP13',
                        quantity: 1,
                        customAttributes: [
                            { key: 'brand', value: 'Apple' },
                            { key: 'model', value: 'Apple iPhone 13' }
                        ],
                        variant: {
                            title: 'Slim Case',
                            inventoryItem: { unitCost: { amount: '100.00' } }
                        },
                        product: { handle: 'iphone-13' }
                    }
                }
            ]
        }
    }
];
