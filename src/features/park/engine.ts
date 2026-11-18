/**
 * Motor do parque: um renderizador para o mundo e para o interior aberto (um por vez),
 * câmera livre ou em primeira pessoa, toque para escolher, entrar e sair dos prédios,
 * hora do dia, chuva e qualidade adaptável.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ModuleId } from '@/app/modules';
import { LAKE, PARK_BUILDINGS, PARK_RADIUS, TERRAIN, onBridge, PLAYGROUNDS, PLAZA_RADIUS, PONDS, heightAt, inWater, onPath } from '@/domain/park';
import { Kit } from './kit';
import { createCameraRig, type CameraWorld, type CamMode, type MoveSettings, type Posture, type Seat } from './camera';
import { AVATAR_LOOK, createCrowd, type Figure } from './people';
import { createTown } from './town';
import type { Conditions } from '@/domain/parkPeople';
import { CLEAR_SKY, createWorld, lightAt, type Quality, type Season, type Sky } from './world';
import type { ParkAudio } from './audio';
import { DRUM_PADS, PIANO_KEYS, guitarStrum, type Instrument, type Thing, type ThingCtx, type ThingKind, type VaultState } from './interiors/things';
import type { ParkSnapshot } from './parkContext';
import { footprint } from './collision';
import { entryDoors } from './doors';
import { createExtras } from './extras';
import { createAnimals } from './animals';
import type { ActionSpot, InteriorScene } from './interiors/common';
import type { Climb, Floors } from './interiors/floors';
import { markX, showButtons, type Lift } from './vertical';
import { CIRCULATION, coreFrom, levelAtHeight, liftHint, liftServes, stairApproach, stairOf, voidRadius, type LiftDir } from './stairs';
import { groundSpan } from './massing';
import { reachSummary, stairReach, walkWorld, type ReachLevel } from './reach';

export interface Stats {
  fps: number;
  calls: number;
  triangles: number;
  /** Parado (câmera sem mexer): o parque desenha menos quadros para poupar o aparelho. */
  idle?: boolean;
}

export type InteriorFactory = (kit: Kit) => InteriorScene;

export interface EngineOpts {
  quality: Quality;
  reduceMotion: boolean;
  interiors: Partial<Record<ModuleId, InteriorFactory>>;
  onStats: (s: Stats) => void;
  onPick: (id: ModuleId | null) => void;
  onSector: (id: string | null) => void;
  /** Dentro de qual prédio a câmera está (null = no parque). */
  onInside: (id: ModuleId | null) => void;
  /** Primeira pessoa: prédio cuja entrada está bem perto. */
  onNear: (id: ModuleId | null) => void;
  /** Modo de câmera em uso (muda sozinho ao deslizar até um prédio e voltar). */
  onMode: (m: CamMode) => void;
  /** O que dá para fazer aqui (sentar, observar) e a postura atual. */
  onHint: (h: Hint | null) => void;
  onPosture: (p: Posture) => void;
  /**
   * Perto de um elevador e a pessoa pediu para chamar: mostrar a escolha de andar daquele elevador
   * (índice e sentido: o da esquerda só sobe, o da direita só desce).
   */
  onElevator: (lift: { index: number; dir: LiftDir }) => void;
  /** Elevador em movimento (true) ou parado (false). */
  onRiding: (riding: boolean) => void;
  /** Alguém respondeu ao cumprimento (nome, atividade e qual fala). */
  onTalk: (t: { name: string; activity: string; line: number }) => void;
  /** Interior: quantos andares tem o prédio e em qual a pessoa está. */
  onFloors: (count: number, current: number) => void;
  /** Sala de um andar escolhida (abre o painel real ligado a ela). */
  onZone: (z: { key: string; sector: string | null } | null) => void;
  /** Piano, bateria ou violão: abrir (ou fechar, null) o teclado, os pads ou as cordas na tela. */
  onInstrument: (k: Instrument | null) => void;
  /** Cofre de Finanças: a pessoa pediu para usar o cofre (a tela mostra o bloqueio real de Finanças). */
  onVault: () => void;
  /**
   * Objeto de ação tocado (ou usado andando, com E): `id` do lugar no interior aberto (seção 28).
   * `long` = toque longo (abre a estação inteira em vez da ação rápida).
   */
  onAction: (a: { building: ModuleId; id: string; long: boolean }) => void;
  startMode: CamMode;
  /** Retomar de onde a pessoa estava (volta da interface 2D): sem abertura. */
  restore?: ParkSnapshot | null;
}

export type Hint = { kind: 'use'; what: ThingKind; key?: string; up?: boolean } | { kind: 'act'; id: string } | { kind: 'elevator'; dir: LiftDir; off: boolean } | { kind: 'sit' } | { kind: 'view' } | { kind: 'tree' } | { kind: 'water' } | { kind: 'person'; name: string; activity: string };

export interface Engine {
  setQuality: (q: Quality) => void;
  /** Clima alvo; a mudança é gradual. */
  setWeather: (w: Sky) => void;
  /** Som espacial do parque (null desliga). */
  setAudio: (a: ParkAudio | null) => void;
  setSeason: (s: Season) => void;
  setFestive: (on: boolean) => void;
  /** Posição e direção da câmera no parque (para o minimapa). */
  cameraInfo: () => { x: number; z: number; yaw: number; inside: boolean };
  setCamMode: (m: CamMode) => void;
  setMove: (x: number, y: number) => void;
  setRun: (on: boolean, src?: 'btn' | 'stick') => void;
  jump: () => void;
  /** Botão de interagir: entrar, sentar, observar ou levantar. */
  interact: () => void;
  setMoveSettings: (s: MoveSettings) => void;
  /** Quantas pessoas desenhar no máximo (0 = nenhuma). */
  setCrowd: (max: number) => void;
  /** Hora do parque (0–24): luz contínua e rotina dos moradores; a mudança é gradual. */
  setHour: (h: number) => void;
  /** Hora mostrada agora (durante a transição, a intermediária). */
  hour: () => number;
  census: () => { outside: number; total: number };
  /** Foto do parque visto de cima (meio-dia, sem neblina nem pessoas), para o minimapa. `half` = metade do lado em metros. */
  captureMap: (half: number, px: number) => string | null;
  /** Onde a pessoa está agora (para retomar depois). */
  snapshot: () => ParkSnapshot;
  flyTo: (id: ModuleId | 'plaza') => void;
  enter: (id: ModuleId) => void;
  exit: () => void;
  focusSector: (id: string) => void;
  /** Interior: ir para um andar (0 = térreo). */
  setFloor: (n: number) => void;
  /** Salas dos andares do prédio aberto (índice = posição na lista). */
  zones: () => Array<{ level: number; key: string; sector: string | null }>;
  focusZone: (i: number) => void;
  /**
   * Andar de elevador até o andar `n` (com cabine e portas), no elevador `lift` (sem ele, no do
   * sentido da viagem: o que sobe ou o que desce).
   */
  rideTo: (n: number, lift?: number) => void;
  /** Tocar a tecla/peça `i` do instrumento aberto (piano: PIANO_KEYS; bateria: DRUM_PADS; violão: guitarStrum). */
  play: (i: number) => void;
  /** Parou de tocar (painel do instrumento fechado): a vista volta ao normal. */
  closeInstrument: () => void;
  /** Cofre de Finanças do prédio aberto: mostra o estado do bloqueio (`instant` = sem animação nem som). */
  setVault: (s: VaultState, instant?: boolean) => void;
  setData: (id: ModuleId, data: unknown) => void;
  project: () => Array<{ id: ModuleId; x: number; y: number; visible: boolean }>;
  dispose: () => void;
}

const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 1024, env: false, fpsCap: 30 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, env: true, fpsCap: 60 },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, env: true, fpsCap: 60 },
} as const;

const HOME = { cam: new THREE.Vector3(52, 42, 84), target: new THREE.Vector3(0, 4, -14) };

