/**
 * Interiores das regiões Oeste e Sul: Jardim da Concentração (Focus), Estufa de Hábitos, Centro de
 * Objetivos (Goals), Conservatório Musical e Centro Esportivo. O térreo de cada um segue a lista da
 * especificação (seções 21 a 26), ambiente por ambiente, dentro da planta do prédio (massing.ts):
 * cada ambiente com mobília e acabamento próprios e a placa com o nome. Os objetos principais dos
 * ambientes que têm função abrem o painel real do setor (toque); os outros são só ambiente. O eixo
 * da entrada (x = 0) fica livre, com pelo menos 2,4 m, até o lounge dos elevadores nos fundos.
 * Placas levam os nomes reais dos hábitos, metas, instrumentos e modalidades; nenhum número inventado.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { Builder, type Kit } from '../kit';
import { canvasPlane, createRoom, finishRoom, markAction, markSector, pendants, sectorGroup, sectorSign, sectorView, setAnchor, setDetailCommon, wallSpots, zoneLabel, type ActionSpot, type InteriorScene, type Room, type ZoneKey } from './common';
import { MASSING, groundHeight } from '../massing';
import { inVol } from '../outline';
import type { Placed } from './central';
import { nameBoard } from './north';
import { groundSeats, placeSeats, seatAt, staffSeats } from './east';
import type { Obstacle } from '../camera';
import { inLiftCore, inWell, liftCore, liftKeep, stairOf } from '../stairs';
import { stairRoute, stairWays } from './floors';

export interface NamesData {
  names: string[];
}

/**
 * Canteiro da Estufa (seção 28), já traduzido pelo ParkPage: o hábito de hoje (`id` do hábito, ou
 * 'more' no canteiro do "+N"), o nome, a linha de estado, feito hoje e a cor do hábito.
 */
export interface HabitBedView {
  id: string;
  name: string;
  line: string;
  done: boolean;
  color: string;
}

export interface HabitsRoomData {
  beds?: HabitBedView[];
  /** Movimento reduzido: o canteiro floresce sem animação. */
  still?: boolean;
}

type V3 = [number, number, number];
type Mat = THREE.Material;
type Board = ReturnType<typeof nameBoard>;

const CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

/* ---------- Peças de um ambiente (coordenadas locais; frente = +z local) ---------- */

interface Spot {
  at: (lx: number, y: number, lz: number) => V3;
  add: (m: Mat, g: THREE.BufferGeometry, lx: number, y: number, lz: number, rot?: number, sc?: V3) => void;
  /** Anota um assento em (lx, lz), altura do assento `y`, com quem senta olhando para `face` (no sistema do ambiente). */
  seat: (lx: number, y: number, lz: number, face: number) => void;
}

/** Ambiente em (x, z), de frente para `ry` (ângulo em y; 0 = +z). */
function spot(b: Builder, x: number, z: number, ry: number): Spot {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx: number, y: number, lz: number): V3 => [x + lx * c + lz * s, y, z - lx * s + lz * c];
  return {
    at,
    add: (m, g, lx, y, lz, rot = 0, sc) => {
      b.add(m, g, at(lx, y, lz), [0, ry + rot, 0], sc);
    },
    seat: (lx, y, lz, face) => {
      const [wx, , wz] = at(lx, y, lz);
      seatAt(b, wx, y, wz, ry + face);
    },
  };
}

/** Peça dentro de um ambiente, em (lx, lz) e girada `rot` em relação a ele. */
function sub(p: Spot, lx: number, lz: number, rot: number): Spot {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const loc = (a: number, w: number): [number, number] => [lx + a * c + w * s, lz - a * s + w * c];
  return {
    at: (a, y, w) => {
      const [u, v] = loc(a, w);
      return p.at(u, y, v);
    },
    add: (m, g, a, y, w, r = 0, sc) => {
      const [u, v] = loc(a, w);
      p.add(m, g, u, y, v, rot + r, sc);
    },
    seat: (a, y, w, face) => {
      const [u, v] = loc(a, w);
      p.seat(u, y, v, rot + face);
    },
  };
}

/** Grupo tocável de um setor em (x, z), de frente para `face`; as peças vão em `draw` (coordenadas do grupo). */
function sectorAt(scene: THREE.Scene, id: string, x: number, z: number, face: number, draw: (p: Spot, g: THREE.Group) => void): THREE.Group {
  const g = sectorGroup(id, x, z, face);
  const sb = new Builder();
  draw(spot(sb, 0, 0, 0), g);
  g.add(sb.build());
  placeSeats(scene, sb, x, z, face);
  markSector(g, id);
  scene.add(g);
  return g;
}

interface Pal {
  wood: Mat;
  wood2: Mat;
  dark: Mat;
  metal: Mat;
  fabric: Mat;
  fabric2: Mat;
  white: Mat;
  stone: Mat;
  paper: Mat;
  leaf: Mat;
  leaf2: Mat;
  leaf3: Mat;
  soil: Mat;
  bark: Mat;
  glow: Mat;
  warm: Mat;
  glass: Mat;
  rug: Mat;
  clay: Mat;
}

function palette(kit: Kit, c: { wood: string; wood2: string; fabric: string; fabric2: string; stone: string; accent: string; rug: string }): Pal {
  return {
    wood: kit.mat(c.wood, { rough: 0.65 }),
    wood2: kit.mat(c.wood2, { rough: 0.7 }),
    dark: kit.mat('#2B3442', { rough: 0.5, metal: 0.3 }),
    metal: kit.mat('#9AA6B5', { metal: 0.85, rough: 0.3 }),
    fabric: kit.mat(c.fabric, { rough: 0.95 }),
    fabric2: kit.mat(c.fabric2, { rough: 0.95 }),
    white: kit.mat('#F4F1EA', { rough: 0.5 }),
    stone: kit.mat(c.stone, { rough: 0.85 }),
    paper: kit.mat('#FBF8F1', { rough: 0.9 }),
    leaf: kit.mat('#4C9A4F', { rough: 0.9 }),
    leaf2: kit.mat('#6BAA4E', { rough: 0.9 }),
    leaf3: kit.mat('#3E7F44', { rough: 0.9 }),
    soil: kit.mat('#5A4030', { rough: 1 }),
    bark: kit.mat('#6B4A33', { rough: 0.9 }),
    glow: kit.mat(c.accent, { glow: true }),
    warm: kit.mat('#FFE9C2', { glow: true }),
    glass: kit.mat('#DDF1EE', { glass: true, side: THREE.DoubleSide }),
    rug: kit.mat(c.rug, { rough: 1 }),
    clay: kit.mat('#B5653F', { rough: 0.85 }),
  };
}

/* ---------- Mobília ---------- */

function table(p: Spot, top: Mat, leg: Mat, lx: number, lz: number, w: number, d: number, h = 0.75) {
  p.add(top, new THREE.BoxGeometry(w, 0.05, d), lx, h - 0.025, lz);
  for (const [a, c] of CORNERS) p.add(leg, new THREE.BoxGeometry(0.05, h - 0.05, 0.05), lx + a * (w / 2 - 0.08), (h - 0.05) / 2, lz + c * (d / 2 - 0.08));
}

/** Cadeira virada para `face` (0 = +z do ambiente). */
function chair(p: Spot, seat: Mat, leg: Mat, lx: number, lz: number, face: number) {
  const c = sub(p, lx, lz, face);
  c.add(seat, new THREE.BoxGeometry(0.46, 0.06, 0.44), 0, 0.46, 0);
  c.add(seat, new THREE.BoxGeometry(0.46, 0.44, 0.05), 0, 0.73, -0.2);
  for (const [a, w] of CORNERS) c.add(leg, new THREE.CylinderGeometry(0.018, 0.018, 0.43, 5), a * 0.2, 0.215, w * 0.18);
  c.seat(0, 0.45, 0, 0);
}

/**
 * Balcão de recepção de cada prédio do oeste/sul (centro, virado para quem chega: `face`) e o
 * recuo (m) da cadeira de quem atende, atrás dele (no -z do balcão), de frente para o visitante.
 */
export const RECEPTION_DESKS = {
  focus: { x: 2.9, z: 14.5, face: -Math.PI / 2, back: 0.95 },
  habits: { x: 2.9, z: 12.2, face: -Math.PI / 2, back: 0.95 },
  goals: { x: 4.6, z: 11.4, face: -Math.PI / 2, back: 0.95 },
  music: { x: 4.4, z: 9.6, face: -Math.PI / 2, back: 0.95 },
  sports: { x: 3.3, z: 13.8, face: -Math.PI / 2, back: 0.6 },
} as const;
export type ReceptionId = keyof typeof RECEPTION_DESKS;

/** Onde fica (no sistema do prédio) a cadeira da recepção e para onde olha quem senta nela. */
export function receptionChairAt(id: ReceptionId): { x: number; z: number; face: number } {
  const d = RECEPTION_DESKS[id];
  return { x: d.x - d.back * Math.sin(d.face), z: d.z - d.back * Math.cos(d.face), face: d.face };
}

/** Folga (m) da cadeira da recepção até a chegada à escada e a rota até ela (a mesma do balcão do enrich.ts). */
export const RECEPTION_WAY_GAP = 1.6;

/**
 * A cadeira da recepção em (x, z) do térreo não atrapalha a circulação: fora do vão da escada (com
 * 0,9 m), do núcleo dos elevadores (0,3 m) e do retângulo livre do hall (liftKeep, mais 0,3 m), e a
 * `RECEPTION_WAY_GAP` m ou mais de cada ponto de chegada à escada (stairWays) e da rota até ela (stairRoute).
 */
export function receptionChairClear(id: ModuleId, x: number, z: number): boolean {
  const st = stairOf(id);
  const core = liftCore(id);
  if (inWell(st, x, z, 0.9) || inLiftCore(core, x, z, 0.3)) return false;
  if (core) {
    const k = liftKeep(core);
    if (x > k.x0 - 0.3 && x < k.x1 + 0.3 && z > k.z0 - 0.3 && z < k.z1 + 0.3) return false;
  }
  const far = (pts: ReadonlyArray<readonly [number, number]>) => pts.every(([px, pz]) => Math.hypot(px - x, pz - z) >= RECEPTION_WAY_GAP);
  return far(stairWays(id, 0)) && far(stairRoute(id, 0));
}

/**
 * Cadeira de escritório de quem atende, atrás do balcão `p` (o ambiente do balcão, frente = +z), de
 * frente para o visitante: o assento é da recepcionista (staffSeats) e entra um obstáculo pequeno.
 * Fora dela se cair no caminho da escada (receptionChairClear).
 */
function receptionChair(id: ReceptionId, p: Spot, m: Pal, obs: Obstacle[]): void {
  const c = receptionChairAt(id);
  if (!receptionChairClear(id, c.x, c.z)) return;
  staffSeats(() => chair(p, m.fabric, m.dark, 0, -RECEPTION_DESKS[id].back, 0));
  obs.push({ x: c.x, z: c.z, r: 0.3, h: 0.95 });
}

/** Tampo baixo de trabalho do lado de dentro do balcão (largura `w`), com o vão das pernas aberto para a cadeira. */
function deskTop(p: Spot, top: Mat, side: Mat, w: number) {
  p.add(top, new THREE.BoxGeometry(w, 0.05, 0.45), 0, 0.76, -0.62);
  for (const s of [-1, 1]) p.add(side, new THREE.BoxGeometry(0.04, 0.74, 0.45), s * (w / 2 - 0.02), 0.37, -0.62);
}

/** Banqueta (assento na altura `h`); quem senta olha para `face`. */
function stool(p: Spot, seat: Mat, leg: Mat, lx: number, lz: number, h = 0.66, face = 0) {
  p.add(seat, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), lx, h, lz);
  p.seat(lx, h, lz, face);
  p.add(leg, new THREE.CylinderGeometry(0.03, 0.03, h - 0.03, 6), lx, (h - 0.03) / 2, lz);
  p.add(leg, new THREE.CylinderGeometry(0.18, 0.18, 0.02, 14), lx, 0.01, lz);
}

/** Sofá (ou poltrona, com `len` curto) virado para `face`. */
function sofa(p: Spot, fab: Mat, leg: Mat, lx: number, lz: number, face: number, len = 2.0) {
  const c = sub(p, lx, lz, face);
  c.add(fab, new THREE.BoxGeometry(len, 0.42, 0.85), 0, 0.33, 0);
  c.add(fab, new THREE.BoxGeometry(len, 0.5, 0.2), 0, 0.75, -0.33);
  for (const s of [-1, 1]) c.add(fab, new THREE.BoxGeometry(0.18, 0.32, 0.85), s * (len / 2 - 0.09), 0.66, 0);
  for (const [a, w] of CORNERS) c.add(leg, new THREE.CylinderGeometry(0.025, 0.02, 0.12, 5), a * (len / 2 - 0.1), 0.06, w * 0.34);
  // Um lugar a cada ~0,7 m do assento (entre os braços).
  const n = Math.max(1, Math.round((len - 0.36) / 0.7));
  for (let k = 0; k < n; k++) c.seat((k + 0.5 - n / 2) * ((len - 0.36) / n), 0.5, 0.05, 0);
}

/** Banco comprido ao longo de x local; quem senta olha para `face`. */
function bench(p: Spot, seat: Mat, base: Mat, lx: number, lz: number, face: number, len = 2.0) {
  const c = sub(p, lx, lz, face);
  c.add(seat, new THREE.BoxGeometry(len, 0.07, 0.45), 0, 0.45, 0);
  for (const s of [-1, 1]) c.add(base, new THREE.BoxGeometry(0.3, 0.42, 0.4), s * (len / 2 - 0.25), 0.21, 0);
  // Um lugar a cada ~0,6 m.
  const n = Math.max(1, Math.round(len / 0.6));
  for (let k = 0; k < n; k++) c.seat((k + 0.5 - n / 2) * (len / n), 0.45, 0, 0);
}

function plant(p: Spot, pot: Mat, leaf: Mat, lx: number, lz: number, s = 1) {
  p.add(pot, new THREE.CylinderGeometry(0.3 * s, 0.24 * s, 0.55 * s, 14), lx, 0.275 * s, lz);
  p.add(leaf, new THREE.IcosahedronGeometry(0.5 * s, 1), lx, s, lz, 0, [1, 1.25, 1]);
}

/** Vasinho com planta sobre um tampo na altura `y`. */
function potOn(p: Spot, pot: Mat, leaf: Mat, lx: number, y: number, lz: number, s = 1) {
  p.add(pot, new THREE.CylinderGeometry(0.1 * s, 0.08 * s, 0.16 * s, 10), lx, y + 0.08 * s, lz);
  p.add(leaf, new THREE.IcosahedronGeometry(0.15 * s, 1), lx, y + 0.24 * s, lz);
}

