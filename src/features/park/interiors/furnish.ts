/**
 * Mobília das salas dos andares (V2.1, seção 11): cada tipo de sala tem a sua montagem
 * (sala de aula, laboratório, cabine acústica, academia, arquivo, galeria, escritório,
 * painéis de dados, sala de estar, ateliê, palco e observatório), com medidas reais
 * (assentos a 0,45 m, mesas a 0,75 m). Tudo juntado por material: poucas malhas por sala.
 * Coordenadas da sala: origem no centro, +z aponta para a porta (para o átrio), -z para a fachada.
 */
import * as THREE from 'three';
import type { Builder, Kit } from '../kit';
import type { Seat } from '../camera';

export type RoomType = 'classroom' | 'lab' | 'booth' | 'gym' | 'archive' | 'gallery' | 'office' | 'dataviz' | 'lounge' | 'studio' | 'stage' | 'observatory' | 'music';

/** Tipo de cada sala pela chave (as mesmas chaves de FLOOR_PLANS). */
export function roomType(key: string, building: string): RoomType {
  if (building === 'music' && ['rehearsal', 'composing'].includes(key)) return 'music';
  if (building === 'sports' && ['gym', 'mobility', 'stretching', 'guided'].includes(key)) return 'gym';
  const map: Record<string, RoomType> = {
    math: 'classroom', science: 'classroom', humanities: 'classroom', tech: 'classroom', grammar: 'classroom', exercises: 'classroom', writing: 'classroom',
    labs: 'lab', lab: 'lab', proto: 'lab',
    booths: 'booth', recording: 'booth', listening: 'booth', pronunciation: 'booth', editing: 'booth',
    archive: 'archive', preserve: 'archive', history: 'archive', done: 'archive', archived: 'archive', versions: 'archive', records: 'archive', resources: 'archive', reports: 'archive', storage: 'archive',
    gallery: 'gallery', achievements: 'gallery', shows: 'stage', present: 'stage', talks: 'stage',
    indicators: 'dataviz', widgets: 'dataviz', visuals: 'dataviz', monthly: 'dataviz', weekly: 'dataviz', daily: 'dataviz', trends: 'dataviz', distribution: 'dataviz', analysis: 'dataviz', charts: 'dataviz', academic: 'dataviz', productivity: 'dataviz', habits: 'dataviz', activity: 'dataviz', evolution: 'dataviz', integrated: 'dataviz', investments: 'dataviz', performance: 'dataviz', streaks: 'dataviz', yearly: 'dataviz', growth: 'dataviz', dashboards: 'dataviz', assets: 'dataviz', sync: 'dataviz', tracking: 'dataviz', important: 'dataviz',
    rest: 'lounge', recovery: 'lounge', reading: 'lounge', conversation: 'lounge', culture: 'lounge', private: 'lounge', situations: 'lounge', park: 'lounge',
    drawing: 'studio', advanced: 'studio', customize: 'studio', personalize: 'studio',
    observatory: 'observatory',
  };
  return map[key] ?? 'office';
}

