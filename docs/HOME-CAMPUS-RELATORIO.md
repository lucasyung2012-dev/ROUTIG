# ROUTIG Home e Campus — relatório de conclusão

Relatório pedido na seção 46 do "Prompt de implementação do Home e Campus" (15/11/2026).
Trabalho feito entre 15 e 17/11/2026. Todo o código está em `main`; cada entrega passou no CI
(tipos, testes e build) antes de ir ao ar, e o que está marcado "testado no navegador" foi conferido
no site publicado.

## 1. O que foi implementado no Home

- **Home 2D como menu de jogo**, sem números de produtividade.
  - O cenário da praça ocupa a tela inteira: torre com escultura de anéis, fonte iluminada, letras ROUTIG no canteiro, prédios de vidro, gente passeando, manhã, tarde e entardecer.
  - Por cima, a barra lateral de vidro, a saudação e os três cartões (Control Room, Campus, District), cada um com favorito e borda de luz na cor da experiência.
  - Testado no navegador, no computador e no tamanho de iPhone.
- **Frase do dia** embaixo da saudação: 14 frases próprias, uma por dia, sem números.
- **Barra lateral**:
  - no alto, o logo e o slogan;
  - Início, Control Room, Campus e District;
  - Perfil, Configurações e Ajuda separados embaixo.
  - No iPhone, menu em gaveta.
- **iPhone com o app na tela inicial**: barras e painéis não ficam mais embaixo do relógio e da câmera (safe-area). Confirmado pelo Lucas no aparelho.

## 2. O que foi implementado no Campus

- **Forma e tamanho próprios para cada um dos 15 prédios**, pelo prompt.
  - Volumes retangulares ligados, radial com alas (Calendar), círculo e blocos (Insights), estufa só térreo (Habits), torre sobre pódio (Goals), assimétrico (Música) e assim por diante.
  - Um único contorno vale por fora, no térreo, nos andares e no terraço (`massing.ts` e `outline.ts`).
  - Fachadas só com os materiais do prompt.
- **Térreo detalhado** em todos os prédios: cada ambiente da lista "Térreo" do prompt tem área própria, com móveis, materiais, iluminação e placa.
- **Andares e terraços** pelo programa de cada prédio, só com salas que têm função no módulo.
- **Escadas do tipo do prompt**:
  - em U, em L, reta ou curva;
  - Insights pelo núcleo em espiral;
  - lances com patamares, corrimão e guarda-corpo, e vão aberto em cada laje.
  - Sobe-se e desce-se andando, com controle de direção e câmera e troca de andar sem teletransporte.
- **Elevadores em hall próprio dentro do prédio** (sem torre na grama): 1 ou 2 cabines conforme o prompt, portas que abrem e fecham, painel de chamada e indicador de andar.
- **Entrar e sair sem tela preta**: a imagem da porta se dissolve sobre a cena nova. Medido no navegador: a tela não escurece em nenhum quadro.
- **Estações próprias do Campus nos 15 prédios** no lugar das páginas do Control Room embutidas.
  - Cada área abre uma interface do lugar, com as ações reais do módulo: criar tarefa, check-in de hábito, sessão de foco compartilhada, notas, agenda, objetivos, prática e outras.
  - Formulários detalhados reaproveitam os diálogos do próprio módulo.
- **Interações nativas em 3D**: piano, bateria, violão (seis cordas e sete acordes) e o cofre de Finanças, que abre com o PIN existente.
- **Assentos**: dá para sentar nos bancos, sofás e cadeiras dos térreos (cerca de 380 lugares) e nos jardins.
- **Paisagismo de cada prédio** (seção 37):
  - relógio de sol no Calendar, pérgolas, mesas, palco da Música, espelhos d'água;
  - caminho de pedra e madeira na ilha do Focus.
- **Focus numa ilha do lago**, com ponte acessível.
- **Totens** com símbolo, título e nome oficial na frente de cada prédio.
- **Minimapa**:
  - recolher e reabrir, arrastar livre com zoom, botão de recentralizar, nomes por nível de zoom e as cinco categorias;
  - arrasto leve no iPad e no celular (a imagem pronta só se desloca).
- **Bugs da Música corrigidos**:
  - não conseguir sair e o palco travado: havia um obstáculo invisível no eixo da porta;
  - o arco furando o morro: o terreno do lote era puxado pelo palco externo.

## 3. Funcionalidades existentes preservadas

- Control Room completo (16 módulos), com a mesma base de dados. O Campus não tem banco paralelo.
- Seletor discreto Control Room ↔ Campus, sem voltar ao Home, preservando o que está em andamento (o timer de foco continua).
- Parque vivo: pessoas, quiosques, carrinhos de pipoca e coco, patos, clima, ciclo dia e noite, cidade em volta.
- Sincronização por Dropbox, PIN do app e de Finanças, backup.

## 4. Funcionalidades modificadas

