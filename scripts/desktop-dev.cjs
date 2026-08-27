#!/usr/bin/env node
// Pitwall Dynasty — desktop dev launcher.
// Starts Vite (if not already running) and launches Electron in dev
// mode. Electron loads the dev server URL, so HMR is preserved.

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const net = require('net')

const root = path.resolve(__dirname, '..')
const DEV_URL = process.env.PITWALL_DEV_URL || 'http://localhost:5173'
const url = new URL(DEV_URL)
const port = Number(url.port) || 5173

function waitForPort(port, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now()
    const tryOnce = () => {
      const sock = net.createConnection(port, '127.0.0.1')
      let done = false
      const finish = (ok) => { if (done) return; done = true; sock.destroy(); resolve(ok) }
      sock.once('connect', () => finish(true))
      sock.once('error', () => {
        finish(false)
        if (Date.now() - start > timeoutMs) return
        setTimeout(tryOnce, 300)
      })
    }
    tryOnce()
  })
}

async function main() {
  // Start Vite if port is free.
  let viteProc = null
  const portBusy = await waitForPort(port, 1500).catch(() => false)
  if (!portBusy) {
    const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
    if (fs.existsSync(viteBin)) {
      console.log('[desktop-dev] Starting Vite on port ' + port + '…')
      viteProc = spawn(process.execPath, [viteBin], {
        cwd: root,
        env: { ...process.env, BROWSER: 'none' },
        stdio: 'inherit',
      })
      viteProc.on('exit', (code) => {
        if (code != null) console.log('[desktop-dev] Vite exited with code ' + code)
      })
    } else {
      console.warn('[desktop-dev] Vite binary not found at ' + viteBin)
    }
  } else {
    console.log('[desktop-dev] Port ' + port + ' already in use; assuming Vite is running.')
  }

  // Wait for Vite to be ready.
  const ready = await waitForPort(port, 60_000)
  if (!ready) {
    console.error('[desktop-dev] Vite did not start within 60s. Aborting.')
    if (viteProc) viteProc.kill()
    process.exit(1)
  }
  console.log('[desktop-dev] Vite is ready. Launching Electron…')

  // Find Electron binary in node_modules.
  const electronPath = require('electron')
  if (!electronPath) {
    console.error('[desktop-dev] electron not installed. Run `npm install` first.')
    if (viteProc) viteProc.kill()
    process.exit(1)
  }

  const child = spawn(electronPath, ['.'], {
    cwd: root,
    env: { ...process.env, PITWALL_DEV_FORCE: '1' },
    stdio: 'inherit',
  })

  const cleanup = () => {
    try { child.kill() } catch (_) {}
    if (viteProc) {
      try { viteProc.kill() } catch (_) {}
    }
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  child.on('exit', (code) => {
    cleanup()
    process.exit(code ?? 0)
  })
}

main().catch((e) => {
  console.error('[desktop-dev] fatal', e)
  process.exit(1)
})
