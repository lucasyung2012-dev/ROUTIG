/**
 * Sinalização externa do Campus: um totem na entrada de cada prédio (símbolo do módulo, nome
 * oficial e a cor do prédio) e, na saída da praça, uma placa por área temática apontando a avenida
 * dela. Todos os letreiros saem de uma única textura (um atlas), para custar uma chamada de desenho.
 * Os textos estão em português (como os letreiros das fachadas); a troca de idioma fica para quando
 * os letreiros 3D forem internacionalizados em conjunto.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { PARK_BUILDINGS, PARK_REGIONS, REGION_HUB, facingOf, heightAt, isFreeGround, onPath, parkPaths, type ParkBuilding, type ParkRegion, type Point } from '@/domain/park';
import { Builder, type Kit } from './kit';

/** Título do módulo e nome oficial do prédio. */
const TOTEM_NAMES: Partial<Record<ModuleId, [string, string]>> = {
  academy: ['ACADEMY', 'Centro de Aprendizagem'],
  languages: ['IDIOMAS', 'Centro Internacional de Idiomas'],
  notes: ['NOTES', 'Ateliê de Conhecimento'],
  library: ['LIBRARY', 'Biblioteca Digital'],
  inbox: ['INBOX', 'Central de Recepção'],
  calendar: ['CALENDAR', 'Observatório Temporal'],
  tasks: ['TASKS', 'Centro de Operações'],
  projects: ['PROJECTS', 'Centro de Projetos'],
  focus: ['FOCUS', 'Jardim da Concentração'],
  habits: ['HABITS', 'Estufa de Hábitos'],
  goals: ['GOALS', 'Centro de Objetivos'],
  insights: ['INSIGHTS', 'Observatório de Insights'],
  music: ['MÚSICA', 'Conservatório Musical'],
  sports: ['ESPORTES', 'Centro de Atividades Esportivas'],
  finance: ['FINANÇAS', 'Centro de Gestão Financeira'],
};

type Area = Exclude<ParkRegion, 'central'>;
const AREA_NAMES: Record<Area, [string, string]> = {
  knowledge: ['Conhecimento', 'e aprendizagem'],
  planning: ['Planejamento', 'e organização'],
  growth: ['Desenvolvimento', 'pessoal'],
  activity: ['Atividades', 'e concentração'],
  finance: ['Gestão', 'financeira'],
};
const AREA_COLOR: Record<Area, string> = { knowledge: '#4F46E5', planning: '#0284C7', growth: '#16A34A', activity: '#EA580C', finance: '#B45309' };

/* ---------- Atlas dos letreiros ---------- */

const ATLAS = 2048;
const CW = 384;
const CH = 512;
const COLS = 5;
const FONT = 'Inter, system-ui, sans-serif';

