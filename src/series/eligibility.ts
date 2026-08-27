import type { Championship, Driver, SeriesLicence } from '../core/types'
import { addNews } from '../championship/engine'
import { computeFeederStandings } from './feederSim'
import { FEEDER_CATALOG } from './catalog'

/** Pure function. Returns the licence state for a driver from
 *  accumulated feeder results. Does not modify the championship. */
export function computeEligibility(champ: Championship, driverId: string): SeriesLicence {
  const d = champ.drivers[driverId]
  if (!d) {
    return {
      driverId,
      seriesId: 'base.championship.wgp',
      granted: false,
      pointsRequired: 40,
      pointsCurrent: 0,
      reasons: ['Driver not found.'],
    }
  }
  // Sum points across all feeder series this driver ever raced in.
  // Skip if no history (e.g. legacy save before this pass).
  let pts = 0
  let totalStarts = 0
  if (champ.feeder) {
    for (const st of Object.values(champ.feeder)) {
      const last = st.history.length > 0 ? st.history[st.history.length - 1] : null
      if (last?.championDriverId === driverId) {
        const cfg = FEEDER_CATALOG[st.config.id]
        if (cfg?.tier === 'lower-junior') pts += 4
        else if (cfg?.tier === 'upper-junior') pts += 8
        else if (cfg?.tier === 'women') pts += 3
      }
      for (const r of st.results) {
        const row = r.results.find((x) => x.driverId === driverId)
        if (row) totalStarts++
        if (row && row.finishPosition === 1) {
          const cfg = FEEDER_CATALOG[st.config.id]
          if (cfg?.tier === 'lower-junior') pts += 4
          else if (cfg?.tier === 'upper-junior') pts += 8
          else if (cfg?.tier === 'women') pts += 3
        } else if (row && row.finishPosition <= 3) {
          const cfg = FEEDER_CATALOG[st.config.id]
          if (cfg?.tier === 'lower-junior') pts += 1
          else if (cfg?.tier === 'upper-junior') pts += 2
          else if (cfg?.tier === 'women') pts += 1
        }
      }
    }
  }
  // 5+ starts in any single feeder series -> +3
  if (champ.feeder) {
    for (const st of Object.values(champ.feeder)) {
      const startsInThis = st.results
        .flatMap((r) => r.results)
        .filter((row) => row.driverId === driverId).length
      if (startsInThis >= 5) pts += 3
    }
  }
  // 5+ test sessions counted from `testSessionLog` (we don't track
  // these explicitly in v1; future pass can extend). For now this
  // pass returns 0 and the existing 40 + 5-starts rule applies.

  const granted = pts >= 40 && totalStarts >= 5
  const reasons: string[] = []
  if (pts < 40) reasons.push(`Points ${pts} / 40 required.`)
  if (totalStarts < 5) reasons.push(`Starts ${totalStarts} / 5 required.`)
  if (granted) reasons.length = 0

  const licence: SeriesLicence = {
    driverId,
    seriesId: 'base.championship.wgp',
    granted,
    pointsRequired: 40,
    pointsCurrent: pts,
    reasons,
  }
  return licence
}

/** Refresh every driver's stored eligibility. */
export function refreshAllEligibility(champ: Championship) {
  for (const id of Object.keys(champ.drivers)) {
    const fresh = computeEligibility(champ, id)
    const d = champ.drivers[id]
    if (d) d.eligibility = fresh
  }
}

/** Promote a driver to a top-series race seat at the player's
 *  team. Validates licence eligibility and seat availability. */
export function promoteToTopTeam(
  champ: Championship,
  driver: Driver,
): { ok: boolean; reason: string } {
  if (!driver.eligibility.granted) {
    return { ok: false, reason: 'Driver is not yet licence-eligible.' }
  }
  const team = champ.teams.find((t) => t.id === champ.playerTeamId)
  if (!team) return { ok: false, reason: 'No player team in this championship.' }
  if (driver.contract?.teamId === team.id) return { ok: false, reason: 'Already in the race seat.' }
  if (team.driverIds.length >= 2) {
    const worst = team.driverIds
      .map((id) => champ.drivers[id])
      .filter((d): d is Driver => !!d)
      .sort((a, b) => a.visible.pace - b.visible.pace)[0]
    if (worst) {
      const dropId = worst.id
      team.driverIds = team.driverIds.filter((id) => id !== dropId)
      worst.contract = undefined
      addNews(champ, 'RELEASED', `${worst.lastName} released from the race seat.`)
    }
  }
  driver.contract = {
    teamId: team.id,
    salaryPerSeason: 12000,
    seasonsRemaining: 2,
    signedSeason: champ.config.season,
  }
  if (!team.driverIds.includes(driver.id)) team.driverIds.push(driver.id)
  addNews(champ, 'PROMOTED', `${driver.lastName} promoted to the top series race seat at ${team.name}.`)
  return { ok: true, reason: 'Promoted.' }
}

void computeFeederStandings
