/**
 * Interior da Central de Recepção (Inbox), conforme o plano (3.10):
 * Átrio na entrada → Central de Triagem no núcleo (sob o painel de fluxo) → Centro de Distribuição
 * logo atrás; Arquivo na ala oeste, Galeria na ala leste. Os objetos refletem os dados reais:
 * caixas na triagem = itens na entrada; caixas no arquivo = arquivados; cápsulas = itens por destino.
 */
import * as THREE from 'three';
import { Builder, type Kit } from '../kit';
import { bench, canvasPlane, createRoom, finishRoom, markSector, pendants, pots, sectorGroup, sectorSign, sectorView, setDetailCommon, wrap, type InteriorScene } from './common';

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
  /** Textos dos itens mais recentes (para os quadros da galeria). */
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

const R = 22;
const H = 9;
/** Posição e frente (para onde o setor "olha") de cada setor na planta. */
const PLAN: Record<InboxSector, { x: number; z: number; face: number }> = {
  atrium: { x: 0, z: 14, face: Math.PI },
  triage: { x: 0, z: 1, face: 0 },
  distribution: { x: 0, z: -13, face: 0 },
  archive: { x: -15, z: 0, face: Math.PI / 2 },
  gallery: { x: 15, z: 0, face: -Math.PI / 2 },
};

