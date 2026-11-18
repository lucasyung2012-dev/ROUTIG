/**
 * "3D de verdade" nos objetos (prompt, seção 28): além das paredes de ação (live3d.ts), a ação do
 * dia acontece em objetos do próprio prédio. A tela do terminal do meio do balcão de criação rápida
 * do Tasks ("Nova tarefa"), a placa "Novo objetivo" ao lado da parede do Goals, a maquete dos
 * projetos ativos na mesa redonda da sala de acompanhamento (a altura de cada bloco é o progresso
 * real), as luminárias das salas individuais e das cabines do Focus (acesas com a sessão
 * compartilhada correndo), a bandeja de chegadas do Inbox (um cartão por item em aberto), o
 * caderno aberto do balcão de captura do Notes, as lombadas dos materiais novos da Library, o
 * baralho de revisão do Idiomas, as faixas das modalidades do Sports, as esferas dos indicadores
 * em volta do núcleo do Insights e o quadro dos saldos dentro do cofre de Finanças.
 *
 * Cada interior só marca onde o objeto fica (common.ts, `setAnchor`; nos andares, a sala); aqui se
 * desenha e se liga a ação pelo mesmo caminho das paredes (`scene.actions`, ids "prefixo:ref" de
 * live.ts, OBJECT_KIND). Os dados chegam prontos e traduzidos do LiveFeed em `obj`; cada objeto só
 * redesenha quando o conteúdo muda. Nada aqui entra na colisão (`noCollide`): os objetos ficam em
 * cima de móveis que já existem, na parede ou acima das cabeças, e as caixas de toque têm raio 0
 * (só olhando para elas ou tocando), sem atrapalhar a circulação nem as escadas. Um canvas por
 * objeto; os blocos da maquete são instâncias.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import type { Kit } from '../kit';
import { blockHeight, orbAngles, type LampState } from '../live';
import { canvasPlane, markAction, wrap, type ActionSpot, type Anchor, type InteriorScene } from './common';
import type { FloorZone } from './floors';

/* ---------- Dados de cada objeto (já traduzidos; o LiveFeed entrega em `obj`) ---------- */

/** Tela "Nova tarefa" do balcão de criação rápida (Tasks) e placa "Novo objetivo" (Goals). */
export interface SignObj {
  title: string;
  sub: string;
}

export interface MaquetteObj {
  blocks: Array<{ id: string; name: string; color: string; percent: number | null }>;
  empty: string;
}

export interface LampObj {
  state: LampState;
}

export interface TrayObj {
  title: string;
  cards: Array<{ id: string; title: string; sub: string }>;
  /** Texto do "+N" ('' = sem). */
  more: string;
  empty: string;
}

export interface NotebookObj {
  title: string;
  hint: string;
  /** Página da direita: a nota mexida por último ('' = página em branco). */
  last: string;
}

export interface ShelfObj {
  label: string;
  books: Array<{ id: string; title: string; color: string }>;
  more: string;
  empty: string;
}

export interface DeckObj {
  title: string;
  /** Palavra da vez; `answer` só depois de virar. null: nada para revisar hoje. */
  card: { id: string; term: string; answer: string | null; color: string } | null;
  flip: string;
  again: string;
  good: string;
  empty: string;
  still: boolean;
}

export interface CourtObj {
  /** Modalidade de cada faixa, na ordem das faixas ('' = faixa sem modalidade). */
  ids: string[];
}

export interface OrbObj {
  orbs: Array<{ id: string; color: string; has: boolean; locked: boolean }>;
  still: boolean;
}

/** Saldos do cofre: só com Finanças desbloqueado (null = quadro apagado). */
export type VaultObj = {
  title: string;
  rows: Array<{ title: string; sub: string }>;
  empty: string;
  tap: string;
} | null;

interface Live {
  set: (d: unknown) => void;
  tick: (now: number) => void;
}

const FONT = 'Inter, system-ui, sans-serif';

/**
 * Liga os objetos de ação do prédio `id` (os que ele tem). Os dados vêm em `obj` (setData), junto
 * com os do térreo, os quadros dos andares e as paredes.
 */
export function withObjects(kit: Kit, scene: InteriorScene, id: ModuleId): InteriorScene {
  const anchors = (scene.scene.userData.anchors ?? {}) as Record<string, Anchor | undefined>;
  const live = build(kit, scene, id, anchors);
  if (!live) return scene;
  const set0 = scene.setData;
  const tick0 = scene.tick;
  scene.setData = (d) => {
    set0(d);
    const box = d as { obj?: unknown } | null | undefined;
    if (box && 'obj' in box) live.set(box.obj);
  };
  scene.tick = (t, cam) => {
    tick0(t, cam);
    live.tick(performance.now());
  };
  return scene;
}

function build(kit: Kit, scene: InteriorScene, id: ModuleId, a: Record<string, Anchor | undefined>): Live | null {
  switch (id) {
    case 'tasks':
      return a.desk ? signBoard(kit, scene, a.desk, 0, 0.54, 0.34, 'tnew:new', '#0E3446', '#22D3EE') : null;
    case 'goals': {
      const p = plaqueSpot(scene, 'tracking');
      return p ? signBoard(kit, scene, p.anchor, p.level, p.w, p.h, 'gnew:new', '#3A2A0C', '#F59E0B', p.stand) : null;
    }
    case 'projects':
      return maquette(kit, scene);
    case 'focus':
      return lamps(kit, scene, a);
    case 'inbox':
      return a.tray ? tray(kit, scene, a.tray) : null;
    case 'notes':
      return a.notebook ? notebook(kit, scene, a.notebook) : null;
    case 'library':
      return a.spines ? shelf(kit, scene, a.spines) : null;
    case 'languages':
      return a.deck ? deck(kit, scene, a.deck) : null;
    case 'sports':
      return court(kit, scene, a);
    case 'insights':
      return a.core ? orbs(kit, scene, a.core) : null;
    case 'finance':
      return a.vault ? vaultBoard(kit, scene, a.vault) : null;
    default:
      return null;
  }
}

