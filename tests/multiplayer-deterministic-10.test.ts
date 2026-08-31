import { describe, it, expect } from 'vitest'
import { MultiplayerLobby } from '../src/server/multiplayer-server'

/**
 * MP deterministic regression — runs a two-driver championship race
 * 10 times with the same seed and asserts the finishing order is
 * byte-identical every run. This is the architectural invariant:
 *   simVersion + seed + RacePackages + ordered LiveCommandLog
 *   = identical race.
 */
describe('multiplayer deterministic 10x', () => {
  it('produces an identical finishing order across 10 runs', { timeout: 60000 }, () => {
    let refOrdered: string | null = null

    for (let run = 0; run < 10; run++) {
      const lobby = new MultiplayerLobby('host', { seed: 0x5eed })
      lobby.join('host', 'Host')
      lobby.join('p2', 'A')
      lobby.selectTeam('host', 'base.team.aquila')
      lobby.selectTeam('p2', 'base.team.titan')
      lobby.start('host')
      lobby.lockAndQualify()
      let guard = 0
      while (lobby.phase === 'race' && guard++ < 5000) {
        lobby.tick(0.5)
      }
      const results = lobby.roundResults
      if (!results) throw new Error(`run ${run}: no roundResults yet (phase=${lobby.phase})`)
      const ordered = results
        .slice()
        .sort((a, b) => a.finishPosition - b.finishPosition)
        .map((r) => `${r.driverId}:${r.finishPosition}`)
        .join(',')

      if (refOrdered == null) {
        refOrdered = ordered
        continue
      }
      expect(ordered).toBe(refOrdered)
    }
  })
})