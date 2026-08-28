# Pitwall Dynasty — Broadcast Director

The TV Director is a **local renderer-only** concept. It never
participates in the authoritative multiplayer server. Each client
runs its own `TvDirector` instance and may pick its own manual
camera mode independently of every other client.

## Why local

The server already knows the championship state, the live race
state, the snapshots, the command log, the vote queue and the
results. It does not pick cameras. Camera choice is a
presentation concern: the broadcast chrome, the cut cadence, the
"battle for lead" framing are matters of taste and bandwidth, not
race state.

This keeps the multiplayer architecture honest:

```
Authoritative server → snapshot → local renderer
  → TvDirector picks a CameraTarget
  → CameraTarget drives Three.js
```

The director never writes back. No IPC. No round-trip.

## Camera modes

| Mode       | What you see                                    |
| ---------- | ----------------------------------------------- |
| director   | the auto-pilot, picks the most interesting shot |
| helicopter | the classic overhead helicopter                 |
| trackside  | a low trackside shot                            |
| onboard    | a T-cam behind the driver                       |
| leader     | the race leader, helicopter framing             |
| battle     | a battle in progress, framed wider              |
| pit-lane   | the pit entry, team boxes and the pit wall     |
| follow     | a custom follow on the followed car             |

Manual selection persists until the user picks a different mode or
returns to `director`.

## Event priority

The director reads an event queue. The queue is fed by the
broadcast from the authoritative race state (in multiplayer) or
the local `LiveRaceEngine` (in singleplayer). Events are tagged
with one of three priorities:

- `CRITICAL` — race start, chequered flag, incident
- `HIGH` — final lap, leader change, close battle, pit stop, player pit event
- `NORMAL` — overtake, group position swap

Events are stale after 8 seconds. Stale events are dropped so the
director always reflects the current race context.

The minimum switch interval is 2.4 s so the broadcast does not
chatter. `CRITICAL` events cut. Other transitions smoothly pan.

## Manual override

`director.setManualMode(mode)` exits the event-driven loop and
freezes the camera on the chosen mode. `setManualMode('director')`
re-enters the auto-pilot. Manual mode persists across director
resets, which only clear the event queue.

## Local camera independence in multiplayer

The two-client regression (`tests/multiplayer-two-client.cjs`) does
not assert camera state — the server does not see it. Each client
can independently switch to a different camera, and both still
see the same race state. This is the rule the P0 multiplayer pass
locked and the P2 broadcast does not weaken.

## Where the director is

`src/ui/three/cameras.ts` is the only file that defines
`TvDirector`, `solveCameraTarget` and the event priority ranking.
`broadcast3d.ts` instantiates one `TvDirector` per broadcast, feeds
it events and consumes its output in `updateCamera(dt)`.