/** Símbolo de cada módulo, em traço branco, centrado em (cx, cy). */
function drawSymbol(g: CanvasRenderingContext2D, id: ModuleId, cx: number, cy: number) {
  g.save();
  g.strokeStyle = '#FFFFFF';
  g.fillStyle = '#FFFFFF';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = (...p: number[]) => {
    g.beginPath();
    g.moveTo(cx + p[0]!, cy + p[1]!);
    for (let i = 2; i + 1 < p.length; i += 2) g.lineTo(cx + p[i]!, cy + p[i + 1]!);
    g.stroke();
  };
  const ring = (x: number, y: number, r: number, fill = false) => {
    g.beginPath();
    g.arc(cx + x, cy + y, r, 0, Math.PI * 2);
    if (fill) g.fill();
    else g.stroke();
  };
  const box = (x: number, y: number, w: number, h: number) => g.strokeRect(cx + x, cy + y, w, h);
  switch (id) {
    case 'calendar':
      box(-52, -42, 104, 92);
      line(-52, -16, 52, -16);
      line(-26, -56, -26, -36);
      line(26, -56, 26, -36);
      for (const x of [-28, 0, 28]) for (const y of [8, 32]) ring(x, y, 5, true);
      break;
    case 'tasks':
      for (const y of [-36, 0, 36]) {
        line(-54, y, -44, y + 10, -28, y - 10);
        line(-10, y, 54, y);
      }
      break;
    case 'projects':
      box(-56, -46, 32, 92);
      box(-16, -46, 32, 58);
      box(24, -46, 32, 76);
      break;
    case 'inbox':
      line(-56, -6, -40, -44, 40, -44, 56, -6, 56, 40, -56, 40, -56, -6);
      line(-56, -6, -24, -6, -14, 14, 14, 14, 24, -6, 56, -6);
      break;
    case 'academy':
      line(0, -42, 62, -12, 0, 18, -62, -12, 0, -42);
      line(-34, 4, -34, 32, 0, 48, 34, 32, 34, 4);
      line(62, -12, 62, 28);
      break;
    case 'languages':
      line(-56, -46, 56, -46, 56, 28, -4, 28, -34, 52, -26, 28, -56, 28, -56, -46);
      g.font = `700 54px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Aa', cx, cy - 8);
      break;
    case 'notes':
      line(-40, -52, 18, -52, 40, -30, 40, 52, -40, 52, -40, -52);
      line(18, -52, 18, -30, 40, -30);
      for (const y of [-4, 16, 36]) line(-22, y, 22, y);
      break;
    case 'library':
      box(-52, -44, 26, 92);
      box(-18, -52, 26, 100);
      line(18, -40, 40, -46, 60, 44, 38, 50, 18, -40);
      break;
    case 'habits':
      g.beginPath();
      g.arc(cx, cy, 46, Math.PI * 0.2, Math.PI * 1.75);
      g.stroke();
      line(20, -62, 34, -34, 4, -30);
      break;
    case 'goals':
      ring(0, 0, 52);
      ring(0, 0, 31);
      ring(0, 0, 11, true);
      break;
    case 'insights':
      line(-54, -48, -54, 46, 56, 46);
      line(-38, 22, -12, -8, 10, 10, 46, -36);
      break;
    case 'focus':
      ring(0, 4, 48);
      line(0, 4, 0, -24);
      line(0, 4, 20, 14);
      line(-12, -58, 12, -58);
      break;
    case 'music':
      line(-10, 30, -10, -44, 38, -54, 38, 16);
      g.beginPath();
      g.ellipse(cx - 27, cy + 32, 18, 13, -0.3, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(cx + 21, cy + 18, 18, 13, -0.3, 0, Math.PI * 2);
      g.fill();
      break;
    case 'sports':
      line(-34, -48, 34, -48, 30, -12, 0, 14, -30, -12, -34, -48);
      line(-34, -38, -54, -38, -50, -14, -30, -12);
      line(34, -38, 54, -38, 50, -14, 30, -12);
      line(0, 14, 0, 38);
      line(-26, 46, 26, 46);
      break;
    case 'finance':
      ring(0, 0, 50);
      g.font = `700 62px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', cx, cy + 3);
      break;
    default:
      ring(0, 0, 46);
  }
  g.restore();
}

/** Quebra um nome em até duas linhas que caibam na largura. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  if (g.measureText(text).width <= max) return [text];
  const words = text.split(' ');
  let best = [text];
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const w = Math.max(g.measureText(a).width, g.measureText(b).width);
    if (w < bestW) {
      bestW = w;
      best = [a, b];
    }
  }
  return best;
}

function drawTotem(g: CanvasRenderingContext2D, x: number, y: number, b: ParkBuilding) {
  const names: [string, string] = TOTEM_NAMES[b.id] ?? [b.id.toUpperCase(), ''];
  const [title, name] = names;
  g.fillStyle = '#1B2330';
  g.fillRect(x, y, CW, CH);
  g.fillStyle = b.color;
  g.fillRect(x, y, CW, 18);
  g.beginPath();
  g.arc(x + CW / 2, y + 150, 96, 0, Math.PI * 2);
  g.globalAlpha = 0.9;
  g.fill();
  g.globalAlpha = 1;
  drawSymbol(g, b.id, x + CW / 2, y + 150);
  g.fillStyle = '#FFFFFF';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 48px ${FONT}`;
  g.fillText(title, x + CW / 2, y + 304, CW - 36);
  g.font = `500 27px ${FONT}`;
  g.fillStyle = '#D5DCE8';
  wrap(g, name, CW - 44).forEach((l, i) => g.fillText(l, x + CW / 2, y + 358 + i * 34));
  g.font = `700 17px ${FONT}`;
  g.fillStyle = '#8D9AB0';
  g.fillText('R O U T I G   C A M P U S', x + CW / 2, y + CH - 34);
}

/** Placa de área: só a faixa de cima da célula (384 × 128). */
function drawArea(g: CanvasRenderingContext2D, x: number, y: number, t: Area) {
  g.fillStyle = AREA_COLOR[t];
  g.fillRect(x, y, CW, 128);
  g.fillStyle = '#FFFFFF';
  g.fillRect(x + 16, y + 20, 8, 88);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `700 36px ${FONT}`;
  g.fillText(AREA_NAMES[t][0], x + 40, y + 44, CW - 56);
  g.font = `600 30px ${FONT}`;
  g.fillText(AREA_NAMES[t][1], x + 40, y + 88, CW - 56);
}

/** Plano com as coordenadas de textura de uma célula do atlas (h = altura usada da célula, em pixels). */
function cellPlane(w: number, hgt: number, index: number, used = CH): THREE.PlaneGeometry {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const u0 = (col * CW) / ATLAS;
  const u1 = ((col + 1) * CW) / ATLAS;
  const v1 = 1 - (row * CH) / ATLAS;
  const v0 = 1 - (row * CH + used) / ATLAS;
  const geo = new THREE.PlaneGeometry(w, hgt);
  const uv = geo.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return geo;
}

