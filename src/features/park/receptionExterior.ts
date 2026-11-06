/**
 * Fatia vertical da V2 (Etapa 0): praça central, fonte ROUTIG e a Central de Recepção (Inbox)
 * por fora, no nível de detalhe final. Mesmo método que será usado nos outros prédios:
 * peças geradas em código, juntadas por material, repetições em instâncias.
 */
import * as THREE from 'three';
import { seededRandom } from '@/domain/park';
import { Builder, Kit, cloud, forest, ribbon, setWaterNight, shrubs, signTexture, sky, stars, water, type Plant, type TreeSpecies } from './kit';
import { createLogo3D } from './logo3d';

/** Posição da Central de Recepção na fatia (frente virada para a praça). */
export const RECEPTION = { x: 0, z: -22.5 } as const;
/** Ponto diante das portas, para onde a câmera vai antes de entrar. */
export const ENTRANCE = new THREE.Vector3(RECEPTION.x, 1.6, RECEPTION.z + 9.5);

const PALETTE = { blue: '#1E6FD9', cyan: '#22D3EE', turquoise: '#14B8A6', silver: '#CBD5E1', white: '#EEF2F7', paving: '#E7E1D3', dark: '#334155' };

export type TimeOfDay = 'day' | 'dusk' | 'night';

interface Light {
  skyTop: string;
  skyBottom: string;
  sun: string;
  sunI: number;
  hemiI: number;
  sunPos: [number, number, number];
  glow: number;
}

export const TIMES: Record<TimeOfDay, Light> = {
  day: { skyTop: '#4F9FE0', skyBottom: '#DCEFF8', sun: '#FFF6E5', sunI: 2.2, hemiI: 1.0, sunPos: [40, 75, 30], glow: 0 },
  dusk: { skyTop: '#3B4C8C', skyBottom: '#F6A86B', sun: '#FFB27A', sunI: 1.3, hemiI: 0.6, sunPos: [-70, 18, 20], glow: 0.55 },
  night: { skyTop: '#060B22', skyBottom: '#1B2550', sun: '#9DB4FF', sunI: 0.35, hemiI: 0.22, sunPos: [-30, 60, -40], glow: 1 },
};

export interface Exterior {
  root: THREE.Group;
  /** Objetos tocáveis: a Central de Recepção. */
  pickables: THREE.Object3D[];
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** `focus`: ponto que a câmera olha (a chuva acompanha). */
  tick: (t: number, dt: number, focus: THREE.Vector3) => void;
  setLight: (l: Light, night: number) => void;
  setRain: (on: boolean) => void;
  setDetail: (q: 'low' | 'medium' | 'high') => void;
  /** Topo do prédio (para o rótulo). */
  top: THREE.Vector3;
}

/* ---------- Chão com relevo suave e cor por vértice ---------- */

function ground(kit: Kit): THREE.Mesh {
  const plane = new THREE.PlaneGeometry(300, 300, 90, 90);
  plane.rotateX(-Math.PI / 2);
  const pos = plane.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color('#79B562');
  const b = new THREE.Color('#5E9A4E');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const far = THREE.MathUtils.smoothstep(r, 38, 110);
    const h = far * (Math.sin(x * 0.045) * Math.cos(z * 0.05) * 5 + Math.sin((x + z) * 0.02) * 4 + 3);
    pos.setY(i, h - 0.02);
    const n = (Math.sin(x * 0.7) * Math.cos(z * 0.6) + Math.sin(x * 0.13 + z * 0.17)) * 0.25 + 0.5;
    c.lerpColors(a, b, n * 0.8 + far * 0.2);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  plane.setAttribute('color', new THREE.BufferAttribute(col, 3));
  plane.computeVertexNormals();
  const m = new THREE.Mesh(kit.own(plane), kit.mat('#ffffff', { vertexColors: true, rough: 0.95 }));
  m.receiveShadow = true;
  return m;
}

/* ---------- Praça ---------- */

