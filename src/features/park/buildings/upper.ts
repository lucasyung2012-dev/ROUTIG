/**
 * Pavimentos de cima, por fora (V2.1, seção 10): cada prédio mostra por fora os mesmos andares
 * que tem por dentro (Dashboard 3, Academy 4, Insights 4...), em degraus com terraços, fachada
 * de vidro com montantes, lajes aparentes, guarda-corpos e floreiras. No alto, o elemento que o
 * prompt pede para cada um (cúpula, observatório, telhado de estufa, relógio, cobertura verde...).
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { Builder, type Kit } from '../kit';

const STOREY = 4.4;

export function upperFloors(kit: Kit, id: ModuleId, levels: number, base: number, core: number, accent: string): { group: THREE.Group; top: number } {
  const g = new THREE.Group();
  const b = new Builder();
  if (levels <= 0) return { group: g, top: base };
  const glass = kit.mat('#B9DCEF', { glass: true, side: THREE.DoubleSide });
  const metal = kit.mat('#A8B3C0', { metal: 0.85, rough: 0.3 });
  const slab = kit.mat('#EEF1F4', { rough: 0.6 });
  const stone = kit.mat('#E3DDD0', { rough: 0.85 });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const glow = kit.mat(accent, { glow: true });
  const warm = kit.mat('#FFE7B0', { glow: true });
  const r0 = Math.max(6, core * 0.82);
  let y = base;
  let r = r0;
  for (let L = 0; L < levels; L++) {
    const below = r;
    r = below * 0.86;
    // Laje (com borda aparente) que vira terraço no recuo.
    b.add(slab, new THREE.CylinderGeometry(below + 0.3, below + 0.3, 0.35, 48), [0, y + 0.17, 0]);
    b.add(metal, new THREE.TorusGeometry(below + 0.3, 0.04, 4, 64), [0, y + 1.25, 0], [Math.PI / 2, 0, 0]);
    b.add(kit.mat('#CFE7F5', { glass: true }), new THREE.CylinderGeometry(below + 0.3, below + 0.3, 1.0, 48, 1, true), [0, y + 0.85, 0]);
    // Floreiras no terraço.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + L;
      const tr = (below + r) / 2;
      b.add(stone, new THREE.BoxGeometry(1.4, 0.5, 0.6), [Math.sin(a) * tr, y + 0.6, Math.cos(a) * tr], [0, a, 0]);
      b.add(leaf, new THREE.IcosahedronGeometry(0.45, 1), [Math.sin(a) * tr, y + 1.05, Math.cos(a) * tr], [0, 0, 0], [1.4, 0.8, 0.7]);
    }
    // Fachada do andar: vidro com montantes; à noite, as salas acendem.
    const h = STOREY - 0.35;
    b.add(glass, new THREE.CylinderGeometry(r, r, h, 48, 1, true), [0, y + 0.35 + h / 2, 0]);
    b.add(warm, new THREE.CylinderGeometry(r - 0.6, r - 0.6, h * 0.55, 32, 1, true), [0, y + 0.35 + h * 0.5, 0]);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      b.add(metal, new THREE.BoxGeometry(0.12, h, 0.25), [Math.sin(a) * r, y + 0.35 + h / 2, Math.cos(a) * r], [0, a, 0]);
    }
    b.add(glow, new THREE.TorusGeometry(r + 0.05, 0.05, 4, 64), [0, y + STOREY - 0.05, 0], [Math.PI / 2, 0, 0]);
    y += STOREY;
  }
  // Cobertura do último andar.
  b.add(slab, new THREE.CylinderGeometry(r + 0.5, r + 0.5, 0.4, 48), [0, y + 0.2, 0]);
  const top = y + 0.4;
  // Elemento de cada prédio (prompt, seção 10).
  switch (id) {
    case 'dashboard': {
      // Cobertura de vidro em cúpula, terraço de observação e elevador panorâmico.
      b.add(glass, new THREE.SphereGeometry(r * 0.7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), [0, top, 0]);
      for (let k = 0; k < 12; k++) b.add(metal, new THREE.TorusGeometry(r * 0.7, 0.04, 4, 32, Math.PI), [0, top, 0], [0, (k / 12) * Math.PI, 0]);
      b.add(glass, new THREE.CylinderGeometry(1.4, 1.4, top - base + 6, 24, 1, true), [r0 + 1.2, base + (top - base + 6) / 2 - 3, 0]);
      b.add(glow, new THREE.BoxGeometry(2, 2.4, 2), [r0 + 1.2, base + (top - base) * 0.6, 0]);
      break;
    }
    case 'insights': {
      // Observatório panorâmico: cúpula com fenda e antena.
      b.add(kit.mat('#E5E7EB', { metal: 0.6, rough: 0.3 }), new THREE.SphereGeometry(r * 0.6, 32, 16, 0.3, Math.PI * 2 - 0.6, 0, Math.PI / 2), [0, top, 0]);
      b.add(metal, new THREE.CylinderGeometry(0.08, 0.08, 6, 8), [0, top + r * 0.6 + 3, 0]);
      b.add(glow, new THREE.SphereGeometry(0.25, 10, 8), [0, top + r * 0.6 + 6, 0]);
      break;
    }
    case 'habits': {
      // Terraço botânico sob telhado de estufa.
      const sh = new THREE.Shape([new THREE.Vector2(-r * 0.7, 0), new THREE.Vector2(r * 0.7, 0), new THREE.Vector2(0, r * 0.5)]);
      const roof = new THREE.ExtrudeGeometry(sh, { depth: r * 1.2, bevelEnabled: false });
      roof.translate(0, 0, -r * 0.6);
      b.add(glass, roof, [0, top, 0]);
      for (let k = 0; k < 14; k++) b.add(leaf, new THREE.IcosahedronGeometry(0.7, 1), [(k % 7) * r * 0.18 - r * 0.55, top + 0.6, (k < 7 ? -1 : 1) * r * 0.3]);
      break;
    }
    case 'focus':
    case 'goals':
    case 'languages': {
      // Cobertura verde com jardim (Foco: silêncio; Conquistas: jardins em níveis; Idiomas: jardim interno).
      b.add(kit.mat('#6AA35A', { rough: 1 }), new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.3, 48), [0, top + 0.15, 0]);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        b.add(leaf, new THREE.IcosahedronGeometry(0.6 + (k % 3) * 0.2, 1), [Math.sin(a) * r * 0.7, top + 0.8, Math.cos(a) * r * 0.7]);
      }
      if (id === 'goals') for (let k = 0; k < 3; k++) b.add(kit.mat('#EAB308', { metal: 0.5, rough: 0.3 }), new THREE.ConeGeometry(0.4, 3 + k * 1.5, 6), [(k - 1) * 2.4, top + 1.5 + k * 0.75, 0]);
      break;
    }
    case 'calendar': {
      // Relógio na fachada e anel circular sobre a cobertura.
      b.add(kit.mat('#F8FAFC', { rough: 0.4 }), new THREE.CircleGeometry(3, 48), [0, base + (top - base) / 2, r0 + 0.2]);
      b.add(metal, new THREE.TorusGeometry(3, 0.12, 6, 48), [0, base + (top - base) / 2, r0 + 0.25]);
      b.add(kit.mat('#1F2937'), new THREE.BoxGeometry(0.12, 2.2, 0.06), [0, base + (top - base) / 2 + 0.9, r0 + 0.3]);
      b.add(kit.mat('#1F2937'), new THREE.BoxGeometry(1.6, 0.12, 0.06), [0.7, base + (top - base) / 2, r0 + 0.3]);
      b.add(glow, new THREE.TorusGeometry(r * 0.8, 0.15, 6, 64), [0, top + 2, 0], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 4; k++) b.add(metal, new THREE.CylinderGeometry(0.1, 0.1, 2, 6), [Math.sin((k / 4) * Math.PI * 2) * r * 0.8, top + 1, Math.cos((k / 4) * Math.PI * 2) * r * 0.8]);
      break;
    }
    case 'music': {
      // Cobertura em onda (acústica), de frente para o anfiteatro.
      for (let k = 0; k < 9; k++) b.add(kit.mat('#F5E6EE', { rough: 0.5 }), new THREE.BoxGeometry(r * 1.6, 0.25, 1.4), [0, top + 0.8 + Math.sin(k * 0.8) * 0.9, (k - 4) * 1.4], [Math.cos(k * 0.8) * 0.4, 0, 0]);
      break;
    }
    case 'sports': {
      // Torres de iluminação esportiva.
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        b.add(metal, new THREE.CylinderGeometry(0.15, 0.25, 9, 8), [Math.sin(a) * r * 0.85, top + 4.5, Math.cos(a) * r * 0.85]);
        b.add(warm, new THREE.BoxGeometry(2.2, 1, 0.4), [Math.sin(a) * r * 0.85, top + 9.2, Math.cos(a) * r * 0.85], [0, a, 0]);
      }
      break;
    }
    case 'settings': {
      // Fachada translúcida com faixas de luz discretas.
      for (let k = 0; k < 6; k++) b.add(glow, new THREE.TorusGeometry(r0 * 0.86 - k * 0.2, 0.03, 4, 64), [0, base + 1 + k * ((top - base) / 6), 0], [Math.PI / 2, 0, 0]);
      b.add(metal, new THREE.TorusGeometry(r * 0.6, 0.35, 6, 12), [0, top + 1.2, 0], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'projects': {
      // Volume assimétrico em balanço, com estrutura aparente.
      b.add(kit.mat('#F97316', { rough: 0.6 }), new THREE.BoxGeometry(r * 1.2, 3.2, r * 0.7), [r * 0.55, top + 1.6, 0], [0, 0.3, 0]);
      for (let k = 0; k < 3; k++) b.add(metal, new THREE.BoxGeometry(0.2, 0.2, r * 0.9), [r * 0.1 + k * r * 0.4, top + 0.1, 0], [0.4, 0.3, 0]);
      break;
    }
    case 'finance': {
      // Pedra, vidro e metal: cornija de pedra e coroa metálica.
      b.add(stone, new THREE.CylinderGeometry(r + 0.8, r + 0.8, 0.9, 6), [0, top + 0.45, 0]);
      b.add(kit.mat('#9CA3AF', { metal: 0.9, rough: 0.2 }), new THREE.CylinderGeometry(r * 0.4, r * 0.6, 3, 6), [0, top + 2.4, 0]);
      break;
    }
    case 'academy':
    case 'library': {
      // Terraços de estudo com mesas e pérgola.
      for (let k = 0; k < 5; k++) b.add(kit.mat('#A0714F', { rough: 0.75 }), new THREE.BoxGeometry(r * 1.2, 0.15, 0.2), [0, top + 2.6, (k - 2) * 1.2]);
      for (const s of [-1, 1]) for (const t of [-1, 1]) b.add(kit.mat('#A0714F', { rough: 0.75 }), new THREE.BoxGeometry(0.2, 2.6, 0.2), [s * r * 0.5, top + 1.3, t * 2.4]);
      for (let k = 0; k < 4; k++) b.add(kit.mat('#C9A27A', { rough: 0.7 }), new THREE.CylinderGeometry(0.6, 0.6, 0.06, 16), [(k - 1.5) * 2.2, top + 0.75, 0]);
      break;
    }
    case 'notes': {
      // Clarabóias do ateliê (grandes aberturas de luz).
      for (let k = 0; k < 4; k++) b.add(glass, new THREE.BoxGeometry(2.4, 1.2, 2.4), [(k % 2 ? 1 : -1) * r * 0.35, top + 0.6, (k < 2 ? 1 : -1) * r * 0.35], [0, 0, 0.3]);
      break;
    }
    case 'tasks': {
      // Fachada tecnológica: brises verticais.
      for (let k = 0; k < 36; k++) {
        const a = (k / 36) * Math.PI * 2;
        b.add(metal, new THREE.BoxGeometry(0.08, top - base, 0.7), [Math.sin(a) * (r0 * 0.86 + 0.5), base + (top - base) / 2, Math.cos(a) * (r0 * 0.86 + 0.5)], [0, a, 0]);
      }
      break;
    }
    default: {
      // Profile e Inbox: beiral elegante e terraço contemplativo.
      b.add(slab, new THREE.CylinderGeometry(r + 2, r + 2, 0.25, 48), [0, top + 2.6, 0]);
      for (let k = 0; k < 6; k++) b.add(metal, new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), [Math.sin((k / 6) * Math.PI * 2) * (r + 1.6), top + 1.3, Math.cos((k / 6) * Math.PI * 2) * (r + 1.6)]);
    }
  }
  g.add(b.build());
  return { group: g, top: top + 6 };
}
