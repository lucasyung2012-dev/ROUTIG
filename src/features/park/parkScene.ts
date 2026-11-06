/**
 * Cena 3D do parque (V2, Etapa 0 — prova técnica).
 * Tudo é gerado em código a partir de um kit pequeno de peças (sem arquivos de modelo),
 * com materiais compartilhados e árvores em instâncias, para ficar leve no iPad.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LAKE, PARK_BUILDINGS, PARK_RADIUS, PLAZA_RADIUS, REGION_HUB, treePositions, type ParkBuilding } from '@/domain/park';
import type { ModuleId } from '@/app/modules';

export type ParkQuality = 'low' | 'medium' | 'high';

export interface ParkStats {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
}

export interface ParkController {
  setQuality: (q: ParkQuality) => void;
  setNight: (night: boolean) => void;
  flyTo: (id: ModuleId | 'plaza') => void;
  /** Posição de cada prédio na tela (para os rótulos em HTML). */
  project: () => Array<{ id: ModuleId; x: number; y: number; visible: boolean }>;
  dispose: () => void;
}

const QUALITY = {
  low: { pixelRatio: 1, shadows: false, trees: 90, fpsCap: 30 },
  medium: { pixelRatio: 1.5, shadows: false, trees: 180, fpsCap: 60 },
  high: { pixelRatio: 2, shadows: true, trees: 260, fpsCap: 60 },
} as const;

const MAX_TREES = QUALITY.high.trees;

/* ---------- Kit de peças ---------- */

