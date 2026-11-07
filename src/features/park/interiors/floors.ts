/**
 * Andares dos interiores (V2.1, seções 10 e 11). O térreo é o salão de cada prédio; por cima dele
 * sobem os andares da especificação, cada prédio na sua arquitetura (forms.ts): átrio com galerias,
 * núcleo com escada, corredor com salas, mezanino sobre pé-direito alto, planta livre ou anel em
 * volta de um jardim; forma, recuos, giro e fachada próprios. Uma torre de elevador envidraçada,
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
import { decorate, furnish, roomType, type RoomType } from './furnish';
import { enrichGround, enrichLevel, type Lobby } from './enrich';
import { FORMS, apothem, circle, clipZ, facade, facadeMats, levelRot, levelScale, outline, polyR, slab, type Plan } from '../forms';
import type { Thing } from './things';

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
  /** Ponto em frente à porta da sala (de onde se entra). */
  ex: number;
  ez: number;
}

export interface FloorLevel {
  y: number;
  /** Raio da fachada (apótema; para a câmera não atravessar). */
  outer: number;
  /** Raio máximo onde se pode andar (inclui o terraço do recuo). */
  walk: number;
  /** Raio do vazio/núcleo do meio (0 quando não há). */
  inner: number;
  ceiling: number;
  obstacles: Obstacle[];
  /** Portas da fachada (ângulos) e meia abertura em radianos. */
  doors: number[];
  doorHalf: number;
  /** Onde não se pisa: vazios, núcleo, fachada fora das portas, além do terraço. */
  blocked: (x: number, z: number) => boolean;
  /** Raio da fachada na direção do ponto (câmera da 3ª pessoa). */
  wallAt: (x: number, z: number) => number;
  /** Onde se chega saindo do elevador. */
  arrive: { x: number; z: number };
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
  /** Objetos funcionais (piano, luminárias, globo, relógio, luneta, escada, portas das salas). */
  things: Thing[];
  plan: Plan;
}

/** Vaga de uma sala no andar: centro, frente (para onde abre a porta), largura e fundo. */
interface Slot {
  x: number;
  z: number;
  face: number;
  w: number;
  d: number;
  /** Fatia do anel (plantas em anel) ou caixa com paredes (corredor, mezanino) ou ilha sem paredes. */
  kind: 'wedge' | 'box' | 'island';
  b0?: number;
  span?: number;
  ri?: number;
  ro?: number;
}

/**
 * Monta os andares em cima de um interior, cada prédio na sua arquitetura (forms.ts).
 * `label(key)` dá o nome da sala no idioma atual; `terrace` e `floorName(n)` também vêm traduzidos.
 */
