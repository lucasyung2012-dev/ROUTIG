/**
 * Prédios detalhados da região Central (Bloco 1): Inbox, Dashboard, Profile e Settings,
 * conforme docs/V2-PARQUE-PLANO.md (seção 3). Coordenadas locais: frente (entrada) = +z,
 * base em y = 0, 1 unidade = 1 m. Peças juntadas por material (poucos desenhos por prédio).
 */
import * as THREE from 'three';
import { seededRandom } from '@/domain/park';
import { Builder, shrubs, signTexture, type Kit } from '../kit';
import { groundShell, signSpot } from './shell';
import { MASSING, STOREY, topLevel } from '../massing';

export interface DetailedBuilding {
  group: THREE.Group;
  /** Altura do topo (para o nome do prédio). */
  top: number;
  /** Raio do núcleo construído (colisão da primeira pessoa e da câmera). */
  core: number;
  tick?: (t: number) => void;
}

const SILVER = '#CBD5E1';
const GRAPHITE = '#334155';
const STONE = '#E9E4D8';
const PAVING = '#DDD6C6';

const rnd = seededRandom(101);

/** Piso do lote, meio-fio e canteiros simples (todo prédio detalhado tem o seu). */
export function lotBase(kit: Kit, b: Builder, radius: number, color = PAVING) {
  b.add(kit.mat(color, { rough: 0.85 }), new THREE.CircleGeometry(radius, 64), [0, 0.04, 0], [-Math.PI / 2, 0, 0]);
  b.add(kit.mat('#C9C1AE', { rough: 0.8 }), new THREE.TorusGeometry(radius, 0.15, 6, 96), [0, 0.06, 0], [-Math.PI / 2, 0, 0]);
}

export function signPlane(kit: Kit, lines: string[], w: number, h: number, accent: string): THREE.Mesh {
  const tex = signTexture(kit, lines, { bg: 'rgba(12,24,44,0.94)', fg: '#F1FAFF', accent, w: 1024, h: Math.round((1024 * h) / w) });
  const mat = kit.own(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.5, roughness: 0.4 }));
  return new THREE.Mesh(kit.own(new THREE.PlaneGeometry(w, h)), mat);
}

/** Vegetação em volta: arbustos e flores em anéis, fora do núcleo. */
export function planting(kit: Kit, rMin: number, rMax: number, n: number, palette: string[], skipFront = 0.5): THREE.Object3D[] {
  const bush: Array<{ x: number; z: number; s: number; color: string }> = [];
  const flower: typeof bush = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < skipFront) continue; // caminho de entrada livre
    const r = rMin + rnd() * (rMax - rMin);
    const p = { x: Math.sin(a) * r, z: Math.cos(a) * r };
    if (i % 3 === 0) bush.push({ ...p, s: 0.8 + rnd() * 0.8, color: rnd() > 0.5 ? '#3E8E4A' : '#4F9F55' });
    else flower.push({ ...p, s: 1, color: palette[i % palette.length]! });
  }
  return [shrubs(kit, bush, 'bush'), shrubs(kit, flower, 'flower')];
}

/* =====================================================================
 * INBOX — Central de Recepção (seção 17): volumes retangulares ligados (núcleo de 3 pavimentos,
 * alas de 2, hall de entrada e volume de distribuição térreos), entrada ampla com marquise,
 * jardins tecnológicos na frente e a antena girando sobre o núcleo.
 * ===================================================================== */
