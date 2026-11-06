/**
 * Interiores da região Leste: Observatório Temporal (Calendar), Centro de Operações (Tasks),
 * Projects e Finanças. A mesa digital do Tasks mostra as tarefas reais de hoje; os estandes do
 * Projects levam o nome e a cor de cada projeto ativo.
 */
import * as THREE from 'three';
import type { Kit } from '../kit';
import { canvasPlane, createRoom, finishRoom, pendants, pots, bench, setDetailCommon, wrap, type InteriorScene } from './common';
import { sectorsFrom, viewOf, type Placed } from './central';

const ring = <T extends string>(ids: readonly T[], r: number): Record<T, Placed> => {
  const out = {} as Record<T, Placed>;
  const n = ids.length + 1;
  ids.forEach((id, i) => {
    const a = ((i + 1) / n) * Math.PI * 2;
    out[id] = { x: Math.sin(a) * r, z: Math.cos(a) * r, face: a + Math.PI };
  });
  return out;
};

/* =====================================================================
 * CALENDAR — relógio astronômico suspenso no átrio, salas em volta
 * ===================================================================== */
export const CALENDAR_SECTORS = ['atrium', 'daily', 'weekly', 'monthly', 'agenda', 'planning', 'calendars'] as const;
export type CalendarSector = (typeof CALENDAR_SECTORS)[number];

