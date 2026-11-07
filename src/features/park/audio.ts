/**
 * Som espacial do parque (V2.1, seção 16): fontes posicionadas no mundo (lago, lagos ornamentais,
 * fonte, pássaros nas árvores, roda de música no palco, trânsito da rua, parquinho), clima em volta
 * (vento nas folhas e chuva), bichos (pássaros de várias espécies, grilos, sapos, cigarras, cachorros,
 * patos, pombos, gato) e passos que mudam com o piso (pedra, grama, madeira, piso interno, poça).
 * Tudo sintetizado no aparelho com Web Audio, no mesmo contexto de áudio do Focus (sem abrir outro).
 * Dentro dos prédios o som de fora fica abafado. Volume por categoria e silenciar.
 */
import type * as THREE from 'three';
import { LAKE, PLAYGROUNDS, POIS, PONDS, ROAD_RADIUS, lakeRadiusAt } from '@/domain/park';
import { sound } from '@/features/focus/sound';
import type { Sky } from './world';
import type { Timbre } from './interiors/things';

export const AUDIO_CATS = ['nature', 'water', 'weather', 'music', 'steps'] as const;
export type AudioCat = (typeof AUDIO_CATS)[number];
export type AudioMix = { master: number; muted: boolean } & Record<AudioCat, number>;
export const DEFAULT_MIX: AudioMix = { master: 0.7, muted: false, nature: 0.8, water: 0.7, weather: 0.7, music: 0.6, steps: 0.5 };

export type Surface = 'stone' | 'grass' | 'wood' | 'floor' | 'wet';

export interface AudioInfo {
  listener: THREE.Camera;
  inside: boolean;
  hour: number;
  sky: Sky;
  /** Velocidade de quem anda (passos); 0 parado. */
  steps: number;
  /** Quanto de árvore tem em volta (0 a 1): folhas balançando ao vento. */
  trees?: number;
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Skatistas perto (som das rodinhas). */
  skaters?: Array<{ x: number; z: number }>;
}

export interface ParkAudio {
  update: (info: AudioInfo, dt: number) => void;
  setMix: (m: AudioMix) => void;
  /**
   * Uma nota (MIDI) num timbre, daqui a `delay` segundos. Sem `at`, toca "na cabeça" (instrumentos
   * dos interiores); com `at`, sai daquele ponto do mundo (bichos, portas, buzina, bicicleta).
   */
  note: (midi: number, timbre: Timbre, delay?: number, at?: { x: number; y?: number; z: number }) => void;
  /** Um passo de quem anda, no piso de agora. */
  footstep: (surface: Surface, vol: number) => void;
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
  // Clima em volta: vento (ruído grave que oscila), folhas farfalhando nas árvores e chuva.
  const windG = loop(brown, cat.weather, (f) => ((f.type = 'lowpass'), (f.frequency.value = 380)));
  const leavesG = loop(pink, cat.nature, (f) => ((f.type = 'bandpass'), (f.frequency.value = 3400), (f.Q.value = 0.7)));
  const rainG = loop(white, cat.weather, (f) => ((f.type = 'highpass'), (f.frequency.value = 900)));
  // Trânsito da rua do bairro: ronco grave vindo do trecho da rua mais perto de quem ouve.
  const roadP = panner(ROAD_RADIUS, 0.5, 0, 25, cat.weather);
  const roadG = loop(brown, roadP, (f) => ((f.type = 'lowpass'), (f.frequency.value = 170)));
  // Cigarras nas tardes de verão (chiado agudo que cresce e some).
  const cicadaG = loop(white, cat.nature, (f) => ((f.type = 'bandpass'), (f.frequency.value = 5600), (f.Q.value = 9)));
  // Skate: rodinhas no piso (ruído grave) saindo de onde está o skatista mais perto.
  const skateP = panner(0, 0.2, 0, 3, cat.nature);
  const skateG = loop(brown, skateP, (f) => ((f.type = 'bandpass'), (f.frequency.value = 320), (f.Q.value = 0.9)));
  // Grilos à noite: trinado (pulsos rápidos) que liga e desliga em grupos, como de verdade.
  const crickets = keep(ctx.createOscillator());
  crickets.type = 'sine';
  crickets.frequency.value = 4500;
  const trill = keep(ctx.createGain());
  trill.gain.value = 0.5;
  const trillLfo = keep(ctx.createOscillator());
  trillLfo.type = 'square';
  trillLfo.frequency.value = 32;
  const trillDepth = keep(ctx.createGain());
  trillDepth.gain.value = 0.5;
  trillLfo.connect(trillDepth).connect(trill.gain);
  const gate = keep(ctx.createGain());
  gate.gain.value = 0.5;
  const gateLfo = keep(ctx.createOscillator());
  gateLfo.type = 'square';
  gateLfo.frequency.value = 1.3;
  const gateDepth = keep(ctx.createGain());
  gateDepth.gain.value = 0.5;
  gateLfo.connect(gateDepth).connect(gate.gain);
  const crickG = keep(ctx.createGain());
  crickG.gain.value = 0;
  crickets.connect(trill).connect(gate).connect(crickG).connect(cat.nature);
  crickets.start();
  trillLfo.start();
  gateLfo.start();
  // Música: roda de violão no palco (dedilhado sintetizado), à tarde e à noite.
  const stageP = panner(STAGE.x, 1.5, STAGE.z, 6, cat.music);

