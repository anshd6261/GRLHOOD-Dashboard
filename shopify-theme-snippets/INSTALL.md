# GRL® SEO — Shopify Theme Installation Guide

## What's in this folder

| File | What it does | Where to install |
|------|-------------|-----------------|
| `seo-schema.liquid` | JSON-LD structured data (Organization, Product, Breadcrumb, Collection, Article) | Shopify Snippets |
| `seo-meta.liquid` | Title tags, meta descriptions, OG tags, Twitter cards, GA4 tracking | Shopify Snippets |
| `llms.txt` | AI search engine brand info (for ChatGPT, Perplexity, etc.) | Shopify theme root (`/public`) |

## Step-by-Step Installation

### 1. Upload Liquid Snippets

1. Go to **Shopify Admin** → **Online Store** → **Themes** → **Edit Code**
2. In the left sidebar, find the **Snippets** folder
3. Click **"Add a new snippet"**
4. Name it `seo-schema` and paste the contents of `seo-schema.liquid`
5. Click **"Add a new snippet"** again
6. Name it `seo-meta` and paste the contents of `seo-meta.liquid`
7. Click **Save**

### 2. Add Snippets to theme.liquid

1. In the theme editor, open **Layout** → **theme.liquid**
2. Find the `<head>` section
3. **Replace** the existing `<title>{{ page_title }}</title>` and any meta description tags with:
   ```liquid
   {% render 'seo-meta' %}
   ```
4. **Add** before the closing `</head>` tag:
   ```liquid
   {% render 'seo-schema' %}
   ```
5. **Add** `lang="en-IN"` to the `<html>` tag:
   ```html
   <html lang="en-IN" ...>
   ```
6. Click **Save**

### 3. Upload llms.txt

1. In the theme editor, go to **Assets** folder
2. Click **"Add a new asset"** → Upload `llms.txt`
3. Or: Go to **Settings** → **Files** → Upload `llms.txt`
4. The file should be accessible at `https://www.grlhood.in/llms.txt`

### 4. Set Vercel Environment Variables

In your **Vercel Dashboard** → **Project Settings** → **Environment Variables**, add:

```
BING_WEBMASTER_API_KEY = d2a8a096cae84090951a522f752550ca
GA4_MEASUREMENT_ID = G-9427C33TGQ
```

### 5. Run Bulk SEO Fix

After deploying to Vercel:
1. Open your GRLHOOD Dashboard
2. Go to the **SEO** tab
3. Click **Actions** → **FIX ALL SEO NOW**
4. This auto-fixes all missing product/collection titles + descriptions + submits sitemap to Bing

Or hit the API directly:
```
POST https://your-vercel-url.vercel.app/api/seo/fix-all
```

### 6. Verify

- [Google Rich Results Test](https://search.google.com/test/rich-results?url=https://www.grlhood.in) — should show Organization + Product schemas
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/?q=https://www.grlhood.in) — should show correct OG tags
- [Google Search Console](https://search.google.com/search-console) — submit sitemap.xml

## Automated Maintenance

A **Vercel cron job** runs every Monday at 3 AM UTC and automatically:
- Checks for new products without SEO titles/descriptions
- Auto-generates GRL® voice SEO metadata
- Resubmits sitemap to Bing

No manual work needed after initial setup.