export function createCalendarInterior(kit: Kit, labels: Record<CalendarSector, string>): InteriorScene {
  const R = 17;
  const H = 10;
  const room = createRoom(kit, { radius: R, height: H, sides: 24, floor: '#EDF1F8', glass: '#BFD3F5', frame: '#B8C2CF', accent: '#93C5FD', skylight: 4 });
  const { scene, b } = room;
  const brass = kit.mat('#D4B572', { metal: 0.8, rough: 0.3 });
  const blue = kit.mat('#2563EB', { metal: 0.3, rough: 0.35 });
  const white = kit.mat('#F4F6FA', { rough: 0.5 });
  // Piso com linhas circulares e radiais (as horas).
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    b.add(kit.mat('#C9D6EE', { rough: 0.6 }), new THREE.BoxGeometry(0.1, 0.02, 6), [Math.sin(a) * 7, 0.01, Math.cos(a) * 7], [0, a, 0]);
  }
  // Mezanino circular (2º pavimento).
  b.add(white, new THREE.RingGeometry(12.5, R - 0.3, 48), [0, 5, 0], [-Math.PI / 2, 0, 0]);
  b.add(kit.mat('#CFE0FA', { glass: true }), new THREE.CylinderGeometry(12.5, 12.5, 1, 48, 1, true), [0, 5.55, 0]);
  pendants(kit, b, [[-5, 5], [5, 5], [0, -6]], 4.2, H, '#E8F0FF');
  pots(kit, b, [[-6, 14], [6, 14]]);
  // Relógio astronômico suspenso (Ø 8 m) com ponteiros na hora real.
  const clock = new THREE.Group();
  clock.position.set(0, 6.4, 0);
  const rings: THREE.Mesh[] = [];
  for (const [r, tilt] of [[4, 0], [3.3, 0.5], [2.6, -0.4]] as const) {
    const m = new THREE.Mesh(kit.own(new THREE.TorusGeometry(r, 0.1, 8, 96)), brass);
    m.rotation.x = Math.PI / 2 + tilt;
    clock.add(m);
    rings.push(m);
  }
  const face = new THREE.Mesh(kit.own(new THREE.CircleGeometry(2.2, 48)), kit.mat('#0F1E46', { rough: 0.5, side: THREE.DoubleSide }));
  const hand = new THREE.Mesh(kit.own(new THREE.BoxGeometry(0.16, 1.8, 0.06)), kit.mat('#FBBF24', { glow: true }));
  hand.geometry.translate(0, 0.8, 0.05);
  const handM = new THREE.Mesh(kit.own(new THREE.BoxGeometry(0.1, 2.1, 0.06)), kit.mat('#F2F4F8', { metal: 0.4 }));
  handM.geometry.translate(0, 1, 0.08);
  clock.add(face, hand, handM);
  scene.add(clock);
  b.add(kit.mat('#334155', { metal: 0.6 }), new THREE.CylinderGeometry(0.03, 0.03, H - 6.4, 4), [0, (H + 6.4) / 2 + 2, 0]);

  const plan = { atrium: { x: 0, z: 9, face: Math.PI }, ...ring(CALENDAR_SECTORS.filter((s) => s !== 'atrium'), 11) } as Record<CalendarSector, Placed>;
  const groups = sectorsFrom(kit, scene, plan, CALENDAR_SECTORS, labels, '#93C5FD', (id, sb) => {
    if (id === 'atrium') {
      sb.add(blue, new THREE.BoxGeometry(3, 1, 1), [0, 0.5, -0.4]);
    } else if (id === 'daily') {
      // Parede-grade de horários.
      sb.add(white, new THREE.BoxGeometry(3.4, 3, 0.1), [0, 1.9, -0.9]);
      for (let k = 0; k < 8; k++) sb.add(kit.mat('#C9D6EE'), new THREE.BoxGeometry(3.2, 0.03, 0.04), [0, 0.7 + k * 0.36, -0.83]);
      sb.add(blue, new THREE.BoxGeometry(2.4, 0.5, 0.05), [0.2, 1.8, -0.8]);
    } else if (id === 'weekly') {
      for (let k = 0; k < 7; k++) sb.add(k % 2 ? white : kit.mat('#DCE6F7'), new THREE.BoxGeometry(0.42, 2.4, 0.12), [-1.5 + k * 0.5, 1.4, -0.6]);
    } else if (id === 'monthly') {
      sb.add(white, new THREE.BoxGeometry(3, 0.1, 2.2), [0, 0.9, 0]);
      for (let k = 0; k < 30; k++) sb.add(kit.mat(k % 7 === 5 ? '#FBBF24' : '#C9D6EE'), new THREE.BoxGeometry(0.34, 0.06, 0.26), [-1.2 + (k % 7) * 0.4, 0.98, -0.7 + Math.floor(k / 7) * 0.34]);
    } else if (id === 'agenda') {
      for (let k = 0; k < 6; k++) sb.add(white, new THREE.BoxGeometry(2.6, 0.32, 0.08), [0, 0.6 + k * 0.42, -0.8]);
    } else if (id === 'planning') {
      sb.add(kit.mat('#E8F0FF', { glow: true }), new THREE.BoxGeometry(3.2, 0.08, 1.6), [0, 0.95, 0]);
      sb.add(white, new THREE.BoxGeometry(3.4, 0.9, 1.8), [0, 0.45, 0]);
    } else {
      for (let k = 0; k < 6; k++) sb.add(kit.mat(['#2563EB', '#22C55E', '#F59E0B', '#EF4444', '#A855F7', '#14B8A6'][k]!, { rough: 0.5 }), new THREE.BoxGeometry(0.45, 2, 0.1), [-1.25 + k * 0.5, 1.2, -0.8]);
    }
  });
  bench(kit, b, -3, 12, 0);
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 4, 14.5), target: new THREE.Vector3(0, 4.5, -4) };
  return {
    scene,
    sectors: CALENDAR_SECTORS,
    pickables: groups,
    room: { radius: R - 1, height: H },
    obstacles: [{ x: 0, z: 9, r: 1.8, h: 1 }],
    view: (id) => viewOf(plan, id, overview),
    setData: () => undefined,
    tick: (t, camera) => {
      room.trees.tick(t);
      const d = new Date();
      const m = d.getMinutes() + d.getSeconds() / 60;
      const h = (d.getHours() % 12) + m / 60;
      hand.rotation.z = -(h / 12) * Math.PI * 2;
      handM.rotation.z = -(m / 60) * Math.PI * 2;
      rings[1]!.rotation.z = t * 0.12;
      rings[2]!.rotation.z = -t * 0.08;
      // O mostrador sempre de frente para quem olha.
      const yaw = Math.atan2(camera.position.x, camera.position.z);
      face.rotation.y = hand.rotation.y = handM.rotation.y = 0;
      clock.rotation.y = yaw;
    },
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * TASKS — mesa digital de planejamento com as tarefas reais de hoje
 * ===================================================================== */
export const TASKS_SECTORS = ['atrium', 'capture', 'lists', 'kanban', 'planning', 'recurrence', 'archive'] as const;
export type TasksSector = (typeof TASKS_SECTORS)[number];
export interface TasksRoomData {
  title: string;
  /** Tarefas de hoje e atrasadas (títulos reais). */
  today: string[];
  overdue: number;
}

export function createTasksInterior(kit: Kit, labels: Record<TasksSector, string>): InteriorScene {
  const R = 17;
  const H = 8;
  const room = createRoom(kit, { radius: R, height: H, sides: 8, floor: '#E9ECF1', glass: '#BBD3F0', frame: '#2B3442', accent: '#22D3EE', skylight: 3 });
  const { scene, b } = room;
  const graphite = kit.mat('#2B3442', { metal: 0.5, rough: 0.4 });
  const silver = kit.mat('#CBD5E1', { metal: 0.85, rough: 0.25 });
  // A mesa digital (10 m) com painéis de contexto em volta.
  b.add(graphite, new THREE.BoxGeometry(10, 0.9, 4), [0, 0.45, 0]);
  b.add(silver, new THREE.BoxGeometry(10.2, 0.06, 4.2), [0, 0.93, 0]);
  for (const s of [-1, 1]) b.add(graphite, new THREE.BoxGeometry(0.1, 2.4, 3), [s * 6.4, 2.2, 0], [0, s * 0.3, 0]);
  pendants(kit, b, [[-3, 0], [3, 0]], 4.6, H, '#E6FBFF');
  pots(kit, b, [[-12, 6], [12, 6], [-12, -6], [12, -6]]);
  // Tela da mesa: as tarefas de hoje (desenhadas sobre o tampo).
  const top = canvasPlane(kit, 9.6, 3.8, 300, true);
  top.mesh.rotation.x = -Math.PI / 2;
  top.mesh.position.set(0, 0.97, 0);
  scene.add(top.mesh);

  const plan = { atrium: { x: 0, z: 9, face: Math.PI }, ...ring(TASKS_SECTORS.filter((s) => s !== 'atrium'), 11.5) } as Record<TasksSector, Placed>;
  const groups = sectorsFrom(kit, scene, plan, TASKS_SECTORS, labels, '#22D3EE', (id, sb) => {
    if (id === 'kanban') {
      for (let c = 0; c < 3; c++) {
        sb.add(kit.mat('#F2F4F8', { rough: 0.5 }), new THREE.BoxGeometry(1.1, 2.6, 0.08), [(c - 1) * 1.25, 1.5, -0.8]);
        for (let k = 0; k < 3 - c; k++) sb.add(kit.mat(['#22D3EE', '#60A5FA', '#34D399'][c]!, { rough: 0.5 }), new THREE.BoxGeometry(0.9, 0.42, 0.04), [(c - 1) * 1.25, 2.4 - k * 0.55, -0.74]);
      }
    } else if (id === 'capture') {
      for (let k = 0; k < 3; k++) {
        sb.add(silver, new THREE.BoxGeometry(0.7, 1.1, 0.5), [(k - 1) * 1.2, 0.55, 0]);
        sb.add(kit.mat('#22D3EE', { glow: true }), new THREE.BoxGeometry(0.6, 0.4, 0.04), [(k - 1) * 1.2, 1.3, 0.1], [-0.6, 0, 0]);
      }
    } else if (id === 'recurrence') {
      sb.add(silver, new THREE.TorusGeometry(1.1, 0.12, 8, 48), [0, 1.8, -0.4]);
      sb.add(graphite, new THREE.BoxGeometry(0.2, 1.4, 0.2), [0, 0.7, -0.4]);
    } else if (id === 'archive') {
      for (let k = 0; k < 4; k++) sb.add(graphite, new THREE.BoxGeometry(0.8, 1.6 + k * 0.4, 0.7), [(k - 1.5) * 0.95, 0.8 + k * 0.2, -0.5]);
    } else if (id === 'atrium') {
      sb.add(silver, new THREE.BoxGeometry(3, 1, 1), [0, 0.5, -0.4]);
    } else {
      sb.add(kit.mat('#F2F4F8', { rough: 0.5 }), new THREE.BoxGeometry(3, 2.4, 0.1), [0, 1.6, -0.8]);
      for (let k = 0; k < 5; k++) sb.add(graphite, new THREE.BoxGeometry(2.4, 0.06, 0.04), [0, 0.8 + k * 0.38, -0.74]);
    }
  });
  bench(kit, b, -3, 13, 0);
  bench(kit, b, 3, 13, 0);
  finishRoom(room);

  let data: TasksRoomData | null = null;
  const draw = () => {
    const ctx = top.ctx;
    const { width: w, height: h } = ctx.canvas;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0B1A33');
    grad.addColorStop(1, '#10304A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9BE7F5';
    ctx.font = '700 30px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(data?.title ?? '', 30, 50);
    const list = data?.today ?? [];
    ctx.font = '500 24px Inter, system-ui, sans-serif';
    list.slice(0, 8).forEach((title, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 30 + col * (w / 2);
      const y = 100 + row * 52;
      ctx.fillStyle = 'rgba(34,211,238,0.16)';
      ctx.fillRect(x, y - 30, w / 2 - 60, 42);
      ctx.fillStyle = '#E8FBFF';
      ctx.fillText(wrap(ctx, title, w / 2 - 90, 1)[0] ?? '', x + 14, y);
    });
    top.tex.needsUpdate = true;
  };
  draw();
  const overview = { cam: new THREE.Vector3(0, 7, 13), target: new THREE.Vector3(0, 0.8, -1) };
  return {
    scene,
    sectors: TASKS_SECTORS,
    pickables: groups,
    room: { radius: R - 1.5, height: H },
    obstacles: [{ x: -3, z: 0, r: 2.4, h: 1 }, { x: 3, z: 0, r: 2.4, h: 1 }],
    view: (id) => viewOf(plan, id, overview),
    setData: (d) => {
      data = d as TasksRoomData;
      draw();
    },
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * PROJECTS — estúdio com um estande por projeto ativo
 * ===================================================================== */
export const PROJECTS_SECTORS = ['studio', 'gallery'] as const;
export type ProjectsSector = (typeof PROJECTS_SECTORS)[number];
export interface ProjectsRoomData {
  projects: Array<{ name: string; color: string }>;
}

export function createProjectsInterior(kit: Kit, labels: Record<ProjectsSector, string>): InteriorScene {
  const R = 16;
  const H = 9;
  const room = createRoom(kit, { radius: R, height: H, sides: 6, floor: '#F2EDE6', glass: '#F5DCC7', frame: '#F97316', accent: '#FDBA74', skylight: 5 });
  const { scene, b } = room;
  const white = kit.mat('#F7F4EF', { rough: 0.5 });
  pendants(kit, b, [[-4, 0], [4, 0], [0, 5]], 6, H, '#FFE7C2');
  // Seis estandes em volta: cada um ganha o nome e a cor de um projeto ativo.
  const stands: Array<{ wall: THREE.Mesh; board: ReturnType<typeof canvasPlane> }> = [];
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2 + Math.PI;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5) continue;
    const x = Math.sin(a) * 11.5;
    const z = Math.cos(a) * 11.5;
    b.add(white, new THREE.BoxGeometry(4, 0.2, 3), [x, 0.1, z], [0, a, 0]);
    const wall = new THREE.Mesh(kit.own(new THREE.BoxGeometry(3.8, 3, 0.15)), kit.own(new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.5 })));
    wall.position.set(x + Math.sin(a) * 1.3, 1.7, z + Math.cos(a) * 1.3);
    wall.rotation.y = a;
    scene.add(wall);
    const board = canvasPlane(kit, 3.2, 0.9, 112);
    board.mesh.position.set(x + Math.sin(a) * 1.18, 2.5, z + Math.cos(a) * 1.18);
    board.mesh.rotation.y = a + Math.PI;
    scene.add(board.mesh);
    stands.push({ wall, board });
  }
  const plan: Record<ProjectsSector, Placed> = {
    studio: { x: 0, z: 6, face: Math.PI },
    gallery: { x: 0, z: -4, face: 0 },
  };
  const groups = sectorsFrom(kit, scene, plan, PROJECTS_SECTORS, labels, '#F97316', (id, sb) => {
    if (id === 'studio') {
      sb.add(white, new THREE.BoxGeometry(3.4, 0.9, 1.4), [0, 0.45, -0.3]);
      sb.add(kit.mat('#F97316', { rough: 0.4 }), new THREE.BoxGeometry(3.5, 0.06, 1.5), [0, 0.93, -0.3]);
    } else {
      sb.add(kit.mat('#FDBA74', { glow: true }), new THREE.CylinderGeometry(1.4, 1.4, 0.08, 32), [0, 0.9, 0]);
      sb.add(white, new THREE.CylinderGeometry(0.3, 0.4, 0.86, 16), [0, 0.43, 0]);
    }
  });
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, R - 2), target: new THREE.Vector3(0, 1.5, -2) };
  return {
    scene,
    sectors: PROJECTS_SECTORS,
    pickables: groups,
    room: { radius: R - 1.5, height: H },
    obstacles: [],
    view: (id) => viewOf(plan, id, overview),
    setData: (d) => {
      const list = (d as ProjectsRoomData).projects;
      stands.forEach((s, i) => {
        const p = list[i];
        (s.wall.material as THREE.MeshStandardMaterial).color.set(p ? p.color : '#CBD5E1');
        const c = s.board.ctx.canvas;
        s.board.ctx.clearRect(0, 0, c.width, c.height);
        s.board.ctx.fillStyle = p ? 'rgba(12,24,44,0.92)' : 'rgba(12,24,44,0.4)';
        s.board.ctx.fillRect(0, 0, c.width, c.height);
        s.board.ctx.fillStyle = '#F1FAFF';
        s.board.ctx.font = '700 44px Inter, system-ui, sans-serif';
        s.board.ctx.textAlign = 'center';
        s.board.ctx.textBaseline = 'middle';
        s.board.ctx.fillText(p ? p.name : '—', c.width / 2, c.height / 2, c.width - 24);
        s.board.tex.needsUpdate = true;
      });
    },
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * FINANCE — escritório financeiro com as áreas do módulo em volta
 * ===================================================================== */
export const FINANCE_SECTORS = ['academy', 'investments', 'market', 'planning', 'journal'] as const;
export type FinanceSector = (typeof FINANCE_SECTORS)[number];

export function createFinanceInterior(kit: Kit, labels: Record<FinanceSector, string>): InteriorScene {
  const R = 15;
  const H = 8;
  const room = createRoom(kit, { radius: R, height: H, sides: 6, floor: '#EEF0F4', glass: '#C7D7F5', frame: '#2563EB', accent: '#FDE68A', skylight: 3 });
  const { scene, b } = room;
  const gold = kit.mat('#D4B572', { metal: 0.85, rough: 0.25 });
  const blue = kit.mat('#2563EB', { metal: 0.35, rough: 0.35 });
  b.add(gold, new THREE.TorusGeometry(3, 0.12, 6, 6), [0, 0.06, 0], [-Math.PI / 2, 0, Math.PI / 6]);
  b.add(blue, new THREE.CylinderGeometry(1.2, 1.4, 1, 6), [0, 0.5, 0]);
  b.add(gold, new THREE.CylinderGeometry(1.25, 1.25, 0.08, 6), [0, 1.04, 0]);
  pendants(kit, b, [[-4, 3], [4, 3]], 5.5, H, '#FFF3D6');
  pots(kit, b, [[-6, 12], [6, 12]]);
  const plan = ring(FINANCE_SECTORS, 9.5);
  const groups = sectorsFrom(kit, scene, plan, FINANCE_SECTORS, labels, '#D4B572', (id, sb) => {
    sb.add(kit.mat('#F2F4F8', { rough: 0.5 }), new THREE.BoxGeometry(2.4, 0.9, 1), [0, 0.45, 0]);
    sb.add(kit.mat('#1F2A3A', { metal: 0.5 }), new THREE.BoxGeometry(1.4, 0.8, 0.05), [0, 1.35, -0.3], [-0.3, 0, 0]);
    if (id === 'investments') for (let k = 0; k < 5; k++) sb.add(kit.mat('#FDE68A', { glow: true }), new THREE.BoxGeometry(0.2, 0.3 + k * 0.25, 0.2), [-1.6 + k * 0.4 + 2.6, 0.15 + k * 0.125, 0.3]);
  });
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, R - 2), target: new THREE.Vector3(0, 1.2, -2) };
  return {
    scene,
    sectors: FINANCE_SECTORS,
    pickables: groups,
    room: { radius: R - 1.5, height: H },
    obstacles: [{ x: 0, z: 0, r: 1.6, h: 1 }],
    view: (id) => viewOf(plan, id, overview),
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}
