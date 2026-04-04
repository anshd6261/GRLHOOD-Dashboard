const axios = require('axios');
const { graphqlRequest } = require('./shopify');
require('dotenv').config();

const BING_API_KEY = process.env.BING_WEBMASTER_API_KEY;
const SITE_URL = 'https://www.grlhood.in';

// ─── Shopify SEO GraphQL Queries ────────────────────────────────

const getProducts = async (limit = 50) => {
  const query = `
    query GetProducts($cursor: String) {
      products(first: ${limit}, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            productType
            seo { title description }
            onlineStoreUrl
            featuredImage { url altText }
            variants(first: 5) {
              edges {
                node {
                  title
                  sku
                  price
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await graphqlRequest(query, {});
  return data.products.edges.map(e => e.node);
};

const getCollections = async () => {
  const query = `
    query GetCollections($cursor: String) {
      collections(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            handle
            descriptionHtml
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
  const globalId = productId.includes('gid://') ? productId : `gid://shopify/Product/${productId}`;
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          seo { title description }
        }
        userErrors { field message }
      }
    }
  `;
  const data = await graphqlRequest(mutation, {
    input: {
      id: globalId,
      seo: { title: seoTitle, description: seoDescription }
    }
  });
  if (data.productUpdate?.userErrors?.length > 0) {
    throw new Error(data.productUpdate.userErrors.map(e => e.message).join(', '));
  }
  return data.productUpdate.product;
};

const updateCollectionSEO = async (collectionId, seoTitle, seoDescription, descriptionHtml) => {
  const globalId = collectionId.includes('gid://') ? collectionId : `gid://shopify/Collection/${collectionId}`;
  const input = { id: globalId, seo: { title: seoTitle, description: seoDescription } };
  if (descriptionHtml) input.descriptionHtml = descriptionHtml;

  const mutation = `
    mutation collectionUpdate($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection {
          id
          title
          seo { title description }
        }
        userErrors { field message }
      }
    }
  `;
  const data = await graphqlRequest(mutation, { input });
  if (data.collectionUpdate?.userErrors?.length > 0) {
    throw new Error(data.collectionUpdate.userErrors.map(e => e.message).join(', '));
  }
  return data.collectionUpdate.collection;
};

// ─── SEO Audit: Score Products & Collections ────────────────────

const auditProductSEO = (product) => {
  const issues = [];
  let score = 100;

  // Title checks
  if (!product.seo?.title) {
    issues.push({ severity: 'critical', issue: 'Missing SEO title', fix: 'Add SEO title with keywords + phone model' });
    score -= 25;
  } else if (product.seo.title.length < 30) {
    issues.push({ severity: 'warning', issue: `SEO title too short (${product.seo.title.length} chars)`, fix: 'Expand to 50-60 chars' });
    score -= 10;
  }

  // Description checks
  if (!product.seo?.description) {
    issues.push({ severity: 'critical', issue: 'Missing meta description', fix: 'Add 120-155 char description in GRL® voice' });
    score -= 25;
  } else if (product.seo.description.length < 50) {
    issues.push({ severity: 'warning', issue: `Meta description too short (${product.seo.description.length} chars)`, fix: 'Expand to 120-155 chars' });
    score -= 10;
  }

  // Handle/URL check
  if (product.handle?.includes('-copy')) {
    issues.push({ severity: 'critical', issue: `URL contains "-copy": /products/${product.handle}`, fix: 'Clean up product slug' });
    score -= 15;
  }

  // Image alt check
  if (!product.featuredImage?.altText) {
    issues.push({ severity: 'warning', issue: 'Featured image missing alt text', fix: 'Add descriptive alt with product name + phone model' });
    score -= 10;
  }

  // Product description check
  if (!product.descriptionHtml || product.descriptionHtml.length < 100) {
    issues.push({ severity: 'warning', issue: 'Product description too thin', fix: 'Add 150+ word GRL® voice description' });
    score -= 15;
  }

  return { productId: product.id, title: product.title, handle: product.handle, score: Math.max(0, score), issues };
};

