import { el } from './dom'
import { store } from '../state/store'
import { mpSession } from '../client/multiplayer-session'

/**
 * Multiplayer view layer — minimal, server-driven renderers for HQ,
 * results, standings and the paddock post screen. All state is read
 * from `store.multi` (populated by MultiplayerSession from the
 * authoritative server). No local simulation happens here.
 *
 * These screens share the same shared broadcast — the same race, the
 * same positions, the same finishing order, the same standings on
 * every connected client.
 */

function teamColorDot(s: { primary: string; secondary: string }) {
  return el('span', { class: 'team-dot', style: `background:${s.primary}` })
}

function driverNameMp(d: { firstName: string; lastName: string } | undefined, fallback: string): string {
  if (!d) return fallback
  return `${d.firstName[0]}. ${d.lastName}`
}

function mpHeader(extra: HTMLElement[] = []): HTMLElement {
  const head = el('div', { class: 'lobby-code-banner' })
  if (store.multi.lobbyCode) {
    head.appendChild(el('span', { class: 'lobby-kicker' }, 'MULTIPLAYER'))
    head.appendChild(el('span', { class: 'lobby-code' }, store.multi.lobbyCode))
    head.appendChild(el('span', { class: 'lobby-sub' }, 'Live shared server — this is the same race everyone sees.'))
  } else {
    head.appendChild(el('span', { class: 'lobby-kicker' }, 'CONNECTING'))
    head.appendChild(el('span', { class: 'lobby-sub' }, 'Reconnecting to server…'))
  }
  const conn = el('span', { class: `b3d-mp-conn ${store.multi.connection}`, style: 'margin-left:8px' }, store.multi.connection.toUpperCase())
  head.appendChild(conn)
  for (const e of extra) head.appendChild(e)
  return head
}

export function renderMultiplayerHQ(root: HTMLElement) {
  root.innerHTML = ''
  const champ = store.multi.championship
  const lobby = store.multi.lobby
  const race = store.multi.race
  if (!champ) {
    root.appendChild(el('div', { class: 'page' }, el('div', { class: 'empty-state' }, 'Connecting to multiplayer championship…')))
    return
  }
  const myTeamId = race?.myTeamId ?? lobby?.teams.find((t) => t.ownerPlayerId === race?.myPlayerId)?.teamId
  const myTeam = myTeamId ? champ.teams.find((t) => t.id === myTeamId) : undefined

  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(mpHeader())
  inner.appendChild(el('h2', {}, `Round ${champ.currentRoundIndex + 1} of ${champ.totalRounds}`))
  if (race && (race.phase === 'race' || race.phase === 'qualifying')) {
    inner.appendChild(el('div', { class: 'phase-banner' },
      el('div', {},
        el('div', { class: 'mono', style: 'font-size:18px' }, `Live race — lap ${race.leaderLap}/${race.totalLaps}`),
        el('div', { style: 'color:var(--text-2);font-size:12px' }, 'Server-authoritative shared broadcast.'),
      ),
      el('div', { class: 'spacer' }),
      el('button', { class: 'primary', onclick: () => (location.hash = '#/broadcast') }, 'Open Broadcast →'),
    ))
  } else if (race && race.phase === 'roundResults') {
    inner.appendChild(el('div', { class: 'phase-banner' },
      el('div', {},
        el('div', { class: 'mono', style: 'font-size:18px' }, 'Round complete'),
        el('div', { style: 'color:var(--text-2);font-size:12px' }, 'Results are identical on every connected client.'),
      ),
      el('div', { class: 'spacer' }),
      el('button', { class: 'primary', onclick: () => (location.hash = '#/results') }, 'Results →'),
    ))
  } else {
    inner.appendChild(el('div', { class: 'phase-banner' },
      el('div', {},
        el('div', { class: 'mono', style: 'font-size:18px' }, 'Management phase'),
        el('div', { style: 'color:var(--text-2);font-size:12px' }, 'Update your strategy and ready up.'),
      ),
      el('div', { class: 'spacer' }),
      el('button', { class: 'primary', onclick: () => mpSession.readyTeam(true) }, 'Ready (lock when all ready)'),
    ))
  }

  if (lobby) {
    const teamCard = el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, 'Teams')),
      el('div', { class: 'card-body' },
        ...lobby.teams.map((t) => {
          const full = champ.teams.find((x) => x.id === t.teamId)
          const owner = lobby.players.find((p) => p.playerId === t.ownerPlayerId)
          return el('div', { class: 'stat' },
            teamColorDot(t.colors),
            el('span', {}, full?.name ?? t.teamId),
            el('span', { class: 'value' }, owner ? `👤 ${owner.name}` : 'AI'),
            t.teamId === myTeamId ? el('span', { class: 'badge', style: 'background:rgba(63,163,77,.18);color:#3fa34d;margin-left:6px' }, 'YOUR TEAM') : null,
            t.ready ? el('span', { class: 'badge', style: 'background:rgba(53,104,212,.18);color:#3568d4;margin-left:6px' }, 'READY') : null,
          )
        }),
      ),
    )
    inner.appendChild(teamCard)
  }

  if (myTeam) {
    inner.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, `${myTeam.name} drivers`)),
      el('div', { class: 'card-body' },
        ...myTeam.driverIds.map((id) => {
          const d = champ.drivers[id]
          return el('div', { class: 'stat' },
            el('span', {}, driverNameMp(d, id)),
            el('span', { class: 'value' },
              d ? `${d.nationality} · morale ${d.dynamic.morale}` : ''),
          )
        }),
      ),
    ))
  }

  // Live action buttons
  if (race && (race.phase === 'race' || race.phase === 'qualifying')) {
    const actions = el('div', { style: 'display:flex;gap:10px;padding:12px 0' },
      el('button', { class: 'primary', onclick: () => (location.hash = '#/broadcast') }, 'Open 3D Broadcast'),
      el('button', { onclick: () => (location.hash = '#/standings') }, 'Standings'),
    )
    inner.appendChild(actions)
  }
  if (race?.phase === 'roundResults') {
    const actions = el('div', { style: 'display:flex;gap:10px;padding:12px 0' },
      el('button', { class: 'primary', onclick: () => mpSession.nextRound() }, 'Next round →'),
      el('button', { onclick: () => (location.hash = '#/results') }, 'Results'),
      el('button', { onclick: () => (location.hash = '#/standings') }, 'Standings'),
    )
    inner.appendChild(actions)
  }

  page.appendChild(inner)
  root.appendChild(page)
}

