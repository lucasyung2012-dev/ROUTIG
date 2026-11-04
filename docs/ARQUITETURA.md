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
| 2 | 1 | + `tasks`, `taskLists` (configuração de status e categorias em `kv`: `tasks.config`) |
| 3 | 1 | + `events` (categorias em `kv`: `calendar.config`) |
| 4 | 1 | + `inbox`, `files` (arquivos binários separados, com hash SHA-256 para não duplicar) |
| 5 | 1 | + `notes`, `noteVersions`, `notebooks`, `noteCollections`, `noteTemplates` |
| 6 | 1 | + `projects` (etapas, marcos e referências dentro do projeto; tarefas continuam em `tasks` com `projectId`) |
| 7 | 1 | + `interests` (interesses do Profile, ligados a projetos e notas por id) e `historyEntries` (registros escritos à mão em Minha história). Categorias próprias, ajustes da linha do tempo e o painel ficam em `kv` |
| 8 | 2 | + `academicYears` (ano letivo com períodos, modelo de nota e escala de domínio), `subjects`, `teachers`, `assessments`, `periodResults` (recuperação e bônus por disciplina e período) |
| 9 | 2 | + `contents` (conteúdo programático em árvore), `lessons` (registro de aulas), `doubts`. Tarefas e projetos ganham `subjectId` opcional (atividades e trabalhos da disciplina, sem cópia) |

## Navegação

`HashRouter` (URLs com `#/`), porque o GitHub Pages não reescreve rotas. Base do Vite: `/ROUTIG/`.

## PWA

`vite-plugin-pwa` gera manifest e service worker. Atualização só com o toque do usuário em "Atualizar". Ícone: PNG original (1024 × 1024).
