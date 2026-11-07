/**
 * Camada de detalhe dos interiores (V2.1, seção 11), em todos os andares:
 * - térreo: plantas altas em vasos, bancos, luminárias, painéis de arte, pendentes em anel e
 *   balcão de recepção, encaixados em volta do salão sem cobrir o que o prédio já tem;
 * - andares de cima: teto diferente em cada andar, saguão do elevador com sofá e mesa,
 *   bancos e floreiras ao longo do guarda-corpo do átrio e a marca de cada prédio.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import type { Builder, Kit } from '../kit';
import type { Obstacle, Seat } from '../camera';
import { clock, drums, globe, lamp as floorLamp, piano, record, telescope, type Thing } from './things';

interface Ctx {
  kit: Kit;
  b: Builder;
  seats: Seat[];
  accent: string;
  warm: boolean;
  /** Onde ficam os objetos funcionais (malhas soltas, que se mexem) e a lista deles. */
  root: THREE.Object3D;
  things: Thing[];
  level: number;
  top: boolean;
}

function mats(c: Ctx) {
  const k = c.kit;
  return {
    wood: k.mat(c.warm ? '#A27552' : '#8E9AA8', { rough: 0.7 }),
    light: k.mat(c.warm ? '#C9A27A' : '#D5DCE4', { rough: 0.6 }),
    dark: k.mat('#2B3442', { rough: 0.5 }),
    metal: k.mat('#A6B0BC', { metal: 0.8, rough: 0.3 }),
    pot: k.mat('#D9CBB6', { rough: 0.8 }),
    leaf: k.mat('#4C9A4F', { rough: 0.9 }),
    leaf2: k.mat('#3E7F44', { rough: 0.9 }),
    fabric: k.mat(c.warm ? '#B98B73' : '#7C8FA6', { rough: 0.95 }),
    glow: k.mat(c.warm ? '#FFE7B0' : '#E8F4FF', { glow: true }),
    acc: k.mat(c.accent, { rough: 0.6 }),
    accGlow: k.mat(c.accent, { glow: true }),
    white: k.mat('#F4F5F7', { rough: 0.5 }),
  };
}

/** Planta alta num vaso (palmeira de interior / ficus): tronco e camadas de folhas. */
function tallPlant(c: Ctx, x: number, y: number, z: number, s = 1) {
  const m = mats(c);
  c.b.add(m.pot, new THREE.CylinderGeometry(0.32 * s, 0.25 * s, 0.55 * s, 16), [x, y + 0.27 * s, z]);
  c.b.add(m.wood, new THREE.CylinderGeometry(0.04 * s, 0.06 * s, 1.4 * s, 6), [x, y + 1.2 * s, z]);
  for (let k = 0; k < 3; k++) c.b.add(k % 2 ? m.leaf : m.leaf2, new THREE.IcosahedronGeometry((0.45 - k * 0.08) * s, 1), [x + Math.sin(k * 2.1) * 0.15 * s, y + (1.5 + k * 0.35) * s, z + Math.cos(k * 2.1) * 0.15 * s], [0, k, 0], [1.2, 0.8, 1.2]);
}

function bench(c: Ctx, x: number, y: number, z: number, face: number, len = 1.8) {
  const m = mats(c);
  c.b.add(m.wood, new THREE.BoxGeometry(len, 0.08, 0.45), [x, y + 0.45, z], [0, face, 0]);
  for (const s of [-1, 1]) c.b.add(m.dark, new THREE.BoxGeometry(0.06, 0.42, 0.4), [x + Math.cos(face) * s * (len / 2 - 0.1), y + 0.21, z - Math.sin(face) * s * (len / 2 - 0.1)], [0, face, 0]);
  c.seats.push({ x, y: y + 0.45, z, face });
}

function sofa(c: Ctx, x: number, y: number, z: number, face: number, len = 2) {
  const m = mats(c);
  const bx = -Math.sin(face) * 0.35;
  const bz = -Math.cos(face) * 0.35;
  c.b.add(m.fabric, new THREE.BoxGeometry(len, 0.42, 0.85), [x, y + 0.21, z], [0, face, 0]);
  c.b.add(m.fabric, new THREE.BoxGeometry(len, 0.45, 0.2), [x + bx, y + 0.62, z + bz], [0, face, 0]);
  c.seats.push({ x, y: y + 0.45, z, face });
}

