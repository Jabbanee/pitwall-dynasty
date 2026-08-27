import { el, fmtLapTime } from './dom'
import { store } from '../state/store'
import { teamColorDot, driverName } from './hq'
import { renderKpiTile, renderHelmet, renderEmptyState } from './renderers'
import { iconCheckered, iconTrophy, iconBolt } from './icons'

/**
 * Results screen — P1 redesign.
 *
 * Chequered-flag hero, podium, race story, player team summary,
 * full classification. Uses the new design-system primitives.
 */
export function renderResults(root: HTMLElement) {
  const champ = store.champ!
  const round = champ.rounds[champ.currentRoundIndex]
  const result = round?.raceResult
  root.innerHTML = ''

  if (!result) {
    root.appendChild(el('div', { class: 'page' }, renderEmptyState({ title: 'No race results yet.', sub: 'Lock a race package to start the simulator.' })))
    return
  }

  const circuit = champ.circuits.find((c) => c.id === round.circuitId)!
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  // --- Chequered-flag hero ---
  const hero = el('div', { class: 'hero-panel' })
  const heroLeft = el('div', {})
  heroLeft.appendChild(el('div', { class: 'hero-eyebrow' },
    el('span', { class: 'pulse' }),
    el('span', {}, 'CHEQUERED FLAG · ROUND ' + (round.index + 1)),
  ))
  const winner = result.results.find((r) => r.finishPosition === 1 && r.classified)
  const winnerName = winner ? driverName(champ, winner.driverId) : '—'
  const winnerTeam = winner ? champ.teams.find((t) => t.id === winner.teamId) : null
  heroLeft.appendChild(el('div', { class: 'hero-title' }, circuit.name))
  heroLeft.appendChild(el('div', { class: 'hero-sub' },
    winner ? `${winnerName} wins for ${winnerTeam?.name ?? '—'}` : 'Race complete',
  ))
  const heroStats = el('div', { class: 'hero-grid' })
  heroStats.appendChild(renderKpiTile('Round', `${round.index + 1}/${champ.rounds.length}`, circuit.country))
  heroStats.appendChild(renderKpiTile('Laps', String(circuit.characteristics.laps), `${(circuit.characteristics as { lengthKm?: number }).lengthKm ?? 5.2} km`))
  heroStats.appendChild(renderKpiTile('Classified', String(result.results.filter((r) => r.classified).length), `of ${result.results.length}`))
  heroStats.appendChild(renderKpiTile('Pit stops', String(result.results.reduce((s, r) => s + r.pitStops, 0)), 'total'))
  heroStats.appendChild(renderKpiTile('Lead changes', String(result.events.filter((e) => e.type === 'leadChange').length)))
  heroStats.appendChild(renderKpiTile('Fastest lap', fastestLapText(result), 'see classification'))
  heroLeft.appendChild(heroStats)
  const heroActions = el('div', { class: 'hero-actions' })
  heroActions.appendChild(el('button', { class: 'primary', onclick: () => (location.hash = '#/paddock') }, 'Open Paddock Post →'))
  heroActions.appendChild(el('button', { class: 'quiet', onclick: () => (location.hash = '#/broadcast') }, 'Rewatch broadcast'))
  heroActions.appendChild(el('button', {
    onclick: () => {
      const outcome = store.advanceRound()
      location.hash = outcome === 'seasonComplete' ? '#/standings' : '#/hq'
    },
  }, champ.currentRoundIndex + 1 >= champ.rounds.length ? 'Complete season →' : 'Next round →'))
  heroLeft.appendChild(heroActions)
  hero.appendChild(heroLeft)

  // Hero side: podium
  const heroSide = el('div', { class: 'hero-side' })
  heroSide.appendChild(el('div', { class: 'kicker' }, 'PODIUM'))
  const podium = el('div', { class: 'podium' })
  const p1 = result.results.filter((r) => r.classified).slice(0, 3)
  const order = p1.length >= 3 ? [p1[1], p1[0], p1[2]] : p1
  for (const r of order) {
    const team = champ.teams.find((t) => t.id === r.teamId)
    if (!team) continue
    const pos = r.finishPosition
    const step = el('div', { class: `podium-step p${pos}` })
    const block = el('div', { class: 'block' })
    block.appendChild(el('div', { class: 'podium-rank' }, `P${pos}`))
    block.appendChild(renderHelmet({ id: team.id, name: team.name, colors: team.colors }, r.driverId.slice(-2), 'md'))
    const info = el('div', { style: 'text-align:center' })
    info.appendChild(el('div', { class: 'name' }, driverName(champ, r.driverId)))
    info.appendChild(el('div', { class: 'team' }, team.shortName))
    block.appendChild(info)
    if (r.fastestLap) block.appendChild(el('div', { class: 'kicker', style: 'color:var(--accent-2)' }, 'FL'))
    step.appendChild(block)
    podium.appendChild(step)
  }
  heroSide.appendChild(podium)
  hero.appendChild(heroSide)
  inner.appendChild(hero)

  // --- Player team summary ---
  if (champ.playerTeamId) {
    const team = champ.teams.find((t) => t.id === champ.playerTeamId)
    if (team) {
    const playerResults = team.driverIds.map((id: string) => result.results.find((r) => r.driverId === id)).filter((r): r is NonNullable<typeof r> => !!r)
    if (playerResults.length > 0) {
      const card = el('div', { class: 'panel' })
      card.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'YOUR TEAM')))
      const body = el('div', { class: 'panel-body' })
      const tiles = el('div', { class: 'mini-tiles' })
      for (const r of playerResults) {
        const d = champ.drivers[r.driverId]
        const finish = r.classified ? `P${r.finishPosition}` : 'DNF'
        const points = r.classified ? `+${r.points} pts` : r.dnfReason ?? '—'
        const from = playerResults[0]?.startPosition
        const delta = from !== undefined ? r.startPosition - r.finishPosition : 0
        const trend = delta === 0 ? '±' : delta > 0 ? `▲ ${delta}` : `▼ ${-delta}`
        tiles.appendChild(renderKpiTile(`${d?.lastName ?? r.driverId}`, finish, `${points} · ${trend}`))
      }
      tiles.appendChild(renderKpiTile('Pits', String(playerResults.reduce((s: number, r) => s + r.pitStops, 0)), 'team total'))
      body.appendChild(tiles)
      card.appendChild(body)
      inner.appendChild(card)
    }
    }
  }

  // --- Race story card ---
  const overtakeCount = result.events.filter((e) => e.type === 'overtake').length
  const retireCount = result.events.filter((e) => e.type === 'retirement' || e.type === 'mechanicalFailure').length
  const scCount = result.events.filter((e) => e.type === 'safetyCar').length
  const leadChanges = result.events.filter((e) => e.type === 'leadChange').length
  const startPos = winner?.startPosition
  const finishPos = winner?.finishPosition
  const gained = (startPos !== undefined && finishPos !== undefined) ? startPos - finishPos : 0
  const story = el('div', { class: 'panel' })
  story.appendChild(el('div', { class: 'panel-head' }, el('h3', {}, 'RACE STORY')))
  const storyBody = el('div', { class: 'panel-body' })
  const storyTiles = el('div', { class: 'mini-tiles' })
  storyTiles.appendChild(renderKpiTile('Start → Finish', winner ? `P${startPos} → P${finishPos}` : '—', gained > 0 ? `gained ${gained} pos` : gained < 0 ? `lost ${-gained} pos` : 'held'))
  storyTiles.appendChild(renderKpiTile('Overtakes', String(overtakeCount)))
  storyTiles.appendChild(renderKpiTile('Lead changes', String(leadChanges)))
  storyTiles.appendChild(renderKpiTile('Retirements', String(retireCount)))
  storyTiles.appendChild(renderKpiTile('Safety cars', String(scCount), scCount > 0 ? 'neutralised' : 'green-flag race'))
  storyTiles.appendChild(renderKpiTile('Pit stops', String(result.results.reduce((s, r) => s + r.pitStops, 0)), 'across field'))
  storyBody.appendChild(storyTiles)

  // Key moments
  const moments = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Key Moments')),
    el('div', { class: 'card-body', style: 'max-height:240px;overflow-y:auto' },
      result.events.length === 0
        ? el('div', { class: 'empty-state' }, 'A quiet race.')
        : result.events.filter((e) => ['overtake', 'retirement', 'safetyCar', 'leadChange', 'weatherChange'].includes(e.type)).map((e) =>
            el('div', { class: 'stat' },
              el('span', {}, e.detail),
              el('span', { class: 'value', style: 'color:var(--text-2)' }, `${Math.floor(e.t / 60)}:${String(Math.floor(e.t % 60)).padStart(2, '0')}`),
            ),
          ),
    ),
  )
  storyBody.appendChild(moments)
  story.appendChild(storyBody)
  inner.appendChild(story)

  // --- Full classification ---
  const classCard = el('div', { class: 'panel' })
  classCard.appendChild(el('div', { class: 'panel-head' },
    el('h3', {}, 'CLASSIFICATION'),
    el('span', { class: 'kicker' }, `${result.results.length} entries · ${result.results.filter((r) => r.classified).length} classified`),
  ))
  const classBody = el('div', { class: 'panel-body' })
  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Pos'),
      el('th', {}, 'Δ'),
      el('th', {}, 'Driver'),
      el('th', {}, 'Team'),
      el('th', { class: 'num' }, 'Grid'),
      el('th', { class: 'num' }, 'Laps'),
      el('th', { class: 'num' }, 'Best'),
      el('th', { class: 'num' }, 'Pits'),
      el('th', { class: 'num' }, 'Pts'),
      el('th', {}, 'Status'),
    )),
  )
  const tb = el('tbody', {})
  const sorted = [...result.results].sort((a, b) => a.finishPosition - b.finishPosition)
  for (const r of sorted) {
    const team = champ.teams.find((t) => t.id === r.teamId)
    const isMe = team?.id === champ.playerTeamId
    const delta = r.startPosition - r.finishPosition
    const deltaStr = delta === 0 ? '±' : delta > 0 ? `▲${delta}` : `▼${-delta}`
    const deltaColor = delta > 0 ? 'var(--good)' : delta < 0 ? 'var(--bad)' : 'var(--text-2)'
    tb.appendChild(
      el('tr', { class: isMe ? 'me' : '' },
        el('td', { class: 'num', style: 'font-weight:700' }, r.classified ? String(r.finishPosition) : '—'),
        el('td', { class: 'num', style: `color:${deltaColor};font-weight:700` }, deltaStr),
        el('td', {},
          el('div', { style: 'display:flex;align-items:center;gap:6px' },
            r.fastestLap ? el('span', { class: 'badge blue' }, 'FL') : null,
            el('span', { style: 'font-weight:600' }, driverName(champ, r.driverId)),
          ),
        ),
        el('td', {}, team ? [teamColorDot(champ, team.id), team.shortName] : '—'),
        el('td', { class: 'num' }, String(r.startPosition)),
        el('td', { class: 'num' }, String(r.lapsCompleted)),
        el('td', { class: 'num' }, r.bestLapTime ? fmtLapTime(r.bestLapTime) : '—'),
        el('td', { class: 'num' }, String(r.pitStops)),
        el('td', { class: 'num', style: 'font-weight:700' }, String(r.points)),
        el('td', {}, r.dnfReason
          ? el('span', { class: 'badge red' }, `DNF — ${r.dnfReason}`)
          : el('span', { class: 'badge green' }, 'Classified')),
      ),
    )
  }
  table.appendChild(tb)
  classBody.appendChild(table)
  classCard.appendChild(classBody)
  inner.appendChild(classCard)

  // --- Continue row ---
  inner.appendChild(
    el('div', { style: 'display:flex;justify-content:center;padding:14px 0;gap:12px' },
      el('button', { class: 'primary', onclick: () => (location.hash = '#/paddock') }, 'Open Paddock Post →'),
      el('button', {
        onclick: () => {
          const outcome = store.advanceRound()
          if (outcome === 'seasonComplete') {
            location.hash = '#/standings'
          } else {
            location.hash = '#/hq'
          }
        },
      }, champ.currentRoundIndex + 1 >= champ.rounds.length ? 'Complete season →' : 'Next round →'),
      el('button', { onclick: () => (location.hash = '#/hq') }, 'Back to HQ'),
    ),
  )

  page.appendChild(inner)
  root.appendChild(page)
}

function fastestLapText(result: { fastestLapDriverId?: string; results: Array<{ driverId: string; bestLapTime?: number }> }, drivers?: Record<string, { lastName: string }>): string {
  if (!result.fastestLapDriverId) return '—'
  const r = result.results.find((x) => x.driverId === result.fastestLapDriverId)
  const d = drivers?.[result.fastestLapDriverId]
  return r?.bestLapTime ? `${d?.lastName ?? '?'} (${fmtLapTime(r.bestLapTime)})` : (d?.lastName ?? '?')
}

// satisfy linter
void iconCheckered; void iconTrophy; void iconBolt
