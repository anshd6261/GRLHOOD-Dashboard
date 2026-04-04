# GRL(R) SEO Action Plan -- Prioritized Fixes

**Generated:** 2026-04-04
**Based on:** Comprehensive audit of grlhood.in (homepage, /collections/all, /products/muse)

---

## Priority 1: Critical (Fix This Week)

### 1.1 Fix 19 Broken Internal Links (404s)
**Impact:** High -- broken links waste crawl budget, hurt user experience, and signal poor site quality to Google.

The homepage links to 19 products with `-copy` slugs that return 404. These appear in the bestsellers/featured sections.

**Action:**
- In Shopify Admin, go to Online Store > Navigation and identify which sections reference these `-copy` URLs
- Update each link to point to the correct live product URL. The anchor text gives the correct product name:
  - "Glaze" links to /products/blush-moo-copy-copy -> should link to the actual Glaze product
  - "Agente" links to /products/muse-copy -> should link to the actual Agente product
  - (Full mapping in FULL-AUDIT-REPORT.md, Section 9)
- Alternatively, create URL redirects in Shopify (Settings > Navigation > URL Redirects) from each `-copy` URL to the correct product
- Consider doing BOTH: fix the source links AND add redirects as a safety net

### 1.2 Add H1 Tag to Collection Pages
**Impact:** High -- missing H1 on collection pages means Google has no primary heading signal for these pages.

**Action:**
- In the Shopify theme (Horizon), edit the collection template to include an H1 with the collection title
- For /collections/all, the H1 should be something like "All Phone Cases" or "Shop All GRL(R) Cases"
- Ensure every collection page has a unique, descriptive H1

### 1.3 Fix Empty Schema Descriptions
**Impact:** Medium-High -- empty description fields in Product and CollectionPage structured data reduce rich result eligibility.

**Action:**
- Ensure the Product schema on /products/muse (and all product pages) populates the `description` field from the product's SEO description
- Ensure the CollectionPage schema populates `description` from the collection's SEO description
- Check the Liquid template that generates these schemas and map the description field

---

## Priority 2: High (Fix Within 2 Weeks)

### 2.1 Fix OG Tag Ordering on Homepage
**Impact:** Medium-High -- Shopify's default OG tags (`og:title: "GRLHOOD(tm)"`, `og:description: "GRLHOOD(tm)"`) appear to take precedence over the custom enhanced tags for some crawlers.

**Action:**
- In the theme's `<head>` section, ensure custom OG meta tags are injected BEFORE Shopify's default `{% render 'meta-tags' %}` or equivalent
- Alternatively, override Shopify's default OG output entirely using theme customization
- The custom tags are well-written ("GRL(R) | Aesthetic Phone Cases That Aren't Boring") -- they just need to be the first ones crawlers encounter

### 2.2 Fix Protocol-Relative og:image URLs
**Impact:** Medium -- some social platforms and crawlers cannot resolve `//www.grlhood.in/...` URLs.

**Action:**
- On product pages, ensure og:image and twitter:image use absolute `https://` URLs, not `//`
- On collection pages, ensure og:image uses `https://` instead of `http://`
- Add twitter:image to collection pages (currently missing)

### 2.3 Fix Schema @context Protocol
**Impact:** Low-Medium -- Google prefers `https://schema.org` over `http://schema.org/`.

**Action:**
- On product pages, the Shopify-native ProductGroup schema uses `http://schema.org/` -- this is Shopify's default and may not be changeable
- For custom schemas, ensure all use `https://schema.org`

### 2.4 Fill Missing Alt Text on Theme/Navigation Images
**Impact:** Medium -- 23-29 images per page missing alt text, mostly in shared theme elements.

**Action:**
- Add alt text to collection card images in the navigation (AMORE_COLLECTION_CARD.jpg -> "Amore Collection - Aesthetic phone cases")
- Add alt text to the logo image ("GRL phone cases - GRLHOOD")
- These images appear on every page, so fixing them once in the theme fixes them sitewide
- The 507 product images already have alt text -- this is about the ~30 remaining theme/navigation images

---

## Priority 3: Medium (Fix Within 1 Month)

### 3.1 Make llms.txt Accessible
**Impact:** Medium -- important for AI crawler discoverability, but not a Google ranking factor.

**Action:**
- Shopify doesn't natively serve .txt files from the root. Options:
  1. Use a Shopify app or custom proxy to serve /llms.txt
  2. Upload the file as a Shopify asset and create a URL redirect
  3. Host on a subdomain or external service and redirect /llms.txt to it
- Also create /llms-full.txt with expanded content

### 3.2 Improve Homepage Title Tag
**Impact:** Medium -- current title "GRLHOOD(tm)" is only 8 characters. It should include primary keywords.

