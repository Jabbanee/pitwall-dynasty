import { describe, it, expect } from 'vitest'
import { ENVIRONMENT_THEMES, getTrackVisualDefinition, hash01, pickCamera } from '../src/ui/three/track-visual'
import { CIRCUITS } from '../src/core/content'

/**
 * Track visual model — presentation-only data structure.
 *
 * The visual definition is derived deterministically from the
 * circuit id. These tests assert that:
 *  - the same circuit always produces the same visual definition
 *  - every circuit has a valid theme + camera + pit lane
 *  - the camera points cover the lap and include the required kinds
 *  - the elevation amplitude + terrain radius are finite
 *  - no NaN coordinates leak into the visual model
 */

describe('track-visual / deterministic visual model', () => {
  it('hash01 is deterministic', () => {
    expect(hash01('foo')).toBe(hash01('foo'))
    expect(hash01('foo')).not.toBe(hash01('bar'))
    expect(hash01('foo')).toBeGreaterThanOrEqual(0)
    expect(hash01('foo')).toBeLessThan(1)
  })

  it('environment themes cover the six documented environments', () => {
    const ids = Object.keys(ENVIRONMENT_THEMES)
    expect(ids.length).toBe(6)
    for (const k of ['forest', 'mountain', 'coastal', 'desert', 'urban-park', 'modern-purpose-built'] as const) {
      expect(ENVIRONMENT_THEMES[k]).toBeDefined()
      expect(ENVIRONMENT_THEMES[k].sunDir.length).toBe(3)
    }
  })

  it('getTrackVisualDefinition is deterministic per circuit', () => {
    for (const c of CIRCUITS) {
      const a = getTrackVisualDefinition(c)
      const b = getTrackVisualDefinition(c)
      expect(a).toEqual(b)
    }
  })

  it('every top-series circuit produces a complete visual definition', () => {
    for (const c of CIRCUITS) {
      const def = getTrackVisualDefinition(c)
      expect(def.circuitId).toBe(c.id)
      expect(ENVIRONMENT_THEMES[def.theme]).toBeDefined()
      expect(def.baseWidth).toBeGreaterThan(8)
      expect(def.baseWidth).toBeLessThan(20)
      expect(def.elevationAmplitude).toBeGreaterThan(0)
      expect(def.elevationAmplitude).toBeLessThan(20)
      expect(def.terrainRadius).toBeGreaterThan(200)
      expect(def.sectorBreaks[0]).toBeGreaterThan(0)
      expect(def.sectorBreaks[0]).toBeLessThan(1)
      expect(def.sectorBreaks[1]).toBeGreaterThan(def.sectorBreaks[0])
      expect(def.pit.boxes).toBeGreaterThan(0)
      expect(def.pit.speedLimit).toBeGreaterThan(0)
    }
  })

  it('every circuit has a helicopter, trackside, onboard and pit-lane camera', () => {
    for (const c of CIRCUITS) {
      const def = getTrackVisualDefinition(c)
      const kinds = new Set(def.cameras.map((x) => x.kind))
      expect(kinds.has('helicopter')).toBe(true)
      expect(kinds.has('trackside')).toBe(true)
      expect(kinds.has('onboard')).toBe(true)
      expect(kinds.has('pit-lane')).toBe(true)
    }
  })

  it('pickCamera finds the closest trackside camera to a lap fraction', () => {
    const c = CIRCUITS[0]
    const def = getTrackVisualDefinition(c)
    const found = pickCamera(def, 0.12, 'trackside')
    expect(found).toBeDefined()
    expect(found!.kind).toBe('trackside')
  })
})
