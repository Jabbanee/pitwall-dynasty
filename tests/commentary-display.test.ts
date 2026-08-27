import { describe, it, expect } from 'vitest'
import { createCommentaryDisplay } from '../src/media/commentary-display'
import { generateCommentary } from '../src/media/commentary'
import type { RaceEvent, Driver } from '../src/core/types'

const DRIVERS: Driver[] = [
  {
    id: 'd1', firstName: 'Ada', lastName: 'Voss', nationality: 'NL', age: 28,
    gender: 'female',
    visible: { pace: 80, qualifying: 80, racecraft: 80, overtaking: 80, defending: 80, consistency: 80, wetSkill: 80, tyreManagement: 80, feedback: 80 },
    hidden: { potential: 85, pressureResistance: 80, aggression: 50, adaptability: 70, loyalty: 50, ego: 50, confidenceSensitivity: 50, developmentRate: 50, declineRate: 30 },
    dynamic: { morale: 70, confidence: 70, form: 0, fatigue: 0, seasonsWithTeam: 1 },
    salaryDemandBase: 1000, history: [],
    eligibility: { driverId: 'd1', seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: ['Insufficient points.'] },
  },
]

describe('commentary display helper', () => {
  it('dedupes repeated events', () => {
    const cd = createCommentaryDisplay()
    const events: RaceEvent[] = [
      { t: 5, type: 'overtake', driverId: 'd1', detail: 'A passes B', data: { newPosition: 3 } },
    ]
    const a = cd.push(events, Object.fromEntries(DRIVERS.map((d) => [d.id, d])), { totalLaps: 20 })
    const b = cd.push(events, Object.fromEntries(DRIVERS.map((d) => [d.id, d])), { totalLaps: 20 })
    expect(a.length).toBeGreaterThan(0)
    expect(b.length).toBe(0)
  })

  it('generates new lines when fresh events appear', () => {
    const cd = createCommentaryDisplay()
    const map = Object.fromEntries(DRIVERS.map((d) => [d.id, d]))
    const e1: RaceEvent[] = [{ t: 1, type: 'overtake', driverId: 'd1', detail: 'A passes B', data: { newPosition: 4 } }]
    const e2: RaceEvent[] = [{ t: 50, type: 'safetyCar', detail: 'Safety Car deployed' }]
    expect(cd.push(e1, map, { totalLaps: 20 }).length).toBeGreaterThan(0)
    expect(cd.push(e2, map, { totalLaps: 20 }).length).toBeGreaterThan(0)
  })

  it('caps memory to 60 lines so long races do not bloat the feed', () => {
    const cd = createCommentaryDisplay()
    const map = Object.fromEntries(DRIVERS.map((d) => [d.id, d]))
    // Push 70 unique events
    for (let i = 0; i < 70; i++) {
      cd.push([{ t: i, type: 'spin', driverId: 'd1', detail: `spin ${i}` }], map, { totalLaps: 100 })
    }
    expect(cd.lines.length).toBeLessThanOrEqual(60)
  })

  it('matches direct generateCommentary output for a fresh feed', () => {
    const map = Object.fromEntries(DRIVERS.map((d) => [d.id, d]))
    const events: RaceEvent[] = [
      { t: 10, type: 'overtake', driverId: 'd1', detail: 'A passes B', data: { newPosition: 2 } },
      { t: 60, type: 'retirement', driverId: 'd1', detail: 'A retires — engine failure' },
    ]
    const direct = generateCommentary(events, map, { totalLaps: 50 })
    const cd = createCommentaryDisplay()
    const pushed = cd.push(events, map, { totalLaps: 50 })
    expect(pushed.length).toBe(direct.length)
  })
})
