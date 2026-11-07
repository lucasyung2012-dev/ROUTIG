/**
 * Pessoas do parque (V2.1, seção 13): figura humana neutra de 1,70 m com articulações (ombro,
 * cotovelo, quadril, joelho), rosto com nariz, olhos e orelhas, cabelo, mãos e sapatos, e os
 * objetos de cada atividade nas mãos (livro, violão, caderno de desenho, câmera).
 * Tudo em instâncias: uma malha por parte do corpo (os dois lados juntos), então o avatar e
 * todos os moradores visíveis custam ~16 desenhos por quadro, qualquer que seja a quantidade.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kit } from './kit';

/** Sombreado liso: junta os vértices repetidos antes das normais (pele e roupa sem "degraus"). */
function smooth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  g.dispose();
  m.computeVertexNormals();
  return m;
}

export type Pose = 'stand' | 'walk' | 'sit' | 'read' | 'play' | 'wave' | 'exercise' | 'draw' | 'photo' | 'tennis' | 'kick' | 'cheer' | 'keeper' | 'run' | 'bike' | 'skate' | 'water' | 'swing';
export type Outfit = 'tee' | 'shirt' | 'jacket' | 'hoodie' | 'dress' | 'sport';
export type Expr = 'neutral' | 'smile' | 'talk' | 'surprised' | 'laugh';

export interface Figure {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pose: Pose;
  /** Fase do passo (radianos) e intensidade (0..1). */
  phase: number;
  stride: number;
  shirt: string;
  pants: string;
  skin: string;
  hair?: string;
  /** Escala (1 = 1,70 m). */
  scale: number;
  /** Virar a cabeça (radianos), por exemplo para olhar quem chega. */
  look?: number;
  /** Expressão do rosto: sorrindo ao cumprimentar, boca mexendo ao falar. */
  expr?: Expr;
  /** Estilo da roupa e segunda cor (jaqueta, gola, listra, capuz). */
  outfit?: Outfit;
  accent?: string;
  /** 0 nada, 1 boné, 2 gorro. */
  hat?: number;
  hatColor?: string;
  glasses?: boolean;
  /** Mochila nas costas. */
  bag?: boolean;
  shoes?: string;
  /** Cor do solado e do cadarço. */
  sole?: string;
  /** Cor da bicicleta, do skate ou do regador. */
  gear?: string;
  /** 0 curto, 1 comprido, 2 coque, 3 cacheado. */
  hairStyle?: number;
  /** Cor dos olhos (íris). */
  eyes?: string;
  /** Manga curta (antebraço à mostra) e bermuda (canela à mostra). */
  shortSleeves?: boolean;
  shorts?: boolean;
  /** Fase própria para piscar em tempos diferentes. */
  seed?: number;
}


export interface Crowd {
  group: THREE.Group;
  /** Desenha estas figuras (as demais instâncias somem). */
  set: (list: Figure[]) => void;
  capacity: number;
}

// Medidas (m). Quadril a 0,86; ombros a 1,34; topo da cabeça ~1,70 com o cabelo.
const THIGH = 0.41;
const SHIN = 0.4;
const ANKLE = 0.05;
const HIP = THIGH + SHIN + ANKLE;
const TORSO = 0.48;
const UPPER = 0.29;
const FORE = 0.26;
// Sentado: a pelve apoia no assento (0,45 m) sem afundar nele.
const SIT_HIP = 0.53;

/** Peça de membro: cápsula afinando, com a origem no topo (a articulação). */
function limb(r0: number, r1: number, len: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.sin(a) * r1, -len + r1 - Math.cos(a) * r1));
  }
  const mid = [new THREE.Vector2(r1, -len + r1), new THREE.Vector2(r0 * 1.04, -len * 0.45), new THREE.Vector2(r0, -r0)];
  const top: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 0.5;
    top.push(new THREE.Vector2(Math.cos(a) * r0, -r0 + Math.sin(a) * r0));
  }
  const g = new THREE.LatheGeometry([...pts, ...mid, ...top], 12);
  g.computeVertexNormals();
  return g;
}

