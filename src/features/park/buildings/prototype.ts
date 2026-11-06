/**
 * Prédios ainda não detalhados (regiões dos próximos blocos): a forma provisória do protótipo,
 * maior e juntada por material. Cada um será substituído pelo prédio detalhado da sua região.
 */
import * as THREE from 'three';
import type { BuildingShape } from '@/domain/park';
import { Builder, type Kit } from '../kit';

const WHITE = '#E8EDF5';
const GLASS = '#9ED8F0';
const DARK = '#334155';
const SCALE = 2.3;

export function prototypeBuilding(kit: Kit, shape: BuildingShape, c: string): THREE.Group {
  const b = new Builder();
  const m = (color: string, glass = false) => (glass ? kit.mat(color, { glass: true }) : kit.mat(color, { rough: 0.6 }));
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, glass = false, ry = 0) => b.add(m(color, glass), new THREE.BoxGeometry(w, h, d), [x, y, z], [0, ry, 0]);
  const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, color: string, seg = 16, glass = false) => b.add(m(color, glass), new THREE.CylinderGeometry(rt, rb, h, seg), [x, y, z]);
  switch (shape) {
    case 'tower':
      box(6, 2, 6, 0, 1, 0, WHITE);
      box(4.5, 12, 4.5, 0, 8, 0, GLASS, true);
      box(4.8, 0.6, 4.8, 0, 14.3, 0, c);
      break;
    case 'house':
      box(6, 4, 5, 0, 2, 0, WHITE);
      b.add(m(c), new THREE.CylinderGeometry(0, 4.2, 3, 4), [0, 5.5, 0], [0, Math.PI / 4, 0]);
      break;
    case 'gear':
      cyl(3.5, 3.5, 5, 0, 2.5, 0, DARK, 12);
      cyl(2.2, 2.2, 6.5, 0, 3.25, 0, c, 12);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        box(1, 4, 1, Math.cos(a) * 3.8, 2, Math.sin(a) * 3.8, DARK);
      }
      break;
    case 'campus':
      box(12, 4, 7, 0, 2, 0, WHITE);
      box(4, 8, 4, -3, 6, 0, GLASS, true);
      box(3, 6, 3, 4, 5, 0, c);
      cyl(0, 1.2, 4, -3, 12, 0, c, 6);
      break;
    case 'pagoda':
      for (let i = 0; i < 4; i++) {
        const w = 8 - i * 1.6;
        box(w, 1.6, w, 0, 0.8 + i * 2, 0, i % 2 ? c : WHITE);
        box(w + 1.2, 0.3, w + 1.2, 0, 1.7 + i * 2, 0, c);
      }
      break;
    case 'library':
      box(11, 1, 8, 0, 0.5, 0, WHITE);
      box(9, 5, 6, 0, 3.5, 0, GLASS, true);
      box(11, 1, 8, 0, 6.5, 0, c);
      for (let i = -2; i <= 2; i++) cyl(0.35, 0.35, 5, i * 2.2, 3.5, 3.6, WHITE, 8);
      break;
    case 'stack':
      for (let i = 0; i < 5; i++) box(6, 1.6, 4.5, 0, 0.8 + i * 1.7, 0, i % 2 ? c : WHITE, false, i * 0.18);
      break;
    case 'observatory':
      cyl(3.5, 4, 6, 0, 3, 0, WHITE, 20);
      b.add(m(c), new THREE.SphereGeometry(3.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, 6, 0]);
      box(0.8, 0.8, 5, 0, 8.5, 1, DARK);
      break;
    case 'cubes':
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) box(2.4, 2 + ((i + j) % 3) * 2, 2.4, (i - 1) * 2.8, 1 + ((i + j) % 3), (j - 1) * 2.8, (i + j) % 2 ? c : WHITE);
      break;
    case 'slab':
      box(8, 13, 3, 0, 6.5, 0, GLASS, true);
      for (let i = 0; i < 4; i++) box(8.2, 0.3, 3.2, 0, 3 + i * 3, 0, c);
      break;
    case 'twist':
      for (let i = 0; i < 6; i++) box(4.5, 2, 4.5, 0, 1 + i * 2.05, 0, i % 2 ? GLASS : c, i % 2 === 1, i * 0.3);
      break;
    case 'hexTower':
      cyl(3.2, 3.6, 2, 0, 1, 0, WHITE, 6);
      cyl(2.6, 2.9, 11, 0, 7.5, 0, c, 6);
      cyl(2.8, 2.8, 0.5, 0, 13.2, 0, GLASS, 6, true);
      break;
    case 'pavilion':
      cyl(4.5, 4.5, 0.6, 0, 0.3, 0, WHITE, 24);
      cyl(0, 5.5, 3, 0, 4.6, 0, c, 24);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cyl(0.25, 0.25, 2.8, Math.cos(a) * 3.8, 1.9, Math.sin(a) * 3.8, WHITE, 8);
      }
      break;
    case 'greenhouse':
      box(10, 0.6, 7, 0, 0.3, 0, WHITE);
      box(9, 4, 6, 0, 2.6, 0, GLASS, true);
      b.add(m(GLASS, true), new THREE.CylinderGeometry(3, 3, 9, 16, 1, false, 0, Math.PI), [0, 4.6, 0], [0, 0, Math.PI / 2]);
      box(9.2, 0.25, 0.25, 0, 7.6, 0, c);
      break;
    case 'terraces':
      for (let i = 0; i < 4; i++) box(9 - i * 2, 1.4, 9 - i * 2, 0, 0.7 + i * 1.4, 0, i === 3 ? c : WHITE);
      cyl(0.15, 0.15, 3, 0, 7, 0, DARK, 6);
      break;
    case 'amphitheater':
      for (let i = 0; i < 4; i++) b.add(kit.mat(i % 2 ? c : WHITE, { side: THREE.DoubleSide }), new THREE.CylinderGeometry(6.5 + i * 0.8, 6.5 + i * 0.8, 0.6, 24, 1, true, 0, Math.PI), [0, 0.3 + i * 0.6, 0]);
      b.add(kit.mat(c, { side: THREE.DoubleSide }), new THREE.SphereGeometry(4, 16, 8, 0, Math.PI, 0, Math.PI / 2), [0, 0, -1], [0, Math.PI, 0]);
      break;
    case 'stadium':
      b.add(m(WHITE), new THREE.TorusGeometry(6.5, 1.4, 8, 28), [0, 1.2, 0], [Math.PI / 2, 0, 0]);
      cyl(5.4, 5.4, 0.2, 0, 0.1, 0, '#4ADE80', 28);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        cyl(0.2, 0.2, 9, Math.cos(a) * 8.5, 4.5, Math.sin(a) * 8.5, DARK, 6);
      }
      break;
    case 'reception':
      cyl(4.5, 5, 1, 0, 0.5, 0, WHITE, 24);
      cyl(3.6, 3.6, 5, 0, 3.5, 0, GLASS, 24, true);
      cyl(4.4, 4.4, 0.5, 0, 6.2, 0, c, 24);
      break;
  }
  const g = b.build();
  g.scale.setScalar(SCALE);
  return g;
}
