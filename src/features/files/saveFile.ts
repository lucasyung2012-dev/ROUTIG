export type SaveOutcome = 'saved' | 'cancelled';

/**
 * Entrega um arquivo gerado no app. Toque (iPad, celular): folha de Compartilhar,
 * com "Salvar em Arquivos" e "Salvar imagem". Computador: download.
 */
export async function saveFile(file: File): Promise<SaveOutcome> {
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'saved';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Compartilhar falhou por outro motivo: cai no download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'saved';
}
