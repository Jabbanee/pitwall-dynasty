// Pitwall Dynasty — modular 3D race car (P3).
//
// Era-aware silhouette, team colours, distinct livery accents.
// Each era family produces a recognisably different chassis:
//   1980s  — slim, tall airbox, tall rear wing, no halo
//   early 90s — slightly wider, multi-element front wing
//   late 90s — wide track, low rear wing
//   2009–13 — wide, low front wing, beam wing, no halo
//   2014–18 — wider, low rear wing, no halo
//   2019–21 — halo present
//   2022+  — wide tub, halo, ground-effect floor
//
// Modelled features:
//   - nose cone (slim → wide)
//   - front wing (multi-element era-correct)
//   - cockpit / driver helmet / visor
//   - sidepods (era-correct shape)
//   - engine cover (low scoop / tall airbox)
//   - rear wing with endplates (1980s) or DRS-style
//   - beam wing (when era > 0.6)
//   - ground-effect floor (era > 0.6)
//   - halo (era > 0.55)
//   - four wheels with hub + compound marker
//   - suspension arms (single shared geometry)
//   - livery stripes (nose, sidepod, engine cover)

import * as THREE from 'three'
import type { TeamColors } from '../../core/types'

export interface CarVisualOptions {
  colors: TeamColors
  carNumber: number
  /** 0 = 80s slim, 1 = modern wide */
  eraFactor: number
  /** Compound index: 0 soft, 1 medium, 2 hard, 3 int, 4 wet. */
  compound?: number
}

export interface CarVisual {
  group: THREE.Group
  update(dt: number, speed: number, lateralG?: number, longitudinalG?: number): void
  setCompound(c: number): void
  setRetired(r: boolean): void
  dispose(): void
  readonly eraDimensions: {
    eraFactor: number
    tubWidth: number
    rearWingHeight: number
    haloPresent: boolean
    floorStrake: boolean
  }
}

// Cached materials. We key by hex so two teams with the same
// primary colour share a single material instance — important for
// the draw-call count.
const BODY_CACHE = new Map<string, THREE.MeshLambertMaterial>()
const DARK_MAT = new THREE.MeshLambertMaterial({ color: 0x10141a })
const WING_DARK_MAT = new THREE.MeshLambertMaterial({ color: 0x0a0d12 })
const TUB_DARK_MAT = new THREE.MeshLambertMaterial({ color: 0x161a22 })
const COMPOUND_COLORS: Record<number, number> = {
  0: 0xd23a3a, // soft
  1: 0xe6c33a, // medium
  2: 0xededed, // hard
  3: 0x4ad17d, // int
  4: 0x4a8fd1, // wet
}
const TYRE_MAT = new THREE.MeshLambertMaterial({ color: 0x12141a })
const TYRE_MARK_CACHE = new Map<number, THREE.MeshLambertMaterial>()
const RIM_MAT = new THREE.MeshLambertMaterial({ color: 0x202830 })
const COMPOUND_TEXT_CACHE = new Map<string, THREE.CanvasTexture>()

function bodyMaterial(colors: TeamColors): THREE.MeshLambertMaterial {
  const key = colors.primary
  let mat = BODY_CACHE.get(key)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.primary) })
    BODY_CACHE.set(key, mat)
  }
  return mat
}

function accentMaterial(colors: TeamColors): THREE.MeshLambertMaterial {
  const key = colors.secondary
  let mat = BODY_CACHE.get('acc:' + key)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.secondary) })
    BODY_CACHE.set('acc:' + key, mat)
  }
  return mat
}

function tyreMarkMat(c: number): THREE.MeshLambertMaterial {
  const col = COMPOUND_COLORS[c] ?? 0xdddddd
  let mat = TYRE_MARK_CACHE.get(col)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.15) })
    TYRE_MARK_CACHE.set(col, mat)
  }
  return mat
}

