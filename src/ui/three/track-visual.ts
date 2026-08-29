// Pitwall Dynasty — track presentation model.
//
// This file defines the data structures and helpers that describe
// how a circuit LOOKS, not how it computes race outcomes. The
// authoritative simulation only knows about the centerline + lap
// distance; everything in here is presentation-only and lives in
// the renderer process.
//
// Architecture rule (locked by taste):
//   AUTHORITATIVE SIMULATION
//   ≠ TRACK PRESENTATION
//   ≠ CAR PRESENTATION
//   ≠ CAMERA DIRECTOR
//   ≠ UI / BROADCAST GRAPHICS
//
// Track visuals must never feed back into race outcomes.

import * as THREE from 'three'
import type { Circuit } from '../../core/types'

// ---------------------------------------------------------------------------
// Environment theme — palette + vegetation + sky + light direction
// ---------------------------------------------------------------------------

export type EnvironmentThemeId =
  | 'forest'
  | 'mountain'
  | 'coastal'
  | 'desert'
  | 'urban-park'
  | 'modern-purpose-built'

export interface EnvironmentTheme {
  id: EnvironmentThemeId
  /** Display name. */
  name: string
  /** Grass colour around the track. */
  grass: number
  /** Rough gravel colour. */
  gravel: number
  /** Asphalt tone — used as base albedo. */
  asphalt: number
  /** Tree foliage colour. */
  foliage: number
  /** Tree trunk colour. */
  trunk: number
  /** Sky tint. */
  sky: number
  /** Horizon fog colour. */
  fog: number
  /** Directional light colour (the sun). */
  sun: number
  /** Directional light direction. */
  sunDir: [number, number, number]
  /** Hemisphere sky colour. */
  hemiSky: number
  /** Hemisphere ground colour. */
  hemiGround: number
  /** Tree density (0..1). */
  treeDensity: number
  /** Whether the circuit is meant to feel open (desert / coastal) or enclosed (forest / urban-park). */
  enclosure: 'open' | 'mixed' | 'enclosed'
  /** Subtle environmental drift noise colour for the ground. */
  groundNoiseTint: number
}

export const ENVIRONMENT_THEMES: Record<EnvironmentThemeId, EnvironmentTheme> = {
  'forest': {
    id: 'forest',
    name: 'Forest',
    grass: 0x244a2a, gravel: 0x6b4f2e, asphalt: 0x2b3038, foliage: 0x1d3a23, trunk: 0x3a261a,
    sky: 0x9bb6c8, fog: 0xb6c8d2, sun: 0xfff1d1, sunDir: [0.6, 1, 0.4], hemiSky: 0xbfd1da, hemiGround: 0x324428,
    treeDensity: 1.0, enclosure: 'enclosed', groundNoiseTint: 0x2a3a25,
  },
  'mountain': {
    id: 'mountain',
    name: 'Mountain',
    grass: 0x6b7c4a, gravel: 0x8a7e60, asphalt: 0x2e3138, foliage: 0x2a4530, trunk: 0x3a2a1a,
    sky: 0xa7c0d2, fog: 0xcfd9e0, sun: 0xffe6c2, sunDir: [-0.5, 0.9, 0.6], hemiSky: 0xc9d8e0, hemiGround: 0x4b5238,
    treeDensity: 0.55, enclosure: 'mixed', groundNoiseTint: 0x4f573a,
  },
  'coastal': {
    id: 'coastal',
    name: 'Coastal',
    grass: 0x9bb886, gravel: 0xc4bda0, asphalt: 0x2d3239, foliage: 0x4a7848, trunk: 0x3a2a1a,
    sky: 0xc4d9e2, fog: 0xe0ecf0, sun: 0xfff5dc, sunDir: [0.4, 1, 0.5], hemiSky: 0xe5eff2, hemiGround: 0x6b7a5e,
    treeDensity: 0.3, enclosure: 'open', groundNoiseTint: 0x8c9b7a,
  },
  'desert': {
    id: 'desert',
    name: 'Desert',
    grass: 0xc4a070, gravel: 0xd0b890, asphalt: 0x33353b, foliage: 0x7a6c44, trunk: 0x4a3a26,
    sky: 0xd4c4a0, fog: 0xe2d4b4, sun: 0xfff0c2, sunDir: [0.3, 0.95, 0.4], hemiSky: 0xe0d2b0, hemiGround: 0x8a7556,
    treeDensity: 0.05, enclosure: 'open', groundNoiseTint: 0xb6a07a,
  },
  'urban-park': {
    id: 'urban-park',
    name: 'Urban Park',
    grass: 0x4b8a3a, gravel: 0x806a48, asphalt: 0x2b2f37, foliage: 0x34743a, trunk: 0x3c2a1c,
    sky: 0x9eb6ca, fog: 0xc4cdd4, sun: 0xfff0d2, sunDir: [0.5, 1, 0.3], hemiSky: 0xc0cdd6, hemiGround: 0x4a5634,
    treeDensity: 0.7, enclosure: 'enclosed', groundNoiseTint: 0x3a4a2c,
  },
  'modern-purpose-built': {
    id: 'modern-purpose-built',
    name: 'Modern Purpose-Built',
    grass: 0x5e7a40, gravel: 0x6a5a3a, asphalt: 0x2c2f37, foliage: 0x4a6a3a, trunk: 0x2c1e12,
    sky: 0xb0c6d6, fog: 0xc8d2da, sun: 0xfff2d4, sunDir: [0.55, 1, 0.45], hemiSky: 0xc6d2da, hemiGround: 0x465028,
    treeDensity: 0.25, enclosure: 'open', groundNoiseTint: 0x4f5b32,
  },
}

