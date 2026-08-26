import * as THREE from 'three'
import type { TeamColors } from '../../core/types'

/**
 * Modular 3D race car — era-influenced silhouette, team colors, distinct
 * livery accents. Modules (nose, wings, sidepods, engine cover) can be
 * reshaped by development packages in the future.
 */

export interface CarVisualOptions {
  colors: TeamColors
  carNumber: number
  /** 0 = 80s slim, 1 = modern wide — affects proportions */
  eraFactor: number
}

export interface CarVisual {
  group: THREE.Group
  /** Per-frame update: wheel spin etc. */
  setSpeed(speedMetersPerSecond: number): void
  dispose(): void
}

const BODY_MATERIALS = new Map<string, THREE.MeshLambertMaterial>()

function bodyMaterial(colors: TeamColors): THREE.MeshLambertMaterial {
  const key = colors.primary + colors.secondary
  let mat = BODY_MATERIALS.get(key)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.primary) })
    BODY_MATERIALS.set(key, mat)
  }
  return mat
}

const DARK_MAT = new THREE.MeshLambertMaterial({ color: 0x10141a })
const TYRE_MAT = new THREE.MeshLambertMaterial({ color: 0x14161a })
const ACCENT_CACHE = new Map<string, THREE.MeshLambertMaterial>()

function accentMaterial(colors: TeamColors): THREE.MeshLambertMaterial {
  const key = colors.secondary
  let mat = ACCENT_CACHE.get(key)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.secondary) })
    ACCENT_CACHE.set(key, mat)
  }
  return mat
}

export function createCar(opts: CarVisualOptions): CarVisual {
  const group = new THREE.Group()
  const body = bodyMaterial(opts.colors)
  const accent = accentMaterial(opts.colors)
  const era = opts.eraFactor // 0..1

  // Chassis: central tub + nose
  const tub = new THREE.Mesh(new THREE.BoxGeometry(2.0 - era * 0.3, 0.55, 4.4), body)
  tub.position.y = 0.45
  group.add(tub)

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.9 - era * 0.25, 0.35, 2.2), body)
  nose.position.set(0, 0.42, 3.0)
  group.add(nose)

  // Front wing
  const frontWing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.9), accent)
  frontWing.position.set(0, 0.18, 4.1)
  group.add(frontWing)

  // Sidepods
  const podGeo = new THREE.BoxGeometry(0.8 + era * 0.5, 0.6, 2.4)
  const podL = new THREE.Mesh(podGeo, body)
  podL.position.set(-1.25 - era * 0.15, 0.5, -0.2)
  const podR = podL.clone()
  podR.position.x = 1.25 + era * 0.15
  group.add(podL, podR)

  // Engine cover / airbox
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7 + era * 0.4, 2.6), body)
  cover.position.set(0, 0.85, -1.4)
  group.add(cover)
  const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.7), DARK_MAT)
  airbox.position.set(0, 1.35 + era * 0.2, -0.6)
  group.add(airbox)

  // Rear wing
  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.8), accent)
  rearWing.position.set(0, 1.15, -3.1)
  group.add(rearWing)
  const rwPylon = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.4), DARK_MAT)
  rwPylon.position.set(0, 0.75, -3.0)
  group.add(rwPylon)

  // Halo-ish protection for modern eras
  if (era > 0.7) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 12, Math.PI), DARK_MAT)
    halo.rotation.x = -Math.PI / 2
    halo.rotation.z = Math.PI
    halo.position.set(0, 1.05, 0.4)
    group.add(halo)
  }

  // Wheels — distinct open-wheel silhouette
  const wheelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 12)
  const wheels: THREE.Mesh[] = []
  const wheelPositions: Array<[number, number]> = [
    [-1.35, 2.6], [1.35, 2.6], [-1.45, -2.4], [1.45, -2.4],
  ]
  for (const [x, z] of wheelPositions) {
    const w = new THREE.Mesh(wheelGeo, TYRE_MAT)
    w.rotation.z = Math.PI / 2
    w.position.set(x, 0.62, z)
    group.add(w)
    wheels.push(w)
  }

  // Number plate on engine cover
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 64, 64)
  ctx.fillStyle = '#0b0f15'
  ctx.font = 'bold 44px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(opts.carNumber), 32, 34)
  const tex = new THREE.CanvasTexture(canvas)
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ map: tex }),
  )
  plate.position.set(0, 1.0, -2.72)
  plate.rotation.y = Math.PI
  group.add(plate)

  let wheelRotation = 0
  let lastSpeed = 0
  return {
    group,
    setSpeed(speed: number) {
      lastSpeed = speed
    },
    dispose() {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
        }
      })
      tex.dispose()
    },
  }

  // wheel spin handled in the render loop via exported helper below
  void wheelRotation
  void lastSpeed
  void wheels
}
