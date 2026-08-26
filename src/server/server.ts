import { WebSocketServer, WebSocket } from 'ws'
import { MultiplayerLobby, DEFAULT_LOBBY_CONFIG, type LobbyConfig } from './multiplayer-server'

/**
 * WebSocket transport for the authoritative multiplayer server.
 * Protocol: JSON messages { type, payload }. The server validates every
 * action against lobby state — clients are never authoritative.
 */

interface ClientConn {
  ws: WebSocket
  playerId: string
  name: string
  lobbyCode?: string
}

const PORT = Number(process.env.PORT ?? 8080)

const lobbies = new Map<string, MultiplayerLobby>()
const clients = new Set<ClientConn>()

function send(conn: ClientConn, type: string, payload: unknown = {}) {
  if (conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(JSON.stringify({ type, payload }))
  }
}

function broadcast(lobby: MultiplayerLobby, type: string, payload: unknown = {}) {
  for (const conn of clients) {
    if (conn.lobbyCode === lobby.code) send(conn, type, payload)
  }
}

/** Full lobby state snapshot for clients. */
function lobbySnapshot(lobby: MultiplayerLobby) {
  return {
    code: lobby.code,
    phase: lobby.phase,
    config: lobby.config,
    players: lobby.players.map((p) => ({
      playerId: p.playerId, name: p.name, teamId: p.teamId, connected: p.connected, ready: p.ready,
    })),
    teams: lobby.championship
      ? lobby.championship.teams.map((t) => ({
          teamId: t.id, name: t.name, shortName: t.shortName, colors: t.colors,
          ownerPlayerId: lobby.teamStates.get(t.id)?.ownerPlayerId,
          ready: lobby.teamStates.get(t.id)?.ready ?? false,
        }))
      : [],
    hostPlayerId: lobby.hostPlayerId,
    currentRoundIndex: lobby.championship?.currentRoundIndex ?? 0,
    managementDeadline: lobby.managementDeadline,
    allReady: lobby.allReady(),
  }
}

function raceSnapshot(lobby: MultiplayerLobby, viewerPlayerId: string) {
  const engine = lobby.liveEngine
  const myTeam = lobby.teamStateOf(viewerPlayerId)
  return {
    phase: lobby.phase,
    cursorSeconds: lobby.cursorSeconds,
    speed: lobby.liveSpeed,
    paused: lobby.livePaused,
    replayActive: lobby.replayActive,
    vote: lobby.activeVote ? {
      kind: lobby.activeVote.kind, payload: lobby.activeVote.payload,
      votesFor: lobby.activeVote.votesFor.length, votesAgainst: lobby.activeVote.votesAgainst.length,
      expiresAt: lobby.activeVote.expiresAt,
    } : null,
    myTeamId: myTeam?.teamId,
    // Reveal-safe: only events at/below the cursor
    events: engine ? engine.events.filter((e) => e.t <= lobby.cursorSeconds + 3) : [],
    radio: engine ? engine.radioFeed.slice(-12) : [],
    cars: engine ? engine.orderedCars().map((c) => ({
      driverId: c.driverId, teamId: c.teamId, carNumber: c.carNumber, position: c.position,
      lap: c.lapsDone, gapSeconds: c.totalTime - (engine.orderedCars()[0]?.totalTime ?? c.totalTime),
      tyre: c.tyre, tyreAge: c.tyreAge, tyreWear: Math.round(c.tyreWear * 100) / 100,
      pitStops: c.pitStops, paceMode: c.strategy.paceMode, energy: c.strategy.energy,
      damage: Math.round(c.damage * 100) / 100,
      pitThisLap: c.pitThisLap || c.pitNextLap,
      retired: c.retired, finished: c.finished,
      isMyTeam: c.teamId === myTeam?.teamId,
    })) : [],
    leaderLap: engine?.state.leaderLap ?? 0,
    totalLaps: engine?.state.totalLaps ?? 0,
    trackWetness: engine?.state.trackWetness ?? 0,
    condition: engine?.state.condition ?? 'dry',
    results: lobby.roundResults,
    standings: lobby.phase === 'roundResults' || lobby.phase === 'seasonComplete' ? lobby.standings() : undefined,
  }
}

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  const conn: ClientConn = { ws, playerId: `p.${Math.random().toString(36).slice(2, 10)}`, name: 'Player' }
  clients.add(conn)
  send(conn, 'welcome', { playerId: conn.playerId })

  ws.on('message', (raw) => {
    let msg: { type: string; payload?: Record<string, unknown> }
    try {
      msg = JSON.parse(String(raw))
    } catch {
      send(conn, 'error', { message: 'Malformed message.' })
      return
    }
    handle(conn, msg.type, msg.payload ?? {})
  })

  ws.on('close', () => {
    clients.delete(conn)
    const lobby = conn.lobbyCode ? lobbies.get(conn.lobbyCode) : undefined
    if (lobby) {
      lobby.disconnect(conn.playerId)
      broadcast(lobby, 'lobbyState', lobbySnapshot(lobby))
    }
  })
})

