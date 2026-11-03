import { useEffect, useState } from 'react';
import { getDb } from '@/data/db';

/** URL temporária para mostrar um arquivo guardado (imagem, áudio, documento). Liberada ao sair da tela. */
export function useObjectUrl(fileId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!fileId) return;
    let created: string | null = null;
    let alive = true;
    void getDb()
      .files.get(fileId)
      .then((f) => {
        if (f && alive) {
          created = URL.createObjectURL(f.blob);
          setUrl(created);
        }
      });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [fileId]);
  return url;
}
