/**
 * Prédios detalhados da região Norte (Bloco 2): Biblioteca Digital, Ateliê de Conhecimento (Notes),
 * Academy, Idiomas e Insights. Library e Notes seguem o plano (docs/V2-PARQUE-PLANO.md, 3.3 e 3.4);
 * Academy, Idiomas e Insights seguem o prompt principal da V2 (seção 4).
 * Coordenadas locais: frente = +z, base em y = 0, 1 unidade = 1 m.
 */
import * as THREE from 'three';
import { Builder, shrubs, type Kit } from '../kit';
import { lotBase, planting, signPlane, type DetailedBuilding } from './central';

const SILVER = '#CBD5E1';

/* =====================================================================
 * LIBRARY — Biblioteca Digital (3.4): três pavimentos em camadas de pedra
 * ("livros" empilhados), coroamento escalonado, claraboia piramidal.
 * ===================================================================== */
export function libraryBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const stone = kit.mat('#ECE7DC', { rough: 0.8 });
  const stoneDark = kit.mat('#D8D1C2', { rough: 0.85 });
  const silver = kit.mat(SILVER, { metal: 0.85, rough: 0.25 });
  const glass = kit.mat('#B9DDF2', { glass: true });
  const emerald = kit.mat('#34D399', { glow: true, rough: 0.4 });
  const blueGlow = kit.mat('#8EC5FF', { glow: true, rough: 0.5 });
  const warm = kit.mat('#FFF1D6', { glow: true, rough: 0.9 });

  lotBase(kit, b, 28, '#E2DCCD');
  b.add(stone, new THREE.BoxGeometry(38, 0.6, 38), [0, 0.3, 0]);
  // Corpo de vidro (3 pavimentos) com o interior aceso.
  b.add(glass, new THREE.BoxGeometry(32, 15, 32), [0, 8.1, 0]);
  b.add(warm, new THREE.BoxGeometry(30, 14, 30), [0, 8.1, 0]);
  // Faixas de pedra por pavimento, levemente giradas: as "prateleiras" que dão a silhueta.
  for (let k = 0; k < 4; k++) {
    b.add(k % 2 ? stoneDark : stone, new THREE.BoxGeometry(34.4, 1.1, 34.4), [0, 0.6 + k * 5, 0], [0, k * 0.035, 0]);
  }
  // Lombadas: montantes de pedra nas quatro fachadas, de alturas que lembram livros.
  for (let side = 0; side < 4; side++) {
    const a = (side / 4) * Math.PI * 2;
    for (let i = 0; i < 11; i++) {
      const off = -14 + i * 2.8;
      if (side === 0 && Math.abs(off) < 5.5) continue; // vão da entrada
      const h = 4.2 + ((i * 7 + side * 3) % 4) * 0.25;
      for (let fl = 0; fl < 3; fl++) {
        const x = Math.cos(a) * off + Math.sin(a) * 16.3;
        const z = -Math.sin(a) * off + Math.cos(a) * 16.3;
        b.add(stone, new THREE.BoxGeometry(0.55, h, 0.9), [x, 1.1 + fl * 5 + h / 2, z], [0, a, 0]);
      }
    }
    // Painéis translúcidos (as galerias aparecem por eles).
    for (let fl = 0; fl < 3; fl++) b.add(fl === 1 ? emerald : blueGlow, new THREE.BoxGeometry(30, 0.12, 0.12), [Math.sin(a) * 16.6, 5.2 + fl * 5, Math.cos(a) * 16.6], [0, a, 0]);
  }
  // Coroamento escalonado em placas giradas e claraboia piramidal.
  for (let k = 0; k < 4; k++) b.add(k % 2 ? silver : stone, new THREE.BoxGeometry(30 - k * 5, 1.1, 30 - k * 5), [0, 16.2 + k * 1.2, 0], [0, 0.1 + k * 0.12, 0]);
  b.add(kit.mat('#CDEFFB', { glass: true }), new THREE.ConeGeometry(6.5, 4.2, 4), [0, 22.9, 0], [0, Math.PI / 4, 0]);
  b.add(silver, new THREE.TorusGeometry(6.6, 0.12, 4, 4), [0, 20.8, 0], [-Math.PI / 2, 0, Math.PI / 4]);
  // Entrada ampla (10 m), escadaria baixa de 5 degraus e rampa sem barreiras.
  b.add(kit.mat('#9BE7F5', { glass: true }), new THREE.BoxGeometry(10, 5, 0.2), [0, 3.2, 16.2]);
  b.add(silver, new THREE.BoxGeometry(12, 0.4, 4), [0, 5.9, 18]);
  b.add(emerald, new THREE.BoxGeometry(11.4, 0.06, 0.1), [0, 5.68, 19.95]);
  for (let s = 0; s < 5; s++) b.add(stone, new THREE.BoxGeometry(14 - s * 0.4, 0.2, 0.7), [0, 0.1 + s * 0.2, 21.6 - s * 0.6]);
  b.add(stone, new THREE.BoxGeometry(2.2, 0.12, 10), [10, 0.5, 21], [0.1, 0, 0]);
  // Pátios laterais com bancos de leitura.
  for (const s of [-1, 1]) {
    b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.BoxGeometry(8, 0.3, 14), [s * 23.5, 0.2, 2]);
    for (let k = 0; k < 2; k++) b.add(kit.mat('#A0714F', { rough: 0.7 }), new THREE.BoxGeometry(0.6, 0.45, 3), [s * 20.3, 0.45, -2 + k * 7]);
  }
  group.add(b.build());
  const sign = signPlane(kit, ['LIBRARY', 'BIBLIOTECA DIGITAL'], 8, 1.9, '#34D399');
  sign.position.set(0, 7.2, 20.05);
  const bushes: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) bushes.push({ x: s * (22 + (k % 2) * 3), y: 0.3, z: -4 + k * 2.3, s: 0.8, color: '#3E8E4A' });
  group.add(sign, shrubs(kit, bushes, 'bush'), ...planting(kit, 22, 27, 110, ['#FFFFFF', '#60A5FA', '#34D399']));
  return { group, top: 26, core: 20 };
}

