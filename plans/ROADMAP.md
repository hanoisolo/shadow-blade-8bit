# Shadow Blade 8-Bit — Architectural Blueprint & 3-Segment Execution Roadmap

## Stage 1: Context Map & Architectural Invariants

### 1.1 Project Overview
**Shadow Blade 8-Bit** (`shadow-blade-8bit`) is a single-stage retro 8-bit/16-bit NES-style dark-fantasy side-scrolling hack-and-slash web game demo inspired by *Castlevania*, *Rastan*, and *Golden Axe*. Set on a gothic moonlit stone bridge, the player controls a barbarian warrior battling across 3 escalating waves of dungeon monsters (`goblin` scouts, `skeleton` warriors, and a giant horned `ogre` boss) using classic 2-button NES action controls (**HACK** and **JUMP**) plus Left/Right movement.

### 1.2 Canonical File Inventory
| File Path | Role / Responsibility | Segment |
| :--- | :--- | :--- |
| `hackslash_engine.js` | Pure ES6+ Dual UMD deterministic game physics, combat, enemy AI, wave progression, and sample boss battle state engine (`window.HackSlashEngine` / `module.exports`). | Segment 1 |
| `test_hackslash.js` | Zero-dependency Node.js `assert` test suite (35+ engine unit tests in Seg 1, asset & DOM checks in Seg 2, anti-drift DOM contract checks in Seg 3). | Segments 1, 2, 3 |
| `assets/bg_stage.jpg` | Nano Banana 2.1 custom 16-bit gothic moonlit castle stone bridge background. | Segment 2 |
| `assets/hero_sheet.jpg` | Nano Banana 2.1 4-pose horizontal sprite sheet for the barbarian hero on solid pure black background. | Segment 2 |
| `assets/skeleton_sheet.jpg` | Nano Banana 2.1 4-pose horizontal sprite sheet for the undead skeleton swordsman on solid pure black background. | Segment 2 |
| `assets/goblin_sheet.jpg` | Nano Banana 2.1 4-pose horizontal sprite sheet for the green dungeon goblin on solid pure black background. | Segment 2 |
| `assets/ogre_sheet.jpg` | Nano Banana 2.1 4-pose horizontal sprite sheet for the giant horned ogre boss on solid pure black background. | Segment 2 |
| `index.html` | Retro NES arcade cabinet shell, HUD bars, 800x450 `<canvas id="game-canvas">`, tactile D-pad & A/B action buttons, and Enemy Codex grid. | Segment 2 |
| `styles.css` | NES/16-bit pixel art dark-fantasy aesthetic, CRT scanline overlay, arcade button animations, health bar styling, and responsive cabinet layout. | Segment 2 |
| `app.js` | 60fps `requestAnimationFrame` canvas renderer, offscreen chroma-key sprite background stripper, procedural sub-pixel animator, Web Audio API 8-bit SFX synth, keyboard/touch input controller, and `localStorage` persistence. | Segment 3 |

### 1.3 Mandatory Anti-Drift Invariants
1. **Dual UMD Purity**: `hackslash_engine.js` must have zero DOM or browser-only globals at module top-level so it executes identically under headless Node (`require('./hackslash_engine.js')`) and in the browser (`window.HackSlashEngine`).
2. **Web UI DOM Contract Invariant**: 100% of DOM IDs and selectors queried in `app.js` (`document.getElementById`, `querySelector`, `querySelectorAll`) must exist verbatim in `index.html`.
3. **Mandatory Verbatim DOM IDs**:
   - `#game-canvas`
   - `#hud-hero-hp-bar`
   - `#hud-hero-hp-text`
   - `#hud-boss-hp-container`
   - `#hud-boss-hp-bar`
   - `#hud-wave-badge`
   - `#hud-score`
   - `#hud-combo`
   - `#hud-status-banner`
   - `#btn-left`
   - `#btn-right`
   - `#btn-jump`
   - `#btn-hack`
   - `#btn-start-restart`
   - `#btn-load-sample`
   - `#btn-mute-audio`
   - `#enemy-codex-grid`
4. **Plain Git Bash CLI Verification Only**: Every segment gate runs `node --check <file>.js` and `node test_hackslash.js` directly in Git Bash with forward slashes and zero shell redirects or PowerShell cmdlets.

---

## Stage 2: Blueprint & Technical Design