export function createInboxInterior(kit: Kit, labels: InboxLabels): InteriorScene {
  const room = createRoom(kit, { radius: R, height: H, sides: 8, floor: '#EEF3F8', glass: '#A9DDF5', frame: '#CBD5E1', accent: '#22D3EE', skylight: 9 });
  const { scene, b } = room;
  const silver = kit.mat('#CBD5E1', { metal: 0.9, rough: 0.22 });
  const white = kit.mat('#F3F6FA', { rough: 0.45 });
  const dark = kit.mat('#1F2A3A', { metal: 0.6, rough: 0.35 });
  const blue = kit.mat('#1E6FD9', { metal: 0.35, rough: 0.3 });
  const cyan = room.accentMat;

  // Núcleo: anel de colunas e lanternim alto (o volume de 16 m visto de dentro).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    b.add(silver, new THREE.BoxGeometry(0.5, H, 0.5), [Math.sin(a) * 9.6, H / 2, Math.cos(a) * 9.6]);
  }
  b.add(kit.mat('#B9E6F7', { glass: true }), new THREE.CylinderGeometry(9.2, 9.2, 6, 8, 1, true), [0, H + 3.2, 0], [0, Math.PI / 8, 0]);
  // Piso: anel de luz no núcleo e linhas de luz até cada setor.
  const lb = new Builder();
  lb.add(cyan, new THREE.RingGeometry(9.0, 9.18, 8, 1, Math.PI / 8), [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
  for (const id of INBOX_SECTORS) {
    if (id === 'triage') continue;
    const p = PLAN[id];
    const len = Math.hypot(p.x, p.z) - 4;
    const a = Math.atan2(p.x, p.z);
    lb.add(cyan, new THREE.PlaneGeometry(0.12, len), [Math.sin(a) * (len / 2 + 2), 0.013, Math.cos(a) * (len / 2 + 2)], [-Math.PI / 2, 0, a]);
  }
  scene.add(lb.build(false));
  // Decoração: vasos, bancos, luminárias.
  pots(kit, b, [[-8, 17], [8, 17], [-18, 9], [18, 9], [-18, -9], [18, -9], [-6, -19], [6, -19]]);
  bench(kit, b, -6, 11, 0);
  bench(kit, b, 6, 11, 0);
  pendants(kit, b, [[-12, 8], [12, 8], [-12, -8], [12, -8], [0, 17]], 6.2, H);

  const sectorGroups: THREE.Group[] = [];
  const add = (id: InboxSector, build: (sb: Builder, g: THREE.Group) => void) => {
    const p = PLAN[id];
    const g = sectorGroup(id, p.x, p.z, p.face);
    const sb = new Builder();
    sb.add(kit.mat('#E4ECF4', { rough: 0.3 }), new THREE.CylinderGeometry(3.6, 3.7, 0.1, 48), [0, 0.05, 0]);
    sb.add(dark, new THREE.CylinderGeometry(0.05, 0.05, 3.8, 8), [-2.8, 1.9, 1.4]);
    build(sb, g);
    g.add(sb.build());
    const sign = sectorSign(kit, labels.sectors[id], '#22D3EE');
    sign.position.set(-2.8, 4.0, 1.4);
    g.add(sign);
    scene.add(g);
    sectorGroups.push(g);
  };

  // Átrio de Recepção: balcão em arco, totens de captura.
  let atriumScreen: THREE.Mesh | null = null;
  add('atrium', (sb, g) => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 2.6, Math.PI * 0.15, Math.PI * 0.85, false);
    shape.absarc(0, 0, 2.0, Math.PI * 0.85, Math.PI * 0.15, true);
    sb.add(blue, new THREE.ExtrudeGeometry(shape, { depth: 1.05, bevelEnabled: false, curveSegments: 24 }), [0, 1.05, 1.2], [Math.PI / 2, 0, 0]);
    sb.add(silver, new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 24 }), [0, 1.11, 1.2], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) {
      sb.add(white, new THREE.CylinderGeometry(0.3, 0.42, 1.1, 20), [s * 2.6, 0.55, -1]);
      sb.add(dark, new THREE.BoxGeometry(0.85, 0.55, 0.05), [s * 2.6, 1.3, -1], [-0.5, 0, 0]);
    }
    const screen = new THREE.Mesh(kit.own(new THREE.PlaneGeometry(1.6, 0.9)), cyan);
    screen.position.set(0, 1.75, 1.0);
    screen.rotation.x = -0.25;
    g.add(screen);
    atriumScreen = screen;
  });
  // Central de Triagem: mesas em anel sob o painel de fluxo; uma caixa por item na entrada.
  add('triage', (sb) => {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      sb.add(white, new THREE.BoxGeometry(2.2, 0.9, 1.0), [Math.sin(a) * 2.6, 0.45, Math.cos(a) * 2.6], [0, a, 0]);
      sb.add(dark, new THREE.BoxGeometry(2.0, 0.04, 0.6), [Math.sin(a) * 2.6, 0.92, Math.cos(a) * 2.6], [0, a, 0]);
    }
  });
  // Centro de Distribuição: tubos por destino subindo até o teto, com cápsulas reais.
  add('distribution', (sb) => {
    DESTINATIONS.forEach((d, k) => {
      const x = (k - 1.5) * 1.3;
      sb.add(kit.mat('#CFF3FB', { glass: true }), new THREE.CylinderGeometry(0.3, 0.3, H - 0.1, 20, 1, true), [x, H / 2, -0.5]);
      sb.add(kit.mat(DEST_COLORS[d], { metal: 0.4, rough: 0.3 }), new THREE.CylinderGeometry(0.45, 0.5, 0.6, 20), [x, 0.3, -0.5]);
    });
    sb.add(white, new THREE.BoxGeometry(5.6, 0.9, 1.1), [0, 0.45, 1.3]);
  });
  // Arquivo (ala oeste): estantes abertas com uma caixa por item arquivado.
  add('archive', (sb) => {
    for (const s of [-1, 0, 1]) {
      sb.add(white, new THREE.BoxGeometry(1.6, 3.2, 0.06), [s * 1.75, 1.6, -0.6]);
      for (const e of [-1, 1]) sb.add(white, new THREE.BoxGeometry(0.06, 3.2, 0.55), [s * 1.75 + e * 0.8, 1.6, -0.35]);
      for (let k = 0; k < 5; k++) sb.add(silver, new THREE.BoxGeometry(1.62, 0.04, 0.56), [s * 1.75, 0.3 + k * 0.66, -0.34]);
    }
  });
  // Galeria (ala leste): quadros com itens reais e quiosque de busca.
  const frames: Array<ReturnType<typeof canvasPlane>> = [];
  add('gallery', (sb, g) => {
    for (let k = 0; k < 3; k++) sb.add(silver, new THREE.BoxGeometry(1.5, 1.1, 0.06), [(k - 1) * 1.7, 2.1, -1.2]);
    sb.add(white, new THREE.CylinderGeometry(0.25, 0.3, 1.1, 16), [2.2, 0.55, 1]);
    sb.add(dark, new THREE.BoxGeometry(0.7, 0.45, 0.05), [2.2, 1.25, 1], [-0.5, 0, 0]);
    for (let k = 0; k < 3; k++) {
      const f = canvasPlane(kit, 1.36, 0.96, 200, true);
      f.mesh.position.set((k - 1) * 1.7, 2.1, -1.16);
      g.add(f.mesh);
      frames.push(f);
    }
  });
  sectorGroups.forEach((g) => markSector(g, g.userData.sector as string));

  // Instâncias ligadas aos dados.
  const triage = sectorGroups[1]!;
  const triageCubes = new THREE.InstancedMesh(kit.own(new THREE.BoxGeometry(0.34, 0.26, 0.34)), kit.own(new THREE.MeshStandardMaterial({ roughness: 0.5 })), 18);
  const archiveBoxes = new THREE.InstancedMesh(kit.own(new THREE.BoxGeometry(0.44, 0.32, 0.34)), kit.mat('#D9C7A6', { rough: 0.8 }), 45);
  const capsules = new THREE.InstancedMesh(kit.own(new THREE.CapsuleGeometry(0.14, 0.28, 4, 8)), kit.own(new THREE.MeshBasicMaterial()), DESTINATIONS.length * 6);
  [triageCubes, capsules].forEach((m) => m.setColorAt(0, new THREE.Color('#ffffff')));
  triage.add(triageCubes);
  sectorGroups[3]!.add(archiveBoxes);
  sectorGroups[2]!.add(capsules);
  triageCubes.count = archiveBoxes.count = capsules.count = 0;
  [triageCubes, archiveBoxes].forEach((m) => (m.castShadow = true));
  [triageCubes, archiveBoxes, capsules].forEach((m) => markSector(m, m.parent!.userData.sector as string));

  // Painel de fluxo (elemento exclusivo): recebidos → na entrada → processados → destinos.
  const flow = canvasPlane(kit, 8.4, 3.6, 360);
  flow.mesh.position.set(0, 6.6, 1);
  scene.add(flow.mesh);

  finishRoom(room);

  let data: ReceptionData | null = null;
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const cubeColors = ['#22D3EE', '#60A5FA', '#14B8A6', '#A78BFA'];

  const drawFlow = () => {
    const ctx = flow.ctx;
    const { width: w, height: h } = ctx.canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8,22,48,0.86)';
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
    frames.forEach((f, k) => {
      const ctx = f.ctx;
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
      f.tex.needsUpdate = true;
    });
  };

  const layout = () => {
    const d = data;
    if (!d) return;
    triageCubes.count = Math.min(18, d.open);
    for (let i = 0; i < triageCubes.count; i++) {
      // Distribuídas pelas seis mesas em anel.
      const table = i % 6;
      const slot = Math.floor(i / 6);
      const a = (table / 6) * Math.PI * 2;
      const off = (slot - 1) * 0.55;
      m4.makeTranslation(Math.sin(a) * 2.6 + Math.cos(a) * off, 1.07, Math.cos(a) * 2.6 - Math.sin(a) * off);
      triageCubes.setMatrixAt(i, m4);
      triageCubes.setColorAt(i, col.set(cubeColors[i % cubeColors.length]!));
    }
    triageCubes.instanceMatrix.needsUpdate = true;
    if (triageCubes.instanceColor) triageCubes.instanceColor.needsUpdate = true;
    archiveBoxes.count = Math.min(45, d.archived);
    for (let i = 0; i < archiveBoxes.count; i++) {
      const unit = i % 3;
      const slot = Math.floor(i / 3);
      const shelf = Math.floor(slot / 3);
      m4.makeTranslation((unit - 1) * 1.75 + ((slot % 3) - 1) * 0.5, 0.48 + shelf * 0.66, -0.32);
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
    pickables: sectorGroups,
    room: { radius: R, height: H + 5 },
    obstacles: [{ x: 0, z: 1, r: 3.6, h: 1 }, { x: 0, z: 14.5, r: 2.8, h: 1 }],
    view: (id) => {
      if (id === 'entry') return { cam: new THREE.Vector3(0, 7.5, R - 2), target: new THREE.Vector3(0, 1.5, -2) };
      const p = PLAN[id as InboxSector] ?? PLAN.triage;
      return sectorView(p.x, p.z, p.face, id === 'triage' ? 11 : 9, id === 'triage' ? 6.5 : 4.6);
    },
    setData: (d) => {
      data = d as ReceptionData;
      layout();
    },
    tick: (t, camera) => {
      flow.mesh.rotation.y = Math.atan2(camera.position.x - flow.mesh.position.x, camera.position.z - flow.mesh.position.z);
      room.trees.tick(t);
      if (atriumScreen) atriumScreen.position.y = 1.75 + Math.sin(t * 1.5) * 0.02;
      let n = 0;
      DESTINATIONS.forEach((dest, k) => {
        const count = Math.min(6, data?.byType[dest] ?? 0);
        for (let i = 0; i < count; i++) {
          const y = 0.8 + ((t * 0.45 + i / 6) % 1) * (H - 1.2);
          m4.makeTranslation((k - 1.5) * 1.3, y, -0.5);
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
