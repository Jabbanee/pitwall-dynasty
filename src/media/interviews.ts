import type { Driver, RaceResult, Championship } from '../core/types'

/**
 * Interview system — triggers contextual post-race interviews on significant
 * events. Not a chat bot. Three to five possible responses per question,
 * each with a state effect.
 */

export type InterviewReason =
  | 'unexpected_win'
  | 'unexpected_loss'
  | 'driver_collision'
  | 'team_order_controversy'
  | 'refused_order'
  | 'broken_promise'
  | 'championship_battle'
  | 'publicly_unhappy'
  | 'teammate_dispute'

export interface InterviewOption {
  text: string
  effects: InterviewEffects
}

export interface InterviewEffects {
  morale?: number
  trust?: number
  mediaSentiment?: number
  reputation?: number
  teammateRelationship?: number
}

export interface Interview {
  reason: InterviewReason
  driverId: string
  teamId: string
  question: string
  options: InterviewOption[]
}

export const INTERVIEW_KICKER: Record<InterviewReason, string> = {
  unexpected_win: 'An unlikely winner — what happened out there?',
  unexpected_loss: 'A frustrating result today. How are you feeling?',
  driver_collision: 'You made contact with your teammate. What happened?',
  team_order_controversy: 'There are rumours about a team order in the closing laps. Can you comment?',
  refused_order: 'You were asked to hold position but didn\'t. Why?',
  broken_promise: 'Reports suggest the team didn\'t keep its promise to you. How do you respond?',
  championship_battle: 'You\'re right in the championship fight now. What\'s your mindset?',
  publicly_unhappy: 'You have been quoted as being unhappy. Are you still committed?',
  teammate_dispute: 'There appears to be tension between you and your teammate. Can you clarify?',
}

const INTERVIEW_TEMPLATES: Record<InterviewReason, { question: string; options: InterviewOption[] }> = {
  unexpected_win: {
    question: 'Nobody expected this result. How do you explain it?',
    options: [
      { text: 'Deflect credit to the team and stay humble.', effects: { morale: 4, trust: 3, mediaSentiment: 6 } },
      { text: 'Big statement: this is just the beginning.', effects: { mediaSentiment: 10, morale: 2 } },
      { text: 'Stay quiet — let the result speak.', effects: { trust: 4, mediaSentiment: 2 } },
    ],
  },
  unexpected_loss: {
    question: 'What went wrong today?',
    options: [
      { text: 'Take responsibility on the chin.', effects: { trust: 4, mediaSentiment: 3, morale: -2 } },
      { text: 'Blame the car/setup.', effects: { trust: -3, mediaSentiment: -2 } },
      { text: 'Praise the team, look forward.', effects: { morale: 3, trust: 2, mediaSentiment: 4 } },
    ],
  },
  driver_collision: {
    question: 'You and your teammate came together. Whose fault was it?',
    options: [
      { text: 'Apologise publicly.', effects: { teammateRelationship: 8, mediaSentiment: 4, trust: 1 } },
      { text: 'Defend yourself — racing incident.', effects: { teammateRelationship: -6, mediaSentiment: 1 } },
      { text: 'Refuse to blame anyone, including yourself.', effects: { mediaSentiment: -2, teammateRelationship: 2 } },
    ],
  },
  team_order_controversy: {
    question: 'Was there a team order that decided the result?',
    options: [
      { text: 'Confirm the team asked, confirm you obliged.', effects: { mediaSentiment: -2, trust: 3, teammateRelationship: -4 } },
      { text: 'Deflect: "we race as a team."', effects: { mediaSentiment: 3, trust: 1 } },
      { text: 'Push back — claim the team did nothing wrong but you earned it.', effects: { morale: 4, trust: 1, mediaSentiment: 1 } },
    ],
  },
  refused_order: {
    question: 'You were told to hold station but you didn\'t. Why?',
    options: [
      { text: 'Apologise and commit to following orders next time.', effects: { trust: 6, morale: -2, teammateRelationship: 4 } },
      { text: 'Stand by your decision: "I was faster."', effects: { trust: -8, morale: 4, mediaSentiment: 6, teammateRelationship: -10 } },
      { text: 'Try to split the difference diplomatically.', effects: { trust: 2, morale: 1, mediaSentiment: 2 } },
    ],
  },
  broken_promise: {
    question: 'Sources say a contract promise wasn\'t kept. Are you considering leaving?',
    options: [
      { text: 'Stay professional; you expect the team to make it right.', effects: { trust: 2, mediaSentiment: 4, morale: -1 } },
      { text: 'Issue a warning publicly.', effects: { mediaSentiment: 8, trust: -6, morale: -4 } },
      { text: 'Stay quiet but visibly upset.', effects: { morale: -2, trust: -1 } },
    ],
  },
  championship_battle: {
    question: 'You\'re in the championship fight. What are you thinking?',
    options: [
      { text: 'Take it race by race.', effects: { trust: 2, mediaSentiment: 3 } },
      { text: 'Make a bold prediction.', effects: { mediaSentiment: 8, morale: 2 } },
      { text: 'Acknowledge the challenge and the rival.', effects: { trust: 1, mediaSentiment: 4, reputation: 2 } },
    ],
  },
  publicly_unhappy: {
    question: 'You have been quoted as unhappy. Are you committed?',
    options: [
      { text: 'I am 100% committed to this team.', effects: { trust: 5, mediaSentiment: 3 } },
      { text: 'Things need to change for me to stay.', effects: { trust: -4, mediaSentiment: 6 } },
      { text: 'No comment.', effects: { trust: 1, mediaSentiment: -1 } },
    ],
  },
  teammate_dispute: {
    question: 'You and your teammate clearly aren\'t on the same page. Is the team unity at risk?',
    options: [
      { text: 'Squash it: we are professionals.', effects: { teammateRelationship: 6, trust: 2, mediaSentiment: 2 } },
      { text: 'Lean into it: competition brings out the best.', effects: { teammateRelationship: -3, mediaSentiment: 5, morale: 3 } },
      { text: 'Put the team under pressure: "we need to discuss it."', effects: { teammateRelationship: -2, trust: 1, mediaSentiment: 3 } },
    ],
  },
}

