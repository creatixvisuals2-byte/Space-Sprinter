export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'gameover';

export type AlienType = 'swarmer' | 'striker' | 'dreadnought';

export interface HudSnapshot {
  phase: GamePhase;
  score: number;
  bestScore: number;
  hull: number;
  maxHull: number;
  level: number;
  maxLevels: number;
  levelProgress: number;
  nextLevelSeconds: number;
  levelBanner: string | null;
  powerUpRemaining: number;
  powerUpDuration: number;
  combo: number;
  aliensDefeated: number;
  starsDodged: number;
  shotsIntercepted: number;
  lasersFired: number;
  muted: boolean;
  damageFlash: number;
}

export interface LevelTuning {
  level: number;
  name: string;
  spawnInterval: number;
  starChance: number;
  speedMultiplier: number;
  alienScale: number;
  alienHpBonus: number;
  alienFireRateMult: number;
  alienProjectileSpeed: number;
  spreadShotCount: number;
  maxConcurrentEnemies: number;
}

export interface LaserConfig {
  isPowered: boolean;
  radius: number;
  length: number;
  speed: number;
  damage: number;
  cooldown: number;
  piercing: boolean;
}

export const CORRIDOR_BOUNDS = {
  minY: -5.6,
  maxY: 5.6,
  playerZ: 4,
  spawnOffsetZ: -86,
  despawnZ: 15,
} as const;

export const GAME_CONSTANTS = {
  maxHull: 5,
  maxLevels: 6,
  levelDurationSeconds: 60,
  playerRadius: 0.95,
  playerSpeedX: 22.5,
  playerSpeedY: 16.5,
  invulnDuration: 1.05,
  powerUpDuration: 10.0,
  powerUpMaxStack: 13.0,
  powerUpRadius: 1.3,
  normalLaserCooldown: 0.12,
  megaLaserCooldown: 0.095,
  hitstopKill: 0.032,
  hitstopPlayerHit: 0.06,
} as const;