export function inboxBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const silver = kit.mat(SILVER, { metal: 0.9, rough: 0.22 });
  const white = kit.mat('#EEF2F7', { rough: 0.5 });
  const cyanGlow = kit.mat('#22D3EE', { glow: true, rough: 0.3 });
  const dark = kit.mat('#1F2A3A', { metal: 0.6, rough: 0.35 });

  lotBase(kit, b, 26.5);
  const s = groundShell(kit, b, 'inbox', { base: '#D9DEE5', canopy: 5, canopyColor: SILVER, glow: '#FFD9A0' });
  // Tubos de distribuição saindo do volume dos fundos para o chão (leitura de "encaminhamento"),
  // dos dois lados do lounge do elevador.
  for (const x of [-7, -5.6, 5.6, 7]) b.add(kit.mat('#CFF3FB', { glass: true }), new THREE.CylinderGeometry(0.35, 0.35, 8.5, 12, 1, true), [x, 4.25, -21.8]);
  b.add(cyanGlow, new THREE.BoxGeometry(17.6, 0.08, 0.1), [0, s.door.glass + 0.32, s.front + 4.95]);
  // Jardins tecnológicos: canteiros com treliça metálica dos dois lados do caminho da porta.
  for (const sx of [-1, 1])
    for (let k = 0; k < 2; k++) {
      const x = sx * (11 + k * 4);
      b.add(white, new THREE.BoxGeometry(3.4, 0.7, 2.4), [x, 0.35, 21]);
      b.add(silver, new THREE.BoxGeometry(0.06, 2.4, 2.4), [x - 1.7, 1.9, 21]);
      b.add(silver, new THREE.BoxGeometry(0.06, 2.4, 2.4), [x + 1.7, 1.9, 21]);
      b.add(silver, new THREE.BoxGeometry(3.4, 0.06, 2.4), [x, 3.1, 21]);
    }
  group.add(b.build());

  // Letreiro na parede do hall de entrada, acima da fachada envidraçada.
  const sp = signSpot(s, 2.2);
  const sign = signPlane(kit, ['INBOX', 'CENTRAL DE RECEPÇÃO'], 9, 2.2, '#22D3EE');
  sign.position.set(0, sp.y, sp.z);
  group.add(sign);

  // Antena girando e luz de topo, sobre o beiral da cobertura do núcleo.
  const roof = MASSING.inbox.ground + topLevel('inbox') * STOREY;
  const mast = new Builder();
  mast.add(dark, new THREE.CylinderGeometry(0.15, 0.3, 6, 8), [0, roof + 6, 0]);
  for (let k = 0; k < 4; k++) mast.add(silver, new THREE.CylinderGeometry(0.04, 0.04, 1.6 - k * 0.3, 6), [0, roof + 4 + k * 1.2, 0], [0, 0, Math.PI / 2]);
  group.add(mast.build());
  const dish = new THREE.Mesh(kit.own(new THREE.SphereGeometry(1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3)), kit.mat(SILVER, { metal: 0.9, rough: 0.22, side: THREE.DoubleSide }));
  dish.rotation.x = -Math.PI / 2.6;
  const dishHolder = new THREE.Group();
  dishHolder.position.set(0, roof + 8.6, 0);
  dishHolder.add(dish);
  const beacon = new THREE.Mesh(kit.own(new THREE.SphereGeometry(0.2, 10, 8)), kit.own(new THREE.MeshBasicMaterial({ color: '#FF4D6D' })));
  beacon.position.set(0, roof + 9.3, 0);
  group.add(dishHolder, beacon);

  // Arbustos nos canteiros e flores em volta.
  const trellis: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) trellis.push({ x: sx * (11 + k * 4) + (j - 1) * 1, y: 0.7, z: 21, s: 0.55, color: '#3E8E4A' });
  group.add(shrubs(kit, trellis, 'bush'), ...planting(kit, s.bound + 1, 26.8, 120, ['#60A5FA', '#22D3EE', '#FFFFFF', '#A78BFA']));

  return {
    group,
    top: s.top,
    core: s.core,
    tick: (t) => {
      dishHolder.rotation.y = t * 0.6;
      (beacon.material as THREE.MeshBasicMaterial).color.setRGB(Math.sin(t * 3) > 0.6 ? 1 : 0.25, 0.1, 0.2);
    },
  };
}

/* =====================================================================
 * DASHBOARD — Observatório Central (3.1): cilindro de vidro sobre base
 * poligonal, anel panorâmico elevado, cobertura de placas com óculo.
 * ===================================================================== */
