# ROUTIG V2.1: auditoria da implementação

**Atualizado: 2026-11-06.** Comparação do que está no repositório (branch `main`, publicado no GitHub Pages) com o prompt mestre da V2.1.

Classificação (seção 20): **Conforme**, **Parcial**, **Divergente**, **Ausente**, **Não verificado**.
Cada item separa o que existe na tela (visual), o que funciona de verdade (real) e como conversa com o resto (integração).

## Como foi verificado

| Tipo de evidência | O que é |
|---|---|
| CI | `Tipos, testes e build` no GitHub Actions: TypeScript estrito, Vitest e build. Verde em todos os commits da V2.1 listados no fim. |
| Teste automático | Arquivo em `tests/` que roda no CI. Citado pelo nome. |
| Navegador | Site publicado aberto no navegador do app (Windows, janela ~800×600). **O painel do navegador ficou oculto** durante parte do teste, e aí a página roda a 1 quadro por segundo: movimento contínuo e quadros por segundo **não** foram medidos por ali. |
| Aparelho real | **Nenhum teste em iPad ou iPhone de verdade foi feito nesta rodada.** Tudo que depende de toque real, desempenho no aparelho ou som no iPad está como Não verificado. |

## Planta geral (seção 7)

Coordenadas em metros, centro da praça em (0, 0); norte = z negativo. Fonte: `src/domain/park.ts` (`PARK_BUILDINGS`, `LAKE`, `PONDS`, `POIS`).

| Região | Prédio (módulo) | Posição (x, z) | Lote (raio) |
|---|---|---|---|
| Centro | Observatório Central (Dashboard) | (0, -60) | 30 |
| Centro | Pavilhão da Identidade (Profile) | (-55, 35) | 26 |
| Centro | Central de Recepção (Inbox) | (55, 35) | 27 |
| Norte | Centro de Aprendizagem (Academy) | (-45, -150) | 33 |
| Norte | Biblioteca Digital (Library) | (30, -150) | 30 |
| Norte | Ateliê de Conhecimento (Notes) | (95, -125) | 28 |
| Norte | Jardim da Concentração (Focus) | (-115, -115) | 28 |
| Leste | Jardim das Línguas (Idiomas) | (140, -45) | 28 |
| Leste | Estúdio de Projetos (Projects) | (165, 25) | 28 |
| Leste | Pavilhão Musical (Music) | (125, 95) | 31 |
| Oeste | Complexo Esportivo (Sports) | (-165, 0) | 40 |
| Sul | Estufa de Hábitos (Habits) | (-45, 115) | 28 |
| Sul | Jardim das Conquistas (Goals) | (-60, 180) | 28 |
| Sul | Observatório Temporal (Calendar) | (15, 118) | 27 |
| Sul | Centro de Operações (Tasks) | (70, 140) | 28 |
| Sul | Observatório de Dados (Insights) | (5, 192) | 24 |
| Sul | Centro Financeiro (Finance) | (72, 200) | 24 |
| Sul | Edifício de Configurações (Settings) | (-115, 182) | 24 |

Lago principal orgânico em (-125, 95), entre Oeste, Sul e Centro (não no centro geométrico). Lagos ornamentais no Sul: (-15, 162) e (-92, 150). Residências: 44 casas num anel a 266–284 m, fora da área explorável (240 m).
O minimapa do parque desenha esta planta com os caminhos e o lago.

## 3. Visão geral

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Abre num parque 3D, que é a navegação principal | Conforme | Rota `/` é o parque (`ParkPage`). Navegador: abre na praça. |
| Explorar em primeira pessoa, câmera livre e terceira pessoa | Conforme | `camera.ts`; `tests/parkCamera.test.ts`. Navegador: 1ª e 3ª pessoa vistas. |
| Entrar nos prédios e explorar os interiores | Conforme | 18 interiores (`interiors/*.ts`) com andares (`interiors/floors.ts`). |
| Interagir com elementos do ambiente | Parcial | Sentar, mirante, árvore, água e pessoas (botão Interagir ou E). Não há aproximação "cinematográfica" dedicada; a vista aproxima o campo de visão. |
| Encontrar personagens e ver o que fazem | Parcial | 64 moradores com rotina; a dica mostra nome e atividade. Figuras simples (ver 13.1). |
| Central de Módulos | Conforme | `ModuleCenter.tsx`. |
| Alternar para a interface 2D sem perder o contexto | Conforme | `parkContext.ts` + `restore` no motor. Botão "Voltar ao parque" no 2D. |

