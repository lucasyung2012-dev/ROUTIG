/**
 * Objetos em uso nos interiores ("mais vivos"): nas mesas de quem senta para trabalhar ou estudar,
 * o que se usa ali (notebook aberto, livro aberto, caderno e caneta, xícara, papéis, partitura,
 * garrafa d'água, planta pequena; às vezes um casaco no encosto da cadeira), pelo uso do prédio
 * (indoorLife.ts). Tudo parado vai numa malha só (cor por vértice) e as telas dos notebooks noutra;
 * só o que se mexe é separado: ventiladores de teto nas salas (pás numa malha instanciada) e
 * relógios de parede com os ponteiros na hora do parque. Na qualidade baixa, nada disso aparece.
 * Nada aqui entra na colisão (é montado depois dela) nem fica fora das mesas e das paredes das salas.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { Builder, type Kit } from '../kit';
import type { Quality } from '../world';
import { LIFE, hash01, idSeed, roomPoint, type LifeKind, type LifeRoom, type LifeSpot } from './indoorLife';

export interface InUse {
  group: THREE.Group;
  /** `glow` = quanto é noite (0 a 1, telas mais vivas no escuro); `hour` = hora do parque (relógios). */
  tick: (t: number, glow: number, hour: number) => void;
  setDetail: (q: Quality) => void;
}

