/**
 * Pessoas do parque (V2.1): figura humana neutra de 1,70 m (cabeça, tronco, braços e pernas)
 * desenhada em instâncias, uma malha por parte do corpo: o avatar e todos os moradores visíveis
 * custam 10 desenhos por quadro, qualquer que seja a quantidade.
 * Poses: em pé, andando (pernas e braços balançam com o passo), sentado, lendo, tocando,
 * acenando e se exercitando.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kit } from './kit';

export type Pose = 'stand' | 'walk' | 'sit' | 'read' | 'play' | 'wave' | 'exercise';

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
}

export interface Crowd {
  group: THREE.Group;
  /** Desenha estas figuras (as demais instâncias somem). */
  set: (list: Figure[]) => void;
  capacity: number;
}

const HIP = 0.88;
const SHOULDER = 1.45;
const LEG_LEN = 0.86;
const ARM_LEN = 0.64;

export function createCrowd(kit: Kit, capacity: number, shadows = true): Crowd {
  const group = new THREE.Group();
  const mat = kit.mat('#ffffff', { rough: 0.8 });
  const skinMat = kit.mat('#ffffff', { rough: 0.6 });
  const leg = kit.own(new THREE.CapsuleGeometry(0.075, LEG_LEN - 0.15, 3, 8));
  leg.translate(0, -LEG_LEN / 2 + 0.04, 0);
  const arm = kit.own(new THREE.CapsuleGeometry(0.055, ARM_LEN - 0.11, 3, 8));
  arm.translate(0, -ARM_LEN / 2 + 0.04, 0);
  const torso = kit.own(new THREE.CapsuleGeometry(0.16, 0.36, 4, 10));
  torso.scale(1.12, 1, 0.72);
  const head = kit.own(new THREE.SphereGeometry(0.115, 14, 10));
  head.scale(0.92, 1.05, 1);
  // Cabelo: calota sobre a cabeça, um pouco mais longa atrás.
  const hairGeo = kit.own(new THREE.SphereGeometry(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
  hairGeo.scale(0.95, 1.05, 1.05);
  hairGeo.translate(0, 0.012, -0.01);
  // Olhos (dois pontos escuros na frente do rosto) e mãos.
  const eyeL = new THREE.SphereGeometry(0.014, 6, 4);
  eyeL.translate(-0.04, 0.02, 0.1);
  const eyeR = new THREE.SphereGeometry(0.014, 6, 4);
  eyeR.translate(0.04, 0.02, 0.1);
  const eyesGeo = kit.own(mergeGeometries([eyeL, eyeR])!);
  eyeL.dispose();
  eyeR.dispose();
  const hand = kit.own(new THREE.SphereGeometry(0.05, 8, 6));
  hand.scale(0.8, 1.2, 0.6);
  hand.translate(0, -ARM_LEN + 0.02, 0);

  const mk = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const im = new THREE.InstancedMesh(g, m, capacity);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0, new THREE.Color());
    im.count = 0;
    im.castShadow = shadows;
    im.frustumCulled = false;
    group.add(im);
    return im;
  };
  const legL = mk(leg, mat);
  const legR = mk(leg, mat);
  const armL = mk(arm, mat);
  const armR = mk(arm, mat);
  const body = mk(torso, mat);
  const heads = mk(head, skinMat);
  const hairs = mk(hairGeo, mat);
  const eyes = mk(eyesGeo, kit.mat('#1F2937', { rough: 0.4 }));
  eyes.castShadow = false;
  const handL = mk(hand, skinMat);
  const handR = mk(hand, skinMat);
  const parts = [legL, legR, armL, armR, body, heads, hairs, eyes, handL, handR];

  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  const c = new THREE.Color();

  const put = (im: THREE.InstancedMesh, i: number, px: number, py: number, pz: number, rx: number, rz = 0) => {
    local.makeTranslation(px, py, pz);
    rot.makeRotationFromEuler(e.set(rx, 0, rz));
    out.multiplyMatrices(base, local).multiply(rot);
    im.setMatrixAt(i, out);
  };

  const set = (list: Figure[]) => {
    const n = Math.min(capacity, list.length);
    for (let i = 0; i < n; i++) {
      const f = list[i]!;
      const s = f.scale;
      base.compose(v.set(f.x, f.y, f.z), q.setFromEuler(e.set(0, f.yaw, 0)), one.set(s, s, s));
      const sw = Math.sin(f.phase) * f.stride;
      let hip = HIP;
      let lL = -sw * 0.55;
      let lR = sw * 0.55;
      let aL = sw * 0.45;
      let aR = -sw * 0.45;
      let aLz = 0.06;
      let aRz = -0.06;
      let lean = 0;
      if (f.pose === 'sit' || f.pose === 'read' || f.pose === 'play') {
        hip = 0.5;
        lL = lR = -1.4;
        aL = aR = f.pose === 'sit' ? 0.1 : -0.75;
        if (f.pose === 'play') {
          aR = -0.5 + Math.sin(f.phase * 3) * 0.15;
          aL = -1.0;
        }
      } else if (f.pose === 'wave') {
        aR = Math.PI - 0.3;
        aRz = -0.35 + Math.sin(f.phase * 4) * 0.35;
      } else if (f.pose === 'exercise') {
        aL = aR = Math.PI * (0.5 + 0.5 * Math.abs(Math.sin(f.phase)));
        aLz = 0.25;
        aRz = -0.25;
        hip = HIP - Math.abs(Math.sin(f.phase)) * 0.12;
      } else if (f.pose === 'walk') {
        lean = 0.04 * f.stride;
        hip = HIP + Math.abs(Math.cos(f.phase)) * 0.03 * f.stride;
      }
      const shoulder = hip + (SHOULDER - HIP);
      put(legL, i, -0.09, hip, 0, lL);
      put(legR, i, 0.09, hip, 0, lR);
      put(armL, i, -0.22, shoulder, 0, aL, aLz);
      put(armR, i, 0.22, shoulder, 0, aR, aRz);
      put(body, i, 0, hip + 0.32, 0, -lean);
      put(heads, i, 0, hip + 0.71, -lean * 0.4, 0);
      put(hairs, i, 0, hip + 0.71, -lean * 0.4, 0);
      put(eyes, i, 0, hip + 0.71, -lean * 0.4, 0);
      put(handL, i, -0.22, shoulder, 0, aL, aLz);
      put(handR, i, 0.22, shoulder, 0, aR, aRz);
      legL.setColorAt(i, c.set(f.pants));
      legR.setColorAt(i, c);
      armL.setColorAt(i, c.set(f.shirt));
      armR.setColorAt(i, c);
      body.setColorAt(i, c);
      heads.setColorAt(i, c.set(f.skin));
      handL.setColorAt(i, c);
      handR.setColorAt(i, c);
      hairs.setColorAt(i, c.set(f.hair ?? '#3B2A20'));
      eyes.setColorAt(i, c.set('#1F2937'));
    }
    for (const im of parts) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  };

  return { group, set, capacity };
}

/** Avatar universal do visitante: cores neutras, sem gênero nem idade definidos. */
export const AVATAR_LOOK = { shirt: '#5B8DB8', pants: '#3F4756', skin: '#C9A27E', hair: '#2F2A26' } as const;
