const { processOrders } = require('../src/processor');

const mockOrders = [
    {
        name: '#1001',
        shippingAddress: { name: 'Test User' },
        lineItems: {
            edges: [
                {
                    node: {
                        title: 'Florence', // Should be ignored
                        variantTitle: 'Double Armoured Case', // Should become Premium Tough Case
                        sku: 'SKU-123',
                        quantity: 1,
                        customAttributes: [
                            { key: 'Model', value: 'Brand: Apple :Model: Apple iPhone 15 Pro Max' }
                        ],
                        variant: { title: 'Double Armoured Case' }
                    }
                },
                {
                    node: {
                        title: 'Design B',
                        variantTitle: 'Slim Snap Case', // Should become Premium Hard Case
                        sku: 'SKU-456',
                        quantity: 1,
                        customAttributes: [
                            { key: 'Device', value: 'Samsung Galaxy S24' } // Simple case
                        ],
                        variant: { title: 'Slim Snap Case' }
                    }
                }
            ]
        }
    }
];

const result = processOrders(mockOrders);
console.log(JSON.stringify(result, null, 2));

// Assertions
const row1 = result[0];
if (row1.model !== 'iPhone 15 Pro Max') console.error('FAIL: Expected iPhone 15 Pro Max, got ' + row1.model);
else console.log('PASS: Apple Model Cleaned');

if (row1.category !== 'Premium Tough Case') console.error('FAIL: Expected Premium Tough Case, got ' + row1.category);
else console.log('PASS: Category Renamed');

const row2 = result[1];
if (row2.model !== 'Samsung Galaxy S24') console.error('FAIL: Expected Samsung Galaxy S24, got ' + row2.model);
else console.log('PASS: Samsung Model Cleaned');

if (row2.category !== 'Premium Hard Case') console.error('FAIL: Expected Premium Hard Case, got ' + row2.category);
else console.log('PASS: Slim Case Renamed');
