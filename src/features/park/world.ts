/**
 * O parque inteiro (V2): terreno, lago, caminhos, praça com a fonte ROUTIG, paisagismo por região,
 * os 18 prédios (detalhados os que já têm projeto; os demais com a forma provisória) e a vida do parque.
 * docs/V2-PARQUE-PLANO.md.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { LAKE, PARK_BUILDINGS, PARK_RADIUS, PLAZA_RADIUS, entranceOf, facingOf, heightAt, parkPaths, samplePath, seededRandom, treePositions, type ParkBuilding, type Point } from '@/domain/park';
import { Builder, Kit, cloud, forest, setWaterNight, shrubs, sky, stars, water, type Plant, type TreeSpecies } from './kit';
import { birds, drone, fountain, rain } from './life';
import { dashboardBuilding, inboxBuilding, profileBuilding, settingsBuilding, type DetailedBuilding } from './buildings/central';
import { academyBuilding, insightsBuilding, languagesBuilding, libraryBuilding, notesBuilding } from './buildings/north';
import { calendarBuilding, financeBuilding, projectsBuilding, tasksBuilding } from './buildings/east';
import { prototypeBuilding } from './buildings/prototype';
import type { Obstacle } from './camera';

export type TimeOfDay = 'day' | 'dusk' | 'night';
export type Quality = 'low' | 'medium' | 'high';

export interface Light {
  skyTop: string;
  skyBottom: string;
  sun: string;
  sunI: number;
  hemiI: number;
  sunDir: [number, number, number];
  glow: number;
}

export const TIMES: Record<TimeOfDay, Light> = {
  day: { skyTop: '#4F9FE0', skyBottom: '#D6ECF7', sun: '#FFF6E5', sunI: 1.8, hemiI: 0.75, sunDir: [0.45, 0.8, 0.35], glow: 0 },
  dusk: { skyTop: '#3B4C8C', skyBottom: '#F6A86B', sun: '#FFB27A', sunI: 1.3, hemiI: 0.6, sunDir: [-0.9, 0.25, 0.25], glow: 0.55 },
  night: { skyTop: '#060B22', skyBottom: '#1B2550', sun: '#9DB4FF', sunI: 0.35, hemiI: 0.22, sunDir: [-0.4, 0.8, -0.5], glow: 1 },
};

/** Prédios com projeto detalhado (os demais chegam nos próximos blocos). */
const DETAILED: Partial<Record<ModuleId, (kit: Kit) => DetailedBuilding>> = {
  inbox: inboxBuilding,
  dashboard: dashboardBuilding,
  profile: profileBuilding,
  settings: settingsBuilding,
  library: libraryBuilding,
  notes: notesBuilding,
  academy: academyBuilding,
  languages: languagesBuilding,
  insights: insightsBuilding,
  calendar: calendarBuilding,
  tasks: tasksBuilding,
  projects: projectsBuilding,
  finance: financeBuilding,
};

export interface PlacedBuilding {
  def: ParkBuilding;
  group: THREE.Group;
  top: number;
  detailed: boolean;
  entrance: Point;
  facing: number;
}

export interface World {
  root: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  buildings: Map<ModuleId, PlacedBuilding>;
  obstacles: Obstacle[];
  pickables: THREE.Object3D[];
  tick: (t: number, dt: number, focus: THREE.Vector3, cam: THREE.Vector3) => void;
  setLight: (l: Light) => void;
  setRain: (on: boolean) => void;
  setDetail: (q: Quality) => void;
}

/* ---------- Terreno ---------- */