/* =====================================================================
 * Peças comuns: um quadro de canvas apoiado num ponto, com caixas de toque sobre ele
 * ===================================================================== */

interface Board {
  root: THREE.Group;
  mesh: THREE.Mesh;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  PW: number;
  PH: number;
  /** Liga a caixa `i` ao retângulo (px, py, pw, ph) do canvas, com a ação `id`. */
  hit: (i: number, id: string, px: number, py: number, pw: number, ph: number) => void;
  /** Desliga as caixas de `from` em diante. */
  off: (from: number) => void;
}

/** Grupo no apoio `a` (frente virada para `face`, inclinado `tilt`), fora da colisão e tocável. */
function placed(scene: InteriorScene, a: Anchor): THREE.Group {
  const root = new THREE.Group();
  root.position.set(a.x, a.y, a.z);
  root.rotation.order = 'YXZ';
  root.rotation.set(a.tilt ?? 0, a.face, 0);
  scene.scene.add(root);
  scene.pickables.push(root);
  return root;
}

/** Nada destes objetos é parede (a colisão do térreo é medida depois de montar a cena). */
function noCollide(o: THREE.Object3D) {
  o.traverse((c) => (c.userData.noCollide = true));
}

function board(kit: Kit, scene: InteriorScene, a: Anchor, level: number, w: number, h: number, px: number, hits: number, opaque = true): Board {
  const root = placed(scene, a);
  const p = canvasPlane(kit, w, h, px, opaque);
  // O fundo segura o toque (entre os cartões não acontece nada, nem abre a sala de trás).
  markAction(p.mesh, '');
  root.add(p.mesh);
  const PW = p.ctx.canvas.width;
  const PH = p.ctx.canvas.height;
  const actions = (scene.actions ??= []);
  const geo = kit.own(new THREE.PlaneGeometry(1, 1));
  const mat = kit.own(new THREE.MeshBasicMaterial({ visible: false }));
  const spots: ActionSpot[] = [];
  for (let i = 0; i < hits; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.userData.hitbox = false;
    m.position.z = 0.006;
    markAction(m, '');
    root.add(m);
    const sp: ActionSpot = { id: '', level, obj: m, x: a.x, z: a.z, r: 0, active: false };
    actions.push(sp);
    spots.push(sp);
  }
  const hit = (i: number, id: string, x: number, y: number, pw: number, ph: number) => {
    const sp = spots[i];
    if (!sp) return;
    const m = sp.obj;
    m.position.x = -w / 2 + ((x + pw / 2) / PW) * w;
    m.position.y = h / 2 - ((y + ph / 2) / PH) * h;
    m.scale.set(Math.max(0.02, (pw / PW) * w), Math.max(0.02, (ph / PH) * h), 1);
    sp.id = id;
    sp.active = true;
    m.userData.hitbox = true;
    markAction(m, id);
  };
  const off = (from: number) => {
    for (let i = from; i < spots.length; i++) {
      const sp = spots[i]!;
      sp.id = '';
      sp.active = false;
      sp.obj.userData.hitbox = false;
      markAction(sp.obj, '');
    }
  };
  noCollide(root);
  return { root, mesh: p.mesh, ctx: p.ctx, tex: p.tex, PW, PH, hit, off };
}

/** Retângulo de cantos redondos (caminho só). */
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Conteúdo novo? (cada objeto só redesenha quando o que mostra muda). */
function changed() {
  let last = '';
  return (d: unknown): boolean => {
    const k = JSON.stringify(d ?? null);
    if (k === last) return false;
    last = k;
    return true;
  };
}

/* =====================================================================
 * Tasks e Goals: uma tela/placa que cria (o toque abre o campo ao lado do objeto)
 * ===================================================================== */

