/**
 * Chão vivo perto de quem anda (num raio de ~46 m em volta da câmera), tudo balançando com o vento
 * no shader (sem custo por quadro):
 * - grama: tufos de 7 folhas finas, base escura e ponta clara, cada tufo num tom (verde-limão,
 *   verde-escuro, palha seca);
 * - mato: touceiras mais altas e escuras em manchas (cantos do gramado);
 * - flores do campo: manchas de margaridas, trevos-roxos e flores amarelas no meio da grama.
 * Não nasce em caminho, praça, água, lote de prédio nem fora do campus. Posições fixas por
 * célula do mundo (não "escorregam" quando a câmera anda).
 */
import * as THREE from 'three';
import type { Kit } from './kit';

const N = 9000;
const NW = 1400;
const NF = 1600;
const RANGE = 46;

/** Folhas finas em leque: `blades` triângulos, base e ponta com cores próprias. */
function bladeTuft(blades: number, height: number, spread: number, base: string, tip: string, seed: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const b = new THREE.Color(base);
  const t = new THREE.Color(tip);
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2 + r();
    const h = height * (0.65 + r() * 0.6);
    const w = 0.035 + r() * 0.035;
    const ox = Math.cos(a) * spread * r();
    const oz = Math.sin(a) * spread * r();
    const dx = Math.cos(a + 1.57) * w;
    const dz = Math.sin(a + 1.57) * w;
    const lean = 0.12 + r() * 0.15;
    const tc = t.clone().lerp(b, r() * 0.35);
    pos.push(ox - dx, 0, oz - dz, ox + dx, 0, oz + dz, ox + Math.cos(a) * lean * h, h, oz + Math.sin(a) * lean * h);
    col.push(b.r, b.g, b.b, b.r, b.g, b.b, tc.r, tc.g, tc.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Normais para cima: a grama fica iluminada como o gramado, não como lâminas.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

/** Flor do campo: três hastes finas, cada uma com pétalas em cruz (tingidas por instância) e miolo. */
function flowerGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const stem = new THREE.Color('#4F8A3A');
  const white = new THREE.Color('#FFFFFF');
  const core = new THREE.Color('#F4C430');
  const tri = (a: number[], c: THREE.Color) => {
    pos.push(...a);
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  };
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1;
    const x = Math.cos(a) * 0.06;
    const z = Math.sin(a) * 0.06;
    const h = 0.32 + k * 0.07;
    tri([x - 0.01, 0, z, x + 0.01, 0, z, x, h, z], stem);
    for (let p = 0; p < 4; p++) {
      const pa = (p / 4) * Math.PI * 2 + k;
      tri([x, h, z, x + Math.cos(pa) * 0.07, h + 0.01, z + Math.sin(pa) * 0.07, x + Math.cos(pa + 0.7) * 0.07, h + 0.01, z + Math.sin(pa + 0.7) * 0.07], white);
    }
    tri([x - 0.02, h + 0.015, z, x + 0.02, h + 0.015, z, x, h + 0.02, z + 0.02], core);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

export interface Grass {
  mesh: THREE.Group;
  tick: (center: THREE.Vector3, t: number, wind: number) => void;
  setDensity: (f: number) => void;
}

export function createGrass(kit: Kit, ground: (x: number, z: number) => number, allowed: (x: number, z: number) => boolean): Grass {
  const uniforms = { uTime: { value: 0 }, uWind: { value: 0.2 } };
  const swayMat = (strength: number) => {
    const mat = kit.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.uniforms.uWind = uniforms.uWind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float gust = 0.5 + 0.5 * sin(uTime * 0.6 + ip.x * 0.05 + ip.z * 0.04);
          float sway = sin(uTime * (1.6 + uWind * 2.5) + ip.x * 0.35 + ip.z * 0.27) * (0.05 + uWind * 0.22 * gust) * ${strength.toFixed(2)};
          transformed.x += sway * position.y;
          transformed.z += sway * 0.6 * position.y;`,
        );
    };
    return mat;
  };
  const make = (geo: THREE.BufferGeometry, n: number, strength: number) => {
    const m = new THREE.InstancedMesh(kit.own(geo), swayMat(strength), n);
    m.frustumCulled = false;
    m.receiveShadow = true;
    m.count = 0;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    return m;
  };
  const mesh = make(bladeTuft(7, 0.42, 0.06, '#3A7232', '#A8D46F', 11), N, 1);
  const weeds = make(bladeTuft(12, 0.85, 0.16, '#2F5E2A', '#7FA552', 29), NW, 0.8);
  const flowers = make(flowerGeometry(), NF, 1.2);
  const group = new THREE.Group();
  group.add(mesh, weeds, flowers);
  const last = new THREE.Vector3(1e9, 0, 1e9);
  let density = 1;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  const hash = (x: number, z: number) => {
    const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  // Manchas suaves: mato e flores aparecem em grupos, não espalhados por igual.
  const patch = (x: number, z: number, f: number, o: number) => 0.5 + 0.25 * Math.sin(x * f + o) * Math.cos(z * f * 1.3 - o) + 0.25 * Math.sin((x + z) * f * 0.7 + o * 2);
  const grassTones = ['#FFFFFF', '#E9F5D8', '#D8EFC0', '#F2E7B8', '#CFE8B4'];
  const flowerTones = ['#FFFFFF', '#FFFFFF', '#FDE047', '#C4B5FD', '#F9A8D4', '#FCA5A5'];
  const rebuild = (cx: number, cz: number) => {
    const step = 1.0 / Math.sqrt(Math.max(0.2, density));
    let n = 0;
    let nw = 0;
    let nf = 0;
    const gx = Math.round(cx / step);
    const gz = Math.round(cz / step);
    const cells = Math.ceil(RANGE / step);
    for (let i = -cells; i <= cells && n < N; i++)
      for (let j = -cells; j <= cells && n < N; j++) {
        const ix = gx + i;
        const iz = gz + j;
        const x = (ix + hash(ix, iz) - 0.5) * step;
        const z = (iz + hash(iz, ix) - 0.5) * step;
        const d = Math.hypot(x - cx, z - cz);
        if (d > RANGE || !allowed(x, z)) continue;
        const r = hash(ix * 3, iz * 7);
        const fade = d > RANGE - 8 ? (RANGE - d) / 8 : 1;
        const y = ground(x, z) - 0.02;
        if (patch(x, z, 0.09, 1.3) > 0.78 && nw < NW && r < 0.55) {
          const s = (0.8 + r * 0.7) * fade;
          m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, r * 6.28, 0)), sc.set(s, s * (0.9 + r * 0.5), s));
          weeds.setMatrixAt(nw, m4);
          weeds.setColorAt(nw++, c.set(r > 0.3 ? '#FFFFFF' : '#E8DDA8'));
          continue;
        }
        if (patch(x, z, 0.13, 4.1) > 0.76 && nf < NF && r > 0.45) {
          const s = (0.8 + r * 0.5) * fade;
          m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, r * 6.28, 0)), sc.set(s, s, s));
          flowers.setMatrixAt(nf, m4);
          flowers.setColorAt(nf++, c.set(flowerTones[Math.floor(hash(Math.floor(x / 6), Math.floor(z / 6)) * flowerTones.length)]!));
        }
        const s = (0.7 + r * 0.8) * fade;
        m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, r * 6.28, 0)), sc.set(s, s * (0.8 + r * 0.6), s));
        mesh.setMatrixAt(n, m4);
        mesh.setColorAt(n++, c.set(grassTones[Math.floor(r * 97) % grassTones.length]!));
      }
    for (const [m, k] of [[mesh, n], [weeds, nw], [flowers, nf]] as const) {
      m.count = k;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  };
  return {
    mesh: group,
    tick: (center, t, wind) => {
      uniforms.uTime.value = t;
      uniforms.uWind.value = wind;
      if (Math.hypot(center.x - last.x, center.z - last.z) > 7) {
        last.copy(center);
        rebuild(center.x, center.z);
      }
    },
    setDensity: (f) => {
      density = f;
      group.visible = f > 0;
      last.set(1e9, 0, 1e9);
    },
  };
}