export function dashboardBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const silver = kit.mat(SILVER, { metal: 0.9, rough: 0.2 });
  const white = kit.mat('#F1F4F8', { rough: 0.45 });
  const stone = kit.mat(STONE, { rough: 0.8 });
  const glass = kit.mat('#8CC8F0', { glass: true });
  const cyanGlow = kit.mat('#22D3EE', { glow: true });
  const turqGlow = kit.mat('#14B8A6', { glow: true });
  const blueGlow = kit.mat('#1E6FD9', { glow: true });
  const warm = kit.mat('#FFE2B0', { glow: true, rough: 0.9 });
  const pool = kit.mat('#3E8FC9', { rough: 0.08, metal: 0.4 });

  lotBase(kit, b, 28, '#E2DCCD');
  // Base poligonal (12 lados) em pedra clara.
  b.add(stone, new THREE.CylinderGeometry(18, 18.6, 1, 12), [0, 0.5, 0]);
  for (let s = 0; s < 3; s++) b.add(stone, new THREE.BoxGeometry(12 - s * 0.5, 0.33, 0.8), [0, 0.165 + s * 0.33, 19.4 - s * 0.7]);
  // Corpo principal: vidro panorâmico (Ø 30, 8 m), montantes a cada ~3 m.
  b.add(glass, new THREE.CylinderGeometry(15, 15, 8, 64, 1, true), [0, 5, 0]);
  b.add(warm, new THREE.CylinderGeometry(14.2, 14.2, 7.4, 32, 1, true), [0, 5, 0]);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.12) continue; // portas
    b.add(silver, new THREE.BoxGeometry(0.16, 8, 0.36), [Math.sin(a) * 15.15, 5, Math.cos(a) * 15.15], [0, a, 0]);
  }
  b.add(silver, new THREE.CylinderGeometry(15.6, 15.6, 0.5, 64), [0, 9.2, 0]);
  // Cobertura: cone baixo + placas triangulares sobrepostas + óculo de vidro.
  b.add(white, new THREE.CylinderGeometry(4, 16.4, 1.6, 12), [0, 10.2, 0]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const plate = new THREE.CylinderGeometry(0, 4.6, 0.18, 3);
    b.add(i % 2 ? white : silver, plate, [Math.sin(a) * 9.5, 10.75 + (i % 2) * 0.15, Math.cos(a) * 9.5], [0.1, a, 0]);
  }
  b.add(kit.mat('#CDEFFB', { glass: true }), new THREE.CylinderGeometry(3.9, 3.9, 0.2, 32), [0, 11.05, 0]);
  b.add(turqGlow, new THREE.TorusGeometry(16.3, 0.1, 6, 96), [0, 9.45, 0], [-Math.PI / 2, 0, 0]);
  // Anel panorâmico (assinatura): aberto em ~300°, a 12 m, sobre pilares inclinados.
  const ringGeo = new THREE.LatheGeometry([new THREE.Vector2(19.2, 0), new THREE.Vector2(21.8, 0), new THREE.Vector2(21.8, 1.3), new THREE.Vector2(19.2, 1.3), new THREE.Vector2(19.2, 0)], 96, Math.PI * 0.18, Math.PI * 1.64);
  b.add(silver, ringGeo, [0, 12, 0]);
  b.add(cyanGlow, new THREE.TorusGeometry(20.5, 0.1, 6, 96, Math.PI * 1.64), [0, 11.95, 0], [-Math.PI / 2, 0, Math.PI * 0.18 - Math.PI / 2]);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.18 + (i / 8) * Math.PI * 1.64;
    const leg = new THREE.CylinderGeometry(0.25, 0.4, 12.6, 10);
    b.add(silver, leg, [Math.sin(a) * 18.6, 6, Math.cos(a) * 18.6], [0, a, 0.22]);
  }
  // Blocos poligonais laterais (Sala de Perfis a oeste, Ações Rápidas a leste).
  for (const s of [-1, 1]) {
    b.add(white, new THREE.CylinderGeometry(6.2, 6.6, 6, 6), [s * 19, 4, -2]);
    b.add(glass, new THREE.CylinderGeometry(6.3, 6.3, 2.4, 6, 1, true), [s * 19, 4.4, -2]);
    b.add(blueGlow, new THREE.TorusGeometry(6.4, 0.07, 6, 6), [s * 19, 7.05, -2], [-Math.PI / 2, 0, 0]);
  }
  // Marquise suspensa de 14 m na entrada.
  b.add(silver, new THREE.BoxGeometry(14, 0.35, 6), [0, 5.2, 18]);
  b.add(cyanGlow, new THREE.BoxGeometry(13.4, 0.06, 0.1), [0, 5.0, 21]);
  for (const s of [-1, 1]) b.add(kit.mat(GRAPHITE, { metal: 0.6 }), new THREE.CylinderGeometry(0.05, 0.05, 6, 6), [s * 5.5, 7.7, 16.4], [-0.75, 0, 0]);
  b.add(kit.mat('#9BE7F5', { glass: true }), new THREE.BoxGeometry(6, 3.6, 0.12), [0, 2.8, 15.05]);
  // Jardins geométricos (triângulos) e espelhos d'água.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    if (Math.cos(a) > 0.9) continue;
    b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.CylinderGeometry(3.4, 3.4, 0.4, 3), [Math.sin(a) * 23.5, 0.25, Math.cos(a) * 23.5], [0, a, 0]);
  }
  for (const [x, z] of [[-9, 22], [9, 22], [-24, -10], [24, -10]] as const) {
    b.add(stone, new THREE.CylinderGeometry(3.2, 3.2, 0.35, 32), [x, 0.18, z]);
    b.add(pool, new THREE.CircleGeometry(2.8, 32), [x, 0.37, z], [-Math.PI / 2, 0, 0]);
  }
  group.add(b.build());
  const sign = signPlane(kit, ['DASHBOARD', 'OBSERVATÓRIO CENTRAL'], 8, 1.9, '#22D3EE');
  sign.position.set(0, 6.6, 21.05);
  group.add(sign, ...planting(kit, 20.5, 27, 140, ['#A78BFA', '#60A5FA', '#FFFFFF', '#F472B6'], 0.35));
  return { group, top: 15, core: 19 };
}