function torsoGeo(): THREE.BufferGeometry {
  // Perfil da cintura ao pescoço; achatado na frente e atrás.
  const prof: Array<[number, number]> = [[0, 0], [0.135, 0.01], [0.145, 0.1], [0.15, 0.2], [0.175, 0.33], [0.18, 0.41], [0.16, 0.46], [0.1, 0.495], [0.055, 0.5], [0, 0.5]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  g.scale(1.12, 1, 0.66);
  g.computeVertexNormals();
  return g;
}

function headGeo(): THREE.BufferGeometry {
  const skull = new THREE.SphereGeometry(0.1, 18, 14);
  skull.scale(0.88, 1.1, 0.98);
  const jaw = new THREE.SphereGeometry(0.075, 14, 10);
  jaw.scale(1, 0.8, 1);
  jaw.translate(0, -0.055, 0.02);
  const nose = new THREE.ConeGeometry(0.016, 0.04, 8);
  nose.rotateX(Math.PI / 2 + 0.25);
  nose.translate(0, -0.005, 0.1);
  const earL = new THREE.SphereGeometry(0.022, 8, 6);
  earL.scale(0.5, 1, 0.8);
  earL.translate(-0.088, 0, -0.005);
  const earR = earL.clone();
  earR.translate(0.176, 0, 0);
  const neck = new THREE.CylinderGeometry(0.045, 0.05, 0.12, 12);
  neck.translate(0, -0.15, -0.01);
  const parts = [skull, jaw, nose, earL, earR, neck].map((g) => g.toNonIndexed());
  const m = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return smooth(m);
}

function hairGeo(style = 0): THREE.BufferGeometry {
  if (style === 3) {
    // Cacheado: cachos arredondados formando o volume.
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 * 3.1;
      const v = 0.15 + (i / 26) * 0.75;
      const c = new THREE.SphereGeometry(0.036, 8, 6);
      c.translate(Math.sin(a) * Math.sin(v * 1.6) * 0.1, 0.03 + Math.cos(v * 1.6) * 0.1, Math.cos(a) * Math.sin(v * 1.6) * 0.1 - 0.012);
      if (Math.cos(a) * Math.sin(v * 1.6) > 0.06 && v > 0.45) continue;
      parts.push(c.toNonIndexed());
    }
    return mergeGeometries(parts)!;
  }
  // Linha do cabelo alta na testa e baixa na nuca (calota inclinada para trás).
  const cap = new THREE.SphereGeometry(0.107, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cap.scale(0.93, 1.12, 1.04);
  cap.rotateX(-0.45);
  cap.translate(0, 0.012, -0.008);
  // Nuca: centrada atrás da cabeça (na esfera do three, phi = 1,5π aponta para -z).
  const back = new THREE.SphereGeometry(0.1, 14, 8, Math.PI * 1.1, Math.PI * 0.8, Math.PI * 0.35, Math.PI * 0.35);
  back.scale(0.95, 1.1, 1.05);
  back.translate(0, -0.005, -0.012);
  const parts = [cap.toNonIndexed(), back.toNonIndexed()];
  if (style === 1) {
    // Comprido: cai atrás até os ombros.
    const fall = new THREE.CylinderGeometry(0.1, 0.085, 0.24, 16, 1, true, Math.PI * 0.55, Math.PI * 0.9);
    fall.translate(0, -0.08, -0.012);
    parts.push(fall.toNonIndexed());
  } else if (style === 2) {
    // Coque no alto, atrás.
    const bun = new THREE.SphereGeometry(0.045, 12, 8);
    bun.translate(0, 0.085, -0.075);
    parts.push(bun.toNonIndexed());
  }
  const m = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return m;
}

/** Branco dos olhos (amêndoa), íris com pupila, sobrancelhas e as três bocas (neutra, sorriso, falando). */
function scleraGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(0.017, 12, 8);
    e.scale(1.25, 0.75, 0.45);
    e.translate(s * 0.035, 0.016, 0.083);
    parts.push(e.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}
function irisGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(0.0095, 10, 8);
    e.scale(1, 1, 0.4);
    e.translate(s * 0.035, 0.016, 0.0905);
    parts.push(e.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}
function browGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const b = new THREE.CapsuleGeometry(0.0045, 0.03, 3, 6);
    b.rotateZ(Math.PI / 2 + s * 0.12);
    b.translate(s * 0.036, 0.042, 0.088);
    parts.push(b.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}
function mouthGeo(kind: 'neutral' | 'smile' | 'talk' | 'open' | 'laugh'): THREE.BufferGeometry {
  if (kind === 'open') {
    // Espanto: boca em "o".
    const m = new THREE.TorusGeometry(0.012, 0.005, 6, 14);
    m.scale(1, 1.25, 1);
    m.translate(0, -0.05, 0.087);
    return m;
  }
  if (kind === 'laugh') {
    // Riso: meia-lua aberta.
    const m = new THREE.CircleGeometry(0.024, 14, Math.PI, Math.PI);
    m.translate(0, -0.032, 0.089);
    return m;
  }
  if (kind === 'talk') {
    const m = new THREE.SphereGeometry(0.014, 10, 8);
    m.scale(1.2, 0.8, 0.35);
    m.translate(0, -0.05, 0.086);
    return m;
  }
  const t = new THREE.TorusGeometry(kind === 'smile' ? 0.02 : 0.03, 0.0045, 6, 14, kind === 'smile' ? Math.PI * 0.8 : Math.PI * 0.25);
  t.rotateZ(kind === 'smile' ? Math.PI + Math.PI * 0.1 : Math.PI + Math.PI * 0.375);
  t.translate(0, kind === 'smile' ? -0.036 : -0.022, 0.088);
  return t;
}

/** Jaqueta aberta na frente (por cima da camiseta), com lapelas. */
function jacketGeo(): THREE.BufferGeometry {
  const prof: Array<[number, number]> = [[0.15, -0.04], [0.16, 0.1], [0.165, 0.2], [0.19, 0.33], [0.195, 0.41], [0.172, 0.465], [0.11, 0.5], [0.07, 0.51]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18, 0.42, Math.PI * 2 - 0.84);
  g.scale(1.12, 1, 0.68);
  const parts = [g.toNonIndexed()];
  for (const s of [-1, 1]) {
    const lapel = new THREE.BoxGeometry(0.05, 0.16, 0.012);
    lapel.rotateZ(s * 0.35);
    lapel.translate(s * 0.06, 0.42, 0.115);
    parts.push(lapel.toNonIndexed());
  }
  const m = mergeGeometries(parts)!;
  return smooth(m);
}
/** Gola e botões da camisa social; listra da camiseta esportiva (mesma malha, cor de destaque). */
function collarGeo(): THREE.BufferGeometry {
  const c = new THREE.TorusGeometry(0.06, 0.014, 6, 16, Math.PI * 1.4);
  c.rotateX(Math.PI / 2);
  c.rotateY(-Math.PI * 0.2 - Math.PI / 2);
  c.scale(1.1, 1, 0.9);
  c.translate(0, 0.49, 0);
  const placket = new THREE.BoxGeometry(0.02, 0.36, 0.01);
  placket.translate(0, 0.27, 0.118);
  return mergeGeometries([c.toNonIndexed(), placket.toNonIndexed()])!;
}
function stripeGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.18, 0.18, 0.07, 18, 1, true);
  g.scale(1.12, 1, 0.68);
  g.translate(0, 0.3, 0);
  return g;
}
/** Capuz caído nas costas e os cordões. */
function hoodGeo(): THREE.BufferGeometry {
  const hood = new THREE.SphereGeometry(0.11, 14, 10, Math.PI * 1.05, Math.PI * 0.9, 0, Math.PI * 0.6);
  hood.scale(1.1, 0.7, 1);
  hood.translate(0, 0.5, -0.03);
  const parts = [hood.toNonIndexed()];
  for (const s of [-1, 1]) {
    const cord = new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4);
    cord.translate(s * 0.03, 0.42, 0.115);
    parts.push(cord.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}
/** Saia do vestido, do quadril ao joelho (abre um pouco embaixo). */
function skirtGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.16, 0.27, 0.46, 18, 1, true);
  g.scale(1.1, 1, 0.85);
  g.translate(0, -0.2, 0);
  return g;
}
/** Boné (copa e aba) ou gorro. */
function hatGeo(kind: 1 | 2): THREE.BufferGeometry {
  if (kind === 2) {
    const beanie = new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    beanie.scale(0.95, 1.2, 1.05);
    beanie.translate(0, 0.02, -0.006);
    const fold = new THREE.CylinderGeometry(0.106, 0.108, 0.035, 16, 1, true);
    fold.translate(0, 0.03, -0.006);
    return mergeGeometries([beanie.toNonIndexed(), fold.toNonIndexed()])!;
  }
  const crown = new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  crown.scale(0.95, 0.85, 1.05);
  crown.translate(0, 0.04, -0.005);
  const brim = new THREE.CylinderGeometry(0.075, 0.075, 0.01, 14, 1, false, -Math.PI / 2, Math.PI);
  brim.scale(1.1, 1, 1);
  brim.translate(0, 0.045, 0.09);
  return mergeGeometries([crown.toNonIndexed(), brim.toNonIndexed()])!;
}
/** Óculos: dois aros e a ponte. */
function glassesGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const rim = new THREE.TorusGeometry(0.019, 0.0028, 4, 14);
    rim.translate(s * 0.036, 0.016, 0.096);
    parts.push(rim.toNonIndexed());
    const arm = new THREE.BoxGeometry(0.003, 0.003, 0.09);
    arm.translate(s * 0.07, 0.018, 0.05);
    parts.push(arm.toNonIndexed());
  }
  const bridge = new THREE.BoxGeometry(0.016, 0.003, 0.003);
  bridge.translate(0, 0.02, 0.097);
  parts.push(bridge.toNonIndexed());
  return mergeGeometries(parts)!;
}
/** Mochila com bolso e alças. */
function bagGeo(): THREE.BufferGeometry {
  const body = new THREE.CapsuleGeometry(0.11, 0.16, 4, 10);
  body.scale(1.15, 1, 0.55);
  body.translate(0, 0.27, -0.16);
  const pocket = new THREE.BoxGeometry(0.16, 0.1, 0.04);
  pocket.translate(0, 0.2, -0.22);
  const parts = [body.toNonIndexed(), pocket.toNonIndexed()];
  for (const s of [-1, 1]) {
    const strap = new THREE.TorusGeometry(0.1, 0.012, 4, 10, Math.PI);
    strap.rotateY(Math.PI / 2);
    strap.translate(s * 0.1, 0.33, -0.02);
    parts.push(strap.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}
/** Bochechas rosadas (ao sorrir e rir). */
function cheekGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const c = new THREE.CircleGeometry(0.014, 10);
    c.rotateY(s * 0.55);
    c.translate(s * 0.052, -0.012, 0.083);
    parts.push(c.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}

function handGeo(): THREE.BufferGeometry {
  // Mão relaxada ao lado do corpo: punho, palma achatada de lado (virada para a coxa), quatro
  // dedos de comprimentos diferentes levemente dobrados e o polegar à frente.
  const wrist = new THREE.CylinderGeometry(0.03, 0.032, 0.03, 10);
  wrist.scale(0.75, 1, 1);
  wrist.translate(0, -0.012, 0);
  const palm = new THREE.CapsuleGeometry(0.034, 0.036, 4, 12);
  palm.scale(0.5, 1, 1.2);
  palm.translate(0, -0.06, 0);
  const parts = [wrist, palm];
  [0.048, 0.056, 0.052, 0.042].forEach((len, k) => {
    const f = new THREE.CapsuleGeometry(0.0088, len, 3, 8);
    f.translate(0, -len / 2, 0);
    f.rotateX(-0.22 - k * 0.04);
    f.translate(-0.004, -0.098, 0.03 - k * 0.0195);
    parts.push(f);
  });
  const thumb = new THREE.CapsuleGeometry(0.0105, 0.036, 3, 8);
  thumb.translate(0, -0.018, 0);
  thumb.rotateX(-0.75);
  thumb.translate(-0.006, -0.05, 0.038);
  parts.push(thumb);
  const m = mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  parts.forEach((g) => g.dispose());
  return smooth(m);
}

function shoeGeo(): THREE.BufferGeometry {
  const upper = new THREE.CapsuleGeometry(0.044, 0.15, 4, 14);
  upper.rotateX(Math.PI / 2);
  upper.scale(1, 0.78, 1);
  upper.translate(0, -0.018, 0.048);
  // Cano em volta do tornozelo e biqueira um pouco mais alta.
  const collar = new THREE.CylinderGeometry(0.045, 0.05, 0.05, 12);
  collar.scale(0.95, 1, 1.1);
  collar.translate(0, 0.006, -0.01);
  const tongue = new THREE.BoxGeometry(0.045, 0.012, 0.075);
  tongue.rotateX(-0.45);
  tongue.translate(0, 0.022, 0.05);
  const parts = [upper, collar, tongue].map((g) => g.toNonIndexed());
  const m = mergeGeometries(parts)!;
  return smooth(m);
}
function soleGeo(): THREE.BufferGeometry {
  const sole = new THREE.CapsuleGeometry(0.048, 0.165, 4, 14);
  sole.rotateX(Math.PI / 2);
  sole.scale(1.04, 0.24, 1);
  sole.translate(0, -0.048, 0.048);
  const parts = [sole.toNonIndexed()];
  // Cadarço: quatro passadas cruzando o peito do pé.
  for (let k = 0; k < 4; k++) {
    const l = new THREE.BoxGeometry(0.05, 0.005, 0.008);
    l.rotateX(-0.4);
    l.translate(0, 0.018 - k * 0.008, 0.03 + k * 0.022);
    parts.push(l.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}
/** Barra da camiseta (por cima do cós), gola careca, punho da manga, cinto e meia. */
function ringGeo(r: number, h: number, sx = 1, sz = 1, y = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r * 1.03, h, 18, 1, true);
  g.scale(sx, 1, sz);
  g.translate(0, y, 0);
  return g;
}
function beltGeo(): THREE.BufferGeometry {
  const belt = ringGeo(0.158, 0.035, 1.07, 0.7, 0.045);
  const buckle = new THREE.BoxGeometry(0.04, 0.03, 0.012);
  buckle.translate(0, 0.045, 0.112);
  return mergeGeometries([belt.toNonIndexed(), buckle.toNonIndexed()])!;
}
function crewGeo(): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(0.066, 0.009, 6, 18);
  g.rotateX(Math.PI / 2);
  g.scale(1.12, 1, 0.82);
  g.translate(0, 0.488, 0.005);
  return g;
}

/** Tubo entre dois pontos (quadro da bicicleta). */
function tube(a: [number, number, number], b: [number, number, number], r: number): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g.toNonIndexed();
}
/** Quadro: tubos, garfo, guidão com manoplas, selim, para-lama e corrente (rodas e pedivela à parte, girando). */
function bikeGeo(): THREE.BufferGeometry {
  const crank: [number, number, number] = [0, 0.3, 0.17];
  const seatTop: [number, number, number] = [0, 0.86, -0.05];
  const headTop: [number, number, number] = [0, 0.9, 0.42];
  const headBot: [number, number, number] = [0, 0.66, 0.46];
  const rear: [number, number, number] = [0, 0.34, -0.5];
  const front: [number, number, number] = [0, 0.34, 0.58];
  const parts = [
    tube(crank, seatTop, 0.018),
    tube([0, 0.8, -0.03], headTop, 0.017),
    tube(crank, headBot, 0.02),
    tube(headBot, headTop, 0.022),
    tube(headBot, front, 0.014),
    tube(crank, rear, 0.012),
    tube([0, 0.78, -0.04], rear, 0.011),
    tube(headTop, [0, 0.98, 0.38], 0.014),
    tube([-0.26, 0.98, 0.38], [0.26, 0.98, 0.38], 0.012),
    tube(seatTop, [0, 0.9, -0.06], 0.012),
  ];
  for (const s of [-1, 1]) parts.push(tube([s * 0.2, 0.98, 0.38], [s * 0.27, 0.98, 0.38], 0.02));
  const saddle = new THREE.CapsuleGeometry(0.05, 0.14, 3, 8);
  saddle.rotateX(Math.PI / 2);
  saddle.scale(1, 0.4, 1);
  saddle.translate(0, 0.93, -0.06);
  parts.push(saddle.toNonIndexed());
  const fender = new THREE.TorusGeometry(0.36, 0.02, 4, 14, Math.PI * 0.6);
  fender.rotateY(Math.PI / 2);
  fender.rotateX(-Math.PI * 0.2);
  fender.translate(0, 0.34, -0.5);
  parts.push(fender.toNonIndexed());
  return mergeGeometries(parts)!;
}
/** Roda: pneu, aro, cubo e raios (gira em volta do eixo x). */
function wheelGeo(): THREE.BufferGeometry {
  const tire = new THREE.TorusGeometry(0.33, 0.022, 6, 28);
  tire.rotateY(Math.PI / 2);
  const rim = new THREE.TorusGeometry(0.3, 0.008, 4, 28);
  rim.rotateY(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8);
  hub.rotateZ(Math.PI / 2);
  const parts = [tire.toNonIndexed(), rim.toNonIndexed(), hub.toNonIndexed()];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    parts.push(tube([0, 0, 0], [0, Math.sin(a) * 0.3, Math.cos(a) * 0.3], 0.0025));
  }
  return mergeGeometries(parts)!;
}
/** Pedivela com coroa e dois pedais (gira com a pedalada). */
function crankGeo(): THREE.BufferGeometry {
  const ring = new THREE.TorusGeometry(0.09, 0.008, 4, 20);
  ring.rotateY(Math.PI / 2);
  ring.translate(0.04, 0, 0);
  const parts = [ring.toNonIndexed(), tube([0.05, 0, 0], [0.05, 0.17, 0], 0.01), tube([-0.05, 0, 0], [-0.05, -0.17, 0], 0.01)];
  for (const s of [-1, 1]) {
    const pedal = new THREE.BoxGeometry(0.09, 0.02, 0.06);
    pedal.translate(s * 0.1, s * 0.17, 0);
    parts.push(pedal.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}
/** Shape de skate com rodinhas e trucks. */
function boardGeo(): THREE.BufferGeometry {
  const deck = new THREE.CapsuleGeometry(0.1, 0.6, 4, 10);
  deck.rotateX(Math.PI / 2);
  deck.scale(1, 0.12, 1);
  deck.translate(0, 0.085, 0);
  const parts = [deck.toNonIndexed()];
  for (const z of [-0.26, 0.26]) {
    parts.push(tube([-0.08, 0.04, z], [0.08, 0.04, z], 0.008));
    for (const s of [-1, 1]) {
      const w = new THREE.CylinderGeometry(0.028, 0.028, 0.03, 10);
      w.rotateZ(Math.PI / 2);
      w.translate(s * 0.09, 0.028, z);
      parts.push(w.toNonIndexed());
    }
  }
  return mergeGeometries(parts)!;
}
/** Regador de jardim com bico comprido e alça. */
function canGeo(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.09, 0.1, 0.2, 14);
  body.translate(0, -0.18, 0.06);
  const spout = tube([0, -0.22, 0.14], [0, -0.1, 0.36], 0.012);
  const rose = new THREE.CylinderGeometry(0.03, 0.018, 0.04, 10);
  rose.rotateX(-0.9);
  rose.translate(0, -0.09, 0.38);
  const handle = new THREE.TorusGeometry(0.07, 0.01, 4, 12, Math.PI);
  handle.rotateY(Math.PI / 2);
  handle.translate(0, -0.07, 0.04);
  return mergeGeometries([body.toNonIndexed(), spout, rose.toNonIndexed(), handle.toNonIndexed()])!;
}

function bookGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const page = new THREE.BoxGeometry(0.13, 0.008, 0.19);
    page.translate(0.065, 0, 0);
    page.rotateZ(s * 0.25);
    page.scale(s, 1, 1);
    parts.push(page.toNonIndexed());
  }
  const m = mergeGeometries(parts)!;
  return m;
}

