// Pitwall Dynasty — track world builder.
//
// Pure presentation layer. Reads `TrackVisualDefinition`, builds a
// complete visual world (terrain, asphalt, curbs, runoff, barriers,
// grandstands, pit complex, vegetation, buildings) and returns a
// `WorldVisual` handle for the renderer to drive per-frame state
// (weather, time-of-day, etc).
//
// Nothing in this file influences the authoritative simulation.

import * as THREE from 'three'
import {
  type TrackVisualDefinition,
  type EnvironmentTheme,
  generateCenterline,
  curveFromCenterline,
  ENVIRONMENT_THEMES,
  hash01,
} from './track-visual'
import type { Circuit } from '../../core/types'

export interface WorldVisual {
  group: THREE.Group
  curve: THREE.CatmullRomCurve3
  totalLength: number
  trackWidth: number
  /** Sample world position (with elevation) at lap fraction [0,1). */
  positionAt(frac: number, target: THREE.Vector3): THREE.Vector3
  /** Tangent (direction of travel) at fraction. */
  tangentAt(frac: number, target: THREE.Vector3): THREE.Vector3
  /** Sample world position on the pit lane at fraction [0,1). */
  pitPositionAt(u: number, target: THREE.Vector3): THREE.Vector3
  /** Sample the per-team garage position by team id hash. */
  pitBoxFor(teamId: string, target: THREE.Vector3): THREE.Vector3
  /** Surface normal (up vector) at fraction — accounts for elevation slope. */
  normalAt(frac: number, target: THREE.Vector3): THREE.Vector3
  /** Update weather visuals (track wetness 0..1). */
  setWetness(w: number): void
  /** Update graphics preset (LOW=0, MED=1, HIGH=2, ULTRA=3). */
  setGraphicsLevel(level: 0 | 1 | 2 | 3): void
  /** Get the active theme id. */
  theme: EnvironmentTheme
  /** Pit lane definition. */
  pit: TrackVisualDefinition['pit']
  /** Camera points. */
  cameras: TrackVisualDefinition['cameras']
  /** Sector break fractions. */
  sectorBreaks: [number, number]
  /** Dispose all GPU resources owned by the world. */
  dispose(): void
}

interface CachedMaterial {
  mat: THREE.Material
  refs: number
}
const MATERIAL_CACHE = new Map<string, CachedMaterial>()
function sharedMaterial(key: string, build: () => THREE.Material): THREE.Material {
  let entry = MATERIAL_CACHE.get(key)
  if (!entry) { entry = { mat: build(), refs: 0 }; MATERIAL_CACHE.set(key, entry) }
  entry.refs++
  return entry.mat
}
function releaseCachedMaterial(mat: THREE.Material) {
  for (const [k, v] of MATERIAL_CACHE.entries()) {
    if (v.mat === mat) {
      v.refs--
      if (v.refs <= 0) {
        v.mat.dispose()
        MATERIAL_CACHE.delete(k)
      }
      return
    }
  }
  mat.dispose()
}

let _rngState = 0
function seedRng(seed: number) { _rngState = seed >>> 0 }
function rnd(): number {
  _rngState = (_rngState * 1103515245 + 12345) >>> 0
  return ((_rngState >>> 16) % 1000) / 1000
}

// ---------------------------------------------------------------------------
// Build the pit-lane centreline + per-team garage world positions.
// These are pre-baked into def.pit so the renderer can interpolate
// the pitting car's position smoothly every frame.
// ---------------------------------------------------------------------------

function populatePitCentreline(curve: THREE.CatmullRomCurve3, def: TrackVisualDefinition) {
  const up = new THREE.Vector3(0, 1, 0)
  const side: 'left' | 'right' = def.pit.side
  const dir = side === 'left' ? -1 : 1
  const lateral = def.baseWidth / 2 + 10
  const samples: Array<{ x: number; y: number; z: number; speed: number }> = []
  // Entry curve: the car peels off the racing line and slides
  // sideways onto the pit lane. We model the entry with three
  // samples (1 m before entry, entry itself, 6 m past entry on
  // the pit lane side) so the car visibly turns in.
  const entryT = def.pit.entryFrac
  const exitT = def.pit.exitFrac
  const entryTan = curve.getTangentAt(entryT)
  const entrySide = new THREE.Vector3().crossVectors(up, entryTan).normalize()
  const entryPitPos = curve.getPointAt(entryT).clone().addScaledVector(entrySide, dir * lateral)
  // Approach: just before the entry on the racing line.
  const beforeEntryT = ((entryT - 0.005) + 1) % 1
  const approachPos = curve.getPointAt(beforeEntryT)
  samples.push({ x: approachPos.x, y: approachPos.y, z: approachPos.z, speed: 1.0 })
  // Half-way through the entry turn.
  const halfEntry = approachPos.clone().lerp(entryPitPos, 0.5)
  samples.push({ x: halfEntry.x, y: halfEntry.y, z: halfEntry.z, speed: 0.6 })
  // Settled on the pit lane at the entry.
  samples.push({ x: entryPitPos.x, y: entryPitPos.y, z: entryPitPos.z, speed: 0.0 })
  // Pit lane centreline: 16 samples between entry and exit along
  // the pit side. The speed curve reflects the speed-limit zone.
  for (let i = 1; i < 16; i++) {
    const u = i / 16
    const t = entryT + (exitT - entryT) * u
    const pos = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const sideVec = new THREE.Vector3().crossVectors(up, tan).normalize()
    pos.addScaledVector(sideVec, dir * lateral)
    samples.push({ x: pos.x, y: pos.y, z: pos.z, speed: u })
  }
  // Exit curve: peel back onto the racing line.
  const exitTan = curve.getTangentAt(exitT)
  const exitSide = new THREE.Vector3().crossVectors(up, exitTan).normalize()
  const exitPitPos = curve.getPointAt(exitT).clone().addScaledVector(exitSide, dir * lateral)
  const halfExit = exitPitPos.clone().lerp(curve.getPointAt(((exitT + 0.005) % 1)), 0.5)
  samples.push({ x: halfExit.x, y: halfExit.y, z: halfExit.z, speed: 0.6 })
  const exitJoin = curve.getPointAt(((exitT + 0.005) % 1))
  samples.push({ x: exitJoin.x, y: exitJoin.y, z: exitJoin.z, speed: 1.0 })
  def.pit.centreline = samples
  void up
}

