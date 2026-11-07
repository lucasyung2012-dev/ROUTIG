/**
 * Câmera do parque (V2.1): primeira pessoa (principal), terceira pessoa (avatar neutro de 1,70 m)
 * e câmera livre (girar, aproximar e deslocar).
 * Andar: WASD/setas ou controle na tela, com aceleração e desaceleração suaves; correr (Shift ou
 * botão), pular (Espaço ou botão, pulo moderado). Olhar: arrastar na tela ou com o mouse.
 * Colide com prédios, paredes e água; nunca atravessa o chão nem o teto.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** orbit = câmera livre; walk = primeira pessoa; third = terceira pessoa. */
export type CamMode = 'orbit' | 'walk' | 'third';
export type Posture = 'stand' | 'sit' | 'observe';

export interface Obstacle {
  x: number;
  z: number;
  r: number;
  /** Altura (a câmera livre passa por cima; quem anda nunca). */
  h: number;
}

export interface CameraWorld {
  ground: (x: number, z: number) => number;
  obstacles: Obstacle[];
  /** Área permitida (círculo). */
  limit: { x: number; z: number; r: number };
  /** Teto (interiores); Infinity fora. */
  ceiling: number;
  minDistance: number;
  maxDistance: number;
  /** Pontos onde não se pisa (água); quem anda não entra. */
  blocked?: (x: number, z: number) => boolean;
}

export interface MoveSettings {
  /** Sensibilidade do olhar (0,5–2). */
  sensitivity: number;
  /** Velocidade de andar (0,6–1,6). */
  speed: number;
  invertY: boolean;
}

export interface Seat {
  x: number;
  y: number;
  z: number;
  face: number;
}

export interface CameraRig {
  controls: OrbitControls;
  mode: () => CamMode;
  setMode: (m: CamMode) => void;
  setWorld: (w: CameraWorld) => void;
  setSettings: (s: MoveSettings) => void;
  /** Controle de andar na tela: x = lado, y = frente (-1..1). */
  setMove: (x: number, y: number) => void;
  setRun: (on: boolean) => void;
  jump: () => void;
  /** Coloca o corpo em um ponto (pés no chão), olhando para `yaw`. */
  place: (x: number, z: number, yaw: number) => void;
  /** Sentar em um banco (null levanta). */
  sit: (seat: Seat | null) => void;
  /** Observar um ponto (aproxima a vista); qualquer movimento cancela. */
  observe: (p: THREE.Vector3 | null) => void;
  posture: () => Posture;
  /** Pés do corpo, direção e velocidade atual (avatar, NPCs, minimapa). */
  body: () => { pos: THREE.Vector3; yaw: number; speed: number; airborne: boolean };
  glideTo: (cam: THREE.Vector3 | THREE.Curve<THREE.Vector3>, target: THREE.Vector3, ms: number, done?: () => void) => void;
  gliding: () => boolean;
  update: (dt: number, now: number) => void;
  /** Ponto que a câmera olha (chuva, rótulos). */
  focus: () => THREE.Vector3;
  dispose: () => void;
}

