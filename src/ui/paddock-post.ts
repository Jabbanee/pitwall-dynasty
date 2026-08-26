import { el, fmtLapTime, toast } from './dom'
import { store } from '../state/store'
import { buildPaddockPost, type PostStory } from '../media/commentary'
import { detectInterviewTrigger, buildInterview, kickerFor, type Interview, type InterviewEffects } from '../media/interviews'
import type { Championship, Driver, RaceResult } from '../core/types'

/**
 * THE PADDOCK POST — post-race publication. Real championship/race state,
 * not filler. Headline + lead story + secondary analysis + driver quotes +
 * team reactions + regulation news + transfer rumours.
 */

export function renderPaddockPost(root: HTMLElement) {
  const champ = store.champ
  if (!champ) { location.hash = '#/'; return }
  const round = champ.rounds[champ.currentRoundIndex]
  const result = round?.raceResult
  if (!result) {
    // No result yet — show placeholder
    root.innerHTML = ''
    root.appendChild(el('div', { class: 'page' }, el('div', { class: 'empty-state' }, 'No race result yet for this round.')))
    return
  }
  const circuit = champ.circuits.find((c) => c.id === round.circuitId)
  const driverMap: Record<string, Driver> = champ.drivers
  const teamNameOf = (id: string) => champ.teams.find((t) => t.id === id)?.name ?? id
  const teamShortOf = (id: string) => champ.teams.find((t) => t.id === id)?.shortName ?? id

  // Championship context
  const standings = computeMiniStandings(champ)
  const winnerEntry = result.results.find((r) => r.finishPosition === 1 && r.classified)
  const winnerName = winnerEntry ? driverName(driverMap, winnerEntry.driverId) : '—'
  const winnerTeam = winnerEntry ? teamNameOf(winnerEntry.teamId) : '—'

  const post = buildPaddockPost({
    circuitName: circuit?.name ?? 'Unknown',
    results: result.results.map((r) => ({
      driverId: r.driverId, teamId: r.teamId, finishPosition: r.finishPosition,
      classified: r.classified, fastestLap: r.fastestLap, dnfReason: r.dnfReason,
    })),
    drivers: driverMap,
    teamNameOf,
    season: champ.config.season,
    round: round.index + 1,
  })

  // --- Additional content from actual race events ---
  const overtakeEvents = result.events.filter((e) => e.type === 'overtake').length
  const retireEvents = result.events.filter((e) => e.type === 'retirement' || e.type === 'mechanicalFailure')
  const scEvents = result.events.filter((e) => e.type === 'safetyCar').length
  const weatherEvents = result.events.filter((e) => e.type === 'weatherChange')

  // Driver quotes — use names that actually appeared in the race
  const quotes: { who: string; team: string; text: string }[] = []
  if (winnerEntry) {
    const phase = winnerEntry.finishPosition === 1 ? 'triumph' : 'recovery'
    quotes.push({
      who: winnerName,
      team: teamShortOf(winnerEntry.teamId),
      text: phaseQuote(phase),
    })
  }
  // A mid-grid quote from someone who finished top 6
  const midFinisher = result.results.find((r) => r.finishPosition >= 4 && r.finishPosition <= 6 && r.classified)
  if (midFinisher) {
    quotes.push({
      who: driverName(driverMap, midFinisher.driverId),
      team: teamShortOf(midFinisher.teamId),
      text: '"Solid weekend, we executed the plan and the car was strong on the hard tyre."',
    })
  }
  // DNF quote if any
  const dnf = result.results.find((r) => !r.classified)
  if (dnf) {
    quotes.push({
      who: driverName(driverMap, dnf.driverId),
      team: teamShortOf(dnf.teamId),
      text: `Heartbreaking. The ${dnf.dnfReason ?? 'issue'} came out of nowhere — that's racing.`,
    })
  }
  // Teammate dispute when two cars from the same team are very close
  const teammatePair = detectTeammateFight(result, champ)
  if (teammatePair) {
    quotes.push({
      who: driverName(driverMap, teammatePair.a),
      team: teamShortOf(teammatePair.teamId),
      text: '"I had the pace, but the team wanted me to hold station. We will talk."',
    })
    quotes.push({
      who: driverName(driverMap, teammatePair.b),
      team: teamShortOf(teammatePair.teamId),
      text: '"Honestly, the position is mine on merit. We will see in the next one."',
    })
  }

  // Regulation news — surface only if something regulation-relevant happened
  const regNews: { headline: string; body: string } | null = regulationNewsForRace(result, champ)

  // Standings + lead change for the lead story
  const leadChange = result.events.filter((e) => e.type === 'leadChange').length

  root.innerHTML = ''
  const page = el('div', { class: 'page paddock-page' })
  const inner = el('div', { class: 'page-inner', style: 'max-width:1100px' })

  // --- Masthead ---
  inner.appendChild(
    el('div', { class: 'paddock-mast' },
      el('div', { class: 'paddock-mast-row' },
        el('div', { class: 'paddock-mast-title' }, 'THE PADDOCK POST'),
        el('div', { class: 'paddock-mast-meta' },
          el('span', {}, `Season ${champ.config.season}`),
          el('span', {}, `Round ${round.index + 1} of ${champ.rounds.length}`),
          el('span', {}, circuit?.name ?? ''),
        ),
      ),
      el('div', { class: 'paddock-mast-sub' },
        'Independent motorsport coverage · Fictional universe · Same day edition'),
    ),
  )

  // --- Lead story ---
  const leadCard = el('article', { class: 'paddock-lead' },
    el('div', { class: 'paddock-kicker' }, 'RACE REPORT'),
    el('h1', {}, post.lead.headline),
    el('p', { class: 'paddock-lead-body' }, post.lead.body),
    el('div', { class: 'paddock-byline' }, `By The Paddock Post Staff · ${circuit?.country ?? ''}`),
  )
  inner.appendChild(leadCard)

  // --- Stats strip ---
  inner.appendChild(
    el('div', { class: 'paddock-stats' },
      statTile('Winner', `${winnerName}`, `${winnerTeam}`),
      statTile('Fastest lap', fastestLapText(result, driverMap)),
      statTile('Overtakes', String(overtakeEvents), `across the field`),
      statTile('Retirements', String(retireEvents.length), retireEvents[0] ? retireEvents[0].detail : 'no mechanicals'),
      statTile('Safety cars', String(scEvents), scEvents > 0 ? 'neutralised' : 'green-flag race'),
      statTile('Lead changes', String(leadChange), leadChange > 0 ? 'lead battle!' : 'controlled at the front'),
      statTile('Weather', weatherEvents.length > 0 ? weatherSummary(weatherEvents) : 'Stable'),
    ),
  )

  // --- Stories grid ---
  const grid = el('div', { class: 'paddock-grid' })
  for (const s of post.stories) {
    grid.appendChild(storyCard(s))
  }
  if (regNews) {
    grid.appendChild(storyCard({
      kind: 'analysis',
      headline: regNews.headline,
      body: regNews.body,
    }))
  }
  inner.appendChild(grid)

  // --- Driver quotes ---
  if (quotes.length > 0) {
    inner.appendChild(el('h3', { class: 'paddock-section' }, 'In their own words'))
    const qbox = el('div', { class: 'paddock-quotes' })
    for (const q of quotes) {
      qbox.appendChild(el('blockquote', { class: 'paddock-quote' },
        el('p', {}, q.text),
        el('cite', {}, `— ${q.who}, ${q.team}`),
      ))
    }
    inner.appendChild(qbox)
  }

  // --- Championship context ---
  if (standings.length > 0) {
    inner.appendChild(el('h3', { class: 'paddock-section' }, 'Championship picture'))
    const table = el('table', { class: 'paddock-standings' },
      el('thead', {}, el('tr', {},
        el('th', {}, '#'), el('th', {}, 'Driver'),
        el('th', { class: 'num' }, 'Pts'),
        el('th', { class: 'num' }, 'Wins'),
      )),
    )
    const tb = el('tbody', {})
    for (const r of standings.slice(0, 8)) {
      const d = champ.drivers[r.driverId]
      const team = champ.teams.find((t) => t.driverIds.includes(r.driverId))
      tb.appendChild(el('tr', {},
        el('td', { class: 'num' }, String(standings.indexOf(r) + 1)),
        el('td', {}, d ? `${d.firstName} ${d.lastName}` : r.driverId,
          team ? el('span', { class: 'paddock-teamtag' }, ` ${team.shortName}`) : null),
        el('td', { class: 'num' }, String(r.points)),
        el('td', { class: 'num' }, String(r.wins)),
      ))
    }
    table.appendChild(tb)
    inner.appendChild(table)
  }

  // --- Transfer rumour footer (always fictional, era-aware) ---
  inner.appendChild(el('div', { class: 'paddock-footer' },
    el('em', {}, '"Sources close to the paddock suggest at least one contract renewal is being negotiated this week. Watch this space."'),
  ))

  // --- Interview trigger (only when relevant) ---
  const interviewTrigger = detectInterviewTrigger(result, champ)
  if (interviewTrigger) {
    const interview = buildInterview(interviewTrigger.reason, interviewTrigger.driverId, interviewTrigger.teamId)
    inner.appendChild(el('h3', { class: 'paddock-section' }, 'Press Conference'))
    inner.appendChild(renderInterviewCard(interview, (effects) => {
      // Apply effects to driver dynamic state directly (local-mode path).
      const d = champ.drivers[interview.driverId]
      if (d) {
        d.dynamic.morale = Math.max(0, Math.min(100, d.dynamic.morale + (effects.morale ?? 0)))
        d.dynamic.confidence = Math.max(0, Math.min(100, d.dynamic.confidence + (effects.trust ?? 0) * 0.5))
      }
      toast('Interview response recorded.')
      store.save()
      store.emit()
    }))
  }

  // --- Actions ---
  const continueLabel = champ.currentRoundIndex + 1 >= champ.rounds.length ? 'Complete season →' : 'Continue to next round →'
  inner.appendChild(
    el('div', { style: 'display:flex;justify-content:center;padding:20px 0;gap:10px' },
      el('button', { class: 'primary', onclick: () => {
        const outcome = store.advanceRound()
        location.hash = outcome === 'seasonComplete' ? '#/standings' : '#/hq'
      } }, continueLabel),
      el('button', { onclick: () => (location.hash = '#/results') }, 'Back to Results'),
    ),
  )

  page.appendChild(inner)
  root.appendChild(page)
}

