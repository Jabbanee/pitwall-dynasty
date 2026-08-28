// Pitwall Dynasty — modular 3D race car.
//
// Era-aware silhouette, team colours, distinct livery accents. Each
// era family produces a recognisably different chassis (1980s slim
// and tall-winged, 2022+ wide and haloed).
//
// Era family resolution is deterministic from `eraFactor` so the
// same seed + the same era number produce the same shape.

import * as THREE from 'three'
import type { TeamColors } from '../../core/types'

export interface CarVisualOptions {
  colors: TeamColors
  carNumber: number
  /** 0 = 80s slim, 1 = modern wide — affects proportions */
  eraFactor: number
  /** Compound index for the current stint: 0 soft, 1 medium, 2 hard, 3 int, 4 wet. */
  compound?: number
}

export interface CarVisual {
  group: THREE.Group
  /** Per-frame update: wheel spin, body pitch. */
  update(dt: number, speedMetersPerSecond: number, lateralG?: number, longitudinalG?: number): void
  setCompound(c: number): void
  setRetired(retired: boolean): void
  dispose(): void
  /** Era-derived dimensional fingerprint. Exposed for tests. */
  readonly eraDimensions: {
    eraFactor: number
    tubWidth: number
    rearWingHeight: number
    haloPresent: boolean
    floorStrake: boolean
  }
}

const BODY_MATERIAL_CACHE = new Map<string, THREE.MeshLambertMaterial>()
function bodyMaterial(colors: TeamColors): THREE.MeshLambertMaterial {
  const key = colors.primary + colors.secondary
  let mat = BODY_MATERIAL_CACHE.get(key)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.primary) })
    BODY_MATERIAL_CACHE.set(key, mat)
  }
  return mat
}

function accentMaterial(colors: TeamColors): THREE.MeshLambertMaterial {
  let mat = BODY_MATERIAL_CACHE.get('acc:' + colors.secondary)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.secondary) })
    BODY_MATERIAL_CACHE.set('acc:' + colors.secondary, mat)
  }
  return mat
}

const DARK_MAT = new THREE.MeshLambertMaterial({ color: 0x10141a })
const COMPOUND_COLORS: Record<number, number> = {
  0: 0xd23a3a, // soft — red
  1: 0xe6c33a, // medium — yellow
  2: 0xededed, // hard — white
  3: 0x4ad17d, // intermediate — green
  4: 0x4a8fd1, // wet — blue
}
const TYRE_MAT = new THREE.MeshLambertMaterial({ color: 0x14161a })
const TYRE_MARK_CACHE = new Map<number, THREE.MeshLambertMaterial>()
function tyreMarkMat(c: number): THREE.MeshLambertMaterial {
  const col = COMPOUND_COLORS[c] ?? 0xdddddd
  let mat = TYRE_MARK_CACHE.get(col)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: col })
    TYRE_MARK_CACHE.set(col, mat)
  }
  return mat
}