export function withFloors(kit: Kit, scene: InteriorScene, id: ModuleId, label: (key: string) => string, terrace: string, floorName: (n: number) => string): InteriorScene {
  const plan = FLOOR_PLANS[id];
  if (!plan?.length) return scene;
  const form = FORMS[id];
  const R = scene.room.radius;
  const H = scene.room.height;
  const accent = buildingById(id)?.color ?? '#22D3EE';
  const b = new Builder();
  const slabMat = kit.mat('#F1F3F6', { rough: 0.6 });
  const style = STYLES[id];
  const glass = kit.mat('#CFE7F5', { glass: true, side: THREE.DoubleSide });
  const metal = kit.mat('#9AA6B5', { metal: 0.85, rough: 0.3 });
  const wood = kit.mat('#A0714F', { rough: 0.75 });
  const dark = kit.mat('#2B3442', { rough: 0.5 });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const fm = facadeMats(kit, form);
  const tower = { x: 0, z: -(R + 2.2) };
  const things: Thing[] = [];
  const thingRoot = new THREE.Group();
  scene.scene.add(thingRoot);
  const groundBlocked = (x: number, z: number) => Math.hypot(x, z) > R - 1.2 && !(Math.abs(x) < 1.1 && z < 0);
  const levels: FloorLevel[] = [
    { y: 0, outer: R, walk: R - 1.2, inner: 0, ceiling: H, obstacles: scene.obstacles, doors: [], doorHalf: 0, blocked: groundBlocked, wallAt: () => R, arrive: { x: 0, z: -(R - 4) } },
  ];
  const zones: FloorZone[] = [];
  const seats: Seat[] = [];
  const wallMat = kit.mat(style.wall, { rough: 0.8 });
  const partMat = style.glass ? glass : wallMat;
  const lampMat = kit.mat(style.warm ? '#FFE8C2' : '#E8F4FF', { glow: true });
  const wallH = STOREY - 0.35;

  plan.forEach((rooms, i) => {
    const L = i + 1;
    const y = H + i * STOREY;
    const top = L === plan.length;
    const Ro = R * levelScale(form, L);
    const rot = levelRot(form, L);
    const pr = (a: number) => polyR(form.sides, form.sides >= 3 ? rot : 0, Ro, a);
    const prB = (a: number) => (L === 1 ? R : polyR(form.sides, form.sides >= 3 ? levelRot(form, L - 1) : 0, R * levelScale(form, L - 1), a));
    const apo = apothem(form.sides, Ro);
    const own = outline(form.sides, rot, Ro);
    const belowLine = L === 1 ? circle(R, 64) : outline(form.sides, levelRot(form, L - 1), R * levelScale(form, L - 1));
    const inside = (x: number, z: number, m: number) => Math.hypot(x, z) < pr(Math.atan2(x, z)) - m;
    // Terraço no recuo: largura mínima em volta.
    let terraceW = Infinity;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      terraceW = Math.min(terraceW, prB(a) - pr(a));
    }
    const hasTerrace = terraceW > 1.4;
    const inner = form.plan === 'atrium' || form.plan === 'garden' ? Math.max(3.2, apo * 0.36) : form.plan === 'core' ? Math.max(2.6, apo * 0.24) : 0;
    const zv = form.plan === 'side' ? apo * 0.12 : Infinity;

    // Laje: o próprio andar (com o vazio do meio ou cortada no mezanino) e o terraço do recuo.
    const holes: Array<Array<[number, number]>> = [];
    if (form.plan === 'atrium' || (form.plan === 'garden' && L > 1)) holes.push(circle(inner));
    b.add(slabMat, slab(form.plan === 'side' ? clipZ(own, zv) : own, holes, y, 0.3));
    if (hasTerrace || L === 1) b.add(kit.mat('#E4DED2', { rough: 0.85 }), slab(belowLine, [own], y - 0.03, 0.27));
    // Guarda-corpo de vidro na borda do terraço.
    if (hasTerrace) railing(b, glass, metal, belowLine, y, true);
    // Vazio do meio: guarda-corpo em volta.
    if (holes.length) {
      b.add(glass, new THREE.CylinderGeometry(inner, inner, 1.1, 48, 1, true), [0, y + 0.55, 0]);
      b.add(metal, new THREE.TorusGeometry(inner, 0.05, 6, 64), [0, y + 1.1, 0], [Math.PI / 2, 0, 0]);
    }
    if (form.plan === 'side') {
      const half = Math.sqrt(Math.max(0, pr(Math.PI / 2) ** 2 - zv * zv)) + 2;
      const pts: Array<[number, number]> = [];
      for (let x = -half; x <= half; x += 0.5) if (inside(x, zv, 0.1)) pts.push([x, zv]);
      railing(b, glass, metal, pts, y, false);
    }
    // Fachada no tipo do prédio, com a porta da ponte do elevador e as do terraço.
    const want = [Math.PI, ...(hasTerrace ? [Math.PI / 4, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, -Math.PI / 4] : [])];
    const doors = facade(b, form, fm, Ro, rot, y, STOREY - 0.3, want);
    const doorHalf = 0.8 / apo;
    if (top) {
      // Cobertura: claraboia sobre o átrio; jardim a céu aberto; laje inteira nos demais.
      const roofHoles = form.plan === 'atrium' || form.plan === 'garden' ? [circle(form.plan === 'atrium' ? inner * 0.8 : inner)] : [];
      b.add(slabMat, slab(own.map(([x, z]) => [x * 1.03, z * 1.03] as [number, number]), roofHoles, y + STOREY, 0.3));
      if (form.plan === 'atrium') {
        b.add(glass, new THREE.SphereGeometry(inner * 0.8, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, y + STOREY - 0.3, 0], undefined, [1, 0.35, 1]);
        for (let k = 0; k < 8; k++) b.add(metal, new THREE.TorusGeometry(inner * 0.8, 0.03, 4, 24, Math.PI), [0, y + STOREY - 0.3, 0], [0, (k / 8) * Math.PI, 0], [1, 0.35, 1]);
      }
    }
    // Ponte do terraço/fachada até a torre do elevador.
    const backR = pr(Math.PI);
    b.add(slabMat, new THREE.BoxGeometry(2.4, 0.3, -tower.z - backR + 0.6), [0, y - 0.15, -(backR + -tower.z) / 2]);
    for (const s of [-1, 1]) railing(b, glass, metal, [[s * 1.2, -backR], [s * 1.2, tower.z + 1.3]], y, false);

    // Terraço: floreiras e bancos no recuo.
    const obstacles: Obstacle[] = [];
    if (hasTerrace) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + Math.PI / 10;
        const tr = (pr(a) + prB(a)) / 2;
        const px = Math.sin(a) * tr;
        const pz = Math.cos(a) * tr;
        if (Math.abs(px) < 3 && pz < 0) continue;
        if (doors.some((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))) < 0.25)) continue;
        if (k % 2) {
          b.add(wood, new THREE.BoxGeometry(1.8, 0.1, 0.5), [px, y + 0.45, pz], [0, a + Math.PI / 2, 0]);
          b.add(dark, new THREE.BoxGeometry(1.6, 0.4, 0.3), [px, y + 0.2, pz], [0, a + Math.PI / 2, 0]);
          seats.push({ x: px, y: y + 0.45, z: pz, face: a });
        } else {
          b.add(slabMat, new THREE.CylinderGeometry(0.6, 0.5, 0.6, 16), [px, y + 0.3, pz]);
          b.add(leaf, new THREE.IcosahedronGeometry(0.65, 1), [px, y + 1.0, pz]);
          obstacles.push({ x: px, z: pz, r: 0.65, h: 1.6 });
        }
      }
      if (top) {
        const a = Math.PI / 2;
        const tr = (pr(a) + prB(a)) / 2;
        const s = sectorSign(kit, terrace, accent, 2.2);
        s.position.set(Math.sin(a) * tr, y + 2.4, Math.cos(a) * tr);
        s.rotation.y = a + Math.PI;
        scene.scene.add(s);
      }
    }

    // Piso de circulação do andar.
    const corridorMat = kit.mat(style.floors[(L - 1) % style.floors.length]!, { rough: 0.35, metal: 0.05 });
    b.add(corridorMat, slab(form.plan === 'side' ? clipZ(own, zv) : own, holes, y + 0.012, 0.01));

    // Salas: cada planta distribui do seu jeito.
    const slots = layout(form.plan, rooms.length, apo, inner, zv, inside);
    const lobby = lobbyOf(form.plan, apo, inner, slots);
    slots.forEach((sl, k) => {
      const [key, sector] = rooms[k]!;
      const type = roomType(key, id);
      const front = { x: Math.sin(sl.face), z: Math.cos(sl.face) };
      const ex = sl.x + front.x * (sl.d / 2 + 0.9);
      const ez = sl.z + front.z * (sl.d / 2 + 0.9);
      zones.push({ level: L, key, sector, x: sl.x, z: sl.z, face: sl.face, ex, ez });
      const zi = zones.length - 1;
      if (sl.kind === 'wedge') {
        const { b0, span, ri, ro } = sl as Required<Slot>;
        const a = b0 + span / 2;
        const dh = 1.0 / ri;
        b.add(partMat, new THREE.CylinderGeometry(ri, ri, wallH, 10, 1, true, b0, span / 2 - dh), [0, y + wallH / 2, 0]);
        b.add(partMat, new THREE.CylinderGeometry(ri, ri, wallH, 10, 1, true, a + dh, span / 2 - dh), [0, y + wallH / 2, 0]);
        b.add(wallMat, new THREE.CylinderGeometry(ri, ri, wallH - 2.4, 6, 1, true, a - dh, dh * 2), [0, y + 2.4 + (wallH - 2.4) / 2, 0]);
        if (style.glass) b.add(metal, new THREE.TorusGeometry(ri, 0.03, 4, 48, span), [0, y + 1.0, 0], [-Math.PI / 2, 0, b0 - Math.PI / 2]);
        for (const e of [b0, b0 + span]) b.add(wallMat, new THREE.BoxGeometry(0.15, wallH, ro - ri), [Math.sin(e) * (ri + ro) / 2, y + wallH / 2, Math.cos(e) * (ri + ro) / 2], [0, e, 0]);
        b.add(kit.mat(ROOM_FLOOR[type], { rough: type === 'lab' || type === 'booth' ? 0.4 : 0.7 }), new THREE.RingGeometry(ri, ro, 16, 1, b0 - Math.PI / 2, span), [0, y + 0.02, 0], [-Math.PI / 2, 0, 0]);
        for (const f of [0.35, 0.65]) {
          const la = b0 + span * f;
          b.add(lampMat, new THREE.BoxGeometry(1.2, 0.04, 0.5), [Math.sin(la) * (ri + ro) / 2, y + wallH - 0.05, Math.cos(la) * (ri + ro) / 2], [0, la, 0]);
        }
      }
      const g = new THREE.Group();
      g.position.set(sl.x, y, sl.z);
      g.rotation.y = sl.face;
      const fb = new Builder();
      if (sl.kind !== 'wedge') {
        const { w, d } = sl;
        fb.add(kit.mat(ROOM_FLOOR[type], { rough: type === 'lab' || type === 'booth' ? 0.4 : 0.7 }), new THREE.PlaneGeometry(w, d), [0, 0.02, 0], [-Math.PI / 2, 0, 0]);
        if (sl.kind === 'box') {
          // Paredes: fundo, laterais e frente com porta de 1,8 m e verga; rodapé.
          fb.add(wallMat, new THREE.BoxGeometry(w, wallH, 0.15), [0, wallH / 2, -d / 2]);
          for (const s of [-1, 1]) fb.add(wallMat, new THREE.BoxGeometry(0.15, wallH, d), [s * w / 2, wallH / 2, 0]);
          const side = (w - 1.8) / 2;
          for (const s of [-1, 1]) fb.add(partMat, new THREE.BoxGeometry(side, wallH, 0.12), [s * (0.9 + side / 2), wallH / 2, d / 2]);
          fb.add(wallMat, new THREE.BoxGeometry(1.8, wallH - 2.4, 0.15), [0, 2.4 + (wallH - 2.4) / 2, d / 2]);
          for (const s of [-1, 1]) fb.add(metal, new THREE.BoxGeometry(0.08, 2.4, 0.18), [s * 0.9, 1.2, d / 2]);
          fb.add(dark, new THREE.BoxGeometry(w - 0.1, 0.1, 0.02), [0, 0.05, -d / 2 + 0.085]);
        } else {
          // Ilha da planta livre: tapete, estantes baixas nas laterais e pendentes.
          fb.add(kit.mat(style.warm ? '#C9B79C' : '#B8C2CF', { rough: 1 }), new THREE.PlaneGeometry(w * 0.8, d * 0.75), [0, 0.03, 0], [-Math.PI / 2, 0, 0]);
          for (const s of [-1, 1]) {
            fb.add(wood, new THREE.BoxGeometry(0.4, 1.15, d * 0.8), [s * (w / 2 - 0.2), 0.575, -0.1]);
            for (let r = 0; r < 3; r++) fb.add(kit.mat(['#E07A5F', '#81B29A', '#5B8DB8'][r]!, { rough: 0.85 }), new THREE.BoxGeometry(0.3, 0.26, d * 0.22), [s * (w / 2 - 0.2), 0.35 + r * 0.36, -d * 0.25 + r * d * 0.2]);
            fb.add(leaf, new THREE.IcosahedronGeometry(0.3, 1), [s * (w / 2 - 0.2), 1.35, d * 0.3]);
          }
          for (const s of [-1, 1]) {
            fb.add(metal, new THREE.CylinderGeometry(0.006, 0.006, 1.2, 4), [s * w * 0.2, wallH - 0.6, 0]);
            fb.add(lampMat, new THREE.ConeGeometry(0.28, 0.3, 20, 1, true), [s * w * 0.2, wallH - 1.3, 0]);
          }
        }
        for (const f of [-0.25, 0.25]) if (sl.kind === 'box') fb.add(lampMat, new THREE.BoxGeometry(1.2, 0.04, 0.5), [w * f, wallH - 0.05, 0]);
      }
      const local = furnish(kit, fb, type, sl.w * (sl.kind === 'island' ? 0.75 : 1), sl.d, accent, k + L * 7);
      decorate(kit, fb, key, sl.w, sl.d, accent, style.warm, k + L * 7);
      g.add(fb.build());
      const sign = sectorSign(kit, label(key), sector ? accent : '#94A3B8', 2.2);
      sign.position.set(0, 2.62, sl.d / 2 + 0.25);
      g.add(sign);
      const cf = Math.cos(sl.face);
      const sf = Math.sin(sl.face);
      for (const st of local) seats.push({ x: sl.x + st.x * cf + st.z * sf, y: y + st.y, z: sl.z - st.x * sf + st.z * cf, face: st.face + sl.face });
      g.traverse((o) => {
        o.userData.zone = zi;
        o.userData.sector = sector;
      });
      scene.scene.add(g);
      scene.pickables.push(g);
      // Porta da sala: chegando perto, abre o painel real dela.
      things.push({ kind: 'room', level: L, x: ex, z: ez, face: sl.face, zone: zi });
    });

    // Corredor do meio (planta em corredor e planta livre): faixa no piso e luz contínua no teto.
    if (form.plan === 'corridor' || form.plan === 'open') {
      const half = form.plan === 'corridor' ? 1.6 : 2.4;
      const zf = apo - 0.6;
      const zb = -apo + 0.6;
      b.add(kit.mat(style.warm ? '#B9936C' : '#9AA8B8', { rough: 0.6 }), new THREE.BoxGeometry(half * 1.2, 0.01, zf - zb), [0, y + 0.025, (zf + zb) / 2]);
      b.add(lampMat, new THREE.BoxGeometry(0.3, 0.04, zf - zb - 1), [0, y + wallH - 0.05, (zf + zb) / 2]);
      if (form.plan === 'open') {
        // Canteiros baixos no meio do corredor largo, com bancos dos dois lados.
        for (let zz = zb + 6; zz < zf - 3; zz += 7) {
          b.add(kit.mat('#D9CBB6', { rough: 0.8 }), new THREE.BoxGeometry(1.0, 0.45, 2.2), [0, y + 0.22, zz]);
          b.add(leaf, new THREE.IcosahedronGeometry(0.5, 1), [0, y + 0.75, zz], undefined, [1.2, 0.8, 2.4]);
          for (const s of [-1, 1]) {
            b.add(wood, new THREE.BoxGeometry(0.45, 0.08, 1.8), [s * 0.8, y + 0.45, zz]);
            seats.push({ x: s * 0.8, y: y + 0.45, z: zz, face: s * Math.PI / 2 });
          }
        }
      }
    }
    // Núcleo maciço (planta com núcleo): parede de pedra, nichos com telas, porta da escada.
    if (form.plan === 'core') coreLevel(kit, b, thingRoot, things, L, y, inner, accent, top, plan.length);
    // Jardim interno no 1º andar (a céu aberto), com árvores, espelho d'água e bancos.
    if (form.plan === 'garden' && L === 1) gardenCourt(kit, b, seats, obstacles, y, inner, top ? 0 : plan.length - 1);

    const ceiling = y + STOREY - 0.35;
    enrichLevel(kit, b, seats, id, L, top, y, lobby, form.plan === 'atrium' || form.plan === 'garden' ? inner : 0, apo, ceiling, accent, style.warm, thingRoot, things);

    const bridge = (x: number, z: number) => Math.abs(x) < 1.1 && z < -backR + 0.4 && z > tower.z + 1.2;
    const atDoor = (a: number) => doors.some((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))) < doorHalf * 0.8);
    const blocked = (x: number, z: number) => {
      if (bridge(x, z)) return false;
      const r = Math.hypot(x, z);
      const a = Math.atan2(x, z);
      const f = pr(a);
      if (Math.abs(r - f) <= 0.3) return !atDoor(a);
      if (r > f) return !hasTerrace || r > prB(a) - 0.5;
      if (inner && (form.plan !== 'garden' || L > 1) && r < inner + (form.plan === 'core' ? 0.3 : 0.5)) return true;
      if (z > zv - 0.4) return true;
      return false;
    };
    levels.push({ y, outer: apo, walk: Math.max(R, Ro) + 1, inner, ceiling, obstacles, doors, doorHalf, blocked, wallAt: (x, z) => pr(Math.atan2(x, z)), arrive: { x: 0, z: -backR + 2.4 } });
  });

  // Térreo: camada de detalhe em volta do salão (sem cobrir o que o prédio já tem).
  enrichGround(kit, b, seats, scene.obstacles, R, H, accent, style.warm, thingRoot, things);
  // Torre do elevador: vidro, estrutura e uma cabine em cada andar; placa com o nome de cada andar.
  const topY = H + plan.length * STOREY;
  b.add(glass, new THREE.CylinderGeometry(1.4, 1.4, topY, 24, 1, true), [tower.x, topY / 2, tower.z]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    b.add(metal, new THREE.BoxGeometry(0.12, topY, 0.12), [tower.x + Math.sin(a) * 1.4, topY / 2, tower.z + Math.cos(a) * 1.4]);
  }
  b.add(slabMat, new THREE.CylinderGeometry(1.6, 1.6, 0.3, 24), [tower.x, topY, tower.z]);
  levels.forEach((lv, n) => {
    const s = sectorSign(kit, floorName(n), accent, 1.6);
    s.position.set(tower.x, lv.y + 2.9, tower.z + 1.5);
    scene.scene.add(s);
  });
  scene.scene.add(b.build());
  // Cabine: piso, parede curva ao fundo, corrimão, teto com luz, painel de andares e portas de vidro.
  const cabin = new THREE.Group();
  const cb = new Builder();
  cb.add(slabMat, new THREE.CylinderGeometry(1.25, 1.25, 0.12, 24), [0, -0.06, 0]);
  cb.add(kit.mat('#E9EDF2', { rough: 0.4, metal: 0.2 }), new THREE.CylinderGeometry(1.25, 1.25, 2.4, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), [0, 1.2, 0]);
  cb.add(slabMat, new THREE.CylinderGeometry(1.25, 1.25, 0.1, 24), [0, 2.45, 0]);
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
  // Colisão de cada andar pelo desenho (móveis, floreiras, paredes das salas).
  levels.forEach((lv, n) => n > 0 && lv.obstacles.push(...footprint(scene.scene, () => lv.y, 0.3, 1.45, 0.5)));
  scene.floors = { levels, zones, elevator: tower, seats, cabin, doors, things, plan: form.plan };
  return scene;
}