/**
 * Determine if an interview should be triggered after a race.
 * Returns the reason + driver + team, or null if no interview is warranted.
 */
export function detectInterviewTrigger(
  result: RaceResult,
  champ: Championship,
): { reason: InterviewReason; driverId: string; teamId: string } | null {
  // 1. Unexpected win: P1 from grid >= 6, AND this is a player team
  const winner = result.results.find((r) => r.finishPosition === 1 && r.classified)
  if (winner && winner.startPosition >= 6) {
    return { reason: 'unexpected_win', driverId: winner.driverId, teamId: winner.teamId }
  }
  // 2. Driver collision: search events for collision + same team
  for (const e of result.events) {
    if (e.type === 'collision' && e.teamId && e.data?.otherTeamId === e.teamId) {
      return { reason: 'driver_collision', driverId: e.driverId!, teamId: e.teamId }
    }
  }
  // 3. Teammate dispute: two cars from same team within 1 position of each other in points battle
  for (const team of champ.teams) {
    const rs = team.driverIds
      .map((id) => result.results.find((r) => r.driverId === id))
      .filter((r): r is NonNullable<typeof r> => !!r && r.classified)
      .sort((a, b) => a.finishPosition - b.finishPosition)
    if (rs.length === 2 && rs[1].finishPosition - rs[0].finishPosition <= 1) {
      // Skip if both are off the lead lap — that's not "dispute material"
      if (rs[0].finishPosition <= 8) {
        return { reason: 'teammate_dispute', driverId: rs[1].driverId, teamId: team.id }
      }
    }
  }
  // 4. Championship battle: player driver within 5 points of lead
  const playerTeamId = champ.playerTeamId
  if (playerTeamId) {
    // Sum points
    const total = new Map<string, number>()
    for (const r of champ.rounds) {
      if (!r.raceResult) continue
      for (const row of r.raceResult.results) {
        if (!row.classified) continue
        total.set(row.driverId, (total.get(row.driverId) ?? 0) + row.points)
      }
    }
    const sorted = [...total.entries()].sort((a, b) => b[1] - a[1])
    const topPts = sorted[0]?.[1] ?? 0
    for (const team of champ.teams) {
      for (const dId of team.driverIds) {
        if (Math.abs((total.get(dId) ?? 0) - topPts) <= 5 && (total.get(dId) ?? 0) > 0) {
          return { reason: 'championship_battle', driverId: dId, teamId: team.id }
        }
      }
    }
    void playerTeamId
  }
  return null
}

/** Build a full Interview for a given trigger. */
export function buildInterview(
  reason: InterviewReason,
  driverId: string,
  teamId: string,
): Interview {
  const tpl = INTERVIEW_TEMPLATES[reason]
  return {
    reason,
    driverId,
    teamId,
    question: tpl.question,
    options: tpl.options,
  }
}

export function interviewFor(reason: InterviewReason): { question: string; options: InterviewOption[] } {
  return INTERVIEW_TEMPLATES[reason]
}

export function kickerFor(reason: InterviewReason): string {
  return INTERVIEW_KICKER[reason]
}

export function driverDisplayName(d: Driver): string {
  return `${d.firstName[0]}. ${d.lastName}`
}
