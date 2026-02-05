const shopify = require('./src/shopify');

const verifyDimensions = async () => {
    try {
        console.log(`\n🔍 Verifying dimension updates...`);

        const query = `
            query {
                products(first: 5) {
                    edges {
                        node {
                            title
                            variants(first: 1) {
                                edges {
                                    node {
                                        title
                                        metafields(first: 5, namespace: "shipping") {
                                            edges {
                                                node {
                                                    key
                                                    value
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        const data = await shopify.graphqlRequest(query);

        console.log(`\n📦 Sample of updated products:\n`);
        data.products.edges.forEach(p => {
            const variant = p.node.variants.edges[0]?.node;
            if (variant) {
                console.log(`${p.node.title} - ${variant.title}`);
                const metafields = variant.metafields.edges;
                if (metafields.length > 0) {
                    metafields.forEach(m => {
                        console.log(`  - ${m.node.key}: ${m.node.value}`);
                    });
                } else {
                    console.log(`  ⚠️  No metafields found`);
                }
                console.log('');
            }
        });

        console.log(`✅ Verification complete!`);
        console.log(`\n💡 Next: New Shopify orders will sync to Shiprocket with 8x5x2 dimensions!`);

    } catch (error) {
        console.error('❌ Verification failed:', error.message);
    }
};

verifyDimensions();
