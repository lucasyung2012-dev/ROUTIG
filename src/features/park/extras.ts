/**
 * Gente de passagem e bichos do parque (fora dos 64 moradores): ciclistas, skatistas e corredores
 * dando voltas pelos caminhos, jardineiro regando os canteiros da praça, vendedores nos carrinhos de
 * pipoca e de coco, crianças no parquinho (balanço, escorregador, gangorra, areia, pega-pega) com os
 * pais no banco, pombos na praça (voam quando alguém chega perto), patos no lago e um gato de rua.
 * Tudo por hora do dia e clima: de noite e com chuva o parque esvazia.
 */
import { LAKE, PARK_SCALE, PLAY, PLAYGROUND, PLAY_ROT, POIS, heightAt, lakeRadiusAt, onPath, playAt, plazaCarts, type Point } from '@/domain/park';
import { routeBetween } from '@/domain/parkPeople';
import type { Figure } from './people';

export type ExtraSound = 'bikebell' | 'kid' | 'coo' | 'quack' | 'meow';

export interface Bird {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Bicando (cabeça para baixo, 0 a 1) e batida das asas (radianos). */
  peck: number;
  flap: number;
  flying: boolean;
}
export interface Duck {
  x: number;
  z: number;
  yaw: number;
  bob: number;
}
export interface Quad {
  kind: 'dog' | 'cat';
  x: number;
  y: number;
  z: number;
  yaw: number;
  phase: number;
  /** 0 parado, 1 andando, 2 trotando. */
  gait: number;
  sit: boolean;
  color: string;
  size: number;
  /** Ponta da guia na mão do dono (cachorros). */
  leash?: { x: number; y: number; z: number };
}

export interface Extras {
  step: (dt: number, hour: number, rain: number, viewer: Point, now: number) => void;
  visible: (from: Point, max: number, range: number) => Figure[];
  pigeons: () => Bird[];
  ducks: () => Duck[];
  cat: () => Quad | null;
  /** Ângulo de cada balanço (radianos) e inclinação da gangorra, para animar os brinquedos. */
  play: () => { swings: number[]; seesaw: number };
  skaters: () => Point[];
  sounds: () => Array<{ x: number; z: number; kind: ExtraSound }>;
}

const SHIRTS = ['#E11D48', '#2563EB', '#F59E0B', '#16A34A', '#7C3AED', '#0EA5E9', '#F97316', '#DB2777', '#FACC15', '#14B8A6'];
const PANTS = ['#1F2937', '#334155', '#1E3A8A', '#4B5563', '#7C2D12'];
const SKINS = ['#F1C9A5', '#E0AC86', '#C68863', '#A86F4C', '#8D5A3B', '#6B4229', '#F5D5B8'];
const HAIRS = ['#2F2A26', '#5A3B24', '#8A5A2B', '#1B1B1B', '#C9A063', '#3B2A20'];
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const look = (id: number, kid = false): Omit<Figure, 'x' | 'y' | 'z' | 'yaw' | 'pose' | 'phase' | 'stride' | 'scale'> => ({
  shirt: SHIRTS[Math.floor(hash(id) * SHIRTS.length)]!,
  pants: PANTS[Math.floor(hash(id + 1) * PANTS.length)]!,
  skin: SKINS[Math.floor(hash(id + 2) * SKINS.length)]!,
  hair: HAIRS[Math.floor(hash(id + 3) * HAIRS.length)]!,
  hairStyle: Math.floor(hash(id + 4) * 4),
  eyes: '#3B2A20',
  outfit: kid ? 'tee' : (['tee', 'shirt', 'sport', 'hoodie'] as const)[Math.floor(hash(id + 5) * 4)]!,
  accent: '#F4F4F5',
  shoes: ['#F5F5F4', '#2B2B2B', '#1E3A8A', '#B91C1C'][Math.floor(hash(id + 6) * 4)]!,
  shortSleeves: kid || hash(id + 7) < 0.5,
  shorts: kid ? hash(id + 8) < 0.7 : hash(id + 8) < 0.25,
  seed: id,
});
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const turn = (yaw: number, want: number, k: number) => yaw + angDiff(want, yaw) * Math.min(1, k);

