import { describe, it, expect, beforeEach } from 'vitest'
import { MultiplayerLobby, DEFAULT_LOBBY_CONFIG } from '../src/server/multiplayer-server'

function makeLobby(): MultiplayerLobby {
  const lobby = new MultiplayerLobby('host1')
  lobby.join('host1', 'Host')
  return lobby
}

describe('multiplayer lobby', () => {
  let lobby: MultiplayerLobby

  beforeEach(() => {
    lobby = makeLobby()
  })

  it('generates a join code and accepts players', () => {
    expect(lobby.code).toMatch(/^[A-Z2-9]{6}$/)
    const res = lobby.join('p2', 'Alice')
    expect(res.ok).toBe(true)
    expect(lobby.players.length).toBe(2)
  })

  it('rejects join when lobby is full', () => {
    lobby.config.teamCount = 2
    lobby.join('p2', 'A')
    const res = lobby.join('p3', 'B')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('full')
  })

  it('team selection is exclusive — one owner per team', () => {
    lobby.join('p2', 'A')
    lobby.join('p3', 'B')
    expect(lobby.selectTeam('p2', 'base.team.titan').ok).toBe(true)
    const res = lobby.selectTeam('p3', 'base.team.titan')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('already selected')
    // p3 can take a different team
    expect(lobby.selectTeam('p3', 'base.team.aquila').ok).toBe(true)
  })

  it('only the host can change config or start', () => {
    lobby.join('p2', 'A')
    expect(lobby.updateConfig('p2', { rounds: 3 }).ok).toBe(false)
    expect(lobby.updateConfig('host1', { rounds: 3 }).ok).toBe(true)
    expect(lobby.start('p2').ok).toBe(false)
    expect(lobby.start('host1').ok).toBe(true)
  })

  it('ready state syncs and allReady requires all human teams', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.selectTeam('host1', 'base.team.aquila')
    lobby.readyTeam('p2', true)
    expect(lobby.allReady()).toBe(false)
    lobby.readyTeam('host1', true)
    expect(lobby.allReady()).toBe(true)
  })

  it('full loop: start → management → lock → race → finish → next round', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.selectTeam('host1', 'base.team.aquila')
    lobby.start('host1')
    expect(lobby.phase).toBe('management')
    expect(lobby.championship.teams.length).toBe(DEFAULT_LOBBY_CONFIG.teamCount)

    const res = lobby.lockAndQualify()
    expect(res.ok).toBe(true)
    expect(lobby.phase).toBe('race')
    expect(lobby.liveEngine).toBeDefined()
    expect(lobby.lockedPackages.length).toBe(20) // 10 teams × 2 cars

    // Simulate the whole race
    let guard = 0
    while (lobby.phase === 'race' && guard++ < 5000) {
      lobby.tick(0.5)
    }
    expect(lobby.phase).toBe('roundResults')
    expect(lobby.roundResults!.length).toBe(20)

    const outcome = lobby.nextRound()
    expect(outcome).toBe('nextRound')
    expect(lobby.phase).toBe('management')
    expect(lobby.championship.currentRoundIndex).toBe(1)
  })

  it('live command validation: cannot command another team', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.selectTeam('host1', 'base.team.aquila')
    lobby.start('host1')
    lobby.lockAndQualify()
    // p2 tries to command aquila's driver
    const aquilaDriver = lobby.championship.teams.find((t) => t.id === 'base.team.aquila')!.driverIds[0]
    const res = lobby.sendLiveCommand('p2', { teamId: 'base.team.aquila', driverId: aquilaDriver, command: 'PACE_ATTACK' })
    expect(res.ok).toBe(false)
    expect(res.response).toContain('Cannot command')
    // Own team works
    const titanDriver = lobby.championship.teams.find((t) => t.id === 'base.team.titan')!.driverIds[0]
    const res2 = lobby.sendLiveCommand('p2', { teamId: 'base.team.titan', driverId: titanDriver, command: 'PACE_ATTACK' })
    expect(res2.ok).toBe(true)
  })

  it('voting: return to 1x cannot be blocked', () => {
    lobby.join('p2', 'A')
    lobby.join('p3', 'B')
    lobby.start('host1')
    lobby.lockAndQualify()
    lobby.liveSpeed = 8
    // p2 requests return to 1x
    const res = lobby.requestVote('p2', 'speed', 1)
    expect(res.ok).toBe(true)
    expect(lobby.liveSpeed).toBe(1) // unblockable — passes immediately
    expect(lobby.activeVote).toBeNull()
  })

  it('voting: rewind requires unanimity', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.selectTeam('host1', 'base.team.aquila')
    lobby.start('host1')
    lobby.lockAndQualify()
    lobby.cursorSeconds = 100
    lobby.requestVote('p2', 'rewind', 10)
    // host votes against → unanimous requirement fails
    lobby.castVote('host1', false)
    expect(lobby.replayActive).toBe(false)
    expect(lobby.cursorSeconds).toBe(100)
    // With both supporting, it passes
    lobby.requestVote('p2', 'rewind', 10)
    lobby.castVote('host1', true)
    expect(lobby.replayActive).toBe(true)
  })

  it('replay never rewrites history — commands queue during replay', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.start('host1')
    lobby.lockAndQualify()
    // Advance some laps
    for (let i = 0; i < 5; i++) lobby.tick(200)
    const simBefore = lobby.liveEngine!.state.simTime
    lobby.startReplay(10)
    expect(lobby.replayActive).toBe(true)
    expect(lobby.cursorSeconds).toBe(10)
    // Command during replay gets queued
    const titanDriver = lobby.championship.teams.find((t) => t.id === 'base.team.titan')!.driverIds[0]
    const res = lobby.sendLiveCommand('p2', { teamId: 'base.team.titan', driverId: titanDriver, command: 'PACE_ATTACK' })
    expect(res.ok).toBe(true)
    expect(res.response).toContain('queued')
    // Sim time unchanged during replay
    expect(lobby.liveEngine!.state.simTime).toBe(simBefore)
    lobby.resumeLive()
    expect(lobby.cursorSeconds).toBe(simBefore)
  })

  it('state isolation: two lobbies have completely independent championships', () => {
    const a = makeLobby()
    const b = makeLobby()
    a.start('host1')
    b.start('host1')
    // Different ids
    expect(a.championship.id).not.toBe(b.championship.id)
    // Mutating driver state in A does not touch B
    const driverId = Object.keys(a.championship.drivers)[0]
    a.championship.drivers[driverId].dynamic.morale = 5
    expect(b.championship.drivers[driverId].dynamic.morale).not.toBe(5)
    // Agency stores isolated
    expect(a.agency.get(driverId)).toBeDefined()
    expect(b.agency.get(driverId)?.trustInTeam).toBe(65)
  })

  it('disconnect preserves team state and allows reconnect', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.start('host1')
    lobby.disconnect('p2')
    expect(lobby.players.find((p) => p.playerId === 'p2')!.connected).toBe(false)
    expect(lobby.teamStateOf('p2')!.teamId).toBe('base.team.titan')
    // Reconnect
    lobby.join('p2', 'A')
    expect(lobby.players.find((p) => p.playerId === 'p2')!.connected).toBe(true)
  })

  it('equal start mode gives identical car performance', () => {
    lobby.config.startMode = 'equal'
    lobby.start('host1')
    const perfs = lobby.championship.teams.map((t) => JSON.stringify(t.carPerformance))
    expect(new Set(perfs).size).toBe(1)
  })

  it('eraBalanced compresses performance spread', () => {
    lobby.config.startMode = 'eraBalanced'
    lobby.start('host1')
    const paces = lobby.championship.teams.map((t) =>
      Object.values(t.carPerformance).reduce((a, b) => a + b, 0) / 12)
    const spread = Math.max(...paces) - Math.min(...paces)
    // Compressed: well under the unbalanced ~10-point spread
    expect(spread).toBeLessThan(6)
  })
})
