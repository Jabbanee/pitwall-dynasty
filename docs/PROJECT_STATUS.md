# Pitwall Dynasty — Project Status

Last updated: end of Multiplayer P0 completion pass (2026-08-27).

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

### Multiplayer (P0 — complete shared race)
- **Authoritative WebSocket server** (`src/server/server.ts`) on
  `ws://localhost:8080`. The server owns the championship, live
  race, voting, and command log end-to-end.
- **`MultiplayerLobby`** (`src/server/multiplayer-server.ts`) with
  fresh championship state per lobby (no inherited agency,
  promises, media history) and `availableTeams` so the team picker
  shows the same set the eventual championship is built from.
- **`MultiplayerSession`** (`src/client/multiplayer-session.ts`) —
  process-wide singleton that owns the WS, replays server
  snapshots into a typed `MultiplayerView`, and writes them to
  `store.multi`. Persists the server-issued `sessionToken` in
  localStorage so a tab reload reconnects the SAME player.
- **`store.multi`** is the strict multiplayer-mode mirror of the
  championship. When `store.multi.active === true` the broadcast,
  HQ, results, standings and paddock routes read from `store.multi`
  and NEVER consult the local `store.champ`. Joining a multiplayer
  lobby also calls `store.clearLocalChampionship()` so a previous
  Quick Start cannot contaminate the multiplayer view.
- **`broadcast3d.ts`** (`src/ui/three/broadcast3d.ts`) no longer
  constructs its own `MultiplayerClient` and no longer falls back to
  a local `LiveRaceEngine` while a multiplayer session is active.
  Local-only mode (no `mpSession.view.joined`) still runs the local
  engine.
- **Server-driven snapshots** broadcast `lobbyState`, `raceState`,
  `raceStart`, `raceComplete`, `phaseChange`, `voteState`,
  `lobbyState` (re-emitted after `raceComplete` so the client sees
  the new `phase: 'roundResults'`).
- **Reconnect via opaque sessionToken** — clients persist a 24-char
  base32 token (`pitwall-dynasty.mp.session`) and re-authenticate
  on tab reload. The server swaps the connection-local handle for
  the durable `playerId`. Unauthorised tokens are rejected.
- **Ownership validation** — the server refuses commands that try
  to act on another human player's team or on a driverId that does
  not belong to the claimed team.
- **Voting** — speed / pause / rewind with configurable majority /
  unanimity. Return to 1x is unblockable. Replay (rewind) never
  rewrites history: commands during replay are queued and applied
  on `resumeLive`.
- **Two-driver per team** — verified by the championship builder
  and the strategy panel UI. Players manage both drivers
  independently.
- **Driver Agency starts fresh** in every multiplayer championship
  (no inherited grudges, default trust 65, default morale 65).
- **Two-round cross-client verification** — `tests/multiplayer-two-client.cjs`
  spawns two raw WebSocket clients against the same server and
  asserts the championship ID, circuit, race phase, car states,
  vote outcomes, finishing order and standings are byte-for-byte
  identical on both clients at every step. The two-client test
  also verifies that opponent-team commands are rejected and that
  `nextRound` advances both clients to the same next round.
- **14 new vitest tests** in `tests/multiplayer-snapshot.test.ts`
  cover: standings accumulation, roundResults clearing,
  `nextRound` phase guard, two drivers per team, opponent-driver
  rejection, two-driver independent pacing, fresh agency,
  sessionToken issue/accept/reject, team ownership across
  reconnect, and two simultaneous sessionTokens.

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
- **MULTIPLAYER · CODE** badge in the broadcast top-right when a
  multiplayer session is active, plus a connection state pill
  (CONNECTED / RECONNECTING / OFFLINE / ERROR). The local
  championship is never shown in this mode.

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
- MULTIPLAYER indicator + connection state in the broadcast

### Tests
- **118 vitest tests** across 16 files
- Pure-domain logic, deterministic, fast
- Two-client WebSocket smoke test in
  `tests/multiplayer-two-client.cjs` (run manually with the
  multiplayer server up)

