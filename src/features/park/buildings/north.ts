/**
 * Prédios detalhados da região Norte (Bloco 2): Biblioteca Digital, Ateliê de Conhecimento (Notes),
 * Academy, Idiomas e Insights. O térreo de cada um sai da volumetria do prédio (massing.ts), a
 * mesma planta do interior (shell.ts); aqui ficam a entrada, o letreiro, o paisagismo e o que é só
 * de cada prédio. Coordenadas locais: frente = +z, base em y = 0, 1 unidade = 1 m.
 */
import * as THREE from 'three';
import { Builder, shrubs, type Kit } from '../kit';
import { lotBase, planting, signPlane, type DetailedBuilding } from './central';
import { groundShell, signSpot } from './shell';
import { MASSING, STOREY, topLevel } from '../massing';

const SILVER = '#CBD5E1';

/* =====================================================================
 * LIBRARY — Biblioteca Digital (seção 16): volumes retangulares ligados, átrio central de
 * pé-direito duplo, grandes áreas envidraçadas; pórtico de entrada com adro e rampa.
 * ===================================================================== */
export function libraryBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const stone = kit.mat('#ECE7DC', { rough: 0.8 });
  const emerald = kit.mat('#34D399', { glow: true, rough: 0.4 });

  lotBase(kit, b, 29, '#E2DCCD');
  const s = groundShell(kit, b, 'library', { base: '#D8D1C2', canopy: 3.5, canopyColor: SILVER, glow: '#FFF1D6' });
  // Faixas de pedra por galeria nas fachadas do bloco principal (as "prateleiras" da biblioteca),
  // na altura das galerias de dentro.
  for (const y of [4.7, 9.4])
    for (const r of s.runs) if (r.vol === 0 && r.from === 0) b.add(stone, new THREE.BoxGeometry(0.5, 0.45, r.len), [(r.ax + r.bx) / 2 + r.nx * 0.3, y, (r.az + r.bz) / 2 + r.nz * 0.3], [0, Math.atan2(r.bx - r.ax, r.bz - r.az), 0]);
  // Adro de pedra diante do pórtico, rampa sem barreiras ao lado e a faixa de luz da marquise.
  b.add(stone, new THREE.BoxGeometry(14, 0.1, 6), [0, 0.05, s.front + 3.2]);
  b.add(stone, new THREE.BoxGeometry(2.2, 0.12, 8), [8.6, 0.06, s.front + 3.5]);
  b.add(emerald, new THREE.BoxGeometry(11.4, 0.06, 0.1), [0, s.door.glass + 0.32, s.front + 3.45]);
  // Bancos de leitura junto às pontas das alas.
  for (const sx of [-1, 1]) for (const z of [-4, 3]) b.add(kit.mat('#A0714F', { rough: 0.7 }), new THREE.BoxGeometry(0.6, 0.45, 3), [sx * 24.6, 0.25, z]);
  group.add(b.build());
  const sp = signSpot(s, 1.9);
  const sign = signPlane(kit, ['LIBRARY', 'BIBLIOTECA DIGITAL'], 8, 1.9, '#34D399');
  // O letreiro vai na parede do bloco principal, acima do pórtico.
  sign.position.set(0, Math.max(sp.y, 8.6), 16.25);
  const bushes: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) bushes.push({ x: sx * (25.5 + (k % 2) * 1.5), y: 0.05, z: -6 + k * 2.6, s: 0.8, color: '#3E8E4A' });
  group.add(sign, shrubs(kit, bushes, 'bush'), ...planting(kit, s.bound + 1.5, 29.5, 90, ['#FFFFFF', '#60A5FA', '#34D399']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * NOTES — Ateliê de Conhecimento (seção 15): planta retangular, composição horizontal, dois
 * pavimentos; ateliê térreo com cobertura em dente de serra e recepção de ideias mais baixa.
 * ===================================================================== */
export function notesBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const wood = kit.mat('#B8875A', { rough: 0.7 });
  const paper = kit.mat('#F3EBDD', { rough: 0.9 });
  const graphite = kit.mat('#3B4252', { metal: 0.5, rough: 0.4 });
  const violet = kit.mat('#8B7CF6', { glow: true, rough: 0.4 });

  lotBase(kit, b, 27, '#E6DFD0');
  const s = groundShell(kit, b, 'notes', { base: '#D9CFBD', canopy: 4, canopyColor: '#B8875A', glow: '#FFE2B0' });
  // Ateliê (ala leste, térrea): cobertura em dente de serra com claraboias, nas mesmas faixas de
  // luz que se veem por dentro.
  const H = MASSING.notes.ground;
  for (let k = 0; k < 4; k++) {
    const z = -7 + k * 4.4;
    b.add(graphite, new THREE.BoxGeometry(11.2, 0.25, 3.6), [17, H + 0.75, z], [-0.32, 0, 0]);
    b.add(kit.mat('#CDEFFB', { glass: true }), new THREE.BoxGeometry(10.8, 1.1, 0.1), [17, H + 0.85, z + 1.7]);
  }
  // Recepção de ideias (ala oeste, mais baixa): painel de "camadas de papel" na frente.
  for (let k = 0; k < 9; k++) b.add(k % 2 ? paper : kit.mat('#E7DCC8', { rough: 0.9 }), new THREE.BoxGeometry(8, 0.42, 0.3 + (k % 3) * 0.12), [-16.5, 0.5 + k * 0.5, 7.3]);
  b.add(violet, new THREE.BoxGeometry(23.8, 0.08, 0.1), [0, s.door.glass + 0.2, s.front + 0.25]);
  // Pátio silencioso ao lado da entrada: espelho d'água estreito, bambus e cadeiras de leitura.
  b.add(kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }), new THREE.BoxGeometry(9, 0.08, 1.6), [9, 0.12, 16.5]);
  b.add(kit.mat('#BDB4A2', { rough: 0.8 }), new THREE.BoxGeometry(9.8, 0.25, 2.4), [9, 0.06, 16.5]);
  for (let i = 0; i < 18; i++) b.add(kit.mat('#5E9E4C', { rough: 0.8 }), new THREE.CylinderGeometry(0.06, 0.08, 4 + (i % 4) * 0.7, 5), [15 + (i % 6) * 0.7, 2.2, 10.5 + Math.floor(i / 6) * 0.8]);
  for (let k = 0; k < 3; k++) b.add(wood, new THREE.BoxGeometry(1.4, 0.5, 1.4), [4 + k * 3.2, 0.25, 19.2]);
  group.add(b.build());
  const sp = signSpot(s, 1.5);
  const sign = signPlane(kit, ['NOTES', 'ATELIÊ DE CONHECIMENTO'], 6.4, 1.5, '#8B7CF6');
  sign.position.set(0, sp.y, sp.z);
  group.add(sign, ...planting(kit, s.bound + 1, 27.5, 100, ['#A78BFA', '#FFFFFF', '#FBBF24']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * ACADEMY — Centro de Aprendizagem (seção 13): presença institucional, volumes conectados,
 * pórtico monumental com colunata, grandes janelas e átrio central; praça de estudo na frente.
 * ===================================================================== */
export function academyBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const stone = kit.mat('#E9E2D3', { rough: 0.75 });
  const indigo = kit.mat('#6366F1', { metal: 0.3, rough: 0.35 });
  const glow = kit.mat('#A5B4FC', { glow: true });

  lotBase(kit, b, 32, '#E3E0D6');
  const s = groundShell(kit, b, 'academy', { base: '#D6CFC0', glow: '#FFE9C2' });
  // Pórtico monumental: colunata de pedra na frente do volume da entrada (livre no eixo da porta),
  // entablamento com a faixa de luz e o adro.
  const H = MASSING.academy.ground;
  const zc = s.front + 0.9;
  for (const x of [-6.6, -4.4, -2.2, 2.2, 4.4, 6.6]) {
    b.add(stone, new THREE.CylinderGeometry(0.42, 0.48, H, 16), [x, H / 2, zc]);
    b.add(stone, new THREE.BoxGeometry(1.1, 0.3, 1.1), [x, 0.15, zc]);
  }
  b.add(stone, new THREE.BoxGeometry(15.4, 0.9, 2.4), [0, H + 0.45, s.front + 0.6]);
  b.add(indigo, new THREE.BoxGeometry(15.6, 0.12, 0.12), [0, H - 0.05, zc + 0.55]);
  b.add(glow, new THREE.BoxGeometry(14.8, 0.06, 0.1), [0, H + 0.95, s.front + 1.85]);
  b.add(stone, new THREE.BoxGeometry(16, 0.1, 3), [0, 0.05, s.front + 2]);
  // Praça de estudo diante da entrada: piso, bancos em roda e a árvore (fora do eixo da porta).
  b.add(kit.mat('#CFC6B2', { rough: 0.85 }), new THREE.CircleGeometry(5.5, 40), [0, 0.06, s.front + 7.5], [-Math.PI / 2, 0, 0]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    b.add(kit.mat('#A0714F', { rough: 0.7 }), new THREE.BoxGeometry(2.2, 0.45, 0.6), [Math.sin(a) * 4.6, 0.25, s.front + 7.5 + Math.cos(a) * 4.6], [0, a, 0]);
  }
  b.add(kit.mat('#6B4A33'), new THREE.CylinderGeometry(0.3, 0.45, 3.5, 8), [-9.5, 1.75, s.front + 6]);
  b.add(kit.mat('#4C9A4F', { rough: 0.9 }), new THREE.IcosahedronGeometry(3, 1), [-9.5, 5, s.front + 6]);
  group.add(b.build());
  const sp = signSpot(s, 1.5);
  const sign = signPlane(kit, ['ACADEMY', 'CENTRO DE APRENDIZAGEM'], 6.4, 1.5, '#A5B4FC');
  sign.position.set(0, sp.y, zc + 0.6);
  group.add(sign, ...planting(kit, s.bound + 1.5, 32.5, 120, ['#A5B4FC', '#FFFFFF', '#FBBF24'], 0.3));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * IDIOMAS — Centro Internacional de Idiomas (seção 14): volumes ligados, tambor curvo de vidro,
 * fachadas transparentes; canal de água em arco na frente, ponte, quiosques e lanternas.
 * ===================================================================== */
export function languagesBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const teal = kit.mat('#14B8A6', { metal: 0.2, rough: 0.4 });
  const wood = kit.mat('#B08560', { rough: 0.7 });
  const stone = kit.mat('#E9E4D8', { rough: 0.8 });
  const lantern = kit.mat('#FFE7B0', { glow: true });
  const water = kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 });

  lotBase(kit, b, 27, '#E1E6D8');
  const s = groundShell(kit, b, 'languages', { base: '#D9DCCF', canopy: 3, canopyColor: '#B08560', glow: '#FFE7B0' });
  // Canal de água em arco na frente do tambor, com a ponte de madeira no eixo da entrada.
  const arc = 1.1;
  b.add(water, new THREE.RingGeometry(20, 21.6, 48, 1, (3 * Math.PI) / 2 - arc / 2, arc), [0, 0.1, 0], [-Math.PI / 2, 0, 0]);
  b.add(stone, new THREE.RingGeometry(21.6, 22, 48, 1, (3 * Math.PI) / 2 - arc / 2, arc), [0, 0.12, 0], [-Math.PI / 2, 0, 0]);
  b.add(wood, new THREE.BoxGeometry(3, 0.3, 3), [0, 0.35, 20.8]);
  // Friso verde-água no alto do tambor (o elemento curvo).
  b.add(teal, new THREE.TorusGeometry(14.75, 0.18, 6, 96), [0, MASSING.languages.ground + topLevel('languages') * STOREY + 0.2, 0], [-Math.PI / 2, 0, 0]);
  // Quiosques (espaços de conversa ao ar livre) nos cantos do lote, com telhadinho e lanterna.
  for (const a of [0.72, -0.72, 2.45, -2.45]) {
    const x = Math.sin(a) * 22.5;
    const z = Math.cos(a) * 22.5;
    b.add(stone, new THREE.CylinderGeometry(2.4, 2.6, 0.4, 6), [x, 0.2, z]);
    for (let k = 0; k < 6; k++) {
      const c = (k / 6) * Math.PI * 2;
      b.add(wood, new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), [x + Math.sin(c) * 1.9, 1.7, z + Math.cos(c) * 1.9]);
    }
    b.add(teal, new THREE.ConeGeometry(2.8, 1.4, 6), [x, 3.7, z]);
    b.add(lantern, new THREE.SphereGeometry(0.35, 10, 8), [x, 2.6, z]);
  }
  // Lanternas ao longo do caminho de entrada e do canal.
  for (const [x, z] of [[-2.4, 23.5], [2.4, 23.5], [-2.4, 18.6], [2.4, 18.6], [-9, 17.2], [9, 17.2]] as const) {
    b.add(wood, new THREE.CylinderGeometry(0.07, 0.09, 1.4, 6), [x, 0.7, z]);
    b.add(lantern, new THREE.BoxGeometry(0.4, 0.5, 0.4), [x, 1.6, z]);
  }
  group.add(b.build());
  const sp = signSpot(s, 1.3);
  const sign = signPlane(kit, ['IDIOMAS', 'CENTRO INTERNACIONAL'], 5.6, 1.3, '#14B8A6');
  sign.position.set(0, sp.y, sp.z);
  group.add(sign, ...planting(kit, s.bound + 1, 27.5, 80, ['#FFFFFF', '#F472B6', '#FBBF24']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * INSIGHTS — Observatório de Insights (seção 24): tambor redondo (o átrio circular) com volumes
 * retangulares, vidro, concreto claro e metal; anel de leitura girando devagar acima do terraço.
 * ===================================================================== */
export function insightsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();

  lotBase(kit, b, 23, '#DDD8CC');
  const s = groundShell(kit, b, 'insights', { base: '#D6D0C4', canopy: 3, canopyColor: '#F43F5E', glow: '#FFE2B0' });
  group.add(b.build());
  // Anel de leitura girando devagar acima do terraço (o mirante das perspectivas).
  const ring = new THREE.Mesh(kit.own(new THREE.TorusGeometry(11, 0.18, 6, 96)), kit.mat('#FDA4AF', { glow: true }));
  ring.rotation.x = Math.PI / 2.3;
  ring.position.y = MASSING.insights.ground + topLevel('insights') * STOREY + 5;
  const sp = signSpot(s, 1.3);
  const sign = signPlane(kit, ['INSIGHTS', 'OBSERVATÓRIO DE INSIGHTS'], 5.4, 1.3, '#F43F5E');
  sign.position.set(0, sp.y, sp.z);
  group.add(ring, sign, ...planting(kit, s.bound + 0.8, 23.5, 70, ['#FDA4AF', '#FFFFFF']));
  return {
    group,
    top: s.top,
    core: s.core,
    tick: (t) => {
      ring.rotation.z = t * 0.15;
    },
  };
}
