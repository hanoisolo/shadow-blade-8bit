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
  const HIT_STOP_FRAMES = 4;
  const BANNER_FRAMES = 120;

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

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
    btnMute: document.getElementById('btn-mute-audio')
  };

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

  /* ---------- Asset loading + chroma-key background removal ---------- */

  const ASSET_SRCS = {
    bg: 'assets/bg_stage.jpg',
    hero: 'assets/hero_sheet.jpg',
    skeleton: 'assets/skeleton_sheet.jpg',
    goblin: 'assets/goblin_sheet.jpg',
    ogre: 'assets/ogre_sheet.jpg'
  };

  const sheets = {};
  let bgImage = null;

  // Strips solid / near-black (RGB all < CHROMA_KEY_THRESHOLD) pixels into
  // transparent alpha via an offscreen canvas + getImageData/putImageData,
  // so sprites composite cleanly over the stage background.
  function processSheetChromaKey(img) {
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const offCtx = off.getContext('2d');
    offCtx.drawImage(img, 0, 0);
    try {
      const imageData = offCtx.getImageData(0, 0, off.width, off.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < CHROMA_KEY_THRESHOLD &&
            d[i + 1] < CHROMA_KEY_THRESHOLD &&
            d[i + 2] < CHROMA_KEY_THRESHOLD) {
          d[i + 3] = 0;
        }
      }
      offCtx.putImageData(imageData, 0, 0);
    } catch (err) {
      // Canvas tainted or unavailable: fall back to the raw sheet.
    }
    return off;
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

  function heroPose(hero) {
    if (hero.animState === 'hack') return 3;
    if (hero.animState === 'jump') return 2;
    if (hero.animState === 'run') return hero.animFrame < 2 ? 1 : 0;
    return 0;
  }

  function enemyPose(enemy) {
    if (enemy.hurtTimer > 0) return 3;
    if (enemy.attackCooldown > enemy.attackCooldownFrames - 10) return 2;
    if (enemy.animState === 'walk' || enemy.animState === 'run') {
      return Math.floor(tick / 8) % 2 === 0 ? 1 : 0;
    }
    return 0;
  }

  function drawEntity(sheetCanvas, poseIndex, ent, facing, scaleY, bob, alpha) {
    const w = ent.width;
    const h = ent.height;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(ent.x + w / 2, ent.y + (bob || 0));
    ctx.scale(facing, scaleY || 1);
    if (sheetCanvas) {
      const fw = sheetCanvas.width / 4;
      const fh = sheetCanvas.height;
      ctx.drawImage(sheetCanvas, poseIndex * fw, 0, fw, fh, -w / 2, -h, w, h);
    } else {
      // Procedural pixel fallback while the sheet is still decoding.
      ctx.fillStyle = ent.type === 'ogre' ? '#8e4a1f'
        : ent.type === 'goblin' ? '#4a9e4a'
        : ent.type === 'skeleton' ? '#d8d8c8'
        : '#c9a86a';
      ctx.fillRect(-w / 2, -h, w, h);
      ctx.strokeStyle = '#0c0c13';
      ctx.strokeRect(-w / 2, -h, w, h);
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
    if (hero.invulnTimer > 0 && Math.floor(tick / 3) % 2 === 0) alpha = 0.35;

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
      drawEntity(sheet, enemyPose(enemy), enemy, enemy.facing, 1, bob, 1);
      if (enemy.hurtTimer > 0) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(enemy.x, enemy.y - enemy.height, enemy.width, enemy.height);
        ctx.restore();
      }
    }
  }

  function drawParticles() {
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.min(1, p.life / 20);
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloatingTexts() {
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
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  function render(now) {
    const t = now || 0;
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

    ctx.save();
    if (shake > 0.3) {
      ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
      shake *= 0.85;
    }

    // Background with subtle parallax moon/cloud drift.
    if (bgImage) {
      const drift = Math.sin(t * 0.0002) * 10;
      ctx.drawImage(bgImage, -14 + drift, 0, CONFIG.width + 28, CONFIG.height);
    } else {
      ctx.fillStyle = '#0a0a18';
      ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
      ctx.fillStyle = '#e8e8d8';
      ctx.beginPath();
      ctx.arc(CONFIG.width * 0.75, 90, 48, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stone bridge ground strip.
    ctx.fillStyle = '#1c1626';
    ctx.fillRect(0, CONFIG.groundY, CONFIG.width, CONFIG.height - CONFIG.groundY);
    ctx.fillStyle = '#2e2438';
    ctx.fillRect(0, CONFIG.groundY, CONFIG.width, 4);

    drawEnemies();
    drawHero();
    drawParticles();
    drawFloatingTexts();

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