## 4. Direção visual e escala

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Realismo arquitetônico estilizado, sem low-poly | Parcial | Prédios com fachada, vidro, montantes, lajes e coberturas feitos em código. Ainda há peças facetadas (copas com icosaedros, figuras humanas em cápsulas). Sem texturas de imagem. |
| Personagem 1,70 m | Conforme | `people.ts` (cabeça no topo a ~1,70 m com escala 1); olhos da câmera a 1,70 m (`tests/parkCamera.test.ts`). |
| Assentos 0,43–0,48 m e mesas 0,72–0,78 m | Conforme | Bancos a 0,45 m e mesas a 0,75 m (`buildings/amenities.ts`, `interiors/floors.ts`). |
| Pé-direito 3,4–4,2 m | Parcial | Andares superiores: 4,1 m livres (`floors.ts`, `STOREY` 4,4 m com laje). Térreos têm 6,5–14 m (átrios altos). |
| Portas 2,1–2,4 m, corrimãos 0,9–1,1 m | Parcial | Guarda-corpos dos andares a 1,1 m. Portas não foram medidas uma a uma. |
| Árvores ornamentais 3–7 m, grandes 10–20 m | Conforme | `kit.ts` (`SPECIES`): palmeira ~7 m, emergente `slender` ~11–13 m com escala. |

## 5. Regiões

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Cinco regiões identificáveis com áreas naturais entre elas | Conforme | `PARK_REGIONS`, cores de terreno por região e espécies por região (`world.ts`, `plants()`). |
| Norte: mata densa, árvores grandes | Conforme | Densidade e emergentes maiores no Norte (`treeDensity`, `plants`). |
| Sul: jardins ornamentais, flores, lagos menores | Conforme | Mais canteiros no Sul, 2 lagos ornamentais, pérgola. |
| Leste: aberto, gramados, árvores espaçadas | Conforme | Densidade menor no Leste. |
| Oeste: colinas, trilhas, esporte | Conforme | Relevo de colinas (`rawHeight`), trilha das colinas, mirante. |
| Centro: praça monumental, fonte ROUTIG | Conforme | `plaza()`, `fountain()`. |

## 6. Terreno, vegetação, jardins e água

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Terreno contínuo com colinas, vales e plataformas | Conforme | `heightAt`: relevo por região, lotes nivelados com transição suave. |
| Rampas e escadas no terreno | Ausente | Não há escadas externas modeladas; a circulação usa rampas naturais do relevo. |
| Copas irregulares, espécies variadas | Conforme | `blobCrown`, palmeira com folhas arqueadas, 5 espécies. |
| Arbustos, flores, grama | Parcial | Arbustos e flores em instâncias; grama é a cor do terreno (sem fios de grama). |
| Jardins com bancos, pérgolas, espelhos d'água | Conforme | `amenities.ts`, `POIS`. |
| Lago orgânico entre regiões, enseadas, penínsulas | Conforme | `lakeRadiusAt` (margem por senos), píer, pedras. |
| Lagos menores, fonte, cascatas | Conforme | Lagos ornamentais com cascata; fonte da praça. |
| Reflexos, ondulações, transparência | Parcial | Água em shader com brilho, ondas e transparência; sem reflexo real do ambiente. |
| Colisão invisível nas margens | Conforme | `inWater` + `blocked` na câmera; `tests/parkCamera.test.ts` (não entra na área bloqueada). |
| Sem cercas em volta dos lagos | Conforme | Nenhuma cerca. |

## 7–9. Prédios, caminhos e convivência

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Distribuição por região conforme a lista aprovada | Conforme | Tabela da planta acima; `tests/park.test.ts` confere 18 prédios, 5 regiões e nenhuma sobreposição. |
| Núcleos de 2–4 prédios com pátios compartilhados | Conforme | `COURTS` (aprendizagem, leste, planejamento, crescimento). |
| Três níveis de caminho (4–6 / 2–3,5 / 1,2–2 m) | Conforme | `PATH_WIDTH`: 5,5 / 3 / 1,6 m. |
| Circuitos circulares | Conforme | Anel entre regiões e trilha em volta do lago. |
| Cafés, quiosques, praças, pérgolas, mirantes, leitura, bancos, mesas | Conforme | `POIS` e `amenities.ts`. |
| Anfiteatro ligado ao Pavilhão Musical | Conforme | Palco/anfiteatro em (92, 58), virado para o Music; som da roda de violão sai dele. |