function plaza(kit: Kit): THREE.Group {
  const b = new Builder();
  const flat = (g: THREE.BufferGeometry, y: number) => b.add(kit.mat(PALETTE.paving, { rough: 0.85 }), g, [0, y, 0], [-Math.PI / 2, 0, 0]);
  flat(new THREE.CircleGeometry(12, 64), 0.04);
  const ring = (r1: number, r2: number, color: string, y = 0.05) => b.add(kit.mat(color, { rough: 0.7 }), new THREE.RingGeometry(r1, r2, 64), [0, y, 0], [-Math.PI / 2, 0, 0]);
  ring(4.4, 4.75, '#BFB6A3');
  ring(7.6, 7.9, PALETTE.turquoise);
  ring(11.2, 11.5, '#BFB6A3');
  // Raios de pedra entre os anéis.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 6.15;
    b.add(kit.mat('#CFC6B2', { rough: 0.8 }), new THREE.BoxGeometry(0.16, 0.02, 2.8), [Math.sin(a) * r, 0.055, Math.cos(a) * r], [0, a, 0]);
  }
  // Meio-fio elevado em volta da praça.
  b.add(kit.mat('#D6D0C2'), new THREE.TorusGeometry(12.05, 0.18, 6, 96), [0, 0.08, 0], [-Math.PI / 2, 0, 0]);
  // Bancos (8) e postes (8), alternados.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    if (Math.cos(a) < -0.9) continue; // abertura para a Central de Recepção (norte)
    const x = Math.sin(a) * 10;
    const z = Math.cos(a) * 10;
    const wood = kit.mat('#A0714F', { rough: 0.8 });
    const metal = kit.mat('#475569', { metal: 0.7, rough: 0.35 });
    b.add(wood, new THREE.BoxGeometry(2.4, 0.12, 0.6), [x, 0.5, z], [0, a, 0]);
    b.add(wood, new THREE.BoxGeometry(2.4, 0.5, 0.1), [x + Math.sin(a) * 0.32, 0.8, z + Math.cos(a) * 0.32], [-0.15, a, 0]);
    for (const s of [-1, 1]) b.add(metal, new THREE.BoxGeometry(0.1, 0.5, 0.55), [x + Math.cos(a) * s * 1.05, 0.25, z - Math.sin(a) * s * 1.05], [0, a, 0]);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (Math.cos(a) < -0.9) continue;
    const x = Math.sin(a) * 11.6;
    const z = Math.cos(a) * 11.6;
    b.add(kit.mat('#334155', { metal: 0.8, rough: 0.3 }), new THREE.CylinderGeometry(0.08, 0.12, 4, 8), [x, 2, z]);
    b.add(kit.mat('#334155', { metal: 0.8, rough: 0.3 }), new THREE.CylinderGeometry(0.35, 0.2, 0.18, 12), [x, 4.05, z]);
    b.add(kit.mat('#FFE7B0', { glow: true, rough: 0.4 }), new THREE.SphereGeometry(0.24, 12, 8), [x, 3.85, z]);
  }
  return b.build();
}

/* ---------- Fonte ROUTIG ---------- */

function lathe(points: Array<[number, number]>, seg = 48): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

