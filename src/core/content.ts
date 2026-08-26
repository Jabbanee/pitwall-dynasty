import { createRng } from './rng'
import type {
  Circuit,
  Driver,
  StaffMember,
  Sponsor,
  Team,
  TeamColors,
} from './types'

/**
 * Base content pack for the fictional "World Endurance Grand Prix"-style
 * championship: Pitwall Dynasty's default universe. All IDs are stable.
 */

export const BASE_CHAMPIONSHIP_ID = 'base.championship.wgp'
export const SIMULATION_VERSION = 'sim-1.0.0'

// ---------- Circuits (10) ----------

function sector(n: number, speedType: 'low' | 'medium' | 'high', overtakingChance: number) {
  return { name: `S${n}`, speedType, overtakingChance }
}

export const CIRCUITS: Circuit[] = [
  {
    id: 'base.circuit.velocita',
    name: 'Velocità Park',
    country: 'Italy',
    characteristics: {
      lengthKm: 4.9, laps: 22, lowSpeed: 30, mediumSpeed: 45, highSpeed: 65,
      straightLine: 80, overtakingDifficulty: 35, tyreStress: 55, brakingStress: 70,
      rainProbability: 0.15, pitLossSeconds: 21, safetyCarProbability: 0.18, trackEvolution: 0.5,
    },
    sectors: [sector(1, 'medium', 0.3), sector(2, 'high', 0.2), sector(3, 'low', 0.5)],
  },
  {
    id: 'base.circuit.harborfield',
    name: 'Harborfield Street Circuit',
    country: 'Australia',
    characteristics: {
      lengthKm: 3.8, laps: 28, lowSpeed: 70, mediumSpeed: 50, highSpeed: 25,
      straightLine: 40, overtakingDifficulty: 75, tyreStress: 60, brakingStress: 75,
      rainProbability: 0.1, pitLossSeconds: 24, safetyCarProbability: 0.35, trackEvolution: 0.6,
    },
    sectors: [sector(1, 'low', 0.4), sector(2, 'medium', 0.2), sector(3, 'low', 0.4)],
  },
  {
    id: 'base.circuit.silverpine',
    name: 'Silverpine Raceway',
    country: 'United Kingdom',
    characteristics: {
      lengthKm: 5.1, laps: 22, lowSpeed: 35, mediumSpeed: 55, highSpeed: 55,
      straightLine: 60, overtakingDifficulty: 55, tyreStress: 50, brakingStress: 50,
      rainProbability: 0.35, pitLossSeconds: 20, safetyCarProbability: 0.15, trackEvolution: 0.7,
    },
    sectors: [sector(1, 'high', 0.25), sector(2, 'medium', 0.35), sector(3, 'low', 0.4)],
  },
  {
    id: 'base.circuit.monteverde',
    name: 'Monteverde Hills',
    country: 'Brazil',
    characteristics: {
      lengthKm: 4.3, laps: 25, lowSpeed: 60, mediumSpeed: 60, highSpeed: 30,
      straightLine: 50, overtakingDifficulty: 45, tyreStress: 70, brakingStress: 60,
      rainProbability: 0.4, pitLossSeconds: 22, safetyCarProbability: 0.2, trackEvolution: 0.4,
    },
    sectors: [sector(1, 'medium', 0.35), sector(2, 'low', 0.3), sector(3, 'high', 0.35)],
  },
  {
    id: 'base.circuit.duneside',
    name: 'Duneside International',
    country: 'Bahrain-like Gulf',
    characteristics: {
      lengthKm: 5.4, laps: 20, lowSpeed: 40, mediumSpeed: 50, highSpeed: 60,
      straightLine: 75, overtakingDifficulty: 30, tyreStress: 65, brakingStress: 65,
      rainProbability: 0.02, pitLossSeconds: 23, safetyCarProbability: 0.12, trackEvolution: 0.3,
    },
    sectors: [sector(1, 'medium', 0.4), sector(2, 'high', 0.3), sector(3, 'low', 0.3)],
  },
  {
    id: 'base.circuit.kirinawa',
    name: 'Kirinawa Speedring',
    country: 'Japan',
    characteristics: {
      lengthKm: 5.8, laps: 19, lowSpeed: 30, mediumSpeed: 60, highSpeed: 70,
      straightLine: 65, overtakingDifficulty: 60, tyreStress: 55, brakingStress: 45,
      rainProbability: 0.3, pitLossSeconds: 21, safetyCarProbability: 0.1, trackEvolution: 0.8,
    },
    sectors: [sector(1, 'low', 0.2), sector(2, 'high', 0.25), sector(3, 'medium', 0.55)],
  },
  {
    id: 'base.circuit.nordheim',
    name: 'Nordheim Waldstrecke',
    country: 'Germany',
    characteristics: {
      lengthKm: 4.6, laps: 24, lowSpeed: 55, mediumSpeed: 55, highSpeed: 45,
      straightLine: 55, overtakingDifficulty: 50, tyreStress: 75, brakingStress: 70,
      rainProbability: 0.3, pitLossSeconds: 22, safetyCarProbability: 0.22, trackEvolution: 0.5,
    },
    sectors: [sector(1, 'medium', 0.3), sector(2, 'low', 0.4), sector(3, 'high', 0.3)],
  },
  {
    id: 'base.circuit.costaverde',
    name: 'Costa Verde Circuit',
    country: 'Portugal',
    characteristics: {
      lengthKm: 4.1, laps: 26, lowSpeed: 50, mediumSpeed: 65, highSpeed: 35,
      straightLine: 45, overtakingDifficulty: 65, tyreStress: 60, brakingStress: 55,
      rainProbability: 0.15, pitLossSeconds: 21, safetyCarProbability: 0.16, trackEvolution: 0.6,
    },
    sectors: [sector(1, 'high', 0.25), sector(2, 'low', 0.45), sector(3, 'medium', 0.3)],
  },
  {
    id: 'base.circuit.aurora',
    name: 'Aurora Bay',
    country: 'Canada',
    characteristics: {
      lengthKm: 4.4, laps: 25, lowSpeed: 45, mediumSpeed: 45, highSpeed: 60,
      straightLine: 85, overtakingDifficulty: 28, tyreStress: 50, brakingStress: 80,
      rainProbability: 0.2, pitLossSeconds: 20, safetyCarProbability: 0.28, trackEvolution: 0.45,
    },
    sectors: [sector(1, 'medium', 0.45), sector(2, 'high', 0.35), sector(3, 'low', 0.2)],
  },
  {
    id: 'base.circuit.altai',
    name: 'Altai Highlands',
    country: 'Kazakhstan',
    characteristics: {
      lengthKm: 5.6, laps: 20, lowSpeed: 40, mediumSpeed: 60, highSpeed: 55,
      straightLine: 70, overtakingDifficulty: 42, tyreStress: 68, brakingStress: 58,
      rainProbability: 0.25, pitLossSeconds: 23, safetyCarProbability: 0.18, trackEvolution: 0.55,
    },
    sectors: [sector(1, 'high', 0.3), sector(2, 'medium', 0.35), sector(3, 'low', 0.35)],
  },
]