function signBoard(kit: Kit, scene: InteriorScene, a: Anchor, level: number, w: number, h: number, id: string, bg: string, accent: string, stand = 0): Live {
  const B = board(kit, scene, a, level, w, h, 200, 1);
  if (stand > 0) {
    // Placa em pé: moldura atrás e uma haste até o piso (o apoio fica `stand` m acima dele).
    const dark = kit.mat('#1F2937', { rough: 0.5 });
    const frame = new THREE.Mesh(kit.own(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.03)), dark);
    frame.position.z = -0.02;
    const pole = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(0.015, 0.015, stand - h / 2, 8)), dark);
    pole.position.set(0, -h / 2 - (stand - h / 2) / 2, -0.02);
    const foot = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(0.16, 0.18, 0.02, 16)), dark);
    foot.position.set(0, -stand + 0.01, -0.02);
    B.root.add(frame, pole, foot);
    noCollide(B.root);
  }
  const fresh = changed();
  const set = (raw: unknown) => {
    const d = raw as SignObj | null;
    if (!d || typeof d.title !== 'string' || !fresh(d)) return;
    const { ctx, PW, PH } = B;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, PW, PH);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    rounded(ctx, 6, 6, PW - 12, PH - 12, 18);
    ctx.stroke();
    // O "+" grande à esquerda e o texto à direita.
    const s = PH * 0.42;
    const cx = PH * 0.42;
    const cy = PH / 2;
    ctx.fillStyle = accent;
    ctx.fillRect(cx - s / 2, cy - s * 0.09, s, s * 0.18);
    ctx.fillRect(cx - s * 0.09, cy - s / 2, s * 0.18, s);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F8FAFC';
    ctx.font = `700 ${Math.round(PH * 0.2)}px ${FONT}`;
    const tx = PH * 0.82;
    ctx.fillText(d.title, tx, PH * 0.4, PW - tx - 16);
    ctx.fillStyle = '#CBD5E1';
    ctx.font = `500 ${Math.round(PH * 0.12)}px ${FONT}`;
    ctx.fillText(d.sub, tx, PH * 0.66, PW - tx - 16);
    B.tex.needsUpdate = true;
    B.hit(0, id, 0, 0, PW, PH);
  };
  return { set, tick: () => undefined };
}

/** A sala `key` com parede de telas (andares), o nível dela e o sistema dela no prédio. */
function screenZone(scene: InteriorScene, key: string) {
  const fl = scene.floors;
  const zone: FloorZone | undefined = fl?.zones.find((z) => z.key === key && !!z.screen);
  const lv = zone && fl ? fl.levels[zone.level] : undefined;
  if (!zone?.screen || !lv) return null;
  const c = Math.cos(zone.face);
  const s = Math.sin(zone.face);
  /** Ponto da sala (lx, y, lz) no sistema do prédio, como apoio virado com a sala. */
  const at = (lx: number, y: number, lz: number, tilt = 0): Anchor => ({ x: zone.x + lx * c + lz * s, y: lv.y + y, z: zone.z - lx * s + lz * c, face: zone.face, tilt });
  return { zone, screen: zone.screen, at };
}

/**
 * Placa "Novo objetivo" ao lado da parede do Goals: em pé, à direita das telas, se a sala tem largura
 * para isso (as telas ocupam 62% da largura); senão, em cima da mesa redonda de consulta.
 */
function plaqueSpot(scene: InteriorScene, key: string): { anchor: Anchor; level: number; w: number; h: number; stand: number } | null {
  const r = screenZone(scene, key);
  if (!r) return null;
  const W = r.screen.w;
  const side = W / 0.62 / 2 - W / 2 - 0.1;
  if (side >= 0.5) {
    const w = Math.min(0.62, side - 0.06);
    const h = w * 0.62;
    return { anchor: r.at(W / 2 + 0.06 + w / 2, 1.45, r.screen.z), level: r.zone.level, w, h, stand: 1.45 };
  }
  // Mesa de consulta (furnish.ts, 'dataviz'): centro 2,4 m à frente do fundo, tampo a 1,05 m.
  return { anchor: r.at(0, 1.05 + 0.16, r.screen.z - 0.04 + 2.4 + 0.35, -0.35), level: r.zone.level, w: 0.5, h: 0.31, stand: 0 };
}

/* =====================================================================
 * Projects: a maquete na mesa redonda da sala de acompanhamento (um bloco por projeto ativo)
 * ===================================================================== */

const BLOCKS = 6;