export function renderMultiplayerResults(root: HTMLElement) {
  root.innerHTML = ''
  const race = store.multi.race
  const champ = store.multi.championship
  const results = race?.results ?? []
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(mpHeader())
  if (!race) {
    inner.appendChild(el('div', { class: 'empty-state' }, 'Waiting for race results…'))
  } else {
    inner.appendChild(el('h2', {}, `Race results — Round ${champ?.currentRoundIndex !== undefined ? champ.currentRoundIndex + 1 : ''}`))
    if (race.qualifyingGrid && race.qualifyingGrid.length > 0) {
      const gridTable = el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Grid'), el('th', {}, 'Driver'), el('th', {}, 'Team'),
          el('th', { class: 'num' }, 'Q Lap time'),
        )),
      )
      const gb = el('tbody', {})
      for (const row of race.qualifyingGrid) {
        const driver = champ?.drivers[row.driverId]
        const team = champ?.teams.find((t) => t.driverIds.includes(row.driverId))
        gb.appendChild(el('tr', {},
          el('td', { class: 'num' }, String(row.gridPosition)),
          el('td', {}, driverNameMp(driver, row.driverId)),
          el('td', {}, team ? [teamColorDot(team.colors), team.shortName] : '—'),
          el('td', { class: 'num' }, `${row.lapTime.toFixed(3)}s`),
        ))
      }
      gridTable.appendChild(gb)
      inner.appendChild(el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('h3', {}, 'Qualifying grid')),
        el('div', { class: 'card-body' }, gridTable),
      ))
    }
    const podium = results.filter((r) => r.classified).slice(0, 3)
    if (podium.length > 0) {
      inner.appendChild(el('div', { class: 'grid cols-3' },
        ...podium.map((r, i) => {
          const driver = champ?.drivers[r.driverId]
          const team = champ?.teams.find((t) => t.id === r.teamId)
          return el('div', { class: 'card' },
            el('div', { class: 'card-body', style: 'text-align:center' },
              el('span', { class: `badge ${i === 0 ? 'yellow' : i === 1 ? 'grey' : 'red'}` }, ['🥇 P1', '🥈 P2', '🥉 P3'][i]),
              el('h3', {}, driverNameMp(driver, r.driverId)),
              el('div', { style: 'color:var(--text-2);font-size:12px' }, team?.name ?? ''),
              r.fastestLap ? el('span', { class: 'badge blue', style: 'margin-top:6px' }, 'Fastest Lap') : null,
            ),
          )
        }),
      ))
    }
    const table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', {}, 'Pos'), el('th', {}, 'Driver'), el('th', {}, 'Team'),
        el('th', { class: 'num' }, 'Pits'), el('th', { class: 'num' }, 'Pts'),
        el('th', {}, 'Status'),
      )),
    )
    const tb = el('tbody', {})
    const sorted = [...results].sort((a, b) => a.finishPosition - b.finishPosition)
    for (const r of sorted) {
      const driver = champ?.drivers[r.driverId]
      const team = champ?.teams.find((t) => t.id === r.teamId)
      const isMe = race.myTeamId === r.teamId
      tb.appendChild(el('tr', { class: isMe ? 'me' : '' },
        el('td', { class: 'num' }, r.classified ? String(r.finishPosition) : '—'),
        el('td', {}, driverNameMp(driver, r.driverId), r.fastestLap ? el('span', { class: 'badge blue', style: 'margin-left:8px' }, 'FL') : null),
        el('td', {}, team ? [teamColorDot(team.colors), team.shortName] : '—'),
        el('td', { class: 'num' }, String(r.pitStops)),
        el('td', { class: 'num', style: 'font-weight:700' }, String(r.points)),
        el('td', {}, r.dnfReason
          ? el('span', { class: 'badge red' }, `DNF — ${r.dnfReason}`)
          : el('span', { class: 'badge green' }, 'Classified')),
      ))
    }
    table.appendChild(tb)
    inner.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, 'Classification')),
      el('div', { class: 'card-body' }, table),
    ))
    inner.appendChild(el('div', { style: 'display:flex;justify-content:center;padding:10px 0;gap:12px' },
      el('button', { class: 'primary', onclick: () => (location.hash = '#/paddock') }, 'Paddock Post →'),
      el('button', { onclick: () => mpSession.nextRound() }, champ && champ.currentRoundIndex + 1 >= champ.totalRounds ? 'Complete season →' : 'Next round →'),
      el('button', { onclick: () => (location.hash = '#/standings') }, 'Standings'),
    ))
  }
  page.appendChild(inner)
  root.appendChild(page)
}

