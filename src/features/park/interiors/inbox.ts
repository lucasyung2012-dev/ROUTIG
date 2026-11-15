/**
 * Interior da Central de Recepção (Inbox), seção 17. Térreo pela planta do prédio (massing.ts):
 * no hall de entrada (amplo, envidraçado), a recepção à direita e a captura rápida à esquerda; no
 * núcleo de pé-direito duplo (sob o lanternim), o painel de chegadas com os tubos por destino e as
 * mesas de revisão inicial, uma de cada lado do corredor até os elevadores; na ala leste, a parede
 * de entrada de links, arquivos, ideias e solicitações; na ala oeste, o arquivo. Vidro e pedra
 * clara, madeira nos tampos. Os objetos refletem os dados reais: caixas nas mesas de revisão = itens
 * na entrada; caixas no arquivo = arquivados; cápsulas nos tubos = itens por destino; quadros da
 * parede de entrada = os itens mais recentes.
 */
import * as THREE from 'three';
import type { Kit } from '../kit';
import type { Obstacle } from '../camera';
import { canvasPlane, createRoom, finishRoom, setDetailCommon, wrap, zoneLabel, type InteriorScene } from './common';
import { areaView, at, benchSeat, box, chair, closeZone, counter, credenza, cyl, deskLamp, groundSeats, hangSign as hangSignAt, lightBar, lowTable, palette, pendant, planter, rug, sofa, solid, table, tallPlant, zone, type F, type View } from './east';

export const INBOX_SECTORS = ['atrium', 'triage', 'distribution', 'archive', 'gallery'] as const;
export type InboxSector = (typeof INBOX_SECTORS)[number];

/** Destinos que o Inbox já sabe criar. Cores iguais às da legenda do painel. */
export const DESTINATIONS = ['task', 'event', 'note', 'library'] as const;
export type Destination = (typeof DESTINATIONS)[number];
export const DEST_COLORS: Record<Destination, string> = { task: '#22D3EE', event: '#F59E0B', note: '#A78BFA', library: '#34D399' };

export interface ReceptionData {
  open: number;
  snoozed: number;
  processed: number;
  archived: number;
  today: number;
  byType: Record<Destination, number>;
  /** Textos dos itens mais recentes (para os quadros da parede de entrada). */
  recent: string[];
}

export interface InboxLabels {
  sectors: Record<InboxSector, string>;
  flowTitle: string;
  received: string;
  open: string;
  processed: string;
  archived: string;
  today: string;
  destinations: Record<Destination, string>;
  emptyFrame: string;
}

/** Pé-direito do hall de entrada e do volume de distribuição dos fundos (massing.ts). */
const LOW = 9;
/** Mesas da revisão inicial (no sistema do ambiente): centro e para onde olham as cadeiras. */
const TABLES: ReadonlyArray<[number, number]> = [
  [-1.35, 0.6],
  [1.35, 0.6],
  [-1.35, -0.8],
  [1.35, -0.8],
];
/** Tubos por destino, atrás do painel de chegadas (no sistema do ambiente). */
const TUBE_Z = -1.6;
const tubeX = (k: number) => (k - 1.5) * 1.3;

