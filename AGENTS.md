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
Phase 1 / Segment 1 complete — `hackslash_engine.js` + `test_hackslash.js`
(56/56 assertions green via `node test_hackslash.js`). Segment 2 (assets,
index.html, styles.css) and Segment 3 (app.js) pending.
