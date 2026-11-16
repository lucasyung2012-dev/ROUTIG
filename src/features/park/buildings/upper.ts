/**
 * Pavimentos de cima, por fora (V2.1, seção 10): cada prédio mostra por fora os mesmos andares
 * que tem por dentro, pela mesma volumetria (massing.ts) e na mesma arquitetura (forms.ts): cada
 * andar só existe onde há volume naquele nível, com as paredes trecho a trecho na fachada do
 * prédio (vidro, pedra, tijolo, brises, ripas, painéis), as mesmas portas (ponte do elevador e
 * terraços das alas), a cobertura de cada ala que termina mais abaixo (terraço com guarda-corpo,
 * nos prédios com terraço) e o que a planta tem de visível (claraboia do átrio, núcleo que sobe
 * acima da cobertura, jardim a céu aberto). Nos fundos, a torre do elevador envidraçada com as
 * pontes de cada andar. No alto, o elemento de cada prédio; nos prédios com terraço na cobertura
 * (forms.ts), o mesmo terraço de dentro: deque, guarda-corpo, bancos, floreiras e árvores.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { Builder, type Kit } from '../kit';
import { FORMS, alongGeo, circle, clipZ, facadeAlong, facadeMats, hasRoofTerrace, slab as slabGeo, upperPlan, volGeo, volSlab } from '../forms';
import { MASSING, STOREY, liftDist, roofsAt, sideCut, volsAt } from '../massing';
import { alongRun, deckSpots, inVol, insideAt, inscribed, reachAt, segDist, terraceDoors, volPoly, wallRuns, type DeckSpot, type Vol, type WallRun } from '../outline';
import { drawDeck, sundial, sundialSpot } from '../interiors/floors';
import { inWell, liftShaft, stairHole, stairOf, phaseAt } from '../stairs';

/**
 * Onde fica a torre do elevador: `angle` em volta do prédio (0 = frente; π = fundos) e o chão
 * (altura local) em cada ponto, para o lounge ficar nivelado numa base de pedra, nunca enterrado.
 */
export interface LiftSpot {
  angle: number;
  /** Distância do centro do prédio ao centro da torre (fora da parede do térreo). */
  dist?: number;
  ground: (lx: number, lz: number) => number;
}

/** Caixa que contém os volumes (planta local). */
function bbox(vols: readonly Vol[]) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const v of vols)
    for (const [x, z] of volPoly(v, 24)) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

/** Posições (metros a partir de a) dos pontos pedidos que caem neste trecho de parede. */
const doorsOn = (r: WallRun, pts: ReadonlyArray<{ x: number; z: number }>) => pts.filter((p) => segDist(p.x, p.z, r.ax, r.az, r.bx, r.bz) < 0.6).map((p) => alongRun(r, p.x, p.z));

/**
 * Andares de cima e terraço por fora. `base` é o topo do térreo (o 1º andar começa nele, igual
 * por dentro); `lift` diz para que lado ficam a torre do elevador e as pontes.
 */
