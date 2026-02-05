const shopify = require('./src/shopify');

const assignCasesPackageToProducts = async () => {
    try {
        console.log(`\n🔍 Step 1: Finding CASES package ID...`);

        // First, get the delivery profile and find the CASES package
        const packageQuery = `
            query {
                shop {
                    id
                }
                deliveryProfiles(first: 5) {
                    edges {
                        node {
                            id
                            name
                        }
                    }
                }
            }
        `;

        const profileData = await shopify.graphqlRequest(packageQuery);
        console.log(`📦 Shop and Profiles:`, JSON.stringify(profileData, null, 2));

        // Since Shopify Admin API doesn't directly support package assignment via GraphQL,
        // we need to use a different approach - update each variant's metafield to reference the package

        console.log(`\n🔍 Step 2: Fetching all products...`);

        const productQuery = `
            query {
                products(first: 250) {
                    edges {
                        node {
                            id
                            title
                            collections(first: 10) {
                                edges {
                                    node {
                                        title
                                    }
                                }
                            }
                            variants(first: 10) {
                                edges {
                                    node {
                                        id
                                        title
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        const productsData = await shopify.graphqlRequest(productQuery);
        const products = productsData.products.edges;

        console.log(`✅ Found ${products.length} products.`);

        // Filter out Upsell collection
        const filteredProducts = products.filter(p => {
            const collections = p.node.collections.edges.map(c => c.node.title);
            const isUpsell = collections.some(c => c.toLowerCase().includes('upsell'));
            return !isUpsell;
        });

        console.log(`📦 Will process ${filteredProducts.length} products (skipped ${products.length - filteredProducts.length} in Upsell)...`);

        let successCount = 0;
        let failCount = 0;

        for (const product of filteredProducts) {
            const productTitle = product.node.title;

            for (const variant of product.node.variants.edges) {
                const variantId = variant.node.id;

                console.log(`\n  📝 ${productTitle} - ${variant.node.title}`);

                try {
                    // Set metafield to indicate package selection
                    const metafieldMutation = `
                        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
                            metafieldsSet(metafields: $metafields) {
                                metafields {
                                    key
                                    namespace
                                    value
                                }
                                userErrors {
                                    field
                                    message
                                }
                            }
                        }
                    `;

                    const variables = {
                        metafields: [
                            {
                                ownerId: variantId,
                                namespace: "shopify",
                                key: "package",
                                value: "CASES",
                                type: "single_line_text_field"
                            }
                        ]
                    };

                    const result = await shopify.graphqlRequest(metafieldMutation, variables);

                    if (result.metafieldsSet?.userErrors?.length > 0) {
                        console.log(`     ⚠️  Errors:`, result.metafieldsSet.userErrors);
                        failCount++;
                    } else {
                        console.log(`     ✅ CASES package reference set`);
                        successCount++;
                    }

                } catch (err) {
                    console.log(`     ❌ Failed:`, err.message);
                    failCount++;
                }

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        console.log(`\n✅ UPDATE COMPLETE!`);
        console.log(`   Success: ${successCount} variants`);
        console.log(`   Failed: ${failCount} variants`);
        console.log(`\n⚠️  NOTE: If the UI still shows "Store default", you may need to:`);
        console.log(`   1. Use Shopify's bulk editor to change package selection`);
        console.log(`   2. Or manually select CASES package for each product in admin`);
        console.log(`   The GraphQL API has limited support for package assignment.`);

    } catch (error) {
        console.error('\n❌ Script Failed:', error.message);
        console.error(error.stack);
    }
};

assignCasesPackageToProducts();
