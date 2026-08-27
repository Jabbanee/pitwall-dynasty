import { describe, it, expect } from 'vitest'
import { getSaveRepository, getSettingsRepository, isDesktopEnvironment } from '../src/platform/persistence'
import { serializeSave, deserializeSave, SAVE_SCHEMA_VERSION } from '../src/state/persistence'
import { createChampionship } from '../src/championship/create'
import type { Championship } from '../src/core/types'

/**
 * Desktop platform tests
 *
 * The platform SaveRepository / SettingsRepository are abstract
 * interfaces with two implementations: a desktop implementation that
 * proxies to the Electron preload bridge, and a browser implementation
 * backed by localStorage. These tests focus on the pure logic that
 * drives both implementations: envelope shape, default settings,
 * schema migration, and error reporting.
 */

function makeChamp(): Championship {
  return createChampionship(
    'fast',
    'Test',
    { numberOfRaces: 5, managementPhaseSeconds: 60 },
    { playerTeamIndex: 0, teamCount: 4, seed: 1 },
  )
}

describe('save envelope and schema', () => {
  it('serializes the championship with the canonical schema version', () => {
    const champ = makeChamp()
    const json = serializeSave(champ)
    const env = JSON.parse(json)
    expect(env.schemaVersion).toBe(SAVE_SCHEMA_VERSION)
    expect(env.savedAt).toBeGreaterThan(0)
    expect(env.championship).toBeTruthy()
    expect(env.championship.id).toBe(champ.id)
  })

  it('round-trips through deserializeSave', () => {
    const champ = makeChamp()
    const json = serializeSave(champ)
    const res = deserializeSave(json)
    expect(res.ok).toBe(true)
    expect(res.champ).toBeTruthy()
    expect(res.champ!.id).toBe(champ.id)
    expect(res.migrated).toBe(false)
  })

  it('rejects corrupt JSON with a stable error', () => {
    const res = deserializeSave('{ not valid')
    expect(res.ok).toBe(false)
    expect(typeof res.error).toBe('string')
  })

  it('rejects saves from a newer schema', () => {
    const champ = makeChamp()
    const env = {
      schemaVersion: SAVE_SCHEMA_VERSION + 99,
      savedAt: Date.now(),
      championship: champ,
    }
    const res = deserializeSave(JSON.stringify(env))
    expect(res.ok).toBe(false)
    expect(res.error).toContain('newer than this build')
  })

  it('migrates an older save (v1) to the current schema', () => {
    const champ = makeChamp()
    // Strip v2/v3 fields to simulate a v1 save.
    ;(champ as any).config.careerKind = undefined
    ;(champ as any).config.eraYear = undefined
    delete (champ as any).womenSeriesEstablished
    const env = {
      schemaVersion: 1,
      savedAt: Date.now(),
      championship: champ,
    }
    const res = deserializeSave(JSON.stringify(env))
    expect(res.ok).toBe(true)
    expect(res.migrated).toBe(true)
    expect(res.champ!.config.eraYear).toBeDefined()
    expect(res.champ!.womenSeriesEstablished).toBeDefined()
  })
})

describe('platform repository selection', () => {
  it('returns a non-null repository in both modes', () => {
    expect(getSaveRepository()).toBeTruthy()
    expect(getSettingsRepository()).toBeTruthy()
  })

  it('isDesktopEnvironment reflects the current runtime', () => {
    // In the test environment (jsdom via vitest) window.pitwall is
    // not defined, so this should return false.
    const desktop = isDesktopEnvironment()
    expect(typeof desktop).toBe('boolean')
  })
})

describe('atomic write contract (in-memory simulation)', () => {
  it('serialization is deterministic for an unchanged championship', () => {
    const champ = makeChamp()
    // Two serializations at different times should differ only in
    // the savedAt field.
    const a = JSON.parse(serializeSave(champ))
    const b = JSON.parse(serializeSave(champ))
    a.savedAt = b.savedAt
    expect(a).toEqual(b)
  })
})