/** Guarda-corpo de vidro com corrimão ao longo de uma linha (fechada ou não). */
function railing(b: Builder, glass: THREE.Material, metal: THREE.Material, pts: Array<[number, number]>, y: number, closed: boolean) {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 0.01) continue;
    const ang = Math.atan2(q[0] - p[0], q[1] - p[1]);
    const mx = (p[0] + q[0]) / 2;
    const mz = (p[1] + q[1]) / 2;
    b.add(glass, new THREE.BoxGeometry(0.03, 1.0, len), [mx, y + 0.5, mz], [0, ang, 0]);
    b.add(metal, new THREE.BoxGeometry(0.06, 0.05, len), [mx, y + 1.05, mz], [0, ang, 0]);
  }
}

/** Distribui as salas conforme a planta. */
function layout(plan: Plan, n: number, apo: number, inner: number, zv: number, inside: (x: number, z: number, m: number) => boolean): Slot[] {
  const out: Slot[] = [];
  if (plan === 'atrium' || plan === 'garden' || plan === 'core') {
    // Anel de salas entre o corredor do meio e a fachada; os fundos ficam para o saguão.
    const ri = inner + (plan === 'core' ? 1.9 : 1.6);
    const ro = apo - 0.2;
    const lobby = 1.0;
    const span = (Math.PI * 2 - lobby) / n;
    const start = Math.PI + lobby / 2;
    for (let k = 0; k < n; k++) {
      const b0 = start + k * span;
      const a = b0 + span / 2;
      const mid = (ri + ro) / 2;
      out.push({ x: Math.sin(a) * mid, z: Math.cos(a) * mid, face: a + Math.PI, w: mid * span * 0.9, d: ro - ri - 0.3, kind: 'wedge', b0, span, ri, ro });
    }
    return out;
  }
  // Fundo máximo de uma caixa que cabe no polígono (cantos com folga).
  const fits = (cx: number, cz: number, face: number, w: number, d: number) => {
    const c = Math.cos(face);
    const s = Math.sin(face);
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].every(([lx, lz]) => inside(cx + lx! * c + lz! * s, cz - lx! * s + lz! * c, 0.35));
  };
  if (plan === 'corridor' || plan === 'open') {
    // Corredor reto da frente aos fundos; salas (ou ilhas) dos dois lados, de frente para ele.
    const half = plan === 'corridor' ? 1.6 : 2.4;
    const zb = -apo * 0.6;
    const zf = apo * 0.8;
    const nL = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) {
      const left = k < nL;
      const m = left ? nL : n - nL;
      const j = left ? k : k - nL;
      const len = (zf - zb) / m;
      const z = zb + (j + 0.5) * len;
      const s = left ? -1 : 1;
      const face = left ? Math.PI / 2 : -Math.PI / 2;
      const w = len - (plan === 'open' ? 0.8 : 0.15);
      let d = 2.5;
      while (d < apo && fits(s * (half + (d + 0.25) / 2), z, face, w, d + 0.25)) d += 0.25;
      out.push({ x: s * (half + d / 2), z, face, w, d, kind: plan === 'corridor' ? 'box' : 'island' });
    }
    return out;
  }
  // Mezanino: salas lado a lado no fundo, de frente para a galeria sobre o pé-direito alto;
  // passagem no meio até o elevador.
  const zr1 = zv - 2.8;
  const nL = Math.ceil(n / 2);
  let xm = 1.5;
  while (inside(xm + 0.25, zr1, 0.4)) xm += 0.25;
  for (let k = 0; k < n; k++) {
    const left = k < nL;
    const m = left ? nL : n - nL;
    const j = left ? k : k - nL;
    const wAll = xm - 1.5;
    const w = wAll / m - 0.15;
    const cx = (left ? -1 : 1) * (1.5 + (j + 0.5) * (wAll / m));
    let d = 2.5;
    while (d < apo * 2 && fits(cx, zr1 - (d + 0.25) / 2, 0, w, d + 0.25)) d += 0.25;
    out.push({ x: cx, z: zr1 - d / 2, face: 0, w, d, kind: 'box' });
  }
  return out;
}

