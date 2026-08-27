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

function broadcast(lobby: MultiplayerLobby, type: string, buildOrPayload?: ((viewer: ClientConn) => unknown) | object) {
  for (const conn of clients) {
    if (conn.lobbyCode === lobby.code) {
      const payload = typeof buildOrPayload === 'function' ? buildOrPayload(conn) : (buildOrPayload ?? {})
      send(conn, type, payload)
    }
  }
}

/** Full lobby state snapshot for clients. `viewerPlayerId` is used to
 *  surface that player's sessionToken (and only theirs) for reconnect. */
function lobbySnapshot(lobby: MultiplayerLobby, viewerPlayerId?: string) {
  return {
    code: lobby.code,
    phase: lobby.phase,
    config: lobby.config,
    totalRounds: lobby.championship?.rounds.length ?? lobby.config.rounds,
    currentRoundIndex: lobby.championship?.currentRoundIndex ?? 0,
    players: lobby.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      teamId: p.teamId,
      connected: p.connected,
      ready: p.ready,
      // Session token is only ever included for the viewer. Clients never
      // see another player's token. This is the durable identity used to
      // restore a connection after a tab reload.
      sessionToken: p.playerId === viewerPlayerId ? p.sessionToken : undefined,
    })),
    teams: lobby.championship
      ? lobby.championship.teams.map((t) => ({
          teamId: t.id, name: t.name, shortName: t.shortName, colors: t.colors,
          ownerPlayerId: lobby.teamStates.get(t.id)?.ownerPlayerId,
          ready: lobby.teamStates.get(t.id)?.ready ?? false,
        }))
      : lobby.availableTeams,
    hostPlayerId: lobby.hostPlayerId,
    managementDeadline: lobby.managementDeadline,
    allReady: lobby.allReady(),
  }
}

/** Compact championship summary so the client can render HQ / results /
 *  standings without simulating locally. */
function championshipSummary(lobby: MultiplayerLobby) {
  const champ = lobby.championship
  if (!champ) return null
  const round = champ.rounds[champ.currentRoundIndex]
  return {
    id: champ.id,
    name: champ.name,
    config: champ.config,
    currentRoundIndex: champ.currentRoundIndex,
    totalRounds: champ.rounds.length,
    circuit: round ? {
      id: round.circuitId,
      name: lobby.championship!.circuits.find((c) => c.id === round.circuitId)?.name ?? round.circuitId,
      country: lobby.championship!.circuits.find((c) => c.id === round.circuitId)?.country ?? '',
      laps: lobby.championship!.circuits.find((c) => c.id === round.circuitId)?.characteristics.laps ?? 0,
    } : null,
    teams: champ.teams.map((t) => ({
      id: t.id, name: t.name, shortName: t.shortName, colors: t.colors,
      reputation: t.reputation, money: t.money,
      driverIds: t.driverIds,
      isPlayerControlled: t.isPlayerControlled,
    })),
    drivers: Object.fromEntries(
      Object.entries(champ.drivers).map(([id, d]) => [
        id,
        {
          id, firstName: d.firstName, lastName: d.lastName,
          nationality: d.nationality,
          dynamic: { morale: d.dynamic.morale, confidence: d.dynamic.confidence, form: d.dynamic.form },
        },
      ]),
    ),
  }
}

