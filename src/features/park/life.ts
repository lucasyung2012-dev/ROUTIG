/**
 * Elementos vivos do parque: fonte ROUTIG (com o logo em 3D), pássaros, drone e chuva.
 * Tudo animado em shader ou por matrizes de instância: barato por quadro.
 */
import * as THREE from 'three';
import { seededRandom } from '@/domain/park';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Builder, water, type Kit } from './kit';
import { createLogo3D } from './logo3d';

const PALETTE = { cyan: '#22D3EE', silver: '#CBD5E1' };

function lathe(points: Array<[number, number]>, seg = 48): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

export function fountain(kit: Kit): { group: THREE.Group; tick: (t: number) => void; waters: THREE.Mesh[]; logo: THREE.Mesh } {
  const group = new THREE.Group();
  const stone = kit.mat('#F1EEE8', { rough: 0.55 });
  const trim = kit.mat(PALETTE.silver, { metal: 0.85, rough: 0.25 });
  const b = new Builder();
  b.add(stone, lathe([[0, 0], [3.9, 0], [4.05, 0.15], [4.05, 0.75], [3.8, 0.85], [3.55, 0.8], [3.5, 0.3], [0, 0.3]]));
  b.add(trim, new THREE.TorusGeometry(3.95, 0.05, 6, 96), [0, 0.86, 0], [-Math.PI / 2, 0, 0]);
  b.add(stone, lathe([[0.55, 0.3], [0.45, 1.2], [0.5, 1.9], [0, 1.9]], 32));
  b.add(stone, lathe([[0, 1.9], [1.9, 1.95], [2.05, 2.3], [1.85, 2.38], [1.75, 2.1], [0, 2.1]]));
  b.add(trim, new THREE.TorusGeometry(1.98, 0.04, 6, 64), [0, 2.36, 0], [-Math.PI / 2, 0, 0]);
  b.add(stone, lathe([[0.32, 2.1], [0.25, 2.8], [0.42, 3.0], [0, 3.0]], 24));
  group.add(b.build());

  const w1 = water(kit, 3.55, '#2B8FD0');
  w1.mesh.position.y = 0.62;
  const w2 = water(kit, 1.78, '#38A6E0');
  w2.mesh.position.y = 2.2;
  group.add(w1.mesh, w2.mesh);

  // Escultura: o logo do ROUTIG em pé, girando devagar sobre um anel luminoso.
  const logo = createLogo3D(2.9);
  kit.own({ dispose: logo.dispose });
  const holder = new THREE.Group();
  holder.position.y = 4.55;
  holder.add(logo.mesh);
  group.add(holder);
  const halo = new THREE.Mesh(kit.own(new THREE.TorusGeometry(0.62, 0.05, 8, 48)), kit.mat(PALETTE.cyan, { glow: true }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 3.05;
  group.add(halo);

  // Jatos: partículas num shader (um desenho), arcos da borda para o centro e jato central.
  const N = 420;
  const seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const ring = i < 300;
    seed[i * 3] = ring ? ((i % 12) / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.06 : Math.random() * Math.PI * 2;
    seed[i * 3 + 1] = Math.random();
    seed[i * 3 + 2] = ring ? 0 : 1;
  }
  const pg = kit.own(new THREE.BufferGeometry());
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  pg.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 6);
  const pm = kit.own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { t: { value: 0 }, px: { value: 1 }, night: { value: 0 } },
      vertexShader: `attribute vec3 seed; uniform float t; uniform float px; varying float vA;
        void main(){
          float ph = fract(t * (seed.z > 0.5 ? 0.9 : 0.55) + seed.y);
          vec3 p;
          if (seed.z < 0.5) {
            float r = 3.35 - ph * 1.55;
            p = vec3(sin(seed.x) * r, 0.75 + 4.2 * ph * (1.0 - ph) * 1.25, cos(seed.x) * r);
          } else {
            float r = 0.08 + ph * 0.5;
            p = vec3(sin(seed.x) * r, 3.0 + 3.6 * ph * (1.0 - ph) * 2.0, cos(seed.x) * r);
          }
          vA = 1.0 - ph * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = px * 7.0 / -mv.z * 10.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float night; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
          vec3 col = mix(vec3(0.85, 0.95, 1.0), vec3(0.45, 0.85, 1.0), night);
          gl_FragColor = vec4(col, (0.25 - d) * 3.2 * vA); }`,
    }),
  );
  const jets = new THREE.Points(pg, pm);
  group.add(jets);

  return {
    group,
    waters: [w1.mesh, w2.mesh],
    logo: logo.mesh,
    tick: (t) => {
      w1.tick(t);
      w2.tick(t * 1.3);
      holder.rotation.y = t * 0.25;
      holder.position.y = 4.55 + Math.sin(t * 0.8) * 0.08;
      pm.uniforms.t!.value = t;
      pm.uniforms.px!.value = Math.min(2, window.devicePixelRatio || 1);
    },
  };
}

