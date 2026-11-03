export interface StorageStatus {
  /** O navegador expõe a API de armazenamento. */
  supported: boolean;
  /** O navegador garantiu que não apaga os dados sozinho. null = não informado. */
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!sm) return { supported: false, persisted: null, usageBytes: null, quotaBytes: null };
  const [persisted, estimate] = await Promise.all([
    sm.persisted ? sm.persisted().catch(() => null) : Promise.resolve(null),
    sm.estimate ? sm.estimate().catch(() => null) : Promise.resolve(null),
  ]);
  return {
    supported: true,
    persisted,
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
  };
}

/** Pede ao navegador para não apagar os dados do ROUTIG. Retorna se foi concedido. */
export async function requestPersistence(): Promise<boolean | null> {
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!sm?.persist) return null;
  try {
    return await sm.persist();
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number | null, locale: string): string {
  if (bytes === null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(v)} ${units[i]}`;
}
