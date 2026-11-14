# ROUTIG District — planejamento das cinco fases

**Atualizado: 2026-11-13 (v2).** Documento de planejamento para revisão. **Nada do District foi implementado.**
O ROUTIG V3 continua sendo a prioridade de execução; o District avança só em planejamento até haver capacidade para o protótipo.

Legenda: **APROVADO** (decidido pelo dono do produto) · **RECOMENDAÇÃO** (direção indicada pelo dono do produto, aguarda aprovação definitiva) · **PROPOSTA** (sugestão técnica do desenvolvedor, aguarda revisão) · **PENDENTE** (em aberto, precisa de estudo/teste).

---

## 1. Decisões e direções

| Tema | Situação |
|---|---|
| O que é | Jogo independente de exploração em mundo aberto, com um mistério descoberto aos poucos. Não é produtividade nem extensão do Campus. Sem missões obrigatórias, sem punição por inatividade. **APROVADO** |
| Onde mora | Dentro do ROUTIG, carregado sob demanda: cartão na Home; o jogo só é baixado na primeira entrada; depois abre offline; não pesa no Control Room nem no Campus. **APROVADO** |
| Progresso | Banco próprio, separado da produtividade; sincroniza pelo Dropbox em área própria, com interruptor próprio (ligado por padrão). Descobertas somam; mesa de investigação por item (vale a mais nova); posição e horário do jogo: último aparelho usado. **APROVADO** |
| Estilo visual | Realismo estilizado (semi-realista), identidade própria, coerente com o universo ROUTIG, qualidade de jogo moderno sem prejudicar o desempenho. **APROVADO** |
| Movimento | A pé primeiro (andar, correr, pular, explorar); depois bicicleta; skate mais tarde; motorizados avaliados no futuro. **APROVADO** |
| Personagem | Próprio do District, separado do avatar do Campus (identidade, rig e animações próprios). **APROVADO** |
| Origem do personagem | Modelo 3D gratuito com licença que permita uso e modificação, adaptado ao District (aparência, roupas, proporções, rig, animações próprias). Escolha só depois da avaliação da seção 3. **RECOMENDAÇÃO** |
| Prédios e objetos | Abordagem híbrida: modelos 3D prontos ou adaptados como base visual (prédios, vegetação, mobiliário urbano, objetos, elementos arquitetônicos); código para interação, comportamento, iluminação, sistemas dinâmicos, organização e geração procedural quando útil; prédios importantes com modelo próprio. **RECOMENDAÇÃO** |
| Controles | Sistema de entrada flexível desde a arquitetura. Protótipo valida toque e teclado/mouse; controle físico planejado desde já e testado em etapa própria. **PENDENTE** (replanejamento — seção 4) |
| Duração do dia | Comparar 24, 48, 60 e 96 minutos reais; 60 min é referência anterior, não decisão. Tempo pausa fora do jogo/offline. **PENDENTE** (decidir por teste — seção 5) |
| Mistério e narrativa | **EM ABERTO.** Não definir enredo, tom nem solução antes do bloco de narrativa (Fase 4). Referências já discutidas, não decididas: projetos secretos e passado, tecnologia e IA, pessoas e organizações, fenômenos inexplicáveis, pistas e documentos, hipóteses do jogador, investigação pelas cinco regiões. |
| Ordem com o V3 | V3 é a prioridade: Home → revisar Control Room → revisar Campus → integrar Control Room e Campus → auditoria. District: planejamento em paralelo; o protótipo começa quando houver capacidade, sem atrasar o V3. **APROVADO** (momento exato do protótipo **PENDENTE**) |

---

## 2. As cinco fases (para revisão)

### Fase 1 — Fundação técnica e planejamento geral (em paralelo ao V3; só documentos e estudos)
Entregas:
1. Arquitetura técnica (seção 6) revisada e aprovada.
2. Avaliação de modelos de personagem (seção 3) com 2–3 candidatos comparados e um escolhido.
3. Avaliação de bibliotecas de modelos para cenário (licença, desempenho, estilo) com amostras.
4. Plano do sistema de entrada (seção 4).
5. Plano do mapa: tamanho total, divisão em células, fronteiras das cinco regiões, o que existe na Região Central (ruas principais, marcos, bairros) — sem narrativa.
6. Metas de desempenho (seção 7) e como medir.
**Critério de pronto:** os itens acima aprovados pelo dono do produto.

