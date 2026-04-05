#!/bin/bash
set -e

echo "Building frontend..."
cd frontend && npm install && npm run build
cd ..

echo "Starting backend..."
cd backend && npm install && npm run build && node dist/index.js