// ---------------------------------------------------------------------------
// Track visual definition — the data a track needs to render itself
// ---------------------------------------------------------------------------

/** A position along the centreline with optional elevation (m above the datum). */
export interface TrackPoint {
  x: number
  y: number
  z: number
}

export interface CurbZone {
  /** Lap fraction range [start, end). */
  fromFrac: number
  toFrac: number
  /** Which side of the track. */
  side: 'left' | 'right' | 'both'
  /** Curb style. */
  kind: 'red-white' | 'red-only' | 'yellow'
}

export interface RunoffZone {
  fromFrac: number
  toFrac: number
  side: 'left' | 'right'
  kind: 'asphalt' | 'grass' | 'gravel'
  width: number
}

export interface BarrierZone {
  fromFrac: number
  toFrac: number
  side: 'left' | 'right'
  kind: 'armco' | 'concrete' | 'tyre-wall' | 'fence'
}

export interface GrandstandZone {
  centerFrac: number
  /** Width along the track centreline (fraction of lap). */
  widthFrac: number
  side: 'left' | 'right'
  /** Direction the stand faces (e.g. towards the track). */
  capacity: 'small' | 'medium' | 'large'
}

export interface CameraPoint {
  id: string
  /** Lap fraction. */
  centerFrac: number
  /** Side the camera sits on. */
  side: 'left' | 'right'
  /** Lateral offset from the track edge in metres. */
  lateral: number
  /** Vertical offset in metres. */
  height: number
  /** Lookat direction tangent bias: -1..1, in units of metres along the tangent. */
  lookAhead: number
  kind: 'helicopter' | 'trackside' | 'onboard' | 'pit-lane'
  label?: string
}

export interface PitLane {
  /** Entry point on the centreline. */
  entryFrac: number
  /** Exit point on the centreline. */
  exitFrac: number
  /** Position of the pit building relative to the main straight (offset perpendicular, in metres). */
  side: 'left' | 'right'
  /** Box count. */
  boxes: number
  /** Speed limit (km/h). */
  speedLimit: number
  /**
   * Pre-baked pit-lane centreline samples. Each sample is a
   * world-space Vector3 in the same coordinate system as the
   * main track. The renderer interpolates along this path for
   * cars that are pitting, giving a continuous "leave racing
   * line → pit lane → box → exit → rejoin" arc instead of a
   * teleport.
   */
  centreline: Array<{ x: number; y: number; z: number; speed: number }>
  /** World-space positions of the team boxes. One per team. */
  boxes_xy: Array<{ x: number; y: number; z: number; speed: number }>
}

