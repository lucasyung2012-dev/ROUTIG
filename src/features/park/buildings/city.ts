/**
 * Ruas do bairro em volta do parque: avenida externa (atrás dos prédios) e dez ruas transversais
 * ligando a rua do parque à avenida, com calçadas, faixas, semáforos que trocam de cor e carros que
 * param no vermelho, ônibus da linha do parque parando nos pontos (abrigo com banco e propaganda
 * acesa), placas com nome de rua, bancas de jornal, hidrantes e lixeiras. Carros com faróis e
 * lanternas que acendem à noite.
 */
import * as THREE from 'three';
import { navGraph } from '@/domain/parkPeople';
import { OUTER_ROAD, ROAD_RADIUS, crossStreets, heightAt, seededRandom } from '@/domain/park';
import { Builder, signTexture, type Kit } from '../kit';
import { frame, hydrant, parkBin, roundBox, signBoard } from '../props';

const STREET_NAMES = ['Rua das Palmeiras', 'Rua dos Ipês', 'Rua das Acácias', 'Rua dos Jacarandás', 'Rua das Magnólias', 'Rua dos Girassóis', 'Rua das Hortênsias', 'Rua dos Cedros', 'Rua das Orquídeas', 'Rua dos Flamboyants'];
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const polar = (a: number, r: number) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r });

/** Carro: carroceria com capô, para-brisa e porta-malas (perfil extrudado), vidros, rodas com calota e para-choques. */
export function carParts(): { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; dark: THREE.BufferGeometry; head: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  const side = (pts: Array<[number, number]>, width: number) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 4 });
    g.rotateY(-Math.PI / 2);
    g.translate(width / 2, 0, 0);
    return g;
  };
  const body = side([[-2.05, 0.3], [-2.05, 0.82], [-1.75, 0.94], [-1.15, 0.97], [-0.72, 1.4], [0.5, 1.42], [1.02, 1.0], [1.95, 0.86], [2.08, 0.66], [2.08, 0.3]], 1.7);
  const glass = side([[-1.1, 0.99], [-0.7, 1.36], [0.48, 1.38], [0.97, 1.02]], 1.74);
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-0.86, 1.3], [0.86, 1.3], [-0.86, -1.3], [0.86, -1.3]] as const) {
    const t = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16);
    t.rotateZ(Math.PI / 2);
    t.translate(x, 0.33, z);
    parts.push(t.toNonIndexed());
  }
  for (const z of [2.12, -2.1]) {
    const bmp = new THREE.BoxGeometry(1.76, 0.18, 0.1);
    bmp.translate(0, 0.42, z);
    parts.push(bmp.toNonIndexed());
  }
  for (const s of [-1, 1]) {
    const mir = new THREE.BoxGeometry(0.16, 0.1, 0.08);
    mir.translate(s * 0.95, 1.02, 0.95);
    parts.push(mir.toNonIndexed());
  }
  const dark = mergeAll(parts);
  const lights = (z: number, y: number) => {
    const ps = [-1, 1].map((s) => {
      const l = new THREE.BoxGeometry(0.34, 0.12, 0.05);
      l.translate(s * 0.6, y, z);
      return l.toNonIndexed();
    });
    return mergeAll(ps);
  };
  return { body, glass, dark, head: lights(2.1, 0.72), tail: lights(-2.09, 0.8) };
}
function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const g of list) pos.push(...(g.attributes.position!.array as Float32Array));
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

