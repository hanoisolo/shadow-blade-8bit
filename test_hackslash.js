/*
Shadow Blade 8-Bit - Headless unit test suite (Node assert, zero dependencies).
Gate: node test_hackslash.js
*/
'use strict';

const assert = require('assert');
const E = require('./hackslash_engine.js');

let passedCount = 0;
let failedCount = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passedCount += 1;
    console.log('PASS - ' + name);
  } catch (err) {
    failedCount += 1;
    failures.push(name + ' :: ' + err.message);
    console.log('FAIL - ' + name + ' :: ' + err.message);
  }
}

function approx(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    label + ': expected ~' + expected + ', got ' + actual
  );
}

function makeTestEnemy(type, x, overrides) {
  const t = E.ENEMY_TYPES[type];
  return Object.assign({
    type: t.type,
    x: x,
    y: E.GAME_CONFIG.groundY,
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
  }, overrides || {});
}

function newState(enemies, opts) {
  const options = Object.assign({ enemies: enemies || [] }, opts || {});
  return E.createInitialState(options);
}

const CONFIG = E.GAME_CONFIG;

/* ---------- Constants & exports ---------- */

test('exports all 8 required API members', function () {
  const keys = ['GAME_CONFIG', 'ENEMY_TYPES', 'STAGE_WAVES', 'createInitialState',
    'stepHeroPhysics', 'performHeroHack', 'stepEnemiesAI', 'createSampleBossBattleState'];
  keys.forEach(function (k) {
    assert.ok(E[k] !== undefined, 'missing export: ' + k);
  });
});

test('GAME_CONFIG stage dimensions', function () {
  assert.strictEqual(CONFIG.width, 800);
  assert.strictEqual(CONFIG.height, 450);
  assert.strictEqual(CONFIG.groundY, 360);
  assert.strictEqual(CONFIG.gravity, 0.65);
});

test('GAME_CONFIG hero stats', function () {
  const h = CONFIG.hero;
  assert.strictEqual(h.maxHp, 100);
  assert.strictEqual(h.speed, 4.5);
  assert.strictEqual(h.jumpForce, -13.5);
  assert.strictEqual(h.attackDamage, 25);
  assert.strictEqual(h.attackRange, 68);
  assert.strictEqual(h.attackDurationFrames, 14);
  assert.strictEqual(h.attackCooldownFrames, 20);
  assert.strictEqual(h.invulnFrames, 30);
  assert.strictEqual(h.width, 52);
  assert.strictEqual(h.height, 64);
});

test('ENEMY_TYPES goblin stats', function () {
  const g = E.ENEMY_TYPES.goblin;
  assert.strictEqual(g.type, 'goblin');
  assert.strictEqual(g.maxHp, 30);
  assert.strictEqual(g.speed, 3.2);
  assert.strictEqual(g.damage, 8);
  assert.strictEqual(g.width, 44);
  assert.strictEqual(g.height, 48);
  assert.strictEqual(g.scoreValue, 100);
  assert.strictEqual(g.attackRange, 36);
  assert.strictEqual(g.attackCooldownFrames, 45);
});

test('ENEMY_TYPES skeleton stats', function () {
  const s = E.ENEMY_TYPES.skeleton;
  assert.strictEqual(s.type, 'skeleton');
  assert.strictEqual(s.maxHp, 60);
  assert.strictEqual(s.speed, 2.0);
  assert.strictEqual(s.damage, 14);
  assert.strictEqual(s.width, 48);
  assert.strictEqual(s.height, 64);
  assert.strictEqual(s.scoreValue, 250);
  assert.strictEqual(s.attackRange, 48);
  assert.strictEqual(s.attackCooldownFrames, 55);
});

test('ENEMY_TYPES ogre stats', function () {
  const o = E.ENEMY_TYPES.ogre;
  assert.strictEqual(o.type, 'ogre');
  assert.strictEqual(o.maxHp, 220);
  assert.strictEqual(o.speed, 1.1);
  assert.strictEqual(o.damage, 28);
  assert.strictEqual(o.width, 96);
  assert.strictEqual(o.height, 112);
  assert.strictEqual(o.scoreValue, 1000);
  assert.strictEqual(o.attackRange, 76);
  assert.strictEqual(o.attackCooldownFrames, 80);
});

test('STAGE_WAVES has 3 numbered waves', function () {
  assert.strictEqual(E.STAGE_WAVES.length, 3);
  assert.strictEqual(E.STAGE_WAVES[0].wave, 1);
  assert.strictEqual(E.STAGE_WAVES[1].wave, 2);
  assert.strictEqual(E.STAGE_WAVES[2].wave, 3);
});

test('Wave 1 roster: 3 goblins + 1 skeleton', function () {
  const roster = E.STAGE_WAVES[0].roster;
  assert.strictEqual(roster.length, 4);
  assert.strictEqual(roster.filter(function (t) { return t === 'goblin'; }).length, 3);
  assert.strictEqual(roster.filter(function (t) { return t === 'skeleton'; }).length, 1);
});

test('Wave 2 roster: 2 goblins + 3 skeletons', function () {
  const roster = E.STAGE_WAVES[1].roster;
  assert.strictEqual(roster.length, 5);
  assert.strictEqual(roster.filter(function (t) { return t === 'goblin'; }).length, 2);
  assert.strictEqual(roster.filter(function (t) { return t === 'skeleton'; }).length, 3);
});

test('Wave 3 roster: 1 ogre + 2 skeletons + 2 goblins', function () {
  const roster = E.STAGE_WAVES[2].roster;
  assert.strictEqual(roster.length, 5);
  assert.strictEqual(roster.filter(function (t) { return t === 'ogre'; }).length, 1);
  assert.strictEqual(roster.filter(function (t) { return t === 'skeleton'; }).length, 2);
  assert.strictEqual(roster.filter(function (t) { return t === 'goblin'; }).length, 2);
});

/* ---------- Initial state ---------- */

test('createInitialState hero defaults', function () {
  const s = E.createInitialState();
  const h = s.hero;
  assert.strictEqual(h.x, 80);
  assert.strictEqual(h.y, 360);
  assert.strictEqual(h.vx, 0);
  assert.strictEqual(h.vy, 0);
  assert.strictEqual(h.hp, 100);
  assert.strictEqual(h.maxHp, 100);
  assert.strictEqual(h.facing, 1);
  assert.strictEqual(h.isGrounded, true);
  assert.strictEqual(h.isAttacking, false);
  assert.strictEqual(h.attackFrame, 0);
  assert.strictEqual(h.attackCooldown, 0);
  assert.strictEqual(h.invulnTimer, 0);
  assert.strictEqual(h.animState, 'idle');
  assert.strictEqual(h.animFrame, 0);
});