export interface TrackVisualDefinition {
  circuitId: string
  theme: EnvironmentThemeId
  /** Width along the main straight in metres. */
  baseWidth: number
  /** Optional local width multipliers at fractional positions. */
  widthProfile?: Array<{ atFrac: number; multiplier: number }>
  /** Curb zones (presentation only). */
  curbs: CurbZone[]
  /** Runoff zones (presentation only). */
  runoff: RunoffZone[]
  /** Barrier zones (presentation only). */
  barriers: BarrierZone[]
  /** Grandstands (presentation only). */
  grandstands: GrandstandZone[]
  /** Camera points. */
  cameras: CameraPoint[]
  /** Pit lane. */
  pit: PitLane
  /** Sector break fractions on the centreline. */
  sectorBreaks: [number, number]
  /** Optional elevation amplitude (m) for the centreline. The track surface follows this. */
  elevationAmplitude: number
  /** Optional terrain extent (m radius around the centre). */
  terrainRadius: number
}

// ---------------------------------------------------------------------------
// Authoritative per-circuit visual definitions
// ---------------------------------------------------------------------------

/** Stable hash → fraction in [0,1) for reproducible per-circuit decoration. */
export function hash01(seed: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return ((h >>> 8) & 0xffffff) / 0xffffff
}

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T }

function curbsFromHash(circuitId: string, count: number, theme: EnvironmentThemeId): CurbZone[] {
  // Use the circuit's local curvature to seed the curb placement.
  // Curbs cluster at the tighter-radius sections, which is
  // consistent with how real circuits place their apex / exit
  // kerbs. We synthesise a pseudo-curvature signal by hashing
  // per-section so the output is deterministic without
  // requiring the full centreline to be evaluated here.
  const out: CurbZone[] = []
  for (let i = 0; i < count; i++) {
    const base = i / count
    const f = (base + hash01(circuitId + ':curbOff:' + i) * 0.06) % 1
    // Wider curbs at "corners" (lower-radius sections): widen
    // the zone by up to 0.04 of the lap.
    const width = 0.025 + hash01(circuitId + ':curbW:' + i) * 0.04
    out.push({
      fromFrac: f,
      toFrac: (f + width) % 1,
      // Apex / exit corners favour the inside of the corner.
      // We approximate that by making the side alternate by
      // circuit-hash, biased so roughly half are left and half
      // are right.
      side: hash01(circuitId + ':curbS:' + i) > 0.5 ? 'left' : 'right',
      kind: theme === 'desert' ? 'red-only' : 'red-white',
    })
  }
  return out
}

function runoffFromHash(circuitId: string, count: number, theme: EnvironmentThemeId): RunoffZone[] {
  const out: RunoffZone[] = []
  for (let i = 0; i < count; i++) {
    const f = hash01(circuitId + ':run:' + i)
    const width = 0.03 + hash01(circuitId + ':runW:' + i) * 0.04
    const kind: RunoffZone['kind'] =
      theme === 'desert' ? 'gravel' :
      theme === 'forest' ? (hash01(circuitId + ':runK:' + i) > 0.4 ? 'grass' : 'gravel') :
      theme === 'coastal' ? (hash01(circuitId + ':runK:' + i) > 0.6 ? 'asphalt' : 'grass') :
      'asphalt'
    out.push({
      fromFrac: f,
      toFrac: (f + width) % 1,
      side: hash01(circuitId + ':runS:' + i) > 0.5 ? 'left' : 'right',
      kind,
      width: 6 + hash01(circuitId + ':runL:' + i) * 12,
    })
  }
  return out
}

function barriersFromHash(circuitId: string, count: number): BarrierZone[] {
  const out: BarrierZone[] = []
  for (let i = 0; i < count; i++) {
    const f = hash01(circuitId + ':bar:' + i)
    const width = 0.04 + hash01(circuitId + ':barW:' + i) * 0.08
    const kindRoll = hash01(circuitId + ':barK:' + i)
    const kind: BarrierZone['kind'] =
      kindRoll < 0.45 ? 'armco' : kindRoll < 0.75 ? 'concrete' : kindRoll < 0.9 ? 'tyre-wall' : 'fence'
    out.push({
      fromFrac: f,
      toFrac: (f + width) % 1,
      side: hash01(circuitId + ':barS:' + i) > 0.5 ? 'left' : 'right',
      kind,
    })
  }
  return out
}

