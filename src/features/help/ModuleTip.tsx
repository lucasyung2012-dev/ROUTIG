import { Lightbulb, X } from 'lucide-react';
import { MODULES, type ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';

const IDS = Object.keys(MODULES) as ModuleId[];

/** O módulo cuja tela inicial é este caminho (as telas internas não mostram dica). */
export function tipModuleFor(pathname: string): ModuleId | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  return IDS.find((id) => MODULES[id].path === path) ?? null;
}

/**
 * Tutorial contextual (Parte 29.4): uma explicação curta na tela inicial de
 * cada módulo, opcional. "Entendi" esconde aquela; "Não mostrar dicas" desliga
 * todas (dá para ligar de novo em Settings → Ajuda).
 */
export function ModuleTip({ pathname }: { pathname: string }) {
  const { t, settings, update } = useSettings();
  const id = tipModuleFor(pathname);
  if (!id || !settings.tips.enabled || settings.tips.dismissed.includes(id)) return null;
  const dismiss = () => void update((s) => ({ ...s, tips: { ...s.tips, dismissed: [...new Set([...s.tips.dismissed, id])] } }));
  return (
    <aside aria-label={t('tips.label')} className="mb-6 flex items-start gap-3 rounded-2xl bg-accent/[0.07] p-4 ring-1 ring-inset ring-accent/20">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Lightbulb className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{t(`tips.modules.${id}.title`)}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t(`tips.modules.${id}.body`)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={dismiss}>
            {t('tips.gotIt')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void update((s) => ({ ...s, tips: { ...s.tips, enabled: false } }))}>
            {t('tips.turnOff')}
          </Button>
        </div>
      </div>
      <IconButton size="sm" label={t('tips.gotIt')} icon={<X className="h-4 w-4" />} onClick={dismiss} />
    </aside>
  );
}
