/**
 * Térreo por fora, pela volumetria do prédio (massing.ts): a mesma planta do interior. Base de
 * pedra sob cada volume, paredes por trecho no tipo da fachada do prédio (faixas por galeria no
 * pé-direito alto; parede acima da cobertura de uma ala mais baixa), a fachada envidraçada da
 * entrada em x = 0 (onde a porta de correr encosta), luz das salas por trás do vidro à noite e a
 * cobertura de cada volume que só tem o térreo (com parapeito e, quando pedido, claraboias). Os
 * andares de cima ficam em upper.ts, com a mesma planta.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import type { Builder, Kit } from '../kit';
import { FORMS, alongGeo, facadeMats, volGeo, volSlab, wallsAlong } from '../forms';
import { MASSING, groundHeight, groundSpan, volsAt } from '../massing';
import { entranceRun, exitAt, inVol, tallerInside, wallRuns, type Vol, type WallRun } from '../outline';

export interface Shell {
  /** Pé-direito do térreo (o 1º andar começa aqui). */
  H: number;
  /** Fachada da frente e dos fundos em x = 0, e o raio que cobre a planta. */
  front: number;
  back: number;
  bound: number;
  /** Altura para o `top` do prédio: o mundo põe o 1º andar em `top − 2` (= H). */
  top: number;
  /**
   * `core` do prédio para o mundo: ele põe a torre do elevador a max(0,82 · core, parede) + 2,8 m do
   * centro; com core = fundos ÷ 0,82, a torre fica onde o interior a põe (liftDist, massing.ts).
   */
  core: number;
  /** Volumes do térreo e as paredes (para os detalhes de cada prédio). */
  vols: Vol[];
  runs: WallRun[];
  /** Entrada em x = 0: z da fachada, altura do volume dela e altura da fachada envidraçada. */
  door: { z: number; top: number; glass: number };
}

export interface ShellOpts {
  /** Cor da base de pedra. */
  base?: string;
  /** Cor da cobertura das alas térreas. */
  roof?: string;
  /** Claraboias nas coberturas das alas térreas (estufa, ateliê). */
  skylights?: boolean;
  /** Cor da luz das salas vista de fora. */
  glow?: string;
  /** Marquise sobre a entrada: quanto avança (m). */
  canopy?: number;
  /** Cor da marquise. */
  canopyColor?: string;
}

/** Desenha o térreo do prédio `id` em `b` (coordenadas locais do prédio). */
export function groundShell(kit: Kit, b: Builder, id: ModuleId, o: ShellOpts = {}): Shell {
  const M = MASSING[id];
  const form = FORMS[id];
  const fm = facadeMats(kit, form);
  const g = volsAt(id, 0);
  const H = M.ground;
  const span = groundSpan(id);
  const hOf = (i: number) => groundHeight(id, g[i]!);
  const runs = wallRuns(g, 1, hOf);
  const base = kit.mat(o.base ?? '#DCD6C8', { rough: 0.85 });
  const roof = kit.mat(o.roof ?? '#E9ECEF', { rough: 0.7 });
  const warm = kit.mat(o.glow ?? '#FFE9C2', { glow: true, rough: 0.9 });
  // Base de pedra sob cada volume (vence o desnível do terreno) e o piso.
  for (const v of g) b.add(base, volSlab(v, 0.05, 0.9, [], 0.35));
  // Luz das salas por trás do vidro (só o miolo de cada volume, baixo o bastante para não aparecer no teto).
  g.forEach((v, i) => b.add(warm, volGeo(v, 1.2, Math.min(hOf(i) - 0.8, 4.2), true), [0, 0.3, 0]));
  // Paredes no tipo da fachada; na frente, em x = 0, a fachada envidraçada da entrada (a porta de
  // correr de doors.ts encosta nela).
  wallsAlong(b, form, fm, runs, hOf, M.entry, { glass: kit.mat('#9BE7F5', { glass: true }), dark: kit.mat('#2B3442', { metal: 0.6, rough: 0.35 }) });
  // Cobertura de cada volume que só tem o térreo: laje, parapeito nas bordas livres e claraboias.
  const sky = kit.mat('#CDEFFB', { glass: true, side: THREE.DoubleSide });
  const frame = kit.mat('#9AA6B5', { metal: 0.8, rough: 0.3 });
  g.forEach((v, i) => {
    if (v.hi !== 0) return;
    const h = hOf(i);
    b.add(roof, volSlab(v, h, 0.35, tallerInside(g, i, hOf), 0.15));
    for (const r of runs) {
      if (r.vol !== i) continue;
      const p = alongGeo(r, h, 0.55, 0.25, 0.05, r.nx, r.nz);
      b.add(roof, p.geo, p.pos, p.rot);
    }
    if (o.skylights) b.add(sky, volGeo(v, Math.max(1.5, (v.kind === 'rect' ? Math.min(v.w, v.d) : v.r * 2) * 0.3), 0.5), [0, h, 0]);
    // A claraboia redonda sobre o centro, a mesma de dentro (Focus, Habits).
    if (M.sky && inVol(v, 0, 0, 1)) {
      const r = Math.min(M.sky, ...[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => exitAt([v], a, 0) - 1.5));
      if (r > 1) {
        b.add(frame, new THREE.CylinderGeometry(r + 0.1, r + 0.1, 0.6, 48, 1, true), [0, h + 0.3, 0]);
        b.add(sky, new THREE.CircleGeometry(r, 48), [0, h + 0.6, 0], [-Math.PI / 2, 0, 0]);
      }
    }
  });
  // Marquise sobre a fachada envidraçada da entrada, com a faixa de luz na borda.
  const ent = entranceRun(runs);
  const entTop = ent ? hOf(ent.vol) : H;
  const glassH = Math.min(5.2, entTop - 0.6);
  if (o.canopy && ent) {
    const w = Math.min(M.entry + 2, ent.len);
    b.add(kit.mat(o.canopyColor ?? '#CBD5E1', { metal: 0.6, rough: 0.35 }), new THREE.BoxGeometry(w, 0.3, o.canopy), [0, glassH + 0.45, span.front + o.canopy / 2]);
    b.add(kit.mat(o.glow ?? '#FFE9C2', { glow: true }), new THREE.BoxGeometry(w - 0.2, 0.06, 0.1), [0, glassH + 0.32, span.front + o.canopy - 0.05]);
  }
  return { H, front: span.front, back: span.back, bound: span.bound, top: H + 2, core: span.back / 0.82, vols: g, runs, door: { z: span.front, top: entTop, glass: glassH } };
}

/**
 * Onde vai o letreiro de `h` m de altura na fachada da entrada: acima da fachada envidraçada, se
 * cabe na parede; senão, sobre a cobertura do volume da entrada.
 */
export function signSpot(s: Shell, h: number): { y: number; z: number } {
  if (s.door.top - s.door.glass - 0.3 >= h + 0.2) return { y: s.door.glass + 0.35 + h / 2 + 0.1, z: s.door.z + 0.22 };
  return { y: s.door.top + 0.6 + h / 2, z: s.door.z + 0.1 };
}