function raceSnapshot(lobby: MultiplayerLobby, viewerPlayerId: string) {
  const engine = lobby.liveEngine
  const myTeam = lobby.teamStateOf(viewerPlayerId)
  const leader = engine?.orderedCars()[0]
  const champ = lobby.championship
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
    myPlayerId: viewerPlayerId,
    // Reveal-safe: only events at/below the cursor
    events: engine ? engine.events.filter((e) => e.t <= lobby.cursorSeconds + 3) : [],
    radio: engine ? engine.radioFeed.slice(-12) : [],
    cars: engine ? engine.orderedCars().map((c) => ({
      driverId: c.driverId, teamId: c.teamId, carNumber: c.carNumber, position: c.position,
      lap: c.lapsDone,
      // Track progress in 0..1 — derived from totalTime and the leader's
      // best lap so the client can place the car on the track even before
      // it crosses the start/finish line. (We expose this as a deterministic
      // function of totalTime, NOT future pre-computed positions.)
      trackProgress: c.totalTime,
      gapSeconds: c.totalTime - (leader?.totalTime ?? c.totalTime),
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
    // Pre-race metadata so the client can render the paddock post
    // / results screen without re-running qualifying locally.
    qualifyingGrid: champ
      ? champ.rounds[champ.currentRoundIndex]?.qualifyingResult?.rows.map((r) => ({
          driverId: r.driverId, gridPosition: r.gridPosition, lapTime: r.lapTime,
        })) ?? null
      : null,
    championship: championshipSummary(lobby),
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
      broadcast(lobby, 'lobbyState', (c) => lobbySnapshot(lobby, c.playerId))
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
      const res = host.join(conn.playerId, conn.name)
      send(conn, 'joined', { code: host.code, playerId: conn.playerId, sessionToken: res.sessionToken })
      broadcast(host, 'lobbyState', lobbySnapshot(host, conn.playerId))
      break
    }

    case 'joinLobby': {
      const code = String(p.code ?? '').toUpperCase()
      const target = lobbies.get(code)
      if (!target) { send(conn, 'error', { message: 'Lobby not found.' }); break }
      const res = target.join(conn.playerId, conn.name)
      if (!res.ok) { send(conn, 'error', { message: res.error }); break }
      conn.lobbyCode = target.code
      send(conn, 'joined', { code: target.code, playerId: conn.playerId, sessionToken: res.sessionToken })
      broadcast(target, 'lobbyState', lobbySnapshot(target, conn.playerId))
      break
    }

    case 'restoreSession': {
      // Client reconnects with its durable sessionToken + lobby code.
      const code = String(p.code ?? '').toUpperCase()
      const token = String(p.sessionToken ?? '')
      const target = lobbies.get(code)
      if (!target) { send(conn, 'error', { message: 'Lobby no longer exists.' }); break }
      const res = target.restoreByToken(token)
      if (!res.ok || !res.realPlayerId) { send(conn, 'error', { message: res.error ?? 'Restore failed.' }); break }
      // Swap our connection-local handle for the durable playerId so the
      // rest of the protocol uses the right identity.
      conn.playerId = res.realPlayerId
      conn.lobbyCode = code
      const owner = target.players.find((p) => p.playerId === res.realPlayerId)
      send(conn, 'joined', { code, playerId: res.realPlayerId, sessionToken: token, name: owner?.name })
      // Send the latest authoritative snapshot (lobby + race) so the
      // reconnecting client immediately has the same view as everyone else.
      send(conn, 'lobbyState', lobbySnapshot(target, res.realPlayerId))
      if (target.phase === 'race' || target.phase === 'qualifying' || target.phase === 'roundResults' || target.phase === 'seasonComplete') {
        send(conn, 'raceState', raceSnapshot(target, res.realPlayerId))
      } else {
        send(conn, 'phaseChange', { phase: target.phase, snapshot: lobbySnapshot(target, res.realPlayerId), championship: championshipSummary(target) })
      }
      broadcast(target, 'lobbyState', lobbySnapshot(target))
      break
    }

    case 'leaveLobby': {
      if (lobby) {
        lobby.disconnect(conn.playerId)
        conn.lobbyCode = undefined
        broadcast(lobby, 'lobbyState', (c) => lobbySnapshot(lobby, c.playerId))
      }
      break
    }

    case 'lobbyState': {
      if (lobby) send(conn, 'lobbyState', lobbySnapshot(lobby, conn.playerId))
      break
    }

    case 'updateConfig': {
      if (!lobby) break
      const res = lobby.updateConfig(conn.playerId, p.config as Partial<LobbyConfig>)
      if (!res.ok) send(conn, 'error', { message: res.error })
      else broadcast(lobby, 'lobbyState', (c) => lobbySnapshot(lobby, c.playerId))
      break
    }

    case 'selectTeam': {
      if (!lobby) break
      const res = lobby.selectTeam(conn.playerId, String(p.teamId))
      if (!res.ok) send(conn, 'error', { message: res.error })
      broadcast(lobby, 'lobbyState', (c) => lobbySnapshot(lobby, c.playerId))
      break
    }

    case 'setReady': {
      if (!lobby) break
      lobby.setReady(conn.playerId, Boolean(p.ready))
      broadcast(lobby, 'lobbyState', (c) => lobbySnapshot(lobby, c.playerId))
      break
    }

    case 'startChampionship': {
      if (!lobby) break
      const res = lobby.start(conn.playerId)
      if (!res.ok) { send(conn, 'error', { message: res.error }); break }
      broadcast(lobby, 'phaseChange', (c) => ({
        phase: lobby.phase,
        snapshot: lobbySnapshot(lobby, c.playerId),
        championship: championshipSummary(lobby),
      }))
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
      broadcast(lobby, 'lobbyState', (c) => lobbySnapshot(lobby, c.playerId))
      // Auto-lock when everyone is ready
      if (lobby.allReady()) {
        lobby.lockAndQualify()
        broadcast(lobby, 'raceStart', (c) => raceSnapshot(lobby, c.playerId))
      }
      break
    }

    case 'requestRaceState': {
      if (!lobby) break
      if (lobby.phase === 'race' || lobby.phase === 'roundResults' || lobby.phase === 'seasonComplete') {
        send(conn, 'raceState', raceSnapshot(lobby, conn.playerId))
      } else {
        send(conn, 'phaseChange', {
          phase: lobby.phase,
          snapshot: lobbySnapshot(lobby, conn.playerId),
          championship: championshipSummary(lobby),
        })
      }
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
        broadcast(lobby, 'phaseChange', (c) => ({
          phase: lobby.phase,
          outcome,
          snapshot: lobbySnapshot(lobby, c.playerId),
          championship: championshipSummary(lobby),
        }))
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
        broadcast(lobby, 'raceStart', (c) => raceSnapshot(lobby, c.playerId))
      }
    } else if (lobby.phase === 'race') {
      const before = lobby.liveEngine?.state.simTime ?? 0
      const res = lobby.tick(dt)
      if (res.lapEvents > 0 || lobby.liveEngine?.isFinished()) {
        broadcast(lobby, 'raceState', (c) => raceSnapshot(lobby, c.playerId))
      }
      void before
      if (res.finished) {
        broadcast(lobby, 'raceComplete', (c) => raceSnapshot(lobby, c.playerId))
        broadcast(lobby, 'lobbyState', (c) => lobbySnapshot(lobby, c.playerId))
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
