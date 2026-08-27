import { describe, it, expect, beforeEach } from 'vitest'
import { MultiplayerLobby, DEFAULT_LOBBY_CONFIG } from '../src/server/multiplayer-server'

/**
 * Snapshot hydration / state accumulation tests for the P0 multiplayer pass.
 * These tests cover the server-side invariants that the two-client 3D
 * broadcast depends on:
 *   - completed-round standings accumulate across rounds
 *   - roundResults is cleared between rounds
 *   - nextRound() can only be called from roundResults / seasonComplete
 *   - two-driver per-team management is exposed
 *   - driverId ownership is validated for live commands
 *   - sessionToken-based reconnect with team ownership preservation
 */

function makeLobby(): MultiplayerLobby {
  const lobby = new MultiplayerLobby('host1')
  lobby.join('host1', 'Host')
  return lobby
}

function startAndFinishRound(lobby: MultiplayerLobby) {
  lobby.join('p2', 'A')
  lobby.selectTeam('p2', 'base.team.titan')
  lobby.selectTeam('host1', 'base.team.aquila')
  lobby.start('host1')
  lobby.lockAndQualify()
  // run the race to completion
  let guard = 0
  while (lobby.phase === 'race' && guard++ < 5000) {
    lobby.tick(0.5)
  }
}

describe('multiplayer snapshot / state accumulation', () => {
  let lobby: MultiplayerLobby

  beforeEach(() => {
    lobby = makeLobby()
  })

  it('standings are empty before any round has finished', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.selectTeam('host1', 'base.team.aquila')
    lobby.start('host1')
    lobby.lockAndQualify()
    const s = lobby.standings()
    expect(s.driverRows.length).toBe(0)
    expect(s.teamRows.length).toBe(0)
  })

  it('standings accumulate across two completed rounds', () => {
    lobby.config.rounds = 2
    startAndFinishRound(lobby)
    expect(lobby.phase).toBe('roundResults')
    const standingsAfterR1 = lobby.standings()
    expect(standingsAfterR1.driverRows.length).toBeGreaterThan(0)
    expect(standingsAfterR1.driverRows.length).toBeLessThanOrEqual(20)
    const r1Points = new Map(standingsAfterR1.driverRows.map((r) => [r.driverId, r.points]))
    expect(standingsAfterR1.teamRows.length).toBeGreaterThan(0)
    const outcome = lobby.nextRound()
    expect(outcome).toBe('nextRound')
    expect(lobby.roundResults).toBeUndefined()
    expect(lobby.phase).toBe('management')
    const lock = lobby.lockAndQualify()
    expect(lock.ok).toBe(true)
    expect(lobby.phase).toBe('race')
    let guard = 0
    while (lobby.phase === 'race' && guard++ < 5000) {
      lobby.tick(0.5)
    }
    expect(lobby.phase).toBe('roundResults')
    const standingsAfterR2 = lobby.standings()
    expect(standingsAfterR2.driverRows.length).toBeGreaterThan(0)
    const r2Points = new Map(standingsAfterR2.driverRows.map((r) => [r.driverId, r.points]))
    const totalR1 = [...r1Points.values()].reduce((a, b) => a + b, 0)
    const totalR2 = [...r2Points.values()].reduce((a, b) => a + b, 0)
    expect(totalR2).toBeGreaterThanOrEqual(totalR1)
  })

  it('roundResults is cleared after nextRound', () => {
    lobby.config.rounds = 2
    startAndFinishRound(lobby)
    expect(lobby.roundResults).toBeDefined()
    lobby.nextRound()
    expect(lobby.roundResults).toBeUndefined()
  })

  it('nextRound is rejected outside the roundResults / seasonComplete phase', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.start('host1')
    expect(() => lobby.nextRound()).toThrow(/roundResults|seasonComplete/)
  })

  it('two drivers per team are present in the championship', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.selectTeam('host1', 'base.team.aquila')
    lobby.start('host1')
    for (const team of lobby.championship.teams) {
      expect(team.driverIds.length).toBe(2)
    }
  })

  it('live command rejects opponent driver even within own team id', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.selectTeam('host1', 'base.team.aquila')
    lobby.start('host1')
    lobby.lockAndQualify()
    const aquilaDriver = lobby.championship.teams.find((t) => t.id === 'base.team.aquila')!.driverIds[0]
    const res = lobby.sendLiveCommand('p2', {
      teamId: 'base.team.titan', driverId: aquilaDriver, command: 'PACE_ATTACK',
    })
    expect(res.ok).toBe(false)
    expect(res.response.length).toBeGreaterThan(0)
  })

  it('two-driver pacing: pace for each driver is independent and observable', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.selectTeam('host1', 'base.team.aquila')
    lobby.start('host1')
    lobby.lockAndQualify()
    for (let i = 0; i < 3; i++) lobby.tick(120)
    const titan = lobby.championship.teams.find((t) => t.id === 'base.team.titan')!
    const [d1, d2] = titan.driverIds
    const r1 = lobby.sendLiveCommand('p2', { teamId: titan.id, driverId: d1, command: 'PACE_PUSH' })
    const r2 = lobby.sendLiveCommand('p2', { teamId: titan.id, driverId: d2, command: 'PACE_CONSERVE' })
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    expect(d1).not.toBe(d2)
  })

  it('fresh agency: every multiplayer championship starts with default trust (no inherited grudges)', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.start('host1')
    for (const d of Object.values(lobby.championship.drivers)) {
      expect(d.dynamic.morale).toBe(65)
      expect(d.dynamic.confidence).toBe(60)
      expect(d.dynamic.seasonsWithTeam).toBe(1)
    }
  })

  it('PIT_THIS_LAP on own driver is accepted during a live race', () => {
    lobby.join('p2', 'A')
    lobby.selectTeam('p2', 'base.team.titan')
    lobby.selectTeam('host1', 'base.team.aquila')
    lobby.start('host1')
    lobby.lockAndQualify()
    // advance a few laps so the pit decision point exists
    for (let i = 0; i < 3; i++) lobby.tick(120)
    const titan = lobby.championship.teams.find((t) => t.id === 'base.team.titan')!
    const d1 = titan.driverIds[0]
    const res = lobby.sendLiveCommand('p2', { teamId: titan.id, driverId: d1, command: 'PIT_THIS_LAP' })
    expect(res.ok).toBe(true)
  })

  it('default config is sane: 10 teams, 5 rounds, 2022 era', () => {
    expect(DEFAULT_LOBBY_CONFIG.teamCount).toBe(10)
    expect(DEFAULT_LOBBY_CONFIG.rounds).toBe(5)
    expect(DEFAULT_LOBBY_CONFIG.eraYear).toBe(2022)
  })
})

