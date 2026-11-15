import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Compass, LayoutGrid, Star, Trees } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { CAMPUS_PATH, controlPath, hasControlHistory } from '@/app/experience';
import { readParkContext } from '@/features/park/parkContext';
import { cn } from '@/ui/cn';
import { usePeriod } from './period';

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

/**
 * ROUTIG Home: a tela inicial, como o menu de abertura de um jogo. O cenário (a praça com a torre de
 * anéis, a fonte e as letras ROUTIG no canteiro) fica por trás de tudo, desenhado pela moldura
 * (HomeShell); aqui ficam a saudação e as três experiências, com a mesma importância, em painéis de
 * vidro. É uma tela 2D; não mostra tarefas, números nem cobranças: produtividade fica no Control Room
 * e no Campus.
 */
export function HomePage() {
  const { t, settings } = useSettings();
  const navigate = useNavigate();
  const [fav, setFav] = useState<Xp | null>(readFav);
  const period = usePeriod();
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

  const cards: Array<{ id: Xp; icon: typeof Trees; action: string; go: () => void; badge?: string; accent: string; glow: string; preview: ReactElement }> = [
    { id: 'control', icon: LayoutGrid, action: continueControl ? t('home.continue') : t('home.enter'), go: () => navigate(controlPath()), accent: 'from-[#5B5BF7] to-[#8B5CF6]', glow: '139 92 246', preview: <ControlPreview /> },
    { id: 'campus', icon: Trees, action: continueCampus ? t('home.continue') : t('home.enter'), go: () => navigate(CAMPUS_PATH), accent: 'from-[#16A34A] to-[#0EA5E9]', glow: '45 212 191', preview: <CampusPreview /> },
    { id: 'district', icon: Compass, action: t('home.xp.district.action'), go: () => navigate('/district'), badge: t('home.xp.district.badge'), accent: 'from-[#F97316] to-[#DB2777]', glow: '251 146 60', preview: <DistrictPreview /> },
  ];

  return (
    <div className="theme-dark relative text-fg">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col px-4 pb-6 pt-6 sm:px-8 md:min-h-[100dvh] md:pt-10">
        {/* Saudação, no alto, sobre o céu. */}
        <header className="max-w-xl text-center sm:text-left">
          <h1 className="text-3xl font-semibold text-white drop-shadow-[0_2px_10px_rgba(8,11,28,0.6)] sm:text-4xl">{name ? `${hello}, ${name}!` : `${hello}!`}</h1>
          <p className="mt-1.5 text-sm font-medium text-white/90 drop-shadow-[0_1px_8px_rgba(8,11,28,0.7)] sm:text-base">{welcome}</p>
        </header>

        <div className="min-h-[4vh] flex-1" />

        {/* Menu: as três experiências, no meio da praça. */}
        <section aria-labelledby="xp-title">
          <h2 id="xp-title" className="sr-only">
            {t('home.xp.title')}
          </h2>
          <ul className="grid gap-3 sm:gap-4 lg:grid-cols-3">
            {cards.map((c, i) => {
              const Icon = c.icon;
              const isFav = fav === c.id;
              return (
                <li
                  key={c.id}
                  style={{ animationDelay: `${120 + i * 90}ms`, '--card-glow': c.glow } as CSSProperties}
                  className={cn(
                    'group relative flex animate-fade-up overflow-hidden rounded-2xl bg-surface/55 ring-1 backdrop-blur-xl transition duration-300 hover:-translate-y-1 motion-reduce:transform-none lg:flex-col',
                    'shadow-[0_10px_40px_-12px_rgba(8,11,28,0.7)] hover:shadow-[0_0_36px_-6px_rgb(var(--card-glow)/0.75)]',
                    isFav ? 'ring-2 ring-amber/80' : 'ring-white/15 hover:ring-[rgb(var(--card-glow)/0.7)]',
                  )}
                >
                  {/* Borda de luz no alto do painel, na cor da experiência. */}
                  <span aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r opacity-90', c.accent)} />
                  <div className={cn('relative w-28 shrink-0 bg-gradient-to-br sm:w-36 lg:h-28 lg:w-auto', c.accent)}>
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
                    {c.badge && <span className="absolute bottom-2 left-2 rounded-full bg-black/35 px-2.5 py-1 text-[0.7rem] font-semibold text-white backdrop-blur lg:bottom-auto lg:left-3 lg:top-3">{c.badge}</span>}
                    {isFav && !c.badge && <span className="absolute left-3 top-3 hidden rounded-full bg-black/35 px-2.5 py-1 text-[0.7rem] font-semibold text-white backdrop-blur lg:inline">{t('home.favoriteOn')}</span>}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5 sm:p-4">
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-[0_0_14px_-2px_rgb(var(--card-glow)/0.8)]', c.accent)}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      {t(`home.xp.${c.id}.name`)}
                    </h3>
                    <p className="flex-1 text-sm text-white/75">{t(`home.xp.${c.id}.desc`)}</p>
                    <button
                      type="button"
                      onClick={c.go}
                      className={cn('mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-4 text-sm font-semibold text-white shadow-[0_0_20px_-6px_rgb(var(--card-glow)/0.9)] transition hover:brightness-110 active:scale-[0.98]', c.accent)}
                    >
                      {c.action}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Espaço livre embaixo: a fonte e as letras ROUTIG no canteiro aparecem por baixo do menu. */}
        <div aria-hidden className="hidden md:block md:h-[26vh]" />
      </div>
    </div>
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
