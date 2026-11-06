/**
 * Interiores da região Central (Dashboard, Profile, Settings), conforme docs/V2-PARQUE-PLANO.md.
 * As funções de cada setor ficam nos painéis do módulo (HTML real); aqui está a arquitetura,
 * com telas que mostram só números reais.
 */
import * as THREE from 'three';
import { Builder, type Kit } from '../kit';
import { bench, canvasPlane, createRoom, finishRoom, markSector, pendants, pots, sectorGroup, sectorSign, sectorView, setDetailCommon, type InteriorScene } from './common';

interface Placed {
  x: number;
  z: number;
  face: number;
}

function sectorsFrom<T extends string>(kit: Kit, scene: THREE.Scene, plan: Record<T, Placed>, ids: readonly T[], labels: Record<T, string>, accent: string, build: (id: T, sb: Builder, g: THREE.Group) => void): THREE.Group[] {
  return ids.map((id) => {
    const p = plan[id];
    const g = sectorGroup(id, p.x, p.z, p.face);
    const sb = new Builder();
    sb.add(kit.mat('#E9EEF4', { rough: 0.3 }), new THREE.CylinderGeometry(3.2, 3.3, 0.1, 48), [0, 0.05, 0]);
    sb.add(kit.mat('#1F2A3A', { metal: 0.6 }), new THREE.CylinderGeometry(0.05, 0.05, 3.8, 8), [-2.5, 1.9, 1.2]);
    build(id, sb, g);
    g.add(sb.build());
    const sign = sectorSign(kit, labels[id], accent);
    sign.position.set(-2.5, 4.0, 1.2);
    g.add(sign);
    markSector(g, id);
    scene.add(g);
    return g;
  });
}

const viewOf = (plan: Record<string, Placed>, id: string, overview: { cam: THREE.Vector3; target: THREE.Vector3 }) => {
  const p = plan[id];
  return p ? sectorView(p.x, p.z, p.face) : overview;
};

/* =====================================================================
 * DASHBOARD — Observatório Central
 * ===================================================================== */
export const DASHBOARD_SECTORS = ['atrium', 'overview', 'panels', 'profiles', 'actions'] as const;
export type DashboardSector = (typeof DASHBOARD_SECTORS)[number];

export interface DashboardData {
  date: string;
  greeting: string;
  /** Pares rótulo → número (só dados reais). */
  stats: Array<[string, number]>;
}

