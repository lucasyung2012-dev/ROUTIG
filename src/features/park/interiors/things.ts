/**
 * Objetos funcionais dos interiores (V2.1, seção 11): chegando perto aparece "Interagir" e o
 * objeto faz o que faz de verdade:
 * - piano de cauda, bateria e violão (os três instrumentos da Música): abrem o teclado, os pads ou
 *   as cordas e acordes na tela e tocam (as teclas e peças se mexem; as cordas do violão vibram);
 * - cofre de Finanças: a porta redonda mostra o bloqueio real de Finanças e abre com o PIN de verdade;
 * - toca-discos: o disco gira e toca uma melodia;
 * - luminárias: acendem e apagam;
 * - globo: gira com um empurrão e vai parando;
 * - relógio: ponteiros na hora real do aparelho; bate as horas;
 * - luneta: olha o céu;
 * - escada do núcleo: sobe ou desce um andar;
 * - porta de cada sala: abre o painel real daquela sala.
 */
import * as THREE from 'three';
import { Builder, type Kit } from '../kit';
import type { Seat } from '../camera';

export type ThingKind = 'piano' | 'drums' | 'guitar' | 'record' | 'lamp' | 'globe' | 'clock' | 'telescope' | 'stairs' | 'room' | 'vault';
export type Timbre = 'piano' | 'guitar' | 'kick' | 'snare' | 'hat' | 'tom' | 'bell' | 'pluck' | 'voice' | 'whistle' | 'ball' | 'kid' | 'door' | 'gate' | 'bark' | 'quack' | 'coo' | 'meow' | 'bikebell' | 'horn' | 'brake' | 'frog';

export interface ThingCtx {
  /** Toca uma nota (MIDI) com um timbre, daqui a `delay` segundos. */
  note: (midi: number, timbre: Timbre, delay?: number) => void;
}

export interface Thing {
  kind: ThingKind;
  level: number;
  x: number;
  z: number;
  /** Para onde fica a frente (onde a pessoa se põe para usar). */
  face: number;
  /** Sala que a porta abre (índice da zona). */
  zone?: number;
  /** Ação local (luz, globo, relógio, disco). Instrumentos, luneta, escada, sala e cofre são do motor. */
  act?: (c: ThingCtx) => void;
  /** Animação por quadro (tempo em ms). */
  tick?: (t: number) => void;
  /** Tecla/peça tocada (piano: índice da tecla; bateria: peça; violão: corda ou acorde, ver guitarStrum). */
  press?: (i: number) => void;
  /** Instrumento que fica abaixo dos olhos (violão): ponto do mundo para onde a vista se volta ao tocar. */
  focus?: { x: number; y: number; z: number };
  /** Cofre: mostra o estado do bloqueio de Finanças; devolve true quando a porta muda de posição. */
  setVault?: (s: VaultState, instant?: boolean) => boolean;
}

/** Notas do teclado na tela: duas oitavas a partir do Dó central. */
export const PIANO_KEYS: Array<{ midi: number; black: boolean }> = Array.from({ length: 25 }, (_, i) => ({ midi: 60 + i, black: [1, 3, 6, 8, 10].includes(i % 12) }));
export const DRUM_PADS: Timbre[] = ['kick', 'snare', 'hat', 'tom'];

/** Os três instrumentos tocáveis do prédio da Música. */
export const INSTRUMENTS = ['piano', 'drums', 'guitar'] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

/** Violão em afinação padrão, da 6ª corda (Mi grave, E2) à 1ª (Mi agudo, E4), em MIDI. */
export const GUITAR_STRINGS: readonly number[] = [40, 45, 50, 55, 59, 64];
export type ChordId = 'C' | 'D' | 'E' | 'G' | 'A' | 'Am' | 'Em';
/** Acordes abertos: casa apertada em cada corda (da 6ª à 1ª); null = corda abafada (não soa). */
export const GUITAR_CHORDS: ReadonlyArray<{ id: ChordId; frets: ReadonlyArray<number | null> }> = [
  { id: 'C', frets: [null, 3, 2, 0, 1, 0] },
  { id: 'D', frets: [null, null, 0, 2, 3, 2] },
  { id: 'E', frets: [0, 2, 2, 1, 0, 0] },
  { id: 'G', frets: [3, 2, 0, 0, 0, 3] },
  { id: 'A', frets: [null, 0, 2, 2, 2, 0] },
  { id: 'Am', frets: [null, 0, 2, 2, 1, 0] },
  { id: 'Em', frets: [0, 2, 2, 0, 0, 0] },
];
/** Intervalo entre uma corda e a seguinte na batida (da grave para a aguda), em segundos. */
export const STRUM_GAP = 0.024;

/** Notas (MIDI) que um acorde faz soar, da corda grave para a aguda (as abafadas ficam de fora). */
export function chordNotes(frets: ReadonlyArray<number | null>): number[] {
  const out: number[] = [];
  frets.forEach((f, s) => {
    const open = GUITAR_STRINGS[s];
    if (f !== null && open !== undefined) out.push(open + f);
  });
  return out;
}

/**
 * O que soa ao tocar o índice `i` do violão: 0–5 = uma corda solta (6ª à 1ª); 6 em diante = um
 * acorde de GUITAR_CHORDS, batido da corda grave para a aguda. Índice fora disso não toca nada.
 */
export function guitarStrum(i: number): Array<{ string: number; midi: number; delay: number }> {
  if (!Number.isInteger(i) || i < 0) return [];
  const open = GUITAR_STRINGS[i];
  if (open !== undefined) return [{ string: i, midi: open, delay: 0 }];
  const chord = GUITAR_CHORDS[i - GUITAR_STRINGS.length];
  if (!chord) return [];
  const out: Array<{ string: number; midi: number; delay: number }> = [];
  chord.frets.forEach((f, s) => {
    const o = GUITAR_STRINGS[s];
    if (f === null || o === undefined) return;
    out.push({ string: s, midi: o + f, delay: out.length * STRUM_GAP });
  });
  return out;
}

