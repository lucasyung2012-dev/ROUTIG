/**
 * Vida do campus em movimento: os 64 moradores andando pelas rotas, parando nas atividades,
 * reagindo a quem chega perto (olham e acenam) e voltando para casa. Só os mais próximos da
 * câmera são desenhados (limite por aparelho e modo gráfico).
 */
import { activityAt, campusPeople, indoorOf, poseFor, routeBetween, routeHome, spotFor, type Activity, type Conditions, type Person, type PersonPose } from '@/domain/parkPeople';
import { PARK_SCALE, SPORT_FIELDS, heightAt, type Point } from '@/domain/park';
import type { ModuleId } from '@/app/modules';
import { styleOf, type Expr, type Figure } from './people';
import type { Seat } from './camera';

interface Agent {
  p: Person;
  slot: number;
  x: number;
  z: number;
  yaw: number;
  activity: Activity;
  route: Point[];
  ri: number;
  pose: PersonPose;
  phase: number;
  /** Fora do campus (em casa). */
  away: boolean;
  block: number;
  waveUntil: number;
  waveCool: number;
  /** Banco ocupado (índice) e para onde a cabeça olha. */
  seat: number;
  look: number;
  /** Qual fala usar ao ser cumprimentado (varia). */
  line: number;
  talkUntil: number;
  smileUntil: number;
  /** Dentro de qual prédio está (some do lado de fora). */
  inside: ModuleId | null;
  /** Colete do time no jogo de futebol (cor). */
  bib?: string;
  /** Susto ao ser cumprimentado (sobrancelhas sobem, boca em "o"). */
  surpriseUntil: number;
}

export interface Town {
  /** Avança a simulação. `viewer` = onde o visitante está (reações de proximidade). */
  step: (dt: number, c: Conditions, viewer: { x: number; z: number }, now: number) => void;
  /** Figuras para desenhar, as mais próximas de `from`, até `max`. */
  visible: (from: { x: number; z: number }, max: number, range: number) => Figure[];
  /** Coloca todos direto no lugar da hora atual (ao mudar a hora na mão). */
  settle: (c: Conditions) => void;
  /** Quantos estão no campus agora e o que fazem (painel de opções). */
  census: () => { outside: number; total: number; byActivity: Partial<Record<Activity, number>> };
  nearest: (p: { x: number; z: number }, r: number) => { name: string; activity: Activity; x: number; z: number } | null;
  /** Quem está dentro de um prédio, com o que faz lá (estudar, trabalhar, treinar...). */
  insideOf: (id: ModuleId) => Array<{ figure: Figure; activity: Activity; key: number }>;
  /** Bolas dos jogos em andamento (tênis e futebol). */
  balls: () => Array<{ x: number; y: number; z: number; kind: 'tennis' | 'football' }>;
  /** Cumprimentar quem está perto: a pessoa olha, acena e responde. */
  greet: (p: { x: number; z: number }, r: number, now: number) => { name: string; activity: Activity; x: number; z: number; line: number; seed: number } | null;
  /** Chutes, raquetadas, apito e comemoração deste passo (para o som). */
  hits: () => Array<{ x: number; z: number; kind: 'kick' | 'racket' | 'whistle' | 'cheer' }>;
}

const WALK = 1.35;
const HAIRS = ['#2F2A26', '#5A3B24', '#8A5A2B', '#1B1B1B', '#C9A063', '#7A7A7A', '#3B2A20'];
const EYES = ['#4A3426', '#2E5A3A', '#3B5B8C', '#6B4E2E', '#2B2B2B'];

const SEATED: PersonPose[] = ['sit', 'read', 'play', 'draw'];

