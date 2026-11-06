# ROUTIG V2 — Parque: plano arquitetônico consolidado (Bloco 0)

**Data:** 06/11/2026 · Base: Especificação Mestre V2 (seções 3, 4, 5.12, 11, 12, 17) + Complemento oficial de arquitetura dos 10 edifícios + pedidos do Lucas (parque único e amplo, câmera livre, primeira pessoa, Central de Recepção refeita).

**Status:** proposta para avaliação. O mapa (seção 2) precisa do OK antes da construção.

---

## 1. Princípios que valem para todo o parque

| Tema | Decisão |
|---|---|
| Mundo | **Um parque só.** Praça, prédios, caminhos, lago e interiores no mesmo mundo; entrar num prédio é voar até a porta e passar para o interior, sem trocar de página. |
| Escala | 1 unidade = 1 metro. Parque com **raio de ~190 m** (antes 66 m). Cada módulo tem um **lote próprio** (40–75 m) com entrada, pátio, paisagismo e caminho. |
| Estilo | Estilizado de alta qualidade (volumes limpos, materiais distintos, luz bem trabalhada). Não fotorrealista. |
| Materiais | Vidro, metal, pedra, madeira, concreto e vegetação, com uma paleta própria por prédio sobre uma base comum (pedra clara `#E9E4D8`, prata `#CBD5E1`, grafite `#334155`, verde da vegetação). |
| Interiores | Arquitetura 3D + **painéis 2D reais do módulo** presos às "estações" de cada setor. Nada de página comum sobre fundo 3D, e nada de 3D forçado onde 2D é melhor (formulários, editores, listas longas). |
| Acesso direto | Todo setor tem **atalho** (barra de setores, busca, menu). Nenhuma operação comum exige andar virtualmente. |
| Alternativa 2D | Navegação clássica (menu lateral atual) continua disponível sempre; obrigatória com "reduzir movimento" e para VoiceOver. |
| Dados | O 3D só mostra dados reais (como as caixas na triagem). Nada de XP, pontos ou números inventados. |
| Desempenho | Detalhe por distância (perto = completo, longe = silhueta), **um interior por vez** na memória, vegetação em instâncias, qualidade automática por aparelho. Meta: 60 quadros/s no iPad (média/alta) e no iPhone (média). |

---

## 2. Mapa do parque (proposta para aprovação)

### 2.1 Organização por função

```
                              NORTE · Conhecimento
            Idiomas ─── Academy ─── Library ─── Notes
                             (colina) Insights
                                  │
   OESTE · Bem-estar        CENTRAL · Chegada        LESTE · Tempo e execução
   Goals                  Inbox (perto da fonte)          Calendar
   Habits  ───────────  Dashboard · PRAÇA · Profile ──────  Tasks
   Focus                       Settings                    Projects
     ╲  LAGO                                               Finance
       ╲____ píer ____
           SUL · Movimento e arte
           Music (anfiteatro voltado ao lago) ─── Sports (quadras abertas)
```

### 2.2 Justificativa de cada lugar

| Prédio | Região | Por que aqui | Vizinhos e caminhos | Lote |
|---|---|---|---|---|
| **Inbox** — Central de Recepção | Central, lado norte da praça, de frente para a fonte | O prompt fixa: central, perto da fonte. É a porta de entrada das informações, o primeiro prédio que se vê | Caminho direto da fonte à entrada; caminhos para Norte (Notes e Library) e Leste (Tasks e Calendar), os destinos mais comuns | 55 × 55 m |
| **Dashboard** — Observatório Central | Central, lado sul da praça, de frente para Inbox | Visão geral da vida: fica no centro, com vista para todas as regiões; o anel panorâmico se vê de qualquer ponto | Eixo norte–sul com Inbox (entrada ↔ visão geral); saída sul para o lago e Music/Sports | 65 × 65 m |
| **Profile** — Pavilhão da Identidade | Central, lado oeste da praça | Espaço pessoal e calmo, voltado ao lado verde (Oeste); museu pessoal perto do coração do parque | Liga a praça ao Oeste (Goals e Habits: conquistas e trajetória) | 55 × 45 m |
| **Settings** | Central, lado leste da praça (posição a confirmar com o detalhamento dele) | Prédio de sistema, acessível de todo lugar, sem roubar a cena | Entre a praça e o Leste | 45 × 45 m |
| **Library** — Biblioteca Digital | Norte, centro da região | Dona dos arquivos usados por Notes, Academy e Inbox: fica no meio deles | Entre Academy e Notes; caminho reto até o Inbox (itens que viram arquivo) | 60 × 60 m |
| **Notes** — Ateliê de Conhecimento | Norte, lado leste | Ateliê silencioso, perto da Library (referências) e do Leste (projetos) | Library a oeste, Projects a sudeste; pátio de leitura virado para dentro | 65 × 45 m |
| **Academy** | Norte, lado oeste da Library | Já planejado no Norte (conhecimento) | Library e Idiomas | 70 × 60 m |
| **Idiomas** | Norte, ponta oeste | Jardim cultural, faz a transição Norte → Oeste verde | Academy e Goals | 60 × 60 m |
| **Insights** | Norte, numa colina atrás da Library | Observatório de dados: no alto, com vista para o parque inteiro | Mirante; caminho em rampa | 50 × 50 m |
| **Calendar** — Observatório Temporal | Leste, lado norte | Tempo e planejamento; caminhos radiais combinam com o lote circular | **Encostado no Tasks** (agendamento visual compartilhado) | 60 × 60 m |
| **Tasks** — Centro de Operações | Leste, centro | Execução; ligado a Calendar e Projects, e ao Inbox pelo caminho leste | Calendar ao norte, Projects ao sul, pátio de trabalho virado para a praça | 65 × 55 m |
| **Projects** | Leste, lado sul | Estúdio criativo ligado a Tasks | Tasks e Finance | 60 × 55 m |
| **Finance** | Leste, ponta sul | Já planejado no Leste | Projects | 50 × 50 m |
| **Focus** — Jardim da Concentração | Oeste, **na margem do lago** | Água e silêncio: a margem é o lugar mais calmo do parque | Habits ao norte; píer e passarela para o Sul | 65 × 55 m |
| **Habits** — Estufa de Hábitos | Oeste, centro | Crescimento e jardins; entre Focus (rotina de foco) e Goals | Focus e Goals; canteiros contínuos | 70 × 55 m |
| **Goals** | Oeste, lado norte | Jardim das Conquistas, perto de Profile (realizações) e Habits | Habits e Idiomas | 60 × 60 m |
| **Music** | Sul, margem do lago | Anfiteatro voltado para a água (som e paisagem) | Lago e Sports | 70 × 60 m |
| **Sports** — Complexo Esportivo | Sul, lado leste | Precisa de espaço aberto para quadras externas, longe dos prédios calmos | Music; caminho ao Leste (Calendar: treinos agendados) | 80 × 70 m |