function guitarGeo(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.17, 0.17, 0.09, 20);
  body.scale(1, 1, 1.25);
  body.rotateX(Math.PI / 2);
  const waist = new THREE.CylinderGeometry(0.13, 0.13, 0.09, 20);
  waist.rotateX(Math.PI / 2);
  waist.translate(0, 0.2, 0);
  const neck = new THREE.BoxGeometry(0.05, 0.5, 0.03);
  neck.translate(0, 0.52, 0.02);
  const head = new THREE.BoxGeometry(0.07, 0.12, 0.03);
  head.translate(0, 0.82, 0.02);
  const parts = [body, waist, neck, head].map((g) => g.toNonIndexed());
  return mergeGeometries(parts)!;
}

function sketchGeo(): THREE.BufferGeometry {
  const pad = new THREE.BoxGeometry(0.26, 0.012, 0.2);
  const pencil = new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6);
  pencil.rotateZ(Math.PI / 2.4);
  pencil.translate(0.05, 0.03, 0.02);
  return mergeGeometries([pad.toNonIndexed(), pencil.toNonIndexed()])!;
}

function racketGeo(): THREE.BufferGeometry {
  const handle = new THREE.CylinderGeometry(0.014, 0.016, 0.28, 8);
  handle.translate(0, -0.14, 0);
  const head = new THREE.TorusGeometry(0.11, 0.008, 6, 20);
  head.scale(0.8, 1.15, 1);
  head.rotateY(Math.PI / 2);
  head.translate(0, -0.4, 0);
  const strings = new THREE.CircleGeometry(0.1, 16);
  strings.scale(0.8, 1.15, 1);
  strings.rotateY(Math.PI / 2);
  strings.translate(0, -0.4, 0);
  return mergeGeometries([handle.toNonIndexed(), head.toNonIndexed(), strings.toNonIndexed()])!;
}

