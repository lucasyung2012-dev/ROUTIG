/**
 * Interior 3D da Central de Recepção (Inbox): átrio circular com balcão central, holograma com
 * os números reais do Inbox e cinco setores. Os objetos de cada setor refletem os dados
 * (caixas na triagem = itens na entrada, caixas no arquivo = itens arquivados, cápsulas nos tubos
 * = itens distribuídos por destino). Nada aqui é decorativo com número inventado.
 */
import * as THREE from 'three';
import { seededRandom } from '@/domain/park';
import { Builder, Kit, forest, sky, type Plant, type TreeSpecies } from './kit';

export const SECTORS = ['atrium', 'triage', 'distribution', 'archive', 'gallery'] as const;
export type SectorId = (typeof SECTORS)[number];

/** Destinos que o Inbox já sabe criar (Fase V1). Cores iguais às da legenda do painel. */
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

export interface InteriorLabels {
  sectors: Record<SectorId, string>;
  title: string;
  open: string;
  processed: string;
  archived: string;
  today: string;
  emptyFrame: string;
}

export interface Interior {
  scene: THREE.Scene;
  sectorGroups: THREE.Object3D[];
  /** Onde a câmera fica para olhar cada setor (e a visão geral). */
  view: (id: SectorId | 'overview') => { cam: THREE.Vector3; target: THREE.Vector3 };
  setData: (d: ReceptionData) => void;
  tick: (t: number, camera: THREE.Camera) => void;
  setDetail: (q: 'low' | 'medium' | 'high') => void;
}

const R = 12;
const SECTOR_R = 8.3;
const angleOf = (id: SectorId) => (SECTORS.indexOf(id) / SECTORS.length) * Math.PI * 2;
const at = (a: number, r: number, y = 0) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);

