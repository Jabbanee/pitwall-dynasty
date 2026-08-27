// Joiner helper: connects to a lobby as a raw WebSocket client.
// Used in the final QA pass to leave TWO clients in a shared
// authoritative race so the user can inspect immediately.

const WebSocket = require('ws')

const code = process.argv[2]
if (!code) { console.error('usage: node mp-joiner.cjs <code>'); process.exit(1) }

const ws = new WebSocket('ws://localhost:8080')
let playerId = null
let teamSelected = false
let liveAcked = false

ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw))
  if (msg.type === 'welcome') {
    playerId = msg.payload.playerId
    ws.send(JSON.stringify({ type: 'setName', payload: { name: 'QA Joiner' } }))
    ws.send(JSON.stringify({ type: 'joinLobby', payload: { code } }))
  } else if (msg.type === 'joined') {
    console.log(`[${playerId}] joined ${code}`)
    setTimeout(() => {
      ws.send(JSON.stringify({ type: 'selectTeam', payload: { teamId: 'base.team.aquila' } }))
      ws.send(JSON.stringify({ type: 'setReady', payload: { ready: true } }))
      teamSelected = true
    }, 250)
  } else if (msg.type === 'lobbyState' && teamSelected) {
    if (msg.payload.phase === 'management') {
      ws.send(JSON.stringify({ type: 'readyTeam', payload: { ready: true } }))
      console.log(`[${playerId}] readyTeam(true) sent`)
    }
  } else if (msg.type === 'raceStart' || (msg.type === 'raceState' && msg.payload.phase === 'race')) {
    if (!liveAcked) {
      console.log(`[${playerId}] race live — leader lap ${msg.payload.leaderLap}/${msg.payload.totalLaps}`)
      liveAcked = true
    }
  } else if (msg.type === 'raceComplete') {
    console.log(`[${playerId}] race complete`)
  } else if (msg.type === 'error') {
    console.error(`[${playerId}] ERROR: ${msg.payload.message}`)
  }
})
ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1) })
ws.on('close', () => { console.log(`[${playerId}] ws closed`); process.exit(0) })
ws.on('open', () => { console.log(`[${playerId}] ws open`) })
// keep alive
process.on('SIGINT', () => ws.close())
setInterval(() => {}, 5000)
