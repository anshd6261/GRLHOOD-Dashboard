# GRLHOOD (grlhood.in) -- Full SEO Audit Report

**Audit Date:** 2026-04-04
**Pages Audited:**
- Homepage: https://www.grlhood.in
- Collection: https://www.grlhood.in/collections/all
- Product: https://www.grlhood.in/products/muse

**Tools Used:** fetch_page, parse_html, robots_checker, llms_txt_checker, security_headers, social_meta, broken_links, redirect_checker, readability, internal_links, validate_schema

---

## 1. Overall Summary

| Area | Score/Status | Notes |
|------|-------------|-------|
| Security Headers | 80/100 | Strong base, 2 headers missing |
| Social Meta (Homepage) | 69/100 | Shopify default OG tags override custom ones for some crawlers |
| Social Meta (Product) | 92/100 | Excellent -- minor og:image protocol issue |
| Social Meta (Collection) | 85/100 | Good -- twitter:image missing |
| Redirect Chains | Clean | No redirect hops on any page |
| Broken Links | 26 broken | 17 internal 404s from "-copy" product slugs |
| Structured Data | Comprehensive | Organization, ProductGroup, Product, BreadcrumbList, CollectionPage, WebSite |
| llms.txt | NOT FOUND (404) | Not accessible at /llms.txt |
| Internal Links | 836 total across 51 pages | 53 orphan pages, 38 links with no anchor text |
| Schema Validation | 1 warning | Product page uses http:// instead of https:// for @context |

---

## 2. Structured Data (JSON-LD)

### Homepage
**Schemas present:** Organization (x2), WebSite, BreadcrumbList

**Organization (Shopify default):**
- name: GRLHOOD(tm)
- logo: present (grlhood_white_2 PNG)
- url: https://www.grlhood.in

**Organization (custom/enhanced):**
- name: GRL(R)
- alternateName: GRLHOOD
- description: "Phone cases for women who treat their phone as fashion. Aesthetic, protective, and anything but basic."
- foundingDate: 2024
- sameAs: Instagram linked
- contactPoint: customer service (English, Hindi)
- address: PostalAddress, addressCountry: IN

**WebSite:**
- SearchAction with proper urlTemplate -- enables Google sitelinks search box
- name: GRL(R)

**BreadcrumbList:**
- Single item: Home -> https://www.grlhood.in

**Assessment:**
- Dual Organization schema (Shopify default + custom) is slightly redundant but not harmful
- WebSite SearchAction is excellent for sitelinks
- Schema validation passes cleanly

### Product Page (/products/muse)
**Schemas present:** Organization (x2), ProductGroup, BreadcrumbList, Product

**ProductGroup (Shopify native):**
- name: Muse
- brand: GRLHOOD(tm)
- category: Mobile Phone Cases
- 3 variants with individual pricing, availability, SKU, and images
- All variants currently show OutOfStock availability
- Prices: 599-849 INR

**BreadcrumbList:**
- Home -> Products -> Muse (3-level deep, properly structured)

**Assessment:**
- Rich product data with variants is excellent for Google Shopping and rich results
- **Issue:** `@context` uses `http://schema.org/` -- should be `https://schema.org`. Flagged by validator.
- **Issue:** Product description is empty string `""` -- Google may deprioritize or flag this
- Breadcrumbs properly structured

### Collection Page (/collections/all)
**Schemas present:** Organization (x2), BreadcrumbList, CollectionPage

**CollectionPage:**
- name: Products
- mainEntity: ItemList with 100 products enumerated
- Each item has position, url, and name

**BreadcrumbList:**
- Home -> Products (2-level)

**Assessment:**
- CollectionPage with ItemList is excellent for product discovery
- **Issue:** CollectionPage description is empty `""`
- Schema validation passes cleanly

---

## 3. Meta Tags

### Homepage
| Tag | Value | Assessment |
|-----|-------|------------|
| title | GRLHOOD(tm) | Too short (8 chars). Missing keywords like "phone cases" |
| meta description | "Phone cases for women who treat their phone as fashion. 100+ designer covers. Premium protection. Free shipping across India. NOT FOR EVERYONE." | 143 chars -- good length, good keywords |
| canonical | https://www.grlhood.in/ | Correct |
| H1 | GRLHOOD(tm) | Single H1 -- good, but not keyword-rich |
| meta robots | Not set | OK -- defaults to index,follow |

### Product Page (/products/muse)
| Tag | Value | Assessment |
|-----|-------|------------|
| title | Muse -- Phone Case \| GRL(R) -- GRLHOOD(tm) | Good format with keyword, ~43 chars |
| meta description | "Muse by GRL(R). Not basic. Never basic. Premium protection meets aesthetic design. Starting Rs.849. Free shipping India." | Excellent -- price, brand, keywords |
| canonical | https://www.grlhood.in/products/muse | Correct |
| H1 | Muse | Correct single H1 |

