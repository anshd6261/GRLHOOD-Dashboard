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

// ─── Theme Asset Management (Install SEO Snippets) ────────────

const getActiveTheme = async () => {
  const query = `{
    themes(first: 10, roles: [MAIN]) {
      nodes { id name role }
    }
  }`;
  const data = await graphqlRequest(query);
  const mainTheme = data.themes.nodes.find(t => t.role === 'MAIN');
  if (!mainTheme) throw new Error('No active/main theme found');
  return mainTheme;
};

const uploadThemeAsset = async (themeId, filename, content) => {
  // Use themeFilesUpsert for Online Store 2.0 themes
  const mutation = `
    mutation themeFilesUpsert($files: [OnlineStoreThemeFilesUpsertFileInput!]!, $themeId: ID!) {
      themeFilesUpsert(files: $files, themeId: $themeId) {
        upsertedThemeFiles { filename }
        userErrors { field message filename }
      }
    }
  `;
  const data = await graphqlRequest(mutation, {
    themeId,
    files: [{ filename, body: { type: "TEXT", value: content } }]
  });
  if (data.themeFilesUpsert?.userErrors?.length > 0) {
    throw new Error(data.themeFilesUpsert.userErrors.map(e => `${e.filename}: ${e.message}`).join(', '));
  }
  return data.themeFilesUpsert.upsertedThemeFiles;
};

const getThemeFile = async (themeId, filename) => {
  const query = `
    query getThemeFile($themeId: ID!, $filenames: [String!]!) {
      theme(id: $themeId) {
        files(filenames: $filenames) {
          nodes {
            filename
            body { ... on OnlineStoreThemeFileBodyText { content } }
          }
        }
      }
    }
  `;
  const data = await graphqlRequest(query, { themeId, filenames: [filename] });
  return data.theme?.files?.nodes?.[0];
};

const installThemeSnippets = async (schemaLiquid, metaLiquid, llmsTxt) => {
  const log = [];
  const push = (msg) => { log.push(msg); console.log(`[THEME] ${msg}`); };

  // 1. Get active theme
  const theme = await getActiveTheme();
  push(`Active theme: ${theme.name} (${theme.id})`);

  // 2. Upload seo-schema.liquid snippet
  try {
    await uploadThemeAsset(theme.id, 'snippets/seo-schema.liquid', schemaLiquid);
    push('✅ Uploaded snippets/seo-schema.liquid');
  } catch (e) {
    push(`❌ seo-schema.liquid: ${e.message}`);
  }

  // 3. Upload seo-meta.liquid snippet
  try {
    await uploadThemeAsset(theme.id, 'snippets/seo-meta.liquid', metaLiquid);
    push('✅ Uploaded snippets/seo-meta.liquid');
  } catch (e) {
    push(`❌ seo-meta.liquid: ${e.message}`);
  }

  // 4. Upload llms.txt as asset
  try {
    await uploadThemeAsset(theme.id, 'assets/llms.txt', llmsTxt);
    push('✅ Uploaded assets/llms.txt');
  } catch (e) {
    push(`❌ llms.txt: ${e.message}`);
  }

  // 5. Inject renders into theme.liquid
  try {
    const themeFile = await getThemeFile(theme.id, 'layout/theme.liquid');
    if (!themeFile?.body?.content) {
      push('⚠️ Could not read layout/theme.liquid — snippets uploaded but not auto-injected. Add manually.');
    } else {
      let content = themeFile.body.content;
      let modified = false;

      // Add seo-meta render in <head> if not already present
      if (!content.includes("render 'seo-meta'")) {
        content = content.replace('</head>', "  {% render 'seo-meta' %}\n</head>");
        modified = true;
        push('✅ Injected seo-meta into <head>');
      } else {
        push('ℹ️ seo-meta already in theme.liquid');
      }

      // Add seo-schema render before </body> if not already present
      if (!content.includes("render 'seo-schema'")) {
        content = content.replace('</body>', "  {% render 'seo-schema' %}\n</body>");
        modified = true;
        push('✅ Injected seo-schema before </body>');
      } else {
        push('ℹ️ seo-schema already in theme.liquid');
      }

      if (modified) {
        await uploadThemeAsset(theme.id, 'layout/theme.liquid', content);
        push('✅ theme.liquid updated with SEO includes');
      }
    }
  } catch (e) {
    push(`⚠️ theme.liquid injection failed: ${e.message}. Snippets are uploaded — add {% render %} tags manually.`);
  }

  return { theme: theme.name, log };
};

