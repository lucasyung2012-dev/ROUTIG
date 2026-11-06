/**
 * Controlador da fatia vertical: um renderizador, duas cenas (lado de fora e interior da
 * Central de Recepção), câmera cinematográfica, toque para escolher, qualidade adaptável.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Kit } from './kit';
import { ENTRANCE, RECEPTION, TIMES, createExterior, type TimeOfDay } from './receptionExterior';
import { createInterior, type InteriorLabels, type ReceptionData, type SectorId } from './receptionInterior';
import type { ParkQuality, ParkStats } from './parkScene';

export type ReceptionMode = 'outside' | 'inside';

export interface ReceptionController {
  setQuality: (q: ParkQuality) => void;
  setTime: (t: TimeOfDay) => void;
  setRain: (on: boolean) => void;
  setData: (d: ReceptionData) => void;
  /** Câmera desliza até a porta e entra. */
  enter: () => void;
  exit: () => void;
  focusSector: (id: SectorId | 'overview') => void;
  /** Volta para a vista da praça. */
  home: () => void;
  /** Onde fica o topo do prédio na tela (para o nome em HTML). */
  projectTop: () => { x: number; y: number; visible: boolean };
  dispose: () => void;
}

const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 0, env: false, fpsCap: 30 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, env: true, fpsCap: 60 },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, env: true, fpsCap: 60 },
} as const;

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

interface Glide {
  cam: THREE.Curve<THREE.Vector3> | [THREE.Vector3, THREE.Vector3];
  target: [THREE.Vector3, THREE.Vector3];
  t0: number;
  ms: number;
  done?: () => void;
}

