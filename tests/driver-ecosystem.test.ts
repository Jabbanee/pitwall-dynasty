import { describe, it, expect } from 'vitest'
import { generateRookie, NAME_POOLS, DRIVERS } from '../src/core/content'
import { generateJuniorRoster } from '../src/series/catalog'
import { simulateFeederRound, computeFeederStandings, endSeason, FEEDER_LICENCE_POINTS, FEEDER_STARTS_BONUS } from '../src/series/feederSim'
import { ensureFeeder, tickFeeder, activateWomenSeries } from '../src/series/background'
import { computeEligibility, refreshAllEligibility, promoteToTopTeam } from '../src/series/eligibility'
import { addToWatchlist, scoutDriver, getReport, fundScoutingForOneWeek, getWatchlist, potentialTierFor } from '../src/series/scouting'
import { assessAcademyOffer, assessReserveOffer, signToAcademy, promoteAcademyToReserve } from '../src/series/contract'
import type { Championship, Driver, SeriesId, SeriesState } from '../src/core/types'

/** Build a minimal career championship for testing. */
function makeChamp(opts?: { eraYear?: number; seed?: number }): Championship {
  const eraYear = opts?.eraYear ?? 2024
  const seed = opts?.seed ?? 12345
  const drivers: Record<string, Driver> = {}
  // Use the real driver pool so gender and history are realistic.
  for (const d of DRIVERS) {
    const copy: Driver = JSON.parse(JSON.stringify(d))
    copy.eligibility = { driverId: copy.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: ['Insufficient points.'] }
    drivers[copy.id] = copy
  }
  const teams = [
    { id: 'team.player', name: 'Player', shortName: 'PLR', colors: { primary: '#000', secondary: '#fff' }, reputation: 70, money: 100000, driverIds: [] as string[], staffIds: [] as string[], carPerformance: { lowSpeedAero: 60, mediumSpeedAero: 60, highSpeedAero: 60, drag: 40, straightLineSpeed: 60, braking: 60, traction: 60, tyreWear: 40, tyreHeating: 40, cooling: 60, reliability: 80, energyEfficiency: 60 }, parts: { frontWing: null, rearWing: null, floor: null, chassis: null, suspension: null, cooling: null }, facilities: {}, sponsors: [], isPlayerControlled: true },
    { id: 'team.ai', name: 'AI', shortName: 'AI', colors: { primary: '#333', secondary: '#fff' }, reputation: 60, money: 80000, driverIds: [] as string[], staffIds: [] as string[], carPerformance: { lowSpeedAero: 60, mediumSpeedAero: 60, highSpeedAero: 60, drag: 40, straightLineSpeed: 60, braking: 60, traction: 60, tyreWear: 40, tyreHeating: 40, cooling: 60, reliability: 80, energyEfficiency: 60 }, parts: { frontWing: null, rearWing: null, floor: null, chassis: null, suspension: null, cooling: null }, facilities: {}, sponsors: [] },
  ]
  return {
    id: 'test',
    mode: 'career',
    name: 'Test',
    createdAt: 0,
    config: { numberOfRaces: 5, managementPhaseSeconds: 60, equalTeams: false, aiCount: 0, developmentSpeed: 1, economySpeed: 1, weatherEnabled: true, difficulty: 'normal', votingRules: { twoX: 'majority', fourXPlus: 'unanimous', rewind: 'unanimous', pause: 'majority' }, season: 1, careerKind: 'fictional', eraYear },
    teams,
    drivers,
    staffPool: [],
    circuits: [],
    rounds: [],
    currentRoundIndex: 0,
    phase: 'management',
    playerTeamId: 'team.player',
    newsFeed: [],
    history: [],
    rngSeed: seed,
    nextIds: {},
    womenSeriesEstablished: eraYear >= 2014,
  }
}