function maquette(kit: Kit, scene: InteriorScene): Live | null {
  const r = screenZone(scene, 'tracking');
  if (!r) return null;
  // Mesa de consulta (furnish.ts, 'dataviz'): centro 2,4 m à frente do fundo, disco aceso a 1,085 m.
  const a = r.at(0, 1.087, r.screen.z - 0.04 + 2.4);
  const level = r.zone.level;
  const root = placed(scene, a);
  // Base com os nomes: um canvas deitado sobre o disco (um só para a maquete inteira).
  const label = canvasPlane(kit, 1.3, 1.3, 512, false);
  // Redonda como a mesa (a textura do quadrado inteiro cai no disco: o UV do círculo vai de 0 a 1).
  label.mesh.geometry = kit.own(new THREE.CircleGeometry(0.65, 48));
  label.mesh.rotation.x = -Math.PI / 2;
  label.mesh.position.y = 0.002;
  markAction(label.mesh, '');
  root.add(label.mesh);
  const blocks = new THREE.InstancedMesh(kit.own(new THREE.BoxGeometry(1, 1, 1)), kit.own(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 })), BLOCKS);
  blocks.setColorAt(0, new THREE.Color('#ffffff'));
  blocks.count = 0;
  blocks.castShadow = true;
  markAction(blocks, '');
  root.add(blocks);
  const actions = (scene.actions ??= []);
  const hitGeo = kit.own(new THREE.BoxGeometry(1, 1, 1));
  const hitMat = kit.own(new THREE.MeshBasicMaterial({ visible: false }));
  const spots: ActionSpot[] = [];
  for (let i = 0; i < BLOCKS; i++) {
    const m = new THREE.Mesh(hitGeo, hitMat);
    m.visible = false;
    m.userData.hitbox = false;
    markAction(m, '');
    root.add(m);
    const sp: ActionSpot = { id: '', level, obj: m, x: a.x, z: a.z, r: 0, active: false };
    actions.push(sp);
    spots.push(sp);
  }
  noCollide(root);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  /** Onde fica o bloco `i` de `n` (no meio, se é um só; senão, numa roda). */
  const spotOf = (i: number, n: number): [number, number, number] => {
    if (n <= 1) return [0, 0, 0];
    const ang = (i / n) * Math.PI * 2 + Math.PI;
    return [Math.sin(ang) * 0.27, Math.cos(ang) * 0.27, ang];
  };
  const fresh = changed();
  const set = (raw: unknown) => {
    const d = raw as MaquetteObj | null;
    if (!d?.blocks || !fresh(d)) return;
    const list = d.blocks.slice(0, BLOCKS);
    const ctx = label.ctx;
    const P = ctx.canvas.width;
    ctx.clearRect(0, 0, P, P);
    ctx.fillStyle = 'rgba(11,20,36,0.55)';
    ctx.beginPath();
    ctx.arc(P / 2, P / 2, P * 0.47, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    list.forEach((b, i) => {
      const [x, z, ang] = spotOf(i, list.length);
      const h = blockHeight(b.percent);
      pos.set(x, h / 2, z);
      scl.set(0.13, h, 0.13);
      m4.compose(pos, q, scl);
      blocks.setMatrixAt(i, m4);
      blocks.setColorAt(i, col.set(b.color));
      // Caixa de toque maior que o bloco (bloco baixo também se toca).
      const sp = spots[i]!;
      const hh = Math.max(h, 0.14) + 0.04;
      sp.obj.position.set(x, hh / 2, z);
      sp.obj.scale.set(0.2, hh, 0.2);
      sp.id = `maq:${b.id}`;
      sp.active = true;
      sp.obj.userData.hitbox = true;
      markAction(sp.obj, sp.id);
      // O nome na base, para fora do bloco (no meio, embaixo dele, se é um só).
      const R = list.length <= 1 ? 0.16 : 0.45;
      const lx = list.length <= 1 ? 0 : Math.sin(ang) * R;
      const lz = list.length <= 1 ? R : Math.cos(ang) * R;
      ctx.fillStyle = b.color;
      ctx.font = `700 ${Math.round(P * 0.042)}px ${FONT}`;
      const tx = P / 2 + (lx / 1.3) * P;
      const ty = P / 2 + (lz / 1.3) * P;
      ctx.fillText(b.name, tx, ty, P * 0.36);
      if (b.percent !== null) {
        ctx.fillStyle = '#E2E8F0';
        ctx.font = `600 ${Math.round(P * 0.034)}px ${FONT}`;
        ctx.fillText(`${b.percent}%`, tx, ty + P * 0.045, P * 0.3);
      }
    });
    if (!list.length) {
      ctx.fillStyle = '#CBD5E1';
      ctx.font = `italic 600 ${Math.round(P * 0.05)}px ${FONT}`;
      ctx.fillText(d.empty, P / 2, P / 2, P * 0.8);
    }
    blocks.count = list.length;
    blocks.instanceMatrix.needsUpdate = true;
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
    blocks.computeBoundingSphere();
    for (let i = list.length; i < BLOCKS; i++) {
      const sp = spots[i]!;
      sp.id = '';
      sp.active = false;
      sp.obj.userData.hitbox = false;
      markAction(sp.obj, '');
    }
    label.tex.needsUpdate = true;
  };
  return { set, tick: () => undefined };
}

/* =====================================================================
 * Focus: a luminária de cada sala individual e de cada cabine
 * ===================================================================== */

function lamps(kit: Kit, scene: InteriorScene, a: Record<string, Anchor | undefined>): Live | null {
  const list: Anchor[] = [];
  for (let i = 0; a[`lamp${i}`]; i++) list.push(a[`lamp${i}`]!);
  if (!list.length) return null;
  const actions = (scene.actions ??= []);
  const metal = kit.mat('#3F4650', { metal: 0.6, rough: 0.35 });
  const onMat = kit.mat('#FFE7B0', { glow: true });
  const pausedMat = kit.mat('#E2B867', { rough: 0.4 });
  const offMat = kit.mat('#8E877B', { rough: 0.6 });
  const halo = kit.own(new THREE.MeshBasicMaterial({ color: '#FFE2A8', transparent: true, opacity: 0.18, depthWrite: false }));
  const bulbGeo = kit.own(new THREE.SphereGeometry(0.095, 16, 10));
  const haloGeo = kit.own(new THREE.SphereGeometry(0.24, 16, 10));
  const hitGeo = kit.own(new THREE.SphereGeometry(0.2, 8, 6));
  const hitMat = kit.own(new THREE.MeshBasicMaterial({ visible: false }));
  const baseGeo = kit.own(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 14));
  const stemGeo = kit.own(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 6));
  const bulbs: THREE.Mesh[] = [];
  const halos: THREE.Mesh[] = [];
  const spots: ActionSpot[] = [];
  list.forEach((an, i) => {
    const root = placed(scene, an);
    // Nas cabines a luminária é nova (pé e haste no tampo); nas salas, a lâmpada da luminária que já existe.
    const y = an.flag ? 0.4 : 0;
    if (an.flag) {
      const base = new THREE.Mesh(baseGeo, metal);
      base.position.y = 0.01;
      const stem = new THREE.Mesh(stemGeo, metal);
      stem.position.y = 0.19;
      root.add(base, stem);
    }
    const bulb = new THREE.Mesh(bulbGeo, offMat);
    bulb.position.y = y;
    const glow = new THREE.Mesh(haloGeo, halo);
    glow.position.y = y;
    glow.visible = false;
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.visible = false;
    hit.userData.hitbox = true;
    hit.position.y = y;
    root.add(bulb, glow, hit);
    const id = `lamp:${i}`;
    markAction(root, id);
    noCollide(root);
    const sp: ActionSpot = { id, level: 0, obj: hit, x: an.x, z: an.z, r: 0, active: false };
    actions.push(sp);
    spots.push(sp);
    bulbs.push(bulb);
    halos.push(glow);
  });
  let state: LampState | null = null;
  const set = (raw: unknown) => {
    const d = raw as LampObj | null;
    if (!d?.state || d.state === state) return;
    state = d.state;
    const mat = state === 'on' ? onMat : state === 'paused' ? pausedMat : offMat;
    bulbs.forEach((b) => (b.material = mat));
    halos.forEach((h) => (h.visible = state === 'on'));
    spots.forEach((s) => (s.active = true));
  };
  return { set, tick: () => undefined };
}

