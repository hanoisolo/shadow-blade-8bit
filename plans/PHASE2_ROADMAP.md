# Shadow Blade 8-Bit — Phase 2 Master Roadmap (`plans/PHASE2_ROADMAP.md`)

---

## Stage 1: Context Map & Architectural Baseline

### 1.1 Project Identity & Baseline State
- **Project**: `shadow-blade-8bit` (Tier 2 Upgrade — Side-Scrolling Platformer, Elevated Ranged Enemies & Boss Gate Arena)
- **Stack**: Web UI (HTML5 / CSS3 / Vanilla ES6+ JavaScript, zero runtime dependencies) | HTML5 Canvas `800x450` viewport over a `3200x450` scrolling stage | Node.js headless `assert` test suite | Dual UMD module (`window.HackSlashEngine` + CommonJS `module.exports`)
- **Git Baseline**: `93eb083df0b88ee1f1f7df28b78909a765477ef9` (`CLEAN`)
- **Baseline Verification Status**: `node test_hackslash.js` -> **106 passed, 0 failed** (56 engine + 37 asset/DOM + 13 controller/anti-drift)

### 1.2 Canonical File Inventory
| File Path | Baseline Lines | Role | Phase 2 Disposition |
| :--- | :--- | :--- | :--- |
| `hackslash_engine.js` | 364 | Pure deterministic game physics, combat, spawning, and state machine | **Modify (Segment 1)** — Add `STAGE_PLATFORMS`, `computeCameraX`, platform-aware `stepHeroPhysics`, `gargoyle` enemy archetype, `spawnEnemyProjectile`, `deflectProjectile`, `stepProjectiles`, and boss-gate lock at `x = 2400`. |
| `app.js` | 712 | Canvas renderer, offscreen chroma-key pipeline, Web Audio synth, input controller, HUD updater | **Modify (Segment 3)** — Add `gargoyle_sheet.jpg` chroma-keying, 3-layer parallax scrolling (`0.2x`, `0.6x`, `1.0x`), platform & gargoyle rendering, glowing projectile & deflect spark effects, projectile whoosh/clink audio synths, and `#hud-stage-progress` / `#hud-boss-alert` DOM bindings. |
| `index.html` | 117 | Retro arcade shell with 17 mandatory Phase 1 DOM IDs | **Modify (Segment 2)** — Preserve all 17 existing DOM IDs verbatim; add `#hud-stage-progress` and `#hud-boss-alert` (19 total mandatory DOM IDs). |
| `styles.css` | 388 | NES 8-bit CRT & HUD styling | **Modify (Segment 2)** — Add styles for `#hud-stage-progress`, `#hud-boss-alert`, and elevated platform HUD indicators. |
| `test_hackslash.js` | 835 | Headless Node `assert` test suite (106 baseline assertions) | **Modify (Segments 1, 2, 3 — strictly additive)** — Append 32 engine assertions in Segment 1, 8 asset/DOM assertions in Segment 2, and 8 renderer/audio/anti-drift assertions in Segment 3 (106 -> 154 total assertions). |
| `assets/gargoyle_sheet.jpg` | New | Pixel-art sprite sheet for Castle Gargoyle ranged enemy on solid `#FF00FF` magenta background | **Create (Segment 2)** — Generated via `python ../generate_image.py` with `--out assets/gargoyle_sheet.jpg`. |

### 1.3 Non-Negotiable Invariants
1. **Assertion Immutability**: All 106 existing assertions in `test_hackslash.js` remain untouched line-for-line. Every Phase 2 test is appended at the end of its section or at the bottom of `test_hackslash.js`.
2. **Backward Compatibility of Phase 1 Signatures**: `GAME_CONFIG.width` (`800`) and `GAME_CONFIG.height` (`450`) remain intact alongside new `GAME_CONFIG.stageWidth` (`3200`) and `GAME_CONFIG.viewportWidth` (`800`). Calling `stepHeroPhysics(hero, input, config)` with 3 arguments continues to work identically for all Phase 1 tests.
3. **DOM Anti-Drift Contract**: All 17 Phase 1 DOM IDs plus the 2 new Phase 2 DOM IDs (`#hud-stage-progress`, `#hud-boss-alert`) queried in `app.js` must exist verbatim in `index.html` and be verified headlessly in `test_hackslash.js`.
4. **CLI Execution Discipline**: All verification commands run in plain Git Bash using forward-slash paths (`node --check`, `node test_hackslash.js`, `python ../generate_image.py`). No PowerShell cmdlets, no shell redirects (`>`, `2>`), and no shell variables.