/** Frota em instâncias: carroceria colorida, vidros, rodas e para-choques, faróis e lanternas (brilham à noite). */
export function fleet(kit: Kit, n: number) {
  const p = carParts();
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, shadow = false) => {
    const im = new THREE.InstancedMesh(kit.own(g), m, n);
    im.castShadow = shadow;
    im.count = 0;
    im.frustumCulled = false;
    return im;
  };
  const body = mk(p.body, kit.mat('#ffffff', { rough: 0.3, metal: 0.45 }), true);
  const glass = mk(p.glass, kit.mat('#1C2733', { rough: 0.08, metal: 0.7 }));
  const dark = mk(p.dark, kit.mat('#1E2126', { rough: 0.6, metal: 0.2 }));
  const head = mk(p.head, kit.mat('#FFF4D6', { glow: true }));
  const tail = mk(p.tail, kit.mat('#E11D48', { glow: true }));
  const all = [body, glass, dark, head, tail];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  return {
    meshes: all,
    /** Carro i em (x, z), virado para `yaw` (0 = +z). */
    place: (i: number, x: number, z: number, yaw: number) => {
      m4.compose(v.set(x, heightAt(x, z) + 0.06, z), q.setFromAxisAngle(up, yaw), one);
      for (const im of all) im.setMatrixAt(i, m4);
    },
    color: (i: number, c: string) => body.setColorAt(i, new THREE.Color(c)),
    count: (k: number) => {
      for (const im of all) {
        im.count = k;
        im.instanceMatrix.needsUpdate = true;
      }
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
    },
  };
}

export interface City {
  group: THREE.Group;
  tick: (t: number) => void;
  /** Sons da rua deste passo (ônibus freando no ponto). */
  events: () => Array<{ x: number; z: number; kind: 'brake' | 'horn' }>;
}