function canvasPlane(kit: Kit, w: number, h: number, px = 256): { mesh: THREE.Mesh; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = Math.round(px * (w / h));
  c.height = px;
  const ctx = c.getContext('2d')!;
  const tex = kit.own(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(kit.own(new THREE.PlaneGeometry(w, h)), kit.own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
  return { mesh, ctx, tex };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
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

export function createInterior(kit: Kit, labels: InteriorLabels): Interior {
  const scene = new THREE.Scene();
  const sk = sky(kit);
  sk.set(new THREE.Color('#5AA9E6'), new THREE.Color('#E3F2F9'));
  scene.add(sk.mesh);
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#B9C7D6', 1.2));
  const key = new THREE.DirectionalLight('#FFF6E8', 1.6);
  key.position.set(6, 20, 4);
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
  scene.add(key);

  const silver = kit.mat('#CBD5E1', { metal: 0.9, rough: 0.22 });
  const white = kit.mat('#F3F6FA', { rough: 0.45 });
  const floorMat = kit.mat('#EEF3F8', { rough: 0.16, metal: 0.15 });
  const glass = kit.mat('#A9DDF5', { glass: true, side: THREE.DoubleSide });
  const dark = kit.mat('#1F2A3A', { metal: 0.6, rough: 0.35 });
  const cyan = kit.own(new THREE.MeshBasicMaterial({ color: '#22D3EE' }));
  const turq = kit.own(new THREE.MeshBasicMaterial({ color: '#14B8A6' }));
  const blue = kit.mat('#1E6FD9', { metal: 0.35, rough: 0.3 });

  /* Lado de fora visto pelo vidro: gramado e um anel de árvores. */
  const lawn = new THREE.Mesh(kit.own(new THREE.CircleGeometry(160, 48)), kit.mat('#6FAE5C', { rough: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.05;
  scene.add(lawn);
  const rnd = seededRandom(77);
  const ring: Plant[] = [];
  const species: TreeSpecies[] = ['round', 'conifer', 'slender', 'blossom'];
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 17 + rnd() * 30;
    ring.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, s: 0.9 + rnd() * 0.5, species: species[i % 4]! });
  }
  const trees = forest(kit, ring);
  scene.add(trees.group);

  /* Estrutura */
  const b = new Builder();
  b.add(floorMat, new THREE.CircleGeometry(R, 96), [0, 0, 0], [-Math.PI / 2, 0, 0]);
  b.add(glass, new THREE.CylinderGeometry(R, R, 7, 96, 1, true), [0, 3.5, 0]);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    b.add(silver, new THREE.BoxGeometry(0.1, 7, 0.4), [Math.sin(a) * (R - 0.1), 3.5, Math.cos(a) * (R - 0.1)], [0, a, 0]);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    b.add(white, new THREE.CylinderGeometry(0.22, 0.22, 7, 16), [Math.sin(a) * 10.6, 3.5, Math.cos(a) * 10.6]);
  }
  b.add(white, new THREE.RingGeometry(4.6, R + 0.4, 96), [0, 7, 0], [Math.PI / 2, 0, 0]);
  b.add(silver, new THREE.TorusGeometry(4.6, 0.18, 8, 96), [0, 7, 0], [Math.PI / 2, 0, 0]);
  b.add(kit.mat('#CDEFFB', { glass: true }), new THREE.CircleGeometry(4.6, 64), [0, 7.6, 0], [Math.PI / 2, 0, 0]);
  b.add(silver, new THREE.CylinderGeometry(4.7, 4.7, 0.6, 64, 1, true), [0, 7.3, 0]);
  // Balcão central em arco (vão voltado para a porta).
  const deskShape = new THREE.Shape();
  deskShape.absarc(0, 0, 2.5, -Math.PI * 0.15, Math.PI * 1.15, false);
  deskShape.absarc(0, 0, 1.9, Math.PI * 1.15, -Math.PI * 0.15, true);
  const desk = new THREE.ExtrudeGeometry(deskShape, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 32 });
  b.add(blue, desk, [0, 1.0, 0], [Math.PI / 2, 0, Math.PI]);
  const top = new THREE.ExtrudeGeometry(deskShape, { depth: 0.06, bevelEnabled: false, curveSegments: 32 });
  b.add(silver, top, [0, 1.08, 0], [Math.PI / 2, 0, Math.PI]);
  scene.add(b.build());

  // Linhas de luz no piso: anéis e um caminho até cada setor.
  const lb = new Builder();
  lb.add(cyan, new THREE.RingGeometry(3.15, 3.27, 96), [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
  lb.add(turq, new THREE.RingGeometry(10.1, 10.18, 128), [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
  for (const id of SECTORS) {
    const a = angleOf(id);
    const mid = at(a, (3.3 + SECTOR_R - 2.6) / 2, 0.013);
    lb.add(cyan, new THREE.PlaneGeometry(0.08, SECTOR_R - 2.6 - 3.3), [mid.x, mid.y, mid.z], [-Math.PI / 2, 0, a]);
  }
  scene.add(lb.build(false));

  // Holograma sobre o balcão (números reais).
  const holo = canvasPlane(kit, 3.4, 2.0, 320);
  holo.mesh.position.set(0, 3.1, 0);
  (holo.mesh.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
  scene.add(holo.mesh);
  const emitter = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(0.45, 0.6, 0.12, 32)), cyan);
  emitter.position.y = 1.2;
  scene.add(emitter);

  /* Setores */
  const sectorGroups: THREE.Group[] = [];
  const triageCubes = new THREE.InstancedMesh(kit.own(new THREE.BoxGeometry(0.34, 0.26, 0.34)), kit.own(new THREE.MeshStandardMaterial({ roughness: 0.5 })), 12);
  const archiveBoxes = new THREE.InstancedMesh(kit.own(new THREE.BoxGeometry(0.42, 0.3, 0.32)), kit.mat('#D9C7A6', { rough: 0.8 }), 30);
  const capsules = new THREE.InstancedMesh(kit.own(new THREE.CapsuleGeometry(0.11, 0.22, 4, 8)), kit.own(new THREE.MeshBasicMaterial()), DESTINATIONS.length * 6);
  const frames: Array<ReturnType<typeof canvasPlane>> = [];
  const m4 = new THREE.Matrix4();

  for (const id of SECTORS) {
    const a = angleOf(id);
    const g = new THREE.Group();
    const p = at(a, SECTOR_R);
    g.position.copy(p);
    g.rotation.y = a + Math.PI; // de frente para o centro
    const sb = new Builder();
    sb.add(kit.mat('#E4ECF4', { rough: 0.3 }), new THREE.CylinderGeometry(2.6, 2.7, 0.1, 64), [0, 0.05, 0]);
    // Placa do setor
    sb.add(dark, new THREE.CylinderGeometry(0.05, 0.05, 3.6, 8), [-1.9, 1.8, 0.6]);
    switch (id) {
      case 'atrium':
        // Terminal de captura: pedestal com tela inclinada.
        sb.add(white, new THREE.CylinderGeometry(0.35, 0.5, 1.1, 24), [0, 0.6, 0.2]);
        sb.add(dark, new THREE.BoxGeometry(1.0, 0.65, 0.06), [0, 1.35, 0.2], [-0.5, 0, 0]);
        sb.add(silver, new THREE.TorusGeometry(1.4, 0.05, 8, 64), [0, 0.12, 0.2], [-Math.PI / 2, 0, 0]);
        break;
      case 'triage':
        // Mesa de triagem com esteira.
        sb.add(white, new THREE.BoxGeometry(3.2, 0.9, 1.2), [0, 0.5, 0]);
        sb.add(dark, new THREE.BoxGeometry(3.0, 0.04, 0.6), [0, 0.97, 0]);
        for (let k = -1; k <= 1; k++) sb.add(silver, new THREE.BoxGeometry(0.05, 0.5, 1.2), [k * 1.0, 1.2, 0]);
        break;
      case 'distribution':
        // Tubos que levam cada item ao seu destino (sobem até o teto).
        DESTINATIONS.forEach((d, k) => {
          const x = (k - 1.5) * 0.95;
          sb.add(kit.mat('#CFF3FB', { glass: true }), new THREE.CylinderGeometry(0.22, 0.22, 6.9, 20, 1, true), [x, 3.5, 0]);
          sb.add(kit.mat(DEST_COLORS[d], { metal: 0.4, rough: 0.3 }), new THREE.CylinderGeometry(0.32, 0.36, 0.5, 20), [x, 0.3, 0]);
        });
        break;
      case 'archive':
        // Estantes.
        for (const s of [-1, 1]) {
          sb.add(white, new THREE.BoxGeometry(1.4, 3.0, 0.5), [s * 0.85, 1.5, 0]);
          for (let k = 0; k < 5; k++) sb.add(silver, new THREE.BoxGeometry(1.42, 0.04, 0.52), [s * 0.85, 0.3 + k * 0.62, 0.01]);
        }
        break;
      case 'gallery':
        // Quiosque de busca e três quadros (os quadros recebem textos dos itens).
        sb.add(white, new THREE.CylinderGeometry(0.25, 0.3, 1.1, 16), [1.4, 0.55, 0.8]);
        sb.add(dark, new THREE.BoxGeometry(0.7, 0.45, 0.05), [1.4, 1.25, 0.8], [-0.5, 0, 0]);
        for (let k = 0; k < 3; k++) sb.add(silver, new THREE.BoxGeometry(1.36, 1.0, 0.06), [(k - 1) * 1.5, 2.0, -0.6]);
        break;
    }
    const built = sb.build();
    g.add(built);
    // Placa com o nome.
    const sign = canvasPlane(kit, 2.2, 0.55, 128);
    const c = sign.ctx.canvas;
    sign.ctx.fillStyle = 'rgba(12,30,60,0.92)';
    sign.ctx.fillRect(0, 0, c.width, c.height);
    sign.ctx.fillStyle = '#22D3EE';
    sign.ctx.fillRect(0, c.height - 8, c.width, 8);
    sign.ctx.fillStyle = '#E8FBFF';
    sign.ctx.font = '700 58px Inter, system-ui, sans-serif';
    sign.ctx.textAlign = 'center';
    sign.ctx.textBaseline = 'middle';
    sign.ctx.fillText(labels.sectors[id], c.width / 2, c.height / 2 - 3);
    sign.tex.needsUpdate = true;
    sign.mesh.position.set(-1.9, 3.75, 0.6);
    g.add(sign.mesh);
    if (id === 'gallery')
      for (let k = 0; k < 3; k++) {
        const f = canvasPlane(kit, 1.24, 0.88, 200);
        f.mesh.position.set((k - 1) * 1.5, 2.0, -0.56);
        (f.mesh.material as THREE.MeshBasicMaterial).transparent = false;
        g.add(f.mesh);
        frames.push(f);
      }
    if (id === 'atrium') {
      const screen = new THREE.Mesh(kit.own(new THREE.PlaneGeometry(0.9, 0.55)), cyan);
      screen.position.set(0, 1.37, 0.24);
      screen.rotation.x = -0.5;
      g.add(screen);
    }
    g.userData.sector = id;
    g.traverse((o) => (o.userData.sector = id));
    scene.add(g);
    sectorGroups.push(g);
  }
  // Instâncias ligadas aos dados ficam dentro dos setores.
  sectorGroups[SECTORS.indexOf('triage')]!.add(triageCubes);
  sectorGroups[SECTORS.indexOf('archive')]!.add(archiveBoxes);
  sectorGroups[SECTORS.indexOf('distribution')]!.add(capsules);
  // Cor por instância já criada antes do primeiro desenho (o shader nasce sabendo dela).
  [triageCubes, capsules].forEach((m) => m.setColorAt(0, new THREE.Color('#ffffff')));
  triageCubes.count = archiveBoxes.count = capsules.count = 0;
  [triageCubes, archiveBoxes].forEach((m) => (m.castShadow = true));

  let data: ReceptionData | null = null;
  const cubeColors = ['#22D3EE', '#60A5FA', '#14B8A6', '#A78BFA'];
  const col = new THREE.Color();

  const drawHolo = () => {
    const ctx = holo.ctx;
    const { width: w, height: h } = ctx.canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(34,211,238,0.85)';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = 'rgba(34,211,238,0.12)';
    ctx.fillRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#BFF6FF';
    ctx.textAlign = 'center';
    ctx.font = '700 40px Inter, system-ui, sans-serif';
    ctx.fillText(labels.title, w / 2, 56);
    const cells: Array<[string, number]> = data
      ? [
          [labels.open, data.open],
          [labels.today, data.today],
          [labels.processed, data.processed],
          [labels.archived, data.archived],
        ]
      : [];
    cells.forEach(([label, n], i) => {
      const cx = (w / 4) * ((i % 2) * 2 + 1);
      const cy = 130 + Math.floor(i / 2) * 100;
      ctx.font = '800 54px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#E8FBFF';
      ctx.fillText(String(n), cx, cy);
      ctx.font = '500 24px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#9BE7F5';
      ctx.fillText(label, cx, cy + 34);
    });
    holo.tex.needsUpdate = true;
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

  const layoutData = () => {
    const d = data;
    if (!d) return;
    // Triagem: uma caixa por item na entrada (até 12).
    triageCubes.count = Math.min(12, d.open);
    for (let i = 0; i < triageCubes.count; i++) {
      m4.makeTranslation(-1.3 + (i % 6) * 0.52, 1.13 + Math.floor(i / 6) * 0.28, -0.12 + Math.floor(i / 6) * 0.24);
      triageCubes.setMatrixAt(i, m4);
      triageCubes.setColorAt(i, col.set(cubeColors[i % cubeColors.length]!));
    }
    triageCubes.instanceMatrix.needsUpdate = true;
    if (triageCubes.instanceColor) triageCubes.instanceColor.needsUpdate = true;
    // Arquivo: uma caixa por item arquivado (até 30), nas prateleiras.
    archiveBoxes.count = Math.min(30, d.archived);
    for (let i = 0; i < archiveBoxes.count; i++) {
      const side = i % 2 ? 1 : -1;
      const slot = Math.floor(i / 2);
      const shelf = Math.floor(slot / 3);
      m4.makeTranslation(side * 0.85 + ((slot % 3) - 1) * 0.45, 0.47 + shelf * 0.62, 0.02);
      archiveBoxes.setMatrixAt(i, m4);
    }
    archiveBoxes.instanceMatrix.needsUpdate = true;
    drawHolo();
    drawFrames();
  };

  drawHolo();
  drawFrames();

  return {
    scene,
    sectorGroups,
    view: (id) => {
      if (id === 'overview') return { cam: new THREE.Vector3(0, 5, 11), target: new THREE.Vector3(0, 1.6, 0) };
      const a = angleOf(id);
      return { cam: at(a, 2.4, 3.0), target: at(a, SECTOR_R, 1.5) };
    },
    setData: (d) => {
      data = d;
      layoutData();
    },
    tick: (t, camera) => {
      // Holograma sempre de frente para quem olha (só gira em torno do eixo vertical).
      holo.mesh.rotation.y = Math.atan2(camera.position.x - holo.mesh.position.x, camera.position.z - holo.mesh.position.z);
      holo.mesh.position.y = 3.1 + Math.sin(t * 1.2) * 0.05;
      trees.tick(t);
      // Cápsulas subindo nos tubos: até 6 por destino, conforme os itens que foram para lá.
      let n = 0;
      DESTINATIONS.forEach((dest, k) => {
        const count = Math.min(6, data?.byType[dest] ?? 0);
        for (let i = 0; i < count; i++) {
          const y = 0.6 + ((t * 0.5 + i / 6) % 1) * 6.2;
          m4.makeTranslation((k - 1.5) * 0.95, y, 0);
          capsules.setMatrixAt(n, m4);
          capsules.setColorAt(n, col.set(DEST_COLORS[dest]));
          n++;
        }
      });
      capsules.count = n;
      capsules.instanceMatrix.needsUpdate = true;
      if (capsules.instanceColor) capsules.instanceColor.needsUpdate = true;
    },
    setDetail: (q) => {
      trees.setCount(q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1);
      key.castShadow = q === 'high';
    },
  };
}