### 2.1 Engine Architecture (`hackslash_engine.js`)
The engine is a deterministic, frame-stepped state machine operating at 60 ticks per second across a `800 x 450` logical stage canvas with `groundY: 360`.

#### Exported Constants
1. **`GAME_CONFIG`**:
   - Stage dimensions & physics: `width: 800`, `height: 450`, `groundY: 360`, `gravity: 0.65`
   - Hero base metrics: `heroWidth: 52`, `heroHeight: 68`, `maxHp: 100`, `speed: 4.5`, `jumpForce: -13.5`, `attackDamage: 25`, `attackRange: 68`, `attackDurationFrames: 14`, `attackCooldownFrames: 20`, `invulnFrames: 30`
2. **`ENEMY_TYPES`**:
   - `goblin`: `{ type: 'goblin', name: 'Dungeon Goblin', maxHp: 30, speed: 3.2, damage: 8, width: 44, height: 48, scoreValue: 100, attackRange: 36, attackCooldownFrames: 35, windupFrames: 10 }`
   - `skeleton`: `{ type: 'skeleton', name: 'Skeleton Warrior', maxHp: 60, speed: 2.0, damage: 14, width: 48, height: 64, scoreValue: 250, attackRange: 48, attackCooldownFrames: 45, windupFrames: 14 }`
   - `ogre`: `{ type: 'ogre', name: 'Horned Ogre Boss', maxHp: 220, speed: 1.1, damage: 28, width: 96, height: 112, scoreValue: 1000, attackRange: 76, attackCooldownFrames: 65, windupFrames: 20, isBoss: true }`
3. **`STAGE_WAVES`**:
   - Wave 1 (`wave: 1`, `"Wave 1: Bridge Ambush"`): 2 Goblins (`goblin`) and 1 Skeleton (`skeleton`) spawning at staggered horizontal positions.
   - Wave 2 (`wave: 2`, `"Wave 2: Undead Vanguard"`): 2 Skeletons (`skeleton`) and 2 Goblins (`goblin`).
   - Wave 3 (`wave: 3`, `"Wave 3: Ogre Gatekeeper"`): 1 Giant Horned Ogre Boss (`ogre`) flanked by 1 Skeleton (`skeleton`) and 1 Goblin (`goblin`).

#### Exported Pure / State-Stepping Functions
4. **`createInitialState(options = {})`**:
   - Initializes `hero` at `{ x: 120, y: config.groundY, vx: 0, vy: 0, width: 52, height: 68, hp: config.maxHp, maxHp: config.maxHp, facing: 1, grounded: true, attackTimer: 0, attackCooldown: 0, invulnTimer: 0, animState: 'idle', animFrame: 0, hasStruckThisSwing: false }`.
   - Spawns Wave 1 enemies from `STAGE_WAVES[0]` (unless custom `enemies` or `wave` are passed in `options`).
   - Initializes `{ hero, enemies, particles: [], floatingTexts: [], wave: 1, totalWaves: STAGE_WAVES.length, score: 0, highScore: options.highScore || 0, combo: 0, maxCombo: 0, hitStopTimer: 0, status: 'playing', frameCount: 0 }`.
5. **`stepHeroPhysics(hero, input, config = GAME_CONFIG)`**:
   - Reads `input` (`{ left: boolean, right: boolean, jump: boolean, hack: boolean }`).
   - Updates `hero.vx` (`-config.speed` if `left` & not `right`, `+config.speed` if `right` & not `left`, `0` otherwise) and sets `hero.facing` (`-1` or `1`).
   - Applies horizontal displacement `hero.x += hero.vx` and clamps `hero.x` within `[0, config.width - hero.width]`.
   - If `input.jump && hero.grounded`, sets `hero.vy = config.jumpForce` and `hero.grounded = false`.
   - Applies gravity: `hero.vy += config.gravity`, `hero.y += hero.vy`.
   - Resolves landing: if `hero.y >= config.groundY`, clamps `hero.y = config.groundY`, `hero.vy = 0`, `hero.grounded = true`.
   - Decrements `attackTimer`, `attackCooldown`, and `invulnTimer` (floor at `0`).
   - Computes `animState` priority: `'hurt'` (when `invulnTimer > config.invulnFrames - 10`) > `'hack'` (when `attackTimer > 0`) > `'jump'` (when `!grounded`) > `'run'` (when `vx !== 0`) > `'idle'`, and advances `animFrame` (`0..3`).
