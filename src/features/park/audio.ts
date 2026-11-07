/**
 * Som espacial do parque (V2.1, seção 16): fontes posicionadas no mundo (lago, lagos ornamentais,
 * fonte, pássaros nas árvores, roda de música no palco), clima em volta (vento e chuva) e passos.
 * Tudo sintetizado no aparelho com Web Audio, no mesmo contexto de áudio do Focus (sem abrir outro).
 * Dentro dos prédios o som de fora fica abafado. Volume por categoria e silenciar.
 */
import type * as THREE from 'three';
import { LAKE, POIS, PONDS, lakeRadiusAt } from '@/domain/park';
import { sound } from '@/features/focus/sound';
import type { Sky } from './world';
import type { Timbre } from './interiors/things';

export const AUDIO_CATS = ['nature', 'water', 'weather', 'music', 'steps'] as const;
export type AudioCat = (typeof AUDIO_CATS)[number];
export type AudioMix = { master: number; muted: boolean } & Record<AudioCat, number>;
export const DEFAULT_MIX: AudioMix = { master: 0.7, muted: false, nature: 0.8, water: 0.7, weather: 0.7, music: 0.6, steps: 0.5 };

export interface AudioInfo {
  listener: THREE.Camera;
  inside: boolean;
  hour: number;
  sky: Sky;
  /** Velocidade de quem anda (passos); 0 parado. */
  steps: number;
}

export interface ParkAudio {
  update: (info: AudioInfo, dt: number) => void;
  setMix: (m: AudioMix) => void;
  /** Instrumentos e objetos dos interiores: uma nota (MIDI) num timbre, daqui a `delay` segundos. */
  note: (midi: number, timbre: Timbre, delay?: number) => void;
  dispose: () => void;
}

const STAGE = POIS.find((p) => p.id === 'palco-musica')!;

