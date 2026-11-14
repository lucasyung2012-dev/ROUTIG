# ROUTIG District — Fase 1: fundação técnica e planejamento

**Atualizado: 2026-11-13.** Documento de planejamento. Nada do District foi implementado ainda.

Legenda: **APROVADO** (decidido pelo dono do produto) · **PROPOSTA** (recomendação técnica, aguarda OK) · **PENDENTE** (decisão em aberto).

---

## 1. Decisões aprovadas (13/11/2026)

| Tema | Decisão |
|---|---|
| O que é | Jogo independente de exploração em mundo aberto, com um mistério descoberto aos poucos. Não é produtividade nem extensão do Campus. Sem missões obrigatórias, sem punição por inatividade. **APROVADO** |
| Onde mora | Dentro do ROUTIG, baixado à parte: cartão na Home; o jogo só é baixado na primeira entrada; depois abre offline; não pesa no Control Room nem no Campus. **APROVADO** |
| Progresso | Banco próprio, separado dos dados de produtividade; sincroniza pelo Dropbox num arquivo separado, com interruptor próprio (ligado por padrão). Descobertas somam; mesa de investigação por item, vale a mais nova; posição e horário do jogo: último aparelho usado. **APROVADO** |
| Estilo visual | Realismo estilizado (semi-realista): arquitetura detalhada e coerente, iluminação e sombras realistas, ambientes ricos, personagens com identidade própria, liberdade artística. Identidade própria, diferente do Campus e coerente com o universo ROUTIG. **APROVADO** |
| Movimento | Começa a pé: andar, correr, pular, explorar. Depois bicicleta; skate mais tarde; veículos motorizados avaliados no futuro (não descartados). Prioridade: movimentação a pé responsiva e agradável. **APROVADO** |
| Personagem | Próprio do District, separado do avatar do Campus: identidade visual, rig e animações próprios; personalização futura se aprovada. **APROVADO** |
| Mistério e narrativa | **EM ABERTO.** Não definir enredo, tom nem solução antes do bloco de narrativa. Referências já discutidas (não são decisão): projetos secretos e passado, tecnologia e IA, pessoas e organizações, fenômenos inexplicáveis, pistas e documentos, hipóteses do jogador, investigação pelas cinco regiões. |
| Fases | 1 Fundação técnica e planejamento · 2 Protótipo jogável · 3 Região Central · 4 Mistério e investigação · 5 Expansão (Norte, Sul, Leste, Oeste), uma região por vez. **APROVADO** |

---

## 2. Arquitetura técnica — PROPOSTA

### 2.1 Encaixe no ROUTIG
- Rota própria (`#/district`) carregada sob demanda, num pacote separado do app. O Control Room e o Campus nunca carregam código do District.
- Motor 3D: **three.js**, a mesma versão do Campus (o pacote do three é compartilhado; não baixa duas vezes). Código do District em `src/features/district/`, sem importar peças do Campus (identidade própria), só utilitários genéricos.
- Banco próprio no aparelho (`routig-district`, IndexedDB), versionado desde a primeira versão, com migrações.
- Sincronização: reaproveita a chave, a criptografia e o Dropbox já em uso; arquivo `routig-district-<aparelho>.json` separado dos dados de produtividade.
- Arquivos do jogo (modelos, texturas, sons) guardados no aparelho na primeira entrada, com barra de progresso; Configurações mostra o espaço usado e "Liberar espaço" (mantém o progresso).

### 2.2 Personagem
- Modelo 3D com esqueleto (glTF), animações próprias: parado, andar, correr, pular (subida, queda, aterrissagem), virar, parar. Mistura suave entre animações conforme a velocidade.
- Controle por **cápsula** (não física completa): anda em rampas e degraus baixos, desliza em paredes, cai e aterrissa. Colisão contra o cenário com uma estrutura de busca rápida (BVH) — leve o bastante para o iPhone.
- Câmera em terceira pessoa que contorna obstáculos (não atravessa paredes), com sensibilidade ajustável.

