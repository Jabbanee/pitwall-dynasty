import { el, fmtLapTime } from './dom'
import { store } from '../state/store'
import { teamColorDot, driverName } from './hq'

/** Round results screen after the broadcast. */

export function renderResults(root: HTMLElement) {
  const champ = store.champ!
  const round = champ.rounds[champ.currentRoundIndex]
  const result = round?.raceResult
  root.innerHTML = ''

  if (!result) {
    root.appendChild(el('div', { class: 'page' }, el('div', { class: 'empty-state' }, 'No race results yet.')))
    return
  }

  const circuit = champ.circuits.find((c) => c.id === round.circuitId)!
  const page = el('div', { class: 'page' })
  const inner = el('div', { class: 'page-inner' })

  inner.appendChild(el('h2', {}, `Race ${round.index + 1} Results — ${circuit.name}`))

  // Podium summary
  const podium = result.results.filter((r) => r.classified).slice(0, 3)
  inner.appendChild(
    el('div', { class: 'grid cols-3' },
      ...podium.map((r, i) => {
        const team = champ.teams.find((t) => t.id === r.teamId)
        return el('div', { class: 'card' },
          el('div', { class: 'card-body', style: 'align-items:center;text-align:center' },
            el('span', { class: `badge ${i === 0 ? 'yellow' : i === 1 ? 'grey' : 'red'}` }, ['🥇 P1', '🥈 P2', '🥉 P3'][i]),
            el('h3', {}, driverName(champ, r.driverId)),
            el('div', { style: 'color:var(--text-2);font-size:12px' }, team?.name ?? ''),
            r.fastestLap ? el('span', { class: 'badge blue', style: 'margin-top:6px' }, 'Fastest Lap') : null,
          ),
        )
      }),
    ),
  )

  // Full classification
  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Pos'), el('th', {}, 'Driver'), el('th', {}, 'Team'),
      el('th', { class: 'num' }, 'Grid'), el('th', { class: 'num' }, 'Laps'),
      el('th', { class: 'num' }, 'Best lap'), el('th', { class: 'num' }, 'Pits'),
      el('th', { class: 'num' }, 'Pts'), el('th', {}, 'Status'),
    )),
  )
  const tb = el('tbody', {})
  for (const r of result.results) {
    const team = champ.teams.find((t) => t.id === r.teamId)
    const isMe = team?.id === champ.playerTeamId
    tb.appendChild(
      el('tr', { class: isMe ? 'me' : '' },
        el('td', { class: 'num' }, r.classified ? String(r.finishPosition) : '—'),
        el('td', {}, driverName(champ, r.driverId), r.fastestLap ? el('span', { class: 'badge blue', style: 'margin-left:8px' }, 'FL') : null),
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
  inner.appendChild(el('div', { class: 'card' }, table))

  // Timeline highlights
  const highlights = result.events.filter((e) =>
    ['overtake', 'retirement', 'safetyCar', 'leadChange', 'weatherChange'].includes(e.type))
  inner.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Key Moments'),
      el('button', { class: 'small', onclick: () => (location.hash = '#/broadcast') }, 'Rewatch broadcast')),
    el('div', { class: 'card-body', style: 'max-height:260px;overflow-y:auto' },
      highlights.length === 0 ? el('div', { class: 'empty-state' }, 'A quiet race.') :
        highlights.map((e) => el('div', { class: 'stat' },
          el('span', {}, e.detail),
          el('span', { class: 'value', style: 'color:var(--text-2)' }, `${Math.floor(e.t / 60)}:${String(Math.floor(e.t % 60)).padStart(2, '0')}`)),
        ),
    ),
  ))

  // Continue button
  inner.appendChild(
    el('div', { style: 'display:flex;justify-content:center;padding:10px 0;gap:12px' },
      el('button', {
        class: 'primary',
        onclick: () => { location.hash = '#/paddock' },
      }, 'Open Paddock Post →'),
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