/** Saguão do elevador de cada planta (sofá, mesa, planta, luminária e a marca do prédio). */
function lobbyOf(plan: Plan, apo: number, inner: number, slots: Slot[]): Lobby {
  if (plan === 'side') {
    // Na galeria sobre o pé-direito alto, nas pontas: sofá de frente para o vazio.
    const zg = Math.max(...slots.map((s) => s.z + s.d / 2)) + 1.4;
    const sx = -apo * 0.5;
    return { sofa: { x: sx, z: zg - 0.5, face: 0 }, table: [sx, zg + 0.45], plant: [sx - 1.6, zg - 0.3], lamp: [sx + 1.5, zg - 0.6], sig: { x: apo * 0.5, z: zg - 0.4, face: Math.PI } };
  }
  const z = plan === 'corridor' || plan === 'open' ? -apo * 0.8 : -(inner + apo) / 2;
  const sx = plan === 'corridor' || plan === 'open' ? 3.4 : 2.2;
  return { sofa: { x: -2.2, z, face: Math.PI / 2 }, table: [-0.9, z], plant: [-2.4, z + 1.8], lamp: [-2.4, z - 1.8], sig: { x: sx, z, face: -Math.PI / 2 } };
}

/** Núcleo maciço com a escada em caracol: parede de pedra, nichos com telas e porta da escada. */
function coreLevel(kit: Kit, b: Builder, root: THREE.Object3D, things: Thing[], L: number, y: number, r: number, accent: string, top: boolean, count: number) {
  const stone = kit.mat('#D8D2C6', { rough: 0.9 });
  const dark = kit.mat('#2B3442', { rough: 0.5 });
  const h = STOREY - 0.35;
  // Parede do núcleo com a abertura da escada na frente (ângulo 0).
  const gap = 0.7;
  b.add(stone, new THREE.CylinderGeometry(r, r, h, 40, 1, true, gap / 2, Math.PI * 2 - gap), [0, y + h / 2, 0]);
  b.add(stone, new THREE.CylinderGeometry(r - 0.3, r - 0.3, h, 40, 1, true, gap / 2, Math.PI * 2 - gap), [0, y + h / 2, 0]);
  b.add(stone, new THREE.CylinderGeometry(r, r, h - 2.4, 8, 1, true, -gap / 2, gap), [0, y + 2.4 + (h - 2.4) / 2, 0]);
  // Nichos com telas acesas em volta.
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.add(dark, new THREE.BoxGeometry(1.4, 0.9, 0.06), [Math.sin(a) * (r + 0.04), y + 1.6, Math.cos(a) * (r + 0.04)], [0, a, 0]);
    b.add(kit.mat(accent, { glow: true }), new THREE.BoxGeometry(1.25, 0.75, 0.02), [Math.sin(a) * (r + 0.08), y + 1.6, Math.cos(a) * (r + 0.08)], [0, a, 0]);
    b.add(kit.mat('#F8FAFC', { glow: true }), new THREE.BoxGeometry(0.8, 0.05, 0.01), [Math.sin(a) * (r + 0.095), y + 1.75, Math.cos(a) * (r + 0.095)], [0, a, 0]);
  }
  // Escada em caracol dentro do núcleo (degraus girando em volta do pilar).
  const wood = kit.mat('#A0714F', { rough: 0.7 });
  b.add(dark, new THREE.CylinderGeometry(0.18, 0.18, STOREY, 12), [0, y + STOREY / 2 - 0.3, 0]);
  for (let k = 0; k < 18; k++) {
    const a = -0.4 - (k / 18) * Math.PI * 2;
    const rr = (r - 0.3) / 2 + 0.1;
    b.add(wood, new THREE.BoxGeometry(0.4, 0.06, r - 0.6), [Math.sin(a) * rr, y + (k / 18) * STOREY, Math.cos(a) * rr], [0, a + Math.PI / 2, 0]);
  }
  if (top) b.add(stone, new THREE.CylinderGeometry(r + 0.2, r + 0.2, 1.2, 40), [0, y + STOREY + 0.6, 0]);
  void root;
  things.push({ kind: 'stairs', level: L, x: 0, z: r + 1.0, face: 0 });
  void count;
}

