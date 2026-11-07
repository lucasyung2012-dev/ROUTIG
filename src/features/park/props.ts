/**
 * Objetos de rua e de apoio com detalhe de verdade: lixeira de parque (cesto de ripas no poste,
 * tampa com boca, saco aparecendo), estação de reciclagem (quatro cestos arredondados com tampas
 * de cor, boca redonda para latas, fenda para papel, símbolo de reciclagem e pedal), hidrante,
 * bebedouro de galão e extintor com mangueira e manômetro.
 */
import * as THREE from 'three';
import type { Builder, Kit } from './kit';

/** Peças num referencial local (posição e giro em y) dentro de um Builder. */
export function frame(b: Builder, x: number, y: number, z: number, rot: number) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (m: THREE.Material, g: THREE.BufferGeometry, lx: number, ly: number, lz: number, rx = 0, ry = 0, rz = 0, sc?: [number, number, number]) => {
    // Giros e escala no referencial da peça (antes do giro do conjunto), para nada sair torto.
    if (sc) g.scale(...sc);
    if (rz) g.rotateZ(rz);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    return b.add(m, g, [x + lx * c + lz * s, y + ly, z - lx * s + lz * c], [0, rot, 0]);
  };
}

/** Caixa de cantos arredondados (corpo de cesto, gabinete). */
export function roundBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const x = -w / 2;
  const z = -d / 2;
  sh.moveTo(x + r, z);
  sh.lineTo(x + w - r, z);
  sh.quadraticCurveTo(x + w, z, x + w, z + r);
  sh.lineTo(x + w, z + d - r);
  sh.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
  sh.lineTo(x + r, z + d);
  sh.quadraticCurveTo(x, z + d, x, z + d - r);
  sh.lineTo(x, z + r);
  sh.quadraticCurveTo(x, z, x + r, z);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelSize: Math.min(0.012, r * 0.3), bevelThickness: Math.min(0.012, r * 0.3), bevelSegments: 2, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 0);
  return g;
}