const EYE = 1.7;
const SEATED_EYE = 0.78;
const GRAVITY = 18;
const JUMP_V = Math.sqrt(2 * GRAVITY * 0.55);
const BASE_FOV = 55;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function createCameraRig(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, reduceMotion: boolean, onPosture?: (p: Posture) => void): CameraRig {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduceMotion;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minPolarAngle = 0.04;
  controls.maxPolarAngle = 1.53;
  controls.zoomSpeed = 1.2;
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

  let world: CameraWorld = { ground: () => 0, obstacles: [], limit: { x: 0, z: 0, r: 1e4 }, ceiling: Infinity, minDistance: 4, maxDistance: 320 };
  let settings: MoveSettings = { sensitivity: 1, speed: 1, invertY: false };
  let mode: CamMode = 'orbit';
  let pending: CamMode | null = null;
  let yaw = 0;
  let pitch = 0;
  let posture: Posture = 'stand';
  let seatEye = 0;
  let fovTarget = BASE_FOV;
  let runBtn = false;
  let wantJump = false;
  const feet = new THREE.Vector3();
  let vy = 0;
  let airborne = false;
  const vel = new THREE.Vector2();
  const move = new THREE.Vector2();
  const keys = new Set<string>();
  const focusPt = new THREE.Vector3();
  const thirdCam = new THREE.Vector3();
  let thirdDist = 4.4;

  const setPosture = (p: Posture) => {
    if (p === posture) return;
    posture = p;
    if (p !== 'observe') fovTarget = BASE_FOV;
    onPosture?.(p);
  };

  /* ---------- Teclado e arrastar para olhar ---------- */
  const typing = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName));
  };
  const onKey = (e: KeyboardEvent) => {
    if (typing(e)) return;
    if (e.type === 'keydown') {
      keys.add(e.code);
      if (e.code === 'Space' && mode !== 'orbit') {
        wantJump = true;
        e.preventDefault();
      }
    } else keys.delete(e.code);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const blur = () => keys.clear();
  window.addEventListener('blur', blur);

  let look: { id: number; x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (mode === 'orbit') return;
    look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    if (mode === 'orbit' || !look || look.id !== e.pointerId) return;
    const k = (e.pointerType === 'touch' ? 0.006 : 0.004) * settings.sensitivity;
    yaw -= (e.clientX - look.x) * k;
    const lim = mode === 'third' ? [-0.9, 0.6] : [-1.25, 1.25];
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - look.y) * k * (settings.invertY ? -1 : 1), lim[0]!, lim[1]!);
    look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (look?.id === e.pointerId) look = null;
  };
  const onWheel = (e: WheelEvent) => {
    if (mode !== 'third') return;
    thirdDist = THREE.MathUtils.clamp(thirdDist + e.deltaY * 0.004, 2.6, 8);
  };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: true });

  /* ---------- Limites e colisão ---------- */
  const clampLimit = (p: THREE.Vector3) => {
    const lx = p.x - world.limit.x;
    const lz = p.z - world.limit.z;
    const ld = Math.hypot(lx, lz);
    if (ld > world.limit.r) {
      p.x = world.limit.x + (lx / ld) * world.limit.r;
      p.z = world.limit.z + (lz / ld) * world.limit.r;
    }
  };

  const collide = (p: THREE.Vector3, pad: number, solid: boolean) => {
    for (const o of world.obstacles) {
      if (!solid && p.y > o.h + 1) continue;
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + pad;
      if (d < min) {
        const k = d > 1e-3 ? min / d : 1;
        p.x = o.x + (d > 1e-3 ? dx : min) * k;
        p.z = o.z + (d > 1e-3 ? dz : 0) * k;
      }
    }
    clampLimit(p);
  };

  const solidAt = (x: number, z: number, y: number) => world.obstacles.some((o) => y < o.h + 0.3 && Math.hypot(x - o.x, z - o.z) < o.r + 0.2);

  const placeBody = (x: number, z: number, y: number) => {
    feet.set(x, 0, z);
    collide(feet, 0.45, true);
    feet.y = world.ground(feet.x, feet.z);
    yaw = y;
    pitch = 0;
    vel.set(0, 0);
    vy = 0;
    airborne = false;
    thirdCam.set(feet.x + Math.sin(yaw) * thirdDist, feet.y + 2.6, feet.z + Math.cos(yaw) * thirdDist);
  };

  /* ---------- Deslizar (cinematográfico) ---------- */
  let glide: { cam: THREE.Curve<THREE.Vector3> | [THREE.Vector3, THREE.Vector3]; target: [THREE.Vector3, THREE.Vector3]; t0: number; ms: number; done?: () => void } | null = null;

  const setMode = (m: CamMode) => {
    if (glide) {
      pending = m;
      return;
    }
    if (m === mode) return;
    if (mode === 'orbit') {
      // Desce até onde a câmera livre olhava, mantendo a direção.
      const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
      const p = controls.target.clone().sub(dir.clone().setY(0).setLength(Math.min(6, dir.length())));
      placeBody(p.x, p.z, Math.atan2(-dir.x, -dir.z));
      controls.enabled = false;
    } else if (m === 'orbit') {
      setPosture('stand');
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const eye = feet.clone().setY(feet.y + EYE);
      const target = eye.clone().addScaledVector(fwd, 10);
      target.y = world.ground(target.x, target.z) + 1;
      camera.position.copy(eye).addScaledVector(fwd, -8).setY(eye.y + 6);
      controls.target.copy(target);
      controls.enabled = true;
    } else if (m === 'third') {
      thirdCam.copy(camera.position);
    }
    mode = m;
  };

  const applyPending = () => {
    if (!pending) return;
    const m = pending;
    pending = null;
    setMode(m);
  };

  controls.addEventListener('start', () => {
    // Tocar na tela interrompe só os deslizes que não levam a algum lugar (a abertura, por exemplo).
    if (glide && !glide.done) {
      glide = null;
      applyPending();
    }
  });

  const sit = (seat: Seat | null) => {
    if (!seat) {
      if (posture === 'sit') setPosture('stand');
      return;
    }
    feet.set(seat.x, seat.y - 0.45, seat.z);
    seatEye = seat.y + SEATED_EYE;
    yaw = seat.face;
    pitch = -0.05;
    vel.set(0, 0);
    setPosture('sit');
  };

  const observe = (p: THREE.Vector3 | null) => {
    if (!p) {
      if (posture === 'observe') setPosture('stand');
      return;
    }
    const eye = feet.clone().setY(feet.y + EYE);
    const d = p.clone().sub(eye);
    yaw = Math.atan2(-d.x, -d.z);
    pitch = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.8, 0.9);
    fovTarget = 30;
    setPosture('observe');
  };

  /* ---------- Andar (primeira e terceira pessoa) ---------- */
  const walk = (dt: number) => {
    let fx = move.x;
    let fy = move.y;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fy += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fy -= 1;
    if (keys.has('KeyA')) fx -= 1;
    if (keys.has('KeyD')) fx += 1;
    if (keys.has('ArrowLeft')) yaw += dt * 1.8 * settings.sensitivity;
    if (keys.has('ArrowRight')) yaw -= dt * 1.8 * settings.sensitivity;
    const len = Math.hypot(fx, fy);
    if (len > 1) {
      fx /= len;
      fy /= len;
    }
    if (posture !== 'stand' && (len > 0.25 || wantJump)) {
      // Andar ou pular cancela sentar e observar.
      setPosture('stand');
      wantJump = false;
      feet.y = Math.max(feet.y, world.ground(feet.x, feet.z));
    }
    if (posture === 'sit') return;
    const run = runBtn || keys.has('ShiftLeft') || keys.has('ShiftRight');
    const top = (run ? 7.5 : 3.6) * settings.speed;
    const fwd = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw));
    const right = new THREE.Vector2(-fwd.y, fwd.x);
    const want = fwd.multiplyScalar(fy * top).add(right.multiplyScalar(fx * top));
    // Aceleração e desaceleração suaves (nada de parar seco); no ar, controle reduzido.
    const k = Math.min(1, dt * (want.lengthSq() > vel.lengthSq() ? 6 : 9) * (airborne ? 0.35 : 1));
    vel.lerp(want, k);
    if (vel.lengthSq() < 1e-4) vel.set(0, 0);
    const prevX = feet.x;
    const prevZ = feet.z;
    feet.x += vel.x * dt;
    feet.z += vel.y * dt;
    collide(feet, 0.45, true);
    if (world.blocked?.(feet.x, feet.z)) {
      feet.x = prevX;
      feet.z = prevZ;
      vel.set(0, 0);
    }
    const g = world.ground(feet.x, feet.z);
    if (wantJump && !airborne) {
      vy = JUMP_V;
      airborne = true;
    }
    wantJump = false;
    if (airborne) {
      vy -= GRAVITY * dt;
      feet.y += vy * dt;
      if (Number.isFinite(world.ceiling) && feet.y + EYE > world.ceiling - 0.2) {
        feet.y = world.ceiling - 0.2 - EYE;
        vy = Math.min(vy, 0);
      }
      if (feet.y <= g) {
        feet.y = g;
        vy = 0;
        airborne = false;
      }
    } else feet.y = g;
  };

  const update = (dt: number, now: number) => {
    if (glide && now >= glide.t0) {
      const k = Math.min(1, (now - glide.t0) / glide.ms);
      const e = ease(k);
      if (Array.isArray(glide.cam)) camera.position.lerpVectors(glide.cam[0], glide.cam[1], e);
      else camera.position.copy(glide.cam.getPoint(e));
      controls.target.lerpVectors(glide.target[0], glide.target[1], e);
      camera.lookAt(controls.target);
      focusPt.copy(controls.target);
      if (k >= 1) {
        const done = glide.done;
        glide = null;
        done?.();
        if (!glide) applyPending();
      }
      return;
    }
    if (Math.abs(camera.fov - fovTarget) > 0.05) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 5);
      camera.updateProjectionMatrix();
    }
    if (mode !== 'orbit') {
      walk(dt);
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const eyeY = posture === 'sit' ? seatEye : feet.y + EYE;
      if (mode === 'walk') {
        camera.position.set(feet.x, eyeY, feet.z);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        focusPt.copy(camera.position).addScaledVector(fwd, 8);
        return;
      }
      // Terceira pessoa: atrás e um pouco acima da cabeça; aproxima se houver parede no meio.
      const head = new THREE.Vector3(feet.x, eyeY - 0.1, feet.z);
      const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch) + 0.28, Math.cos(yaw) * Math.cos(pitch)).normalize();
      let d = thirdDist;
      for (let s = 0.4; s <= thirdDist; s += 0.3) {
        const x = head.x + back.x * s;
        const z = head.z + back.z * s;
        const y = head.y + back.y * s;
        if (solidAt(x, z, y) || Math.hypot(x - world.limit.x, z - world.limit.z) > world.limit.r + 1 || (Number.isFinite(world.ceiling) && y > world.ceiling - 0.3)) {
          d = Math.max(0.6, s - 0.3);
          break;
        }
      }
      const want = head.clone().addScaledVector(back, d);
      want.y = Math.max(want.y, world.ground(want.x, want.z) + 0.4);
      if (Number.isFinite(world.ceiling)) want.y = Math.min(want.y, world.ceiling - 0.3);
      thirdCam.lerp(want, thirdCam.distanceToSquared(want) > 400 ? 1 : Math.min(1, dt * 12));
      camera.position.copy(thirdCam);
      camera.lookAt(head.x, head.y + 0.15, head.z);
      focusPt.copy(head).addScaledVector(fwd, 6);
      return;
    }
    controls.minDistance = world.minDistance;
    controls.maxDistance = world.maxDistance;
    controls.update();
    // Limites suaves: alvo dentro da área; câmera acima do chão, abaixo do teto e fora dos prédios.
    const t = controls.target;
    clampLimit(t);
    t.y = THREE.MathUtils.clamp(t.y, world.ground(t.x, t.z), Math.min(world.ceiling - 0.5, world.ground(t.x, t.z) + 30));
    const p = camera.position;
    collide(p, 1, false);
    p.y = Math.max(p.y, world.ground(p.x, p.z) + 0.8);
    if (Number.isFinite(world.ceiling)) p.y = Math.min(p.y, world.ceiling - 0.4);
    focusPt.copy(t);
  };

  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();

  return {
    controls,
    mode: () => (glide && pending ? pending : mode),
    setMode,
    setWorld: (w) => {
      world = w;
    },
    setSettings: (s) => {
      settings = s;
    },
    setMove: (x, y) => move.set(x, y),
    setRun: (on) => {
      runBtn = on;
    },
    jump: () => {
      wantJump = true;
    },
    place: (x, z, y) => {
      setPosture('stand');
      placeBody(x, z, y);
    },
    sit,
    observe,
    posture: () => posture,
    body: () => ({ pos: feet, yaw, speed: vel.length(), airborne }),
    glideTo: (cam, target, ms, done) => {
      if (mode !== 'orbit') {
        // Desliza na câmera livre e volta ao modo de antes ao chegar.
        pending = pending ?? mode;
        mode = 'orbit';
        setPosture('stand');
        controls.enabled = true;
      }
      if (reduceMotion) {
        camera.position.copy(cam instanceof THREE.Vector3 ? cam : cam.getPoint(1));
        controls.target.copy(target);
        camera.lookAt(target);
        done?.();
        applyPending();
        return;
      }
      glide = { cam: cam instanceof THREE.Vector3 ? [camera.position.clone(), cam.clone()] : cam, target: [controls.target.clone(), target.clone()], t0: performance.now(), ms, done };
    },
    gliding: () => !!glide,
    update,
    focus: () => focusPt,
    dispose: () => {
      controls.dispose();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
  };
}
