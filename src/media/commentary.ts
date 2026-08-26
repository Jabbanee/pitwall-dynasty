import type { RaceEvent, Driver } from '../core/types'

/**
 * Commentary engine — event-driven, two roles:
 *  LEAD COMMENTATOR: immediate action call-outs
 *  ANALYST: strategic/contextual insight
 * Template-based generation; no external APIs. Deterministic given events.
 */

export interface CommentaryLine {
  t: number
  role: 'lead' | 'analyst'
  text: string
}

const EXCITEMENT: Record<string, string[]> = {
  overtake: [
    '{A} gets past {B} for P{POS}!',
    '{A} sweeps around the outside of {B}!',
    'Brilliant move — {A} takes {B}!',
    '{A} makes it stick into the corner — {B} loses the place!',
  ],
  retirement: [
    '{A} is out! {REASON} strikes again.',
    'Disaster for {A} — the car rolls to a stop. {REASON}.',
    '{A} climbs out — {REASON} ends the race.',
  ],
  safetyCar: ['Safety Car deployed — the field bunches up!', 'Neutralisation! Safety Car is out.'],
  virtualSafetyCar: ['Virtual Safety Car — everyone slows.'],
  leadChange: ['We have a new race leader — {A}!'],
  fastestLap: ['Fastest lap of the race from {A} — the pace is real.'],
  weatherChange: ['Rain is falling! This changes everything.', 'The weather is turning — strategy calls coming in now.'],
  spin: ['{A} spins! Keeps it going, but that was close.', 'Big moment for {A} — a full spin but rejoins.'],
  pitStop: ['{A} pits — {FROM} off, {TO} on.'],
  finish: ['{A} takes the chequered flag!'],
}

const ANALYST_LINES: Record<string, string[]> = {
  overtake: [
    'That could be crucial in the championship battle.',
    'Tyre advantage made the difference there — {B} was struggling on worn rubber.',
  ],
  safetyCar: ['Perfect timing for the leaders to consider fresh tyres — a cheap stop under the Safety Car.'],
  weatherChange: ['The teams that gamble on rain tyres early will be rewarded — or punished.'],
  pitStop: ['Undercut window open — the in-lap pace will decide this one.'],
}

export function generateCommentary(
  events: RaceEvent[],
  drivers: Record<string, Driver>,
  context: { leaderDriverId?: string; totalLaps: number },
): CommentaryLine[] {
  const out: CommentaryLine[] = []
  let lastOvertakeT = -999
  for (const ev of events) {
    const nameA = ev.driverId ? lastName(drivers, ev.driverId) : ''
    const defendedBy = ev.data?.defendedBy as string | undefined
    const nameB = defendedBy ? lastName(drivers, defendedBy) : ''
    const templates = EXCITEMENT[ev.type]
    if (templates) {
      // Rate-limit overtake excitement
      if (ev.type === 'overtake') {
        if (ev.t - lastOvertakeT < 8) continue
        lastOvertakeT = ev.t
      }
      const tpl = templates[hashIdx(ev.t + ev.detail.length, templates.length)]
      const text = tpl
        .replace('{A}', nameA)
        .replace('{B}', nameB)
        .replace('{POS}', String(ev.data?.newPosition ?? ''))
        .replace('{REASON}', ev.detail.split('—')[1]?.trim() ?? 'Mechanical trouble')
        .replace('{FROM}', ev.detail.split('— ')[1]?.split(' → ')[0] ?? '')
        .replace('{TO}', ev.detail.split(' → ')[1] ?? '')
      out.push({ t: ev.t, role: 'lead', text })
      // Analyst follows big moments
      const analyst = ANALYST_LINES[ev.type]
      if (analyst && hashIdx(ev.t * 7 + 3, analyst.length) === 0) {
        const atpl = analyst[hashIdx(ev.t, analyst.length)]
        out.push({
          t: ev.t + 2,
          role: 'analyst',
          text: atpl.replace('{A}', nameA).replace('{B}', nameB),
        })
      }
    }
    // Final-lap drama
    if (ev.type === 'lapComplete' && ev.data?.lap === context.totalLaps - 1) {
      out.push({ t: ev.t, role: 'lead', text: 'Final lap — the crowd is on its feet!' })
    }
  }
  return out
}

