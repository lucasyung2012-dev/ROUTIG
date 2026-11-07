/**
 * Moradores do campus (V2.1, seção 6): pessoas simuladas com nome, casa, grupo de amigos e
 * rotina por horário, clima e estação. Andam pela rede de caminhos (rotas calculadas no grafo
 * dos caminhos), param nos espaços de convivência e voltam para casa (fora da área explorável).
 * Tudo determinístico por dia e hora: a mesma hora mostra o mesmo campus. Sem missões.
 */
import { COURTS, PARK_BUILDINGS, PLAZA_RADIUS, POIS, dist, inWater, parkPaths, residences, seededRandom, type Point } from './park';

export type Activity = 'home' | 'cafe' | 'read' | 'study' | 'sport' | 'music' | 'view' | 'chat' | 'stroll' | 'picnic';
export type PersonPose = 'stand' | 'walk' | 'sit' | 'read' | 'play' | 'wave' | 'exercise';

export interface Person {
  id: number;
  name: string;
  home: Point;
  group: number;
  /** Perfil de horário: madrugador, diurno ou noturno. */
  rhythm: 'early' | 'day' | 'night';
  likes: Activity[];
  shirt: string;
  pants: string;
  skin: string;
  scale: number;
}

export interface Conditions {
  /** Hora do dia (0–24, com frações). */
  hour: number;
  /** Número do dia (muda os eventos espontâneos). */
  day: number;
  rain: number;
  fog: number;
  wind: number;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
}

const NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'João', 'Kátia', 'Léo', 'Marina', 'Nina', 'Otávio', 'Paula', 'Rafa', 'Sofia', 'Tiago', 'Úrsula', 'Vítor', 'Wanda', 'Yuri', 'Zé', 'Alice', 'Beto', 'Cecília', 'Davi', 'Estela', 'Felipe', 'Gustavo', 'Helena', 'Igor', 'Júlia', 'Kauã', 'Luana', 'Mateus', 'Noemi', 'Olívia', 'Pedro', 'Quésia', 'Renan', 'Sara', 'Theo', 'Valéria', 'Wesley', 'Yasmin', 'Zoe', 'Arthur', 'Bianca', 'Caio', 'Débora', 'Enzo', 'Flora', 'Gael', 'Hugo', 'Ísis', 'Jonas', 'Lara', 'Murilo', 'Nara', 'Otto', 'Pietra', 'Raul'];
const SHIRTS = ['#E07A5F', '#3D9970', '#F2CC8F', '#81B29A', '#5B8DB8', '#C06C84', '#F4A259', '#6C5B7B', '#EEEEEE', '#2E4057', '#D1495B', '#66A182', '#EDAE49', '#8E7DBE'];
const PANTS = ['#2F3542', '#4A5568', '#6B4F3A', '#1F3A5F', '#7A7A7A', '#A68A64', '#334155'];
const SKINS = ['#F1C9A5', '#E0AC86', '#C68863', '#A86F4C', '#8D5A3B', '#6B4229', '#F5D5B8'];
const ALL: Activity[] = ['cafe', 'read', 'study', 'sport', 'music', 'view', 'chat', 'stroll'];

export const PEOPLE_COUNT = 64;

/** Os 64 moradores: sempre os mesmos (semente fixa). Grupos de 2 a 4 amigos. */
export function campusPeople(): Person[] {
  const rnd = seededRandom(2101);
  const homes = residences();
  const out: Person[] = [];
  let group = 0;
  let left = 0;
  for (let i = 0; i < PEOPLE_COUNT; i++) {
    if (left <= 0) {
      group++;
      left = 1 + Math.floor(rnd() * 4);
    }
    left--;
    const likes = [...ALL].sort(() => rnd() - 0.5).slice(0, 3);
    const h = homes[Math.floor(rnd() * homes.length)]!;
    out.push({
      id: i,
      name: NAMES[i % NAMES.length]!,
      home: { x: h.x, z: h.z },
      group,
      rhythm: rnd() < 0.25 ? 'early' : rnd() < 0.7 ? 'day' : 'night',
      likes,
      shirt: SHIRTS[Math.floor(rnd() * SHIRTS.length)]!,
      pants: PANTS[Math.floor(rnd() * PANTS.length)]!,
      skin: SKINS[Math.floor(rnd() * SKINS.length)]!,
      scale: 0.92 + rnd() * 0.12,
    });
  }
  return out;
}

/* ---------- Lugares de cada atividade ---------- */

const poi = (id: string): Point => {
  const p = POIS.find((x) => x.id === id)!;
  return { x: p.x, z: p.z };
};
const sports = PARK_BUILDINGS.find((b) => b.id === 'sports')!;

