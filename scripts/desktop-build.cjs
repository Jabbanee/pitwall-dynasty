#!/usr/bin/env node
// Pitwall Dynasty — desktop build orchestrator.
// Verifies the renderer build exists and prints instructions for
// packaging. The actual packaging step is performed by
// `desktop-package.cjs` (which wraps `electron-builder`).

const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const distIndex = path.join(root, 'dist', 'index.html')

if (!fs.existsSync(distIndex)) {
  console.error('[desktop-build] dist/index.html missing. Run `npm run build` first.')
  process.exit(1)
}
console.log('[desktop-build] dist/ present. OK.')
console.log('[desktop-build] Run `npm run desktop:package` to produce the Windows installer.')