export function upperFloors(kit: Kit, id: ModuleId, levels: number, base: number, _core: number, accent: string, _body = Infinity, _clear: (lx: number, lz: number) => boolean = () => true, lift: LiftSpot = { angle: Math.PI, ground: () => 0 }): { group: THREE.Group; top: number; near: THREE.Object3D | null; far: THREE.Object3D | null } {
  const g = new THREE.Group();
  const b = new Builder();
  // Detalhe de perto (fachada peça a peça, guarda-corpos, floreiras, frisos) e versão de longe.
  const bd = new Builder();
  const bf = new Builder();
  if (levels <= 0) return { group: g, top: base, near: null, far: null };
  const form = FORMS[id];
  const M = MASSING[id];
  // Planta dos andares de cima (a do térreo ou a própria, como o mezanino do Focus) e terraço na cobertura.
  const fp = upperPlan(form);
  const roofT = hasRoofTerrace(id);
  const glass = kit.mat('#B9DCEF', { glass: true, side: THREE.DoubleSide });
  const railGlass = kit.mat('#CFE7F5', { glass: true });
  const metal = kit.mat('#A8B3C0', { metal: 0.85, rough: 0.3 });
  const slab = kit.mat('#EEF1F4', { rough: 0.6 });
  const roofMat = kit.mat('#D9DAD5', { rough: 0.9 });
  const deckMat = kit.mat('#B08968', { rough: 0.8 });
  const stone = kit.mat('#E3DDD0', { rough: 0.85 });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const glow = kit.mat(accent, { glow: true });
  const warm = kit.mat('#FFE7B0', { glow: true });
  const fm = facadeMats(kit, form);
  const solid = form.facade === 'stone' || form.facade === 'brick' || form.facade === 'panel';
  const warmTone = form.facade === 'stone' || form.facade === 'brick' || form.facade === 'wood';
  // Vazio do meio (o mesmo de dentro).
  const inner = fp === 'atrium' || fp === 'garden' ? Math.max(3.2, M.void) : fp === 'core' ? Math.max(2.6, M.void) : 0;
  const holds = (v: Vol) => inner > 0 && inVol(v, 0, 0, inner + 0.5);
  const yOf = (L: number) => base + (L - 1) * STOREY;
  const far = lift.dist ?? liftDist(id);
  const sb = Math.sin(lift.angle);
  const cb = Math.cos(lift.angle);
  // Passagem da ponte do elevador (direção da torre): sem guarda-corpo nem floreira.
  const onBridge = (x: number, z: number) => x * sb + z * cb > 0 && Math.abs(x * cb - z * sb) < 1.25;
  // Guarda-corpo de vidro ao longo de um trecho, fora da passagem da ponte.
  const rail = (r: { ax: number; az: number; bx: number; bz: number }, y: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(r.bx - r.ax, r.bz - r.az) / 0.8));
    for (let k = 0; k < n; k++) {
      const p = { ax: r.ax + ((r.bx - r.ax) * k) / n, az: r.az + ((r.bz - r.az) * k) / n, bx: r.ax + ((r.bx - r.ax) * (k + 1)) / n, bz: r.az + ((r.bz - r.az) * (k + 1)) / n };
      if (onBridge((p.ax + p.bx) / 2, (p.az + p.bz) / 2)) continue;
      const gl = alongGeo(p, y, 1.0, 0.04);
      bd.add(railGlass, gl.geo, gl.pos, gl.rot);
      const hr = alongGeo(p, y + 1.02, 0.06, 0.07);
      bd.add(metal, hr.geo, hr.pos, hr.rot);
    }
  };
  // Cobertura das alas que terminam no nível L − 1 (na altura do piso de L): laje e, nos prédios
  // com terraço, deque, guarda-corpo nas bordas livres, floreiras e bancos; senão, parapeito.
  const lowRoofs = (L: number, vols: Vol[]) => {
    const roofs = roofsAt(id, L);
    if (!roofs.length) return;
    const y = yOf(L);
    if (L > 1) for (const v of roofs) b.add(roofMat, volSlab(v, y, 0.35, [], 0.05));
    const edges = wallRuns([...vols, ...roofs], 1).filter((r) => r.vol >= vols.length);
    if (!roofT) {
      // No 1º andar, o parapeito das alas térreas já vem com o térreo (shell.ts).
      if (L === 1) return;
      for (const r of edges) {
        const p = alongGeo(r, y, 0.55, 0.25, 0.05, r.nx, r.nz);
        b.add(roofMat, p.geo, p.pos, p.rot);
      }
      return;
    }
    for (const v of roofs) b.add(deckMat, volSlab(v, y + 0.03, 0.03));
    for (const r of edges) rail(r, y);
    drawDeck(kit, bd, deckSpots(roofs, edges, 0, Math.PI, false), y, warmTone, null, null);
  };

  for (let L = 1; L <= levels; L++) {
    const y = yOf(L);
    const vols = volsAt(id, L);
    const runs = wallRuns(vols, 1);
    // Laje do andar com a borda aparente (no mezanino, só até a galeria: na frente fica o pé-direito alto).
    const zv = fp === 'side' ? sideCut(id, L) : Infinity;
    for (const v of vols) {
      const pts = Number.isFinite(zv) ? clipZ(volPoly(v), zv) : volPoly(v);
      if (pts.length >= 3) b.add(slab, slabGeo(pts, [], y, 0.35));
    }
    lowRoofs(L, vols);
    // Portas: a da ponte do elevador (onde a ponte encosta) e uma em cada trecho de frente para o terraço das alas.
    const back = reachAt(vols, lift.angle, far);
    const doorPts: Array<{ x: number; z: number }> = [{ x: sb * back, z: cb * back }, ...(roofT ? terraceDoors(runs, roofsAt(id, L)) : [])];
    // Fachada do andar no tipo do prédio; por trás, as salas acesas à noite.
    const h = STOREY - 0.3;
    for (const r of runs) {
      facadeAlong(bd, form, fm, r, y, h, doorsOn(r, doorPts));
      // De longe: o mesmo plano, nas mesmas cores (parapeito, faixa de vidro, verga), sem as peças miúdas.
      const p1 = alongGeo(r, y, 0.95, 0.3);
      bf.add(solid ? fm.frame : fm.metal, p1.geo, p1.pos, p1.rot);
      const p2 = alongGeo(r, y + 0.95, 1.9, 0.1, -0.05, r.nx, r.nz);
      bf.add(fm.glass, p2.geo, p2.pos, p2.rot);
      const p3 = alongGeo(r, y + 2.85, h - 2.85, 0.3);
      bf.add(solid ? fm.frame : fm.metal, p3.geo, p3.pos, p3.rot);
      // Friso de luz da cor do prédio na borda da laje.
      const fz = alongGeo(r, y + STOREY - 0.08, 0.06, 0.06, 0.05, r.nx, r.nz);
      bd.add(glow, fz.geo, fz.pos, fz.rot);
    }
    for (const v of vols) b.add(warm, volGeo(v, 0.9, 2.0, true), [0, y + 1.0, 0]);
  }
  // Cobertura do último andar (com o furo do jardim ou do átrio) e das alas que acabam ali.
  const topVols = volsAt(id, levels);
  const top = yOf(levels + 1);
  // Com terraço, a escada principal chega a ele pelo vão na cobertura (o mesmo de dentro).
  const st = stairOf(id);
  const shTop = roofT ? stairHole(st, levels + 1) : null;
  for (const v of topVols) {
    const holes: Array<Array<[number, number]>> = holds(v) && fp === 'garden' ? [circle(inner)] : holds(v) && fp === 'atrium' ? [circle(inner * 0.8)] : [];
    if (shTop && st?.vols.includes(v)) holes.push(shTop);
    b.add(slab, volSlab(v, top, 0.4, holes, 0.2));
  }
  const tb = bbox(topVols);
  const rTop = Math.max(4, inscribed(topVols));
  // Casa de máquinas na cobertura (ar-condicionado com ventilador, dutos e antena), só de perto.
  if (!roofT && ['tasks', 'finance', 'notes', 'inbox', 'profile', 'settings', 'calendar', 'projects', 'music'].includes(id)) {
    const unit = kit.mat('#C9CED6', { metal: 0.5, rough: 0.4 });
    const grille = kit.mat('#4B5563', { metal: 0.6, rough: 0.5 });
    for (const a of [(3 * Math.PI) / 4, -(3 * Math.PI) / 4]) {
      const x = tb.cx + Math.sin(a) * tb.w * 0.3;
      const z = tb.cz + Math.cos(a) * tb.d * 0.3;
      if (!insideAt(topVols, x, z, 1.4) || Math.hypot(x, z) < inner + 1.5) continue;
      bd.add(unit, new THREE.BoxGeometry(1.8, 1.1, 1.2), [x, top + 0.55, z], [0, a, 0]);
      bd.add(grille, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20), [x, top + 1.13, z]);
      bd.add(grille, new THREE.BoxGeometry(0.06, 0.04, 0.8), [x, top + 1.17, z], [0, a, 0]);
      bd.add(unit, new THREE.CylinderGeometry(0.15, 0.15, 2.2, 10), [x * 0.85 + tb.cx * 0.15, top + 0.3, z * 0.85 + tb.cz * 0.15], [0, 0, Math.PI / 2]);
    }
    bd.add(metal, new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), [tb.cx + tb.w * 0.25, top + 1.6, tb.cz - tb.d * 0.15]);
  }
  // O que a planta mostra por fora.
  if (fp === 'atrium' && id !== 'dashboard') {
    // Claraboia em cúpula de vidro sobre o átrio (a mesma de dentro).
    b.add(glass, new THREE.SphereGeometry(inner * 0.8, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, top - 0.3, 0], undefined, [1, 0.35, 1]);
    for (let k = 0; k < 8; k++) b.add(metal, new THREE.TorusGeometry(inner * 0.8, 0.03, 4, 24, Math.PI), [0, top - 0.3, 0], [0, (k / 8) * Math.PI, 0], [1, 0.35, 1]);
  }
  if (fp === 'core') {
    // O núcleo da escada sobe acima da cobertura (casa de pedra; com a casa de máquinas, sem terraço).
    b.add(stone, new THREE.CylinderGeometry(inner, inner, roofT ? 2.8 : 3.2, 32), [0, top + (roofT ? 1.4 : 1.6), 0]);
    b.add(metal, new THREE.CylinderGeometry(inner + 0.25, inner + 0.25, 0.3, 32), [0, top + (roofT ? 2.95 : 3.3), 0]);
  }
  if (fp === 'garden') {
    // Jardim interno a céu aberto: as copas aparecem pelo vão da cobertura.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
      // As árvores do pátio ficam no chão do 1º andar (como por dentro).
      const tx = Math.sin(a) * inner * 0.6;
      const tz0 = Math.cos(a) * inner * 0.6;
      b.add(kit.mat('#6B4F3A', { rough: 0.9 }), new THREE.CylinderGeometry(0.12, 0.18, 2.8, 8), [tx, base + 1.4, tz0]);
      b.add(leaf, new THREE.IcosahedronGeometry(1.3, 1), [tx, base + 3.3, tz0]);
    }
  }
  // Terraço na cobertura (o mesmo do interior): deque, guarda-corpo de vidro em toda a borda (aberto
  // na ponte do elevador) e em volta da claraboia/jardim do meio, floreiras e bancos junto à borda,
  // árvores em vasos e mesas no meio; a escada do núcleo chega pela casa de pedra (núcleo acima).
  if (roofT) {
    const ring = fp === 'garden' || fp === 'atrium' ? (fp === 'atrium' ? inner * 0.8 : inner) : 0;
    const free = fp === 'core' ? inner + 0.3 : ring ? ring + 0.6 : 0;
    for (const v of topVols) {
      const holes: Array<Array<[number, number]>> = ring && holds(v) ? [circle(ring + 0.05)] : [];
      if (shTop && st?.vols.includes(v)) holes.push(shTop);
      b.add(deckMat, volSlab(v, top + 0.03, 0.03, holes));
    }
    const edges = wallRuns(topVols, 1);
    for (const r of edges) rail(r, top);
    // Guarda-corpo em volta do vão da escada no terraço (aberto no patamar, por onde se entra nela).
    if (shTop && st) for (const [a, c] of phaseAt(st, levels + 1).rails) rail({ ax: a[0], az: a[1], bx: c[0], bz: c[1] }, top);
    if (ring) {
      const c = circle(ring + (fp === 'atrium' ? 0.35 : 0.1), 40);
      for (let i = 0; i < c.length; i++) {
        const p = c[i]!;
        const q = c[(i + 1) % c.length]!;
        const gl = alongGeo({ ax: p[0], az: p[1], bx: q[0], bz: q[1] }, top, 1.0, 0.04);
        bd.add(railGlass, gl.geo, gl.pos, gl.rot);
      }
    }
    let spots: DeckSpot[] = deckSpots(topVols, edges, free + 0.6, lift.angle).filter((s) => !inWell(st, s.x, s.z, 1.6));
    // Calendar: o relógio de sol do Mirante do Tempo, na frente do terraço (o mesmo de dentro).
    const dial = id === 'calendar' ? sundialSpot(topVols) : null;
    if (dial) {
      spots = spots.filter((s) => Math.hypot(s.x - dial.x, s.z - dial.z) > 3);
      sundial(kit, bd, dial.x, top, dial.z);
    }
    drawDeck(kit, bd, spots, top, warmTone, null, null);
  }
  // Torre do elevador nos fundos, com as pontes de cada andar.
  const tz = -far;
  // Chão do lounge: nivelado pelo ponto mais alto (com base de pedra até o mais baixo).
  const ry = lift.angle - Math.PI;
  const groundAt = (x: number, z: number) => lift.ground(x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry));
  // Poço dos elevadores (o mesmo de dentro: uma ou duas cabines lado a lado) e a meia largura do
  // pavilhão de vidro em volta da base dele.
  const shaft = liftShaft(id);
  const hp = Math.max(2.5, shaft.w / 2 + 1.0);
  let gMax = -Infinity;
  let gMin = Infinity;
  for (const x of [-(hp + 2.2), 0, hp + 2.2])
    for (const z of [tz - 4, tz + 1.2, tz + 6.2]) {
      const gy = groundAt(x, z);
      gMax = Math.max(gMax, gy);
      gMin = Math.min(gMin, gy);
    }
  // Quanto o lounge sobe (o piso fica 15 cm acima do ponto mais alto do chão de lá).
  const dy = Math.max(0.3, gMax + 0.15) - 0.3;
  // Peças da torre e do lounge: giradas para o lado escolhido (e o lounge na altura do chão de lá),
  // juntas no mesmo desenho do prédio (sem chamadas de desenho a mais).
  const placed = (rise: number) => ({
    add: (m: THREE.Material, geo: THREE.BufferGeometry, pos: [number, number, number] = [0, 0, 0], rot?: [number, number, number], sc?: [number, number, number]) => {
      if (sc) geo.scale(...sc);
      if (rot) geo.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
      geo.translate(pos[0], pos[1] + rise, pos[2]);
      geo.rotateY(ry);
      b.add(m, geo);
    },
  });
  const eb = placed(0);
  const lb = placed(dy);
  const towerBot = Math.min(0, gMin - 0.2);
  // Com terraço, a torre passa da cobertura: a cabine para no terraço.
  const towerTop = roofT ? top + 3.4 : top + 1;
  // Poço fechado de concreto (elevadores convencionais) com uma faixa de luz da cor do prédio no alto.
  const concrete = kit.mat('#D9D5CD', { rough: 0.85 });
  eb.add(concrete, new THREE.BoxGeometry(shaft.w + 0.4, towerTop - towerBot, shaft.d + 0.2), [0, (towerTop + towerBot) / 2, tz]);
  eb.add(slab, new THREE.BoxGeometry(shaft.w + 0.6, 0.3, shaft.d + 0.6), [0, towerTop + 0.15, tz]);
  eb.add(glow, new THREE.BoxGeometry(shaft.w + 0.42, 0.12, shaft.d + 0.22), [0, towerTop - 0.5, tz]);
  // Hall de cada pavimento entre a fachada e o poço: laje, vidro dos lados e laje em cima.
  const hall = (yy: number, back: number) => {
    const zf = tz + shaft.d / 2;
    const zIn = -back + 0.3;
    const len = zIn - zf;
    if (len <= 0.05) return;
    const zc = (zIn + zf) / 2;
    eb.add(slab, new THREE.BoxGeometry(shaft.w, 0.3, len), [0, yy - 0.15, zc]);
    for (const s of [-1, 1]) eb.add(glass, new THREE.BoxGeometry(0.06, 2.9, len), [s * (shaft.w / 2 - 0.03), yy + 1.45, zc]);
    eb.add(slab, new THREE.BoxGeometry(shaft.w + 0.2, 0.2, len), [0, yy + 3.0, zc]);
  };
  for (let L = 1; L <= levels; L++) hall(yOf(L), reachAt(volsAt(id, L), lift.angle, far));
  // Hall da cobertura até o poço (terraço).
  if (roofT) hall(top, reachAt(topVols, lift.angle, far));
  // Lounge do elevador no chão: piso de pedra, pavilhão de vidro em volta da base da torre (porta
  // do lado, banco, plantas, luz), passagem coberta até o prédio e bancos com poste na entrada.
  {
    const pave = kit.mat('#D8D1C3', { rough: 0.85 });
    const curb = kit.mat('#B9B1A2', { rough: 0.9 });
    const wood = kit.mat('#A0714F', { rough: 0.75 });
    const dark = kit.mat('#2B3442', { metal: 0.5, rough: 0.4 });
    const pz = tz + 1.2;
    // Base de pedra do chão mais baixo até o piso (terreno em declive).
    const pBot = gMin - 0.3 - dy;
    const plinth = 0.02 - pBot;
    const bw = 2 * hp + 4;
    if (plinth > 0.05) lb.add(curb, new THREE.BoxGeometry(bw + 0.6, plinth, 10.6), [0, (0.02 + pBot) / 2, pz]);
    lb.add(curb, new THREE.BoxGeometry(bw + 0.4, 0.3, 10.4), [0, 0.12, pz]);
    lb.add(pave, new THREE.BoxGeometry(bw, 0.32, 10), [0, 0.14, pz]);
    for (let k = -Math.floor(bw / 2); k <= Math.floor(bw / 2); k++) lb.add(curb, new THREE.BoxGeometry(0.04, 0.01, 10), [k, 0.305, pz]);
    // Pavilhão de vidro em volta da base do poço: montantes, porta de 1,8 m no lado leste, laje e luz no teto.
    const H2 = 3.2;
    const gl = kit.mat('#CFE7F5', { glass: true });
    lb.add(gl, new THREE.BoxGeometry(2 * hp, H2, 0.06), [0, 0.3 + H2 / 2, tz - 2.5]);
    lb.add(gl, new THREE.BoxGeometry(0.06, H2, 5), [-hp, 0.3 + H2 / 2, tz]);
    lb.add(gl, new THREE.BoxGeometry(0.06, H2, 1.6), [hp, 0.3 + H2 / 2, tz - 1.7]);
    lb.add(gl, new THREE.BoxGeometry(0.06, H2, 1.6), [hp, 0.3 + H2 / 2, tz + 1.7]);
    lb.add(gl, new THREE.BoxGeometry(0.06, H2 - 2.4, 1.8), [hp, 0.3 + 2.4 + (H2 - 2.4) / 2, tz]);
    for (const [x, z] of [[-hp, -2.5], [hp, -2.5], [-hp, 2.5], [hp, 2.5], [hp, -0.9], [hp, 0.9], [0, -2.5], [-hp, 0]] as const) lb.add(dark, new THREE.BoxGeometry(0.1, H2, 0.1), [x, 0.3 + H2 / 2, tz + z]);
    lb.add(slab, new THREE.BoxGeometry(2 * hp + 0.6, 0.25, 5.6), [0, 0.3 + H2 + 0.12, tz]);
    lb.add(warm, new THREE.CylinderGeometry(0.5, 0.5, 0.03, 20), [hp - 0.9, 0.3 + H2 - 0.02, tz + 1.9]);
    // Placa luminosa sobre a porta (setas de sobe e desce).
    lb.add(dark, new THREE.BoxGeometry(0.06, 0.5, 1.0), [hp + 0.06, 0.3 + 2.75, tz]);
    lb.add(glow, new THREE.ConeGeometry(0.12, 0.18, 3), [hp + 0.1, 0.3 + 2.86, tz], [0, 0, -Math.PI / 2]);
    lb.add(glow, new THREE.ConeGeometry(0.12, 0.18, 3), [hp + 0.1, 0.3 + 2.64, tz], [Math.PI, 0, -Math.PI / 2]);
    // Dentro: banco no fundo e duas plantas.
    lb.add(wood, new THREE.BoxGeometry(1.6, 0.08, 0.45), [-1.6, 0.75, tz - 1.9]);
    lb.add(dark, new THREE.BoxGeometry(1.4, 0.45, 0.35), [-1.6, 0.52, tz - 1.9]);
    for (const [x, z] of [[-hp + 0.6, 1.9], [hp - 0.6, -1.9]] as const) {
      lb.add(kit.mat('#D9CBB6', { rough: 0.8 }), new THREE.CylinderGeometry(0.3, 0.24, 0.55, 14), [x, 0.58, tz + z]);
      lb.add(leaf, new THREE.IcosahedronGeometry(0.45, 1), [x, 1.25, tz + z], undefined, [1, 1.4, 1]);
    }
    // Passagem coberta até o prédio: cobertura de vidro sobre pilares finos.
    const back = reachAt(volsAt(id, 0), lift.angle, far) - 0.3;
    const len = -back - (tz + 2.5);
    if (len > 0.6) {
      lb.add(gl, new THREE.BoxGeometry(3, 0.06, len), [0, 0.3 + H2, (tz + 2.5 - back) / 2]);
      for (const sx of [-1, 1]) lb.add(dark, new THREE.BoxGeometry(0.1, H2, 0.1), [sx * 1.45, 0.3 + H2 / 2, (tz + 2.5 - back) / 2]);
    }
    // Lado de fora: dois bancos virados para a porta e um poste de luz.
    for (const sz of [-1, 1]) {
      lb.add(wood, new THREE.BoxGeometry(0.45, 0.08, 1.6), [hp + 1.4, 0.75, tz + sz * 2.6]);
      lb.add(dark, new THREE.BoxGeometry(0.35, 0.45, 1.4), [hp + 1.4, 0.52, tz + sz * 2.6]);
    }
    lb.add(dark, new THREE.CylinderGeometry(0.06, 0.08, 3.6, 8), [hp + 1.6, 0.3 + 1.8, tz]);
    lb.add(warm, new THREE.SphereGeometry(0.2, 12, 8), [hp + 1.6, 0.3 + 3.7, tz]);
  }
  // Elemento de cada prédio (prompt, seção 10), sobre a cobertura do volume mais alto.
  switch (id) {
    case 'dashboard': {
      // Cobertura de vidro em cúpula, terraço de observação e elevador panorâmico.
      b.add(glass, new THREE.SphereGeometry(rTop * 0.7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), [0, top, 0]);
      for (let k = 0; k < 12; k++) b.add(metal, new THREE.TorusGeometry(rTop * 0.7, 0.04, 4, 32, Math.PI), [0, top, 0], [0, (k / 12) * Math.PI, 0]);
      break;
    }
    case 'focus': {
      // Cobertura verde com jardim (silêncio) sobre o mezanino.
      for (const v of topVols) b.add(kit.mat('#6AA35A', { rough: 1 }), volSlab(v, top + 0.3, 0.3, [], -0.6));
      for (let k = 0; k < 16; k++) {
        const x = tb.x0 + 1.4 + ((k % 8) / 7) * (tb.w - 2.8);
        const z = k < 8 ? tb.z0 + 1.4 : tb.z1 - 1.4;
        if (insideAt(topVols, x, z, 0.8)) b.add(leaf, new THREE.IcosahedronGeometry(0.6 + (k % 3) * 0.2, 1), [x, top + 0.8, z]);
      }
      break;
    }
    case 'music': {
      // Cobertura em onda (acústica) sobre a torre do auditório.
      const n = Math.max(3, Math.floor(tb.d / 1.4));
      for (let k = 0; k < n; k++) b.add(kit.mat('#F5E6EE', { rough: 0.5 }), new THREE.BoxGeometry(tb.w - 0.4, 0.25, 1.4), [tb.cx, top + 0.8 + Math.sin(k * 0.8) * 0.9, tb.z0 + 0.7 + k * ((tb.d - 1.4) / (n - 1))], [Math.cos(k * 0.8) * 0.4, 0, 0]);
      break;
    }
    case 'sports': {
      // Torres de iluminação esportiva nos cantos da nave.
      for (const [x, z] of [[tb.x0 + 1.2, tb.z0 + 1.2], [tb.x1 - 1.2, tb.z0 + 1.2], [tb.x0 + 1.2, tb.z1 - 1.2], [tb.x1 - 1.2, tb.z1 - 1.2]] as const) {
        b.add(metal, new THREE.CylinderGeometry(0.15, 0.25, 9, 8), [x, top + 4.5, z]);
        b.add(warm, new THREE.BoxGeometry(2.2, 1, 0.4), [x, top + 9.2, z], [0, Math.atan2(x, z), 0]);
      }
      break;
    }
    case 'settings': {
      // Fachada translúcida com faixas de luz discretas.
      b.add(metal, new THREE.TorusGeometry(rTop * 0.6, 0.35, 6, 12), [0, top + 1.2, 0], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'finance': {
      // Pedra, vidro e metal: cornija de pedra em volta da cobertura e coroa metálica no meio.
      for (const v of topVols) b.add(stone, volSlab(v, top + 0.9, 0.9, [], 0.8));
      b.add(kit.mat('#9CA3AF', { metal: 0.9, rough: 0.2 }), new THREE.CylinderGeometry(rTop * 0.3, rTop * 0.45, 3, 6), [tb.cx, top + 2.4, tb.cz]);
      break;
    }
    case 'notes': {
      // Clarabóias do ateliê (grandes aberturas de luz).
      for (let k = 0; k < 4; k++) b.add(glass, new THREE.BoxGeometry(2.4, 1.2, 2.4), [tb.cx + (k % 2 ? 1 : -1) * tb.w * 0.22, top + 0.6, tb.cz + (k < 2 ? 1 : -1) * tb.d * 0.22], [0, 0, 0.3]);
      break;
    }
    case 'profile':
    case 'inbox': {
      // Beiral elegante sobre pilares finos.
      for (const v of topVols) b.add(slab, volSlab(v, top + 2.85, 0.25, [], 2));
      for (const [x, z] of [[tb.x0 + 0.6, tb.z0 + 0.6], [tb.x1 - 0.6, tb.z0 + 0.6], [tb.x0 + 0.6, tb.z1 - 0.6], [tb.x1 - 0.6, tb.z1 - 0.6]] as const) b.add(metal, new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), [x, top + 1.3, z]);
      break;
    }
    default:
      // Academy, Library, Idiomas, Goals, Insights, Projects, Tasks e Calendar: a cobertura é o
      // terraço (acima), igual ao de dentro.
      break;
  }
  const near = bd.build();
  const farG = bf.build(false);
  farG.visible = false;
  g.add(b.build(), near, farG);
  return { group: g, top: top + 6, near, far: farG };
}
