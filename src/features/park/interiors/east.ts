/**
 * Interiores da região Leste: Observatório Temporal (Calendar), Centro de Operações (Tasks),
 * Projects e Finanças. O térreo de cada um segue a especificação (seções 18, 19, 20 e 27): cada
 * ambiente da lista "Térreo:" é uma área de verdade dentro da planta do prédio (massing.ts), com
 * mobília própria nos materiais do prédio (seção 11) e placa com o nome. Onde o ambiente corresponde
 * a um setor do módulo, a peça principal é tocável e abre a função real; recepção e convivência são
 * só ambiente. Os quadros mostram só o que a cena recebe: a mesa do Tasks, as tarefas reais de hoje;
 * o painel e os estandes do Projects, os projetos ativos; o cofre de Finanças abre com o PIN real.
 * Corredor livre de 2,4 m da entrada (x = 0) ao lounge dos elevadores, nos fundos.
 */
import * as THREE from 'three';
import { Builder, type Kit } from '../kit';
import type { Obstacle } from '../camera';
import { STOREY } from '../massing';
import { insideAt } from '../outline';
import { canvasPlane, createRoom, finishRoom, gallerySlab, markSector, sectorGroup, sectorSign, setDetailCommon, wrap, zoneLabel, type InteriorScene, type Room } from './common';
import { vault, type Thing } from './things';

/* =====================================================================
 * Peças dos ambientes do térreo. Coordenadas do ambiente: origem no centro, +z = a frente (de onde
 * se chega). Medidas reais: assento a 0,45 m, mesa a 0,75 m, balcão a 1,05 m. Tudo juntado por
 * material (Builder): poucos desenhos por ambiente.
 * ===================================================================== */

/** Materiais de um prédio (seção 11: cada prédio com a sua combinação). */
export interface Palette {
  wood: THREE.Material;
  stone: THREE.Material;
  concrete: THREE.Material;
  metal: THREE.Material;
  dark: THREE.Material;
  fabric: THREE.Material;
  cushion: THREE.Material;
  white: THREE.Material;
  glass: THREE.Material;
  leaf: THREE.Material;
  leaf2: THREE.Material;
  pot: THREE.Material;
  rug: THREE.Material;
  acc: THREE.Material;
  accGlow: THREE.Material;
  lamp: THREE.Material;
}

export function palette(kit: Kit, accent: string, o: { wood: string; stone: string; concrete: string; fabric: string; rug: string; warm: boolean }): Palette {
  return {
    wood: kit.mat(o.wood, { rough: 0.62 }),
    stone: kit.mat(o.stone, { rough: 0.5, metal: 0.05 }),
    concrete: kit.mat(o.concrete, { rough: 0.88 }),
    metal: kit.mat('#A6B0BC', { metal: 0.85, rough: 0.28 }),
    dark: kit.mat('#2B3442', { rough: 0.5, metal: 0.3 }),
    fabric: kit.mat(o.fabric, { rough: 0.95 }),
    cushion: kit.mat('#E9E3D8', { rough: 0.95 }),
    white: kit.mat('#F4F5F7', { rough: 0.5 }),
    glass: kit.mat('#D6ECF7', { glass: true }),
    leaf: kit.mat('#4C9A4F', { rough: 0.9 }),
    leaf2: kit.mat('#3E7F44', { rough: 0.9 }),
    pot: kit.mat('#D9CBB6', { rough: 0.8 }),
    rug: kit.mat(o.rug, { rough: 1 }),
    acc: kit.mat(accent, { rough: 0.55 }),
    accGlow: kit.mat(accent, { glow: true }),
    lamp: kit.mat(o.warm ? '#FFE7B0' : '#EAF4FF', { glow: true }),
  };
}

/** Onde as peças vão: o montador (no sistema do ambiente) e os materiais do prédio. */
export interface F {
  b: Builder;
  p: Palette;
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, n = 16) => new THREE.CylinderGeometry(rt, rb, h, n);

/** Peça em (x, y, z) mais o deslocamento (ox, oz) girado `ry`, virada `ry`. */
export function at(f: F, m: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, ox = 0, oz = 0) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  f.b.add(m, g, [x + ox * c + oz * s, y, z - ox * s + oz * c], [0, ry, 0]);
}

/** Mesa (tampo a 0,75 m) sobre dois pés de painel. */
export function table(f: F, x: number, z: number, w: number, d: number, ry = 0, top: THREE.Material = f.p.wood) {
  at(f, top, box(w, 0.05, d), x, 0.745, z, ry);
  for (const s of [-1, 1]) at(f, f.p.dark, box(0.06, 0.72, d * 0.8), x, 0.36, z, ry, s * (w / 2 - 0.15), 0);
}

/** Mesa redonda num pé central; `h` = altura do tampo (0,75 sentada, 1,05 em pé). */
export function roundTable(f: F, x: number, z: number, r: number, h = 0.75, top: THREE.Material = f.p.wood) {
  at(f, top, cyl(r, r, 0.05, 28), x, h - 0.025, z);
  at(f, f.p.dark, cyl(0.05, 0.05, h - 0.05, 8), x, (h - 0.05) / 2, z);
  at(f, f.p.dark, cyl(0.3, 0.32, 0.03, 16), x, 0.015, z);
}

/** Cadeira de quem olha para `ry` (o encosto fica atrás). */
export function chair(f: F, x: number, z: number, ry: number, seat: THREE.Material = f.p.fabric) {
  at(f, seat, box(0.46, 0.07, 0.44), x, 0.45, z, ry);
  at(f, seat, box(0.46, 0.4, 0.06), x, 0.7, z, ry, 0, -0.21);
  at(f, f.p.dark, cyl(0.025, 0.025, 0.42, 6), x, 0.21, z, ry);
  at(f, f.p.dark, cyl(0.22, 0.22, 0.03, 12), x, 0.015, z, ry);
}

/** Banqueta alta (balcões e mesas em pé). */
export function stool(f: F, x: number, z: number, seat: THREE.Material = f.p.fabric) {
  at(f, seat, cyl(0.19, 0.19, 0.06, 16), x, 0.74, z);
  at(f, f.p.metal, cyl(0.025, 0.025, 0.72, 6), x, 0.36, z);
  f.b.add(f.p.metal, new THREE.TorusGeometry(0.16, 0.012, 4, 16), [x, 0.3, z], [Math.PI / 2, 0, 0]);
  at(f, f.p.metal, cyl(0.2, 0.22, 0.03, 16), x, 0.015, z);
}

/** Balcão de atendimento (1,05 m): corpo, tampo saliente, rodapé recuado, filete de luz na frente e o tampo baixo de trabalho do lado de dentro (-z). */
export function counter(f: F, x: number, z: number, w: number, d: number, ry = 0, body: THREE.Material = f.p.stone, top: THREE.Material = f.p.wood) {
  at(f, body, box(w, 0.97, d), x, 0.565, z, ry);
  at(f, f.p.dark, box(w - 0.12, 0.08, d - 0.12), x, 0.04, z, ry);
  at(f, top, box(w + 0.12, 0.05, d + 0.18), x, 1.075, z, ry, 0, 0.05);
  at(f, f.p.accGlow, box(w - 0.3, 0.035, 0.02), x, 0.3, z, ry, 0, d / 2 + 0.01);
  at(f, top, box(w - 0.2, 0.04, 0.42), x, 0.75, z, ry, 0, -d / 2 - 0.2);
}

/** Aparador baixo com as portas marcadas. */
export function credenza(f: F, x: number, z: number, w: number, ry = 0, body: THREE.Material = f.p.wood, h = 0.75) {
  at(f, body, box(w, h - 0.08, 0.45), x, 0.08 + (h - 0.08) / 2, z, ry);
  at(f, f.p.dark, box(w - 0.1, 0.08, 0.38), x, 0.04, z, ry);
  const n = Math.max(2, Math.round(w / 0.6));
  for (let k = 1; k < n; k++) at(f, f.p.dark, box(0.012, h - 0.2, 0.01), x, 0.08 + (h - 0.08) / 2, z, ry, -w / 2 + (k * w) / n, 0.226);
}

/** Estante aberta (0,4 m de fundo): laterais, fundo, prateleiras e volumes em cores fixas. */
export function shelf(f: F, x: number, z: number, w: number, h: number, ry = 0, rows = 4, frame: THREE.Material = f.p.wood, fill: readonly THREE.Material[] = []) {
  const d = 0.4;
  for (const s of [-1, 1]) at(f, frame, box(0.05, h, d), x, h / 2, z, ry, s * (w / 2 - 0.025), 0);
  at(f, frame, box(w, 0.04, d), x, h - 0.02, z, ry);
  at(f, frame, box(w - 0.1, h, 0.02), x, h / 2, z, ry, 0, -d / 2 + 0.01);
  const step = (h - 0.1) / rows;
  for (let r = 0; r < rows; r++) {
    const y = 0.06 + r * step;
    at(f, frame, box(w - 0.1, 0.03, d), x, y, z, ry);
    if (!fill.length) continue;
    const n = Math.max(2, Math.floor((w - 0.2) / 0.3));
    for (let k = 0; k < n; k++) {
      if ((k * 3 + r) % 5 === 4) continue;
      const bh = Math.min(step - 0.08, 0.2 + ((k * 7 + r * 3) % 4) * 0.035);
      at(f, fill[(k + r) % fill.length]!, box(0.22, bh, d * 0.75), x, y + 0.015 + bh / 2, z, ry, -w / 2 + 0.2 + (k * (w - 0.4)) / (n - 1), 0.02);
    }
  }
}

