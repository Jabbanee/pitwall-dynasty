import { describe, it, expect } from 'vitest'
import { DriverAgencyStore, generateDriverDemands } from '../src/drivers/agency'
import type { Driver } from '../src/core/types'

const fakeDriver = (over: Partial<Driver> = {}): Driver => ({
  id: 'd1', firstName: 'Test', lastName: 'Driver', nationality: 'X', age: 28,
  visible: { pace: 80, qualifying: 75, racecraft: 80, overtaking: 78, defending: 78, consistency: 80, wetSkill: 80, tyreManagement: 75, feedback: 80 },
  hidden: { potential: 85, pressureResistance: 80, aggression: 60, adaptability: 70, loyalty: 60, ego: 80, confidenceSensitivity: 50, developmentRate: 60, declineRate: 30 },
  dynamic: { morale: 70, confidence: 75, form: 0, fatigue: 0, seasonsWithTeam: 1 },
  salaryDemandBase: 1000,
  history: [],
  ...over,
})

describe('driver demands + promises', () => {
  it('generates demands from personality for an ego driver', () => {
    const d = fakeDriver()
    const demands = generateDriverDemands(d, 42)
    // Ego driver: should ask for number-1 status
    expect(demands.some((x) => x.kind === 'number1Status')).toBe(true)
  })

  it('agency.addPromise and breakPromise affect state', () => {
    const d = fakeDriver()
    const store = new DriverAgencyStore()
    store.setRound(0)
    store.addPromise(d.id, 'Number 1 status')
    let s = store.get(d.id)!
    expect(s.promises.length).toBe(1)
    expect(s.promises[0].broken).toBe(false)
    const broke = store.breakPromise(d.id, 'Number 1')
    expect(broke).toBe(true)
    s = store.get(d.id)!
    expect(s.promises[0].broken).toBe(true)
    // Broken promise must have reduced trust
    expect(s.trustInTeam).toBeLessThan(65)
  })

  it('breakPromise is idempotent', () => {
    const d = fakeDriver()
    const store = new DriverAgencyStore()
    store.addPromise(d.id, 'Number 1 status')
    expect(store.breakPromise(d.id, 'Number 1')).toBe(true)
    expect(store.breakPromise(d.id, 'Number 1')).toBe(false)
  })

  it('generateDriverDemands is deterministic for a given driver+seed', () => {
    const d = fakeDriver()
    const a = generateDriverDemands(d, 7)
    const b = generateDriverDemands(d, 7)
    expect(a.map((x) => x.kind).sort()).toEqual(b.map((x) => x.kind).sort())
  })

  it('recordPositive produces visible trust/morale changes', () => {
    const d = fakeDriver()
    const store = new DriverAgencyStore()
    store.setRound(0)
    store.recordPositive(d.id, 'PUBLIC_PRAISE')
    const s = store.get(d.id)!
    expect(s.memory.some((m) => m.type === 'PUBLIC_PRAISE')).toBe(true)
  })
})
