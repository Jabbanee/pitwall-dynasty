import { createRng } from '../core/rng'
import type { Championship, SetupChoice, StrategyPlaybook, Team, TyreCompoundId } from '../core/types'

/**
 * AI managers use exactly the same strategy playbook structure as players —
 * no cheating. They evaluate circuit characteristics + forecast and pick a
 * plan deterministically from the championship seed.
 */

export function aiPrepareRound(champ: Championship, team: Team): { strategy: Partial<StrategyPlaybook>; setup: SetupChoice } {
  const round = champ.rounds[champ.currentRoundIndex]
  const circuit = champ.circuits.find((c) => c.id === round.circuitId)!
  const rng = createRng((champ.rngSeed ^ (hashStr(team.id) * 31) ^ (round.index * 7919)) >>> 0)
  const laps = circuit.characteristics.laps
  const forecast = round.packagesLocked ? undefined : champ.circuits // placeholder to avoid unused warnings
  void forecast

  const rainRisk = circuit.characteristics.rainProbability

  // --- Tyre plan: stress → fewer stops ---
  const tyreStress = circuit.characteristics.tyreStress
  let startingTyre: TyreCompoundId = 'medium'
  let stints: Array<{ fromLap: number; compound: TyreCompoundId }> = []

  if (tyreStress > 65) {
    startingTyre = rng.chance(0.6) ? 'medium' : 'hard'
    stints = [{ fromLap: Math.floor(laps * rng.range(0.38, 0.5)), compound: 'hard' }]
  } else if (tyreStress > 50) {
    if (rng.chance(0.55)) {
      startingTyre = 'soft'
      stints = [
        { fromLap: Math.floor(laps * rng.range(0.3, 0.42)), compound: 'medium' },
        { fromLap: Math.floor(laps * rng.range(0.68, 0.8)), compound: 'hard' },
      ]
    } else {
      startingTyre = 'medium'
      stints = [{ fromLap: Math.floor(laps * rng.range(0.42, 0.55)), compound: 'soft' }]
    }
  } else {
    startingTyre = rng.chance(0.7) ? 'soft' : 'medium'
    stints = [{ fromLap: Math.floor(laps * rng.range(0.35, 0.52)), compound: startingTyre === 'soft' ? 'medium' : 'hard' }]
  }

  const strategy: Partial<StrategyPlaybook> = {
    startingTyre,
    plannedStints: stints,
    weatherRules: [{
      id: 'wet-auto',
      description: 'AI: switch to rain tyres past wetness threshold',
      kind: 'wetSwitch',
      enabled: true,
      params: { threshold: rainRisk > 0.3 ? 20 : 28 },
    }],
    safetyCarRules: [{
      id: 'sc-pit',
      description: 'AI: cheap stop under Safety Car',
      kind: 'safetyCarPit',
      enabled: rng.chance(0.85),
      params: { minTyreAge: rng.int(4, 9), maxLapFraction: 0.7 },
    }],
    lateRaceRules: rng.chance(0.25)
      ? [{ id: 'late-attack', description: 'AI: attack on fresh rubber late', kind: 'lateAttack', enabled: true, params: { maxLapsRemaining: 9 } }]
      : [],
    paceMode: team.aiProfile === 'aggressive-developer' ? (rng.chance(0.4) ? 'push' : 'normal') : rng.chance(0.15) ? 'push' : 'normal',
    tyreUsage: tyreStress > 65 ? 'conserve' : rng.chance(0.3) ? 'aggressive' : 'standard',
    energy: rng.chance(0.2) ? 'deploy' : 'balanced',
    teamOrder: 'freeToRace',
  }

  // --- Setup: lean into what the track rewards and what the car is good at ---
  const perf = team.carPerformance
  const aeroStrength = (perf.lowSpeedAero + perf.mediumSpeedAero + perf.highSpeedAero) / 3 - perf.drag
  const straightStrength = perf.straightLineSpeed
  const downforceBias =
    circuit.characteristics.overtakingDifficulty > 60
      ? clampN(Math.round((straightStrength - aeroStrength) / 12), -2, 2)
      : clampN(Math.round((aeroStrength - straightStrength) / 12), -2, 2)

  const setup: SetupChoice = {
    downforceBias,
    mechanicalGripBias: clampN(Math.round((perf.traction - perf.straightLineSpeed) / 14), -2, 2),
    brakeBias: circuit.characteristics.brakingStress > 65 ? 58 : 55,
  }

  return { strategy, setup }
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function clampN(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
