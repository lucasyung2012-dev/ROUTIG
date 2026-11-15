/**
 * Prédios detalhados das regiões Oeste e Sul (Bloco 4): Jardim da Concentração (Focus), Estufa de
 * Hábitos (Habits), Centro de Objetivos (Goals), Conservatório de Música e Centro Esportivo. O
 * térreo de cada um sai da volumetria do prédio (massing.ts), a mesma planta do interior
 * (shell.ts); aqui ficam a entrada, o letreiro, o paisagismo e o que é só de cada prédio.
 * Frente = +z, base em y = 0 (a altura do terreno no centro do lote), 1 unidade = 1 m.
 *
 * Tudo o que fica fora das paredes acompanha o chão de verdade (heightAt): o piso do lote, a borda,
 * os canteiros, os marcos e a vegetação. Onde o terreno desce sob o prédio (perto da Música, a
 * rampa do palco ao ar livre puxa o lote para baixo), o embasamento desce até o chão mais baixo, e
 * nada fica flutuando nem atravessando a encosta.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { buildingById, facingOf, heightAt, seededRandom } from '@/domain/park';
import { Builder, shrubs, type Kit } from '../kit';
import { signPlane, type DetailedBuilding } from './central';
import { groundShell, signSpot } from './shell';
import { volSlab } from '../forms';
import { MASSING, STOREY, topLevel, volsAt } from '../massing';
import { insideAt, volPoly } from '../outline';
import { HABITS_ARCHES } from '../interiors/westsouth';

/** Altura do chão em (x, z) locais, relativa ao centro do lote (onde o mundo põe o prédio). */
type Ground = (x: number, z: number) => number;

function groundOf(id: ModuleId): Ground {
  const def = buildingById(id);
  if (!def) return () => 0;
  const fc = facingOf(def);
  const c = Math.cos(fc);
  const s = Math.sin(fc);
  const y0 = heightAt(def.x, def.z);
  // O mesmo local → mundo do world.ts (group.rotation.y = facing).
  return (x, z) => heightAt(def.x + x * c + z * s, def.z - x * s + z * c) - y0;
}

/** Chão mais baixo e mais alto num círculo de raio `r` em volta de (x, z). */
function span(g: Ground, x: number, z: number, r: number): { lo: number; hi: number } {
  let lo = g(x, z);
  let hi = lo;
  for (const k of [0.5, 1])
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * Math.PI * 2;
      const h = g(x + Math.sin(a) * r * k, z + Math.cos(a) * r * k);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  return { lo, hi };
}

/** Disco que acompanha o chão (piso do lote, deque), `lift` acima dele. */
function discOn(g: Ground, radius: number, lift: number): THREE.BufferGeometry {
  const rings = 16;
  const segs = 72;
  const pos: number[] = [0, g(0, 0) + lift, 0];
  for (let i = 1; i <= rings; i++) {
    const r = (radius * i) / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      pos.push(x, g(x, z) + lift, z);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + ((j + 1) % segs));
  for (let i = 2; i <= rings; i++) {
    const inner = 1 + (i - 2) * segs;
    const outer = 1 + (i - 1) * segs;
    for (let j = 0; j < segs; j++) {
      const n = (j + 1) % segs;
      idx.push(inner + j, outer + j, outer + n, inner + j, outer + n, inner + n);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Piso por onde se anda (lote, deque): fora da colisão do prédio (world.ts tira a colisão do desenho;
 * numa rampa, os triângulos do piso inclinado contariam como obstáculo).
 */
function walkable(draw: (b: Builder) => void): THREE.Group {
  const b = new Builder();
  draw(b);
  const out = b.build(false);
  out.traverse((o) => (o.userData.noCollide = true));
  return out;
}

/** Piso do lote e a borda de pedra, os dois acompanhando o chão (antes: disco e anel retos em y = 0). */
function lotOn(kit: Kit, b: Builder, g: Ground, radius: number, color: string) {
  b.add(kit.mat(color, { rough: 0.85 }), discOn(g, radius, 0.08));
  const pts: THREE.Vector3[] = [];
  for (let j = 0; j < 120; j++) {
    const a = (j / 120) * Math.PI * 2;
    const x = Math.sin(a) * radius;
    const z = Math.cos(a) * radius;
    pts.push(new THREE.Vector3(x, g(x, z) + 0.04, z));
  }
  b.add(kit.mat('#C9C1AE', { rough: 0.8 }), new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 180, 0.12, 6, true));
}

/**
 * Embasamento sob cada volume do térreo até o chão mais baixo debaixo dele (a base de pedra do
 * shell vai só até 0,85 m abaixo do piso).
 */
function plinth(b: Builder, mat: THREE.Material, id: ModuleId, g: Ground) {
  for (const v of volsAt(id, 0)) {
    const pts = volPoly(v, 32);
    let lo = g(v.cx, v.cz);
    pts.forEach(([x, z], i) => {
      const [nx, nz] = pts[(i + 1) % pts.length]!;
      for (let k = 0; k < 8; k++) lo = Math.min(lo, g(x + ((nx - x) * k) / 8, z + ((nz - z) * k) / 8));
    });
    if (lo < -0.75) b.add(mat, volSlab(v, -0.7, -0.3 - lo, [], 0.35));
  }
}

/** Vegetação em anéis em volta do lote, no chão (a versão reta de central.ts flutuava nas rampas). */
function plantingOn(kit: Kit, g: Ground, seed: number, rMin: number, rMax: number, n: number, palette: string[], skipFront = 0.5): THREE.Object3D[] {
  const rnd = seededRandom(seed);
  const bush: Array<{ x: number; y: number; z: number; s: number; color: string }> = [];
  const flower: typeof bush = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rMin + rnd() * (rMax - rMin);
    const s = 0.8 + rnd() * 0.8;
    const pick = rnd();
    // Caminho da entrada livre.
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < skipFront) continue;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (i % 3 === 0) bush.push({ x, y: g(x, z), z, s, color: pick > 0.5 ? '#3E8E4A' : '#4F9F55' });
    else flower.push({ x, y: g(x, z), z, s: 1, color: palette[i % palette.length]! });
  }
  return [shrubs(kit, bush, 'bush'), shrubs(kit, flower, 'flower')];
}