test('createInitialState state defaults', function () {
  const s = E.createInitialState();
  assert.strictEqual(s.status, 'playing');
  assert.strictEqual(s.currentWave, 1);
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.combo, 0);
  assert.strictEqual(s.comboTimer, 0);
  assert.strictEqual(s.frameCount, 0);
  assert.deepStrictEqual(s.particles, []);
  assert.ok(Array.isArray(s.enemies));
});

test('Wave 1 spawns 4 enemies at x >= 400', function () {
  const s = E.createInitialState();
  assert.strictEqual(s.enemies.length, 4);
  s.enemies.forEach(function (e) {
    assert.ok(e.x >= 400, 'enemy spawned at x=' + e.x);
  });
});

test('spawned enemy stats applied (goblin)', function () {
  const s = E.createInitialState();
  const g = s.enemies[0];
  assert.strictEqual(g.type, 'goblin');
  assert.strictEqual(g.hp, 30);
  assert.strictEqual(g.maxHp, 30);
  assert.strictEqual(g.width, 44);
  assert.strictEqual(g.height, 48);
  assert.strictEqual(g.speed, 3.2);
  assert.strictEqual(g.damage, 8);
  assert.strictEqual(g.attackRange, 36);
  assert.strictEqual(g.scoreValue, 100);
  assert.strictEqual(g.y, 360);
});

test('createInitialState honors options (enemies + currentWave)', function () {
  const s = E.createInitialState({ enemies: [], currentWave: 3, score: 500, combo: 2, comboTimer: 40 });
  assert.deepStrictEqual(s.enemies, []);
  assert.strictEqual(s.currentWave, 3);
  assert.strictEqual(s.score, 500);
  assert.strictEqual(s.combo, 2);
  assert.strictEqual(s.comboTimer, 40);
});

/* ---------- Hero physics ---------- */

test('hero moves right', function () {
  const s = newState([]);
  E.stepHeroPhysics(s.hero, { right: true });
  assert.strictEqual(s.hero.vx, 4.5);
  approx(s.hero.x, 84.5, 'hero.x');
  assert.strictEqual(s.hero.facing, 1);
  assert.strictEqual(s.hero.animState, 'run');
  assert.strictEqual(s.hero.isGrounded, true);
});

test('hero moves left and flips facing', function () {
  const s = newState([]);
  E.stepHeroPhysics(s.hero, { left: true });
  assert.strictEqual(s.hero.vx, -4.5);
  approx(s.hero.x, 75.5, 'hero.x');
  assert.strictEqual(s.hero.facing, -1);
  assert.strictEqual(s.hero.animState, 'run');
});

test('hero clamped at left boundary (x = 0)', function () {
  const s = newState([]);
  s.hero.x = 2;
  E.stepHeroPhysics(s.hero, { left: true });
  assert.strictEqual(s.hero.x, 0);
});

test('hero clamped at right boundary (x = width - hero.width)', function () {
  const s = newState([]);
  s.hero.x = 746;
  E.stepHeroPhysics(s.hero, { right: true });
  assert.strictEqual(s.hero.x, 748);
});

test('jump applies jump force plus one frame of gravity', function () {
  const s = newState([]);
  E.stepHeroPhysics(s.hero, { jump: true });
  approx(s.hero.vy, -12.85, 'vy after jump');
  approx(s.hero.y, 347.15, 'y after jump');
  assert.strictEqual(s.hero.isGrounded, false);
  assert.strictEqual(s.hero.animState, 'jump');
});

test('gravity accumulates while airborne', function () {
  const s = newState([]);
  s.hero.y = 300;
  s.hero.isGrounded = false;
  E.stepHeroPhysics(s.hero, {});
  approx(s.hero.vy, 0.65, 'vy frame 1');
  approx(s.hero.y, 300.65, 'y frame 1');
  E.stepHeroPhysics(s.hero, {});
  approx(s.hero.vy, 1.3, 'vy frame 2');
  approx(s.hero.y, 301.95, 'y frame 2');
});

test('hero lands on groundY with vy = 0', function () {
  const s = newState([]);
  s.hero.y = 300;
  s.hero.isGrounded = false;
  for (let i = 0; i < 40; i++) {
    E.stepHeroPhysics(s.hero, {});
  }
  assert.strictEqual(s.hero.y, 360);
  assert.strictEqual(s.hero.vy, 0);
  assert.strictEqual(s.hero.isGrounded, true);
  assert.strictEqual(s.hero.animState, 'idle');
});

test('idle animState and animFrame cycles 0-3', function () {
  const s = newState([]);
  for (let i = 0; i < 4; i++) {
    E.stepHeroPhysics(s.hero, {});
    assert.ok(s.hero.animFrame >= 0 && s.hero.animFrame <= 3, 'animFrame out of range');
  }
  assert.strictEqual(s.hero.animFrame, 0);
  assert.strictEqual(s.hero.animState, 'idle');
});

test('attackCooldown decrements per frame', function () {
  const s = newState([]);
  s.hero.attackCooldown = 5;
  E.stepHeroPhysics(s.hero, {});
  assert.strictEqual(s.hero.attackCooldown, 4);
});

test('invulnTimer decrements and shows hurt animState', function () {
  const s = newState([]);
  s.hero.invulnTimer = 5;
  E.stepHeroPhysics(s.hero, {});
  assert.strictEqual(s.hero.invulnTimer, 4);
  assert.strictEqual(s.hero.animState, 'hurt');
});

test('attack ends after attackDurationFrames', function () {
  const s = newState([]);
  E.performHeroHack(s);
  assert.strictEqual(s.hero.isAttacking, true);
  for (let i = 0; i < 14; i++) {
    E.stepHeroPhysics(s.hero, {});
  }
  assert.strictEqual(s.hero.isAttacking, false);
  assert.strictEqual(s.hero.attackFrame, 0);
  assert.strictEqual(s.hero.animState, 'idle');
});

test('no double jump while airborne', function () {
  const s = newState([]);
  s.hero.y = 300;
  s.hero.isGrounded = false;
  E.stepHeroPhysics(s.hero, { jump: true });
  approx(s.hero.vy, 0.65, 'vy must not be jumpForce');
  assert.strictEqual(s.hero.isGrounded, false);
});

/* ---------- Hero hack combat ---------- */

