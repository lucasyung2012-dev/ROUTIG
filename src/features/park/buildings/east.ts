/**
 * Prédios detalhados da região Leste (Bloco 3): Observatório Temporal (Calendar), Centro de Operações
 * (Tasks), Projects e Finanças. Calendar e Tasks seguem o plano (docs/V2-PARQUE-PLANO.md, 3.5 e 3.6);
 * Projects e Finanças seguem o prompt principal da V2 (seção 4).
 * Coordenadas locais: frente = +z, base em y = 0, 1 unidade = 1 m.
 */
import * as THREE from 'three';
import { Builder, shrubs, type Kit } from '../kit';
import { lotBase, planting, signPlane, type DetailedBuilding } from './central';

const SILVER = '#CBD5E1';

/* =====================================================================
 * CALENDAR — Observatório Temporal (3.5): tambor central com relógio astronômico
 * na fachada (marca a hora real), dois volumes laterais e cobertura radial.
 * ===================================================================== */
export function calendarBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const metal = kit.mat('#B8C2CF', { metal: 0.8, rough: 0.35 });
  const blue = kit.mat('#2563EB', { metal: 0.3, rough: 0.35 });
  const glass = kit.mat('#8DB4F5', { glass: true });
  const brass = kit.mat('#D4B572', { metal: 0.8, rough: 0.3 });
  const white = kit.mat('#F2F4F8', { rough: 0.5 });
  const glow = kit.mat('#93C5FD', { glow: true });
  const warm = kit.mat('#FFE9C2', { glow: true, rough: 0.9 });

  lotBase(kit, b, 28, '#E1E4EA');
  // Jardins circulares em anéis e caminhos radiais.
  for (const r of [18, 23]) b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.RingGeometry(r, r + 2.2, 64), [0, 0.07, 0], [-Math.PI / 2, 0, 0]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add(kit.mat('#D6D0C2', { rough: 0.85 }), new THREE.BoxGeometry(1.2, 0.04, 10), [Math.sin(a) * 21, 0.1, Math.cos(a) * 21], [0, a, 0]);
  }
  // Espelho d'água em meia-lua atrás.
  b.add(kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }), new THREE.RingGeometry(14, 17, 48, 1, Math.PI * 1.15, Math.PI * 0.7), [0, 0.09, 0], [-Math.PI / 2, 0, 0]);
  // Tambor central (Ø 26, 10 m, 2 pavimentos) com vidro azul e faixa de piso em metal.
  b.add(white, new THREE.CylinderGeometry(13.6, 14, 1, 48), [0, 0.5, 0]);
  b.add(glass, new THREE.CylinderGeometry(13, 13, 9, 48, 1, true), [0, 5.5, 0]);
  b.add(warm, new THREE.CylinderGeometry(12.4, 12.4, 8.6, 32, 1, true), [0, 5.5, 0]);
  b.add(metal, new THREE.CylinderGeometry(13.2, 13.2, 0.5, 48, 1, true), [0, 5.3, 0]);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    b.add(metal, new THREE.BoxGeometry(0.25, 9, 0.4), [Math.sin(a) * 13.15, 5.5, Math.cos(a) * 13.15], [0, a, 0]);
  }
  // Cobertura radial: 24 nervuras subindo para um anel central.
  b.add(blue, new THREE.CylinderGeometry(3, 13.6, 2.4, 48), [0, 11.2, 0]);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    b.add(metal, new THREE.BoxGeometry(0.2, 0.25, 11.2), [Math.sin(a) * 8.2, 11.3, Math.cos(a) * 8.2], [0.21, a, 0]);
  }
  b.add(brass, new THREE.TorusGeometry(3, 0.3, 8, 48), [0, 12.4, 0], [-Math.PI / 2, 0, 0]);
  b.add(glow, new THREE.TorusGeometry(13.7, 0.09, 6, 96), [0, 10, 0], [-Math.PI / 2, 0, 0]);
  // Dois volumes laterais retangulares.
  for (const s of [-1, 1]) {
    b.add(white, new THREE.BoxGeometry(12, 6, 16), [s * 17, 3, -2]);
    b.add(glass, new THREE.BoxGeometry(12.1, 2.4, 16.1), [s * 17, 3.4, -2]);
    b.add(blue, new THREE.BoxGeometry(12.6, 0.4, 16.6), [s * 17, 6.2, -2]);
  }
  // Entrada elevada (3 degraus + rampa) com pórtico.
  b.add(white, new THREE.BoxGeometry(8, 1, 5), [0, 0.5, 15]);
  for (let s = 0; s < 3; s++) b.add(white, new THREE.BoxGeometry(8, 0.33, 0.7), [0, 0.165 + s * 0.33, 18.2 - s * 0.6]);
  b.add(white, new THREE.BoxGeometry(1.8, 0.1, 6), [6, 0.5, 16.5], [0.16, 0, 0]);
  for (const s of [-1, 1]) b.add(metal, new THREE.BoxGeometry(0.6, 5, 0.6), [s * 3.6, 3.5, 17]);
  b.add(blue, new THREE.BoxGeometry(8.4, 0.6, 2), [0, 6.2, 16.6]);
  group.add(b.build());

  // Relógio astronômico na fachada (Ø 9 m): anéis, marcas das horas e ponteiros na hora real.
  const clock = new THREE.Group();
  clock.position.set(0, 7.2, 13.4);
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
  const sign = signPlane(kit, ['CALENDAR', 'OBSERVATÓRIO TEMPORAL'], 6.4, 1.5, '#93C5FD');
  sign.position.set(0, 7.4, 17.65);
  group.add(clock, sign, ...planting(kit, 24, 27.5, 90, ['#93C5FD', '#FFFFFF', '#FBBF24'], 0.25));
  return {
    group,
    top: 15,
    core: 19,
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
 * TASKS — Centro de Operações (3.6): volumes angulares em "L" (6, 9 e 12 m),
 * metal prata e grafite, fitas de janela, moldura de entrada suspensa.
 * ===================================================================== */
export function tasksBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const silver = kit.mat(SILVER, { metal: 0.85, rough: 0.25 });
  const graphite = kit.mat('#2B3442', { metal: 0.5, rough: 0.4 });
  const glass = kit.mat('#A5C8F0', { glass: true });
  const cyan = kit.mat('#22D3EE', { glow: true });
  const blue = kit.mat('#3B82F6', { glow: true });
  const warm = kit.mat('#FFE9C2', { glow: true, rough: 0.9 });

  lotBase(kit, b, 29, '#DEDCD6');
  const volume = (w: number, h: number, d: number, x: number, z: number, ry = 0) => {
    b.add(silver, new THREE.BoxGeometry(w, h, d), [x, h / 2, z], [0, ry, 0]);
    const bands = Math.floor(h / 3);
    for (let k = 0; k < bands; k++) {
      b.add(glass, new THREE.BoxGeometry(w + 0.1, 1.4, d + 0.1), [x, 1.6 + k * 3, z], [0, ry, 0]);
      b.add(warm, new THREE.BoxGeometry(w - 0.4, 1.2, d - 0.4), [x, 1.6 + k * 3, z], [0, ry, 0]);
    }
    b.add(graphite, new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), [x, h + 0.2, z], [0, ry, 0]);
    // Linhas de luz nas arestas de cima.
    b.add(cyan, new THREE.BoxGeometry(w + 0.62, 0.08, 0.1), [x, h - 0.05, z + (d / 2 + 0.3) * Math.cos(ry)], [0, ry, 0]);
  };
  volume(30, 6, 14, -4, -4); // ala de execução
  volume(14, 9, 22, 13, 3); // ala de planejamento
  volume(12, 12, 12, 13, -10); // torre de comando
  // Módulos de cobertura sobrepostos.
  b.add(graphite, new THREE.BoxGeometry(10, 0.5, 8), [-9, 6.7, -4], [0, 0.08, 0]);
  b.add(silver, new THREE.BoxGeometry(8, 0.5, 6), [2, 7.0, -3], [0, -0.06, 0]);
  b.add(blue, new THREE.BoxGeometry(12.7, 0.08, 0.1), [13, 12.3, -3.7]);
  // Entrada central: moldura retangular suspensa (12 × 5).
  b.add(graphite, new THREE.BoxGeometry(12, 0.6, 0.6), [-4, 5.2, 5.4]);
  for (const s of [-1, 1]) b.add(graphite, new THREE.BoxGeometry(0.6, 5.2, 0.6), [-4 + s * 5.7, 2.6, 5.4]);
  b.add(cyan, new THREE.BoxGeometry(11, 0.08, 0.08), [-4, 4.85, 5.75]);
  b.add(kit.mat('#9BE7F5', { glass: true }), new THREE.BoxGeometry(6, 3.6, 0.12), [-4, 1.8, 3.1]);
  // Pátio frontal: caminhos retos, jardins geométricos, mesas e pérgula.
  for (let i = 0; i < 4; i++) b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.BoxGeometry(5, 0.3, 4), [-16 + i * 6.5, 0.15, 13]);
  for (let i = 0; i < 3; i++) {
    b.add(kit.mat('#A0714F', { rough: 0.7 }), new THREE.BoxGeometry(2.2, 0.08, 1), [8 + i * 4, 0.8, 16]);
    b.add(graphite, new THREE.BoxGeometry(0.1, 0.8, 0.8), [8 + i * 4, 0.4, 16]);
  }
  for (let i = 0; i < 6; i++) b.add(graphite, new THREE.BoxGeometry(0.15, 0.15, 6), [6 + i * 2.6, 3.2, 16]);
  for (const x of [6, 19]) for (const z of [13.2, 18.8]) b.add(graphite, new THREE.BoxGeometry(0.2, 3.2, 0.2), [x, 1.6, z]);
  group.add(b.build());
  const sign = signPlane(kit, ['TASKS', 'CENTRO DE OPERAÇÕES'], 6.4, 1.5, '#22D3EE');
  sign.position.set(-4, 6.3, 5.75);
  group.add(sign, ...planting(kit, 23, 28.5, 80, ['#22D3EE', '#FFFFFF']));
  return { group, top: 14, core: 20 };
}