function artPanel(c: Ctx, x: number, y: number, z: number, face: number, seed: number) {
  const m = mats(c);
  const cols = ['#E07A5F', '#81B29A', '#F2CC8F', '#5B8DB8', '#C06C84', '#3D405B'];
  c.b.add(m.dark, new THREE.BoxGeometry(0.06, 1.2, 0.06), [x, y + 0.6, z]);
  c.b.add(m.dark, new THREE.BoxGeometry(1.3, 0.95, 0.05), [x, y + 1.65, z], [0, face, 0]);
  c.b.add(c.kit.mat(cols[seed % cols.length]!, { rough: 0.8 }), new THREE.BoxGeometry(1.15, 0.8, 0.02), [x + Math.sin(face) * 0.035, y + 1.65, z + Math.cos(face) * 0.035], [0, face, 0]);
  c.b.add(c.kit.mat(cols[(seed + 2) % cols.length]!, { rough: 0.8 }), new THREE.CircleGeometry(0.22, 20), [x + Math.sin(face) * 0.05, y + 1.7, z + Math.cos(face) * 0.05], [0, face, 0]);
}

/** Térreo: anel de detalhes junto ao vidro, pendentes e recepção, sem invadir o que já existe. */
export function enrichGround(kit: Kit, b: Builder, seats: Seat[], obstacles: Obstacle[], R: number, H: number, accent: string, warm: boolean, root: THREE.Object3D, things: Thing[]) {
  const c: Ctx = { kit, b, seats, accent, warm, root, things, level: 0, top: false };
  const free = (x: number, z: number, r: number) => !obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r);
  const n = Math.max(10, Math.floor((Math.PI * 2 * R) / 5.5));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    // Livre na entrada (frente) e na passagem para o elevador (fundos).
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.38 || Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.3) continue;
    const r = R - 1.7;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (!free(x, z, 1.2)) continue;
    const kind = k % 4;
    if (kind === 0) tallPlant(c, x, 0, z, 1.1);
    else if (kind === 1) bench(c, x, 0, z, a + Math.PI);
    else if (kind === 2) things.push(floorLamp(kit, root, 0, x, 0, z, warm));
    else artPanel(c, x, 0, z, a + Math.PI, k);
  }
  // Pendentes em anel no alto do salão.
  const m = mats(c);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.26;
    const x = Math.sin(a) * R * 0.62;
    const z = Math.cos(a) * R * 0.62;
    c.b.add(m.metal, new THREE.CylinderGeometry(0.008, 0.008, 1.4, 4), [x, H - 0.7, z]);
    c.b.add(m.glow, new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), [x, H - 1.45, z], [Math.PI, 0, 0]);
  }
  // Balcão de recepção perto da entrada, de frente para quem chega.
  const rx = R * 0.35;
  const rz = R - 5;
  if (free(rx, rz, 2)) {
    b.add(m.light, new THREE.BoxGeometry(2.6, 1.05, 0.7), [rx, 0.52, rz]);
    b.add(m.white, new THREE.BoxGeometry(2.7, 0.05, 0.8), [rx, 1.07, rz]);
    b.add(m.accGlow, new THREE.BoxGeometry(2.6, 0.08, 0.02), [rx, 0.3, rz + 0.36]);
    tallPlant(c, rx + 1.8, 0, rz, 0.8);
  }
}

