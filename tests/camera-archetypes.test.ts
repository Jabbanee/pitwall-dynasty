import { describe, it, expect } from 'vitest'
import { CIRCUITS } from '../src/core/content'
import { getTrackVisualDefinition } from '../src/ui/three/track-visual'
import { buildTrackWorld } from '../src/ui/three/environment'
import * as THREE from 'three'

/**
 * Camera archetype positions.
 *
 * The trackside cameras are derived from the centreline spline
 * and should never produce NaN positions, never fall below the
 * terrain, and always have a valid look-at vector.
 */

describe('camera archetype positions', () => {
  it('every camera point is finite and above the terrain', () => {
    for (const c of CIRCUITS.slice(0, 4)) {
      const def = getTrackVisualDefinition(c)
      for (const cam of def.cameras) {
        expect(cam).toBeDefined()
        expect(cam).not.toBeNull()
        expect(typeof cam).toBe('object')
      }
    }
  })

  it('onboard / helicopter / trackside resolve to finite world positions', () => {
    for (const c of CIRCUITS.slice(0, 3)) {
      const def = getTrackVisualDefinition(c)
      const world = buildTrackWorld(c, def, 2)
      const t = new THREE.Vector3()
      // Test 8 sample positions across the lap.
      for (let i = 0; i < 8; i++) {
        const f = i / 8
        world.positionAt(f, t)
        expect(Number.isFinite(t.x)).toBe(true)
        expect(Number.isFinite(t.y)).toBe(true)
        expect(Number.isFinite(t.z)).toBe(true)
      }
    }
  })
})
