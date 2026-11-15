import { useEffect } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { FinanceLock } from '@/features/finance/FinanceLock';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { LoadingState } from '@/ui/States';
import type { CalendarSector, FinanceSector, ProjectsSector, TasksSector } from '../interiors/east';
import type { VaultState } from '../interiors/things';
import { CalendarStations } from './east/CalendarStations';
import { FinanceStations } from './east/FinanceStations';
import { ProjectsStations } from './east/ProjectsStations';
import { TasksStations } from './east/TasksStations';

/*
 * Prédios do leste: cada setor é uma estação do próprio prédio (panels/east), que faz ali mesmo a
 * atividade real do módulo com os mesmos repos e hooks do Control Room. O Control Room fica a um
 * toque ("Abrir no Control Room"), só para a edição mais funda.
 */

/* ---------- Observatório Temporal (Calendar) ---------- */

export function CalendarPanel({ id }: { id: CalendarSector }) {
  return <CalendarStations key={id} id={id} />;
}

/* ---------- Centro de Operações (Tasks) ---------- */

export function TasksPanel({ id }: { id: TasksSector }) {
  return <TasksStations key={id} id={id} />;
}

/* ---------- Centro de Projetos (Projects) ---------- */

export function ProjectsPanel({ id }: { id: ProjectsSector }) {
  return <ProjectsStations key={id} id={id} />;
}

/* ---------- Finanças (atrás do mesmo PIN de Finanças) ---------- */

export function FinancePanel({ id }: { id: FinanceSector }) {
  return <FinanceStations key={id} id={id} />;
}

/* ---------- Cofre de Finanças (térreo do prédio) ---------- */

/** Monta só quando o bloqueio de Finanças deixa passar (PIN certo, ou PIN removido em "Esqueci o PIN"). */
function VaultOpened({ onOpened }: { onOpened: () => void }) {
  useEffect(() => {
    onOpened();
  }, []);
  return null;
}

/**
 * Janela do cofre. Trancado: o mesmo bloqueio da tela de Finanças (FinanceLock: o mesmo PIN, as
 * mesmas esperas depois de erros, o mesmo "Esqueci o PIN"); passou, Finanças fica desbloqueado
 * nesta sessão exatamente como pela tela de Finanças. Aberto: oferece trancar de novo (o mesmo
 * "Bloquear agora" de Finanças). Sem PIN: diz onde ele é criado. Nada do PIN passa por aqui.
 */
export function FinanceVaultPanel({ state, onClose, onOpened, onLock, onGoToFinance }: { state: VaultState | 'loading'; onClose: () => void; onOpened: () => void; onLock: () => void; onGoToFinance: () => void }) {
  const { t } = useSettings();
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('park.vault.title')}
      size="sm"
      description={state === 'open' ? t('park.vault.openBody') : state === 'none' ? t('park.vault.noPinBody') : state === 'locked' ? t('park.vault.lockedBody') : undefined}
      footer={
        state === 'open' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button variant="primary" icon={<Lock className="h-4 w-4" />} onClick={onLock}>
              {t('park.vault.lockAgain')}
            </Button>
          </>
        ) : state === 'none' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button variant="primary" icon={<KeyRound className="h-4 w-4" />} onClick={onGoToFinance}>
              {t('park.vault.goToFinance')}
            </Button>
          </>
        ) : undefined
      }
    >
      {state === 'loading' ? (
        <LoadingState label={t('common.loading')} lines={2} />
      ) : state === 'locked' ? (
        <FinanceLock>
          <VaultOpened onOpened={onOpened} />
        </FinanceLock>
      ) : null}
    </Dialog>
  );
}
