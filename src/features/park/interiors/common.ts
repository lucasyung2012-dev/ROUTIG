/**
 * Base dos interiores: o térreo pela planta do prédio (massing.ts), igual ao de fora: piso de cada
 * volume, paredes na fachada do prédio (o jardim aparece pelo vidro), teto de cada volume na sua
 * altura (vazio do átrio, pé-direito alto do mezanino ou claraboia), luz e placas de setor. Cada
 * prédio monta os próprios ambientes em cima disto.
 * Um interior por vez fica na memória (criado ao entrar, descartado ao sair).
 */
import * as THREE from 'three';
import { seededRandom } from '@/domain/park';
import { Builder, forest, sky, type Kit, type Plant, type TreeSpecies } from '../kit';
import type { Obstacle } from '../camera';
import type { Quality } from '../world';
import type { Floors } from './floors';
import type { ModuleId } from '@/app/modules';
import { FORMS, circle, clipZ, facadeMats, slab, upperPlan, volSlab, wallsAlong } from '../forms';
import { MASSING, groundHeight, groundSpan, sideCut, topLevel, volsAt } from '../massing';
import { exitAt, inVol, insideAt, tallerInside, volPoly, wallRuns, type Vol, type WallRun } from '../outline';
import { stairHole, stairOf } from '../stairs';

export interface InteriorScene {
  scene: THREE.Scene;
  sectors: readonly string[];
  /** Objetos tocáveis, com `userData.sector`. */
  pickables: THREE.Object3D[];
  /** Vista de um setor; 'entry' = vista larga da entrada, mostrando o salão inteiro. */
  view: (id: string) => { cam: THREE.Vector3; target: THREE.Vector3 };
  room: RoomSpec;
  obstacles: Obstacle[];
  setData: (d: unknown) => void;
  tick: (t: number, camera: THREE.Camera) => void;
  setDetail: (q: Quality) => void;
  /** Andares acima do térreo (V2.1, seção 11), quando o prédio tem. */
  floors?: Floors;
}

/** O térreo pela planta do prédio (massing.ts): onde se anda, a fachada e o tamanho. */
export interface RoomSpec {
  /** Raio que cobre a planta (câmera). */
  radius: number;
  /** Pé-direito do térreo (o 1º andar começa aqui). */
  height: number;
  /** Fachada da frente (entrada) e dos fundos (elevadores) em x = 0. */
  front: number;
  back: number;
  /** Onde não se pisa: fora da planta (com folga das paredes). */
  blocked: (x: number, z: number) => boolean;
  /** Para a câmera da 3ª pessoa não atravessar a parede (do mesmo lado de quem anda). */
  wallAt: (x: number, z: number) => number;
}

export interface RoomOpts {
  /** Prédio: a planta e a fachada vêm dele (massing.ts, forms.ts). */
  id: ModuleId;
  floor: string;
  glass: string;
  frame: string;
  accent: string;
}

export interface Room {
  scene: THREE.Scene;
  key: THREE.DirectionalLight;
  b: Builder;
  trees: ReturnType<typeof forest>;
  accentMat: THREE.MeshBasicMaterial;
  spec: RoomSpec;
  /** Volumes do térreo e as paredes (trechos), para encaixar os móveis na planta. */
  vols: Vol[];
  runs: WallRun[];
  /** O volume principal (o maior que contém o centro). */
  main: Vol;
  /** Prédio (a escada principal dele atravessa as galerias do térreo). */
  id: ModuleId;
}

/** Área do volume (para achar o principal). */
const area = (v: Vol) => (v.kind === 'rect' ? v.w * v.d : v.kind === 'circle' ? Math.PI * v.r * v.r : 0.5 * v.sides * v.r * v.r * Math.sin((Math.PI * 2) / v.sides));

