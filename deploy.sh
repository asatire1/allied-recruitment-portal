#!/bin/bash

echo "🚀 Allied Recruitment Portal - Full Deploy"
echo "==========================================="

# Install root dependencies
echo ""
echo "📦 Installing root dependencies..."
pnpm install

# Install functions dependencies
echo ""
echo "📦 Installing functions dependencies..."
cd functions
npm install
npm run build
cd ..

# Build the portal
echo ""
echo "🔨 Building the portal..."
pnpm build

# Deploy everything
echo ""
echo "🚀 Deploying to Firebase..."
firebase deploy

echo ""
echo "✅ Deploy complete!"
