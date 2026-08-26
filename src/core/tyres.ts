import type { TyreCompound, TyreCompoundId } from './types'

export const TYRES: Record<TyreCompoundId, TyreCompound> = {
  soft: {
    id: 'soft',
    name: 'Soft',
    color: '#e8443a',
    basePaceDelta: -1.1,
    warmupLaps: 0.5,
    idealWetness: 0,
    wetGrip: 0.55,
    degradationPerLap: 0.052,
    wearCliff: 0.82,
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    color: '#f2c744',
    basePaceDelta: -0.55,
    warmupLaps: 0.9,
    idealWetness: 0,
    wetGrip: 0.42,
    degradationPerLap: 0.034,
    wearCliff: 0.85,
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    color: '#dfe3e6',
    basePaceDelta: 0,
    warmupLaps: 1.4,
    idealWetness: 0,
    wetGrip: 0.3,
    degradationPerLap: 0.022,
    wearCliff: 0.88,
  },
  inter: {
    id: 'inter',
    name: 'Intermediate',
    color: '#3fa34d',
    basePaceDelta: 12, // placeholder on dry; real crossover computed vs wetness
    warmupLaps: 0.8,
    idealWetness: 0.45,
    wetGrip: 0.82,
    degradationPerLap: 0.03,
    wearCliff: 0.86,
  },
  wet: {
    id: 'wet',
    name: 'Full Wet',
    color: '#3568d4',
    basePaceDelta: 18,
    warmupLaps: 0.6,
    idealWetness: 0.85,
    wetGrip: 0.95,
    degradationPerLap: 0.026,
    wearCliff: 0.9,
  },
}

export const DRY_COMPOUNDS: TyreCompoundId[] = ['soft', 'medium', 'hard']
export const WET_COMPOUNDS: TyreCompoundId[] = ['inter', 'wet']

/**
 * Pace delta of a compound relative to a reference dry lap at a given track
 * wetness (0 dry .. 1 soaked). Crossover is gradual, not binary.
 */
export function tyreWetnessDelta(compound: TyreCompoundId, trackWetness: number): number {
  const t = TYRES[compound]
  if (trackWetness <= 0.02) {
    // Dry track: wets are hopeless, dries by base delta.
    return compound === 'inter' ? 9 : compound === 'wet' ? 16 : t.basePaceDelta
  }
  const grip = t.wetGrip
  const ideal = t.idealWetness
  // How well-suited this compound is to current wetness
  if (compound === 'inter' || compound === 'wet') {
    const suitability = 1 - Math.min(1, Math.abs(trackWetness - ideal) / Math.max(ideal, 0.25))
    return (1 - suitability * grip * (0.55 + 0.45 * trackWetness)) * 14 + t.basePaceDelta * 0.15
  }
  // Dry tyres lose grip as wetness grows — softest rubber holds up slightly better
  const dryBase = t.basePaceDelta
  const lossFactor = compound === 'soft' ? 10 : compound === 'medium' ? 11 : 12
  return dryBase + lossFactor * Math.pow(Math.max(0, trackWetness), 0.75)
}
