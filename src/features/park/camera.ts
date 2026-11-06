/**
 * Câmera do parque: livre (padrão) e primeira pessoa (opcional).
 * Livre: girar 360°, inclinar até quase o horizonte, aproximar e deslocar, sem atravessar chão,
 * paredes ou prédios. Primeira pessoa: olhos a 1,7 m, andar com WASD/setas ou com o controle
 * na tela, olhar arrastando; colide com prédios, paredes e água.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CamMode = 'orbit' | 'walk';

export interface Obstacle {
  x: number;
  z: number;
  r: number;
  /** Altura (a câmera livre passa por cima; a primeira pessoa nunca). */
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
}

export interface CameraRig {
  controls: OrbitControls;
  mode: () => CamMode;
  setMode: (m: CamMode) => void;
  setWorld: (w: CameraWorld) => void;
  /** Controle de andar na tela: x = lado, y = frente (-1..1). */
  setMove: (x: number, y: number) => void;
  glideTo: (cam: THREE.Vector3 | THREE.Curve<THREE.Vector3>, target: THREE.Vector3, ms: number, done?: () => void) => void;
  gliding: () => boolean;
  update: (dt: number, now: number) => void;
  /** Ponto que a câmera olha (chuva, rótulos). */
  focus: () => THREE.Vector3;
  dispose: () => void;
}

const EYE = 1.7;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function createCameraRig(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, reduceMotion: boolean): CameraRig {
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
  let mode: CamMode = 'orbit';
  let yaw = 0;
  let pitch = 0;
  const move = new THREE.Vector2();
  const keys = new Set<string>();
  const focusPt = new THREE.Vector3();

  /* ---------- Teclado e arrastar para olhar (primeira pessoa) ---------- */
  const typing = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  };
  const onKey = (e: KeyboardEvent) => {
    if (typing(e)) return;
    if (e.type === 'keydown') keys.add(e.code);
    else keys.delete(e.code);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const blur = () => keys.clear();
  window.addEventListener('blur', blur);

  let look: { id: number; x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (mode !== 'walk') return;
    look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    if (mode !== 'walk' || !look || look.id !== e.pointerId) return;
    const k = e.pointerType === 'touch' ? 0.006 : 0.004;
    yaw -= (e.clientX - look.x) * k;
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - look.y) * k, -1.2, 1.2);
    look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (look?.id === e.pointerId) look = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  /* ---------- Deslizar (cinematográfico) ---------- */
  let glide: { cam: THREE.Curve<THREE.Vector3> | [THREE.Vector3, THREE.Vector3]; target: [THREE.Vector3, THREE.Vector3]; t0: number; ms: number; done?: () => void } | null = null;
  controls.addEventListener('start', () => {
    // Tocar na tela interrompe só os deslizes que não levam a algum lugar (a abertura, por exemplo).
    if (glide && !glide.done) glide = null;
  });

  const setMode = (m: CamMode) => {
    if (m === mode) return;
    if (m === 'walk') {
      // Desce até a altura dos olhos onde a câmera está olhando, mantendo a direção.
      const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
      yaw = Math.atan2(-dir.x, -dir.z);
      pitch = 0;
      const p = controls.target.clone().sub(dir.setY(0).setLength(Math.min(6, dir.length())));
      camera.position.set(p.x, world.ground(p.x, p.z) + EYE, p.z);
      controls.enabled = false;
    } else {
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const target = camera.position.clone().addScaledVector(fwd, 10);
      target.y = world.ground(target.x, target.z);
      camera.position.addScaledVector(fwd, -6).setY(camera.position.y + 5);
      controls.target.copy(target);
      controls.enabled = true;
    }
    mode = m;
    glide = null;
  };

  const clampLimit = (p: THREE.Vector3) => {
    const lx = p.x - world.limit.x;
    const lz = p.z - world.limit.z;
    const ld = Math.hypot(lx, lz);
    if (ld > world.limit.r) {
      p.x = world.limit.x + (lx / ld) * world.limit.r;
      p.z = world.limit.z + (lz / ld) * world.limit.r;
    }
  };

  const collide = (p: THREE.Vector3, pad: number, forWalk: boolean) => {
    for (const o of world.obstacles) {
      if (!forWalk && p.y > o.h + 1) continue;
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

  const update = (dt: number, now: number) => {
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
      camera.lookAt(controls.target);
      focusPt.copy(controls.target);
      return;
    }
    if (mode === 'walk') {
      const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      let fx = move.x;
      let fy = move.y;
      if (keys.has('KeyW') || keys.has('ArrowUp')) fy += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) fy -= 1;
      if (keys.has('KeyA')) fx -= 1;
      if (keys.has('KeyD')) fx += 1;
      if (keys.has('ArrowLeft')) yaw += dt * 1.8;
      if (keys.has('ArrowRight')) yaw -= dt * 1.8;
      const len = Math.hypot(fx, fy);
      if (len > 1) {
        fx /= len;
        fy /= len;
      }
      const speed = (run ? 9 : 4.5) * dt;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      camera.position.addScaledVector(fwd, fy * speed).addScaledVector(right, fx * speed);
      collide(camera.position, 0.5, true);
      camera.position.y = world.ground(camera.position.x, camera.position.z) + EYE;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      focusPt.copy(camera.position).addScaledVector(fwd, 8);
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

  return {
    controls,
    mode: () => mode,
    setMode,
    setWorld: (w) => {
      world = w;
    },
    setMove: (x, y) => move.set(x, y),
    glideTo: (cam, target, ms, done) => {
      if (mode === 'walk') setMode('orbit');
      if (reduceMotion) {
        camera.position.copy(cam instanceof THREE.Vector3 ? cam : cam.getPoint(1));
        controls.target.copy(target);
        camera.lookAt(target);
        done?.();
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
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
  };
}
