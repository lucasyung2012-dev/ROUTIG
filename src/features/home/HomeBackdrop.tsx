import { useState } from 'react';
import { useSettings } from '@/app/SettingsProvider';
import { HomePlaza } from './HomePlaza';
import { reducedMotion, usePeriod } from './period';

/**
 * Cenário de fundo do ROUTIG Home: a praça ocupa a tela inteira, por trás da barra lateral de vidro
 * e do menu. Um véu escurece as bordas (em cima para a saudação, embaixo para o chão) sem esconder
 * a torre, a fonte e as letras ROUTIG no canteiro.
 */
export function HomeBackdrop() {
  const { t } = useSettings();
  const period = usePeriod();
  const [still] = useState(reducedMotion);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <HomePlaza period={period} still={still} label={t(period === 'night' ? 'home.plazaNight' : 'home.plaza')} className="block h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1026]/45 via-transparent to-[#0B1026]/25" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B1026]/35 via-transparent to-transparent" aria-hidden />
      <div className="home-dim absolute inset-0 bg-[#0B1026] opacity-0" aria-hidden />
    </div>
  );
}
