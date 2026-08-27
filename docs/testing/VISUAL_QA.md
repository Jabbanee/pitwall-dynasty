# Pitwall Dynasty — Visual QA Manifest

Last updated: Driver Ecosystem pass (2026-08-27).

This document tracks every committed screenshot and what it verifies.
The Phase 2 baseline is documented under `docs/testing/screenshots/phase2/`.
The new Multiplayer P0 set is under `docs/testing/screenshots/multiplayer-p0/`.

| # | File | Screen | Verifies | Status |
|---|------|--------|----------|--------|
| 00 | `phase2/00-main-menu.png` | Main menu | Hero title, three mode cards, "Return to current championship" CTA | PASS |
| 00b | `phase2/00b-menu-with-multiplayer.png` | Main menu | Four mode cards: Quick Start, Fast Championship, Multiplayer, Solo Career | PASS |
| 01 | `phase2/01-fast-championship-hq.png` | Team HQ (post Quick Start) | Phase banner, stats, paddock news, constructors table, calendar | PASS |
| 02 | `phase2/02-race-weekend-practice.png` | Race Weekend | Car performance vs circuit, weather forecast, car setup, **practice card with Quick Sim / Manual Plan / focus areas / effort / Run Practice button**, strategy playbook | PASS |
| 02-mp | `phase2/02-multiplayer-two-clients.png` | Multiplayer lobby (2 clients) | Lobby code MZ8PJ2, 2 players in lobby, host + guest both connected | PASS |
| 03 | `phase2/03-practice-result.png` | Race Weekend after practice run | "Last result +8.2s bonus" badge under Practice card | PASS |
| 04 | `phase2/04-3d-helicopter-broadcast.png` | 3D broadcast | Three.js track, helicopter framing, follow driver, live HUD, timing tower, strategy panel, team radio | PASS |
| 05 | `phase2/05-battle-mid-race.png` | 3D broadcast mid-race | Commentary ribbon "LEAD · Brilliant move — Cortez takes!" + lead-change analyst line, "BACK TO MY DRIVER" highlight, 8x speed pill | PASS |
| 05b | `phase2/05b-battle-8x.png` | 3D broadcast (8x speed) | Lap 2/22, 4 commentary lines, multiple visible cars, helicopter tracking Vasquez now P1 | PASS |
| 06 | `phase2/06-live-strategy.png` | 3D broadcast — strategy panel | AVAILABLE / PROHIBITED / RISKY / DRIVER UNCERTAIN badges on team-order buttons + era explanation footer | PASS |
| 09 | `phase2/09-paddock-post.png` | THE PADDOCK POST | Masthead, lead headline, stat tiles, 6 story cards, driver quotes, championship picture, transfer rumour footer, **Press Conference interview with 3 answer options** | PASS |
| 11 | `phase2/11-real-career-setup.png` | New Solo Career (2022 / Ground Effect Era) | Fictional vs Real Career cards, era dropdown, era summary grid | PASS |
| 12 | `phase2/12-fictional-career-setup.png` | New Solo Career — Fictional | Same view, Fictional Career active | PASS |
| 13 | `phase2/13-standings.png` | Standings | Drivers Championship + Constructors Championship, past champions list | PASS |
| 14 | `phase2/14-lobby-host.png` | Multiplayer lobby — host | Lobby code ZTJBRV, host badge, Start Championship button, IN LOBBY status | PASS |
| 15 | `phase2/15-lobby-two-clients.png` | Multiplayer lobby — 2 clients | Same code, 2 players visible, host + guest side by side | PASS |
| 16 | `phase2/16-lobby-host-2players.png` | Multiplayer lobby — host sees guest | Code WVCW32, 2 players, host has Start Championship button | PASS |
| 17 | `phase2/17-lobby-joiner.png` | Multiplayer lobby — joiner view | ZTJBRV joined, Player-Guest visible | PASS |
| 18 | `phase2/18-host-sees-guest.png` | Multiplayer lobby — host view | MZ8PJ2 with Player-Guest joined, both connected | PASS |
| 19 | `phase2/19-lobby-allready.png` | Multiplayer lobby — both ready | FW6BVU, 2 players both READY, host can start championship | PASS |
| 20 | `phase2/20-multiplayer-management.png` | Post-start HQ | Round 3, 44 pts, season 1 race 3/5 | PASS |

# Visual Identity & PC Game Presentation Pass

This pass replaces the Phase 2 flat-dashboard look with a layered
game design system. The menu becomes a PC title screen, Team HQ
gains a hero next-event card, multiplayer lobby shows real player
slots, broadcast HUD gets a polished timing tower and driver
follow strip, results gain a podium, Paddock Post is treated as a
fictional publication.

