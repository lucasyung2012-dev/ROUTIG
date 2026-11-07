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
  const floorMat = kit.mat('#E4E8EE', { rough: 0.3, metal: 0.05 });
  const glass = kit.mat('#CFE7F5', { glass: true, side: THREE.DoubleSide });
  const metal = kit.mat('#9AA6B5', { metal: 0.85, rough: 0.3 });
  const wood = kit.mat('#A0714F', { rough: 0.75 });
  const dark = kit.mat('#2B3442', { rough: 0.5 });
  const rug = kit.mat(accent, { rough: 0.9 });
  const screen = kit.mat('#7DD3FC', { glow: true, rough: 0.3 });
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
    b.add(floorMat, new THREE.RingGeometry(inner, below, 64, 1), [0, y + 0.01, 0], [-Math.PI / 2, 0, 0]);
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
    // Salas do andar, em volta do átrio (os fundos ficam livres para o elevador).
    const mid = (inner + outer) / 2;
    rooms.forEach(([key, sector, kind], k) => {
      const a = Math.PI + ((k + 1) / (rooms.length + 1)) * Math.PI * 2;
      const x = Math.sin(a) * mid;
      const z = Math.cos(a) * mid;
      const face = a + Math.PI;
      zones.push({ level: L, key, sector, x, z, face });
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = face;
      g.userData.zone = zones.length - 1;
      g.userData.sector = sector;
      const fb = new Builder();
      fb.add(rug, new THREE.CircleGeometry(1.9, 32), [0, 0.02, 0], [-Math.PI / 2, 0, 0]);
      if (kind === 'desk' || kind === 'studio') {
        fb.add(wood, new THREE.BoxGeometry(2.2, 0.06, 0.9), [0, 0.75, 0]);
        for (const sx of [-1, 1]) fb.add(dark, new THREE.BoxGeometry(0.06, 0.72, 0.8), [sx * 1.0, 0.37, 0]);
        for (const sx of [-0.6, 0.6]) {
          fb.add(dark, new THREE.BoxGeometry(0.45, 0.06, 0.45), [sx, 0.46, 0.75]);
          fb.add(dark, new THREE.BoxGeometry(0.45, 0.5, 0.06), [sx, 0.72, 0.98]);
          fb.add(metal, new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6), [sx, 0.22, 0.75]);
        }
        if (kind === 'studio') fb.add(metal, new THREE.BoxGeometry(0.9, 1.4, 0.05), [0, 1.5, -0.6], [-0.2, 0, 0]);
      } else if (kind === 'shelf') {
        for (const sx of [-0.9, 0.9]) {
          fb.add(wood, new THREE.BoxGeometry(1.6, 2.1, 0.4), [sx, 1.05, -0.9]);
          for (let r = 0; r < 4; r++) fb.add(kit.mat(['#E07A5F', '#3D9970', '#5B8DB8', '#F2CC8F'][r]!, { rough: 0.8 }), new THREE.BoxGeometry(1.4, 0.3, 0.25), [sx, 0.35 + r * 0.5, -0.78]);
        }
      } else if (kind === 'screen') {
        fb.add(dark, new THREE.BoxGeometry(2.6, 1.5, 0.08), [0, 1.6, -0.9]);
        fb.add(screen, new THREE.BoxGeometry(2.4, 1.3, 0.02), [0, 1.6, -0.85]);
        fb.add(metal, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), [0, 0.45, -0.9]);
        fb.add(wood, new THREE.BoxGeometry(1.2, 0.45, 0.5), [0, 0.22, 0.6]);
      } else {
        fb.add(kit.mat('#8FA3B8', { rough: 0.9 }), new THREE.BoxGeometry(2.0, 0.42, 0.8), [0, 0.22, -0.5]);
        fb.add(kit.mat('#8FA3B8', { rough: 0.9 }), new THREE.BoxGeometry(2.0, 0.5, 0.2), [0, 0.6, -0.85]);
        fb.add(wood, new THREE.CylinderGeometry(0.45, 0.45, 0.4, 20), [0, 0.2, 0.6]);
        seats.push({ x: x + Math.sin(face) * -0.5, y: y + 0.45, z: z + Math.cos(face) * -0.5, face });
      }
      g.add(fb.build());
      const sign = sectorSign(kit, label(key), sector ? accent : '#94A3B8', 2.4);
      sign.position.set(0, 2.7, -1.2);
      g.add(sign);
      g.traverse((o) => {
        o.userData.zone = zones.length - 1;
        o.userData.sector = sector;
      });
      scene.scene.add(g);
      scene.pickables.push(g);
      obstacles.push({ x, z, r: 1.2, h: 2 });
    });
    levels.push({ y, outer, walk: below - 0.5, inner, ceiling: y + STOREY - 0.35, obstacles, doors, doorHalf });
  });

  // Torre do elevador: vidro, estrutura e uma cabine em cada andar; placa com o nome de cada andar.
  const topY = H + plan.length * STOREY;
  b.add(glass, new THREE.CylinderGeometry(1.4, 1.4, topY, 24, 1, true), [tower.x, topY / 2, tower.z]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.add(metal, new THREE.BoxGeometry(0.12, topY, 0.12), [tower.x + Math.sin(a) * 1.4, topY / 2, tower.z + Math.cos(a) * 1.4]);
  }
  b.add(slab, new THREE.CylinderGeometry(1.6, 1.6, 0.3, 24), [tower.x, topY, tower.z]);
  b.add(kit.mat(accent, { glow: true }), new THREE.CylinderGeometry(1.2, 1.2, 0.15, 24), [tower.x, H - 0.1, tower.z]);
  levels.forEach((lv, n) => {
    const s = sectorSign(kit, floorName(n), accent, 1.6);
    s.position.set(tower.x, lv.y + 2.9, tower.z + 1.5);
    scene.scene.add(s);
  });
  scene.scene.add(b.build());
  // Colisão de cada andar pelo desenho (móveis, floreiras, guarda-corpos).
  levels.forEach((lv, n) => n > 0 && lv.obstacles.push(...footprint(scene.scene, () => lv.y)));
  scene.floors = { levels, zones, elevator: tower, seats };
  return scene;
}
