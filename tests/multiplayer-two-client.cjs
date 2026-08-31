// Two-client smoke test using raw WebSocket clients.
// Verifies the authoritative server drives both clients identically.
//
// Run with: node tests/multiplayer-two-client.cjs
// Requires the multiplayer server running on ws://localhost:8080.

const WebSocket = require('ws')

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:8080')
    let playerId = null
    let sessionToken = null
    const state = { playerId: null, joined: null, lobby: null, race: null, championship: null }
    const onHandlers = {}

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw))
        if (msg.type === 'welcome') {
          playerId = msg.payload.playerId
          state.playerId = playerId
        } else if (msg.type === 'joined') {
          sessionToken = msg.payload.sessionToken
          state.joined = msg.payload
        } else if (msg.type === 'lobbyState') {
          state.lobby = msg.payload
        } else if (msg.type === 'raceState' || msg.type === 'raceStart' || msg.type === 'raceComplete') {
          state.race = msg.payload
          if (msg.payload?.championship) state.championship = msg.payload.championship
        } else if (msg.type === 'phaseChange') {
          if (msg.payload?.snapshot) state.lobby = msg.payload.snapshot
          if (msg.payload?.championship) state.championship = msg.payload.championship
        }
        if (onHandlers[msg.type]) for (const h of onHandlers[msg.type]) h(msg.payload)
        if (onHandlers['*']) for (const h of onHandlers['*']) h(msg)
      } catch {}
    })

    ws.on('open', () => resolve({ ws, state, onHandlers, getPlayerId: () => playerId, getToken: () => sessionToken }))
    ws.on('error', reject)
  })
}

function send(ws, type, payload = {}) {
  ws.send(JSON.stringify({ type, payload }))
}