/** Tapete com borda na cor do prédio. */
export function rug(f: F, x: number, z: number, w: number, d: number, ry = 0, mat: THREE.Material = f.p.rug) {
  at(f, f.p.acc, box(w + 0.16, 0.008, d + 0.16), x, 0.006, z, ry);
  at(f, mat, box(w, 0.012, d), x, 0.012, z, ry);
}

/** Floreira baixa com arbustos. */
export function planter(f: F, x: number, z: number, w: number, d: number, ry = 0, body: THREE.Material = f.p.stone) {
  at(f, body, box(w, 0.5, d), x, 0.25, z, ry);
  at(f, f.p.dark, box(w - 0.12, 0.02, d - 0.12), x, 0.5, z, ry);
  const n = Math.max(1, Math.round(w / 0.7));
  for (let k = 0; k < n; k++) at(f, k % 2 ? f.p.leaf : f.p.leaf2, new THREE.IcosahedronGeometry(Math.min(d, 0.8) * 0.5, 1), x, 0.72, z, ry, -w / 2 + ((k + 0.5) * w) / n, 0);
}

/** Planta alta num vaso. */
export function tallPlant(f: F, x: number, z: number, s = 1) {
  at(f, f.p.pot, cyl(0.32 * s, 0.25 * s, 0.55 * s, 16), x, 0.275 * s, z);
  at(f, f.p.wood, cyl(0.04 * s, 0.06 * s, 1.3 * s, 6), x, 1.1 * s, z);
  for (let k = 0; k < 3; k++) f.b.add(k % 2 ? f.p.leaf : f.p.leaf2, new THREE.IcosahedronGeometry((0.5 - k * 0.09) * s, 1), [x + Math.sin(k * 2.1) * 0.15 * s, (1.45 + k * 0.38) * s, z + Math.cos(k * 2.1) * 0.15 * s], [0, k, 0], [1.2, 0.85, 1.2]);
}

/** Sofá de quem olha para `ry`. */
export function sofa(f: F, x: number, z: number, len: number, ry: number, mat: THREE.Material = f.p.fabric) {
  at(f, mat, box(len, 0.4, 0.85), x, 0.22, z, ry);
  at(f, f.p.cushion, box(len - 0.4, 0.1, 0.62), x, 0.47, z, ry, 0, 0.06);
  at(f, mat, box(len, 0.5, 0.2), x, 0.65, z, ry, 0, -0.33);
  for (const s of [-1, 1]) at(f, mat, box(0.18, 0.62, 0.85), x, 0.31, z, ry, s * (len / 2 - 0.09), 0);
}

/** Mesa de centro baixa. */
export function lowTable(f: F, x: number, z: number, w: number, d: number, ry = 0, top: THREE.Material = f.p.wood) {
  at(f, top, box(w, 0.05, d), x, 0.42, z, ry);
  at(f, f.p.dark, box(w - 0.3, 0.38, d - 0.3), x, 0.2, z, ry);
}

/** Banco de madeira sobre base maciça (sem encosto), comprido ao longo de x. */
export function benchSeat(f: F, x: number, z: number, len: number, ry = 0, base: THREE.Material = f.p.stone) {
  at(f, f.p.wood, box(len, 0.07, 0.5), x, 0.445, z, ry);
  at(f, base, box(len - 0.4, 0.41, 0.36), x, 0.205, z, ry);
}

/** Luminária de mesa (base, haste e cúpula acesa) com a base em `y`. */
export function deskLamp(f: F, x: number, y: number, z: number, metal: THREE.Material = f.p.metal) {
  at(f, metal, cyl(0.08, 0.1, 0.03, 12), x, y + 0.015, z);
  at(f, metal, cyl(0.012, 0.012, 0.4, 6), x, y + 0.22, z);
  at(f, f.p.lamp, cyl(0.06, 0.13, 0.12, 14), x, y + 0.45, z);
}

/** Luminária pendente: cabo até o teto, cúpula e o disco de luz embaixo. */
export function pendant(f: F, x: number, z: number, y: number, ceil: number, r = 0.35) {
  at(f, f.p.dark, cyl(0.008, 0.008, ceil - y, 4), x, (ceil + y) / 2, z);
  at(f, f.p.metal, cyl(r * 0.3, r, r * 0.55, 20), x, y + r * 0.275, z);
  f.b.add(f.p.lamp, new THREE.CircleGeometry(r * 0.92, 20), [x, y - 0.005, z], [Math.PI / 2, 0, 0]);
}

/** Luz linear pendente (barra) comprida ao longo de x. */
export function lightBar(f: F, x: number, z: number, len: number, ry: number, y: number, ceil: number) {
  for (const s of [-1, 1]) at(f, f.p.dark, cyl(0.008, 0.008, ceil - y, 4), x, (ceil + y) / 2, z, ry, s * (len / 2 - 0.2), 0);
  at(f, f.p.dark, box(len, 0.08, 0.16), x, y + 0.04, z, ry);
  at(f, f.p.lamp, box(len - 0.06, 0.02, 0.12), x, y - 0.005, z, ry);
}

/** Quadro em pé sobre dois pés: moldura e face (a face fica em +0,045 z), borda de baixo a `y0`. */
export function standBoard(f: F, x: number, z: number, w: number, h: number, ry = 0, y0 = 0.8, face: THREE.Material = f.p.white, frame: THREE.Material = f.p.dark) {
  for (const s of [-1, 1]) {
    at(f, frame, box(0.07, y0 + h, 0.07), x, (y0 + h) / 2, z, ry, s * (w / 2 + 0.03), 0);
    at(f, frame, box(0.5, 0.03, 0.4), x, 0.015, z, ry, s * (w / 2 + 0.03), 0);
  }
  at(f, frame, box(w + 0.1, h + 0.1, 0.05), x, y0 + h / 2, z, ry);
  at(f, face, box(w, h, 0.02), x, y0 + h / 2, z, ry, 0, 0.035);
}

/** Púlpito de consulta em pé: base, coluna e o tampo inclinado de vidro escuro (sem tela acesa). */
export function lectern(f: F, x: number, z: number, body: THREE.Material = f.p.concrete) {
  at(f, body, box(0.5, 1.0, 0.36), x, 0.5, z);
  f.b.add(f.p.dark, box(0.7, 0.04, 0.48), [x, 1.07, z + 0.04], [0.32, 0, 0]);
}

/** Placa pendurada por dois tirantes (até `top`), virada para `ry`, no grupo `g` (montador `f`, no mesmo sistema). */
export function hangSign(kit: Kit, g: THREE.Object3D, f: F, text: string, accent: string, x: number, y: number, z: number, ry: number, w = 2.6, top = y + 1.4) {
  const s = sectorSign(kit, text, accent, w);
  s.position.set(x, y, z);
  s.rotation.y = ry;
  g.add(s);
  const rod = top - (y + w * 0.125);
  if (rod > 0.05) for (const k of [-1, 1]) at(f, f.p.dark, cyl(0.008, 0.008, rod, 4), x, y + w * 0.125 + rod / 2, z, ry, k * (w / 2 - 0.15), 0);
}

/** Um ambiente: grupo na planta, virado para `face`, com montador próprio; com `sector`, tudo nele é tocável. */
export interface Zone {
  g: THREE.Group;
  f: F;
  /** Do sistema do ambiente para a planta. */
  w: (lx: number, lz: number) => [number, number];
}

export function zone(p: Palette, x: number, z: number, face: number, sector?: string): Zone {
  const g = sector ? sectorGroup(sector, x, z, face) : new THREE.Group();
  if (!sector) {
    g.position.set(x, 0, z);
    g.rotation.y = face;
  }
  const c = Math.cos(face);
  const s = Math.sin(face);
  return { g, f: { b: new Builder(), p }, w: (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c] };
}

/** Fecha o ambiente: junta as peças, marca o setor (se houver) e põe na cena. */
export function closeZone(scene: THREE.Object3D, zn: Zone): THREE.Group {
  zn.g.add(zn.f.b.build());
  const id = zn.g.userData.sector as string | undefined;
  if (id) markSector(zn.g, id);
  scene.add(zn.g);
  return zn.g;
}

