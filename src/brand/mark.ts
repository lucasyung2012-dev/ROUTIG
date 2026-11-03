/*
 * Vetorização do logo oficial do ROUTIG, traçada sobre o PNG original
 * (public/brand/routig-logo-original.png, 1024 × 1024) no mesmo sistema de
 * coordenadas. Só é usada no app depois de aprovada na tela de comparação
 * (Settings → Sobre → Logo). Até lá, o app mostra o PNG original.
 */
export const MARK_VIEWBOX_FULL = '0 0 1024 1024';
export const MARK_VIEWBOX_CROP = '262 262 500 500';
// Pontos medidos no PNG e depois ajustados automaticamente para maximizar a
// sobreposição com o formato original (97,9% de interseção sobre união).
export const MARK_STROKE = 32;

/** Arco superior e bojo do R. */
export const MARK_BOWL =
  'M294 521 L295 422 C302 387 328 343 401 319 C435 307 470 298 517 301 C590 290 673 334 673 423 C679 468 668 511 645 533 C619 557 588 576 544 579';

/** Haste da seta, base, perna e volta até o bojo. */
export const MARK_BODY =
  'M443 472 L352 533 C308 564 293 584 293 617 L295 672 C305 708 328 715 366 723 L425 725 C472 721 494 709 493 679 L494 602 L568 697 C583 712 590 722 612 721 L692 722 C723 717 732 703 731 680 C725 653 700 625 680 594 C673 580 658 565 632 561';

/** Ponta da seta (preenchida; o contorno arredondado de 12 px fecha os cantos). */
export const MARK_ARROW = 'M404 426 L550 411 L460 526 Z';

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
