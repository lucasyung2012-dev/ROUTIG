import { useId } from 'react';
import { useSettings } from '@/app/SettingsProvider';
import { cn } from '@/ui/cn';
import {
  LOGO_PNG_PATH,
  MARK_ARROW,
  MARK_BODY,
  MARK_BOWL,
  MARK_GRADIENT,
  MARK_STROKE,
  MARK_VIEWBOX_CROP,
  MARK_VIEWBOX_FULL,
} from './mark';

export const logoPngUrl = `${import.meta.env.BASE_URL}${LOGO_PNG_PATH}`;

/** Desenho vetorial do logo. `full` usa o quadro 1024 × 1024 do PNG (para comparar). */
export function RoutigMark({
  className,
  full = false,
  animated = false,
  title,
  size,
}: {
  className?: string;
  full?: boolean;
  animated?: boolean;
  title?: string;
  size?: number;
}) {
  const gid = useId().replace(/:/g, '');
  const stroke = `url(#g${gid})`;
  const draw = animated ? { pathLength: 1, strokeDasharray: 1, className: 'animate-draw-route' } : {};
  return (
    <svg
      viewBox={full ? MARK_VIEWBOX_FULL : MARK_VIEWBOX_CROP}
      className={className}
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
    >
      <defs>
        <linearGradient id={`g${gid}`} gradientUnits="userSpaceOnUse" x1={MARK_GRADIENT.x1} y1={MARK_GRADIENT.y1} x2={MARK_GRADIENT.x2} y2={MARK_GRADIENT.y2}>
          {MARK_GRADIENT.stops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <path d={MARK_BOWL} stroke={stroke} strokeWidth={MARK_STROKE} strokeLinecap="round" strokeLinejoin="round" {...draw} />
      <path d={MARK_BODY} stroke={stroke} strokeWidth={MARK_STROKE} strokeLinecap="round" strokeLinejoin="round" {...draw} />
      <path d={MARK_ARROW} fill={stroke} stroke={stroke} strokeWidth={12} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Logo usado no app. Enquanto o vetor não for aprovado, mostra o PNG original
 * sem nenhuma alteração (Parte 3.1: não redesenhar o símbolo).
 */
export function Logo({ size = 40, className, animated = false }: { size?: number; className?: string; animated?: boolean }) {
  const { settings, t } = useSettings();
  if (settings.brand.vectorApproved) {
    return <RoutigMark className={className} size={size} animated={animated} title={t('app.name')} />;
  }
  return (
    <img
      src={logoPngUrl}
      width={size}
      height={size}
      alt={t('app.name')}
      draggable={false}
      className={cn('rounded-[22%] object-cover', className)}
      style={{ width: size, height: size }}
    />
  );
}
