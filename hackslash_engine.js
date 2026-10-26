/*
Shadow Blade 8-Bit - Hack & Slash Engine
Deterministic frame-stepped game engine for the NES-style hack-and-slash demo.
Pure JavaScript with dual UMD exports: window.HackSlashEngine (browser) and
module.exports (Node). No DOM access, no network, zero dependencies.
*/
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.HackSlashEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GAME_CONFIG = {
    width: 800,
    height: 450,
    groundY: 360,
    gravity: 0.65,
    hero: {
      maxHp: 100,
      speed: 4.5,
      jumpForce: -13.5,
      attackDamage: 25,
      attackRange: 68,
      attackDurationFrames: 14,
      attackCooldownFrames: 20,
      invulnFrames: 30,
      width: 52,
      height: 64
    }
  };

  const ENEMY_TYPES = {
    goblin: {
      type: 'goblin',
      maxHp: 30,
      speed: 3.2,
      damage: 8,
      width: 44,
      height: 48,
      scoreValue: 100,
      attackRange: 36,
      attackCooldownFrames: 45
    },
    skeleton: {
      type: 'skeleton',
      maxHp: 60,
      speed: 2.0,
      damage: 14,
      width: 48,
      height: 64,
      scoreValue: 250,
      attackRange: 48,
      attackCooldownFrames: 55
    },
    ogre: {
      type: 'ogre',
      maxHp: 220,
      speed: 1.1,
      damage: 28,
      width: 96,
      height: 112,
      scoreValue: 1000,
      attackRange: 76,
      attackCooldownFrames: 80
    }
  };

  const STAGE_WAVES = [
    { wave: 1, name: 'Wave 1: Bridge Ambush', roster: ['goblin', 'goblin', 'goblin', 'skeleton'] },
    { wave: 2, name: 'Wave 2: Undead Vanguard', roster: ['goblin', 'goblin', 'skeleton', 'skeleton', 'skeleton'] },
    { wave: 3, name: 'Wave 3: Ogre Gatekeeper', roster: ['ogre', 'skeleton', 'skeleton', 'goblin', 'goblin'] }
  ];

  const SCORE_PER_COMBO_HIT = 10;
  const ENEMY_KNOCKBACK_VELOCITY = 5.0;
  const HERO_KNOCKBACK_DISTANCE = 6;
  const ENEMY_HURT_FRAMES = 10;
  const COMBO_TIMER_FRAMES = 120;

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  function makeEnemy(type, x) {
    const t = ENEMY_TYPES[type];
    return {
      type: t.type,
      x: x,
      y: GAME_CONFIG.groundY,
      vx: 0,
      vy: 0,
      hp: t.maxHp,
      maxHp: t.maxHp,
      width: t.width,
      height: t.height,
      speed: t.speed,
      damage: t.damage,
      attackRange: t.attackRange,
      attackCooldownFrames: t.attackCooldownFrames,
      attackCooldown: 0,
      scoreValue: t.scoreValue,
      facing: -1,
      animState: 'idle',
      animFrame: 0,
      hurtTimer: 0
    };
  }

  function spawnWaveEnemies(waveNumber) {
    const wave = STAGE_WAVES[waveNumber - 1];
    return wave.roster.map(function (type, i) {
      return makeEnemy(type, 420 + i * 70);
    });
  }

  // Returns a clean mutable game state. options may override
  // { enemies, currentWave, score, combo, comboTimer }.
  function createInitialState(options) {
    options = options || {};
    const config = GAME_CONFIG;
    const hero = {
      x: 80,
      y: config.groundY,
      vx: 0,
      vy: 0,
      hp: config.hero.maxHp,
      maxHp: config.hero.maxHp,
      facing: 1,
      isGrounded: true,
      width: config.hero.width,
      height: config.hero.height,
      isAttacking: false,
      attackFrame: 0,
      attackCooldown: 0,
      invulnTimer: 0,
      animState: 'idle',
      animFrame: 0
    };
    const currentWave = options.currentWave || 1;
    return {
      hero: hero,
      enemies: options.enemies || spawnWaveEnemies(currentWave),
      particles: [],
      currentWave: currentWave,
      score: options.score || 0,
      combo: options.combo || 0,
      comboTimer: options.comboTimer || 0,
      status: 'playing',
      frameCount: 0
    };
  }

  // Advances one physics frame for the hero.
  // input: { left: boolean, right: boolean, jump: boolean }
  function stepHeroPhysics(hero, input, config) {
    config = config || GAME_CONFIG;
    input = input || {};
    const left = !!input.left;
    const right = !!input.right;

    hero.vx = 0;
    if (left && !right) {
      hero.vx = -config.hero.speed;
      hero.facing = -1;
    } else if (right && !left) {
      hero.vx = config.hero.speed;
      hero.facing = 1;
    }
    hero.x = clamp(hero.x + hero.vx, 0, config.width - hero.width);

    if (input.jump && hero.isGrounded) {
      hero.vy = config.hero.jumpForce;
      hero.isGrounded = false;
    }

    hero.vy += config.gravity;
    hero.y += hero.vy;
    if (hero.y >= config.groundY) {
      hero.y = config.groundY;
      hero.vy = 0;
      hero.isGrounded = true;
    }

    if (hero.isAttacking) {
      hero.attackFrame += 1;
      if (hero.attackFrame >= config.hero.attackDurationFrames) {
        hero.isAttacking = false;
        hero.attackFrame = 0;
      }
    }
    if (hero.attackCooldown > 0) hero.attackCooldown -= 1;
    if (hero.invulnTimer > 0) hero.invulnTimer -= 1;

    if (hero.isAttacking) {
      hero.animState = 'hack';
    } else if (hero.invulnTimer > 0) {
      hero.animState = 'hurt';
    } else if (!hero.isGrounded) {
      hero.animState = 'jump';
    } else if (hero.vx !== 0) {
      hero.animState = 'run';
    } else {
      hero.animState = 'idle';
    }
    hero.animFrame = (hero.animFrame + 1) % 4;
  }

  // Triggers the hero broadsword swing if the cooldown allows it.
  // Checks a directional AABB reach hitbox against all living enemies,
  // applies damage, knockback, combo and score, removes defeated enemies.
  // Returns { triggered: boolean, hits: [{ type, damage, killed, score }] }.
  function performHeroHack(state, config) {
    config = config || GAME_CONFIG;
    const hero = state.hero;
    if (state.status !== 'playing' || hero.attackCooldown > 0) {
      return { triggered: false, hits: [] };
    }

    hero.isAttacking = true;
    hero.attackFrame = 0;
    hero.attackCooldown = config.hero.attackCooldownFrames;
    hero.animState = 'hack';

    let xStart;
    let xEnd;
    if (hero.facing >= 0) {
      xStart = hero.x + hero.width;
      xEnd = xStart + config.hero.attackRange;
    } else {
      xEnd = hero.x;
      xStart = xEnd - config.hero.attackRange;
    }
    const yTop = hero.y - hero.height;
    const yBottom = hero.y;

    const hits = [];
    for (let i = 0; i < state.enemies.length; i++) {
      const enemy = state.enemies[i];
      if (enemy.hp <= 0) continue;
      const exStart = enemy.x;
      const exEnd = enemy.x + enemy.width;
      const eyTop = enemy.y - enemy.height;
      const eyBottom = enemy.y;
      const overlaps = exStart <= xEnd && exEnd >= xStart && eyTop <= yBottom && eyBottom >= yTop;
      if (!overlaps) continue;

      state.combo += 1;
      state.comboTimer = COMBO_TIMER_FRAMES;
      state.score += SCORE_PER_COMBO_HIT * state.combo;
      enemy.hp -= config.hero.attackDamage;
      enemy.vx = hero.facing * ENEMY_KNOCKBACK_VELOCITY;
      enemy.hurtTimer = ENEMY_HURT_FRAMES;
      enemy.animState = 'hit';
      const killed = enemy.hp <= 0;
      if (killed) {
        state.score += enemy.scoreValue;
      }
      hits.push({ type: enemy.type, damage: config.hero.attackDamage, killed: killed, score: enemy.scoreValue });
    }

    if (hits.length > 0) {
      state.enemies = state.enemies.filter(function (e) { return e.hp > 0; });
    }
    return { triggered: true, hits: hits };
  }

  // Advances one AI frame for all living enemies, then resolves the combo
  // timer, wave progression, and terminal status conditions.
  function stepEnemiesAI(state, config) {
    config = config || GAME_CONFIG;
    if (state.status !== 'playing') return;
    state.frameCount += 1;

    const hero = state.hero;
    for (let i = 0; i < state.enemies.length; i++) {
      const enemy = state.enemies[i];
      if (enemy.hp <= 0) continue;

      if (enemy.attackCooldown > 0) enemy.attackCooldown -= 1;
      if (enemy.hurtTimer > 0) enemy.hurtTimer -= 1;

      if (enemy.vx !== 0) {
        enemy.x = clamp(enemy.x + enemy.vx, 0, config.width - enemy.width);
        enemy.vx *= 0.8;
        if (Math.abs(enemy.vx) < 0.1) enemy.vx = 0;
      }

      const enemyCenter = enemy.x + enemy.width / 2;
      const heroCenter = hero.x + hero.width / 2;
      enemy.facing = heroCenter < enemyCenter ? -1 : 1;
      const dist = Math.abs(heroCenter - enemyCenter);

      if (dist <= enemy.attackRange) {
        if (enemy.attackCooldown === 0) {
          enemy.attackCooldown = enemy.attackCooldownFrames;
          if (hero.invulnTimer === 0) {
            hero.hp -= enemy.damage;
            if (hero.hp < 0) hero.hp = 0;
            hero.invulnTimer = config.hero.invulnFrames;
            hero.animState = 'hurt';
            state.combo = 0;
            state.comboTimer = 0;
            hero.x = clamp(hero.x + enemy.facing * HERO_KNOCKBACK_DISTANCE, 0, config.width - hero.width);
          }
        }
      } else {
        enemy.x = clamp(enemy.x + enemy.facing * enemy.speed, 0, config.width - enemy.width);
        enemy.animState = enemy.type === 'goblin' ? 'run' : 'walk';
      }
    }

    if (state.comboTimer > 0) {
      state.comboTimer -= 1;
      if (state.comboTimer === 0) state.combo = 0;
    }

    if (hero.hp <= 0) {
      state.status = 'gameover';
      return;
    }

    if (state.enemies.length === 0) {
      if (state.currentWave < STAGE_WAVES.length) {
        state.currentWave += 1;
        state.enemies = spawnWaveEnemies(state.currentWave);
      } else {
        state.status = 'victory';
      }
    }
  }

  // Pre-populated mid-action Wave 3 boss battle for 1-click testing
  // via #btn-load-sample: hero at 85 HP vs skeleton, goblin, and ogre boss.
  function createSampleBossBattleState(config) {
    config = config || GAME_CONFIG;
    const state = createInitialState({ currentWave: 3, enemies: [] });
    state.hero.x = 180;
    state.hero.hp = 85;
    state.hero.facing = 1;
    state.combo = 5;
    state.comboTimer = COMBO_TIMER_FRAMES;
    state.score = 1850;
    state.enemies = [
      makeEnemy('skeleton', 420),
      makeEnemy('goblin', 540),
      makeEnemy('ogre', 620)
    ];
    return state;
  }

  return {
    GAME_CONFIG: GAME_CONFIG,
    ENEMY_TYPES: ENEMY_TYPES,
    STAGE_WAVES: STAGE_WAVES,
    createInitialState: createInitialState,
    stepHeroPhysics: stepHeroPhysics,
    performHeroHack: performHeroHack,
    stepEnemiesAI: stepEnemiesAI,
    createSampleBossBattleState: createSampleBossBattleState
  };
});
