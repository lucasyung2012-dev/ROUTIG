/**
 * Kit 3D do parque (V2): peças, materiais e efeitos gerados em código, sem arquivos de modelo
 * nem de imagem. Tudo o que se repete é compartilhado ou desenhado em instâncias, e peças
 * do mesmo material são juntadas numa malha só, para muito detalhe com poucos desenhos por quadro.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ---------- Materiais compartilhados ---------- */

export interface MatOpts {
  rough?: number;
  metal?: number;
  glass?: boolean;
  glow?: boolean;
  vertexColors?: boolean;
  side?: THREE.Side;
}

export class Kit {
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private owned: Array<{ dispose: () => void }> = [];
  /** Materiais que brilham à noite (janelas, faixas de luz, postes). */
  readonly glowing: THREE.MeshStandardMaterial[] = [];

  mat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${o.rough ?? ''}|${o.metal ?? ''}|${o.glass ? 'g' : ''}|${o.glow ? 'l' : ''}|${o.vertexColors ? 'v' : ''}|${o.side ?? ''}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: o.vertexColors ? '#ffffff' : color,
        vertexColors: !!o.vertexColors,
        roughness: o.rough ?? (o.glass ? 0.05 : 0.75),
        metalness: o.metal ?? (o.glass ? 0.2 : 0.05),
        transparent: !!o.glass,
        opacity: o.glass ? 0.5 : 1,
        envMapIntensity: o.glass ? 0.7 : 0.8,
        side: o.side ?? THREE.FrontSide,
        emissive: o.glow ? new THREE.Color(color) : new THREE.Color(0x000000),
        emissiveIntensity: 0,
      });
      if (o.glass) m.depthWrite = false;
      this.mats.set(key, m);
      if (o.glow) this.glowing.push(m);
    }
    return m;
  }

  own<T extends { dispose: () => void }>(x: T): T {
    this.owned.push(x);
    return x;
  }

  dispose() {
    this.mats.forEach((m) => m.dispose());
    this.mats.clear();
    this.owned.forEach((x) => x.dispose());
    this.owned = [];
  }
}

/* ---------- Montagem: peças juntadas por material ---------- */

/** Junta peças (geometria já posicionada) por material: uma malha por material. */
export class Builder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(material: THREE.Material, g: THREE.BufferGeometry, pos?: [number, number, number], rot?: [number, number, number], scale?: [number, number, number]) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(pos ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))),
      new THREE.Vector3(...(scale ?? [1, 1, 1])),
    );
    const geo = g.index ? g.toNonIndexed() : g.clone();
    geo.applyMatrix4(m);
    // Atributos iguais em todas as peças para poder juntar.
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((geo.attributes.position!.count) * 2), 2));
    const list = this.parts.get(material) ?? [];
    list.push(geo);
    this.parts.set(material, list);
    g.dispose();
    return this;
  }

  build(shadows = true): THREE.Group {
    const group = new THREE.Group();
    this.parts.forEach((geos, material) => {
      const withColor = geos.some((x) => x.attributes.color);
      if (withColor) geos.forEach((x) => !x.attributes.color && x.setAttribute('color', new THREE.BufferAttribute(new Float32Array(x.attributes.position!.count * 3).fill(1), 3)));
      const merged = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = shadows && !(material as THREE.MeshStandardMaterial).transparent;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    this.parts.clear();
    return group;
  }
}

/* ---------- Céu ---------- */

export function sky(kit: Kit): { mesh: THREE.Mesh; set: (top: THREE.Color, bottom: THREE.Color) => void } {
  const mat = kit.own(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#5AA9E6') }, bottom: { value: new THREE.Color('#DDEFF7') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.4 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0); }',
    }),
  );
  const mesh = new THREE.Mesh(kit.own(new THREE.SphereGeometry(1300, 32, 16)), mat);
  return { mesh, set: (t, b) => (mat.uniforms.top!.value.copy(t), mat.uniforms.bottom!.value.copy(b)) };
}

/* ---------- Água animada ---------- */

