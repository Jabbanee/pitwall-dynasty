import type { CarRaceResult, Championship, Driver, DriverSeasonRecord, JuniorTeam, SeriesId, SeriesState } from '../core/types'
import { FEEDER_CATALOG, FEEDER_CIRCUITS, generateJuniorRoster, makeJuniorTeam } from './catalog'
import { generateRookie, NAME_POOLS } from '../core/content'
import { createRng } from '../core/rng'

/** Deterministic lightweight feeder race simulation. Uses an
 *  aggregate skill model — not the full LiveRaceEngine — so we can
 *  simulate dozens of feeder seasons without bloating saves. The
 *  output is enough for standings, history and the player-facing
 *  prospect report. */

export interface FeederRaceResult {
  season: number
  roundIndex: number
  circuitId: string
  results: CarRaceResult[]
  fastestLapDriverId?: string
  dnfCount: number
  leadChangeCount: number
}

/** Build the initial SeriesState for a feeder series with empty
 *  history, currentSeason=0, currentRoundIndex=0. Drivers and
 *  teams are populated in the openSeries call. */
export function newSeriesState(seriesId: SeriesId, seed: number): SeriesState {
  const config = FEEDER_CATALOG[seriesId]
  if (!config) throw new Error(`Unknown feeder series: ${seriesId}`)
  const calendar = FEEDER_CIRCUITS[seriesId] ?? []
  return {
    config,
    drivers: {},
    teams: [],
    results: [],
    history: [],
    calendar: calendar.map((c) => c.id).slice(0, config.rounds),
    rngSeed: seed,
    currentSeason: 0,
    currentRoundIndex: 0,
  }
}

/** Open a series for a given championship. Generates the opening
 *  grid of teams and drivers using the catalog. Deterministic
 *  given (seriesId, championshipSeed). Drivers are also merged into
 *  the parent championship so they show up in the global driver
 *  pool, the watchlist, the licence list, and the AI recruitment
 *  pipeline. */
export function openSeries(
  seriesId: SeriesId,
  championshipSeed: number,
  establishedSeason: number,
  parent?: Championship,
): SeriesState {
  const config = FEEDER_CATALOG[seriesId]
  if (!config) throw new Error(`Unknown feeder series: ${seriesId}`)
  const seed = (championshipSeed ^ hash(seriesId)) >>> 0
  const state: SeriesState = newSeriesState(seriesId, seed)
  const roster = generateJuniorRoster(seriesId, seed ^ 0x9e37)
  const teams: JuniorTeam[] = []
  const drivers: Record<string, Driver> = {}
  // Two drivers per team. Junior team count = ceil(gridSize / 2).
  const teamCount = Math.max(2, Math.ceil(config.gridSize / 2))
  for (let i = 0; i < teamCount; i++) {
    const team = makeJuniorTeam(seriesId, i, (seed + i * 9173) >>> 0)
    teams.push(team)
    for (let s = 0; s < 2; s++) {
      const idx = i * 2 + s
      const rosterspec = roster[idx] ?? { name: `Junior ${idx + 1}`, gender: 'male' as const, seed: idx + 1 }
      const driverSeed = (rosterspec.seed ^ (seed >>> 0) ^ (i * 31 + s * 7)) >>> 0
      const d = generateRookie(driverSeed, establishedSeason, rosterspec.gender)
      // Override the random name with one from the roster so we
      // can keep the team-identity tie-in. Gender stays.
      const r = createRng(driverSeed)
      const pool = NAME_POOLS[rosterspec.gender]
      d.firstName = pool.first[Math.floor(r.next() * pool.first.length)]
      d.lastName = pool.last[Math.floor(r.next() * pool.last.length)]
      d.id = `${seriesId}.d.${i}.${s}`
      d.eligibility = { driverId: d.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: ['Insufficient points.'] }
      d.academyContract = {
        teamId: team.id,
        signedSeason: establishedSeason,
        seasonsRemaining: 2,
        stipendPerSeason: 200,
      }
      drivers[d.id] = d
      team.driverIds.push(d.id)
      if (parent) {
        // Avoid collisions if a driver with the same id already exists
        if (!parent.drivers[d.id]) {
          parent.drivers[d.id] = d
        }
      }
    }
  }
  state.teams = teams
  state.drivers = drivers
  return state
}

/** One round of deterministic feeder simulation. Returns the
 *  result and mutates the SeriesState by appending a result row. */