describe('gender-neutral talent pipeline', () => {
  it('female and male rookie with the same seed produce equivalent talent distributions', () => {
    // Both drivers are produced from the same seed; only the name pool
    // and gender field differ. Talent must come from the same RNG stream.
    const female = generateRookie(42, 2024, 'female')
    const male = generateRookie(42, 2024, 'male')
    expect(female.visible.pace).toBe(male.visible.pace)
    expect(female.visible.qualifying).toBe(male.visible.qualifying)
    expect(female.visible.racecraft).toBe(male.visible.racecraft)
    expect(female.hidden.potential).toBe(male.hidden.potential)
    expect(female.hidden.developmentRate).toBe(male.hidden.developmentRate)
    // gender is recorded faithfully
    expect(female.gender).toBe('female')
    expect(male.gender).toBe('male')
    // First / last names are picked from distinct pools so they differ.
    const femalePool = new Set([...NAME_POOLS.female.first, ...NAME_POOLS.female.last])
    const malePool = new Set([...NAME_POOLS.male.first, ...NAME_POOLS.male.last])
    expect(femalePool.has(female.firstName) || femalePool.has(female.lastName)).toBe(true)
    expect(malePool.has(male.firstName) || malePool.has(male.lastName)).toBe(true)
  })

  it('female rookies can reach elite potential >= 90', () => {
    let maxFemale = 0
    for (let i = 0; i < 200; i++) {
      const d = generateRookie(i * 9973 + 1, 2024, 'female')
      if (d.hidden.potential > maxFemale) maxFemale = d.hidden.potential
    }
    expect(maxFemale).toBeGreaterThanOrEqual(90)
  })

  it('female pace ceiling is not artificially lower than male', () => {
    const femaleMax = Math.max(...Array.from({ length: 200 }, (_, i) => generateRookie(i * 7919 + 5, 2024, 'female').hidden.potential))
    const maleMax = Math.max(...Array.from({ length: 200 }, (_, i) => generateRookie(i * 7919 + 5, 2024, 'male').hidden.potential))
    // Generators are identical apart from the name pool, so the max
    // reachable potential must be the same.
    expect(femaleMax).toBe(maleMax)
  })

  it('tier mapping ignores gender', () => {
    expect(potentialTierFor(95)).toBe('Generational Talent')
    expect(potentialTierFor(85)).toBe('High Potential')
    expect(potentialTierFor(70)).toBe('Good Prospect')
    expect(potentialTierFor(55)).toBe('Limited')
  })

  it('scouting tier derivation does not depend on gender', () => {
    const champ = makeChamp()
    const female = generateRookie(11, 2024, 'female')
    const male = generateRookie(11, 2024, 'male')
    female.eligibility = { driverId: female.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: ['Insufficient points.'] }
    male.eligibility = { driverId: male.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: ['Insufficient points.'] }
    champ.drivers[female.id] = female
    champ.drivers[male.id] = male
    scoutDriver(champ, female.id)
    scoutDriver(champ, male.id)
    const fReport = getReport(champ, female.id)
    const mReport = getReport(champ, male.id)
    expect(fReport).toBeDefined()
    expect(mReport).toBeDefined()
    expect(fReport!.visible.potentialTier).toBe(mReport!.visible.potentialTier)
  })

  it('academy offer assessment ignores gender', () => {
    const female = generateRookie(7, 2024, 'female')
    const male = generateRookie(7, 2024, 'male')
    female.eligibility = { driverId: female.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: [] }
    male.eligibility = { driverId: male.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: [] }
    // Drive the deterministic inputs identical: high potential, high
    // confidence. Acceptance must match.
    female.hidden.potential = 88
    male.hidden.potential = 88
    female.dynamic.confidence = 70
    male.dynamic.confidence = 70
    const f = assessAcademyOffer(female, 'Player', { teamId: 'team.player', signedSeason: 1, seasonsRemaining: 2, stipendPerSeason: 200 })
    const m = assessAcademyOffer(male, 'Player', { teamId: 'team.player', signedSeason: 1, seasonsRemaining: 2, stipendPerSeason: 200 })
    expect(f.accepted).toBe(m.accepted)
  })

  it('reserve offer assessment ignores gender', () => {
    const female = generateRookie(7, 2024, 'female')
    const male = generateRookie(7, 2024, 'male')
    female.hidden.potential = 88
    male.hidden.potential = 88
    female.dynamic.confidence = 70
    male.dynamic.confidence = 70
    const offer = { teamId: 'team.player', signedSeason: 1, seasonsRemaining: 2, salaryPerSeason: 800, expectedRaceSeatBy: 3 }
    expect(assessReserveOffer(female, 'Player', offer).accepted).toBe(assessReserveOffer(male, 'Player', offer).accepted)
  })

  it('licence eligibility ignores gender', () => {
    const champ = makeChamp()
    const female = generateRookie(7, 2024, 'female')
    const male = generateRookie(7, 2024, 'male')
    female.eligibility = { driverId: female.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 80, reasons: [] }
    male.eligibility = { driverId: male.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 80, reasons: [] }
    female.history = [{ season: 1, seriesId: 'base.junior.continental', teamId: 'team.ai', starts: 6, wins: 1, podiums: 2, poles: 0, fastestLaps: 0, points: 60, championshipPosition: 2 }]
    male.history = [{ season: 1, seriesId: 'base.junior.continental', teamId: 'team.ai', starts: 6, wins: 1, podiums: 2, poles: 0, fastestLaps: 0, points: 60, championshipPosition: 2 }]
    champ.drivers[female.id] = female
    champ.drivers[male.id] = male
    const fLicence = computeEligibility(champ, female.id)
    const mLicence = computeEligibility(champ, male.id)
    expect(fLicence.granted).toBe(mLicence.granted)
  })

  it('deterministic elite female career path reaches licence eligibility', () => {
    const champ = makeChamp({ eraYear: 2024, seed: 4242 })
    ensureFeeder(champ)
    expect(champ.feeder).toBeDefined()
    expect(champ.feeder!['base.junior.regional']).toBeDefined()
    expect(champ.feeder!['base.junior.continental']).toBeDefined()
    expect(champ.feeder!['base.junior.aurora']).toBeDefined()

    // Simulate 12 seasons worth of feeder rounds. The tick loops all
    // three feeder series per call so each tick advances one round in
    // every active series. We need 12*30 = 360 ticks to finish 12
    // seasons across all three series. The eligibility helper then
    // awards licence points retroactively based on feeder history.
    for (let i = 0; i < 12 * 30; i++) tickFeeder(champ)
    refreshAllEligibility(champ)
    const grantedFemales = Object.values(champ.drivers).filter((d) => d.gender === 'female' && d.eligibility.granted)
    expect(grantedFemales.length).toBeGreaterThan(0)
  })
})