**Paisagismo entre os lotes (decorativo, sem dados):** bosques de quatro espécies de árvore, gramados abertos, canteiros de flores, pequenas praças com bancos, pontes, píer no lago, mirantes, esculturas, postes e luz nos caminhos. Cada região ganha um clima próprio:
- **Central:** urbana, com pedra clara.
- **Norte:** sóbria, com árvores altas.
- **Leste:** geométrica, com caminhos retos.
- **Oeste:** jardins e flores.
- **Sul:** aberta, com quadras e o lago.

---

## 3. Os 10 edifícios especificados

Convenção: frente do prédio = lado da entrada principal (voltada ao caminho que vem da praça). Dimensões em metros (largura × profundidade × altura).
Na coluna "Hoje":
- **V1** = a função já existe no app;
- **novo** = a função entra quando o prédio for feito;
- **depois** = depende de outra etapa (sync, servidor) e o setor mostra o que já dá.

### 3.1 Dashboard — Observatório Central

**Volumetria**
| Volume | Forma | Dimensões | Pavimentos |
|---|---|---|---|
| Corpo principal | Cilindro de vidro com base poligonal (12 lados) | Ø 30 × 8 m | 1 (pé-direito duplo) |
| Anel panorâmico | Anel elevado, aberto em ~300°, sobre pilares inclinados | Ø 42 m, altura 11–13 m | Passarela |
| Volumes poligonais | Dois blocos de 6 lados nas laterais | 12 × 10 × 6 m | 1 |
| Cobertura | Placas triangulares sobrepostas, com óculo central | Ø 32 m, óculo Ø 7 m | — |

**Fachadas:** vidro panorâmico do chão ao teto entre montantes prateados a cada 3 m; marquise suspensa de 14 m na entrada, presa por tirantes; faixa luminosa ciano na base do anel e turquesa sob a cobertura.
**Materiais e paleta:** vidro levemente azulado, prata `#CBD5E1`, grafite `#334155`, pedra clara na base, luzes `#1E6FD9` · `#22D3EE` · `#14B8A6`.
**Dia e noite:** de dia, o vidro reflete o céu e o anel faz sombra no jardim. À noite, o interior aparece aceso pelas fachadas, o anel vira um aro de luz visível de todo o parque, e o óculo projeta luz para cima.
**Paisagismo:** jardins geométricos em triângulos ao redor da base, 4 espelhos d'água rasos, árvores de porte médio em anel, bancos de pedra.

**Planta**
```
              [Galeria de Painéis]
   [Sala de Perfis]  ( ÁTRIO )  [Ações Rápidas]
              [Sala de Visão Geral]
                    ║ entrada (marquise)
```
| Ambiente | Posição | Arquitetura e mobiliário | Painéis e funções | Hoje |
|---|---|---|---|---|
| Átrio Central | Centro, sob o óculo | Pé-direito duplo, o anel interno repete o externo (passarela no nível 2), piso radial de pedra | Recepção visual: saudação, data e atalhos para as 4 salas | novo |
| Sala de Visão Geral | Frente, voltada à entrada | Grande tela curva de 180° (painel panorâmico), sofás baixos em meia-lua | Resumo do dia, compromissos, prioridades, KPIs | V1 (cartões e KPIs) |
| Galeria de Painéis | Fundos | Parede-grade de molduras; mesa de montagem no centro | Escolher, organizar e redimensionar cartões | V1 (layout configurável) |
| Sala de Perfis | Bloco poligonal oeste | Mesa redonda com miniaturas dos perfis | Criar, editar, pré-visualizar e aplicar perfis | V1 (perfis do Dashboard) |
| Estação de Ações Rápidas | Bloco poligonal leste | Balcões em pé com telas inclinadas | Capturar, nova tarefa, evento e nota (usa o Criar global, sem duplicar) | V1 |