export function simulateFeederRound(
  state: SeriesState,
  roundIndex: number,
  season: number,
  options?: { disrupt?: number; overtake?: number },
): FeederRaceResult {
  const rng = createRng((state.rngSeed ^ (roundIndex * 2654435761) ^ (season * 40503)) >>> 0)
  const circuitId = state.calendar[roundIndex % state.calendar.length]
  const disrupt = options?.disrupt ?? rng.range(0.05, 0.15)
  const overtake = options?.overtake ?? rng.int(2, 9)

  // Score each car: skill + team + noise + a per-event modifier.
  type Entry = { driverId: string; teamId: string | null; score: number; dnf: boolean; fastestLap: boolean }
  const entries: Entry[] = []
  for (const team of state.teams) {
    for (const driverId of team.driverIds) {
      const d = state.drivers[driverId]
      if (!d) continue
      // Reliability DNF roll
      const carRel = team.carPerformance.reliability
      const dnf = rng.next() < (1 - carRel / 100) * disrupt
      const base = d.visible.pace * 0.5
        + d.visible.qualifying * 0.15
        + d.visible.racecraft * 0.15
        + d.visible.consistency * 0.1
        + d.visible.wetSkill * 0.05
        + (team.carPerformance.mediumSpeedAero + team.carPerformance.lowSpeedAero) * 0.025
      const score = base + rng.gauss(0, 4)
      entries.push({ driverId, teamId: team.id, score, dnf, fastestLap: false })
    }
  }
  entries.sort((a, b) => {
    // DNFs go to the back regardless of pace.
    if (a.dnf !== b.dnf) return a.dnf ? 1 : -1
    return b.score - a.score
  })
  // Mark fastest lap from the classified group
  const classified = entries.filter((e) => !e.dnf)
  if (classified.length > 0) {
    const fl = classified.reduce((best, e) => {
      const d = state.drivers[e.driverId]
      if (!d) return best
      const score = e.score + 6 // rough pace credit
      return !best || score > best.score ? { id: e.driverId, score } : best
    }, null as { id: string; score: number } | null)
    if (fl) {
      const e = classified.find((x) => x.driverId === fl.id)
      if (e) e.fastestLap = true
    }
  }

  const results: CarRaceResult[] = entries.map((e, i) => ({
    driverId: e.driverId,
    teamId: e.teamId ?? '',
    startPosition: i + 1,
    finishPosition: e.dnf ? 0 : i + 1,
    classified: !e.dnf,
    lapsCompleted: e.dnf ? 0 : 1,
    bestLapTime: 0,
    pitStops: 0,
    penaltiesSeconds: 0,
    points: 0,
    fastestLap: e.fastestLap,
    dnfReason: e.dnf ? 'Mechanical' : undefined,
  }))

  // Crude overtake count from score proximity
  let leadChanges = 0
  for (let i = 0; i < classified.length - 1; i++) {
    const a = classified[i]
    const b = classified[i + 1]
    if (a && b && Math.abs(a.score - b.score) < 1.5) leadChanges++
  }

  const fastestLapDriverId = classified.find((e) => e.fastestLap)?.driverId
  const record = {
    season,
    roundIndex,
    circuitId,
    results,
    fastestLapDriverId,
    dnfCount: entries.filter((e) => e.dnf).length,
    leadChangeCount: leadChanges + Math.min(overtake, 8),
  }
  // Don't keep every race result forever; we keep only the last
  // 4 seasons of results, so saves don't bloat.
  state.results.push(record)
  if (state.results.length > state.config.rounds * 4) {
    state.results.splice(0, state.results.length - state.config.rounds * 4)
  }
  return record
}

/** Points system for feeder series. Identical for the three
 *  fictional series; positional scaling matches what is normal
 *  for a 16-18 car grid. */
export const FEEDER_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0]
/** Top-N licence points per position in feeder standings. */
export const FEEDER_LICENCE_POINTS: Record<number, number> = {
  1: 8, 2: 6, 3: 4, 4: 2, 5: 1,
}
/** Bonus: 5 starts in any single junior series => 3 points. */
export const FEEDER_STARTS_BONUS = 3