### Fase 2 — Protótipo jogável
- Área de teste de ~300 × 300 m: duas ruas que se cruzam, calçadas, praça, escadas, rampas, obstáculos para pular, um prédio com interior simples.
- Personagem escolhido, com animações: parado, andar, correr, pular (subida, queda, aterrissagem), virar, parar.
- Câmera em terceira pessoa que não atravessa paredes; controles por toque e teclado/mouse.
- Ciclo de dia ajustável no painel de teste, para comparar as durações (seção 5).
- Salvar e continuar de onde parou (banco próprio), ainda sem sincronização.
- Painel de diagnóstico (`?debug`): quadros por segundo, chamadas de desenho, memória, tempo de carregamento.
**Critérios de aceite:** andar, correr e pular sem atravessar paredes nem prender em quinas; câmera nunca dentro de parede; toque confortável no iPhone e no iPad; metas da seção 7 atingidas medindo no iPhone e no iPad reais e no computador; entrar e sair do prédio sem travar.

### Fase 3 — Região Central
- Bairros, ruas, edifícios e ambientes da Central; NPCs com rotinas; dia e noite; interiores que funcionam de verdade (sem falsa interatividade).
- Dispositivo pessoal do jogador: mapa, lugares descobertos, configurações, salvamento.
- Sincronização do progresso pelo Dropbox (área própria).
- Base visual e técnica (biblioteca de peças, materiais, iluminação, carregamento por células) que as outras regiões vão reaproveitar.
- Bicicleta entra aqui ou logo depois, se a movimentação a pé estiver aprovada.

### Fase 4 — Mistério e investigação
- Bloco de narrativa (pelo Método de Blocos, com o ChatGPT) **antes** de implementar.
- Sistemas: registro automático de descobertas (local e horário), fotos, documentos, inspeção de objetos, mesa de investigação com ligações manuais e hipóteses livres (ligações podem ser verdadeiras, parciais, irrelevantes ou só confirmadas depois).

### Fase 5 — Expansão progressiva
- Norte, Sul, Leste e Oeste, uma região por vez, cada uma com sua parte da história e da identidade da cidade.
- Cada região é baixada só quando o jogador se aproxima dela pela primeira vez.

---

## 3. Avaliação do personagem (Fase 1) — PROPOSTA

**Critérios** (todos verificados antes de escolher):
1. **Licença:** permite uso, modificação e redistribuição dentro de um app web. Atenção: o repositório do ROUTIG é **público**; o arquivo do modelo fica visível nele. Licenças que proíbem redistribuir o arquivo "cru" (comum em bibliotecas gratuitas de lojas e serviços de animação) não servem, a menos que o arquivo fique fora do repositório. Preferir CC0 ou CC-BY.
2. **Qualidade e estilo:** combina com o realismo estilizado; proporções ajustáveis.
3. **Topologia e polígonos:** até ~15–25 mil triângulos para o personagem principal (meta a confirmar no teste).
4. **Rig:** esqueleto humano padrão (compatível com retargeting de animações), mãos com dedos.
5. **Animações:** existentes com a mesma licença ou fáceis de produzir; dá para criar as próprias.
6. **Personalização:** roupas e cabelo separados (trocáveis), materiais editáveis.
7. **Formato:** glTF/GLB (ou convertível sem perda).

**Fontes a avaliar:** bibliotecas de personagens e animações com licença CC0 (ex.: Quaternius), personagens gerados por ferramentas de criação humana com exportação livre (ex.: MakeHuman, saída CC0) e modelos CC-BY de repositórios abertos. Resultado: tabela comparando 2–3 candidatos pelos critérios acima, com imagens, para aprovação.

---

## 4. Sistema de entrada — PROPOSTA (aguarda replanejamento)

- **Camada de ações:** o jogo nunca lê teclas ou toques diretamente; lê ações (mover, olhar, correr, pular, interagir, abrir mapa, pausar). Cada método de controle preenche as mesmas ações. Trocar de método no meio do jogo funciona sem configurar nada; a interface mostra os ícones do método em uso.
- **Toque (iPhone/iPad):** joystick virtual à esquerda, arrastar à direita para a câmera, botões de pular, correr e interagir; tamanhos para o polegar; some quando um controle físico é usado.
- **Teclado e mouse:** W/A/S/D, Shift correr, Espaço pular, E interagir, mouse com trava do ponteiro.
- **Controle físico:** pela API de gamepad do navegador (Safari no iPad/iPhone e Chrome/Edge no computador reconhecem controles Xbox, PlayStation e MFi pareados por Bluetooth). A estudar: mapeamento por modelo, zona morta e sensibilidade, vibração (suporte desigual entre navegadores), reconexão.
- **Validação:** protótipo testa toque e teclado/mouse; controle físico em etapa própria (Fase 2 estendida ou Fase 3), com o controle que o Lucas usar.

