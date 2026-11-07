import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { SKY_PRESETS, autoSky, lightAt, phaseOf } from '@/features/park/world';

describe('parque V2.1: ciclo de luz e clima', () => {
  it('cinco fases do dia pela hora', () => {
    expect(phaseOf(3)).toBe('night');
    expect(phaseOf(6)).toBe('dawn');
    expect(phaseOf(9)).toBe('morning');
    expect(phaseOf(14)).toBe('afternoon');
    expect(phaseOf(18)).toBe('sunset');
    expect(phaseOf(22)).toBe('night');
  });

  it('luz contínua: sem saltos entre minutos vizinhos, sol alto ao meio-dia, luzes acesas à noite', () => {
    let prev = lightAt(0);
    for (let m = 1; m <= 24 * 60; m += 5) {
      const l = lightAt(m / 60);
      expect(Math.abs(l.sunI - prev.sunI)).toBeLessThan(0.15);
      expect(Math.abs(l.glow - prev.glow)).toBeLessThan(0.15);
      const a = new Color(l.skyTop);
      const b = new Color(prev.skyTop);
      expect(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)).toBeLessThan(0.2);
      prev = l;
    }
    expect(lightAt(12).sunI).toBeGreaterThan(lightAt(22).sunI);
    expect(lightAt(12).glow).toBe(0);
    expect(lightAt(22).glow).toBe(1);
    expect(lightAt(12).sunDir[1]).toBeGreaterThan(0.9);
  });

  it('clima automático: sempre um dos climas possíveis e igual para a mesma data e hora', () => {
    const d = new Date(2026, 10, 6, 14, 0);
    expect(autoSky(d)).toEqual(autoSky(new Date(2026, 10, 6, 14, 30)));
    expect(Object.values(SKY_PRESETS)).toContainEqual(autoSky(d));
  });
});
