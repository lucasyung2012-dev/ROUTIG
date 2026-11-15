/**
 * Prédios detalhados da região Leste (Bloco 3): Observatório Temporal (Calendar), Centro de Operações
 * (Tasks), Projects e Finanças. O térreo de cada um sai da volumetria do prédio (massing.ts), a
 * mesma planta do interior (shell.ts); aqui ficam a entrada, o letreiro, o paisagismo e o que é só
 * de cada prédio. Coordenadas locais: frente = +z, base em y = 0, 1 unidade = 1 m.
 */
import * as THREE from 'three';
import { Builder, shrubs, type Kit } from '../kit';
import { lotBase, planting, signPlane, type DetailedBuilding } from './central';
import { groundShell, signSpot } from './shell';
import { MASSING, STOREY, topLevel } from '../massing';
import { volPoly } from '../outline';

/* =====================================================================
 * CALENDAR — Observatório Temporal (seção 18): tambor radial com alas retangulares, átrio
 * envidraçado, relógio astronômico na fachada (marca a hora real) e jardins em arco.
 * ===================================================================== */
export function calendarBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const metal = kit.mat('#B8C2CF', { metal: 0.8, rough: 0.35 });
  const white = kit.mat('#F2F4F8', { rough: 0.5 });
  const brass = kit.mat('#D4B572', { metal: 0.8, rough: 0.3 });
  const glow = kit.mat('#93C5FD', { glow: true });

  lotBase(kit, b, 26.5, '#E1E4EA');
  const s = groundShell(kit, b, 'calendar', { base: '#D6DAE2', canopy: 3, canopyColor: '#2563EB', glow: '#FFE9C2' });
  // Jardins em arco entre as alas radiais e caminhos radiais na frente (as horas).
  for (const a of [Math.PI / 3, -Math.PI / 3]) {
    const span = 0.8;
    const t0 = Math.atan2(-Math.cos(a), Math.sin(a)) - span / 2;
    b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.RingGeometry(19, 21.4, 32, 1, t0, span), [0, 0.07, 0], [-Math.PI / 2, 0, 0]);
    b.add(kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }), new THREE.RingGeometry(22, 23.2, 32, 1, t0 + 0.1, span - 0.2), [0, 0.09, 0], [-Math.PI / 2, 0, 0]);
  }
  for (const a of [-0.5, -0.25, 0.25, 0.5]) b.add(kit.mat('#D6D0C2', { rough: 0.85 }), new THREE.BoxGeometry(1.2, 0.04, 5), [Math.sin(a) * 22, 0.1, Math.cos(a) * 22], [0, a, 0]);
  // Faixa de luz no topo do tambor e anel de metal sobre o pórtico.
  const top = MASSING.calendar.ground + topLevel('calendar') * STOREY;
  b.add(glow, new THREE.TorusGeometry(16.15, 0.09, 6, 96), [0, top - 0.1, 0], [-Math.PI / 2, 0, 0]);
  b.add(metal, new THREE.BoxGeometry(10.4, 0.4, 0.4), [0, s.door.top + 0.2, s.front + 0.2]);
  b.add(white, new THREE.BoxGeometry(10, 0.1, 4), [0, 0.05, s.front + 2.2]);
  group.add(b.build());

  // Relógio astronômico na fachada do tambor, acima do pórtico: anéis, marcas das horas e ponteiros na hora real.
  const clock = new THREE.Group();
  clock.position.set(0, MASSING.calendar.ground + 1.2, 16.3);
  clock.scale.setScalar(0.8);
  const cb = new Builder();
  cb.add(kit.mat('#0F1E46', { rough: 0.5 }), new THREE.CircleGeometry(4.5, 64), [0, 0, -0.05]);
  for (const r of [4.5, 3.6, 2.2]) cb.add(brass, new THREE.TorusGeometry(r, 0.12, 8, 64));
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    cb.add(brass, new THREE.BoxGeometry(0.18, h % 3 ? 0.5 : 0.9, 0.1), [Math.sin(a) * 4, Math.cos(a) * 4, 0.05], [0, 0, -a]);
  }
  clock.add(cb.build(false));
  const hour = new THREE.Mesh(kit.own(new THREE.BoxGeometry(0.28, 2.4, 0.1)), brass);
  hour.geometry.translate(0, 1.1, 0.12);
  const minute = new THREE.Mesh(kit.own(new THREE.BoxGeometry(0.18, 3.4, 0.1)), kit.mat('#F2F4F8', { metal: 0.5 }));
  minute.geometry.translate(0, 1.6, 0.18);
  const sun = new THREE.Mesh(kit.own(new THREE.SphereGeometry(0.35, 12, 8)), kit.mat('#FBBF24', { glow: true }));
  clock.add(hour, minute, sun);
  const sp = signSpot(s, 1.5);
  const sign = signPlane(kit, ['CALENDAR', 'OBSERVATÓRIO TEMPORAL'], 6.4, 1.5, '#93C5FD');
  sign.position.set(0, sp.y, sp.z + 0.3);
  group.add(clock, sign, ...planting(kit, s.bound + 1, 26.8, 80, ['#93C5FD', '#FFFFFF', '#FBBF24'], 0.25));
  return {
    group,
    top: s.top,
    core: s.core,
    tick: () => {
      // A hora real do aparelho (o único lugar do parque que não segue o tempo da animação).
      const d = new Date();
      const m = d.getMinutes() + d.getSeconds() / 60;
      const h = (d.getHours() % 12) + m / 60;
      hour.rotation.z = -(h / 12) * Math.PI * 2;
      minute.rotation.z = -(m / 60) * Math.PI * 2;
      const day = (d.getHours() + m / 60) / 24;
      sun.position.set(Math.sin(day * Math.PI * 2) * 2.9, -Math.cos(day * Math.PI * 2) * 2.9, 0.2);
    },
  };
}