/** Obstáculo (móvel maciço) num ponto do ambiente. */
export function solid(obs: Obstacle[], zn: Zone, lx: number, lz: number, r: number, h = 1.1) {
  const [x, z] = zn.w(lx, lz);
  obs.push({ x, z, r, h });
}

export interface View {
  cam: THREE.Vector3;
  target: THREE.Vector3;
}

/** Vista de uma área: recua na frente dela até `back` m (sem sair da planta) e olha do alto. */
export function areaView(room: Room, x: number, z: number, face: number, back = 8, h = 4.4, ty = 1.2): View {
  let d = back;
  while (d > 3 && !insideAt(room.vols, x + Math.sin(face) * d, z + Math.cos(face) * d, 1)) d -= 0.5;
  return { cam: new THREE.Vector3(x + Math.sin(face) * d, h, z + Math.cos(face) * d), target: new THREE.Vector3(x, ty, z) };
}

/** Ponto a `r` m do centro no ângulo `deg` (graus; 0 = frente). */
const polar = (deg: number, r: number): [number, number] => [Math.sin((deg * Math.PI) / 180) * r, Math.cos((deg * Math.PI) / 180) * r];
const rad = (deg: number) => (deg * Math.PI) / 180;

/* =====================================================================
 * CALENDAR — Observatório Temporal (seção 18). Recepção no pórtico; átrio redondo sob o relógio
 * astronômico, com os balcões do dia; painel temporal em arco (semana, mês, ano, planejamento);
 * visão do dia na ala radial leste e agenda rápida na ala oeste; convivência no lado oeste do tambor.
 * Vidro, metal e concreto.
 * ===================================================================== */
export const CALENDAR_SECTORS = ['atrium', 'daily', 'weekly', 'monthly', 'agenda', 'planning', 'calendars'] as const;
export type CalendarSector = (typeof CALENDAR_SECTORS)[number];

