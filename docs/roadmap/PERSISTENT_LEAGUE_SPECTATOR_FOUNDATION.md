# Persistent League + Spectator Foundation

Status: PLAN. Not yet implemented.
Owner: BaneWorks
Predecessor: P5 visual closure (HEAD 18d6606 on master).
Date: 2026-08-31

## 1. Strategic context

### The Undercut
The Undercut has publicly announced future multiplayer. That
announcement alone erodes the "we have multiplayer" moat. Generic
multiplayer will not differentiate Pitwall Dynasty in 2027.

### iGP Manager
iGP Manager already proves the demand for:
- persistent online leagues
- multi-season championships
- live strategy
- long-term team development

### Pitwall Dynasty differentiation thesis
Pitwall Dynasty must race toward the harder-to-copy advantage:
PERSISTENT HUMAN LEAGUES + DEDICATED ONLINE SERVICE + SPECTATOR /
SHARED BROADCAST + RECONNECT / PERSISTENCE + MULTI-HUMAN-TEAM
CHAMPIONSHIPS.

Generic visual polish phases are over. The next phase is a
re-architecting of multiplayer into a hosted service plus the
spectator-facing product surface.

## 2. Why this is the next pass

- The current `src/server/multiplayer-server.ts` is a single-file
  in-memory WebSocket server. It works for the P0 two-client
  smoke test but cannot survive a process restart, cannot hold
  leagues longer than a few rounds, and has no concept of
  persistent team ownership.
- The `mpSession` client in `src/client/multiplayer-session.ts`
  mirrors the in-memory model directly. We will need a
  persistent identity / auth layer for league members.
- The renderer / 3D broadcast (`src/ui/three/broadcast3d.ts`) is
  already capable of consuming authoritative race state. With a
  persistent service, the same renderer can be reused for the
  spectator surface unchanged — only the data source changes.
- The replay invariant `simVersion + seed + RacePackages +
  ordered LiveCommandLog = identical race` is the contract that
  allows leagues to resolve disputes by replaying authoritative
  state deterministically. That contract must be preserved.

## 3. Target architecture

### 3.1 Hosted authoritative service

Split the current single-process multiplayer server into three
deployable services:

- `race-service`
  - Owns the `MultiplayerLobby` and `LiveRaceEngine` instances.
  - Validates `LiveCommand`s against team ownership.
  - Streams authoritative snapshots at 20 Hz to all clients in a
    given race.
  - Replays a race on demand given `seed + RacePackages +
    ordered LiveCommandLog`. The replay is the source of truth
    for disputes.
  - Stateless aside from race state — race state can be evicted
    once the round is finalised and the result is persisted.

- `league-service`
  - Owns the persistent championship: rounds, calendar,
    standings, team development, contracts, regulations,
    penalty state.
  - Persists everything to durable storage after every accepted
    `LiveCommand` and after every `advanceRound`.
  - Exposes a REST + WebSocket API for league state, race
    scheduling, results, and history.

- `persistence`
  - Durable store (Postgres for relational league state,
    object storage for RacePackage blobs and replay logs).
  - Schema migrations applied at deploy.
  - Replicated across regions; reads served from replicas.

A thin `gateway` process fronts all three with auth, rate
limiting, session tokens, and a uniform WebSocket transport for
live race state.

### 3.2 Identity, sessions, and rate limiting

- Authentication: OpenID Connect compatible. Self-hosted account
  flow as the default; optional Discord / Steam linking later.
- Session tokens: short-lived JWT, rotated every race. The
  client never holds a long-lived token.
- Per-IP and per-account rate limits on all public endpoints.
- Reconnect: clients re-authenticate on disconnect, the
  server resumes their session and re-streams snapshots from
  the last confirmed cursor. The race state is never lost.

### 3.3 League domain model

A League is the persistent unit. One League holds one
Championship in a chosen Series, with a fixed calendar and a
fixed roster of team slots.

```
League
  - id (uuid)
  - name
  - ownerPlayerId
  - seriesId  (e.g. base.championship.wgp, base.junior.aurora)
  - calendar: Round[]
  - teamslot[2..11]:
      - teamId (fictional team identity)
      - ownerPlayerId | null
      - isAI: bool
  - settings: { aiDifficulty, regulations, assists, ... }
  - status: 'draft' | 'active' | 'paused' | 'finished'
  - seasonIndex
```

League lifecycle:
1. Create (owner becomes commissioner, picks series and calendar).
2. Invite — invite code or shareable link, expires.
3. Join — player picks a vacant team slot, accepts the team
   contract / regulations.