function fountain(kit: Kit): { group: THREE.Group; tick: (t: number) => void; waters: THREE.Mesh[]; logo: THREE.Mesh } {
  const group = new THREE.Group();
  const stone = kit.mat('#F1EEE8', { rough: 0.55 });
  const trim = kit.mat(PALETTE.silver, { metal: 0.85, rough: 0.25 });
  const b = new Builder();
  b.add(stone, lathe([[0, 0], [3.9, 0], [4.05, 0.15], [4.05, 0.75], [3.8, 0.85], [3.55, 0.8], [3.5, 0.3], [0, 0.3]]));
  b.add(trim, new THREE.TorusGeometry(3.95, 0.05, 6, 96), [0, 0.86, 0], [-Math.PI / 2, 0, 0]);
  b.add(stone, lathe([[0.55, 0.3], [0.45, 1.2], [0.5, 1.9], [0, 1.9]], 32));
  b.add(stone, lathe([[0, 1.9], [1.9, 1.95], [2.05, 2.3], [1.85, 2.38], [1.75, 2.1], [0, 2.1]]));
  b.add(trim, new THREE.TorusGeometry(1.98, 0.04, 6, 64), [0, 2.36, 0], [-Math.PI / 2, 0, 0]);
  b.add(stone, lathe([[0.32, 2.1], [0.25, 2.8], [0.42, 3.0], [0, 3.0]], 24));
  group.add(b.build());

  const w1 = water(kit, 3.55, '#2B8FD0');
  w1.mesh.position.y = 0.62;
  const w2 = water(kit, 1.78, '#38A6E0');
  w2.mesh.position.y = 2.2;
  group.add(w1.mesh, w2.mesh);

  // Escultura: o logo do ROUTIG em pé, girando devagar sobre um anel luminoso.
  const logo = createLogo3D(2.9);
  kit.own({ dispose: logo.dispose });
  const holder = new THREE.Group();
  holder.position.y = 4.55;
  holder.add(logo.mesh);
  group.add(holder);
  const halo = new THREE.Mesh(kit.own(new THREE.TorusGeometry(0.62, 0.05, 8, 48)), kit.mat(PALETTE.cyan, { glow: true }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 3.05;
  group.add(halo);

  // Jatos: partículas num shader (um desenho), arcos da borda para o centro e jato central.
  const N = 420;
  const seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const ring = i < 300;
    seed[i * 3] = ring ? ((i % 12) / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.06 : Math.random() * Math.PI * 2;
    seed[i * 3 + 1] = Math.random();
    seed[i * 3 + 2] = ring ? 0 : 1;
  }
  const pg = kit.own(new THREE.BufferGeometry());
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  pg.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 6);
  const pm = kit.own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { t: { value: 0 }, px: { value: 1 }, night: { value: 0 } },
      vertexShader: `attribute vec3 seed; uniform float t; uniform float px; varying float vA;
        void main(){
          float ph = fract(t * (seed.z > 0.5 ? 0.9 : 0.55) + seed.y);
          vec3 p;
          if (seed.z < 0.5) {
            float r = 3.35 - ph * 1.55;
            p = vec3(sin(seed.x) * r, 0.75 + 4.2 * ph * (1.0 - ph) * 1.25, cos(seed.x) * r);
          } else {
            float r = 0.08 + ph * 0.5;
            p = vec3(sin(seed.x) * r, 3.0 + 3.6 * ph * (1.0 - ph) * 2.0, cos(seed.x) * r);
          }
          vA = 1.0 - ph * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = px * 7.0 / -mv.z * 10.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float night; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
          vec3 col = mix(vec3(0.85, 0.95, 1.0), vec3(0.45, 0.85, 1.0), night);
          gl_FragColor = vec4(col, (0.25 - d) * 3.2 * vA); }`,
    }),
  );
  const jets = new THREE.Points(pg, pm);
  group.add(jets);

  return {
    group,
    waters: [w1.mesh, w2.mesh],
    logo: logo.mesh,
    tick: (t) => {
      w1.tick(t);
      w2.tick(t * 1.3);
      holder.rotation.y = t * 0.25;
      holder.position.y = 4.55 + Math.sin(t * 0.8) * 0.08;
      pm.uniforms.t!.value = t;
      pm.uniforms.px!.value = Math.min(2, window.devicePixelRatio || 1);
    },
  };
}

/* ---------- Central de Recepção (Inbox) ---------- */

