// Pitwall Dynasty — authored livery system.
//
// Each top-series team receives a stable procedural livery
// profile. The profile is data-driven, not recolour-only: each
// template draws stripes / blocks / nose accents in different
// positions and widths, so two teams with similar primary
// colours still read as different liveries.
//
// The livery is consumed by `car3d.applyLivery(visual, profile)`
// which draws secondary panels into the chassis procedurally.

import * as THREE from 'three'
import type { CarVisual } from './car3d'
import type { TeamColors } from '../../core/types'

export type LiveryTemplate =
  | 'CENTRE_STRIPE'
  | 'DIAGONAL_SWEEP'
  | 'NOSE_BAND'
  | 'SIDEPOD_BLOCK'
  | 'ENGINE_COVER_SWEEP'
  | 'TWO_TONE'
  | 'PINSTRIPE'
  | 'ASYMMETRIC_ACCENT'

export interface LiveryProfile {
  template: LiveryTemplate
  primary: TeamColors
  /** Secondary / accent palette used by the template. */
  secondary: TeamColors
  /** Authored team abbreviation shown on the engine cover. */
  abbreviation: string
  /** Authored short team name shown on the garage header. */
  shortName: string
  /** Optional sponsor header wordmark shown on the engine cover. */
  sponsor: string
}

// Stable template assignment per top-series team. The mapping
// is fixed so a team always uses the same livery in the
// presentation, and so the QA harness can verify that the
// livery system is deterministic.
const TEMPLATE_BY_TEAM_ID: Record<string, LiveryTemplate> = {
  'base.team.titan': 'DIAGONAL_SWEEP',
  'base.team.aquila': 'CENTRE_STRIPE',
  'base.team.boreal': 'NOSE_BAND',
  'base.team.meridian': 'SIDEPOD_BLOCK',
  'base.team.kestrel': 'ENGINE_COVER_SWEEP',
  'base.team.polaris': 'TWO_TONE',
  'base.team.sablefox': 'PINSTRIPE',
  'base.team.vanguard': 'ASYMMETRIC_ACCENT',
  'base.team.cobalt': 'DIAGONAL_SWEEP',
  'base.team.horizon': 'CENTRE_STRIPE',
}

const SPONSOR_BY_TEAM_ID: Record<string, string> = {
  'base.team.titan': 'FORGEMASTER',
  'base.team.aquila': 'AQUILA CORSE',
  'base.team.boreal': 'BOREAL GP',
  'base.team.meridian': 'MERIDIAN TECH',
  'base.team.kestrel': 'KESTREL AIR',
  'base.team.polaris': 'POLARIS WORKS',
  'base.team.sablefox': 'SABLEFOX RACING',
  'base.team.vanguard': 'VANGUARD APEX',
  'base.team.cobalt': 'COBALT LINE',
  'base.team.horizon': 'HORIZON GP',
}

const ABBR_BY_TEAM_ID: Record<string, string> = {
  'base.team.titan': 'TIT',
  'base.team.aquila': 'AQC',
  'base.team.boreal': 'BRL',
  'base.team.meridian': 'MER',
  'base.team.kestrel': 'KST',
  'base.team.polaris': 'POL',
  'base.team.sablefox': 'SBL',
  'base.team.vanguard': 'VGD',
  'base.team.cobalt': 'CBT',
  'base.team.horizon': 'HRZ',
}

/**
 * Build a stable LiveryProfile for a given team. The template is
 * fixed per team id so the system is deterministic; the colours
 * come directly from the team record, and the abbreviation /
 * sponsor / short-name are looked up.
 */
export function getLiveryProfile(team: {
  id: string
  name: string
  shortName: string
  colors: TeamColors
}): LiveryProfile {
  const template = TEMPLATE_BY_TEAM_ID[team.id] ?? 'CENTRE_STRIPE'
  const sponsor = SPONSOR_BY_TEAM_ID[team.id] ?? team.shortName.toUpperCase()
  const abbreviation = ABBR_BY_TEAM_ID[team.id] ?? team.shortName.slice(0, 3).toUpperCase()
  return {
    template,
    primary: team.colors,
    secondary: team.colors,
    abbreviation,
    sponsor,
    shortName: team.shortName,
  }
}

/**
 * Project-owned fictional sponsor atlas. Each entry returns a
 * project-owned CanvasTexture with a wordmark. The atlas is
 * cached per (teamId, sponsor) key so repeated applications
 * share the same texture.
 *
 * Logos are simple geometric wordmarks (no real brands). They
 * read as "fictional" on purpose.
 */
const SPONSOR_TEX_CACHE = new Map<string, THREE.Texture>()

export function getSponsorTexture(teamId: string, sponsor: string): THREE.Texture {
  const key = `${teamId}:${sponsor}`
  const cached = SPONSOR_TEX_CACHE.get(key)
  if (cached) return cached
  const tex = makeSponsorWordmark(sponsor, key)
  SPONSOR_TEX_CACHE.set(key, tex)
  return tex
}

