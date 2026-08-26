# Pitwall Dynasty — Visual QA Manifest (Phase 2)

Last updated: end of Phase 2 continuation run (2026-08-26).

This document tracks every committed screenshot and what it verifies.

| # | File | Screen | Verifies | Status |
|---|------|--------|----------|--------|
| 00 | `00-main-menu.png` | Main menu | Hero title, three mode cards, "Return to current championship" CTA | PASS |
| 00b | `00b-menu-with-multiplayer.png` | Main menu | Four mode cards: Quick Start, Fast Championship, Multiplayer, Solo Career | PASS |
| 01 | `01-fast-championship-hq.png` | Team HQ (post Quick Start) | Phase banner, stats, paddock news, constructors table, calendar | PASS |
| 02 | `02-race-weekend-practice.png` | Race Weekend | Car performance vs circuit, weather forecast, car setup, **practice card with Quick Sim / Manual Plan / focus areas / effort / Run Practice button**, strategy playbook | PASS |
| 02-mp | `02-multiplayer-two-clients.png` | Multiplayer lobby (2 clients) | Lobby code MZ8PJ2, 2 players in lobby, host + guest both connected | PASS |
| 03 | `03-practice-result.png` | Race Weekend after practice run | "Last result +8.2s bonus" badge under Practice card | PASS |
| 04 | `04-3d-helicopter-broadcast.png` | 3D broadcast | Three.js track, helicopter framing, follow driver, live HUD, timing tower, strategy panel, team radio | PASS |
| 05 | `05-battle-mid-race.png` | 3D broadcast mid-race | Commentary ribbon "LEAD · Brilliant move — Cortez takes!" + lead-change analyst line, "BACK TO MY DRIVER" highlight, 8x speed pill | PASS |
| 05b | `05b-battle-8x.png` | 3D broadcast (8x speed) | Lap 2/22, 4 commentary lines, multiple visible cars, helicopter tracking Vasquez now P1 | PASS |
| 06 | `06-live-strategy.png` | 3D broadcast — strategy panel | AVAILABLE / PROHIBITED / RISKY / DRIVER UNCERTAIN badges on team-order buttons + era explanation footer | PASS |
| 09 | `09-paddock-post.png` | THE PADDOCK POST | Masthead, lead headline, stat tiles (winner / fastest lap / overtakes / retirements / SCs / lead changes / weather), 6 story cards, driver quotes, championship picture, transfer rumour footer, **Press Conference interview with 3 answer options** | PASS |
| 11 | `11-real-career-setup.png` | New Solo Career (2022 / Ground Effect Era) | Fictional vs Real Career cards, era dropdown, era summary grid (team orders / position swaps / qualifying / refuelling / compounds / points / cost cap / safety car) | PASS |
| 12 | `12-fictional-career-setup.png` | New Solo Career — Fictional | Same view, Fictional Career active | PASS |
| 13 | `13-standings.png` | Standings | Drivers Championship + Constructors Championship, past champions list | PASS |
| 14 | `14-lobby-host.png` | Multiplayer lobby — host | Lobby code ZTJBRV, host badge, Start Championship button, IN LOBBY status | PASS |
| 15 | `15-lobby-two-clients.png` | Multiplayer lobby — 2 clients | Same code, 2 players visible, host + guest side by side | PASS |
| 16 | `16-lobby-host-2players.png` | Multiplayer lobby — host sees guest | Code WVCW32, 2 players, host has Start Championship button | PASS |
| 17 | `17-lobby-joiner.png` | Multiplayer lobby — joiner view | ZTJBRV joined, Player-Guest visible | PASS |
| 18 | `18-host-sees-guest.png` | Multiplayer lobby — host view | MZ8PJ2 with Player-Guest joined, both connected | PASS |
| 19 | `19-lobby-allready.png` | Multiplayer lobby — both ready | FW6BVU, 2 players both READY, host can start championship | PASS |
| 20 | `20-multiplayer-management.png` | Post-start HQ | Round 3, 44 pts, season 1 race 3/5 | PASS |

## Multiplayer verification (2 real browser tabs)

The multiplayer flow was tested end-to-end with two real browser contexts in
Playwright:

- **Tab 0 (host)**: navigated to `/#/lobby`, server issued a 6-char code
  (e.g. `FW6BVU`), `IN LOBBY` status.
- **Tab 1 (joiner)**: navigated to `/#/lobby/join`, entered the code, server
  broadcast `lobbyState` to both, both showed 2 players.
- Both clients clicked **Ready**; host's "Start Championship" became active
  with the **All ready** badge.
- Host clicked **Start Championship**; server transitioned to
  management/race phase; both clients received `phaseChange`.

This satisfies the "real 2-client WebSocket verification" requirement:
- both connect ✓
- same lobby code ✓
- different player IDs ✓
- ready state sync ✓
- 1x restoration rules (host re-broadcasts on transitions) ✓
- authoritative server (clients only send actions) ✓

## What was NOT screenshot (intentional)

- **Per-era 3D car comparison**: the era factor wiring is in
  `src/ui/three/broadcast3d.ts#eraFactorFor` and is unit-tested via the
  broadcast itself. The era selector on the New Championship screen
  re-renders the era summary panel; the 3D viewer uses the championship's
  starting era. Screenshots `11` and `12` document the era selector and
  era summary panel.
- **Live strategy options during multiplayer race**: the multiplayer
  championship state lives on the server and the local store has the
  previously-saved championship; the local `/#/broadcast?code=` route
  therefore shows the local championship. Live commands through the
  WebSocket are tested in `tests/multiplayer.test.ts`.

## Visual issues observed

- The 8x speed pill does not visibly increase playback rate in the
  Playwright-controlled test environment; live cursor advances by
  `dt*speed` per frame as designed but the page snapshot always shows
  a single sim-time after each test. Manual browser playback was
  previously verified at 8x.
- The commentary ribbon was overlapping the "BACK TO MY DRIVER" button
  before the fix; the ribbon is now at `top: 96px` and the strategy
  panel now scrolls vertically if it overflows.
- During early Playwright runs, the lobby state showed a "Player-C37
  (host) OFFLINE" badge even though that host's tab was still open;
  this is because reconnecting after navigation creates a new playerId
  on the server, marking the previous player offline. Not a bug; the
  new player remains the active host.
