/**
 * Interiores da região Norte: Biblioteca Digital, Ateliê de Conhecimento (Notes), Academy,
 * Idiomas e Insights. As funções ficam nos painéis do módulo (HTML real); as salas da Academy
 * e os quiosques de Idiomas levam o nome das disciplinas e dos idiomas reais do usuário.
 */
import * as THREE from 'three';
import type { Kit } from '../kit';
import { canvasPlane, createRoom, finishRoom, pendants, pots, bench, setDetailCommon, type InteriorScene } from './common';
import { sectorsFrom, viewOf, type Placed } from './central';

/** Placa com texto que muda com os dados (nome de disciplina, idioma). */
function nameBoard(kit: Kit, w: number, accent: string) {
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

const ring = <T extends string>(ids: readonly T[], r: number, skipFront = true): Record<T, Placed> => {
  const out = {} as Record<T, Placed>;
  const n = ids.length + (skipFront ? 1 : 0);
  ids.forEach((id, i) => {
    const a = ((i + (skipFront ? 1 : 0)) / n) * Math.PI * 2;
    out[id] = { x: Math.sin(a) * r, z: Math.cos(a) * r, face: a + Math.PI };
  });
  return out;
};

/* =====================================================================
 * LIBRARY — átrio de três níveis com galerias em volta
 * ===================================================================== */
export const LIBRARY_SECTORS = ['atrium', 'collections', 'consult', 'search', 'preserve', 'transfer'] as const;
export type LibrarySector = (typeof LIBRARY_SECTORS)[number];

export function createLibraryInterior(kit: Kit, labels: Record<LibrarySector, string>): InteriorScene {
  const R = 18;
  const H = 14;
  const room = createRoom(kit, { radius: R, height: H, sides: 8, floor: '#EFEAE0', glass: '#D3EAF2', frame: '#D8D1C2', accent: '#34D399', skylight: 6 });
  const { scene, b } = room;
  const stone = kit.mat('#ECE7DC', { rough: 0.8 });
  const wood = kit.mat('#A97C55', { rough: 0.7 });
  const silver = kit.mat('#CBD5E1', { metal: 0.85, rough: 0.25 });
  // Dois mezaninos em anel (1º e 2º andar) com guarda-corpo de vidro e estantes contínuas.
  for (const y of [4.7, 9.4]) {
    b.add(stone, new THREE.RingGeometry(8.5, R - 0.3, 8, 1, Math.PI / 8), [0, y, 0], [-Math.PI / 2, 0, 0]);
    b.add(stone, new THREE.RingGeometry(8.5, R - 0.3, 8, 1, Math.PI / 8), [0, y - 0.25, 0], [Math.PI / 2, 0, 0]);
    b.add(kit.mat('#CFF3EA', { glass: true }), new THREE.CylinderGeometry(8.5, 8.5, 1.1, 8, 1, true), [0, y + 0.55, 0], [0, Math.PI / 8, 0]);
    b.add(silver, new THREE.TorusGeometry(8.6, 0.05, 4, 8), [0, y + 1.1, 0], [-Math.PI / 2, 0, Math.PI / 8]);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      b.add(wood, new THREE.BoxGeometry(3.2, 3.6, 0.5), [Math.sin(a) * (R - 1.2), y + 2, Math.cos(a) * (R - 1.2)], [0, a, 0]);
      for (let k = 0; k < 4; k++) b.add(kit.mat(['#34D399', '#60A5FA', '#F59E0B', '#F472B6'][(i + k) % 4]!, { rough: 0.6 }), new THREE.BoxGeometry(2.8, 0.5, 0.2), [Math.sin(a) * (R - 1.45), y + 0.6 + k * 0.85, Math.cos(a) * (R - 1.45)], [0, a, 0]);
    }
  }
  // Escada helicoidal e elevador de vidro ligando os andares.
  for (let k = 0; k < 28; k++) {
    const a = k * 0.42;
    b.add(stone, new THREE.BoxGeometry(2.4, 0.18, 0.9), [7 + Math.sin(a) * 1.6, 0.3 + k * 0.33, -7 + Math.cos(a) * 1.6], [0, a, 0]);
  }
  b.add(kit.mat('#CFF3EA', { glass: true }), new THREE.CylinderGeometry(1.3, 1.3, H, 16, 1, true), [-7, H / 2, -7]);
  b.add(silver, new THREE.BoxGeometry(2.2, 0.15, 2.2), [-7, 4.75, -7]);
  pots(kit, b, [[-4, 15], [4, 15], [-14, 4], [14, 4]]);
  pendants(kit, b, [[-3, 3], [3, 3], [0, -4]], 11.5, H, '#E8FFF6');

  const plan = ring(LIBRARY_SECTORS.filter((s) => s !== 'atrium'), 11.5);
  const all = { atrium: { x: 0, z: 2, face: 0 }, ...plan } as Record<LibrarySector, Placed>;
  const groups = sectorsFrom(kit, scene, all, LIBRARY_SECTORS, labels, '#34D399', (id, sb) => {
    if (id === 'atrium') {
      // Balcão circular no fundo do átrio vazado.
      sb.add(stone, new THREE.CylinderGeometry(2.4, 2.4, 1.0, 32, 1, true), [0, 0.5, 0]);
      sb.add(wood, new THREE.CylinderGeometry(2.5, 2.5, 0.08, 32), [0, 1.04, 0]);
    } else if (id === 'consult') {
      for (let k = 0; k < 3; k++) {
        sb.add(wood, new THREE.BoxGeometry(1.4, 0.08, 0.8), [(k - 1) * 1.7, 0.8, 0]);
        sb.add(kit.mat('#1F2A3A', { metal: 0.5 }), new THREE.BoxGeometry(0.9, 0.6, 0.05), [(k - 1) * 1.7, 1.2, -0.3], [-0.25, 0, 0]);
      }
    } else if (id === 'search') {
      sb.add(wood, new THREE.BoxGeometry(4.4, 0.08, 1.2), [0, 0.8, 0]);
      for (let k = 0; k < 3; k++) sb.add(kit.mat('#34D399', { glow: true }), new THREE.BoxGeometry(0.8, 0.5, 0.05), [(k - 1) * 1.4, 1.15, -0.3], [-0.3, 0, 0]);
    } else if (id === 'preserve') {
      for (let k = 0; k < 3; k++) sb.add(kit.mat('#D3EAF2', { glass: true }), new THREE.BoxGeometry(1, 1.8, 0.8), [(k - 1) * 1.4, 0.9, -0.4]);
    } else if (id === 'transfer') {
      sb.add(stone, new THREE.BoxGeometry(3.6, 1, 1), [0, 0.5, 0]);
      sb.add(kit.mat('#1F2A3A', { metal: 0.5 }), new THREE.BoxGeometry(2.6, 0.06, 0.5), [0, 1.03, 0]);
      for (let k = 0; k < 3; k++) sb.add(kit.mat('#D9C7A6', { rough: 0.8 }), new THREE.BoxGeometry(0.45, 0.3, 0.35), [-0.9 + k * 0.9, 1.22, 0]);
    } else {
      for (let k = 0; k < 3; k++) sb.add(wood, new THREE.BoxGeometry(1.2, 2.6, 0.5), [(k - 1) * 1.4, 1.3, -0.6]);
    }
  });
  finishRoom(room);
  // Entrada: no fundo do átrio vazado, vendo os três níveis de galerias (sem ficar sob um mezanino).
  const overview = { cam: new THREE.Vector3(0, 3.4, 7.6), target: new THREE.Vector3(0, 4.5, -8) };
  return {
    scene,
    sectors: LIBRARY_SECTORS,
    pickables: groups,
    room: { radius: R, height: H },
    obstacles: [{ x: 0, z: 2, r: 2.6, h: 1 }, { x: -7, z: -7, r: 1.4, h: H }, { x: 7, z: -7, r: 2.2, h: H }],
    view: (id) => (id === 'atrium' ? { cam: new THREE.Vector3(0, 7, 13), target: new THREE.Vector3(0, 2, 0) } : viewOf(all, id, overview)),
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * NOTES — ateliê com a grande mesa criativa no centro
 * ===================================================================== */
export const NOTES_SECTORS = ['reception', 'writing', 'advanced', 'handwriting', 'organize', 'versions'] as const;
export type NotesSector = (typeof NOTES_SECTORS)[number];

export function createNotesInterior(kit: Kit, labels: Record<NotesSector, string>): InteriorScene {
  const R = 17;
  const H = 7;
  const room = createRoom(kit, { radius: R, height: H, sides: 4, floor: '#EADFCB', glass: '#DCEBF2', frame: '#8A6240', accent: '#8B7CF6', skylight: 0.01 });
  const { scene, b } = room;
  const wood = kit.mat('#B8875A', { rough: 0.7 });
  const paper = kit.mat('#F7F1E6', { rough: 0.9 });
  // Claraboias em dente de serra sobre o ateliê.
  for (let k = 0; k < 4; k++) b.add(kit.mat('#CDEFFB', { glass: true }), new THREE.BoxGeometry(18, 0.1, 1.6), [0, H - 0.05, -7 + k * 4.4]);
  // A grande mesa criativa (12 m) e "folhas" de luz sobre ela.
  b.add(wood, new THREE.BoxGeometry(12, 0.16, 3), [0, 0.95, 0]);
  for (const x of [-5.4, 0, 5.4]) b.add(wood, new THREE.BoxGeometry(0.4, 0.95, 2.6), [x, 0.47, 0]);
  for (let k = 0; k < 9; k++) b.add(paper, new THREE.BoxGeometry(0.9, 0.02, 1.2), [-4.8 + k * 1.2, 1.05, ((k % 3) - 1) * 0.7], [0, k * 0.2, 0]);
  pendants(kit, b, [[-4, 0], [0, 0], [4, 0]], 3.4, H, '#FFE7C2');
  pots(kit, b, [[-10, 10], [10, 10], [-10, -10], [10, -10]]);
  const plan: Record<NotesSector, Placed> = {
    reception: { x: 0, z: 8.5, face: Math.PI },
    writing: { x: -8.5, z: -6, face: Math.PI / 4 },
    advanced: { x: 8.5, z: -6, face: -Math.PI / 4 },
    handwriting: { x: 0, z: -9, face: 0 },
    organize: { x: -9.5, z: 4, face: Math.PI / 2 },
    versions: { x: 9.5, z: 4, face: -Math.PI / 2 },
  };
  const groups = sectorsFrom(kit, scene, plan, NOTES_SECTORS, labels, '#8B7CF6', (id, sb) => {
    if (id === 'reception') {
      for (const s of [-1, 1]) sb.add(wood, new THREE.BoxGeometry(1.8, 1.1, 0.5), [s * 1.3, 0.55, -0.8]);
      sb.add(wood, new THREE.BoxGeometry(2.2, 0.08, 1), [0, 0.8, 0.6]);
    } else if (id === 'handwriting') {
      // Pranchetas inclinadas junto às janelas (luz natural).
      for (let k = 0; k < 2; k++) {
        sb.add(wood, new THREE.BoxGeometry(1.6, 0.06, 1.1), [(k ? 1 : -1) * 1.2, 1.0, 0], [-0.45, 0, 0]);
        sb.add(kit.mat('#334155', { metal: 0.6 }), new THREE.BoxGeometry(0.08, 0.95, 0.08), [(k ? 1 : -1) * 1.2, 0.47, 0.2]);
      }
    } else if (id === 'advanced') {
      sb.add(wood, new THREE.BoxGeometry(3.6, 0.08, 1), [0, 0.85, 0]);
      for (let k = 0; k < 3; k++) sb.add(kit.mat('#1F2A3A', { metal: 0.5 }), new THREE.BoxGeometry(0.9, 0.55, 0.05), [(k - 1) * 1.15, 1.2, -0.35], [-0.2, 0, 0]);
    } else if (id === 'organize') {
      sb.add(paper, new THREE.BoxGeometry(3.2, 2.4, 0.1), [0, 1.6, -0.9]);
      for (let k = 0; k < 12; k++) sb.add(kit.mat(['#A78BFA', '#FBBF24', '#60A5FA', '#34D399'][k % 4]!, { rough: 0.6 }), new THREE.BoxGeometry(0.5, 0.35, 0.03), [-1.2 + (k % 4) * 0.8, 0.9 + Math.floor(k / 4) * 0.55, -0.83]);
    } else if (id === 'versions') {
      for (let k = 0; k < 3; k++) sb.add(kit.mat('#8A6240', { rough: 0.7 }), new THREE.BoxGeometry(0.9, 1.6, 0.7), [(k - 1) * 1.05, 0.8, -0.5]);
    } else {
      for (let k = 0; k < 2; k++) {
        sb.add(wood, new THREE.BoxGeometry(1.4, 0.06, 0.8), [(k ? 1 : -1) * 1, 0.78, 0]);
        sb.add(kit.mat('#FFE7C2', { glow: true }), new THREE.CylinderGeometry(0.08, 0.15, 0.5, 8), [(k ? 1 : -1) * 1 + 0.4, 1.05, -0.2]);
      }
    }
  });
  bench(kit, b, -3, 12, 0);
  bench(kit, b, 3, 12, 0);
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, 14), target: new THREE.Vector3(0, 1, -2) };
  return {
    scene,
    sectors: NOTES_SECTORS,
    pickables: groups,
    room: { radius: R - 4, height: H },
    obstacles: [{ x: -3, z: 0, r: 2, h: 1 }, { x: 3, z: 0, r: 2, h: 1 }],
    view: (id) => viewOf(plan, id, overview),
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * ACADEMY — rotunda com as salas das disciplinas em volta
 * ===================================================================== */
export const ACADEMY_SECTORS = ['hall', 'rooms', 'review', 'plan'] as const;
export type AcademySector = (typeof ACADEMY_SECTORS)[number];
export interface AcademyData {
  /** Nomes das disciplinas do ano atual (uma sala para cada). */
  subjects: string[];
}

export function createAcademyInterior(kit: Kit, labels: Record<AcademySector, string>): InteriorScene {
  const R = 18;
  const H = 10;
  const room = createRoom(kit, { radius: R, height: H, sides: 16, floor: '#EEF0F8', glass: '#C7D2FE', frame: '#6366F1', accent: '#A5B4FC', skylight: 5 });
  const { scene, b } = room;
  const white = kit.mat('#F5F6FB', { rough: 0.5 });
  const indigo = kit.mat('#6366F1', { metal: 0.3, rough: 0.35 });
  // Oito salas em anel (portas de vidro); cada uma recebe o nome de uma disciplina real.
  const boards: Array<ReturnType<typeof nameBoard>> = [];
  const doors: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2 + Math.PI;
    const x = Math.sin(a) * 14.5;
    const z = Math.cos(a) * 14.5;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5) continue;
    b.add(white, new THREE.BoxGeometry(5, 4, 0.3), [x, 2, z], [0, a, 0]);
    b.add(indigo, new THREE.BoxGeometry(5.2, 0.3, 0.4), [x, 4.15, z], [0, a, 0]);
    const door = new THREE.Mesh(kit.own(new THREE.BoxGeometry(1.6, 2.6, 0.08)), kit.mat('#C7D2FE', { glass: true }));
    door.position.set(x - Math.sin(a) * 0.2, 1.3, z - Math.cos(a) * 0.2);
    door.rotation.y = a;
    scene.add(door);
    doors.push(door);
    const board = nameBoard(kit, 3.4, '#A5B4FC');
    board.mesh.position.set(x - Math.sin(a) * 0.25, 3.3, z - Math.cos(a) * 0.25);
    board.mesh.rotation.y = a + Math.PI;
    scene.add(board.mesh);
    boards.push(board);
  }
  // Galeria superior e escada.
  b.add(white, new THREE.RingGeometry(10, R - 0.3, 16), [0, 5, 0], [-Math.PI / 2, 0, 0]);
  b.add(kit.mat('#C7D2FE', { glass: true }), new THREE.CylinderGeometry(10, 10, 1, 32, 1, true), [0, 5.55, 0]);
  pendants(kit, b, [[-4, 2], [4, 2], [0, -5]], 7.5, H, '#EEF2FF');
  pots(kit, b, [[-5, 15], [5, 15]]);
  const plan: Record<AcademySector, Placed> = {
    hall: { x: 0, z: 6, face: Math.PI },
    rooms: { x: -7, z: -4, face: Math.PI * 0.75 },
    review: { x: 7, z: -4, face: -Math.PI * 0.75 },
    plan: { x: 0, z: -7.5, face: 0 },
  };
  const groups = sectorsFrom(kit, scene, plan, ACADEMY_SECTORS, labels, '#A5B4FC', (id, sb) => {
    if (id === 'hall') {
      sb.add(indigo, new THREE.BoxGeometry(3, 1, 1), [0, 0.5, -0.4]);
      sb.add(white, new THREE.BoxGeometry(3.2, 0.08, 1.2), [0, 1.04, -0.4]);
    } else if (id === 'review') {
      // Mesa de cartões (flashcards).
      sb.add(white, new THREE.CylinderGeometry(1.5, 1.5, 0.08, 32), [0, 0.85, 0]);
      for (let k = 0; k < 6; k++) sb.add(kit.mat(['#A5B4FC', '#FBBF24', '#34D399'][k % 3]!, { rough: 0.5 }), new THREE.BoxGeometry(0.6, 0.02, 0.4), [Math.sin(k) * 0.8, 0.91, Math.cos(k) * 0.8], [0, k, 0]);
    } else if (id === 'plan') {
      sb.add(white, new THREE.BoxGeometry(4, 2.4, 0.1), [0, 1.8, -0.8]);
      for (let k = 0; k < 7; k++) sb.add(indigo, new THREE.BoxGeometry(0.4, 0.3 + (k % 3) * 0.3, 0.04), [-1.5 + k * 0.5, 1.1 + ((k % 3) * 0.3) / 2, -0.73]);
    } else {
      for (let k = 0; k < 4; k++) sb.add(white, new THREE.BoxGeometry(0.8, 0.75, 0.6), [(k - 1.5) * 1.1, 0.4, 0]);
    }
  });
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 7, R - 2.5), target: new THREE.Vector3(0, 2, -2) };
  return {
    scene,
    sectors: ACADEMY_SECTORS,
    pickables: groups,
    room: { radius: R - 3.5, height: H },
    obstacles: [],
    view: (id) => viewOf(plan, id, overview),
    setData: (d) => {
      const subjects = (d as AcademyData).subjects;
      boards.forEach((bd, i) => bd.draw(subjects[i] ?? ''));
      doors.forEach((door, i) => ((door.material as THREE.MeshStandardMaterial).opacity = subjects[i] ? 0.5 : 0.2));
    },
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * IDIOMAS — pavilhão-jardim com um quiosque por idioma
 * ===================================================================== */
export const LANGUAGES_SECTORS = ['garden', 'spaces'] as const;
export type LanguagesSector = (typeof LANGUAGES_SECTORS)[number];
export interface LanguagesData {
  languages: string[];
}

export function createLanguagesInterior(kit: Kit, labels: Record<LanguagesSector, string>): InteriorScene {
  const R = 16;
  const H = 8;
  const room = createRoom(kit, { radius: R, height: H, sides: 8, floor: '#E4EFE8', glass: '#CBEFE9', frame: '#B08560', accent: '#14B8A6', skylight: 7 });
  const { scene, b } = room;
  const wood = kit.mat('#B08560', { rough: 0.7 });
  const teal = kit.mat('#14B8A6', { metal: 0.2, rough: 0.4 });
  // Jardim interno: canteiro central com água e plantas.
  b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.CylinderGeometry(4.5, 4.5, 0.3, 32), [0, 0.15, 0]);
  b.add(kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }), new THREE.CircleGeometry(2, 32), [0, 0.32, 0], [-Math.PI / 2, 0, 0]);
  pots(kit, b, [[-3, 3], [3, 3], [-3, -3], [3, -3]]);
  // Seis quiosques em volta, um para cada idioma do usuário (nome na placa).
  const boards: Array<ReturnType<typeof nameBoard>> = [];
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2 + Math.PI;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.4) continue;
    const x = Math.sin(a) * 11;
    const z = Math.cos(a) * 11;
    b.add(wood, new THREE.CylinderGeometry(2, 2.1, 0.25, 6), [x, 0.12, z]);
    for (let k = 0; k < 6; k++) {
      const c = (k / 6) * Math.PI * 2;
      b.add(wood, new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), [x + Math.sin(c) * 1.7, 1.4, z + Math.cos(c) * 1.7]);
    }
    b.add(teal, new THREE.ConeGeometry(2.4, 1.2, 6), [x, 3.3, z]);
    const board = nameBoard(kit, 2.6, '#14B8A6');
    board.mesh.position.set(x * 0.86, 2.4, z * 0.86);
    board.mesh.rotation.y = a + Math.PI;
    scene.add(board.mesh);
    boards.push(board);
  }
  pendants(kit, b, [[-6, 0], [6, 0]], 5.5, H, '#FFE7B0');
  const plan: Record<LanguagesSector, Placed> = {
    garden: { x: 0, z: 7, face: Math.PI },
    spaces: { x: -6.5, z: -6.5, face: Math.PI * 0.75 },
  };
  const groups = sectorsFrom(kit, scene, plan, LANGUAGES_SECTORS, labels, '#14B8A6', (id, sb) => {
    if (id === 'garden') {
      sb.add(wood, new THREE.BoxGeometry(2.6, 0.9, 0.9), [0, 0.45, -0.3]);
    } else {
      sb.add(wood, new THREE.CylinderGeometry(1.2, 1.2, 0.08, 6), [0, 0.85, 0]);
      sb.add(wood, new THREE.CylinderGeometry(0.15, 0.2, 0.8, 8), [0, 0.42, 0]);
    }
  });
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, R - 2.5), target: new THREE.Vector3(0, 1.2, -1) };
  return {
    scene,
    sectors: LANGUAGES_SECTORS,
    pickables: groups,
    room: { radius: R - 1.5, height: H },
    obstacles: [{ x: 0, z: 0, r: 4.6, h: 1 }],
    view: (id) => viewOf(plan, id, overview),
    setData: (d) => {
      const langs = (d as LanguagesData).languages;
      boards.forEach((bd, i) => bd.draw(langs[i] ?? ''));
    },
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * INSIGHTS — cúpula com sete consoles de análise em volta do telescópio
 * ===================================================================== */
export const INSIGHTS_SECTORS = ['overview', 'productivity', 'learning', 'habits', 'goals', 'activities', 'finance'] as const;
export type InsightsSector = (typeof INSIGHTS_SECTORS)[number];

export function createInsightsInterior(kit: Kit, labels: Record<InsightsSector, string>): InteriorScene {
  const R = 15;
  const H = 9;
  const room = createRoom(kit, { radius: R, height: H, sides: 24, floor: '#F2EEF0', glass: '#F7D5DC', frame: '#F43F5E', accent: '#FDA4AF', skylight: 3 });
  const { scene, b } = room;
  const dark = kit.mat('#1F2A3A', { metal: 0.6, rough: 0.35 });
  const silver = kit.mat('#CBD5E1', { metal: 0.9, rough: 0.2 });
  // Cúpula interna e o telescópio no centro.
  b.add(kit.mat('#FBE4E8', { rough: 0.6, side: THREE.BackSide }), new THREE.SphereGeometry(R, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), [0, H, 0], [0, 0, 0], [1, 0.45, 1]);
  b.add(silver, new THREE.CylinderGeometry(0.6, 1.2, 3, 16), [0, 1.5, 0]);
  b.add(silver, new THREE.CylinderGeometry(0.7, 0.9, 5, 20), [0, 4.2, -0.8], [0.7, 0, 0]);
  b.add(kit.mat('#FDA4AF', { glow: true }), new THREE.TorusGeometry(3.2, 0.06, 6, 64), [0, 0.05, 0], [-Math.PI / 2, 0, 0]);
  const plan = ring(INSIGHTS_SECTORS, 10, true);
  const groups = sectorsFrom(kit, scene, plan, INSIGHTS_SECTORS, labels, '#F43F5E', (_id, sb) => {
    // Console de análise com tela inclinada.
    sb.add(dark, new THREE.BoxGeometry(2.4, 1, 0.9), [0, 0.5, 0]);
    sb.add(kit.mat('#FDA4AF', { glow: true }), new THREE.BoxGeometry(2, 0.9, 0.05), [0, 1.35, -0.25], [-0.35, 0, 0]);
  });
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(3.5, 7.5, R - 2.5), target: new THREE.Vector3(0, 1.5, -4) };
  return {
    scene,
    sectors: INSIGHTS_SECTORS,
    pickables: groups,
    room: { radius: R - 1.5, height: H },
    obstacles: [{ x: 0, z: 0, r: 1.6, h: 3 }],
    view: (id) => viewOf(plan, id, overview),
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}
