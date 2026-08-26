import { describe, it, expect } from 'vitest'
import { generateCommentary, buildPaddockPost } from '../src/media/commentary'
import { DRIVERS, CIRCUITS, buildDefaultTeams } from '../src/core/content'
import type { RaceEvent } from '../src/core/types'

const driverMap = Object.fromEntries(DRIVERS.map((d) => [d.id, d]))

describe('commentary engine', () => {
  it('generates lead commentary for overtakes and retirements', () => {
    const events: RaceEvent[] = [
      { t: 100, type: 'overtake', driverId: DRIVERS[0].id, detail: 'X passes Y', data: { newPosition: 3 } },
      { t: 200, type: 'retirement', driverId: DRIVERS[1].id, detail: 'Y retires — engine failure' },
      { t: 300, type: 'safetyCar', detail: 'Safety Car deployed' },
    ]
    const lines = generateCommentary(events, driverMap, { totalLaps: 20 })
    expect(lines.length).toBeGreaterThanOrEqual(3)
    expect(lines.some((l) => l.role === 'lead' && l.text.includes(DRIVERS[0].lastName))).toBe(true)
    expect(lines.some((l) => l.text.includes('Safety Car'))).toBe(true)
  })

  it('includes analyst lines for big moments', () => {
    const events: RaceEvent[] = [
      { t: 100, type: 'safetyCar', detail: 'Safety Car deployed' },
      { t: 400, type: 'weatherChange', detail: 'Rain falling' },
    ]
    const lines = generateCommentary(events, driverMap, { totalLaps: 20 })
    expect(lines.some((l) => l.role === 'analyst')).toBe(true)
  })

  it('rate-limits overtake spam', () => {
    const events: RaceEvent[] = Array.from({ length: 10 }, (_, i) => ({
      t: 100 + i, type: 'overtake' as const, driverId: DRIVERS[i % 20].id, detail: `pass ${i}`, data: { newPosition: 5 },
    }))
    const lines = generateCommentary(events, driverMap, { totalLaps: 20 })
    const overtakeLines = lines.filter((l) => l.text.includes('!'))
    expect(overtakeLines.length).toBeLessThan(5)
  })
})

describe('paddock post', () => {
  const teams = buildDefaultTeams()
  const teamNameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? id
  const results = [
    { driverId: DRIVERS[0].id, teamId: teams[0].id, finishPosition: 1, classified: true },
    { driverId: DRIVERS[2].id, teamId: teams[1].id, finishPosition: 2, classified: true },
    { driverId: DRIVERS[4].id, teamId: teams[2].id, finishPosition: 3, classified: true },
    { driverId: DRIVERS[10].id, teamId: teams[4].id, finishPosition: 6, classified: true, fastestLap: true },
    { driverId: DRIVERS[14].id, teamId: teams[7].id, finishPosition: 0, classified: false, dnfReason: 'engine failure' },
  ]

  it('produces a lead story with the winner', () => {
    const post = buildPaddockPost({
      circuitName: CIRCUITS[0].name, results, drivers: driverMap, teamNameOf, season: 1, round: 1,
    })
    expect(post.lead.headline).toContain(DRIVERS[0].lastName)
    expect(post.lead.body).toContain(CIRCUITS[0].name)
  })

  it('includes secondary stories, analysis and rumours', () => {
    const post = buildPaddockPost({
      circuitName: CIRCUITS[0].name, results, drivers: driverMap, teamNameOf, season: 1, round: 1,
    })
    const kinds = post.stories.map((s) => s.kind)
    expect(kinds).toContain('analysis')
    expect(kinds).toContain('rumour')
    expect(post.stories.some((s) => s.headline.includes('Heartbreak'))).toBe(true)
    expect(post.stories.some((s) => s.headline.includes('Fastest lap'))).toBe(true)
  })
})