/* =====================================================================
 * NOTES — Ateliê de Conhecimento (3.3): três volumes horizontais em sequência,
 * ateliê com cobertura em dente de serra e claraboias, madeira e "camadas de papel".
 * ===================================================================== */
export function notesBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const wood = kit.mat('#B8875A', { rough: 0.7 });
  const woodDark = kit.mat('#8A6240', { rough: 0.7 });
  const paper = kit.mat('#F3EBDD', { rough: 0.9 });
  const graphite = kit.mat('#3B4252', { metal: 0.5, rough: 0.4 });
  const glass = kit.mat('#D2E6F2', { glass: true });
  const violet = kit.mat('#8B7CF6', { glow: true, rough: 0.4 });
  const warm = kit.mat('#FFE2B0', { glow: true, rough: 0.9 });

  lotBase(kit, b, 28, '#E6DFD0');
  // Recepção de Cadernos (14 × 12 × 5), com o painel de "camadas de papel" na frente.
  b.add(paper, new THREE.BoxGeometry(14, 5, 12), [-17, 2.5, 3]);
  for (let k = 0; k < 9; k++) b.add(k % 2 ? paper : kit.mat('#E7DCC8', { rough: 0.9 }), new THREE.BoxGeometry(8, 0.42, 0.3 + (k % 3) * 0.12), [-20, 0.5 + k * 0.5, 9.1]);
  b.add(glass, new THREE.BoxGeometry(4.5, 3.6, 0.15), [-13.5, 2.1, 9.05]);
  b.add(warm, new THREE.BoxGeometry(4.2, 3.2, 0.1), [-13.5, 2.1, 8.9]);
  b.add(wood, new THREE.BoxGeometry(14.6, 0.35, 12.6), [-17, 5.15, 3]);
  // Ateliê (22 × 16 × 7): ripas de madeira, janelões e cobertura em dente de serra.
  b.add(glass, new THREE.BoxGeometry(22, 6.5, 16), [1, 3.25, -1]);
  b.add(warm, new THREE.BoxGeometry(21, 6, 15), [1, 3.25, -1]);
  for (let i = 0; i < 22; i++) {
    if (i % 5 === 2) continue; // janelões de 3 m entre as ripas
    b.add(wood, new THREE.BoxGeometry(0.28, 6.5, 0.35), [-9.6 + i, 3.25, 7.1]);
  }
  for (let k = 0; k < 5; k++) {
    const z = -8 + k * 3.4;
    b.add(graphite, new THREE.BoxGeometry(22.4, 0.25, 3.6), [1, 7.6, z], [-0.32, 0, 0]);
    b.add(kit.mat('#CDEFFB', { glass: true }), new THREE.BoxGeometry(22, 1.1, 0.1), [1, 7.5, z + 1.7]);
  }
  b.add(graphite, new THREE.BoxGeometry(22.6, 0.3, 16.6), [1, 6.6, -1]);
  b.add(violet, new THREE.BoxGeometry(22.2, 0.08, 0.1), [1, 6.45, 7.35]);
  // Arquivo (11 × 10 × 4,5), madeira escura.
  b.add(woodDark, new THREE.BoxGeometry(11, 4.5, 10), [18, 2.25, 2]);
  for (let i = 0; i < 8; i++) b.add(wood, new THREE.BoxGeometry(0.25, 4.5, 0.3), [13.4 + i * 1.3, 2.25, 7.1]);
  b.add(graphite, new THREE.BoxGeometry(11.4, 0.3, 10.4), [18, 4.65, 2]);
  // Marquise de madeira e metal (10 m) na entrada da recepção.
  b.add(wood, new THREE.BoxGeometry(10, 0.3, 4), [-15, 4.4, 11]);
  for (const s of [-1, 1]) b.add(graphite, new THREE.CylinderGeometry(0.08, 0.08, 4.4, 8), [-15 + s * 4.6, 2.2, 12.7]);
  // Pátio silencioso: espelho d'água estreito, bambus e cadeiras de leitura.
  b.add(kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }), new THREE.BoxGeometry(12, 0.08, 1.6), [6, 0.12, 12.5]);
  b.add(kit.mat('#BDB4A2', { rough: 0.8 }), new THREE.BoxGeometry(12.8, 0.25, 2.4), [6, 0.06, 12.5]);
  for (let i = 0; i < 18; i++) b.add(kit.mat('#5E9E4C', { rough: 0.8 }), new THREE.CylinderGeometry(0.06, 0.08, 4 + (i % 4) * 0.7, 5), [14 + (i % 6) * 0.7, 2.2, 10.5 + Math.floor(i / 6) * 0.8]);
  for (let k = 0; k < 3; k++) b.add(wood, new THREE.BoxGeometry(1.4, 0.5, 1.4), [0 + k * 3.2, 0.25, 15.2]);
  group.add(b.build());
  const sign = signPlane(kit, ['NOTES', 'ATELIÊ DE CONHECIMENTO'], 6.4, 1.5, '#8B7CF6');
  sign.position.set(-15, 5.6, 13.02);
  group.add(sign, ...planting(kit, 22, 27, 100, ['#A78BFA', '#FFFFFF', '#FBBF24']));
  return { group, top: 11, core: 21 };
}

