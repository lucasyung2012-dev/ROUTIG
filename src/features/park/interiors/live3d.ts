/**
 * "3D de verdade" nos andares (prompt, seção 28): a ação do dia acontece no próprio objeto, sem abrir
 * a estação. No Tasks, os cartões reais na parede de telas da sala Kanban (1º andar): atrasadas, hoje
 * e feitas hoje; tocar num cartão conclui (ou reabre) a tarefa e ele vai, virando, para a outra
 * coluna. No Calendar, o dia de hoje na parede de telas da Sala Diária (1º andar), pela hora, com a
 * linha de agora andando; tocar num evento abre o editor do próprio módulo, tocar num horário vazio
 * não faz nada. Os dados chegam prontos do ParkPage (`live`, os mesmos repositórios das estações);
 * cada canvas só é redesenhado quando o conteúdo (ou o minuto, na parede do dia) muda, e nada é
 * alocado a cada quadro.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import type { Kit } from '../kit';
import { canvasPlane, markAction, wrap, type ActionSpot, type InteriorScene } from './common';
import type { Floors, FloorZone } from './floors';
import { dayLayout, TASK_COLS, type DayItem, type DayLayout, type TaskBoard, type TaskCol } from '../live';

/** Dados do quadro de tarefas (já traduzidos): os cartões, o cabeçalho e o "+N" de cada coluna. */
export interface TasksLive {
  board: TaskBoard;
  heads: Record<TaskCol, string>;
  more: Record<TaskCol, string>;
  empty: string;
  /** Movimento reduzido: sem animação. */
  still: boolean;
}

/** Dados da parede do dia (já traduzidos). `more` traz "{n}" no lugar do número. */
export interface CalendarLive {
  items: DayItem[];
  title: string;
  empty: string;
  allDay: string;
  more: string;
  still: boolean;
}

interface Live {
  set: (d: unknown) => void;
  tick: (now: number) => void;
}

const FONT = 'Inter, system-ui, sans-serif';
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** Liga os objetos de ação dos andares do prédio `id` (Tasks e Calendar); os outros ficam como estão. */
export function withLive(kit: Kit, scene: InteriorScene, id: ModuleId): InteriorScene {
  const fl = scene.floors;
  if (!fl) return scene;
  const live = id === 'tasks' ? tasksWall(kit, scene, fl, 'organize') : id === 'calendar' ? dayWall(kit, scene, fl, 'daily') : null;
  if (!live) return scene;
  const set0 = scene.setData;
  const tick0 = scene.tick;
  scene.setData = (d) => {
    set0(d);
    const v = (d as { live?: unknown } | null | undefined)?.live;
    if (v) live.set(v);
  };
  scene.tick = (t, cam) => {
    tick0(t, cam);
    live.tick(performance.now());
  };
  return scene;
}

/** A sala `key` com parede de telas, o grupo dela (posição e giro da sala) e o lugar de quem olha. */
function screenRoom(scene: InteriorScene, fl: Floors, key: string) {
  const zi = fl.zones.findIndex((z) => z.key === key && !!z.screen);
  const zone: FloorZone | undefined = fl.zones[zi];
  const lv = zone ? fl.levels[zone.level] : undefined;
  if (!zone?.screen || !lv) return null;
  const root = new THREE.Group();
  root.position.set(zone.x, lv.y, zone.z);
  root.rotation.y = zone.face;
  scene.scene.add(root);
  const c = Math.cos(zone.face);
  const s = Math.sin(zone.face);
  const zx = zone.x;
  const zz = zone.z;
  /** Ponto da sala (lx, lz) no sistema do prédio. */
  const toBuilding = (lx: number, lz: number): [number, number] => [zx + lx * c + lz * s, zz - lx * s + lz * c];
  return { zi, zone, screen: zone.screen, root, toBuilding };
}

/* =====================================================================
 * Tasks: cartões reais no quadro (sala Kanban, 1º andar)
 * ===================================================================== */

const ROWS = 4;
const COL_TINT: Record<TaskCol, string> = { late: '#5B1F24', today: '#0E3446', done: '#173B2A' };
const COL_HEAD: Record<TaskCol, string> = { late: '#F87171', today: '#22D3EE', done: '#4ADE80' };