function grandstandsFromHash(circuitId: string, count: number): GrandstandZone[] {
  const out: GrandstandZone[] = []
  for (let i = 0; i < count; i++) {
    const f = hash01(circuitId + ':stand:' + i)
    out.push({
      centerFrac: f,
      widthFrac: 0.04 + hash01(circuitId + ':standW:' + i) * 0.05,
      side: hash01(circuitId + ':standS:' + i) > 0.5 ? 'left' : 'right',
      capacity: hash01(circuitId + ':standC:' + i) > 0.65 ? 'large' : hash01(circuitId + ':standC2:' + i) > 0.4 ? 'medium' : 'small',
    })
  }
  return out
}

function camerasForCircuit(circuitId: string, baseWidth: number, pitSide: 'left' | 'right'): CameraPoint[] {
  // Author a fixed set of camera points spread around the lap. The
  // IDs are stable so the TV Director can reference them by id.
  const slots = [0.04, 0.12, 0.22, 0.34, 0.45, 0.55, 0.66, 0.77, 0.88, 0.95]
  const cameras: CameraPoint[] = []
  for (let i = 0; i < slots.length; i++) {
    const f = slots[i]
    const side: 'left' | 'right' = i % 2 === 0 ? 'left' : 'right'
    const lateral = 18 + ((i * 7 + hash01(circuitId + ':camL:' + i)) % 18)
    const height = 2 + (i % 3)
    cameras.push({
      id: `${circuitId}:c${i}`,
      centerFrac: f,
      side,
      lateral,
      height,
      lookAhead: 12 + (i % 4) * 4,
      kind: 'trackside',
    })
  }
  // Always include a helicopter camera at the start/finish and a
  // dedicated onboard camera on the racing line near the apex of
  // the first turn.
  cameras.push({
    id: `${circuitId}:helicopter`,
    centerFrac: 0.0,
    side: 'right',
    lateral: 60,
    height: 90,
    lookAhead: 40,
    kind: 'helicopter',
    label: 'Helicopter',
  })
  cameras.push({
    id: `${circuitId}:onboard`,
    centerFrac: 0.08,
    side: pitSide === 'right' ? 'left' : 'right',
    lateral: baseWidth / 2 + 2,
    height: 2.4,
    lookAhead: 16,
    kind: 'onboard',
    label: 'T-Cam',
  })
  cameras.push({
    id: `${circuitId}:pit-lane`,
    centerFrac: 0.02,
    side: pitSide,
    lateral: 30,
    height: 8,
    lookAhead: 0,
    kind: 'pit-lane',
    label: 'Pit Lane',
  })
  return cameras
}

function pickTheme(circuit: Circuit): EnvironmentThemeId {
  // Map circuit characteristics to a theme so each circuit has a
  // consistent look across the whole project.
  const c = circuit.characteristics
  // Use the deterministic circuit id hash to pick one of six themes
  // for stability across reloads.
  const h = hash01(circuit.id + ':theme')
  if (c.brakingStress > 70 && c.highSpeed > 60) return h > 0.6 ? 'mountain' : 'forest'
  if (c.overtakingDifficulty < 40) return h > 0.5 ? 'coastal' : 'desert'
  if (c.lowSpeed > 50) return 'urban-park'
  // Fallback mixes the deterministic hash
  const themes: EnvironmentThemeId[] = ['forest', 'mountain', 'coastal', 'desert', 'urban-park', 'modern-purpose-built']
  return themes[Math.floor(h * themes.length) % themes.length]
}

const VISUAL_DEFINITION_CACHE = new Map<string, TrackVisualDefinition>()

