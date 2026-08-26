import { simulateQualifying, simulateRace } from '../sim/race-sim'
import {
  addNews,
  buildTeamRacePackages,
  computeStandings,
  endSeason,
  settleRoundFinances,
  tickDevelopment,
  tickFacilities,
} from './engine'
import { defaultStrategy } from './engine'
import { createRng } from '../core/rng'
import type {
  Championship,
  RaceEvent,
  RacePackage,
  StrategyPlaybook,
  TeamId,
} from '../core/types'

/**
 * GameEngine — the "server process". Owns the authoritative championship
 * state. The UI never mutates race outcomes; it requests actions and reads
 * revealed state through this API.
 */

export interface EngineEvents {
  onNews?: (headline: string, body: string) => void
}

export class GameEngine {
  champ: Championship
  /** Locked race packages for the current round (authoritative). */
  private lockedPackages: Map<TeamId, RacePackage> = new Map()

  constructor(champ: Championship) {
    this.champ = champ
  }

  get currentRound() {
    return this.champ.rounds[this.champ.currentRoundIndex]
  }

  circuitOf(roundIndex: number) {
    const round = this.champ.rounds[roundIndex]
    return this.champ.circuits.find((c) => c.id === round.circuitId)!
  }

  // -------------------------------------------------------------------------
  // Lock & simulate
  // -------------------------------------------------------------------------

  lockRound(seedOverride?: number): { seed: number } {
    const round = this.currentRound
    if (round.packagesLocked) return { seed: roundSeed(this.champ, round.index) }
    const seed = seedOverride ?? roundSeed(this.champ, round.index)

    // Build immutable race packages: TWO cars per team, one per driver
    const allPackages: RacePackage[] = []
    for (const team of this.champ.teams) {
      const saved = this.pendingStrategy.get(team.id)
      for (const pkg of buildTeamRacePackages(this.champ, team, round)) {
        let out = pkg
        if (saved) {
          out = finalizePkg({ ...pkg, strategy: mergeStrategy(pkg.strategy, saved.strategy ?? {}), setup: saved.setup ?? pkg.setup })
        }
        allPackages.push(out)
      }
    }
    round.packagesLocked = true

    // Qualifying — one entry per car (20+ rows for 10 teams)
    const qualiPkgs = allPackages.map((pkg) => ({
      championshipId: pkg.championshipId,
      roundId: pkg.roundId,
      teamId: pkg.teamId,
      driverId: pkg.driverId,
      carPerformance: pkg.carPerformance,
      setup: pkg.setup,
      qualiTyre: 'soft' as const,
      version: 1,
      hash: pkg.hash,
    }))
    const qualiResult = simulateQualifying({
      roundId: `${round.index}`,
      circuit: this.circuitOf(round.index),
      packages: qualiPkgs,
      drivers: this.champ.drivers,
      seed,
      weatherForecast: { rainProbability: 0.2 },
    })
    round.qualifyingResult = qualiResult
    round.qualifyingDone = true
    round.phase = 'raceBroadcast'

    // Grid order: qualifying rows are already one-per-car; match by driver
    const byDriver = new Map(allPackages.map((p) => [p.driverId, p]))
    const orderedPackages: RacePackage[] = []
    for (const row of qualiResult.rows) {
      const pkg = byDriver.get(row.driverId)
      if (pkg) {
        orderedPackages.push(pkg)
        byDriver.delete(row.driverId)
      }
    }
    // Safety: any car missing from quali starts at the back
    for (const pkg of byDriver.values()) orderedPackages.push(pkg)

    const raceResult = simulateRace({
      roundId: `${round.index}`,
      circuit: this.circuitOf(round.index),
      packages: orderedPackages,
      drivers: this.champ.drivers,
      seed: (seed ^ 0x5aced) >>> 0,
      weatherEnabled: this.champ.config.weatherEnabled,
    })
    void fixRaceResultTyping(raceResult)
    round.raceResult = raceResult
    round.raceDone = true
    round.phase = 'roundResults'

    settleRoundFinances(this.champ, round.index)
    this.publishRaceNews()
    return { seed }
  }

  private pendingStrategy = new Map<TeamId, { strategy?: Partial<StrategyPlaybook>; setup?: import('../core/types').SetupChoice }>()

  updateStrategy(teamId: TeamId, patch: { strategy?: Partial<StrategyPlaybook>; setup?: import('../core/types').SetupChoice }) {
    if (this.currentRound.packagesLocked) return
    this.pendingStrategy.set(teamId, { ...this.pendingStrategy.get(teamId), ...patch })
  }

  // -------------------------------------------------------------------------
  // Reveal-safe access (future event protection)
  // -------------------------------------------------------------------------

  /**
   * Returns events up to `upToTime` only. Clients never receive future
   * outcomes before the broadcast cursor passes them.
   */
  revealEvents(upToTime: number): RaceEvent[] {
    const result = this.currentRound.raceResult
    if (!result) return []
    return result.events.filter((e) => e.t <= upToTime)
  }