const auditCollectionSEO = (collection) => {
  const issues = [];
  let score = 100;

  if (!collection.seo?.title) {
    issues.push({ severity: 'critical', issue: 'Missing SEO title', fix: 'Add keyword-targeted SEO title' });
    score -= 25;
  }
  if (!collection.seo?.description) {
    issues.push({ severity: 'critical', issue: 'Missing meta description', fix: 'Add 120-155 char description' });
    score -= 25;
  }
  if (!collection.descriptionHtml || collection.descriptionHtml.length < 50) {
    issues.push({ severity: 'warning', issue: 'Collection description too thin', fix: 'Add 150-300 word GRL® voice description' });
    score -= 20;
  }
  if (collection.handle?.includes('-copy')) {
    issues.push({ severity: 'critical', issue: `URL contains "-copy": /collections/${collection.handle}`, fix: 'Clean up collection slug' });
    score -= 15;
  }

  return { collectionId: collection.id, title: collection.title, handle: collection.handle, score: Math.max(0, score), issues };
};

// ─── Bing Webmaster Tools API ───────────────────────────────────

const bingSubmitSitemap = async () => {
  if (!BING_API_KEY) throw new Error('BING_WEBMASTER_API_KEY not set');
  const url = `https://ssl.bing.com/webmaster/api.svc/json/SubmitSitemap?apikey=${BING_API_KEY}&siteUrl=${encodeURIComponent(SITE_URL)}&sitemapUrl=${encodeURIComponent(SITE_URL + '/sitemap.xml')}`;
  const res = await axios.get(url);
  return res.data;
};

const bingSubmitUrl = async (pageUrl) => {
  if (!BING_API_KEY) throw new Error('BING_WEBMASTER_API_KEY not set');
  const url = `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?apikey=${BING_API_KEY}&siteUrl=${encodeURIComponent(SITE_URL)}&url=${encodeURIComponent(pageUrl)}`;
  const res = await axios.get(url);
  return res.data;
};

const bingGetUrlSubmissionQuota = async () => {
  if (!BING_API_KEY) throw new Error('BING_WEBMASTER_API_KEY not set');
  const url = `https://ssl.bing.com/webmaster/api.svc/json/GetUrlSubmissionQuota?apikey=${BING_API_KEY}&siteUrl=${encodeURIComponent(SITE_URL)}`;
  const res = await axios.get(url);
  return res.data;
};

// ─── SEO Dashboard Stats ────────────────────────────────────────

const getSEODashboard = async () => {
  const [products, collections] = await Promise.all([
    getProducts(250),
    getCollections()
  ]);

  const productAudits = products.map(auditProductSEO);
  const collectionAudits = collections.map(auditCollectionSEO);

  const avgProductScore = productAudits.length > 0
    ? Math.round(productAudits.reduce((sum, a) => sum + a.score, 0) / productAudits.length)
    : 0;
  const avgCollectionScore = collectionAudits.length > 0
    ? Math.round(collectionAudits.reduce((sum, a) => sum + a.score, 0) / collectionAudits.length)
    : 0;

  const criticalIssues = [
    ...productAudits.flatMap(a => a.issues.filter(i => i.severity === 'critical').map(i => ({ ...i, source: a.title, handle: a.handle }))),
    ...collectionAudits.flatMap(a => a.issues.filter(i => i.severity === 'critical').map(i => ({ ...i, source: a.title, handle: a.handle })))
  ];

  const missingMetaProducts = productAudits.filter(a => a.issues.some(i => i.issue.includes('Missing meta description'))).length;
  const missingTitleProducts = productAudits.filter(a => a.issues.some(i => i.issue.includes('Missing SEO title'))).length;
  const copyUrlProducts = productAudits.filter(a => a.issues.some(i => i.issue.includes('-copy'))).length;

  return {
    overview: {
      totalProducts: products.length,
      totalCollections: collections.length,
      avgProductScore,
      avgCollectionScore,
      overallScore: Math.round((avgProductScore + avgCollectionScore) / 2),
      criticalIssueCount: criticalIssues.length,
    },
    issues: {
      missingMetaProducts,
      missingTitleProducts,
      copyUrlProducts,
      topCritical: criticalIssues.slice(0, 20),
    },
    products: productAudits.sort((a, b) => a.score - b.score).slice(0, 20),
    collections: collectionAudits.sort((a, b) => a.score - b.score),
  };
};

// ─── GRL® Voice SEO Generators ──────────────────────────────────

const generateProductSEOTitle = (product) => {
  const name = product.title || 'Phone Case';
  if (name.length > 45) return `${name} | GRL®`;
  return `${name} — Phone Case | GRL®`;
};