/* =====================================================================
 * FOCUS — Jardim da Concentração (seção 21), na ilha: volumes baixos e horizontais em volta do
 * pavilhão redondo do jardim central (com a claraboia), bloco dos fundos com o mezanino, deque
 * de madeira e espelhos d'água.
 * ===================================================================== */
export function focusBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const g = groundOf('focus');
  const wood = kit.mat('#C9A27A', { rough: 0.7 });
  const water = kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 });

  group.add(walkable((lb) => lotOn(kit, lb, g, 27, '#E1E6DE')));
  // Deque de madeira em volta do prédio e espelhos d'água entre as alas (no chão).
  group.add(
    walkable((lb) => {
      lb.add(wood, discOn(g, 24, 0.16));
      for (const [x, z, r] of [[-15, 12, 3.2], [15, -11, 2.6], [-15, -14, 2.2]] as const) lb.add(water, new THREE.CircleGeometry(r, 32), [x, span(g, x, z, r).hi + 0.19, z], [-Math.PI / 2, 0, 0]);
    }),
  );
  const s = groundShell(kit, b, 'focus', { base: '#CDBFA8', roof: '#D9E6D3', canopy: 2.5, canopyColor: '#C9A27A', glow: '#FFE9C2' });
  plinth(b, kit.mat('#CDBFA8', { rough: 0.85 }), 'focus', g);
  group.add(b.build());
  const sign = signPlane(kit, ['FOCUS', 'JARDIM DA CONCENTRAÇÃO'], 4.6, 1.1, '#5EEAD4');
  const sp = signSpot(s, 1.1);
  sign.position.set(0, sp.y, sp.z);
  // Capim baixo em volta do deque (fora dos volumes).
  const g0 = volsAt('focus', 0);
  const grass: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const x = Math.sin(a) * 23.6;
    const z = Math.cos(a) * 23.6;
    // Livre no caminho da porta e no lounge do elevador, nos fundos.
    if (Math.abs(x) < (z > 0 ? 3 : 6)) continue;
    if (!insideAt(g0, x, z, -1)) grass.push({ x, y: g(x, z) + 0.2, z, s: 0.6 + (i % 3) * 0.2, color: '#4F9F55' });
  }
  group.add(sign, shrubs(kit, grass, 'bush'), ...plantingOn(kit, g, 211, 24.5, 27.5, 80, ['#5EEAD4', '#FFFFFF', '#A7F3D0']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * HABITS — Estufa de Hábitos (seção 22): estufa contemporânea, só o térreo. Nave de vidro com a
 * claraboia redonda sobre o jardim central, alas laterais mais baixas, pavilhão de entrada e
 * canteiros sinuosos na frente.
 * ===================================================================== */
export function habitsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const g = groundOf('habits');
  const frame = kit.mat('#6B7F75', { metal: 0.6, rough: 0.35 });
  const gold = kit.mat('#E6B450', { glow: true });
  const bedMat = kit.mat('#5E9E4C', { rough: 1 });

  group.add(walkable((lb) => lotOn(kit, lb, g, 27.5, '#E0E5D8')));
  const s = groundShell(kit, b, 'habits', { base: '#D3D9CB', roof: '#E3EADF', canopy: 2.5, canopyColor: '#6B7F75', glow: '#CFEFD2' });
  plinth(b, kit.mat('#D3D9CB', { rough: 0.85 }), 'habits', g);
  // Montantes da estufa sobre a cobertura da nave (as mesmas linhas dos arcos de dentro).
  const H = MASSING.habits.ground;
  const nave = MASSING.habits.vols[0]!;
  const d = nave.kind === 'rect' ? nave.d : 20;
  for (const x of HABITS_ARCHES) b.add(frame, new THREE.BoxGeometry(0.18, 0.5, d), [x, H + 0.6, nave.cz]);
  b.add(gold, new THREE.BoxGeometry(9.6, 0.06, 0.1), [0, s.door.glass + 0.32, s.front + 2.45]);
  // Canteiros e caminhos sinuosos na frente (o eixo da porta fica livre), cada um assentado no chão.
  const beds: Array<{ x: number; z: number; top: number }> = [];
  for (const x of [-18.5, -12, -5.5, 5.5, 12, 18.5]) {
    const z = 19 + Math.sin(x) * 1.5;
    const sp = span(g, x, z, 2.2);
    const top = sp.hi + 0.35;
    const h = top - (sp.lo - 0.2);
    b.add(bedMat, new THREE.CylinderGeometry(2.2, 2.2, h, 20), [x, top - h / 2, z]);
    beds.push({ x, z, top });
  }
  group.add(b.build());
  const sp = signSpot(s, 1.3);
  const sign = signPlane(kit, ['HABITS', 'ESTUFA DE HÁBITOS'], 5.4, 1.3, '#E6B450');
  sign.position.set(0, sp.y, sp.z);
  const flowers: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  beds.forEach(({ x: bx, z: bz, top }, i) => {
    for (let k = 0; k < 12; k++) flowers.push({ x: bx + Math.sin(k * 2.3 + i) * 1.7, y: top, z: bz + Math.cos(k * 2.3 + i) * 1.7, s: 1, color: ['#FBBF24', '#F472B6', '#FFFFFF', '#A78BFA'][k % 4]! });
  });
  group.add(sign, shrubs(kit, flowers, 'flower'), ...plantingOn(kit, g, 223, s.bound + 1.5, 27.8, 80, ['#FBBF24', '#FFFFFF']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * GOALS — Centro de Objetivos (seção 23): volumes geométricos ligados, composição vertical (torre
 * sobre o embasamento hexagonal), átrio central; marco dourado na praça de entrada.
 * ===================================================================== */
export function goalsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const g = groundOf('goals');
  const stone = kit.mat('#E9E2D0', { rough: 0.8 });
  const gold = kit.mat('#EAB308', { metal: 0.6, rough: 0.3 });
  const glow = kit.mat('#FDE68A', { glow: true });

  group.add(walkable((lb) => lotOn(kit, lb, g, 27, '#E4E2D4')));
  const s = groundShell(kit, b, 'goals', { base: '#D9D3C2', canopy: 2.5, canopyColor: '#EAB308', glow: '#FFE9C2' });
  plinth(b, kit.mat('#D9D3C2', { rough: 0.85 }), 'goals', g);
  // Torre: friso dourado no alto, marcando a composição vertical.
  const top = MASSING.goals.ground + topLevel('goals') * STOREY;
  for (const r of s.runs) if (r.vol === 1) b.add(gold, new THREE.BoxGeometry(0.12, 0.25, r.len), [(r.ax + r.bx) / 2 + r.nx * 0.2, top - 0.3, (r.az + r.bz) / 2 + r.nz * 0.2], [0, Math.atan2(r.bx - r.ax, r.bz - r.az), 0]);
  // Marco na praça da entrada (fora do eixo da porta): base no chão, obelisco dourado com a luz no
  // topo e três pedestais, cada um assentado no chão onde está.
  const mx = -8.5;
  const mz = 20.5;
  const ms = span(g, mx, mz, 2.8);
  const base = ms.hi + 0.4;
  b.add(stone, new THREE.CylinderGeometry(2.6, 2.8, base - ms.lo + 0.2, 6), [mx, (base + ms.lo - 0.2) / 2, mz]);
  b.add(gold, new THREE.CylinderGeometry(0.3, 0.7, 7, 4), [mx, base + 3.5, mz]);
  b.add(glow, new THREE.OctahedronGeometry(0.8, 0), [mx, base + 7.5, mz]);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    const x = mx + Math.sin(a) * 4;
    const z = mz + Math.cos(a) * 4;
    const ps = span(g, x, z, 0.6);
    const t = ps.hi + 1;
    b.add(stone, new THREE.BoxGeometry(0.8, t - ps.lo + 0.2, 0.8), [x, (t + ps.lo - 0.2) / 2, z]);
    b.add(glow, new THREE.SphereGeometry(0.22, 10, 8), [x, t + 0.2, z]);
  }
  group.add(b.build());
  const sp = signSpot(s, 1.3);
  const sign = signPlane(kit, ['GOALS', 'CENTRO DE OBJETIVOS'], 5.4, 1.3, '#EAB308');
  sign.position.set(0, sp.y, sp.z);
  // Canteiros de flores em hexágono em volta do embasamento.
  const g0 = volsAt('goals', 0);
  const flowers: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    const x = Math.sin(a) * 18.5;
    const z = Math.cos(a) * 18.5;
    if (Math.cos(a) > 0.95 || Math.cos(a) < -0.9 || insideAt(g0, x, z, -1.2)) continue;
    flowers.push({ x, y: g(x, z) + 0.08, z, s: 1, color: ['#FDE68A', '#F472B6', '#FFFFFF'][i % 3]! });
  }
  group.add(sign, shrubs(kit, flowers, 'flower'), ...plantingOn(kit, g, 233, 20.5, 27.5, 60, ['#FDE68A', '#FFFFFF']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * MÚSICA — Conservatório Musical (seção 25): volumes assimétricos de alturas diferentes (salão,
 * torre do auditório deslocada, ala baixa), madeira e concreto; concha acústica ao ar livre a
 * oeste com a arquibancada em arco. A leste o terreno desce para o palco ao ar livre do parque:
 * o embasamento da ala baixa desce até o chão e o piso do lote acompanha a descida.
 * ===================================================================== */
export function musicBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const g = groundOf('music');
  const white = kit.mat('#F7F2F5', { rough: 0.45 });
  const pink = kit.mat('#EC4899', { metal: 0.3, rough: 0.35 });
  const wood = kit.mat('#B08560', { rough: 0.7 });
  const glow = kit.mat('#F9A8D4', { glow: true });
  const seat = kit.mat('#E9D5DE', { rough: 0.5 });

  group.add(walkable((lb) => lotOn(kit, lb, g, 30, '#EBE4E6')));
  const s = groundShell(kit, b, 'music', { base: '#DCD3D5', canopy: 3, canopyColor: '#B08560', glow: '#FFE9C2' });
  plinth(b, kit.mat('#CFC8C2', { rough: 0.9 }), 'music', g);
  // Concha acústica ao ar livre a oeste: palco em meia-lua no chão, concha aberta para o gramado,
  // nervuras sobre a casca (antes saíam para fora dela) e a arquibancada com cada degrau no chão.
  const cx = -18.2;
  const cz = 2;
  const R = 3.6;
  const st = span(g, cx, cz, 3.6);
  const y0 = st.hi + 0.6;
  b.add(wood, new THREE.CylinderGeometry(3.4, 3.5, y0 - st.lo + 0.2, 32, 1, false, Math.PI, Math.PI), [cx, (y0 + st.lo - 0.2) / 2, cz]);
  b.add(white, new THREE.SphereGeometry(R, 32, 16, -Math.PI / 2, Math.PI, 0, Math.PI / 2), [cx, y0, cz], [0, Math.PI, 0]);
  for (let i = 1; i < 4; i++) {
    const dx = i * 0.75;
    b.add(pink, new THREE.TorusGeometry(Math.sqrt(R * R - dx * dx) + 0.02, 0.08, 6, 32, Math.PI), [cx + dx, y0, cz], [0, Math.PI / 2, 0]);
  }
  b.add(glow, new THREE.TorusGeometry(R + 0.05, 0.06, 6, 48, Math.PI), [cx - 0.05, y0, cz], [0, Math.PI / 2, 0]);
  for (let k = 0; k < 4; k++) {
    const r = 6 + k * 1.2;
    const n = 9;
    const step = 0.4 + k * 0.35;
    for (let j = 0; j < n; j++) {
      const a = Math.PI + 0.55 + ((j + 0.5) / n) * (Math.PI - 1.1);
      const x = cx + Math.sin(a) * r;
      const z = cz + Math.cos(a) * r;
      const ss = span(g, x, z, 0.8);
      const t = ss.hi + step;
      const h = t - ss.lo + 0.2;
      b.add(k % 2 ? white : seat, new THREE.BoxGeometry(1.1, h, (r * (Math.PI - 1.1)) / n - 0.05), [x, t - h / 2, z], [0, a + Math.PI / 2, 0]);
    }
  }
  group.add(b.build());
  const sp = signSpot(s, 1.3);
  const sign = signPlane(kit, ['MÚSICA', 'CONSERVATÓRIO MUSICAL'], 5.4, 1.3, '#EC4899');
  sign.position.set(0, sp.y, sp.z);
  group.add(sign, ...plantingOn(kit, g, 251, s.bound + 1.5, 30, 80, ['#F9A8D4', '#FFFFFF', '#C084FC']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * ESPORTES — Centro de Atividades Esportivas (seção 26): funcional, 2 pavimentos, nave larga com
 * cobertura em balanço, vestiários térreos. O campo de futebol e a quadra de tênis do parque ficam
 * onde já estão (amenities.ts): aqui não se repete quadra nem campo. Ao lado da nave, só o espaço
 * complementar que a especificação permite: aquecimento e alongamento, com barras e bancos.
 * ===================================================================== */
export function sportsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const g = groundOf('sports');
  const graphite = kit.mat('#2B3442', { metal: 0.5, rough: 0.4 });
  const silver = kit.mat('#CBD5E1', { metal: 0.85, rough: 0.25 });
  const green = kit.mat('#22C55E', { glow: true });
  const deck = kit.mat('#3C4A5E', { rough: 0.95 });
  const wood = kit.mat('#A0714F', { rough: 0.75 });

  group.add(walkable((lb) => lotOn(kit, lb, g, 38, '#DDDED9')));
  const s = groundShell(kit, b, 'sports', { base: '#D2D3CE', glow: '#FFF6E0' });
  plinth(b, kit.mat('#D2D3CE', { rough: 0.85 }), 'sports', g);
  // Cobertura em balanço sobre a nave (avança sobre a entrada) com a faixa de luz verde.
  const top = MASSING.sports.ground + topLevel('sports') * STOREY;
  b.add(graphite, new THREE.BoxGeometry(41, 0.5, 30), [0, top + 0.9, 1], [0.04, 0, 0]);
  b.add(green, new THREE.BoxGeometry(41, 0.08, 0.12), [0, top + 1.2, 16]);
  // Aquecimento e alongamento ao ar livre, a leste da entrada: piso de borracha no chão, barras de
  // alongamento em duas alturas e bancos.
  const ax = 17;
  const az = 21;
  const pad = span(g, ax, az, 4.5);
  const floor = pad.hi + 0.08;
  b.add(deck, new THREE.BoxGeometry(9, floor - pad.lo + 0.2, 5.5), [ax, (floor + pad.lo - 0.2) / 2, az]);
  for (let k = 0; k < 4; k++) {
    const x = ax - 3.3 + k * 2.2;
    for (const dz of [-1.0, 1.0]) b.add(graphite, new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), [x, floor + 0.75, az - 1.2 + dz * 0.6]);
    for (const y of [0.95, 1.4]) b.add(silver, new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), [x, floor + y, az - 1.2], [Math.PI / 2, 0, 0]);
  }
  for (const x of [ax - 2.2, ax + 2.2]) {
    b.add(wood, new THREE.BoxGeometry(1.8, 0.08, 0.45), [x, floor + 0.45, az + 1.6]);
    for (const dx of [-0.65, 0.65]) b.add(graphite, new THREE.BoxGeometry(0.3, 0.42, 0.4), [x + dx, floor + 0.21, az + 1.6]);
  }
  group.add(b.build());
  const sign = signPlane(kit, ['ESPORTES', 'CENTRO ESPORTIVO'], 6, 1.4, '#22C55E');
  // Na parede da nave, acima da marquise da entrada.
  sign.position.set(0, Math.max(signSpot(s, 1.4).y, 7.2), 12.45);
  group.add(sign, ...plantingOn(kit, g, 263, 36.5, 39.5, 50, ['#86EFAC', '#FFFFFF']));
  return { group, top: s.top, core: s.core };
}
