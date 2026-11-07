/**
 * Base dos interiores: salão com piso, paredes de vidro (o jardim aparece lá fora), teto com
 * claraboia, luz e placas de setor. Cada prédio monta os próprios ambientes em cima disto.
 * Um interior por vez fica na memória (criado ao entrar, descartado ao sair).
 */
import * as THREE from 'three';
import { seededRandom } from '@/domain/park';
import { Builder, forest, sky, type Kit, type Plant, type TreeSpecies } from '../kit';
import type { Obstacle } from '../camera';
import type { Quality } from '../world';
import type { Floors } from './floors';

export interface InteriorScene {
  scene: THREE.Scene;
  sectors: readonly string[];
  /** Objetos tocáveis, com `userData.sector`. */
  pickables: THREE.Object3D[];
  /** Vista de um setor; 'entry' = vista larga da entrada, mostrando o salão inteiro. */
  view: (id: string) => { cam: THREE.Vector3; target: THREE.Vector3 };
  room: { radius: number; height: number };
  obstacles: Obstacle[];
  setData: (d: unknown) => void;
  tick: (t: number, camera: THREE.Camera) => void;
  setDetail: (q: Quality) => void;
  /** Andares acima do térreo (V2.1, seção 11), quando o prédio tem. */
  floors?: Floors;
}

export interface RoomOpts {
  radius: number;
  height: number;
  /** Lados do salão (6, 8, 12…; 64 = redondo). */
  sides: number;
  floor: string;
  glass: string;
  frame: string;
  accent: string;
  skylight?: number;
}

export interface Room {
  scene: THREE.Scene;
  key: THREE.DirectionalLight;
  b: Builder;
  trees: ReturnType<typeof forest>;
  accentMat: THREE.MeshBasicMaterial;
}

/** Salão base. `b` recebe as peças do prédio; chame `finish` no fim. */
export function createRoom(kit: Kit, o: RoomOpts): Room {
  const scene = new THREE.Scene();
  const sk = sky(kit);
  sk.set(new THREE.Color('#5AA9E6'), new THREE.Color('#E3F2F9'));
  scene.add(sk.mesh);
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#9FB0C4', 0.85));
  const key = new THREE.DirectionalLight('#FFF6E8', 1.2);
  key.position.set(o.radius * 0.4, 30, o.radius * 0.3);
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -o.radius - 2, right: o.radius + 2, top: o.radius + 2, bottom: -o.radius - 2, near: 1, far: 60 });
  scene.add(key);

  // Lado de fora: gramado e um anel de árvores visto pelo vidro.
  const lawn = new THREE.Mesh(kit.own(new THREE.CircleGeometry(220, 48)), kit.mat('#6FAE5C', { rough: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.05;
  scene.add(lawn);
  const rnd = seededRandom(Math.round(o.radius * 13));
  const ring: Plant[] = [];
  const species: TreeSpecies[] = ['round', 'conifer', 'slender', 'blossom'];
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const r = o.radius + 6 + rnd() * 40;
    ring.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, s: 1 + rnd() * 0.6, species: species[i % 4]! });
  }
  const trees = forest(kit, ring);
  scene.add(trees.group);

  const b = new Builder();
  const frame = kit.mat(o.frame, { metal: 0.85, rough: 0.25 });
  const rot = o.sides <= 12 ? Math.PI / o.sides : 0;
  b.add(kit.mat(o.floor, { rough: 0.18, metal: 0.12 }), new THREE.CylinderGeometry(o.radius, o.radius, 0.1, o.sides), [0, -0.05, 0], [0, rot, 0]);
  b.add(kit.mat(o.glass, { glass: true, side: THREE.DoubleSide }), new THREE.CylinderGeometry(o.radius, o.radius, o.height, o.sides, 1, true), [0, o.height / 2, 0], [0, rot, 0]);
  const mullions = o.sides <= 12 ? o.sides * 4 : 56;
  for (let i = 0; i < mullions; i++) {
    const a = (i / mullions) * Math.PI * 2;
    b.add(frame, new THREE.BoxGeometry(0.1, o.height, 0.3), [Math.sin(a) * (o.radius - 0.15), o.height / 2, Math.cos(a) * (o.radius - 0.15)], [0, a, 0]);
  }
  // Teto com claraboia central.
  const sky0 = o.skylight ?? o.radius * 0.3;
  b.add(kit.mat('#F3F6FA', { rough: 0.5 }), new THREE.RingGeometry(sky0, o.radius + 0.3, o.sides <= 12 ? o.sides : 96, 1, rot), [0, o.height, 0], [Math.PI / 2, 0, 0]);
  b.add(kit.mat('#CDEFFB', { glass: true }), new THREE.CircleGeometry(sky0, 48), [0, o.height + 0.6, 0], [Math.PI / 2, 0, 0]);
  b.add(frame, new THREE.CylinderGeometry(sky0 + 0.1, sky0 + 0.1, 0.6, 48, 1, true), [0, o.height + 0.3, 0]);
  const accentMat = kit.own(new THREE.MeshBasicMaterial({ color: o.accent }));
  return { scene, key, b, trees, accentMat };
}

