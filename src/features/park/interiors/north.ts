/**
 * Interiores da região Norte: Biblioteca Digital, Ateliê de Conhecimento (Notes), Academy,
 * Idiomas e Insights. O térreo de cada prédio segue o programa da especificação (seções 13 a 16 e
 * 24): cada ambiente do "Térreo" é uma área reconhecível, com móveis próprios, materiais do prédio e
 * placa com o nome (zoneLabel). Onde o ambiente corresponde a uma função real do módulo, o objeto
 * principal dele é tocável e abre o painel do setor (HTML real); os demais são só ambiente (sem
 * telas com números nem botões de enfeite). A circulação fica livre: da entrada (x = 0, frente) até
 * o saguão dos elevadores (fundos), e em volta do átrio, do jardim ou do núcleo da escada.
 */
import * as THREE from 'three';
import { Builder, type Kit } from '../kit';
import type { Obstacle } from '../camera';
import { canvasPlane, createRoom, finishRoom, gallerySlab, markSector, pendants, sectorGroup, sectorSign, sectorView, setDetailCommon, wallSpots, zoneLabel, type InteriorScene, type ZoneKey } from './common';
import type { Placed } from './central';
import { MASSING } from '../massing';
import type { Thing } from './things';

/** Placa com texto que muda com os dados (nome de disciplina, idioma). */
export function nameBoard(kit: Kit, w: number, accent: string) {
  const p = canvasPlane(kit, w, w * 0.28, 112);
  const draw = (text: string) => {
    const c = p.ctx.canvas;
    p.ctx.clearRect(0, 0, c.width, c.height);
    p.ctx.fillStyle = text ? 'rgba(12,24,44,0.92)' : 'rgba(12,24,44,0.45)';
    p.ctx.fillRect(0, 0, c.width, c.height);
    p.ctx.fillStyle = accent;
    p.ctx.fillRect(0, c.height - 7, c.width, 7);
    p.ctx.fillStyle = text ? '#F1FAFF' : 'rgba(241,250,255,0.5)';
    p.ctx.font = '700 46px Inter, system-ui, sans-serif';
    p.ctx.textAlign = 'center';
    p.ctx.textBaseline = 'middle';
    p.ctx.fillText(text || '—', c.width / 2, c.height / 2 - 3, c.width - 24);
    p.tex.needsUpdate = true;
  };
  draw('');
  return { mesh: p.mesh, draw };
}

/* =====================================================================
 * Peças comuns dos ambientes
 * ===================================================================== */

/** Coloca uma peça: posição local (x, y, z), giro em y e inclinação em x (aplicada antes do giro). */
type Put = (m: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, ry?: number, tilt?: number) => void;

/** Peças de um ambiente em coordenadas próprias (x para o lado, +z para quem chega), giradas `face` e levadas para (x0, z0). */
function frame(b: Builder, x0: number, z0: number, face: number): Put {
  const c = Math.cos(face);
  const s = Math.sin(face);
  return (m, g, x, y, z, ry = 0, tilt = 0) => {
    if (tilt) g.rotateX(tilt);
    b.add(m, g, [x0 + x * c + z * s, y, z0 - x * s + z * c], [0, face + ry, 0]);
  };
}

/** Um móvel dentro de um ambiente: o mesmo `Put`, deslocado e girado. */
function sub(put: Put, x0: number, z0: number, face: number): Put {
  const c = Math.cos(face);
  const s = Math.sin(face);
  return (m, g, x, y, z, ry = 0, tilt = 0) => put(m, g, x0 + x * c + z * s, y, z0 - x * s + z * c, face + ry, tilt);
}

/** Ponto local (x, z) de um ambiente em coordenadas do salão. */
function toWorld(p: Placed, x: number, z: number): [number, number] {
  const c = Math.cos(p.face);
  const s = Math.sin(p.face);
  return [p.x + x * c + z * s, p.z - x * s + z * c];
}

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (rt: number, rb: number, h: number, n = 16) => new THREE.CylinderGeometry(rt, rb, h, n);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T => {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
};

interface Mats {
  stone: THREE.Material;
  wood: THREE.Material;
  woodDark: THREE.Material;
  concrete: THREE.Material;
  dark: THREE.Material;
  metal: THREE.Material;
  glass: THREE.Material;
  fabric: THREE.Material;
  fabric2: THREE.Material;
  rug: THREE.Material;
  leaf: THREE.Material;
  leaf2: THREE.Material;
  pot: THREE.Material;
  paper: THREE.Material;
  white: THREE.Material;
  lamp: THREE.Material;
  page: THREE.Material;
  acc: THREE.Material;
  accGlow: THREE.Material;
  books: THREE.Material[];
}

/** Materiais de um prédio: pedra (ou concreto claro), madeira e tecidos na paleta dele. */
function palette(kit: Kit, accent: string, o: { stone: string; wood: string; fabric: string; fabric2: string; rug: string }): Mats {
  return {
    stone: kit.mat(o.stone, { rough: 0.8 }),
    wood: kit.mat(o.wood, { rough: 0.65 }),
    woodDark: kit.mat('#6E4B33', { rough: 0.7 }),
    concrete: kit.mat('#CFCCC5', { rough: 0.9 }),
    dark: kit.mat('#2B3442', { rough: 0.5, metal: 0.3 }),
    metal: kit.mat('#A6B0BC', { metal: 0.85, rough: 0.3 }),
    glass: kit.mat('#D6ECF4', { glass: true, side: THREE.DoubleSide }),
    fabric: kit.mat(o.fabric, { rough: 0.95 }),
    fabric2: kit.mat(o.fabric2, { rough: 0.95 }),
    rug: kit.mat(o.rug, { rough: 1 }),
    leaf: kit.mat('#4C9A4F', { rough: 0.9 }),
    leaf2: kit.mat('#3E7F44', { rough: 0.9 }),
    pot: kit.mat('#D9CBB6', { rough: 0.8 }),
    paper: kit.mat('#F7F1E6', { rough: 0.9 }),
    white: kit.mat('#F4F5F7', { rough: 0.5 }),
    lamp: kit.mat('#FFE7C2', { glow: true }),
    page: kit.mat('#FDF8EE', { glow: true }),
    acc: kit.mat(accent, { rough: 0.55 }),
    accGlow: kit.mat(accent, { glow: true }),
    books: ['#E07A5F', '#3D9970', '#5B8DB8', '#F2CC8F', '#8E7DBE', '#C8553D'].map((c) => kit.mat(c, { rough: 0.85 })),
  };
}

/** Tapete. */
function rug(put: Put, m: THREE.Material, x: number, z: number, w: number, d: number, ry = 0) {
  put(m, B(w, 0.012, d), x, 0.008, z, ry);
}

/** Cadeira (quem senta olha para +z). */
function chair(put: Put, M: Mats, x: number, z: number, ry: number, seat = M.wood) {
  const p = sub(put, x, z, ry);
  p(seat, B(0.44, 0.05, 0.44), 0, 0.46, 0);
  p(seat, B(0.44, 0.42, 0.04), 0, 0.7, -0.21);
  for (const [a, c] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]] as const) p(M.dark, B(0.03, 0.45, 0.03), a, 0.225, c);
}

/** Banqueta alta (balcões e mesa de pé). */
function stool(put: Put, M: Mats, x: number, z: number, h = 0.72) {
  put(M.wood, C(0.2, 0.2, 0.05, 16), x, h, z);
  put(M.dark, C(0.03, 0.03, h, 6), x, h / 2, z);
  put(M.dark, C(0.18, 0.2, 0.02, 12), x, 0.01, z);
}

/** Sofá (quem senta olha para +z). */
function sofa(put: Put, M: Mats, x: number, z: number, ry: number, len = 2.2, cloth = M.fabric) {
  const p = sub(put, x, z, ry);
  p(cloth, B(len, 0.42, 0.9), 0, 0.27, 0);
  p(cloth, B(len, 0.5, 0.22), 0, 0.65, -0.34);
  for (const s of [-1, 1]) p(cloth, B(0.2, 0.6, 0.9), s * (len / 2 - 0.1), 0.36, 0);
  for (const s of [-1, 1]) p(M.fabric2, B(0.45, 0.35, 0.12), s * (len / 2 - 0.55), 0.68, -0.18, 0, -0.2);
  for (const s of [-1, 1]) p(M.dark, B(0.06, 0.06, 0.8), s * (len / 2 - 0.15), 0.03, 0);
}

/** Poltrona (quem senta olha para +z). */
function armchair(put: Put, M: Mats, x: number, z: number, ry: number, cloth = M.fabric) {
  const p = sub(put, x, z, ry);
  p(cloth, B(0.8, 0.4, 0.8), 0, 0.3, 0);
  p(cloth, B(0.8, 0.55, 0.18), 0, 0.72, -0.33);
  for (const s of [-1, 1]) p(cloth, B(0.14, 0.5, 0.8), s * 0.4, 0.45, 0);
  for (const [a, c] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]] as const) p(M.woodDark, C(0.025, 0.02, 0.1, 6), a, 0.05, c);
}

/** Mesinha baixa redonda com um livro em cima. */
function lowTable(put: Put, M: Mats, x: number, z: number, r = 0.5, top = M.wood) {
  put(top, C(r, r, 0.05, 24), x, 0.42, z);
  put(M.dark, C(0.05, 0.12, 0.4, 8), x, 0.2, z);
  put(M.books[1]!, B(0.24, 0.03, 0.32), x - r * 0.3, 0.46, z, 0.3);
}

/** Mesa redonda com `n` cadeiras viradas para ela. */
function roundTable(put: Put, M: Mats, x: number, z: number, n = 4, r = 0.6, top = M.wood) {
  put(top, C(r, r, 0.05, 24), x, 0.75, z);
  put(M.dark, C(0.05, 0.05, 0.72, 8), x, 0.37, z);
  put(M.dark, C(0.3, 0.32, 0.03, 16), x, 0.015, z);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / n;
    chair(put, M, x + Math.sin(a) * (r + 0.45), z + Math.cos(a) * (r + 0.45), a + Math.PI);
  }
}

/** Mesa comprida (`len` ao longo de x local) com cadeiras dos dois lados. */
function longTable(put: Put, M: Mats, x: number, z: number, len: number, depth: number, perSide: number, ry = 0, top = M.wood) {
  const p = sub(put, x, z, ry);
  p(top, B(len, 0.06, depth), 0, 0.75, 0);
  for (const s of [-1, 1]) p(M.dark, B(0.08, 0.72, depth - 0.2), s * (len / 2 - 0.3), 0.36, 0);
  for (let k = 0; k < perSide; k++) {
    const cx = (k + 0.5 - perSide / 2) * (len / perSide);
    chair(p, M, cx, depth / 2 + 0.4, Math.PI);
    chair(p, M, cx, -depth / 2 - 0.4, 0);
  }
}

