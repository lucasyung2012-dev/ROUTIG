import { buildBackupText, recordExport } from '@/data/backupRepo';
import { backupFileName, encryptBackupText } from '@/domain/backup';
import { saveFile, type SaveOutcome } from '@/features/files/saveFile';

export type ExportOutcome = SaveOutcome;

const deliver = (text: string, name: string) => saveFile(new File([text], name, { type: 'application/json' }));

/** Com senha, o arquivo sai cifrado (envelope "routig-backup-encrypted"); sem, sai o backup aberto. */
const protect = (text: string, password: string | null) => (password ? encryptBackupText(text, password) : Promise.resolve(text));

/** Exporta o backup completo de agora e registra no histórico. `password` null = sem senha (escolha explícita). */
export async function exportBackup(password: string | null = null): Promise<ExportOutcome> {
  const b = await buildBackupText();
  const name = backupFileName(new Date(b.createdAt));
  const out = await protect(b.text, password);
  const outcome = await deliver(out, name);
  if (outcome === 'saved') await recordExport(name, out.length, b.checksum);
  return outcome;
}

/** Exporta uma cópia interna já existente (o texto dela, sem mudar nada; com senha, cifrado). */
export async function exportExisting(text: string, createdAt: string, checksum: string, password: string | null = null): Promise<ExportOutcome> {
  const name = backupFileName(new Date(createdAt));
  const out = await protect(text, password);
  const outcome = await deliver(out, name);
  if (outcome === 'saved') await recordExport(name, out.length, checksum);
  return outcome;
}