function terrain(kit: Kit): THREE.Mesh {
  const size = 760;
  const seg = 150;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  const base = { central: new THREE.Color('#7DB866'), north: new THREE.Color('#5F9A55'), east: new THREE.Color('#78B060'), south: new THREE.Color('#86BC62'), west: new THREE.Color('#6BB25E') };
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y = heightAt(x, z);
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (dl < LAKE.radius + 4) y -= 1.6 * (1 - THREE.MathUtils.smoothstep(dl, LAKE.radius - 6, LAKE.radius + 4));
    pos.setY(i, y - 0.03);
    // Cor por região (mistura suave pelo ângulo) + variação e areia na margem do lago.
    const a = Math.atan2(x, -z);
    const r = Math.hypot(x, z);
    const pick = r < 45 ? base.central : Math.abs(a) < Math.PI / 4 ? base.north : a > 0 && a < (3 * Math.PI) / 4 ? base.east : a < 0 && a > (-3 * Math.PI) / 4 ? base.west : base.south;
    c.copy(pick);
    const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.5 + Math.sin(x * 0.05 + z * 0.07) * 0.5;
    c.multiplyScalar(0.92 + n * 0.08);
    if (dl < LAKE.radius + 5 && dl > LAKE.radius - 3) c.lerp(tmp.set('#D9C9A3'), 0.7);
    if (r > PARK_RADIUS + 20) c.lerp(tmp.set('#557F4A'), 0.4);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(kit.own(g), kit.mat('#ffffff', { vertexColors: true, rough: 0.95 }));
  m.receiveShadow = true;
  return m;
}

