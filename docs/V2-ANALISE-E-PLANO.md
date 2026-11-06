# ROUTIG V2 — Análise crítica e plano de etapas

**Data:** 05/11/2026 · **Base:** código atual (V1.0.1, commit `474d15c`) + auditoria da V1.0.0 + Especificação Mestre V2
**Situação:** só análise. Nada foi alterado no código. Nenhuma etapa começa sem o OK do dono do produto.

---

## 1. Resumo em 10 linhas

1. **A visão é boa e coerente** com a V1: local-first, sem duplicar dados, honestidade sobre o que o navegador faz, sem XP/pontuação. A maior parte dos princípios já é como a V1 foi construída.
2. **O escopo é muito grande** — calculo **várias vezes o tamanho da V1** (sincronização com criptografia de ponta a ponta, parque 3D com 18 edifícios (17 módulos + Settings) e interiores, 3 novos idiomas de interface, automações, compartilhamento, colaboração, Modo Visitante, Fitbit, expansão de quase todos os módulos).
3. **Quatro peças decidem se a V2 dá certo:** Google OAuth/Drive sem servidor, criptografia com recuperação de chave, sincronização sem perda de dados e parque 3D rodando bem no iPad. **Todas precisam de prova técnica antes** de construir em cima.
4. **Há contradições na especificação** que precisam de decisão (lista na seção 4) — a principal: *"recuperação pela conta Google"* × *"Google não é a chave"* × *"E2EE"*.
5. **Três recursos exigem um servidor** (que hoje não existe): Modo Visitante personalizado com links revogáveis/senha/registro de acesso, compartilhamento com permissões, e colaboração com edição simultânea. Sem servidor, só dá para fazer versões reduzidas.
6. **Vários itens da seção 14 já foram corrigidos na V1.0.1** (lista na seção 2.2). Não precisam ser refeitos.
7. **A fundação de dados vem antes de tudo**: identidade global dos registros, referências tipadas, histórico append-only, lixeira única e migração segura. Sem isso, sincronização e criptografia ficam frágeis.
8. **O parque 3D deve ser a casca de navegação**, carregada à parte e com alternativa 2D; os módulos continuam rápidos sem depender dele.
9. **Recomendo cortar ou adiar** pouco, mas com clareza: temas "por componente", duas confirmações em toda exclusão, interiores 100% 3D para todos os módulos, Fitbit e colaboração em tempo real ficam para depois (seção 5).
10. **Proposta: 9 etapas** (seção 6), começando por uma Etapa 0 só de **provas técnicas**, que responde às perguntas que decidem o resto.

---

## 2. Diagnóstico do V1 (resumo — detalhes na auditoria `ROUTIG-auditoria-V1.0.0.md`)

### 2.1 O que preservar (funciona e está testado)
- Os 18 módulos com fluxos reais; integrações por id, sem cópia; busca global; notificações locais; privacidade por lugar; PIN do app (PBKDF2); backup com checksum, cópias internas, restauração com prévia e **recuperação seletiva**; importação/exportação CSV/ICS/Markdown com prévia; dicas por módulo; PWA offline; 272+ testes no CI.
- **Notes com Apple Pencil** (testado pelo dono no iPad) — a especificação manda preservar, e concordo: é a parte mais difícil de reconstruir.
- Regras de produto: nada inventado, "sem dados ≠ zero", sem XP, prévias antes de mudanças.