export function renderMultiplayerStandings(root: HTMLElement) {
  root.innerHTML = ''
  const race = store.multi.race
  const champ = store.multi.championship
  const standings = race?.standings
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(mpHeader())
  if (!standings || !champ) {
    inner.appendChild(el('div', { class: 'empty-state' }, 'Standings will appear after the first race finishes.'))
  } else {
    inner.appendChild(el('h2', {}, 'Championship standings'))
    const driverTable = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', {}, '#'), el('th', {}, 'Driver'), el('th', { class: 'num' }, 'Points'),
      )),
    )
    const dBody = el('tbody', {})
    standings.driverRows.forEach((row, i) => {
      const d = champ.drivers[row.driverId]
      dBody.appendChild(el('tr', {},
        el('td', { class: 'num' }, String(i + 1)),
        el('td', {}, driverNameMp(d, row.driverId)),
        el('td', { class: 'num', style: 'font-weight:700' }, String(row.points)),
      ))
    })
    driverTable.appendChild(dBody)
    inner.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, 'Drivers')),
      el('div', { class: 'card-body' }, driverTable),
    ))
    const teamTable = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', {}, '#'), el('th', {}, 'Team'), el('th', { class: 'num' }, 'Points'),
      )),
    )
    const tBody = el('tbody', {})
    standings.teamRows.forEach((row, i) => {
      const t = champ.teams.find((x) => x.id === row.teamId)
      tBody.appendChild(el('tr', {},
        el('td', { class: 'num' }, String(i + 1)),
        el('td', {}, t ? [teamColorDot(t.colors), t.name] : row.teamId),
        el('td', { class: 'num', style: 'font-weight:700' }, String(row.points)),
      ))
    })
    teamTable.appendChild(tBody)
    inner.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, 'Constructors')),
      el('div', { class: 'card-body' }, teamTable),
    ))
  }
  page.appendChild(inner)
  root.appendChild(page)
}

export function renderMultiplayerPaddock(root: HTMLElement) {
  root.innerHTML = ''
  const race = store.multi.race
  const champ = store.multi.championship
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })
  inner.appendChild(mpHeader())
  inner.appendChild(el('h2', {}, 'The Paddock Post'))
  if (!race || !champ) {
    inner.appendChild(el('div', { class: 'empty-state' }, 'Waiting for race…'))
  } else {
    const winner = race.results?.find((r) => r.finishPosition === 1)
    const winnerName = winner ? driverNameMp(champ.drivers[winner.driverId], winner.driverId) : '—'
    const winnerTeam = winner ? champ.teams.find((t) => t.id === winner.teamId)?.name ?? '' : ''
    inner.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, `Race ${champ.currentRoundIndex + 1} headline`)),
      el('div', { class: 'card-body' },
        el('h2', {}, `${winnerName} takes the win for ${winnerTeam}.`),
        el('p', { style: 'color:var(--text-1)' }, 'Authoritative results from the shared server.'),
      ),
    ))
    const stats = el('div', { class: 'grid cols-3' },
      stat('Retirements', String((race.results ?? []).filter((r) => !r.classified).length)),
      stat('Classified', String((race.results ?? []).filter((r) => r.classified).length)),
      stat('Total pit stops', String((race.results ?? []).reduce((s, r) => s + r.pitStops, 0))),
    )
    inner.appendChild(stats)
    inner.appendChild(el('div', { style: 'display:flex;justify-content:center;padding:14px 0' },
      el('button', { class: 'primary', onclick: () => mpSession.nextRound() }, 'Next round →'),
    ))
  }
  page.appendChild(inner)
  root.appendChild(page)
}

function stat(label: string, value: string) {
  return el('div', { class: 'card' },
    el('div', { class: 'card-body', style: 'text-align:center' },
      el('div', { class: 'mono', style: 'font-size:26px;font-weight:700' }, value),
      el('div', { style: 'color:var(--text-2);font-size:12px' }, label),
    ),
  )
}
