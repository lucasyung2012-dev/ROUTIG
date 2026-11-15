import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SettingsProvider } from '@/app/SettingsProvider';
import { createSubject, createYear } from '@/data/academyRepo';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { setFinancePin } from '@/data/financePlanRepo';
import { translate, type MessageKey } from '@/i18n';
import { AcademyPanel, InsightsPanel, LanguagesPanel, LibraryPanel, NotesPanel } from '@/features/park/panels/NorthPanels';
import { ToastProvider } from '@/ui/toast';

/** Texto da interface em português (as chaves novas do Campus Norte entram no merge do i18n). */
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
  setDbForTests(new RoutigDB(`test-campus-north-${Math.random().toString(36).slice(2)}`));
});

describe('Campus Norte: estações nativas gravam nos mesmos repositórios do Control Room', () => {
  it('Notes: a captura rápida da recepção cria a nota no Notes', async () => {
    const user = userEvent.setup();
    wrap(<NotesPanel id="reception" />);
    await user.type(await screen.findByRole('textbox', { name: tr('notes.titlePlaceholder') }), 'Ideia do parque');
    await user.type(screen.getByRole('textbox', { name: tr('park.native.north.notes.captureText') }), '- primeiro item');
    await user.click(screen.getByRole('button', { name: tr('park.native.north.notes.saveNote') }));
    await waitFor(async () => expect(await getDb().notes.count()).toBe(1));
    const note = (await getDb().notes.toArray())[0]!;
    expect(note.title).toBe('Ideia do parque');
    expect(note.blocks[0]).toMatchObject({ type: 'bullet', text: 'primeiro item' });
    // A nota nova aparece na lista de recentes da estação.
    expect(await screen.findByText('Ideia do parque')).toBeInTheDocument();
  });

  it('Notes: o texto em captura continua lá ao sair e voltar à estação', async () => {
    const user = userEvent.setup();
    const first = wrap(<NotesPanel id="reception" />);
    await user.type(await screen.findByRole('textbox', { name: tr('park.native.north.notes.captureText') }), 'rascunho');
    first.unmount();
    wrap(<NotesPanel id="reception" />);
    expect(await screen.findByRole('textbox', { name: tr('park.native.north.notes.captureText') })).toHaveValue('rascunho');
  });

  it('Library: o átrio guarda um livro no catálogo, já como "quero ler"', async () => {
    const user = userEvent.setup();
    wrap(<LibraryPanel id="atrium" />);
    await user.click(await screen.findByRole('radio', { name: tr('library.kinds.book') }));
    await user.type(screen.getByRole('textbox', { name: tr('library.fields.title') }), 'Dom Casmurro');
    await user.type(screen.getByRole('textbox', { name: tr('library.fields.author') }), 'Machado de Assis');
    await user.click(screen.getByRole('button', { name: tr('park.native.north.library.addToCatalog') }));
    await waitFor(async () => expect(await getDb().libraryItems.count()).toBe(1));
    const item = (await getDb().libraryItems.toArray())[0]!;
    expect(item).toMatchObject({ kind: 'book', title: 'Dom Casmurro', author: 'Machado de Assis', readStatus: 'want' });
  });

  it('Academy: o plano de estudos cria a sessão e marca como feita', async () => {
    const y = await createYear({ label: '2026', institution: 'Escola', grade: '9º ano' });
    await createSubject({ yearId: y.id, name: 'Matemática', kind: 'subject', color: '#438BEA', teacherId: null });
    const user = userEvent.setup();
    wrap(<AcademyPanel id="plan" />);
    await user.click(await screen.findByRole('button', { name: tr('park.native.north.academy.plan') }));
    await waitFor(async () => expect(await getDb().studySessions.count()).toBe(1));
    await user.click(await screen.findByRole('button', { name: tr('academy.plan.markDone') }));
    await waitFor(async () => expect((await getDb().studySessions.toArray())[0]!.status).toBe('done'));
  });

  it('Academy: sem ano letivo, a estação diz isso em vez de mostrar números', async () => {
    wrap(<AcademyPanel id="hall" />);
    expect(await screen.findByText(tr('park.native.north.academy.noYear'))).toBeInTheDocument();
  });

  it('Idiomas: o jardim adiciona os idiomas iniciais e registra uma sessão', async () => {
    const user = userEvent.setup();
    wrap(<LanguagesPanel id="garden" />);
    await user.click(await screen.findByRole('button', { name: tr('languages.addPresets') }));
    await waitFor(async () => expect(await getDb().languages.count()).toBe(5));
    await user.click(await screen.findByRole('button', { name: tr('park.native.north.languages.logToday') }));
    await waitFor(async () => expect(await getDb().languageSessions.count()).toBe(1));
  });

  it('Insights: sem registros, cada módulo diz "sem dados" (nada inventado)', async () => {
    wrap(<InsightsPanel id="productivity" />);
    expect(await screen.findAllByText(tr('insights.noData'))).toHaveLength(3);
  });

  it('Insights: com PIN de Finanças, a estação de Finanças pede o PIN antes de mostrar valores', async () => {
    await setFinancePin('1234');
    wrap(<InsightsPanel id="finance" />);
    expect(await screen.findByText(tr('finance.lock.title'))).toBeInTheDocument();
    expect(screen.queryByText(tr('insights.incomeIn'))).not.toBeInTheDocument();
  });
});