**Action:**
- Change to something like: "GRL(R) | Aesthetic Phone Cases for Women | Free Shipping India"
- Keep under 60 characters
- Include primary keyword "phone cases" and brand name

### 3.3 Optimize H2 Tags Across All Pages
**Impact:** Medium -- H2 tags are currently wasted on UI elements like "Country/Region", "Account", "Your cart is empty".

**Action:**
- In the Shopify theme, change these UI elements from `<h2>` to `<div>` or `<span>` with appropriate ARIA roles
- Reserve H2 tags for content sections: "Bestselling Cases", "Shop by Collection", "New Arrivals"
- On the homepage, "grlbestsellers" should become a proper H2 like "Bestselling Phone Cases"

### 3.4 Add Explicit AI Crawler Rules to robots.txt
**Impact:** Low-Medium -- currently 11 AI crawlers inherit generic `*` rules.

**Action:**
- Add explicit User-agent blocks for key AI crawlers. Example:
  ```
  User-agent: GPTBot
  Allow: /

  User-agent: ClaudeBot
  Allow: /

  User-agent: PerplexityBot
  Allow: /
  ```
- Or explicitly disallow if you want to block AI training on your content
- Note: Shopify controls robots.txt, so changes may need to go through theme customization or Shopify's robots.txt.liquid template

### 3.5 Deduplicate Sitemap References
**Impact:** Low -- the same sitemap URL is referenced 3 times in robots.txt.

**Action:**
- In robots.txt (via robots.txt.liquid in Shopify theme), ensure the sitemap is declared only once

---

## Priority 4: Low / Nice-to-Have

### 4.1 Add Missing Width/Height to Images
**Impact:** Low-Medium -- helps prevent Cumulative Layout Shift (CLS).

**Action:**
- Add explicit width and height attributes to images in Liquid templates
- Particularly important for above-the-fold images

### 4.2 Improve Security Headers
**Impact:** Low for SEO (these are Shopify-controlled).

**Action:**
- HSTS max-age: increase to 31536000 (Shopify may handle this)
- Referrer-Policy: "strict-origin-when-cross-origin" (limited control on Shopify)
- Permissions-Policy: camera=(), microphone=(), geolocation=() (limited control on Shopify)

### 4.3 Consolidate Duplicate Organization Schemas
**Impact:** Low -- having two Organization schemas (Shopify default + custom) is not harmful but is redundant.

**Action:**
- Remove or suppress the Shopify default Organization schema if possible
- Keep only the enhanced custom one that includes description, foundingDate, sameAs, etc.

### 4.4 Add Anchor Text to Image Links
**Impact:** Low-Medium -- 38 links across the site have no anchor text.

**Action:**
- Add `aria-label` or visually-hidden text to image-only links
- Example: A product card image link should have `aria-label="Shop Muse phone case"`

---

## What's Working Well

These items are already properly implemented and should be maintained:

1. **Product structured data** -- Rich ProductGroup schema with variants, pricing, availability, SKU
2. **BreadcrumbList** -- Properly structured on all page types (1-level home, 2-level collection, 3-level product)
3. **CollectionPage with ItemList** -- 100 products enumerated in structured data
4. **WebSite SearchAction** -- Enables Google sitelinks search box
5. **Canonical tags** -- Correct on all pages tested
6. **No redirect chains** -- Clean URL structure
7. **Product page meta tags** -- Good titles with keyword, descriptions with pricing and brand
8. **Product page readability** -- 1,031 words, grade 8.9 reading level
9. **HTTPS enforcement** -- Strong security foundation
10. **Response times** -- 174-216ms, well within acceptable range
11. **Product image alt text** -- Well-written descriptive alt on product images ("Muse -- Mobile Accessories by GRL(R)")
12. **OG tags on product pages** -- Score 92/100, includes pricing and proper type
13. **Twitter card setup** -- summary_large_image with @grlhood.in handle
14. **GA4 tracking** -- Confirmed installed
15. **SEO titles/descriptions on products and collections** -- Systematically applied

---

## Estimated Impact Timeline

| Timeframe | Actions | Expected Effect |
|-----------|---------|----------------|
| Week 1 | Fix 19 broken links, add collection H1, fix schema descriptions | Eliminate crawl errors, improve collection indexing |
| Week 2 | Fix OG tag ordering, fix protocol-relative URLs | Better social sharing previews, consistent meta signals |
| Month 1 | llms.txt, homepage title, H2 optimization, AI crawler rules | Broader discoverability, better keyword targeting |
| Ongoing | Image dimensions, anchor text, schema consolidation | Polish and CWV improvements |