**Elemento exclusivo:** o anel panorâmico, visto por fora e repetido como passarela no átrio. A câmera pode subir até ele (mirante interno).
**Regra:** os cartões mostram e abrem os registros originais, sem copiar dados.

### 3.2 Profile — Pavilhão da Identidade

**Volumetria:** três volumes baixos e médios ligados por passagens de vidro, em forma de "U" aberto para um pátio:
- **Galeria:** 24 × 10 × 6 m, em pedra clara;
- **Bloco de madeira:** 14 × 12 × 4,5 m;
- **Torre de exposição:** 10 × 10 × 9 m, em concreto, com um balanço de 4 m sobre o pátio.

Coberturas em planos sobrepostos, com beirais finos.
**Fachadas:** a fachada expositiva da galeria tem 12 nichos iluminados com luz quente. A entrada é uma moldura de concreto de 8 × 6 m. As passagens de vidro têm 3 m de largura.
**Materiais e paleta:** pedra clara `#EDE6D8`, concreto `#B9B4AA`, madeira `#A0714F`, vidro neutro, luz âmbar `#FFD9A0`.
**Dia e noite:** de dia predominam a pedra e a madeira. À noite, os nichos e o pátio se acendem com luz quente e discreta.
**Paisagismo:** dois pátios internos com árvore isolada, jardins de caminhos curvos, bancos de concreto integrados à arquitetura e gramíneas.

**Planta:** a entrada leva ao Átrio Pessoal. À esquerda, a galeria longa reúne Interesses e depois Trajetória (com a linha do tempo no piso). Ao fundo, a torre abriga as Realizações. À direita, o bloco de madeira tem o Arquivo e a Personalização.

| Ambiente | Posição | Arquitetura e mobiliário | Painéis e funções | Hoje |
|---|---|---|---|---|
| Átrio Pessoal | Entrada | Pé-direito alto, retrato em moldura grande, banco de madeira | Foto, nome, descrição, dados principais | V1 |
| Galeria de Interesses | Galeria, primeira metade | Pedestais com o ícone de cada interesse | Interesses, páginas próprias, ligação com os módulos | V1 (interesses) |
| Galeria da Trajetória | Galeria, segunda metade | **Linha do tempo luminosa no piso e na parede** | Linha do tempo, experiências, educação, marcos | V1 (linha do tempo) + novo (educação e experiências) |
| Sala de Realizações | Torre | Vitrines em três alturas e luz zenital | Conquistas, certificados, projetos concluídos | novo (usa Goals, Projects e Library, sem duplicar) |
| Arquivo Pessoal | Bloco de madeira | Gaveteiros e mesa de consulta | Documentos e fotos: referências à Library | novo |
| Sala de Personalização | Bloco de madeira, fundos | Mesa com painel de controle | Organizar a página, campos próprios, privacidade | parcial V1 + novo |

**Elemento exclusivo:** a linha do tempo arquitetônica, uma faixa de luz que percorre a galeria do piso à parede, com marcos nos momentos reais.
**Regra:** espaço pessoal, não rede social; privacidade clara e ligada às configurações globais.

### 3.3 Notes — Ateliê de Conhecimento

**Volumetria:** edifício horizontal com três volumes retangulares em sequência, levemente desalinhados:
- **Recepção:** 18 × 14 × 5 m;
- **Ateliê:** 28 × 18 × 7 m, com cobertura assimétrica em "dente de serra" e claraboias;
- **Arquivo:** 14 × 12 × 4,5 m.

**Fachadas:** vidro e ripas de madeira verticais; um painel de concreto com textura de "camadas de papel" (faixas horizontais em relevo); marquise de madeira e metal de 10 m na entrada; janelões de 3 m mostrando as mesas de trabalho.
**Materiais e paleta:** madeira `#B8875A`, papel/creme `#F3EBDD`, grafite fino `#3B4252`, toques violeta `#8B7CF6` (a cor do Notes).
**Dia e noite:** de dia, luz zenital forte pelas claraboias. À noite, luz indireta quente e as janelas mostram as luminárias de mesa.
**Paisagismo:** pátio silencioso com bambus, espelho d'água estreito, cadeiras de leitura ao ar livre.

**Planta:** a Recepção de Cadernos fica na entrada e liga ao Ateliê, que tem a **mesa criativa no centro**. Em volta da mesa: Estúdio de Escrita ao norte, Oficina de Edição a leste e Ateliê Manuscrito a sul, junto às janelas por causa da luz. A Sala de Organização fica entre o ateliê e o arquivo, e o Arquivo de Versões fica no fim.