function waitFor(state, onHandlers, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for condition: ${predicate.toString().slice(0, 100)}`)), timeoutMs)
    const checkAndResolve = () => {
      try {
        if (predicate(state)) {
          clearTimeout(t)
          resolve(state)
          return true
        }
      } catch {}
      return false
    }
    if (checkAndResolve()) return
    const handler = () => { if (checkAndResolve()) onHandlers['*'] = (onHandlers['*'] || []).filter((h) => h !== handler) }
    onHandlers['*'] = (onHandlers['*'] || []).concat(handler)
  })
}

async function main() {
  console.log('=== Pitwall Dynasty two-client smoke test ===')

  // Host
  const host = await connect()
  send(host.ws, 'setName', { name: 'Host' })
  send(host.ws, 'createLobby')
  await waitFor(host.state, host.onHandlers, (s) => !!s.joined && !!s.lobby && s.lobby.code.length === 6)
  const code = host.state.joined.code
  console.log('Host created lobby', code)
  send(host.ws, 'selectTeam', { teamId: 'base.team.titan' })
  send(host.ws, 'setReady', { ready: true })

  // Joiner
  const joiner = await connect()
  send(joiner.ws, 'setName', { name: 'Joiner' })
  send(joiner.ws, 'joinLobby', { code })
  await waitFor(joiner.state, joiner.onHandlers, (s) => !!s.joined && s.joined.code === code)
  console.log('Joiner joined lobby', code)
  send(joiner.ws, 'selectTeam', { teamId: 'base.team.aquila' })
  send(joiner.ws, 'setReady', { ready: true })

  // Wait until both clients see the same lobby with allReady
  // First start the championship
  send(host.ws, 'startChampionship')
  await waitFor(host.state, host.onHandlers, (s) => s.lobby && s.lobby.phase === 'management')
  await waitFor(joiner.state, joiner.onHandlers, (s) => s.lobby && s.lobby.phase === 'management')
  console.log('Both clients see management phase')

  // Both should be ready in the same championship
  if (host.state.championship?.id !== joiner.state.championship?.id) {
    throw new Error('Championship IDs differ between clients!')
  }
  console.log('Shared championship:', host.state.championship.id)
  console.log('Shared circuit:', host.state.championship.circuit?.id, 'laps:', host.state.championship.circuit?.laps)

  // Send readyTeam in management phase
  send(host.ws, 'readyTeam', { ready: true })
  send(joiner.ws, 'readyTeam', { ready: true })

  // Wait for race to start (auto-lock from allReady)
  await waitFor(host.state, host.onHandlers, (s) => s.race && s.race.phase === 'race', 15000)
  await waitFor(joiner.state, joiner.onHandlers, (s) => s.race && s.race.phase === 'race', 15000)
  console.log('Both clients see race phase, leaderLap=', host.state.race.leaderLap, 'joiner lap=', joiner.state.race.leaderLap)

  // Live command: joiner sends PACE_PUSH to own driver
  const aquilaDriver = host.state.championship.teams.find((t) => t.id === 'base.team.aquila').driverIds[0]
  send(joiner.ws, 'liveCommand', { cmd: { teamId: 'base.team.aquila', driverId: aquilaDriver, command: 'PACE_PUSH' } })
  // wait a few ticks
  await new Promise((r) => setTimeout(r, 1000))
  // Both should still have the same leader lap and same car states
  const hostCar = host.state.race.cars.find((c) => c.driverId === aquilaDriver)
  const joinerCar = joiner.state.race.cars.find((c) => c.driverId === aquilaDriver)
  if (!hostCar || !joinerCar) throw new Error('Aquila car missing from one of the clients')
  if (hostCar.position !== joinerCar.position || hostCar.lap !== joinerCar.lap) {
    throw new Error(`Car state differs: host P${hostCar.position} L${hostCar.lap} vs joiner P${joinerCar.position} L${joinerCar.lap}`)
  }
  console.log(`Aquila driver ${aquilaDriver.slice(-5)}: P${hostCar.position} L${hostCar.lap} pace=${hostCar.paceMode} (same on both clients)`)

  // Test unauthorised command: host tries to command Aquila
  const titanDriver = host.state.championship.teams.find((t) => t.id === 'base.team.titan').driverIds[0]
  send(host.ws, 'liveCommand', { cmd: { teamId: 'base.team.aquila', driverId: aquilaDriver, command: 'PACE_ATTACK' } })
  // No error event will fire, but the command should not affect Aquila
  await new Promise((r) => setTimeout(r, 500))
  const hostCar2 = host.state.race.cars.find((c) => c.driverId === aquilaDriver)
  if (hostCar2.paceMode === 'attack') {
    throw new Error('UNAUTHORISED: host managed to set Aquila driver to ATTACK!')
  }
  console.log('Unauthorised command rejected (Aquila paceMode still', hostCar2.paceMode, ')')

  // Vote for 2x
  send(host.ws, 'vote', { kind: 'speed', payload: 2 })
  send(joiner.ws, 'vote', { kind: 'speed', payload: 2 })
  await new Promise((r) => setTimeout(r, 800))
  if (host.state.race.speed !== 2 || joiner.state.race.speed !== 2) {
    throw new Error(`Speed vote failed: host=${host.state.race.speed} joiner=${joiner.state.race.speed}`)
  }
  console.log('Vote 2x applied on both clients')

  // Force-finish the race by waiting (the test is bounded to 90s)
  console.log('Waiting for race to complete (up to 90s at 2x)...')
  await waitFor(host.state, host.onHandlers, (s) => s.race && s.race.phase === 'roundResults', 90000)
  await waitFor(joiner.state, joiner.onHandlers, (s) => s.race && s.race.phase === 'roundResults', 90000)
  console.log('Both clients see roundResults')

  // Compare finishing order
  const hostOrder = (host.state.race.results || []).map((r) => r.driverId).join(',')
  const joinerOrder = (joiner.state.race.results || []).map((r) => r.driverId).join(',')
  if (hostOrder !== joinerOrder) {
    throw new Error('Finishing order differs between clients!')
  }
  console.log('Identical finishing order on both clients (length', hostOrder.length, ')')

  // Standings should also match
  const hostStand = JSON.stringify(host.state.race.standings)
  const joinerStand = JSON.stringify(joiner.state.race.standings)
  if (hostStand !== joinerStand) {
    throw new Error('Standings differ between clients!')
  }
  console.log('Identical standings on both clients')

  // Move to next round
  send(host.ws, 'nextRound')
  await waitFor(host.state, host.onHandlers, (s) => s.lobby && s.lobby.phase === 'management' && s.lobby.currentRoundIndex === 1)
  await waitFor(joiner.state, joiner.onHandlers, (s) => s.lobby && s.lobby.phase === 'management' && s.lobby.currentRoundIndex === 1)
  console.log('Both clients advanced to next round (R2)')

  console.log('\nALL CHECKS PASSED ✓')
  console.log('Shared championship:', host.state.championship.id)
  console.log('Lobby code:', code)
  console.log('Final standings:')
  for (const row of host.state.race.standings.driverRows.slice(0, 5)) {
    console.log(`  - ${row.driverId}: ${row.points} pts`)
  }

  host.ws.close()
  joiner.ws.close()
  process.exit(0)
}

main().catch((e) => {
  console.error('FAIL:', e && e.message)
  console.error('STACK:', e && e.stack)
  process.exit(1)
})