describe('feeder series mechanics', () => {
  it('opens the three fictional series with stable IDs', () => {
    const champ = makeChamp({ eraYear: 2024 })
    ensureFeeder(champ)
    expect(champ.feeder!['base.junior.regional']).toBeDefined()
    expect(champ.feeder!['base.junior.continental']).toBeDefined()
    expect(champ.feeder!['base.junior.aurora']).toBeDefined()
  })

  it('does NOT open Aurora in a pre-2014 career', () => {
    const champ = makeChamp({ eraYear: 2005 })
    expect(champ.womenSeriesEstablished).toBe(false)
    ensureFeeder(champ)
    expect(champ.feeder!['base.junior.aurora']).toBeUndefined()
  })

  it('opens Aurora when womenSeriesEstablished flips to true on a fresh champ', () => {
    const champ = makeChamp({ eraYear: 2005 })
    ensureFeeder(champ)
    expect(champ.feeder!['base.junior.aurora']).toBeUndefined()
    // A later historical event (e.g. the federation ratifies a women's
    // championship) flips the flag via the dedicated activation helper.
    const ok = activateWomenSeries(champ)
    expect(ok).toBe(true)
    expect(champ.feeder!['base.junior.aurora']).toBeDefined()
    expect(champ.womenSeriesEstablished).toBe(true)
    // Idempotent
    expect(activateWomenSeries(champ)).toBe(false)
  })

  it('generates mixed-gender regional and continental grids', () => {
    const roster = generateJuniorRoster('base.junior.regional', 100)
    const aurora = generateJuniorRoster('base.junior.aurora', 100)
    const male = roster.filter((r) => r.gender === 'male').length
    const female = roster.filter((r) => r.gender === 'female').length
    expect(male).toBeGreaterThan(0)
    expect(female).toBeGreaterThan(0)
    // Aurora is mostly female but not 100% so scouts can still see
    // mixed fields in the women's series.
    const auroraFemale = aurora.filter((r) => r.gender === 'female').length
    expect(auroraFemale).toBeGreaterThan(aurora.length * 0.7)
  })

  it('runs deterministic feeder rounds', () => {
    const champ = makeChamp({ eraYear: 2024, seed: 9999 })
    ensureFeeder(champ)
    const state = champ.feeder!['base.junior.regional']
    const r1 = simulateFeederRound(state, 0, 0)
    const r2 = simulateFeederRound(state, 1, 0)
    expect(r1.results.length).toBeGreaterThan(0)
    expect(r2.results.length).toBeGreaterThan(0)
    expect(r1.results[0].driverId).not.toBe(r2.results[0].driverId || '')
  })

  it('completes a season and updates history', () => {
    const champ = makeChamp({ eraYear: 2024, seed: 7777 })
    ensureFeeder(champ)
    const state = champ.feeder!['base.junior.regional']
    for (let i = 0; i < state.config.rounds; i++) simulateFeederRound(state, i, 0)
    const standings = computeFeederStandings(state)
    const driverPts = new Map(standings.driverRows.map((r) => [r.driverId, r.points]))
    const teamPts = new Map(standings.teamRows.map((r) => [r.teamId, r.points]))
    const result = endSeason(state, 0, { driverPts, teamPts })
    expect(result.champion).toBeDefined()
    expect(state.history.length).toBe(1)
    expect(state.currentSeason).toBe(1)
  })

  it('driver history records the feeder series id', () => {
    const champ = makeChamp({ eraYear: 2024, seed: 1234 })
    ensureFeeder(champ)
    const state = champ.feeder!['base.junior.regional']
    for (let i = 0; i < state.config.rounds; i++) simulateFeederRound(state, i, 0)
    const standings = computeFeederStandings(state)
    const driverPts = new Map(standings.driverRows.map((r) => [r.driverId, r.points]))
    const teamPts = new Map(standings.teamRows.map((r) => [r.teamId, r.points]))
    endSeason(state, 0, { driverPts, teamPts })
    for (const d of Object.values(state.drivers)) {
      expect(d.history.length).toBeGreaterThan(0)
      expect(d.history[0].seriesId).toBe('base.junior.regional')
    }
  })

  it('replenishes the grid at season rollover (drivers remain unique)', () => {
    const champ = makeChamp({ eraYear: 2024, seed: 555 })
    ensureFeeder(champ)
    const feeder = champ.feeder as Record<SeriesId, SeriesState>
    const before = Object.keys(feeder['base.junior.regional'].drivers).length
    for (let i = 0; i < 6 * 30; i++) tickFeeder(champ)
    const after = Object.keys(feeder['base.junior.continental'].drivers).length
    // All driver ids remain unique across the championship
    const allIds = new Set<string>()
    for (const sid of Object.keys(feeder)) {
      for (const id of Object.keys(feeder[sid as SeriesId].drivers)) {
        expect(allIds.has(id)).toBe(false)
        allIds.add(id)
      }
    }
    expect(before).toBeGreaterThan(0)
    expect(after).toBeGreaterThan(0)
  })

  it('long-career stress: 12 seasons remains stable', () => {
    const champ = makeChamp({ eraYear: 2024, seed: 2468 })
    ensureFeeder(champ)
    for (let s = 0; s < 12; s++) {
      for (let r = 0; r < 30; r++) tickFeeder(champ)
    }
    refreshAllEligibility(champ)
    // Feeder grids still populated
    const feeder = champ.feeder as Record<SeriesId, SeriesState>
    for (const sid of Object.keys(feeder)) {
      const st = feeder[sid as SeriesId]
      expect(Object.keys(st.drivers).length).toBeGreaterThan(0)
    }
    // Female drivers are present in every series
    for (const sid of Object.keys(feeder)) {
      const st = feeder[sid as SeriesId]
      const females = Object.values(st.drivers).filter((d) => d.gender === 'female').length
      expect(females).toBeGreaterThan(0)
    }
    // No duplicate driver ids
    const ids = new Set<string>()
    for (const d of Object.values(champ.drivers)) {
      expect(ids.has(d.id)).toBe(false)
      ids.add(d.id)
    }
  })

  it('AI-run top series: licence-eligible drivers include women', () => {
    const champ = makeChamp({ eraYear: 2024, seed: 31337 })
    ensureFeeder(champ)
    // The feeder simulation is competitive; the top 1-3 per season
    // win licence points (8/6/4 per tier). Over 12 seasons, the
    // top finishers accumulate > 40 licence points. We run 12
    // seasons and verify that BOTH male and female drivers reach
    // licence eligibility. The pipeline is gender-neutral, so the
    // gender mix depends on the underlying generator; the test
    // asserts that at least one driver (of either gender) qualifies
    // and that the gender of the granted drivers is not
    // artificially biased.
    for (let s = 0; s < 12; s++) {
      for (let r = 0; r < 30; r++) tickFeeder(champ)
    }
    refreshAllEligibility(champ)
    const granted = Object.values(champ.drivers).filter((d) => d.eligibility.granted)
    expect(granted.length).toBeGreaterThan(0)
    // The granted-driver pool contains at least one female prospect.
    // If a particular run does not surface a female winner (small
    // sample) the underlying generator still produces them with the
    // same talent distribution. We assert gender is NOT a blocker:
    // granted drivers exist, and their points are at least 40.
    for (const d of granted) {
      expect(d.eligibility.pointsCurrent).toBeGreaterThanOrEqual(40)
    }
    const grantedFemales = granted.filter((d) => d.gender === 'female')
    // The pipeline is gender-neutral, so we should see at least one
    // female qualifier within 12 seasons.
    expect(grantedFemales.length).toBeGreaterThan(0)
  })
})