/* =====================================================================
 * PROJECTS — estúdio criativo (prompt 4.12): volumes de ateliê empilhados e girados,
 * caixilhos laranja, terraço com pérgula e uma escultura de fita na praça.
 * ===================================================================== */
export function projectsBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const white = kit.mat('#F7F4EF', { rough: 0.5 });
  const orange = kit.mat('#F97316', { metal: 0.2, rough: 0.4 });
  const glass = kit.mat('#FBD5B5', { glass: true });
  const graphite = kit.mat('#2B3442', { metal: 0.5, rough: 0.4 });
  const glow = kit.mat('#FDBA74', { glow: true });
  const warm = kit.mat('#FFE9C2', { glow: true, rough: 0.9 });

  lotBase(kit, b, 27, '#E8E1D6');
  // Três volumes de ateliê empilhados, cada um girado: vidro amplo com caixilho laranja.
  const boxes: Array<[number, number, number, number, number]> = [
    [20, 5, 14, 0, 0],
    [16, 4.5, 12, 0.22, 5],
    [12, 4, 10, -0.18, 9.5],
  ];
  boxes.forEach(([w, h, d, ry, y]) => {
    b.add(glass, new THREE.BoxGeometry(w, h, d), [0, y + h / 2, -2], [0, ry, 0]);
    b.add(warm, new THREE.BoxGeometry(w - 0.6, h - 0.6, d - 0.6), [0, y + h / 2, -2], [0, ry, 0]);
    b.add(white, new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), [0, y + h, -2], [0, ry, 0]);
    b.add(white, new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), [0, y + 0.2, -2], [0, ry, 0]);
    for (const s of [-1, 1]) b.add(orange, new THREE.BoxGeometry(0.4, h, 0.4), [Math.cos(ry) * s * (w / 2), y + h / 2, -2 - Math.sin(ry) * s * (w / 2) + Math.cos(ry) * 0], [0, ry, 0]);
    b.add(glow, new THREE.BoxGeometry(w, 0.08, 0.1), [Math.sin(ry) * (d / 2), y + h - 0.2, -2 + Math.cos(ry) * (d / 2 + 0.25)], [0, ry, 0]);
  });
  // Terraço no topo com pérgula.
  for (let i = 0; i < 6; i++) b.add(orange, new THREE.BoxGeometry(0.15, 0.15, 7), [-4 + i * 1.6, 16.4, -2], [0, -0.18, 0]);
  for (const x of [-4.5, 4.5]) for (const z of [-5, 1]) b.add(graphite, new THREE.BoxGeometry(0.15, 2.4, 0.15), [x, 15.2, z]);
  // Entrada.
  b.add(orange, new THREE.BoxGeometry(7, 0.4, 3), [0, 4.2, 6.6]);
  b.add(kit.mat('#9BE7F5', { glass: true }), new THREE.BoxGeometry(4.5, 3.4, 0.12), [0, 1.7, 5.05]);
  // Praça com bancos e cavaletes.
  b.add(kit.mat('#CFC6B2', { rough: 0.85 }), new THREE.CircleGeometry(7, 40), [0, 0.06, 15], [-Math.PI / 2, 0, 0]);
  for (let k = 0; k < 3; k++) {
    const x = -5 + k * 5;
    b.add(kit.mat('#A0714F', { rough: 0.7 }), new THREE.BoxGeometry(0.1, 2, 0.1), [x, 1, 20], [0.2, 0, 0]);
    b.add(white, new THREE.BoxGeometry(1.4, 1, 0.06), [x, 1.6, 19.9], [-0.2, 0, 0]);
  }
  group.add(b.build());
  // Escultura de fita (nó) na praça, girando devagar.
  const sculpture = new THREE.Mesh(kit.own(new THREE.TorusKnotGeometry(1.6, 0.42, 128, 16, 2, 3)), kit.mat('#F97316', { metal: 0.5, rough: 0.25 }));
  sculpture.position.set(0, 3.4, 15);
  sculpture.castShadow = true;
  const sign = signPlane(kit, ['PROJECTS', 'ESTÚDIO CRIATIVO'], 5.6, 1.3, '#F97316');
  sign.position.set(0, 4.9, 8.12);
  group.add(sculpture, sign, ...planting(kit, 21, 26, 90, ['#FDBA74', '#FFFFFF', '#F472B6']));
  return {
    group,
    top: 18,
    core: 14,
    tick: (t) => {
      sculpture.rotation.y = t * 0.3;
      sculpture.position.y = 3.4 + Math.sin(t * 0.8) * 0.12;
    },
  };
}

