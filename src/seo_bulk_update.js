/**
 * GRL® SEO Bulk Updater
 *
 * Run: node src/seo_bulk_update.js [--dry-run]
 *
 * Automatically fixes all product and collection SEO:
 * - Adds GRL® voice SEO titles
 * - Adds GRL® voice meta descriptions
 * - Reports on broken URLs (-copy slugs)
 * - Submits sitemap to Bing
 */

require('dotenv').config();
const { graphqlRequest } = require('./shopify');
const axios = require('axios');

const SITE_URL = 'https://www.grlhood.in';
const BING_API_KEY = process.env.BING_WEBMASTER_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

// ─── GRL® Voice SEO Templates ──────────────────────────────────

const generateProductSEOTitle = (product) => {
  const name = product.title || 'Phone Case';
  // Try to extract phone model from variant titles
  const variants = product.variants?.edges?.map(v => v.node.title) || [];
  const hasModel = variants.some(v => /iphone|samsung|pixel|oneplus|nothing/i.test(v));

  if (name.length > 45) return `${name} | GRL®`;
  return `${name} — Phone Case | GRL®`;
};

const generateProductMetaDesc = (product) => {
  const name = product.title || 'Phone Case';
  const price = product.variants?.edges?.[0]?.node?.price || '';
  const priceStr = price ? ` Starting ₹${Math.round(parseFloat(price))}.` : '';

  // GRL® voice: confident, mood-first, short
  const templates = [
    `${name}. Pretty. Protective. Unapologetically bold.${priceStr} Shop GRL® — free shipping across India.`,
    `The ${name} — designed mood-first, protection guaranteed.${priceStr} Shop GRL® phone cases now.`,
    `${name} by GRL®. Not basic. Never basic. Premium protection meets aesthetic design.${priceStr} Free shipping India.`,
  ];

  // Pick template based on hash of name for variety
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % templates.length;
  let desc = templates[idx];

  // Ensure under 155 chars
  if (desc.length > 155) desc = desc.substring(0, 152) + '...';
  return desc;
};

const COLLECTION_SEO_MAP = {
  // Map known collection handles to keyword-optimized SEO
  'frontpage': {
    title: 'GRL® | Aesthetic Phone Cases That Aren\'t Boring',
    description: 'Phone cases for women who treat their phone as fashion. 100+ designer covers. Premium protection. Free shipping across India. NOT FOR EVERYONE.',
  },
  'wild-collection': {
    title: 'Wild Collection — Bold Phone Cases for Women | GRL®',
    description: 'WILD COLLECTION. Unapologetically bold phone cases for women who don\'t apologise for taking up space. Shop GRL® — free shipping India.',
  },
  'la-muse-copy': {
    title: 'La Muse Collection — Artistic Phone Cases | GRL®',
    description: 'LA MUSE. Artistically inspired phone cases that turn your phone into a canvas. Premium protection, aesthetic design. Shop GRL® now.',
  },
  'grlhood-x-stranger-things-copy': {
    title: 'GRL® x Stranger Things — Limited Edition Phone Cases',
    description: 'GRL® x STRANGER THINGS. Limited edition phone cases from the Upside Down. Grab yours before they disappear. Free shipping India.',
  },
  'the-zodiac-collection-copy-1': {
    title: 'Zodiac Collection — Astrology Phone Cases | GRL®',
    description: 'ZODIAC COLLECTION. Phone cases written in the stars. Find your sign, find your case. Shop GRL® astrology-inspired covers now.',
  },
};

const generateCollectionSEO = (collection) => {
  const mapped = COLLECTION_SEO_MAP[collection.handle];
  if (mapped) return mapped;

  // Generic GRL® voice for unmapped collections
  const name = collection.title || 'Collection';
  return {
    title: `${name} — Phone Cases | GRL®`,
    description: `${name.toUpperCase()}. Aesthetic, protective, and anything but basic. Shop GRL® phone cases — premium quality, free shipping across India.`,
  };
};

// ─── Shopify GraphQL Operations ─────────────────────────────────