/** Estado do cofre de Finanças: sem PIN não há o que trancar; com PIN, aberto só se Finanças está desbloqueado. */
export type VaultState = 'none' | 'locked' | 'open';
/** `hasPin` undefined (ainda lendo): fica fechado, para nada parecer aberto antes da hora. */
export function vaultStateOf(hasPin: boolean | undefined, unlocked: boolean): VaultState {
  if (hasPin === false) return 'none';
  return hasPin === true && unlocked ? 'open' : 'locked';
}

const place = (g: THREE.Object3D, x: number, y: number, z: number, face: number) => {
  g.position.set(x, y, z);
  g.rotation.y = face;
  return g;
};
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r?: [number, number, number]) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  m.castShadow = true;
  return m;
};

/** Piano de cauda com 25 teclas que afundam ao tocar, tampa aberta e banqueta. */
export function piano(kit: Kit, root: THREE.Object3D, seats: Seat[], level: number, x: number, y: number, z: number, face: number): Thing {
  const g = place(new THREE.Group(), x, y, z, face);
  const b = new Builder();
  const black = kit.mat('#14161A', { rough: 0.15, metal: 0.3 });
  const wood = kit.mat('#3A2A20', { rough: 0.6 });
  const brass = kit.mat('#C9A45C', { metal: 0.9, rough: 0.25 });
  // Caixa em gota (vista de cima): meia elipse atrás do teclado.
  const shape = new THREE.Shape();
  shape.moveTo(-0.75, 0);
  shape.lineTo(0.75, 0);
  shape.bezierCurveTo(0.75, -0.9, 0.35, -1.8, -0.1, -1.8);
  shape.bezierCurveTo(-0.6, -1.8, -0.75, -1.0, -0.75, 0);
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: false, curveSegments: 24 });
  body.rotateX(Math.PI / 2);
  b.add(black, body, [0, 1.02, 0.1]);
  // Tampa aberta (apoiada na vareta) e as cordas douradas por dentro.
  const lid = new THREE.ShapeGeometry(shape, 24);
  lid.rotateX(Math.PI / 2);
  lid.translate(-0.75, 0, 0);
  const lidM = mesh(lid, new THREE.MeshStandardMaterial({ color: "#14161A", roughness: 0.15, metalness: 0.3, side: THREE.DoubleSide }), [0.75, 1.03, 0.1], [0, 0, -0.55]);
  g.add(lidM);
  for (let k = 0; k < 14; k++) b.add(brass, new THREE.BoxGeometry(0.008, 0.008, 1.5 - Math.abs(k - 5) * 0.08), [-0.6 + k * 0.09, 0.95, -0.75]);
  b.add(brass, new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6), [-0.5, 1.25, -0.9], [0, 0, -0.35]);
  // Teclado: frente do piano, com as teclas no meio.
  b.add(black, new THREE.BoxGeometry(1.5, 0.12, 0.32), [0, 0.86, 0.26]);
  b.add(black, new THREE.BoxGeometry(1.5, 0.2, 0.06), [0, 0.98, 0.1]);
  for (const s of [-1, 1]) b.add(black, new THREE.BoxGeometry(0.08, 0.16, 0.34), [s * 0.71, 0.96, 0.26]);
  // Pernas e pedais.
  for (const [lx, lz] of [[-0.62, 0.1], [0.62, 0.1], [-0.1, -1.55]] as const) b.add(black, new THREE.CylinderGeometry(0.05, 0.07, 0.82, 10), [lx, 0.41, lz]);
  b.add(wood, new THREE.BoxGeometry(0.3, 0.5, 0.06), [0, 0.3, 0.1]);
  for (let k = 0; k < 3; k++) b.add(brass, new THREE.BoxGeometry(0.04, 0.02, 0.12), [-0.08 + k * 0.08, 0.06, 0.18]);
  // Banqueta.
  b.add(black, new THREE.BoxGeometry(0.8, 0.08, 0.36), [0, 0.5, 0.85]);
  for (const s of [-1, 1]) b.add(black, new THREE.BoxGeometry(0.05, 0.48, 0.3), [s * 0.36, 0.25, 0.85]);
  g.add(b.build());
  // Teclas soltas para afundarem ao tocar.
  const white = new THREE.MeshStandardMaterial({ color: '#F7F5EF', roughness: 0.35 });
  const ebony = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.3 });
  const keys: THREE.Mesh[] = [];
  const whites = PIANO_KEYS.filter((k) => !k.black).length;
  const kw = 1.3 / whites;
  let wi = 0;
  PIANO_KEYS.forEach((k) => {
    let m: THREE.Mesh;
    if (!k.black) {
      m = mesh(new THREE.BoxGeometry(kw * 0.92, 0.03, 0.26), white, [-0.65 + kw * (wi + 0.5), 0.935, 0.28]);
      wi++;
    } else m = mesh(new THREE.BoxGeometry(kw * 0.55, 0.04, 0.16), ebony, [-0.65 + kw * wi, 0.965, 0.23]);
    m.geometry.translate(0, 0, 0.13);
    m.position.z -= 0.13;
    keys.push(m);
    g.add(m);
  });
  root.add(g);
  const c = Math.cos(face);
  const s = Math.sin(face);
  seats.push({ x: x + s * 0.85, y: y + 0.5, z: z + c * 0.85, face: face + Math.PI });
  const down: number[] = keys.map(() => 0);
  return {
    kind: 'piano',
    level,
    x: x + s * 1.2,
    z: z + c * 1.2,
    face,
    press: (i) => (down[i] = performance.now() + 180),
    tick: (t) => keys.forEach((k, i) => (k.rotation.x = t < down[i]! ? 0.07 : k.rotation.x * 0.6)),
  };
}

