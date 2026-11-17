/**
 * Colisão pelo desenho real: em vez de um círculo por prédio, cada peça que fica na altura do
 * corpo (paredes, vidros, balcões, bancos, postes) marca as células de uma grade de 0,8 m.
 * Assim não se atravessa barraca, quiosque nem a parte de um prédio fora do "miolo".
 */
import * as THREE from 'three';
import type { Obstacle } from './camera';


/**
 * Células ocupadas por um objeto (já posicionado no mundo) entre `low` e `high` metros acima do
 * chão. `ground(x, z)` dá a altura do chão em cada ponto.
 */
export function footprint(root: THREE.Object3D, ground: (x: number, z: number) => number, low = 0.25, high = 2.0, CELL = 0.8): Obstacle[] {
  root.updateMatrixWorld(true);
  const cells = new Map<string, { x: number; z: number; h: number }>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  // Só as células que o triângulo (visto de cima) toca, e não a caixa inteira dele: uma parede na
  // diagonal (a fachada do tambor, a parede de uma sala do anel, o guarda-corpo de um lance) não
  // vira uma faixa larga de colisão invisível em volta dela. Uma célula conta quando o centro dela
  // fica a até meia diagonal (0,71 da célula) do triângulo.
  const reach = CELL * 0.71;
  const mark = (x0: number, x1: number, z0: number, z1: number, top: number) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        if (triDist((i + 0.5) * CELL, (j + 0.5) * CELL, a.x, a.z, b.x, b.z, c.x, c.z) > reach) continue;
        const k = `${i},${j}`;
        const cur = cells.get(k);
        if (!cur || cur.h < top) cells.set(k, { x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, h: top });
      }
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || (o as THREE.InstancedMesh).isInstancedMesh || o.userData.noCollide) return;
    // Áreas de toque invisíveis e materiais escondidos não são parede.
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if ((Array.isArray(mat) ? mat : [mat]).every((m) => !m.visible || (m.transparent && m.opacity < 0.1))) return;
    let hidden = false;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) hidden = true;
    if (hidden) return;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const idx = mesh.geometry.index;
    const n = idx ? idx.count : pos.count;
    const m = mesh.matrixWorld;
    for (let t = 0; t + 2 < n; t += 3) {
      const ia = idx ? idx.getX(t) : t;
      const ib = idx ? idx.getX(t + 1) : t + 1;
      const ic = idx ? idx.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m);
      const cx = (a.x + b.x + c.x) / 3;
      const cz = (a.z + b.z + c.z) / 3;
      const g = ground(cx, cz);
      const y0 = Math.min(a.y, b.y, c.y) - g;
      const y1 = Math.max(a.y, b.y, c.y) - g;
      // Só o que cruza a faixa do corpo; pisos e tetos (triângulos deitados e largos) ficam de fora.
      if (y1 < low || y0 > high) continue;
      const w = Math.max(a.x, b.x, c.x) - Math.min(a.x, b.x, c.x);
      const d = Math.max(a.z, b.z, c.z) - Math.min(a.z, b.z, c.z);
      if (y1 - y0 < 0.05 && w * d > 1.5) continue;
      if (w > 30 || d > 30) continue;
      mark(Math.min(a.x, b.x, c.x), Math.max(a.x, b.x, c.x), Math.min(a.z, b.z, c.z), Math.max(a.z, b.z, c.z), g + y1);
    }
  });
  return [...cells.values()].map((p) => ({ x: p.x, z: p.z, r: CELL * 0.62, h: p.h }));
}

/** Distância de um ponto ao segmento (no plano). */
function seg2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Distância de um ponto ao triângulo visto de cima (0 dentro dele; o triângulo em pé vira um segmento). */
export function triDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  const area = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az));
  if (area > 1e-9 && !(neg && pos)) return 0;
  return Math.min(seg2(px, pz, ax, az, bx, bz), seg2(px, pz, bx, bz, cx, cz), seg2(px, pz, cx, cz, ax, az));
}

/** Grade espacial para achar só os obstáculos perto de um ponto. */
export class ObstacleGrid {
  private map = new Map<string, Obstacle[]>();
  constructor(
    readonly list: Obstacle[],
    private size = 4,
  ) {
    for (const o of list) {
      for (let i = Math.floor((o.x - o.r - 1) / size); i <= Math.floor((o.x + o.r + 1) / size); i++)
        for (let j = Math.floor((o.z - o.r - 1) / size); j <= Math.floor((o.z + o.r + 1) / size); j++) {
          const k = `${i},${j}`;
          const arr = this.map.get(k);
          if (arr) arr.push(o);
          else this.map.set(k, [o]);
        }
    }
  }
  near(x: number, z: number): Obstacle[] {
    return this.map.get(`${Math.floor(x / this.size)},${Math.floor(z / this.size)}`) ?? [];
  }
}
