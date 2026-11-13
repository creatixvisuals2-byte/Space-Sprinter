import {
  AlienType,
  CORRIDOR_BOUNDS,
  GAME_CONSTANTS,
  LaserConfig,
  LevelTuning,
} from './types';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

const LEVEL_NAMES = [
  'Outer Rim Skirmish',
  'Nebula Ambush',
  'Heavy Vanguard',
  'Crossfire Gauntlet',
  'Titan Armada',
  'Omega Core Showdown',
] as const;

export function clampDt(rawDt: number): number {
  if (!Number.isFinite(rawDt) || rawDt < 0) return 0;
  return Math.min(rawDt, 0.05);
}

/**
 * Infinite horizontal void (X is unbounded); vertical flight stays inside [-5.6, 5.6].
 */
export function clampPlayerPosition(x: number, y: number): { x: number; y: number } {
  return {
    x,
    y: Math.max(CORRIDOR_BOUNDS.minY, Math.min(CORRIDOR_BOUNDS.maxY, y)),
  };
}

export function wrapCoord(value: number, center: number, halfSpan: number): number {
  const span = halfSpan * 2;
  let offset = value - center;
  while (offset < -halfSpan) offset += span;
  while (offset > halfSpan) offset -= span;
  return center + offset;
}

export function checkSphereOverlap(
  a: Vec3Like,
  radiusA: number,
  b: Vec3Like,
  radiusB: number,
): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  const maxDist = radiusA + radiusB;
  return dx * dx + dy * dy + dz * dz <= maxDist * maxDist;
}

export function checkLaserHitTarget(
  laserPos: Vec3Like,
  laserRadius: number,
  laserHalfLength: number,
  targetPos: Vec3Like,
  targetRadius: number,
): boolean {
  const dx = laserPos.x - targetPos.x;
  const dy = laserPos.y - targetPos.y;
  const radialSum = laserRadius + targetRadius;
  if (dx * dx + dy * dy > radialSum * radialSum) {
    return false;
  }
  const dz = Math.abs(laserPos.z - targetPos.z);
  return dz <= laserHalfLength + targetRadius;
}

export function getLaserConfig(powerUpRemaining: number): LaserConfig {
  const isPowered = powerUpRemaining > 0;
  if (isPowered) {
    return {
      isPowered: true,
      radius: 1.22,
      length: 8.2,
      speed: 128,
      damage: 4,
      cooldown: GAME_CONSTANTS.megaLaserCooldown,
      piercing: true,
    };
  }
  return {
    isPowered: false,
    radius: 0.28,
    length: 3.4,
    speed: 104,
    damage: 1,
    cooldown: GAME_CONSTANTS.normalLaserCooldown,
    piercing: false,
  };
}

export function activatePowerUp(currentRemaining: number): number {
  if (currentRemaining <= 0) {
    return GAME_CONSTANTS.powerUpDuration;
  }
  return Math.min(
    GAME_CONSTANTS.powerUpMaxStack,
    currentRemaining + GAME_CONSTANTS.powerUpDuration * 0.65,
  );
}

export function tickPowerUpTimer(currentRemaining: number, dt: number): number {
  if (currentRemaining <= 0) return 0;
  return Math.max(0, currentRemaining - Math.max(0, dt));
}

export function getLevelStateForElapsed(elapsedSeconds: number): {
  level: number;
  levelProgress: number;
  nextLevelSeconds: number;
  completedAllLevels: boolean;
} {
  const clamped = Math.max(0, elapsedSeconds);
  const totalCap = GAME_CONSTANTS.maxLevels * GAME_CONSTANTS.levelDurationSeconds;
  if (clamped >= totalCap) {
    return {
      level: GAME_CONSTANTS.maxLevels,
      levelProgress: 1,
      nextLevelSeconds: 0,
      completedAllLevels: true,
    };
  }
  const idx = Math.floor(clamped / GAME_CONSTANTS.levelDurationSeconds);
  const within = clamped - idx * GAME_CONSTANTS.levelDurationSeconds;
  const remaining = Math.max(0, GAME_CONSTANTS.levelDurationSeconds - within);
  return {
    level: idx + 1,
    levelProgress: within / GAME_CONSTANTS.levelDurationSeconds,
    nextLevelSeconds: Math.ceil(remaining),
    completedAllLevels: false,
  };
}

