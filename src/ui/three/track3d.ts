import * as THREE from 'three'
import type { Circuit } from '../../core/types'

/**
 * 3D circuit generation from structured data: centerline spline → asphalt
 * mesh with elevation, kerbs, runoff, environment. Original fictional
 * layouts — no real circuit geometry.
 */

export interface TrackPoint {
  x: number
  y: number
  z: number // elevation
}

/** Deterministic closed-loop circuit from the circuit definition. */
export function generateCenterline(circuit: Circuit, points = 28): TrackPoint[] {
  let h = 2166136261
  for (const ch of circuit.id) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
  const rand = (n: number) => {
    h = (h * 1103515245 + 12345) >>> 0
    return (((h >>> 16) % 1000) / 1000 - 0.5) * n
  }
  const out: TrackPoint[] = []
  const c = circuit.characteristics
  // Shape influenced by circuit character
  const radius = 220
  const squash = 0.72
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    const wobble = rand(0.5) * (0.35 + c.overtakingDifficulty / 200)
    const r = radius * (1 + wobble)
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r * squash
    const z = Math.sin(a * 2 + 1) * (c.brakingStress / 12) + rand(4)
    out.push({ x, y, z })
  }
  return out
}

export interface TrackMeshes {
  group: THREE.Group
  curve: THREE.CatmullRomCurve3
  trackWidth: number
  /** Sample a world position at lap fraction [0,1). */
  positionAt(frac: number, target: THREE.Vector3): THREE.Vector3
  /** Tangent (direction of travel) at fraction. */
  tangentAt(frac: number, target: THREE.Vector3): THREE.Vector3
  totalLength: number
}