## 10. Arquitetura dos 18 prédios

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Arquitetura 3D real, fachadas com profundidade, vidro, coberturas | Parcial | Prédios detalhados por região (`buildings/*.ts`). Varandas e terraços externos não existem em todos. |
| Número de níveis por prédio | Parcial | Por dentro: os níveis pedidos existem (`tests/parkFloors.test.ts`). Por fora: os volumes externos são os da V2 e **não** mostram o mesmo número de pavimentos. |
| Elevador panorâmico, galerias suspensas, terraços | Parcial | Torre de elevador envidraçada e terraços em todos os prédios com andares; galerias em volta do átrio. Os detalhes próprios de cada prédio (relógios do Calendar, estrutura aparente do Projects etc.) seguem os da V2. |
| Interiores visíveis pelas janelas | Ausente | O interior é uma cena separada, carregada ao entrar; de fora vê-se o vidro, não o interior. |

## 11. Interiores

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Ambientes reais com mobília e interfaces funcionais | Parcial | Térreo: os setores da V2, cada um com o painel real do módulo. Andares: salas com mobília (mesas, estantes, telas, sofás) que abrem o painel real correspondente. Várias salas abrem o **mesmo** painel (ex.: as salas de Projects abrem o estúdio). |
| Salas por andar como na seção 11 | Parcial | Todas as salas listadas existem com placa (101 salas). 6 não têm tela própria e não abrem nada (Insights: criação de dashboards, personalização de indicadores; Music: descanso; Sports: recuperação e descanso). Idiomas: as salas por idioma (português, inglês etc.) não existem como salas; os idiomas reais aparecem no térreo. |
| Circulação vertical | Conforme | Navegador: botões Térreo / 1º / 2º andar na Biblioteca; no 1º andar aparecem o átrio com guarda-corpo, as salas com placa e os bancos do terraço. A dica "Elevador: próximo andar · E" aparece perto da torre. |
| Navegáveis em primeira pessoa e câmera livre | Conforme | O motor troca o "chão" e os limites por andar; o átrio aberto bloqueia a passagem. |
| Library dona dos arquivos; Notes preserva edição | Conforme | Sem mudança nos módulos; os painéis são os mesmos da V2. |

## 12. Navegação 3D e 2D

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Interface 2D completa preservada | Conforme | Todas as rotas da V2 seguem; teste `tests/app.test.tsx` confere os 18 módulos no menu sem 3D. |
| Primeira pessoa como modo principal | Conforme | Padrão ao abrir (`saved.cam ?? 'walk'`). |
| Câmera livre: 360°, inclinação, zoom, deslocamento, altura, transições suaves | Conforme | OrbitControls com limites; deslizes com easing. |
| Sem distorção de lente | Conforme | Campo de visão 55° (30° ao observar). |
| Joystick inferior esquerdo configurável, área de olhar independente | Conforme | Joystick com tamanho e lado; arrastar fora dele gira a vista. |
| Botões de correr, pular e interagir | Conforme | `ActionButtons` em `ParkPage.tsx`. |
| Sensibilidade, velocidade, inversão | Conforme | Opções → Controles; `tests/parkCamera.test.ts` (velocidade). |
| Ocultar controles | Conforme | Opções → Controles → "Ocultar controles na tela". |
| Teclado e mouse | Conforme | WASD/setas, Shift, Espaço, E, V; mouse arrasta. |
| Aceleração e desaceleração naturais; salto moderado | Conforme | `tests/parkCamera.test.ts`: aceleração, parada, pulo de 0,4–0,65 m. |
| Sem salto sentado nem durante transições | Conforme | Pular sentado só levanta; durante deslizes não há movimento. |
| Central de Módulos: botão flutuante, no parque e nos interiores | Conforme | Botão à esquerda, sempre visível. |
| Barra lateral com 18 módulos, cartões, busca, favoritos, recentes, atalhos | Conforme | `ModuleCenter.tsx`. Navegador: abriu, a busca "fina" achou Finanças, a estrela fixou a Library nos favoritos. Favoritos e recentes ficam neste aparelho. |
| Abrir o 2D completo ou entrar no prédio | Conforme | Navegador: "Entrar no prédio" levou para dentro da Biblioteca; "Abrir em 2D" abriu `#/library`. |
| Voltar ao contexto (posição, orientação, modo, prédio, interação) | Parcial | Navegador: "Voltar ao parque" no 2D voltou para dentro da Biblioteca, na 3ª pessoa. O andar não voltava (voltou no térreo); corrigido no commit seguinte, ainda não conferido no navegador. A interação aberta (setor ou painel) não volta. |

