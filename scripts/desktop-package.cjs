#!/usr/bin/env node
// Pitwall Dynasty — Windows installer builder.
// Uses `electron-builder` to produce:
//   - unpacked portable directory under dist-electron/win-unpacked
//   - NSIS-based installer under dist-electron/Pitwall Dynasty Setup <version>.exe

const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')

if (!fs.existsSync(path.join(root, 'node_modules', 'electron-builder', 'package.json'))) {
  console.error('[desktop-package] electron-builder not installed.')
  process.exit(1)
}

const args = [
  'electron-builder',
  '--win',
  'nsis',
  '--x64',
  '--publish=never',
]
if (process.argv.includes('--dir')) {
  args.push('--dir')
}

console.log('[desktop-package] Running: npx ' + args.join(' '))
const result = spawnSync('npx', args, {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
