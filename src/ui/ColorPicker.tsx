import type { ReactNode } from 'react';
import { useSettings } from '@/app/SettingsProvider';
import { cn } from './cn';

/** Paleta única do app: preto, cinzas, branco e as cores da identidade do ROUTIG. */
export const PALETTE = ['#000000', '#5B5F73', '#8B93B8', '#FFFFFF', '#E5484D', '#F76B15', '#F59E0B', '#30A46C', '#16B8A6', '#438BEA', '#7357F6', '#8E4EC6', '#EC6695', '#A0522D'] as const;

/** Nome de cada cor, para leitores de tela. */
const NAME: Record<(typeof PALETTE)[number], 'black' | 'darkGray' | 'gray' | 'white' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'violet' | 'purple' | 'pink' | 'brown'> = {
  '#000000': 'black',
  '#5B5F73': 'darkGray',
  '#8B93B8': 'gray',
  '#FFFFFF': 'white',
  '#E5484D': 'red',
  '#F76B15': 'orange',
  '#F59E0B': 'amber',
  '#30A46C': 'green',
  '#16B8A6': 'teal',
  '#438BEA': 'blue',
  '#7357F6': 'violet',
  '#8E4EC6': 'purple',
  '#EC6695': 'pink',
  '#A0522D': 'brown',
};

export const isHexColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/**
 * Escolha de cor com a paleta e "Outra cor" (seletor do aparelho).
 * `extra` permite pôr opções antes da paleta (ex.: cores do tema no Calendar).
 */
export function ColorPicker({
  value,
  onChange,
  label,
  size = 'md',
  showLabel = false,
  extra,
  className,
}: {
  value: string | null;
  onChange: (hex: string) => void;
  label: string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  extra?: ReactNode;
  className?: string;
}) {
  const { t } = useSettings();
  const dot = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const custom = !!value && !(PALETTE as readonly string[]).includes(value.toUpperCase());
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {showLabel && <span className="text-sm font-medium text-fg">{label}</span>}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {extra}
        {PALETTE.map((c) => {
          const on = value?.toUpperCase() === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t(`colors.names.${NAME[c]}`)}
              onClick={() => onChange(c)}
              className={cn(dot, 'shrink-0 rounded-full ring-1 ring-line ring-offset-2 ring-offset-surface transition', on && 'ring-2 ring-fg')}
              style={{ background: c }}
            />
          );
        })}
        <label className={cn(dot, 'relative shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-line ring-offset-2 ring-offset-surface', custom && 'ring-2 ring-fg')} title={t('colors.custom')}>
          <span className="absolute inset-0" style={{ background: custom ? value! : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} aria-hidden />
          <input
            type="color"
            aria-label={t('colors.custom')}
            value={value && isHexColor(value) ? value : '#7357F6'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
