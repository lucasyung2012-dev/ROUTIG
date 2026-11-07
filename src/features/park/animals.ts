/**
 * Bichos do parque em instâncias: cachorros (vários tamanhos e pelagens, rabo abanando, trote e
 * sentado, guia até a mão do dono), o gato de rua (orelhas pontudas, rabo alto), pombos (cabeça
 * que bica, pescoço furta-cor, asas que batem no voo) e patos-reais no lago (marolinha em volta).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kit } from './kit';
import type { Bird, Duck, Quad } from './extras';

interface Dims {
  bodyR: number;
  bodyL: number;
  hipY: number;
  legL: number;
  legR: number;
  halfW: number;
  halfL: number;
  head: number;
  cat: boolean;
}
const DOG: Dims = { bodyR: 0.13, bodyL: 0.34, hipY: 0.4, legL: 0.36, legR: 0.034, halfW: 0.08, halfL: 0.19, head: 0.1, cat: false };
const CAT: Dims = { bodyR: 0.075, bodyL: 0.26, hipY: 0.23, legL: 0.21, legR: 0.02, halfW: 0.05, halfL: 0.14, head: 0.065, cat: true };

function nonIdx(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)))!;
  g.computeVertexNormals();
  return g;
}

/** Corpo + cabeça + orelhas + focinho (uma peça, cor da pelagem). */
function quadBody(d: Dims): THREE.BufferGeometry {
  const body = new THREE.CapsuleGeometry(d.bodyR, d.bodyL, 6, 14);
  body.rotateX(Math.PI / 2);
  body.scale(0.9, 1, 1);
  body.translate(0, d.hipY + 0.02, 0);
  const chest = new THREE.SphereGeometry(d.bodyR * 1.05, 12, 10);
  chest.translate(0, d.hipY + 0.04, d.halfL);
  const neck = new THREE.CylinderGeometry(d.bodyR * 0.55, d.bodyR * 0.7, d.head * 1.6, 10);
  neck.rotateX(0.6);
  neck.translate(0, d.hipY + d.bodyR + d.head * 0.4, d.halfL + d.bodyR * 0.6);
  const head = new THREE.SphereGeometry(d.head, 14, 12);
  head.scale(0.9, 0.9, 1.05);
  const hy = d.hipY + d.bodyR + d.head * 1.2;
  const hz = d.halfL + d.bodyR + d.head * 0.4;
  head.translate(0, hy, hz);
  const snout = new THREE.CapsuleGeometry(d.head * (d.cat ? 0.35 : 0.45), d.head * (d.cat ? 0.2 : 0.7), 4, 10);
  snout.rotateX(Math.PI / 2);
  snout.translate(0, hy - d.head * 0.3, hz + d.head * (d.cat ? 0.75 : 0.95));
  const parts = [body, chest, neck, head, snout];
  for (const s of [-1, 1]) {
    if (d.cat) {
      const ear = new THREE.ConeGeometry(d.head * 0.38, d.head * 0.75, 4);
      ear.translate(s * d.head * 0.55, hy + d.head * 0.95, hz - d.head * 0.1);
      parts.push(ear);
    } else {
      // Orelha caída de cachorro.
      const ear = new THREE.SphereGeometry(d.head * 0.45, 8, 6);
      ear.scale(0.35, 1, 0.7);
      ear.rotateZ(s * 0.35);
      ear.translate(s * d.head * 0.85, hy - d.head * 0.15, hz - d.head * 0.15);
      parts.push(ear);
    }
  }
  return nonIdx(parts);
}
/** Olhos, nariz (e coleira nos cachorros): peça escura. */
function quadDark(d: Dims): THREE.BufferGeometry {
  const hy = d.hipY + d.bodyR + d.head * 1.2;
  const hz = d.halfL + d.bodyR + d.head * 0.4;
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(d.head * 0.14, 8, 6);
    eye.translate(s * d.head * 0.45, hy + d.head * 0.25, hz + d.head * 0.78);
    parts.push(eye);
  }
  const nose = new THREE.SphereGeometry(d.head * (d.cat ? 0.12 : 0.2), 8, 6);
  nose.translate(0, hy - d.head * 0.2, hz + d.head * (d.cat ? 1.05 : 1.55));
  parts.push(nose);
  if (!d.cat) {
    const collar = new THREE.TorusGeometry(d.bodyR * 0.68, 0.014, 6, 16);
    collar.rotateX(Math.PI / 2 - 0.6);
    collar.translate(0, d.hipY + d.bodyR + d.head * 0.15, d.halfL + d.bodyR * 0.55);
    parts.push(collar);
  }
  return nonIdx(parts);
}
function quadLeg(d: Dims): THREE.BufferGeometry {
  const leg = new THREE.CapsuleGeometry(d.legR, d.legL - d.legR * 2, 4, 8);
  leg.translate(0, -d.legL / 2, 0);
  const paw = new THREE.SphereGeometry(d.legR * 1.35, 8, 6);
  paw.scale(1, 0.6, 1.3);
  paw.translate(0, -d.legL + d.legR * 0.5, d.legR * 0.5);
  return nonIdx([leg, paw]);
}
function quadTail(d: Dims): THREE.BufferGeometry {
  const len = d.cat ? 0.32 : 0.24;
  const t = new THREE.CapsuleGeometry(d.cat ? 0.016 : 0.025, len, 3, 8);
  t.translate(0, len / 2, 0);
  return nonIdx([t]);
}