/** Pátio-jardim do 1º andar: grama, árvores, espelho d'água com pedras e bancos em volta. */
function gardenCourt(kit: Kit, b: Builder, seats: Seat[], obstacles: Obstacle[], y: number, r: number, _upper: number) {
  const grass = kit.mat('#7DA65E', { rough: 1 });
  const bark = kit.mat('#6B4F3A', { rough: 0.9 });
  const leafA = kit.mat('#4C9A4F', { rough: 0.9 });
  const leafB = kit.mat('#3E7F44', { rough: 0.9 });
  const stone = kit.mat('#CFC6B6', { rough: 0.9 });
  b.add(grass, new THREE.CircleGeometry(r - 0.2, 48), [0, y + 0.03, 0], [-Math.PI / 2, 0, 0]);
  b.add(stone, new THREE.TorusGeometry(r - 0.15, 0.12, 6, 64), [0, y + 0.08, 0], [Math.PI / 2, 0, 0]);
  // Espelho d'água no meio.
  b.add(stone, new THREE.CylinderGeometry(r * 0.38, r * 0.38, 0.3, 32), [0, y + 0.15, 0]);
  b.add(kit.mat('#5DA9C9', { rough: 0.05, metal: 0.2 }), new THREE.CircleGeometry(r * 0.34, 32), [0, y + 0.31, 0], [-Math.PI / 2, 0, 0]);
  obstacles.push({ x: 0, z: 0, r: r * 0.38, h: 0.3 });
  for (let k = 0; k < 3; k++) b.add(stone, new THREE.DodecahedronGeometry(0.2 + k * 0.05, 0), [Math.sin(k * 2.1) * r * 0.2, y + 0.35, Math.cos(k * 2.1) * r * 0.2]);
  // Árvores e bancos alternados.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const tr = r * 0.68;
    const x = Math.sin(a) * tr;
    const z = Math.cos(a) * tr;
    if (k % 2 === 0) {
      b.add(bark, new THREE.CylinderGeometry(0.1, 0.16, 2.6, 8), [x, y + 1.3, z]);
      for (let j = 0; j < 4; j++) b.add(j % 2 ? leafA : leafB, new THREE.IcosahedronGeometry(0.9 - j * 0.12, 1), [x + Math.sin(j * 1.7) * 0.4, y + 2.6 + j * 0.35, z + Math.cos(j * 1.7) * 0.4]);
      obstacles.push({ x, z, r: 0.4, h: 3 });
    } else {
      b.add(kit.mat('#A0714F', { rough: 0.75 }), new THREE.BoxGeometry(1.6, 0.08, 0.45), [x, y + 0.45, z], [0, a + Math.PI / 2, 0]);
      b.add(stone, new THREE.BoxGeometry(1.4, 0.4, 0.35), [x, y + 0.2, z], [0, a + Math.PI / 2, 0]);
      seats.push({ x, y: y + 0.45, z, face: a + Math.PI });
    }
  }
}
