import { describe, it, expect } from 'vitest'
import { serializeSave, deserializeSave, SAVE_SCHEMA_VERSION } from '../src/state/persistence'
import { createChampionship } from '../src/championship/create'

describe('save persistence + migration', () => {
  it('round-trips a fresh save', () => {
    const champ = createChampionship('fast', 'Test', {}, { teamCount: 4, seed: 1 })
    const raw = serializeSave(champ)
    const res = deserializeSave(raw)
    expect(res.ok).toBe(true)
    expect(res.champ?.id).toBe(champ.id)
  })

  it('upgrades a v1 save to the current schema with migration', () => {
    const champ = createChampionship('career', 'Legacy', {}, { teamCount: 4, seed: 1 })
    // Force-clear new optional fields, then hand-serialize as v1
    const legacy = { ...champ, config: { ...champ.config, careerKind: undefined, eraYear: undefined } }
    for (const r of legacy.rounds) {
      ;(r as unknown as { practiceBonus?: unknown }).practiceBonus = undefined
    }
    const raw = JSON.stringify({ schemaVersion: 1, savedAt: Date.now(), championship: legacy })
    const res = deserializeSave(raw)
    expect(res.ok).toBe(true)
    expect(res.migrated).toBe(true)
    // For career mode, the migration defaults careerKind to 'fictional'
    expect(res.champ?.config.careerKind).toBe('fictional')
    expect(res.champ?.config.eraYear).toBe(2022) // career default era
    for (const r of res.champ!.rounds) {
      expect(r.practiceBonus).toBeDefined()
    }
  })

  it('rejects a future-schema save with an actionable error', () => {
    const raw = JSON.stringify({ schemaVersion: 99, savedAt: 0, championship: {} })
    const res = deserializeSave(raw)
    expect(res.ok).toBe(false)
    expect(res.error?.toLowerCase()).toContain('newer')
  })

  it('exports the current schema version', () => {
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(2)
  })
})
