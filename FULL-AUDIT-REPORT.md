# GRLHOOD.in — Full SEO Audit Report

**Audit Date**: 2026-04-04
**URL**: https://www.grlhood.in
**Platform**: Shopify (Horizon theme)
**Overall Score**: 28/100 — 🔴 Critical

---

## Score Breakdown

| Category | Weight | Score | Rating |
|----------|--------|-------|--------|
| Technical SEO | 25% | 35/100 | Poor |
| Content Quality | 20% | 15/100 | Critical |
| On-Page SEO | 15% | 20/100 | Critical |
| Schema / Structured Data | 15% | 0/100 | Critical |
| Performance (CWV) | 10% | N/A | Could not test (API 403) |
| Image Optimization | 10% | 10/100 | Critical |
| AI Search Readiness (GEO) | 5% | 5/100 | Critical |

---

## 1. Technical SEO (35/100)

### 🔴 Critical: Near-Zero Google Indexing
- **Evidence**: `site:grlhood.in` returns only 1 result (homepage)
- **Impact**: Google cannot find or rank any product, collection, or blog pages
- **Fix**: Submit sitemap to GSC, request indexing for all key pages, set up IndexNow

### ✅ Pass: robots.txt Properly Configured
- **Evidence**: Standard Shopify robots.txt — blocks admin, checkout, cart (correct)
- Sitemap declared: `https://www.grlhood.in/sitemap.xml`
- Does NOT block product, collection, or blog pages
- 44 disallow rules are standard Shopify patterns (checkout, accounts, search params)

### ✅ Pass: Clean Redirect Chain
- **Evidence**: `https://www.grlhood.in` → 200 OK (226ms, zero hops)

### ✅ Pass: HTTPS + Security Headers (80/100)
- HSTS, CSP, X-Frame-Options, X-Content-Type-Options all present
- ⚠️ Missing: Referrer-Policy, Permissions-Policy
- ⚠️ HSTS max-age too low (7.9M seconds vs recommended 31.5M)

### ⚠️ Warning: Canonical URL Issues
- **Evidence**: Homepage canonical is correct (`https://www.grlhood.in/`)
- Product canonical: `https://www.grlhood.in/products/blush-moo-copy-copy` (ugly slug)
- **Fix**: Clean up product URL slugs — remove "copy" suffixes

### ⚠️ Warning: 10 Orphan Pages Found
- **Evidence**: 10 product pages with only 1 internal link, all with "-copy" in URLs:
  - `/products/hell-archive-copy`
  - `/products/muse-copy-1`
  - `/products/pretty-predator-copy`
  - `/products/shooting-starz-copy`
  - `/products/ethereal-copy`
  - `/products/velina-copy`
  - `/products/vermilion-copy`
  - `/products/ivory-copy`
  - `/products/crossing-copy`
  - `/products/blush-moo-copy-copy` (double copy!)
- **Impact**: Orphan pages waste crawl budget and look unprofessional
- **Fix**: Clean up URL slugs, add internal links from collections

### ⚠️ Warning: AI Crawler Management Missing
- **Evidence**: 11 AI crawlers not explicitly managed in robots.txt
- GPTBot, ClaudeBot, PerplexityBot, Google-Extended — all inherit default rules
- **Impact**: No control over AI training data usage
- **Fix**: Add explicit Allow/Disallow rules for AI crawlers

---

## 2. Content Quality (15/100)

### 🔴 Critical: No Meta Descriptions
- **Homepage**: No `<meta name="description">` tag — Google will auto-generate
- **Product pages**: No meta descriptions (tested: "Glaze" product — null)
- **Collection pages**: Wild Collection has one ✅ ("Unapologetically bold...")
- **Impact**: Google shows random snippets; low CTR in search results
- **Fix**: Add unique GRL® voice meta descriptions to every page

### 🔴 Critical: Thin Content on Homepage
- **Evidence**: Only 330 words, Flesch Reading Ease: 0 (extremely difficult)
- Average sentence length: 165 words (target: 15-20)
- **Impact**: Google sees thin content; users bounce
- **Fix**: Add homepage content blocks (brand story, collection descriptions, USPs)

### 🔴 Critical: No Blog Content
- **Evidence**: Blog sitemap exists but no blog posts indexed or linked from homepage
- **Impact**: Zero informational keyword coverage; no topical authority
- **Fix**: Launch blog with 4 foundation posts (see Action Plan)

### ⚠️ Warning: Poor Title Tags
- **Homepage**: `GRLHOOD™` — too short, no keywords
- **Product page**: `Glaze – GRLHOOD™` — no phone model, no "case"/"cover"
- **Collection**: `Wild Collection - Bold Phone Cases for Women | GRLHOOD – GRLHOOD™` — duplicated brand name
- **Fix**: Rewrite all titles with keyword-first approach

### ⚠️ Warning: H1 Structure Issues
- **Homepage H1**: `GRLHOOD™` — no keywords
- **Collection pages**: No H1 tag at all
- **Product pages**: H1 is just product name ("Glaze") — no phone model, no "case"
- **Fix**: Add keyword-rich H1 tags to all page types

