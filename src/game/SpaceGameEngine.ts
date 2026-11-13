import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SpaceAudio } from './audio';
import { AlienFragment, createModelLibrary, ModelLibrary } from './models';
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
import {
  AlienType,
  CORRIDOR_BOUNDS,
  GAME_CONSTANTS,
  GamePhase,
  HudSnapshot,
} from './types';

interface LaserBolt {
  active: boolean;
  isMega: boolean;
  mesh: THREE.Group;
  coreMesh: THREE.Mesh;
  sheathMesh: THREE.Mesh;
  radius: number;
  length: number;
  speed: number;
  damage: number;
  piercing: boolean;
  hitIds: Set<number>;
}

interface EnemyEntity {
  id: number;
  type: AlienType;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  scoreValue: number;
  group: THREE.Group;
  flashMaterials: THREE.MeshStandardMaterial[];
  telegraphCore: THREE.Mesh;
  telegraphRing: THREE.Mesh;
  fragments: AlienFragment[];
  spinner?: THREE.Object3D;
  flashTimer: number;
  koTimer: number;
  koDuration: number;
  isDying: boolean;
  phaseOffset: number;
  offsetX: number;
  baseY: number;
  state: 'approach' | 'telegraph' | 'action';
  stateTimer: number;
  fireTimer: number;
  hasFired: boolean;
}

interface ShockwaveEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface HazardStar {
  id: number;
  group: THREE.Group;
  corona: THREE.Mesh;
  spikesA: THREE.Mesh;
  spikesB: THREE.Mesh;
  radius: number;
  speed: number;
  driftX: number;
  driftY: number;
  countedDodge: boolean;
}

interface PowerUpItem {
  id: number;
  group: THREE.Group;
  core: THREE.Mesh;
  ringA: THREE.Mesh;
  ringB: THREE.Mesh;
  speed: number;
}

interface AlienBolt {
  id: number;
  active: boolean;
  group: THREE.Group;
  ring: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  heavy: boolean;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

const BEST_SCORE_KEY = 'starlance_vanguard_best_score';
const MAX_PARTICLES = 320;
const STARFIELD_COUNT = 420;
const NEBULA_CLOUD_COUNT = 16;

// Pre-allocated scratch math objects (zero GC inside frame loop)
const _scratchObj = new THREE.Object3D();
const _scratchVec = new THREE.Vector3();
const _scratchColor = new THREE.Color();

export class SpaceGameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private models: ModelLibrary;
  private audio = new SpaceAudio();
  private isSoftwareGl: boolean;

  private phase: GamePhase = 'title';
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private lastHudPush = 0;

  private frameId = 0;
  private isTimeoutFrame = false;
  private lastTime = performance.now();
  private disposed = false;

  // Player ship state
  private ship: ReturnType<ModelLibrary['createPlayerShip']>;
  private playerX = 0;
  private playerY = -0.3;
  private shipRoll = 0;
  private shipPitch = 0;
  private shipScalePunch = 1;
  private invulnRemaining = 0;
  private damageFlash = 0;
  private exhaustAccum = 0;

  // Progression & stats
  private score = 0;
  private bestScore = 0;
  private hull: number = GAME_CONSTANTS.maxHull;
  private level = 1;
  private levelProgress = 0;
  private nextLevelSeconds: number = GAME_CONSTANTS.levelDurationSeconds;
  private levelBanner: string | null = null;
  private levelBannerTimer = 0;
  private combo = 0;
  private comboDecay = 0;
  private aliensDefeated = 0;
  private starsDodged = 0;
  private shotsIntercepted = 0;
  private lasersFired = 0;
  private runElapsed = 0;
  private powerUpRemaining = 0;
  private laserCooldown = 0;
  private spawnTimer = 0.5;
  private powerUpSpawnTimer = 5.0;
  private hitstopTimer = 0;
  private cameraTrauma = 0;
  private nextEntityId = 1;

  // Input state
  private heldKeys = new Set<string>();
  private fireQueued = false;
  private pointerActive = false;
  private pointerTargetX = 0;
  private pointerTargetY = 0;

  // Entities & pools
  private lasers: LaserBolt[] = [];
  private enemies: EnemyEntity[] = [];
  private shockwaves: ShockwaveEffect[] = [];
  private stars: HazardStar[] = [];
  private powerUps: PowerUpItem[] = [];
  private alienBolts: AlienBolt[] = [];

  // Shared projectile geometries/materials
  private normalBoltGeo: THREE.CylinderGeometry;
  private normalBoltCoreMat: THREE.MeshBasicMaterial;
  private normalBoltSheathMat: THREE.MeshBasicMaterial;
  private megaBoltGeo: THREE.CylinderGeometry;
  private megaBoltCoreMat: THREE.MeshBasicMaterial;
  private megaBoltSheathMat: THREE.MeshBasicMaterial;

  // Infinite starfield & deep-space nebula clouds
  private starfieldMesh: THREE.InstancedMesh;
  private starfieldData: Array<{ x: number; y: number; z: number; speed: number; scale: number }> = [];
  private nebulaSprites: Array<{ mesh: THREE.Sprite; x: number; y: number; z: number; speed: number }> = [];

  // Particle ring buffer
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;

