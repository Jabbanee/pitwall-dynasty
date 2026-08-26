import { describe, it, expect } from 'vitest'
import { createRng } from '../src/core/rng'

describe('seeded RNG', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('different seeds can produce different sequences', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('gauss is deterministic per seed', () => {
    const a = createRng(777)
    const b = createRng(777)
    expect(a.gauss(0, 1)).toBe(b.gauss(0, 1))
  })

  it('int respects bounds', () => {
    const r = createRng(42)
    for (let i = 0; i < 200; i++) {
      const v = r.int(3, 8)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThan(8)
    }
  })
})
