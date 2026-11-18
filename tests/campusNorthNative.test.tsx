import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SettingsProvider } from '@/app/SettingsProvider';
import { createSubject, createYear } from '@/data/academyRepo';
import { BackupDB, listSnapshots, setBackupDbForTests } from '@/data/backupRepo';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createGrammar } from '@/data/grammarRepo';
import { createLanguages } from '@/data/languagesRepo';
import { emptyGrammarInput, LANGUAGE_PRESETS } from '@/domain/languages';
import { translate, type MessageKey } from '@/i18n';
import { AcademyPanel, LanguagesPanel, LibraryPanel } from '@/features/park/panels/NorthPanels';
import { ToastProvider } from '@/ui/toast';

const tr = (k: string, v?: Record<string, string | number>) => translate('pt-BR', k as MessageKey, v);

function wrap(ui: ReactNode) {
  return render(
    <SettingsProvider>
      <ToastProvider closeLabel="Fechar">
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </SettingsProvider>,
  );
}

beforeEach(() => {
  const id = Math.random().toString(36).slice(2);
  setDbForTests(new RoutigDB(`test-campus-north-native-${id}`));
  setBackupDbForTests(new BackupDB(`test-campus-north-native-bk-${id}`));
});

describe('Campus Norte: estações nativas no lugar das páginas do Control Room', () => {
  it('Library, preservação: sem backup, diz "nunca"; a cópia interna usa o mesmo saveSnapshot do Settings', async () => {
    const user = userEvent.setup();
    wrap(<LibraryPanel id="preserve" />);
    expect(await screen.findByText(new RegExp(tr('backup.lastExport', { when: tr('backup.never') })))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: tr('backup.snapshotNow') }));
    await waitFor(async () => expect(await listSnapshots()).toHaveLength(1));
    expect((await listSnapshots())[0]!.kind).toBe('manual');
  });

  it('Library, transferência: a lista de exportação do Settings, com a contagem real de cada tipo', async () => {
    wrap(<LibraryPanel id="transfer" />);
    expect(await screen.findByText(tr('transfer.export.kinds.tasks'))).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: tr('transfer.export.button') }).length).toBeGreaterThan(0);
  });

  it('Academy: tocar na disciplina abre o resumo dela na estação, com o link para a página completa', async () => {
    const y = await createYear({ label: '2026', institution: 'Escola', grade: '9º ano' });
    const s = await createSubject({ yearId: y.id, name: 'Matemática', kind: 'subject', color: '#438BEA', teacherId: null });
    const user = userEvent.setup();
    wrap(<AcademyPanel id="rooms" />);
    await user.click(await screen.findByRole('button', { name: /^Matemática/ }));
    expect(await screen.findByText(tr('park.native.north.academy.nextSessions'))).toBeInTheDocument();
    expect(screen.getByText(tr('park.native.north.academy.noSessions'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: tr('park.openModule') })).toHaveAttribute('href', `/academy/subjects/${s.id}`);
    await user.click(screen.getByRole('button', { name: tr('park.native.north.academy.backToRooms') }));
    expect(await screen.findByRole('button', { name: /^Matemática/ })).toBeInTheDocument();
  });

  it('Idiomas, mural de gramática: as regras novas do idioma aparecem para revisar', async () => {
    await createLanguages(LANGUAGE_PRESETS);
    // Uma regra em cada idioma: qualquer que seja o escolhido, ele tem a sua.
    for (const l of await getDb().languages.toArray()) await createGrammar({ ...emptyGrammarInput(l.id), title: 'Regra de teste' });
    wrap(<LanguagesPanel id="spaces" zone="grammar" />);
    expect(await screen.findByText(tr('park.native.north.languages.grammarDue'))).toBeInTheDocument();
    expect(await screen.findByText('Regra de teste')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: tr('academy.review.review') })).toBeEnabled();
  });
});