---

## Stage 2: Phase 2 Technical Blueprint

### 2.1 Stage Progression, Camera Scrolling & Boss Gate Lock
- **Stage Dimensions**:
  - `GAME_CONFIG.stageWidth = 3200`
  - `GAME_CONFIG.viewportWidth = 800`
  - `GAME_CONFIG.bossLockX = 2400`
- **Camera Function (`computeCameraX(heroX, stageWidth = 3200, viewportWidth = 800, bossLocked = false)`)**:
  - When `bossLocked === true`, camera locks immediately to `stageWidth - viewportWidth` (`2400`).
  - When `bossLocked === false`, camera centers the hero with deadzone clamping:
    `const halfView = Math.floor(viewportWidth * 0.5);`
    `const rawCameraX = Math.round(heroX - halfView);`
    `return Math.max(0, Math.min(stageWidth - viewportWidth, rawCameraX));`
- **Boss Arena Gate**:
  - When `state.hero.x >= config.bossLockX` (`2400`) and `!state.bossDefeated`, set `state.bossLocked = true` and `state.cameraX = 2400`.
  - While `state.bossLocked === true`, clamp `state.hero.x` within `[2400, config.stageWidth - state.hero.width]` so the hero cannot retreat left out of the arena.
  - Defeating the Giant Ogre (`type === 'ogre'`) sets `state.bossDefeated = true` and releases `state.bossLocked = false`.

### 2.2 Elevated Platforms & One-Way Landing Physics
- **`STAGE_PLATFORMS` Constant**:
  6 elevated ledges and castle battlements distributed across the `3200px` stage at heights `y = 260`, `y = 200`, and `y = 150` (starting at `x = 380` so Phase 1 hero tests at `x = 100..250` never overlap a platform unless explicitly placed there):
  ```js
  const STAGE_PLATFORMS = Object.freeze([
    Object.freeze({ id: 'plat_1', x: 380,  y: 260, width: 180, height: 18, style: 'ledge' }),
    Object.freeze({ id: 'plat_2', x: 700,  y: 200, width: 170, height: 18, style: 'battlement' }),
    Object.freeze({ id: 'plat_3', x: 1040, y: 150, width: 200, height: 18, style: 'battlement' }),
    Object.freeze({ id: 'plat_4', x: 1460, y: 260, width: 190, height: 18, style: 'ledge' }),
    Object.freeze({ id: 'plat_5', x: 1820, y: 200, width: 180, height: 18, style: 'battlement' }),
    Object.freeze({ id: 'plat_6', x: 2140, y: 150, width: 200, height: 18, style: 'battlement' })
  ]);
  ```
- **Platform-Aware `stepHeroPhysics(hero, input, config = GAME_CONFIG, platforms = STAGE_PLATFORMS)`**:
  1. Capture `prevY = hero.y` and `prevBottom = hero.y + hero.height` before applying `hero.vy`.
  2. Apply horizontal input (`left`/`right`), clamping `hero.x` to `[minX, maxX]` where `minX = hero.bossLocked ? (config.bossLockX || 2400) : 0` and `maxX = (config.stageWidth || config.width) - hero.width` when scrolling is active (or `config.width - hero.width` if an explicit custom `config.width` < `800` is passed without `config.stageWidth`).
  3. **Walk-Off Ledge Check**: If `hero.onGround && hero.y + hero.height < config.groundY`, verify whether any platform in `platforms` still supports the hero (`hero.x + hero.width > plat.x && hero.x < plat.x + plat.width && Math.abs((hero.y + hero.height) - plat.y) <= 1`). If no platform supports the hero, set `hero.onGround = false` and `hero.groundedPlatformId = null` so gravity immediately acts on the hero.
  4. **One-Way Top-Edge Landing**: When airborne (`!hero.onGround`) and falling (`hero.vy >= 0`), check each `plat` in `platforms`:
     - Horizontal overlap: `hero.x + hero.width > plat.x && hero.x < plat.x + plat.width`
     - Vertical top-edge crossing: `prevBottom <= plat.y && (hero.y + hero.height) >= plat.y`
     - On match: snap `hero.y = plat.y - hero.height`, `hero.vy = 0`, `hero.onGround = true`, `hero.groundedPlatformId = plat.id`.
  5. **Jump-Through From Underneath**: When `hero.vy < 0`, platform collision is skipped completely; upward velocity is never blocked by platforms overhead.

