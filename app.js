/*
Shadow Blade 8-Bit - game controller.
60fps Canvas renderer with chroma-key sprite processing, procedural polish,
8-bit Web Audio SFX synthesizer, keyboard + arcade button input, and
localStorage high-score persistence. Wires window.HackSlashEngine.
Zero dependencies.
*/
(function () {
  'use strict';

  const E = window.HackSlashEngine;
  const CONFIG = E.GAME_CONFIG;
  const STORAGE_KEY = 'shadow_blade_8bit_state_v1';
  const CHROMA_KEY_THRESHOLD = 28;
  // Strict sheet-background strip bound (25): a pixel is keyed out ONLY
  // when every channel falls below this. Derived from the core threshold so
  // the tested constant stays the single source of truth.
  const CHROMA_KEY_BACKGROUND_LIMIT = CHROMA_KEY_THRESHOLD - 3;
  const HIT_STOP_FRAMES = 4;
  const BANNER_FRAMES = 120;

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  // Crisp 8-bit look: sub-pixel movement must never blend sprite edge
  // pixels into fuzzy semi-transparent fringes.
  ctx.imageSmoothingEnabled = false;

  const els = {
    heroHpBar: document.getElementById('hud-hero-hp-bar'),
    heroHpText: document.getElementById('hud-hero-hp-text'),
    bossHpContainer: document.getElementById('hud-boss-hp-container'),
    bossHpBar: document.getElementById('hud-boss-hp-bar'),
    waveBadge: document.getElementById('hud-wave-badge'),
    score: document.getElementById('hud-score'),
    combo: document.getElementById('hud-combo'),
    statusBanner: document.getElementById('hud-status-banner'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right'),
    btnJump: document.getElementById('btn-jump'),
    btnHack: document.getElementById('btn-hack'),
    btnStart: document.getElementById('btn-start-restart'),
    btnSample: document.getElementById('btn-load-sample'),
    btnMute: document.getElementById('btn-mute-audio'),
    stageProgress: document.getElementById('hud-stage-progress'),
    bossAlert: document.getElementById('hud-boss-alert')
  };

  // Inner fill of the stage progress bar (class-scoped, not an ID).
  const stageProgressFill = els.stageProgress
    ? els.stageProgress.querySelector('.hud-progress-fill')
    : null;

  /* ---------- localStorage persistence ---------- */

  function loadSavedData() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || {};
    } catch (err) {
      return {};
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        highScore: highScore,
        muted: muted
      }));
    } catch (err) {
      /* storage unavailable - persistence is best-effort */
    }
  }

  const savedData = loadSavedData();
  let highScore = Number(savedData.highScore) || 0;
  let muted = !!savedData.muted;

  /* ---------- 8-bit Web Audio SFX synthesizer ---------- */

  let audioCtx = null;

  function ensureAudio() {
    if (audioCtx === null) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (err) {
        audioCtx = false;
      }
    }
    return audioCtx || null;
  }

  function playTone(wave, f0, f1, dur, vol, delay) {
    const ac = ensureAudio();
    if (!ac || muted) return;
    const t0 = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(Math.max(f0, 1), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function playNoise(dur, vol, delay) {
    const ac = ensureAudio();
    if (!ac || muted) return;
    const t0 = ac.currentTime + (delay || 0);
    const length = Math.floor(ac.sampleRate * dur);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buffer;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(gain);
    gain.connect(ac.destination);
    src.start(t0);
  }

  function sfxSlash() {
    playTone('square', 950, 180, 0.13, 0.14, 0);
  }

  function sfxJump() {
    playTone('square', 220, 720, 0.12, 0.1, 0);
  }

  function sfxHit() {
    playNoise(0.14, 0.18, 0);
    playTone('square', 110, 45, 0.16, 0.16, 0);
  }

  function sfxKill() {
    playTone('triangle', 500, 900, 0.1, 0.1, 0);
    playNoise(0.08, 0.1, 0.02);
  }

  function sfxVictory() {
    playTone('square', 523, 523, 0.12, 0.1, 0);
    playTone('square', 659, 659, 0.12, 0.1, 0.13);
    playTone('square', 784, 784, 0.12, 0.1, 0.26);
    playTone('square', 1046, 1046, 0.34, 0.1, 0.39);
  }

  function sfxGameOver() {
    playTone('triangle', 392, 392, 0.2, 0.12, 0);
    playTone('triangle', 311, 311, 0.2, 0.12, 0.22);
    playTone('triangle', 220, 110, 0.5, 0.12, 0.44);
  }

  // Phase 2: gargoyle bolt launch - rapid descending sweep 420 Hz -> 140 Hz.
  function sfxProjectileWhoosh() {
    playNoise(0.11, 0.1, 0);
    playTone('triangle', 420, 140, 0.11, 0.12, 0);
  }

  // Phase 2: broadsword parry - metallic clink sweeping 1320 Hz -> 1980 Hz.
  function sfxSwordDeflect() {
    playTone('square', 1320, 1980, 0.09, 0.12, 0);
    playTone('triangle', 1980, 1320, 0.07, 0.08, 0.05);
  }

  /* ---------- Asset loading + chroma-key background removal ---------- */

  const ASSET_SRCS = {
    bg: 'assets/bg_stage.jpg',
    hero: 'assets/hero_sheet.jpg',
    skeleton: 'assets/skeleton_sheet.jpg',
    goblin: 'assets/goblin_sheet.jpg',
    ogre: 'assets/ogre_sheet.jpg',
    gargoyle: 'assets/gargoyle_sheet.jpg'
  };

  const sheets = {};
  let bgImage = null;

  // A pixel is background when it is strict sheet black (every channel below
  // CHROMA_KEY_BACKGROUND_LIMIT, i.e. 25) or solid magenta (#FF00FF family:
  // bright red + blue with a dim green channel, used by the gargoyle sheet).
  // The earlier broad passes are removed - they punched semi-transparent
  // holes through dark goblin skin, skeleton armor shadows, and the hero's
  // running pose. Alpha is strictly binary: background -> 0, character ->
  // 255, never any intermediate value.
  function isBackgroundPixel(r, g, b) {
    return (r > 200 && g < 50 && b > 200) ||
           (r < CHROMA_KEY_BACKGROUND_LIMIT &&
            g < CHROMA_KEY_BACKGROUND_LIMIT &&
            b < CHROMA_KEY_BACKGROUND_LIMIT);
  }

  // Rebuilds every sprite sheet buffer with strictly binary alpha via an
  // offscreen canvas + getImageData/putImageData across the entire sheet
  // width (including the leftmost idle frame boundaries): background pixels
  // become fully transparent, every other pixel is forced fully opaque, so
  // sprites composite cleanly and 100% solid over the stage.
  function processSheetChromaKey(img) {
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const offCtx = off.getContext('2d');
    offCtx.imageSmoothingEnabled = false;
    offCtx.drawImage(img, 0, 0);
    try {
      const imageData = offCtx.getImageData(0, 0, off.width, off.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (isBackgroundPixel(d[i], d[i + 1], d[i + 2])) {
          d[i + 3] = 0;
        } else {
          d[i + 3] = 255;
        }
      }
      offCtx.putImageData(imageData, 0, 0);
      return off;
    } catch (err) {
      // Tainted or unavailable canvas: NEVER fall back to the raw JPEG
      // image (it would render a solid black box). Return null so the
      // procedural pixel fallback is used instead.
      return null;
    }
  }

  // Builds a solid-color silhouette of one sprite frame for hit flashes.
  // Samples strictly from the processed, transparent chroma-keyed canvas
  // (never the raw JPEG <img>), and the fill is masked to the sprite pixels
  // by globalCompositeOperation = 'source-in', so no bounding box or
  // rectangular artifact can ever appear over the character.
  const tintCache = {};
  function tintedFrame(sheetCanvas, type, poseIndex, color) {
    const key = type + ':' + poseIndex + ':' + color;
    if (!tintCache[key]) {
      const fw = sheetCanvas.width / 4;
      const fh = sheetCanvas.height;
      const off = document.createElement('canvas');
      off.width = fw;
      off.height = fh;
      const offCtx = off.getContext('2d');
      offCtx.imageSmoothingEnabled = false;
      offCtx.drawImage(sheetCanvas, poseIndex * fw, 0, fw, fh, 0, 0, fw, fh);
      offCtx.globalCompositeOperation = 'source-in';
      offCtx.fillStyle = color;
      offCtx.fillRect(0, 0, fw, fh);
      offCtx.globalCompositeOperation = 'source-over';
      tintCache[key] = off;
    }
    return tintCache[key];
  }

  Object.keys(ASSET_SRCS).forEach(function (key) {
    const img = new Image();
    img.onload = function () {
      if (key === 'bg') {
        bgImage = img;
      } else {
        sheets[key] = processSheetChromaKey(img);
      }
    };
    img.src = ASSET_SRCS[key];
  });

  /* ---------- Game state, input, and effects ---------- */

  let state = E.createInitialState();
  const input = { left: false, right: false, jump: false, hack: false };

  // Phase 2: the Castle Gargoyle perched on plat_3 (x 1020-1240, top y 150).
  // Perched at the platform's left edge so fired bolts clear the platform's
  // solid box immediately while streaking down toward the approaching hero.
  const GARGOYLE_TYPE = E.ENEMY_TYPES.gargoyle;
  const gargoyle = {
    type: 'gargoyle',
    x: 1024,
    y: 150,
    width: GARGOYLE_TYPE.width,
    height: GARGOYLE_TYPE.height,
    facing: -1,
    animState: 'idle',
    hurtTimer: 0,
    attackCooldown: 0,
    attackCooldownFrames: 0,
    shootTimer: GARGOYLE_TYPE.shootCooldownFrames
  };

  // Full-stage horizontal navigation across stageWidth (3200) plus a fresh
  // gargoyle windup timer for the new run.
  function enableStageMode() {
    state.hero.scrollStage = true;
    gargoyle.shootTimer = GARGOYLE_TYPE.shootCooldownFrames;
  }

  enableStageMode();

  let hitStop = 0;
  let shake = 0;
  let landSquash = 0;
  let tick = 0;
  let bannerTimer = 0;
  let prevHeroHp = state.hero.hp;
  let prevWave = state.currentWave;
  let prevStatus = state.status;
  let wasGrounded = true;
  const floatingTexts = [];

  function showBanner(text, sticky) {
    els.statusBanner.textContent = text;
    els.statusBanner.classList.remove('hidden');
    bannerTimer = sticky ? -1 : BANNER_FRAMES;
  }

  function resetEffects() {
    hitStop = 0;
    shake = 0;
    landSquash = 0;
    bannerTimer = 0;
    floatingTexts.length = 0;
  }

  function startGame() {
    state = E.createInitialState();
    enableStageMode();
    resetEffects();
    prevHeroHp = state.hero.hp;
    prevWave = state.currentWave;
    prevStatus = state.status;
    wasGrounded = true;
    showBanner('STAGE 1 - WAVE 1 / 3', false);
    ensureAudio();
  }

  function loadSampleBossBattle() {
    state = E.createSampleBossBattleState();
    enableStageMode();
    resetEffects();
    prevHeroHp = state.hero.hp;
    prevWave = state.currentWave;
    prevStatus = state.status;
    wasGrounded = true;
    showBanner('BOSS BATTLE DEMO - WAVE 3 / 3', false);
    ensureAudio();
  }

  function toggleMute() {
    muted = !muted;
    persist();
    syncMuteLabel();
  }

  function syncMuteLabel() {
    els.btnMute.textContent = muted ? '\u266A SFX OFF' : '\u266A SFX ON';
  }

  /* ---------- Input wiring ---------- */

  const KEY_MAP = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    Space: 'jump',
    KeyK: 'jump',
    KeyZ: 'hack',
    KeyJ: 'hack'
  };

  document.addEventListener('keydown', function (e) {
    const key = KEY_MAP[e.code];
    if (key) {
      input[key] = true;
      e.preventDefault();
      ensureAudio();
    }
  });

  document.addEventListener('keyup', function (e) {
    const key = KEY_MAP[e.code];
    if (key) {
      input[key] = false;
      e.preventDefault();
    }
  });

  function bindHoldButton(el, key) {
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      input[key] = true;
      ensureAudio();
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      el.addEventListener(ev, function () {
        input[key] = false;
      });
    });
  }

  bindHoldButton(els.btnLeft, 'left');
  bindHoldButton(els.btnRight, 'right');
  bindHoldButton(els.btnJump, 'jump');
  bindHoldButton(els.btnHack, 'hack');

  els.btnStart.addEventListener('click', startGame);
  els.btnSample.addEventListener('click', loadSampleBossBattle);
  els.btnMute.addEventListener('click', toggleMute);
  syncMuteLabel();

  /* ---------- Particles + floating damage numbers ---------- */

  function spawnParticles(x, y, count, colors, speed) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = (0.5 + Math.random()) * speed;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 1,
        life: 20 + Math.floor(Math.random() * 20),
        size: 2 + Math.floor(Math.random() * 3),
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function spawnFloatingText(x, y, text, color) {
    floatingTexts.push({ x: x, y: y, text: text, color: color, life: 45 });
  }

  function stepEffects() {
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      // Engine particles (deflect_spark) carry ttl instead of life: adopt it
      // once so the shared decay + culling below applies to them too.
      if (p.life == null && p.ttl != null) p.life = p.ttl;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 1;
    }
    state.particles = state.particles.filter(function (p) { return p.life > 0; });

    for (let i = 0; i < floatingTexts.length; i++) {
      floatingTexts[i].y -= 1;
      floatingTexts[i].life -= 1;
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
    }
  }

  /* ---------- Phase 2: gargoyle ranged AI + sword parries ---------- */

  // Perched gargoyle behavior: faces the hero, ticks the windup timer, and
  // fires an engine-normalized bolt at the hero center while the hero is
  // inside the archetype attack range (420). The spit pose shows during
  // the last 20 windup frames.
  function stepGargoyleAI() {
    if (state.status !== 'playing') return;
    const hero = state.hero;
    const gargoyleCenter = gargoyle.x + gargoyle.width / 2;
    const heroCenter = hero.x + hero.width / 2;
    gargoyle.facing = heroCenter < gargoyleCenter ? -1 : 1;
    if (gargoyle.shootTimer > 0) gargoyle.shootTimer -= 1;
    if (gargoyle.shootTimer > 0) return;
    if (Math.abs(gargoyleCenter - heroCenter) > GARGOYLE_TYPE.attackRange) return;
    state.projectiles.push(E.spawnEnemyProjectile(
      gargoyleCenter,
      gargoyle.y - gargoyle.height / 2,
      heroCenter,
      hero.y - hero.height / 2
    ));
    sfxProjectileWhoosh();
    gargoyle.shootTimer = GARGOYLE_TYPE.shootCooldownFrames;
  }

  // Explicit app-side parry pass: the engine's deflectProjectile validates
  // the active swing window and the broadsword hitbox, deactivates the
  // bolt, awards +50, and returns the spark trigger. stepProjectiles runs
  // the same check for bolts entering the hitbox mid-move, so every bolt
  // is awarded exactly once (deflected bolts are inactive afterwards).
  function resolveHeroDeflections() {
    const hero = state.hero;
    if (state.status !== 'playing') return 0;
    if (!hero.isAttacking || hero.attackFrame >= 8) return 0;
    let count = 0;
    for (let i = 0; i < state.projectiles.length; i++) {
      const proj = state.projectiles[i];
      const res = E.deflectProjectile(proj, hero);
      if (res) {
        state.score += res.scoreAward;
        state.deflectedCount = (state.deflectedCount || 0) + 1;
        state.particles.push({
          type: 'deflect_spark',
          x: proj.x,
          y: proj.y,
          vx: 0,
          vy: -1,
          ttl: 16,
          maxTtl: 16
        });
        count += 1;
      }
    }
    return count;
  }

  /* ---------- Per-frame engine stepping ---------- */

  function stepGame() {
    const hero = state.hero;

    E.stepHeroPhysics(hero, input, CONFIG);

    if (!wasGrounded && hero.isGrounded) {
      landSquash = 6;
      spawnParticles(hero.x + hero.width / 2, hero.y, 5, ['#5a5a6e', '#3a3a4a'], 1.5);
    }
    if (hero.isGrounded && input.jump) sfxJump();
    if (landSquash > 0) landSquash -= 1;
    wasGrounded = hero.isGrounded;

    if (input.hack) {
      const before = state.enemies.map(function (e) {
        return { e: e, preHp: e.hp };
      });
      const res = E.performHeroHack(state, CONFIG);
      if (res.triggered) sfxSlash();
      if (res.hits.length > 0) hitStop = HIT_STOP_FRAMES;
      before.forEach(function (b) {
        if (b.e.hp !== b.preHp) {
          spawnFloatingText(
            b.e.x + b.e.width / 2,
            b.e.y - b.e.height - 8,
            '-' + CONFIG.hero.attackDamage,
            '#ffd24a'
          );
          spawnParticles(b.e.x + b.e.width / 2, b.e.y - b.e.height / 2, 6, ['#d83a3a', '#ffd24a'], 2);
          if (b.e.hp <= 0) {
            spawnParticles(b.e.x + b.e.width / 2, b.e.y - b.e.height / 2, 14, ['#d83a3a', '#ffd24a', '#ffffff'], 3);
            spawnFloatingText(b.e.x + b.e.width / 2, b.e.y - b.e.height - 22, '+' + b.e.scoreValue, '#ffffff');
            sfxKill();
          }
        }
      });
    }

    stepGargoyleAI();

    // Early active swings (attackFrame < 8) parry bolts via the engine's
    // deflectProjectile: the bolt dies, +50 score is awarded, and a
    // deflect_spark particle is emitted.
    const prevDeflectedCount = state.deflectedCount || 0;
    resolveHeroDeflections();
    E.stepProjectiles(state, CONFIG, E.STAGE_PLATFORMS);
    if ((state.deflectedCount || 0) > prevDeflectedCount) {
      sfxSwordDeflect();
      spawnParticles(
        hero.x + hero.width / 2,
        hero.y - hero.height / 2,
        8,
        ['#ffd24a', '#00e5ff', '#ffffff'],
        2.5
      );
    }

    E.stepEnemiesAI(state, CONFIG);

    if (state.hero.hp < prevHeroHp) {
      sfxHit();
      shake = 5;
      spawnParticles(hero.x + hero.width / 2, hero.y - hero.height / 2, 8, ['#d83a3a', '#ffffff'], 2);
      spawnFloatingText(hero.x + hero.width / 2, hero.y - hero.height - 8, '-' + (prevHeroHp - state.hero.hp), '#d83a3a');
    }
    prevHeroHp = state.hero.hp;

    if (state.currentWave !== prevWave) {
      showBanner(state.currentWave === 3
        ? 'WAVE 3 / 3 - OGRE GATEKEEPER'
        : 'WAVE ' + state.currentWave + ' / 3', false);
      playTone('square', 330, 660, 0.18, 0.1, 0);
      prevWave = state.currentWave;
    }

    if (state.status !== prevStatus) {
      if (state.status === 'victory') {
        sfxVictory();
        finishRun(true);
      } else if (state.status === 'gameover') {
        sfxGameOver();
        finishRun(false);
      }
      prevStatus = state.status;
    }

    stepEffects();
  }

  function finishRun(won) {
    const label = won ? 'VICTORY' : 'GAME OVER';
    if (state.score > highScore) {
      highScore = state.score;
      persist();
      showBanner(label + ' - NEW HIGH SCORE ' + highScore, true);
    } else {
      showBanner(label + ' - SCORE ' + state.score, true);
    }
  }

  /* ---------- Rendering ---------- */

  // Pose selection is LOCKED during locomotion: run always draws the
  // dedicated running pose (1). Never alternate pose 0/1 on animFrame at
  // 60fps - that rapid temporal alternation rendered as ghostly
  // translucency during ground movement. Only hack (3), jump (2), and
  // idle (0) select their own single pose.
  function heroPose(hero) {
    if (hero.animState === 'hack') return 3;
    if (hero.animState === 'jump') return 2;
    if (hero.animState === 'run') return 1;
    return 0;
  }

  // Locomotion lock for enemies as well: walk/run draw the movement pose
  // (1) without per-tick alternation. Hurt uses the hit pose (3), an
  // active strike flashes the attack pose (2), otherwise idle (0).
  function enemyPose(enemy) {
    if (enemy.hurtTimer > 0) return 3;
    if (enemy.attackCooldown > enemy.attackCooldownFrames - 10) return 2;
    if (enemy.animState === 'walk' || enemy.animState === 'run') {
      return 1;
    }
    return 0;
  }

  // Draws one entity. Alpha is strictly 1.0 during all normal movement
  // (idle, run, walk, jump); sub-1.0 alpha is only ever passed by callers
  // during active damage frames (enemy hurtTimer / hero invulnTimer), and
  // the save/restore pair guarantees no alpha or transform leaks.
  function drawEntity(sheetCanvas, poseIndex, ent, facing, scaleY, bob, alpha, tintColor) {
    const w = ent.width;
    const h = ent.height;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(ent.x + w / 2, ent.y + (bob || 0));
    ctx.scale(facing, scaleY || 1);
    if (sheetCanvas) {
      const fw = sheetCanvas.width / 4;
      const fh = sheetCanvas.height;
      const frame = tintColor
        ? tintedFrame(sheetCanvas, ent.type || 'hero', poseIndex, tintColor)
        : null;
      if (frame) {
        ctx.drawImage(frame, -w / 2, -h, w, h);
      } else {
        ctx.drawImage(sheetCanvas, poseIndex * fw, 0, fw, fh, -w / 2, -h, w, h);
      }
    } else {
      // Procedural pixel fallback while the sheet is still decoding or the
      // chroma key was unavailable. Draws a blocky three-band figure, never
      // the raw JPEG and never a single solid bounding rectangle.
      ctx.fillStyle = '#0c0c13';
      ctx.fillRect(-w / 2, -h, w, h * 0.25);
      ctx.fillStyle = ent.type === 'ogre' ? '#8e4a1f'
        : ent.type === 'goblin' ? '#4a9e4a'
        : ent.type === 'skeleton' ? '#d8d8c8'
        : '#c9a86a';
      ctx.fillRect(-w / 2, -h + h * 0.25, w, h * 0.5);
      ctx.fillStyle = '#1c1626';
      ctx.fillRect(-w / 2, -h * 0.25, w, h * 0.25);
    }
    ctx.restore();
  }

  function drawHero() {
    const hero = state.hero;
    let scaleY = 1;
    if (!hero.isGrounded) {
      scaleY = 1 + Math.min(Math.abs(hero.vy) / 60, 0.18);
    } else if (landSquash > 0) {
      scaleY = 0.82;
    }
    const bob = hero.animState === 'run' ? Math.sin(tick * 0.4) * 2 : 0;
    let alpha = 1;
    if (hero.invulnTimer > 0) {
      alpha = Math.floor(tick / 2) % 2 === 0 ? 1 : 0.3;
    }

    drawEntity(sheets.hero, heroPose(hero), hero, hero.facing, scaleY, bob, alpha);

    if (hero.isAttacking) {
      const progress = hero.attackFrame / CONFIG.hero.attackDurationFrames;
      const cx = hero.x + hero.width / 2;
      const cy = hero.y - hero.height * 0.55;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(hero.facing, 1);
      ctx.strokeStyle = 'rgba(255, 240, 150, ' + (1 - progress) + ')';
      ctx.lineWidth = 6 - progress * 4;
      ctx.beginPath();
      ctx.arc(0, 0, CONFIG.hero.attackRange * 0.85, -1.1 + progress * 0.6, 0.9 + progress * 0.4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.7 * (1 - progress)) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawEnemies() {
    for (let i = 0; i < state.enemies.length; i++) {
      const enemy = state.enemies[i];
      const sheet = sheets[enemy.type];
      const bob = (enemy.animState === 'walk' || enemy.animState === 'run')
        ? Math.sin(tick * 0.35 + i) * 2 : 0;
      // 8-bit hurt feedback: white chroma-keyed silhouette flickering at
      // 0.3/1.0 alpha every 2 frames - never a solid bounding box.
      const hurt = enemy.hurtTimer > 0 && sheet;
      const alpha = hurt ? (Math.floor(tick / 2) % 2 === 0 ? 1 : 0.3) : 1;
      drawEntity(sheet, enemyPose(enemy), enemy, enemy.facing, 1, bob, alpha, hurt ? '#ffffff' : null);
    }
  }

  function drawParticles() {
    if (state.particles.length === 0) return;
    ctx.save();
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      // Phase 2 parry feedback: golden/cyan alternating starburst cross.
      if (p.type === 'deflect_spark') {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 16));
        ctx.fillStyle = Math.floor(tick / 2) % 2 === 0 ? '#ffd24a' : '#00e5ff';
        ctx.fillRect(p.x - 6, p.y - 1, 12, 2);
        ctx.fillRect(p.x - 1, p.y - 6, 2, 12);
        continue;
      }
      ctx.fillStyle = p.color || '#ffffff';
      ctx.globalAlpha = Math.min(1, p.life / 20);
      ctx.fillRect(p.x, p.y, p.size || 3, p.size || 3);
    }
    ctx.restore();
  }

  function drawFloatingTexts() {
    if (floatingTexts.length === 0) return;
    ctx.save();
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < floatingTexts.length; i++) {
      const f = floatingTexts[i];
      ctx.globalAlpha = Math.min(1, f.life / 20);
      ctx.fillStyle = '#0c0c13';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  /* ---------- Phase 2: parallax layers + world-space scenery ---------- */

  // Deterministic starfield (no Math.random at module scope needed - the
  // positions are fixed pixel patterns like a real NES backdrop).
  const STARS = (function () {
    const list = [];
    for (let i = 0; i < 42; i++) {
      list.push({
        x: (i * 137) % 800,
        y: 16 + ((i * 61) % 210),
        size: (i % 3) === 0 ? 2 : 1
      });
    }
    return list;
  })();

  // Parallax layer 1 (0.2x): night sky, crescent moon, and stars.
  function drawSkyLayer(cameraX) {
    const drift = cameraX * 0.2;
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    ctx.fillStyle = '#c8c8d8';
    for (let i = 0; i < STARS.length; i++) {
      const sx = ((STARS[i].x - drift) % CONFIG.width + CONFIG.width) % CONFIG.width;
      ctx.fillRect(sx, STARS[i].y, STARS[i].size, STARS[i].size);
    }
    const moonX = 620 - drift;
    ctx.fillStyle = '#e8e8d8';
    ctx.beginPath();
    ctx.arc(moonX, 88, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0a18';
    ctx.beginPath();
    ctx.arc(moonX - 18, 80, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  // Parallax layer 2 (0.6x): distant castle battlements and spires, tiled
  // from the painted stage background so the seam never shows.
  function drawCastleLayer(cameraX) {
    const off = -((cameraX * 0.6) % CONFIG.width);
    if (bgImage) {
      ctx.drawImage(bgImage, off, 0, CONFIG.width, CONFIG.height);
      ctx.drawImage(bgImage, off + CONFIG.width, 0, CONFIG.width, CONFIG.height);
    } else {
      ctx.fillStyle = '#141426';
      for (let i = 0; i < 6; i++) {
        const bx = off + i * 160 + 40;
        ctx.fillRect(bx, 180, 70, CONFIG.groundY - 180);
        ctx.fillRect(bx + 20, 130, 12, 50);
      }
    }
  }

  // Parallax layer 3 (1.0x, world space): full-length stone bridge ground.
  function drawGroundLayer() {
    ctx.fillStyle = '#1c1626';
    ctx.fillRect(0, CONFIG.groundY, CONFIG.stageWidth, CONFIG.height - CONFIG.groundY);
    ctx.fillStyle = '#2e2438';
    ctx.fillRect(0, CONFIG.groundY, CONFIG.stageWidth, 4);
  }

  // Weathered gothic stone ledges: slate body, bright top edge, dark
  // underside, crenellation notches, and vertical stone seams.
  function drawPlatforms() {
    for (let i = 0; i < E.STAGE_PLATFORMS.length; i++) {
      const plat = E.STAGE_PLATFORMS[i];
      ctx.fillStyle = '#0c0c13';
      ctx.fillRect(plat.x, plat.y + 4, plat.width, plat.height - 4);
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
      ctx.fillStyle = '#6b6b80';
      ctx.fillRect(plat.x, plat.y, plat.width, 2);
      ctx.fillStyle = '#23232e';
      for (let nx = plat.x + 8; nx < plat.x + plat.width - 12; nx += 24) {
        ctx.fillRect(nx, plat.y + 3, 10, 4);
      }
      for (let sx = plat.x + 20; sx < plat.x + plat.width - 4; sx += 40) {
        ctx.fillRect(sx, plat.y + 2, 2, plat.height - 4);
      }
    }
  }

  // Boss arena gate marker at the x = 2400 lock line.
  function drawBossGate() {
    const gx = CONFIG.bossLockX;
    ctx.fillStyle = '#14101c';
    ctx.fillRect(gx - 10, CONFIG.groundY - 130, 14, 130);
    ctx.fillRect(gx + 62, CONFIG.groundY - 130, 14, 130);
    ctx.fillRect(gx - 16, CONFIG.groundY - 144, 104, 16);
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(gx - 10, CONFIG.groundY - 130, 14, 4);
    ctx.fillRect(gx + 62, CONFIG.groundY - 130, 14, 4);
    ctx.fillStyle = '#6b6b80';
    ctx.fillRect(gx - 16, CONFIG.groundY - 144, 104, 3);
  }

  // Perched gargoyle: spit pose (2) during the last 20 windup frames,
  // otherwise perched idle (0). Faces the hero like every enemy.
  function drawGargoyle() {
    const pose = gargoyle.shootTimer < 20 ? 2 : 0;
    drawEntity(sheets.gargoyle, pose, gargoyle, gargoyle.facing, 1, 0, 1, null);
  }

  // Active bolts: glowing purple/crimson core with a trailing spark wake.
  function drawProjectiles() {
    for (let i = 0; i < state.projectiles.length; i++) {
      const proj = state.projectiles[i];
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#7a1f8e';
      ctx.fillRect(proj.x - proj.vx * 2 - 3, proj.y - proj.vy * 2 - 3, 5, 5);
      ctx.fillStyle = '#b03ad8';
      ctx.fillRect(proj.x - proj.vx - 2, proj.y - proj.vy - 2, 4, 4);
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#d83a3a';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.radius + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e8b0ff';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(proj.x - 2, proj.y - 2, 4, 4);
      ctx.restore();
    }
  }

  function render() {
    // Smooth scrolling camera with hero deadzone centering and boss lock.
    const cameraX = E.computeCameraX(
      state.hero.x,
      CONFIG.stageWidth,
      CONFIG.viewportWidth,
      state.bossLocked
    );

    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

    ctx.save();
    if (shake > 0.3) {
      ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
      shake *= 0.85;
    }

    // Layer 1 (0.2x): sky, moon, stars.
    drawSkyLayer(cameraX);
    // Layer 2 (0.6x): distant castle battlements and spires.
    drawCastleLayer(cameraX);

    // Layer 3 (1.0x): the playfield, in world space under camera translation.
    ctx.save();
    ctx.translate(-cameraX, 0);
    drawGroundLayer();
    drawPlatforms();
    drawBossGate();
    drawGargoyle();
    drawEnemies();
    drawProjectiles();
    drawHero();
    drawParticles();
    drawFloatingTexts();
    ctx.restore();

    ctx.restore();
  }

  /* ---------- HUD synchronization ---------- */

  function syncHud() {
    const hero = state.hero;
    els.heroHpBar.style.width = Math.max(0, (hero.hp / hero.maxHp) * 100) + '%';
    els.heroHpText.textContent = 'HP: ' + hero.hp + ' / ' + hero.maxHp;

    let boss = null;
    for (let i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].type === 'ogre') { boss = state.enemies[i]; break; }
    }
    if (boss) {
      els.bossHpContainer.classList.remove('hidden');
      els.bossHpBar.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
    } else {
      els.bossHpContainer.classList.add('hidden');
    }

    els.waveBadge.textContent = 'WAVE ' + state.currentWave + ' / ' + E.STAGE_WAVES.length;
    els.score.textContent = 'SCORE: ' + String(state.score).padStart(6, '0');
    els.combo.textContent = 'COMBO: x' + state.combo;

    // Phase 2: stage progress toward the x = 2400 castle gate.
    const progressPct = Math.min(100, Math.max(0, (hero.x / CONFIG.bossLockX) * 100));
    if (stageProgressFill) {
      stageProgressFill.style.width = progressPct + '%';
    }

    // Phase 2: boss arena alert - visible from the gate line while the Ogre
    // lives, hidden once it is defeated.
    const ogreAlive = state.enemies.some(function (e) { return e.type === 'ogre'; });
    const alertActive = (state.bossLocked || hero.x >= CONFIG.bossLockX) && ogreAlive;
    if (alertActive) {
      els.bossAlert.classList.remove('hidden');
    } else {
      els.bossAlert.classList.add('hidden');
    }
  }

  /* ---------- 60fps main loop ---------- */

  function frame(now) {
    requestAnimationFrame(frame);
    tick += 1;
    if (hitStop > 0) {
      hitStop -= 1;
    } else {
      stepGame();
    }
    if (bannerTimer > 0) {
      bannerTimer -= 1;
      if (bannerTimer === 0) els.statusBanner.classList.add('hidden');
    }
    render(now);
    syncHud();
  }

  showBanner('STAGE 1 - PRESS START', true);
  requestAnimationFrame(frame);
})();