/** Luminária de mesa. */
function deskLamp(put: Put, M: Mats, x: number, y: number, z: number, shade = M.dark) {
  put(M.dark, C(0.09, 0.1, 0.03, 12), x, y + 0.015, z);
  put(M.dark, C(0.012, 0.012, 0.42, 6), x, y + 0.22, z);
  put(shade, new THREE.ConeGeometry(0.12, 0.14, 12, 1, true), x, y + 0.45, z);
  put(M.lamp, C(0.09, 0.09, 0.01, 12), x, y + 0.385, z);
}

/** Luminária de piso (decoração; as que acendem são as do andar). */
function standLamp(put: Put, M: Mats, x: number, z: number) {
  put(M.dark, C(0.15, 0.17, 0.03, 12), x, 0.015, z);
  put(M.dark, C(0.015, 0.015, 1.45, 6), x, 0.74, z);
  put(M.fabric2, new THREE.CylinderGeometry(0.18, 0.24, 0.3, 16, 1, true), x, 1.55, z);
  put(M.lamp, C(0.16, 0.16, 0.01, 12), x, 1.42, z);
}

/** Pendente (cabo do teto `ceil` até a cúpula em `y`). */
function pendant(put: Put, M: Mats, x: number, z: number, ceil: number, y: number) {
  put(M.dark, C(0.008, 0.008, ceil - y, 4), x, (ceil + y) / 2, z);
  put(M.dark, new THREE.ConeGeometry(0.3, 0.28, 16, 1, true), x, y, z);
  put(M.lamp, C(0.22, 0.22, 0.02, 16), x, y - 0.13, z);
}

/** Planta num vaso. */
function plant(put: Put, M: Mats, x: number, z: number, s = 1) {
  put(M.pot, C(0.32 * s, 0.25 * s, 0.6 * s, 12), x, 0.3 * s, z);
  put(M.leaf, new THREE.IcosahedronGeometry(0.5 * s, 1), x, 0.95 * s, z);
  put(M.leaf2, new THREE.IcosahedronGeometry(0.38 * s, 1), x + 0.15 * s, 1.35 * s, z - 0.1 * s);
}

/** Floreira retangular (`w` ao longo de x local). */
function planter(put: Put, M: Mats, x: number, z: number, w: number, d: number, ry = 0) {
  const p = sub(put, x, z, ry);
  p(M.stone, B(w, 0.55, d), 0, 0.275, 0);
  p(M.woodDark, B(w - 0.12, 0.02, d - 0.12), 0, 0.555, 0);
  const n = Math.max(2, Math.round(w / 0.6));
  for (let k = 0; k < n; k++) p(k % 2 ? M.leaf : M.leaf2, new THREE.IcosahedronGeometry(0.3 + (k % 3) * 0.06, 1), (k + 0.5 - n / 2) * (w / n), 0.78 + (k % 2) * 0.1, ((k % 3) - 1) * d * 0.15);
}

/** Árvore de interior (tronco e copa), com a base em `y0`. */
function tree(put: Put, M: Mats, x: number, y0: number, z: number, s = 1) {
  put(M.woodDark, C(0.08 * s, 0.13 * s, 2.2 * s, 8), x, y0 + 1.1 * s, z);
  put(M.leaf, new THREE.IcosahedronGeometry(0.85 * s, 1), x, y0 + 2.4 * s, z);
  put(M.leaf2, new THREE.IcosahedronGeometry(0.6 * s, 1), x + 0.35 * s, y0 + 2.9 * s, z - 0.2 * s);
  put(M.leaf, new THREE.IcosahedronGeometry(0.5 * s, 1), x - 0.4 * s, y0 + 2.75 * s, z + 0.25 * s);
}

/** Árvore num canteiro redondo de pedra, com banco em volta. */
function treeBench(put: Put, M: Mats, x: number, z: number) {
  put(M.stone, C(1.42, 1.42, 0.41, 32), x, 0.205, z);
  put(M.wood, C(1.5, 1.5, 0.06, 32), x, 0.44, z);
  put(M.stone, C(0.95, 1.0, 0.9, 24), x, 0.45, z);
  put(M.woodDark, C(0.9, 0.9, 0.02, 24), x, 0.9, z);
  tree(put, M, x, 0.9, z, 1.3);
}

/** Estante (`w` ao longo de x local, livros virados para +z; `both`: dupla face). */
function shelf(put: Put, M: Mats, x: number, z: number, ry: number, w: number, h: number, seed: number, both = false) {
  const p = sub(put, x, z, ry);
  const d = both ? 0.6 : 0.4;
  p(M.wood, B(w, h, 0.03), 0, h / 2, both ? 0 : -d / 2 + 0.015);
  for (const s of [-1, 1]) p(M.wood, B(0.05, h, d), s * (w / 2 - 0.025), h / 2, 0);
  const rows = Math.max(1, Math.floor((h - 0.15) / 0.42));
  const step = (h - 0.1) / rows;
  for (let r = 0; r <= rows; r++) p(M.wood, B(w, 0.03, d), 0, 0.06 + r * step, 0);
  for (let r = 0; r < rows; r++) {
    for (const side of both ? [-1, 1] : [1]) {
      let bx = -w / 2 + 0.08;
      let k = 0;
      while (bx < w / 2 - 0.2) {
        const bw = 0.14 + ((seed + r * 5 + k * 3) % 4) * 0.06;
        const bh = Math.min(step - 0.06, 0.24 + ((seed + k * 7 + r) % 3) * 0.04);
        if (bx + bw > w / 2 - 0.08) break;
        p(M.books[(seed + r * 3 + k) % M.books.length]!, B(bw - 0.02, bh, d * 0.38), bx + bw / 2, 0.075 + r * step + bh / 2, side * (both ? d * 0.25 : d * 0.1));
        bx += bw + ((seed + k) % 5 === 0 ? 0.12 : 0.01);
        k++;
      }
    }
  }
}

/** Medalhão de pedra e madeira no piso do átrio (raio `r`). */
function medallion(put: Put, M: Mats, r: number) {
  put(M.stone, C(r, r, 0.012, 64), 0, 0.006, 0);
  put(M.wood, C(r - 0.35, r - 0.35, 0.012, 64), 0, 0.01, 0);
  put(M.stone, C(r - 0.6, r - 0.6, 0.012, 64), 0, 0.014, 0);
  const cm = (1.2 + r - 0.6) / 2;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    put(M.wood, B(0.12, 0.012, r - 1.8), Math.sin(a) * cm, 0.018, Math.cos(a) * cm, a);
  }
  put(M.acc, C(1.0, 1.0, 0.012, 32), 0, 0.022, 0);
}

/**
 * Balcão de recepção de frente para quem chega (+z): balcão alto e trecho baixo acessível, mesa de
 * trabalho atrás com duas cadeiras, luminária, planta e (opcional) o painel de ripas ao fundo.
 */
function receptionDesk(put: Put, M: Mats, body: THREE.Material, top: THREE.Material, panel: THREE.Material | null) {
  put(body, B(3.2, 1.05, 0.7), 0.2, 0.525, 0);
  put(top, B(3.3, 0.05, 0.85), 0.2, 1.075, 0.05);
  put(body, B(1.0, 0.78, 0.7), -1.9, 0.39, 0);
  put(top, B(1.05, 0.04, 0.85), -1.9, 0.8, 0.05);
  put(M.accGlow, B(4.0, 0.04, 0.02), -0.3, 0.16, 0.36);
  put(top, B(4.1, 0.04, 0.62), -0.3, 0.74, -0.72);
  for (const x of [-2.25, 1.65]) put(M.dark, B(0.05, 0.72, 0.55), x, 0.36, -0.72);
  for (const x of [-0.9, 0.7]) chair(put, M, x, -1.35, 0);
  deskLamp(put, M, 1.4, 1.1, -0.1);
  put(M.paper, B(0.3, 0.02, 0.22), -0.4, 1.11, 0.15, 0.2);
  plant(put, M, 2.25, 0.05, 0.8);
  if (panel) {
    put(panel, B(4.4, 3.0, 0.12), -0.2, 1.5, -2.3);
    for (let k = 0; k < 11; k++) put(M.woodDark, B(0.06, 3.0, 0.05), -2.2 + k * 0.4, 1.5, -2.22);
  }
}

/** Placa de ambiente (nome em i18n). */
const zoneSign = (kit: Kit, key: ZoneKey, accent: string, w = 2.6) => sectorSign(kit, zoneLabel(key), accent, w);

/** Placa sobre dois postes finos (totem do ambiente), na borda da área, fora da circulação. */
function totem(b: Builder, scene: THREE.Scene, M: Mats, sign: THREE.Object3D, w: number, x: number, z: number, face: number) {
  const put = frame(b, x, z, face);
  for (const s of [-1, 1]) {
    put(M.dark, C(0.035, 0.035, 2.8, 8), s * (w / 2 - 0.06), 1.4, 0);
    put(M.dark, C(0.12, 0.14, 0.04, 12), s * (w / 2 - 0.06), 0.02, 0);
  }
  scene.add(at(sign, x, 2.45, z, face));
}

/** Placa pendurada do teto (ou da laje da galeria, em `ceil`) por dois cabos. */
function hang(b: Builder, scene: THREE.Scene, M: Mats, sign: THREE.Object3D, w: number, x: number, y: number, z: number, face: number, ceil: number) {
  const put = frame(b, x, z, face);
  const top = y + w * 0.125;
  for (const s of [-1, 1]) put(M.dark, C(0.006, 0.006, ceil - top, 4), s * (w / 2 - 0.15), (ceil + top) / 2, 0);
  scene.add(at(sign, x, y, z, face));
}

/** Quadro de orientação: o título e a lista dos ambientes do térreo (os nomes reais das placas). */
function directory(kit: Kit, keys: readonly ZoneKey[], accent: string, w: number, h: number): THREE.Mesh {
  const p = canvasPlane(kit, w, h, 512, true);
  const ctx = p.ctx;
  const c = ctx.canvas;
  ctx.fillStyle = '#101B2E';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, c.width, 12);
  ctx.fillStyle = '#F1FAFF';
  ctx.font = '700 46px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(zoneLabel('orientation'), 30, 62, c.width - 60);
  const step = Math.min(56, (c.height - 130) / Math.max(1, keys.length));
  ctx.font = '500 30px Inter, system-ui, sans-serif';
  keys.forEach((k, i) => {
    const y = 130 + i * step + step / 2;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(42, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(241,250,255,0.92)';
    ctx.fillText(zoneLabel(k), 64, y, c.width - 90);
  });
  p.tex.needsUpdate = true;
  return p.mesh;
}