### 2.2 Itens da seção 14 **já corrigidos na V1.0.1** (código conferido)
| Item da seção 14 | Situação |
|---|---|
| Texto dizendo que o PIN de Finanças criptografa | ✅ Corrigido |
| PIN de Finanças fraco | ✅ PBKDF2 + espera crescente |
| Bloqueio abre quando a configuração não é lida | ✅ Agora mostra erro e não abre |
| Insights mostra Finanças trancado | ✅ Corrigido (Dashboard mostra só contagens, sem valores) |
| CSV formula injection | ✅ Corrigido |
| Tarefas recorrentes no Insights | ✅ Corrigido (também Dashboard e Profile) |
| Edição individual de ocorrências no Calendar | ✅ Categoria e observações; "dia inteiro" avisa |
| Deslocamento de blocos no modo rápido do Notes | ✅ Corrigido |
| Lembretes de hábitos semanais/mensais/anuais | ✅ Corrigido |
| Importação CSV de Finanças sem regras | ✅ Corrigido |
| Falha silenciosa da cópia automática | ✅ Agora avisa |
| Objetivos em Projects/disciplinas | ✅ Adicionado |

### 2.3 Ainda pendentes do V1 (entram na V2)
- **Arquitetura:** tabela `links` não usada, 4 listas de tipos de referência, integridade referencial só em projetos, 50 telas lendo o banco direto, sem `.upgrade()`, sem code-splitting (bundle ~1,8 MB), sem lockfile/ESLint.
- **Funções:** Inbox sem edição/lixeira; Academy sem lixeira de disciplinas/baralhos; vários módulos sem excluir de vez; Library sem visualizador e sem busca em PDF; Calendar sem Esportes e com filtro que esconde outros módulos; prova abre a disciplina; "como se sentiu" (Esportes) não aparece; arquivos órfãos sem limpeza.
- **Segurança:** nenhuma criptografia; backup em JSON aberto; proporções visíveis nos gráficos com valores ocultos.

---

## 3. Análise de arquitetura

| Tema | Hoje (V1) | Recomendado para a V2 |
|---|---|---|
| Camadas | domínio / repositórios / telas, mas telas leem Dexie direto | Telas só falam com **serviços por módulo**; banco atrás de repositórios; isso é pré-requisito para criptografar e sincronizar sem tocar 100 telas |
| Identidade | `id` com prefixo + `rev` + `updatedAt` | Manter os ids atuais (são únicos e aleatórios — servem como id global; trocar por UUID não traz ganho e quebra referências) + `ownerModule`, `deviceId` de criação/edição, `schemaVersion` |
| Referências | arrays soltos em cada registro | Uma **tabela de vínculos tipados** (`links`, que já existe vazia), com origem, destino, relação; migrar os arrays atuais |
| Histórico | `changelog` sem poda e sem dispositivo | **Log de operações append-only** (também serve de base para a sincronização) + versões por registro onde já existem (notas) |
| Exclusão | soft delete por módulo, purge irregular | **Lixeira única de 30 dias** + "lápide" (tombstone) que impede um aparelho offline de ressuscitar o que foi apagado |
| Migração | sem `.upgrade()` | Migração versionada e testada **numa cópia real do banco V1**, com backup validado antes e conferência de contagens depois |
| Sincronização | não existe | Outbox local + operações imutáveis por aparelho no Drive + reconciliação com relógio lógico (não relógio do aparelho) |
| Criptografia | não existe | **Camada única** (AES-256-GCM, Web Crypto) usada pelo backup, sincronização e — se decidido — armazenamento local |
| Desempenho | bundle único | Code-splitting por módulo; parque 3D e bibliotecas pesadas (PDF, 3D, equações) carregadas só quando usadas |

**Riscos principais:** (1) perder dados na migração; (2) sincronização que duplica ou some com operações; (3) usuário trancado fora dos próprios dados por causa da criptografia; (4) parque 3D lento no iPad; (5) escopo tão grande que nada fica pronto de verdade.

---

## 4. Contradições e pontos que precisam de decisão sua

