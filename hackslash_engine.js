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
    stageWidth: 3200,
    viewportWidth: 800,
    bossLockX: 2400,
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
    },
    gargoyle: {
      type: 'gargoyle',
      maxHp: 40,
      speed: 0,
      damage: 12,
      width: 48,
      height: 48,
      scoreValue: 350,
      attackRange: 420,
      shootCooldownFrames: 90,
      perchedPlatformId: 'plat_3'
    }
  };

  // One-way elevated castle ledges across the 3200px stage. All platforms
  // start at x >= 380 so single-screen Phase 1 play never collides with them.
  const STAGE_PLATFORMS = Object.freeze([
    Object.freeze({ id: 'plat_1', x: 380, y: 260, width: 180, height: 16 }),
    Object.freeze({ id: 'plat_2', x: 680, y: 200, width: 160, height: 16 }),
    Object.freeze({ id: 'plat_3', x: 1020, y: 150, width: 220, height: 16 }),
    Object.freeze({ id: 'plat_4', x: 1420, y: 240, width: 200, height: 16 }),
    Object.freeze({ id: 'plat_5', x: 1780, y: 180, width: 180, height: 16 }),
    Object.freeze({ id: 'plat_6', x: 2100, y: 220, width: 190, height: 16 })
  ]);

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
  const PROJECTILE_DEFLECT_SCORE = 50;
  const PROJECTILE_SPAWN_SPEED = 5.5;
  const PROJECTILE_DAMAGE = 12;
  const SWORD_DEFLECT_WINDOW = 8;

  let projectileCounter = 0;

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  // Centers the hero in the viewport with a small deadzone offset and clamps
  // the camera to [0, stageWidth - viewportWidth]. While the boss arena gate
  // is locked (or the hero has reached the gate line), the camera locks at
  // the arena position stageWidth - viewportWidth (2400) until released.
  function computeCameraX(heroX, stageWidth, viewportWidth, bossLocked) {
    stageWidth = stageWidth || GAME_CONFIG.stageWidth;
    viewportWidth = viewportWidth || GAME_CONFIG.viewportWidth;
    const maxCameraX = Math.max(0, stageWidth - viewportWidth);
    if (bossLocked || heroX >= maxCameraX) {
      return maxCameraX;
    }
    const targetX = heroX - (viewportWidth / 2) + 26;
    return clamp(Math.round(targetX), 0, maxCameraX);
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
      currentPlatformId: null,
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
      projectiles: [],
      particles: [],
      cameraX: 0,
      bossLocked: false,
      bossDefeated: false,
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
  // platforms defaults to STAGE_PLATFORMS; pass null to disable platform logic.
  // One-way platforms: the hero only lands while falling and only when the
  // feet cross the platform top edge from above. Rising heroes pass through.
  function stepHeroPhysics(hero, input, config, platforms) {
    config = config || GAME_CONFIG;
    if (platforms === undefined) platforms = STAGE_PLATFORMS;
    input = input || {};
    const left = !!input.left;
    const right = !!input.right;
    const prevY = hero.y;

    hero.vx = 0;
    if (left && !right) {
      hero.vx = -config.hero.speed;
      hero.facing = -1;
    } else if (right && !left) {
      hero.vx = config.hero.speed;
      hero.facing = 1;
    }

    // Single-screen bounds (Phase 1 behavior) unless the hero is inside the
    // boss arena or explicitly flagged for stage scrolling.
    const stageMode = !!hero.bossLocked || !!hero.scrollStage;
    const minX = hero.bossLocked ? (config.bossLockX || GAME_CONFIG.bossLockX) : 0;
    const maxX = (stageMode ? (config.stageWidth || config.width) : config.width) - hero.width;
    hero.x = clamp(hero.x + hero.vx, minX, maxX);

    // Walk-off: a hero standing on an elevated platform with no platform
    // still under the feet becomes airborne and gravity resumes.
    if (hero.isGrounded && hero.y < config.groundY) {
      let supported = false;
      if (platforms) {
        for (let i = 0; i < platforms.length; i++) {
          const plat = platforms[i];
          if (hero.x + hero.width > plat.x && hero.x < plat.x + plat.width && hero.y === plat.y) {
            supported = true;
            break;
          }
        }
      }
      if (!supported) {
        hero.isGrounded = false;
        hero.currentPlatformId = null;
      }
    }

    if (input.jump && hero.isGrounded) {
      hero.vy = config.hero.jumpForce;
      hero.isGrounded = false;
      hero.currentPlatformId = null;
    }

    hero.vy += config.gravity;
    hero.y += hero.vy;

    if (hero.vy >= 0 && platforms) {
      for (let i = 0; i < platforms.length; i++) {
        const plat = platforms[i];
        const overlapsX = hero.x + hero.width > plat.x && hero.x < plat.x + plat.width;
        if (!overlapsX) continue;
        if (prevY <= plat.y && hero.y >= plat.y) {
          hero.y = plat.y;
          hero.vy = 0;
          hero.isGrounded = true;
          hero.currentPlatformId = plat.id;
          break;
        }
      }
    }

    if (hero.y >= config.groundY) {
      hero.y = config.groundY;
      hero.vy = 0;
      hero.isGrounded = true;
      hero.currentPlatformId = null;
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

    // Boss arena gate: latches once the hero reaches the gate line and holds
    // until the boss is defeated. Keeps the camera synced to the lock.
    if (state.bossDefeated) {
      state.bossLocked = false;
    } else if (!state.bossLocked && hero.x >= (config.bossLockX || GAME_CONFIG.bossLockX)) {
      state.bossLocked = true;
    }
    hero.bossLocked = state.bossLocked;
    state.cameraX = computeCameraX(
      hero.x,
      config.stageWidth || GAME_CONFIG.stageWidth,
      config.viewportWidth || GAME_CONFIG.viewportWidth,
      state.bossLocked
    );

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

  // Returns a projectile aimed from (sourceX, sourceY) toward
  // (targetX, targetY) with a normalized velocity of the given speed.
  function spawnEnemyProjectile(sourceX, sourceY, targetX, targetY, speed) {
    if (speed === undefined) speed = PROJECTILE_SPAWN_SPEED;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    projectileCounter += 1;
    return {
      id: 'proj_' + projectileCounter,
      x: sourceX,
      y: sourceY,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      speed: speed,
      radius: 8,
      damage: PROJECTILE_DAMAGE,
      active: true,
      deflected: false
    };
  }

  // Sword deflection: only during the early active swing frames, and only
  // when the broadsword hitbox reaches the projectile. Deactivates the
  // projectile and returns the score award plus a spark particle trigger;
  // returns null when no deflection occurs.
  function deflectProjectile(projectile, hero) {
    if (!projectile || !projectile.active) return null;
    if (!hero || !hero.isAttacking || hero.attackFrame >= SWORD_DEFLECT_WINDOW) return null;

    let xStart;
    let xEnd;
    if (hero.facing >= 0) {
      xStart = hero.x + hero.width;
      xEnd = xStart + GAME_CONFIG.hero.attackRange;
    } else {
      xEnd = hero.x;
      xStart = xEnd - GAME_CONFIG.hero.attackRange;
    }
    const yTop = hero.y - hero.height;
    const yBottom = hero.y;
    const r = projectile.radius || 8;

    const overlaps = (projectile.x - r) <= xEnd && (projectile.x + r) >= xStart &&
      (projectile.y - r) <= yBottom && (projectile.y + r) >= yTop;
    if (!overlaps) return null;

    projectile.active = false;
    projectile.deflected = true;
    return {
      deflected: true,
      scoreAward: PROJECTILE_DEFLECT_SCORE,
      spark: { type: 'deflect_spark', x: projectile.x, y: projectile.y }
    };
  }

  // Advances every active projectile one frame: movement, sword deflection,
  // hero damage with invulnerability and knockback, then culling against the
  // stage bounds, the ground line, and platform solids.
  function stepProjectiles(state, config, platforms) {
    config = config || GAME_CONFIG;
    if (platforms === undefined) platforms = STAGE_PLATFORMS;
    if (!state.projectiles) state.projectiles = [];
    const hero = state.hero;
    const stageWidth = config.stageWidth || config.width;

    for (let i = 0; i < state.projectiles.length; i++) {
      const proj = state.projectiles[i];
      if (!proj || !proj.active) continue;
      proj.x += proj.vx;
      proj.y += proj.vy;

      const deflection = deflectProjectile(proj, hero);
      if (deflection) {
        state.score += deflection.scoreAward;
        state.deflectedCount = (state.deflectedCount || 0) + 1;
        state.particles.push({
          type: 'deflect_spark',
          x: proj.x,
          y: proj.y,
          vx: 0,
          vy: -1,
          ttl: 16,
          maxTtl: 16,
          active: true
        });
        continue;
      }

      const r = proj.radius || 8;
      const heroTop = hero.y - hero.height;
      const hitsHero = (proj.x + r) >= hero.x && (proj.x - r) <= hero.x + hero.width &&
        (proj.y + r) >= heroTop && (proj.y - r) <= hero.y;
      if (hitsHero) {
        if (hero.invulnTimer <= 0) {
          hero.hp -= (proj.damage || PROJECTILE_DAMAGE);
          if (hero.hp < 0) hero.hp = 0;
          hero.invulnTimer = config.hero.invulnFrames;
          hero.animState = 'hurt';
          state.combo = 0;
          state.comboTimer = 0;
          const knockDirection = proj.vx >= 0 ? 1 : -1;
          const minX = hero.bossLocked ? (config.bossLockX || GAME_CONFIG.bossLockX) : 0;
          const maxX = (hero.bossLocked ? stageWidth : config.width) - hero.width;
          hero.x = clamp(hero.x + knockDirection * HERO_KNOCKBACK_DISTANCE, minX, maxX);
        }
        proj.active = false;
        continue;
      }

      const outOfBounds = (proj.x - r) > stageWidth || (proj.x + r) < 0 ||
        (proj.y + r) >= config.groundY || (proj.y + r) < 0;
      let hitPlatform = false;
      if (!outOfBounds && platforms) {
        for (let p = 0; p < platforms.length; p++) {
          const plat = platforms[p];
          if ((proj.x + r) >= plat.x && (proj.x - r) <= plat.x + plat.width &&
            (proj.y + r) >= plat.y && (proj.y - r) <= plat.y + plat.height) {
            hitPlatform = true;
            break;
          }
        }
      }
      if (outOfBounds || hitPlatform) {
        proj.active = false;
      }
    }
    state.projectiles = state.projectiles.filter(function (p) { return p && p.active; });
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
    STAGE_PLATFORMS: STAGE_PLATFORMS,
    createInitialState: createInitialState,
    computeCameraX: computeCameraX,
    stepHeroPhysics: stepHeroPhysics,
    spawnEnemyProjectile: spawnEnemyProjectile,
    deflectProjectile: deflectProjectile,
    stepProjectiles: stepProjectiles,
    performHeroHack: performHeroHack,
    stepEnemiesAI: stepEnemiesAI,
    createSampleBossBattleState: createSampleBossBattleState
  };
});