---

## 5. Duração do dia no jogo — comparação (decidir por teste)

| Dia de 24 h no jogo dura | 1 hora do jogo | Noite (20h–6h) | Loja aberta 9h–18h | Numa sessão de 30 min o jogador vê |
|---|---|---|---|---|
| 24 min reais | 1 min | 10 min | 9 min | mais de um dia inteiro |
| 48 min reais | 2 min | 20 min | 18 min | pouco mais de meio dia |
| 60 min reais | 2,5 min | 25 min | 22,5 min | meio dia |
| 96 min reais | 4 min | 40 min | 36 min | um terço do dia (ex.: só a tarde) |

Leitura: dias curtos mostram mais variação de luz e rotinas, mas deixam pouco tempo para lojas e eventos; dias longos dão calma para explorar um período, mas o jogador pode quase nunca ver a noite numa sessão curta.
**PROPOSTA de teste:** na Fase 2, um seletor no painel de teste para jogar com cada duração; decidir depois de testar. Independente da duração: o relógio pausa fora do jogo/offline; deve haver como esperar ou dormir para mudar de período, se aprovado.

---

## 6. Arquitetura técnica — PROPOSTA

- **Encaixe:** rota própria (`#/district`) num pacote separado; Control Room e Campus nunca carregam código do District. Código em `src/features/district/`, sem reaproveitar peças visuais do Campus (identidade própria), só utilitários genéricos.
- **Motor 3D:** three.js, a mesma versão do Campus (pacote compartilhado, não baixa duas vezes).
- **Dados:** banco próprio no aparelho (`routig-district`), versionado com migrações desde a primeira versão. Sincronização com a mesma chave e criptografia já usadas, em área própria no Dropbox (arquivos `routig-district-…`), separada da produtividade.
- **Arquivos do jogo:** baixados na primeira entrada (barra de progresso) e guardados para uso offline; Configurações mostra o espaço usado e "Liberar espaço" (mantém o progresso).
- **Personagem e colisão:** cápsula de personagem (não física completa) com colisão rápida contra o cenário (estrutura BVH) — anda em rampas e degraus baixos, desliza em paredes, cai e aterrissa. Animações misturadas pela velocidade.
- **Mundo:** células de ~200 m; só as próximas carregadas em detalhe, as distantes simplificadas; região baixada ao se aproximar; interiores ao entrar; peças repetidas desenhadas em lote; materiais compartilhados.
- **Modelos e texturas:** glTF com compressão de malha e texturas em formato de GPU, preparados no CI a partir dos arquivos-fonte (nada instalado no computador de desenvolvimento).
- **Visual:** materiais PBR, céu e reflexos por mapa de ambiente, uma luz de sol com sombras só perto do jogador, luz e oclusão "pintadas" nas texturas onde possível; níveis de qualidade automáticos pelo aparelho e pela taxa de quadros medida, com opção de fixar.
- **Tempo e salvamento:** relógio do jogo pausa fora do jogo; salvamento automático em momentos-chave e a cada minuto.

## 7. Metas de desempenho (a confirmar medindo; não são promessas)

| Item | iPhone/iPad | Computador |
|---|---|---|
| Quadros por segundo | 30 estáveis | 60 |
| Chamadas de desenho na tela | até ~250 | até ~600 |
| Memória de texturas | até ~250 MB | até ~600 MB |
| Download da área de teste (Fase 2) | até ~25 MB | igual |

---

## 8. Pendências

1. Escolha do modelo de personagem (após a avaliação da seção 3).
2. Aprovação definitiva da abordagem híbrida para cenário e escolha das bibliotecas.
3. Replanejamento e aprovação do sistema de entrada e do suporte a controle físico.
4. Duração do dia (após teste na Fase 2).
5. Momento de início do protótipo (Fase 2), coordenado com o V3.
6. Revisão e aprovação deste planejamento das cinco fases.