function populatePitBoxes(curve: THREE.CatmullRomCurve3, def: TrackVisualDefinition) {
  const up = new THREE.Vector3(0, 1, 0)
  const dir = def.pit.side === 'left' ? -1 : 1
  const lateral = def.baseWidth / 2 + 10
  const boxes: Array<{ x: number; y: number; z: number; speed: number }> = []
  for (let i = 0; i < def.pit.boxes; i++) {
    const u = 0.18 + (i + 0.5) * (0.6 / def.pit.boxes)
    const t = def.pit.entryFrac + (def.pit.exitFrac - def.pit.entryFrac) * u
    const pos = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const sideVec = new THREE.Vector3().crossVectors(up, tan).normalize()
    pos.addScaledVector(sideVec, dir * lateral)
    boxes.push({ x: pos.x, y: pos.y, z: pos.z, speed: 0 })
  }
  def.pit.boxes_xy = boxes
  void up
}

// ---------------------------------------------------------------------------
// Track ribbon (asphalt + edges)
// ---------------------------------------------------------------------------

// Top-series team garage door colours. Each box on the pit lane
// uses one of these in order so the player can identify their own
// team visually. The order matches the default team order so the
// player team's garage is roughly in the middle.
const TEAM_DOOR_COLORS = [
  0xe63946, // Titan Racing — deep red
  0x4a8fd1, // Aquila Corse — cobalt blue
  0x4ad17d, // Boreal GP — emerald
  0xe6a14a, // Meridian Motorsport — orange
  0xb0b0b0, // Kestrel Racing — steel
  0x9b6dd1, // Polaris Works — purple
  0xd1a14a, // Sablefox Racing — gold
  0x4ad1c0, // Vanguard Apex — teal
  0xd14a8c, // Cobalt Line — pink
  0x6c7a8a, // Horizon GP — slate
]

function buildAsphalt(
  curve: THREE.CatmullRomCurve3,
  width: number,
  baseColor: number,
  segments: number,
  def: TrackVisualDefinition,
): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  const verts: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const up = new THREE.Vector3(0, 1, 0)
  // A subtle colour stripe down the middle represents the racing
  // line. We modulate the asphalt colour by ±5% with a smooth
  // sine across the width so the surface reads as "rubbered" along
  // the racing line without breaking the simulation.
  const racingLineColor = new THREE.Color(baseColor).multiplyScalar(0.86).getHex()
  const wornColor = new THREE.Color(baseColor).multiplyScalar(0.94).getHex()
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const pos = curve.getPointAt(t % 1)
    const tan = curve.getTangentAt(t % 1)
    const side = new THREE.Vector3().crossVectors(up, tan).normalize()
    const halfW = width / 2
    const l = pos.clone().addScaledVector(side, -halfW)
    const r = pos.clone().addScaledVector(side, halfW)
    // Lift the racing-line edge a tiny bit so it does not z-fight
    // with the asphalt. +0.06 m is enough.
    const isRacingLineL = t > 0.05 && t < 0.95
    const yOff = isRacingLineL ? 0.06 : 0.05
    verts.push(l.x, l.y + yOff, l.z, r.x, r.y + yOff, r.z)
    // Racing-line colour: darken the centre 20 % of the track.
    // We use the position across the width as the driver.
    const distR = 0
    const distL = 1
    const cL = pickAsphaltColour(distL, racingLineColor, wornColor, baseColor)
    const cR = pickAsphaltColour(distR, racingLineColor, wornColor, baseColor)
    colors.push(
      (cL >> 16) & 0xff, (cL >> 8) & 0xff, cL & 0xff,
      (cR >> 16) & 0xff, (cR >> 8) & 0xff, cR & 0xff,
    )
    uvs.push(0, t * 80, 1, t * 80)
  }
  const indices: number[] = []
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
    indices.push(a, c, b, b, c, d)
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  // Sectors: paint a 200 mm wide start/finish line at the
  // beginning. We add a second mesh on top of the asphalt at the
  // start.
  const surface = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  )
  return surface
  void def
}