function cameraGeo(): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(0.13, 0.08, 0.06);
  const lens = new THREE.CylinderGeometry(0.028, 0.03, 0.06, 14);
  lens.rotateX(Math.PI / 2);
  lens.translate(0, 0, 0.06);
  return mergeGeometries([box.toNonIndexed(), lens.toNonIndexed()])!;
}

interface Joints {
  hip: number;
  lean: number;
  hf: [number, number];
  kf: [number, number];
  legOut: number;
  sf: [number, number];
  ef: [number, number];
  abd: [number, number];
  headPitch: number;
  headYaw: number;
  /** Giro do peito contra o quadril (o ombro do braço que vai à frente avança junto). */
  twist: number;
  prop: 'book' | 'guitar' | 'sketch' | 'camera' | 'racket' | null;
}

function joints(f: Figure): Joints {
  const s = f.stride;
  const p = f.phase;
  const j: Joints = { hip: HIP, lean: 0, hf: [0, 0], kf: [0.04, 0.04], legOut: 0, sf: [0, 0], ef: [0.15, 0.15], abd: [0.08, 0.08], headPitch: 0, headYaw: f.look ?? 0, twist: 0, prop: null };
  const breathe = Math.sin(p * 0.5) * 0.02;
  switch (f.pose) {
    case 'walk': {
      // Marcha natural: a coxa vai mais para a frente do que para trás, o joelho só dobra bem na
      // fase de balanço (perna passando) e quase estica ao pisar; o quadril sobe no meio do apoio e
      // desce com as pernas abertas. Braços opostos às pernas, um pouco atrasados: na volta o braço
      // fica quase esticado e a mão passa atrás do quadril; na ida o cotovelo dobra. O peito gira de
      // leve contra o quadril.
      const a = Math.sin(p);
      const knee = (ph: number) => (0.06 + 0.78 * Math.max(0, Math.cos(ph - 0.35)) ** 2) * s;
      j.hf = [(0.08 + a * 0.32) * s, (0.08 - a * 0.32) * s];
      j.kf = [knee(p), knee(p + Math.PI)];
      const arm = Math.sin(p - 0.25);
      j.sf = [(-0.08 - arm * 0.36) * s, (-0.08 + arm * 0.36) * s];
      j.ef = [0.08 + Math.max(0, -arm) * 0.32 * s, 0.08 + Math.max(0, arm) * 0.32 * s];
      j.abd = [0.07, 0.07];
      j.twist = -a * 0.07 * s;
      j.hip = HIP - 0.014 * s + (1 - Math.abs(a)) * 0.02 * s;
      j.lean = 0.03 * s;
      j.headPitch = Math.sin(p * 2) * 0.012 * s;
      break;
    }
    case 'sit':
    case 'read':
    case 'play':
    case 'draw': {
      j.hip = SIT_HIP;
      j.hf = [1.5, 1.42];
      j.kf = [1.32, 1.22];
      j.legOut = 0.07;
      // Mãos apoiadas nas coxas, encostado de leve no encosto.
      j.sf = [0.42, 0.4];
      j.ef = [0.95, 1.0];
      j.abd = [0.1, 0.1];
      j.lean = -0.1 + breathe;
      const way = (f.seed ?? 0) % 3;
      if (f.pose === 'sit' && way === 1) {
        // Inclinado para a frente, cotovelos nos joelhos.
        j.lean = 0.32 + breathe;
        j.sf = [0.75, 0.75];
        j.ef = [1.55, 1.55];
        j.abd = [0.18, 0.18];
        j.headPitch = -0.2;
      } else if (f.pose === 'sit' && way === 2) {
        // Bem encostado, um braço sobre o encosto e o outro no colo.
        j.lean = -0.2 + breathe;
        j.sf = [0.35, -0.35];
        j.abd = [0.1, 1.25];
        j.ef = [1.0, 0.5];
        j.hf = [1.38, 1.5];
        j.kf = [1.0, 1.36];
      }
      if (f.pose === 'read') {
        j.sf = [0.75, 0.75];
        j.ef = [1.15, 1.15];
        j.abd = [0.25, 0.25];
        j.headPitch = 0.38;
        j.prop = 'book';
      } else if (f.pose === 'play') {
        j.sf = [0.85, 0.5];
        j.ef = [0.5, 1.25 + Math.sin(p * 3) * 0.18];
        j.abd = [0.55, 0.2];
        j.headPitch = 0.2;
        j.prop = 'guitar';
      } else if (f.pose === 'draw') {
        j.sf = [0.55, 0.7 + Math.sin(p * 2) * 0.08];
        j.ef = [0.9, 1.0];
        j.abd = [0.15, 0.15];
        j.headPitch = 0.45;
        j.prop = 'sketch';
      }
      break;
    }
    case 'tennis': {
      // Raquete na mão direita; o braço vai e volta na batida, pernas abertas e joelhos dobrados.
      const sw = Math.sin(p * 1.3);
      j.hf = [0.25, -0.15];
      j.kf = [0.35, 0.3];
      j.legOut = 0.12;
      j.hip = HIP - 0.06;
      j.sf = [0.5, 0.6 + sw * 0.7];
      j.abd = [0.2, 0.5 + sw * 0.4];
      j.ef = [0.9, 0.4];
      j.lean = 0.12;
      j.prop = 'racket';
      break;
    }
    case 'run': {
      // Corrida: passada mais longa, joelho subindo na volta da perna, tronco inclinado e girando com
      // os braços. Braço dobrado que vai bem para trás (mão junto ao quadril, cotovelo mais aberto) e
      // volta à frente do peito (cotovelo fechado); pequena fase de voo.
      const a = Math.sin(p);
      const knee = (ph: number) => 0.25 + 1.15 * Math.max(0, Math.cos(ph - 0.3)) ** 2;
      j.hf = [0.18 + a * 0.55, 0.18 - a * 0.55];
      j.kf = [knee(p), knee(p + Math.PI)];
      const arm = Math.sin(p - 0.2);
      const elbow = (fw: number) => 1.2 + Math.max(0, fw) * 0.3 - Math.max(0, -fw) * 0.25;
      j.sf = [-0.25 - arm * 0.6, -0.25 + arm * 0.6];
      j.ef = [elbow(-arm), elbow(arm)];
      j.abd = [0.14, 0.14];
      j.twist = -a * 0.13;
      j.hip = HIP - 0.035 + (1 - Math.abs(a)) * 0.045;
      j.lean = 0.12;
      break;
    }
    case 'kick': {
      // Chute: perna direita vai para trás e volta com força; braços abrem para equilibrar.
      const k = Math.sin(Math.min(1, (p % (Math.PI * 2)) / Math.PI) * Math.PI);
      j.hf = [-0.1, -0.9 + k * 2.1];
      j.kf = [0.15, 1.2 - k * 1.1];
      j.abd = [0.6, 0.5];
      j.sf = [0.4, -0.5];
      j.lean = 0.1 - k * 0.15;
      break;
    }
    case 'cheer': {
      // Comemoração: braços para cima, pulinhos.
      const k = Math.abs(Math.sin(p * 2));
      j.abd = [2.7, 2.7];
      j.ef = [0.3, 0.3];
      j.hip = HIP + k * 0.06;
      j.kf = [0.2 + k * 0.3, 0.2 + k * 0.3];
      j.hf = [k * 0.2, k * 0.2];
      j.headPitch = -0.25;
      break;
    }
    case 'keeper': {
      // Goleiro: base aberta, joelhos dobrados, braços abertos e prontos.
      const sw = Math.sin(p * 0.7);
      j.hf = [0.35, 0.35];
      j.kf = [0.6, 0.6];
      j.legOut = 0.2;
      j.hip = HIP - 0.12;
      j.abd = [0.9 + sw * 0.2, 0.9 - sw * 0.2];
      j.ef = [0.6, 0.6];
      j.sf = [0.5, 0.5];
      j.lean = 0.25;
      break;
    }
    case 'photo':
      j.sf = [1.25, 1.25];
      j.ef = [1.75, 1.75];
      j.abd = [0.35, 0.35];
      j.headPitch = -0.05;
      j.prop = 'camera';
      break;
    case 'wave':
      // Aceno: braço levantado ao lado da cabeça, só o antebraço balança, de leve.
      j.sf = [0.04, 0.3];
      j.abd = [0.08, 2.3];
      j.ef = [0.15, 0.6 + Math.sin(p * 6) * 0.2];
      j.headPitch = -0.04;
      j.lean = -0.02;
      break;
    case 'bike': {
      // Pedalando: pelve no selim, pés nos pedais (cinemática inversa da perna até o pedal girando),
      // tronco inclinado e mãos no guidão.
      j.hip = 0.98;
      const L1 = THIGH;
      const L2 = SHIN;
      for (let k = 0; k < 2; k++) {
        const th = p + k * Math.PI;
        const tz = 0.17 + Math.cos(th) * 0.17;
        const ty = -0.63 + Math.sin(th) * 0.17;
        const d = Math.min(L1 + L2 - 0.01, Math.hypot(tz, ty));
        const knee = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
        const beta = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
        j.hf[k] = Math.atan2(tz, -ty) + beta;
        j.kf[k] = Math.PI - knee;
      }
      j.lean = 0.38;
      j.sf = [1.05, 1.05];
      j.ef = [0.35, 0.35];
      j.abd = [0.22, 0.22];
      j.headPitch = -0.3;
      break;
    }
    case 'skate': {
      // Skate: joelhos dobrados, braços um pouco abertos para equilibrar; de tempos em tempos a
      // perna de trás desce e empurra o chão.
      const push = Math.max(0, Math.sin(p * 0.5));
      const k = push > 0.55 ? (push - 0.55) / 0.45 : 0;
      j.hip = HIP - 0.08 - k * 0.04;
      j.hf = [0.35, 0.18 - k * 0.6];
      j.kf = [0.6, 0.38 - k * 0.2];
      j.legOut = 0.09;
      j.abd = [0.4 + Math.sin(p) * 0.08, 0.35 - Math.sin(p) * 0.08];
      j.sf = [0.1, -0.1];
      j.ef = [0.35, 0.3];
      j.lean = 0.12 + k * 0.1;
      j.twist = 0.15;
      break;
    }
    case 'water':
      // Regando: braço direito à frente segurando o regador, olhando para o canteiro.
      j.sf = [0.1, 0.85];
      j.ef = [0.3, 0.25];
      j.abd = [0.08, 0.15];
      j.headPitch = 0.4;
      j.lean = 0.15;
      j.kf = [0.15, 0.15];
      j.hf = [0.12, 0.12];
      break;
    case 'swing': {
      // No balanço: sentado, mãos nas correntes acima dos ombros, pernas esticam na ida e dobram na volta.
      const w = Math.sin(p);
      j.hip = SIT_HIP;
      j.hf = [1.35 + w * 0.3, 1.35 + w * 0.3];
      j.kf = [1.1 - w * 0.55, 1.1 - w * 0.55];
      j.sf = [2.6, 2.6];
      j.ef = [0.35, 0.35];
      j.abd = [0.12, 0.12];
      j.lean = -0.15 - w * 0.15;
      j.headPitch = -0.1;
      break;
    }
    case 'exercise': {
      const k = Math.abs(Math.sin(p));
      j.abd = [0.2 + k * 2.6, 0.2 + k * 2.6];
      j.legOut = 0.03 + k * 0.22;
      j.hip = HIP - k * 0.04;
      j.ef = [0.1, 0.1];
      break;
    }
    default:
      j.sf = [Math.sin(p * 0.5) * 0.03, -Math.sin(p * 0.5) * 0.03];
      j.lean = breathe * 0.5;
  }
  return j;
}

