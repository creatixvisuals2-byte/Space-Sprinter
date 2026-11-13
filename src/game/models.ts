import * as THREE from 'three';
import { AlienType } from './types';

export interface AlienFragment {
  mesh: THREE.Object3D;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
}

export interface ModelLibrary {
  dispose: () => void;
  nebulaTexture: THREE.CanvasTexture;
  createPlayerShip: () => {
    group: THREE.Group;
    thrusters: THREE.Mesh[];
    cannonTips: THREE.Mesh[];
    overchargeAura: THREE.Group;
    shieldRing: THREE.Mesh;
  };
  createHazardStar: (scale?: number) => {
    group: THREE.Group;
    corona: THREE.Mesh;
    spikesA: THREE.Mesh;
    spikesB: THREE.Mesh;
  };
  createAlien: (type: AlienType, scale?: number) => {
    group: THREE.Group;
    flashMaterials: THREE.MeshStandardMaterial[];
    telegraphCore: THREE.Mesh;
    telegraphRing: THREE.Mesh;
    fragments: AlienFragment[];
    spinner?: THREE.Object3D;
  };
  createAlienPlasmaBolt: (heavy: boolean) => {
    group: THREE.Group;
    ring: THREE.Mesh;
  };
  createShockwaveRing: (colorHex: number) => THREE.Mesh;
  createPowerUp: () => {
    group: THREE.Group;
    core: THREE.Mesh;
    ringA: THREE.Mesh;
    ringB: THREE.Mesh;
  };
}