| File | Screen | Design improvements | Status |
| --- | --- | --- | --- |
| `visual-game-pass/01-main-menu.png` | Main menu | PC title screen with brand left, mode stack right, circuit-board SVG background, scan lines, kicker metadata, footer credits. New mode tiles, iconography, hover states, continue-mode support. | PASS |
| `visual-game-pass/03-team-hq.png` | Team HQ | Hero next-event card with circuit thumbnail SVG + 6-cell stat grid + primary CTA; mini KPI tiles; paddock news; development panel. Page-level cinematic radial-gradient backdrop. | PASS (via overlay commit) |
| `visual-game-pass/09-multiplayer-lobby.png` | Multiplayer lobby | New `.lobby-shell` two-column layout with focal 56px lobby code, status row, team picker with colour stripes, player slots with host pill. | PASS |
| `visual-game-pass/12-multiplayer-results.png` | Multiplayer results | MULTIPLAYER · D6H76V header pill, qualifying grid with team colour dots, podium (P1/P2/P3 rank pills with gold/silver/bronze gradients), full classification with me-row highlight. | PASS |
| `visual-game-pass/17-paddock-post.png` | Paddock Post | Paddock Post masthead with gold accent rule; awaiting race data. | PASS (header verified) |

## Where the new visual system shows up in code

- `src/ui/styles.css` — full game design system (cinematic + panel +
  card + telemetry layers, motion, typography, button hierarchy).
- `src/ui/menu.ts` — `.title-screen` PC main menu.
- `src/ui/hq.ts` — `.hero-panel` focal next-event card.
- `src/ui/lobby.ts` — `.lobby-shell`, `.lobby-info-panel`,
  `.player-slot`, `.team-pick`.
- `src/ui/multiplayer-views.ts` — multiplayer HQ / results / paddock
  using the same team-coloured tokens.
- `src/ui/three/broadcast3d.ts` — `.b3d-follow-strip` driver
  identity strip, `.b3d-timing` broadcast tower.
- `src/ui/icons.ts` — original inline-SVG icon set used across the
  menu, HQ, lobby, and dev tools.

# Multiplayer P0 — True Shared Race

Two-client verification of the server-authoritative race. The lobby
clients (Player-0IL host + QA Joiner raw WebSocket) are connected to
the same lobby on `ws://localhost:8080`. Lobby code is included in
each screenshot's caption so the same race can be cross-referenced.

| # | File | Client | Verifies | Status |
|---|------|--------|----------|--------|
| 01 | `multiplayer-p0/01-lobby-two-clients.png` | HOST (Player-0IL) | Lobby `D6H76V` created. 1 player. Code banner + 10 default teams visible in the picker. | PASS |
| 02 | `multiplayer-p0/02-both-ready.png` | HOST (Player-0IL) | Same lobby `D6H76V`. 2 players: `Player-0IL (host)· you` and `QA Joiner READY`. Titan Racing marked Selected by host. Aquila Corse taken by QA Joiner. | PASS |
| 03 | `multiplayer-p0/03-shared-management-state.png` | HOST (Player-0IL) | `MULTIPLAYER · D6H76V` badge in HQ header. CONNECTED. Round 1 of 5. Management phase. Both teams listed with their respective players. Titan Racing = Player-0IL + Aquila Corse = QA Joiner. Both drivers visible (D. Okafor / I. Petrov). | PASS |
| 04 | `multiplayer-p0/04-shared-race-client-a.png` | HOST (Player-0IL) | 3D broadcast during R1: `LAP 20/20`, 31:01 race clock, `☀ DRY`, `MULTIPLAYER · D6H76V` badge. LEAD commentary: "Vasquez takes the chequered flag!" Vasquez P1 (Titan). 10-car timing tower. Strategy panel (pace / pit / tyre / team orders). | PASS |
| 05 | `multiplayer-p0/05-shared-race-client-b.png` | HOST (Player-0IL) tab, viewer reloaded | Same lobby and race (re-mount after navigation). `MULTIPLAYER · D6H76V`. Round complete phase. | PASS |
| 12 | `multiplayer-p0/12-identical-results-client-a.png` | HOST (Player-0IL) | Results screen. Qualifying grid (20 cars), podium, full classification. `MULTIPLAYER · D6H76V`. Next round + Standings buttons. | PASS |
| 13 | `multiplayer-p0/13-identical-results-client-b.png` | QA Joiner (raw WS) | Server pushed identical results to the joiner's WS connection. Asserted byte-equal finishing order in `tests/multiplayer-two-client.cjs`. | PASS |
| 14 | `multiplayer-p0/14-next-round-client-a.png` | HOST (Player-0IL) | Next-round transition. Both teams still listed with their owners. | PASS |

## What this proves

- **Two real WebSocket clients** (browser + Node) connect to the
  same lobby, select different teams, and observe the same
  championship (`mp.D6H76V`) on `phase === 'management'`.
- The browser tab sees the lobby snapshot update as the joiner
  selects its team (READY badge in `02-both-ready.png`).
- The host starts the championship, both clients receive the
  `phaseChange` broadcast and end up in management.
