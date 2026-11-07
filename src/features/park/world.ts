/**
 * O parque inteiro (V2): terreno, lago, caminhos, praça com a fonte ROUTIG, paisagismo por região,
 * os 18 prédios (detalhados os que já têm projeto; os demais com a forma provisória) e a vida do parque.
 * docs/V2-PARQUE-PLANO.md.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { LAKE, PARK_BUILDINGS, PARK_RADIUS, PATH_WIDTH, PLAZA_RADIUS, PONDS, entranceOf, facingOf, heightAt, inWater, lakeRadiusAt, parkPaths, samplePath, seededRandom, treePositions, type ParkBuilding, type Point } from '@/domain/park';
import { amenities, houses, type Seat, type Viewpoint } from './buildings/amenities';
import { Builder, Kit, cloud, forest, setWaterNight, setWaterWeather, shrubs, sky, stars, water, type Plant, type TreeSpecies } from './kit';
import { birds, butterflies, drone, fountain, leaves, rain } from './life';
import { dashboardBuilding, inboxBuilding, profileBuilding, settingsBuilding, type DetailedBuilding } from './buildings/central';
import { academyBuilding, insightsBuilding, languagesBuilding, libraryBuilding, notesBuilding } from './buildings/north';
import { calendarBuilding, financeBuilding, projectsBuilding, tasksBuilding } from './buildings/east';
import { focusBuilding, goalsBuilding, habitsBuilding, musicBuilding, sportsBuilding } from './buildings/westsouth';
import { prototypeBuilding } from './buildings/prototype';
import type { Obstacle } from './camera';
import { footprint } from './collision';

export type Quality = 'low' | 'medium' | 'high';
/** Clima combinável (V2.1, seção 15): cada componente de 0 a 1; chuva com vento e neblina, por exemplo. */
export interface Sky {
  cloud: number;
  rain: number;
  fog: number;
  wind: number;
}
export const CLEAR_SKY: Sky = { cloud: 0.1, rain: 0, fog: 0, wind: 0.15 };
export type SkyPreset = 'sun' | 'cloudy' | 'rain' | 'fog' | 'wind' | 'storm';
export const SKY_PRESETS: Record<SkyPreset, Sky> = {
  sun: CLEAR_SKY,
  cloudy: { cloud: 0.8, rain: 0, fog: 0.1, wind: 0.3 },
  rain: { cloud: 0.9, rain: 0.6, fog: 0.15, wind: 0.3 },
  fog: { cloud: 0.5, rain: 0, fog: 0.85, wind: 0 },
  wind: { cloud: 0.4, rain: 0, fog: 0, wind: 0.9 },
  storm: { cloud: 1, rain: 1, fog: 0.3, wind: 0.85 },
};

/** Clima automático: muda devagar ao longo do dia, sempre igual para a mesma data e hora. */
export function autoSky(d: Date): Sky {
  const day = Math.floor(d.getTime() / 86400000);
  const block = Math.floor(d.getHours() / 3);
  const r = Math.abs(Math.sin(day * 12.9898 + block * 78.233) * 43758.5453) % 1;
  const morning = d.getHours() >= 5 && d.getHours() < 9;
  if (morning && r < 0.25) return SKY_PRESETS.fog;
  if (r < 0.55) return CLEAR_SKY;
  if (r < 0.75) return SKY_PRESETS.cloudy;
  if (r < 0.85) return SKY_PRESETS.wind;
  if (r < 0.97) return SKY_PRESETS.rain;
  return SKY_PRESETS.storm;
}

/** Fases do dia (V2.1, seção 14). */
export type DayPhase = 'night' | 'dawn' | 'morning' | 'afternoon' | 'sunset';
export function phaseOf(hour: number): DayPhase {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 19.5) return 'sunset';
  return 'night';
}
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Estação pela data, no hemisfério sul (Brasil). */
export function seasonOf(d: Date): Season {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const md = m * 100 + day;
  if (md >= 1221 || md < 320) return 'summer';
  if (md < 621) return 'autumn';
  if (md < 922) return 'winter';
  return 'spring';
}

/** Evento especial pela data: fim de ano (20/12 a 06/01), só decorativo. */
export function festiveOn(d: Date): boolean {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  return md >= 1220 || md <= 106;
}

export interface Light {
  skyTop: string;
  skyBottom: string;
  sun: string;
  sunI: number;
  hemiI: number;
  sunDir: [number, number, number];
  glow: number;
}