4. Leave — slot becomes vacant; AI takes over until the
   next available human.
5. Advance — `nextRound` runs from any team slot once all human
   teams have `readyTeam = true`.
6. Finish — last round of the calendar closes; final standings
   are written to history; multi-season history is built up
   one championship at a time.

### 3.4 Spectator system

A spectator is a session that joins a race in progress without
owning a team slot. Spectators consume the same authoritative
race snapshot stream as a player but cannot send `LiveCommand`s.

Spectator API:
- `joinSpectate(lobbyId)` — receive race snapshots only.
- `follow(driverId)` — sets the spectator's local camera
  follow target. Each spectator's camera is local; the
  authoritative race state is shared.
- `setCameraMode(mode)` — direct local control.
- The TV Director is local per spectator, so two spectators of
  the same race can be watching different drivers at the same
  time.
- Spectators also receive the full `BroadcastEvent` stream so
  the battle / pit / incident alerts work identically.

### 3.5 Shared broadcast (optional watch party)

A future addition: a `hosted broadcast` mode where a designated
spectator's TV Director choice is shared with all other
spectators. This does NOT change the simulation; it changes
which camera is rendered client-side. The simulation state and
the per-spectator data are decoupled.

### 3.6 Race event stream

Authoritative presentation events, consumed by broadcast and
spectator clients:

- `START` — race beginning
- `LIGHTS_OUT` — race start
- `OVERTAKE_ATTEMPT` — battle attempt (not always successful)
- `POSITION_CHANGE` — order change
- `PIT_ENTRY` — entering the pit lane
- `PIT_STOP` — service in progress
- `PIT_EXIT` — leaving the pit lane
- `INCIDENT` — crash, retirement, safety car
- `TEAM_ORDER` — team order accepted
- `DRIVER_REFUSAL` — driver refused a team order
- `FASTEST_LAP` — new fastest lap
- `LEAD_CHANGE` — leader swap
- `FINAL_LAP` — final lap started
- `FINISH` — chequered flag, results sealed

These are derived from the deterministic simulation log and
are part of the replay. Broadcasts and spectators consume the
same events the same way.

## 4. First engineering slice

If/when this pass is greenlit, the smallest end-to-end
implementation that proves the architecture is:

1. `race-service` skeleton that hosts `MultiplayerLobby` over
   WebSocket, with explicit seed + RacePackage persistence.
2. `league-service` skeleton with a Postgres-backed League
   model, REST endpoints to create / join / leave / advance.
3. `persistence` schema migrations for League, TeamSlot,
   RoundResult, StandingsHistory.
4. Spectator client: new `src/ui/spectator/` route that
   consumes the same `mpSession` race snapshots but never
   sends `LiveCommand`s.
5. `BroadcastEvent` stream surfaced in the spectator UI with
   the existing battle / pit / incident panels.

Estimated surface area:
- 2 new services under `src/server/`
- 1 new persistence module under `src/server/persistence/`
- 1 new route under `src/ui/spectator/`
- Reuse of all existing broadcast / director / camera
  infrastructure from P5

What is intentionally NOT in this slice:
- Voice chat
- Replay scrubber UI
- Anti-cheat beyond command validation
- Mobile / console clients
- Payment / subscription

## 5. Risks and mitigations

- Service split can introduce drift between `race-service`
  results and `league-service` standings. Mitigation: every
  `race-service` finalisation is sealed with a hash of the
  replay log; `league-service` only accepts the result if the
  hash matches the locally-replayed race.
- Spectator scaling: 20 Hz snapshots times N spectators is
  expensive. Mitigation: snapshot deltas (not full snapshots)
  and per-region fan-out.
- Reconnect storms: a disconnected region reconnecting all
  clients at once can saturate the gateway. Mitigation: token
  bucket per-IP, plus a server-initiated backoff on the
  client.

## 6. Acceptance bar for the first slice

- 4 human teams and 7 AI teams can play a full 5-round
  championship in one persistent League.
- A spectator can join mid-race, see the live race, and
  never send a `LiveCommand` (the server must reject any
  attempt).
- The race-service can replay a finished race byte-for-byte
  given the same `seed + RacePackages + ordered
  LiveCommandLog` and the persisted hash must match.
- The league-service survives a hard restart mid-season
  without losing standings or contracts.
- A single-region load test with 64 concurrent players
  and 128 spectators per race holds 20 Hz snapshots with
  p99 fan-out latency under 200 ms.

## 7. Out of scope (deliberately)

- Mobile clients.
- Real-money esports / prize pools.
- Cross-league global rankings.
- AI team takeover between human owners (handled at the
  League layer, not the race layer).