export function createCrowd(kit: Kit, capacity: number, shadows = true): Crowd {
  const group = new THREE.Group();
  const cloth = kit.mat('#ffffff', { rough: 0.85 });
  const skin = kit.mat('#ffffff', { rough: 0.55 });
  const own = <T extends THREE.BufferGeometry>(g: T) => kit.own(g);

  const mk = (g: THREE.BufferGeometry, m: THREE.Material, per = 1, shadow = shadows) => {
    const im = new THREE.InstancedMesh(own(g), m, capacity * per);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const white = new THREE.Color('#ffffff');
    for (let k = 0; k < capacity * per; k++) im.setColorAt(k, white);
    im.count = 0;
    im.castShadow = shadow;
    im.frustumCulled = false;
    group.add(im);
    return im;
  };
  const pelvis = mk(new THREE.SphereGeometry(0.15, 14, 8).scale(1.12, 0.6, 0.72), cloth);
  const torso = mk(torsoGeo(), cloth);
  const head = mk(headGeo(), skin);
  const hairs = [0, 1, 2, 3].map((k) => mk(hairGeo(k), cloth));
  const sclera = mk(scleraGeo(), kit.mat('#F7F5F0', { rough: 0.3 }), 1, false);
  const iris = mk(irisGeo(), kit.mat('#ffffff', { rough: 0.2 }), 1, false);
  const brows = mk(browGeo(), cloth, 1, false);
  const mouths = { neutral: mk(mouthGeo('neutral'), kit.mat('#A85A50', { rough: 0.5 }), 1, false), smile: mk(mouthGeo('smile'), kit.mat('#A85A50', { rough: 0.5 }), 1, false), talk: mk(mouthGeo('talk'), kit.mat('#5A2A26', { rough: 0.6 }), 1, false) };
  const upper = mk(limb(0.055, 0.045, UPPER), cloth, 2);
  const fore = mk(limb(0.043, 0.034, FORE), skin, 2);
  const hand = mk(handGeo(), skin, 2);
  const thigh = mk(limb(0.078, 0.06, THIGH), cloth, 2);
  const shin = mk(limb(0.058, 0.044, SHIN), cloth, 2);
  const shoe = mk(shoeGeo(), kit.mat('#2B2B2B', { rough: 0.6 }), 2);
  // Solado com cadarço, meias, punhos das mangas: dois por pessoa (contagem variável).
  const sole = mk(soleGeo(), kit.mat('#ffffff', { rough: 0.7 }), 2, false);
  const sock = mk(ringGeo(0.047, 0.06, 1, 1, -SHIN + 0.035), kit.mat('#ffffff', { rough: 0.9 }), 2, false);
  const sleeve = mk(ringGeo(0.064, 0.05, 1, 1, -UPPER + 0.045), kit.mat('#ffffff', { rough: 0.85, side: THREE.DoubleSide }), 2, false);
  const cuff = mk(ringGeo(0.041, 0.03, 1, 1, -FORE + 0.02), kit.mat('#ffffff', { rough: 0.85 }), 2, false);
  const hem = mk(ringGeo(0.155, 0.075, 1.12, 0.68, 0.01), kit.mat('#ffffff', { rough: 0.85, side: THREE.DoubleSide }), 1, false);
  const belt = mk(beltGeo(), kit.mat('#ffffff', { rough: 0.45, metal: 0.2 }), 1, false);
  const crew = mk(crewGeo(), cloth, 1, false);
  // Veículos e ferramentas das pessoas (bicicleta, skate, regador).
  const bike = mk(bikeGeo(), kit.mat('#ffffff', { rough: 0.35, metal: 0.5 }));
  const wheel = mk(wheelGeo(), kit.mat('#2A2D31', { rough: 0.6, metal: 0.3 }), 2, false);
  const crankM = mk(crankGeo(), kit.mat('#9CA3AF', { rough: 0.3, metal: 0.8 }), 1, false);
  const board = mk(boardGeo(), kit.mat('#ffffff', { rough: 0.6 }));
  const canM = mk(canGeo(), kit.mat('#ffffff', { rough: 0.4, metal: 0.4 }), 1, false);
  const book = mk(bookGeo(), kit.mat('#F5F0E6', { rough: 0.9, side: THREE.DoubleSide }), 1, false);
  const guitar = mk(guitarGeo(), kit.mat('#B5713A', { rough: 0.45 }), 1, false);
  const sketch = mk(sketchGeo(), kit.mat('#FAFAF7', { rough: 0.9 }), 1, false);
  const camera = mk(cameraGeo(), kit.mat('#1F2328', { rough: 0.35, metal: 0.4 }), 1, false);
  const parts = [pelvis, torso, head, sclera, iris, brows, upper, fore, hand, thigh, shin, shoe];
  const variants = [...hairs, ...Object.values(mouths)];
  const racket = mk(racketGeo(), kit.mat('#1F6FB2', { rough: 0.4, side: THREE.DoubleSide }), 1, false);
  // Roupas e acessórios (contagem variável: só quem usa).
  const jacket = mk(jacketGeo(), kit.mat('#ffffff', { rough: 0.75, side: THREE.DoubleSide }));
  const collar = mk(collarGeo(), cloth, 1, false);
  const stripe = mk(stripeGeo(), cloth, 1, false);
  const hood = mk(hoodGeo(), cloth);
  const skirt = mk(skirtGeo(), kit.mat('#ffffff', { rough: 0.85, side: THREE.DoubleSide }));
  const caps = [mk(hatGeo(1), cloth), mk(hatGeo(2), kit.mat('#ffffff', { rough: 0.95 }))];
  const specs = mk(glassesGeo(), kit.mat('#1F1F22', { rough: 0.3, metal: 0.4 }), 1, false);
  const backpack = mk(bagGeo(), kit.mat('#ffffff', { rough: 0.7 }));
  const cheeks = mk(cheekGeo(), kit.own(new THREE.MeshStandardMaterial({ color: '#F2A2A0', roughness: 0.8, transparent: true, opacity: 0.5, depthWrite: false })), 1, false);
  const extra = [jacket, collar, stripe, hood, skirt, ...caps, specs, backpack, cheeks, sole, sock, sleeve, cuff, hem, belt, crew, bike, wheel, crankM, board, canM];
  const mouthOpen = mk(mouthGeo('open'), kit.mat('#5A2A26', { rough: 0.6 }), 1, false);
  const mouthLaugh = mk(mouthGeo('laugh'), kit.mat('#7A2E2A', { rough: 0.6, side: THREE.DoubleSide }), 1, false);
  const squintM = new THREE.Matrix4().makeScale(1, 0.45, 1);
  const pushV = (im: THREE.InstancedMesh, m: THREE.Matrix4, color?: string | THREE.Color) => {
    const k = vCount.get(im) ?? 0;
    vCount.set(im, k + 1);
    im.setMatrixAt(k, m);
    if (color) im.setColorAt(k, typeof color === 'string' ? c.set(color) : color);
  };
  const shade = new THREE.Color();
  const dim = (hex: string, k: number) => shade.set(hex).multiplyScalar(k);
  const props = { book, guitar, sketch, camera, racket };

  const base = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const m1 = new THREE.Matrix4();
  const m2 = new THREE.Matrix4();
  const m3 = new THREE.Matrix4();
  const m2b = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  /** out = parent · T(x,y,z) · R(rx,ry,rz) */
  const step = (out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    tmp.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), sc.set(1, 1, 1));
    return out.multiplyMatrices(parent, tmp);
  };
  const counts = { book: 0, guitar: 0, sketch: 0, camera: 0, racket: 0 };
  const handR = new THREE.Matrix4();
  const vCount = new Map<THREE.InstancedMesh, number>();
  const blinkM = new THREE.Matrix4().makeScale(1, 0.12, 1);

  const set = (list: Figure[]) => {
    const n = Math.min(capacity, list.length);
    counts.book = counts.guitar = counts.sketch = counts.camera = counts.racket = 0;
    vCount.clear();
    const now = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const f = list[i]!;
      const j = joints(f);
      base.compose(v.set(f.x, f.y, f.z), q.setFromEuler(e.set(0, f.yaw, 0)), sc.set(f.scale, f.scale, f.scale));
      // Tronco e cabeça.
      step(m1, base, 0, j.hip, 0);
      pelvis.setMatrixAt(i, m1);
      step(m2, m1, 0, 0.03, 0, j.lean, j.twist);
      torso.setMatrixAt(i, m2);
      const outfit = f.outfit ?? 'tee';
      const acc = f.accent ?? '#F4F4F5';
      if (outfit === 'jacket') pushV(jacket, m2, acc);
      if (outfit === 'shirt') pushV(collar, m2, acc);
      if (outfit === 'sport') pushV(stripe, m2, acc);
      if (outfit === 'hoodie') pushV(hood, m2, f.shirt);
      if (outfit === 'dress') pushV(skirt, m1, f.shirt);
      if (f.bag) pushV(backpack, m2, acc === '#F4F4F5' ? '#475569' : acc);
      // Camiseta e moletom por fora da calça (barra), camisa por dentro com cinto; gola careca.
      if (outfit === 'tee' || outfit === 'hoodie' || outfit === 'sport' || outfit === 'jacket') pushV(hem, m2, dim(f.shirt, 0.94));
      if (outfit === 'shirt') pushV(belt, m1, '#3B2A20');
      if (outfit === 'tee' || outfit === 'sport' || outfit === 'jacket') pushV(crew, m2, dim(f.shirt, 0.82));
      step(m3, m2, 0, TORSO + 0.2, 0.01, j.headPitch, j.headYaw);
      head.setMatrixAt(i, m3);
      // Rosto: olhos (piscam de vez em quando), sobrancelhas (sobem ao sorrir), boca da expressão.
      const blink = (now + (f.seed ?? i) * 1.37) % 4.3 < 0.13;
      // Rindo, os olhos apertam; espantado, as sobrancelhas sobem bem.
      const eyeM = blink ? m1.multiplyMatrices(m3, blinkM) : f.expr === 'laugh' ? m1.multiplyMatrices(m3, squintM) : m3;
      sclera.setMatrixAt(i, eyeM);
      iris.setMatrixAt(i, eyeM);
      brows.setMatrixAt(i, f.expr === 'surprised' ? step(m2b, m3, 0, 0.014, 0) : f.expr === 'smile' || f.expr === 'laugh' ? step(m2b, m3, 0, 0.006, 0) : m3);
      if (f.expr === 'smile' || f.expr === 'laugh') pushV(cheeks, m3);
      if (f.glasses) pushV(specs, m3);
      if (f.hat) pushV(caps[(f.hat - 1) % 2]!, m3, f.hatColor ?? f.accent ?? '#334155');
      const hm = hairs[(f.hairStyle ?? 0) % 4]!;
      const hi = vCount.get(hm) ?? 0;
      vCount.set(hm, hi + 1);
      // Debaixo do gorro, só o cabelo comprido aparece (o curto e o coque ficam escondidos).
      hm.setMatrixAt(hi, f.hat === 2 && (f.hairStyle ?? 0) !== 1 ? step(m2b, m3, 0, -0.02, 0) : m3);
      hm.setColorAt(hi, c.set(f.hair ?? '#3B2A20'));
      const ex = f.expr ?? 'neutral';
      if (ex === 'surprised') pushV(mouthOpen, m3);
      else if (ex === 'laugh') pushV(Math.floor(now * 6 + i) % 3 ? mouthLaugh : mouths.smile, m3);
      else {
        const expr = ex === 'talk' ? (Math.floor(now * 7 + i) % 2 ? 'talk' : 'neutral') : ex;
        pushV(mouths[expr], m3);
      }
      // Braços: ombro → cotovelo → mão.
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        step(m1, m2, side * 0.19, TORSO - 0.06, 0, -j.sf[k]!, 0, side * j.abd[k]!);
        upper.setMatrixAt(i * 2 + k, m1);
        const sleeveCol = f.outfit === 'jacket' ? (f.accent ?? '#F4F4F5') : f.shirt;
        if (f.shortSleeves && f.outfit !== 'jacket') pushV(sleeve, m1, dim(sleeveCol, 0.95));
        step(m1, m1, 0, -UPPER, 0, -j.ef[k]!);
        fore.setMatrixAt(i * 2 + k, m1);
        if (!f.shortSleeves || f.outfit === 'jacket') pushV(cuff, m1, dim(sleeveCol, 0.88));
        step(m1, m1, 0, -FORE, 0);
        hand.setMatrixAt(i * 2 + k, m1);
        if (k === 1) handR.copy(m1);
      }
      // Pernas: quadril → joelho → tornozelo (sapato sempre reto no chão).
      step(m3, base, 0, j.hip, 0);
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        step(m1, m3, side * 0.09, -0.02, 0, -j.hf[k]!, 0, side * j.legOut);
        thigh.setMatrixAt(i * 2 + k, m1);
        step(m1, m1, 0, -THIGH, 0, j.kf[k]!);
        shin.setMatrixAt(i * 2 + k, m1);
        if (f.shorts || f.outfit === 'dress') pushV(sock, m1, f.outfit === 'dress' ? f.skin : '#F4F4F5');
        step(m1, m1, 0, -SHIN, 0, j.hf[k]! - j.kf[k]!, 0, -side * j.legOut);
        shoe.setMatrixAt(i * 2 + k, m1);
        pushV(sole, m1, f.sole ?? (f.shoes === '#7C4A2D' ? '#3B2A1E' : '#F4F4F2'));
      }
      // Bicicleta (quadro, rodas girando com a pedalada e pedivela), skate sob os pés, regador na mão.
      if (f.pose === 'bike') {
        pushV(bike, base, f.gear ?? '#1F6FB2');
        for (const z of [-0.5, 0.58]) pushV(wheel, step(m1, base, 0, 0.34, z, -f.phase * 1.6));
        pushV(crankM, step(m1, base, 0, 0.3, 0.17, -f.phase));
      } else if (f.pose === 'skate') pushV(board, base, f.gear ?? '#B45309');
      else if (f.pose === 'water') pushV(canM, step(m1, handR, 0, -0.06, 0.02), f.gear ?? '#16A34A');
      // Objeto da atividade.
      if (j.prop) {
        const im = props[j.prop];
        const idx = counts[j.prop]++;
        if (j.prop === 'book') step(m1, m2, 0, 0.16, 0.3, -0.75);
        else if (j.prop === 'guitar') step(m1, m2, 0.04, 0.1, 0.19, 0, 0.15, 1.2);
        else if (j.prop === 'sketch') step(m1, base, 0, SIT_HIP + 0.1, 0.4, -0.35);
        else if (j.prop === 'racket') step(m1, handR, 0, -0.08, 0.01);
        else step(m1, m2, 0, TORSO + 0.2, 0.17);
        im.setMatrixAt(idx, m1);
      }
      pelvis.setColorAt(i, c.set(f.pants));
      torso.setColorAt(i, c.set(f.shirt));
      // Jaqueta: mangas da cor da jaqueta.
      if (f.outfit === 'jacket') c.set(f.accent ?? '#F4F4F5');
      upper.setColorAt(i * 2, c);
      upper.setColorAt(i * 2 + 1, c);
      head.setColorAt(i, c.set(f.skin));
      for (let k = 0; k < 2; k++) {
        fore.setColorAt(i * 2 + k, c);
        hand.setColorAt(i * 2 + k, c);
      }
      brows.setColorAt(i, c.set(f.hair ?? '#3B2A20').multiplyScalar(0.8));
      iris.setColorAt(i, c.set(f.eyes ?? '#4A3426'));
      // Manga curta e bermuda mostram a pele; senão, a roupa.
      if (!f.shortSleeves || f.outfit === 'jacket') for (let k = 0; k < 2; k++) fore.setColorAt(i * 2 + k, c.set(f.outfit === 'jacket' ? (f.accent ?? '#F4F4F5') : f.shirt));
      if (f.outfit === 'dress') pelvis.setColorAt(i, c.set(f.shirt));
      for (let k = 0; k < 2; k++) {
        // Vestido: pernas à mostra (meia-calça clara ou pele); bermuda: canela à mostra.
        thigh.setColorAt(i * 2 + k, f.outfit === 'dress' ? c.set(f.skin) : c.set(f.pants));
        shin.setColorAt(i * 2 + k, f.shorts || f.outfit === 'dress' ? c.set(f.skin) : c.set(f.pants));
        shoe.setColorAt(i * 2 + k, c.set(f.shoes ?? '#2B2B2B'));
      }
    }
    for (const im of parts) {
      im.count = im === upper || im === fore || im === hand || im === thigh || im === shin || im === shoe ? n * 2 : n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    for (const im of [...variants, ...extra, mouthOpen, mouthLaugh]) {
      im.count = vCount.get(im) ?? 0;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    (Object.keys(props) as Array<keyof typeof props>).forEach((k) => {
      props[k].count = counts[k];
      props[k].instanceMatrix.needsUpdate = true;
    });
  };

  return { group, set, capacity };
}