function handle(conn: ClientConn, type: string, p: Record<string, unknown>) {
  const lobby = conn.lobbyCode ? lobbies.get(conn.lobbyCode) : undefined

  switch (type) {
    case 'setName':
      conn.name = String(p.name ?? 'Player').slice(0, 24)
      send(conn, 'named', { name: conn.name })
      break

    case 'createLobby': {
      const host = new MultiplayerLobby(conn.playerId)
      if (p.config) host.config = { ...DEFAULT_LOBBY_CONFIG, ...(p.config as Partial<LobbyConfig>) }
      lobbies.set(host.code, host)
      conn.lobbyCode = host.code
      host.join(conn.playerId, conn.name)
      send(conn, 'joined', { code: host.code, playerId: conn.playerId })
      broadcast(host, 'lobbyState', lobbySnapshot(host))
      break
    }

    case 'joinLobby': {
      const code = String(p.code ?? '').toUpperCase()
      const target = lobbies.get(code)
      if (!target) { send(conn, 'error', { message: 'Lobby not found.' }); break }
      const res = target.join(conn.playerId, conn.name)
      if (!res.ok) { send(conn, 'error', { message: res.error }); break }
      conn.lobbyCode = target.code
      send(conn, 'joined', { code: target.code, playerId: conn.playerId })
      broadcast(target, 'lobbyState', lobbySnapshot(target))
      break
    }

    case 'leaveLobby': {
      if (lobby) {
        lobby.disconnect(conn.playerId)
        conn.lobbyCode = undefined
        broadcast(lobby, 'lobbyState', lobbySnapshot(lobby))
      }
      break
    }

    case 'lobbyState': {
      if (lobby) send(conn, 'lobbyState', lobbySnapshot(lobby))
      break
    }

    case 'updateConfig': {
      if (!lobby) break
      const res = lobby.updateConfig(conn.playerId, p.config as Partial<LobbyConfig>)
      if (!res.ok) send(conn, 'error', { message: res.error })
      else broadcast(lobby, 'lobbyState', lobbySnapshot(lobby))
      break
    }

    case 'selectTeam': {
      if (!lobby) break
      const res = lobby.selectTeam(conn.playerId, String(p.teamId))
      if (!res.ok) send(conn, 'error', { message: res.error })
      broadcast(lobby, 'lobbyState', lobbySnapshot(lobby))
      break
    }

    case 'setReady': {
      if (!lobby) break
      lobby.setReady(conn.playerId, Boolean(p.ready))
      broadcast(lobby, 'lobbyState', lobbySnapshot(lobby))
      break
    }

    case 'startChampionship': {
      if (!lobby) break
      const res = lobby.start(conn.playerId)
      if (!res.ok) { send(conn, 'error', { message: res.error }); break }
      broadcast(lobby, 'phaseChange', { phase: lobby.phase, snapshot: lobbySnapshot(lobby) })
      break
    }

    case 'updateStrategy': {
      if (!lobby) break
      const res = lobby.updateStrategy(conn.playerId, p.strategy as never, p.setup as never)
      if (!res.ok) send(conn, 'error', { message: res.error })
      break
    }

    case 'readyTeam': {
      if (!lobby) break
      const res = lobby.readyTeam(conn.playerId, Boolean(p.ready))
      if (!res.ok) send(conn, 'error', { message: res.error })
      broadcast(lobby, 'lobbyState', lobbySnapshot(lobby))
      // Auto-lock when everyone is ready
      if (lobby.allReady()) {
        lobby.lockAndQualify()
        broadcast(lobby, 'raceStart', raceSnapshot(lobby, conn.playerId))
      }
      break
    }

    case 'requestRaceState': {
      if (lobby && lobby.phase === 'race') send(conn, 'raceState', raceSnapshot(lobby, conn.playerId))
      else if (lobby) send(conn, 'phaseChange', { phase: lobby.phase, snapshot: lobbySnapshot(lobby) })
      break
    }

    case 'liveCommand': {
      if (!lobby) break
      const res = lobby.sendLiveCommand(conn.playerId, p.cmd as never)
      broadcast(lobby, 'radioResponse', {
        playerId: conn.playerId, ok: res.ok, response: res.response, deferred: res.deferred,
        driverId: (p.cmd as { driverId?: string })?.driverId,
      })
      break
    }

    case 'vote': {
      if (!lobby) break
      const kind = String(p.kind) as 'speed' | 'pause' | 'rewind'
      const payload = Number(p.payload ?? 0)
      if (p.support !== undefined) {
        lobby.castVote(conn.playerId, Boolean(p.support))
      } else {
        const res = lobby.requestVote(conn.playerId, kind, payload)
        if (!res.ok) send(conn, 'error', { message: res.error })
      }
      broadcast(lobby, 'voteState', { vote: lobby.activeVote, speed: lobby.liveSpeed, paused: lobby.livePaused })
      break
    }

    case 'resumeLive': {
      if (!lobby) break
      lobby.resumeLive()
      broadcast(lobby, 'replayEnded', { cursorSeconds: lobby.cursorSeconds })
      break
    }

    case 'nextRound': {
      if (!lobby) break
      // Host or anyone after results — server decides validity
      if (lobby.phase === 'roundResults') {
        const outcome = lobby.nextRound()
        broadcast(lobby, 'phaseChange', { phase: lobby.phase, outcome, snapshot: lobbySnapshot(lobby) })
      }
      break
    }

    case 'listLobbies': {
      send(conn, 'lobbyList', {
        lobbies: [...lobbies.values()].filter((l) => l.phase === 'lobby').map((l) => ({
          code: l.code, players: l.players.length, teamCount: l.config.teamCount, host: l.hostPlayerId,
        })),
      })
      break
    }

    default:
      send(conn, 'error', { message: `Unknown message type: ${type}` })
  }
}