const fetchAllProducts = async () => {
  const query = `
    query GetAllProducts($cursor: String) {
      products(first: 250, after: $cursor, sortKey: TITLE) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id title handle descriptionHtml productType
            seo { title description }
            featuredImage { url altText }
            variants(first: 5) {
              edges { node { title sku price } }
            }
          }
        }
      }
    }
  `;

  let all = [];
  let hasNext = true;
  let cursor = null;
  let pages = 0;

  while (hasNext && pages < 20) {
    const data = await graphqlRequest(query, { cursor });
    all.push(...data.products.edges.map(e => e.node));
    hasNext = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
    pages++;
  }

  return all;
};

const fetchAllCollections = async () => {
  const query = `
    query GetAllCollections($cursor: String) {
      collections(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id title handle descriptionHtml
            seo { title description }
            productsCount { count }
          }
        }
      }
    }
  `;
  const data = await graphqlRequest(query, {});
  return data.collections.edges.map(e => e.node);
};

const updateProductSEO = async (productId, seoTitle, seoDescription) => {
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title seo { title description } }
        userErrors { field message }
      }
    }
  `;
  const data = await graphqlRequest(mutation, {
    input: { id: productId, seo: { title: seoTitle, description: seoDescription } }
  });
  if (data.productUpdate?.userErrors?.length > 0) {
    throw new Error(data.productUpdate.userErrors.map(e => e.message).join(', '));
  }
  return data.productUpdate.product;
};

const updateCollectionSEO = async (collectionId, seoTitle, seoDescription) => {
  const mutation = `
    mutation collectionUpdate($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id title seo { title description } }
        userErrors { field message }
      }
    }
  `;
  const data = await graphqlRequest(mutation, {
    input: { id: collectionId, seo: { title: seoTitle, description: seoDescription } }
  });
  if (data.collectionUpdate?.userErrors?.length > 0) {
    throw new Error(data.collectionUpdate.userErrors.map(e => e.message).join(', '));
  }
  return data.collectionUpdate.collection;
};

// ─── Bing Webmaster Submission ──────────────────────────────────

const submitToBing = async () => {
  if (!BING_API_KEY) {
    console.log('⚠️  BING_WEBMASTER_API_KEY not set — skipping Bing submission');
    return;
  }

  console.log('\n📡 Submitting sitemap to Bing...');
  try {
    const url = `https://ssl.bing.com/webmaster/api.svc/json/SubmitSitemap?apikey=${BING_API_KEY}&siteUrl=${encodeURIComponent(SITE_URL)}&sitemapUrl=${encodeURIComponent(SITE_URL + '/sitemap.xml')}`;
    const res = await axios.get(url, { timeout: 15000 });
    console.log('✅ Sitemap submitted to Bing successfully');
    return res.data;
  } catch (e) {
    console.log(`⚠️  Bing submission failed: ${e.message}`);
  }
};

const submitUrlToBing = async (pageUrl) => {
  if (!BING_API_KEY) return;
  try {
    const url = `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?apikey=${BING_API_KEY}&siteUrl=${encodeURIComponent(SITE_URL)}&url=${encodeURIComponent(pageUrl)}`;
    await axios.get(url, { timeout: 10000 });
    return true;
  } catch (e) {
    return false;
  }
};

// ─── Main Runner ────────────────────────────────────────────────