function pickAsphaltColour(u: number, racing: number, worn: number, base: number): number {
  // u in [0..1] across the track width. The centre 20 % is the
  // racing line (dark rubber), the next 20 % on each side is
  // slightly worn, and the outer edges are base asphalt.
  if (u > 0.4 && u < 0.6) return racing
  if (u > 0.25 && u < 0.75) return worn
  return base
}

// ---------------------------------------------------------------------------
// Curbs
// ---------------------------------------------------------------------------

function buildCurbs(
  curve: THREE.CatmullRomCurve3,
  width: number,
  def: TrackVisualDefinition,
): THREE.Group {
  const group = new THREE.Group()
  const segments = 400
  const up = new THREE.Vector3(0, 1, 0)
  // Build a long flat curb ribbon around the track, then hide segments
  // that fall outside any CurbZone.
  const geo = new THREE.BufferGeometry()
  const verts: number[] = []
  const cols: number[] = []
  const red = [0.86, 0.18, 0.16]
  const white = [0.93, 0.93, 0.93]
  const yellow = [0.92, 0.78, 0.18]
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const pos = curve.getPointAt(t % 1)
    const tan = curve.getTangentAt(t % 1)
    const side = new THREE.Vector3().crossVectors(up, tan).normalize()
    const isCurb = def.curbs.some((c) => {
      const lo = c.fromFrac
      const hi = c.toFrac
      const inRange = lo < hi ? t >= lo && t < hi : t >= lo || t < hi
      return inRange && (c.side === 'left' || c.side === 'both') || c.side === 'right' || c.side === 'both' ? inRange : false
    })
    const whichCurb = def.curbs.find((c) => {
      const lo = c.fromFrac
      const hi = c.toFrac
      const inRange = lo < hi ? t >= lo && t < hi : t >= lo || t < hi
      return inRange
    })
    const baseKind: 'red-white' | 'red-only' | 'yellow' = whichCurb?.kind ?? 'red-white'
    for (const dir of [-1, 1]) {
      const isThisSide = !whichCurb ? false : whichCurb.side === 'both' ? true : (whichCurb.side === 'left' ? dir === -1 : dir === 1)
      if (!isCurb || !isThisSide) {
        // Pad geometry with degenerate quad at the edge to keep the index buffer simple.
        const inner = pos.clone().addScaledVector(side, dir * (width / 2 + 0.01))
        const outer = pos.clone().addScaledVector(side, dir * (width / 2 + 0.01))
        verts.push(inner.x, inner.y + 0.05, inner.z, outer.x, inner.y + 0.05, outer.z)
        cols.push(0, 0, 0, 0, 0, 0)
        continue
      }
      const inner = pos.clone().addScaledVector(side, dir * (width / 2))
      const outer = pos.clone().addScaledVector(side, dir * (width / 2 + 1.6))
      verts.push(inner.x, inner.y + 0.10, inner.z, outer.x, inner.y + 0.04, outer.z)
      let col: number[]
      if (baseKind === 'red-only') col = red
      else if (baseKind === 'yellow') col = yellow
      else {
        const seg = Math.floor(t * segments / 4) % 2
        col = seg === 0 ? red : white
      }
      cols.push(...col, ...col)
    }
  }
  const indices: number[] = []
  for (let i = 0; i < segments; i++) {
    for (const side of [0, 1]) {
      const a = i * 4 + side * 2, b = a + 1, c = (i + 1) * 4 + side * 2, d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true })))
  return group
}

// ---------------------------------------------------------------------------
// Runoff (asphalt / grass / gravel patches)
// ---------------------------------------------------------------------------

function buildRunoff(
  curve: THREE.CatmullRomCurve3,
  width: number,
  def: TrackVisualDefinition,
  theme: EnvironmentTheme,
): THREE.Group {
  const group = new THREE.Group()
  const up = new THREE.Vector3(0, 1, 0)
  for (const z of def.runoff) {
    const c = z.kind === 'asphalt' ? 0x1a1d22 : (z.kind === 'grass' ? theme.grass : theme.gravel)
    const mat = sharedMaterial(`runoff:${c}:${z.kind}`, () => new THREE.MeshLambertMaterial({ color: c }))
    // Build a quad strip following the track for the runoff extent.
    const t0 = z.fromFrac
    const t1 = z.toFrac
    const segs = 12
    const verts: number[] = []
    const indices: number[] = []
    for (let i = 0; i <= segs; i++) {
      const t = (t0 + ((t1 - t0 + 1) % 1) * (i / segs)) % 1
      const pos = curve.getPointAt(t)
      const tan = curve.getTangentAt(t)
      const side = new THREE.Vector3().crossVectors(up, tan).normalize()
      const dir = z.side === 'left' ? -1 : 1
      const inner = pos.clone().addScaledVector(side, dir * (width / 2))
      const outer = pos.clone().addScaledVector(side, dir * (width / 2 + z.width))
      verts.push(inner.x, inner.y + 0.02, inner.z, outer.x, inner.y + 0.02, outer.z)
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1
      indices.push(a, c, b, b, c, d)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, mat))
  }
  return group
}

