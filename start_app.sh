#!/bin/bash

# Shopify Fulfillment V2 - Startup Script

echo "=================================================="
echo "🚀 Initializing Shopify Fulfillment Dashboard..."
echo "=================================================="

# 1. Check and Install Backend Dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Backend Dependencies..."
    npm install
else
    echo "✅ Backend Dependencies found."
fi

# 2. Check and Install Frontend Dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "🎨 Installing Frontend Dependencies..."
    cd frontend
    npm install
    cd ..
else
    echo "✅ Frontend Dependencies found."
fi

# 3. Start the Application
echo "--------------------------------------------------"
echo "🌐 Starting Development Server..."
echo "--------------------------------------------------"
echo "The dashboard will be available at: http://localhost:5173"
echo "API Server will be running at: http://localhost:3001"
echo "Press Ctrl+C to stop."
echo "--------------------------------------------------"

# Run the dev command defined in package.json
npm run dev
