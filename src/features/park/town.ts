/**
 * Vida do campus em movimento: os 64 moradores andando pelas rotas, parando nas atividades,
 * reagindo a quem chega perto (olham e acenam) e voltando para casa. Só os mais próximos da
 * câmera são desenhados (limite por aparelho e modo gráfico).
 */
import { activityAt, campusPeople, poseFor, routeBetween, routeHome, spotFor, type Activity, type Conditions, type Person, type PersonPose } from '@/domain/parkPeople';
import { PARK_SCALE, heightAt, type Point } from '@/domain/park';
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
  /** Cumprimentar quem está perto: a pessoa olha, acena e responde. */
  greet: (p: { x: number; z: number }, r: number, now: number) => { name: string; activity: Activity; x: number; z: number; line: number } | null;
}

const WALK = 1.35;
const HAIRS = ['#2F2A26', '#5A3B24', '#8A5A2B', '#1B1B1B', '#C9A063', '#7A7A7A', '#3B2A20'];

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
    return { p, slot, x: p.home.x, z: p.home.z, yaw: 0, activity: 'home', route: [], ri: 0, pose: 'stand', phase: Math.random() * 6, away: true, block: -1, waveUntil: 0, waveCool: 0, seat: -1, look: 0, line: Math.floor(Math.random() * 3) };
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

  let conditionsRef: Conditions = { hour: 12, day: 0, rain: 0, fog: 0, wind: 0, season: 'summer' };
  const wrappedStep: Town['step'] = (dt, c, viewer, now) => {
    conditionsRef = c;
    step(dt, c, viewer, now);
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
