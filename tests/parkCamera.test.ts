import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createCameraRig, type CameraWorld } from '@/features/park/camera';

const flat: CameraWorld = { ground: () => 0, obstacles: [{ x: 0, z: -20, r: 4, h: 10 }], limit: { x: 0, z: 0, r: 200 }, ceiling: Infinity, minDistance: 2, maxDistance: 100, blocked: (x) => x > 30 };

function setup() {
  const camera = new PerspectiveCamera(55, 1, 0.1, 1000);
  const rig = createCameraRig(camera, document.createElement('canvas'), true);
  rig.setWorld(flat);
  rig.setMode('walk');
  rig.place(0, 0, 0);
  let t = 0;
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) rig.update(1 / 60, (t += 1000 / 60));
  };
  return { camera, rig, run };
}

describe('parque V2.1: câmera e movimento', () => {
  it('primeira pessoa: olhos a 1,70 m; anda para a frente com aceleração suave', () => {
    const { camera, rig, run } = setup();
    run(0.1);
    expect(camera.position.y).toBeCloseTo(1.7, 2);
    rig.setMove(0, 1);
    run(0.1);
    const early = rig.body().speed;
    run(1);
    const top = rig.body().speed;
    expect(early).toBeLessThan(top * 0.75);
    expect(top).toBeGreaterThan(2.3);
    expect(top).toBeLessThan(2.7);
    // yaw 0 = olhando para -z
    expect(camera.position.z).toBeLessThan(-2);
    rig.setMove(0, 0);
    run(1);
    expect(rig.body().speed).toBeLessThan(0.05);
  });

  it('correr (7,5 m/s) é bem mais rápido que andar (2,5 m/s); velocidade ajustável nas opções', () => {
    const { rig, run } = setup();
    rig.setRun(true);
    rig.setMove(1, 0);
    run(1.5);
    expect(rig.body().speed).toBeGreaterThan(7);
    rig.setSettings({ sensitivity: 1, speed: 0.6, invertY: false });
    run(1.5);
    expect(rig.body().speed).toBeLessThan(4.6);
  });

  it('pulo moderado (até ~0,55 m) e volta ao chão', () => {
    const { rig, run } = setup();
    rig.jump();
    let max = 0;
    for (let i = 0; i < 90; i++) {
      run(1 / 60);
      max = Math.max(max, rig.body().pos.y);
    }
    expect(max).toBeGreaterThan(0.4);
    expect(max).toBeLessThan(0.65);
    expect(rig.body().pos.y).toBe(0);
    expect(rig.body().airborne).toBe(false);
  });

  it('não atravessa prédios nem entra na água', () => {
    const { rig, run } = setup();
    rig.setMove(0, 1);
    run(8);
    // Obstáculo em z = -20 com raio 4: para antes dele.
    expect(Math.hypot(rig.body().pos.x, rig.body().pos.z + 20)).toBeGreaterThanOrEqual(4.4);
    rig.place(25, 0, -Math.PI / 2);
    rig.setMove(0, 1);
    run(5);
    expect(rig.body().pos.x).toBeLessThanOrEqual(30);
  });

  it('sentar e levantar: olhos na altura de quem está sentado; andar levanta', () => {
    const { camera, rig, run } = setup();
    rig.sit({ x: 3, y: 0.45, z: 3, face: 0 });
    run(0.2);
    expect(rig.posture()).toBe('sit');
    expect(camera.position.y).toBeCloseTo(1.23, 2);
    rig.setMove(0, 1);
    run(0.2);
    expect(rig.posture()).toBe('stand');
  });

  it('terceira pessoa: câmera atrás e acima da cabeça, sem entrar no prédio', () => {
    const { camera, rig, run } = setup();
    rig.setMode('third');
    run(1);
    const b = rig.body().pos;
    const d = Math.hypot(camera.position.x - b.x, camera.position.z - b.z);
    expect(d).toBeGreaterThan(2.5);
    expect(camera.position.y).toBeGreaterThan(1.7);
    // Atrás = +z quando se olha para -z.
    expect(camera.position.z).toBeGreaterThan(b.z);
  });
});