/** Salão do térreo pela planta do prédio. `b` recebe as peças do prédio; chame `finish` no fim. */
export function createRoom(kit: Kit, o: RoomOpts): Room {
  const M = MASSING[o.id];
  const form = FORMS[o.id];
  const g = volsAt(o.id, 0);
  const span = groundSpan(o.id);
  const R = span.bound;
  const H = M.ground;
  const hOf = (i: number) => groundHeight(o.id, g[i]!);
  const runs = wallRuns(g, 1, hOf);
  const scene = new THREE.Scene();
  const sk = sky(kit);
  sk.set(new THREE.Color('#5AA9E6'), new THREE.Color('#E3F2F9'));
  scene.add(sk.mesh);
  sk.mesh.userData.outdoorOnly = true;
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#9FB0C4', 0.85));
  const key = new THREE.DirectionalLight('#FFF6E8', 1.2);
  key.position.set(R * 0.4, 30, R * 0.3);
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -R - 2, right: R + 2, top: R + 2, bottom: -R - 2, near: 1, far: 60 });
  scene.add(key);

  // Lado de fora: gramado e um anel de árvores visto pelo vidro.
  const lawn = new THREE.Mesh(kit.own(new THREE.CircleGeometry(220, 48)), kit.mat('#6FAE5C', { rough: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.05;
  lawn.userData.outdoorOnly = true;
  scene.add(lawn);
  const rnd = seededRandom(Math.round(R * 13));
  const ring: Plant[] = [];
  const species: TreeSpecies[] = ['round', 'conifer', 'slender', 'blossom'];
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const r = R + 6 + rnd() * 40;
    ring.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, s: 1 + rnd() * 0.6, species: species[i % 4]! });
  }
  const trees = forest(kit, ring);
  trees.group.userData.outdoorOnly = true;
  scene.add(trees.group);

  const b = new Builder();
  const frame = kit.mat(o.frame, { metal: 0.85, rough: 0.25 });
  const floor = kit.mat(o.floor, { rough: 0.18, metal: 0.12 });
  // Piso de cada volume.
  for (const v of g) b.add(floor, volSlab(v, 0, 0.1));
  // Paredes: a mesma fachada de fora (vidro, pedra, tijolo, ripas, brises, painéis), por dentro,
  // com o vidro na cor do prédio e os montantes na cor da estrutura; a entrada envidraçada na frente.
  const fm = { ...facadeMats(kit, form), glass: kit.mat(o.glass, { glass: true, side: THREE.DoubleSide }), metal: frame };
  wallsAlong(b, form, fm, runs, hOf, M.entry, { glass: kit.mat('#CFEFFB', { glass: true, side: THREE.DoubleSide }), dark: frame });
  // Teto de cada volume na sua altura. Sobre o átrio, o vazio continua até a claraboia do alto; na
  // planta com mezanino, o pé-direito alto da frente fica aberto; volume sem andar em cima (e com o
  // centro) ganha a claraboia; o resto é laje fechada (há andar em cima).
  const up = upperPlan(form);
  const cut = topLevel(o.id) >= 1 && up === 'side' ? sideCut(o.id, 1) : Infinity;
  const ceil = kit.mat('#F3F6FA', { rough: 0.5 });
  const glassTop = kit.mat('#CDEFFB', { glass: true });
  g.forEach((v, i) => {
    const h = hOf(i);
    const centre = inVol(v, 0, 0, 1);
    const above = v.hi >= 1;
    // Volume mais alto que sobe do meio deste (torre sobre o embasamento): furo no teto.
    const holes: Array<Array<[number, number]>> = tallerInside(g, i, hOf);
    // Vão da escada principal (stairs.ts) no teto, no volume que a contém inteira (sobe ao 1º andar).
    const stairUp = stairOf(o.id);
    const sh = stairHole(stairUp, 1);
    if (sh && above && stairUp?.vols.includes(v)) holes.push(sh);
    let sky0 = 0;
    if (centre && above && up === 'atrium') holes.push(circle(M.void, 40));
    else if (centre && !above && M.sky) {
      sky0 = Math.min(M.sky, ...[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => exitAt([v], a, 0) - 1.5));
      if (sky0 > 1) holes.push(circle(sky0, 40));
      else sky0 = 0;
    }
    let pts = volPoly(v);
    if (above && Number.isFinite(cut)) pts = clipZ(pts, cut);
    if (pts.length >= 3) b.add(ceil, slab(pts, holes, h - 0.02, 0.25));
    if (sky0) {
      b.add(glassTop, new THREE.CircleGeometry(sky0, 48), [0, h + 0.6, 0], [Math.PI / 2, 0, 0]);
      b.add(frame, new THREE.CylinderGeometry(sky0 + 0.1, sky0 + 0.1, 0.6, 48, 1, true), [0, h + 0.3, 0]);
    }
  });
  const accentMat = kit.own(new THREE.MeshBasicMaterial({ color: o.accent }));
  const main = g.filter((v) => inVol(v, 0, 0)).sort((u, v) => area(v) - area(u))[0] ?? g[0]!;
  const spec: RoomSpec = {
    radius: R,
    height: H,
    front: span.front,
    back: span.back,
    blocked: (x, z) => !insideAt(g, x, z, 0.45),
    wallAt: (x, z) => Math.hypot(x, z) + (insideAt(g, x, z, 0.35) ? 1 : -1),
  };
  return { scene, key, b, trees, accentMat, spec, vols: g, runs, main, id: o.id };
}

