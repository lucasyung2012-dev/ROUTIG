/* ---------- PDF simples, só texto, sem biblioteca ---------- */

/** Uma linha do documento: texto, negrito e tamanho da letra (pontos). */
export interface PdfLine {
  text: string;
  bold?: boolean;
  size?: number;
  /** Espaço extra antes da linha (pontos). */
  gapBefore?: number;
}

/** Caracteres do Windows-1252 fora do Latin-1 (aspas curvas, travessão, marcador…). */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** Texto em WinAnsi (as fontes padrão do PDF). O que não existe nele (emoji, por exemplo) vira "?" ou some. */
export function toWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 63;
    if (c === 0xfe0f || c === 0x200d) continue; // variação de emoji e junção: sem desenho
    if (c === 9) out.push(32);
    else if ((c >= 32 && c < 127) || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else if (CP1252[c] !== undefined) out.push(CP1252[c]!);
    else if (c === 0x2212) out.push(45);
    else out.push(63);
  }
  return out;
}

/** String literal do PDF só com ASCII: o resto vai em octal (\ddd). */
function pdfString(bytes: number[]): string {
  let s = '(';
  for (const b of bytes) {
    if (b === 40 || b === 41 || b === 92) s += `\\${String.fromCharCode(b)}`;
    else if (b >= 32 && b < 127) s += String.fromCharCode(b);
    else s += `\\${b.toString(8).padStart(3, '0')}`;
  }
  return `${s})`;
}

/** Quebra o texto em linhas de até `max` caracteres, nas palavras. */
export function wrapText(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      let w = word;
      while (w.length > max) {
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(w.slice(0, max));
        w = w.slice(max);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= max) line += ` ${w}`;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

const PAGE_W = 595; // A4 em pontos
const PAGE_H = 842;
const MARGIN = 56;

/**
 * Monta um PDF (A4, Helvetica) com as linhas dadas, quebrando linhas e páginas.
 * O arquivo sai só com ASCII, então a posição de cada objeto é o tamanho do texto antes dele.
 */
export function buildPdf(lines: PdfLine[]): Uint8Array {
  const pages: string[][] = [[]];
  let y = PAGE_H - MARGIN;
  for (const l of lines) {
    const size = l.size ?? 11;
    const lead = Math.round(size * 1.45);
    // Largura média de letra na Helvetica: cerca de meia letra (um pouco mais no negrito).
    const max = Math.max(10, Math.floor((PAGE_W - 2 * MARGIN) / (size * (l.bold ? 0.56 : 0.52))));
    y -= l.gapBefore ?? 0;
    for (const part of wrapText(l.text, max)) {
      if (y - lead < MARGIN) {
        pages.push([]);
        y = PAGE_H - MARGIN;
      }
      y -= lead;
      if (part.trim()) pages[pages.length - 1]!.push(`BT /${l.bold ? 'F2' : 'F1'} ${size} Tf ${MARGIN} ${y} Td ${pdfString(toWinAnsi(part))} Tj ET`);
    }
  }

  // 1 catálogo, 2 páginas, 3 e 4 fontes; depois, para cada página, a página e o conteúdo.
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pages.forEach((ops, i) => {
    const stream = ops.join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0x7f;
  return bytes;
}
