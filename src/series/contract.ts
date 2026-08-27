import type {
  AcademyContract, Championship, Driver, ReserveContract,
} from '../core/types'
import { addNews } from '../championship/engine'

/** Gender does NOT affect acceptance probability. The only inputs
 *  are: the driver's personality, demands, current contract, and
 *  the offer itself (salary, team, role, promises). Acceptance is
 *  computed by the same `assessCompliance` infrastructure the top
 *  championship uses. */

/** Decide if a driver accepts an academy offer. Returns a verdict
 *  string the UI can show verbatim. */
export function assessAcademyOffer(
  driver: Driver,
  teamName: string,
  _offer: AcademyContract,
): { accepted: boolean; reason: string } {
  const dem = driver.dynamic.confidence
  if (dem < 35) return { accepted: false, reason: 'Driver morale too low to consider an academy.' }
  if (driver.academyContract) return { accepted: false, reason: 'Already in another academy programme.' }
  if (driver.reserveContract) return { accepted: false, reason: 'Driver is already a reserve driver.' }
  if (driver.contract) return { accepted: false, reason: 'Driver is already racing.' }
  // Higher = more likely to accept. Higher hidden potential
  // drivers are pickier; this is the same intuition as the main
  // championship contract system.
  const base = 60
  const potential = driver.hidden.potential
  const pickiness = potential >= 90 ? -10 : potential >= 80 ? -4 : 0
  const score = base + pickiness + (dem - 50) * 0.4
  const accepted = score >= 50
  return {
    accepted,
    reason: accepted
      ? `Signed with the ${teamName} academy programme.`
      : `Declined — looking for a top-series reserve role first.`,
  }
}

/** Decide if a driver accepts a reserve role offer. */
export function assessReserveOffer(
  driver: Driver,
  teamName: string,
  offer: ReserveContract,
): { accepted: boolean; reason: string } {
  if (driver.contract) return { accepted: false, reason: 'Driver is already racing elsewhere.' }
  const dem = driver.dynamic.confidence
  if (dem < 30) return { accepted: false, reason: 'Driver morale too low.' }
  if (offer.seasonsRemaining < 1) return { accepted: false, reason: 'Offer too short.' }
  const expectedBy = offer.expectedRaceSeatBy
  const base = 60
  const potential = driver.hidden.potential
  const pickiness = potential >= 90 ? -8 : 0
  const score = base + pickiness + (dem - 50) * 0.4
  if (score < 50) return { accepted: false, reason: 'Waiting for a stronger offer.' }
  return {
    accepted: true,
    reason: `Joined ${teamName} reserves (race seat by S${expectedBy}).`,
  }
}

/** Sign a driver to the player's academy. Updates driver state and
 *  adds a news item. */
export function signToAcademy(
  champ: Championship,
  driver: Driver,
  offer: AcademyContract,
): { ok: boolean; reason: string } {
  const teamName = champ.teams.find((t) => t.id === offer.teamId)?.name ?? 'the team'
  const verdict = assessAcademyOffer(driver, teamName, offer)
  if (!verdict.accepted) return { ok: false, reason: verdict.reason }
  driver.academyContract = offer
  // Driver joins the team if not yet on it
  if (!champ.teams.find((t) => t.id === offer.teamId)?.driverIds.includes(driver.id)) {
    const team = champ.teams.find((t) => t.id === offer.teamId)
    if (team && team.driverIds.length < 2) team.driverIds.push(driver.id)
  }
  addNews(champ, 'ACADEMY SIGNING', `${driver.lastName} signs with the ${teamName} academy programme.`)
  return { ok: true, reason: verdict.reason }
}

/** Sign a driver to a top-series reserve role. */
export function signToReserve(
  champ: Championship,
  driver: Driver,
  offer: ReserveContract,
): { ok: boolean; reason: string } {
  const teamName = champ.teams.find((t) => t.id === offer.teamId)?.name ?? 'the team'
  const verdict = assessReserveOffer(driver, teamName, offer)
  if (!verdict.accepted) return { ok: false, reason: verdict.reason }
  driver.reserveContract = offer
  addNews(champ, 'RESERVE SIGNING', `${driver.lastName} joins ${teamName} as reserve.`)
  return { ok: true, reason: verdict.reason }
}

/** Promote a reserve into a race seat at the player's team. */
export function promoteReserveToRace(
  champ: Championship,
  driver: Driver,
): { ok: boolean; reason: string } {
  if (!driver.reserveContract) return { ok: false, reason: 'Driver is not a reserve.' }
  if (!driver.eligibility.granted && driver.eligibility.pointsCurrent < 40) {
    return { ok: false, reason: 'Driver is not yet licence-eligible.' }
  }
  // Player team must have a free race seat (current driverIds < 2)
  const team = champ.teams.find((t) => t.id === champ.playerTeamId)
  if (!team) return { ok: false, reason: 'No player team in this championship.' }
  // Remove the existing worst race-seat driver back to free agent
  if (team.driverIds.length >= 2) {
    const toDrop = team.driverIds
      .map((id) => champ.drivers[id])
      .filter((d): d is Driver => !!d)
      .sort((a, b) => a.visible.pace - b.visible.pace)[0]
    if (toDrop) {
      const dropId = toDrop.id
      team.driverIds = team.driverIds.filter((id) => id !== dropId)
      toDrop.contract = undefined
      toDrop.reserveContract = undefined
      toDrop.academyContract = undefined
      addNews(champ, 'RELEASED', `${toDrop.lastName} released from the race seat.`)
    }
  }
  driver.reserveContract = undefined
  driver.contract = {
    teamId: team.id,
    salaryPerSeason: 6000,
    seasonsRemaining: 2,
    signedSeason: champ.config.season,
  }
  if (!team.driverIds.includes(driver.id)) team.driverIds.push(driver.id)
  addNews(champ, 'PROMOTED', `${driver.lastName} promoted to a race seat at ${team.name}.`)
  return { ok: true, reason: 'Promoted.' }
}

/** Promote an academy driver into a reserve role. */
export function promoteAcademyToReserve(
  champ: Championship,
  driver: Driver,
): { ok: boolean; reason: string } {
  if (!driver.academyContract) return { ok: false, reason: 'Driver is not in the academy.' }
  const team = champ.teams.find((t) => t.id === driver.academyContract!.teamId)
  if (!team) return { ok: false, reason: 'Academy team missing.' }
  if (champ.playerTeamId !== team.id) return { ok: false, reason: 'Can only promote from the player team.' }
  const existingReserves = Object.values(champ.drivers).filter(
    (d) => d.reserveContract?.teamId === team.id,
  )
  if (existingReserves.length >= 2) return { ok: false, reason: 'Reserve slots are full.' }
  const offer: ReserveContract = {
    teamId: team.id,
    signedSeason: champ.config.season,
    seasonsRemaining: 2,
    salaryPerSeason: 800,
    expectedRaceSeatBy: champ.config.season + 2,
  }
  driver.academyContract = undefined
  driver.reserveContract = offer
  addNews(champ, 'ACADEMY → RESERVE', `${driver.lastName} promoted from the academy to the reserve seat at ${team.name}.`)
  return { ok: true, reason: 'Promoted to reserve.' }
}

void ({} as import('../core/types').DriverGender)
