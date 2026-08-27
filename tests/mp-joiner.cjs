// Joiner helper: connects to a lobby as a raw WebSocket client
// and issues a select + setReady. Used by the Playwright QA pass
// to simulate a second human player without sharing localStorage.

const WebSocket = require('ws')

async function main() {
  const code = process.argv[2]
  if (!code) { console.error('usage: node mp-joiner.cjs <code>'); process.exit(1) }
  const ws = new WebSocket('ws://localhost:8080')
  let playerId = null
  let teamSelected = false
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw))
    if (msg.type === 'welcome') {
      playerId = msg.payload.playerId
      ws.send(JSON.stringify({ type: 'setName', payload: { name: 'QA Joiner' } }))
      ws.send(JSON.stringify({ type: 'joinLobby', payload: { code } }))
    } else if (msg.type === 'joined') {
      console.log('joined as', playerId)
      // Wait a tick before selecting
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'selectTeam', payload: { teamId: 'base.team.aquila' } }))
        ws.send(JSON.stringify({ type: 'setReady', payload: { ready: true } }))
        teamSelected = true
      }, 200)
    } else if (msg.type === 'lobbyState' && teamSelected) {
      // Once the host starts the championship, send readyTeam
      if (msg.payload.phase === 'management') {
        ws.send(JSON.stringify({ type: 'readyTeam', payload: { ready: true } }))
      }
    } else if (msg.type === 'raceStart' || (msg.type === 'raceState' && msg.payload.phase === 'race')) {
      // Stay alive
    } else if (msg.type === 'error') {
      console.error('ERROR:', msg.payload.message)
    }
  })
  ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1) })
  ws.on('open', () => { console.log('joiner WS open, waiting for welcome...') })
  // keep alive
  setInterval(() => {}, 1000)
}
main()
