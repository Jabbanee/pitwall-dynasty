import type { Circuit, SeriesConfig, JuniorTeam } from '../core/types'
import { generateRookie, NAME_POOLS } from '../core/content'
import type { Rng } from '../core/rng'
import { createRng } from '../core/rng'

/**
 * Catalogue of the three fictional feeder series that sit under
 * the top championship. All ids / names / colours / emblems live
 * here so future passes can rebrand them without touching
 * downstream code.
 */
export const FEEDER_CATALOG: Record<string, SeriesConfig> = {
  'base.junior.regional': {
    id: 'base.junior.regional',
    name: 'Regional Formula',
    shortName: 'REGIONAL',
    tier: 'lower-junior',
    color: '#4ea1ff',
    blurb: 'Entry-level open-wheel championship. Raw rookies, family teams, and one-make specialists battle for the chance to graduate to Continental.',
    rounds: 8,
    gridSize: 18,
    isWomenSeries: false,
    establishedSeason: 1,
    emblemSvg: emblemSvgRegional(),
  },
  'base.junior.continental': {
    id: 'base.junior.continental',
    name: 'Continental Formula',
    shortName: 'CONTINENTAL',
    tier: 'upper-junior',
    color: '#d4a017',
    blurb: 'The main step before the top series. Top three promote directly into WGP reserve consideration; the champion earns an elite racing licence evaluation.',
    rounds: 10,
    gridSize: 16,
    isWomenSeries: false,
    establishedSeason: 1,
    emblemSvg: emblemSvgContinental(),
  },
  'base.junior.aurora': {
    id: 'base.junior.aurora',
    name: 'Aurora Formula',
    shortName: 'AURORA',
    tier: 'women',
    color: '#e63946',
    blurb: 'A dedicated development pathway for female single-seater talent. The champion is evaluated for a Continental seat the following season.',
    rounds: 8,
    gridSize: 16,
    isWomenSeries: true,
    establishedSeason: 2014,
    emblemSvg: emblemSvgAurora(),
  },
}

function emblemSvgRegional(): string {
  return `<svg viewBox="0 0 200 80" width="100%" height="100%"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#4ea1ff"/><stop offset="100%" stop-color="#2a6df4"/></linearGradient></defs><rect width="200" height="80" fill="url(#g)" opacity="0.18" rx="6"/><text x="100" y="48" text-anchor="middle" font-family="Rajdhani,Inter,sans-serif" font-weight="700" font-size="22" letter-spacing="3" fill="#4ea1ff">REGIONAL</text><text x="100" y="66" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9" letter-spacing="2" fill="rgba(255,255,255,0.5)">FORMULA · EST. 1971</text></svg>`
}

function emblemSvgContinental(): string {
  return `<svg viewBox="0 0 200 80" width="100%" height="100%"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#d4a017"/><stop offset="100%" stop-color="#8a6a0f"/></linearGradient></defs><rect width="200" height="80" fill="url(#g)" opacity="0.20" rx="6"/><text x="100" y="46" text-anchor="middle" font-family="Rajdhani,Inter,sans-serif" font-weight="700" font-size="22" letter-spacing="3" fill="#d4a017">CONTINENTAL</text><text x="100" y="66" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9" letter-spacing="2" fill="rgba(255,255,255,0.5)">FORMULA · EST. 1985</text></svg>`
}

function emblemSvgAurora(): string {
  return `<svg viewBox="0 0 200 80" width="100%" height="100%"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#e63946"/><stop offset="100%" stop-color="#aa2230"/></linearGradient></defs><rect width="200" height="80" fill="url(#g)" opacity="0.20" rx="6"/><text x="100" y="46" text-anchor="middle" font-family="Rajdhani,Inter,sans-serif" font-weight="700" font-size="22" letter-spacing="3" fill="#e63946">AURORA</text><text x="100" y="66" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9" letter-spacing="2" fill="rgba(255,255,255,0.5)">FORMULA · EST. 2014</text></svg>`
}

export const FEEDER_CIRCUITS: Record<string, Circuit[]> = {
  'base.junior.regional': regionalCircuits(),
  'base.junior.continental': continentalCircuits(),
  'base.junior.aurora': auroraCircuits(),
}

