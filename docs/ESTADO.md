# Estado do projeto

Leia este arquivo no começo de toda conversa nova sobre o ROUTIG. A especificação completa é o "ROUTIG — Prompt Master" (35 partes), fornecido pelo dono do produto. Decisões em [DECISOES.md](DECISOES.md), arquitetura em [ARQUITETURA.md](ARQUITETURA.md).

**Atualizado:** 2026-11-03 (Calendar)

## Estado da conversa (2026-11-03)

- **Etapa 0 — Fundação:** concluída. Logo vetorial e design system aprovados pelo dono do produto em 2026-11-02.
- **Etapa 1 — Organização central:** em andamento. **Tasks, Calendar e Inbox prontos e publicados.**
- **Próximo passo:** **Notes** e depois **Projects**; depois Dashboard completo, Profile e Settings.
- **Como trabalhar:** o computador de desenvolvimento não tem Node. Escrever o código, enviar com `git push`, conferir o GitHub Actions (anotações de erro aparecem por arquivo e linha) e testar no app publicado.

## Etapa 1 — andamento

| Módulo | Estado |
|---|---|
| Tasks | ✅ Pronto, testado (CI e navegador) |
| Dashboard | Parcial: saudação, resumo real de tarefas, mapa dos módulos. Falta personalização (cartões, perfis Estudos/Projetos/Completo, prévia) |
| Calendar | ✅ Pronto (testes no CI; checagem no navegador nesta versão) |
| Projects | A fazer |
| Inbox | ✅ Pronto (testes no CI; checagem no navegador nesta versão) |
| Notes | A fazer |
| Profile | Parcial: nome e descrição. Falta interesses, Minha evolução, Minha história |
| Settings | Parcial: seções da Etapa 0. Faltam as que dependem de módulos novos |

## Tasks (Parte 7) — o que existe

- Dados: título, descrição, status configurável, prioridade, data de criação, prazo, horário, categoria, lista, tags, subtarefas (tarefas com `parentId`), checklist, anexos por link, observações, projeto e objetivo (campos prontos, ligação quando Projects e Goals existirem), módulo de origem, recorrência e histórico.
- Status de fábrica (A fazer, Em andamento, Aguardando, Concluída, Cancelada, Arquivada) renomeáveis; status próprios com "conta como" e remoção só sem uso.
- Visualizações: lista, quadro (arrastar ou "Mover para"), calendário mensal, por prioridade, por prazo, por projeto, por categoria.
- Filtros: busca sem acento, status, prioridade, lista, tag, mostrar concluídas. No celular ficam atrás do botão Filtros.
- Recorrência diária, semanal (dias escolhidos, a cada N semanas), mensal e anual; exceções, pausas (férias) e data final. Concluir uma ocorrência avança a mesma tarefa, sem criar cópia, e guarda a ocorrência no histórico.
- Dependências: aviso de bloqueio, confirmação para concluir mesmo assim, prevenção de ciclos. Concluir uma tarefa não conclui outras nem objetivos.
- Lixeira: exclusão lógica com desfazer; restaurar; excluir de vez com confirmação (também limpa dependências).
- Editor com salvamento automático, criação rápida (Enter, Hoje/Amanhã), botão Tarefa no topo, atalho "n", busca global encontra tarefas.
- Banco versão 2: tabelas `tasks` e `taskLists`; configuração em `kv` (`tasks.config`).

### Testado

- **CI:** tipos, testes (domínio, repositório, tela) e build passando.
- **No navegador (app publicado, celular):** criação rápida, editor, prazo, recorrência semanal com próximas datas, salvamento automático, conclusão de ocorrência avançando o prazo.
- Não testado ainda: quadro com arrastar no iPad real, calendário mensal no iPad, Apple Pencil, instalação na tela de início.

### Limitações conhecidas

- Anexar arquivos chega com a Library (Etapa 4); por enquanto só links.
- Lembretes de tarefa chegam com Notificações (Etapa 5).
- Arrastar cartões no quadro depende do navegador no toque; "Mover para" funciona sempre.

