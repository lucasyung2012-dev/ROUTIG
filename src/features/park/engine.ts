/**
 * Motor do parque: um renderizador para o mundo e para o interior aberto (um por vez),
 * câmera livre ou em primeira pessoa, toque para escolher, entrar e sair dos prédios,
 * hora do dia, chuva e qualidade adaptável.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ModuleId } from '@/app/modules';
import { LAKE, PARK_RADIUS, PONDS, heightAt, inWater } from '@/domain/park';
import { Kit } from './kit';
import { createCameraRig, type CamMode, type MoveSettings, type Posture } from './camera';
import { AVATAR_LOOK, createCrowd, type Figure } from './people';
import { createTown } from './town';
import type { Conditions } from '@/domain/parkPeople';
import { CLEAR_SKY, createWorld, lightAt, type Quality, type Season, type Sky } from './world';
import type { ParkAudio } from './audio';
import { DRUM_PADS, PIANO_KEYS, type Thing, type ThingCtx, type ThingKind } from './interiors/things';
import type { ParkSnapshot } from './parkContext';
import { footprint } from './collision';
import type { InteriorScene } from './interiors/common';

export interface Stats {
  fps: number;
  calls: number;
  triangles: number;
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
  /** Perto do elevador e a pessoa pediu para chamar: mostrar a escolha de andar. */
  onElevator: () => void;
  /** Elevador em movimento (true) ou parado (false). */
  onRiding: (riding: boolean) => void;
  /** Alguém respondeu ao cumprimento (nome, atividade e qual fala). */
  onTalk: (t: { name: string; activity: string; line: number }) => void;
  /** Interior: quantos andares tem o prédio e em qual a pessoa está. */
  onFloors: (count: number, current: number) => void;
  /** Sala de um andar escolhida (abre o painel real ligado a ela). */
  onZone: (z: { key: string; sector: string | null } | null) => void;
  /** Piano ou bateria: abrir (ou fechar, null) o teclado/pads na tela. */
  onInstrument: (k: 'piano' | 'drums' | null) => void;
  startMode: CamMode;
  /** Retomar de onde a pessoa estava (volta da interface 2D): sem abertura. */
  restore?: ParkSnapshot | null;
}

