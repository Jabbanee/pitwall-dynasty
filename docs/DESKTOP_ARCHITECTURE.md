# Pitwall Dynasty — Desktop Architecture

This document describes how the browser-only Vite + TypeScript game
became a real installable Windows PC game using Electron.

## Goals

The single hard requirement: the player can launch `Pitwall Dynasty.exe`
from the Windows desktop with **no** browser, **no** Vite dev server, and
**no** Node/npm installed globally. The install path looks like:

1. Run `Pitwall Dynasty Setup 0.1.0.exe`
2. Install to `%PROGRAMFILES%\Pitwall Dynasty\`
3. Launch from the Start Menu / desktop shortcut
4. The main window opens with the title screen. No browser chrome,
   no URL bar, no DevTools.

Everything else (multiplayer, Career, driver ecosystem, 3D broadcast,
settings, saves) is unchanged from the browser build.

## High-level architecture

```
Pitwall Dynasty.exe
  |
  +-- Electron main process  (electron/main.cjs)
  |     - app lifecycle
  |     - single-instance lock
  |     - BrowserWindow with secure defaults
  |     - file-backed settings + saves (app.getPath('userData'))
  |     - logging + crash handlers
  |     - IPC handlers
  |     - in dev only: boots Vite itself
  |
  +-- preload (electron/preload.cjs, sandboxed)
  |     - exposes narrowly-typed `window.pitwall.*` via contextBridge
  |     - validates every argument before forwarding to ipcRenderer
  |
  +-- bundled renderer (dist/ via Vite production build)
        - existing TypeScript UI
        - existing Three.js broadcast
        - existing authoritative-multiplayer WebSocket client
        - uses window.pitwall for save/settings/shell
```

## Security model

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`
- IPC channels are explicitly named (`settings:get`, `save:list`,
  `window:setDisplayMode`, `shell:openExternal`, …). There is no
  `ipcRenderer.invoke(channelFromUserInput)` style dispatcher.
- The preload bridge validates every argument type and size. URLs
  are regex-checked to be `https:` before reaching
  `shell.openExternal`.
- Renderer navigation is filtered: only the dev URL or `file://`
  is permitted. Unexpected navigation is blocked via `will-navigate`.
  `setWindowOpenHandler` denies arbitrary popups; only `https:` is
  forwarded to the OS browser.
- The main process installs a strict Content-Security-Policy header
  on every response, including `'unsafe-eval'` only in dev mode
  (Vite HMR).
- Default Electron menu is removed in production (`Menu.setApplicationMenu(null)`).
  Dev builds keep a minimal reload / DevTools menu.

## Save / settings repository

`src/platform/persistence/index.ts` exposes:

- `SaveRepository` — list, read, write (atomic), remove
- `SettingsRepository` — load, save
- `isDesktopEnvironment()`

Two implementations:

- `DesktopSaveRepository` / `DesktopSettingsRepository` — proxies to
  the Electron preload bridge. Saves land in
  `%APPDATA%\Pitwall Dynasty\saves\`. Settings in
  `%APPDATA%\Pitwall Dynasty\settings.json`. Writes are atomic
  (`save.tmp.${pid}.${ts}` then rename).
- `BrowserSaveRepository` / `BrowserSettingsRepository` — localStorage
  fallback for browser dev mode. The legacy
  `pitwall-dynasty.save` key is still mirrored for HMR continuity.

The store (`src/state/store.ts`) calls the repositories. Gameplay
code never sees the difference. Migration logic
(`migrateChampionship`) continues to run on every load; the save
schema version is unchanged at `SAVE_SCHEMA_VERSION = 3`.

## Multiplayer

The authoritative multiplayer server in `src/server/server.ts` is
**not** embedded into the packaged game. Singleplayer / local
Career continues to use the local authoritative engine inside the
Electron process. Online multiplayer connects to an external
authoritative server.

The default endpoint is `ws://localhost:8080` (configurable in
Settings → Multiplayer → Server Endpoint). Production deployments
will point this at a real `wss://multiplayer.pitwalldynasty...` URL
when the dedicated server is published.

When the endpoint is unreachable, the Multiplayer screen shows the
existing OFFLINE / SERVER UNAVAILABLE message. Singleplayer
remains fully functional with no network access.

## Display modes

- **Windowed** — standard 1920x1080 (configurable) window with the
  default Windows title bar.
- **Borderless** — the window fills the screen, frame is removed
  (no title bar), menu bar hidden.
- **Fullscreen** — real Electron fullscreen via
  `win.setFullScreen(true)`.