/** Painel informativo: o nome do ambiente, o da função que ele abre e um desenho simples (sem números). */
function infoBoard(kit: Kit, title: string, subtitle: string, accent: string, w: number, h: number, icon: 'grid' | 'ring'): THREE.Mesh {
  const p = canvasPlane(kit, w, h, 384, true);
  const ctx = p.ctx;
  const c = ctx.canvas;
  ctx.fillStyle = '#101B2E';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, c.width, 10);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#F1FAFF';
  ctx.font = '700 44px Inter, system-ui, sans-serif';
  ctx.fillText(title, 32, 30, c.width - 64);
  ctx.fillStyle = accent;
  ctx.font = '600 34px Inter, system-ui, sans-serif';
  ctx.fillText(subtitle, 32, 88, c.width - 64);
  ctx.strokeStyle = 'rgba(241,250,255,0.45)';
  ctx.lineWidth = 4;
  const x0 = 32;
  const y0 = 150;
  const ww = c.width - 64;
  const hh = c.height - 180;
  if (icon === 'grid') {
    // Folha de calendário em branco (desenho, sem datas).
    ctx.strokeRect(x0, y0, ww, hh);
    for (let i = 1; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + (ww * i) / 7, y0);
      ctx.lineTo(x0 + (ww * i) / 7, y0 + hh);
      ctx.stroke();
    }
    for (let j = 1; j < 4; j++) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + (hh * j) / 4);
      ctx.lineTo(x0 + ww, y0 + (hh * j) / 4);
      ctx.stroke();
    }
  } else {
    // Anéis concêntricos (o átrio circular visto de cima).
    const cx = x0 + ww / 2;
    const cy = y0 + hh / 2;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (hh / 2) * (k / 3), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  p.tex.needsUpdate = true;
  return p.mesh;
}

interface SignSpot {
  x: number;
  y: number;
  z: number;
  ry?: number;
  w?: number;
}

/**
 * Estação de um setor: grupo no lugar `p` (virado para `face`), peças em coordenadas próprias,
 * placa com o nome do setor (`sign`) e objetos extras (quadros, placas de ambiente); tudo marcado
 * com o setor, para o toque abrir o painel real.
 */
function station(kit: Kit, scene: THREE.Scene, id: string, label: string, accent: string, p: Placed, build: (put: Put) => void, sign: SignSpot | null, extras: THREE.Object3D[] = []): THREE.Group {
  const g = sectorGroup(id, p.x, p.z, p.face);
  const sb = new Builder();
  build(frame(sb, 0, 0, 0));
  g.add(sb.build());
  if (extras.length) g.add(...extras);
  if (sign) g.add(at(sectorSign(kit, label, accent, sign.w ?? 2.2), sign.x, sign.y, sign.z, sign.ry ?? 0));
  markSector(g, id);
  scene.add(g);
  return g;
}

/** Obstáculos de colisão de uma peça retangular (w × d local, centro em lx, lz do ambiente `p`). */
function solid(list: Obstacle[], p: Placed, lx: number, lz: number, w: number, d: number, h: number) {
  const long = Math.max(w, d);
  const short = Math.min(w, d);
  const n = Math.max(1, Math.round(long / short));
  const r = Math.max(short / 2, long / (2 * n)) * 1.05;
  for (let i = 0; i < n; i++) {
    const off = (i + 0.5 - n / 2) * (long / n);
    const [x, z] = toWorld(p, lx + (w >= d ? off : 0), lz + (w >= d ? 0 : off));
    list.push({ x, z, r, h });
  }
}

/** Vista de um ambiente: um pouco recuada na direção de quem chega, na altura dos olhos. */
const look = (p: Placed, back = 7, h = 3.6) => sectorView(p.x, p.z, p.face, back, h);

/* =====================================================================
 * LIBRARY — Biblioteca Digital (seção 16). Átrio de pé-direito duplo no centro, recepção e
 * orientação junto ao pórtico, catálogo e pesquisa de um lado do átrio, novos e recomendados do
 * outro, leitura informal nas alas envidraçadas; preservação e transferência nos fundos.
 * ===================================================================== */
export const LIBRARY_SECTORS = ['atrium', 'collections', 'consult', 'search', 'preserve', 'transfer'] as const;
export type LibrarySector = (typeof LIBRARY_SECTORS)[number];