function reception(kit: Kit): { group: THREE.Group; tick: (t: number) => void; top: number } {
  const group = new THREE.Group();
  const white = kit.mat(PALETTE.white, { rough: 0.5 });
  const silver = kit.mat(PALETTE.silver, { metal: 0.9, rough: 0.22 });
  const dark = kit.mat('#1F2A3A', { metal: 0.6, rough: 0.35 });
  const glassBlue = kit.mat('#7FC4F2', { glass: true });
  const glassCyan = kit.mat('#9BE7F5', { glass: true });
  const cyanGlow = kit.mat(PALETTE.cyan, { glow: true, rough: 0.3 });
  const turqGlow = kit.mat(PALETTE.turquoise, { glow: true, rough: 0.3 });
  const warm = kit.mat('#FFD9A0', { glow: true, rough: 0.9 });
  const blue = kit.mat(PALETTE.blue, { metal: 0.3, rough: 0.35 });
  const b = new Builder();

  // Embasamento em degraus, com rampa e escada de frente para a praça (+z).
  b.add(white, new THREE.CylinderGeometry(8.2, 8.5, 0.4, 64), [0, 0.2, 0]);
  b.add(kit.mat('#E2E8F0', { rough: 0.45 }), new THREE.CylinderGeometry(7.6, 7.9, 0.4, 64), [0, 0.6, 0]);
  for (let s = 0; s < 3; s++) b.add(white, new THREE.BoxGeometry(5.2 - s * 0.2, 0.27, 0.6), [0, 0.135 + s * 0.27, 8.9 - s * 0.55]);
  b.add(white, new THREE.BoxGeometry(1.6, 0.1, 4.2), [5.2, 0.4, 8.6], [0.18, 0, 0]);
  b.add(silver, new THREE.BoxGeometry(0.05, 0.05, 4.2), [6.05, 1.25, 8.6], [0.18, 0, 0]);

  // Tambor de vidro do térreo + aletas metálicas verticais.
  b.add(glassBlue, new THREE.CylinderGeometry(5.6, 5.6, 4.4, 64, 1, true), [0, 3, 0]);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.32) continue; // vão da entrada
    b.add(silver, new THREE.BoxGeometry(0.1, 4.4, 0.42), [Math.sin(a) * 5.75, 3, Math.cos(a) * 5.75], [0, a, 0]);
  }
  // Interior visto pelo vidro: piso claro, núcleo quente e balcão.
  b.add(kit.mat('#F8FAFC', { rough: 0.25 }), new THREE.CylinderGeometry(5.5, 5.5, 0.05, 48), [0, 0.83, 0]);
  b.add(warm, new THREE.CylinderGeometry(1.4, 1.4, 4.2, 24, 1, true), [0, 3, -1.2]);
  b.add(blue, new THREE.TorusGeometry(2.2, 0.35, 8, 32, Math.PI * 1.2), [0, 1.3, 0.4], [-Math.PI / 2, 0, Math.PI * 0.4 - Math.PI]);

  // Laje do 1º andar com faixa de luz ciano.
  b.add(silver, new THREE.CylinderGeometry(6.4, 6.4, 0.4, 64), [0, 5.4, 0]);
  b.add(cyanGlow, new THREE.TorusGeometry(6.42, 0.07, 6, 128), [0, 5.32, 0], [-Math.PI / 2, 0, 0]);

  // Andar superior: vidro ciano, aletas inclinadas e janelas acesas à noite.
  b.add(glassCyan, new THREE.CylinderGeometry(4.6, 5.0, 3.2, 64, 1, true), [0, 7.2, 0]);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    b.add(dark, new THREE.BoxGeometry(0.08, 3.25, 0.3), [Math.sin(a) * 4.92, 7.2, Math.cos(a) * 4.92], [0.06, a, 0]);
  }
  b.add(warm, new THREE.CylinderGeometry(4.3, 4.3, 2.6, 32, 1, true), [0, 7.2, 0]);

  // Cobertura em balanço, prateada, com anel turquesa por baixo.
  b.add(silver, new THREE.CylinderGeometry(7.4, 6.9, 0.45, 72), [0, 9.05, 0]);
  b.add(turqGlow, new THREE.TorusGeometry(6.95, 0.09, 6, 128), [0, 8.8, 0], [-Math.PI / 2, 0, 0]);
  b.add(white, new THREE.CylinderGeometry(7.45, 7.45, 0.08, 72), [0, 9.3, 0]);

  // Jardim na cobertura.
  b.add(kit.mat('#6FA858', { rough: 1 }), new THREE.CylinderGeometry(4.6, 4.6, 0.3, 48), [0, 9.45, 0]);
  b.add(white, new THREE.TorusGeometry(4.65, 0.12, 6, 64), [0, 9.6, 0], [-Math.PI / 2, 0, 0]);

  // Mastro de comunicação.
  b.add(dark, new THREE.CylinderGeometry(0.1, 0.18, 5, 8), [2.2, 11.9, -1.5]);
  for (let k = 0; k < 4; k++) b.add(silver, new THREE.CylinderGeometry(0.03, 0.03, 1.2 - k * 0.2, 6), [2.2, 10.6 + k * 1.1, -1.5], [0, 0, Math.PI / 2]);

  // Marquise da entrada, colunas finas e portas de vidro.
  b.add(silver, new THREE.BoxGeometry(5.4, 0.22, 3.4), [0, 4.0, 6.9]);
  b.add(cyanGlow, new THREE.BoxGeometry(5.0, 0.04, 0.06), [0, 3.88, 8.55]);
  for (const s of [-1, 1]) b.add(dark, new THREE.CylinderGeometry(0.09, 0.09, 3.2, 10), [s * 2.4, 2.4, 8.3]);
  b.add(glassCyan, new THREE.BoxGeometry(3.2, 3.0, 0.08), [0, 2.3, 5.62]);
  b.add(dark, new THREE.BoxGeometry(0.08, 3.0, 0.12), [0, 2.3, 5.64]);

  // Canteiros com arbustos encostados no embasamento.
  for (const s of [-1, 1]) b.add(white, new THREE.BoxGeometry(2.4, 0.6, 1.0), [s * 4.4, 0.3, 8.6]);

  group.add(b.build());

  // Letreiro (canvas) sobre a marquise.
  const tex = signTexture(kit, ['INBOX', 'CENTRAL DE RECEPÇÃO'], { bg: 'rgba(12,30,60,0.92)', fg: '#E8FBFF', accent: PALETTE.cyan, w: 768, h: 192 });
  const sign = new THREE.Mesh(kit.own(new THREE.PlaneGeometry(4.6, 1.15)), kit.own(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55, roughness: 0.4 })));
  sign.position.set(0, 4.75, 8.62);
  group.add(sign);

  // Prato da antena girando e luz de topo piscando.
  const dish = new THREE.Group();
  dish.position.set(2.2, 13.6, -1.5);
  const dishMesh = new THREE.Mesh(kit.own(new THREE.SphereGeometry(0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3)), kit.mat(PALETTE.silver, { metal: 0.9, rough: 0.22, side: THREE.DoubleSide }));
  dishMesh.rotation.x = -Math.PI / 2.6;
  dish.add(dishMesh);
  const beacon = new THREE.Mesh(kit.own(new THREE.SphereGeometry(0.16, 10, 8)), kit.own(new THREE.MeshBasicMaterial({ color: '#FF4D6D' })));
  beacon.position.set(2.2, 14.55, -1.5);
  group.add(dish, beacon);

  // Arbustos e flores da cobertura e dos canteiros (instâncias).
  const rnd = seededRandom(31);
  const bushSpots: Array<{ x: number; y?: number; z: number; s: number; color: string }> = [];
  const flowerSpots: typeof bushSpots = [];
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 1 + rnd() * 3.2;
    bushSpots.push({ x: Math.sin(a) * r, y: 9.6, z: Math.cos(a) * r, s: 0.6 + rnd() * 0.5, color: rnd() > 0.5 ? '#3E8E4A' : '#58A35A' });
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) bushSpots.push({ x: s * 4.4 + (i - 1.5) * 0.55, y: 0.6, z: 8.6, s: 0.45, color: '#3E8E4A' });
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.8 + rnd() * 3.6;
    flowerSpots.push({ x: Math.sin(a) * r, y: 9.6, z: Math.cos(a) * r, s: 1, color: ['#F472B6', '#FBBF24', '#FFFFFF', '#A78BFA'][i % 4]! });
  }
  group.add(shrubs(kit, bushSpots, 'bush'), shrubs(kit, flowerSpots, 'flower'));

  group.position.set(RECEPTION.x, 0, RECEPTION.z);
  group.traverse((o) => (o.userData.pick = 'inbox'));
  return {
    group,
    top: 15,
    tick: (t) => {
      dish.rotation.y = t * 0.6;
      (beacon.material as THREE.MeshBasicMaterial).color.setScalar(0).setRGB(Math.sin(t * 3) > 0.6 ? 1 : 0.25, 0.1, 0.2);
    },
  };
}