| Ambiente | Posição | Arquitetura e mobiliário | Painéis e funções | Hoje |
|---|---|---|---|---|
| Recepção de Cadernos | Entrada | Estantes baixas com cadernos e mesa de consulta | Cadernos, pastas, coleções, recentes, busca | V1 |
| Estúdio de Escrita | Ateliê, norte | Escrivaninhas individuais com luminária | Editor rápido | V1 |
| Oficina de Edição Avançada | Ateliê, leste | Bancada longa com telas | Editor de blocos (tabela, imagem, equação, diagrama, áudio) | V1 (blocos) |
| Ateliê Manuscrito | Ateliê, sul, nas janelas | Pranchetas inclinadas | Escrita à mão e desenho com Apple Pencil | V1 |
| Sala de Organização | Entre ateliê e arquivo | Parede de etiquetas e fichário | Pastas, etiquetas, coleções, modelos, filtros | V1 + novo (coleções inteligentes) |
| Arquivo de Versões | Último volume | Arquivo deslizante | Histórico, versões, recuperação | V1 (versões) |

**Elemento exclusivo:** a grande mesa criativa central (12 m), onde "folhas" de luz se transformam em blocos ao longo do dia.
**Regra inegociável:** ao abrir o editor manuscrito, ele ocupa a tela **exatamente como hoje**. O 3D pausa por completo (sem desenho de quadros, sem gestos de câmera), para não mexer na latência nem nos gestos do Apple Pencil.

### 3.4 Library — Biblioteca Digital

**Volumetria:** vertical, de altura média: base de 34 × 34 m com **3 pavimentos (16 m)** e coroamento escalonado em "camadas de livros". São quatro placas empilhadas, levemente giradas, com 1,2 m de balanço cada. No centro, um átrio vazado de 14 × 14 m sob claraboia piramidal.
**Fachadas:** pedra clara em faixas horizontais (as "prateleiras"), alternadas com vidro e painéis translúcidos que mostram as galerias; escadaria baixa de 5 degraus mais rampa de 1:12; entrada de 10 m de largura.
**Materiais e paleta:** pedra `#ECE7DC`, vidro, metal prata, luz branca `#F5F9FF` e azulada `#8EC5FF`, detalhe verde-esmeralda `#34D399` (a cor do Library).
**Dia e noite:** de dia, a pedra aparece em camadas. À noite, as faixas translúcidas se acendem em azul-claro e o átrio brilha pela claraboia.
**Paisagismo:** dois pátios laterais com árvores e bancos de leitura, gramado em frente à escadaria.

**Planta:** os andares se organizam em volta do átrio vazado, ligados por escada helicoidal e elevador de vidro.
- **Térreo:** Grande Átrio e Centro de Transferência.
- **1º andar:** Galeria de Coleções e Centro de Consulta.
- **2º andar:** Sala de Pesquisa e Arquivo de Preservação.

| Ambiente | Posição | Arquitetura e mobiliário | Painéis e funções | Hoje |
|---|---|---|---|---|
| Grande Átrio | Térreo, centro | Vazio de três andares, balcão circular | Visão geral, recentes, favoritos, categorias | V1 |
| Galeria de Coleções | 1º andar | Estantes contínuas ao redor do átrio | Pastas, coleções, etiquetas, vistas inteligentes | V1 + novo |
| Centro de Consulta | 1º andar, ala | Cabines de leitura com telas | Ver PDF, imagem, vídeo e áudio | V1 (visualizadores) |
| Sala de Pesquisa | 2º andar | Mesa longa e terminais | Busca, filtros, texto dentro do arquivo quando der | V1 + novo |
| Arquivo de Preservação | 2º andar, ala | Cofres de vidro | Versões, duplicatas, integridade, histórico | parcial V1 (duplicatas por hash) + novo |
| Centro de Transferência | Térreo, ala | Balcão de expedição e esteira curta | Importar, exportar, offline, operações em lote | parcial V1 + novo |

**Elemento exclusivo:** o átrio de três níveis, visto de cima, com as galerias em volta.
**Regra:** a Library é dona dos arquivos; os outros módulos só guardam referências.

### 3.5 Calendar — Observatório Temporal

**Volumetria:**
- **Tambor central:** Ø 26 × 10 m, com 2 pavimentos.
- **Dois volumes retangulares laterais:** 16 × 12 × 6 m cada.
- **Cobertura radial:** 24 nervuras metálicas convergindo para um anel.
- **Entrada:** um volume elevado (3 degraus mais rampa) com pórtico.

**Fachadas:** na fachada principal, um **relógio astronômico de 9 m** (anéis concêntricos, ponteiros e marcas das horas reais). O vidro é azul translúcido e o metal escovado.
**Materiais e paleta:** azul `#2563EB`, metal escovado `#B8C2CF`, latão claro `#D4B572` nos anéis do relógio, vidro azul.
**Dia e noite:** o relógio mostra a hora real. À noite, linhas circulares de luz contornam a cobertura e os jardins.
**Paisagismo:** jardins circulares em anéis, caminhos radiais, um espelho d'água em meia-lua.

