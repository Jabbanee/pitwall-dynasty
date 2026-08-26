import { createRng, fnv1a } from '../core/rng'
import {
  CIRCUITS,
  DRIVERS,
  SPONSORS,
  STAFF_POOL,
  buildDefaultTeams,
  BASE_CHAMPIONSHIP_ID,
} from '../core/content'
import { STAFF_ROLES } from '../core/types'
import type {
  Championship,
  ChampionshipConfig,
  Id,
  RoundState,
  SponsorContract,
  StaffMember,
  StaffRoleId,
  Team,
} from '../core/types'

export function defaultConfig(overrides?: Partial<ChampionshipConfig>): ChampionshipConfig {
  return {
    numberOfRaces: 5,
    managementPhaseSeconds: 210,
    equalTeams: false,
    aiCount: 0,
    developmentSpeed: 1,
    economySpeed: 1,
    weatherEnabled: true,
    difficulty: 'normal',
    votingRules: { twoX: 'majority', fourXPlus: 'unanimous', rewind: 'unanimous', pause: 'majority' },
    season: 1,
    ...overrides,
  }
}

let idCounter = 0
export function newId(prefix: string): Id {
  return `${prefix}.${Date.now().toString(36)}.${(idCounter++).toString(36)}`
}

export function createChampionship(
  mode: Championship['mode'],
  name: string,
  configOverrides?: Partial<ChampionshipConfig>,
  options?: { playerTeamIndex?: number; teamCount?: number; seed?: number; createTeamName?: string },
): Championship {
  const rng = createRng(options?.seed ?? (Date.now() ^ 0xabcdef) >>> 0)
  const config = defaultConfig(configOverrides)
  // Career defaults: any career championship without explicit era is 2022,
  // and the kind defaults to fictional.
  if (mode === 'career' && config.careerKind === undefined) {
    config.careerKind = 'fictional'
  }
  if (config.eraYear === undefined) {
    config.eraYear = mode === 'career' ? 2022 : 2024
  }
  const teamCount = options?.teamCount ?? 10

  const teams = buildDefaultTeams().slice(0, teamCount)
  const driverIds = new Set<string>()
  for (const t of teams) t.driverIds.forEach((d) => driverIds.add(d))

  // Assign staff deterministically: every team gets one member of each critical
  // role; remaining named staff spread as upgrades. Gaps are filled with
  // generated staff so no team is left without coverage.
  const staffByRole = new Map<StaffRoleId, typeof STAFF_POOL>()
  for (const role of STAFF_ROLES) {
    staffByRole.set(role, STAFF_POOL.filter((s) => s.role === role).map((s) => ({ ...s })))
  }
  for (const team of teams) {
    team.staffIds = []
  }
  const usedStaffIds = new Set<string>()
  const assignedStaff: StaffMember[] = []
  let genCounter = 0
  for (let ri = 0; ri < STAFF_ROLES.length; ri++) {
    const role = STAFF_ROLES[ri]
    const pool = staffByRole.get(role)!
    for (let ti = 0; ti < teamCount; ti++) {
      const team = teams[(ri * 3 + ti) % teamCount]
      const base = pool[ti % Math.max(1, pool.length)]
      if (!base) continue
      // Same named person cannot work for two teams — clone with unique id when exhausted
      let entry: StaffMember
      if (usedStaffIds.has(base.id)) {
        entry = {
          ...structuredClone(base),
          id: `${base.id}.g${genCounter++}`,
          skill: Math.max(40, base.skill - 8 - ((ti / Math.max(1, pool.length)) | 0) * 4),
          contract: undefined,
        }
      } else {
        entry = base
      }
      usedStaffIds.add(entry.id)
      entry.contract = { teamId: team.id, salaryPerSeason: entry.salaryDemandBase, seasonsRemaining: 2, signedSeason: 1 }
      team.staffIds.push(entry.id)
      if (!assignedStaff.some((s) => s.id === entry.id)) assignedStaff.push(entry)
    }
  }
  void usedStaffIds

  // Sponsors: give each team 2-3 contracts scaled by reputation
  for (const team of teams) {
    team.sponsors = makeInitialSponsors(team, rng)
  }

  if (options?.createTeamName) {
    // Player replaces the weakest team with their own created team
    const idx = teamCount - 1
    const base = teams[idx]
    const customTeam: Team = {
      ...base,
      id: `custom.team.${fnv1a(options.createTeamName + Date.now())}`,
      name: options.createTeamName,
      shortName: options.createTeamName.slice(0, 3).toUpperCase(),
      colors: { primary: '#20c997', secondary: '#101418' },
      reputation: Math.max(25, base.reputation - 15),
      money: Math.round(base.money * 0.85),
      carPerformance: Object.fromEntries(
        Object.entries(base.carPerformance).map(([k, v]) => [k, v - 4]),
      ) as unknown as Team['carPerformance'],
      isPlayerControlled: true,
    }
    base.isPlayerControlled = false
    teams[idx] = customTeam
  } else if (options?.playerTeamIndex !== undefined && options.playerTeamIndex >= 0) {
    teams[options.playerTeamIndex].isPlayerControlled = true
  }

  const drivers: Championship['drivers'] = {}
  for (const d of DRIVERS.map((x) => structuredClone(x))) {
    drivers[d.id] = d
  }
  // Attach driver contracts to teams
  for (const t of teams) {
    for (const dId of t.driverIds) {
      if (drivers[dId]) {
        drivers[dId].contract = { teamId: t.id, salaryPerSeason: drivers[dId].salaryDemandBase, seasonsRemaining: rng.int(1, 3), signedSeason: 1 }
        drivers[dId].dynamic.seasonsWithTeam = 1
      }
    }
  }

  const calendar = pickCalendar(rng, config.numberOfRaces)
  const rounds: RoundState[] = calendar.map((circuitId, index) => ({
    index,
    circuitId,
    phase: 'management',
    packagesLocked: false,
    qualifyingDone: false,
    raceDone: false,
    practiceBonus: {},
  }))

  return {
    id: newId('champ'),
    mode,
    name,
    createdAt: Date.now(),
    config,
    teams,
    drivers,
    staffPool: [...assignedStaff.map((s) => structuredClone(s)), ...STAFF_POOL.filter((s) => !usedStaffIds.has(s.id)).map((s) => structuredClone(s))],
    circuits: structuredClone(CIRCUITS),
    rounds,
    currentRoundIndex: 0,
    phase: 'management',
    playerTeamId: teams.find((t) => t.isPlayerControlled)?.id,
    joinCode: fnv1a(`${BASE_CHAMPIONSHIP_ID}${Date.now()}`).slice(0, 6).toUpperCase(),
    newsFeed: [],
    history: [],
    rngSeed: options?.seed ?? ((Date.now() ^ 0x12345678) >>> 0),
    nextIds: {},
  }
}

