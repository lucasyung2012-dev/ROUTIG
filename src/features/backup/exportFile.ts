import { buildBackupText, recordExport } from '@/data/backupRepo';
import { backupFileName } from '@/domain/backup';
import { saveFile, type SaveOutcome } from '@/features/files/saveFile';

export type ExportOutcome = SaveOutcome;

const deliver = (text: string, name: string) => saveFile(new File([text], name, { type: 'application/json' }));

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