| # | Ponto | Por que é um problema | Minha recomendação |
|---|---|---|---|
| D1 | **Recuperação pela conta Google** com **E2EE** e "Google não é a chave" | Para recuperar só com o login Google, a chave (ou algo que a libera) tem de ficar guardada no Google. Aí o Google tem dado + chave = não é mais ponta a ponta de verdade | **Código de recuperação + aparelho confiável** como métodos reais. Google = identidade e transporte. Se quiser recuperação "só com Google", aceitar que ela é mais fraca e deixar isso escrito na tela |
| D2 | **Criptografia local ligada por padrão** | No mesmo aparelho, a chave precisa ficar no próprio navegador; o ganho real contra quem já tem o iPad desbloqueado é pequeno, e custa desempenho, busca (índices) e risco de travar dados | **Criptografar sempre o que sai do aparelho** (Drive, backups). Local: opção avançada, ou começar com dados sensíveis (Finanças, Arquivo Pessoal) |
| D3 | **Modo Visitante personalizado, compartilhamento com permissões, colaboração** | Links revogáveis, senha, expiração, registro de acesso e edição simultânea **exigem servidor**. GitHub Pages é estático | Fazer agora só a **demonstração padrão com dados fictícios** (estática). O resto depois de decidir uma infraestrutura (custo e manutenção) |
| D4 | **Duas confirmações em toda exclusão** | Em uso diário vira atrito (apagar uma tarefa = 2 cliques de confirmação) | Mandar para a lixeira: 1 toque + **Desfazer**. Excluir de vez: confirmação reforçada. Mesmo nível de segurança, bem menos atrito |
| D5 | **Temas por componente + editor avançado** | Muito trabalho, e quebra contraste/acessibilidade fácil | Tema global + cor de destaque por módulo + presets; editor avançado depois |
| D6 | **5 idiomas de interface** (+ alemão, espanhol, mandarim) | ~3.700 textos × 3; consigo traduzir, mas sem revisão nativa a qualidade não é garantida | Estrutura pronta para 5; alemão/espanhol/mandarim **depois** de a interface parar de mudar (senão retraduz tudo a cada mudança) |
| D7 | **Interiores 3D para todos os módulos** | Maior custo visual; risco de pesar no iPad | **Revisto pelo dono (05/11): interiores 3D como na especificação**, otimizados: kit de peças geradas em código, carregamento sob demanda, níveis de detalhe, qualidade adaptativa |
| D8 | **Fitbit** | Conflita com "não coletar dados corporais" de Sports; a API do Fitbit está em transição dentro do Google — precisa confirmar se o acesso direto pelo navegador ainda é possível | Adiar para o fim; decidir se quer dados corporais |
| D9 | **Bloqueio de Distrações — "estado verdadeiro da configuração"** | O site **não consegue ler** o Tempo de Uso do iPad | Guia passo a passo + o próprio usuário marca "configurado"; a tela diz que é declarado, não verificado |
| D10 | **`drive.file` × `appDataFolder`** | A especificação cita os dois; `appDataFolder` usa outro escopo | Prova técnica decide; recomendo `drive.appdata` para a sincronização (pasta oculta) + `drive.file` para backups visíveis |
| D11 | **Projeto no Google Cloud** | OAuth exige criar um projeto, tela de consentimento e ID de cliente na conta Google do dono | Você cria (senhas e logins são seus); eu te guio passo a passo |

---

## 5. Viabilidade das funcionalidades principais

Legenda: **A** viável com a arquitetura atual · **B** viável com alterações · **C** exige prova técnica · **D** depende de infraestrutura externa (servidor) · **E** limitação de PWA · **F** precisa de decisão sua