/* =====================================================================
 * ACADEMY — centro educacional futurista (prompt 4.9): rotunda central de vidro,
 * duas alas curvas de salas (as salas são criadas por disciplina, dentro), praça de estudo.
 * ===================================================================== */
export function academyBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const white = kit.mat('#F1F4F9', { rough: 0.5 });
  const indigo = kit.mat('#6366F1', { metal: 0.3, rough: 0.35 });
  const silver = kit.mat(SILVER, { metal: 0.85, rough: 0.25 });
  const glass = kit.mat('#B7C6F5', { glass: true });
  const glow = kit.mat('#A5B4FC', { glow: true });
  const solar = kit.mat('#1E293B', { metal: 0.6, rough: 0.3 });
  const warm = kit.mat('#FFE9C2', { glow: true, rough: 0.9 });

  lotBase(kit, b, 31, '#E3E0D6');
  // Rotunda (Ø 14, 18 m) com aletas índigo e anel de luz.
  b.add(white, new THREE.CylinderGeometry(8.2, 8.6, 1, 32), [0, 0.5, -4]);
  b.add(glass, new THREE.CylinderGeometry(7, 7, 16, 32, 1, true), [0, 9, -4]);
  b.add(warm, new THREE.CylinderGeometry(6.4, 6.4, 15, 24, 1, true), [0, 9, -4]);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.add(indigo, new THREE.BoxGeometry(0.3, 16, 0.7), [Math.sin(a) * 7.2, 9, -4 + Math.cos(a) * 7.2], [0, a, 0]);
  }
  b.add(silver, new THREE.CylinderGeometry(8, 7.4, 0.8, 32), [0, 17.4, -4]);
  b.add(glow, new THREE.TorusGeometry(7.6, 0.1, 6, 64), [0, 16.9, -4], [-Math.PI / 2, 0, 0]);
  b.add(indigo, new THREE.ConeGeometry(3, 4, 6), [0, 19.8, -4]);
  // Duas alas curvas de salas em dois andares (módulos alternando vidro e branco).
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const a = s * (0.55 + i * 0.28);
      const x = Math.sin(a) * 17;
      const z = -4 + Math.cos(a) * 17 - 6;
      for (let fl = 0; fl < 2; fl++) {
        const lit = (i + fl) % 2 === 0;
        b.add(lit ? glass : white, new THREE.BoxGeometry(5, 4, 6), [x, 2.4 + fl * 4.2, z], [0, a, 0]);
        if (lit) b.add(warm, new THREE.BoxGeometry(4.6, 3.6, 5.6), [x, 2.4 + fl * 4.2, z], [0, a, 0]);
        b.add(indigo, new THREE.BoxGeometry(5.2, 0.25, 6.2), [x, 4.5 + fl * 4.2, z], [0, a, 0]);
      }
      // Painéis solares no telhado das alas.
      b.add(solar, new THREE.BoxGeometry(4, 0.12, 2.4), [x, 9.0, z], [0.3, a, 0]);
    }
  }
  // Entrada em arco e praça de estudo com árvore e bancos.
  b.add(indigo, new THREE.TorusGeometry(4, 0.45, 8, 32, Math.PI), [0, 0.4, 4.6]);
  b.add(kit.mat('#9BE7F5', { glass: true }), new THREE.BoxGeometry(5, 3.6, 0.15), [0, 1.8, 3]);
  b.add(kit.mat('#CFC6B2', { rough: 0.85 }), new THREE.CircleGeometry(8, 40), [0, 0.06, 15], [-Math.PI / 2, 0, 0]);
  b.add(kit.mat('#6B4A33'), new THREE.CylinderGeometry(0.3, 0.45, 3.5, 8), [0, 1.75, 15]);
  b.add(kit.mat('#4C9A4F', { rough: 0.9 }), new THREE.IcosahedronGeometry(3, 1), [0, 5, 15]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.add(kit.mat('#A0714F', { rough: 0.7 }), new THREE.BoxGeometry(2.2, 0.45, 0.6), [Math.sin(a) * 6, 0.45, 15 + Math.cos(a) * 6], [0, a, 0]);
  }
  group.add(b.build());
  const sign = signPlane(kit, ['ACADEMY', 'CENTRO DE ESTUDOS'], 6.4, 1.5, '#A5B4FC');
  sign.position.set(0, 5.2, 4.7);
  group.add(sign, ...planting(kit, 24, 30, 120, ['#A5B4FC', '#FFFFFF', '#FBBF24'], 0.3));
  return { group, top: 24, core: 20 };
}