/* ---------- Vegetação, caminhos e vida ---------- */

const v2 = (pts: Array<[number, number]>) => pts.map(([x, z]) => new THREE.Vector2(x, z));

/** Volta em torno do prédio (0° = de frente para a praça). */
const LOOP = [40, 90, 140, 180, 220, 270, 320].map((deg): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [RECEPTION.x + Math.sin(a) * 11.5, RECEPTION.z + Math.cos(a) * 11.5];
});

const PATH_LINES: THREE.Vector2[][] = [
  // Saídas da praça para as quatro regiões (curvas suaves).
  v2([[9, 8], [20, 14], [34, 12], [60, 18]]),
  v2([[-9, 8], [-18, 18], [-30, 22], [-58, 30]]),
  v2([[0, 12], [3, 26], [-4, 40], [2, 70]]),
  v2([[11.5, -3], [24, -8], [40, -4], [70, -10]]),
  v2([[-11.5, -3], [-24, -10], [-42, -6], [-70, -14]]),
  v2(LOOP),
];

function paths(kit: Kit): THREE.Group {
  const b = new Builder();
  const edge = kit.mat('#B8AE98', { rough: 0.9 });
  const pave = kit.mat('#DCD3C0', { rough: 0.85 });
  for (const l of PATH_LINES) {
    b.add(edge, ribbon(l, 4.0, 0.025));
    b.add(pave, ribbon(l, 3.3, 0.035));
  }
  return b.build();
}