export function finishRoom(room: Room): void {
  room.scene.add(room.b.build());
}

/** Plano com desenho em canvas (placas, telas, quadros). */
export function canvasPlane(kit: Kit, w: number, h: number, px = 256, opaque = false): { mesh: THREE.Mesh; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = Math.round(px * (w / h));
  c.height = px;
  const ctx = c.getContext('2d')!;
  const tex = kit.own(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(kit.own(new THREE.PlaneGeometry(w, h)), kit.own(new THREE.MeshBasicMaterial({ map: tex, transparent: !opaque, side: THREE.DoubleSide, depthWrite: opaque })));
  return { mesh, ctx, tex };
}

/** Placa do setor (nome), com a cor do prédio. Duas faces: legível dos dois lados. */
export function sectorSign(kit: Kit, label: string, accent: string, w = 2.6): THREE.Object3D {
  const s = canvasPlane(kit, w, w * 0.25, 128);
  (s.mesh.material as THREE.MeshBasicMaterial).side = THREE.FrontSide;
  const c = s.ctx.canvas;
  s.ctx.fillStyle = 'rgba(12,24,44,0.94)';
  s.ctx.fillRect(0, 0, c.width, c.height);
  s.ctx.fillStyle = accent;
  s.ctx.fillRect(0, c.height - 8, c.width, 8);
  s.ctx.fillStyle = '#F1FAFF';
  s.ctx.font = '700 56px Inter, system-ui, sans-serif';
  s.ctx.textAlign = 'center';
  s.ctx.textBaseline = 'middle';
  s.ctx.fillText(label, c.width / 2, c.height / 2 - 3, c.width - 30);
  s.tex.needsUpdate = true;
  const back = new THREE.Mesh(s.mesh.geometry, s.mesh.material);
  back.rotation.y = Math.PI;
  const g = new THREE.Group();
  g.add(s.mesh, back);
  return g;
}

/** Quebra um texto em linhas que cabem na largura. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else cur = next;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/.{0,2}$/, '')}…`;
  return lines;
}

/** Um setor: grupo posicionado, virado para `face` (ângulo y), marcado para toque. */
export function sectorGroup(id: string, x: number, z: number, face: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = face;
  g.userData.sector = id;
  return g;
}

export function markSector(g: THREE.Object3D, id: string) {
  g.traverse((o) => (o.userData.sector = id));
}

/** Câmera para um setor: recua na direção para onde o setor olha, do alto, vendo-o inteiro. */
export function sectorView(x: number, z: number, face: number, back = 12, height = 5.6) {
  return {
    cam: new THREE.Vector3(x + Math.sin(face) * back, height, z + Math.cos(face) * back),
    target: new THREE.Vector3(x, 1.2, z),
  };
}

/** Plantas em vasos (decoração). */
export function pots(kit: Kit, b: Builder, spots: Array<[number, number]>) {
  for (const [x, z] of spots) {
    b.add(kit.mat('#E5E7EB', { rough: 0.5 }), new THREE.CylinderGeometry(0.45, 0.35, 0.8, 16), [x, 0.4, z]);
    b.add(kit.mat('#4C9A4F', { rough: 0.9 }), new THREE.IcosahedronGeometry(0.75, 1), [x, 1.35, z]);
  }
}

/** Bancos baixos (decoração). */
export function bench(kit: Kit, b: Builder, x: number, z: number, ry: number, len = 2.4) {
  b.add(kit.mat('#A0714F', { rough: 0.7 }), new THREE.BoxGeometry(len, 0.12, 0.6), [x, 0.48, z], [0, ry, 0]);
  b.add(kit.mat('#475569', { metal: 0.6 }), new THREE.BoxGeometry(len - 0.3, 0.42, 0.45), [x, 0.21, z], [0, ry, 0]);
}

/** Luminárias pendentes (discos de luz). */
export function pendants(kit: Kit, b: Builder, spots: Array<[number, number]>, y: number, ceiling: number, color = '#FFF1D6') {
  for (const [x, z] of spots) {
    b.add(kit.mat('#334155', { metal: 0.6 }), new THREE.CylinderGeometry(0.02, 0.02, ceiling - y, 4), [x, (ceiling + y) / 2, z]);
    b.add(kit.mat(color, { glow: true }), new THREE.CylinderGeometry(0.5, 0.6, 0.12, 20), [x, y, z]);
  }
}

export function setDetailCommon(room: Room, q: Quality) {
  room.trees.setCount(q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1);
  room.key.castShadow = q === 'high';
}
