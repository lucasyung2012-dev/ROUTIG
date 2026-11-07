/**
 * O parque inteiro (V2): terreno, lago, caminhos, praça com a fonte ROUTIG, paisagismo por região,
 * os 18 prédios (detalhados os que já têm projeto; os demais com a forma provisória) e a vida do parque.
 * docs/V2-PARQUE-PLANO.md.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { LAKE, onPath, plazaCarts, PARK_BUILDINGS, PARK_RADIUS, PARK_SCALE, PATH_WIDTH, PLAZA_RADIUS, POIS, PONDS, entranceOf, facingOf, heightAt, inWater, inField, isFreeGround, lakeRadiusAt, parkPaths, samplePath, seededRandom, treePositions, type ParkBuilding, type Point } from '@/domain/park';
import { amenities, houses, neighborhood, sportsFields, streetTrees, type Seat, type Viewpoint } from './buildings/amenities';
import { Builder, Kit, signTexture, cloud, forest, setWaterNight, setWaterSky, setWaterWeather, shrubs, sky, stars, water, type Plant, type TreeSpecies } from './kit';
import { birds, butterflies, drone, fountain, leaves, rain } from './life';
import { playground } from './playground';
import { frame, roundBox, signBoard } from './props';
import { dashboardBuilding, inboxBuilding, profileBuilding, settingsBuilding, type DetailedBuilding } from './buildings/central';
import { academyBuilding, insightsBuilding, languagesBuilding, libraryBuilding, notesBuilding } from './buildings/north';
import { calendarBuilding, financeBuilding, projectsBuilding, tasksBuilding } from './buildings/east';
import { focusBuilding, goalsBuilding, habitsBuilding, musicBuilding, sportsBuilding } from './buildings/westsouth';
import { prototypeBuilding } from './buildings/prototype';
import type { Obstacle } from './camera';
import { footprint } from './collision';
import { upperFloors } from './buildings/upper';
import { FLOOR_PLANS } from './interiors/floors';
import { createGrass } from './grass';

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
  /** Anima o parquinho (balanços e gangorra). */
  play: (s: { swings: number[]; seesaw: number }) => void;
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
  const size = Math.round(PARK_RADIUS * 2 + 420);
  const seg = 230;
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
    const pick = r < 55 * PARK_SCALE ? base.central : Math.abs(a) < Math.PI / 4 ? base.north : a > 0 && a < (3 * Math.PI) / 4 ? base.east : a < 0 && a > (-3 * Math.PI) / 4 ? base.west : base.south;
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
    if (inField(l.x, l.z, 2) || inWater(l.x, l.z, 1.5) || PARK_BUILDINGS.some((bd) => Math.hypot(l.x - bd.x, l.z - bd.z) < bd.radius * 0.9)) continue;
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
  // Meio-fio rente ao chão (14 cm), fora da colisão: onde o gramado em volta fica mais baixo ele
  // contava como degrau alto e prendia quem andava; agora dá para passar em qualquer ponto da borda.
  const curbGeo = kit.own(new THREE.TorusGeometry(R + 0.1, 0.22, 6, 128));
  curbGeo.rotateX(-Math.PI / 2);
  curbGeo.scale(1, 0.4, 1);
  const curb = new THREE.Mesh(curbGeo, kit.mat('#D6D0C2'));
  curb.position.y = 0.05;
  curb.receiveShadow = true;
  curb.userData.noCollide = true;
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
    // Encosto inclinado para trás (para fora da praça) no eixo do próprio banco.
    const backrest = new THREE.BoxGeometry(2.6, 0.5, 0.1);
    backrest.rotateX(0.15);
    b.add(wood, backrest, [x + Math.sin(a) * 0.33, 0.8, z + Math.cos(a) * 0.33], [0, a, 0]);
    for (const s of [-1, 1]) b.add(metal, new THREE.BoxGeometry(0.1, 0.5, 0.55), [x + Math.cos(a) * s * 1.1, 0.25, z - Math.sin(a) * s * 1.1], [0, a, 0]);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.sin(a) * 21.5;
    const z = Math.cos(a) * 21.5;
    if (onPath(x, z, 2.7)) continue; // o canteiro (2,5 m de raio) não encosta em caminho nenhum
    b.add(kit.mat('#D9D2C3', { rough: 0.6 }), new THREE.CylinderGeometry(2.4, 2.5, 0.55, 32), [x, 0.3, z]);
    b.add(kit.mat('#5C8F48', { rough: 1 }), new THREE.CylinderGeometry(2.2, 2.2, 0.05, 32), [x, 0.6, z]);
  }
  // Carrinhos de pipoca e de água de coco (o vendedor fica do lado de dentro da praça).
  for (const c of plazaCarts()) cart(kit, b, c);
  const g = b.build();
  g.add(curb);
  return g;
}