### 2.3 Castle Gargoyle Archetype & Projectile/Deflection Engine
- **Gargoyle Enemy Definition (`ENEMY_ARCHETYPES.gargoyle`)**:
  ```js
  {
    type: 'gargoyle',
    maxHp: 40,
    speed: 0,
    damage: 12,
    width: 48,
    height: 48,
    scoreValue: 350,
    shootCooldownFrames: 90,
    perchedPlatformId: 'plat_3'
  }
  ```
- **Projectile Spawning (`spawnEnemyProjectile(enemy, hero, config = GAME_CONFIG)`)**:
  - Computes normalized aim vector `(dx, dy)` from gargoyle center `(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2)` to hero center `(hero.x + hero.width / 2, hero.y + hero.height / 2)`.
  - Multiplies unit vector by `speed = config.projectileSpeed || 5.5`.
  - Returns projectile state object:
    ```js
    {
      id: `proj_${enemy.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      ownerId: enemy.id,
      type: 'gargoyle_bolt',
      x: enemy.x + enemy.width / 2 - 7,
      y: enemy.y + enemy.height / 2 - 7,
      vx,
      vy,
      width: 14,
      height: 14,
      damage: enemy.damage || 12,
      active: true,
      deflected: false,
      ttl: 240
    }
    ```
- **Sword Deflection (`deflectProjectile(projectile, hero, state)`)**:
  - Active only when `projectile && projectile.active && hero.isAttacking && hero.attackFrame < 8`.
  - Computes hero sword hitbox via `getSwordHitbox(hero)` and tests AABB overlap with `projectile`.
  - On intersection:
    - Sets `projectile.deflected = true`, `projectile.active = false`, `projectile.vx = -projectile.vx * 1.5`, `projectile.vy = -Math.abs(projectile.vy) - 2`.
    - Increments `state.score = (state.score || 0) + 50` and `state.deflectedCount = (state.deflectedCount || 0) + 1`.
    - Emits a deflect spark particle `{ type: 'deflect_spark', x: projectile.x + 7, y: projectile.y + 7, vx: 0, vy: -1, color: '#00FFFF', alpha: 1, ttl: 16, maxTtl: 16 }` into `state.particles`.
    - Returns `true` (or `false` if no deflection occurred).
- **Projectile Step (`stepProjectiles(state, config = GAME_CONFIG, platforms = STAGE_PLATFORMS)`)**:
  - Iterates over `state.projectiles`:
    1. Moves projectile: `proj.x += proj.vx; proj.y += proj.vy; proj.ttl -= 1`.
    2. Checks sword deflection first via `deflectProjectile(proj, state.hero, state)`. If deflected, records audio cue event `'deflect'` and skips hero damage.
    3. Checks hero AABB collision: if `proj.active` and overlaps `state.hero`:
       - If `state.hero.invulnFrames <= 0`, subtracts `proj.damage` (`12`) from `state.hero.hp` (clamped at `0`), sets `state.hero.invulnFrames = config.invulnDuration || 30`, applies knockback `state.hero.vx = proj.vx >= 0 ? 6 : -6`, and deactivates projectile (`proj.active = false`).
    4. Checks world bounds (`proj.x < 0 || proj.x > (config.stageWidth || 3200) || proj.y < 0 || proj.y + proj.height >= config.groundY || proj.ttl <= 0`) and platform solid hits (`platforms.some(p => checkAABB(proj, p))`). If any match, sets `proj.active = false`.
  - Retains only `proj.active === true` entries in `state.projectiles`.

---

## Stage 3: 3-Segment Execution Plan

---

### Segment 1: Side-Scrolling Camera, Elevation Physics & Projectile Engine
- **Segment Number & Title**: Segment 1 — Core Platformer, Ranged Gargoyle & Projectile Physics (`hackslash_engine.js` + `test_hackslash.js`)
- **Goal**: Expand `hackslash_engine.js` with pure, deterministic 3200px stage scrolling, boss-gate lock at `x = 2400`, 6 one-way elevated castle platforms, the `gargoyle` enemy archetype, projectile motion/collision, and sword-swing projectile deflection, backed by 32 new unit assertions in `test_hackslash.js`.
- **Files to Modify (2 files)**:
  1. `hackslash_engine.js`
  2. `test_hackslash.js`

#### Precise Signatures & Data Structures (`hackslash_engine.js`)
1. **`GAME_CONFIG` Extensions**:
   - Preserve `width: 800`, `height: 450`, `groundY: 340`
   - Add `stageWidth: 3200`, `viewportWidth: 800`, `bossLockX: 2400`, `projectileSpeed: 5.5`, `deflectScoreBonus: 50`
2. **`STAGE_PLATFORMS`**:
   - Frozen array of 6 platform objects (`plat_1` through `plat_6`) at `y = 260`, `y = 200`, and `y = 150`, each with `{ id, x, y, width, height, style }`.
3. **`ENEMY_ARCHETYPES.gargoyle` (and `createEnemy('gargoyle', x, y, overrides)`)**:
   - `{ type: 'gargoyle', maxHp: 40, speed: 0, damage: 12, width: 48, height: 48, scoreValue: 350, shootCooldownFrames: 90, shootTimer: 90, perchedPlatformId: 'plat_3' }`.
   - When `perchedPlatformId` is matched in `STAGE_PLATFORMS`, default spawn `y` snaps to `plat.y - 48`.
4. **`computeCameraX(heroX, stageWidth = 3200, viewportWidth = 800, bossLocked = false)`**:
   - Pure function returning clamped integer camera offset in `[0, stageWidth - viewportWidth]`, or `stageWidth - viewportWidth` (`2400`) when `bossLocked` is truthy.
5. **`stepHeroPhysics(hero, input, config = GAME_CONFIG, platforms = STAGE_PLATFORMS)`**:
   - Updates `hero.x`, `hero.y`, `hero.vx`, `hero.vy`, `hero.onGround`, `hero.groundedPlatformId`, and `hero.facing`.
   - Implements one-way platform landing when falling (`vy >= 0` and feet cross `plat.y` from above), non-blocking upward jump-through when `vy < 0`, and automatic airborne gravity restoration when walking off platform edges.
6. **`spawnEnemyProjectile(enemy, hero, config = GAME_CONFIG)`**:
   - Pure factory returning a projectile object aimed from `enemy` center to `hero` center with speed `config.projectileSpeed || 5.5`.
7. **`deflectProjectile(projectile, hero, state)`**:
   - Checks active sword swing (`hero.isAttacking && hero.attackFrame < 8`) and AABB intersection between `getSwordHitbox(hero)` and `projectile`.
   - Marks `projectile.deflected = true`, `projectile.active = false`, awards `+50` to `state.score`, increments `state.deflectedCount`, and pushes a `deflect_spark` particle to `state.particles`.
8. **`stepProjectiles(state, config = GAME_CONFIG, platforms = STAGE_PLATFORMS)`**:
   - Advances all projectiles in `state.projectiles`, processes sword deflection, hero damage (`12` HP + invulnerability frames + knockback), platform collisions, and boundary culling.
9. **`stepGameState(state, input, config = GAME_CONFIG)` Updates**:
   - Updates `state.bossLocked = Boolean(!state.bossDefeated && (state.bossLocked || state.hero.x >= (config.bossLockX || 2400)))`.
   - Updates `state.cameraX = computeCameraX(state.hero.x, config.stageWidth || 3200, config.viewportWidth || 800, state.bossLocked)`.
   - Ticks gargoyle `shootTimer` and spawns projectiles when `shootTimer <= 0`.
   - Invokes `stepProjectiles(state, config, state.platforms || STAGE_PLATFORMS)`.
10. **UMD Exports**:
    - Export `STAGE_PLATFORMS`, `computeCameraX`, `stepHeroPhysics`, `spawnEnemyProjectile`, `deflectProjectile`, `stepProjectiles` alongside all existing Phase 1 exports.

#### New Assertions Added in Segment 1 (**32 new assertions**; 106 -> 138 total)
Appended to `test_hackslash.js` without altering any existing assertion:
1. `STAGE_PLATFORMS` is an array with at least 6 platforms (`STAGE_PLATFORMS.length >= 6`).
2. `STAGE_PLATFORMS` contains platforms at strategic elevations `y = 260`, `y = 200`, and `y = 150`.
3. Every platform in `STAGE_PLATFORMS` has valid numeric `x`, `y`, `width`, `height` and string `id`.
4. `GAME_CONFIG.stageWidth === 3200` and `GAME_CONFIG.viewportWidth === 800`.
5. `computeCameraX(100, 3200, 800, false)` clamps left boundary to `0`.
6. `computeCameraX(1600, 3200, 800, false)` centers hero at `1200`.
7. `computeCameraX(3100, 3200, 800, false)` clamps right boundary to `2400`.
8. `computeCameraX(1500, 3200, 800, true)` forces boss arena lock at `2400`.
9. Hero jumping upward (`vy < 0`) from underneath `plat_1` (`y = 260`) passes cleanly through without velocity zeroing or landing.
10. Hero remains airborne (`onGround === false`) while passing upward through `plat_1`.
11. Hero falling downward (`vy >= 0`) whose feet cross `plat_1.y` (`260`) from above lands on top of `plat_1` (`hero.y === 260 - hero.height`).
12. Landing on `plat_1` sets `hero.vy === 0`, `hero.onGround === true`, and `hero.groundedPlatformId === 'plat_1'`.
13. Hero standing on `plat_1` who walks horizontally past `plat_1.x + plat_1.width` transitions to `hero.onGround === false` and `hero.groundedPlatformId === null`.
14. Subsequent frame after walking off `plat_1` applies downward gravity (`hero.vy > 0` and `hero.y > 260 - hero.height`).
15. Hero can jump again from an elevated platform (`plat_2` at `y = 200`) and reach `plat_3` (`y = 150`).
16. `createEnemy('gargoyle', 1100, 102)` creates a gargoyle with `maxHp === 40`, `speed === 0`, `damage === 12`, `width === 48`, `height === 48`, `scoreValue === 350`, `shootCooldownFrames === 90`, `perchedPlatformId === 'plat_3'`.
17. `spawnEnemyProjectile(gargoyle, hero, GAME_CONFIG)` returns an active projectile with nonzero velocity vector `(vx, vy)` aimed toward the hero.
18. Spawned projectile speed magnitude `Math.hypot(proj.vx, proj.vy)` matches `GAME_CONFIG.projectileSpeed` within `1e-5`.
19. `stepProjectiles` moves an active projectile along its `(vx, vy)` vector each frame.
20. Projectile colliding with an unshielded, non-attacking hero reduces `hero.hp` by `12` (`gargoyle.damage`).
21. Projectile hit on hero sets `hero.invulnFrames > 0`, applies horizontal knockback `hero.vx !== 0`, and removes/deactivates the projectile.
22. Projectile hitting an invulnerable hero (`hero.invulnFrames > 0`) deals `0` damage.
23. Sword deflection: when `hero.isAttacking === true` and `hero.attackFrame < 8` and sword hitbox intersects projectile, `stepProjectiles` deflects/destroys the projectile without reducing `hero.hp`.
24. Sword deflection increments `state.score` by `+50`.
25. Sword deflection emits a `deflect_spark` particle into `state.particles` and increments `state.deflectedCount`.
26. Late attack frame (`hero.isAttacking === true && hero.attackFrame >= 8`) does NOT deflect an incoming projectile.
27. Projectile colliding with a platform in `STAGE_PLATFORMS` is destroyed (` state.projectiles.length === 0`).
28. Projectile traveling out of stage bounds (`x < 0` or `x > 3200` or `y > groundY`) is destroyed.
29. Gargoyle perched on `plat_3` remains stationary (`x` unchanged) while ticking `shootTimer` down and automatically spawning a projectile into `state.projectiles` on cooldown expiration.
30. Boss Arena Gate: when `state.hero.x >= 2400` in `stepGameState`, `state.bossLocked` becomes `true` and `state.cameraX` locks to `2400`.
31. While `state.bossLocked === true`, moving left at `x = 2400` clamps `state.hero.x >= 2400` (hero cannot exit boss arena to the left).
32. When the Giant Ogre boss is defeated (`state.bossDefeated === true`), `state.bossLocked` releases to `false`.

#### Segment 1 Plain CLI Verification Gate
```bash
node --check hackslash_engine.js
node --check test_hackslash.js
node test_hackslash.js
```

---

### Segment 2: Gargoyle Sprite Sheet Asset & Stage/Boss HUD DOM Extensions
- **Segment Number & Title**: Segment 2 — Nano Banana 2.1 Gargoyle Sprite Sheet & Phase 2 HUD/Platform DOM (`index.html`, `styles.css`, `test_hackslash.js` + `assets/gargoyle_sheet.jpg`)
- **Goal**: Generate `assets/gargoyle_sheet.jpg` on solid `#FF00FF` chroma-key magenta, extend `index.html` and `styles.css` with `#hud-stage-progress` and `#hud-boss-alert` while keeping all 17 Phase 1 DOM IDs intact, and append 8 asset/DOM verification assertions to `test_hackslash.js`.
- **Files to Modify / Create (3 code/markup files + 1 CLI-generated asset)**:
  1. `index.html` (modify)
  2. `styles.css` (modify)
  3. `test_hackslash.js` (modify — strictly additive)
  4. `assets/gargoyle_sheet.jpg` (create via CLI `python ../generate_image.py`)

