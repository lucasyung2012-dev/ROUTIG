/**
 * Andares dos interiores (V2.1, seções 10 e 11). O térreo é o salão de cada prédio; por cima dele
 * sobem os andares da especificação, em degraus (cada andar recua um pouco e deixa um terraço),
 * em volta de um átrio aberto sobre a claraboia do térreo. Uma torre de elevador envidraçada,
 * nos fundos, liga todos os andares.
 * Cada sala dos andares abre o painel real do módulo que corresponde a ela (nenhum dado novo);
 * salas sem tela própria ainda não abrem nada e aparecem assim na auditoria.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { buildingById } from '@/domain/park';
import { Builder, type Kit } from '../kit';
import type { Obstacle, Seat } from '../camera';
import { sectorSign, type InteriorScene } from './common';
import { footprint } from '../collision';
import { furnish, roomType, type RoomType } from './furnish';

/** Sala de um andar: chave do nome, setor real que ela abre (null = sem tela própria), tipo de mobília. */
export type RoomKind = 'desk' | 'shelf' | 'screen' | 'lounge' | 'studio';
export type FloorRoom = [key: string, sector: string | null, kind: RoomKind];

/** Andares acima do térreo, na ordem (1º, 2º, 3º). `@options` abre as opções do parque. */
export const FLOOR_PLANS: Record<ModuleId, FloorRoom[][]> = {
  dashboard: [
    [['indicators', 'panels', 'screen'], ['widgets', 'panels', 'screen'], ['visuals', 'overview', 'screen']],
    [['customize', 'profiles', 'desk'], ['observatory', 'overview', 'lounge']],
  ],
  profile: [[['achievements', 'achievements', 'shelf'], ['archive', 'archive', 'shelf'], ['personalize', 'personalize', 'desk']]],
  notes: [[['advanced', 'advanced', 'desk'], ['drawing', 'handwriting', 'studio'], ['versions', 'versions', 'shelf']]],
  library: [
    [['consult', 'consult', 'desk'], ['research', 'search', 'desk']],
    [['preserve', 'preserve', 'shelf'], ['transfer', 'transfer', 'desk']],
  ],
  calendar: [
    [['monthly', 'monthly', 'screen'], ['weekly', 'weekly', 'screen'], ['daily', 'daily', 'screen'], ['recurring', 'planning', 'desk']],
    [['history', 'agenda', 'shelf'], ['distribution', 'planning', 'screen'], ['trends', 'planning', 'screen']],
  ],
  tasks: [
    [['projects', 'lists', 'desk'], ['recurrence', 'recurrence', 'desk'], ['priorities', 'kanban', 'screen'], ['deadlines', 'planning', 'screen'], ['custom', 'kanban', 'studio']],
    [['done', 'archive', 'shelf'], ['analysis', 'planning', 'screen'], ['pending', 'capture', 'desk']],
  ],
  focus: [[['private', 'garden', 'desk'], ['reading', 'garden', 'lounge'], ['rest', 'history', 'lounge']]],
  habits: [[['monthly', 'evolution', 'screen'], ['yearly', 'evolution', 'screen'], ['streaks', 'analysis', 'screen'], ['growth', 'evolution', 'lounge']]],
  academy: [
    [['math', 'rooms', 'desk'], ['science', 'rooms', 'desk'], ['humanities', 'rooms', 'desk'], ['tech', 'rooms', 'desk'], ['exercises', 'review', 'desk']],
    [['labs', 'rooms', 'studio'], ['projects', 'rooms', 'studio'], ['talks', 'hall', 'screen'], ['resources', 'hall', 'shelf']],
    [['plan', 'plan', 'desk'], ['performance', 'review', 'screen'], ['review', 'review', 'desk']],
  ],
  languages: [
    [['grammar', 'spaces', 'desk'], ['pronunciation', 'spaces', 'studio'], ['listening', 'spaces', 'studio'], ['reading', 'spaces', 'lounge'], ['booths', 'spaces', 'studio']],
    [['conversation', 'spaces', 'lounge'], ['situations', 'spaces', 'desk'], ['culture', 'garden', 'lounge'], ['writing', 'spaces', 'desk']],
  ],
  projects: [
    [['dev', 'studio', 'desk'], ['lab', 'studio', 'screen'], ['proto', 'studio', 'studio'], ['docs', 'studio', 'shelf'], ['collab', 'studio', 'desk']],
    [['present', 'gallery', 'screen'], ['gallery', 'gallery', 'lounge'], ['review', 'gallery', 'desk'], ['archive', 'gallery', 'shelf']],
  ],
  music: [
    [['rehearsal', 'instruments', 'studio'], ['recording', 'instruments', 'studio'], ['editing', 'analysis', 'screen'], ['composing', 'instruments', 'desk'], ['booths', 'instruments', 'studio']],
    [['shows', 'atrium', 'lounge'], ['listening', 'analysis', 'lounge'], ['gallery', 'analysis', 'shelf'], ['rest', null, 'lounge']],
  ],
  sports: [
    [['gym', 'modalities', 'studio'], ['mobility', 'modalities', 'studio'], ['stretching', 'modalities', 'studio'], ['guided', 'modalities', 'screen'], ['records', 'analysis', 'screen']],
    [['planning', 'analysis', 'desk'], ['history', 'analysis', 'shelf'], ['recovery', null, 'lounge'], ['rest', null, 'lounge']],
  ],
  goals: [[['tracking', 'analysis', 'screen'], ['done', 'achieved', 'shelf'], ['history', 'achieved', 'shelf'], ['longterm', 'garden', 'desk']]],
  insights: [
    [['academic', 'learning', 'screen'], ['productivity', 'productivity', 'screen'], ['habits', 'habits', 'screen'], ['activity', 'activities', 'screen'], ['evolution', 'overview', 'screen']],
    [['charts', 'overview', 'screen'], ['reports', 'overview', 'shelf'], ['explore', 'activities', 'desk'], ['trends', 'overview', 'screen'], ['dashboards', null, 'desk']],
    [['integrated', 'overview', 'screen'], ['longterm', 'overview', 'screen'], ['indicators', null, 'desk']],
  ],
  finance: [
    [['planning', 'planning', 'desk'], ['investments', 'investments', 'screen'], ['goals', 'planning', 'desk'], ['education', 'academy', 'shelf']],
    [['assets', 'investments', 'screen'], ['evolution', 'journal', 'screen'], ['archive', 'journal', 'shelf'], ['longterm', 'planning', 'desk']],
  ],
  settings: [
    [['devices', 'data', 'desk'], ['sync', 'data', 'screen'], ['storage', 'data', 'shelf'], ['permissions', 'privacy', 'desk'], ['integrations', 'data', 'desk']],
    [['park', '@options', 'lounge'], ['privacy', 'privacy', 'desk'], ['security', 'privacy', 'desk']],
  ],
  inbox: [[['archived', 'archive', 'shelf'], ['categories', 'distribution', 'desk'], ['important', 'triage', 'screen'], ['history', 'archive', 'shelf']]],
};

