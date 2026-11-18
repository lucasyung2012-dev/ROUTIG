/**
 * Quadro dos andares em canvas (boards.ts diz o texto): título, linhas ou barras, na cor da sala.
 * Só redesenha quando o conteúdo muda (nada por quadro de animação). Trancado: tela escura, sem
 * nenhum valor, só o cadeado.
 */
import * as THREE from 'three';
import type { Kit } from '../kit';
import { canvasPlane } from './common';
import type { Board } from './boards';

export interface BoardMesh {
  group: THREE.Group;
  draw: (b: Board) => void;
}

const FONT = 'Inter, system-ui, sans-serif';

/** Quadro de `w` × `h` m (moldura incluída por trás), começando com `fallback` (o nome da sala) e sem números. */
export function boardMesh(kit: Kit, w: number, h: number, accent: string, fallback: string): BoardMesh {
  const s = canvasPlane(kit, w, h, 256, true);
  const ctx = s.ctx;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  let last = '';
  const draw = (b: Board) => {
    const key = JSON.stringify(b);
    if (key === last) return;
    last = key;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (b.locked) {
      // Sem valor nenhum: fundo escuro e o cadeado apagado.
      ctx.fillStyle = '#05070A';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2 - 22, 26, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#334155';
      ctx.fillRect(W / 2 - 40, H / 2 - 22, 80, 60);
      ctx.fillStyle = '#475569';
      ctx.font = `600 24px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(b.title, W / 2, H - 22, W - 40);
      s.tex.needsUpdate = true;
      return;
    }
    ctx.fillStyle = '#0F1B2D';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = b.color ?? accent;
    ctx.fillRect(0, 0, 12, H);
    ctx.fillStyle = '#F1FAFF';
    ctx.font = `700 38px ${FONT}`;
    ctx.fillText(b.title, 28, 46, W - 44);
    if (b.bars?.length) {
      const n = b.bars.length;
      const x0 = 28;
      const bw = (W - x0 - 16) / n;
      const base = H - 34;
      const top = 70;
      b.bars.forEach((bar, i) => {
        const x = x0 + i * bw;
        if (bar.value === null) {
          // Sem altura (qualitativo, sem como medir): só o contorno tracejado e o aviso.
          ctx.strokeStyle = '#64748B';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 5]);
          ctx.strokeRect(x + bw * 0.15, top + 10, bw * 0.7, base - top - 10);
          ctx.setLineDash([]);
          if (b.nullLabel) {
            ctx.fillStyle = '#94A3B8';
            ctx.font = `500 15px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.fillText(b.nullLabel, x + bw / 2, (top + base) / 2, bw * 0.9);
            ctx.textAlign = 'left';
          }
        } else {
          const v = Math.max(0, Math.min(1, bar.value));
          const hh = Math.max(v > 0 ? 3 : 0, (base - top) * v);
          ctx.fillStyle = b.color ?? accent;
          ctx.fillRect(x + bw * 0.15, base - hh, bw * 0.7, hh);
        }
        ctx.fillStyle = '#CBD5E1';
        ctx.font = `500 17px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(bar.label, x + bw / 2, H - 10, bw - 4);
        ctx.textAlign = 'left';
      });
    } else {
      const lh = 32;
      const y0 = 88;
      const fit = Math.max(1, Math.floor((H - y0) / lh) + 1);
      const shown = b.lines.length > fit ? [...b.lines.slice(0, fit - 1), `+${b.lines.length - fit + 1}…`] : b.lines;
      ctx.fillStyle = b.empty ? '#94A3B8' : '#E2E8F0';
      ctx.font = `${b.empty ? 'italic 500' : '500'} 26px ${FONT}`;
      shown.forEach((line, i) => ctx.fillText(line, 28, y0 + i * lh, W - 44));
    }
    s.tex.needsUpdate = true;
  };
  const group = new THREE.Group();
  const frame = new THREE.Mesh(kit.own(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.04)), kit.mat('#1F2937', { rough: 0.5 }));
  frame.position.z = -0.025;
  s.mesh.position.z = 0.001;
  group.add(frame, s.mesh);
  draw({ title: fallback, lines: [] });
  return { group, draw };
}