export function createEngine(canvas: HTMLCanvasElement, opts: EngineOpts): Engine {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const kit = new Kit();
  const outside = new THREE.Scene();
  const built0 = performance.now();
  const world = createWorld(kit);
  const buildMs = performance.now() - built0;
  outside.add(world.root);
  outside.fog = new THREE.Fog('#DCEFF8', 320, 950);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(48, 1, 0.3, 2800);
  // Diagnóstico (só com ?debug na URL): medir o peso da cena no navegador.
  if (/[?&]debug/.test(location.search)) {
    const tri = (o: THREE.Object3D) => {
      let t = 0;
      let m = 0;
      o.traverse((x) => {
        const mesh = x as THREE.Mesh;
        if (!mesh.isMesh) return;
        m++;
        const g = mesh.geometry;
        const n = (g.index ? g.index.count : g.attributes.position!.count) / 3;
        t += n * ((x as THREE.InstancedMesh).isInstancedMesh ? (x as THREE.InstancedMesh).count : 1);
      });
      return { t: Math.round(t), m };
    };
    const parts = world.root.children.map((c, i) => ({ i, k: String(c.userData.building ?? (c.name || c.type)), kids: c.children.length, ...tri(c) })).sort((a, b) => b.t - a.t);
    // Obstáculos em cima dos caminhos (o que atrapalha andar), agrupados a cada 3 m.
    const blockers = new Map<string, { x: number; z: number }>();
    for (const o of world.obstacles) {
      if (o.h - heightAt(o.x, o.z) < 0.35) continue;
      if (onPath(o.x, o.z, o.r * 0.5 - 0.4)) blockers.set(`${Math.round(o.x / 3)},${Math.round(o.z / 3)}`, { x: Math.round(o.x), z: Math.round(o.z) });
    }
    document.documentElement.dataset.blockers = JSON.stringify([...blockers.values()]);
    window.setInterval(() => {
      document.documentElement.dataset.park = JSON.stringify({ buildMs: Math.round(buildMs), calls: renderer.info.render.calls, frameTris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, total: tri(world.root), parts: parts.slice(0, 40) });
    }, 2000);
  }
  const rig = createCameraRig(camera, canvas, opts.reduceMotion, opts.onPosture);
  const outsideWorld = () => rig.setWorld({ ground: heightAt, obstacles: world.obstacles, limit: { x: 0, z: 0, r: PARK_RADIUS + 30 }, ceiling: Infinity, minDistance: 4, maxDistance: 520, blocked: (x, z) => inWater(x, z, 0.8) });
  outsideWorld();

  /* ---------- Pessoas: avatar (terceira pessoa) e moradores ---------- */
  const avatar = createCrowd(kit, 1);
  // Lá fora o chão tem relevo: os pés acompanham a encosta (dentro dos prédios o piso é plano).
  avatar.ground = heightAt;
  outside.add(avatar.group);
  const crowd = createCrowd(kit, 40);
  crowd.ground = heightAt;
  outside.add(crowd.group);
  const town = createTown(world.seats);
  // Gente de passagem (bicicleta, skate, corrida, jardineiro, vendedores, crianças) e bichos.
  const extras = createExtras();
  const animals = createAnimals(kit);
  outside.add(animals.group);
  const doors = entryDoors(kit, world.buildings, (id) => !!opts.interiors[id]);
  outside.add(doors.group);
  town.setDoors(new Map([...doors.portals].map(([id, p]) => [id, { x: p.x + Math.sin(p.facing) * 0.4, z: p.z + Math.cos(p.facing) * 0.4 }])));
  // Moradores dentro do prédio aberto (estudando, trabalhando, treinando...).
  const indoorCrowd = createCrowd(kit, 40);
  // Bolas dos jogos (tênis amarela, futebol branca).
  const ballMeshes = { tennis: new THREE.InstancedMesh(kit.own(new THREE.SphereGeometry(0.07, 10, 8)), kit.mat('#D9F23A', { rough: 0.7 }), 2), football: new THREE.InstancedMesh(kit.own(new THREE.SphereGeometry(0.11, 14, 10)), kit.mat('#F8FAFC', { rough: 0.5 }), 2) };
  outside.add(ballMeshes.tennis, ballMeshes.football);
  const ballM = new THREE.Matrix4();
  let avatarWaveUntil = 0;
  let crowdMax = 16;
  let season: Conditions['season'] = 'summer';
  const conditions = (): Conditions => ({ hour: shownHour, day: Math.floor(Date.now() / 86400000), rain: weather.rain, fog: weather.fog, wind: weather.wind, season });
  let settled = false;
  const bodyFigure = () => {
    const b = rig.body();
    const sitting = rig.posture() === 'sit';
    avatar.set([{ x: b.pos.x, y: b.pos.y, z: b.pos.z, yaw: sitting ? b.yaw + Math.PI : b.heading, pose: sitting ? 'sit' : b.running && b.speed > 3 ? 'run' : b.speed > 0.2 ? 'walk' : performance.now() < avatarWaveUntil ? 'wave' : 'stand', expr: performance.now() < avatarWaveUntil - 1300 ? 'talk' : performance.now() < avatarWaveUntil ? 'smile' : Math.floor(performance.now() / 7000) % 5 === 0 ? 'smile' : 'neutral', phase: b.speed > 0.2 ? walkPhase : performance.now() / 500, stride: Math.min(1, b.speed / 2.5), ...AVATAR_LOOK, scale: 1 }]);
  };
  let walkPhase = 0;
  let lastStep = 0;
  /** Altura dos pés no último passo (o degrau soa mais agudo subindo). */
  let lastStepY = 0;
  /** Quanto de árvore há em volta de quem ouve (0 a 1), recalculado de vez em quando. */
  let treeNear = 0.4;
  let treeFrame = 0;

  // Interior aberto (um por vez).
  let inside: { id: ModuleId; kit: Kit; scene: InteriorScene } | null = null;
  const dataCache = new Map<ModuleId, unknown>();

  camera.position.copy(HOME.cam);
  rig.controls.target.copy(HOME.target);
  if (!opts.reduceMotion && !opts.restore) {
    // Abertura: a câmera desce do alto sobre o parque e para diante da praça.
    const intro = new THREE.CatmullRomCurve3([new THREE.Vector3(-220, 190, 260), new THREE.Vector3(-90, 110, 170), new THREE.Vector3(20, 60, 110), HOME.cam.clone()]);
    camera.position.copy(intro.getPoint(0));
    rig.controls.target.set(0, 0, 0);
    rig.glideTo(intro, HOME.target.clone(), 5600);
  }
  rig.setMode(opts.startMode);
  // Volta da interface 2D: mesmo lugar, mesma direção, mesmo modo de câmera e, se for o caso, dentro do mesmo prédio.
  const restoreFrom = (s: ParkSnapshot) => {
    const apply = () => {
      if (s.level) setFloor(s.level, false);
      camera.position.set(...s.cam);
      rig.controls.target.set(...s.target);
      rig.setMode(s.mode);
      if (s.mode !== 'orbit') rig.place(s.body.x, s.body.z, s.body.yaw);
      camera.lookAt(rig.controls.target);
    };
    if (s.inside && opts.interiors[s.inside]) {
      if (s.mode !== 'orbit') rig.setMode('orbit');
      // O interior é criado mais abaixo; espera o primeiro quadro.
      requestAnimationFrame(() => enter(s.inside!, apply));
    } else apply();
  };
  if (opts.restore) restoreFrom(opts.restore);

  /* ---------- Toque: escolher prédio (fora) ou setor (dentro) ---------- */
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY, t: performance.now() });
  /** Pode ser tocado: visível (com os pais), ou caixa de ação invisível ligada (userData.hitbox = true). */
  const tappable = (o: THREE.Object3D): boolean => {
    if (o.userData.hitbox !== undefined) return o.userData.hitbox === true;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  /** O objeto de ação `id` no nível em que se está, se ele faz algo agora (seção 28). */
  const spotOf = (id: string): ActionSpot | null => inside?.scene.actions?.find((s) => s.id === id && s.active && s.level === level) ?? null;
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    // Toque curto escolhe; toque longo (0,45 a 1,5 s, sem arrastar) só vale num objeto de ação: abre a estação.
    const held = performance.now() - down.t;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || held > 1500) return;
    const long = held > 450;
    if (long && !inside) return;
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    if (!inside) {
      const hit = ray.intersectObjects(world.pickables, true)[0];
      opts.onPick((hit?.object.userData.building as ModuleId | undefined) ?? null);
    } else {
      const hit = ray.intersectObjects(inside.scene.pickables, true).find((h) => tappable(h.object));
      // Objeto de ação: a ação real (ou nada, na parede do dia sem item naquela hora).
      const act = hit?.object.userData.action as string | undefined;
      if (act !== undefined) {
        const sp = act ? spotOf(act) : null;
        if (sp) opts.onAction({ building: inside.id, id: sp.id, long });
        return;
      }
      if (long) return;
      const zone = hit?.object.userData.zone as number | undefined;
      if (zone !== undefined) return focusZone(zone);
      const id = (hit?.object.userData.sector as string | undefined) ?? null;
      if (id) focusSector(id);
      opts.onSector(id);
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  /* ---------- Troca de cena sem tela preta (seção 33) ---------- */
  // A última imagem (a porta vista de perto) fica por cima e se dissolve sobre a cena nova: a
  // passagem do parque para o prédio (e de volta) é contínua, sem escurecer a tela.
  const fadeSwap = (swap: () => void) => {
    if (opts.reduceMotion) return swap();
    let snap: HTMLCanvasElement | null = null;
    try {
      renderer.render(inside ? inside.scene.scene : outside, camera);
      snap = document.createElement('canvas');
      snap.width = canvas.width;
      snap.height = canvas.height;
      snap.getContext('2d')?.drawImage(canvas, 0, 0);
      Object.assign(snap.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', opacity: '1', transition: 'opacity 450ms ease' });
      canvas.after(snap);
    } catch {
      snap = null;
    }
    swap();
    const s = snap;
    if (!s) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        s.style.opacity = '0';
        window.setTimeout(() => s.remove(), 500);
      }),
    );
  };

  const fit = (v: { cam: THREE.Vector3; target: THREE.Vector3 }) => {
    // Tela em pé (iPhone) mostra menos na largura: a câmera recua para caber.
    const k = camera.aspect < 0.9 ? 1 + (0.9 - camera.aspect) * 0.9 : 1;
    const cam = v.target.clone().add(v.cam.clone().sub(v.target).multiplyScalar(k));
    // Dentro do prédio: se entre o alvo e a câmera houver laje, galeria ou mezanino (opacos), a
    // câmera fica logo abaixo dela — senão a vista mostra o piso da galeria e esconde o térreo.
    if (inside) {
      const dir = cam.clone().sub(v.target);
      const len = dir.length();
      if (len > 0.5) {
        fitRay.set(v.target, dir.normalize());
        fitRay.far = len;
        const hit = fitRay.intersectObjects(inside.scene.scene.children, true).find((h) => {
          if (h.object.userData.outdoorOnly) return false;
          for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (o.userData.outdoorOnly || !o.visible) return false;
          const m = (h.object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          return !!m && !(Array.isArray(m) ? m.some((x) => x.transparent) : m.transparent);
        });
        if (hit) return { cam: v.target.clone().add(dir.multiplyScalar(Math.max(1, hit.distance - 0.6))), target: v.target };
      }
    }
    return { cam, target: v.target };
  };
  const fitRay = new THREE.Raycaster();

  const focusSector = (id: string) => {
    if (!inside) return;
    const v = fit(inside.scene.view(id));
    rig.glideTo(v.cam, v.target, 1100);
  };

  /* ---------- Andares dos interiores ---------- */
  let level = 0;
  /** O mundo de quem anda no nível `L`; `feet` = altura dos pés (a do corpo, salvo na conferência 'stairs:reach'). */
  const levelWorld = (L: number, feet: () => number = () => rig.body().pos.y): CameraWorld => {
    const sc = inside!.scene;
    const fl = sc.floors;
    const lv = fl?.levels[L];
    // Térreo: anda-se dentro da planta do prédio (massing.ts), não num círculo; a câmera da 3ª
    // pessoa não atravessa a fachada. Nos andares, cada planta diz onde não se pisa (vazios,
    // núcleo, fachada fora das portas, borda do terraço).
    const base: CameraWorld =
      !lv || L === 0
        ? { ground: () => 0, obstacles: sc.obstacles, limit: { x: 0, z: 0, r: sc.room.radius + 1 }, ceiling: lv?.ceiling ?? sc.room.height, minDistance: 1.5, maxDistance: sc.room.radius * 1.7, blocked: sc.room.blocked, wall: sc.room.wallAt }
        : { ground: () => lv.y, obstacles: lv.obstacles, limit: { x: 0, z: 0, r: lv.walk }, ceiling: lv.ceiling, minDistance: 1.5, maxDistance: sc.room.radius * 1.7, blocked: lv.blocked, wall: lv.wallAt };
    const sw = fl?.walk;
    if (!sw || !lv) return base;
    // Escada onde se anda (seção 30, reach.ts): dentro dela, o piso é o do degrau ou do patamar
    // mais perto dos pés e o guarda-corpo segura; fora dela, o piso do nível, e dela só se sai pelo
    // patamar do nível em que se está.
    return walkWorld(base, sw, L, lv.y, feet);
  };
  /** Vai ao nível `L` (com `move`, na chegada do elevador; `ax` = x da porta por onde se sai). */
  const setFloor = (L: number, move = true, ax?: number) => {
    const levels = inside?.scene.floors?.levels;
    if (!inside || !levels || L < 0 || L >= levels.length) return;
    level = L;
    rig.setWorld(levelWorld(L));
    opts.onFloors(levels.length, L);
    if (!move) return;
    const lv = levels[L]!;
    // Chega pelo elevador, nos fundos, olhando para dentro do prédio.
    if (rig.mode() !== 'orbit') rig.place(ax ?? lv.arrive.x, lv.arrive.z, Math.PI);
    else rig.glideTo(new THREE.Vector3(lv.arrive.x, lv.y + 3.3, lv.arrive.z - 0.8), new THREE.Vector3(lv.arrive.x, lv.y + 0.6, lv.arrive.z + 9), 900);
  };
  /* ---------- Elevador: entrar, fechar portas, subir/descer, abrir, sair ---------- */
  type Ride = { from: number; to: number; t0: number; start: THREE.Vector3; startLook: THREE.Vector3; mode: CamMode; dinged: boolean; lift: number };
  let ride: Ride | null = null;
  const RIDE = { walkIn: 1800, close: 700, open: 700, walkOut: 900, perFloor: 1700 };
  // Vetores de trabalho do elevador e da escada (nada é alocado a cada quadro).
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  /** Folhas de uma porta de correr: 0 = fechada, 1 = aberta. Pavimento: x no prédio; cabine: x na cabine. */
  const setPair = (lf: Lift, pair: readonly [THREE.Object3D, THREE.Object3D], open: number, hall: boolean) => {
    const off = lf.shut + open * lf.slide;
    const base = hall ? lf.x : 0;
    pair[0].position.x = base - off;
    pair[1].position.x = base + off;
  };
  /** Portas da cabine e as do pavimento (quando há) juntas. */
  const liftDoors = (lf: Lift, open: number, hall: readonly [THREE.Object3D, THREE.Object3D] | undefined) => {
    setPair(lf, lf.doors, open, false);
    if (hall) setPair(lf, hall, open, true);
  };
  /** Indicadores de pavimento do elevador: acende o nível `n`. */
  const showFloor = (lf: Lift, n: number, count: number) => {
    for (const m of lf.marks) m.position.x = markX(n, count);
    // O painel da cabine mostra só os andares do sentido dela, a partir de onde ela está.
    showButtons(lf, n);
  };
  const rideTo = (to: number, lift?: number) => {
    const fl = inside?.scene.floors;
    if (!inside || !fl || ride || climb || to === level || to < 0 || to >= fl.levels.length || !fl.lifts.length) return;
    // O elevador pedido ou o do sentido da viagem (o da esquerda só sobe, o da direita só desce);
    // um elevador que não vai para lá (ou não para aqui) não é chamado.
    const up = to > level;
    const count = fl.levels.length;
    const fits = (l: Lift) => liftServes(l.dir, level, count) && (l.dir === 'both' || l.dir === (up ? 'up' : 'down'));
    const li = lift !== undefined ? lift : fl.lifts.findIndex(fits);
    const chosen = fl.lifts[li];
    if (!chosen || !fits(chosen)) return;
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    ride = { from: level, to, t0: performance.now(), start: camera.position.clone(), startLook: camera.position.clone().add(look.multiplyScalar(5)), mode: rig.mode(), dinged: false, lift: li };
    // "Ding" da chegada da cabine.
    audio?.note(76, 'bell');
    rig.setMove(0, 0);
    // Todas as portas dos pavimentos fechadas; a cabine escolhida vem ao andar de quem chamou.
    for (const l of fl.lifts) for (const pair of l.hall) setPair(l, pair, 0, true);
    const lf = fl.lifts[li]!;
    lf.cabin.position.y = fl.levels[level]!.y;
    showFloor(lf, level, fl.levels.length);
    opts.onRiding(true);
  };
  const ease2 = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  /**
   * Subida (ou descida) pela escada: do pé dela, segue o caminho da própria escada (lances, patamares,
   * a volta do U, do L, da curva ou do caracol do núcleo), um passo por vez, até o patamar de chegada
   * no outro nível.
   */
  type ClimbRun = { c: Climb; t0: number; dur: number; len: Float32Array; total: number; start: THREE.Vector3; steps: number; up: boolean };
  let climb: ClimbRun | null = null;
  const EYE_Y = 1.62;
  /** Velocidade ao longo do caminho (m/s) e o tempo para chegar ao pé da escada. */
  const CLIMB = { speed: 2.8, lead: 450, stride: 0.6 };
  /** Ponto (pés) a `s` m do começo do caminho, em `out`. */
  const pathAt = (path: Float32Array, len: Float32Array, s: number, out: THREE.Vector3) => {
    const n = len.length;
    if (n < 2) return out.set(path[0] ?? 0, path[1] ?? 0, path[2] ?? 0);
    let i = 1;
    while (i < n - 1 && (len[i] ?? 0) < s) i++;
    const a = len[i - 1] ?? 0;
    const b = len[i] ?? a;
    const t = b > a ? Math.min(1, Math.max(0, (s - a) / (b - a))) : 1;
    const j = (i - 1) * 3;
    const k = i * 3;
    const x0 = path[j] ?? 0;
    const y0 = path[j + 1] ?? 0;
    const z0 = path[j + 2] ?? 0;
    return out.set(x0 + ((path[k] ?? x0) - x0) * t, y0 + ((path[k + 1] ?? y0) - y0) * t, z0 + ((path[k + 2] ?? z0) - z0) * t);
  };
  /** A subida ou descida que começa nesta escada (a do nível dela com o pé mais perto). */
  const climbFor = (fl: Floors, th: Thing): Climb | null => {
    let best: Climb | null = null;
    let bd = Infinity;
    for (const c of fl.climbs) {
      if (c.from !== th.level) continue;
      const d = Math.hypot(c.x - th.x, c.z - th.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };
  /**
   * Andando (1ª ou 3ª pessoa): segue a pé o caminho da escada, ponto a ponto, como quem anda (a
   * altura vem dos degraus e o nível troca sozinho); mexer o controle devolve o comando.
   */
  const guideAlong = (path: Float32Array) => {
    const n = Math.floor(path.length / 3);
    let i = 0;
    const next = () => {
      if (i >= n || !inside) return;
      const x = path[i * 3] ?? 0;
      const z = path[i * 3 + 2] ?? 0;
      i++;
      rig.autoWalk(x, z, 2.0, next, true);
    };
    next();
  };
  const startClimb = (c: Climb) => {
    const n = c.path.length / 3;
    const len = new Float32Array(Math.max(1, n));
    for (let i = 1; i < n; i++) {
      const p = c.path;
      len[i] = (len[i - 1] ?? 0) + Math.hypot((p[i * 3] ?? 0) - (p[i * 3 - 3] ?? 0), (p[i * 3 + 1] ?? 0) - (p[i * 3 - 2] ?? 0), (p[i * 3 + 2] ?? 0) - (p[i * 3 - 1] ?? 0));
    }
    const total = len[n - 1] ?? 0;
    rig.setMove(0, 0);
    climb = { c, t0: performance.now(), dur: CLIMB.lead + (total / CLIMB.speed) * 1000, len, total, start: camera.position.clone(), steps: 0, up: c.to > c.from };
    opts.onRiding(true);
  };
  /** Para onde se olha na escada: 1,6 m adiante no caminho (no fim, adiante na direção do último trecho). */
  const lookAhead = (cl: ClimbRun, s: number) => {
    pathAt(cl.c.path, cl.len, Math.min(cl.total, s + 1.6), vB);
    if (s + 1.6 > cl.total) {
      const p = cl.c.path;
      const n = p.length / 3;
      const dx = (p[(n - 1) * 3] ?? 0) - (p[(n - 2) * 3] ?? 0);
      const dz = (p[(n - 1) * 3 + 2] ?? 0) - (p[(n - 2) * 3 + 2] ?? 0);
      const l = Math.hypot(dx, dz) || 1;
      const extra = s + 1.6 - cl.total;
      vB.x += (dx / l) * extra;
      vB.z += (dz / l) * extra;
    }
    vB.y += EYE_Y + (cl.up ? 0.15 : -0.25);
  };
  const stepClimb = (now: number) => {
    const fl = inside?.scene.floors;
    if (!climb || !fl) return false;
    const cl = climb;
    const el = now - cl.t0;
    if (el < CLIMB.lead) {
      // Até o pé da escada, virando para ela.
      pathAt(cl.c.path, cl.len, 0, vA);
      vA.y += EYE_Y;
      camera.position.lerpVectors(cl.start, vA, ease2(el / CLIMB.lead));
      lookAhead(cl, 0);
      camera.lookAt(vB);
      return true;
    }
    const k = Math.min(1, (el - CLIMB.lead) / Math.max(1, cl.dur - CLIMB.lead));
    const s = cl.total * k;
    pathAt(cl.c.path, cl.len, s, vA);
    // Um passo a cada 0,6 m: o balanço do passo e o som da pisada.
    const step = Math.floor(s / CLIMB.stride);
    if (step > cl.steps) {
      cl.steps = step;
      audio?.note(cl.up ? 50 + (step % 2) * 2 : 48, 'tom');
    }
    camera.position.set(vA.x, vA.y + EYE_Y + Math.abs(Math.sin((s / CLIMB.stride) * Math.PI)) * 0.04, vA.z);
    lookAhead(cl, s);
    camera.lookAt(vB);
    if (k < 1) return true;
    // Chegou: no patamar do outro nível, olhando para onde vinha andando.
    climb = null;
    opts.onRiding(false);
    const p = cl.c.path;
    const n = p.length / 3;
    const ex = p[(n - 1) * 3] ?? 0;
    const ez = p[(n - 1) * 3 + 2] ?? 0;
    vC.set(ex - (p[(n - 2) * 3] ?? ex), 0, ez - (p[(n - 2) * 3 + 2] ?? ez));
    setFloor(cl.c.to, false);
    rig.place(ex, ez, Math.atan2(-vC.x, -vC.z));
    return false;
  };
  /** Um quadro da viagem; devolve true enquanto a câmera é do elevador. */
  const stepRide = (now: number) => {
    const fl = inside?.scene.floors;
    if (!ride || !fl) return false;
    const lf = fl.lifts[ride.lift] ?? fl.lifts[0];
    if (!lf) {
      ride = null;
      opts.onRiding(false);
      return false;
    }
    const count = fl.levels.length;
    const y0 = fl.levels[ride.from]!.y;
    const y1 = fl.levels[ride.to]!.y;
    const move = RIDE.perFloor * Math.abs(ride.to - ride.from);
    const t = now - ride.t0;
    const hallFrom = lf.hall[ride.from];
    const hallTo = lf.hall[ride.to];
    // Dentro da cabine, perto do fundo, de frente para as portas.
    const cx = lf.x;
    const cz = lf.z - 0.25;
    let p1 = RIDE.walkIn;
    if (t < p1) {
      // Primeiro até a frente da porta, depois para dentro, virando de frente para a saída.
      const k = t / p1;
      vB.set(cx, y0 + 1.6, lf.z + 2.6);
      if (k < 0.6) {
        camera.position.lerpVectors(ride.start, vB, ease2(k / 0.6));
        vC.set(cx, y0 + 1.4, lf.z - 2);
        camera.lookAt(vA.lerpVectors(ride.startLook, vC, ease2(k / 0.6)));
      } else {
        const q2 = (k - 0.6) / 0.4;
        vA.set(cx, y0 + 1.6, cz);
        camera.position.lerpVectors(vB, vA, ease2(q2));
        // Vira de frente para as portas passando pelo lado (sem girar no próprio eixo de uma vez).
        vB.set(cx, y0 + 1.4, lf.z - 2);
        vC.set(cx + 4, y0 + 1.4, lf.z);
        if (q2 < 0.5) camera.lookAt(vA.lerpVectors(vB, vC, ease2(q2 * 2)));
        else {
          vB.set(cx, y0 + 1.5, lf.z + 8);
          camera.lookAt(vA.lerpVectors(vC, vB, ease2(q2 * 2 - 1)));
        }
      }
      liftDoors(lf, 1, hallFrom);
      return true;
    }
    let p0 = p1;
    p1 += RIDE.close;
    if (t < p1) {
      liftDoors(lf, 1 - ease2((t - p0) / RIDE.close), hallFrom);
      return true;
    }
    p0 = p1;
    p1 += move;
    if (t < p1) {
      const y = y0 + (y1 - y0) * ease2((t - p0) / move);
      lf.cabin.position.y = y;
      camera.position.set(cx, y + 1.6, cz);
      camera.lookAt(vA.set(cx, y + 1.5, lf.z + 8));
      liftDoors(lf, 0, undefined);
      // Indicador de pavimento: o andar mais perto da cabine.
      let near = 0;
      for (let i = 1; i < count; i++) if (Math.abs(fl.levels[i]!.y - y) < Math.abs(fl.levels[near]!.y - y)) near = i;
      showFloor(lf, near, count);
      return true;
    }
    p0 = p1;
    p1 += RIDE.open;
    lf.cabin.position.y = y1;
    showFloor(lf, ride.to, count);
    camera.position.set(cx, y1 + 1.6, cz);
    if (t < p1) {
      if (!ride.dinged) {
        // Chegou no andar: dois tons ("ding-dong") ao abrir.
        ride.dinged = true;
        audio?.note(79, 'bell');
        audio?.note(74, 'bell', 0.25);
      }
      camera.lookAt(vA.set(cx, y1 + 1.5, lf.z + 8));
      liftDoors(lf, ease2((t - p0) / RIDE.open), hallTo);
      return true;
    }
    // Chegou: sai da cabine para o andar, no modo de câmera de antes.
    liftDoors(lf, 1, hallTo);
    const to = ride.to;
    const mode = ride.mode;
    ride = null;
    // Sai pela porta da cabine em que veio (a do que sobe à esquerda, a do que desce à direita).
    setFloor(to, true, lf.x);
    if (mode !== 'orbit') rig.setMode(mode);
    // A dica é refeita já no próximo quadro, com o nível de chegada (no térreo, o elevador que
    // desce "não para aqui"), em vez de esperar a volta normal.
    hintFrame = 7;
    opts.onRiding(false);
    return false;
  };

  const focusZone = (i: number) => {
    const z = inside?.scene.floors?.zones[i];
    if (!z) return;
    if (z.level !== level) setFloor(z.level, false);
    const lv = inside!.scene.floors!.levels[z.level]!;
    // Em frente à porta da sala, olhando para dentro dela. (z.ex, z.ez) fica 0,9 m à frente da
    // parede da porta; a placa com o nome está a 0,25 m dela, a 2,6 m de altura, e o quadro acima.
    const dx = z.ex - z.x;
    const dz = z.ez - z.z;
    const r = Math.hypot(dx, dz) || 1;
    const ux = dx / r;
    const uz = dz / r;
    if (rig.mode() !== 'orbit') {
      // Andando: um passo atrás da frente da porta (se der para pisar ali), para a sala e a placa
      // aparecerem inteiras em vez de a placa encher a tela.
      const bx = z.ex + ux * 1.2;
      const bz = z.ez + uz * 1.2;
      const free = !lv.blocked(bx, bz) && !lv.obstacles.some((o) => Math.hypot(o.x - bx, o.z - bz) < o.r + 0.35);
      rig.place(free ? bx : z.ex, free ? bz : z.ez, Math.atan2(dx, dz));
    } else {
      // Câmera livre: a uns 4 m da porta (a distância conta da frente da sala, não do centro: salas
      // fundas punham a câmera colada na placa), abaixo da placa e do quadro, olhando para dentro;
      // parede no caminho (sala da frente, corredor estreito) segura a câmera antes dela (fit).
      const front = r - 0.9;
      vA.set(z.x + ux * (front + 0.3), lv.y + 1.6, z.z + uz * (front + 0.3));
      const v = fit({ cam: new THREE.Vector3(z.x + ux * (front + 4.2), lv.y + 2.0, z.z + uz * (front + 4.2)), target: vA });
      rig.glideTo(v.cam, new THREE.Vector3(z.x, lv.y + 1.5, z.z), 1000);
    }
    opts.onZone({ key: z.key, sector: z.sector });
  };

  const disposeInterior = () => {
    if (!inside) return;
    hideSky();
    if (instrument) opts.onInstrument(null);
    instrument = null;
    // Pessoas e avatar são do parque: saem da cena antes de liberar o interior.
    inside.scene.scene.remove(avatar.group, indoorCrowd.group);
    const seen = new Set<THREE.BufferGeometry>();
    inside.scene.scene.traverse((o) => {
      const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (g && !seen.has(g)) {
        seen.add(g);
        g.dispose();
      }
    });
    inside.kit.dispose();
    inside = null;
  };

  const enter = (id: ModuleId, instant?: () => void) => {
    const factory = opts.interiors[id];
    const b = world.buildings.get(id);
    if (!factory || !b || inside) return;
    opts.onPick(null);
    const front = new THREE.Vector3(b.entrance.x, heightAt(b.entrance.x, b.entrance.z) + 2.4, b.entrance.z);
    const door = new THREE.Vector3(b.def.x, front.y + 1, b.def.z);
    const swap = () => {
      const ikit = new Kit();
      const scene = factory(ikit);
      // Objetos funcionais do próprio térreo (o cofre de Finanças) entram na lista dos andares.
      const own = scene.scene.userData.things as Thing[] | undefined;
      if (own?.length && scene.floors) scene.floors.things.push(...own);
      // Bancos, sofás e cadeiras do térreo (cada interior anota em userData.seats): dá para sentar.
      const ownSeats = scene.scene.userData.seats as Seat[] | undefined;
      if (ownSeats?.length && scene.floors) scene.floors.seats.push(...ownSeats);
      // Colisão do térreo pelo desenho (móveis, balcões, paredes), além dos obstáculos do próprio interior.
      // Dentro da escada quem decide onde se pisa é ela (stairs.ts): os degraus não são parede.
      scene.obstacles.push(...footprint(scene.scene, () => 0, 0.3, 1.45, 0.5).filter((o) => !scene.floors?.walk?.zone(o.x, o.z, 0)));
      ikit.glowing.forEach((m) => (m.emissiveIntensity = 1));
      scene.scene.environment = QUALITY[quality].env ? envTex : null;
      scene.scene.environmentIntensity = 0.55;
      scene.setDetail(quality);
      const cached = dataCache.get(id);
      if (cached !== undefined) scene.setData(cached);
      inside = { id, kit: ikit, scene };
      scene.scene.traverse((o) => o.userData.outdoorOnly && (o.visible = false));
      level = 0;
      rig.setWorld(levelWorld(0));
      opts.onFloors(scene.floors?.levels.length ?? 1, 0);
      const v = fit(scene.view('entry'));
      camera.position.copy(v.cam);
      rig.controls.target.copy(v.target);
      scene.scene.add(avatar.group, indoorCrowd.group);
      avatar.ground = undefined;
      if (rig.mode() !== 'orbit') {
        if (instant) rig.place(v.cam.x, v.cam.z, Math.atan2(-(v.target.x - v.cam.x), -(v.target.z - v.cam.z)));
        else {
          // Acabou de passar pela porta (a entrada fica na frente, +z): aparece logo dentro dela,
          // de costas para a porta, e dá alguns passos para dentro do saguão.
          const edge = scene.room.front - 1.2;
          rig.place(0, edge - 0.4, 0);
          rig.autoWalk(0, edge - 3.4, 1.9, () => undefined);
        }
      }
      recompile(scene.scene);
      opts.onInside(id);
      doors.hold(id, false);
      instant?.();
    };
    if (instant) return swap();
    const portal = doors.portals.get(id);
    if (!portal) return rig.glideTo(front, door, 1500, () => fadeSwap(swap));
    // Entrada de verdade: a porta abre (ou o portão do jardim), anda-se até o vão e entra.
    doors.hold(id, true);
    const ox = Math.sin(portal.facing);
    const oz = Math.cos(portal.facing);
    if (rig.mode() !== 'orbit') return rig.autoWalk(portal.x - ox * 0.6, portal.z - oz * 0.6, 2.0, () => fadeSwap(swap));
    const look = new THREE.Vector3(portal.x, portal.y + 1.4, portal.z);
    rig.glideTo(new THREE.Vector3(portal.x + ox * 7, portal.y + 2.4, portal.z + oz * 7), look, 1400, () =>
      rig.glideTo(new THREE.Vector3(portal.x + ox * 0.3, portal.y + 1.6, portal.z + oz * 0.3), new THREE.Vector3(portal.x - ox * 4, portal.y + 1.5, portal.z - oz * 4), 1200, () => fadeSwap(swap)),
    );
  };

  const exit = () => {
    if (!inside) return;
    const id = inside.id;
    opts.onSector(null);
    fadeSwap(() => {
      disposeInterior();
      level = 0;
      opts.onFloors(1, 0);
      outsideWorld();
      const b = world.buildings.get(id)!;
      const out = new THREE.Vector3(b.entrance.x - b.def.x, 0, b.entrance.z - b.def.z).normalize();
      const center = new THREE.Vector3(b.def.x, heightAt(b.def.x, b.def.z) + 4, b.def.z);
      camera.position.copy(center).addScaledVector(out, b.def.radius * 1.5).setY(center.y + 12);
      rig.controls.target.copy(center);
      outside.add(avatar.group);
      avatar.ground = heightAt;
      const portal = doors.portals.get(id);
      if (rig.mode() !== 'orbit' && portal) {
        // Sai pela porta aberta e anda alguns passos para fora; a porta fecha atrás.
        const ox = Math.sin(portal.facing);
        const oz = Math.cos(portal.facing);
        doors.openNow(id);
        doors.hold(id, true);
        rig.place(portal.x + ox * 0.7, portal.z + oz * 0.7, Math.atan2(-ox, -oz));
        rig.autoWalk(portal.x + ox * 4.5, portal.z + oz * 4.5, 2.0, () => doors.hold(id, false));
      } else if (rig.mode() !== 'orbit') rig.place(b.entrance.x + out.x * 3, b.entrance.z + out.z * 3, Math.atan2(-out.x, -out.z));
      opts.onInside(null);
    });
  };

  const flyTo = (id: ModuleId | 'plaza') => {
    if (inside) return;
    if (id === 'plaza') return rig.glideTo(HOME.cam, HOME.target, 1600);
    const b = world.buildings.get(id);
    if (!b) return;
    const out = new THREE.Vector3(b.entrance.x - b.def.x, 0, b.entrance.z - b.def.z).normalize();
    // Andando (1ª ou 3ª pessoa): aparece em frente à entrada, de frente para a porta.
    if (rig.mode() !== 'orbit') {
      const p = doors.portals.get(id);
      const fx = p ? p.x : b.entrance.x;
      const fz = p ? p.z : b.entrance.z;
      return fadeSwap(() => rig.place(fx + out.x * 6, fz + out.z * 6, Math.atan2(out.x, out.z)));
    }
    const y = heightAt(b.def.x, b.def.z);
    const target = new THREE.Vector3(b.def.x, y + Math.min(8, b.top * 0.3), b.def.z);
    const cam = target.clone().addScaledVector(out, b.def.radius * 1.9).setY(y + b.def.radius * 1.1);
    rig.glideTo(cam, target, 1600);
  };

  /* ---------- Interações: sentar, observar mirante, árvore, água ou alguém ---------- */
  const near2 = <T extends { x: number; z: number }>(list: T[], p: { x: number; z: number }, r: number): T | null => {
    let best: T | null = null;
    let bd = r;
    for (const o of list) {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  };
  const waterPoint = (p: { x: number; z: number }) => {
    const all = [{ x: LAKE.x, z: LAKE.z }, ...PONDS];
    return all.reduce((m, o) => (Math.hypot(o.x - p.x, o.z - p.z) < Math.hypot(m.x - p.x, m.z - p.z) ? o : m), all[0]!);
  };
  /** O elevador em frente de quem está no hall (o da porta mais perto), ou -1 longe dele. */
  const elevatorNear = (): number => {
    const fl = inside?.scene.floors;
    if (!fl?.levels[level] || !fl.lifts.length) return -1;
    const p = rig.body().pos;
    // No hall, na frente das portas do núcleo (o mesmo em todos os níveis, térreo incluído).
    const e = fl.elevator;
    if (Math.hypot(p.x - e.x, p.z - (e.z + 2.6)) >= 3.4) return -1;
    let li = 0;
    fl.lifts.forEach((l, i) => {
      if (Math.abs(l.x - p.x) < Math.abs(fl.lifts[li]!.x - p.x)) li = i;
    });
    return li;
  };
  /** Objeto funcional mais perto, neste andar. */
  const thingNear = (p: { x: number; z: number }): Thing | null => {
    const list = inside?.scene.floors?.things.filter((th) => th.level === level) ?? [];
    let best: Thing | null = null;
    let bd = Infinity;
    for (const th of list) {
      const d = Math.hypot(th.x - p.x, th.z - p.z);
      const r = th.kind === 'room' ? 1.4 : th.kind === 'stairs' ? 1.6 : 1.5;
      if (d < r && d < bd) {
        bd = d;
        best = th;
      }
    }
    return best;
  };
  let instrument: Thing | null = null;
  const thingCtx: ThingCtx = { note: (m, tb, delay) => audio?.note(m, tb, delay) };
  const floorSeat = (p: { x: number; z: number }) => {
    const sc = inside?.scene;
    if (!sc) return null;
    const lv = sc.floors?.levels[level];
    if (lv) return near2(sc.floors!.seats.filter((s) => Math.abs(s.y - 0.45 - lv.y) < 0.5), p, 1.8);
    // Prédio só de térreo (Habits): os bancos que o próprio interior anotou.
    const own = sc.scene.userData.seats as Seat[] | undefined;
    return level === 0 && own?.length ? near2(own, p, 1.8) : null;
  };
  /* ---------- Objetos de ação (seção 28): o que se olha ou o que está perto ---------- */
  const aimRay = new THREE.Raycaster();
  const aimHits: THREE.Intersection[] = [];
  const aimObjs: THREE.Object3D[] = [];
  const CENTER = new THREE.Vector2(0, 0);
  /**
   * Objeto de ação no centro da vista (até 3,5 m à frente do corpo; na 3ª pessoa conta a distância
   * da câmera) ou, sem isso, o mais perto de quem anda (dentro do raio de cada um), neste nível.
   */
  const actionAhead = (): ActionSpot | null => {
    const list = inside?.scene.actions;
    if (!list?.length) return null;
    const p = rig.body().pos;
    aimObjs.length = 0;
    for (const s of list) if (s.active && s.level === level) aimObjs.push(s.obj);
    if (!aimObjs.length) return null;
    aimRay.setFromCamera(CENTER, camera);
    aimRay.far = 3.5 + Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
    aimHits.length = 0;
    aimRay.intersectObjects(aimObjs, true, aimHits);
    for (const h of aimHits) {
      const id = h.object.userData.action as string | undefined;
      const sp = id ? spotOf(id) : null;
      if (sp) return sp;
    }
    let best: ActionSpot | null = null;
    let bd = Infinity;
    for (const s of list) {
      if (!s.active || s.level !== level || s.r <= 0) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < s.r && d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };
  const findHint = (): Hint | null => {
    // No elevador ou na escada guiada não há dica (e a do andar de partida não fica para a chegada).
    if (rig.posture() !== 'stand' || ride || climb) return null;
    const p = rig.body().pos;
    if (inside) {
      const act = actionAhead();
      if (act) return { kind: 'act', id: act.id };
      const th = thingNear(p);
      const li = th ? -1 : elevatorNear();
      const lf = li >= 0 ? inside.scene.floors?.lifts[li] : undefined;
      const count = inside.scene.floors?.levels.length ?? 1;
      // O que desce não para no térreo; o que sobe não para no último nível: lá a dica diz isso.
      if (lf && count > 1) return { kind: 'elevator', ...liftHint(lf.dir, level, count) };
      if (th) {
        const fl = inside.scene.floors!;
        if (th.kind === 'room') return { kind: 'use', what: 'room', key: fl.zones[th.zone!]?.key };
        if (th.kind === 'stairs') return { kind: 'use', what: 'stairs', up: (climbFor(fl, th)?.to ?? level + 1) > level };
        return { kind: 'use', what: th.kind };
      }
      return floorSeat(p) ? { kind: 'sit' } : null;
    }

    if (near2(world.seats, p, 2.4)) return { kind: 'sit' };
    if (near2(world.viewpoints, p, 4)) return { kind: 'view' };
    const who = town.nearest(p, 2.6);
    if (who) return { kind: 'person', name: who.name, activity: who.activity };
    if (inWater(p.x, p.z, 4)) return { kind: 'water' };
    if (near2(world.treeSpots, p, 4)) return { kind: 'tree' };
    return null;
  };
  // Diagnóstico (só com ?debug): comandos de teste disparados na página, como subir pela escada
  // do andar atual (document.dispatchEvent(new CustomEvent('park-debug', { detail: 'stairs' }))),
  // descer por ela ('stairs:down') ou chamar o elevador até um nível ('ride:<n>').
  const onDebug = (e: Event) => {
    const cmd = (e as CustomEvent<string>).detail;
    const fl0 = inside?.scene.floors;
    if ((cmd === 'stairs' || cmd === 'stairs:down') && fl0) {
      const want = cmd === 'stairs' ? 1 : -1;
      const th = fl0.things.find((o) => o.kind === 'stairs' && o.level === level && Math.sign((climbFor(fl0, o)?.to ?? level) - level) === want);
      document.documentElement.dataset.stairs = th ? `${level}>${level + want}` : 'none';
      if (th) {
        rig.place(th.x, th.z, th.face + Math.PI);
        useThing(th);
      }
    }
    if (typeof cmd === 'string' && cmd.startsWith('ride:')) rideTo(Number(cmd.slice(5)));
    if (cmd === 'stairs:check') document.documentElement.dataset.stairClash = String(inside?.scene.scene.userData.stairClash ?? 'none');
    // 'stairs:reach': em cada nível, a partir da chegada do elevador (e da entrada, no térreo), até
    // onde se chega a pé com a colisão de verdade (reach.ts): o pé e a chegada da escada, subir e
    // descer a pé e o que bloqueia o anel em volta dela. Resultado em data-stair-reach.
    if (cmd === 'stairs:reach' && inside && fl0) {
      const id = inside.id;
      const front = groundSpan(id).front - 1.5;
      const rep = stairReach({
        ys: fl0.ys,
        levels: fl0.levels.map((lv, L): ReachLevel => ({ y: lv.y, world: (feet: () => number) => levelWorld(L, feet), starts: L === 0 ? [[lv.arrive.x, lv.arrive.z], [0, front]] : [[lv.arrive.x, lv.arrive.z]] })),
        stair: stairOf(id),
        core: CIRCULATION[id].stair === 'core' ? { r: voidRadius(id), from: coreFrom(id) } : null,
      });
      document.documentElement.dataset.stairReach = JSON.stringify({ id, levels: reachSummary(rep) });
    }
    if (cmd === 'stairs:check') document.documentElement.dataset.stairClashAt = JSON.stringify(inside?.scene.scene.userData.stairClashAt ?? []);
    // E, em todos os níveis, os obstáculos de colisão no caminho até a escada (o pé, a chegada e a
    // frente do patamar): quem está ali seria empurrado (devia ser []). [nível, x, z, raio, altura].
    if (cmd === 'stairs:check' && inside && fl0) {
      const st = stairOf(inside.id);
      const way = fl0.levels.flatMap((lv, L) => (st ? stairApproach(st, L) : []).flatMap(([x, z]) => lv.obstacles.filter((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.3).map((o) => [L, +o.x.toFixed(2), +o.z.toFixed(2), +o.r.toFixed(2), +o.h.toFixed(1)])));
      document.documentElement.dataset.stairWay = JSON.stringify(way);
    }
    // 'use:<tipo>' (dentro de um prédio): vai até a coisa desse tipo no andar atual e usa (cofre, violão...).
    if (typeof cmd === 'string' && cmd.startsWith('use:') && inside) {
      const kind = cmd.slice(4);
      const it = inside.scene.floors?.things.find((o) => o.kind === kind && o.level === level);
      document.documentElement.dataset.use = it ? kind : 'none';
      if (it) {
        rig.place(it.x, it.z + 0.4, Math.PI);
        useThing(it);
      }
    }
    // 'probe:x,z': o que existe na vertical desse ponto (de cima para baixo), em data-probe.
    if (typeof cmd === 'string' && cmd.startsWith('probe:')) {
      const [px, pz] = cmd.slice(6).split(',').map(Number);
      const ray = new THREE.Raycaster(new THREE.Vector3(px, 80, pz), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(world.root, true).slice(0, 8).map((h) => {
        const m = (h.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
        let vis = true;
        for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible) vis = false;
        return { y: +h.point.y.toFixed(3), type: h.object.type, color: m?.color?.getHexString?.(), side: m?.side, vis, opacity: m?.opacity, depth: m?.depthTest };
      });
      document.documentElement.dataset.probe = JSON.stringify({ ground: heightAt(px!, pz!), hits });
    }
    // 'audit': varre o parque inteiro — cada árvore, arbusto e flor — olhando de cima para baixo no
    // ponto onde ela nasce; se antes do chão aparece outra coisa (piso de caminho, parede, banco,
    // lounge, marco...), anota. Resultado em data-audit (contagem e os primeiros casos).
    if (cmd === 'audit') {
      const veg = new Set<THREE.Object3D>();
      let terrainMesh: THREE.Object3D | null = null;
      world.root.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) veg.add(o);
        const idx = ((o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined)?.index;
        if ((o as THREE.Mesh).isMesh && idx && idx.count === TERRAIN.seg * TERRAIN.seg * 6) terrainMesh = o;
      });
      const ray = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const found: Array<{ kind: string; x: number; z: number; hit: string; dy: number }> = [];
      const check = (kind: string, x: number, z: number) => {
        const g = heightAt(x, z);
        ray.set(new THREE.Vector3(x, g + 40, z), down);
        ray.far = 41;
        for (const h of ray.intersectObject(world.root, true)) {
          if (veg.has(h.object) || h.object === terrainMesh) continue;
          let vis = true;
          for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible) vis = false;
          if (!vis) continue;
          const dy = h.point.y - g;
          if (dy < -0.3 || dy > 8) continue;
          const m = (h.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
          found.push({ kind, x: +x.toFixed(1), z: +z.toFixed(1), hit: m?.color?.getHexString?.() ?? h.object.type, dy: +dy.toFixed(2) });
          break;
        }
      };
      for (const t of world.treeSpots) if (Math.hypot(t.x, t.z) < PARK_RADIUS + 5) check('árvore', t.x, t.z);
      for (const b of world.bushSpots) check('arbusto', b.x, b.z);
      for (const f of world.flowerSpots) check('flor', f.x, f.z);
      const count = (k: string) => found.filter((f) => f.kind === k).length;
      document.documentElement.dataset.audit = JSON.stringify({
        checked: { trees: world.treeSpots.length, bushes: world.bushSpots.length, flowers: world.flowerSpots.length },
        problems: { trees: count('árvore'), bushes: count('arbusto'), flowers: count('flor') },
        byHit: found.reduce<Record<string, number>>((m, f) => ((m[f.hit] = (m[f.hit] ?? 0) + 1), m), {}),
        sample: [...found.filter((f) => f.kind === "árvore").slice(0, 15), ...found.filter((f) => f.kind === "arbusto").slice(0, 15), ...found.filter((f) => f.kind === "flor").slice(0, 15)],
      });
    }
    // 'gardens': onde ficou o jardim de cada prédio, em data-gardens.
    if (cmd === 'gardens') document.documentElement.dataset.gardens = JSON.stringify(world.gardens.map((g) => ({ ...g, x: Math.round(g.x), z: Math.round(g.z) })));
    // 'cam:x,y,z,tx,ty,tz': câmera livre exatamente nesse ponto, olhando para o alvo.
    if (typeof cmd === 'string' && cmd.startsWith('cam:') && !inside) {
      const v = cmd.slice(4).split(',').map(Number);
      if (v.length !== 6 || !v.every(Number.isFinite)) return;
      rig.setMode('orbit');
      rig.glideTo(new THREE.Vector3(v[0], v[1], v[2]), new THREE.Vector3(v[3], v[4], v[5]), 600);
    }
    // 'look:playground', 'look:<prédio>' (lounge do elevador) ou 'look:x,z': câmera livre olhando o ponto.
    if (typeof cmd === 'string' && cmd.startsWith('look:') && !inside) {
      const what = cmd.slice(5);
      const xz = what.split(',').map(Number);
      const p = what.startsWith('playground') ? (PLAYGROUNDS[Number(what.slice(10)) || 0] ?? null) : world.lifts.find((l) => l.id === what) ?? (xz.length === 2 && xz.every(Number.isFinite) ? { x: xz[0]!, z: xz[1]! } : null);
      if (!p) return;
      const y = heightAt(p.x, p.z);
      // Lounge: a câmera fica do lado de fora do prédio, olhando para ele.
      const bd = world.buildings.get(what as ModuleId)?.def;
      const ox = bd ? p.x - bd.x : 1;
      const oz = bd ? p.z - bd.z : 1;
      const ol = Math.hypot(ox, oz) || 1;
      rig.setMode('orbit');
      const up = bd ? 9 : 30;
      rig.glideTo(new THREE.Vector3(p.x + (ox / ol) * 18, y + up, p.z + (oz / ol) * 18), new THREE.Vector3(p.x, y + 2, p.z), 900);
    }
  };
  if (/[?&]debug/.test(location.search)) document.addEventListener('park-debug', onDebug);
  /**
   * O que a luneta mostra: a Lua com crateras no meio da vista, Saturno com os anéis ao lado e um
   * campo de estrelas em volta. Some quando se para de observar (e vai embora com o interior).
   */
  let skyShow: THREE.Group | null = null;
  const hideSky = () => {
    if (!skyShow) return;
    skyShow.parent?.remove(skyShow);
    skyShow = null;
  };
  const showSky = (eye: THREE.Vector3, target: THREE.Vector3) => {
    if (!inside) return;
    hideSky();
    const k = inside.kit;
    const g = new THREE.Group();
    const dir = target.clone().sub(eye).normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, dir).normalize();
    const at = (d: number, sx: number, sy: number) => eye.clone().addScaledVector(dir, d).addScaledVector(side, sx).addScaledVector(up, sy);
    const lit = (color: string, glow: string, i: number) => k.own(new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: i, roughness: 1 }));
    // Lua: esfera com mares escuros e crateras com borda clara.
    const moon = new THREE.Mesh(k.own(new THREE.SphereGeometry(4, 40, 28)), lit('#D8D4CA', '#8C887C', 0.55));
    moon.position.copy(at(70, -1, 0.5));
    const maria = lit('#9A968B', '#55524A', 0.5);
    const rim = lit('#ECE8DE', '#A39F93', 0.5);
    [[0.3, 0.4, 1.3], [-0.5, 0.1, 1.0], [0.1, -0.5, 0.8], [0.6, -0.2, 0.55], [-0.2, 0.7, 0.45], [-0.7, -0.4, 0.5], [0.45, 0.65, 0.35]].forEach(([u, v, r], i) => {
      const n = new THREE.Vector3(u!, v!, 1).normalize();
      const c = new THREE.Mesh(k.own(new THREE.CircleGeometry(r!, 20)), i < 3 ? maria : lit('#B4B0A5', '#6D6A61', 0.5));
      c.position.copy(n.clone().multiplyScalar(4.01));
      c.lookAt(n.clone().multiplyScalar(10));
      moon.add(c);
      if (i >= 3) {
        const ring = new THREE.Mesh(k.own(new THREE.RingGeometry(r! * 0.92, r! * 1.12, 20)), rim);
        ring.position.copy(n.clone().multiplyScalar(4.02));
        ring.lookAt(n.clone().multiplyScalar(10));
        moon.add(ring);
      }
    });
    // O lado da Lua que olha para quem observa.
    moon.lookAt(eye);
    g.add(moon);
    // Saturno com os anéis inclinados.
    const saturn = new THREE.Mesh(k.own(new THREE.SphereGeometry(2.2, 32, 20)), lit('#E3C68A', '#8A6F3A', 0.5));
    saturn.position.copy(at(95, 16, 7));
    const rings = new THREE.Mesh(k.own(new THREE.RingGeometry(3, 5.2, 48)), k.own(new THREE.MeshStandardMaterial({ color: '#CDB57E', emissive: '#7A6638', emissiveIntensity: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })));
    rings.rotation.set(Math.PI / 2 - 0.45, 0.3, 0);
    saturn.add(rings);
    g.add(saturn);
    // Campo de estrelas em volta da vista (algumas mais fortes).
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = at(110, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 80);
      pos.set([p.x, p.y, p.z], i * 3);
    }
    const sg = k.own(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(sg, k.own(new THREE.PointsMaterial({ color: '#F8FAFC', size: 1.6, sizeAttenuation: false }))));
    // Uma estrela dupla mais brilhante, para ter o que procurar.
    for (const [sx, sy] of [[-14, -8], [-13.2, -7.6]] as const) {
      const st = new THREE.Mesh(k.own(new THREE.SphereGeometry(0.35, 10, 8)), k.own(new THREE.MeshBasicMaterial({ color: sx < -13.5 ? '#BFDBFE' : '#FDE68A' })));
      st.position.copy(at(100, sx, sy));
      g.add(st);
    }
    inside.scene.scene.add(g);
    skyShow = g;
  };
  /** Usar um objeto funcional dos interiores. */
  const useThing = (th: Thing) => {
    const fl = inside?.scene.floors;
    if (!fl) return;
    if (th.kind === 'piano' || th.kind === 'drums' || th.kind === 'guitar') {
      instrument = th;
      rig.place(th.x, th.z, th.face);
      // O violão fica abaixo da linha dos olhos: a vista se volta para ele (as cordas vibram à vista).
      if (th.focus) rig.observe(new THREE.Vector3(th.focus.x, th.focus.y, th.focus.z));
      return opts.onInstrument(th.kind);
    }
    if (th.kind === 'vault') return opts.onVault();
    if (th.kind === 'room') {
      const z = fl.zones[th.zone!];
      return z && opts.onZone({ key: z.key, sector: z.sector });
    }
    if (th.kind === 'stairs') {
      // Sobe (no pé da escada) ou desce (na chegada dela) um nível, pelo caminho da própria escada:
      // andando, a pé (guiado, com a altura dos degraus); na câmera livre, a subida acompanhada.
      const c = climbFor(fl, th);
      if (!c || ride || climb) return;
      if (rig.mode() === 'orbit') return startClimb(c);
      return guideAlong(c.path);
    }
    if (th.kind === 'telescope') {
      const lv = fl.levels[level]!;
      rig.place(th.x, th.z, th.face + Math.PI);
      const target = new THREE.Vector3(th.x + Math.sin(th.face) * 60, lv.y + 45, th.z + Math.cos(th.face) * 60);
      showSky(new THREE.Vector3(th.x, lv.y + 1.7, th.z), target);
      return rig.observe(target);
    }
    th.act?.(thingCtx);
  };
  const interact = () => {
    if (rig.mode() === 'orbit' || rig.gliding()) return;
    if (rig.posture() !== 'stand') {
      rig.sit(null);
      rig.observe(null);
      return;
    }
    if (near && !inside) return enter(near);
    const p = rig.body().pos;
    if (inside) {
      // Objeto de ação olhado ou por perto (canteiro, cartão, item da parede do dia): a ação real.
      const act = actionAhead();
      if (act) return opts.onAction({ building: inside.id, id: act.id, long: false });
      const levels = inside.scene.floors?.levels.length ?? 1;
      const th = thingNear(p);
      if (th) return useThing(th);
      const li = elevatorNear();
      const lf = li >= 0 ? inside.scene.floors?.lifts[li] : undefined;
      if (lf && levels > 1) return opts.onElevator({ index: li, dir: lf.dir });
      const s = floorSeat(p);
      if (s) rig.sit({ ...s, face: s.face + Math.PI });
      return;
    }
    const seat = near2(world.seats, p, 2.4);
    if (seat) return rig.sit({ ...seat, face: seat.face + Math.PI });
    const vp = near2(world.viewpoints, p, 4);
    if (vp) {
      rig.place(vp.x, vp.z, rig.body().yaw);
      return rig.observe(new THREE.Vector3(vp.x + Math.sin(vp.view) * 90, vp.y - 4, vp.z + Math.cos(vp.view) * 90));
    }
    const who = town.greet(p, 2.8, performance.now());
    if (who) {
      // Cumprimento (V2.1, 13.7): virar para a pessoa, acenar; ela olha, acena e responde.
      rig.place(p.x, p.z, Math.atan2(-(who.x - p.x), -(who.z - p.z)));
      avatarWaveUntil = performance.now() + 2200;
      // Voz: o visitante diz "oi" e a pessoa responde no seu tom de voz.
      [0, 0.13, 0.26].forEach((d, i) => audio?.note(60 + (i === 1 ? 3 : 0), 'voice', d));
      const base = 52 + (who.seed % 14);
      for (let i = 0; i < 6; i++) audio?.note(base + [0, 2, 4, 1, 3, -2][i]!, 'voice', 0.55 + i * 0.14);
      opts.onTalk({ name: who.name, activity: who.activity, line: who.line });
      return;
    }
    if (inWater(p.x, p.z, 4)) {
      const w = waterPoint(p);
      const dx = w.x - p.x;
      const dz = w.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      return rig.observe(new THREE.Vector3(p.x + (dx / l) * 12, -0.4, p.z + (dz / l) * 12));
    }
    const tree = near2(world.treeSpots, p, 4);
    if (tree) return rig.observe(new THREE.Vector3(tree.x, (tree.y ?? heightAt(tree.x, tree.z)) + 5 * tree.s, tree.z));
  };

  /* ---------- Qualidade ---------- */

  let quality: Quality = opts.quality;
  let fpsCap: number = QUALITY[quality].fpsCap;
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const recompile = (s: THREE.Object3D) =>
    s.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => (x.needsUpdate = true));
    });
  const setQuality = (q: Quality) => {
    quality = q;
    const cfg = QUALITY[q];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatio));
    renderer.shadowMap.enabled = cfg.shadows;
    world.sun.castShadow = cfg.shadows;
    if (world.sun.shadow.mapSize.x !== cfg.shadowSize) {
      world.sun.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
      world.sun.shadow.map?.dispose();
      world.sun.shadow.map = null;
    }
    outside.environment = cfg.env ? envTex : null;
    world.setDetail(q);
    if (inside) {
      inside.scene.scene.environment = cfg.env ? envTex : null;
      inside.scene.setDetail(q);
      recompile(inside.scene.scene);
    }
    fpsCap = cfg.fpsCap;
    recompile(outside);
    resize();
  };

  /* ---------- Hora (ciclo contínuo de luz) e clima (transições graduais) ---------- */
  let targetHour = 12;
  let shownHour = 12;
  const targetSky: Sky = { ...CLEAR_SKY };
  const weather: Sky = { ...CLEAR_SKY };
  let lastLightHour = -1;
  let hourSet = false;
  let skySet = false;
  let skyChanged = true;
  const applyLight = () => {
    const l = lightAt(shownHour);
    world.setLight(l);
    const fog = outside.fog as THREE.Fog;
    fog.color.set(l.skyBottom);
    const grey = Math.min(0.8, Math.max(weather.cloud * 0.4, weather.rain * 0.65, weather.fog * 0.75));
    fog.color.lerp(new THREE.Color(l.glow > 0.6 ? '#2A3045' : '#9AA5B4'), grey);
    // Neblina fecha a vista; chuva também, um pouco.
    fog.near = THREE.MathUtils.lerp(320, 22, weather.fog) * (1 - weather.rain * 0.45);
    fog.far = THREE.MathUtils.lerp(950, 200, weather.fog) * (1 - weather.rain * 0.3);
    renderer.toneMappingExposure = 0.95 - l.glow * 0.08;
    outside.environmentIntensity = 0.7 - l.glow * 0.55;
    lastLightHour = shownHour;
    skyChanged = false;
  };
  const stepEnv = (dt: number) => {
    // Menor caminho no relógio (23h → 1h passa pela meia-noite), com velocidade que cresce com a distância.
    const d = ((((targetHour - shownHour) % 24) + 36) % 24) - 12;
    if (Math.abs(d) > 1e-4) {
      const step = opts.reduceMotion ? d : Math.sign(d) * Math.min(Math.abs(d), dt * Math.max(0.4, Math.abs(d) * 2));
      shownHour = (((shownHour + step) % 24) + 24) % 24;
    }
    for (const k of ['cloud', 'rain', 'fog', 'wind'] as const) {
      const dv = targetSky[k] - weather[k];
      if (dv === 0) continue;
      weather[k] = Math.abs(dv) < 2e-3 || opts.reduceMotion ? targetSky[k] : weather[k] + dv * Math.min(1, dt * 0.7);
      skyChanged = true;
    }
    if (skyChanged) world.setWeather(weather);
    if (skyChanged || Math.abs(shownHour - lastLightHour) > 0.004) applyLight();
  };
  world.setWeather(weather);
  applyLight();
  let audio: ParkAudio | null = null;

  const ro = new ResizeObserver