export function createCar(opts: CarVisualOptions): CarVisual {
  const group = new THREE.Group()
  const body = bodyMaterial(opts.colors)
  const accent = accentMaterial(opts.colors)
  const era = Math.max(0, Math.min(1, opts.eraFactor))

  // --- Era family dimensions ---
  // 1980s slim & tall-winged → 2022+ wide and haloed
  const tubWidth = 1.55 + era * 0.65
  const tubHeight = 0.5 + era * 0.05
  const tubLength = 4.2 + era * 0.4
  const noseWidth = 0.7 + era * 0.35
  const noseLength = 1.9 + era * 0.35
  const noseHeight = 0.3 + era * 0.05
  const frontWingWidth = 2.6 + era * 1.0
  const frontWingHeight = era < 0.3 ? 0.14 : era < 0.7 ? 0.07 : 0.05
  const sidepodWidth = 0.55 + era * 0.65
  const sidepodHeight = 0.5 + era * 0.15
  const sidepodLength = 2.1 + era * 0.5
  const airboxHeight = era < 0.35 ? 0.85 : era < 0.65 ? 0.5 : 0.25
  const airboxLength = era < 0.35 ? 0.6 : 0.7
  const rearWingWidth = 2.5 + era * 0.9
  const rearWingHeight = era < 0.3 ? 0.85 : era < 0.6 ? 0.55 : 0.12
  const rearWingEndPlate = era < 0.4
  const haloPresent = era > 0.55
  const floorStrake = era > 0.6
  const wingMirror = era < 0.4
  const tyreWidth = 0.45 + (1 - era) * 0.15 // older eras had wider / taller tyres
  const tyreDiameter = 0.62 + (1 - era) * 0.06

  // --- Chassis / tub ---
  const tub = new THREE.Mesh(new THREE.BoxGeometry(tubWidth, tubHeight, tubLength), body)
  tub.position.y = 0.4
  group.add(tub)

  // --- Nose ---
  const nose = new THREE.Mesh(new THREE.BoxGeometry(noseWidth, noseHeight, noseLength), body)
  nose.position.set(0, 0.4, 2.6 + (noseLength - 2.0) / 2)
  group.add(nose)

  // --- Front wing (multi-element) ---
  const fwY = 0.13 + (era < 0.3 ? 0.1 : 0)
  const fw = new THREE.Mesh(new THREE.BoxGeometry(frontWingWidth, frontWingHeight, 1.1), accent)
  fw.position.set(0, fwY, 3.5 + (noseLength - 2.0))
  group.add(fw)
  if (era < 0.4) {
    // 1980s / early-90s had tall single-element front wings
    const fwe = new THREE.Mesh(new THREE.BoxGeometry(frontWingWidth * 0.9, 0.45, 0.18), accent)
    fwe.position.set(0, fwY + 0.25, 3.6 + (noseLength - 2.0))
    group.add(fwe)
  } else {
    // Modern multi-element flap
    const flap = new THREE.Mesh(new THREE.BoxGeometry(frontWingWidth * 0.95, 0.06, 0.3), accent)
    flap.position.set(0, fwY + 0.06, 3.5 + (noseLength - 2.0) + 0.35)
    group.add(flap)
  }

  // --- Sidepods ---
  const podGeo = new THREE.BoxGeometry(sidepodWidth, sidepodHeight, sidepodLength)
  const podL = new THREE.Mesh(podGeo, body)
  podL.position.set(-(1.0 + era * 0.4), 0.42, -0.1)
  const podR = podL.clone()
  podR.position.x = 1.0 + era * 0.4
  group.add(podL, podR)

  // --- Engine cover / airbox ---
  const coverHeight = 0.45 + (1 - era) * 0.35
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.65, coverHeight, 2.4), body)
  cover.position.set(0, 0.7 + (1 - era) * 0.25, -1.4)
  group.add(cover)
  const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, airboxHeight, airboxLength), DARK_MAT)
  airbox.position.set(0, 0.85 + (1 - era) * 0.5, -0.6)
  group.add(airbox)

  // --- Sidepod inlets (subtle) ---
  const inletMat = new THREE.MeshLambertMaterial({ color: 0x0a0c10 })
  for (const dir of [-1, 1]) {
    const inlet = new THREE.Mesh(new THREE.BoxGeometry(0.05, sidepodHeight * 0.7, 0.5), inletMat)
    inlet.position.set(dir * (1.0 + era * 0.4), 0.42, 0.4)
    group.add(inlet)
  }

  // --- Rear wing ---
  const rw = new THREE.Mesh(new THREE.BoxGeometry(rearWingWidth, rearWingHeight, 0.7), accent)
  rw.position.set(0, 0.95 + (1 - era) * 0.7, -3.1)
  group.add(rw)
  if (rearWingEndPlate) {
    for (const dir of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, rearWingHeight * 1.1, 0.7), accent)
      plate.position.set(dir * (rearWingWidth / 2 - 0.05), rw.position.y, -3.1)
      group.add(plate)
    }
  }
  // Rear wing pylon
  const rwPylon = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.4), DARK_MAT)
  rwPylon.position.set(0, 0.6 + (1 - era) * 0.4, -3.0)
  group.add(rwPylon)

  // --- Beam wing (small element below the rear wing) ---
  const beamWing = new THREE.Mesh(new THREE.BoxGeometry(rearWingWidth * 0.9, 0.04, 0.3), accent)
  beamWing.position.set(0, 0.45, -3.0)
  group.add(beamWing)

  // --- Floor / strakes (modern only) ---
  if (floorStrake) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(tubWidth * 0.95, 0.04, 2.6), DARK_MAT)
    floor.position.set(0, 0.12, 0)
    group.add(floor)
  }

  // --- Halo (2018+ only) ---
  if (haloPresent) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 14, Math.PI), DARK_MAT)
    halo.rotation.x = -Math.PI / 2
    halo.rotation.z = Math.PI
    halo.position.set(0, 1.05, 0.4)
    group.add(halo)
    // Central pylon
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.7), DARK_MAT)
    pylon.position.set(0, 1.05, 0.4)
    group.add(pylon)
  }

  // --- Wing mirrors (old eras) ---
  if (wingMirror) {
    for (const dir of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.18), DARK_MAT)
      mirror.position.set(dir * (tubWidth / 2 + 0.05), 0.65, 0.5)
      group.add(mirror)
    }
  }

  // --- Wheels ---
  const wheelGeo = new THREE.CylinderGeometry(tyreDiameter, tyreDiameter, tyreWidth, 14)
  const wheelRimMat = new THREE.MeshLambertMaterial({ color: 0x1f2329 })
  const wheelPositions: Array<[number, number]> = [
    [-1.4, 2.5], [1.4, 2.5], [-1.5, -2.3], [1.5, -2.3],
  ]
  const wheels: THREE.Mesh[] = []
  for (const [x, z] of wheelPositions) {
    const w = new THREE.Mesh(wheelGeo, TYRE_MAT)
    w.rotation.z = Math.PI / 2
    w.position.set(x, tyreDiameter, z)
    group.add(w)
    // Rim
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(tyreDiameter * 0.55, tyreDiameter * 0.55, tyreWidth * 1.05, 12), wheelRimMat)
    rim.rotation.z = Math.PI / 2
    rim.position.copy(w.position)
    group.add(rim)
    // Compound marker (the small coloured ring on the tyre wall)
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(tyreWidth * 1.06, 0.12, 0.16),
      tyreMarkMat(opts.compound ?? 1),
    )
    marker.position.set(x, tyreDiameter + 0.1, z)
    group.add(marker)
    wheels.push(w)
  }

  // --- Driver helmet visible above the cockpit ---
  const helmetBase = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(opts.colors.primary).multiplyScalar(0.85) }),
  )
  helmetBase.position.set(0, 0.95, 0.15)
  group.add(helmetBase)
  const helmetStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.06, 0.32),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(opts.colors.secondary) }),
  )
  helmetStripe.position.set(0, 1.04, 0.15)
  group.add(helmetStripe)

  // --- Number plate (on engine cover / sidepod) ---
  const numberTex = makeNumberTexture(opts.carNumber, opts.colors)
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ map: numberTex, transparent: true }),
  )
  plate.position.set(0, 0.95, -2.4)
  plate.rotation.y = Math.PI
  group.add(plate)
  // Side number
  const sidePlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ map: numberTex, transparent: true }),
  )
  sidePlate.position.set(tubWidth / 2 + 0.01, 0.55, -0.6)
  sidePlate.rotation.y = Math.PI / 2
  group.add(sidePlate)
  const sidePlateL = sidePlate.clone()
  sidePlateL.position.x = -tubWidth / 2 - 0.01
  sidePlateL.rotation.y = -Math.PI / 2
  group.add(sidePlateL)

  // --- Livery accent stripes (nose, sidepod, engine cover) ---
  const stripeMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(opts.colors.secondary) })
  const noseStripe = new THREE.Mesh(new THREE.BoxGeometry(noseWidth * 0.35, 0.02, noseLength * 0.7), stripeMat)
  noseStripe.position.set(0, 0.55, 2.6 + (noseLength - 2.0) / 2)
  group.add(noseStripe)
  // Side stripe
  for (const dir of [-1, 1]) {
    const sideStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.05, sidepodLength * 0.9),
      stripeMat,
    )
    sideStripe.position.set(dir * (1.0 + era * 0.4 + 0.005), 0.5, -0.1)
    group.add(sideStripe)
  }

  // --- Group origin offset: cars are built with their visual centre
  // at z=0, but for the simulation they pivot at the centre of the
  // car. We keep the visual origin at the tub centre. ---
  let wheelRotation = 0
  let pitch = 0
  let roll = 0
  let retired = false
  return {
    group,
    eraDimensions: {
      eraFactor: era,
      tubWidth,
      rearWingHeight,
      haloPresent,
      floorStrake,
    },
    update(_dt, speed, lateralG = 0, longitudinalG = 0) {
      // Wheel spin — proportional to ground speed. At 80 m/s the
      // wheels complete ~1.2 revolutions per second.
      const wheelRPS = Math.abs(speed) / (Math.PI * tyreDiameter * 2)
      wheelRotation += wheelRPS * _dt
      for (const w of wheels) w.rotation.x = wheelRotation
      // Body pitch under accel/brake, roll in corners. These are
      // presentation-only and must not feed back into simulation.
      const targetPitch = -longitudinalG * 0.05
      const targetRoll = lateralG * 0.06
      pitch += (targetPitch - pitch) * 0.15
      roll += (targetRoll - roll) * 0.15
      tub.rotation.z = roll
      nose.rotation.z = roll * 0.6
      podL.rotation.z = roll * 0.8
      podR.rotation.z = roll * 0.8
      cover.rotation.z = roll * 0.4
      airbox.rotation.z = roll * 0.3
      fw.rotation.z = roll * 0.4
      // Pitch is harder because the nose/wing pitch differently to the tub.
      nose.rotation.x = pitch * 0.4
      fw.rotation.x = -pitch * 0.5
      rw.rotation.x = -pitch * 0.6
      airbox.rotation.x = pitch * 0.2
      cover.rotation.x = pitch * 0.2
      if (retired) group.visible = false
    },
    setCompound(c) {
      // Swap the compound marker on each wheel.
      const mat = tyreMarkMat(c)
      for (const child of group.children) {
        const geo = (child as THREE.Mesh).geometry
        if (geo instanceof THREE.BoxGeometry && geo.parameters.width && geo.parameters.width < 1) {
          const mesh = child as THREE.Mesh
          if (Math.abs(geo.parameters.width - tyreWidth * 1.06) < 0.01) {
            mesh.material = mat
          }
        }
      }
    },
    setRetired(r) {
      retired = r
      group.visible = !r
    },
    dispose() {
      group.traverse((obj) => {
        const m = obj as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
      })
      numberTex.dispose()
    },
  }
}

function makeNumberTexture(n: number, colors: TeamColors): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 128, 128)
  // Rounded background
  ctx.fillStyle = colors.primary
  ctx.beginPath()
  const r = 16
  ctx.moveTo(r, 0)
  ctx.lineTo(128 - r, 0)
  ctx.quadraticCurveTo(128, 0, 128, r)
  ctx.lineTo(128, 128 - r)
  ctx.quadraticCurveTo(128, 128, 128 - r, 128)
  ctx.lineTo(r, 128)
  ctx.quadraticCurveTo(0, 128, 0, 128 - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#0b0f15'
  ctx.font = 'bold 90px Rajdhani, Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(n), 64, 70)
  return new THREE.CanvasTexture(canvas)
}