export function createTown(seats: Seat[] = []): Town {
  const taken = new Set<number>();
  /** Banco livre mais perto de um ponto (as pessoas sentam em bancos de verdade). */
  const takeSeat = (a: Agent, near: Point) => {
    if (a.seat >= 0) taken.delete(a.seat);
    a.seat = -1;
    if (!SEATED.includes(poseFor(a.activity, a.slot))) return near;
    let best = -1;
    let bd = 16;
    seats.forEach((st, i) => {
      const d = Math.hypot(st.x - near.x, st.z - near.z);
      if (d < bd && !taken.has(i)) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) return near;
    taken.add(best);
    a.seat = best;
    return { x: seats[best]!.x, z: seats[best]!.z };
  };
  const people = campusPeople();
  const groupSlot = new Map<number, number>();
  const agents: Agent[] = people.map((p) => {
    const slot = groupSlot.get(p.group) ?? 0;
    groupSlot.set(p.group, slot + 1);
    return { p, slot, x: p.home.x, z: p.home.z, yaw: 0, activity: 'home', route: [], ri: 0, pose: 'stand', phase: Math.random() * 6, away: true, block: -1, waveUntil: 0, waveCool: 0, seat: -1, look: 0, line: Math.floor(Math.random() * 3), talkUntil: 0, smileUntil: 0, inside: null, surpriseUntil: 0 };
  });

  const strollRoute = (a: Agent): Point[] => {
    // Passeio: ida e volta entre dois pontos de convivência, pelos caminhos.
    const targets = [[-78, 70], [0, -110], [110, 15], [5, 160], [-120, -10]].map(([x, z]) => ({ x: x! * PARK_SCALE, z: z! * PARK_SCALE }));
    const t = targets[(a.p.id + a.block) % targets.length]!;
    return routeBetween({ x: a.x, z: a.z }, t);
  };

  const plan = (a: Agent, c: Conditions, instant: boolean) => {
    const next = activityAt(a.p, c);
    a.block = Math.floor(c.hour);
    if (next === a.activity && next !== 'stroll' && a.route.length) return;
    const prev = a.activity;
    a.activity = next;
    a.ri = 0;
    a.inside = null;
    if (instant) {
      if (next === 'home') {
        a.away = true;
        a.x = a.p.home.x;
        a.z = a.p.home.z;
        a.route = [];
        return;
      }
      const s = next === 'stroll' ? strollRoute(a)[0]! : takeSeat(a, spotFor(a.p, next, c, a.slot));
      a.x = s.x;
      a.z = s.z;
      a.away = false;
      a.inside = indoorOf(a.p, next, c);
      a.route = next === 'stroll' ? strollRoute(a) : [s];
      a.ri = a.route.length - 1;
      return;
    }
    const here = { x: a.x, z: a.z };
    if (a.seat >= 0) taken.delete(a.seat);
    a.seat = -1;
    if (next === 'home') a.route = a.away ? [] : routeHome(here, a.p.home, true);
    else {
      const dest = next === 'stroll' ? null : takeSeat(a, spotFor(a.p, next, c, a.slot));
      const go = dest ? (a.away || prev === 'home' ? routeHome(dest, a.p.home, false) : routeBetween(here, dest)) : a.away ? routeHome(strollRoute(a).at(-1)!, a.p.home, false) : strollRoute(a);
      a.route = go;
      if (a.away) {
        a.x = a.p.home.x;
        a.z = a.p.home.z;
      }
      a.away = false;
    }
  };

  const settle = (c: Conditions) => agents.forEach((a) => plan(a, c, true));

  const step = (dt: number, c: Conditions, viewer: { x: number; z: number }, now: number) => {
    for (const a of agents) {
      if (Math.floor(c.hour) !== a.block && (c.hour * 60) % 60 >= (a.p.id % 12) * 2) plan(a, c, false);
      if (a.away && a.activity === 'home') continue;
      // Dentro de um prédio: aparece lá dentro (quando o visitante entra), não do lado de fora.
      if (a.inside) continue;
      // Jogando nas quadras: quem comanda a posição é o jogo (abaixo), não a rota.
      if (a.activity === 'sport' && a.ri >= a.route.length - 1 && (near(a, SPORT_FIELDS.tennis, 8) || near(a, SPORT_FIELDS.football, 10)) && now >= a.talkUntil) continue;
      // Cumprimentada: para o que estava fazendo, vira para o visitante, acena e fala.
      if (now < a.talkUntil) {
        if (a.seat < 0) a.yaw = Math.atan2(viewer.x - a.x, viewer.z - a.z);
        a.look = 0;
        a.pose = SEATED.includes(a.pose) ? a.pose : 'wave';
        a.phase += dt * 2;
        continue;
      }
      const target = a.route[a.ri];
      if (target && (a.ri < a.route.length - 1 || Math.hypot(target.x - a.x, target.z - a.z) > 0.3)) {
        const dx = target.x - a.x;
        const dz = target.z - a.z;
        const d = Math.hypot(dx, dz);
        // Dá passagem ao visitante: desacelera se ele estiver logo à frente.
        const block = Math.hypot(viewer.x - a.x, viewer.z - a.z) < 1.4 ? 0.25 : 1;
        const sp = WALK * (a.activity === 'sport' && a.ri > 0 ? 1.6 : 1) * block;
        if (d < sp * dt + 0.05) {
          a.x = target.x;
          a.z = target.z;
          if (a.ri < a.route.length - 1) a.ri++;
          else if (a.activity === 'stroll') {
            a.route = strollRoute(a);
            a.ri = 0;
          } else if (a.activity === 'home') a.away = true;
          else a.inside = indoorOf(a.p, a.activity, conditionsRef);
        } else {
          a.x += (dx / d) * sp * dt;
          a.z += (dz / d) * sp * dt;
          const want = Math.atan2(dx, dz);
          let dy = want - a.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          a.yaw += dy * Math.min(1, dt * 6);
        }
        a.pose = 'walk';
        a.phase += dt * sp * 4.2;
        continue;
      }
      // Parado na atividade (sentado só se achou banco; senão, em pé).
      const want = poseFor(a.activity, a.slot);
      a.pose = SEATED.includes(want) && a.seat < 0 ? (want === 'sit' ? 'stand' : want === 'draw' ? 'photo' : 'stand') : want;
      if (a.seat >= 0) a.yaw = seats[a.seat]!.face;
      a.phase += dt * 2;
      const dv = Math.hypot(viewer.x - a.x, viewer.z - a.z);
      // Quem está perto vira a cabeça para o visitante (cada um com seu jeito: alguns nem olham).
      let lookTo = 0;
      if (dv < 6 && a.p.id % 3 !== 0) {
        const d = Math.atan2(viewer.x - a.x, viewer.z - a.z) - a.yaw;
        lookTo = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(d), Math.cos(d))));
      }
      a.look += (lookTo - a.look) * Math.min(1, dt * 4);
      if (dv < 4.5 && now > a.waveCool && a.p.id % 2 === 0 && (a.pose === 'stand' || a.pose === 'sit')) {

        // Reação de proximidade: olha e acena para quem chega perto (no máximo a cada 40 s).
        a.waveUntil = now + 2200;
        a.waveCool = now + 40000;
      }
      if (now < a.waveUntil) {
        if (a.seat < 0) {
          a.yaw = Math.atan2(viewer.x - a.x, viewer.z - a.z);
          a.look = 0;
        }
        if (a.pose === 'stand' || a.pose === 'photo') a.pose = 'wave';
      } else if (a.activity === 'chat' || a.activity === 'music') {
        // Em roda: virados para o centro do grupo.
        const s = spotFor(a.p, a.activity, { ...conditionsRef, hour: a.block + 0.5 }, 0);
        if (a.slot > 0) a.yaw = Math.atan2(s.x - a.x, s.z - a.z);
      }
    }
  };

  /* ---------- Jogos nas quadras externas (tênis e futebol, V2.1 11.13) ---------- */
  let ballList: ReturnType<Town['balls']> = [];
  const moveTo = (a: Agent, tx: number, tz: number, sp: number, dt: number) => {
    const dx = tx - a.x;
    const dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    const st = Math.min(d, sp * dt);
    if (d > 0.01) {
      a.x += (dx / d) * st;
      a.z += (dz / d) * st;
    }
    return dt > 0 ? st / dt : 0;
  };
  const near = (a: Agent, f: { x: number; z: number; w: number; d: number }, pad: number) => Math.abs(a.x - f.x) < f.w / 2 + pad && Math.abs(a.z - f.z) < f.d / 2 + pad;
  /** Batidas e chutes que soaram neste passo (o motor toca o som se estiver perto). */
  let hits: Array<{ x: number; z: number; kind: 'kick' | 'racket' | 'whistle' | 'cheer' }> = [];
  // Futebol: quem está com a bola, a bola no ar (de onde, para onde, quanto tempo), chute a gol e comemoração.
  const fb = { owner: -1, holdUntil: 0, fx: 0, fz: 0, tx: 0, tz: 0, t0: 0, dur: 0, shot: false, target: -1, kicker: -1, kickUntil: 0, cheer: -1, cheerUntil: 0, resetAt: 0 };
  const hash = (n: number) => {
    const v = Math.sin(n * 91.345) * 43758.5453;
    return v - Math.floor(v);
  };
  const games = (dt: number, now: number) => {
    const t = now / 1000;
    ballList = [];
    hits = [];
    for (const a of agents) a.bib = undefined;
    const ready = agents.filter((a) => a.activity === 'sport' && !a.away && a.ri >= a.route.length - 1 && now >= a.talkUntil).sort((u, v) => u.p.id - v.p.id);
    const T = SPORT_FIELDS.tennis;
    const tennis = ready.filter((a) => near(a, T, 8)).slice(0, 4);
    if (tennis.length >= 2) {
      // Rally: a bola cruza a rede em arco, quica na quadra do outro lado e chega na raquete;
      // quem recebe prepara o golpe e bate na hora certa.
      const per = 1.4;
      const u = (t / per) % 2;
      const dir = u < 1 ? 1 : -1;
      const k = u % 1;
      const x0 = T.x - 10.5;
      const bx = dir > 0 ? x0 + 21 * k : x0 + 21 * (1 - k);
      const bz = T.z + Math.sin(t * 0.9) * 3.2;
      const y = k < 0.68 ? Math.sin((Math.PI * k) / 0.68) * 2.2 : Math.sin((Math.PI * (k - 0.68)) / 0.32) * 0.9;
      ballList.push({ x: bx, y: heightAt(T.x, T.z) + 0.3 + y, z: bz, kind: 'tennis' });
      const prevK = ((t - dt) / per) % 1;
      if (prevK > k) hits.push({ x: bx, z: bz, kind: 'racket' });
      tennis.forEach((a, i) => {
        const side = i % 2 ? 1 : -1;
        const tx = T.x + side * (i >= 2 ? 6.5 : 11.6);
        const tz = T.z + (bz - T.z) * 0.8 + (i >= 2 ? 1.8 : 0) * side;
        const sp = moveTo(a, tx, tz, 5, dt);
        a.yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        // Golpe: quem recebe (a bola vem para o seu lado) leva a raquete atrás e bate no fim do quique.
        const incoming = (dir > 0 && side > 0) || (dir < 0 && side < 0);
        const mine = i < 2 || Math.abs(bz - a.z) < 2.5;
        const v = incoming && mine ? (k > 0.75 ? -0.9 + ((k - 0.75) / 0.25) * 1.9 : -0.9) : k < 0.15 && mine ? 1 - k * 8 : -0.5;
        a.pose = sp > 1.5 ? 'run' : ('tennis' as PersonPose);
        a.phase = a.pose === 'run' ? a.phase + dt * 9 : Math.asin(Math.max(-1, Math.min(1, v))) / 1.3;
        a.look = 0;
        a.bib = undefined;
      });
    }
    const F = SPORT_FIELDS.football;
    const foot = ready.filter((a) => near(a, F, 10)).slice(0, 12);
    if (foot.length >= 3) {
      const ground = heightAt(F.x, F.z);
      const goalX = (team: number) => F.x + (team === 0 ? 31 : -31);
      const team = (i: number) => (i < 2 ? i : i % 2);
      foot.forEach((a, i) => (a.bib = i < 2 ? (i === 0 ? '#F59E0B' : '#22C55E') : team(i) === 0 ? '#E11D48' : '#2563EB'));
      if (fb.owner >= foot.length || fb.target >= foot.length) fb.owner = fb.target = -1;
      // Bola: no ar (passe ou chute), no pé de alguém ou parada no meio depois do gol.
      let bx: number;
      let bz: number;
      let by = 0;
      const flying = now < fb.t0 + fb.dur;
      if (now < fb.resetAt) {
        bx = F.x;
        bz = F.z;
      } else if (flying) {
        const k = (now - fb.t0) / fb.dur;
        bx = fb.fx + (fb.tx - fb.fx) * k;
        bz = fb.fz + (fb.tz - fb.fz) * k;
        const len = Math.hypot(fb.tx - fb.fx, fb.tz - fb.fz);
        by = Math.sin(Math.PI * k) * (fb.shot ? 0.9 : len > 14 ? 2.2 : 0.25);
      } else if (fb.dur > 0) {
        // Chegou: gol, defesa do goleiro ou domínio de quem recebeu.
        bx = fb.tx;
        bz = fb.tz;
        if (fb.shot) {
          const keeper = foot[fb.tx > F.x ? 1 : 0];
          const saved = keeper && Math.hypot(keeper.x - bx, keeper.z - bz) < 1.6;
          if (!saved && Math.abs(bz - F.z) < 3.6) {
            fb.cheer = fb.kicker;
            fb.cheerUntil = now + 2600;
            fb.resetAt = now + 2600;
            fb.owner = -1;
            hits.push({ x: bx, z: bz, kind: 'cheer' });
          } else fb.owner = fb.tx > F.x ? 1 : 0;
        } else fb.owner = fb.target;
        fb.dur = 0;
        fb.shot = false;
        fb.holdUntil = now + 900 + hash(now) * 1600;
      } else {
        const o = foot[fb.owner];
        if (!o) {
          // Saída de bola: o mais perto do meio começa com ela.
          fb.owner = foot.length > 2 ? 2 : 0;
          fb.holdUntil = now + 1200;
          if (now >= fb.resetAt && fb.resetAt > 0) {
            hits.push({ x: F.x, z: F.z, kind: 'whistle' });
            fb.resetAt = 0;
          }
        }
        const own = foot[fb.owner]!;
        bx = own.x + Math.sin(own.yaw) * 0.6;
        bz = own.z + Math.cos(own.yaw) * 0.6;
        // Decide: chute a gol perto da área, senão passe para um companheiro (de preferência à frente).
        if (now > fb.holdUntil) {
          const tm = team(fb.owner);
          const gx = goalX(tm);
          const mates = foot.map((p, i) => ({ p, i })).filter((m) => m.i !== fb.owner && team(m.i) === tm && m.i >= 2);
          const shoot = fb.owner >= 2 && Math.abs(gx - own.x) < 20 && hash(now * 1.3) < 0.55;
          fb.fx = bx;
          fb.fz = bz;
          fb.t0 = now;
          fb.kicker = fb.owner;
          fb.kickUntil = now + 380;
          if (shoot || !mates.length) {
            fb.shot = true;
            fb.tx = gx;
            fb.tz = F.z + (hash(now * 2.1) - 0.5) * 9;
            fb.dur = 900;
          } else {
            const ahead = mates.sort((u, v) => (u.p.x - v.p.x) * (tm === 0 ? -1 : 1) + hash(u.i + now) * 6 - hash(v.i + now) * 6)[0]!;
            fb.target = ahead.i;
            fb.tx = ahead.p.x;
            fb.tz = ahead.p.z;
            fb.dur = Math.max(450, Math.hypot(fb.tx - bx, fb.tz - bz) * 75);
          }
          fb.owner = -1;
          hits.push({ x: bx, z: bz, kind: 'kick' });
        }
      }
      ballList.push({ x: bx, y: ground + 0.22 + by, z: bz, kind: 'football' });
      // Jogadores: goleiros na linha acompanhando a bola; quem tem a bola conduz para o gol;
      // o mais perto do outro time marca; os demais se espalham em formação acompanhando a jogada.
      const chaser = [0, 1].map((tm) => foot.map((p, i) => ({ p, i })).filter((m) => m.i >= 2 && team(m.i) === tm && m.i !== fb.owner).sort((u, v) => Math.hypot(u.p.x - bx, u.p.z - bz) - Math.hypot(v.p.x - bx, v.p.z - bz))[0]?.i ?? -1);
      foot.forEach((a, i) => {
        let tx: number;
        let tz: number;
        let speed = 5.5;
        if (now < fb.cheerUntil && (i === fb.cheer || (i >= 2 && fb.cheer >= 0 && team(i) === team(fb.cheer)))) {
          const c = foot[fb.cheer]!;
          tx = i === fb.cheer ? c.x : c.x + Math.cos(i * 2.4) * 1.4;
          tz = i === fb.cheer ? c.z : c.z + Math.sin(i * 2.4) * 1.4;
          moveTo(a, tx, tz, 4, dt);
          a.pose = 'cheer';
          a.phase += dt * 5;
          a.look = 0;
          return;
        }
        if (i < 2) {
          tx = F.x + (i === 0 ? -30.5 : 30.5);
          tz = F.z + Math.max(-3.5, Math.min(3.5, (bz - F.z) * 0.6));
          speed = 4;
        } else if (i === fb.owner) {
          const gx = goalX(team(i));
          tx = a.x + Math.sign(gx - a.x) * 3;
          tz = a.z + (F.z - a.z) * 0.2 + Math.sin(t * 1.7 + i) * 1.5;
          speed = 4.2;
        } else if (chaser[team(i) === 0 ? 1 : 0] === i || (fb.target === i && fb.dur > 0)) {
          tx = fb.target === i && fb.dur > 0 ? fb.tx : bx;
          tz = fb.target === i && fb.dur > 0 ? fb.tz : bz;
          speed = 6.5;
        } else {
          const tm = team(i);
          const row = Math.floor((i - 2) / 2);
          const lane = ((row % 3) - 1) * 9;
          const depth = (row < 3 ? -8 : 8) * (tm === 0 ? 1 : -1);
          tx = Math.max(F.x - 28, Math.min(F.x + 28, bx * 0.6 + F.x * 0.4 + depth));
          tz = F.z + lane + Math.sin(t * 0.5 + i) * 2;
        }
        const sp = moveTo(a, tx, tz, speed, dt);
        a.yaw = i === fb.owner ? Math.atan2(tx - a.x, tz - a.z) : Math.atan2(bx - a.x, bz - a.z);
        a.pose = i === fb.kicker && now < fb.kickUntil ? 'kick' : i < 2 ? 'keeper' : sp > 3.2 ? 'run' : sp > 0.4 ? 'walk' : 'stand';
        a.phase = a.pose === 'kick' ? ((now - (fb.kickUntil - 380)) / 380) * Math.PI : a.phase + dt * Math.max(2, sp * (a.pose === 'run' ? 2.6 : 2.2));
        a.look = 0;
      });
    }
  };

  let conditionsRef: Conditions = { hour: 12, day: 0, rain: 0, fog: 0, wind: 0, season: 'summer' };
  const wrappedStep: Town['step'] = (dt, c, viewer, now) => {
    conditionsRef = c;
    step(dt, c, viewer, now);
    games(dt, now);
  };

  /**
   * Rosto de cada um: espanto no instante do cumprimento, depois fala e sorri; na roda de conversa
   * alterna falar, sorrir e rir; comemorando gol, ri; sozinho, de vez em quando um sorriso.
   */
  const exprOf = (a: Agent): Expr => {
    const now = performance.now();
    if (now < a.surpriseUntil) return 'surprised';
    if (now < a.talkUntil) return 'talk';
    if (now < a.smileUntil) return 'smile';
    if (a.pose === 'cheer') return 'laugh';
    if ((a.activity === 'chat' || a.activity === 'picnic' || a.activity === 'cafe') && a.pose !== 'walk') {
      const k = Math.floor(now / 2300 + a.slot * 1.7) % 5;
      return k === 0 || k === 3 ? 'talk' : k === 1 ? 'laugh' : 'smile';
    }
    if (a.pose === 'run' || a.pose === 'keeper' || a.pose === 'kick') return 'neutral';
    return Math.floor(now / 6000 + a.p.id) % 4 === 0 ? 'smile' : 'neutral';
  };
  const visible = (from: { x: number; z: number }, max: number, range: number): Figure[] =>
    agents
      .filter((a) => !(a.away && a.activity === 'home') && !a.inside)
      .map((a) => ({ a, d: Math.hypot(a.x - from.x, a.z - from.z) }))
      .filter((o) => o.d < range)
      .sort((u, v) => u.d - v.d)
      .slice(0, max)
      .map(({ a }) => {
        const st = a.seat >= 0 && SEATED.includes(a.pose) ? seats[a.seat] : undefined;
        return {
          x: a.x,
          y: st ? st.y - 0.44 : heightAt(a.x, a.z),
          look: a.pose === 'walk' ? 0 : a.look,
          z: a.z,
          yaw: a.yaw,
          pose: a.pose,
          phase: a.phase,
          stride: a.pose === 'walk' ? 1 : 0,
          ...styleOf(a.p.id),
          // No futebol, colete do time por cima da roupa (e roupa esportiva).
          ...(a.bib ? { outfit: 'sport' as const, accent: '#FFFFFF', shortSleeves: true, shorts: true, hat: 0, bag: false } : {}),
          shirt: a.bib ?? a.p.shirt,
          pants: a.bib ? '#1F2937' : a.p.pants,
          skin: a.p.skin,
          hair: HAIRS[a.p.id % HAIRS.length],
          hairStyle: (a.p.id * 7) % 4,
          eyes: EYES[(a.p.id * 5) % EYES.length],
          seed: a.p.id,
          expr: exprOf(a),
          scale: a.p.scale,
        };
      });

  return {
    step: wrappedStep,
    visible,
    settle,
    census: () => {
      const by: Partial<Record<Activity, number>> = {};
      let outside = 0;
      for (const a of agents) {
        if (a.away && a.activity === 'home') continue;
        outside++;
        by[a.activity] = (by[a.activity] ?? 0) + 1;
      }
      return { outside, total: agents.length, byActivity: by };
    },
    balls: () => ballList,
    hits: () => hits,
    insideOf: (id) =>
      agents
        .filter((a) => a.inside === id)
        .map((a) => ({
          key: a.p.id,
          activity: a.activity,
          figure: {
            x: 0,
            y: 0,
            z: 0,
            yaw: 0,
            pose: 'stand' as const,
            phase: (performance.now() / 1000) * 2 + a.p.id,
            stride: 0,
            ...styleOf(a.p.id),
            shirt: a.p.shirt,
            pants: a.p.pants,
            skin: a.p.skin,
            hair: HAIRS[a.p.id % HAIRS.length],
            hairStyle: (a.p.id * 7) % 4,
            eyes: EYES[(a.p.id * 5) % EYES.length],
            seed: a.p.id,
            expr: (Math.floor(performance.now() / 4000 + a.p.id) % 5 === 0 ? 'smile' : 'neutral') as Expr,
            scale: a.p.scale,
          },
        })),
    greet: (p, r, now) => {
      let best: Agent | null = null;
      let bd = r;
      for (const a of agents) {
        if (a.away) continue;
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      if (!best) return null;
      best.waveUntil = now + 3200;
      best.waveCool = now + 3200;
      best.surpriseUntil = now + 450;
      best.talkUntil = now + 2300;
      best.smileUntil = now + 5200;
      best.line = (best.line + 1) % 3;
      return { name: best.p.name, activity: best.activity, x: best.x, z: best.z, line: best.line, seed: best.p.id };
    },
    nearest: (p, r) => {
      let best: Agent | null = null;
      let bd = r;
      for (const a of agents) {
        if (a.away) continue;
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      return best ? { name: best.p.name, activity: best.activity, x: best.x, z: best.z } : null;
    },
  };
}
