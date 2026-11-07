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

/**
 * Malha de água em anéis (do centro até a margem), com o atributo `edge` (0 no centro, 1 na
 * margem) para a cor rasa perto da borda. Plano XY (a malha é girada para ficar deitada).
 */
export function waterGeometry(radiusAt: (a: number) => number, rings = 14, segs = 96): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const edge: number[] = [0];
  const uv: number[] = [0.5, 0.5];
  const idx: number[] = [];
  for (let r = 1; r <= rings; r++) {
    const k = Math.pow(r / rings, 0.8);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const rr = (radiusAt(a) - 0.6) * k;
      pos.push(Math.cos(a) * rr, -Math.sin(a) * rr, 0);
      edge.push(r / rings);
      uv.push(0.5 + Math.cos(a) * k * 0.5, 0.5 - Math.sin(a) * k * 0.5);
    }
  }
  const at = (r: number, s: number) => (r === 0 ? 0 : 1 + (r - 1) * segs + (s % segs));
  for (let s = 0; s < segs; s++) idx.push(0, at(1, s + 1), at(1, s));
  for (let r = 1; r < rings; r++)
    for (let s = 0; s < segs; s++) {
      const a = at(r, s);
      const b = at(r, s + 1);
      const c = at(r + 1, s);
      const d = at(r + 1, s + 1);
      idx.push(a, d, c, a, b, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Água (V2.1, seção 6.3): reflexo do céu (mais forte de lado, como na água de verdade), brilho
 * do sol, ondulações que andam com o vento, transparência e cor rasa perto da margem e funda
 * no meio, gotas de chuva e escurecimento à noite. Tudo num shader, sem segunda renderização.
 */
export function water(kit: Kit, radius: number | ((a: number) => number), color = '#2E9BD6'): { mesh: THREE.Mesh; tick: (t: number) => void } {
  const mat = kit.own(
    new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          t: { value: 0 },
          deep: { value: new THREE.Color(color).multiplyScalar(0.55) },
          shallow: { value: new THREE.Color('#6FC3C9') },
          skyTop: { value: new THREE.Color('#4F9FE0') },
          skyBottom: { value: new THREE.Color('#D6ECF7') },
          sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
          sunColor: { value: new THREE.Color('#FFF6E5') },
          night: { value: 0 },
          rain: { value: 0 },
          wind: { value: 0 },
        },
      ]),
      vertexShader: `attribute float edge; varying float vEdge; varying vec3 vWorld; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){
          vEdge = edge; vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float t; uniform vec3 deep; uniform vec3 shallow; uniform vec3 skyTop; uniform vec3 skyBottom; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform float night; uniform float rain; uniform float wind;
        varying float vEdge; varying vec3 vWorld; varying vec2 vUv;
        #include <fog_pars_fragment>
        vec2 grad(vec2 p, vec2 d, float f, float s, float a){ return d * (a * f * cos(dot(p, d) * f + t * s)); }
        void main(){
          vec2 p = vWorld.xz;
          float k = 0.6 + wind * 1.4;
          vec2 g = grad(p, normalize(vec2(1.0, 0.3)), 1.2, 1.6 + wind, 0.05 * k)
                 + grad(p, normalize(vec2(-0.4, 1.0)), 2.1, 2.2 + wind * 2.0, 0.03 * k)
                 + grad(p, normalize(vec2(0.7, -0.8)), 3.7, 2.9, 0.018 * k)
                 + grad(p, normalize(vec2(-1.0, -0.2)), 6.3, 3.8, 0.011 * k)
                 + grad(p, normalize(vec2(0.2, 1.0)), 11.0, 5.1, 0.006 * k);
          vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N);
          vec3 sky = mix(skyBottom, skyTop, clamp(R.y * 1.6, 0.0, 1.0));
          // Raso perto da margem (claro e transparente), fundo no meio (escuro).
          float sh = smoothstep(0.55, 1.0, vEdge);
          vec3 body = mix(deep, shallow, sh);
          vec3 c = mix(body, sky, clamp(fres * 1.15, 0.0, 0.9));
          float spec = pow(max(dot(R, normalize(sunDir)), 0.0), 220.0);
          c += sunColor * spec * 2.2 * (1.0 - night * 0.85);
          // Chuva: anéis de gotas que nascem e se abrem pela superfície.
          vec2 q = p * 0.9; vec2 id = floor(q); vec2 f = fract(q) - 0.5;
          float hsh = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
          float ph = fract(t * 0.8 + hsh);
          float ring = smoothstep(0.06, 0.0, abs(length(f) - ph * 0.45)) * (1.0 - ph) * step(hsh, rain);
          c = mix(c, sky, ring * 0.7);
          c *= mix(1.0, 0.4, night);
          float alpha = mix(0.94, 0.55, smoothstep(0.8, 1.0, vEdge));
          gl_FragColor = vec4(c, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    }),
  );
  const geo = waterGeometry(typeof radius === 'number' ? () => radius + 0.6 : radius, typeof radius === 'number' ? 6 : 14, typeof radius === 'number' ? 48 : 128);
  const mesh = new THREE.Mesh(kit.own(geo), mat);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, tick: (t) => (mat.uniforms.t!.value = t) };
}

/** Céu e sol refletidos nas águas criadas por `water`. */
export function setWaterSky(mesh: THREE.Mesh, top: THREE.Color, bottom: THREE.Color, sunDir: THREE.Vector3, sun: THREE.Color) {
  const m = mesh.material as THREE.ShaderMaterial;
  if (!m.uniforms?.skyTop) return;
  m.uniforms.skyTop.value.copy(top);
  m.uniforms.skyBottom!.value.copy(bottom);
  m.uniforms.sunDir!.value.copy(sunDir);
  m.uniforms.sunColor!.value.copy(sun);
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
  tick: (t: number, wind?: number, cam?: THREE.Vector3) => void;
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
function blobCrown(seed: number, blobs: number, spread: number, size: number, flat: number, density = 1): THREE.BufferGeometry {
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
    // De longe (density < 1): menos folhas, um pouco maiores, cobrindo o mesmo volume.
    const cards = Math.max(3, Math.round((9 + Math.floor(r() * 5)) * density));
    const grow = density < 1 ? 1 / Math.sqrt(density) * 0.85 : 1;
    for (let k = 0; k < cards; k++) {
      // Ponto na superfície do volume (mais em cima e dos lados que embaixo).
      const u = r() * Math.PI * 2;
      const v = Math.acos(1 - r() * 1.7);
      n.set(Math.sin(v) * Math.cos(u), Math.cos(v) * flat, Math.sin(v) * Math.sin(u)).normalize();
      const cs = bs * (0.9 + r() * 0.5) * grow;
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
const SPECIES: Record<TreeSpecies, { trunkH: number; crown: (density?: number) => THREE.BufferGeometry; crownY: number; color: string }> = {
  round: { trunkH: 3, crown: (d) => blobCrown(3, 5, 1.8, 1.9, 0.75, d), crownY: 4.6, color: '#4C9A4F' },
  conifer: { trunkH: 2, crown: (d) => blobCrown(7, 4, 0.9, 1.6, 1.6, d), crownY: 4.4, color: '#2F7A4A' },
  slender: { trunkH: 9, crown: (d) => blobCrown(11, 7, 3.2, 2.4, 0.5, d), crownY: 10.5, color: '#5E9E4C' },
  blossom: { trunkH: 2.6, crown: (d) => blobCrown(17, 5, 1.5, 1.5, 0.8, d), crownY: 4, color: '#F2A7C5' },
  palm: { trunkH: 7, crown: () => palmCrown(), crownY: 7.2, color: '#5DAF55' },
};

/** Até onde a árvore aparece com todas as folhas e sombra; além disso, a versão leve (mesma forma e cor). */
const TREE_NEAR = 170;

export function forest(kit: Kit, plants: Plant[]): Forest {
  const group = new THREE.Group();
  const trunkMat = kit.mat('#6B4A33', { rough: 0.95 });
  const leaves = kit.own(leafTexture());
  const bySpecies = new Map<TreeSpecies, Plant[]>();
  plants.forEach((p) => bySpecies.set(p.species, [...(bySpecies.get(p.species) ?? []), p]));
  const sway = { uTime: { value: 0 }, uWind: { value: 0 } };
  // Por espécie: perto (todas as folhas, galhos, sombra) e longe (menos folhas maiores, tronco simples, sem sombra).
  type TreeSet = { list: Plant[]; trunkM: THREE.Matrix4[]; crownM: THREE.Matrix4[]; near: [THREE.InstancedMesh, THREE.InstancedMesh]; far: [THREE.InstancedMesh, THREE.InstancedMesh]; species: TreeSpecies; mat: THREE.MeshStandardMaterial };
  const sets: TreeSet[] = [];
  bySpecies.forEach((list, sp) => {
    const def = SPECIES[sp];
    const trunkGeo = kit.own(sp === 'palm' ? (() => { const g = new THREE.CylinderGeometry(0.14, 0.24, def.trunkH, 8); g.translate(0, def.trunkH / 2, 0); return g; })() : trunkWithBranches(def.trunkH, sp === 'slender' ? 2.4 : 1.2, sp.length * 31));
    const farTrunkGeo = kit.own((() => { const g = new THREE.CylinderGeometry(sp === 'palm' ? 0.14 : 0.13, sp === 'palm' ? 0.24 : 0.26, def.trunkH, 5, 1, true); g.translate(0, def.trunkH / 2, 0); return g; })());
    const crownGeo = kit.own(tintedCrown(def.crown(), '#ffffff', sp.length));
    const farCrownGeo = kit.own(tintedCrown(def.crown(0.35), '#ffffff', sp.length));
    const crownMat = kit.own(new THREE.MeshStandardMaterial({ color: def.color, vertexColors: true, roughness: 0.85, map: leaves, alphaTest: 0.42, side: THREE.DoubleSide }));
    // Balanço das copas no vento calculado na placa de vídeo (sem recalcular as árvores no processador).
    crownMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = sway.uTime;
      sh.uniforms.uWind = sway.uWind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sw = sin(uTime * (1.1 + uWind * 1.8) + ip.x * 0.3 + ip.z * 0.2) * (0.04 + uWind * 0.13) + uWind * 0.05;
        transformed.z += sw * position.y;
        transformed.x -= sw * 0.7 * position.y;`,
      );
    };
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow: boolean) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      m.count = 0;
      m.castShadow = shadow;
      m.receiveShadow = shadow;
      m.frustumCulled = false;
      group.add(m);
      return m;
    };
    const yaw = new THREE.Vector3(0, 1, 0);
    const trunkM = list.map((p) => new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), new THREE.Quaternion().setFromAxisAngle(yaw, p.x * 1.7 + p.z), new THREE.Vector3(p.s, p.s, p.s)));
    const crownM = list.map((p) => new THREE.Matrix4().compose(new THREE.Vector3(p.x, (p.y ?? 0) + def.crownY * p.s, p.z), new THREE.Quaternion().setFromAxisAngle(yaw, p.x * 1.7 + p.z), new THREE.Vector3(p.s, p.s, p.s)));
    sets.push({ list, trunkM, crownM, near: [mk(trunkGeo, trunkMat, true), mk(crownGeo, crownMat, true)], far: [mk(farTrunkGeo, trunkMat, false), mk(farCrownGeo, crownMat, false)], species: sp, mat: crownMat });
  });
  let fraction = 1;
  let lastX = Infinity;
  let lastZ = Infinity;
  let dirty = true;
  const place = (cx: number, cz: number) => {
    for (const st of sets) {
      const n = Math.max(1, Math.round(st.list.length * fraction));
      let a = 0;
      let b = 0;
      for (let i = 0; i < n; i++) {
        const p = st.list[i]!;
        if (Math.hypot(p.x - cx, p.z - cz) < TREE_NEAR) {
          st.near[0].setMatrixAt(a, st.trunkM[i]!);
          st.near[1].setMatrixAt(a++, st.crownM[i]!);
        } else {
          st.far[0].setMatrixAt(b, st.trunkM[i]!);
          st.far[1].setMatrixAt(b++, st.crownM[i]!);
        }
      }
      for (const m of st.near) {
        m.count = a;
        m.instanceMatrix.needsUpdate = true;
      }
      for (const m of st.far) {
        m.count = b;
        m.instanceMatrix.needsUpdate = true;
      }
    }
  };
  place(0, 0);
  const tick = (t: number, wind = 0, cam?: THREE.Vector3) => {
    sway.uTime.value = t;
    sway.uWind.value = wind;
    // Troca perto/longe só quando a câmera anda (a cada 12 m), não a cada quadro.
    if (cam && (dirty || Math.hypot(cam.x - lastX, cam.z - lastZ) > 12)) {
      lastX = cam.x;
      lastZ = cam.z;
      dirty = false;
      place(cam.x, cam.z);
    }
  };
  return {
    group,
    tick,
    setCount: (f) => {
      fraction = f;
      dirty = true;
      place(Number.isFinite(lastX) ? lastX : 0, Number.isFinite(lastZ) ? lastZ : 0);
    },
    setSeason: (colors) => sets.forEach((c) => colors[c.species] && c.mat.color.set(colors[c.species]!)),
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