export function createLibraryInterior(kit: Kit, labels: Record<LibrarySector, string>): InteriorScene {
  const accent = '#34D399';
  const room = createRoom(kit, { id: 'library', floor: '#EFEAE0', glass: '#D3EAF2', frame: '#D8D1C2', accent });
  const { scene, b } = room;
  const H = room.spec.height;
  const M = palette(kit, accent, { stone: '#ECE7DC', wood: '#A97C55', fabric: '#3F6B5C', fabric2: '#E3D3B5', rug: '#B9A27E' });
  const silver = kit.mat('#CBD5E1', { metal: 0.85, rough: 0.25 });
  const put = frame(b, 0, 0, 0);
  const obstacles: Obstacle[] = [];
  // Duas galerias (a meia altura do átrio de pé-direito alto) com guarda-corpo de vidro e estantes
  // contínuas junto às paredes do bloco principal (a laje segue a planta do prédio).
  const shelves = wallSpots(room, 24, 1.2, () => false, room.main);
  for (const y of [4.7, 9.4]) {
    b.add(M.stone, gallerySlab(room, y, 8.5));
    b.add(kit.mat('#CFF3EA', { glass: true }), new THREE.CylinderGeometry(8.5, 8.5, 1.1, 8, 1, true), [0, y + 0.55, 0], [0, Math.PI / 8, 0]);
    b.add(silver, new THREE.TorusGeometry(8.6, 0.05, 4, 8), [0, y + 1.1, 0], [-Math.PI / 2, 0, Math.PI / 8]);
    shelves.forEach(({ x, z, face: a }, i) => {
      b.add(M.wood, new THREE.BoxGeometry(3.2, 3.6, 0.5), [x, y + 2, z], [0, a, 0]);
      for (let k = 0; k < 4; k++) b.add(kit.mat(['#34D399', '#60A5FA', '#F59E0B', '#F472B6'][(i + k) % 4]!, { rough: 0.6 }), new THREE.BoxGeometry(2.8, 0.5, 0.2), [x - Math.sin(a) * 0.25, y + 0.6 + k * 0.85, z - Math.cos(a) * 0.25], [0, a, 0]);
    });
  }
  // Laje da galeria por baixo (onde pendem as luminárias e as placas das áreas sob ela).
  const under = 4.7 - 0.25;
  // Escada helicoidal que sobe às galerias (a do desenho de sempre, ao lado do átrio).
  for (let k = 0; k < 28; k++) {
    const a = k * 0.42;
    b.add(M.stone, new THREE.BoxGeometry(2.4, 0.18, 0.9), [7 + Math.sin(a) * 1.6, 0.3 + k * 0.33, -7 + Math.cos(a) * 1.6], [0, a, 0]);
  }
  b.add(M.dark, new THREE.CylinderGeometry(0.16, 0.16, 9.6, 12), [7, 4.8, -7]);
  totem(b, scene, M, zoneSign(kit, 'stairs', accent, 2.2), 2.2, 10.4, -4.0, 0);
  obstacles.push({ x: 7, z: -7, r: 2.2, h: H });

  // Átrio: medalhão no piso sob o vazio de três níveis, duas árvores com banco em volta e pendentes.
  medallion(put, M, 5.4);
  for (const sx of [-1, 1]) {
    treeBench(put, M, sx * 4.6, 4.8);
    obstacles.push({ x: sx * 4.6, z: 4.8, r: 1.55, h: 4 });
  }
  pendants(kit, b, [[-3, 3], [3, 3], [0, -4]], 11.5, H, '#E8FFF6');
  totem(b, scene, M, zoneSign(kit, 'atrium', accent, 2.2), 2.2, -3.4, 7.4, 0);
  // Pórtico: vasos dos dois lados e o caminho de pedra até o átrio.
  for (const sx of [-1, 1]) plant(put, M, sx * 4.6, 17.6, 1.1);
  put(M.wood, B(2.6, 0.012, 13.8), 0, 0.008, 12.3);

  const P: Record<LibrarySector, Placed> = {
    atrium: { x: 5, z: 12.6, face: 0 },
    search: { x: -10, z: -2.6, face: Math.PI / 2 },
    consult: { x: -11.5, z: 4.2, face: Math.PI / 2 },
    collections: { x: 10.6, z: 0.6, face: -Math.PI / 2 },
    preserve: { x: -11, z: -12, face: 0 },
    transfer: { x: 11.5, z: -12, face: 0 },
  };
  const groups: THREE.Group[] = [];

  // Recepção (setor do Grande Átrio: a biblioteca inteira), logo depois do pórtico.
  groups.push(station(kit, scene, 'atrium', labels.atrium, accent, P.atrium, (p) => receptionDesk(p, M, M.stone, M.wood, M.wood), { x: 0.2, y: 0.62, z: 0.37 }, [at(zoneSign(kit, 'reception', accent), -0.2, 2.75, -2.22)]));
  solid(obstacles, P.atrium, -0.3, 0, 4.2, 0.9, 1.1);
  pendant(sub(put, P.atrium.x, P.atrium.z, 0), M, -1, 0.1, under, 3.2);
  pendant(sub(put, P.atrium.x, P.atrium.z, 0), M, 1.2, 0.1, under, 3.2);

  // Orientação: totem de pedra com a lista dos ambientes do térreo, bancos e vasos.
  {
    const o: Placed = { x: -5, z: 12.6, face: 0 };
    const p = sub(put, o.x, o.z, o.face);
    p(M.stone, B(2.4, 2.9, 0.35), 0, 1.45, -0.2);
    p(M.wood, B(2.5, 0.08, 0.45), 0, 2.94, -0.2);
    const [dx, dz] = toWorld(o, 0, -0.01);
    scene.add(at(directory(kit, ['reception', 'orientation', 'atrium', 'catalog', 'newMaterials', 'casualReading', 'stairs', 'lifts'], accent, 2.0, 2.4), dx, 1.55, dz));
    for (const sx of [-1, 1]) plant(p, M, sx * 1.75, -0.2, 0.85);
    p(M.wood, B(1.8, 0.08, 0.45), 0, 0.45, 1.3);
    for (const sx of [-1, 1]) p(M.dark, B(0.08, 0.42, 0.4), sx * 0.75, 0.21, 1.3);
    const [sx0, sz0] = toWorld(o, 0, -0.2);
    scene.add(at(zoneSign(kit, 'orientation', accent, 2.4), sx0, 3.35, sz0));
    solid(obstacles, o, 0, -0.2, 2.4, 0.4, 2.9);
  }

  // Catálogo e pesquisa: terminais de consulta ao catálogo (Sala de Pesquisa), a mesa de consulta
  // com luminárias verdes (Centro de Consulta) e duas estantes de dupla face.
  groups.push(
    station(kit, scene, 'search', labels.search, accent, P.search, (p) => {
      for (const lx of [-1.4, 0, 1.4]) {
        p(M.stone, B(0.5, 1.0, 0.4), lx, 0.5, 0);
        p(M.wood, B(0.7, 0.04, 0.5), lx, 1.02, 0);
        p(M.dark, B(0.62, 0.42, 0.04), lx, 1.3, -0.1, 0, -0.35);
        p(M.accGlow, B(0.54, 0.34, 0.01), lx, 1.3, -0.075, 0, -0.35);
      }
      shelf(p, M, 0, -1.0, 0, 4.2, 1.25, 3);
    }, { x: 0, y: 1.75, z: -1.0 }),
  );
  solid(obstacles, P.search, 0, -0.5, 4.2, 1.4, 1.3);
  groups.push(
    station(kit, scene, 'consult', labels.consult, accent, P.consult, (p) => {
      rug(p, M.rug, 0, 0, 4.6, 3.0);
      longTable(p, M, 0, 0, 3.6, 1.2, 3);
      for (const lx of [-1.2, 0, 1.2]) deskLamp(p, M, lx, 0.78, 0, kit.mat('#2F7D57', { rough: 0.4 }));
      for (const sx of [-1, 1]) p(M.dark, C(0.006, 0.006, under - 2.78, 4), sx * 0.9, (under + 2.78) / 2, 0);
    }, { x: 0, y: 2.5, z: 0 }),
  );
  solid(obstacles, P.consult, 0, 0, 3.6, 1.2, 0.8);
  for (const z of [-6.8, 8.0]) {
    shelf(put, M, -12.5, z, 0, 4.4, 2.3, Math.round(z * 3 + 20), true);
    solid(obstacles, { x: -12.5, z, face: 0 }, 0, 0, 4.4, 0.6, 2.3);
  }
  totem(b, scene, M, zoneSign(kit, 'catalog', accent, 2.4), 2.4, -8.4, 1.0, Math.PI / 2);
  for (const z of [-2.6, 4.2]) pendant(put, M, -10.6, z, under, 3.2);

  // Novos e recomendados (Galeria de Coleções): mesa-vitrine com capas de frente, dois expositores
  // em A e a parede de capas ao fundo.
  groups.push(
    station(kit, scene, 'collections', labels.collections, accent, P.collections, (p) => {
      p(M.wood, B(3.0, 0.75, 1.2), 0, 0.375, 0);
      p(M.stone, B(3.1, 0.04, 1.3), 0, 0.77, 0);
      for (let k = 0; k < 6; k++) {
        const back = k % 2 === 1;
        p(M.books[k % M.books.length]!, B(0.34, 0.46, 0.04), -1.2 + k * 0.48, 1.0, back ? -0.22 : 0.22, back ? Math.PI : 0, -0.3);
      }
      for (const sx of [-1, 1]) {
        p(M.wood, B(0.9, 1.25, 0.05), sx * 2.4, 0.6, 0.16, 0, -0.25);
        p(M.wood, B(0.9, 1.25, 0.05), sx * 2.4, 0.6, -0.16, 0, 0.25);
        for (let k = 0; k < 2; k++) p(M.books[(k + (sx > 0 ? 2 : 4)) % M.books.length]!, B(0.3, 0.42, 0.03), sx * 2.4 + (k - 0.5) * 0.4, 0.75, 0.24, 0, -0.25);
      }
      p(M.wood, B(4.4, 2.2, 0.3), 0, 1.1, -2.2);
      for (let r = 0; r < 4; r++) {
        p(M.stone, B(4.2, 0.04, 0.2), 0, 0.4 + r * 0.46, -1.96);
        for (let k = 0; k < 6; k++) p(M.books[(r + k) % M.books.length]!, B(0.34, 0.42, 0.03), -1.75 + k * 0.7, 0.63 + r * 0.46, -1.98, 0, -0.12);
      }
      plant(p, M, 2.6, -2.0, 0.8);
    }, { x: 0, y: 2.6, z: -2.2 }, [at(zoneSign(kit, 'newMaterials', accent, 2.8), 0, 3.3, -2.2)]),
  );
  solid(obstacles, P.collections, 0, 0, 3.1, 1.3, 1);
  solid(obstacles, P.collections, 0, -2.2, 4.4, 0.4, 2.2);
  for (const sx of [-1, 1]) solid(obstacles, P.collections, sx * 2.4, 0, 0.9, 0.5, 1.2);
  pendant(put, M, 10.6, 0.6, under, 3.3);

  // Leitura informal junto às janelas das alas: poltronas viradas para fora, mesinhas, luminárias
  // e tapete comprido (a placa fica na ala oeste).
  for (const sx of [-1, 1]) {
    const x = sx * 20.3;
    rug(put, M.rug, x, 0, 2.8, 12);
    for (const z of [-5.4, -1.8, 1.8, 5.4]) armchair(put, M, x, z, sx * Math.PI / 2, sx > 0 ? M.fabric : M.fabric2);
    for (const z of [-3.6, 0, 3.6]) lowTable(put, M, x, z, 0.3);
    for (const z of [-6.6, 6.6]) standLamp(put, M, x + sx * 0.6, z);
  }
  totem(b, scene, M, zoneSign(kit, 'casualReading', accent, 2.4), 2.4, -17.9, 6.7, 0);

  // Fundos: Arquivo de Preservação (vitrines de arquivo) e Centro de Transferência (balcão e caixas).
  groups.push(
    station(kit, scene, 'preserve', labels.preserve, accent, P.preserve, (p) => {
      for (const lx of [-1.4, 0, 1.4]) {
        p(M.stone, B(1.1, 0.8, 0.8), lx, 0.4, 0);
        p(M.glass, B(1.0, 1.0, 0.7), lx, 1.3, 0);
        p(M.wood, B(1.1, 0.06, 0.8), lx, 1.83, 0);
        for (let k = 0; k < 3; k++) p(kit.mat(['#D9C7A6', '#C9B48E', '#B8A27A'][k]!, { rough: 0.85 }), B(0.26, 0.28, 0.4), lx - 0.3 + k * 0.3, 0.95, 0);
      }
      p(M.wood, B(4.4, 1.0, 0.5), 0, 0.5, -1.1);
      for (let r = 0; r < 3; r++) p(M.dark, B(4.3, 0.015, 0.01), 0, 0.25 + r * 0.3, -0.845);
    }, { x: 0, y: 2.5, z: -1.1 }),
  );
  solid(obstacles, P.preserve, 0, -0.5, 4.4, 1.6, 1.9);
  groups.push(
    station(kit, scene, 'transfer', labels.transfer, accent, P.transfer, (p) => {
      p(M.stone, B(3.6, 1.0, 0.9), 0, 0.5, 0);
      p(M.dark, B(2.6, 0.06, 0.5), 0, 1.03, 0);
      for (let k = 0; k < 3; k++) p(kit.mat('#D9C7A6', { rough: 0.8 }), B(0.45, 0.3, 0.35), -0.9 + k * 0.9, 1.22, 0);
      p(M.metal, B(0.9, 0.06, 0.6), 2.5, 0.25, 0.4);
      for (const [a, c] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]] as const) p(M.dark, C(0.05, 0.05, 0.04, 8), 2.5 + a, 0.05, 0.4 + c);
      p(M.metal, B(0.04, 0.9, 0.5), 2.95, 0.7, 0.4);
      for (let k = 0; k < 2; k++) p(kit.mat('#C9B48E', { rough: 0.8 }), B(0.5, 0.35, 0.4), 2.45, 0.46 + k * 0.36, 0.4);
    }, { x: 0, y: 2.4, z: -0.3 }),
  );
  solid(obstacles, P.transfer, 0.4, 0.15, 4.4, 1.2, 1.2);

  finishRoom(room);
  // Entrada: no fundo do átrio vazado, vendo os três níveis de galerias (sem ficar sob um mezanino).
  const overview = { cam: new THREE.Vector3(0, 3.4, 7.6), target: new THREE.Vector3(0, 4.5, -8) };
  return {
    scene,
    sectors: LIBRARY_SECTORS,
    pickables: groups,
    room: room.spec,
    obstacles,
    view: (id) => {
      if (id === 'atrium') return { cam: new THREE.Vector3(0, 7, 13), target: new THREE.Vector3(0, 2, 0) };
      const p = (P as Record<string, Placed | undefined>)[id];
      return p ? look(p) : overview;
    },
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * NOTES — Ateliê de Conhecimento (seção 15). Recepção e estação de captura rápida na entrada,
 * espaço de ideias com os quadros de cortiça, salas de concentração na ala baixa a oeste e o
 * estúdio de escrita (a grande mesa criativa) no ateliê com claraboias a leste.
 * ===================================================================== */
export const NOTES_SECTORS = ['reception', 'writing', 'advanced', 'handwriting', 'organize', 'versions'] as const;
export type NotesSector = (typeof NOTES_SECTORS)[number];

export function createNotesInterior(kit: Kit, labels: Record<NotesSector, string>): InteriorScene {
  const accent = '#8B7CF6';
  const room = createRoom(kit, { id: 'notes', floor: '#EADFCB', glass: '#DCEBF2', frame: '#8A6240', accent });
  const { scene, b } = room;
  const H = room.spec.height;
  const M = palette(kit, accent, { stone: '#D6D2CA', wood: '#B8875A', fabric: '#5E5A7A', fabric2: '#E8DCC6', rug: '#CDBFA8' });
  const cork = kit.mat('#C79A6B', { rough: 0.95 });
  const notes = ['#FDE68A', '#A78BFA', '#93C5FD', '#86EFAC', '#FCA5A5'].map((c) => kit.mat(c, { rough: 0.7 }));
  const put = frame(b, 0, 0, 0);
  const obstacles: Obstacle[] = [];
  // Luz das claraboias em dente de serra do ateliê (a ala térrea do leste; o corpo central tem o 1º andar em cima).
  for (let k = 0; k < 4; k++) b.add(kit.mat('#CDEFFB', { glass: true }), new THREE.BoxGeometry(10, 0.1, 1.6), [17, H - 0.33, -7 + k * 4.4]);
  // Faixa de madeira no piso, da porta ao saguão dos elevadores.
  put(M.wood, B(2.4, 0.012, 18), 0, 0.008, 4);
  for (const sx of [-1, 1]) plant(put, M, sx * 10.5, 11.5, 1.1);

  const P: Record<NotesSector, Placed> = {
    reception: { x: 5, z: 8.8, face: 0 },
    writing: { x: 16, z: -1, face: -Math.PI / 2 },
    advanced: { x: 20.8, z: -1, face: -Math.PI / 2 },
    handwriting: { x: -16.5, z: 0, face: Math.PI / 2 },
    organize: { x: -7.6, z: 1.5, face: Math.PI / 2 },
    versions: { x: 8.6, z: -6.6, face: -Math.PI / 2 },
  };
  const groups: THREE.Group[] = [];

  // Recepção de Cadernos (notas recentes), à direita de quem entra.
  groups.push(station(kit, scene, 'reception', labels.reception, accent, P.reception, (p) => receptionDesk(p, M, M.wood, M.stone, M.wood), { x: 0.2, y: 0.62, z: 0.37 }, [at(zoneSign(kit, 'reception', accent), -0.2, 2.75, -2.22)]));
  solid(obstacles, P.reception, -0.3, 0, 4.2, 0.9, 1.1);

  // Estação de captura rápida, à esquerda de quem entra: balcão de pé com dois apoios de tela
  // (a página em branco), blocos e canetas, e as banquetas. Abre o editor rápido (Estúdio de Escrita).
  const capture: Placed = { x: -5, z: 9.2, face: 0 };
  groups.push(
    station(kit, scene, 'writing', labels.writing, accent, capture, (p) => {
      p(M.wood, B(2.6, 1.05, 0.6), 0, 0.525, 0);
      p(M.stone, B(2.7, 0.05, 0.75), 0, 1.075, 0.05);
      p(M.accGlow, B(2.4, 0.04, 0.02), 0, 0.2, 0.31);
      for (const sx of [-1, 1]) {
        p(M.dark, B(0.4, 0.3, 0.03), sx * 0.65, 1.28, 0.02, 0, -0.5);
        p(M.page, B(0.34, 0.24, 0.01), sx * 0.65, 1.28, 0.04, 0, -0.5);
        stool(p, M, sx * 0.65, 0.75);
      }
      for (let k = 0; k < 3; k++) p(notes[k]!, B(0.2, 0.012, 0.2), -0.1 + k * 0.05, 1.11 + k * 0.012, 0.12, k * 0.3);
      p(M.dark, C(0.05, 0.05, 0.12, 10), 0.15, 1.16, -0.15);
      for (const sx of [-1, 1]) p(M.dark, C(0.02, 0.02, 1.85, 6), sx * 1.2, 2.0, -0.2);
    }, null, [at(zoneSign(kit, 'capture', accent, 2.3), 0, 2.75, -0.2)]),
  );
  solid(obstacles, capture, 0, 0, 2.7, 0.75, 1.1);

  // Espaço de ideias (Sala de Organização): dois quadros de cortiça em V cheios de lembretes, mesa
  // redonda com cadeiras e lembretes soltos, vasos e tapete.
  groups.push(
    station(kit, scene, 'organize', labels.organize, accent, P.organize, (p) => {
      rug(p, M.rug, 0, 0.4, 5.6, 3.6);
      for (const s of [-1, 1]) {
        const q = sub(p, s * 1.55, -1.2, -s * 0.25);
        q(M.wood, B(3.0, 2.3, 0.08), 0, 1.45, 0);
        q(cork, B(2.8, 2.1, 0.02), 0, 1.45, 0.05);
        for (const sx of [-1, 1]) q(M.dark, B(0.06, 0.3, 0.5), sx * 1.35, 0.15, 0);
        for (let k = 0; k < 15; k++) q(notes[(k + (s > 0 ? 2 : 0)) % notes.length]!, B(0.3, 0.3, 0.012), -1.1 + (k % 5) * 0.55, 0.8 + Math.floor(k / 5) * 0.6, 0.066, (k % 3) * 0.06 - 0.06);
      }
      roundTable(p, M, 0, 1.0, 4, 0.6);
      for (let k = 0; k < 4; k++) p(notes[k]!, B(0.18, 0.01, 0.18), -0.25 + k * 0.17, 0.785, 0.9 + (k % 2) * 0.2, k * 0.4);
      for (const sx of [-1, 1]) plant(p, M, sx * 3.0, -0.8, 0.9);
    }, { x: 1.55, y: 2.95, z: -1.2, ry: -0.25, w: 2.4 }, [at(zoneSign(kit, 'ideas', accent, 2.4), -1.55, 2.95, -1.2, 0.25)]),
  );
  for (const s of [-1, 1]) solid(obstacles, P.organize, s * 1.55, -1.2, 3.0, 0.5, 2.3);
  for (let k = 0; k < 2; k++) pendant(put, M, -6.6, 0.8 + k * 1.4, H, 3.0);

  // Salas de concentração (Ateliê Manuscrito): três cabines de vidro na ala baixa a oeste, cada uma
  // com a prancheta inclinada, cadeira, luminária, prateleira e tapete; vão de porta aberto.
  groups.push(
    station(kit, scene, 'handwriting', labels.handwriting, accent, P.handwriting, (p) => {
      const z0 = -4.55;
      const z1 = -0.8;
      const d = z1 - z0;
      for (const x of [-5.65, -1.9, 1.9, 5.65]) p(M.fabric2, B(0.1, 2.8, d), x, 1.4, (z0 + z1) / 2);
      for (const cx of [-3.8, 0, 3.8]) {
        p(M.wood, B(3.7, 2.8, 0.08), cx, 1.4, z0);
        for (const sx of [-1, 1]) p(M.glass, B(1.33, 2.3, 0.03), cx + sx * 1.175, 1.15, z1);
        p(M.glass, B(3.7, 0.5, 0.03), cx, 2.55, z1);
        p(M.wood, B(3.7, 0.12, 0.12), cx, 2.86, z1);
        rug(p, M.rug, cx, (z0 + z1) / 2, 2.6, 2.6);
        p(M.wood, B(1.4, 0.05, 0.9), cx, 0.92, -3.55, 0, 0.3);
        for (const sx of [-1, 1]) p(M.dark, B(0.05, 0.86, 0.05), cx + sx * 0.6, 0.43, -3.55);
        chair(p, M, cx, -2.55, Math.PI);
        deskLamp(p, M, cx + 1.3, 0.95, -4.2);
        p(M.wood, B(0.6, 0.95, 0.4), cx + 1.3, 0.475, -4.2);
        p(M.wood, B(1.2, 0.04, 0.25), cx - 0.8, 1.7, -4.4);
        for (let k = 0; k < 4; k++) p(M.books[k]!, B(0.12, 0.26, 0.18), cx - 1.2 + k * 0.16, 1.85, -4.4);
        pendant(p, M, cx, (z0 + z1) / 2, 5, 2.45);
      }
    }, { x: 3.8, y: 3.3, z: -0.75, w: 2.2 }, [at(zoneSign(kit, 'quietRooms', accent, 2.6), 0, 3.3, -0.75)]),
  );
  for (const lx of [-5.65, -1.9, 1.9, 5.65]) solid(obstacles, P.handwriting, lx, -2.675, 0.2, 3.75, 2.8);
  for (const cx of [-3.8, 0, 3.8]) for (const sx of [-1, 1]) solid(obstacles, P.handwriting, cx + sx * 1.175, -0.8, 1.33, 0.2, 2.3);

  // Estúdio de escrita: a grande mesa criativa (12 m) sob as claraboias, com banquetas, folhas de
  // luz e pendentes; a placa do setor pende sobre o meio da mesa.
  groups.push(
    station(kit, scene, 'writing', labels.writing, accent, P.writing, (p) => {
      p(M.wood, B(12, 0.16, 3), 0, 0.95, 0);
      for (const x of [-5.4, 0, 5.4]) p(M.wood, B(0.4, 0.95, 2.6), x, 0.47, 0);
      for (let k = 0; k < 9; k++) p(M.paper, B(0.9, 0.02, 1.2), -4.8 + k * 1.2, 1.05, ((k % 3) - 1) * 0.7, k * 0.2);
      for (let k = 0; k < 5; k++) for (const s of [-1, 1]) stool(p, M, -4.8 + k * 2.4, s * 1.9, 0.75);
      for (const x of [-4.5, -1.5, 1.5, 4.5]) pendant(p, M, x, 0, H, 3.4);
      for (const sx of [-1, 1]) p(M.dark, C(0.006, 0.006, H - 3.17, 4), sx * 0.9, (H + 3.17) / 2, 0);
    }, { x: 0, y: 2.9, z: 0 }),
  );
  solid(obstacles, P.writing, 0, 0, 12, 3, 1);
  totem(b, scene, M, zoneSign(kit, 'writingStudio', accent, 2.4), 2.4, 16, 6.6, 0);

  // Oficina de Edição: bancada com três telas junto à parede leste do ateliê.
  groups.push(
    station(kit, scene, 'advanced', labels.advanced, accent, P.advanced, (p) => {
      for (const lx of [-2, 0, 2]) {
        p(M.wood, B(1.7, 0.05, 0.8), lx, 0.75, 0);
        for (const sx of [-1, 1]) p(M.dark, B(0.05, 0.73, 0.7), lx + sx * 0.8, 0.365, 0);
        p(M.dark, B(0.05, 0.25, 0.05), lx, 0.9, -0.25);
        p(M.dark, B(0.62, 0.4, 0.03), lx, 1.18, -0.25);
        p(M.accGlow, B(0.56, 0.34, 0.01), lx, 1.18, -0.232);
        chair(p, M, lx, 0.75, Math.PI, M.fabric);
      }
      plant(p, M, 3.4, -0.1, 0.85);
    }, { x: 0, y: 2.1, z: -0.3 }),
  );
  solid(obstacles, P.advanced, 0, 0, 5.7, 0.8, 1.2);

  // Arquivo de Versões: armários de gavetas com caixas, no fundo do salão.
  groups.push(
    station(kit, scene, 'versions', labels.versions, accent, P.versions, (p) => {
      for (const lx of [-1.05, 0, 1.05]) {
        p(M.woodDark, B(0.95, 1.7, 0.7), lx, 0.85, -0.35);
        for (let r = 0; r < 4; r++) {
          p(M.dark, B(0.85, 0.015, 0.01), lx, 0.3 + r * 0.42, 0.005);
          p(M.metal, B(0.2, 0.03, 0.03), lx, 0.5 + r * 0.42, 0.02);
        }
        p(kit.mat('#D9C7A6', { rough: 0.85 }), B(0.4, 0.25, 0.35), lx - 0.15, 1.83, -0.35);
      }
    }, { x: 0, y: 2.25, z: -0.35 }),
  );
  solid(obstacles, P.versions, 0, -0.35, 3.1, 0.7, 1.7);

  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 5.5, 11.5), target: new THREE.Vector3(0, 1, -2) };
  return {
    scene,
    sectors: NOTES_SECTORS,
    pickables: groups,
    room: room.spec,
    obstacles,
    view: (id) => {
      if (id === 'reception') return { cam: new THREE.Vector3(1.2, 3.4, 12.0), target: new THREE.Vector3(5, 1.2, 8.6) };
      const p = (P as Record<string, Placed | undefined>)[id];
      return p ? look(p) : overview;
    },
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * ACADEMY — Centro de Aprendizagem (seção 13). Recepção e orientação logo depois da entrada
 * monumental, átrio central com o painel informativo, convivência em volta do átrio e nas alas,
 * e o caminho livre até o saguão dos elevadores nos fundos.
 * ===================================================================== */
export const ACADEMY_SECTORS = ['hall', 'rooms', 'review', 'plan'] as const;
export type AcademySector = (typeof ACADEMY_SECTORS)[number];
export interface AcademyData {
  /** Nomes das disciplinas do ano atual (uma sala para cada). */
  subjects: string[];
}

export function createAcademyInterior(kit: Kit, labels: Record<AcademySector, string>): InteriorScene {
  const accent = '#A5B4FC';
  const room = createRoom(kit, { id: 'academy', floor: '#EEF0F8', glass: '#C7D2FE', frame: '#6366F1', accent });
  const { scene, b } = room;
  const H = room.spec.height;
  const M = palette(kit, '#6366F1', { stone: '#ECE6DA', wood: '#B08458', fabric: '#4F5D8C', fabric2: '#D9CBB0', rug: '#CDBFA8' });
  const put = frame(b, 0, 0, 0);
  const obstacles: Obstacle[] = [];
  // Galeria do mezanino (segue a planta do bloco do átrio) com guarda-corpo de vidro e corrimão de madeira.
  const gallery = 5;
  const under = gallery - 0.25;
  b.add(M.stone, gallerySlab(room, gallery, 10));
  b.add(kit.mat('#C7D2FE', { glass: true }), new THREE.CylinderGeometry(10, 10, 1, 48, 1, true), [0, gallery + 0.55, 0]);
  b.add(M.wood, new THREE.TorusGeometry(10, 0.05, 6, 64), [0, gallery + 1.05, 0], [Math.PI / 2, 0, 0]);
  // Átrio: medalhão de pedra e madeira sob o vazio que sobe até a claraboia, e o caminho de pedra
  // desde a entrada monumental.
  medallion(put, M, 6.4);
  put(M.stone, B(2.8, 0.012, 13.6), 0, 0.006, 13.2);
  pendants(kit, b, [[-4, 2], [4, 2], [0, -5]], 7.5, H, '#EEF2FF');
  // Pórtico: floreiras dos dois lados da entrada.
  for (const sx of [-1, 1]) {
    planter(put, M, sx * 4.8, 16.6, 2.6, 1.4, Math.PI / 2);
    solid(obstacles, { x: sx * 4.8, z: 16.6, face: Math.PI / 2 }, 0, 0, 2.6, 1.4, 0.6);
  }

  const P: Record<AcademySector, Placed> = {
    hall: { x: 6.5, z: 11.2, face: 0 },
    rooms: { x: -6.5, z: 11.2, face: 0 },
    plan: { x: -4.4, z: -0.6, face: 0 },
    review: { x: 11, z: 1, face: -Math.PI / 2 },
  };
  const groups: THREE.Group[] = [];

  // Recepção (Saguão de Estudos), à direita de quem entra.
  groups.push(station(kit, scene, 'hall', labels.hall, accent, P.hall, (p) => receptionDesk(p, M, M.stone, M.wood, M.wood), { x: 0.2, y: 0.62, z: 0.37 }, [at(zoneSign(kit, 'reception', accent), -0.2, 2.75, -2.22)]));
  solid(obstacles, P.hall, -0.3, 0, 4.2, 0.9, 1.1);
  for (const x of [5.4, 7.6]) pendant(put, M, x, 11.3, under, 3.3);

  // Orientação (Salas das Disciplinas): parede de pedra com a lista dos ambientes do térreo e as
  // placas das salas, cada uma com o nome de uma disciplina real (1º andar).
  const boards: Array<ReturnType<typeof nameBoard>> = [];
  const roomsExtras: THREE.Object3D[] = [
    at(directory(kit, ['reception', 'orientation', 'atrium', 'infoPanel', 'lounge', 'lifts'], accent, 1.8, 2.2), -1.45, 1.75, -0.2),
    at(zoneSign(kit, 'orientation', accent, 2.2), -1.45, 3.8, -0.4),
  ];
  for (let i = 0; i < 8; i++) {
    const bd = nameBoard(kit, 1.3, accent);
    roomsExtras.push(at(bd.mesh, i % 2 ? 1.95 : 0.55, 2.55 - Math.floor(i / 2) * 0.48, -0.2));
    boards.push(bd);
  }
  groups.push(
    station(kit, scene, 'rooms', labels.rooms, accent, P.rooms, (p) => {
      p(M.stone, B(5, 3.4, 0.35), 0, 1.7, -0.4);
      p(M.wood, B(5.1, 0.08, 0.45), 0, 3.44, -0.4);
      p(M.stone, B(5.2, 0.12, 0.6), 0, 0.06, -0.4);
      for (const sx of [-1, 1]) plant(p, M, sx * 2.9, -0.3, 0.8);
    }, { x: 1.25, y: 3.8, z: -0.4 }, roomsExtras),
  );
  solid(obstacles, P.rooms, 0, -0.4, 5, 0.35, 3.4);
  for (const x of [-7.6, -5.4]) pendant(put, M, x, 10.6, under, 3.3);

  // Painel informativo do átrio (Plano de Estudos).
  groups.push(
    station(kit, scene, 'plan', labels.plan, accent, P.plan, (p) => {
      p(M.stone, B(3.4, 0.35, 0.7), 0, 0.175, 0);
      for (const sx of [-1, 1]) p(M.wood, B(0.14, 2.9, 0.14), sx * 1.6, 1.6, 0);
      p(M.dark, B(3.3, 2.1, 0.1), 0, 1.95, 0);
      p(M.wood, B(3.5, 0.1, 0.25), 0, 3.1, 0);
    }, null, [at(infoBoard(kit, zoneLabel('infoPanel'), labels.plan, accent, 3.1, 1.9, 'grid'), 0, 1.95, 0.06)]),
  );
  solid(obstacles, P.plan, 0, 0, 3.4, 0.7, 3);
  // Do outro lado do átrio, a árvore com banco em volta e a placa do átrio.
  treeBench(put, M, 4.4, -0.6);
  obstacles.push({ x: 4.4, z: -0.6, r: 1.55, h: 4 });
  totem(b, scene, M, zoneSign(kit, 'atrium', accent, 2.2), 2.2, 3.4, 5.6, 0);

  // Área de convivência em volta do átrio: sala de estar a oeste (sofá, poltronas, mesinha, tapete,
  // vasos, pendentes) e, na ala oeste, mesas de café.
  {
    const p = sub(put, -11.2, 1, Math.PI / 2);
    rug(p, M.rug, 0, 0, 4.4, 3.4);
    sofa(p, M, 0, -1.15, 0, 2.4);
    for (const s of [-1, 1]) armchair(p, M, s * 1.55, 0.9, Math.atan2(-s * 1.55, -1.1), M.fabric2);
    lowTable(p, M, 0, -0.1, 0.55);
    for (const s of [-1, 1]) plant(p, M, s * 2.6, -1.2, 0.9);
    solid(obstacles, { x: -11.2, z: 1, face: Math.PI / 2 }, 0, -1.15, 2.4, 0.9, 0.8);
    for (const z of [0, 2]) pendant(put, M, -11, z, under, 3.2);
  }
  totem(b, scene, M, zoneSign(kit, 'lounge', accent, 2.4), 2.4, -8.6, 4.6, Math.PI / 2);
  for (const x of [-22.3, -18.7])
    for (const z of [-7, -1.5, 4]) {
      roundTable(put, M, x, z, 4, 0.55);
      pendant(put, M, x, z, H, 3.0);
      obstacles.push({ x, z, r: 0.6, h: 0.8 });
    }

  // Sala de Revisão (cartões): mesa redonda com os cartões e cadeiras, estante baixa e poltronas, a
  // leste do átrio; na ala leste, mesas de estudo com luminárias e a estante da parede do fundo.
  groups.push(
    station(kit, scene, 'review', labels.review, accent, P.review, (p) => {
      rug(p, M.rug, 0, 0.2, 3.8, 3.4);
      roundTable(p, M, 0, 0.2, 4, 0.9, M.white);
      for (let k = 0; k < 8; k++) p(kit.mat(['#A5B4FC', '#FBBF24', '#34D399'][k % 3]!, { rough: 0.5 }), B(0.36, 0.012, 0.24), Math.sin(k) * 0.5, 0.785, 0.2 + Math.cos(k) * 0.5, k);
      shelf(p, M, 0, -2.0, 0, 3.2, 1.25, 5);
      for (const sx of [-1, 1]) plant(p, M, sx * 2.0, -1.9, 0.75);
    }, { x: 0, y: 1.95, z: -2.0 }),
  );
  solid(obstacles, P.review, 0, 0.2, 1.8, 1.8, 0.8);
  solid(obstacles, P.review, 0, -2.0, 3.2, 0.4, 1.25);
  for (const z of [0, 2]) pendant(put, M, 11, z, under, 3.2);
  for (const x of [19.6, 23.4]) {
    longTable(put, M, x, -1.5, 5, 1.1, 3, Math.PI / 2);
    for (const z of [-3.2, -1.5, 0.2]) deskLamp(put, M, x, 0.78, z);
    solid(obstacles, { x, z: -1.5, face: Math.PI / 2 }, 0, 0, 5, 1.1, 0.8);
  }
  shelf(put, M, 21, -10.35, 0, 6, 2.4, 9);
  solid(obstacles, { x: 21, z: -10.35, face: 0 }, 0, 0, 6, 0.4, 2.4);

  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 7, 15.5), target: new THREE.Vector3(0, 2, -2) };
  return {
    scene,
    sectors: ACADEMY_SECTORS,
    pickables: groups,
    room: room.spec,
    obstacles,
    view: (id) => {
      // RecepÃ§Ã£o e orientaÃ§Ã£o: vistas de dentro do pÃ³rtico, de lado (o pÃ³rtico Ã© estreito).
      if (id === 'hall' || id === 'rooms') {
        const s = id === 'hall' ? 1 : -1;
        return { cam: new THREE.Vector3(s * 3.8, 4.0, 17.4), target: new THREE.Vector3(s * 6.5, 1.4, 11.2) };
      }
      const p = (P as Record<string, Placed | undefined>)[id];
      return p ? look(p) : overview;
    },
    setData: (d) => {
      const subjects = (d as AcademyData).subjects;
      boards.forEach((bd, i) => bd.draw(subjects[i] ?? ''));
    },
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * IDIOMAS — Centro Internacional de Idiomas (seção 14). Jardim interno no meio do tambor de vidro,
 * recepção e cursos e atividades junto ao vestíbulo, espaço internacional de convivência, mesas de
 * conversação em volta, exposições de idiomas e culturas na ala oeste e a sala de imersão a leste.
 * ===================================================================== */
export const LANGUAGES_SECTORS = ['garden', 'spaces'] as const;
export type LanguagesSector = (typeof LANGUAGES_SECTORS)[number];
export interface LanguagesData {
  languages: string[];
}

export function createLanguagesInterior(kit: Kit, labels: Record<LanguagesSector, string>): InteriorScene {
  const accent = '#14B8A6';
  const room = createRoom(kit, { id: 'languages', floor: '#E4EFE8', glass: '#CBEFE9', frame: '#B08560', accent });
  const { scene, b } = room;
  const H = room.spec.height;
  const M = palette(kit, accent, { stone: '#D4D0C8', wood: '#B08560', fabric: '#2F6F6A', fabric2: '#E9D8BC', rug: '#C9B79C' });
  const teal = kit.mat('#14B8A6', { metal: 0.2, rough: 0.4 });
  const put = frame(b, 0, 0, 0);
  const obstacles: Obstacle[] = [];

  const P: Record<LanguagesSector, Placed> = {
    garden: { x: 0, z: 0, face: 0 },
    spaces: { x: -6.4, z: 9.4, face: 0 },
  };
  const groups: THREE.Group[] = [];

  // Jardim Central (o módulo Idiomas): canteiro com espelho d'água, árvores e arbustos; o caminho
  // de quem entra contorna o jardim até o saguão dos elevadores.
  groups.push(
    station(kit, scene, 'garden', labels.garden, accent, P.garden, (p) => {
      p(kit.mat('#5E9E4C', { rough: 1 }), C(4.5, 4.5, 0.3, 48), 0, 0.15, 0);
      p(M.concrete, new THREE.TorusGeometry(4.5, 0.14, 6, 64), 0, 0.3, 0, 0, Math.PI / 2);
      p(M.concrete, C(2.15, 2.15, 0.06, 40), 0, 0.31, 0);
      p(kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }), new THREE.CircleGeometry(2, 40), 0, 0.345, 0, 0, -Math.PI / 2);
      for (let k = 0; k < 3; k++) p(M.stone, new THREE.DodecahedronGeometry(0.18 + k * 0.05, 0), Math.sin(k * 2.1) * 0.8, 0.38, Math.cos(k * 2.1) * 0.8);
      for (let k = 0; k < 4; k++) {
        const a = 0.6 + k * (Math.PI / 2);
        tree(p, M, Math.sin(a) * 3.2, 0.3, Math.cos(a) * 3.2, 0.9);
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        p(k % 2 ? M.leaf : M.leaf2, new THREE.IcosahedronGeometry(0.4 + (k % 3) * 0.08, 1), Math.sin(a) * 3.8, 0.55, Math.cos(a) * 3.8);
      }
      for (const sx of [-1, 1]) p(M.dark, B(0.05, 1.0, 0.05), sx * 0.85, 0.5, 3.75);
    }, { x: 0, y: 1.0, z: 3.8, w: 2.0 }),
  );
  obstacles.push({ x: 0, z: 0, r: 4.6, h: 1 });

  // Recepção, à direita do vestíbulo (sem tela: é só o balcão de atendimento).
  {
    const o: Placed = { x: 6.4, z: 9.4, face: 0 };
    receptionDesk(frame(b, o.x, o.z, o.face), M, M.wood, M.concrete, M.wood);
    const [sx, sz] = toWorld(o, -0.2, -2.22);
    scene.add(at(zoneSign(kit, 'reception', accent), sx, 2.75, sz));
    solid(obstacles, o, -0.3, 0, 4.2, 0.9, 1.1);
    for (const x of [5.6, 7.4]) pendant(put, M, x, 9.6, H, 3.2);
  }

  // Cursos e atividades (Espaços dos Idiomas), à esquerda do vestíbulo: parede de concreto com uma
  // placa para cada idioma real do usuário.
  const infoBoards: Array<ReturnType<typeof nameBoard>> = [];
  const infoExtras: THREE.Object3D[] = [at(zoneSign(kit, 'courseInfo', accent, 2.8), 0, 3.6, -0.4)];
  for (let i = 0; i < 6; i++) {
    const bd = nameBoard(kit, 1.7, accent);
    infoExtras.push(at(bd.mesh, i % 2 ? 0.95 : -0.95, 2.45 - Math.floor(i / 2) * 0.6, -0.23));
    infoBoards.push(bd);
  }
  groups.push(
    station(kit, scene, 'spaces', labels.spaces, accent, P.spaces, (p) => {
      p(M.concrete, B(4.6, 3.2, 0.3), 0, 1.6, -0.4);
      p(M.wood, B(4.7, 0.08, 0.4), 0, 3.24, -0.4);
      p(M.wood, B(4.2, 0.06, 0.25), 0, 0.98, -0.15);
      for (const sx of [-1, 1]) plant(p, M, sx * 2.75, -0.3, 0.85);
    }, { x: 0, y: 0.62, z: -0.22 }, infoExtras),
  );
  solid(obstacles, P.spaces, 0, -0.4, 4.6, 0.3, 3.2);

  // Espaço internacional de convivência: sofá, poltronas, mesinha e tapete, com a floreira-divisória
  // e a placa atrás do sofá.
  {
    const o: Placed = { x: -9.6, z: 4.2, face: Math.PI / 2 };
    const p = sub(put, o.x, o.z, o.face);
    rug(p, M.rug, 0, 0, 4.2, 3.2);
    sofa(p, M, 0, -1.15, 0, 2.4);
    for (const s of [-1, 1]) armchair(p, M, s * 1.55, 0.9, Math.atan2(-s * 1.55, -1.1), M.fabric2);
    lowTable(p, M, 0, -0.1, 0.55);
    planter(p, M, 0, -2.0, 3.2, 0.6);
    for (const s of [-1, 1]) p(M.dark, C(0.03, 0.03, 2.2, 8), s * 1.14, 1.65, -2.0);
    const [sx, sz] = toWorld(o, 0, -2.0);
    scene.add(at(zoneSign(kit, 'international', accent, 2.4), sx, 2.45, sz, o.face));
    solid(obstacles, o, 0, -1.6, 3.2, 1.4, 0.8);
    pendant(put, M, -9.6, 4.2, H, 3.0);
  }

  // Exposições de idiomas e culturas na ala oeste: seis pavilhões hexagonais (o desenho de sempre
  // dos quiosques, menores), cada um com a vitrine e a placa de um idioma real, em volta do corredor.
  const exBoards: Array<ReturnType<typeof nameBoard>> = [];
  const exExtras: THREE.Object3D[] = [];
  const pav: Array<[number, number]> = [];
  for (const dz of [3.2, -3.2]) for (const dx of [3.2, 0, -3.2]) pav.push([dx, dz]);
  pav.forEach(([dx, dz]) => {
    const bd = nameBoard(kit, 1.6, accent);
    exExtras.push(at(bd.mesh, dx, 1.95, dz - Math.sign(dz) * 1.28, dz > 0 ? Math.PI : 0));
    exBoards.push(bd);
  });
  const exhibits: Placed = { x: -18, z: 0, face: 0 };
  groups.push(
    station(kit, scene, 'spaces', labels.spaces, accent, exhibits, (p) => {
      pav.forEach(([dx, dz], i) => {
        p(M.wood, C(1.15, 1.2, 0.2, 6), dx, 0.1, dz);
        for (let k = 0; k < 6; k++) {
          const c = (k / 6) * Math.PI * 2;
          p(M.wood, C(0.05, 0.05, 2.3, 6), dx + Math.sin(c) * 0.95, 1.35, dz + Math.cos(c) * 0.95);
        }
        p(teal, new THREE.ConeGeometry(1.3, 0.8, 6), dx, 2.75, dz);
        p(M.stone, B(0.6, 0.95, 0.6), dx, 0.675, dz);
        p(M.glass, B(0.55, 0.5, 0.55), dx, 1.4, dz);
        p(i % 2 ? M.books[i % M.books.length]! : M.acc, i % 2 ? B(0.22, 0.3, 0.06) : new THREE.IcosahedronGeometry(0.16, 1), dx, 1.35, dz);
      });
    }, null, exExtras),
  );
  pav.forEach(([dx, dz]) => obstacles.push({ x: exhibits.x + dx, z: exhibits.z + dz, r: 1.2, h: 2.5 }));
  totem(b, scene, M, zoneSign(kit, 'exhibits', accent, 2.6), 2.6, -22.6, 0, Math.PI / 2);

  // Mesas de conversação: três mesas redondas de quatro lugares, com pendentes.
  for (const [x, z] of [[8.4, -7.6], [-8.4, -7.6], [10.6, 2.2]] as const) {
    roundTable(put, M, x, z, 4, 0.65);
    put(M.pot, C(0.06, 0.05, 0.16, 10), x, 0.86, z);
    put(M.leaf, new THREE.IcosahedronGeometry(0.1, 1), x, 0.98, z);
    pendant(put, M, x, z, H, 2.9);
    obstacles.push({ x, z, r: 0.7, h: 0.8 });
  }
  totem(b, scene, M, zoneSign(kit, 'conversation', accent, 2.4), 2.4, 10.9, -4.6, Math.PI / 2);

  // Imersão (ala leste): sala circular de ripas de madeira, aberta para o tambor, com banco
  // estofado em volta, pufes e tapete redondo e a luz de sanca.
  {
    const cx = 17.6;
    const cz = -3;
    const t0 = -Math.PI / 2 + 0.9;
    const tl = Math.PI * 2 - 1.8;
    put(kit.mat('#9A6B48', { rough: 0.75, side: THREE.DoubleSide }), new THREE.CylinderGeometry(3, 3, 3, 40, 1, true, t0, tl), cx, 1.5, cz);
    put(M.accGlow, new THREE.CylinderGeometry(2.9, 2.9, 0.05, 40, 1, true, t0, tl), cx, 2.9, cz);
    for (let k = 0; k <= 20; k++) {
      const a = t0 + (k / 20) * tl;
      put(M.woodDark, B(0.08, 3, 0.1), cx + Math.sin(a) * 3.06, 1.5, cz + Math.cos(a) * 3.06, a);
    }
    for (let k = 0; k < 9; k++) {
      const a = t0 + ((k + 0.5) / 9) * tl;
      put(M.fabric, B(0.9, 0.42, 0.5), cx + Math.sin(a) * 2.55, 0.21, cz + Math.cos(a) * 2.55, a);
    }
    put(M.rug, C(2.0, 2.0, 0.012, 40), cx, 0.008, cz);
    for (let k = 0; k < 3; k++) put(M.fabric2, C(0.32, 0.36, 0.38, 16), cx + Math.sin(k * 2.1) * 0.9, 0.19, cz + Math.cos(k * 2.1) * 0.9);
    totem(b, scene, M, zoneSign(kit, 'immersion', accent, 2.4), 2.4, 13.9, -3, Math.PI / 2);
    for (const z of [-8.6, 2.6]) plant(put, M, 20.6, z, 1);
  }

  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, 13.5), target: new THREE.Vector3(0, 1.2, -1) };
  return {
    scene,
    sectors: LANGUAGES_SECTORS,
    pickables: groups,
    room: room.spec,
    obstacles,
    view: (id) => (id === 'garden' ? { cam: new THREE.Vector3(0, 5.2, 10.5), target: new THREE.Vector3(0, 0.8, 0) } : id === 'spaces' ? { cam: new THREE.Vector3(-3.2, 3.4, 13.4), target: new THREE.Vector3(-6.4, 1.8, 9.4) } : overview),
    setData: (d) => {
      const langs = (d as LanguagesData).languages;
      infoBoards.forEach((bd, i) => bd.draw(langs[i] ?? ''));
      exBoards.forEach((bd, i) => bd.draw(langs[i] ?? ''));
    },
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * INSIGHTS — Observatório de Insights (seção 24). Átrio circular em volta do núcleo da escada
 * curva (que sobe às áreas de análise), com o anel dos indicadores disponíveis (um console por
 * módulo), a recepção e o painel informativo junto à entrada; a luneta no bloco oeste.
 * ===================================================================== */
export const INSIGHTS_SECTORS = ['overview', 'productivity', 'learning', 'habits', 'goals', 'activities', 'finance'] as const;
export type InsightsSector = (typeof INSIGHTS_SECTORS)[number];

export function createInsightsInterior(kit: Kit, labels: Record<InsightsSector, string>): InteriorScene {
  const accent = '#FDA4AF';
  const room = createRoom(kit, { id: 'insights', floor: '#F2EEF0', glass: '#F7D5DC', frame: '#F43F5E', accent });
  const { scene, b } = room;
  const H = room.spec.height;
  const M = palette(kit, '#F43F5E', { stone: '#DCDDE2', wood: '#9C8F80', fabric: '#3F4A5C', fabric2: '#E5E7EB', rug: '#C8CFDA' });
  const dark = kit.mat('#1F2A3A', { metal: 0.6, rough: 0.35 });
  const silver = kit.mat('#CBD5E1', { metal: 0.9, rough: 0.2 });
  const put = frame(b, 0, 0, 0);
  const obstacles: Obstacle[] = [];

  // Piso do átrio circular: disco de concreto claro e a linha de luz do anel.
  put(M.stone, C(9.4, 9.4, 0.012, 64), 0, 0.006, 0);
  put(M.accGlow, new THREE.RingGeometry(5.5, 5.62, 96), 0, 0.016, 0, 0, -Math.PI / 2);

  // Núcleo da escada curva no meio do átrio (o mesmo dos andares de cima), com a porta na frente:
  // a escada funciona (sobe ao 1º andar, onde começam as áreas de análise).
  const R = Math.max(2.6, MASSING.insights.void);
  const gap = 0.7;
  b.add(M.concrete, new THREE.CylinderGeometry(R, R, H, 48, 1, true, gap / 2, Math.PI * 2 - gap), [0, H / 2, 0]);
  b.add(kit.mat('#D2CBBE', { rough: 0.9, side: THREE.BackSide }), new THREE.CylinderGeometry(R - 0.3, R - 0.3, H, 48, 1, true, gap / 2, Math.PI * 2 - gap), [0, H / 2, 0]);
  b.add(M.concrete, new THREE.CylinderGeometry(R, R, H - 2.4, 8, 1, true, -gap / 2, gap), [0, 2.4 + (H - 2.4) / 2, 0]);
  for (const s of [-1, 1]) b.add(silver, B(0.06, H, 0.32), [Math.sin((s * gap) / 2) * (R - 0.15), H / 2, Math.cos((s * gap) / 2) * (R - 0.15)], [0, (s * gap) / 2, 0]);
  b.add(M.accGlow, new THREE.TorusGeometry(R + 0.02, 0.03, 4, 64), [0, 3.2, 0], [Math.PI / 2, 0, 0]);
  b.add(M.dark, C(0.18, 0.18, H, 12), [0, H / 2, 0]);
  const steps = 26;
  for (let k = 0; k < steps; k++) {
    const a = -0.4 - (k / steps) * Math.PI * 2 * (17 / 18);
    const rr = (R - 0.3) / 2 + 0.1;
    b.add(M.wood, B(0.45, 0.06, R - 0.6), [Math.sin(a) * rr, 0.3 + (k / steps) * (H - 0.3), Math.cos(a) * rr], [0, a, 0]);
  }
  scene.add(at(zoneSign(kit, 'stairs', accent, 2.0), 0, 2.85, R + 0.06));
  scene.add(at(zoneSign(kit, 'analysisAccess', accent, 2.8), 0, 3.6, R + 0.06));
  obstacles.push({ x: 0, z: 0, r: R + 0.1, h: H });
  const stairs: Thing = { kind: 'stairs', level: 0, x: 0, z: R + 1.0, face: 0 };
  scene.userData.things = [stairs];
  // Pendentes em anel sobre o átrio.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    pendant(put, M, Math.sin(a) * 5.2, Math.cos(a) * 5.2, H, 4.2);
  }

  // Visão geral dos indicadores disponíveis: um console por módulo em anel em volta do núcleo, cada
  // um abrindo o Insights daquele módulo (dados reais; as telas não mostram números).
  const ring = INSIGHTS_SECTORS.filter((s) => s !== 'overview');
  const angles = [0.8, Math.PI / 2, 2.35, -2.35, -Math.PI / 2, -0.8];
  const P = { overview: { x: -5.6, z: 9.3, face: 0 } } as Record<InsightsSector, Placed>;
  ring.forEach((id, i) => {
    const a = angles[i] ?? 0;
    P[id] = { x: Math.sin(a) * 7.2, z: Math.cos(a) * 7.2, face: a };
  });
  const groups: THREE.Group[] = ring.map((id) =>
    station(kit, scene, id, labels[id], accent, P[id], (p) => {
      p(M.concrete, B(2.2, 0.95, 0.8), 0, 0.475, -0.1);
      p(silver, B(2.3, 0.05, 0.9), 0, 0.975, -0.1);
      p(dark, B(1.9, 0.9, 0.06), 0, 1.5, -0.35, 0, -0.3);
      p(M.accGlow, B(1.75, 0.78, 0.01), 0, 1.5, -0.31, 0, -0.3);
      p(M.accGlow, B(2.0, 0.04, 0.02), 0, 0.12, 0.31);
    }, { x: 0, y: 2.35, z: -0.4, w: 1.9 }),
  );
  ring.forEach((id) => solid(obstacles, P[id], 0, -0.1, 2.3, 0.9, 1.9));
  hang(b, scene, M, zoneSign(kit, 'indicators', accent, 3.0), 3.0, 0, 3.0, 8.6, 0, H);

  // Painel informativo junto à entrada (Visão Geral).
  groups.unshift(
    station(kit, scene, 'overview', labels.overview, accent, P.overview, (p) => {
      p(M.concrete, B(3.8, 0.3, 0.7), 0, 0.15, 0);
      for (const sx of [-1, 1]) p(silver, B(0.1, 3.0, 0.1), sx * 1.85, 1.65, 0);
      p(dark, B(3.6, 2.2, 0.08), 0, 1.85, 0);
      p(silver, B(3.9, 0.06, 0.2), 0, 3.15, 0);
    }, null, [at(infoBoard(kit, zoneLabel('infoPanel'), labels.overview, accent, 3.4, 2.0, 'ring'), 0, 1.85, 0.05)]),
  );
  solid(obstacles, P.overview, 0, 0, 3.8, 0.7, 3.1);

  // Recepção, à direita de quem entra, com a placa pendurada.
  {
    const o: Placed = { x: 5.6, z: 9.3, face: 0 };
    receptionDesk(frame(b, o.x, o.z, o.face), M, M.concrete, silver, null);
    hang(b, scene, M, zoneSign(kit, 'reception', accent, 2.4), 2.4, 5.4, 3.0, 9.0, 0, H);
    solid(obstacles, o, -0.3, 0, 4.2, 0.9, 1.1);
  }

  // Bloco leste: canto de leitura dos relatórios (poltronas, mesinha e estante na parede).
  shelf(put, M, 17.3, -4, -Math.PI / 2, 4, 2.2, 7);
  solid(obstacles, { x: 17.3, z: -4, face: -Math.PI / 2 }, 0, 0, 4, 0.4, 2.2);
  rug(put, M.rug, 14.6, -4, 3, 3.6);
  for (const z of [-5.2, -2.8]) armchair(put, M, 14.2, z, Math.PI / 2);
  lowTable(put, M, 15.4, -4, 0.4);
  for (const z of [-8.6, 0.6]) plant(put, M, 16.6, z, 1);

  // Bloco oeste: a luneta virada para a janela, com bancos e vasos.
  {
    const x = -14.6;
    const z = 4.4;
    put(silver, C(0.35, 0.55, 1.2, 16), x, 0.6, z);
    put(silver, C(0.22, 0.3, 2.6, 20), x - 1.02, 2.0, z, -Math.PI / 2, 0.9);
    put(M.dark, C(0.32, 0.32, 0.12, 20), x - 2.05, 2.8, z, -Math.PI / 2, 0.9);
    obstacles.push({ x, z, r: 0.6, h: 1.2 });
    for (const bz of [1.6, 6.4]) put(M.wood, B(2.2, 0.1, 0.5), -13.2, 0.45, bz);
    for (const bz of [1.6, 6.4]) for (const sx of [-1, 1]) put(M.dark, B(0.08, 0.42, 0.4), -13.2 + sx * 0.9, 0.21, bz);
    plant(put, M, -16.8, 1.2, 1);
  }

  finishRoom(room);
  const overview = { cam: new THREE.Vector3(3.5, 7.5, 12.5), target: new THREE.Vector3(0, 1.5, -4) };
  return {
    scene,
    sectors: INSIGHTS_SECTORS,
    pickables: groups,
    room: room.spec,
    obstacles,
    view: (id) => {
      if (id === 'overview') return { cam: new THREE.Vector3(-1.8, 3.4, 14.5), target: new THREE.Vector3(-5.6, 1.6, 9.3) };
      const p = (P as Record<string, Placed | undefined>)[id];
      return p ? look(p, 4.5, 3.0) : overview;
    },
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}