/* =====================================================================
 * Inbox: a bandeja de chegadas no balcão (um cartão por item em aberto)
 * ===================================================================== */

const TRAY = 6;

function tray(kit: Kit, scene: InteriorScene, a: Anchor): Live {
  const W = 4.6;
  const H = 0.46;
  const B = board(kit, scene, a, 0, W, H, 170, TRAY);
  // A bandeja: um tabuleiro raso por baixo dos cartões.
  const base = new THREE.Mesh(kit.own(new THREE.BoxGeometry(W + 0.1, H + 0.08, 0.025)), kit.mat('#334155', { rough: 0.6, metal: 0.2 }));
  base.position.z = -0.016;
  B.root.add(base);
  noCollide(B.root);
  const fresh = changed();
  const set = (raw: unknown) => {
    const d = raw as TrayObj | null;
    if (!d?.cards || !fresh(d)) return;
    const { ctx, PW, PH } = B;
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, 0, PW, PH);
    const slots = TRAY;
    const sw = PW / slots;
    const items: Array<{ id: string; title: string; sub: string; more: boolean }> = d.cards.slice(0, d.more ? slots - 1 : slots).map((c) => ({ ...c, more: false }));
    if (d.more) items.push({ id: '', title: d.more, sub: '', more: true });
    let hi = 0;
    items.forEach((c, i) => {
      const x = i * sw + 10;
      const y = 12;
      const w = sw - 20;
      const h = PH - 24;
      // Cartão de papel levemente torto, com a faixa da cor do Inbox.
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(((i % 3) - 1) * 0.015);
      ctx.fillStyle = c.more ? '#475569' : '#F8FAFC';
      rounded(ctx, -w / 2, -h / 2, w, h, 10);
      ctx.fill();
      ctx.fillStyle = '#22D3EE';
      ctx.fillRect(-w / 2, -h / 2, 8, h);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.more ? '#E2E8F0' : '#0F172A';
      const fs = Math.round(h * 0.2);
      ctx.font = `600 ${fs}px ${FONT}`;
      const lines = wrap(ctx, c.title, w - 34, c.sub ? 2 : 3);
      const top = -h / 2 + h * 0.26;
      lines.forEach((ln, k) => ctx.fillText(ln, -w / 2 + 20, top + k * fs * 1.2, w - 34));
      if (c.sub) {
        ctx.fillStyle = '#64748B';
        ctx.font = `500 ${Math.round(h * 0.14)}px ${FONT}`;
        ctx.fillText(c.sub, -w / 2 + 20, h / 2 - h * 0.16, w - 34);
      }
      ctx.restore();
      B.hit(hi++, `tray:${c.id}`, x, y, w, h);
    });
    if (!items.length) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = `italic 500 ${Math.round(PH * 0.22)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.empty, PW / 2, PH / 2, PW - 40);
    }
    B.off(hi);
    B.tex.needsUpdate = true;
  };
  return { set, tick: () => undefined };
}

/* =====================================================================
 * Notes: o caderno aberto no balcão de captura (tocar escreve uma nota rápida)
 * ===================================================================== */

function notebook(kit: Kit, scene: InteriorScene, a: Anchor): Live {
  const W = 0.52;
  const H = 0.3;
  const B = board(kit, scene, a, 0, W, H, 300, 1);
  const cover = new THREE.Mesh(kit.own(new THREE.BoxGeometry(W + 0.03, H + 0.03, 0.012)), kit.mat('#5B4B8A', { rough: 0.7 }));
  cover.position.z = -0.008;
  B.root.add(cover);
  noCollide(B.root);
  const fresh = changed();
  const set = (raw: unknown) => {
    const d = raw as NotebookObj | null;
    if (!d || typeof d.title !== 'string' || !fresh(d)) return;
    const { ctx, PW, PH } = B;
    ctx.fillStyle = '#FBF7EE';
    ctx.fillRect(0, 0, PW, PH);
    // Pautas nas duas páginas e a dobra no meio.
    ctx.fillStyle = 'rgba(99,102,241,0.18)';
    for (let y = PH * 0.3; y < PH - 12; y += PH * 0.1) {
      ctx.fillRect(16, y, PW / 2 - 32, 2);
      ctx.fillRect(PW / 2 + 16, y, PW / 2 - 32, 2);
    }
    const grad = ctx.createLinearGradient(PW / 2 - 18, 0, PW / 2 + 18, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(PW / 2 - 18, 0, 36, PH);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#4C3F7A';
    ctx.font = `700 ${Math.round(PH * 0.12)}px ${FONT}`;
    ctx.fillText(`+ ${d.title}`, 22, PH * 0.15, PW / 2 - 40);
    ctx.fillStyle = '#6B7280';
    ctx.font = `italic 500 ${Math.round(PH * 0.075)}px ${FONT}`;
    wrap(ctx, d.hint, PW / 2 - 44, 3).forEach((ln, i) => ctx.fillText(ln, 22, PH * 0.36 + i * PH * 0.1, PW / 2 - 44));
    if (d.last) {
      ctx.fillStyle = '#374151';
      ctx.font = `600 ${Math.round(PH * 0.08)}px ${FONT}`;
      wrap(ctx, d.last, PW / 2 - 44, 4).forEach((ln, i) => ctx.fillText(ln, PW / 2 + 22, PH * 0.16 + i * PH * 0.1, PW / 2 - 44));
    }
    B.tex.needsUpdate = true;
    B.hit(0, 'nb:new', 0, 0, PW, PH);
  };
  return { set, tick: () => undefined };
}

/* =====================================================================
 * Library: a fileira dos novos (uma lombada por material adicionado por último)
 * ===================================================================== */

const SPINES = 10;

function shelf(kit: Kit, scene: InteriorScene, a: Anchor): Live {
  const W = 4.2;
  const H = 0.4;
  const B = board(kit, scene, a, 0, W, H, 200, SPINES, false);
  const fresh = changed();
  const set = (raw: unknown) => {
    const d = raw as ShelfObj | null;
    if (!d?.books || !fresh(d)) return;
    const { ctx, PW, PH } = B;
    ctx.clearRect(0, 0, PW, PH);
    // Plaquinha "Novos" na ponta esquerda.
    const tag = PW * 0.1;
    ctx.fillStyle = '#065F46';
    rounded(ctx, 4, PH * 0.3, tag - 12, PH * 0.4, 8);
    ctx.fill();
    ctx.fillStyle = '#ECFDF5';
    ctx.font = `700 ${Math.round(PH * 0.16)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.label, tag / 2, PH / 2, tag - 24);
    const items: Array<{ id: string; title: string; color: string }> = d.books.slice(0, d.more ? SPINES - 1 : SPINES);
    if (d.more) items.push({ id: '', title: d.more, color: '#64748B' });
    const sw = (PW - tag) / SPINES;
    let hi = 0;
    items.forEach((bk, i) => {
      const x = tag + i * sw + 4;
      const w = sw - 8;
      const top = 6 + ((i * 7) % 3) * 6;
      const h = PH - top - 2;
      ctx.fillStyle = bk.color;
      rounded(ctx, x, top, w, h, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, top + 10, w, 3);
      ctx.fillRect(x, top + h - 14, w, 3);
      // O título ao longo da lombada (de baixo para cima).
      ctx.save();
      ctx.translate(x + w / 2, top + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `600 ${Math.round(Math.min(w * 0.42, PH * 0.12))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bk.title, 0, 0, h - 34);
      ctx.restore();
      B.hit(hi++, `spine:${bk.id}`, x, top, w, h);
    });
    if (!items.length) {
      ctx.fillStyle = 'rgba(15,23,42,0.75)';
      rounded(ctx, tag + 10, PH * 0.25, PW - tag - 20, PH * 0.5, 10);
      ctx.fill();
      ctx.fillStyle = '#E2E8F0';
      ctx.font = `italic 500 ${Math.round(PH * 0.2)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(d.empty, (PW + tag) / 2, PH / 2, PW - tag - 40);
    }
    B.off(hi);
    B.tex.needsUpdate = true;
  };
  return { set, tick: () => undefined };
}

/* =====================================================================
 * Idiomas: o baralho de revisão na mesa (vira; depois "lembrei" ou "não lembrei")
 * ===================================================================== */

function deck(kit: Kit, scene: InteriorScene, a: Anchor): Live {
  const W = 0.42;
  const H = 0.56;
  // O monte deitado no tampo e o cartão da vez em pé, um pouco inclinado, num suporte.
  const pile = placed(scene, a);
  const paper = kit.mat('#F1ECE2', { rough: 0.8 });
  const stack = new THREE.Mesh(kit.own(new THREE.BoxGeometry(0.2, 0.05, 0.28)), paper);
  stack.position.set(0.34, 0.025, 0.1);
  const holder = new THREE.Mesh(kit.own(new THREE.BoxGeometry(W * 0.9, 0.03, 0.08)), kit.mat('#3F2E22', { rough: 0.6 }));
  holder.position.set(0, 0.015, 0.02);
  markAction(pile, '');
  pile.add(stack, holder);
  noCollide(pile);
  const B = board(kit, scene, { ...a, y: a.y + 0.03 + (H / 2) * Math.cos(0.22), tilt: -0.22 }, 0, W, H, 300, 2);
  const fresh = changed();
  let anim = 0;
  let still = false;
  const set = (raw: unknown) => {
    const d = raw as DeckObj | null;
    if (!d || typeof d.title !== 'string' || !fresh(d)) return;
    const { ctx, PW, PH } = B;
    const prevFlip = B.mesh.userData.side as string | undefined;
    const side = d.card ? (d.card.answer === null ? `f:${d.card.id}` : `b:${d.card.id}`) : 'none';
    still = d.still;
    if (prevFlip !== undefined && prevFlip !== side && !still) anim = performance.now();
    B.mesh.userData.side = side;
    ctx.fillStyle = '#FFFDF8';
    ctx.fillRect(0, 0, PW, PH);
    const accent = d.card?.color ?? '#14B8A6';
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, PW, 14);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#475569';
    ctx.font = `600 ${Math.round(PH * 0.045)}px ${FONT}`;
    ctx.fillText(d.title, PW / 2, PH * 0.08, PW - 30);
    if (!d.card) {
      ctx.fillStyle = '#64748B';
      ctx.font = `italic 500 ${Math.round(PH * 0.05)}px ${FONT}`;
      wrap(ctx, d.empty, PW - 50, 4).forEach((ln, i) => ctx.fillText(ln, PW / 2, PH * 0.42 + i * PH * 0.07, PW - 40));
      B.off(0);
      B.tex.needsUpdate = true;
      return;
    }
    const big = (text: string, y: number, size: number, color: string) => {
      ctx.fillStyle = color;
      ctx.font = `700 ${Math.round(PH * size)}px ${FONT}`;
      wrap(ctx, text, PW - 50, 3).forEach((ln, i, all) => ctx.fillText(ln, PW / 2, y + (i - (all.length - 1) / 2) * PH * size * 1.15, PW - 40));
    };
    if (d.card.answer === null) {
      big(d.card.term, PH * 0.45, 0.09, '#0F172A');
      ctx.fillStyle = accent;
      rounded(ctx, PW * 0.15, PH * 0.8, PW * 0.7, PH * 0.1, 16);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 ${Math.round(PH * 0.045)}px ${FONT}`;
      ctx.fillText(d.flip, PW / 2, PH * 0.85, PW * 0.66);
      B.hit(0, `deck:flip.${d.card.id}`, 0, 0, PW, PH);
      B.off(1);
    } else {
      big(d.card.term, PH * 0.22, 0.055, '#475569');
      ctx.fillStyle = 'rgba(100,116,139,0.3)';
      ctx.fillRect(40, PH * 0.32, PW - 80, 2);
      big(d.card.answer, PH * 0.5, 0.075, '#0F172A');
      // Os dois botões do pé do cartão.
      const bw = PW * 0.42;
      const bh = PH * 0.12;
      const by = PH * 0.8;
      const btn = (x: number, color: string, text: string) => {
        ctx.fillStyle = color;
        rounded(ctx, x, by, bw, bh, 16);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `700 ${Math.round(PH * 0.042)}px ${FONT}`;
        ctx.fillText(text, x + bw / 2, by + bh / 2, bw - 16);
      };
      btn(PW * 0.05, '#DC2626', d.again);
      btn(PW * 0.53, '#16A34A', d.good);
      B.hit(0, `deck:again.${d.card.id}`, PW * 0.05, by, bw, bh);
      B.hit(1, `deck:good.${d.card.id}`, PW * 0.53, by, bw, bh);
    }
    B.tex.needsUpdate = true;
  };
  // Virar: o cartão estreita e volta (só o desenho; o toque já vale no lado novo).
  const tick = (now: number) => {
    if (!anim) return;
    const k = Math.min(1, (now - anim) / 320);
    B.mesh.scale.x = Math.max(0.02, Math.abs(Math.cos(k * Math.PI)));
    if (k >= 1) {
      anim = 0;
      B.mesh.scale.x = 1;
    }
  };
  return { set, tick };
}

/* =====================================================================
 * Sports: as faixas das modalidades (tocar registra a atividade de hoje)
 * ===================================================================== */

function court(kit: Kit, scene: InteriorScene, a: Record<string, Anchor | undefined>): Live | null {
  const list: Anchor[] = [];
  for (let i = 0; a[`court${i}`]; i++) list.push(a[`court${i}`]!);
  if (!list.length) return null;
  const actions = (scene.actions ??= []);
  const geo = kit.own(new THREE.PlaneGeometry(1.5, 0.42));
  const mat = kit.own(new THREE.MeshBasicMaterial({ visible: false }));
  const spots = list.map((an) => {
    const root = placed(scene, an);
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.userData.hitbox = false;
    markAction(m, '');
    root.add(m);
    noCollide(root);
    const sp: ActionSpot = { id: '', level: 0, obj: m, x: an.x, z: an.z, r: 0, active: false };
    actions.push(sp);
    return sp;
  });
  const fresh = changed();
  const set = (raw: unknown) => {
    const d = raw as CourtObj | null;
    if (!d?.ids || !fresh(d)) return;
    spots.forEach((sp, i) => {
      const id = d.ids[i] ?? '';
      sp.id = id ? `court:${id}` : '';
      sp.active = !!id;
      // Faixa sem modalidade: o toque passa para a faixa (abre a lista de modalidades).
      sp.obj.userData.hitbox = !!id;
      markAction(sp.obj, sp.id);
    });
  };
  return { set, tick: () => undefined };
}

/* =====================================================================
 * Insights: uma esfera por indicador real em volta do núcleo
 * ===================================================================== */

const ORBS = 10;

function orbs(kit: Kit, scene: InteriorScene, a: Anchor): Live {
  const root = placed(scene, { ...a, face: 0, tilt: 0 });
  const R = a.r ?? 4;
  const actions = (scene.actions ??= []);
  const geo = kit.own(new THREE.SphereGeometry(1, 24, 16));
  const ringGeo = kit.own(new THREE.TorusGeometry(1.25, 0.05, 6, 32));
  const lockedMat = kit.own(new THREE.MeshStandardMaterial({ color: '#3B4250', roughness: 0.8, metalness: 0.2 }));
  const items = Array.from({ length: ORBS }, () => {
    const mat = kit.own(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.1, emissive: '#000000', emissiveIntensity: 0.5 }));
    const m = new THREE.Mesh(geo, mat);
    const ring = new THREE.Mesh(ringGeo, lockedMat);
    ring.rotation.x = Math.PI / 2;
    m.add(ring);
    m.visible = false;
    markAction(m, '');
    root.add(m);
    const sp: ActionSpot = { id: '', level: 0, obj: m, x: a.x, z: a.z, r: 0, active: false };
    actions.push(sp);
    return { m, mat, ring, sp, y: 0 };
  });
  noCollide(root);
  let still = false;
  let shown = 0;
  const fresh = changed();
  const set = (raw: unknown) => {
    const d = raw as OrbObj | null;
    if (!d?.orbs || !fresh(d)) return;
    still = d.still;
    const list = d.orbs.slice(0, ORBS);
    const ang = orbAngles(list.length);
    shown = list.length;
    items.forEach((it, i) => {
      const o = list[i];
      if (!o) {
        it.m.visible = false;
        it.sp.active = false;
        it.sp.id = '';
        markAction(it.m, '');
        return;
      }
      const t = ang[i] ?? 0;
      // Com registro: esfera cheia e acesa; sem dados: menor e apagada; Finanças trancado: cinza com o anel.
      const s = o.locked ? 0.24 : o.has ? 0.32 : 0.22;
      it.m.scale.setScalar(s);
      it.m.position.set(Math.sin(t) * R, 0, Math.cos(t) * R);
      it.y = (i % 3) * 0.18;
      it.m.position.y = it.y;
      it.m.material = o.locked ? lockedMat : it.mat;
      it.mat.color.set(o.color);
      it.mat.emissive.set(o.has ? o.color : '#000000');
      it.mat.emissiveIntensity = o.has ? 0.45 : 0;
      it.ring.visible = o.locked;
      it.m.visible = true;
      it.sp.id = `orb:${o.id}`;
      it.sp.active = true;
      markAction(it.m, it.sp.id);
    });
  };
  // Flutuam devagar (parado com movimento reduzido).
  const tick = (now: number) => {
    if (still) return;
    for (let i = 0; i < shown; i++) {
      const it = items[i]!;
      it.m.position.y = it.y + Math.sin(now / 1400 + i * 1.7) * 0.07;
    }
  };
  return { set, tick };
}

/* =====================================================================
 * Finance: os saldos dentro do cofre (só leitura; só com Finanças desbloqueado)
 * ===================================================================== */

function vaultBoard(kit: Kit, scene: InteriorScene, a: Anchor): Live {
  const W = 1.9;
  const H = 1.2;
  const B = board(kit, scene, a, 0, W, H, 360, 1);
  B.root.visible = false;
  const fresh = changed();
  const set = (raw: unknown) => {
    if (!fresh(raw)) return;
    const d = raw as VaultObj;
    if (!d) {
      // Trancado (ou ainda lendo): nenhum número, nem o quadro.
      B.root.visible = false;
      B.off(0);
      const { ctx, PW, PH } = B;
      ctx.fillStyle = '#1C1712';
      ctx.fillRect(0, 0, PW, PH);
      B.tex.needsUpdate = true;
      return;
    }
    const { ctx, PW, PH } = B;
    ctx.fillStyle = '#1C1712';
    ctx.fillRect(0, 0, PW, PH);
    ctx.strokeStyle = '#C9A45C';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, PW - 20, PH - 20);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F5E6C4';
    ctx.font = `700 ${Math.round(PH * 0.085)}px ${FONT}`;
    ctx.fillText(d.title, 36, PH * 0.12, PW - 72);
    const rows = d.rows.slice(0, 5);
    const top = PH * 0.24;
    const rh = (PH * 0.62) / Math.max(4, rows.length);
    rows.forEach((r, i) => {
      const y = top + i * rh;
      ctx.fillStyle = 'rgba(201,164,92,0.12)';
      ctx.fillRect(30, y, PW - 60, rh - 8);
      ctx.fillStyle = '#FDF6E3';
      ctx.font = `700 ${Math.round(rh * 0.36)}px ${FONT}`;
      ctx.fillText(r.title, 46, y + rh * 0.34, PW - 92);
      ctx.fillStyle = '#C8B48A';
      ctx.font = `500 ${Math.round(rh * 0.26)}px ${FONT}`;
      ctx.fillText(r.sub, 46, y + rh * 0.7, PW - 92);
    });
    if (!rows.length) {
      ctx.fillStyle = '#C8B48A';
      ctx.font = `italic 500 ${Math.round(PH * 0.06)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(d.empty, PW / 2, PH * 0.5, PW - 80);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9C8763';
    ctx.font = `500 ${Math.round(PH * 0.045)}px ${FONT}`;
    ctx.fillText(d.tap, PW / 2, PH * 0.92, PW - 80);
    B.tex.needsUpdate = true;
    B.root.visible = true;
    B.hit(0, 'bal:values', 0, 0, PW, PH);
  };
  return { set, tick: () => undefined };
}