The setting is persisted through the SettingsRepository. The
preload bridge exposes `window.pitwall.window.setDisplayMode(mode)`.
The current mode is also surfaced on the title screen footer
(`STANDALONE` chip).

`Alt+Enter` toggles fullscreen. `Alt+F4` is handled by the
BrowserWindow default close handler; `before-quit` flushes Vite
and logs the shutdown.

## Settings

`src/ui/settings.ts` is the in-game settings screen. Sections:

- **Display** — Display Mode, Resolution, VSync, FPS Limit
- **Graphics** — Graphics Quality (Low/Medium/High/Ultra), UI Scale,
  Reduced Motion
- **Audio** — Master / Music / SFX / Radio volume
- **Multiplayer** — Server Endpoint
- **Keyboard** — Esc / Enter / Alt+Enter / Alt+F4 reference

Persistence goes through the SettingsRepository. The
`saveToStorage` and `saveSettings` helpers in `src/state/persistence.ts`
mirror the desktop settings into the legacy browser localStorage so
HMR preserves them.

## Single instance

`app.requestSingleInstanceLock()` is called early. If a second
instance launches, the new one exits immediately and the existing
window is focused.

## Logging & crash handling

- `process.on('uncaughtException')` and `unhandledRejection` write
  to the log file.
- `app.getPath('logs')` (`%APPDATA%\Pitwall Dynasty\logs\pitwall.log`).
- The renderer's `did-fail-load` and `render-process-gone` are
  logged.

No session tokens, no private keys. Only the running `appVersion`
and platform.

## Build pipeline

- `electron-builder` v25 is the packaging tool.
- `electron-builder.json` defines the app id
  `fi.baneworks.pitwalldynasty`, the Windows NSIS installer
  target, and the unpacked `dir` target.
- `scripts/desktop-dev.cjs` — boots Vite (if not running) then
  launches Electron with the dev URL.
- `scripts/desktop-build.cjs` — verifies `dist/index.html`.
- `scripts/desktop-package.cjs` — calls `electron-builder --win nsis --x64`.
- `scripts/make-icon.ps1` — generates the multi-resolution `.ico`
  from a procedural PD mark + checkered flag.
- `scripts/make-icon-128.ps1` — same without the 256x256 frame
  (electron-builder's icon-converter panics on 256px frames).

### Build commands

```sh
npm run build              # tsc + vite build
npm run desktop:dev        # vite + electron in dev
npm run desktop:package    # produce the Windows installer
```

### Artifacts

After `npm run desktop:package`:

- `dist-electron/Pitwall Dynasty Setup 0.1.0.exe` — NSIS installer
- `dist-electron/win-unpacked/Pitwall Dynasty.exe` — portable
  unpacked executable (use this for "no installer" testing)
- `dist-electron/win-unpacked/resources/app.asar` — bundled code
- `dist-electron/win-unpacked/resources/icon.ico` — app icon
- `dist-electron/latest.yml` — auto-update metadata placeholder

## What is intentionally NOT included

- **Code signing** — the installer is unsigned. Windows SmartScreen
  will show the standard "Unknown publisher" warning. The
  README documents this; a future pass can plug in a real signing
  certificate.
- **Auto-updater** — the metadata (`latest.yml`) is generated, but
  the renderer does not yet query an update server.
- **Steam integration** — the app is structured to allow it later
  (single-instance lock, settings path, no direct console access
  in production).
- **Tauri** — explicitly not introduced. One desktop stack only.

## Clean-machine verification

1. Stop every dev server (`vite`, `electron`, `npm run dev`,
   `npm run server`).
2. Confirm `node_modules\electron\dist\electron.exe` is the only
   electron binary the installer relies on.
3. Copy `dist-electron/win-unpacked/` to a directory with **no**
   Vite, no Node, no global npm.
4. Launch `Pitwall Dynasty.exe`. The title screen must appear
   without any browser chrome. Career, Quick Start, Drivers,
   Junior Series, Aurora, Watchlist, Academy, 3D Broadcast,
   Results, Standings all continue to work.
5. From the title screen, click LOAD GAME → no saves → empty state
   is shown correctly. New Game → driver ecosystem works as
   designed.

## Player data paths

- Saves: `%APPDATA%\Pitwall Dynasty\saves\<slot>.json`
- Settings: `%APPDATA%\Pitwall Dynasty\settings.json`
- Logs: `%APPDATA%\Pitwall Dynasty\logs\pitwall.log`

These are also the directories to back up or hand-clear when
troubleshooting.
