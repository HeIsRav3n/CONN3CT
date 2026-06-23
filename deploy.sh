#!/usr/bin/env bash
set -e

echo "==> Pulling latest code..."
git pull

echo "==> Installing dependencies..."
npm ci --omit=dev

echo "==> Running DB migrations..."
npx prisma migrate deploy

echo "==> Building TypeScript..."
npm run build

echo "==> Restarting bot via PM2..."
pm2 startOrRestart ecosystem.config.js --update-env

echo "==> Saving PM2 process list..."
pm2 save

echo "==> Done. Bot status:"
pm2 status conn3ct
