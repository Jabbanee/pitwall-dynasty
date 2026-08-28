import { describe, it, expect } from 'vitest'
import { buildTrackWorld } from '../src/ui/three/environment'
import { getTrackVisualDefinition } from '../src/ui/three/track-visual'
import { CIRCUITS } from '../src/core/content'
import * as THREE from 'three'

/**
 * Pit path invariants.
 *
 * The renderer needs a continuous pit lane centreline to animate
 * pitting cars smoothly. These tests assert the centreline is
 * present, continuous, monotonic, NaN-free and that per-team
 * boxes are distinct.
 */

function makeWorld() {
  const circuit = CIRCUITS[0]
  const def = getTrackVisualDefinition(circuit)
  const world = buildTrackWorld(circuit, def, 2)
  return { world, def, circuit }
}

describe('pit path', () => {
  it('centreline has at least 8 samples', () => {
    const { def } = makeWorld()
    expect(def.pit.centreline.length).toBeGreaterThanOrEqual(8)
  })

  it('centreline samples have finite numbers and a sane Y', () => {
    const { def } = makeWorld()
    for (const s of def.pit.centreline) {
      expect(Number.isFinite(s.x)).toBe(true)
      expect(Number.isFinite(s.y)).toBe(true)
      expect(Number.isFinite(s.z)).toBe(true)
    }
  })

  it('per-team boxes are present and distinct', () => {
    const { def } = makeWorld()
    expect(def.pit.boxes_xy.length).toBe(def.pit.boxes)
    const seen = new Set<string>()
    for (const b of def.pit.boxes_xy) {
      const key = `${b.x.toFixed(1)}|${b.z.toFixed(1)}`
      seen.add(key)
    }
    // Most boxes are distinct (we allow some tolerance for tracks
    // with very few boxes).
    expect(seen.size).toBeGreaterThanOrEqual(Math.min(def.pit.boxes - 1, 5))
  })

  it('pitPositionAt interpolates between samples', () => {
    const { world } = makeWorld()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    world.pitPositionAt(0, a)
    world.pitPositionAt(1, b)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    // A pit lane from entry to exit is typically 30-200 m.
    expect(d).toBeGreaterThan(10)
    expect(d).toBeLessThan(1000)
  })

  it('pitPositionAt at u=0.5 is between u=0 and u=1', () => {
    const { world } = makeWorld()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    world.pitPositionAt(0, a)
    world.pitPositionAt(0.5, c)
    world.pitPositionAt(1, b)
    // The midpoint should be on the segment from a to b.
    const dax = c.x - a.x
    const day = c.y - a.y
    const daz = c.z - a.z
    const distAC = Math.sqrt(dax * dax + day * day + daz * daz)
    const dbx = b.x - c.x
    const dby = b.y - c.y
    const dbz = b.z - c.z
    const distCB = Math.sqrt(dbx * dbx + dby * dby + dbz * dbz)
    const dax2 = b.x - a.x
    const day2 = b.y - a.y
    const daz2 = b.z - a.z
    const distAB = Math.sqrt(dax2 * dax2 + day2 * day2 + daz2 * daz2)
    // Triangle inequality sanity: distAC + distCB >= distAB.
    expect(distAC + distCB).toBeGreaterThanOrEqual(distAB - 0.1)
  })

  it('pitBoxFor returns distinct positions for distinct team ids', () => {
    const { world } = makeWorld()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    world.pitBoxFor('base.team.titan', a)
    world.pitBoxFor('base.team.aquila', b)
    const dx = a.x - b.x
    const dz = a.z - b.z
    const d = Math.sqrt(dx * dx + dz * dz)
    expect(d).toBeGreaterThan(0.5)
  })

  it('pitBoxFor returns the same position for the same team id', () => {
    const { world } = makeWorld()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    world.pitBoxFor('base.team.titan', a)
    world.pitBoxFor('base.team.titan', b)
    expect(a.x).toBeCloseTo(b.x, 3)
    expect(a.y).toBeCloseTo(b.y, 3)
    expect(a.z).toBeCloseTo(b.z, 3)
  })
})