function regionalCircuits(): Circuit[] {
  // Procedural small circuits. Names are fictional.
  return [
    mkCircuit('base.circuit.feeder.northloop', 'Northloop Park', 'ITA', { lengthKm: 3.2, laps: 24 }),
    mkCircuit('base.circuit.feeder.coastal', 'Coastal Bend', 'BRA', { lengthKm: 3.6, laps: 22 }),
    mkCircuit('base.circuit.feeder.parkring', 'Parkring Heights', 'GER', { lengthKm: 3.4, laps: 22 }),
    mkCircuit('base.circuit.feeder.dunes', 'Duneside National', 'ARE', { lengthKm: 4.0, laps: 18 }),
    mkCircuit('base.circuit.feeder.pacific', 'Pacific Park', 'JPN', { lengthKm: 3.0, laps: 24 }),
    mkCircuit('base.circuit.feeder.alpine', 'Alpine Loop', 'AUT', { lengthKm: 3.3, laps: 23 }),
    mkCircuit('base.circuit.feeder.bayfront', 'Bayfront Street', 'AUS', { lengthKm: 3.1, laps: 24 }),
    mkCircuit('base.circuit.feeder.velodrome', 'Velodrome Raceway', 'NED', { lengthKm: 2.8, laps: 26 }),
  ]
}
function continentalCircuits(): Circuit[] {
  return [
    mkCircuit('base.circuit.feeder.continental.nordring', 'Nordring Grand Prix', 'GER', { lengthKm: 4.6, laps: 20 }),
    mkCircuit('base.circuit.feeder.continental.iberica', 'Ibérica Hills', 'ESP', { lengthKm: 4.3, laps: 21 }),
    mkCircuit('base.circuit.feeder.continental.lakefront', 'Lakefront Raceway', 'ITA', { lengthKm: 4.0, laps: 22 }),
    mkCircuit('base.circuit.feeder.continental.silverhill', 'Silverhill Park', 'GBR', { lengthKm: 4.5, laps: 21 }),
    mkCircuit('base.circuit.feeder.continental.suzuka', 'Suzuka East', 'JPN', { lengthKm: 4.8, laps: 19 }),
    mkCircuit('base.circuit.feeder.continental.austin', 'Austin Twin', 'USA', { lengthKm: 5.1, laps: 18 }),
    mkCircuit('base.circuit.feeder.continental.klang', 'Klang Valley', 'MAS', { lengthKm: 4.2, laps: 21 }),
    mkCircuit('base.circuit.feeder.continental.algarve', 'Algarve Hills', 'POR', { lengthKm: 4.6, laps: 20 }),
    mkCircuit('base.circuit.feeder.continental.estoril', 'Estoril Park', 'POR', { lengthKm: 4.4, laps: 21 }),
    mkCircuit('base.circuit.feeder.continental.mugello', 'Tuscan Ring', 'ITA', { lengthKm: 5.2, laps: 17 }),
  ]
}
function auroraCircuits(): Circuit[] {
  return [
    mkCircuit('base.circuit.feeder.aurora.brooklands', 'Brooklands Park', 'GBR', { lengthKm: 3.0, laps: 24 }),
    mkCircuit('base.circuit.feeder.aurora.lyon', 'Lyon Raceway', 'FRA', { lengthKm: 3.2, laps: 23 }),
    mkCircuit('base.circuit.feeder.aurora.aragon', 'Aragon International', 'ESP', { lengthKm: 3.5, laps: 22 }),
    mkCircuit('base.circuit.feeder.aurora.brno', 'Brno Hills', 'CZE', { lengthKm: 3.6, laps: 21 }),
    mkCircuit('base.circuit.feeder.aurora.monza', 'Junior Monza', 'ITA', { lengthKm: 3.2, laps: 22 }),
    mkCircuit('base.circuit.feeder.aurora.brandshatch', 'Brands Hatch Junior', 'GBR', { lengthKm: 2.9, laps: 24 }),
    mkCircuit('base.circuit.feeder.aurora.estorilj', 'Estoril Junior', 'POR', { lengthKm: 3.1, laps: 23 }),
    mkCircuit('base.circuit.feeder.aurora.budapest', 'Budapest Park', 'HUN', { lengthKm: 3.4, laps: 22 }),
  ]
}

function mkCircuit(id: string, name: string, country: string, opts: { lengthKm: number; laps: number }): Circuit {
  return {
    id: id as Circuit['id'],
    name,
    country,
    characteristics: {
      lengthKm: opts.lengthKm,
      laps: opts.laps,
      lowSpeed: 40, mediumSpeed: 55, highSpeed: 50,
      straightLine: 55, overtakingDifficulty: 55, tyreStress: 55, brakingStress: 55,
      rainProbability: 0.25, pitLossSeconds: 20, safetyCarProbability: 0.18, trackEvolution: 0.5,
    },
    sectors: [
      { name: 'S1', speedType: 'medium', overtakingChance: 0.4 },
      { name: 'S2', speedType: 'medium', overtakingChance: 0.4 },
      { name: 'S3', speedType: 'medium', overtakingChance: 0.4 },
    ],
  }
}

/** Junior team names per series — all fictional. */
const JUNIOR_TEAM_NAMES: Record<string, string[]> = {
  'base.junior.regional': [
    'Ridgewood Junior', 'Pacific Coast', 'Thruxton Rising', 'Stadium Motorsport',
    'Apex Junior', 'Brno Young Lions', 'Nordschleife Junior', 'Croft Rising',
    'Mallala Junior', 'Eastern Creek', 'Sokol Junior', 'Iberian Rising',
    'Doha Junior', 'Suzuka Rising', 'Fuji Junior', 'Hampton Down',
    'Knockhill Junior', 'Anderstorp Junior',
  ],
  'base.junior.continental': [
    'Nordring Junior Team', 'Tuscan Academy', 'Pacific Rising',
    'Silverstone Academy', 'Klang Motorsport', 'Algarve Academy',
    'Iberian Continental', 'Atlantic Continental', 'Verstappen-named slot',
    'Mount Panorama Junior', 'Brands Hatch Continental',
    'Zandvoort Junior', 'Imola Junior', 'Paul Ricard Junior',
    'Daytona Continental',
  ],
  'base.junior.aurora': [
    'Aurora Lyon', 'Aurora Monza', 'Aurora Aragon', 'Aurora Brands',
    'Aurora Brno', 'Aurora Estoril', 'Aurora Budapest', 'Aurora Pacific',
    'Aurora Iberia', 'Aurora Adriatic', 'Aurora Atlantic',
    'Aurora Nordic', 'Aurora Alpine', 'Aurora Istria', 'Aurora Lusitan',
    'Aurora Dunes',
  ],
}