**Planta:** o Átrio Temporal ocupa o centro, sob o relógio suspenso.
- **Térreo:** Sala Diária e Galeria Semanal à volta do átrio; Centro de Planejamento no volume lateral leste, com porta direta para o Tasks; Sala de Calendários no volume oeste.
- **2º pavimento (mezanino circular):** Sala Mensal e Anual, e Galeria de Agenda.

| Ambiente | Posição | Arquitetura e mobiliário | Painéis e funções | Hoje |
|---|---|---|---|---|
| Átrio Temporal | Centro | Relógio astronômico suspenso (Ø 8 m) | Resumo do dia, próximos eventos, conflitos | V1 |
| Sala Diária | Térreo, frente | Parede-grade de horários | Visão do dia, tarefas agendadas | V1 |
| Galeria Semanal | Térreo, fundos | 7 pórticos (um por dia) | Visão da semana | V1 |
| Sala Mensal e Anual | Mezanino | Mesa grande com o mês em relevo | Mês e ano, datas importantes | V1 (mês) + a conferir (ano) |
| Galeria de Agenda | Mezanino | Corredor curvo cronológico | Agenda de 60 dias | a conferir |
| Centro de Planejamento | Volume leste | Mesa de luz | Linha do tempo, recorrência, criar evento, **arrastar tarefas para a grade** | V1 + novo (arrastar) |
| Sala de Calendários | Volume oeste | Parede de cores das categorias | Calendários e categorias | V1 |

**Elemento exclusivo:** o relógio astronômico, visto na fachada e suspenso no átrio, girando com a hora real.
**Regra:** a tarefa agendada continua sendo o registro do Tasks.

### 3.6 Tasks — Centro de Operações

**Volumetria:** volumes angulares em alturas de 6, 9 e 12 m, em forma de "L":
- **Ala de execução:** 30 × 14 m;
- **Ala de planejamento:** 22 × 14 m;
- **Torre de comando:** 12 × 12 × 12 m.

A cobertura é feita de módulos retangulares sobrepostos.
**Fachadas:** metal prata e grafite com janelas horizontais longas (fitas de 1,5 m); entrada com uma moldura retangular suspensa de 12 × 5 m; linhas de luz ciano e azul nas arestas.
**Materiais e paleta:** prata `#CBD5E1`, grafite `#2B3442`, ciano `#22D3EE`, azul `#3B82F6`.
**Dia e noite:** de dia, visual sóbrio e sólido. À noite, as fitas de janela e as arestas se acendem.
**Paisagismo:** pátio frontal com caminhos retos, jardins geométricos, mesas de trabalho ao ar livre e pérgulas.

**Planta:** o Átrio de Tarefas fica na dobra do "L", com a **mesa digital de planejamento**.
- **Ala de execução:** Estação de Captura, Sala de Listas e Centro Kanban.
- **Ala de planejamento:** Sala de Planejamento e Centro de Recorrências.
- **Torre:** Arquivo de Execução.
- **Fundos:** passarela coberta até o Calendar.

| Ambiente | Posição | Arquitetura e mobiliário | Painéis e funções | Hoje |
|---|---|---|---|---|
| Átrio de Tarefas | Dobra do L | Mesa digital central de 10 m, com painéis em volta | Pendências, prioridades, atrasos, próximas | V1 |
| Estação de Captura | Execução, entrada | Balcões em pé | Rápida, completa, por voz | V1 + novo (voz, onde o navegador permite) |
| Sala de Listas | Execução | Paredes de listas | Listas, categorias, etiquetas, filtros | V1 |
| Centro Kanban | Execução, fundos | Painéis por estado em colunas físicas | Quadro e mover tarefas | V1 (quadro) |
| Sala de Planejamento | Planejamento | Mesa com linha de prazos | Prazos, subtarefas, dependências | V1 |
| Centro de Recorrências | Planejamento, fundos | Painel circular | Repetições, pausas, férias, feriados | V1 + novo (pausas escolares e feriados) |
| Arquivo de Execução | Torre | Arquivo em níveis | Concluídas, histórico, recuperação | V1 |

**Elemento exclusivo:** a grande mesa digital de planejamento, com as tarefas reais de hoje desenhadas sobre ela.
**Regra:** uma tarefa é um único registro, em todas as vistas.

### 3.7 Focus — Jardim da Concentração

**Volumetria:** horizontal, com uma cúpula baixa de vidro (Ø 24 m, 8 m de altura) sobre o **jardim interno com água**. Em volta, quatro pavilhões de vidro (12 × 8 × 4 m) ligados por uma galeria coberta circular. Cobertura parcialmente translúcida, com estrutura metálica fina e clara.
**Fachadas:** transparentes, com a vegetação aparecendo por dentro. A entrada é discreta, uma abertura na galeria com placa baixa.
**Materiais e paleta:** metal claro `#E2E8F0`, vidro, madeira clara, verde-água `#5EEAD4`, pedra escura polida no espelho d'água.
**Dia e noite:** de dia, luz filtrada. À noite, luz baixa e quente, e a água reflete a cúpula.
**Paisagismo:** na margem do lago, com deque, caminhos curvos, gramíneas e pedras.