// ----- Server tick: management timers + live race stepping -----

const TICK_MS = 100
setInterval(() => {
  const dt = TICK_MS / 1000
  for (const lobby of lobbies.values()) {
    if (lobby.phase === 'management') {
      if (lobby.managementExpired()) {
        lobby.lockAndQualify()
        broadcast(lobby, 'raceStart', raceSnapshot(lobby, lobby.hostPlayerId))
      }
    } else if (lobby.phase === 'race') {
      const before = lobby.liveEngine?.state.simTime ?? 0
      const res = lobby.tick(dt)
      if (res.lapEvents > 0 || lobby.liveEngine?.isFinished()) {
        broadcast(lobby, 'raceState', raceSnapshot(lobby, lobby.hostPlayerId))
      }
      void before
      if (res.finished) {
        broadcast(lobby, 'raceComplete', raceSnapshot(lobby, lobby.hostPlayerId))
      }
    }
  }
}, TICK_MS)

// Vote expiry sweep
setInterval(() => {
  for (const lobby of lobbies.values()) {
    if (lobby.activeVote && Date.now() > lobby.activeVote.expiresAt) {
      lobby.castVote('', false) // triggers evaluation/timeout path
      if (lobby.activeVote) lobby.activeVote = null
      broadcast(lobby, 'voteState', { vote: null, speed: lobby.liveSpeed, paused: lobby.livePaused })
    }
  }
}, 1000)

console.log(`Pitwall Dynasty multiplayer server listening on ws://localhost:${PORT}`)
