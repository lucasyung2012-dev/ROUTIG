import type { ReactElement } from 'react';

export type Period = 'morning' | 'afternoon' | 'night';

const PALETTE = {
  morning: { sky: ['#8FCBF0', '#FBE4C8'], sun: '#FFF1C2', hill: ['#8EC27A', '#76B066'], grass: '#86C06E', grass2: '#7AB563', stone: '#EEE8DB', ring: '#14B8A6', water: ['#7CC8F0', '#3E9ED6'], bldg: '#E9EEF5', bldgShade: '#C9D3E0', win: '#BFD9EE' },
  afternoon: { sky: ['#4FA8EA', '#BFE3F7'], sun: '#FFF7D6', hill: ['#7DB866', '#6AA352'], grass: '#7DB866', grass2: '#6FAA5A', stone: '#E7E1D3', ring: '#14B8A6', water: ['#6EC1EE', '#2F8FCC'], bldg: '#EDF1F7', bldgShade: '#C3CEDC', win: '#9CC7E8' },
  night: { sky: ['#0A1330', '#2A2D5C'], sun: '#F3EFDF', hill: ['#21412A', '#1B3623'], grass: '#2D5734', grass2: '#284E2E', stone: '#7E8197', ring: '#0F766E', water: ['#2C5B85', '#1B3F63'], bldg: '#2F3658', bldgShade: '#252B48', win: '#FFE3A1' },
} as const;

/**
 * A praça do ROUTIG Home, desenhada: céu e luz do horário (manhã, tarde, noite), colinas e o
 * horizonte do Campus (biblioteca, observatório, academia, estufa), a praça com os anéis de pedra
 * e a fonte de dois níveis com jatos e ondas, canteiros, sebes, árvores, bancos, postes, os
 * carrinhos de pipoca e de água de coco, e gente passeando (a pé, de bicicleta, com o cachorro).
 * Leve: um SVG só, animações em CSS/SMIL que param com "menos movimento".
 */