// ─── Fix Broken -copy URLs ─────────────────────────────────────

const fixCopyUrls = async () => {
  const log = [];
  const push = (msg) => { log.push(msg); console.log(`[URL-FIX] ${msg}`); };

  const products = await getProducts(250);
  const broken = products.filter(p => p.handle?.includes('-copy'));
  push(`Found ${broken.length} products with -copy URLs`);

  let fixed = 0;
  for (const product of broken) {
    const newHandle = product.handle.replace(/-copy(-copy)*/g, '');
    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id handle }
          userErrors { field message }
        }
      }
    `;
    try {
      const data = await graphqlRequest(mutation, {
        input: { id: product.id, handle: newHandle }
      });
      if (data.productUpdate?.userErrors?.length > 0) {
        push(`⚠️ ${product.handle} → ${newHandle}: ${data.productUpdate.userErrors[0].message}`);
      } else {
        push(`✅ ${product.handle} → ${newHandle}`);
        fixed++;
      }
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      push(`❌ ${product.handle}: ${e.message}`);
    }
  }

  return { total: broken.length, fixed, log };
};

// ─── Add Alt Text to Product Images ────────────────────────────

const fixImageAltText = async () => {
  const log = [];
  const push = (msg) => { log.push(msg); console.log(`[ALT-TEXT] ${msg}`); };

  // Fetch products with their media
  const query = `
    query GetProductMedia($cursor: String) {
      products(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            productType
            media(first: 20) {
              edges {
                node {
                  ... on MediaImage {
                    id
                    alt
                    image { url }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  let allProducts = [];
  let hasNext = true;
  let cursor = null;
  let pages = 0;

  while (hasNext && pages < 10) {
    const data = await graphqlRequest(query, { cursor });
    allProducts.push(...data.products.edges.map(e => e.node));
    hasNext = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
    pages++;
  }

  push(`Scanned ${allProducts.length} products for missing alt text`);

  let fixed = 0;
  for (const product of allProducts) {
    const mediaToFix = product.media.edges
      .filter(m => m.node.id && (!m.node.alt || m.node.alt.trim() === ''))
      .map(m => m.node);

    if (mediaToFix.length === 0) continue;

    // Generate descriptive alt text
    const altText = `${product.title} — ${product.productType || 'Phone Case'} by GRL®`;

    for (const media of mediaToFix) {
      const mutation = `
        mutation fileUpdate($input: [FileUpdateInput!]!) {
          fileUpdate(files: $input) {
            files { alt }
            userErrors { field message }
          }
        }
      `;
      try {
        const data = await graphqlRequest(mutation, {
          input: [{ id: media.id, alt: altText }]
        });
        if (data.fileUpdate?.userErrors?.length > 0) {
          push(`⚠️ ${product.title}: ${data.fileUpdate.userErrors[0].message}`);
        } else {
          fixed++;
        }
      } catch (e) {
        push(`❌ ${product.title}: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
    push(`✅ ${product.title}: ${mediaToFix.length} images updated`);
  }

  push(`Done. ${fixed} images got alt text.`);
  return { productsScanned: allProducts.length, imagesFixed: fixed, log };
};

// ─── Bing: Submit All Product/Collection URLs ──────────────────

const bingSubmitAllUrls = async () => {
  const log = [];
  const push = (msg) => { log.push(msg); console.log(`[BING-URLS] ${msg}`); };

  if (!BING_API_KEY) { push('❌ BING_WEBMASTER_API_KEY not set'); return { submitted: 0, log }; }

  // Get quota first
  let quota;
  try {
    quota = await bingGetUrlSubmissionQuota();
    push(`Bing quota: ${JSON.stringify(quota)}`);
  } catch (e) {
    push(`⚠️ Couldn't check quota: ${e.message}`);
    quota = { d: { DailyQuota: 10, MonthlyQuota: 100 } };
  }

  const [products, collections] = await Promise.all([getProducts(250), getCollections()]);

  const urls = [
    `${SITE_URL}`,
    ...products.map(p => `${SITE_URL}/products/${p.handle}`),
    ...collections.map(c => `${SITE_URL}/collections/${c.handle}`)
  ];

  push(`Submitting ${urls.length} URLs to Bing...`);

  let submitted = 0;
  for (const url of urls.slice(0, 50)) { // Limit to 50 per run to stay within quota
    try {
      await bingSubmitUrl(url);
      submitted++;
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      push(`⚠️ ${url}: ${e.message}`);
    }
  }

  push(`Done. ${submitted}/${urls.length} URLs submitted to Bing.`);
  return { totalUrls: urls.length, submitted, log };
};

// ─── Full SEO Execute (All Steps) ──────────────────────────────

const executeFullSEO = async (schemaLiquid, metaLiquid, llmsTxt) => {
  const results = {};
  const log = [];
  const push = (msg) => { log.push(msg); console.log(`[SEO-EXEC] ${msg}`); };

  push('═══ STARTING FULL SEO EXECUTION ═══');

  // Step 1: Install theme snippets
  push('Step 1/5: Installing theme snippets...');
  try {
    results.themeInstall = await installThemeSnippets(schemaLiquid, metaLiquid, llmsTxt);
    push('✅ Theme snippets installed');
  } catch (e) {
    results.themeInstall = { error: e.message };
    push(`❌ Theme install failed: ${e.message}`);
  }

  // Step 2: Bulk fix SEO titles/descriptions (reuse existing)
  push('Step 2/5: Fixing SEO titles & descriptions...');
  try {
    results.seoFix = await bulkFixAllSEO();
    push(`✅ SEO fix done: ${results.seoFix.productsFixed} products, ${results.seoFix.collectionsFixed} collections`);
  } catch (e) {
    results.seoFix = { error: e.message };
    push(`❌ SEO fix failed: ${e.message}`);
  }

  // Step 3: Fix -copy URLs
  push('Step 3/5: Fixing broken -copy URLs...');
  try {
    results.urlFix = await fixCopyUrls();
    push(`✅ URL fix: ${results.urlFix.fixed} fixed`);
  } catch (e) {
    results.urlFix = { error: e.message };
    push(`❌ URL fix failed: ${e.message}`);
  }

  // Step 4: Fix image alt text
  push('Step 4/5: Adding image alt text...');
  try {
    results.altText = await fixImageAltText();
    push(`✅ Alt text: ${results.altText.imagesFixed} images updated`);
  } catch (e) {
    results.altText = { error: e.message };
    push(`❌ Alt text failed: ${e.message}`);
  }

  // Step 5: Submit all URLs to Bing
  push('Step 5/5: Submitting URLs to Bing...');
  try {
    results.bingUrls = await bingSubmitAllUrls();
    push(`✅ Bing: ${results.bingUrls.submitted} URLs submitted`);
  } catch (e) {
    results.bingUrls = { error: e.message };
    push(`❌ Bing submission failed: ${e.message}`);
  }

  push('═══ FULL SEO EXECUTION COMPLETE ═══');

  return { results, log, timestamp: new Date().toISOString() };
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
  installThemeSnippets,
  fixCopyUrls,
  fixImageAltText,
  bingSubmitAllUrls,
  executeFullSEO,
};