/** Build a junior team with a generated identity and a fitted car
 *  for the series. */
export function makeJuniorTeam(
  seriesId: keyof typeof FEEDER_CATALOG,
  index: number,
  seed: number,
): JuniorTeam {
  const rng = createRng(seed)
  const names = JUNIOR_TEAM_NAMES[seriesId] ?? [`Junior ${index + 1}`]
  const id = `junior.team.${seriesId}.${index + 1}.${seed.toString(36)}`
  return {
    id,
    name: names[index % names.length],
    shortName: names[index % names.length].split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase(),
    colors: juniorTeamColor(rng, index),
    reputation: 50 + rng.int(-10, 25),
    money: 6000 + rng.int(0, 8000),
    driverIds: [],
    staffIds: [],
    carPerformance: juniorCarPerformance(rng, index),
    parts: defaultEmptyParts(),
    facilities: { driverDevelopment: 1, scoutingNetwork: 1 },
    sponsors: [],
    aiProfile: rng.pick(['balanced', 'aggressive-developer', 'financial-conservative'] as const),
  }
}

function defaultEmptyParts(): JuniorTeam['parts'] {
  return {
    frontWing: null, rearWing: null, floor: null, chassis: null, suspension: null, cooling: null,
  }
}

function juniorCarPerformance(rng: Rng, _index: number): JuniorTeam['carPerformance'] {
  // Slightly weaker than top teams; deterministic.
  return {
    lowSpeedAero: 50 + rng.int(0, 12),
    mediumSpeedAero: 50 + rng.int(0, 12),
    highSpeedAero: 50 + rng.int(0, 12),
    drag: 50 + rng.int(0, 15),
    straightLineSpeed: 50 + rng.int(0, 12),
    braking: 50 + rng.int(0, 12),
    traction: 50 + rng.int(0, 12),
    tyreWear: 50 + rng.int(0, 12),
    tyreHeating: 50 + rng.int(0, 12),
    cooling: 50 + rng.int(0, 12),
    reliability: 65 + rng.int(0, 20),
    energyEfficiency: 50 + rng.int(0, 12),
  }
}

function juniorTeamColor(rng: Rng, index: number): { primary: string; secondary: string } {
  const palette = [
    { primary: '#e63946', secondary: '#fff' },
    { primary: '#2a6df4', secondary: '#fff' },
    { primary: '#d4a017', secondary: '#1c1306' },
    { primary: '#2bb673', secondary: '#fff' },
    { primary: '#9b59b6', secondary: '#fff' },
    { primary: '#e67e22', secondary: '#fff' },
    { primary: '#1abc9c', secondary: '#fff' },
    { primary: '#34495e', secondary: '#fff' },
    { primary: '#c0392b', secondary: '#fff' },
    { primary: '#16a085', secondary: '#fff' },
    { primary: '#8e44ad', secondary: '#fff' },
    { primary: '#f39c12', secondary: '#fff' },
  ]
  const base = palette[(index + rng.int(0, 5)) % palette.length]
  return base
}

/** Generate the opening roster for a junior series. Mix of male and
 *  female rookies in the same ratio the top championship uses
 *  (50/50 by default), except the women's series which is
 *  predominantly female (gender field still does NOT affect skill). */
export function generateJuniorRoster(
  seriesId: keyof typeof FEEDER_CATALOG,
  seed: number,
): Array<{ name: string; gender: import('../core/types').DriverGender; seed: number }> {
  const rng = createRng(seed)
  const config = FEEDER_CATALOG[seriesId]
  if (!config) return []
  const roster: Array<{ name: string; gender: import('../core/types').DriverGender; seed: number }> = []
  const targetSize = Math.min(config.gridSize, JUNIOR_TEAM_NAMES[seriesId]?.length ?? config.gridSize)
  for (let i = 0; i < targetSize; i++) {
    const gender = config.isWomenSeries
      ? (rng.next() < 0.9 ? 'female' : 'male')
      : (rng.next() < 0.5 ? 'female' : 'male')
    const pool = NAME_POOLS[gender]
    roster.push({
      name: `${pool.first[Math.floor(rng.next() * pool.first.length)]} ${pool.last[Math.floor(rng.next() * pool.last.length)]}`,
      gender,
      seed: Math.floor(rng.next() * 1e9),
    })
  }
  return roster
}

void generateRookie
