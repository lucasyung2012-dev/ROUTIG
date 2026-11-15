import type { ReactElement } from 'react';

export type Period = 'morning' | 'afternoon' | 'night';

/** Cores do cenário em cada período do dia (a noite é o entardecer azul-violeta, com as luzes acesas). */
const PALETTE = {
  morning: {
    sky: ['#86C5EE', '#D9ECF7', '#FCE6CC'],
    sun: '#FFF1C2',
    far: '#B9CCE0',
    farWin: '#E8F1F8',
    glass: '#CFE6F5',
    glassDark: '#9FC3DE',
    metal: '#E7EDF4',
    grass: '#7DB866',
    grassDark: '#5F9E50',
    stone: '#E9E4DA',
    stoneLine: '#D2C8B4',
    water: ['#8DD3F5', '#3F9FD6'],
    glow: '#FFFFFF',
    lit: 0.25,
  },
  afternoon: {
    sky: ['#4E8FE0', '#9CC8F0', '#F6D7B8'],
    sun: '#FFE9B8',
    far: '#9DB4D2',
    farWin: '#DCE9F6',
    glass: '#BCD9F0',
    glassDark: '#86AED3',
    metal: '#E3E9F1',
    grass: '#74AE5E',
    grassDark: '#5A9549',
    stone: '#E3DDD0',
    stoneLine: '#CBBFA8',
    water: ['#7CC8F0', '#2F8FCC'],
    glow: '#FFF4D6',
    lit: 0.45,
  },
  night: {
    sky: ['#1B1E52', '#4B3C8A', '#C77FA6'],
    sun: '#F3EFDF',
    far: '#2A2F63',
    farWin: '#FFD98A',
    glass: '#33407E',
    glassDark: '#232C61',
    metal: '#8C9AC8',
    grass: '#2C5534',
    grassDark: '#1F4127',
    stone: '#55597C',
    stoneLine: '#7A7FA6',
    water: ['#3D7FC4', '#1F4F95'],
    glow: '#FFD98A',
    lit: 1,
  },
} as const;

/**
 * Cenário do ROUTIG Home (2D, como o fundo do menu de um jogo): a praça central de um campus
 * contemporâneo. Céu do horário, a cidade ao longe, a torre central com a escultura de anéis girando,
 * prédios de vidro (pavilhão curvo à esquerda, cúpula e torre à direita), árvores floridas, a praça
 * com anéis de luz, a fonte de jatos, o monumento com as letras ROUTIG num canteiro, os carrinhos de
 * pipoca e de água de coco e gente passeando. Animações leves (CSS e SMIL), paradas com menos movimento.
 */
