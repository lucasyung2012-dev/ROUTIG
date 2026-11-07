/**
 * Pavimentos de cima, por fora (V2.1, seção 10): cada prédio mostra por fora os mesmos andares
 * que tem por dentro, na mesma arquitetura (forms.ts): a forma do andar (redonda, quadrada,
 * hexagonal...), os recuos com terraço, o giro da torre torcida, a fachada (vidro, pedra,
 * tijolo, brises, ripas, painéis) e o que a planta tem de visível (claraboia do átrio, núcleo
 * que sobe acima da cobertura, jardim a céu aberto, pé-direito alto envidraçado do mezanino).
 * Nos fundos, a torre do elevador envidraçada com as pontes de cada andar. No alto, o elemento
 * que o prompt pede para cada um (cúpula, observatório, telhado de estufa, relógio...).
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { Builder, type Kit } from '../kit';
import { FORMS, apothem, circle, facade, facadeMats, levelRot, levelScale, outline, slab as slabGeo } from '../forms';

const STOREY = 4.4;

export function upperFloors(kit: Kit, id: ModuleId, levels: number, base: number, core: number, accent: string): { group: THREE.Group; top: number } {
  const g = new THREE.Group();
  const b = new Builder();
  if (levels <= 0) return { group: g, top: base };
  const form = FORMS[id];
  const glass = kit.mat('#B9DCEF', { glass: true, side: THREE.DoubleSide });
  const metal = kit.mat('#A8B3C0', { metal: 0.85, rough: 0.3 });
  const slab = kit.mat('#EEF1F4', { rough: 0.6 });
  const stone = kit.mat('#E3DDD0', { rough: 0.85 });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const glow = kit.mat(accent, { glow: true });
  const warm = kit.mat('#FFE7B0', { glow: true });
  const fm = facadeMats(kit, form);
  const r0 = Math.max(6, core * 0.82);
  const segs = form.sides >= 3 ? form.sides : 48;
  const ownRot = (L: number) => (form.sides >= 3 ? levelRot(form, L) : 0);
  // Cilindro com a forma do andar (o CylinderGeometry começa no ângulo `thetaStart` do eixo +z).
  const prism = (R: number, h: number, L: number) => new THREE.CylinderGeometry(R, R, h, segs, 1, true, ownRot(L));
  // Pilares (pilotis) do chão até a laje do 1º andar, na borda: a laje não fica solta sobre o térreo.
  {
    const n = form.sides >= 6 ? form.sides : form.sides >= 3 ? form.sides * 2 : 12;
    const col = kit.mat(form.facade === 'stone' || form.facade === 'brick' ? form.frame : '#D5DBE2', { rough: 0.6 });
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.PI / n;
      if (Math.abs(Math.sin(a)) < 0.2 && Math.cos(a) > 0) continue; // livre na frente (entrada)
      b.add(col, new THREE.CylinderGeometry(0.35, 0.42, base + 0.4, 12), [Math.sin(a) * r0 * 0.93, (base + 0.4) / 2, Math.cos(a) * r0 * 0.93]);
    }
  }
  let y = base;
  let r = r0;
  for (let L = 1; L <= levels; L++) {
    r = r0 * levelScale(form, L);
    const rot = ownRot(L);
    const below = L === 1 ? circle(r0 + 0.3, 64) : outline(form.sides, ownRot(L - 1), r0 * levelScale(form, L - 1) * 1.02);
    const own = outline(form.sides, rot, r * 1.02);
    // Laje do andar com borda aparente e o terraço do recuo (quando sobra borda do andar de baixo).
    b.add(slab, slabGeo(own, [], y + 0.35, 0.35));
    const terrace = L === 1 ? r0 - r > 1.2 : apothem(form.sides, r0 * levelScale(form, L - 1)) - r > 1.2 && form.twist === 0;
    if (terrace || L === 1) b.add(kit.mat('#E4DED2', { rough: 0.85 }), slabGeo(below, [own], y + 0.33, 0.33));
    if (terrace) {
      // Guarda-corpo de vidro e floreiras no terraço.
      for (let i = 0; i < below.length; i++) {
        const p = below[i]!;
        const q = below[(i + 1) % below.length]!;
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const ang = Math.atan2(q[0] - p[0], q[1] - p[1]);
        b.add(kit.mat('#CFE7F5', { glass: true }), new THREE.BoxGeometry(0.04, 1.0, len), [(p[0] + q[0]) / 2, y + 0.85, (p[1] + q[1]) / 2], [0, ang, 0]);
        b.add(metal, new THREE.BoxGeometry(0.07, 0.06, len), [(p[0] + q[0]) / 2, y + 1.37, (p[1] + q[1]) / 2], [0, ang, 0]);
      }
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + L;
        const tr = r + 0.9;
        b.add(stone, new THREE.BoxGeometry(1.2, 0.5, 0.5), [Math.sin(a) * tr, y + 0.6, Math.cos(a) * tr], [0, a, 0]);
        b.add(leaf, new THREE.IcosahedronGeometry(0.4, 1), [Math.sin(a) * tr, y + 1.0, Math.cos(a) * tr], [0, 0, 0], [1.4, 0.8, 0.7]);
      }
    }
    // Fachada do andar no tipo do prédio; por trás, as salas acesas à noite.
    facade(b, form, fm, r, rot, y + 0.35, STOREY - 0.35);
    b.add(warm, prism(apothem(form.sides, r) - 0.7, (STOREY - 0.35) * 0.5, L), [0, y + 0.35 + (STOREY - 0.35) * 0.5, 0]);
    // Friso de luz da cor do prédio na borda da laje.
    for (let i = 0; i < own.length; i++) {
      const p = own[i]!;
      const q = own[(i + 1) % own.length]!;
      b.add(glow, new THREE.BoxGeometry(0.06, 0.06, Math.hypot(q[0] - p[0], q[1] - p[1])), [(p[0] + q[0]) / 2, y + STOREY - 0.02, (p[1] + q[1]) / 2], [0, Math.atan2(q[0] - p[0], q[1] - p[1]), 0]);
    }
    y += STOREY;
  }
  // Cobertura do último andar (com o furo do jardim ou do átrio).
  const roofHole = form.plan === 'garden' ? [circle(Math.max(3.2, apothem(form.sides, r) * 0.36))] : [];
  b.add(slab, slabGeo(outline(form.sides, ownRot(levels), r * 1.05), roofHole, y + 0.4, 0.4));
  const top = y + 0.4;
  // O que a planta mostra por fora.
  const inner = Math.max(3.2, apothem(form.sides, r) * 0.36);
  if (form.plan === 'atrium' && id !== 'dashboard') {
    // Claraboia em pirâmide de vidro sobre o átrio.
    b.add(glass, new THREE.ConeGeometry(inner, inner * 0.7, segs, 1, true, ownRot(levels)), [0, top + inner * 0.35, 0]);
    for (let k = 0; k < Math.min(segs, 12); k++) {
      const a = ownRot(levels) + (k / Math.min(segs, 12)) * Math.PI * 2;
      b.add(metal, new THREE.BoxGeometry(0.06, 0.06, inner * 1.2), [Math.sin(a) * inner * 0.5, top + inner * 0.35, Math.cos(a) * inner * 0.5], [-0.6, a, 0]);
    }
  }
  if (form.plan === 'core') {
    // O núcleo da escada sobe acima da cobertura, com a casa de máquinas.
    const cr = Math.max(2.6, apothem(form.sides, r) * 0.24);
    b.add(stone, new THREE.CylinderGeometry(cr, cr, 3.2, 32), [0, top + 1.6, 0]);
    b.add(metal, new THREE.CylinderGeometry(cr + 0.2, cr + 0.2, 0.3, 32), [0, top + 3.3, 0]);
  }
  if (form.plan === 'garden') {
    // Jardim interno a céu aberto: as copas aparecem pelo vão da cobertura.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
      // As árvores do pátio ficam no chão do 1º andar (como por dentro).
      const tx = Math.sin(a) * inner * 0.6;
      const tz0 = Math.cos(a) * inner * 0.6;
      b.add(kit.mat('#6B4F3A', { rough: 0.9 }), new THREE.CylinderGeometry(0.12, 0.18, 2.8, 8), [tx, base + 0.35 + 1.4, tz0]);
      b.add(leaf, new THREE.IcosahedronGeometry(1.3, 1), [tx, base + 0.35 + 3.3, tz0]);
    }
  }
  if (form.plan === 'side') {
    // Pé-direito alto do mezanino: aletas verticais contínuas na frente, de cima a baixo.
    for (let k = -4; k <= 4; k++) b.add(fm.frame, new THREE.BoxGeometry(0.18, top - base, 0.9), [k * r * 0.12, base + (top - base) / 2, apothem(form.sides, r0 * levelScale(form, 1)) + 0.6]);
  }
  // Torre do elevador nos fundos, com as pontes de cada andar.
  const tz = -(r0 + 2.2);
  b.add(glass, new THREE.CylinderGeometry(1.4, 1.4, top + 1, 24, 1, true), [0, (top + 1) / 2, tz]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    b.add(metal, new THREE.BoxGeometry(0.12, top + 1, 0.12), [Math.sin(a) * 1.4, (top + 1) / 2, tz + Math.cos(a) * 1.4]);
  }
  b.add(slab, new THREE.CylinderGeometry(1.7, 1.7, 0.3, 24), [0, top + 1.15, tz]);
  for (let L = 1; L <= levels; L++) {
    const yy = base + (L - 1) * STOREY + 0.35;
    const back = apothem(form.sides, r0 * levelScale(form, L));
    b.add(slab, new THREE.BoxGeometry(2.4, 0.3, -tz - back + 0.4), [0, yy - 0.15, -(back - tz) / 2]);
  }
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
      b.add(kit.mat('#6AA35A', { rough: 1 }), slabGeo(circle(r * 0.85, 48), [circle(inner + 0.4)], top + 0.3, 0.3));
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
      // Fachada tecnológica (os brises já estão na fachada): antenas e faixa de LED na cobertura.
      for (let k = 0; k < 3; k++) b.add(metal, new THREE.CylinderGeometry(0.06, 0.06, 4 + k, 6), [(k - 1) * 2.2, top + 2 + k / 2, -r * 0.3]);
      b.add(glow, new THREE.BoxGeometry(r * 1.2, 0.12, 0.12), [0, top + 0.5, r * 0.6]);
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