const STOREY = 4.4;

/** Estilo de cada prédio: piso dos corredores por andar, paredes e luz (cada prédio com sua cara). */
const STYLES: Record<ModuleId, { floors: string[]; wall: string; glass: boolean; warm: boolean }> = {
  dashboard: { floors: ['#E6EBF2', '#D9E0EA'], wall: '#EEF2F7', glass: true, warm: false },
  profile: { floors: ['#D8C3A5'], wall: '#F3EBDD', glass: false, warm: true },
  notes: { floors: ['#E3D5C1'], wall: '#F5EFE4', glass: false, warm: true },
  library: { floors: ['#C9A27A', '#B98E66'], wall: '#EFE6D6', glass: false, warm: true },
  calendar: { floors: ['#E2E8F0', '#CBD5E1'], wall: '#F1F5F9', glass: true, warm: false },
  tasks: { floors: ['#E5E7EB', '#D1D5DB'], wall: '#F3F4F6', glass: true, warm: false },
  focus: { floors: ['#E7DCC8'], wall: '#F4EFE6', glass: false, warm: true },
  habits: { floors: ['#DDE8D5'], wall: '#EEF5EA', glass: true, warm: true },
  academy: { floors: ['#E9DFCF', '#E2D6C1', '#D9CCB3'], wall: '#F6F1E7', glass: false, warm: true },
  languages: { floors: ['#EADBC8', '#E3D2BA'], wall: '#F7EFE3', glass: false, warm: true },
  projects: { floors: ['#D9D4CC', '#CFC8BD'], wall: '#E7E3DC', glass: true, warm: false },
  music: { floors: ['#C7A27C', '#B48D68'], wall: '#EADFD0', glass: false, warm: true },
  sports: { floors: ['#D9DEE5', '#CDD3DB'], wall: '#EEF1F4', glass: true, warm: false },
  goals: { floors: ['#EDE3C8'], wall: '#F8F2E2', glass: false, warm: true },
  insights: { floors: ['#E3E8F0', '#D5DCE8', '#C8D1E0'], wall: '#EEF2F8', glass: true, warm: false },
  finance: { floors: ['#E8E2D6', '#DCD4C4'], wall: '#F2EEE6', glass: false, warm: true },
  settings: { floors: ['#E9EDF2', '#DDE3EA'], wall: '#F1F4F7', glass: true, warm: false },
  inbox: { floors: ['#E8EEF5'], wall: '#F2F6FA', glass: true, warm: false },
};