/** Bateria: bumbo, caixa, chimbal e tom; a peça tocada balança. */
export function drums(kit: Kit, root: THREE.Object3D, level: number, x: number, y: number, z: number, face: number): Thing {
  const g = place(new THREE.Group(), x, y, z, face);
  const shell = kit.mat('#B91C1C', { rough: 0.3, metal: 0.4 });
  const head = kit.mat('#F3F1EA', { rough: 0.7 });
  const chrome = kit.mat('#D6DBE1', { metal: 0.95, rough: 0.15 });
  const cymbal = kit.mat('#D4A84B', { metal: 0.95, rough: 0.25 });
  const pieces: THREE.Group[] = [];
  const drum = (r: number, h: number, p: [number, number, number], tilt: number, side = false) => {
    const d = new THREE.Group();
    d.position.set(...p);
    d.add(mesh(new THREE.CylinderGeometry(r, r, h, 24), shell, [0, 0, 0], side ? [Math.PI / 2, 0, 0] : [tilt, 0, 0]));
    d.add(mesh(new THREE.CircleGeometry(r * 0.98, 24), head, side ? [0, 0, h / 2 + 0.002] : [0, h / 2 + 0.002, 0], side ? [0, 0, 0] : [-Math.PI / 2 + tilt, 0, 0]));
    g.add(d);
    pieces.push(d);
    return d;
  };
  drum(0.32, 0.4, [0, 0.34, -0.2], 0, true); // bumbo
  drum(0.18, 0.14, [-0.35, 0.62, 0.1], 0.2); // caixa
  const hat = new THREE.Group();
  hat.position.set(-0.7, 0.95, 0);
  hat.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 24), cymbal, [0, 0, 0]), mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 24), cymbal, [0, 0.03, 0]));
  g.add(hat);
  pieces.push(hat);
  drum(0.14, 0.14, [0.1, 0.78, -0.12], 0.35); // tom
  const b = new Builder();
  b.add(chrome, new THREE.CylinderGeometry(0.012, 0.012, 0.95, 6), [-0.7, 0.47, 0]);
  b.add(chrome, new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), [0.5, 0.55, -0.1]);
  b.add(cymbal, new THREE.CylinderGeometry(0.26, 0.26, 0.012, 24), [0.5, 1.12, -0.1], [0.25, 0, 0]);
  b.add(chrome, new THREE.CylinderGeometry(0.15, 0.15, 0.04, 16), [0, 0.5, 0.55]);
  b.add(kit.mat('#2B2B2B', { rough: 0.8 }), new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16), [0, 0.55, 0.55]);
  g.add(b.build());
  root.add(g);
  const hit: number[] = [0, 0, 0, 0];
  const c = Math.cos(face);
  const s = Math.sin(face);
  return {
    kind: 'drums',
    level,
    x: x + s * 1.2,
    z: z + c * 1.2,
    face,
    press: (i) => (hit[i] = performance.now()),
    tick: (t) =>
      pieces.forEach((p, i) => {
        const k = (t - hit[i]!) / 250;
        const v = k >= 0 && k < 1 ? Math.sin(k * Math.PI * 3) * (1 - k) * 0.08 : 0;
        p.rotation.z = v;
        p.scale.setScalar(1 + Math.abs(v) * 0.3);
      }),
  };
}

/** Toca-discos num móvel: o disco gira e toca uma melodia curta. */
export function record(kit: Kit, root: THREE.Object3D, level: number, x: number, y: number, z: number, face: number): Thing {
  const g = place(new THREE.Group(), x, y, z, face);
  const b = new Builder();
  b.add(kit.mat('#7A5236', { rough: 0.6 }), new THREE.BoxGeometry(1.0, 0.7, 0.5), [0, 0.35, 0]);
  b.add(kit.mat('#2B2F36', { rough: 0.4 }), new THREE.BoxGeometry(0.6, 0.1, 0.42), [0, 0.75, 0]);
  b.add(kit.mat('#C0C6CE', { metal: 0.9, rough: 0.2 }), new THREE.BoxGeometry(0.02, 0.02, 0.24), [0.2, 0.83, -0.03], [0, 0.4, 0]);
  for (let k = 0; k < 6; k++) b.add(kit.mat(['#E07A5F', '#3D405B', '#81B29A', '#F2CC8F', '#5B8DB8', '#C06C84'][k]!, { rough: 0.8 }), new THREE.BoxGeometry(0.04, 0.3, 0.3), [-0.42 + k * 0.05, 0.2, 0.05]);
  g.add(b.build());
  const disc = new THREE.Group();
  disc.position.set(-0.05, 0.81, 0);
  disc.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 32), new THREE.MeshStandardMaterial({ color: '#0E0E10', roughness: 0.25 }), [0, 0, 0]));
  disc.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 16), kit.mat('#F59E0B', { rough: 0.6 }), [0, 0.001, 0]));
  disc.add(mesh(new THREE.BoxGeometry(0.02, 0.013, 0.05), kit.mat('#FDE68A'), [0.03, 0.002, 0]));
  g.add(disc);
  root.add(g);
  let until = 0;
  const tune = [64, 67, 71, 72, 71, 67, 64, 62, 60, 64, 67, 64];
  return {
    kind: 'record',
    level,
    x: x + Math.sin(face) * 1.0,
    z: z + Math.cos(face) * 1.0,
    face,
    act: (c) => {
      tune.forEach((n, i) => c.note(n, 'pluck', i * 0.32));
      until = performance.now() + tune.length * 320 + 400;
    },
    tick: (t) => {
      if (t < until) disc.rotation.y -= 0.09;
    },
  };
}