export function HomePlaza({ period, label, still, className }: { period: Period; label: string; still: boolean; className?: string }) {
  const p = PALETTE[period];
  const night = period === 'night';
  const anim = (el: ReactElement) => (still ? null : el);
  const lit = (o: number) => o * p.lit;

  const tree = (x: number, y: number, s: number, c: string, c2: string, k: string) => (
    <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
      {night && <ellipse cx="0" cy="-10" rx="26" ry="30" fill="#FFD98A" opacity="0.12" />}
      <rect x="-2.5" y="-2" width="5" height="26" rx="2" fill={night ? '#3B2C22' : '#6B4A33'} />
      <circle cx="0" cy="-15" r="17" fill={c} />
      <circle cx="-12" cy="-7" r="12" fill={c2} />
      <circle cx="12" cy="-8" r="13" fill={c2} />
      <circle cx="3" cy="-24" r="10" fill={c} opacity="0.9" />
    </g>
  );
  const person = (c: string, hair: string, k: string, extra?: ReactElement) => (
    <g key={k}>
      <circle cy="-27" r="4.6" fill={night ? '#B98E70' : '#D9A981'} />
      <path d="M-4.6 -29 Q0 -35 4.6 -29 L4.6 -27 L-4.6 -27 Z" fill={hair} />
      <rect x="-5.5" y="-22" width="11" height="14" rx="3.5" fill={c} />
      <rect x="-4.3" y="-8" width="3.4" height="11" rx="1.4" fill="#2F3A4F" />
      <rect x="0.9" y="-8" width="3.4" height="11" rx="1.4" fill="#2F3A4F" />
      {extra}
    </g>
  );
  const lamp = (x: number, y: number, s: number, k: string) => (
    <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="-58" r="22" fill={p.glow} opacity={lit(0.25)} />
      <rect x="-1.6" y="-56" width="3.2" height="56" fill={night ? '#1F2547' : '#3A4558'} />
      <rect x="-5" y="-62" width="10" height="6" rx="2" fill={night ? '#FFE8AE' : '#F5F5F4'} />
    </g>
  );

  // Janelas acesas dos prédios (padrão fixo, para não piscar a cada render).
  const windows = (x0: number, y0: number, cols: number, rows: number, w: number, h: number, gx: number, gy: number, k: string) =>
    Array.from({ length: cols * rows }, (_, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const on = (i * 7 + r * 3) % 5 !== 0;
      return <rect key={`${k}${i}`} x={x0 + c * gx} y={y0 + r * gy} width={w} height={h} rx="1" fill={on ? p.farWin : p.glassDark} opacity={night ? (on ? 0.9 : 0.5) : 0.55} />;
    });

  return (
    <svg viewBox="0 0 1200 600" className={className ?? 'block h-[300px] w-full'} preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}>
      <defs>
        <linearGradient id="hp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="0.55" stopColor={p.sky[1]} />
          <stop offset="1" stopColor={p.sky[2]} />
        </linearGradient>
        <radialGradient id="hp-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={p.sun} stopOpacity="1" />
          <stop offset="0.3" stopColor={p.sun} stopOpacity="0.8" />
          <stop offset="1" stopColor={p.sun} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hp-water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.water[0]} />
          <stop offset="1" stopColor={p.water[1]} />
        </linearGradient>
        <linearGradient id="hp-tower" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={p.glassDark} />
          <stop offset="0.45" stopColor={p.glass} />
          <stop offset="1" stopColor={p.glassDark} />
        </linearGradient>
        <radialGradient id="hp-plaza" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor={p.glow} stopOpacity={night ? 0.35 : 0.3} />
          <stop offset="1" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <filter id="hp-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Céu, sol ou lua, estrelas e nuvens. */}
      <rect width="1200" height="600" fill="url(#hp-sky)" />
      {night &&
        Array.from({ length: 50 }, (_, i) => (
          <circle key={i} cx={(i * 263) % 1200} cy={10 + ((i * 97) % 160)} r={i % 6 === 0 ? 1.8 : 1} fill="#FFFFFF" opacity={0.4 + ((i * 13) % 5) / 10}>
            {anim(<animate attributeName="opacity" values="0.9;0.3;0.9" dur={`${3 + (i % 4)}s`} repeatCount="indefinite" />)}
          </circle>
        ))}
      <circle cx={period === 'morning' ? 200 : period === 'afternoon' ? 990 : 1030} cy={period === 'afternoon' ? 90 : 110} r={night ? 60 : 120} fill="url(#hp-sun)" />
      {night ? <circle cx="1030" cy="110" r="20" fill={p.sun} /> : <circle cx={period === 'morning' ? 200 : 990} cy={period === 'afternoon' ? 90 : 110} r="30" fill={p.sun} />}
      <g fill={night ? '#B98BC4' : '#FFFFFF'} opacity={night ? 0.35 : 0.75}>
        {[
          [140, 80, 1],
          [430, 60, 1.25],
          [840, 140, 0.9],
          [1080, 210, 0.8],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <g>
              <ellipse cx="0" cy="0" rx="58" ry="12" />
              <ellipse cx="-24" cy="-7" rx="26" ry="12" />
              <ellipse cx="18" cy="-10" rx="30" ry="15" />
              {anim(<animateTransform attributeName="transform" type="translate" values="0 0; 50 0; 0 0" dur={`${70 + i * 17}s`} repeatCount="indefinite" />)}
            </g>
          </g>
        ))}
      </g>

      {/* Cidade ao longe. */}
      <g fill={p.far}>
        {[
          [20, 200, 46],
          [80, 170, 34],
          [130, 215, 50],
          [300, 180, 40],
          [350, 150, 30],
          [400, 205, 44],
          [760, 165, 36],
          [810, 205, 52],
          [880, 140, 30],
          [930, 190, 44],
          [1120, 175, 40],
          [1165, 210, 50],
        ].map(([x, y, w], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={330 - y!} />
            {windows(x! + 5, y! + 10, Math.max(2, Math.floor(w! / 11)), 6, 4, 6, 10, 18, `far${i}`)}
          </g>
        ))}
      </g>

      {/* Torre central do Campus com a escultura de anéis. */}
      <g>
        <path d="M570 330 L585 40 L600 0 L615 40 L630 330 Z" fill="url(#hp-tower)" />
        {[0, 1, 2].map((i) => (
          <line key={i} x1={589 + i * 11} y1={330} x2={597 + i * 3} y2={40} stroke={night ? '#7DD3FC' : '#FFFFFF'} strokeWidth="1.6" opacity={night ? 0.8 : 0.5} />
        ))}
        <circle cx="600" cy="236" r="40" fill={p.glow} opacity={lit(0.2)} filter="url(#hp-blur)" />
        <circle cx="600" cy="236" r="18" fill={night ? '#93C5FD' : '#E0F2FE'} stroke={p.metal} strokeWidth="2" />
        {[
          [0, 70, 18],
          [60, 62, 22],
          [120, 76, 14],
        ].map(([rot, rx, ry], i) => (
          <g key={i} transform={`rotate(${rot} 600 236)`}>
            <ellipse cx="600" cy="236" rx={rx} ry={ry} fill="none" stroke={p.metal} strokeWidth="5" opacity="0.95">
              {anim(<animateTransform attributeName="transform" type="rotate" values={`0 600 236; ${i % 2 ? -360 : 360} 600 236`} dur={`${40 + i * 12}s`} repeatCount="indefinite" />)}
            </ellipse>
          </g>
        ))}
      </g>

      {/* Pavilhão curvo de vidro (esquerda). */}
      <g>
        <path d="M60 330 V250 Q60 225 110 222 H360 Q392 224 392 252 V330 Z" fill={p.glass} />
        {[238, 262, 286, 310].map((y) => (
          <line key={y} x1="66" y1={y} x2="388" y2={y} stroke={p.metal} strokeWidth="2.5" />
        ))}
        {windows(78, 242, 14, 4, 16, 14, 22, 24, 'pav')}
        <path d="M50 252 Q60 214 112 210 H362 Q402 212 404 246" fill="none" stroke={p.metal} strokeWidth="4" />
      </g>

      {/* Cúpula de vidro e torre (direita). */}
      <g>
        <path d="M770 330 V286 A110 70 0 0 1 990 286 V330 Z" fill={p.glass} />
        {[-80, -40, 0, 40, 80].map((dx) => (
          <path key={dx} d={`M${880 + dx} 330 Q${880 + dx * 0.7} 250 880 216`} fill="none" stroke={p.metal} strokeWidth="1.6" opacity="0.8" />
        ))}
        {[250, 280, 306].map((y) => (
          <line key={y} x1="790" y1={y} x2="970" y2={y} stroke={p.metal} strokeWidth="1.2" opacity="0.7" />
        ))}
        <ellipse cx="880" cy="292" rx="70" ry="30" fill={p.glow} opacity={lit(0.25)} filter="url(#hp-blur)" />
        <rect x="1010" y="150" width="120" height="180" fill={p.glass} />
        <rect x="1004" y="144" width="132" height="10" fill={p.metal} />
        {windows(1018, 164, 5, 7, 16, 14, 22, 22, 'tw')}
      </g>

      {/* Gramado e árvores (algumas floridas) com luz embaixo. */}
      <path d="M0 330 Q600 300 1200 330 V600 H0 Z" fill={p.grass} />
      {[
        [30, 352, 1.5, '#8B5CF6', '#A78BFA'],
        [120, 340, 1.1, '#2F7D3E', '#3E8E4A'],
        [210, 360, 1.25, '#C084FC', '#A855F7'],
        [430, 340, 1, '#2F7D3E', '#4F9F55'],
        [760, 340, 1, '#2F7D3E', '#4F9F55'],
        [990, 360, 1.25, '#F472B6', '#EC4899'],
        [1080, 342, 1.1, '#2F7D3E', '#3E8E4A'],
        [1170, 352, 1.5, '#8B5CF6', '#A78BFA'],
      ].map(([x, y, s, c, c2], i) => tree(x as number, y as number, s as number, night ? (i % 2 ? '#264F31' : (c as string)) : (c as string), night ? (i % 2 ? '#2E5B38' : (c2 as string)) : (c2 as string), `t${i}`))}

      {/* Caminhos com luzes no chão. */}
      <g fill={p.stone}>
        <path d="M555 520 L330 600 H460 L585 524 Z" />
        <path d="M645 520 L870 600 H740 L615 524 Z" />
        <path d="M380 452 L0 420 V458 L370 470 Z" />
        <path d="M820 452 L1200 420 V458 L830 470 Z" />
      </g>
      {[
        [340, 446],
        [250, 440],
        [160, 434],
        [860, 446],
        [950, 440],
        [1040, 434],
        [520, 560],
        [470, 584],
        [680, 560],
        [730, 584],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="7" fill={p.glow} opacity={lit(0.35)} filter="url(#hp-blur)" />
          <circle cx={x} cy={y} r="2.2" fill={night ? '#FFE8AE' : '#FFFFFF'} opacity={night ? 1 : 0.6} />
        </g>
      ))}

      {/* A praça: piso claro e anéis de luz. */}
      <ellipse cx="600" cy="452" rx="300" ry="86" fill={p.stone} />
      <ellipse cx="600" cy="452" rx="280" ry="78" fill="none" stroke={p.stoneLine} strokeWidth="2" />
      <ellipse cx="600" cy="452" rx="300" ry="86" fill="url(#hp-plaza)" />
      <ellipse cx="600" cy="452" rx="226" ry="62" fill="none" stroke={night ? '#FDBA74' : '#14B8A6'} strokeWidth="3.5" opacity={night ? 0.9 : 0.75} />
      {night && <ellipse cx="600" cy="452" rx="226" ry="62" fill="none" stroke="#FDBA74" strokeWidth="8" opacity="0.35" filter="url(#hp-blur)" />}

      {/* Fonte: bacia larga e um anel de jatos de luz. */}
      <ellipse cx="600" cy="420" rx="150" ry="34" fill={night ? '#3B3F66' : '#CFC6B2'} />
      <ellipse cx="600" cy="416" rx="140" ry="28" fill="url(#hp-water)" />
      <ellipse cx="600" cy="416" rx="120" ry="22" fill={night ? '#60A5FA' : '#FFFFFF'} opacity={night ? 0.25 : 0.15} filter="url(#hp-blur)" />
      {!still &&
        [0, 1, 2].map((i) => (
          <ellipse key={i} cx="600" cy="416" rx="30" ry="6" fill="none" stroke="#FFFFFF" strokeWidth="1.3" opacity="0">
            <animate attributeName="rx" values="26;136" dur="4s" begin={`${i * 1.3}s`} repeatCount="indefinite" />
            <animate attributeName="ry" values="5;26" dur="4s" begin={`${i * 1.3}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0" dur="4s" begin={`${i * 1.3}s`} repeatCount="indefinite" />
          </ellipse>
        ))}
      <g className={still ? undefined : 'home-jets'} stroke={night ? '#BFDBFE' : '#FFFFFF'} strokeLinecap="round" fill="none" opacity="0.9">
        {Array.from({ length: 13 }, (_, i) => {
          const t = (i / 12) * Math.PI;
          const x = 600 - Math.cos(t) * 108;
          const y = 416 - Math.sin(t) * 10;
          const h = 34 + Math.sin(t) * 26 + (i % 2) * 8;
          return <path key={i} d={`M${x} ${y} L${x} ${y - h}`} strokeWidth={i % 3 === 0 ? 3 : 2} />;
        })}
        <path d="M600 410 L600 330" strokeWidth="4" />
      </g>
      {night && <ellipse cx="600" cy="380" rx="120" ry="44" fill="#93C5FD" opacity="0.18" filter="url(#hp-blur)" />}

      {/* Monumento com as letras ROUTIG num canteiro florido. */}
      <g>
        <ellipse cx="600" cy="520" rx="170" ry="28" fill={night ? '#2C4F35' : '#4F9F55'} />
        {Array.from({ length: 34 }, (_, k) => (
          <circle key={k} cx={440 + k * 9.6} cy={518 + (k % 3) * 4 - 4} r="3.2" fill={['#A855F7', '#F472B6', '#FBBF24', '#C084FC'][k % 4]} opacity={night ? 0.85 : 1} />
        ))}
        <rect x="490" y="470" width="220" height="40" rx="4" fill={night ? '#2B2F55' : '#3A4558'} />
        <rect x="490" y="470" width="220" height="4" rx="2" fill={p.metal} />
        {night && (
          <text x="600" y="500" textAnchor="middle" fontSize="30" fontWeight={800} fill="#FFD98A" letterSpacing="6" opacity="0.6" filter="url(#hp-blur)" fontFamily="Inter, system-ui, sans-serif">
            ROUTIG
          </text>
        )}
        <text x="600" y="500" textAnchor="middle" fontSize="30" fontWeight={800} fill={night ? '#FFE8AE' : '#F5F1E6'} letterSpacing="6" fontFamily="Inter, system-ui, sans-serif">
          ROUTIG
        </text>
      </g>

      {/* Postes e os carrinhos de pipoca e de água de coco. */}
      {lamp(330, 470, 1.1, 'l1')}
      {lamp(870, 470, 1.1, 'l2')}
      {lamp(440, 404, 0.85, 'l3')}
      {lamp(760, 404, 0.85, 'l4')}
      <g transform="translate(925 500)">
        <rect x="-20" y="-24" width="40" height="22" rx="3" fill="#E11D48" />
        <rect x="-16" y="-38" width="32" height="14" rx="2" fill="#FDE68A" opacity="0.9" />
        <path d="M-24 -38 L0 -54 L24 -38 Z" fill="#F43F5E" />
        <circle cx="-12" cy="2" r="5" fill="#1F2937" />
        <circle cx="12" cy="2" r="5" fill="#1F2937" />
      </g>
      <g transform="translate(275 500)">
        <rect x="-22" y="-22" width="44" height="20" rx="3" fill="#16A34A" />
        {[-12, 0, 12].map((x) => (
          <circle key={x} cx={x} cy="-28" r="6" fill="#65A30D" />
        ))}
        <path d="M-26 -38 Q0 -56 26 -38" fill="#FBBF24" />
        <circle cx="-13" cy="2" r="5" fill="#1F2937" />
        <circle cx="13" cy="2" r="5" fill="#1F2937" />
      </g>

      {/* Gente passeando pela praça, um ciclista e alguém com o cachorro. */}
      {[
        { c: '#3E6E9E', h: '#2F2A26', d: 'M180 446 L1020 446', dur: '46s', s: 1 },
        { c: '#C2410C', h: '#7A4B2A', d: 'M1040 438 L160 438', dur: '54s', s: 0.95 },
        { c: '#16A34A', h: '#1F1A17', d: 'M420 598 L560 482', dur: '28s', s: 1.3 },
        { c: '#DB2777', h: '#3B2A20', d: 'M790 598 L640 482', dur: '32s', s: 1.25 },
        { c: '#7C3AED', h: '#2F2A26', d: 'M60 470 L380 456', dur: '36s', s: 1.1 },
      ].map((w, i) => (
        <g key={i} transform={still ? `translate(${180 + i * 200} ${i > 1 ? 560 : 446}) scale(${w.s})` : undefined}>
          <g transform={still ? undefined : `scale(${w.s})`}>{person(w.c, w.h, `w${i}`)}</g>
          {anim(<animateMotion dur={w.dur} repeatCount="indefinite" path={w.d} />)}
        </g>
      ))}
      <g transform={still ? 'translate(1000 560)' : undefined}>
        <g>
          {person('#F59E0B', '#2F2A26', 'dog-owner', <line x1="5" y1="-14" x2="20" y2="0" stroke="#1F2937" strokeWidth="1" />)}
          <g transform="translate(24 0)">
            <ellipse cx="0" cy="-3" rx="8" ry="4" fill={night ? '#6B4F3A' : '#A16207'} />
            <circle cx="8" cy="-7" r="3.4" fill={night ? '#6B4F3A' : '#A16207'} />
            <rect x="-6" y="-1" width="2" height="5" fill="#3B2A20" />
            <rect x="4" y="-1" width="2" height="5" fill="#3B2A20" />
          </g>
        </g>
        {anim(<animateMotion dur="60s" repeatCount="indefinite" path="M1180 580 L860 560" />)}
      </g>
      <g transform={still ? 'translate(150 590)' : undefined}>
        <g>
          <circle cx="-14" cy="0" r="9" fill="none" stroke="#1F2937" strokeWidth="2.2" />
          <circle cx="14" cy="0" r="9" fill="none" stroke="#1F2937" strokeWidth="2.2" />
          <path d="M-14 0 L-2 -12 L10 -12 L14 0 M-2 -12 L-6 -20 M10 -12 L10 -18" stroke="#0EA5E9" strokeWidth="2.4" fill="none" />
          <g transform="translate(-2 -14)">{person('#14B8A6', '#2F2A26', 'cyclist')}</g>
        </g>
        {anim(<animateMotion dur="22s" repeatCount="indefinite" path="M-40 590 L1240 584" />)}
      </g>

      {/* Pássaros de dia. */}
      {!night && !still && (
        <g stroke="#374151" strokeWidth="2" fill="none" strokeLinecap="round">
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <path d={`M${-30 - i * 26} ${120 + i * 12} q6 -6 12 0 q6 -6 12 0`} />
              <animateTransform attributeName="transform" type="translate" values="0 0; 1300 -40" dur={`${34 + i * 5}s`} repeatCount="indefinite" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