/** Cria o som do parque; null se o aparelho não tiver Web Audio ou o som ainda não foi liberado por um toque. */
export function createParkAudio(mix: AudioMix): ParkAudio | null {
  sound.unlock();
  const ctx = sound.context;
  if (!ctx) return null;
  const white = sound.noise('white');
  const brown = sound.noise('brown');
  const pink = sound.noise('pink');
  if (!white || !brown || !pink) return null;
  const now = () => ctx.currentTime;
  const nodes: AudioNode[] = [];
  const keep = <T extends AudioNode>(n: T) => (nodes.push(n), n);

  // Barramento: categorias → abafador (interiores) → volume geral → saída.
  const master = keep(ctx.createGain());
  const muffle = keep(ctx.createBiquadFilter());
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  muffle.connect(master);
  master.connect(ctx.destination);
  const cat = Object.fromEntries(
    AUDIO_CATS.map((c) => {
      const g = keep(ctx.createGain());
      g.connect(c === 'steps' ? master : muffle);
      return [c, g];
    }),
  ) as Record<AudioCat, GainNode>;

  const loop = (buf: AudioBuffer, out: AudioNode, filter?: (f: BiquadFilterNode) => void) => {
    const src = keep(ctx.createBufferSource());
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const g = keep(ctx.createGain());
    g.gain.value = 0;
    if (filter) {
      const f = keep(ctx.createBiquadFilter());
      filter(f);
      src.connect(f).connect(g);
    } else src.connect(g);
    g.connect(out);
    src.start(now() + Math.random() * 0.5);
    return g;
  };
  const panner = (x: number, y: number, z: number, ref: number, out: AudioNode, persist = true) => {
    const p = ctx.createPanner();
    if (persist) keep(p);
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 400;
    p.rolloffFactor = 1.4;
    setPos(p, x, y, z);
    p.connect(out);
    return p;
  };

  // Água: o lago (a fonte acompanha a margem mais próxima de quem ouve), lagos ornamentais e a fonte da praça.
  const lakeP = panner(LAKE.x, 0, LAKE.z, 8, cat.water);
  const lakeG = loop(brown, lakeP, (f) => ((f.type = 'lowpass'), (f.frequency.value = 520)));
  const pondGs = PONDS.map((p) => loop(pink, panner(p.x, 0.5, p.z, 4, cat.water), (f) => ((f.type = 'bandpass'), (f.frequency.value = 1400), (f.Q.value = 0.6))));
  const fountainG = loop(white, panner(0, 2, 0, 5, cat.water), (f) => ((f.type = 'bandpass'), (f.frequency.value = 2400), (f.Q.value = 0.4)));
  // Clima em volta: vento (ruído grave que oscila) e chuva (ruído agudo).
  const windG = loop(brown, cat.weather, (f) => ((f.type = 'lowpass'), (f.frequency.value = 380)));
  const rainG = loop(white, cat.weather, (f) => ((f.type = 'highpass'), (f.frequency.value = 900)));
  // Grilos à noite (natureza, em volta).
  const crickets = keep(ctx.createOscillator());
  crickets.type = 'square';
  crickets.frequency.value = 4400;
  const crickAm = keep(ctx.createGain());
  crickAm.gain.value = 0;
  const crickLfo = keep(ctx.createOscillator());
  crickLfo.frequency.value = 14;
  const crickDepth = keep(ctx.createGain());
  crickDepth.gain.value = 0.004;
  crickLfo.connect(crickDepth).connect(crickAm.gain);
  const crickG = keep(ctx.createGain());
  crickG.gain.value = 0;
  crickets.connect(crickAm).connect(crickG).connect(cat.nature);
  crickets.start();
  crickLfo.start();
  // Música: roda de violão no palco (dedilhado sintetizado), à tarde e à noite.
  const stageP = panner(STAGE.x, 1.5, STAGE.z, 6, cat.music);

  let birdAt = 0;
  let noteAt = 0;
  let noteIdx = 0;
  let stepAt = 0;
  let stepSide = 0;
  const CHORDS = [
    [196, 247, 294, 392],
    [220, 262, 330, 440],
    [175, 220, 262, 349],
    [196, 247, 294, 370],
  ];

  const pluck = (f: number, at: number, vol: number) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
    o.connect(g).connect(stageP);
    o.start(at);
    o.stop(at + 1.5);
  };

  const chirp = (x: number, z: number) => {
    const p = panner(x, 6, z, 6, cat.nature, false);
    const base = 2600 + Math.random() * 1800;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t0 = now() + i * (0.09 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base, t0);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t0 + 0.07);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      o.connect(g).connect(p);
      o.start(t0);
      o.stop(t0 + 0.1);
    }
    window.setTimeout(() => p.disconnect(), 1500);
  };

  const step = (vol: number) => {
    const src = ctx.createBufferSource();
    src.buffer = brown;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 160 + stepSide * 40;
    const g = ctx.createGain();
    const t0 = now();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    src.connect(f).connect(g).connect(cat.steps);
    src.start(t0, Math.random() * 3, 0.16);
    stepSide = 1 - stepSide;
  };

  const ramp = (p: AudioParam, v: number, tc = 0.4) => p.setTargetAtTime(v, now(), tc);

  // Instrumentos dos interiores (piano, bateria, sinos, toca-discos): no volume da música, sem abafar.
  const inst = keep(ctx.createGain());
  inst.connect(master);
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  const note = (midi: number, timbre: Timbre, delay = 0) => {
    const at = now() + delay + 0.005;
    const out = ctx.createGain();
    out.connect(inst);
    const env = (g: GainNode, peak: number, attack: number, decay: number) => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    };
    const osc = (type: OscillatorType, f: number, peak: number, attack: number, decay: number, to?: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, at);
      if (to) o.frequency.exponentialRampToValueAtTime(to, at + decay * 0.5);
      const g = ctx.createGain();
      env(g, peak, attack, decay);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + decay + 0.05);
    };
    const hiss = (peak: number, decay: number, freq: number, type: BiquadFilterType) => {
      const src = ctx.createBufferSource();
      src.buffer = white;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = freq;
      const g = ctx.createGain();
      env(g, peak, 0.002, decay);
      src.connect(fl).connect(g).connect(out);
      src.start(at, Math.random() * 1.5);
      src.stop(at + decay + 0.05);
    };
    const f = hz(midi);
    switch (timbre) {
      case 'piano': {
        // Martelo: fundamental + harmônicos que somem mais rápido, ataque curto e cauda longa.
        const tail = 2.6 - Math.min(1.6, (midi - 48) * 0.03);
        osc('triangle', f, 0.32, 0.004, tail);
        osc('sine', f * 2, 0.12, 0.004, tail * 0.6);
        osc('sine', f * 3, 0.05, 0.003, tail * 0.35);
        osc('sine', f * 1.003, 0.1, 0.004, tail);
        hiss(0.04, 0.03, 3000, 'bandpass');
        break;
      }
      case 'kick':
        osc('sine', 120, 0.9, 0.002, 0.45, 42);
        break;
      case 'snare':
        osc('triangle', 190, 0.35, 0.002, 0.12, 150);
        hiss(0.5, 0.22, 2400, 'highpass');
        break;
      case 'hat':
        hiss(0.28, midi > 86 ? 0.05 : 0.09, 8000, 'highpass');
        break;
      case 'tom':
        osc('sine', f * 1.5 < 60 ? 110 : f, 0.6, 0.003, 0.4, (f * 1.5 < 60 ? 110 : f) * 0.6);
        break;
      case 'bell':
        osc('sine', f, 0.3, 0.003, 3.2);
        osc('sine', f * 2.76, 0.12, 0.002, 1.6);
        osc('sine', f * 5.4, 0.05, 0.002, 0.8);
        break;
      case 'voice': {
        // Sílaba de fala (estilo "balbucio" de jogo): vogal com formante e entonação que cai.
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, at);
        o.frequency.linearRampToValueAtTime(f * (0.88 + Math.random() * 0.2), at + 0.11);
        const vowel = [700, 1100, 450, 900, 350][Math.floor(Math.random() * 5)]!;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = vowel;
        bp.Q.value = 3;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2400;
        const g = ctx.createGain();
        env(g, 0.5, 0.012, 0.12);
        o.connect(bp).connect(lp).connect(g).connect(out);
        o.start(at);
        o.stop(at + 0.16);
        break;
      }
      case 'whistle': {
        // Apito do juiz: tom agudo com trinado.
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 2900;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 38;
        const depth = ctx.createGain();
        depth.gain.value = 140;
        lfo.connect(depth).connect(o.frequency);
        const g = ctx.createGain();
        env(g, 0.12, 0.01, 0.55);
        o.connect(g).connect(out);
        o.start(at);
        lfo.start(at);
        o.stop(at + 0.6);
        lfo.stop(at + 0.6);
        break;
      }
      case 'ball':
        // Batida na bola (couro) ou raquetada: "toc" curto.
        osc('sine', f, 0.45, 0.002, 0.09, f * 0.6);
        hiss(0.12, 0.04, 1800, 'bandpass');
        break;
      case 'pluck':
        osc('triangle', f, 0.28, 0.006, 1.2);
        osc('sine', f / 2, 0.12, 0.01, 1.4);
        break;
    }
    window.setTimeout(() => out.disconnect(), (delay + 4) * 1000);
  };

  const setMix = (m: AudioMix) => {
    ramp(master.gain, m.muted ? 0 : m.master, 0.1);
    AUDIO_CATS.forEach((c) => ramp(cat[c].gain, m[c], 0.1));
    ramp(inst.gain, Math.max(0.15, m.music), 0.1);
  };
  setMix(mix);

  const update = (info: AudioInfo, dt: number) => {
    const c = info.listener.position;
    const l = ctx.listener;
    // Ouvinte = câmera (posição e direção).
    const fwd = { x: 0, y: 0, z: -1 };
    const e = info.listener.matrixWorld.elements;
    fwd.x = -e[8]!;
    fwd.y = -e[9]!;
    fwd.z = -e[10]!;
    if (l.positionX) {
      l.positionX.setTargetAtTime(c.x, now(), 0.05);
      l.positionY.setTargetAtTime(c.y, now(), 0.05);
      l.positionZ.setTargetAtTime(c.z, now(), 0.05);
      l.forwardX.setTargetAtTime(fwd.x, now(), 0.05);
      l.forwardY.setTargetAtTime(fwd.y, now(), 0.05);
      l.forwardZ.setTargetAtTime(fwd.z, now(), 0.05);
    } else {
      (l as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(c.x, c.y, c.z);
      (l as unknown as { setOrientation: (a: number, b: number, d: number, x: number, y: number, z: number) => void }).setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
    // Margem do lago mais próxima.
    const a = Math.atan2(c.z - LAKE.z, c.x - LAKE.x);
    const r = lakeRadiusAt(a);
    setPos(lakeP, LAKE.x + Math.cos(a) * r, 0, LAKE.z + Math.sin(a) * r);

    const day = info.hour >= 5.5 && info.hour < 18.5;
    const night = info.hour >= 19.5 || info.hour < 5;
    const sky = info.sky;
    ramp(muffle.frequency, info.inside ? 650 : 20000, 0.2);
    ramp(lakeG.gain, 0.5 + sky.wind * 0.4);
    pondGs.forEach((g) => ramp(g.gain, 0.25));
    ramp(fountainG.gain, 0.22);
    ramp(windG.gain, 0.05 + sky.wind * 0.9 + Math.sin(performance.now() / 1300) * sky.wind * 0.2);
    ramp(rainG.gain, sky.rain * 0.5);
    ramp(crickG.gain, night && sky.rain < 0.2 ? 0.6 : 0, 1.5);

    // Pássaros: de dia, sem chuva forte, em árvores perto de quem ouve.
    if (!info.inside && day && sky.rain < 0.25 && sky.wind < 0.8 && performance.now() > birdAt) {
      birdAt = performance.now() + 2500 + Math.random() * 5000;
      const ang = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 30;
      chirp(c.x + Math.cos(ang) * dist, c.z + Math.sin(ang) * dist);
    }
    // Roda de violão: das 17h às 23h, sem chuva.
    const playing = info.hour >= 17 && info.hour < 23 && sky.rain < 0.15;
    if (playing && performance.now() > noteAt) {
      const chord = CHORDS[Math.floor(noteIdx / 8) % CHORDS.length]!;
      const at = now() + 0.02;
      pluck(chord[noteIdx % 4]!, at, noteIdx % 4 === 0 ? 0.32 : 0.2);
      noteIdx++;
      noteAt = performance.now() + 300;
    }
    // Passos: ritmo pela velocidade.
    if (info.steps > 0.4 && performance.now() > stepAt) {
      step(Math.min(0.5, 0.2 + info.steps * 0.05));
      stepAt = performance.now() + Math.max(260, 620 - info.steps * 55);
    }
    void dt;
  };

  return {
    update,
    setMix,
    note,
    dispose: () => {
      ramp(master.gain, 0, 0.05);
      window.setTimeout(() => {
        nodes.forEach((n) => {
          try {
            if (n instanceof AudioScheduledSourceNode) n.stop();
            n.disconnect();
          } catch {
            /* já parado */
          }
        });
      }, 200);
    },
  };
}

function setPos(p: PannerNode, x: number, y: number, z: number) {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else (p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(x, y, z);
}