  revealResults(): import('../core/types').RaceResult | undefined {
    // Only after the race is complete in broadcast terms; local prototype
    // reveals once raceDone. Full replay data becomes available here.
    return this.currentRound.raceResult
  }

  standings() {
    return computeStandings(this.champ)
  }

  // -------------------------------------------------------------------------
  // Round progression
  // -------------------------------------------------------------------------

  advanceRound(): 'nextRound' | 'seasonComplete' {
    const news = [
      ...tickDevelopment(this.champ.teams),
      ...tickFacilities(this.champ.teams, this.champ.rngSeed ^ (this.champ.currentRoundIndex + this.champ.config.season * 31)),
    ]
    for (const n of news) addNews(this.champ, 'DEVELOPMENT', n)

    // Driver form/morale drift based on last result
    updateDriverDynamics(this.champ)

    if (this.champ.currentRoundIndex + 1 >= this.champ.rounds.length) {
      const res = endSeason(this.champ)
      const dName = this.champ.drivers[res.championDriver]?.lastName ?? res.championDriver
      const tName = this.champ.teams.find((t) => t.id === res.championTeam)?.name ?? res.championTeam
      addNews(this.champ, 'NEW CHAMPION', `${dName} and ${tName} have been crowned champions.`)
      this.champ.phase = 'seasonComplete'
      return 'seasonComplete'
    }
    this.champ.currentRoundIndex++
    this.champ.phase = 'management'
    this.lockedPackages.clear()
    return 'nextRound'
  }

  private publishRaceNews() {
    const result = this.currentRound.raceResult
    if (!result) return
    const winner = result.results[0]
    if (!winner) return
    const wName = this.champ.drivers[winner.driverId]?.lastName ?? winner.driverId
    const wTeam = this.champ.teams.find((t) => t.id === winner.teamId)?.name ?? ''
    const circuitName = this.circuitOf(this.champ.currentRoundIndex).name
    addNews(this.champ, `RACE RESULT — ${circuitName}`, `${wName} (${wTeam}) wins at ${circuitName}. Fastest lap: ${this.champ.drivers[result.fastestLapDriverId ?? '']?.lastName ?? 'n/a'}.`)
    const podium = result.results.filter((r) => r.classified).slice(0, 3)
    if (podium.length === 3 && podium[2].startPosition > 8) {
      const surprise = this.champ.drivers[podium[2].driverId]?.lastName
      addNews(this.champ, 'SURPRISE PODIUM', `${surprise} shocks the paddock with a podium from P${podium[2].startPosition}.`)
    }
  }
}

function finalizePkg(pkg: RacePackage): RacePackage {
  const { hash: _drop, ...rest } = pkg
  let h = 2166136261
  for (const c of JSON.stringify(rest)) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return { ...pkg, hash: (h >>> 0).toString(16) }
}

function mergeStrategy(base: StrategyPlaybook, patch: Partial<StrategyPlaybook>): StrategyPlaybook {
  return {
    ...base,
    ...patch,
    plannedStints: patch.plannedStints ?? base.plannedStints,
    weatherRules: patch.weatherRules ?? base.weatherRules,
    safetyCarRules: patch.safetyCarRules ?? base.safetyCarRules,
    lateRaceRules: patch.lateRaceRules ?? base.lateRaceRules,
  }
}

export function roundSeed(champ: Championship, roundIndex: number): number {
  return ((champ.rngSeed ^ (roundIndex * 2654435761) ^ (champ.config.season * 40503)) >>> 0)
}

function fixRaceResultTyping(_r: unknown) {
  /* placeholder to keep imports honest */
}

/** Post-race driver morale/form/confidence updates. */
function updateDriverDynamics(champ: Championship) {
  const round = champ.rounds[champ.currentRoundIndex]
  const result = round?.raceResult
  if (!result) return
  const rng = createRng(champ.rngSeed ^ (round.index * 977))
  for (const r of result.results) {
    const drv = champ.drivers[r.driverId]
    if (!drv) continue
    const expected = Math.max(1, Math.min(20, drv.visible.pace / 5))
    const overPerform = expected - r.finishPosition
    drv.dynamic.form = Math.max(-1, Math.min(1, drv.dynamic.form * 0.6 + overPerform * 0.06 + rng.gauss(0, 0.05)))
    drv.dynamic.confidence = Math.max(10, Math.min(99, drv.dynamic.confidence + overPerform * 1.4))
    drv.dynamic.morale = Math.max(10, Math.min(99, drv.dynamic.morale + overPerform * 1.1))
    drv.history.push({
      season: champ.config.season,
      teamId: r.teamId,
      points: r.points,
      wins: r.finishPosition === 1 ? 1 : 0,
    })
  }
}

// Convenience re-export for AI managers
export { defaultStrategy }
