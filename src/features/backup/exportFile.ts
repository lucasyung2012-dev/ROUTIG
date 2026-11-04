import { buildBackupText, recordExport } from '@/data/backupRepo';
import { backupFileName } from '@/domain/backup';

export type ExportOutcome = 'saved' | 'cancelled';

/** Toque (iPad, celular): folha de Compartilhar, com "Salvar em Arquivos". Computador: download. */
async function deliver(text: string, name: string): Promise<ExportOutcome> {
  const file = new File([text], name, { type: 'application/json' });
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'saved';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Compartilhar falhou por outro motivo: cai no download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'saved';
}

/** Exporta o backup completo de agora e registra no histórico. */
export async function exportBackup(): Promise<ExportOutcome> {
  const b = await buildBackupText();
  const name = backupFileName(new Date(b.createdAt));
  const outcome = await deliver(b.text, name);
  if (outcome === 'saved') await recordExport(name, b.text.length, b.checksum);
  return outcome;
}

/** Exporta uma cópia interna já existente (o texto dela, sem mudar nada). */
export async function exportExisting(text: string, createdAt: string, checksum: string): Promise<ExportOutcome> {
  const name = backupFileName(new Date(createdAt));
  const outcome = await deliver(text, name);
  if (outcome === 'saved') await recordExport(name, text.length, checksum);
  return outcome;
}