**Planta:** o Jardim Central, sob a cúpula, distribui os quatro pavilhões. A Sala de Concentração fica voltada ao lago, a mais silenciosa. A Galeria de Ambientes e a Estação de Planejamento ficam nas laterais. A Sala de Histórico fica atrás. O Centro de Bloqueio de Distrações fica num nicho junto à entrada.

| Ambiente | Posição | Arquitetura e mobiliário | Painéis e funções | Hoje |
|---|---|---|---|---|
| Jardim Central | Cúpula | Ilha com árvore e água correndo | Resumo das sessões e acessos | V1 (dados) |
| Sala de Concentração | Pavilhão do lago | Poltrona única e janela para a água | Timer, sessão ativa, pausas | V1 |
| Galeria de Ambientes | Pavilhão leste | Painéis acústicos | Sons e paisagens sonoras | V1 (sons) + novo |
| Estação de Planejamento | Pavilhão oeste | Mesa baixa | Duração, objetivo, perfis de foco | V1 + novo (perfis) |
| Sala de Histórico | Pavilhão dos fundos | Parede de registros | Sessões e indicadores | V1 |
| Bloqueio de Distrações | Nicho da entrada | Totem de orientação | Guia do Tempo de Uso do iPad (D9) | novo |

**Elemento exclusivo:** o jardim interno com água no centro da cúpula.
**Limite:** a PWA não bloqueia outros apps. O guia mostra o passo a passo no iPad e registra só o que você declarar.
**Sons:** os mesmos do Focus alimentam os sons do parque, num sistema único (5.12).

### 3.8 Habits — Estufa de Hábitos

**Volumetria:** estufa orgânica com uma nave central arqueada e segmentada (40 × 16 × 11 m), duas alas laterais mais baixas (18 × 10 × 6 m) e um pavilhão de entrada em vidro (8 × 8 × 6 m).
**Fachadas:** totalmente transparentes, com arcos metálicos verde-acinzentados a cada 2,5 m.
**Materiais e paleta:** metal verde-acinzentado `#6B7F75`, vidro, madeira, verdes `#4C9A4F`, dourado discreto `#E6B450`.
**Dia e noite:** de dia, a vegetação aparece pelo vidro. À noite, luz verde e dourada baixa entre as plantas.
**Paisagismo:** canteiros, caminhos sinuosos, áreas de descanso, vegetação variada.

**Planta:** o pavilhão de entrada é o Átrio de Crescimento. Ele dá na nave central (Estufa de Hábitos), com um **jardim temático por área de hábito**. Na ala leste, o Laboratório de Rotinas e o Jardim de Execução. Na ala oeste, a Galeria de Evolução e o Arquivo de Registros.

| Ambiente | Posição | Arquitetura e mobiliário | Painéis e funções | Hoje |
|---|---|---|---|---|
| Átrio de Crescimento | Pavilhão de entrada | Bancada com vasos | Resumo dos hábitos, registros do dia | V1 |
| Estufa de Hábitos | Nave central | Jardins temáticos, um por categoria real | Acompanhar cada hábito, frequência, exceções | V1 |
| Laboratório de Rotinas | Ala leste | Bancadas de laboratório | Criar rotinas | novo |
| Jardim de Execução | Ala leste, fundos | Caminho em etapas | Execução guiada e livre | novo |
| Galeria de Evolução | Ala oeste | Painéis de calendário e heatmap | Calendário, histórico, tendências reais | V1 (heatmap) |
| Arquivo de Registros | Ala oeste, fundos | Arquivo de madeira | Histórico, pausas, recuperação | V1 + novo |

**Elemento exclusivo:** os jardins temáticos. A planta é só visual; não pune nem premia.

### 3.9 Sports — Complexo Esportivo

**Volumetria:** horizontal e angular, com uma nave de 48 × 26 m e 10 m de altura. A cobertura é assimétrica, com **balanços de 8 m**. Na lateral, uma arquibancada externa voltada para uma quadra de tênis e um campo reduzido de futebol, ao ar livre.
**Fachadas:** vidro e painéis técnicos perfurados, estrutura prata e grafite, detalhes verde-esportivos.
**Materiais e paleta:** grafite `#2B3442`, prata, verde `#22C55E`, branco das linhas de quadra.
**Dia e noite:** de dia, aberto e claro. À noite, refletores brancos nas quadras e linhas verdes nas arestas.
**Paisagismo:** pátio frontal desenhado como uma quadra, vegetação baixa.

**Planta:** o Átrio Esportivo tem as **linhas de quadra no piso e nas paredes**.
- **Frente, à direita:** Pavilhão de Modalidades.
- **Frente, à esquerda:** Centro de Treinamento.
- **Fundos, abrindo para as quadras externas:** Arena de Atividades.
- **Mezanino:** Centro de Evolução e Galeria de Análises.

