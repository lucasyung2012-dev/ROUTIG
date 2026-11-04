import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  Camera,
  Cpu,
  FlaskConical,
  Gamepad2,
  Globe,
  Heart,
  Languages,
  Lightbulb,
  Music,
  Palette,
  PiggyBank,
  Sparkles,
  Star,
  Trophy,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { loadCategories } from '@/data/interestsRepo';
import { BUILTIN_INTEREST_CATEGORIES, isBuiltinCategory, type Interest, type InterestIcon, type InterestStatus } from '@/domain/interests';
import { useObjectUrl } from '@/features/files/useObjectUrl';
import { cn } from '@/ui/cn';

export const INTEREST_ICON: Record<InterestIcon, LucideIcon> = {
  sparkles: Sparkles,
  cpu: Cpu,
  flask: FlaskConical,
  wrench: Wrench,
  languages: Languages,
  music: Music,
  trophy: Trophy,
  book: BookOpen,
  palette: Palette,
  lightbulb: Lightbulb,
  piggy: PiggyBank,
  globe: Globe,
  camera: Camera,
  gamepad: Gamepad2,
  heart: Heart,
  star: Star,
};

export const INTEREST_STATUS_TONE: Record<InterestStatus, 'info' | 'accent' | 'success' | 'neutral'> = {
  exploring: 'info',
  developing: 'accent',
  consolidated: 'success',
  paused: 'neutral',
};

/** Categorias de fábrica + as criadas pelo usuário, já com o nome traduzido. */
export function useInterestCategories() {
  const { t } = useSettings();
  const custom = useLiveQuery(() => loadCategories(), []) ?? [];
  const list = [...BUILTIN_INTEREST_CATEGORIES.map((id) => ({ id, name: t(`profile.category.${id}`) })), ...custom];
  const nameOf = (id: string) => (isBuiltinCategory(id) ? t(`profile.category.${id}`) : (custom.find((c) => c.id === id)?.name ?? t('profile.category.other')));
  return { list, nameOf };
}

export function InterestCover({ interest, className }: { interest: Pick<Interest, 'coverFileId' | 'color' | 'icon'>; className?: string }) {
  const url = useObjectUrl(interest.coverFileId);
  const Icon = INTEREST_ICON[interest.icon];
  return (
    <div className={cn('relative overflow-hidden', className)} style={url ? undefined : { background: `linear-gradient(135deg, ${interest.color}, ${interest.color}55)` }} aria-hidden>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <Icon className="absolute -bottom-3 right-3 h-20 w-20 text-white/25" />}
    </div>
  );
}

export function InterestBadgeIcon({ interest, className }: { interest: Pick<Interest, 'color' | 'icon'>; className?: string }) {
  const Icon = INTEREST_ICON[interest.icon];
  return (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-soft', className)} style={{ background: interest.color }}>
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
}