const mats = new Map<string, THREE.Material>();
function mat(color: string, opts: { glass?: boolean; emissive?: boolean } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.glass ? 'g' : ''}${opts.emissive ? 'e' : ''}`;
  let m = mats.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.glass ? 0.15 : 0.7,
      metalness: opts.glass ? 0.4 : 0.05,
      transparent: !!opts.glass,
      opacity: opts.glass ? 0.55 : 1,
      emissive: opts.emissive ? new THREE.Color(color) : new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    mats.set(key, m);
  }
  return m;
}

const geos = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

const box = (w: number, h: number, d: number) => geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt: number, rb: number, h: number, seg = 16) => geo(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const WHITE = '#E8EDF5';
const GLASS = '#9ED8F0';
const DARK = '#334155';

/** Monta um prédio pela forma. Alturas em metros de cena; base em y = 0. */
function building(b: ParkBuilding): THREE.Group {
  const g = new THREE.Group();
  const c = b.color;
  const add = (...m: THREE.Object3D[]) => m.forEach((x) => g.add(x));
  switch (b.shape) {
    case 'reception':
      add(mesh(cyl(4.5, 5, 1, 24), mat(WHITE), 0, 0.5, 0), mesh(cyl(3.6, 3.6, 5, 24), mat(GLASS, { glass: true, emissive: true }), 0, 3.5, 0), mesh(cyl(4.4, 4.4, 0.5, 24), mat(c), 0, 6.2, 0), mesh(cyl(0.3, 0.3, 3, 8), mat(c), 0, 8, 0));
      break;
    case 'tower':
      add(mesh(box(6, 2, 6), mat(WHITE), 0, 1, 0), mesh(box(4.5, 12, 4.5), mat(GLASS, { glass: true, emissive: true }), 0, 8, 0), mesh(box(4.8, 0.6, 4.8), mat(c), 0, 14.3, 0));
      break;
    case 'house':
      add(mesh(box(6, 4, 5), mat(WHITE), 0, 2, 0));
      {
        const roof = mesh(cyl(0, 4.2, 3, 4), mat(c), 0, 5.5, 0);
        roof.rotation.y = Math.PI / 4;
        add(roof);
      }
      break;
    case 'gear':
      add(mesh(cyl(3.5, 3.5, 5, 12), mat(DARK), 0, 2.5, 0), mesh(cyl(2.2, 2.2, 6.5, 12), mat(c), 0, 3.25, 0));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(mesh(box(1, 4, 1), mat(DARK), Math.cos(a) * 3.8, 2, Math.sin(a) * 3.8));
      }
      break;
    case 'campus':
      add(mesh(box(12, 4, 7), mat(WHITE), 0, 2, 0), mesh(box(4, 8, 4), mat(GLASS, { glass: true, emissive: true }), -3, 6, 0), mesh(box(3, 6, 3), mat(c), 4, 5, 0), mesh(cyl(0, 1.2, 4, 6), mat(c), -3, 12, 0));
      break;
    case 'pagoda':
      for (let i = 0; i < 4; i++) {
        const w = 8 - i * 1.6;
        add(mesh(box(w, 1.6, w), mat(i % 2 ? c : WHITE), 0, 0.8 + i * 2, 0), mesh(box(w + 1.2, 0.3, w + 1.2), mat(c), 0, 1.7 + i * 2, 0));
      }
      break;
    case 'library':
      add(mesh(box(11, 1, 8), mat(WHITE), 0, 0.5, 0), mesh(box(9, 5, 6), mat(GLASS, { glass: true, emissive: true }), 0, 3.5, 0), mesh(box(11, 1, 8), mat(c), 0, 6.5, 0));
      for (let i = -2; i <= 2; i++) add(mesh(cyl(0.35, 0.35, 5, 8), mat(WHITE), i * 2.2, 3.5, 3.6));
      break;
    case 'stack':
      for (let i = 0; i < 5; i++) {
        const p = mesh(box(6, 1.6, 4.5), mat(i % 2 ? c : WHITE), 0, 0.8 + i * 1.7, 0);
        p.rotation.y = i * 0.18;
        add(p);
      }
      break;
    case 'observatory':
      add(mesh(cyl(3.5, 4, 6, 20), mat(WHITE), 0, 3, 0));
      {
        const dome = mesh(geo('dome', () => new THREE.SphereGeometry(3.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), mat(c), 0, 6, 0);
        add(dome, mesh(box(0.8, 0.8, 5), mat(DARK), 0, 8.5, 1));
      }
      break;
    case 'cubes':
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) add(mesh(box(2.4, 2 + ((i + j) % 3) * 2, 2.4), mat((i + j) % 2 ? c : WHITE), (i - 1) * 2.8, 1 + ((i + j) % 3), (j - 1) * 2.8));
      break;
    case 'slab':
      add(mesh(box(8, 13, 3), mat(GLASS, { glass: true, emissive: true }), 0, 6.5, 0));
      for (let i = 0; i < 4; i++) add(mesh(box(8.2, 0.3, 3.2), mat(c), 0, 3 + i * 3, 0));
      break;
    case 'twist':
      for (let i = 0; i < 6; i++) {
        const p = mesh(box(4.5, 2, 4.5), mat(i % 2 ? GLASS : c, { glass: i % 2 === 1, emissive: i % 2 === 1 }), 0, 1 + i * 2.05, 0);
        p.rotation.y = i * 0.3;
        add(p);
      }
      break;
    case 'hexTower':
      add(mesh(cyl(3.2, 3.6, 2, 6), mat(WHITE), 0, 1, 0), mesh(cyl(2.6, 2.9, 11, 6), mat(c), 0, 7.5, 0), mesh(cyl(2.8, 2.8, 0.5, 6), mat(GLASS, { glass: true, emissive: true }), 0, 13.2, 0));
      break;
    case 'pavilion':
      add(mesh(cyl(4.5, 4.5, 0.6, 24), mat(WHITE), 0, 0.3, 0), mesh(cyl(0, 5.5, 3, 24), mat(c), 0, 4.6, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(mesh(cyl(0.25, 0.25, 2.8, 8), mat(WHITE), Math.cos(a) * 3.8, 1.9, Math.sin(a) * 3.8));
      }
      break;
    case 'greenhouse':
      add(mesh(box(10, 0.6, 7), mat(WHITE), 0, 0.3, 0), mesh(box(9, 4, 6), mat(GLASS, { glass: true, emissive: true }), 0, 2.6, 0));
      {
        const arch = mesh(geo('arch', () => new THREE.CylinderGeometry(3, 3, 9, 16, 1, false, 0, Math.PI)), mat(GLASS, { glass: true, emissive: true }), 0, 4.6, 0);
        arch.rotation.z = Math.PI / 2;
        arch.rotation.y = Math.PI / 2;
        add(arch, mesh(box(9.2, 0.25, 0.25), mat(c), 0, 7.6, 0));
      }
      break;
    case 'terraces':
      for (let i = 0; i < 4; i++) add(mesh(box(9 - i * 2, 1.4, 9 - i * 2), mat(i === 3 ? c : WHITE), 0, 0.7 + i * 1.4, 0));
      add(mesh(cyl(0.15, 0.15, 3, 6), mat(DARK), 0, 7, 0), mesh(box(1.4, 0.8, 0.05), mat(c), 0.7, 8, 0));
      break;
    case 'amphitheater': {
      for (let i = 0; i < 4; i++) {
        const ring = mesh(geo(`amph${i}`, () => new THREE.CylinderGeometry(6.5 - i * 0.2 + i, 6.5 - i * 0.2 + i, 0.6, 24, 1, true, 0, Math.PI)), mat(i % 2 ? c : WHITE), 0, 0.3 + i * 0.6, 0);
        (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        add(ring);
      }
      const shell = mesh(geo('shell', () => new THREE.SphereGeometry(4, 16, 8, 0, Math.PI, 0, Math.PI / 2)), mat(c), 0, 0, -1);
      shell.rotation.y = Math.PI;
      add(shell);
      break;
    }
    case 'stadium':
      add(mesh(geo('stadium', () => new THREE.TorusGeometry(6.5, 1.4, 8, 28)), mat(WHITE), 0, 1.2, 0), mesh(cyl(5.4, 5.4, 0.2, 28), mat('#4ADE80'), 0, 0.1, 0), mesh(box(0.2, 0.25, 6), mat(c), 0, 0.3, 0));
      g.children[0]!.rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        add(mesh(cyl(0.2, 0.2, 9, 6), mat(DARK), Math.cos(a) * 8.5, 4.5, Math.sin(a) * 8.5));
      }
      break;
  }
  g.position.set(b.x, 0, b.z);
  // Fachada virada para o centro do parque.
  g.rotation.y = Math.atan2(-b.x, -b.z);
  g.userData.id = b.id;
  g.traverse((o) => (o.userData.id = b.id));
  return g;
}

/* ---------- Cena ---------- */

export function createPark(canvas: HTMLCanvasElement, opts: { quality: ParkQuality; reduceMotion: boolean; onStats: (s: ParkStats) => void; onSelect: (id: ModuleId | null) => void }): ParkController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const dayColor = new THREE.Color('#BFE3F5');
  const nightColor = new THREE.Color('#0B1026');
  scene.background = dayColor.clone();
  scene.fog = new THREE.Fog(dayColor.clone(), 110, 220);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
  camera.position.set(0, 62, 82);

  const hemi = new THREE.HemisphereLight('#ffffff', '#5B7A4A', 1.1);
  const sun = new THREE.DirectionalLight('#FFF4E0', 1.6);
  sun.position.set(40, 70, 30);
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 200 });
  scene.add(hemi, sun);

  // Chão, praça, caminhos e lago.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(PARK_RADIUS + 6, 64), mat('#7FB069'));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_RADIUS, 48), mat('#E5E0D5'));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.03;
  plaza.receiveShadow = true;
  scene.add(plaza);
  const pathMat = mat('#D9D2C3');
  const addPath = (a: { x: number; z: number }, b: { x: number; z: number }, w = 3) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, len), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = Math.atan2(b.x - a.x, b.z - a.z);
    p.position.set((a.x + b.x) / 2, 0.02, (a.z + b.z) / 2);
    p.receiveShadow = true;
    scene.add(p);
  };
  for (const r of ['north', 'east', 'south', 'west'] as const) addPath(REGION_HUB.central, REGION_HUB[r], 4);
  for (const b of PARK_BUILDINGS) addPath(REGION_HUB[b.region], b, 2.2);

  const lakeMat = new THREE.MeshStandardMaterial({ color: '#3BA3D9', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.9 });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.radius, 40), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(LAKE.x, 0.05, LAKE.z);
  scene.add(lake);

  // Fonte ROUTIG na praça: bacia, coluna e jatos animados.
  const fountain = new THREE.Group();
  fountain.add(mesh(cyl(3.2, 3.4, 0.8, 32), mat(WHITE), 0, 0.4, 0), mesh(cyl(2.8, 2.8, 0.2, 32), lakeMat, 0, 0.8, 0), mesh(cyl(0.5, 0.7, 3, 12), mat('#7C5CFC'), 0, 1.5, 0));
  const jets: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const j = mesh(geo('drop', () => new THREE.SphereGeometry(0.18, 8, 6)), mat('#BDE8FF', { glass: true }), Math.cos(a) * 1.4, 2, Math.sin(a) * 1.4);
    jets.push(j);
    fountain.add(j);
  }
  scene.add(fountain);

  // Prédios.
  const buildingGroups = PARK_BUILDINGS.map(building);
  buildingGroups.forEach((g) => scene.add(g));
  // Topo real de cada prédio: o nome fica logo acima dele (não sobre o prédio de trás).
  const tops = new Map<ModuleId, number>(buildingGroups.map((g) => [g.userData.id as ModuleId, new THREE.Box3().setFromObject(g).max.y + 1.2] as [ModuleId, number]));

  // Árvores em instâncias: dois desenhos (tronco e copa) para todas.
  const trees = treePositions(MAX_TREES);
  const trunk = new THREE.InstancedMesh(cyl(0.25, 0.35, 1.6, 6), mat('#7C5A3A'), trees.length);
  const crown = new THREE.InstancedMesh(geo('crown', () => new THREE.ConeGeometry(1.6, 3.6, 7)), mat('#3F8F4E'), trees.length);
  const m4 = new THREE.Matrix4();
  trees.forEach((t, i) => {
    m4.compose(new THREE.Vector3(t.x, 0.8 * t.s, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s, t.s, t.s));
    trunk.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(t.x, (1.6 + 1.8) * t.s, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s, t.s, t.s));
    crown.setMatrixAt(i, m4);
  });
  trunk.castShadow = crown.castShadow = true;
  scene.add(trunk, crown);

  // Câmera: um dedo desloca, pinça aproxima, dois dedos giram e inclinam.
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !opts.reduceMotion;
  controls.screenSpacePanning = false;
  controls.minDistance = 14;
  controls.maxDistance = 150;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.32;
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.addEventListener('change', () => {
    // O alvo da câmera não sai do parque.
    const t = controls.target;
    const r = Math.hypot(t.x, t.z);
    if (r > PARK_RADIUS - 5) t.multiplyScalar((PARK_RADIUS - 5) / r);
    t.y = 0;
  });

  // Toque curto num prédio = selecionar.
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY, t: performance.now() });
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 400) return;
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(buildingGroups, true)[0];
    opts.onSelect((hit?.object.userData.id as ModuleId | undefined) ?? null);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  // Qualidade.
  let fpsCap: number = QUALITY[opts.quality].fpsCap;
  const setQuality = (q: ParkQuality) => {
    const cfg = QUALITY[q];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatio));
    renderer.shadowMap.enabled = cfg.shadows;
    sun.castShadow = cfg.shadows;
    trunk.count = crown.count = Math.min(cfg.trees, trees.length);
    fpsCap = cfg.fpsCap;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    resize();
  };

  // Dia e noite: céu, luzes e janelas acesas.
  let night = 0;
  let nightTarget = 0;
  const setNight = (n: boolean) => {
    nightTarget = n ? 1 : 0;
    if (opts.reduceMotion) night = nightTarget;
  };

  // "Ir até lá": a câmera desliza até o prédio (instantâneo com movimento reduzido).
  let fly: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t0: number } | null = null;
  const flyTo = (id: ModuleId | 'plaza') => {
    const b = PARK_BUILDINGS.find((x) => x.id === id);
    const to = new THREE.Vector3(b?.x ?? 0, 0, b?.z ?? 0);
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target).setLength(b ? 34 : 90);
    const camTo = to.clone().add(offset);
    if (opts.reduceMotion) {
      controls.target.copy(to);
      camera.position.copy(camTo);
      return;
    }
    fly = { from: controls.target.clone(), to, camFrom: camera.position.clone(), camTo, t0: performance.now() };
  };

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // Laço de desenho: para quando a aba some; limita fps na qualidade baixa.
  let raf = 0;
  let last = 0;
  let frames = 0;
  let statsAt = performance.now();
  const glassMats = [...mats.entries()].filter(([k]) => k.endsWith('ge') || k.endsWith('|ge')).map(([, m]) => m as THREE.MeshStandardMaterial);
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden || now - last < 1000 / fpsCap - 1) return;
    last = now;
    frames++;
    if (fly) {
      const k = Math.min(1, (now - fly.t0) / 900);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      controls.target.lerpVectors(fly.from, fly.to, e);
      camera.position.lerpVectors(fly.camFrom, fly.camTo, e);
      if (k >= 1) fly = null;
    }
    if (night !== nightTarget) night += Math.sign(nightTarget - night) * Math.min(Math.abs(nightTarget - night), 0.03);
    (scene.background as THREE.Color).lerpColors(dayColor, nightColor, night);
    (scene.fog as THREE.Fog).color.copy(scene.background as THREE.Color);
    hemi.intensity = 1.1 - night * 0.8;
    sun.intensity = 1.6 - night * 1.4;
    glassMats.forEach((m) => (m.emissiveIntensity = night * 0.6));
    if (!opts.reduceMotion) {
      const t = now / 1000;
      jets.forEach((j, i) => (j.position.y = 2 + Math.abs(Math.sin(t * 2 + i)) * 1.6));
      lakeMat.opacity = 0.85 + Math.sin(t * 0.8) * 0.05;
    }
    controls.update();
    renderer.render(scene, camera);
    if (now - statsAt >= 1000) {
      opts.onStats({ fps: Math.round((frames * 1000) / (now - statsAt)), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries });
      frames = 0;
      statsAt = now;
    }
  };

  setQuality(opts.quality);
  raf = requestAnimationFrame(loop);

  const v = new THREE.Vector3();
  return {
    setQuality,
    setNight,
    flyTo,
    project: () =>
      buildingGroups.map((g) => {
        const b = PARK_BUILDINGS.find((x) => x.id === g.userData.id)!;
        v.set(b.x, tops.get(b.id) ?? 8, b.z).project(camera);
        const dist = camera.position.distanceTo(g.position);
        return { id: b.id, x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight, visible: v.z < 1 && dist < 170 };
      }),
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      controls.dispose();
      // Geometrias próprias (chão, caminhos, lago) e as do kit compartilhado.
      const shared = new Set(geos.values());
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !shared.has(m.geometry)) m.geometry.dispose();
      });
      geos.forEach((g) => g.dispose());
      geos.clear();
      mats.forEach((m) => m.dispose());
      mats.clear();
      lakeMat.dispose();
      renderer.dispose();
    },
  };
}