/** Luminária de pé que acende e apaga (cúpula e a mancha de luz no chão). */
export function lamp(kit: Kit, root: THREE.Object3D, level: number, x: number, y: number, z: number, warm: boolean): Thing {
  const g = place(new THREE.Group(), x, y, z, 0);
  const b = new Builder();
  b.add(kit.mat('#2B3442', { rough: 0.5 }), new THREE.CylinderGeometry(0.18, 0.2, 0.04, 16), [0, 0.02, 0]);
  b.add(kit.mat('#A6B0BC', { metal: 0.8, rough: 0.3 }), new THREE.CylinderGeometry(0.018, 0.018, 1.55, 6), [0, 0.8, 0]);
  b.add(kit.mat('#A6B0BC', { metal: 0.8, rough: 0.3 }), new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), [0.12, 1.58, 0], [0, 0, -0.9]);
  g.add(b.build());
  const onMat = kit.mat(warm ? '#FFE7B0' : '#E8F4FF', { glow: true });
  const offMat = kit.mat(warm ? '#E9DCC6' : '#D5DCE4', { rough: 0.7 });
  const shade = mesh(new THREE.CylinderGeometry(0.14, 0.26, 0.3, 20, 1, true), onMat, [0.24, 1.66, 0]);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: warm ? '#FFE2A8' : '#E3F1FF', transparent: true, opacity: 0.22, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0.24, 0.015, 0);
  g.add(shade, pool);
  root.add(g);
  let on = true;
  return {
    kind: 'lamp',
    level,
    x,
    z,
    face: 0,
    act: (c) => {
      on = !on;
      shade.material = on ? onMat : offMat;
      pool.visible = on;
      c.note(on ? 88 : 84, 'hat');
    },
  };
}

/** Globo terrestre num pedestal: gira com um empurrão e vai parando. */
export function globe(kit: Kit, root: THREE.Object3D, level: number, x: number, y: number, z: number): Thing {
  const g = place(new THREE.Group(), x, y, z, 0);
  const b = new Builder();
  b.add(kit.mat('#5A3E2B', { rough: 0.6 }), new THREE.CylinderGeometry(0.12, 0.32, 0.9, 12), [0, 0.45, 0]);
  b.add(kit.mat('#C9A45C', { metal: 0.9, rough: 0.25 }), new THREE.TorusGeometry(0.62, 0.02, 6, 40, Math.PI), [0, 1.45, 0], [0, Math.PI / 2, 0.41]);
  g.add(b.build());
  const tilt = new THREE.Group();
  tilt.position.set(0, 1.45, 0);
  tilt.rotation.z = 0.41;
  const ball = new THREE.Group();
  ball.add(mesh(new THREE.SphereGeometry(0.55, 32, 20), kit.mat('#2F6FB3', { rough: 0.45 }), [0, 0, 0]));
  // Continentes: placas verdes e areia coladas na esfera (dá para ver o giro).
  const land = [kit.mat('#5E9E54', { rough: 0.8 }), kit.mat('#C8B07A', { rough: 0.9 })];
  for (let k = 0; k < 16; k++) {
    const lat = Math.sin(k * 2.7) * 1.0;
    const lon = k * 1.37;
    const p = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)).multiplyScalar(0.545);
    const m = mesh(new THREE.SphereGeometry(0.12 + (k % 4) * 0.04, 10, 6), land[k % 5 === 0 ? 1 : 0]!, [p.x, p.y, p.z]);
    m.scale.set(1, 1, 0.18);
    m.lookAt(p.clone().multiplyScalar(2));
    ball.add(m);
  }
  tilt.add(ball);
  g.add(tilt);
  root.add(g);
  let spin = 0.15;
  let last = 0;
  return {
    kind: 'globe',
    level,
    x,
    z,
    face: 0,
    act: (c) => {
      spin += 7;
      c.note(55, 'tom');
    },
    tick: (t) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      ball.rotation.y += spin * dt;
      spin = Math.max(0.15, spin * (1 - dt * 0.6));
    },
  };
}

