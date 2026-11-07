/**
 * Chão com uso de verdade: poças que aparecem nos caminhos e na praça depois da chuva (e secam
 * devagar), trilhas de grama gasta onde as pessoas cortam caminho, terra batida na frente dos
 * bancos e folhas secas no chão (muitas no outono, poucas no resto do ano).
 */
import * as THREE from 'three';
import { PATH_WIDTH, heightAt, isFreeGround, onPath, parkPaths, samplePath, seededRandom, type Point } from '@/domain/park';
import { Builder, type Kit } from './kit';
import type { Seat } from './camera';

export interface Ground {
  group: THREE.Group;
  /** 0 seco a 1 encharcado. */
  setWet: (w: number) => void;
  setSeason: (s: 'spring' | 'summer' | 'autumn' | 'winter') => void;
}

export function ground(kit: Kit, seats: Seat[], trees: Array<{ x: number; z: number; s: number }>): Ground {
  const group = new THREE.Group();
  const rnd = seededRandom(8080);
  const paths = parkPaths();

  // Poças: manchas espelhadas nos caminhos (nas laterais, onde o piso afunda) e na praça.
  const spots: Array<{ x: number; z: number; sx: number; sz: number; rot: number }> = [];
  for (const p of paths) {
    const half = PATH_WIDTH[p.kind] / 2;
    const pts = samplePath(p.points, 7);
    for (let i = 1; i < pts.length - 1; i++) {
      if (rnd() > 0.2) continue;
      const a = pts[i - 1]!;
      const b = pts[i + 1]!;
      const dir = Math.atan2(b.x - a.x, b.z - a.z);
      const side = (rnd() - 0.5) * 2 * Math.max(0, half - 0.7);
      spots.push({ x: pts[i]!.x + Math.cos(dir) * side, z: pts[i]!.z - Math.sin(dir) * side, sx: 0.5 + rnd() * 0.9, sz: 0.4 + rnd() * 0.6, rot: dir + rnd() });
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 9 + rnd() * 14;
    spots.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, sx: 0.7 + rnd() * 1.1, sz: 0.5 + rnd() * 0.7, rot: rnd() * 6 });
  }
  const puddleMat = kit.own(new THREE.MeshStandardMaterial({ color: '#46525E', roughness: 0.04, metalness: 0.75, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const blob = (() => {
    // Contorno irregular (não um círculo perfeito).
    const sh = new THREE.Shape();
    for (let k = 0; k <= 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const r = 1 + Math.sin(a * 3) * 0.12 + Math.sin(a * 5 + 1) * 0.08;
      if (k === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    return g;
  })();
  const puddles = new THREE.InstancedMesh(kit.own(blob), puddleMat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((p, i) => puddles.setMatrixAt(i, m4.compose(v.set(p.x, heightAt(p.x, p.z) + (Math.hypot(p.x, p.z) < 26 ? 0.085 : 0.075), p.z), q.setFromAxisAngle(up, p.rot), s.set(p.sx, 1, p.sz))));
  puddles.visible = false;
  puddles.receiveShadow = true;
  group.add(puddles);

  // Grama gasta: atalhos que as pessoas abrem entre dois caminhos e terra batida na frente dos bancos.
  const b = new Builder();
  const dirt = kit.mat('#A38E6A', { rough: 1 });
  const worn = kit.mat('#8FA05E', { rough: 1 });
  let made = 0;
  for (let tries = 0; tries < 400 && made < 14; tries++) {
    const p = paths[Math.floor(rnd() * paths.length)]!;
    const pts = samplePath(p.points, 3);
    const a = pts[Math.floor(rnd() * pts.length)]!;
    const ang = rnd() * Math.PI * 2;
    const len = 9 + rnd() * 14;
    const end: Point = { x: a.x + Math.sin(ang) * len, z: a.z + Math.cos(ang) * len };
    if (!onPath(end.x, end.z)) continue;
    // O meio do atalho tem de ser gramado livre (sem água, prédio, lote ou outro caminho).
    let ok = true;
    for (let k = 0.25; k <= 0.75; k += 0.125) if (!isFreeGround(a.x + (end.x - a.x) * k, a.z + (end.z - a.z) * k, 0)) ok = false;
    if (!ok) continue;
    made++;
    const n = Math.ceil(len / 0.9);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = a.x + (end.x - a.x) * t + Math.sin(t * 9 + made) * 0.15;
      const z = a.z + (end.z - a.z) * t + Math.cos(t * 7 + made) * 0.15;
      const w = 0.55 + Math.sin(t * Math.PI) * 0.25 + rnd() * 0.15;
      b.add(t > 0.12 && t < 0.88 ? dirt : worn, new THREE.CircleGeometry(w, 10), [x, heightAt(x, z) + 0.03, z], [-Math.PI / 2, 0, rnd() * 6], [1, 1.5, 1]);
    }
  }
  for (const st of seats) {
    if (Math.hypot(st.x, st.z) < 30) continue;
    const x = st.x + Math.sin(st.face) * 0.85;
    const z = st.z + Math.cos(st.face) * 0.85;
    if (onPath(x, z)) continue;
    b.add(worn, new THREE.CircleGeometry(1.1, 14), [x, heightAt(x, z) + 0.025, z], [-Math.PI / 2, 0, -st.face], [1.4, 0.8, 1]);
    b.add(dirt, new THREE.CircleGeometry(0.7, 12), [x, heightAt(x, z) + 0.03, z], [-Math.PI / 2, 0, -st.face], [1.5, 0.7, 1]);
  }
  group.add(b.build(false));

  // Folhas secas no chão, em volta das árvores (laranjas, marrons e amarelas).
  const LEAVES = 1600;
  const leafGeo = (() => {
    const g = new THREE.PlaneGeometry(0.13, 0.08);
    g.rotateX(-Math.PI / 2);
    return g;
  })();
  const litter = new THREE.InstancedMesh(kit.own(leafGeo), kit.mat('#ffffff', { rough: 0.95, side: THREE.DoubleSide }), LEAVES);
  const tones = ['#C2410C', '#B45309', '#A16207', '#92400E', '#D97706', '#7C2D12', '#CA8A04'].map((c) => new THREE.Color(c));
  const near = trees.filter((t) => Math.hypot(t.x, t.z) < 380);
  for (let i = 0; i < LEAVES && near.length; i++) {
    const t = near[Math.floor(rnd() * near.length)]!;
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 3.5 * t.s;
    const x = t.x + Math.cos(a) * r;
    const z = t.z + Math.sin(a) * r;
    litter.setMatrixAt(i, m4.compose(v.set(x, heightAt(x, z) + 0.035 + rnd() * 0.01, z), q.setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * 6.3, rnd() * 0.3)), s.set(1, 1, 1)));
    litter.setColorAt(i, tones[Math.floor(rnd() * tones.length)]!);
  }
  litter.count = Math.floor(LEAVES * 0.15);
  group.add(litter);

  return {
    group,
    setWet: (w) => {
      puddles.visible = w > 0.03;
      puddleMat.opacity = Math.min(0.85, w * 0.9);
    },
    setSeason: (sn) => {
      litter.count = Math.floor(LEAVES * (sn === 'autumn' ? 1 : sn === 'winter' ? 0.45 : sn === 'spring' ? 0.1 : 0.15));
    },
  };
}