  let birdAt = 0;
  let noteAt = 0;
  let noteIdx = 0;
  let stepSide = 0;
  let carAt = 0;
  let kidAt = 0;
  let frogAt = 0;
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

  /** Um pio curto (frequência subindo), base de várias espécies. */
  const tweet = (out: AudioNode, t0: number, f0: number, f1: number, len: number, vol: number, vib = 0) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + len * 0.8);
    if (vib) {
      const l = ctx.createOscillator();
      l.frequency.value = 28;
      const d = ctx.createGain();
      d.gain.value = vib;
      l.connect(d).connect(o.frequency);
      l.start(t0);
      l.stop(t0 + len + 0.02);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, len * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + len + 0.02);
  };

  /** Canto de pássaro: pardal (piados), bem-te-vi (três notas) ou sabiá (frase melódica, de manhã e no fim da tarde). */
  const chirp = (x: number, z: number, hour: number) => {
    const p = panner(x, 6, z, 6, cat.nature, false);
    const t = now() + 0.02;
    const r = Math.random();
    const dusk = (hour > 5.5 && hour < 8) || (hour > 16.5 && hour < 18.5);
    if (r < (dusk ? 0.45 : 0.15)) {
      // Sabiá-laranjeira: notas de flauta com vibrato, subindo e descendo.
      let tt = t;
      const n = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const f = 1500 + Math.random() * 1700;
        const len = 0.12 + Math.random() * 0.16;
        tweet(p, tt, f, f * (0.9 + Math.random() * 0.25), len, 0.16, 35);
        tt += len + 0.05 + Math.random() * 0.12;
      }
    } else if (r < 0.55) {
      // Bem-te-vi: "bem" curto, "te" mais agudo, "vi" longo descendo.
      tweet(p, t, 1900, 2100, 0.1, 0.22);
      tweet(p, t + 0.16, 2500, 2700, 0.09, 0.22);
      tweet(p, t + 0.3, 3300, 2400, 0.32, 0.25);
    } else {
      // Pardal: dois a quatro piados rápidos.
      const base = 2600 + Math.random() * 1800;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tweet(p, t + i * (0.09 + Math.random() * 0.05), base, base * (1.2 + Math.random() * 0.4), 0.09, 0.25);
    }
    window.setTimeout(() => p.disconnect(), 3500);
  };

  /** Ruído curto filtrado (passos, batidas, portas). */
  const burst = (out: AudioNode, t0: number, buf: AudioBuffer, type: BiquadFilterType, freq: number, q: number, vol: number, len: number, to?: number) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + len);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, len * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(f).connect(g).connect(out);
    src.start(t0, Math.random() * 3, len + 0.05);
  };
  /** Tom curto (batida grave, estalo, sino). */
  const tone = (out: AudioNode, t0: number, type: OscillatorType, f: number, vol: number, len: number, to?: number, attack = 0.004) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + len * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + len + 0.03);
    return o;
  };

  const footstep = (surface: Surface, vol: number) => {
    const t0 = now();
    const out = cat.steps;
    const v = vol * (stepSide ? 1 : 0.85);
    stepSide = 1 - stepSide;
    switch (surface) {
      case 'stone':
        // Calçado na pedra: estalo do salto e batida curta da sola.
        burst(out, t0, white, 'bandpass', 2300 + Math.random() * 500, 1.2, v * 0.55, 0.05);
        burst(out, t0 + 0.035, brown, 'lowpass', 180, 0.7, v * 0.8, 0.09);
        break;
      case 'grass':
        // Grama: farfalhar macio das folhas e um baque abafado.
        burst(out, t0, white, 'highpass', 2600, 0.5, v * 0.28, 0.16, 1800);
        burst(out, t0 + 0.02, brown, 'lowpass', 120, 0.7, v * 0.45, 0.1);
        break;
      case 'wood':
        // Madeira do píer e da ponte: batida oca com ressonância.
        tone(out, t0, 'sine', 150, v * 0.7, 0.16, 105);
        burst(out, t0, brown, 'bandpass', 520, 3, v * 0.6, 0.12);
        if (Math.random() < 0.12) tone(out, t0 + 0.05, 'sawtooth', 240, v * 0.05, 0.25, 210, 0.05);
        break;
      case 'floor':
        // Piso liso de dentro: estalo seco mais agudo.
        burst(out, t0, white, 'bandpass', 3200, 2, v * 0.5, 0.04);
        burst(out, t0 + 0.03, brown, 'lowpass', 220, 0.7, v * 0.55, 0.07);
        break;
      case 'wet':
        // Chão molhado: pisada com respingo.
        burst(out, t0, white, 'bandpass', 1300, 0.8, v * 0.5, 0.2, 2600);
        burst(out, t0 + 0.03, brown, 'lowpass', 160, 0.7, v * 0.5, 0.09);
        break;
    }
  };

  const ramp = (p: AudioParam, v: number, tc = 0.4) => p.setTargetAtTime(v, now(), tc);

  // Instrumentos dos interiores (piano, bateria, sinos, toca-discos): no volume da música, sem abafar.
  const inst = keep(ctx.createGain());
  inst.connect(master);
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  const note = (midi: number, timbre: Timbre, delay = 0, pos?: { x: number; y?: number; z: number }) => {
    const at = now() + delay + 0.005;
    const out = ctx.createGain();
    const pan = pos ? panner(pos.x, pos.y ?? 1, pos.z, 4, cat.nature, false) : null;
    out.connect(pan ?? inst);
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
    /** Voz filtrada por formante (latido, quack, miado, criança): onda dente-de-serra com entonação. */
    const voiced = (t0: number, f0: number, f1: number, len: number, formant: number, q: number, peak: number, type: OscillatorType = 'sawtooth') => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f1, t0 + len * 0.85);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = formant;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(bp).connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + len + 0.03);
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
        const vowel = [700, 1100, 450, 900, 350][Math.floor(Math.random() * 5)]!;
        voiced(at, f, f * (0.88 + Math.random() * 0.2), 0.12, vowel, 3, 0.5);
        break;
      }
      case 'kid': {
        // Criança: voz aguda, sílabas curtas e risadas (vogais abertas, entonação que sobe).
        const vowel = [1300, 1700, 900, 2100][Math.floor(Math.random() * 4)]!;
        voiced(at, f, f * (1.05 + Math.random() * 0.25), 0.11 + Math.random() * 0.06, vowel, 2.5, 0.35);
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
      case 'door': {
        // Porta automática: chiado do trilho que corre e o baque macio no fim do curso.
        burst(out, at, white, 'bandpass', 500, 1.5, 0.22, 0.7, 1500);
        tone(out, at, 'sawtooth', 62, 0.04, 0.7, 70, 0.08);
        tone(out, at + 0.62, 'sine', 95, 0.25, 0.14, 70);
        break;
      }
      case 'gate': {
        // Portão de ferro: rangido da dobradiça (com vibrato) e a trava batendo.
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(150, at);
        o.frequency.linearRampToValueAtTime(240, at + 0.9);
        const l = ctx.createOscillator();
        l.frequency.value = 9;
        const d = ctx.createGain();
        d.gain.value = 22;
        l.connect(d).connect(o.frequency);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 950;
        bp.Q.value = 5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.12, at + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.95);
        o.connect(bp).connect(g).connect(out);
        o.start(at);
        l.start(at);
        o.stop(at + 1);
        l.stop(at + 1);
        tone(out, at + 0.95, 'sine', 1250, 0.12, 0.3);
        tone(out, at + 0.95, 'sine', 1870, 0.07, 0.22);
        break;
      }
      case 'bark':
        // Latido: dois "au" com queda de tom, um ruído de garganta junto.
        for (const dt of [0, 0.24]) {
          voiced(at + dt, f, f * 0.7, 0.13, 800, 1.6, 0.6);
          burst(out, at + dt, white, 'bandpass', 1200, 1, 0.12, 0.08);
        }
        break;
      case 'quack':
        // Pato: "quá" anasalado, repetido.
        for (let i = 0; i < 3; i++) voiced(at + i * 0.2, f, f * 0.85, 0.14, 1100, 7, 0.45);
        break;
      case 'coo':
        // Pombo: "ru-cuu" grave e arrulhado.
        voiced(at, f, f * 0.95, 0.28, 500, 4, 0.35, 'triangle');
        voiced(at + 0.32, f * 1.08, f * 0.9, 0.5, 480, 4, 0.4, 'triangle');
        break;
      case 'meow':
        // Gato: "miau" que sobe e desce.
        voiced(at, f, f * 1.5, 0.3, 1400, 3, 0.35);
        voiced(at + 0.28, f * 1.4, f * 0.9, 0.35, 900, 3, 0.3);
        break;
      case 'bikebell':
        // Campainha de bicicleta: dois toques metálicos.
        for (const dt of [0, 0.13]) {
          tone(out, at + dt, 'sine', 3300, 0.2, 0.7);
          tone(out, at + dt, 'sine', 3300 * 1.51, 0.08, 0.45);
          tone(out, at + dt, 'sine', 3300 * 2.7, 0.04, 0.25);
        }
        break;
      case 'horn':
        // Buzina de carro: dois tons juntos, curtos.
        for (const fr of [415, 523]) tone(out, at, 'square', fr, 0.06, 0.38, undefined, 0.01);
        break;
      case 'brake':
        // Freio a ar do ônibus parando no ponto: "psssh".
        burst(out, at, white, 'highpass', 3500, 0.7, 0.3, 0.8);
        tone(out, at, 'sine', 70, 0.15, 0.6, 50);
        break;
      case 'frog':
        // Sapo na beira do lago: coaxar grave em três pulsos.
        for (let i = 0; i < 3; i++) voiced(at + i * 0.11, f, f * 0.9, 0.08, 380, 4, 0.4);
        break;
    }
    window.setTimeout(() => {
      out.disconnect();
      pan?.disconnect();
    }, (delay + 4) * 1000);
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
    // Margem do lago e trecho da rua mais perto.
    const a = Math.atan2(c.z - LAKE.z, c.x - LAKE.x);
    const r = lakeRadiusAt(a);
    setPos(lakeP, LAKE.x + Math.cos(a) * r, 0, LAKE.z + Math.sin(a) * r);
    const ra = Math.atan2(c.z, c.x);
    setPos(roadP, Math.cos(ra) * ROAD_RADIUS, 0.5, Math.sin(ra) * ROAD_RADIUS);
    const toRoad = Math.abs(Math.hypot(c.x, c.z) - ROAD_RADIUS);

    const h = info.hour;
    const day = h >= 5.5 && h < 18.5;
    const night = h >= 19.5 || h < 5;
    const sky = info.sky;
    const trees = info.trees ?? 0.4;
    ramp(muffle.frequency, info.inside ? 650 : 20000, 0.2);
    ramp(lakeG.gain, 0.5 + sky.wind * 0.4);
    pondGs.forEach((g) => ramp(g.gain, 0.25));
    ramp(fountainG.gain, 0.22);
    const gust = Math.sin(performance.now() / 1300) * 0.5 + Math.sin(performance.now() / 3100) * 0.5;
    ramp(windG.gain, 0.05 + sky.wind * 0.9 + gust * sky.wind * 0.2);
    ramp(leavesG.gain, trees * (0.03 + sky.wind * 0.35 + Math.max(0, gust) * (0.04 + sky.wind * 0.25)), 0.6);
    ramp(rainG.gain, sky.rain * 0.5);
    // Rua: mais movimento de manhã e no fim da tarde, quase nada de madrugada.
    const rush = h < 5 ? 0.15 : (h > 7 && h < 9.5) || (h > 17 && h < 19.5) ? 1 : h > 22 ? 0.35 : 0.65;
    ramp(roadG.gain, 0.5 * rush, 1);
    ramp(crickG.gain, night && sky.rain < 0.2 ? 0.012 : 0, 1.5);
    ramp(cicadaG.gain, info.season === 'summer' && h > 12 && h < 17.5 && sky.rain < 0.1 && !info.inside ? 0.02 + Math.max(0, Math.sin(performance.now() / 4000)) * 0.05 : 0, 1.2);
    // Skate: as rodinhas soam enquanto há skatista perto.
    const sk = info.skaters?.reduce<{ x: number; z: number; d: number } | null>((m, s) => {
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      return !m || d < m.d ? { ...s, d } : m;
    }, null);
    if (sk) setPos(skateP, sk.x, 0.2, sk.z);
    ramp(skateG.gain, sk && sk.d < 40 ? 0.5 : 0, 0.15);

    // Pássaros: de dia, sem chuva forte, em árvores perto de quem ouve (mais onde há árvores).
    if (!info.inside && day && sky.rain < 0.25 && sky.wind < 0.8 && performance.now() > birdAt) {
      birdAt = performance.now() + (2200 + Math.random() * 5000) / (0.5 + trees);
      const ang = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 30;
      chirp(c.x + Math.cos(ang) * dist, c.z + Math.sin(ang) * dist, h);
    }
    // Carros passando na rua (com buzina de vez em quando) quando se está perto da borda.
    if (!info.inside && toRoad < 140 && performance.now() > carAt) {
      carAt = performance.now() + (2500 + Math.random() * 7000) / Math.max(0.2, rush);
      const sweep = Math.random() < 0.5 ? 1 : -1;
      const p = panner(Math.cos(ra - sweep * 0.06) * ROAD_RADIUS, 0.6, Math.sin(ra - sweep * 0.06) * ROAD_RADIUS, 10, cat.weather, false);
      const t0 = now();
      burst(p, t0, brown, 'lowpass', 140, 0.7, 0.5, 2.6, 380);
      burst(p, t0 + 0.4, pink, 'bandpass', 700, 1, 0.12, 1.8, 400);
      // O carro passa: o som anda pela rua até o outro lado.
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        window.setTimeout(() => setPos(p, Math.cos(ra + sweep * (k * 0.12 - 0.06)) * ROAD_RADIUS, 0.6, Math.sin(ra + sweep * (k * 0.12 - 0.06)) * ROAD_RADIUS), k * 2600);
      }
      if (Math.random() < 0.06) note(64, 'horn', 0.6, { x: Math.cos(ra) * ROAD_RADIUS, y: 1, z: Math.sin(ra) * ROAD_RADIUS });
      window.setTimeout(() => p.disconnect(), 3200);
    }
    // Parquinho: crianças rindo e chamando, de dia e sem chuva.
    const PG = PLAYGROUNDS.reduce((m, g) => (Math.hypot(g.x - c.x, g.z - c.z) < Math.hypot(m.x - c.x, m.z - c.z) ? g : m), PLAYGROUNDS[0]!);
    const dk = Math.hypot(PG.x - c.x, PG.z - c.z);
    if (!info.inside && h > 8 && h < 18.5 && sky.rain < 0.15 && dk < 70 && performance.now() > kidAt) {
      kidAt = performance.now() + 700 + Math.random() * 2200;
      const n = 2 + Math.floor(Math.random() * 4);
      const base = 74 + Math.floor(Math.random() * 9);
      const pos = { x: PG.x + (Math.random() - 0.5) * 14, y: 1, z: PG.z + (Math.random() - 0.5) * 14 };
      for (let i = 0; i < n; i++) note(base + (Math.random() < 0.4 ? i * 2 : 0), 'kid', i * (0.13 + Math.random() * 0.05), pos);
    }
    // Sapos na beira do lago, à noite.
    const dLake = Math.hypot(c.x - LAKE.x, c.z - LAKE.z) - r;
    if (!info.inside && night && dLake < 50 && performance.now() > frogAt) {
      frogAt = performance.now() + 1500 + Math.random() * 4000;
      const fa = a + (Math.random() - 0.5) * 0.5;
      const fr = lakeRadiusAt(fa);
      note(40 + Math.floor(Math.random() * 4), 'frog', 0, { x: LAKE.x + Math.cos(fa) * fr, y: 0.2, z: LAKE.z + Math.sin(fa) * fr });
    }
    // Roda de violão: das 17h às 23h, sem chuva.
    const playing = h >= 17 && h < 23 && sky.rain < 0.15;
    if (playing && performance.now() > noteAt) {
      const chord = CHORDS[Math.floor(noteIdx / 8) % CHORDS.length]!;
      const at = now() + 0.02;
      pluck(chord[noteIdx % 4]!, at, noteIdx % 4 === 0 ? 0.32 : 0.2);
      noteIdx++;
      noteAt = performance.now() + 300;
    }
    void dt;
  };

  return {
    update,
    setMix,
    note,
    footstep,
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
