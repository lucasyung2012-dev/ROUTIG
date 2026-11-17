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
  - Subir e descer seguem o caminho da escada.
- **Elevadores em hall próprio**: 1 ou 2 cabines conforme o prompt, portas que abrem e fecham, painel de chamada e indicador de andar.
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

- **Subir pela escada é uma animação**: o jogador não controla a direção durante a subida.
- **No térreo, a viagem de elevador atravessa a parede do fundo**: não há uma abertura de verdade no portal.
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

- **Período do relatório**: ficou sábado a sexta, e não sexta a sexta, para a sexta não contar duas vezes.
- **Concha acústica ao ar livre da Música**: foi mantida, mas pode duplicar o palco do parque a cerca de 60 m.
- **Lanterna do Inbox**: ficou aberta sobre a escada (3 painéis a menos).
- **Prompt Master V3 (District)**: ainda não recebido. O District segue como página de planejamento.
