/**
 * Vida do campus em movimento: os 64 moradores andando pelas rotas, parando nas atividades,
 * reagindo a quem chega perto (olham e acenam) e voltando para casa. Só os mais próximos da
 * câmera são desenhados (limite por aparelho e modo gráfico).
 */
import { activityAt, campusPeople, poseFor, routeBetween, routeHome, spotFor, type Activity, type Conditions, type Person, type PersonPose } from '@/domain/parkPeople';
import { PARK_SCALE, SPORT_FIELDS, heightAt, type Point } from '@/domain/park';
import type { Figure } from './people';
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
  /** Bolas dos jogos em andamento (tênis e futebol). */
  balls: () => Array<{ x: number; y: number; z: number; kind: 'tennis' | 'football' }>;
  /** Cumprimentar quem está perto: a pessoa olha, acena e responde. */
  greet: (p: { x: number; z: number }, r: number, now: number) => { name: string; activity: Activity; x: number; z: number; line: number } | null;
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
    return { p, slot, x: p.home.x, z: p.home.z, yaw: 0, activity: 'home', route: [], ri: 0, pose: 'stand', phase: Math.random() * 6, away: true, block: -1, waveUntil: 0, waveCool: 0, seat: -1, look: 0, line: Math.floor(Math.random() * 3), talkUntil: 0, smileUntil: 0 };
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
  const games = (dt: number, now: number) => {
    const t = now / 1000;
    ballList = [];
    const ready = agents.filter((a) => a.activity === 'sport' && !a.away && a.ri >= a.route.length - 1 && now >= a.talkUntil).sort((u, v) => u.p.id - v.p.id);
    const T = SPORT_FIELDS.tennis;
    const tennis = ready.filter((a) => near(a, T, 8)).slice(0, 4);
    if (tennis.length >= 2) {
      // Bola indo e voltando por cima da rede, em arco; jogadores acompanham a bola de lado.
      const u = (t / 1.3) % 2;
      const k = u < 1 ? u : 2 - u;
      const bx = T.x - 10.5 + 21 * k;
      const bz = T.z + Math.sin(t * 0.9) * 3.2;
      const arc = Math.sin(Math.PI * (u % 1));
      ballList.push({ x: bx, y: heightAt(T.x, T.z) + 0.35 + arc * 2.1, z: bz, kind: 'tennis' });
      tennis.forEach((a, i) => {
        const side = i % 2 ? 1 : -1;
        const tx = T.x + side * (i >= 2 ? 6.5 : 11.6);
        const tz = T.z + (bz - T.z) * 0.8 + (i >= 2 ? 1.8 : 0) * side;
        moveTo(a, tx, tz, 5, dt);
        a.yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        a.pose = 'tennis' as PersonPose;
        a.phase += dt * 4.8;
        a.look = 0;
      });
    }
    const F = SPORT_FIELDS.football;
    const foot = ready.filter((a) => near(a, F, 10)).slice(0, 12);
    if (foot.length >= 2) {
      // Bola rolando pelo campo; dois goleiros, o resto disputa e se espalha em volta.
      const bx = F.x + Math.sin(t * 0.31) * 25 + Math.sin(t * 0.83) * 5;
      const bz = F.z + Math.sin(t * 0.47 + 1) * 14;
      ballList.push({ x: bx, y: heightAt(F.x, F.z) + 0.22, z: bz, kind: 'football' });
      foot.forEach((a, i) => {
        let tx: number;
        let tz: number;
        if (i < 2) {
          const side = i === 0 ? -1 : 1;
          tx = F.x + side * 30.5;
          tz = F.z + Math.max(-3.5, Math.min(3.5, (bz - F.z) * 0.4));
        } else {
          const ang = i * 2.4 + t * 0.25;
          const rr = i < 4 ? 1.2 : 4 + (i % 4) * 3.2;
          tx = bx + Math.cos(ang) * rr;
          tz = bz + Math.sin(ang) * rr * 0.7;
        }
        const sp = moveTo(a, tx, tz, i < 2 ? 3 : 5.5, dt);
        a.yaw = Math.atan2(bx - a.x, bz - a.z);
        a.pose = sp > 0.4 ? 'walk' : 'stand';
        a.phase += dt * Math.max(2, sp * 2.2);
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

  const visible = (from: { x: number; z: number }, max: number, range: number): Figure[] =>
    agents
      .filter((a) => !(a.away && a.activity === 'home'))
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
          shirt: a.p.shirt,
          pants: a.p.pants,
          skin: a.p.skin,
          hair: HAIRS[a.p.id % HAIRS.length],
          hairStyle: (a.p.id * 7) % 4,
          eyes: EYES[(a.p.id * 5) % EYES.length],
          shortSleeves: a.p.id % 2 === 0,
          shorts: a.p.id % 3 === 0,
          seed: a.p.id,
          // Rosto: fala logo depois do cumprimento e sorri; na roda de conversa, fala e ri por vezes.
          expr: performance.now() < a.talkUntil ? 'talk' : performance.now() < a.smileUntil ? 'smile' : a.activity === 'chat' && a.pose !== 'walk' ? (Math.floor(performance.now() / 2500 + a.slot) % 3 === 0 ? 'talk' : 'smile') : 'neutral',
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
      best.talkUntil = now + 1900;
      best.smileUntil = now + 4500;
      best.line = (best.line + 1) % 3;
      return { name: best.p.name, activity: best.activity, x: best.x, z: best.z, line: best.line };
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