describe('scouting engine', () => {
  it('high confidence narrows the visible range; low confidence widens it', () => {
    const champ = makeChamp()
    const d = generateRookie(99, 2024, 'female')
    d.eligibility = { driverId: d.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: [] }
    champ.drivers[d.id] = d
    scoutDriver(champ, d.id)
    const r0 = getReport(champ, d.id)!
    const width0 = r0.visible.pace[1] - r0.visible.pace[0]
    fundScoutingForOneWeek(champ)
    fundScoutingForOneWeek(champ)
    fundScoutingForOneWeek(champ)
    fundScoutingForOneWeek(champ)
    fundScoutingForOneWeek(champ)
    const r1 = getReport(champ, d.id)!
    const width1 = r1.visible.pace[1] - r1.visible.pace[0]
    expect(width1).toBeLessThanOrEqual(width0)
  })

  it('never reveals the numeric hidden potential', () => {
    const champ = makeChamp()
    const d = generateRookie(3, 2024, 'female')
    d.hidden.potential = 97
    d.eligibility = { driverId: d.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: [] }
    champ.drivers[d.id] = d
    scoutDriver(champ, d.id)
    const r = getReport(champ, d.id)!
    expect(r.visible.potentialTier).toBe('Generational Talent')
    // Numeric potential is not exposed via the public report
    const json = JSON.stringify(r)
    expect(json.includes('97')).toBe(false)
  })

  it('watchlist adds and removes drivers', () => {
    const champ = makeChamp()
    const d = generateRookie(1, 2024, 'female')
    d.eligibility = { driverId: d.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: [] }
    champ.drivers[d.id] = d
    const r = addToWatchlist(champ, d.id)
    expect(r.added).toBe(true)
    expect(getWatchlist(champ).map((w) => w.driverId)).toContain(d.id)
    const r2 = addToWatchlist(champ, d.id)
    expect(r2.added).toBe(false)
  })
})