- O Campus tem 15 prédios: Dashboard, Profile e Settings saíram, como pede o prompt. O Dashboard continua no Control Room.
- As estações do Campus deixaram de abrir a página do Control Room. O link "Abrir no Control Room" fica como opção secundária.
- O prédio de Esportes deixou de ter quadra e campo próprios, que repetiam os do parque.
- No Inbox, 2 colunas do núcleo e 3 painéis da lanterna saíram para abrir o vão da escada.

## 5. Integrações realizadas

- As estações usam os mesmos repositórios, hooks e serviços do Control Room. Uma tarefa criada no Campus aparece no Control Room, e vice-versa.
- A sessão de Focus é a mesma nas duas experiências.
- O cofre e as estações de Finanças usam o mesmo `FinanceLock`.
- **Extras pedidos pelo Lucas durante o trabalho:**
  - **Apagar em todos os aparelhos**: limpa este aparelho, a cópia no Dropbox e os outros aparelhos na próxima sincronização; a conexão continua.
  - **Relatório da semana** para os pais:
    - semana de sábado a sexta, com mês e ano como opções;
    - hábitos, tarefas e objetivos como principais e o resto opcional;
    - as escolhas ficam salvas;
    - envio por texto para o WhatsApp ou PDF;
    - lembretes na sexta às 16h e às 20h.

## 6. Testes executados

- CI do GitHub Actions em cada entrega: tipos (TS estrito), Vitest e build.
- Testes novos:
  - contorno dos prédios, andares e escadas;
  - estações dos três grupos de prédios;
  - violão e cofre;
  - fluxo de sincronização (apagar em todos os aparelhos);
  - relatório da semana (período, texto e PDF);
  - Home com a frase do dia.
- **No navegador (site publicado):**
  - Home no computador e no iPhone;
  - minimapa (arrasto livre a cerca de 54 quadros por segundo com o parque rodando);
  - forma por fora de Academy, Calendar e Música;
  - Library, Música, Finanças e Tasks por dentro;
  - subir e descer pela escada e viajar de elevador na Library;
  - entrada e saída sem tela preta;
  - cofre;
  - Estação de Captura de Tasks;
  - relatório da semana;
  - jardins dos 15 prédios;
  - varredura da vegetação do mapa inteiro: 3.057 árvores, 814 arbustos e 1.404 flores, nenhuma em cima de caminho, banco, passarela ou prédio.
- `stairs:check` (móveis do térreo no vão da escada) nos 13 prédios com escada: zero em 10. Em Focus, Goals e Idiomas sobram só peças que encostam na borda do vão (a menos de 0,3 m), nenhuma dentro dele; a subida pela escada do Goals foi vista no navegador sem nada atravessando.

## 7. Problemas encontrados

- **Internet**: em 15/11 o GitHub ficou inacessível desta máquina, e o envio esperou a conexão voltar.
- **CI quebrado duas vezes**:
  - um import faltando nas escadas;
  - um trecho inserido no meio de uma linha nas notificações.

  Os dois foram corrigidos na hora.
- **Câmera dos interiores acima das galerias** (Library): escondia o térreo. Corrigido: a câmera desce para baixo da laje.
- **Móveis do térreo no vão das escadas**: eram 141 peças em 7 prédios. Foram medidas prédio a prédio e mudadas de lugar; restam só contatos de borda em Focus, Goals e Idiomas.

## 8. Pendente

- **Elevador dentro do prédio, escada andando e elevadores de sobe e desce** (17/11): conferidos no navegador. Em todos os andares dos 14 prédios com andares, dá para sair do elevador, chegar ao pé e ao topo de cada lance e subir e descer andando (`stairs:reach`), sem nada no vão ou no hall (`stairs:check`). O elevador da esquerda só sobe e o da direita só desce; a tela de escolha mostra só os andares naquela direção (testado na Library: subir do térreo ao 2º e descer do 2º ao térreo). Detalhe a corrigir: no térreo, a dica perto do elevador que desce ainda diz "Chamar o elevador que desce".
- **Algumas áreas grandes ainda abrem a tela do módulo**:
  - backup e transferência (Library);
  - escrita à mão (Notes), pelo Apple Pencil;
  - página completa da matéria (Academy);
  - gramática e pronúncia (Idiomas).
- **Lembretes do relatório**: seguem o limite das notificações do app (com o app aberto ou em segundo plano).
- **Não testado no navegador**:
  - "Copiar texto" e "Gerar PDF" do relatório com dados reais;
  - o caso do cofre com PIN definido;
  - sentar nos novos assentos.
- **Testes no iPad e no iPhone de verdade**: são do Lucas (veja `TESTES-APARELHO.md`).

## 9. Decisões que precisam de nova aprovação

Revisadas com o Lucas em 17/11/2026: as três primeiras foram aprovadas como estão (semana de sábado a sexta, concha da Música mantida, lanterna do Inbox aberta sobre a escada). Segue em aberto só o District.

- **Período do relatório**: ficou sábado a sexta, e não sexta a sexta, para a sexta não contar duas vezes.
- **Concha acústica ao ar livre da Música**: foi mantida, mas pode duplicar o palco do parque a cerca de 60 m.
- **Lanterna do Inbox**: ficou aberta sobre a escada (3 painéis a menos).
- **Prompt Master V3 (District)**: ainda não recebido. O District segue como página de planejamento.