type Key = Omit<Light, 'sunDir'>;
/** Pontos do ciclo de luz; entre eles, tudo é interpolado (sem saltos). */
const KEYS: Array<[number, Key]> = [
  [0, { skyTop: '#060B22', skyBottom: '#1B2550', sun: '#9DB4FF', sunI: 0.35, hemiI: 0.22, glow: 1 }],
  [4.8, { skyTop: '#0A1030', skyBottom: '#2A2F5A', sun: '#9DB4FF', sunI: 0.3, hemiI: 0.24, glow: 1 }],
  [6, { skyTop: '#4A5A9A', skyBottom: '#F4B183', sun: '#FFB98A', sunI: 0.9, hemiI: 0.45, glow: 0.55 }],
  [7.5, { skyTop: '#5AA4E2', skyBottom: '#E3F1F8', sun: '#FFF0D6', sunI: 1.55, hemiI: 0.68, glow: 0 }],
  [12, { skyTop: '#4F9FE0', skyBottom: '#D6ECF7', sun: '#FFF6E5', sunI: 1.9, hemiI: 0.78, glow: 0 }],
  [16, { skyTop: '#5598D8', skyBottom: '#F1E4C8', sun: '#FFE2B0', sunI: 1.6, hemiI: 0.7, glow: 0 }],
  [17.6, { skyTop: '#4A62A8', skyBottom: '#F8B27A', sun: '#FFA868', sunI: 1.3, hemiI: 0.58, glow: 0.25 }],
  [18.5, { skyTop: '#3B4C8C', skyBottom: '#F08A5D', sun: '#FF8E55', sunI: 0.95, hemiI: 0.48, glow: 0.65 }],
  [19.5, { skyTop: '#1E2A5E', skyBottom: '#6A5A8C', sun: '#B9A7FF', sunI: 0.45, hemiI: 0.3, glow: 0.95 }],
  [21, { skyTop: '#060B22', skyBottom: '#1B2550', sun: '#9DB4FF', sunI: 0.35, hemiI: 0.22, glow: 1 }],
  [24, { skyTop: '#060B22', skyBottom: '#1B2550', sun: '#9DB4FF', sunI: 0.35, hemiI: 0.22, glow: 1 }],
];
const mixHex = (a: string, b: string, k: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;

/** Luz de qualquer hora (0–24): cores do céu, sol (ou lua), intensidade e luzes artificiais. */
export function lightAt(hour: number): Light {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]![0] <= h) i++;
  const [h0, a] = KEYS[i]!;
  const [h1, b] = KEYS[i + 1]!;
  const k = h1 > h0 ? (h - h0) / (h1 - h0) : 0;
  // Sol nasce a leste (+x), passa alto ao meio-dia e se põe a oeste; à noite, a lua.
  let sunDir: [number, number, number];
  if (h >= 5.6 && h <= 18.9) {
    const ang = ((h - 5.6) / 13.3) * Math.PI;
    sunDir = [Math.cos(ang) * 0.9, Math.max(0.1, Math.sin(ang)), 0.35];
  } else sunDir = [-0.4, 0.8, -0.5];
  return {
    skyTop: mixHex(a.skyTop, b.skyTop, k),
    skyBottom: mixHex(a.skyBottom, b.skyBottom, k),
    sun: mixHex(a.sun, b.sun, k),
    sunI: a.sunI + (b.sunI - a.sunI) * k,
    hemiI: a.hemiI + (b.hemiI - a.hemiI) * k,
    glow: a.glow + (b.glow - a.glow) * k,
    sunDir,
  };
}

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
  focus: focusBuilding,
  habits: habitsBuilding,
  goals: goalsBuilding,
  music: musicBuilding,
  sports: sportsBuilding,
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
  seats: Seat[];
  viewpoints: Viewpoint[];
  /** Árvores (para observar de perto). */
  treeSpots: Plant[];
  spots: Array<{ id: string; x: number; z: number; kind: string }>;
  tick: (t: number, dt: number, focus: THREE.Vector3, cam: THREE.Vector3) => void;
  setLight: (l: Light) => void;
  setWeather: (w: Sky) => void;
  setSeason: (s: Season) => void;
  setFestive: (on: boolean) => void;
  setDetail: (q: Quality) => void;
}

