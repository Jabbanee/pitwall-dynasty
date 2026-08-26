import { describe, expect, it } from 'vitest'
import {
  buildPaddockPost,
  generateCommentary,
} from '../src/media/commentary'
import {
  detectInterviewTrigger,
  buildInterview,
} from '../src/media/interviews'
import {
  regulationsForYear,
  teamOrderAvailability,
  codedOrderRisk,
  resolveCodedOrder,
  START_YEARS,
} from '../src/regulations/regulations'
import {
  assessCompliance,
  freshAgencyState,
} from '../src/drivers/agency'
import type { Driver, RaceResult, Championship, RaceEvent } from '../src/core/types'
import type { DriverAgencyState } from '../src/drivers/agency'

// Minimal fake Driver that satisfies the structural type
function mkDriver(over: Partial<Driver> = {}): Driver {
  return {
    id: 'd.test', firstName: 'Test', lastName: 'Driver',
    dateOfBirth: '1990-01-01', nationality: 'Atlantis',
    salaryDemandBase: 1000, potential: 70,
    visible: { pace: 70, qualifying: 70, racecraft: 70, overtaking: 70, defending: 70, consistency: 70, wetSkill: 70, tyreManagement: 70, feedback: 70 },
    hidden: { aggression: 50, ego: 50, pressureResistance: 70, loyalty: 60, adaptability: 60, professionalism: 70, stamina: 60, marketValue: 1000 },
    dynamic: { morale: 60, confidence: 60, form: 60, fatigue: 0, seasonsWithTeam: 1, momentum: 0, recentRaceResults: [] },
    ...over,
  } as Driver
}

