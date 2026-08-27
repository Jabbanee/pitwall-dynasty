// Pitwall Dynasty — Electron main process
// Owns app lifecycle, window management, secure IPC, file-backed
// settings + saves, and the (optional) development Vite server.

const { app, BrowserWindow, ipcMain, shell, Menu, dialog, session, net } = require('electron')
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const { spawn } = require('child_process')

const isDev = !app.isPackaged
const projectRoot = path.resolve(__dirname, '..')

// Where the renderer is served from. In dev we boot Vite ourselves;
// in production we load the bundled dist/index.html.
const DEV_URL = process.env.PITWALL_DEV_URL || 'http://localhost:5173'

// Resolve the appData subdir used for saves/settings/logs. This is
// per-user and survives reinstalls, so it is the right place for
// mutable game data on Windows.
function userPath(...parts) {
  return path.join(app.getPath('userData'), ...parts)
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch (_) {}
}

function getLogFile() {
  const dir = userPath('logs')
  ensureDir(dir)
  return path.join(dir, 'pitwall.log')
}

function log(level, message, extra) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}` +
    (extra ? ' ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')
  try { fs.appendFileSync(getLogFile(), line + '\n') } catch (_) {}
  if (level === 'ERROR' || level === 'WARN') {
    // also surface to the console for dev
    // eslint-disable-next-line no-console
    console.error(line)
  }
}

// ----- Settings (desktop) -----
const SETTINGS_DEFAULT = Object.freeze({
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  radioVolume: 0.8,
  displayMode: 'windowed', // 'windowed' | 'borderless' | 'fullscreen'
  resolution: { width: 1920, height: 1080 },
  vsync: true,
  fpsLimit: 60, // 30, 60, 120, 144, 0 = unlimited
  graphicsQuality: 'high', // 'low' | 'medium' | 'high' | 'ultra'
  uiScale: 1.0,
  reducedMotion: false,
  multiplayerEndpoint: 'ws://localhost:8080',
  lastSaveSlot: null,
})

function settingsPath() { return userPath('settings.json') }
function readSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw)
    return { ...SETTINGS_DEFAULT, ...parsed }
  } catch (_) {
    return { ...SETTINGS_DEFAULT }
  }
}
function writeSettings(s) {
  try {
    const merged = { ...SETTINGS_DEFAULT, ...s }
    fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2))
    return merged
  } catch (e) {
    log('ERROR', 'Failed to write settings', e && e.message)
    return null
  }
}

// ----- Saves (desktop) -----
function savesDir() {
  const dir = userPath('saves')
  ensureDir(dir)
  return dir
}
function listSaves() {
  try {
    const files = fs.readdirSync(savesDir())
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const full = path.join(savesDir(), f)
        let meta = null
        try {
          const raw = fs.readFileSync(full, 'utf8')
          const env = JSON.parse(raw)
          const champ = env.championship
          if (champ) {
            const team = (champ.teams || []).find((t) => t.id === champ.playerTeamId)
            meta = {
              file: f,
              slot: f.replace(/\.json$/, ''),
              team: team ? team.name : 'Unknown',
              mode: champ.mode,
              season: champ.config && champ.config.season,
              round: champ.currentRoundIndex,
              roundCount: (champ.rounds || []).length,
              schema: env.schemaVersion,
              savedAt: env.savedAt,
            }
          }
        } catch (_) {}
        try {
          const stat = fs.statSync(full)
          return {
            ...(meta || { file: f, slot: f.replace(/\.json$/, ''), team: 'Unknown', mode: '?', season: 0, round: 0 }),
            size: stat.size,
            mtime: stat.mtimeMs,
          }
        } catch (_) {
          return meta || { file: f, slot: f.replace(/\.json$/, ''), team: 'Unknown', mode: '?', season: 0, round: 0 }
        }
      })
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
  } catch (e) {
    log('ERROR', 'Failed to list saves', e && e.message)
    return []
  }
}

async function atomicWriteFile(target, contents) {
  const dir = path.dirname(target)
  ensureDir(dir)
  const tmp = `${target}.tmp.${Date.now()}.${process.pid}`
  await fsp.writeFile(tmp, contents, 'utf8')
  await fsp.rename(tmp, target)
}

async function writeSave(slot, json) {
  if (!/^[a-zA-Z0-9_-]+$/.test(slot)) throw new Error('Invalid save slot name')
  const target = path.join(savesDir(), `${slot}.json`)
  await atomicWriteFile(target, json)
  return { ok: true, file: target }
}

async function readSave(slot) {
  if (!/^[a-zA-Z0-9_-]+$/.test(slot)) throw new Error('Invalid save slot name')
  const target = path.join(savesDir(), `${slot}.json`)
  try {
    const contents = await fsp.readFile(target, 'utf8')
    return { ok: true, contents, file: target }
  } catch (e) {
    if (e && e.code === 'ENOENT') return { ok: false, error: 'NOT_FOUND' }
    log('ERROR', 'Failed to read save', e && e.message)
    return { ok: false, error: 'READ_ERROR', message: e && e.message }
  }
}

async function deleteSave(slot) {
  if (!/^[a-zA-Z0-9_-]+$/.test(slot)) throw new Error('Invalid save slot name')
  const target = path.join(savesDir(), `${slot}.json`)
  try {
    await fsp.unlink(target)
    return { ok: true }
  } catch (e) {
    if (e && e.code === 'ENOENT') return { ok: true }
    return { ok: false, error: 'DELETE_ERROR', message: e && e.message }
  }
}

// ----- Single instance lock -----
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  log('WARN', 'Another instance is already running. Exiting this one.')
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// ----- Crash handling -----
process.on('uncaughtException', (err) => {
  log('ERROR', 'uncaughtException', err && err.stack ? err.stack : String(err))
})
process.on('unhandledRejection', (err) => {
  log('ERROR', 'unhandledRejection', err && err.stack ? err.stack : String(err))
})

// ----- Optional dev Vite server -----
let viteProc = null
function startVite() {
  try {
    const viteBin = path.resolve(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
    if (!fs.existsSync(viteBin)) {
      log('WARN', 'Vite binary not found at ' + viteBin + ' — running packaged renderer only.')
      return null
    }
    viteProc = spawn(process.execPath, [viteBin], {
      cwd: projectRoot,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (viteProc.stdout) viteProc.stdout.on('data', (b) => log('INFO', '[vite] ' + b.toString().trimEnd()))
    if (viteProc.stderr) viteProc.stderr.on('data', (b) => log('WARN', '[vite] ' + b.toString().trimEnd()))
    viteProc.on('exit', (code) => log('INFO', 'Vite exited with code ' + code))
    return viteProc
  } catch (e) {
    log('ERROR', 'Failed to start Vite', e && e.message)
    return null
  }
}

function waitForUrl(url, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now()
    const tryOnce = () => {
      const u = new URL(url)
      const req = net.request({ method: 'GET', url: `${u.protocol}//${u.host}/` })
      let done = false
      const finish = (ok) => { if (done) return; done = true; resolve(ok) }
      req.on('response', () => { finish(true); req.abort() })
      req.on('error', () => { finish(false); req.abort() })
      req.on('abort', () => {})
      setTimeout(() => {
        if (Date.now() - start > timeoutMs) { finish(false); return }
        tryOnce()
      }, 400)
      req.end()
    }
    tryOnce()
  })
}

