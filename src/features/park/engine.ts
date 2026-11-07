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
import { AVATAR_LOOK, createCrowd } from './people';
import { createTown } from './town';
import type { Conditions } from '@/domain/parkPeople';
import { CLEAR_SKY, createWorld, lightAt, type Quality, type Season, type Sky } from './world';
import type { ParkAudio } from './audio';
import type { ParkSnapshot } from './parkContext';
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
  startMode: CamMode;
  /** Retomar de onde a pessoa estava (volta da interface 2D): sem abertura. */
  restore?: ParkSnapshot | null;
}

export type Hint = { kind: 'sit' } | { kind: 'view' } | { kind: 'tree' } | { kind: 'water' } | { kind: 'person'; name: string; activity: string };

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
  setRun: (on: boolean) => void;
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
  /** Onde a pessoa está agora (para retomar depois). */
  snapshot: () => ParkSnapshot;
  flyTo: (id: ModuleId | 'plaza') => void;
  enter: (id: ModuleId) => void;
  exit: () => void;
  focusSector: (id: string) => void;
  setData: (id: ModuleId, data: unknown) => void;
  project: () => Array<{ id: ModuleId; x: number; y: number; visible: boolean }>;
  dispose: () => void;
}

const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 1024, env: false, fpsCap: 30 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, env: true, fpsCap: 60 },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, env: true, fpsCap: 60 },
} as const;

const HOME = { cam: new THREE.Vector3(46, 40, 76), target: new THREE.Vector3(0, 4, -12) };

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

  const camera = new THREE.PerspectiveCamera(48, 1, 0.3, 1400);
  const rig = createCameraRig(camera, canvas, opts.reduceMotion, opts.onPosture);
  const outsideWorld = () => rig.setWorld({ ground: heightAt, obstacles: world.obstacles, limit: { x: 0, z: 0, r: PARK_RADIUS + 30 }, ceiling: Infinity, minDistance: 4, maxDistance: 380, blocked: (x, z) => inWater(x, z, 0.8) });
  outsideWorld();

  /* ---------- Pessoas: avatar (terceira pessoa) e moradores ---------- */
  const avatar = createCrowd(kit, 1);
  outside.add(avatar.group);
  const crowd = createCrowd(kit, 40);
  outside.add(crowd.group);
  const town = createTown();
  let crowdMax = 16;
  let season: Conditions['season'] = 'summer';
  const conditions = (): Conditions => ({ hour: shownHour, day: Math.floor(Date.now() / 86400000), rain: weather.rain, fog: weather.fog, wind: weather.wind, season });
  let settled = false;
  const bodyFigure = () => {
    const b = rig.body();
    const sitting = rig.posture() === 'sit';
    avatar.set([{ x: b.pos.x, y: b.pos.y, z: b.pos.z, yaw: b.yaw + Math.PI, pose: sitting ? 'sit' : b.speed > 0.2 ? 'walk' : 'stand', phase: walkPhase, stride: Math.min(1, b.speed / 3.6), ...AVATAR_LOOK, scale: 1 }]);
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

  const disposeInterior = () => {
    if (!inside) return;
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
      ikit.glowing.forEach((m) => (m.emissiveIntensity = 1));
      scene.scene.environment = QUALITY[quality].env ? envTex : null;
      scene.scene.environmentIntensity = 0.55;
      scene.setDetail(quality);
      const cached = dataCache.get(id);
      if (cached !== undefined) scene.setData(cached);
      inside = { id, kit: ikit, scene };
      rig.setWorld({ ground: () => 0, obstacles: scene.obstacles, limit: { x: 0, z: 0, r: scene.room.radius - 1.2 }, ceiling: scene.room.height, minDistance: 1.5, maxDistance: scene.room.radius * 1.7 });
      const v = fit(scene.view('entry'));
      camera.position.copy(v.cam);
      rig.controls.target.copy(v.target);
      scene.scene.add(avatar.group);
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
  const findHint = (): Hint | null => {
    if (rig.posture() !== 'stand' || inside) return null;
    const p = rig.body().pos;
    if (near2(world.seats, p, 1.8)) return { kind: 'sit' };
    if (near2(world.viewpoints, p, 4)) return { kind: 'view' };
    const who = town.nearest(p, 2.6);
    if (who) return { kind: 'person', name: who.name, activity: who.activity };
    if (inWater(p.x, p.z, 4)) return { kind: 'water' };
    if (near2(world.treeSpots, p, 4)) return { kind: 'tree' };
    return null;
  };
  const interact = () => {
    if (rig.mode() === 'orbit' || rig.gliding()) return;
    if (rig.posture() !== 'stand') {
      rig.sit(null);
      rig.observe(null);
      return;
    }
    if (near && !inside) return enter(near);
    if (inside) return;
    const p = rig.body().pos;
    const seat = near2(world.seats, p, 1.8);
    if (seat) return rig.sit({ ...seat, face: seat.face + Math.PI });
    const vp = near2(world.viewpoints, p, 4);
    if (vp) {
      rig.place(vp.x, vp.z, rig.body().yaw);
      return rig.observe(new THREE.Vector3(vp.x + Math.sin(vp.view) * 90, vp.y - 4, vp.z + Math.cos(vp.view) * 90));
    }
    const who = town.nearest(p, 2.6);
    if (who) return rig.observe(new THREE.Vector3(who.x, heightAt(who.x, who.z) + 1.5, who.z));
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
    rig.update(dt, now);
    const mode = rig.mode();
    if (mode !== lastMode) {
      lastMode = mode;
      opts.onMode(mode);
    }
    const body = rig.body();
    walkPhase += dt * body.speed * 2.6;
    avatar.group.visible = mode === 'third' && !rig.gliding();
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
      renderer.render(inside.scene.scene, camera);
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
    snapshot: () => {
      const b = rig.body();
      return {
        cam: camera.position.toArray() as [number, number, number],
        target: rig.controls.target.toArray() as [number, number, number],
        mode: rig.mode(),
        body: { x: b.pos.x, z: b.pos.z, yaw: b.yaw },
        inside: inside?.id ?? null,
      };
    },
    hour: () => shownHour,
    flyTo,
    enter,
    exit,
    focusSector,
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
