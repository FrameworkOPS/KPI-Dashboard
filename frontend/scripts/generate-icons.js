// Run with: node scripts/generate-icons.js
// Requires: npm install -g sharp (or use the inline SVG approach)
// This script is for reference — icons can also be generated via:
// https://realfavicongenerator.net or https://favicon.io

const fs = require('fs');
const path = require('path');

// Copy the SVG as fallback icons if PNGs don't exist
const svgContent192 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="32" fill="#0f172a"/>
  <rect x="30" y="108" width="30" height="54" rx="4" fill="#3b82f6"/>
  <rect x="78" y="72" width="30" height="90" rx="4" fill="#3b82f6"/>
  <rect x="126" y="36" width="30" height="126" rx="4" fill="#60a5fa"/>
</svg>`;

const svgContent512 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#0f172a"/>
  <rect x="80" y="288" width="80" height="144" rx="12" fill="#3b82f6"/>
  <rect x="208" y="192" width="80" height="240" rx="12" fill="#3b82f6"/>
  <rect x="336" y="96" width="80" height="336" rx="12" fill="#60a5fa"/>
</svg>`;

fs.writeFileSync(path.join(__dirname, '../public/icon-192.svg'), svgContent192);
fs.writeFileSync(path.join(__dirname, '../public/icon-512.svg'), svgContent512);
console.log('SVG icons generated');