| Ambiente | Posição | Arquitetura e mobiliário | Painéis e funções | Hoje |
|---|---|---|---|---|
| Átrio Esportivo | Centro | Linhas de quadra no piso, pé-direito alto | Modalidades, recentes, próximos treinos | V1 |
| Pavilhão de Modalidades | Frente, direita | Nichos de tênis e futebol | Modalidades | V1 |
| Centro de Treinamento | Frente, esquerda | Equipamentos e quadro tático | Treinos, exercícios, técnicas, habilidades | V1 |
| Arena de Atividades | Fundos, para as quadras | Arquibancada | Sessões, partidas, torneios | V1 (torneios) |
| Centro de Evolução | Mezanino | Linha do tempo | Histórico, desenvolvimento | V1 |
| Galeria de Análises | Mezanino | Telas grandes | Estatísticas, comparações | V1 + novo |

**Elemento exclusivo:** o átrio com as linhas de quadra e o movimento.
**Regra:** sem níveis, XP nem métricas corporais.

### 3.10 Inbox — Central de Recepção (refeita)

**Volumetria:** poligonal, de 8 lados:
- **núcleo central:** 16 m de altura, Ø 20 m;
- **duas alas laterais:** 20 × 12 × 7 m, parcialmente transparentes;
- **volume de distribuição:** atrás do núcleo, 14 × 12 × 8 m.

A cobertura é feita de placas triangulares que convergem visualmente para o topo do núcleo.
**Fachadas:**
- vidro azul translúcido, metal prateado e painéis ciano;
- entrada ampla de 12 m sob uma marquise suspensa;
- painéis de identificação "INBOX · CENTRAL DE RECEPÇÃO";
- iluminação linear azul e turquesa;
- antena no topo do núcleo.

**Materiais e paleta:** azul `#1E6FD9`, ciano `#22D3EE`, turquesa `#14B8A6`, prata `#CBD5E1`.
**Dia e noite:** de dia, vidro azul e metal. À noite, as linhas de luz e o **painel de fluxo** aparecem pelas fachadas.
**Paisagismo:** jardins tecnológicos, com vegetação em estruturas metálicas e canteiros em treliça.

**Planta:** a entrada dá no Átrio de Recepção, que leva ao núcleo, a **Central de Triagem**, o coração funcional. Logo atrás dela fica o Centro de Distribuição, com ligação direta. Na ala oeste fica o Arquivo, na ala leste a Galeria.

| Ambiente | Posição | Arquitetura e mobiliário | Painéis e funções | Hoje |
|---|---|---|---|---|
| Átrio de Recepção | Entrada | Balcões de captura e bancos | Captura rápida, recentes, pendências | V1 |
| Central de Triagem | Núcleo | Mesas em anel sob o painel de fluxo | Analisar, classificar, editar, etiquetas, sugestões | V1 |
| Centro de Distribuição | Atrás do núcleo | Tubos por destino, com cápsulas reais | Enviar a Tasks, Calendar, Notes, Library (V1) e a Academy, Idiomas, Projects, Goals, Music, Sports | V1 (4) + novo (6) |
| Arquivo de Informações | Ala oeste | Estantes abertas | Arquivados, histórico de processamento, lixeira | V1 |
| Galeria de Informações | Ala leste | Telas e mesas de consulta | Busca, filtros, estatísticas, vistas personalizadas | V1 (busca) + novo |

**Elemento exclusivo:** o grande painel central de fluxo, que mostra itens recebidos, em análise, processados e seus destinos, com os registros reais.
**Regra:** captura e encaminhamento, sem segunda lista; os convertidos guardam a referência do destino.
**O que muda em relação ao rascunho atual:** mais volumes (núcleo, alas e distribuição), cobertura convergente, mais mobiliário, câmera interna mais afastada e destinos novos.

---

## 4. Câmera, primeira pessoa e navegação

**Vista padrão (3.3 e 3.4):** 3D isométrica em ângulo, cinematográfica.
- **Câmera livre:** girar 360°, inclinar de quase horizontal até vista de cima, aproximar de 6 m a 300 m e deslocar pelo parque inteiro.
- **Limites suaves:** a câmera não entra no chão nem atravessa prédios.
- **Gestos:** um dedo desloca, pinça aproxima, dois dedos giram, arrastar com dois dedos inclina, um toque escolhe.
- **No computador:** mouse e teclado.

**Primeira pessoa (opcional, liga e desliga):**
- olhos a 1,7 m;
- **iPad e iPhone:** controle de andar no canto esquerdo e arrastar à direita para olhar;
- **computador:** WASD e mouse;
- colide com prédios, paredes e água; pode entrar pelas portas;
- personagem visível: opcional, numa etapa seguinte. Nunca obrigatório.

**Dentro dos prédios:**
- a vista inicial é larga, da entrada, mostrando o átrio inteiro (o rascunho atual estava perto demais);
- câmera livre por dentro (girar, aproximar, deslocar pelos ambientes) e primeira pessoa;
- prédios com vários andares trocam de andar pelo seletor de setores, com escada ou elevador animado.

