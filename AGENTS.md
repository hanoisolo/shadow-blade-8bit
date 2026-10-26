# AGENTS.md — Shadow Blade 8-Bit

## Project Name
Shadow Blade 8-Bit (NES Two-Button Hack & Slash Demo)

## Active Stack
- HTML5 Canvas (800x450 single-stage side-scroller)
- Retro NES CSS3 styling
- Vanilla ES6+ JavaScript, zero runtime dependencies
- Dual UMD engine: `hackslash_engine.js` (`window.HackSlashEngine` for browser,
  `module.exports` for Node)
- Headless Node `assert` test suite: `test_hackslash.js`

## Canonical File List
- `hackslash_engine.js` — pure game engine (source)
- `index.html` — game shell with mandatory HUD and NES arcade button DOM IDs
- `styles.css` — retro NES styling
- `app.js` — 60fps Canvas animator, chroma-key sprite processor, Web Audio SFX
- `test_hackslash.js` — headless Node test suite (35+ assertions)
- `assets/bg_stage.jpg`, `assets/hero_sheet.jpg`, `assets/skeleton_sheet.jpg`,
  `assets/goblin_sheet.jpg`, `assets/ogre_sheet.jpg` — Nano Banana 2.1 assets
- `plans/` — architect prompts and roadmaps

## CLI Verification Gate (Git Bash)
```
node --check hackslash_engine.js
node --check app.js
node test_hackslash.js
```

## Portability Rule
Always use `python ../ask_gemini.py` and `python ../generate_image.py` with
`--out` flags and zero shell redirects (`>`, `2>`) or shell variables (`$?`,
`$VAR`), so commands run identically in Git Bash, cmd, and PowerShell on both
Windows machines.

## Anti-Drift Invariant (Web UI stack)
Every `getElementById` / `querySelector` / `data-*` selector queried in
`app.js` must exist verbatim in `index.html`; asserted headlessly in
`test_hackslash.js`.

## Current Status
Phase 1 COMPLETE (Segments 1-3). 106/106 headless assertions green via
`node test_hackslash.js` (56 engine + 37 asset/DOM + 13 controller/anti-drift).
Stage 6 Gemini 4 Argon audit: `AUDIT VERDICT: PASS`
(plans/stage6_audit.md). Playable demo: open index.html in a browser.

## Active File Map
| File | Role |
| :--- | :--- |
| `hackslash_engine.js` | Dual UMD deterministic game engine (source) |
| `app.js` | 60fps Canvas renderer, chroma-key processor, Web Audio SFX, input, persistence |
| `index.html` | NES arcade shell, 17 mandatory DOM IDs, HUD, buttons, Enemy Codex |
| `styles.css` | Retro NES cabinet / CRT styling |
| `test_hackslash.js` | 106 headless Node assert tests (CLI gate) |
| `assets/*.jpg` | 5 Nano Banana 2.1 pixel art assets |
| `plans/` | Roadmap, architect prompts, Stage 6 audit |

## Audit Outcome
Stage 6 assertion integrity audit (plans/stage6_audit.md): all Segment 1 and
Segment 2 assertions intact; one Segment 2 temporary guard ("app.js NOT
linked") legitimately superseded in Segment 3 to enforce app.js linking and
script order; Segment 3 tests appended cleanly. Secret hygiene: clean.