export function getLevelTuning(level: number): LevelTuning {
  const lvl = Math.max(1, Math.min(GAME_CONSTANTS.maxLevels, Math.floor(level)));
  const t = lvl - 1; // 0..5
  return {
    level: lvl,
    name: LEVEL_NAMES[t],
    spawnInterval: Math.max(0.34, 0.92 - t * 0.115),
    starChance: Math.min(0.42, 0.22 + t * 0.038),
    speedMultiplier: 1.0 + t * 0.16,
    alienScale: 1.2 + t * 0.22, // 1.20 -> 2.30 (visibly bigger each level!)
    alienHpBonus: Math.floor(t * 0.8),
    alienFireRateMult: 1.0 + t * 0.24,
    alienProjectileSpeed: 32 + t * 4.5,
    spreadShotCount: lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1,
    maxConcurrentEnemies: 6 + t * 2,
  };
}

export function chooseAlienArchetype(level: number, roll: number): AlienType {
  const r = Math.max(0, Math.min(0.9999, roll));
  if (level <= 1) {
    return r < 0.72 ? 'swarmer' : 'striker';
  }
  if (level === 2) {
    return r < 0.45 ? 'swarmer' : r < 0.85 ? 'striker' : 'dreadnought';
  }
  if (level <= 4) {
    return r < 0.34 ? 'swarmer' : r < 0.72 ? 'striker' : 'dreadnought';
  }
  return r < 0.24 ? 'swarmer' : r < 0.58 ? 'striker' : 'dreadnought';
}

export function getAlienStats(
  type: AlienType,
  level = 1,
): {
  hp: number;
  radius: number;
  speed: number;
  score: number;
  scale: number;
} {
  const tuning = getLevelTuning(level);
  const scaleFactor = tuning.alienScale;
  switch (type) {
    case 'swarmer':
      return {
        hp: 1 + Math.floor((level - 1) / 3),
        radius: 0.92 * scaleFactor,
        speed: 28 * tuning.speedMultiplier,
        score: 120 + (level - 1) * 40,
        scale: scaleFactor,
      };
    case 'striker':
      return {
        hp: 2 + tuning.alienHpBonus,
        radius: 1.15 * scaleFactor,
        speed: 19 * tuning.speedMultiplier,
        score: 260 + (level - 1) * 70,
        scale: scaleFactor,
      };
    case 'dreadnought':
      return {
        hp: 4 + tuning.alienHpBonus * 2,
        radius: 1.48 * scaleFactor,
        speed: 16 * tuning.speedMultiplier,
        score: 520 + (level - 1) * 120,
        scale: scaleFactor * 1.08,
      };
  }
}

export function calculateKillScore(baseScore: number, combo: number, isPowered: boolean): number {
  const multiplier = Math.min(4, 1 + Math.floor(combo / 4) * 0.5);
  const powerBonus = isPowered ? 1.25 : 1.0;
  return Math.round(baseScore * multiplier * powerBonus);
}

export function applyHullDamage(
  currentHull: number,
  invulnRemaining: number,
  damage = 1,
): {
  hull: number;
  invulnRemaining: number;
  tookDamage: boolean;
  isGameOver: boolean;
} {
  if (invulnRemaining > 0 || currentHull <= 0) {
    return {
      hull: currentHull,
      invulnRemaining,
      tookDamage: false,
      isGameOver: currentHull <= 0,
    };
  }
  const nextHull = Math.max(0, currentHull - damage);
  return {
    hull: nextHull,
    invulnRemaining: nextHull > 0 ? GAME_CONSTANTS.invulnDuration : 0,
    tookDamage: true,
    isGameOver: nextHull <= 0,
  };
}