#### Asset Generation Command (`assets/gargoyle_sheet.jpg`)
```bash
python ../generate_image.py --prompt "8-bit NES pixel art sprite sheet of a winged stone castle gargoyle cultist monster, two animation frames side by side: left frame perched idle with glowing red eyes and folded wings, right frame wings spread spitting a dark magic fireball, crisp pixel edges, flat solid #FF00FF magenta background, no anti-aliasing, retro Castlevania style" --out assets/gargoyle_sheet.jpg
```

#### DOM & CSS Specifications (`index.html` & `styles.css`)
1. **`index.html` Additions (preserving all 17 Phase 1 DOM IDs verbatim)**:
   - Inside the HUD bar, add the stage progress indicator with ID `#hud-stage-progress`:
     ```html
     <div id="hud-stage-progress" class="hud-progress-track" data-progress="0" title="Stage Distance to Castle Gate">
       <span class="hud-label">STAGE</span>
       <div class="hud-progress-fill" style="width: 0%;"></div>
     </div>
     ```
   - Inside the canvas overlay/HUD container, add the boss encounter alert banner with ID `#hud-boss-alert`:
     ```html
     <div id="hud-boss-alert" class="boss-alert-banner hidden" aria-live="polite">
       WARNING: BOSS ARENA LOCKED — DEFEAT THE GIANT OGRE!
     </div>
     ```
