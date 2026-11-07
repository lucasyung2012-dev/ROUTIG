/**
 * Vida do campus em movimento: os 64 moradores andando pelas rotas, parando nas atividades,
 * reagindo a quem chega perto (olham e acenam) e voltando para casa. Só os mais próximos da
 * câmera são desenhados (limite por aparelho e modo gráfico).
 */
import { activityAt, campusPeople, poseFor, routeBetween, routeHome, spotFor, type Activity, type Conditions, type Person, type PersonPose } from '@/domain/parkPeople';
import { heightAt, type Point } from '@/domain/park';
import type { Figure } from './people';

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
}

const WALK = 1.35;

export function createTown(): Town {
  const people = campusPeople();
  const groupSlot = new Map<number, number>();
  const agents: Agent[] = people.map((p) => {
    const slot = groupSlot.get(p.group) ?? 0;
    groupSlot.set(p.group, slot + 1);
    return { p, slot, x: p.home.x, z: p.home.z, yaw: 0, activity: 'home', route: [], ri: 0, pose: 'stand', phase: Math.random() * 6, away: true, block: -1, waveUntil: 0, waveCool: 0 };
  });

  const strollRoute = (a: Agent): Point[] => {
    // Passeio: ida e volta entre dois pontos de convivência, pelos caminhos.
    const targets = [{ x: -78, z: 70 }, { x: 0, z: -110 }, { x: 110, z: 15 }, { x: 5, z: 160 }, { x: -120, z: -10 }];
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
      const s = next === 'stroll' ? strollRoute(a)[0]! : spotFor(a.p, next, c, a.slot);
      a.x = s.x;
      a.z = s.z;
      a.away = false;
      a.route = next === 'stroll' ? strollRoute(a) : [s];
      a.ri = a.route.length - 1;
      return;
    }
    const here = { x: a.x, z: a.z };
    if (next === 'home') a.route = a.away ? [] : routeHome(here, a.p.home, true);
    else {
      const dest = next === 'stroll' ? null : spotFor(a.p, next, c, a.slot);
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
      // Parado na atividade.
      a.pose = poseFor(a.activity, a.slot);
      a.phase += dt * 2;
      const dv = Math.hypot(viewer.x - a.x, viewer.z - a.z);
      if (dv < 4.5 && now > a.waveCool && (a.pose === 'stand' || a.pose === 'sit')) {
        // Reação de proximidade: olha e acena para quem chega perto (no máximo a cada 40 s).
        a.waveUntil = now + 2200;
        a.waveCool = now + 40000;
      }
      if (now < a.waveUntil) {
        a.yaw = Math.atan2(viewer.x - a.x, viewer.z - a.z);
        if (a.pose === 'stand') a.pose = 'wave';
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
        const seated = a.pose === 'sit' || a.pose === 'read' || a.pose === 'play';
        return {
          x: a.x,
          y: heightAt(a.x, a.z) + (seated ? 0.0 : 0),
          z: a.z,
          yaw: a.yaw,
          pose: a.pose,
          phase: a.phase,
          stride: a.pose === 'walk' ? 1 : 0,
          shirt: a.p.shirt,
          pants: a.p.pants,
          skin: a.p.skin,
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