test('performHeroHack triggers attack state', function () {
  const s = newState([]);
  const res = E.performHeroHack(s);
  assert.strictEqual(res.triggered, true);
  assert.strictEqual(s.hero.isAttacking, true);
  assert.strictEqual(s.hero.attackFrame, 0);
  assert.strictEqual(s.hero.attackCooldown, 20);
  assert.strictEqual(s.hero.animState, 'hack');
});

test('hack hits enemy in front (damage, combo, score)', function () {
  const s = newState([makeTestEnemy('goblin', 190)]);
  const res = E.performHeroHack(s);
  assert.strictEqual(res.hits.length, 1);
  assert.strictEqual(res.hits[0].type, 'goblin');
  assert.strictEqual(res.hits[0].damage, 25);
  assert.strictEqual(s.enemies[0].hp, 5);
  assert.strictEqual(s.combo, 1);
  assert.strictEqual(s.comboTimer, 120);
  assert.strictEqual(s.score, 10);
});

test('knockback velocity applied to hit enemy', function () {
  const s = newState([makeTestEnemy('goblin', 190)]);
  E.performHeroHack(s);
  assert.strictEqual(s.enemies[0].vx, 5);
  assert.strictEqual(s.enemies[0].animState, 'hit');
});

test('hack blocked by cooldown', function () {
  const s = newState([makeTestEnemy('goblin', 190)]);
  E.performHeroHack(s);
  const res = E.performHeroHack(s);
  assert.strictEqual(res.triggered, false);
  assert.strictEqual(res.hits.length, 0);
  assert.strictEqual(s.enemies[0].hp, 5);
  assert.strictEqual(s.combo, 1);
});

test('hack is a no-op when status is not playing', function () {
  const s = newState([]);
  s.status = 'victory';
  const res = E.performHeroHack(s);
  assert.strictEqual(res.triggered, false);
  assert.strictEqual(s.hero.isAttacking, false);
});

test('enemy behind hero is not hit when facing right', function () {
  const s = newState([makeTestEnemy('goblin', 60)]);
  const res = E.performHeroHack(s);
  assert.strictEqual(res.hits.length, 0);
  assert.strictEqual(s.enemies[0].hp, 30);
  assert.strictEqual(s.combo, 0);
});

test('facing left hits enemy on the left', function () {
  const s = newState([makeTestEnemy('goblin', 10)]);
  s.hero.facing = -1;
  const res = E.performHeroHack(s);
  assert.strictEqual(res.hits.length, 1);
  assert.strictEqual(s.enemies[0].hp, 5);
  assert.strictEqual(s.combo, 1);
});

test('facing left does not hit enemy on the right', function () {
  const s = newState([makeTestEnemy('goblin', 150)]);
  s.hero.facing = -1;
  const res = E.performHeroHack(s);
  assert.strictEqual(res.hits.length, 0);
  assert.strictEqual(s.enemies[0].hp, 30);
});

test('enemy beyond attackRange is not hit', function () {
  const s = newState([makeTestEnemy('goblin', 210)]);
  const res = E.performHeroHack(s);
  assert.strictEqual(res.hits.length, 0);
  assert.strictEqual(s.enemies[0].hp, 30);
});

test('two-hit kill removes goblin and adds bonus score', function () {
  const s = newState([makeTestEnemy('goblin', 190)]);
  E.performHeroHack(s);
  assert.strictEqual(s.enemies.length, 1);
  s.hero.attackCooldown = 0;
  const res = E.performHeroHack(s);
  assert.strictEqual(res.hits[0].killed, true);
  assert.strictEqual(s.enemies.length, 0);
  assert.strictEqual(s.combo, 2);
  assert.strictEqual(s.score, 130);
});

test('one-hit kill of weakened goblin (score 110)', function () {
  const s = newState([makeTestEnemy('goblin', 190, { hp: 10 })]);
  const res = E.performHeroHack(s);
  assert.strictEqual(res.hits[0].killed, true);
  assert.strictEqual(s.enemies.length, 0);
  assert.strictEqual(s.combo, 1);
  assert.strictEqual(s.score, 110);
});

test('ogre boss falls on the 9th hit (score 1450, combo 9)', function () {
  const s = newState([makeTestEnemy('ogre', 190)]);
  let killed = false;
  for (let i = 1; i <= 9; i++) {
    s.hero.attackCooldown = 0;
    const res = E.performHeroHack(s);
    if (i < 9) {
      assert.strictEqual(res.hits[0].killed, false);
      assert.strictEqual(s.enemies[0].hp, 220 - 25 * i);
    } else {
      killed = res.hits[0].killed;
    }
  }
  assert.strictEqual(killed, true);
  assert.strictEqual(s.enemies.length, 0);
  assert.strictEqual(s.combo, 9);
  assert.strictEqual(s.score, 450 + 1000);
});

test('air slash hits grounded enemy mid-jump', function () {
  const s = newState([makeTestEnemy('goblin', 190)]);
  s.hero.y = 320;
  s.hero.isGrounded = false;
  const res = E.performHeroHack(s);
  assert.strictEqual(res.hits.length, 1);
  assert.strictEqual(s.enemies[0].hp, 5);
});

/* ---------- Enemy AI ---------- */

test('enemy moves toward hero at its speed', function () {
  const s = newState([makeTestEnemy('goblin', 500)]);
  E.stepEnemiesAI(s);
  approx(s.enemies[0].x, 496.8, 'goblin.x after move');
  assert.strictEqual(s.enemies[0].facing, -1);
  assert.strictEqual(s.enemies[0].animState, 'run');
});

test('enemy strikes hero within attackRange', function () {
  const s = newState([makeTestEnemy('goblin', 110)]);
  E.stepEnemiesAI(s);
  assert.strictEqual(s.hero.hp, 92);
  assert.strictEqual(s.hero.invulnTimer, 30);
  assert.strictEqual(s.hero.animState, 'hurt');
  assert.strictEqual(s.enemies[0].attackCooldown, 45);
  assert.strictEqual(s.enemies[0].x, 110);
  assert.strictEqual(s.hero.x, 74);
});

test('invulnerability frames block a second simultaneous strike', function () {
  const s = newState([makeTestEnemy('goblin', 110), makeTestEnemy('goblin', 100)]);
  E.stepEnemiesAI(s);
  assert.strictEqual(s.hero.hp, 92);
  assert.strictEqual(s.hero.invulnTimer, 30);
  assert.strictEqual(s.combo, 0);
});