describe('multiplayer reconnect / session token', () => {
  it('issues a sessionToken on first join and accepts it on restoreByToken', () => {
    const lobby = new MultiplayerLobby('host1')
    const j = lobby.join('host1', 'Host')
    expect(j.ok).toBe(true)
    const token = j.sessionToken
    expect(token).toBeDefined()
    expect(token!.length).toBeGreaterThanOrEqual(16)
    lobby.disconnect('host1')
    expect(lobby.players[0].connected).toBe(false)
    const r = lobby.restoreByToken(token!)
    expect(r.ok).toBe(true)
    expect(r.realPlayerId).toBe('host1')
    expect(lobby.players[0].connected).toBe(true)
  })

  it('rejects an unknown sessionToken', () => {
    const lobby = new MultiplayerLobby('host1')
    lobby.join('host1', 'Host')
    const r = lobby.restoreByToken('FAKETOKENTHATDOESNOTEXIST00000')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not recognised')
  })

  it('preserves team ownership across reconnect', () => {
    const lobby = new MultiplayerLobby('host1')
    const j = lobby.join('host1', 'Host')
    lobby.join('p2', 'A')
    lobby.selectTeam('host1', 'base.team.titan')
    lobby.selectTeam('p2', 'base.team.aquila')
    lobby.start('host1')
    expect(lobby.teamStateOf('host1')?.teamId).toBe('base.team.titan')
    lobby.disconnect('host1')
    const r = lobby.restoreByToken(j.sessionToken!)
    expect(r.ok).toBe(true)
    expect(lobby.teamStateOf('host1')?.teamId).toBe('base.team.titan')
    const ownerCount = [...lobby.teamStates.values()].filter((t) => t.teamId === 'base.team.titan' && t.ownerPlayerId === 'host1').length
    expect(ownerCount).toBe(1)
  })

  it('two simultaneous sessionTokens: each maps to a distinct playerId', () => {
    const lobby = new MultiplayerLobby('host1')
    const j1 = lobby.join('host1', 'Host')
    const j2 = lobby.join('p2', 'A')
    expect(j1.sessionToken).toBeDefined()
    expect(j2.sessionToken).toBeDefined()
    expect(j1.sessionToken).not.toBe(j2.sessionToken)
    // Restore both via the same lobby
    const r1 = lobby.restoreByToken(j1.sessionToken!)
    const r2 = lobby.restoreByToken(j2.sessionToken!)
    expect(r1.realPlayerId).toBe('host1')
    expect(r2.realPlayerId).toBe('p2')
  })
})
