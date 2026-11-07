/**
 * Grama de verdade perto de quem anda: tufos de folhas finas (base escura, ponta clara) num raio
 * de ~45 m em volta da câmera, balançando com o vento (no shader, sem custo por quadro).
 * Não nasce em caminho, praça, água, lote de prédio nem fora do campus. O resto do chão segue
 * com a cor do gramado do terreno.
 */
import * as THREE from 'three';
import type { Kit } from './kit';

const N = 9000;
const RANGE = 46;

function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const base = new THREE.Color('#3E7A36');
  const tip = new THREE.Color('#9BCB6A');
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI + k * 0.3;
    const h = 0.38 + (k % 3) * 0.1;
    const w = 0.06;
    const dx = Math.cos(a) * w;
    const dz = Math.sin(a) * w;
    const lean = 0.08 * (k % 2 ? 1 : -1);
    pos.push(-dx, 0, -dz, dx, 0, dz, lean * Math.sin(a), h, lean * Math.cos(a));
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Normais para cima: a grama fica iluminada como o gramado, não como lâminas.
  const n = g.attributes.normal!;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export interface Grass {
  mesh: THREE.InstancedMesh;
  tick: (center: THREE.Vector3, t: number, wind: number) => void;
  setDensity: (f: number) => void;
}

export function createGrass(kit: Kit, ground: (x: number, z: number) => number, allowed: (x: number, z: number) => boolean): Grass {
  const mat = kit.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  const uniforms = { uTime: { value: 0 }, uWind: { value: 0.2 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uWind = uniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * (1.6 + uWind * 2.5) + ip.x * 0.35 + ip.z * 0.27) * (0.05 + uWind * 0.22);
        transformed.x += sway * position.y;
        transformed.z += sway * 0.6 * position.y;`,
      );
  };
  const mesh = new THREE.InstancedMesh(kit.own(tuftGeometry()), mat, N);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.count = 0;
  let last = new THREE.Vector3(1e9, 0, 1e9);
  let density = 1;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const hash = (x: number, z: number) => {
    const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const rebuild = (cx: number, cz: number) => {
    const step = 1.0 / Math.sqrt(Math.max(0.2, density));
    let n = 0;
    const gx = Math.round(cx / step);
    const gz = Math.round(cz / step);
    const cells = Math.ceil(RANGE / step);
    for (let i = -cells; i <= cells && n < N; i++)
      for (let j = -cells; j <= cells && n < N; j++) {
        // Posição fixa por célula do mundo (não "escorrega" quando a câmera anda).
        const ix = gx + i;
        const iz = gz + j;
        const x = (ix + hash(ix, iz) - 0.5) * step;
        const z = (iz + hash(iz, ix) - 0.5) * step;
        const d = Math.hypot(x - cx, z - cz);
        if (d > RANGE || !allowed(x, z)) continue;
        const r = hash(ix * 3, iz * 7);
        const s = (0.7 + r * 0.8) * (d > RANGE - 8 ? (RANGE - d) / 8 : 1);
        m4.compose(v.set(x, ground(x, z) - 0.02, z), q.setFromEuler(e.set(0, r * 6.28, 0)), sc.set(s, s * (0.8 + r * 0.6), s));
        mesh.setMatrixAt(n++, m4);
      }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  };
  return {
    mesh,
    tick: (center, t, wind) => {
      uniforms.uTime.value = t;
      uniforms.uWind.value = wind;
      if (Math.hypot(center.x - last.x, center.z - last.z) > 7) {
        last = center.clone();
        rebuild(center.x, center.z);
      }
    },
    setDensity: (f) => {
      density = f;
      mesh.visible = f > 0;
      last.set(1e9, 0, 1e9);
    },
  };
}