export function birds(kit: Kit, count: number): { mesh: THREE.InstancedMesh; tick: (t: number) => void } {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.4, -0.9, 0.1, -0.1, 0, 0, -0.2, 0, 0, 0.4, 0, 0, -0.2, 0.9, 0.1, -0.1], 3));
  g.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(kit.own(g), kit.mat('#2D3748', { side: THREE.DoubleSide }), count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  return {
    mesh,
    tick: (t) => {
      for (let i = 0; i < count; i++) {
        const a = t * 0.18 + (i / count) * 0.9;
        const r = 34 + (i % 3) * 2.5;
        p.set(Math.sin(a) * r + (i % 2) * 1.5, 26 + Math.sin(t + i) * 0.8 + (i % 4), Math.cos(a) * r - 10);
        e.set(0, a + Math.PI / 2, 0);
        q.setFromEuler(e);
        s.set(1, 1 + Math.sin(t * 9 + i * 1.7) * 0.9, 1);
        m4.compose(p, q, s);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function drone(kit: Kit, center: { x: number; z: number }): { group: THREE.Group; tick: (t: number) => void } {
  const b = new Builder();
  const body = kit.mat('#E2E8F0', { metal: 0.6, rough: 0.3 });
  b.add(body, new THREE.BoxGeometry(0.7, 0.18, 0.7));
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    b.add(body, new THREE.BoxGeometry(0.06, 0.06, 0.9), [x * 0.3, 0, z * 0.3], [0, Math.atan2(x, z), 0]);
    b.add(kit.mat('#1F2A3A'), new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12), [x * 0.6, 0.1, z * 0.6]);
  }
  b.add(kit.mat(PALETTE.cyan, { glow: true }), new THREE.SphereGeometry(0.08, 8, 6), [0, -0.12, 0.3]);
  const group = b.build(false);
  return {
    group,
    tick: (t) => {
      const a = t * 0.35;
      group.position.set(center.x + Math.sin(a) * 24, 21 + Math.sin(t * 1.3) * 0.8, center.z + Math.cos(a) * 24);
      group.rotation.y = a + Math.PI / 2;
    },
  };
}

export function rain(kit: Kit): { lines: THREE.LineSegments; tick: (dt: number, center: THREE.Vector3, wind?: number) => void; setAmount: (f: number) => void } {
  const N = 1400;
  const pos = new Float32Array(N * 6);
  const rnd = seededRandom(5);
  for (let i = 0; i < N; i++) {
    const x = (rnd() - 0.5) * 80;
    const y = rnd() * 40;
    const z = (rnd() - 0.5) * 80;
    pos.set([x, y, z, x + 0.05, y + 0.7, z], i * 6);
  }
  const g = kit.own(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(g, kit.own(new THREE.LineBasicMaterial({ color: '#C9DDF2', transparent: true, opacity: 0.5 })));
  lines.frustumCulled = false;
  lines.visible = false;
  return {
    lines,
    setAmount: (f) => g.setDrawRange(0, Math.max(2, Math.round(N * 2 * Math.min(1, f)))),
    tick: (dt, center, wind = 0) => {
      lines.position.set(center.x, 0, center.z);
      // Vento inclina a chuva.
      lines.rotation.z = -wind * 0.45;
      const a = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        let y = a.getY(i * 2) - dt * 30;
        if (y < 0) y += 40;
        a.setY(i * 2, y);
        a.setY(i * 2 + 1, y + 0.7);
      }
      a.needsUpdate = true;
    },
  };
}

/* ---------- Montagem ---------- */


/** Borboletas nos jardins (de dia, sem chuva nem vento forte): voo sinuoso em volta das flores. */
export function butterflies(kit: Kit, spots: Array<{ x: number; y: number; z: number }>, count = 36): { mesh: THREE.InstancedMesh; tick: (t: number, active: boolean) => void } {
  const wing = new THREE.PlaneGeometry(0.16, 0.12);
  wing.translate(0.08, 0, 0);
  const left = wing.clone();
  left.rotateY(Math.PI);
  const geo = kit.own(mergeGeometries([wing.toNonIndexed(), left.toNonIndexed()])!);
  wing.dispose();
  left.dispose();
  const mesh = new THREE.InstancedMesh(geo, kit.own(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false })), count);
  const colors = ['#F59E0B', '#FDE68A', '#F472B6', '#60A5FA', '#FFFFFF'];
  const c = new THREE.Color();
  const seeds = Array.from({ length: count }, (_, i) => ({ spot: spots[i % Math.max(1, spots.length)]!, ph: i * 1.7, r: 1.5 + (i % 4) }));
  seeds.forEach((_, i) => mesh.setColorAt(i, c.set(colors[i % colors.length]!)));
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  return {
    mesh,
    tick: (t, active) => {
      mesh.visible = active && spots.length > 0;
      if (!mesh.visible) return;
      seeds.forEach((b, i) => {
        const a = t * 0.6 + b.ph;
        v.set(b.spot.x + Math.cos(a) * b.r + Math.sin(a * 2.3) * 0.6, b.spot.y + 0.6 + Math.abs(Math.sin(a * 1.7)) * 0.9, b.spot.z + Math.sin(a) * b.r);
        const flap = 0.25 + Math.abs(Math.sin(t * 18 + b.ph)) * 0.75;
        q.setFromEuler(e.set(0, -a, 0));
        s.set(flap, 1, 1);
        m4.compose(v, q, s);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Folhas caindo em volta de quem olha (outono e vento): giram e derivam com o vento. */
export function leaves(kit: Kit, count = 160): { mesh: THREE.InstancedMesh; tick: (dt: number, t: number, center: THREE.Vector3, amount: number, wind: number) => void } {
  const geo = kit.own(new THREE.PlaneGeometry(0.14, 0.09));
  const mesh = new THREE.InstancedMesh(geo, kit.own(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })), count);
  const rnd = seededRandom(31);
  const p = Array.from({ length: count }, () => ({ x: (rnd() - 0.5) * 50, y: rnd() * 14, z: (rnd() - 0.5) * 50, ph: rnd() * 6 }));
  const c = new THREE.Color();
  const tones = ['#C98A3A', '#D9A441', '#B5562B', '#8C9A3C', '#E0B04A'];
  p.forEach((_, i) => mesh.setColorAt(i, c.set(tones[i % tones.length]!)));
  mesh.frustumCulled = false;
  mesh.visible = false;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  return {
    mesh,
    tick: (dt, t, center, amount, wind) => {
      mesh.visible = amount > 0.05;
      if (!mesh.visible) return;
      mesh.count = Math.round(count * Math.min(1, amount));
      for (let i = 0; i < mesh.count; i++) {
        const l = p[i]!;
        l.y -= dt * (0.6 + Math.sin(t + l.ph) * 0.2);
        l.x += dt * (wind * 3 + Math.sin(t * 0.7 + l.ph) * 0.4);
        if (l.y < 0) {
          l.y = 12 + rnd() * 3;
          l.x = (rnd() - 0.5) * 50;
          l.z = (rnd() - 0.5) * 50;
        }
        if (l.x > 25) l.x -= 50;
        v.set(center.x + l.x, center.y + l.y, center.z + l.z);
        q.setFromEuler(e.set(t * 2 + l.ph, t * 1.3 + l.ph, 0));
        m4.compose(v, q, one);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
