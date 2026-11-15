/**
 * Prédios detalhados das regiões Oeste e Sul (Bloco 4): Jardim da Concentração (Focus), Estufa de
 * Hábitos (Habits), Centro de Objetivos (Goals), Conservatório de Música e Centro Esportivo. O
 * térreo de cada um sai da volumetria do prédio (massing.ts), a mesma planta do interior
 * (shell.ts); aqui ficam a entrada, o letreiro, o paisagismo e o que é só de cada prédio.
 * Frente = +z, base em y = 0, 1 unidade = 1 m.
 */
import * as THREE from 'three';
import { Builder, shrubs, type Kit } from '../kit';
import { lotBase, planting, signPlane, type DetailedBuilding } from './central';
import { groundShell, signSpot } from './shell';
import { MASSING, STOREY, topLevel, volsAt } from '../massing';
import { insideAt } from '../outline';

/* =====================================================================
 * FOCUS — Jardim da Concentração (seção 21), na ilha: volumes baixos e horizontais em volta do
 * pavilhão redondo do jardim central (com a claraboia), bloco dos fundos com o mezanino, deque
 * de madeira e espelhos d'água.
 * ===================================================================== */
export function focusBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const wood = kit.mat('#C9A27A', { rough: 0.7 });
  const water = kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 });

  lotBase(kit, b, 27, '#E1E6DE');
  // Deque de madeira em volta do prédio e espelhos d'água entre as alas.
  b.add(wood, new THREE.CylinderGeometry(24, 24, 0.12, 64), [0, 0.06, 0]);
  for (const [x, z, r] of [[-15, 12, 3.2], [15, -11, 2.6], [-15, -14, 2.2]] as const) b.add(water, new THREE.CircleGeometry(r, 32), [x, 0.14, z], [-Math.PI / 2, 0, 0]);
  const s = groundShell(kit, b, 'focus', { base: '#CDBFA8', roof: '#D9E6D3', canopy: 2.5, canopyColor: '#C9A27A', glow: '#FFE9C2' });
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
    if (!insideAt(g0, x, z, -1)) grass.push({ x, y: 0.12, z, s: 0.6 + (i % 3) * 0.2, color: '#4F9F55' });
  }
  group.add(sign, shrubs(kit, grass, 'bush'), ...planting(kit, 24.5, 27.5, 80, ['#5EEAD4', '#FFFFFF', '#A7F3D0']));
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
  const frame = kit.mat('#6B7F75', { metal: 0.6, rough: 0.35 });
  const gold = kit.mat('#E6B450', { glow: true });

  lotBase(kit, b, 27.5, '#E0E5D8');
  const s = groundShell(kit, b, 'habits', { base: '#D3D9CB', roof: '#E3EADF', canopy: 2.5, canopyColor: '#6B7F75', glow: '#CFEFD2' });
  // Montantes da estufa sobre a cobertura da nave (as mesmas linhas dos arcos de dentro).
  const H = MASSING.habits.ground;
  const nave = MASSING.habits.vols[0]!;
  const d = nave.kind === 'rect' ? nave.d : 20;
  for (let i = 0; i < 9; i++) b.add(frame, new THREE.BoxGeometry(0.18, 0.5, d), [-16 + i * 4, H + 0.6, nave.cz]);
  b.add(gold, new THREE.BoxGeometry(9.6, 0.06, 0.1), [0, s.door.glass + 0.32, s.front + 2.45]);
  // Canteiros e caminhos sinuosos na frente (o eixo da porta fica livre).
  const beds: Array<[number, number]> = [];
  for (const x of [-18.5, -12, -5.5, 5.5, 12, 18.5]) beds.push([x, 19 + Math.sin(x) * 1.5]);
  for (const [x, z] of beds) b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.CylinderGeometry(2.2, 2.2, 0.3, 20), [x, 0.2, z]);
  group.add(b.build());
  const sp = signSpot(s, 1.3);
  const sign = signPlane(kit, ['HABITS', 'ESTUFA DE HÁBITOS'], 5.4, 1.3, '#E6B450');
  sign.position.set(0, sp.y, sp.z);
  const flowers: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  beds.forEach(([bx, bz], i) => {
    for (let k = 0; k < 12; k++) flowers.push({ x: bx + Math.sin(k * 2.3 + i) * 1.7, y: 0.3, z: bz + Math.cos(k * 2.3 + i) * 1.7, s: 1, color: ['#FBBF24', '#F472B6', '#FFFFFF', '#A78BFA'][k % 4]! });
  });
  group.add(sign, shrubs(kit, flowers, 'flower'), ...planting(kit, s.bound + 1.5, 27.8, 80, ['#FBBF24', '#FFFFFF']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * GOALS — Centro de Objetivos (seção 23): volumes geométricos ligados, composição vertical (torre
 * sobre o embasamento hexagonal), átrio-jardim central; marco dourado na praça de entrada.
 * ===================================================================== */
export function goalsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const stone = kit.mat('#E9E2D0', { rough: 0.8 });
  const gold = kit.mat('#EAB308', { metal: 0.6, rough: 0.3 });
  const glow = kit.mat('#FDE68A', { glow: true });

  lotBase(kit, b, 27, '#E4E2D4');
  const s = groundShell(kit, b, 'goals', { base: '#D9D3C2', canopy: 2.5, canopyColor: '#EAB308', glow: '#FFE9C2' });
  // Torre: friso dourado no alto, marcando a composição vertical.
  const top = MASSING.goals.ground + topLevel('goals') * STOREY;
  for (const r of s.runs) if (r.vol === 1) b.add(gold, new THREE.BoxGeometry(0.12, 0.25, r.len), [(r.ax + r.bx) / 2 + r.nx * 0.2, top - 0.3, (r.az + r.bz) / 2 + r.nz * 0.2], [0, Math.atan2(r.bx - r.ax, r.bz - r.az), 0]);
  // Marco na praça da entrada (fora do eixo da porta): obelisco dourado com a luz no topo e três pedestais.
  const mx = -8.5;
  const mz = 20.5;
  b.add(stone, new THREE.CylinderGeometry(2.6, 2.8, 0.4, 6), [mx, 0.2, mz]);
  b.add(gold, new THREE.CylinderGeometry(0.3, 0.7, 7, 4), [mx, 3.9, mz]);
  b.add(glow, new THREE.OctahedronGeometry(0.8, 0), [mx, 7.9, mz]);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    b.add(stone, new THREE.BoxGeometry(0.8, 1, 0.8), [mx + Math.sin(a) * 4, 0.5, mz + Math.cos(a) * 4]);
    b.add(glow, new THREE.SphereGeometry(0.22, 10, 8), [mx + Math.sin(a) * 4, 1.2, mz + Math.cos(a) * 4]);
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
    flowers.push({ x, y: 0.05, z, s: 1, color: ['#FDE68A', '#F472B6', '#FFFFFF'][i % 3]! });
  }
  group.add(sign, shrubs(kit, flowers, 'flower'), ...planting(kit, 20.5, 27.5, 60, ['#FDE68A', '#FFFFFF']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * MÚSICA — Conservatório Musical (seção 25): volumes assimétricos de alturas diferentes (salão,
 * torre do auditório deslocada, ala baixa), madeira e concreto; concha acústica ao ar livre a
 * oeste com a arquibancada em arco.
 * ===================================================================== */
export function musicBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const white = kit.mat('#F7F2F5', { rough: 0.45 });
  const pink = kit.mat('#EC4899', { metal: 0.3, rough: 0.35 });
  const wood = kit.mat('#B08560', { rough: 0.7 });
  const glow = kit.mat('#F9A8D4', { glow: true });

  lotBase(kit, b, 30, '#EBE4E6');
  const s = groundShell(kit, b, 'music', { base: '#DCD3D5', canopy: 3, canopyColor: '#B08560', glow: '#FFE9C2' });
  // Concha acústica ao ar livre a oeste: palco em meia-lua, concha aberta para o gramado e a arquibancada.
  const cx = -18.2;
  const cz = 2;
  b.add(wood, new THREE.CylinderGeometry(3.4, 3.5, 0.6, 32, 1, false, Math.PI, Math.PI), [cx, 0.3, cz]);
  b.add(white, new THREE.SphereGeometry(3.6, 32, 16, -Math.PI / 2, Math.PI, 0, Math.PI / 2), [cx, 0.6, cz], [0, Math.PI, 0]);
  for (let i = 0; i < 4; i++) b.add(pink, new THREE.TorusGeometry(3.6 - i * 0.02, 0.1, 6, 32, Math.PI), [cx + i * 0.6, 0.6, cz], [0, Math.PI / 2, 0]);
  b.add(glow, new THREE.TorusGeometry(3.65, 0.06, 6, 48, Math.PI), [cx - 0.05, 0.6, cz], [0, Math.PI / 2, 0]);
  for (let k = 0; k < 4; k++) {
    const r = 6 + k * 1.2;
    const n = 9;
    for (let j = 0; j < n; j++) {
      const a = Math.PI + 0.55 + ((j + 0.5) / n) * (Math.PI - 1.1);
      b.add(k % 2 ? white : kit.mat('#E9D5DE', { rough: 0.5 }), new THREE.BoxGeometry(1.1, 0.4 + k * 0.35, (r * (Math.PI - 1.1)) / n - 0.05), [cx + Math.sin(a) * r, (0.4 + k * 0.35) / 2, cz + Math.cos(a) * r], [0, a + Math.PI / 2, 0]);
    }
  }
  group.add(b.build());
  const sp = signSpot(s, 1.3);
  const sign = signPlane(kit, ['MÚSICA', 'CONSERVATÓRIO MUSICAL'], 5.4, 1.3, '#EC4899');
  sign.position.set(0, sp.y, sp.z);
  group.add(sign, ...planting(kit, s.bound + 1.5, 30, 80, ['#F9A8D4', '#FFFFFF', '#C084FC']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * ESPORTES — Centro de Atividades Esportivas (seção 26): funcional, 2 pavimentos, nave larga com
 * cobertura em balanço, vestiários térreos; a quadra de tênis e o campo reduzido de antes, ao ar
 * livre ao lado da nave, com a arquibancada e os refletores.
 * ===================================================================== */
export function sportsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const graphite = kit.mat('#2B3442', { metal: 0.5, rough: 0.4 });
  const silver = kit.mat('#CBD5E1', { metal: 0.85, rough: 0.25 });
  const green = kit.mat('#22C55E', { glow: true });
  const court = kit.mat('#3B82F6', { rough: 0.8 });
  const field = kit.mat('#4CAF50', { rough: 0.9 });
  const line = kit.mat('#FFFFFF', { rough: 0.6 });

  lotBase(kit, b, 38, '#DDDED9');
  const s = groundShell(kit, b, 'sports', { base: '#D2D3CE', glow: '#FFF6E0' });
  // Cobertura em balanço sobre a nave (avança sobre a entrada) com a faixa de luz verde.
  const top = MASSING.sports.ground + topLevel('sports') * STOREY;
  b.add(graphite, new THREE.BoxGeometry(41, 0.5, 30), [0, top + 0.9, 1], [0.04, 0, 0]);
  b.add(green, new THREE.BoxGeometry(41, 0.08, 0.12), [0, top + 1.2, 16]);
  // Quadra de tênis ao ar livre (azul, com rede) a leste, arquibancada entre ela e a nave.
  const tx = 27.5;
  const tz = -8;
  b.add(court, new THREE.BoxGeometry(11, 0.08, 23.8), [tx, 0.08, tz]);
  for (const x of [tx - 5.4, tx + 5.4]) b.add(line, new THREE.BoxGeometry(0.1, 0.02, 23.8), [x, 0.13, tz]);
  for (const z of [tz - 11.8, tz + 11.8, tz]) b.add(line, new THREE.BoxGeometry(11, 0.02, 0.1), [tx, 0.13, z]);
  b.add(graphite, new THREE.BoxGeometry(12, 1, 0.05), [tx, 0.6, tz]);
  for (let k = 0; k < 2; k++) b.add(k % 2 ? silver : graphite, new THREE.BoxGeometry(1.2, 0.5 + k * 0.5, 20), [20.2 + k * 1.2, (0.5 + k * 0.5) / 2, tz]);
  // Campo reduzido de futebol com traves, na frente a leste (o caminho da porta fica livre).
  const fx = 16;
  const fz = 21.5;
  b.add(field, new THREE.BoxGeometry(20, 0.08, 13), [fx, 0.08, fz]);
  b.add(line, new THREE.BoxGeometry(0.1, 0.02, 13), [fx, 0.13, fz]);
  b.add(line, new THREE.TorusGeometry(2, 0.05, 4, 32), [fx, 0.13, fz], [-Math.PI / 2, 0, 0]);
  for (const x of [fx - 10, fx + 10]) {
    b.add(line, new THREE.BoxGeometry(0.1, 2, 0.1), [x, 1, fz - 1.5]);
    b.add(line, new THREE.BoxGeometry(0.1, 2, 0.1), [x, 1, fz + 1.5]);
    b.add(line, new THREE.BoxGeometry(0.1, 0.1, 3.1), [x, 2, fz]);
  }
  // Refletores nos cantos da quadra.
  for (const [x, z] of [[tx - 6, tz - 12.5], [tx + 6, tz - 12.5], [tx - 6, tz + 12.5], [tx + 6, tz + 12.5]] as const) {
    b.add(graphite, new THREE.CylinderGeometry(0.15, 0.2, 10, 6), [x, 5, z]);
    b.add(kit.mat('#F8FAFC', { glow: true }), new THREE.BoxGeometry(1.4, 0.6, 0.4), [x, 10, z]);
  }
  group.add(b.build());
  const sign = signPlane(kit, ['ESPORTES', 'CENTRO ESPORTIVO'], 6, 1.4, '#22C55E');
  // Na parede da nave, acima da marquise da entrada.
  sign.position.set(0, Math.max(signSpot(s, 1.4).y, 7.2), 12.45);
  group.add(sign, ...planting(kit, 36.5, 39.5, 50, ['#86EFAC', '#FFFFFF']));
  return { group, top: s.top, core: s.core };
}
