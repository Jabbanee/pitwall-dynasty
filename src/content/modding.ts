import { fnv1a } from '../core/rng'
import type { Circuit, Driver, Sponsor, StaffMember, Team } from '../core/types'

/**
 * Modding — first-class, manifest-based. Stable IDs everywhere; names are
 * display-only. A mod can add or replace teams, drivers, circuits, sponsors,
 * staff and rules. Multiplayer locks: game version + sim version + rules hash
 * + sorted mod hashes.
 */

export interface ModManifest {
  id: string
  name: string
  version: string
  gameVersion: string
  author?: string
  description?: string
  replaces?: string[]
  content?: {
    circuits?: Circuit[]
    drivers?: Driver[]
    teams?: Team[]
    sponsors?: Sponsor[]
    staff?: StaffMember[]
  }
}

export interface ModValidationIssue {
  severity: 'error' | 'warning'
  message: string
}

export interface ValidationResult {
  valid: boolean
  issues: ModValidationIssue[]
}

export function validateMod(mod: unknown): ValidationResult {
  const issues: ModValidationIssue[] = []
  const m = mod as ModManifest | null

  if (!m || typeof m !== 'object') return { valid: false, issues: [{ severity: 'error', message: 'Mod root is not an object.' }] }
  if (!m.id || typeof m.id !== 'string') issues.push({ severity: 'error', message: 'Missing required field "id".' })
  else if (/\s/.test(m.id)) issues.push({ severity: 'error', message: `Mod id "${m.id}" contains whitespace — ids must be stable slugs.` })
  if (!m.name) issues.push({ severity: 'error', message: 'Missing required field "name".' })
  if (!m.version) issues.push({ severity: 'warning', message: 'No version specified; defaulting to 0.0.0.' })
  if (m.gameVersion && !/^1\./.test(m.gameVersion)) {
    issues.push({ severity: 'error', message: `gameVersion "${m.gameVersion}" is not compatible with this build.` })
  }

  // Duplicate ID detection across content arrays
  const seenIds = new Set<string>()
  const checkId = (kind: string, item: { id?: string }) => {
    if (!item?.id) {
      issues.push({ severity: 'error', message: `${kind} entry missing "id".` })
      return
    }
    if (seenIds.has(item.id)) {
      issues.push({ severity: 'error', message: `Duplicate ${kind} id "${item.id}".` })
    }
    seenIds.add(item.id)
  }
  m.content?.circuits?.forEach((c) => checkId('circuit', c))
  m.content?.drivers?.forEach((d) => checkId('driver', d))
  m.content?.teams?.forEach((t) => checkId('team', t))

  // Missing references
  const driverIds = new Set(m.content?.drivers?.map((d) => d.id))
  m.content?.teams?.forEach((t) => {
    for (const d of t.driverIds ?? []) {
      if (!driverIds.has(d)) {
        issues.push({ severity: 'error', message: `Team "${t.id}" references unknown driver "${d}".` })
      }
    }
  })

  // Value sanity
  m.content?.circuits?.forEach((c) => {
    if (!c.characteristics?.laps || c.characteristics.laps < 5 || c.characteristics.laps > 100) {
      issues.push({ severity: 'error', message: `Circuit "${c.id}" has invalid laps (${c.characteristics?.laps}).` })
    }
  })

  return { valid: !issues.some((i) => i.severity === 'error'), issues }
}

/** Sample/template mod demonstrating the format. */
export function sampleMod(): ModManifest {
  return {
    id: 'example.championship',
    name: 'Example Championship Pack',
    version: '1.0.0',
    gameVersion: '1.0',
    author: 'Pitwall Dynasty',
    description: 'Template mod showing the manifest format. Adds one circuit and two free-agent drivers.',
    content: {
      circuits: [
        {
          id: 'example.circuit.lakeside',
          name: 'Lakeside Park',
          country: 'Finland',
          characteristics: {
            lengthKm: 4.7, laps: 24, lowSpeed: 45, mediumSpeed: 55, highSpeed: 40,
            straightLine: 60, overtakingDifficulty: 50, tyreStress: 55, brakingStress: 50,
            rainProbability: 0.3, pitLossSeconds: 21, safetyCarProbability: 0.15, trackEvolution: 0.6,
          },
          sectors: [
            { name: 'S1', speedType: 'medium', overtakingChance: 0.35 },
            { name: 'S2', speedType: 'high', overtakingChance: 0.25 },
            { name: 'S3', speedType: 'low', overtakingChance: 0.4 },
          ],
        },
      ],
      drivers: [
        {
          id: 'example.driver.00001',
          firstName: 'Aino',
          lastName: 'Virtanen',
          nationality: 'FIN',
          age: 22,
          visible: { pace: 68, qualifying: 70, racecraft: 63, overtaking: 66, defending: 60, consistency: 64, wetSkill: 79, tyreManagement: 65, feedback: 67 },
          hidden: { potential: 90, pressureResistance: 62, aggression: 66, adaptability: 72, loyalty: 58, ego: 44, confidenceSensitivity: 60, developmentRate: 80, declineRate: 42 },
          dynamic: { morale: 65, confidence: 58, form: 0, fatigue: 0, seasonsWithTeam: 0 },
          salaryDemandBase: 1600,
          history: [],
        },
      ],
    },
  }
}

/** Compute a hash for a mod's content so multiplayer participants can compare. */
export function modHash(mod: ModManifest): string {
  return fnv1a(JSON.stringify(sortDeep(mod.content ?? {})))
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k])
    return out
  }
  return v
}
