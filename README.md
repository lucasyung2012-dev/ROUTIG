# ROUTIG

**Your route. Your progress.**

Personal productivity, learning and development app. Local-first: os dados ficam no aparelho, sem cadastro.

- App publicado: https://lucasyung2012-dev.github.io/ROUTIG/
- Estado atual e próximos passos: [docs/ESTADO.md](docs/ESTADO.md)
- Decisões aprovadas: [docs/DECISOES.md](docs/DECISOES.md)
- Arquitetura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)

## Tecnologia

React 18 · TypeScript · Vite · Tailwind CSS · Lucide · Dexie (IndexedDB) · Zod · Vitest · PWA (vite-plugin-pwa)

## Comandos

```bash
npm install
npm run dev        # servidor local
npm test           # testes
npm run build      # build de produção (checa os tipos antes)
```

O GitHub Actions roda tipos, testes e build a cada envio para `main` e publica no GitHub Pages.
