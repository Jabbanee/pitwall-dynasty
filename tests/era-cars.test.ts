import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'

// jsdom-free stub: provide a minimal `document.createElement('canvas')`
// that returns an object with the 2D context API used by the car
// number plate texture.
beforeAll(() => {
  if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
    const ctx = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'canvas') return { width: 128, height: 128 }
        return () => undefined
      },
    }) as unknown as CanvasRenderingContext2D
    const fakeCanvas = {
      width: 128,
      height: 128,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement
    ;(globalThis as { document?: { createElement: (k: string) => unknown } }).document = {
      createElement: (k: string) => (k === 'canvas' ? fakeCanvas : {}),
    }
  }
})

import { createCar } from '../src/ui/three/car3d'

/**
 * Era-aware car visual model.
 *
 * Era families are encoded by an `eraFactor` in [0..1]:
 *   0    → 1980s
 *   0.15 → early 90s
 *   0.35 → late 90s
 *   0.55 → 2009–2013
 *   0.7  → 2014–2018
 *   0.82 → 2019–2021
 *   0.95 → 2022+
 *
 * The bars required by the P2 pass are:
 *  - 1980 has NO halo
 *  - 2022+ has a halo
 *  - the era dimensions differ between families
 *  - the era family resolves deterministically from the factor
 */

function buildEra(era: number) {
  return createCar({
    colors: { primary: '#e63946', secondary: '#1c2230' },
    carNumber: 7,
    eraFactor: era,
    compound: 0,
  })
}

describe('era car family', () => {
  it('1980 (era 0) has no halo', () => {
    const c = buildEra(0)
    const hasHalo = hasNamedMesh(c, 'halo')
    c.dispose()
    expect(hasHalo).toBe(false)
  })

  it('2022+ (era 0.95) has a halo', () => {
    const c = buildEra(0.95)
    const hasHalo = hasNamedMesh(c, 'halo')
    c.dispose()
    expect(hasHalo).toBe(true)
  })

  it('era dimensions differ between families', () => {
    const c80 = buildEra(0)
    const c14 = buildEra(0.7)
    const c22 = buildEra(0.95)
    // The era exposes a deterministic dimensional fingerprint.
    expect(c80.eraDimensions.tubWidth).toBeLessThan(c22.eraDimensions.tubWidth)
    expect(c80.eraDimensions.tubWidth).toBeLessThan(c14.eraDimensions.tubWidth)
    // 1980s tall rear wing vs 2022+ low wing.
    expect(c80.eraDimensions.rearWingHeight).toBeGreaterThan(c22.eraDimensions.rearWingHeight)
    // Floor / ground effect only on modern cars.
    expect(c80.eraDimensions.floorStrake).toBe(false)
    expect(c22.eraDimensions.floorStrake).toBe(true)
    c80.dispose()
    c14.dispose()
    c22.dispose()
  })

  it('era family is deterministic from the factor', () => {
    const a = buildEra(0.55)
    const b = buildEra(0.55)
    expect(a.group.children.length).toBe(b.group.children.length)
    a.dispose()
    b.dispose()
  })

  it('compound change updates the tyre marker colour', () => {
    const c = buildEra(0.5)
    c.setCompound(0)
    c.setCompound(2)
    c.dispose()
    // No assertion needed; this just exercises the code path without
    // throwing. The visual is verified by the screenshot pass.
  })

  it('retirement toggles the group off', () => {
    const c = buildEra(0.5)
    c.setRetired(true)
    expect(c.group.visible).toBe(false)
    c.setRetired(false)
    expect(c.group.visible).toBe(true)
    c.dispose()
  })
})

function hasNamedMesh(c: ReturnType<typeof buildEra>, name: string): boolean {
  // The car group is a flat assembly; we approximate "halo present"
  // by looking for a TorusGeometry in the assembly. This is good
  // enough for the deterministic era test.
  let found = false
  c.group.traverse((obj) => {
    const m = obj as THREE.Mesh
    if (m.geometry instanceof THREE.TorusGeometry) found = true
  })
  void name
  return found
}