/* =====================================================================
 * TASKS — Centro de Operações (seção 19): volumes retangulares ligados em alturas diferentes
 * (ala térrea, salão de 2 pavimentos, torre de 3), moldura de entrada suspensa e pátio frontal.
 * ===================================================================== */
export function tasksBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const graphite = kit.mat('#2B3442', { metal: 0.5, rough: 0.4 });
  const cyan = kit.mat('#22D3EE', { glow: true });

  lotBase(kit, b, 27.5, '#DEDCD6');
  const s = groundShell(kit, b, 'tasks', { base: '#D2D0CA', glow: '#FFE9C2' });
  // Entrada: moldura retangular suspensa (12 × 5) diante da fachada envidraçada.
  const zf = s.front + 0.6;
  b.add(graphite, new THREE.BoxGeometry(12, 0.6, 0.6), [0, 5.2, zf]);
  for (const sx of [-1, 1]) b.add(graphite, new THREE.BoxGeometry(0.6, 5.2, 0.6), [sx * 5.7, 2.6, zf]);
  b.add(cyan, new THREE.BoxGeometry(11, 0.08, 0.08), [0, 4.85, zf + 0.35]);
  // Pátio frontal: jardins geométricos a oeste, mesas sob a pérgula a leste (o eixo da porta fica livre).
  for (let i = 0; i < 3; i++) b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.BoxGeometry(4, 0.3, 3.2), [-16 + i * 4.8, 0.15, 18.5]);
  for (let i = 0; i < 3; i++) {
    b.add(kit.mat('#A0714F', { rough: 0.7 }), new THREE.BoxGeometry(2.2, 0.08, 1), [6.5 + i * 3.6, 0.8, 19.5]);
    b.add(graphite, new THREE.BoxGeometry(0.1, 0.8, 0.8), [6.5 + i * 3.6, 0.4, 19.5]);
  }
  for (let i = 0; i < 5; i++) b.add(graphite, new THREE.BoxGeometry(0.15, 0.15, 3.4), [5.4 + i * 2.4, 3.2, 19.5]);
  for (const x of [5, 15]) for (const z of [18, 21]) b.add(graphite, new THREE.BoxGeometry(0.2, 3.2, 0.2), [x, 1.6, z]);
  group.add(b.build());
  const sp = signSpot(s, 1.5);
  const sign = signPlane(kit, ['TASKS', 'CENTRO DE OPERAÇÕES'], 6.4, 1.5, '#22D3EE');
  sign.position.set(0, Math.max(sp.y, 6.4), sp.z);
  group.add(sign, ...planting(kit, s.bound + 1, 28, 70, ['#22D3EE', '#FFFFFF']));
  return { group, top: s.top, core: s.core };
}

/* =====================================================================
 * PROJECTS — Centro de Projetos (seção 20): volumes retangulares ligados e deslocados (o de cima
 * girado), alturas diferentes, átrio iluminado na frente; caixilhos laranja e a praça com a
 * escultura de fita (fora do eixo da porta).
 * ===================================================================== */