/** Lugar livre para o totem: logo fora do lote, ao lado do caminho de entrada. */
function totemSpot(b: ParkBuilding): (Point & { face: number }) | null {
  const a = facingOf(b);
  const fx = Math.sin(a);
  const fz = Math.cos(a);
  // Primeiro colado ao caminho de entrada; se não couber (quiosque, lounge, outro caminho), mais ao lado.
  for (const lat of [3.6, 4.6, 5.8, 7.5, 9.5, 12])
    for (const fwd of [2.6, 4, 5.5, 7.5])
      for (const side of [1, -1]) {
        const x = b.x + fx * (b.radius + fwd) + fz * side * lat;
        const z = b.z + fz * (b.radius + fwd) - fx * side * lat;
        if (isFreeGround(x, z, 0.45) && !onPath(x, z, 0.9)) return { x, z, face: a };
      }
  return null;
}

export function totems(kit: Kit): { group: THREE.Group; spots: Point[] } {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#1B2330';
  g.fillRect(0, 0, ATLAS, ATLAS);
  const atlas = kit.own(new THREE.CanvasTexture(canvas));
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const signM = kit.own(new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.3, roughness: 0.5 }));
  const bodyM = kit.mat('#232B38', { rough: 0.55, metal: 0.3 });
  const baseM = kit.mat('#C9CED4', { rough: 0.8 });

  const b = new Builder();
  const spots: Point[] = [];
  let cell = 0;

  // Totens dos prédios.
  for (const def of PARK_BUILDINGS) {
    const p = totemSpot(def);
    if (!p) continue;
    drawTotem(g, (cell % COLS) * CW, Math.floor(cell / COLS) * CH, def);
    const y = heightAt(p.x, p.z);
    const ry = p.face;
    const fx = Math.sin(ry);
    const fz = Math.cos(ry);
    b.add(baseM, new THREE.BoxGeometry(1.06, 0.2, 0.52), [p.x, y + 0.08, p.z], [0, ry, 0]);
    b.add(bodyM, new THREE.BoxGeometry(0.9, 2.05, 0.16), [p.x, y + 1.2, p.z], [0, ry, 0]);
    // Letreiro na frente (para quem chega) e atrás (para quem sai do prédio).
    b.add(signM, cellPlane(0.84, 1.12, cell), [p.x + fx * 0.083, y + 1.6, p.z + fz * 0.083], [0, ry, 0]);
    b.add(signM, cellPlane(0.84, 1.12, cell), [p.x - fx * 0.083, y + 1.6, p.z - fz * 0.083], [0, ry + Math.PI, 0]);
    spots.push({ x: p.x, z: p.z });
    cell++;
  }

  // Placas de área na saída da praça: ao lado do começo de cada avenida, viradas para a praça.
  const avenues = parkPaths().filter((l) => l.kind === 'main');
  for (const t of PARK_REGIONS) {
    if (t === 'central') continue;
    const hub = REGION_HUB[t];
    const line = avenues.find((l) => {
      const end = l.points[l.points.length - 1]!;
      return Math.hypot(end.x - hub.x, end.z - hub.z) < 1;
    });
    if (!line || line.points.length < 2) continue;
    const p0 = line.points[0]!;
    const p1 = line.points[1]!;
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
    const dx = (p1.x - p0.x) / len;
    const dz = (p1.z - p0.z) / len;
    let spot: Point | null = null;
    for (const fwd of [3, 4.5, 6])
      for (const side of [1, -1]) {
        const x = p0.x + dx * fwd - dz * side * 4.4;
        const z = p0.z + dz * fwd + dx * side * 4.4;
        if (!spot && isFreeGround(x, z, 0.3) && !onPath(x, z, 0.8)) spot = { x, z };
      }
    if (!spot) continue;
    drawArea(g, (cell % COLS) * CW, Math.floor(cell / COLS) * CH, t);
    const y = heightAt(spot.x, spot.z);
    // A placa olha para a praça (de onde a pessoa escolhe o caminho).
    const ry = Math.atan2(-dx, -dz);
    const nx = Math.sin(ry);
    const nz = Math.cos(ry);
    b.add(bodyM, new THREE.CylinderGeometry(0.05, 0.06, 2.9, 8), [spot.x, y + 1.45, spot.z]);
    b.add(bodyM, new THREE.BoxGeometry(1.62, 0.6, 0.06), [spot.x, y + 2.55, spot.z], [0, ry, 0]);
    b.add(signM, cellPlane(1.5, 0.5, cell, 128), [spot.x + nx * 0.034, y + 2.55, spot.z + nz * 0.034], [0, ry, 0]);
    spots.push(spot);
    cell++;
  }
  atlas.needsUpdate = true;
  return { group: b.build(), spots };
}