/** Faixa de caminho seguindo o relevo. */
function ribbonOn(points: THREE.Vector2[], width: number, lift: number): THREE.BufferGeometry {
  const curve = new THREE.SplineCurve(points);
  const n = Math.max(8, Math.round(curve.getLength() / 2));
  const pts = curve.getSpacedPoints(n);
  const pos: number[] = [];
  const idx: number[] = [];
  pts.forEach((p, i) => {
    const tg = curve.getTangentAt(i / n);
    const nx = -tg.y * (width / 2);
    const nz = tg.x * (width / 2);
    pos.push(p.x + nx, heightAt(p.x + nx, p.y + nz) + lift, p.y + nz, p.x - nx, heightAt(p.x - nx, p.y - nz) + lift, p.y - nz);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function paths(kit: Kit): { group: THREE.Group; lamps: Point[] } {
  const b = new Builder();
  const edge = kit.mat('#B8AE98', { rough: 0.9 });
  const pave = kit.mat('#DCD3C0', { rough: 0.85 });
  const all = parkPaths();
  const lamps: Point[] = [];
  all.forEach((line, i) => {
    // Avenidas (4) mais largas; ramais; volta do lago; anel de passeio.
    const w = i < 4 ? 7 : i < 4 + PARK_BUILDINGS.length ? 4.2 : 3.6;
    const v = line.map((p) => new THREE.Vector2(p.x, p.z));
    b.add(edge, ribbonOn(v, w + 0.9, 0.04));
    b.add(pave, ribbonOn(v, w, 0.07));
    // Postes a cada ~22 m, alternando os lados.
    const s = samplePath(line, 22);
    s.forEach((p, k) => {
      if (k === 0 || Math.hypot(p.x, p.z) < PLAZA_RADIUS + 3) return;
      const q = s[Math.min(k + 1, s.length - 1)]!;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      const side = k % 2 ? 1 : -1;
      lamps.push({ x: p.x + (-dz / l) * (w / 2 + 1.2) * side, z: p.z + (dx / l) * (w / 2 + 1.2) * side });
    });
  });
  return { group: b.build(false), lamps };
}

/* ---------- Praça central ---------- */

function plaza(kit: Kit): THREE.Group {
  const b = new Builder();
  const R = PLAZA_RADIUS;
  b.add(kit.mat('#E7E1D3', { rough: 0.85 }), new THREE.CircleGeometry(R, 96), [0, 0.06, 0], [-Math.PI / 2, 0, 0]);
  const ring = (r1: number, r2: number, color: string) => b.add(kit.mat(color, { rough: 0.7 }), new THREE.RingGeometry(r1, r2, 96), [0, 0.075, 0], [-Math.PI / 2, 0, 0]);
  ring(7.6, 8.1, '#BFB6A3');
  ring(13.6, 14.1, '#14B8A6');
  ring(20.4, 20.9, '#BFB6A3');
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    b.add(kit.mat('#CFC6B2', { rough: 0.8 }), new THREE.BoxGeometry(0.22, 0.02, 5.4), [Math.sin(a) * 10.85, 0.08, Math.cos(a) * 10.85], [0, a, 0]);
  }
  b.add(kit.mat('#D6D0C2'), new THREE.TorusGeometry(R + 0.1, 0.22, 6, 128), [0, 0.1, 0], [-Math.PI / 2, 0, 0]);
  // Bancos entre as saídas e canteiros circulares com borda de pedra.
  const wood = kit.mat('#A0714F', { rough: 0.8 });
  const metal = kit.mat('#475569', { metal: 0.7, rough: 0.35 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    // Livre nas oito direções dos caminhos.
    if (i % 2 === 1) continue;
    const x = Math.sin(a) * 17.2;
    const z = Math.cos(a) * 17.2;
    b.add(wood, new THREE.BoxGeometry(2.6, 0.12, 0.62), [x, 0.5, z], [0, a, 0]);
    b.add(wood, new THREE.BoxGeometry(2.6, 0.5, 0.1), [x + Math.sin(a) * 0.33, 0.8, z + Math.cos(a) * 0.33], [-0.15, a, 0]);
    for (const s of [-1, 1]) b.add(metal, new THREE.BoxGeometry(0.1, 0.5, 0.55), [x + Math.cos(a) * s * 1.1, 0.25, z - Math.sin(a) * s * 1.1], [0, a, 0]);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.sin(a) * 21.5;
    const z = Math.cos(a) * 21.5;
    b.add(kit.mat('#D9D2C3', { rough: 0.6 }), new THREE.CylinderGeometry(2.4, 2.5, 0.55, 32), [x, 0.3, z]);
    b.add(kit.mat('#5C8F48', { rough: 1 }), new THREE.CylinderGeometry(2.2, 2.2, 0.05, 32), [x, 0.6, z]);
  }
  return b.build();
}

/* ---------- Postes em instâncias ---------- */

function lampPosts(kit: Kit, spots: Point[]): THREE.Group {
  const group = new THREE.Group();
  const pole = new THREE.InstancedMesh(kit.own(new THREE.CylinderGeometry(0.08, 0.13, 4.2, 6)), kit.mat('#334155', { metal: 0.8, rough: 0.3 }), spots.length);
  const head = new THREE.InstancedMesh(kit.own(new THREE.SphereGeometry(0.26, 10, 8)), kit.mat('#FFE7B0', { glow: true, rough: 0.4 }), spots.length);
  const m4 = new THREE.Matrix4();
  spots.forEach((p, i) => {
    const y = heightAt(p.x, p.z);
    pole.setMatrixAt(i, m4.makeTranslation(p.x, y + 2.1, p.z));
    head.setMatrixAt(i, m4.makeTranslation(p.x, y + 4.25, p.z));
  });
  pole.castShadow = true;
  group.add(pole, head);
  return group;
}

/* ---------- Lago, orla, píer e ponte ---------- */

function lake(kit: Kit): { group: THREE.Group; water: ReturnType<typeof water> } {
  const group = new THREE.Group();
  const w = water(kit, LAKE.radius, '#2A86C4');
  w.mesh.position.set(LAKE.x, -0.35, LAKE.z);
  const b = new Builder();
  const wood = kit.mat('#8B6545', { rough: 0.8 });
  // Píer saindo da margem sul (lado do Music).
  const a = Math.atan2(-40 - LAKE.x, 150 - LAKE.z);
  const sx = LAKE.x + Math.sin(a) * (LAKE.radius - 9);
  const sz = LAKE.z + Math.cos(a) * (LAKE.radius - 9);
  b.add(wood, new THREE.BoxGeometry(3, 0.25, 16), [sx, 0.15, sz], [0, a, 0]);
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) b.add(wood, new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6), [sx + Math.sin(a) * (k * 3.6 - 7) + Math.cos(a) * s * 1.4, -0.4, sz + Math.cos(a) * (k * 3.6 - 7) - Math.sin(a) * s * 1.4]);
  // Pedras na margem.
  const rnd = seededRandom(9);
  for (let k = 0; k < 26; k++) {
    const t = rnd() * Math.PI * 2;
    const r = LAKE.radius + 0.5 + rnd() * 2;
    b.add(kit.mat('#9CA3AF', { rough: 0.9 }), new THREE.IcosahedronGeometry(0.5 + rnd() * 0.9, 0), [LAKE.x + Math.sin(t) * r, 0, LAKE.z + Math.cos(t) * r], [rnd(), rnd(), 0]);
  }
  group.add(w.mesh, b.build());
  // Ninfeias.
  const pads: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (let k = 0; k < 30; k++) {
    const t = rnd() * Math.PI * 2;
    const r = LAKE.radius * (0.5 + rnd() * 0.42);
    pads.push({ x: LAKE.x + Math.sin(t) * r, y: -0.5, z: LAKE.z + Math.cos(t) * r, s: 1.6, color: k % 5 === 0 ? '#F9A8D4' : '#4D9E57' });
  }
  group.add(shrubs(kit, pads, 'flower'));
  return { group, water: w };
}

/* ---------- Vegetação por região ---------- */

function plants(): Plant[] {
  const pts = treePositions(1100);
  return pts.map((p, i) => {
    const a = Math.atan2(p.x, -p.z);
    const north = Math.abs(a) < Math.PI / 4;
    const west = a < -Math.PI / 4 && a > (-3 * Math.PI) / 4;
    const pool: TreeSpecies[] = north ? ['conifer', 'conifer', 'slender', 'round'] : west ? ['blossom', 'round', 'round', 'slender'] : ['round', 'round', 'slender', 'blossom', 'conifer'];
    return { x: p.x, y: heightAt(p.x, p.z), z: p.z, s: p.s * (Math.hypot(p.x, p.z) > PARK_RADIUS ? 1.3 : 1), species: pool[i % pool.length]! };
  });
}

function meadows(kit: Kit): THREE.Object3D[] {
  const rnd = seededRandom(17);
  const flowers: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  const bushes: typeof flowers = [];
  const pathPts = parkPaths().flatMap((p) => samplePath(p, 6));
  const free = (x: number, z: number) =>
    Math.hypot(x, z) > PLAZA_RADIUS + 3 && Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.radius + 3 && !PARK_BUILDINGS.some((b) => Math.hypot(x - b.x, z - b.z) < b.radius) && !pathPts.some((q) => Math.abs(q.x - x) < 3 && Math.abs(q.z - z) < 3);
  // Canteiros em manchas (mais no Oeste, o lado dos jardins).
  for (let k = 0; k < 70; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 30 + rnd() * (PARK_RADIUS - 40);
    const cx = Math.sin(a) * r;
    const cz = Math.cos(a) * r;
    const west = cx < -40;
    const palette = west ? ['#F472B6', '#FBBF24', '#FFFFFF', '#C084FC', '#F87171'] : ['#FBBF24', '#FFFFFF', '#60A5FA', '#F472B6'];
    for (let i = 0; i < (west ? 60 : 32); i++) {
      const x = cx + (rnd() - 0.5) * 9;
      const z = cz + (rnd() - 0.5) * 9;
      if (!free(x, z)) continue;
      flowers.push({ x, y: heightAt(x, z), z, s: 1.1, color: palette[i % palette.length]! });
    }
    for (let i = 0; i < 5; i++) {
      const x = cx + (rnd() - 0.5) * 12;
      const z = cz + (rnd() - 0.5) * 12;
      if (free(x, z)) bushes.push({ x, y: heightAt(x, z), z, s: 0.9 + rnd() * 0.9, color: rnd() > 0.5 ? '#3E8E4A' : '#4F9F55' });
    }
  }
  return [shrubs(kit, flowers, 'flower'), shrubs(kit, bushes, 'bush')];
}

/* ---------- Montagem ---------- */

export function createWorld(kit: Kit): World {
  const root = new THREE.Group();
  const sk = sky(kit);
  sk.mesh.scale.setScalar(1.6);
  const st = stars(kit, 700);
  st.scale.setScalar(1.6);
  root.add(sk.mesh, st);

  const hemi = new THREE.HemisphereLight('#ffffff', '#5B7A4A', 1);
  const sun = new THREE.DirectionalLight('#FFF6E5', 2.2);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 5, far: 400 });
  root.add(hemi, sun, sun.target);

  root.add(terrain(kit));
  const p = paths(kit);
  root.add(p.group, lampPosts(kit, p.lamps), plaza(kit));
  const f = fountain(kit);
  f.group.scale.setScalar(1.7);
  root.add(f.group);
  const lk = lake(kit);
  root.add(lk.group);

  // Prédios.
  const buildings = new Map<ModuleId, PlacedBuilding>();
  const obstacles: Obstacle[] = [{ x: 0, z: 0, r: 4 * 1.7, h: 8 }];
  const ticks: Array<(t: number) => void> = [];
  const lodItems: Array<{ obj: THREE.Object3D; x: number; z: number; far: number }> = [];
  for (const def of PARK_BUILDINGS) {
    const make = DETAILED[def.id];
    let group: THREE.Group;
    let top: number;
    let core: number;
    if (make) {
      const d = make(kit);
      group = d.group;
      top = d.top;
      core = d.core;
      if (d.tick) ticks.push(d.tick);
      // Arbustos, flores e letreiros só de perto.
      d.group.children.forEach((c) => {
        if (c instanceof THREE.InstancedMesh || (c instanceof THREE.Mesh && c.geometry instanceof THREE.PlaneGeometry)) lodItems.push({ obj: c, x: def.x, z: def.z, far: c instanceof THREE.InstancedMesh ? 150 : 190 });
      });
    } else {
      group = new THREE.Group();
      const lot = new Builder();
      lot.add(kit.mat('#D9D2C3', { rough: 0.85 }), new THREE.CircleGeometry(def.radius * 0.7, 48), [0, 0.04, 0], [-Math.PI / 2, 0, 0]);
      group.add(lot.build(false), prototypeBuilding(kit, def.shape, def.color));
      const box = new THREE.Box3().setFromObject(group);
      top = box.max.y + 2;
      core = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    }
    const facing = facingOf(def);
    group.position.set(def.x, heightAt(def.x, def.z), def.z);
    group.rotation.y = facing;
    group.traverse((o) => (o.userData.building = def.id));
    root.add(group);
    buildings.set(def.id, { def, group, top: top + group.position.y, detailed: !!make, entrance: entranceOf(def), facing });
    obstacles.push({ x: def.x, z: def.z, r: core, h: top });
  }
  obstacles.push({ x: LAKE.x, z: LAKE.z, r: LAKE.radius - 1, h: -1 });
  root.add(walkway(kit, buildings.get('tasks')?.def, buildings.get('calendar')?.def));

  const trees = forest(kit, plants());
  root.add(trees.group, ...meadows(kit));

  const clouds = Array.from({ length: 12 }, (_, i) => {
    const c = cloud(kit, i + 1);
    c.position.set(-300 + i * 55, 70 + (i % 3) * 12, -200 + ((i * 97) % 400));
    c.scale.setScalar(2.2 + (i % 3) * 0.7);
    root.add(c);
    return c;
  });
  const bd = birds(kit, 12);
  const inbox = buildings.get('inbox')!.def;
  const dr = drone(kit, inbox);
  const rn = rain(kit);
  rn.lines.scale.set(2, 1, 2);
  root.add(bd.mesh, dr.group, rn.lines);

  let raining = false;
  const skyTop = new THREE.Color();
  const skyBottom = new THREE.Color();
  const sunDir = new THREE.Vector3(...TIMES.day.sunDir).normalize();

  return {
    root,
    sun,
    hemi,
    buildings,
    obstacles,
    pickables: [...buildings.values()].map((b) => b.group),
    tick: (t, dt, focus, cam) => {
      f.tick(t);
      lk.water.tick(t * 0.6);
      ticks.forEach((fn) => fn(t));
      trees.tick(t);
      bd.tick(t);
      dr.tick(t);
      clouds.forEach((c, i) => {
        c.position.x += dt * (1.6 + (i % 3) * 0.5);
        if (c.position.x > 380) c.position.x = -380;
      });
      if (raining) rn.tick(dt, focus);
      // A sombra acompanha onde a câmera olha (um mapa de sombra pequeno e nítido).
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 200);
      for (const l of lodItems) l.obj.visible = Math.hypot(cam.x - l.x, cam.z - l.z) < l.far;
    },
    setLight: (l) => {
      skyTop.set(l.skyTop);
      skyBottom.set(l.skyBottom);
      if (raining) {
        skyTop.lerp(new THREE.Color('#5B6676'), 0.6);
        skyBottom.lerp(new THREE.Color('#9AA5B4'), 0.6);
      }
      sk.set(skyTop, skyBottom);
      sun.color.set(l.sun);
      sun.intensity = l.sunI * (raining ? 0.45 : 1);
      hemi.intensity = l.hemiI;
      sunDir.set(...l.sunDir).normalize();
      (st.material as THREE.PointsMaterial).opacity = l.glow;
      kit.glowing.forEach((m) => (m.emissiveIntensity = 0.15 + l.glow * 1.6));
      setWaterNight(lk.water.mesh, l.glow * 0.8);
      f.waters.forEach((w) => setWaterNight(w, l.glow * 0.8));
      clouds.forEach((c) => (c.material as THREE.MeshStandardMaterial).color.set(raining ? '#AAB4C0' : l.glow > 0.5 ? '#3A4466' : '#FFFFFF'));
    },
    setRain: (on) => {
      raining = on;
      rn.lines.visible = on;
    },
    setDetail: (q) => {
      trees.setCount(q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1);
      bd.mesh.visible = q !== 'low';
      dr.group.visible = q !== 'low';
      clouds.forEach((c, i) => (c.visible = q === 'high' || i % 2 === 0));
      const far = q === 'low' ? 0.6 : 1;
      lodItems.forEach((l) => (l.far = (l.obj instanceof THREE.InstancedMesh ? 150 : 190) * far));
    },
  };
}

