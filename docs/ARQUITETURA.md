# Arquitetura

## Camadas (Parte 24.2)

| Pasta | Papel |
|---|---|
| `src/ui/` | Design system: componentes visuais sem regra de negócio (Button, Field, Dialog, toast, estados). |
| `src/brand/` | Logo: PNG original e vetor em avaliação. |
| `src/domain/` | Tipos, validação (Zod) e regras puras. Não acessa banco nem tela. |
| `src/data/` | Banco local (Dexie/IndexedDB), repositórios e migrações. |
| `src/services/` | Tema, armazenamento, e no futuro backup, notificações, busca, criptografia, importação. |
| `src/i18n/` | Textos pt-BR e en. O inglês é tipado contra o português: chave faltando quebra o build. |
| `src/app/` | Registro dos 18 módulos, provedores, layout (sidebar, topo, busca). |
| `src/features/<módulo>/` | Telas de cada módulo. Cada um com layout próprio (Parte 3.5). |
| `src/integrations/` | (futuro) Interfaces de integrações externas. Nenhuma simulada. |

## Dados

- **Identificadores:** `prefixo_` + carimbo de tempo + aleatório (`src/domain/ids.ts`).
- **Base de todo registro:** `id`, `createdAt`, `updatedAt`, `deletedAt` (exclusão lógica até confirmar na Lixeira), `rev`.
- **Sem duplicação:** um registro mora numa tabela só. Ligações entre módulos usam a tabela `links` (`from`/`to` = `tipo:id`). O Calendar monta a agenda consultando as fontes, não copiando.
- **Histórico:** tabela `changelog` registra criação, alteração (com os campos alterados), exclusão e restauração.
- **Migrações:** cada versão nova do banco entra como `this.version(n)` em `src/data/db.ts`. Configurações antigas passam por `migrateSettings`, que preserva o que é válido.

## Versões do banco

| Versão | Etapa | Tabelas |
|---|---|---|
| 1 | 0 | `kv` (configurações), `changelog`, `links` |

## Navegação

`HashRouter` (URLs com `#/`), porque o GitHub Pages não reescreve rotas. Base do Vite: `/ROUTIG/`.

## PWA

`vite-plugin-pwa` gera manifest e service worker. Atualização só com o toque do usuário em "Atualizar". Ícone: PNG original (1024 × 1024).
