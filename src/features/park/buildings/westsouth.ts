/**
 * Prédios detalhados das regiões Oeste e Sul (Bloco 4): Jardim da Concentração (Focus), Estufa de
 * Hábitos (Habits), Jardim das Conquistas (Goals), pavilhão de Música e Complexo Esportivo (Sports).
 * Focus, Habits e Sports seguem o plano (docs/V2-PARQUE-PLANO.md, 3.7 a 3.9); Goals e Music,
 * o prompt principal da V2 (4.17 e 4.13). Frente = +z, base em y = 0, 1 unidade = 1 m.
 */
import * as THREE from 'three';
import { Builder, shrubs, type Kit } from '../kit';
import { lotBase, planting, signPlane, type DetailedBuilding } from './central';

/* =====================================================================
 * FOCUS — Jardim da Concentração (3.7): cúpula baixa de vidro sobre o jardim
 * com água, quatro pavilhões de vidro e galeria circular, deque na margem do lago.
 * ===================================================================== */
export function focusBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const light = kit.mat('#E2E8F0', { metal: 0.6, rough: 0.3 });
  const glass = kit.mat('#CDEFE6', { glass: true });
  const wood = kit.mat('#C9A27A', { rough: 0.7 });
  const water = kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 });
  const glow = kit.mat('#5EEAD4', { glow: true });
  const warm = kit.mat('#FFE9C2', { glow: true, rough: 0.9 });

  lotBase(kit, b, 28, '#E1E6DE');
  // Deque de madeira e espelhos d'água.
  b.add(wood, new THREE.CylinderGeometry(19, 19, 0.3, 64), [0, 0.15, 0]);
  for (const [x, z, r] of [[-15, 12, 3.2], [15, -11, 2.6], [-12, -14, 2.2]] as const) b.add(water, new THREE.CircleGeometry(r, 32), [x, 0.33, z], [-Math.PI / 2, 0, 0]);
  // Cúpula baixa (Ø 24, 8 m) com estrutura fina clara.
  b.add(glass, new THREE.SphereGeometry(12, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.3, 0], [0, 0, 0], [1, 0.66, 1]);
  for (let i = 0; i < 12; i++) b.add(light, new THREE.TorusGeometry(12, 0.08, 4, 32, Math.PI), [0, 0.3, 0], [0, (i / 12) * Math.PI, 0], [1, 0.66, 1]);
  b.add(light, new THREE.TorusGeometry(12, 0.15, 6, 96), [0, 0.4, 0], [-Math.PI / 2, 0, 0]);
  // Jardim interno com água: ilha, árvore e lâmina d'água, visíveis pelo vidro.
  b.add(water, new THREE.CircleGeometry(6, 40), [0, 0.35, 0], [-Math.PI / 2, 0, 0]);
  b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.CylinderGeometry(2.4, 2.6, 0.5, 24), [0, 0.5, 0]);
  b.add(kit.mat('#6B4A33'), new THREE.CylinderGeometry(0.2, 0.3, 3, 8), [0, 2, 0]);
  b.add(kit.mat('#4C9A4F', { rough: 0.9 }), new THREE.IcosahedronGeometry(2, 1), [0, 4.2, 0]);
  // Quatro pavilhões de vidro ligados por uma galeria coberta circular.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.sin(a) * 16;
    const z = Math.cos(a) * 16;
    b.add(glass, new THREE.BoxGeometry(10, 4, 7), [x, 2.3, z], [0, a, 0]);
    b.add(warm, new THREE.BoxGeometry(9.4, 3.6, 6.4), [x, 2.3, z], [0, a, 0]);
    b.add(light, new THREE.BoxGeometry(10.6, 0.3, 7.6), [x, 4.45, z], [0, a, 0]);
    b.add(glow, new THREE.BoxGeometry(10, 0.06, 0.1), [x + Math.sin(a) * 3.8, 4.25, z + Math.cos(a) * 3.8], [0, a, 0]);
  }
  b.add(light, new THREE.TorusGeometry(14, 0.12, 4, 96), [0, 3.4, 0], [-Math.PI / 2, 0, 0]);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    b.add(light, new THREE.CylinderGeometry(0.07, 0.07, 3.1, 6), [Math.sin(a) * 14, 1.85, Math.cos(a) * 14]);
  }
  // Entrada discreta: uma abertura na galeria com placa baixa.
  b.add(wood, new THREE.BoxGeometry(4, 0.2, 2), [0, 3.3, 14.6]);
  group.add(b.build());
  const sign = signPlane(kit, ['FOCUS', 'JARDIM DA CONCENTRAÇÃO'], 4.6, 1.1, '#5EEAD4');
  sign.position.set(0, 1.4, 17.2);
  const grass: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    grass.push({ x: Math.sin(a) * 20.5, y: 0.3, z: Math.cos(a) * 20.5, s: 0.6 + (i % 3) * 0.2, color: '#4F9F55' });
  }
  group.add(sign, shrubs(kit, grass, 'bush'), ...planting(kit, 22, 27, 80, ['#5EEAD4', '#FFFFFF', '#A7F3D0']));
  return { group, top: 10, core: 15 };
}

