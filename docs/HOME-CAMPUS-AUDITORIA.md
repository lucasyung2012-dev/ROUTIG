# Home e Campus — auditoria contra o prompt de implementação (15/11/2026)

Comparação do repositório com o "Prompt de implementação do Home e Campus". Legenda: **OK** (já existe e atende) · **PARCIAL** · **FALTA** · **CONFLITO** (existe algo que o prompt manda mudar).

## Home e navegação

| Item | Situação hoje | Estado |
|---|---|---|
| Página inicial do ecossistema | `/` abre direto o parque 3D (App.tsx). Não existe Home. | FALTA |
| Barra lateral Início / Control Room / Campus / District + Perfil, Configurações, Ajuda | A barra lateral do 2D lista os módulos, com Perfil e Configurações no rodapé. | FALTA |
| Logo leva ao Home | O logo leva ao parque. | CONFLITO |
| Perfil, Conta, Configurações no Home | Estão dentro do 2D (`/profile`, `/settings`), no mesmo quadro dos módulos. | PARCIAL |
| Ajuda | É uma seção de Configurações (atalhos) e dicas por módulo (`ModuleTip`); não há página de Ajuda. | PARCIAL |
| Seletor Control Room ↔ Campus | Não existe; só links soltos (botão "Voltar ao parque", abrir 2D no prédio). | FALTA |
| Uma camada só de dados e serviços | `AppProviders` é montado duas vezes (parque e 2D): Focus, avisos e sincronização reiniciam a cada troca. | CONFLITO |
| Dashboard fora do Home e do Campus | Dashboard é módulo do menu, prédio no parque e painel embutido. | CONFLITO |

## Campus

| Item | Situação hoje | Estado |
|---|---|---|
| 15 prédios em 5 categorias | 18 prédios; as 5 áreas temáticas já existem (14/11). Dashboard, Profile e Settings ainda têm prédio. | PARCIAL |
| Focus numa ilha do lago com ponte | Focus está nas Atividades, em terra; não há ilha nem ponte. | FALTA |
| Pavimentos de cada prédio como no prompt | Todos os prédios têm interior e andares (2 a 4), mas a lista de salas não segue o prompt. | PARCIAL |
| Interações nativas em 3D (sem páginas 2D) | Os painéis dos prédios embutem as páginas do 2D (exceto Inbox e algumas salas). | CONFLITO |
| Piano, bateria e violão | Piano e bateria tocáveis; violão não existe. | PARCIAL |
| Cofre das Finanças com o PIN | Não existe. | FALTA |
| Escadas sem teletransporte | Escada em caracol com animação de subida (tecla E, um andar por vez). | PARCIAL |
| Elevador dentro do prédio, com hall e painel | Torre de vidro nos fundos com lounge do lado de fora; painel de andares funciona. | CONFLITO |
| Entrar e sair sem tela preta | Entrar exige E perto da porta; anda até a porta e faz transição para o interior. | PARCIAL |
| Totens, nome na fachada, placas internas | Placa na fachada e nomes flutuantes; sem totem nem placas internas. | PARCIAL |
| Guarda-corpos que barram | Parcial (mezaninos e escadas); terraços não existem. | PARCIAL |
| Minimapa: arrastar, recentralizar, recolher, categorias | Zoom 1/2/3,4, mapa grande, categorias com cor (14/11); não arrasta, não recentraliza, só some pelas opções. | PARCIAL |
| Praça, fonte, lago, quiosques, carrinhos, gente, bicicletas, cachorros | Existem e estão preservados. | OK |
| Relevo, caminhos, paisagismo por categoria | Feitos em 14/11 (varredura: nenhuma planta em caminho ou prédio). | OK |

## Ordem de execução adotada

1. Home: página inicial, navegação, Perfil/Configurações/Ajuda fora do Control Room, logo → Home.
2. Uma camada só de providers e o seletor Control Room ↔ Campus mantendo o contexto.
3. Campus: tirar os prédios de Dashboard, Profile e Settings; Focus na ilha com ponte.
4. Prédios: pavimentos e salas do prompt, elevadores dentro, escadas, guarda-corpos, sinalização.
5. Interações nativas por módulo (substituindo as páginas 2D embutidas), violão, cofre com PIN.
6. Minimapa: arrastar, recentralizar, recolher, níveis de detalhe.
