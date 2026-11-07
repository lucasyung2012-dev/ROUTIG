/**
 * Portas de entrada dos prédios: portas de vidro de correr com sensor (abrem quando alguém chega
 * perto e fecham depois) e, nos jardins, portões de ferro de duas folhas sob um pórtico de pedra.
 * A porta fica rente à fachada, no ponto da entrada (achado por raios contra o próprio prédio).
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { heightAt } from '@/domain/park';
import { FORMS } from './forms';
import { Builder, type Kit } from './kit';
import type { PlacedBuilding } from './world';

export interface Portal {
  id: ModuleId;
  /** Centro do vão, no chão. */
  x: number;
  y: number;
  z: number;
  /** Para fora do prédio (ângulo em y; 0 = +z). */
  facing: number;
  kind: 'slide' | 'gate';
  open: number;
}

export interface EntryDoors {
  group: THREE.Group;
  portals: Map<ModuleId, Portal>;
  /** Abre para quem está perto (visitante e moradores); devolve as portas que começaram a abrir. */
  tick: (dt: number, near: Array<{ x: number; z: number }>) => Portal[];
  /** Mantém aberta (entrando ou saindo). */
  hold: (id: ModuleId, on: boolean) => void;
  openNow: (id: ModuleId) => void;
}

const W = 2.4;
const H = 2.5;

/** Fachada na frente da entrada: o primeiro ponto do prédio largo e alto (não poste nem floreira). */
function findFacade(b: PlacedBuilding): { x: number; z: number; y: number } | null {
  b.group.updateMatrixWorld(true);
  const out = new THREE.Vector3(Math.sin(b.facing), 0, Math.cos(b.facing));
  const side = new THREE.Vector3(out.z, 0, -out.x);
  const start = (lift: number, lateral: number) => {
    const g = heightAt(b.entrance.x, b.entrance.z);
    return new THREE.Vector3(b.entrance.x, g + lift, b.entrance.z).addScaledVector(out, 6).addScaledVector(side, lateral);
  };
  const ray = new THREE.Raycaster();
  const solid = (h: THREE.Intersection) => {
    const m = (h.object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m || !(h.object as THREE.Mesh).isMesh) return false;
    return (Array.isArray(m) ? m : [m]).some((x) => x.visible && !(x.transparent && x.opacity < 0.1)) && !h.object.userData.noCollide;
  };
  const hits = (lift: number, lateral: number) => {
    ray.set(start(lift, lateral), out.clone().negate());
    ray.far = b.def.radius * 1.6;
    return ray.intersectObject(b.group, true).filter(solid).map((h) => h.distance);
  };
  const center = hits(1.3, 0);
  const near = (list: number[], d: number) => list.some((x) => Math.abs(x - d) < 0.8);
  const high = hits(2.7, 0);
  const left = hits(1.3, -1.1);
  const right = hits(1.3, 1.1);
  for (const d of center) {
    if (near(high, d) && near(left, d) && near(right, d)) {
      const p = start(0, 0).addScaledVector(out, -d + 0.05);
      return { x: p.x, z: p.z, y: heightAt(p.x, p.z) };
    }
  }
  return null;
}