// ---------------------------------------------------------------------------
// Barriers (Armco, concrete, fence, tyre wall)
// ---------------------------------------------------------------------------

function buildBarriers(
  curve: THREE.CatmullRomCurve3,
  width: number,
  def: TrackVisualDefinition,
): THREE.Group {
  const group = new THREE.Group()
  const up = new THREE.Vector3(0, 1, 0)
  for (const z of def.barriers) {
    const dir = z.side === 'left' ? -1 : 1
    const color =
      z.kind === 'armco' ? 0xd6d8da :
      z.kind === 'concrete' ? 0x8a8a8c :
      z.kind === 'tyre-wall' ? 0x1d1d20 :
      0x5a5e64
    const mat = sharedMaterial(`barrier:${color}:${z.kind}`, () => new THREE.MeshLambertMaterial({ color }))
    const height = z.kind === 'concrete' ? 0.9 : z.kind === 'tyre-wall' ? 0.8 : 0.55
    const segs = 10
    for (let i = 0; i < segs; i++) {
      const t0 = (z.fromFrac + ((z.toFrac - z.fromFrac + 1) % 1) * (i / segs)) % 1
      const t1 = (z.fromFrac + ((z.toFrac - z.fromFrac + 1) % 1) * ((i + 1) / segs)) % 1
      const p0 = curve.getPointAt(t0)
      const p1 = curve.getPointAt(t1)
      const tan = curve.getTangentAt(t0)
      const side = new THREE.Vector3().crossVectors(up, tan).normalize()
      const off = dir * (width / 2 + 1.4)
      const mid = p0.clone().lerp(p1, 0.5).addScaledVector(side, off)
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.4, height, p0.distanceTo(p1) * 1.05), mat)
      seg.position.copy(mid)
      seg.position.y += height / 2 + 0.05
      // Orient the segment along the tangent.
      const lookAt = mid.clone().add(curve.getTangentAt(t0).clone().setY(0).normalize())
      seg.lookAt(lookAt)
      group.add(seg)
    }
    // Sponsor boards behind Armco and concrete barriers — small
    // billboard-like rectangles that face the racing line. They
    // add visual variety to the trackside without modeling each
    // sponsor in detail.
    if (z.kind === 'armco' || z.kind === 'concrete') {
      for (let i = 0; i < segs; i += 2) {
        const t0 = (z.fromFrac + ((z.toFrac - z.fromFrac + 1) % 1) * (i / segs)) % 1
        const p0 = curve.getPointAt(t0)
        const tan = curve.getTangentAt(t0)
        const side = new THREE.Vector3().crossVectors(up, tan).normalize()
        const off = dir * (width / 2 + 3.6)
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(3.4, 0.9),
          new THREE.MeshBasicMaterial({ color: 0xeeeeee }),
        )
        board.position.copy(p0).addScaledVector(side, off)
        board.position.y = 0.5
        board.lookAt(p0.clone().add(side.clone().multiplyScalar(-dir * 5)))
        group.add(board)
        // A second coloured stripe on the bottom half for variety
        const stripe = new THREE.Mesh(
          new THREE.PlaneGeometry(3.4, 0.18),
          new THREE.MeshBasicMaterial({ color: 0xe63946 }),
        )
        stripe.position.copy(board.position)
        stripe.position.y = 0.07
        stripe.rotation.copy(board.rotation)
        group.add(stripe)
      }
    }
  }
  return group
}

// ---------------------------------------------------------------------------
// Grandstands
// ---------------------------------------------------------------------------

