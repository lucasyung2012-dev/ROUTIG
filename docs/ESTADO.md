# Estado do projeto

Leia este arquivo no começo de toda conversa nova sobre o ROUTIG. A especificação completa é o "ROUTIG — Prompt Master" (35 partes), fornecido pelo dono do produto.

## Etapa atual: 0 — Fundação

**Atualizado:** 2026-11-02

### Implementado (escrito)

- Estrutura do projeto: Vite + React + TypeScript estrito + Tailwind + Lucide + Inter.
- Design system: tokens de cor para tema claro, escuro e automático; botões, campos, interruptor, grupo de opções, janela modal, avisos (toast), estados de carregamento, vazio, erro e sucesso. Vitrine em `#/design`.
- Logo: PNG original em uso; vetor traçado sobre o PNG, com tela de comparação (sobrepor, lado a lado, diferença) e aprovação em `#/settings/logo`.
- Navegação: sidebar expandida ou compacta, gaveta no celular, favoritos, ocultar e reordenar módulos; busca (Ctrl K) por módulos e seções de Settings.
- Registro dos 18 módulos. Os ainda não construídos mostram a etapa em que chegam e o que vão ter, sem guardar dados nem ter controles falsos.
- Banco local (IndexedDB/Dexie) versão 1, configurações validadas (Zod) com migração, histórico de alterações.
- Onboarding em 6 passos, gravando cada escolha e retomando de onde parou.
- Settings com comportamento real: Perfil, Aparência, Idioma, Região, Navegação e módulos, Acessibilidade, Armazenamento (uso de espaço e pedido de proteção contra limpeza), Sobre.
- Profile básico (nome e descrição).
- PWA: manifest, service worker, aviso de versão nova, aviso de modo offline.
- Testes: configurações, migração, persistência, textos pt/en, módulos, tema, onboarding, navegação, aparência, aprovação do logo.
- CI: GitHub Actions com tipos, testes, build e publicação no GitHub Pages.

### Testado

- Ainda nada confirmado. O primeiro envio ao GitHub vai rodar tipos, testes e build pela primeira vez.

### Falta na Etapa 0

- Ver o resultado do primeiro CI e corrigir o que falhar.
- Ativar o GitHub Pages (Settings → Pages → Source: GitHub Actions).
- Abrir o app publicado no navegador e conferir visual e fluxos.
- Aprovação do dono do produto: design system e logo vetorial.

### Próxima etapa: 1 — Organização central

Dashboard (com dados reais), Calendar, Tasks, Projects, Inbox, Notes, Profile completo, Settings completo.

## Versões entregues

| Versão | Data | IA | O que mudou |
|---|---|---|---|
| 0.1.0 | 2026-11-02 | Claude (Claude Code) | Etapa 0: fundação. |
