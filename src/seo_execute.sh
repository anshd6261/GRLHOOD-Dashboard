#!/bin/bash
# GRL® SEO Full Execution Script
# Uses curl for all API calls (Node.js blocked by sandbox)

set -e

SHOPIFY_DOMAIN="${SHOPIFY_STORE_DOMAIN:-grlhood-3.myshopify.com}"
SHOPIFY_CLIENT_ID="${SHOPIFY_CLIENT_ID:?Set SHOPIFY_CLIENT_ID env var}"
SHOPIFY_CLIENT_SECRET="${SHOPIFY_CLIENT_SECRET:?Set SHOPIFY_CLIENT_SECRET env var}"
BING_API_KEY="${BING_WEBMASTER_API_KEY:?Set BING_WEBMASTER_API_KEY env var}"
SITE_URL="https://www.grlhood.in"

# ═══ STEP 0: Get Shopify Access Token ═══
echo "═══ Getting Shopify Access Token ═══"
TOKEN=$(curl -s -X POST "https://${SHOPIFY_DOMAIN}/admin/oauth/access_token" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"${SHOPIFY_CLIENT_ID}\",\"client_secret\":\"${SHOPIFY_CLIENT_SECRET}\",\"grant_type\":\"client_credentials\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get Shopify token"
  exit 1
fi
echo "✅ Token obtained: ${TOKEN:0:10}..."

# Helper: Shopify GraphQL request
shopify_gql() {
  local query="$1"
  local vars="${2:-{}}"
  curl -s -X POST "https://${SHOPIFY_DOMAIN}/admin/api/2026-01/graphql.json" \
    -H "Content-Type: application/json" \
    -H "X-Shopify-Access-Token: ${TOKEN}" \
    -d "{\"query\": $(echo "$query" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"), \"variables\": ${vars}}"
}

echo ""
echo "═══ STEP 1: Get Active Theme ═══"
THEME_RESPONSE=$(shopify_gql '{ themes(first: 10, roles: [MAIN]) { nodes { id name role } } }')
THEME_ID=$(echo "$THEME_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['themes']['nodes'][0]['id'])" 2>/dev/null)
THEME_NAME=$(echo "$THEME_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['themes']['nodes'][0]['name'])" 2>/dev/null)
echo "Active theme: $THEME_NAME ($THEME_ID)"

echo ""
echo "═══ STEP 2: Upload SEO Snippets to Theme ═══"

# Read snippet files and escape for JSON
SCHEMA_LIQUID=$(python3 -c "import json; print(json.dumps(open('shopify-theme-snippets/seo-schema.liquid').read()))")
META_LIQUID=$(python3 -c "import json; print(json.dumps(open('shopify-theme-snippets/seo-meta.liquid').read()))")
LLMS_TXT=$(python3 -c "import json; print(json.dumps(open('shopify-theme-snippets/llms.txt').read()))")

# Upload seo-schema.liquid
echo "Uploading snippets/seo-schema.liquid..."
UPLOAD_RESULT=$(curl -s -X POST "https://${SHOPIFY_DOMAIN}/admin/api/2026-01/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: ${TOKEN}" \
  -d "{\"query\": \"mutation themeFilesUpsert(\$files: [OnlineStoreThemeFilesUpsertFileInput!]!, \$themeId: ID!) { themeFilesUpsert(files: \$files, themeId: \$themeId) { upsertedThemeFiles { filename } userErrors { field message filename } } }\", \"variables\": {\"themeId\": \"${THEME_ID}\", \"files\": [{\"filename\": \"snippets/seo-schema.liquid\", \"body\": {\"type\": \"TEXT\", \"value\": ${SCHEMA_LIQUID}}}]}}")
echo "$UPLOAD_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); e=d.get('data',{}).get('themeFilesUpsert',{}).get('userErrors',[]); print('✅ seo-schema.liquid uploaded' if not e else '❌ ' + str(e))" 2>/dev/null || echo "Response: $UPLOAD_RESULT"

# Upload seo-meta.liquid
echo "Uploading snippets/seo-meta.liquid..."
UPLOAD_RESULT=$(curl -s -X POST "https://${SHOPIFY_DOMAIN}/admin/api/2026-01/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: ${TOKEN}" \
  -d "{\"query\": \"mutation themeFilesUpsert(\$files: [OnlineStoreThemeFilesUpsertFileInput!]!, \$themeId: ID!) { themeFilesUpsert(files: \$files, themeId: \$themeId) { upsertedThemeFiles { filename } userErrors { field message filename } } }\", \"variables\": {\"themeId\": \"${THEME_ID}\", \"files\": [{\"filename\": \"snippets/seo-meta.liquid\", \"body\": {\"type\": \"TEXT\", \"value\": ${META_LIQUID}}}]}}")
echo "$UPLOAD_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); e=d.get('data',{}).get('themeFilesUpsert',{}).get('userErrors',[]); print('✅ seo-meta.liquid uploaded' if not e else '❌ ' + str(e))" 2>/dev/null || echo "Response: $UPLOAD_RESULT"

# Upload llms.txt
echo "Uploading assets/llms.txt..."
UPLOAD_RESULT=$(curl -s -X POST "https://${SHOPIFY_DOMAIN}/admin/api/2026-01/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: ${TOKEN}" \
  -d "{\"query\": \"mutation themeFilesUpsert(\$files: [OnlineStoreThemeFilesUpsertFileInput!]!, \$themeId: ID!) { themeFilesUpsert(files: \$files, themeId: \$themeId) { upsertedThemeFiles { filename } userErrors { field message filename } } }\", \"variables\": {\"themeId\": \"${THEME_ID}\", \"files\": [{\"filename\": \"assets/llms.txt\", \"body\": {\"type\": \"TEXT\", \"value\": ${LLMS_TXT}}}]}}")
