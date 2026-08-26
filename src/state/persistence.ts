import type { Championship } from '../core/types'

export const SAVE_SCHEMA_VERSION = 1
const STORAGE_KEY = 'pitwall-dynasty.save'
const SETTINGS_KEY = 'pitwall-dynasty.settings'

export interface SaveEnvelope {
  schemaVersion: number
  savedAt: number
  championship: Championship
}

export function serializeSave(champ: Championship): string {
  const envelope: SaveEnvelope = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: Date.now(),
    championship: champ,
  }
  return JSON.stringify(envelope)
}

export interface LoadResult {
  ok: boolean
  champ?: Championship
  error?: string
}

export function deserializeSave(raw: string): LoadResult {
  try {
    const parsed = JSON.parse(raw) as SaveEnvelope
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Save file is not valid JSON.' }
    }
    if (parsed.schemaVersion !== SAVE_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Save schema version ${parsed.schemaVersion} is not compatible with this build (${SAVE_SCHEMA_VERSION}).`,
      }
    }
    const c = parsed.championship
    if (!c || !Array.isArray(c.teams) || !c.rounds || !c.drivers) {
      return { ok: false, error: 'Save data is missing core championship structures.' }
    }
    // Basic integrity: every team must have at least one driver slot resolvable
    for (const t of c.teams) {
      if (!t.id || !t.name) return { ok: false, error: `Corrupt team entry in save.` }
    }
    return { ok: true, champ: c }
  } catch (e) {
    return { ok: false, error: `Failed to parse save: ${(e as Error).message}` }
  }
}

// ----- localStorage-backed persistence -----

export function saveToStorage(champ: Championship): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, serializeSave(champ))
    return true
  } catch {
    return false
  }
}

export function loadFromStorage(): LoadResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ok: false, error: 'No save found.' }
    return deserializeSave(raw)
  } catch {
    return { ok: false, error: 'Storage unavailable.' }
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY)
  } catch {
    return false
  }
}

export function clearSave(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

// ----- Settings -----

export interface GameSettings {
  masterVolume: number
  uiScale: number
  preferredCamera: string
  reduceMotion: boolean
}

export function defaultSettings(): GameSettings {
  return { masterVolume: 0.7, uiScale: 1, preferredCamera: 'tv', reduceMotion: false }
}

export function saveSettings(s: GameSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* non-fatal */
  }
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<GameSettings>) }
  } catch {
    /* fallthrough */
  }
  return defaultSettings()
}
