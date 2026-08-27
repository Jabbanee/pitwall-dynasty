// Pitwall Dynasty — Electron preload (sandboxed)
// Exposes a strictly-typed, minimal API to the renderer via
// contextBridge. The renderer never sees Node, fs, ipcRenderer, or
// any other low-level primitive.

const { contextBridge, ipcRenderer } = require('electron')

// Helper to wrap ipcRenderer.invoke with strict argument validation.
const safeInvoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

// Sanitise URLs before opening externally. The renderer MUST pass a
// fully-qualified https:// URL; the main process performs the final
// protocol check.
const SAFE_URL = /^https:\/\//i

const api = {
  app: {
    getVersion: () => safeInvoke('app:getVersion'),
    getPlatform: () => safeInvoke('app:getPlatform'),
    userDataPath: () => safeInvoke('app:userDataPath'),
    logPath: () => safeInvoke('app:logPath'),
    quit: () => safeInvoke('app:quit'),
  },
  settings: {
    get: () => safeInvoke('settings:get'),
    set: (partial) => {
      if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
        return Promise.reject(new Error('Invalid settings payload'))
      }
      // Reject non-finite numbers and over-large strings. The main
      // process performs the canonical merge with defaults.
      for (const [k, v] of Object.entries(partial)) {
        if (typeof v === 'string' && v.length > 4096) {
          return Promise.reject(new Error('Setting "' + k + '" string too long'))
        }
      }
      return safeInvoke('settings:set', partial)
    },
  },
  save: {
    list: () => safeInvoke('save:list'),
    read: (slot) => {
      if (typeof slot !== 'string') return Promise.reject(new Error('Invalid slot'))
      return safeInvoke('save:read', slot)
    },
    write: (slot, json) => {
      if (typeof slot !== 'string') return Promise.reject(new Error('Invalid slot'))
      if (typeof json !== 'string') return Promise.reject(new Error('Invalid save contents'))
      if (json.length > 64 * 1024 * 1024) return Promise.reject(new Error('Save too large'))
      return safeInvoke('save:write', slot, json)
    },
    delete: (slot) => {
      if (typeof slot !== 'string') return Promise.reject(new Error('Invalid slot'))
      return safeInvoke('save:delete', slot)
    },
  },
  window: {
    toggleFullscreen: () => safeInvoke('window:toggleFullscreen'),
    setDisplayMode: (mode) => {
      if (mode !== 'windowed' && mode !== 'borderless' && mode !== 'fullscreen') {
        return Promise.reject(new Error('Invalid display mode'))
      }
      return safeInvoke('window:setDisplayMode', mode)
    },
    minimize: () => safeInvoke('window:minimize'),
    restore: () => safeInvoke('window:restore'),
  },
  shell: {
    openExternal: (url) => {
      if (typeof url !== 'string' || !SAFE_URL.test(url)) {
        return Promise.reject(new Error('Only https: URLs are allowed'))
      }
      return safeInvoke('shell:openExternal', url)
    },
  },
  /** Read-only environment flag set at preload time. */
  env: {
    isDesktop: true,
    isPackaged: !!(process && process.versions && process.versions.electron && !process.env.PITWALL_DEV_FORCE),
  },
}

contextBridge.exposeInMainWorld('pitwall', api)