/* =====================================================================
 * FINANCE — torre de cinco pavimentos hexagonais escalonados, vidro, aletas azuis,
 * anel dourado no topo e espelho d'água na entrada (prompt 4.8).
 * ===================================================================== */
export function financeBuilding(kit: Kit): DetailedBuilding {
  const group = new THREE.Group();
  const b = new Builder();
  const white = kit.mat('#F2F4F8', { rough: 0.5 });
  const blue = kit.mat('#2563EB', { metal: 0.35, rough: 0.35 });
  const gold = kit.mat('#D4B572', { metal: 0.85, rough: 0.25 });
  const glass = kit.mat('#9DBDF5', { glass: true });
  const glow = kit.mat('#FDE68A', { glow: true });
  const warm = kit.mat('#FFE9C2', { glow: true, rough: 0.9 });

  lotBase(kit, b, 22, '#E1E3E8');
  b.add(white, new THREE.CylinderGeometry(11, 11.5, 0.8, 6), [0, 0.4, 0], [0, Math.PI / 6, 0]);
  for (let k = 0; k < 5; k++) {
    const r = 8.5 - k * 0.9;
    const y = 0.8 + k * 3.6;
    b.add(glass, new THREE.CylinderGeometry(r, r, 3.2, 6, 1, true), [0, y + 1.6, 0], [0, Math.PI / 6 + k * 0.08, 0]);
    b.add(warm, new THREE.CylinderGeometry(r - 0.4, r - 0.4, 3, 6, 1, true), [0, y + 1.6, 0], [0, Math.PI / 6 + k * 0.08, 0]);
    b.add(white, new THREE.CylinderGeometry(r + 0.5, r + 0.5, 0.4, 6), [0, y + 3.4, 0], [0, Math.PI / 6 + k * 0.08, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + k * 0.08;
      b.add(blue, new THREE.BoxGeometry(0.4, 3.2, 0.8), [Math.sin(a) * r, y + 1.6, Math.cos(a) * r], [0, a, 0]);
    }
  }
  b.add(gold, new THREE.TorusGeometry(4.6, 0.35, 8, 6), [0, 19.4, 0], [-Math.PI / 2, 0, Math.PI / 6]);
  b.add(glow, new THREE.CylinderGeometry(3.6, 3.6, 0.3, 6), [0, 19.2, 0]);
  // Entrada com degraus e espelho d'água.
  for (let s = 0; s < 3; s++) b.add(white, new THREE.BoxGeometry(7 - s * 0.3, 0.3, 0.7), [0, 0.15 + s * 0.3, 11.6 - s * 0.6]);
  b.add(gold, new THREE.BoxGeometry(6, 0.3, 3), [0, 4.1, 9.2]);
  b.add(kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }), new THREE.BoxGeometry(10, 0.1, 3), [0, 0.12, 15.5]);
  b.add(white, new THREE.BoxGeometry(10.8, 0.3, 3.8), [0, 0.05, 15.5]);
  group.add(b.build());
  const sign = signPlane(kit, ['FINANÇAS', 'ESCRITÓRIO FINANCEIRO'], 5.6, 1.3, '#D4B572');
  sign.position.set(0, 5.1, 10.75);
  const bushes: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  for (let i = 0; i < 10; i++) bushes.push({ x: -9 + i * 2, y: 0, z: 18, s: 0.7, color: '#3E8E4A' });
  group.add(sign, shrubs(kit, bushes, 'bush'), ...planting(kit, 15, 21, 70, ['#FDE68A', '#FFFFFF']));
  return { group, top: 21, core: 12 };
}
