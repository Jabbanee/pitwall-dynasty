// Type declarations for the window.pitwall bridge exposed by the
// Electron preload. The renderer treats the bridge as the only
// Node-capable surface; in browser dev mode the global is undefined
// and code should fall back to its in-renderer implementation.

export interface PitwallSettings {
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  radioVolume: number
  displayMode: 'windowed' | 'borderless' | 'fullscreen'
  resolution: { width: number; height: number }
  vsync: boolean
  fpsLimit: number // 30, 60, 120, 144, 0 = unlimited
  graphicsQuality: 'low' | 'medium' | 'high' | 'ultra'
  uiScale: number
  reducedMotion: boolean
  multiplayerEndpoint: string
  lastSaveSlot: string | null
}

export interface PitwallSaveMeta {
  file: string
  slot: string
  team: string
  mode: 'fast' | 'career' | 'league' | string
  season: number
  round: number
  roundCount: number
  schema: number
  savedAt: number
  size?: number
  mtime?: number
}

export interface PitwallReadSaveResult {
  ok: boolean
  contents?: string
  file?: string
  error?: 'NOT_FOUND' | 'READ_ERROR'
  message?: string
}

export interface PitwallWriteSaveResult {
  ok: boolean
  file?: string
  error?: string
}

export interface PitwallDesktopApi {
  app: {
    getVersion(): Promise<string>
    getPlatform(): Promise<NodeJS.Platform>
    userDataPath(): Promise<string>
    logPath(): Promise<string>
    quit(): Promise<void>
  }
  settings: {
    get(): Promise<PitwallSettings>
    set(partial: Partial<PitwallSettings>): Promise<PitwallSettings | null>
  }
  save: {
    list(): Promise<PitwallSaveMeta[]>
    read(slot: string): Promise<PitwallReadSaveResult>
    write(slot: string, json: string): Promise<PitwallWriteSaveResult>
    delete(slot: string): Promise<{ ok: boolean; error?: string }>
  }
  window: {
    toggleFullscreen(): Promise<boolean>
    setDisplayMode(mode: 'windowed' | 'borderless' | 'fullscreen'): Promise<boolean>
    minimize(): Promise<void>
    restore(): Promise<void>
  }
  shell: {
    openExternal(url: string): Promise<boolean>
  }
  env: {
    isDesktop: boolean
    isPackaged: boolean
  }
}

declare global {
  interface Window {
    pitwall?: PitwallDesktopApi
  }
}

export {}
