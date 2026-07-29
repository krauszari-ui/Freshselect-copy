#!/bin/bash
set -e

echo "=== FreshSelect Meals: Vercel Build ==="

# 1. Build frontend with Vite (outputs to dist/public/)
echo "[1/6] Building frontend..."
npx vite build

# 2. Build local production server (outputs to dist/index.js)
echo "[2/6] Building local server..."
npx esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

# 3. Build Vercel serverless function (ESM bundle)
echo "[3/6] Building Vercel serverless function..."
mkdir -p .vercel/output/functions/api.func
npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --outfile=.vercel/output/functions/api.func/index.mjs \
  --alias:@shared=./shared \
  --alias:@=./client/src \
  --external:express \
  --external:@trpc/server \
  --external:@trpc/client \
  --external:bcryptjs \
  --external:cookie \
  --external:drizzle-orm \
  --external:drizzle-orm/mysql2 \
  --external:jose \
  --external:mysql2 \
  --external:resend \
  --external:superjson \
  --external:zod \
  --external:dotenv \
  --external:nanoid \
  --external:vite \
  --external:@aws-sdk/client-s3 \
  --external:@aws-sdk/s3-request-presigner \
  --external:axios \
  --external:xlsx \
  --external:@tailwindcss/* \
  --external:@vitejs/* \
  --external:@babel/* \
  --external:lightningcss \
  --external:tailwindcss \
  --external:svix

# 4. Create .vc-config.json for the serverless function
echo "[4/6] Creating Vercel function config..."
cat > .vercel/output/functions/api.func/.vc-config.json << 'EOF'
{
  "runtime": "nodejs20.x",
  "handler": "index.mjs",
  "launcherType": "Nodejs"
}
EOF

# ESM bundle needs package.json with type:module so Node treats .mjs correctly
cat > .vercel/output/functions/api.func/package.json << 'EOF'
{
  "type": "module"
}
EOF

# 5. Copy only required node_modules (not all 612MB)
echo "[5/6] Copying required dependencies..."
node scripts/copy-deps.mjs

# 6. Assemble the Build Output API structure
echo "[6/6] Assembling Vercel Build Output..."

# Clean and recreate static/ to avoid stale files from previous builds
rm -rf .vercel/output/static
mkdir -p .vercel/output/static

# Copy frontend assets to static/ (copy CONTENTS of dist/public, not the directory itself)
cp -r dist/public/. .vercel/output/static/

# Create the routing config
cat > .vercel/output/config.json << 'EOF'
{
  "version": 3,
  "routes": [
    {
      "src": "/assets/(.*)",
      "headers": {
        "cache-control": "public, max-age=31536000, immutable"
      },
      "continue": true
    },
    {
      "src": "/api/(.*)",
      "dest": "/api"
    },
    {
      "handle": "filesystem"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
EOF

echo ""
echo "=== Build complete! ==="
STATIC_SIZE=$(du -sh .vercel/output/static 2>/dev/null | cut -f1)
FUNC_SIZE=$(du -sh .vercel/output/functions/api.func 2>/dev/null | cut -f1)
echo "  .vercel/output/config.json          - Routing config"
echo "  .vercel/output/static/              - Frontend assets ($STATIC_SIZE)"
echo "  .vercel/output/functions/api.func/  - Serverless function ($FUNC_SIZE)"
