import { el } from './dom'
import { mpSession, type MultiplayerView } from '../client/multiplayer-session'
import type { LobbySnapshot } from '../client/multiplayer-client'

/**
 * Multiplayer lobby screen — wraps the MultiplayerSession view model.
 * All state comes from server snapshots; clients are not authoritative.
 *
 * The session is shared with the broadcast and other multiplayer views
 * (process-wide singleton), so a tab reload reconnects to the SAME
 * player via the persisted sessionToken.
 */

interface LobbyScreenState {
  view: MultiplayerView
  joinCode: string
  action: 'create' | 'join'
}

let root: HTMLElement | null = null
let state: LobbyScreenState | null = null

export function renderLobby(targetRoot: HTMLElement, initialAction: 'create' | 'join' = 'create') {
  root = targetRoot
  state = {
    view: mpSession.view,
    joinCode: '',
    action: initialAction,
  }

  const unsubscribe = mpSession.subscribe((v) => {
    if (!state) return
    state.view = v
    // If a `phaseChange` for race/management/qualifying arrives, the
    // broadcast should take over via app.ts's route.
    if (v.lobby && (v.lobby.phase === 'race' || v.lobby.phase === 'management' || v.lobby.phase === 'qualifying' || v.lobby.phase === 'roundResults' || v.lobby.phase === 'seasonComplete')) {
      if (location.hash.startsWith('#/lobby')) {
        const target = v.lobby.phase === 'race' || v.lobby.phase === 'qualifying'
          ? `#/broadcast`
          : v.lobby.phase === 'roundResults' || v.lobby.phase === 'seasonComplete'
            ? `#/results`
            : `#/hq`
        location.hash = target
      }
    }
    render()
  })

  // Connect — either create immediately or just open the WS and let the
  // user type a code to join an existing lobby.
  if (initialAction === 'create') {
    mpSession.createLobby().catch((e) => {
      if (!state) return
      // Surface the error to the screen
      console.error('createLobby failed', e)
    })
  } else {
    // Open the WebSocket but don't join yet — wait for the code.
    mpSession.openConnection().catch((e) => {
      if (!state) return
      console.error('openConnection failed', e)
    })
  }

  render()

  // Cleanup on unmount
  const observer = new MutationObserver(() => {
    if (root && !document.body.contains(root)) {
      unsubscribe()
      observer.disconnect()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

function render() {
  if (!root || !state) return
  const v = state.view
  root.innerHTML = ''
  const page = el('div', { class: 'page lobby-page' })
  const inner = el('div', { class: 'page-inner', style: 'max-width:1080px' })
  inner.appendChild(el('h2', {}, 'Multiplayer Lobby'))

  // Top: status + name
  const status = el('div', { class: 'lobby-status' })
  status.appendChild(el('span', { class: 'badge', style: `background:${statusColor(v.connection)};color:#fff` }, v.connection.toUpperCase()))
  if (v.error) {
    status.appendChild(el('span', { style: 'color:var(--bad);margin-left:8px' }, v.error))
  }
  status.appendChild(el('span', { style: 'flex:1' }))
  status.appendChild(el('label', { style: 'font-size:12px;color:var(--text-2)' }, 'Your name: '))
  const inp = el('input', { type: 'text', value: v.playerName, style: 'width:160px' }) as HTMLInputElement
  inp.addEventListener('change', () => { if (state) mpSession.setName(inp.value) })
  status.appendChild(inp)
  inner.appendChild(status)

  if (!v.joined) {
    // Pre-lobby: create / join controls
    if (v.connection === 'idle' || v.connection === 'connecting') {
      inner.appendChild(el('div', { class: 'empty-state' }, 'Connecting to server…'))
    } else {
      // Connection failed: show error prominently
      if (v.connection === 'error' || v.connection === 'offline') {
        const err = el('div', { class: 'card' },
          el('div', { class: 'card-body' },
            el('h3', { style: 'color:var(--bad)' }, 'Cannot reach multiplayer server'),
            el('p', { style: 'color:var(--text-1)' }, v.error || 'Make sure `npm run server` is running on port 8080.'),
            el('button', { onclick: () => location.reload() }, 'Retry'),
          ),
        )
        inner.appendChild(err)
      }
      const controls = el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 0' },
        el('button', { class: 'primary', onclick: () => mpSession.createLobby() }, 'Create Lobby'),
        el('span', {}, 'or join with code:'),
        (() => {
          const codeInp = el('input', { type: 'text', placeholder: 'ABC123', value: state.joinCode, style: 'text-transform:uppercase;width:120px;text-align:center' }) as HTMLInputElement
          codeInp.addEventListener('input', () => { if (state) state.joinCode = codeInp.value.toUpperCase().trim() })
          codeInp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && state?.joinCode) {
              mpSession.joinLobby(state.joinCode).catch((e) => console.error('joinLobby failed', e))
            }
          })
          return codeInp
        })(),
        el('button', { onclick: () => {
          if (state?.joinCode) mpSession.joinLobby(state.joinCode).catch((e) => console.error('joinLobby failed', e))
        } }, 'Join'),
        el('button', { class: 'ghost', onclick: async () => {
          const ok = await mpSession.restoreSession()
          if (!ok && state) {
            // ignore — user can still create/join
          }
        } }, 'Reconnect to last lobby'),
      )
      inner.appendChild(controls)
    }
  } else {
    const lobby: LobbySnapshot = v.lobby ?? {
      code: v.lobbyCode ?? '',
      phase: 'lobby',
      config: {},
      totalRounds: 5,
      currentRoundIndex: 0,
      players: v.joined ? [{ playerId: v.joined.playerId, name: v.playerName, connected: true, ready: false, teamId: undefined, sessionToken: v.joined.sessionToken }] : [],
      teams: [],
      hostPlayerId: v.joined.playerId,
      managementDeadline: 0,
      allReady: false,
    }
    const me = lobby.players.find((p) => p.playerId === v.joined?.playerId)
    const isHost = lobby.hostPlayerId === v.joined?.playerId

    // Code banner
    inner.appendChild(el('div', { class: 'lobby-code-banner' },
      el('span', { class: 'lobby-kicker' }, 'LOBBY CODE'),
      el('span', { class: 'lobby-code' }, lobby.code),
      el('span', { class: 'lobby-sub' }, 'Share this code so friends can join.'),
    ))

    // Phase indicator
    inner.appendChild(el('div', { class: 'lobby-phase' },
      el('span', {}, `Phase: ${lobby.phase}`),
      el('span', { style: 'margin-left:16px;color:var(--text-2)' },
        `Round ${lobby.currentRoundIndex + 1}`),
      el('span', { style: 'flex:1' }),
      el('span', { style: 'color:var(--text-2)' }, `${lobby.players.length} player${lobby.players.length === 1 ? '' : 's'}`),
    ))

    // Players list
    const playerBox = el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, 'Players')),
      el('div', { class: 'card-body' },
        ...lobby.players.map((p) =>
          el('div', { class: 'lobby-player' },
            el('span', { class: 'lobby-player-name' },
              p.name + (p.playerId === lobby.hostPlayerId ? ' (host)' : ''),
              me?.playerId === p.playerId ? el('span', { style: 'color:var(--accent-2);margin-left:6px' }, '· you') : null,
            ),
            el('span', { style: 'flex:1' }),
            p.ready ? el('span', { class: 'badge', style: 'background:rgba(63,163,77,.18);color:#3fa34d' }, 'READY') : null,
            !p.connected ? el('span', { class: 'badge', style: 'background:rgba(232,68,58,.18);color:#e8443a' }, 'OFFLINE') : null,
          ),
        ),
      ),
    )
    inner.appendChild(playerBox)

    // Team picker (lobby phase only)
    if (lobby.phase === 'lobby' && lobby.teams.length > 0) {
      const teams = lobby.teams
      const myTeamId = me?.teamId
      const teamGrid = el('div', { class: 'grid cols-3' },
        ...teams.map((t) => {
          const owner = lobby.players.find((p) => p.playerId === t.ownerPlayerId)
          const taken = !!owner
          const isMine = myTeamId === t.teamId
          return el('div', { class: 'card' },
            el('div', { class: 'card-body' },
              el('div', { class: 'team-dot', style: `background:${t.colors.primary};width:24px;height:24px;display:inline-block;border-radius:50%;margin-right:8px` }),
              el('h3', { style: 'display:inline-block' }, t.name),
              el('div', { style: 'color:var(--text-2);font-size:12px;margin-top:4px' }, owner ? `👤 ${owner.name}` : 'AI'),
              el('div', { style: 'padding-top:6px' },
                el('button', {
                  class: isMine ? '' : 'primary',
                  disabled: taken && !isMine,
                  onclick: () => mpSession.selectTeam(t.teamId),
                }, isMine ? 'Selected' : taken ? 'Taken' : 'Select'),
              ),
            ),
          )
        }),
      )
      inner.appendChild(teamGrid)
    }

    // Ready / start
    const actions = el('div', { style: 'display:flex;gap:10px;align-items:center;padding:12px 0' })
    const myReady = me?.ready ?? false
    actions.appendChild(el('button', {
      class: myReady ? '' : 'primary',
      onclick: () => mpSession.setReady(!myReady),
    }, myReady ? 'Unready' : 'Ready'))
    if (isHost) {
      actions.appendChild(el('button', {
        class: 'primary',
        onclick: () => mpSession.startChampionship(),
      }, 'Start Championship'))
    }
    actions.appendChild(el('span', { style: 'flex:1' }))
    if (lobby.allReady) {
      actions.appendChild(el('span', { class: 'badge', style: 'background:rgba(63,163,77,.18);color:#3fa34d' }, 'All ready — auto-lock when host starts'))
    }
    actions.appendChild(el('button', { class: 'ghost', onclick: () => { mpSession.leave(); location.hash = '#/' } }, 'Leave lobby'))
    inner.appendChild(actions)
  }

  page.appendChild(inner)
  root.appendChild(page)
}

function statusColor(s: MultiplayerView['connection']): string {
  switch (s) {
    case 'connected': return 'rgba(53,104,212,.5)'
    case 'connecting': return 'rgba(242,199,68,.35)'
    case 'reconnecting': return 'rgba(242,199,68,.35)'
    case 'in_lobby' as never: return 'rgba(63,163,77,.4)'
    case 'offline': return 'rgba(232,68,58,.6)'
    case 'error': return 'rgba(232,68,58,.6)'
    default: return 'rgba(63,163,77,.25)'
  }
}