## Etapa 0 — Fundação (concluída)

- Estrutura Vite + React + TypeScript estrito + Tailwind + Lucide + Inter; design system com temas claro, escuro e automático; vitrine em `#/design`.
- Logo vetorial aprovado (97,9% de sobreposição com o PNG), comparação em `#/settings/logo`.
- Navegação: sidebar expandida/compacta, gaveta no celular, favoritos, ocultar e reordenar; busca global (Ctrl K).
- Banco local com migração e histórico; onboarding que retoma de onde parou; Settings com comportamento real; PWA com offline e aviso de versão nova.

## Versões entregues

| Versão | Data | IA | O que mudou |
|---|---|---|---|
| 0.1.0 | 2026-11-02 | Claude (Claude Code) | Etapa 0: fundação. |
| 0.2.0 | 2026-11-03 | Claude (Claude Code) | Etapa 1: módulo Tasks; Dashboard com resumo de tarefas; busca de tarefas; busca rolando no iPad e no celular. |
| 0.3.0 | 2026-11-03 | Claude (Claude Code) | Etapa 1: módulo Calendar; criação rápida de evento; próximos compromissos no Dashboard; busca de eventos. |
| 0.4.0 | 2026-11-03 | Claude (Claude Code) | Etapa 1: módulo Inbox; resumo do Inbox no Dashboard; layout do iPad (cabeçalhos e grades). |

## Calendar (Parte 6) — o que existe

- Visualizações: dia e semana (grade de horas, itens sobrepostos lado a lado, linha da hora atual), mês, ano (dias com itens destacados) e agenda (60 dias).
- Eventos: nome, data, início e fim (ou dia inteiro com vários dias, para feriados e férias), local, categoria, descrição, observações, lembretes (guardados; avisos chegam na Etapa 5), ligação com uma tarefa e histórico.
- Categorias de fábrica: compromisso, aula, prova, entrega, feriado, férias, extracurricular e outro. Renomear, mudar cor, criar e remover as próprias.
- Recorrência diária, semanal (dias escolhidos), mensal e anual, com exceções, pausas e fim. Editar ou excluir uma ocorrência pergunta: somente esta, esta e as próximas, ou toda a série. "Esta e as próximas" divide a série sem mexer no passado.
- Tarefas com prazo aparecem no calendário lidas da tabela `tasks` (sem cópia), com visual diferente dos eventos; abrem no editor de tarefa.
- Conflitos de horário entre eventos: aviso no editor e nas visualizações; nada é alterado sozinho.
- Lixeira de eventos, botão "+ Criar" com Tarefa e Evento, busca global encontra eventos, Dashboard mostra os próximos compromissos de 7 dias.
- Banco versão 3: tabela `events`; categorias em `kv` (`calendar.config`).
- Fica para a Academy (Etapa 2): grade de horários escolares ligada a disciplinas, anos letivos e calendários escolares diferentes. Por enquanto, aulas, provas, entregas, feriados e férias são categorias de evento.

## Inbox (Parte 20) — o que existe

- Captura de texto (Enter guarda), links, fotos e arquivos (até 50 MB cada, guardados na tabela `files` com hash para não duplicar) e áudio gravado no aparelho (MediaRecorder, quando o navegador permite).
- Sugestão local, sem IA externa: tipo (tarefa, evento, nota, link, ideia), data ("amanhã", "sexta", "dia 15", "20/12"), horário ("15h", "18:30") e #tags, com o motivo da sugestão.
- Converter em tarefa ou evento abre uma prévia editável; nada é criado sem confirmação. Aviso de registros parecidos (tarefas, eventos e outros itens do Inbox). O item vira "processado", ligado ao registro criado.
- Adiar (amanhã, próxima semana), arquivar, voltar para a entrada, excluir com desfazer.
- Virar nota e guardar na Library aparecem como aviso até esses módulos existirem.
- Dashboard mostra quantos itens esperam organização.