function createHullPanelTexture(): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 256;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const cCtx = cCanvas.getContext('2d')!;

  cCtx.fillStyle = '#e2ecfa';
  cCtx.fillRect(0, 0, size, size);

  cCtx.strokeStyle = '#92a8c4';
  cCtx.lineWidth = 3;
  for (let y = 0; y < size; y += 64) {
    cCtx.beginPath();
    cCtx.moveTo(0, y);
    cCtx.lineTo(size, y);
    cCtx.stroke();
  }
  for (let x = 0; x < size; x += 64) {
    cCtx.beginPath();
    cCtx.moveTo(x, 0);
    cCtx.lineTo(x, size);
    cCtx.stroke();
  }

  cCtx.fillStyle = '#c8d8ee';
  cCtx.fillRect(8, 8, 48, 48);
  cCtx.fillRect(136, 72, 48, 48);
  cCtx.fillStyle = '#f1f7ff';
  cCtx.fillRect(72, 136, 48, 48);

  const colorMap = new THREE.CanvasTexture(cCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bCtx = bCanvas.getContext('2d')!;
  bCtx.fillStyle = '#909090';
  bCtx.fillRect(0, 0, size, size);
  bCtx.strokeStyle = '#303030';
  bCtx.lineWidth = 4;
  for (let i = 0; i < size; i += 64) {
    bCtx.strokeRect(i + 2, 2, 60, 60);
    bCtx.strokeRect(i + 2, 66, 60, 60);
    bCtx.strokeRect(i + 2, 130, 60, 60);
    bCtx.strokeRect(i + 2, 194, 60, 60);
  }

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  const roughnessMap = new THREE.CanvasTexture(bCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;

  return { colorMap, bumpMap, roughnessMap };
}

function createStarSurfaceTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff9a2e';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 150; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 6 + Math.random() * 22;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    if (i % 3 === 0) {
      g.addColorStop(0, 'rgba(255, 250, 215, 0.92)');
      g.addColorStop(1, 'rgba(255, 160, 30, 0)');
    } else {
      g.addColorStop(0, 'rgba(255, 78, 12, 0.7)');
      g.addColorStop(1, 'rgba(255, 130, 20, 0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createRadialGlowTexture(innerHex: string, midHex: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerHex);
  grad.addColorStop(0.35, midHex);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createNebulaCloudTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const puffs = [
    { x: 128, y: 128, r: 112, c0: 'rgba(56, 189, 248, 0.22)', c1: 'rgba(30, 58, 138, 0.08)' },
    { x: 96, y: 110, r: 85, c0: 'rgba(139, 92, 246, 0.2)', c1: 'rgba(76, 29, 149, 0.06)' },
    { x: 162, y: 142, r: 78, c0: 'rgba(236, 72, 153, 0.14)', c1: 'rgba(88, 28, 135, 0.04)' },
  ];
  for (const p of puffs) {
    const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.r);
    grad.addColorStop(0, p.c0);
    grad.addColorStop(0.55, p.c1);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createModelLibrary(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
): ModelLibrary {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const hullMaps = createHullPanelTexture();
  hullMaps.colorMap.anisotropy = maxAniso;
  hullMaps.bumpMap.anisotropy = maxAniso;
  hullMaps.roughnessMap.anisotropy = maxAniso;
  track(hullMaps.colorMap);
  track(hullMaps.bumpMap);
  track(hullMaps.roughnessMap);

  const starTex = track(createStarSurfaceTexture());
  starTex.anisotropy = maxAniso;

  const starHaloTex = track(createRadialGlowTexture('rgba(255,252,225,1)', 'rgba(255,158,36,0.55)'));
  const nebulaTexture = track(createNebulaCloudTexture());

  // Shared Player Ship Geometries & Materials
  const fuselageShape = new THREE.Shape();
  fuselageShape.moveTo(0, 1.55);
  fuselageShape.lineTo(0.42, 0.35);
  fuselageShape.lineTo(0.48, -1.05);
  fuselageShape.lineTo(0.24, -1.25);
  fuselageShape.lineTo(-0.24, -1.25);
  fuselageShape.lineTo(-0.48, -1.05);
  fuselageShape.lineTo(-0.42, 0.35);
  fuselageShape.closePath();

  const fuselageGeo = track(
    new THREE.ExtrudeGeometry(fuselageShape, {
      depth: 0.36,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.08,
      bevelSegments: 2,
    }),
  );
  fuselageGeo.center();
  fuselageGeo.rotateX(Math.PI / 2);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.32, 0.25);
  wingShape.lineTo(1.72, -0.58);
  wingShape.lineTo(1.58, -1.02);
  wingShape.lineTo(0.38, -0.78);
  wingShape.closePath();

  const rightWingGeo = track(
    new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.09,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
    }),
  );
  rightWingGeo.rotateX(-Math.PI / 2);

  const leftWingGeo = track(rightWingGeo.clone());
  leftWingGeo.scale(-1, 1, 1);

  const canopyGeo = track(new THREE.CapsuleGeometry(0.22, 0.65, 6, 12));
  canopyGeo.rotateX(Math.PI / 2);

  const nacellePoints = [
    new THREE.Vector2(0.01, -0.55),
    new THREE.Vector2(0.18, -0.45),
    new THREE.Vector2(0.21, 0.25),
    new THREE.Vector2(0.15, 0.55),
    new THREE.Vector2(0.01, 0.6),
  ];
  const nacelleGeo = track(new THREE.LatheGeometry(nacellePoints, 16));
  nacelleGeo.rotateX(Math.PI / 2);

  const dorsalFinShape = new THREE.Shape();
  dorsalFinShape.moveTo(0, 0);
  dorsalFinShape.lineTo(-0.65, 0);
  dorsalFinShape.lineTo(-0.85, 0.52);
  dorsalFinShape.lineTo(-0.35, 0.52);
  dorsalFinShape.closePath();
  const dorsalFinGeo = track(
    new THREE.ExtrudeGeometry(dorsalFinShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
    }),
  );
  dorsalFinGeo.center();
  dorsalFinGeo.rotateY(Math.PI / 2);

  const noseConeGeo = track(new THREE.ConeGeometry(0.32, 1.05, 12));
  noseConeGeo.rotateX(-Math.PI / 2);

  const cannonGeo = track(new THREE.CylinderGeometry(0.06, 0.085, 0.95, 10));
  cannonGeo.rotateX(Math.PI / 2);
  const cannonTipGeo = track(new THREE.SphereGeometry(0.09, 10, 10));
  const thrusterCoreGeo = track(new THREE.ConeGeometry(0.15, 0.65, 12));
  thrusterCoreGeo.rotateX(Math.PI / 2);

  const auraRingGeo = track(new THREE.TorusGeometry(1.55, 0.045, 8, 36));
  const shieldRingGeo = track(new THREE.TorusGeometry(1.38, 0.035, 8, 36));

  const hullMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: hullMaps.colorMap,
      bumpMap: hullMaps.bumpMap,
      bumpScale: 0.035,
      roughnessMap: hullMaps.roughnessMap,
      roughness: 0.36,
      metalness: 0.64,
    }),
  );
  const wingTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.28,
      metalness: 0.72,
    }),
  );
  const darkMetalMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1b2538,
      roughness: 0.64,
      metalness: 0.5,
    }),
  );
  const canopyMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x79e2ff,
      metalness: 0.1,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transmission: isSoftwareGl ? 0 : 0.65,
      transparent: true,
      opacity: isSoftwareGl ? 0.74 : 1.0,
      ior: 1.52,
    }),
  );
  const thrusterMat = track(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  const cannonTipMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.9,
      roughness: 0.22,
      metalness: 0.3,
    }),
  );

  // Hazard Star Geometries & Materials
  const starCoreGeo = track(new THREE.IcosahedronGeometry(0.68, 2));
  const starSpikeGeo = track(new THREE.OctahedronGeometry(0.95, 0));
  const starCoronaGeo = track(new THREE.PlaneGeometry(3.4, 3.4));

  const starCoreMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: starTex,
      emissive: 0xff8a1f,
      emissiveMap: starTex,
      emissiveIntensity: 2.3,
      roughness: 0.4,
      metalness: 0.0,
    }),
  );
  const starSpikeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffdf85,
      emissive: 0xffa62b,
      emissiveIntensity: 1.7,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    }),
  );
  const starCoronaMat = track(
    new THREE.MeshBasicMaterial({
      map: starHaloTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );

  // Alien Shared Geometries
  const swarmerBodyGeo = track(new THREE.ConeGeometry(0.45, 1.85, 5));
  swarmerBodyGeo.rotateX(Math.PI / 2);
  const swarmerWingGeo = track(new THREE.BoxGeometry(1.9, 0.08, 0.55));
  const swarmerEyeGeo = track(new THREE.SphereGeometry(0.22, 12, 12));
  const swarmerPodGeo = track(new THREE.CylinderGeometry(0.08, 0.1, 0.72, 8));
  swarmerPodGeo.rotateX(Math.PI / 2);

  const strikerSaucerGeo = track(new THREE.CylinderGeometry(1.18, 0.96, 0.28, 18));
  const strikerDomeGeo = track(new THREE.SphereGeometry(0.56, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2));
  const strikerNodeGeo = track(new THREE.OctahedronGeometry(0.24, 0));

  const dreadHullGeo = track(new THREE.BoxGeometry(1.55, 0.72, 2.2));
  const dreadMandibleGeo = track(new THREE.BoxGeometry(0.36, 0.42, 1.45));
  const dreadShieldGeo = track(new THREE.CylinderGeometry(1.05, 1.15, 0.22, 8));
  const dreadCoreGeo = track(new THREE.SphereGeometry(0.42, 14, 14));

  const telegraphRingGeo = track(new THREE.TorusGeometry(0.75, 0.06, 8, 24));
  const shockwaveGeo = track(new THREE.TorusGeometry(0.95, 0.08, 8, 28));

  // Alien Plasma Bolt Geometries & Materials
  const alienLanceGeo = track(new THREE.ConeGeometry(0.22, 2.1, 8));
  alienLanceGeo.rotateX(Math.PI / 2);
  const alienBoltRingGeo = track(new THREE.TorusGeometry(0.36, 0.065, 6, 16));
  const alienBoltLightMat = track(new THREE.MeshBasicMaterial({ color: 0xffe4e6 }));
  const alienBoltOuterMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const alienBoltHeavyMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xd946ef,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  // PowerUp Shared Geometries & Materials
  const powerCoreGeo = track(new THREE.OctahedronGeometry(0.58, 0));
  const powerRingAGeo = track(new THREE.TorusGeometry(0.92, 0.065, 8, 28));
  const powerRingBGeo = track(new THREE.TorusGeometry(1.14, 0.05, 8, 28));
  const powerCoreMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffe875,
      emissive: 0xff9f1c,
      emissiveIntensity: 2.2,
      roughness: 0.15,
      metalness: 0.4,
    }),
  );
  const powerRingMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xfbbf24,
      emissiveIntensity: 1.3,
      roughness: 0.25,
      metalness: 0.85,
    }),
  );

  return {
    nebulaTexture,
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    },

    createPlayerShip: () => {
      const group = new THREE.Group();

      const fuselage = new THREE.Mesh(fuselageGeo, hullMat);
      fuselage.castShadow = !isSoftwareGl;
      fuselage.receiveShadow = !isSoftwareGl;
      group.add(fuselage);

      const rightWing = new THREE.Mesh(rightWingGeo, wingTrimMat);
      rightWing.position.set(0, -0.05, 0);
      rightWing.castShadow = !isSoftwareGl;
      group.add(rightWing);

      const leftWing = new THREE.Mesh(leftWingGeo, wingTrimMat);
      leftWing.position.set(0, -0.05, 0);
      leftWing.castShadow = !isSoftwareGl;
      group.add(leftWing);

      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.set(0, 0.24, -0.15);
      canopy.scale.set(1, 0.72, 1);
      group.add(canopy);

      const dorsal = new THREE.Mesh(dorsalFinGeo, wingTrimMat);
      dorsal.position.set(0, 0.34, 0.45);
      group.add(dorsal);

      const noseCone = new THREE.Mesh(noseConeGeo, wingTrimMat);
      noseCone.position.set(0, 0.0, -1.55);
      group.add(noseCone);

      const thrusters: THREE.Mesh[] = [];
      [-0.58, 0.58].forEach((x) => {
        const nac = new THREE.Mesh(nacelleGeo, darkMetalMat);
        nac.position.set(x, -0.02, 0.65);
        group.add(nac);

        const plume = new THREE.Mesh(thrusterCoreGeo, thrusterMat);
        plume.position.set(x, -0.02, 1.38);
        group.add(plume);
        thrusters.push(plume);
      });

      const cannonTips: THREE.Mesh[] = [];
      [-1.56, 1.56].forEach((x) => {
        const barrel = new THREE.Mesh(cannonGeo, darkMetalMat);
        barrel.position.set(x, -0.06, 0.28);
        group.add(barrel);

        const tip = new THREE.Mesh(cannonTipGeo, cannonTipMat.clone());
        track(tip.material as THREE.Material);
        tip.position.set(x, -0.06, -0.22);
        group.add(tip);
        cannonTips.push(tip);
      });

      const overchargeAura = new THREE.Group();
      const auraMat = track(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const auraRing = new THREE.Mesh(auraRingGeo, auraMat);
      auraRing.rotation.x = Math.PI / 2;
      overchargeAura.add(auraRing);
      overchargeAura.visible = false;
      group.add(overchargeAura);

      const shieldMat = track(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const shieldRing = new THREE.Mesh(shieldRingGeo, shieldMat);
      shieldRing.rotation.x = Math.PI / 2;
      group.add(shieldRing);

      return { group, thrusters, cannonTips, overchargeAura, shieldRing };
    },

    createHazardStar: (scale = 1) => {
      const group = new THREE.Group();

      const core = new THREE.Mesh(starCoreGeo, starCoreMat);
      group.add(core);

      const spikesA = new THREE.Mesh(starSpikeGeo, starSpikeMat);
      spikesA.scale.set(0.75, 1.15, 0.75);
      group.add(spikesA);

      const spikesB = new THREE.Mesh(starSpikeGeo, starSpikeMat);
      spikesB.rotation.set(Math.PI / 4, Math.PI / 4, Math.PI / 4);
      spikesB.scale.set(1.05, 0.72, 1.05);
      group.add(spikesB);

      const corona = new THREE.Mesh(starCoronaGeo, starCoronaMat);
      group.add(corona);

      group.scale.setScalar(scale);
      return { group, corona, spikesA, spikesB };
    },

    createAlien: (type: AlienType, scale = 1.2) => {
      const group = new THREE.Group();
      const flashMaterials: THREE.MeshStandardMaterial[] = [];
      const fragments: AlienFragment[] = [];

      const regMat = (mat: THREE.MeshStandardMaterial) => {
        track(mat);
        flashMaterials.push(mat);
        return mat;
      };

      const addFrag = (mesh: THREE.Object3D, vx: number, vy: number, vz: number) => {
        fragments.push({
          mesh,
          vx,
          vy,
          vz,
          rx: (Math.random() - 0.5) * 14,
          ry: (Math.random() - 0.5) * 14,
        });
      };

      const telegraphRingMat = track(
        new THREE.MeshBasicMaterial({
          color: type === 'dreadnought' ? 0xf97316 : type === 'striker' ? 0xe879f9 : 0xf43f5e,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const telegraphRing = new THREE.Mesh(telegraphRingGeo, telegraphRingMat);
      telegraphRing.position.set(0, 0, 0.95);
      group.add(telegraphRing);

      if (type === 'swarmer') {
        const hull = regMat(
          new THREE.MeshStandardMaterial({
            color: 0xe11d48,
            roughness: 0.34,
            metalness: 0.62,
          }),
        );
        const trim = regMat(
          new THREE.MeshStandardMaterial({
            color: 0x1e1b2e,
            roughness: 0.6,
            metalness: 0.48,
          }),
        );
        const eyeMat = regMat(
          new THREE.MeshStandardMaterial({
            color: 0xff6b8b,
            emissive: 0xff2a5f,
            emissiveIntensity: 2.1,
            roughness: 0.2,
          }),
        );

        const body = new THREE.Mesh(swarmerBodyGeo, hull);
        group.add(body);
        addFrag(body, 0, 1.5, -2.5);

        const wings = new THREE.Mesh(swarmerWingGeo, trim);
        wings.rotation.z = 0.16;
        wings.position.set(0, 0, -0.15);
        group.add(wings);
        addFrag(wings, -5.5, 3.2, 1.2);

        const wings2 = new THREE.Mesh(swarmerWingGeo, trim);
        wings2.rotation.z = -0.16;
        wings2.position.set(0, 0, -0.15);
        group.add(wings2);
        addFrag(wings2, 5.5, -2.4, 1.2);

        [-0.78, 0.78].forEach((px) => {
          const pod = new THREE.Mesh(swarmerPodGeo, eyeMat);
          pod.position.set(px, -0.12, 0.28);
          group.add(pod);
          addFrag(pod, px * 5, -3.5, 2.5);
        });

        const eye = new THREE.Mesh(swarmerEyeGeo, eyeMat);
        eye.position.set(0, 0.16, 0.42);
        group.add(eye);
        addFrag(eye, 0, 4.5, 3.0);

        group.scale.setScalar(scale);
        return { group, flashMaterials, telegraphCore: eye, telegraphRing, fragments };
      }

      if (type === 'striker') {
        const hull = regMat(
          new THREE.MeshStandardMaterial({
            color: 0x14b8a6,
            roughness: 0.28,
            metalness: 0.72,
          }),
        );
        const domeMat = regMat(
          new THREE.MeshStandardMaterial({
            color: 0x6d28d9,
            roughness: 0.18,
            metalness: 0.3,
          }),
        );
        const nodeMat = regMat(
          new THREE.MeshStandardMaterial({
            color: 0xf472b6,
            emissive: 0xe879f9,
            emissiveIntensity: 2.0,
            roughness: 0.2,
          }),
        );

        const saucer = new THREE.Mesh(strikerSaucerGeo, hull);
        group.add(saucer);
        addFrag(saucer, -3.8, -1.8, -2.0);

        const dome = new THREE.Mesh(strikerDomeGeo, domeMat);
        dome.position.y = 0.1;
        group.add(dome);
        addFrag(dome, 0, 6.2, 0.5);

        const spinner = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI * 2;
          const node = new THREE.Mesh(strikerNodeGeo, nodeMat);
          node.position.set(Math.cos(angle) * 1.2, 0, Math.sin(angle) * 1.2);
          spinner.add(node);
        }
        group.add(spinner);
        addFrag(spinner, 4.5, 2.2, 2.0);

        const emitter = new THREE.Mesh(swarmerEyeGeo, nodeMat);
        emitter.position.set(0, -0.22, 0.65);
        group.add(emitter);
        addFrag(emitter, 0, -4.5, 4.5);

        group.scale.setScalar(scale);
        return { group, flashMaterials, telegraphCore: emitter, telegraphRing, fragments, spinner };
      }

      // Dreadnought
      const armor = regMat(
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          roughness: 0.45,
          metalness: 0.65,
        }),
      );
      const darkArmor = regMat(
        new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.72,
          metalness: 0.48,
        }),
      );
      const coreMat = regMat(
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xf97316,
          emissiveIntensity: 2.2,
          roughness: 0.2,
        }),
      );

      const hull = new THREE.Mesh(dreadHullGeo, darkArmor);
      group.add(hull);
      addFrag(hull, 0, -1.5, -2.5);

      const leftMandible = new THREE.Mesh(dreadMandibleGeo, armor);
      leftMandible.position.set(-0.92, -0.05, 0.78);
      group.add(leftMandible);
      addFrag(leftMandible, -6.5, 2.0, 3.0);

      const rightMandible = new THREE.Mesh(dreadMandibleGeo, armor);
      rightMandible.position.set(0.92, -0.05, 0.78);
      group.add(rightMandible);
      addFrag(rightMandible, 6.5, 2.0, 3.0);

      const shieldPlate = new THREE.Mesh(dreadShieldGeo, armor);
      shieldPlate.position.set(0, 0.45, -0.15);
      group.add(shieldPlate);
      addFrag(shieldPlate, 0, 6.8, -1.5);

      const core = new THREE.Mesh(dreadCoreGeo, coreMat);
      core.position.set(0, 0, 0.92);
      group.add(core);
      addFrag(core, 0, -4.0, 5.5);

      group.scale.setScalar(scale);
      return { group, flashMaterials, telegraphCore: core, telegraphRing, fragments };
    },

    createAlienPlasmaBolt: (heavy: boolean) => {
      const group = new THREE.Group();
      const lance = new THREE.Mesh(alienLanceGeo, alienBoltLightMat);
      group.add(lance);

      const sheath = new THREE.Mesh(
        alienLanceGeo,
        heavy ? alienBoltHeavyMat : alienBoltOuterMat,
      );
      sheath.scale.set(1.85, 1.85, 1.22);
      group.add(sheath);

      const ring = new THREE.Mesh(
        alienBoltRingGeo,
        heavy ? alienBoltHeavyMat : alienBoltOuterMat,
      );
      ring.position.z = -0.3;
      group.add(ring);

      if (heavy) {
        group.scale.setScalar(1.38);
      }
      return { group, ring };
    },

    createShockwaveRing: (colorHex: number) => {
      const mat = track(
        new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      return new THREE.Mesh(shockwaveGeo, mat);
    },

    createPowerUp: () => {
      const group = new THREE.Group();

      const core = new THREE.Mesh(powerCoreGeo, powerCoreMat);
      group.add(core);

      const ringA = new THREE.Mesh(powerRingAGeo, powerRingMat);
      ringA.rotation.x = Math.PI / 3;
      group.add(ringA);

      const ringB = new THREE.Mesh(powerRingBGeo, powerRingMat);
      ringB.rotation.y = Math.PI / 3;
      group.add(ringB);

      const halo = new THREE.Mesh(starCoronaGeo, starCoronaMat);
      halo.scale.setScalar(0.85);
      group.add(halo);

      return { group, core, ringA, ringB };
    },
  };
}