/** Monta a sala `type` em `b` (coordenadas da sala) e devolve os assentos (coordenadas da sala). */
export function furnish(kit: Kit, b: Builder, type: RoomType, w: number, d: number, accent: string, seed: number): Seat[] {
  const seats: Seat[] = [];
  const wood = kit.mat('#A27552', { rough: 0.7 });
  const lightWood = kit.mat('#C9A27A', { rough: 0.65 });
  const dark = kit.mat('#2B3442', { rough: 0.5 });
  const metal = kit.mat('#A6B0BC', { metal: 0.8, rough: 0.3 });
  const fabric = kit.mat(['#8FA3B8', '#B98B73', '#7C9A86', '#A88FB8'][seed % 4]!, { rough: 0.95 });
  const white = kit.mat('#F4F5F7', { rough: 0.5 });
  const glow = kit.mat('#9BE3FF', { glow: true, rough: 0.3 });
  const acc = kit.mat(accent, { rough: 0.6 });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const pot = kit.mat('#D9CBB6', { rough: 0.8 });
  const back = -d / 2 + 0.35;

  const chair = (x: number, z: number, ry: number) => {
    b.add(dark, new THREE.BoxGeometry(0.44, 0.05, 0.44), [x, 0.45, z], [0, ry, 0]);
    b.add(dark, new THREE.BoxGeometry(0.44, 0.45, 0.05), [x - Math.sin(ry) * 0.2, 0.7, z - Math.cos(ry) * 0.2], [0, ry, 0]);
    b.add(metal, new THREE.CylinderGeometry(0.025, 0.025, 0.43, 6), [x, 0.22, z]);
    b.add(metal, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 10), [x, 0.01, z]);
    seats.push({ x, y: 0.45, z, face: ry });
  };
  const desk = (x: number, z: number, wd: number, dd: number, ry = 0, mat = lightWood) => {
    b.add(mat, new THREE.BoxGeometry(wd, 0.04, dd), [x, 0.75, z], [0, ry, 0]);
    for (const sx of [-1, 1]) b.add(metal, new THREE.BoxGeometry(0.04, 0.73, dd * 0.9), [x + Math.cos(ry) * sx * (wd / 2 - 0.05), 0.37, z - Math.sin(ry) * sx * (wd / 2 - 0.05)], [0, ry, 0]);
  };
  const plant = (x: number, z: number, s = 1) => {
    b.add(pot, new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.4 * s, 14), [x, 0.2 * s, z]);
    b.add(leaf, new THREE.IcosahedronGeometry(0.38 * s, 1), [x, 0.75 * s, z], [0, seed, 0], [1, 1.3, 1]);
  };
  const monitor = (x: number, z: number, ry = 0) => {
    b.add(dark, new THREE.BoxGeometry(0.56, 0.34, 0.03), [x, 1.0, z], [0, ry, 0]);
    b.add(glow, new THREE.BoxGeometry(0.52, 0.3, 0.005), [x + Math.sin(ry) * 0.018, 1.0, z + Math.cos(ry) * 0.018], [0, ry, 0]);
    b.add(metal, new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), [x, 0.85, z]);
  };
  const shelf = (x: number, z: number, wd: number, h: number, ry = 0) => {
    b.add(wood, new THREE.BoxGeometry(wd, h, 0.36), [x, h / 2, z], [0, ry, 0]);
    const cols = ['#E07A5F', '#3D9970', '#5B8DB8', '#F2CC8F', '#8E7DBE', '#D1495B'];
    for (let r = 0; r < Math.floor(h / 0.42); r++)
      for (let k = 0; k < Math.floor(wd / 0.32); k++)
        b.add(kit.mat(cols[(r * 3 + k + seed) % cols.length]!, { rough: 0.85 }), new THREE.BoxGeometry(0.26, 0.3 - ((k + r) % 3) * 0.04, 0.24), [x + Math.cos(ry) * (-wd / 2 + 0.2 + k * 0.32), 0.2 + r * 0.42, z - Math.sin(ry) * (-wd / 2 + 0.2 + k * 0.32) + Math.cos(ry) * 0.08], [0, ry, 0]);
  };
  const board = (x: number, z: number, wd: number, color: string, marks: boolean) => {
    b.add(kit.mat(color, { rough: 0.6 }), new THREE.BoxGeometry(wd, 1.2, 0.04), [x, 1.5, z]);
    b.add(metal, new THREE.BoxGeometry(wd + 0.08, 0.06, 0.08), [x, 0.88, z + 0.03]);
    if (marks)
      for (let k = 0; k < 6; k++) b.add(white, new THREE.BoxGeometry(0.3 + ((k * 7) % 5) * 0.12, 0.025, 0.01), [x - wd / 2 + 0.4 + (k % 2) * wd * 0.45, 1.85 - Math.floor(k / 2) * 0.3, z + 0.025]);
  };
  const sofa = (x: number, z: number, ry: number, len = 2) => {
    b.add(fabric, new THREE.BoxGeometry(len, 0.42, 0.85), [x, 0.21, z], [0, ry, 0]);
    b.add(fabric, new THREE.BoxGeometry(len, 0.45, 0.2), [x - Math.sin(ry) * 0.35, 0.62, z - Math.cos(ry) * 0.35], [0, ry, 0]);
    for (const s of [-1, 1]) b.add(fabric, new THREE.BoxGeometry(0.18, 0.6, 0.85), [x + Math.cos(ry) * s * (len / 2 - 0.09), 0.3, z - Math.sin(ry) * s * (len / 2 - 0.09)], [0, ry, 0]);
    seats.push({ x, y: 0.45, z, face: ry });
  };

  switch (type) {
    case 'classroom': {
      board(0, back, Math.min(4, w * 0.5), accent === '#000000' ? '#2F4F3E' : '#2F4F3E', true);
      desk(0, back + 1.1, 1.6, 0.7, 0, wood);
      for (let r = 0; r < 3; r++)
        for (let c = -1; c <= 1; c++) {
          const x = c * 1.5;
          const z = back + 2.4 + r * 1.3;
          if (z > d / 2 - 1.4) continue;
          desk(x, z, 1.2, 0.55);
          chair(x, z + 0.55, Math.PI);
        }
      plant(w / 2 - 0.6, back + 0.4);
      break;
    }
    case 'lab': {
      for (let r = 0; r < 2; r++) {
        const z = back + 1.4 + r * 2.2;
        b.add(white, new THREE.BoxGeometry(3.2, 0.9, 0.9), [0, 0.45, z]);
        b.add(dark, new THREE.BoxGeometry(3.3, 0.05, 1.0), [0, 0.92, z]);
        for (let k = 0; k < 5; k++) b.add(kit.mat(['#7DD3FC', '#A7F3D0', '#FDE68A'][k % 3]!, { glass: true }), new THREE.CylinderGeometry(0.05, 0.06, 0.18, 10), [-1.2 + k * 0.6, 1.03, z]);
        for (const x of [-1, 0, 1]) {
          b.add(metal, new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12), [x, 0.68, z + 0.75]);
          b.add(metal, new THREE.CylinderGeometry(0.025, 0.025, 0.66, 6), [x, 0.34, z + 0.75]);
          seats.push({ x, y: 0.68, z: z + 0.75, face: Math.PI });
        }
      }
      b.add(white, new THREE.BoxGeometry(w * 0.6, 2.2, 0.5), [0, 1.1, back - 0.05]);
      b.add(kit.mat('#CFE7F5', { glass: true }), new THREE.BoxGeometry(w * 0.58, 1.1, 0.02), [0, 1.6, back + 0.21]);
      break;
    }
    case 'booth': {
      // Cabines acústicas com espuma, microfone e mesa de som.
      const foam = kit.mat('#3B4252', { rough: 1 });
      for (const s of [-1, 1]) {
        const x = s * 1.6;
        b.add(foam, new THREE.BoxGeometry(2.2, 2.6, 0.12), [x, 1.3, back]);
        b.add(foam, new THREE.BoxGeometry(0.12, 2.6, 2.0), [x + s * 1.05, 1.3, back + 1]);
        for (let k = 0; k < 12; k++) b.add(foam, new THREE.ConeGeometry(0.1, 0.14, 4), [x - 0.9 + (k % 4) * 0.6, 0.6 + Math.floor(k / 4) * 0.7, back + 0.12], [Math.PI / 2, 0, 0]);
        b.add(metal, new THREE.CylinderGeometry(0.015, 0.015, 1.5, 6), [x, 0.75, back + 1.0]);
        b.add(dark, new THREE.CapsuleGeometry(0.04, 0.08, 4, 8), [x, 1.55, back + 1.0], [0.4, 0, 0]);
        chair(x, back + 1.6, Math.PI);
      }
      desk(0, back + 3.2, 2.2, 0.8, 0, wood);
      b.add(dark, new THREE.BoxGeometry(1.4, 0.08, 0.5), [0, 0.81, back + 3.2], [-0.25, 0, 0]);
      for (let k = 0; k < 16; k++) b.add(kit.mat(['#22D3EE', '#F59E0B', '#F43F5E'][k % 3]!, { glow: true }), new THREE.BoxGeometry(0.03, 0.03, 0.03), [-0.6 + (k % 8) * 0.17, 0.87, back + 3.15 + Math.floor(k / 8) * 0.12]);
      monitor(-0.7, back + 2.9);
      monitor(0.7, back + 2.9);
      chair(0, back + 3.9, Math.PI);
      break;
    }
    case 'gym': {
      const mat = kit.mat('#3F4A5A', { rough: 1 });
      for (let k = 0; k < 2; k++) {
        const x = -1.6 + k * 1.6;
        b.add(dark, new THREE.BoxGeometry(0.8, 0.2, 1.8), [x, 0.15, back + 1.4]);
        b.add(mat, new THREE.BoxGeometry(0.6, 0.02, 1.5), [x, 0.26, back + 1.4]);
        b.add(metal, new THREE.BoxGeometry(0.05, 1.1, 0.05), [x - 0.35, 0.8, back + 0.6]);
        b.add(metal, new THREE.BoxGeometry(0.05, 1.1, 0.05), [x + 0.35, 0.8, back + 0.6]);
        b.add(dark, new THREE.BoxGeometry(0.8, 0.3, 0.12), [x, 1.35, back + 0.6], [-0.4, 0, 0]);
      }
      // Suporte com halteres.
      b.add(metal, new THREE.BoxGeometry(1.6, 0.06, 0.4), [w / 2 - 1.3, 0.55, back + 0.4]);
      for (let k = 0; k < 5; k++) for (const s of [-1, 1]) b.add(dark, new THREE.CylinderGeometry(0.06 + k * 0.01, 0.06 + k * 0.01, 0.06, 12), [w / 2 - 1.95 + k * 0.32 + s * 0.09, 0.64, back + 0.4], [0, 0, Math.PI / 2]);
      for (let k = 0; k < 3; k++) b.add(kit.mat(['#7C3AED', '#0EA5E9', '#10B981'][k]!, { rough: 1 }), new THREE.BoxGeometry(0.7, 0.02, 1.8), [-1.4 + k * 1.2, 0.01, back + 3.8]);
      b.add(kit.mat('#E6EEF5', { metal: 0.9, rough: 0.05 }), new THREE.BoxGeometry(w * 0.55, 2, 0.02), [0, 1.2, back - 0.12]);
      break;
    }
    case 'archive': {
      for (let r = 0; r < 3; r++) {
        const z = back + 0.4 + r * 1.6;
        if (z > d / 2 - 1.2) break;
        shelf(-1.4, z, 2.2, 2.2);
        shelf(1.4, z, 2.2, 2.2);
      }
      desk(0, d / 2 - 1.6, 1.4, 0.7, 0, wood);
      chair(0, d / 2 - 1.0, Math.PI);
      break;
    }
    case 'gallery':
    case 'stage': {
      if (type === 'stage') {
        b.add(wood, new THREE.BoxGeometry(w * 0.6, 0.3, 2), [0, 0.15, back + 1]);
        b.add(dark, new THREE.BoxGeometry(w * 0.5, 1.6, 0.06), [0, 1.8, back + 0.1]);
        b.add(glow, new THREE.BoxGeometry(w * 0.48, 1.45, 0.01), [0, 1.8, back + 0.14]);
        for (let r = 0; r < 3; r++) for (let c = -2; c <= 2; c++) chair(c * 0.7, back + 3 + r * 0.9, Math.PI);
      } else {
        const frames = ['#F2CC8F', '#81B29A', '#E07A5F', '#5B8DB8', '#C06C84'];
        for (let k = 0; k < 4; k++) {
          const x = -w * 0.35 + (k * w * 0.7) / 3;
          b.add(dark, new THREE.BoxGeometry(1.1, 0.85, 0.05), [x, 1.6, back]);
          b.add(kit.mat(frames[(k + seed) % frames.length]!, { rough: 0.8 }), new THREE.BoxGeometry(0.95, 0.7, 0.02), [x, 1.6, back + 0.03]);
        }
        for (let k = 0; k < 2; k++) {
          const x = k ? 1.3 : -1.3;
          b.add(white, new THREE.BoxGeometry(0.6, 1.0, 0.6), [x, 0.5, back + 2.3]);
          b.add(acc, new THREE.TorusKnotGeometry(0.16, 0.05, 48, 8), [x, 1.3, back + 2.3]);
        }
        b.add(wood, new THREE.BoxGeometry(1.8, 0.45, 0.5), [0, 0.22, back + 3.6]);
        seats.push({ x: 0, y: 0.45, z: back + 3.6, face: Math.PI });
      }
      break;
    }
    case 'dataviz': {
      // Parede de telas com gráficos e mesa alta de consulta.
      b.add(dark, new THREE.BoxGeometry(w * 0.62, 1.7, 0.08), [0, 1.65, back]);
      for (let k = 0; k < 3; k++) {
        const x = -w * 0.2 + k * w * 0.2;
        b.add(glow, new THREE.BoxGeometry(w * 0.18, 1.4, 0.01), [x, 1.65, back + 0.05]);
        for (let j = 0; j < 5; j++) {
          const hgt = 0.2 + (((j + 1) * (k + 2) * 37 + seed) % 9) * 0.1;
          b.add(acc, new THREE.BoxGeometry(w * 0.025, hgt, 0.01), [x - w * 0.06 + j * w * 0.03, 1.05 + hgt / 2, back + 0.06]);
        }
      }
      b.add(white, new THREE.CylinderGeometry(0.7, 0.7, 0.05, 24), [0, 1.05, back + 2.4]);
      b.add(metal, new THREE.CylinderGeometry(0.06, 0.12, 1.02, 10), [0, 0.51, back + 2.4]);
      b.add(glow, new THREE.CylinderGeometry(0.5, 0.5, 0.01, 24), [0, 1.08, back + 2.4]);
      desk(-w * 0.28, back + 3.6, 1.4, 0.7);
      monitor(-w * 0.28, back + 3.45);
      chair(-w * 0.28, back + 4.15, Math.PI);
      plant(w * 0.3, back + 3.6, 1.2);
      break;
    }
    case 'lounge': {
      b.add(fabric, new THREE.CylinderGeometry(1.6, 1.6, 0.015, 32), [0, 0.01, 0.2]);
      sofa(0, -1.0, 0, 2.2);
      sofa(-1.6, 0.4, Math.PI / 2, 1.6);
      sofa(1.6, 0.4, -Math.PI / 2, 1.6);
      b.add(lightWood, new THREE.CylinderGeometry(0.55, 0.55, 0.05, 24), [0, 0.42, 0.3]);
      b.add(metal, new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), [0, 0.2, 0.3]);
      b.add(metal, new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), [-2.2, 0.8, -1.4]);
      b.add(kit.mat('#FFF1D6', { glow: true }), new THREE.CylinderGeometry(0.15, 0.25, 0.3, 16, 1, true), [-2.2, 1.65, -1.4]);
      shelf(0, back, 2.4, 1.4);
      plant(2.3, -1.5, 1.3);
      break;
    }
    case 'studio': {
      for (let k = 0; k < 3; k++) {
        const x = -1.6 + k * 1.6;
        const z = back + 1.8;
        // Cavalete com tela.
        b.add(wood, new THREE.BoxGeometry(0.05, 1.7, 0.05), [x - 0.3, 0.85, z], [0.15, 0, 0]);
        b.add(wood, new THREE.BoxGeometry(0.05, 1.7, 0.05), [x + 0.3, 0.85, z], [0.15, 0, 0]);
        b.add(white, new THREE.BoxGeometry(0.8, 0.6, 0.03), [x, 1.35, z + 0.12], [-0.15, 0, 0]);
        b.add(kit.mat(['#F59E0B', '#60A5FA', '#F472B6'][k]!, { rough: 0.9 }), new THREE.BoxGeometry(0.5, 0.3, 0.01), [x, 1.35, z + 0.14], [-0.15, 0, 0]);
        chair(x, z + 0.8, Math.PI);
      }
      desk(0, d / 2 - 1.8, 2.4, 0.9, 0, wood);
      for (let k = 0; k < 6; k++) b.add(kit.mat(['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'][k]!, { rough: 0.5 }), new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), [-0.9 + k * 0.35, 0.83, d / 2 - 1.8]);
      break;
    }
    case 'music': {
      // Bateria, teclado, amplificador e violões no suporte.
      b.add(dark, new THREE.BoxGeometry(1.3, 0.08, 0.4), [-1.4, 0.85, back + 1.4]);
      b.add(white, new THREE.BoxGeometry(1.2, 0.03, 0.15), [-1.4, 0.9, back + 1.5]);
      for (const s of [-1, 1]) b.add(metal, new THREE.BoxGeometry(0.04, 0.82, 0.04), [-1.4 + s * 0.55, 0.41, back + 1.4]);
      chair(-1.4, back + 2.0, Math.PI);
      const drum = kit.mat('#B91C1C', { rough: 0.4 });
      b.add(drum, new THREE.CylinderGeometry(0.3, 0.3, 0.45, 20), [1.4, 0.35, back + 1.2], [Math.PI / 2, 0, 0]);
      for (const [x, y, z] of [[1.0, 0.65, back + 1.6], [1.8, 0.65, back + 1.6], [1.4, 0.75, back + 1.7]] as const) b.add(drum, new THREE.CylinderGeometry(0.17, 0.17, 0.18, 16), [x, y, z]);
      b.add(kit.mat('#E5C07B', { metal: 0.9, rough: 0.2 }), new THREE.CylinderGeometry(0.25, 0.25, 0.01, 20), [2.0, 1.2, back + 1.1]);
      b.add(dark, new THREE.BoxGeometry(0.6, 0.6, 0.35), [0, 0.3, back + 0.6]);
      for (let k = 0; k < 3; k++) b.add(kit.mat('#B5713A', { rough: 0.45 }), new THREE.CylinderGeometry(0.15, 0.15, 0.08, 16), [-0.4 + k * 0.4, 0.45, back + 2.9], [Math.PI / 2 - 0.2, 0, 0]);
      break;
    }
    case 'observatory': {
      b.add(white, new THREE.CylinderGeometry(0.35, 0.45, 0.9, 16), [0, 0.45, 0]);
      b.add(dark, new THREE.CylinderGeometry(0.16, 0.2, 1.8, 16), [0, 1.3, -0.3], [-0.9, 0, 0]);
      b.add(metal, new THREE.TorusGeometry(0.21, 0.03, 6, 20), [0, 1.65, -0.85], [-0.9 + Math.PI / 2, 0, 0]);
      for (let k = 0; k < 4; k++) {
        const a = -Math.PI / 2 + (k / 3) * Math.PI;
        sofa(Math.sin(a) * 2.6, Math.cos(a) * 2.6 - 0.5, a + Math.PI, 1.4);
      }
      break;
    }
    default: {
      // Escritório: ilhas de mesas com monitores, quadro de tarefas e plantas.
      for (let r = 0; r < 2; r++)
        for (const s of [-1, 1]) {
          const z = back + 1.8 + r * 2.1;
          if (z > d / 2 - 1.3) continue;
          desk(s * 1.2, z, 1.6, 0.8);
          monitor(s * 1.2, z - 0.2);
          chair(s * 1.2, z + 0.6, Math.PI);
        }
      board(0, back, Math.min(3.2, w * 0.4), '#F8FAFC', false);
      for (let k = 0; k < 12; k++) b.add(kit.mat(['#FDE68A', '#A7F3D0', '#BFDBFE', '#FBCFE8'][k % 4]!, { rough: 0.9 }), new THREE.BoxGeometry(0.16, 0.16, 0.01), [-1.2 + (k % 6) * 0.48, 1.75 - Math.floor(k / 6) * 0.35, back + 0.03]);
      plant(w / 2 - 0.7, back + 0.5, 1.2);
      plant(-w / 2 + 0.7, back + 0.5);
    }
  }
  return seats;
}