interface Rider {
  id: number;
  kind: 'bike' | 'skate' | 'jog';
  route: Point[];
  ri: number;
  x: number;
  z: number;
  yaw: number;
  phase: number;
  speed: number;
  lane: number;
  bellCool: number;
  hours: [number, number];
}

export function createExtras(): Extras {
  const sounds: Array<{ x: number; z: number; kind: ExtraSound }> = [];
  // Circuito pelos caminhos (ida e volta pelos pontos de convivência), fechado.
  const stops = [[-78, 70], [0, -110], [110, 15], [5, 160], [-120, -10]].map(([x, z]) => ({ x: x! * PARK_SCALE, z: z! * PARK_SCALE }));
  const circuit: Point[] = [];
  stops.forEach((s, i) => {
    const r = routeBetween(s, stops[(i + 1) % stops.length]!);
    for (const p of r) if (!circuit.length || Math.hypot(circuit.at(-1)!.x - p.x, circuit.at(-1)!.z - p.z) > 0.5) circuit.push(p);
  });
  const reverse = [...circuit].reverse();
  const kinds: Array<[Rider['kind'], number, [number, number]]> = [
    ['bike', 4.6, [6, 20]],
    ['bike', 5.2, [7, 19]],
    ['bike', 4.2, [9, 21]],
    ['skate', 3.3, [9, 21]],
    ['skate', 3.0, [14, 22]],
    ['jog', 2.9, [5.5, 10]],
    ['jog', 2.6, [16, 21]],
    ['jog', 3.1, [6, 20]],
  ];
  const riders: Rider[] = kinds.map(([kind, speed, hours], i) => {
    const route = i % 2 ? reverse : circuit;
    const ri = Math.floor((i / kinds.length) * route.length);
    const p = route[ri]!;
    return { id: 300 + i, kind, route, ri, x: p.x, z: p.z, yaw: 0, phase: i, speed, lane: 0.7, bellCool: 0, hours };
  });

  // Jardineiro: de canteiro em canteiro da praça, regando cada um.
  const beds: Point[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.sin(a) * 21.5;
    const z = Math.cos(a) * 21.5;
    if (!onPath(x, z, 2.7)) beds.push({ x: Math.sin(a) * 24.4, z: Math.cos(a) * 24.4 });
  }
  const gardener = { x: beds[0]?.x ?? 20, z: beds[0]?.z ?? 0, yaw: 0, phase: 0, bed: 0, until: 0, walking: false };
  const carts = plazaCarts();

  // Parquinho: seis crianças trocando de brincadeira e dois adultos no banco.
  const kids = Array.from({ length: 6 }, (_, i) => ({ id: 400 + i, x: PLAYGROUND.x, z: PLAYGROUND.z, y: 0, yaw: 0, phase: i, pose: 'run' as Figure['pose'], scale: 0.56 + hash(400 + i) * 0.1, tx: 0, tz: 0, until: 0 }));
  const swings = [0, 0, 0];
  let seesaw = 0;

  // Pombos: bando no chão da praça.
  const pigeonList: Bird[] = Array.from({ length: 14 }, (_, i) => {
    const a = hash(500 + i) * Math.PI * 2;
    const r = 13 + hash(520 + i) * 5;
    return { x: Math.sin(a) * r, y: 0.06, z: Math.cos(a) * r, yaw: hash(540 + i) * 6.3, peck: 0, flap: 0, flying: false };
  });
  const flight = pigeonList.map(() => ({ t: 0, vx: 0, vz: 0, land: { x: 0, z: 0 }, cx: 0, cz: 0, r: 0, a: 0 }));
  let flockCool = 0;
  let cooAt = 0;
  // Patos: nadando devagar pelo lago, em fila solta.
  const duckList: Duck[] = Array.from({ length: 7 }, (_, i) => {
    const a = hash(600 + i) * Math.PI * 2;
    const r = lakeRadiusAt(a) * (0.35 + hash(610 + i) * 0.4);
    return { x: LAKE.x + Math.cos(a) * r, z: LAKE.z + Math.sin(a) * r, yaw: hash(620 + i) * 6.3, bob: i };
  });
  const duckTurn = duckList.map((_, i) => hash(630 + i) - 0.5);
  let quackAt = 0;
  // Gato de rua: perto do café da praça, anda, senta e se lambe.
  const cafe = POIS.find((p) => p.id === 'cafe-praca') ?? { x: 30, z: 30 };
  const catS: Quad & { tx: number; tz: number; until: number; meowCool: number } = { kind: 'cat', x: cafe.x + 4, y: 0, z: cafe.z + 3, yaw: 0, phase: 0, gait: 0, sit: true, color: '#E8A35C', size: 1, tx: cafe.x, tz: cafe.z, until: 0, meowCool: 0 };

  let hourNow = 12;
  let rainNow = 0;
  const step: Extras['step'] = (dt, hour, rain, viewer, now) => {
    hourNow = hour;
    rainNow = rain;
    sounds.length = 0;
    const t = now / 1000;
    // Ciclistas, skatistas e corredores: seguem o circuito pela direita; desviam de quem está na frente.
    for (const r of riders) {
      if (!active(r)) continue;
      const target = r.route[r.ri]!;
      const dx = target.x - r.x;
      const dz = target.z - r.z;
      const d = Math.hypot(dx, dz);
      const dv = Math.hypot(viewer.x - r.x, viewer.z - r.z);
      const ahead = dv < 9 && Math.cos(angDiff(Math.atan2(viewer.x - r.x, viewer.z - r.z), r.yaw)) > 0.6;
      const sp = r.speed * (ahead && dv < 3 ? 0.4 : 1);
      if (d < sp * dt + 0.1) r.ri = (r.ri + 1) % r.route.length;
      else {
        r.x += (dx / d) * sp * dt;
        r.z += (dz / d) * sp * dt;
        r.yaw = turn(r.yaw, Math.atan2(dx, dz), dt * 5);
      }
      r.lane += ((ahead ? 1.5 : 0.7) - r.lane) * Math.min(1, dt * 3);
      r.phase += dt * (r.kind === 'bike' ? sp * 2.2 : r.kind === 'skate' ? 2.4 : (sp * Math.PI * 2) / (0.9 + 0.45 * sp));
      if (r.kind === 'bike' && ahead && dv < 8 && now > r.bellCool) {
        r.bellCool = now + 9000;
        sounds.push({ x: r.x, z: r.z, kind: 'bikebell' });
      }
    }
    // Jardineiro.
    const day = hour > 8 && hour < 16.5 && rain < 0.2;
    if (day && beds.length) {
      const bed = beds[gardener.bed % beds.length]!;
      const dx = bed.x - gardener.x;
      const dz = bed.z - gardener.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        gardener.walking = true;
        gardener.x += (dx / d) * Math.min(d, 1.2 * dt);
        gardener.z += (dz / d) * Math.min(d, 1.2 * dt);
        gardener.yaw = turn(gardener.yaw, Math.atan2(dx, dz), dt * 5);
        gardener.phase += dt * 5.2;
        gardener.until = now + 9000;
      } else {
        gardener.walking = false;
        // De frente para o canteiro (que fica para dentro da praça).
        gardener.yaw = turn(gardener.yaw, Math.atan2(-bed.x, -bed.z), dt * 3);
        gardener.phase += dt * 2;
        if (now > gardener.until) gardener.bed++;
      }
    }
    // Parquinho: cada criança muda de brincadeira a cada ~25 s.
    const playOn = hour > 8 && hour < 18.5 && rain < 0.15;
    const occupied = [false, false, false];
    let seesawKids = 0;
    kids.forEach((k, i) => {
      if (!playOn) return;
      const role = (i + Math.floor(t / 25 + hash(i) * 3)) % 5;
      const ground = heightAt(k.x, k.z);
      k.y = ground;
      if (role === 0 && !occupied[i % 3]) {
        // Balanço: sobe e desce no arco da corrente, pernas no ritmo.
        const s = i % 3;
        occupied[s] = true;
        const amp = 0.55 + hash(i + 7) * 0.2;
        const ang = Math.sin(t * 2.2 + i) * amp;
        swings[s] = ang;
        const sw = PLAY.swings;
        const lx = sw.x + (s - 1) * sw.gap;
        const p = playAt(lx, sw.z + Math.sin(ang) * sw.chain);
        k.x = p.x;
        k.z = p.z;
        k.y = heightAt(p.x, p.z) + sw.top - Math.cos(ang) * sw.chain - 0.05 - 0.53 * k.scale;
        k.yaw = PLAY_ROT;
        k.pose = 'swing';
        k.phase = t * 2.2 + i;
        return;
      }
      if (role === 1) {
        // Escorregador: sobe a escada, senta lá em cima e desce escorregando; dá a volta correndo.
        const sl = PLAY.slide;
        const cyc = (t + i * 1.7) % 7;
        const foot = playAt(sl.x, sl.z - 1.6);
        const top = playAt(sl.x, sl.z - 0.5);
        const end = playAt(sl.x, sl.z + sl.len);
        if (cyc < 1.6) {
          const q = cyc / 1.6;
          k.x = foot.x + (top.x - foot.x) * q * 0.4;
          k.z = foot.z + (top.z - foot.z) * q * 0.4;
          k.y = heightAt(k.x, k.z) + q * sl.h;
          k.pose = 'walk';
          k.yaw = PLAY_ROT;
          k.phase += dt * 9;
        } else if (cyc < 2.6) {
          k.x = top.x;
          k.z = top.z;
          k.y = heightAt(k.x, k.z) + sl.h + 0.05 - 0.53 * k.scale + 0.5;
          k.pose = 'sit';
          k.yaw = PLAY_ROT;
        } else if (cyc < 3.8) {
          const q = (cyc - 2.6) / 1.2;
          const e = q * q;
          k.x = top.x + (end.x - top.x) * e;
          k.z = top.z + (end.z - top.z) * e;
          k.y = heightAt(k.x, k.z) + (sl.h + 0.55) * (1 - e) + 0.3 * e - 0.53 * k.scale + 0.05;
          k.pose = 'sit';
          k.yaw = PLAY_ROT;
          if (q < 0.05 && Math.random() < 0.3) sounds.push({ x: k.x, z: k.z, kind: 'kid' });
        } else {
          // Volta correndo pela lateral até a escada.
          const q = (cyc - 3.8) / 3.2;
          const mid = playAt(sl.x + 2, sl.z + 1);
          const a = q < 0.5 ? end : mid;
          const b = q < 0.5 ? mid : foot;
          const qq = (q % 0.5) * 2;
          k.x = a.x + (b.x - a.x) * qq;
          k.z = a.z + (b.z - a.z) * qq;
          k.y = heightAt(k.x, k.z);
          k.yaw = Math.atan2(b.x - a.x, b.z - a.z);
          k.pose = 'run';
          k.phase += dt * 11;
        }
        return;
      }
      if (role === 4 && seesawKids < 2) {
        // Gangorra: um em cada ponta, sobe e desce.
        const ss = PLAY.seesaw;
        const side = seesawKids++ ? 1 : -1;
        seesaw = Math.sin(t * 1.6) * 0.28;
        const lx = ss.x + side * (ss.len / 2 - 0.3);
        const p = playAt(lx, ss.z);
        k.x = p.x;
        k.z = p.z;
        k.y = heightAt(p.x, p.z) + 0.45 + side * Math.sin(seesaw) * (ss.len / 2 - 0.3) - 0.53 * k.scale + 0.1;
        k.yaw = PLAY_ROT + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        k.pose = 'sit';
        return;
      }
      if (role === 3) {
        // Caixa de areia: sentado brincando (mãos mexendo).
        const sd = PLAY.sand;
        const p = playAt(sd.x + (hash(i + 30) - 0.5) * 2.4, sd.z + (hash(i + 31) - 0.5) * 1.8);
        k.x = p.x;
        k.z = p.z;
        k.y = heightAt(p.x, p.z) + 0.12 - 0.42 * k.scale;
        k.yaw = PLAY_ROT + hash(i + 32) * 6;
        k.pose = 'draw';
        k.phase += dt * 3;
        return;
      }
      // Pega-pega: correm entre pontos do parquinho.
      if (now > k.until || Math.hypot(k.tx - k.x, k.tz - k.z) < 0.4) {
        const p = playAt((hash(now * 0.001 + i) - 0.5) * 12, (hash(now * 0.0013 + i * 3) - 0.5) * 10);
        k.tx = p.x;
        k.tz = p.z;
        k.until = now + 4000;
        if (Math.random() < 0.35) sounds.push({ x: k.x, z: k.z, kind: 'kid' });
      }
      const dx = k.tx - k.x;
      const dz = k.tz - k.z;
      const d = Math.hypot(dx, dz) || 1;
      k.x += (dx / d) * 3 * dt;
      k.z += (dz / d) * 3 * dt;
      k.yaw = turn(k.yaw, Math.atan2(dx, dz), dt * 8);
      k.pose = 'run';
      k.phase += dt * 11;
    });
    for (let s = 0; s < 3; s++) if (!occupied[s]) swings[s] = (swings[s] ?? 0) * Math.max(0, 1 - dt * 0.6);
    if (!seesawKids) seesaw *= Math.max(0, 1 - dt);

    // Pombos: bicam o chão andando aos pouquinhos; se alguém chega perto, o bando voa, dá uma volta e pousa em outro lugar.
    const near = pigeonList.some((b) => !b.flying && Math.hypot(b.x - viewer.x, b.z - viewer.z) < 3.2);
    if (near && now > flockCool) {
      flockCool = now + 9000;
      const cx = pigeonList.reduce((s, b) => s + b.x, 0) / pigeonList.length;
      const cz = pigeonList.reduce((s, b) => s + b.z, 0) / pigeonList.length;
      pigeonList.forEach((b, i) => {
        const f = flight[i]!;
        b.flying = true;
        f.t = 0;
        f.cx = cx;
        f.cz = cz;
        f.r = 6 + hash(i + now) * 6;
        f.a = Math.atan2(b.z - cz, b.x - cx);
        const la = hash(i * 3 + now) * Math.PI * 2;
        const lr = 11 + hash(i * 5 + now) * 7;
        f.land = { x: Math.sin(la) * lr, z: Math.cos(la) * lr };
      });
    }
    pigeonList.forEach((b, i) => {
      const f = flight[i]!;
      if (b.flying) {
        f.t += dt;
        const T = 7 + (i % 3);
        const q = f.t / T;
        if (q >= 1) {
          b.flying = false;
          b.y = 0.06;
          b.x = f.land.x;
          b.z = f.land.z;
          return;
        }
        // Sobe em espiral, circula e desce até o ponto de pouso.
        f.a += dt * 1.1;
        const ox = f.cx + Math.cos(f.a) * f.r;
        const oz = f.cz + Math.sin(f.a) * f.r;
        const w = q < 0.75 ? 0 : (q - 0.75) / 0.25;
        const nx = ox + (f.land.x - ox) * w;
        const nz = oz + (f.land.z - oz) * w;
        b.yaw = Math.atan2(nx - b.x, nz - b.z);
        b.x = nx;
        b.z = nz;
        b.y = 0.06 + Math.sin(Math.min(1, q * 1.4) * Math.PI) * (5 + (i % 4)) * (1 - w * 0.2);
        b.flap += dt * 26;
        b.peck = 0;
        return;
      }
      // No chão: bica (cabeça desce) e dá passinhos.
      const cyc = (t * 0.9 + i * 0.37) % 3;
      b.peck = cyc < 0.25 ? Math.sin((cyc / 0.25) * Math.PI) : 0;
      if (cyc > 1.6 && cyc < 2.1) {
        b.x += Math.sin(b.yaw) * dt * 0.35;
        b.z += Math.cos(b.yaw) * dt * 0.35;
        if (Math.hypot(b.x, b.z) < 9 || Math.hypot(b.x, b.z) > 23) b.yaw += Math.PI * dt * 2;
      }
      if (cyc > 2.9) b.yaw += (hash(i + Math.floor(t)) - 0.5) * dt * 4;
      b.flap = 0;
    });
    if (Math.hypot(viewer.x, viewer.z) < 30 && now > cooAt) {
      cooAt = now + 4000 + Math.random() * 6000;
      const b = pigeonList[Math.floor(Math.random() * pigeonList.length)]!;
      if (!b.flying) sounds.push({ x: b.x, z: b.z, kind: 'coo' });
    }
    // Patos: nadam devagar, viram aos poucos e voltam quando chegam perto da margem.
    duckList.forEach((dk, i) => {
      const a = Math.atan2(dk.z - LAKE.z, dk.x - LAKE.x);
      const rr = Math.hypot(dk.x - LAKE.x, dk.z - LAKE.z);
      if (rr > lakeRadiusAt(a) - 5) dk.yaw = turn(dk.yaw, Math.atan2(LAKE.x - dk.x, LAKE.z - dk.z), dt * 1.2);
      else dk.yaw += duckTurn[i]! * dt * 0.25 + Math.sin(t * 0.2 + i) * dt * 0.1;
      const sp = 0.35 + (i % 3) * 0.08;
      dk.x += Math.sin(dk.yaw) * sp * dt;
      dk.z += Math.cos(dk.yaw) * sp * dt;
      dk.bob = t * 1.4 + i;
    });
    const dl = Math.hypot(viewer.x - LAKE.x, viewer.z - LAKE.z) - lakeRadiusAt(Math.atan2(viewer.z - LAKE.z, viewer.x - LAKE.x));
    if (dl < 30 && now > quackAt) {
      quackAt = now + 5000 + Math.random() * 9000;
      const dk = duckList[Math.floor(Math.random() * duckList.length)]!;
      sounds.push({ x: dk.x, z: dk.z, kind: 'quack' });
    }
    // Gato: anda até um ponto perto do café, senta e se lambe; mia para quem chega bem perto.
    if (now > catS.until) {
      if (catS.sit) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 7;
        catS.tx = cafe.x + Math.cos(a) * r;
        catS.tz = cafe.z + Math.sin(a) * r;
        catS.sit = false;
      } else {
        catS.sit = true;
        catS.until = now + 6000 + Math.random() * 10000;
      }
    }
    if (!catS.sit) {
      const dx = catS.tx - catS.x;
      const dz = catS.tz - catS.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) catS.until = 0;
      else {
        catS.x += (dx / d) * 0.8 * dt;
        catS.z += (dz / d) * 0.8 * dt;
        catS.yaw = turn(catS.yaw, Math.atan2(dx, dz), dt * 4);
        catS.phase += dt * 7;
      }
      catS.gait = 1;
    } else {
      catS.gait = 0;
      catS.phase += dt * 2;
    }
    catS.y = heightAt(catS.x, catS.z);
    if (Math.hypot(viewer.x - catS.x, viewer.z - catS.z) < 3 && now > catS.meowCool) {
      catS.meowCool = now + 12000;
      sounds.push({ x: catS.x, z: catS.z, kind: 'meow' });
    }
  };

  const active = (r: Rider) => hourNow >= r.hours[0] && hourNow < r.hours[1] && rainNow < 0.2;

  const visible: Extras['visible'] = (from, max, range) => {
    const out: Array<{ f: Figure; d: number }> = [];
    const add = (f: Figure) => {
      const d = Math.hypot(f.x - from.x, f.z - from.z);
      if (d < range) out.push({ f, d });
    };
    for (const r of riders) {
      if (!active(r)) continue;
      // Pela direita do caminho (faixa), mais para o lado quando há alguém na frente.
      const x = r.x + Math.cos(r.yaw) * -r.lane;
      const z = r.z - Math.sin(r.yaw) * -r.lane;
      const base = look(r.id);
      add({
        ...base,
        x,
        y: heightAt(x, z),
        z,
        yaw: r.yaw,
        pose: r.kind === 'bike' ? 'bike' : r.kind === 'skate' ? 'skate' : 'run',
        phase: r.phase,
        stride: 1,
        scale: 0.95 + hash(r.id) * 0.08,
        outfit: r.kind === 'jog' ? 'sport' : base.outfit,
        shorts: r.kind === 'jog' ? true : base.shorts,
        hat: r.kind === 'bike' ? 1 : r.kind === 'skate' ? 2 : 0,
        hatColor: '#1F2937',
        gear: r.kind === 'bike' ? ['#1F6FB2', '#B91C1C', '#111827'][r.id % 3] : '#B45309',
        expr: 'neutral',
      });
    }
    const day = hourNow > 8 && hourNow < 16.5 && rainNow < 0.2;
    if (day && beds.length)
      add({
        ...look(350),
        outfit: 'shirt',
        shirt: '#4D7C0F',
        pants: '#3F3F46',
        accent: '#365314',
        hat: 1,
        hatColor: '#A3A3A3',
        shoes: '#3F2A1D',
        x: gardener.x,
        y: heightAt(gardener.x, gardener.z),
        z: gardener.z,
        yaw: gardener.yaw,
        pose: gardener.walking ? 'walk' : 'water',
        phase: gardener.phase,
        stride: 1,
        scale: 1,
        gear: '#16A34A',
        expr: 'neutral',
      });
    // Vendedores nos carrinhos (das 9h às 20h, sem chuva).
    if (hourNow > 9 && hourNow < 20 && rainNow < 0.2)
      carts.forEach((c, i) => {
        const r = 10.9;
        const x = Math.sin(c.face) * r;
        const z = Math.cos(c.face) * r;
        add({ ...look(360 + i), outfit: 'shirt', shirt: i ? '#F8FAFC' : '#DC2626', accent: '#FFFFFF', hat: 1, hatColor: i ? '#16A34A' : '#F8FAFC', x, y: heightAt(x, z), z, yaw: c.face, pose: 'stand', phase: performance.now() / 600 + i, stride: 0, scale: 1, expr: Math.floor(performance.now() / 5000 + i) % 3 === 0 ? 'smile' : 'neutral' });
      });
    const playOn = hourNow > 8 && hourNow < 18.5 && rainNow < 0.15;
    if (playOn) {
      kids.forEach((k) => add({ ...look(k.id, true), x: k.x, y: k.y, z: k.z, yaw: k.yaw, pose: k.pose, phase: k.phase, stride: 1, scale: k.scale, expr: k.pose === 'run' || k.pose === 'swing' ? 'laugh' : 'smile' }));
      PLAY.benches.forEach((b, i) => {
        const p = playAt(b.x, b.z);
        add({ ...look(380 + i), x: p.x, y: heightAt(p.x, p.z), z: p.z, yaw: PLAY_ROT + b.face, pose: i ? 'sit' : 'read', phase: performance.now() / 700, stride: 0, scale: 1, expr: 'smile' });
      });
    }
    return out
      .sort((a, b) => a.d - b.d)
      .slice(0, max)
      .map((o) => o.f);
  };

  return {
    step,
    visible,
    pigeons: () => pigeonList,
    ducks: () => duckList,
    cat: () => catS,
    play: () => ({ swings, seesaw }),
    skaters: () => riders.filter((r) => r.kind === 'skate' && active(r)).map((r) => ({ x: r.x, z: r.z })),
    sounds: () => sounds,
  };
}