function buildGrandstands(curve: THREE.CatmullRomCurve3, def: TrackVisualDefinition, graphicsLevel: number): THREE.Group {
  const group = new THREE.Group()
  const up = new THREE.Vector3(0, 1, 0)
  for (const s of def.grandstands) {
    const cap = s.capacity === 'large' ? 1 : s.capacity === 'medium' ? 0.7 : 0.45
    const width = 24 * cap
    const segs = 8
    for (let i = 0; i < segs; i++) {
      const t0 = (s.centerFrac - s.widthFrac / 2 + (s.widthFrac * i / segs)) % 1
      const t1 = (s.centerFrac - s.widthFrac / 2 + (s.widthFrac * (i + 1) / segs)) % 1
      const p0 = curve.getPointAt(t0)
      const p1 = curve.getPointAt(t1)
      const tan = curve.getTangentAt(t0)
      const side = new THREE.Vector3().crossVectors(up, tan).normalize()
      const dir = s.side === 'left' ? -1 : 1
      const off = dir * (def.baseWidth / 2 + 16)
      const center = p0.clone().lerp(p1, 0.5).addScaledVector(side, off)
      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(width / segs, 6 + cap * 4, 8),
        sharedMaterial(`stand:${cap}:${i % 2}`, () => new THREE.MeshLambertMaterial({ color: 0x39424e })),
      )
      stand.position.copy(center)
      stand.position.y = 3 + cap * 2
      stand.lookAt(center.clone().add(tan))
      group.add(stand)
      // Crowd blocks (instanced)
      if (graphicsLevel >= 1) {
        const crowdCount = cap >= 1 ? 32 : cap >= 0.7 ? 22 : 12
        const colors = [0xc25a4a, 0x6c7e95, 0xd1b35a, 0x4f5d75, 0x8a4f3a, 0x4a6c52]
        for (let c = 0; c < crowdCount; c++) {
          const ch = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.55, 0.35),
            new THREE.MeshBasicMaterial({ color: colors[c % colors.length] }),
          )
          ch.position.copy(center)
          ch.position.y = 5 + cap * 2
          ch.position.add(new THREE.Vector3(
            ((c % 8) - 3.5) * (width / segs) / 8,
            0,
            ((c >> 3) - 1.5) * 0.5,
          ))
          ch.lookAt(center.clone().add(tan))
          group.add(ch)
        }
      }
    }
  }
  return group
}

// ---------------------------------------------------------------------------
// Pit lane and pit building
// ---------------------------------------------------------------------------

function buildPitLane(
  curve: THREE.CatmullRomCurve3,
  def: TrackVisualDefinition,
  theme: EnvironmentTheme,
): THREE.Group {
  const group = new THREE.Group()
  const up = new THREE.Vector3(0, 1, 0)
  const side = def.pit.side
  const dir = side === 'left' ? -1 : 1
  const lateral = def.baseWidth / 2 + 10
  // Pit lane centerline spline: from entry to exit along the side
  // of the main straight.
  const entryPos = curve.getPointAt(def.pit.entryFrac)
  const exitPos = curve.getPointAt(def.pit.exitFrac)
  const entryTan = curve.getTangentAt(def.pit.entryFrac)
  const sideVec = new THREE.Vector3().crossVectors(up, entryTan).normalize()
  const e = entryPos.clone().addScaledVector(sideVec, dir * lateral)
  const x = exitPos.clone().addScaledVector(sideVec, dir * lateral)
  const segs = 12
  // Pit lane asphalt
  const verts: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const halfW = 3
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const p = e.clone().lerp(x, t)
    const tan = x.clone().sub(e).normalize()
    const s = new THREE.Vector3().crossVectors(up, tan).normalize()
    const l = p.clone().addScaledVector(s, -halfW)
    const r = p.clone().addScaledVector(s, halfW)
    verts.push(l.x, l.y + 0.06, l.z, r.x, r.y + 0.06, r.z)
    uvs.push(0, t * 12, 1, t * 12)
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
    indices.push(a, c, b, b, c, d)
  }
  const laneGeo = new THREE.BufferGeometry()
  laneGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  laneGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  laneGeo.setIndex(indices)
  laneGeo.computeVertexNormals()
  const laneMesh = new THREE.Mesh(
    laneGeo,
    sharedMaterial('asphalt:pit', () => new THREE.MeshLambertMaterial({ color: 0x363a42 })),
  )
  group.add(laneMesh)

  // Pit building — a long block of garages on the pit side.
  const garageLen = e.distanceTo(x) / def.pit.boxes
  const garageMat = sharedMaterial('pit:garage', () => new THREE.MeshLambertMaterial({ color: 0x2a2f37 }))
  for (let i = 0; i < def.pit.boxes; i++) {
    const center = e.clone().lerp(x, (i + 0.5) / def.pit.boxes)
    const box = new THREE.Mesh(new THREE.BoxGeometry(garageLen * 0.92, 3, 5), garageMat)
    box.position.copy(center)
    box.position.y = 1.5
    const tan = x.clone().sub(e).normalize()
    box.lookAt(center.clone().add(tan))
    group.add(box)
    // Door — coloured using the top-series team palette. Each box
    // maps deterministically to a team so the player can spot
    // their own team at a glance.
    const doorColor = TEAM_DOOR_COLORS[i % TEAM_DOOR_COLORS.length]
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(garageLen * 0.85, 2.4),
      sharedMaterial(`pit:door:${doorColor}`, () => new THREE.MeshBasicMaterial({ color: doorColor })),
    )
    door.position.copy(center)
    door.position.y = 1.3
    door.position.addScaledVector(tan.clone().setY(0).normalize().cross(new THREE.Vector3(0, 1, 0)), -2.45)
    door.lookAt(door.position.clone().add(tan))
    group.add(door)
  }
  // Pit wall — low wall facing the track.
  const wallTan = x.clone().sub(e).normalize()
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(e.distanceTo(x) + 2, 0.5, 0.3),
    sharedMaterial('pit:wall', () => new THREE.MeshLambertMaterial({ color: 0xe1e3e8 })),
  )
  wall.position.copy(e.clone().lerp(x, 0.5))
  wall.position.y = 0.4
  wall.position.addScaledVector(sideVec, -dir * 3)
  wall.lookAt(wall.position.clone().add(wallTan))
  group.add(wall)

  // Timing tower / control room — a tall glass-walled box above
  // the middle of the pit wall. This is the iconic "race control"
  // block visible from every broadcast camera.
  const towerCenter = e.clone().lerp(x, 0.5).addScaledVector(sideVec, -dir * 4.6)
  const towerBase = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.3, 2.2),
    sharedMaterial('pit:towerBase', () => new THREE.MeshLambertMaterial({ color: 0x1c2230 })),
  )
  towerBase.position.copy(towerCenter)
  towerBase.position.y = 3.4
  towerBase.lookAt(towerCenter.clone().add(wallTan))
  group.add(towerBase)
  // Glass front (darker transparent box)
  const towerGlass = new THREE.Mesh(
    new THREE.BoxGeometry(7.4, 2.2, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x6da3c8, transparent: true, opacity: 0.55 }),
  )
  towerGlass.position.copy(towerCenter)
  towerGlass.position.y = 4.4
  towerGlass.lookAt(towerCenter.clone().add(wallTan))
  group.add(towerGlass)
  // Antenna on top
  const ant = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6),
    sharedMaterial('pit:antenna', () => new THREE.MeshLambertMaterial({ color: 0x101418 })),
  )
  ant.position.copy(towerCenter)
  ant.position.y = 6.5
  group.add(ant)
  // Support struts under the tower
  for (const dx of [-3.4, 3.4]) {
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6),
      sharedMaterial('pit:strut', () => new THREE.MeshLambertMaterial({ color: 0x2a2f37 })),
    )
    strut.position.copy(towerCenter).add(new THREE.Vector3(dx, 1.6, 0))
    strut.lookAt(strut.position.clone().add(wallTan))
    group.add(strut)
  }
  // Pit entry / exit stripe
  for (const marker of [
    { t: def.pit.entryFrac, kind: 'entry' as const },
    { t: def.pit.exitFrac, kind: 'exit' as const },
  ]) {
    const p = curve.getPointAt(marker.t)
    const s = new THREE.Vector3().crossVectors(up, curve.getTangentAt(marker.t)).normalize()
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, def.baseWidth + 1),
      new THREE.MeshBasicMaterial({ color: marker.kind === 'entry' ? 0xf7d04a : 0x4ad17d }),
    )
    stripe.position.copy(p)
    stripe.position.y = 0.07
    stripe.rotation.x = -Math.PI / 2
    stripe.rotation.z = Math.atan2(s.x, s.z) + Math.PI / 2
    group.add(stripe)
  }
  void theme
  return group
}