/** Cor por vértice: as peças de cores diferentes viram uma malha só. */
function tint(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position!.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const MUGS = ['#F4F4F5', '#C0504D', '#3E6E9E', '#E8C547', '#4F8A5B', '#2F3A4F'];
const COVERS = ['#7C2D12', '#1E3A8A', '#365314', '#9D174D', '#CA8A04', '#0F766E', '#3D405B'];
const JACKETS = ['#2F3A4F', '#6B5B4B', '#7A2E2E', '#3E5C4A', '#A08560'];
const BLOOMS = ['#F472B6', '#FACC15', '#F97316', '#A78BFA'];

type Item = 'laptop' | 'book' | 'notebook' | 'papers' | 'sheet' | 'bottle' | 'cup' | 'plant';

/** O que fica na mesa, pelo uso do prédio (r e r2: sorteios fixos do lugar). */
function itemsFor(kind: LifeKind, reception: boolean, r: number, r2: number): Item[] {
  if (reception) return ['laptop', 'cup'];
  if (r > 0.78) return [];
  const cup = r2 < 0.4 ? (['cup'] as Item[]) : [];
  const plant = r2 > 0.86 ? (['plant'] as Item[]) : [];
  switch (kind) {
    case 'study':
      return [r < 0.35 ? 'book' : r < 0.6 ? 'notebook' : r < 0.7 ? 'laptop' : 'papers', ...cup, ...plant];
    case 'work':
      return [r < 0.45 ? 'laptop' : r < 0.65 ? 'papers' : 'notebook', ...cup, ...plant];
    case 'data':
      return [r < 0.65 ? 'laptop' : 'notebook', ...cup];
    case 'music':
      return [r < 0.6 ? 'sheet' : 'notebook', ...cup];
    case 'sport':
      return [r < 0.6 ? 'bottle' : 'notebook', ...plant];
    case 'calm':
      return [r < 0.35 ? 'book' : 'cup', ...plant, ...(r < 0.35 ? cup : [])];
  }
}

export function inUseProps(kit: Kit, id: ModuleId, spots: readonly LifeSpot[], rooms: readonly LifeRoom[], levelY: (L: number) => number): InUse {
  const kind = LIFE[id].kind;
  const seed = idSeed(id);
  const group = new THREE.Group();
  const b = new Builder();
  const paint = kit.mat('#ffffff', { vertexColors: true, rough: 0.65 });
  // Telas dos notebooks: brilham sozinhas (mais no escuro) e tremem de leve.
  const screenMat = kit.own(new THREE.MeshStandardMaterial({ color: '#0F172A', emissive: new THREE.Color('#A9D4FF'), emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.1 }));
  /** Peça em coordenadas da mesa (z para longe de quem senta), girada `face` e levada para (x, y, z). */
  const put = (g: THREE.BufferGeometry, hex: string, x: number, y: number, z: number, face: number, lx: number, ly: number, lz: number, tilt = 0, spin = 0) => {
    if (tilt) g.rotateX(tilt);
    if (spin) g.rotateY(spin);
    g.translate(lx, ly, lz);
    b.add(paint, tint(g, hex), [x, y, z], [0, face, 0]);
  };
  spots.forEach((s, i) => {
    if (!s.seated || !s.desk) return;
    const d = s.desk;
    const f = s.face;
    const r = hash01(seed + i * 13, 21);
    const r2 = hash01(seed + i * 13, 22);
    const side = r2 < 0.5 ? -1 : 1;
    for (const it of itemsFor(kind, s.doing === 'reception', r, r2)) {
      switch (it) {
        case 'laptop': {
          put(new THREE.BoxGeometry(0.32, 0.015, 0.22), '#9AA3AD', d.x, d.y, d.z, f, 0, 0.0075, 0.04);
          // Tela aberta, inclinada para trás, articulada na borda de trás da base.
          const lid = new THREE.BoxGeometry(0.32, 0.21, 0.008);
          lid.translate(0, 0.105, 0);
          put(lid, '#2B3442', d.x, d.y, d.z, f, 0, 0.015, 0.15, 0.3);
          const disp = new THREE.PlaneGeometry(0.29, 0.18);
          disp.rotateY(Math.PI);
          disp.translate(0, 0.105, -0.0045);
          disp.rotateX(0.3);
          disp.translate(0, 0.015, 0.15);
          b.add(screenMat, disp, [d.x, d.y, d.z], [0, f, 0]);
          break;
        }
        case 'book': {
          put(new THREE.BoxGeometry(0.34, 0.01, 0.24), COVERS[Math.floor(r2 * COVERS.length) % COVERS.length]!, d.x, d.y, d.z, f, 0, 0.005, 0.02, 0, (r - 0.2) * 0.6);
          for (const s2 of [-1, 1]) {
            const pg = new THREE.BoxGeometry(0.16, 0.012, 0.22);
            pg.rotateZ(-s2 * 0.07);
            pg.translate(s2 * 0.083, 0, 0);
            put(pg, '#F5F0E6', d.x, d.y, d.z, f, 0, 0.018, 0.02, 0, (r - 0.2) * 0.6);
          }
          break;
        }
        case 'notebook': {
          put(new THREE.BoxGeometry(0.2, 0.012, 0.27), '#F8FAFC', d.x, d.y, d.z, f, side * -0.05, 0.006, 0.02, 0, side * 0.15);
          const pen = new THREE.CylinderGeometry(0.005, 0.005, 0.14, 6);
          pen.rotateZ(Math.PI / 2);
          put(pen, '#1E3A8A', d.x, d.y, d.z, f, side * 0.1, 0.017, 0.0, 0, 0.6);
          break;
        }
        case 'papers': {
          for (let k = 0; k < 3; k++) put(new THREE.BoxGeometry(0.21, 0.004, 0.29), k === 1 ? '#FEF9C3' : '#FFFFFF', d.x, d.y, d.z, f, side * 0.05 + k * 0.01, 0.003 + k * 0.004, 0.03, 0, (k - 1) * 0.12);
          break;
        }
        case 'sheet': {
          put(new THREE.BoxGeometry(0.3, 0.004, 0.21), '#FFFDF5', d.x, d.y, d.z, f, 0, 0.003, 0.04, 0, 0.08);
          for (let k = 0; k < 4; k++) put(new THREE.BoxGeometry(0.26, 0.001, 0.004), '#334155', d.x, d.y, d.z, f, 0, 0.0055, -0.02 + k * 0.035, 0, 0.08);
          const pencil = new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6);
          pencil.rotateZ(Math.PI / 2);
          put(pencil, '#E8C547', d.x, d.y, d.z, f, 0.12, 0.008, -0.06, 0, 0.9);
          break;
        }
        case 'bottle': {
          put(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12), '#3BA7E0', d.x, d.y, d.z, f, side * 0.18, 0.1, 0.05);
          put(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10), '#1F2937', d.x, d.y, d.z, f, side * 0.18, 0.215, 0.05);
          break;
        }
        case 'cup': {
          const mug = MUGS[Math.floor(r * 37) % MUGS.length]!;
          put(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 14), mug, d.x, d.y, d.z, f, side * -0.22, 0.045, 0.0);
          put(new THREE.CylinderGeometry(0.034, 0.034, 0.004, 14), kind === 'calm' ? '#B7791F' : '#4A2C1A', d.x, d.y, d.z, f, side * -0.22, 0.086, 0.0);
          const handle = new THREE.TorusGeometry(0.022, 0.006, 6, 10, Math.PI);
          handle.rotateZ(-Math.PI / 2);
          put(handle, mug, d.x, d.y, d.z, f, side * -0.22 + 0.04, 0.05, 0.0);
          break;
        }
        case 'plant': {
          put(new THREE.CylinderGeometry(0.055, 0.045, 0.08, 12), '#C2724F', d.x, d.y, d.z, f, side * 0.24, 0.04, 0.12);
          if (r2 > 0.93) for (let k = 0; k < 3; k++) put(new THREE.SphereGeometry(0.028, 8, 6), BLOOMS[(k + i) % BLOOMS.length]!, d.x, d.y, d.z, f, side * 0.24 + Math.sin(k * 2.1) * 0.03, 0.12 + k * 0.012, 0.12 + Math.cos(k * 2.1) * 0.03);
          else {
            const leaf = new THREE.IcosahedronGeometry(0.06, 0);
            leaf.scale(1, 0.75, 1);
            put(leaf, '#5E9E5A', d.x, d.y, d.z, f, side * 0.24, 0.12, 0.12);
          }
          break;
        }
      }
    }
    // De vez em quando, um casaco largado no encosto da cadeira.
    if (s.doing !== 'reception' && hash01(seed + i * 13, 23) < 0.09) {
      const jk = JACKETS[Math.floor(r2 * 53) % JACKETS.length]!;
      const fx = Math.sin(f);
      const fz = Math.cos(f);
      b.add(paint, tint(new THREE.BoxGeometry(0.42, 0.36, 0.05), jk), [s.x - fx * 0.27, s.y + 0.2, s.z - fz * 0.27], [0, f, 0]);
      b.add(paint, tint(new THREE.BoxGeometry(0.44, 0.06, 0.12), jk), [s.x - fx * 0.24, s.y + 0.4, s.z - fz * 0.24], [0, f, 0]);
    }
  });

  // Ventiladores de teto nas salas de treino, prática, convivência e calma (até 3): entre o
  // pendente do meio e a parede do fundo, acima do relógio, com as pás longe das paredes.
  const fanKinds: LifeKind[] = ['sport', 'music', 'calm', 'study'];
  const fanRooms = fanKinds.includes(kind) ? rooms.filter((r) => r.box && r.d >= 3.4 && r.w >= 2.4 && (r.type === 'gym' || r.type === 'lounge' || r.type === 'studio' || r.type === 'music' || r.type === 'stage')).slice(0, 3) : [];
  const fans = fanRooms.map((r) => {
    const [x, z] = roomPoint(r, 0, -(r.d / 2 - 0.95));
    const top = levelY(r.level) + 4.0;
    const y = top - 0.38;
    b.add(paint, tint(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 6), '#9CA3AF'), [x, top - 0.17, z]);
    b.add(paint, tint(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 14), '#E5E7EB'), [x, y, z]);
    return { x, y: y - 0.03, z, spin: hash01(seed + Math.round(x * 10), 31) * Math.PI };
  });
  // O relógio de parede que toda sala tem no fundo (furnish.ts, decorate: a 3,25 m, 0,2 m da
  // parede): os ponteiros andam com a hora do parque.
  const clocks = rooms.map((r) => {
    const [x, z] = roomPoint(r, 0, -r.d / 2 + 0.12 + 0.11);
    return { x, y: levelY(r.level) + 3.25, z, face: r.face };
  });
  const still = b.build(false);
  group.add(still);

  // Pás (4 por ventilador) e ponteiros (2 por relógio): uma malha instanciada para cada.
  const bladeGeo = kit.own(new THREE.BoxGeometry(0.55, 0.012, 0.11));
  bladeGeo.translate(0.36, 0, 0);
  const blades = new THREE.InstancedMesh(bladeGeo, kit.mat('#C8B79B', { rough: 0.6 }), Math.max(1, fans.length * 4));
  blades.count = fans.length * 4;
  blades.frustumCulled = false;
  const handGeo = kit.own(new THREE.BoxGeometry(0.012, 1, 0.006));
  handGeo.translate(0, 0.5, 0);
  const hands = new THREE.InstancedMesh(handGeo, kit.mat('#111827', { rough: 0.5 }), Math.max(1, clocks.length * 2));
  hands.count = clocks.length * 2;
  hands.frustumCulled = false;
  if (fans.length) group.add(blades);
  if (clocks.length) group.add(hands);
  // Trabalho (nada alocado a cada quadro).
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = new THREE.Vector3(0, 0, 1);
  let lastMin = -1;
  const setHands = (hour: number) => {
    const h = ((hour % 12) + 12) % 12;
    const min = (hour * 60) % 60;
    clocks.forEach((c, k) => {
      for (let j = 0; j < 2; j++) {
        const ang = j === 0 ? (h / 12) * Math.PI * 2 : (min / 60) * Math.PI * 2;
        q.setFromAxisAngle(up, c.face);
        q2.setFromAxisAngle(fwd, -ang);
        q.multiply(q2);
        p.set(0, 0, j * 0.005).applyAxisAngle(up, c.face).add(sc.set(c.x, c.y, c.z));
        sc.set(1, j === 0 ? 0.11 : 0.16, 1);
        hands.setMatrixAt(k * 2 + j, m.compose(p, q, sc));
      }
    });
    hands.instanceMatrix.needsUpdate = true;
  };
  return {
    group,
    tick: (t, glow, hour) => {
      const mm = Math.floor(hour * 60);
      if (clocks.length && mm !== lastMin) {
        lastMin = mm;
        setHands(hour);
      }
      if (!still.visible) return;
      for (let k = 0; k < fans.length; k++) {
        const fn = fans[k]!;
        for (let j = 0; j < 4; j++) {
          q.setFromAxisAngle(up, fn.spin + t * 2.4 + (j * Math.PI) / 2);
          blades.setMatrixAt(k * 4 + j, m.compose(p.set(fn.x, fn.y, fn.z), q, sc.set(1, 1, 1)));
        }
      }
      if (fans.length) blades.instanceMatrix.needsUpdate = true;
      screenMat.emissiveIntensity = (0.45 + glow * 0.55) * (0.95 + 0.05 * Math.sin(t * 11.3) * Math.sin(t * 3.7));
    },
    setDetail: (qq) => {
      // Na qualidade baixa, só os ponteiros dos relógios (os relógios já estão nas salas).
      still.visible = qq !== 'low';
      blades.visible = qq !== 'low';
    },
  };
}