// ----- Window management -----
let mainWindow = null

function createWindow() {
  const settings = readSettings()
  const isFullscreen = settings.displayMode === 'fullscreen'
  const isBorderless = settings.displayMode === 'borderless'
  const win = new BrowserWindow({
    width: settings.resolution.width,
    height: settings.resolution.height,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    backgroundColor: '#0a0c12',
    title: 'Pitwall Dynasty',
    fullscreen: isFullscreen,
    frame: !isBorderless,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  })
  // Suppress default menu in production. In dev, a minimal menu helps
  // the developer.
  if (!isDev) {
    Menu.setApplicationMenu(null)
  } else {
    Menu.setApplicationMenu(buildDevMenu())
  }

  win.once('ready-to-show', () => {
    win.show()
    log('INFO', 'Main window shown', { width: win.getBounds().width, height: win.getBounds().height })
  })

  // Block unexpected navigation away from the bundled/dev URL.
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(DEV_URL) : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      log('WARN', 'Blocked navigation to ' + url)
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Open external https links in the user's browser via main process.
    try {
      const u = new URL(url)
      if (u.protocol === 'https:') {
        shell.openExternal(url)
      } else {
        log('WARN', 'Blocked window.open to ' + url)
      }
    } catch (_) {
      log('WARN', 'Blocked invalid window.open to ' + url)
    }
    return { action: 'deny' }
  })
  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log('ERROR', 'Renderer failed to load', { code: errorCode, desc: errorDescription, url: validatedURL })
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    log('ERROR', 'Renderer process gone', details)
  })

  return win
}

function buildDevMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ])
}

async function loadRenderer(win) {
  if (isDev) {
    const ok = await waitForUrl(DEV_URL, 30_000)
    if (!ok) {
      log('WARN', 'Dev URL not reachable; falling back to packaged renderer.')
    } else {
      log('INFO', 'Loading dev URL ' + DEV_URL)
      await win.loadURL(DEV_URL)
      return
    }
  }
  const indexPath = path.join(projectRoot, 'dist', 'index.html')
  if (!fs.existsSync(indexPath)) {
    log('ERROR', 'dist/index.html missing; build before packaging.')
    win.webContents.once('did-finish-load', () => {
      win.webContents.executeJavaScript(
        "document.body.innerHTML = '<div style=\"font-family:sans-serif;color:#fff;padding:24px\">Pitwall Dynasty build is missing. Run <code>npm run build</code> first.</div>'"
      )
    })
    return
  }
  log('INFO', 'Loading packaged renderer from ' + indexPath)
  await win.loadFile(indexPath)
}

// ----- IPC handlers -----
function registerIpc() {
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:getPlatform', () => process.platform)
  ipcMain.handle('app:quit', () => { app.quit() })
  ipcMain.handle('app:userDataPath', () => app.getPath('userData'))
  ipcMain.handle('app:logPath', () => getLogFile())

  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:set', (_e, partial) => {
    if (!partial || typeof partial !== 'object') return null
    return writeSettings(partial)
  })

  ipcMain.handle('save:list', () => listSaves())
  ipcMain.handle('save:read', async (_e, slot) => readSave(slot))
  ipcMain.handle('save:write', async (_e, slot, json) => writeSave(slot, json))
  ipcMain.handle('save:delete', async (_e, slot) => deleteSave(slot))

  ipcMain.handle('window:toggleFullscreen', () => {
    if (!mainWindow) return false
    const next = !mainWindow.isFullScreen()
    mainWindow.setFullScreen(next)
    return next
  })
  ipcMain.handle('window:setDisplayMode', (_e, mode) => {
    if (!mainWindow) return false
    const s = readSettings()
    let next = { ...s, displayMode: mode }
    if (mode === 'fullscreen') {
      mainWindow.setFullScreen(true)
      mainWindow.setMenuBarVisibility(false)
    } else if (mode === 'borderless') {
      mainWindow.setFullScreen(false)
      mainWindow.setMenuBarVisibility(false)
      mainWindow.setBounds({ x: 0, y: 0, width: 1920, height: 1080 })
    } else {
      mainWindow.setFullScreen(false)
      mainWindow.setMenuBarVisibility(true)
      mainWindow.setBounds({ x: 60, y: 60, width: s.resolution.width, height: s.resolution.height })
    }
    writeSettings(next)
    return true
  })
  ipcMain.handle('window:minimize', () => { if (mainWindow) mainWindow.minimize() })
  ipcMain.handle('window:restore', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() } })

  ipcMain.handle('shell:openExternal', (_e, url) => {
    try {
      const u = new URL(url)
      if (u.protocol !== 'https:') return false
      shell.openExternal(url)
      return true
    } catch (_) {
      return false
    }
  })
}

// ----- App lifecycle -----
app.whenReady().then(async () => {
  log('INFO', 'Pitwall Dynasty starting', { version: app.getVersion(), isDev, electron: process.versions.electron })

  // Strict CSP for the renderer.
  try {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            // Vite dev needs eval + ws. Strict production has neither.
            (isDev ? "'unsafe-eval' 'unsafe-inline' http://localhost:5173 ws://localhost:5173; " : "'unsafe-inline'; ") +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' " + (isDev ? "http://localhost:5173 ws://localhost:5173 ws://localhost:8080 " : "ws://localhost:8080 wss: ") + "data: blob:; " +
            "media-src 'self' data: blob:; " +
            "object-src 'none'; " +
            "frame-ancestors 'none'; " +
            "base-uri 'self';"
          ],
        },
      })
    })
  } catch (e) {
    log('WARN', 'Failed to set CSP', e && e.message)
  }

  registerIpc()
  if (isDev) startVite()
  mainWindow = createWindow()
  await loadRenderer(mainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (viteProc) {
    try { viteProc.kill() } catch (_) {}
    viteProc = null
  }
  log('INFO', 'Pitwall Dynasty shutting down')
})

app.on('will-quit', () => {
  if (viteProc) {
    try { viteProc.kill() } catch (_) {}
    viteProc = null
  }
})
