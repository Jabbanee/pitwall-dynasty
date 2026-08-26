import { el, money, ratingColor, toast } from './dom'
import { store } from '../state/store'
import { fmtMoney, getProjects, signDriver } from '../championship/engine'
import type { Championship, Team, Driver } from '../core/types'

export function teamColorDot(champ: Championship, teamId: string): HTMLElement {
  const t = champ.teams.find((x) => x.id === teamId)
  return el('span', { class: 'team-dot', style: `background:${t?.colors.primary ?? '#666'}` })
}

export function driverName(champ: Championship, id: string): string {
  const d = champ.drivers[id]
  return d ? `${d.firstName[0]}. ${d.lastName}` : id
}

export function renderHQ(root: HTMLElement) {
  const { champ, engine } = store
  if (!champ || !engine) return location.hash = '#/'
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  const team = store.playerTeam!
  const round = champ.rounds[champ.currentRoundIndex]
  const circuit = champ.circuits.find((c) => c.id === round.circuitId)!
  const standings = engine.standings()
  const myTeamRow = standings.teamRows.findIndex((r) => r.teamId === team.id) + 1

  // --- Phase banner ---
  const phaseLabel = round.raceDone ? 'Round complete — advance to continue' : 'Management phase'
  inner.appendChild(
    el('div', { class: 'phase-banner' },
      el('div', {},
        el('h2', {}, `Round ${round.index + 1} — ${circuit.name}`),
        el('div', { style: 'color:var(--text-2);font-size:12px;text-transform:uppercase;letter-spacing:.05em' }, `${phaseLabel} · Season ${champ.config.season} · Race ${round.index + 1}/${champ.rounds.length}`),
      ),
      el('div', { class: 'spacer' }),
      round.raceDone
        ? el('button', { class: 'primary', onclick: () => { store.advanceRound(); renderHQ(root) } }, 'Advance to next round')
        : el('button', { class: 'primary', onclick: () => (location.hash = '#/weekend') }, 'Race weekend →'),
    ),
  )

  // --- Top stats row ---
  inner.appendChild(
    el('div', { class: 'grid cols-4' },
      statCard('Championship', myTeamRow > 0 ? `P${myTeamRow}` : '—', `${standings.teamRows.find((r) => r.teamId === team.id)?.points ?? 0} pts`),
      statCard('Balance', fmtMoney(team.money), `${team.sponsors.length} sponsors`),
      statCard('Car pace', avgPace(team).toFixed(0), 'overall index'),
      statCard('Drivers', '', undefined, shortDriverList(champ, team)),
    ),
  )

  // --- Middle grid ---
  const newsCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Paddock News')),
    el('div', { class: 'card-body', style: 'max-height:320px;overflow-y:auto' },
      champ.newsFeed.length === 0
        ? el('div', { class: 'empty-state' }, 'No news yet — race weekends will generate headlines here.')
        : champ.newsFeed.slice(0, 12).map((n) =>
            el('div', { class: 'news-item' },
              el('div', { class: 'news-meta' }, `S${n.season} · R${n.roundIndex + 1}`),
              el('h4', {}, n.headline),
              el('p', {}, n.body),
            ),
          ),
    ),
  )

  const devProjects = getProjects(team)
  const devCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Development'), el('button', { class: 'small', onclick: () => (location.hash = '#/development') }, 'Open')),
    el('div', { class: 'card-body' },
      devProjects.length === 0
        ? el('div', { class: 'empty-state' }, 'No active projects.')
        : devProjects.map((p) =>
            el('div', {},
              el('div', { class: 'stat' }, el('span', {}, p.name), el('span', { class: 'value' }, `${p.weeksRemaining}w left`)),
              progressBar(1 - p.weeksRemaining / p.weeksTotal),
            ),
          ),
    ),
  )

  const standingsCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Constructors'), el('button', { class: 'small', onclick: () => (location.hash = '#/standings') }, 'Full table')),
    miniStandingsTable(champ, standings.teamRows.slice(0, 6)),
  )

  const calendarCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Calendar')),
    el('div', { class: 'card-body' },
      ...champ.rounds.map((r) =>
        el('div', { class: 'stat', style: r.index === champ.currentRoundIndex ? 'color:var(--warn)' : '' },
          el('span', {}, `R${r.index + 1} ${champ.circuits.find((c) => c.id === r.circuitId)?.name ?? ''}`),
          el('span', { class: 'value' }, r.raceDone ? 'Done' : r.index === champ.currentRoundIndex ? 'Current' : 'Upcoming'),
        ),
      ),
    ),
  )

  inner.appendChild(el('div', { class: 'grid cols-2' }, newsCard, devCard))
  inner.appendChild(el('div', { class: 'grid cols-2' }, standingsCard, calendarCard))

  page.appendChild(inner)
  root.appendChild(page)
}