// ---------- Drivers (20 main + rookie/reserve pool) ----------

interface DriverSeed {
  id: string
  first: string
  last: string
  nat: string
  age: number
  v: Partial<Driver['visible']>
  h: Partial<Driver['hidden']>
  salary: number
}

const DRIVER_SEEDS: DriverSeed[] = [
  // Tier 1 stars
  { id: 'base.driver.00001', first: 'Mateo', last: 'Vasquez', nat: 'ESP', age: 28, v: { pace: 92, qualifying: 93, racecraft: 90, overtaking: 88, defending: 89, consistency: 91, wetSkill: 86, tyreManagement: 84, feedback: 85 }, h: { potential: 95, pressureResistance: 90, aggression: 72 }, salary: 28000 },
  { id: 'base.driver.00002', first: 'Jonas', last: 'Lindqvist', nat: 'SWE', age: 31, v: { pace: 90, qualifying: 87, racecraft: 92, overtaking: 85, defending: 94, consistency: 90, wetSkill: 82, tyreManagement: 88, feedback: 90 }, h: { potential: 91, pressureResistance: 88, aggression: 55 }, salary: 25000 },
  { id: 'base.driver.00003', first: 'Kenji', last: 'Morimoto', nat: 'JPN', age: 26, v: { pace: 89, qualifying: 91, racecraft: 84, overtaking: 87, defending: 78, consistency: 85, wetSkill: 92, tyreManagement: 83, feedback: 88 }, h: { potential: 94, pressureResistance: 76, aggression: 66 }, salary: 22000 },
  { id: 'base.driver.00004', first: 'Alessandro', last: 'Ferraro', nat: 'ITA', age: 34, v: { pace: 87, qualifying: 85, racecraft: 91, overtaking: 83, defending: 90, consistency: 88, wetSkill: 80, tyreManagement: 90, feedback: 92 }, h: { potential: 87, pressureResistance: 85, aggression: 62 }, salary: 19000 },
  // Tier 2 solid
  { id: 'base.driver.00005', first: 'Daniel', last: 'Okafor', nat: 'GBR', age: 29, v: { pace: 84, qualifying: 83, racecraft: 85, overtaking: 86, defending: 82, consistency: 81, wetSkill: 79, tyreManagement: 80, feedback: 82 }, h: { potential: 88, pressureResistance: 80, aggression: 70 }, salary: 14000 },
  { id: 'base.driver.00006', first: 'Lucas', last: 'Mendes', nat: 'BRA', age: 24, v: { pace: 83, qualifying: 86, racecraft: 78, overtaking: 84, defending: 74, consistency: 76, wetSkill: 85, tyreManagement: 75, feedback: 77 }, h: { potential: 93, pressureResistance: 70, aggression: 78 }, salary: 11000 },
  { id: 'base.driver.00007', first: 'Ivan', last: 'Petrov', nat: 'BUL', age: 32, v: { pace: 82, qualifying: 80, racecraft: 84, overtaking: 79, defending: 86, consistency: 84, wetSkill: 74, tyreManagement: 82, feedback: 80 }, h: { potential: 82, pressureResistance: 84, aggression: 52 }, salary: 12000 },
  { id: 'base.driver.00008', first: 'Tom', last: 'Whitfield', nat: 'AUS', age: 27, v: { pace: 81, qualifying: 82, racecraft: 79, overtaking: 80, defending: 78, consistency: 80, wetSkill: 72, tyreManagement: 78, feedback: 79 }, h: { potential: 86, pressureResistance: 74, aggression: 64 }, salary: 10000 },
  // Midfield
  { id: 'base.driver.00009', first: 'Emil', last: 'Novak', nat: 'CZE', age: 30, v: { pace: 78, qualifying: 77, racecraft: 80, overtaking: 76, defending: 82, consistency: 79, wetSkill: 76, tyreManagement: 80, feedback: 78 }, h: { potential: 80, pressureResistance: 78, aggression: 58 }, salary: 8000 },
  { id: 'base.driver.00010', first: 'Rafael', last: 'Cortez', nat: 'MEX', age: 23, v: { pace: 77, qualifying: 79, racecraft: 73, overtaking: 78, defending: 70, consistency: 71, wetSkill: 80, tyreManagement: 72, feedback: 74 }, h: { potential: 90, pressureResistance: 66, aggression: 82 }, salary: 6000 },
  { id: 'base.driver.00011', first: 'Henrik', last: 'Sorensen', nat: 'DEN', age: 33, v: { pace: 76, qualifying: 75, racecraft: 79, overtaking: 73, defending: 81, consistency: 82, wetSkill: 73, tyreManagement: 81, feedback: 83 }, h: { potential: 76, pressureResistance: 82, aggression: 48 }, salary: 7000 },
  { id: 'base.driver.00012', first: 'Yusuf', last: 'Demir', nat: 'TUR', age: 25, v: { pace: 75, qualifying: 78, racecraft: 72, overtaking: 77, defending: 69, consistency: 70, wetSkill: 71, tyreManagement: 70, feedback: 72 }, h: { potential: 88, pressureResistance: 68, aggression: 76 }, salary: 5000 },
  // Lower field / rookies
  { id: 'base.driver.00013', first: 'Oliver', last: 'Grant', nat: 'CAN', age: 22, v: { pace: 71, qualifying: 72, racecraft: 67, overtaking: 70, defending: 63, consistency: 66, wetSkill: 74, tyreManagement: 65, feedback: 70 }, h: { potential: 91, pressureResistance: 60, aggression: 72 }, salary: 3000 },
  { id: 'base.driver.00014', first: 'Pierre', last: 'Laurent', nat: 'FRA', age: 36, v: { pace: 73, qualifying: 71, racecraft: 78, overtaking: 70, defending: 79, consistency: 80, wetSkill: 70, tyreManagement: 79, feedback: 85 }, h: { potential: 73, pressureResistance: 84, aggression: 44 }, salary: 5500 },
  { id: 'base.driver.00015', first: 'Sanjay', last: 'Patel', nat: 'IND', age: 24, v: { pace: 70, qualifying: 73, racecraft: 66, overtaking: 69, defending: 62, consistency: 67, wetSkill: 68, tyreManagement: 66, feedback: 71 }, h: { potential: 87, pressureResistance: 64, aggression: 68 }, salary: 2800 },
  { id: 'base.driver.00016', first: 'Nikola', last: 'Horvat', nat: 'CRO', age: 29, v: { pace: 72, qualifying: 70, racecraft: 74, overtaking: 71, defending: 75, consistency: 73, wetSkill: 66, tyreManagement: 72, feedback: 70 }, h: { potential: 74, pressureResistance: 74, aggression: 60 }, salary: 4200 },
  { id: 'base.driver.00017', first: 'Felix', last: 'Braun', nat: 'AUT', age: 21, v: { pace: 68, qualifying: 71, racecraft: 62, overtaking: 67, defending: 58, consistency: 62, wetSkill: 70, tyreManagement: 61, feedback: 68 }, h: { potential: 92, pressureResistance: 56, aggression: 74 }, salary: 2000 },
  { id: 'base.driver.00018', first: 'Diego', last: 'Salazar', nat: 'ARG', age: 27, v: { pace: 71, qualifying: 69, racecraft: 73, overtaking: 72, defending: 74, consistency: 70, wetSkill: 69, tyreManagement: 70, feedback: 69 }, h: { potential: 78, pressureResistance: 72, aggression: 66 }, salary: 3800 },
  { id: 'base.driver.00019', first: 'Antti', last: 'Korhonen', nat: 'FIN', age: 26, v: { pace: 74, qualifying: 76, racecraft: 71, overtaking: 73, defending: 70, consistency: 72, wetSkill: 78, tyreManagement: 74, feedback: 73 }, h: { potential: 84, pressureResistance: 76, aggression: 58 }, salary: 5200 },
  { id: 'base.driver.00020', first: 'Marco', last: 'Silva', nat: 'POR', age: 35, v: { pace: 70, qualifying: 68, racecraft: 76, overtaking: 68, defending: 77, consistency: 78, wetSkill: 67, tyreManagement: 77, feedback: 82 }, h: { potential: 70, pressureResistance: 82, aggression: 46 }, salary: 4500 },
  // Reserve/rookie pool (free agents)
  { id: 'base.driver.00021', first: 'Leo', last: 'Marchetti', nat: 'ITA', age: 20, v: { pace: 64, qualifying: 66, racecraft: 58, overtaking: 62, defending: 54, consistency: 58, wetSkill: 66, tyreManagement: 57, feedback: 64 }, h: { potential: 93, pressureResistance: 55, aggression: 70 }, salary: 1500 },
  { id: 'base.driver.00022', first: 'Jamal', last: 'Haddad', nat: 'MAR', age: 22, v: { pace: 63, qualifying: 65, racecraft: 59, overtaking: 64, defending: 55, consistency: 60, wetSkill: 62, tyreManagement: 58, feedback: 62 }, h: { potential: 90, pressureResistance: 58, aggression: 72 }, salary: 1300 },
  { id: 'base.driver.00023', first: 'Ethan', last: 'Brooks', nat: 'NZL', age: 23, v: { pace: 65, qualifying: 64, racecraft: 61, overtaking: 63, defending: 58, consistency: 62, wetSkill: 64, tyreManagement: 60, feedback: 63 }, h: { potential: 86, pressureResistance: 62, aggression: 64 }, salary: 1600 },
  { id: 'base.driver.00024', first: 'Andrei', last: 'Popescu', nat: 'ROU', age: 25, v: { pace: 64, qualifying: 63, racecraft: 63, overtaking: 62, defending: 60, consistency: 64, wetSkill: 60, tyreManagement: 63, feedback: 61 }, h: { potential: 80, pressureResistance: 66, aggression: 62 }, salary: 1800 },
]