/** Build (or return cached) presentation-only visual definition for a circuit. */
export function getTrackVisualDefinition(circuit: Circuit): TrackVisualDefinition {
  const cached = VISUAL_DEFINITION_CACHE.get(circuit.id)
  if (cached) return cached
  const theme = pickTheme(circuit)
  const baseWidth = 11 + hash01(circuit.id + ':w') * 4 // 11..15m
  const elevationAmplitude = 2.5 + hash01(circuit.id + ':elev') * 9 // 2.5..11.5m
  const pitSide: 'left' | 'right' = hash01(circuit.id + ':pitS') > 0.5 ? 'right' : 'left'
  const def: TrackVisualDefinition = {
    circuitId: circuit.id,
    theme,
    baseWidth,
    curbs: curbsFromHash(circuit.id, 8, theme),
    runoff: runoffFromHash(circuit.id, 8, theme),
    barriers: barriersFromHash(circuit.id, 24),
    grandstands: grandstandsFromHash(circuit.id, 6),
    cameras: camerasForCircuit(circuit.id, baseWidth, pitSide),
    pit: {
      entryFrac: 0.02,
      exitFrac: 0.05,
      side: pitSide,
      boxes: 10,
      speedLimit: 80,
      // These two arrays are filled in by
      // `populatePitCentreline` and `populatePitBoxes` inside
      // `buildTrackWorld` because they depend on the resolved
      // centreline spline. We seed them with empty arrays so
      // tests that call `getTrackVisualDefinition` directly still
      // see a valid `def.pit`.
      centreline: [],
      boxes_xy: [],
    },
    sectorBreaks: [0.33, 0.66],
    elevationAmplitude,
    terrainRadius: 360,
  }
  VISUAL_DEFINITION_CACHE.set(circuit.id, def)
  return clone(def)
}

// ---------------------------------------------------------------------------
// Helpers used by the renderer
// ---------------------------------------------------------------------------

/** Generate a closed centreline for a circuit definition, with elevation. */
export function generateCenterline(circuit: Circuit, def: TrackVisualDefinition, points = 96): TrackPoint[] {
  const c = circuit.characteristics
  // Shape influenced by circuit character — a 1980s high-speed venue
  // gets a long, sweeping layout; a 2010s street gets a tighter one.
  const baseRadius = 200 + (100 - c.overtakingDifficulty) * 1.4
  const squash = 0.65 + (c.brakingStress / 200)
  const out: TrackPoint[] = []
  let h = 0
  const rnd = (n: number) => {
    h = (h * 1103515245 + 12345) >>> 0
    return (((h >>> 16) % 1000) / 1000 - 0.5) * n
  }
  h = 2166136261
  for (let ch of circuit.id) h = (h ^ ch.charCodeAt(0) * 16777619) >>> 0
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    const wobble = rnd(0.45) * (0.4 + c.overtakingDifficulty / 200)
    const r = baseRadius * (1 + wobble)
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r * squash
    // Elevation uses a couple of harmonics so the track is rolling.
    const z =
      Math.sin(a * 2 + 0.5) * (def.elevationAmplitude * 0.6) +
      Math.sin(a * 5 + 1.7) * (def.elevationAmplitude * 0.25) +
      rnd(def.elevationAmplitude * 0.15)
    out.push({ x, y, z })
  }
  return out
}

/** Build a THREE.CatmullRomCurve3 from a centreline (X, Z as ground, Y as elevation). */
export function curveFromCenterline(center: TrackPoint[]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    center.map((p) => new THREE.Vector3(p.x, p.z, p.y)),
    true,
    'catmullrom',
    0.5,
  )
}

// ---------------------------------------------------------------------------
// Per-circuit feature extraction
// ---------------------------------------------------------------------------

/**
 * Helper for the renderer: pick the closest trackside camera point
 * to a given lap fraction, optionally restricted by kind.
 */
export function pickCamera(
  def: TrackVisualDefinition,
  frac: number,
  kind?: CameraPoint['kind'],
): CameraPoint | undefined {
  let best: CameraPoint | undefined
  let bestD = Infinity
  for (const c of def.cameras) {
    if (kind && c.kind !== kind) continue
    const d = Math.abs(c.centerFrac - ((frac % 1) + 1) % 1)
    if (d < bestD) { bestD = d; best = c }
  }
  return best
}

/** Build a stable list of "battle" camera points (helicopter + every Nth trackside). */
export function battleCameras(def: TrackVisualDefinition): CameraPoint[] {
  return def.cameras.filter((c) => c.kind === 'helicopter' || c.kind === 'trackside').slice(0, 6)
}
