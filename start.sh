#!/bin/bash
set -e

# nixpacks already compiled frontend + backend during the build phase.
# Just start the server.
echo "==> Starting KPI Dashboard..."
node backend/dist/index.js