export type Hint = { kind: 'use'; what: ThingKind; key?: string; up?: boolean } | { kind: 'elevator' } | { kind: 'sit' } | { kind: 'view' } | { kind: 'tree' } | { kind: 'water' } | { kind: 'person'; name: string; activity: string };

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
  /** Andar de elevador até o andar `n` (com cabine e portas). */
  rideTo: (n: number) => void;
  /** Tocar a tecla/peça `i` do instrumento aberto (piano: PIANO_KEYS; bateria: DRUM_PADS). */
  play: (i: number) => void;
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
  const world = createWorld(kit);
  outside.add(world.root);
  outside.fog = new THREE.Fog('#DCEFF8', 320, 950);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(48, 1, 0.3, 2800);
  const rig = createCameraRig(camera, canvas, opts.reduceMotion, opts.onPosture);
  const outsideWorld = () => rig.setWorld({ ground: heightAt, obstacles: world.obstacles, limit: { x: 0, z: 0, r: PARK_RADIUS + 30 }, ceiling: Infinity, minDistance: 4, maxDistance: 520, blocked: (x, z) => inWater(x, z, 0.8) });
  outsideWorld();

  /* ---------- Pessoas: avatar (terceira pessoa) e moradores ---------- */
  const avatar = createCrowd(kit, 1);
  outside.add(avatar.group);
  const crowd = createCrowd(kit, 40);
  outside.add(crowd.group);
  const town = createTown(world.seats);
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
    avatar.set([{ x: b.pos.x, y: b.pos.y, z: b.pos.z, yaw: b.yaw + Math.PI, pose: sitting ? 'sit' : b.speed > 0.2 ? 'walk' : performance.now() < avatarWaveUntil ? 'wave' : 'stand', expr: performance.now() < avatarWaveUntil ? 'smile' : 'neutral', phase: b.speed > 0.2 ? walkPhase : performance.now() / 500, stride: Math.min(1, b.speed / 3.6), ...AVATAR_LOOK, scale: 1 }]);
  };
  let walkPhase = 0;

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
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 400) return;
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    if (!inside) {
      const hit = ray.intersectObjects(world.pickables, true)[0];
      opts.onPick((hit?.object.userData.building as ModuleId | undefined) ?? null);
    } else {
      const hit = ray.intersectObjects(inside.scene.pickables, true)[0];
      const zone = hit?.object.userData.zone as number | undefined;
      if (zone !== undefined) return focusZone(zone);
      const id = (hit?.object.userData.sector as string | undefined) ?? null;
      if (id) focusSector(id);
      opts.onSector(id);
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  /* ---------- Troca de cena com escurecimento ---------- */
  const fadeSwap = (swap: () => void) => {
    const run = () => {
      swap();
      canvas.style.opacity = '1';
    };
    if (opts.reduceMotion) return run();
    canvas.style.transition = 'opacity 260ms ease';
    canvas.style.opacity = '0';
    window.setTimeout(run, 280);
  };

  const fit = (v: { cam: THREE.Vector3; target: THREE.Vector3 }) => {
    // Tela em pé (iPhone) mostra menos na largura: a câmera recua para caber.
    const k = camera.aspect < 0.9 ? 1 + (0.9 - camera.aspect) * 0.9 : 1;
    return { cam: v.target.clone().add(v.cam.clone().sub(v.target).multiplyScalar(k)), target: v.target };
  };

  const focusSector = (id: string) => {
    if (!inside) return;
    const v = fit(inside.scene.view(id));
    rig.glideTo(v.cam, v.target, 1100);
  };

  /* ---------- Andares dos interiores ---------- */
  let level = 0;
  const levelWorld = (L: number) => {
    const sc = inside!.scene;
    const lv = sc.floors?.levels[L];
    if (!lv || L === 0) return { ground: () => 0, obstacles: sc.obstacles, limit: { x: 0, z: 0, r: sc.room.radius - 1.2 }, ceiling: lv?.ceiling ?? sc.room.height, minDistance: 1.5, maxDistance: sc.room.radius * 1.7 };
    // Cada planta diz onde não se pisa (vazios, núcleo, fachada fora das portas, borda do terraço).
    return { ground: () => lv.y, obstacles: lv.obstacles, limit: { x: 0, z: 0, r: lv.walk }, ceiling: lv.ceiling, minDistance: 1.5, maxDistance: sc.room.radius * 1.7, blocked: lv.blocked, wall: lv.wallAt };

  };
  const setFloor = (L: number, move = true) => {
    const levels = inside?.scene.floors?.levels;
    if (!inside || !levels || L < 0 || L >= levels.length) return;
    level = L;
    rig.setWorld(levelWorld(L));
    opts.onFloors(levels.length, L);
    if (!move) return;
    const lv = levels[L]!;
    // Chega pelo elevador, nos fundos, olhando para dentro do prédio.
    if (rig.mode() !== 'orbit') rig.place(lv.arrive.x, lv.arrive.z, Math.PI);
    else rig.glideTo(new THREE.Vector3(0, lv.y + 3.4, lv.outer - 1), new THREE.Vector3(0, lv.y + 1, -lv.outer * 0.3), 900);
  };
  /* ---------- Elevador: entrar, fechar portas, subir/descer, abrir, sair ---------- */
  type Ride = { from: number; to: number; t0: number; start: THREE.Vector3; startLook: THREE.Vector3; mode: CamMode };
  let ride: Ride | null = null;
  const RIDE = { walkIn: 1800, close: 700, open: 700, walkOut: 900, perFloor: 1700 };
  const rideTo = (to: number) => {
    const fl = inside?.scene.floors;
    if (!inside || !fl || ride || to === level || to < 0 || to >= fl.levels.length) return;
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    ride = { from: level, to, t0: performance.now(), start: camera.position.clone(), startLook: camera.position.clone().add(look.multiplyScalar(5)), mode: rig.mode() };
    rig.setMove(0, 0);
    fl.cabin.position.y = fl.levels[level]!.y;
    opts.onRiding(true);
  };
  const ease2 = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  /** Um quadro da viagem; devolve true enquanto a câmera é do elevador. */
  const stepRide = (now: number) => {
    const fl = inside?.scene.floors;
    if (!ride || !fl) return false;
    const e = fl.elevator;
    const y0 = fl.levels[ride.from]!.y;
    const y1 = fl.levels[ride.to]!.y;
    const move = RIDE.perFloor * Math.abs(ride.to - ride.from);
    const t = now - ride.t0;
    const inCab = new THREE.Vector3(e.x, 0, e.z - 0.2);
    const outLook = (y: number) => new THREE.Vector3(e.x, y + 1.5, e.z + 8);
    const setDoors = (open: number) => {
      fl.doors[0].position.x = -0.39 - open * 0.72;
      fl.doors[1].position.x = 0.39 + open * 0.72;
    };
    let p1 = RIDE.walkIn;
    if (t < p1) {
      // Entra na cabine, vira de frente para as portas.
      // Primeiro até a frente da porta, depois para dentro, virando de frente para a saída.
      const k = t / p1;
      const door = new THREE.Vector3(e.x, y0 + 1.6, e.z + 2.6);
      if (k < 0.6) camera.position.lerpVectors(ride.start, door, ease2(k / 0.6));
      else camera.position.lerpVectors(door, inCab.clone().setY(y0 + 1.6), ease2((k - 0.6) / 0.4));
      if (k < 0.6) camera.lookAt(new THREE.Vector3().lerpVectors(ride.startLook, new THREE.Vector3(e.x, y0 + 1.4, e.z - 2), ease2(k / 0.6)));
      else {
        // Vira de frente para as portas passando pelo lado (sem girar no próprio eixo de uma vez).
        const q2 = (k - 0.6) / 0.4;
        const side = new THREE.Vector3(e.x + 4, y0 + 1.4, e.z);
        camera.lookAt(q2 < 0.5 ? new THREE.Vector3().lerpVectors(new THREE.Vector3(e.x, y0 + 1.4, e.z - 2), side, ease2(q2 * 2)) : new THREE.Vector3().lerpVectors(side, outLook(y0), ease2(q2 * 2 - 1)));
      }
      setDoors(1);
      return true;
    }
    let p0 = p1;
    p1 += RIDE.close;
    if (t < p1) {
      setDoors(1 - ease2((t - p0) / RIDE.close));
      return true;
    }
    p0 = p1;
    p1 += move;
    if (t < p1) {
      const y = y0 + (y1 - y0) * ease2((t - p0) / move);
      fl.cabin.position.y = y;
      camera.position.set(inCab.x, y + 1.6, inCab.z);
      camera.lookAt(outLook(y));
      setDoors(0);
      return true;
    }
    p0 = p1;
    p1 += RIDE.open;
    fl.cabin.position.y = y1;
    camera.position.set(inCab.x, y1 + 1.6, inCab.z);
    if (t < p1) {
      camera.lookAt(outLook(y1));
      setDoors(ease2((t - p0) / RIDE.open));
      return true;
    }
    // Chegou: sai da cabine para o andar, no modo de câmera de antes.
    setDoors(1);
    const to = ride.to;
    const mode = ride.mode;
    ride = null;
    setFloor(to);
    if (mode !== 'orbit') rig.setMode(mode);
    opts.onRiding(false);
    return false;
  };

  const focusZone = (i: number) => {
    const z = inside?.scene.floors?.zones[i];
    if (!z) return;
    if (z.level !== level) setFloor(z.level, false);
    const lv = inside!.scene.floors!.levels[z.level]!;
    // Em frente à porta da sala, olhando para dentro dela.
    const dx = z.ex - z.x;
    const dz = z.ez - z.z;
    const r = Math.hypot(dx, dz) || 1;
    if (rig.mode() !== 'orbit') rig.place(z.ex, z.ez, Math.atan2(dx, dz));
    else rig.glideTo(new THREE.Vector3(z.x + (dx / r) * 5.5, lv.y + 2.8, z.z + (dz / r) * 5.5), new THREE.Vector3(z.x, lv.y + 1.4, z.z), 1000);
    opts.onZone({ key: z.key, sector: z.sector });
  };

  const disposeInterior = () => {
    if (!inside) return;
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
      // Colisão do térreo pelo desenho (móveis, balcões, paredes), além dos obstáculos do próprio interior.
      scene.obstacles.push(...footprint(scene.scene, () => 0, 0.3, 1.45, 0.5));
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
      if (rig.mode() !== 'orbit') rig.place(v.cam.x, v.cam.z, Math.atan2(-(v.target.x - v.cam.x), -(v.target.z - v.cam.z)));
      recompile(scene.scene);
      opts.onInside(id);
      instant?.();
    };
    if (instant) return swap();
    rig.glideTo(front, door, 1500, () => fadeSwap(swap));
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
      if (rig.mode() !== 'orbit') rig.place(b.entrance.x + out.x * 3, b.entrance.z + out.z * 3, Math.atan2(-out.x, -out.z));
      opts.onInside(null);
    });
  };

  const flyTo = (id: ModuleId | 'plaza') => {
    if (inside) return;
    if (id === 'plaza') return rig.glideTo(HOME.cam, HOME.target, 1600);
    const b = world.buildings.get(id);
    if (!b) return;
    const out = new THREE.Vector3(b.entrance.x - b.def.x, 0, b.entrance.z - b.def.z).normalize();
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
  const elevatorNear = () => {
    const lv = inside?.scene.floors?.levels[level];
    if (!lv) return false;
    const p = rig.body().pos;
    if (level === 0) return Math.hypot(p.x, p.z + lv.walk) < 5.5;
    const e = inside!.scene.floors!.elevator;
    return Math.hypot(p.x - e.x, p.z - (e.z + 2.6)) < 3.4;
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
    const lv = inside?.scene.floors?.levels[level];
    return lv ? near2(inside!.scene.floors!.seats.filter((s) => Math.abs(s.y - 0.45 - lv.y) < 0.5), p, 1.8) : null;
  };
  const findHint = (): Hint | null => {
    if (rig.posture() !== 'stand') return null;
    const p = rig.body().pos;
    if (inside) {
      const th = thingNear(p);
      if (!th && elevatorNear() && (inside.scene.floors?.levels.length ?? 1) > 1) return { kind: 'elevator' };
      if (th) {
        const fl = inside.scene.floors!;
        if (th.kind === 'room') return { kind: 'use', what: 'room', key: fl.zones[th.zone!]?.key };
        if (th.kind === 'stairs') return { kind: 'use', what: 'stairs', up: level < fl.levels.length - 1 };
        return { kind: 'use', what: th.kind };
      }
      return floorSeat(p) ? { kind: 'sit' } : null;
    }

    if (near2(world.seats, p, 1.8)) return { kind: 'sit' };
    if (near2(world.viewpoints, p, 4)) return { kind: 'view' };
    const who = town.nearest(p, 2.6);
    if (who) return { kind: 'person', name: who.name, activity: who.activity };
    if (inWater(p.x, p.z, 4)) return { kind: 'water' };
    if (near2(world.treeSpots, p, 4)) return { kind: 'tree' };
    return null;
  };
  /** Usar um objeto funcional dos interiores. */
  const useThing = (th: Thing) => {
    const fl = inside?.scene.floors;
    if (!fl) return;
    if (th.kind === 'piano' || th.kind === 'drums') {
      instrument = th;
      rig.place(th.x, th.z, th.face);
      return opts.onInstrument(th.kind);
    }
    if (th.kind === 'room') {
      const z = fl.zones[th.zone!];
      return z && opts.onZone({ key: z.key, sector: z.sector });
    }
    if (th.kind === 'stairs') {
      // Sobe um andar (no último, desce), saindo da escada do núcleo no outro andar.
      const to = level < fl.levels.length - 1 ? level + 1 : level - 1;
      const there = fl.things.find((o) => o.kind === 'stairs' && o.level === to);
      setFloor(to, false);
      if (there) rig.place(there.x, there.z + 0.4, Math.PI);
      else setFloor(to);
      audio?.note(60, 'tom');
      return;
    }
    if (th.kind === 'telescope') {
      const lv = fl.levels[level]!;
      rig.place(th.x, th.z, th.face + Math.PI);
      return rig.observe(new THREE.Vector3(th.x + Math.sin(th.face) * 60, lv.y + 45, th.z + Math.cos(th.face) * 60));
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
      const levels = inside.scene.floors?.levels.length ?? 1;
      const th = thingNear(p);
      if (th) return useThing(th);
      if (elevatorNear() && levels > 1) return opts.onElevator();
      const s = floorSeat(p);
      if (s) rig.sit({ ...s, face: s.face + Math.PI });
      return;
    }
    const seat = near2(world.seats, p, 1.8);
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
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden || now - last < 1000 / fpsCap - 1) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    frames++;
    stepEnv(dt);
    const riding = stepRide(now);
    if (!riding) rig.update(dt, now);
    const mode = rig.mode();
    if (mode !== lastMode) {
      lastMode = mode;
      opts.onMode(mode);
    }
    const body = rig.body();
    walkPhase += dt * body.speed * 2.6;
    avatar.group.visible = mode === 'third' && !rig.gliding() && !riding;
    if (avatar.group.visible) bodyFigure();
    const t = opts.reduceMotion ? 0 : (now - t0) / 1000;
    if (!inside) {
      world.tick(t, opts.reduceMotion ? 0 : dt, rig.focus(), camera.position);
      // Moradores: a rotina anda com a hora; só os mais próximos são desenhados.
      if (crowdMax > 0) {
        if (!settled) {
          town.settle(conditions());
          settled = true;
        }
        const viewer = mode === 'orbit' ? rig.controls.target : body.pos;
        town.step(opts.reduceMotion ? dt * 0.5 : dt, conditions(), mode === 'orbit' ? { x: 1e5, z: 1e5 } : viewer, now);
        crowd.set(town.visible(viewer, crowdMax, mode === 'orbit' ? 260 : 140));
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
    audio?.update({ listener: camera, inside: !!inside, hour: shownHour, sky: weather, steps: mode === 'orbit' || rig.gliding() ? 0 : body.airborne ? 0 : body.speed }, dt);
    if (now - statsAt >= 1000) {
      opts.onStats({ fps: Math.round((frames * 1000) / (now - statsAt)), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
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
      } else {
        const d = DRUM_PADS[i];
        if (d) audio?.note(d === 'kick' ? 36 : d === 'snare' ? 38 : d === 'hat' ? 42 : 45, d);
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
      kit.dispose();
      envTex.dispose();
      renderer.dispose();
    },
  };
}