/** Piso de cada tipo de sala. */
const ROOM_FLOOR: Record<RoomType, string> = {
  classroom: '#C9A27A', lab: '#E5E7EB', booth: '#4B5563', gym: '#3F4A5A', archive: '#B98E66', gallery: '#EDE9E3', office: '#D6CFC4',
  dataviz: '#2E3646', lounge: '#B08968', studio: '#E7DCCB', stage: '#8B6B4E', observatory: '#2B3442', music: '#A47551',
};


export interface FloorZone {
  level: number;
  key: string;
  sector: string | null;
  x: number;
  z: number;
  face: number;
}

export interface FloorLevel {
  y: number;
  /** Raio da parede de vidro do andar. */
  outer: number;
  /** Raio útil (inclui o terraço do recuo). */
  walk: number;
  /** Raio do átrio aberto no meio. */
  inner: number;
  ceiling: number;
  obstacles: Obstacle[];
  /** Portas para o terraço (ângulos) e meia abertura em radianos. */
  doors: number[];
  doorHalf: number;
}

export interface Floors {
  levels: FloorLevel[];
  zones: FloorZone[];
  /** Torre do elevador (fora do salão do térreo, nos fundos). */
  elevator: { x: number; z: number };
  seats: Seat[];
  /** Cabine (sobe e desce) e as duas portas de correr (abrem para os lados). */
  cabin: THREE.Group;
  doors: [THREE.Object3D, THREE.Object3D];
}

/**
 * Monta os andares em cima de um interior. `label(key)` dá o nome da sala no idioma atual;
 * `terrace` e `floorName(n)` também vêm traduzidos.
 */