/** Símbolo de reciclagem: três setas em triângulo (no plano xy, virado para +z). */
function recycleMark(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const bar = new THREE.BoxGeometry(0.075, 0.016, 0.004);
    bar.rotateZ(a + Math.PI / 2 + Math.PI / 3);
    bar.translate(Math.cos(a + Math.PI / 3) * 0.035, Math.sin(a + Math.PI / 3) * 0.035, 0);
    const head = new THREE.ConeGeometry(0.018, 0.03, 3);
    head.rotateZ(a + Math.PI / 3 + Math.PI);
    head.translate(Math.cos(a + 1.5) * 0.05, Math.sin(a + 1.5) * 0.05, 0);
    parts.push(bar.toNonIndexed(), head.toNonIndexed());
  }
  return mergeAll(parts);
}
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Junta sem depender de atributos iguais (só posição e normal).
  const pos: number[] = [];
  const nor: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    g.computeVertexNormals();
    pos.push(...(g.attributes.position!.array as Float32Array));
    nor.push(...(g.attributes.normal!.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

/** Lixeira de parque: poste, cesto de ripas verticais com aro, tampa em cúpula com boca e saco preto na borda. */
export function parkBin(b: Builder, kit: Kit, x: number, y: number, z: number, rot: number) {
  const put = frame(b, x, y, z, rot);
  const steel = kit.mat('#3B4452', { metal: 0.75, rough: 0.35 });
  const slat = kit.mat('#7A5233', { rough: 0.75 });
  const bag = kit.mat('#16181B', { rough: 0.35 });
  put(steel, new THREE.CylinderGeometry(0.045, 0.06, 1.05, 10), 0, 0.52, -0.3);
  put(steel, new THREE.CylinderGeometry(0.16, 0.18, 0.04, 14), 0, 0.02, -0.3);
  put(steel, new THREE.BoxGeometry(0.08, 0.06, 0.3), 0, 0.72, -0.17);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    put(slat, new THREE.BoxGeometry(0.045, 0.62, 0.022), Math.sin(a) * 0.22, 0.6, Math.cos(a) * 0.22, 0, a, 0);
  }
  for (const yy of [0.32, 0.88]) put(steel, new THREE.TorusGeometry(0.225, 0.012, 6, 24), 0, yy, 0, Math.PI / 2);
  put(steel, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 18), 0, 0.3, 0);
  put(bag, new THREE.TorusGeometry(0.205, 0.022, 6, 22), 0, 0.92, 0, Math.PI / 2, 0, 0, [1, 1, 0.6]);
  put(bag, new THREE.ConeGeometry(0.06, 0.1, 6), 0.19, 0.86, 0.06, 0.3, 0, 0.5);
  put(steel, new THREE.SphereGeometry(0.23, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.94, 0, 0, 0, 0, [1, 0.45, 1]);
  put(kit.mat('#0E1013', { rough: 0.9 }), new THREE.BoxGeometry(0.22, 0.09, 0.02), 0, 0.98, 0.19, -0.5);
}

/** Estação de reciclagem: armação inox, quatro cestos arredondados (azul, vermelho, verde, amarelo). */
export function recycleStation(b: Builder, kit: Kit, x: number, y: number, z: number, rot: number) {
  const put = frame(b, x, y, z, rot);
  const inox = kit.mat('#C9CED6', { metal: 0.85, rough: 0.25 });
  const darkHole = kit.mat('#0E1013', { rough: 0.9 });
  const white = kit.mat('#F8FAFC', { rough: 0.5 });
  const cols = [['#2563EB', 'paper'], ['#DC2626', 'plastic'], ['#16A34A', 'glass'], ['#EAB308', 'metal']] as const;
  // Base e travessa superior com placa.
  put(inox, new THREE.BoxGeometry(1.86, 0.04, 0.48), 0, 0.03, 0);
  put(inox, new THREE.BoxGeometry(1.86, 0.05, 0.05), 0, 0.98, -0.2);
  for (const sx of [-0.93, 0.93]) put(inox, new THREE.BoxGeometry(0.04, 0.98, 0.04), sx, 0.49, -0.2);
  const body = roundBox(0.42, 0.78, 0.4, 0.06);
  const lid = roundBox(0.44, 0.06, 0.42, 0.07);
  cols.forEach(([col, kind], k) => {
    const lx = -0.69 + k * 0.46;
    const m = kit.mat(col, { rough: 0.45 });
    put(m, body, lx, 0.06, 0);
    put(kit.mat(col, { rough: 0.35 }), lid, lx, 0.84, 0);
    // Boca: redonda para latas e vidro, fenda para papel, larga para plástico.
    if (kind === 'paper') put(darkHole, new THREE.BoxGeometry(0.26, 0.012, 0.04), lx, 0.905, 0.06);
    else if (kind === 'plastic') put(darkHole, new THREE.BoxGeometry(0.2, 0.012, 0.14), lx, 0.905, 0.05);
    else put(darkHole, new THREE.CylinderGeometry(0.07, 0.07, 0.012, 16), lx, 0.905, 0.05);
    // Etiqueta branca com o símbolo e a faixa da cor.
    put(white, new THREE.BoxGeometry(0.26, 0.26, 0.006), lx, 0.55, 0.205);
    put(m, recycleMark(), lx, 0.57, 0.21);
    put(m, new THREE.BoxGeometry(0.26, 0.04, 0.007), lx, 0.44, 0.21);
    // Pedal e alça de puxar.
    put(inox, new THREE.BoxGeometry(0.16, 0.025, 0.08), lx, 0.04, 0.24);
    put(inox, new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6), lx, 0.8, 0.215, 0, 0, Math.PI / 2);
  });
}