6. **`performHeroHack(state, config = GAME_CONFIG)`**:
   - Returns `{ triggered: false, hits: [] }` if `state.status !== 'playing'` or `state.hero.attackCooldown > 0`.
   - Sets `hero.attackTimer = config.attackDurationFrames`, `hero.attackCooldown = config.attackCooldownFrames`, `hero.animState = 'hack'`, `hero.animFrame = 0`.
   - Computes directional sword reach hitbox:
     - When `hero.facing >= 0` (right): `[hero.x + hero.width * 0.4, hero.x + hero.width + config.attackRange]`
     - When `hero.facing < 0` (left): `[hero.x - config.attackRange, hero.x + hero.width * 0.6]`
     - Vertical span: `[hero.y - hero.height - 16, hero.y + 8]`
   - Checks AABB intersection against every living enemy (`enemy.hp > 0`).
   - For each hit enemy: subtracts `config.attackDamage` from `enemy.hp`, applies horizontal knockback (`enemy.vx = hero.facing * 6`, clamped to stage bounds), sets `enemy.hurtTimer = 10` and `enemy.animState = 'hit'`, increments `state.combo += 1`, updates `state.maxCombo`, adds hit score (`25 * state.combo`), and if `enemy.hp <= 0`, adds `enemy.scoreValue` to `state.score` and removes defeated enemies from `state.enemies` (or filters dead enemies out immediately while recording kills).
   - Sets `state.hitStopTimer = 4` when at least one enemy is struck.
   - Returns `{ triggered: true, hits }`.
7. **`stepEnemiesAI(state, config = GAME_CONFIG)`**:
   - Returns early if `state.status !== 'playing'`.
   - Iterates through living enemies (`enemy.hp > 0`):
     - Decrements `enemy.attackCooldown` and `enemy.hurtTimer`.
     - Computes horizontal distance from enemy center to hero center.
     - Updates `enemy.facing` toward hero (`-1` or `1`).
     - If outside `enemy.attackRange`: moves enemy toward hero at `enemy.speed` (when `hurtTimer === 0`), sets `enemy.animState = 'walk'`, clamps `enemy.x` within `[0, config.width - enemy.width]`.
     - If within `enemy.attackRange` and vertical gap is within strike reach (`Math.abs((hero.y - hero.height / 2) - (enemy.y - enemy.height / 2)) <= Math.max(hero.height, enemy.height) * 0.75`):
       - Enters `'attack'` state and increments `enemy.windupTimer`.
       - When `enemy.windupTimer >= enemy.windupFrames` and `enemy.attackCooldown === 0`: executes strike, resets `enemy.windupTimer = 0`, sets `enemy.attackCooldown = enemy.attackCooldownFrames`.
       - If `hero.invulnTimer === 0`: subtracts `enemy.damage` from `hero.hp` (clamped at `0`), sets `hero.invulnTimer = config.invulnFrames`, resets `state.combo = 0`, sets `hero.animState = 'hurt'`, and applies slight knockback.
   - Checks terminal / wave conditions:
     - If `hero.hp <= 0`: sets `hero.hp = 0`, `state.status = 'gameover'`.
     - Else if `state.enemies.length === 0` (all enemies in current wave defeated):
       - If `state.wave < STAGE_WAVES.length`: increments `state.wave += 1` and spawns the next wave's enemies from `STAGE_WAVES[state.wave - 1]`.
       - Else: sets `state.status = 'victory'`.
8. **`createSampleBossBattleState(config = GAME_CONFIG)`**:
   - Returns a pre-populated mid-action playable state on `wave: 3` (`status: 'playing'`, `score: 1450`, `combo: 4`) with `hero` positioned at `x: 180, y: config.groundY, hp: 85` facing right (`1`), facing 3 active enemies:
     - 1 `goblin` at `x: 340`
     - 1 `skeleton` at `x: 450`
     - 1 `ogre` boss at `x: 580` (`hp: 195`, `maxHp: 220`)
   - Allows instant 1-click verification and showcase of the Wave 3 boss battle via `#btn-load-sample`.