### 2.3 Controles
- **Toque (iPhone/iPad):** joystick virtual à esquerda, arrastar à direita para a câmera, botões de pular e correr; tamanhos adequados ao polegar.
- **Teclado e mouse:** W/A/S/D, Shift correr, Espaço pular, mouse para a câmera (com trava do ponteiro).
- **Controle (gamepad):** suporte pelo navegador (Xbox/PlayStation/MFi), se aprovado (ver pendências).

### 2.4 Mundo e carregamento
- Mundo dividido em **células** (quadrados de ~200 m). Só as células em volta do jogador ficam carregadas; as distantes aparecem em versão simplificada e as muito distantes não existem na memória.
- Regiões = conjuntos de células. Cada região é baixada inteira na primeira vez que o jogador se aproxima dela (com aviso discreto), não no começo.
- Interiores carregados só ao entrar no prédio.
- Peças repetidas (janelas, postes, árvores, bancos, carros parados) desenhadas em lote (instâncias); materiais compartilhados.
- Modelos e texturas comprimidos (glTF + compressão de malha + texturas em formato de GPU), preparados no CI a partir dos arquivos-fonte.

### 2.5 Visual (realismo estilizado com desempenho)
- Materiais PBR, céu e reflexos por mapa de ambiente, uma luz de sol com sombras só perto do jogador, oclusão e luz "pintadas" nas texturas onde possível (barato em tempo real).
- Níveis de qualidade automáticos (baixa / média / alta) pelo aparelho e pela taxa de quadros medida, como no Campus; o jogador pode fixar o nível.
- Pessoas (NPCs) com densidade adaptativa e animação simplificada à distância.

### 2.6 Tempo e salvamento
- Relógio do jogo pausa quando o jogador sai ou fica offline (decisão do Prompt Master); duração do dia do jogo **PENDENTE**.
- Salvamento automático em momentos-chave (descoberta, entrar/sair de prédio) e a cada minuto; carregamento volta exatamente onde parou.

### 2.7 Metas de desempenho (a confirmar com medição real; não são promessas)
| Item | iPhone/iPad | Computador |
|---|---|---|
| Quadros por segundo | 30 estáveis | 60 |
| Chamadas de desenho na tela | até ~250 | até ~600 |
| Memória de texturas | até ~250 MB | até ~600 MB |
| Download inicial (área de teste) | até ~25 MB | igual |

---

## 3. Fase 2 — protótipo jogável (o que será entregue) — PROPOSTA

- Área de teste de ~300 × 300 m: duas ruas que se cruzam, calçadas, uma praça, escadas e rampas, um prédio com interior simples, obstáculos para pular, objetos com colisão.
- Personagem do District com as animações da seção 2.2, câmera e controles da seção 2.3.
- Painel de diagnóstico (`?debug`): quadros por segundo, chamadas de desenho, memória.
- Salvar e continuar de onde parou (banco próprio), ainda sem sincronização.
- **Critérios de aceite:** andar, correr e pular sem atravessar paredes nem prender em quinas; câmera não entra em paredes; controles confortáveis no toque; 30 quadros estáveis no iPhone do Lucas e 60 no computador; entrar e sair do prédio sem travar.
- **Teste obrigatório:** iPhone e iPad reais do Lucas, além do computador.

---

## 4. Pendências para decidir antes da Fase 2

1. **De onde vem o personagem (modelo e animações)?** Opções: (a) base gratuita de uso livre (licença CC0) adaptada à identidade do District; (b) encomendar a um artista 3D; (c) criar por código, como o avatar do Campus (mais limitado em realismo). Recomendação: (a) para o protótipo, com (b) como caminho para a versão final.
2. **Origem dos prédios e objetos:** criados por código (como o Campus) ou modelos glTF (gratuitos CC0 ou encomendados)? Recomendação: modelos glTF para o realismo estilizado, com uma biblioteca de peças reaproveitáveis.
3. **Controle (gamepad):** entra no protótipo?
4. **Duração de um dia no jogo** (ex.: 24, 48 ou 96 minutos reais).
5. **Ordem com o V3:** o protótipo do District começa depois da Home/Control Room/Campus (ordem atual) ou em paralelo?