/* =====================================================================
 * PROFILE — Pavilhão da Identidade (3.2): três volumes em "U" (galeria
 * de pedra, bloco de madeira, torre de concreto em balanço) e pátio.
 * ===================================================================== */
export function profileBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const stone = kit.mat('#EDE6D8', { rough: 0.8 });
  const concrete = kit.mat('#B9B4AA', { rough: 0.9 });
  const wood = kit.mat('#A0714F', { rough: 0.75 });
  const glass = kit.mat('#CFE8F2', { glass: true });
  const warmGlow = kit.mat('#FFD9A0', { glow: true, rough: 0.9 });
  const dark = kit.mat('#2B2F36', { metal: 0.5, rough: 0.4 });

  lotBase(kit, b, 24, '#E4DCCB');
  // Galeria (24 × 10 × 6) ao fundo, em pedra clara, com 12 nichos iluminados na fachada.
  b.add(stone, new THREE.BoxGeometry(24, 6, 10), [0, 3, -7]);
  for (let k = 0; k < 12; k++) {
    const x = -10.5 + k * 1.9;
    b.add(dark, new THREE.BoxGeometry(1.2, 1.8, 0.3), [x, 3.2, -1.95]);
    b.add(warmGlow, new THREE.BoxGeometry(1.0, 1.6, 0.1), [x, 3.2, -1.85]);
  }
  b.add(stone, new THREE.BoxGeometry(25.2, 0.3, 11.2), [0, 6.15, -7]);
  b.add(concrete, new THREE.BoxGeometry(18, 0.3, 9), [-2, 6.6, -6.5]);
  // Torre de exposição (10 × 10 × 9) em concreto, a oeste, com balanço de 4 m sobre o pátio.
  b.add(concrete, new THREE.BoxGeometry(10, 9, 10), [-12, 4.5, 6]);
  b.add(concrete, new THREE.BoxGeometry(6, 3, 4.2), [-5, 7.5, 6]);
  b.add(glass, new THREE.BoxGeometry(5.8, 2.4, 4.3), [-5, 7.5, 6]);
  b.add(warmGlow, new THREE.BoxGeometry(0.2, 6, 4), [-6.9, 4, 6]);
  b.add(concrete, new THREE.BoxGeometry(11, 0.35, 11), [-12, 9.2, 6]);
  // Bloco de madeira (14 × 12 × 4,5) a leste.
  b.add(wood, new THREE.BoxGeometry(12, 4.5, 12), [12, 2.25, 6]);
  for (let k = 0; k < 9; k++) b.add(kit.mat('#7A5233', { rough: 0.7 }), new THREE.BoxGeometry(0.2, 4.5, 0.25), [6.6, 2.25, 0.6 + k * 1.35]);
  b.add(glass, new THREE.BoxGeometry(0.2, 3, 9), [6.45, 2.2, 6.5]);
  b.add(wood, new THREE.BoxGeometry(14, 0.3, 13.5), [12, 4.65, 6]);
  // Passagens de vidro (3 m) ligando a galeria aos dois blocos.
  for (const x of [-12, 12]) {
    b.add(glass, new THREE.BoxGeometry(3, 3.2, 4), [x, 1.6, -0.5]);
    b.add(stone, new THREE.BoxGeometry(3.4, 0.25, 4.4), [x, 3.3, -0.5]);
  }
  // Moldura de entrada (8 × 6) em concreto, na frente do pátio.
  b.add(concrete, new THREE.BoxGeometry(0.8, 6, 1.2), [-4, 3, 15]);
  b.add(concrete, new THREE.BoxGeometry(0.8, 6, 1.2), [4, 3, 15]);
  b.add(concrete, new THREE.BoxGeometry(8.8, 0.9, 1.2), [0, 6.45, 15]);
  // Pátio: caminho curvo, banco integrado, árvore isolada e espelho baixo de luz.
  b.add(kit.mat('#CFC6B2', { rough: 0.85 }), new THREE.CircleGeometry(5.5, 40), [0, 0.06, 6], [-Math.PI / 2, 0, 0]);
  b.add(concrete, new THREE.BoxGeometry(5, 0.45, 0.8), [0, 0.45, 2]);
  b.add(wood, new THREE.BoxGeometry(5, 0.1, 0.8), [0, 0.72, 2]);
  b.add(kit.mat('#6B4A33'), new THREE.CylinderGeometry(0.2, 0.3, 3, 8), [2.5, 1.5, 8]);
  b.add(kit.mat('#4C9A4F', { rough: 0.9 }), new THREE.IcosahedronGeometry(2.2, 1), [2.5, 4, 8]);
  for (let k = 0; k < 6; k++) b.add(warmGlow, new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8), [-4 + k * 1.6, 0.3, 12.5]);
  group.add(b.build());
  const sign = signPlane(kit, ['PROFILE', 'PAVILHÃO DA IDENTIDADE'], 6.6, 1.5, '#FFD9A0');
  sign.position.set(0, 7.4, 15.65);
  group.add(sign, ...planting(kit, 17.5, 23.5, 130, ['#F472B6', '#FBBF24', '#FFFFFF', '#F87171']));
  return { group, top: 11, core: 15 };
}