### 2.2 Visual, Chroma-Key, & Procedural Animation Pipeline (`app.js`)
- **Offscreen Chroma-Key Processor**: Sprite sheets generated by Nano Banana 2.1 (`hero_sheet.jpg`, `skeleton_sheet.jpg`, `goblin_sheet.jpg`, `ogre_sheet.jpg`) are rendered on solid pure black backgrounds. On image load, `app.js` draws each sheet onto an offscreen `<canvas>`, inspects pixel RGBA data, and sets `alpha = 0` for background pixels (near-black pixels with low luminance/saturation, plus corner-flood/chroma threshold `R < 32 && G < 32 && B < 32`) while preserving interior outlines and glowing highlights.
- **Hybrid 4-Pose Sheet + Procedural 60fps Motion**:
  - Each sprite sheet is sliced horizontally into 4 frames (`frameIndex = 0..3` corresponding to idle, walk/run, jump/lunge/stomp, and attack/hit).
  - To ensure ultra-smooth 60fps arcade responsiveness, the renderer augments sprite drawing with:
    - Walk-cycle vertical sine bobbing and slight tilt.
    - Jump squash-and-stretch scaling transform based on `vy`.
    - Multi-layered glowing crescent broadsword slash arc on `hack` frames.
    - White/crimson hit-flash overlay when `hurtTimer > 0` or `invulnTimer > 0`.
    - Pixel particle emitter (blood/bone sparks, dust puffs on jump/landing, gold sparks on sword clash) and rising floating damage numbers (`-25`, `COMBO x4!`).

---

## Stage 3: 3-Segment Plan

### Segment 1: Core Hack-and-Slash Engine & Headless Unit Test Suite
- **Files Created/Modified (2 files)**:
  1. `hackslash_engine.js`
  2. `test_hackslash.js`
- **Implementation Scope**:
  - Implement Dual UMD `hackslash_engine.js` exporting `GAME_CONFIG`, `ENEMY_TYPES`, `STAGE_WAVES`, `createInitialState`, `stepHeroPhysics`, `performHeroHack`, `stepEnemiesAI`, `createSampleBossBattleState`, and helper `spawnWaveEnemies`.
  - Implement `test_hackslash.js` with 35+ deterministic Node `assert` unit tests covering every exported constant, physics edge case, directional combat hitbox, cooldown, enemy AI windup/damage, invulnerability frame protection, wave 1->2->3 progression, victory/gameover state transitions, and sample boss state invariants.
- **Plain CLI Verification Gate**:
  - `node --check hackslash_engine.js`
  - `node --check test_hackslash.js`
  - `node test_hackslash.js`

### Segment 2: Nano Banana 2.1 Pixel Art Assets, Retro NES UI Shell, & Asset/DOM Tests
- **Assets Generated via `python ../generate_image.py` (5 files)**:
  1. `assets/bg_stage.jpg`
  2. `assets/hero_sheet.jpg`
  3. `assets/skeleton_sheet.jpg`
  4. `assets/goblin_sheet.jpg`
  5. `assets/ogre_sheet.jpg`
- **Source Files Created/Modified (3 files)**:
  1. `index.html`
  2. `styles.css`
  3. `test_hackslash.js` (append Segment 2 Asset & DOM verification suites)
- **Implementation Scope**:
  - Invoke `python ../generate_image.py --prompt "..." --out assets/<filename>.jpg` for each of the 5 dark-fantasy 16-bit pixel art assets.
  - Build `index.html` containing all 17 mandatory DOM IDs verbatim (`#game-canvas`, `#hud-hero-hp-bar`, `#hud-hero-hp-text`, `#hud-boss-hp-container`, `#hud-boss-hp-bar`, `#hud-wave-badge`, `#hud-score`, `#hud-combo`, `#hud-status-banner`, `#btn-left`, `#btn-right`, `#btn-jump`, `#btn-hack`, `#btn-start-restart`, `#btn-load-sample`, `#btn-mute-audio`, `#enemy-codex-grid`).
  - Build `styles.css` with authentic NES/16-bit dark-fantasy styling, gold/crimson pixel borders, CRT scanline toggle/overlay, responsive arcade controls, and Enemy Codex cards displaying the sprite sheets and enemy stats.
  - Append Segment 2 tests in `test_hackslash.js` asserting all 5 `.jpg` files exist on disk, are `> 10000` bytes, start with JPEG magic bytes (`0xFF, 0xD8, 0xFF`), and all 17 mandatory DOM IDs exist in `index.html`.
- **Plain CLI Verification Gate**:
  - `node --check test_hackslash.js`
  - `node test_hackslash.js`