/** Carrinho de vendedor: caixa com frisos, rodas raiadas, alça, guarda-sol listrado e a mercadoria. */
function cart(kit: Kit, b: Builder, c: { x: number; z: number; face: number; kind: 'popcorn' | 'coconut' }) {
  const put = frame(b, c.x, 0.06, c.z, c.face);
  const pop = c.kind === 'popcorn';
  const bodyM = kit.mat(pop ? '#C81E1E' : '#15803D', { rough: 0.4, metal: 0.15 });
  const trim = kit.mat('#F8FAFC', { rough: 0.5 });
  const steel = kit.mat('#B8BEC6', { metal: 0.85, rough: 0.25 });
  const tire = kit.mat('#1F2328', { rough: 0.7 });
  put(bodyM, roundBox(1.3, 0.62, 0.7, 0.05), 0, 0.3, 0);
  for (const yy of [0.33, 0.9]) put(trim, new THREE.BoxGeometry(1.34, 0.05, 0.74), 0, yy, 0);
  for (const s of [-1, 1]) {
    put(tire, new THREE.TorusGeometry(0.3, 0.04, 8, 24), s * 0.72, 0.34, 0, 0, Math.PI / 2);
    put(steel, new THREE.CylinderGeometry(0.04, 0.04, 0.1, 10), s * 0.72, 0.34, 0, 0, 0, Math.PI / 2);
    for (let k = 0; k < 6; k++) put(steel, new THREE.BoxGeometry(0.012, 0.56, 0.012), s * 0.72, 0.34, 0, (k / 6) * Math.PI);
  }
  put(steel, new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), 0, 0.15, 0.3);
  put(steel, new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), 0, 1.0, -0.45, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) put(steel, new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8), s * 0.5, 0.95, -0.38, Math.PI / 2);
  // Placa na frente, virada para quem passa.
  const tex = signTexture(kit, [pop ? 'PIPOCA' : 'ÁGUA DE COCO', pop ? 'doce e salgada' : 'gelada'], { bg: pop ? '#FEF3C7' : '#ECFCCB', fg: pop ? '#991B1B' : '#14532D', accent: pop ? '#DC2626' : '#16A34A', w: 512, h: 256 });
  signBoard(b, kit, tex, c.x + Math.sin(c.face) * 0.37, 0.7, c.z + Math.cos(c.face) * 0.37, c.face, 0.9, 0.4);
  if (pop) {
    // Vitrine de vidro com a pipoca dentro, panela de estourar e saquinhos de papel.
    const glass = kit.mat('#E0F2FE', { glass: true });
    put(glass, new THREE.BoxGeometry(1.0, 0.62, 0.56), 0, 1.24, 0);
    for (const [w, hh, d, x, y, z] of [[1.02, 0.03, 0.03, 0, 0.93, 0.28], [1.02, 0.03, 0.03, 0, 0.93, -0.28], [1.02, 0.03, 0.03, 0, 1.55, 0.28], [1.02, 0.03, 0.03, 0, 1.55, -0.28], [0.03, 0.64, 0.03, 0.5, 1.24, 0.28], [0.03, 0.64, 0.03, -0.5, 1.24, 0.28], [0.03, 0.64, 0.03, 0.5, 1.24, -0.28], [0.03, 0.64, 0.03, -0.5, 1.24, -0.28]] as const)
      put(bodyM, new THREE.BoxGeometry(w, hh, d), x, y, z);
    const corn = kit.mat('#FFF3C4', { rough: 0.9 });
    for (let k = 0; k < 60; k++) put(corn, new THREE.IcosahedronGeometry(0.03 + (k % 3) * 0.008, 0), -0.42 + ((k * 37) % 84) / 100, 0.98 + ((k * 13) % 9) / 60, -0.22 + ((k * 23) % 44) / 100, k, k * 2, 0);
    put(steel, new THREE.CylinderGeometry(0.12, 0.1, 0.16, 16), 0.15, 1.4, 0);
    put(steel, new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.15, 1.48, 0, 0, 0, 0, [1, 0.4, 1]);
    put(kit.mat('#FFE7B0', { glow: true }), new THREE.BoxGeometry(0.9, 0.02, 0.04), 0, 1.53, 0);
    for (let k = 0; k < 5; k++) put(trim, new THREE.BoxGeometry(0.1, 0.16, 0.06), 0.56, 0.98 + k * 0.004, -0.2 + k * 0.08, 0, 0.1 * k);
  } else {
    // Bandeja com cocos verdes empilhados, alguns abertos com canudo, e a caixa térmica.
    put(kit.mat('#8B6545', { rough: 0.8 }), new THREE.BoxGeometry(0.9, 0.05, 0.6), -0.15, 0.95, 0);
    const coco = [kit.mat('#5B8C2A', { rough: 0.6 }), kit.mat('#7BA33A', { rough: 0.6 })];
    let k = 0;
    for (let layer = 0; layer < 3; layer++)
      for (let i = 0; i < 4 - layer; i++)
        for (let j = 0; j < 3 - layer; j++) put(coco[k++ % 2]!, new THREE.SphereGeometry(0.1, 12, 10), -0.45 + i * 0.2 + layer * 0.1, 1.07 + layer * 0.16, -0.2 + j * 0.2 + layer * 0.1, 0, k, 0, [1, 1.15, 1]);
    for (const x of [0.12, 0.28]) {
      put(coco[0]!, new THREE.SphereGeometry(0.1, 12, 10), x, 1.07, 0.22, 0, 0, 0, [1, 1.1, 1]);
      put(trim, new THREE.CircleGeometry(0.05, 12), x, 1.185, 0.22, -Math.PI / 2);
      put(kit.mat('#EC4899', { rough: 0.5 }), new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6), x + 0.02, 1.27, 0.22, 0, 0, -0.2);
    }
    put(kit.mat('#F8FAFC', { rough: 0.4 }), roundBox(0.34, 0.3, 0.4, 0.03), 0.4, 0.95, -0.05);
    put(kit.mat('#2563EB', { rough: 0.4 }), roundBox(0.36, 0.05, 0.42, 0.03), 0.4, 1.25, -0.05);
  }
  // Guarda-sol de gomos alternados.
  put(steel, new THREE.CylinderGeometry(0.022, 0.022, 1.7, 8), 0, 1.75, -0.3);
  const cols = pop ? ['#DC2626', '#F8FAFC'] : ['#16A34A', '#FACC15'];
  for (let k = 0; k < 8; k++) put(kit.mat(cols[k % 2]!, { rough: 0.7, side: THREE.DoubleSide }), new THREE.ConeGeometry(1.05, 0.38, 2, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4), 0, 2.72, -0.3);
  put(steel, new THREE.SphereGeometry(0.04, 8, 6), 0, 2.93, -0.3);
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
function shapeWater(kit: Kit, color: string, radiusAt: (a: number) => number): ReturnType<typeof water> {
  return water(kit, radiusAt, color);
}