/* =====================================================================
 * SETTINGS — prédio tecnológico e natural com setores (prompt 5): salão
 * hexagonal de vidro e madeira, seis pavilhões de setor com teto verde e
 * uma torre central com anéis que giram devagar.
 * ===================================================================== */
export function settingsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const silver = kit.mat(SILVER, { metal: 0.9, rough: 0.22 });
  const wood = kit.mat('#B08560', { rough: 0.7 });
  const glass = kit.mat('#B8DDF0', { glass: true });
  const moss = kit.mat('#5E9E4C', { rough: 1 });
  const slate = kit.mat('#64748B', { metal: 0.3, rough: 0.5 });
  const glow = kit.mat('#94E2FF', { glow: true });
  const warm = kit.mat('#FFE2B0', { glow: true, rough: 0.9 });

  lotBase(kit, b, 22, '#DAD6CC');
  b.add(kit.mat('#E5E7EB', { rough: 0.5 }), new THREE.CylinderGeometry(11, 11.4, 0.6, 6), [0, 0.3, 0], [0, Math.PI / 6, 0]);
  // Salão central hexagonal (r 7, 7 m).
  b.add(glass, new THREE.CylinderGeometry(7, 7, 6.4, 6, 1, true), [0, 3.8, 0], [0, Math.PI / 6, 0]);
  b.add(warm, new THREE.CylinderGeometry(6.3, 6.3, 6, 6, 1, true), [0, 3.8, 0], [0, Math.PI / 6, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(wood, new THREE.BoxGeometry(0.5, 6.4, 0.5), [Math.sin(a) * 7, 3.8, Math.cos(a) * 7]);
  }
  b.add(wood, new THREE.CylinderGeometry(7.8, 7.8, 0.45, 6), [0, 7.2, 0], [0, Math.PI / 6, 0]);
  // Seis pavilhões de setor, um em cada face, com teto verde (natureza) e faixa de luz.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.3) continue; // face da entrada
    const x = Math.sin(a) * 10.5;
    const z = Math.cos(a) * 10.5;
    b.add(slate, new THREE.CylinderGeometry(3.4, 3.6, 4.2, 6), [x, 2.7, z]);
    b.add(glass, new THREE.CylinderGeometry(3.5, 3.5, 1.4, 6, 1, true), [x, 3.0, z]);
    b.add(moss, new THREE.CylinderGeometry(3.6, 3.6, 0.35, 6), [x, 4.95, z]);
    b.add(glow, new THREE.TorusGeometry(3.55, 0.05, 4, 6), [x, 4.7, z], [-Math.PI / 2, 0, 0]);
  }
  // Torre central com anéis (o "mecanismo" das configurações).
  b.add(silver, new THREE.CylinderGeometry(1.6, 2.2, 6, 12), [0, 10.4, 0]);
  b.add(glow, new THREE.CylinderGeometry(1.7, 1.7, 0.2, 24), [0, 13.5, 0]);
  // Entrada: pórtico de madeira e vidro.
  b.add(wood, new THREE.BoxGeometry(0.5, 4.5, 0.5), [-2.6, 2.85, 10.5]);
  b.add(wood, new THREE.BoxGeometry(0.5, 4.5, 0.5), [2.6, 2.85, 10.5]);
  b.add(wood, new THREE.BoxGeometry(6.2, 0.4, 4.5), [0, 5.2, 9]);
  b.add(kit.mat('#9BE7F5', { glass: true }), new THREE.BoxGeometry(4, 3.4, 0.1), [0, 2.3, 6.2]);
  group.add(b.build());

  // Anéis girando devagar em volta da torre.
  const rings = new THREE.Group();
  rings.position.y = 11;
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(kit.own(new THREE.TorusGeometry(3 + k * 0.9, 0.12, 6, 48)), k === 1 ? kit.mat('#94E2FF', { glow: true }) : silver);
    r.rotation.x = Math.PI / 2 + k * 0.35;
    r.rotation.y = k * 0.6;
    rings.add(r);
  }
  const sign = signPlane(kit, ['SETTINGS', 'CONFIGURAÇÕES'], 5.6, 1.3, '#94E2FF');
  sign.position.set(0, 6, 11.3);
  group.add(rings, sign, ...planting(kit, 14.5, 21.5, 120, ['#FFFFFF', '#93C5FD', '#FDE68A']));
  return {
    group,
    top: 16,
    core: 14,
    tick: (t) => {
      rings.children.forEach((r, k) => (r.rotation.z = t * (0.2 + k * 0.1) * (k % 2 ? -1 : 1)));
    },
  };
}