function lastName(drivers: Record<string, Driver>, id: string): string {
  return drivers[id]?.lastName ?? id
}

function hashIdx(input: number, mod: number): number {
  let h = Math.floor(Math.abs(input) * 1000) + 7
  h = (h * 1103515245 + 12345) >>> 0
  return (h >>> 16) % mod
}

// ---------------------------------------------------------------------------
// THE PADDOCK POST — post-race publication
// ---------------------------------------------------------------------------

export interface PostStory {
  kind: 'lead' | 'secondary' | 'quote' | 'analysis' | 'rumour' | 'transfer'
  headline: string
  body: string
}

export function buildPaddockPost(input: {
  circuitName: string
  results: Array<{ driverId: string; teamId: string; finishPosition: number; classified: boolean; fastestLap?: boolean; dnfReason?: string }>
  drivers: Record<string, Driver>
  teamNameOf: (teamId: string) => string
  season: number
  round: number
}): { lead: PostStory; stories: PostStory[] } {
  const { results, drivers, teamNameOf, circuitName } = input
  const winner = results.find((r) => r.classified && r.finishPosition === 1)
  const second = results.find((r) => r.finishPosition === 2)
  const third = results.find((r) => r.finishPosition === 3)
  const wName = winner ? fullName(drivers, winner.driverId) : 'Unknown'
  const stories: PostStory[] = []

  const lead: PostStory = {
    kind: 'lead',
    headline: `${wName} conquers ${circuitName}`,
    body: winner
      ? `${wName} (${teamNameOf(winner.teamId)}) took victory at the ${circuitName} Grand Prix` +
        (second ? `, with ${fullName(drivers, second.driverId)} second` : '') +
        (third ? ` and ${fullName(drivers, third.driverId)} completing the podium.` : '.')
      : 'A chaotic race produced an unexpected result.',
  }

  // Surprise performance
  const surprise = results.filter((r) => r.classified && r.finishPosition >= 4 && r.finishPosition <= 8)[0]
  if (surprise) {
    stories.push({
      kind: 'secondary',
      headline: `${fullName(drivers, surprise.driverId)} shines with P${surprise.finishPosition}`,
      body: `Few predicted ${fullName(drivers, surprise.driverId)} would fight this far forward. The ${teamNameOf(surprise.teamId)} strategists earned their pay today.`,
    })
  }

  // Fastest lap
  const fl = results.find((r) => r.fastestLap)
  if (fl) {
    stories.push({
      kind: 'analysis',
      headline: `Fastest lap: ${fullName(drivers, fl.driverId)}`,
      body: `A late charge set the fastest lap of the race — small consolation or a statement of intent, depending on who you ask in the ${teamNameOf(fl.teamId)} garage.`,
    })
  }

  // DNFs
  for (const dnf of results.filter((r) => !r.classified).slice(0, 2)) {
    stories.push({
      kind: 'secondary',
      headline: `Heartbreak for ${fullName(drivers, dnf.driverId)}`,
      body: `${dnf.dnfReason ?? 'Mechanical failure'} ended the race early for the ${teamNameOf(dnf.teamId)} driver.`,
    })
  }

  // Championship analysis placeholder filled by caller standings
  stories.push({
    kind: 'analysis',
    headline: 'Championship picture after ' + circuitName,
    body: `The title race shifts again after round ${input.round} of season ${input.season}. Every point matters from here.`,
  })

  // Rumour
  stories.push({
    kind: 'rumour',
    headline: 'Paddock whispers: contract talks heating up',
    body: 'Sources suggest at least two mid-field teams are preparing offers for upcoming free agents. Expect movement before the next round.',
  })

  return { lead, stories }
}

function fullName(drivers: Record<string, Driver>, id: string): string {
  const d = drivers[id]
  return d ? `${d.firstName} ${d.lastName}` : id
}
