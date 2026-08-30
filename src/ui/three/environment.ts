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

// ---------------------------------------------------------------------------
// Procedural asphalt texture (broadcast quality).
//
// Generates a project-owned CanvasTexture that gives the asphalt
// surface visible grain, colour variation and a rubbered racing
// line without relying on external assets. The same texture is
// re-used for every circuit so the draw-call count stays low.
// ---------------------------------------------------------------------------

let ASPHALT_TEX: THREE.Texture | null = null

function noise2d(x: number, y: number): number {
  // Cheap deterministic value-noise. Good enough for a
  // procedural asphalt speckle.
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

function makeAsphaltTexture(): THREE.Texture {
  if (ASPHALT_TEX) return ASPHALT_TEX
  // Procedural texture generation requires a real canvas. In
  // headless test environments document is undefined, so we fall
  // back to a single-pixel solid colour texture.
  if (typeof document === 'undefined') {
    const placeholder = new THREE.DataTexture(
      new Uint8Array([0x2c, 0x2f, 0x37, 0xff]),
      1,
      1,
    )
    placeholder.needsUpdate = true
    ASPHALT_TEX = placeholder
    return placeholder
  }
  const W = 512
  const H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  // Base asphalt colour (a slightly desaturated dark grey).
  ctx.fillStyle = '#2c2f37'
  ctx.fillRect(0, 0, W, H)
  // Aggregate speckle.
  const img = ctx.getImageData(0, 0, W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = noise2d(x * 0.18, y * 0.18)
      const m = noise2d(x * 0.7 + 3.1, y * 0.7 + 7.7)
      const speck = 0.85 + 0.18 * n + 0.08 * m
      const i = (y * W + x) * 4
      img.data[i] = Math.min(255, Math.max(0, img.data[i] * speck))
      img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] * speck))
      img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] * speck))
    }
  }
  ctx.putImageData(img, 0, 0)
  // Faint longitudinal seam lines to break up repetition.
  ctx.globalAlpha = 0.05
  ctx.fillStyle = '#1a1c22'
  for (let x = 0; x < W; x += 96) {
    ctx.fillRect(x, 0, 1, H)
  }
  ctx.globalAlpha = 1
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(8, 4)
  tex.anisotropy = 4
  ASPHALT_TEX = tex
  return tex
}

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
  // Curvature-aware racing line. We compute the local curvature
  // at every segment from the signed angle between adjacent
  // tangents, then drive the racing line to the outside on
  // corner entry, the apex (towards the inside), and back to
  // the outside on exit. On long straights the line settles to
  // the geometric centre. We also detect hard-braking approach
  // sections (high positive curvature deltas) and tint the
  // surrounding asphalt darker to suggest a braking patch.
  const racingLineColor = new THREE.Color(baseColor).multiplyScalar(0.78).getHex()
  const brakingPatchColor = new THREE.Color(baseColor).multiplyScalar(0.72).getHex()
  // First pass: compute the local signed curvature.
  const sampleCount = 64
  const ts: number[] = []
  for (let i = 0; i < sampleCount; i++) ts.push(i / sampleCount)
  const tangents: THREE.Vector3[] = []
  for (const t of ts) {
    const tan = curve.getTangentAt(t).setY(0)
    if (tan.lengthSq() > 0) tan.normalize()
    tangents.push(tan)
  }
  const curvatures: number[] = []
  for (let i = 0; i < sampleCount; i++) {
    const a = tangents[i]!
    const b = tangents[(i + 1) % sampleCount]!
    const cross = a.x * b.z - a.z * b.x
    curvatures.push(cross)
  }
  // Smooth the curvature signal with a 3-tap filter so the
  // racing line does not jitter on tiny geometry noise.
  const smoothCurv: number[] = []
  for (let i = 0; i < sampleCount; i++) {
    const a = curvatures[(i - 1 + sampleCount) % sampleCount]!
    const b = curvatures[i]!
    const c = curvatures[(i + 1) % sampleCount]!
    smoothCurv.push((a + b + c) / 3)
  }
  // Build the racing-line offset for every fine segment. We
  // sample a higher-resolution line so the racing line can
  // curve along a long straight without showing visible facets.
  const lineSeg = 400
  const lineOffsets: number[] = [] // -0.45 (right) .. 0.45 (left)
  for (let i = 0; i <= lineSeg; i++) {
    const t = i / lineSeg
    const idxF = t * (sampleCount - 1)
    const i0 = Math.floor(idxF)
    const i1 = Math.min(i0 + 1, sampleCount - 1)
    const frac = idxF - i0
    const kappa = smoothCurv[i0]! * (1 - frac) + smoothCurv[i1]! * frac
    // Map curvature to a sideways offset: positive curvature =
    // left turn; the line sits to the right on corner entry,
    // moves to the left through the apex, and back right on exit.
    // 0.45 here is the maximum offset from the geometric centre.
    const norm = Math.max(-1, Math.min(1, kappa * 4))
    // Cubic remap: positive curvature -> outside entry, mid -> apex.
    // 0.45 * sign(kappa) on entry/exit, 0 in straight.
    const sign = norm === 0 ? 0 : Math.sign(norm)
    const mag = Math.abs(norm)
    // Triangle over each curvature region: -|k|*0.4 -> apex, 0 -> straight
    const offset = sign * (0.45 * mag) // simple linear: outside-in-outside
    lineOffsets.push(offset)
  }
  // Now build the high-resolution mesh segments.
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const pos = curve.getPointAt(t % 1)
    const tan = curve.getTangentAt(t % 1)
    const side = new THREE.Vector3().crossVectors(up, tan).normalize()
    const halfW = width / 2
    // Find the racing-line offset at this t.
    const lineIdxF = t * lineSeg
    const li0 = Math.floor(lineIdxF)
    const li1 = Math.min(li0 + 1, lineSeg)
    const lfrac = lineIdxF - li0
    const lineOffset = lineOffsets[li0]! * (1 - lfrac) + lineOffsets[li1]! * lfrac
    // Read the curvature here to detect braking patches.
    const sIdxF = t * (sampleCount - 1)
    const s0 = Math.floor(sIdxF)
    const s1 = Math.min(s0 + 1, sampleCount - 1)
    const sfrac = sIdxF - s0
    const localKappa = smoothCurv[s0]! * (1 - sfrac) + smoothCurv[s1]! * sfrac
    // The line width is 1.0 m; paint it as a dark band centred on
    // the offset position.
    const lineWidth = 0.5
    const inner = lineOffset + lineWidth
    const outer = lineOffset - lineWidth
    const lx = pos.x + side.x * halfW
    const rx = pos.x + side.x * -halfW
    const ly = pos.y
    const ry = pos.y
    const lz = pos.z + side.z * halfW
    const rz = pos.z + side.z * -halfW
    // Normalised u: 0 at outer, 1 at inner. We tile 0..1 across
    // the full width and pick a colour per vertex.
    const widthRange = halfW * 2
    const uL = (halfW + (outer * 0.5 + 0.5 * widthRange) - 0) / widthRange
    const uR = (halfW + (inner * 0.5 + 0.5 * widthRange) - 0) / widthRange
    void uL
    void uR
    // Build the four vertex colours: outer edge, outer line edge,
    // inner line edge, inner edge.
    const isBraking = Math.abs(localKappa) > 0.04
    const cOE = isBraking ? brakingPatchColor : baseColor
    const cOL = racingLineColor
    const cIL = racingLineColor
    const cIE = isBraking ? brakingPatchColor : baseColor
    // Lift the racing-line strip very slightly so it does not
    // z-fight with the asphalt. +0.06 m is enough.
    verts.push(lx, ly + 0.05, lz, rx, ry + 0.05, rz)
    colors.push(
      (cOE >> 16) & 0xff, (cOE >> 8) & 0xff, cOE & 0xff,
      (cIE >> 16) & 0xff, (cIE >> 8) & 0xff, cIE & 0xff,
    )
    uvs.push(0, t * 80, 1, t * 80)
    // Add a thin second strip for the racing line itself, so
    // the line reads as a distinct narrow band rather than a
    // half-track tint.
    const lL = pos.clone().addScaledVector(side, lineOffset - lineWidth)
    const lR = pos.clone().addScaledVector(side, lineOffset + lineWidth)
    verts.push(lL.x, lL.y + 0.06, lL.z, lR.x, lR.y + 0.06, lR.z)
    colors.push(
      (cOL >> 16) & 0xff, (cOL >> 8) & 0xff, cOL & 0xff,
      (cIL >> 16) & 0xff, (cIL >> 8) & 0xff, cIL & 0xff,
    )
    uvs.push(0, t * 80, 1, t * 80)
  }
  const indices: number[] = []
  for (let i = 0; i < segments; i++) {
    const a = i * 4, b = i * 4 + 1, c = i * 4 + 2, d = i * 4 + 3
    const e = (i + 1) * 4, f = (i + 1) * 4 + 1, g = (i + 1) * 4 + 2, h = (i + 1) * 4 + 3
    // Strip 1 (full width) indices.
    indices.push(a, e, b, b, e, f)
    indices.push(c, g, d, d, g, h)
    // Strip 2 (racing line) indices.
    indices.push(b, f, c, c, f, g)
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const surface = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: makeAsphaltTexture(),
    }),
  )
  return surface
  void def
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
      // Proper 3D curb profile: a raised lip with a slight
      // inward bevel. The lip is 0.16 m tall (3 cm above
      // asphalt), which reads as a proper painted curb from
      // any trackside camera. The width alternates between
      // sections of red and white (or solid red / yellow) so the
      // curb is unmistakable.
      const lipInner = pos.clone().addScaledVector(side, dir * (width / 2 + 0.02))
      const lipOuter = pos.clone().addScaledVector(side, dir * (width / 2 + 1.8))
      const bevel = pos.clone().addScaledVector(side, dir * (width / 2 + 0.18))
      const lipTopY = pos.y + 0.16
      // Six-vertex strip: inner-top, bevel-top, outer-top,
      // inner-bottom, bevel-bottom, outer-bottom.
      verts.push(
        lipInner.x, lipTopY, lipInner.z,
        bevel.x, lipTopY, bevel.z,
        lipOuter.x, lipTopY, lipOuter.z,
        lipInner.x, pos.y + 0.04, lipInner.z,
        bevel.x, pos.y + 0.04, bevel.z,
        lipOuter.x, pos.y + 0.04, lipOuter.z,
      )
      let col: number[]
      if (baseKind === 'red-only') col = red
      else if (baseKind === 'yellow') col = yellow
      else {
        const seg = Math.floor(t * segments / 4) % 2
        col = seg === 0 ? red : white
      }
      for (let v = 0; v < 6; v++) cols.push(...col)
    }
  }
  const indices: number[] = []
  for (let i = 0; i < segments; i++) {
    for (const side of [0, 1]) {
      // 6-vertex strip: two tris for the top (sloped from inner to
      // bevel and bevel to outer) and two tris for the bottom
      // bevel. This gives the curb a proper raised profile.
      const a0 = i * 6 + side * 3
      const a1 = (i + 1) * 6 + side * 3
      indices.push(
        a0, a0 + 1, a1, a1, a0 + 1, a1 + 1,
        a0 + 2, a0, a1 + 2, a0 + 2, a1 + 2, a1,
        a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a1 + 2,
      )
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
      const lookAt = mid.clone().add(curve.getTangentAt(t0).clone().setY(0).normalize())
      if (z.kind === 'armco') {
        // W-profile: thin post + a wider rail on top. The rail
        // sits at the very top of the barrier so it reads as
        // actual Armco.
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, height * 0.65, p0.distanceTo(p1) * 1.05),
          mat,
        )
        post.position.copy(mid)
        post.position.y += (height * 0.65) / 2 + 0.05
        post.lookAt(lookAt)
        group.add(post)
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, height * 0.35, p0.distanceTo(p1) * 1.05),
          mat,
        )
        rail.position.copy(mid)
        rail.position.y += height * 0.65 + (height * 0.35) / 2 + 0.05
        rail.lookAt(lookAt)
        group.add(rail)
      } else if (z.kind === 'concrete') {
        // Wide, segmented blocks. The block width is larger
        // and we add a thin top stripe for visible joints.
        const segLen = p0.distanceTo(p1) * 1.05
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, height, segLen),
          mat,
        )
        block.position.copy(mid)
        block.position.y += height / 2 + 0.05
        block.lookAt(lookAt)
        group.add(block)
        // Joint stripe on top.
        const joint = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.04, 0.06),
          sharedMaterial('concrete:joint', () => new THREE.MeshLambertMaterial({ color: 0x6a6a6c })),
        )
        joint.position.copy(mid)
        joint.position.y += height + 0.06
        joint.lookAt(lookAt)
        group.add(joint)
      } else if (z.kind === 'tyre-wall') {
        // Actual low-poly tyre stack. Each stack uses a real
        // TorusGeometry (looks like a tyre viewed from the side)
        // rotated so the holes face the track. Three tyres per
        // stack, plus a fourth row that is partially buried. The
        // shape is unmistakable: it's tyres, not boxes.
        const segLen = p0.distanceTo(p1) * 1.05
        const stackHeight = 0.36
        const stack = 3
        const tyreRadius = 0.32
        const tyreTube = 0.10
        for (let s = 0; s < stack; s++) {
          // Two stacked tori per row to read as a wall of tyres.
          for (let k = 0; k < 2; k++) {
            const tyre = new THREE.Mesh(
              new THREE.TorusGeometry(tyreRadius, tyreTube, 6, 14),
              mat,
            )
            tyre.position.copy(mid)
            tyre.position.x += side.x * (dir * (k * (tyreRadius * 2 + 0.05)))
            tyre.position.z += side.z * (dir * (k * (tyreRadius * 2 + 0.05)))
            tyre.position.y = 0.18 + s * stackHeight
            // Orient the tyre so its hole faces the track.
            tyre.rotation.x = Math.PI / 2
            tyre.lookAt(lookAt)
            group.add(tyre)
          }
        }
        // A small joining bracket on the top row to suggest a
        // continuous wall.
        void segLen
      } else {
        // Actual safety fence: thin posts + a low-opacity mesh
        // surface. The mesh is a chain-link style grid built
        // from thin tubes; the result reads as fence from
        // broadcast distance.
        const segLen = p0.distanceTo(p1) * 1.05
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, height, segLen),
          mat,
        )
        post.position.copy(mid)
        post.position.y += height / 2 + 0.05
        post.lookAt(lookAt)
        group.add(post)
        // Two horizontal rails: top and mid-height.
        for (const railY of [0.6, 0.3]) {
          const rail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, segLen, 4),
            mat,
          )
          rail.position.copy(mid)
          rail.position.y += railY
          rail.rotation.x = Math.PI / 2
          rail.lookAt(lookAt)
          group.add(rail)
        }
        // A faint mesh sheet. The sheet uses a transparent
        // material so the track is still visible.
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.04, height * 0.9, segLen),
          new THREE.MeshBasicMaterial({
            color: 0x9a9a9a,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
          }),
        )
        mesh.position.copy(mid)
        mesh.position.y += height * 0.5
        mesh.lookAt(lookAt)
        group.add(mesh)
      }
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
      const lookAt = center.clone().add(tan)
      // Stepped terraces: 5 layers of increasing-height boxes
      // stacked behind the front row. This reads as proper
      // grandstand seating from any trackside camera.
      const terraceSteps = 5
      const terraceDepth = 7
      const terraceStepH = 0.5
      for (let s2 = 0; s2 < terraceSteps; s2++) {
        const tH = 0.5 + s2 * terraceStepH
        const tW = width / segs - s2 * 0.4
        const tD = terraceDepth
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(tW, tH, tD),
          sharedMaterial(`terrace:${s2}`, () => new THREE.MeshLambertMaterial({ color: new THREE.Color(0x39, 0x42, 0x4e).multiplyScalar(1 - s2 * 0.04).getHex() })),
        )
        // Stack behind the racing line, with a slight forward
        // step to suggest raked seating.
        const stepSide = side.clone().multiplyScalar(dir * (s2 * 1.1))
        const stepForward = tan.clone().multiplyScalar(s2 * 0.6)
        const stepPos = center.clone().add(stepSide).add(stepForward)
        step.position.copy(stepPos)
        step.position.y = tH / 2 + sumTo(0, s2, terraceStepH)
        step.lookAt(lookAt)
        group.add(step)
      }
      // Roof on top of the largest stands.
      if (cap >= 0.7) {
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(width / segs + 0.4, 0.18, terraceDepth + 1.4),
          sharedMaterial('stand:roof', () => new THREE.MeshLambertMaterial({ color: 0x1c1f25 })),
        )
        const roofSide = side.clone().multiplyScalar(dir * (terraceSteps * 1.1))
        const roofForward = tan.clone().multiplyScalar(terraceSteps * 0.6)
        const roofPos = center.clone().add(roofSide).add(roofForward)
        roof.position.copy(roofPos)
        roof.position.y = sumTo(0, terraceSteps, terraceStepH) + 0.18
        roof.lookAt(lookAt)
        group.add(roof)
      }
      // Crowd: actual torso + head + legs silhouettes. Per
      // instance we draw a head + body + legs so the figure reads
      // as a person, not as a coloured block. Performance is fine
      // for the grandstand scale.
      if (graphicsLevel >= 1) {
        const crowdCount = cap >= 1 ? 64 : cap >= 0.7 ? 40 : 24
        const colors = [0xc25a4a, 0x6c7e95, 0xd1b35a, 0x4f5d75, 0x8a4f3a, 0x4a6c52, 0xe0e0e6, 0x9a3030, 0x6c7a8a, 0xb0b0b0]
        for (let c = 0; c < crowdCount; c++) {
          const row = Math.floor(c / 10) % terraceSteps
          const col = c % 10
          const skinColour = colors[c % colors.length]
          const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.5, 0.3),
            new THREE.MeshBasicMaterial({ color: skinColour }),
          )
          const legs = new THREE.Mesh(
            new THREE.BoxGeometry(0.36, 0.55, 0.28),
            new THREE.MeshBasicMaterial({ color: 0x2a2f37 }),
          )
          const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.26, 0.26, 0.26),
            new THREE.MeshBasicMaterial({ color: 0xe6c8a8 }),
          )
          const chSide = side.clone().multiplyScalar(dir * (row * 1.1 + 0.4))
          const chForward = tan.clone().multiplyScalar(row * 0.6 + 0.4)
          const chPos = center.clone().add(chSide).add(chForward)
          chPos.add(new THREE.Vector3(
            (col - 4.5) * (width / segs) / 10,
            0,
            0,
          ))
          const figY = sumTo(0, row, terraceStepH) + 0.05
          torso.position.copy(chPos)
          torso.position.y = figY + 0.4
          torso.lookAt(lookAt)
          group.add(torso)
          legs.position.copy(chPos)
          legs.position.y = figY - 0.1
          legs.lookAt(lookAt)
          group.add(legs)
          head.position.copy(chPos)
          head.position.y = figY + 0.85
          head.lookAt(lookAt)
          group.add(head)
        }
      }
    }
  }
  return group
}