## 13. Personagens e vida

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Modelo universal neutro de 1,70 m | Parcial | Figura neutra (cabeça, tronco, braços, pernas), sem divisão de gênero. **Sem rosto, cabelo e mãos detalhados**: é uma figura estilizada simples. |
| Primeira pessoa sem corpo; terceira com modelo completo | Conforme | Avatar só aparece na 3ª pessoa. |
| População simulada de 50–80 | Conforme | 64 moradores (`tests/parkPeople.test.ts`). |
| Visíveis: iPad 12–24, iPhone 6–12 | Conforme | `crowdCap` por tamanho de tela e modo gráfico. Não verificado em aparelho real. |
| Nome, casa, horários, locais e atividades preferidas, conhecidos | Conforme | `campusPeople()`. |
| Rotina por horário, clima e estação | Conforme | `activityAt`; testes: madrugada vazia, chuva esvazia e leva a lugares cobertos. |
| Grupos de amigos recorrentes | Conforme | Grupos de 1–4 que fazem a atividade juntos, em roda. |
| Atividades individuais (ler, violão, estudar, caminhar, descansar) | Parcial | Poses: em pé, andando, sentado, lendo, tocando, acenando, exercício. Desenhar e fotografar não existem. |
| Eventos espontâneos sem missões | Conforme | `spontaneousEvent`: roda de música, piquenique ou jogo, um por dia, sem recompensa. |
| Reações à proximidade | Conforme | Olham, acenam (no máximo a cada 40 s) e dão passagem (desaceleram). |
| Residências fora da área, 1–2 pavimentos, jardins, luz | Conforme | `residences()` + `houses()`. |
| Saem e voltam das casas sem aparecer no meio do caminho | Parcial | Rotas passam por "portões" na borda do parque e seguem até a casa. Ao abrir o app ou mudar a hora na mão, todos já aparecem no lugar (sem caminhar). |

## 14. Interações

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Bancos: sentar, levantar, altura certa | Conforme | `tests/parkCamera.test.ts` (olhos a 1,23 m sentado; andar levanta). |
| Mirantes: vista panorâmica | Conforme | Interagir no mirante vira para a vista e aproxima. |
| Árvores e água: observar | Conforme | Interagir perto de árvore ou da margem. |
| Borboletas nos jardins | Conforme | `butterflies()` de dia, sem chuva nem vento forte. |
| Canceláveis, sem bloquear, indicador discreto | Conforme | Andar cancela; dica "· E" no rodapé. |

## 15. Luz, clima e estações

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Amanhecer, manhã, tarde, pôr do sol, noite, com transição gradual | Conforme | `lightAt(hora)` contínuo; `tests/parkEnv.test.ts` (sem saltos a cada 5 min). |
| Luz artificial acendendo ao entardecer | Parcial | Acende de forma gradual (17h30–19h30), mas todas juntas, não poste a poste. |
| Iluminação interna por ambiente | Parcial | Cada interior tem sua luz; não muda com a hora do parque. |
| Sol, nublado, chuva, neblina, vento com intensidade | Conforme | `Sky` com 4 intensidades livres + 6 combinações prontas. |
| Folhas e árvores com vento | Conforme | Balanço das copas cresce com o vento. |
| Gramado e flores com vento | Ausente | Grama e flores não se mexem. |
| Piso molhado; água reage à chuva | Conforme | Terreno, caminhos e praça escurecem e brilham; gotas em anéis na água. |
| Neblina acompanha o relevo | Conforme | Camadas de névoa rente ao chão, seguindo `heightAt`. |
| Estações perceptíveis, tropical preservado | Conforme | Ipê amarelo no inverno, lilás na primavera, emergentes amarelando no outono; palmeiras sempre verdes. Folhas caindo no outono. |
| Opções: hora, clima, estação, automático e manual, combinações livres, restaurar padrões | Conforme | Painel Opções. A "pré-visualização" é o próprio parque mudando ao vivo atrás do painel. |