/* =====================================================================
 * IDIOMAS — jardim cultural (prompt 4.10): pavilhão central de telhados em camadas,
 * anel de quiosques (um espaço por idioma, dentro), canal de água e lanternas.
 * ===================================================================== */
export function languagesBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const teal = kit.mat('#14B8A6', { metal: 0.2, rough: 0.4 });
  const wood = kit.mat('#B08560', { rough: 0.7 });
  const stone = kit.mat('#E9E4D8', { rough: 0.8 });
  const glass = kit.mat('#C9F2EC', { glass: true });
  const lantern = kit.mat('#FFE7B0', { glow: true });
  const water = kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 });

  lotBase(kit, b, 28, '#E1E6D8');
  // Canal de água em anel e pontes.
  b.add(water, new THREE.RingGeometry(12, 13.6, 64), [0, 0.1, 0], [-Math.PI / 2, 0, 0]);
  b.add(stone, new THREE.TorusGeometry(13.7, 0.2, 6, 96), [0, 0.15, 0], [-Math.PI / 2, 0, 0]);
  for (const a of [0, Math.PI]) b.add(wood, new THREE.BoxGeometry(3, 0.3, 3), [Math.sin(a) * 12.8, 0.35, Math.cos(a) * 12.8], [0, a, 0]);
  // Pavilhão central: plataforma, colunas de madeira, vidro e três telhados curvos em camadas.
  b.add(stone, new THREE.CylinderGeometry(9, 9.4, 0.8, 8), [0, 0.4, 0], [0, Math.PI / 8, 0]);
  b.add(glass, new THREE.CylinderGeometry(6.2, 6.2, 4.4, 8, 1, true), [0, 3, 0], [0, Math.PI / 8, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add(wood, new THREE.CylinderGeometry(0.3, 0.3, 4.6, 8), [Math.sin(a) * 7.5, 3.1, Math.cos(a) * 7.5]);
  }
  for (let k = 0; k < 3; k++) {
    const r = 10 - k * 2.6;
    b.add(teal, new THREE.CylinderGeometry(r * 0.55, r, 1.4, 8, 1, true), [0, 5.9 + k * 2.4, 0], [0, Math.PI / 8, 0]);
    b.add(teal, new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.2, 8), [0, 6.6 + k * 2.4, 0], [0, Math.PI / 8, 0]);
    b.add(wood, new THREE.CylinderGeometry(r * 0.56, r * 0.56, 1, 8, 1, true), [0, 7.1 + k * 2.4, 0], [0, Math.PI / 8, 0]);
  }
  b.add(teal, new THREE.ConeGeometry(1, 2.2, 8), [0, 14.1, 0]);
  // Quiosques em volta (os espaços de cada idioma) com telhadinho e lanterna.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.sin(a) * 19;
    const z = Math.cos(a) * 19;
    b.add(stone, new THREE.CylinderGeometry(2.8, 3, 0.4, 6), [x, 0.2, z]);
    for (let k = 0; k < 6; k++) {
      const c = (k / 6) * Math.PI * 2;
      b.add(wood, new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), [x + Math.sin(c) * 2.2, 1.7, z + Math.cos(c) * 2.2]);
    }
    b.add(teal, new THREE.ConeGeometry(3.2, 1.6, 6), [x, 3.8, z]);
    b.add(lantern, new THREE.SphereGeometry(0.35, 10, 8), [x, 2.6, z]);
  }
  // Lanternas ao longo do jardim.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add(wood, new THREE.CylinderGeometry(0.07, 0.09, 1.4, 6), [Math.sin(a) * 15.5, 0.7, Math.cos(a) * 15.5]);
    b.add(lantern, new THREE.BoxGeometry(0.4, 0.5, 0.4), [Math.sin(a) * 15.5, 1.6, Math.cos(a) * 15.5]);
  }
  group.add(b.build());
  const sign = signPlane(kit, ['IDIOMAS', 'JARDIM CULTURAL'], 5.6, 1.3, '#14B8A6');
  sign.position.set(0, 1.4, 10.2);
  const flowers: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2 * 7.3;
    const r = 14.6 + (i % 5) * 0.6;
    flowers.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, s: 1, color: ['#F472B6', '#FBBF24', '#FFFFFF', '#F87171', '#C084FC'][i % 5]! });
  }
  group.add(sign, shrubs(kit, flowers, 'flower'), ...planting(kit, 23, 27, 80, ['#FFFFFF', '#F472B6']));
  return { group, top: 16, core: 10 };
}

