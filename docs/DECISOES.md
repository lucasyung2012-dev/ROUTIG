# Decisões aprovadas

Registro das decisões tomadas com o dono do produto. Não mudar sem nova aprovação (Parte 34, regra 18).

| Data | Decisão |
|---|---|
| 2026-11-02 | **Ambiente:** o código é escrito no Claude Code. Build, testes e publicação rodam no GitHub Actions + GitHub Pages (grátis). O Lovable pode publicar depois, a partir do mesmo repositório. |
| 2026-11-02 | **Repositório público** (exigência do GitHub Pages no plano gratuito). Nenhum dado pessoal entra no código: os dados ficam só no aparelho. |
| 2026-11-02 | **Idioma:** português (pt-BR) principal, inglês secundário, estrutura pronta para outros idiomas. |
| 2026-11-02 | **Logo:** o PNG enviado é a referência oficial (`public/brand/routig-logo-original.png`). O gradiente da imagem (violeta → roxo → rosa, sem ciano) prevalece sobre a descrição da Parte 3.2. A versão vetorial só substitui o PNG depois de aprovada na tela de comparação (Settings → Sobre → Logo). |
| 2026-11-02 | **Recuperação:** nota final = maior(nota original, mínimo(nota da recuperação; 6,0)). Configurável por ano letivo e disciplina, com histórico do cálculo. |
| 2026-11-02 | **Bônus:** valor de 0 a 0,5 informado pelo usuário, só quando a média é maior que 6,0. Nota final = mínimo(10,0; nota + bônus). Configurável. |
| 2026-11-02 | **Notificações:** lembretes locais com o app aberto. Web Push (app fechado) só no futuro, com autorização, porque exige servidor. |
| 2026-11-02 | **Backup:** automático dentro do app + exportação manual para Arquivos (o Safari não permite gravar sozinho numa pasta). |
| 2026-11-02 | **Finanças:** criptografia com chave derivada de PIN; valores ocultos no Dashboard e na busca por padrão. |
| 2026-11-02 | **Logo vetorial aprovado** pelo dono do produto, depois da comparação com o PNG (97,9% de sobreposição). Vale em todos os aparelhos (`VECTOR_APPROVED_AT` em `src/brand/mark.ts`). O ícone do PWA continua sendo o PNG original. |
| 2026-11-03 | **Sincronização entre aparelhos (futuro, depois da Etapa 6):** pelo Google Drive da conta do usuário, mantendo o app local-first. Permissão limitada aos arquivos do próprio app; dados financeiros criptografados antes de sair do aparelho; resolução de conflitos por `rev`/`updatedAt` e histórico. Até lá, cada aparelho tem seus dados e o backup (Etapa 5) leva os dados manualmente. |
| 2026-11-03 | **Backup adiantado:** o backup completo (exportar, importar com prévia, verificação de integridade, histórico e aviso de backup desatualizado), que era da Etapa 5, entra logo depois da Etapa 1. Motivo: proteger os dados assim que o app começar a ser usado de verdade e permitir levar os dados entre aparelhos manualmente. A sincronização automática pelo Google Drive continua para depois da Etapa 6. |
| 2026-11-03 | **Desenho do Notes completo (aprovado):** marca-texto, formas (linha, seta, retângulo, círculo), fundo pautado/quadriculado/pontilhado, zoom e mover a folha, desenhar sobre imagem, laço para selecionar e mover, refazer, mais cores e cor personalizada, tela cheia no iPad, salvar como imagem. |
| 2026-11-02 | **Sem Node local:** o computador de desenvolvimento não tem Node.js. Toda verificação de tipos, testes e build acontece no GitHub Actions. |
| 2026-11-05 | **Criptografia avaliada e não incluída na Versão 1 (Parte 26.3):** o ROUTIG não criptografa o banco. Motivos: sem servidor, a chave teria de vir de um PIN de 4 a 8 números (fácil de adivinhar fora do app); esquecer o PIN perderia tudo; a busca e os índices do banco precisam do texto aberto. A proteção forte é o código do aparelho (o iPadOS/iOS guarda os dados criptografados). O PIN do app e o de Finanças são travas de tela, guardados só como hash com sal, e a tela de Segurança diz isso com todas as letras. Face ID e Touch ID ficam de fora pelo mesmo motivo. |