function lake(kit: Kit): { group: THREE.Group; water: ReturnType<typeof water>; ponds: Array<ReturnType<typeof water>> } {
  const group = new THREE.Group();
  const w = shapeWater(kit, '#1F6E9E', lakeRadiusAt);
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
  // Pedras e margens naturais: pedras arredondadas e irregulares em grupos, juncos em trechos.
  const rnd = seededRandom(9);
  const rockMat2 = kit.mat('#7D7468', { rough: 0.95 });
  const rock = (size: number) => {
    const g = new THREE.DodecahedronGeometry(size, 1);
    const p = g.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const f = 0.78 + rnd() * 0.36;
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.62, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  };
  for (let k = 0; k < 46; k++) {
    const t = rnd() * Math.PI * 2;
    for (let j = 0; j < 2 + Math.floor(rnd() * 3); j++) {
      const tt = t + (rnd() - 0.5) * 0.06;
      const r = lakeRadiusAt(tt) - 0.4 + rnd() * 2.6;
      b.add(rnd() > 0.5 ? rockMat : rockMat2, rock(0.35 + rnd() * 0.9), [LAKE.x + Math.cos(tt) * r, -0.15 + rnd() * 0.2, LAKE.z + Math.sin(tt) * r], [0, rnd() * 6, 0]);
    }
  }
  // Juncos e capim alto em trechos da margem (vegetação próxima da água).
  const reedSpots: Array<{ x: number; z: number; h: number }> = [];
  for (let k = 0; k < 26; k++) {
    const t = rnd() * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(t - 0.9), Math.cos(t - 0.9))) < 0.25) continue;
    for (let j = 0; j < 14; j++) {
      const tt = t + (rnd() - 0.5) * 0.08;
      const r = lakeRadiusAt(tt) - 1.5 + rnd() * 2.2;
      reedSpots.push({ x: LAKE.x + Math.cos(tt) * r, z: LAKE.z + Math.sin(tt) * r, h: 0.9 + rnd() * 1.1 });
    }
  }
  const reedGeo = kit.own(new THREE.ConeGeometry(0.03, 1, 4));
  reedGeo.translate(0, 0.5, 0);
  const reeds = new THREE.InstancedMesh(reedGeo, kit.mat('#6E8F46', { rough: 0.9 }), reedSpots.length);
  const rm = new THREE.Matrix4();
  reedSpots.forEach((p, i) => {
    rm.compose(new THREE.Vector3(p.x, -0.5, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25)), new THREE.Vector3(1, p.h, 1));
    reeds.setMatrixAt(i, rm);
  });
  group.add(reeds);

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
  const pts = treePositions(2800);
  return pts.map((p, i) => {
    const a = Math.atan2(p.x, -p.z);
    const r = Math.hypot(p.x, p.z);
    const central = r < 60 * PARK_SCALE;
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
  const put = (list: typeof flowers, x: number, z: number, s: number, color: string, pad = 0.4) => {
    if (isFreeGround(x, z, pad)) list.push({ x, y: heightAt(x, z), z, s, color });
  };
  // Jardins de frente de cada prédio (V2.1, 6.2): duas fileiras de flores e uma de arbustos
  // acompanhando o lote, abrindo espaço para a entrada.
  const palettes = [['#F472B6', '#FBBF24', '#FFFFFF'], ['#C084FC', '#FDE68A', '#FFFFFF'], ['#F87171', '#FBBF24', '#FDBA74'], ['#60A5FA', '#FFFFFF', '#F9A8D4']];
  PARK_BUILDINGS.forEach((b, bi) => {
    const face = facingOf(b);
    const pal = palettes[bi % palettes.length]!;
    for (let a = -1.25; a <= 1.25; a += 0.045) {
      if (Math.abs(a) < 0.22) continue;
      const ang = face + a;
      for (let row = 0; row < 2; row++) {
        const rr = b.radius * 0.94 + 0.6 + row * 0.9;
        put(flowers, b.x + Math.sin(ang) * rr, b.z + Math.cos(ang) * rr, 1.1, pal[(row + Math.floor(a * 10)) % pal.length]!, 0.2);
      }
    }
    for (let a = -1.3; a <= 1.3; a += 0.13) {
      if (Math.abs(a) < 0.26) continue;
      const ang = face + a;
      const rr = b.radius * 0.94 + 3.2;
      put(bushes, b.x + Math.sin(ang) * rr, b.z + Math.cos(ang) * rr, 0.75 + rnd() * 0.3, rnd() > 0.5 ? '#3E8E4A' : '#4F9F55', 0.3);
    }
  });
  // Jardins ornamentais do Sul (canteiros quadrados com flores em linhas e arbustos nos cantos).
  for (const c of [POIS.find((p) => p.id === 'pergola-sul')!, POIS.find((p) => p.id === 'cafe-sul')!]) {
    for (const [dx, dz] of [[-16, -6], [16, -6], [-16, 10], [16, 10]] as const) {
      const cx = c.x + dx;
      const cz = c.z + dz;
      const pal = palettes[Math.abs(dx + dz) % palettes.length]!;
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) put(flowers, cx - 3 + i, cz - 3 + j, 1.15, pal[(i + j) % pal.length]!, 0.2);
      for (const [ex, ez] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) put(bushes, cx + ex, cz + ez, 0.9, '#3E8E4A', 0.2);
    }
  }
  // Moitas soltas de vegetação nativa (só em chão livre, longe dos caminhos).
  for (let k = 0; k < 260; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 40 + rnd() * (PARK_RADIUS - 50);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    for (let i = 0; i < 3; i++) put(bushes, x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3, 0.7 + rnd() * 0.8, rnd() > 0.5 ? '#3E8E4A' : '#5A9A50', 1.5);
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
  // Parquinho (os brinquedos que mexem seguem as crianças).
  const pg = playground(kit);
  pg.group.updateMatrixWorld(true);
  root.add(p.group, lampPosts(kit, p.lamps), plazaGroup, pg.group);
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
  const lodItems: Array<{ obj: THREE.Object3D; x: number; z: number; far: number; base?: number; invert?: boolean }> = [];
  // Lounges dos elevadores e as calçadas até eles: sem árvore nem moita em cima.
  const clearZones: Array<{ x: number; z: number; r: number }> = [];
  const liftWalk = new Builder();
  for (const def of PARK_BUILDINGS) {
    const make = DETAILED[def.id];
    let group: THREE.Group;
    let top: number;
    let core: number;
    if (make) {
      const d = make(kit);
      group = d.group;
      top = d.top;
      // Os andares de cima por fora, iguais aos de dentro (seção 10).
      const fc = facingOf(def);
      const toWorld = (lx: number, lz: number): Point => ({ x: def.x + lx * Math.cos(fc) + lz * Math.sin(fc), z: def.z - lx * Math.sin(fc) + lz * Math.cos(fc) });
      const gy = heightAt(def.x, def.z);
      const body = bodyRadius(d.group);
      const levels = FLOOR_PLANS[def.id]?.length ?? 0;
      // Torre do elevador e lounge no lado livre e mais plano do prédio, com calçada até o caminho.
      const spot = liftSpot(def, Math.max(6, Math.min(d.core * 0.82, body)), toWorld);
      if (levels > 0) liftAccess(spot, clearZones, liftWalk, kit.mat('#D8D1C3', { rough: 0.85 }));
      const up = upperFloors(kit, def.id, levels, d.top - 2, d.core, def.color, body, (lx, lz) => !onPath(toWorld(lx, lz).x, toWorld(lx, lz).z, 0.6), {
        angle: spot.angle,
        ground: (lx, lz) => {
          const p = toWorld(lx, lz);
          return heightAt(p.x, p.z) - gy;
        },
      });
      d.group.add(up.group);
      // Fachada peça a peça de perto; de longe, o mesmo volume e as mesmas cores, mais leve.
      if (up.near && up.far) lodItems.push({ obj: up.near, x: def.x, z: def.z, far: 240, base: 240 }, { obj: up.far, x: def.x, z: def.z, far: 240, base: 240, invert: true });
      top = up.top;
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
  root.add(liftWalk.build());
  const am = amenities(kit);
  const ww = walkway(kit, buildings.get('tasks')?.def, buildings.get('calendar')?.def);
  const fields = sportsFields(kit);
  const hood = neighborhood(kit);
  ticks.push(hood.tick);
  root.add(am.group, houses(kit), ww, fields, hood.group);
  obstacles.push(...footprint(fields, heightAt));
  // Barracas, quiosques, mesas, bancos, pérgolas, passarela, praça; postes e troncos das árvores.
  obstacles.push(...footprint(am.group, heightAt), ...footprint(ww, heightAt), ...footprint(plazaGroup, heightAt), ...footprint(pg.solid, heightAt));
  for (const l of p.lamps) obstacles.push({ x: l.x, z: l.z, r: 0.25, h: heightAt(l.x, l.z) + 4.2 });

  // Árvores do parque e as da calçada do bairro (copas redondas e esguias alternadas).
  const plantList = [...plants().filter((p) => !onPath(p.x, p.z, 0.9 * p.s) && !clearZones.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.r + p.s)), ...streetTrees().map((p, i) => ({ x: p.x, y: heightAt(p.x, p.z), z: p.z, s: p.s, species: (i % 3 ? 'round' : 'slender') as Plant['species'] }))];
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

  // Nuvens: seis formas em instâncias (uma chamada de desenho por forma) e 42 nuvens espalhadas
  // pelo céu, em alturas, tamanhos e velocidades diferentes.
  const crnd = seededRandom(31);
  const cloudSpots = Array.from({ length: 42 }, () => ({ x: -620 + crnd() * 1240, y: 85 + crnd() * 65, z: -540 + crnd() * 1080, s: 1.5 + crnd() * 2.3, sy: 0.7 + crnd() * 0.5, r: crnd() * 6, v: 1.3 + crnd() * 1.5 }));
  const clouds = Array.from({ length: 6 }, (_, k) => {
    const src = cloud(kit, k + 1);
    const im = new THREE.InstancedMesh(src.geometry, src.material, 7);
    im.frustumCulled = false;
    root.add(im);
    return im;
  });
  const cM = new THREE.Matrix4();
  const cQ = new THREE.Quaternion();
  const cV = new THREE.Vector3();
  const cS = new THREE.Vector3();
  const cUp = new THREE.Vector3(0, 1, 0);
  const placeClouds = () => {
    cloudSpots.forEach((c, i) => clouds[i % 6]!.setMatrixAt(Math.floor(i / 6), cM.compose(cV.set(c.x, c.y, c.z), cQ.setFromAxisAngle(cUp, c.r), cS.set(c.s, c.s * c.sy, c.s))));
    clouds.forEach((m) => (m.instanceMatrix.needsUpdate = true));
  };
  placeClouds();
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
  // Grama em volta de quem anda: só em gramados, fora de caminhos, praça, água, lotes, quadras e convivência.
  const gr = createGrass(kit, heightAt, (x, z) => {
    if (!isFreeGround(x, z, 0.2)) return false;
    // Gramados em manchas (como um gramado de verdade, não grama alta em todo lugar).
    const n = Math.sin(x * 0.045) + Math.sin(z * 0.052 + 1.3) + Math.sin((x + z) * 0.027 + 0.4);
    return n > -0.4;
  });
  root.add(gr.mesh);
  root.add(ms.mesh);
  // Borboletas nos jardins (Sul, pérgola, praça, mirante do lago) e folhas caindo no outono ou com vento.
  const bf = butterflies(kit, [[-30, 150], [-15, 148], [40, 145], [-45, 135], [15, 20], [-18, -14], [-78, 70], [-8, -128], [5, 175]].map(([x, z]) => ({ x: x! * PARK_SCALE, y: heightAt(x! * PARK_SCALE, z! * PARK_SCALE), z: z! * PARK_SCALE })));
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
    // Todos os bancos do parque servem para sentar (inclusive os da praça).
    seats: [...am.seats, ...plazaSeats(), ...pg.seats],
    play: pg.tick,
    treeSpots: plantList,
    viewpoints: am.viewpoints,
    spots: am.spots,
    tick: (t, dt, focus, cam) => {
      f.tick(t);
      lk.water.tick(t * 0.6);
      lk.ponds.forEach((p) => p.tick(t * 0.8));
      ticks.forEach((fn) => fn(t));
      trees.tick(t, weather.wind, cam);
      bd.tick(t);
      dr.tick(t);
      for (const c of cloudSpots) {
        c.x += dt * (c.v + weather.wind * 9);
        if (c.x > 640) c.x = -640;
      }
      if (dt > 0) placeClouds();
      if (weather.rain > 0.02) rn.tick(dt, focus, weather.wind);
      ms.tick(focus, weather.fog, t);
      gr.tick(cam, t, weather.wind);
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
      for (const l of lodItems) l.obj.visible = Math.hypot(cam.x - l.x, cam.z - l.z) < l.far !== !!l.invert;
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
      // Céu e sol refletidos em todas as águas.
      for (const m of [lk.water.mesh, ...lk.ponds.map((p) => p.mesh), ...f.waters]) {
        setWaterNight(m, l.glow * 0.8);
        setWaterSky(m, skyTop, skyBottom, sunDir, sun.color);
      }
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
      gr.setDensity(q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1);
      trees.setCount(q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1);
      bd.mesh.visible = q !== 'low';
      dr.group.visible = q !== 'low';
      clouds.forEach((c, i) => (c.visible = q === 'high' || i % 2 === 0));
      const far = q === 'low' ? 0.6 : 1;
      lodItems.forEach((l) => (l.far = (l.base ?? (l.obj instanceof THREE.InstancedMesh ? 150 : 190)) * far));
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

/** Assentos dos bancos da praça (mesmas posições do desenho da praça). */
function plazaSeats(): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < 16; i += 2) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    out.push({ x: Math.sin(a) * 17.2, y: 0.56, z: Math.cos(a) * 17.2, face: a + Math.PI });
  }
  return out;
}

/**
 * Raio do corpo do prédio do térreo (paredes e volumes acima de 4,5 m, sem postes, plantas nem o
 * piso do lote): os andares de cima apoiam sobre ele em vez de virar uma marquise solta.
 */
/**
 * Lado do prédio para a torre do elevador: fora de caminho, água, outros prédios e mirantes, no
 * chão mais plano; de preferência nos fundos. Devolve o ângulo (local do prédio, 0 = frente), o
 * centro do lounge e a porta do pavilhão (no mundo).
 */
function liftSpot(def: ParkBuilding, r0: number, toWorld: (lx: number, lz: number) => Point): { angle: number; pad: Point; door: Point } {
  const at = (a: number, rr: number, side: number) => toWorld(Math.sin(a) * rr + Math.cos(a) * side, Math.cos(a) * rr - Math.sin(a) * side);
  let best = { angle: Math.PI, score: Infinity };
  for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75]) {
    const a = Math.PI + da;
    let score = Math.abs(da) * 4;
    const hs: number[] = [];
    for (const rr of [r0 + 6.4, r0 + 3.4, r0 + 1, r0 - 3.5])
      for (const side of [-5, -2.5, 0, 2.5, 5]) {
        const p = at(a, rr, side);
        hs.push(heightAt(p.x, p.z));
        if (onPath(p.x, p.z, 1)) score += 40;
        if (inWater(p.x, p.z, 3)) score += 100;
        if (PARK_BUILDINGS.some((o) => o.id !== def.id && Math.hypot(o.x - p.x, o.z - p.z) < o.radius * 0.95 + 3)) score += 100;
        if (POIS.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 9)) score += 30;
        if (inField(p.x, p.z, 2)) score += 100;
      }
    score += (Math.max(...hs) - Math.min(...hs)) * 6;
    if (score < best.score) best = { angle: a, score };
  }
  const a = best.angle;
  return { angle: a, pad: at(a, r0 + 1, 0), door: at(a, r0 + 2.2, -4.8) };
}

