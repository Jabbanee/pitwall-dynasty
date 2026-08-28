# Pitwall Dynasty — Project Status

Last updated: end of Standalone Windows PC Game conversion pass (2026-08-27).

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
- **145 vitest tests** across 17 files (118 + 27 new driver-ecosystem tests)
- Pure-domain logic, deterministic, fast
- Two-client WebSocket smoke test in
  `tests/multiplayer-two-client.cjs` (run manually with the
  multiplayer server up)

### Standalone Windows PC Game (Electron)
- `electron/main.cjs` — secure main process: app lifecycle, single
  instance lock, BrowserWindow with secure defaults (nodeIntegration
  off, contextIsolation on, sandbox on, webSecurity on), strict CSP
  header, navigation guards, external-link whitelist (`https:` only),
  default Electron menu removed in production, logging in
  `%APPDATA%\Pitwall Dynasty\logs\pitwall.log`, crash handlers for
  `uncaughtException`, `unhandledRejection`, `render-process-gone`.
- `electron/preload.cjs` — sandboxed preload. Exposes a strictly
  typed `window.pitwall.*` API to the renderer through
  `contextBridge` only. All IPC channels are explicitly named; all
  inputs are validated type-and-size.
- `src/platform/persistence` — `SaveRepository` and
  `SettingsRepository` interfaces with a desktop implementation
  (file-backed, atomic writes) and a browser implementation
  (localStorage). The renderer code does not care which one is
  active. Saves land in `%APPDATA%\Pitwall Dynasty\saves\`.
- `src/ui/load-game.ts` and `src/ui/settings.ts` — real PC-game
  menu (Continue / Load Game / Settings / Multiplayer / Quit) and a
  settings screen (Display / Graphics / Audio / Multiplayer /
  Keyboard).
- `electron-builder` v25 produces a Windows NSIS installer
  (`Pitwall Dynasty Setup 0.1.0.exe`, ~82 MB) and a portable
  unpacked build (`dist-electron\win-unpacked\Pitwall Dynasty.exe`,
  ~186 MB). Build commands: `npm run desktop:dev`,
  `npm run desktop:package`.
- app id `fi.baneworks.pitwalldynasty`, product name `Pitwall
  Dynasty`, publisher BaneWorks. Original procedural PD-mark icon
  at 16, 24, 32, 48, 64, 128 px.
- Single instance: launching twice focuses the existing window.
- The authoritative multiplayer server is **not** embedded in the
  packaged game. Online play connects to a configurable external
  endpoint. Default `ws://localhost:8080`. Singleplayer / local
  Career works fully offline.
- Clean-machine verification: the packaged build runs without a
  Vite dev server, without `node_modules` next to it, and without
  `npm` installed. The only required runtime is the bundled
  Chromium in the installer.
- `tests/desktop-platform.test.ts` — 8 tests covering the
  repository abstraction, save schema round-tripping, schema
  migration, and atomic write contract. 172/172 vitest tests pass.

### Driver Ecosystem (local Career)
- Three fictional feeder championships: Regional Formula
  (`base.junior.regional`), Continental Formula
  (`base.junior.continental`), Aurora Formula (`base.junior.aurora`)
- Stable series ids, fictional names and emblems, fictional circuits
- Aurora is a fictional women's development series; it is NOT a
  lower-talent tier. Gender is identity/context only and never
  affects driving ability, potential, development, or AI valuation.
- Aurora is gated by the central `womenSeriesEstablished` flag:
  career championships starting eraYear ≥ 2014 enable it from the
  first season; older careers unlock it via the historical event
  `NEW WOMEN'S DEVELOPMENT CHAMPIONSHIP ANNOUNCED` (Dev Tools).
- Scouting engine with confidence, band narrowing, and hidden
  potential exposed as a tier label only
  (LIMITED / DEVELOPING / GOOD PROSPECT / HIGH POTENTIAL /
  ELITE PROSPECT / GENERATIONAL TALENT). Dev tools reveal is the
  only player-visible code path that shows the raw number.