/** Estante com prateleiras e lombadas (livros, cadernos, discos). */
function shelf(p: Spot, frame: Mat, lx: number, lz: number, w: number, h: number, d: number, rows: number, items: Mat[], face = 0) {
  const c = sub(p, lx, lz, face);
  for (const s of [-1, 1]) c.add(frame, new THREE.BoxGeometry(0.04, h, d), s * (w / 2 - 0.02), h / 2, 0);
  c.add(frame, new THREE.BoxGeometry(w, h, 0.02), 0, h / 2, -d / 2 + 0.01);
  const step = (h - 0.06) / rows;
  for (let r = 0; r <= rows; r++) c.add(frame, new THREE.BoxGeometry(w, 0.03, d), 0, 0.03 + r * step, 0);
  if (!items.length) return;
  for (let r = 0; r < rows; r++) {
    let x = -w / 2 + 0.1;
    let k = r * 3;
    while (x < w / 2 - 0.2) {
      const bw = 0.04 + ((k * 7) % 5) * 0.012;
      const bh = step * (0.55 + ((k * 3) % 4) * 0.08);
      c.add(items[k % items.length]!, new THREE.BoxGeometry(bw, bh, d * 0.7), x + bw / 2, 0.045 + r * step + bh / 2, 0.02);
      x += bw + 0.008 + (k % 6 === 5 ? 0.25 : 0);
      k++;
    }
  }
}

/** Mudinhas numa bandeja (grade nx × nz) em cima de um tampo na altura `y`. */
function seedlings(p: Spot, tray: Mat, leaf: Mat, lx: number, y: number, lz: number, w: number, d: number, nx: number, nz: number) {
  p.add(tray, new THREE.BoxGeometry(w, 0.05, d), lx, y + 0.025, lz);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) p.add(leaf, new THREE.ConeGeometry(0.035, 0.12, 5), lx - w / 2 + ((i + 0.5) * w) / nx, y + 0.11, lz - d / 2 + ((j + 0.5) * d) / nz);
}

/** Pé-direito do térreo em (x, z): o do volume mais alto que contém o ponto. */
function ceilingAt(room: Room, id: ModuleId, x: number, z: number): number {
  return room.vols.reduce((h, v) => (inVol(v, x, z) ? Math.max(h, groundHeight(id, v)) : h), 0);
}

/**
 * Placa do ambiente (nome em i18n): pendurada do teto onde o pé-direito é baixo; num totem onde o
 * salão é alto (ou sem teto em cima, como o pé-direito duplo).
 */
function zoneSign(kit: Kit, room: Room, id: ModuleId, b: Builder, metal: Mat, key: ZoneKey, accent: string, x: number, z: number, ry: number, totem = false, w = 2.4) {
  const ceil = ceilingAt(room, id, x, z);
  const h = w * 0.25;
  const hang = !totem && ceil <= 6.5;
  const y = hang ? Math.min(3.0, ceil - 0.9) : 2.6;
  const sign = sectorSign(kit, zoneLabel(key), accent, w);
  sign.position.set(x, y, z);
  sign.rotation.y = ry;
  room.scene.add(sign);
  if (hang) {
    for (const s of [-1, 1]) b.add(metal, new THREE.CylinderGeometry(0.012, 0.012, ceil - y - h / 2, 4), [x + Math.cos(ry) * s * w * 0.4, (ceil + y + h / 2) / 2, z - Math.sin(ry) * s * w * 0.4]);
  } else {
    b.add(metal, new THREE.CylinderGeometry(0.045, 0.05, y - h / 2, 8), [x, (y - h / 2) / 2, z]);
    b.add(metal, new THREE.CylinderGeometry(0.28, 0.3, 0.04, 16), [x, 0.02, z]);
  }
}

/** Plaquinha com o nome do setor sobre o objeto que abre o painel. */
function plaque(kit: Kit, g: THREE.Object3D, text: string, accent: string, x: number, y: number, z: number, ry = 0, w = 1.2) {
  const s = sectorSign(kit, text, accent, w);
  s.position.set(x, y, z);
  s.rotation.y = ry;
  g.add(s);
}

/** Vista de um setor: recua para onde ele olha, sem sair da planta. */
function viewer(room: Room, plan: Record<string, Placed>, overview: { cam: THREE.Vector3; target: THREE.Vector3 }) {
  return (id: string) => {
    const p = plan[id];
    if (!p) return overview;
    for (let back = 7.5; back > 2.6; back -= 0.5) {
      const v = sectorView(p.x, p.z, p.face, back, 3.8);
      if (!room.spec.blocked(v.cam.x, v.cam.z)) return v;
    }
    return sectorView(p.x, p.z, p.face, 2.6, 3.8);
  };
}

/* =====================================================================
 * FOCUS — seção 21: volumes baixos em volta do jardim central. Recepção no vestíbulo; jardim sob a
 * claraboia com passarela de madeira no eixo; Estação Focus, configurações, escolha de tarefa e
 * preparação no anel em volta; salas individuais (ala oeste), cabines (ala leste) e mesas por
 * nível de privacidade no bloco dos fundos, dos dois lados do lounge dos elevadores.
 * ===================================================================== */
export const FOCUS_SECTORS = ['garden', 'history', 'distraction'] as const;
export type FocusSector = (typeof FOCUS_SECTORS)[number];

