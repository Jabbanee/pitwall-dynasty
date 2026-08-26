# Pitwall Dynasty — Project Status

Last updated: end of Phase 2 continuation run (2026-08-26).

## Implemented

### Core engine
- Deterministic seeded race simulation (PRNG, immutable packages,
  append-only live command log, replay-safe)
- Headless race simulation (simulateRace / simulateQualifying) plus
  live lap-by-lap engine (LiveRaceEngine) for the broadcast
- Two active drivers per team
- Tyre simulation with warmup, wear cliff, dry/wet crossover
- Weather, safety car / virtual safety car
- Mechanical failures, incidents, reliability

### Strategy
- Pit, pace (4 modes), energy, tyre requests, team orders
- Strategy playbook with planned stints, conditional rules
- Pit-entry decision point: PIT_THIS_LAP after the entry point
  defers to next lap deterministically

### Multiplayer
- Authoritative WebSocket server (`src/server/server.ts`) on
  `ws://localhost:8080`
- `MultiplayerLobby` class with fresh championship state (no inherited
  agency / promises / media history)
- Browser `MultiplayerClient` (queue, reconnect, welcome message)
- Lobby screen (`src/ui/lobby.ts`) with create / join by code, player
  list, ready toggle, host-start button
- Join codes, ready state, management phase
- Live race with reveal-safe snapshots
- Voting (speed / pause / rewind)
- Verified end-to-end with two real browser tabs (host issues code
  e.g. `FW6BVU`, guest joins by entering the code, both ready, host
  starts — `phaseChange` broadcast to both clients)

### Driver Agency
- Championship-scoped state store (DriverAgencyStore)
- Memory events with severity / decay
- 13 memory types, deterministic templates
- Teammate relationships, trust, morale, roleSatisfaction
- Compliance assessment (assessCompliance) with verdict bands
- installAgencyCompliance wires the store into the live engine
- Driver demands generator (number-1 / equal / championship /
  salary) keyed on personality traits
- addPromise / breakPromise with severe consequences on broken
  promises
- **Multiplayer isolation**: every Fast Championship and League
  Championship starts with `freshAgencyState()` — no inherited
  grudges, no inherited media history. Static personality remains.

### Regulations Engine
- Era-aware regulations for 7 eras (1980-2022+)
- Team order legality: allowed / codedOnly / prohibited
- teamOrderAvailability helper for UI
- codedOrderRisk / resolveCodedOrder for risk feedback
- 2003-2010 Order Prohibition Era fully modelled
- START_YEARS + regulationsForYear are the single source of truth

### 3D Broadcast
- Three.js helicopter camera with follow target
- Era-aware 3D car geometry (eraFactor reshapes the car)
- Team-coloured liveries, car numbers
- Timing tower (top 10), top HUD (lap/clock/condition/speed)
- Live strategy panel (pace / pit / tyre / team orders)
- Battle detection + battle notification cards with WATCH button
- Notification suppression when the battle is already on screen
- Independent per-player camera (no shared camera state)
- LEAD + ANALYST commentary ribbon overlaid on the 3D canvas

### Live strategy
- Pace: conserve / normal / push / attack
- Energy: harvest / balanced / deploy
- Pit: box this lap / next lap / cancel
- Tyre: all 5 compounds, request only (executed at next stop)
- Team orders: hold / coexist / swap / priority / free
- Availability explanations with era + driver compliance verdict
  (AVAILABLE / RISKY / PROHIBITED / DRIVER UNCERTAIN)

### Career
- Real Career (historical shadow timeline)
- Fictional Career (emergent alternate history)
- Era selector with START_YEARS (1980 / 1990 / 1998 / 2005 / 2010 /
  2014 / 2022)
- Era summary panel (team orders / qualifying / refuelling /
  compounds / points / cost cap / SC rules)
- 10 fictional teams, 24 fictional drivers, 12 sponsors
- Fictional Shadow Circuits (10 layouts)
- 3-year initial contract system

### Practice
- Quick Sim: low effort, small bonus
- Manual Plan: focus checkboxes (longRun / qualiSim / raceSim),
  effort level (low/standard/high)
- Output: numeric setup-confidence bonus in seconds, deterministic
  per seed
- Consumed by LiveRaceEngine via practiceBonus per lap

### Media
- Event-driven commentary engine with two roles (LEAD / ANALYST)
- Templates for overtakes, retirements, SC, lead changes, pit stops,
  fastest laps, weather, spins, final lap, finish
- Rate-limited overtake excitement, dedupe of repeated events
- The Paddock Post publication: lead story, secondary stories,
  analysis, transfer rumour, regulation news
- Post-race driver quotes (winner, mid-grid, DNF, teammate dispute)
- Championship picture table
- Contextual interview system (9 reasons, 3 options each) with
  morale / trust / media-sentiment / reputation / teammate effects

### UI / UX
- All team-order buttons show AVAILABLE / RISKY / PROHIBITED /
  DRIVER UNCERTAIN badges with title reasons (no unexplained
  disabled actions)
- New Solo Career shows era summary in the same screen
- Commentator ribbon + tail in 3D broadcast
- Save with schema versioning and migrations
- Multiplayer two-client tested live

### Tests
- 104 vitest tests across 15 files
- Pure-domain logic, deterministic, fast

## Partially implemented

- 3D track circuits remain flat procedural geometry (no per-track
  elevation models). Acceptable for helicopter broadcast framing.
- The multiplayer championship state lives on the server; the
  local `store.champ` is the previously-saved championship. The
  lobby→race navigation lands on the local championship's HQ by
  default. A future pass should hydrate `store.champ` from the
  server's `lobbySnapshot` so a multiplayer race actually shows
  the race in the broadcast on both clients.

## Remaining

- Full era-specific car geometry (halo / sidepod / engine cover
  distinct for 1980 vs 2022) — eraFactor wiring is in place but
  the visual delta is subtle; a future pass should add distinct
  nose and wing silhouettes per era.
- Per-track elevation / kerbs / runoff (visually flat right now).
- Interview replayability: interview system fires once per
  triggering race, no follow-up chain.
- Hydrate local store from server lobby snapshot for true
  cross-client multiplayer race viewing.

## Known issues

- The local "Next round" button needs an extra `commitLocalResults`
  step to fully refresh; in the local-mode broadcast, the race is
  fast-forwarded to completion when the button is pressed. This
  is intentional — the broadcast view cannot let the player skip
  the race without finishing the simulated package.
- During HMR reload, the 3D view occasionally re-mounts before the
  engine is ready, leaving an empty canvas for ~100ms. Not visible
  in normal use.
- When a player reloads a tab, the server issues a new playerId
  and marks the previous player as `OFFLINE` in the lobby. This
  is correct behaviour but visually surprising in the UI. A future
  pass should map reconnecting tabs onto the same playerId.

## Test count

104/104 passing. TypeScript: clean. Production build: green.

## Last QA

Phase 2 continuation, 2026-08-26. Both multiplayer (2 browser tabs in
Playwright) and single-player flows manually verified. Screenshots
committed to `docs/testing/screenshots/phase2/`.

