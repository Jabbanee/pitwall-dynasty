/**
 * Regulations Engine — data-driven, era-aware sporting rules.
 * The UI queries this module; years are never hardcoded in screens.
 */

export type TeamOrderLegality = 'allowed' | 'codedOnly' | 'prohibited'

export interface Regulations {
  /** Fictional year the ruleset represents. */
  year: number
  eraName: string
  teamOrders: TeamOrderLegality
  /** Direct position-swap orders (swap/priority) specifically. */
  positionSwapOrders: TeamOrderLegality
  qualifyingFormat: 'singleLap' | 'multiLap' | 'session'
  refuelling: boolean
  pointsSystem: number[]
  tyreCompoundCount: number
  componentLimits: number // per-season part designs per slot
  costCap: boolean
  developmentRestrictions: number // 0 none .. 3 heavy
  safetyCarRules: 'standard' | 'vscOnly'
}

interface EraDefinition {
  startYear: number
  endYear: number
  eraName: string
  base: Omit<Regulations, 'year' | 'eraName'>
}

const ERAS: EraDefinition[] = [
  {
    startYear: 1980, endYear: 1988, eraName: 'Turbo Pioneer Era',
    base: {
      teamOrders: 'allowed', positionSwapOrders: 'allowed',
      qualifyingFormat: 'singleLap', refuelling: true,
      pointsSystem: [9, 6, 4, 3, 2, 1], tyreCompoundCount: 2,
      componentLimits: 99, costCap: false, developmentRestrictions: 0, safetyCarRules: 'standard',
    },
  },
  {
    startYear: 1989, endYear: 1994, eraName: 'Early Electronic Era',
    base: {
      teamOrders: 'allowed', positionSwapOrders: 'allowed',
      qualifyingFormat: 'singleLap', refuelling: false,
      pointsSystem: [9, 6, 4, 3, 2, 1], tyreCompoundCount: 2,
      componentLimits: 99, costCap: false, developmentRestrictions: 0, safetyCarRules: 'standard',
    },
  },
  {
    startYear: 1995, endYear: 2002, eraName: 'V10 Classic Era',
    base: {
      teamOrders: 'allowed', positionSwapOrders: 'allowed',
      qualifyingFormat: 'singleLap', refuelling: true,
      pointsSystem: [10, 6, 4, 3, 2, 1], tyreCompoundCount: 2,
      componentLimits: 60, costCap: false, developmentRestrictions: 1, safetyCarRules: 'standard',
    },
  },
  {
    // Historical shadow of the 2003–2010 team-order prohibition
    startYear: 2003, endYear: 2010, eraName: 'Order Prohibition Era',
    base: {
      teamOrders: 'codedOnly', positionSwapOrders: 'prohibited',
      qualifyingFormat: 'multiLap', refuelling: true,
      pointsSystem: [10, 8, 6, 5, 4, 3, 2, 1], tyreCompoundCount: 2,
      componentLimits: 40, costCap: false, developmentRestrictions: 1, safetyCarRules: 'standard',
    },
  },
  {
    startYear: 2011, endYear: 2013, eraName: 'Return of Orders Era',
    base: {
      teamOrders: 'allowed', positionSwapOrders: 'allowed',
      qualifyingFormat: 'session', refuelling: false,
      pointsSystem: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], tyreCompoundCount: 3,
      componentLimits: 40, costCap: false, developmentRestrictions: 2, safetyCarRules: 'standard',
    },
  },
  {
    startYear: 2014, endYear: 2021, eraName: 'Hybrid Power Era',
    base: {
      teamOrders: 'allowed', positionSwapOrders: 'allowed',
      qualifyingFormat: 'session', refuelling: false,
      pointsSystem: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], tyreCompoundCount: 3,
      componentLimits: 30, costCap: false, developmentRestrictions: 2, safetyCarRules: 'vscOnly',
    },
  },
  {
    startYear: 2022, endYear: 2035, eraName: 'Ground Effect Era',
    base: {
      teamOrders: 'allowed', positionSwapOrders: 'allowed',
      qualifyingFormat: 'session', refuelling: false,
      pointsSystem: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], tyreCompoundCount: 3,
      componentLimits: 24, costCap: true, developmentRestrictions: 2, safetyCarRules: 'vscOnly',
    },
  },
]

export function regulationsForYear(year: number): Regulations {
  const era = ERAS.find((e) => year >= e.startYear && year <= e.endYear) ?? ERAS[ERAS.length - 1]
  return { year, eraName: era.eraName, ...structuredClone(era.base) }
}

export const START_YEARS = ERAS.map((e) => ({ year: e.startYear, eraName: e.eraName }))

/** Coded team orders (prohibition eras): risk model for "strategic suggestions". */
export interface CodedOrderRisk {
  stewardScrutiny: number // 0..1 probability of investigation
  fineRisk: number // thousands if caught
  sportingPenaltyRisk: number // 0..1 probability of points penalty if caught
  mediaRisk: number // 0..1
}

export function codedOrderRisk(regs: Regulations, teamReputation: number, previousIncidences: number): CodedOrderRisk {
  if (regs.teamOrders !== 'codedOnly') {
    return { stewardScrutiny: 0, fineRisk: 0, sportingPenaltyRisk: 0, mediaRisk: 0 }
  }
  const base = 0.18
  const repFactor = teamReputation / 300 // big teams draw more scrutiny
  const repeat = previousIncidences * 0.12
  const scrutiny = Math.min(0.85, base + repFactor + repeat)
  return {
    stewardScrutiny: scrutiny,
    fineRisk: Math.round(250 + previousIncidences * 150),
    sportingPenaltyRisk: Math.min(0.5, scrutiny * 0.5),
    mediaRisk: Math.min(0.9, scrutiny + 0.1),
  }
}

/** Resolve a coded order attempt. Deterministic via passed rng value [0,1). */
export function resolveCodedOrder(
  risk: CodedOrderRisk,
  roll: number,
): { investigated: boolean; penalized: boolean; fine: number; mediaStorm: boolean } {
  const investigated = roll < risk.stewardScrutiny
  const penalized = investigated && roll < risk.stewardScrutiny * risk.sportingPenaltyRisk * 2
  const mediaStorm = roll < risk.mediaRisk
  return {
    investigated,
    penalized,
    fine: investigated ? risk.fineRisk : 0,
    mediaStorm,
  }
}

/** UI availability helper: can this team order be issued at all? */
export function teamOrderAvailability(regs: Regulations): {
  directOrders: 'AVAILABLE' | 'PROHIBITED'
  codedOrders: 'AVAILABLE' | 'RISKY' | 'PROHIBITED'
  explanation: string
} {
  switch (regs.teamOrders) {
    case 'allowed':
      return { directOrders: 'AVAILABLE', codedOrders: 'AVAILABLE', explanation: 'Team orders are permitted under current sporting regulations.' }
    case 'codedOnly':
      return {
        directOrders: 'PROHIBITED',
        codedOrders: 'RISKY',
        explanation: `Direct position-swap orders are prohibited by the ${regs.year} sporting regulations. Coded "strategic suggestions" carry steward, penalty and media risk.`,
      }
    default:
      return { directOrders: 'PROHIBITED', codedOrders: 'PROHIBITED', explanation: 'Team orders are banned.' }
  }
}
