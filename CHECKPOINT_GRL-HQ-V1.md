# GRL-HQ-V1 Checkpoint

**Created:** February 5, 2026, 07:59 AM IST  
**Git Tag:** `GRL-HQ-V1`  
**Commit:** `760a6b8`

## System State

### ✅ Features Implemented
- **Label Generation System**: Bulk label generation for Shopify orders via Shiprocket
- **Product Dimensions**: All products updated with 8×5×2 cm, 150g (CASES package)
- **Dashboard UI**: Premium gradient design with animations, real-time job tracking
- **Risk Validation**: High RTO risk detection and CSV export
- **Authentication**: Shopify OAuth + Shiprocket token-based auth

### 📦 Product Configuration
- **113 products** (278 variants) updated
- Dimensions: 8×5×2 cm
- Weight: 150g (0.15 kg)
- Upsell collection: Excluded

### 🔧 Key Components
- [`src/server.js`](file:///Users/anshsingh/.gemini/antigravity/scratch/shopify-fulfillment-v3/src/server.js) - Main server with job queue
- [`src/shiprocket.js`](file:///Users/anshsingh/.gemini/antigravity/scratch/shopify-fulfillment-v3/src/shiprocket.js) - Shiprocket API integration
- [`src/shopify.js`](file:///Users/anshsingh/.gemini/antigravity/scratch/shopify-fulfillment-v3/src/shopify.js) - Shopify GraphQL API
- [`frontend/src/App.jsx`](file:///Users/anshsingh/.gemini/antigravity/scratch/shopify-fulfillment-v3/frontend/src/App.jsx) - React dashboard

## How to Revert

```bash
# View all tags
git tag -l

# Revert to this version
git checkout GRL-HQ-V1

# Or create a new branch from this tag
git checkout -b restore-grl-hq-v1 GRL-HQ-V1

# Or reset current branch to this tag (⚠️  destructive)
git reset --hard GRL-HQ-V1
```

## Environment
- **Node.js**: v22+
- **PM2**: Process manager for server
- **Port**: 3001 (frontend + backend unified)
- **Dependencies**: axios, express, framer-motion, lucide-react, tailwindcss

## Known Limitations
- Shiprocket API doesn't support dimension updates for channel orders via public API
- Package selection ("CASES" vs "Store default") cannot be changed programmatically
- Metafields and weight are set correctly for new order sync

## Next Steps
If resuming development:
1. Test new order sync with Shiprocket (verify 8×5×2 dimensions appear)
2. Consider browser automation for bulk package selection if needed
3. Monitor label generation success rate