export function projectsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const white = kit.mat('#F7F4EF', { rough: 0.5 });
  const orange = kit.mat('#F97316', { metal: 0.2, rough: 0.4 });

  lotBase(kit, b, 27, '#E8E1D6');
  const s = groundShell(kit, b, 'projects', { base: '#DDD5C8', canopy: 3, canopyColor: '#F97316', glow: '#FFE9C2' });
  // Caixilhos laranja nas quinas do volume deslocado, do chão à cobertura.
  const M = MASSING.projects;
  const hTop = M.ground + topLevel('projects') * STOREY;
  for (const [x, z] of volPoly(M.vols[1]!)) b.add(orange, new THREE.BoxGeometry(0.45, hTop, 0.45), [x, hTop / 2, z]);
  for (const [x, z] of volPoly(M.vols[0]!)) b.add(orange, new THREE.BoxGeometry(0.4, M.ground + STOREY, 0.4), [x, (M.ground + STOREY) / 2, z]);
  // Praça com bancos e cavaletes (a escultura fica de lado, longe do caminho da porta).
  b.add(kit.mat('#CFC6B2', { rough: 0.85 }), new THREE.CircleGeometry(4.5, 40), [-8.5, 0.06, 21], [-Math.PI / 2, 0, 0]);
  for (let k = 0; k < 3; k++) {
    const x = 6 + k * 3.6;
    b.add(kit.mat('#A0714F', { rough: 0.7 }), new THREE.BoxGeometry(0.1, 2, 0.1), [x, 1, 21.5], [0.2, 0, 0]);
    b.add(white, new THREE.BoxGeometry(1.4, 1, 0.06), [x, 1.6, 21.4], [-0.2, 0, 0]);
  }
  group.add(b.build());
  // Escultura de fita (nó) na praça, girando devagar.
  const sculpture = new THREE.Mesh(kit.own(new THREE.TorusKnotGeometry(1.6, 0.42, 128, 16, 2, 3)), kit.mat('#F97316', { metal: 0.5, rough: 0.25 }));
  sculpture.position.set(-8.5, 3.4, 21);
  sculpture.castShadow = true;
  const sp = signSpot(s, 1.3);
  const sign = signPlane(kit, ['PROJECTS', 'CENTRO DE PROJETOS'], 5.6, 1.3, '#F97316');
  sign.position.set(0, sp.y, sp.z);
  group.add(sculpture, sign, ...planting(kit, s.bound + 1.5, 27.5, 90, ['#FDBA74', '#FFFFFF', '#F472B6']));
  return {
    group,
    top: s.top,
    core: s.core,
    tick: (t) => {
      sculpture.rotation.y = t * 0.3;
      sculpture.position.y = 3.4 + Math.sin(t * 0.8) * 0.12;
    },
  };
}

/* =====================================================================
 * FINANCE — Centro de Gestão Financeira (seção 27): institucional, compacto e alto (3
 * pavimentos), volumes geométricos ligados (o anexo leste guarda o cofre), jardins geométricos
 * com espelhos d'água dos dois lados do caminho.
 * ===================================================================== */
export function financeBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const white = kit.mat('#F2F4F8', { rough: 0.5 });
  const gold = kit.mat('#D4B572', { metal: 0.85, rough: 0.25 });

  lotBase(kit, b, 23, '#E1E3E8');
  const s = groundShell(kit, b, 'finance', { base: '#D8D4CA', canopy: 2.5, canopyColor: '#D4B572', glow: '#FFE9C2' });
  // Faixa dourada no alto do térreo, em volta do bloco principal.
  for (const r of s.runs) if (r.vol === 0 && r.from === 0) b.add(gold, new THREE.BoxGeometry(0.12, 0.18, r.len), [(r.ax + r.bx) / 2 + r.nx * 0.25, MASSING.finance.ground - 0.4, (r.az + r.bz) / 2 + r.nz * 0.25], [0, Math.atan2(r.bx - r.ax, r.bz - r.az), 0]);
  // Jardins geométricos: espelhos d'água e canteiros quadrados dos dois lados do caminho da porta.
  for (const sx of [-1, 1]) {
    b.add(kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }), new THREE.BoxGeometry(5, 0.1, 2.6), [sx * 5.5, 0.12, s.front + 3.6]);
    b.add(white, new THREE.BoxGeometry(5.8, 0.3, 3.4), [sx * 5.5, 0.05, s.front + 3.6]);
    for (let k = 0; k < 2; k++) b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.BoxGeometry(2.2, 0.3, 2.2), [sx * (14 + k * 3), 0.15, 10]);
  }
  group.add(b.build());
  const sp = signSpot(s, 1.3);
  const sign = signPlane(kit, ['FINANÇAS', 'GESTÃO FINANCEIRA'], 5.6, 1.3, '#D4B572');
  sign.position.set(0, sp.y, sp.z);
  const bushes: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) bushes.push({ x: sx * (3.2 + i * 1.8), y: 0, z: s.front + 6, s: 0.7, color: '#3E8E4A' });
  group.add(sign, shrubs(kit, bushes, 'bush'), ...planting(kit, s.bound + 1, 23.5, 60, ['#FDE68A', '#FFFFFF']));
  return { group, top: s.top, core: s.core };
}