function makeSponsorWordmark(wordmark: string, key: string): THREE.Texture {
  if (typeof document === 'undefined') {
    const ph = new THREE.DataTexture(new Uint8Array([0xee, 0xee, 0xee, 0xff]), 1, 1)
    ph.needsUpdate = true
    return ph
  }
  const W = 256
  const H = 64
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f4f4f4'
  ctx.fillRect(0, 0, W, H)
  // Subtle background stripe pattern so the wordmark reads as a
  // printed panel, not a flat label.
  ctx.fillStyle = '#1c2230'
  for (let i = 0; i < W; i += 32) ctx.fillRect(i, 0, 2, H)
  ctx.fillStyle = '#1c2230'
  ctx.font = 'bold 30px Rajdhani, Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(wordmark.slice(0, 14), W / 2, H / 2)
  // Small separator / key marker
  ctx.fillStyle = '#888c95'
  ctx.font = '9px JetBrains Mono, monospace'
  ctx.textAlign = 'right'
  ctx.fillText(key.slice(0, 6), W - 4, H - 6)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * Apply a livery profile to a CarVisual. The profile is drawn
 * procedurally into the chassis: stripe / block / nose panels
 * are added as additional meshes parented to the existing car
 * group. Existing colour materials are reused (or replaced) where
 * the profile mandates a secondary colour block.
 */
export function applyLivery(visual: CarVisual, profile: LiveryProfile): void {
  // The current car3d design uses solid-coloured body / accent
  // materials. We add a small set of stripe / block panels as
  // children of the visual group. The panels are cheap
  // BoxGeometry, so the additional draw-call cost is bounded.
  const group = visual.group
  const primary = new THREE.Color(profile.primary.primary)
  const secondary = new THREE.Color(profile.primary.secondary)
  // Sponsor header on the engine cover.
  addSponsorHeader(group, profile)
  switch (profile.template) {
    case 'CENTRE_STRIPE':
      addCentreStripe(group, secondary)
      break
    case 'DIAGONAL_SWEEP':
      addDiagonalSweep(group, secondary)
      break
    case 'NOSE_BAND':
      addNoseBand(group, secondary)
      break
    case 'SIDEPOD_BLOCK':
      addSidepodBlock(group, secondary)
      break
    case 'ENGINE_COVER_SWEEP':
      addEngineCoverSweep(group, secondary)
      break
    case 'TWO_TONE':
      addTwoTone(group, primary, secondary)
      break
    case 'PINSTRIPE':
      addPinstripe(group, secondary)
      break
    case 'ASYMMETRIC_ACCENT':
      addAsymmetricAccent(group, primary, secondary)
      break
  }
  // The team abbreviation is always painted on the engine cover
  // so the player can read it at any trackside camera.
  addAbbreviation(group, profile.abbreviation)
  void primary
}

function addSponsorHeader(group: THREE.Group, profile: LiveryProfile): void {
  const tex = getSponsorTexture(profile.shortName, profile.sponsor)
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  const header = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.32), mat)
  header.position.set(0, 0.78, -1.5)
  header.rotation.y = Math.PI
  group.add(header)
}

function addAbbreviation(group: THREE.Group, abbr: string): void {
  if (typeof document === 'undefined') return
  const W = 128
  const H = 64
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#101418'
  ctx.font = 'bold 36px Rajdhani, Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(abbr, W / 2, H / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  // Place a smaller abbreviation panel on each sidepod, visible
  // from the broadcast side.
  for (const dir of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), mat)
    panel.position.set(dir * 0.95, 0.55, -0.4)
    panel.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2
    group.add(panel)
  }
}

function addStripeMat(color: THREE.Color): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color })
}

function addCentreStripe(group: THREE.Group, color: THREE.Color): void {
  const m = addStripeMat(color)
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 3.6), m)
  s.position.set(0, 0.62, 0.2)
  group.add(s)
}

function addDiagonalSweep(group: THREE.Group, color: THREE.Color): void {
  const m = addStripeMat(color)
  const sweep = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 4.6), m)
  sweep.position.set(0, 0.6, -0.1)
  sweep.rotation.x = -0.05
  group.add(sweep)
}

function addNoseBand(group: THREE.Group, color: THREE.Color): void {
  const m = addStripeMat(color)
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 1.4), m)
  band.position.set(0, 0.5, 2.0)
  group.add(band)
}

function addSidepodBlock(group: THREE.Group, color: THREE.Color): void {
  const m = addStripeMat(color)
  for (const dir of [-1, 1]) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 1.0), m)
    block.position.set(dir * 1.1, 0.42, -0.4)
    group.add(block)
  }
}

function addEngineCoverSweep(group: THREE.Group, color: THREE.Color): void {
  const m = addStripeMat(color)
  const sweep = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 2.4), m)
  sweep.position.set(0, 0.95, -1.4)
  group.add(sweep)
}

function addTwoTone(group: THREE.Group, primary: THREE.Color, secondary: THREE.Color): void {
  const m1 = addStripeMat(primary)
  const m2 = addStripeMat(secondary)
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 4), m1)
  top.position.set(0, 0.78, 0)
  group.add(top)
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 4), m2)
  lower.position.set(0, 0.32, 0)
  group.add(lower)
}

function addPinstripe(group: THREE.Group, color: THREE.Color): void {
  const m = addStripeMat(color)
  for (const dir of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 4), m)
    s.position.set(dir * 0.42, 0.62, 0)
    group.add(s)
  }
}

function addAsymmetricAccent(group: THREE.Group, primary: THREE.Color, secondary: THREE.Color): void {
  const m1 = addStripeMat(primary)
  const m2 = addStripeMat(secondary)
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 1.2), m1)
  left.position.set(-0.45, 0.5, 0.4)
  group.add(left)
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 1.2), m2)
  right.position.set(0.45, 0.5, 0.4)
  group.add(right)
}