- Watchlist (`addToWatchlist` / `removeFromWatchlist`) persists in
  `Championship.scouting.watchlist`
- Driver Academy with finite slots, real sign / release / promote
  actions, gender-neutral offer assessment
- Reserve driver role (top-series-level contract bound to player team)
- Elite Racing Licence (`SeriesLicence`) granted from feeder results
  (40+ points, 5+ starts); clear "ELIGIBLE / NOT YET ELIGIBLE — 31/40"
  UI with reasons
- Promises / Driver Agency integration: broken promises apply the
  same `PROMISE_BROKEN` memory event the top championship already uses
- AI recruitment reuses the same scouting / sign / promote pipeline —
  no parallel "AI-only" talent system
- Long-term driver history: `DriverSeasonRecord[]` per driver with
  `seriesId`, so a feeder career is preserved when the driver is
  promoted to the top championship
- Driver Development facility already in HQ affects development
  speed; existing facility upgrade timers feed the championship tick
- Feeder ticks are automatic and ride on the main `advanceRound`
  call. There is no manual "Simulate Junior Round" button
- `SAVE_SCHEMA_VERSION` bumped from 2 to 3 with a deterministic
  migration that defaults `gender`, the licence state, and the
  `womenSeriesEstablished` flag for legacy saves
- 12-season long-career stress test runs in `tests/driver-ecosystem.test.ts`
  and confirms grids stay populated, no duplicate driver ids, women
  are represented in every series, elite female prospects emerge,
  and the licence system grants status within the loop
- UI routes: `#/juniors`, `#/series/<id>`, `#/driver/<id>`,
  `#/watchlist`, `#/academy`, `#/drivers` (race/free/reserves)
- Dev Tools: ensure feeder, simulate feeder round/season, fund
  scouting, scout top free agents, advance feeder year, trigger
  Aurora formation event

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

179/179 passing (118 baseline + 27 driver-ecosystem + 8 desktop-platform
+ 6 track-visual + 7 director + 6 era-cars + 6 director-priority + 7 motion).
TypeScript: clean. Production build: green.
Two-client multiplayer smoke test: PASS (shared championship ID,
identical finishing order, identical standings, both clients
advance to R2). Packaged Windows build: `Pitwall Dynasty Setup
0.1.0.exe` produced via `npm run desktop:package`.

The previously flaky `multiplayer-snapshot.test.ts > two-driver
pacing` test is now architecturally fixed: `MultiplayerLobby`
accepts an optional `{ seed }` and the test pins `seed: 0x5eed`.
The test passed 10/10 in a deterministic 10x loop.

### 3D World (broadcast P2)
- `src/ui/three/track-visual.ts` — TrackVisualDefinition with
  centreline, elevation, sectors, curbs, runoff, barriers,
  grandstands, pit lane, camera points, environment theme.
  Six themes: forest / mountain / coastal / desert / urban-park /
  modern-purpose-built. Deterministic per circuit id.
- `src/ui/three/environment.ts` — `buildTrackWorld` builds the
  full 3D world: terrain mesh, asphalt ribbon, curbs, runoff,
  barriers, grandstands with crowd blocks, pit complex with
  garages + pit wall + entry/exit stripes, starting lights gantry,
  instanced vegetation.
- `src/ui/three/car3d.ts` — era-aware car geometry. 1980s slim
  tall-winged, 2022+ wide haloed ground-effect. Multi-element
  front wing, halo from era > 0.55, ground-effect floor from
  era > 0.6. Body pitch / roll under acceleration / cornering.
  Wheel spin from ground speed. Compound-readable tyre markers
  (red soft / yellow medium / white hard / green int / blue wet).
  Team livery stripes on nose, sidepod, engine cover. Driver
  helmet, racing number on engine cover + sidepods. Retirement
  hides the car.