/** Relógio de pé com os ponteiros na hora real; ao interagir, bate as horas. */
export function clock(kit: Kit, root: THREE.Object3D, level: number, x: number, y: number, z: number, face: number): Thing {
  const g = place(new THREE.Group(), x, y, z, face);
  const b = new Builder();
  const wood = kit.mat('#5C3A24', { rough: 0.55 });
  const brass = kit.mat('#C9A45C', { metal: 0.9, rough: 0.25 });
  b.add(wood, new THREE.BoxGeometry(0.62, 0.5, 0.42), [0, 0.25, 0]);
  b.add(wood, new THREE.BoxGeometry(0.5, 1.2, 0.36), [0, 1.1, 0]);
  b.add(wood, new THREE.BoxGeometry(0.62, 0.62, 0.42), [0, 2.0, 0]);
  b.add(wood, new THREE.ConeGeometry(0.42, 0.25, 4), [0, 2.44, 0], [0, Math.PI / 4, 0]);
  b.add(kit.mat('#CFE7F5', { glass: true }), new THREE.BoxGeometry(0.34, 0.9, 0.02), [0, 1.1, 0.19]);
  b.add(kit.mat('#F8F4EA', { rough: 0.5 }), new THREE.CircleGeometry(0.24, 32), [0, 2.0, 0.215]);
  b.add(brass, new THREE.TorusGeometry(0.24, 0.015, 6, 32), [0, 2.0, 0.215]);
  for (let k = 0; k < 12; k++) b.add(kit.mat('#2B2B2B'), new THREE.BoxGeometry(0.015, k % 3 ? 0.03 : 0.06, 0.005), [Math.sin((k / 12) * Math.PI * 2) * 0.2, 2.0 + Math.cos((k / 12) * Math.PI * 2) * 0.2, 0.22], [0, 0, -(k / 12) * Math.PI * 2]);
  g.add(b.build());
  const hand = (len: number, w: number) => {
    const m = mesh(new THREE.BoxGeometry(w, len, 0.01), new THREE.MeshStandardMaterial({ color: '#1E1E1E' }), [0, 2.0, 0.23]);
    m.geometry.translate(0, len / 2, 0);
    g.add(m);
    return m;
  };
  const hh = hand(0.12, 0.025);
  const mh = hand(0.19, 0.016);
  const sh = hand(0.2, 0.006);
  const pend = new THREE.Group();
  pend.position.set(0, 1.55, 0.1);
  const rod = mesh(new THREE.BoxGeometry(0.015, 0.6, 0.01), brass, [0, -0.3, 0]);
  pend.add(rod, mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 20), brass, [0, -0.62, 0], [Math.PI / 2, 0, 0]));
  g.add(pend);
  root.add(g);
  return {
    kind: 'clock',
    level,
    x: x + Math.sin(face) * 1.0,
    z: z + Math.cos(face) * 1.0,
    face,
    act: (c) => {
      const h = new Date().getHours() % 12 || 12;
      for (let i = 0; i < h; i++) c.note(i % 2 ? 67 : 72, 'bell', i * 0.9);
    },
    tick: (t) => {
      const d = new Date();
      const s = d.getSeconds() + d.getMilliseconds() / 1000;
      const m = d.getMinutes() + s / 60;
      sh.rotation.z = -(s / 60) * Math.PI * 2;
      mh.rotation.z = -(m / 60) * Math.PI * 2;
      hh.rotation.z = -(((d.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
      pend.rotation.z = Math.sin((t / 1000) * Math.PI) * 0.12;
    },
  };
}

/** Luneta num tripé, apontada para o céu pela janela. */
export function telescope(kit: Kit, root: THREE.Object3D, level: number, x: number, y: number, z: number, face: number): Thing {
  const g = place(new THREE.Group(), x, y, z, face);
  const b = new Builder();
  const metal = kit.mat('#2B3442', { metal: 0.6, rough: 0.35 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.add(metal, new THREE.CylinderGeometry(0.02, 0.025, 1.3, 6), [Math.sin(a) * 0.25, 0.62, Math.cos(a) * 0.25], [Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2]);
  }
  b.add(kit.mat('#E8E4DA', { metal: 0.3, rough: 0.3 }), new THREE.CylinderGeometry(0.07, 0.09, 1.1, 16), [0, 1.35, 0.15], [0.9, 0, 0]);
  b.add(kit.mat('#C9A45C', { metal: 0.9, rough: 0.25 }), new THREE.TorusGeometry(0.09, 0.015, 6, 20), [0, 1.62, 0.55], [0.9 - Math.PI / 2, 0, 0]);
  g.add(b.build());
  root.add(g);
  return { kind: 'telescope', level, x: x - Math.sin(face) * 0.7, z: z - Math.cos(face) * 0.7, face };
}

/** Ponta a ponta: cilindro entre dois pontos (hastes do suporte). */
function rodBetween(b: Builder, m: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, r: number) {
  const d = new THREE.Vector3().subVectors(c, a);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  b.add(m, new THREE.CylinderGeometry(r, r, d.length(), 8), [(a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2], [e.x, e.y, e.z]);
}

const P2 = (a: number, b: number) => new THREE.Vector2(a, b);

/**
 * Violão de aço num suporte de chão: corpo em oito com filete, tampo de abeto, boca com roseta,
 * escudo, cavalete com rastilho e pinos, braço com 19 trastes e marcações, mão com seis tarraxas
 * e as seis cordas (as quatro graves de bronze), que vibram ao tocar — uma corda ou o acorde inteiro.
 * Medidas de um violão de verdade: 1 m de ponta a ponta, escala de 65 cm.
 */
export function guitar(kit: Kit, root: THREE.Object3D, level: number, x: number, y: number, z: number, face: number): Thing {
  const g = place(new THREE.Group(), x, y, z, face);
  // De pé no suporte, um pouco inclinado para trás (o pé do violão no berço).
  const tilt = -0.24;
  const base = new THREE.Vector3(0, 0.2, 0.06);
  const tiltE = new THREE.Euler(tilt, 0, 0);
  const onGuitar = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyEuler(tiltE).add(base);
  const V = (a: number, b: number, c: number) => new THREE.Vector3(a, b, c);

  // Suporte em tripé: berço com apoios de borracha, duas pernas na frente e a haste de trás até o garfo do braço.
  const sb = new Builder();
  const frame = kit.mat('#23272E', { metal: 0.6, rough: 0.35 });
  const rubber = kit.mat('#3A3F47', { rough: 0.9 });
  rodBetween(sb, frame, V(-0.15, 0.185, 0.07), V(0.15, 0.185, 0.07), 0.012);
  for (const sd of [-1, 1]) {
    rodBetween(sb, frame, V(sd * 0.21, 0.015, 0.25), V(sd * 0.14, 0.185, 0.07), 0.01);
    rodBetween(sb, rubber, V(sd * 0.11, 0.185, 0.07), V(sd * 0.11, 0.185, 0.135), 0.012);
    rodBetween(sb, rubber, V(sd * 0.11, 0.185, 0.135), V(sd * 0.11, 0.25, 0.145), 0.012);
    sb.add(rubber, new THREE.CylinderGeometry(0.022, 0.022, 0.02, 10), [sd * 0.21, 0.01, 0.25]);
  }
  rodBetween(sb, frame, V(0, 0.015, -0.34), onGuitar(0, 0.7, -0.005), 0.011);
  sb.add(rubber, new THREE.CylinderGeometry(0.022, 0.022, 0.02, 10), [0, 0.01, -0.34]);
  rodBetween(sb, rubber, onGuitar(-0.042, 0.7, -0.005), onGuitar(0.042, 0.7, -0.005), 0.009);
  for (const sd of [-1, 1]) rodBetween(sb, rubber, onGuitar(sd * 0.042, 0.7, -0.005), onGuitar(sd * 0.042, 0.7, 0.05), 0.008);
  g.add(sb.build());

  // O violão (no próprio plano: comprimento em y, tampo virado para +z).
  const gt = new THREE.Group();
  gt.position.copy(base);
  gt.rotation.x = tilt;
  g.add(gt);
  // Meio contorno do corpo (bojo de baixo, cintura, bojo de cima), espelhado.
  const half = new THREE.SplineCurve([P2(0, 0), P2(0.1, 0.008), P2(0.165, 0.05), P2(0.185, 0.13), P2(0.17, 0.21), P2(0.125, 0.285), P2(0.128, 0.33), P2(0.145, 0.395), P2(0.13, 0.455), P2(0.08, 0.485), P2(0, 0.49)]).getPoints(48);
  const shape = new THREE.Shape([...half, ...half.slice(1, -1).reverse().map((p) => P2(-p.x, p.y))]);
  const gb = new Builder();
  const sides = kit.mat('#7A4527', { rough: 0.45 });
  const spruce = kit.mat('#E2B97F', { rough: 0.5 });
  const binding = kit.mat('#F1E6CF', { rough: 0.5 });
  const ebony = kit.mat('#2B1A10', { rough: 0.55 });
  const bone = kit.mat('#EFE8D8', { rough: 0.4 });
  const nickel = kit.mat('#C9CDD2', { metal: 0.9, rough: 0.25 });
  const pearl = kit.mat('#F3EFE6', { rough: 0.3 });
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
  body.translate(0, 0, -0.05);
  gb.add(sides, body);
  // Filete claro na borda e o tampo por dentro dele.
  gb.add(binding, new THREE.ShapeGeometry(shape), [0, 0, 0.0546]);
  const plate = new THREE.ShapeGeometry(shape);
  plate.translate(0, -0.245, 0);
  plate.scale(0.972, 0.972, 1);
  plate.translate(0, 0.245, 0);
  gb.add(spruce, plate, [0, 0, 0.0549]);
  // Boca com roseta e escudo.
  gb.add(kit.mat('#120C08', { rough: 0.9 }), new THREE.CircleGeometry(0.044, 40), [0, 0.335, 0.0556]);
  gb.add(kit.mat('#3B2416', { rough: 0.5 }), new THREE.RingGeometry(0.05, 0.061, 48), [0, 0.335, 0.0553]);
  gb.add(binding, new THREE.RingGeometry(0.064, 0.067, 48), [0, 0.335, 0.0553]);
  const guard = new THREE.Shape();
  guard.absellipse(0, 0, 0.042, 0.064, 0, Math.PI * 2, false, 0);
  gb.add(kit.mat('#3A2216', { rough: 0.35 }), new THREE.ShapeGeometry(guard, 24), [0.066, 0.285, 0.0551], [0, 0, -0.45]);
  // Cavalete, rastilho e os seis pinos.
  const xs = (k: number) => -0.027 + k * 0.0108;
  const xn = (k: number) => -0.0215 + k * 0.0086;
  gb.add(ebony, new THREE.BoxGeometry(0.16, 0.034, 0.01), [0, 0.163, 0.0595]);
  gb.add(bone, new THREE.BoxGeometry(0.075, 0.004, 0.006), [0, 0.172, 0.067]);
  for (let k = 0; k < 6; k++) gb.add(bone, new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 8), [xs(k), 0.155, 0.0655], [Math.PI / 2, 0, 0]);
  // Braço, escala, pestana, trastes (posição real pela regra das 12 notas) e marcações.
  const NUT = 0.815;
  const SCALE = 0.65;
  const fret = (n: number) => NUT - SCALE * (1 - 2 ** (-n / 12));
  gb.add(sides, new THREE.BoxGeometry(0.05, 0.37, 0.034), [0, 0.655, 0.041]);
  gb.add(ebony, new THREE.BoxGeometry(0.052, NUT - 0.372, 0.009), [0, (NUT + 0.372) / 2, 0.0595]);
  gb.add(bone, new THREE.BoxGeometry(0.052, 0.006, 0.007), [0, NUT, 0.0665]);
  for (let n = 1; n <= 19; n++) gb.add(nickel, new THREE.BoxGeometry(0.052, 0.0025, 0.003), [0, fret(n), 0.0655]);
  for (const n of [3, 5, 7, 9, 12, 15, 17]) for (const dx of n === 12 ? [-0.012, 0.012] : [0]) gb.add(pearl, new THREE.CircleGeometry(0.0038, 12), [dx, (fret(n - 1) + fret(n)) / 2, 0.0642]);
  gt.add(gb.build());
  // Mão inclinada para trás, com as tarraxas (três de cada lado).
  const hs = new THREE.Group();
  hs.position.set(0, NUT + 0.004, 0.05);
  hs.rotation.x = -0.2;
  const hb = new Builder();
  hb.add(sides, new THREE.BoxGeometry(0.085, 0.19, 0.016), [0, 0.095, -0.004]);
  hb.add(kit.mat('#16100C', { rough: 0.3 }), new THREE.BoxGeometry(0.08, 0.182, 0.002), [0, 0.096, 0.0045]);
  for (const sd of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const py = 0.045 + k * 0.05;
      hb.add(nickel, new THREE.CylinderGeometry(0.0045, 0.0045, 0.014, 8), [sd * 0.026, py, 0.011], [Math.PI / 2, 0, 0]);
      hb.add(nickel, new THREE.CylinderGeometry(0.003, 0.003, 0.03, 6), [sd * 0.05, py, -0.004], [0, 0, Math.PI / 2]);
      hb.add(bone, new THREE.BoxGeometry(0.008, 0.02, 0.012), [sd * 0.067, py, -0.004]);
    }
  hs.add(hb.build());
  gt.add(hs);
  // As seis cordas, do rastilho à pestana (abrem um pouco em leque); cada uma é uma peça solta que vibra.
  const RADII = [0.0028, 0.0024, 0.002, 0.0017, 0.0012, 0.0011];
  const strings: THREE.Mesh[] = [];
  const lit: THREE.MeshStandardMaterial[] = [];
  const restX: number[] = [];
  for (let k = 0; k < 6; k++) {
    const x0 = xs(k);
    const x1 = xn(k);
    const y0 = 0.172;
    const len = Math.hypot(x1 - x0, NUT - y0);
    const m = kit.own(new THREE.MeshStandardMaterial({ color: k < 4 ? '#C8A26B' : '#DDE2E8', metalness: 0.85, roughness: 0.3, emissive: '#FFD58A', emissiveIntensity: 0 }));
    const s = new THREE.Mesh(new THREE.CylinderGeometry(RADII[k]!, RADII[k]!, len, 6), m);
    s.position.set((x0 + x1) / 2, (y0 + NUT) / 2, 0.0705);
    s.rotation.z = -Math.atan2(x1 - x0, NUT - y0);
    gt.add(s);
    strings.push(s);
    lit.push(m);
    restX.push(s.position.x);
  }
  root.add(g);
  const cf = Math.cos(face);
  const sf = Math.sin(face);
  // Para onde olhar ao tocar: um pouco abaixo da boca (o painel na tela fica embaixo).
  const hole = onGuitar(0, 0.335, 0.055);
  const hit = strings.map(() => -Infinity);
  return {
    kind: 'guitar',
    level,
    x: x + sf * 1.0,
    z: z + cf * 1.0,
    face,
    focus: { x: x + cf * hole.x + sf * hole.z, y: y + hole.y - 0.12, z: z - sf * hole.x + cf * hole.z },
    press: (i) => {
      const now = performance.now();
      for (const n of guitarStrum(i)) hit[n.string] = now + n.delay * 1000;
    },
    // Corda tocada: engrossa (o borrão da vibração), treme e brilha, e vai parando sozinha.
    tick: (t) =>
      strings.forEach((s, k) => {
        const age = t - hit[k]!;
        const a = age >= 0 && age < 3000 ? Math.exp(-age / 700) : 0;
        s.scale.x = s.scale.z = 1 + a * 2.8;
        s.position.x = restX[k]! + Math.sin(age * 0.37) * 0.0015 * a;
        lit[k]!.emissiveIntensity = a * 0.8;
      }),
  };
}

/**
 * Cofre de Finanças: porta redonda de aço embutida numa parede de pedra escura com frisos de latão,
 * aro de luz quente discreto e uma luz de estado acima (âmbar = trancado, verde = aberto, apagada =
 * Finanças sem PIN). Atrás, a câmara com caixas de depósito. A porta só mostra o estado: quem confere
 * o PIN é o bloqueio de Finanças do app (o mesmo da tela de Finanças). Nenhum número aparece aqui.
 * A frente da parede fica em z = 0 do grupo, virada para `face`.
 */
export function vault(kit: Kit, root: THREE.Object3D, level: number, x: number, y: number, z: number, face: number): Thing {
  const g = place(new THREE.Group(), x, y, z, face);
  const b = new Builder();
  const stone = kit.mat('#2A2D33', { rough: 0.35, metal: 0.25 });
  const inner = kit.mat('#3A3530', { rough: 0.7 });
  const brass = kit.mat('#C9A45C', { metal: 0.9, rough: 0.25 });
  const steel = kit.mat('#B7BEC6', { metal: 0.92, rough: 0.28 });
  const chrome = kit.mat('#D6DBE1', { metal: 0.95, rough: 0.15 });
  const W = 1.7;
  const HT = 3.6;
  const D = 0.36;
  const CY = 1.3;
  const HOLE = 0.98;
  // Parede com o vão redondo.
  const wall = new THREE.Shape([P2(-W, 0), P2(W, 0), P2(W, HT), P2(-W, HT)]);
  wall.holes.push(new THREE.Path().absarc(0, CY, HOLE, 0, Math.PI * 2, true));
  const wallGeo = new THREE.ExtrudeGeometry(wall, { depth: D, bevelEnabled: false, curveSegments: 48 });
  wallGeo.translate(0, 0, -D);
  b.add(stone, wallGeo);
  // Cornija, rodapé e frisos de latão.
  b.add(stone, new THREE.BoxGeometry(W * 2 + 0.2, 0.16, D + 0.14), [0, HT + 0.08, -D / 2 + 0.07]);
  b.add(brass, new THREE.BoxGeometry(W * 2, 0.025, 0.02), [0, HT - 0.06, 0.01]);
  b.add(brass, new THREE.BoxGeometry(W * 2, 0.04, 0.02), [0, 0.14, 0.01]);
  for (const sd of [-1, 1]) b.add(brass, new THREE.BoxGeometry(0.025, 3.38, 0.02), [sd * (W - 0.22), 1.85, 0.01]);
  // Batente de aço, aro de latão e o fio de luz quente em volta.
  b.add(chrome, new THREE.TorusGeometry(HOLE + 0.04, 0.07, 14, 80), [0, CY, 0]);
  b.add(brass, new THREE.TorusGeometry(HOLE + 0.16, 0.016, 8, 80), [0, CY, 0.012]);
  b.add(kit.mat('#FFD9A0', { glow: true }), new THREE.TorusGeometry(HOLE + 0.24, 0.009, 6, 96), [0, CY, 0.01]);
  // Dobradiças (lado esquerdo de quem olha).
  for (const dy of [-0.55, 0.55]) b.add(chrome, new THREE.CylinderGeometry(0.05, 0.05, 0.26, 16), [-HOLE - 0.02, CY + dy, 0.1]);
  // Luz de estado com moldura de latão.
  const LY = CY + HOLE + 0.42;
  b.add(brass, new THREE.RingGeometry(0.034, 0.048, 24), [0, LY, 0.004]);
  const pip = kit.own(new THREE.MeshStandardMaterial({ color: '#3A3F47', roughness: 0.3, emissive: '#000000', emissiveIntensity: 0 }));
  const pipM = new THREE.Mesh(new THREE.CircleGeometry(0.032, 24), pip);
  pipM.position.set(0, LY, 0.006);
  // Câmara atrás da parede: paredes, teto com luz quente e caixas de depósito no fundo.
  const back = -1.25;
  b.add(inner, new THREE.BoxGeometry(W * 2, HT, 0.1), [0, HT / 2, back - 0.05]);
  for (const sd of [-1, 1]) b.add(inner, new THREE.BoxGeometry(0.1, HT, -back - D), [sd * (W - 0.05), HT / 2, (back - D) / 2]);
  b.add(inner, new THREE.BoxGeometry(W * 2, 0.1, -back - D), [0, HT - 0.05, (back - D) / 2]);
  b.add(kit.mat('#4A4038', { rough: 0.8 }), new THREE.BoxGeometry(W * 2 - 0.2, 0.02, -back - D), [0, 0.01, (back - D) / 2]);
  b.add(kit.mat('#FFE2B0', { glow: true }), new THREE.BoxGeometry(W * 1.5, 0.02, 0.05), [0, HT - 0.11, back + 0.25]);
  const box = kit.mat('#9AA3AD', { metal: 0.85, rough: 0.35 });
  for (let r = 0; r < 7; r++)
    for (let k = 0; k < 7; k++) {
      const bx = -1.05 + k * 0.35;
      const by = 0.35 + r * 0.29;
      b.add(box, new THREE.BoxGeometry(0.32, 0.26, 0.04), [bx, by, back + 0.02]);
      b.add(brass, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), [bx, by, back + 0.045], [Math.PI / 2, 0, 0]);
    }
  // Porta: gira na dobradiça; o volante gira antes de ela abrir (e depois de fechar).
  const hinge = new THREE.Group();
  hinge.position.set(-HOLE - 0.02, CY, 0.1);
  const db = new Builder();
  const cx = HOLE + 0.02;
  const dz = -0.26;
  db.add(steel, new THREE.CylinderGeometry(0.95, 0.95, 0.3, 72), [cx, 0, dz], [Math.PI / 2, 0, 0]);
  for (const [r, w] of [[0.84, 0.02], [0.62, 0.013]] as const) db.add(chrome, new THREE.TorusGeometry(r, w, 8, 72), [cx, 0, dz + 0.15]);
  db.add(brass, new THREE.CylinderGeometry(0.24, 0.24, 0.03, 48), [cx, 0, dz + 0.16], [Math.PI / 2, 0, 0]);
  db.add(chrome, new THREE.CylinderGeometry(0.08, 0.08, 0.12, 20), [cx, 0, dz + 0.2], [Math.PI / 2, 0, 0]);
  for (const dy of [-0.55, 0.55]) db.add(chrome, new THREE.BoxGeometry(0.26, 0.1, 0.06), [0.12, dy, -0.08]);
  // Ferrolhos na borda e o anel do mecanismo no lado de dentro (aparecem com a porta aberta).
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    db.add(chrome, new THREE.CylinderGeometry(0.028, 0.028, 0.08, 10), [cx + Math.cos(a) * 0.96, Math.sin(a) * 0.96, dz - 0.05], [0, 0, a - Math.PI / 2]);
  }
  db.add(brass, new THREE.TorusGeometry(0.7, 0.03, 8, 64), [cx, 0, dz - 0.15]);
  db.add(steel, new THREE.CylinderGeometry(0.5, 0.5, 0.03, 48), [cx, 0, dz - 0.16], [Math.PI / 2, 0, 0]);
  hinge.add(db.build());
  const wheel = new THREE.Group();
  wheel.position.set(cx, 0, dz + 0.27);
  const wb = new Builder();
  wb.add(chrome, new THREE.TorusGeometry(0.36, 0.022, 10, 56));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    wb.add(chrome, new THREE.CylinderGeometry(0.014, 0.014, 0.46, 8), [Math.cos(a) * 0.23, Math.sin(a) * 0.23, 0], [0, 0, a - Math.PI / 2]);
    wb.add(brass, new THREE.SphereGeometry(0.035, 12, 8), [Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0]);
  }
  wb.add(brass, new THREE.SphereGeometry(0.06, 16, 10), [0, 0, 0], undefined, [1, 1, 0.6]);
  wheel.add(wb.build());
  hinge.add(wheel);
  // A porta não entra na colisão (quem anda já não passa do limite do salão; aberta, ela não vira parede).
  hinge.traverse((o) => (o.userData.noCollide = true));
  g.add(b.build(), pipM, hinge);
  root.add(g);

  let state: VaultState = 'locked';
  let p = 0;
  let target = 0;
  let last = 0;
  const paint = () => {
    const col = state === 'open' ? '#22C55E' : state === 'locked' ? '#F59E0B' : '#3A3F47';
    pip.color.set(col);
    pip.emissive.set(state === 'none' ? '#000000' : col);
    pip.emissiveIntensity = state === 'none' ? 0 : 1.1;
  };
  paint();
  const smooth = (k: number) => k * k * (3 - 2 * k);
  // Primeiro terço: o volante dá uma volta (recolhe os ferrolhos); depois a porta abre para fora.
  const pose = () => {
    wheel.rotation.z = -smooth(Math.min(1, p / 0.32)) * Math.PI * 2;
    hinge.rotation.y = -smooth(Math.max(0, (p - 0.32) / 0.68)) * 1.95;
  };
  return {
    kind: 'vault',
    level,
    x: x + Math.sin(face) * 1.2,
    z: z + Math.cos(face) * 1.2,
    face,
    setVault: (s, instant) => {
      const to = s === 'open' ? 1 : 0;
      const moves = to !== target;
      state = s;
      target = to;
      if (instant) {
        p = to;
        pose();
      }
      paint();
      return moves;
    },
    tick: (t) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      if (p === target) return;
      p = target > p ? Math.min(target, p + dt / 2.6) : Math.max(target, p - dt / 2.6);
      pose();
    },
  };
}