export function createDashboardInterior(kit: Kit, labels: Record<DashboardSector, string>): InteriorScene {
  const R = 18;
  const H = 8;
  const room = createRoom(kit, { radius: R, height: H, sides: 12, floor: '#EEF2F7', glass: '#A9D8F2', frame: '#CBD5E1', accent: '#22D3EE', skylight: 4 });
  const { scene, b } = room;
  const silver = kit.mat('#CBD5E1', { metal: 0.9, rough: 0.2 });
  const white = kit.mat('#F3F6FA', { rough: 0.45 });
  const sofa = kit.mat('#3B4A6B', { rough: 0.8 });
  const plan: Record<DashboardSector, Placed> = {
    atrium: { x: 0, z: 0, face: 0 },
    overview: { x: 0, z: -11, face: 0 },
    panels: { x: 0, z: 11, face: Math.PI },
    profiles: { x: -11.5, z: -1, face: Math.PI / 2 },
    actions: { x: 11.5, z: -1, face: -Math.PI / 2 },
  };
  // Anel panorâmico repetido no átrio: passarela a 4,6 m sobre colunas.
  b.add(silver, new THREE.LatheGeometry([new THREE.Vector2(7, 0), new THREE.Vector2(8.6, 0), new THREE.Vector2(8.6, 0.4), new THREE.Vector2(7, 0.4), new THREE.Vector2(7, 0)], 96, Math.PI * 0.2, Math.PI * 1.6), [0, 4.6, 0]);
  b.add(kit.mat('#B9E6F7', { glass: true }), new THREE.CylinderGeometry(8.6, 8.6, 1.0, 96, 1, true, Math.PI * 0.2, Math.PI * 1.6), [0, 5.5, 0]);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * 0.2 + (i / 7) * Math.PI * 1.6;
    b.add(white, new THREE.CylinderGeometry(0.16, 0.16, 4.6, 12), [Math.sin(a) * 7.8, 2.3, Math.cos(a) * 7.8]);
  }
  b.add(room.accentMat, new THREE.TorusGeometry(7.8, 0.05, 6, 96, Math.PI * 1.6), [0, 4.58, 0], [-Math.PI / 2, 0, Math.PI * 0.2 - Math.PI / 2]);
  // Piso radial de pedra.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    b.add(kit.mat('#DCD6C8', { rough: 0.6 }), new THREE.BoxGeometry(0.08, 0.02, 7), [Math.sin(a) * 9.5, 0.01, Math.cos(a) * 9.5], [0, a, 0]);
  }
  pots(kit, b, [[-6, 14], [6, 14], [-14, 8], [14, 8], [-14, -9], [14, -9]]);
  pendants(kit, b, [[-4, 8], [4, 8], [-4, -8], [4, -8]], 6.4, H);

  let screen: ReturnType<typeof canvasPlane> | null = null;
  const groups = sectorsFrom(kit, scene, plan, DASHBOARD_SECTORS, labels, '#22D3EE', (id, sb, g) => {
    if (id === 'atrium') {
      // Recepção visual: totem circular com o anel em miniatura.
      sb.add(white, new THREE.CylinderGeometry(1.1, 1.3, 1.0, 32), [0, 0.5, 0]);
      sb.add(room.accentMat, new THREE.TorusGeometry(1.0, 0.04, 6, 48), [0, 1.6, 0], [-Math.PI / 2.4, 0, 0]);
    } else if (id === 'overview') {
      // Painel panorâmico curvo (180°) e sofás em meia-lua.
      const s = canvasPlane(kit, 7.2, 3.0, 300, true);
      s.mesh.position.set(0, 2.6, -1.6);
      g.add(s.mesh);
      screen = s;
      sb.add(kit.mat('#1F2A3A', { metal: 0.5 }), new THREE.BoxGeometry(7.5, 3.3, 0.15), [0, 2.6, -1.72]);
      for (const x of [-2.2, 2.2]) sb.add(sofa, new THREE.BoxGeometry(2.6, 0.5, 0.9), [x, 0.25, 1.6], [0, x > 0 ? -0.3 : 0.3, 0]);
    } else if (id === 'panels') {
      // Parede-grade de molduras e mesa de montagem.
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) sb.add(silver, new THREE.BoxGeometry(1.4, 0.9, 0.06), [(c - 1.5) * 1.6, 1.6 + r * 1.1, -1.6]);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) sb.add(kit.mat(['#7C5CFC', '#22D3EE', '#14B8A6', '#60A5FA'][(r + c) % 4]!, { rough: 0.5 }), new THREE.BoxGeometry(1.25, 0.75, 0.02), [(c - 1.5) * 1.6, 1.6 + r * 1.1, -1.55]);
      sb.add(white, new THREE.BoxGeometry(3, 0.85, 1.4), [0, 0.43, 1]);
    } else if (id === 'profiles') {
      // Mesa redonda com miniaturas.
      sb.add(white, new THREE.CylinderGeometry(1.5, 1.5, 0.1, 32), [0, 0.85, 0]);
      sb.add(silver, new THREE.CylinderGeometry(0.2, 0.3, 0.8, 12), [0, 0.4, 0]);
      for (let k = 0; k < 3; k++) sb.add(kit.mat(['#7C5CFC', '#22D3EE', '#F59E0B'][k]!, { rough: 0.4 }), new THREE.BoxGeometry(0.5, 0.35, 0.05), [Math.sin((k / 3) * Math.PI * 2) * 0.8, 1.1, Math.cos((k / 3) * Math.PI * 2) * 0.8], [0, (k / 3) * Math.PI * 2, 0]);
    } else {
      // Balcões em pé com telas inclinadas.
      for (let k = 0; k < 4; k++) {
        sb.add(white, new THREE.BoxGeometry(0.9, 1.1, 0.6), [(k - 1.5) * 1.2, 0.55, 0]);
        sb.add(room.accentMat, new THREE.BoxGeometry(0.75, 0.45, 0.04), [(k - 1.5) * 1.2, 1.3, 0.1], [-0.6, 0, 0]);
      }
    }
  });
  bench(kit, b, -3.5, 4.5, 0.3);
  bench(kit, b, 3.5, 4.5, -0.3);
  finishRoom(room);

  let data: DashboardData | null = null;
  const draw = () => {
    if (!screen) return;
    const ctx = screen.ctx;
    const { width: w, height: h } = ctx.canvas;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0B1A33');
    grad.addColorStop(1, '#13294B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#E8FBFF';
    ctx.textAlign = 'left';
    ctx.font = '700 34px Inter, system-ui, sans-serif';
    ctx.fillText(data?.greeting ?? '', 30, 52);
    ctx.font = '500 22px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#9BE7F5';
    ctx.fillText(data?.date ?? '', 30, 84);
    const stats = data?.stats ?? [];
    const cw = (w - 60) / Math.max(1, stats.length);
    stats.forEach(([label, n], i) => {
      const x = 30 + i * cw;
      ctx.fillStyle = 'rgba(34,211,238,0.12)';
      ctx.fillRect(x, 120, cw - 18, 140);
      ctx.fillStyle = '#F1FAFF';
      ctx.textAlign = 'center';
      ctx.font = '800 56px Inter, system-ui, sans-serif';
      ctx.fillText(String(n), x + (cw - 18) / 2, 200);
      ctx.font = '500 20px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#9BE7F5';
      ctx.fillText(label, x + (cw - 18) / 2, 238, cw - 30);
    });
    screen.tex.needsUpdate = true;
  };
  draw();

  const overview = { cam: new THREE.Vector3(0, 6.6, 8.5), target: new THREE.Vector3(0, 1.6, -7) };
  return {
    scene,
    sectors: DASHBOARD_SECTORS,
    pickables: groups,
    room: { radius: R, height: H },
    obstacles: [{ x: 0, z: 0, r: 1.5, h: 1 }],
    view: (id) => (id === 'entry' ? overview : id === 'atrium' ? { cam: new THREE.Vector3(0, 5.5, 9), target: new THREE.Vector3(0, 1.5, 0) } : viewOf(plan, id, overview)),
    setData: (d) => {
      data = d as DashboardData;
      draw();
    },
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * PROFILE — Pavilhão da Identidade
 * ===================================================================== */
export const PROFILE_SECTORS = ['atrium', 'interests', 'trajectory', 'achievements', 'archive', 'personalize'] as const;
export type ProfileSector = (typeof PROFILE_SECTORS)[number];

export function createProfileInterior(kit: Kit, labels: Record<ProfileSector, string>): InteriorScene {
  const R = 17;
  const H = 6.5;
  const room = createRoom(kit, { radius: R, height: H, sides: 8, floor: '#EFE9DD', glass: '#D6ECF5', frame: '#A0714F', accent: '#FFD9A0', skylight: 3 });
  const { scene, b } = room;
  const wood = kit.mat('#A0714F', { rough: 0.7 });
  const stone = kit.mat('#EDE6D8', { rough: 0.8 });
  const concrete = kit.mat('#B9B4AA', { rough: 0.9 });
  const warm = kit.mat('#FFD9A0', { glow: true });
  const plan: Record<ProfileSector, Placed> = {
    atrium: { x: 0, z: 10, face: Math.PI },
    interests: { x: -9, z: -6, face: 0.35 },
    trajectory: { x: 0, z: -9, face: 0 },
    achievements: { x: 9, z: -6, face: -0.35 },
    archive: { x: 11, z: 4, face: -Math.PI / 2 },
    personalize: { x: -11, z: 4, face: Math.PI / 2 },
  };
  // Linha do tempo arquitetônica: faixa de luz no piso que sobe pela parede da galeria.
  const tl = new Builder();
  tl.add(room.accentMat, new THREE.PlaneGeometry(0.25, 18), [0, 0.012, 1], [-Math.PI / 2, 0, Math.PI / 2]);
  tl.add(room.accentMat, new THREE.PlaneGeometry(0.25, 4), [0, 2, -11.9], [0, 0, 0]);
  for (let k = 0; k < 9; k++) tl.add(room.accentMat, new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16), [-8 + k * 2, 0.02, 1]);
  scene.add(tl.build(false));
  // Paredes-galeria em pedra com nichos iluminados.
  for (const s of [-1, 1]) {
    b.add(stone, new THREE.BoxGeometry(0.4, 4.2, 9), [s * 14.5, 2.1, -3], [0, 0, 0]);
    for (let k = 0; k < 4; k++) b.add(warm, new THREE.BoxGeometry(0.1, 1.1, 0.9), [s * 14.25, 2.3, -6.5 + k * 2.3]);
  }
  b.add(concrete, new THREE.BoxGeometry(12, 4.2, 0.4), [0, 2.1, -12.2]);
  pots(kit, b, [[-5, 13], [5, 13], [-14, 10], [14, 10]]);
  pendants(kit, b, [[-6, 0], [6, 0], [0, 4]], 5, H, '#FFE2B0');

  const groups = sectorsFrom(kit, scene, plan, PROFILE_SECTORS, labels, '#FFD9A0', (id, sb) => {
    if (id === 'atrium') {
      // Retrato em moldura grande e banco de madeira.
      sb.add(wood, new THREE.BoxGeometry(2.4, 3, 0.15), [0, 2.2, -1.5]);
      sb.add(kit.mat('#F7EFE1', { rough: 0.6 }), new THREE.BoxGeometry(2.0, 2.6, 0.05), [0, 2.2, -1.4]);
      bench(kit, sb, 0, 1.3, 0, 2.8);
    } else if (id === 'interests') {
      for (let k = 0; k < 4; k++) {
        sb.add(stone, new THREE.CylinderGeometry(0.4, 0.45, 1.0, 16), [(k - 1.5) * 1.3, 0.5, 0]);
        sb.add(kit.mat(['#A78BFA', '#22D3EE', '#F59E0B', '#34D399'][k]!, { rough: 0.4 }), new THREE.IcosahedronGeometry(0.3, 0), [(k - 1.5) * 1.3, 1.3, 0]);
      }
    } else if (id === 'trajectory') {
      for (let k = 0; k < 5; k++) sb.add(wood, new THREE.BoxGeometry(0.9, 0.7, 0.06), [(k - 2) * 1.3, 2.2, -1.5]);
    } else if (id === 'achievements') {
      for (let k = 0; k < 3; k++) {
        sb.add(kit.mat('#D6ECF5', { glass: true }), new THREE.BoxGeometry(0.8, 1.6, 0.8), [(k - 1) * 1.4, 1.1, 0]);
        sb.add(concrete, new THREE.BoxGeometry(0.9, 0.3, 0.9), [(k - 1) * 1.4, 0.15, 0]);
        sb.add(warm, new THREE.BoxGeometry(0.3, 0.3, 0.3), [(k - 1) * 1.4, 0.9, 0]);
      }
    } else if (id === 'archive') {
      for (let k = 0; k < 3; k++) sb.add(wood, new THREE.BoxGeometry(1.0, 1.2, 0.6), [(k - 1) * 1.1, 0.6, -0.8]);
      sb.add(wood, new THREE.BoxGeometry(2.0, 0.08, 1), [0, 0.85, 1]);
    } else {
      sb.add(wood, new THREE.BoxGeometry(2.4, 0.08, 1.1), [0, 0.85, 0]);
      sb.add(kit.mat('#1F2A3A', { metal: 0.5 }), new THREE.BoxGeometry(1.2, 0.7, 0.05), [0, 1.3, -0.3], [-0.3, 0, 0]);
    }
  });
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 5.2, R - 2), target: new THREE.Vector3(0, 1.4, -3) };
  return {
    scene,
    sectors: PROFILE_SECTORS,
    pickables: groups,
    room: { radius: R, height: H },
    obstacles: [],
    view: (id) => viewOf(plan, id, overview),
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * SETTINGS — salão hexagonal e seis pavilhões de setor
 * ===================================================================== */
export const SETTINGS_ROOMS = ['identity', 'appearance', 'modules', 'privacy', 'data', 'help'] as const;
export type SettingsRoom = (typeof SETTINGS_ROOMS)[number];

export function createSettingsInterior(kit: Kit, labels: Record<SettingsRoom, string>): InteriorScene {
  const R = 16;
  const H = 7;
  const room = createRoom(kit, { radius: R, height: H, sides: 6, floor: '#EEF0F2', glass: '#BFE3F2', frame: '#B08560', accent: '#94E2FF', skylight: 4 });
  const { scene, b } = room;
  const wood = kit.mat('#B08560', { rough: 0.7 });
  const slate = kit.mat('#64748B', { metal: 0.3, rough: 0.5 });
  const moss = kit.mat('#5E9E4C', { rough: 1 });
  const plan = {} as Record<SettingsRoom, Placed>;
  SETTINGS_ROOMS.forEach((id, i) => {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6 + Math.PI;
    plan[id] = { x: Math.sin(a) * 10.5, z: Math.cos(a) * 10.5, face: a + Math.PI };
  });
  // Coluna central com anéis e jardim de musgo em volta.
  b.add(kit.mat('#CBD5E1', { metal: 0.9, rough: 0.22 }), new THREE.CylinderGeometry(0.9, 1.2, H, 16), [0, H / 2, 0]);
  b.add(moss, new THREE.CylinderGeometry(3, 3, 0.25, 6), [0, 0.12, 0]);
  b.add(room.accentMat, new THREE.TorusGeometry(2.2, 0.06, 6, 48), [0, 3.2, 0], [Math.PI / 2, 0, 0]);
  pendants(kit, b, [[-4, 4], [4, 4], [0, -5]], 5.5, H, '#E0F4FF');

  const groups = sectorsFrom(kit, scene, plan, SETTINGS_ROOMS, labels, '#94E2FF', (_id, sb) => {
    // Cada pavilhão: nicho de ardósia, mesa de madeira com painel e teto verde baixo.
    sb.add(slate, new THREE.CylinderGeometry(3, 3, 3.4, 6, 1, true, Math.PI * 0.7, Math.PI * 0.6), [0, 1.7, 0]);
    sb.add(moss, new THREE.CylinderGeometry(3.1, 3.1, 0.2, 6, 1, false, Math.PI * 0.7, Math.PI * 0.6), [0, 3.5, 0]);
    sb.add(wood, new THREE.BoxGeometry(2.2, 0.08, 1), [0, 0.85, 0.2]);
    sb.add(wood, new THREE.BoxGeometry(0.1, 0.8, 0.8), [-1, 0.42, 0.2]);
    sb.add(wood, new THREE.BoxGeometry(0.1, 0.8, 0.8), [1, 0.42, 0.2]);
    sb.add(kit.mat('#1F2A3A', { metal: 0.5 }), new THREE.BoxGeometry(1.1, 0.65, 0.05), [0, 1.3, -0.1], [-0.3, 0, 0]);
  });
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, R - 2), target: new THREE.Vector3(0, 1.4, 0) };
  return {
    scene,
    sectors: SETTINGS_ROOMS,
    pickables: groups,
    room: { radius: R, height: H },
    obstacles: [{ x: 0, z: 0, r: 3, h: 1 }],
    view: (id) => viewOf(plan, id, overview),
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}