export function createCalendarInterior(kit: Kit, labels: Record<CalendarSector, string>): InteriorScene {
  const room = createRoom(kit, { id: 'calendar', floor: '#EDF1F8', glass: '#BFD3F5', frame: '#B8C2CF', accent: '#93C5FD' });
  const { scene, b } = room;
  const H = room.spec.height;
  const ACC = '#93C5FD';
  const p = palette(kit, '#2563EB', { wood: '#B08A66', stone: '#DCE1E8', concrete: '#C9CDD3', fabric: '#5B6F95', rug: '#A9BCDD', warm: false });
  const f: F = { b, p };
  const brass = kit.mat('#D4B572', { metal: 0.8, rough: 0.3 });
  const navy = kit.mat('#0F1E46', { rough: 0.4, metal: 0.2 });
  const tile = kit.mat('#DCE6F7', { rough: 0.6 });
  const obstacles: Obstacle[] = [];
  const picks: THREE.Group[] = [];
  const views: Partial<Record<string, View>> = {};

  // Piso do átrio: as horas (linhas radiais) e dois anéis, como o relógio de sol do terraço.
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    b.add(kit.mat('#C9D6EE', { rough: 0.6 }), new THREE.BoxGeometry(0.1, 0.02, 6), [Math.sin(a) * 7, 0.01, Math.cos(a) * 7], [0, a, 0]);
  }
  for (const r of [4.2, 10]) b.add(kit.mat('#B7C6E3', { rough: 0.6 }), new THREE.RingGeometry(r - 0.06, r + 0.06, 96), [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
  // Galeria circular a meia altura do tambor (na planta dele), com guarda-corpo de vidro.
  b.add(p.white, gallerySlab(room, 5, 12.5));
  b.add(kit.mat('#CFE0FA', { glass: true }), new THREE.CylinderGeometry(12.5, 12.5, 1, 48, 1, true), [0, 5.55, 0]);
  for (const [x, z] of [[-5.5, 6.5], [5.5, 6.5], [0, -7]] as const) pendant(f, x, z, 4.0, H, 0.5);
  for (const s of [-1, 1]) tallPlant(f, s * 3.2, 13.6, 1);

  // Relógio astronômico suspenso (Ø 8 m) no átrio, com ponteiros na hora real.
  const clock = new THREE.Group();
  clock.position.set(0, 6.4, 0);
  const rings: THREE.Mesh[] = [];
  for (const [r, tilt] of [[4, 0], [3.3, 0.5], [2.6, -0.4]] as const) {
    const m = new THREE.Mesh(kit.own(new THREE.TorusGeometry(r, 0.1, 8, 96)), brass);
    m.rotation.x = Math.PI / 2 + tilt;
    clock.add(m);
    rings.push(m);
  }
  const face = new THREE.Mesh(kit.own(new THREE.CircleGeometry(2.2, 48)), kit.mat('#0F1E46', { rough: 0.5, side: THREE.DoubleSide }));
  const hand = new THREE.Mesh(kit.own(new THREE.BoxGeometry(0.16, 1.8, 0.06)), kit.mat('#FBBF24', { glow: true }));
  hand.geometry.translate(0, 0.8, 0.05);
  const handM = new THREE.Mesh(kit.own(new THREE.BoxGeometry(0.1, 2.1, 0.06)), kit.mat('#F2F4F8', { metal: 0.4 }));
  handM.geometry.translate(0, 1, 0.08);
  clock.add(face, hand, handM);
  scene.add(clock);
  b.add(kit.mat('#334155', { metal: 0.6 }), new THREE.CylinderGeometry(0.03, 0.03, H - 6.4, 4), [0, (H + 6.4) / 2 + 2, 0]);

  // Recepção no pórtico: balcão de concreto com tampo de madeira à esquerda de quem entra.
  {
    const zn = zone(p, -2.7, 17.4, Math.PI / 2);
    counter(zn.f, 0, 0, 2.6, 0.7, 0, p.concrete, p.wood);
    chair(zn.f, 0, -0.75, 0);
    deskLamp(zn.f, 0.85, 1.1, 0.05, brass);
    at(zn.f, p.pot, cyl(0.14, 0.11, 0.22, 12), -0.95, 1.21, 0.05);
    at(zn.f, p.leaf, new THREE.IcosahedronGeometry(0.2, 1), -0.95, 1.45, 0.05);
    pendant(zn.f, -0.6, -0.1, 3.4, 6, 0.3);
    pendant(zn.f, 0.6, -0.1, 3.4, 6, 0.3);
    hangSign(kit, zn.g, zn.f, zoneLabel('reception'), ACC, 0, 4.3, -0.1, -Math.PI / 2, 2.2, 6);
    solid(obstacles, zn, -0.7, 0, 0.6);
    solid(obstacles, zn, 0.7, 0, 0.6);
    closeZone(scene, zn);
    // Do outro lado do eixo: banco de espera.
    const zb = zone(p, 2.9, 17.4, -Math.PI / 2);
    benchSeat(zb.f, 0, 0, 2.2, 0, p.concrete);
    closeZone(scene, zb);
  }

  // Átrio: dois balcões curvos do dia (r 4,6 a 5,2) dos dois lados do eixo, tampo azul-noite com
  // as marcas das horas em latão. Tocar abre o resumo de hoje e os próximos eventos.
  {
    const zn = zone(p, 0, 0, 0, 'atrium');
    const top = kit.mat('#1E3A8A', { rough: 0.2, metal: 0.4 });
    for (const t0 of [-0.87, Math.PI - 0.87]) {
      const sh = new THREE.Shape();
      sh.absarc(0, 0, 5.2, t0, t0 + 1.74, false);
      sh.absarc(0, 0, 4.6, t0 + 1.74, t0, true);
      zn.f.b.add(p.concrete, new THREE.ExtrudeGeometry(sh, { depth: 0.92, bevelEnabled: false, curveSegments: 24 }), [0, 0.95, 0], [Math.PI / 2, 0, 0]);
      zn.f.b.add(top, new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false, curveSegments: 24 }), [0, 0.99, 0], [Math.PI / 2, 0, 0]);
      for (let k = 0; k <= 6; k++) {
        const t = t0 + (k / 6) * 1.74;
        zn.f.b.add(brass, box(0.05, 0.012, k % 3 ? 0.25 : 0.45), [Math.cos(t) * 4.9, 1.0, Math.sin(t) * 4.9], [0, Math.atan2(Math.cos(t), Math.sin(t)), 0]);
        if (k % 2 === 0) obstacles.push({ x: Math.cos(t) * 4.9, z: Math.sin(t) * 4.9, r: 0.45, h: 1 });
      }
    }
    hangSign(kit, zn.g, zn.f, zoneLabel('atrium'), ACC, 0, 3.3, 5.6, 0, 2.6, H);
    picks.push(closeZone(scene, zn));
    views.atrium = { cam: new THREE.Vector3(0, 5.2, 12.5), target: new THREE.Vector3(0, 2.5, 0) };
  }

  // Painel temporal: as escalas do tempo em arco, de frente para o átrio (grades vazias: os
  // compromissos de verdade abrem no painel de cada uma).
  const TIME: ReadonlyArray<[CalendarSector, number]> = [['weekly', 38], ['monthly', 60], ['calendars', 82], ['planning', 104]];
  for (const [id, deg] of TIME) {
    const [x, z] = polar(deg, 11.6);
    const fc = rad(deg) + Math.PI;
    const zn = zone(p, x, z, fc, id);
    const sf = zn.f;
    standBoard(sf, 0, -0.7, 3.0, 1.9, 0, 0.85, p.white, p.metal);
    const fz = -0.7 + 0.05;
    at(sf, navy, box(2.9, 0.16, 0.012), 0, 2.63, fz);
    if (id === 'weekly') {
      for (let k = 0; k < 7; k++) at(sf, k >= 5 ? kit.mat('#C7D7F2', { rough: 0.6 }) : tile, box(0.36, 1.45, 0.01), -1.26 + k * 0.42, 1.75, fz);
    } else if (id === 'monthly') {
      for (let k = 0; k < 35; k++) at(sf, tile, box(0.36, 0.25, 0.01), -1.26 + (k % 7) * 0.42, 2.34 - Math.floor(k / 7) * 0.3, fz);
    } else if (id === 'calendars') {
      for (let k = 0; k < 12; k++) {
        const lx = -1.08 + (k % 4) * 0.72;
        const y = 2.25 - Math.floor(k / 4) * 0.5;
        at(sf, tile, box(0.64, 0.42, 0.01), lx, y, fz);
        at(sf, kit.mat('#93C5FD', { rough: 0.6 }), box(0.64, 0.06, 0.012), lx, y + 0.18, fz);
      }
    } else {
      for (let k = 0; k < 4; k++) at(sf, tile, box(2.8, 0.3, 0.01), 0, 2.3 - k * 0.38, fz);
      for (let k = 0; k <= 6; k++) at(sf, kit.mat('#9DB3D6', { rough: 0.6 }), box(0.012, 1.5, 0.012), -1.4 + k * 0.467, 1.75, fz + 0.004);
    }
    lectern(sf, 0, 0.55);
    hangSign(kit, zn.g, sf, labels[id], ACC, 0, 3.05, -0.7, 0, 2.0, 3.05);
    solid(obstacles, zn, 0, 0.55, 0.4);
    picks.push(closeZone(scene, zn));
    views[id] = areaView(room, x, z, fc, 7, 3.6, 1.6);
  }
  {
    const [x, z] = polar(71, 10.0);
    hangSign(kit, scene, f, zoneLabel('timePanel'), ACC, x, 3.9, z, rad(71), 2.8, H);
  }

  // Convivência: tapete, sofás frente a frente, poltrona, mesa de centro, plantas e pendente.
  {
    const [x, z] = polar(-70, 10.2);
    const zn = zone(p, x, z, rad(-70) + Math.PI);
    const lf = zn.f;
    rug(lf, 0, -0.3, 5.0, 3.4);
    sofa(lf, -1.9, -0.3, 2.0, Math.PI / 2);
    sofa(lf, 1.9, -0.3, 2.0, -Math.PI / 2);
    sofa(lf, 0, -1.75, 1.1, 0, kit.mat('#7C8FA6', { rough: 0.95 }));
    lowTable(lf, 0, -0.3, 1.4, 0.8, 0, p.wood);
    at(lf, brass, cyl(0.12, 0.1, 0.18, 12), 0.3, 0.535, -0.3);
    for (const s of [-1, 1]) tallPlant(lf, s * 2.5, -1.9, 0.9);
    pendant(lf, 0, -0.3, 3.0, H, 0.5);
    hangSign(kit, zn.g, lf, zoneLabel('lounge'), ACC, 0, 3.4, -2.0, 0, 2.4, H);
    solid(obstacles, zn, 0, -0.3, 0.6, 0.5);
    closeZone(scene, zn);
  }

  // Visão do dia (ala radial leste): régua das horas na parede, mesa de reunião e luz linear.
  const dayBoard = canvasPlane(kit, 3.5, 2.1, 256, true);
  {
    const [x, z] = polar(120, 18.6);
    const fc = rad(120) + Math.PI;
    const zn = zone(p, x, z, fc, 'daily');
    const df = zn.f;
    standBoard(df, 0, -2.3, 3.6, 2.2, 0, 0.9, p.white, p.metal);
    dayBoard.mesh.position.set(0, 2.0, -2.3 + 0.06);
    zn.g.add(dayBoard.mesh);
    credenza(df, 0, -1.75, 3.0, 0, p.concrete, 0.6);
    table(df, 0, 0.2, 2.4, 1.1, 0, p.wood);
    for (const lx of [-0.6, 0.6]) {
      chair(df, lx, -0.55, 0);
      chair(df, lx, 0.95, Math.PI);
    }
    lightBar(df, 0, 0.2, 2.0, 0, 2.9, H);
    for (const s of [-1, 1]) tallPlant(df, s * 2.7, -1.8, 0.9);
    hangSign(kit, zn.g, df, zoneLabel('dayView'), ACC, 0, 3.6, 1.4, 0, 2.4, H);
    solid(obstacles, zn, 0, 0.2, 0.9);
    picks.push(closeZone(scene, zn));
    views.daily = areaView(room, x, z, fc, 9, 4.2, 1.5);
    // A régua do dia: das 7h às 22h (só as horas; os eventos reais ficam no painel).
    const ctx = dayBoard.ctx;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#F6F9FF';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '600 15px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < 16; k++) {
      const y = 12 + (k * (h - 24)) / 15;
      ctx.fillStyle = k % 3 === 0 ? '#9DB3D6' : '#D7E2F3';
      ctx.fillRect(70, y, w - 86, k % 3 === 0 ? 2 : 1);
      ctx.fillStyle = '#334A75';
      ctx.fillText(`${String(7 + k).padStart(2, '0')}:00`, 14, y);
    }
    dayBoard.tex.needsUpdate = true;
  }

  // Agenda rápida (ala radial oeste): quadro de lista, dois púlpitos de consulta em pé e banco.
  {
    const [x, z] = polar(-120, 18.6);
    const fc = rad(-120) + Math.PI;
    const zn = zone(p, x, z, fc, 'agenda');
    const qf = zn.f;
    standBoard(qf, 0, -2.3, 3.4, 2.0, 0, 0.9, p.white, p.metal);
    for (let k = 0; k < 6; k++) {
      at(qf, tile, box(3.0, 0.22, 0.01), 0.1, 1.15 + k * 0.3, -2.25);
      at(qf, p.acc, box(0.08, 0.22, 0.012), -1.5, 1.15 + k * 0.3, -2.245);
    }
    for (const s of [-1, 1]) lectern(qf, s * 1.1, 0.4);
    benchSeat(qf, -2.6, -0.5, 1.8, Math.PI / 2, p.concrete);
    tallPlant(qf, 2.7, -1.8, 0.9);
    tallPlant(qf, 2.7, 1.2, 0.8);
    pendant(qf, -1.1, 0.4, 2.9, H, 0.3);
    pendant(qf, 1.1, 0.4, 2.9, H, 0.3);
    hangSign(kit, zn.g, qf, zoneLabel('quickAgenda'), ACC, 0, 3.6, 1.2, 0, 2.4, H);
    for (const s of [-1, 1]) solid(obstacles, zn, s * 1.1, 0.4, 0.4);
    picks.push(closeZone(scene, zn));
    views.agenda = areaView(room, x, z, fc, 9, 4.2, 1.5);
  }

  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 4, 14.5), target: new THREE.Vector3(0, 4.5, -4) };
  return {
    scene,
    sectors: CALENDAR_SECTORS,
    pickables: picks,
    room: room.spec,
    obstacles,
    view: (id) => views[id] ?? overview,
    setData: () => undefined,
    tick: (t, camera) => {
      room.trees.tick(t);
      const d = new Date();
      const m = d.getMinutes() + d.getSeconds() / 60;
      const h = (d.getHours() % 12) + m / 60;
      hand.rotation.z = -(h / 12) * Math.PI * 2;
      handM.rotation.z = -(m / 60) * Math.PI * 2;
      rings[1]!.rotation.z = t * 0.12;
      rings[2]!.rotation.z = -t * 0.08;
      // O mostrador sempre de frente para quem olha.
      clock.rotation.y = Math.atan2(camera.position.x, camera.position.z);
    },
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * TASKS — Centro de Operações (seção 19). Recepção e criação rápida dos dois lados da entrada;
 * visão geral das tarefas (a mesa digital com as tarefas reais de hoje, o quadro kanban e o de
 * listas) a oeste do salão; tarefas prioritárias (matriz e calendário de prazos) a leste; revisão
 * na ala térrea oeste. Concreto, vidro e madeira.
 * ===================================================================== */
export const TASKS_SECTORS = ['atrium', 'capture', 'lists', 'kanban', 'planning', 'recurrence', 'archive'] as const;
export type TasksSector = (typeof TASKS_SECTORS)[number];
export interface TasksRoomData {
  title: string;
  /** Tarefas de hoje e atrasadas (títulos reais). */
  today: string[];
  overdue: number;
}

export function createTasksInterior(kit: Kit, labels: Record<TasksSector, string>): InteriorScene {
  const room = createRoom(kit, { id: 'tasks', floor: '#E9ECF1', glass: '#BBD3F0', frame: '#2B3442', accent: '#22D3EE' });
  const { scene, b } = room;
  const H = room.spec.height;
  /** Pé-direito da ala térrea oeste (massing.ts). */
  const WING = 5;
  const ACC = '#22D3EE';
  const p = palette(kit, '#22D3EE', { wood: '#A27552', stone: '#D5D8DC', concrete: '#B4B8BD', fabric: '#3F5872', rug: '#9AA8B8', warm: false });
  const f: F = { b, p };
  const graphite = kit.mat('#2B3442', { metal: 0.5, rough: 0.4 });
  const silver = kit.mat('#CBD5E1', { metal: 0.85, rough: 0.25 });
  const lane = kit.mat('#E2E8F0', { rough: 0.6 });
  const obstacles: Obstacle[] = [];
  const picks: THREE.Group[] = [];
  const views: Partial<Record<string, View>> = {};
  for (const s of [-1, 1]) tallPlant(f, s * 12.5, 11.5, 1.1);

  // Recepção, à esquerda de quem entra: balcão de concreto com tampo de madeira e aparador.
  {
    const zn = zone(p, -6.6, 10.6, Math.PI / 2);
    counter(zn.f, 0, 0, 3.0, 0.75, 0, p.concrete, p.wood);
    chair(zn.f, 0, -0.8, 0);
    credenza(zn.f, 0, -1.65, 2.8, 0, p.wood, 0.8);
    deskLamp(zn.f, 1.0, 1.1, 0.05);
    for (const lx of [-0.7, 0.7]) pendant(zn.f, lx, -0.2, 3.4, H, 0.3);
    hangSign(kit, zn.g, zn.f, zoneLabel('reception'), ACC, 0, 3.0, 0, -Math.PI / 2, 2.2, H);
    solid(obstacles, zn, -0.8, 0, 0.6);
    solid(obstacles, zn, 0.8, 0, 0.6);
    closeZone(scene, zn);
  }

  // Criação rápida, à direita da entrada: balcão em pé com três terminais e banquetas.
  {
    const zn = zone(p, 6.6, 10.6, -Math.PI / 2, 'capture');
    const cf = zn.f;
    counter(cf, 0, 0, 3.8, 0.7, 0, p.concrete, p.wood);
    for (let k = 0; k < 3; k++) {
      const lx = (k - 1) * 1.2;
      at(cf, graphite, box(0.06, 0.2, 0.06), lx, 1.17, -0.12);
      cf.b.add(graphite, box(0.62, 0.42, 0.04), [lx, 1.32, -0.05], [-0.5, 0, 0]);
      cf.b.add(p.accGlow, box(0.54, 0.34, 0.01), [lx, 1.335, -0.025], [-0.5, 0, 0]);
      stool(cf, lx, 0.75);
    }
    shelf(cf, 0, -1.2, 3.0, 1.2, 0, 2, p.wood, [p.white, p.acc, silver]);
    hangSign(kit, zn.g, cf, zoneLabel('quickCreate'), ACC, 0, 3.0, 0, Math.PI / 2, 2.4, H);
    for (const lx of [-1.2, 1.2]) solid(obstacles, zn, lx, 0, 0.7);
    picks.push(closeZone(scene, zn));
    views.capture = areaView(room, 6.6, 10.6, -Math.PI / 2, 7, 3.8);
  }

  // Visão geral das tarefas: a mesa digital (7,6 m) em pé, banquetas dos dois lados e luz linear.
  const top = canvasPlane(kit, 7.4, 2.8, 300, true);
  {
    const zn = zone(p, -8.0, 1.5, Math.PI / 2, 'atrium');
    const of = zn.f;
    at(of, graphite, box(7.6, 0.9, 3.0), 0, 0.45, 0);
    at(of, silver, box(7.8, 0.06, 3.2), 0, 0.93, 0);
    for (const s of [-1, 1]) at(of, p.accGlow, box(7.4, 0.03, 0.02), 0, 0.2, s * 1.51);
    for (const lx of [-2.7, -0.9, 0.9, 2.7]) for (const s of [-1, 1]) stool(of, lx, s * 1.95);
    top.mesh.rotation.x = -Math.PI / 2;
    top.mesh.position.set(0, 0.97, 0);
    zn.g.add(top.mesh);
    for (const s of [-1, 1]) lightBar(of, 0, s * 0.7, 6.0, 0, 3.8, H);
    hangSign(kit, zn.g, of, zoneLabel('tasksOverview'), ACC, 0, 3.0, 0, -Math.PI / 2, 2.8, H);
    for (const lx of [-2.8, -0.9, 0.9, 2.8]) solid(obstacles, zn, lx, 0, 1.4);
    picks.push(closeZone(scene, zn));
    views.atrium = areaView(room, -8.0, 1.5, Math.PI / 2, 7, 6, 0.8);
  }
  // Os quadros da visão geral (kanban e listas), atrás da mesa, de frente para ela.
  const boardZone = (id: TasksSector, x: number, z: number, face: number, draw: (bf: F) => void) => {
    const zn = zone(p, x, z, face, id);
    standBoard(zn.f, 0, 0, 3.4, 2.0, 0, 0.8, p.white, graphite);
    draw(zn.f);
    hangSign(kit, zn.g, zn.f, labels[id], ACC, 0, 3.15, 0, 0, 2.0, 3.15);
    solid(obstacles, zn, -1.0, 0, 0.5);
    solid(obstacles, zn, 1.0, 0, 0.5);
    picks.push(closeZone(scene, zn));
    views[id] = areaView(room, x, z, face, 7, 3.6, 1.7);
  };
  // Kanban: três colunas com o cabeçalho na cor (os cartões reais abrem no painel).
  boardZone('kanban', -11.2, -6.2, 0, (bf) => {
    for (let c = 0; c < 3; c++) {
      const lx = (c - 1) * 1.1;
      at(bf, kit.mat(['#22D3EE', '#60A5FA', '#34D399'][c]!, { rough: 0.5 }), box(1.0, 0.14, 0.012), lx, 2.62, 0.05);
      at(bf, lane, box(1.0, 1.6, 0.008), lx, 1.72, 0.048);
    }
  });
  // Listas: pautas com a caixinha de marcar.
  boardZone('lists', -6.4, -6.2, 0, (bf) => {
    for (let k = 0; k < 6; k++) {
      at(bf, lane, box(2.6, 0.03, 0.01), 0.25, 1.0 + k * 0.28, 0.05);
      at(bf, p.acc, box(0.14, 0.14, 0.012), -1.3, 1.08 + k * 0.28, 0.05);
    }
  });

  // Tarefas prioritárias (no volume ligado a leste): matriz urgente × importante e mesa em pé.
  {
    const zn = zone(p, 11.6, 0.5, -Math.PI / 2, 'planning');
    const pf = zn.f;
    standBoard(pf, 0, -0.4, 3.0, 2.2, 0, 0.7, p.white, graphite);
    const Q = ['#FCA5A5', '#FCD34D', '#93C5FD', '#CBD5E1'];
    for (let k = 0; k < 4; k++) at(pf, kit.mat(Q[k]!, { rough: 0.6 }), box(1.4, 1.0, 0.01), k % 2 ? 0.75 : -0.75, k < 2 ? 2.35 : 1.25, -0.35);
    at(pf, graphite, box(0.03, 2.1, 0.014), 0, 1.8, -0.345);
    at(pf, graphite, box(2.9, 0.03, 0.014), 0, 1.8, -0.345);
    roundTable(pf, 0, 1.6, 0.55, 1.05, p.wood);
    for (const s of [-1, 1]) stool(pf, s * 0.75, 1.9);
    pendant(pf, 0, 1.6, 2.9, H, 0.4);
    hangSign(kit, zn.g, pf, zoneLabel('priority'), ACC, 0, 3.4, 0.6, 0, 2.6, H);
    solid(obstacles, zn, 0, 1.6, 0.6);
    picks.push(closeZone(scene, zn));
    views.planning = areaView(room, 11.6, 0.5, -Math.PI / 2, 7, 3.8, 1.6);
  }
  // Prazos, junto das prioridades: calendário de parede (grade do mês, vazia).
  boardZone('recurrence', 7.0, -6.6, 0, (bf) => {
    at(bf, p.acc, box(3.2, 0.16, 0.012), 0, 2.68, 0.05);
    for (let k = 0; k < 35; k++) at(bf, lane, box(0.4, 0.3, 0.008), -1.38 + (k % 7) * 0.46, 2.4 - Math.floor(k / 7) * 0.34, 0.048);
  });

  // Revisão (ala térrea oeste): estantes do que foi concluído, mesa redonda de revisão, aparador.
  {
    const zn = zone(p, -19.5, 1, Math.PI / 2, 'archive');
    const vf = zn.f;
    const books = [p.acc, lane, kit.mat('#94A3B8', { rough: 0.7 }), p.wood];
    for (const s of [-1, 1]) shelf(vf, s * 1.9, -2.15, 3.4, 2.0, 0, 4, p.wood, books);
    roundTable(vf, 0, 0.1, 0.8);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      chair(vf, Math.sin(a) * 1.15, 0.1 + Math.cos(a) * 1.15, a + Math.PI);
    }
    credenza(vf, 3.4, -0.9, 1.6, Math.PI / 2, p.wood, 0.9);
    tallPlant(vf, -3.6, 0.6, 0.85);
    pendant(vf, 0, 0.1, 2.9, WING, 0.45);
    hangSign(kit, zn.g, vf, zoneLabel('review'), ACC, 0, 3.4, 1.2, 0, 2.4, WING);
    hangSign(kit, zn.g, vf, labels.archive, ACC, 0, 2.35, -2.15, 0, 1.8, 2.35);
    solid(obstacles, zn, 0, 0.1, 0.9);
    for (const lx of [-2.7, -1.1, 1.1, 2.7]) solid(obstacles, zn, lx, -2.15, 0.6, 2);
    picks.push(closeZone(scene, zn));
    views.archive = areaView(room, -19.5, 1, Math.PI / 2, 8, 3.6);
  }
  finishRoom(room);

  let data: TasksRoomData | null = null;
  const draw = () => {
    const ctx = top.ctx;
    const { width: w, height: h } = ctx.canvas;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0B1A33');
    grad.addColorStop(1, '#10304A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9BE7F5';
    ctx.font = '700 30px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(data?.title ?? '', 30, 50);
    const list = data?.today ?? [];
    ctx.font = '500 24px Inter, system-ui, sans-serif';
    list.slice(0, 8).forEach((title, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 30 + col * (w / 2);
      const y = 100 + row * 52;
      ctx.fillStyle = 'rgba(34,211,238,0.16)';
      ctx.fillRect(x, y - 30, w / 2 - 60, 42);
      ctx.fillStyle = '#E8FBFF';
      ctx.fillText(wrap(ctx, title, w / 2 - 90, 1)[0] ?? '', x + 14, y);
    });
    top.tex.needsUpdate = true;
  };
  draw();
  const overview = { cam: new THREE.Vector3(0, 7, 13), target: new THREE.Vector3(0, 0.8, -1) };
  return {
    scene,
    sectors: TASKS_SECTORS,
    pickables: picks,
    room: room.spec,
    obstacles,
    view: (id) => views[id] ?? overview,
    setData: (d) => {
      data = d as TasksRoomData;
      draw();
    },
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * PROJECTS — Centro de Projetos (seção 20). Recepção logo depois do pórtico; no átrio iluminado
 * (pé-direito alto sob o mezanino), o painel de projetos suspenso com os projetos ativos; a parede
 * leste com um estande por projeto ativo; a oeste, o estúdio de criação de projetos e, ao fundo,
 * objetivos e status. Concreto, vidro e madeira.
 * ===================================================================== */
export const PROJECTS_SECTORS = ['studio', 'gallery'] as const;
export type ProjectsSector = (typeof PROJECTS_SECTORS)[number];
export interface ProjectsRoomData {
  projects: Array<{ name: string; color: string }>;
}

export function createProjectsInterior(kit: Kit, labels: Record<ProjectsSector, string>): InteriorScene {
  const room = createRoom(kit, { id: 'projects', floor: '#F2EDE6', glass: '#F5DCC7', frame: '#F97316', accent: '#FDBA74' });
  const { scene, b } = room;
  const H = room.spec.height;
  /** Teto do átrio da frente: a cobertura do 1º andar (o mezanino só cobre o fundo). */
  const TALL = H + STOREY;
  const ACC = '#F97316';
  const p = palette(kit, '#F97316', { wood: '#B5865C', stone: '#E4DED4', concrete: '#BDB7AE', fabric: '#8C6A55', rug: '#D8C8B4', warm: true });
  const f: F = { b, p };
  const white = kit.mat('#F7F4EF', { rough: 0.5 });
  const obstacles: Obstacle[] = [];
  const picks: THREE.Group[] = [];
  const views: Partial<Record<string, View>> = {};
  for (const s of [-1, 1]) tallPlant(f, s * 3.2, 12.0, 1.1);
  for (const [x, z] of [[-5, -4], [5, -4], [0, -7]] as const) pendant(f, x, z, 5.5, H, 0.45);

  // Recepção, à esquerda de quem passa o pórtico.
  {
    const zn = zone(p, -6.5, 10.4, Math.PI / 2);
    counter(zn.f, 0, 0, 3.0, 0.75, 0, p.concrete, p.wood);
    chair(zn.f, 0, -0.8, 0);
    credenza(zn.f, 0, -1.65, 2.8, 0, p.wood, 0.8);
    deskLamp(zn.f, -1.0, 1.1, 0.05);
    for (const lx of [-0.7, 0.7]) pendant(zn.f, lx, -0.2, 3.4, TALL, 0.3);
    hangSign(kit, zn.g, zn.f, zoneLabel('reception'), ACC, 0, 3.0, 0, -Math.PI / 2, 2.2, TALL);
    solid(obstacles, zn, -0.8, 0, 0.6);
    solid(obstacles, zn, 0.8, 0, 0.6);
    closeZone(scene, zn);
  }

  // Painel de projetos: suspenso na borda do mezanino (sob a laje, a 9 m), de frente para a entrada,
  // com o nome e a cor de cada projeto ativo.
  const boardC = canvasPlane(kit, 7.0, 2.6, 256);
  {
    const zn = zone(p, 0, 1.15, 0, 'gallery');
    at(zn.f, p.dark, box(7.2, 2.8, 0.08), 0, 6.1, 0);
    boardC.mesh.position.set(0, 6.1, 0.05);
    zn.g.add(boardC.mesh);
    for (const s of [-1, 1]) at(zn.f, p.dark, cyl(0.01, 0.01, H - 7.5, 4), s * 3.2, (H + 7.5) / 2, 0);
    hangSign(kit, zn.g, zn.f, labels.gallery, ACC, 0, 4.4, 0.06, 0, 2.2, 4.4);
    picks.push(closeZone(scene, zn));
    views.gallery = { cam: new THREE.Vector3(0, 4.0, 12), target: new THREE.Vector3(0, 5.0, 1.2) };
  }
  const drawBoard = (list: ProjectsRoomData['projects']) => {
    const ctx = boardC.ctx;
    const { width: w, height: h } = ctx.canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(28,20,14,0.92)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ACC;
    ctx.fillRect(0, h - 8, w, 8);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFE7C2';
    ctx.font = '700 30px Inter, system-ui, sans-serif';
    ctx.fillText(zoneLabel('projectsBoard'), 28, 34, w - 56);
    ctx.font = '600 24px Inter, system-ui, sans-serif';
    list.slice(0, 8).forEach((pr, i) => {
      const x = 28 + (i % 2) * (w / 2);
      const y = 86 + Math.floor(i / 2) * 42;
      ctx.fillStyle = pr.color;
      ctx.fillRect(x, y - 10, 20, 20);
      ctx.fillStyle = '#F8F3EC';
      ctx.fillText(wrap(ctx, pr.name, w / 2 - 80, 1)[0] ?? '', x + 32, y);
    });
    if (!list.length) {
      ctx.fillStyle = 'rgba(248,243,236,0.5)';
      ctx.fillText('—', 28, 86);
    }
    boardC.tex.needsUpdate = true;
  };
  drawBoard([]);

  // Projetos ativos: a parede leste com seis estandes (cada um ganha o nome e a cor de um projeto
  // ativo), maquete num pedestal e trilho de spots.
  const STANDS = [9.6, 5.8, 2.0, -1.8, -5.6, -9.4];
  const stands: Array<{ wall: THREE.Mesh; board: ReturnType<typeof canvasPlane> }> = [];
  {
    const zn = zone(p, 12.4, 0, -Math.PI / 2, 'gallery');
    const sf = zn.f;
    at(sf, p.dark, box(20.8, 0.06, 0.08), 0, 3.6, -0.3);
    // Tirantes do trilho: na frente (x local > 0 = z > 0) ele pende da cobertura do átrio; atrás, da laje do mezanino.
    for (const s of [-1, 1]) {
      const ceil = s > 0 ? TALL : H;
      at(sf, p.dark, cyl(0.01, 0.01, ceil - 3.6, 4), s * 10, (ceil + 3.6) / 2, -0.3);
    }
    STANDS.forEach((lx) => {
      at(sf, white, box(3.2, 0.2, 2.4), lx, 0.1, 0);
      const wall = new THREE.Mesh(kit.own(new THREE.BoxGeometry(3.0, 2.8, 0.15)), kit.own(new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.5 })));
      wall.position.set(lx, 1.6, -1.05);
      zn.g.add(wall);
      const board = canvasPlane(kit, 2.6, 0.7, 112);
      board.mesh.position.set(lx, 2.6, -0.96);
      zn.g.add(board.mesh);
      at(sf, p.stone, box(0.55, 0.9, 0.55), lx + 0.9, 0.65, 0.2);
      at(sf, p.wood, box(0.4, 0.16, 0.36), lx + 0.9, 1.18, 0.2);
      at(sf, white, box(0.18, 0.34, 0.18), lx + 0.95, 1.43, 0.15);
      at(sf, p.acc, box(0.12, 0.2, 0.12), lx + 0.8, 1.36, 0.3);
      at(sf, p.dark, cyl(0.07, 0.09, 0.16, 10), lx, 3.5, -0.3);
      at(sf, p.lamp, cyl(0.06, 0.06, 0.01, 10), lx, 3.415, -0.3);
      solid(obstacles, zn, lx + 0.9, 0.2, 0.45);
      stands.push({ wall, board });
    });
    hangSign(kit, zn.g, sf, zoneLabel('activeProjects'), ACC, 0.1, 4.2, 0.8, 0, 2.8, H);
    picks.push(closeZone(scene, zn));
  }

  // Criação de projetos (estúdio, a oeste do átrio): duas mesas de trabalho com cadeiras, quadro de
  // cortiça para as ideias, estante de materiais, tapete e luz linear.
  {
    const zn = zone(p, -8.8, 3.0, Math.PI / 2, 'studio');
    const nf = zn.f;
    const cork = kit.mat('#C8A27A', { rough: 0.95 });
    rug(nf, 0, 0.2, 6.2, 3.6);
    for (const lx of [-1.6, 1.6]) {
      table(nf, lx, 0.3, 2.6, 1.2, 0, p.wood);
      for (const k of [-0.6, 0.6]) {
        chair(nf, lx + k, -0.65, 0);
        chair(nf, lx + k, 1.25, Math.PI);
      }
      at(nf, white, box(0.6, 0.01, 0.42), lx - 0.4, 0.775, 0.2, 0.2);
      at(nf, p.acc, box(0.3, 0.06, 0.2), lx + 0.6, 0.8, 0.35);
      lightBar(nf, lx, 0.3, 2.2, 0, 3.0, TALL);
      solid(obstacles, zn, lx, 0.3, 0.9);
    }
    standBoard(nf, 0, -2.2, 4.4, 1.6, 0, 0.9, cork, p.wood);
    for (let k = 0; k < 9; k++) at(nf, kit.mat(['#FDE68A', '#FBCFE8', '#BFDBFE', '#FFFFFF'][k % 4]!, { rough: 0.9 }), box(0.42, 0.3, 0.01), -1.8 + (k % 5) * 0.9, 1.3 + Math.floor(k / 5) * 0.7 + ((k * 37) % 10) / 100, -2.15);
    shelf(nf, 3.0, -1.0, 2.0, 1.8, -Math.PI / 2, 4, p.wood, [p.acc, white, p.concrete, p.wood]);
    hangSign(kit, zn.g, nf, labels.studio, ACC, 0, 2.8, -2.2, 0, 2.0, 2.8);
    hangSign(kit, zn.g, nf, zoneLabel('newProject'), ACC, 0, 3.6, -0.6, 0, 2.6, TALL);
    picks.push(closeZone(scene, zn));
    views.studio = areaView(room, -8.8, 3.0, Math.PI / 2, 8, 4.6);
  }

  // Objetivos e status (ao fundo, a oeste): quadro com o alvo e as colunas de status (vazias: o status
  // real de cada projeto abre no painel) e mesa redonda em pé.
  {
    const zn = zone(p, -8.8, -7.4, Math.PI / 2, 'studio');
    const sf = zn.f;
    standBoard(sf, 0, -2.1, 3.6, 2.0, 0, 0.8, p.white, p.dark);
    ([[0.7, p.acc], [0.48, white], [0.26, p.acc]] as Array<[number, THREE.Material]>).forEach(([r, m], k) => sf.b.add(m, new THREE.CircleGeometry(r, 32), [-1.0, 1.8, -2.05 + k * 0.004]));
    for (let k = 0; k < 4; k++) at(sf, kit.mat(['#FDBA74', '#93C5FD', '#86EFAC', '#CBD5E1'][k]!, { rough: 0.6 }), box(0.36, 1.6, 0.01), 0.15 + k * 0.42, 1.8, -2.05);
    roundTable(sf, 0, 0.3, 0.6, 1.05, p.wood);
    stool(sf, -0.8, 0.6);
    stool(sf, 0.8, 0.6);
    stool(sf, 0, 1.15);
    pendant(sf, 0, 0.3, 2.9, H, 0.4);
    hangSign(kit, zn.g, sf, zoneLabel('status'), ACC, 0, 3.3, -0.6, 0, 2.6, H);
    solid(obstacles, zn, 0, 0.3, 0.65);
    picks.push(closeZone(scene, zn));
  }

  // Bancos e floreira no átrio (espera).
  {
    const zn = zone(p, 5.5, 7.5, -Math.PI / 2);
    planter(zn.f, 0, 0.45, 2.8, 0.6, 0, p.concrete);
    benchSeat(zn.f, 0, -0.45, 2.6, 0, p.concrete);
    closeZone(scene, zn);
  }
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, 14), target: new THREE.Vector3(0, 1.5, -2) };
  return {
    scene,
    sectors: PROJECTS_SECTORS,
    pickables: picks,
    room: room.spec,
    obstacles,
    view: (id) => views[id] ?? overview,
    setData: (d) => {
      const list = (d as ProjectsRoomData).projects;
      stands.forEach((s, i) => {
        const pr = list[i];
        (s.wall.material as THREE.MeshStandardMaterial).color.set(pr ? pr.color : '#CBD5E1');
        const c = s.board.ctx.canvas;
        s.board.ctx.clearRect(0, 0, c.width, c.height);
        s.board.ctx.fillStyle = pr ? 'rgba(12,24,44,0.92)' : 'rgba(12,24,44,0.4)';
        s.board.ctx.fillRect(0, 0, c.width, c.height);
        s.board.ctx.fillStyle = '#F1FAFF';
        s.board.ctx.font = '700 44px Inter, system-ui, sans-serif';
        s.board.ctx.textAlign = 'center';
        s.board.ctx.textBaseline = 'middle';
        s.board.ctx.fillText(pr ? pr.name : '—', c.width / 2, c.height / 2, c.width - 24);
        s.board.tex.needsUpdate = true;
      });
      drawBoard(list);
    },
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * FINANCE — Centro de Gestão Financeira (seção 27). Recepção institucional depois do pórtico;
 * visão financeira (mesa hexagonal e o painel no anexo oeste); saldos e movimentações (mesa de
 * registros e gaveteiro); funções principais (três estações a leste, ao fundo); o cofre redondo no
 * anexo leste, com o PIN real de Finanças. Pedra clara, vidro, madeira e latão.
 * ===================================================================== */
export const FINANCE_SECTORS = ['academy', 'investments', 'market', 'planning', 'journal'] as const;
export type FinanceSector = (typeof FINANCE_SECTORS)[number];

export function createFinanceInterior(kit: Kit, labels: Record<FinanceSector, string>): InteriorScene {
  const room = createRoom(kit, { id: 'finance', floor: '#EEF0F4', glass: '#C7D7F5', frame: '#2563EB', accent: '#FDE68A' });
  const { scene, b } = room;
  const H = room.spec.height;
  const ACC = '#D4B572';
  const p = palette(kit, '#D4B572', { wood: '#8A5A3B', stone: '#E8E2D6', concrete: '#CFC8BA', fabric: '#2E3F5C', rug: '#B9A27E', warm: true });
  const f: F = { b, p };
  const gold = kit.mat('#D4B572', { metal: 0.85, rough: 0.25 });
  const blue = kit.mat('#2563EB', { metal: 0.35, rough: 0.35 });
  const walnut = kit.mat('#6E452D', { rough: 0.6 });
  const obstacles: Obstacle[] = [];
  const picks: THREE.Group[] = [];
  const views: Partial<Record<string, View>> = {};
  for (const s of [-1, 1]) tallPlant(f, s * 3.4, 10.4, 1);

  // Recepção institucional: balcão de pedra com tampo de madeira e friso de latão, painel de pedra
  // com frisos atrás.
  {
    const zn = zone(p, -5.6, 8.4, Math.PI / 2);
    const rf = zn.f;
    counter(rf, 0, 0, 3.0, 0.75, 0, p.stone, p.wood);
    at(rf, gold, box(3.0, 0.03, 0.02), 0, 0.95, 0.39);
    chair(rf, 0, -0.8, 0);
    at(rf, p.stone, box(2.8, 2.6, 0.12), 0, 1.3, -1.8);
    for (let k = 0; k < 3; k++) at(rf, gold, box(2.6, 0.02, 0.02), 0, 0.9 + k * 0.7, -1.735);
    deskLamp(rf, 1.0, 1.1, 0.05, gold);
    for (const lx of [-0.7, 0.7]) pendant(rf, lx, -0.2, 3.3, H, 0.3);
    hangSign(kit, zn.g, rf, zoneLabel('reception'), ACC, 0, 3.0, 0, -Math.PI / 2, 2.2, H);
    solid(obstacles, zn, -0.8, 0, 0.6);
    solid(obstacles, zn, 0.8, 0, 0.6);
    closeZone(scene, zn);
  }

  // Visão financeira: a mesa hexagonal azul com tampo de latão e banquetas, sob um lustre em anel.
  {
    const zn = zone(p, -6.5, -0.5, 0, 'investments');
    const vf = zn.f;
    vf.b.add(gold, new THREE.TorusGeometry(2.0, 0.08, 6, 6), [0, 0.04, 0], [-Math.PI / 2, 0, Math.PI / 6]);
    at(vf, blue, new THREE.CylinderGeometry(1.2, 1.4, 1, 6), 0, 0.5, 0);
    at(vf, gold, new THREE.CylinderGeometry(1.25, 1.25, 0.08, 6), 0, 1.04, 0);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      stool(vf, Math.sin(a) * 1.85, Math.cos(a) * 1.85);
    }
    vf.b.add(gold, new THREE.TorusGeometry(1.1, 0.04, 6, 6), [0, 3.4, 0], [-Math.PI / 2, 0, Math.PI / 6]);
    vf.b.add(p.lamp, new THREE.TorusGeometry(1.0, 0.025, 6, 6), [0, 3.37, 0], [-Math.PI / 2, 0, Math.PI / 6]);
    for (let k = 0; k < 3; k++) at(vf, p.dark, cyl(0.008, 0.008, H - 3.4, 4), Math.sin((k * Math.PI * 2) / 3) * 1.05, (H + 3.4) / 2, Math.cos((k * Math.PI * 2) / 3) * 1.05);
    solid(obstacles, zn, 0, 0, 1.5);
    picks.push(closeZone(scene, zn));
    views.investments = areaView(room, -6.5, -0.5, Math.PI / 2, 8, 4.4);
  }
  // O painel da visão financeira no anexo oeste: parede ripada de madeira com moldura de latão, o
  // nome do ambiente e um banco.
  {
    const zn = zone(p, -14.8, 0, Math.PI / 2, 'investments');
    const af = zn.f;
    at(af, p.wood, box(4.0, 3.2, 0.12), 0, 1.6, 0);
    for (let k = 0; k < 9; k++) at(af, walnut, box(0.05, 3.2, 0.03), -1.8 + k * 0.45, 1.6, 0.075);
    for (const y of [0.5, 2.9]) at(af, gold, box(3.4, 0.04, 0.03), 0, y, 0.1);
    hangSign(kit, zn.g, af, zoneLabel('financeView'), ACC, 0, 1.9, 0.13, 0, 2.8, 1.9);
    benchSeat(af, 0, 1.3, 2.2, 0, p.stone);
    picks.push(closeZone(scene, zn));
  }

  // Saldos e movimentações: mesa de registros com cadeiras, livros-razão e o gaveteiro alto atrás.
  {
    const zn = zone(p, 6.4, 7.6, -Math.PI / 2, 'journal');
    const jf = zn.f;
    rug(jf, 0, 0.1, 3.0, 2.4);
    table(jf, 0, 0, 2.2, 1.0, 0, p.wood);
    chair(jf, 0, -0.8, 0);
    for (const lx of [-0.55, 0.55]) chair(jf, lx, 0.95, Math.PI);
    at(jf, kit.mat('#5B2C1F', { rough: 0.7 }), box(0.4, 0.06, 0.3), -0.6, 0.8, -0.1);
    at(jf, kit.mat('#1F3A5F', { rough: 0.7 }), box(0.4, 0.05, 0.3), -0.6, 0.855, -0.1, 0.1);
    deskLamp(jf, 0.8, 0.77, -0.25, gold);
    at(jf, p.wood, box(3.4, 2.2, 0.4), 0, 1.1, -1.7);
    for (let r = 0; r < 5; r++) {
      at(jf, walnut, box(3.36, 0.012, 0.01), 0, 0.22 + r * 0.42, -1.495);
      for (let k = 0; k < 6; k++) at(jf, gold, box(0.14, 0.02, 0.02), -1.42 + k * 0.57, 0.42 + r * 0.42, -1.49);
    }
    pendant(jf, 0, 0, 2.6, H, 0.35);
    hangSign(kit, zn.g, jf, zoneLabel('balances'), ACC, 0, 3.2, 0.2, Math.PI / 2, 2.4, H);
    solid(obstacles, zn, 0, 0, 0.9);
    for (const lx of [-0.9, 0.9]) solid(obstacles, zn, lx, -1.7, 0.7, 2.2);
    picks.push(closeZone(scene, zn));
    views.journal = areaView(room, 6.4, 7.6, -Math.PI / 2, 7, 3.8);
  }

  // Funções principais: três estações em fila a leste, ao fundo (academia, mercado, planejamento),
  // cada uma com mesa, quem atende, cadeira de visita, aparador e a placa da função.
  const FUNCS: ReadonlyArray<[FinanceSector, number]> = [['academy', -10.3], ['market', -7.6], ['planning', -4.9]];
  for (const [id, z] of FUNCS) {
    const zn = zone(p, 8.6, z, -Math.PI / 2, id);
    const mf = zn.f;
    table(mf, 0, 0, 2.0, 0.85, 0, p.wood);
    at(mf, p.stone, box(1.9, 0.55, 0.04), 0, 0.42, 0.4);
    chair(mf, 0, -0.75, 0);
    chair(mf, 0, 0.9, Math.PI);
    credenza(mf, 0, -1.35, 2.0, 0, p.wood, 0.7);
    at(mf, p.dark, box(0.7, 0.42, 0.04), 0, 1.05, -0.15);
    at(mf, p.dark, box(0.06, 0.25, 0.06), 0, 0.88, -0.2);
    deskLamp(mf, -0.75, 0.77, -0.2, gold);
    hangSign(kit, zn.g, mf, labels[id], ACC, 0, 2.6, -0.3, 0, 1.8, H);
    solid(obstacles, zn, 0, 0, 0.8);
    picks.push(closeZone(scene, zn));
    views[id] = areaView(room, 8.6, z, -Math.PI / 2, 7, 3.8);
  }
  hangSign(kit, scene, f, zoneLabel('mainFunctions'), ACC, 6.6, 3.6, -7.6, -Math.PI / 2, 2.8, H);

  // Espera ao fundo, a oeste: sofás frente a frente, mesa de centro e plantas.
  {
    const zn = zone(p, -7.6, -8.4, 0);
    const lf = zn.f;
    rug(lf, 0, 0, 4.4, 2.8);
    sofa(lf, 0, -1.05, 2.2, 0);
    sofa(lf, 0, 1.05, 2.2, Math.PI);
    lowTable(lf, 0, 0, 1.2, 0.6, 0, p.wood);
    for (const s of [-1, 1]) tallPlant(lf, s * 2.3, 0, 0.9);
    pendant(lf, 0, 0, 2.8, H, 0.45);
    solid(obstacles, zn, 0, 0, 0.5, 0.5);
    closeZone(scene, zn);
  }

  // Cofre: porta redonda no anexo leste (o volume geométrico do cofre, massing.ts), de frente para o
  // salão, com a câmara encostada na parede de fora do anexo. Abre com o PIN real de Finanças, pelo
  // mesmo bloqueio da tela de Finanças; o motor junta o cofre aos objetos funcionais do térreo
  // (userData.things). Na frente, o medalhão de latão no piso e a placa.
  const things: Thing[] = [vault(kit, scene, 0, 13.5, 0, 0, -Math.PI / 2)];
  scene.userData.things = things;
  b.add(kit.mat('#E2DACB', { rough: 0.4 }), new THREE.CircleGeometry(1.15, 48), [11.9, 0.011, 0], [-Math.PI / 2, 0, 0]);
  b.add(gold, new THREE.RingGeometry(1.1, 1.18, 48), [11.9, 0.014, 0], [-Math.PI / 2, 0, 0]);
  hangSign(kit, scene, f, zoneLabel('vault'), ACC, 12.6, 4.6, 0, -Math.PI / 2, 2.0, H);
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, 13), target: new THREE.Vector3(0, 1.2, -2) };
  return {
    scene,
    sectors: FINANCE_SECTORS,
    pickables: picks,
    room: room.spec,
    obstacles,
    view: (id) => views[id] ?? overview,
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}