2. **`styles.css` Additions**:
   - `.hud-progress-track` and `.hud-progress-fill`: NES pixel-bordered mini-progress bar (`width: 120px`, `height: 12px`, `#111` background, `#00e5ff` -> `#ffcc00` fill bar) showing hero progress across the `3200px` stage toward the `x = 2400` boss gate.
   - `#hud-boss-alert` / `.boss-alert-banner`: Retro crimson flashing arcade banner (`border: 2px solid #ff2a2a`, `#2a0008` background, `#ffea00` pixel typography) toggled visible when `state.bossLocked === true`.

#### New Assertions Added in Segment 2 (**8 new assertions**; 138 -> 146 total)
Appended to `test_hackslash.js`:
1. `assets/gargoyle_sheet.jpg` exists on disk.
2. `assets/gargoyle_sheet.jpg` is non-empty (`stat.size > 1024` bytes).
3. `assets/gargoyle_sheet.jpg` has valid JPEG magic bytes (`0xFF 0xD8 0xFF`) or PNG signature (`0x89 0x50 0x4E 0x47`).
4. `index.html` contains `id="hud-stage-progress"`.
5. `index.html` contains `id="hud-boss-alert"`.
6. All 17 original Phase 1 DOM IDs remain present in `index.html`.
7. `styles.css` defines styling rules for `#hud-stage-progress` / `.hud-progress-track`.
8. `styles.css` defines styling rules for `#hud-boss-alert` / `.boss-alert-banner`.