export function createInboxInterior(kit: Kit, labels: InboxLabels): InteriorScene {
  const room = createRoom(kit, { id: 'inbox', floor: '#EEF3F8', glass: '#A9DDF5', frame: '#CBD5E1', accent: '#22D3EE' });
  const { scene, b } = room;
  /** Pé-direito duplo do núcleo e das alas. */
  const H = room.spec.height;
  const ACC = '#22D3EE';
  /** Placa pendurada com a cor do Inbox. */
  const hangSign = (sf: F, g: THREE.Object3D, text: string, x: number, y: number, z: number, ry: number, w: number, top: number) => hangSignAt(kit, g, sf, text, ACC, x, y, z, ry, w, top);
  const p = palette(kit, '#22D3EE', { wood: '#B58B63', stone: '#E6E1D8', concrete: '#D3D6DA', fabric: '#41617F', rug: '#AFC3D6', warm: false });
  const f: F = { b, p };
  const silver = kit.mat('#CBD5E1', { metal: 0.9, rough: 0.22 });
  const white = kit.mat('#F3F6FA', { rough: 0.45 });
  const dark = kit.mat('#1F2A3A', { metal: 0.6, rough: 0.35 });
  const cyan = room.accentMat;
  const obstacles: Obstacle[] = [];
  const picks: THREE.Group[] = [];
  const views: Partial<Record<string, View>> = {};

  // Núcleo: anel de colunas até o teto e o lanternim de vidro no alto do pé-direito duplo.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    b.add(silver, new THREE.BoxGeometry(0.5, H, 0.5), [Math.sin(a) * 9.6, H / 2, Math.cos(a) * 9.6]);
  }
  b.add(kit.mat('#B9E6F7', { glass: true }), new THREE.CylinderGeometry(9.2, 9.2, 4.4, 8, 1, true), [0, H - 2.6, 0], [0, Math.PI / 8, 0]);
  b.add(cyan, new THREE.RingGeometry(9.0, 9.18, 8, 1, Math.PI / 8), [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
  // Faixa de pedra clara no eixo, da entrada ao núcleo.
  b.add(kit.mat('#DCD6CB', { rough: 0.6 }), new THREE.BoxGeometry(2.4, 0.01, 8.0), [0, 0.008, 15]);
  for (const x of [-6, 6]) pendant(f, x, 12.2, 5.6, LOW, 0.4);

  // Recepção, à direita de quem entra: balcão de pedra clara com tampo de madeira, aparador e pendentes.
  {
    const zn = zone(p, 5.6, 15.2, -Math.PI / 2);
    const rf = zn.f;
    counter(rf, 0, 0, 3.4, 0.8, 0, p.stone, p.wood);
    for (const lx of [-0.7, 0.7]) chair(rf, lx, -0.9, 0);
    credenza(rf, 0, -1.75, 3.2, 0, p.wood, 0.8);
    at(rf, p.pot, cyl(0.16, 0.12, 0.26, 12), 1.2, 0.93, -1.75);
    at(rf, p.leaf, new THREE.IcosahedronGeometry(0.24, 1), 1.2, 1.22, -1.75);
    deskLamp(rf, -1.2, 1.1, 0.05, silver);
    for (const lx of [-0.8, 0.8]) pendant(rf, lx, -0.1, 3.4, LOW, 0.3);
    hangSign(rf, zn.g, zoneLabel('reception'), 0, 3.0, 0, Math.PI / 2, 2.4, LOW);
    for (const lx of [-1.0, 1.0]) solid(obstacles, zn, lx, 0, 0.65);
    closeZone(scene, zn);
  }

  // Captura rápida (à esquerda da entrada): três terminais de captura sobre pedestais de pedra,
  // anteparo de vidro com base de pedra e a faixa de luz da marca.
  const captureBar = new THREE.Mesh(kit.own(new THREE.PlaneGeometry(1.6, 0.5)), cyan);
  {
    const zn = zone(p, -5.6, 15.2, Math.PI / 2, 'atrium');
    const cf = zn.f;
    rug(cf, 0, -0.1, 4.2, 1.6, 0, kit.mat('#CFE3EE', { rough: 1 }));
    for (let k = 0; k < 3; k++) {
      const lx = (k - 1) * 1.4;
      at(cf, p.stone, cyl(0.26, 0.36, 1.0, 20), lx, 0.5, 0);
      cf.b.add(dark, box(0.8, 0.5, 0.05), [lx, 1.25, 0.02], [-0.5, 0, 0]);
      cf.b.add(p.accGlow, box(0.72, 0.42, 0.01), [lx, 1.262, 0.045], [-0.5, 0, 0]);
      solid(obstacles, zn, lx, 0, 0.42);
    }
    at(cf, p.stone, box(4.4, 0.14, 0.3), 0, 0.07, -0.85);
    at(cf, p.glass, box(4.2, 2.2, 0.04), 0, 1.24, -0.85);
    at(cf, silver, box(4.2, 0.05, 0.08), 0, 2.36, -0.85);
    captureBar.position.set(0, 2.75, -0.82);
    zn.g.add(captureBar);
    hangSign(cf, zn.g, zoneLabel('capture'), 0, 3.5, -0.3, -Math.PI / 2, 2.4, LOW);
    picks.push(closeZone(scene, zn));
    views.atrium = areaView(room, -5.6, 15.2, Math.PI / 2, 6, 3.6);
  }

  // Entrada de links, arquivos, ideias e solicitações (ala leste): parede de pedra clara com quatro
  // bocas de entrega (uma cor por tipo), os três itens mais recentes em quadros, quiosque de busca e banco.
  const frames: Array<ReturnType<typeof canvasPlane>> = [];
  {
    const zn = zone(p, 18.0, 0, -Math.PI / 2, 'gallery');
    const gf = zn.f;
    at(gf, p.stone, box(8.0, 3.4, 0.3), 0, 1.7, -1.85);
    const SLOT = ['#22D3EE', '#60A5FA', '#A78BFA', '#34D399'];
    for (let k = 0; k < 4; k++) {
      const lx = -2.85 + k * 1.9;
      at(gf, dark, box(1.1, 0.34, 0.06), lx, 1.05, -1.68);
      at(gf, kit.mat(SLOT[k]!, { glow: true }), box(1.2, 0.04, 0.07), lx, 1.25, -1.67);
      at(gf, silver, box(1.2, 0.04, 0.32), lx, 0.86, -1.55);
    }
    for (let k = 0; k < 3; k++) {
      const lx = (k - 1) * 1.9;
      at(gf, silver, box(1.5, 1.1, 0.04), lx, 2.45, -1.69);
      const fr = canvasPlane(kit, 1.36, 0.96, 200, true);
      fr.mesh.position.set(lx, 2.45, -1.66);
      zn.g.add(fr.mesh);
      frames.push(fr);
    }
    // Quiosque de busca (em tudo o que passou pelo Inbox).
    at(gf, white, cyl(0.25, 0.3, 1.1, 16), 3.5, 0.55, 0.5);
    gf.b.add(dark, box(0.7, 0.45, 0.05), [3.5, 1.25, 0.5], [-0.5, 0, 0]);
    benchSeat(gf, -1.0, 1.0, 2.4, 0, p.stone);
    for (const lx of [-3.8, 3.8]) tallPlant(gf, lx, -1.2, 0.9);
    lightBar(gf, 0, -0.6, 6.0, 0, 4.4, H);
    hangSign(gf, zn.g, zoneLabel('intake'), 0, 3.82, -1.68, 0, 3.4, 3.82);
    solid(obstacles, zn, 3.5, 0.5, 0.4);
    picks.push(closeZone(scene, zn));
    views.gallery = areaView(room, 18.0, 0, -Math.PI / 2, 8, 4, 2);
  }

  // Painel de chegadas (núcleo, lado leste): o quadro do fluxo em moldura de pedra sobre dois pilares,
  // o balcão de chegadas embaixo e, atrás, os tubos por destino subindo até o teto, com as cápsulas reais.
  const flow = canvasPlane(kit, 5.6, 2.4, 360);
  const arrivals = zone(p, 6.4, 0, -Math.PI / 2, 'distribution');
  {
    const af = arrivals.f;
    for (const s of [-1, 1]) at(af, p.stone, box(0.35, 4.2, 0.35), s * 3.0, 2.1, 0);
    at(af, p.stone, box(6.4, 0.3, 0.4), 0, 4.35, 0);
    at(af, dark, box(5.8, 2.6, 0.1), 0, 2.95, -0.05);
    flow.mesh.position.set(0, 2.95, 0.02);
    arrivals.g.add(flow.mesh);
    at(af, p.stone, box(5.2, 0.95, 0.45), 0, 0.475, 0.25);
    at(af, p.wood, box(5.3, 0.05, 0.55), 0, 0.975, 0.25);
    DESTINATIONS.forEach((d, k) => {
      const x = tubeX(k);
      at(af, kit.mat('#CFF3FB', { glass: true }), new THREE.CylinderGeometry(0.3, 0.3, H - 0.7, 20, 1, true), x, (H - 0.7) / 2 + 0.6, TUBE_Z);
      at(af, kit.mat(DEST_COLORS[d], { metal: 0.4, rough: 0.3 }), cyl(0.45, 0.5, 0.6, 20), x, 0.3, TUBE_Z);
      at(af, silver, cyl(0.36, 0.36, 0.12, 20), x, H - 0.1, TUBE_Z);
      solid(obstacles, arrivals, x, TUBE_Z, 0.5, 3);
    });
    hangSign(af, arrivals.g, zoneLabel('arrivals'), 0, 4.9, 0, 0, 3.0, H);
    for (const lx of [-1.6, 0, 1.6]) solid(obstacles, arrivals, lx, 0.25, 0.55);
    picks.push(closeZone(scene, arrivals));
    views.distribution = areaView(room, 6.4, 0, -Math.PI / 2, 8, 4.2, 2.4);
  }

  // Revisão inicial (núcleo, lado oeste): quatro mesas de madeira com cadeiras, luminárias e luz linear.
  const review = zone(p, -6.4, 0, Math.PI / 2, 'triage');
  {
    const vf = review.f;
    rug(vf, 0, -0.1, 5.8, 3.4);
    TABLES.forEach(([lx, lz]) => {
      table(vf, lx, lz, 2.2, 0.9, 0, p.wood);
      const front = lz > 0;
      for (const cx of [-0.5, 0.5]) chair(vf, lx + cx, lz + (front ? 0.65 : -0.65), front ? Math.PI : 0);
      deskLamp(vf, lx + (lx > 0 ? 0.85 : -0.85), 0.77, lz - 0.25, silver);
      solid(obstacles, review, lx, lz, 0.75);
    });
    for (const lz of [0.6, -0.8]) lightBar(vf, 0, lz, 5.0, 0, 3.6, H);
    hangSign(vf, review.g, zoneLabel('firstReview'), 0, 3.0, 1.2, 0, 2.6, H);
    picks.push(closeZone(scene, review));
    views.triage = areaView(room, -6.4, 0, Math.PI / 2, 8, 5, 0.9);
  }

  // Arquivo (ala oeste): três estantes abertas com uma caixa por item arquivado e mesa de devolução.
  const archive = zone(p, -18.4, 0, Math.PI / 2, 'archive');
  {
    const xf = archive.f;
    for (const s of [-1, 0, 1]) {
      at(xf, white, box(1.6, 3.2, 0.06), s * 1.75, 1.6, -0.6);
      for (const e of [-1, 1]) at(xf, white, box(0.06, 3.2, 0.55), s * 1.75 + e * 0.8, 1.6, -0.35);
      for (let k = 0; k < 5; k++) at(xf, silver, box(1.62, 0.04, 0.56), s * 1.75, 0.3 + k * 0.66, -0.34);
      solid(obstacles, archive, s * 1.75, -0.35, 0.7, 3.2);
    }
    table(xf, 0, 1.0, 2.0, 0.8, 0, p.wood);
    for (const lx of [-0.5, 0.5]) chair(xf, lx, 1.6, Math.PI);
    hangSign(xf, archive.g, labels.sectors.archive, 0, 3.55, -0.6, 0, 2.6, 3.55);
    picks.push(closeZone(scene, archive));
    views.archive = areaView(room, -18.4, 0, Math.PI / 2, 8, 4);
  }

  // Espera da recepção (núcleo, frente oeste): sofá, poltronas, mesa de centro e plantas.
  {
    const zn = zone(p, -6.0, 6.8, 0);
    const lf = zn.f;
    rug(lf, 0, -0.1, 4.6, 2.4);
    sofa(lf, 0, -0.85, 2.4, 0);
    for (const s of [-1, 1]) sofa(lf, s * 1.5, 0.75, 0.9, Math.PI, kit.mat('#7C8FA6', { rough: 0.95 }));
    lowTable(lf, 0, 0, 1.2, 0.6, 0, p.wood);
    for (const s of [-1, 1]) tallPlant(lf, s * 2.25, -0.9, 0.85);
    solid(obstacles, zn, 0, 0, 0.5, 0.5);
    closeZone(scene, zn);
  }
  // Ilha verde (núcleo, frente leste): floreira com bancos dos dois lados.
  {
    const zn = zone(p, 6.0, 6.8, 0);
    planter(zn.f, 0, 0, 3.0, 0.9, 0, p.stone);
    tallPlant(zn.f, 0, 0, 1.2);
    // Quem senta fica de costas para a floreira.
    benchSeat(zn.f, 0, 0.95, 2.6, Math.PI, p.stone, 0);
    benchSeat(zn.f, 0, -0.95, 2.6, 0, p.stone, Math.PI);
    solid(obstacles, zn, -0.8, 0, 0.6);
    solid(obstacles, zn, 0.8, 0, 0.6);
    closeZone(scene, zn);
  }

  // Instâncias ligadas aos dados (no sistema de cada ambiente).
  const triageCubes = new THREE.InstancedMesh(kit.own(new THREE.BoxGeometry(0.34, 0.26, 0.34)), kit.own(new THREE.MeshStandardMaterial({ roughness: 0.5 })), TABLES.length * 4);
  const archiveBoxes = new THREE.InstancedMesh(kit.own(new THREE.BoxGeometry(0.44, 0.32, 0.34)), kit.mat('#D9C7A6', { rough: 0.8 }), 45);
  const capsules = new THREE.InstancedMesh(kit.own(new THREE.CapsuleGeometry(0.14, 0.28, 4, 8)), kit.own(new THREE.MeshBasicMaterial()), DESTINATIONS.length * 6);
  [triageCubes, capsules].forEach((m) => m.setColorAt(0, new THREE.Color('#ffffff')));
  review.g.add(triageCubes);
  archive.g.add(archiveBoxes);
  arrivals.g.add(capsules);
  triageCubes.count = archiveBoxes.count = capsules.count = 0;
  [triageCubes, archiveBoxes].forEach((m) => (m.castShadow = true));
  triageCubes.userData.sector = 'triage';
  archiveBoxes.userData.sector = 'archive';
  capsules.userData.sector = 'distribution';

  finishRoom(room);
  scene.userData.seats = groundSeats(scene, b);

  let data: ReceptionData | null = null;
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const cubeColors = ['#22D3EE', '#60A5FA', '#14B8A6', '#A78BFA'];

  const drawFlow = () => {
    const ctx = flow.ctx;
    const { width: w, height: h } = ctx.canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8,22,48,0.92)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(34,211,238,0.9)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#BFF6FF';
    ctx.font = '700 34px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(labels.flowTitle, 28, 50);
    const d = data;
    const total = d ? d.open + d.snoozed + d.processed + d.archived : 0;
    const steps: Array<[string, number]> = [
      [labels.received, total],
      [labels.open, d?.open ?? 0],
      [labels.processed, d?.processed ?? 0],
      [labels.archived, d?.archived ?? 0],
    ];
    const bw = (w - 80) / 4;
    steps.forEach(([label, n], i) => {
      const x = 28 + i * (bw + 8);
      ctx.fillStyle = 'rgba(34,211,238,0.14)';
      ctx.fillRect(x, 80, bw - 24, 120);
      ctx.fillStyle = '#E8FBFF';
      ctx.textAlign = 'center';
      ctx.font = '800 52px Inter, system-ui, sans-serif';
      ctx.fillText(String(n), x + (bw - 24) / 2, 150);
      ctx.font = '500 22px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#9BE7F5';
      ctx.fillText(label, x + (bw - 24) / 2, 185);
      if (i < 3) {
        ctx.fillStyle = '#22D3EE';
        ctx.beginPath();
        ctx.moveTo(x + bw - 20, 130);
        ctx.lineTo(x + bw - 4, 140);
        ctx.lineTo(x + bw - 20, 150);
        ctx.fill();
      }
    });
    // Destinos dos processados, em barras.
    const max = Math.max(1, ...(d ? Object.values(d.byType) : [0]));
    ctx.textAlign = 'left';
    DESTINATIONS.forEach((dest, i) => {
      const y = 230 + i * 30;
      const n = d?.byType[dest] ?? 0;
      ctx.fillStyle = '#CFEFFF';
      ctx.font = '500 20px Inter, system-ui, sans-serif';
      ctx.fillText(labels.destinations[dest], 28, y + 16);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(200, y, w - 300, 18);
      ctx.fillStyle = DEST_COLORS[dest];
      ctx.fillRect(200, y, ((w - 300) * n) / max, 18);
      ctx.fillStyle = '#E8FBFF';
      ctx.fillText(String(n), w - 86, y + 16);
    });
    flow.tex.needsUpdate = true;
  };

  const drawFrames = () => {
    frames.forEach((fr, k) => {
      const ctx = fr.ctx;
      const { width: w, height: h } = ctx.canvas;
      const text = data?.recent[k];
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, text ? ['#1E6FD9', '#14B8A6', '#7B3FF6'][k]! : '#94A3B8');
      grad.addColorStop(1, '#0F172A');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '600 22px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      wrap(ctx, text ?? labels.emptyFrame, w - 36, 5).forEach((line, i) => ctx.fillText(line, 18, 40 + i * 30));
      fr.tex.needsUpdate = true;
    });
  };

  const layout = () => {
    const d = data;
    if (!d) return;
    // Uma caixa por item na entrada, até quatro em cada mesa de revisão.
    triageCubes.count = Math.min(TABLES.length * 4, d.open);
    for (let i = 0; i < triageCubes.count; i++) {
      const [tx, tz] = TABLES[i % TABLES.length]!;
      const slot = Math.floor(i / TABLES.length);
      m4.makeTranslation(tx + (slot - 1.5) * 0.45, 0.9, tz + 0.1);
      triageCubes.setMatrixAt(i, m4);
      triageCubes.setColorAt(i, col.set(cubeColors[i % cubeColors.length]!));
    }
    triageCubes.instanceMatrix.needsUpdate = true;
    if (triageCubes.instanceColor) triageCubes.instanceColor.needsUpdate = true;
    archiveBoxes.count = Math.min(45, d.archived);
    for (let i = 0; i < archiveBoxes.count; i++) {
      const unit = i % 3;
      const slot = Math.floor(i / 3);
      const shelfRow = Math.floor(slot / 3);
      m4.makeTranslation((unit - 1) * 1.75 + ((slot % 3) - 1) * 0.5, 0.48 + shelfRow * 0.66, -0.32);
      archiveBoxes.setMatrixAt(i, m4);
    }
    archiveBoxes.instanceMatrix.needsUpdate = true;
    drawFlow();
    drawFrames();
  };
  drawFlow();
  drawFrames();

  return {
    scene,
    sectors: INBOX_SECTORS,
    pickables: picks,
    room: room.spec,
    obstacles,
    view: (id) => {
      if (id === 'entry') return { cam: new THREE.Vector3(0, 7.5, 17.5), target: new THREE.Vector3(0, 1.5, -2) };
      return views[id] ?? views.triage!;
    },
    setData: (d) => {
      data = d as ReceptionData;
      layout();
    },
    tick: (t) => {
      room.trees.tick(t);
      captureBar.position.y = 2.75 + Math.sin(t * 1.5) * 0.02;
      let n = 0;
      DESTINATIONS.forEach((dest, k) => {
        const count = Math.min(6, data?.byType[dest] ?? 0);
        for (let i = 0; i < count; i++) {
          const y = 0.8 + ((t * 0.45 + i / 6) % 1) * (H - 1.6);
          m4.makeTranslation(tubeX(k), y, TUBE_Z);
          capsules.setMatrixAt(n, m4);
          capsules.setColorAt(n, col.set(DEST_COLORS[dest]));
          n++;
        }
      });
      capsules.count = n;
      capsules.instanceMatrix.needsUpdate = true;
      if (capsules.instanceColor) capsules.instanceColor.needsUpdate = true;
    },
    setDetail: (q) => setDetailCommon(room, q),
  };
}