/* ---------- Névoa baixa (segue o relevo) ---------- */

function mist(kit: Kit): { mesh: THREE.InstancedMesh; tick: (center: THREE.Vector3, fog: number, t: number) => void } {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  const tex = kit.own(new THREE.CanvasTexture(c));
  const mat = kit.own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: '#E6ECF2', fog: false }));
  const geo = kit.own(new THREE.PlaneGeometry(1, 1));
  geo.rotateX(-Math.PI / 2);
  const N = 14;
  const STEP = 16;
  const mesh = new THREE.InstancedMesh(geo, mat, N * N * 2);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  return {
    mesh,
    tick: (center, fog, t) => {
      mesh.visible = fog > 0.05;
      if (!mesh.visible) return;
      mat.opacity = Math.min(0.55, fog * 0.6);
      const cx = Math.round(center.x / STEP) * STEP;
      const cz = Math.round(center.z / STEP) * STEP;
      let k = 0;
      for (let layer = 0; layer < 2; layer++)
        for (let i = 0; i < N; i++)
          for (let j = 0; j < N; j++) {
            const x = cx + (i - N / 2) * STEP + Math.sin(t * 0.05 + j + layer) * 4;
            const z = cz + (j - N / 2) * STEP + Math.cos(t * 0.04 + i) * 4;
            // Mais densa nos vales e na beira d'água: fica rente ao chão, acompanhando o relevo.
            v.set(x, heightAt(x, z) + 0.8 + layer * 1.6, z);
            sc.setScalar(STEP * (2.2 + layer * 0.6));
            m4.compose(v, q.setFromEuler(e.set(0, i * 1.7 + j, 0)), sc);
            mesh.setMatrixAt(k++, m4);
          }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ---------- Terreno ---------- */


function terrain(kit: Kit): THREE.Mesh {
  const size = 820;
  const seg = 170;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  // Norte: mata densa (verde escuro); Oeste: colinas tropicais; Leste: gramados abertos; Sul: jardins.
  const base = { central: new THREE.Color('#7DB866'), north: new THREE.Color('#4F8E49'), east: new THREE.Color('#86BE68'), south: new THREE.Color('#7FBA64'), west: new THREE.Color('#5E9F50') };
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y = heightAt(x, z);
    // Margens do lago descendo até a água (forma orgânica) e lagos ornamentais.
    const ang = Math.atan2(z - LAKE.z, x - LAKE.x);
    const lr = lakeRadiusAt(ang);
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (dl < lr + 5) y -= 1.8 * (1 - THREE.MathUtils.smoothstep(dl, lr - 6, lr + 5));
    let shore = dl > lr - 2 && dl < lr + 4;
    for (const p of PONDS) {
      const dp = Math.hypot(x - p.x, z - p.z);
      if (dp < p.radius + 3) y -= 1.1 * (1 - THREE.MathUtils.smoothstep(dp, p.radius - 3, p.radius + 3));
      if (dp > p.radius - 1 && dp < p.radius + 2.5) shore = true;
    }
    pos.setY(i, y - 0.03);
    const a = Math.atan2(x, -z);
    const r = Math.hypot(x, z);
    const pick = r < 55 ? base.central : Math.abs(a) < Math.PI / 4 ? base.north : a > 0 && a < (3 * Math.PI) / 4 ? base.east : a < 0 && a > (-3 * Math.PI) / 4 ? base.west : base.south;
    c.copy(pick);
    const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.5 + Math.sin(x * 0.05 + z * 0.07) * 0.5;
    c.multiplyScalar(0.9 + n * 0.1);
    if (shore) c.lerp(tmp.set('#CDBB93'), 0.65);
    if (r > PARK_RADIUS + 20) c.lerp(tmp.set('#557F4A'), 0.35);
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
  const trail = kit.mat('#C7B48E', { rough: 0.95 });
  const lamps: Point[] = [];
  for (const line of parkPaths()) {
    const w = PATH_WIDTH[line.kind];
    const v = line.points.map((p) => new THREE.Vector2(p.x, p.z));
    if (line.kind === 'trail') {
      b.add(trail, ribbonOn(v, w, 0.05));
      continue;
    }
    b.add(edge, ribbonOn(v, w + 0.8, 0.04));
    b.add(pave, ribbonOn(v, w, 0.07));
    // Postes a cada ~22 m, alternando os lados.
    const s = samplePath(line.points, 22);
    s.forEach((p, k) => {
      if (k === 0 || k === s.length - 1 || Math.hypot(p.x, p.z) < PLAZA_RADIUS + 3) return;
      const q = s[Math.min(k + 1, s.length - 1)]!;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      const side = k % 2 ? 1 : -1;
      lamps.push({ x: p.x + (-dz / l) * (w / 2 + 1.2) * side, z: p.z + (dx / l) * (w / 2 + 1.2) * side });
    });
  }
  // Postes em ordem: nunca na água, dentro de lote, em cima de outro caminho ou colados em outro poste.
  const all = parkPaths().flatMap((l) => samplePath(l.points, 2).map((q) => ({ ...q, w: PATH_WIDTH[l.kind] })));
  const kept: Point[] = [];
  for (const l of lamps) {
    if (inWater(l.x, l.z, 1.5) || PARK_BUILDINGS.some((bd) => Math.hypot(l.x - bd.x, l.z - bd.z) < bd.radius * 0.9)) continue;
    if (all.some((q) => Math.hypot(q.x - l.x, q.z - l.z) < q.w / 2 + 0.6)) continue;
    if (kept.some((o) => Math.hypot(o.x - l.x, o.z - l.z) < 9)) continue;
    kept.push(l);
  }
  return { group: b.build(false), lamps: kept };
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

/** Superfície d'água com a forma da margem (UV de 0 a 1 para o shader das ondas). */
function shapeWater(kit: Kit, color: string, radiusAt: (a: number) => number, maxR: number): ReturnType<typeof water> {
  const w = water(kit, maxR, color);
  const shape = new THREE.Shape();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r = radiusAt(a) - 0.6;
    const px = Math.cos(a) * r;
    const py = -Math.sin(a) * r;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  const g = new THREE.ShapeGeometry(shape, 1);
  const p = g.attributes.position!;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / (maxR * 2) + 0.5;
    uv[i * 2 + 1] = p.getY(i) / (maxR * 2) + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  w.mesh.geometry.dispose();
  w.mesh.geometry = kit.own(g);
  return w;
}

function lake(kit: Kit): { group: THREE.Group; water: ReturnType<typeof water>; ponds: Array<ReturnType<typeof water>> } {
  const group = new THREE.Group();
  const w = shapeWater(kit, '#2A86C4', lakeRadiusAt, LAKE.radius + 14);
  w.mesh.position.set(LAKE.x, -0.4, LAKE.z);
  const b = new Builder();
  const wood = kit.mat('#8B6545', { rough: 0.8 });
  const rockMat = kit.mat('#9CA3AF', { rough: 0.9 });
  // Píer entrando numa enseada (lado do Sul) e plataforma de observação.
  const a = 0.9;
  const r0 = lakeRadiusAt(a);
  const sx = LAKE.x + Math.cos(a) * (r0 - 6);
  const sz = LAKE.z + Math.sin(a) * (r0 - 6);
  const ry = Math.atan2(Math.cos(a), Math.sin(a));
  b.add(wood, new THREE.BoxGeometry(2.6, 0.25, 16), [sx, 0.15, sz], [0, ry, 0]);
  b.add(wood, new THREE.BoxGeometry(6, 0.25, 4), [LAKE.x + Math.cos(a) * (r0 - 14), 0.15, LAKE.z + Math.sin(a) * (r0 - 14)], [0, ry, 0]);
  // Pedras e margens naturais.
  const rnd = seededRandom(9);
  for (let k = 0; k < 60; k++) {
    const t = rnd() * Math.PI * 2;
    const r = lakeRadiusAt(t) + 0.2 + rnd() * 2.2;
    b.add(rockMat, new THREE.IcosahedronGeometry(0.4 + rnd() * 1.1, 0), [LAKE.x + Math.cos(t) * r, -0.2, LAKE.z + Math.sin(t) * r], [rnd(), rnd(), 0]);
  }
  // Lagos ornamentais com borda de pedra e uma pequena cascata.
  const ponds = PONDS.map((p, i) => {
    const pw = water(kit, p.radius - 0.3, '#3896CF');
    pw.mesh.position.set(p.x, heightAt(p.x, p.z) - 0.7, p.z);
    group.add(pw.mesh);
    for (let k = 0; k < 14; k++) {
      const t = (k / 14) * Math.PI * 2;
      b.add(rockMat, new THREE.IcosahedronGeometry(0.45 + (k % 3) * 0.2, 0), [p.x + Math.cos(t) * p.radius, heightAt(p.x, p.z) - 0.3, p.z + Math.sin(t) * p.radius], [k, k * 2, 0]);
    }
    const ca = i * 2 + 0.5;
    const cx = p.x + Math.cos(ca) * (p.radius + 0.5);
    const cz = p.z + Math.sin(ca) * (p.radius + 0.5);
    const cy = heightAt(cx, cz);
    for (let k = 0; k < 3; k++) b.add(rockMat, new THREE.BoxGeometry(2.4 - k * 0.5, 0.6, 1.4), [cx, cy - 0.3 + k * 0.6, cz], [0, -ca, 0]);
    b.add(kit.mat('#BFE8FF', { glass: true }), new THREE.BoxGeometry(1.2, 1.6, 0.15), [cx - Math.cos(ca) * 0.7, cy - 0.2, cz - Math.sin(ca) * 0.7], [0, Math.PI / 2 - ca, 0]);
    return pw;
  });
  group.add(w.mesh, b.build());
  // Ninfeias.
  const pads: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (let k = 0; k < 40; k++) {
    const t = rnd() * Math.PI * 2;
    const r = lakeRadiusAt(t) * (0.45 + rnd() * 0.45);
    pads.push({ x: LAKE.x + Math.cos(t) * r, y: -0.55, z: LAKE.z + Math.sin(t) * r, s: 1.6, color: k % 5 === 0 ? '#F9A8D4' : '#4D9E57' });
  }
  group.add(shrubs(kit, pads, 'flower'));
  return { group, water: w, ponds };
}

/* ---------- Vegetação por região ---------- */

function plants(): Plant[] {
  const pts = treePositions(1250);
  return pts.map((p, i) => {
    const a = Math.atan2(p.x, -p.z);
    const r = Math.hypot(p.x, p.z);
    const central = r < 60;
    const north = Math.abs(a) < Math.PI / 4;
    const east = a > Math.PI / 4 && a < (3 * Math.PI) / 4;
    const west = a < -Math.PI / 4 && a > (-3 * Math.PI) / 4;
    const pool: TreeSpecies[] = central
      ? ['palm', 'round', 'palm', 'blossom']
      : north
        ? ['slender', 'round', 'round', 'palm', 'slender', 'conifer']
        : west
          ? ['palm', 'round', 'slender', 'round', 'blossom']
          : east
            ? ['round', 'blossom', 'slender']
            : ['blossom', 'round', 'palm', 'round'];
    return { x: p.x, y: heightAt(p.x, p.z), z: p.z, s: p.s * (r > PARK_RADIUS ? 1.3 : 1), species: pool[i % pool.length]! };
  });
}

function meadows(kit: Kit): THREE.Object3D[] {
  const rnd = seededRandom(17);
  const flowers: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  const bushes: typeof flowers = [];
  const pathPts = parkPaths().flatMap((p) => samplePath(p.points, 6));
  const free = (x: number, z: number) =>
    Math.hypot(x, z) > PLAZA_RADIUS + 3 && !inWater(x, z, 3) && !PARK_BUILDINGS.some((b) => Math.hypot(x - b.x, z - b.z) < b.radius) && !pathPts.some((q) => Math.abs(q.x - x) < 3 && Math.abs(q.z - z) < 3);
  // Canteiros em manchas (mais no Oeste, o lado dos jardins).
  for (let k = 0; k < 70; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 30 + rnd() * (PARK_RADIUS - 40);
    const cx = Math.sin(a) * r;
    const cz = Math.cos(a) * r;
    const west = cz > 60; // Sul: jardins ornamentais com mais flores
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
  const plazaGroup = plaza(kit);
  root.add(p.group, lampPosts(kit, p.lamps), plazaGroup);
  const f = fountain(kit);
  f.group.scale.setScalar(1.7);
  root.add(f.group);
  const lk = lake(kit);
  root.add(lk.group);

  // Prédios.
  const buildings = new Map<ModuleId, PlacedBuilding>();
  const obstacles: Obstacle[] = [
    // Fonte: a bacia (baixa, a câmera passa por cima) e a escultura no meio.
    { x: 0, z: 0, r: 4 * 1.7, h: 1.6 },
    { x: 0, z: 0, r: 1.2, h: 9 },
  ];
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
    // Colisão pelo desenho do prédio (paredes, vidros, pilares), não por um círculo só.
    obstacles.push(...footprint(group, heightAt));
    void core;
  }
  const am = amenities(kit);
  const ww = walkway(kit, buildings.get('tasks')?.def, buildings.get('calendar')?.def);
  root.add(am.group, houses(kit), ww);
  // Barracas, quiosques, mesas, bancos, pérgolas, passarela, praça; postes e troncos das árvores.
  obstacles.push(...footprint(am.group, heightAt), ...footprint(ww, heightAt), ...footprint(plazaGroup, heightAt));
  for (const l of p.lamps) obstacles.push({ x: l.x, z: l.z, r: 0.25, h: heightAt(l.x, l.z) + 4.2 });

  const plantList = plants();
  const trees = forest(kit, plantList);
  for (const t of plantList) if (Math.hypot(t.x, t.z) < PARK_RADIUS + 30) obstacles.push({ x: t.x, z: t.z, r: 0.3 * t.s, h: (t.y ?? 0) + 3 });
  const meadow = meadows(kit);
  root.add(trees.group, ...meadow);
  // Luzes de fim de ano em volta da praça (só aparecem no evento).
  const festive = new THREE.InstancedMesh(kit.own(new THREE.SphereGeometry(0.22, 8, 6)), kit.own(new THREE.MeshBasicMaterial()), 120);
  {
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      m4.makeTranslation(Math.sin(a) * (PLAZA_RADIUS + 0.6), 1.2 + Math.sin(i * 0.9) * 0.15, Math.cos(a) * (PLAZA_RADIUS + 0.6));
      festive.setMatrixAt(i, m4);
      festive.setColorAt(i, c.set(['#F43F5E', '#FBBF24', '#22D3EE', '#A78BFA', '#34D399'][i % 5]!));
    }
  }
  festive.visible = false;
  root.add(festive);

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

  let weather: Sky = { ...CLEAR_SKY };
  const grey = () => Math.min(0.85, Math.max(weather.cloud * 0.55, weather.rain * 0.7, weather.fog * 0.6));
  const sunK = () => Math.max(0.3, 1 - weather.cloud * 0.4 - weather.rain * 0.25 - weather.fog * 0.3);
  const ms = mist(kit);
  root.add(ms.mesh);
  // Borboletas nos jardins (Sul, pérgola, praça, mirante do lago) e folhas caindo no outono ou com vento.
  const bf = butterflies(kit, [[-30, 150], [-15, 148], [40, 145], [-45, 135], [15, 20], [-18, -14], [-78, 70], [-8, -128], [5, 175]].map(([x, z]) => ({ x: x!, y: heightAt(x!, z!), z: z! })));
  const lv = leaves(kit);
  root.add(bf.mesh, lv.mesh);
  let season: Season = 'summer';
  let glowNow = 0;
  // Chão molhado: terreno, caminhos e praça ficam mais escuros e brilhantes com a chuva e secam devagar.
  const wetMats = [kit.mat('#ffffff', { vertexColors: true, rough: 0.95 }), kit.mat('#B8AE98', { rough: 0.9 }), kit.mat('#DCD3C0', { rough: 0.85 }), kit.mat('#C7B48E', { rough: 0.95 }), kit.mat('#E7E1D3', { rough: 0.85 })];
  const dry = wetMats.map((m) => ({ rough: m.roughness, color: m.color.clone() }));
  let wet = 0;
  let wetShown = -1;
  const skyTop = new THREE.Color();
  const skyBottom = new THREE.Color();
  const sunDir = new THREE.Vector3(...lightAt(12).sunDir).normalize();

  return {
    root,
    sun,
    hemi,
    buildings,
    obstacles,
    pickables: [...buildings.values()].map((b) => b.group),
    seats: am.seats,
    treeSpots: plantList,
    viewpoints: am.viewpoints,
    spots: am.spots,
    tick: (t, dt, focus, cam) => {
      f.tick(t);
      lk.water.tick(t * 0.6);
      lk.ponds.forEach((p) => p.tick(t * 0.8));
      ticks.forEach((fn) => fn(t));
      trees.tick(t, weather.wind);
      bd.tick(t);
      dr.tick(t);
      clouds.forEach((c, i) => {
        c.position.x += dt * (1.6 + (i % 3) * 0.5 + weather.wind * 9);
        if (c.position.x > 380) c.position.x = -380;
      });
      if (weather.rain > 0.02) rn.tick(dt, focus, weather.wind);
      ms.tick(focus, weather.fog, t);
      bf.tick(t, glowNow < 0.3 && weather.rain < 0.2 && weather.wind < 0.6);
      lv.tick(dt, t, focus, (season === 'autumn' ? 0.7 : 0) + Math.max(0, weather.wind - 0.45) * 1.4, weather.wind);
      wet += ((weather.rain > 0.1 ? 1 : 0) - wet) * Math.min(1, dt * (weather.rain > 0.1 ? 0.25 : 0.05));
      if (Math.abs(wet - wetShown) > 0.02) {
        wetShown = wet;
        wetMats.forEach((m, i) => {
          m.roughness = dry[i]!.rough * (1 - wet * 0.6);
          m.color.copy(dry[i]!.color).multiplyScalar(1 - wet * 0.22);
        });
      }
      // A sombra acompanha onde a câmera olha (um mapa de sombra pequeno e nítido).
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 200);
      for (const l of lodItems) l.obj.visible = Math.hypot(cam.x - l.x, cam.z - l.z) < l.far;
    },
    setLight: (l) => {
      glowNow = l.glow;
      skyTop.set(l.skyTop);
      skyBottom.set(l.skyBottom);
      const g = grey();
      if (g > 0) {
        skyTop.lerp(new THREE.Color('#5B6676'), g);
        skyBottom.lerp(new THREE.Color('#9AA5B4'), g);
      }
      sk.set(skyTop, skyBottom);
      sun.color.set(l.sun);
      sun.intensity = l.sunI * sunK();
      hemi.intensity = l.hemiI;
      sunDir.set(...l.sunDir).normalize();
      (st.material as THREE.PointsMaterial).opacity = l.glow * (1 - grey());
      kit.glowing.forEach((m) => (m.emissiveIntensity = 0.15 + l.glow * 1.6));
      setWaterNight(lk.water.mesh, l.glow * 0.8);
      f.waters.forEach((w) => setWaterNight(w, l.glow * 0.8));
      clouds.forEach((c) => (c.material as THREE.MeshStandardMaterial).color.set(g > 0 ? (l.glow > 0.5 ? '#2E3446' : '#AAB4C0') : l.glow > 0.5 ? '#3A4466' : '#FFFFFF'));
    },
    setWeather: (w) => {
      weather = w;
      rn.lines.visible = w.rain > 0.02;
      rn.setAmount(w.rain);
      bd.mesh.visible = w.rain < 0.2 && w.wind < 0.75 && w.fog < 0.6;
      clouds.forEach((c, i) => {
        c.visible = i < 4 + Math.round(w.cloud * 8);
        c.scale.setScalar(2.2 + w.cloud * 1.4);
      });
      setWaterWeather(lk.water.mesh, w.rain, w.wind);
      lk.ponds.forEach((p) => setWaterWeather(p.mesh, w.rain, w.wind));
      f.waters.forEach((m) => setWaterWeather(m, w.rain, w.wind));
    },

    setSeason: (s) => {
      season = s;
      // Cor das copas e das floradas pela estação (só visual).
      // Estações do Brasil, mantendo a identidade tropical: palmeiras e copas largas seguem verdes;
      // o ipê floresce amarelo no inverno, a primavera traz o lilás, o outono amarela as emergentes.
      const crowns: Record<Season, Partial<Record<TreeSpecies, string>>> = {
        spring: { round: '#58A851', conifer: '#2F7A4A', slender: '#6DB552', blossom: '#B794F4', palm: '#5DAF55' },
        summer: { round: '#4C9A4F', conifer: '#2F7A4A', slender: '#5FA34A', blossom: '#6FAF5A', palm: '#5DAF55' },
        autumn: { round: '#6E9B4A', conifer: '#3E7A4A', slender: '#B5A04A', blossom: '#C9A045', palm: '#6FA855' },
        winter: { round: '#5E8F55', conifer: '#3D6B50', slender: '#7E9A5C', blossom: '#F2C230', palm: '#5DAF55' },
      };
      trees.setSeason(crowns[s]);
      meadow[0]!.visible = s !== 'winter';
    },
    setFestive: (on) => {
      festive.visible = on;
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