export function createReception(
  canvas: HTMLCanvasElement,
  opts: {
    quality: ParkQuality;
    reduceMotion: boolean;
    labels: InteriorLabels;
    onStats: (s: ParkStats) => void;
    onPick: (what: 'inbox' | null) => void;
    onSector: (id: SectorId | null) => void;
    onMode: (m: ReceptionMode) => void;
  },
): ReceptionController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const kit = new Kit();
  const outside = new THREE.Scene();
  const ext = createExterior(kit);
  outside.add(ext.root);
  outside.fog = new THREE.Fog('#DCEFF8', 95, 260);
  const inside = createInterior(kit, opts.labels);

  // Reflexos do vidro e do metal: ambiente gerado uma vez (sem arquivo de imagem).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.3, 700);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !opts.reduceMotion;
  controls.screenSpacePanning = false;

  let mode: ReceptionMode = 'outside';
  const configureControls = () => {
    if (mode === 'outside') {
      controls.minDistance = 10;
      controls.maxDistance = 140;
      controls.minPolarAngle = 0.2;
      controls.maxPolarAngle = 1.38;
      controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
      controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
      controls.enablePan = true;
    } else {
      // Dentro: um dedo gira o olhar, pinça aproxima; sem deslocar para não atravessar paredes.
      controls.minDistance = 2.5;
      controls.maxDistance = 11;
      controls.minPolarAngle = 0.6;
      controls.maxPolarAngle = 1.5;
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
      controls.enablePan = false;
    }
  };
  configureControls();
  controls.addEventListener('change', () => {
    const t = controls.target;
    if (mode === 'outside') {
      const r = Math.hypot(t.x, t.z);
      if (r > 70) t.multiplyScalar(70 / r);
      t.y = Math.max(0, Math.min(t.y, 6));
      // Nunca abaixo do chão.
      if (camera.position.y < 1.2) camera.position.y = 1.2;
    } else {
      const r = Math.hypot(camera.position.x, camera.position.z);
      if (r > 11.2) {
        camera.position.x *= 11.2 / r;
        camera.position.z *= 11.2 / r;
      }
      camera.position.y = Math.min(Math.max(camera.position.y, 0.8), 6.6);
    }
  });

  const HOME = { cam: new THREE.Vector3(30, 22, 34), target: new THREE.Vector3(0, 3, -9) };
  camera.position.copy(HOME.cam);
  controls.target.copy(HOME.target);

  let glide: Glide | null = null;
  const glideTo = (cam: THREE.Vector3 | THREE.Curve<THREE.Vector3>, target: THREE.Vector3, ms: number, done?: () => void) => {
    if (opts.reduceMotion) {
      camera.position.copy(cam instanceof THREE.Vector3 ? cam : cam.getPoint(1));
      controls.target.copy(target);
      done?.();
      return;
    }
    glide = { cam: cam instanceof THREE.Vector3 ? [camera.position.clone(), cam.clone()] : cam, target: [controls.target.clone(), target.clone()], t0: performance.now(), ms, done };
  };
  controls.addEventListener('start', () => {
    // Tocar na tela interrompe a abertura cinematográfica.
    if (glide && !glide.done) glide = null;
  });

  // Abertura: a câmera desce do alto, contorna a praça e para diante da Central de Recepção.
  if (!opts.reduceMotion) {
    const intro = new THREE.CatmullRomCurve3([new THREE.Vector3(-85, 70, 95), new THREE.Vector3(-40, 42, 60), new THREE.Vector3(10, 28, 48), HOME.cam.clone()]);
    camera.position.copy(intro.getPoint(0));
    controls.target.set(0, 0, 0);
    glide = { cam: intro, target: [new THREE.Vector3(0, 0, 0), HOME.target.clone()], t0: performance.now() + 300, ms: 5200 };
  }

  /* Escolha por toque */
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY, t: performance.now() });
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 400) return;
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    if (mode === 'outside') {
      const hit = ray.intersectObjects(ext.pickables, true)[0];
      opts.onPick(hit ? 'inbox' : null);
    } else {
      const hit = ray.intersectObjects(inside.sectorGroups, true)[0];
      const id = (hit?.object.userData.sector as SectorId | undefined) ?? null;
      if (id) focusSector(id);
      opts.onSector(id);
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  /* Troca de cena com escurecimento rápido */
  const fadeSwap = (next: ReceptionMode, after: () => void) => {
    const swap = () => {
      mode = next;
      configureControls();
      after();
      opts.onMode(next);
      canvas.style.opacity = '1';
    };
    if (opts.reduceMotion) return swap();
    canvas.style.transition = 'opacity 260ms ease';
    canvas.style.opacity = '0';
    window.setTimeout(swap, 280);
  };

  /** Tela em pé (iPhone) mostra menos na largura: a câmera recua para caber o setor. */
  const fit = (v: { cam: THREE.Vector3; target: THREE.Vector3 }) => {
    const k = camera.aspect < 0.9 ? 1 + (0.9 - camera.aspect) * 1.1 : 1;
    return { cam: v.target.clone().add(v.cam.clone().sub(v.target).multiplyScalar(k)), target: v.target };
  };

  const focusSector = (id: SectorId | 'overview') => {
    const v = fit(inside.view(id));
    glideTo(v.cam, v.target, 1100);
  };

  const enter = () => {
    if (mode === 'inside') return;
    opts.onPick(null);
    const door = new THREE.Vector3(RECEPTION.x, 2.2, RECEPTION.z);
    glideTo(ENTRANCE.clone(), door, 1600, () =>
      fadeSwap('inside', () => {
        const v = fit(inside.view('overview'));
        camera.position.copy(v.cam);
        controls.target.copy(v.target);
      }),
    );
  };

  const exit = () => {
    if (mode === 'outside') return;
    opts.onSector(null);
    fadeSwap('outside', () => {
      camera.position.copy(ENTRANCE).add(new THREE.Vector3(0, 5, 14));
      controls.target.set(RECEPTION.x, 3, RECEPTION.z);
      glideTo(HOME.cam, HOME.target, 1400);
    });
  };

  /* Qualidade */
  let fpsCap: number = QUALITY[opts.quality].fpsCap;
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const setQuality = (q: ParkQuality) => {
    const cfg = QUALITY[q];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatio));
    renderer.shadowMap.enabled = cfg.shadows;
    ext.sun.castShadow = cfg.shadows;
    if (cfg.shadows && ext.sun.shadow.mapSize.x !== cfg.shadowSize) {
      ext.sun.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
      ext.sun.shadow.map?.dispose();
      ext.sun.shadow.map = null;
    }
    outside.environment = cfg.env ? envTex : null;
    inside.scene.environment = cfg.env ? envTex : null;
    inside.scene.environmentIntensity = 0.55;
    ext.setDetail(q);
    inside.setDetail(q);
    fpsCap = cfg.fpsCap;
    // Sombra e ambiente mudam o shader: os materiais precisam ser recompilados.
    [outside, inside.scene].forEach((s) =>
      s.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => (x.needsUpdate = true));
      }),
    );
    resize();
  };

  /* Hora do dia e chuva (transição suave) */
  let time: TimeOfDay = 'day';
  let raining = false;
  let blend = 1;
  let from = { ...TIMES.day };
  const lerpColor = (a: string, b: string, k: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
  const applyLight = (k: number) => {
    const to = TIMES[time];
    const l = {
      skyTop: lerpColor(from.skyTop, to.skyTop, k),
      skyBottom: lerpColor(from.skyBottom, to.skyBottom, k),
      sun: lerpColor(from.sun, to.sun, k),
      sunI: THREE.MathUtils.lerp(from.sunI, to.sunI, k),
      hemiI: THREE.MathUtils.lerp(from.hemiI, to.hemiI, k),
      glow: THREE.MathUtils.lerp(from.glow, to.glow, k),
      sunPos: from.sunPos.map((v, i) => THREE.MathUtils.lerp(v, to.sunPos[i]!, k)) as [number, number, number],
    };
    ext.setLight(l, l.glow);
    (outside.fog as THREE.Fog).color.set(l.skyBottom);
    if (raining) (outside.fog as THREE.Fog).color.lerp(new THREE.Color('#9AA5B4'), 0.6);
    renderer.toneMappingExposure = 1.05 - l.glow * 0.15;
    // O reflexo do ambiente também escurece à noite (senão a cena continua clara).
    outside.environmentIntensity = 1 - l.glow * 0.85;
    return l;
  };
  let current = applyLight(1);
  const setTime = (t: TimeOfDay) => {
    from = { ...current };
    time = t;
    blend = opts.reduceMotion ? 1 : 0;
    current = applyLight(blend);
  };
  const setRain = (on: boolean) => {
    raining = on;
    ext.setRain(on);
    current = applyLight(blend);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  /* Laço de desenho */
  let raf = 0;
  let last = 0;
  let frames = 0;
  let statsAt = performance.now();
  const t0 = performance.now();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden || now - last < 1000 / fpsCap - 1) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    frames++;
    if (glide && now >= glide.t0) {
      const k = Math.min(1, (now - glide.t0) / glide.ms);
      const e = ease(k);
      if (Array.isArray(glide.cam)) camera.position.lerpVectors(glide.cam[0], glide.cam[1], e);
      else camera.position.copy(glide.cam.getPoint(e));
      controls.target.lerpVectors(glide.target[0], glide.target[1], e);
      if (k >= 1) {
        const done = glide.done;
        glide = null;
        done?.();
      }
    }
    if (blend < 1) {
      blend = Math.min(1, blend + dt / 1.6);
      current = applyLight(blend);
    }
    const t = opts.reduceMotion ? 0 : (now - t0) / 1000;
    if (mode === 'outside') ext.tick(t, opts.reduceMotion ? 0 : dt, controls.target);
    else inside.tick(t, camera);
    controls.update();
    renderer.render(mode === 'outside' ? outside : inside.scene, camera);
    if (now - statsAt >= 1000) {
      opts.onStats({ fps: Math.round((frames * 1000) / (now - statsAt)), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries });
      frames = 0;
      statsAt = now;
    }
  };

  setQuality(opts.quality);
  raf = requestAnimationFrame(loop);

  const v = new THREE.Vector3();
  return {
    setQuality,
    setTime,
    setRain,
    setData: inside.setData,
    enter,
    exit,
    focusSector,
    home: () => (mode === 'outside' ? glideTo(HOME.cam, HOME.target, 1400) : focusSector('overview')),
    projectTop: () => {
      v.copy(ext.top).project(camera);
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight, visible: mode === 'outside' && v.z < 1 && camera.position.distanceTo(ext.top) < 160 };
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      controls.dispose();
      const seen = new Set<THREE.BufferGeometry>();
      [outside, inside.scene].forEach((s) =>
        s.traverse((o) => {
          const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
          if (g && !seen.has(g)) {
            seen.add(g);
            g.dispose();
          }
        }),
      );
      kit.dispose();
      envTex.dispose();
      renderer.dispose();
    },
  };
}