/* =====================================================================
 * HABITS — Estufa de Hábitos (3.8): nave arqueada segmentada (40 × 16 × 11),
 * duas alas laterais mais baixas e pavilhão de entrada de vidro.
 * ===================================================================== */
export function habitsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const frame = kit.mat('#6B7F75', { metal: 0.6, rough: 0.35 });
  const glass = kit.mat('#D8F2DE', { glass: true });
  const stone = kit.mat('#E6E1D4', { rough: 0.8 });
  const gold = kit.mat('#E6B450', { glow: true });
  const green = kit.mat('#4C9A4F', { rough: 0.9 });

  lotBase(kit, b, 29, '#E0E5D8');
  b.add(stone, new THREE.BoxGeometry(44, 0.6, 20), [0, 0.3, -2]);
  // Nave: meio-cilindro de vidro deitado ao longo de x, com arcos a cada 2,5 m.
  b.add(glass, new THREE.CylinderGeometry(8, 8, 40, 32, 1, true, 0, Math.PI), [0, 0.6, -2], [0, 0, Math.PI / 2]);
  for (let i = 0; i <= 16; i++) b.add(frame, new THREE.TorusGeometry(8, 0.12, 6, 32, Math.PI), [-20 + i * 2.5, 0.6, -2], [0, Math.PI / 2, 0]);
  b.add(frame, new THREE.BoxGeometry(40, 0.2, 0.2), [0, 8.6, -2]);
  // Vegetação dentro da nave (vista pelo vidro).
  for (let i = 0; i < 14; i++) b.add(green, new THREE.IcosahedronGeometry(1.2 + (i % 3) * 0.4, 1), [-17 + i * 2.6, 1.6 + (i % 2) * 0.6, -2 + ((i % 3) - 1) * 3]);
  // Duas alas laterais (18 × 10 × 6) com cobertura arqueada.
  for (const s of [-1, 1]) {
    b.add(glass, new THREE.BoxGeometry(10, 4, 18), [s * 25, 2.6, -2]);
    b.add(glass, new THREE.CylinderGeometry(5, 5, 18, 20, 1, true, 0, Math.PI), [s * 25, 4.6, -2], [Math.PI / 2, 0, 0]);
    for (let i = 0; i <= 6; i++) b.add(frame, new THREE.TorusGeometry(5, 0.1, 6, 20, Math.PI), [s * 25, 4.6, -11 + i * 3]);
  }
  // Pavilhão de entrada de vidro (8 × 8 × 6).
  b.add(glass, new THREE.BoxGeometry(8, 6, 8), [0, 3.6, 10]);
  for (const x of [-4, 4]) for (const z of [6, 14]) b.add(frame, new THREE.BoxGeometry(0.25, 6, 0.25), [x, 3.6, z]);
  b.add(frame, new THREE.BoxGeometry(8.6, 0.3, 8.6), [0, 6.7, 10]);
  b.add(gold, new THREE.BoxGeometry(8, 0.06, 0.1), [0, 6.5, 14.35]);
  // Canteiros e caminhos sinuosos na frente.
  for (let i = 0; i < 6; i++) b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.CylinderGeometry(2.4, 2.4, 0.3, 20), [-17 + i * 6.8, 0.2, 17 + Math.sin(i) * 2]);
  group.add(b.build());
  const sign = signPlane(kit, ['HABITS', 'ESTUFA DE HÁBITOS'], 5.4, 1.3, '#E6B450');
  sign.position.set(0, 7.6, 14.4);
  const flowers: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (let i = 0; i < 6; i++) for (let k = 0; k < 14; k++) flowers.push({ x: -17 + i * 6.8 + Math.sin(k * 2.3) * 1.8, y: 0.3, z: 17 + Math.sin(i) * 2 + Math.cos(k * 2.3) * 1.8, s: 1, color: ['#FBBF24', '#F472B6', '#FFFFFF', '#A78BFA'][k % 4]! });
  group.add(sign, shrubs(kit, flowers, 'flower'), ...planting(kit, 24, 28.5, 80, ['#FBBF24', '#FFFFFF']));
  return { group, top: 12, core: 22 };
}