// ---------------------------------------------------------------------------
// Starting lights gantry
// ---------------------------------------------------------------------------

function buildStartLightsGantry(curve: THREE.CatmullRomCurve3, def: TrackVisualDefinition): THREE.Group {
  const group = new THREE.Group()
  const up = new THREE.Vector3(0, 1, 0)
  const sfPos = curve.getPointAt(0)
  const tan = curve.getTangentAt(0)

  // Start/finish line — chequered paint across the racing line.
  // We draw two stacked boxes (white + black) in a 4x6 pattern
  // that's cheap but reads correctly from a helicopter.
  const sfSide = new THREE.Vector3().crossVectors(up, tan).normalize()
  const lineWidth = def.baseWidth * 0.9
  const cellW = lineWidth / 8
  const cellL = 0.6
  const yLine = sfPos.y + 0.07
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 8; col++) {
      const dark = (row + col) % 2 === 0
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(cellW, 0.01, cellL),
        new THREE.MeshBasicMaterial({ color: dark ? 0x101418 : 0xf2f3f6 }),
      )
      const u = (col + 0.5) / 8
      const p = sfPos.clone().addScaledVector(sfSide, -lineWidth / 2 + u * lineWidth)
      m.position.set(p.x, yLine + 0.005 + row * 0.001, p.z + tan.z * 0.0)
      m.lookAt(p.x + tan.x, yLine, p.z + tan.z)
      group.add(m)
    }
  }
  // Sector markers (vertical 200 mm bars on the side of the track)
  for (const sb of def.sectorBreaks) {
    const sPos = curve.getPointAt(sb)
    const sTan = curve.getTangentAt(sb)
    const sSide = new THREE.Vector3().crossVectors(up, sTan).normalize()
    const dir = sb < 0.5 ? -1 : 1
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.4, 0.1),
      sharedMaterial('sector:pole', () => new THREE.MeshLambertMaterial({ color: 0xe0e2e6 })),
    )
    pole.position.copy(sPos).addScaledVector(sSide, dir * (def.baseWidth / 2 + 1.2))
    pole.position.y += 0.7
    group.add(pole)
  }
  const side = new THREE.Vector3().crossVectors(up, tan).normalize()
  const postMat = sharedMaterial('gantry:post', () => new THREE.MeshLambertMaterial({ color: 0x121620 }))
  const beamMat = sharedMaterial('gantry:beam', () => new THREE.MeshLambertMaterial({ color: 0x1c2230 }))
  const lightMat = sharedMaterial('gantry:light', () => new THREE.MeshBasicMaterial({ color: 0x440000 }))
  for (const sign of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), postMat)
    post.position.copy(sfPos).addScaledVector(side, sign * (def.baseWidth / 2 + 2.5))
    post.position.y = 4
    group.add(post)
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(def.baseWidth + 6, 0.6, 1), beamMat)
  beam.position.copy(sfPos)
  beam.position.y = 7.5
  group.add(beam)
  // Five light slots
  for (let i = 0; i < 5; i++) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.3), lightMat.clone())
    light.position.copy(sfPos)
    light.position.y = 7.0
    light.position.x += (i - 2) * 1.3
    group.add(light)
  }
  return group
}