### Segment 3: 60fps Canvas Renderer, Chroma-Key Processor, Web Audio Synth, & Anti-Drift Verification
- **Files Created/Modified (2 files)**:
  1. `app.js`
  2. `test_hackslash.js` (append Segment 3 DOM Anti-Drift & App Wiring verification suite)
- **Implementation Scope**:
  - Implement `app.js` connecting `window.HackSlashEngine` to `#game-canvas` and all HUD/button elements.
  - Implement offscreen canvas chroma-key background removal for `hero_sheet.jpg`, `skeleton_sheet.jpg`, `goblin_sheet.jpg`, and `ogre_sheet.jpg`, plus crisp procedural pixel fallback rendering if images are still decoding.
  - Implement 60fps `requestAnimationFrame` loop with parallax moonlit bridge scrolling, 4-frame sprite slicing, procedural bob/squash/slash-arc trails, floating damage text, particle bursts, and screen shake on boss hits.
  - Implement keyboard controls (`ArrowLeft`/`ArrowRight`/`KeyA`/`KeyD`, `KeyZ`/`KeyJ` for HACK, `Space`/`KeyK` for JUMP) and pointer/touch bindings for `#btn-left`, `#btn-right`, `#btn-jump`, `#btn-hack`, `#btn-start-restart`, `#btn-load-sample`, and `#btn-mute-audio`.
  - Implement Web Audio API 8-bit chiptune sound effect generator (square/sawtooth/noise channels for sword slash, jump, hit crunch, boss roar, victory fanfare, and gameover tone) and `localStorage` persistence under key `shadow_blade_8bit_state_v1`.
  - Populate `#enemy-codex-grid` dynamically or verify interactive codex synchronization.
  - Append Segment 3 Anti-Drift tests in `test_hackslash.js` parsing `app.js` for all `getElementById` / `querySelector` / `querySelectorAll` ID references and asserting 100% exist verbatim in `index.html`.
- **Plain CLI Verification Gate**:
  - `node --check app.js`
  - `node --check test_hackslash.js`
  - `node test_hackslash.js`

---

## Stage 4: Segmented Implementation Checklists & Milestones

### Milestone 1 Checklist (Segment 1: `hackslash_engine.js` + `test_hackslash.js`)
- [ ] `GAME_CONFIG` defines `width: 800`, `height: 450`, `groundY: 360`, `gravity: 0.65`, `maxHp: 100`, `speed: 4.5`, `jumpForce: -13.5`, `attackDamage: 25`, `attackRange: 68`, `attackDurationFrames: 14`, `attackCooldownFrames: 20`, `invulnFrames: 30`.
- [ ] `ENEMY_TYPES` defines exact stats for `goblin`, `skeleton`, and `ogre`.
- [ ] `STAGE_WAVES` defines 3 waves (Wave 1: Goblins & Skeletons; Wave 2: Skeletons & Goblins; Wave 3: Ogre Boss + Skeleton + Goblin).
- [ ] `createInitialState(options)` produces isolated mutable state objects with `status: 'playing'`.
- [ ] `stepHeroPhysics(hero, input, config)` handles horizontal movement, stage boundary clamping (`0` to `config.width - hero.width`), jump takeoff (`vy = -13.5`), gravity accumulation (`+0.65`), `groundY` landing resolution, and `animState` transitions (`idle`, `run`, `jump`, `hack`, `hurt`).
- [ ] `performHeroHack(state, config)` enforces `attackCooldown === 0`, checks directional reach hitbox (facing left vs. facing right), damages only enemies in range, applies knockback, increments `combo` and `score`, and removes defeated enemies (`hp <= 0`).
- [ ] `stepEnemiesAI(state, config)` moves living enemies toward the hero, triggers enemy attacks within `attackRange`, respects hero `invulnTimer`, advances waves `1 -> 2 -> 3`, sets `status: 'victory'` when Wave 3 is cleared, and sets `status: 'gameover'` when `hero.hp <= 0`.
- [ ] `createSampleBossBattleState(config)` returns Wave 3 state with 1 `goblin`, 1 `skeleton`, and 1 `ogre` boss.
- [ ] `test_hackslash.js` executes 35+ unit assertions with zero failures.

