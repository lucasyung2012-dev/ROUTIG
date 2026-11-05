# Estado do projeto

Leia este arquivo no começo de toda conversa nova sobre o ROUTIG. A especificação completa é o "ROUTIG — Prompt Master" (35 partes), fornecido pelo dono do produto. Decisões em [DECISOES.md](DECISOES.md), arquitetura em [ARQUITETURA.md](ARQUITETURA.md).

**Atualizado:** 2026-11-04 (Etapa 3 em andamento)

## Estado da conversa (2026-11-04)

- **Etapa 0 — Fundação:** concluída. Logo vetorial e design system aprovados pelo dono do produto em 2026-11-02.
- **Etapa 1 — Organização central:** concluída no código (versão 0.7.0). Tasks, Calendar, Inbox, Notes, Projects, Dashboard, Profile e Settings publicados. Falta o dono do produto testar no iPad o Dashboard, o Profile e as Settings novas.
- **Etapa 2 — Aprendizagem:** concluída (versão 0.20.0). Academy (0.11.0 a 0.17.0) e Idiomas (0.18.0 a 0.20.0) publicados e testados. Idiomas tem visão geral, vocabulário, gramática, revisões (repetição espaçada de palavras e regras), habilidades, sessões, pronúncia (voz do aparelho e gravação da própria voz), materiais e histórico.
- **Etapa 3 — Desenvolvimento pessoal:** concluída (versão 0.25.0). Habits (0.21.0), Goals (0.22.0), Focus (0.23.0), Música (0.24.0) e Esportes (0.25.0) publicados e testados. Goals veio antes de Música e Esportes para que as metas deles sejam objetivos do Goals, sem duplicar.
- **Etapa 4 — Gestão pessoal:** em andamento. Finanças completa (0.26.0 a 0.28.0). Library pronta (0.29.0). Falta Insights.
- **Próximo passo:** Insights (Parte 19), o último módulo da Etapa 4. A "praça" (2D e depois 3D) entra quando o dono do produto mandar o prompt.
- **Como trabalhar:** o computador de desenvolvimento não tem Node. Escrever o código, enviar com `git push`, conferir o GitHub Actions (anotações de erro aparecem por arquivo e linha) e testar no app publicado.

## Etapa 1 — andamento

