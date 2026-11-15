import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Compass, LayoutGrid, Star, Trees } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { CAMPUS_PATH, controlPath, hasControlHistory } from '@/app/experience';
import { readParkContext } from '@/features/park/parkContext';
import { Logo } from '@/brand/Logo';
import { cn } from '@/ui/cn';

type Xp = 'control' | 'campus' | 'district';
const FAV_KEY = 'routig.home.favorite';
const VISITED_KEY = 'routig.home.visited';

function readFav(): Xp | null {
  try {
    const v = localStorage.getItem(FAV_KEY);
    return v === 'control' || v === 'campus' || v === 'district' ? v : null;
  } catch {
    return null;
  }
}

/** Período do dia para a luz da praça e a saudação. */
function periodOf(h: number): 'morning' | 'afternoon' | 'night' {
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'night';
}

/**
 * ROUTIG Home: a porta de entrada do ecossistema. Uma praça com fonte, árvores e gente passando
 * (com a luz do horário), a saudação e as três experiências com a mesma importância. Não mostra
 * tarefas, números nem cobranças: produtividade fica no Control Room e no Campus.
 */
export function HomePage() {
  const { t, settings } = useSettings();
  const navigate = useNavigate();
  const [fav, setFav] = useState<Xp | null>(readFav);
  const [period, setPeriod] = useState(() => periodOf(new Date().getHours()));
  const [returning] = useState(() => {
    try {
      return localStorage.getItem(VISITED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VISITED_KEY, '1');
    } catch {
      /* sem armazenamento */
    }
    const id = window.setInterval(() => setPeriod(periodOf(new Date().getHours())), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const toggleFav = (x: Xp) => {
    const next = fav === x ? null : x;
    setFav(next);
    try {
      if (next) localStorage.setItem(FAV_KEY, next);
      else localStorage.removeItem(FAV_KEY);
    } catch {
      /* sem armazenamento */
    }
  };

  const name = settings.profile.displayName.trim().split(/\s+/)[0] ?? '';
  const hello = t(`home.greeting.${period}`);
  const welcome = returning ? t('home.greeting.back') : t('home.greeting.first');
  const continueControl = hasControlHistory();
  const continueCampus = !!readParkContext();

  const cards: Array<{ id: Xp; icon: typeof Trees; action: string; go: () => void; badge?: string; accent: string; preview: ReactElement }> = [
    { id: 'control', icon: LayoutGrid, action: continueControl ? t('home.continue') : t('home.enter'), go: () => navigate(controlPath()), accent: 'from-[#5B5BF7] to-[#8B5CF6]', preview: <ControlPreview /> },
    { id: 'campus', icon: Trees, action: continueCampus ? t('home.continue') : t('home.enter'), go: () => navigate(CAMPUS_PATH), accent: 'from-[#16A34A] to-[#0EA5E9]', preview: <CampusPreview /> },
    { id: 'district', icon: Compass, action: t('home.xp.district.action'), go: () => navigate('/district'), badge: t('home.xp.district.badge'), accent: 'from-[#F97316] to-[#DB2777]', preview: <DistrictPreview /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Praça de entrada: céu e luz mudam com o horário. */}
      <section className="relative overflow-hidden rounded-3xl shadow-lift ring-1 ring-line">
        <Plaza period={period} label={t(period === 'night' ? 'home.plazaNight' : 'home.plaza')} />
        {/* No alto, à esquerda: a fonte, os bancos e as pessoas ficam à vista embaixo. */}
        <div className="absolute inset-x-0 top-0 p-3 sm:p-5">
          <div className="max-w-sm rounded-2xl bg-surface/90 p-4 shadow-lift ring-1 ring-line backdrop-blur-md sm:p-5">
            <div className="flex items-center gap-3">
              <Logo size={40} className="h-10 w-10 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-subtle">{t('app.name')}</p>
                <h1 className="truncate text-xl font-semibold text-fg sm:text-2xl">{name ? `${hello}, ${name}!` : `${hello}!`}</h1>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted">{welcome}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="xp-title">
        <h2 id="xp-title" className="sr-only">
          {t('home.xp.title')}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            const isFav = fav === c.id;
            return (
              <li key={c.id} className={cn('group flex flex-col overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift motion-reduce:transform-none', isFav ? 'ring-2 ring-amber/70' : 'ring-line')}>
                <div className={cn('relative h-32 bg-gradient-to-br', c.accent)}>
                  {c.preview}
                  <button
                    type="button"
                    onClick={() => toggleFav(c.id)}
                    aria-pressed={isFav}
                    aria-label={isFav ? t('home.unfavorite', { name: t(`home.xp.${c.id}.name`) }) : t('home.favorite', { name: t(`home.xp.${c.id}.name`) })}
                    title={isFav ? t('home.favoriteOn') : t('home.favoriteSet')}
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur transition hover:bg-black/40"
                  >
                    <Star className={cn('h-4 w-4', isFav && 'fill-amber text-amber')} aria-hidden />
                  </button>
                  {c.badge && <span className="absolute left-3 top-3 rounded-full bg-black/35 px-2.5 py-1 text-[0.7rem] font-semibold text-white backdrop-blur">{c.badge}</span>}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-fg">
                    <Icon className="h-5 w-5 text-accent" aria-hidden />
                    {t(`home.xp.${c.id}.name`)}
                  </h3>
                  <p className="flex-1 text-sm text-muted">{t(`home.xp.${c.id}.desc`)}</p>
                  <button type="button" onClick={c.go} className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-glow transition hover:brightness-110">
                    {c.action}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

const SKY = {
  morning: ['#9FD2F2', '#FCE3C4'],
  afternoon: ['#5CB3EE', '#BFE3F7'],
  night: ['#0B1530', '#2B2F5E'],
} as const;

/** Praça desenhada: céu do horário, prédios ao fundo, árvores, caminhos, fonte com água e gente andando. */
function Plaza({ period, label }: { period: 'morning' | 'afternoon' | 'night'; label: string }) {
  const night = period === 'night';
  const still = typeof window !== 'undefined' && (document.documentElement.dataset.motion === 'reduce' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [top, bottom] = SKY[period];
  const grass = night ? '#2E5A35' : '#7DB866';
  const grassFar = night ? '#284C2F' : '#6AA352';
  const stone = night ? '#8C8C9E' : '#E7E1D3';
  const tree = (x: number, y: number, s: number, c: string) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="-4" width="6" height="22" rx="2" fill={night ? '#3B2C22' : '#6B4A33'} />
      <circle cx="0" cy="-16" r="18" fill={c} />
      <circle cx="-12" cy="-8" r="12" fill={c} opacity="0.9" />
      <circle cx="12" cy="-9" r="13" fill={c} opacity="0.9" />
    </g>
  );
  const green = night ? '#2F6B3A' : '#3E8E4A';
  const green2 = night ? '#356F40' : '#4F9F55';
  return (
    <svg viewBox="0 0 1200 460" className="block h-[300px] w-full sm:h-[380px]" preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}>
      <defs>
        <linearGradient id="home-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <radialGradient id="home-glow" cx="0.5" cy="0.6" r="0.5">
          <stop offset="0" stopColor={night ? '#FFE7B0' : '#FFFFFF'} stopOpacity={night ? 0.35 : 0.25} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="460" fill="url(#home-sky)" />
      {night && [80, 210, 340, 520, 690, 840, 980, 1110, 160, 760, 430, 1050].map((x, i) => <circle key={x} cx={x} cy={30 + ((i * 37) % 120)} r={i % 3 ? 1.4 : 2.1} fill="#FFFFFF" opacity="0.8" />)}
      {!night && <circle cx={period === 'morning' ? 180 : 980} cy={period === 'morning' ? 120 : 80} r="38" fill="#FFF4C9" opacity="0.9" />}
      {night && <circle cx="1020" cy="80" r="26" fill="#F5F1E1" />}
      {/* Prédios do Campus ao fundo. */}
      <g fill={night ? '#3A4266' : '#DDE6F1'} opacity="0.95">
        <rect x="120" y="190" width="90" height="90" rx="6" />
        <rect x="230" y="160" width="70" height="120" rx="6" />
        <path d="M840 280 V180 Q900 140 960 180 V280 Z" />
        <rect x="980" y="200" width="110" height="80" rx="6" />
        <rect x="520" y="170" width="160" height="110" rx="10" />
      </g>
      {night && (
        <g fill="#FFE7A8" opacity="0.85">
          {[135, 160, 185, 245, 270, 535, 565, 595, 625, 655, 995, 1025, 1055].map((x, i) => (
            <rect key={x} x={x} y={i < 5 ? 210 + (i % 2) * 30 : i < 10 ? 195 : 220} width="10" height="12" rx="2" />
          ))}
        </g>
      )}
      <path d="M0 270 Q300 240 600 262 T1200 256 V460 H0 Z" fill={grassFar} />
      <path d="M0 300 Q300 280 600 296 T1200 292 V460 H0 Z" fill={grass} />
      {/* Caminhos saindo da praça. */}
      <g fill={stone} opacity="0.95">
        <path d="M560 360 L380 460 H470 L590 365 Z" />
        <path d="M640 360 L820 460 H730 L610 365 Z" />
        <path d="M520 345 L0 330 V350 L515 355 Z" />
        <path d="M680 345 L1200 330 V350 L685 355 Z" />
      </g>
      <ellipse cx="600" cy="352" rx="210" ry="58" fill={stone} />
      <ellipse cx="600" cy="352" rx="210" ry="58" fill="url(#home-glow)" />
      {/* Árvores e canteiros. */}
      {[tree(90, 300, 1.2, green), tree(250, 290, 1, green2), tree(330, 315, 1.3, green), tree(880, 300, 1.15, green2), tree(990, 312, 1.3, green), tree(1120, 296, 1.05, green2)]}
      <ellipse cx="420" cy="380" rx="44" ry="10" fill={night ? '#6B2D4A' : '#F472B6'} opacity="0.8" />
      <ellipse cx="780" cy="380" rx="44" ry="10" fill={night ? '#6B5A2D' : '#FBBF24'} opacity="0.8" />
      {/* Fonte: bacia, pedestal e jatos que sobem e descem. */}
      <ellipse cx="600" cy="352" rx="78" ry="20" fill={night ? '#5F6F8E' : '#C9C1AE'} />
      <ellipse cx="600" cy="349" rx="70" ry="16" fill={night ? '#3F6F9E' : '#5BB0E6'} />
      <rect x="592" y="300" width="16" height="50" rx="6" fill={night ? '#8C8C9E' : '#E7E1D3'} />
      <ellipse cx="600" cy="302" rx="30" ry="7" fill={night ? '#3F6F9E' : '#7CC4EE'} />
      <g className={still ? undefined : 'home-jets'} stroke={night ? '#A9D8FF' : '#FFFFFF'} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M600 300 Q600 262 600 252" />
        <path d="M600 300 Q586 270 572 300" />
        <path d="M600 300 Q614 270 628 300" />
      </g>
      {/* Bancos e postes. */}
      {[460, 740].map((x) => (
        <g key={x}>
          <rect x={x - 22} y="368" width="44" height="6" rx="2" fill={night ? '#5A4636' : '#9A6B43'} />
          <rect x={x - 18} y="374" width="4" height="8" fill="#2B3442" />
          <rect x={x + 14} y="374" width="4" height="8" fill="#2B3442" />
        </g>
      ))}
      {[380, 820].map((x) => (
        <g key={x}>
          <rect x={x - 2} y="300" width="4" height="62" fill="#2B3442" />
          <circle cx={x} cy="298" r="7" fill={night ? '#FFE7A8' : '#F5F5F4'} opacity={night ? 1 : 0.9} />
          {night && <circle cx={x} cy="298" r="22" fill="#FFE7A8" opacity="0.18" />}
        </g>
      ))}
      {/* Gente passeando pela praça (para quem pede menos movimento, ficam paradas). */}
      {[
        { c: '#3E6E9E', d: 'M150 345 L1050 345', dur: '38s' },
        { c: '#C2410C', d: 'M1080 338 L120 338', dur: '46s' },
        { c: '#16A34A', d: 'M470 455 L600 372', dur: '24s' },
      ].map((p, i) => (
        <g key={i} transform={still ? `translate(${300 + i * 260} ${i === 2 ? 410 : 342})` : undefined}>
          <g>
            <circle r="4.5" cy="-24" fill={night ? '#C9A27E' : '#E0B48C'} />
            <rect x="-5" y="-20" width="10" height="14" rx="3" fill={p.c} />
            <rect x="-4" y="-6" width="3" height="10" fill="#2F3A4F" />
            <rect x="1" y="-6" width="3" height="10" fill="#2F3A4F" />
            {still ? null : <animateMotion dur={p.dur} repeatCount="indefinite" path={p.d} />}
          </g>
        </g>
      ))}
    </svg>
  );
}

/** Prévia do Control Room: painéis organizados lado a lado. */
function ControlPreview() {
  return (
    <svg viewBox="0 0 300 128" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect x="20" y="18" width="70" height="92" rx="10" fill="#FFFFFF" opacity="0.22" />
      <rect x="100" y="18" width="180" height="40" rx="10" fill="#FFFFFF" opacity="0.3" />
      <rect x="100" y="66" width="86" height="44" rx="10" fill="#FFFFFF" opacity="0.22" />
      <rect x="194" y="66" width="86" height="44" rx="10" fill="#FFFFFF" opacity="0.18" />
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x="30" y={30 + k * 18} width="50" height="8" rx="4" fill="#FFFFFF" opacity="0.55" />
      ))}
      <rect x="114" y="32" width="90" height="8" rx="4" fill="#FFFFFF" opacity="0.7" />
    </svg>
  );
}

/** Prévia do Campus: prédios no parque, com caminho e árvores. */
function CampusPreview() {
  return (
    <svg viewBox="0 0 300 128" className="absolute inset-0 h-full w-full" aria-hidden>
      <path d="M0 96 Q150 80 300 92 V128 H0 Z" fill="#FFFFFF" opacity="0.18" />
      <rect x="60" y="48" width="44" height="50" rx="5" fill="#FFFFFF" opacity="0.55" />
      <path d="M160 98 V58 Q182 38 204 58 V98 Z" fill="#FFFFFF" opacity="0.7" />
      <rect x="226" y="62" width="40" height="36" rx="5" fill="#FFFFFF" opacity="0.45" />
      <path d="M120 128 Q150 104 150 98" stroke="#FFFFFF" strokeWidth="8" opacity="0.5" fill="none" />
      {[30, 130, 280].map((x) => (
        <circle key={x} cx={x} cy="86" r="12" fill="#14532D" opacity="0.55" />
      ))}
    </svg>
  );
}

/** Prévia do District: cidade grande ao entardecer. */
function DistrictPreview() {
  return (
    <svg viewBox="0 0 300 128" className="absolute inset-0 h-full w-full" aria-hidden>
      {[
        [20, 60, 30],
        [56, 36, 34],
        [96, 70, 24],
        [126, 24, 40],
        [172, 54, 30],
        [208, 40, 36],
        [250, 66, 34],
      ].map(([x, y, w]) => (
        <rect key={x} x={x} y={y} width={w} height={128 - y!} fill="#1E1B2E" opacity="0.55" />
      ))}
      <circle cx="240" cy="30" r="14" fill="#FDE68A" opacity="0.8" />
    </svg>
  );
}