## 16. Áudio espacial

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Sons posicionais (pássaros, vento, água, pessoas, atividades) | Parcial | Lago, lagos ornamentais, fonte, pássaros em árvores próximas e a roda de violão do palco são posicionais (HRTF). Vento e chuva são ambiente. Conversa de pessoas não existe; passos do visitante sim. |
| Interiores abafam o som de fora | Conforme | Filtro passa-baixa a 650 Hz dentro dos prédios. |
| Volume por categoria e silenciar | Conforme | Natureza, Água, Clima, Música, Passos, volume geral e silenciar. |
| Som funcionando no aparelho | Não verificado | Não ouvido em iPad nem no computador nesta rodada (o som exige um toque e caixa de som). |

## 17. Qualidade e desempenho

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Materiais adequados com variação de rugosidade | Parcial | Rugosidade e metal por material; sem texturas de imagem, juntas ou imperfeições. |
| LOD progressivo sem "aparecer de repente" | Parcial | Arbustos, flores e placas somem pela distância; pessoas só as mais próximas. Prédios distantes não trocam de modelo, e a troca é direta (sem dissolver). |
| Detalhe ao se aproximar; interior completo ao entrar | Conforme | Interior criado ao entrar e descartado ao sair; transição com escurecimento curto, sem tela de carregamento. |
| Modos Econômico, Alto, Máximo, Automático | Conforme | Opções → Gráficos. Automático baixa um nível com menos de 38 qps por 4 s e sobe com folga por 12 s. |
| Desempenho no iPad e iPhone | Não verificado | Sem aparelho real nesta rodada. No navegador do computador: 124 desenhos por quadro no parque (praça, à noite) e 64–75 dentro da Biblioteca; quadros por segundo não medidos (painel oculto). |
| Memória: liberar o que não é usado | Parcial | Interior descartado ao sair (geometrias e materiais); som desligado libera os nós. Sem medição de memória. |

## 18. Acessibilidade

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Tamanho de texto | Conforme | Configurações (V2). |
| Contraste e escala da interface | Ausente | Não há ajuste próprio de contraste nem de escala além do tamanho do texto. |
| Redução de movimentos | Conforme | Configurações; o parque pula a abertura e as transições. |
| Sensibilidade, velocidade, controles, gráficos, áudio | Conforme | Painel de opções do parque. |

## 19. Preservação da V2

| Requisito | Classe | Evidência e observação |
|---|---|---|
| Funcionalidades dos módulos e dados existentes | Conforme | Os testes da V2 seguem passando no CI. Nenhum módulo foi alterado nesta rodada (só `focus/sound.ts` ganhou acesso ao contexto de áudio). |
| Login, contas, sincronização entre aparelhos | Ausente | A V2 não tem login nem sincronização (dados ficam no aparelho, IndexedDB). Nada mudou. |
| Sem cópias de dados entre módulos | Conforme | O parque só lê dos módulos (useLiveQuery) e abre os painéis deles. Moradores são simulados e não gravam nada. |
| Sem dados fictícios como se fossem reais | Conforme | Os moradores são fictícios e identificados como moradores simulados; números dos prédios vêm dos dados reais. |

## Pendências, em ordem

1. **Teste em iPad e iPhone reais:** fluidez, toque nos controles, som, número de pessoas na tela.
2. **Personagem:** rosto, cabelo e mãos (hoje figura simples).
3. **Exterior com os mesmos pavimentos do interior** e interior visível pela janela.
4. **Salas sem tela própria** (6): decidir se ganham tela nova ou saem da planta.
5. **Grama e flores com vento; luzes acendendo uma a uma; contraste e escala da interface.**
6. **LOD dos prédios distantes** com transição suave.
7. **Voltar ao 2D e retomar também o painel aberto.**

## Commits da V2.1

| Commit | Conteúdo |
|---|---|
| `f118655` | Campus: lago orgânico, relevo, 3 níveis de caminho, novas posições, convivência e residências |
| `77f800e` | Câmeras, avatar, controles e 64 moradores (falhou no CI; corrigido no seguinte) |
| `e12b1dc` | Correção do painel; água com chuva e vento (falhou no CI; corrigido no seguinte) |
| `68e60cd` | Ambiente: luz contínua, clima combinável, chão molhado, névoa, estações, som espacial, modos gráficos |
| `d60ff93` | Central de Módulos e volta ao parque no mesmo lugar; testes da câmera |
| `de2f827` | Interiores com andares |