export interface Animals {
  group: THREE.Group;
  set: (quads: Quad[], birds: Bird[], ducks: Duck[]) => void;
}

export function createAnimals(kit: Kit): Animals {
  const group = new THREE.Group();
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, n: number, shadow = true) => {
    const im = new THREE.InstancedMesh(kit.own(g), m, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const w = new THREE.Color('#ffffff');
    for (let k = 0; k < n; k++) im.setColorAt(k, w);
    im.count = 0;
    im.castShadow = shadow;
    im.frustumCulled = false;
    group.add(im);
    return im;
  };
  const fur = kit.mat('#ffffff', { rough: 0.95 });
  const dark = kit.mat('#1A1512', { rough: 0.4 });
  const kinds = { dog: DOG, cat: CAT } as const;
  const Q = 12;
  const sets = (['dog', 'cat'] as const).map((k) => {
    const d = kinds[k];
    return { d, body: mk(quadBody(d), fur, Q), dark: mk(quadDark(d), dark, Q, false), leg: mk(quadLeg(d), fur, Q * 4), tail: mk(quadTail(d), fur, Q) };
  });
  // Guias: três segmentos com barriga (a guia cede um pouco).
  const leashPos = new Float32Array(Q * 6 * 3);
  const leashGeo = kit.own(new THREE.BufferGeometry());
  leashGeo.setAttribute('position', new THREE.BufferAttribute(leashPos, 3).setUsage(THREE.DynamicDrawUsage));
  const leash = new THREE.LineSegments(leashGeo, kit.own(new THREE.LineBasicMaterial({ color: '#7F1D1D' })));
  leash.frustumCulled = false;
  group.add(leash);

  // Pombo: corpo, cabeça, bico, cauda; pescoço furta-cor; asas à parte.
  const pigeonBody = (() => {
    const body = new THREE.SphereGeometry(0.11, 12, 10);
    body.scale(0.8, 0.75, 1.35);
    body.translate(0, 0.14, 0);
    const head = new THREE.SphereGeometry(0.05, 10, 8);
    head.translate(0, 0.26, 0.12);
    const tail = new THREE.BoxGeometry(0.09, 0.015, 0.14);
    tail.rotateX(0.25);
    tail.translate(0, 0.13, -0.17);
    const leg = new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4);
    const legs = [-1, 1].map((s) => leg.clone().translate(s * 0.03, 0.04, 0.01));
    return nonIdx([body, head, tail, ...legs]);
  })();
  const pigeonNeck = (() => {
    const n = new THREE.TorusGeometry(0.045, 0.02, 6, 12);
    n.rotateX(Math.PI / 2 - 0.4);
    n.translate(0, 0.21, 0.09);
    const beak = new THREE.ConeGeometry(0.012, 0.04, 6);
    beak.rotateX(Math.PI / 2);
    beak.translate(0, 0.255, 0.18);
    return nonIdx([n, beak]);
  })();
  const wingGeo = (() => {
    const w = new THREE.BoxGeometry(0.2, 0.012, 0.15);
    w.translate(0.1, 0, 0);
    return nonIdx([w]);
  })();
  const P = 16;
  const pBody = mk(pigeonBody, kit.mat('#8C929C', { rough: 0.8 }), P);
  const pNeck = mk(pigeonNeck, kit.mat('#5F8572', { rough: 0.3, metal: 0.4 }), P, false);
  const pWing = mk(wingGeo, kit.mat('#7A808A', { rough: 0.85 }), P * 2, false);

  // Pato-real: corpo marrom-acinzentado, cabeça verde (macho) ou marrom (fêmea), bico amarelo, marolinha.
  const duckBody = (() => {
    const b = new THREE.SphereGeometry(0.16, 14, 10);
    b.scale(0.85, 0.6, 1.3);
    b.translate(0, 0.02, 0);
    const tail = new THREE.ConeGeometry(0.06, 0.12, 8);
    tail.rotateX(-Math.PI / 2 - 0.5);
    tail.translate(0, 0.07, -0.22);
    return nonIdx([b, tail]);
  })();
  const duckHead = (() => {
    const n = new THREE.CylinderGeometry(0.04, 0.05, 0.14, 10);
    n.translate(0, 0.12, 0.16);
    const h = new THREE.SphereGeometry(0.065, 12, 10);
    h.translate(0, 0.22, 0.19);
    return nonIdx([n, h]);
  })();
  const duckBeak = (() => {
    const b = new THREE.BoxGeometry(0.045, 0.02, 0.08);
    b.translate(0, 0.2, 0.28);
    return nonIdx([b]);
  })();
  const D = 8;
  const dBody = mk(duckBody, kit.mat('#ffffff', { rough: 0.7 }), D);
  const dHead = mk(duckHead, kit.mat('#ffffff', { rough: 0.4, metal: 0.2 }), D);
  const dBeak = mk(duckBeak, kit.mat('#E8B33C', { rough: 0.5 }), D, false);
  const ripple = mk(
    (() => {
      const r = new THREE.RingGeometry(0.28, 0.34, 24);
      r.rotateX(-Math.PI / 2);
      return r;
    })(),
    kit.own(new THREE.MeshBasicMaterial({ color: '#E6F2F8', transparent: true, opacity: 0.35, depthWrite: false })),
    D,
    false,
  );

  const m = new THREE.Matrix4();
  const m2 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const base = new THREE.Matrix4();
  const local = (out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => out.multiplyMatrices(parent, m2.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(1, 1, 1)));

  const set: Animals['set'] = (quads, birds, ducks) => {
    const counts = sets.map(() => 0);
    let li = 0;
    for (const a of quads) {
      const si = a.kind === 'dog' ? 0 : 1;
      const st = sets[si]!;
      const i = counts[si]!;
      if (i >= Q) continue;
      counts[si] = i + 1;
      const d = st.d;
      // Sentado: traseiro desce, tronco inclina para cima, patas de trás dobradas.
      const sitK = a.sit ? 1 : 0;
      base.compose(v.set(a.x, a.y, a.z), q.setFromEuler(e.set(0, a.yaw, 0)), s.set(a.size, a.size, a.size));
      local(m, base, 0, -sitK * d.hipY * 0.35, -sitK * d.halfL * 0.3, -sitK * 0.55);
      const bodyM = m.clone();
      st.body.setMatrixAt(i, bodyM);
      st.dark.setMatrixAt(i, bodyM);
      st.body.setColorAt(i, c.set(a.color));
      // Patas: trote (diagonais juntas); sentado, as de trás deitam para a frente.
      const amp = a.gait === 2 ? 0.6 : a.gait === 1 ? 0.35 : 0;
      ([[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]] as const).forEach(([sx, sz, off], k) => {
        const sw = Math.sin(a.phase + off) * amp;
        const front = sz > 0;
        const rx = a.sit ? (front ? 0.55 : -1.35) : -sw;
        local(m, bodyM, sx * d.halfW, d.hipY, sz * d.halfL, rx);
        st.leg.setMatrixAt(i * 4 + k, m);
        st.leg.setColorAt(i * 4 + k, c.set(a.color));
      });
      // Rabo: cachorro abana (mais rápido andando); gato deixa em pé com a ponta balançando.
      const wag = d.cat ? Math.sin(a.phase * 0.6) * 0.25 : Math.sin(performance.now() / (a.gait ? 90 : 160)) * 0.5;
      local(m, bodyM, 0, d.hipY + d.bodyR * 0.6, -d.halfL - d.bodyR * 0.8, d.cat ? -0.25 : -0.7, 0, wag);
      st.tail.setMatrixAt(i, m);
      st.tail.setColorAt(i, c.set(a.color).multiplyScalar(0.92));
      // Guia: da mão do dono à coleira, cedendo no meio.
      if (a.leash && li < Q) {
        const cx = a.x + Math.sin(a.yaw) * (d.halfL + d.bodyR * 0.6) * a.size;
        const cz = a.z + Math.cos(a.yaw) * (d.halfL + d.bodyR * 0.6) * a.size;
        const cy = a.y + (d.hipY + d.bodyR + d.head * 0.15) * a.size;
        const span = Math.hypot(cx - a.leash.x, cz - a.leash.z);
        const sag = Math.max(0, 2.3 - span) * 0.18;
        const pts = [0, 1 / 3, 2 / 3, 1].map((t) => [a.leash!.x + (cx - a.leash!.x) * t, a.leash!.y + (cy - a.leash!.y) * t - Math.sin(t * Math.PI) * sag, a.leash!.z + (cz - a.leash!.z) * t]);
        for (let k = 0; k < 3; k++) {
          leashPos.set(pts[k]!, (li * 6 + k * 2) * 3);
          leashPos.set(pts[k + 1]!, (li * 6 + k * 2 + 1) * 3);
        }
        li++;
      }
    }
    sets.forEach((st, si) => {
      const n = counts[si]!;
      st.body.count = st.dark.count = st.tail.count = n;
      st.leg.count = n * 4;
      for (const im of [st.body, st.dark, st.leg, st.tail]) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    });
    leashGeo.setDrawRange(0, li * 6);
    (leashGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // Pombos.
    let pi = 0;
    for (const b of birds) {
      if (pi >= P) break;
      base.compose(v.set(b.x, b.y, b.z), q.setFromEuler(e.set(b.peck * 0.7, b.yaw, 0)), s.set(1, 1, 1));
      pBody.setMatrixAt(pi, base);
      pNeck.setMatrixAt(pi, base);
      // Asas: dobradas no chão; no voo batem para cima e para baixo.
      const fl = b.flying ? Math.sin(b.flap) * 0.9 : 0;
      for (const [k, sd] of [[0, -1], [1, 1]] as const) {
        local(m, base, sd * 0.06, 0.18, 0.0, 0, sd > 0 ? 0 : Math.PI, b.flying ? fl : -0.15);
        if (!b.flying) local(m, base, sd * 0.07, 0.17, -0.02, 0, sd > 0 ? -Math.PI / 2 + 0.1 : Math.PI / 2 - 0.1, 0);
        pWing.setMatrixAt(pi * 2 + k, m);
      }
      pi++;
    }
    pBody.count = pNeck.count = pi;
    pWing.count = pi * 2;
    for (const im of [pBody, pNeck, pWing]) im.instanceMatrix.needsUpdate = true;

    // Patos.
    let di = 0;
    for (const dk of ducks) {
      if (di >= D) break;
      base.compose(v.set(dk.x, -0.32 + Math.sin(dk.bob) * 0.015, dk.z), q.setFromEuler(e.set(Math.sin(dk.bob * 0.7) * 0.04, dk.yaw, 0)), s.set(1, 1, 1));
      dBody.setMatrixAt(di, base);
      dHead.setMatrixAt(di, base);
      dBeak.setMatrixAt(di, base);
      const male = di % 2 === 0;
      dBody.setColorAt(di, c.set(male ? '#9A8A78' : '#8A6A48'));
      dHead.setColorAt(di, c.set(male ? '#1F6B3A' : '#7A5634'));
      local(m, base, 0, 0.0, 0, 0, 0, 0);
      m2.makeScale(1 + (Math.sin(dk.bob * 0.5) + 1) * 0.3, 1, 1 + (Math.sin(dk.bob * 0.5) + 1) * 0.3);
      ripple.setMatrixAt(di, m.multiply(m2));
      di++;
    }
    dBody.count = dHead.count = dBeak.count = ripple.count = di;
    for (const im of [dBody, dHead, dBeak, ripple]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  };

  return { group, set };
}