## 10. Depois do relatório (17 e 18/11/2026)

- **Andares com dados de verdade** em todos os prédios, com os andares vazios preenchidos pela opção A aprovada:
  - Academy 3º: provas e notas;
  - Idiomas 3º: biblioteca de vocabulário;
  - Música 2º: estúdio com piano, bateria e violão.
- **3D de verdade (piloto)**:
  - Habits: canteiros com os hábitos do dia;
  - Tasks: quadro Atrasadas, Hoje e Feitas hoje;
  - Calendar: parede do dia com a linha da hora.
- **3D de verdade nos outros prédios**: uma parede com dados reais em cada um. Em Goals, Projects, Focus, Inbox, Academy, Notes e Library, tocar faz a ação ou abre o item; em Idiomas, Música, Esportes e Insights, a parede só mostra os dados e o toque abre a estação. O que cada parede faz:

  | Prédio | Parede | Ao tocar |
  |---|---|---|
  | Goals | objetivos com o progresso | check-in |
  | Projects | projetos ativos | conclui o próximo marco, com desfazer |
  | Focus | relógio da sessão compartilhada | pausa, retoma ou inicia |
  | Inbox | chegadas para triar | arquiva, com desfazer |
  | Academy | estudo do dia | marca como feito |
  | Notes | notas recentes | abre no editor |
  | Library | itens recentes | abre o item |
  | Idiomas | palavras para revisar e minutos da semana | abre a estação |
  | Música | prática por instrumento | abre a estação |
  | Esportes | atividades do dia | abre a estação |
  | Insights | indicadores da semana | abre a estação |

  Finanças segue só com o cofre e o PIN.
- **Prédios mais vivos**:
  - pessoas conforme a hora: recepção, gente sentada digitando ou lendo, nos quadros, nas estantes, treinando e praticando, e alguns andando;
  - luz da hora por dentro e janelas acesas por fora nos andares ocupados;
  - som de ambiente por prédio, só com "Sons do parque" ligado;
  - objetos em uso: notebooks, livros, xícaras, casacos, ventiladores e relógios que andam.
- **Conferido no navegador em 18/11/2026:**
  - em todos os andares dos 14 prédios com andares, dá para chegar à escada e ao elevador, e nada fica no vão (`stairs:reach` ok e `stairs:check` 0);
  - Library: 23 pessoas distribuídas pelos andares (recepcionista digitando, gente nas estantes, sentada no 1º andar);
  - paredes do Inbox e de Goals: mostram o estado vazio verdadeiro, porque não há chegadas abertas nem objetivos ativos.
- **Não testado:**
  - tocar nas paredes, porque mexeria nos dados do Lucas;
  - a luz e o som à noite;
  - as paredes que têm dados, como Library e Notes.

## 11. Objetos 3D aprovados (18/11/2026)

Aprovados pelo Lucas no chat. Cada objeto faz a ação no próprio mundo 3D, com os mesmos repositórios do Control Room. Commit e7dba2e, CI ok.

| Prédio | Objeto | O que faz |
|---|---|---|
| Tasks | tela da mesa de criação rápida | cria a tarefa (título e prazo) |
| Calendar | horas cheias da parede do dia | cria o evento naquela hora |
| Goals | placa "Novo objetivo" | cria objetivo (o check-in na parede continua) |
| Projects | maquete | blocos com o progresso real; tocar mostra e conclui os marcos |
| Focus | luminária de cada sala e cabine | inicia, pausa e retoma a sessão |
| Inbox | bandeja de cartões | Tarefa, Nota, Arquivar ou Guardar na Library |
| Notes | caderno aberto | nota rápida |
| Library | estante "Novos" | lombadas com os itens reais; tocar abre o item |
| Academy | nome da matéria na lousa | abre a matéria |
| Idiomas | baralho | revisão das palavras do dia (Lembrei / Não lembrei) |
| Música | piano, bateria e violão | ao sair, "Registrar prática" com os minutos tocados |
| Esportes | faixas das modalidades | registram a atividade do dia |
| Insights | esferas em volta do núcleo | um indicador real em cada; Finanças trancada sem o PIN |
| Finanças | quadro dentro do cofre | saldos só para ler, e só com o PIN |

Mudanças em relação ao combinado:
- No Inbox é tocar e escolher, sem arrastar.
- No Calendar ficou na parede do dia, e não no relógio de sol.

Conferido no navegador:
- `stairs:reach` ok e `stairs:check` 0 nos 14 prédios com andares.
- Mesa do Tasks: a caixa "Nova tarefa" abre presa à mesa e foi cancelada sem criar nada.
- Estante "Novos" da Library: mostra os 2 itens reais. As lombadas novas ficam na frente dos livros decorativos, ajuste visual pendente.

Não testado:
- Os outros objetos só foram medidos, sem olhar na tela.
- Nenhuma ação foi concluída, para não mexer nos dados do Lucas.