function makeDriver(s: DriverSeed): Driver {
  return {
    id: s.id,
    firstName: s.first,
    lastName: s.last,
    nationality: s.nat,
    age: s.age,
    visible: {
      pace: s.v.pace ?? 70, qualifying: s.v.qualifying ?? 70, racecraft: s.v.racecraft ?? 70,
      overtaking: s.v.overtaking ?? 70, defending: s.v.defending ?? 70, consistency: s.v.consistency ?? 70,
      wetSkill: s.v.wetSkill ?? 70, tyreManagement: s.v.tyreManagement ?? 70, feedback: s.v.feedback ?? 70,
    },
    hidden: {
      potential: s.h.potential ?? 80, pressureResistance: s.h.pressureResistance ?? 70,
      aggression: s.h.aggression ?? 60, adaptability: 65, loyalty: 60, ego: 50,
      confidenceSensitivity: 55, developmentRate: 65, declineRate: 50,
    },
    dynamic: { morale: 70, confidence: 65, form: 0, fatigue: 0, seasonsWithTeam: 1 },
    salaryDemandBase: s.salary,
    history: [],
  }
}

export const DRIVERS: Driver[] = DRIVER_SEEDS.map(makeDriver)

/** Generate additional rookies deterministically for long careers. */
export function generateRookie(rngSeed: number, season: number): Driver {
  const rng = createRng(rngSeed)
  const FIRST = ['Noah', 'Liam', 'Oscar', 'Hugo', 'Ravi', 'Kaito', 'Mateus', 'Viktor', 'Amir', 'Jonas', 'Bruno', 'Theo']
  const LAST = ['Reyes', 'Kowalski', 'Tanaka', 'Duarte', 'Sharma', 'Yamada', 'Costa', 'Volkov', 'Nazari', 'Berg', 'Almeida', 'Moreau']
  const NATS = ['ESP', 'POL', 'JPN', 'POR', 'IND', 'BRA', 'RUS', 'IRN', 'SWE', 'FRA', 'USA', 'GER']
  const paceBase = rng.range(60, 72) + Math.min(season, 10) * 0.3
  const pot = Math.min(97, paceBase + rng.range(8, 26))
  return {
    id: `gen.driver.${season}.${Math.floor(rng.next() * 1e9).toString(36)}`,
    firstName: rng.pick(FIRST),
    lastName: rng.pick(LAST),
    nationality: rng.pick(NATS),
    age: rng.int(18, 24),
    visible: {
      pace: Math.round(paceBase), qualifying: Math.round(paceBase + rng.gauss(1)),
      racecraft: Math.round(paceBase - rng.range(2, 6)), overtaking: Math.round(paceBase + rng.gauss(0)),
      defending: Math.round(paceBase - rng.range(3, 8)), consistency: Math.round(paceBase - rng.range(2, 7)),
      wetSkill: Math.round(rng.range(58, 80)), tyreManagement: Math.round(paceBase - rng.range(1, 5)),
      feedback: Math.round(rng.range(58, 78)),
    },
    hidden: {
      potential: Math.round(pot), pressureResistance: Math.round(rng.range(52, 80)),
      aggression: Math.round(rng.range(40, 85)), adaptability: Math.round(rng.range(50, 85)),
      loyalty: Math.round(rng.range(35, 80)), ego: Math.round(rng.range(30, 80)),
      confidenceSensitivity: Math.round(rng.range(40, 80)), developmentRate: Math.round(rng.range(55, 90)),
      declineRate: Math.round(rng.range(35, 60)),
    },
    dynamic: { morale: 65, confidence: 55, form: 0, fatigue: 0, seasonsWithTeam: 0 },
    salaryDemandBase: Math.round(rng.range(900, 2400)),
    history: [],
  }
}