export function createFocusInterior(kit: Kit, labels: Record<FocusSector, string>): InteriorScene {
  const acc = '#5EEAD4';
  const room = createRoom(kit, { id: 'focus', floor: '#E8EEE9', glass: '#CDEFE6', frame: '#B9905F', accent: acc });
  const { scene, b } = room;
  const m = palette(kit, { wood: '#C9A27A', wood2: '#9C7650', fabric: '#7FA89A', fabric2: '#A8C3B5', stone: '#D6D1C4', accent: acc, rug: '#D9D2C2' });
  const sign = (key: ZoneKey, x: number, z: number, ry: number, totem = false) => zoneSign(kit, room, 'focus', b, m.metal, key, '#14B8A6', x, z, ry, totem);
  const pick: THREE.Group[] = [];
  const lamps: Array<[number, number]> = [];

  // Recepção (vestíbulo da entrada): balcão de madeira com o livro das sessões (abre o histórico)
  // e o banco de espera do outro lado do eixo.
  const obs: Obstacle[] = [];
  const reception: Placed = { x: RECEPTION_DESKS.focus.x, z: RECEPTION_DESKS.focus.z, face: RECEPTION_DESKS.focus.face };
  pick.push(
    sectorAt(scene, 'history', reception.x, reception.z, reception.face, (p, g) => {
      p.add(m.wood2, new THREE.BoxGeometry(2.4, 1.0, 0.6), 0, 0.5, 0);
      p.add(m.wood, new THREE.BoxGeometry(2.5, 0.05, 0.75), 0, 1.025, 0.05);
      for (let k = 0; k < 11; k++) p.add(m.wood, new THREE.BoxGeometry(0.06, 0.9, 0.03), -1.1 + k * 0.22, 0.5, 0.315);
      p.add(m.glow, new THREE.BoxGeometry(2.4, 0.03, 0.02), 0, 0.06, 0.32);
      deskTop(p, m.wood, m.wood2, 2.3);
      receptionChair('focus', p, m, obs);
      p.add(m.dark, new THREE.BoxGeometry(0.44, 0.02, 0.32), 0.55, 1.06, 0.05, 0.15);
      p.add(m.paper, new THREE.BoxGeometry(0.42, 0.03, 0.3), 0.55, 1.08, 0.05, 0.15);
      p.add(m.metal, new THREE.CylinderGeometry(0.1, 0.12, 0.03, 12), -0.8, 1.065, -0.05);
      p.add(m.metal, new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5), -0.8, 1.27, -0.05);
      p.add(m.warm, new THREE.ConeGeometry(0.16, 0.16, 14, 1, true), -0.8, 1.5, -0.05);
      potOn(p, m.white, m.leaf, 0.9, 0.785, -0.62);
      plaque(kit, g, labels.history, acc, -0.1, 1.4, -0.2);
    }),
  );
  {
    const w = spot(b, -3.1, 14.5, Math.PI / 2);
    bench(w, m.wood, m.stone, 0, 0, 0, 2.0);
    w.add(m.wood, new THREE.BoxGeometry(2.0, 0.4, 0.05), 0, 0.75, -0.22);
  }
  sign('reception', 2.9, 14.5, 0);
  lamps.push([0, 14.5]);

  // Jardim central sob a claraboia: duas metades plantadas com mureta de pedra e a passarela de
  // madeira no eixo (o caminho da entrada até os fundos atravessa o jardim).
  const grass = kit.mat('#7DA65E', { rough: 1 });
  const water = kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 });
  b.add(grass, new THREE.CircleGeometry(5.6, 48), [0, 0.03, 0], [-Math.PI / 2, 0, 0]);
  b.add(m.wood, new THREE.BoxGeometry(2.8, 0.08, 11.4), [0, 0.06, 0]);
  for (let k = 0; k < 23; k++) b.add(m.wood2, new THREE.BoxGeometry(2.8, 0.01, 0.025), [0, 0.105, -5.5 + k * 0.5]);
  const R = 5.5;
  const a0 = Math.asin(1.75 / R);
  for (const side of [-1, 1]) {
    b.add(m.stone, new THREE.BoxGeometry(0.22, 0.42, 2 * Math.sqrt(R * R - 1.75 * 1.75)), [side * 1.75, 0.21, 0]);
    const n = 16;
    for (let k = 0; k < n; k++) {
      const a = a0 + ((k + 0.5) / n) * (Math.PI - 2 * a0);
      b.add(m.stone, new THREE.BoxGeometry((R * (Math.PI - 2 * a0)) / n + 0.04, 0.42, 0.24), [side * Math.sin(a) * R, 0.21, Math.cos(a) * R], [0, side * a, 0]);
    }
    // Luz baixa na mureta (iluminação noturna suave).
    for (const z of [-3.2, 0, 3.2]) b.add(m.warm, new THREE.BoxGeometry(0.03, 0.06, 0.3), [side * 1.62, 0.3, z]);
  }
  // Metade oeste: espelho d'água com pedras, ninfeias e juncos.
  b.add(water, new THREE.CircleGeometry(1.9, 32), [-3.7, 0.07, 0.4], [-Math.PI / 2, 0, 0]);
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2;
    b.add(m.stone, new THREE.IcosahedronGeometry(0.2 + (k % 3) * 0.07, 0), [-3.7 + Math.sin(a) * 2.0, 0.1, 0.4 + Math.cos(a) * 2.0], [k, k * 0.7, 0], [1, 0.55, 1]);
  }
  for (const [x, z] of [[-3.2, 0.9], [-4.3, -0.2], [-3.6, 1.4]] as const) b.add(m.leaf2, new THREE.CircleGeometry(0.22, 12), [x, 0.075, z], [-Math.PI / 2, 0, 0]);
  for (let k = 0; k < 7; k++) b.add(m.leaf3, new THREE.CylinderGeometry(0.015, 0.02, 0.9 + (k % 3) * 0.2, 4), [-4.9 + (k % 4) * 0.18, 0.5, -1.0 + k * 0.12], [0.1 * (k % 3), 0, 0.08 * (k % 2)]);
  for (const [x, z, s] of [[-2.6, -3.6, 0.5], [-4.1, -2.9, 0.6], [-2.7, 3.9, 0.55], [-4.2, 3.1, 0.45], [-2.4, -1.8, 0.35]] as const) b.add(m.leaf, new THREE.IcosahedronGeometry(s, 1), [x, s * 0.6, z], undefined, [1, 0.7, 1]);
  // Metade leste: árvore, pedras grandes e forração.
  b.add(m.bark, new THREE.CylinderGeometry(0.16, 0.24, 3.4, 8), [3.6, 1.7, -0.6]);
  b.add(m.leaf, new THREE.IcosahedronGeometry(1.7, 1), [3.6, 4.0, -0.6], undefined, [1, 0.8, 1]);
  b.add(m.leaf3, new THREE.IcosahedronGeometry(1.1, 1), [3.3, 4.9, -0.2]);
  for (const [x, z, s] of [[2.6, 2.6, 0.45], [4.4, 2.2, 0.6], [2.7, -3.4, 0.5], [4.2, -3.1, 0.35]] as const) b.add(m.stone, new THREE.IcosahedronGeometry(s, 0), [x, s * 0.35, z], [s, s * 3, 0], [1, 0.6, 1]);
  for (const [x, z, s] of [[2.4, 0.6, 0.35], [4.6, 0.6, 0.4], [3.2, 3.9, 0.4], [2.4, -1.9, 0.3], [4.5, -1.8, 0.35]] as const) b.add(m.leaf2, new THREE.IcosahedronGeometry(s, 1), [x, s * 0.5, z], undefined, [1, 0.6, 1]);
  // Bancos de contemplação em volta do jardim.
  for (const a of [0.5, -0.5, Math.PI - 0.5, -(Math.PI - 0.5)]) bench(spot(b, Math.sin(a) * 6.2, Math.cos(a) * 6.2, a + Math.PI), m.wood, m.stone, 0, 0, 0, 1.8);
  sign('garden', -2.3, 6.3, 0);

  // Anel em volta do jardim: um ambiente em cada quadrante, virado para o jardim.
  const ring = (a: number): Placed => ({ x: Math.sin(a) * 9.6, z: Math.cos(a) * 9.6, face: a + Math.PI });
  const P = { station: ring(1.0), settings: ring(-1.0), choose: ring(2.15), prepare: ring(-2.15) };
  /** Biombo de ripas de madeira atrás do ambiente. */
  const slats = (p: Spot, lz: number, w: number, h: number) => {
    const n = Math.round(w / 0.2);
    for (let k = 0; k <= n; k++) p.add(m.wood, new THREE.BoxGeometry(0.06, h, 0.07), -w / 2 + k * (w / n), h / 2 + 0.02, lz);
    p.add(m.wood2, new THREE.BoxGeometry(w + 0.06, 0.06, 0.12), 0, h + 0.05, lz);
    p.add(m.wood2, new THREE.BoxGeometry(w + 0.06, 0.04, 0.12), 0, 0.02, lz);
  };
  // Estação Focus: mesa longa com a luz do foco (anel aceso), dois bancos; abre o Focus.
  pick.push(
    sectorAt(scene, 'garden', P.station.x, P.station.z, P.station.face, (p) => {
      p.add(m.rug, new THREE.BoxGeometry(3.6, 0.012, 2.6), 0, 0.006, -0.3);
      p.add(m.wood, new THREE.BoxGeometry(3.0, 0.06, 0.9), 0, 0.75, -0.45);
      for (const s of [-1, 1]) p.add(m.wood2, new THREE.BoxGeometry(0.08, 0.72, 0.8), s * 1.4, 0.36, -0.45);
      p.add(m.wood2, new THREE.BoxGeometry(2.72, 0.32, 0.03), 0, 0.5, -0.85);
      p.add(m.metal, new THREE.CylinderGeometry(0.12, 0.14, 0.03, 16), 0, 0.795, -0.62);
      p.add(m.metal, new THREE.BoxGeometry(0.03, 0.14, 0.03), 0, 0.87, -0.62);
      p.add(m.glow, new THREE.TorusGeometry(0.26, 0.022, 8, 40), 0, 1.2, -0.62);
      p.add(m.paper, new THREE.BoxGeometry(0.3, 0.02, 0.22), 0.8, 0.79, -0.4, 0.2);
      for (const s of [-1, 1]) stool(p, m.fabric, m.metal, s * 0.7, 0.3, 0.66, Math.PI);
      slats(p, -1.3, 3.4, 2.2);
    }),
  );
  // Configurações do foco: console de pé com tampo inclinado, sem botões (o toque abre o Focus).
  pick.push(
    sectorAt(scene, 'garden', P.settings.x, P.settings.z, P.settings.face, (p) => {
      p.add(m.rug, new THREE.BoxGeometry(3.0, 0.012, 2.4), 0, 0.006, -0.3);
      p.add(m.wood2, new THREE.BoxGeometry(1.8, 1.0, 0.6), 0, 0.5, -0.6);
      p.add(m.wood, new THREE.BoxGeometry(1.9, 0.04, 0.7), 0, 1.02, -0.6);
      p.add(m.dark, new THREE.BoxGeometry(1.5, 0.03, 0.42).rotateX(0.35), 0, 1.12, -0.6);
      p.add(m.glow, new THREE.BoxGeometry(1.5, 0.02, 0.02).rotateX(0.35), 0, 1.04, -0.4);
      for (const s of [-1, 1]) stool(p, m.fabric, m.metal, s * 0.55, 0.15, 0.75, Math.PI);
      p.add(m.wood2, new THREE.BoxGeometry(2.4, 0.86, 0.35), 0, 0.43, -1.3);
      p.add(m.wood, new THREE.BoxGeometry(2.46, 0.04, 0.4), 0, 0.88, -1.3);
      for (let k = 0; k < 3; k++) p.add(m.stone, new THREE.IcosahedronGeometry(0.08 + k * 0.02, 0), -0.9 + k * 0.25, 0.95, -1.3, k, [1, 0.6, 1]);
      potOn(p, m.white, m.leaf2, 0.8, 0.9, -1.3, 1.3);
      slats(p, -1.5, 3.0, 1.6);
    }),
  );
  // Escolha de tarefa ou atividade: quadro com fichas em branco e mesa redonda para decidir.
  pick.push(
    sectorAt(scene, 'garden', P.choose.x, P.choose.z, P.choose.face, (p) => {
      p.add(m.rug, new THREE.BoxGeometry(3.4, 0.012, 2.4), 0, 0.006, -0.2);
      p.add(m.wood2, new THREE.BoxGeometry(3.0, 1.6, 0.05), 0, 1.35, -1.15);
      for (const s of [-1, 1]) p.add(m.wood, new THREE.BoxGeometry(0.08, 2.2, 0.08), s * 1.54, 1.1, -1.15);
      p.add(m.wood, new THREE.BoxGeometry(3.16, 0.08, 0.1), 0, 2.2, -1.15);
      for (let r = 0; r < 3; r++) {
        p.add(m.wood, new THREE.BoxGeometry(2.9, 0.03, 0.08), 0, 0.72 + r * 0.45, -1.1);
        for (let k = 0; k < 5; k++) p.add(m.paper, new THREE.BoxGeometry(0.4, 0.28, 0.012).rotateX(-0.12), -1.12 + k * 0.56, 0.88 + r * 0.45, -1.08);
      }
      p.add(m.wood, new THREE.CylinderGeometry(0.5, 0.5, 0.04, 24), 0.5, 0.74, 0.1);
      p.add(m.dark, new THREE.CylinderGeometry(0.05, 0.05, 0.72, 8), 0.5, 0.36, 0.1);
      p.add(m.dark, new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), 0.5, 0.015, 0.1);
      chair(p, m.fabric, m.metal, -0.35, 0.1, Math.PI / 2);
      chair(p, m.fabric, m.metal, 1.35, 0.1, -Math.PI / 2);
    }),
  );
  // Preparação: escaninhos para guardar o celular, água e banco (abre o guia de bloqueio de distrações).
  pick.push(
    sectorAt(scene, 'distraction', P.prepare.x, P.prepare.z, P.prepare.face, (p, g) => {
      p.add(m.rug, new THREE.BoxGeometry(3.0, 0.012, 2.2), 0, 0.006, -0.3);
      p.add(m.wood2, new THREE.BoxGeometry(2.4, 1.3, 0.5), 0, 0.65, -1.0);
      p.add(m.wood, new THREE.BoxGeometry(2.5, 0.04, 0.56), 0, 1.32, -1.0);
      for (let k = 0; k < 8; k++) {
        const ix = (k % 4) - 1.5;
        const iy = Math.floor(k / 4);
        p.add(m.wood, new THREE.BoxGeometry(0.52, 0.56, 0.02), ix * 0.58, 0.36 + iy * 0.6, -0.74);
        p.add(m.metal, new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6).rotateX(Math.PI / 2), ix * 0.58 + 0.18, 0.36 + iy * 0.6, -0.72);
      }
      p.add(m.glass, new THREE.CylinderGeometry(0.15, 0.15, 0.4, 14), 0.9, 1.54, -1.0);
      for (let k = 0; k < 3; k++) p.add(m.white, new THREE.CylinderGeometry(0.04, 0.03, 0.09, 8), 0.45 + k * 0.1, 1.385, -0.9);
      bench(p, m.wood, m.stone, 0, 0.35, 0, 2.0);
      plaque(kit, g, labels.distraction, acc, -0.4, 1.62, -0.74, 0, 1.3);
    }),
  );
  for (const [key, q] of [['focusStation', P.station], ['focusSettings', P.settings], ['choose', P.choose], ['prepare', P.prepare]] as const) {
    const p = spot(b, q.x, q.z, q.face);
    const [sx, , sz] = p.at(-1.8, 0, 0.7);
    sign(key, sx, sz, q.face + Math.PI);
    const [lx, , lz] = p.at(0, 0, -0.5);
    lamps.push([lx, lz]);
  }
  pendants(kit, b, lamps, 3.3, 7, '#FFE9C2');
  // Ripas de madeira nas paredes do pavilhão do jardim (madeira e vidro).
  wallSpots(room, 44, 0.28, () => false, room.vols[0]).forEach(({ x, z, face }) => b.add(m.wood, new THREE.BoxGeometry(0.08, 3.4, 0.4), [x, 1.9, z], [0, face, 0]));

  // Luminárias de ação (objects3d.ts): acesas com a sessão de foco correndo. Nas salas individuais,
  // a própria luminária da mesa; nas cabines, uma luminária nova no canto do tampo (`flag`: com pé).
  let lampN = 0;
  // Salas individuais (ala oeste): duas salas de vidro com mesa, cadeira, luminária e prateleira.
  for (const zc of [-2.16, 2.16]) {
    const p = spot(b, -15.16, zc, Math.PI / 2);
    p.add(m.glass, new THREE.BoxGeometry(3.2, 2.5, 0.04), 0, 1.25, -1.6);
    for (const s of [-1, 1]) {
      p.add(m.glass, new THREE.BoxGeometry(0.04, 2.5, 3.2), s * 1.6, 1.25, 0);
      p.add(m.glass, new THREE.BoxGeometry(0.7, 2.5, 0.04), s * 1.25, 1.25, 1.6);
      p.add(m.wood, new THREE.BoxGeometry(0.08, 0.08, 3.28), s * 1.6, 2.54, 0);
    }
    for (const [a, w] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6], [-0.9, 1.6], [0.9, 1.6]] as const) p.add(m.wood, new THREE.BoxGeometry(0.08, 2.62, 0.08), a, 1.31, w);
    p.add(m.wood, new THREE.BoxGeometry(3.28, 0.12, 0.1), 0, 2.56, 1.6);
    p.add(m.wood, new THREE.BoxGeometry(3.28, 0.08, 0.08), 0, 2.54, -1.6);
    p.add(m.rug, new THREE.BoxGeometry(2.6, 0.012, 2.6), 0, 0.006, 0);
    table(p, m.wood, m.dark, 0, -1.2, 1.5, 0.6);
    chair(p, m.fabric, m.dark, 0, -0.55, Math.PI);
    p.add(m.dark, new THREE.CylinderGeometry(0.08, 0.1, 0.03, 10), 0.5, 0.765, -1.3);
    p.add(m.dark, new THREE.CylinderGeometry(0.01, 0.01, 0.35, 4), 0.5, 0.95, -1.3);
    p.add(m.warm, new THREE.SphereGeometry(0.08, 10, 6), 0.5, 1.13, -1.3);
    {
      const [lx, ly, lz] = p.at(0.5, 1.13, -1.3);
      setAnchor(scene, `lamp${lampN++}`, { x: lx, y: ly, z: lz, face: Math.PI / 2 });
    }
    p.add(m.wood, new THREE.BoxGeometry(0.25, 0.04, 1.2), -1.45, 1.5, -0.4);
    for (let k = 0; k < 6; k++) p.add([m.fabric, m.wood2, m.paper][k % 3]!, new THREE.BoxGeometry(0.18, 0.22, 0.05), -1.45, 1.63, -0.85 + k * 0.08);
    plant(p, m.white, m.leaf, 1.15, -1.15, 0.8);
  }
  b.add(m.wood2, new THREE.BoxGeometry(0.35, 1.1, 1.2), [-13.75, 0.55, 0]);
  pendants(kit, b, [[-15.16, -2.16], [-15.16, 2.16]], 2.9, 4.5, '#FFE9C2');
  sign('singleRooms', -12.9, 0, Math.PI / 2);

  // Cabines (ala leste): três cabines acústicas abertas para o jardim, com tampo, banco e luz.
  for (const zc of [-2.5, 0, 2.5]) {
    const p = spot(b, 15.75, zc, -Math.PI / 2);
    p.add(m.fabric, new THREE.BoxGeometry(1.9, 2.3, 0.08), 0, 1.15, -0.85);
    for (const s of [-1, 1]) {
      p.add(m.fabric, new THREE.BoxGeometry(0.08, 2.3, 1.7), s * 0.95, 1.15, 0);
      p.add(m.wood, new THREE.BoxGeometry(0.1, 2.38, 0.1), s * 0.95, 1.19, 0.85);
    }
    p.add(m.wood, new THREE.BoxGeometry(1.98, 0.08, 1.78), 0, 2.34, 0);
    for (let k = 0; k < 12; k++) p.add(k % 3 ? m.fabric2 : m.wood, new THREE.BoxGeometry(0.38, 0.38, 0.03), -0.6 + (k % 4) * 0.4, 1.05 + Math.floor(k / 4) * 0.42, -0.8);
    p.add(m.wood, new THREE.BoxGeometry(1.6, 0.04, 0.42), 0, 0.74, -0.6);
    stool(p, m.fabric2, m.metal, 0, 0.1, 0.62, Math.PI);
    p.add(m.warm, new THREE.BoxGeometry(1.5, 0.02, 0.06), 0, 2.28, 0.6);
    {
      const [lx, ly, lz] = p.at(0.55, 0.76, -0.66);
      setAnchor(scene, `lamp${lampN++}`, { x: lx, y: ly, z: lz, face: -Math.PI / 2, flag: true });
    }
  }
  sign('booths', 12.9, 0, -Math.PI / 2);

  // Mesas por nível de privacidade (bloco dos fundos): mesas abertas perto do jardim; mesas com
  // divisórias baixas a leste, numa fila entre as abertas e a escada (o vão dela, a leste do lounge,
  // fica livre, com o pé da escada); mesas fechadas com painéis altos a oeste. O meio fica para o lounge.
  for (const sx of [-1, 1]) {
    const p = spot(b, sx * 5.2, -12.0, 0);
    table(p, m.wood, m.dark, 0, 0, 3.2, 1.0);
    for (const lx of [-1, 0, 1]) {
      chair(p, m.fabric, m.dark, lx, 0.75, Math.PI);
      chair(p, m.fabric, m.dark, lx, -0.75, 0);
    }
    for (const lx of [-0.9, 0.9]) {
      p.add(m.dark, new THREE.CylinderGeometry(0.07, 0.09, 0.03, 10), lx, 0.765, 0);
      p.add(m.dark, new THREE.CylinderGeometry(0.01, 0.01, 0.35, 4), lx, 0.95, 0);
      p.add(m.warm, new THREE.SphereGeometry(0.07, 10, 6), lx, 1.13, 0);
    }
    potOn(p, m.white, m.leaf2, 0, 0.75, 0);
  }
  for (const xc of [3.1, 5.0, 6.9]) {
    // Leste: privacidade média, de costas para o jardim (fora do vão da escada e da folga em volta).
    const e = spot(b, xc, -15.0, Math.PI);
    table(e, m.wood, m.dark, 0, 0, 1.5, 0.7);
    chair(e, m.fabric, m.dark, 0, -0.75, 0);
    for (const s of [-1, 1]) e.add(m.fabric2, new THREE.BoxGeometry(0.9, 1.25, 0.04), s * 0.8, 0.625, -0.05, Math.PI / 2);
    e.add(m.fabric2, new THREE.BoxGeometry(1.5, 0.35, 0.03), 0, 0.93, 0.33);
    e.add(m.warm, new THREE.SphereGeometry(0.06, 8, 6), 0.55, 0.85, 0.2);
  }
  for (const zc of [-16.2, -18.2, -20.2]) {
    // Oeste: privacidade alta.
    const w = spot(b, -7.4, zc, -Math.PI / 2);
    table(w, m.wood, m.dark, 0, 0, 1.5, 0.7);
    chair(w, m.fabric, m.dark, 0, -0.75, 0);
    for (const s of [-1, 1]) w.add(m.fabric, new THREE.BoxGeometry(0.8, 1.7, 0.04), s * 0.8, 0.85, -0.05, Math.PI / 2);
    w.add(m.fabric, new THREE.BoxGeometry(1.64, 1.7, 0.04), 0, 0.85, 0.33);
    w.add(m.wood, new THREE.BoxGeometry(1.5, 0.03, 0.3), 0, 1.45, 0.18);
    w.add(m.warm, new THREE.BoxGeometry(1.3, 0.02, 0.04), 0, 1.43, 0.08);
  }
  pendants(kit, b, [[4.0, -15.0], [6.0, -15.0], [-7.2, -18.2], [-7.2, -20.2]], 2.9, 7, '#FFE9C2');
  sign('privacyDesks', 2.4, -11.4, 0, true);

  finishRoom(room);
  scene.userData.seats = groundSeats(scene, b);
  const plan: Record<FocusSector, Placed> = { garden: P.station, history: reception, distraction: P.prepare };
  const overview = { cam: new THREE.Vector3(0, 3.8, 15.6), target: new THREE.Vector3(0, 1.3, 0) };
  return {
    scene,
    sectors: FOCUS_SECTORS,
    pickables: pick,
    room: room.spec,
    obstacles: obs,
    view: viewer(room, plan, overview),
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/** Linhas dos arcos da estufa (as mesmas por dentro e nos montantes de fora). */
export const HABITS_ARCHES = [-14, -10, -6, 6, 10, 14] as const;

/* =====================================================================
 * HABITS — seção 22: estufa de um pavimento só. Recepção no pavilhão de entrada; jardim central
 * com um canteiro por hábito (nome real na placa) e a fonte no fim do eixo; Estação de hábitos e
 * Laboratório de rotinas a oeste (as estantes de mudas na ala oeste); Acompanhamento e revisão e o
 * Jardim de pausa a leste (a ala leste é o canto de descanso).
 * ===================================================================== */
export const HABITS_SECTORS = ['atrium', 'greenhouse', 'evolution', 'analysis'] as const;
export type HabitsSector = (typeof HABITS_SECTORS)[number];

export function createHabitsInterior(kit: Kit, labels: Record<HabitsSector, string>): InteriorScene {
  const acc = '#E6B450';
  const room = createRoom(kit, { id: 'habits', floor: '#E6EDE2', glass: '#D8F2DE', frame: '#6B7F75', accent: acc });
  const { scene, b } = room;
  const m = palette(kit, { wood: '#B98B5E', wood2: '#8A6240', fabric: '#C9B79C', fabric2: '#9DB8A0', stone: '#D9D6CC', accent: acc, rug: '#CFC6AE' });
  const sign = (key: ZoneKey, x: number, z: number, ry: number) => zoneSign(kit, room, 'habits', b, m.metal, key, '#B7791F', x, z, ry);
  const frame = kit.mat('#6B7F75', { metal: 0.6, rough: 0.35 });
  const water = kit.mat('#5BA7D6', { rough: 0.05, metal: 0.3 });
  const grass = kit.mat('#7DA65E', { rough: 1 });
  const grow = kit.mat('#E9D5FF', { glow: true });
  const flowers = ['#FBBF24', '#F472B6', '#FFFFFF', '#A78BFA'].map((c) => kit.mat(c, { rough: 0.7 }));
  const pick: THREE.Object3D[] = [];

  // Arcos da estufa (as mesmas linhas de fora), fora do vão da entrada; a nave do meio fica aberta
  // sob a claraboia redonda.
  const H = MASSING.habits.ground;
  const nave = MASSING.habits.vols[0]!;
  const half = nave.kind === 'rect' ? nave.d / 2 - 0.3 : 10;
  for (const x of HABITS_ARCHES) b.add(frame, new THREE.TorusGeometry(half, 0.1, 6, 32, Math.PI), [x, 0, nave.cz], [0, Math.PI / 2, 0], [1, (H - 0.6) / half, 1]);

  // Recepção (pavilhão de entrada): balcão com pacotes de sementes e ervas; banco e floreira de ervas.
  const obs: Obstacle[] = [];
  {
    const D = RECEPTION_DESKS.habits;
    const p = spot(b, D.x, D.z, D.face);
    p.add(m.wood2, new THREE.BoxGeometry(2.4, 1.0, 0.6), 0, 0.5, 0);
    p.add(m.wood, new THREE.BoxGeometry(2.5, 0.05, 0.75), 0, 1.025, 0.05);
    for (let k = 0; k < 9; k++) p.add(m.wood, new THREE.BoxGeometry(0.22, 0.9, 0.02), -1.06 + k * 0.265, 0.5, 0.31);
    for (let k = 0; k < 6; k++) p.add(flowers[k % 4]!, new THREE.BoxGeometry(0.1, 0.14, 0.02), -1.0 + k * 0.13, 1.12, 0.25, 0.1);
    for (let k = 0; k < 3; k++) potOn(p, m.clay, m.leaf2, 0.4 + k * 0.3, 1.05, -0.1, 0.8);
    deskTop(p, m.wood, m.wood2, 2.3);
    receptionChair('habits', p, m, obs);
    const w = spot(b, -3.1, 12.4, Math.PI / 2);
    bench(w, m.wood, m.stone, 0, 0, 0, 2.0);
    const f = spot(b, -3.4, 10.2, Math.PI / 2);
    f.add(m.wood2, new THREE.BoxGeometry(1.6, 0.7, 0.5), 0, 0.35, 0);
    for (let k = 0; k < 5; k++) f.add([m.leaf, m.leaf2, m.leaf3][k % 3]!, new THREE.IcosahedronGeometry(0.2, 1), -0.6 + k * 0.3, 0.85, 0);
    sign('reception', 2.9, 12.2, 0);
  }

  // Jardim central: caminho de pedra no eixo, oito canteiros elevados (um por hábito, com o nome
  // real na placa), plantas penduradas e a fonte com duas árvores no fim do eixo.
  b.add(m.stone, new THREE.BoxGeometry(2.4, 0.012, 16.9), [0, 0.006, 0.25]);
  // Cada canteiro é um hábito de hoje (seção 28): tocar nele (ou, andando, olhar para ele ou chegar
  // perto e apertar E) registra ou desfaz o de hoje, como o registro rápido da estação; feito, ele
  // floresce (flores acesas e o halo na cor do hábito). Sem hábito: sem placa, e tocar não faz nada.
  const beds: Bed[] = [];
  const actions: ActionSpot[] = [];
  const bloomMats = ['#FDE047', '#F9A8D4', '#FFFFFF', '#C4B5FD'].map((c) => kit.mat(c, { glow: true, rough: 0.5 }));
  const hitGeo = kit.own(new THREE.BoxGeometry(2.5, 1.6, 2.7));
  const hitMat = kit.own(new THREE.MeshBasicMaterial({ visible: false }));
  const bedZ = [3.2, 0, -3.2, -6.4];
  for (const sx of [-1, 1])
    bedZ.forEach((zc, i) => {
      const p = spot(b, sx * 4.4, zc, (-sx * Math.PI) / 2);
      p.add(m.wood2, new THREE.BoxGeometry(2.2, 0.55, 2.4), 0, 0.275, 0);
      p.add(m.soil, new THREE.BoxGeometry(2.1, 0.04, 2.3), 0, 0.57, 0);
      for (const s of [-1, 1]) {
        p.add(m.wood, new THREE.BoxGeometry(2.3, 0.06, 0.08), 0, 0.58, s * 1.21);
        p.add(m.wood, new THREE.BoxGeometry(0.08, 0.06, 2.5), s * 1.11, 0.58, 0);
      }
      const spots = [[-0.6, -0.6, 0.45], [0.5, -0.5, 0.38], [0, 0.15, 0.32], [-0.6, 0.6, 0.3], [0.6, 0.55, 0.36]] as const;
      spots.forEach(([a, w, s], k) => p.add([m.leaf, m.leaf2, m.leaf3][(i + k) % 3]!, new THREE.IcosahedronGeometry(s, 1), a, 0.6 + s * 0.7, w));
      for (let k = 0; k < 4; k++) p.add(flowers[(i + k) % 4]!, new THREE.SphereGeometry(0.06, 6, 4), -0.8 + k * 0.5, 0.95, 0.9 - (k % 2) * 0.25);
      for (const s of [-1, 1]) p.add(m.wood, new THREE.BoxGeometry(0.04, 0.4, 0.04), s * 0.8, 0.78, 1.25);
      const ry = (-sx * Math.PI) / 2;
      const [cx, , cz] = p.at(0, 0, 0);
      // Flores abertas (acendem) e o halo na cor do hábito; fechado = escala quase zero (o material
      // já fica compilado na entrada, sem engasgo quando floresce).
      const bb = new Builder();
      const halo = kit.own(new THREE.MeshBasicMaterial({ color: acc, transparent: true, opacity: 0.6, depthWrite: false }));
      bb.add(halo, new THREE.TorusGeometry(1.0, 0.04, 6, 40), [0, 0.64, 0], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + i;
        const rr = 0.3 + (k % 3) * 0.24;
        const fx = Math.cos(a) * rr;
        const fz = Math.sin(a) * rr * 1.05;
        const fy = 0.88 + ((k * 7) % 5) * 0.07;
        bb.add(m.leaf2, new THREE.CylinderGeometry(0.012, 0.012, fy - 0.58, 4), [fx, (fy + 0.58) / 2, fz]);
        bb.add(bloomMats[k % 4]!, new THREE.IcosahedronGeometry(0.11, 0), [fx, fy, fz]);
      }
      const bloom = bb.build(false);
      bloom.position.set(cx, 0, cz);
      bloom.rotation.y = ry;
      bloom.scale.setScalar(0.001);
      scene.add(bloom);
      // Placa do canteiro: nome do hábito e o estado de hoje.
      const sign = canvasPlane(kit, 2.0, 0.62, 120);
      const [x, , z] = p.at(0, 0, 1.25);
      sign.mesh.position.set(x, 1.22, z);
      sign.mesh.rotation.y = ry;
      sign.mesh.visible = false;
      scene.add(sign.mesh);
      // Caixa invisível do toque (o canteiro inteiro e a placa); andando, vale chegar ao caminho em frente.
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.visible = false;
      hit.userData.hitbox = false;
      hit.position.set(cx, 0.8, cz);
      hit.rotation.y = ry;
      markAction(hit, '');
      scene.add(hit);
      pick.push(hit);
      const [wx, , wz] = p.at(0, 0, 2.15);
      const act: ActionSpot = { id: '', level: 0, obj: hit, x: wx, z: wz, r: 1.5, active: false };
      actions.push(act);
      beds.push({ sign, bloom, halo, spot: act, drawn: '', on: false, grow: 0, from: 0, t0: 0, moving: false });
    });
  for (const [x, z] of [[-4.4, 1.6], [4.4, 1.6], [-4.4, -4.8], [4.4, -4.8]] as const) {
    b.add(m.metal, new THREE.CylinderGeometry(0.008, 0.008, H - 5.4, 4), [x, (H + 5.4) / 2, z]);
    b.add(m.clay, new THREE.CylinderGeometry(0.3, 0.22, 0.35, 12), [x, 5.2, z]);
    b.add(m.leaf2, new THREE.IcosahedronGeometry(0.42, 1), [x, 4.95, z], undefined, [1, 1.4, 1]);
  }
  b.add(m.stone, new THREE.CylinderGeometry(1.35, 1.45, 0.5, 32), [0, 0.25, -9.6]);
  b.add(water, new THREE.CylinderGeometry(1.2, 1.2, 0.04, 32), [0, 0.48, -9.6]);
  b.add(m.stone, new THREE.CylinderGeometry(0.16, 0.22, 0.8, 12), [0, 0.8, -9.6]);
  b.add(m.stone, new THREE.CylinderGeometry(0.55, 0.3, 0.16, 20), [0, 1.24, -9.6]);
  b.add(water, new THREE.CylinderGeometry(0.48, 0.48, 0.02, 20), [0, 1.32, -9.6]);
  for (const sx of [-1, 1]) {
    b.add(m.wood2, new THREE.BoxGeometry(1.1, 0.5, 1.1), [sx * 2.9, 0.25, -9.8]);
    b.add(m.bark, new THREE.CylinderGeometry(0.12, 0.18, 2.6, 8), [sx * 2.9, 1.8, -9.8]);
    b.add(m.leaf, new THREE.IcosahedronGeometry(1.2, 1), [sx * 2.9, 3.6, -9.8], undefined, [1, 1.2, 1]);
  }
  sign('garden', -2.2, 6.4, 0);

  // Estação de hábitos (oeste, na frente): bancada de registro com bandejas de mudas, regador e
  // vasinhos, estante de vasos atrás; abre os hábitos de hoje.
  const station: Placed = { x: -11.5, z: 4.2, face: Math.PI / 2 };
  pick.push(
    sectorAt(scene, 'atrium', station.x, station.z, station.face, (p) => {
      p.add(m.wood, new THREE.BoxGeometry(4.2, 0.03, 3.4), 0, 0.015, -0.4);
      p.add(m.wood2, new THREE.BoxGeometry(3.4, 0.92, 0.9), 0, 0.46, -0.2);
      p.add(m.wood, new THREE.BoxGeometry(3.5, 0.05, 1.0), 0, 0.945, -0.2);
      for (let k = 0; k < 8; k++) p.add(m.wood, new THREE.BoxGeometry(0.4, 0.86, 0.02), -1.5 + k * 0.43, 0.46, 0.26);
      for (let k = 0; k < 3; k++) seedlings(p, m.soil, m.leaf2, -1.15 + k * 0.7, 0.97, -0.35, 0.55, 0.38, 4, 3);
      for (let k = 0; k < 4; k++) potOn(p, m.clay, m.leaf, 0.85 + k * 0.22, 0.97, 0.05, 0.8);
      p.add(m.leaf3, new THREE.CylinderGeometry(0.11, 0.11, 0.24, 12), 1.45, 1.09, -0.45);
      p.add(m.leaf3, new THREE.CylinderGeometry(0.015, 0.02, 0.3, 6).rotateZ(-0.9), 1.27, 1.17, -0.45);
      for (const s of [-1, 1]) stool(p, m.fabric, m.metal, s * 0.8, 0.75, 0.66, Math.PI);
      // Estante de vasos atrás.
      for (const s of [-1, 1]) p.add(m.wood2, new THREE.BoxGeometry(0.05, 1.9, 0.4), s * 1.5, 0.95, -1.4);
      for (let r = 0; r < 4; r++) {
        p.add(m.wood, new THREE.BoxGeometry(3.0, 0.03, 0.4), 0, 0.3 + r * 0.5, -1.4);
        for (let k = 0; k < 6; k++) potOn(p, m.clay, [m.leaf, m.leaf2, m.leaf3][(r + k) % 3]!, -1.2 + k * 0.48, 0.315 + r * 0.5, -1.4, 0.9);
      }
    }),
  );
  sign('habitStation', -9.4, 6.8, Math.PI / 2);

  // Laboratório de rotinas (oeste, nos fundos): duas bancadas de inox com bandejas e luz de
  // cultivo, carrinho; na ala oeste, estantes de mudas. Abre a semana dos hábitos.
  const lab: Placed = { x: -11.5, z: -6.0, face: Math.PI / 2 };
  pick.push(
    sectorAt(scene, 'greenhouse', lab.x, lab.z, lab.face, (p) => {
      for (const [lz, w] of [[0, 1.0], [-1.9, 0.8]] as const) {
        p.add(m.metal, new THREE.BoxGeometry(3.2, 0.05, w), 0, 0.88, lz);
        for (const [a, c] of CORNERS) p.add(m.metal, new THREE.BoxGeometry(0.05, 0.86, 0.05), a * 1.55, 0.43, lz + c * (w / 2 - 0.05));
        p.add(m.wood, new THREE.BoxGeometry(3.1, 0.03, w - 0.1), 0, 0.25, lz);
        for (let k = 0; k < 4; k++) seedlings(p, m.soil, m.leaf2, -1.17 + k * 0.78, 0.905, lz, 0.65, w * 0.7, 4, 3);
        for (const s of [-1, 1]) p.add(m.metal, new THREE.BoxGeometry(0.04, 1.2, 0.04), s * 1.55, 1.5, lz);
        p.add(m.dark, new THREE.BoxGeometry(3.2, 0.05, 0.16), 0, 2.1, lz);
        p.add(grow, new THREE.BoxGeometry(3.0, 0.02, 0.1), 0, 2.07, lz);
      }
      for (const y of [0.2, 0.75]) p.add(m.metal, new THREE.BoxGeometry(0.5, 0.04, 0.6), 2.3, y, 0);
      for (const [a, c] of CORNERS) p.add(m.metal, new THREE.BoxGeometry(0.03, 0.8, 0.03), 2.3 + a * 0.23, 0.4, c * 0.28);
      for (let k = 0; k < 3; k++) potOn(p, m.clay, m.leaf, 2.3, 0.77, -0.18 + k * 0.18, 0.7);
    }),
  );
  for (const zc of [-4.2, 0.6]) {
    const p = spot(b, -21.4, zc, Math.PI / 2);
    for (const [a, c] of CORNERS) p.add(m.metal, new THREE.BoxGeometry(0.04, 2.0, 0.04), a * 1.28, 1.0, c * 0.28);
    for (let r = 0; r < 4; r++) {
      p.add(m.wood, new THREE.BoxGeometry(2.6, 0.03, 0.6), 0, 0.3 + r * 0.5, 0);
      if (r > 0) p.add(grow, new THREE.BoxGeometry(2.4, 0.02, 0.06), 0, 0.27 + r * 0.5, 0);
      for (let k = 0; k < 6; k++) potOn(p, m.clay, [m.leaf, m.leaf2, m.leaf3][(r + k) % 3]!, -1.05 + k * 0.42, 0.315 + r * 0.5, 0, 0.9);
    }
  }
  sign('routineLab', -9.4, -3.4, Math.PI / 2);

  // Acompanhamento e revisão (leste, na frente): mesa de revisão com cadernos (abre a evolução do
  // ano) e o púlpito de análise; estante de diários atrás.
  const review: Placed = { x: 11.5, z: 4.2, face: -Math.PI / 2 };
  pick.push(
    sectorAt(scene, 'evolution', review.x, review.z, review.face, (p, g) => {
      p.add(m.rug, new THREE.BoxGeometry(3.8, 0.012, 3.2), 0, 0.006, 0);
      table(p, m.wood, m.wood2, 0, 0, 2.6, 1.2);
      for (const lx of [-0.8, 0, 0.8]) {
        chair(p, m.fabric, m.wood2, lx, 0.9, Math.PI);
        chair(p, m.fabric, m.wood2, lx, -0.9, 0);
      }
      for (let k = 0; k < 4; k++) p.add([m.paper, m.fabric2, m.paper, m.clay][k]!, new THREE.BoxGeometry(0.3, 0.02, 0.22), -0.9 + k * 0.6, 0.76, (k % 2) * 0.3 - 0.15, k * 0.3);
      shelf(p, m.wood2, 0, -2.0, 3.0, 1.8, 0.4, 4, [m.fabric2, m.paper, m.clay, m.wood]);
      plaque(kit, g, labels.evolution, acc, 0, 2.1, -2.0, 0, 1.6);
    }),
  );
  const lectern: Placed = { x: 11.5, z: 7.4, face: -Math.PI / 2 };
  pick.push(
    sectorAt(scene, 'analysis', lectern.x, lectern.z, lectern.face, (p, g) => {
      p.add(m.wood2, new THREE.BoxGeometry(0.8, 1.0, 0.5), 0, 0.5, 0);
      p.add(m.wood, new THREE.BoxGeometry(0.9, 0.04, 0.6).rotateX(0.3), 0, 1.08, 0);
      p.add(m.paper, new THREE.BoxGeometry(0.6, 0.02, 0.4).rotateX(0.3), 0, 1.12, 0.01);
      plaque(kit, g, labels.analysis, acc, 0, 1.6, -0.2, 0, 1.0);
    }),
  );
  sign('tracking', 9.3, 2.0, -Math.PI / 2);

  // Jardim de pausa (leste, nos fundos, e a ala leste): gramado com espreguiçadeiras, fonte baixa,
  // capim alto, biombo de bambu; na ala, banco, vasos grandes e a poltrona suspensa.
  {
    const p = spot(b, 11.5, -6.0, -Math.PI / 2);
    p.add(grass, new THREE.BoxGeometry(4.6, 0.03, 4.0), 0, 0.015, -0.4);
    for (const lx of [-0.85, 0.85]) {
      p.add(m.wood, new THREE.BoxGeometry(0.65, 0.28, 1.7), lx, 0.2, 0.2);
      p.add(m.fabric, new THREE.BoxGeometry(0.6, 0.06, 1.0), lx, 0.37, 0.45);
      p.add(m.wood, new THREE.BoxGeometry(0.62, 0.05, 0.75).rotateX(0.9), lx, 0.62, -0.45);
      // Espreguiçadeira: encosto atrás (-z), quem deita olha para +z.
      p.seat(lx, 0.4, 0.1, 0);
    }
    p.add(m.wood2, new THREE.CylinderGeometry(0.25, 0.25, 0.03, 16), 0, 0.45, 0.3);
    p.add(m.wood2, new THREE.CylinderGeometry(0.04, 0.04, 0.44, 6), 0, 0.22, 0.3);
    p.add(m.stone, new THREE.CylinderGeometry(0.6, 0.7, 0.55, 20), 0, 0.275, -1.9);
    p.add(water, new THREE.CylinderGeometry(0.52, 0.52, 0.02, 20), 0, 0.55, -1.9);
    for (const lx of [-2.0, 2.0]) {
      p.add(m.wood2, new THREE.BoxGeometry(0.8, 0.6, 0.8), lx, 0.3, -1.8);
      for (let k = 0; k < 5; k++) p.add(m.leaf2, new THREE.ConeGeometry(0.08, 1.1, 4), lx - 0.24 + k * 0.12, 1.15, -1.8 + ((k % 2) - 0.5) * 0.2, k * 0.4);
    }
    for (let k = 0; k < 15; k++) p.add(kit.mat('#B9A86A', { rough: 0.8 }), new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), -2.1 + k * 0.3, 1.3, -2.9);
    p.add(m.wood2, new THREE.BoxGeometry(4.4, 0.06, 0.08), 0, 2.4, -2.9);
    const w = spot(b, 22.2, -1.8, -Math.PI / 2);
    w.add(m.rug, new THREE.BoxGeometry(5.0, 0.012, 3.6), 0, 0.006, 1.4);
    bench(w, m.wood, m.stone, 0, 0, 0, 2.2);
    w.add(m.wood, new THREE.BoxGeometry(2.2, 0.4, 0.05), 0, 0.75, -0.22);
    for (const lx of [-3.7, 3.5]) plant(w, m.clay, m.leaf3, lx, 1.0, 1.4);
    b.add(m.metal, new THREE.CylinderGeometry(0.015, 0.015, 3.0, 4), [19.6, 4.0, -1.8]);
    b.add(m.fabric, new THREE.SphereGeometry(0.6, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.72), [19.6, 1.55, -1.8], [Math.PI, 0, 0]);
    b.add(m.fabric2, new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14), [19.6, 1.1, -1.8]);
    // A poltrona suspensa: assento na almofada, virado para o salão (-x).
    seatAt(b, 19.6, 1.15, -1.8, -Math.PI / 2);
    sign('pauseGarden', 8.8, -3.4, -Math.PI / 2);
  }
  pendants(kit, b, [[-11.5, 4.2], [-11.5, -6.0], [11.5, 4.2], [11.5, -6.0]], 6.4, H, '#FDE68A');
  pendants(kit, b, [[-20.75, -6.2], [20.75, 2.6]], 3.8, 5.5, '#FDE68A');

  finishRoom(room);
  scene.userData.seats = groundSeats(scene, b);
  const plan: Record<HabitsSector, Placed> = { atrium: station, greenhouse: lab, evolution: review, analysis: lectern };
  const overview = { cam: new THREE.Vector3(0, 5.0, 13.8), target: new THREE.Vector3(0, 1.2, -2) };
  return {
    scene,
    sectors: HABITS_SECTORS,
    pickables: pick,
    room: room.spec,
    obstacles: obs,
    view: viewer(room, plan, overview),
    actions,
    setData: (d) => {
      const x = (d ?? {}) as HabitsRoomData;
      beds.forEach((bd, i) => drawBed(bd, x.beds?.[i], !!x.still));
    },
    tick: (t) => {
      room.trees.tick(t);
      tickBeds(beds, performance.now());
    },
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/** Um canteiro da Estufa: placa, flores do "feito", halo e o lugar de ação. */
interface Bed {
  sign: ReturnType<typeof canvasPlane>;
  bloom: THREE.Object3D;
  halo: THREE.MeshBasicMaterial;
  spot: ActionSpot;
  drawn: string;
  /** Feito hoje (alvo) e quanto está aberto agora (0 a 1), animando de `from` desde `t0`. */
  on: boolean;
  grow: number;
  from: number;
  t0: number;
  moving: boolean;
}

/** Placa, ação e flores de um canteiro pelo hábito `v` (sem hábito: plano, sem placa, sem ação). */
function drawBed(bd: Bed, v: HabitBedView | undefined, still: boolean): void {
  const key = v ? `${v.id}|${v.name}|${v.line}|${v.done ? 1 : 0}|${v.color}` : '';
  if (key !== bd.drawn) {
    bd.drawn = key;
    const ctx = bd.sign.ctx;
    const c = ctx.canvas;
    ctx.clearRect(0, 0, c.width, c.height);
    if (v) {
      ctx.fillStyle = 'rgba(12,24,44,0.92)';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = v.color;
      ctx.fillRect(0, c.height - 8, c.width, 8);
      ctx.fillStyle = '#F1FAFF';
      ctx.font = '700 44px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.name, c.width / 2, c.height * 0.36, c.width - 24);
      ctx.fillStyle = v.done ? '#86EFAC' : '#FCD34D';
      ctx.font = '600 28px Inter, system-ui, sans-serif';
      ctx.fillText(v.done ? `\u2713 ${v.line}` : v.line, c.width / 2, c.height * 0.74, c.width - 24);
    }
    bd.sign.tex.needsUpdate = true;
    if (v) bd.halo.color.set(v.color);
  }
  bd.sign.mesh.visible = !!v;
  const id = v ? `bed:${v.id}` : '';
  bd.spot.id = id;
  bd.spot.active = !!v;
  bd.spot.obj.userData.hitbox = !!v;
  markAction(bd.spot.obj, id);
  const on = !!v?.done;
  if (on === bd.on) return;
  bd.on = on;
  if (still) {
    bd.grow = on ? 1 : 0;
    bd.moving = false;
    bd.bloom.scale.setScalar(Math.max(0.001, bd.grow));
    return;
  }
  bd.from = bd.grow;
  bd.t0 = performance.now();
  bd.moving = true;
}

/** Floresce (ou fecha) devagar: abre em 0,7 s passando um pouco do ponto; fecha em 0,35 s. Sem alocar nada. */
function tickBeds(beds: readonly Bed[], now: number): void {
  for (const bd of beds) {
    if (!bd.moving) continue;
    const k = Math.min(1, (now - bd.t0) / (bd.on ? 700 : 350));
    const e = bd.on ? 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2 : 1 - (1 - k) * (1 - k);
    bd.grow = bd.from + ((bd.on ? 1 : 0) - bd.from) * e;
    bd.bloom.scale.setScalar(Math.max(0.001, bd.grow));
    if (k >= 1) bd.moving = false;
  }
}

/* =====================================================================
 * GOALS — seção 23: volumes geométricos, composição vertical, átrio central. Recepção na frente do
 * embasamento hexagonal; Visão geral no átrio (pé-direito da torre), com um pedestal por meta ativa
 * (nome real), a vitrine das conquistas e a mesa de análise; Criação de objetivos na ala leste;
 * bancos e floreiras na ala oeste.
 * ===================================================================== */
export const GOALS_SECTORS = ['garden', 'achieved', 'analysis'] as const;
export type GoalsSector = (typeof GOALS_SECTORS)[number];

export function createGoalsInterior(kit: Kit, labels: Record<GoalsSector, string>): InteriorScene {
  const acc = '#EAB308';
  const room = createRoom(kit, { id: 'goals', floor: '#EFEADB', glass: '#FEF3C7', frame: '#B8A47A', accent: '#FDE68A' });
  const { scene, b } = room;
  const m = palette(kit, { wood: '#B8875B', wood2: '#7A5A3E', fabric: '#D8CBB0', fabric2: '#8C9BAB', stone: '#E9E2D0', accent: acc, rug: '#D9CFB8' });
  const sign = (key: ZoneKey, x: number, z: number, ry: number, totem = false) => zoneSign(kit, room, 'goals', b, m.metal, key, '#B7791F', x, z, ry, totem);
  const gold = kit.mat('#EAB308', { metal: 0.6, rough: 0.3 });
  const soft = kit.mat('#FDE68A', { glow: true });
  const concrete = kit.mat('#CFCAC0', { rough: 0.9 });
  const cork = kit.mat('#C9A27A', { rough: 1 });
  const pick: THREE.Group[] = [];

  // Recepção: balcão de pedra com tampo de madeira, painel de pedra com o hexágono dourado; espera
  // com duas poltronas do outro lado do eixo.
  const obs: Obstacle[] = [];
  {
    const D = RECEPTION_DESKS.goals;
    const p = spot(b, D.x, D.z, D.face);
    p.add(m.stone, new THREE.BoxGeometry(2.6, 1.0, 0.6), 0, 0.5, 0);
    p.add(m.wood, new THREE.BoxGeometry(2.7, 0.05, 0.75), 0, 1.025, 0.05);
    p.add(gold, new THREE.BoxGeometry(2.6, 0.03, 0.02), 0, 0.9, 0.31);
    deskTop(p, m.wood, m.wood2, 2.4);
    receptionChair('goals', p, m, obs);
    potOn(p, m.white, m.leaf, -0.9, 1.05, 0.0);
    p.add(concrete, new THREE.BoxGeometry(3.0, 2.6, 0.2), 0, 1.3, -1.5);
    p.add(gold, new THREE.TorusGeometry(0.5, 0.05, 6, 6), 0, 1.8, -1.38);
    const w = spot(b, -4.8, 11.4, Math.PI / 2);
    w.add(m.rug, new THREE.BoxGeometry(3.0, 0.012, 2.4), 0, 0.006, 0.3);
    for (const lx of [-0.8, 0.8]) sofa(w, m.fabric2, m.dark, lx, 0, 0, 0.9);
    w.add(m.wood, new THREE.CylinderGeometry(0.25, 0.25, 0.04, 16), 0, 0.5, 0.2);
    w.add(m.wood2, new THREE.CylinderGeometry(0.04, 0.04, 0.48, 6), 0, 0.24, 0.2);
    plant(spot(b, -6.6, 10.2, 0), m.stone, m.leaf3, 0, 0, 1.1);
    sign('reception', 4.6, 11.4, 0);
  }

  // Visão geral (átrio): incrustação hexagonal no piso, pedestais das metas ativas em volta (nome
  // real), anéis dourados suspensos no pé-direito da torre.
  b.add(kit.mat('#DDD4BE', { rough: 0.6 }), new THREE.CircleGeometry(3.0, 6), [0, 0.008, 0], [-Math.PI / 2, 0, 0]);
  b.add(gold, new THREE.RingGeometry(3.0, 3.12, 6), [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
  const boards: Board[] = [];
  for (const a of [-0.8, 0.8, -1.57, 1.57, -2.35, 2.35]) {
    const p = spot(b, Math.sin(a) * 5.6, Math.cos(a) * 5.6, a + Math.PI);
    p.add(m.stone, new THREE.BoxGeometry(0.9, 1.0, 0.9), 0, 0.5, 0);
    p.add(gold, new THREE.BoxGeometry(0.96, 0.04, 0.96), 0, 1.02, 0);
    p.add(soft, new THREE.SphereGeometry(0.2, 14, 10), 0, 1.24, 0);
    for (const s of [-1, 1]) p.add(gold, new THREE.CylinderGeometry(0.015, 0.015, 0.67, 5), s * 0.6, 1.375, 0);
    const board = nameBoard(kit, 1.7, acc);
    const [x, , z] = p.at(0, 0, 0);
    board.mesh.position.set(x, 1.95, z);
    board.mesh.rotation.y = a + Math.PI;
    scene.add(board.mesh);
    boards.push(board);
  }
  const towerTop = MASSING.goals.ground;
  [2.4, 1.8, 1.2].forEach((r, i) => {
    const y = 6.2 + i * 1.2;
    b.add(gold, new THREE.TorusGeometry(r, 0.05, 6, 6), [0, y, 0], [-Math.PI / 2, 0, 0]);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i * 0.4;
      b.add(m.metal, new THREE.CylinderGeometry(0.008, 0.008, towerTop - y, 4), [Math.cos(a) * r, (towerTop + y) / 2, Math.sin(a) * r]);
    }
  });
  b.add(soft, new THREE.TorusGeometry(1.8, 0.02, 6, 6), [0, 7.35, 0], [-Math.PI / 2, 0, 0]);
  // Vitrine das conquistas (abre as metas concluídas) no canto da frente a oeste (o de trás é a
  // escada) e mesa de análise no canto de trás a leste, virados para o átrio.
  const achieved: Placed = { x: -7.6, z: 6.4, face: Math.atan2(7.6, -6.4) };
  pick.push(
    sectorAt(scene, 'achieved', achieved.x, achieved.z, achieved.face, (p, g) => {
      p.add(m.wood2, new THREE.BoxGeometry(2.3, 0.5, 0.7), 0, 0.25, 0);
      p.add(m.glass, new THREE.BoxGeometry(2.2, 1.5, 0.6), 0, 1.25, 0);
      p.add(gold, new THREE.BoxGeometry(2.24, 0.04, 0.64), 0, 2.02, 0);
      p.add(m.glass, new THREE.BoxGeometry(2.1, 0.02, 0.5), 0, 1.25, 0);
      p.add(gold, new THREE.CylinderGeometry(0.22, 0.22, 0.32, 6), 0, 0.68, 0);
      p.add(soft, new THREE.BoxGeometry(2.0, 0.02, 0.04), 0, 1.96, 0.2);
      plaque(kit, g, labels.achieved, acc, 0, 2.3, 0, 0, 1.4);
    }),
  );
  const analysis: Placed = { x: 7.6, z: -6.4, face: Math.atan2(-7.6, 6.4) };
  pick.push(
    sectorAt(scene, 'analysis', analysis.x, analysis.z, analysis.face, (p, g) => {
      table(p, m.wood, m.dark, 0, 0, 1.8, 0.8);
      chair(p, m.fabric2, m.dark, 0, -0.7, 0);
      p.add(m.dark, new THREE.CylinderGeometry(0.08, 0.1, 0.03, 10), 0.6, 0.765, -0.2);
      p.add(m.dark, new THREE.CylinderGeometry(0.01, 0.01, 0.35, 4), 0.6, 0.95, -0.2);
      p.add(m.warm, new THREE.SphereGeometry(0.08, 10, 6), 0.6, 1.13, -0.2);
      for (let k = 0; k < 3; k++) p.add([m.fabric2, m.paper, m.clay][k]!, new THREE.BoxGeometry(0.32, 0.03, 0.24), -0.5, 0.77 + k * 0.03, 0.05, k * 0.2);
      p.add(m.wood2, new THREE.BoxGeometry(0.04, 0.2, 0.04), 0, 0.85, 0.36);
      plaque(kit, g, labels.analysis, acc, 0, 1.08, 0.36, 0, 1.0);
    }),
  );
  sign('overview', 2.3, 6.8, 0, true);
  // Ala oeste: bancos virados para o átrio e floreiras.
  {
    const p = spot(b, -12.2, 0, Math.PI / 2);
    bench(p, m.wood, m.stone, 0, 0, 0, 2.4);
    for (const lx of [-2.2, 2.2]) {
      p.add(concrete, new THREE.BoxGeometry(0.8, 0.6, 0.8), lx, 0.3, 0);
      p.add(m.leaf, new THREE.IcosahedronGeometry(0.45, 1), lx, 0.95, 0, 0, [1, 1.2, 1]);
    }
  }

  // Criação de objetivos (ala leste): mesa de trabalho com papéis, cadeiras e o quadro de cortiça
  // com fichas em branco; abre o Goals para criar.
  const create: Placed = { x: 12.0, z: 0, face: -Math.PI / 2 };
  pick.push(
    sectorAt(scene, 'garden', create.x, create.z, create.face, (p) => {
      p.add(m.rug, new THREE.BoxGeometry(3.6, 0.012, 2.6), 0, 0.006, 0.2);
      table(p, m.wood, m.dark, 0, 0, 3.0, 1.0);
      for (const lx of [-1, 0, 1]) chair(p, m.fabric, m.dark, lx, 0.75, Math.PI);
      for (const [lx, lz] of [[-0.9, -0.1], [0.4, 0.15]] as const) p.add(m.paper, new THREE.BoxGeometry(0.3, 0.04, 0.21), lx, 0.77, lz, lx);
      p.add(m.dark, new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), 1.1, 0.81, -0.2);
      p.add(cork, new THREE.BoxGeometry(2.4, 1.4, 0.04), 0, 1.5, -1.3);
      p.add(m.wood2, new THREE.BoxGeometry(2.5, 0.06, 0.06), 0, 2.23, -1.3);
      p.add(m.wood2, new THREE.BoxGeometry(2.5, 0.06, 0.06), 0, 0.77, -1.3);
      for (const s of [-1, 1]) p.add(m.wood2, new THREE.BoxGeometry(0.06, 2.3, 0.06), s * 1.24, 1.15, -1.3);
      for (let k = 0; k < 8; k++) p.add(m.paper, new THREE.BoxGeometry(0.26, 0.18, 0.01), -0.9 + (k % 4) * 0.6, 1.25 + Math.floor(k / 4) * 0.5, -1.27, ((k % 3) - 1) * 0.06);
    }),
  );
  pendants(kit, b, [[12, -0.8], [12, 0.8]], 3.4, 6, '#FFF1D6');
  sign('newGoal', 10.6, 2.6, -Math.PI / 2);

  finishRoom(room);
  scene.userData.seats = groundSeats(scene, b);
  const plan: Record<GoalsSector, Placed> = { garden: create, achieved, analysis };
  const overview = { cam: new THREE.Vector3(0, 4.6, 15.5), target: new THREE.Vector3(0, 1.6, -1) };
  return {
    scene,
    sectors: GOALS_SECTORS,
    pickables: pick,
    room: room.spec,
    obstacles: obs,
    view: viewer(room, plan, overview),
    setData: (d) => boards.forEach((bd, i) => bd.draw((d as NamesData).names[i] ?? '')),
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * MUSIC — seção 25: volumes assimétricos, madeira e concreto. Recepção à direita da entrada;
 * pequeno palco a oeste (plataforma maciça com concha de ripas e plateia, fora do eixo); parede dos
 * instrumentos do usuário nos fundos a oeste, com a mesa de estudo/análise; Espaço social musical a
 * leste (bar de audição, mesinhas e o lounge na ala baixa). O eixo da entrada até o lounge dos
 * elevadores fica livre (antes o palco ficava nele e prendia quem chegava pelo elevador).
 * Os instrumentos tocáveis (piano, bateria e violão) ficam nos andares de cima.
 * ===================================================================== */
export const MUSIC_SECTORS = ['atrium', 'instruments', 'analysis'] as const;
export type MusicSector = (typeof MUSIC_SECTORS)[number];

export function createMusicInterior(kit: Kit, labels: Record<MusicSector, string>): InteriorScene {
  const acc = '#EC4899';
  const room = createRoom(kit, { id: 'music', floor: '#EADFD2', glass: '#F5D0E4', frame: '#9A6B47', accent: '#F9A8D4' });
  const { scene, b } = room;
  const m = palette(kit, { wood: '#B08560', wood2: '#7A5537', fabric: '#9E4A64', fabric2: '#D9C3B0', stone: '#C8C3BA', accent: acc, rug: '#7E5A6A' });
  const sign = (key: ZoneKey, x: number, z: number, ry: number) => zoneSign(kit, room, 'music', b, m.metal, key, acc, x, z, ry);
  const concrete = kit.mat('#C8C3BA', { rough: 0.9 });
  const stageTop = kit.mat('#5C3F2B', { rough: 0.6 });
  const sleeves = ['#E07A5F', '#3D9970', '#5B8DB8', '#F2CC8F', '#8E7DBE', '#2B3442'].map((c) => kit.mat(c, { rough: 0.8 }));
  const pick: THREE.Group[] = [];
  const front = room.spec.front;
  const back = room.spec.back;

  // Painéis acústicos de madeira no alto das paredes de concreto (fora da entrada, do lounge dos
  // elevadores e da ala baixa).
  wallSpots(room, 26, 0.3, (x, z) => (z > front - 4 && Math.abs(x) < 6) || (z < -back + 5 && Math.abs(x) < 5) || x > 11.5).forEach(({ x, z, face }, i) => {
    b.add(m.wood, new THREE.BoxGeometry(1.5, 2.6 + Math.sin(i * 1.3) * 0.6, 0.14), [x, 4.4, z], [0, face, 0]);
  });

  // Recepção: balcão de concreto com tampo de madeira e estante de partituras atrás; banco e
  // cabideiro do outro lado do eixo.
  const obs: Obstacle[] = [];
  {
    const D = RECEPTION_DESKS.music;
    const p = spot(b, D.x, D.z, D.face);
    p.add(concrete, new THREE.BoxGeometry(2.5, 1.0, 0.6), 0, 0.5, 0);
    p.add(m.wood, new THREE.BoxGeometry(2.6, 0.05, 0.75), 0, 1.025, 0.05);
    p.add(m.glow, new THREE.BoxGeometry(2.5, 0.03, 0.02), 0, 0.06, 0.31);
    deskTop(p, m.wood, m.wood2, 2.4);
    receptionChair('music', p, m, obs);
    p.add(m.paper, new THREE.BoxGeometry(0.3, 0.02, 0.22), 0.6, 1.06, 0.05, 0.2);
    shelf(p, m.wood2, 0, -1.4, 2.4, 1.6, 0.35, 3, [m.paper, sleeves[3]!, m.paper, sleeves[5]!]);
    const w = spot(b, -3.6, 10.2, Math.PI / 2);
    bench(w, m.wood, concrete, 0, 0, 0, 2.0);
    w.add(m.dark, new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), 0, 0.9, -1.6);
    w.add(m.dark, new THREE.CylinderGeometry(0.25, 0.25, 0.03, 12), 0, 0.015, -1.6);
    for (let k = 0; k < 4; k++) w.add(m.dark, new THREE.BoxGeometry(0.2, 0.02, 0.02), Math.cos(k * 1.57) * 0.1, 1.7, -1.6 + Math.sin(k * 1.57) * 0.1, k * 1.57);
    plant(w, m.stone, m.leaf, 1.8, 0, 0.9);
    sign('reception', 2.2, 11.4, 0);
  }

  // Pequenas apresentações (oeste): plataforma maciça (não se sobe nela; colisão igual ao desenho),
  // concha de ripas atrás, microfone, monitores, banqueta, treliça de luz pendurada e a plateia.
  {
    const st = spot(b, -11.0, 4.0, Math.PI / 2);
    st.add(concrete, new THREE.BoxGeometry(5.6, 0.42, 3.0), 0, 0.21, 0);
    st.add(stageTop, new THREE.BoxGeometry(5.7, 0.05, 3.1), 0, 0.445, 0);
    st.add(m.warm, new THREE.BoxGeometry(5.6, 0.03, 0.03), 0, 0.4, 1.53);
    for (let k = -2; k <= 2; k++) st.add(m.wood, new THREE.BoxGeometry(1.12, 2.9, 0.08), k * 1.1, 1.92, -1.42 - (2 - Math.abs(k)) * 0.1, -k * 0.16);
    st.add(m.dark, new THREE.CylinderGeometry(0.14, 0.16, 0.03, 12), 0.6, 0.485, 0.6);
    st.add(m.dark, new THREE.CylinderGeometry(0.012, 0.012, 1.4, 5), 0.6, 1.17, 0.6);
    st.add(m.metal, new THREE.CylinderGeometry(0.025, 0.02, 0.14, 8), 0.6, 1.92, 0.6);
    for (const s of [-1, 1]) st.add(m.dark, new THREE.BoxGeometry(0.5, 0.3, 0.4).rotateX(-0.5), s * 1.6, 0.62, 1.1);
    st.add(m.fabric, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), -0.6, 1.1, 0.1);
    st.add(m.dark, new THREE.CylinderGeometry(0.03, 0.03, 0.63, 6), -0.6, 0.78, 0.1);
    st.add(m.dark, new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5), -0.1, 0.97, -0.2);
    st.add(m.dark, new THREE.BoxGeometry(0.45, 0.32, 0.02).rotateX(-0.5), -0.1, 1.5, -0.15);
    const ceil = ceilingAt(room, 'music', -11.0, 4.0);
    st.add(m.dark, new THREE.BoxGeometry(6.0, 0.25, 0.25), 0, 5.0, 0.9);
    for (const s of [-1, 1]) st.add(m.metal, new THREE.CylinderGeometry(0.012, 0.012, ceil - 5.12, 4), s * 2.5, (ceil + 5.12) / 2, 0.9);
    for (let k = 0; k < 4; k++) st.add(m.dark, new THREE.CylinderGeometry(0.1, 0.13, 0.28, 10).rotateX(0.6), -2.1 + k * 1.4, 4.75, 0.9);
    for (const lz of [3.2, 4.3]) for (const lx of [-1.8, -0.6, 0.6, 1.8]) chair(st, m.fabric, m.dark, lx, lz, Math.PI);
    const [sx, , sz] = st.at(-3.5, 0, 2.2);
    sign('smallStage', sx, sz, Math.PI / 2);
  }

  // Instrumentos (oeste, nos fundos): parede de ripas com um plinto por instrumento do usuário
  // (estojo fechado e o nome real), estantes de partitura e cadeiras; abre a lista de instrumentos.
  const boards: Board[] = [];
  // Mais perto da parede oeste: as cadeiras da frente ficam fora da escada (a leste dela) e do pé dela.
  const instruments: Placed = { x: -11.0, z: -7.0, face: Math.PI / 2 };
  pick.push(
    sectorAt(scene, 'instruments', instruments.x, instruments.z, instruments.face, (p, g) => {
      p.add(m.wood2, new THREE.BoxGeometry(6.2, 2.6, 0.22), 0, 1.3, -1.6);
      for (let k = 0; k < 24; k++) p.add(m.wood, new THREE.BoxGeometry(0.12, 2.5, 0.04), -2.99 + k * 0.26, 1.3, -1.47);
      p.add(m.warm, new THREE.BoxGeometry(6.0, 0.03, 0.06), 0, 2.56, -1.42);
      [-2.6, -1.56, -0.52, 0.52, 1.56, 2.6].forEach((lx, i) => {
        p.add(concrete, new THREE.BoxGeometry(0.8, 0.7, 0.6), lx, 0.35, -0.85);
        p.add(m.dark, new THREE.BoxGeometry(0.34, 0.95, 0.14), lx, 1.18, -0.9, i % 2 ? 0.08 : -0.08);
        p.add(m.metal, new THREE.BoxGeometry(0.1, 0.02, 0.03), lx, 1.5, -0.82);
        const board = nameBoard(kit, 0.98, acc);
        board.mesh.position.set(lx, 2.05, -1.43);
        g.add(board.mesh);
        boards.push(board);
      });
      for (const lx of [-1.5, 1.5]) {
        p.add(m.dark, new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5), lx, 0.5, 0.6);
        p.add(m.dark, new THREE.BoxGeometry(0.45, 0.32, 0.02).rotateX(0.5), lx, 1.08, 0.6);
        chair(p, m.fabric, m.dark, lx, 1.3, Math.PI);
      }
    }),
  );
  sign('instruments', -6.4, -2.6, Math.PI / 2);
  // Mesa de estudo/análise logo à frente da parede dos instrumentos (o fundo oeste é a escada).
  const study: Placed = { x: -10.4, z: -2.0, face: 0 };
  pick.push(
    sectorAt(scene, 'analysis', study.x, study.z, study.face, (p, g) => {
      table(p, m.wood, m.dark, 0, 0, 1.8, 0.8);
      chair(p, m.fabric, m.dark, 0, -0.7, 0);
      p.add(m.dark, new THREE.CylinderGeometry(0.08, 0.1, 0.03, 10), 0.6, 0.765, -0.2);
      p.add(m.dark, new THREE.CylinderGeometry(0.01, 0.01, 0.35, 4), 0.6, 0.95, -0.2);
      p.add(m.warm, new THREE.SphereGeometry(0.08, 10, 6), 0.6, 1.13, -0.2);
      for (let k = 0; k < 3; k++) p.add(sleeves[k]!, new THREE.BoxGeometry(0.3, 0.025, 0.22), -0.5, 0.765 + k * 0.025, 0.0, k * 0.25);
      p.add(m.wood2, new THREE.BoxGeometry(0.04, 0.2, 0.04), 0, 0.85, 0.36);
      plaque(kit, g, labels.analysis, acc, 0, 1.08, 0.36, 0, 1.0);
    }),
  );

  // Espaço social musical (leste): bar de audição (abre o Música), mesinhas e o lounge da ala baixa
  // com sofá, poltronas, mesa de centro e estante de discos.
  const bar: Placed = { x: 8.4, z: -3.0, face: -Math.PI / 2 };
  pick.push(
    sectorAt(scene, 'atrium', bar.x, bar.z, bar.face, (p) => {
      p.add(concrete, new THREE.BoxGeometry(3.0, 1.0, 0.65), 0, 0.5, 0);
      p.add(m.wood, new THREE.BoxGeometry(3.15, 0.06, 0.8), 0, 1.03, 0.05);
      p.add(m.glow, new THREE.BoxGeometry(3.0, 0.03, 0.02), 0, 0.08, 0.33);
      for (const s of [-1, 1]) {
        p.add(m.dark, new THREE.BoxGeometry(0.28, 0.42, 0.26), s * 1.3, 1.27, -0.1);
        p.add(m.metal, new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14).rotateX(Math.PI / 2), s * 1.3, 1.22, 0.04);
      }
      p.add(m.wood2, new THREE.BoxGeometry(0.7, 0.2, 0.36), 0, 1.16, -0.05);
      for (let k = 0; k < 8; k++) p.add(sleeves[k % sleeves.length]!, new THREE.BoxGeometry(0.31, 0.31, 0.01).rotateX(-0.25), -0.28 + k * 0.08, 1.3, -0.05, Math.PI / 2);
      for (const lx of [-1, 0, 1]) stool(p, m.fabric, m.dark, lx, 0.75, 0.75, Math.PI);
      shelf(p, m.wood2, 0, -1.15, 3.0, 1.3, 0.35, 3, sleeves);
    }),
  );
  for (const z of [1.8, -1.4]) {
    const p = spot(b, 5.6, z, 0);
    p.add(m.wood, new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20), 0, 0.74, 0);
    p.add(m.dark, new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), 0, 0.36, 0);
    p.add(m.dark, new THREE.CylinderGeometry(0.25, 0.25, 0.02, 14), 0, 0.01, 0);
    for (const s of [-1, 1]) stool(p, m.fabric, m.dark, 0, s * 0.7, 0.66, s > 0 ? Math.PI : 0);
  }
  {
    const lw = spot(b, 17.6, 2.2, 0);
    lw.add(m.rug, new THREE.BoxGeometry(4.8, 0.012, 4.4), 0, 0.006, 0);
    sofa(lw, m.fabric, m.dark, 1.7, 0, -Math.PI / 2, 3.0);
    for (const lz of [-1.1, 1.1]) sofa(lw, m.fabric2, m.dark, -1.6, lz, Math.PI / 2, 0.9);
    lw.add(m.wood2, new THREE.BoxGeometry(0.8, 0.38, 1.4), 0.1, 0.19, 0);
    lw.add(m.wood, new THREE.BoxGeometry(0.9, 0.05, 1.6), 0.1, 0.405, 0);
    for (let k = 0; k < 3; k++) lw.add(sleeves[k + 2]!, new THREE.BoxGeometry(0.31, 0.012, 0.31), 0.1, 0.44 + k * 0.012, -0.4, k * 0.3);
    potOn(lw, m.white, m.leaf2, 0.1, 0.43, 0.45);
    lw.add(m.dark, new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), 1.9, 0.8, 2.7);
    lw.add(m.dark, new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), 1.9, 0.015, 2.7);
    lw.add(m.warm, new THREE.ConeGeometry(0.25, 0.25, 14, 1, true), 1.9, 1.65, 2.7);
    b.add(m.wood2, new THREE.BoxGeometry(5.4, 1.1, 0.4), [16.9, 0.55, -4.5]);
    for (let k = 0; k < 48; k++) b.add(sleeves[(k * 5) % sleeves.length]!, new THREE.BoxGeometry(0.03, 0.31, 0.3), [14.4 + (k % 24) * 0.21, k < 24 ? 0.75 : 0.3, -4.45]);
    for (const [x, z] of [[13.4, 8.2], [19.6, 8.2]] as const) plant(spot(b, x, z, 0), m.stone, m.leaf3, 0, 0, 1.0);
    sign('musicSocial', 13.0, 2.2, -Math.PI / 2);
  }
  pendants(kit, b, [[5.6, 0.2], [4.4, 9.6]], 4.5, 9, '#FFE9C2');
  pendants(kit, b, [[16.2, 2.2], [18.6, 2.2]], 3.4, 5, '#FFE9C2');

  finishRoom(room);
  scene.userData.seats = groundSeats(scene, b);
  const plan: Record<MusicSector, Placed> = { atrium: bar, instruments, analysis: study };
  const overview = { cam: new THREE.Vector3(0, 5.0, 12.2), target: new THREE.Vector3(0, 1.5, -3) };
  return {
    scene,
    sectors: MUSIC_SECTORS,
    pickables: pick,
    room: room.spec,
    obstacles: obs,
    view: viewer(room, plan, overview),
    setData: (d) => boards.forEach((bd, i) => bd.draw((d as NamesData).names[i] ?? '')),
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * SPORTS — seção 26: funcional, concreto, metal e vidro. Recepção sob a marquise; Espaço multiuso no
 * meio da nave (quadra marcada no piso, traves móveis e as faixas com as modalidades reais);
 * Área de condicionamento a leste; Atividades individuais a oeste; Vestiários e sanitários na ala
 * térrea oeste. O eixo da quadra fica livre até o lounge dos elevadores.
 * ===================================================================== */
export const SPORTS_SECTORS = ['atrium', 'modalities', 'analysis'] as const;
export type SportsSector = (typeof SPORTS_SECTORS)[number];

export function createSportsInterior(kit: Kit, labels: Record<SportsSector, string>): InteriorScene {
  const acc = '#22C55E';
  const room = createRoom(kit, { id: 'sports', floor: '#E4E9E4', glass: '#BFE8CF', frame: '#2B3442', accent: acc });
  const { scene, b } = room;
  const m = palette(kit, { wood: '#C8A27A', wood2: '#8C6A4A', fabric: '#3F4A5A', fabric2: '#4C8C6A', stone: '#CFCFCB', accent: acc, rug: '#3A4250' });
  const sign = (key: ZoneKey, x: number, z: number, ry: number) => zoneSign(kit, room, 'sports', b, m.metal, key, '#15803D', x, z, ry);
  const rubber = kit.mat('#2F353F', { rough: 0.95 });
  const rubber2 = kit.mat('#3C4A5E', { rough: 0.95 });
  const courtM = kit.mat('#4F8A78', { rough: 0.85 });
  const line = kit.mat('#F8FAFC', { rough: 0.6 });
  const net = kit.mat('#E5E7EB', { glass: true, side: THREE.DoubleSide });
  const lockerM = kit.mat('#5B7083', { rough: 0.5, metal: 0.3 });
  const lockerM2 = kit.mat('#6B8296', { rough: 0.5, metal: 0.3 });
  const tile = kit.mat('#D7E3E8', { rough: 0.4 });
  const mats = ['#22C55E', '#3B82F6', '#F59E0B', '#A78BFA'].map((c) => kit.mat(c, { rough: 0.9 }));
  const pick: THREE.Group[] = [];

  // Recepção (sob a marquise): balcão com prateleira de toalhas atrás; banco e bebedouro.
  const obs: Obstacle[] = [];
  {
    const D = RECEPTION_DESKS.sports;
    const p = spot(b, D.x, D.z, D.face);
    p.add(m.stone, new THREE.BoxGeometry(2.0, 1.0, 0.6), 0, 0.5, 0);
    p.add(m.metal, new THREE.BoxGeometry(2.1, 0.05, 0.75), 0, 1.025, 0.05);
    p.add(m.glow, new THREE.BoxGeometry(2.0, 0.03, 0.02), 0, 0.06, 0.31);
    // Tampo de trabalho preso ao balcão, do lado de dentro, e a cadeira de quem atende (entre ele e as toalhas).
    p.add(m.metal, new THREE.BoxGeometry(1.8, 0.04, 0.28), 0, 0.76, -0.44);
    receptionChair('sports', p, m, obs);
    p.add(m.wood2, new THREE.BoxGeometry(1.6, 1.5, 0.3), 0, 0.75, -1.2);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) p.add(m.white, new THREE.CylinderGeometry(0.06, 0.06, 0.26, 8).rotateX(Math.PI / 2), -0.6 + k * 0.3, 0.35 + r * 0.45, -1.0);
    const w = spot(b, -3.5, 13.6, Math.PI / 2);
    bench(w, m.wood, m.stone, 0, 0, 0, 1.8);
    b.add(m.metal, new THREE.BoxGeometry(0.55, 1.3, 0.35), [-3.6, 0.65, 12.2]);
    b.add(m.glow, new THREE.BoxGeometry(0.3, 0.3, 0.02), [-3.6, 1.0, 12.38]);
    sign('reception', 3.3, 13.8, 0);
  }

  // Espaço multiuso: quadra marcada no piso (o eixo atravessa só linhas), traves móveis nos fundos
  // da quadra e, atrás dela, as faixas com as modalidades reais (abrem a lista de modalidades).
  b.add(courtM, new THREE.BoxGeometry(19, 0.02, 13), [0, 0.012, 1.0]);
  for (const s of [-1, 1]) {
    b.add(line, new THREE.BoxGeometry(19, 0.005, 0.08), [0, 0.025, 1.0 + s * 6.46]);
    b.add(line, new THREE.BoxGeometry(0.08, 0.005, 13), [s * 9.46, 0.025, 1.0]);
    b.add(line, new THREE.BoxGeometry(0.08, 0.005, 6), [s * 6.5, 0.025, 1.0]);
    for (const t of [-1, 1]) b.add(line, new THREE.BoxGeometry(3.0, 0.005, 0.08), [s * 8.0, 0.025, 1.0 + t * 3]);
    // Trave móvel.
    for (const t of [-1, 1]) {
      b.add(line, new THREE.BoxGeometry(0.08, 2.0, 0.08), [s * 9.55, 1.0, 1.0 + t * 1.5]);
      b.add(m.dark, new THREE.BoxGeometry(0.95, 0.06, 0.06), [s * 10.03, 0.03, 1.0 + t * 1.5]);
    }
    b.add(line, new THREE.BoxGeometry(0.08, 0.08, 3.08), [s * 9.55, 2.0, 1.0]);
    b.add(m.dark, new THREE.BoxGeometry(0.06, 0.06, 3.0), [s * 10.5, 0.03, 1.0]);
    b.add(net, new THREE.BoxGeometry(0.02, 2.2, 3.0), [s * 10.03, 1.0, 1.0], [0, 0, s * 0.44]);
  }
  b.add(line, new THREE.BoxGeometry(0.08, 0.005, 13), [0, 0.025, 1.0]);
  b.add(line, new THREE.RingGeometry(1.7, 1.78, 48), [0, 0.026, 1.0], [-Math.PI / 2, 0, 0]);
  const boards: Board[] = [];
  // Um pouco à frente do vão da escada (a oeste do lounge), com a folga em volta dele.
  const banners: Placed = { x: 0, z: -6.4, face: 0 };
  pick.push(
    sectorAt(scene, 'modalities', banners.x, banners.z, banners.face, (p, g) => {
      for (const lx of [-8.6, -6.1, -3.6, 3.6, 6.1, 8.6]) {
        for (const s of [-1, 1]) {
          p.add(m.dark, new THREE.BoxGeometry(0.05, 2.6, 0.05), lx + s * 0.8, 1.3, 0);
          p.add(m.dark, new THREE.BoxGeometry(0.06, 0.04, 0.5), lx + s * 0.8, 0.02, 0);
        }
        p.add(m.glow, new THREE.BoxGeometry(1.66, 0.04, 0.04), lx, 2.62, 0);
        const board = nameBoard(kit, 1.5, acc);
        board.mesh.position.set(lx, 2.2, 0.03);
        g.add(board.mesh);
        // A faixa de cada modalidade real é um objeto de ação (objects3d.ts): registra a atividade de hoje.
        setAnchor(scene, `court${boards.length}`, { x: banners.x + lx, y: 2.2, z: banners.z + 0.05, face: banners.face });
        boards.push(board);
      }
    }),
  );
  sign('multiuse', -4.0, 9.4, 0);

  // Área de condicionamento (leste): piso de borracha, rack de agachamento com barra e anilhas,
  // banco, suporte de halteres, remos e kettlebells; abre o registro de treinos.
  const cond: Placed = { x: 14.6, z: 3.0, face: -Math.PI / 2 };
  pick.push(
    sectorAt(scene, 'atrium', cond.x, cond.z, cond.face, (p) => {
      p.add(rubber, new THREE.BoxGeometry(13.0, 0.02, 6.0), 0, 0.01, 0);
      const rk = sub(p, 4.2, -1.0, 0);
      for (const [a, w] of CORNERS) rk.add(m.dark, new THREE.BoxGeometry(0.08, 2.3, 0.08), a * 0.6, 1.15, w * 0.6);
      for (const s of [-1, 1]) {
        rk.add(m.dark, new THREE.BoxGeometry(1.28, 0.08, 0.08), 0, 2.3, s * 0.6);
        rk.add(m.dark, new THREE.BoxGeometry(0.08, 0.08, 1.28), s * 0.6, 2.3, 0);
        rk.add(m.dark, new THREE.CylinderGeometry(0.22, 0.22, 0.05, 18).rotateZ(Math.PI / 2), s * 0.9, 1.4, 0.6);
      }
      rk.add(m.metal, new THREE.CylinderGeometry(0.025, 0.025, 2.1, 8).rotateZ(Math.PI / 2), 0, 1.4, 0.6);
      p.add(m.fabric, new THREE.BoxGeometry(0.32, 0.08, 1.2), 4.2, 0.45, 0.9);
      // Banco de treino: um lugar na ponta longe do rack, virado para fora dele.
      p.seat(4.2, 0.45, 1.2, 0);
      for (const s of [-1, 1]) p.add(m.dark, new THREE.BoxGeometry(0.25, 0.41, 0.08), 4.2, 0.205, 0.9 + s * 0.45);
      const dr = sub(p, -0.6, -2.3, 0);
      for (const y of [0.45, 0.85]) dr.add(m.dark, new THREE.BoxGeometry(2.6, 0.05, 0.5), 0, y, 0);
      for (const [a, w] of CORNERS) dr.add(m.dark, new THREE.BoxGeometry(0.05, 0.85, 0.05), a * 1.25, 0.425, w * 0.22);
      for (let k = 0; k < 14; k++) {
        const lx = -1.1 + (k % 7) * 0.37;
        const y = (k < 7 ? 0.45 : 0.85) + 0.09;
        dr.add(m.metal, new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6).rotateX(Math.PI / 2), lx, y, 0);
        for (const s of [-1, 1]) dr.add(m.dark, new THREE.CylinderGeometry(0.05 + (k % 7) * 0.006, 0.05 + (k % 7) * 0.006, 0.06, 10).rotateX(Math.PI / 2), lx, y, s * 0.15);
      }
      for (const lx of [-3.2, -4.6]) {
        p.add(m.metal, new THREE.BoxGeometry(0.22, 0.12, 2.2), lx, 0.3, 0);
        for (const lz of [-1.0, 1.0]) p.add(m.dark, new THREE.BoxGeometry(0.4, 0.24, 0.08), lx, 0.12, lz);
        p.add(m.dark, new THREE.CylinderGeometry(0.26, 0.26, 0.12, 16).rotateZ(Math.PI / 2), lx, 0.45, -1.1);
        p.add(m.fabric, new THREE.BoxGeometry(0.3, 0.08, 0.35), lx, 0.42, 0.3);
        p.add(m.dark, new THREE.BoxGeometry(0.4, 0.05, 0.2), lx, 0.4, -0.6, 0);
      }
      for (let k = 0; k < 5; k++) {
        p.add(m.dark, new THREE.SphereGeometry(0.1 + k * 0.01, 10, 8), -5.6, 0.11, -2.4 + k * 0.4);
        p.add(m.dark, new THREE.TorusGeometry(0.06, 0.015, 5, 12), -5.6, 0.24, -2.4 + k * 0.4, Math.PI / 2);
      }
    }),
  );
  const log: Placed = { x: 13.4, z: -8.0, face: -Math.PI / 2 };
  pick.push(
    sectorAt(scene, 'analysis', log.x, log.z, log.face, (p, g) => {
      p.add(m.metal, new THREE.BoxGeometry(1.4, 0.05, 0.7), 0, 1.05, 0);
      for (const s of [-1, 1]) p.add(m.dark, new THREE.BoxGeometry(0.05, 1.03, 0.6), s * 0.65, 0.515, 0);
      p.add(m.wood2, new THREE.BoxGeometry(0.24, 0.02, 0.32), -0.3, 1.085, 0.05, 0.1);
      p.add(m.paper, new THREE.BoxGeometry(0.22, 0.01, 0.28), -0.3, 1.1, 0.06, 0.1);
      plaque(kit, g, labels.analysis, acc, 0.15, 1.5, -0.25, 0, 1.0);
    }),
  );
  sign('conditioning', 10.8, 8.8, -Math.PI / 2);

  // Atividades individuais (oeste, no meio da lateral: o fundo oeste é a escada, com o pé dela):
  // colchonetes no piso de borracha, suporte de colchonetes enrolados, espaldar, bolas de equilíbrio
  // e rolos; sacos de pancada pendurados na frente.
  const solo: Placed = { x: -14.6, z: 1.0, face: Math.PI / 2 };
  pick.push(
    sectorAt(scene, 'atrium', solo.x, solo.z, solo.face, (p) => {
      p.add(rubber2, new THREE.BoxGeometry(7.0, 0.02, 5.6), 0, 0.01, 0);
      for (let k = 0; k < 4; k++) p.add(mats[k]!, new THREE.BoxGeometry(0.62, 0.012, 1.85), -2.4 + k * 1.6, 0.028, 0.6);
      const rack = sub(p, -1.0, -2.2, 0);
      for (const y of [0.5, 1.0]) rack.add(m.dark, new THREE.BoxGeometry(2.0, 0.05, 0.4), 0, y, 0);
      for (const [a, w] of CORNERS) rack.add(m.dark, new THREE.BoxGeometry(0.05, 1.0, 0.05), a * 0.95, 0.5, w * 0.17);
      for (let k = 0; k < 8; k++) rack.add(mats[k % 4]!, new THREE.CylinderGeometry(0.08, 0.08, 0.38, 10).rotateX(Math.PI / 2), -0.8 + (k % 4) * 0.5 + (k < 4 ? 0 : 0.2), k < 4 ? 0.6 : 1.1, 0);
      const bars = sub(p, 2.0, -2.5, 0);
      for (const s of [-1, 1]) bars.add(m.wood2, new THREE.BoxGeometry(0.06, 2.4, 0.06), s * 0.5, 1.2, 0);
      for (let k = 0; k < 10; k++) bars.add(m.wood, new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6).rotateZ(Math.PI / 2), 0, 0.25 + k * 0.22, 0);
      p.add(mats[0]!, new THREE.SphereGeometry(0.33, 16, 12), -3.0, 0.33, -1.2);
      p.add(mats[1]!, new THREE.SphereGeometry(0.3, 16, 12), -2.3, 0.3, -1.7);
      p.add(m.dark, new THREE.CylinderGeometry(0.3, 0.3, 0.6, 14, 1, true), 2.8, 0.3, 1.6);
      for (let k = 0; k < 4; k++) p.add(mats[k]!, new THREE.CylinderGeometry(0.07, 0.07, 0.8, 10), 2.75 + (k % 2) * 0.12, 0.45, 1.55 + Math.floor(k / 2) * 0.12);
    }),
  );
  b.add(rubber2, new THREE.BoxGeometry(3.0, 0.02, 4.4), [-15.0, 0.01, 7.2]);
  for (const z of [6.0, 8.4]) {
    b.add(m.metal, new THREE.CylinderGeometry(0.01, 0.01, room.spec.height - 1.75, 4), [-15.0, (room.spec.height + 1.75) / 2, z]);
    b.add(kit.mat('#B91C1C', { rough: 0.6 }), new THREE.CylinderGeometry(0.18, 0.18, 1.1, 14), [-15.0, 1.2, z]);
  }
  sign('individual', -10.8, -2.6, Math.PI / 2);

  // Vestiários e sanitários (ala oeste): armários, bancos, bancada com pias e espelhos, boxes de
  // chuveiro abertos.
  for (const zc of [-2.8, 1.8]) {
    const p = spot(b, -26.7, zc, Math.PI / 2);
    p.add(lockerM, new THREE.BoxGeometry(4.4, 1.9, 0.5), 0, 0.95, 0);
    for (let k = 0; k < 8; k++) {
      p.add(k % 2 ? lockerM : lockerM2, new THREE.BoxGeometry(0.52, 1.8, 0.02), -1.925 + k * 0.55, 0.95, 0.26);
      p.add(m.metal, new THREE.BoxGeometry(0.02, 0.12, 0.03), -1.925 + k * 0.55 + 0.18, 1.0, 0.28);
    }
    p.add(m.dark, new THREE.BoxGeometry(4.4, 0.06, 0.52), 0, 1.93, 0);
    bench(spot(b, -23.6, zc, Math.PI / 2), m.wood, m.dark, 0, 0, 0, 3.0);
  }
  b.add(m.white, new THREE.BoxGeometry(4.0, 0.9, 0.55), [-23.5, 0.45, -7.4]);
  b.add(m.stone, new THREE.BoxGeometry(4.0, 2.2, 0.08), [-23.5, 1.1, -7.73]);
  for (const x of [-24.8, -23.5, -22.2]) {
    b.add(tile, new THREE.CylinderGeometry(0.2, 0.16, 0.08, 16), [x, 0.92, -7.35]);
    b.add(m.metal, new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), [x, 1.0, -7.57]);
    b.add(m.glass, new THREE.BoxGeometry(1.1, 0.8, 0.02), [x, 1.6, -7.68]);
  }
  b.add(tile, new THREE.BoxGeometry(4.2, 2.2, 0.08), [-23.9, 1.1, 5.76]);
  for (const x of [-26.0, -24.6, -23.2, -21.8]) b.add(tile, new THREE.BoxGeometry(0.08, 2.2, 1.2), [x, 1.1, 5.2]);
  for (const x of [-25.3, -23.9, -22.5]) {
    b.add(m.metal, new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12), [x, 2.0, 5.5]);
    b.add(m.metal, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), [x, 2.15, 5.66]);
  }
  sign('lockers', -20.2, -1.0, Math.PI / 2);
  pendants(kit, b, [[-7, 1], [7, 1], [14.6, 3.0], [solo.x, solo.z], [-15.0, 7.2]], 8.2, room.spec.height, '#F0FDF4');
  pendants(kit, b, [[-23.5, -2.8], [-23.5, 1.8]], 3.6, 5, '#F0FDF4');

  finishRoom(room);
  scene.userData.seats = groundSeats(scene, b);
  const plan: Record<SportsSector, Placed> = { atrium: cond, modalities: banners, analysis: log };
  const overview = { cam: new THREE.Vector3(0, 6.0, 15.2), target: new THREE.Vector3(0, 1.2, -2) };
  return {
    scene,
    sectors: SPORTS_SECTORS,
    pickables: pick,
    room: room.spec,
    obstacles: obs,
    view: viewer(room, plan, overview),
    setData: (d) => boards.forEach((bd, i) => bd.draw((d as NamesData).names[i] ?? '')),
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}