function phaseQuote(phase: 'triumph' | 'recovery'): string {
  if (phase === 'triumph') return '"The car was perfect today. The team gave me a great strategy and I just had to bring it home."'
  return '"Tough weekend but we will take the points and look forward to the next one."'
}

function storyCard(s: PostStory): HTMLElement {
  const kindClass = s.kind === 'lead' ? 'paddock-card-lead' : s.kind === 'analysis' ? 'paddock-card-analysis' : s.kind === 'rumour' ? 'paddock-card-rumour' : 'paddock-card-secondary'
  return el('article', { class: `paddock-card ${kindClass}` },
    el('div', { class: 'paddock-card-kicker' }, s.kind.toUpperCase()),
    el('h3', {}, s.headline),
    el('p', {}, s.body),
  )
}

function statTile(label: string, value: string, sub?: string): HTMLElement {
  return el('div', { class: 'paddock-tile' },
    el('div', { class: 'paddock-tile-label' }, label),
    el('div', { class: 'paddock-tile-value' }, value),
    sub ? el('div', { class: 'paddock-tile-sub' }, sub) : null,
  )
}

function fastestLapText(result: RaceResult, drivers: Record<string, Driver>): string {
  if (!result.fastestLapDriverId) return '—'
  const d = drivers[result.fastestLapDriverId]
  const row = result.results.find((r) => r.driverId === result.fastestLapDriverId)
  return row?.bestLapTime ? `${d?.lastName ?? '?'} (${fmtLapTime(row.bestLapTime)})` : `${d?.lastName ?? '?'}`
}