const run = async () => {
  console.log('═══════════════════════════════════════════════');
  console.log('  GRL® SEO BULK UPDATER');
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🚀 LIVE (updating Shopify)'}`);
  console.log('═══════════════════════════════════════════════\n');

  // 1. Fetch all products and collections
  console.log('📦 Fetching all products...');
  const products = await fetchAllProducts();
  console.log(`   Found ${products.length} products\n`);

  console.log('📂 Fetching all collections...');
  const collections = await fetchAllCollections();
  console.log(`   Found ${collections.length} collections\n`);

  // 2. Audit and fix products
  console.log('─── PRODUCT SEO FIXES ───\n');
  let productFixed = 0;
  let productSkipped = 0;
  const brokenUrls = [];

  for (const product of products) {
    const needsTitle = !product.seo?.title;
    const needsDesc = !product.seo?.description;
    const hasCopyUrl = product.handle?.includes('-copy');

    if (hasCopyUrl) {
      brokenUrls.push({ type: 'product', handle: product.handle, title: product.title });
    }

    if (!needsTitle && !needsDesc) {
      productSkipped++;
      continue;
    }

    const newTitle = needsTitle ? generateProductSEOTitle(product) : product.seo.title;
    const newDesc = needsDesc ? generateProductMetaDesc(product) : product.seo.description;

    if (DRY_RUN) {
      console.log(`  [DRY] ${product.title}`);
      if (needsTitle) console.log(`        Title: "${newTitle}"`);
      if (needsDesc) console.log(`        Desc:  "${newDesc}"`);
      productFixed++;
    } else {
      try {
        await updateProductSEO(product.id, newTitle, newDesc);
        console.log(`  ✅ ${product.title}`);
        productFixed++;
        // Rate limit: Shopify allows ~2 mutations/sec
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log(`  ❌ ${product.title}: ${e.message}`);
      }
    }
  }

  console.log(`\n   Products fixed: ${productFixed} | Skipped (already done): ${productSkipped}\n`);

  // 3. Audit and fix collections
  console.log('─── COLLECTION SEO FIXES ───\n');
  let collectionFixed = 0;

  for (const collection of collections) {
    const needsTitle = !collection.seo?.title;
    const needsDesc = !collection.seo?.description;
    const hasCopyUrl = collection.handle?.includes('-copy');

    if (hasCopyUrl) {
      brokenUrls.push({ type: 'collection', handle: collection.handle, title: collection.title });
    }

    if (!needsTitle && !needsDesc) continue;

    const seo = generateCollectionSEO(collection);

    if (DRY_RUN) {
      console.log(`  [DRY] ${collection.title}`);
      if (needsTitle) console.log(`        Title: "${seo.title}"`);
      if (needsDesc) console.log(`        Desc:  "${seo.description}"`);
      collectionFixed++;
    } else {
      try {
        await updateCollectionSEO(collection.id, seo.title, seo.description);
        console.log(`  ✅ ${collection.title}`);
        collectionFixed++;
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log(`  ❌ ${collection.title}: ${e.message}`);
      }
    }
  }

  console.log(`\n   Collections fixed: ${collectionFixed}\n`);

  // 4. Report broken URLs
  if (brokenUrls.length > 0) {
    console.log('─── BROKEN URLs (NEED MANUAL FIX IN SHOPIFY ADMIN) ───\n');
    brokenUrls.forEach(u => {
      console.log(`  ⚠️  [${u.type}] /${u.type === 'product' ? 'products' : 'collections'}/${u.handle} — "${u.title}"`);
    });
    console.log(`\n   Total broken URLs: ${brokenUrls.length}`);
    console.log('   Fix these in Shopify Admin > Products/Collections > Edit > URL handle\n');
  }

  // 5. Submit to Bing
  if (!DRY_RUN) {
    await submitToBing();

    // Submit key pages to Bing individually
    const keyPages = [
      SITE_URL,
      `${SITE_URL}/collections/wild-collection`,
      `${SITE_URL}/collections/frontpage`,
    ];
    console.log('\n📡 Submitting key URLs to Bing...');
    for (const page of keyPages) {
      const ok = await submitUrlToBing(page);
      console.log(`  ${ok ? '✅' : '⚠️'} ${page}`);
    }
  }

  // 6. Summary
  console.log('\n═══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Products:    ${productFixed} fixed, ${productSkipped} already done`);
  console.log(`  Collections: ${collectionFixed} fixed`);
  console.log(`  Broken URLs: ${brokenUrls.length} (manual fix needed)`);
  console.log(`  Bing:        ${DRY_RUN ? 'Skipped (dry run)' : 'Submitted'}`);
  console.log('═══════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('💡 Run without --dry-run to apply changes:\n   node src/seo_bulk_update.js\n');
  }
};

run().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  process.exit(1);
});