function pickCalendar(rng: ReturnType<typeof createRng>, count: number): string[] {
  const shuffled = rng.shuffle([...CIRCUITS.map((c) => c.id)])
  const out: string[] = []
  while (out.length < count) {
    out.push(...shuffled)
  }
  return out.slice(0, count)
}

function makeInitialSponsors(team: Team, rng: ReturnType<typeof createRng>): SponsorContract[] {
  const eligible = SPONSORS.filter((s) => {
    if (s.tier === 'title') return team.reputation >= 75
    if (s.tier === 'major') return team.reputation >= 45
    return true
  })
  const picked = rng.shuffle([...eligible]).slice(0, rng.int(2, 3))
  return picked.map((s) => ({
    sponsorId: s.id,
    basePaymentPerRace:
      s.tier === 'title' ? 900 : s.tier === 'major' ? 450 : 180,
    positionBonus: s.tier === 'title' ? 60 : s.tier === 'major' ? 30 : 12,
    expectationPosition: s.tier === 'title' ? 3 : s.tier === 'major' ? 6 : 10,
    championshipBonus: s.tier === 'title' ? 8000 : s.tier === 'major' ? 3000 : 800,
    reputationRequirement: s.tier === 'title' ? 75 : s.tier === 'major' ? 45 : 0,
    seasonsRemaining: rng.int(1, 3),
  }))
}