/** Avatar universal do visitante: cores neutras, sem gênero nem idade definidos. */
export const AVATAR_LOOK = { shirt: '#F4F1EA', pants: '#2F3A4F', skin: '#C9A27E', hair: '#2F2A26', hairStyle: 0, eyes: '#4A3426', outfit: 'jacket', accent: '#3E6E9E', bag: true, shoes: '#3A4150', sole: '#F4F4F2' } as const;

/** Estilo próprio de cada morador, sempre o mesmo para a mesma pessoa (roupa, acessórios, sapatos). */
export function styleOf(id: number): Pick<Figure, 'outfit' | 'accent' | 'hat' | 'hatColor' | 'glasses' | 'bag' | 'shoes' | 'shortSleeves' | 'shorts'> {
  const h = (k: number) => {
    const v = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const outfits: Outfit[] = ['tee', 'shirt', 'jacket', 'hoodie', 'dress', 'sport', 'tee', 'shirt'];
  const outfit = outfits[Math.floor(h(1) * outfits.length)]!;
  const accents = ['#F4F4F5', '#1F2937', '#7C2D12', '#365314', '#1E3A8A', '#9D174D', '#CA8A04', '#0F766E', '#D6C7A1'];
  const shoes = ['#2B2B2B', '#F5F5F4', '#7C4A2D', '#1E3A8A', '#B91C1C', '#E5E7EB'];
  return {
    outfit,
    accent: accents[Math.floor(h(2) * accents.length)]!,
    hat: h(3) < 0.18 ? 1 : h(3) < 0.26 ? 2 : 0,
    hatColor: accents[Math.floor(h(4) * accents.length)]!,
    glasses: h(5) < 0.25,
    bag: h(6) < 0.22,
    shoes: shoes[Math.floor(h(7) * shoes.length)]!,
    shortSleeves: outfit === 'tee' || outfit === 'sport' || (outfit === 'dress' && h(8) < 0.6),
    shorts: outfit === 'sport' || (outfit === 'tee' && h(9) < 0.4),
  };
}