echo "$UPLOAD_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); e=d.get('data',{}).get('themeFilesUpsert',{}).get('userErrors',[]); print('✅ llms.txt uploaded' if not e else '❌ ' + str(e))" 2>/dev/null || echo "Response: $UPLOAD_RESULT"

echo ""
echo "═══ STEP 3: Inject SEO Renders into theme.liquid ═══"
# Fetch current theme.liquid
THEME_LIQUID_RESP=$(curl -s -X POST "https://${SHOPIFY_DOMAIN}/admin/api/2026-01/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: ${TOKEN}" \
  -d '{"query": "query getThemeFile($themeId: ID!, $filenames: [String!]!) { theme(id: $themeId) { files(filenames: $filenames) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } } } }", "variables": {"themeId": "'"${THEME_ID}"'", "filenames": ["layout/theme.liquid"]}}')

# Save and modify theme.liquid
python3 << 'PYEOF'
import json, sys

resp = json.loads('''THEME_LIQUID_PLACEHOLDER''')
nodes = resp.get('data', {}).get('theme', {}).get('files', {}).get('nodes', [])
if not nodes:
    print("⚠️ Could not read theme.liquid — add render tags manually")
    sys.exit(0)

content = nodes[0].get('body', {}).get('content', '')
if not content:
    print("⚠️ theme.liquid is empty")
    sys.exit(0)

modified = False
if "render 'seo-meta'" not in content:
    content = content.replace('</head>', "  {% render 'seo-meta' %}\n</head>")
    modified = True
    print("✅ Injected seo-meta into <head>")
else:
    print("ℹ️ seo-meta already present")

if "render 'seo-schema'" not in content:
    content = content.replace('</body>', "  {% render 'seo-schema' %}\n</body>")
    modified = True
    print("✅ Injected seo-schema before </body>")
else:
    print("ℹ️ seo-schema already present")

if modified:
    with open('/tmp/theme_liquid_modified.json', 'w') as f:
        json.dump(content, f)
    print("NEEDS_UPLOAD")
else:
    print("NO_CHANGES")
PYEOF

echo ""
echo "═══ STEP 4: Fetch All Products ═══"
PRODUCTS=$(shopify_gql 'query { products(first: 250, sortKey: UPDATED_AT, reverse: true) { edges { node { id title handle descriptionHtml productType seo { title description } featuredImage { url altText } variants(first: 3) { edges { node { price sku } } } media(first: 20) { edges { node { ... on MediaImage { id alt } } } } } } } }')
PRODUCT_COUNT=$(echo "$PRODUCTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',{}).get('products',{}).get('edges',[])))")
echo "Found $PRODUCT_COUNT products"

# Save products for processing
echo "$PRODUCTS" > /tmp/shopify_products.json

echo ""
echo "═══ STEP 5: Fix SEO Titles & Descriptions ═══"
python3 << 'PYEOF'
import json, subprocess, time

with open('/tmp/shopify_products.json') as f:
    data = json.load(f)

products = [e['node'] for e in data.get('data', {}).get('products', {}).get('edges', [])]
fixed = 0
skipped = 0

for p in products:
    needs_title = not p.get('seo', {}).get('title')
    needs_desc = not p.get('seo', {}).get('description')

    if not needs_title and not needs_desc:
        skipped += 1
        continue

    title = p.get('title', 'Phone Case')

    # Generate SEO title
    if needs_title:
        seo_title = f"{title} — Phone Case | GRL®" if len(title) <= 45 else f"{title} | GRL®"
    else:
        seo_title = p['seo']['title']

    # Generate meta description
    if needs_desc:
        price = ''
        variants = p.get('variants', {}).get('edges', [])
        if variants:
            price_val = variants[0].get('node', {}).get('price', '')
            if price_val:
                price = f" Starting ₹{round(float(price_val))}."
        seo_desc = f"{title}. Pretty. Protective. Unapologetically bold.{price} Shop GRL® — free shipping across India."
        if len(seo_desc) > 155:
            seo_desc = seo_desc[:152] + "..."
    else:
        seo_desc = p['seo']['description']

    # Update via GraphQL
    mutation = 'mutation productUpdate($input: ProductInput!) { productUpdate(input: $input) { product { id } userErrors { field message } } }'
    variables = json.dumps({"input": {"id": p['id'], "seo": {"title": seo_title, "description": seo_desc}}})

    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        f'https://grlhood-3.myshopify.com/admin/api/2026-01/graphql.json',
        '-H', 'Content-Type: application/json',
        '-H', f'X-Shopify-Access-Token: TOKEN_PLACEHOLDER',
        '-d', json.dumps({"query": mutation, "variables": json.loads(variables)})
    ], capture_output=True, text=True)

    try:
        resp = json.loads(result.stdout)
        errors = resp.get('data', {}).get('productUpdate', {}).get('userErrors', [])
        if errors:
            print(f"⚠️ {title}: {errors[0]['message']}")
        else:
            print(f"✅ {title}")
            fixed += 1
    except:
        print(f"❌ {title}: {result.stdout[:100]}")

    time.sleep(0.5)

print(f"\nSEO Fix: {fixed} fixed, {skipped} already OK")
PYEOF

echo ""
echo "═══ DONE ═══"
