/**
 * Pessoas do parque (V2.1, seção 13): figura humana neutra de 1,70 m com articulações (ombro,
 * cotovelo, quadril, joelho), rosto com nariz, olhos e orelhas, cabelo, mãos e sapatos, e os
 * objetos de cada atividade nas mãos (livro, violão, caderno de desenho, câmera).
 * Tudo em instâncias: uma malha por parte do corpo (os dois lados juntos), então o avatar e
 * todos os moradores visíveis custam ~16 desenhos por quadro, qualquer que seja a quantidade.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kit } from './kit';

export type Pose = 'stand' | 'walk' | 'sit' | 'read' | 'play' | 'wave' | 'exercise' | 'draw' | 'photo';

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
const SIT_HIP = 0.47;

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
  m.computeVertexNormals();
  return m;
}

function hairGeo(): THREE.BufferGeometry {
  const cap = new THREE.SphereGeometry(0.107, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
  cap.scale(0.93, 1.12, 1.04);
  cap.translate(0, 0.012, -0.008);
  const back = new THREE.SphereGeometry(0.1, 14, 8, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.35, Math.PI * 0.35);
  back.scale(0.95, 1.1, 1.05);
  back.translate(0, -0.005, -0.012);
  const parts = [cap.toNonIndexed(), back.toNonIndexed()];
  const m = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return m;
}

function eyesGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(0.012, 8, 6);
    e.translate(s * 0.034, 0.018, 0.088);
    parts.push(e.toNonIndexed());
    const brow = new THREE.BoxGeometry(0.032, 0.006, 0.008);
    brow.rotateZ(s * -0.12);
    brow.translate(s * 0.034, 0.04, 0.09);
    parts.push(brow.toNonIndexed());
  }
  const mouth = new THREE.BoxGeometry(0.03, 0.005, 0.006);
  mouth.translate(0, -0.05, 0.088);
  parts.push(mouth.toNonIndexed());
  return mergeGeometries(parts)!;
}

function handGeo(): THREE.BufferGeometry {
  const palm = new THREE.BoxGeometry(0.07, 0.08, 0.028);
  palm.translate(0, -0.04, 0);
  const fingers = new THREE.BoxGeometry(0.066, 0.05, 0.022);
  fingers.translate(0, -0.1, 0.004);
  const thumb = new THREE.BoxGeometry(0.018, 0.045, 0.02);
  thumb.rotateZ(0.5);
  thumb.translate(0.038, -0.045, 0.012);
  const parts = [palm, fingers, thumb].map((g) => g.toNonIndexed());
  const m = mergeGeometries(parts)!;
  m.computeVertexNormals();
  return m;
}

function shoeGeo(): THREE.BufferGeometry {
  const s = new THREE.CapsuleGeometry(0.048, 0.16, 4, 10);
  s.rotateX(Math.PI / 2);
  s.scale(1, 0.75, 1);
  s.translate(0, -0.03, 0.05);
  return s;
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
  prop: 'book' | 'guitar' | 'sketch' | 'camera' | null;
}

function joints(f: Figure): Joints {
  const s = f.stride;
  const p = f.phase;
  const j: Joints = { hip: HIP, lean: 0, hf: [0, 0], kf: [0.04, 0.04], legOut: 0, sf: [0, 0], ef: [0.15, 0.15], abd: [0.08, 0.08], headPitch: 0, headYaw: f.look ?? 0, prop: null };
  const breathe = Math.sin(p * 0.5) * 0.02;
  switch (f.pose) {
    case 'walk': {
      // Passo com joelho dobrando na volta da perna e braços opostos.
      const a = Math.sin(p);
      j.hf = [a * 0.45 * s, -a * 0.45 * s];
      j.kf = [(0.1 + Math.max(0, Math.sin(p - 1.3)) * 0.75) * s, (0.1 + Math.max(0, Math.sin(p + Math.PI - 1.3)) * 0.75) * s];
      j.sf = [-a * 0.38 * s, a * 0.38 * s];
      j.ef = [0.25 + 0.15 * s, 0.25 + 0.15 * s];
      j.hip = HIP - 0.015 + Math.abs(Math.cos(p)) * 0.03 * s;
      j.lean = 0.05 * s;
      break;
    }
    case 'sit':
    case 'read':
    case 'play':
    case 'draw': {
      j.hip = SIT_HIP;
      j.hf = [1.5, 1.5];
      j.kf = [1.45, 1.45];
      j.sf = [0.45, 0.45];
      j.ef = [0.7, 0.7];
      j.lean = -0.05 + breathe;
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
    case 'photo':
      j.sf = [1.25, 1.25];
      j.ef = [1.75, 1.75];
      j.abd = [0.35, 0.35];
      j.headPitch = -0.05;
      j.prop = 'camera';
      break;
    case 'wave':
      j.sf = [0.05, 0.2];
      j.abd = [0.08, 2.5];
      j.ef = [0.15, 0.35 + Math.sin(p * 5) * 0.35];
      j.headPitch = -0.05;
      break;
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
  const hair = mk(hairGeo(), cloth);
  const eyes = mk(eyesGeo(), kit.mat('#1F2937', { rough: 0.4 }), 1, false);
  const upper = mk(limb(0.055, 0.045, UPPER), cloth, 2);
  const fore = mk(limb(0.043, 0.034, FORE), skin, 2);
  const hand = mk(handGeo(), skin, 2);
  const thigh = mk(limb(0.078, 0.06, THIGH), cloth, 2);
  const shin = mk(limb(0.058, 0.044, SHIN), cloth, 2);
  const shoe = mk(shoeGeo(), kit.mat('#2B2B2B', { rough: 0.6 }), 2);
  const book = mk(bookGeo(), kit.mat('#F5F0E6', { rough: 0.9, side: THREE.DoubleSide }), 1, false);
  const guitar = mk(guitarGeo(), kit.mat('#B5713A', { rough: 0.45 }), 1, false);
  const sketch = mk(sketchGeo(), kit.mat('#FAFAF7', { rough: 0.9 }), 1, false);
  const camera = mk(cameraGeo(), kit.mat('#1F2328', { rough: 0.35, metal: 0.4 }), 1, false);
  const parts = [pelvis, torso, head, hair, eyes, upper, fore, hand, thigh, shin, shoe];
  const props = { book, guitar, sketch, camera };

  const base = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const m1 = new THREE.Matrix4();
  const m2 = new THREE.Matrix4();
  const m3 = new THREE.Matrix4();
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
  const counts = { book: 0, guitar: 0, sketch: 0, camera: 0 };

  const set = (list: Figure[]) => {
    const n = Math.min(capacity, list.length);
    counts.book = counts.guitar = counts.sketch = counts.camera = 0;
    for (let i = 0; i < n; i++) {
      const f = list[i]!;
      const j = joints(f);
      base.compose(v.set(f.x, f.y, f.z), q.setFromEuler(e.set(0, f.yaw, 0)), sc.set(f.scale, f.scale, f.scale));
      // Tronco e cabeça.
      step(m1, base, 0, j.hip, 0);
      pelvis.setMatrixAt(i, m1);
      step(m2, m1, 0, 0.03, 0, -j.lean);
      torso.setMatrixAt(i, m2);
      step(m3, m2, 0, TORSO + 0.2, 0.01, j.headPitch, j.headYaw);
      head.setMatrixAt(i, m3);
      hair.setMatrixAt(i, m3);
      eyes.setMatrixAt(i, m3);
      // Braços: ombro → cotovelo → mão.
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        step(m1, m2, side * 0.19, TORSO - 0.06, 0, -j.sf[k]!, 0, side * j.abd[k]!);
        upper.setMatrixAt(i * 2 + k, m1);
        step(m1, m1, 0, -UPPER, 0, -j.ef[k]!);
        fore.setMatrixAt(i * 2 + k, m1);
        step(m1, m1, 0, -FORE, 0);
        hand.setMatrixAt(i * 2 + k, m1);
      }
      // Pernas: quadril → joelho → tornozelo (sapato sempre reto no chão).
      step(m3, base, 0, j.hip, 0);
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        step(m1, m3, side * 0.09, -0.02, 0, -j.hf[k]!, 0, side * j.legOut);
        thigh.setMatrixAt(i * 2 + k, m1);
        step(m1, m1, 0, -THIGH, 0, j.kf[k]!);
        shin.setMatrixAt(i * 2 + k, m1);
        step(m1, m1, 0, -SHIN, 0, j.hf[k]! - j.kf[k]!, 0, -side * j.legOut);
        shoe.setMatrixAt(i * 2 + k, m1);
      }
      // Objeto da atividade.
      if (j.prop) {
        const im = props[j.prop];
        const idx = counts[j.prop]++;
        if (j.prop === 'book') step(m1, m2, 0, 0.16, 0.3, -0.75);
        else if (j.prop === 'guitar') step(m1, m2, 0.04, 0.1, 0.19, 0, 0.15, 1.2);
        else if (j.prop === 'sketch') step(m1, base, 0, SIT_HIP + 0.1, 0.4, -0.35);
        else step(m1, m2, 0, TORSO + 0.2, 0.17);
        im.setMatrixAt(idx, m1);
      }
      pelvis.setColorAt(i, c.set(f.pants));
      torso.setColorAt(i, c.set(f.shirt));
      upper.setColorAt(i * 2, c);
      upper.setColorAt(i * 2 + 1, c);
      head.setColorAt(i, c.set(f.skin));
      for (let k = 0; k < 2; k++) {
        fore.setColorAt(i * 2 + k, c);
        hand.setColorAt(i * 2 + k, c);
      }
      hair.setColorAt(i, c.set(f.hair ?? '#3B2A20'));
      eyes.setColorAt(i, c.set('#1F2937'));
      for (let k = 0; k < 2; k++) {
        thigh.setColorAt(i * 2 + k, c.set(f.pants));
        shin.setColorAt(i * 2 + k, c);
        shoe.setColorAt(i * 2 + k, c.set('#2B2B2B'));
      }
    }
    for (const im of parts) {
      im.count = im === upper || im === fore || im === hand || im === thigh || im === shin || im === shoe ? n * 2 : n;
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
export const AVATAR_LOOK = { shirt: '#5B8DB8', pants: '#3F4756', skin: '#C9A27E', hair: '#2F2A26' } as const;