export function statCard(label: string, value: string, sub?: string, subNode?: HTMLElement): HTMLElement {
  return el('div', { class: 'card' },
    el('div', { class: 'card-body' },
      el('div', { class: 'stat' },
        el('span', { class: 'label' }, label),
        value ? el('span', { class: 'value', style: 'font-size:20px;font-weight:700' }, value) : null,
      ),
      sub ? el('div', { style: 'font-size:12px;color:var(--text-2)' }, sub) : null,
      subNode,
    ),
  )
}

export function progressBar(frac: number, color?: string): HTMLElement {
  const bar = el('div', { class: 'progressbar' })
  const fill = el('div')
  fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`
  if (color) fill.style.background = color
  bar.appendChild(fill)
  return bar
}

function avgPace(team: Team): number {
  const v = Object.values(team.carPerformance)
  return v.reduce((a, b) => a + b, 0) / v.length
}

function shortDriverList(champ: Championship, team: Team): HTMLElement {
  const box = el('div', {})
  for (const id of team.driverIds) {
    const d = champ.drivers[id]
    if (!d) continue
    box.appendChild(
      el('div', { class: 'stat' },
        el('span', {}, driverName(champ, id)),
        el('span', { class: 'value', style: `color:${ratingColor(d.visible.pace)}` }, String(d.visible.pace)),
      ),
    )
  }
  return box
}

function miniStandingsTable(champ: Championship, rows: Array<{ teamId: string; points: number; wins: number }>): Node {
  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Team'), el('th', { class: 'num' }, 'Pts'), el('th', { class: 'num' }, 'Wins'))),
  )
  const tbody = el('tbody', {})
  rows.forEach((r, i) => {
    const isMe = r.teamId === store.champ?.playerTeamId
    tbody.appendChild(
      el('tr', { class: isMe ? 'me' : '' },
        el('td', { class: 'num' }, String(i + 1)),
        el('td', {}, teamColorDot(champ, r.teamId), champ.teams.find((t) => t.id === r.teamId)?.name ?? r.teamId),
        el('td', { class: 'num' }, String(r.points)),
        el('td', { class: 'num' }, String(r.wins)),
      ),
    )
  })
  table.appendChild(tbody)
  return table
}

// ---------------------------------------------------------------------------
// Standings screen
// ---------------------------------------------------------------------------

export function renderStandings(root: HTMLElement) {
  const { champ, engine } = store
  if (!champ || !engine) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  const st = engine.standings()

  const driversTable = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Driver'), el('th', {}, 'Team'), el('th', { class: 'num' }, 'Pts'), el('th', { class: 'num' }, 'Wins'))))
  const dtb = el('tbody', {})
  st.driverRows.forEach((r, i) => {
    const d = champ.drivers[r.driverId]
    const team = champ.teams.find((t) => t.driverIds.includes(r.driverId))
    dtb.appendChild(
      el('tr', { class: team?.id === champ.playerTeamId ? 'me' : '' },
        el('td', { class: 'num' }, String(i + 1)),
        el('td', {}, d ? `${d.firstName} ${d.lastName}` : r.driverId),
        el('td', {}, team ? [teamColorDot(champ, team.id), team.shortName] : '—'),
        el('td', { class: 'num' }, String(r.points)),
        el('td', { class: 'num' }, String(r.wins)),
      ),
    )
  })
  driversTable.appendChild(dtb)

  const teamsTable = miniStandingsTable(champ, st.teamRows)

  // History
  const historyCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Past Champions')),
    el('div', { class: 'card-body' },
      champ.history.length === 0
        ? el('div', { class: 'empty-state' }, 'First season in progress.')
        : champ.history.slice().reverse().map((h) =>
            el('div', { class: 'stat' },
              el('span', {}, `Season ${h.season}`),
              el('span', { class: 'value' },
                `${champ.teams.find((t) => t.id === h.championTeamId)?.name ?? '?'} · ${champ.drivers[h.championDriverId]?.lastName ?? h.championDriverId}`),
            ),
          ),
    ),
  )

  inner.appendChild(el('h2', {}, `Season ${champ.config.season} Standings`))
  inner.appendChild(el('div', { class: 'grid cols-2' },
    el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h3', {}, 'Drivers Championship')), driversTable),
    el('div', {}, el('div', { class: 'card', style: 'margin-bottom:16px' }, el('div', { class: 'card-head' }, el('h3', {}, 'Constructors Championship')), teamsTable), historyCard),
  ))
  page.appendChild(inner)
  root.appendChild(page)
}

// ---------------------------------------------------------------------------
// Drivers / Staff screens
// ---------------------------------------------------------------------------

export function renderDrivers(root: HTMLElement) {
  const { champ } = store
  if (!champ) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h2', {}, 'Drivers'))
  const team = store.playerTeam!

  for (const id of team.driverIds) {
    const d = champ.drivers[id]
    if (!d) continue
    inner.appendChild(driverCard(champ, d))
  }

  // Market: available drivers
  const marketIds = Object.values(champ.drivers).filter((d) => !d.contract && !d.retired)
  if (marketIds.length) {
    const marketCard = el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, 'Free Agents — sign to replace a current driver')),
      el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Age'), el('th', { class: 'num' }, 'Pace'), el('th', { class: 'num' }, 'Ovr'), el('th', {}), )),
      ),
    )
    const tb = el('tbody', {})
    for (const d of marketIds) {
      const ovr = Math.round(Object.values(d.visible).reduce((a, b) => a + b, 0) / 9)
      tb.appendChild(el('tr', {},
        el('td', {}, `${d.firstName} ${d.lastName}`),
        el('td', { class: 'num' }, String(d.age)),
        el('td', { class: 'num', style: `color:${ratingColor(d.visible.pace)}` }, String(d.visible.pace)),
        el('td', { class: 'num' }, String(ovr)),
        el('td', {},
          el('button', {
            class: 'small',
            disabled: team.money < d.salaryDemandBase,
            onclick: () => {
              const err = signDriver(champ, team, d.id, d.salaryDemandBase, 2, champ.config.season)
              if (err) toast(err, true)
              else { toast(`${d.lastName} signed!`); store.save(); store.emit(); renderDrivers(root) }
            },
          }, `Sign (~${money(d.salaryDemandBase)}/season)`)),
      ))
    }
    ;(marketCard.querySelector('table') as HTMLTableElement).appendChild(tb)
    inner.appendChild(marketCard)
  }

  page.appendChild(inner)
  root.appendChild(page)
}

export function driverCard(_champ: Championship, d: Driver): HTMLElement {
  const rows: Array<[string, number]> = [
    ['Pace', d.visible.pace], ['Qualifying', d.visible.qualifying], ['Racecraft', d.visible.racecraft],
    ['Overtaking', d.visible.overtaking], ['Defending', d.visible.defending], ['Consistency', d.visible.consistency],
    ['Wet Skill', d.visible.wetSkill], ['Tyre Mgmt', d.visible.tyreManagement], ['Feedback', d.visible.feedback],
  ]
  const card = el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, `${d.firstName} ${d.lastName} · ${d.nationality} · ${d.age}y`),
      el('span', { class: 'badge grey mono' }, `${money(d.contract?.salaryPerSeason ?? d.salaryDemandBase)}/season · ${d.contract?.seasonsRemaining ?? 0}y left`),
    ),
    el('div', { class: 'card-body' },
      el('div', { class: 'grid cols-2' },
        el('div', {},
          ...rows.map(([label, v]) =>
            el('div', { class: 'rating-row', style: 'margin-bottom:4px' },
              el('span', { class: 'rlabel' }, label),
              el('div', { class: 'rating-bar' }, el('div', { style: `width:${v}%;background:${ratingColor(v)}` })),
              el('span', { class: 'rval' }, String(v)),
            ),
          ),
        ),
        el('div', {},
          moraleStat('Morale', d.dynamic.morale),
          moraleStat('Confidence', d.dynamic.confidence),
          el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Form'),
            el('span', { class: 'value' }, d.dynamic.form >= 0.1 ? '▲ in form' : d.dynamic.form <= -0.1 ? '▼ off form' : '— steady')),
          el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Career points'),
            el('span', { class: 'value' }, String(d.history.reduce((s, h) => s + h.points, 0)))),
        ),
      ),
    ),
  )
  return card
}

function moraleStat(label: string, v: number): Node {
  return el('div', { class: 'rating-row', style: 'margin-bottom:8px' },
    el('span', { class: 'rlabel' }, label),
    el('div', { class: 'rating-bar' }, el('div', { style: `width:${v}%;background:${v > 60 ? 'var(--good)' : v > 35 ? 'var(--warn)' : 'var(--bad)'}` })),
    el('span', { class: 'rval' }, String(Math.round(v))),
  )
}

export function renderStaff(root: HTMLElement) {
  const { champ } = store
  if (!champ) return
  root.innerHTML = ''
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(el('h2', {}, 'Staff'))
  const team = store.playerTeam!

  const card = el('div', { class: 'card' })
  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Role'), el('th', {}, 'Name'), el('th', { class: 'num' }, 'Skill'), el('th', { class: 'num' }, 'Salary'))))
  const tb = el('tbody', {})
  for (const sid of team.staffIds) {
    const s = champ.staffPool.find((x) => x.id === sid)
    if (!s) continue
    tb.appendChild(el('tr', {},
      el('td', {}, s.role.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())),
      el('td', {}, s.name),
      el('td', { class: 'num', style: `color:${ratingColor(s.skill)}` }, String(s.skill)),
      el('td', { class: 'num' }, money(s.contract?.salaryPerSeason ?? 0)),
    ))
  }
  table.appendChild(tb)
  card.appendChild(table)
  inner.appendChild(card)
  inner.appendChild(el('p', { style: 'color:var(--text-2);font-size:12px' },
    'Strategist skill improves in-race strategy calls. Pit Operations affects stop quality. Race Engineer adds reliability. Technical Director, Head of Aero and Chief Designer accelerate development quality.'))

  page.appendChild(inner)
  root.appendChild(page)
}
