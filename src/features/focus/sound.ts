import type { FocusSound } from '@/domain/focus';

/**
 * Sons de concentração gerados no próprio aparelho com Web Audio (Parte 13.5): ruído branco, rosa e
 * marrom, "chuva" e "ondas" sintetizadas. Não baixa nada, não depende de serviço pago e funciona sem internet.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private current: FocusSound = 'none';

  /** Precisa ser chamado num toque do usuário (exigência do iPad). */
  unlock(): void {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!this.ctx) this.ctx = new Ctx();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  get available(): boolean {
    return typeof window !== 'undefined' && !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  }

  private noise(kind: 'white' | 'pink' | 'brown'): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  play(sound: FocusSound, volume: number): void {
    if (sound === this.current && this.source) {
      this.setVolume(volume);
      return;
    }
    this.stop();
    if (sound === 'none') return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    const base = sound === 'rain' ? 'white' : sound === 'waves' ? 'brown' : sound;
    const buffer = this.noise(base);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    let node: AudioNode = src;
    if (sound === 'rain') {
      // Chuva: ruído filtrado nas frequências do chiado da água.
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      node.connect(hp);
      hp.connect(lp);
      node = lp;
      gain.gain.value = volume * 0.6;
    }
    if (sound === 'waves') {
      // Ondas: o volume sobe e desce devagar, como o mar.
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 0.09;
      depth.gain.value = volume * 0.45;
      lfo.connect(depth);
      depth.connect(gain.gain);
      lfo.start();
      this.lfo = lfo;
      gain.gain.value = volume * 0.55;
    }
    node.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    this.source = src;
    this.gain = gain;
    this.current = sound;
  }

  setVolume(volume: number): void {
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(this.current === 'rain' ? volume * 0.6 : this.current === 'waves' ? volume * 0.55 : volume, this.ctx.currentTime, 0.1);
  }

  stop(): void {
    try {
      this.source?.stop();
      this.lfo?.stop();
    } catch {
      /* já parado */
    }
    this.source?.disconnect();
    this.gain?.disconnect();
    this.source = null;
    this.gain = null;
    this.lfo = null;
    this.current = 'none';
  }

  /** Um canto curto de pássaro (som ambiente do parque, só de dia). */
  chirp(volume: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t0 = ctx.currentTime + i * (0.09 + Math.random() * 0.05);
      const f0 = 2600 + Math.random() * 1400;
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.3), t0 + 0.07);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(volume, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.1);
    }
  }

  /** Dois toques curtos no fim de cada fase. */
  chime(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [i, freq] of [880, 1320].entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.type = 'sine';
      const t0 = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.55);
    }
    try {
      navigator.vibrate?.([120, 80, 120]);
    } catch {
      /* sem vibração */
    }
  }
}

export const sound = new SoundEngine();