interface Card {
  mesh: THREE.Mesh;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  spot: ActionSpot;
  drawn: string;
  /** Animação: de (fx, fy) até (tx, ty), começando em t0; flip = trocou de coluna. */
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t0: number;
  flip: boolean;
  moving: boolean;
}

function tasksWall(kit: Kit, scene: InteriorScene, fl: Floors, key: string): Live | null {
  const room = screenRoom(scene, fl, key);
  if (!room) return null;
  const { screen, root, zone, zi, toBuilding } = room;
  const W = screen.w;
  const H = screen.h;
  const z0 = screen.z + 0.035;
  const colW = W / 3;
  const head = Math.min(0.24, H * 0.15);
  const pitch = (H - head - 0.08) / ROWS;
  const cw = colW - 0.1;
  const ch = Math.max(0.12, pitch - 0.06);
  const slotX = (c: number) => -W / 2 + colW * (c + 0.5);
  const slotY = (r: number) => screen.y + H / 2 - head - 0.04 - pitch * (r + 0.5);

  // Fundo: as três colunas e os cabeçalhos; tocar fora dos cartões abre a sala (o painel do Kanban).
  const bg = canvasPlane(kit, W, H, 360, true);
  bg.mesh.position.set(0, screen.y, z0);
  bg.mesh.userData.zone = zi;
  bg.mesh.userData.sector = zone.sector;
  root.add(bg.mesh);
  scene.pickables.push(bg.mesh);

  const actions = (scene.actions ??= []);
  const cards: Card[] = [];
  for (let i = 0; i < TASK_COLS.length * ROWS; i++) {
    const p = canvasPlane(kit, cw, ch, 96, true);
    p.mesh.visible = false;
    p.mesh.position.set(0, screen.y, z0 + 0.012);
    root.add(p.mesh);
    scene.pickables.push(p.mesh);
    const spot: ActionSpot = { id: '', level: zone.level, obj: p.mesh, x: 0, z: 0, r: 0, active: false };
    markAction(p.mesh, '');
    actions.push(spot);
    cards.push({ mesh: p.mesh, ctx: p.ctx, tex: p.tex, spot, drawn: '', fx: 0, fy: 0, tx: 0, ty: 0, t0: 0, flip: false, moving: false });
  }

  let last = '';
  let still = false;
  /** Cartão (mesh) de cada chave mostrada: "card:<id da tarefa>" ou "more:<coluna>". */
  let owner = new Map<string, number>();

  const drawBg = (d: TasksLive) => {
    const ctx = bg.ctx;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#0B1424';
    ctx.fillRect(0, 0, w, h);
    const hh = (head / H) * h;
    TASK_COLS.forEach((col, c) => {
      const x = (c * w) / 3;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(x + 6, hh + 4, w / 3 - 12, h - hh - 10);
      ctx.fillStyle = COL_HEAD[col];
      ctx.fillRect(x + 6, hh - 6, w / 3 - 12, 4);
      ctx.font = `700 ${Math.round(hh * 0.5)}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.heads[col], x + 14, hh / 2, w / 3 - 28);
    });
    if (d.board.empty) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = `italic 500 ${Math.round(h * 0.07)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(d.empty, w / 2, (h + hh) / 2, w - 40);
    }
    bg.tex.needsUpdate = true;
  };

  const drawCard = (cd: Card, text: string, col: TaskCol, more: boolean) => {
    const k = `${col}|${more ? 1 : 0}|${text}`;
    if (k === cd.drawn) return;
    cd.drawn = k;
    const ctx = cd.ctx;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = more ? '#1E293B' : COL_TINT[col];
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = COL_HEAD[col];
    ctx.fillRect(0, 0, 8, h);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    if (more) {
      ctx.fillStyle = '#CBD5E1';
      ctx.font = `600 ${Math.round(h * 0.34)}px ${FONT}`;
      ctx.fillText(text, 20, h / 2, w - 30);
    } else {
      const done = col === 'done';
      // Caixinha de marcar (com o visto nas feitas) e o título em até duas linhas.
      const bx = 18;
      const bs = Math.round(h * 0.34);
      ctx.strokeStyle = done ? '#4ADE80' : '#E2E8F0';
      ctx.lineWidth = 3;
      ctx.strokeRect(bx, h / 2 - bs / 2, bs, bs);
      if (done) {
        ctx.beginPath();
        ctx.moveTo(bx + bs * 0.2, h / 2);
        ctx.lineTo(bx + bs * 0.45, h / 2 + bs * 0.28);
        ctx.lineTo(bx + bs * 0.85, h / 2 - bs * 0.3);
        ctx.stroke();
      }
      const fs = Math.round(h * 0.27);
      ctx.font = `600 ${fs}px ${FONT}`;
      ctx.fillStyle = done ? '#A7B4C2' : '#F1F5F9';
      const tx = bx + bs + 14;
      const lines = wrap(ctx, text, w - tx - 12, 2);
      const y0 = h / 2 - ((lines.length - 1) * fs * 1.15) / 2;
      lines.forEach((ln, i) => {
        const y = y0 + i * fs * 1.15;
        ctx.fillText(ln, tx, y, w - tx - 12);
        if (done) ctx.fillRect(tx, y, Math.min(w - tx - 12, ctx.measureText(ln).width), 2);
      });
    }
    cd.tex.needsUpdate = true;
  };

  const place = (cd: Card, x: number, y: number) => {
    cd.mesh.position.x = x;
    cd.mesh.position.y = y;
    cd.mesh.rotation.x = 0;
    const [bx, bz] = toBuilding(x, z0 + 1.3);
    cd.spot.x = bx;
    cd.spot.z = bz;
  };

  const set = (raw: unknown) => {
    const d = raw as TasksLive;
    if (!d?.board) return;
    const k = JSON.stringify(d);
    if (k === last) return;
    last = k;
    still = d.still;
    drawBg(d);
    // O que vai no quadro: cartões reais e, em coluna cheia, o "+N" no último lugar.
    const want: Array<{ key: string; c: number; r: number; text: string; col: TaskCol; more: boolean }> = [];
    TASK_COLS.forEach((col, c) => {
      const list = d.board.cols[col];
      list.forEach((card, r) => want.push({ key: `card:${card.id}`, c, r, text: card.title, col, more: false }));
      if (d.board.more[col] > 0) want.push({ key: `more:${col}`, c, r: list.length, text: d.more[col], col, more: true });
    });
    const next = new Map<string, number>();
    const used = new Set<number>();
    for (const w of want) {
      const m = owner.get(w.key);
      if (m !== undefined) {
        next.set(w.key, m);
        used.add(m);
      }
    }
    for (const w of want) {
      if (next.has(w.key)) continue;
      const free = cards.findIndex((_, i) => !used.has(i));
      if (free < 0) continue;
      next.set(w.key, free);
      used.add(free);
    }
    const now = performance.now();
    for (const w of want) {
      const i = next.get(w.key);
      const cd = i === undefined ? undefined : cards[i];
      if (!cd) continue;
      const x = slotX(w.c);
      const y = slotY(w.r);
      const was = owner.get(w.key) === i && cd.mesh.visible;
      drawCard(cd, w.text, w.col, w.more);
      cd.spot.id = w.key;
      cd.spot.active = true;
      markAction(cd.mesh, w.key);
      if (was && !still && (Math.abs(cd.mesh.position.x - x) > 1e-3 || Math.abs(cd.mesh.position.y - y) > 1e-3)) {
        // Mudou de lugar: desliza até lá; trocou de coluna (concluída ou reaberta): vira no caminho.
        cd.flip = Math.abs(cd.mesh.position.x - x) > 1e-3;
        cd.fx = cd.mesh.position.x;
        cd.fy = cd.mesh.position.y;
        cd.tx = x;
        cd.ty = y;
        cd.t0 = now;
        cd.moving = true;
        const [bx, bz] = toBuilding(x, z0 + 1.3);
        cd.spot.x = bx;
        cd.spot.z = bz;
      } else {
        cd.moving = false;
        place(cd, x, y);
      }
      cd.mesh.visible = true;
    }
    cards.forEach((cd, i) => {
      if (used.has(i)) return;
      cd.mesh.visible = false;
      cd.moving = false;
      cd.spot.active = false;
      cd.spot.id = '';
      markAction(cd.mesh, '');
    });
    owner = next;
  };

  const MS = 520;
  const tick = (now: number) => {
    for (const cd of cards) {
      if (!cd.moving) continue;
      const k = Math.min(1, (now - cd.t0) / MS);
      const e = ease(k);
      cd.mesh.position.x = cd.fx + (cd.tx - cd.fx) * e;
      cd.mesh.position.y = cd.fy + (cd.ty - cd.fy) * e;
      // Um pouco à frente do quadro enquanto viaja (não atravessa os outros cartões).
      cd.mesh.position.z = z0 + 0.012 + Math.sin(k * Math.PI) * 0.12;
      cd.mesh.rotation.x = cd.flip ? e * Math.PI * 2 : 0;
      if (k >= 1) {
        cd.moving = false;
        cd.mesh.position.z = z0 + 0.012;
        place(cd, cd.tx, cd.ty);
      }
    }
  };
  return { set, tick };
}

/* =====================================================================
 * Calendar: o dia de hoje na parede de telas (Sala Diária, 1º andar)
 * ===================================================================== */

const HITS = 14;

function dayWall(kit: Kit, scene: InteriorScene, fl: Floors, key: string): Live | null {
  const room = screenRoom(scene, fl, key);
  if (!room) return null;
  const { screen, root, zone, toBuilding } = room;
  const W = screen.w;
  const H = screen.h;
  const z0 = screen.z + 0.035;
  const wall = canvasPlane(kit, W, H, 512, true);
  wall.mesh.position.set(0, screen.y, z0);
  // Horário sem nada: tocar não faz nada (nem abre a sala por baixo).
  markAction(wall.mesh, '');
  root.add(wall.mesh);
  scene.pickables.push(wall.mesh);
  const ctx = wall.ctx;
  const PW = ctx.canvas.width;
  const PH = ctx.canvas.height;
  const HEAD = 78;
  const AXIS = 74;

  // Caixas invisíveis sobre cada item (o toque e o olhar acham o item pelo `id`).
  const actions = (scene.actions ??= []);
  const hitGeo = kit.own(new THREE.PlaneGeometry(1, 1));
  const hitMat = kit.own(new THREE.MeshBasicMaterial({ visible: false }));
  const hits: ActionSpot[] = [];
  for (let i = 0; i < HITS; i++) {
    const m = new THREE.Mesh(hitGeo, hitMat);
    m.visible = false;
    m.userData.hitbox = false;
    m.position.set(0, screen.y, z0 + 0.01);
    markAction(m, '');
    root.add(m);
    scene.pickables.push(m);
    const spot: ActionSpot = { id: '', level: zone.level, obj: m, x: 0, z: 0, r: 0, active: false };
    actions.push(spot);
    hits.push(spot);
  }
  /** Caixa `i` sobre o retângulo (px, py, pw, ph) do canvas, ligada ao item `item`. */
  const hitAt = (i: number, item: DayItem, px: number, py: number, pw: number, ph: number) => {
    const sp = hits[i];
    if (!sp) return;
    const m = sp.obj;
    const lx = -W / 2 + ((px + pw / 2) / PW) * W;
    const ly = screen.y + H / 2 - ((py + ph / 2) / PH) * H;
    m.position.x = lx;
    m.position.y = ly;
    m.scale.set(Math.max(0.05, (pw / PW) * W), Math.max(0.05, (ph / PH) * H), 1);
    const id = `ev:${item.key}`;
    sp.id = id;
    sp.active = item.open;
    m.userData.hitbox = item.open;
    markAction(m, id);
    const [bx, bz] = toBuilding(lx, z0 + 1.3);
    sp.x = bx;
    sp.z = bz;
  };

  let data: CalendarLive | null = null;
  let dataKey = '';
  let nowMin = -1;
  let drawnKey = '';
  let checkAt = 0;

  const draw = () => {
    if (!data) return;
    const key = `${dataKey}|${nowMin}`;
    if (key === drawnKey) return;
    drawnKey = key;
    const L: DayLayout = dayLayout(data.items, nowMin);
    ctx.fillStyle = '#0A1322';
    ctx.fillRect(0, 0, PW, PH);
    // Cabeçalho: o dia e os itens de dia inteiro.
    ctx.fillStyle = '#E2E8F0';
    ctx.font = `700 34px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.title, 20, HEAD / 2, PW * 0.4);
    let hi = 0;
    const chipsX = PW * 0.42;
    const chipW = (PW - chipsX - 16) / 3;
    L.allDay.forEach((it, i) => {
      const x = chipsX + i * chipW;
      ctx.fillStyle = it.color;
      ctx.globalAlpha = it.done ? 0.35 : 0.85;
      ctx.fillRect(x + 4, 14, chipW - 8, HEAD - 28);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0B1220';
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(it.title, x + 12, HEAD / 2, chipW - 24);
      hitAt(hi++, it, x + 4, 14, chipW - 8, HEAD - 28);
    });
    if (L.allDayMore > 0) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(data.more.replace('{n}', String(L.allDayMore)), chipsX + L.allDay.length * chipW + 10, HEAD / 2, chipW - 16);
    }
    if (L.allDay.length === 0 && L.allDayMore === 0 && !L.empty) {
      ctx.fillStyle = '#64748B';
      ctx.font = `500 18px ${FONT}`;
      ctx.fillText(data.allDay, chipsX + 4, HEAD / 2, PW - chipsX - 20);
    }
    // Grade das horas.
    const top = HEAD + 10;
    const bottom = PH - 12;
    const yOf = (f: number) => top + f * (bottom - top);
    const span = L.to - L.from;
    const step = span > 14 * 60 ? 120 : 60;
    ctx.font = `500 18px ${FONT}`;
    for (let m = Math.ceil(L.from / step) * step; m <= L.to; m += step) {
      const y = yOf((m - L.from) / span);
      ctx.fillStyle = 'rgba(148,163,184,0.18)';
      ctx.fillRect(AXIS, y, PW - AXIS - 10, 1);
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00`, 10, y, AXIS - 14);
    }
    // Itens com hora: largura dividida entre os que se sobrepõem.
    const areaW = PW - AXIS - 14;
    for (const b of L.blocks) {
      const x = AXIS + 2 + (b.col * areaW) / b.cols;
      const w = areaW / b.cols - 4;
      const y = yOf(b.y0);
      const h = Math.max(16, yOf(b.y1) - y - 2);
      ctx.fillStyle = b.item.color;
      ctx.globalAlpha = b.item.done ? 0.3 : 0.75;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.item.color;
      ctx.fillRect(x, y, 5, h);
      ctx.fillStyle = '#F8FAFC';
      const fs = h >= 44 ? 20 : 16;
      ctx.font = `600 ${fs}px ${FONT}`;
      const hm = (v: number) => `${String(Math.floor(v / 60) % 24).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
      const label = `${hm(b.start)} ${b.item.title}`;
      ctx.fillText(label, x + 12, y + Math.min(h / 2, fs), w - 18);
      if (b.item.done) ctx.fillRect(x + 12, y + Math.min(h / 2, fs), Math.min(w - 18, ctx.measureText(label).width), 2);
      hitAt(hi++, b.item, x, y, w, h);
    }
    if (L.hidden > 0) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = `600 18px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(data.more.replace('{n}', String(L.hidden)), PW - 16, top + 12, 120);
      ctx.textAlign = 'left';
    }
    // Agora: a linha vermelha atravessando o dia.
    if (L.now !== null) {
      const y = yOf(L.now);
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(AXIS - 6, y - 1.5, PW - AXIS - 4, 3);
      ctx.beginPath();
      ctx.arc(AXIS - 6, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (L.empty) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = `italic 500 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(data.empty, PW / 2, (top + bottom) / 2, PW - 60);
      ctx.textAlign = 'left';
    }
    // Caixas que sobraram: desligadas.
    for (let i = hi; i < HITS; i++) {
      const sp = hits[i]!;
      sp.active = false;
      sp.id = '';
      sp.obj.userData.hitbox = false;
      markAction(sp.obj, '');
    }
    wall.tex.needsUpdate = true;
  };

  const minuteNow = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const set = (raw: unknown) => {
    const d = raw as CalendarLive;
    if (!d?.items) return;
    const k = JSON.stringify(d);
    if (k === dataKey) return;
    dataKey = k;
    data = d;
    nowMin = minuteNow();
    draw();
  };
  // A linha de agora anda: confere o minuto a cada 15 s e só redesenha quando ele muda.
  const tick = (now: number) => {
    if (!data || now < checkAt) return;
    checkAt = now + 15000;
    const m = minuteNow();
    if (m === nowMin) return;
    nowMin = m;
    draw();
  };
  return { set, tick };
}