/** Bebedouro de galão: gabinete, torneiras azul e vermelha, bandeja e galão com gomos. */
export function waterCooler(b: Builder, kit: Kit, x: number, y: number, z: number, rot: number) {
  const put = frame(b, x, y, z, rot);
  const white = kit.mat('#F3F4F6', { rough: 0.45 });
  const grey = kit.mat('#9CA3AF', { metal: 0.5, rough: 0.35 });
  put(white, roundBox(0.32, 0.98, 0.32, 0.04), 0, 0, 0);
  put(grey, new THREE.BoxGeometry(0.22, 0.012, 0.1), 0, 0.62, 0.17);
  put(grey, new THREE.BoxGeometry(0.24, 0.18, 0.02), 0, 0.82, 0.165);
  put(kit.mat('#2563EB', { rough: 0.3 }), new THREE.BoxGeometry(0.04, 0.05, 0.04), -0.06, 0.8, 0.19);
  put(kit.mat('#DC2626', { rough: 0.3 }), new THREE.BoxGeometry(0.04, 0.05, 0.04), 0.06, 0.8, 0.19);
  const bottle = kit.mat('#9FD3E8', { glass: true });
  put(bottle, new THREE.CylinderGeometry(0.135, 0.135, 0.36, 18), 0, 1.2, 0);
  for (const yy of [1.1, 1.2, 1.3]) put(bottle, new THREE.TorusGeometry(0.137, 0.008, 4, 18), 0, yy, 0, Math.PI / 2);
  put(bottle, new THREE.CylinderGeometry(0.05, 0.135, 0.08, 16), 0, 1.02, 0);
  put(kit.mat('#60A5FA', { glass: true }), new THREE.CylinderGeometry(0.13, 0.13, 0.2, 18), 0, 1.1, 0);
}

/** Extintor no suporte da parede: cilindro vermelho, válvula, manômetro, mangueira e placa. */
export function extinguisher(b: Builder, kit: Kit, x: number, y: number, z: number, rot: number) {
  const put = frame(b, x, y, z, rot);
  const red = kit.mat('#C81E1E', { rough: 0.3, metal: 0.25 });
  const black = kit.mat('#1A1A1A', { rough: 0.6 });
  const metal = kit.mat('#B8BEC6', { metal: 0.85, rough: 0.25 });
  put(metal, new THREE.BoxGeometry(0.14, 0.1, 0.06), 0, 0.85, -0.06);
  put(red, new THREE.CapsuleGeometry(0.085, 0.36, 4, 14), 0, 0.55, 0);
  put(metal, new THREE.CylinderGeometry(0.03, 0.035, 0.07, 10), 0, 0.84, 0);
  put(black, new THREE.BoxGeometry(0.12, 0.018, 0.03), 0.02, 0.89, 0, 0, 0, -0.2);
  put(metal, new THREE.CylinderGeometry(0.022, 0.022, 0.01, 12), 0.04, 0.84, 0.03, Math.PI / 2);
  put(black, new THREE.TorusGeometry(0.09, 0.012, 6, 14, Math.PI * 1.1), -0.07, 0.62, 0.04, 0, 0, Math.PI * 0.55);
  put(black, new THREE.ConeGeometry(0.02, 0.06, 8), -0.1, 0.5, 0.05, Math.PI);
  put(kit.mat('#DC2626', { rough: 0.6 }), new THREE.BoxGeometry(0.26, 0.26, 0.01), 0, 1.25, -0.08);
  put(kit.mat('#F8FAFC', { rough: 0.6 }), new THREE.BoxGeometry(0.06, 0.16, 0.012), 0, 1.25, -0.073);
}

/** Hidrante de calçada: corpo amarelo, tampa, bocais e corrente. */
export function hydrant(b: Builder, kit: Kit, x: number, y: number, z: number, rot: number) {
  const put = frame(b, x, y, z, rot);
  const yellow = kit.mat('#E0A80B', { rough: 0.45, metal: 0.2 });
  put(yellow, new THREE.CylinderGeometry(0.13, 0.15, 0.08, 14), 0, 0.04, 0);
  put(yellow, new THREE.CylinderGeometry(0.1, 0.11, 0.55, 14), 0, 0.35, 0);
  put(yellow, new THREE.SphereGeometry(0.105, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.62, 0);
  put(yellow, new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6), 0, 0.73, 0);
  for (const s of [-1, 1]) put(yellow, new THREE.CylinderGeometry(0.045, 0.045, 0.1, 10), s * 0.13, 0.42, 0, 0, 0, Math.PI / 2);
  put(yellow, new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12), 0, 0.42, 0.12, Math.PI / 2);
}

/** Placa com texto (ponto de ônibus, parquinho, nomes de rua). */
export function signBoard(b: Builder, kit: Kit, tex: THREE.Texture, x: number, y: number, z: number, rot: number, w: number, h: number) {
  const mat = kit.own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  const put = frame(b, x, y, z, rot);
  put(mat, new THREE.PlaneGeometry(w, h), 0, 0, 0.012);
  put(kit.mat('#2B3442', { metal: 0.6, rough: 0.4 }), new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.02), 0, 0, 0);
}