// ---------- Staff pool ----------

interface StaffSeed { id: string; name: string; role: StaffMember['role']; skill: number; salary: number; nat: string }

const STAFF_SEEDS: StaffSeed[] = [
  { id: 'base.staff.0001', name: 'Margarete Adler', role: 'teamPrincipal', skill: 88, salary: 9000, nat: 'GER' },
  { id: 'base.staff.0002', name: 'Carlos Reyes', role: 'teamPrincipal', skill: 80, salary: 6500, nat: 'ESP' },
  { id: 'base.staff.0003', name: 'Ingrid Solberg', role: 'teamPrincipal', skill: 74, salary: 4800, nat: 'NOR' },
  { id: 'base.staff.0004', name: 'David Achebe', role: 'technicalDirector', skill: 90, salary: 8500, nat: 'NGA' },
  { id: 'base.staff.0005', name: 'Sofia Marino', role: 'technicalDirector', skill: 82, salary: 6200, nat: 'ITA' },
  { id: 'base.staff.0006', name: 'Peter Lindgren', role: 'technicalDirector', skill: 75, salary: 4500, nat: 'SWE' },
  { id: 'base.staff.0007', name: 'Akira Sato', role: 'headOfAero', skill: 91, salary: 7800, nat: 'JPN' },
  { id: 'base.staff.0008', name: 'Claire Fontaine', role: 'headOfAero', skill: 83, salary: 5800, nat: 'FRA' },
  { id: 'base.staff.0009', name: 'Miloš Jurić', role: 'headOfAero', skill: 76, salary: 4200, nat: 'HRV' },
  { id: 'base.staff.0010', name: 'Robert Klein', role: 'chiefDesigner', skill: 87, salary: 6000, nat: 'AUT' },
  { id: 'base.staff.0011', name: 'Ana Beatriz Costa', role: 'chiefDesigner', skill: 79, salary: 4400, nat: 'BRA' },
  { id: 'base.staff.0012', name: 'Gareth Mills', role: 'chiefDesigner', skill: 72, salary: 3200, nat: 'GBR' },
  { id: 'base.staff.0013', name: 'Elena Vasquez', role: 'raceEngineer', skill: 85, salary: 3600, nat: 'MEX' },
  { id: 'base.staff.0014', name: 'Juha Rantanen', role: 'raceEngineer', skill: 81, salary: 3100, nat: 'FIN' },
  { id: 'base.staff.0015', name: 'Omar Farouk', role: 'raceEngineer', skill: 77, salary: 2600, nat: 'EGY' },
  { id: 'base.staff.0016', name: 'Lisa Bergström', role: 'strategist', skill: 89, salary: 4200, nat: 'SWE' },
  { id: 'base.staff.0017', name: 'Ken Watanabe', role: 'strategist', skill: 80, salary: 3300, nat: 'JPN' },
  { id: 'base.staff.0018', name: 'Paulo Ferreira', role: 'strategist', skill: 74, salary: 2400, nat: 'POR' },
  { id: 'base.staff.0019', name: 'Nadia Petrova', role: 'pitOperations', skill: 86, salary: 3400, nat: 'BUL' },
  { id: 'base.staff.0020', name: 'Jack Thompson', role: 'pitOperations', skill: 78, salary: 2500, nat: 'AUS' },
  { id: 'base.staff.0021', name: 'Chiara Ricci', role: 'pitOperations', skill: 71, salary: 1900, nat: 'ITA' },
]