export function water(kit: Kit, radius: number, color = '#2E9BD6'): { mesh: THREE.Mesh; tick: (t: number) => void } {
  const mat = kit.own(
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { t: { value: 0 }, deep: { value: new THREE.Color(color) }, light: { value: new THREE.Color('#BFEFFF') }, night: { value: 0 }, rain: { value: 0 }, wind: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float t; uniform vec3 deep; uniform vec3 light; uniform float night; uniform float rain; uniform float wind; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0; float d = length(p);
          float w = sin(d * 28.0 - t * 2.2) * 0.5 + 0.5;
          float w2 = sin((p.x + p.y) * (17.0 + wind * 14.0) + t * (1.3 + wind * 2.5)) * 0.5 + 0.5;
          float spark = pow(w * w2, 6.0 - wind * 3.0);
          vec3 c = mix(deep, light, 0.18 + spark * 0.55 + (1.0 - d) * 0.12);
          // Chuva: anéis de gotas que nascem e se abrem pela superfície.
          vec2 g = vUv * 70.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
          float hsh = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
          float ph = fract(t * 0.8 + hsh);
          float ring = smoothstep(0.05, 0.0, abs(length(f) - ph * 0.45)) * (1.0 - ph) * step(hsh, rain);
          c = mix(c, light, ring * 0.6);
          c = mix(c, c * 0.82, rain * 0.4);
          c *= mix(1.0, 0.35, night);
          gl_FragColor = vec4(c, 0.88);
        }`,
    }),
  );
  const mesh = new THREE.Mesh(kit.own(new THREE.CircleGeometry(radius, 48)), mat);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, tick: (t) => (mat.uniforms.t!.value = t) };
}

/** Ajusta o escurecimento noturno de todas as águas criadas por `water`. */
export function setWaterNight(mesh: THREE.Mesh, night: number) {
  const m = mesh.material as THREE.ShaderMaterial;
  if (m.uniforms?.night) m.uniforms.night.value = night;
}

/** Chuva (gotas na superfície) e vento (ondulação) nas águas criadas por `water`. */
export function setWaterWeather(mesh: THREE.Mesh, rain: number, wind: number) {
  const m = mesh.material as THREE.ShaderMaterial;
  if (m.uniforms?.rain) m.uniforms.rain.value = rain;
  if (m.uniforms?.wind) m.uniforms.wind.value = wind;
}

/* ---------- Caminhos curvos (faixa com meio-fio) ---------- */

export function ribbon(points: THREE.Vector2[], width: number, y = 0.03): THREE.BufferGeometry {
  const curve = new THREE.SplineCurve(points);
  const pts = curve.getSpacedPoints(Math.max(8, Math.round(curve.getLength() / 1.5)));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  pts.forEach((p, i) => {
    const tg = curve.getTangentAt(i / (pts.length - 1));
    const n = new THREE.Vector2(-tg.y, tg.x).multiplyScalar(width / 2);
    pos.push(p.x + n.x, y, p.y + n.y, p.x - n.x, y, p.y - n.y);
    uv.push(0, i / 4, 1, i / 4);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- Placas com texto (desenhadas na hora, sem fonte 3D) ---------- */

export function signTexture(kit: Kit, lines: string[], opts: { bg?: string; fg?: string; accent?: string; w?: number; h?: number } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = opts.bg ?? 'rgba(10,20,40,0.85)';
  g.fillRect(0, 0, w, h);
  if (opts.accent) {
    g.fillStyle = opts.accent;
    g.fillRect(0, h - 8, w, 8);
  }
  g.fillStyle = opts.fg ?? '#E6FBFF';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = Math.round(h / (lines.length + 0.9));
  lines.forEach((line, i) => {
    g.font = `${i === 0 ? 700 : 500} ${i === 0 ? size : Math.round(size * 0.7)}px Inter, system-ui, sans-serif`;
    g.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1) - 2);
  });
  const tex = kit.own(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ---------- Vegetação em instâncias ---------- */

export type TreeSpecies = 'round' | 'conifer' | 'slender' | 'blossom' | 'palm';

export interface Plant {
  x: number;
  z: number;
  /** Altura do chão (relevo); 0 se omitida. */
  y?: number;
  s: number;
  species: TreeSpecies;
}

/** Copas com leve variação de cor por vértice (sem textura). */
function tintedCrown(g: THREE.BufferGeometry, base: string, seed: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const col = new THREE.Color(base);
  const arr = new Float32Array(geo.attributes.position!.count * 3);
  for (let i = 0; i < geo.attributes.position!.count; i++) {
    const y = geo.attributes.position!.getY(i);
    const k = 0.82 + ((Math.sin(i * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1 * 0.22 + y * 0.03;
    arr[i * 3] = col.r * k;
    arr[i * 3 + 1] = col.g * k;
    arr[i * 3 + 2] = col.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export interface Forest {
  group: THREE.Group;
  /** Balanço do vento nas copas (barato: só matrizes); `wind` de 0 a 1. */
  tick: (t: number, wind?: number) => void;
  setCount: (fraction: number) => void;
  setSeason: (crownColors: Partial<Record<TreeSpecies, string>>) => void;
}

/** Textura de folhagem (gerada na hora): dezenas de folhas com tons variados e fundo transparente. */
function leafTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    let s = 11;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 230; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 118;
      const x = 128 + Math.cos(a) * d;
      const y = 128 + Math.sin(a) * d;
      g.save();
      g.translate(x, y);
      g.rotate(r() * Math.PI * 2);
      const l = 26 + r() * 22;
      g.fillStyle = `hsl(${95 + r() * 35}, ${38 + r() * 25}%, ${24 + r() * 26 + (d < 60 ? -6 : 4)}%)`;
      g.beginPath();
      g.ellipse(0, 0, 5 + r() * 6, 2.2 + r() * 2.6, 0, 0, Math.PI * 2);
      g.fill();
      // Nervura central, quase imperceptível.
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(-l * 0.18, 0);
      g.lineTo(l * 0.18, 0);
      g.stroke();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Copa irregular feita de cachos de folhas: vários volumes deslocados e achatados, cada um com
 * cartões de folhagem (textura com transparência) virados para fora. Mais natural que esferas,
 * e mais leve (poucos triângulos por árvore).
 */
function blobCrown(seed: number, blobs: number, spread: number, size: number, flat: number): THREE.BufferGeometry {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const parts: THREE.BufferGeometry[] = [];
  const n = new THREE.Vector3();
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + r();
    const d = i === 0 ? 0 : spread * (0.55 + r() * 0.45);
    const bs = size * (0.75 + r() * 0.4);
    const cx = Math.cos(a) * d;
    const cy = (r() - 0.4) * size * 0.6;
    const cz = Math.sin(a) * d;
    const cards = 9 + Math.floor(r() * 5);
    for (let k = 0; k < cards; k++) {
      // Ponto na superfície do volume (mais em cima e dos lados que embaixo).
      const u = r() * Math.PI * 2;
      const v = Math.acos(1 - r() * 1.7);
      n.set(Math.sin(v) * Math.cos(u), Math.cos(v) * flat, Math.sin(v) * Math.sin(u)).normalize();
      const cs = bs * (0.9 + r() * 0.5);
      const g = new THREE.PlaneGeometry(cs, cs);
      g.rotateZ(r() * Math.PI);
      g.lookAt(n);
      g.translate(cx + n.x * bs * 0.75, cy + n.y * bs * 0.75 * flat, cz + n.z * bs * 0.75);
      // Normais apontando para fora do volume: luz suave como numa copa de verdade.
      const nor = g.attributes.normal!;
      for (let j = 0; j < nor.count; j++) nor.setXYZ(j, n.x, n.y, n.z);
      parts.push(g.toNonIndexed());
      g.dispose();
    }
  }
  const m = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return m;
}

/** Tronco com galhos subindo para dentro da copa (altura real: escala só uniforme). */
function trunkWithBranches(h: number, spread: number, seed: number): THREE.BufferGeometry {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const parts: THREE.BufferGeometry[] = [];
  const main = new THREE.CylinderGeometry(0.13, 0.26, h, 7);
  main.translate(0, h / 2, 0);
  parts.push(main.toNonIndexed());
  for (let k = 0; k < 4; k++) {
    const len = spread * (0.7 + r() * 0.5) + 0.6;
    const g = new THREE.CylinderGeometry(0.04, 0.09, len, 5);
    g.translate(0, len / 2, 0);
    g.rotateZ(0.65 + r() * 0.35);
    g.rotateY((k / 4) * Math.PI * 2 + r());
    g.translate(0, h * (0.7 + r() * 0.25), 0);
    parts.push(g.toNonIndexed());
  }
  const m = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return m;
}

/** Copa de palmeira: folhas longas e arqueadas em volta do topo. */
function palmCrown(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.5, 0.06, 3.4, 1, 1, 4);
    const pos = g.attributes.position!;
    for (let k = 0; k < pos.count; k++) {
      const z = pos.getZ(k) + 1.7;
      pos.setY(k, pos.getY(k) - z * z * 0.12);
      pos.setX(k, pos.getX(k) * (1 - z / 4));
    }
    g.translate(0, 0, 1.7);
    g.rotateX(-0.25);
    g.rotateY(a);
    parts.push(g.toNonIndexed());
    g.dispose();
  }
  const m = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return m;
}

/**
 * Espécies (V2.1: vegetação tropical predominante): copa larga irregular, árvore emergente grande
 * (10–20 m), conífera em camadas para o alto do Norte, ipê florido (decídua) e palmeira.
 */
const SPECIES: Record<TreeSpecies, { trunkH: number; crown: () => THREE.BufferGeometry; crownY: number; color: string }> = {
  round: { trunkH: 3, crown: () => blobCrown(3, 5, 1.8, 1.9, 0.75), crownY: 4.6, color: '#4C9A4F' },
  conifer: { trunkH: 2, crown: () => blobCrown(7, 4, 0.9, 1.6, 1.6), crownY: 4.4, color: '#2F7A4A' },
  slender: { trunkH: 9, crown: () => blobCrown(11, 7, 3.2, 2.4, 0.5), crownY: 10.5, color: '#5E9E4C' },
  blossom: { trunkH: 2.6, crown: () => blobCrown(17, 5, 1.5, 1.5, 0.8), crownY: 4, color: '#F2A7C5' },
  palm: { trunkH: 7, crown: palmCrown, crownY: 7.2, color: '#5DAF55' },
};

export function forest(kit: Kit, plants: Plant[]): Forest {
  const group = new THREE.Group();
  const trunkMat = kit.mat('#6B4A33', { rough: 0.95 });
  const leaves = kit.own(leafTexture());
  const bySpecies = new Map<TreeSpecies, Plant[]>();
  plants.forEach((p) => bySpecies.set(p.species, [...(bySpecies.get(p.species) ?? []), p]));
  const crowns: Array<{ mesh: THREE.InstancedMesh; list: Plant[]; crownY: number; species: TreeSpecies }> = [];
  const trunks: THREE.InstancedMesh[] = [];
  const m4 = new THREE.Matrix4();
  bySpecies.forEach((list, sp) => {
    const def = SPECIES[sp];
    const trunkGeo = kit.own(sp === 'palm' ? (() => { const g = new THREE.CylinderGeometry(0.14, 0.24, def.trunkH, 8); g.translate(0, def.trunkH / 2, 0); return g; })() : trunkWithBranches(def.trunkH, sp === 'slender' ? 2.4 : 1.2, sp.length * 31));
    const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const crownGeo = kit.own(tintedCrown(def.crown(), '#ffffff', sp.length));
    const crownMat = kit.own(new THREE.MeshStandardMaterial({ color: def.color, vertexColors: true, roughness: 0.85, map: leaves, alphaTest: 0.42, side: THREE.DoubleSide }));
    const crown = new THREE.InstancedMesh(crownGeo, crownMat, list.length);
    list.forEach((p, i) => {
      m4.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.x * 1.7 + p.z), new THREE.Vector3(p.s, p.s, p.s));
      trunk.setMatrixAt(i, m4);
    });
    trunk.castShadow = crown.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk, crown);
    trunks.push(trunk);
    crowns.push({ mesh: crown, list, crownY: def.crownY, species: sp });
  });
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tick = (t: number, wind = 0) => {
    for (const c of crowns) {
      c.list.forEach((p, i) => {
        if (i >= c.mesh.count) return;
        const sway = Math.sin(t * (1.1 + wind * 1.8) + p.x * 0.3 + p.z * 0.2) * (0.04 + wind * 0.13) + wind * 0.05;
        e.set(sway, 0, sway * 0.7);
        q.setFromEuler(e);
        pos.set(p.x, (p.y ?? 0) + c.crownY * p.s, p.z);
        sc.setScalar(p.s);
        m4.compose(pos, q, sc);
        c.mesh.setMatrixAt(i, m4);
      });
      c.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  tick(0);
  return {
    group,
    tick,
    setCount: (f) => {
      crowns.forEach((c, i) => {
        const n = Math.max(1, Math.round(c.list.length * f));
        c.mesh.count = n;
        trunks[i]!.count = n;
      });
    },
    setSeason: (colors) => crowns.forEach((c) => colors[c.species] && (c.mesh.material as THREE.MeshStandardMaterial).color.set(colors[c.species]!)),
  };
}

/** Arbustos e flores (instâncias simples). */
export function shrubs(kit: Kit, spots: Array<{ x: number; y?: number; z: number; s: number; color: string }>, kind: 'bush' | 'flower'): THREE.InstancedMesh {
  // Arbusto: cachos de folhas (mesma folhagem das árvores); flor: botão arredondado.
  const geo = kit.own(kind === 'bush' ? blobCrown(5, 4, 0.42, 0.6, 0.85) : new THREE.IcosahedronGeometry(0.15, 1));
  const mat = kit.own(kind === 'bush' ? new THREE.MeshStandardMaterial({ roughness: 0.85, map: kit.own(leafTexture()), alphaTest: 0.42, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ roughness: 0.85 }));
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  spots.forEach((s, i) => {
    m4.compose(new THREE.Vector3(s.x, (s.y ?? 0) + (kind === 'bush' ? 0.45 * s.s : 0.25), s.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 1.7, 0)), new THREE.Vector3(s.s, s.s * (kind === 'bush' ? 0.8 : 1), s.s));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, kind === 'bush' ? col.set(s.color).lerp(new THREE.Color('#ffffff'), 0.55) : col.set(s.color));
  });
  mesh.castShadow = kind === 'bush';
  mesh.receiveShadow = true;
  return mesh;
}

/* ---------- Céu noturno e nuvens ---------- */

export function stars(kit: Kit, count = 500): THREE.Points {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const h = 0.15 + Math.random() * 0.85;
    const r = 350;
    pos[i * 3] = Math.cos(a) * r * Math.sqrt(1 - h * h);
    pos[i * 3 + 1] = h * r;
    pos[i * 3 + 2] = Math.sin(a) * r * Math.sqrt(1 - h * h);
  }
  const g = kit.own(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = kit.own(new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  return new THREE.Points(g, m);
}

export function cloud(kit: Kit, seed: number): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const s = 2.5 + ((seed * 7 + i * 13) % 5) * 0.6;
    const g = new THREE.IcosahedronGeometry(s, 1);
    g.translate((i - 2.5) * 2.6, Math.sin(i + seed) * 0.8, Math.cos(i * 2 + seed) * 1.5);
    parts.push(g.toNonIndexed());
    g.dispose();
  }
  const merged = kit.own(mergeGeometries(parts)!);
  parts.forEach((p) => p.dispose());
  merged.scale(1, 0.55, 1);
  const m = new THREE.Mesh(merged, kit.mat('#FFFFFF', { rough: 1 }));
  m.castShadow = false;
  return m;
}