function sumTo(start: number, count: number, step: number): number {
  let s = start
  for (let i = 0; i < count; i++) s += step
  return s
}

// ---------------------------------------------------------------------------
// Per-circuit signature feature + horizon layers (P5)
// ---------------------------------------------------------------------------

function buildSignatureFeature(
  curve: THREE.CatmullRomCurve3,
  def: TrackVisualDefinition,
  theme: EnvironmentTheme,
): THREE.Group {
  const group = new THREE.Group()
  const up = new THREE.Vector3(0, 1, 0)
  const sig = def.signature
  const t = sig.positionFrac
  const pos = curve.getPointAt(t)
  const tan = curve.getTangentAt(t)
  const side = new THREE.Vector3().crossVectors(up, tan).normalize()
  const dir = sig.side === 'left' ? -1 : 1
  const off = (def.baseWidth / 2 + 14) * dir * sig.scale
  const cx = pos.x + side.x * off
  const cz = pos.z + side.z * off
  const angle = Math.atan2(tan.x, tan.z)
  const baseY = pos.y
  switch (sig.archetype) {
    case 'forest-timber-bridge': {
      // Trestle bridge: two side beams + cross planks.
      const beamMat = sharedMaterial('sig:timber', () => new THREE.MeshLambertMaterial({ color: 0x6b4a2e }))
      const beam = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 1.4), beamMat)
      beam.position.set(cx, baseY + 3, cz)
      beam.lookAt(cx + tan.x, baseY + 3, cz + tan.z)
      group.add(beam)
      for (let i = -2; i <= 2; i++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), beamMat)
        leg.position.set(cx + tan.x * i * 1.4, baseY + 1.5, cz + tan.z * i * 1.4)
        group.add(leg)
      }
      break
    }
    case 'forest-hospitality-lodge': {
      // Pitched-roof lodge.
      const wallMat = sharedMaterial('sig:lodge:wall', () => new THREE.MeshLambertMaterial({ color: 0x4b3a2a }))
      const roofMat = sharedMaterial('sig:lodge:roof', () => new THREE.MeshLambertMaterial({ color: 0x6a3a26 }))
      const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4), wallMat)
      wall.position.set(cx, baseY + 1.5, cz)
      wall.lookAt(cx + tan.x, baseY + 1.5, cz + tan.z)
      group.add(wall)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4, 1.6, 4), roofMat)
      roof.position.set(cx, baseY + 3.8, cz)
      roof.rotation.y = angle + Math.PI / 4
      group.add(roof)
      break
    }
    case 'mountain-rock-bridge': {
      // Stone arch bridge silhouette.
      const archMat = sharedMaterial('sig:stone', () => new THREE.MeshLambertMaterial({ color: 0x807870 }))
      const arch = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 1.6), archMat)
      arch.position.set(cx, baseY + 4, cz)
      arch.lookAt(cx + tan.x, baseY + 4, cz + tan.z)
      group.add(arch)
      for (let i = -2; i <= 2; i++) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), archMat)
        pylon.position.set(cx + tan.x * i * 1.4, baseY + 2, cz + tan.z * i * 1.4)
        group.add(pylon)
      }
      break
    }
    case 'mountain-viaduct': {
      // Tall multi-pillar viaduct silhouette.
      const pier = sharedMaterial('sig:viaduct', () => new THREE.MeshLambertMaterial({ color: 0x6a5a4a }))
      const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 1.2), pier)
      deck.position.set(cx, baseY + 5.5, cz)
      deck.lookAt(cx + tan.x, baseY + 5.5, cz + tan.z)
      group.add(deck)
      for (let i = -3; i <= 3; i++) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.2, 0.3), pier)
        col.position.set(cx + tan.x * i * 1.4, baseY + 2.6, cz + tan.z * i * 1.4)
        group.add(col)
      }
      break
    }
    case 'coastal-marina': {
      // Two finger pontoons + a tall mast.
      const dock = sharedMaterial('sig:dock', () => new THREE.MeshLambertMaterial({ color: 0x6a5a44 }))
      for (let i = 0; i < 3; i++) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 3 + i * 0.5), dock)
        arm.position.set(cx + i * 0.7, baseY + 0.6, cz + i * 0.5)
        group.add(arm)
      }
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 6), sharedMaterial('sig:mast', () => new THREE.MeshLambertMaterial({ color: 0x101418 })))
      mast.position.set(cx, baseY + 2.5, cz)
      group.add(mast)
      break
    }
    case 'coastal-lighthouse': {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 6, 12), sharedMaterial('sig:lighthouse', () => new THREE.MeshLambertMaterial({ color: 0xeeeeee })))
      tower.position.set(cx, baseY + 3, cz)
      group.add(tower)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), sharedMaterial('sig:lamp', () => new THREE.MeshBasicMaterial({ color: 0xffe48c })))
      lamp.position.set(cx, baseY + 6.3, cz)
      group.add(lamp)
      break
    }
    case 'desert-shade-canopy': {
      // Large tensioned fabric canopy.
      const mem = sharedMaterial('sig:canopy', () => new THREE.MeshLambertMaterial({ color: 0xeee2c0 }))
      const top = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), mem)
      top.position.set(cx, baseY + 5, cz)
      top.rotation.x = -Math.PI / 2.5
      group.add(top)
      for (let i = -1; i <= 1; i += 2) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), sharedMaterial('sig:canopy:pole', () => new THREE.MeshLambertMaterial({ color: 0x101418 })))
        pole.position.set(cx + i * 3.5, baseY + 2.5, cz)
        group.add(pole)
      }
      break
    }
    case 'desert-tower': {
      // Tall observation tower with a viewing deck.
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 7, 8), sharedMaterial('sig:tower', () => new THREE.MeshLambertMaterial({ color: 0xc6a070 })))
      shaft.position.set(cx, baseY + 3.5, cz)
      group.add(shaft)
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 16), sharedMaterial('sig:deck', () => new THREE.MeshLambertMaterial({ color: 0xb09060 })))
      deck.position.set(cx, baseY + 6.5, cz)
      group.add(deck)
      const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.2, 8), sharedMaterial('sig:tower:roof', () => new THREE.MeshLambertMaterial({ color: 0x704a2a })))
      roof2.position.set(cx, baseY + 7.5, cz)
      group.add(roof2)
      break
    }
    case 'urban-bridge': {
      // Cable-stayed bridge silhouette: two pylons + deck.
      const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 1.4), sharedMaterial('sig:bridge', () => new THREE.MeshLambertMaterial({ color: 0x6a6a6a })))
      deck.position.set(cx, baseY + 3, cz)
      deck.lookAt(cx + tan.x, baseY + 3, cz + tan.z)
      group.add(deck)
      for (const dx of [-3.5, 3.5]) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), sharedMaterial('sig:bridge:pylon', () => new THREE.MeshLambertMaterial({ color: 0xc0c0c0 })))
        pylon.position.set(cx + side.x * dx, baseY + 3, cz + side.z * dx)
        group.add(pylon)
      }
      break
    }
    case 'urban-pavilion': {
      // Open-sided glass pavilion.
      const frame = sharedMaterial('sig:pavilion', () => new THREE.MeshLambertMaterial({ color: 0x404a55 }))
      for (let i = 0; i < 4; i++) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.2), frame)
        col.position.set(
          cx + Math.cos((i * Math.PI) / 2) * 2.4,
          baseY + 1.6,
          cz + Math.sin((i * Math.PI) / 2) * 2.4,
        )
        group.add(col)
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.2, 5.5), sharedMaterial('sig:pavilion:roof', () => new THREE.MeshLambertMaterial({ color: 0x202832 })))
      roof.position.set(cx, baseY + 3.4, cz)
      group.add(roof)
      break
    }
    case 'modern-control-tower': {
      // Tall slim glass control tower.
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8, 1.6), sharedMaterial('sig:ct', () => new THREE.MeshLambertMaterial({ color: 0x6da3c8 })))
      tower.position.set(cx, baseY + 4, cz)
      group.add(tower)
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 2.4), sharedMaterial('sig:ct:top', () => new THREE.MeshLambertMaterial({ color: 0x101418 })))
      top.position.set(cx, baseY + 8.2, cz)
      group.add(top)
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), sharedMaterial('sig:ct:antenna', () => new THREE.MeshLambertMaterial({ color: 0x101418 })))
      ant.position.set(cx, baseY + 9.1, cz)
      group.add(ant)
      break
    }
    case 'modern-grandstand': {
      // Iconic angular main grandstand silhouette.
      const stand = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 4), sharedMaterial('sig:mg', () => new THREE.MeshLambertMaterial({ color: 0x4a5260 })))
      stand.position.set(cx, baseY + 3, cz)
      stand.lookAt(cx + tan.x, baseY + 3, cz + tan.z)
      group.add(stand)
      const roof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.2, 4.6), sharedMaterial('sig:mg:roof', () => new THREE.MeshLambertMaterial({ color: 0x101418 })))
      roof.position.set(cx, baseY + 6.1, cz)
      roof.lookAt(cx + tan.x, baseY + 6.1, cz + tan.z)
      group.add(roof)
      break
    }
  }
  void angle
  return group
  void theme
}