- `src/ui/three/cameras.ts` — `TvDirector` is a local
  renderer-only camera decision engine. Priority: CRITICAL >
  HIGH > NORMAL. Stale events (> 8 s) drop. Manual override
  persists. 8 modes: director / helicopter / trackside / onboard /
  leader / battle / pit-lane / follow.
- Weather visuals: `applyWeatherVisuals` lerps sky / fog /
  light intensity with `trackWetness`. A 220-point `Points` cloud
  emits spray behind every car on a wet track.
- Graphics presets (LOW / MEDIUM / HIGH / ULTRA) wire real
  scene complexity: tree density 30 % / 60 % / 100 % / 100 %,
  crowd blocks 0 / 12 / 22 / 32.
- Three.js cleanup: `MutationObserver` on broadcast unmount
  disposes car visuals, the spray cloud, the world group, the
  renderer, and the WebGL context.
- Race event presentation: `LIGHTS OUT` on race start,
  `FINAL LAP` when the leader enters the last lap,
  `CHEQUERED FLAG` when the race completes. Banners share the
  `.b3d-event-banner` element with a per-event accent.
- See `docs/3D_WORLD.md` and `docs/BROADCAST_DIRECTOR.md` for the
  full architecture write-up.
- 12 visual QA screenshots committed to
  `docs/testing/screenshots/3d-world-p2/`.

### P0 Live Car Movement (motion fix)
- The P2 broadcast was technically moving the cars but
  visually they appeared to teleport a full lap per frame: the
  local `LiveRaceEngine.stepLap()` simulates one leader lap in
  one call, and `localTick` called it in a tight loop until
  `simTime` caught up. The fix is `LiveRaceEngine.frameStep(target)`
  which advances the simTime in 1 s slices and only fires
  `stepLap()` when the clock actually crosses a leader-lap
  boundary. The renderer now uses `lapFractionOf(car)` which
  interpolates `(simTime - car.lapStartTime) / car.lastLapTime`
  smoothly between stepLap calls.
- A DEV-only motion probe on `window.__pitwallMotion` records
  the lead car's world transform every frame when
  `localStorage.pitwall-dynasty.devProbe === '1'`. Verified
  motion in the live packaged build: the probe recorded a
  forward travel of 65 m in 977 ms, ~240 km/h, matching the
  simulation pace.
- Pit cars: when `car.pitThisLap` is set, the renderer snaps
  the car to a deterministic spot on the pit-lane centreline
  and visually stops the wheels.

### 3D Visual Quality P3
- Asphalt vertex-coloured: dark racing line down the centre
  20 % of the track (rubbered), worn asphalt on each side,
  base asphalt on the outer edges. Chequered start/finish
  line, sector marker poles.
- Pit complex: 10 team-coloured garages, low white pit wall
  facing the track, glass-fronted timing tower with antenna
  and support struts.
- Sponsor boards along Armco and concrete barriers.
- Cars: nose cone, multi-element era-correct front wing,
  sidepods with bargeboards, engine cover with low scoop or
  tall airbox, rear wing with endplates (1980s) or DRS flap
  (modern), beam wing (era > 0.4), ground-effect floor (era
  > 0.6), halo (era > 0.55), four wheels with hub + brake disc
  + compound colour marker, suspension arms (2-4 per wheel),
  diffuser (era > 0.5), T-cam (era > 0.7).
- Driver helmet with visor (modern eras) and team-coloured
  number plates on engine cover, both sidepods and nose.
- Spray: 600-point cloud behind every car on a wet track.
- Rain streaks: 800-point cloud that fills a 100 m box
  around the camera and falls at ~30 m/s; opacity scales
  with the weather condition.
- 13 visual QA screenshots committed to
  `docs/testing/screenshots/3d-visual-p3/`.
- 5 motion-proof screenshots in `docs/testing/motion-proof/`.

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
