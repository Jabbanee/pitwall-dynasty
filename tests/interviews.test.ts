import { describe, it, expect } from 'vitest'
import { detectInterviewTrigger, buildInterview, interviewFor, kickerFor } from '../src/media/interviews'
import type { RaceResult } from '../src/core/types'

const makeResult = (rows: Array<{ driverId: string; teamId: string; finishPosition: number; classified: boolean; startPosition?: number }>): RaceResult => ({
  roundId: '0', circuitId: 'c', simulationVersion: 'x', seed: 1, rulesHash: 'h',
  fastestLapDriverId: undefined, totalSimTime: 0, safetyCarCount: 0, vscCount: 0,
  events: [],
  results: rows.map((r) => ({
    driverId: r.driverId, teamId: r.teamId, finishPosition: r.finishPosition,
    classified: r.classified, lapsCompleted: 22, bestLapTime: undefined, pitStops: 0,
    penaltiesSeconds: 0, points: r.finishPosition === 1 ? 25 : r.finishPosition <= 10 ? 18 - r.finishPosition : 0,
    fastestLap: false, startPosition: r.startPosition ?? r.finishPosition,
  })),
})

describe('interview system', () => {
  it('triggers on an unexpected win (P1 from grid >= 6)', () => {
    const result = makeResult([
      { driverId: 'd1', teamId: 't1', finishPosition: 1, classified: true, startPosition: 8 },
      { driverId: 'd2', teamId: 't2', finishPosition: 2, classified: true },
    ])
    const champ = {
      rounds: [{ index: 0, raceResult: result, raceDone: true } as never],
      teams: [
        { id: 't1', driverIds: ['d1'] } as never,
        { id: 't2', driverIds: ['d2'] } as never,
      ],
    } as never
    const trigger = detectInterviewTrigger(result, champ)
    expect(trigger?.reason).toBe('unexpected_win')
    expect(trigger?.driverId).toBe('d1')
  })

  it('triggers on a teammate dispute when both cars are top 8', () => {
    const result = makeResult([
      { driverId: 'd1', teamId: 't1', finishPosition: 4, classified: true },
      { driverId: 'd2', teamId: 't1', finishPosition: 5, classified: true },
      { driverId: 'd3', teamId: 't2', finishPosition: 1, classified: true },
    ])
    const champ = {
      rounds: [{ index: 0, raceResult: result, raceDone: true } as never],
      teams: [
        { id: 't1', driverIds: ['d1', 'd2'] } as never,
        { id: 't2', driverIds: ['d3'] } as never,
      ],
    } as never
    const trigger = detectInterviewTrigger(result, champ)
    expect(trigger?.reason).toBe('teammate_dispute')
  })

  it('does NOT trigger on a normal 1-2 finish', () => {
    const result = makeResult([
      { driverId: 'd1', teamId: 't1', finishPosition: 1, classified: true, startPosition: 1 },
      { driverId: 'd2', teamId: 't2', finishPosition: 2, classified: true },
    ])
    const champ = {
      rounds: [{ index: 0, raceResult: result, raceDone: true } as never],
      teams: [
        { id: 't1', driverIds: ['d1'] } as never,
        { id: 't2', driverIds: ['d2'] } as never,
      ],
    } as never
    expect(detectInterviewTrigger(result, champ)).toBeNull()
  })

  it('every reason has a question, three options and a kicker', () => {
    const reasons: Array<'unexpected_win' | 'driver_collision' | 'refused_order' | 'broken_promise' | 'championship_battle' | 'publicly_unhappy' | 'teammate_dispute' | 'team_order_controversy' | 'unexpected_loss'> = [
      'unexpected_win', 'driver_collision', 'refused_order', 'broken_promise',
      'championship_battle', 'publicly_unhappy', 'teammate_dispute',
      'team_order_controversy', 'unexpected_loss',
    ]
    for (const r of reasons) {
      const t = interviewFor(r)
      expect(t.question.length).toBeGreaterThan(8)
      expect(t.options.length).toBe(3)
      expect(kickerFor(r).length).toBeGreaterThan(6)
    }
  })

  it('buildInterview wraps the templates', () => {
    const i = buildInterview('unexpected_win', 'dx', 'tx')
    expect(i.options.length).toBe(3)
    expect(i.driverId).toBe('dx')
  })
})
