// Save / settings repository abstraction.
//
// All gameplay code reads and writes saves and settings through these
// interfaces. The implementation is selected at module load time
// based on whether the desktop bridge (`window.pitwall`) is available.
//
// In browser dev mode we fall back to localStorage.
// In packaged desktop mode we use file-backed saves in the user's
// appData directory.
//
// This file MUST stay pure logic / type definitions. It does not
// import any Electron primitive.

import type { PitwallSaveMeta, PitwallSettings } from '../pitwall-api'

export type SaveMeta = PitwallSaveMeta & {
  /** Optional file size in bytes. */
  size?: number
  /** Optional modification time as epoch ms. */
  mtime?: number
}
export interface Settings extends PitwallSettings {}

export interface ReadSaveResult {
  ok: boolean
  contents?: string
  file?: string
  error?: 'NOT_FOUND' | 'READ_ERROR' | 'INVALID'
  message?: string
}

export interface WriteSaveResult {
  ok: boolean
  file?: string
  error?: string
}

export interface SaveRepository {
  list(): Promise<SaveMeta[]>
  read(slot: string): Promise<ReadSaveResult>
  write(slot: string, json: string): Promise<WriteSaveResult>
  remove(slot: string): Promise<{ ok: boolean; error?: string }>
}

export interface SettingsRepository {
  load(): Promise<Settings>
  save(partial: Partial<Settings>): Promise<Settings | null>
}

declare global {
  interface Window {
    pitwall?: import('../pitwall-api').PitwallDesktopApi
  }
}

const isDesktop = (): boolean => typeof window !== 'undefined' && !!window.pitwall
const desktop = (): NonNullable<Window['pitwall']> => {
  if (!window.pitwall) throw new Error('Desktop bridge not available')
  return window.pitwall
}

// ---------------------------------------------------------------------------
// Desktop repository — backed by Electron main process + filesystem.
// ---------------------------------------------------------------------------
class DesktopSaveRepository implements SaveRepository {
  async list(): Promise<SaveMeta[]> { return desktop().save.list() }
  async read(slot: string): Promise<ReadSaveResult> { return desktop().save.read(slot) }
  async write(slot: string, json: string): Promise<WriteSaveResult> { return desktop().save.write(slot, json) }
  async remove(slot: string) { return desktop().save.delete(slot) }
}

class DesktopSettingsRepository implements SettingsRepository {
  async load(): Promise<Settings> { return desktop().settings.get() }
  async save(partial: Partial<Settings>): Promise<Settings | null> {
    return desktop().settings.set(partial)
  }
}

// ---------------------------------------------------------------------------
// Browser repository — localStorage backed, dev only.
// ---------------------------------------------------------------------------
const BROWSER_SETTINGS_KEY = 'pitwall-dynasty.browser-settings'
const BROWSER_SAVE_PREFIX = 'pitwall-save::'
const BROWSER_LAST_SLOT_KEY = 'pitwall-dynasty.last-slot'

const BROWSER_DEFAULTS: Settings = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  radioVolume: 0.8,
  displayMode: 'windowed',
  resolution: { width: 1920, height: 1080 },
  vsync: true,
  fpsLimit: 60,
  graphicsQuality: 'high',
  uiScale: 1.0,
  reducedMotion: false,
  multiplayerEndpoint: 'ws://localhost:8080',
  lastSaveSlot: null,
}

class BrowserSaveRepository implements SaveRepository {
  async list(): Promise<SaveMeta[]> {
    const out: SaveMeta[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(BROWSER_SAVE_PREFIX)) continue
      const slot = k.slice(BROWSER_SAVE_PREFIX.length)
      const raw = localStorage.getItem(k) || ''
      let meta: SaveMeta = {
        file: slot + '.json',
        slot,
        team: 'Unknown',
        mode: '?',
        season: 0,
        round: 0,
        roundCount: 0,
        schema: 0,
        savedAt: 0,
      }
      try {
        const env = JSON.parse(raw)
        const champ = env.championship
        if (champ) {
          const team = (champ.teams || []).find((t: { id: string }) => t.id === champ.playerTeamId)
          meta = {
            file: slot + '.json',
            slot,
            team: team ? team.name : 'Unknown',
            mode: champ.mode,
            season: champ.config && champ.config.season,
            round: champ.currentRoundIndex,
            roundCount: (champ.rounds || []).length,
            schema: env.schemaVersion,
            savedAt: env.savedAt,
          }
        }
      } catch (_) { /* ignore */ }
      out.push({ ...meta, size: raw.length })
    }
    out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    return out
  }
  async read(slot: string): Promise<ReadSaveResult> {
    const raw = localStorage.getItem(BROWSER_SAVE_PREFIX + slot)
    if (raw == null) return { ok: false, error: 'NOT_FOUND' }
    return { ok: true, contents: raw, file: slot + '.json' }
  }
  async write(slot: string, json: string): Promise<WriteSaveResult> {
    try {
      localStorage.setItem(BROWSER_SAVE_PREFIX + slot, json)
      return { ok: true, file: slot + '.json' }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  async remove(slot: string) {
    try {
      localStorage.removeItem(BROWSER_SAVE_PREFIX + slot)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
}

class BrowserSettingsRepository implements SettingsRepository {
  async load(): Promise<Settings> {
    try {
      const raw = localStorage.getItem(BROWSER_SETTINGS_KEY)
      if (!raw) return { ...BROWSER_DEFAULTS }
      return { ...BROWSER_DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
    } catch (_) {
      return { ...BROWSER_DEFAULTS }
    }
  }
  async save(partial: Partial<Settings>): Promise<Settings | null> {
    try {
      const current = await this.load()
      const next = { ...current, ...partial }
      localStorage.setItem(BROWSER_SETTINGS_KEY, JSON.stringify(next))
      return next
    } catch (_) {
      return null
    }
  }
}

// ---------------------------------------------------------------------------
// Single shared instance, selected once at module load.
// ---------------------------------------------------------------------------
let _saveRepo: SaveRepository | null = null
let _settingsRepo: SettingsRepository | null = null

export function getSaveRepository(): SaveRepository {
  if (_saveRepo) return _saveRepo
  _saveRepo = isDesktop() ? new DesktopSaveRepository() : new BrowserSaveRepository()
  return _saveRepo
}

export function getSettingsRepository(): SettingsRepository {
  if (_settingsRepo) return _settingsRepo
  _settingsRepo = isDesktop() ? new DesktopSettingsRepository() : new BrowserSettingsRepository()
  return _settingsRepo
}

export function isDesktopEnvironment(): boolean { return isDesktop() }
export function lastSaveSlotKey(): string { return BROWSER_LAST_SLOT_KEY }