## Partially implemented

- 3D track circuits remain flat procedural geometry (no per-track
  elevation models). Acceptable for helicopter broadcast framing.
- Per-track elevation / kerbs / runoff (visually flat right now).
- Interview replayability: interview system fires once per
  triggering race, no follow-up chain.

## Remaining

- Full era-specific car geometry (halo / sidepod / engine cover
  distinct for 1980 vs 2022) — eraFactor wiring is in place.
  P1 visibly differentiates 1980 vs 2022 silhouettes; further
  refinement of nose and wing profiles per era is a follow-up.
- AI fill paddock for solo / local play could use more variety
  (career personality archetypes).
- Staff hiring and facility upgrade timer are UI-present but
  not fully wired to a championship action yet (P1 lays out the
  screens; wiring is a small follow-up).

## Known issues

- The local "Next round" button in local-mode broadcast
  fast-forwards the simulation to completion to avoid getting
  stuck on a long race the player can't skip. This is intentional
  for the local-only path.
- During HMR reload, the 3D view occasionally re-mounts before the
  engine is ready, leaving an empty canvas for ~100ms. Not visible
  in normal use.
- Playwright MCP cannot open two separate browser contexts
  (incognito) in the same server, so the in-tab UI two-client
  verification shares the `mpSession` singleton. The
  `tests/multiplayer-two-client.cjs` script uses two raw
  WebSocket clients (one Playwright tab + one Node client) to
  exercise the real cross-client path against the same server.

## Test count

118/118 passing. TypeScript: clean. Production build: green.
Two-client smoke test: PASS (shared championship ID, identical
finishing order, identical standings, both clients advance to R2).

## Visual identity (P1 completion)

The UI was redesigned as a proper PC motorsport management game:

- New game design system in `src/ui/styles.css` (cinematic,
  panel, card, telemetry, chip layers + motion + typography +
  button hierarchy).
- New main-menu title screen with brand block, mode stack,
  circuit-board SVG, scan lines and kicker metadata.
- New Team HQ hero next-event card with circuit thumbnail and
  stat grid.
- New multiplayer lobby layout (focal code panel + player slots).
- New broadcast chrome: driver follow strip, broadcast timing
  tower, team-colour-stripped driver rows, .b3d-radio-line with
  team-colour stripe.
- New podium presentation with P1/P2/P3 rank gradients.
- New Paddock Post masthead with procedural hero SVG and
  .driver-quote pull-quotes.
- New icon set in `src/ui/icons.ts` (all original, inline SVG).
- Reusable renderers in `src/ui/renderers.ts` (renderHelmet,
  renderTeamMark, renderDriverIdentity, renderKpiTile,
  renderEventHeader, renderEmptyState, renderTeamBar, renderBadge).
- Race Weekend rewritten with .event-header, visual session
  timeline, stint bar timeline, weather forecast strip and
  setup axis block.
- Results rewritten with chequered-flag hero, .podium block,
  race story, player team summary and full classification.
- Drivers rewritten with .driver-card, .driver-agency bars and
  .driver-relation block.
- Car Development rewritten with procedural car-stage SVG,
  .hotspot module buttons, current-vs-next-season tradeoff and
  regulation change banner.
- Facilities, Staff, Sponsors and Standings rewritten with the
  new primitives. Sponsors split into TITLE / MAJOR / TECHNICAL
  tiers.
- New / Fictional career setup is now a cinematic two-card
  selection with .era-strip and an era-summary card showing the
  regulations that change between eras.
- 3D cars now visibly differ between 1980 (narrow, tall airbox,
  tall rear wing, no halo) and 2022 (wide, low airbox, ground-
  effect floor, halo, low rear wing).

See `docs/VISUAL_STYLE_GUIDE.md` and
`docs/ART_ASSET_MANIFEST.md` for the design contract and asset
inventory.

## Last QA

Multiplayer P0 completion pass, 2026-08-27. Two-client verification
screenshot set under `docs/testing/screenshots/multiplayer-p0/`.