/**
 * Galeria (mezanino em volta do vazio do meio) na altura `y`: a laje segue a planta do volume
 * principal do térreo, com o vazio redondo de raio `inner` no meio.
 */
export function gallerySlab(room: Room, y: number, inner: number, thick = 0.25): THREE.BufferGeometry {
  const holes: Array<Array<[number, number]>> = [circle(inner, 40)];
  // A escada principal (stairs.ts) atravessa a galeria: o vão dela, quando fica fora do vazio do meio.
  const st = stairOf(room.id);
  if (st && st.well.every(([x, z]) => Math.hypot(x, z) > inner + 0.1 && inVol(room.main, x, z, 0.05))) holes.push(st.well);
  return slab(volPoly(room.main), holes, y, thick);
}

/**
 * Lugares ao longo das paredes (de `vol`, ou de todos os volumes), `n` no total, recuados `inset` m
 * para dentro, com `face` = ângulo da normal da parede para fora; `skip` tira os que não servem
 * (entrada, elevadores). Só paredes que vão do chão (não as que sobem acima de uma ala mais baixa).
 */
export function wallSpots(room: Room, n: number, inset: number, skip: (x: number, z: number) => boolean = () => false, vol?: Vol): Array<{ x: number; z: number; face: number }> {
  const vi = vol ? room.vols.indexOf(vol) : -1;
  const runs = room.runs.filter((r) => (vi < 0 || r.vol === vi) && r.from === 0);
  const total = runs.reduce((s, r) => s + r.len, 0);
  const out: Array<{ x: number; z: number; face: number }> = [];
  if (!total || n <= 0) return out;
  const step = total / n;
  let acc = step / 2;
  for (const r of runs) {
    while (acc <= r.len) {
      const x = r.ax + ((r.bx - r.ax) * acc) / r.len - r.nx * inset;
      const z = r.az + ((r.bz - r.az) * acc) / r.len - r.nz * inset;
      if (!skip(x, z) && insideAt(room.vols, x, z, Math.min(inset, 0.5))) out.push({ x, z, face: Math.atan2(r.nx, r.nz) });
      acc += step;
    }
    acc -= r.len;
  }
  return out;
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

/** Ambientes do térreo com placa própria (nomes em i18n: park.zones.*). */
export type ZoneKey = 'reception' | 'orientation' | 'atrium' | 'lounge' | 'infoPanel' | 'lifts' | 'stairs' | 'immersion' | 'international' | 'exhibits' | 'conversation' | 'courseInfo' | 'writingStudio' | 'ideas' | 'quietRooms' | 'capture' | 'catalog' | 'newMaterials' | 'casualReading' | 'arrivals' | 'intake' | 'firstReview' | 'timePanel' | 'quickAgenda' | 'dayView' | 'tasksOverview' | 'quickCreate' | 'priority' | 'review' | 'projectsBoard' | 'newProject' | 'activeProjects' | 'status' | 'garden' | 'focusStation' | 'focusSettings' | 'choose' | 'prepare' | 'singleRooms' | 'booths' | 'privacyDesks' | 'habitStation' | 'routineLab' | 'tracking' | 'pauseGarden' | 'overview' | 'newGoal' | 'indicators' | 'analysisAccess' | 'musicSocial' | 'instruments' | 'smallStage' | 'multiuse' | 'conditioning' | 'individual' | 'lockers' | 'financeView' | 'balances' | 'mainFunctions' | 'vault';
let zoneText: (k: ZoneKey) => string = (k) => k;
/** O ParkPage passa a tradução uma vez; os interiores pedem o nome do ambiente por chave. */
export function setZoneLabels(fn: (k: ZoneKey) => string): void {
  zoneText = fn;
}
export const zoneLabel = (k: ZoneKey): string => zoneText(k);

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