describe('academy and reserve contracts', () => {
  it('signs and releases from the academy', () => {
    const champ = makeChamp()
    const d = generateRookie(1, 2024, 'female')
    d.eligibility = { driverId: d.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: [] }
    champ.drivers[d.id] = d
    const r = signToAcademy(champ, d, { teamId: 'team.player', signedSeason: 1, seasonsRemaining: 2, stipendPerSeason: 200 })
    expect(r.ok).toBe(true)
    expect(d.academyContract).toBeDefined()
    // Cannot re-sign while still in the academy
    const r2 = signToAcademy(champ, d, { teamId: 'team.player', signedSeason: 1, seasonsRemaining: 2, stipendPerSeason: 200 })
    expect(r2.ok).toBe(false)
  })

  it('promotes academy to reserve', () => {
    const champ = makeChamp()
    const d = generateRookie(1, 2024, 'female')
    d.eligibility = { driverId: d.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: [] }
    champ.drivers[d.id] = d
    signToAcademy(champ, d, { teamId: 'team.player', signedSeason: 1, seasonsRemaining: 2, stipendPerSeason: 200 })
    const r = promoteAcademyToReserve(champ, d)
    expect(r.ok).toBe(true)
    expect(d.academyContract).toBeUndefined()
    expect(d.reserveContract).toBeDefined()
  })

  it('refuses to promote an ineligible driver to top team', () => {
    const champ = makeChamp()
    const d = generateRookie(1, 2024, 'female')
    d.eligibility = { driverId: d.id, seriesId: 'base.championship.wgp', granted: false, pointsRequired: 40, pointsCurrent: 0, reasons: ['Insufficient points.'] }
    champ.drivers[d.id] = d
    d.reserveContract = { teamId: 'team.player', signedSeason: 1, seasonsRemaining: 1, salaryPerSeason: 800, expectedRaceSeatBy: 2 }
    const r = promoteToTopTeam(champ, d)
    expect(r.ok).toBe(false)
  })

  it('promotes a licence-eligible reserve to race seat', () => {
    const champ = makeChamp()
    const d = generateRookie(1, 2024, 'female')
    d.eligibility = { driverId: d.id, seriesId: 'base.championship.wgp', granted: true, pointsRequired: 40, pointsCurrent: 50, reasons: [] }
    champ.drivers[d.id] = d
    d.reserveContract = { teamId: 'team.player', signedSeason: 1, seasonsRemaining: 1, salaryPerSeason: 800, expectedRaceSeatBy: 2 }
    const r = promoteToTopTeam(champ, d)
    expect(r.ok).toBe(true)
    expect(d.contract?.teamId).toBe('team.player')
  })
})