#### Segment 2 Plain CLI Verification Gate
```bash
python ../generate_image.py --prompt "8-bit NES pixel art sprite sheet of a winged stone castle gargoyle cultist monster, two animation frames side by side: left frame perched idle with glowing red eyes and folded wings, right frame wings spread spitting a dark magic fireball, crisp pixel edges, flat solid #FF00FF magenta background, no anti-aliasing, retro Castlevania style" --out assets/gargoyle_sheet.jpg
node --check test_hackslash.js
node test_hackslash.js
```

---

### Segment 3: Parallax Scrolling Renderer, Projectile/Deflect FX, 8-Bit Audio & Anti-Drift Gate
- **Segment Number & Title**: Segment 3 — Scrolling Canvas Renderer, Chroma-Key Gargoyle, Web Audio Synth & Anti-Drift Verification (`app.js` + `test_hackslash.js`)
- **Goal**: Upgrade `app.js` with offscreen chroma-keying for `assets/gargoyle_sheet.jpg`, 3-layer parallax scrolling (`0.2x` moon/sky, `0.6x` castle battlements, `1.0x` ground bridge & elevated platforms), animated gargoyle idle/spit poses, glowing projectile & sword deflect spark rendering, 8-bit Web Audio synths for projectile whoosh and metallic sword deflect clink, live DOM updates for `#hud-stage-progress` and `#hud-boss-alert`, and 8 new controller/anti-drift assertions in `test_hackslash.js`.
- **Files to Modify (2 files)**:
  1. `app.js`
  2. `test_hackslash.js`

