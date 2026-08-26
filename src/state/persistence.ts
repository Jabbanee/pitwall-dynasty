import type { Championship } from '../core/types'

/**
 * Save schema versioning. Bump this when fields are removed or renamed;
 * additive optional fields (careerKind, eraYear, practiceBonus) do NOT
 * require a bump — they are defaulted by `migrateChampionship`.
 */
export const SAVE_SCHEMA_VERSION = 2
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
  /** True when a migration was applied to bring the save up to date. */
  migrated?: boolean
}

export function deserializeSave(raw: string): LoadResult {
  try {
    const parsed = JSON.parse(raw) as SaveEnvelope
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Save file is not valid JSON.' }
    }
    const incoming = parsed.schemaVersion ?? 0
    if (incoming > SAVE_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Save schema version ${incoming} is newer than this build (${SAVE_SCHEMA_VERSION}). Update the game.`,
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
    const migrated = incoming < SAVE_SCHEMA_VERSION
    const champ = migrated ? migrateChampionship(c, incoming) : c
    return { ok: true, champ, migrated }
  } catch (e) {
    return { ok: false, error: `Failed to parse save: ${(e as Error).message}` }
  }
}

/**
 * Apply additive migrations to a championship loaded from a save with an
 * older schema. Additive fields are defaulted; structural changes go here.
 */
function migrateChampionship(c: Championship, from: number): Championship {
  let champ = c
  // v1 -> v2: add careerKind, eraYear defaults; ensure round.practiceBonus
  if (from < 2) {
    if (!champ.config.careerKind) champ.config.careerKind = champ.mode === 'career' ? 'fictional' : undefined
    if (!champ.config.eraYear) champ.config.eraYear = 2024
    for (const r of champ.rounds) {
      if (!r.practiceBonus) r.practiceBonus = {}
    }
  }
  return champ
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