| Módulo | Estado |
|---|---|
| Tasks | ✅ Pronto, testado (CI e navegador) |
| Dashboard | ✅ Pronto: perfis Completo, Estudos e Projetos; 9 cartões e 7 indicadores com dados reais; Personalizar com prévia (Aplicar/Descartar); perfis próprios; cartões de módulos futuros só como "Em breve" |
| Calendar | ✅ Pronto (testes no CI; checagem no navegador nesta versão) |
| Projects | ✅ Pronto (testes no CI; checagem no navegador nesta versão) |
| Inbox | ✅ Pronto (testes no CI; checagem no navegador nesta versão) |
| Notes | ✅ Pronto (testes no CI; checagem no navegador nesta versão) |
| Profile | ✅ Pronto: avatar; interesses (categorias de fábrica e próprias, status escolhido pelo usuário, página com ícone, cor, capa, início, objetivos, projetos, notas, atividades, histórico e evolução); Minha evolução (números e gráficos semanais reais); Minha história (linha do tempo com registros próprios; renomear e ocultar) |
| Settings | ✅ Etapa 1: + Módulos, Dispositivos (instalado ou navegador, conexão, offline, como instalar, dados por aparelho) e Ajuda (atalhos, como funciona, dicas de iPad). Notificações, Privacidade, Segurança, Backup, Restauração, Integrações e IA aparecem em Sobre como próximas etapas, sem controles falsos |

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
| 0.5.0 | 2026-11-03 | Claude (Claude Code) | Etapa 1: módulo Notes (blocos, desenho com Apple Pencil, versões); Inbox → nota; título de áudio vazio na conversão. |
| 0.6.0 | 2026-11-03 | Claude (Claude Code) | Etapa 1: módulo Projects; projeto no editor de tarefa; marcos no Calendar; notas ligadas a projetos. |
| 0.7.0 | 2026-11-03 | Claude (Claude Code) | Fim da Etapa 1: Dashboard completo, Profile completo, Settings (Módulos, Dispositivos, Ajuda); avisos somem sozinhos (5 s com Desfazer). |
| 0.8.0 | 2026-11-03 | Claude (Claude Code) | Backup completo (Parte 25): exportar para Arquivos, cópia interna diária, cópias manuais e antes de restaurar, restauração com prévia e verificação de integridade, histórico de exportações, aviso de backup desatualizado no Dashboard. |
| 0.9.0 | 2026-11-03 | Claude (Claude Code) | Desenho do Notes completo: marca-texto, formas por arrastar (linha, seta, retângulo, círculo), laço para selecionar e mover, mão e zoom, fundo liso, pautado, quadriculado ou pontilhado, desenhar sobre imagem, refazer, salvar como imagem (PNG). Corrige perda de edição feita durante o salvamento em Notes, Projects e Interesses. Excluir nota de vez não apaga arquivo usado como capa, foto ou fundo de desenho. |
| 0.10.0 | 2026-11-03 | Claude (Claude Code) | Mais cores em todo o app: paleta única (preto, cinzas, branco e cores do ROUTIG) com "Outra cor" em projetos, interesses, listas, cadernos (agora editáveis) e categorias do Calendar. |
| 0.11.0 | 2026-11-03 | Claude (Claude Code) | Etapa 2, Academy parte 1: anos letivos com instituição, série e períodos; disciplinas, itinerários e ênfases; professores; avaliações; modelo de nota configurável por ano e por disciplina (PP 2 + PU 4 + PO 2 + AC 2, média 6,0); recuperação até 6,0 e bônus até 0,5 acima de 6,0, com cálculo passo a passo e histórico; avaliações no Calendar e cartão Academy no Dashboard. |
| 0.12.0 | 2026-11-03 | Claude (Claude Code) | Etapa 2, Academy parte 2: conteúdo programático em árvore (unidade, capítulo, tema, subtema, aula) com andamento e domínio separados, escala de domínio editável por ano; registro de aulas (data, professor, conteúdos, anotações, dificuldades, atividades, observações, materiais); dúvidas com resposta; trabalhos = projetos ligados à disciplina (instruções e critérios); atividades = tarefas ligadas à disciplina; materiais = notas ligadas; painel com progresso de aprendizagem, conteúdos recentes, dúvidas e materiais. |
| 0.13.0 | 2026-11-03 | Claude (Claude Code) | Academy parte 3a: flashcards com repetição espaçada adaptativa (baralhos por disciplina ou livres, categorias e tags, cartões ligados ao conteúdo, revisão programada com atrasados e difíceis primeiro, cartão errado volta na mesma sessão, treino livre que não muda o agendamento, histórico, domínio estimado), aba Revisões e central de revisão. |
| 0.14.0 | 2026-11-03 | Claude (Claude Code) | Academy parte 3b: planejamento de estudos (sessões com disciplina, conteúdos, data, hora, duração, prioridade e prova; revisões distribuídas 14/7/3/1 dia antes da prova com prévia; concluir com tempo real e dificuldades; pular; resumo da semana), sessões no Calendar e no painel da Academy. |
| 0.15.0 | 2026-11-03 | Claude (Claude Code) | Academy parte 3c: página de cada prova com preparação (conteúdos cobrados, reforço com motivos, plano de revisão, andamento), questões com acerto/erro, simulados com evolução, erros com "já revisei" e pós-avaliação (resultado, dificuldades, erros, dominados, para revisar, observações; levar ao conteúdo programático só com confirmação). Banco v12: `examPreps`. |
| 0.16.0 | 2026-11-03 | Claude (Claude Code) | Academy parte 3d: importação acadêmica com prévia (texto, .txt, CSV, .ics; provas, conteúdos em árvore, aulas e notas; disciplina pelo nome; duplicados desmarcados; PDF e imagens como material, com dica do Texto ao Vivo). |
| 0.17.0 | 2026-11-03 | Claude (Claude Code) | Academy completa (Parte 9 conferida item por item): atividades pendentes no painel e registro de itinerários e ênfases (escolhas, mudanças, interesses, experiências). Academy marcada como disponível. |
| 0.18.0 | 2026-11-04 | Claude (Claude Code) | Idiomas parte 1: idiomas (os 5 iniciais com um toque e qualquer outro), nível de referência (QECR, autoavaliação), objetivos, as quatro habilidades com nível e confiança, sessões de estudo, tempo por habilidade, histórico de evolução e cartão no Dashboard. Banco v13. |
| 0.19.0 | 2026-11-04 | Claude (Claude Code) | Idiomas parte 2: vocabulário com repetição espaçada (categorias, fases, fonte, voz do aparelho), campos de alemão (artigo, plural, casos, regência) e de mandarim (caracteres, pinyin com números vira acentos, tons). Banco v14. |
| 0.20.0 | 2026-11-04 | Claude (Claude Code) | Idiomas parte 3 e conferência da Parte 10: gramática (explicação, exemplos, exercícios), revisões por baralho (tudo, vocabulário, categoria, gramática) com treino livre, pronúncia (ouvir o modelo, gravar a própria voz, guardar nos materiais) e materiais. Notas mostram o idioma ou a disciplina ligados. Idiomas marcado como disponível; Etapa 2 concluída. Banco v15. |
| 0.21.0 | 2026-11-04 | Claude (Claude Code) | Habits (Parte 14): conclusão, quantidade, duração ou escala; frequência por dia, dias da semana, semana, mês, ano ou a cada N dias (mudanças valem a partir do dia, sem reescrever o passado); pausas que não contam contra; sem sequências; vistas Hoje, Semana, Mês e Ano (calendário de consistência); gráficos e histórico; aparece no Calendar (opcional) e no Dashboard. Banco v16. |
| 0.22.0 | 2026-11-04 | Claude (Claude Code) | Goals (Parte 15): objetivos mensuráveis (indicadores que sobem ou descem), qualitativos (sem porcentagem), de habilidade (nível autoavaliado) e por etapas (marcos); área, horizonte, status, prioridade e prazo; acompanhamento com valores, níveis e reflexões; chegar à meta só sugere concluir; ligações sem cópia com tarefas (campo Objetivo no editor), projetos, hábitos, idiomas e disciplinas; prazos e marcos no Calendar; cartão no Dashboard. Banco v17. |
| 0.23.0 | 2026-11-04 | Claude (Claude Code) | Focus (Parte 13): timer Pomodoro, tempo definido e contínuo (conta pelo horário, guardado no aparelho, visível na barra de cima); pausas e início automático configuráveis; modo minimalista e ambientes imersivos em tela cheia (biblioteca, escritório, natureza, espaço de estudo, só CSS); sons gerados no aparelho (ruído branco, rosa, marrom, chuva e ondas); sessões ligadas à tarefa e ao módulo; registro manual; "Focar nesta tarefa" no editor; cartão no Dashboard. Banco v18. |
| 0.24.0 | 2026-11-04 | Claude (Claude Code) | Música (Parte 11): violão como instrumento inicial (outros com a mesma estrutura); as 12 áreas do violão; repertório com cifra (leitura com rolagem automática), partitura (PDF ou imagem), vídeo e progresso informado; acordes com diagrama das casas; técnicas com evolução da confiança no histórico; registro de prática; metas pelo Goals; sessões do Focus ligadas ao instrumento; cartão no Dashboard. Banco v19. |
| 0.25.0 | 2026-11-04 | Claude (Claude Code) | Esportes (Parte 12): tênis e futebol com as áreas da especificação (outros esportes com estrutura geral); registro rápido de treino, partida, torneio e evento; placar e resultado; técnicas, fundamentos, habilidades e posições com evolução da confiança; aba Evolução; sem medidas do corpo; metas pelo Goals; cartão no Dashboard. Etapa 3 concluída. Banco v20. |
| 0.26.0 | 2026-11-04 | Claude (Claude Code) | Finanças parte 1: investimentos (ativos, compras, vendas, rendimentos, taxas, preço médio, valor informado com fonte, evolução, diversificação por moeda), importação de CSV com prévia e duplicatas, valores ocultos por padrão. Banco v21. |
| 0.27.0 | 2026-11-04 | Claude (Claude Code) | Finanças parte 2: Academia Financeira (cursos, aulas, resumos, conceitos, aprendizados, materiais, glossário com revisão) e Mercado (com fonte, data e fato × análise). Banco v22. |
| 0.28.0 | 2026-11-04 | Claude (Claude Code) | Finanças parte 3: Planejamento (metas pelo Goals, reserva de emergência, orçamento opcional, histórico), Diário de Investimentos e PIN de acesso. Finanças completa com as 5 áreas. Banco v23. |
| 0.29.0 | 2026-11-04 | Claude (Claude Code) | Library (Parte 18): 10 tipos de material; coleções, pastas, categorias, tags, busca e favoritos; importação com prévia e duplicatas (nada substituído, mesmo arquivo reaproveitado); um material em vários módulos (Materiais de disciplina, idioma, objetivo, instrumento e esporte); armazenamento; exclusão definitiva só com confirmação e sem apagar arquivo em uso. Corrigido: apagar de vez um item do Inbox apagava o arquivo de uma nota criada dele. Banco v24. |

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