const SIGNATURE: Partial<Record<ModuleId, (c: Ctx, x: number, y: number, z: number, face: number) => void>> = {
  library: (c, x, y, z, face) => {
    const m = mats(c);
    if (c.level === 1) c.things.push(globe(c.kit, c.root, c.level, x - Math.sin(face) * 0.2 + Math.cos(face) * 1.6, y, z - Math.cos(face) * 0.2 - Math.sin(face) * 1.6));
    // Cantinho de leitura: estante curva e poltrona.
    for (let k = 0; k < 5; k++) c.b.add(c.kit.mat(['#E07A5F', '#3D9970', '#5B8DB8', '#F2CC8F', '#8E7DBE'][k]!, { rough: 0.85 }), new THREE.BoxGeometry(1.6, 0.3, 0.25), [x, y + 0.3 + k * 0.38, z], [0, face, 0]);
    c.b.add(m.wood, new THREE.BoxGeometry(1.8, 2.0, 0.08), [x - Math.sin(face) * 0.15, y + 1.0, z - Math.cos(face) * 0.15], [0, face, 0]);
    sofa(c, x + Math.sin(face) * 1.4, y, z + Math.cos(face) * 1.4, face + Math.PI, 1.0);
  },
  music: (c, x, y, z, face) => {
    // Piano de cauda de verdade no 1º andar, bateria no 2º, toca-discos no 3º.
    if (c.level === 1) c.things.push(piano(c.kit, c.root, c.seats, c.level, x, y, z, face));
    else if (c.level === 2) c.things.push(drums(c.kit, c.root, c.level, x, y, z, face));
    else c.things.push(record(c.kit, c.root, c.level, x, y, z, face));
  },
  sports: (c, x, y, z, face) => {
    const m = mats(c);
    // Vitrine de troféus.
    c.b.add(c.kit.mat('#CFE7F5', { glass: true }), new THREE.BoxGeometry(1.8, 1.8, 0.5), [x, y + 0.9, z], [0, face, 0]);
    for (let k = 0; k < 6; k++) c.b.add(c.kit.mat('#E5C07B', { metal: 0.9, rough: 0.2 }), new THREE.CylinderGeometry(0.06, 0.1, 0.3, 10), [x + Math.cos(face) * (-0.6 + (k % 3) * 0.6), y + 0.6 + Math.floor(k / 3) * 0.7, z - Math.sin(face) * (-0.6 + (k % 3) * 0.6)]);
    void m;
  },
  habits: (c, x, y, z) => {
    const m = mats(c);
    // Plantas penduradas.
    for (let k = 0; k < 6; k++) {
      const px = x + Math.sin(k) * 1.2;
      const pz = z + Math.cos(k) * 1.2;
      c.b.add(m.metal, new THREE.CylinderGeometry(0.006, 0.006, 1, 4), [px, y + 3.4, pz]);
      c.b.add(m.pot, new THREE.SphereGeometry(0.18, 10, 8), [px, y + 2.8, pz]);
      c.b.add(m.leaf, new THREE.IcosahedronGeometry(0.28, 1), [px, y + 2.65, pz], [0, k, 0], [1, 1.5, 1]);
    }
  },
  focus: (c, x, y, z) => {
    const m = mats(c);
    // Jardim de pedras e bambus (silêncio).
    c.b.add(c.kit.mat('#D8D2C4', { rough: 1 }), new THREE.CylinderGeometry(1.4, 1.4, 0.08, 24), [x, y + 0.04, z]);
    for (let k = 0; k < 3; k++) c.b.add(m.dark, new THREE.DodecahedronGeometry(0.25 + k * 0.08, 0), [x + (k - 1) * 0.6, y + 0.15, z + (k % 2) * 0.4]);
    for (let k = 0; k < 7; k++) c.b.add(m.leaf2, new THREE.CylinderGeometry(0.025, 0.03, 2.4, 5), [x + Math.sin(k * 0.9) * 1.1, y + 1.2, z + Math.cos(k * 0.9) * 1.1]);
  },
  insights: (c, x, y, z, face) => {
    const m = mats(c);
    // No último andar, o observatório: luneta apontada para o céu.
    if (c.top) return void c.things.push(telescope(c.kit, c.root, c.level, x, y, z, face));
    // Mesa holográfica com gráfico de barras luminoso.
    c.b.add(m.dark, new THREE.CylinderGeometry(0.8, 0.9, 0.9, 24), [x, y + 0.45, z]);
    for (let k = 0; k < 6; k++) c.b.add(m.accGlow, new THREE.BoxGeometry(0.12, 0.2 + (k % 4) * 0.18, 0.12), [x - 0.5 + k * 0.2, y + 1.0 + (0.2 + (k % 4) * 0.18) / 2, z]);
  },
  calendar: (c, x, y, z, face) => {
    // Relógio de pé na hora real, que bate as horas.
    c.things.push(clock(c.kit, c.root, c.level, x, y, z, face));
  },
  dashboard: (c, x, y, z, face) => {
    // Observatório no alto: luneta.
    if (c.top) c.things.push(telescope(c.kit, c.root, c.level, x, y, z, face));
  },
  profile: (c, x, y, z, face) => {
    // Canto pessoal: toca-discos com os discos ao lado.
    c.things.push(record(c.kit, c.root, c.level, x, y, z, face));
  },
  finance: (c, x, y, z, face) => {
    const m = mats(c);
    // Painel de cotações.
    c.b.add(m.dark, new THREE.BoxGeometry(2.2, 1.2, 0.08), [x, y + 1.6, z], [0, face, 0]);
    for (let k = 0; k < 6; k++) c.b.add(c.kit.mat(k % 2 ? '#22C55E' : '#EF4444', { glow: true }), new THREE.BoxGeometry(0.5, 0.08, 0.01), [x + Math.cos(face) * (-0.6 + (k % 3) * 0.6) + Math.sin(face) * 0.05, y + 1.85 - Math.floor(k / 3) * 0.4, z - Math.sin(face) * (-0.6 + (k % 3) * 0.6) + Math.cos(face) * 0.05], [0, face, 0]);
  },
  languages: (c, x, y, z) => {
    // Globo grande que gira com um empurrão.
    c.things.push(globe(c.kit, c.root, c.level, x, y, z));
  },
  academy: (c, x, y, z, face) => {
    const m = mats(c);
    if (c.top) c.things.push(telescope(c.kit, c.root, c.level, x + Math.cos(face) * 2.4, y, z - Math.sin(face) * 2.4, face));
    // Mural de avisos com fichas.
    c.b.add(c.kit.mat('#B08A5A', { rough: 0.9 }), new THREE.BoxGeometry(2, 1.2, 0.05), [x, y + 1.5, z], [0, face, 0]);
    for (let k = 0; k < 8; k++) c.b.add(c.kit.mat(['#FDE68A', '#A7F3D0', '#BFDBFE', '#FBCFE8'][k % 4]!, { rough: 0.9 }), new THREE.BoxGeometry(0.3, 0.22, 0.01), [x + Math.cos(face) * (-0.7 + (k % 4) * 0.45) + Math.sin(face) * 0.035, y + 1.75 - Math.floor(k / 4) * 0.45, z - Math.sin(face) * (-0.7 + (k % 4) * 0.45) + Math.cos(face) * 0.035], [0, face, 0]);
    void m;
  },
};