describe('Lobby / multi-client flow logic', () => {
  it('START_YEARS includes the era range required for career creation', () => {
    expect(START_YEARS.length).toBeGreaterThanOrEqual(7)
    const years = START_YEARS.map((e) => e.year)
    expect(years).toContain(1980)
    expect(years).toContain(2022)
  })

  it('2003-2010 era correctly reports team orders as codedOnly and position swaps prohibited', () => {
    const r = regulationsForYear(2005)
    const avail = teamOrderAvailability(r)
    expect(avail.directOrders).toBe('PROHIBITED')
    expect(avail.codedOrders).toBe('RISKY')
    expect(r.positionSwapOrders).toBe('prohibited')
  })

  it('Coded order risk model produces non-zero risk for 2005 with big-team reputation', () => {
    const r = regulationsForYear(2005)
    const risk = codedOrderRisk(r, 280, 0)
    expect(risk.stewardScrutiny).toBeGreaterThan(0.2)
    expect(risk.mediaRisk).toBeGreaterThan(0.2)
  })

  it('resolveCodedOrder returns a deterministic outcome for the same roll', () => {
    const r = regulationsForYear(2005)
    const risk = codedOrderRisk(r, 280, 1)
    const a = resolveCodedOrder(risk, 0.05)
    const b = resolveCodedOrder(risk, 0.05)
    expect(a).toEqual(b)
    expect(a.investigated).toBe(true)
  })

  it('freshAgencyState returns a clean baseline (no inherited grudges) — multiplayer isolation', () => {
    const d = mkDriver()
    const s = freshAgencyState(d)
    expect(s.promises.filter((p) => p.broken).length).toBe(0)
    expect(s.memory.length).toBe(0)
    expect(s.demands.length).toBe(0)
    // Trust/morale are clamped into a stable band so a malicious serialised state
    // cannot poison the new championship.
    expect(s.morale).toBeGreaterThanOrEqual(30)
    expect(s.morale).toBeLessThanOrEqual(85)
  })

  it('assessCompliance returns a verdict for each team order kind', () => {
    const d = mkDriver()
    const ag: DriverAgencyState = freshAgencyState(d)
    for (const order of ['swap', 'hold', 'doNotFight', 'priority'] as const) {
      const v = assessCompliance(d, ag, order, {
        teammateRelationship: 50,
        isChampionshipContender: false,
        positionGap: 0,
      })
      expect(v.verdict).toBeTruthy()
    }
  })

  it('Commentary engine emits lead + analyst lines from race events', () => {
    const events: RaceEvent[] = [
      { t: 0, type: 'raceStart', detail: 'Lights out' },
      { t: 5, type: 'overtake', driverId: 'd.a', detail: 'passes d.b for P2', data: { newPosition: 2, defendedBy: 'd.b' } },
      { t: 50, type: 'lapComplete', detail: 'lap 21', data: { lap: 21 } },
    ]
    const lines = generateCommentary(events, { 'd.a': mkDriver({ id: 'd.a' }), 'd.b': mkDriver({ id: 'd.b' }) }, { totalLaps: 22 })
    expect(lines.some((l) => l.role === 'lead')).toBe(true)
    expect(lines.some((l) => /Final lap/.test(l.text))).toBe(true)
  })

  it('buildPaddockPost produces a lead headline and a winner story', () => {
    const results: RaceResult['results'] = [
      { driverId: 'd.a', teamId: 't.a', finishPosition: 1, classified: true, fastestLap: true, points: 25, lapsCompleted: 22, bestLapTime: 80, pitStops: 1, penaltiesSeconds: 0, startPosition: 1 },
      { driverId: 'd.b', teamId: 't.b', finishPosition: 2, classified: true, points: 18, lapsCompleted: 22, bestLapTime: 81, pitStops: 1, penaltiesSeconds: 0, startPosition: 2 },
    ]
    const drivers = { 'd.a': mkDriver({ id: 'd.a', lastName: 'Winner' }), 'd.b': mkDriver({ id: 'd.b', lastName: 'Second' }) }
    const post = buildPaddockPost({
      circuitName: 'Silverpine',
      results,
      drivers,
      teamNameOf: (id) => id === 't.a' ? 'Winners' : 'Others',
      season: 1,
      round: 1,
    })
    expect(post.lead.headline).toMatch(/Winner.*Silverpine/)
    expect(post.stories.length).toBeGreaterThan(0)
  })

  it('Interview trigger fires on unexpected win (winner started P>=6)', () => {
    const result: RaceResult = {
      roundId: 'r1', circuitId: 'c1', simulationVersion: '1', seed: 1, rulesHash: 'h',
      events: [], totalSimTime: 90, safetyCarCount: 0, vscCount: 0,
      fastestLapDriverId: 'd.a',
      results: [
        { driverId: 'd.a', teamId: 't.player', finishPosition: 1, classified: true, points: 25, lapsCompleted: 22, bestLapTime: 80, pitStops: 1, penaltiesSeconds: 0, startPosition: 8 },
        { driverId: 'd.b', teamId: 't.b', finishPosition: 2, classified: true, points: 18, lapsCompleted: 22, bestLapTime: 81, pitStops: 1, penaltiesSeconds: 0, startPosition: 1 },
      ],
    }
    const champ = {
      teams: [{ id: 't.player', driverIds: ['d.a'] }, { id: 't.b', driverIds: ['d.b'] }],
      playerTeamId: 't.player', rounds: [{ raceResult: result }], drivers: {},
    } as unknown as Championship
    const t = detectInterviewTrigger(result, champ)
    expect(t?.reason).toBe('unexpected_win')
    expect(t?.driverId).toBe('d.a')
  })

  it('buildInterview produces a question with 3 options for each reason', () => {
    const reasons = ['unexpected_win', 'refused_order', 'team_order_controversy', 'broken_promise', 'championship_battle'] as const
    for (const r of reasons) {
      const i = buildInterview(r, 'd.x', 't.x')
      expect(i.question.length).toBeGreaterThan(0)
      expect(i.options.length).toBeGreaterThanOrEqual(3)
      expect(i.options.every((o) => o.effects && typeof o.effects === 'object')).toBe(true)
    }
  })
})
