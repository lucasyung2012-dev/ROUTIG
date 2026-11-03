/*
 * Vetorização do logo oficial do ROUTIG, traçada sobre o PNG original
 * (public/brand/routig-logo-original.png, 1024 × 1024) no mesmo sistema de
 * coordenadas. Só é usada no app depois de aprovada na tela de comparação
 * (Settings → Sobre → Logo). Até lá, o app mostra o PNG original.
 */
export const MARK_VIEWBOX_FULL = '0 0 1024 1024';
export const MARK_VIEWBOX_CROP = '262 262 500 500';
export const MARK_STROKE = 32;

/** Arco superior e bojo do R. */
export const MARK_BOWL =
  'M293 522 L293 446 C293 372 346 328 430 306 C512 284 600 284 646 314 C694 346 704 424 680 474 C656 524 606 566 545 578';

/** Haste da seta, base, perna e volta até o bojo. */
export const MARK_BODY =
  'M440 489 L326 566 C303 582 297 602 297 632 L297 684 C297 712 318 722 356 722 L432 720 C476 718 493 706 493 680 L493 599 L582 704 C594 718 608 722 640 722 L690 722 C722 722 730 700 716 670 C702 640 678 602 656 576 C646 564 634 556 622 551';

/** Ponta da seta (preenchida). */
export const MARK_ARROW = 'M410 427 L534 412 Q548 411 539 423 L470 512 Q460 525 455 510 Z';

/** Gradiente lido da imagem: violeta-azulado embaixo à esquerda, rosa no alto à direita. */
export const MARK_GRADIENT = {
  x1: 300,
  y1: 730,
  x2: 690,
  y2: 290,
  stops: [
    { offset: 0, color: '#6C63F0' },
    { offset: 0.45, color: '#7B3FF6' },
    { offset: 0.75, color: '#A845D8' },
    { offset: 1, color: '#EE4B7A' },
  ],
} as const;

export const LOGO_PNG_PATH = 'brand/routig-logo-original.png';