/* =====================================================================
 * GOALS — Jardim das Conquistas (prompt 4.17): cinco terraços subindo até um
 * mirante com um marco luminoso; cada terraço é um dos cinco espaços.
 * ===================================================================== */
export function goalsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const stone = kit.mat('#E9E2D0', { rough: 0.8 });
  const gold = kit.mat('#EAB308', { metal: 0.6, rough: 0.3 });
  const glow = kit.mat('#FDE68A', { glow: true });
  const green = kit.mat('#5E9E4C', { rough: 1 });
  const glass = kit.mat('#FEF3C7', { glass: true });

  lotBase(kit, b, 28, '#E4E2D4');
  // Cinco terraços em degraus (cada um com grama e borda de pedra).
  for (let k = 0; k < 5; k++) {
    const r = 18 - k * 3.2;
    b.add(stone, new THREE.CylinderGeometry(r, r + 0.3, 1.2, 40), [0, 0.6 + k * 1.2, -k * 1.2]);
    b.add(green, new THREE.CylinderGeometry(r - 0.6, r - 0.6, 0.1, 40), [0, 1.25 + k * 1.2, -k * 1.2]);
    // Escada central subindo pela frente.
    b.add(stone, new THREE.BoxGeometry(3, 1.2, 1.2), [0, 0.6 + k * 1.2, r - k * 1.2 - 0.4]);
  }
  // Mirante no topo: pavilhão de vidro e o marco (obelisco dourado com luz no topo).
  b.add(glass, new THREE.CylinderGeometry(3.4, 3.4, 3, 6, 1, true), [0, 7.6, -4.8]);
  b.add(gold, new THREE.CylinderGeometry(3.9, 3.9, 0.3, 6), [0, 9.2, -4.8]);
  b.add(gold, new THREE.CylinderGeometry(0.3, 0.7, 7, 4), [0, 12.8, -4.8]);
  b.add(glow, new THREE.OctahedronGeometry(0.8, 0), [0, 16.8, -4.8]);
  // Pedestais nos terraços (lugares das conquistas).
  for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.6 + Math.PI;
    const r = 16 - k * 3.2;
    b.add(stone, new THREE.BoxGeometry(0.8, 1, 0.8), [Math.sin(a) * r, 1.8 + k * 1.2, -k * 1.2 + Math.cos(a) * r]);
    b.add(glow, new THREE.SphereGeometry(0.22, 10, 8), [Math.sin(a) * r, 2.5 + k * 1.2, -k * 1.2 + Math.cos(a) * r]);
  }
  group.add(b.build());
  const sign = signPlane(kit, ['GOALS', 'JARDIM DAS CONQUISTAS'], 5.4, 1.3, '#EAB308');
  sign.position.set(0, 1.9, 18.6);
  const flowers: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (let k = 0; k < 5; k++) for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const r = 17.2 - k * 3.2;
    if (Math.cos(a) > 0.97) continue;
    flowers.push({ x: Math.sin(a) * r, y: 1.2 + k * 1.2, z: -k * 1.2 + Math.cos(a) * r, s: 1, color: ['#FDE68A', '#F472B6', '#FFFFFF'][i % 3]! });
  }
  group.add(sign, shrubs(kit, flowers, 'flower'), ...planting(kit, 21, 27, 60, ['#FDE68A', '#FFFFFF']));
  return { group, top: 18, core: 18 };
}