export function entryDoors(kit: Kit, buildings: Map<ModuleId, PlacedBuilding>, has: (id: ModuleId) => boolean): EntryDoors {
  const group = new THREE.Group();
  const portals = new Map<ModuleId, Portal>();
  const leaves = new Map<ModuleId, THREE.Object3D[]>();
  const holds = new Set<ModuleId>();
  const metal = kit.mat('#3B4452', { metal: 0.75, rough: 0.3 });
  const steel = kit.mat('#C9CED6', { metal: 0.85, rough: 0.25 });
  const glass = kit.mat('#BFE0F0', { glass: true });
  const matM = kit.mat('#2E3338', { rough: 0.95 });
  const stone = kit.mat('#CFC6B4', { rough: 0.9 });
  const capM = kit.mat('#B8AE99', { rough: 0.85 });
  const iron = kit.mat('#23272E', { metal: 0.6, rough: 0.45 });
  const wood = kit.mat('#8B6545', { rough: 0.8 });
  const leaf = kit.mat('#4C8F45', { rough: 0.95 });
  // Lobby iluminado visto pelo vão (luz quente lá dentro).
  const lobby = kit.own(new THREE.MeshBasicMaterial({ color: '#FFF0D2' }));
  const lobbyGeo = kit.own(new THREE.PlaneGeometry(W, H));

  buildings.forEach((b, id) => {
    if (!has(id)) return;
    const garden = FORMS[id]?.plan === 'garden';
    const at = findFacade(b) ?? { x: b.entrance.x, z: b.entrance.z, y: heightAt(b.entrance.x, b.entrance.z) };
    const root = new THREE.Group();
    root.position.set(at.x, at.y, at.z);
    root.rotation.y = b.facing;
    const bd = new Builder();
    const doorLeaves: THREE.Object3D[] = [];
    if (!garden) {
      // Batentes, travessa com faixa de luz na cor do prédio, sensor e soleira; capacho na frente.
      for (const s of [-1, 1]) bd.add(metal, new THREE.BoxGeometry(0.14, H + 0.4, 0.24), [s * (W / 2 + 0.07), (H + 0.4) / 2, 0.04]);
      bd.add(metal, new THREE.BoxGeometry(W + 0.42, 0.42, 0.28), [0, H + 0.21, 0.04]);
      bd.add(kit.mat(b.def.color, { glow: true }), new THREE.BoxGeometry(W * 0.7, 0.08, 0.02), [0, H + 0.22, 0.19]);
      bd.add(steel, new THREE.BoxGeometry(0.24, 0.06, 0.1), [0, H - 0.04, 0.12]);
      bd.add(kit.mat('#EF4444', { glow: true }), new THREE.SphereGeometry(0.012, 6, 4), [0.08, H - 0.07, 0.17]);
      bd.add(steel, new THREE.BoxGeometry(W + 0.3, 0.03, 0.5), [0, 0.015, 0.04]);
      bd.add(matM, new THREE.BoxGeometry(2.2, 0.02, 1.3), [0, 0.01, 0.95]);
      const glow = new THREE.Mesh(lobbyGeo, lobby);
      glow.position.set(0, H / 2, -0.02);
      root.add(glow);
      // Duas folhas de vidro com caixilho fino e puxador vertical.
      for (const s of [-1, 1]) {
        const lb = new Builder();
        lb.add(glass, new THREE.BoxGeometry(W / 2 - 0.02, H - 0.08, 0.025), [0, H / 2, 0]);
        for (const y of [0.04, H - 0.04]) lb.add(steel, new THREE.BoxGeometry(W / 2, 0.06, 0.05), [0, y, 0]);
        for (const x of [-1, 1]) lb.add(steel, new THREE.BoxGeometry(0.05, H, 0.05), [x * (W / 4 - 0.025), H / 2, 0]);
        lb.add(steel, new THREE.CylinderGeometry(0.014, 0.014, 0.9, 8), [-s * (W / 4 - 0.12), 1.05, 0.05]);
        const leafG = lb.build();
        leafG.position.set(s * (W / 4), 0, 0.07);
        leafG.userData.side = s;
        root.add(leafG);
        doorLeaves.push(leafG);
      }
    } else {
      // Pórtico de jardim: pilares de pedra com capitel, viga de madeira com trepadeira e
      // portão de ferro de duas folhas que abre para dentro.
      for (const s of [-1, 1]) {
        bd.add(stone, new THREE.BoxGeometry(0.5, 2.5, 0.5), [s * (W / 2 + 0.25), 1.25, 0]);
        bd.add(capM, new THREE.BoxGeometry(0.62, 0.14, 0.62), [s * (W / 2 + 0.25), 2.57, 0]);
        bd.add(iron, new THREE.SphereGeometry(0.1, 10, 8), [s * (W / 2 + 0.25), 2.74, 0]);
      }
      bd.add(wood, new THREE.BoxGeometry(W + 1.4, 0.22, 0.32), [0, 2.95, 0]);
      for (let k = 0; k < 7; k++) bd.add(wood, new THREE.BoxGeometry(0.12, 0.12, 0.9), [-W / 2 - 0.4 + k * ((W + 0.8) / 6), 3.12, 0]);
      for (let k = 0; k < 14; k++) bd.add(leaf, new THREE.IcosahedronGeometry(0.16 + (k % 3) * 0.05, 1), [-W / 2 - 0.5 + k * 0.27, 3.15 + Math.sin(k * 1.7) * 0.08, Math.cos(k * 2.3) * 0.25]);
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) bd.add(leaf, new THREE.IcosahedronGeometry(0.13, 1), [s * (W / 2 + 0.52), 2.6 - k * 0.5, 0.12 + Math.sin(k) * 0.06]);
      for (const s of [-1, 1]) {
        const lb = new Builder();
        const w = W / 2 - 0.04;
        // Folha com o eixo na dobradiça: barras verticais com ponteiras, travessas e arabesco.
        for (const y of [0.15, 0.95, 1.6]) lb.add(iron, new THREE.BoxGeometry(w, 0.04, 0.04), [-s * w / 2, y, 0]);
        for (let k = 0; k <= 8; k++) {
          const x = -s * (0.03 + (k / 8) * (w - 0.06));
          lb.add(iron, new THREE.CylinderGeometry(0.013, 0.013, 1.62, 6), [x, 0.88, 0]);
          lb.add(iron, new THREE.ConeGeometry(0.025, 0.08, 6), [x, 1.73, 0]);
        }
        lb.add(iron, new THREE.TorusGeometry(0.16, 0.012, 6, 18), [-s * w / 2, 1.28, 0]);
        lb.add(steel, new THREE.BoxGeometry(0.03, 0.12, 0.06), [-s * (w - 0.05), 1.0, 0.04]);
        const leafG = lb.build();
        leafG.position.set(s * (W / 2), 0, 0);
        leafG.userData.side = s;
        root.add(leafG);
        doorLeaves.push(leafG);
      }
      bd.add(kit.mat('#B5A88E', { rough: 0.95 }), new THREE.BoxGeometry(W + 1.4, 0.03, 1.4), [0, 0.015, 0]);
    }
    root.add(bd.build());
    root.traverse((o) => (o.userData.noCollide = true));
    group.add(root);
    portals.set(id, { id, x: at.x, y: at.y, z: at.z, facing: b.facing, kind: garden ? 'gate' : 'slide', open: 0 });
    leaves.set(id, doorLeaves);
  });

  const apply = (p: Portal) => {
    const e = p.open < 0.5 ? 2 * p.open * p.open : 1 - (-2 * p.open + 2) ** 2 / 2;
    for (const l of leaves.get(p.id) ?? []) {
      const s = l.userData.side as number;
      if (p.kind === 'slide') l.position.x = s * (W / 4 + e * (W / 2 - 0.06));
      else l.rotation.y = s * -e * 1.75;
    }
  };

  return {
    group,
    portals,
    tick: (dt, near) => {
      const started: Portal[] = [];
      portals.forEach((p) => {
        const want = holds.has(p.id) || near.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 4.2) ? 1 : 0;
        if (want === 1 && p.open < 0.02) started.push(p);
        const speed = p.kind === 'slide' ? 2.2 : 1.4;
        p.open = want > p.open ? Math.min(1, p.open + dt * speed) : Math.max(0, p.open - dt * speed * 0.7);
        apply(p);
      });
      return started;
    },
    hold: (id, on) => void (on ? holds.add(id) : holds.delete(id)),
    openNow: (id) => {
      const p = portals.get(id);
      if (!p) return;
      p.open = 1;
      apply(p);
    },
  };
}