test('enemy attack cooldown prevents immediate re-strike', function () {
  const s = newState([makeTestEnemy('goblin', 110)]);
  E.stepEnemiesAI(s);
  s.hero.invulnTimer = 0;
  E.stepEnemiesAI(s);
  assert.strictEqual(s.hero.hp, 92);
  assert.strictEqual(s.enemies[0].attackCooldown, 44);
});

test('hero combo resets on taking damage', function () {
  const s = newState([makeTestEnemy('goblin', 110)]);
  s.combo = 7;
  s.comboTimer = 100;
  E.stepEnemiesAI(s);
  assert.strictEqual(s.combo, 0);
  assert.strictEqual(s.comboTimer, 0);
});

test('combo expires when comboTimer reaches 0', function () {
  const s = newState([makeTestEnemy('goblin', 700)]);
  s.combo = 3;
  s.comboTimer = 1;
  E.stepEnemiesAI(s);
  assert.strictEqual(s.comboTimer, 0);
  assert.strictEqual(s.combo, 0);
});

test('Wave 1 clear advances to Wave 2', function () {
  const s = newState([], { currentWave: 1 });
  E.stepEnemiesAI(s);
  assert.strictEqual(s.currentWave, 2);
  assert.strictEqual(s.enemies.length, 5);
  assert.strictEqual(s.enemies.filter(function (e) { return e.type === 'goblin'; }).length, 2);
  assert.strictEqual(s.enemies.filter(function (e) { return e.type === 'skeleton'; }).length, 3);
  s.enemies.forEach(function (e) { assert.ok(e.x >= 400); });
  assert.strictEqual(s.status, 'playing');
  assert.strictEqual(s.score, 0);
});

test('Wave 2 clear advances to Wave 3 (boss ogre)', function () {
  const s = newState([], { currentWave: 2 });
  E.stepEnemiesAI(s);
  assert.strictEqual(s.currentWave, 3);
  assert.strictEqual(s.enemies.length, 5);
  const ogres = s.enemies.filter(function (e) { return e.type === 'ogre'; });
  assert.strictEqual(ogres.length, 1);
  assert.strictEqual(ogres[0].hp, 220);
  assert.strictEqual(s.status, 'playing');
});

test('Wave 3 clear sets victory', function () {
  const s = newState([], { currentWave: 3 });
  E.stepEnemiesAI(s);
  assert.strictEqual(s.status, 'victory');
});

test('hero HP reaching 0 sets gameover', function () {
  const s = newState([makeTestEnemy('goblin', 110)]);
  s.hero.hp = 8;
  E.stepEnemiesAI(s);
  assert.strictEqual(s.hero.hp, 0);
  assert.strictEqual(s.status, 'gameover');
});

test('stepEnemiesAI is a no-op after gameover', function () {
  const s = newState([makeTestEnemy('goblin', 700)]);
  s.hero.hp = 0;
  E.stepEnemiesAI(s);
  assert.strictEqual(s.status, 'gameover');
  const frames = s.frameCount;
  const x = s.enemies[0].x;
  E.stepEnemiesAI(s);
  assert.strictEqual(s.frameCount, frames);
  assert.strictEqual(s.enemies[0].x, x);
  assert.strictEqual(s.hero.hp, 0);
});

/* ---------- Sample boss battle state ---------- */

test('sample boss battle hero state (hp 85, x 180, facing 1)', function () {
  const s = E.createSampleBossBattleState();
  assert.strictEqual(s.hero.hp, 85);
  assert.strictEqual(s.hero.maxHp, 100);
  assert.strictEqual(s.hero.x, 180);
  assert.strictEqual(s.hero.facing, 1);
});

test('sample boss battle combo, score, wave, and status', function () {
  const s = E.createSampleBossBattleState();
  assert.strictEqual(s.combo, 5);
  assert.strictEqual(s.comboTimer, 120);
  assert.strictEqual(s.score, 1850);
  assert.strictEqual(s.currentWave, 3);
  assert.strictEqual(s.status, 'playing');
});

test('sample boss battle has one enemy of each type', function () {
  const s = E.createSampleBossBattleState();
  assert.strictEqual(s.enemies.length, 3);
  const types = s.enemies.map(function (e) { return e.type; });
  assert.ok(types.indexOf('skeleton') !== -1, 'missing skeleton');
  assert.ok(types.indexOf('goblin') !== -1, 'missing goblin');
  assert.ok(types.indexOf('ogre') !== -1, 'missing ogre');
  const ogre = s.enemies.filter(function (e) { return e.type === 'ogre'; })[0];
  assert.strictEqual(ogre.hp, 220);
  assert.strictEqual(ogre.maxHp, 220);
});

test('sample boss battle enemies at x >= 400', function () {
  const s = E.createSampleBossBattleState();
  s.enemies.forEach(function (e) {
    assert.ok(e.x >= 400, 'sample enemy at x=' + e.x);
    assert.ok(e.x + e.width <= 800, 'sample enemy out of stage bounds');
  });
});

test('sample boss battle is playable for one AI step', function () {
  const s = E.createSampleBossBattleState();
  E.stepEnemiesAI(s);
  assert.strictEqual(s.status, 'playing');
  assert.strictEqual(s.hero.hp, 85);
  assert.strictEqual(s.enemies.length, 3);
  assert.strictEqual(s.frameCount, 1);
});

/* ---------- Segment 2 Asset & DOM Integrity Tests ---------- */

const fs = require('fs');
const path = require('path');

const ASSETS = [
  'assets/bg_stage.jpg',
  'assets/hero_sheet.jpg',
  'assets/skeleton_sheet.jpg',
  'assets/goblin_sheet.jpg',
  'assets/ogre_sheet.jpg'
];

ASSETS.forEach(function (assetPath) {
  test('asset exists on disk: ' + assetPath, function () {
    assert.ok(fs.existsSync(path.join(__dirname, assetPath)), 'missing file ' + assetPath);
  });

  test('asset larger than 10,000 bytes: ' + assetPath, function () {
    const stats = fs.statSync(path.join(__dirname, assetPath));
    assert.ok(stats.size > 10000, assetPath + ' is only ' + stats.size + ' bytes');
  });

  test('asset starts with JPEG magic bytes (FF D8 FF): ' + assetPath, function () {
    const fd = fs.openSync(path.join(__dirname, assetPath), 'r');
    const buf = Buffer.alloc(3);
    fs.readSync(fd, buf, 0, 3, 0);
    fs.closeSync(fd);
    assert.strictEqual(buf[0], 0xFF, assetPath + ' byte 0');
    assert.strictEqual(buf[1], 0xD8, assetPath + ' byte 1');
    assert.strictEqual(buf[2], 0xFF, assetPath + ' byte 2');
  });
});