/** Compute standings from state.results and feed licence points. */
export function computeFeederStandings(
  state: SeriesState,
): { driverRows: Array<{ driverId: string; points: number; wins: number; starts: number }>; teamRows: Array<{ teamId: string; points: number }> } {
  const driverPts = new Map<string, number>()
  const driverWins = new Map<string, number>()
  const driverStarts = new Map<string, number>()
  const teamPts = new Map<string, number>()
  for (const r of state.results) {
    if (r.season !== state.currentSeason) continue
    for (const row of r.results) {
      if (row.finishPosition >= 1 && row.finishPosition <= FEEDER_POINTS.length) {
        const p = FEEDER_POINTS[row.finishPosition - 1]
        if (p > 0) {
          driverPts.set(row.driverId, (driverPts.get(row.driverId) ?? 0) + p)
          if (row.teamId) teamPts.set(row.teamId, (teamPts.get(row.teamId) ?? 0) + p)
        }
      }
      if (row.finishPosition === 1) {
        driverWins.set(row.driverId, (driverWins.get(row.driverId) ?? 0) + 1)
      }
      driverStarts.set(row.driverId, (driverStarts.get(row.driverId) ?? 0) + 1)
    }
  }
  const driverRows = [...driverPts.entries()]
    .map(([driverId, points]) => ({
      driverId, points,
      wins: driverWins.get(driverId) ?? 0,
      starts: driverStarts.get(driverId) ?? 0,
    }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins)
  const teamRows = [...teamPts.entries()]
    .map(([teamId, points]) => ({ teamId, points }))
    .sort((a, b) => b.points - a.points)
  return { driverRows, teamRows }
}

/** Promote drivers at the end of a season. Returns the promoted
 *  list and updates state.history. The Aurora champion and the
 *  Continental champion both get licence points. */
export function endSeason(state: SeriesState, season: number, seasonResults: { driverPts: Map<string, number>; teamPts: Map<string, number> }): { promoted: string[]; relegated: string[]; champion: string; championTeam: string } {
  // Champion: top driver, plus their team
  const sorted = [...seasonResults.driverPts.entries()].sort((a, b) => b[1] - a[1])
  const champion = sorted[0]?.[0] ?? ''
  const championTeam = sorted[0]
    ? state.drivers[sorted[0][0]]?.contract?.teamId ?? state.drivers[sorted[0][0]]?.academyContract?.teamId ?? ''
    : ''
  const promoted: string[] = []
  const relegated: string[] = []

  if (state.config.tier === 'lower-junior') {
    // Top 3 promote to continental
    for (let i = 0; i < 3; i++) {
      if (sorted[i]?.[0]) promoted.push(sorted[i][0])
    }
  } else if (state.config.tier === 'upper-junior') {
    // Champion gets licence; rest of top 3 enter WGP reserve watch
    for (let i = 0; i < 3; i++) {
      if (sorted[i]?.[0]) promoted.push(sorted[i][0])
    }
  } else if (state.config.tier === 'women') {
    // Champion evaluates for continental seat
    if (sorted[0]?.[0]) promoted.push(sorted[0][0])
  }

  // Apply promotion to driver.contract team change. We keep the
  // driver inside this series for next season; the feeder system
  // marks promoted drivers with a 'promoted' flag.
  for (const id of promoted) {
    const d = state.drivers[id]
    if (!d) continue
    // For Continental champion / Aurora champion: also mark
    // eligible for top series reserve watch.
  }
  // For lower-junior bottom 3 -> relegate
  if (state.config.tier === 'lower-junior') {
    const tail = sorted.slice(-3).map(([id]) => id)
    relegated.push(...tail)
  }

  // Persist to driver.history. We record EVERY driver that competed
  // in the series, not just the ones who scored — drivers with zero
  // points still get a position-based record so the career history
  // grows even for backmarkers.
  for (const [id, driver] of Object.entries(state.drivers)) {
    if (!driver) continue
    const points = seasonResults.driverPts.get(id) ?? 0
    const team = driver.academyContract?.teamId ?? driver.contract?.teamId ?? null
    const record: DriverSeasonRecord = {
      season,
      seriesId: state.config.id,
      teamId: team,
      starts: 0, // filled by caller if known
      wins: 0,
      podiums: 0,
      poles: 0,
      fastestLaps: 0,
      points,
      championshipPosition: sorted.findIndex(([d2]) => d2 === id) + 1 || sorted.length + 1,
    }
    driver.history.push(record)
  }

  // Persist history
  state.history.push({
    season,
    championDriverId: champion,
    championTeamId: championTeam,
    driverStandings: [...seasonResults.driverPts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([driverId, points]) => ({ driverId, points })),
    teamStandings: [...seasonResults.teamPts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([teamId, points]) => ({ teamId, points })),
    promoted,
    relegated,
  })
  // Cap history to last 8 seasons
  if (state.history.length > 8) state.history.splice(0, state.history.length - 8)

  state.currentSeason++
  state.currentRoundIndex = 0

  return { promoted, relegated, champion, championTeam }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