function plants(): Plant[] {
  const rnd = seededRandom(11);
  const out: Plant[] = [];
  const species: TreeSpecies[] = ['round', 'round', 'conifer', 'slender', 'blossom'];
  // Pontos ao longo dos caminhos: nenhuma árvore em cima deles.
  const onPath = PATH_LINES.flatMap((l) => new THREE.SplineCurve(l).getSpacedPoints(60));
  let guard = 0;
  while (out.length < 320 && guard++ < 20000) {
    const a = rnd() * Math.PI * 2;
    const r = 14 + Math.sqrt(rnd()) * 95;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (Math.hypot(x - RECEPTION.x, z - RECEPTION.z) < 15) continue;
    if (onPath.some((p) => Math.hypot(p.x - x, p.y - z) < 3.6)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 3.2)) continue;
    const far = r > 40 ? 1.15 : 1;
    out.push({ x, z, s: (0.75 + rnd() * 0.55) * far, species: species[Math.floor(rnd() * species.length)]! });
  }
  return out;
}

function birds(kit: Kit, count: number): { mesh: THREE.InstancedMesh; tick: (t: number) => void } {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.4, -0.9, 0.1, -0.1, 0, 0, -0.2, 0, 0, 0.4, 0, 0, -0.2, 0.9, 0.1, -0.1], 3));
  g.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(kit.own(g), kit.mat('#2D3748', { side: THREE.DoubleSide }), count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  return {
    mesh,
    tick: (t) => {
      for (let i = 0; i < count; i++) {
        const a = t * 0.18 + (i / count) * 0.9;
        const r = 34 + (i % 3) * 2.5;
        p.set(Math.sin(a) * r + (i % 2) * 1.5, 26 + Math.sin(t + i) * 0.8 + (i % 4), Math.cos(a) * r - 10);
        e.set(0, a + Math.PI / 2, 0);
        q.setFromEuler(e);
        s.set(1, 1 + Math.sin(t * 9 + i * 1.7) * 0.9, 1);
        m4.compose(p, q, s);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function drone(kit: Kit): { group: THREE.Group; tick: (t: number) => void } {
  const b = new Builder();
  const body = kit.mat('#E2E8F0', { metal: 0.6, rough: 0.3 });
  b.add(body, new THREE.BoxGeometry(0.7, 0.18, 0.7));
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    b.add(body, new THREE.BoxGeometry(0.06, 0.06, 0.9), [x * 0.3, 0, z * 0.3], [0, Math.atan2(x, z), 0]);
    b.add(kit.mat('#1F2A3A'), new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12), [x * 0.6, 0.1, z * 0.6]);
  }
  b.add(kit.mat(PALETTE.cyan, { glow: true }), new THREE.SphereGeometry(0.08, 8, 6), [0, -0.12, 0.3]);
  const group = b.build(false);
  return {
    group,
    tick: (t) => {
      const a = t * 0.35;
      group.position.set(RECEPTION.x + Math.sin(a) * 11, 12 + Math.sin(t * 1.3) * 0.6, RECEPTION.z + Math.cos(a) * 11);
      group.rotation.y = a + Math.PI / 2;
    },
  };
}

function rain(kit: Kit): { lines: THREE.LineSegments; tick: (dt: number, center: THREE.Vector3) => void } {
  const N = 1400;
  const pos = new Float32Array(N * 6);
  const rnd = seededRandom(5);
  for (let i = 0; i < N; i++) {
    const x = (rnd() - 0.5) * 80;
    const y = rnd() * 40;
    const z = (rnd() - 0.5) * 80;
    pos.set([x, y, z, x + 0.05, y + 0.7, z], i * 6);
  }
  const g = kit.own(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(g, kit.own(new THREE.LineBasicMaterial({ color: '#C9DDF2', transparent: true, opacity: 0.5 })));
  lines.frustumCulled = false;
  lines.visible = false;
  return {
    lines,
    tick: (dt, center) => {
      lines.position.set(center.x, 0, center.z);
      const a = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        let y = a.getY(i * 2) - dt * 30;
        if (y < 0) y += 40;
        a.setY(i * 2, y);
        a.setY(i * 2 + 1, y + 0.7);
      }
      a.needsUpdate = true;
    },
  };
}

/* ---------- Montagem ---------- */

export function createExterior(kit: Kit): Exterior {
  const root = new THREE.Group();
  const sk = sky(kit);
  const st = stars(kit);
  root.add(sk.mesh, st);

  const hemi = new THREE.HemisphereLight('#ffffff', '#5B7A4A', 1);
  const sun = new THREE.DirectionalLight('#FFF6E5', 2.2);
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 5, far: 220 });
  sun.target.position.set(0, 0, -8);
  root.add(hemi, sun, sun.target);

  root.add(ground(kit), plaza(kit), paths(kit));
  const f = fountain(kit);
  root.add(f.group);
  const rec = reception(kit);
  root.add(rec.group);

  // Canteiros da praça com arbustos e flores.
  const rnd = seededRandom(23);
  const bush: Array<{ x: number; z: number; s: number; color: string }> = [];
  const flowers: typeof bush = [];
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * Math.PI * 2 + Math.PI / 4;
    for (let i = 0; i < 9; i++) {
      const a = a0 + (rnd() - 0.5) * 0.5;
      const r = 13.3 + rnd() * 1.6;
      bush.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, s: 0.7 + rnd() * 0.6, color: rnd() > 0.5 ? '#3E8E4A' : '#4F9F55' });
    }
    for (let i = 0; i < 26; i++) {
      const a = a0 + (rnd() - 0.5) * 0.6;
      const r = 12.6 + rnd() * 2.6;
      flowers.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, s: 1, color: ['#F472B6', '#FBBF24', '#FFFFFF', '#60A5FA', '#F87171'][i % 5]! });
    }
  }
  root.add(shrubs(kit, bush, 'bush'), shrubs(kit, flowers, 'flower'));

  const trees = forest(kit, plants());
  root.add(trees.group);

  const clouds = Array.from({ length: 7 }, (_, i) => {
    const c = cloud(kit, i + 1);
    c.position.set(-120 + i * 38, 48 + (i % 3) * 6, -60 + ((i * 37) % 90));
    c.scale.setScalar(1.2 + (i % 3) * 0.4);
    root.add(c);
    return c;
  });
  const bd = birds(kit, 9);
  const dr = drone(kit);
  const rn = rain(kit);
  root.add(bd.mesh, dr.group, rn.lines);

  const pickables = [rec.group];
  let raining = false;
  const skyTop = new THREE.Color();
  const skyBottom = new THREE.Color();
  const waters = f.waters;

  return {
    root,
    pickables,
    sun,
    hemi,
    top: new THREE.Vector3(RECEPTION.x, rec.top, RECEPTION.z),
    tick: (t, dt, focus) => {
      f.tick(t);
      rec.tick(t);
      trees.tick(t);
      bd.tick(t);
      dr.tick(t);
      clouds.forEach((c, i) => {
        c.position.x += dt * (1.2 + (i % 3) * 0.4);
        if (c.position.x > 160) c.position.x = -160;
      });
      if (raining) rn.tick(dt, focus);
    },
    setLight: (l, night) => {
      skyTop.set(l.skyTop);
      skyBottom.set(l.skyBottom);
      if (raining) {
        skyTop.lerp(new THREE.Color('#5B6676'), 0.6);
        skyBottom.lerp(new THREE.Color('#9AA5B4'), 0.6);
      }
      sk.set(skyTop, skyBottom);
      sun.color.set(l.sun);
      sun.intensity = l.sunI * (raining ? 0.45 : 1);
      hemi.intensity = l.hemiI;
      sun.position.set(...l.sunPos);
      (st.material as THREE.PointsMaterial).opacity = night;
      kit.glowing.forEach((m) => (m.emissiveIntensity = 0.15 + l.glow * 1.6));
      waters.forEach((w) => setWaterNight(w, night * 0.8));
      clouds.forEach((c) => (c.material as THREE.MeshStandardMaterial).color.set(raining ? '#AAB4C0' : night > 0.5 ? '#3A4466' : '#FFFFFF'));
    },
    setRain: (on) => {
      raining = on;
      rn.lines.visible = on;
    },
    setDetail: (q) => {
      trees.setCount(q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1);
      bd.mesh.visible = q !== 'low';
      dr.group.visible = q !== 'low';
      clouds.forEach((c, i) => (c.visible = q === 'high' || i % 2 === 0));
    },
  };
}