export function HomePlaza({ period, label, still, className }: { period: Period; label: string; still: boolean; className?: string }) {
  const p = PALETTE[period];
  const night = period === 'night';
  const anim = (el: ReactElement) => (still ? null : el);

  const tree = (x: number, y: number, s: number, c: string, c2: string, k: string) => (
    <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="22" rx="16" ry="4" fill="#000" opacity="0.12" />
      <rect x="-2.5" y="-2" width="5" height="24" rx="2" fill={night ? '#3B2C22' : '#6B4A33'} />
      <circle cx="0" cy="-14" r="17" fill={c} />
      <circle cx="-12" cy="-6" r="12" fill={c2} />
      <circle cx="12" cy="-7" r="13" fill={c2} />
      <circle cx="4" cy="-22" r="10" fill={c} opacity="0.9" />
    </g>
  );
  const palm = (x: number, y: number, s: number, k: string) => (
    <g key={k} transform={`translate(${x} ${y}) scale(${s})`} stroke={night ? '#2E5B33' : '#3E8E4A'} strokeWidth="5" strokeLinecap="round" fill="none">
      <path d="M0 24 Q3 0 0 -30" stroke={night ? '#4A3828' : '#8A6A48'} strokeWidth="4" />
      <path d="M0 -30 Q-18 -38 -30 -24" />
      <path d="M0 -30 Q18 -40 30 -26" />
      <path d="M0 -30 Q-8 -46 -22 -46" />
      <path d="M0 -30 Q10 -48 24 -46" />
    </g>
  );
  const bench = (x: number, y: number, s: number, k: string) => (
    <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-20" y="-10" width="40" height="4" rx="1.5" fill={night ? '#5A4636' : '#A0714F'} />
      <rect x="-20" y="-3" width="40" height="5" rx="1.5" fill={night ? '#5A4636' : '#9A6B43'} />
      <rect x="-17" y="2" width="3" height="8" fill="#2B3442" />
      <rect x="14" y="2" width="3" height="8" fill="#2B3442" />
    </g>
  );
  const lamp = (x: number, y: number, s: number, k: string) => (
    <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
      {night && <circle cx="0" cy="-62" r="26" fill="#FFE7A8" opacity="0.18" />}
      <rect x="-1.8" y="-60" width="3.6" height="60" fill="#2B3442" />
      <circle cx="0" cy="-62" r="6" fill={night ? '#FFE7A8' : '#F5F5F4'} />
    </g>
  );
  const person = (c: string, hair: string, k: string, extra?: ReactElement) => (
    <g key={k}>
      <circle cy="-27" r="4.6" fill="#D9A981" />
      <path d={`M-4.6 -29 Q0 -35 4.6 -29 L4.6 -27 L-4.6 -27 Z`} fill={hair} />
      <rect x="-5.5" y="-22" width="11" height="14" rx="3.5" fill={c} />
      <rect x="-4.3" y="-8" width="3.4" height="11" rx="1.4" fill="#2F3A4F" />
      <rect x="0.9" y="-8" width="3.4" height="11" rx="1.4" fill="#2F3A4F" />
      {extra}
    </g>
  );

  return (
    <svg viewBox="0 0 1200 500" className={className ?? "block h-[300px] w-full"} preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}>
      <defs>
        <linearGradient id="hp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="1" stopColor={p.sky[1]} />
        </linearGradient>
        <radialGradient id="hp-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={p.sun} stopOpacity="1" />
          <stop offset="0.35" stopColor={p.sun} stopOpacity="0.85" />
          <stop offset="1" stopColor={p.sun} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hp-water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.water[0]} />
          <stop offset="1" stopColor={p.water[1]} />
        </linearGradient>
        <radialGradient id="hp-plaza" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor={night ? '#FFE7B0' : '#FFFFFF'} stopOpacity={night ? 0.28 : 0.35} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Céu, sol ou lua, estrelas e nuvens. */}
      <rect width="1200" height="500" fill="url(#hp-sky)" />
      {night &&
        Array.from({ length: 46 }, (_, i) => (
          <circle key={i} cx={(i * 263) % 1200} cy={12 + ((i * 97) % 170)} r={i % 5 === 0 ? 1.9 : 1.1} fill="#FFFFFF" opacity={0.5 + ((i * 13) % 5) / 10}>
            {anim(<animate attributeName="opacity" values="0.9;0.3;0.9" dur={`${3 + (i % 4)}s`} repeatCount="indefinite" />)}
          </circle>
        ))}
      <circle cx={period === 'morning' ? 190 : period === 'afternoon' ? 960 : 1010} cy={period === 'afternoon' ? 70 : 100} r={night ? 70 : 110} fill="url(#hp-sun)" />
      {night ? <circle cx="1010" cy="100" r="22" fill="#F5F1E1" /> : <circle cx={period === 'morning' ? 190 : 960} cy={period === 'afternoon' ? 70 : 100} r="30" fill={p.sun} />}
      <g fill="#FFFFFF" opacity={night ? 0.12 : 0.8}>
        {[
          [120, 70, 1],
          [560, 50, 1.3],
          [820, 120, 0.9],
          [330, 140, 0.7],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <g>
              <ellipse cx="0" cy="0" rx="46" ry="14" />
              <ellipse cx="-22" cy="-8" rx="22" ry="14" />
              <ellipse cx="16" cy="-12" rx="26" ry="17" />
              {anim(<animateTransform attributeName="transform" type="translate" values="0 0; 40 0; 0 0" dur={`${60 + i * 17}s`} repeatCount="indefinite" />)}
            </g>
          </g>
        ))}
      </g>

      {/* Colinas ao fundo. */}
      <path d="M0 250 Q160 190 330 228 T660 214 T980 222 T1200 200 V500 H0 Z" fill={p.hill[1]} opacity="0.75" />
      <path d="M0 262 Q220 226 430 250 T860 238 T1200 246 V500 H0 Z" fill={p.hill[0]} />

      {/* Horizonte do Campus: biblioteca (colunas), observatório (cúpula), academia, torre de vidro, estufa. */}
      <g>
        <g transform="translate(150 192)">
          <rect x="0" y="18" width="128" height="62" fill={p.bldg} />
          <path d="M-6 18 L64 -4 L134 18 Z" fill={p.bldgShade} />
          {[10, 32, 54, 76, 98, 116].map((x) => (
            <rect key={x} x={x} y="24" width="6" height="56" fill={p.bldgShade} />
          ))}
        </g>
        <g transform="translate(360 186)">
          <rect x="0" y="34" width="118" height="54" fill={p.bldg} />
          <path d="M14 34 A45 45 0 0 1 104 34 Z" fill={p.bldgShade} />
          <rect x="54" y="-18" width="8" height="18" fill={p.bldgShade} />
          {[12, 34, 56, 78, 98].map((x) => (
            <rect key={x} x={x} y="48" width="12" height="16" rx="2" fill={p.win} opacity={night ? 0.9 : 0.7} />
          ))}
        </g>
        <g transform="translate(760 176)">
          <rect x="0" y="0" width="58" height="98" fill={p.bldg} />
          <rect x="62" y="30" width="96" height="68" fill={night ? '#3B2C35' : '#C9785A'} />
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={8 + c * 16} y={10 + r * 21} width="9" height="12" fill={p.win} opacity={night && (r + c) % 3 ? 0.95 : 0.6} />),
          )}
          {[0, 1].map((r) => [0, 1, 2, 3, 4].map((c) => <rect key={`b${r}${c}`} x={70 + c * 17} y={40 + r * 26} width="10" height="14" fill={night ? '#FFE3A1' : '#F3E3D3'} opacity={night && c % 2 ? 0.9 : 0.75} />))}
        </g>
        <g transform="translate(1000 196)">
          <path d="M0 70 V30 Q60 -18 120 30 V70 Z" fill={night ? '#2F5A55' : '#CDEFE6'} opacity="0.95" />
          {[20, 40, 60, 80, 100].map((x) => (
            <line key={x} x1={x} y1="70" x2={x} y2={x < 60 ? 30 - x / 5 : 30 - (120 - x) / 5} stroke={p.bldgShade} strokeWidth="2" />
          ))}
        </g>
        <g transform="translate(560 150)">
          <rect x="0" y="0" width="44" height="122" fill={night ? '#34406B' : '#D6E6F5'} />
          {Array.from({ length: 8 }, (_, r) => (
            <rect key={r} x="4" y={8 + r * 14} width="36" height="7" fill={p.win} opacity={night && r % 2 ? 0.95 : 0.55} />
          ))}
        </g>
      </g>

      {/* Linha de árvores atrás da praça. */}
      {[
        [40, 262, 1.4],
        [110, 270, 1.1],
        [300, 268, 1.2],
        [470, 266, 1.05],
        [700, 268, 1.15],
        [880, 270, 1.25],
        [1080, 262, 1.3],
        [1160, 272, 1.05],
      ].map(([x, y, s], i) => tree(x!, y!, s!, i % 2 ? (night ? '#2F6B3A' : '#3E8E4A') : night ? '#2A5E33' : '#4F9F55', night ? '#356F40' : '#5BAA5E', `t${i}`))}
      {palm(250, 292, 1.1, 'p1')}
      {palm(960, 288, 1.2, 'p2')}

      {/* Gramado e caminhos saindo da praça. */}
      <path d="M0 292 Q600 268 1200 292 V500 H0 Z" fill={p.grass} />
      <g fill={p.stone}>
        <path d="M560 420 L360 500 H470 L585 424 Z" />
        <path d="M640 420 L840 500 H730 L615 424 Z" />
        <path d="M420 382 L0 352 V384 L410 396 Z" />
        <path d="M780 382 L1200 352 V384 L790 396 Z" />
        <path d="M585 338 L560 300 H640 L615 338 Z" />
      </g>

      {/* A praça: pedra clara, anéis e a luz do centro. */}
      <ellipse cx="600" cy="386" rx="270" ry="72" fill={p.stone} />
      <ellipse cx="600" cy="386" rx="250" ry="64" fill="none" stroke={night ? '#696C80' : '#D4CBB8'} strokeWidth="2" />
      <ellipse cx="600" cy="386" rx="168" ry="43" fill="none" stroke={p.ring} strokeWidth="4" opacity="0.85" />
      <ellipse cx="600" cy="386" rx="270" ry="72" fill="url(#hp-plaza)" />

      {/* Canteiros floridos e sebes nas bordas da praça. */}
      {[
        [395, 360, '#F472B6'],
        [805, 360, '#FBBF24'],
        [430, 424, '#C084FC'],
        [770, 424, '#FB7185'],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <ellipse cx={x as number} cy={y as number} rx="40" ry="10" fill={night ? '#2E5A34' : '#4F9F55'} />
          {Array.from({ length: 9 }, (_, k) => (
            <circle key={k} cx={(x as number) - 30 + k * 7.5} cy={(y as number) - 2 + (k % 2) * 3} r="2.6" fill={night ? '#9A7A94' : (c as string)} />
          ))}
        </g>
      ))}

      {/* Fonte de dois níveis: bacia, água com ondas, pedestal, taça e jatos. */}
      <ellipse cx="600" cy="392" rx="96" ry="25" fill={night ? '#4A4E64' : '#CFC6B2'} />
      <ellipse cx="600" cy="388" rx="88" ry="20" fill="url(#hp-water)" />
      {!still &&
        [0, 1, 2].map((i) => (
          <ellipse key={i} cx="600" cy="388" rx="20" ry="5" fill="none" stroke="#FFFFFF" strokeWidth="1.4" opacity="0">
            <animate attributeName="rx" values="16;84" dur="3.6s" begin={`${i * 1.2}s`} repeatCount="indefinite" />
            <animate attributeName="ry" values="4;19" dur="3.6s" begin={`${i * 1.2}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0" dur="3.6s" begin={`${i * 1.2}s`} repeatCount="indefinite" />
          </ellipse>
        ))}
      <rect x="590" y="338" width="20" height="50" rx="6" fill={night ? '#8C8C9E' : '#EDE7D9'} />
      <ellipse cx="600" cy="340" rx="38" ry="9" fill={night ? '#8C8C9E' : '#E3DCCB'} />
      <ellipse cx="600" cy="338" rx="32" ry="6" fill="url(#hp-water)" />
      <rect x="596" y="314" width="8" height="24" rx="3" fill={night ? '#9A9AAE' : '#F2EDE2'} />
      <g className={still ? undefined : 'home-jets'} stroke={night ? '#A9D8FF' : '#FFFFFF'} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M600 314 Q600 280 600 268" />
        <path d="M600 316 Q584 292 568 338" />
        <path d="M600 316 Q616 292 632 338" />
        <path d="M570 340 Q556 360 548 384" strokeWidth="2" />
        <path d="M630 340 Q644 360 652 384" strokeWidth="2" />
      </g>

      {/* Bancos, postes e os carrinhos de pipoca e de água de coco. */}
      {bench(470, 372, 1, 'b1')}
      {bench(730, 372, 1, 'b2')}
      {bench(500, 420, 1.15, 'b3')}
      {bench(700, 420, 1.15, 'b4')}
      {lamp(355, 380, 1, 'l1')}
      {lamp(845, 380, 1, 'l2')}
      {lamp(560, 470, 1.25, 'l3')}
      {lamp(640, 470, 1.25, 'l4')}
      <g transform="translate(870 410)">
        <rect x="-20" y="-24" width="40" height="22" rx="3" fill="#E11D48" />
        <rect x="-16" y="-38" width="32" height="14" rx="2" fill="#FDE68A" opacity="0.9" />
        <path d="M-24 -38 L0 -54 L24 -38 Z" fill="#F43F5E" />
        <circle cx="-12" cy="2" r="5" fill="#1F2937" />
        <circle cx="12" cy="2" r="5" fill="#1F2937" />
      </g>
      <g transform="translate(330 410)">
        <rect x="-22" y="-22" width="44" height="20" rx="3" fill="#16A34A" />
        {[-12, 0, 12].map((x) => (
          <circle key={x} cx={x} cy="-28" r="6" fill="#65A30D" />
        ))}
        <path d="M-26 -38 Q0 -56 26 -38" fill="#FBBF24" />
        <circle cx="-13" cy="2" r="5" fill="#1F2937" />
        <circle cx="13" cy="2" r="5" fill="#1F2937" />
      </g>

      {/* Gente: casal no banco, pessoas passeando, ciclista e alguém com o cachorro. */}
      <g transform="translate(722 368)">{person('#7C3AED', '#2F2A26', 's1')}</g>
      <g transform="translate(738 368)">{person('#0EA5E9', '#7A4B2A', 's2')}</g>
      {[
        { c: '#3E6E9E', h: '#2F2A26', d: 'M160 380 L1040 380', dur: '44s', s: 1 },
        { c: '#C2410C', h: '#7A4B2A', d: 'M1060 372 L140 372', dur: '52s', s: 0.95 },
        { c: '#16A34A', h: '#1F1A17', d: 'M440 496 L590 404', dur: '26s', s: 1.25 },
        { c: '#DB2777', h: '#3B2A20', d: 'M780 496 L612 404', dur: '30s', s: 1.2 },
      ].map((w, i) => (
        <g key={i} transform={still ? `translate(${260 + i * 210} ${i > 1 ? 450 : 376}) scale(${w.s})` : undefined}>
          <g transform={still ? undefined : `scale(${w.s})`}>{person(w.c, w.h, `w${i}`)}</g>
          {anim(<animateMotion dur={w.dur} repeatCount="indefinite" path={w.d} />)}
        </g>
      ))}
      <g transform={still ? 'translate(980 440)' : undefined}>
        <g>
          {person('#F59E0B', '#2F2A26', 'dog-owner', <line x1="5" y1="-14" x2="20" y2="0" stroke="#1F2937" strokeWidth="1" />)}
          <g transform="translate(24 0)">
            <ellipse cx="0" cy="-3" rx="8" ry="4" fill={night ? '#6B4F3A' : '#A16207'} />
            <circle cx="8" cy="-7" r="3.4" fill={night ? '#6B4F3A' : '#A16207'} />
            <rect x="-6" y="-1" width="2" height="5" fill="#3B2A20" />
            <rect x="4" y="-1" width="2" height="5" fill="#3B2A20" />
          </g>
        </g>
        {anim(<animateMotion dur="58s" repeatCount="indefinite" path="M1180 460 L20 452" />)}
      </g>
      <g transform={still ? 'translate(200 470)' : undefined}>
        <g>
          <circle cx="-14" cy="0" r="9" fill="none" stroke="#1F2937" strokeWidth="2.2" />
          <circle cx="14" cy="0" r="9" fill="none" stroke="#1F2937" strokeWidth="2.2" />
          <path d="M-14 0 L-2 -12 L10 -12 L14 0 M-2 -12 L-6 -20 M10 -12 L10 -18" stroke="#0EA5E9" strokeWidth="2.4" fill="none" />
          <g transform="translate(-2 -14)">{person('#14B8A6', '#2F2A26', 'cyclist')}</g>
        </g>
        {anim(<animateMotion dur="20s" repeatCount="indefinite" path="M-40 478 L1240 470" />)}
      </g>

      {/* Pássaros de dia. */}
      {!night && !still && (
        <g stroke={period === 'morning' ? '#4B5563' : '#374151'} strokeWidth="2" fill="none" strokeLinecap="round">
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