export const ACTIVITY_SPOTS: Record<Exclude<Activity, 'home' | 'stroll'>, Point[]> = {
  cafe: [poi('cafe-praca'), poi('cafe-sul'), poi('quiosque-leste')],
  read: [poi('leitura-norte'), poi('pergola-sul')],
  study: [COURTS.learning!, COURTS.east!],
  sport: [{ x: sports.x + 52, z: sports.z - 22 }, { x: sports.x + 50, z: sports.z + 26 }],
  music: [poi('palco-musica')],
  view: [poi('mirante-colina'), poi('mirante-lago')],
  chat: [{ x: 14, z: 12 }, { x: -14, z: -12 }, poi('praca-leste')],
  picnic: [{ x: -45, z: 140 }, { x: 40, z: 145 }],
};

/** Atividades com teto (café, pérgola, leitura): a chuva leva as pessoas para elas. */
const COVERED: Activity[] = ['cafe', 'read'];

/* ---------- Rede de caminhos como grafo ---------- */

export interface NavGraph {
  nodes: Point[];
  adj: Array<Array<{ to: number; w: number }>>;
  gates: number[];
}

let graphCache: NavGraph | null = null;

function cross(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, z: b.z - a.z };
  const s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
  return { x: a.x + r.x * t, z: a.z + r.z * t };
}

/** Grafo dos caminhos: vértices das linhas, cruzamentos e um anel na praça ligando as avenidas. */
export function navGraph(): NavGraph {
  if (graphCache) return graphCache;
  const segs: Array<[Point, Point]> = [];
  for (const p of parkPaths()) for (let i = 0; i < p.points.length - 1; i++) segs.push([p.points[i]!, p.points[i + 1]!]);
  const ring: Point[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ring.push({ x: Math.cos(a) * (PLAZA_RADIUS - 6), z: Math.sin(a) * (PLAZA_RADIUS - 6) });
  }
  const ends = segs.flatMap((s) => s).filter((p) => Math.hypot(p.x, p.z) < PLAZA_RADIUS + 2);
  ring.forEach((p, i) => segs.push([p, ring[(i + 1) % ring.length]!]));
  for (const e of ends) {
    const near = ring.reduce((m, p) => (dist(p, e) < dist(m, e) ? p : m), ring[0]!);
    segs.push([e, near]);
  }
  const cuts = segs.map((s) => [s[0], s[1]]);
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const p = cross(segs[i]![0], segs[i]![1], segs[j]![0], segs[j]![1]);
      if (p) {
        cuts[i]!.push(p);
        cuts[j]!.push(p);
      }
    }
  const nodes: Point[] = [];
  const adj: NavGraph['adj'] = [];
  const idOf = (p: Point) => {
    for (let k = 0; k < nodes.length; k++) if (dist(nodes[k]!, p) < 2.5) return k;
    nodes.push({ x: p.x, z: p.z });
    adj.push([]);
    return nodes.length - 1;
  };
  cuts.forEach((pts, i) => {
    const a = segs[i]![0];
    pts.sort((p, q) => dist(a, p) - dist(a, q));
    for (let k = 0; k < pts.length - 1; k++) {
      const u = idOf(pts[k]!);
      const v = idOf(pts[k + 1]!);
      if (u === v) continue;
      const w = dist(nodes[u]!, nodes[v]!);
      adj[u]!.push({ to: v, w });
      adj[v]!.push({ to: u, w });
    }
  });
  // Portões: os pontos mais afastados do centro em cada direção (por onde se chega das casas).
  const gates: number[] = [];
  for (let s = 0; s < 6; s++) {
    let best = -1;
    let bestR = 0;
    nodes.forEach((p, k) => {
      const a = (Math.atan2(p.z, p.x) + Math.PI * 2) % (Math.PI * 2);
      const r = Math.hypot(p.x, p.z);
      if (Math.floor(a / (Math.PI / 3)) === s && r > bestR) {
        best = k;
        bestR = r;
      }
    });
    if (best >= 0 && bestR > 150) gates.push(best);
  }
  graphCache = { nodes, adj, gates };
  return graphCache;
}

export function nearestNode(g: NavGraph, p: Point): number {
  let best = 0;
  let bd = Infinity;
  g.nodes.forEach((n, k) => {
    const d = dist(n, p);
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
}

/** Menor caminho entre dois nós (Dijkstra). Vazio se não houver ligação. */
export function shortestPath(g: NavGraph, from: number, to: number): number[] {
  const n = g.nodes.length;
  const d = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  d[from] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let k = 0; k < n; k++) if (!done[k] && d[k]! < best) {
      best = d[k]!;
      u = k;
    }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const e of g.adj[u]!) if (d[u]! + e.w < d[e.to]!) {
      d[e.to] = d[u]! + e.w;
      prev[e.to] = u;
    }
  }
  if (!Number.isFinite(d[to]!)) return [];
  const out: number[] = [];
  for (let k = to; k >= 0; k = prev[k]!) out.unshift(k);
  return out;
}

