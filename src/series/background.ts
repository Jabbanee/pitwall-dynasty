import type { Championship, SeriesId, SeriesState } from '../core/types'
import { openSeries, simulateFeederRound, endSeason, computeFeederStandings, FEEDER_LICENCE_POINTS, FEEDER_STARTS_BONUS } from './feederSim'
import { addNews } from '../championship/engine'

/** Advance every active feeder series by one round. Called from
 *  the top-championship `advanceRound` so feeder progression is
 *  automatic and never manual. Cheap deterministic simulation.
 *  End-of-season handling adds history, applies promotions and
 *  surfaces a top-prospect news item on the parent championship. */
export function tickFeeder(champ: Championship): string[] {
  const news: string[] = []
  if (!champ.feeder) return news
  const order: SeriesId[] = ['base.junior.regional', 'base.junior.continental', 'base.junior.aurora']
  for (const seriesId of order) {
    const state = champ.feeder[seriesId]
    if (!state) continue
    // Women's series is gated to era >= 2014 in Real Career.
    if (state.config.establishedSeason > champ.config.season) continue
    if (state.currentRoundIndex >= state.config.rounds) {
      // Season-end
      const driverPts = new Map<string, number>()
      const teamPts = new Map<string, number>()
      for (const r of state.results) {
        if (r.season !== state.currentSeason) continue
        for (const row of r.results) {
          if (row.finishPosition >= 1 && row.finishPosition <= 18) {
            const p = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0][row.finishPosition - 1] ?? 0
            if (p > 0) {
              driverPts.set(row.driverId, (driverPts.get(row.driverId) ?? 0) + p)
              if (row.teamId) teamPts.set(row.teamId, (teamPts.get(row.teamId) ?? 0) + p)
            }
          }
        }
      }
      const { promoted, champion, championTeam } = endSeason(state, state.currentSeason, { driverPts, teamPts })
      // Award licence points
      const { driverRows } = computeFeederStandings(state)
      for (let i = 0; i < driverRows.length; i++) {
        const r = driverRows[i]
        const points = FEEDER_LICENCE_POINTS[i + 1] ?? 0
        if (points === 0) continue
        const d = state.drivers[r.driverId]
        if (!d) continue
        d.eligibility.pointsCurrent += points
      }
      // 5+ starts bonus
      for (const r of driverRows) {
        if (r.starts >= 5) {
          const d = state.drivers[r.driverId]
          if (d) d.eligibility.pointsCurrent += FEEDER_STARTS_BONUS
        }
      }
      // 40 points + 5 starts in one series -> grant
      for (const d of Object.values(state.drivers)) {
        const startsInThis = state.results
          .filter((r) => r.season === state.currentSeason)
          .reduce((acc, r) => acc + r.results.filter((row) => row.driverId === d.id).length, 0)
        if (d.eligibility.pointsCurrent >= 40 && startsInThis >= 5) {
          d.eligibility.granted = true
          d.eligibility.reasons = []
        }
      }
      // Add season-end news to parent championship
      if (promoted.length > 0) {
        const championName = state.drivers[champion]?.lastName ?? champion
        const teamName = state.teams.find((t) => t.id === championTeam)?.shortName ?? ''
        addNews(champ, `${state.config.shortName} CHAMPION`, `${championName}${teamName ? ' (' + teamName + ')' : ''} crowned ${state.config.name} champion S${state.currentSeason}.`)
        if (promoted[0]) {
          const promoName = state.drivers[promoted[0]]?.lastName ?? promoted[0]
          addNews(champ, `${state.config.shortName} PROMOTED`, `${promoName} promoted to next level.`)
        }
      }
      continue
    }
    simulateFeederRound(state, state.currentRoundIndex, state.currentSeason)
    state.currentRoundIndex++
  }
  return news
}

/** Ensure the parent championship has the three feeder series
 *  initialised. Idempotent. */
export function ensureFeeder(champ: Championship): void {
  if (champ.mode !== 'career') return
  const feeder = (champ.feeder ?? (champ.feeder = {} as Record<string, SeriesState>)) as Record<string, SeriesState>
  const ids: string[] = ['base.junior.regional', 'base.junior.continental', 'base.junior.aurora']
  for (const id of ids) {
    const existing = feeder[id]
    if (existing) continue
    if (id === 'base.junior.aurora') {
      if (champ.config.eraYear === undefined || champ.config.eraYear < 2014) continue
    }
    const established = (existing as SeriesState | undefined)?.config.establishedSeason ?? 1
    feeder[id] = openSeries(id as SeriesId, champ.rngSeed, established)
  }
}