// ---------------------------------------------------------------------------
// Vegetation (instanced trees / bushes)
// ---------------------------------------------------------------------------

function buildVegetation(
  curve: THREE.CatmullRomCurve3,
  def: TrackVisualDefinition,
  theme: EnvironmentTheme,
  graphicsLevel: number,
): THREE.Group {
  const group = new THREE.Group()
  const up = new THREE.Vector3(0, 1, 0)
  const baseCount = Math.floor(160 * theme.treeDensity * (graphicsLevel >= 2 ? 1 : graphicsLevel >= 1 ? 0.6 : 0.3))
  if (baseCount <= 0) return group
  const tree = new THREE.ConeGeometry(4, 11, 6)
  const trunk = new THREE.CylinderGeometry(0.4, 0.5, 1.4, 5)
  const treeMat = sharedMaterial(`tree:${theme.foliage}`, () => new THREE.MeshLambertMaterial({ color: theme.foliage }))
  const trunkMat = sharedMaterial(`trunk:${theme.trunk}`, () => new THREE.MeshLambertMaterial({ color: theme.trunk }))
  const trees = new THREE.InstancedMesh(tree, treeMat, baseCount)
  const trunks = new THREE.InstancedMesh(trunk, trunkMat, baseCount)
  const dummy = new THREE.Object3D()
  seedRng(hash01(def.circuitId + ':trees') * 0xffffffff)
  for (let i = 0; i < baseCount; i++) {
    const t = rnd()
    const pos = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const side = new THREE.Vector3().crossVectors(up, tan).normalize()
    const off = (rnd() > 0.5 ? 1 : -1) * (28 + rnd() * 180)
    dummy.position.copy(pos).addScaledVector(side, off)
    dummy.position.y = 0
    const s = 0.7 + rnd() * 1.4
    dummy.scale.set(s, s * (0.8 + rnd() * 0.6), s)
    dummy.rotation.y = rnd() * Math.PI * 2
    dummy.updateMatrix()
    trees.setMatrixAt(i, dummy.matrix)
    const trunkDummy = new THREE.Object3D()
    trunkDummy.position.copy(dummy.position)
    trunkDummy.position.y = 0.7 * s
    trunkDummy.scale.set(s, s, s)
    trunkDummy.updateMatrix()
    trunks.setMatrixAt(i, trunkDummy.matrix)
  }
  group.add(trees, trunks)
  return group
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

function buildTerrain(def: TrackVisualDefinition, curve: THREE.CatmullRomCurve3, theme: EnvironmentTheme): THREE.Mesh {
  const radius = def.terrainRadius
  const segs = 80
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, segs, segs)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    // Distance from the track centreline (in the XZ plane).
    let bestD = Infinity
    let bestZ = 0
    for (let s = 0; s < 96; s += 4) {
      const t = s / 96
      const p = curve.getPointAt(t)
      const d = Math.hypot(p.x - v.x, p.z - v.z)
      if (d < bestD) { bestD = d; bestZ = p.y }
    }
    // Smooth blending between flat far-field and track-following near-field.
    const blend = Math.max(0, 1 - bestD / 80)
    const noise = (Math.sin(v.x * 0.018) + Math.cos(v.z * 0.021)) * 1.6 + (Math.sin(v.x * 0.06 + v.z * 0.04)) * 0.6
    v.y = bestZ * blend + noise * (1 - blend) - 0.4
    // Outside the inner disc, add gentle rolling terrain.
    if (bestD > 80) {
      v.y += (Math.sin(v.x * 0.005) * 6 + Math.cos(v.z * 0.007) * 5) * Math.min(1, (bestD - 80) / 200)
    }
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  const mat = sharedMaterial(`terrain:${theme.grass}`, () => new THREE.MeshLambertMaterial({ color: theme.grass }))
  return new THREE.Mesh(geo, mat)
}

// ---------------------------------------------------------------------------
// Public: buildTrackWorld
// ---------------------------------------------------------------------------