export const STAFF_POOL: StaffMember[] = STAFF_SEEDS.map((s) => ({
  id: s.id,
  name: s.name,
  nationality: s.nat,
  role: s.role,
  skill: s.skill,
  hiddenPotential: Math.min(99, s.skill + 4),
  salaryDemandBase: s.salary,
}))

// ---------- Sponsors ----------

export const SPONSORS: Sponsor[] = [
  { id: 'base.sponsor.hyperion', name: 'Hyperion Dynamics', industry: 'Defense Tech', tier: 'title' },
  { id: 'base.sponsor.vortexfuel', name: 'VortexFuel', industry: 'Energy', tier: 'title' },
  { id: 'base.sponsor.quantumlabs', name: 'Quantum Labs', industry: 'Computing', tier: 'major' },
  { id: 'base.sponsor.nordbank', name: 'NordBank Group', industry: 'Finance', tier: 'major' },
  { id: 'base.sponsor.apexwear', name: 'ApexWear', industry: 'Apparel', tier: 'major' },
  { id: 'base.sponsor.celertech', name: 'CelerTech', industry: 'Telecom', tier: 'major' },
  { id: 'base.sponsor.bluepeak', name: 'BluePeak Water', industry: 'Beverage', tier: 'minor' },
  { id: 'base.sponsor.orbittools', name: 'OrbitTools', industry: 'Software', tier: 'minor' },
  { id: 'base.sponsor.granitmobility', name: 'Granit Mobility', industry: 'Automotive', tier: 'minor' },
  { id: 'base.sponsor.lumenoptics', name: 'Lumen Optics', industry: 'Consumer Tech', tier: 'minor' },
  { id: 'base.sponsor.stalwarttyres', name: 'Stalwart Tyres', industry: 'Tyres', tier: 'major' },
  { id: 'base.sponsor.fusionair', name: 'FusionAir', industry: 'HVAC', tier: 'minor' },
]