#### Precise Signatures & Components (`app.js`)
1. **Asset Manifest & Chroma-Key Pipeline**:
   - Add `gargoyle: 'assets/gargoyle_sheet.jpg'` to `ASSET_PATHS`.
   - Process `gargoyle` through the existing `chromaKeyImage(img)` offscreen canvas filter (stripping `#FF00FF` magenta and near-magenta pixels to `alpha = 0`).
2. **Multi-Layer Parallax Background Renderer (`renderParallaxBackground(ctx, cameraX, canvasWidth, canvasHeight)`)**:
   - **Layer 1 (`0.2x` scroll factor)**: Night sky gradient, full moon, and distant stars shifted by `-(cameraX * 0.2)`.
   - **Layer 2 (`0.6x` scroll factor)**: Tiled `bg_stage.jpg` / distant Gothic castle towers and battlements shifted by `-(cameraX * 0.6) % canvasWidth`.
   - **Layer 3 (`1.0x` scroll factor)**: Foreground stone bridge cobbles, boss arena gate pillars at `worldX = 2400`, and elevated platforms from `STAGE_PLATFORMS` shifted by `-cameraX`.
3. **Platform, Gargoyle, Projectile & Deflect Spark Rendering**:
   - `renderPlatforms(ctx, platforms, cameraX)`: Draws each stone ledge/battlement in `STAGE_PLATFORMS` at `screenX = plat.x - cameraX, screenY = plat.y` with 8-bit bevel highlights and crenelated top edges.
   - `renderEnemies(ctx, enemies, cameraX, sprites)`: Renders `gargoyle` using chroma-keyed `sprites.gargoyle` (selecting idle frame vs. spit frame when `enemy.shootTimer < 20`), with fallback pixel-art drawing when running headlessly.
   - `renderProjectiles(ctx, projectiles, cameraX)`: Draws each active projectile at `screenX = proj.x - cameraX, screenY = proj.y` with a glowing magenta/cyan core, outer aura ring, and motion trail particles.
   - `renderParticles(ctx, particles, cameraX)`: Renders `deflect_spark` bursts with high-contrast cyan/white cross-sparks at the point of sword deflection.
4. **8-Bit Web Audio Synth Extensions (`SoundFX`)**:
   - `playProjectileWhoosh()`: Descending noise/triangle frequency sweep (`420Hz -> 140Hz` over `0.11s`) triggered when a gargoyle fires a projectile.
   - `playSwordDeflect()`: High-pitched metallic square/triangle double-clink (`1320Hz -> 1980Hz` over `0.09s`) triggered when `deflectProjectile` succeeds.
5. **HUD DOM Synchronization (`updateHUD(state)`)**:
   - Queries `#hud-stage-progress` and updates its `data-progress` attribute and inner fill width (`Math.min(100, Math.round((state.hero.x / 2400) * 100)) + '%'`).
   - Queries `#hud-boss-alert` and toggles `.hidden` off when `state.bossLocked && !state.bossDefeated` (and restores `.hidden` otherwise).

