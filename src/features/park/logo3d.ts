/**
 * Logo do ROUTIG em 3D para a escultura da fonte: os mesmos traços de src/brand/mark.ts
 * viram tubos (traços) e um sólido com chanfro (ponta da seta), com o degradê oficial
 * pintado por vértice. Uma malha só, um desenho por quadro.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MARK_ARROW, MARK_BODY, MARK_BOWL, MARK_GRADIENT, MARK_STROKE } from '@/brand/mark';

/** Lê os comandos M, L, C (absolutos) e Z usados no traçado do logo. */
function toPath(d: string): THREE.Path {
  const p = new THREE.Path();
  const tokens = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[MLCZ]/.test(tokens[i]!)) cmd = tokens[i++]!;
    if (cmd === 'M') p.moveTo(n(), n());
    else if (cmd === 'L') p.lineTo(n(), n());
    else if (cmd === 'C') p.bezierCurveTo(n(), n(), n(), n(), n(), n());
    else if (cmd === 'Z') p.closePath();
    else i++;
  }
  return p;
}

function strokeTube(d: string, radius: number): THREE.BufferGeometry {
  const pts2 = toPath(d).getSpacedPoints(90);
  const pts = pts2.filter((p, k) => k === 0 || p.distanceTo(pts2[k - 1]!) > 0.5).map((p) => new THREE.Vector3(p.x, p.y, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tube = new THREE.TubeGeometry(curve, 160, radius, 12, false);
  // Pontas arredondadas, como o traço do logo.
  const caps = [pts[0]!, pts[pts.length - 1]!].map((c) => {
    const s = new THREE.SphereGeometry(radius, 12, 8);
    s.translate(c.x, c.y, c.z);
    return s;
  });
  const merged = mergeGeometries([tube, ...caps].map((g) => (g.index ? g.toNonIndexed() : g)))!;
  tube.dispose();
  caps.forEach((c) => c.dispose());
  return merged;
}

function arrowSolid(depth: number): THREE.BufferGeometry {
  const path = toPath(MARK_ARROW);
  const shape = new THREE.Shape(path.getPoints());
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 6, bevelSize: 6, bevelSegments: 3, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return g.index ? g.toNonIndexed() : g;
}

/** Degradê oficial ao longo da mesma direção do SVG. */
function paintGradient(g: THREE.BufferGeometry) {
  const { x1, y1, x2, y2, stops } = MARK_GRADIENT;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const cols = stops.map((s) => ({ o: s.offset, c: new THREE.Color(s.color) }));
  const pos = g.attributes.position!;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, ((pos.getX(i) - x1) * dx + (pos.getY(i) - y1) * dy) / len2));
    let k = 0;
    while (k < cols.length - 2 && t > cols[k + 1]!.o) k++;
    const a = cols[k]!;
    const b = cols[k + 1]!;
    c.lerpColors(a.c, b.c, (t - a.o) / (b.o - a.o || 1));
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/**
 * Cria a escultura do logo com `size` unidades de altura, centrada na origem,
 * de pé (plano XY), com espessura de um traço.
 */
export function createLogo3D(size: number): { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; dispose: () => void } {
  const r = MARK_STROKE / 2;
  const parts = [strokeTube(MARK_BOWL, r), strokeTube(MARK_BODY, r), arrowSolid(MARK_STROKE * 0.9)];
  parts.forEach((p) => p.deleteAttribute('uv'));
  const geo = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  paintGradient(geo);
  // Recorte do logo: 262..762 nos dois eixos; centro em (512, 512); y do SVG cresce para baixo.
  const s = size / 500;
  geo.translate(-512, -512, 0);
  geo.scale(s, -s, s);
  geo.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.28, emissive: new THREE.Color('#7B3FF6'), emissiveIntensity: 0.08 });
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return {
    mesh,
    material,
    dispose: () => {
      geo.dispose();
      material.dispose();
    },
  };
}