### Collection Page (/collections/all)
| Tag | Value | Assessment |
|-----|-------|------------|
| title | Products -- GRLHOOD(tm) | Functional but generic |
| meta description | "Products -- aesthetic, protective, and anything but basic. Shop GRL(R) phone cases. Free shipping India." | Good |
| canonical | https://www.grlhood.in/collections/all | Correct |
| H1 | **MISSING** | No H1 tag -- critical SEO issue |

---

## 4. Open Graph and Social Tags

### Homepage
The parse_html extraction found well-configured custom OG tags:
- **og:title:** "GRL(R) | Aesthetic Phone Cases That Aren't Boring" -- excellent
- **og:description:** "Phone cases for women who treat their phone as fashion. 100+ designer covers..." -- good
- **og:image:** Proper HTTPS URL with dimensions (2000x2000)
- **og:locale:** en_IN
- **og:type:** website
- **twitter:site:** @grlhood.in
- **twitter:image:** Present with HTTPS

However, the social_meta.py script (fetching live via HTTP headers/first-match) saw Shopify's default meta tags with `og:title: "GRLHOOD(tm)"` and `og:description: "GRLHOOD(tm)"` (both too short, 8 chars). This means **Shopify's default OG tags may appear before the custom ones** in the HTML head. Some crawlers take the first occurrence.

### Product Page
- **og:type:** product (correct)
- **og:price:amount:** 599, **og:price:currency:** INR -- excellent for rich previews
- **og:locale:** en_IN
- **twitter:site:** @grlhood.in
- **Issue:** og:image and twitter:image use protocol-relative URL (`//www.grlhood.in/...`) instead of absolute `https://...`. Some platforms may not resolve this.

### Collection Page
- All OG tags present with good values
- **Issue:** twitter:image missing entirely
- **Issue:** og:image uses `http://` instead of `https://`

---

## 5. Robots.txt

**Status:** Present and functional

**Sitemaps:** 3 references all pointing to https://www.grlhood.in/sitemap.xml (duplicated)

**User-Agent Rules:**
- `*`: 44 disallow rules (standard Shopify blocks for /admin, /cart, /checkout, etc.)
- `adsbot-google`: 15 disallow rules
- `Nutch`: Fully blocked
- `AhrefsBot` / `AhrefsSiteAudit`: 44 disallow + 10s crawl delay
- `MJ12bot`: 10s crawl delay
- `Pinterest`: 1s crawl delay

**AI Crawler Management:**
11 AI crawlers NOT explicitly managed (inherit `*` rules):
GPTBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, Bytespider, CCBot, anthropic-ai, FacebookBot, Amazonbot

These bots inherit the `*` disallow rules, which block Shopify internal pages but allow product/collection/homepage crawling. This is likely the desired behavior but should be made explicit.

---

## 6. llms.txt

**Status: NOT FOUND (HTTP 404)**

The live check at https://www.grlhood.in/llms.txt returns 404. Also checked llms-full.txt -- not found.

Shopify does not natively serve arbitrary .txt files from the root domain. The file may need to be:
- Uploaded as a Shopify asset and proxied via a URL redirect
- Served through a Shopify app or custom proxy
- Hosted externally and redirected

---

## 7. Security Headers

**Score: 80/100**

| Header | Status | Value |
|--------|--------|-------|
| HTTPS | Present | Enforced |
| Strict-Transport-Security | Present | max-age=7889238 (~91 days) |
| Content-Security-Policy | Present | block-all-mixed-content; frame-ancestors 'none'; upgrade-insecure-requests |
| X-Frame-Options | Present | DENY |
| X-Content-Type-Options | Present | nosniff |
| Referrer-Policy | **Missing** | -- |
| Permissions-Policy | **Missing** | -- |

**Issues:**
- HSTS max-age is ~91 days; recommended minimum is 31536000 (1 year)
- HSTS missing `includeSubDomains` directive
- Referrer-Policy and Permissions-Policy missing

Note: These headers are controlled by Shopify infrastructure. Limited configurability available to store owners.

---

## 8. Redirect Chains

**All clean:**
- Homepage: Direct 200 response (216ms)
- Product page: Direct 200 response (174ms)
- No redirect hops detected on any tested URL

---

## 9. Broken Links

**26 broken links found on homepage**

### Critical: Internal 404s (19 links) -- "-copy" Product Slugs

These are products with `-copy` in the URL slug. They appear in the homepage bestsellers/featured section but the underlying products have been deleted or renamed:

