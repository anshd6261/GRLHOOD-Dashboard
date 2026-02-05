const shopify = require('./src/shopify');

const assignCasesPackage = async () => {
    try {
        console.log(`\n🔍 Step 1: Finding the CASES package...`);

        // Query delivery profiles to find the CASES package
        const profileQuery = `
            query {
                deliveryProfiles(first: 10) {
                    edges {
                        node {
                            id
                            name
                            profileLocationGroups {
                                locationGroupZones(first: 10) {
                                    edges {
                                        node {
                                            zone {
                                                name
                                            }
                                            methodDefinitions(first: 20) {
                                                edges {
                                                    node {
                                                        id
                                                        name
                                                        rateProvider {
                                                            ... on DeliveryRateDefinition {
                                                                id
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
                    }
                }
            }
        `;

        const profileData = await shopify.graphqlRequest(profileQuery);
        console.log(`📦 Delivery Profiles:`, JSON.stringify(profileData, null, 2));

        // Now let's try a different approach - update variants with package dimensions using inventoryItem
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
                                        inventoryItem {
                                            id
                                        }
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

        console.log(`📦 Updating ${filteredProducts.length} products (skipped ${products.length - filteredProducts.length} in Upsell)...`);

        let successCount = 0;
        let failCount = 0;

        for (const product of filteredProducts) {
            const productTitle = product.node.title;

            for (const variant of product.node.variants.edges) {
                const inventoryItemId = variant.node.inventoryItem.id;

                console.log(`\n  📝 ${productTitle} - ${variant.node.title}`);

                try {
                    // Update inventory item with package dimensions
                    const updateMutation = `
                        mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
                            inventoryItemUpdate(id: $id, input: $input) {
                                inventoryItem {
                                    id
                                    measurement {
                                        weight {
                                            value
                                            unit
                                        }
                                    }
                                }
                                userErrors {
                                    field
                                    message
                                }
                            }
                        }
                    `;

                    // CASES package: 8×5×2 cm, 150g (0.15 kg)
                    const variables = {
                        id: inventoryItemId,
                        input: {
                            measurement: {
                                weight: {
                                    value: 0.15,
                                    unit: "KILOGRAMS"
                                }
                            }
                        }
                    };

                    const result = await shopify.graphqlRequest(updateMutation, variables);

                    if (result.inventoryItemUpdate?.userErrors?.length > 0) {
                        console.log(`     ⚠️  Errors:`, result.inventoryItemUpdate.userErrors);
                        failCount++;
                    } else {
                        console.log(`     ✅ Package assigned (150g)`);
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

    } catch (error) {
        console.error('\n❌ Script Failed:', error.message);
        console.error(error.stack);
    }
};

assignCasesPackage();