function numberTexture(n: number, colors: TeamColors): THREE.CanvasTexture {
  const cacheKey = n + ':' + colors.primary
  let tex = COMPOUND_TEXT_CACHE.get(cacheKey)
  if (tex) return tex
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  // Rounded plate background in team primary
  ctx.fillStyle = colors.primary
  const r = 48
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(256 - r, 0)
  ctx.quadraticCurveTo(256, 0, 256, r)
  ctx.lineTo(256, 256 - r)
  ctx.quadraticCurveTo(256, 256, 256 - r, 256)
  ctx.lineTo(r, 256)
  ctx.quadraticCurveTo(0, 256, 0, 256 - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.fill()
  // Inner stripe in secondary
  ctx.fillStyle = colors.secondary
  ctx.fillRect(8, 110, 240, 36)
  // Number
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 168px Rajdhani, Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(n), 128, 138)
  tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  COMPOUND_TEXT_CACHE.set(cacheKey, tex)
  return tex
}

export function createCar(opts: CarVisualOptions): CarVisual {
  const group = new THREE.Group()
  const body = bodyMaterial(opts.colors)
  const accent = accentMaterial(opts.colors)
  const era = Math.max(0, Math.min(1, opts.eraFactor))

  // --- Era family dimensions ---
  const tubWidth = 1.55 + era * 0.75
  const tubHeight = 0.5 + era * 0.05
  const tubLength = 4.2 + era * 0.5
  const noseWidth = 0.7 + era * 0.35
  const noseLength = 1.9 + era * 0.4
  const frontWingWidth = 2.6 + era * 1.1
  const frontWingHeight = era < 0.3 ? 0.14 : era < 0.7 ? 0.07 : 0.05
  const sidepodWidth = 0.55 + era * 0.7
  const sidepodHeight = 0.5 + era * 0.18
  const sidepodLength = 2.1 + era * 0.6
  const airboxHeight = era < 0.35 ? 0.85 : era < 0.65 ? 0.5 : 0.25
  const airboxLength = era < 0.35 ? 0.6 : 0.7
  const rearWingWidth = 2.5 + era * 0.9
  const rearWingHeight = era < 0.3 ? 0.85 : era < 0.6 ? 0.55 : 0.12
  const rearWingEndPlate = era < 0.4
  const haloPresent = era > 0.55
  const floorStrake = era > 0.6
  const wingMirror = era < 0.4
  const tyreWidth = 0.45 + (1 - era) * 0.15
  const tyreDiameter = 0.62 + (1 - era) * 0.06
  const suspensionArmCount = era < 0.5 ? 2 : 4

  // --- Chassis (tub) ---
  const tub = new THREE.Mesh(new THREE.BoxGeometry(tubWidth, tubHeight, tubLength), TUB_DARK_MAT)
  tub.position.y = 0.4
  group.add(tub)

  // --- Body panels (the painted chassis skin) ---
  const bodyPanel = new THREE.Mesh(
    new THREE.BoxGeometry(tubWidth * 0.96, 0.2, tubLength * 0.9),
    body,
  )
  bodyPanel.position.y = 0.62
  group.add(bodyPanel)

  // --- Nose cone ---
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(noseWidth, noseLength, 6),
    body,
  )
  nose.rotation.x = -Math.PI / 2
  nose.position.set(0, 0.4, 2.6 + noseLength / 2)
  group.add(nose)
  // Nose tip
  const noseTip = new THREE.Mesh(
    new THREE.BoxGeometry(noseWidth * 0.85, 0.2, 0.3),
    accent,
  )
  noseTip.position.set(0, 0.4, 2.6 + noseLength + 0.05)
  group.add(noseTip)

  // --- Front wing ---
  const fwY = 0.13 + (era < 0.3 ? 0.1 : 0)
  // Main plane
  const fw = new THREE.Mesh(
    new THREE.BoxGeometry(frontWingWidth, frontWingHeight, 1.1),
    accent,
  )
  fw.position.set(0, fwY, 3.6 + noseLength)
  group.add(fw)
  // Endplates
  for (const dir of [-1, 1]) {
    const ep = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, frontWingHeight + 0.18, 0.9),
      WING_DARK_MAT,
    )
    ep.position.set(dir * (frontWingWidth / 2 - 0.05), fwY + 0.05, 3.6 + noseLength)
    group.add(ep)
  }
  // 1980s tall single-element wing
  if (era < 0.4) {
    const fwe = new THREE.Mesh(new THREE.BoxGeometry(frontWingWidth * 0.9, 0.45, 0.18), accent)
    fwe.position.set(0, fwY + 0.25, 3.7 + noseLength)
    group.add(fwe)
  } else {
    // Modern multi-element flap
    const flap = new THREE.Mesh(new THREE.BoxGeometry(frontWingWidth * 0.95, 0.06, 0.3), accent)
    flap.position.set(0, fwY + 0.06, 3.6 + noseLength + 0.35)
    group.add(flap)
    // Second flap
    if (era > 0.7) {
      const flap2 = new THREE.Mesh(new THREE.BoxGeometry(frontWingWidth * 0.85, 0.04, 0.25), accent)
      flap2.position.set(0, fwY + 0.12, 3.6 + noseLength + 0.55)
      group.add(flap2)
    }
  }
  // Front wing pylons connecting to the nose
  for (const dir of [-1, 1]) {
    const pylon = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.3, 0.45),
      WING_DARK_MAT,
    )
    pylon.position.set(dir * (frontWingWidth * 0.3), 0.05, 3.6 + noseLength - 0.4)
    group.add(pylon)
  }

  // --- Sidepods ---
  const podGeo = new THREE.BoxGeometry(sidepodWidth, sidepodHeight, sidepodLength)
  const podL = new THREE.Mesh(podGeo, body)
  podL.position.set(-(1.0 + era * 0.4), 0.42, -0.1)
  const podR = podL.clone()
  podR.position.x = 1.0 + era * 0.4
  group.add(podL, podR)

  // --- Sidepod inlets (dark) ---
  for (const dir of [-1, 1]) {
    const inlet = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, sidepodHeight * 0.7, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x0a0c10 }),
    )
    inlet.position.set(dir * (1.0 + era * 0.4), 0.42, 0.4)
    group.add(inlet)
    // Bargeboard below the sidepod (era > 0.4)
    if (era > 0.4) {
      const barge = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.16, sidepodLength * 0.6),
        WING_DARK_MAT,
      )
      barge.position.set(dir * (1.0 + era * 0.4 + 0.05), 0.18, -0.2)
      group.add(barge)
    }
  }

  // --- Engine cover / airbox ---
  const coverHeight = 0.45 + (1 - era) * 0.35
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.65, coverHeight, 2.4), body)
  cover.position.set(0, 0.7 + (1 - era) * 0.25, -1.4)
  group.add(cover)
  const airbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, airboxHeight, airboxLength),
    era < 0.55 ? DARK_MAT : new THREE.MeshLambertMaterial({ color: 0x0e1116 }),
  )
  airbox.position.set(0, 0.85 + (1 - era) * 0.5, -0.6)
  group.add(airbox)
  // Airbox intake (small dark cylinder on top of older airboxes)
  if (era < 0.6) {
    const intake = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12),
      new THREE.MeshLambertMaterial({ color: 0x07090c }),
    )
    intake.position.set(0, 0.85 + (1 - era) * 0.5 + airboxHeight / 2 + 0.06, -0.6)
    group.add(intake)
  }

  // --- Rear wing ---
  const rw = new THREE.Mesh(
    new THREE.BoxGeometry(rearWingWidth, rearWingHeight, 0.7),
    accent,
  )
  rw.position.set(0, 0.95 + (1 - era) * 0.7, -3.1)
  group.add(rw)
  if (rearWingEndPlate) {
    for (const dir of [-1, 1]) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, rearWingHeight * 1.1, 0.7),
        accent,
      )
      plate.position.set(dir * (rearWingWidth / 2 - 0.05), rw.position.y, -3.1)
      group.add(plate)
    }
  }
  // Rear wing pylon
  const rwPylon = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.6, 0.4),
    DARK_MAT,
  )
  rwPylon.position.set(0, 0.6 + (1 - era) * 0.4, -3.0)
  group.add(rwPylon)
  // Beam wing (under the rear wing)
  if (era > 0.4) {
    const beamWing = new THREE.Mesh(
      new THREE.BoxGeometry(rearWingWidth * 0.9, 0.04, 0.3),
      accent,
    )
    beamWing.position.set(0, 0.45, -3.0)
    group.add(beamWing)
  }
  // DRS flap (open in modern era, closed visually here)
  if (era > 0.7) {
    const drs = new THREE.Mesh(
      new THREE.BoxGeometry(rearWingWidth * 0.7, 0.05, 0.4),
      WING_DARK_MAT,
    )
    drs.position.set(0, 0.95 + (1 - era) * 0.7 + rearWingHeight / 2 + 0.04, -3.1)
    group.add(drs)
  }

  // --- Floor / strakes (modern only) ---
  if (floorStrake) {
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(tubWidth * 0.95, 0.04, 2.8),
      WING_DARK_MAT,
    )
    floor.position.set(0, 0.12, 0)
    group.add(floor)
    // Floor edge wing
    const edgeWing = new THREE.Mesh(
      new THREE.BoxGeometry(tubWidth * 0.95, 0.18, 0.1),
      WING_DARK_MAT,
    )
    edgeWing.position.set(0, 0.18, -1.6)
    group.add(edgeWing)
  }

  // --- Halo (2018+ only) ---
  if (haloPresent) {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.06, 6, 14, Math.PI),
      DARK_MAT,
    )
    halo.rotation.x = -Math.PI / 2
    halo.rotation.z = Math.PI
    halo.position.set(0, 1.05, 0.4)
    group.add(halo)
    // Halo central pylon
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.7), DARK_MAT)
    pylon.position.set(0, 1.05, 0.4)
    group.add(pylon)
  }

  // --- Wing mirrors (old eras) ---
  if (wingMirror) {
    for (const dir of [-1, 1]) {
      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.06, 0.18),
        DARK_MAT,
      )
      mirror.position.set(dir * (tubWidth / 2 + 0.05), 0.65, 0.5)
      group.add(mirror)
    }
  }

  // --- Wheels ---
  const wheelGeo = new THREE.CylinderGeometry(tyreDiameter, tyreDiameter, tyreWidth, 16)
  const wheelPositions: Array<[number, number]> = [
    [-1.45, 2.5], [1.45, 2.5], [-1.55, -2.3], [1.55, -2.3],
  ]
  const wheels: THREE.Mesh[] = []
  for (const [x, z] of wheelPositions) {
    const w = new THREE.Mesh(wheelGeo, TYRE_MAT)
    w.rotation.z = Math.PI / 2
    w.position.set(x, tyreDiameter, z)
    group.add(w)
    // Rim with spoke pattern
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(tyreDiameter * 0.55, tyreDiameter * 0.55, tyreWidth * 1.05, 14),
      RIM_MAT,
    )
    rim.rotation.z = Math.PI / 2
    rim.position.copy(w.position)
    group.add(rim)
    // Inner brake disc (subtle hint)
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(tyreDiameter * 0.4, tyreDiameter * 0.4, 0.02, 14),
      new THREE.MeshLambertMaterial({ color: 0x9a9a9c }),
    )
    disc.rotation.z = Math.PI / 2
    disc.position.copy(w.position)
    disc.position.x += x > 0 ? tyreWidth / 2 + 0.001 : -tyreWidth / 2 - 0.001
    group.add(disc)
    // Compound colour marker on the side wall
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(tyreWidth * 1.06, 0.12, 0.18),
      tyreMarkMat(opts.compound ?? 1),
    )
    marker.position.set(x, tyreDiameter + 0.1, z)
    group.add(marker)
    wheels.push(w)
  }

  // --- Suspension arms (shared thin black bars) ---
  for (const wheelPos of wheelPositions) {
    const [x, z] = wheelPos
    for (let i = 0; i < suspensionArmCount; i++) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 0.6),
        WING_DARK_MAT,
      )
      arm.position.set(x, 0.25, z)
      arm.rotation.z = i * 0.3
      group.add(arm)
    }
  }

  // --- Driver helmet (visible above the cockpit) ---
  const helmetBase = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 8),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(opts.colors.primary).multiplyScalar(0.85) }),
  )
  helmetBase.position.set(0, 0.95, 0.15)
  group.add(helmetBase)
  // Helmet stripe (secondary)
  const helmetStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.06, 0.32),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(opts.colors.secondary) }),
  )
  helmetStripe.position.set(0, 1.04, 0.15)
  group.add(helmetStripe)
  // Visor (dark)
  if (era > 0.4) {
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6, -Math.PI * 0.3, Math.PI * 0.6, 0, Math.PI * 0.5),
      new THREE.MeshLambertMaterial({ color: 0x08111a }),
    )
    visor.position.set(0, 0.96, 0.32)
    visor.rotation.x = -0.2
    group.add(visor)
  }

  // --- Livery: number plate (engine cover + nose) ---
  const numTex = numberTexture(opts.carNumber, opts.colors)
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ map: numTex, transparent: true }),
  )
  plate.position.set(0, 0.95, -2.4)
  plate.rotation.y = Math.PI
  group.add(plate)
  // Side number
  const sidePlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ map: numTex, transparent: true }),
  )
  sidePlate.position.set(tubWidth / 2 + 0.01, 0.55, -0.6)
  sidePlate.rotation.y = Math.PI / 2
  group.add(sidePlate)
  const sidePlateL = sidePlate.clone()
  sidePlateL.position.x = -tubWidth / 2 - 0.01
  sidePlateL.rotation.y = -Math.PI / 2
  group.add(sidePlateL)
  // Nose number (smaller)
  const nosePlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.45, 0.45),
    new THREE.MeshBasicMaterial({ map: numTex, transparent: true }),
  )
  nosePlate.position.set(0, 0.55, 2.6 + noseLength * 0.5)
  nosePlate.rotation.x = -Math.PI / 2
  group.add(nosePlate)

  // --- Livery stripes (nose, sidepod, engine cover) ---
  const stripeMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(opts.colors.secondary) })
  // Nose top stripe
  const noseStripe = new THREE.Mesh(
    new THREE.BoxGeometry(noseWidth * 0.45, 0.02, noseLength * 0.8),
    stripeMat,
  )
  noseStripe.position.set(0, 0.55, 2.6 + noseLength / 2)
  group.add(noseStripe)
  // Sidepod stripes
  for (const dir of [-1, 1]) {
    const sideStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.05, sidepodLength * 0.9),
      stripeMat,
    )
    sideStripe.position.set(dir * (1.0 + era * 0.4 + 0.005), 0.5, -0.1)
    group.add(sideStripe)
    // Engine cover accent stripe
    const coverStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.04, 2.0),
      stripeMat,
    )
    coverStripe.position.set(0, 0.85 + (1 - era) * 0.25, -1.4)
    group.add(coverStripe)
  }

  // --- Diffuser (rear floor kick) ---
  if (era > 0.5) {
    const diffuser = new THREE.Mesh(
      new THREE.BoxGeometry(tubWidth * 0.85, 0.32, 0.4),
      WING_DARK_MAT,
    )
    diffuser.position.set(0, 0.25, -3.2)
    group.add(diffuser)
  }

  // --- T-Cam above driver (modern only) ---
  if (era > 0.7) {
    const tCam = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.18, 0.06),
      DARK_MAT,
    )
    tCam.position.set(0, 1.2, -0.2)
    group.add(tCam)
  }

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
      const wheelRPS = Math.abs(speed) / (Math.PI * tyreDiameter * 2)
      wheelRotation += wheelRPS * _dt
      for (const w of wheels) w.rotation.x = wheelRotation
      const targetPitch = -longitudinalG * 0.05
      const targetRoll = lateralG * 0.06
      pitch += (targetPitch - pitch) * 0.15
      roll += (targetRoll - roll) * 0.15
      tub.rotation.z = roll
      bodyPanel.rotation.z = roll * 0.95
      nose.rotation.z = roll * 0.6
      podL.rotation.z = roll * 0.8
      podR.rotation.z = roll * 0.8
      cover.rotation.z = roll * 0.4
      airbox.rotation.z = roll * 0.3
      fw.rotation.z = roll * 0.4
      rw.rotation.z = roll * 0.3
      nose.rotation.x = pitch * 0.4
      fw.rotation.x = -pitch * 0.5
      rw.rotation.x = -pitch * 0.6
      if (retired) group.visible = false
    },
    setCompound(c) {
      const mat = tyreMarkMat(c)
      for (const child of group.children) {
        const geo = (child as THREE.Mesh).geometry
        if (geo instanceof THREE.BoxGeometry && geo.parameters.width && Math.abs(geo.parameters.width - tyreWidth * 1.06) < 0.01) {
          ;(child as THREE.Mesh).material = mat
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
      numTex.dispose()
    },
  }
}
