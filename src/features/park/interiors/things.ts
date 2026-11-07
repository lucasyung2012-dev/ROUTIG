/**
 * Objetos funcionais dos interiores (V2.1, seção 11): chegando perto aparece "Interagir" e o
 * objeto faz o que faz de verdade:
 * - piano de cauda e bateria: abrem o teclado/pads na tela e tocam (as teclas e peças se mexem);
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

export type ThingKind = 'piano' | 'drums' | 'record' | 'lamp' | 'globe' | 'clock' | 'telescope' | 'stairs' | 'room';
export type Timbre = 'piano' | 'kick' | 'snare' | 'hat' | 'tom' | 'bell' | 'pluck' | 'voice' | 'whistle' | 'ball' | 'kid' | 'door' | 'gate' | 'bark' | 'quack' | 'coo' | 'meow' | 'bikebell' | 'horn' | 'brake' | 'frog';

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
  /** Ação local (luz, globo, relógio, disco). Piano, bateria, luneta, escada e sala são do motor. */
  act?: (c: ThingCtx) => void;
  /** Animação por quadro (tempo em ms). */
  tick?: (t: number) => void;
  /** Tecla/peça tocada (piano: índice da tecla; bateria: peça). */
  press?: (i: number) => void;
}

/** Notas do teclado na tela: duas oitavas a partir do Dó central. */
export const PIANO_KEYS: Array<{ midi: number; black: boolean }> = Array.from({ length: 25 }, (_, i) => ({ midi: 60 + i, black: [1, 3, 6, 8, 10].includes(i % 12) }));
export const DRUM_PADS: Timbre[] = ['kick', 'snare', 'hat', 'tom'];

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