/** Passarela coberta entre dois prédios (Tasks ↔ Calendar: agendamento compartilhado). */
function walkway(kit: Kit, a?: ParkBuilding, c?: ParkBuilding): THREE.Group {
  const b = new Builder();
  if (a && c) {
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const d = Math.hypot(dx, dz);
    const ux = dx / d;
    const uz = dz / d;
    const from = a.radius * 0.62;
    const to = d - c.radius * 0.62;
    const len = to - from;
    const mx = a.x + ux * (from + len / 2);
    const mz = a.z + uz * (from + len / 2);
    const ry = Math.atan2(ux, uz);
    const y = heightAt(mx, mz);
    b.add(kit.mat('#DCD3C0', { rough: 0.85 }), new THREE.BoxGeometry(4, 0.12, len), [mx, y + 0.06, mz], [0, ry, 0]);
    b.add(kit.mat('#CBD5E1', { metal: 0.85, rough: 0.25 }), new THREE.BoxGeometry(4.6, 0.25, len), [mx, y + 3.6, mz], [0, ry, 0]);
    b.add(kit.mat('#22D3EE', { glow: true }), new THREE.BoxGeometry(0.08, 0.06, len), [mx + Math.cos(ry) * 2.3, y + 3.45, mz - Math.sin(ry) * 2.3], [0, ry, 0]);
    for (let k = 0; k <= Math.floor(len / 6); k++) {
      const s = from + (k * len) / Math.max(1, Math.floor(len / 6));
      for (const side of [-1, 1]) {
        const px = a.x + ux * s + uz * side * 2.1;
        const pz = a.z + uz * s - ux * side * 2.1;
        b.add(kit.mat('#2B3442', { metal: 0.5, rough: 0.4 }), new THREE.CylinderGeometry(0.1, 0.1, 3.5, 6), [px, heightAt(px, pz) + 1.75, pz]);
      }
    }
  }
  return b.build();
}