/* =====================================================================
 * MUSIC — pavilhão artístico com anfiteatro (prompt 4.13): concha acústica
 * sobre o palco, arquibancada em meia-lua voltada para o lago, prédio dos espaços atrás.
 * ===================================================================== */
export function musicBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const white = kit.mat('#F7F2F5', { rough: 0.45 });
  const pink = kit.mat('#EC4899', { metal: 0.3, rough: 0.35 });
  const glass = kit.mat('#F5D0E4', { glass: true });
  const wood = kit.mat('#B08560', { rough: 0.7 });
  const glow = kit.mat('#F9A8D4', { glow: true });
  const warm = kit.mat('#FFE9C2', { glow: true, rough: 0.9 });

  lotBase(kit, b, 31, '#EBE4E6');
  // Prédio dos espaços (atrás do palco): volume curvo de vidro.
  b.add(glass, new THREE.CylinderGeometry(14, 14, 7, 40, 1, true, Math.PI * 0.65, Math.PI * 0.7), [0, 3.5, -2]);
  b.add(warm, new THREE.CylinderGeometry(13.4, 13.4, 6.4, 40, 1, true, Math.PI * 0.65, Math.PI * 0.7), [0, 3.5, -2]);
  b.add(white, new THREE.CylinderGeometry(14.6, 14.6, 0.5, 40, 1, false, Math.PI * 0.65, Math.PI * 0.7), [0, 7.2, -2]);
  // Palco e concha acústica (meia cúpula aberta para a frente).
  b.add(wood, new THREE.CylinderGeometry(7, 7.2, 1, 32, 1, false, -Math.PI / 2, Math.PI), [0, 0.5, -6]);
  b.add(white, new THREE.SphereGeometry(9, 32, 16, -Math.PI / 2, Math.PI, 0, Math.PI / 2), [0, 0.5, -6], [0, Math.PI, 0], [1, 1.05, 0.9]);
  for (let i = 0; i < 7; i++) b.add(pink, new THREE.TorusGeometry(9 - i * 0.02, 0.12, 6, 32, Math.PI), [0, 0.5, -6 - i * 1.1], [0, 0, 0], [1, 1.05, 1]);
  b.add(glow, new THREE.TorusGeometry(9.05, 0.08, 6, 48, Math.PI), [0, 0.5, -5.9], [0, 0, 0], [1, 1.05, 1]);
  // Arquibancada em meia-lua (8 fileiras).
  for (let k = 0; k < 8; k++) {
    const r = 10 + k * 1.6;
    b.add(k % 2 ? white : kit.mat('#E9D5DE', { rough: 0.5 }), new THREE.CylinderGeometry(r + 1.6, r + 1.6, 0.45 + k * 0.45, 48, 1, false, -Math.PI * 0.42, Math.PI * 0.84), [0, (0.45 + k * 0.45) / 2, -6]);
  }
  // Instrumentos estilizados no palco (formas simples).
  b.add(kit.mat('#1F2A3A', { metal: 0.5 }), new THREE.BoxGeometry(2.4, 1, 1.2), [-2.5, 1.5, -8]);
  b.add(wood, new THREE.CylinderGeometry(0.6, 0.8, 0.8, 16), [2.6, 1.4, -8]);
  group.add(b.build());
  const sign = signPlane(kit, ['MÚSICA', 'PAVILHÃO ARTÍSTICO'], 5.4, 1.3, '#EC4899');
  sign.position.set(0, 9, 3.2);
  group.add(sign, ...planting(kit, 26, 30, 80, ['#F9A8D4', '#FFFFFF', '#C084FC']));
  return { group, top: 12, core: 12 };
}

/* =====================================================================
 * SPORTS — Complexo Esportivo (3.9): nave angular (48 × 26 × 10) com cobertura
 * assimétrica em balanço, quadra de tênis e campo reduzido ao ar livre, arquibancada.
 * ===================================================================== */