// ---------- Teams (10) ----------

interface TeamSeed {
  id: string
  name: string
  short: string
  colors: TeamColors
  reputation: number
  money: number
  driverIdx: [number, number]
  perfBias: Partial<Team['carPerformance']>
  facilities: Record<string, number>
  aiProfile: Team['aiProfile']
}

const TEAM_SEEDS: TeamSeed[] = [
  {
    id: 'base.team.titan', name: 'Titan Racing', short: 'TIT', colors: { primary: '#c8102e', secondary: '#ffffff' },
    reputation: 92, money: 180000, driverIdx: [0, 1],
    perfBias: { lowSpeedAero: 6, mediumSpeedAero: 6, highSpeedAero: 5, drag: -4, reliability: 6 },
    facilities: { designCentre: 5, windTunnel: 5, simulator: 4, factory: 4, cfd: 4, driverDevelopment: 4, scoutingNetwork: 4, pitOperationsCentre: 4 },
    aiProfile: 'balanced',
  },
  {
    id: 'base.team.aquila', name: 'Aquila Corse', short: 'AQU', colors: { primary: '#005bac', secondary: '#ffdd00' },
    reputation: 85, money: 145000, driverIdx: [2, 3],
    perfBias: { mediumSpeedAero: 5, highSpeedAero: 6, traction: 4, cooling: 3, reliability: 3 },
    facilities: { designCentre: 4, windTunnel: 5, simulator: 4, factory: 4, cfd: 3, driverDevelopment: 3, scoutingNetwork: 3, pitOperationsCentre: 3 },
    aiProfile: 'balanced',
  },
  {
    id: 'base.team.boreal', name: 'Boreal GP', short: 'BOR', colors: { primary: '#0b7a4b', secondary: '#f2f2f2' },
    reputation: 74, money: 118000, driverIdx: [4, 6],
    perfBias: { braking: 5, traction: 4, tyreWear: -5, energyEfficiency: 4 },
    facilities: { designCentre: 4, windTunnel: 3, simulator: 4, factory: 3, cfd: 3, driverDevelopment: 4, scoutingNetwork: 3, pitOperationsCentre: 3 },
    aiProfile: 'aggressive-developer',
  },
  {
    id: 'base.team.meridian', name: 'Meridian Motorsport', short: 'MER', colors: { primary: '#ff7f11', secondary: '#111111' },
    reputation: 70, money: 105000, driverIdx: [5, 7],
    perfBias: { straightLineSpeed: 6, drag: -3, lowSpeedAero: 2, reliability: 1 },
    facilities: { designCentre: 3, windTunnel: 3, simulator: 3, factory: 3, cfd: 2, driverDevelopment: 3, scoutingNetwork: 3, pitOperationsCentre: 3 },
    aiProfile: 'balanced',
  },
  {
    id: 'base.team.kestrel', name: 'Kestrel Racing', short: 'KES', colors: { primary: '#6a2c91', secondary: '#ffd700' },
    reputation: 63, money: 92000, driverIdx: [8, 10],
    perfBias: { highSpeedAero: 4, mediumSpeedAero: 3, cooling: 4, tyreHeating: -3 },
    facilities: { designCentre: 3, windTunnel: 3, simulator: 3, factory: 3, cfd: 3, driverDevelopment: 2, scoutingNetwork: 2, pitOperationsCentre: 2 },
    aiProfile: 'financial-conservative',
  },
  {
    id: 'base.team.polaris', name: 'Polaris Works', short: 'POL', colors: { primary: '#0aa1a8', secondary: '#ffffff' },
    reputation: 58, money: 84000, driverIdx: [9, 18],
    perfBias: { energyEfficiency: 6, tyreWear: -3, mediumSpeedAero: 2 },
    facilities: { designCentre: 3, windTunnel: 2, simulator: 3, factory: 3, cfd: 2, driverDevelopment: 4, scoutingNetwork: 3, pitOperationsCentre: 2 },
    aiProfile: 'aggressive-developer',
  },
  {
    id: 'base.team.sablefox', name: 'SableFox Racing', short: 'SBX', colors: { primary: '#8b6f47', secondary: '#efe6d8' },
    reputation: 52, money: 76000, driverIdx: [11, 13],
    perfBias: { braking: 3, traction: 3, drag: -2, reliability: 2 },
    facilities: { designCentre: 2, windTunnel: 2, simulator: 2, factory: 3, cfd: 2, driverDevelopment: 2, scoutingNetwork: 2, pitOperationsCentre: 3 },
    aiProfile: 'financial-conservative',
  },
  {
    id: 'base.team.vanguard', name: 'Vanguard Apex', short: 'VAN', colors: { primary: '#d4004b', secondary: '#222222' },
    reputation: 48, money: 70000, driverIdx: [12, 16],
    perfBias: { lowSpeedAero: 3, traction: 2, straightLineSpeed: 2 },
    facilities: { designCentre: 2, windTunnel: 2, simulator: 3, factory: 2, cfd: 2, driverDevelopment: 4, scoutingNetwork: 3, pitOperationsCentre: 2 },
    aiProfile: 'balanced',
  },
  {
    id: 'base.team.cobaltline', name: 'Cobalt Line', short: 'COB', colors: { primary: '#1c4cd8', secondary: '#9fd3ff' },
    reputation: 44, money: 64000, driverIdx: [14, 17],
    perfBias: { cooling: 5, reliability: 4, drag: 1 },
    facilities: { designCentre: 2, windTunnel: 2, simulator: 2, factory: 2, cfd: 2, driverDevelopment: 2, scoutingNetwork: 2, pitOperationsCentre: 2 },
    aiProfile: 'financial-conservative',
  },
  {
    id: 'base.team.horizon', name: 'Horizon GP', short: 'HOR', colors: { primary: '#e0a80d', secondary: '#333333' },
    reputation: 40, money: 60000, driverIdx: [15, 19],
    perfBias: { tyreHeating: -4, tyreWear: -2, mediumSpeedAero: 1 },
    facilities: { designCentre: 2, windTunnel: 2, simulator: 2, factory: 2, cfd: 1, driverDevelopment: 3, scoutingNetwork: 2, pitOperationsCentre: 2 },
    aiProfile: 'balanced',
  },
]