### Milestone 2 Checklist (Segment 2: 5 Nano Banana 2.1 Assets + `index.html` + `styles.css` + Tests)
- [ ] Generate `assets/bg_stage.jpg` via `python ../generate_image.py --prompt "Dark fantasy 16-bit pixel art side-scrolling game background, gothic ruined castle stone bridge at night, huge glowing full moon, gnarled dead trees, torches, Castlevania style, wide panoramic view" --out assets/bg_stage.jpg`.
- [ ] Generate `assets/hero_sheet.jpg` via `python ../generate_image.py --prompt "16-bit retro pixel art sprite sheet of a muscular dark-fantasy barbarian warrior with a glowing broadsword in 4 poses (idle, running, jumping, sword slashing) arranged horizontally on a solid pure black background, crisp pixel edges" --out assets/hero_sheet.jpg`.
- [ ] Generate `assets/skeleton_sheet.jpg` via `python ../generate_image.py --prompt "16-bit retro pixel art sprite sheet of an undead skeleton warrior holding a jagged sword and round shield in 4 poses (idle, walking, attacking, hit) arranged horizontally on a solid pure black background, crisp pixel art" --out assets/skeleton_sheet.jpg`.
- [ ] Generate `assets/goblin_sheet.jpg` via `python ../generate_image.py --prompt "16-bit retro pixel art sprite sheet of a crouching green dungeon goblin with a dagger in 4 poses (idle, sprinting, lunging, hit) arranged horizontally on a solid pure black background, crisp pixel art" --out assets/goblin_sheet.jpg`.
- [ ] Generate `assets/ogre_sheet.jpg` via `python ../generate_image.py --prompt "16-bit retro pixel art sprite sheet of a massive giant horned ogre boss wielding a spiked iron club in 4 poses (idle, stomping, smashing club, roaring) arranged horizontally on a solid pure black background, crisp pixel art" --out assets/ogre_sheet.jpg`.
- [ ] `index.html` contains all 17 mandatory DOM IDs and loads `styles.css`, `hackslash_engine.js`, and `app.js`.
- [ ] `test_hackslash.js` verifies all 5 `.jpg` assets (`> 10,000` bytes + `0xFF 0xD8 0xFF` JPEG header) and all 17 mandatory DOM IDs in `index.html`.

### Milestone 3 Checklist (Segment 3: `app.js` + Anti-Drift Contract Tests)
- [ ] `app.js` strips solid black backgrounds from all 4 sprite sheets via offscreen canvas chroma-keying.
- [ ] `app.js` runs a 60fps animation loop rendering `bg_stage.jpg`, chroma-keyed 4-pose sprites, procedural sub-pixel bobbing/squash/slash arcs, floating combat text, and particle bursts.
- [ ] `app.js` binds keyboard + mouse/touch controls for Left, Right, JUMP, HACK, Start/Restart, Load Sample Boss Battle, and Mute Audio.
- [ ] `app.js` synthesizes retro 8-bit SFX via Web Audio API and persists high scores in `localStorage` (`shadow_blade_8bit_state_v1`).
- [ ] `test_hackslash.js` verifies 100% of DOM IDs queried in `app.js` exist verbatim in `index.html`.

---

## Stage 5: Full Verification Gate Specification

At the conclusion of Segment 3, the executor must run the complete syntax and test verification gate in plain Git Bash:

```bash
node --check hackslash_engine.js
node --check app.js
node --check test_hackslash.js
node test_hackslash.js
```

All syntax checks must exit with code `0`, and `node test_hackslash.js` must report 100% passing assertions across:
1. Segment 1 Engine Physics, Combat, AI, Wave Progression, and Sample Boss State tests (35+ assertions).
2. Segment 2 Nano Banana 2.1 JPEG Asset integrity (`exists`, `size > 10000`, `0xFF 0xD8 0xFF` magic bytes) and Mandatory DOM ID presence tests.
3. Segment 3 Web UI Anti-Drift DOM Contract tests (`app.js` <-> `index.html` 100% selector parity).

---

## Stage 6: Assertion Integrity Audit

- **Baseline Status**: Greenfield repository (`GREENFIELD_0_TESTS`).
- **Planned Assertion Coverage**:
  - 35+ strict equality/range assertions on `hackslash_engine.js` in Segment 1.
  - 15+ binary magic-byte, file-size, and HTML DOM ID assertions in Segment 2.
  - Strict regex-extracted DOM ID anti-drift cross-check assertions between `app.js` and `index.html` in Segment 3.
- **Audit Determination**: Zero existing tests weakened, skipped, or broadened; all planned gates use deterministic Node `assert` checks.

AUDIT: PASS - assertions intact, no weakening detected