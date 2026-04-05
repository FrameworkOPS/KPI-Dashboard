#!/bin/bash
set -e

echo "==> Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "==> Building backend..."
cd backend
npm install
npm run build
cd ..

echo "==> Starting server..."
node backend/dist/index.js