/** Saguão do elevador de um andar: sofá, mesa, planta, luminária (que acende e apaga) e a marca. */
export interface Lobby {
  sofa: { x: number; z: number; face: number };
  table: [number, number];
  plant: [number, number];
  lamp: [number, number];
  sig: { x: number; z: number; face: number };
}

/**
 * Identidade de um andar de cima: teto próprio (ripas, painéis ou anel de luz conforme o andar),
 * saguão do elevador e a marca do prédio; nas plantas com vazio no meio, bancos e floreiras ao
 * longo do guarda-corpo.
 */
export function enrichLevel(kit: Kit, b: Builder, seats: Seat[], id: ModuleId, L: number, top: boolean, y: number, lobby: Lobby, ring: number, apo: number, ceiling: number, accent: string, warm: boolean, root: THREE.Object3D, things: Thing[]) {
  const c: Ctx = { kit, b, seats, accent, warm, root, things, level: L, top };
  const m = mats(c);
  const variant = L % 3;
  const r0 = ring || 1.5;
  const r1 = apo - 0.6;
  // Teto do andar (sob a laje de cima).
  if (variant === 1) {
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const mr = (r0 + r1) / 2;
      b.add(m.wood, new THREE.BoxGeometry(0.12, 0.08, r1 - r0 - 0.4), [Math.sin(a) * mr, ceiling - 0.06, Math.cos(a) * mr], [0, a, 0]);
    }
  } else if (variant === 2) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + 0.1;
      const mr = r0 + 1.2;
      b.add(m.white, new THREE.BoxGeometry(1.2, 0.05, 1.2), [Math.sin(a) * mr, ceiling - 0.04, Math.cos(a) * mr], [0, a, 0]);
      b.add(m.glow, new THREE.BoxGeometry(1.0, 0.02, 1.0), [Math.sin(a) * mr, ceiling - 0.075, Math.cos(a) * mr], [0, a, 0]);
    }
  } else {
    b.add(m.glow, new THREE.TorusGeometry(r0 + 1.2, 0.05, 4, 64), [0, ceiling - 0.08, 0], [Math.PI / 2, 0, 0]);
    b.add(m.acc, new THREE.TorusGeometry(r0 + 1.45, 0.03, 4, 64), [0, ceiling - 0.08, 0], [Math.PI / 2, 0, 0]);
  }
  // Junto ao guarda-corpo do vazio: bancos e floreiras alternados.
  if (ring) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.31;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.5) continue;
      const r = ring + 0.75;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (k % 2) bench(c, x, y, z, a, 1.4);
      else {
        b.add(m.pot, new THREE.BoxGeometry(1.1, 0.45, 0.4), [x, y + 0.22, z], [0, a + Math.PI / 2, 0]);
        b.add(m.leaf, new THREE.IcosahedronGeometry(0.35, 1), [x, y + 0.6, z], [0, 0, 0], [1.6, 0.7, 0.6]);
      }
    }
  }
  // Saguão do elevador.
  sofa(c, lobby.sofa.x, y, lobby.sofa.z, lobby.sofa.face, 1.8);
  b.add(m.light, new THREE.CylinderGeometry(0.45, 0.45, 0.4, 20), [lobby.table[0], y + 0.2, lobby.table[1]]);
  tallPlant(c, lobby.plant[0], y, lobby.plant[1], 0.9);
  things.push(floorLamp(kit, root, L, lobby.lamp[0], y, lobby.lamp[1], warm));
  SIGNATURE[id]?.(c, lobby.sig.x, y, lobby.sig.z, lobby.sig.face);
}