export function sportsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const graphite = kit.mat('#2B3442', { metal: 0.5, rough: 0.4 });
  const silver = kit.mat('#CBD5E1', { metal: 0.85, rough: 0.25 });
  const green = kit.mat('#22C55E', { glow: true });
  const glass = kit.mat('#BFE8CF', { glass: true });
  const court = kit.mat('#3B82F6', { rough: 0.8 });
  const field = kit.mat('#4CAF50', { rough: 0.9 });
  const line = kit.mat('#FFFFFF', { rough: 0.6 });
  const warm = kit.mat('#FFF6E0', { glow: true, rough: 0.9 });

  lotBase(kit, b, 36, '#DDDED9');
  // Nave principal com cobertura assimétrica e balanços de 8 m.
  b.add(glass, new THREE.BoxGeometry(30, 8, 20), [-8, 4, -12]);
  b.add(warm, new THREE.BoxGeometry(29, 7.4, 19), [-8, 4, -12]);
  for (let i = 0; i < 11; i++) b.add(silver, new THREE.BoxGeometry(0.4, 8, 0.6), [-22.5 + i * 2.9, 4, -1.8]);
  b.add(graphite, new THREE.BoxGeometry(40, 0.6, 26), [-8, 8.9, -11], [0.06, 0, -0.05]);
  b.add(green, new THREE.BoxGeometry(40, 0.08, 0.12), [-8, 8.5, 2]);
  // Linhas de quadra no pátio de entrada.
  b.add(kit.mat('#CFC6B2', { rough: 0.85 }), new THREE.BoxGeometry(14, 0.06, 10), [-8, 0.05, 6]);
  for (const z of [1.5, 10.5]) b.add(line, new THREE.BoxGeometry(13, 0.02, 0.15), [-8, 0.1, z]);
  // Quadra de tênis ao ar livre (azul, com rede).
  b.add(court, new THREE.BoxGeometry(11, 0.08, 23.8), [17, 0.08, -4]);
  for (const x of [11.6, 22.4]) b.add(line, new THREE.BoxGeometry(0.1, 0.02, 23.8), [x, 0.13, -4]);
  for (const z of [-15.8, 7.8, -4]) b.add(line, new THREE.BoxGeometry(11, 0.02, 0.1), [17, 0.13, z]);
  b.add(graphite, new THREE.BoxGeometry(12, 1, 0.05), [17, 0.6, -4]);
  // Campo reduzido de futebol com traves.
  b.add(field, new THREE.BoxGeometry(20, 0.08, 13), [-6, 0.08, 20]);
  b.add(line, new THREE.BoxGeometry(0.1, 0.02, 13), [-6, 0.13, 20]);
  b.add(line, new THREE.TorusGeometry(2, 0.05, 4, 32), [-6, 0.13, 20], [-Math.PI / 2, 0, 0]);
  for (const x of [-16, 4]) {
    b.add(line, new THREE.BoxGeometry(0.1, 2, 0.1), [x, 1, 18.5]);
    b.add(line, new THREE.BoxGeometry(0.1, 2, 0.1), [x, 1, 21.5]);
    b.add(line, new THREE.BoxGeometry(0.1, 0.1, 3.1), [x, 2, 20]);
  }
  // Arquibancada voltada para a quadra.
  for (let k = 0; k < 5; k++) b.add(k % 2 ? silver : graphite, new THREE.BoxGeometry(2, 0.5 + k * 0.5, 22), [26.5 + k * 1.2, (0.5 + k * 0.5) / 2, -4]);
  // Refletores.
  for (const [x, z] of [[11, -17], [23, -17], [11, 9], [23, 9]] as const) {
    b.add(graphite, new THREE.CylinderGeometry(0.15, 0.2, 10, 6), [x, 5, z]);
    b.add(kit.mat('#F8FAFC', { glow: true }), new THREE.BoxGeometry(1.4, 0.6, 0.4), [x, 10, z]);
  }
  group.add(b.build());
  const sign = signPlane(kit, ['SPORTS', 'COMPLEXO ESPORTIVO'], 6, 1.4, '#22C55E');
  sign.position.set(-8, 6.4, -1.4);
  group.add(sign, ...planting(kit, 30, 35, 70, ['#86EFAC', '#FFFFFF']));
  return { group, top: 11, core: 22 };
}
