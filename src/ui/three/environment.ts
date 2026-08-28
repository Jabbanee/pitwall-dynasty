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
// Track ribbon (asphalt + edges)
// ---------------------------------------------------------------------------

function buildAsphalt(
  curve: THREE.CatmullRomCurve3,
  width: number,
  baseColor: number,
  segments: number,
): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  const verts: number[] = []
  const uvs: number[] = []
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const pos = curve.getPointAt(t % 1)
    const tan = curve.getTangentAt(t % 1)
    const side = new THREE.Vector3().crossVectors(up, tan).normalize()
    const halfW = width / 2
    const l = pos.clone().addScaledVector(side, -halfW)
    const r = pos.clone().addScaledVector(side, halfW)
    verts.push(l.x, l.y + 0.05, l.z, r.x, r.y + 0.05, r.z)
    uvs.push(0, t * 80, 1, t * 80)
  }
  const indices: number[] = []
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
    indices.push(a, c, b, b, c, d)
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return new THREE.Mesh(
    geo,
    sharedMaterial(`asphalt:${baseColor}`, () => new THREE.MeshLambertMaterial({ color: baseColor })),
  )
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
    // Door (subtle colour block)
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(garageLen * 0.85, 2.4),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xc5a14a : 0x6c7a8a }),
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
  const asphalt = buildAsphalt(curve, def.baseWidth, theme.asphalt, 400)
  group.add(asphalt)
  const curbs = buildCurbs(curve, def.baseWidth, def)
  group.add(curbs)
  const runoff = buildRunoff(curve, def.baseWidth, def, theme)
  group.add(runoff)
  const barriers = buildBarriers(curve, def.baseWidth, def)
  group.add(barriers)
  const stands = buildGrandstands(curve, def, graphicsLevel)
  group.add(stands)
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