    try {
      const saved = localStorage.getItem(BEST_SCORE_KEY);
      if (saved) this.bestScore = Math.max(0, Number.parseInt(saved, 10) || 0);
    } catch {
      this.bestScore = 0;
    }

    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'space-canvas');
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const bgHex = 0x030611;
    this.scene.background = new THREE.Color(bgHex);
    this.scene.fog = new THREE.FogExp2(bgHex, 0.0055);

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);

    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 280);
    this.camera.position.set(4.5, 2.2, 11.5);
    this.camera.lookAt(-1.5, 0, -18);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const hemi = new THREE.HemisphereLight(0x60a5fa, 0x1e1b4b, 0.8);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.35);
    keyLight.position.set(16, 24, 18);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 70;
      const d = 16;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.3);
    rimLight.position.set(-18, -8, -24);
    this.scene.add(rimLight);

    this.models = createModelLibrary(this.renderer, this.isSoftwareGl);
    this.ship = this.models.createPlayerShip();
    this.ship.group.position.set(0, -0.3, CORRIDOR_BOUNDS.playerZ);
    this.scene.add(this.ship.group);

    // Infinite deep-space nebula atmosphere (no corridor walls or tunnel rings)
    this.initInfiniteNebulaClouds();

    // Infinite wrapping 3D starfield
    const starGeo = new THREE.BoxGeometry(0.065, 0.065, 2.9);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xdbeafe });
    this.starfieldMesh = new THREE.InstancedMesh(starGeo, starMat, STARFIELD_COUNT);
    this.starfieldMesh.frustumCulled = false;
    for (let i = 0; i < STARFIELD_COUNT; i++) {
      this.starfieldData.push({
        x: (Math.random() * 2 - 1) * 75,
        y: (Math.random() * 2 - 1) * 45,
        z: -145 + Math.random() * 165,
        speed: 62 + Math.random() * 52,
        scale: 0.55 + Math.random() * 1.5,
      });
      _scratchColor.setHSL(0.54 + Math.random() * 0.16, 0.78, 0.72 + Math.random() * 0.25);
      this.starfieldMesh.setColorAt(i, _scratchColor);
    }
    if (this.starfieldMesh.instanceColor) {
      this.starfieldMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.starfieldMesh);

    // Pooled particle ring buffer
    const partGeo = new THREE.OctahedronGeometry(0.17, 0);
    const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(partGeo, partMat, MAX_PARTICLES);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        color: new THREE.Color(0xffffff),
      });
      _scratchObj.position.set(0, -999, 0);
      _scratchObj.scale.setScalar(0);
      _scratchObj.updateMatrix();
      this.particleMesh.setMatrixAt(i, _scratchObj.matrix);
      this.particleMesh.setColorAt(i, _scratchColor.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.particleMesh);

    // Shared laser geometries/materials
    this.normalBoltGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8);
    this.normalBoltGeo.rotateX(Math.PI / 2);
    this.normalBoltCoreMat = new THREE.MeshBasicMaterial({ color: 0xe0f7ff });
    this.normalBoltSheathMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.megaBoltGeo = new THREE.CylinderGeometry(0.5, 0.5, 8.0, 12);
    this.megaBoltGeo.rotateX(Math.PI / 2);
    this.megaBoltCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff8dc });
    this.megaBoltSheathMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.seedTitleShowcase();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.bindInput();
    this.pushHud(true);
    this.scheduleNextFrame();
  }

  private initInfiniteNebulaClouds(): void {
    const tints = [0x38bdf8, 0x818cf8, 0xc084fc, 0xf472b6];
    for (let i = 0; i < NEBULA_CLOUD_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.models.nebulaTexture,
        color: tints[i % tints.length],
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      const scale = 34 + Math.random() * 44;
      sprite.scale.set(scale * 1.4, scale, 1);
      const x = (Math.random() * 2 - 1) * 110;
      const y = (Math.random() * 2 - 1) * 45;
      const z = -65 - Math.random() * 110;
      sprite.position.set(x, y, z);
      this.scene.add(sprite);
      this.nebulaSprites.push({
        mesh: sprite,
        x,
        y,
        z,
        speed: 8 + Math.random() * 10,
      });
    }
  }

  private seedTitleShowcase(): void {
    const starA = this.models.createHazardStar(1.25);
    starA.group.position.set(7.5, 2.5, -24);
    this.scene.add(starA.group);
    this.stars.push({
      id: this.nextEntityId++,
      ...starA,
      radius: 1.2,
      speed: 0,
      driftX: 0,
      driftY: 0,
      countedDodge: true,
    });

    const alienA = this.models.createAlien('striker', 1.35);
    alienA.group.position.set(-6.5, 1.8, -30);
    this.scene.add(alienA.group);
    this.enemies.push({
      id: this.nextEntityId++,
      type: 'striker',
      hp: 2,
      maxHp: 2,
      radius: 1.4,
      speed: 0,
      scoreValue: 260,
      ...alienA,
      flashTimer: 0,
      koTimer: 0,
      koDuration: 0.48,
      isDying: false,
      phaseOffset: 0,
      offsetX: -6.5,
      baseY: 1.8,
      state: 'approach',
      stateTimer: 0,
      fireTimer: 99,
      hasFired: false,
    });

    const pUp = this.models.createPowerUp();
    pUp.group.position.set(4.5, -1.8, -16);
    this.scene.add(pUp.group);
    this.powerUps.push({
      id: this.nextEntityId++,
      ...pUp,
      speed: 0,
    });
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private bindInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      if (this.phase === 'playing' || this.phase === 'title') {
        e.preventDefault();
      }
    }

    if (!e.repeat) {
      if (code === 'KeyM') {
        this.toggleMute();
        return;
      }
      if (this.phase === 'playing' && (code === 'Escape' || code === 'KeyP')) {
        this.pauseGame();
        return;
      }
      if (this.phase === 'paused' && (code === 'Escape' || code === 'KeyP')) {
        this.resumeGame();
        return;
      }
      if (this.phase === 'playing' && (code === 'Space' || code === 'KeyJ')) {
        this.fireQueued = true;
      }
    }
    this.heldKeys.add(code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.heldKeys.clear();
    this.pointerActive = false;
    this.fireQueued = false;
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.heldKeys.clear();
      this.pointerActive = false;
      this.fireQueued = false;
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.phase !== 'playing') return;
    if (e.button !== 0) return;
    this.pointerActive = true;
    this.fireQueued = true;
    this.updatePointerTarget(e.clientX, e.clientY);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointerActive || this.phase !== 'playing') return;
    this.updatePointerTarget(e.clientX, e.clientY);
  };

  private onPointerUp = (): void => {
    this.pointerActive = false;
  };

  private updatePointerTarget(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const clamped = clampPlayerPosition(this.playerX + nx * 9, ny * CORRIDOR_BOUNDS.maxY);
    this.pointerTargetX = clamped.x;
    this.pointerTargetY = clamped.y;
  }

  public startGame(): void {
    this.clearDynamicEntities();
    this.heldKeys.clear();
    this.pointerActive = false;
    this.fireQueued = false;

    this.phase = 'playing';
    this.playerX = 0;
    this.playerY = -0.3;
    this.shipRoll = 0;
    this.shipPitch = 0;
    this.shipScalePunch = 1;
    this.invulnRemaining = 0;
    this.damageFlash = 0;

    this.score = 0;
    this.hull = GAME_CONSTANTS.maxHull;
    this.level = 1;
    this.levelProgress = 0;
    this.nextLevelSeconds = GAME_CONSTANTS.levelDurationSeconds;
    this.levelBanner = `LEVEL 01 · ${getLevelTuning(1).name}`;
    this.levelBannerTimer = 2.6;
    this.combo = 0;
    this.comboDecay = 0;
    this.aliensDefeated = 0;
    this.starsDodged = 0;
    this.shotsIntercepted = 0;
    this.lasersFired = 0;
    this.runElapsed = 0;
    this.powerUpRemaining = 0;
    this.laserCooldown = 0;
    this.spawnTimer = 0.45;
    this.powerUpSpawnTimer = 5.5;
    this.hitstopTimer = 0;
    this.cameraTrauma = 0;

    this.ship.group.position.set(this.playerX, this.playerY, CORRIDOR_BOUNDS.playerZ);
    this.ship.group.rotation.set(0, 0, 0);
    this.ship.group.visible = true;
    this.ship.overchargeAura.visible = false;

    // Immediate opening encounter: agile striker/swarmer ready to shoot, rogue star to dodge, and Hyperbeam Core
    this.spawnAlienAt(0, 0.2, -38, 'striker', 1);
    this.spawnStarAt(-4.2, -0.4, -46, 1.15, 1.0);
    this.spawnPowerUpAt(2.2, -0.2, -42);

    if (!navigator.userActivation || navigator.userActivation.hasBeenActive) {
      this.audio.playStart();
    }
    this.pushHud(true);
  }

  public pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.heldKeys.clear();
    this.pointerActive = false;
    this.pushHud(true);
  }

  public resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.lastTime = performance.now();
    this.pushHud(true);
  }

  public returnToTitle(): void {
    this.clearDynamicEntities();
    this.phase = 'title';
    this.playerX = 0;
    this.playerY = -0.3;
    this.heldKeys.clear();
    this.pointerActive = false;
    this.powerUpRemaining = 0;
    this.ship.overchargeAura.visible = false;
    this.ship.group.visible = true;
    this.seedTitleShowcase();
    this.pushHud(true);
  }

  public toggleMute(): boolean {
    const next = this.audio.toggleMute();
    this.pushHud(true);
    return next;
  }

  private clearDynamicEntities(): void {
    for (const l of this.lasers) this.scene.remove(l.mesh);
    this.lasers.length = 0;

    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies.length = 0;

    for (const sw of this.shockwaves) this.scene.remove(sw.mesh);
    this.shockwaves.length = 0;

    for (const s of this.stars) this.scene.remove(s.group);
    this.stars.length = 0;

    for (const p of this.powerUps) this.scene.remove(p.group);
    this.powerUps.length = 0;

    for (const o of this.alienBolts) this.scene.remove(o.group);
    this.alienBolts.length = 0;
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    this.isTimeoutFrame = false;
    this.frameId = requestAnimationFrame(this.tick);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.isTimeoutFrame = true;
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.isTimeoutFrame = true;
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.isTimeoutFrame = true;
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = clampDt((now - this.lastTime) / 1000);
    this.lastTime = now;

    this.update(dt, now);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.isTimeoutFrame = false;
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private update(dt: number, nowMs: number): void {
    const tSec = nowMs * 0.001;
    const tuning = getLevelTuning(this.level);

    // Infinite wrapping starfield & nebula clouds around camera
    const speedFactor =
      this.phase === 'paused'
        ? 0.08
        : (this.powerUpRemaining > 0 ? 1.55 : 1.0) * (0.9 + tuning.speedMultiplier * 0.25);

    const camX = this.camera.position.x;
    const camY = this.camera.position.y;

    for (let i = 0; i < STARFIELD_COUNT; i++) {
      const st = this.starfieldData[i];
      st.z += st.speed * speedFactor * dt;
      if (st.z > 20) {
        st.z = -145;
      }
      st.x = wrapCoord(st.x, camX, 75);
      st.y = wrapCoord(st.y, camY, 45);
      _scratchObj.position.set(st.x, st.y, st.z);
      _scratchObj.rotation.set(0, 0, 0);
      _scratchObj.scale.set(1, 1, st.scale * (this.powerUpRemaining > 0 ? 1.9 : 1.15));
      _scratchObj.updateMatrix();
      this.starfieldMesh.setMatrixAt(i, _scratchObj.matrix);
    }
    this.starfieldMesh.instanceMatrix.needsUpdate = true;

    for (const neb of this.nebulaSprites) {
      neb.z += neb.speed * speedFactor * dt;
      if (neb.z > -15) {
        neb.z = -175;
      }
      neb.x = wrapCoord(neb.x, camX, 110);
      neb.y = wrapCoord(neb.y, camY, 50);
      neb.mesh.position.set(neb.x, neb.y, neb.z);
    }

    this.updateParticles(dt);
    this.updateShockwaves(dt);

    if (this.phase === 'title') {
      this.updateTitleTour(dt, tSec);
      return;
    }

    if (this.phase === 'paused' || this.phase === 'gameover' || this.phase === 'victory') {
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.8);
      this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
      if (this.phase === 'gameover' || this.phase === 'victory') {
        this.camera.position.x = THREE.MathUtils.damp(
          this.camera.position.x,
          this.playerX + Math.sin(tSec * 0.4) * 3.5,
          2,
          dt,
        );
        this.camera.lookAt(this.playerX, 0, -18);
      }
      this.pushHud(false, nowMs);
      return;
    }

    // Playing phase
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.0);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.6);
    this.invulnRemaining = Math.max(0, this.invulnRemaining - dt);
    this.shipScalePunch = THREE.MathUtils.damp(this.shipScalePunch, 1, 12, dt);

    if (this.levelBannerTimer > 0) {
      this.levelBannerTimer -= dt;
      if (this.levelBannerTimer <= 0) {
        this.levelBanner = null;
      }
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateCameraRig(dt, tSec);
      return;
    }

    this.runElapsed += dt;
    const lvlState = getLevelStateForElapsed(this.runElapsed);
    this.levelProgress = lvlState.levelProgress;
    this.nextLevelSeconds = lvlState.nextLevelSeconds;

    if (lvlState.completedAllLevels) {
      this.phase = 'victory';
      this.audio.playVictory();
      this.pushHud(true);
      return;
    }

    if (lvlState.level > this.level) {
      this.level = lvlState.level;
      const nextCfg = getLevelTuning(this.level);
      this.levelBanner = `LEVEL 0${this.level} · ${nextCfg.name.toUpperCase()}`;
      this.levelBannerTimer = 3.2;
      this.audio.playLevelUp();
      this.emitBurst(this.playerX, this.playerY, CORRIDOR_BOUNDS.playerZ - 4, 0x38bdf8, 20, 18);
      this.pushHud(true);
    }

    if (this.combo > 0) {
      this.comboDecay -= dt;
      if (this.comboDecay <= 0) this.combo = 0;
    }

    // Power-up timer decay & ship aura
    this.powerUpRemaining = tickPowerUpTimer(this.powerUpRemaining, dt);
    const isPowered = this.powerUpRemaining > 0;
    this.ship.overchargeAura.visible = isPowered;
    if (isPowered) {
      this.ship.overchargeAura.rotation.z += dt * 4.8;
      this.ship.overchargeAura.scale.setScalar(1 + Math.sin(tSec * 15) * 0.09);
    }
    this.ship.cannonTips.forEach((tip) => {
      const mat = tip.material as THREE.MeshStandardMaterial;
      if (isPowered) {
        mat.color.setHex(0xfde047);
        mat.emissive.setHex(0xf59e0b);
        mat.emissiveIntensity = 3.2;
        tip.scale.setScalar(1.75);
      } else {
        mat.color.setHex(0x38bdf8);
        mat.emissive.setHex(0x0ea5e9);
        mat.emissiveIntensity = 1.9;
        tip.scale.setScalar(1.0);
      }
    });

    const shieldMat = this.ship.shieldRing.material as THREE.MeshBasicMaterial;
    if (this.invulnRemaining > 0) {
      shieldMat.opacity = 0.55 + Math.sin(tSec * 28) * 0.35;
      this.ship.shieldRing.rotation.z -= dt * 3;
    } else {
      shieldMat.opacity = 0;
    }

    this.ship.thrusters.forEach((plume, idx) => {
      const flicker = 0.9 + Math.sin(tSec * 40 + idx * 2) * 0.25;
      plume.scale.set(1, 1, flicker * (isPowered ? 1.65 : 1.15));
      (plume.material as THREE.MeshBasicMaterial).color.setHex(isPowered ? 0xfbbf24 : 0x38bdf8);
    });

    // Subtle continuous thruster wake particles
    this.exhaustAccum += dt;
    if (this.exhaustAccum >= 0.045) {
      this.exhaustAccum = 0;
      const wakeCol = isPowered ? 0xfbbf24 : 0x38bdf8;
      this.emitTrail(this.playerX - 0.58, this.playerY - 0.02, CORRIDOR_BOUNDS.playerZ + 1.5, wakeCol);
      this.emitTrail(this.playerX + 0.58, this.playerY - 0.02, CORRIDOR_BOUNDS.playerZ + 1.5, wakeCol);
    }

    this.updatePlayerMovement(dt);
    this.updatePlayerFiring(dt);
    this.updateSpawners(dt);
    this.updateLasers(dt);
    this.updateHazardStars(dt, tSec);
    this.updatePowerUps(dt, tSec);
    this.updateEnemies(dt, tSec);
    this.updateAlienBolts(dt);
    this.updateCameraRig(dt, tSec);

    this.pushHud(false, nowMs);
  }

  private updateTitleTour(dt: number, tSec: number): void {
    const hoverX = Math.sin(tSec * 0.7) * 1.4 + 2.2;
    const hoverY = Math.cos(tSec * 0.9) * 0.65 - 0.1;
    this.ship.group.position.x = THREE.MathUtils.damp(this.ship.group.position.x, hoverX, 4, dt);
    this.ship.group.position.y = THREE.MathUtils.damp(this.ship.group.position.y, hoverY, 4, dt);
    this.ship.group.position.z = CORRIDOR_BOUNDS.playerZ;
    this.ship.group.rotation.z = -Math.cos(tSec * 0.7) * 0.26;
    this.ship.group.rotation.x = Math.sin(tSec * 0.9) * 0.08;

    this.ship.thrusters.forEach((plume, idx) => {
      plume.scale.set(1, 1, 0.9 + Math.sin(tSec * 30 + idx) * 0.2);
    });

    for (const st of this.stars) {
      st.group.rotation.y += dt * 0.8;
      st.corona.lookAt(this.camera.position);
    }
    for (const en of this.enemies) {
      en.group.position.y = en.baseY + Math.sin(tSec * 1.8) * 0.4;
      if (en.spinner) en.spinner.rotation.y += dt * 1.8;
    }
    for (const pu of this.powerUps) {
      pu.core.rotation.y += dt * 1.5;
      pu.ringA.rotation.x += dt * 2.1;
      pu.ringB.rotation.y -= dt * 1.8;
    }

    const targetCamX = 1.6 + Math.sin(tSec * 0.35) * 1.8;
    const targetCamY = 1.6 + Math.cos(tSec * 0.45) * 0.5;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 3, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 3, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, 11.2, 3, dt);
    this.camera.lookAt(0.4, 0, -14);
  }

  private updatePlayerMovement(dt: number): void {
    let moveX = 0;
    let moveY = 0;
    if (this.heldKeys.has('ArrowLeft') || this.heldKeys.has('KeyA')) moveX -= 1;
    if (this.heldKeys.has('ArrowRight') || this.heldKeys.has('KeyD')) moveX += 1;
    if (this.heldKeys.has('ArrowUp') || this.heldKeys.has('KeyW')) moveY += 1;
    if (this.heldKeys.has('ArrowDown') || this.heldKeys.has('KeyS')) moveY -= 1;

    if (moveX !== 0 || moveY !== 0) {
      const len = Math.hypot(moveX, moveY);
      const nx = moveX / len;
      const ny = moveY / len;
      const clamped = clampPlayerPosition(
        this.playerX + nx * GAME_CONSTANTS.playerSpeedX * dt,
        this.playerY + ny * GAME_CONSTANTS.playerSpeedY * dt,
      );
      this.playerX = clamped.x;
      this.playerY = clamped.y;
    } else if (this.pointerActive) {
      this.playerX = THREE.MathUtils.damp(this.playerX, this.pointerTargetX, 11, dt);
      this.playerY = THREE.MathUtils.damp(this.playerY, this.pointerTargetY, 11, dt);
    }

    const targetRoll = -moveX * 0.52;
    const targetPitch = moveY * 0.25;
    this.shipRoll = THREE.MathUtils.damp(this.shipRoll, targetRoll, 12, dt);
    this.shipPitch = THREE.MathUtils.damp(this.shipPitch, targetPitch, 12, dt);

    this.ship.group.position.set(this.playerX, this.playerY, CORRIDOR_BOUNDS.playerZ);
    this.ship.group.rotation.set(this.shipPitch, 0, this.shipRoll);
    this.ship.group.scale.setScalar(this.shipScalePunch);
  }

  private updatePlayerFiring(dt: number): void {
    this.laserCooldown = Math.max(0, this.laserCooldown - dt);
    const wantsFire =
      this.heldKeys.has('Space') ||
      this.heldKeys.has('KeyJ') ||
      this.pointerActive ||
      this.fireQueued;

    if (wantsFire && this.laserCooldown <= 0) {
      this.fireQueued = false;
      const cfg = getLaserConfig(this.powerUpRemaining);
      this.laserCooldown = cfg.cooldown;
      this.lasersFired += 1;
      this.spawnLaserVolley(cfg.isPowered, cfg);
      this.audio.playLaser(cfg.isPowered);
      this.shipScalePunch = cfg.isPowered ? 0.91 : 0.955;

      const pColor = cfg.isPowered ? 0xfbbf24 : 0x38bdf8;
      this.emitBurst(this.playerX - 1.56, this.playerY - 0.06, CORRIDOR_BOUNDS.playerZ - 0.3, pColor, 3, 6);
      this.emitBurst(this.playerX + 1.56, this.playerY - 0.06, CORRIDOR_BOUNDS.playerZ - 0.3, pColor, 3, 6);
    }
  }

  private spawnLaserVolley(isPowered: boolean, cfg: ReturnType<typeof getLaserConfig>): void {
    if (isPowered) {
      this.createLaserBolt(this.playerX, this.playerY, CORRIDOR_BOUNDS.playerZ - 1.8, true, cfg);
      this.createLaserBolt(this.playerX - 1.56, this.playerY - 0.06, CORRIDOR_BOUNDS.playerZ - 0.8, false, {
        ...cfg,
        radius: 0.4,
        length: 4.4,
        damage: 2,
      });
      this.createLaserBolt(this.playerX + 1.56, this.playerY - 0.06, CORRIDOR_BOUNDS.playerZ - 0.8, false, {
        ...cfg,
        radius: 0.4,
        length: 4.4,
        damage: 2,
      });
    } else {
      this.createLaserBolt(this.playerX - 1.56, this.playerY - 0.06, CORRIDOR_BOUNDS.playerZ - 0.6, false, cfg);
      this.createLaserBolt(this.playerX + 1.56, this.playerY - 0.06, CORRIDOR_BOUNDS.playerZ - 0.6, false, cfg);
    }
  }

  private createLaserBolt(
    x: number,
    y: number,
    z: number,
    isMega: boolean,
    cfg: ReturnType<typeof getLaserConfig>,
  ): void {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      isMega ? this.megaBoltGeo : this.normalBoltGeo,
      isMega ? this.megaBoltCoreMat : this.normalBoltCoreMat,
    );
    const sheath = new THREE.Mesh(
      isMega ? this.megaBoltGeo : this.normalBoltGeo,
      isMega ? this.megaBoltSheathMat : this.normalBoltSheathMat,
    );
    sheath.scale.set(isMega ? 2.25 : 1.85, isMega ? 2.25 : 1.85, 1.08);

    group.add(core);
    group.add(sheath);
    group.position.set(x, y, z);
    if (isMega) {
      group.scale.set(1.22, 1.22, 1.12);
    }
    this.scene.add(group);

    this.lasers.push({
      active: true,
      isMega,
      mesh: group,
      coreMesh: core,
      sheathMesh: sheath,
      radius: cfg.radius,
      length: cfg.length,
      speed: cfg.speed,
      damage: cfg.damage,
      piercing: cfg.piercing,
      hitIds: new Set<number>(),
    });
  }

  private updateSpawners(dt: number): void {
    const tuning = getLevelTuning(this.level);
    this.spawnTimer -= dt;
    this.powerUpSpawnTimer -= dt;

    if (this.powerUpSpawnTimer <= 0) {
      this.powerUpSpawnTimer = Math.max(8.5, 13.5 - (this.level - 1) * 0.7);
      this.spawnPowerUp();
    }

    if (this.spawnTimer <= 0) {
      this.spawnTimer = tuning.spawnInterval * (0.78 + Math.random() * 0.42);
      const roll = Math.random();
      if (roll < tuning.starChance) {
        this.spawnHazardStar(tuning.speedMultiplier);
      } else if (this.enemies.length < tuning.maxConcurrentEnemies) {
        this.spawnAlien(this.level);
      } else {
        this.spawnHazardStar(tuning.speedMultiplier);
      }
    }
  }

  private spawnHazardStar(speedMult: number): void {
    const scale = 0.95 + Math.random() * 0.55;
    const x = this.playerX + (Math.random() * 2 - 1) * 14;
    const y = (Math.random() * 2 - 1) * (CORRIDOR_BOUNDS.maxY - 0.6);
    this.spawnStarAt(x, y, CORRIDOR_BOUNDS.spawnOffsetZ, scale, speedMult);
  }

  private spawnStarAt(
    x: number,
    y: number,
    z: number,
    scale: number,
    speedMult: number,
  ): void {
    const star = this.models.createHazardStar(scale);
    star.group.position.set(x, y, z);
    this.scene.add(star.group);

    this.stars.push({
      id: this.nextEntityId++,
      ...star,
      radius: 1.0 * scale,
      speed: (26 + Math.random() * 11) * speedMult,
      driftX: (Math.random() - 0.5) * (2.6 + this.level * 0.5),
      driftY: (Math.random() - 0.5) * 1.5,
      countedDodge: false,
    });
  }

  private spawnAlien(level: number): void {
    const type = chooseAlienArchetype(level, Math.random());
    const x = this.playerX + (Math.random() * 2 - 1) * 13;
    const y = (Math.random() * 2 - 1) * (CORRIDOR_BOUNDS.maxY - 0.8);
    this.spawnAlienAt(x, y, CORRIDOR_BOUNDS.spawnOffsetZ, type, level);
  }

  private spawnAlienAt(
    x: number,
    y: number,
    z: number,
    type: AlienType,
    level: number,
  ): void {
    const stats = getAlienStats(type, level);
    const model = this.models.createAlien(type, stats.scale);
    model.group.position.set(x, y, z);
    this.scene.add(model.group);

    this.enemies.push({
      id: this.nextEntityId++,
      type,
      hp: stats.hp,
      maxHp: stats.hp,
      radius: stats.radius,
      speed: stats.speed,
      scoreValue: stats.score,
      ...model,
      flashTimer: 0,
      koTimer: 0,
      koDuration: 0.52,
      isDying: false,
      phaseOffset: Math.random() * Math.PI * 2,
      offsetX: x - this.playerX,
      baseY: y,
      state: 'approach',
      stateTimer: 0,
      fireTimer: 0.55 + Math.random() * 0.65,
      hasFired: false,
    });
  }

  private spawnPowerUp(): void {
    const x = this.playerX + (Math.random() * 2 - 1) * 10;
    const y = (Math.random() * 2 - 1) * (CORRIDOR_BOUNDS.maxY - 1.2);
    this.spawnPowerUpAt(x, y, CORRIDOR_BOUNDS.spawnOffsetZ);
  }

  private spawnPowerUpAt(x: number, y: number, z: number): void {
    const pu = this.models.createPowerUp();
    pu.group.position.set(x, y, z);
    this.scene.add(pu.group);
    this.powerUps.push({
      id: this.nextEntityId++,
      ...pu,
      speed: 23,
    });
  }

  private updateLasers(dt: number): void {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const bolt = this.lasers[i];
      bolt.mesh.position.z -= bolt.speed * dt;
      if (bolt.isMega) {
        bolt.sheathMesh.rotation.z += dt * 18;
      }

      if (bolt.mesh.position.z < -118) {
        bolt.active = false;
      }

      // Deflect off indestructible rogue stars
      if (bolt.active) {
        for (const star of this.stars) {
          if (
            checkLaserHitTarget(
              bolt.mesh.position,
              bolt.radius * 0.7,
              bolt.length * 0.5,
              star.group.position,
              star.radius,
            )
          ) {
            this.emitBurst(
              bolt.mesh.position.x,
              bolt.mesh.position.y,
              star.group.position.z + star.radius,
              0xffd166,
              4,
              9,
            );
            if (!bolt.piercing) {
              bolt.active = false;
              this.audio.playDeflect();
              break;
            }
          }
        }
      }

      // Intercept incoming alien plasma bolts!
      if (bolt.active) {
        for (let bIdx = this.alienBolts.length - 1; bIdx >= 0; bIdx--) {
          const aBolt = this.alienBolts[bIdx];
          if (!aBolt.active) continue;
          if (
            checkLaserHitTarget(
              bolt.mesh.position,
              bolt.radius * 1.15,
              bolt.length * 0.5,
              aBolt.group.position,
              aBolt.radius * 1.25,
            )
          ) {
            aBolt.active = false;
            this.shotsIntercepted += 1;
            this.score += 50;
            if (this.score > this.bestScore) this.bestScore = this.score;
            this.audio.playIntercept();
            this.emitBurst(
              aBolt.group.position.x,
              aBolt.group.position.y,
              aBolt.group.position.z,
              0xf472b6,
              8,
              12,
            );
            if (!bolt.piercing) {
              bolt.active = false;
              break;
            }
          }
        }
      }

      // Hit aliens
      if (bolt.active) {
        for (const enemy of this.enemies) {
          if (enemy.isDying || bolt.hitIds.has(enemy.id)) continue;
          if (
            checkLaserHitTarget(
              bolt.mesh.position,
              bolt.radius,
              bolt.length * 0.5,
              enemy.group.position,
              enemy.radius,
            )
          ) {
            bolt.hitIds.add(enemy.id);
            this.damageEnemy(enemy, bolt.damage);
            if (!bolt.piercing) {
              bolt.active = false;
              break;
            }
          }
        }
      }

      if (!bolt.active) {
        this.scene.remove(bolt.mesh);
        this.lasers.splice(i, 1);
      }
    }
  }

  private damageEnemy(enemy: EnemyEntity, damage: number): void {
    enemy.hp -= damage;
    enemy.flashTimer = 0.065;
    enemy.flashMaterials.forEach((m) => m.emissive.setHex(0xffffff));

    this.emitBurst(
      enemy.group.position.x,
      enemy.group.position.y,
      enemy.group.position.z,
      this.powerUpRemaining > 0 ? 0xfbbf24 : 0x38bdf8,
      7,
      11,
    );

    if (enemy.hp <= 0) {
      enemy.isDying = true;
      enemy.koTimer = enemy.koDuration;
      (enemy.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
      this.aliensDefeated += 1;
      this.combo += 1;
      this.comboDecay = 3.5;

      const gained = calculateKillScore(enemy.scoreValue, this.combo, this.powerUpRemaining > 0);
      this.score += gained;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        try {
          localStorage.setItem(BEST_SCORE_KEY, String(this.bestScore));
        } catch {
          // Ignore storage quota errors
        }
      }

      const isHeavy = enemy.type !== 'swarmer';
      const colorHex =
        enemy.type === 'dreadnought' ? 0xf97316 : enemy.type === 'striker' ? 0x2dd4bf : 0xf43f5e;

      // Expanding destruction shockwave ring + shatter flash
      const swMesh = this.models.createShockwaveRing(colorHex);
      swMesh.position.copy(enemy.group.position);
      swMesh.scale.setScalar(0.6);
      this.scene.add(swMesh);
      this.shockwaves.push({ mesh: swMesh, life: 0.42, maxLife: 0.42 });

      this.audio.playExplosion(isHeavy);
      this.hitstopTimer = isHeavy ? GAME_CONSTANTS.hitstopKill * 1.25 : GAME_CONSTANTS.hitstopKill * 0.7;
      this.cameraTrauma = Math.min(1, this.cameraTrauma + (isHeavy ? 0.45 : 0.24));
      this.emitBurst(
        enemy.group.position.x,
        enemy.group.position.y,
        enemy.group.position.z,
        colorHex,
        isHeavy ? 28 : 20,
        20,
      );
      this.emitBurst(
        enemy.group.position.x,
        enemy.group.position.y,
        enemy.group.position.z,
        0xffffff,
        8,
        14,
      );
    }
  }

  private updateShockwaves(dt: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        this.scene.remove(sw.mesh);
        this.shockwaves.splice(i, 1);
        continue;
      }
      const progress = 1 - sw.life / sw.maxLife;
      sw.mesh.scale.setScalar(0.7 + progress * 5.2);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.9;
    }
  }

  private updateHazardStars(dt: number, tSec: number): void {
    _scratchVec.set(this.playerX, this.playerY, CORRIDOR_BOUNDS.playerZ);

    for (let i = this.stars.length - 1; i >= 0; i--) {
      const star = this.stars[i];
      star.group.position.z += star.speed * dt;
      star.group.position.x += star.driftX * dt;
      star.group.position.y += star.driftY * dt;

      star.spikesA.rotation.y += dt * 2.1;
      star.spikesA.rotation.x += dt * 1.2;
      star.spikesB.rotation.z -= dt * 2.4;
      star.corona.lookAt(this.camera.position);
      star.corona.scale.setScalar(1 + Math.sin(tSec * 9 + star.id) * 0.09);

      if (!star.countedDodge && star.group.position.z > CORRIDOR_BOUNDS.playerZ + 1.5) {
        star.countedDodge = true;
        this.starsDodged += 1;
        this.score += 30;
        if (this.score > this.bestScore) this.bestScore = this.score;
      }

      if (
        checkSphereOverlap(
          _scratchVec,
          GAME_CONSTANTS.playerRadius,
          star.group.position,
          star.radius * 0.85,
        )
      ) {
        this.handlePlayerDamage();
        this.emitBurst(star.group.position.x, star.group.position.y, star.group.position.z, 0xffa62b, 20, 18);
        this.scene.remove(star.group);
        this.stars.splice(i, 1);
        continue;
      }

      if (star.group.position.z > CORRIDOR_BOUNDS.despawnZ) {
        this.scene.remove(star.group);
        this.stars.splice(i, 1);
      }
    }
  }

  private updatePowerUps(dt: number, tSec: number): void {
    _scratchVec.set(this.playerX, this.playerY, CORRIDOR_BOUNDS.playerZ);

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      pu.group.position.z += pu.speed * dt;
      pu.core.rotation.y += dt * 2.8;
      pu.ringA.rotation.x += dt * 3.4;
      pu.ringB.rotation.y -= dt * 2.9;
      pu.group.position.y += Math.sin(tSec * 5 + pu.id) * 0.09 * dt * 4;

      if (
        checkSphereOverlap(
          _scratchVec,
          GAME_CONSTANTS.playerRadius + 0.4,
          pu.group.position,
          GAME_CONSTANTS.powerUpRadius,
        )
      ) {
        this.powerUpRemaining = activatePowerUp(this.powerUpRemaining);
        this.score += 180;
        if (this.score > this.bestScore) this.bestScore = this.score;
        this.audio.playPowerUp();
        this.shipScalePunch = 1.2;
        this.emitBurst(pu.group.position.x, pu.group.position.y, pu.group.position.z, 0xfbbf24, 24, 16);
        this.scene.remove(pu.group);
        this.powerUps.splice(i, 1);
        this.pushHud(true);
        continue;
      }

      if (pu.group.position.z > CORRIDOR_BOUNDS.despawnZ) {
        this.scene.remove(pu.group);
        this.powerUps.splice(i, 1);
      }
    }
  }

  private updateEnemies(dt: number, tSec: number): void {
    _scratchVec.set(this.playerX, this.playerY, CORRIDOR_BOUNDS.playerZ);
    const tuning = getLevelTuning(this.level);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];

      if (en.flashTimer > 0) {
        en.flashTimer -= dt;
        if (en.flashTimer <= 0) {
          en.flashMaterials.forEach((m, idx) => {
            if (en.type === 'swarmer') m.emissive.setHex(idx === 2 ? 0xff2a5f : 0x000000);
            else if (en.type === 'striker') m.emissive.setHex(idx === 2 ? 0xe879f9 : 0x000000);
            else m.emissive.setHex(idx === 2 ? 0xf97316 : 0x000000);
          });
        }
      }

      // Shatter, explode outward, and dissolve disappearance animation!
      if (en.isDying) {
        en.koTimer -= dt;
        const progress = 1 - Math.max(0, en.koTimer / en.koDuration);
        const fadeScale = Math.max(0.01, 1 - progress * progress);

        for (const frag of en.fragments) {
          frag.mesh.position.x += frag.vx * dt;
          frag.mesh.position.y += frag.vy * dt;
          frag.mesh.position.z += frag.vz * dt;
          frag.mesh.rotation.x += frag.rx * dt;
          frag.mesh.rotation.y += frag.ry * dt;
          frag.mesh.scale.setScalar(fadeScale);
        }

        if (en.koTimer <= 0) {
          this.scene.remove(en.group);
          this.enemies.splice(i, 1);
        }
        continue;
      }

      if (en.spinner) {
        en.spinner.rotation.y += dt * 3.6;
      }

      const ringMat = en.telegraphRing.material as THREE.MeshBasicMaterial;

      // Distinct policies + authentic alien shooting for all archetypes
      if (en.type === 'swarmer') {
        en.group.position.z += en.speed * dt;
        const weaveTarget = this.playerX + en.offsetX * 0.55 + Math.sin(tSec * 3.8 + en.phaseOffset) * 2.8;
        en.group.position.x = THREE.MathUtils.damp(en.group.position.x, weaveTarget, 2.6, dt);
        en.group.position.y = THREE.MathUtils.damp(
          en.group.position.y,
          this.playerY * 0.55 + en.baseY * 0.45,
          2.0,
          dt,
        );
        en.group.rotation.z = Math.sin(tSec * 3.8 + en.phaseOffset) * 0.4;

        if (en.state === 'approach' && en.group.position.z >= -48 && en.group.position.z <= -16) {
          en.fireTimer -= dt * tuning.alienFireRateMult;
          if (en.fireTimer <= 0) {
            en.state = 'telegraph';
            en.stateTimer = 0.34;
            this.audio.playTelegraph();
          }
        } else if (en.state === 'telegraph') {
          en.stateTimer -= dt;
          ringMat.opacity = 0.85;
          en.telegraphRing.scale.setScalar(0.5 + (en.stateTimer / 0.34) * 1.1);
          en.telegraphCore.scale.setScalar(1.45);
          if (en.stateTimer <= 0) {
            en.state = 'action';
            ringMat.opacity = 0;
            en.telegraphCore.scale.setScalar(1);
            this.fireAlienVolley(en, 1, false, tuning.alienProjectileSpeed);
          }
        }
      } else if (en.type === 'striker') {
        if (en.state === 'approach') {
          en.group.position.z += en.speed * dt;
          en.group.position.x =
            this.playerX * 0.4 + en.offsetX * 0.6 + Math.sin(tSec * 2.4 + en.phaseOffset) * 3.2;
          if (en.group.position.z >= -38) {
            en.state = 'telegraph';
            en.stateTimer = 0.44;
            this.audio.playTelegraph();
          }
        } else if (en.state === 'telegraph') {
          en.stateTimer -= dt;
          en.group.position.z += en.speed * 0.25 * dt;
          ringMat.opacity = 0.92;
          en.telegraphRing.scale.setScalar(0.45 + (en.stateTimer / 0.44) * 1.4);
          en.telegraphCore.scale.setScalar(1.55 + Math.sin(tSec * 35) * 0.35);
          if (en.stateTimer <= 0) {
            en.state = 'action';
            ringMat.opacity = 0;
            en.telegraphCore.scale.setScalar(1);
            if (!en.hasFired) {
              en.hasFired = true;
              this.fireAlienVolley(
                en,
                tuning.spreadShotCount,
                this.level >= 4,
                tuning.alienProjectileSpeed,
              );
            }
          }
        } else {
          en.group.position.z += en.speed * 1.3 * dt;
        }
      } else {
        // Dreadnought armored cruiser
        if (en.state === 'approach') {
          en.group.position.z += en.speed * dt;
          if (en.group.position.z >= -48) {
            en.state = 'telegraph';
            en.stateTimer = 0.52;
            this.audio.playTelegraph();
          }
        } else if (en.state === 'telegraph') {
          en.stateTimer -= dt;
          en.group.position.z += en.speed * 0.22 * dt;
          en.group.position.x = THREE.MathUtils.damp(en.group.position.x, this.playerX, 3.2, dt);
          ringMat.opacity = 0.95;
          en.telegraphRing.scale.setScalar(0.5 + (en.stateTimer / 0.52) * 1.6);
          en.telegraphCore.scale.setScalar(1.65 + Math.sin(tSec * 40) * 0.4);
          if (en.stateTimer <= 0) {
            en.state = 'action';
            ringMat.opacity = 0;
            en.telegraphCore.scale.setScalar(1);
            if (!en.hasFired) {
              en.hasFired = true;
              this.fireAlienVolley(
                en,
                Math.max(2, tuning.spreadShotCount),
                true,
                tuning.alienProjectileSpeed * 1.08,
              );
            }
          }
        } else {
          en.group.position.z += en.speed * 2.15 * dt;
        }
      }

      if (
        checkSphereOverlap(
          _scratchVec,
          GAME_CONSTANTS.playerRadius,
          en.group.position,
          en.radius * 0.85,
        )
      ) {
        this.handlePlayerDamage();
        this.emitBurst(en.group.position.x, en.group.position.y, en.group.position.z, 0xf43f5e, 20, 18);
        this.scene.remove(en.group);
        this.enemies.splice(i, 1);
        continue;
      }

      if (en.group.position.z > CORRIDOR_BOUNDS.despawnZ) {
        this.scene.remove(en.group);
        this.enemies.splice(i, 1);
      }
    }
  }

  private fireAlienVolley(
    enemy: EnemyEntity,
    count: number,
    heavy: boolean,
    speed: number,
  ): void {
    const origin = enemy.group.position;
    this.audio.playAlienShot(heavy);
    this.emitBurst(origin.x, origin.y, origin.z + 1.0, heavy ? 0xd946ef : 0xf43f5e, 6, 8);

    const baseDx = this.playerX - origin.x;
    const baseDy = this.playerY - origin.y;
    const baseDz = CORRIDOR_BOUNDS.playerZ - origin.z;
    const baseLen = Math.max(0.01, Math.hypot(baseDx, baseDy, baseDz));
    const dirX = baseDx / baseLen;
    const dirY = baseDy / baseLen;
    const dirZ = baseDz / baseLen;

    const spreadStep = 0.14;
    const half = (count - 1) * 0.5;

    for (let s = 0; s < count; s++) {
      const angleOffset = (s - half) * spreadStep;
      const cosA = Math.cos(angleOffset);
      const sinA = Math.sin(angleOffset);
      const rx = dirX * cosA - dirZ * sinA;
      const rz = dirX * sinA + dirZ * cosA;

      const boltModel = this.models.createAlienPlasmaBolt(heavy);
      boltModel.group.position.set(origin.x, origin.y, origin.z + 1.1);
      boltModel.group.lookAt(
        origin.x + rx * 10,
        origin.y + dirY * 10,
        origin.z + 1.1 + rz * 10,
      );
      this.scene.add(boltModel.group);

      this.alienBolts.push({
        id: this.nextEntityId++,
        active: true,
        group: boltModel.group,
        ring: boltModel.ring,
        vx: rx * speed,
        vy: dirY * speed,
        vz: rz * speed,
        radius: heavy ? 0.58 : 0.44,
        heavy,
      });
    }
  }

  private updateAlienBolts(dt: number): void {
    _scratchVec.set(this.playerX, this.playerY, CORRIDOR_BOUNDS.playerZ);

    for (let i = this.alienBolts.length - 1; i >= 0; i--) {
      const bolt = this.alienBolts[i];
      bolt.group.position.x += bolt.vx * dt;
      bolt.group.position.y += bolt.vy * dt;
      bolt.group.position.z += bolt.vz * dt;
      bolt.ring.rotation.z += dt * 12;

      if (checkSphereOverlap(_scratchVec, GAME_CONSTANTS.playerRadius, bolt.group.position, bolt.radius)) {
        this.handlePlayerDamage();
        this.emitBurst(bolt.group.position.x, bolt.group.position.y, bolt.group.position.z, 0xf43f5e, 14, 14);
        bolt.active = false;
      } else if (bolt.group.position.z > CORRIDOR_BOUNDS.despawnZ) {
        bolt.active = false;
      }

      if (!bolt.active) {
        this.scene.remove(bolt.group);
        this.alienBolts.splice(i, 1);
      }
    }
  }

  private handlePlayerDamage(): void {
    const res = applyHullDamage(this.hull, this.invulnRemaining, 1);
    if (!res.tookDamage) return;

    this.hull = res.hull;
    this.invulnRemaining = res.invulnRemaining;
    this.combo = 0;
    this.damageFlash = 1.0;
    this.cameraTrauma = 1.0;
    this.hitstopTimer = GAME_CONSTANTS.hitstopPlayerHit;
    this.shipScalePunch = 0.82;
    this.audio.playPlayerHit();

    if (res.isGameOver) {
      this.phase = 'gameover';
      this.ship.group.visible = false;
      this.emitBurst(this.playerX, this.playerY, CORRIDOR_BOUNDS.playerZ, 0xff9f1c, 34, 22);
      this.audio.playGameOver();
    }

    this.pushHud(true);
  }

  private updateCameraRig(dt: number, tSec: number): void {
    const aspect = this.camera.aspect || 1;
    const baseFov = aspect < 1 ? Math.min(82, 58 / Math.max(0.58, aspect)) : 58;
    const targetFov = baseFov + (this.powerUpRemaining > 0 ? 6 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }

    // Follow player 1:1 horizontally through the infinite void with smooth lag
    const desiredX = this.playerX * 0.92;
    const desiredY = this.playerY * 0.62 + 2.35;
    const desiredZ = CORRIDOR_BOUNDS.playerZ + 9.4;

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, desiredX, 8.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, desiredY, 8.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, desiredZ, 8.5, dt);

    const shake = this.cameraTrauma * this.cameraTrauma;
    const shakeX = Math.sin(tSec * 52) * shake * 0.42;
    const shakeY = Math.cos(tSec * 61) * shake * 0.36;

    this.camera.lookAt(this.playerX * 0.95 + shakeX, this.playerY * 0.35 + shakeY, -24);
  }

  private emitTrail(x: number, y: number, z: number, colorHex: number): void {
    const slot = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
    slot.active = true;
    slot.x = x + (Math.random() - 0.5) * 0.12;
    slot.y = y + (Math.random() - 0.5) * 0.12;
    slot.z = z;
    slot.vx = (Math.random() - 0.5) * 0.8;
    slot.vy = (Math.random() - 0.5) * 0.8;
    slot.vz = 14 + Math.random() * 6;
    slot.maxLife = 0.22;
    slot.life = 0.22;
    slot.size = 0.45;
    slot.color.setHex(colorHex);
  }

  private emitBurst(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    count: number,
    speed: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const spd = speed * (0.4 + Math.random() * 0.85);

      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = Math.sin(phi) * Math.cos(theta) * spd;
      slot.vy = Math.sin(phi) * Math.sin(theta) * spd;
      slot.vz = Math.cos(phi) * spd;
      slot.maxLife = 0.3 + Math.random() * 0.38;
      slot.life = slot.maxLife;
      slot.size = 0.75 + Math.random() * 1.15;
      slot.color.setHex(colorHex);
    }
  }

  private updateParticles(dt: number): void {
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _scratchObj.position.set(0, -999, 0);
        _scratchObj.scale.setScalar(0);
        _scratchObj.updateMatrix();
        this.particleMesh.setMatrixAt(i, _scratchObj.matrix);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const scale = (p.life / p.maxLife) * p.size;
      _scratchObj.position.set(p.x, p.y, p.z);
      _scratchObj.rotation.set(p.life * 6, p.life * 4, 0);
      _scratchObj.scale.setScalar(scale);
      _scratchObj.updateMatrix();
      this.particleMesh.setMatrixAt(i, _scratchObj.matrix);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (dirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private pushHud(force: boolean, nowMs = performance.now()): void {
    if (!force && nowMs - this.lastHudPush < 95) return;
    this.lastHudPush = nowMs;

    const datasetState = this.phase === 'victory' ? 'gameover' : this.phase;
    document.body.dataset.state = datasetState;
    document.body.dataset.outcome = this.phase;
    document.body.dataset.score = String(Math.round(this.score));
    document.body.dataset.hull = String(this.hull);
    document.body.dataset.level = String(this.level);
    document.body.dataset.lasersFired = String(this.lasersFired);
    document.body.dataset.aliensDefeated = String(this.aliensDefeated);
    document.body.dataset.shotsIntercepted = String(this.shotsIntercepted);
    document.body.dataset.powerupActive = this.powerUpRemaining > 0 ? 'true' : 'false';

    this.onHudUpdate({
      phase: this.phase,
      score: Math.round(this.score),
      bestScore: Math.round(this.bestScore),
      hull: this.hull,
      maxHull: GAME_CONSTANTS.maxHull,
      level: this.level,
      maxLevels: GAME_CONSTANTS.maxLevels,
      levelProgress: this.levelProgress,
      nextLevelSeconds: this.nextLevelSeconds,
      levelBanner: this.levelBanner,
      powerUpRemaining: this.powerUpRemaining,
      powerUpDuration: GAME_CONSTANTS.powerUpDuration,
      combo: this.combo,
      aliensDefeated: this.aliensDefeated,
      starsDodged: this.starsDodged,
      shotsIntercepted: this.shotsIntercepted,
      lasersFired: this.lasersFired,
      muted: this.audio.isMuted(),
      damageFlash: this.damageFlash,
    });
  }

  public dispose(): void {
    this.disposed = true;
    if (this.isTimeoutFrame) {
      clearTimeout(this.frameId);
    } else {
      cancelAnimationFrame(this.frameId);
    }
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    this.clearDynamicEntities();
    this.models.dispose();
    this.normalBoltGeo.dispose();
    this.normalBoltCoreMat.dispose();
    this.normalBoltSheathMat.dispose();
    this.megaBoltGeo.dispose();
    this.megaBoltCoreMat.dispose();
    this.megaBoltSheathMat.dispose();
    this.starfieldMesh.geometry.dispose();
    (this.starfieldMesh.material as THREE.Material).dispose();
    for (const neb of this.nebulaSprites) {
      neb.mesh.material.dispose();
      this.scene.remove(neb.mesh);
    }
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