/** Rota a pé entre dois pontos quaisquer, pelos caminhos. */
export function routeBetween(a: Point, b: Point): Point[] {
  const g = navGraph();
  const ids = shortestPath(g, nearestNode(g, a), nearestNode(g, b));
  return [a, ...ids.map((k) => g.nodes[k]!), b];
}

/** Rota de/para casa: até o portão mais próximo da casa e, de lá, em linha reta. */
export function routeHome(from: Point, home: Point, leaving: boolean): Point[] {
  const g = navGraph();
  const gate = g.gates.reduce((m, k) => (dist(g.nodes[k]!, home) < dist(g.nodes[m]!, home) ? k : m), g.gates[0] ?? 0);
  const r = routeBetween(leaving ? from : g.nodes[gate]!, leaving ? g.nodes[gate]! : from);
  return leaving ? [...r, home] : [home, ...r];
}

/* ---------- Rotina ---------- */

const hourHash = (p: Person, day: number, block: number) => seededRandom(p.group * 7919 + day * 104729 + block * 31)();

/** O que a pessoa (e o grupo dela) faz neste bloco de hora. */
export function activityAt(p: Person, c: Conditions): Activity {
  const block = Math.floor(c.hour);
  const shift = c.season === 'summer' ? 1 : c.season === 'winter' ? -1 : 0;
  const [wake, sleep] = p.rhythm === 'early' ? [6, 20 + shift] : p.rhythm === 'day' ? [8, 22 + shift] : [11, 24 + shift];
  if (block < wake || block >= sleep) return 'home';
  const r = hourHash(p, c.day, block);
  // Muitos passam parte do dia fora (trabalho, escola): o campus nunca está lotado.
  if (r < 0.32) return 'home';
  // Chuva forte: quase todos em casa; quem fica vai para lugares cobertos.
  if (c.rain > 0.15 && r < 0.32 + c.rain * 0.5) return 'home';
  const evt = spontaneousEvent(c.day, block);
  if (evt && r > 0.86 && c.rain < 0.15) return evt;
  let pick: Activity;
  if (block >= 11 && block <= 13 && r < 0.55) pick = 'cafe';
  else if (block >= 18 && p.rhythm !== 'early' && r < 0.6) pick = 'music';
  else if (block <= 9 && p.rhythm === 'early' && r < 0.7) pick = r < 0.5 ? 'sport' : 'stroll';
  else pick = p.likes[Math.floor(r * 1000) % p.likes.length]!;
  if (c.rain > 0.15 && !COVERED.includes(pick)) pick = r < 0.6 ? 'cafe' : 'read';
  if (c.fog > 0.5 && pick === 'view') pick = 'stroll';
  if (c.wind > 0.7 && (pick === 'view' || pick === 'picnic')) pick = 'cafe';
  return pick;
}

/** Eventos espontâneos do dia (sem missões): roda de música na praça, piquenique, jogo no gramado. */
export function spontaneousEvent(day: number, block: number): Activity | null {
  const r = seededRandom(day * 7 + 3)();
  const at = 10 + Math.floor(r * 8);
  if (block !== at) return null;
  return r < 0.33 ? 'music' : r < 0.66 ? 'picnic' : 'sport';
}

/** Lugar da atividade (cada grupo escolhe um; cada pessoa fica num ponto da roda do grupo). */
export function spotFor(p: Person, a: Activity, c: Conditions, slot: number): Point {
  if (a === 'home' || a === 'stroll') return p.home;
  const list = ACTIVITY_SPOTS[a];
  const r = hourHash(p, c.day, Math.floor(c.hour) + 50);
  const base = list[Math.floor(r * list.length)]!;
  const ang = slot * 2.1 + p.group;
  const rad = a === 'music' ? 4 + (slot % 3) * 1.6 : 1.4 + (slot % 3) * 0.5;
  const s = { x: base.x + Math.cos(ang) * rad, z: base.z + Math.sin(ang) * rad };
  return inWater(s.x, s.z, 1) ? base : s;
}

export function poseFor(a: Activity, slot: number): PersonPose {
  switch (a) {
    case 'cafe':
      return 'sit';
    case 'read':
    case 'study':
      return slot % 2 ? 'read' : 'sit';
    case 'sport':
      return 'exercise';
    case 'music':
      return slot === 0 ? 'play' : 'stand';
    case 'picnic':
      return 'sit';
    default:
      return 'stand';
  }
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  home: 'em casa',
  cafe: 'no café',
  read: 'lendo',
  study: 'estudando',
  sport: 'se exercitando',
  music: 'na roda de música',
  view: 'no mirante',
  chat: 'conversando',
  stroll: 'caminhando',
  picnic: 'no piquenique',
};