export function city(kit: Kit): City {
  const g = new THREE.Group();
  const b = new Builder();
  const rnd = seededRandom(5150);
  const asphalt = kit.mat('#454A52', { rough: 0.92 });
  const walk = kit.mat('#CBC4B6', { rough: 0.9 });
  const curb = kit.mat('#9E978A', { rough: 0.9 });
  const stripe = kit.mat('#F2E6B8', { rough: 0.7 });
  const white = kit.mat('#F4F4F2', { rough: 0.7 });
  const pole = kit.mat('#334155', { metal: 0.8, rough: 0.3 });
  const light = kit.mat('#FFE7B0', { glow: true });
  const events: Array<{ x: number; z: number; kind: 'brake' | 'horn' }> = [];

  // Avenida externa: asfalto, guias, calçadas, faixa dupla amarela no meio e faixas brancas das pistas.
  const N = 260;
  const ring = (r: number, w: number, mat: THREE.Material, lift: number) => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      for (const rr of [r - w / 2, r + w / 2]) {
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        pos.push(x, heightAt(x, z) + lift, z);
      }
      if (i > 0) {
        const k = (i - 1) * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    b.add(mat, geo);
  };
  ring(OUTER_ROAD, 9, asphalt, 0.06);
  for (const s of [-1, 1]) {
    ring(OUTER_ROAD + s * 4.6, 0.3, curb, 0.16);
    ring(OUTER_ROAD + s * 6.5, 3.6, walk, 0.13);
    ring(OUTER_ROAD + s * 0.12, 0.1, kit.mat('#E8B33C', { rough: 0.6 }), 0.075);
  }
  for (let i = 0; i < 220; i++) {
    const a = (i / 220) * Math.PI * 2;
    for (const s of [-1, 1]) {
      const p = polar(a, OUTER_ROAD + s * 2.2);
      b.add(white, new THREE.BoxGeometry(0.12, 0.02, 3), [p.x, heightAt(p.x, p.z) + 0.08, p.z], [0, -a, 0]);
    }
    if (i % 5 === 0) {
      const p = polar(a + 0.01, OUTER_ROAD + 7.6);
      const y = heightAt(p.x, p.z);
      b.add(pole, new THREE.CylinderGeometry(0.08, 0.12, 7, 8), [p.x, y + 3.5, p.z]);
      const q = polar(a + 0.01, OUTER_ROAD + 6.2);
      b.add(pole, new THREE.BoxGeometry(0.1, 0.1, 1.6), [(p.x + q.x) / 2, y + 7, (p.z + q.z) / 2], [0, -a + Math.PI / 2, 0]);
      b.add(light, new THREE.BoxGeometry(0.45, 0.12, 0.28), [q.x, y + 6.92, q.z], [0, -a, 0]);
    }
  }

  // Ruas transversais: asfalto em trechos, calçadas com guia, faixa tracejada, faixas de pedestre nas pontas.
  const cross = crossStreets();
  const r0 = ROAD_RADIUS + 3.6;
  const r1 = OUTER_ROAD - 4.6;
  cross.forEach((c, ci) => {
    const steps = Math.ceil((r1 - r0) / 4);
    for (let k = 0; k < steps; k++) {
      const ra = r0 + ((k + 0.5) / steps) * (r1 - r0);
      const len = (r1 - r0) / steps + 0.05;
      const p = polar(c, ra);
      const y = heightAt(p.x, p.z);
      const ry = Math.PI / 2 - c;
      b.add(asphalt, new THREE.BoxGeometry(7, 0.1, len), [p.x, y + 0.04, p.z], [0, ry, 0]);
      for (const s of [-1, 1]) {
        const sp = { x: p.x - Math.sin(c) * s * 4.9, z: p.z + Math.cos(c) * s * 4.9 };
        b.add(walk, new THREE.BoxGeometry(2.8, 0.16, len), [sp.x, heightAt(sp.x, sp.z) + 0.07, sp.z], [0, ry, 0]);
        const cp = { x: p.x - Math.sin(c) * s * 3.55, z: p.z + Math.cos(c) * s * 3.55 };
        b.add(curb, new THREE.BoxGeometry(0.25, 0.2, len), [cp.x, heightAt(cp.x, cp.z) + 0.09, cp.z], [0, ry, 0]);
      }
      if (k % 2 === 0) b.add(stripe, new THREE.BoxGeometry(0.14, 0.02, 2.2), [p.x, y + 0.1, p.z], [0, ry, 0]);
    }
    // Faixas de pedestre nas duas esquinas e placa com o nome da rua.
    for (const ra of [r0 + 1.6, r1 - 1.6]) {
      for (let k = -3; k <= 3; k++) {
        const p = polar(c, ra);
        const q = { x: p.x - Math.sin(c) * k * 0.95, z: p.z + Math.cos(c) * k * 0.95 };
        b.add(white, new THREE.BoxGeometry(0.5, 0.02, 2.4), [q.x, heightAt(q.x, q.z) + 0.11, q.z], [0, Math.PI / 2 - c, 0]);
      }
    }
    const corner = polar(c + 7 / (r0 + 4), r0 + 3);
    const cy = heightAt(corner.x, corner.z);
    b.add(pole, new THREE.CylinderGeometry(0.04, 0.04, 2.9, 8), [corner.x, cy + 1.45, corner.z]);
    const tex = signTexture(kit, [STREET_NAMES[ci % STREET_NAMES.length]!], { bg: '#1E3A8A', fg: '#FFFFFF', accent: '#FFFFFF', w: 512, h: 128 });
    signBoard(b, kit, tex, corner.x, cy + 2.75, corner.z, Math.PI / 2 - c + Math.PI / 2, 1.4, 0.32);
    // Lixeira e hidrante na esquina.
    const bin = polar(c - 6 / (r0 + 5), r0 + 4.5);
    parkBin(b, kit, bin.x, heightAt(bin.x, bin.z) + 0.1, bin.z, -c);
    const hy = polar(c + 9 / (r1 - 4), r1 - 4.2);
    hydrant(b, kit, hy.x, heightAt(hy.x, hy.z) + 0.1, hy.z, -c);
  });

  // Semáforos: um em cada esquina da rua do parque com a transversal (verde, amarelo, vermelho).
  const lamp = new THREE.InstancedMesh(kit.own(new THREE.SphereGeometry(0.11, 10, 8)), kit.own(new THREE.MeshBasicMaterial({ color: '#ffffff' })), cross.length * 2 * 3);
  lamp.frustumCulled = false;
  const lights: Array<{ a: number; dir: number; offset: number }> = [];
  const m4 = new THREE.Matrix4();
  cross.forEach((c, ci) => {
    for (const dir of [1, -1]) {
      // Para quem vem pela rua do parque no sentido `dir`: o poste fica antes do cruzamento, do lado de fora.
      const a = c - dir * (6 / ROAD_RADIUS);
      const rp = ROAD_RADIUS + (dir > 0 ? 5.6 : -5.6);
      const p = polar(a, rp);
      const y = heightAt(p.x, p.z);
      b.add(pole, new THREE.CylinderGeometry(0.07, 0.09, 5.2, 8), [p.x, y + 2.6, p.z]);
      const arm = polar(a, ROAD_RADIUS + (dir > 0 ? 2.2 : -2.2));
      b.add(pole, new THREE.BoxGeometry(0.08, 0.08, 3.4), [(p.x + arm.x) / 2, y + 5.15, (p.z + arm.z) / 2], [0, -a, 0]);
      const fy = y + 4.6;
      const tang = { x: -Math.sin(a) * dir, z: Math.cos(a) * dir };
      b.add(kit.mat('#1F2328', { rough: 0.5 }), new THREE.BoxGeometry(0.36, 1.05, 0.3), [arm.x, fy, arm.z], [0, -a, 0]);
      for (let k = 0; k < 3; k++) {
        const pos = new THREE.Vector3(arm.x - tang.x * 0.17, fy + 0.33 - k * 0.33, arm.z - tang.z * 0.17);
        lamp.setMatrixAt((ci * 2 + (dir > 0 ? 0 : 1)) * 3 + k, m4.makeTranslation(pos.x, pos.y, pos.z));
      }
      lights.push({ a: c, dir, offset: ci * 7.3 });
    }
  });
  const RED = new THREE.Color('#FF3B30');
  const AMB = new THREE.Color('#FFB020');
  const GRN = new THREE.Color('#2BD45A');
  const OFF = new THREE.Color('#2A2D31');
  const CYCLE = 30;
  const stateOf = (i: number, t: number) => {
    const k = (t + lights[i]!.offset) % CYCLE;
    return k < 15 ? 'green' : k < 18 ? 'amber' : 'red';
  };

  // Pontos de ônibus junto aos portões do parque (lado de fora da rua): abrigo, banco, propaganda acesa, placa.
  const gates = navGraph().gates.map((gi) => Math.atan2(navGraph().nodes[gi]!.z, navGraph().nodes[gi]!.x));
  const stops = gates.map((ga) => ga + 0.05);
  const glass = kit.mat('#CFE7F5', { glass: true });
  const adLit = kit.mat('#FDE68A', { glow: true });
  const roof = kit.mat('#E5E7EB', { metal: 0.4, rough: 0.35 });
  const wood = kit.mat('#A0714F', { rough: 0.75 });
  const busSign = signTexture(kit, ['ÔNIBUS', 'Linha 210 · Parque'], { bg: '#0F766E', fg: '#FFFFFF', accent: '#FDE68A', w: 512, h: 256 });
  for (const sa of stops) {
    const p = polar(sa, ROAD_RADIUS + 6.1);
    const y = heightAt(p.x, p.z) + 0.1;
    // De frente para a rua (para o centro do parque).
    const put = frame(b, p.x, y, p.z, -sa - Math.PI / 2);
    put(glass, new THREE.BoxGeometry(4, 2.3, 0.04), 0, 1.25, -0.6);
    for (const s of [-1, 1]) {
      put(glass, new THREE.BoxGeometry(0.04, 2.3, 1.2), s * 2, 1.25, 0);
      put(pole, new THREE.BoxGeometry(0.08, 2.5, 0.08), s * 2, 1.25, -0.6);
      put(pole, new THREE.BoxGeometry(0.08, 2.5, 0.08), s * 2, 1.25, 0.6);
    }
    put(roof, roundBox(4.4, 0.1, 1.7, 0.08), 0, 2.5, 0);
    put(wood, new THREE.BoxGeometry(2.6, 0.07, 0.4), -0.4, 0.48, -0.32);
    for (const s of [-1, 1]) put(pole, new THREE.BoxGeometry(0.06, 0.48, 0.35), -0.4 + s * 1.2, 0.24, -0.32);
    // Propaganda iluminada na lateral e mapa da linha.
    put(pole, new THREE.BoxGeometry(1.2, 1.8, 0.14), 1.5, 1.2, -0.54);
    put(adLit, new THREE.BoxGeometry(1.06, 1.6, 0.02), 1.5, 1.2, -0.46);
    put(white, new THREE.BoxGeometry(0.8, 0.5, 0.01), -1.2, 1.5, -0.57);
    put(pole, new THREE.CylinderGeometry(0.04, 0.04, 2.8, 8), 2.5, 1.4, 0.5);
    signBoard(b, kit, busSign, p.x + Math.cos(sa) * -0.5 + Math.sin(sa) * 0, y + 2.55, p.z + Math.sin(sa) * -0.5, -sa - Math.PI / 2, 0.8, 0.4);
    const bin = polar(sa + 3.4 / ROAD_RADIUS, ROAD_RADIUS + 6);
    parkBin(b, kit, bin.x, heightAt(bin.x, bin.z) + 0.1, bin.z, -sa - Math.PI / 2);
  }
  // Bancas de jornal em duas esquinas da avenida.
  for (const c of [cross[1], cross[6]]) {
    if (c === undefined) continue;
    const p = polar(c + 11 / OUTER_ROAD, OUTER_ROAD - 7.2);
    const y = heightAt(p.x, p.z) + 0.1;
    const put = frame(b, p.x, y, p.z, -c + Math.PI / 2);
    put(kit.mat('#166534', { rough: 0.5, metal: 0.2 }), roundBox(3.2, 2.5, 2.2, 0.1), 0, 0, 0);
    put(kit.mat('#F8FAFC', { rough: 0.4 }), new THREE.BoxGeometry(3.6, 0.12, 2.8), 0, 2.6, 0.2);
    put(kit.mat('#14532D', { rough: 0.6 }), new THREE.BoxGeometry(3.6, 0.1, 0.9), 0, 2.45, 1.45, 0.35);
    // Revistas na vitrine (capas coloridas em fileiras).
    const covers = ['#DC2626', '#2563EB', '#F59E0B', '#16A34A', '#9333EA', '#0EA5E9', '#F97316', '#DB2777'];
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 8; k++) put(kit.mat(covers[(k + r * 3) % covers.length]!, { rough: 0.6 }), new THREE.BoxGeometry(0.32, 0.42, 0.02), -1.3 + k * 0.37, 0.75 + r * 0.5, 1.13, -0.12);
    const tex = signTexture(kit, ['BANCA', 'jornais · revistas'], { bg: '#FEF9C3', fg: '#14532D', accent: '#16A34A', w: 512, h: 128 });
    signBoard(b, kit, tex, p.x + Math.cos(c) * 1.13, y + 2.25, p.z + Math.sin(c) * 1.13, -c + Math.PI / 2, 2.0, 0.4);
  }
  // Hidrantes e lixeiras ao longo das calçadas da avenida.
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + 0.03;
    if (cross.some((c) => Math.abs(angDiff(a, c)) * OUTER_ROAD < 14)) continue;
    const p = polar(a, OUTER_ROAD + (i % 2 ? 6 : -6));
    if (i % 4 === 0) hydrant(b, kit, p.x, heightAt(p.x, p.z) + 0.1, p.z, -a);
    else if (i % 4 === 2) parkBin(b, kit, p.x, heightAt(p.x, p.z) + 0.1, p.z, -a + (i % 2 ? Math.PI / 2 : -Math.PI / 2));
  }
  g.add(b.build());
  g.add(lamp);

  // Trânsito: carros nas duas pistas da rua do parque e da avenida; param no semáforo vermelho e atrás do ônibus.
  const COLORS = ['#E5E7EB', '#1F2937', '#9CA3AF', '#B91C1C', '#1D4ED8', '#F8FAFC', '#065F46', '#78716C', '#0F172A', '#CA8A04'];
  const lanes: Array<{ a: number; dir: number; r: number; speed: number; v: number; inner: boolean }> = [];
  for (let k = 0; k < 12; k++) lanes.push({ a: (k / 12) * Math.PI * 2 + rnd() * 0.2, dir: k % 2 ? 1 : -1, r: ROAD_RADIUS + (k % 2 ? 1.0 : -1.0), speed: 8 + rnd() * 4, v: 8, inner: true });
  for (let k = 0; k < 16; k++) lanes.push({ a: (k / 16) * Math.PI * 2 + rnd() * 0.15, dir: k % 2 ? 1 : -1, r: OUTER_ROAD + (k % 2 ? 1.4 : -1.4), speed: 11 + rnd() * 5, v: 11, inner: false });
  // Estacionados: do lado do parque na rua do parque e dos dois lados da avenida, longe de portões, pontos e esquinas.
  const parked: Array<{ a: number; r: number; dir: number }> = [];
  const free = (a: number, list: number[], gap: number) => list.every((x) => Math.abs(angDiff(a, x)) > gap);
  for (let k = 0; k < 420; k++) {
    const a = (k / 420) * Math.PI * 2;
    if (rnd() < 0.42 && free(a, gates, 0.035) && free(a, stops, 0.03) && free(a, cross, 0.03)) parked.push({ a, r: ROAD_RADIUS - 2.6, dir: -1 });
  }
  for (let k = 0; k < 520; k++) {
    const a = (k / 520) * Math.PI * 2;
    if (rnd() < 0.3 && free(a, cross, 0.03)) parked.push({ a, r: OUTER_ROAD + (k % 2 ? 3.6 : -3.6), dir: k % 2 ? 1 : -1 });
  }
  const total = lanes.length + parked.length;
  const cars = fleet(kit, total);
  for (let i = 0; i < total; i++) cars.color(i, COLORS[Math.floor(rnd() * COLORS.length)]!);
  parked.forEach((p, k) => {
    const q = polar(p.a, p.r);
    cars.place(lanes.length + k, q.x, q.z, -p.a + (p.dir > 0 ? 0 : Math.PI));
  });
  cars.meshes.forEach((m) => g.add(m));
  cars.count(total);

  // Ônibus: carroceria arredondada com faixa, janelas, para-brisa, letreiro aceso, portas e rodas.
  const bus = new Builder();
  {
    const put = frame(bus, 0, 0, 0, 0);
    put(kit.mat('#F8FAFC', { rough: 0.35, metal: 0.3 }), roundBox(2.5, 2.7, 11.6, 0.35), 0, 0.45, 0);
    put(kit.mat('#0F766E', { rough: 0.4, metal: 0.2 }), new THREE.BoxGeometry(2.54, 0.5, 11.4), 0, 0.85, 0);
    const win = kit.mat('#1C2733', { rough: 0.08, metal: 0.7 });
    for (const s of [-1, 1]) put(win, new THREE.BoxGeometry(0.04, 1.0, 10.2), s * 1.27, 2.05, -0.3);
    put(win, new THREE.BoxGeometry(2.3, 1.5, 0.05), 0, 2.0, 5.83, -0.08);
    put(win, new THREE.BoxGeometry(2.1, 0.8, 0.05), 0, 2.2, -5.82);
    put(kit.mat('#FBBF24', { glow: true }), new THREE.BoxGeometry(1.8, 0.28, 0.04), 0, 2.95, 5.84);
    put(kit.mat('#0B0F14', { rough: 0.5 }), new THREE.BoxGeometry(0.05, 2.0, 1.1), 1.27, 1.5, 4.3);
    put(kit.mat('#0B0F14', { rough: 0.5 }), new THREE.BoxGeometry(0.05, 2.0, 1.1), 1.27, 1.5, -0.6);
    for (const z of [3.6, -2.6, -3.9])
      for (const s of [-1, 1]) {
        put(kit.mat('#1E2126', { rough: 0.6 }), new THREE.CylinderGeometry(0.5, 0.5, 0.32, 18), s * 1.1, 0.5, z, 0, 0, Math.PI / 2);
        put(kit.mat('#9CA3AF', { metal: 0.7, rough: 0.3 }), new THREE.CylinderGeometry(0.26, 0.26, 0.34, 12), s * 1.1, 0.5, z, 0, 0, Math.PI / 2);
      }
    put(kit.mat('#FFF4D6', { glow: true }), new THREE.BoxGeometry(2.0, 0.14, 0.05), 0, 0.8, 5.86);
    put(kit.mat('#E11D48', { glow: true }), new THREE.BoxGeometry(2.0, 0.14, 0.05), 0, 0.9, -5.85);
    for (const s of [-1, 1]) put(kit.mat('#1E2126', { rough: 0.6 }), new THREE.BoxGeometry(0.08, 0.3, 0.15), s * 1.42, 2.4, 5.7);
  }
  const busG = bus.build();
  g.add(busG);
  const busS = { a: stops[0] ?? 0, v: 0, wait: 0, next: 1 };
  const BUS_R = ROAD_RADIUS + 1.6;

  let last = 0;
  const tick = (t: number) => {
    const dt = last ? Math.min(0.1, t - last) : 0;
    last = t;
    events.length = 0;
    // Semáforos.
    lights.forEach((_, i) => {
      const st = stateOf(i, t);
      for (let k = 0; k < 3; k++) lamp.setColorAt(i * 3 + k, k === 0 ? (st === 'red' ? RED : OFF) : k === 1 ? (st === 'amber' ? AMB : OFF) : st === 'green' ? GRN : OFF);
    });
    if (lamp.instanceColor) lamp.instanceColor.needsUpdate = true;
    // Ônibus: anda no sentido anti-horário, freia no ponto, espera e segue.
    const nextStop = stops[busS.next % stops.length] ?? 0;
    const toStop = ((nextStop - busS.a + Math.PI * 4) % (Math.PI * 2)) * BUS_R;
    if (busS.wait > 0) {
      busS.wait -= dt;
      busS.v = 0;
      if (busS.wait <= 0) busS.next++;
    } else {
      const want = toStop < 30 ? Math.max(0, (toStop - 0.5) * 0.35) : 9;
      busS.v += (want - busS.v) * Math.min(1, dt * 1.5);
      if (toStop < 0.8) {
        busS.wait = 7;
        const p = polar(busS.a, BUS_R);
        events.push({ x: p.x, z: p.z, kind: 'brake' });
      }
    }
    busS.a += (busS.v * dt) / BUS_R;
    const bp = polar(busS.a, BUS_R);
    busG.position.set(bp.x, heightAt(bp.x, bp.z) + 0.05, bp.z);
    busG.rotation.y = -busS.a;
    // Carros.
    lanes.forEach((l, i) => {
      let want = l.speed;
      // Semáforo vermelho ou amarelo logo à frente (rua do parque): para antes da faixa.
      if (l.inner)
        lights.forEach((li, k) => {
          if (li.dir !== l.dir) return;
          const ahead = angDiff(li.a, l.a) * l.dir * l.r;
          if (ahead > 0 && ahead < 24 && stateOf(k, t) !== 'green') want = Math.min(want, Math.max(0, (ahead - 9) * 0.9));
        });
      // Ônibus parado na mesma pista: espera atrás.
      if (l.inner && l.dir > 0) {
        const gap = angDiff(busS.a, l.a) * l.r;
        if (gap > 0 && gap < 20) want = Math.min(want, Math.max(0, (gap - 9) * 0.9));
      }
      // Carro da frente na mesma pista.
      for (const o of lanes)
        if (o !== l && o.r === l.r) {
          const gap = angDiff(o.a, l.a) * l.dir * l.r;
          if (gap > 0 && gap < 14) want = Math.min(want, Math.max(0, (gap - 6) * 1.2));
        }
      l.v += (want - l.v) * Math.min(1, dt * 2);
      l.a += (l.dir * l.v * dt) / l.r;
      const p = polar(l.a, l.r);
      cars.place(i, p.x, p.z, -l.a + (l.dir > 0 ? 0 : Math.PI));
    });
    cars.count(total);
    if (Math.random() < dt * 0.01) {
      const l = lanes[Math.floor(Math.random() * lanes.length)]!;
      const p = polar(l.a, l.r);
      events.push({ x: p.x, z: p.z, kind: 'horn' });
    }
  };
  return { group: g, tick, events: () => events };
}