export function buildTrackMeshes(circuit: Circuit): TrackMeshes {
  const group = new THREE.Group()
  const center = generateCenterline(circuit)
  const curve = new THREE.CatmullRomCurve3(
    center.map((p) => new THREE.Vector3(p.x, p.z, p.y)),
    true,
    'catmullrom',
    0.5,
  )
  const trackWidth = 14
  const segments = 400

  // --- Asphalt ribbon ---
  const asphaltGeo = new THREE.BufferGeometry()
  const verts: number[] = []
  const uvs: number[] = []
  const normals: number[] = []
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const pos = curve.getPointAt(t % 1)
    const tan = curve.getTangentAt(t % 1)
    const side = new THREE.Vector3().crossVectors(up, tan).normalize()
    const halfW = trackWidth / 2
    const l = pos.clone().addScaledVector(side, -halfW)
    const r = pos.clone().addScaledVector(side, halfW)
    verts.push(l.x, l.y + 0.05, l.z, r.x, r.y + 0.05, r.z)
    uvs.push(0, t * 80, 1, t * 80)
    normals.push(0, 1, 0, 0, 1, 0)
  }
  const indices: number[] = []
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
    indices.push(a, c, b, b, c, d)
  }
  asphaltGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  asphaltGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  asphaltGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  asphaltGeo.setIndex(indices)
  const asphalt = new THREE.Mesh(asphaltGeo, new THREE.MeshLambertMaterial({ color: 0x2e3540 }))
  group.add(asphalt)

  // --- Kerbs (red/white strips on edges) ---
  const kerbGeo = new THREE.BufferGeometry()
  const kVerts: number[] = []
  const kCols: number[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const pos = curve.getPointAt(t % 1)
    const tan = curve.getTangentAt(t % 1)
    const side = new THREE.Vector3().crossVectors(up, tan).normalize()
    const red = Math.floor(t * segments / 4) % 2 === 0
    for (const dir of [-1, 1]) {
      const inner = pos.clone().addScaledVector(side, dir * (trackWidth / 2))
      const outer = pos.clone().addScaledVector(side, dir * (trackWidth / 2 + 1.6))
      kVerts.push(inner.x, inner.y + 0.08, inner.z, outer.x, outer.y + 0.02, outer.z)
      const col = red ? [0.85, 0.2, 0.18] : [0.92, 0.92, 0.92]
      kCols.push(...col, ...col)
    }
  }
  const kIndices: number[] = []
  for (let i = 0; i < segments; i++) {
    for (const side of [0, 1]) {
      const a = i * 4 + side * 2, b = a + 1, c = (i + 1) * 4 + side * 2, d = c + 1
      kIndices.push(a, c, b, b, c, d)
    }
  }
  kerbGeo.setAttribute('position', new THREE.Float32BufferAttribute(kVerts, 3))
  kerbGeo.setAttribute('color', new THREE.Float32BufferAttribute(kCols, 3))
  kerbGeo.setIndex(kIndices)
  kerbGeo.computeVertexNormals()
  group.add(new THREE.Mesh(kerbGeo, new THREE.MeshBasicMaterial({ vertexColors: true })))

  // --- Ground plane ---
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(700, 48),
    new THREE.MeshLambertMaterial({ color: 0x1d2b1f }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.2
  group.add(ground)

  // --- Runoff / gravel patches at heavy braking zones ---
  const gravelMat = new THREE.MeshLambertMaterial({ color: 0x8a7a55 })
  for (let i = 0; i < 6; i++) {
    const t = i / 6 + 0.05
    const pos = curve.getPointAt(t % 1)
    const tan = curve.getTangentAt(t % 1)
    const side = new THREE.Vector3().crossVectors(up, tan).normalize()
    const patch = new THREE.Mesh(new THREE.CircleGeometry(16, 12), gravelMat)
    patch.rotation.x = -Math.PI / 2
    patch.position.copy(pos).addScaledVector(side, (i % 2 === 0 ? 1 : -1) * (trackWidth / 2 + 12))
    patch.position.y = 0.02
    group.add(patch)
  }

  // --- Start/finish gantry ---
  const sfPos = curve.getPointAt(0)
  const gantry = new THREE.Mesh(
    new THREE.BoxGeometry(trackWidth + 8, 2, 1.5),
    new THREE.MeshLambertMaterial({ color: 0x11161f }),
  )
  gantry.position.set(sfPos.x, 7, sfPos.z)
  group.add(gantry)
  const post1 = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 1), new THREE.MeshLambertMaterial({ color: 0x11161f }))
  post1.position.set(sfPos.x - (trackWidth / 2 + 3), 4, sfPos.z)
  const post2 = post1.clone()
  post2.position.x = sfPos.x + (trackWidth / 2 + 3)
  group.add(post1, post2)

  // --- Environment: trees + stands (instanced for performance) ---
  const treeGeo = new THREE.ConeGeometry(4, 12, 6)
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x2a4a2e })
  const treeCount = 90
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount)
  const dummy = new THREE.Object3D()
  let h = 99
  const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 16) / 65536 }
  for (let i = 0; i < treeCount; i++) {
    const t = rnd()
    const pos = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const side = new THREE.Vector3().crossVectors(up, tan).normalize()
    dummy.position.copy(pos).addScaledVector(side, (rnd() > 0.5 ? 1 : -1) * (45 + rnd() * 90))
    dummy.position.y = 6
    const s = 0.7 + rnd() * 0.8
    dummy.scale.setScalar(s)
    dummy.rotation.y = rnd() * Math.PI
    dummy.updateMatrix()
    trees.setMatrixAt(i, dummy.matrix)
  }
  group.add(trees)

  // Grandstand near start
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(70, 10, 18),
    new THREE.MeshLambertMaterial({ color: 0x3a4452 }),
  )
  const standSide = new THREE.Vector3().crossVectors(up, curve.getTangentAt(0)).normalize()
  stand.position.copy(sfPos).addScaledVector(standSide, -(trackWidth / 2 + 30))
  stand.position.y = 5
  group.add(stand)

  const totalLength = curve.getLength()
  return {
    group,
    curve,
    trackWidth,
    totalLength,
    positionAt(frac, target) {
      const p = curve.getPointAt(((frac % 1) + 1) % 1)
      target.copy(p)
      return target
    },
    tangentAt(frac, target) {
      const t = curve.getTangentAt(((frac % 1) + 1) % 1)
      target.copy(t)
      return target
    },
  }
}