**Atalhos sempre disponíveis:**
- busca de prédios e setores;
- barra de setores dentro de cada prédio;
- botão "Voltar à praça";
- transição entre regiões;
- atalhos de teclado;
- abrir um setor direto pelo menu, com voo rápido ou corte imediato com "reduzir movimento".

**Alternativa 2D:** o menu atual continua abrindo cada módulo direto.

**Contexto preservado:** sair de um prédio devolve a câmera para onde ela estava.

---

## 5. Sistemas do parque (Bloco 5)

- **Minimapa:** maquete 3D com regiões, prédios, caminhos, lago, praças, câmera e orientação; 3 níveis de zoom; "Ir até lá".
- **Ambiente:**
  - dia e noite pela hora real ou manual;
  - clima local, sem API (sol, nublado, chuva, neblina);
  - estações (cor das copas, flores, folhas caindo);
  - eventos especiais por data (ex.: aniversário do usuário, fim de ano), só decorativos.
- **Sons:** gerados no aparelho e integrados aos sons do Focus.
- **Personalização em Settings:** efeitos, sons, animações, decoração, minimapa, nomes dos prédios, qualidade gráfica (automática ou manual).

---

## 6. Pontos técnicos a validar

1. **Desempenho com 18 prédios detalhados:** detalhe por distância é obrigatório. Meço a cada bloco no navegador, e você mede no iPad e no iPhone reais.
2. **Interiores com vários andares (Library, Calendar, Dashboard):** um interior por vez na memória. A troca de andar é animação de câmera, sem carregar outro prédio.
3. **Apple Pencil no Notes:** o editor manuscrito pausa o 3D. Teste obrigatório no iPad antes de publicar o Notes.
4. **Painéis 2D dentro do 3D:** os painéis são HTML de verdade (acessíveis, com teclado e VoiceOver), presos às estações. O 3D desenhado em textura serve só para mostrar números e figuras.
5. **Criar tarefa por voz:** só onde o navegador oferece reconhecimento de voz. No iPad, Safari tem suporte limitado; se não houver, o botão não aparece.
6. **Destinos novos do Inbox** (Academy, Idiomas, Projects, Goals, Music, Sports): exigem a conversão em cada módulo. Cada tubo aparece quando a conversão existir, sem controles sem função.
7. **Tela inicial:** o parque vira a tela principal só quando estiver completo; até lá, os prédios prontos convivem com a navegação atual.
8. **Memória do iPhone:** o iPhone tem menos memória; a qualidade baixa reduz vegetação, sombras e o raio de detalhe.

---

## 7. Ordem de construção (blocos)

| Bloco | Conteúdo |
|---|---|
| 0 | Este plano + **aprovação do mapa** |
| 1 | Parque grande (terreno, lago, caminhos, praça, fonte), câmera livre, primeira pessoa, região Central completa (Inbox refeita, Dashboard, Profile, Settings) |
| 2 | Norte (Library e Notes conforme este plano; Academy, Idiomas e Insights pelo prompt principal) |
| 3 | Leste (Calendar e Tasks conforme este plano; Projects e Finance pelo prompt principal) |
| 4 | Oeste e Sul (Focus, Habits e Sports conforme este plano; Goals e Music pelo prompt principal) e o lago |
| 5 | Minimapa, clima, estações, eventos, sons, busca, personalização |

Em cada bloco: construir, testar, publicar e conferir no navegador. Depois, você testa no aparelho. Quando um interior precisar de uma função que o módulo ainda não tem, ela é feita junto com o prédio.

---

## 8. Bloco 1 — o que foi feito (06/11/2026)

- **Parque como tela inicial** (`#/`); Dashboard em `#/dashboard`; botão Menu com a navegação 2D; aparelho sem 3D vê a lista de módulos.
- **Mundo único e amplo** (raio 230 m): lotes por módulo nos lugares da seção 2, relevo (colina do Insights e morros na borda), lago com orla, pedras, ninfeias e píer, caminhos curvos com postes, cerca de 1.100 árvores por região, canteiros de flores, praça maior com a fonte ROUTIG.
- **Região Central detalhada:** Central de Recepção (refeita), Observatório Central, Pavilhão da Identidade e Settings, por fora e por dentro.
- **Interiores com painéis reais:**
  - Inbox: capturar, triagem, distribuição, arquivo, busca;
  - Dashboard: completo, troca de perfil, ações rápidas;
  - Profile: cartão, interesses, linha do tempo, conquistas;
  - Settings: as seções de configuração em seis salas.
- **Câmera livre** (gira, inclina, aproxima de 4 a 380 m, sem atravessar chão e prédios) e **primeira pessoa** (controle na tela, WASD, colisão, botão "Entrar" perto das portas).
- **Medido no navegador do computador (qualidade alta):**
  - iPad: 60 quadros/s, cerca de 97 desenhos;
  - iPhone: 60 quadros/s, cerca de 76 desenhos;
  - interiores: 35–55 desenhos.
- **Falta:**
  - medir no iPad e no iPhone reais;
  - Arquivo Pessoal do Profile (etapa do Profile);
  - os outros 14 prédios ainda têm a forma provisória (Blocos 2 a 4);
  - minimapa, clima, estações, sons (Bloco 5).