test('index.html exists and is longer than 500 characters', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(html.length > 500, 'index.html is only ' + html.length + ' chars');
});

test('styles.css exists and is longer than 500 characters', function () {
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  assert.ok(css.length > 500, 'styles.css is only ' + css.length + ' chars');
});

const MANDATORY_DOM_IDS = [
  'game-canvas',
  'hud-hero-hp-bar',
  'hud-hero-hp-text',
  'hud-boss-hp-container',
  'hud-boss-hp-bar',
  'hud-wave-badge',
  'hud-score',
  'hud-combo',
  'hud-status-banner',
  'btn-left',
  'btn-right',
  'btn-jump',
  'btn-hack',
  'btn-start-restart',
  'btn-load-sample',
  'btn-mute-audio',
  'enemy-codex-grid'
];

MANDATORY_DOM_IDS.forEach(function (id) {
  test('mandatory DOM id present in index.html: #' + id, function () {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    assert.ok(
      html.indexOf('id="' + id + '"') !== -1,
      'index.html is missing id="' + id + '"'
    );
  });
});

test('game canvas has 800x450 dimensions in index.html', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(html.indexOf('width="800"') !== -1, 'canvas width=800 missing');
  assert.ok(html.indexOf('height="450"') !== -1, 'canvas height=450 missing');
});

test('engine script tag linked before closing body in index.html', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const scriptTag = '<script src="hackslash_engine.js"></script>';
  assert.ok(html.indexOf(scriptTag) !== -1, 'engine script tag missing');
  assert.ok(
    html.indexOf(scriptTag) < html.indexOf('</body>'),
    'engine script tag must appear before </body>'
  );
});

test('app.js is linked in index.html (Segment 3 scope)', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(html.indexOf('app.js') !== -1, 'app.js script tag missing');
});

/* ---------- Segment 3 Controller & Anti-Drift Tests ---------- */

const APP_JS = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

test('app.js exists and is longer than 5,000 characters', function () {
  assert.ok(APP_JS.length > 5000, 'app.js is only ' + APP_JS.length + ' chars');
});

test('anti-drift: every getElementById target in app.js exists verbatim in index.html', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const re = /document\.getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  let checked = 0;
  while ((match = re.exec(APP_JS)) !== null) {
    checked += 1;
    assert.ok(
      html.indexOf('id="' + match[1] + '"') !== -1,
      'app.js queries #' + match[1] + ' which is missing from index.html'
    );
  }
  assert.ok(checked >= 16, 'expected at least 16 getElementById calls, found ' + checked);
});

test('anti-drift: every querySelector/querySelectorAll ID target in app.js exists in index.html', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const re = /querySelector(All)?\(\s*['"]#([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = re.exec(APP_JS)) !== null) {
    assert.ok(
      html.indexOf('id="' + match[2] + '"') !== -1,
      'app.js queries #' + match[2] + ' which is missing from index.html'
    );
  }
});

test('index.html loads engine before app.js, both before </body>', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const engineIndex = html.indexOf('hackslash_engine.js');
  const appIndex = html.indexOf('app.js');
  const bodyEnd = html.indexOf('</body>');
  assert.ok(engineIndex !== -1, 'engine script missing');
  assert.ok(appIndex !== -1, 'app.js script missing');
  assert.ok(bodyEnd !== -1, 'closing body tag missing');
  assert.ok(engineIndex < appIndex, 'app.js must load after the engine');
  assert.ok(appIndex < bodyEnd, 'app.js must load before </body>');
});

test('app.js integrates all 5 required engine functions', function () {
  ['createInitialState', 'stepHeroPhysics', 'performHeroHack', 'stepEnemiesAI',
    'createSampleBossBattleState'].forEach(function (fn) {
    assert.ok(APP_JS.indexOf(fn) !== -1, 'app.js never calls ' + fn);
  });
});

test('app.js persists state under localStorage key shadow_blade_8bit_state_v1', function () {
  assert.ok(APP_JS.indexOf('shadow_blade_8bit_state_v1') !== -1, 'storage key missing');
  assert.ok(APP_JS.indexOf('localStorage') !== -1, 'localStorage API missing');
});

test('app.js implements chroma-key processing (getImageData + putImageData + threshold 28)', function () {
  assert.ok(APP_JS.indexOf('getImageData') !== -1, 'getImageData missing');
  assert.ok(APP_JS.indexOf('putImageData') !== -1, 'putImageData missing');
  assert.ok(APP_JS.indexOf('CHROMA_KEY_THRESHOLD = 28') !== -1, 'chroma threshold 28 missing');
});

test('app.js runs a 60fps requestAnimationFrame loop', function () {
  assert.ok(APP_JS.indexOf('requestAnimationFrame') !== -1, 'requestAnimationFrame missing');
});

test('app.js implements Web Audio synthesis (AudioContext, oscillator, noise buffer)', function () {
  assert.ok(APP_JS.indexOf('AudioContext') !== -1, 'AudioContext missing');
  assert.ok(APP_JS.indexOf('createOscillator') !== -1, 'oscillator missing');
  assert.ok(APP_JS.indexOf('createBuffer') !== -1, 'noise buffer missing');
});

test('app.js binds all 8 keyboard controls', function () {
  ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'KeyK', 'KeyZ', 'KeyJ'].forEach(function (code) {
    assert.ok(APP_JS.indexOf(code) !== -1, 'key binding ' + code + ' missing');
  });
});

test('app.js wires the 4 arcade buttons and 3 utility buttons', function () {
  ['btn-left', 'btn-right', 'btn-jump', 'btn-hack',
    'btn-start-restart', 'btn-load-sample', 'btn-mute-audio'].forEach(function (id) {
    assert.ok(APP_JS.indexOf(id) !== -1, 'button wiring for #' + id + ' missing');
  });
});

test('app.js synthesizes the required SFX set (slash, jump, hit, victory, game over)', function () {
  ['sfxSlash', 'sfxJump', 'sfxHit', 'sfxVictory', 'sfxGameOver'].forEach(function (fn) {
    assert.ok(APP_JS.indexOf(fn) !== -1, 'SFX function ' + fn + ' missing');
  });
});

test('app.js implements the SFX mute toggle labels (SFX ON / SFX OFF)', function () {
  assert.ok(APP_JS.indexOf('SFX ON') !== -1, 'SFX ON label missing');
  assert.ok(APP_JS.indexOf('SFX OFF') !== -1, 'SFX OFF label missing');
});