| Funcionalidade | Classe | Motivo / alternativa |
|---|---|---|
| Fundação de dados (ids, vínculos tipados, histórico, lixeira 30 dias, migração) | **B** | Mudança grande mas só local; testável com cópia do banco |
| Code-splitting e desempenho | **A** | Vite já suporta |
| Google login + Drive sem servidor | **C** | Google Identity Services no navegador dá token de ~1 h, **sem refresh token**: renova em silêncio se a sessão Google estiver ativa; senão pede login de novo. Precisa provar no iPad instalado (popup em app de tela inicial) |
| Sincronização por operações no Drive | **C + B** | Viável, mas é a parte mais delicada; exige testes de conflito, offline por dias, reinstalação |
| E2EE (AES-GCM) de backup e sincronização | **B** | Web Crypto já usado na V1 |
| Recuperação de chave | **F + C** | Depende de D1 |
| Criptografia local por padrão | **F** | Depende de D2 |
| Busca com índice protegido | **C** | Índice em memória reconstruído ao abrir, ou índice cifrado; medir desempenho |
| Parque 3D (exterior, câmera, gestos, minimapa, dia/noite, clima) | **C** | Three.js + modelos leves gerados em código; precisa medir FPS/memória no seu iPad. Alternativa: 2.5D pré-renderizado |
| Interiores 3D | **F + C** | Ver D7 |
| Personagem opcional | **C** | Possível; baixa prioridade |
| Notes: equações, diagramas, áudio, exportar PDF/HTML | **B** | Bibliotecas carregadas sob demanda (ex.: KaTeX) |
| Library: visualizador PDF + busca no texto | **B** | pdf.js sob demanda (~1 MB, só ao abrir PDF) |
| Library: versões, exportação em lote, download sob demanda | **B / C** | Download sob demanda depende da sincronização de arquivos |
| Calendar: linha do tempo, agendar tarefas arrastando, conflitos com descanso | **B** | Arrastar por toque precisa de implementação própria (o HTML5 não funciona no dedo) |
| Calendar: fuso horário por evento, "quantidade de ocorrências" | **B** | Mudança no modelo de recorrência |
| Finance completo (contas, passivos, despesas, transferências, orçamento, projeções) | **B** | Expansão grande do modelo; manter tudo manual |
| Inbox: estados, lote, estatísticas, processamento assistido local | **B** | Regras locais (sem IA paga) |
| Inbox: transcrição de áudio | **E / C** | Sem solução local boa e gratuita no Safari hoje; deixar como "quando viável" |
| Inbox: receber compartilhamento do sistema | **E** | Web Share Target **não funciona no iPad/iPhone** (Safari); funciona em Android/desktop |
| Profile: educação, trajetória, documentos, privacidade por campo | **B** | Documentos via Library |
| Academy/Idiomas/Tasks/Projects (mapas mentais)/Music/Sports/Habits (rotinas)/Goals (subobjetivos) | **B** | Expansões de modelo e telas |
| Focus: Bloqueio de Distrações | **E** | Ver D9 |
| Notificações com app fechado | **E / D** | Sem servidor de push, não. Continua local |
| Automações locais | **B** | Só rodam com o app aberto (a especificação já reconhece) |
| Inteligência contextual local | **B** | Regras e estatísticas explicáveis, sem IA externa |
| Temas avançados | **F** | Ver D5 |
| Idiomas de interface (de, es, zh) | **F** | Ver D6 |
| Acessibilidade WCAG 2.2 AA + verificações automáticas | **B** | Ferramentas automáticas no CI (ex.: axe) + revisão manual com VoiceOver no seu iPad |
| Demonstração padrão (dados fictícios) | **A** | Estática, mesmo site |
| Demonstração personalizada / links / senha / registro | **D** | Ver D3 |
| Compartilhamento com permissões | **D** | Ver D3 (versão simples: exportar e mandar arquivo) |
| Colaboração simultânea | **D** | Ver D3 |
| Fitbit | **C + F** | Ver D8 |
| Centro de saúde técnica, histórico de atualizações | **A / B** | Base já existe (Armazenamento, Backup, Dispositivos) |

---

## 6. Plano proposto — 9 etapas (ordem por dependência)

**Por que esta ordem:** sincronização e criptografia dependem de dados com identidade e histórico corretos; o parque depende de os módulos carregarem separados; as expansões dos módulos ficam mais simples depois da fundação; o que depende de servidor fica por último, para decidir com calma.

