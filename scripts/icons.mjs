// Gera os ícones do app (tela inicial do iPhone/iPad e Android) a partir do logo oficial aprovado.
// Roda no CI antes do build; os arquivos gerados não ficam no repositório.
import sharp from 'sharp';

const src = 'public/brand/routig-logo-original.png';
const out = [
  [180, 'apple-touch-icon.png'],
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
];
for (const [size, name] of out) {
  await sharp(src).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`public/brand/${name}`);
  console.log(`ícone ${name} (${size}px)`);
}
