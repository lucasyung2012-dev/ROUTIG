import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { RoutigDB, getDb, setDbForTests } from '@/data/db';
import { BackupDB, setBackupDbForTests } from '@/data/backupRepo';
import { loadPrivacy, savePrivacy } from '@/data/privacyRepo';
import { PinError, eraseAllData, hasAppPin, loadSecurity, removeAppPin, setAppPin, tryUnlock } from '@/data/securityRepo';
import { saveSettings } from '@/data/settingsRepo';
import { DEFAULT_PRIVACY, dashboardHiddenIds, isShown, migratePrivacy, setShown } from '@/domain/privacy';
import { migrateSecurity, secondsBlocked, shouldRelock, waitAfterFailures } from '@/domain/security';
import { defaultSettings } from '@/domain/settings';

let name = '';
beforeEach(() => {
  name = `test-priv-${Math.random().toString(36).slice(2)}`;
  setDbForTests(new RoutigDB(name));
  setBackupDbForTests(new BackupDB(`${name}-backups`));
  window.location.hash = '#/dashboard';
});

describe('privacidade (Parte 26.1)', () => {
  it('padrão: Finanças fora da busca; o resto aparece; lixo vira padrão', () => {
    expect(migratePrivacy(undefined)).toEqual(DEFAULT_PRIVACY);
    expect(isShown(DEFAULT_PRIVACY, 'search', 'finance')).toBe(false);
    expect(isShown(DEFAULT_PRIVACY, 'dashboard', 'finance')).toBe(true);
    // A Library não tem cartão no Dashboard; marcar ali não tem efeito.
    expect(migratePrivacy({ dashboardHidden: ['library', 'habits', 'habits', 'xyz'] }).dashboardHidden).toEqual(['habits']);
    expect(migratePrivacy({ searchHidden: [] }).searchHidden).toEqual([]);
  });

  it('esconder e mostrar por lugar; Calendar é "events" na tabela', async () => {
    let p = setShown(DEFAULT_PRIVACY, 'dashboard', 'events', false);
    p = setShown(p, 'insights', 'habits', false);
    expect(dashboardHiddenIds(p)).toEqual(['calendar']);
    expect(isShown(p, 'insights', 'habits')).toBe(false);
    await savePrivacy(p);
    expect((await loadPrivacy()).insightsHidden).toEqual(['habits']);
    expect(isShown(setShown(p, 'insights', 'habits', true), 'insights', 'habits')).toBe(true);
  });
});

describe('segurança (Parte 26.2 e 26.3)', () => {
  it('espera cresce depois de 5 erros e para em 15 min; voltar ao app trava pelo tempo escolhido', () => {
    expect([1, 4, 5, 6, 7, 20].map(waitAfterFailures)).toEqual([0, 0, 30, 60, 120, 900]);
    const now = new Date('2026-11-05T10:00:00Z');
    expect(secondsBlocked({ blockedUntil: '2026-11-05T10:00:30Z' }, now)).toBe(30);
    expect(secondsBlocked({ blockedUntil: null }, now)).toBe(0);
    expect(shouldRelock(null, 1000, 0)).toBe(false);
    expect(shouldRelock(1000, 1001, 0)).toBe(true);
    expect(shouldRelock(0, 4 * 60_000, 5)).toBe(false);
    expect(shouldRelock(0, 5 * 60_000, 5)).toBe(true);
    expect(migrateSecurity({ lockAfterMin: 7, pin: { salt: 1 } })).toMatchObject({ lockAfterMin: 5, pin: null });
  });

  it('PIN só como hash; trocar e remover exigem o atual; erros seguidos bloqueiam', async () => {
    await expect(setAppPin('12')).rejects.toBeInstanceOf(PinError);
    await setAppPin('2468');
    const cfg = await loadSecurity();
    expect(JSON.stringify(cfg)).not.toContain('2468');
    expect(cfg.pin?.iterations).toBeGreaterThanOrEqual(100_000);
    await expect(setAppPin('1357', '0000')).rejects.toMatchObject({ code: 'wrong' });
    await setAppPin('1357', '2468');
    expect(await tryUnlock('1357')).toEqual({ ok: true });

    const t0 = new Date('2026-11-05T10:00:00Z');
    for (let i = 0; i < 4; i++) expect(await tryUnlock('0000', t0)).toEqual({ ok: false, waitSec: 0 });
    expect(await tryUnlock('0000', t0)).toEqual({ ok: false, waitSec: 30 });
    // Bloqueado: nem o PIN certo entra antes do tempo.
    expect(await tryUnlock('1357', new Date('2026-11-05T10:00:10Z'))).toEqual({ ok: false, waitSec: 20 });
    expect(await tryUnlock('1357', new Date('2026-11-05T10:00:31Z'))).toEqual({ ok: true });
    expect((await loadSecurity()).failed).toBe(0);

    await expect(removeAppPin('0000')).rejects.toMatchObject({ code: 'wrong' });
    await removeAppPin('1357');
    expect(await hasAppPin()).toBe(false);
  });

  it('apagar todos os dados: banco, cópias internas e preferências de tela do ROUTIG', async () => {
    await getDb().kv.put({ key: 'x', value: 1, updatedAt: '2026-11-05' });
    localStorage.setItem('routig.tasks.view', 'board');
    localStorage.setItem('outro.app', 'fica');
    expect(await Dexie.exists(name)).toBe(true);
    await eraseAllData();
    expect(await Dexie.exists(name)).toBe(false);
    expect(await Dexie.exists(`${name}-backups`)).toBe(false);
    expect(localStorage.getItem('routig.tasks.view')).toBeNull();
    expect(localStorage.getItem('outro.app')).toBe('fica');
  });

  it('com PIN, o app abre bloqueado; PIN errado avisa; o certo abre', async () => {
    const s = defaultSettings();
    s.onboarding.completed = true;
    await saveSettings(s);
    await setAppPin('2468');
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: /ROUTIG bloqueado/ })).toBeInTheDocument();
    const input = screen.getByLabelText('PIN');
    await user.type(input, '1111');
    await user.click(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(await screen.findByText('PIN errado.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('PIN'), '2468');
    await user.click(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(await screen.findByRole('button', { name: 'Ligar a privacidade rápida' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /ROUTIG bloqueado/ })).not.toBeInTheDocument();
  });
});