/* ---------- Phase 2 — Segment 1 Platformer & Projectile Tests ---------- */

test('GAME_CONFIG Phase 2 stage extensions (stageWidth 3200, viewport 800, bossLock 2400)', function () {
  assert.strictEqual(CONFIG.stageWidth, 3200);
  assert.strictEqual(CONFIG.viewportWidth, 800);
  assert.strictEqual(CONFIG.bossLockX, 2400);
  assert.strictEqual(CONFIG.width, 800);
  assert.strictEqual(CONFIG.height, 450);
});

test('STAGE_PLATFORMS has exactly 6 platforms with unique ids', function () {
  assert.ok(Array.isArray(E.STAGE_PLATFORMS));
  assert.strictEqual(E.STAGE_PLATFORMS.length, 6);
  const ids = E.STAGE_PLATFORMS.map(function (p) { return p.id; });
  ids.forEach(function (id) {
    assert.strictEqual(ids.indexOf(id), ids.lastIndexOf(id), 'duplicate platform id ' + id);
  });
});

test('STAGE_PLATFORMS coordinates stay within the 3200px stage above ground', function () {
  E.STAGE_PLATFORMS.forEach(function (p) {
    assert.ok(p.x >= 380, p.id + ' starts before x=380');
    assert.ok(p.x + p.width <= 3200, p.id + ' extends past stageWidth');
    assert.ok(p.y > 0 && p.y < CONFIG.groundY, p.id + ' y out of range');
    assert.ok(p.width > 0 && p.height > 0, p.id + ' has non-positive size');
  });
});

test('STAGE_PLATFORMS exact geometry for all six ledges (plat_3 gargoyle perch)', function () {
  const expected = [
    { id: 'plat_1', x: 380, y: 260, width: 180, height: 16 },
    { id: 'plat_2', x: 680, y: 200, width: 160, height: 16 },
    { id: 'plat_3', x: 1020, y: 150, width: 220, height: 16 },
    { id: 'plat_4', x: 1420, y: 240, width: 200, height: 16 },
    { id: 'plat_5', x: 1780, y: 180, width: 180, height: 16 },
    { id: 'plat_6', x: 2100, y: 220, width: 190, height: 16 }
  ];
  E.STAGE_PLATFORMS.forEach(function (p, i) {
    assert.strictEqual(p.id, expected[i].id);
    assert.strictEqual(p.x, expected[i].x);
    assert.strictEqual(p.y, expected[i].y);
    assert.strictEqual(p.width, expected[i].width);
    assert.strictEqual(p.height, expected[i].height);
  });
});

test('ENEMY_TYPES gargoyle archetype stats', function () {
  const g = E.ENEMY_TYPES.gargoyle;
  assert.strictEqual(g.type, 'gargoyle');
  assert.strictEqual(g.maxHp, 40);
  assert.strictEqual(g.speed, 0);
  assert.strictEqual(g.damage, 12);
  assert.strictEqual(g.width, 48);
  assert.strictEqual(g.height, 48);
  assert.strictEqual(g.scoreValue, 350);
  assert.strictEqual(g.attackRange, 420);
  assert.strictEqual(g.shootCooldownFrames, 90);
  assert.strictEqual(g.perchedPlatformId, 'plat_3');
});

test('computeCameraX clamps left edge at 0', function () {
  assert.strictEqual(E.computeCameraX(100, 3200, 800, false), 0);
  assert.strictEqual(E.computeCameraX(374, 3200, 800, false), 0);
});

test('computeCameraX tracks the hero mid-stage', function () {
  assert.strictEqual(E.computeCameraX(1600, 3200, 800, false), 1226);
});

test('computeCameraX clamps right edge at stageWidth - viewportWidth (2400)', function () {
  assert.strictEqual(E.computeCameraX(3100, 3200, 800, false), 2400);
});

test('computeCameraX enforces boss lock at 2400', function () {
  assert.strictEqual(E.computeCameraX(1500, 3200, 800, true), 2400);
});

test('computeCameraX auto-locks once heroX reaches the gate line (2400)', function () {
  assert.strictEqual(E.computeCameraX(2450, 3200, 800, false), 2400);
});

test('falling hero lands on plat_1 top surface (y = 260)', function () {
  const s = newState([]);
  s.hero.x = 400;
  s.hero.y = 200;
  s.hero.vy = 0;
  s.hero.isGrounded = false;
  for (let i = 0; i < 40; i++) {
    E.stepHeroPhysics(s.hero, {});
  }
  assert.strictEqual(s.hero.y, 260);
  assert.strictEqual(s.hero.isGrounded, true);
});

test('platform landing zeroes vy and records currentPlatformId', function () {
  const s = newState([]);
  s.hero.x = 400;
  s.hero.y = 200;
  s.hero.vy = 0;
  s.hero.isGrounded = false;
  for (let i = 0; i < 40; i++) {
    E.stepHeroPhysics(s.hero, {});
  }
  assert.strictEqual(s.hero.vy, 0);
  assert.strictEqual(s.hero.currentPlatformId, 'plat_1');
});

test('upward jump passes through platform without altering vy (jump-through)', function () {
  const s = newState([]);
  s.hero.x = 400;
  E.stepHeroPhysics(s.hero, { jump: true });
  E.stepHeroPhysics(s.hero, {});
  E.stepHeroPhysics(s.hero, {});
  approx(s.hero.vy, -11.55, 'vy frame 3 must be pure gravity');
  approx(s.hero.y, 323.4, 'y frame 3 must be pure gravity');
  assert.strictEqual(s.hero.isGrounded, false);
  assert.strictEqual(s.hero.currentPlatformId, null);
});

test('hero jump arc from ground passes up through plat_1 and lands back on it', function () {
  const s = newState([]);
  s.hero.x = 400;
  E.stepHeroPhysics(s.hero, { jump: true });
  let peakY = s.hero.y;
  for (let i = 0; i < 45; i++) {
    E.stepHeroPhysics(s.hero, {});
    if (s.hero.y < peakY) peakY = s.hero.y;
  }
  assert.ok(peakY < 260, 'hero never rose above plat_1 top (peak ' + peakY + ')');
  assert.strictEqual(s.hero.y, 260);
  assert.strictEqual(s.hero.currentPlatformId, 'plat_1');
  assert.strictEqual(s.hero.isGrounded, true);
});

