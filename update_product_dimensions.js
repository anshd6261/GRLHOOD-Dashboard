const shopify = require('./src/shopify');

const updateProductDimensions = async () => {
    try {
        console.log(`\n🔍 Step 1: Fetching all products from Shopify...`);

        // Fetch all products with their collections
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

        // Filter out products in 'Upsell' collection
        const filteredProducts = products.filter(p => {
            const collections = p.node.collections.edges.map(c => c.node.title);
            const isUpsell = collections.some(c => c.toLowerCase().includes('upsell'));
            return !isUpsell;
        });

        const upsellCount = products.length - filteredProducts.length;
        console.log(`📦 Updating ${filteredProducts.length} products (skipped ${upsellCount} in Upsell collection)...`);

        let successCount = 0;
        let failCount = 0;

        for (const product of filteredProducts) {
            const productTitle = product.node.title;

            for (const variant of product.node.variants.edges) {
                const variantId = variant.node.id;

                console.log(`\n  📝 ${productTitle} - ${variant.node.title}`);

                try {
                    // Use metafieldsSet mutation (works in API 2024-01+)
                    const metafieldsMutation = `
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
                                namespace: "shipping",
                                key: "dimensions",
                                value: "8x5x2",
                                type: "single_line_text_field"
                            },
                            {
                                ownerId: variantId,
                                namespace: "shipping",
                                key: "length_cm",
                                value: "8",
                                type: "number_decimal"
                            },
                            {
                                ownerId: variantId,
                                namespace: "shipping",
                                key: "width_cm",
                                value: "5",
                                type: "number_decimal"
                            },
                            {
                                ownerId: variantId,
                                namespace: "shipping",
                                key: "height_cm",
                                value: "2",
                                type: "number_decimal"
                            }
                        ]
                    };

                    const updateResult = await shopify.graphqlRequest(metafieldsMutation, variables);

                    if (updateResult.metafieldsSet?.userErrors?.length > 0) {
                        console.log(`     ⚠️  Errors:`, updateResult.metafieldsSet.userErrors);
                        failCount++;
                    } else {
                        console.log(`     ✅ Updated`);
                        successCount++;
                    }

                } catch (err) {
                    console.log(`     ❌ Failed:`, err.message);
                    failCount++;
                }

                // Rate limiting - wait 300ms between updates
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        console.log(`\n✅ UPDATE COMPLETE!`);
        console.log(`   Success: ${successCount} variants updated`);
        console.log(`   Failed: ${failCount} variants`);
        console.log(`   Skipped: ${upsellCount} products in Upsell collection`);
        console.log(`\n💡 Dimensions are now stored in product metafields.`);
        console.log(`   Future orders should sync with 8x5x2 dimensions!`);

    } catch (error) {
        console.error('\n❌ Script Failed:', error.message);
        console.error(error.stack);
    }
};

updateProductDimensions();
