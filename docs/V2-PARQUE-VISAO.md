# ROUTIG V2 — O parque: o que o prompt pede × o protótipo

**Data:** 05/11/2026 · Releitura das seções 3, 4, 5 e 11–13 da Especificação Mestre V2.

## 1. O nível de detalhe que o prompt pede

O prompt não pede "prédios num gramado". Pede um **ambiente arquitetônico planejado**, bonito o suficiente para ser a tela principal:

| Camada | O que o prompt diz (resumo fiel) |
|---|---|
| Composição | Parque amplo, conectado, explorável; 5 regiões; praça central com **fonte com a identidade ROUTIG**; lago entre Oeste e Sul; caminhos que ligam tudo com lógica; nenhum prédio isolado ou arbitrário |
| Estilo | Natureza + arquitetura futurista + tecnologia; elegante, futurista e acolhedor; 3D isométrico/2.5D com perspectiva arquitetônica |
| Prédios | Tridimensionais, **materiais distintos**, sombras, iluminação, **reconhecíveis antes de abrir**, cada um com identidade própria |
| Paisagem | Vegetação, água, praças, caminhos, profundidade, **elementos tecnológicos**, animações ambientais |
| Ambiente vivo | Dia e noite, **clima, estações, eventos especiais**, iluminação, água e vegetação animadas, **sons ambientes** — tudo local |
| Câmera | Navegação **cinematográfica**: deslocar, zoom, girar, inclinar, transições entre regiões, atalhos, busca de prédios, voltar à praça; câmera livre; **personagem opcional** |
| Minimapa | **Maquete 3D** com regiões, prédios, caminhos, lago, praças, posição e orientação da câmera, 3 níveis de zoom, "Ir até lá" |
| Interiores | Cada módulo com **ambiente interno 3D funcional** + painéis, listas, gráficos e formulários; "não basta uma página sobre um fundo 3D" |
| Personalização | Ligar/desligar efeitos, sons, animações, decoração, minimapa, nomes dos prédios, qualidade gráfica |
| Desempenho | Qualidade adaptativa ao aparelho; o parque não pode deixar os módulos lentos |

### Identidade de cada prédio (o que o prompt descreve)

| Prédio | Descrição no prompt |
|---|---|
| Inbox | **Central de Recepção**, na região central perto da fonte; comunicação e distribuição; vidro, metal, luzes, vegetação; azul, ciano, turquesa e prata; setores: Átrio, Triagem, Distribuição, Arquivo, Galeria |
| Academy | Centro educacional futurista; **salas criadas para cada disciplina** |
| Idiomas | **Jardim cultural** com espaços para cada idioma |
| Insights | **Observatório** de dados, com setores |
| Tasks | **Estúdio** de produtividade |
| Projects | **Estúdio criativo**; ambiente visual personalizado por projeto |
| Music | **Pavilhão artístico futurista com anfiteatro**; 5 espaços |
| Sports | **Complexo esportivo** tecnológico, energético e aberto, diferente de Music |
| Focus | **Jardim** de concentração |
| Habits | **Estufa botânica** |
| Goals | **Jardim das Conquistas**, 5 espaços |
| Settings | Edifício **tecnológico e natural** com setores |
| Dashboard, Profile, Notes, Library, Calendar, Finance | Identidade própria (o prompt não detalha a forma) |

## 2. O protótipo atual × o pedido

| Item | Protótipo (Etapa 0) | Pedido |
|---|---|---|
| Prédios | Formas simples (caixas, cilindros), 1–2 cores | Arquitetura com fachadas, janelas, entradas, materiais distintos, letreiros, detalhes |
| Chão | Gramado liso, caminhos retos | Relevo suave, pisos, bordas, caminhos orgânicos, pontes, píer |
| Vegetação | 1 tipo de árvore (cone) | Várias espécies, arbustos, flores, canteiros, gramíneas, vento |
| Água | Disco azul, jatos simples | Água animada com reflexo e ondulação, fonte escultural ROUTIG |
| Luz | Sol fixo, dia/noite simples | Sol pela hora, céu com degradê, postes e janelas acendendo, brilho noturno |
| Vida | Fonte animada | Nuvens, pássaros, folhas, chuva, neve, estações, eventos especiais, sons |
| Câmera | Livre + "ir até" | Cinematográfica, transições entre regiões, abertura panorâmica, personagem opcional |
| Minimapa, clima, estações, sons, interiores | Não tem | Tem |

**Conclusão:** o protótipo cumpriu o papel (provou desempenho e gestos), mas é **básico de propósito**. O parque final precisa de um salto grande de detalhe.

## 3. Como chegar lá sem pesar no iPad

1. **Peças detalhadas geradas em código, mescladas:** cada prédio vira poucas malhas (vidro, estrutura, luzes) em vez de dezenas de peças → muito detalhe com poucos desenhos por quadro.
2. **Materiais procedurais em shader** (piso, grama, água, vidro com reflexo do céu): textura sem arquivos de imagem.
3. **Instâncias** para tudo o que se repete (árvores, arbustos, flores, postes, bancos, janelas).
4. **Níveis de detalhe por distância:** longe = silhueta simples; perto = fachada completa.
5. **Interiores e detalhes carregados só quando necessários.**
6. **Efeitos caros só na qualidade alta** (sombras suaves, brilho noturno); na baixa, versões baratas.
7. **Orçamento medido sempre**: meta de 60 quadros/s no iPad na qualidade alta e no iPhone na média; até ~150 desenhos por quadro.

**Limite honesto:** arquitetura gerada em código chega a um estilo **estilizado de alta qualidade** (pense em jogos como *Townscaper* ou *Monument Valley*), não fotorrealista. Se em algum ponto você quiser mais (esculturas, personagem), dá para usar alguns modelos 3D gratuitos de licença livre, comprimidos — decidimos isso vendo o resultado.

## 4. Próximo passo: uma "fatia vertical" no nível final

Em vez de melhorar tudo um pouco, faço **um pedaço no nível de detalhe final** e medimos:

- **Praça central + fonte ROUTIG + Central de Recepção (Inbox) por fora e por dentro**, com vegetação, água, luz de dia e de noite e câmera cinematográfica entrando no prédio.

Isso responde de verdade às duas perguntas: *fica bonito do jeito que você imagina?* e *roda leve no iPad?* Se sim, o mesmo método é aplicado aos outros 17 prédios na Etapa 4.