| Broken URL | Anchor Text | Status |
|-----------|-------------|--------|
| /products/blush-moo-copy-copy | Glaze | 404 |
| /products/muse-copy | Agente | 404 |
| /products/blush-moo-copy | Crown | 404 |
| /products/shed-copy | Soft Chaos | 404 |
| /products/status-copy | Cloud | 404 |
| /products/glaze-copy | Grace | 404 |
| /products/flayer-vision-copy | Player | 404 |
| /products/cloud-copy | Flourish | 404 |
| /products/grluxe-copy | Plot | 404 |
| /products/soft-chaos-copy | Status | 404 |
| /products/scrawl-copy | Shed | 404 |
| /products/player-copy | Cold | 404 |
| /products/flourish-copy | GRLUXE | 404 |
| /products/grace-copy | Legit | 404 |
| /products/cold-copy | Crossing | 404 |
| /products/onyx-copy | Wild Starz | 404 |
| /products/sheen-copy | Devotion | 404 |
| /products/noir-copy | glitz | 404 |
| /products/lva-music-copy | Amor Acta | 404 |

### Auth-Required Pages (4 links) -- False Positives
| URL | Status | Notes |
|-----|--------|-------|
| /account | 406 | Requires authentication |
| /account/addresses | 406 | Requires authentication |
| /customer_authentication/redirect | 406 | Auth redirect |
| /customer_authentication/login | 403 | Auth page |

### External (3 links) -- False Positives
| URL | Status | Notes |
|-----|--------|-------|
| shopify.com/.../account/orders | 406 | Shopify account page |
| instagram.com/grlhood.in/ | 403 | Instagram blocks bots |
| instagram.com/grlhood.in | 403 | Instagram blocks bots |

---

## 10. Internal Link Structure

**Crawl Stats:** 51 pages crawled, 114 unique pages found, 836 total internal links, max depth 2

**Links per page:** min=17, max=41, avg=22.0

**Orphan Pages:** 53 pages with only 1 internal link pointing to them. Most are the `-copy` product URLs (which are also 404s). `/collections/all` also only has 1 incoming link.

**Anchor Text Issues:**
- 38 links have no anchor text (image-only links or icon buttons)
- Top anchor texts are heavily repeated across all pages: "ALL GRL(R) CASES" (38x), "Contact Us" (38x), navigation items

---

## 11. Image SEO

| Page | Total Images | Missing Alt | Missing Alt % |
|------|-------------|-------------|---------------|
| Homepage | 205 | 23 | 11.2% |
| Product (Muse) | 71 | 29 | 40.8% |
| Collection (All) | 146 | 13 | 8.9% |

**Common Issues:**
- Logo images use empty alt (`alt=""`) -- should have "GRL phone cases" or similar
- Navigation collection card images (AMORE_COLLECTION_CARD.jpg, etc.) have `alt: null` across all pages
- Product images on the product page have good descriptive alt text ("Muse -- Mobile Accessories by GRL(R)")
- Many images lack explicit `width`/`height` attributes (causes Cumulative Layout Shift)
- Lazy loading is inconsistently applied

Note: The user mentioned 507 images had alt text added. The remaining missing-alt images appear to be in shared theme elements (navigation, footer, collection cards) rather than product images.

---

## 12. Heading Structure

### Homepage
- **H1:** "GRLHOOD(tm)" -- single, correct, but not keyword-rich
- **H2:** Mostly UI elements: "Country/Region" (x2), "Account" (x2), "Your cart is empty", "grlbestsellers", "Search"
- **H3:** Product names (Amore, Wild, Coquette, etc.) -- 36 H3s used for product cards

Issues: H2 tags are wasted on UI elements. "grlbestsellers" is the only content-related H2.

### Product Page
- **H1:** "Muse" -- correct single H1
- **H2:** Mix of UI and content ("Buy 3 . Pay for 2", "Trusted By The Community")
- **H3:** "Muse", "You may also like", collection names

### Collection Page
- **H1: MISSING** -- critical. Collection pages should have an H1 like "All Phone Cases" or "Shop All GRL(R) Cases"
- **H2:** All UI elements

---

## 13. Readability

### Homepage
- Word count: 338 (thin, but normal for visual e-commerce homepage)
- Flesch Reading Ease: 0 (artifact -- mostly product names, not prose)
- Assessment: Acceptable for the page type

### Product Page
- Word count: 1,031 (good depth)
- Flesch Reading Ease: 60.2 (standard readability)
- Flesch-Kincaid Grade: 8.9 (7th-8th grade -- ideal for e-commerce)
- Average sentence length: 16.4 words (within 15-20 target)
- Assessment: Good readability

---

## 14. Crawlability and Indexability Summary

| Check | Status |
|-------|--------|
| robots.txt | Present, well-structured |
| Sitemap | Referenced (triplicated reference to same URL) |
| Canonical tags | Correct on all 3 pages tested |
| meta robots | Not set (defaults to index,follow) |
| Redirect chains | None |
| HTTPS | Enforced |
| Hreflang | Not present (single-language site -- acceptable) |
| Response times | 174-216ms (good) |