test('walking off a platform edge clears grounded state and platform id', function () {
  const s = newState([]);
  s.hero.x = 400;
  s.hero.y = 200;
  s.hero.vy = 0;
  s.hero.isGrounded = false;
  for (let i = 0; i < 40; i++) {
    E.stepHeroPhysics(s.hero, {});
  }
  assert.strictEqual(s.hero.currentPlatformId, 'plat_1');
  while (s.hero.x < 564) {
    E.stepHeroPhysics(s.hero, { right: true });
  }
  assert.strictEqual(s.hero.isGrounded, false);
  assert.strictEqual(s.hero.currentPlatformId, null);
});

test('frame after walk-off restores airborne gravity (vy > 0, hero descends)', function () {
  const s = newState([]);
  s.hero.x = 400;
  s.hero.y = 200;
  s.hero.vy = 0;
  s.hero.isGrounded = false;
  for (let i = 0; i < 40; i++) {
    E.stepHeroPhysics(s.hero, {});
  }
  const yBefore = s.hero.y;
  while (s.hero.isGrounded) {
    E.stepHeroPhysics(s.hero, { right: true });
  }
  E.stepHeroPhysics(s.hero, {});
  assert.ok(s.hero.vy > 0, 'gravity not restored, vy=' + s.hero.vy);
  assert.ok(s.hero.y > yBefore, 'hero did not descend after walk-off');
});

test('hero falling past all platforms lands on groundY (360) at a platform-free x', function () {
  const s = newState([]);
  s.hero.x = 600;
  s.hero.y = 200;
  s.hero.vy = 0;
  s.hero.isGrounded = false;
  for (let i = 0; i < 40; i++) {
    E.stepHeroPhysics(s.hero, {});
  }
  assert.strictEqual(s.hero.y, 360);
  assert.strictEqual(s.hero.isGrounded, true);
  assert.strictEqual(s.hero.currentPlatformId, null);
});

test('spawnEnemyProjectile returns a normalized trajectory at speed 5.5', function () {
  const p = E.spawnEnemyProjectile(100, 100, 400, 340);
  assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - 5.5) < 1e-9, 'speed magnitude wrong');
  assert.strictEqual(p.speed, 5.5);
  assert.strictEqual(p.radius, 8);
  assert.strictEqual(p.damage, 12);
  assert.strictEqual(p.active, true);
});

test('spawnEnemyProjectile horizontal aim produces vx = 5.5, vy = 0', function () {
  const p = E.spawnEnemyProjectile(100, 100, 300, 100);
  approx(p.vx, 5.5, 'vx');
  approx(p.vy, 0, 'vy');
  assert.strictEqual(p.x, 100);
  assert.strictEqual(p.y, 100);
});

test('spawnEnemyProjectile produces unique ids across calls', function () {
  const a = E.spawnEnemyProjectile(0, 0, 10, 10);
  const b = E.spawnEnemyProjectile(0, 0, 10, 10);
  assert.notStrictEqual(a.id, b.id);
});

test('stepProjectiles advances projectiles along their velocity vector', function () {
  const s = newState([]);
  s.projectiles.push({ id: 'ptest', x: 400, y: 100, vx: 2, vy: 1, radius: 8, damage: 12, active: true });
  E.stepProjectiles(s);
  assert.strictEqual(s.projectiles.length, 1);
  approx(s.projectiles[0].x, 402, 'x after step');
  approx(s.projectiles[0].y, 101, 'y after step');
});

test('projectile hit deals 12 damage to a vulnerable hero', function () {
  const s = newState([]);
  s.hero.x = 100;
  s.projectiles.push({ id: 'ph1', x: 120, y: 330, vx: -1, vy: 0, radius: 8, damage: 12, active: true });
  E.stepProjectiles(s);
  assert.strictEqual(s.hero.hp, 88);
});

test('projectile hit triggers invulnerability frames (invulnTimer = 30)', function () {
  const s = newState([]);
  s.hero.x = 100;
  s.projectiles.push({ id: 'ph2', x: 120, y: 330, vx: -1, vy: 0, radius: 8, damage: 12, active: true });
  E.stepProjectiles(s);
  assert.strictEqual(s.hero.invulnTimer, CONFIG.hero.invulnFrames);
  assert.strictEqual(s.hero.animState, 'hurt');
});

test('projectile hit knocks the hero back away from the bolt', function () {
  const s = newState([]);
  s.hero.x = 100;
  s.projectiles.push({ id: 'ph3', x: 120, y: 330, vx: -1, vy: 0, radius: 8, damage: 12, active: true });
  E.stepProjectiles(s);
  assert.strictEqual(s.hero.x, 94);
});

test('invulnerable hero takes 0 damage from a projectile', function () {
  const s = newState([]);
  s.hero.x = 100;
  s.hero.invulnTimer = 5;
  s.projectiles.push({ id: 'ph4', x: 120, y: 330, vx: -1, vy: 0, radius: 8, damage: 12, active: true });
  E.stepProjectiles(s);
  assert.strictEqual(s.hero.hp, 100);
  assert.strictEqual(s.hero.invulnTimer, 5);
});

test('spent projectile is deactivated and removed from state.projectiles', function () {
  const s = newState([]);
  s.hero.x = 100;
  const proj = { id: 'ph5', x: 120, y: 330, vx: -1, vy: 0, radius: 8, damage: 12, active: true };
  s.projectiles.push(proj);
  E.stepProjectiles(s);
  assert.strictEqual(proj.active, false);
  assert.strictEqual(s.projectiles.length, 0);
});

test('deflectProjectile succeeds on early active swing and deactivates the bolt', function () {
  const hero = { x: 100, y: 360, width: 52, height: 64, facing: 1, isAttacking: true, attackFrame: 0 };
  const proj = { id: 'pd1', x: 200, y: 330, vx: -5, vy: 0, radius: 8, damage: 12, active: true };
  const res = E.deflectProjectile(proj, hero);
  assert.ok(res, 'deflection failed');
  assert.strictEqual(res.scoreAward, 50);
  assert.strictEqual(res.deflected, true);
  assert.strictEqual(proj.active, false);
  assert.strictEqual(proj.deflected, true);
  const far = { id: 'pd2', x: 400, y: 330, vx: -5, vy: 0, radius: 8, damage: 12, active: true };
  assert.strictEqual(E.deflectProjectile(far, hero), null);
  assert.strictEqual(far.active, true);
});

