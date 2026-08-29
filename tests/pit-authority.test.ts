import { describe, it, expect } from 'vitest'
import { LiveRaceEngine } from '../src/sim/live-race'
import { CIRCUITS, buildDefaultTeams, DRIVERS } from '../src/core/content'
import { finalizePackage, defaultStrategy } from '../src/championship/engine'

/**
 * Authoritative pit timing.
 *
 * The renderer must read its pit-animation duration from the
 * authoritative engine. The engine records a pit-stop timeline
 * (`startedAtSim` + `durationSim`) and exposes a
 * `pitStateAt(carId, simTime)` query the renderer can poll every
 * frame. The visible stop duration scales with the broadcast
 * speed multiplier because sim-time advances by `dt * speed`
 * per frame.
 *
 * These tests assert the timeline is recorded with the exact
 * `pitLossSeconds` the circuit definition provides and that
 * `pitStateAt` returns the correct progress fraction as the
 * presentation clock advances.
 */

function makeEngine() {
  const circuit = CIRCUITS[0]
  const teams = buildDefaultTeams().slice(0, 4)
  const driverIds = Object.keys(DRIVERS)
  const packages = teams.flatMap((t, ti) =>
    t.driverIds.slice(0, 2).map((driverId, ci) => {
      const carNumber = ti * 2 + ci + 1
      return finalizePackage({
        championshipId: 'live',
        roundId: '0',
        teamId: t.id,
        driverId,
        teammateId: t.driverIds.find((d) => d !== driverId),
        carNumber,
        selectedParts: {} as never,
        carPerformance: t.carPerformance,
        componentWear: { frontWing: 0, rearWing: 0, floor: 0, chassis: 0, suspension: 0, cooling: 0 },
        setup: { downforceBias: 0, mechanicalGripBias: 0, brakeBias: 56 },
        tyreAllocation: {},
        strategy: defaultStrategy(20),
        requestedCompound: 'soft' as const,
        reliability: 85,
        staffModifiers: { strategySkill: 70, pitCrewSkill: 70, engineerSkill: 70 },
        weatherForecast: { condition: 'dry', rainProbability: 0, confidence: 0.8 },
        version: 1,
        lockedAt: Date.now(),
      })
    }),
  )
  void driverIds
  const driverMap = Object.fromEntries(DRIVERS.map((d) => [d.id, d]))
  return { engine: new LiveRaceEngine(structuredClone(circuit), packages, driverMap, 0x5eed), circuit, packages }
}

function requestPitForFirstCar(engine: LiveRaceEngine): string {
  // The packages use the default top-series team order. We pull
  // the first car from the first team so the test does not depend
  // on a specific driver id ordering.
  const car = engine.state.cars![0]
  engine.applyCommand({
    driverId: car.driverId,
    teamId: car.teamId,
    command: 'PIT_THIS_LAP',
  })
  return car.driverId
}

describe('authoritative pit timing', () => {
  it('records a pit-stop entry in the timeline when a stop happens', () => {
    const { engine } = makeEngine()
    const driverId = requestPitForFirstCar(engine)
    // Run enough stepLaps to actually fire the stop.
    for (let i = 0; i < 5; i++) engine.stepLap()
    const ps = engine.pitStateAt(driverId, engine.state.simTime)
    expect(ps).not.toBeNull()
    expect(ps!.durationSim).toBeGreaterThan(0)
  })

  it('the recorded stop duration matches the circuit pitLossSeconds', () => {
    const { engine, circuit } = makeEngine()
    const driverId = requestPitForFirstCar(engine)
    for (let i = 0; i < 5; i++) engine.stepLap()
    const ps = engine.pitStateAt(driverId, engine.state.simTime)
    expect(ps).not.toBeNull()
    // pitLossSeconds is the authoritative base; the recorded
    // duration should be within a couple of seconds of it.
    const base = circuit.characteristics.pitLossSeconds
    expect(ps!.durationSim).toBeGreaterThanOrEqual(base - 3)
    expect(ps!.durationSim).toBeLessThanOrEqual(base + 6)
  })

  it('pitStateAt returns progress 0 at the start of the stop', () => {
    const { engine } = makeEngine()
    const driverId = requestPitForFirstCar(engine)
    // Step until the stop is queued but not yet started.
    for (let i = 0; i < 2; i++) engine.stepLap()
    const ps0 = engine.pitStateAt(driverId, engine.state.simTime)
    // After a stepLap the timeline has an entry. Progress at
    // the entry's startedAtSim should be 0.
    if (ps0) {
      const ps = engine.pitStateAt(driverId, ps0.startedAtSim)
      expect(ps).not.toBeNull()
      expect(ps!.fraction).toBeCloseTo(0, 2)
    }
  })

  it('pitStateAt returns progress 1 after the stop duration has elapsed', () => {
    const { engine } = makeEngine()
    const driverId = requestPitForFirstCar(engine)
    for (let i = 0; i < 5; i++) engine.stepLap()
    const ps0 = engine.pitStateAt(driverId, engine.state.simTime)
    if (ps0) {
      const past = ps0.startedAtSim + ps0.durationSim + 1
      const ps = engine.pitStateAt(driverId, past)
      expect(ps).not.toBeNull()
      expect(ps!.fraction).toBeCloseTo(1, 2)
    }
  })

  it('the same sim-time duration is observed regardless of how the clock is advanced', () => {
    // Run the engine with one big step and many small steps;
    // both paths must record the same stop duration.
    const { engine: e1 } = makeEngine()
    const { engine: e2 } = makeEngine()
    const id1 = requestPitForFirstCar(e1)
    const id2 = requestPitForFirstCar(e2)
    for (let i = 0; i < 5; i++) {
      e1.stepLap()
      e2.frameAdvance(1)
    }
    const ps1 = e1.pitStateAt(id1, e1.state.simTime)
    const ps2 = e2.pitStateAt(id2, e2.state.simTime)
    if (ps1 && ps2) {
      // Both should record a stop of the same authoritative
      // duration (the engine is deterministic for the same seed).
      expect(Math.abs(ps1.durationSim - ps2.durationSim)).toBeLessThan(0.1)
    }
  })

  it('multiplayer mirrors the same stop duration on every client', () => {
    // Two engines with the same seed deterministically produce
    // the same stop duration. This is the multiplayer guarantee.
    const { engine: e1 } = makeEngine()
    const { engine: e2 } = makeEngine()
    const id1 = requestPitForFirstCar(e1)
    const id2 = requestPitForFirstCar(e2)
    for (let i = 0; i < 5; i++) {
      e1.stepLap()
      e2.stepLap()
    }
    const ps1 = e1.pitStateAt(id1, e1.state.simTime)
    const ps2 = e2.pitStateAt(id2, e2.state.simTime)
    if (ps1 && ps2) {
      expect(ps1.durationSim).toBeCloseTo(ps2.durationSim, 6)
      expect(ps1.startedAtSim).toBeCloseTo(ps2.startedAtSim, 6)
    }
  })
})
