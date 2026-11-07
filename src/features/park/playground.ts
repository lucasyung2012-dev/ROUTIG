/**
 * Parquinho infantil: piso emborrachado colorido, cerca de madeira com portãozinho, balanço de três
 * lugares (as cadeirinhas balançam), escorregador com escada, plataforma e telhadinho, gangorra
 * (a prancha sobe e desce), caixa de areia com balde, pá e castelo, cavalinho de mola, bancos para
 * os pais, placa e lixeira. Os brinquedos que mexem seguem as crianças (extras.play()).
 */
import * as THREE from 'three';
import { PLAY, PLAYGROUNDS, heightAt, type Point } from '@/domain/park';
import { Builder, signTexture, type Kit } from './kit';
import { frame, parkBin, signBoard } from './props';
import type { Seat } from './camera';

export interface Playground {
  group: THREE.Group;
  /** Parte fixa (cerca, estruturas): vira obstáculo. */
  solid: THREE.Group;
  seats: Seat[];
  tick: (s: { swings: number[]; seesaw: number }) => void;
}

const tubeBetween = (a: [number, number, number], b: [number, number, number], r: number) => {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
};

export function playground(kit: Kit, index = 0): Playground {
  const G = PLAYGROUNDS[index] ?? PLAYGROUNDS[0]!;
  const group = new THREE.Group();
  const y0 = heightAt(G.x, G.z);
  group.position.set(G.x, y0, G.z);
  group.rotation.y = G.rot;
  const floor = new Builder();
  const b = new Builder();
  const put = frame(b, 0, 0, 0, 0);
  const R = PLAY.radius;
  const blue = kit.mat('#2563EB', { rough: 0.45, metal: 0.3 });
  const red = kit.mat('#DC2626', { rough: 0.45, metal: 0.2 });
  const yellow = kit.mat('#F59E0B', { rough: 0.35 });
  const green = kit.mat('#16A34A', { rough: 0.45 });
  const steel = kit.mat('#B8BEC6', { metal: 0.85, rough: 0.25 });
  const wood = kit.mat('#A0714F', { rough: 0.75 });
  const darkWood = kit.mat('#7A5233', { rough: 0.8 });
  const black = kit.mat('#1F2328', { rough: 0.7 });

  // Piso emborrachado com manchas coloridas embaixo de cada brinquedo.
  floor.add(kit.mat('#C2654F', { rough: 0.95 }), new THREE.CircleGeometry(R - 0.2, 48), [0, 0.03, 0], [-Math.PI / 2, 0, 0]);
  floor.add(kit.mat('#3B82C4', { rough: 0.95 }), new THREE.CircleGeometry(3.4, 32), [PLAY.swings.x, 0.04, PLAY.swings.z], [-Math.PI / 2, 0, 0]);
  floor.add(kit.mat('#4D9A55', { rough: 0.95 }), new THREE.CircleGeometry(2.8, 32), [PLAY.slide.x, 0.04, PLAY.slide.z + 1], [-Math.PI / 2, 0, 0]);
  floor.add(kit.mat('#E3B341', { rough: 0.95 }), new THREE.CircleGeometry(2.2, 32), [PLAY.seesaw.x, 0.04, PLAY.seesaw.z], [-Math.PI / 2, 0, 0]);
  floor.add(kit.mat('#8E6FB5', { rough: 0.95 }), new THREE.CircleGeometry(1.2, 24), [PLAY.spring.x, 0.04, PLAY.spring.z], [-Math.PI / 2, 0, 0]);

  // Cerca de madeira com ripas e o portãozinho aberto na frente (+z).
  const posts = 40;
  const gap = 2.6 / R;
  const inGap = (a: number) => Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < gap / 2;
  for (let k = 0; k < posts; k++) {
    const a0 = (k / posts) * Math.PI * 2;
    const a1 = ((k + 1) / posts) * Math.PI * 2;
    const p0 = [Math.cos(a0) * R, Math.sin(a0) * R] as const;
    const p1 = [Math.cos(a1) * R, Math.sin(a1) * R] as const;
    if (!inGap(a0)) {
      put(darkWood, new THREE.BoxGeometry(0.1, 1.05, 0.1), p0[0], 0.52, p0[1]);
      put(darkWood, new THREE.ConeGeometry(0.075, 0.1, 4), p0[0], 1.1, p0[1], 0, Math.PI / 4);
    }
    if (inGap(a0) || inGap(a1)) continue;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const ry = -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const mx = (p0[0] + p1[0]) / 2;
    const mz = (p0[1] + p1[1]) / 2;
    for (const yy of [0.3, 0.9]) put(wood, new THREE.BoxGeometry(len, 0.07, 0.04), mx, yy, mz, 0, ry);
    for (let j = 1; j < 4; j++) {
      const t = j / 4;
      put(wood, new THREE.BoxGeometry(0.06, 0.82, 0.025), p0[0] + (p1[0] - p0[0]) * t, 0.55, p0[1] + (p1[1] - p0[1]) * t, 0, ry);
    }
  }
  // Portãozinho aberto para dentro.
  for (const s of [-1, 1]) {
    const hx = s * 1.25;
    const hz = Math.sqrt(R * R - hx * hx);
    for (let j = 0; j < 5; j++) put(wood, new THREE.BoxGeometry(0.06, 0.8, 0.025), hx - s * 0.05, 0.5, hz - 0.12 - j * 0.22, 0, Math.PI / 2);
    for (const yy of [0.25, 0.8]) put(wood, new THREE.BoxGeometry(0.04, 0.06, 1.0), hx - s * 0.05, yy, hz - 0.55);
  }

  // Balanço: dois cavaletes em A e travessa; as cadeirinhas penduradas balançam (abaixo).
  const sw = PLAY.swings;
  const halfX = ((sw.n - 1) / 2) * sw.gap + 0.75;
  for (const s of [-1, 1]) {
    const x = sw.x + s * halfX;
    for (const dz of [-1.15, 1.15]) b.add(blue, tubeBetween([x, sw.top + 0.05, sw.z], [x, 0, sw.z + dz], 0.055));
    b.add(blue, tubeBetween([x, 0.9, sw.z - 0.68], [x, 0.9, sw.z + 0.68], 0.035));
    put(steel, new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12), x, 0.02, sw.z - 1.15);
    put(steel, new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12), x, 0.02, sw.z + 1.15);
  }
  b.add(blue, tubeBetween([sw.x - halfX - 0.1, sw.top + 0.05, sw.z], [sw.x + halfX + 0.1, sw.top + 0.05, sw.z], 0.06));
  const swingPivots: THREE.Group[] = [];
  for (let k = 0; k < sw.n; k++) {
    const pb = new Builder();
    for (const s of [-1, 1]) {
      // Corrente em elos (anéis alternados).
      for (let j = 0; j < 14; j++) pb.add(steel, new THREE.TorusGeometry(0.025, 0.006, 4, 8), [s * 0.22, -0.07 - j * ((sw.chain - 0.12) / 14), 0], [0, j % 2 ? Math.PI / 2 : 0, Math.PI / 2]);
      pb.add(steel, new THREE.TorusGeometry(0.03, 0.008, 4, 8), [s * 0.22, 0, 0], [0, Math.PI / 2, 0]);
    }
    const seat = new THREE.BoxGeometry(0.5, 0.035, 0.2);
    pb.add(black, seat, [0, -sw.chain, 0]);
    pb.add(black, new THREE.BoxGeometry(0.05, 0.08, 0.2), [-0.24, -sw.chain + 0.04, 0]);
    pb.add(black, new THREE.BoxGeometry(0.05, 0.08, 0.2), [0.24, -sw.chain + 0.04, 0]);
    const g = pb.build();
    const pivot = new THREE.Group();
    pivot.position.set(sw.x + (k - (sw.n - 1) / 2) * sw.gap, sw.top, sw.z);
    pivot.add(g);
    group.add(pivot);
    swingPivots.push(pivot);
  }

  // Escorregador: escada, plataforma com grade, telhadinho e rampa curvada com bordas.
  const sl = PLAY.slide;
  for (const [x, z] of [[-0.5, -1.0], [0.5, -1.0], [-0.5, 0], [0.5, 0]] as const) put(red, new THREE.CylinderGeometry(0.05, 0.05, sl.h + 1.3, 10), sl.x + x, (sl.h + 1.3) / 2, sl.z - 0.5 + z + 0.5);
  put(yellow, new THREE.BoxGeometry(1.1, 0.08, 1.1), sl.x, sl.h, sl.z - 0.5);
  for (const s of [-1, 1]) put(green, new THREE.BoxGeometry(0.04, 0.7, 1.0), sl.x + s * 0.53, sl.h + 0.4, sl.z - 0.5);
  put(red, new THREE.ConeGeometry(0.95, 0.75, 4), sl.x, sl.h + 1.68, sl.z - 0.5, 0, Math.PI / 4);
  for (const s of [-1, 1]) b.add(steel, tubeBetween([sl.x + s * 0.32, 0, sl.z - 1.9], [sl.x + s * 0.32, sl.h + 0.6, sl.z - 1.05], 0.03));
  for (let j = 1; j <= 5; j++) {
    const t = j / 6;
    put(steel, new THREE.CylinderGeometry(0.022, 0.022, 0.64, 8), sl.x, t * sl.h, sl.z - 1.9 + t * 0.85, 0, 0, Math.PI / 2);
  }
  const steps = 10;
  for (let j = 0; j < steps; j++) {
    const t0 = j / steps;
    const t1 = (j + 1) / steps;
    const yAt = (t: number) => 0.3 + (sl.h - 0.3) * (1 - t) ** 1.6;
    const z0 = sl.z + t0 * sl.len;
    const z1 = sl.z + t1 * sl.len;
    const y0s = yAt(t0);
    const y1s = yAt(t1);
    const len = Math.hypot(z1 - z0, y1s - y0s);
    const pitch = Math.atan2(y0s - y1s, z1 - z0);
    put(yellow, new THREE.BoxGeometry(0.62, 0.04, len + 0.02), sl.x, (y0s + y1s) / 2, (z0 + z1) / 2, pitch);
    for (const s of [-1, 1]) put(yellow, new THREE.BoxGeometry(0.04, 0.2, len + 0.02), sl.x + s * 0.32, (y0s + y1s) / 2 + 0.1, (z0 + z1) / 2, pitch);
  }
  put(red, new THREE.CylinderGeometry(0.04, 0.04, 0.32, 8), sl.x - 0.25, 0.16, sl.z + sl.len - 0.1);
  put(red, new THREE.CylinderGeometry(0.04, 0.04, 0.32, 8), sl.x + 0.25, 0.16, sl.z + sl.len - 0.1);

  // Gangorra: base com eixo; a prancha (com pegadores e assentos) gira.
  const ss = PLAY.seesaw;
  for (const s of [-1, 1]) b.add(green, tubeBetween([ss.x, 0.45, ss.z], [ss.x + s * 0.35, 0, ss.z], 0.05));
  put(steel, new THREE.CylinderGeometry(0.04, 0.04, 0.4, 10), ss.x, 0.45, ss.z, Math.PI / 2);
  const plank = new Builder();
  plank.add(wood, new THREE.BoxGeometry(ss.len, 0.06, 0.28), [0, 0.05, 0]);
  for (const s of [-1, 1]) {
    plank.add(red, new THREE.BoxGeometry(0.4, 0.06, 0.3), [s * (ss.len / 2 - 0.3), 0.1, 0]);
    plank.add(steel, new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), [s * (ss.len / 2 - 0.62), 0.27, 0]);
    plank.add(steel, new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), [s * (ss.len / 2 - 0.62), 0.46, 0], [Math.PI / 2, 0, 0]);
  }
  const plankG = plank.build();
  const plankPivot = new THREE.Group();
  plankPivot.position.set(ss.x, 0.45, ss.z);
  plankPivot.add(plankG);
  group.add(plankPivot);

  // Caixa de areia: borda de madeira, areia com montinhos, balde, pá e castelinho.
  const sd = PLAY.sand;
  for (const s of [-1, 1]) {
    put(darkWood, new THREE.BoxGeometry(sd.w + 0.3, 0.3, 0.15), sd.x, 0.15, sd.z + s * (sd.d / 2));
    put(darkWood, new THREE.BoxGeometry(0.15, 0.3, sd.d), sd.x + s * (sd.w / 2), 0.15, sd.z);
  }
  const sand = kit.mat('#E6D29A', { rough: 1 });
  put(sand, new THREE.BoxGeometry(sd.w, 0.2, sd.d), sd.x, 0.1, sd.z);
  for (let k = 0; k < 6; k++) put(sand, new THREE.SphereGeometry(0.3 + (k % 3) * 0.1, 10, 6), sd.x - 1.4 + k * 0.55, 0.18, sd.z + Math.sin(k * 2.1) * 0.9, 0, 0, 0, [1, 0.25, 1]);
  put(red, new THREE.CylinderGeometry(0.11, 0.08, 0.16, 14, 1, true), sd.x + 1.2, 0.3, sd.z - 0.6);
  put(red, new THREE.TorusGeometry(0.1, 0.008, 4, 12, Math.PI), sd.x + 1.2, 0.38, sd.z - 0.6);
  put(blue, new THREE.BoxGeometry(0.1, 0.02, 0.14), sd.x + 0.8, 0.22, sd.z - 0.3, 0.3, 0.6);
  put(blue, new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), sd.x + 0.85, 0.3, sd.z - 0.42, 1.2, 0.6);
  for (const [dx, dz, h] of [[0, 0, 0.32], [0.22, 0.15, 0.24], [-0.22, 0.15, 0.24], [0, -0.22, 0.26]] as const) {
    put(sand, new THREE.CylinderGeometry(0.12, 0.13, h, 10), sd.x - 0.9 + dx, 0.2 + h / 2, sd.z + 0.6 + dz);
    put(sand, new THREE.ConeGeometry(0.13, 0.14, 10), sd.x - 0.9 + dx, 0.27 + h, sd.z + 0.6 + dz);
  }

  // Cavalinho de mola.
  const sp = PLAY.spring;
  put(steel, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), sp.x, 0.05, sp.z);
  for (let j = 0; j < 7; j++) put(steel, new THREE.TorusGeometry(0.1, 0.018, 6, 16), sp.x, 0.1 + j * 0.06, sp.z, Math.PI / 2);
  const horse = kit.mat('#F97316', { rough: 0.4 });
  put(horse, new THREE.CapsuleGeometry(0.16, 0.42, 6, 12), sp.x, 0.62, sp.z, Math.PI / 2);
  put(horse, new THREE.CapsuleGeometry(0.08, 0.22, 4, 10), sp.x, 0.86, sp.z + 0.3, -0.5);
  put(horse, new THREE.CapsuleGeometry(0.08, 0.14, 4, 10), sp.x, 0.98, sp.z + 0.44, Math.PI / 2 - 0.3);
  for (const s of [-1, 1]) {
    put(horse, new THREE.ConeGeometry(0.03, 0.08, 6), sp.x + s * 0.05, 1.08, sp.z + 0.38);
    put(black, new THREE.SphereGeometry(0.015, 6, 4), sp.x + s * 0.06, 1.0, sp.z + 0.5);
    put(steel, new THREE.CylinderGeometry(0.015, 0.015, 0.14, 6), sp.x + s * 0.09, 0.98, sp.z + 0.28, 0, 0, Math.PI / 2);
  }
  put(kit.mat('#7C2D12', { rough: 0.8 }), new THREE.BoxGeometry(0.04, 0.2, 0.2), sp.x, 0.95, sp.z + 0.22);
  put(kit.mat('#1D4ED8', { rough: 0.5 }), new THREE.BoxGeometry(0.34, 0.04, 0.3), sp.x, 0.79, sp.z - 0.02);

  // Bancos dos pais (de frente para os brinquedos), lixeira e placa na entrada.
  const seats: Seat[] = [];
  const local = (lx: number, lz: number): Point => {
    const c = Math.cos(G.rot);
    const s = Math.sin(G.rot);
    return { x: G.x + lx * c + lz * s, z: G.z - lx * s + lz * c };
  };
  for (const bn of PLAY.benches) {
    const f = frame(b, bn.x, 0, bn.z, bn.face);
    f(wood, new THREE.BoxGeometry(1.8, 0.07, 0.45), 0, 0.45, 0);
    const back = new THREE.BoxGeometry(1.8, 0.4, 0.06);
    back.rotateX(-0.15);
    f(wood, back, 0, 0.75, -0.25);
    for (const s of [-1, 1]) f(steel, new THREE.BoxGeometry(0.06, 0.45, 0.45), s * 0.8, 0.22, 0);
    const w = local(bn.x, bn.z);
    seats.push({ x: w.x, y: y0 + 0.45, z: w.z, face: G.rot + bn.face });
  }
  parkBin(b, kit, 2.2, 0, R - 1.0, Math.PI);
  const tex = signTexture(kit, ['Parquinho', 'de 2 a 12 anos'], { bg: '#FEF3C7', fg: '#7C2D12', accent: '#F59E0B', w: 512, h: 256 });
  put(darkWood, new THREE.BoxGeometry(0.08, 1.9, 0.08), -2.0, 0.95, R + 0.3);
  signBoard(b, kit, tex, -2.0, 1.7, R + 0.36, 0, 1.0, 0.5);

  const solid = b.build();
  group.add(floor.build(false), solid);
  return {
    group,
    solid,
    seats,
    tick: (st) => {
      st.swings.forEach((a, k) => {
        const p = swingPivots[k];
        if (p) p.rotation.x = -a;
      });
      plankPivot.rotation.z = st.seesaw;
    },
  };
}