(resize);
  ro.observe(canvas);

  /* ---------- Laço de desenho ---------- */
  let raf = 0;
  let last = 0;
  let frames = 0;
  let statsAt = performance.now();
  let near: ModuleId | null = null;
  const wcam = new THREE.PerspectiveCamera(55, 1, 0.3, 2800);
  const toWorld = new THREE.Matrix4();
  const wq = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  let lastMode: CamMode = rig.mode();
  let hintFrame = 0;
  let hint: string | null = null;
  const t0 = performance.now();
  // Economia: com a câmera parada há 2,5 s, no máximo 20 quadros por segundo (as pessoas e a água
  // seguem se mexendo); qualquer movimento volta ao normal no quadro seguinte. Poupa a placa de
  // vídeo, a bateria e o ventilador do computador.
  let movedAt = performance.now();
  const camPrev = new THREE.Vector3();
  const camQPrev = new THREE.Quaternion();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const idle = now - movedAt > 2500;
    const cap = idle ? Math.min(fpsCap, 20) : fpsCap;
    if (document.hidden || now - last < 1000 / cap - 1) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    frames++;
    stepEnv(dt);
    const riding = stepRide(now) || stepClimb(now);
    if (!riding) rig.update(dt, now);
    // Andando na escada: o nível muda sozinho quando os pés passam da metade da subida (sem
    // teletransporte nem corte), e com ele a colisão, o teto e o nome do andar.
    if (!riding && inside && rig.mode() !== 'orbit') {
      const fl = inside.scene.floors;
      if (fl?.walk) {
        const L = levelAtHeight(fl.ys, rig.body().pos.y, level);
        if (L !== level) setFloor(L, false);
      }
    }
    if (riding || rig.gliding() || camera.position.distanceToSquared(camPrev) > 1e-6 || camera.quaternion.angleTo(camQPrev) > 5e-4) movedAt = now;
    camPrev.copy(camera.position);
    camQPrev.copy(camera.quaternion);
    // Parou de olhar pela luneta: o céu da luneta some.
    if (skyShow && rig.posture() !== 'observe') hideSky();
    const mode = rig.mode();
    if (mode !== lastMode) {
      lastMode = mode;
      opts.onMode(mode);
    }
    const body = rig.body();
    // O ciclo de passos cresce com a velocidade (2 m andando, 4 m correndo), como numa pessoa: ritmo
    // de 1,2 passada por segundo andando e 1,8 correndo, em vez de pernas girando rápido.
    walkPhase += (dt * body.speed * Math.PI * 2) / (0.9 + 0.45 * body.speed);
    // Passos no ritmo da passada (um por pé), com o som do piso: pedra, grama, madeira, piso ou poça.
    const stepIdx = Math.floor(walkPhase / Math.PI);
    if (stepIdx !== lastStep) {
      lastStep = stepIdx;
      if (mode !== 'orbit' && !riding && !body.airborne && body.speed > 0.4) {
        const p = body.pos;
        const paved = onPath(p.x, p.z) || Math.hypot(p.x, p.z) < PLAZA_RADIUS + 0.5 || PARK_BUILDINGS.some((b) => Math.hypot(p.x - b.x, p.z - b.z) < b.radius * 0.8);
        const surface = inside ? 'floor' : onBridge(p.x, p.z) || inWater(p.x, p.z, 0) ? 'wood' : weather.rain > 0.25 && paved ? 'wet' : paved ? 'stone' : 'grass';
        audio?.footstep(surface, Math.min(0.55, 0.25 + body.speed * 0.05) * (body.running ? 1.3 : 1));
        // Na escada, cada degrau soa (mais agudo subindo), como na subida de antes.
        const fl = inside?.scene.floors;
        if (fl?.walk && fl.walk.zone(p.x, p.z, p.y) && Math.abs(p.y - (fl.ys[level] ?? 0)) > 0.05) audio?.note(p.y > lastStepY + 0.02 ? 50 + (stepIdx % 2) * 2 : 48, 'tom');
        lastStepY = p.y;
      }
    }
    avatar.group.visible = mode === 'third' && !rig.gliding() && !riding;
    if (avatar.group.visible) bodyFigure();
    const t = opts.reduceMotion ? 0 : (now - t0) / 1000;
    if (!inside) {
      world.tick(t, opts.reduceMotion ? 0 : dt, rig.focus(), camera.position);
      // Portas automáticas: abrem para o visitante e para quem está chegando a pé (com o som do trilho).
      for (const p of doors.tick(dt, [body.pos, ...town.walkers()])) if (Math.hypot(p.x - body.pos.x, p.z - body.pos.z) < 30) audio?.note(p.kind === 'slide' ? 40 : 52, p.kind === 'slide' ? 'door' : 'gate', 0, { x: p.x, y: 1.5, z: p.z });
      for (const ev of world.cityEvents()) if (Math.hypot(ev.x - camera.position.x, ev.z - camera.position.z) < 120) audio?.note(ev.kind === 'brake' ? 40 : 64, ev.kind, 0, { x: ev.x, y: 1, z: ev.z });
      // Moradores: a rotina anda com a hora; só os mais próximos são desenhados.
      if (crowdMax > 0) {
        if (!settled) {
          town.settle(conditions());
          settled = true;
        }
        const viewer = mode === 'orbit' ? rig.controls.target : body.pos;
        town.step(opts.reduceMotion ? dt * 0.5 : dt, conditions(), mode === 'orbit' ? { x: 1e5, z: 1e5 } : viewer, now);
        extras.step(opts.reduceMotion ? dt * 0.5 : dt, shownHour, weather.rain, viewer, now, world.bus());
        world.play(extras.play());
        // Moradores e gente de passagem juntos, os mais perto primeiro.
        const range = mode === 'orbit' ? 260 : 140;
        const people = [...town.visible(viewer, crowdMax, range), ...extras.visible(viewer, crowdMax, range)];
        people.sort((u, v) => Math.hypot(u.x - viewer.x, u.z - viewer.z) - Math.hypot(v.x - viewer.x, v.z - viewer.z));
        crowd.set(people.slice(0, crowdMax + 8));
        const cat = extras.cat();
        animals.set([...town.pets(), ...(cat ? [cat] : [])].filter((a) => Math.hypot(a.x - viewer.x, a.z - viewer.z) < range), extras.pigeons(), extras.ducks());
        for (const sn of extras.sounds()) {
          if (Math.hypot(sn.x - viewer.x, sn.z - viewer.z) > 50) continue;
          const midi = sn.kind === 'bikebell' ? 0 : sn.kind === 'kid' ? 76 + Math.floor(Math.random() * 6) : sn.kind === 'coo' ? 57 : sn.kind === 'quack' ? 66 : 70;
          if (sn.kind === 'kid') for (let i = 0; i < 3; i++) audio?.note(midi + i * 2, 'kid', i * 0.14, { x: sn.x, y: 1, z: sn.z });
          else audio?.note(midi, sn.kind, 0, { x: sn.x, y: sn.kind === 'coo' ? 0.2 : 0.5, z: sn.z });
        }
        // Sons dos jogos perto de quem está olhando: chute, raquetada, apito, torcida.
        for (const hit of town.hits()) {
          const dd = Math.hypot(hit.x - viewer.x, hit.z - viewer.z);
          if (dd > 60) continue;
          if (hit.kind === 'bark') audio?.note(62 + Math.floor(Math.random() * 5), 'bark', 0, { x: hit.x, y: 0.5, z: hit.z });
          else if (hit.kind === 'kick') audio?.note(45, 'ball');
          else if (hit.kind === 'racket') audio?.note(64, 'ball');
          else if (hit.kind === 'whistle') audio?.note(100, 'whistle');
          else for (let i = 0; i < 8; i++) audio?.note(58 + ((i * 5) % 9), 'voice', i * 0.09);
        }
        ballMeshes.tennis.count = 0;
        ballMeshes.football.count = 0;
        for (const bl of town.balls()) {
          const m = ballMeshes[bl.kind];
          ballM.makeTranslation(bl.x, bl.y, bl.z);
          m.setMatrixAt(m.count++, ballM);
          m.instanceMatrix.needsUpdate = true;
        }
      }
      // Andando: avisa quando a entrada de um prédio está a poucos passos e o que dá para fazer aqui.
      if (mode !== 'orbit') {
        let best: ModuleId | null = null;
        world.buildings.forEach((b, id) => {
          if (opts.interiors[id] && Math.hypot(body.pos.x - b.entrance.x, body.pos.z - b.entrance.z) < 13) best = id;
        });
        if (++hintFrame % 8 === 0) {
          const h = best ? null : findHint();
          const key = h ? JSON.stringify(h) : null;
          if (key !== hint) {
            hint = key;
            opts.onHint(h);
          }
        }

        if (best !== near) {
          near = best;
          opts.onNear(near);
        }
      } else {
        if (near) {
          near = null;
          opts.onNear(null);
        }
        if (hint) {
          hint = null;
          opts.onHint(null);
        }
      }
      renderer.render(outside, camera);
    } else {
      inside.scene.tick(t, camera);
      const tn = performance.now();
      inside.scene.floors?.things.forEach((th) => th.tick?.(tn));
      // Quem está neste prédio: sentados nas cadeiras das salas (estudando, trabalhando, lendo),
      // treinando ou tocando perto das salas do seu tipo. Lugares fixos por pessoa.
      {
        const fl = inside.scene.floors;
        const here = town.insideOf(inside.id).sort((u, v) => u.key - v.key);
        const seats = fl?.seats ?? [];
        const zones = fl?.zones ?? [];
        const figs: Figure[] = [];
        here.forEach((h, i) => {
          const f = h.figure;
          const standing = h.activity === 'gym';
          if (!standing && seats.length) {
            const st = seats[(i * 7 + inside!.id.length) % seats.length]!;
            figs.push({ ...f, x: st.x, y: st.y - 0.44, z: st.z, yaw: st.face, pose: h.activity === 'music' ? 'play' : h.activity === 'work' ? 'sit' : 'read' });
          } else if (zones.length) {
            const z = zones[i % zones.length]!;
            const lv = fl!.levels[z.level]!;
            const a = i * 2.3;
            figs.push({ ...f, x: z.x + Math.cos(a) * 1.4, y: lv.y, z: z.z + Math.sin(a) * 1.4, yaw: z.face, pose: standing ? 'exercise' : 'stand' });
          }
        });
        indoorCrowd.set(figs);
      }
      // Primeiro o parque (visto da posição real dentro do prédio), depois o interior por cima:
      // pelas janelas aparecem o parque, os outros prédios, as pessoas e o céu de verdade.
      const bd = world.buildings.get(inside.id)!;
      toWorld.compose(v.set(bd.def.x, heightAt(bd.def.x, bd.def.z), bd.def.z), wq.setFromAxisAngle(up, bd.facing), one);
      camera.updateMatrixWorld();
      wcam.matrixWorld.multiplyMatrices(toWorld, camera.matrixWorld);
      wcam.matrixWorld.decompose(wcam.position, wcam.quaternion, wcam.scale);
      wcam.fov = camera.fov;
      wcam.aspect = camera.aspect;
      wcam.updateProjectionMatrix();
      wcam.updateMatrixWorld();
      world.tick(t, opts.reduceMotion ? 0 : dt, wcam.position, wcam.position);
      if (crowdMax > 0) {
        town.step(opts.reduceMotion ? dt * 0.5 : dt, conditions(), { x: 1e5, z: 1e5 }, now);
        crowd.set(town.visible(wcam.position, crowdMax, 160));
      }
      bd.group.visible = false;
      renderer.autoClear = false;
      renderer.clear();
      renderer.render(outside, wcam);
      renderer.clearDepth();
      bd.group.visible = true;
      if (mode !== 'orbit' && ++hintFrame % 8 === 0) {

        const h = findHint();
        const key = h ? JSON.stringify(h) : null;
        if (key !== hint) {
          hint = key;
          opts.onHint(h);
        }
      }
      renderer.render(inside.scene.scene, camera);
      renderer.autoClear = true;
    }
    if (++treeFrame % 40 === 0) {
      const c = camera.position;
      let n = 0;
      for (const tr of world.treeSpots) if (Math.abs(tr.x - c.x) < 30 && Math.abs(tr.z - c.z) < 30) n++;
      treeNear = Math.min(1, n / 18);
    }
    audio?.update({ listener: camera, inside: !!inside, hour: shownHour, sky: weather, steps: mode === 'orbit' || rig.gliding() ? 0 : body.airborne ? 0 : body.speed, trees: treeNear, season, skaters: inside ? [] : extras.skaters() }, dt);
    if (now - statsAt >= 1000) {
      opts.onStats({ fps: Math.round((frames * 1000) / (now - statsAt)), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, idle: now - movedAt > 2500 });
      frames = 0;
      statsAt = now;
    }
  };

  setQuality(opts.quality);
  raf = requestAnimationFrame(loop);

  const v = new THREE.Vector3();
  return {
    setQuality,
    setWeather: (w) => {
      Object.assign(targetSky, w);
      if (!skySet) Object.assign(weather, w);
      skyChanged = true;
      skySet = true;
    },
    setAudio: (a) => {
      audio = a;
    },
    setSeason: (s) => {
      season = s;
      world.setSeason(s);
    },
    setFestive: (on) => world.setFestive(on),
    cameraInfo: () => {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      return { x: camera.position.x, z: camera.position.z, yaw: Math.atan2(dir.x, dir.z), inside: !!inside };
    },
    setCamMode: (m) => rig.setMode(m),
    setMove: rig.setMove,
    setRun: rig.setRun,
    jump: rig.jump,
    interact,
    setMoveSettings: rig.setSettings,
    setCrowd: (max) => {
      crowdMax = max;
      crowd.group.visible = max > 0;
    },
    setHour: (h) => {
      const d = Math.abs(((((h - shownHour) % 24) + 36) % 24) - 12);
      // Saltos grandes de hora: os moradores já aparecem onde estariam.
      if (d > 0.5) settled = false;
      targetHour = h;
      // Ao abrir, a luz já nasce na hora certa (sem atravessar o dia).
      if (!hourSet) shownHour = h;
      hourSet = true;
    },
    census: () => town.census(),
    captureMap: (half, px) => {
      if (inside) return null;
      try {
        const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 140);
        cam.position.set(0, 66, 0);
        cam.up.set(0, 0, -1);
        cam.lookAt(0, 0, 0);
        cam.updateMatrixWorld();
        const rt = new THREE.WebGLRenderTarget(px, px);
        rt.texture.colorSpace = THREE.SRGBColorSpace;
        const fog = outside.fog;
        const crowdVis = crowd.group.visible;
        const avatarVis = avatar.group.visible;
        outside.fog = null;
        crowd.group.visible = false;
        avatar.group.visible = false;
        world.setLight(lightAt(12));
        world.tick(0, 0, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 60, 0));
        // Sombra do parque inteiro (senão aparece a borda da área de sombra como uma faixa).
        const sc = world.sun.shadow.camera;
        const box = [sc.left, sc.right, sc.top, sc.bottom, sc.far];
        const bias = [world.sun.shadow.bias, world.sun.shadow.normalBias];
        Object.assign(sc, { left: -half * 1.6, right: half * 1.6, top: half * 1.6, bottom: -half * 1.6, far: 900 });
        world.sun.shadow.bias = -0.004;
        world.sun.shadow.normalBias = 1.2;
        sc.updateProjectionMatrix();
        renderer.setRenderTarget(rt);
        renderer.render(outside, cam);
        const buf = new Uint8Array(px * px * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, px, px, buf);
        renderer.setRenderTarget(null);
        rt.dispose();
        Object.assign(sc, { left: box[0], right: box[1], top: box[2], bottom: box[3], far: box[4] });
        world.sun.shadow.bias = bias[0]!;
        world.sun.shadow.normalBias = bias[1]!;
        sc.updateProjectionMatrix();
        outside.fog = fog;
        crowd.group.visible = crowdVis;
        avatar.group.visible = avatarVis;
        applyLight();
        const c = document.createElement('canvas');
        c.width = c.height = px;
        const g = c.getContext('2d');
        if (!g) return null;
        const img = g.createImageData(px, px);
        // A leitura vem de baixo para cima: vira as linhas.
        for (let y = 0; y < px; y++) img.data.set(buf.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
        g.putImageData(img, 0, 0);
        // Mais contraste e cor (a foto sai sem o ajuste de tons da tela).
        const out = document.createElement('canvas');
        out.width = out.height = px;
        const o = out.getContext('2d');
        if (o) {
          o.filter = 'contrast(1.25) saturate(1.1) brightness(0.86)';
          o.drawImage(c, 0, 0);
          o.filter = 'none';
          // Copas das árvores vistas de cima (de longe, a folhagem 3D vira pontinhos).
          const k = px / (half * 2);
          for (const tr of world.treeSpots) {
            if (Math.hypot(tr.x, tr.z) > half) continue;
            const r = (tr.species === 'slender' ? 4.2 : tr.species === 'palm' ? 2.6 : 2.8) * tr.s * k;
            const x = (tr.x + half) * k;
            const y = (tr.z + half) * k;
            const grd = o.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
            const base: [number, number, number] = tr.species === 'blossom' ? [196, 120, 160] : tr.species === 'palm' ? [92, 140, 70] : [52, 105, 52];
            grd.addColorStop(0, `rgba(${base[0] + 40},${base[1] + 45},${base[2] + 30},0.95)`);
            grd.addColorStop(0.75, `rgba(${base[0]},${base[1]},${base[2]},0.92)`);
            grd.addColorStop(1, `rgba(${base[0] - 25},${base[1] - 35},${base[2] - 25},0)`);
            o.fillStyle = grd;
            o.beginPath();
            o.arc(x, y, r, 0, Math.PI * 2);
            o.fill();
          }
          return out.toDataURL('image/jpeg', 0.85);
        }
        return c.toDataURL('image/jpeg', 0.85);
      } catch {
        return null;
      }
    },
    snapshot: () => {
      const b = rig.body();
      return {
        cam: camera.position.toArray() as [number, number, number],
        target: rig.controls.target.toArray() as [number, number, number],
        mode: rig.mode(),
        body: { x: b.pos.x, z: b.pos.z, yaw: b.yaw },
        inside: inside?.id ?? null,
        level,
      };
    },
    hour: () => shownHour,
    flyTo,
    enter,
    exit,
    focusSector,
    setFloor: (n) => setFloor(n),
    zones: () => (inside?.scene.floors?.zones ?? []).map((z) => ({ level: z.level, key: z.key, sector: z.sector })),
    focusZone: (i) => focusZone(i),
    play: (i) => {
      if (!instrument) return;
      instrument.press?.(i);
      if (instrument.kind === 'piano') {
        const k = PIANO_KEYS[i];
        if (k) audio?.note(k.midi, 'piano');
      } else if (instrument.kind === 'guitar') {
        // Uma corda, ou o acorde batido da corda grave para a aguda (as mesmas notas que vibram no 3D).
        for (const n of guitarStrum(i)) audio?.note(n.midi, 'guitar', n.delay);
      } else {
        const d = DRUM_PADS[i];
        if (d) audio?.note(d === 'kick' ? 36 : d === 'snare' ? 38 : d === 'hat' ? 42 : 45, d);
      }
    },
    closeInstrument: () => {
      if (instrument?.focus && rig.posture() === 'observe') rig.observe(null);
      instrument = null;
    },
    setVault: (s, instant = false) => {
      const th = inside?.scene.floors?.things.find((o) => o.kind === 'vault');
      if (!th?.setVault?.(s, instant) || instant) return;
      // Abrindo: trava que solta, cliques do volante, a porta pesada saindo. Fechando: a porta
      // encosta, o volante volta e os ferrolhos entram.
      if (s === 'open') {
        audio?.note(50, 'tom');
        audio?.note(84, 'hat', 0.25);
        audio?.note(88, 'hat', 0.5);
        audio?.note(36, 'kick', 0.85);
      } else {
        audio?.note(36, 'kick', 1.75);
        audio?.note(84, 'hat', 2.0);
        audio?.note(47, 'tom', 2.5);
      }
    },
    rideTo,
    setData: (id, data) => {
      dataCache.set(id, data);
      if (inside?.id === id) inside.scene.setData(data);
    },
    project: () => {
      const out: Array<{ id: ModuleId; x: number; y: number; visible: boolean }> = [];
      world.buildings.forEach((b, id) => {
        v.set(b.def.x, b.top + 1.5, b.def.z).project(camera);
        const d = camera.position.distanceTo(b.group.position);
        out.push({ id, x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight, visible: !inside && v.z < 1 && d < 430 });
      });
      return out;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      rig.dispose();
      disposeInterior();
      const seen = new Set<THREE.BufferGeometry>();
      outside.traverse((o) => {
        const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        if (g && !seen.has(g)) {
          seen.add(g);
          g.dispose();
        }
      });
      world.stop();
      document.removeEventListener('park-debug', onDebug);
      kit.dispose();
      envTex.dispose();
      renderer.dispose();
    },
  };
}