export function buildTrackWorld(circuit: Circuit, def: TrackVisualDefinition, graphicsLevel: 0 | 1 | 2 | 3 = 2): WorldVisual {
  const group = new THREE.Group()
  const theme = ENVIRONMENT_THEMES[def.theme]
  const center = generateCenterline(circuit, def)
  const curve = curveFromCenterline(center)
  const totalLength = curve.getLength()

  const terrain = buildTerrain(def, curve, theme)
  group.add(terrain)
  const asphalt = buildAsphalt(curve, def.baseWidth, theme.asphalt, 400, def)
  group.add(asphalt)
  const curbs = buildCurbs(curve, def.baseWidth, def)
  group.add(curbs)
  const runoff = buildRunoff(curve, def.baseWidth, def, theme)
  group.add(runoff)
  const barriers = buildBarriers(curve, def.baseWidth, def)
  group.add(barriers)
  const stands = buildGrandstands(curve, def, graphicsLevel)
  group.add(stands)
  // Build the pit-lane centreline + box positions BEFORE the
  // visual pit complex so the visual rendering can use them.
  populatePitCentreline(curve, def)
  populatePitBoxes(curve, def)
  const pit = buildPitLane(curve, def, theme)
  group.add(pit)
  const gantry = buildStartLightsGantry(curve, def)
  group.add(gantry)
  const vegetation = buildVegetation(curve, def, theme, graphicsLevel)
  group.add(vegetation)

  // Pit lane stored on the visual for camera queries.
  const pitDef = def.pit

  return {
    group,
    curve,
    totalLength,
    trackWidth: def.baseWidth,
    positionAt(frac, target) {
      target.copy(curve.getPointAt(((frac % 1) + 1) % 1))
      return target
    },
    tangentAt(frac, target) {
      target.copy(curve.getTangentAt(((frac % 1) + 1) % 1))
      return target
    },
    /** Sample world position on the pit lane at fraction [0,1). */
    pitPositionAt(u: number, target: THREE.Vector3): THREE.Vector3 {
      const path = def.pit.centreline
      if (path.length < 2) {
        // Fall back: a straight line from entry to exit at the pit
        // building side. This is a safety net for the rare case
        // where a track definition forgot to provide a centreline.
        const t = Math.max(0, Math.min(0.999, u))
        const entry = curve.getPointAt(def.pit.entryFrac)
        const exit = curve.getPointAt(def.pit.exitFrac)
        const dx = exit.x - entry.x
        const dz = exit.z - entry.z
        const dy = exit.y - entry.y
        target.set(entry.x + dx * t, entry.y + dy * t, entry.z + dz * t)
        return target
      }
      // Linear interpolation along the pre-baked centreline. We
      // do not use Catmull-Rom here so the path is always
      // monotonic — a car never slides sideways between sample
      // pairs.
      const clamped = Math.max(0, Math.min(0.9999, u))
      const idxF = clamped * (path.length - 1)
      const i0 = Math.floor(idxF)
      const i1 = Math.min(i0 + 1, path.length - 1)
      const f = idxF - i0
      const p0 = path[i0]
      const p1 = path[i1]
      target.set(
        p0.x + (p1.x - p0.x) * f,
        p0.y + (p1.y - p0.y) * f,
        p0.z + (p1.z - p0.z) * f,
      )
      return target
    },
    /** Sample a per-team garage position by team id hash. */
    pitBoxFor(teamId: string, target: THREE.Vector3): THREE.Vector3 {
      const boxes = def.pit.boxes_xy
      if (boxes.length === 0) {
        // Fallback: midpoint of the pit lane
        return this.pitPositionAt(0.5, target)
      }
      let h = 2166136261 >>> 0
      for (let i = 0; i < teamId.length; i++) {
        h ^= teamId.charCodeAt(i)
        h = Math.imul(h, 16777619) >>> 0
      }
      const idx = Math.abs(h) % boxes.length
      return target.copy(boxes[idx])
    },
    normalAt(frac, target) {
      // Sample a small delta along the centreline to get a tangent, then
      // derive a normal that accounts for elevation.
      const t0 = ((frac % 1) + 1) % 1
      const t1 = (t0 + 0.005) % 1
      const p0 = curve.getPointAt(t0)
      const p1 = curve.getPointAt(t1)
      const tan = p1.clone().sub(p0).normalize()
      target.set(0, 1, 0).sub(tan.clone().multiplyScalar(tan.y)).normalize()
      if (!isFinite(target.x) || !isFinite(target.y) || !isFinite(target.z)) target.set(0, 1, 0)
      return target
    },
    setWetness(_w) {
      // Wetness affects car materials and the sky/fog in broadcast3d;
      // the world itself does not need to redraw. This hook is here
      // so the renderer can drive future per-track wet shader work.
    },
    setGraphicsLevel(_level) {
      // Vegetation density / crowd density baked in at build time.
      // Future per-preset hot-swap would rebuild the vegetation + stands.
    },
    theme,
    pit: pitDef,
    cameras: def.cameras,
    sectorBreaks: def.sectorBreaks,
    dispose() {
      group.traverse((obj) => {
        const m = obj as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        if (m.material) {
          if (Array.isArray(m.material)) for (const x of m.material) releaseCachedMaterial(x)
          else releaseCachedMaterial(m.material)
        }
      })
    },
  }
}