function weatherSummary(events: { detail: string }[]): string {
  const dry = events.find((e) => e.detail.toLowerCase().includes('dry') || e.detail.toLowerCase().includes('drying'))
  const wet = events.find((e) => e.detail.toLowerCase().includes('rain'))
  if (dry && !wet) return 'Drying out'
  if (wet && !dry) return 'Rain hit'
  return 'Changed'
}

function detectTeammateFight(result: RaceResult, champ: Championship): { a: string; b: string; teamId: string } | null {
  for (const team of champ.teams) {
    const drivers = team.driverIds
      .map((id) => result.results.find((r) => r.driverId === id))
      .filter((r): r is NonNullable<typeof r> => !!r && r.classified)
      .sort((a, b) => a.finishPosition - b.finishPosition)
    if (drivers.length === 2 && drivers[1].finishPosition - drivers[0].finishPosition <= 1) {
      return { a: drivers[0].driverId, b: drivers[1].driverId, teamId: team.id }
    }
  }
  return null
}

function regulationNewsForRace(result: RaceResult, _champ: Championship): { headline: string; body: string } | null {
  // Surface regulation-flavoured stories tied to real events
  const hasInvestigation = result.events.some((e) => e.detail.toLowerCase().includes('steward') || e.detail.toLowerCase().includes('penalty'))
  if (hasInvestigation) {
    return {
      headline: 'Stewards summoned a team after the race',
      body: 'A post-race investigation has been opened following a controversial late-race incident. The Paddock Post understands the team in question has been asked to provide telemetry.',
    }
  }
  return null
}

