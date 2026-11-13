import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activatePowerUp,
  applyHullDamage,
  calculateKillScore,
  checkLaserHitTarget,
  checkSphereOverlap,
  chooseAlienArchetype,
  clampDt,
  clampPlayerPosition,
  getAlienStats,
  getLaserConfig,
  getLevelStateForElapsed,
  getLevelTuning,
  tickPowerUpTimer,
  wrapCoord,
} from './rules';
import { CORRIDOR_BOUNDS, GAME_CONSTANTS } from './types';

test('clampDt bounds invalid and huge deltas', () => {
  assert.equal(clampDt(-1), 0);
  assert.equal(clampDt(Number.NaN), 0);
  assert.equal(clampDt(0.016), 0.016);
  assert.equal(clampDt(0.25), 0.05);
});

test('infinite horizontal void leaves X unbounded and clamps Y within corridor', () => {
  const moved = clampPlayerPosition(240, -99);
  assert.equal(moved.x, 240);
  assert.equal(moved.y, CORRIDOR_BOUNDS.minY);
});

test('wrapCoord keeps starfield particles endlessly centered around camera', () => {
  const wrapped = wrapCoord(-80, 100, 60);
  assert.ok(wrapped >= 40 && wrapped <= 160);
});

test('power-up enlarges laser size, damage, and enables piercing for limited time', () => {
  const normal = getLaserConfig(0);
  const mega = getLaserConfig(5.0);

  assert.equal(normal.isPowered, false);
  assert.equal(mega.isPowered, true);
  assert.ok(mega.radius > normal.radius * 3);
  assert.ok(mega.length > normal.length * 2);
  assert.ok(mega.damage > normal.damage);
  assert.equal(mega.piercing, true);
  assert.equal(normal.piercing, false);
});

test('power-up timer activates, stacks within cap, and expires cleanly', () => {
  const t1 = activatePowerUp(0);
  assert.equal(t1, GAME_CONSTANTS.powerUpDuration);

  const t2 = activatePowerUp(t1);
  assert.equal(t2, GAME_CONSTANTS.powerUpMaxStack);

  const decayed = tickPowerUpTimer(t1, 4.5);
  assert.equal(decayed, GAME_CONSTANTS.powerUpDuration - 4.5);

  const expired = tickPowerUpTimer(decayed, 20);
  assert.equal(expired, 0);
  assert.equal(getLaserConfig(expired).isPowered, false);
});

test('mega-laser hits targets across wider radius than normal laser', () => {
  const normal = getLaserConfig(0);
  const mega = getLaserConfig(8.0);
  const target = { x: 1.9, y: 0, z: -20 };
  const targetRadius = 0.9;
  const laserOrigin = { x: 0, y: 0, z: -20 };

  assert.equal(
    checkLaserHitTarget(laserOrigin, normal.radius, normal.length * 0.5, target, targetRadius),
    false,
  );
  assert.equal(
    checkLaserHitTarget(laserOrigin, mega.radius, mega.length * 0.5, target, targetRadius),
    true,
  );
});

test('sphere overlap detects star and alien collisions accurately', () => {
  assert.equal(
    checkSphereOverlap({ x: 0, y: 0, z: 4 }, 1.0, { x: 1.5, y: 0, z: 4 }, 0.8),
    true,
  );
  assert.equal(
    checkSphereOverlap({ x: 0, y: 0, z: 4 }, 1.0, { x: 3.0, y: 0, z: 4 }, 0.8),
    false,
  );
});

test('6 levels advance every 60 seconds and trigger completion after level 6', () => {
  assert.equal(getLevelStateForElapsed(0).level, 1);
  assert.equal(getLevelStateForElapsed(59).level, 1);
  assert.equal(getLevelStateForElapsed(60).level, 2);
  assert.equal(getLevelStateForElapsed(120).level, 3);
  assert.equal(getLevelStateForElapsed(180).level, 4);
  assert.equal(getLevelStateForElapsed(240).level, 5);
  assert.equal(getLevelStateForElapsed(300).level, 6);
  assert.equal(getLevelStateForElapsed(359).completedAllLevels, false);
  assert.equal(getLevelStateForElapsed(360).completedAllLevels, true);
});

test('each level spawns bigger aliens with trickier multi-shot volleys', () => {
  const l1 = getLevelTuning(1);
  const l3 = getLevelTuning(3);
  const l6 = getLevelTuning(6);

  assert.ok(l3.alienScale > l1.alienScale);
  assert.ok(l6.alienScale > l3.alienScale);
  assert.ok(l6.alienProjectileSpeed > l1.alienProjectileSpeed);
  assert.ok(l6.spreadShotCount > l1.spreadShotCount);
  assert.ok(l6.spawnInterval < l1.spawnInterval);

  const s1 = getAlienStats('dreadnought', 1);
  const s6 = getAlienStats('dreadnought', 6);
  assert.ok(s6.scale > s1.scale);
  assert.ok(s6.hp > s1.hp);

  assert.equal(chooseAlienArchetype(1, 0.9), 'striker');
  assert.equal(chooseAlienArchetype(6, 0.9), 'dreadnought');
});

test('hull damage respects invulnerability frames and triggers reachable gameover', () => {
  const firstHit = applyHullDamage(5, 0, 1);
  assert.equal(firstHit.hull, 4);
  assert.equal(firstHit.tookDamage, true);
  assert.equal(firstHit.isGameOver, false);
  assert.ok(firstHit.invulnRemaining > 0);

  const blockedHit = applyHullDamage(firstHit.hull, firstHit.invulnRemaining, 1);
  assert.equal(blockedHit.hull, 4);
  assert.equal(blockedHit.tookDamage, false);

  const lethalHit = applyHullDamage(1, 0, 1);
  assert.equal(lethalHit.hull, 0);
  assert.equal(lethalHit.isGameOver, true);
});

test('kill score scales with combo and overcharge bonus', () => {
  assert.equal(calculateKillScore(100, 0, false), 100);
  assert.equal(calculateKillScore(100, 8, false), 200);
  assert.equal(calculateKillScore(100, 8, true), 250);
});