/* =====================================================================
 * INSIGHTS — observatório de dados (prompt 4.7), no alto da colina: tambor,
 * cúpula com fenda, telescópio e anel de leitura girando devagar.
 * ===================================================================== */
export function insightsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const white = kit.mat('#F3F4F7', { rough: 0.45 });
  const rose = kit.mat('#F43F5E', { metal: 0.3, rough: 0.35 });
  const silver = kit.mat(SILVER, { metal: 0.9, rough: 0.2 });
  const dark = kit.mat('#1F2A3A', { metal: 0.6, rough: 0.35 });
  const glow = kit.mat('#FDA4AF', { glow: true });
  const warm = kit.mat('#FFE2B0', { glow: true, rough: 0.9 });

  lotBase(kit, b, 22, '#DDD8CC');
  // Terraço-mirante em volta.
  b.add(white, new THREE.CylinderGeometry(15, 15.5, 0.6, 48), [0, 0.3, 0]);
  b.add(silver, new THREE.TorusGeometry(14.8, 0.08, 4, 96), [0, 1.4, 0], [-Math.PI / 2, 0, 0]);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    b.add(silver, new THREE.CylinderGeometry(0.05, 0.05, 1.1, 4), [Math.sin(a) * 14.8, 0.9, Math.cos(a) * 14.8]);
  }
  // Tambor com janelas em fita e a cúpula.
  b.add(white, new THREE.CylinderGeometry(9, 9.4, 7, 40), [0, 4.1, 0]);
  b.add(warm, new THREE.CylinderGeometry(9.05, 9.05, 1.2, 40, 1, true), [0, 4.6, 0]);
  b.add(glow, new THREE.TorusGeometry(9.2, 0.1, 6, 96), [0, 7.5, 0], [-Math.PI / 2, 0, 0]);
  b.add(rose, new THREE.SphereGeometry(8.6, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), [0, 7.6, 0]);
  // Fenda da cúpula e telescópio.
  b.add(dark, new THREE.BoxGeometry(2.2, 0.4, 9), [0, 14.5, 2.4], [-0.55, 0, 0]);
  b.add(silver, new THREE.CylinderGeometry(0.9, 1.2, 7, 20), [0, 15.2, 2.8], [-0.9, 0, 0]);
  // Entrada com marquise.
  b.add(white, new THREE.BoxGeometry(5, 3.6, 3), [0, 2.4, 9.6]);
  b.add(kit.mat('#9BE7F5', { glass: true }), new THREE.BoxGeometry(3.4, 2.8, 0.12), [0, 2, 11.12]);
  b.add(rose, new THREE.BoxGeometry(6, 0.3, 4), [0, 4.35, 10.2]);
  group.add(b.build());
  // Anel de leitura girando devagar acima da cúpula.
  const ring = new THREE.Mesh(kit.own(new THREE.TorusGeometry(11, 0.18, 6, 96)), kit.mat('#FDA4AF', { glow: true }));
  ring.rotation.x = Math.PI / 2.3;
  ring.position.y = 12;
  const sign = signPlane(kit, ['INSIGHTS', 'OBSERVATÓRIO DE DADOS'], 5.4, 1.3, '#F43F5E');
  sign.position.set(0, 5.1, 12.25);
  group.add(ring, sign, ...planting(kit, 16, 21, 80, ['#FDA4AF', '#FFFFFF']));
  return {
    group,
    top: 19,
    core: 16,
    tick: (t) => {
      ring.rotation.z = t * 0.15;
    },
  };
}