| Etapa | Nome | O que entra | Prova de que terminou |
|---|---|---|---|
| **0** | **Provas técnicas** | (a) Login Google + Drive no iPad instalado; (b) criptografia + código de recuperação + aparelho confiável; (c) protótipo do parque 3D com 18 prédios simples, gestos e FPS medido no seu iPad e iPhone; (d) migração V1→V2 numa **cópia** do seu banco real | Relatório com resultado de cada prova (funcionou / não / alternativa) e as decisões D1–D11 fechadas |
| **1** | **Fundação de dados** | Serviços por módulo (telas sem Dexie direto), metadados globais, vínculos tipados, log de operações, lixeira única 30 dias com lápides, migração versionada com backup validado, code-splitting, lockfile + ESLint | Testes de migração com cópia real; contagens iguais antes/depois; app igual por fora |
| **2** | **Segurança** | Camada de criptografia, chaves, recuperação, backups criptografados, PIN com atraso configurável, privacidade por campo/registro, diagnóstico de segurança | Testes de criptografia e recuperação em aparelho novo |
| **3** | **Conta Google e sincronização** | Conta e dispositivos em Settings, outbox, envio/recebimento, conflitos (3 níveis), arquivos grandes retomáveis, revogação de dispositivo, backup no Drive | Bateria de testes: 2 aparelhos, offline por dias, edição × exclusão, reinstalação, interrupções |
| **4** | **Parque 3D** | Parque com 5 regiões, prédios, caminhos, lago, fonte, câmera, gestos, minimapa, busca de prédios, dia/noite/clima/estações locais, sons ambientes, qualidade adaptativa, alternativa 2D/acessível; interiores conforme D7 | FPS e memória medidos em iPad/iPhone/computador; módulos abrem sem esperar o 3D |
| **5** | **Módulos — organização** | Inbox, Notes, Library (visualizadores, PDF, versões), Calendar (linha do tempo, agendar tarefas, conflitos, fuso), Tasks, Projects (mapas mentais), Dashboard | Testes por módulo + teste no aparelho |
| **6** | **Módulos — desenvolvimento pessoal** | Academy, Idiomas, Music, Sports (analytics próprio), Focus (bloqueio guiado), Habits (rotinas), Goals (subobjetivos), Profile, Finance completo, Insights expandido | Idem |
| **7** | **Settings e transversais** | Temas (D5), acessibilidade completa, idiomas de interface (D6), central de ajuda e tutoriais, notificações centrais revisadas, automações, sugestões contextuais, saúde técnica, transparência dos dados | Verificações automáticas de acessibilidade no CI + VoiceOver no iPad |
| **8** | **Testes gerais e publicação V2** | Teste completo em aparelhos, migração real dos seus dados, critérios de liberação da seção 13.5 | Sua validação no iPad e iPhone |
| (depois) | **Com servidor** | Modo Visitante personalizado, compartilhamento com permissões, colaboração, Fitbit | Só após decidir infraestrutura (D3, D8) |

**Como preservo os dados:** nenhuma etapa migra sem backup validado e sem teste numa cópia; a V1 continua disponível na marca `v1.0.0`/`v1.0.1`; a migração só roda no seu aparelho com sua confirmação.

**Como verifico cada resultado:** testes automáticos no CI, uso real no navegador em tamanho iPad/iPhone, e — para o que depende de aparelho — uma lista curta para você testar, como na Etapa 6 da V1. Nada é marcado como pronto só porque compila.

---

## 7. Critérios de conclusão (para cada funcionalidade)

1. **Implementado:** código no repositório.
2. **Testado:** teste automático passando no CI.
3. **Validado:** usado no app publicado (navegador e, quando depender do aparelho, por você no iPad/iPhone).
4. **Publicado:** na versão estável.

Uma funcionalidade só aparece como "pronta" com os quatro. Interface sem funcionamento não conta.

---

## 8. O que preciso de você para começar a Etapa 0

1. Respostas para **D1–D11** (ou "use a recomendação").
2. Criar o **projeto no Google Cloud** (eu guio; você faz login e aceita os termos).
3. Um **backup exportado do seu iPad** (para testar a migração numa cópia — nada é alterado no aparelho).