#### New Assertions Added in Segment 3 (**8 new assertions**; 146 -> 154 total)
Appended to `test_hackslash.js`:
1. `app.js` registers `assets/gargoyle_sheet.jpg` in its sprite asset manifest and chroma-key pipeline.
2. `app.js` implements multi-layer parallax scrolling with `0.2`, `0.6`, and `1.0` scroll factors (`renderParallaxBackground`).
3. `app.js` implements platform rendering (`renderPlatforms`) and projectile rendering (`renderProjectiles`).
4. `app.js` implements `playProjectileWhoosh` and `playSwordDeflect` 8-bit Web Audio synth methods.
5. `app.js` binds and updates `#hud-stage-progress` and `#hud-boss-alert`.
6. **Phase 2 DOM Anti-Drift Gate**: 100% of `getElementById`, `querySelector`, and `querySelectorAll` ID selectors in `app.js` (all 19 IDs including `#hud-stage-progress` and `#hud-boss-alert`) exist verbatim in `index.html`.
7. Full multi-frame integration simulation: stepping the game state across platform jumps, gargoyle projectile firing, sword deflection, and boss arena lock at `x = 2400` maintains finite numerical state with zero `NaN` values.
8. `window.HackSlashEngine` UMD bundle exposes all Phase 1 and Phase 2 functions identically to `module.exports`.

#### Segment 3 Plain CLI Verification Gate
```bash
node --check hackslash_engine.js
node --check app.js
node --check test_hackslash.js
node test_hackslash.js
```

---

## Stage 4: Segmented Implementation & Execution Rules

1. **Strict Segment Isolation**: The executor agent must complete and verify Segment 1 (`138/138` green assertions), then Segment 2 (`146/146` green assertions), then Segment 3 (`154/154` green assertions).
2. **File Budget Compliance**:
   - Segment 1 modifies **2** files (`hackslash_engine.js`, `test_hackslash.js`).
   - Segment 2 modifies **3** code/markup files (`index.html`, `styles.css`, `test_hackslash.js`) and generates **1** image asset (`assets/gargoyle_sheet.jpg`).
   - Segment 3 modifies **2** files (`app.js`, `test_hackslash.js`).
3. **Append-Only Test Policy**: No existing lines in `test_hackslash.js` may be deleted, commented out, loosened, or wrapped in conditional skips. All 48 new Phase 2 assertions are strictly appended.
4. **Zero Shell Redirects / Variables**: All CLI commands use direct arguments (`node --check ...`, `node test_hackslash.js`, `python ../generate_image.py --prompt "..." --out assets/gargoyle_sheet.jpg`).

---

## Stage 5: Full Verification Gate

Upon completing all 3 segments, the executor agent must run the complete verification gate in Git Bash:

```bash
node --check hackslash_engine.js
node --check app.js
node --check test_hackslash.js
node test_hackslash.js
git status -s
```

**Expected Final Output**:
- Syntax checks (`node --check`) pass with zero output / exit code `0`.
- `node test_hackslash.js` reports **154 passed, 0 failed** (106 immutable Phase 1 assertions + 48 additive Phase 2 assertions).
- All 19 DOM IDs (17 Phase 1 + `#hud-stage-progress` + `#hud-boss-alert`) verified by the automated anti-drift test.

---

## Stage 6: Assertion Integrity Audit

| Audit Dimension | Baseline (Phase 1) | Target (Phase 2) | Integrity Status |
| :--- | :--- | :--- | :--- |
| Pre-existing Engine Assertions | 56 | 56 (unchanged) | **INTACT** |
| Pre-existing Asset & DOM Assertions | 37 | 37 (unchanged) | **INTACT** |
| Pre-existing Controller & Anti-Drift Assertions | 13 | 13 (unchanged) | **INTACT** |
| Segment 1 Additive Engine Assertions | 0 | +32 | **STRICTLY ADDITIVE** |
| Segment 2 Additive Asset & DOM Assertions | 0 | +8 | **STRICTLY ADDITIVE** |
| Segment 3 Additive Renderer, Audio & Anti-Drift Assertions | 0 | +8 | **STRICTLY ADDITIVE** |
| **Total Suite Assertions** | **106** | **154** | **0 WEAKENED / 0 DELETED / 0 SKIPPED** |

- Confirmed that zero existing `assert.*` statements in `test_hackslash.js` are modified, removed, broadened, or bypassed.
- Confirmed that all 17 Phase 1 DOM IDs and both new Phase 2 DOM IDs (`#hud-stage-progress`, `#hud-boss-alert`) are enforced by the Segment 3 anti-drift assertion.

AUDIT: PASS - assertions intact, no weakening detected