### ⚠️ Warning: H2/H3 Misuse
- H2 tags used for UI elements: "Country/Region", "Account", "Your cart is empty", "Search", "Filter"
- H3 tags used for collection names in footer navigation
- **Impact**: Heading hierarchy is broken; confuses search engines
- **Fix**: Reserve H2/H3 for content headings, use div/span for UI

---

## 3. On-Page SEO (20/100)

### 🔴 Critical: Product URLs Are Broken
- **Evidence**: Multiple products have "-copy" and "-copy-copy" suffixes
  - `blush-moo-copy-copy`, `cloud-copy`, `cold-copy`, `crossing-copy`
- **Impact**: Ugly URLs, duplicate content risk, poor user experience
- **Fix**: Clean all product URLs via Shopify admin + set up 301 redirects

### 🔴 Critical: Collection URLs Not SEO-Optimized
- **Evidence**: Current collections are brand-named, not keyword-targeted:
  - `/collections/wild-collection` (no "phone cases" keyword)
  - `/collections/la-muse-copy` (has "copy" suffix)
  - `/collections/the-zodiac-collection-copy-1` (copy-1 suffix)
- **Missing keyword-targeted collections**: No `/collections/girl-phone-cases`, `/collections/aesthetic-phone-cases`, `/collections/iphone-cases`
- **Fix**: Create 13 keyword-targeted collections (see Action Plan)

### ⚠️ Warning: No Internal Linking Strategy
- **Evidence**: 204 internal links across 11 pages, but mostly navigation links
- Only 5 unique collection paths found on homepage
- No cross-linking between related products or collections
- **Fix**: Add "Related Collections" and "You May Also Like" sections

### ⚠️ Warning: Social Meta Tags Incomplete (69/100)
- OG title: `GRLHOOD™` (too short, min 10 chars)
- OG description: `GRLHOOD™` (too short, min 50 chars)
- OG image: Uses HTTP not HTTPS
- Twitter image: Missing
- Twitter site: Missing
- **Fix**: Add proper OG/Twitter tags with keyword-rich descriptions

---

## 4. Schema / Structured Data (0/100)

### 🔴 Critical: ZERO JSON-LD Schema on Any Page
- **Evidence**: Searched homepage, collection page, product page — no `<script type="application/ld+json">` found anywhere
- **Impact**: No rich snippets in Google (no star ratings, no price, no availability)
- Competitors (Peeperly, DailyObjects) show rich snippets = higher CTR
- **Fix**: Add Organization, Product, BreadcrumbList, CollectionPage, WebSite schemas

---

## 5. Image Optimization (10/100)

### 🔴 Critical: All Images Missing Alt Text
- **Evidence**: Every image on homepage has `alt=""` or `alt=null`
  - Logo images: `alt=""`
  - Collection card images: `alt=null`
  - Product images: `alt=null`
- **Impact**: Google Image Search cannot index images; accessibility failure
- **Fix**: Add descriptive alt text with keywords to all images

### ⚠️ Warning: No Lazy Loading on Above-the-Fold Images
- **Evidence**: Logo and hero images have `loading=null` instead of `loading="lazy"` for below-fold
- **Fix**: Add `loading="lazy"` to below-fold images, keep above-fold eager

### ⚠️ Warning: Images Not Optimized
- Images served from Shopify CDN with `?height=` parameter (good)
- But no WebP format enforcement visible
- **Fix**: Ensure Shopify serves WebP where supported

---

## 6. AI Search Readiness / GEO (5/100)

### 🔴 Critical: No llms.txt File
- **Evidence**: `llms.txt` check returned 503 error
- **Impact**: AI assistants have no structured info about GRL® brand
- **Fix**: Create `/llms.txt` with brand info, product categories, key pages

### ⚠️ Warning: No AI Crawler Policy
- **Evidence**: 11 AI crawlers not explicitly managed
- **Impact**: No control over how AI engines use GRL® content
- **Fix**: Add explicit AI crawler rules to robots.txt

### ⚠️ Warning: Content Not AEO-Optimized
- No FAQ sections on product/collection pages
- No structured Q&A content
- No "People Also Ask" targeting
- **Fix**: Add FAQ content blocks, target conversational queries

---

## Environment Limitations

- PageSpeed Insights API returned 403 (rate limited) — CWV scores could not be measured
- Social meta check returned 503 on first attempt (succeeded on retry)
- llms.txt check returned 503

---

## Summary: Top 5 Critical Issues

1. **Near-zero indexing** — Google only knows the homepage exists
2. **Zero structured data** — No JSON-LD schema on any page = no rich snippets
3. **No meta descriptions** — Google generates random snippets = low CTR
4. **Broken product URLs** — "-copy" and "-copy-copy" suffixes everywhere
5. **No content strategy** — Thin homepage, no blog, no keyword-targeted collections