/** Calçada de placas de pedra da porta do lounge até o caminho mais perto (sem passar por água). */
function liftAccess(spot: { pad: Point; door: Point }, zones: Array<{ x: number; z: number; r: number }>, b: Builder, pave: THREE.Material) {
  zones.push({ x: spot.pad.x, z: spot.pad.z, r: 8 });
  let target: Point | null = null;
  for (let r = 1; r < 45 && !target; r += 1)
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const x = spot.door.x + Math.cos(a) * r;
      const z = spot.door.z + Math.sin(a) * r;
      if (onPath(x, z)) {
        target = { x, z };
        break;
      }
    }
  if (!target) return;
  const dx = target.x - spot.door.x;
  const dz = target.z - spot.door.z;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.floor(len / 1.3));
  const ry = Math.atan2(dx, dz);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = spot.door.x + dx * t;
    const z = spot.door.z + dz * t;
    if (inWater(x, z, 0.5)) return;
    zones.push({ x, z, r: 1.6 });
    b.add(pave, new THREE.BoxGeometry(2.0, 0.12, 1.05), [x, heightAt(x, z) + 0.03, z], [0, ry, 0]);
  }
}

function bodyRadius(g: THREE.Object3D): number {
  g.updateMatrixWorld(true);
  const rs: number[] = [];
  const v = new THREE.Vector3();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
    const pos = m.geometry.attributes.position;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 600));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.y > 4.5) rs.push(Math.hypot(v.x, v.z));
    }
  });
  if (!rs.length) return Infinity;
  rs.sort((a, b) => a - b);
  return rs[Math.floor(rs.length * 0.7)]!;
}