test('stepProjectiles deflection adds +50 score without hero damage', function () {
  const s = newState([]);
  s.hero.x = 100;
  s.hero.isAttacking = true;
  s.hero.attackFrame = 0;
  s.projectiles.push({ id: 'pd3', x: 210, y: 330, vx: -5, vy: 0, radius: 8, damage: 12, active: true });
  E.stepProjectiles(s);
  assert.strictEqual(s.score, 50);
  assert.strictEqual(s.hero.hp, 100);
  assert.strictEqual(s.projectiles.length, 0);
});

test('stepProjectiles deflection emits a deflect_spark particle', function () {
  const s = newState([]);
  s.hero.x = 100;
  s.hero.isAttacking = true;
  s.hero.attackFrame = 0;
  s.projectiles.push({ id: 'pd4', x: 210, y: 330, vx: -5, vy: 0, radius: 8, damage: 12, active: true });
  E.stepProjectiles(s);
  assert.strictEqual(s.particles.length, 1);
  assert.strictEqual(s.particles[0].type, 'deflect_spark');
});

test('late attack frame (attackFrame >= 8) fails to deflect and the hero takes the hit', function () {
  const s = newState([]);
  s.hero.x = 100;
  s.hero.isAttacking = true;
  s.hero.attackFrame = 8;
  s.projectiles.push({ id: 'pd5', x: 160, y: 330, vx: -5, vy: 0, radius: 8, damage: 12, active: true });
  E.stepProjectiles(s);
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.hero.hp, 88);
  assert.strictEqual(s.projectiles.length, 0);
});

test('hero facing away cannot deflect and takes the hit', function () {
  const s = newState([]);
  s.hero.x = 100;
  s.hero.facing = -1;
  s.hero.isAttacking = true;
  s.hero.attackFrame = 0;
  s.projectiles.push({ id: 'pd6', x: 160, y: 330, vx: -5, vy: 0, radius: 8, damage: 12, active: true });
  E.stepProjectiles(s);
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.hero.hp, 88);
});

test('projectiles are culled past stage edge, into ground, or on platform solids', function () {
  const a = newState([]);
  a.projectiles.push({ id: 'pc1', x: 3204, y: 100, vx: 5, vy: 0, radius: 8, damage: 12, active: true });
  E.stepProjectiles(a);
  assert.strictEqual(a.projectiles.length, 0, 'stage-edge projectile not culled');

  const b = newState([]);
  b.projectiles.push({ id: 'pc2', x: 600, y: 354, vx: 0, vy: 5, radius: 8, damage: 12, active: true });
  E.stepProjectiles(b);
  assert.strictEqual(b.projectiles.length, 0, 'ground projectile not culled');

  const c = newState([]);
  c.projectiles.push({ id: 'pc3', x: 400, y: 250, vx: 0, vy: 5, radius: 8, damage: 12, active: true });
  E.stepProjectiles(c);
  assert.strictEqual(c.projectiles.length, 0, 'platform-solid projectile not culled');
});

/* ---------- Phase 2 — Segment 2 Asset & DOM Tests ---------- */

test('asset exists on disk: assets/gargoyle_sheet.jpg', function () {
  assert.ok(fs.existsSync(path.join(__dirname, 'assets/gargoyle_sheet.jpg')), 'missing file assets/gargoyle_sheet.jpg');
});

test('asset larger than 10,000 bytes: assets/gargoyle_sheet.jpg', function () {
  const stats = fs.statSync(path.join(__dirname, 'assets/gargoyle_sheet.jpg'));
  assert.ok(stats.size > 10000, 'assets/gargoyle_sheet.jpg is only ' + stats.size + ' bytes');
});

test('asset starts with JPEG magic bytes (FF D8 FF): assets/gargoyle_sheet.jpg', function () {
  const fd = fs.openSync(path.join(__dirname, 'assets/gargoyle_sheet.jpg'), 'r');
  const buf = Buffer.alloc(3);
  fs.readSync(fd, buf, 0, 3, 0);
  fs.closeSync(fd);
  assert.strictEqual(buf[0], 0xFF, 'assets/gargoyle_sheet.jpg byte 0');
  assert.strictEqual(buf[1], 0xD8, 'assets/gargoyle_sheet.jpg byte 1');
  assert.strictEqual(buf[2], 0xFF, 'assets/gargoyle_sheet.jpg byte 2');
});

test('index.html contains Phase 2 stage progress DOM id (#hud-stage-progress)', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(html.indexOf('id="hud-stage-progress"') !== -1, 'index.html is missing id="hud-stage-progress"');
});

test('index.html contains Phase 2 boss alert DOM id (#hud-boss-alert)', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(html.indexOf('id="hud-boss-alert"') !== -1, 'index.html is missing id="hud-boss-alert"');
});

test('anti-drift: all 19 required DOM ids (17 Phase 1 + 2 Phase 2) exist verbatim in index.html', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const requiredIds = MANDATORY_DOM_IDS.concat(['hud-stage-progress', 'hud-boss-alert']);
  assert.strictEqual(requiredIds.length, 19, 'expected 19 required DOM ids, got ' + requiredIds.length);
  requiredIds.forEach(function (id) {
    assert.ok(
      html.indexOf('id="' + id + '"') !== -1,
      'index.html is missing id="' + id + '"'
    );
  });
});

test('styles.css defines retro frame and gold fill rules for #hud-stage-progress', function () {
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  assert.ok(css.indexOf('#hud-stage-progress') !== -1, 'missing #hud-stage-progress rule');
  assert.ok(css.indexOf('.hud-progress-fill') !== -1, 'missing .hud-progress-fill rule');
  assert.ok(css.indexOf('.hud-progress-container') !== -1, 'missing .hud-progress-container rule');
});

test('styles.css defines flashing crimson banner and keyframes for #hud-boss-alert', function () {
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  assert.ok(css.indexOf('#hud-boss-alert') !== -1, 'missing #hud-boss-alert rule');
  assert.ok(css.indexOf('.boss-alert-banner') !== -1, 'missing .boss-alert-banner rule');
  assert.ok(css.indexOf('@keyframes boss-alert-pulse') !== -1, 'missing boss-alert-pulse keyframes');
  assert.ok(css.indexOf('.boss-alert-banner.hidden') !== -1, 'missing hidden-state override for the banner');
});

/* ---------- Summary ---------- */

console.log('----------------------------------------');
console.log('Shadow Blade 8-Bit test summary: ' +
  'total ' + (passedCount + failedCount) +
  ' | passed ' + passedCount +
  ' | failed ' + failedCount);

if (failedCount > 0) {
  console.log('Failures:');
  failures.forEach(function (f) { console.log('  ' + f); });
  process.exit(1);
}
console.log('ALL TESTS PASSED');