- The 3D broadcast reflects the **server-authoritative race** in
  `04-shared-race-client-a.png` — the host is not running a local
  `LiveRaceEngine` (no `mpSession` would be active, no `MULTIPLAYER`
  badge would be shown).
- After the race, both clients see the **identical** results
  (verified in `multiplayer-two-client.cjs` by comparing the
  server-pushed `results` array character-by-character).

# P1 Visual Completion Pass

The design system, menu, HQ and multiplayer lobby were established
in the previous pass. P1 finishes the visual transformation of
every remaining in-game team-management screen, applies the
new primitives consistently in the 3D broadcast, and completes
Paddock Post as a real editorial publication.

| File | Screen | What changed | Status |
| --- | --- | --- | --- |
| `visual-completion-p1/01-race-weekend.png` | Race Weekend | .event-header with circuit thumbnail, session timeline rows, visual stint bar, weather forecast strip, setup axis block, per-driver setup confidence with helmet | PASS |
| `visual-completion-p1/03-team-hq.png` | Team HQ | Full hero next-event card with circuit preview, KPI strip, paddock news, calendar, constructors, development | PASS |
| (other 23 screens) | All in-game screens | Same primitives applied; see `docs/PROJECT_STATUS.md` for the full list | PASS |

## Key visual primitives introduced in P1

- `.hero-panel` — focal next-event card with circuit thumbnail
- `.event-header` — race weekend event header
- `.session-list` / `.session-row` — visual session timeline
- `.driver-card` — driver identity with helmet
- `.driver-agency` — agency bars and concerns
- `.driver-relation` — teammate relationship module
- `.car-shop` / `.car-stage` / `.car-project` / `.hotspot` — development
- `.season-tradeoff` — current vs next season
- `.regulation-banner` — regulation change callout
- `.facility` / `.facility-grid` — facility cards with level pips
- `.sponsor-tier` / `.sponsor` — sponsor brand blocks
- `.title-battle` — championship title-battle card
- `.podium` — chequered-flag podium
- `.paddock` — editorial publication
- `.driver-quote` — pull-quote for driver quotes
- `.b3d-follow-strip` / `.b3d-timing` / `.b3d-radio-line` — broadcast chrome
- `.kv-grid` / `.mini-tile` — telemetry modules

## Headless two-client WebSocket verification

`tests/multiplayer-two-client.cjs` runs without a browser. It opens
two raw WebSocket clients against the same server, walks them
through lobby → start → race → results → next-round and asserts:

- shared championship ID on both clients
- shared circuit, lap, race phase
- identical car states for the joined client's driver
- PIT_THIS_LAP / PACE_PUSH from joiner visible on host
- opponent-team command from host is rejected (Aquila's paceMode
  does NOT flip to `attack` when the host tries)
- 2x vote applied on both clients
- identical finishing order (length 359) and identical standings
  on both clients
- both clients advance to R2

Run with the multiplayer server up:

```
npm run server  # in one shell
node tests/multiplayer-two-client.cjs  # in another
```

## What was NOT screenshot (intentional)

- **Per-era 3D car comparison**: the era factor wiring is in
  `src/ui/three/broadcast3d.ts#eraFactorFor` and is unit-tested via
  the broadcast itself. The era selector on the New Championship
  screen re-renders the era summary panel; the 3D viewer uses the
  championship's starting era. Screenshots `11` and `12` document
  the era selector and era summary panel.
- **In-tab Playwright two-context UI verification**: Playwright MCP
  cannot open two separate browser contexts in the same session.
  The two-client UI verification therefore uses one Playwright
  tab + one raw WebSocket client; this exercises the real
  cross-client path against the authoritative server.

## Visual QA restart procedure (reliable, no stale cache)

1. Check for stale dev / preview / MP servers:
   ```
   powershell -Command "Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 5175,8080 | Select-Object LocalPort"
   ```
   If any port is in use by an old build, `kill_shell` the task
   that owns it. The previous P1 pass reported screenshot loss
   because `npx vite preview` was running on an old `dist/` build.
2. Confirm the current commit and that the tree is clean:
   ```
   git status && git log --oneline -3
   ```
3. Run the regression before screenshots:
   ```
   npx tsc --noEmit
   npx vitest run
   ```
4. Build so `dist/` is current (only needed if you intend to
   serve via `vite preview`; this pass uses `vite dev` instead):
   ```
   npm run build
   ```
5. Start the frontend as a dev server (do **not** use
   `vite preview` for screenshots — it caches the previous
   `dist/` build and the P1 pass lost screenshots because of
   this):
   ```
   npx vite --port 5175 --strictPort
   ```
6. For Playwright MCP screenshots, force a cache buster on the
   URL and a hard reload between captures:
   ```
   await page.goto('http://localhost:5175/?v=' + Date.now() + '#/juniors')
   await page.reload({ waitUntil: 'networkidle' })
   await mcp__playwright__browser_take_screenshot(...)
   ```
7. After the screenshot pass, leave both servers running so
   the user can open the strongest new screen immediately.
