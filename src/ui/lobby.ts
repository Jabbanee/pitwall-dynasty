import { el } from './dom'
import { MultiplayerClient, type LobbySnapshot } from '../client/multiplayer-client'

/**
 * Multiplayer lobby screen — create or join a Fast Championship lobby.
 * Renders directly from server snapshots; clients are not authoritative.
 */

interface LobbyScreenState {
  client: MultiplayerClient
  lobby: LobbySnapshot | null
  myPlayerId: string
  myName: string
  joinCode: string
  selectedTeamId: string | null
  ready: boolean
  status: 'connecting' | 'connected' | 'hosting' | 'joining' | 'in_lobby' | 'error'
  errorMsg: string
}

let state: LobbyScreenState | null = null
let root: HTMLElement | null = null

export function renderLobby(targetRoot: HTMLElement, initialAction: 'create' | 'join' = 'create') {
  root = targetRoot
  state = {
    client: new MultiplayerClient(),
    lobby: null,
    myPlayerId: '',
    myName: localStorage.getItem('pitwall-dynasty.playerName') ?? `Player-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    joinCode: '',
    selectedTeamId: null,
    ready: false,
    status: 'connecting',
    errorMsg: '',
  }
  // Stash name
  localStorage.setItem('pitwall-dynasty.playerName', state.myName)

  state.client.on('*', (p) => {
    const ev = p as { type: string; payload: unknown }
    if (ev.type === 'welcome') {
      const payload = ev.payload as { playerId: string }
      if (state) state.myPlayerId = payload.playerId
    } else if (ev.type === 'joined') {
      if (state) state.status = 'in_lobby'
    } else if (ev.type === 'lobbyState') {
      if (state) state.lobby = ev.payload as LobbySnapshot
    } else if (ev.type === 'error') {
      if (state) {
        state.status = 'error'
        state.errorMsg = (ev.payload as { message: string }).message
      }
    } else if (ev.type === 'phaseChange') {
      const pl = ev.payload as { phase: string }
      if (pl.phase === 'race' || pl.phase === 'management') {
        // Navigate to broadcast with the lobby code
        if (state?.lobby) {
          location.hash = `#/broadcast?code=${state.lobby.code}`
        }
      } else if (pl.phase === 'roundResults' || pl.phase === 'seasonComplete') {
        if (state?.lobby) {
          location.hash = `#/results?code=${state.lobby.code}`
        }
      }
    }
    render()
  })

  // Connect, then run the action
  state.client.connect('ws://localhost:8080').then(() => {
    if (!state) return
    state.status = 'connected'
    state.client.setName(state.myName)
    if (initialAction === 'create') {
      // Tiny delay so setName is processed first
      setTimeout(() => state?.client.createLobby(), 80)
    }
    render()
  }).catch((e: Error) => {
    if (!state) return
    state.status = 'error'
    state.errorMsg = e.message
    render()
  })

  render()
}

function render() {
  if (!root || !state) return
  const s: LobbyScreenState = state
  root.innerHTML = ''
  const page = el('div', { class: 'page lobby-page' })
  const inner = el('div', { class: 'page-inner', style: 'max-width:1080px' })
  inner.appendChild(el('h2', {}, 'Multiplayer Lobby'))

  // Top: status + name
  const status = el('div', { class: 'lobby-status' })
  status.appendChild(el('span', { class: 'badge', style: `background:${statusColor(s.status)};color:#fff` }, statusLabel(s.status)))
  if (s.status === 'error') {
    status.appendChild(el('span', { style: 'color:var(--bad);margin-left:8px' }, s.errorMsg))
  }
  status.appendChild(el('span', { style: 'flex:1' }))
  status.appendChild(el('label', { style: 'font-size:12px;color:var(--text-2)' }, 'Your name: '))
  const inp = el('input', { type: 'text', value: s.myName, style: 'width:160px' }) as HTMLInputElement
  inp.addEventListener('change', () => {
    if (!state) return
    state.myName = inp.value.trim() || state.myName
    localStorage.setItem('pitwall-dynasty.playerName', state.myName)
    state.client.setName(state.myName)
  })
  status.appendChild(inp)
  inner.appendChild(status)

  if (!s.lobby) {
    // Pre-lobby: create / join controls
    if (s.status === 'connecting') {
      inner.appendChild(el('div', { class: 'empty-state' }, 'Connecting to server…'))
    } else if (s.status === 'hosting' || s.status === 'joining') {
      inner.appendChild(el('div', { class: 'empty-state' }, s.status === 'hosting' ? 'Creating lobby…' : 'Joining…'))
    } else {
      // Connected (or error): show create / join controls
      const controls = el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 0' },
        el('button', { class: 'primary', onclick: () => {
          if (!state) return
          state.client.createLobby()
          state.status = 'hosting'
          render()
        } }, 'Create Lobby'),
        el('span', {}, 'or join with code:'),
        (() => {
          const inp = el('input', { type: 'text', placeholder: 'ABC123', value: s.joinCode, style: 'text-transform:uppercase;width:120px;text-align:center' }) as HTMLInputElement
          inp.addEventListener('input', () => { if (state) state.joinCode = inp.value.toUpperCase().trim() })
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && state?.joinCode) {
              state.status = 'joining'
              state.client.joinLobby(state.joinCode)
              render()
            }
          })
          return inp
        })(),
        el('button', { onclick: () => {
          if (!state || !state.joinCode) return
          state.status = 'joining'
          state.client.joinLobby(state.joinCode)
          render()
        } }, 'Join'),
      )
      inner.appendChild(controls)
    }
  } else {
    // In-lobby: show code, players, teams, ready/start
    const lobby = s.lobby
    const me = lobby.players.find((p: { playerId: string }) => p.playerId === s.myPlayerId)
    const isHost = lobby.hostPlayerId === s.myPlayerId

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
        ...lobby.players.map((p: { playerId: string; name: string; connected: boolean; ready: boolean }) =>
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

    // Ready / start
    const actions = el('div', { style: 'display:flex;gap:10px;align-items:center;padding:12px 0' })
    const myReady = me?.ready ?? false
    actions.appendChild(el('button', {
      class: myReady ? '' : 'primary',
      onclick: () => { if (state) state.client.setReady(!myReady) },
    }, myReady ? 'Unready' : 'Ready'))
    if (isHost && state) {
      actions.appendChild(el('button', {
        class: 'primary',
        onclick: () => { if (state) state.client.startChampionship() },
      }, 'Start Championship'))
    }
    actions.appendChild(el('span', { style: 'flex:1' }))
    if (lobby.allReady) {
      actions.appendChild(el('span', { class: 'badge', style: 'background:rgba(63,163,77,.18);color:#3fa34d' }, 'All ready — auto-lock when host starts'))
    }
    inner.appendChild(actions)
  }

  page.appendChild(inner)
  root.appendChild(page)
}

function statusColor(s: LobbyScreenState['status']): string {
  switch (s) {
    case 'connected': return 'rgba(53,104,212,.5)'
    case 'hosting':
    case 'joining': return 'rgba(242,199,68,.35)'
    case 'in_lobby': return 'rgba(63,163,77,.4)'
    case 'error': return 'rgba(232,68,58,.6)'
    default: return 'rgba(63,163,77,.25)'
  }
}

function statusLabel(s: LobbyScreenState['status']): string {
  switch (s) {
    case 'connecting': return 'CONNECTING'
    case 'connected': return 'CONNECTED'
    case 'hosting': return 'CREATING…'
    case 'joining': return 'JOINING…'
    case 'in_lobby': return 'IN LOBBY'
    case 'error': return 'ERROR'
  }
}