export function buildDefaultTeams(): Team[] {
  return TEAM_SEEDS.map((t) => ({
    id: t.id,
    name: t.name,
    shortName: t.short,
    colors: t.colors,
    reputation: t.reputation,
    money: t.money,
    driverIds: [DRIVERS[t.driverIdx[0]].id, DRIVERS[t.driverIdx[1]].id],
    staffIds: [],
    carPerformance: {
      lowSpeedAero: 62 + (t.perfBias.lowSpeedAero ?? 0),
      mediumSpeedAero: 62 + (t.perfBias.mediumSpeedAero ?? 0),
      highSpeedAero: 62 + (t.perfBias.highSpeedAero ?? 0),
      drag: 38 + (t.perfBias.drag ?? 0), // lower better
      straightLineSpeed: 62 + (t.perfBias.straightLineSpeed ?? 0),
      braking: 62 + (t.perfBias.braking ?? 0),
      traction: 62 + (t.perfBias.traction ?? 0),
      tyreWear: 38 + (t.perfBias.tyreWear ?? 0), // lower better
      tyreHeating: 38 + (t.perfBias.tyreHeating ?? 0), // lower better
      cooling: 62 + (t.perfBias.cooling ?? 0),
      reliability: 62 + (t.perfBias.reliability ?? 0),
      energyEfficiency: 62 + (t.perfBias.energyEfficiency ?? 0),
    },
    parts: {
      frontWing: null, rearWing: null, floor: null, chassis: null, suspension: null, cooling: null,
    },
    facilities: t.facilities as Team['facilities'],
    sponsors: [],
    aiProfile: t.aiProfile,
  }))
}