describe('long-career stress test (12 seasons)', () => {
  it('keeps grids populated, women represented, and licence working', () => {
    const champ = makeChamp({ eraYear: 2024, seed: 31415 })
    ensureFeeder(champ)
    const seedsAtStart = Object.keys(champ.drivers).length
    for (let s = 0; s < 12; s++) {
      for (let r = 0; r < 30; r++) tickFeeder(champ)
      champ.config.season++
    }
    refreshAllEligibility(champ)
    // Feeder grids populated
    const feeder = champ.feeder as Record<SeriesId, SeriesState>
    for (const sid of Object.keys(feeder)) {
      const st = feeder[sid as SeriesId]
      expect(Object.keys(st.drivers).length).toBeGreaterThan(0)
    }
    // No duplicate ids
    const allIds = new Set<string>()
    for (const d of Object.values(champ.drivers)) {
      expect(allIds.has(d.id)).toBe(false)
      allIds.add(d.id)
    }
    // Women are represented in every feeder series
    for (const sid of Object.keys(feeder)) {
      const st = feeder[sid as SeriesId]
      const females = Object.values(st.drivers).filter((d) => d.gender === 'female').length
      expect(females).toBeGreaterThan(0)
    }
    // Some female drivers have elite potential tiers
    const eliteFemales = Object.values(champ.drivers).filter((d) => d.gender === 'female' && d.hidden.potential >= 90)
    expect(eliteFemales.length).toBeGreaterThan(0)
    // Licence points system remains consistent
    expect(FEEDER_LICENCE_POINTS[1]).toBe(8)
    expect(FEEDER_STARTS_BONUS).toBe(3)
    // Driver pool didn't crash
    expect(Object.keys(champ.drivers).length).toBeGreaterThan(seedsAtStart - 4)
  })
})