## Notes (Parte 17) — o que existe

- Modo rápido (texto com atalhos "# ", "- ", "1. ", "[ ] ", "> ", "---", mais imagem, arquivo e desenho) e modo por blocos (texto, título H1–H3, lista, lista numerada, checklist, citação, separador, tabela, imagem com legenda, arquivo, link e desenho). Trocar de modo não perde conteúdo.
- Desenho com Apple Pencil: Pointer Events com pressão (traço engrossa com a força), pontos intermediários para suavizar, borracha, desfazer, cores e espessuras, opção "só a caneta desenha" (dedo e palma não riscam). Fundo branco tipo papel.
- Organização: cadernos, coleções, categoria, tags, favoritas, busca sem acento (inclusive tabelas e legendas), modelos de fábrica (aula, resumo de capítulo, reunião de projeto, diário) e modelos próprios.
- Salvamento automático (0,7 s depois de parar de digitar, e ao sair). Histórico: uma versão a cada 5 minutos de edição, até 50 por nota; restaurar guarda o conteúdo atual antes.
- Ligação com tarefas e eventos (um registro só). Inbox → "Virar nota" leva o texto e o arquivo do item, sem copiar o arquivo.
- Lixeira com restaurar e excluir de vez (apaga versões e arquivos que só a nota usava). "+ Criar" tem Nota; a busca global encontra notas.
- **Testado no iPad real pelo dono do produto (2026-11-03): tudo funcionando** — desenho sem balançar, sem perder traços, tela cheia, formas automáticas, só a caneta desenha, cores, pressão e salvamento.