export function withFloors(kit: Kit, scene: InteriorScene, id: ModuleId, label: (key: string) => string, terrace: string, floorName: (n: number) => string): InteriorScene {
  const plan = FLOOR_PLANS[id];
  if (!plan?.length) return scene;
  const R = scene.room.radius;
  const H = scene.room.height;
  const accent = buildingById(id)?.color ?? '#22D3EE';
  const b = new Builder();
  const slab = kit.mat('#F1F3F6', { rough: 0.6 });
  const style = STYLES[id];
  const glass = kit.mat('#CFE7F5', { glass: true, side: THREE.DoubleSide });
  const metal = kit.mat('#9AA6B5', { metal: 0.85, rough: 0.3 });
  const wood = kit.mat('#A0714F', { rough: 0.75 });
  const dark = kit.mat('#2B3442', { rough: 0.5 });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const inner = R * 0.4;
  const tower = { x: 0, z: -(R + 2.2) };
  const levels: FloorLevel[] = [
    { y: 0, outer: R, walk: R - 1.2, inner: 0, ceiling: H, obstacles: scene.obstacles, doors: [], doorHalf: 0 },
  ];
  const zones: FloorZone[] = [];
  const seats: Seat[] = [];
  const thick = (r0: number, r1: number, y: number, h: number) =>
    new THREE.LatheGeometry([new THREE.Vector2(r0, y), new THREE.Vector2(r1, y), new THREE.Vector2(r1, y + h), new THREE.Vector2(r0, y + h), new THREE.Vector2(r0, y)], 64);

  plan.forEach((rooms, i) => {
    const L = i + 1;
    const y = H + i * STOREY;
    const below = L === 1 ? R : R * (1 - 0.1 * i);
    const outer = R * (1 - 0.1 * L);
    const top = L === plan.length;
    // Laje (forma o piso do andar e o terraço do recuo), átrio aberto no meio com guarda-corpo de vidro.
    b.add(slab, thick(inner, below + 0.2, y - 0.3, 0.3));
    b.add(glass, new THREE.CylinderGeometry(inner, inner, 1.1, 48, 1, true), [0, y + 0.55, 0]);
    b.add(metal, new THREE.TorusGeometry(inner, 0.05, 6, 64), [0, y + 1.1, 0], [Math.PI / 2, 0, 0]);
    b.add(glass, new THREE.CylinderGeometry(below + 0.1, below + 0.1, 1.1, 64, 1, true), [0, y + 0.55, 0]);
    b.add(metal, new THREE.TorusGeometry(below + 0.1, 0.05, 6, 64), [0, y + 1.1, 0], [Math.PI / 2, 0, 0]);
    // Fachada de vidro do andar, com montantes e quatro portas para o terraço; cobertura no último andar.
    const doors = [1, 3, 5, 7].map((k) => (k * Math.PI) / 4);
    const doorHalf = 0.8 / outer;
    const fh = STOREY - 0.3;
    doors.forEach((d) => {
      b.add(glass, new THREE.CylinderGeometry(outer, outer, fh, 12, 1, true, d + doorHalf, Math.PI / 2 - doorHalf * 2), [0, y + fh / 2, 0]);
      for (const side of [-1, 1]) {
        const a = d + side * doorHalf;
        b.add(metal, new THREE.BoxGeometry(0.14, 2.4, 0.26), [Math.sin(a) * outer, y + 1.2, Math.cos(a) * outer], [0, a, 0]);
      }
      b.add(kit.mat(accent, { glow: true }), new THREE.BoxGeometry(1.8, 0.14, 0.3), [Math.sin(d) * outer, y + 2.45, Math.cos(d) * outer], [0, d, 0]);
    });
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      if (k % 6 === 3) continue;
      b.add(metal, new THREE.BoxGeometry(0.1, STOREY - 0.3, 0.22), [Math.sin(a) * outer, y + (STOREY - 0.3) / 2, Math.cos(a) * outer], [0, a, 0]);
    }
    if (top) {
      b.add(slab, thick(inner * 0.7, outer + 0.4, y + STOREY - 0.3, 0.3));
      b.add(glass, new THREE.CircleGeometry(inner * 0.7, 48), [0, y + STOREY, 0], [-Math.PI / 2, 0, 0]);
    }
    // Terraço: floreiras e bancos no recuo entre este andar e o de baixo.
    const tr = (outer + below) / 2;
    const obstacles: Obstacle[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const px = Math.sin(a) * tr;
      const pz = Math.cos(a) * tr;
      if (Math.abs(px) < 3 && pz < 0) continue;
      if (k % 2) {
        b.add(wood, new THREE.BoxGeometry(1.8, 0.1, 0.5), [px, y + 0.45, pz], [0, a + Math.PI / 2, 0]);
        b.add(dark, new THREE.BoxGeometry(1.6, 0.4, 0.3), [px, y + 0.2, pz], [0, a + Math.PI / 2, 0]);
        seats.push({ x: px, y: y + 0.45, z: pz, face: a });
      } else {
        b.add(slab, new THREE.CylinderGeometry(0.7, 0.6, 0.6, 16), [px, y + 0.3, pz]);
        b.add(leaf, new THREE.IcosahedronGeometry(0.75, 1), [px, y + 1.0, pz]);
        obstacles.push({ x: px, z: pz, r: 0.75, h: 1.6 });
      }
    }
    if (top) {
      const s = sectorSign(kit, terrace, accent, 2.2);
      s.position.set(0, y + 2.4, tr);
      s.rotation.y = Math.PI;
      scene.scene.add(s);
    }
    // Ponte do terraço até a torre do elevador.
    b.add(slab, new THREE.BoxGeometry(2.4, 0.3, R + 2.2 - outer + 0.4), [0, y - 0.15, -(outer + R + 2.2) / 2]);
    // Salas do andar: cada uma com paredes laterais, frente com porta (vidro nos prédios de
    // tecnologia, alvenaria nos de clima mais quente), piso, luz e mobília do seu tipo.
    // Os fundos (perto do elevador) ficam como saguão.
    const ri = inner + 1.5;
    const ro = outer - 0.15;
    const lobby = 0.9;
    const span = (Math.PI * 2 - lobby) / rooms.length;
    const start = Math.PI + lobby / 2;
    const wallH = STOREY - 0.35;
    const corridor = kit.mat(style.floors[(L - 1) % style.floors.length]!, { rough: 0.35, metal: 0.05 });
    b.add(corridor, new THREE.RingGeometry(inner, below, 64, 1), [0, y + 0.012, 0], [-Math.PI / 2, 0, 0]);
    const partMat = style.glass ? glass : kit.mat(style.wall, { rough: 0.8 });
    const lamp = kit.mat(style.warm ? '#FFE8C2' : '#E8F4FF', { glow: true });
    for (let k = 0; k <= rooms.length; k++) {
      const ang = start + k * span;
      b.add(kit.mat(style.wall, { rough: 0.8 }), new THREE.BoxGeometry(0.15, wallH, ro - ri), [Math.sin(ang) * (ri + ro) / 2, y + wallH / 2, Math.cos(ang) * (ri + ro) / 2], [0, ang, 0]);
    }
    rooms.forEach(([key, sector], k) => {
      const b0 = start + k * span;
      const a = b0 + span / 2;
      const mid = (ri + ro) / 2;
      const x = Math.sin(a) * mid;
      const z = Math.cos(a) * mid;
      const face = a + Math.PI;
      const type = roomType(key, id);
      // Frente com porta de 2,4 m no meio, verga e placa com o nome.
      const dh = 1.2 / ri;
      b.add(partMat, new THREE.CylinderGeometry(ri, ri, wallH, 10, 1, true, b0, span / 2 - dh), [0, y + wallH / 2, 0]);
      b.add(partMat, new THREE.CylinderGeometry(ri, ri, wallH, 10, 1, true, a + dh, span / 2 - dh), [0, y + wallH / 2, 0]);
      b.add(kit.mat(style.wall, { rough: 0.8 }), new THREE.CylinderGeometry(ri, ri, wallH - 2.4, 6, 1, true, a - dh, dh * 2), [0, y + 2.4 + (wallH - 2.4) / 2, 0]);
      if (style.glass) b.add(metal, new THREE.TorusGeometry(ri, 0.03, 4, 48, span), [0, y + 1.0, 0], [-Math.PI / 2, 0, b0 - Math.PI / 2]);
      // Piso da sala.
      b.add(kit.mat(ROOM_FLOOR[type], { rough: type === 'lab' || type === 'booth' ? 0.4 : 0.7 }), new THREE.RingGeometry(ri, ro, 16, 1, b0 - Math.PI / 2, span), [0, y + 0.02, 0], [-Math.PI / 2, 0, 0]);
      // Luzes do teto.
      for (const f of [0.35, 0.65]) {
        const la = b0 + span * f;
        b.add(lamp, new THREE.BoxGeometry(1.2, 0.04, 0.5), [Math.sin(la) * mid, y + wallH - 0.05, Math.cos(la) * mid], [0, la, 0]);
      }
      zones.push({ level: L, key, sector, x, z, face });
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = face;
      const fb = new Builder();
      const w = mid * span * 0.9;
      const d = ro - ri - 0.3;
      const local = furnish(kit, fb, type, w, d, accent, k + L * 7);
      g.add(fb.build());
      const sign = sectorSign(kit, label(key), sector ? accent : '#94A3B8', 2.2);
      sign.position.set(0, 2.62, d / 2 + 0.25);
      g.add(sign);
      const cf = Math.cos(face);
      const sf = Math.sin(face);
      for (const st of local) seats.push({ x: x + st.x * cf + st.z * sf, y: y + st.y, z: z - st.x * sf + st.z * cf, face: st.face + face });
      g.traverse((o) => {
        o.userData.zone = zones.length - 1;
        o.userData.sector = sector;
      });
      scene.scene.add(g);
      scene.pickables.push(g);
    });
    levels.push({ y, outer, walk: below - 0.5, inner, ceiling: y + STOREY - 0.35, obstacles, doors, doorHalf });
  });

  // Torre do elevador: vidro, estrutura e uma cabine em cada andar; placa com o nome de cada andar.
  const topY = H + plan.length * STOREY;
  b.add(glass, new THREE.CylinderGeometry(1.4, 1.4, topY, 24, 1, true), [tower.x, topY / 2, tower.z]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    b.add(metal, new THREE.BoxGeometry(0.12, topY, 0.12), [tower.x + Math.sin(a) * 1.4, topY / 2, tower.z + Math.cos(a) * 1.4]);
  }
  b.add(slab, new THREE.CylinderGeometry(1.6, 1.6, 0.3, 24), [tower.x, topY, tower.z]);
  levels.forEach((lv, n) => {
    const s = sectorSign(kit, floorName(n), accent, 1.6);
    s.position.set(tower.x, lv.y + 2.9, tower.z + 1.5);
    scene.scene.add(s);
  });
  scene.scene.add(b.build());
  // Cabine: piso, parede curva ao fundo, corrimão, teto com luz, painel de andares e portas de vidro.
  const cabin = new THREE.Group();
  const cb = new Builder();
  cb.add(slab, new THREE.CylinderGeometry(1.25, 1.25, 0.12, 24), [0, -0.06, 0]);
  cb.add(kit.mat('#E9EDF2', { rough: 0.4, metal: 0.2 }), new THREE.CylinderGeometry(1.25, 1.25, 2.4, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), [0, 1.2, 0]);
  cb.add(slab, new THREE.CylinderGeometry(1.25, 1.25, 0.1, 24), [0, 2.45, 0]);
  cb.add(kit.mat('#FFF1D6', { glow: true }), new THREE.CylinderGeometry(0.6, 0.6, 0.03, 24), [0, 2.39, 0]);
  cb.add(metal, new THREE.TorusGeometry(1.12, 0.025, 6, 32, Math.PI * 0.8), [0, 0.95, 0], [Math.PI / 2, 0, Math.PI * 0.1]);
  cb.add(dark, new THREE.BoxGeometry(0.22, 0.4, 0.04), [0.95, 1.3, -0.55], [0, -0.9, 0]);
  cb.add(kit.mat(accent, { glow: true }), new THREE.BoxGeometry(0.14, 0.04, 0.05), [0.95, 1.45, -0.54], [0, -0.9, 0]);
  cabin.add(cb.build());
  const door = (side: number) => {
    const d = new THREE.Group();
    const db = new Builder();
    db.add(glass, new THREE.BoxGeometry(0.78, 2.3, 0.04), [0, 1.15, 0]);
    db.add(metal, new THREE.BoxGeometry(0.06, 2.3, 0.06), [side * 0.37, 1.15, 0]);
    db.add(metal, new THREE.BoxGeometry(0.78, 0.06, 0.06), [0, 2.3, 0]);
    d.add(db.build(false));
    d.position.set(side * 0.39, 0, 1.18);
    cabin.add(d);
    return d;
  };
  const doors: [THREE.Object3D, THREE.Object3D] = [door(-1), door(1)];
  cabin.position.set(tower.x, 0, tower.z);
  cabin.traverse((o) => (o.userData.noCollide = true));
  scene.scene.add(cabin);
  // Colisão de cada andar pelo desenho (móveis, floreiras, guarda-corpos).
  levels.forEach((lv, n) => n > 0 && lv.obstacles.push(...footprint(scene.scene, () => lv.y, 0.3, 1.45, 0.5)));
  scene.floors = { levels, zones, elevator: tower, seats, cabin, doors };
  return scene;
}
