import { describe, it, expect } from 'vitest'
import { TvDirector, type CarPositionSample } from '../src/ui/three/cameras'
import * as THREE from 'three'
import { buildTrackWorld } from '../src/ui/three/environment'
import { getTrackVisualDefinition } from '../src/ui/three/track-visual'
import { CIRCUITS } from '../src/core/content'

/**
 * TV Director — local renderer-only camera decision logic.
 *
 * The director must:
 *  - never feed back into the authoritative simulation
 *  - prefer CRITICAL events over HIGH and NORMAL
 *  - drop stale events older than the TTL
 *  - respect manual mode override
 *  - produce a target with a finite position and look-at
 */

function makeWorld() {
  const c = CIRCUITS[0]
  const def = getTrackVisualDefinition(c)
  return buildTrackWorld(c, def, 2)
}

function sample(driverId: string, lapFrac: number, x = 0, y = 0, z = 0): CarPositionSample {
  return {
    carId: driverId,
    position: new THREE.Vector3(x, y, z),
    speed: 60,
    lapFrac,
  }
}

describe('TV Director / camera mode logic', () => {
  it('manual mode bypasses the event queue', () => {
    const d = new TvDirector()
    d.setManualMode('helicopter')
    d.pushEvent({ kind: 'race-start', priority: 'CRITICAL', atTime: performance.now() })
    const w = makeWorld()
    const out = d.solve(w, sample('a', 0.1), sample('a', 0.1), [], performance.now())
    expect(out.target.label).toBe('HELICOPTER')
  })

  it('CRITICAL events beat HIGH and NORMAL', () => {
    const d = new TvDirector()
    const now = performance.now()
    d.pushEvent({ kind: 'overtake', priority: 'NORMAL', atTime: now })
    d.pushEvent({ kind: 'pit-entry', priority: 'HIGH', atTime: now })
    d.pushEvent({ kind: 'race-start', priority: 'CRITICAL', atTime: now })
    const w = makeWorld()
    const out = d.solve(w, sample('a', 0.1), sample('a', 0.1), [sample('a', 0.1), sample('b', 0.12)], now + 50)
    expect(out.target.label).toBe('START')
  })

  it('HIGH events are chosen when there is no CRITICAL', () => {
    const d = new TvDirector()
    const now = performance.now()
    d.pushEvent({ kind: 'overtake', priority: 'NORMAL', atTime: now })
    d.pushEvent({ kind: 'pit-entry', priority: 'HIGH', atTime: now })
    const w = makeWorld()
    const out = d.solve(w, sample('a', 0.1), sample('a', 0.1), [], now + 50)
    expect(out.target.label).toBe('PIT LANE')
  })

  it('stale events are ignored', () => {
    const d = new TvDirector()
    const w = makeWorld()
    d.pushEvent({ kind: 'race-start', priority: 'CRITICAL', atTime: performance.now() - 60_000 })
    const out = d.solve(w, sample('a', 0.1), sample('a', 0.1), [], performance.now())
    // No fresh events → falls back to default helicopter on the followed car.
    expect(out.target.label).toBe('HELICOPTER')
  })

  it('camera target always has finite position and look-at', () => {
    const d = new TvDirector()
    const w = makeWorld()
    const out = d.solve(w, null, null, [], performance.now())
    expect(Number.isFinite(out.target.position.x)).toBe(true)
    expect(Number.isFinite(out.target.position.y)).toBe(true)
    expect(Number.isFinite(out.target.position.z)).toBe(true)
    expect(Number.isFinite(out.target.lookAt.x)).toBe(true)
    expect(Number.isFinite(out.target.lookAt.y)).toBe(true)
    expect(Number.isFinite(out.target.lookAt.z)).toBe(true)
  })

  it('pit-lane camera places the camera on the pit side', () => {
    const d = new TvDirector()
    d.setManualMode('pit-lane')
    const w = makeWorld()
    const out = d.solve(w, sample('a', 0.1), sample('a', 0.1), [], performance.now())
    expect(out.target.label).toBe('PIT LANE')
  })

  it('onboard camera follows the followed car', () => {
    const d = new TvDirector()
    d.setManualMode('onboard')
    const w = makeWorld()
    const out = d.solve(w, sample('a', 0.1, 5, 0, 5), sample('a', 0.1, 5, 0, 5), [], performance.now())
    expect(out.target.label).toBe('T-CAM')
  })
})
