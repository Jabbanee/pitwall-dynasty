import { createRng } from '../core/rng'
import type { Championship, RoundState, Team } from '../core/types'
import { staffSkillWithPool } from './engine'

/**
 * Practice System — meaningful, fast, non-busywork.
 *
 * Each team picks ONE of two plans per round:
 *   - MANUAL PRACTICE PLAN: choose 1..3 of {long-run, qualifying-sim, race-sim}
 *     with explicit effort; riskier choices give larger bonuses but can be
 *     derailed by reliability, rain or an incident.
 *   - QUICK SIM: one-click low-effort plan; small bonus.
 *
 * Output: a `practiceBonus` per team — a number in roughly [-0.05, +0.12]
 * that feeds into setup confidence, tyre warmup at race start and the
 * driver form band. The bonus is consumed by the simulator at race time.
 */

export type PracticeFocus = 'longRun' | 'qualiSim' | 'raceSim'

export interface PracticePlan {
  teamId: string
  mode: 'manual' | 'quickSim'
  focuses: PracticeFocus[]
  effort: 'low' | 'standard' | 'high'
}

export const PRACTICE_FOCUS_LABELS: Record<PracticeFocus, { name: string; desc: string }> = {
  longRun: { name: 'Long-Run Stints', desc: 'Race-pace simulation, tyre wear data, fuel mapping' },
  qualiSim: { name: 'Qualifying Simulation', desc: 'Single-lap pace, track evolution, grip' },
  raceSim: { name: 'Race Simulation', desc: 'Full-race virtual run, pit windows, strategy' },
}

export function defaultQuickSimPlan(teamId: string): PracticePlan {
  return { teamId, mode: 'quickSim', focuses: ['longRun'], effort: 'low' }
}

export function defaultManualPlan(teamId: string): PracticePlan {
  return { teamId, mode: 'manual', focuses: ['qualiSim', 'longRun'], effort: 'standard' }
}

/**
 * Run a team's practice plan and return the setup-confidence bonus for
 * this round. Deterministic given the championship seed and round index.
 */
export function runPractice(
  champ: Championship,
  team: Team,
  round: RoundState,
  plan: PracticePlan,
): { bonus: number; summary: string; events: string[] } {
  const rng = createRng((champ.rngSeed ^ hashStr(team.id) ^ (round.index * 7919)) >>> 0)
  const circuit = champ.circuits.find((c) => c.id === round.circuitId)
  const rainRisk = circuit?.characteristics.rainProbability ?? 0.2
  const reliability = team.carPerformance.reliability
  const engineerSkill = staffSkillWithPool(team, 'raceEngineer', champ.staffPool)
  const strategistSkill = staffSkillWithPool(team, 'strategist', champ.staffPool)

  let bonus = 0
  const events: string[] = []

  // Base effort curve
  if (plan.mode === 'quickSim') {
    bonus += 0.02 + (strategistSkill - 50) * 0.0004
    events.push('Quick sim complete — limited track data, safe choice.')
  } else {
    const effMap = { low: 0.03, standard: 0.06, high: 0.085 }
    bonus += effMap[plan.effort]
    if (plan.focuses.length >= 2) bonus += 0.015
    if (plan.focuses.length >= 3) bonus += 0.01
    bonus += (engineerSkill - 50) * 0.0006
    events.push(`${plan.effort.toUpperCase()} effort across ${plan.focuses.length} focus area(s).`)
  }

  // Rain gamble: focusing on race-sim in dry track wastes time; on wet it
  // pays off. Inverting the focus with the forecast is rewarded.
  const focusOnTrack = plan.focuses.includes('raceSim') && rainRisk > 0.35
  const focusOnTrackBonus = focusOnTrack ? 0.025 : 0
  bonus += focusOnTrackBonus
  if (focusOnTrackBonus > 0) events.push('Race-simulation focus paid off — wet forecast verified.')

  // Random session events: small accidents cost effort, great laps reward.
  const sessionRoll = rng.chance(0.18) ? rng.pick(['accident', 'perfect-lap', 'mechanical', 'no-event']) : 'no-event'
  if (sessionRoll === 'accident') {
    const cost = rng.range(0.01, 0.04)
    bonus -= cost
    events.push(`Minor off in practice — lost ${(cost * 100).toFixed(1)}s of session time.`)
  } else if (sessionRoll === 'perfect-lap') {
    const gain = rng.range(0.015, 0.04)
    bonus += gain
    events.push(`${plan.focuses[0]?.toUpperCase() ?? 'PRACTICE'} perfect-lap — confidence boost.`)
  } else if (sessionRoll === 'mechanical') {
    if (rng.chance(Math.max(0, (60 - reliability) / 100))) {
      const cost = rng.range(0.02, 0.06)
      bonus -= cost
      events.push(`Component issue in practice — replaced. Cost: ${(cost * 100).toFixed(1)}s.`)
    }
  }

  // Clamp — meaningful but bounded
  bonus = Math.max(-0.05, Math.min(0.12, bonus))
  const summary =
    bonus >= 0.07 ? 'Excellent preparation.' :
    bonus >= 0.04 ? 'Solid preparation.' :
    bonus >= 0.0 ? 'Routine preparation.' :
    'Disrupted preparation — chasing the setup all weekend.'

  // Store on the round
  if (!round.practiceBonus) round.practiceBonus = {}
  round.practiceBonus[team.id] = bonus
  return { bonus, summary, events }
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