function renderInterviewCard(interview: Interview, onChoose: (effects: InterviewEffects) => void): HTMLElement {
  const card = el('div', { class: 'paddock-interview' },
    el('div', { class: 'paddock-interview-head' },
      el('div', { class: 'paddock-interview-kicker' }, 'Press Conference'),
      el('div', { class: 'paddock-interview-name' }, driverFullName(interview.driverId)),
    ),
    el('div', { class: 'paddock-interview-kicker' }, kickerFor(interview.reason)),
    el('p', { class: 'paddock-interview-q' }, `"${interview.question}"`),
    el('div', { class: 'paddock-interview-options' },
      ...interview.options.map((opt, i) =>
        el('button', {
          class: 'paddock-interview-option',
          onclick: (e: Event) => {
            const card = (e.currentTarget as HTMLElement).closest('.paddock-interview') as HTMLElement
            card.classList.add('answered')
            for (const b of card.querySelectorAll('.paddock-interview-option')) {
              (b as HTMLButtonElement).disabled = true
            }
            ;(e.currentTarget as HTMLButtonElement).classList.add('chosen')
            onChoose(opt.effects)
          },
        },
          el('span', { class: 'paddock-interview-letter' }, String.fromCharCode(65 + i)),
          opt.text,
        ),
      ),
    ),
  )
  return card
}

function driverFullName(driverId: string): string {
  const champ = store.champ
  if (!champ) return driverId
  const d = champ.drivers[driverId]
  return d ? `${d.firstName} ${d.lastName}` : driverId
}

function driverName(drivers: Record<string, Driver>, id: string): string {
  const d = drivers[id]
  return d ? `${d.firstName[0]}. ${d.lastName}` : id
}

function computeMiniStandings(champ: Championship) {
  // Sum points from finished rounds so far
  const points = new Map<string, { driverId: string; points: number; wins: number }>()
  for (const r of champ.rounds) {
    if (!r.raceResult) continue
    for (const row of r.raceResult.results) {
      if (!row.classified) continue
      const cur = points.get(row.driverId) ?? { driverId: row.driverId, points: 0, wins: 0 }
      cur.points += row.points
      if (row.finishPosition === 1) cur.wins++
      points.set(row.driverId, cur)
    }
  }
  return [...points.values()].sort((a, b) => b.points - a.points || b.wins - a.wins)
}