## Ideias para o futuro (registradas, não fazem parte da Versão 1)

- **Escrita à mão → texto:** hoje, usar o Rabisco (Scribble) do iPadOS em qualquer campo de texto do ROUTIG (modo Rápido do Notes, títulos, tarefas, Inbox): reconhece letras, números e símbolos no próprio aparelho. Converter um desenho já feito em texto fica para a fase de IA (Parte 28), com autorização.

- **Voz:** agora, usar o ditado do teclado do iPad; o áudio do Inbox é recado para ouvir depois. Etapa 2 (Idiomas): gravar a própria fala para treinar pronúncia. Com IA (Parte 28): capturar falando e a IA sugerir eventos/tarefas, e resumir recados de voz, sempre com confirmação. Decisão sobre botão "Ditar" pendente do dono do produto.

## Projects (Parte 8) — o que existe

- Dados: nome, descrição, categoria, status (ideia, planejado, em andamento, pausado, concluído, cancelado, arquivado), prioridade, início, prazo, cor, capa (imagem), tags, objetivos, participantes (só registro), histórico.
- Página do projeto: visão geral com progresso real (tarefas e marcos concluídos; sem itens, não mostra porcentagem), etapas com datas, tarefas por etapa ou em Kanban (as mesmas de Tasks), marcos, cronograma (projeto, etapas, marcos, tarefas e linha de hoje), calendário, notas ligadas, referências (links) e histórico.
- Lista de projetos em cartões, Kanban por status (arrastar ou "Mover para"), timeline com marcos e calendário de prazos e marcos.
- Integração: campo Projeto no editor de tarefa; "Por projeto" no Tasks mostra os nomes; marcos aparecem no Calendar e abrem o projeto; notas ligam a projetos; "+ Criar → Projeto"; busca global encontra projetos.
- Concluir tarefas ou marcos nunca conclui o projeto sozinho. Excluir de vez não apaga tarefas nem notas, só a ligação.

## Ordem combinada a seguir (2026-11-03)

1. ~~Terminar a Etapa 1~~ (feito em 2026-11-03, versão 0.7.0).
2. ~~Backup completo~~ (feito em 2026-11-03, versão 0.8.0).
3. ~~Desenho do Notes completo~~ (feito em 2026-11-03, versão 0.9.0).
4. ~~Etapa 2: Academy e Idiomas~~ (feito em 2026-11-04, versão 0.20.0).
5. ~~Etapa 3: Habits, Goals, Focus, Música e Esportes~~ (feito em 2026-11-04, versão 0.25.0).
6. Sincronização pelo Google Drive: depois da Etapa 6.
