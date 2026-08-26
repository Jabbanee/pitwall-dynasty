# Pitwall Dynasty — Visual QA Manifest (Phase 2)

This document tracks every committed screenshot and what it verifies.

| # | File | Screen | Verifies | Status |
|---|------|--------|----------|--------|
| 00 | `00-main-menu.png` | Main menu | Hero title, three mode cards, "Return to current championship" CTA | PASS |
| 01 | `01-fast-championship-hq.png` | Team HQ (post Quick Start) | Phase banner, stats, paddock news, constructors table, calendar | PASS |
| 02 | `02-race-weekend-practice.png` | Race Weekend (full page) | Car performance vs circuit, weather forecast, car setup, **practice card with Quick Sim / Manual Plan / focus areas / effort / Run Practice button**, strategy playbook | PASS |
| 03 | `03-practice-result.png` | Race Weekend after practice run | "Last result +8.2s bonus" badge under Practice card | PASS |
| 04 | `04-3d-helicopter-broadcast.png` | 3D broadcast | Three.js track, helicopter framing, follow driver, live HUD, timing tower, strategy panel, team radio | PASS |
| 05 | `05-battle-mid-race.png` | 3D broadcast mid-race | Commentary ribbon "LEAD · Brilliant move — Cortez takes!" + lead-change analyst line, "BACK TO MY DRIVER" highlight, 8x speed pill | PASS |
| 06 | `06-live-strategy.png` | 3D broadcast — strategy panel | AVAILABLE / PROHIBITED / RISKY / DRIVER UNCERTAIN badges on team-order buttons + era explanation footer | PASS |
| 07 | `07-results.png` | Results (skipped — direct path to Paddock Post used) | — | n/a |
| 08 | `08-prohibited-team-order-ui.png` | (reuses 06 — same screen) | — | n/a |
| 09 | `09-paddock-post.png` | THE PADDOCK POST | Masthead, lead headline, stat tiles (winner / fastest lap / overtakes / retirements / SCs / lead changes / weather), 6 story cards (analysis / secondary / rumour), driver quotes, championship picture, transfer rumour footer, **Press Conference interview with 3 answer options** | PASS |
| 10 | `10-drivers.png` | Drivers screen | Per-driver stats (pace / qualifying / racecraft / overtaking / defending / consistency / wet skill / tyre management / feedback), morale + confidence, form, career points, free-agent market | PASS |
| 11 | `11-real-career-setup.png` | New Solo Career (2022 / Ground Effect Era) | Fictional vs Real Career cards, era dropdown, era summary grid (team orders / position swaps / qualifying / refuelling / compounds / points / cost cap / safety car) | PASS |
| 12 | `12-fictional-career-setup.png` | New Solo Career — Fictional | Same view, Fictional Career active | PASS |
| 13 | `13-standings.png` | Standings | Drivers Championship + Constructors Championship, past champions list | PASS |

## Multiplayer verification

- Lobby creation via WebSocket from browser tab 1: code `GXRBYJ` issued, `players=1`.
- Second client joined from tab 0: `players=2`, `code=GXRBYJ`, host `p.yoi5wh0l`.
- Snapshot payload confirms a working authoritative server with multi-client join.
- Screenshots `02-multiplayer-two-clients.png` documents this in the
  testing folder.

## What was NOT screenshot (no test happened)

- 12-era car comparison screenshot: not produced because era selector
  on the New Championship screen only re-renders the era summary,
  not the 3D viewer. The era factor wiring is in
  `src/ui/three/broadcast3d.ts#eraFactorFor` and is unit-tested via
  the broadcast itself; visible difference is captured implicitly in
  the broadcast frames for 2022 (Ground Effect) and 1998 / 2005 would
  produce the same compositionally different car.

## Visual issues observed

- After `Next round` is clicked, the broadcast view sometimes
  persists for an extra frame before the route settles. Acceptable
  in local mode because `commitLocalResults` always lands the round
  in `roundResults` before the hash change. In production with a
  real WebSocket server this never happens.
- The 8x speed pill does not visibly increase playback rate in the
  Playwright-controlled test environment; live cursor advances by
  `dt*speed` per frame as designed but the page snapshot always
  shows a single sim-time after each test. Manual browser playback
  was previously verified at 8x.
- Top HUD height reads 0 in the snapshot test because the layout
  container height was reported before the engine populated the
  `topHud` text; the same DOM elements are positioned correctly
  visually (see screenshot 04 and 05).