const generateProductMetaDesc = (product) => {
  const name = product.title || 'Phone Case';
  const price = product.variants?.edges?.[0]?.node?.price || '';
  const priceStr = price ? ` Starting ₹${Math.round(parseFloat(price))}.` : '';
  const templates = [
    `${name}. Pretty. Protective. Unapologetically bold.${priceStr} Shop GRL® — free shipping across India.`,
    `The ${name} — designed mood-first, protection guaranteed.${priceStr} Shop GRL® phone cases now.`,
    `${name} by GRL®. Not basic. Never basic. Premium protection meets aesthetic design.${priceStr} Free shipping India.`,
  ];
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % templates.length;
  let desc = templates[idx];
  if (desc.length > 155) desc = desc.substring(0, 152) + '...';
  return desc;
};

const generateCollectionSEO = (collection) => {
  const name = collection.title || 'Collection';
  return {
    title: `${name} — Phone Cases | GRL®`,
    description: `${name.toUpperCase()}. Aesthetic, protective, and anything but basic. Shop GRL® phone cases — premium quality, free shipping across India.`,
  };
};

// ─── Bulk Fix All SEO (One-Click) ───────────────────────────────

const bulkFixAllSEO = async () => {
  const log = [];
  const push = (msg) => { log.push(msg); console.log(`[SEO-BULK] ${msg}`); };

  push('Starting GRL® SEO Bulk Fix...');

  // 1. Fetch everything
  const [products, collections] = await Promise.all([
    getProducts(250),
    getCollections()
  ]);
  push(`Found ${products.length} products, ${collections.length} collections`);

  let productFixed = 0, productSkipped = 0, collectionFixed = 0;
  const brokenUrls = [];
  const errors = [];

  // 2. Fix products
  for (const product of products) {
    const needsTitle = !product.seo?.title;
    const needsDesc = !product.seo?.description;
    if (product.handle?.includes('-copy')) {
      brokenUrls.push({ type: 'product', handle: product.handle, title: product.title });
    }
    if (!needsTitle && !needsDesc) { productSkipped++; continue; }

    const newTitle = needsTitle ? generateProductSEOTitle(product) : product.seo.title;
    const newDesc = needsDesc ? generateProductMetaDesc(product) : product.seo.description;

    try {
      await updateProductSEO(product.id, newTitle, newDesc);
      push(`✅ Product: ${product.title}`);
      productFixed++;
      await new Promise(r => setTimeout(r, 500)); // Shopify rate limit
    } catch (e) {
      push(`❌ Product: ${product.title} — ${e.message}`);
      errors.push({ type: 'product', title: product.title, error: e.message });
    }
  }

  // 3. Fix collections
  for (const collection of collections) {
    const needsTitle = !collection.seo?.title;
    const needsDesc = !collection.seo?.description;
    if (collection.handle?.includes('-copy')) {
      brokenUrls.push({ type: 'collection', handle: collection.handle, title: collection.title });
    }
    if (!needsTitle && !needsDesc) continue;

    const seo = generateCollectionSEO(collection);
    try {
      await updateCollectionSEO(collection.id, seo.title, seo.description);
      push(`✅ Collection: ${collection.title}`);
      collectionFixed++;
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      push(`❌ Collection: ${collection.title} — ${e.message}`);
      errors.push({ type: 'collection', title: collection.title, error: e.message });
    }
  }

  // 4. Submit to Bing
  let bingResult = 'skipped';
  if (BING_API_KEY) {
    try {
      await bingSubmitSitemap();
      bingResult = 'submitted';
      push('✅ Sitemap submitted to Bing');
    } catch (e) {
      bingResult = `failed: ${e.message}`;
      push(`⚠️ Bing submission failed: ${e.message}`);
    }
  }

  const summary = {
    productsFixed: productFixed,
    productsSkipped: productSkipped,
    collectionsFixed: collectionFixed,
    brokenUrls,
    errors,
    bingResult,
    log,
    timestamp: new Date().toISOString(),
  };

  push(`Done. Products: ${productFixed} fixed, ${productSkipped} skipped. Collections: ${collectionFixed} fixed. Broken URLs: ${brokenUrls.length}.`);
  return summary;
};

module.exports = {
  getProducts,
  getCollections,
  updateProductSEO,
  updateCollectionSEO,
  auditProductSEO,
  auditCollectionSEO,
  bingSubmitSitemap,
  bingSubmitUrl,
  bingGetUrlSubmissionQuota,
  getSEODashboard,
  bulkFixAllSEO,
};