function buildHorizonLayers(
  curve: THREE.CatmullRomCurve3,
  def: TrackVisualDefinition,
  theme: EnvironmentTheme,
): THREE.Group {
  const group = new THREE.Group()
  // 12 low-detail distant terrain blocks arranged in a ring
  // around the centreline at radius ~2x track radius. Colour and
  // height depend on the theme so each environment gets a
  // distinct horizon silhouette.
  const radius = def.terrainRadius * 1.6
  const heightByTheme: Record<string, number> = {
    'forest': 4,
    'mountain': 12,
    'coastal': 2,
    'desert': 5,
    'urban-park': 8,
    'modern-purpose-built': 9,
  }
  const colorByTheme: Record<string, number> = {
    'forest': 0x1a2a1f,
    'mountain': 0x4a4538,
    'coastal': 0x6a8a9a,
    'desert': 0xa08050,
    'urban-park': 0x2a2f3a,
    'modern-purpose-built': 0x3a4250,
  }
  const blockColor = (colorByTheme as Record<string, number>)[theme as unknown as string] ?? 0x303030
  const blockH = (heightByTheme as Record<string, number>)[theme as unknown as string] ?? 4
  const intensity = def.horizon?.intensity ?? 0.85
  const n = Math.max(8, Math.round(12 * intensity))
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2
    const r = radius * (0.85 + ((i * 17) % 7) * 0.04)
    const h = blockH * (0.7 + ((i * 11) % 5) * 0.12)
    const w = 16 + ((i * 7) % 11) * 3
    const d = 10 + ((i * 5) % 9) * 3
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: blockColor, fog: true }),
    )
    block.position.set(Math.cos(ang) * r, h / 2 - 2, Math.sin(ang) * r)
    group.add(block)
  }
  return group
  void curve
}

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
  // Per-circuit signature feature — one explicit object per
  // archetype so the player can recognise each environment by a
  // distinct landmark (timber bridge, rock-cut, shade canopy,
  // marina, control tower, etc).
  const signature = buildSignatureFeature(curve, def, theme)
  group.add(signature)
  // Distant horizon layers themed per environment.
  const horizon = buildHorizonLayers(curve, def, theme)
  group.add(horizon)

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
